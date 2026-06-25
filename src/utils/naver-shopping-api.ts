/**
 * 네이버 쇼핑 검색 API — 쇼핑 커넥트 기능용
 *
 * 입력: 키워드
 * 출력: 상품 목록 (상품명/가격/쇼핑몰/이미지/상품URL)
 *
 * 목적: 블로그 판매 글 작성용 상품 정보 수집 → 글 내에 상품 카드로 소개 → 판매 전환
 */

import { EnvironmentManager } from './environment-manager';
import { BRAND_FAMILIES, detectCategoryFamily } from './brand-families';

export interface ShoppingItem {
  title: string;           // HTML 태그 제거된 원본 상품명
  cleanTitle?: string;     // 정제된 상품명 (비교표·블로그 글용, 대괄호/수량만 제거)
  simplifiedTitle?: string; // 검색용 간소화 제목 (브랜드+핵심 2~3토큰, 스펙/단위 제거)
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
  opportunityScore?: number;       // 지금 글로 연결할 가치: 수요/상승/구매의도/전환성 통합 점수
  opportunityGrade?: 'HOT' | 'BUY' | 'WATCH' | 'LOW';
  opportunityReasons?: string[];
  opportunityBadges?: string[];
  writeRecommendation?: string;
  contentAngles?: string[];
  discoveryQuery?: string;
  discoverySource?: 'direct' | 'category-peer' | 'autocomplete-demand' | 'trend-seed' | 'auto-discovery';
  discoveryReason?: string;
  lewordEntryKeywords?: ShoppingLeWordKeyword[];
  opportunityBreakdown?: {
    demand: number;
    buyerIntent: number;
    contentFit: number;
    conversion: number;
    penalty: number;
  };
  shoppingProductQuality?: ShoppingProductQuality;
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

export interface ShoppingProductQuality {
  score: number;
  isSaleableProduct: boolean;
  reject: boolean;
  hotSignalScore: number;
  reasons: string[];
  penalties: string[];
}

export interface ShoppingLeWordKeyword {
  keyword: string;
  relation: 'same-product' | 'peer-brand' | 'category' | 'intent';
  reason: string;
  searchVolume?: number;
  documentCount?: number;
  goldenRatio?: number;
  entryScore?: number;
  verdict?: '진입가능' | '검토' | '빅키워드주의' | '데이터필요';
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

/**
 * 검색용 간소화 제목 — 브랜드커넥트/네이버 검색 매칭에 최적화
 *
 *  - [대괄호] ( ) { } 전부 제거
 *  - 단위 토큰 제거 (3000IU, 500mg, 120ml, 60정, 2개세트, 1+1 등)
 *  - 모델코드 유지 (HT08, RSM-R540 같은 건 검색 도움)
 *  - 맨 앞 2~4토큰만 남김
 *
 * 예:
 *   "뉴트리원 퓨어 비타민D3 3000IU 500mg x 60정" → "뉴트리원 퓨어 비타민D3"
 *   "QCY QCY-HT08" → "QCY HT08"
 *   "레토지엠에스 레토 경량 접이식 캠핑의자 LCP-CL06" → "레토 경량 접이식 캠핑의자"
 */
export function simplifyProductTitleForSearch(rawTitle: string, brand?: string): string {
  let t = cleanProductTitle(rawTitle, brand);
  if (!t) return '';

  // 괄호류 전부 제거
  t = t.replace(/\([^)]*\)/g, ' ').replace(/\{[^}]*\}/g, ' ').replace(/\[[^\]]*\]/g, ' ');

  // 단위/스펙 토큰 제거: 3000IU, 500mg, 120ml, 2kg, 60정, 3개세트, 10매, 1+1 등
  t = t.replace(/\b\d+(\.\d+)?\s*(IU|mg|g|kg|ml|L|정|캡슐|매|개입|개|팩|세트|봉|호|년|일|회|장|p|pcs|ea|EA)\b/gi, ' ');
  t = t.replace(/\b\d+\s*[+x×]\s*\d+\b/g, ' '); // "1+1", "2x60" 등
  t = t.replace(/,\s*\d+\S*/g, ' ');

  // 공백 정리
  t = t.replace(/\s+/g, ' ').trim();

  // 맨 앞 2~4토큰만 (토큰이 너무 적으면 전체 유지)
  const tokens = t.split(/\s+/).filter(Boolean);
  const keep = Math.min(tokens.length, 4);
  // 4토큰 넘지만 4토큰째가 짧으면 3토큰까지만
  const finalTokens = tokens.slice(0, keep);

  return finalTokens.join(' ').trim();
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

  // v2.43.55: 10팀 — 8초 AbortController hard timeout (IPC 영구 hang 차단)
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), 8000);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
      signal: ctrl.signal,
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('네이버 쇼핑 API timeout (8s)');
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`네이버 쇼핑 API 오류 (${response.status}): ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as any;

  const items: ShoppingItem[] = (data.items || []).map((raw: any) => {
    const title = stripTags(raw.title);
    const brand = raw.brand || undefined;
    // v2.43.62: 2팀 — 응답에 reviewCount/rating이 있을 수 있으니 시도 (네이버 일부 카테고리만 제공)
    const rcRaw = raw.reviewCount ?? raw.review_count ?? raw.reviewCnt;
    const rtRaw = raw.rating ?? raw.score ?? raw.starRating;
    const reviewCount = Number(rcRaw);
    const rating = Number(rtRaw);
    return {
      title,
      cleanTitle: cleanProductTitle(title, brand),
      simplifiedTitle: simplifyProductTitleForSearch(title, brand),
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
      reviewCount: Number.isFinite(reviewCount) && reviewCount > 0 ? reviewCount : undefined,
      rating: Number.isFinite(rating) && rating > 0 ? rating : undefined,
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
  balanceDiscovery?: boolean;
  maxPerDiscoveryQuery?: number;
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

// v2.42.56 Phase 3: 카테고리별 가격 스위트스팟 (네이버 쇼핑 category1 기준)
//   기존: 모든 상품 2~7만원 일률 적용 → 가전/컴퓨터/명품 SSS 차단, 식품 너무 높음
//   변경: 카테고리별 동적 → 식품 1~3만 / 가전 10~30만 / 디지털 5~30만 등
const CATEGORY_SWEETSPOT: Record<string, [number, number]> = {
  '패션의류': [30000, 100000],
  '패션잡화': [30000, 150000],
  '화장품/미용': [20000, 60000],
  '디지털/가전': [50000, 300000],
  '컴퓨터': [500000, 1500000],
  '가구/인테리어': [50000, 300000],
  '출산/육아': [15000, 80000],
  '식품': [10000, 30000],
  '스포츠/레저': [40000, 200000],
  '생활/건강': [10000, 50000],
  '여가/생활편의': [10000, 50000],
  '도서': [10000, 30000],
  '면세점': [50000, 300000],
  '명품': [300000, 2000000],
};

export function resolveCategorySweetSpot(category1?: string): [number, number] {
  if (!category1) return [20000, 70000];
  return CATEGORY_SWEETSPOT[category1] || [20000, 70000];
}

export interface ShoppingOpportunityContext {
  keyword: string;
  intentPrimary?: 'buy' | 'compare' | 'info' | 'brand' | string;
  totalHits?: number;
  relatedKeywords?: string[];
  crossSourceSeeds?: Array<{ seed: string; sources?: string[]; crossScore?: number }>;
  recency?: { status?: string; ratio?: number };
}

const SHOPPING_PRODUCT_NOUN_RE =
  /(이어폰|헤드폰|헤드셋|스피커|충전기|보조배터리|노트북|태블릿|모니터|키보드|마우스|공기청정기|청소기|로봇청소기|제습기|가습기|에어컨|선풍기|서큘레이터|커피머신|쿠션|선크림|크림|앰플|세럼|샴푸|트리트먼트|마스크팩|틴트|립스틱|영양제|비타민|유산균|오메가|콜라겐|루테인|운동화|스니커즈|원피스|블라우스|티셔츠|가방|지갑|시계|선글라스|의자|책상|매트|텐트|침낭|캠핑|유모차|카시트|기저귀|사료|모래|간식|블랙박스|타이어|세차|매트리스|베개|커튼|식기|텀블러|도시락|마사지|건조기|면도기|칫솔|전기자전거|자전거|스마트워치|냉장고|세탁기|오븐|에어프라이어|상품|제품|세트|기기|용품|가전)/u;
const SHOPPING_BUY_INTENT_RE =
  /(추천|후기|리뷰|비교|가격|최저가|할인|쿠폰|핫딜|특가|세일|랭킹|순위|가성비|신상|재입고|구매|구입|선물|베스트|TOP\s*\d+)/iu;
const SHOPPING_HOT_SIGNAL_RE =
  /(trend|trending|rank|ranking|shopping|youtube|oliveyoung|datalab|auto-discovery|autocomplete|실시간|급상승|랭킹|쇼핑인사이트|데이터랩|오늘|이번주|핫딜|특가|세일|신상|재입고|품절|완판|유행|인기)/iu;
const SHOPPING_NON_PRODUCT_RE =
  /(프로필|나이|키|학력|결혼|이혼|사망|별세|논란|사건|사고|재판|징역|구속|선거|대통령|장관|정책|지원금|신청|일정|경기|축구|야구|월드컵|드라마|영화|방송|연예|배우|가수|아이돌|주가|코인|환율|부동산|아파트|분양|청약|날씨|태풍|지진|화재)/u;
const SHOPPING_TOO_GENERIC_RE = /^(추천|후기|리뷰|비교|가격|할인|쿠폰|핫딜|특가|세일|쇼핑|상품|제품|이슈|실시간|검색어)$/u;

function scoreHotShoppingSignals(item: ShoppingItem, context?: ShoppingOpportunityContext): number {
  const sourceText = [
    item.discoverySource || '',
    item.discoveryReason || '',
    item.discoveryQuery || '',
    ...(context?.crossSourceSeeds || []).flatMap(seed => [seed.seed, ...(seed.sources || []), String(seed.crossScore || '')]),
  ].join(' ');
  let score = 0;
  if (SHOPPING_HOT_SIGNAL_RE.test(sourceText)) score += 8;
  if (context?.recency?.status === 'rising') score += 8;
  else if (context?.recency?.status === 'stable') score += 3;
  if ((context?.crossSourceSeeds || []).some(seed => seed.seed && titleMatchesSignal(item.title || '', seed.seed))) score += 8;
  if (SHOPPING_BUY_INTENT_RE.test(`${item.discoveryQuery || ''} ${context?.keyword || ''}`)) score += 4;
  if ((item.reviewCount || 0) >= 100 || (item.rating || 0) >= 4.3) score += 3;
  return Math.min(24, score);
}

export function judgeShoppingProductOpportunity(
  item: ShoppingItem,
  context?: ShoppingOpportunityContext,
): ShoppingProductQuality {
  const title = stripTags(item.cleanTitle || item.simplifiedTitle || item.title || '');
  const categoryText = [item.category1, item.category2, item.category3, item.category4].filter(Boolean).join(' ');
  const keywordText = [context?.keyword, item.discoveryQuery, item.discoveryReason].filter(Boolean).join(' ');
  const fullText = `${title} ${categoryText} ${keywordText} ${item.brand || ''} ${item.maker || ''}`;
  const reasons: string[] = [];
  const penalties: string[] = [];
  let score = 0;

  const hasProductNoun = SHOPPING_PRODUCT_NOUN_RE.test(fullText);
  const hasBuyIntent = SHOPPING_BUY_INTENT_RE.test(keywordText) || SHOPPING_BUY_INTENT_RE.test(title);
  const hasTaxonomy = Boolean(item.category2 || item.category3 || item.category4);
  const hasBrandOrMaker = Boolean((item.brand || '').trim() || (item.maker || '').trim());
  const hasModel = hasSpecificModelCode(title);
  const hasMerchant = Boolean((item.mallName || '').trim() || (item.link || '').trim() || (item.productId || '').trim());
  const price = Number(item.lprice || 0);
  const hotSignalScore = scoreHotShoppingSignals(item, context);

  if (price >= 5000 && price <= 700000) {
    score += 14;
    reasons.push('판매 가능한 가격대');
  } else if (price > 0) {
    score += 4;
    penalties.push('가격대가 블로그 전환 구간에서 벗어남');
  } else {
    penalties.push('가격 정보 없음');
  }

  if (hasTaxonomy) {
    score += 14;
    reasons.push('쇼핑 카테고리 분류 확인');
  }
  if (hasProductNoun) {
    score += 14;
    reasons.push('구체적인 제품/용품 명사 포함');
  }
  if (hasBrandOrMaker) {
    score += 10;
    reasons.push('브랜드/제조사 비교 가능');
  }
  if (hasModel) {
    score += 8;
    reasons.push('모델명/시리즈 신호 포함');
  }
  if (hasBuyIntent) {
    score += 10;
    reasons.push('추천/후기/비교/가격형 구매 의도');
  }
  if (hasMerchant) {
    score += 8;
    reasons.push('판매처/상품 링크 확인');
  }
  if ((item.reviewCount || 0) >= 30 || (item.rating || 0) >= 4 || (item.hprice && item.hprice > item.lprice)) {
    score += 8;
    reasons.push('리뷰/가격범위 기반 검증 신호');
  }
  if (hotSignalScore > 0) {
    score += Math.min(18, hotSignalScore);
    reasons.push('실시간/랭킹/교차소스 핫제품 신호');
  }

  const genericKeyword = SHOPPING_TOO_GENERIC_RE.test(String(item.discoveryQuery || context?.keyword || '').trim());
  if (genericKeyword) {
    score -= 20;
    penalties.push('단독 사용이 어려운 일반 쇼핑어');
  }
  const nonProductIssue = SHOPPING_NON_PRODUCT_RE.test(fullText);
  if (nonProductIssue && !hasProductNoun && !hasTaxonomy) {
    score -= 55;
    penalties.push('프로필/뉴스/정책/스포츠성 비상품 이슈');
  } else if (nonProductIssue && !hasProductNoun) {
    score -= 18;
    penalties.push('비상품 이슈어 혼입');
  }
  if (!hasProductNoun && !hasTaxonomy && !hasBrandOrMaker) {
    score -= 28;
    penalties.push('제품 판별 신호 부족');
  }

  const finalScore = clampScore(score);
  const reject = (nonProductIssue && !hasProductNoun && !hasTaxonomy) || finalScore < 28;
  return {
    score: Math.round(finalScore * 10) / 10,
    isSaleableProduct: !reject && finalScore >= 48,
    reject,
    hotSignalScore,
    reasons: Array.from(new Set(reasons)).slice(0, 5),
    penalties: Array.from(new Set(penalties)).slice(0, 4),
  };
}

const FAMILY_DEFAULT_PRODUCT: Partial<Record<keyof typeof BRAND_FAMILIES, string>> = {
  shoes: '운동화',
  sportswear: '운동복',
  golf: '골프용품',
  outdoor: '아웃도어',
  camping: '캠핑용품',
  bicycle: '자전거',
  phone: '스마트폰',
  laptop: '노트북',
  tablet: '태블릿',
  tv: 'TV',
  appliance: '가전',
  camera: '카메라',
  headphone: '무선 이어폰',
  car: '자동차',
  ev: '전기차',
  cosmetic: '화장품',
  kcosmetic: '스킨케어',
  perfume: '향수',
  haircare: '헤어케어',
  fashionSPA: '패션',
  luxury: '명품',
  bag: '가방',
  watch: '시계',
  glasses: '안경',
  coffee: '커피',
  chicken: '치킨',
  pizza: '피자',
  burger: '햄버거',
  ecommerce: '쇼핑몰',
  fashionPlatform: '패션 플랫폼',
  game: '게임기',
  furniture: '가구',
  mattress: '매트리스',
  supplement: '영양제',
  pet: '반려동물 용품',
  baby: '육아용품',
  peripheral: 'PC 주변기기',
  smallAppliance: '소형가전',
};

function findBrandFamilies(text: string): Array<{ family: keyof typeof BRAND_FAMILIES; matchedBrand: string; brands: string[] }> {
  const normalized = normalizeMatchText(text).replace(/\s+/g, '');
  if (!normalized) return [];
  const out: Array<{ family: keyof typeof BRAND_FAMILIES; matchedBrand: string; brands: string[] }> = [];
  for (const [family, brands] of Object.entries(BRAND_FAMILIES) as Array<[keyof typeof BRAND_FAMILIES, string[]]>) {
    const matched = brands.find(brand => {
      const b = normalizeMatchText(brand).replace(/\s+/g, '');
      return b.length >= 2 && normalized.includes(b);
    });
    if (matched) out.push({ family, matchedBrand: matched, brands });
  }
  return out;
}

function getFamilyPeers(text: string, maxPeers = 6): Array<{ family: keyof typeof BRAND_FAMILIES; matchedBrand?: string; peerBrands: string[]; productNoun: string }> {
  const category = detectCategoryFamily(text);
  const fromBrand = findBrandFamilies(text);
  const seenFamily = new Set<string>();
  const out: Array<{ family: keyof typeof BRAND_FAMILIES; matchedBrand?: string; peerBrands: string[]; productNoun: string }> = [];

  if (category) {
    const brands = BRAND_FAMILIES[category.family] || [];
    out.push({
      family: category.family,
      peerBrands: brands.slice(0, maxPeers),
      productNoun: category.token || FAMILY_DEFAULT_PRODUCT[category.family] || '제품',
    });
    seenFamily.add(category.family);
  }

  for (const item of fromBrand) {
    if (seenFamily.has(item.family)) continue;
    const productNoun = FAMILY_DEFAULT_PRODUCT[item.family] || '제품';
    const peers = item.brands.filter(b => b !== item.matchedBrand).slice(0, maxPeers);
    out.push({ family: item.family, matchedBrand: item.matchedBrand, peerBrands: peers, productNoun });
    seenFamily.add(item.family);
    if (out.length >= 2) break;
  }

  return out;
}

export function deriveShoppingExpansionQueries(
  keyword: string,
  relatedKeywords: string[] = [],
  crossSourceSeeds: Array<{ seed: string; sources?: string[]; crossScore?: number }> = [],
  maxQueries: number = 8
): Array<{ query: string; source: ShoppingItem['discoverySource']; reason: string }> {
  const safeRelatedKeywords = Array.isArray(relatedKeywords) ? relatedKeywords : [];
  const safeCrossSourceSeeds = Array.isArray(crossSourceSeeds) ? crossSourceSeeds : [];
  const out: Array<{ query: string; source: ShoppingItem['discoverySource']; reason: string }> = [];
  const seen = new Set<string>();
  const add = (query: string, source: ShoppingItem['discoverySource'], reason: string) => {
    const q = String(query || '').replace(/\s+/g, ' ').trim();
    if (q.length < 2 || q.length > 35) return;
    const key = q.toLowerCase();
    if (seen.has(key) || key === keyword.toLowerCase()) return;
    seen.add(key);
    out.push({ query: q, source, reason });
  };

  for (const group of getFamilyPeers(keyword, 7)) {
    for (const brand of group.peerBrands) {
      add(`${brand} ${group.productNoun} 추천`, 'category-peer', `${group.productNoun} 카테고리의 동급 브랜드`);
      if (out.length >= maxQueries) break;
    }
    if (out.length >= maxQueries) break;
  }

  const commercialRelated = safeRelatedKeywords
    .filter(k => /(추천|후기|리뷰|비교|가격|최저가|할인|순위|구매)/.test(k))
    .slice(0, 4);
  for (const related of commercialRelated) {
    add(related, 'autocomplete-demand', '자동완성 구매 의도');
  }

  for (const seed of safeCrossSourceSeeds.slice(0, 4)) {
    if (seed?.seed) add(seed.seed, 'trend-seed', '실시간 유행 시드');
  }

  return out.slice(0, maxQueries);
}

function clampScore(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

function normalizeMatchText(s: string): string {
  return stripTags(String(s || ''))
    .toLowerCase()
    .replace(/[^가-힣a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const MATCH_STOP_WORDS = new Set([
  '추천', '후기', '리뷰', '비교', '가격', '최저가', '할인', '쿠폰', '구매', '순위', '인기',
  '정품', '공식', '무료배송', '국내', '해외', '제품', '상품', '세트', '특가', '베스트',
]);

function matchTokens(s: string): string[] {
  return normalizeMatchText(s)
    .split(/\s+/)
    .filter(t => t.length >= 2 && !MATCH_STOP_WORDS.has(t));
}

function titleMatchesSignal(title: string, signal: string): boolean {
  const nt = normalizeMatchText(title);
  const ns = normalizeMatchText(signal);
  if (!nt || !ns || ns.length < 2) return false;
  if (ns.length >= 4 && nt.includes(ns)) return true;

  const tokens = matchTokens(signal);
  if (tokens.length === 0) return false;
  const matched = tokens.filter(t => nt.includes(t)).length;
  return tokens.length === 1 ? matched === 1 && tokens[0].length >= 3 : matched >= Math.min(2, tokens.length);
}

function formatRecencyReason(recency?: ShoppingOpportunityContext['recency']): string | null {
  if (!recency?.status) return null;
  const pct = Number.isFinite(Number(recency.ratio)) ? `${Math.round(Number(recency.ratio) * 100)}%` : '';
  if (recency.status === 'rising') return pct ? `최근 7일 검색이 30일 평균의 ${pct}로 상승` : '최근 검색 추세 상승';
  if (recency.status === 'stable') return '최근 검색 추세가 안정적으로 유지';
  if (recency.status === 'declining') return pct ? `최근 7일 검색이 30일 평균의 ${pct}로 하락` : '최근 검색 추세 하락';
  if (recency.status === 'dead') return '최근 검색 수요 약함';
  return null;
}

function buildContentAngles(item: ShoppingItem, keyword: string, matchedSignals: string[]): string[] {
  const product = item.cleanTitle || item.simplifiedTitle || item.title || keyword;
  const base = keyword || product;
  const angles = [
    `${base} 추천 제품 비교: ${product} 가격·장단점`,
    `${product} 후기와 구매 전 확인할 점`,
  ];
  if (matchedSignals.length > 0) {
    angles.push(`${matchedSignals[0]} 찾는 사람에게 ${product}를 추천할 만한 이유`);
  } else if (item.brand) {
    angles.push(`${item.brand} 제품 중 ${product}를 고를 만한 사람`);
  }
  return Array.from(new Set(angles)).slice(0, 3);
}

function productSpecificReasons(item: ShoppingItem, bd: NonNullable<ShoppingItem['scoreBreakdown']>): string[] {
  const reasons: string[] = [];
  if (item.brand) reasons.push(`${item.brand} 브랜드 검색/비교 글감`);
  else if (item.maker) reasons.push(`${item.maker} 제조사 신호`);
  if ((bd.specificity || 0) > 0) reasons.push('모델명/시리즈가 구체적이라 제품 비교 글로 전환 가능');
  if ((bd.sweetSpot || 0) > 0) reasons.push(`${(item.lprice || 0).toLocaleString()}원 가격대가 카테고리 구매 장벽이 낮은 구간`);
  if ((bd.coupang || 0) > 0) reasons.push('쿠팡 구매 이동 가능');
  else if ((bd.majorMall || 0) > 0 && item.mallName) reasons.push(`${item.mallName} 신뢰 판매처 신호`);
  if ((bd.review || 0) >= 5) reasons.push('리뷰/분류/가격범위 기반 품질 신호 확보');
  if (item.category2 || item.category3) reasons.push(`${[item.category2, item.category3].filter(Boolean).join(' > ')} 세부 카테고리로 글 주제화 가능`);
  return reasons;
}

function buildPersonalizedRecommendation(
  item: ShoppingItem,
  keyword: string,
  grade: NonNullable<ShoppingItem['opportunityGrade']>,
  demandEvidence: string[],
  productReasons: string[],
): string {
  const product = item.cleanTitle || item.simplifiedTitle || item.title || keyword;
  const targetKeyword = item.discoveryQuery || keyword;
  const route = item.discoverySource && item.discoverySource !== 'direct' && item.discoveryQuery && item.discoveryQuery !== keyword
    ? `원 검색어 "${keyword}"에서 "${item.discoveryQuery}"로 확장해 잡힌 후보입니다. `
    : '';
  const price = item.lprice ? `${item.lprice.toLocaleString()}원` : '가격 확인 가능';
  const demand = demandEvidence[0] || '수요 근거가 아직 약함';
  const productReason = productReasons[0] || '상품 정보가 비교 글로 전환 가능';
  if (grade === 'HOT') {
    return `${route}${product}는 ${demand} 신호가 있고 ${price} 가격대입니다. ${productReason} 때문에 "${targetKeyword}" 글에서 우선 비교·추천 상품으로 쓰기 좋습니다.`;
  }
  if (grade === 'BUY') {
    return `${route}${product}는 ${demand} 근거와 ${productReason}가 있어 작성 후보입니다. 가격/후기/대체 상품 비교를 같이 넣으면 구매 이동을 만들 수 있습니다.`;
  }
  if (grade === 'WATCH') {
    return `${route}${product}는 ${productReason}는 있지만 ${demand}. 바로 단독 추천보다 LEWORD 후보 키워드로 진입 가능성을 먼저 확인하세요.`;
  }
  return `${route}${product}는 현재 수요 근거가 부족합니다. 단순 인기상품으로 보일 수 있으니 같은 카테고리의 대체 브랜드 키워드를 먼저 확인하세요.`;
}

export function buildProductLeWordSeeds(item: ShoppingItem, baseKeyword: string, maxSeeds: number = 8): ShoppingLeWordKeyword[] {
  const out: ShoppingLeWordKeyword[] = [];
  const seen = new Set<string>();
  const add = (keyword: string, relation: ShoppingLeWordKeyword['relation'], reason: string) => {
    const kw = String(keyword || '').replace(/\s+/g, ' ').trim();
    if (kw.length < 3 || kw.length > 38) return;
    const key = kw.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ keyword: kw, relation, reason, verdict: '데이터필요' });
  };

  const familyGroups = getFamilyPeers(`${baseKeyword} ${item.brand || ''} ${item.maker || ''} ${item.category2 || ''} ${item.category3 || ''}`, 6);
  const fallbackFamily = familyGroups[0]?.family;
  const category = item.category3 || item.category2 || (fallbackFamily ? FAMILY_DEFAULT_PRODUCT[fallbackFamily] : '') || '';
  const brand = item.brand || item.maker || '';
  const product = item.simplifiedTitle || item.cleanTitle || item.title || '';

  if (brand && category) {
    add(`${brand} ${category} 추천`, 'same-product', '브랜드+세부 카테고리 추천 키워드');
    add(`${brand} ${category} 후기`, 'same-product', '브랜드+세부 카테고리 후기 키워드');
  }

  if (category) {
    add(`${category} 추천`, 'category', '카테고리 대표 구매 키워드');
    add(`${category} 순위`, 'category', '구매 전 비교 순위 키워드');
  }

  let earlyPeerAdded = false;
  for (const group of familyGroups) {
    for (const peer of group.peerBrands) {
      if (brand && peer === brand) continue;
      add(`${peer} ${group.productNoun || category || '제품'} 추천`, 'peer-brand', '같은 계열 대체 브랜드 키워드');
      earlyPeerAdded = true;
      break;
    }
    if (earlyPeerAdded) break;
  }

  if (category) {
    add(`${category} 가격`, 'category', '구매 직전 가격 키워드');
    add(`${category} 비교`, 'category', '대체 상품 비교 키워드');
    add(`${category} 가성비`, 'category', '가성비 구매 의도 키워드');
    add(`${category} 구매처`, 'category', '구매처 탐색 키워드');
    if (/(에어컨|제습기|정수기|비데|공기청정기|청소기)/.test(category)) {
      add(`${category} 렌탈`, 'category', '렌탈 전환 키워드');
      add(`${category} 설치`, 'category', '설치 전환 키워드');
    }
  }

  for (const group of familyGroups) {
    for (const peer of group.peerBrands) {
      if (brand && peer === brand) continue;
      add(`${peer} ${group.productNoun || category || '제품'} 추천`, 'peer-brand', '같은 계열 대체 브랜드 키워드');
      if (out.length >= maxSeeds) break;
    }
    if (out.length >= maxSeeds) break;
  }

  if (product) {
    add(`${product} 후기`, 'same-product', '제품명 직접 후기 키워드');
    add(`${product} 가격`, 'same-product', '구매 직전 가격 키워드');
  }

  return out.slice(0, maxSeeds);
}

export function scoreLeWordEntryKeyword(seed: ShoppingLeWordKeyword, searchVolume?: number, documentCount?: number): ShoppingLeWordKeyword {
  const sv = Number(searchVolume || 0);
  const dc = Number(documentCount || 0);
  const ratio = dc > 0 ? sv / Math.max(1, dc) : 0;
  let score = 0;
  if (sv >= 50 && sv <= 30000) score += 28;
  else if (sv > 30000) score += 8;
  if (dc > 0 && dc <= 5000) score += 32;
  else if (dc <= 30000) score += 20;
  else if (dc <= 100000) score += 8;
  if (ratio >= 5) score += 30;
  else if (ratio >= 2) score += 20;
  else if (ratio >= 1) score += 10;
  if (seed.relation === 'peer-brand') score += 6;
  if (/(추천|후기|비교|가격)/.test(seed.keyword)) score += 4;
  score = Math.max(0, Math.min(100, Math.round(score)));
  const verdict: ShoppingLeWordKeyword['verdict'] =
    sv <= 0 || dc <= 0 ? '데이터필요'
      : sv > 50000 || dc > 100000 ? '빅키워드주의'
      : score >= 70 ? '진입가능'
      : score >= 45 ? '검토'
      : '빅키워드주의';
  return {
    ...seed,
    searchVolume: sv || undefined,
    documentCount: dc || undefined,
    goldenRatio: dc > 0 ? Math.round(ratio * 100) / 100 : undefined,
    entryScore: score,
    verdict,
  };
}

export function attachShoppingOpportunityScore(
  item: ShoppingItem,
  context: ShoppingOpportunityContext,
  opts: ConversionScoreOptions = {}
): number {
  const conversion = item.conversionScore ?? computeConversionScore(item, opts);
  const title = `${item.title || ''} ${item.brand || ''} ${item.maker || ''}`;
  const rootKeyword = context.keyword || '';
  const keyword = item.discoveryQuery || rootKeyword;
  const reasons: string[] = [];
  const demandEvidence: string[] = [];
  const badges: string[] = [];
  let demand = 0;
  let buyerIntent = 0;
  let contentFit = 0;
  let penalty = 0;
  const productQuality = judgeShoppingProductOpportunity(item, context);
  item.shoppingProductQuality = productQuality;

  if (productQuality.hotSignalScore > 0) {
    demand += Math.min(12, productQuality.hotSignalScore);
    const msg = `실시간/랭킹 쇼핑 신호 ${productQuality.hotSignalScore}점`;
    reasons.push(msg);
    demandEvidence.push(msg);
    badges.push('핫제품');
  }

  if (productQuality.score >= 72) {
    buyerIntent += 7;
    contentFit += 7;
    reasons.push('제품명/카테고리/판매처/핫신호가 모두 맞는 쇼핑커넥트 우선 후보');
    badges.push('판매가능');
  } else if (productQuality.score >= 50) {
    contentFit += 4;
    reasons.push('블로그 추천/비교 글로 전환 가능한 상품 신호');
  } else {
    penalty -= 8;
    reasons.push('상품성 판정 점수가 낮아 우선순위 하향');
  }

  if (productQuality.reject) {
    penalty -= 45;
    reasons.unshift(`비상품/저품질 쇼핑 키워드 차단: ${productQuality.penalties[0] || '제품 판별 신호 부족'}`);
    badges.push('차단후보');
  }

  const directKeywordMatch = titleMatchesSignal(title, keyword);
  if (directKeywordMatch) {
    demand += 8;
    const msg = '검색 키워드와 상품명이 직접 맞물림';
    reasons.push(msg);
    demandEvidence.push(msg);
    badges.push('키워드일치');
  }

  const relatedMatches = (context.relatedKeywords || [])
    .filter(k => titleMatchesSignal(title, k))
    .slice(0, 3);
  if (relatedMatches.length > 0) {
    demand += Math.min(12, relatedMatches.length * 4);
    const msg = `자동완성 수요와 겹침: ${relatedMatches.join(', ')}`;
    reasons.push(msg);
    demandEvidence.push(msg);
    badges.push('자동완성');
  }

  const crossMatches = (context.crossSourceSeeds || [])
    .filter(s => s?.seed && titleMatchesSignal(title, s.seed))
    .sort((a, b) => (Number(b.crossScore) || 0) - (Number(a.crossScore) || 0))
    .slice(0, 2);
  if (crossMatches.length > 0) {
    const sourceCount = crossMatches.reduce((sum, s) => sum + Math.max(1, s.sources?.length || 0), 0);
    demand += Math.min(18, 8 + sourceCount * 3);
    const msg = `실시간 유행 시드와 일치: ${crossMatches.map(s => s.seed).join(', ')}`;
    reasons.push(msg);
    demandEvidence.push(msg);
    badges.push('실시간');
  }

  const recencyReason = formatRecencyReason(context.recency);
  if (context.recency?.status === 'rising') {
    demand += 14;
    if (recencyReason) {
      reasons.push(recencyReason);
      demandEvidence.push(recencyReason);
    }
    badges.push('상승');
  } else if (context.recency?.status === 'stable') {
    demand += 5;
    if (recencyReason) {
      reasons.push(recencyReason);
      demandEvidence.push(recencyReason);
    }
    badges.push('안정');
  } else if (context.recency?.status === 'declining') {
    penalty -= 8;
    if (recencyReason) reasons.push(recencyReason);
    badges.push('하락주의');
  } else if (context.recency?.status === 'dead') {
    penalty -= 35;
    if (recencyReason) reasons.push(recencyReason);
    badges.push('수요약함');
  }

  const totalHits = Number(context.totalHits || 0);
  if (totalHits >= 50 && totalHits <= 30000) {
    demand += 4;
    reasons.push('검색 결과가 너무 작지도 과포화도 아닌 작성 가능 구간');
  } else if (totalHits > 120000) {
    penalty -= 5;
    reasons.push('검색 결과가 많아 단순 인기상품 글은 묻힐 위험');
  }

  switch (context.intentPrimary) {
    case 'buy':
      buyerIntent += 12;
      reasons.push('검색어 자체가 구매 직전 의도');
      badges.push('구매의도');
      break;
    case 'compare':
      buyerIntent += 10;
      reasons.push('비교·선택형 검색이라 비교표 콘텐츠와 잘 맞음');
      badges.push('비교의도');
      break;
    case 'brand':
      buyerIntent += 8;
      reasons.push('브랜드/모델 탐색 의도라 제품 선택 글과 잘 맞음');
      badges.push('브랜드의도');
      break;
    default:
      if (/(추천|후기|리뷰|비교|가격|최저가|할인|쿠폰|구매|순위)/.test(keyword)) {
        buyerIntent += 8;
        reasons.push('구매형 수식어가 포함된 검색어');
        badges.push('구매수식어');
      }
      break;
  }

  const bd = item.scoreBreakdown || {
    coupang: 0,
    sweetSpot: 0,
    priceCentral: 0,
    brand: 0,
    specificity: 0,
    review: 0,
    majorMall: 0,
    penalty: 0,
  };
  if ((bd.sweetSpot || 0) > 0) {
    buyerIntent += 5;
    reasons.push('카테고리 가격 스위트스팟에 들어 전환 장벽 낮음');
  }
  if ((bd.coupang || 0) > 0 || (bd.majorMall || 0) > 0) {
    buyerIntent += 4;
    reasons.push('구매 이동 가능한 신뢰 판매처 신호');
  }

  if (item.brand || item.maker) contentFit += 5;
  if ((bd.specificity || 0) > 0) contentFit += 5;
  if (item.category3 || item.category4) contentFit += 3;
  if ((bd.review || 0) >= 5) contentFit += 4;
  if (item.hprice && item.hprice > item.lprice) contentFit += 2;
  if (contentFit >= 8) reasons.push('브랜드/모델/카테고리 정보가 있어 비교 글 소재가 충분함');

  if ((bd.penalty || 0) < 0) penalty += bd.penalty;
  const itemReasons = productSpecificReasons(item, bd);
  const conversionComponent = clampScore(conversion * 1.1, 0, 55);
  const rawScore = conversionComponent + demand + buyerIntent + contentFit + penalty;
  let opportunityScore = Math.round(clampScore(rawScore) * 10) / 10;

  // "전환 조건은 좋아 보임"만으로 HOT/BYU를 주면 결국 인기상품 나열이 된다.
  // 상품명과 맞물린 자동완성/실시간 시드, 또는 상승 중인 검색어와 직접 일치하는 경우만
  // 작성 우선급까지 허용한다.
  const hasProductDemandEvidence = relatedMatches.length > 0 || crossMatches.length > 0;
  const hasRisingKeywordEvidence = directKeywordMatch && context.recency?.status === 'rising';
  const hasStableKeywordEvidence = directKeywordMatch && context.recency?.status === 'stable';
  if (!hasProductDemandEvidence && !hasRisingKeywordEvidence) {
    const cap = hasStableKeywordEvidence ? 68 : 61;
    if (opportunityScore > cap) {
      opportunityScore = cap;
      reasons.unshift(hasStableKeywordEvidence
        ? '상품 단위 수요 신호는 약하지만 검색 추세가 안정적이라 작성 후보로 제한'
        : '상품 단위 수요 근거가 부족해 작성 우선 대신 검토 후보로 제한');
      badges.push('수요검증필요');
    }
  }
  if (productQuality.reject && opportunityScore > 34) {
    opportunityScore = 34;
    reasons.unshift('쇼핑커넥트 상품성 판정에서 제외해야 할 후보로 감점');
  } else if (!productQuality.isSaleableProduct && opportunityScore > 47) {
    opportunityScore = 47;
    reasons.unshift('판매 가능성 신호가 부족해 관찰 후보로 제한');
  }
  if (context.recency?.status === 'dead' && opportunityScore > 54) {
    opportunityScore = 54;
    reasons.unshift('최근 검색 추세가 죽어 있어 HOT/BÜY 추천에서 제외');
  } else if (context.recency?.status === 'declining' && opportunityScore > 66) {
    opportunityScore = 66;
    reasons.unshift('최근 검색 추세가 하락 중이라 우선순위 제한');
  }

  let grade: ShoppingItem['opportunityGrade'] = 'LOW';
  if (opportunityScore >= 75) grade = 'HOT';
  else if (opportunityScore >= 62) grade = 'BUY';
  else if (opportunityScore >= 48) grade = 'WATCH';

  const matchedSignals = [...crossMatches.map(s => s.seed), ...relatedMatches];
  const prioritizedReasons = Array.from(new Set([
    ...demandEvidence,
    ...reasons,
    ...productQuality.reasons,
    ...itemReasons,
    ...productQuality.penalties.map(reason => `주의: ${reason}`),
  ])).slice(0, 6);

  item.opportunityScore = opportunityScore;
  item.opportunityGrade = grade;
  item.opportunityReasons = prioritizedReasons;
  item.opportunityBadges = Array.from(new Set(badges)).slice(0, 5);
  item.writeRecommendation = buildPersonalizedRecommendation(item, rootKeyword || keyword, grade, demandEvidence, itemReasons);
  item.contentAngles = buildContentAngles(item, keyword, matchedSignals);
  item.opportunityBreakdown = {
    demand: Math.round(demand * 10) / 10,
    buyerIntent: Math.round(buyerIntent * 10) / 10,
    contentFit: Math.round(contentFit * 10) / 10,
    conversion: Math.round(conversionComponent * 10) / 10,
    penalty: Math.round(penalty * 10) / 10,
  };

  return opportunityScore;
}

export function rankShoppingOpportunities(
  items: ShoppingItem[],
  context: ShoppingOpportunityContext,
  limit: number = 10,
  opts?: ConversionScoreOptions
): ShoppingItem[] {
  const safeItems = Array.isArray(items) ? items : [];
  const normal = safeItems.filter(i => i.productType === 1 && i.lprice > 0);
  const judged = normal.filter(item => !judgeShoppingProductOpportunity(item, context).reject);
  const pool = judged.length > 0 ? judged : normal;
  for (const item of pool) attachShoppingOpportunityScore(item, context, opts);

  const ranked = pool.slice().sort(compareShoppingOpportunity);
  if (opts?.balanceDiscovery) {
    return selectBalancedShoppingOpportunities(ranked, limit, opts.maxPerDiscoveryQuery);
  }
  return ranked.slice(0, limit);
}

function compareShoppingOpportunity(a: ShoppingItem, b: ShoppingItem): number {
  const opp = (b.opportunityScore || 0) - (a.opportunityScore || 0);
  if (opp !== 0) return opp;
  const conv = (b.conversionScore || 0) - (a.conversionScore || 0);
  if (conv !== 0) return conv;
  const demand = (b.opportunityBreakdown?.demand || 0) - (a.opportunityBreakdown?.demand || 0);
  if (demand !== 0) return demand;
  return (a.lprice || 0) - (b.lprice || 0);
}

function normalizeDiscoveryGroup(item: ShoppingItem): string {
  const raw = item.discoveryQuery
    || item.category3
    || item.category2
    || item.category1
    || item.cleanTitle
    || item.title
    || 'direct';
  return stripTags(String(raw)).replace(/\s+/g, ' ').trim().toLowerCase() || 'direct';
}

function shoppingItemIdentity(item: ShoppingItem, index: number): string {
  const productId = String(item.productId || '').trim();
  if (productId) return `id:${productId}`;
  const title = stripTags(item.cleanTitle || item.title || '').replace(/\s+/g, ' ').trim();
  const mall = String(item.mallName || '').trim();
  if (title || mall || item.lprice) return `p:${title}|${item.lprice || 0}|${mall}`;
  return `idx:${index}`;
}

export function selectBalancedShoppingOpportunities(
  items: ShoppingItem[],
  limit: number = 10,
  maxPerDiscoveryQuery?: number
): ShoppingItem[] {
  const safeLimit = Math.max(0, Math.floor(limit));
  if (safeLimit <= 0) return [];
  const safeItems = Array.isArray(items) ? items : [];

  const perGroupCap = Math.max(1, Math.floor(
    maxPerDiscoveryQuery ?? Math.max(2, Math.ceil(safeLimit / 8))
  ));
  const ranked = safeItems.slice().sort(compareShoppingOpportunity);
  const selected: ShoppingItem[] = [];
  const selectedIds = new Set<string>();
  const groupCounts = new Map<string, number>();

  const take = (item: ShoppingItem, index: number, enforceCap: boolean) => {
    if (selected.length >= safeLimit) return;
    const id = shoppingItemIdentity(item, index);
    if (selectedIds.has(id)) return;
    const group = normalizeDiscoveryGroup(item);
    const count = groupCounts.get(group) || 0;
    if (enforceCap && count >= perGroupCap) return;
    selected.push(item);
    selectedIds.add(id);
    groupCounts.set(group, count + 1);
  };

  ranked.forEach((item, index) => take(item, index, true));
  if (selected.length < safeLimit) {
    ranked.forEach((item, index) => take(item, index, false));
  }
  return selected.slice(0, safeLimit);
}

export function computeConversionScore(item: ShoppingItem, opts: ConversionScoreOptions = {}): number {
  // v2.42.56: opts 미지정 시 카테고리 기반 sweetspot 자동 적용
  const [autoMin, autoMax] = resolveCategorySweetSpot(item.category1);
  const sweetMin = opts.sweetSpotMin ?? autoMin;
  const sweetMax = opts.sweetSpotMax ?? autoMax;
  const sweetMid = (sweetMin + sweetMax) / 2; // 중앙값 (기본 45000)
  const lowFloor = opts.lowPriceFloor ?? 5000;
  const highCeil = opts.highPriceCeil ?? 500000;

  let coupang = 0, sweetSpot = 0, priceCentral = 0, brand = 0, specificity = 0, review = 0, majorMall = 0, penalty = 0;

  // 쿠팡 우선 (제휴 수익성)
  // v2.43.62: 2팀 — mallName 외에 link 도메인 (coupang.com)도 매칭
  //   쿠팡 마켓플레이스 셀러는 mallName에 셀러 이름이 들어가서 'Coupang' 미매칭 케이스 빈번
  const isCoupang = COUPANG_MALL_NAMES.has(item.mallName) || /coupang\.com/i.test(item.link || '');
  if (isCoupang) coupang = 15;
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

  // v2.43.62: 2팀 권고 — 동점 폴백 순서 교체
  //   이전: reviewCount → 가격 오름차순 (reviewCount 비는 경우가 많아 "싼 상품" 폴백 부작용)
  //   신규: reviewCount → priceCentral → brand → specificity → 가격 오름차순
  const sorted = normal.slice().sort((a, b) => {
    const diff = (b.conversionScore || 0) - (a.conversionScore || 0);
    if (diff !== 0) return diff;
    // 1순위: 리뷰 (있을 때만 의미)
    const rcDiff = (b.reviewCount || 0) - (a.reviewCount || 0);
    if (rcDiff !== 0) return rcDiff;
    // 2순위: priceCentral (중앙값 근접) — 0~5점 소수 가능
    const pcDiff = (b.scoreBreakdown?.priceCentral || 0) - (a.scoreBreakdown?.priceCentral || 0);
    if (pcDiff !== 0) return pcDiff;
    // 3순위: brand 신호
    const brDiff = (b.scoreBreakdown?.brand || 0) - (a.scoreBreakdown?.brand || 0);
    if (brDiff !== 0) return brDiff;
    // 4순위: specificity (모델코드)
    const spDiff = (b.scoreBreakdown?.specificity || 0) - (a.scoreBreakdown?.specificity || 0);
    if (spDiff !== 0) return spDiff;
    // 마지막: 가격 오름차순
    return a.lprice - b.lprice;
  });

  return sorted.slice(0, limit);
}
