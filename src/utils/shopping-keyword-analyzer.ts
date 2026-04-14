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
  '그리고', '또한', '하지만', '이것', '저것', '무엇', '어디',
  '세트', '패키지', '정품', '새상품', '국내', '정식', '발매', '당일발송',
  '무료배송', '당일배송', '빠른배송', '할인', '특가', '이벤트', '사은품',
  'the', 'and', 'for', 'with', 'new', 'set', 'pack',
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
  limit: number = 20
): Array<{ keyword: string; count: number }> {
  return topN(countWords(items.map(i => i.title || '')), limit);
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

  let verdict: CompetitionSignal['verdict'];
  if (totalHits < 500) verdict = '저경쟁 (블루오션)';
  else if (totalHits < 5000) verdict = '중경쟁';
  else if (concentration >= 70) verdict = '과점';
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
}

export function analyzeShoppingKeywords(
  items: ShoppingItem[],
  totalHits: number
): ShoppingKeywordInsight {
  return {
    longtailKeywords: extractLongtailKeywords(items, 20),
    categories: extractCategoryKeywords(items),
    brands: extractBrandKeywords(items, 10),
    priceTiers: extractPriceTierKeywords(items),
    priceAnalysis: analyzePrices(items),
    competition: analyzeCompetition(items, totalHits),
  };
}
