/**
 * 쇼핑 커넥트 — 상품 기반 키워드 인사이트 분석 (v2.2.6)
 *
 * 목적: 네이버 쇼핑 검색 결과에서 **키워드 도구 관점**의 인사이트 추출
 *       (글 작성 템플릿이 아니라 키워드 발굴이 본질)
 *
 * 출력:
 *  - 상품명 롱테일 키워드 (빈도 기반)
 *  - 카테고리별 키워드 (대/중/소)
 *  - 브랜드 키워드 Top N
 *  - 가격대별 키워드 (저가/중가/고가 구간에서 자주 등장하는 단어)
 *  - 판매처 분포
 *  - 경쟁도 지표 (상품 수 / 브랜드 다양성)
 */

import type { ShoppingItem } from './naver-shopping-api';

// ============================================================
// 1. 공통: 단어 추출
// ============================================================

const STOP_WORDS = new Set([
  // 접속사·지시어
  '그리고', '또한', '하지만', '이것', '저것', '무엇', '어디', '이거', '저거',
  // 판매 문구 (쇼핑 특유)
  '세트', '패키지', '정품', '새상품', '국내', '정식', '발매', '당일발송',
  '무료배송', '당일배송', '빠른배송', '할인', '특가', '이벤트', '사은품',
  '증정', '공식', '공식몰', '정식판매', '한정', '한정판매', '최저가', '단독',
  '신상품', '신제품', '신규', '출시', '런칭', '오픈', '기획전',
  // 범용 형용사/부사 (블로그 타이틀 가치 낮음)
  '가능', '좋은', '예쁜', '깔끔한', '편리한', '실용적', '고급', '프리미엄',
  '다양한', '선택', '준비', '제공', '활용', '적합', '추천드립니다',
  // 수량·단위
  '개입', '매입', '팩', '박스', 'set', 'pack', 'box',
  // 영문 범용
  'the', 'and', 'for', 'with', 'new', 'best', 'hot', 'top',
  'kr', 'ko', 'korea', 'official',
]);

/**
 * 검색의도 어미 (PRO 헌터 v2.9.1 writable gate와 동일)
 */
const INTENT_SUFFIX_RE = /(추천|후기|리뷰|비교|순위|방법|사용법|뜻|차이|장단점|원인|증상|효과|부작용|가격|쿠폰|할인|신청|가입|예약|렌탈|구매|종류)$/;

const INTENT_SUFFIXES_FOR_EXPANSION = ['추천', '후기', '비교', '순위', '가격', '사용법'];

/**
 * 블로그 집필 가능 키워드 판정 (PRO 헌터 v2.9.1 호환)
 *  - 2토큰 이상 롱테일 OR 검색의도 어미 OR 저경쟁 고유명사
 */
export function isWritableShoppingKeyword(keyword: string): boolean {
  if (!keyword || keyword.length < 3) return false;
  const tokens = keyword.trim().split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) return true;
  if (INTENT_SUFFIX_RE.test(keyword)) return true;
  // 단일 토큰 5자+ (브랜드명·제품명 가능성) 허용
  if (tokens.length === 1 && keyword.length >= 5) return true;
  return false;
}

/**
 * 단독 범용 토큰 블랙리스트 (결과에 단독으로 튀어나오면 무의미)
 */
const STANDALONE_BLOCK = new Set([
  '추천', '후기', '리뷰', '비교', '순위', '방법', '가격', '정리', '총정리',
  '꿀팁', '브랜드', '사이즈', '정보', '상품', '제품', '물건',
]);

function tokenizeTitle(title: string): string[] {
  if (!title) return [];
  return title
    .replace(/[^가-힣a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(w => {
      if (w.length < 2) return false;
      if (/^\d+$/.test(w)) return false;
      if (STOP_WORDS.has(w.toLowerCase())) return false;
      return true;
    });
}

function countWords(texts: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const t of texts) {
    for (const w of tokenizeTitle(t)) {
      freq.set(w, (freq.get(w) || 0) + 1);
    }
  }
  return freq;
}

/**
 * 2-3단어 구문 추출 (bi-gram / tri-gram)
 * 블로그 제목으로 쓸 만한 실제 검색 가능 구문 생성
 *
 * 예: "오픈형 블루투스 이어폰" → ["오픈형 블루투스", "블루투스 이어폰", "오픈형 블루투스 이어폰"]
 */
function countPhrases(texts: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const t of texts) {
    const tokens = tokenizeTitle(t);
    // bi-gram
    for (let i = 0; i < tokens.length - 1; i++) {
      const phrase = `${tokens[i]} ${tokens[i + 1]}`;
      // 구문 길이 제한 (너무 길지 않게)
      if (phrase.length > 30) continue;
      freq.set(phrase, (freq.get(phrase) || 0) + 1);
    }
    // tri-gram (빈도 2+ 필터에서 검증력 충분)
    for (let i = 0; i < tokens.length - 2; i++) {
      const phrase = `${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`;
      if (phrase.length > 40) continue;
      freq.set(phrase, (freq.get(phrase) || 0) + 1);
    }
  }
  return freq;
}

function topN(freq: Map<string, number>, limit: number): Array<{ keyword: string; count: number }> {
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([keyword, count]) => ({ keyword, count }));
}

// ============================================================
// 2. 롱테일 키워드 (기본)
// ============================================================

export function extractLongtailKeywords(
  items: ShoppingItem[],
  limit: number = 20,
  excludeTerms: string[] = []
): Array<{ keyword: string; count: number }> {
  // 원 검색어 토큰은 롱테일에서 제외 (사용자에게 반복 정보 제공 방지)
  const excludeTokens = new Set<string>();
  const excludeLowerFull = new Set<string>();
  for (const term of excludeTerms) {
    excludeLowerFull.add(term.toLowerCase().trim());
    for (const tok of tokenizeTitle(term)) {
      excludeTokens.add(tok.toLowerCase());
    }
  }

  const titles = items.map(i => i.title || '');

  // 2-3단어 구문 빈도 (블로그 제목 실사용 가능)
  const phraseFreq = countPhrases(titles);
  for (const p of Array.from(phraseFreq.keys())) {
    // 원 검색어 자체와 동일하면 제외
    if (excludeLowerFull.has(p.toLowerCase())) phraseFreq.delete(p);
    else {
      const pTokens = p.split(' ');
      if (pTokens.every(t => excludeTokens.has(t.toLowerCase()))) phraseFreq.delete(p);
    }
  }

  // 🔥 writable gate + 단독 블랙리스트 필터 (PRO 헌터 v2.9.1 수준)
  const goodPhrases = Array.from(phraseFreq.entries())
    .filter(([kw, c]) => {
      if (c < 2) return false;                                    // 빈도 2+
      if (!isWritableShoppingKeyword(kw)) return false;           // 집필 가능성
      const tokens = kw.split(/\s+/);
      if (tokens.length === 1 && STANDALONE_BLOCK.has(kw)) return false;
      return true;
    })
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([keyword, count]) => ({ keyword, count }));

  return goodPhrases;
}

/**
 * 🔥 검색의도 확장 — 상위 구문에 +추천/+후기/+비교 변형 자동 생성
 *   (블로그 글 제목에 바로 쓸 수 있는 완성형 키워드 세트 제공)
 *
 * 입력: extractLongtailKeywords 결과
 * 출력: 원본 + 각 키워드의 6가지 의도 변형
 */
export function expandWithIntentSuffixes(
  baseKeywords: Array<{ keyword: string; count: number }>,
  excludeTerms: string[] = []
): Array<{ keyword: string; count: number; variant?: string; base?: string }> {
  const result: Array<{ keyword: string; count: number; variant?: string; base?: string }> = [];
  const seen = new Set<string>();

  const excludeLowerFull = new Set(excludeTerms.map(t => t.toLowerCase().trim()));

  for (const { keyword, count } of baseKeywords) {
    if (!seen.has(keyword.toLowerCase())) {
      seen.add(keyword.toLowerCase());
      // 원본이 이미 의도 어미 포함이면 variant 라벨만
      result.push({ keyword, count, variant: INTENT_SUFFIX_RE.test(keyword) ? 'intent' : 'base' });
    }

    // 원본이 이미 의도 어미로 끝나면 변형 불필요
    if (INTENT_SUFFIX_RE.test(keyword)) continue;

    // 상위 12개에만 변형 생성 (API 호출 아껴야)
    if (result.length > 40) break;

    for (const suffix of INTENT_SUFFIXES_FOR_EXPANSION) {
      const variant = `${keyword} ${suffix}`;
      const lower = variant.toLowerCase();
      if (seen.has(lower) || excludeLowerFull.has(lower)) continue;
      seen.add(lower);
      // 변형은 원본 count 보존 (의도 확장은 별개)
      result.push({ keyword: variant, count, variant: suffix, base: keyword });
    }
  }

  return result;
}

// ============================================================
// 3. 카테고리 키워드 (대/중/소 분류)
// ============================================================

export interface CategoryInsight {
  name: string;
  count: number;
  pct: number;
}

export function extractCategoryKeywords(
  items: ShoppingItem[]
): { level1: CategoryInsight[]; level2: CategoryInsight[]; level3: CategoryInsight[] } {
  const c1 = new Map<string, number>();
  const c2 = new Map<string, number>();
  const c3 = new Map<string, number>();

  for (const item of items) {
    if (item.category1) c1.set(item.category1, (c1.get(item.category1) || 0) + 1);
    if (item.category2) c2.set(item.category2, (c2.get(item.category2) || 0) + 1);
    if (item.category3) c3.set(item.category3, (c3.get(item.category3) || 0) + 1);
  }

  const total = items.length || 1;
  const toInsight = (m: Map<string, number>, lim: number): CategoryInsight[] =>
    Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, lim)
      .map(([name, count]) => ({ name, count, pct: Math.round((count / total) * 1000) / 10 }));

  return {
    level1: toInsight(c1, 5),
    level2: toInsight(c2, 8),
    level3: toInsight(c3, 10),
  };
}

// ============================================================
// 4. 브랜드 키워드
// ============================================================

export function extractBrandKeywords(
  items: ShoppingItem[],
  limit: number = 10
): Array<{ brand: string; count: number; avgPrice: number }> {
  const brandMap = new Map<string, { count: number; totalPrice: number }>();

  for (const item of items) {
    const brand = (item.brand || item.maker || '').trim();
    if (!brand) continue;
    const cur = brandMap.get(brand) || { count: 0, totalPrice: 0 };
    cur.count++;
    cur.totalPrice += item.lprice || 0;
    brandMap.set(brand, cur);
  }

  return Array.from(brandMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([brand, stats]) => ({
      brand,
      count: stats.count,
      avgPrice: Math.round(stats.totalPrice / stats.count),
    }));
}

// ============================================================
// 5. 가격대별 키워드 (저가/중가/고가 구간에서 자주 등장하는 단어)
// ============================================================

export interface PriceTierKeywords {
  low: Array<{ keyword: string; count: number }>;
  mid: Array<{ keyword: string; count: number }>;
  high: Array<{ keyword: string; count: number }>;
  boundaries: { lowMax: number; highMin: number };
}

export function extractPriceTierKeywords(items: ShoppingItem[]): PriceTierKeywords {
  const priced = items.filter(i => i.lprice > 0);
  if (priced.length === 0) {
    return { low: [], mid: [], high: [], boundaries: { lowMax: 0, highMin: 0 } };
  }

  const sorted = priced.slice().sort((a, b) => a.lprice - b.lprice);
  const lowMax = sorted[Math.floor(sorted.length * 0.33)].lprice;
  const highMin = sorted[Math.floor(sorted.length * 0.67)].lprice;

  const lowItems = priced.filter(i => i.lprice <= lowMax);
  const midItems = priced.filter(i => i.lprice > lowMax && i.lprice < highMin);
  const highItems = priced.filter(i => i.lprice >= highMin);

  return {
    low: topN(countWords(lowItems.map(i => i.title || '')), 10),
    mid: topN(countWords(midItems.map(i => i.title || '')), 10),
    high: topN(countWords(highItems.map(i => i.title || '')), 10),
    boundaries: { lowMax, highMin },
  };
}

// ============================================================
// 6. 가격 분석 + 판매처 분포
// ============================================================

export interface PriceAnalysis {
  min: number;
  max: number;
  median: number;
  avg: number;
  mallDistribution: Array<{ mall: string; count: number; pct: number }>;
}

export function analyzePrices(items: ShoppingItem[]): PriceAnalysis {
  const prices = items.map(i => i.lprice).filter(p => p > 0).sort((a, b) => a - b);
  if (prices.length === 0) {
    return { min: 0, max: 0, median: 0, avg: 0, mallDistribution: [] };
  }

  const median = prices[Math.floor(prices.length / 2)];
  const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);

  const mallCount = new Map<string, number>();
  for (const item of items) {
    const mall = item.mallName || '기타';
    mallCount.set(mall, (mallCount.get(mall) || 0) + 1);
  }
  const total = items.length || 1;
  const mallDistribution = Array.from(mallCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([mall, count]) => ({ mall, count, pct: Math.round((count / total) * 1000) / 10 }));

  return {
    min: prices[0],
    max: prices[prices.length - 1],
    median,
    avg,
    mallDistribution,
  };
}

// ============================================================
// 7. 경쟁도 지표
// ============================================================

export interface CompetitionSignal {
  totalHits: number;        // 네이버 쇼핑 전체 검색 결과 수
  uniqueBrands: number;     // 고유 브랜드 수
  uniqueMalls: number;      // 고유 판매처 수
  concentration: number;    // HHI 유사 지표 (0~100) — 높을수록 과점
  verdict: '저경쟁 (블루오션)' | '중경쟁' | '고경쟁' | '과점';
}

export function analyzeCompetition(items: ShoppingItem[], totalHits: number): CompetitionSignal {
  const brands = new Set<string>();
  const malls = new Set<string>();
  for (const item of items) {
    if (item.brand) brands.add(item.brand);
    else if (item.maker) brands.add(item.maker);
    if (item.mallName) malls.add(item.mallName);
  }

  // 판매처 집중도 (상위 2곳 점유율)
  const mallCount = new Map<string, number>();
  for (const item of items) {
    const m = item.mallName || '기타';
    mallCount.set(m, (mallCount.get(m) || 0) + 1);
  }
  const sortedMalls = Array.from(mallCount.values()).sort((a, b) => b - a);
  const top2Share = items.length > 0
    ? ((sortedMalls[0] || 0) + (sortedMalls[1] || 0)) / items.length
    : 0;
  const concentration = Math.round(top2Share * 100);

  // 판매처 집중도가 높으면(상위 2곳이 70%+) totalHits 상관없이 '과점' 우선 판정
  // 그 다음 상품 수 기준
  let verdict: CompetitionSignal['verdict'];
  if (concentration >= 70 && items.length >= 5) verdict = '과점';
  else if (totalHits < 500) verdict = '저경쟁 (블루오션)';
  else if (totalHits < 5000) verdict = '중경쟁';
  else verdict = '고경쟁';

  return {
    totalHits,
    uniqueBrands: brands.size,
    uniqueMalls: malls.size,
    concentration,
    verdict,
  };
}

// ============================================================
// 8. 통합 analyze
// ============================================================

export interface ShoppingKeywordInsight {
  longtailKeywords: Array<{ keyword: string; count: number }>;
  categories: { level1: CategoryInsight[]; level2: CategoryInsight[]; level3: CategoryInsight[] };
  brands: Array<{ brand: string; count: number; avgPrice: number }>;
  priceTiers: PriceTierKeywords;
  priceAnalysis: PriceAnalysis;
  competition: CompetitionSignal;
  summary: string;  // 자동 생성 요약 문장 (블로그 도입부용)
}

function formatPrice(p: number): string {
  if (p >= 10000) return `${Math.round(p / 1000) / 10}만원`;
  if (p >= 1000) return `${Math.round(p / 100) / 10}천원`;
  return `${p}원`;
}

function buildSummary(params: {
  keyword: string;
  totalHits: number;
  verdict: CompetitionSignal['verdict'];
  uniqueBrands: number;
  avgPrice: number;
  median: number;
  topBrands: Array<{ brand: string; count: number }>;
  topCategory?: string;
}): string {
  const { keyword, totalHits, verdict, uniqueBrands, avgPrice, median, topBrands, topCategory } = params;

  // 시장 규모
  const sizeStr = totalHits >= 100000 ? `대규모 시장(${Math.round(totalHits / 10000)}만건)`
                 : totalHits >= 10000 ? `중간 규모 시장(${Math.round(totalHits / 1000) / 10}만건)`
                 : totalHits >= 1000 ? `소규모 시장(${totalHits.toLocaleString()}건)`
                 : `틈새 시장(${totalHits}건)`;

  // 경쟁도 가이드
  const competeGuide: Record<CompetitionSignal['verdict'], string> = {
    '저경쟁 (블루오션)': '비교적 진입하기 쉽고 초보 블로거에게도 기회가 있습니다',
    '중경쟁': '경쟁은 있으나 콘텐츠 차별화로 상위 노출 가능합니다',
    '고경쟁': '경쟁이 치열해 전문성 있는 리뷰나 비교글이 유리합니다',
    '과점': '소수 판매처가 시장을 지배 중 — 중소 브랜드·신상품 중심 공략이 효과적입니다',
  };

  // 브랜드 TOP 3 (있을 때만)
  const brandStr = topBrands.length >= 3
    ? `주요 브랜드는 ${topBrands.slice(0, 3).map(b => b.brand).join('·')}입니다. `
    : topBrands.length > 0
    ? `주요 브랜드는 ${topBrands.map(b => b.brand).join('·')}입니다. `
    : '';

  // 카테고리
  const catStr = topCategory ? `주로 "${topCategory}" 카테고리에 분포하며, ` : '';

  // 가격대
  const priceStr = avgPrice > 0
    ? `평균가 ${formatPrice(avgPrice)}, 중간값 ${formatPrice(median)}. `
    : '';

  return `"${keyword}"는 ${sizeStr}이며, ${uniqueBrands}개 브랜드가 경쟁 중입니다. ${catStr}${priceStr}${brandStr}${competeGuide[verdict]}.`;
}

export function analyzeShoppingKeywords(
  items: ShoppingItem[],
  totalHits: number,
  searchKeyword?: string
): ShoppingKeywordInsight {
  const excludeTerms = searchKeyword ? [searchKeyword] : [];
  const longtailKeywords = extractLongtailKeywords(items, 20, excludeTerms);
  const categories = extractCategoryKeywords(items);
  const brands = extractBrandKeywords(items, 10);
  const priceTiers = extractPriceTierKeywords(items);
  const priceAnalysis = analyzePrices(items);
  const competition = analyzeCompetition(items, totalHits);

  const summary = buildSummary({
    keyword: searchKeyword || '',
    totalHits,
    verdict: competition.verdict,
    uniqueBrands: competition.uniqueBrands,
    avgPrice: priceAnalysis.avg,
    median: priceAnalysis.median,
    topBrands: brands.slice(0, 3).map(b => ({ brand: b.brand, count: b.count })),
    topCategory: categories.level1[0]?.name,
  });

  return {
    longtailKeywords,
    categories,
    brands,
    priceTiers,
    priceAnalysis,
    competition,
    summary,
  };
}
