/**
 * 이슈 틈새 판정 — 측정된 수치만 받아 등급·틈새 여부를 정하는 순수 함수.
 *
 * 네트워크 호출과 분리해 둔다. 판정 규칙이 게이트의 전부라서
 * 스텁 없이 그대로 테스트할 수 있어야 회귀를 막을 수 있다.
 */

import { RecencyStatus } from './naver-datalab-api';
import { classifyGradeByMetrics, Grade } from './grade';

export interface IssueNicheMeasurements {
  searchVolume: number | null;
  documentCount: number | null;
  isSearchVolumeEstimated: boolean;
  isDocumentCountEstimated: boolean;
  /** baseKeyword 의 추세 */
  recencyStatus: RecencyStatus;
  /** 이 키워드 자체의 데이터랩 최근 7일 평균 (상대지수, null=미측정) */
  demandRecent7: number | null;
  /** 이 키워드 자체의 추세 */
  demandStatus: RecencyStatus;
  /** 상위 노출글 중 최근 며칠 내 정면글 수 (null=미측정) */
  freshFrontalCount: number | null;
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
}

export interface IssueNicheVerdict {
  grade: Grade;
  goldenRatio: number | null;
  hasTraffic: boolean;
  hasLiveDemand: boolean;
  isEstimated: boolean;
  isNiche: boolean;
  nicheRoute: 'demand' | null;
  /**
   * 선점 후보 — 오늘 나온 이슈에서 나왔고, 경쟁 문서가 거의 없고, 아직 수요가 측정되지 않은 것.
   * 틈새가 아니다. 수요 증거가 없으므로 "트래픽이 온다"고 말할 수 없고,
   * "지금 쓰면 자리를 잡는다"까지만 말할 수 있다.
   */
  isPreemption: boolean;
  nicheScore: number;
  reasons: string[];
}

/** 상위 정면글이 이만큼 최근이면 '오늘 도배' 로 본다. */
const FLOOD_FRESH_FRONTAL = 3;

export function judgeIssueNiche(
  m: IssueNicheMeasurements,
  thresholds: IssueNicheThresholds,
): IssueNicheVerdict {
  const { searchVolume, documentCount } = m;
  const isEstimated = m.isSearchVolumeEstimated || m.isDocumentCountEstimated;
  const goldenRatio = searchVolume != null && documentCount != null && documentCount > 0
    ? searchVolume / documentCount : null;

  // hasTraffic·goldenRatio 는 표시용 관측값이다 — 판정에 쓰지 않는다.
  const hasTraffic = searchVolume != null && !isEstimated && searchVolume > 0;
  const lowComp = documentCount != null && documentCount > 0 && documentCount <= thresholds.docCountMax;
  const alive = m.recencyStatus !== 'dead';
  const flooded = m.freshFrontalCount !== null && m.freshFrontalCount >= FLOOD_FRESH_FRONTAL;
  const grade: Grade = searchVolume != null && documentCount != null && goldenRatio != null
    ? classifyGradeByMetrics(searchVolume, documentCount, goldenRatio) : 'C';

  // 실측 수요(데이터랩) — 검색광고에 없는 '오늘 생긴 수요'의 유일한 실측 증거.
  // 상대지수라 절대 검색량으로 환산하지 않는다. 잡혔나/안 잡혔나만 쓴다.
  const hasLiveDemand = m.demandRecent7 != null && m.demandRecent7 > 0;
  const docMeasured = documentCount != null && documentCount > 0 && !m.isDocumentCountEstimated;

  // 판정은 실측 수요 경로 하나. 검색광고 검색량 경로는 쓰지 않는다.
  // 실측 근거(2026-09-02, 후보 60개 퍼널): 검색량실측 20 → 하한 13 → 저경쟁 1 → 황금비 0.
  // 이슈 키워드는 뉴스가 터지면 블로그가 먼저 쏟아지고 검색이 뒤따라서
  // 문서수 > 검색량 이 항상 성립한다 (통과한 '고우석 아내'조차 sv 360 / doc 857 = 0.42).
  const demandRoute = thresholds.useLiveDemandRoute
    && hasLiveDemand && docMeasured && lowComp && alive && !flooded && m.demandStatus !== 'dead';

  // 선점 후보 — 신제품·신모델은 발표 당일 문서수도 0, 데이터랩 수요도 0 이다.
  // 실측(2026-09-03): 다이슨 '카메라젯' 발표 당일 — "카메라젯 상용화" 문서 1건 / 수요 0,
  // "카메라젯 뜻" 문서 3건 / 수요 0. 경쟁은 없는데 수요 증거도 없다.
  // 틈새로 섞으면 근거가 다른 것을 같은 얼굴로 내보내게 되므로 따로 세운다.
  const preemptionDocMax = thresholds.preemptionDocMax ?? 300;
  const isPreemption = !demandRoute
    && !hasLiveDemand
    && docMeasured
    && documentCount! <= preemptionDocMax
    && alive
    && !flooded;

  const reasons: string[] = [];
  if (hasTraffic) reasons.push(`검색량 ${searchVolume!.toLocaleString()}`);
  if (lowComp) reasons.push(`문서수 ${documentCount!.toLocaleString()}`);
  if (demandRoute) reasons.push('데이터랩 실측 수요');
  if (isPreemption) reasons.push(`선점 후보 — 경쟁 문서 ${documentCount!.toLocaleString()}건, 수요 미검출`);
  if (m.demandStatus === 'rising') reasons.push('수요 상승중');
  if (flooded) reasons.push('오늘 도배중');
  if (m.recencyStatus === 'dead') reasons.push('수요 죽음');
  if (isEstimated) reasons.push('추정치');

  let nicheScore = 0;
  if (documentCount != null && documentCount > 0) nicheScore += Math.max(0, 45 - Math.log10(documentCount) * 9);
  if (hasTraffic) nicheScore += 12;
  if (hasLiveDemand) nicheScore += 10;
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
    isNiche: demandRoute,
    nicheRoute: demandRoute ? 'demand' : null,
    isPreemption,
    nicheScore,
    reasons,
  };
}
