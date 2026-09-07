/**
 * 발행 순서 — **곧 터질 것을 앞에, 상위가 꽉 찬 것은 뒤로.**
 *
 * 사장님 실측(2026-09-07): 검색량 큰 순으로 세우니 앞줄 5개가 전부 비율 1.0~2.7
 * 레드오션이었다(주민세 납부기간 검색 27,110 · 문서 26,916). 정작 쓸 만한 '기아 ev7'
 * (5,250/600) 은 11위로 밀렸다. 그리고 27,110 은 8월 피크의 3% 였다 — 화면이 지금 달
 * 숫자만 보여 주니 "지금 쓸 키워드"로 읽히는데, 실은 "내년 7월에 써야 할 키워드"다.
 *
 * 여기서 만드는 숫자는 전부 실측 두 개의 단순 산술이다:
 *   peakMonth      12개월 중 최고치가 있던 달
 *   peakMultiplier 최고치 ÷ 평소(12개월 중앙값). "평소의 30배"
 *   peakRecurring  재작년에도 같은 달(±1)이 최고였나 — 2년치가 있을 때만 판정
 *   monthsToPeak   다음 그 달까지 남은 달
 *   peakVolume     검색량 × (최고치 ÷ 마지막 완결 달) — 줄 세우는 키. 화면에 안 낸다.
 *
 * 세 가지 함정을 실측에서 배웠다:
 *   · 마지막 점이 이번 달(며칠치)이면 "지금"이 거짓으로 작아진다 → 버리고 완결 달을 쓴다.
 *   · 12개월만 보면 계절과 일회성 급등(신차 출시)이 구분이 안 된다 → 2년 반복으로 가른다.
 *   · 피크가 방금 지난 것을 피크 검색량으로 앞에 세우면 열 달을 기다린다 → 1~6개월 앞만.
 *
 * 상위 포화 판정도 실측 그대로다: 상위 10개 제목 중 정면 일치가 8개 이상이면
 * 초보 블로그가 비집을 자리가 없다(exactTitleHits — 이미 재 놓고 안 쓰던 값).
 */
import { monthsAhead } from './seasonal-seeds';

export interface DemandSeriesPoint {
  period: string;
  ratio: number;
}

export interface OrderableRow {
  keyword: string;
  searchVolume?: number | null;
  tier?: string;
  demandSeries?: DemandSeriesPoint[] | null;
  serp?: { sampledTitles?: number; exactTitleHits?: number } | null;
  monthsToPeak?: number | null;
  timingGroup?: string;
  [key: string]: unknown;
}

export interface PeakEstimate {
  /** 최고치가 있던 달(1~12). */
  peakMonth: number;
  /** 최고치 ÷ 12개월 중앙값. 평소의 몇 배인가. */
  peakMultiplier: number;
  /** 재작년에도 같은 달(±1)이 최고였나. 2년치가 없으면 null. */
  peakRecurring: boolean | null;
  /** 다음 그 달까지 남은 달(0~11). */
  monthsToPeak: number;
  /** 검색량 × (최고치 ÷ 마지막 완결 달). 줄 세우는 키. */
  peakVolume: number;
}

/** 한 해를 말하려면 열두 달이 있어야 한다. 절반짜리로 최고치를 말하면 거짓이다. */
const MIN_SERIES_POINTS = 12;
/** 반복을 말하려면 두 해가 있어야 한다. */
const RECURRENCE_POINTS = 24;
/** 상위 10개 중 정면 일치가 이만큼이면 포화. */
export const FRONTAL_SATURATION = 8;
/** 최고치가 평소의 이 배수 이상이어야 계절이라 부른다. 1.5배 출렁임은 계절이 아니다. */
export const SEASONAL_MULTIPLIER = 2;
/** 피크가 이만큼 앞이면 "곧 터진다" — 지금 쓰면 그 사이 글이 숙성된다. */
export const LEAD_MIN = 1;
export const LEAD_MAX = 6;

function monthOf(period: string): number | null {
  const m = Number(String(period || '').slice(5, 7));
  return Number.isInteger(m) && m >= 1 && m <= 12 ? m : null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function peakOf(points: DemandSeriesPoint[]): DemandSeriesPoint {
  return points.reduce((best, p) => (p.ratio > best.ratio ? p : best), points[0]);
}

/** 두 달이 같거나 이웃(12월↔1월 포함)인가. */
function sameSeason(a: number, b: number): boolean {
  const d = Math.abs(a - b);
  return d <= 1 || d === 11;
}

export function estimatePeak(row: OrderableRow, now: Date = new Date()): PeakEstimate | null {
  const volume = Number(row.searchVolume);
  if (!Number.isFinite(volume) || volume <= 0) return null;

  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const series = (Array.isArray(row.demandSeries) ? row.demandSeries : [])
    .map((p) => ({ period: String(p?.period || ''), ratio: Number(p?.ratio) }))
    .filter((p) => Number.isFinite(p.ratio) && p.ratio >= 0 && monthOf(p.period) !== null)
    // 이번 달은 며칠치라 "지금"이 거짓으로 작아진다 — 완결된 달까지만 쓴다.
    // 이번 달 이후(시계 오차·이상 데이터)도 같이 버린다. 'YYYY-MM' 은 문자열 비교로 순서가 맞는다.
    .filter((p) => p.period.slice(0, 7) < thisMonth);
  if (series.length < MIN_SERIES_POINTS) return null;

  const lastYear = series.slice(-12);
  const peak = peakOf(lastYear);
  if (!(peak.ratio > 0)) return null;
  const latestComplete = lastYear[lastYear.length - 1];
  const peakMonth = monthOf(peak.period)!;

  let peakRecurring: boolean | null = null;
  if (series.length >= RECURRENCE_POINTS) {
    const prevYear = series.slice(-24, -12);
    const prevPeak = peakOf(prevYear);
    peakRecurring = prevPeak.ratio > 0 && sameSeason(peakMonth, monthOf(prevPeak.period)!);
  }

  // 데이터랩 비율은 최고 100 이라 1 을 바닥으로 두면 나눗셈이 안 터진다.
  const multiplier = peak.ratio / Math.max(1, median(lastYear.map((p) => p.ratio)));
  return {
    peakMonth,
    peakMultiplier: Math.round(multiplier * 10) / 10,
    peakRecurring,
    monthsToPeak: monthsAhead(peakMonth, now.getMonth() + 1),
    peakVolume: Math.round(volume * (peak.ratio / Math.max(1, latestComplete.ratio))),
  };
}

export function isFrontalSaturated(row: OrderableRow): boolean {
  const s = row.serp;
  if (!s) return false;
  const sampled = Number(s.sampledTitles);
  const hits = Number(s.exactTitleHits);
  return Number.isFinite(sampled) && sampled >= FRONTAL_SATURATION
    && Number.isFinite(hits) && hits >= FRONTAL_SATURATION;
}

/**
 * 시기 배지. 피크까지 남은 달로 가른다 — 발행본은 이 값을 judgeTimingGroup 보다 우선한다.
 *   0~3     지금 적기      (0 은 이번 달 — 늦을 수 있지만 자리가 비었으면 쓴다)
 *   4~6     준비 시기
 *   7~11    성수기 지남    (피크가 최근 1~5개월 안에 지났다. '지금 뜨는 중' 배지 위에
 *                         "최고치의 12%" 가 붙어 모순으로 보이던 것 — 드라이런 실측)
 */
export function timingGroupFor(monthsToPeak: number): string {
  if (monthsToPeak <= 3) return '지금 적기';
  if (monthsToPeak <= LEAD_MAX) return '준비 시기';
  return '성수기 지남';
}

export interface OrderOptions {
  now?: Date;
  /** tier 우열. 검색량이 같을 때만 쓴다(발행 스크립트의 TIER_ORDER). */
  tierRank?: (tier: string | undefined) => number;
}

/**
 * 발행용으로 줄을 세운다. 원본을 건드리지 않고 새 행을 돌려준다.
 *
 * 순서: ① 상위 포화 아닌 것 먼저 ② 실효 검색량 큰 순 ③ tier.
 * 실효 검색량 = **2년 반복 계절**이고 피크가 1~6개월 앞이면 피크 검색량, 아니면 지금 검색량.
 *
 * 왜 창을 두나(드라이런 실측 2026-09-07): 피크 검색량만 보면 '제주렌트카 본사'가
 * 2위였다 — 피크가 8월, 즉 **지난달**이고 다음 피크까지 11개월. 지금 쓰면 열 달을
 * 기다린다. "폭발 전에 들어간다"가 목적이므로 앞에 올 것은 **곧 터질 것**이다.
 *
 * 왜 반복을 요구하나: 12개월만 보면 '기아 ev7' 4월 급등(출시 뉴스)도 계절로 보인다.
 * 재작년 같은 달도 최고였을 때만 시기를 말한다. 2년치가 없으면 사실(최고치 달·배수)만
 * 싣고 시기는 비운다 — 모르는 것을 아는 것처럼 적지 않는다.
 */
export type PublishedOrderRow<T extends OrderableRow> = T
  & Partial<Omit<PeakEstimate, 'monthsToPeak'>>
  & Pick<OrderableRow, 'monthsToPeak' | 'timingGroup'>
  & { frontalSaturated: boolean; effectiveVolume: number };

export function orderForPublish<T extends OrderableRow>(rows: readonly T[], options: OrderOptions = {}): PublishedOrderRow<T>[] {
  const now = options.now ?? new Date();
  const tierRank = options.tierRank ?? (() => 0);

  const annotated = rows.map((row) => {
    const peak = estimatePeak(row, now);
    const saturated = isFrontalSaturated(row);
    const current = Number(row.searchVolume) || 0;
    if (!peak) return { ...row, frontalSaturated: saturated, effectiveVolume: current };
    const seasonal = peak.peakRecurring === true && peak.peakMultiplier >= SEASONAL_MULTIPLIER;
    const ahead = peak.monthsToPeak >= LEAD_MIN && peak.monthsToPeak <= LEAD_MAX;
    return {
      ...row,
      frontalSaturated: saturated,
      peakMonth: peak.peakMonth,
      peakMultiplier: peak.peakMultiplier,
      peakRecurring: peak.peakRecurring,
      peakVolume: peak.peakVolume,
      /** 줄 세우는 키. 곧 터질 계절만 피크로, 나머지는 지금 값으로. 화면엔 안 나간다. */
      effectiveVolume: seasonal && ahead ? peak.peakVolume : current,
      ...(seasonal
        ? { monthsToPeak: peak.monthsToPeak, timingGroup: timingGroupFor(peak.monthsToPeak) }
        : {}),
    };
  });

  return [...annotated].sort((a, b) =>
    (Number(a.frontalSaturated) - Number(b.frontalSaturated))
    || (Number(b.effectiveVolume) - Number(a.effectiveVolume))
    || (tierRank(a.tier) - tierRank(b.tier)));
}
