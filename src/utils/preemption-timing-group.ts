/**
 * 시기 그룹 — 보드를 "언제 쓸 것"으로 묶는 라벨.
 *
 * 전부 실측의 단순 산술이다: monthsToPeak 는 데이터랩 24개월 시계열에서 센
 * 값이고(keyword-demand-shape), 유형(trendShape)도 같은 실측 분류다.
 * 확률·예상 유입을 말하지 않는다 — 그건 이 화면의 금지어다.
 *
 * ── 2026-09-12: 모양 라벨만 믿다가 보드가 거짓말을 했다 ──
 * 사장님: "선점보드를 보면 뻔한 키워드말고 지금 미리쓰면 나중에 몇월달에 트래픽이
 * 몰릴가능성이있는 키워드를 알려주고".
 *
 * 실측하니 43행 중 **17행이 '지금 뜨는 중' 배지를 달고 같은 행에 "피크의 14%" 를
 * 적고 있었다.** 피크가 이미 1~17개월 전에 지난 것들이다:
 *   제주렌트카 본사   지금 뜨는 중 · 피크의 14% · 피크 1개월 전
 *   광명 지역화폐 사용처 지금 뜨는 중 · 피크의  4% · 피크 17개월 전
 * trendShape='rising' 은 **1년 전 같은 기간과 견준 값**이라 "작년보다 늘었다"는 뜻이지
 * "지금이 고점"이라는 뜻이 아니다. 그걸 '지금 뜨는 중'으로 옮겨 적은 것이 거짓의 자리였다.
 *
 * 그래서 라벨을 모양이 아니라 **지금 수준**으로 정한다. 재료는 둘 다 이미 재 놓은 값이다:
 *   latestVsPeakPct  마지막 완결 달이 피크의 몇 % 인가
 *   monthsSincePeak  피크가 몇 달 전이었나
 */

export type TimingGroup =
  | '지금 적기'        // 성수기 1~3개월 전 — 상위노출까지 걸리는 시간을 빼면 지금이 착수 시점
  | '준비 시기'        // 성수기까지 4개월 이상 — 미리 써 두면 시즌에 올라간다
  | '지금 뜨는 중'     // 상승세이고 **지금도 고점 언저리** — 문서가 쌓이기 전이 선점 적기
  | '성수기 지남'      // 피크가 지났고 지금은 그때의 절반도 안 된다
  | '연중 상시'        // 에버그린 — 언제 써도 수요가 있다
  | '';                // 시기 실측 없음 — 못 잰 것을 지어내지 않는다

export interface TimingGroupInput {
  trendShape?: string | null;
  monthsToPeak?: number | null;
  /** 마지막 완결 달이 피크의 몇 %인가(데이터랩 실측). */
  latestVsPeakPct?: number | null;
  /** 피크가 몇 달 전이었나(데이터랩 실측). */
  monthsSincePeak?: number | null;
}

/**
 * '지금 뜨는 중' 이라고 말하려면 지금이 피크의 이만큼은 되어야 한다.
 *
 * 60%로 둔 이유(실측 2026-09-12): 거짓 배지 17행의 지금 수준이 4~29% 였고,
 * 진짜로 오르는 중인 행은 피크와 같은 달이거나 그 언저리였다. 사이에 넉넉한 턱을 둔다.
 */
export const RISING_MIN_PCT = 60;
/** 피크가 이만큼 지났으면 '지남'을 말할 수 있다. 한 달 차이는 측정 흔들림이다. */
export const PAST_PEAK_MONTHS = 2;

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function judgeTimingGroup(input: TimingGroupInput): TimingGroup {
  const months = input.monthsToPeak === null || input.monthsToPeak === undefined ? null : num(input.monthsToPeak);
  const pct = input.latestVsPeakPct === null || input.latestVsPeakPct === undefined ? null : num(input.latestVsPeakPct);
  const since = input.monthsSincePeak === null || input.monthsSincePeak === undefined ? null : num(input.monthsSincePeak);

  // ① 앞으로 올 성수기가 있으면 그것이 먼저다 — 이 보드의 존재 이유다.
  if (input.trendShape === 'seasonal' && months !== null && months >= 1) {
    return months <= 3 ? '지금 적기' : '준비 시기';
  }

  /*
   * ② 피크가 지났고 지금이 그때의 절반도 안 되면 '지남'이다.
   *    모양이 'rising' 이어도 그렇다 — rising 은 작년 대비이지 지금 고점이라는 뜻이 아니다.
   */
  if (pct !== null && pct < RISING_MIN_PCT && since !== null && since >= PAST_PEAK_MONTHS) {
    return '성수기 지남';
  }

  // ③ 상승세는 **지금도 고점 언저리**일 때만 그렇게 부른다.
  if (input.trendShape === 'rising') {
    if (pct === null) return '지금 뜨는 중';       // 못 쟀으면 모양 판정을 그대로 쓴다
    return pct >= RISING_MIN_PCT ? '지금 뜨는 중' : '성수기 지남';
  }

  if (input.trendShape === 'evergreen') return '연중 상시';

  // ④ 모양은 못 갈랐지만 지금 수준이 낮고 피크가 지났으면 그 사실은 말할 수 있다.
  if (pct !== null && pct < RISING_MIN_PCT && since !== null && since >= PAST_PEAK_MONTHS) return '성수기 지남';
  return '';
}
