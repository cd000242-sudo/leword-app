/**
 * 이슈 틈새 판정 — 측정된 수치만 받아 등급·틈새 여부를 정하는 순수 함수.
 *
 * 네트워크 호출과 분리해 둔다. 판정 규칙이 게이트의 전부라서
 * 스텁 없이 그대로 테스트할 수 있어야 회귀를 막을 수 있다.
 *
 * 틈새의 정의(사장님 2026-09-04): "황금키워드만 적으면 상위노출이 될 수도 있지만
 * 더욱 확률 높고 트래픽을 몰고 올 수 있는 키워드가 틈새키워드". 그래서 틈새는
 * 황금보다 세다 — 세 가지를 **전부 실측**으로 통과해야 한다.
 *   트래픽  검색광고 월 검색량 ≥ 300 (수요 상승 중이면 ≥ 100). 추정치는 증거가 아니다.
 *   수요    데이터랩 최근 7일에 잡힘 · 죽지 않음 · 문서수 ≤ 3,000 실측 · 오늘 도배 아님.
 *   자리    네이버 블로그탭 상위 10 제목 정면 대응 0건(WINNABLE, Bright Data 실측).
 * 자리를 아직 안 쟀으면 '대기'다 — 틈새라 부르지 않고 다음 자리 실측 대상으로 남긴다.
 *
 * 이전 규칙(2026-09-02 ~ 09-03)은 수요 + 문서수 3,000↓ 만 봤다. 그때 검색량 게이트를
 * 뺀 근거(후보 60 퍼널: 검색량실측 20 → 하한 13 → 저경쟁 1 → 황금비 0)는 황금비를
 * 요구했기 때문이다. 지금은 황금비를 안 본다 — 트래픽 하한과 자리 실측이 대신한다.
 */

import { RecencyStatus } from './naver-datalab-api';
import { classifyGradeByMetrics, Grade } from './grade';
import type { SerpVerdictCode } from './serp-winnability';

export interface IssueNicheMeasurements {
  searchVolume: number | null;
  documentCount: number | null;
  isSearchVolumeEstimated: boolean;
  isDocumentCountEstimated: boolean;
  /**
   * 키워드도구가 PC·모바일 한쪽 이상을 "< 10" 으로 답함(실측). 양쪽 다면 searchVolume 은
   * null 인데, 그건 '미확인'이 아니라 '실측 저검색'이다 — 선점 후보(검색량 미확인)가 아니다.
   */
  searchVolumeLt10?: boolean;
  /** baseKeyword 의 추세 */
  recencyStatus: RecencyStatus;
  /** 이 키워드 자체의 데이터랩 최근 7일 평균 (상대지수, null=미측정) */
  demandRecent7: number | null;
  /** 이 키워드 자체의 추세 */
  demandStatus: RecencyStatus;
  /** 상위 노출글 중 최근 며칠 내 정면글 수 (null=미측정) */
  freshFrontalCount: number | null;
  /**
   * 블로그탭 상위 10 자리 실측(serp-winnability). undefined/null/NO_DATA = 아직 못 잼.
   * 회차당 Bright Data 상한(12건) 안에서만 재므로 대부분의 후보는 처음엔 미실측이다.
   */
  serpVerdict?: SerpVerdictCode | null;
}

export interface IssueNicheThresholds {
  docCountMax: number;
  useLiveDemandRoute: boolean;
  /**
   * 선점 후보로 볼 문서수 상한 (기본 300).
   * 틈새 상한(3,000)보다 훨씬 엄격하다 — 수요 증거가 없는 만큼
   * "경쟁이 사실상 없다"는 것 하나는 확실해야 한다.
   */
  preemptionDocMax?: number;
  /** 틈새 트래픽 하한 — 검색광고 월 검색량(실측). 기본 300. */
  trafficFloor?: number;
  /** 데이터랩 수요가 상승 중이면 이 하한으로 내려 잡는다. 기본 100. */
  trafficRisingFloor?: number;
}

/** 자리 실측 상태 — 화면 배지와 자리 실측 대상 고르기가 같이 읽는다. */
export type IssueSlotStatus = 'winnable' | 'contested' | 'locked' | 'unmeasured';

/**
 * 선점 후보의 근거 종류.
 *  - no-demand        경쟁 문서 거의 없음 + 데이터랩 수요 미검출(발표 당일 신제품 등).
 *  - demand-no-volume 데이터랩엔 잡혔는데 키워드도구가 아직 모른다(갓 태어난 이슈).
 *                     트래픽 증거가 없어 틈새는 아니고, 자리는 비어 있다.
 */
export type IssuePreemptionKind = 'no-demand' | 'demand-no-volume';

export interface IssueNicheVerdict {
  grade: Grade;
  goldenRatio: number | null;
  hasTraffic: boolean;
  hasLiveDemand: boolean;
  isEstimated: boolean;
  /** 트래픽 게이트 통과(실측 검색량이 하한 이상). */
  trafficGate: boolean;
  /** 수요 게이트 통과(데이터랩 수요·저경쟁·생존·도배 아님). */
  demandGate: boolean;
  slotStatus: IssueSlotStatus;
  /** 틈새 — 트래픽·수요·자리 셋 다 실측 통과. */
  isNiche: boolean;
  nicheRoute: 'triple' | null;
  /** 트래픽·수요는 통과했는데 자리를 아직 못 잼 — 자리 실측 대상. 싣지 않는다. */
  isPending: boolean;
  /**
   * 선점 후보 — 경쟁 문서가 거의 없는데 트래픽 증거가 아직 없는 것. 틈새가 아니다.
   * "트래픽이 온다"고 말할 수 없고, "지금 쓰면 자리를 잡는다"까지만 말할 수 있다.
   */
  isPreemption: boolean;
  preemptionKind: IssuePreemptionKind | null;
  nicheScore: number;
  reasons: string[];
}

/** 상위 정면글이 이만큼 최근이면 '오늘 도배' 로 본다. */
const FLOOD_FRESH_FRONTAL = 3;
const DEFAULT_TRAFFIC_FLOOR = 300;
const DEFAULT_TRAFFIC_RISING_FLOOR = 100;

function slotStatusOf(serpVerdict: SerpVerdictCode | null | undefined): IssueSlotStatus {
  if (serpVerdict === 'WINNABLE') return 'winnable';
  if (serpVerdict === 'CONTESTED') return 'contested';
  if (serpVerdict === 'LOCKED') return 'locked';
  return 'unmeasured';
}

export function judgeIssueNiche(
  m: IssueNicheMeasurements,
  thresholds: IssueNicheThresholds,
): IssueNicheVerdict {
  const { searchVolume, documentCount } = m;
  const isEstimated = m.isSearchVolumeEstimated || m.isDocumentCountEstimated;
  const goldenRatio = searchVolume != null && documentCount != null && documentCount > 0
    ? searchVolume / documentCount : null;

  // hasTraffic·goldenRatio 는 표시용 관측값이다. 판정은 아래 게이트가 한다.
  const hasTraffic = searchVolume != null && !isEstimated && searchVolume > 0;
  const lowComp = documentCount != null && documentCount > 0 && documentCount <= thresholds.docCountMax;
  const alive = m.recencyStatus !== 'dead';
  const flooded = m.freshFrontalCount !== null && m.freshFrontalCount >= FLOOD_FRESH_FRONTAL;
  const grade: Grade = searchVolume != null && documentCount != null && goldenRatio != null
    ? classifyGradeByMetrics(searchVolume, documentCount, goldenRatio) : 'C';

  // 실측 수요(데이터랩) — 검색광고에 없는 '오늘 생긴 수요'의 유일한 실측 증거.
  // 상대지수라 절대 검색량으로 환산하지 않는다. 잡혔나/안 잡혔나만 쓴다.
  const hasLiveDemand = m.demandRecent7 != null && m.demandRecent7 > 0;
  const demandAlive = hasLiveDemand && m.demandStatus !== 'dead';
  const docMeasured = documentCount != null && documentCount > 0 && !m.isDocumentCountEstimated;
  const demandGate = thresholds.useLiveDemandRoute
    && demandAlive && docMeasured && lowComp && alive && !flooded;

  // 트래픽 게이트 — 실측 검색량만. 수요가 상승 중이면 하한을 내린다: 갓 터진 이슈는
  // 키워드도구가 지난달 숫자로 아직 작게 안다.
  const floor = m.demandStatus === 'rising'
    ? (thresholds.trafficRisingFloor ?? DEFAULT_TRAFFIC_RISING_FLOOR)
    : (thresholds.trafficFloor ?? DEFAULT_TRAFFIC_FLOOR);
  const volumeMeasured = searchVolume != null && !m.isSearchVolumeEstimated;
  const trafficGate = volumeMeasured && searchVolume! >= floor;

  const slotStatus = slotStatusOf(m.serpVerdict);
  const candidate = trafficGate && demandGate;
  const isNiche = candidate && slotStatus === 'winnable';
  const isPending = candidate && slotStatus === 'unmeasured';

  // 선점 후보 — 신제품·신모델은 발표 당일 문서수도 0, 데이터랩 수요도 0 이다.
  // 실측(2026-09-03): 다이슨 '카메라젯' 발표 당일 — "카메라젯 상용화" 문서 1건 / 수요 0.
  // 갓 태어난 이슈('지예은 남편')는 반대로 수요는 잡혔는데 키워드도구가 아직 모른다.
  // 둘 다 "경쟁이 없다"는 하나는 확실하고 트래픽 증거는 없다 — 틈새와 섞지 않는다.
  const preemptionDocMax = thresholds.preemptionDocMax ?? 300;
  const emptyField = docMeasured && documentCount! <= preemptionDocMax && alive && !flooded;
  const volumeUnknown = searchVolume == null && !m.isSearchVolumeEstimated && m.searchVolumeLt10 !== true;
  let preemptionKind: IssuePreemptionKind | null = null;
  if (!isNiche && !isPending && emptyField) {
    if (!hasLiveDemand) preemptionKind = 'no-demand';
    else if (demandAlive && volumeUnknown) preemptionKind = 'demand-no-volume';
  }
  const isPreemption = preemptionKind !== null;

  const reasons: string[] = [];
  if (hasTraffic) reasons.push(`검색량 ${searchVolume!.toLocaleString()}`);
  if (lowComp) reasons.push(`문서수 ${documentCount!.toLocaleString()}`);
  if (demandGate) reasons.push('데이터랩 실측 수요');
  if (slotStatus === 'winnable') reasons.push('블로그탭 상위 10 정면글 0건 — 자리 있음');
  if (slotStatus === 'contested') reasons.push('상위 10 에 정면 대응 글 있음 — 경쟁');
  if (slotStatus === 'locked') reasons.push('상위 10 이 정면 대응 글로 잠김');
  if (isPending) reasons.push('자리 미실측 — 대기');
  if (preemptionKind === 'no-demand') reasons.push(`선점 후보 — 경쟁 문서 ${documentCount!.toLocaleString()}건, 수요 미검출`);
  if (preemptionKind === 'demand-no-volume') reasons.push(`선점 후보 — 경쟁 문서 ${documentCount!.toLocaleString()}건, 수요 잡힘·검색량 미확인`);
  if (m.demandStatus === 'rising') reasons.push('수요 상승중');
  if (flooded) reasons.push('오늘 도배중');
  if (m.recencyStatus === 'dead') reasons.push('수요 죽음');
  if (isEstimated) reasons.push('추정치');

  // 점수는 정렬에만 쓴다. 대기 행끼리는 검색량 큰 것부터 자리를 재도록 트래픽 통과에 가산.
  let nicheScore = 0;
  if (documentCount != null && documentCount > 0) nicheScore += Math.max(0, 45 - Math.log10(documentCount) * 9);
  if (hasTraffic) nicheScore += 12;
  if (trafficGate) nicheScore += 15;
  if (hasLiveDemand) nicheScore += 10;
  if (slotStatus === 'winnable') nicheScore += 10;
  if (m.demandStatus === 'rising') nicheScore += 8;
  if (m.recencyStatus === 'rising') nicheScore += 8;
  if (flooded) nicheScore -= 25;
  if (isEstimated) nicheScore -= 25;
  if (!alive) nicheScore -= 40;
  nicheScore = Math.max(0, Math.round(nicheScore));

  return {
    grade,
    goldenRatio,
    hasTraffic,
    hasLiveDemand,
    isEstimated,
    trafficGate,
    demandGate,
    slotStatus,
    isNiche,
    nicheRoute: isNiche ? 'triple' : null,
    isPending,
    isPreemption,
    preemptionKind,
    nicheScore,
    reasons,
  };
}
