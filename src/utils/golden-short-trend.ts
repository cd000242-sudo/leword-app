/** Daily DataLab relative demand; deliberately independent of the monthly seasonality model. */
export interface GoldenShortTrend {
  status: 'rising' | 'flat' | 'falling' | 'unknown';
  ratio: number | null;
  measuredAt: string | null;
  windowEnd: string | null;
  series: Array<{ period: string; ratio: number }>;
}

const DAY = 86400000;
const MAX_HORIZON_AGE_DAYS = 3;
function dateMs(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms : NaN;
}

export function unknownGoldenShortTrend(measuredAt: string | null = null, windowEnd: string | null = null): GoldenShortTrend {
  return { status: 'unknown', ratio: null, measuredAt, windowEnd, series: [] };
}

export function classifyGoldenShortTrend(
  points: Array<{ period: string; ratio: number }>, horizon: string | null,
  measuredAt: string, nowMs = Date.now(),
): GoldenShortTrend {
  const at = Date.parse(measuredAt);
  const end = dateMs(horizon);
  const today = Math.floor((nowMs + 9 * 3600000) / DAY) * DAY;
  const validMeasurement = Number.isFinite(at) && at <= nowMs && nowMs - at <= MAX_HORIZON_AGE_DAYS * DAY;
  const unknown = unknownGoldenShortTrend(validMeasurement ? measuredAt : null, Number.isFinite(end) ? horizon : null);
  if (!validMeasurement || !Number.isFinite(end) || end >= today || today - end > MAX_HORIZON_AGE_DAYS * DAY) return unknown;
  const byDate = new Map<string, number>();
  for (const point of points) {
    if (!point || typeof point !== 'object') return unknown;
    const time = dateMs(point.period);
    if (!Number.isFinite(time) || !Number.isFinite(point.ratio) || point.ratio < 0 || point.ratio > 100) return unknown;
    if (time > end) continue; // Today may be returned before its aggregation is complete.
    if (byDate.has(point.period)) return unknown;
    byDate.set(point.period, point.ratio);
  }
  const series: GoldenShortTrend['series'] = [];
  for (let daysAgo = 13; daysAgo >= 0; daysAgo -= 1) {
    const period = new Date(end - daysAgo * DAY).toISOString().slice(0, 10);
    const ratio = byDate.get(period);
    if (ratio === undefined) return unknown; // Never fill missing measurements here.
    series.push({ period, ratio });
  }
  const previous = series.slice(0, 7).reduce((sum, p) => sum + p.ratio, 0);
  const recent = series.slice(7).reduce((sum, p) => sum + p.ratio, 0);
  if (previous === 0) return { ...unknown, series };
  const ratio = recent / previous;
  return {
    status: ratio >= 1.2 ? 'rising' : ratio <= 0.8 ? 'falling' : 'flat',
    ratio: Math.round(ratio * 10000) / 10000, measuredAt, windowEnd: horizon, series,
  };
}

/** A carried badge must remain supported by recent original evidence, not the new publication time. */
export function retainGoldenShortTrend(value: any, nowMs = Date.now()): GoldenShortTrend {
  if (!value || !Array.isArray(value.series) || typeof value.measuredAt !== 'string') return unknownGoldenShortTrend();
  return classifyGoldenShortTrend(value.series, value.windowEnd, value.measuredAt, nowMs);
}

export function shortTrendCandidates<T extends { measuredAt?: string | null; shortTermTrend?: unknown }>(
  rows: T[], nowMs: number, budget: number,
): T[] {
  const limit = Number.isFinite(budget) ? Math.max(0, Math.floor(budget)) : 0;
  return rows.filter(row => {
    const at = Date.parse(row.measuredAt || '');
    return Number.isFinite(at) && at <= nowMs && nowMs - at <= 7 * DAY
      && retainGoldenShortTrend(row.shortTermTrend, nowMs).status === 'unknown';
  }).slice(0, limit);
}
