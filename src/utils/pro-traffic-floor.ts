export const PRO_TRAFFIC_CATEGORY_SSS_FLOOR = 30;
export const PRO_TRAFFIC_MIN_RESULT_COUNT = PRO_TRAFFIC_CATEGORY_SSS_FLOOR;
export const PRO_TRAFFIC_MAX_RESULT_COUNT = 250;
export const PRO_TRAFFIC_CATEGORY_SEED_BUDGET_FLOOR = 420;
export const PRO_TRAFFIC_CATEGORY_SEED_TARGET_MAX = 900;

export interface ProTrafficFloorLike {
  keyword: string;
  grade?: string | null;
  searchVolume?: number | null;
  documentCount?: number | null;
  goldenRatio?: number | null;
  totalScore?: number | null;
  profitAnalysis?: {
    profitGoldenRatio?: number | null;
    estimatedMonthlyRevenue?: number | null;
    purchaseIntentScore?: number | null;
  } | null;
  revenueEstimate?: {
    estimatedCPC?: number | null;
    revenueGrade?: string | null;
  } | null;
}

export function normalizeProTrafficResultCount(
  mode: string | undefined | null,
  requestedCount: number | undefined | null,
  fallbackCount = PRO_TRAFFIC_CATEGORY_SSS_FLOOR,
): number {
  const raw = Number(requestedCount);
  const base = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallbackCount;
  const floor = mode === 'category' ? PRO_TRAFFIC_CATEGORY_SSS_FLOOR : PRO_TRAFFIC_MIN_RESULT_COUNT;
  return Math.min(Math.max(base, floor), PRO_TRAFFIC_MAX_RESULT_COUNT);
}

export function getProTrafficFinalRerankPoolSize(
  requestedCount: number,
  explosionMode = false,
): number {
  const count = Math.min(
    PRO_TRAFFIC_MAX_RESULT_COUNT,
    Math.max(PRO_TRAFFIC_MIN_RESULT_COUNT, Math.floor(Number(requestedCount) || 0)),
  );

  return explosionMode
    ? Math.max(500, count * 10)
    : Math.max(PRO_TRAFFIC_CATEGORY_SSS_FLOOR * 12, count * 8);
}

export function getProTrafficCategoryMiningPoolSize(
  requestedCount: number,
  explosionMode = false,
): number {
  const count = normalizeProTrafficResultCount('category', requestedCount);
  return Math.max(count, getProTrafficFinalRerankPoolSize(count, explosionMode));
}

export function getProTrafficCategoryGoldenSeedBudget(requestedCount: number): number {
  const count = normalizeProTrafficResultCount('category', requestedCount);
  return Math.max(PRO_TRAFFIC_CATEGORY_SEED_BUDGET_FLOOR, count * 8);
}

export function getProTrafficCategoryDiscoverySeedBudget(requestedCount: number): number {
  const count = normalizeProTrafficResultCount('category', requestedCount);
  return Math.max(PRO_TRAFFIC_CATEGORY_SEED_BUDGET_FLOOR, count * 6);
}

export function getProTrafficCategoryNormalSeedTarget(requestedCount: number): number {
  const count = normalizeProTrafficResultCount('category', requestedCount);
  return Math.min(
    PRO_TRAFFIC_CATEGORY_SEED_TARGET_MAX,
    Math.max(PRO_TRAFFIC_CATEGORY_SEED_BUDGET_FLOOR, Math.ceil(count * 2.4)),
  );
}

function compactKeyword(keyword: string): string {
  return String(keyword || '').toLowerCase().replace(/\s+/g, '').trim();
}

function gradeRank(grade: unknown): number {
  const g = String(grade || '').toUpperCase();
  if (g === 'SSS') return 6;
  if (g === 'SS') return 5;
  if (g === 'S') return 4;
  if (g === 'A') return 3;
  if (g === 'B') return 2;
  return 1;
}

export function countProTrafficSss<T extends ProTrafficFloorLike>(items: T[]): number {
  return (items || []).filter(item => String(item.grade || '').toUpperCase() === 'SSS').length;
}

function hasPositiveMeasuredMetrics(item: ProTrafficFloorLike): boolean {
  return typeof item.searchVolume === 'number'
    && item.searchVolume > 0
    && typeof item.documentCount === 'number'
    && item.documentCount > 0
    && typeof item.goldenRatio === 'number'
    && item.goldenRatio > 0;
}

export function selectProTrafficSssPromotionCandidates<T extends ProTrafficFloorLike>(
  rankedCandidates: T[],
  requestedCount: number,
  categoryMode: boolean,
  canPromoteToSss: (item: T) => boolean,
): T[] {
  const target = normalizeProTrafficResultCount(
    categoryMode ? 'category' : 'realtime',
    requestedCount,
    categoryMode ? PRO_TRAFFIC_CATEGORY_SSS_FLOOR : PRO_TRAFFIC_MIN_RESULT_COUNT,
  );

  const selected: T[] = [];
  const seen = new Set<string>();

  for (const item of rankedCandidates || []) {
    if (selected.length >= target) break;
    const key = compactKeyword(item?.keyword || '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (!hasPositiveMeasuredMetrics(item)) continue;
    if (!canPromoteToSss(item)) continue;
    selected.push(item);
  }

  return selected;
}

export function rankProTrafficSssFloorResults<T extends ProTrafficFloorLike>(
  items: T[],
  requestedCount: number,
  categoryMode = false,
): T[] {
  if (!items || items.length === 0) return [];

  const target = normalizeProTrafficResultCount(
    categoryMode ? 'category' : 'realtime',
    requestedCount,
    categoryMode ? PRO_TRAFFIC_CATEGORY_SSS_FLOOR : PRO_TRAFFIC_MIN_RESULT_COUNT,
  );

  const sorted = [...items].sort((a, b) => {
    const gradeDiff = gradeRank(b.grade) - gradeRank(a.grade);
    if (gradeDiff !== 0) return gradeDiff;

    const ratioDiff = (b.goldenRatio || 0) - (a.goldenRatio || 0);
    if (Math.abs(ratioDiff) > 0.0001) return ratioDiff;

    const profitRatioDiff = (b.profitAnalysis?.profitGoldenRatio || 0) - (a.profitAnalysis?.profitGoldenRatio || 0);
    if (Math.abs(profitRatioDiff) > 0.0001) return profitRatioDiff;

    const purchaseDiff = (b.profitAnalysis?.purchaseIntentScore || 0) - (a.profitAnalysis?.purchaseIntentScore || 0);
    if (purchaseDiff !== 0) return purchaseDiff;

    const cpcDiff = (b.revenueEstimate?.estimatedCPC || 0) - (a.revenueEstimate?.estimatedCPC || 0);
    if (Math.abs(cpcDiff) > 0.1) return cpcDiff;

    const dcA = typeof a.documentCount === 'number' && a.documentCount > 0 ? a.documentCount : Number.MAX_SAFE_INTEGER;
    const dcB = typeof b.documentCount === 'number' && b.documentCount > 0 ? b.documentCount : Number.MAX_SAFE_INTEGER;
    if (dcA !== dcB) return dcA - dcB;

    const svDiff = (b.searchVolume || 0) - (a.searchVolume || 0);
    if (svDiff !== 0) return svDiff;

    return (b.totalScore || 0) - (a.totalScore || 0);
  });

  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of sorted) {
    const key = compactKeyword(item.keyword);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
    if (unique.length >= target) break;
  }

  return unique;
}
