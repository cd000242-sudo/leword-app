/**
 * 키워드 수요 모양 — 12개월 월별 실측 시계열로 시즌성·에버그린을 가른다.
 *
 * 왜 새로 만들었나:
 *   기존 trend-type-classifier 는 **30일 일별**을 본다. 두 가지가 어긋난다.
 *   ① 시즌성은 30일로 판별할 수 없다. 여름에 뜨는 키워드인지 알려면 1년을 봐야 한다.
 *   ② 저볼륨 키워드는 30일 일별 데이터가 1~3포인트뿐이다(실측). 데이터랩이 검색이
 *      없는 날을 아예 빼기 때문이다. 그래서 롱테일은 전부 '판정불가'가 됐다.
 *      같은 키워드도 12개월 월별로 받으면 12포인트가 나온다.
 *
 * 여기서 나오는 값은 전부 데이터랩이 준 **상대 비율의 단순 산술**이다.
 * 점수·확률을 만들지 않는다. 자료가 모자라면 모양을 지어내지 않고 unknown 이다.
 */

import { naverApiFetch } from './naver-api-hub';

// 기본 fetch — API HUB 키가 설정되면 자동으로 HUB 주소·헤더로 변환된다.
// 테스트는 fetchImpl 주입으로 그대로 우회한다(주입 계약 불변).
const defaultNaverFetch: typeof fetch = ((url: any, init: any) =>
  naverApiFetch(String(url), init)) as typeof fetch;

export type DemandShape = 'seasonal' | 'evergreen' | 'rising' | 'declining' | 'volatile' | 'unknown';

export const DEMAND_SHAPE_LABEL: Record<DemandShape, string> = {
  seasonal: '시즌성',
  evergreen: '에버그린',
  rising: '상승세',
  declining: '하락세',
  volatile: '들쭉날쭉',
  unknown: '판정불가',
};

/**
 * 라벨에서 원래 판정값을 되짚는다.
 *
 * 왜 필요한가: 배치 결과에 `trendShape` 를 싣기 전에 돌린 후보 파일이 남아 있고,
 * 그걸 다시 뽑으려면 40분짜리 재발굴을 해야 한다. 라벨은 이 표에서 나온 것이라
 * 되짚어도 새로 만드는 값이 아니다. 모르는 라벨은 null 로 둔다.
 */
export function shapeFromLabel(label: string | null | undefined): DemandShape | null {
  if (!label) return null;
  const found = Object.entries(DEMAND_SHAPE_LABEL).find(([, text]) => text === label);
  return found ? (found[0] as DemandShape) : null;
}

export interface DemandShapeThresholds {
  /** 이보다 포인트가 적으면 판정하지 않는다. */
  minPoints: number;
  /** 최고월 ÷ 중앙월 이 이 값 이상이면 특정 시기에 몰린 것이다. */
  seasonalPeakRatio: number;
  /** 최근 3개월 ÷ 앞 3개월 이 이 값 이상이면 상승세다. */
  risingRatio: number;
  /** 같은 비가 이 값 이하면 하락세다. */
  decliningRatio: number;
  /** 변동계수(표준편차÷평균)가 이 값 이하면 고른 것이다. */
  evergreenVariation: number;
  /**
   * 에버그린으로 인정할 추세 범위.
   *
   * 편차만 보면 **1년에 걸쳐 완만히 무너지는 키워드**가 "내내 고름"으로 분류된다.
   * 실측 사례: [100,88,89,92,93,88,75,82,61,65,57,56] 은 36% 빠졌는데 편차는 19%다.
   * 그걸 에버그린이라고 하면 "한 번 쓰면 1년 간다"는 뜻이 되어 정반대로 읽힌다.
   */
  evergreenTrendBand: { min: number; max: number };
}

/**
 * 임계값은 아직 실증 전이다. 실제 키워드로 라벨이 맞는지 확인한 뒤 조정해야 한다.
 * 그래서 상수로 박지 않고 인자로 뺐다.
 */
export const DEFAULT_DEMAND_SHAPE_THRESHOLDS: DemandShapeThresholds = {
  // 24개월을 요청하지만 저볼륨은 덜 온다. 12개면 한 해 주기는 본 것이다.
  minPoints: 12,
  seasonalPeakRatio: 2.0,
  risingRatio: 1.5,
  decliningRatio: 0.75,
  evergreenVariation: 0.35,
  evergreenTrendBand: { min: 0.8, max: 1.3 },
};

export interface DemandShapeResult {
  shape: DemandShape;
  label: string;
  /** 판정 근거 — 화면에 그대로 쓸 수 있는 실측 사실. */
  evidence: string;
  points: number;
  /** 최고월이 몇 번째인지(1부터). 시즌성일 때 "몇 월에 뜬다"를 말하려면 필요하다. */
  peakIndex: number | null;
  /**
   * 성수기까지 남은 개월 수. 시즌성일 때만 채운다.
   *
   * 왜 필요한가: 상위노출까지 최소 몇 달이 걸린다. 시즌이 닥쳐서 쓰면 이미 늦고,
   * 선구자는 수주~수개월 전에 미리 자리를 잡아 둔다(리서치 §6).
   * 그런데 "이 키워드는 시즌성입니다"만 알려주면 **언제 써야 하는지**를 모른다.
   */
  monthsToPeak: number | null;
  /** 지금 써야 하는지 한 문장으로. 시즌성이 아니면 빈 문자열이다. */
  timing: string;
}

const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function variation(values: number[]): number {
  const avg = mean(values);
  if (avg <= 0) return Infinity;
  const sd = Math.sqrt(mean(values.map((v) => (v - avg) ** 2)));
  return sd / avg;
}

/**
 * 성수기까지 남은 개월로 "언제 써야 하는가"를 말한다.
 *
 * 상위노출까지 몇 달이 걸리므로 성수기 2~3개월 전이 착수 시점이다.
 * 확률이나 예상 유입을 말하지 않는다 — 남은 개월은 실측 시계열에서 센 값이다.
 */
function seasonTiming(monthsToPeak: number): string {
  if (monthsToPeak <= 1) return '성수기가 코앞입니다 — 지금 쓰면 이번 시즌은 늦을 수 있습니다';
  if (monthsToPeak <= 3) return `성수기까지 약 ${monthsToPeak}개월 — 지금이 쓸 때입니다`;
  if (monthsToPeak <= 6) return `성수기까지 약 ${monthsToPeak}개월 — 2~3개월 뒤에 쓰면 됩니다`;
  return `성수기까지 약 ${monthsToPeak}개월 — 아직 이릅니다`;
}

/**
 * 월별 비율 배열 하나를 모양으로 분류한다.
 *
 * 순서가 중요하다. 상승세는 "최근이 높은" 것이고 시즌성은 "특정 시기에 몰린"
 * 것인데, 최근 달이 마침 성수기면 둘 다 참이 된다. 그때는 상승세로 본다 —
 * 지금 뜨고 있다는 사실이 더 쓸모 있고, 1년 뒤에도 그럴지는 아직 모른다.
 */
export function classifyDemandShape(
  monthlyRatios: number[],
  thresholds: DemandShapeThresholds = DEFAULT_DEMAND_SHAPE_THRESHOLDS,
): DemandShapeResult {
  const points = Array.isArray(monthlyRatios) ? monthlyRatios.filter((v) => Number.isFinite(v)) : [];
  if (points.length < thresholds.minPoints) {
    return {
      shape: 'unknown',
      label: DEMAND_SHAPE_LABEL.unknown,
      evidence: `월별 자료 ${points.length}개 — 판정에 ${thresholds.minPoints}개 필요`,
      points: points.length,
      peakIndex: null,
      monthsToPeak: null,
      timing: '',
    };
  }

  const peak = Math.max(...points);
  const peakIndex = points.indexOf(peak) + 1;
  const mid = median(points);
  const head = mean(points.slice(0, 3));
  const tail = mean(points.slice(-3));
  const trendRatio = head > 0 ? tail / head : Infinity;
  const spread = variation(points);
  const peakRatio = mid > 0 ? peak / mid : Infinity;
  // 최고월이 끝에서 두 달 안에 있으면 "몰린 것"이 아니라 "오르는 중"이다.
  const peakAtEnd = peakIndex >= points.length - 1;

  if (trendRatio >= thresholds.risingRatio) {
    return {
      shape: 'rising',
      label: DEMAND_SHAPE_LABEL.rising,
      evidence: `최근 3개월이 1년 전 같은 기간의 ${trendRatio.toFixed(1)}배`,
      points: points.length,
      peakIndex,
      monthsToPeak: null,
      timing: '',
    };
  }
  if (trendRatio <= thresholds.decliningRatio) {
    return {
      shape: 'declining',
      label: DEMAND_SHAPE_LABEL.declining,
      evidence: `최근 3개월이 1년 전 같은 기간의 ${trendRatio.toFixed(1)}배`,
      points: points.length,
      peakIndex,
      monthsToPeak: null,
      timing: '',
    };
  }
  if (peakRatio >= thresholds.seasonalPeakRatio && !peakAtEnd) {
    /*
     * 달력 기준으로 다음 성수기까지 몇 달인지 센다.
     *
     * 시계열의 마지막 칸이 '이번 달'이다. 최고월이 n개월 전이면 같은 시기는
     * 12개월 주기로 돌아오므로, 남은 개월은 (12 - n%12) 이다.
     * 24개월을 받기 때문에 n 이 12를 넘을 수 있고, 그때도 이 식이 맞는다.
     */
    const monthsSincePeak = points.length - peakIndex;
    const monthsToPeak = ((12 - (monthsSincePeak % 12)) % 12) || 12;
    return {
      shape: 'seasonal',
      label: DEMAND_SHAPE_LABEL.seasonal,
      evidence: `${points.length}개월 중 ${peakIndex}번째 달이 중앙값의 ${peakRatio.toFixed(1)}배`,
      points: points.length,
      peakIndex,
      monthsToPeak,
      timing: seasonTiming(monthsToPeak),
    };
  }
  // 에버그린은 "고르다"만으로 부족하다. 추세가 평평해야 한다.
  const flat = trendRatio >= thresholds.evergreenTrendBand.min && trendRatio <= thresholds.evergreenTrendBand.max;
  if (spread <= thresholds.evergreenVariation && flat) {
    return {
      shape: 'evergreen',
      label: DEMAND_SHAPE_LABEL.evergreen,
      evidence: `12개월 내내 고름 (편차 ${Math.round(spread * 100)}%)`,
      points: points.length,
      peakIndex,
      monthsToPeak: null,
      timing: '',
    };
  }
  return {
    shape: 'volatile',
    label: DEMAND_SHAPE_LABEL.volatile,
    evidence: `달마다 오르내림 (편차 ${Math.round(spread * 100)}%)`,
    points: points.length,
    peakIndex,
    monthsToPeak: null,
    timing: '',
  };
}

export interface DemandShapeConfig {
  clientId: string;
  clientSecret: string;
}

/**
 * 데이터랩에서 12개월 월별 상대 비율을 받는다.
 *
 * timeUnit 을 'date' 로 두면 검색이 없는 날이 통째로 빠져서 저볼륨 키워드는
 * 1~3포인트만 온다(실측 확인). 'month' 로 받아야 롱테일도 판정할 수 있다.
 */
/** 월별 실측 한 점. period 는 데이터랩이 주는 달(YYYY-MM-DD, 1일로 온다). */
export interface DemandPoint {
  period: string;
  ratio: number;
}

/**
 * 이 숫자가 **언제 기준이고 지금은 어느 수준인지**.
 *
 * 왜 필요한가: 검색량은 지난 한 달의 총합이라 "황금키워드"라고 나와도 그게
 * 언제쩍 이야기인지, 지금도 그만큼 찾는지 알 수가 없다. 정점이 1년 전인
 * 키워드와 지금이 정점인 키워드가 같은 숫자로 보인다.
 *
 * 둘 다 실측 시계열의 단순 나눗셈이다 — 예측하거나 지어내지 않는다.
 */
export interface DemandRecency {
  /** 시계열의 마지막 달(YYYY-MM). 이 수치가 어느 달까지 반영된 것인지. */
  asOf: string | null;
  /** 마지막 달이 정점 대비 몇 %인가. 100 이면 지금이 정점이다. */
  latestVsPeakPct: number | null;
  /** 정점이 몇 개월 전이었나. 0 이면 이번 달이 정점이다. */
  monthsSincePeak: number | null;
  /** 화면에 그대로 쓸 수 있는 한 문장. */
  summary: string;
}

export function readDemandRecency(points: DemandPoint[]): DemandRecency {
  const clean = (points || []).filter((p) => p && Number.isFinite(Number(p.ratio)));
  if (clean.length === 0) {
    return { asOf: null, latestVsPeakPct: null, monthsSincePeak: null, summary: '수요 추이를 재지 못했습니다' };
  }
  const ratios = clean.map((p) => Number(p.ratio));
  const peak = Math.max(...ratios);
  const latest = ratios[ratios.length - 1] as number;
  const peakIndex = ratios.indexOf(peak);
  const monthsSincePeak = ratios.length - 1 - peakIndex;
  const asOf = String(clean[clean.length - 1]?.period || '').slice(0, 7) || null;
  const latestVsPeakPct = peak > 0 ? Math.round((latest / peak) * 100) : null;

  let summary: string;
  if (latestVsPeakPct === null) {
    summary = '수요 추이를 재지 못했습니다';
  } else if (monthsSincePeak === 0) {
    summary = `${asOf} 기준 지금이 최고치입니다`;
  } else {
    summary = `${asOf} 기준 최고치의 ${latestVsPeakPct}% (정점은 ${monthsSincePeak}개월 전)`;
  }
  return { asOf, latestVsPeakPct, monthsSincePeak, summary };
}

/** 기간까지 함께 받는다. 비율만 필요하면 fetchMonthlyDemand 를 쓴다. */
export async function fetchMonthlyDemandPoints(
  keyword: string,
  config: DemandShapeConfig,
  fetchImpl: typeof fetch = defaultNaverFetch,
): Promise<DemandPoint[]> {
  const end = new Date();
  const start = new Date(end);
  start.setFullYear(end.getFullYear() - 2);
  const iso = (date: Date) => date.toISOString().slice(0, 10);

  try {
    const response = await fetchImpl('https://openapi.naver.com/v1/datalab/search', {
      method: 'POST',
      headers: {
        'X-Naver-Client-Id': config.clientId,
        'X-Naver-Client-Secret': config.clientSecret,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate: iso(start),
        endDate: iso(end),
        timeUnit: 'month',
        keywordGroups: [{ groupName: keyword, keywords: [keyword] }],
      }),
    });
    if (!response.ok) return [];
    const payload = await response.json() as { results?: Array<{ data?: Array<{ period?: string; ratio?: number }> }> };
    return (payload.results?.[0]?.data || [])
      .map((point) => ({ period: String(point.period || ''), ratio: Number(point.ratio) }))
      .filter((point) => Number.isFinite(point.ratio));
  } catch {
    // 모양을 지어내지 않는다. 빈 배열이면 호출자가 unknown 으로 남긴다.
    return [];
  }
}

export async function fetchMonthlyDemand(
  keyword: string,
  config: DemandShapeConfig,
  fetchImpl: typeof fetch = defaultNaverFetch,
): Promise<number[]> {
  /*
   * **24개월**을 받는다. 12개월로는 "작년 이맘때 성수기였고 곧 다시 온다"와
   * "그냥 죽었다"를 구분할 수 없다 — 최고월이 창 맨 앞이면 추세가 급락으로
   * 보여 하락세로 먼저 잡히고, 성수기 임박 판정이 구조적으로 불가능해진다.
   * 24개월이면 같은 달을 두 번 보므로 달력 기준으로 다음 성수기를 셀 수 있다.
   * 호출 수는 그대로다(같은 API, 기간만 넓힘).
   */
  const end = new Date();
  const start = new Date(end);
  start.setFullYear(end.getFullYear() - 2);
  const iso = (date: Date) => date.toISOString().slice(0, 10);

  try {
    const response = await fetchImpl('https://openapi.naver.com/v1/datalab/search', {
      method: 'POST',
      headers: {
        'X-Naver-Client-Id': config.clientId,
        'X-Naver-Client-Secret': config.clientSecret,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate: iso(start),
        endDate: iso(end),
        timeUnit: 'month',
        keywordGroups: [{ groupName: keyword, keywords: [keyword] }],
      }),
    });
    if (!response.ok) return [];
    const payload = await response.json() as { results?: Array<{ data?: Array<{ ratio?: number }> }> };
    return (payload.results?.[0]?.data || [])
      .map((point) => Number(point.ratio))
      .filter((value) => Number.isFinite(value));
  } catch {
    // 모양을 지어내지 않는다. 빈 배열이면 호출자가 unknown 으로 남긴다.
    return [];
  }
}

export async function analyzeDemandShape(
  keyword: string,
  config: DemandShapeConfig,
  thresholds: DemandShapeThresholds = DEFAULT_DEMAND_SHAPE_THRESHOLDS,
  fetchImpl: typeof fetch = defaultNaverFetch,
): Promise<DemandShapeResult> {
  return classifyDemandShape(await fetchMonthlyDemand(keyword, config, fetchImpl), thresholds);
}

/**
 * 모양과 **시점**을 한 번의 호출로 같이 받는다.
 *
 * 따로 부르면 데이터랩을 두 번 때린다. 같은 시계열에서 둘 다 나오므로 한 번만 받는다.
 */
export async function analyzeDemandWithRecency(
  keyword: string,
  config: DemandShapeConfig,
  thresholds: DemandShapeThresholds = DEFAULT_DEMAND_SHAPE_THRESHOLDS,
  fetchImpl: typeof fetch = defaultNaverFetch,
): Promise<{ shape: DemandShapeResult; recency: DemandRecency; points: DemandPoint[] }> {
  const points = await fetchMonthlyDemandPoints(keyword, config, fetchImpl);
  return {
    shape: classifyDemandShape(points.map((point) => point.ratio), thresholds),
    recency: readDemandRecency(points),
    /*
     * 실측 월별 시계열을 그대로 돌려준다(2026-08-19). 지금까지는 분류 결과만 남기고
     * 원본을 버려서, 화면의 '그래프보기'가 빈 데이터랩 폼으로 링크나 보내고 있었다.
     * 이미 재 놓은 것을 버리지 않고 싣는 것뿐이다 — 추가 API 호출 없음.
     */
    points,
  };
}
