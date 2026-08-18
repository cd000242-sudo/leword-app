/**
 * 네이버 통합검색 쇼핑 블록 폴백 — 쇼핑 검색 API 종료(2026-07-31) 대응
 *
 * 배경: openapi.naver.com/v1/search/shop.json 은 API HUB 개편에서 완전 종료됐고
 * 공식 대체 API 가 없다(404 실측 확인). search.shopping.naver.com 은 로그인 장벽,
 * 직통 HTTP 는 418 봇 차단 — 유일하게 열려 있는 소스가 모바일 통합검색의
 * 쇼핑 블록이다(로그인 불필요, 상품명/가격/nv_mid/이미지 제공).
 *
 * 구조: 브라우저 수집(browserPool 실크로뮴)과 텍스트 파싱(순수 함수)을 분리해
 * 파싱만 단위테스트로 못 박는다. 카드의 CSS 클래스는 배포마다 회전하는 난독화
 * 해시라서 셀렉터로 쓰지 않는다 — 쇼핑 브리지 앵커(nv_mid)와 텍스트 패턴만 쓴다.
 */

import type { ShoppingItem, ShoppingSearchResult, ShoppingSort } from './naver-shopping-api';

const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

/** 브라우저 안에서 긁어온 카드 원료 — 파싱 전 단계 */
export interface RawUnifiedCard {
  href: string;    // cr3.shopping.naver.com 브리지 URL (nv_mid 포함)
  text: string;    // 카드 innerText (가격/할인/배송/리뷰가 섞인 덩어리)
  imgAlt: string;  // 상품 이미지 alt — 가장 깨끗한 상품명
  imgSrc: string;
}

/**
 * 카드 텍스트에서 상품 가격 후보를 뽑는다.
 * 배송비·적립·포인트("포인트 최대 388원", "최대 4,185원 적립")는 가격이 아니고,
 * 같은 카드 안에서 최대가의 1/20 미만인 숫자도 가격일 수 없다(67% 할인도 3배 이내).
 */
export function parsePriceCandidates(text: string): number[] {
  const cleaned = (text || '')
    .replace(/배송비\s*[\d,]+\s*원/g, ' ')
    .replace(/포인트[^원]{0,20}원/g, ' ')
    .replace(/최대\s*[\d,]+\s*원(\s*적립)?/g, ' ')
    .replace(/적립\s*[\d,]+\s*원/g, ' ')
    .replace(/[\d,]+\s*원\s*적립/g, ' ');
  const matches = cleaned.match(/(\d{1,3}(?:,\d{3})+|\d{3,})\s*원/g) || [];
  const prices = matches
    .map((m) => Number(m.replace(/[^\d]/g, '')))
    .filter((n) => Number.isFinite(n) && n >= 100);
  if (prices.length === 0) return prices;
  const maxPrice = Math.max(...prices);
  return prices.filter((n) => n >= maxPrice / 20);
}

export function parseNvMid(href: string): string {
  const m = (href || '').match(/[?&]nv_mid=(\d+)/);
  return m ? m[1] : '';
}

/** "1.7만" 같은 축약 수를 정수로 */
function parseCompactCount(s: string): number {
  const isMan = /만\s*$/.test(s);
  const n = Number(s.replace(/[만,\s]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return Math.round(isMan ? n * 10000 : n);
}

function parseReviewCount(text: string): number | undefined {
  // 통합검색 실형식: "4.83 (4,426) 구매 3,422" — 괄호 안이 리뷰 수
  const paren = (text || '').match(/[0-5]\.\d{1,2}\s*\(([\d,.]+만?)\)/);
  if (paren) {
    const n = parseCompactCount(paren[1]);
    if (n > 0) return n;
  }
  const m = (text || '').match(/(?:리뷰|구매)\s*([\d,]+)/);
  if (!m) return undefined;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseRating(text: string): number | undefined {
  // 실형식 "4.83 (4,426)" — 괄호가 따라붙는 소수만 평점으로 인정해
  // 상품명 속 모델 숫자("7.60")와 헷갈리지 않는다. 라벨형(평점 4.8)도 허용.
  const m = (text || '').match(/([0-5]\.\d{1,2})\s*\(/) || (text || '').match(/(?:평점|별점)\s*([0-5]\.\d{1,2})/);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 && n <= 5 ? n : undefined;
}

/** alt 에는 검색어 강조 <mark> 마크업이 실제로 섞여 들어온다(실측) */
function stripMarkup(s: string): string {
  return (s || '').replace(/<[^>]*>/g, '');
}

/** 카드 원료 1개 → ShoppingItem. 상품으로 볼 수 없으면 null */
export function parseUnifiedCard(raw: RawUnifiedCard): ShoppingItem | null {
  const productId = parseNvMid(raw.href);
  const title = stripMarkup(raw.imgAlt).replace(/\s+/g, ' ').trim();
  if (!productId || !title || title.length < 4) return null;

  const prices = parsePriceCandidates(raw.text);
  if (prices.length === 0) return null;
  // "할인 전 판매가 → 할인가 → 쿠폰할인가" 순으로 낮아진다 — 최솟값이 실구매가
  const lprice = Math.min(...prices);
  const hprice = prices.length > 1 ? Math.max(...prices) : 0;

  return {
    title,
    link: raw.href,
    image: raw.imgSrc || '',
    lprice,
    hprice: hprice > lprice ? hprice : 0,
    mallName: '', // 통합검색 카드는 가격비교형 — 몰명이 없다
    productId,
    productType: 1,
    reviewCount: parseReviewCount(raw.text),
    rating: parseRating(raw.text),
  };
}

/** 원료 목록 → 정렬·중복제거된 결과. sim/date 는 노출순 유지, asc/dsc 만 가격 정렬 */
export function buildUnifiedResult(
  rawCards: RawUnifiedCard[],
  options: { display: number; start: number; sort: ShoppingSort }
): ShoppingSearchResult {
  const seen = new Set<string>();
  const items: ShoppingItem[] = [];
  for (const raw of rawCards) {
    const item = parseUnifiedCard(raw);
    if (!item || seen.has(item.productId)) continue;
    seen.add(item.productId);
    items.push(item);
  }

  const sorted =
    options.sort === 'asc'
      ? [...items].sort((a, b) => a.lprice - b.lprice)
      : options.sort === 'dsc'
        ? [...items].sort((a, b) => b.lprice - a.lprice)
        : items;

  const startIdx = Math.max(options.start - 1, 0);
  const page = sorted.slice(startIdx, startIdx + options.display);
  return { total: sorted.length, start: options.start, display: page.length, items: page };
}

/** 페이지 안에서 실행되는 수집기 — 클래스 셀렉터 없이 브리지 앵커 기준으로 카드를 찾는다 */
function collectCardsInPage(): RawUnifiedCard[] {
  const anchors = Array.from(
    document.querySelectorAll<HTMLAnchorElement>(
      'a[href*="cr.shopping.naver.com"], a[href*="cr3.shopping.naver.com"], a[href*="shopping.naver.com/v2/bridge"]'
    )
  );
  const byMid = new Map<string, RawUnifiedCard>();
  for (const a of anchors) {
    const mid = (a.href.match(/[?&]nv_mid=(\d+)/) || [])[1];
    if (!mid || byMid.has(mid)) continue;
    let card: HTMLElement = a;
    for (let i = 0; i < 6 && card.parentElement; i++) {
      card = card.parentElement;
      if (card.querySelector('img') && /원/.test(card.innerText || '')) break;
    }
    const img = card.querySelector('img');
    byMid.set(mid, {
      href: a.href,
      text: (card.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 500),
      imgAlt: (img?.getAttribute('alt') || '').trim(),
      imgSrc: img?.getAttribute('src') || '',
    });
  }
  return Array.from(byMid.values());
}

/**
 * 모바일 통합검색에서 쇼핑 블록을 실브라우저로 수집한다.
 * 실패 시 명확한 에러를 던진다 — 조용한 빈 결과는 화면에서 거짓말이 된다.
 */
export async function fetchShoppingFromUnifiedSearch(
  keyword: string,
  options: { display?: number; start?: number; sort?: ShoppingSort } = {}
): Promise<ShoppingSearchResult> {
  const display = Math.min(Math.max(options.display ?? 20, 1), 100);
  const start = Math.min(Math.max(options.start ?? 1, 1), 1000);
  const sort = options.sort ?? 'sim';

  const { browserPool } = await import('./puppeteer-pool');
  let browser: any = null;
  let page: any = null;
  try {
    browser = await browserPool.acquire();
    page = await browser.newPage({
      userAgent: MOBILE_UA,
      viewport: { width: 390, height: 844 },
      isMobile: true,
      locale: 'ko-KR',
    });
    const url = `https://m.search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2500);
    // 쇼핑 블록 일부는 지연 렌더 — 한 번 스크롤해 마저 채운다
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(1200);

    const rawCards: RawUnifiedCard[] = await page.evaluate(collectCardsInPage);
    if (!rawCards || rawCards.length === 0) {
      throw new Error(`통합검색 쇼핑 블록에서 상품을 찾지 못했습니다: "${keyword}" (쇼핑 노출이 없는 키워드이거나 페이지 구조 변경)`);
    }
    return buildUnifiedResult(rawCards, { display, start, sort });
  } catch (error: any) {
    console.warn('[SHOP-FALLBACK] 통합검색 수집 실패:', error?.message || error);
    throw new Error(`네이버 쇼핑 데이터 수집 실패 (통합검색 폴백): ${error?.message || error}`);
  } finally {
    try { if (page) await page.close(); } catch {}
    try { if (browser) browserPool.release(browser); } catch {}
  }
}
