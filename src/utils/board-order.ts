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
  /** 씨앗 갈래 — coverage(상시) · seasonal(계절) · warehouse(창고) · related(연관어에서 늘림). */
  seedKind?: string | null;
  /** 씨앗보다 몇 어절 늘었나. 0 이면 씨앗 그대로(머리 키워드). */
  expansionWords?: number | null;
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

/**
 * 선점 차례 — 작을수록 앞.
 *
 * 사장님 2026-09-12: "지금 미리쓰면 나중에 몇월달에 트래픽이 몰릴가능성이있는 키워드를
 * 알려주고 … 이건그냥 황금키워드를 그냥 카테고리별로 나눠놓은거자나".
 *
 * 맞는 말이었다. 실측(발행본 43행): 앞으로 피크가 오는 행은 **4행**뿐이고 나머지 39행은
 * 피크까지 0개월이다. 그런데 줄 세우기가 검색량만 보니 그 4행이 중간에 묻혔고,
 * 앞줄은 제주렌트카 본사(9,360)·무료게임 crazy(4,650) 같은 머리 키워드가 차지했다.
 *
 * 그래서 **시기가 먼저**다. 검색량은 같은 차례 안에서만 쓴다.
 *   0  선점 — 앞으로 1~6개월 안에 몰린다. 2년 반복으로 확인된 계절.
 *   1  선점(1년치) — 같은 조건인데 24개월이 없어 반복을 아직 확인 못 했다.
 *      버리지 않는다: 저볼륨 키워드는 데이터랩이 점을 덜 줘서 영영 24개월이 안 된다(실측 19/43).
 *      대신 화면이 "1년치만 봤다"고 밝힌다 — 모르는 것을 아는 것처럼 적지 않는다.
 *   2  그 밖(지금 뜨는 중·연중 상시·판정 없음)
 *   3  성수기 지남 — 다음 피크까지 열 달을 기다린다. 맨 뒤.
 */
export const PREEMPT_CONFIRMED = 0;
export const PREEMPT_ONE_YEAR = 1;
export const PREEMPT_OTHER = 2;
export const PREEMPT_PAST = 3;

export interface PreemptRankInput {
  monthsToPeak?: number | null;
  peakRecurring?: boolean | null;
  peakMultiplier?: number | null;
  latestVsPeakPct?: number | null;
  monthsSincePeak?: number | null;
}

export function preemptRank(row: PreemptRankInput): number {
  const months = Number(row.monthsToPeak);
  const ahead = Number.isFinite(months) && months >= LEAD_MIN && months <= LEAD_MAX;
  if (ahead && Number(row.peakMultiplier) >= SEASONAL_MULTIPLIER) {
    // 재작년이 다른 달이었다면 계절이 아니라 일회성 급등이다 — 선점감이 아니다.
    if (row.peakRecurring === false) return PREEMPT_OTHER;
    return row.peakRecurring === true ? PREEMPT_CONFIRMED : PREEMPT_ONE_YEAR;
  }
  // 피크가 지났고 지금이 그때의 절반도 안 되면 맨 뒤다 — 다음 피크까지 한참이다.
  const pct = Number(row.latestVsPeakPct);
  const since = Number(row.monthsSincePeak);
  if (Number.isFinite(pct) && pct < 60 && Number.isFinite(since) && since >= 2) return PREEMPT_PAST;
  return PREEMPT_OTHER;
}

/**
 * 확장 차례 — 작을수록 앞.
 *   0 씨앗에서 늘어난 말(확장·연관)
 *   1 못 쟀다 — 옛 회차 행에는 이 값이 없다
 *   2 씨앗 그대로(머리 키워드)
 */
export function expansionRank(row: { expansionWords?: number | null }): number {
  /*
   * null 을 Number() 에 넣으면 0 이 된다 — '못 쟀다'가 '씨앗 그대로'로 둔갑해서
   * 맨 뒤로 밀린다. 배치·발행이 못 잰 값을 null 로 적으므로 실제로 생기는 일이다.
   * (테스트가 잡았다. 2026-09-12)
   */
  if (row.expansionWords === null || row.expansionWords === undefined) return 1;
  const n = Number(row.expansionWords);
  if (!Number.isFinite(n)) return 1;
  return n >= 1 ? 0 : 2;
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
  & { frontalSaturated: boolean; effectiveVolume: number; preemptRank: number; peakConfidence: string };

export function orderForPublish<T extends OrderableRow>(rows: readonly T[], options: OrderOptions = {}): PublishedOrderRow<T>[] {
  const now = options.now ?? new Date();
  const tierRank = options.tierRank ?? (() => 0);

  const annotated = rows.map((row) => {
    const peak = estimatePeak(row, now);
    const saturated = isFrontalSaturated(row);
    const current = Number(row.searchVolume) || 0;
    if (!peak) {
      // 시계열이 모자라 피크를 못 셌다. 그래도 지금 수준은 알 수 있으면 차례를 준다.
      const base = { ...row, frontalSaturated: saturated, effectiveVolume: current, peakConfidence: '' };
      return { ...base, preemptRank: preemptRank(base as PreemptRankInput) };
    }
    const strong = peak.peakMultiplier >= SEASONAL_MULTIPLIER;
    const seasonal = peak.peakRecurring === true && strong;
    const ahead = peak.monthsToPeak >= LEAD_MIN && peak.monthsToPeak <= LEAD_MAX;
    /*
     * 시기를 **1년치만 있어도 적는다**(2026-09-12). 전에는 2년 반복이 확인된 행에만
     * 적었는데, 실측 43행 중 24개월이 있는 행이 10행뿐이라 사실상 아무 행에도 안 적혔다.
     * 저볼륨 키워드는 데이터랩이 점을 덜 줘서 영영 24개월이 안 된다 — 기다려도 안 온다.
     * 대신 얼마나 본 것인지를 같이 싣는다(peakConfidence). 화면이 그대로 밝힌다.
     */
    const confidence = peak.peakRecurring === true ? '2년 반복 확인'
      : peak.peakRecurring === false ? '작년엔 다른 달'
        : '1년치만 봄';
    const annotatedRow = {
      ...row,
      frontalSaturated: saturated,
      peakMonth: peak.peakMonth,
      peakMultiplier: peak.peakMultiplier,
      peakRecurring: peak.peakRecurring,
      peakVolume: peak.peakVolume,
      peakConfidence: confidence,
      /*
       * 줄 세우는 키. 화면엔 안 나간다.
       * 피크 검색량으로 부풀리는 것은 **2년 반복이 확인된 계절**만이다.
       * 1년치만 본 행은 지금 값으로 센다 — 모르는 것을 근거로 앞에 세우지 않는다.
       * (일회성 급등은 재작년이 달랐다는 것을 확인했으니 당연히 지금 값이다.)
       */
      effectiveVolume: seasonal && ahead ? peak.peakVolume : current,
      /*
       * 시기 라벨은 **2년 반복이 확인된 행에만** 적는다 — 모르는 것을 아는 것처럼 적지 않는다.
       * 피크가 지난 것도 적는다(timingGroupFor(11) = '성수기 지남'). 그게 사실이고,
       * 그 사실이 있어야 아래 preemptRank 가 맨 뒤로 민다.
       * 1년치만 본 행은 라벨을 비우되 선점 차례에는 넣는다 — peakConfidence 가 그 사정을 말한다.
       */
      ...(seasonal
        ? { monthsToPeak: peak.monthsToPeak, timingGroup: timingGroupFor(peak.monthsToPeak) }
        : {}),
    };
    return { ...annotatedRow, preemptRank: preemptRank(annotatedRow as PreemptRankInput) };
  });

  /*
   * 시기가 먼저, 검색량은 같은 차례 안에서만.
   *
   * 전에는 검색량(effectiveVolume)이 첫 키였다. 그래서 "앞으로 몰릴 것"이 몇 개 있어도
   * 머리 키워드에 묻혔다 — 사장님이 "그냥 황금키워드를 카테고리별로 나눠놓은 것" 이라고
   * 하신 그 모양이다. 상위 포화(정면 8/10↑)는 여전히 뒤로 민다 — 자리가 없는 것을
   * 앞에 세우면 시기가 맞아도 못 들어간다.
   */
  /*
   * 같은 시기 차례 안에서는 **확장·연관 키워드를 앞에** 둔다.
   *
   * 사장님 2026-09-12: "그키워드중에 확장 및 연관키워드 위주로 알려줘야 메리트가있는거지".
   * 씨앗 그대로인 말(expansionWords 0)은 누구나 아는 머리 키워드다 — 검색량은 크지만
   * 상위가 이미 차 있다. 씨앗에서 늘어난 말이 이 보드가 팔아야 할 것이다.
   * 못 잰 행(null)은 가운데에 둔다 — 모르는 것을 앞뒤 어느 쪽으로도 밀지 않는다.
   */
  return [...annotated].sort((a, b) =>
    (Number(a.preemptRank) - Number(b.preemptRank))
    || (Number(a.frontalSaturated) - Number(b.frontalSaturated))
    || (expansionRank(a) - expansionRank(b))
    || (Number(b.effectiveVolume) - Number(a.effectiveVolume))
    || (tierRank(a.tier) - tierRank(b.tier)));
}
