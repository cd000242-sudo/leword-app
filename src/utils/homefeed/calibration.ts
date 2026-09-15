/**
 * 성과학습 · 보정 표 — 발행 뒤 T+30m/2h/6h/24h 에 사용자가 적은 실측을 패턴별로 모은다.
 *
 * 표본 규칙(명령서): n < 5 = '표본 부족'(수치 숨김) · n < 20 = 개수와 중앙값만(비율 금지) · n ≥ 20 = 진입 비율 · 중앙값 · p25/p75.
 * 임계값을 스스로 바꾸지 않는다 — 표는 사장님이 관리자 설정을 고칠 근거일 뿐이다.
 * '진입' = 24시간 체크포인트에 추천 유입이 1 이상이거나 피드에서 직접 확인한 글.
 */
import type { HomefeedCheckpoint, HomefeedPerformanceEntry, HomefeedPost } from './types';
import { HOMEFEED_FLOORS, type HomefeedSettings } from './settings';

export type CalibrationDimension = 'storyPattern' | 'triggerType' | 'visualStrategy' | 'thumbnailType' | 'windowAtPublish';

export const CALIBRATION_DIMENSIONS: readonly CalibrationDimension[] = ['storyPattern', 'triggerType', 'visualStrategy', 'thumbnailType', 'windowAtPublish'];

export interface CalibrationGroup {
  dimension: CalibrationDimension;
  value: string;
  n: number;
  display: 'sample_short' | 'counts' | 'rates';
  entered: number | null;
  medianRecommend24h: number | null;
  p25: number | null;
  p75: number | null;
  entryRate: number | null;
}

export interface CalibrationSummary {
  totalPosts: number;
  measured24h: number;
  thresholds: { sampleShortN: number; successRateMinN: number };
  groups: CalibrationGroup[];
}

/** 같은 글 · 같은 체크포인트에 여러 번 적었으면 마지막 기록을 쓴다. */
export function latestEntry(entries: readonly HomefeedPerformanceEntry[], postId: string, checkpoint: HomefeedCheckpoint): HomefeedPerformanceEntry | null {
  return entries
    .filter((entry) => entry.postId === postId && entry.checkpoint === checkpoint)
    .sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt))[0] ?? null;
}

/** 가장 가까운 순위(nearest-rank) 분위수. 값이 없으면 null. */
export function quantile(values: readonly number[], q: number): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const rank = Math.max(1, Math.ceil(q * sorted.length));
  return sorted[Math.min(sorted.length, rank) - 1];
}

function valueOf(post: HomefeedPost, dimension: CalibrationDimension): string {
  if (dimension === 'windowAtPublish') return post.atPublish.window;
  return String(post[dimension] ?? '미기록');
}

export function summarizeCalibration(
  posts: readonly HomefeedPost[],
  entries: readonly HomefeedPerformanceEntry[],
  settings: Pick<HomefeedSettings, 'calibration'>,
): CalibrationSummary {
  const sampleShortN = Math.max(HOMEFEED_FLOORS.sampleShortN, settings.calibration.sampleShortN);
  const successRateMinN = Math.max(HOMEFEED_FLOORS.successRateMinN, settings.calibration.successRateMinN);
  const measured = posts
    .map((post) => ({ post, day: latestEntry(entries, post.id, '24h') }))
    .filter((row): row is { post: HomefeedPost; day: HomefeedPerformanceEntry } => row.day !== null);

  const groups: CalibrationGroup[] = [];
  for (const dimension of CALIBRATION_DIMENSIONS) {
    const buckets = new Map<string, HomefeedPerformanceEntry[]>();
    for (const row of measured) {
      const key = valueOf(row.post, dimension);
      buckets.set(key, [...(buckets.get(key) ?? []), row.day]);
    }
    for (const [value, days] of buckets) {
      const n = days.length;
      if (n < sampleShortN) {
        groups.push({ dimension, value, n, display: 'sample_short', entered: null, medianRecommend24h: null, p25: null, p75: null, entryRate: null });
        continue;
      }
      const entered = days.filter((day) => (day.recommendViews ?? 0) > 0 || day.feedSeen === true).length;
      const recommend = days.map((day) => day.recommendViews).filter((views): views is number => typeof views === 'number');
      if (n < successRateMinN) {
        groups.push({ dimension, value, n, display: 'counts', entered, medianRecommend24h: quantile(recommend, 0.5), p25: null, p75: null, entryRate: null });
        continue;
      }
      groups.push({
        dimension,
        value,
        n,
        display: 'rates',
        entered,
        medianRecommend24h: quantile(recommend, 0.5),
        p25: quantile(recommend, 0.25),
        p75: quantile(recommend, 0.75),
        entryRate: Math.round((entered / n) * 1000) / 1000,
      });
    }
  }
  return { totalPosts: posts.length, measured24h: measured.length, thresholds: { sampleShortN, successRateMinN }, groups };
}
