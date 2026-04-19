/**
 * 네이버 쇼핑 검색 API — 쇼핑 커넥트 기능용
 *
 * 입력: 키워드
 * 출력: 상품 목록 (상품명/가격/쇼핑몰/이미지/상품URL)
 *
 * 목적: 블로그 판매 글 작성용 상품 정보 수집 → 글 내에 상품 카드로 소개 → 판매 전환
 */

import { EnvironmentManager } from './environment-manager';

export interface ShoppingItem {
  title: string;           // HTML 태그 제거된 원본 상품명
  cleanTitle?: string;     // 정제된 상품명 (비교표·블로그 글용)
  link: string;            // 네이버 쇼핑 상품 URL
  image: string;           // 상품 이미지 URL
  lprice: number;          // 최저가
  hprice: number;          // 최고가 (0이면 가격 범위 없음)
  mallName: string;        // 쇼핑몰 이름
  productId: string;       // 네이버 상품 ID
  productType: number;     // 1=일반, 2=중고, 3=단종, 4=판매중지
  brand?: string;          // 브랜드
  maker?: string;          // 제조사
  category1?: string;      // 대분류
  category2?: string;      // 중분류
  category3?: string;      // 소분류
  category4?: string;      // 세분류
  // 전환 시그널 (스크레이핑으로 보강)
  reviewCount?: number;    // 리뷰 수
  rating?: number;         // 평점 (0.0 ~ 5.0)
  // 제휴 매칭
  coupangSearchUrl?: string;  // 쿠팡 검색 URL (파트너스 ID 있으면 트래킹)
  // 계산된 점수 (정렬용)
  conversionScore?: number;
  scoreBreakdown?: {
    coupang: number;
    sweetSpot: number;
    priceCentral: number;  // 스위트스팟 중앙값 근접 연속 점수 0~5
    brand: number;
    specificity: number;   // 상품명 구체성(모델명/시리즈) 0~3
    review: number;
    majorMall: number;
    penalty: number;
  };
}

export interface ShoppingSearchResult {
  total: number;
  start: number;
  display: number;
  items: ShoppingItem[];
}

export type ShoppingSort = 'sim' | 'date' | 'asc' | 'dsc';
// sim=정확도, date=날짜, asc=가격↑, dsc=가격↓

function stripTags(s: string): string {
  return (s || '').replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");
}

/**
 * 상품명 정제
 *  - 맨 앞에 중복된 브랜드 토큰 제거 ("QCY QCY-HT08" → "QCY-HT08")
 *  - 과도한 대괄호 설명 제거 ([이벤트], [10주년기획] 등)
 *  - 끝의 개수/옵션 표기 간소화 (", 3개" → 제거)
 */
export function cleanProductTitle(rawTitle: string, brand?: string): string {
  let t = (rawTitle || '').trim();
  if (!t) return '';

  // 1) [대괄호] 제거 (사은품/이벤트 문구)
  t = t.replace(/\[[^\]]*\]/g, ' ');

  // 2) 끝의 ", N개/N정/N캡슐" 같은 수량 옵션 제거
  t = t.replace(/,\s*\d+(개|정|캡슐|팩|세트|병|박스|개입)\s*$/g, '');

  // 3) 브랜드 중복 제거: "QCY QCY-HT08" → "QCY HT08"
  if (brand && brand.trim()) {
    const b = brand.trim();
    // 맨 앞 "brand brand" 또는 "brand brand-XXX" 패턴
    const doubleBrandRe = new RegExp(`^(${b}\\s+)${b}(-|\\s|$)`, 'i');
    t = t.replace(doubleBrandRe, '$1').replace(/\s+/g, ' ').trim();
    // "QCY QCY-HT08" 정규식으로 안 걸리는 경우 대비: 브랜드 토큰이 2번 연속
    const tokens = t.split(/\s+/);
    if (tokens.length >= 2 && tokens[0].toLowerCase() === tokens[1].toLowerCase().replace(/-.*$/, '')) {
      tokens.splice(0, 1);
      t = tokens.join(' ');
    }
  }

  // 4) 공백 정리
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

// 5분 메모리 캐시 — 네이버 쇼핑 API 일일 25k 쿼터 보호
const CACHE_TTL = 5 * 60_000;
const shoppingCache = new Map<string, { result: ShoppingSearchResult; expiresAt: number }>();

function cacheKey(keyword: string, display: number, start: number, sort: ShoppingSort): string {
  return `${keyword.toLowerCase().trim()}|${display}|${start}|${sort}`;
}

/**
 * 네이버 쇼핑 검색 API 호출
 *
 * @param keyword 검색 키워드
 * @param options  display(1-100), start(1-1000), sort
 */
export async function searchNaverShopping(
  keyword: string,
  options: { display?: number; start?: number; sort?: ShoppingSort } = {}
): Promise<ShoppingSearchResult> {
  const envManager = EnvironmentManager.getInstance();
  const config = envManager.getConfig();

  const clientId = config.naverClientId || process.env['NAVER_CLIENT_ID'] || '';
  const clientSecret = config.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '';

  if (!clientId || !clientSecret) {
    throw new Error('네이버 API 키가 설정되지 않았습니다. 환경설정에서 NAVER_CLIENT_ID/SECRET 을 설정해주세요.');
  }

  const display = Math.min(Math.max(options.display ?? 20, 1), 100);
  const start = Math.min(Math.max(options.start ?? 1, 1), 1000);
  const sort = options.sort ?? 'sim';

  // 캐시 확인
  const key = cacheKey(keyword, display, start, sort);
  const now = Date.now();
  const cached = shoppingCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.result;
  }

  const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(keyword)}&display=${display}&start=${start}&sort=${sort}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`네이버 쇼핑 API 오류 (${response.status}): ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as any;

  const items: ShoppingItem[] = (data.items || []).map((raw: any) => {
    const title = stripTags(raw.title);
    const brand = raw.brand || undefined;
    return {
      title,
      cleanTitle: cleanProductTitle(title, brand),
      link: raw.link,
      image: raw.image,
      lprice: Number(raw.lprice) || 0,
      hprice: Number(raw.hprice) || 0,
      mallName: raw.mallName || '',
      productId: raw.productId || '',
      productType: Number(raw.productType) || 1,
      brand,
      maker: raw.maker || undefined,
      category1: raw.category1 || undefined,
      category2: raw.category2 || undefined,
      category3: raw.category3 || undefined,
      category4: raw.category4 || undefined,
    };
  });

  const finalResult = {
    total: Number(data.total) || 0,
    start: Number(data.start) || start,
    display: Number(data.display) || display,
    items,
  };

  // 캐시 저장 (TTL 초과 항목은 자연 만료 — get 시 비교)
  shoppingCache.set(key, { result: finalResult, expiresAt: now + CACHE_TTL });

  // 캐시 크기 제한: 100개 초과 시 가장 오래된 것 제거
  if (shoppingCache.size > 100) {
    const oldest = Array.from(shoppingCache.entries()).sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0];
    if (oldest) shoppingCache.delete(oldest[0]);
  }

  return finalResult;
}

// 테스트 / 디버그용 캐시 초기화
export function clearShoppingCache(): void {
  shoppingCache.clear();
}

/**
 * 블로그→구매 전환 관점 스코어링
 *
 * 핵심 시그널 (가중치 합 = 약 50점):
 *  - 쿠팡(파트너스 수익 가능)  +15
 *  - 2~7만원 스위트스팟 가격대    +10
 *  - 리뷰 100+ 혹은 평점 4.0+    +10
 *  - 브랜드 있음                 +8
 *  - 메이저몰                    +5 (쿠팡 제외)
 *
 * 감점:
 *  - 개인 스마트스토어(생소한 쇼핑몰명) -5
 *  - 가격 5천원 미만 / 50만원 초과     -5
 */
export interface ConversionScoreOptions {
  sweetSpotMin?: number;       // 기본 20000
  sweetSpotMax?: number;       // 기본 70000
  lowPriceFloor?: number;      // 기본 5000
  highPriceCeil?: number;      // 기본 500000
}

// 제휴 수익 관점 우선순위 (쿠팡 최우선)
const COUPANG_MALL_NAMES = new Set(['쿠팡', 'Coupang', 'coupang']);
const TIER2_MAJOR_MALLS = new Set(['네이버', '11번가', 'G마켓', '옥션', '위메프', '티몬', '인터파크', '롯데ON', 'SSG닷컴']);

// 개인 스마트스토어 식별 — "○○상점", "○○몰", "○○스토어" 등 패턴
function isLikelyIndividualStore(mallName: string): boolean {
  if (!mallName) return false;
  if (COUPANG_MALL_NAMES.has(mallName) || TIER2_MAJOR_MALLS.has(mallName)) return false;
  return /(상점|스토어|몰|샵|shop|store|mart)$/i.test(mallName);
}

// 상품명에 모델번호/시리즈 패턴이 있는지 검사
// 예: "T13APP", "BP1 PRO", "LCP-CL06", "GX-M1" 등은 +3
// 영문+숫자 조합이 있어야 모델로 인정 (단순 "Pro"만은 제외)
function hasSpecificModelCode(title: string): boolean {
  if (!title) return false;
  // 영문 대소문자 1~4자 + 숫자 2+자리 (하이픈 허용)
  // 예: "T13", "BP1", "LCP-CL06", "GX-M1000", "A7", "FX-3"
  return /\b[A-Za-z]{1,5}-?[A-Za-z]{0,4}-?\d{1,5}\b/.test(title);
}

export function computeConversionScore(item: ShoppingItem, opts: ConversionScoreOptions = {}): number {
  const sweetMin = opts.sweetSpotMin ?? 20000;
  const sweetMax = opts.sweetSpotMax ?? 70000;
  const sweetMid = (sweetMin + sweetMax) / 2; // 중앙값 (기본 45000)
  const lowFloor = opts.lowPriceFloor ?? 5000;
  const highCeil = opts.highPriceCeil ?? 500000;

  let coupang = 0, sweetSpot = 0, priceCentral = 0, brand = 0, specificity = 0, review = 0, majorMall = 0, penalty = 0;

  // 쿠팡 우선 (제휴 수익성)
  if (COUPANG_MALL_NAMES.has(item.mallName)) coupang = 15;
  else if (TIER2_MAJOR_MALLS.has(item.mallName)) majorMall = 5;

  // 스위트스팟 가격대 (bucket +10)
  if (item.lprice >= sweetMin && item.lprice <= sweetMax) {
    sweetSpot = 10;
    // 스위트스팟 내부 연속 점수 — 중앙값에 가까울수록 높음 (최대 +5)
    // 중앙값에서의 거리 / 절반폭 = 0~1 (0: 중앙, 1: 경계)
    const half = (sweetMax - sweetMin) / 2;
    const dist = Math.abs(item.lprice - sweetMid);
    const closeness = Math.max(0, 1 - dist / half); // 1: 정확히 중앙, 0: 경계
    priceCentral = Math.round(closeness * 5 * 10) / 10; // 0~5, 소수 1자리
  }

  // 브랜드 신호
  if (item.brand && item.brand.trim().length > 0) brand = 8;
  else if (item.maker && item.maker.trim().length > 0) brand = 4;

  // 상품명 구체성 (모델코드 존재 = 구체적 상품 = 전환 유리)
  if (hasSpecificModelCode(item.title)) specificity = 3;

  // 리뷰/평점 실측 신호 (있으면 우선 사용)
  const rc = item.reviewCount || 0;
  const rating = item.rating || 0;
  if (rc > 0 || rating > 0) {
    if (rc >= 1000) review = 10;
    else if (rc >= 100) review = 7;
    else if (rc >= 30) review = 4;
    if (rating >= 4.5) review += 3;
    else if (rating >= 4.0) review += 2;
    review = Math.min(10, review);
  } else {
    // 실측 리뷰 데이터 없음 — proxy 품질 시그널 사용
    // 1) hprice > lprice: 여러 판매처 취급 = 검증된 상품 (최저가 < 최고가 관계 성립)
    // 2) category3+ 분류 완료: 네이버가 세분류까지 매핑 = 정식 등록 상품
    // 3) 브랜드+제조사 둘 다 존재: 추적 가능 업체
    if (item.hprice && item.hprice > item.lprice) review += 3;
    if (item.category3) review += 2;
    if (item.brand && item.maker) review += 2;
    review = Math.min(7, review); // proxy 최대 7점 (실측 10점 대비 낮게)
  }

  // 감점
  if (isLikelyIndividualStore(item.mallName)) penalty -= 5;
  if (item.lprice < lowFloor || item.lprice > highCeil) penalty -= 5;
  if (item.productType !== 1) penalty -= 10; // 중고/단종/판매중지

  const total = coupang + sweetSpot + priceCentral + brand + specificity + review + majorMall + penalty;

  // 소수점 대신 정수로 보이도록 round (priceCentral만 소수 가능)
  item.conversionScore = Math.round(total * 10) / 10;
  item.scoreBreakdown = { coupang, sweetSpot, priceCentral, brand, specificity, review, majorMall, penalty };

  return item.conversionScore;
}

/**
 * 블로그 글 작성용 "추천 상품" 선별 — 전환 중심
 */
export function pickBlogRecommendedItems(items: ShoppingItem[], limit: number = 10, opts?: ConversionScoreOptions): ShoppingItem[] {
  const normal = items.filter(i => i.productType === 1 && i.lprice > 0);
  if (normal.length === 0) return [];

  for (const item of normal) computeConversionScore(item, opts);

  const sorted = normal.slice().sort((a, b) => {
    const diff = (b.conversionScore || 0) - (a.conversionScore || 0);
    if (diff !== 0) return diff;
    // 동점 시: 리뷰 많은 순 → 가격 오름차순
    const rcDiff = (b.reviewCount || 0) - (a.reviewCount || 0);
    if (rcDiff !== 0) return rcDiff;
    return a.lprice - b.lprice;
  });

  return sorted.slice(0, limit);
}
