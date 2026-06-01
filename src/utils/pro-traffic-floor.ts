export const PRO_TRAFFIC_CATEGORY_SSS_FLOOR = 30;
export const PRO_TRAFFIC_MIN_RESULT_COUNT = 5;
export const PRO_TRAFFIC_MAX_RESULT_COUNT = 250;

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
  const count = Math.max(PRO_TRAFFIC_MIN_RESULT_COUNT, Math.floor(Number(requestedCount) || 0));
  return explosionMode
    ? Math.min(Math.max(count * 25, 300), Math.max(500, count * 4))
    : Math.min(Math.max(count * 10, 100), Math.max(200, count * 4));
}
