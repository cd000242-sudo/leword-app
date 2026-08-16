/**
 * 시기 그룹 — 보드를 "언제 쓸 것"으로 묶는 라벨.
 *
 * 전부 실측의 단순 산술이다: monthsToPeak 는 데이터랩 24개월 시계열에서 센
 * 값이고(keyword-demand-shape), 유형(trendShape)도 같은 실측 분류다.
 * 확률·예상 유입을 말하지 않는다 — 그건 이 화면의 금지어다.
 */

export type TimingGroup =
  | '지금 적기'        // 성수기 1~3개월 전 — 상위노출까지 걸리는 시간을 빼면 지금이 착수 시점
  | '준비 시기'        // 성수기까지 4개월 이상 — 미리 써 두면 시즌에 올라간다
  | '지금 뜨는 중'     // 상승세 — 문서가 쌓이기 전이 선점 적기
  | '연중 상시'        // 에버그린 — 언제 써도 수요가 있다
  | '';                // 시기 실측 없음 — 못 잰 것을 지어내지 않는다

export interface TimingGroupInput {
  trendShape?: string | null;
  monthsToPeak?: number | null;
}

export function judgeTimingGroup(input: TimingGroupInput): TimingGroup {
  const months = Number.isFinite(Number(input.monthsToPeak)) && input.monthsToPeak !== null
    ? Number(input.monthsToPeak)
    : null;
  if (input.trendShape === 'seasonal' && months !== null) {
    return months <= 3 ? '지금 적기' : '준비 시기';
  }
  if (input.trendShape === 'rising') return '지금 뜨는 중';
  if (input.trendShape === 'evergreen') return '연중 상시';
  return '';
}
