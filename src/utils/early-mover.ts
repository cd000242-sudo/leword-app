/**
 * "뜨는 중인데 아직 아무도 모르는" 키워드 판정.
 *
 * 왜 따로 두는가:
 *   자리가 비어 있는 이유는 두 가지다. ① 아무도 관심이 없어서, ② 아직 아무도
 *   눈치를 못 채서. 트래픽이 되는 건 ②뿐이다. 그런데 "자리가 비었다"는 사실
 *   하나로는 둘이 구분되지 않는다.
 *
 *   구분에 필요한 값은 이미 다 재고 있었다 — 24개월 수요 곡선(상승 중인가),
 *   검색량 대비 문서수(밭이 비었는가), 실시간 검색어 대조(이미 퍼졌는가),
 *   AI 브리핑(클릭이 오기는 하는가), 최초 관측 장부(새로 생긴 말인가).
 *   흩어져 있던 걸 여기서 합친다.
 *
 * 전부 관측값이다. 점수·확률을 만들지 않는다 — 조건을 만족했는지와,
 * 무엇을 보고 그렇게 봤는지만 돌려준다.
 */
import type { DemandShape } from './keyword-demand-shape';

export interface EarlyMoverInput {
  /** 24개월 수요 곡선 판정. */
  shape: DemandShape | null;
  searchVolume: number | null;
  documentCount: number | null;
  /** 상위 표본 중 이 키워드를 정면으로 다룬 글 수(실측). */
  facingPosts?: number | null;
  /** 정면 글을 몇 개 중에서 셌는가. 표본 없이 0건은 '못 봤다'다. */
  sampledTitles?: number | null;
  /**
   * 실시간 검색어에 지금 올라와 있는가. 올라와 있으면 이미 퍼진 것이다.
   * null/undefined 는 '못 쟀다'이지 '없다'가 아니다 — 근거로 세지 않는다.
   */
  inRealtimeNow: boolean | null;
  /** 우리 장부에 처음 들어온 시각. 없으면 언제부터 있었는지 모른다. */
  firstSeenAt?: string | null;
  /**
   * AI 브리핑이 떠 있었는가. undefined 는 '안 봤다'이지 '없다'가 아니다.
   * 브리핑이 답을 대신하면 자리를 선점해도 클릭이 안 온다 — "먹는다"는 전제가 깨진다.
   */
  hasAiBriefing?: boolean;
  nowMs?: number;
}

export interface EarlyMoverResult {
  /** 다섯 조건을 다 만족했는가. */
  early: boolean;
  /** 화면에 그대로 쓸 근거. 만족한 것만 담는다. */
  reasons: string[];
  /** 만족 못 한 조건. 왜 아닌지 설명할 때 쓴다. */
  missing: string[];
}

export interface EarlyMoverThresholds {
  /** @deprecated 판정에 안 쓴다 — '밭 비어 있음'은 정면 글 수 실측으로 교체(2026-08-12). */
  minRatio: number;
  /** 처음 관측된 지 이 시간 안이면 "새로 생긴 말"로 본다. */
  freshHours: number;
}

/**
 * 게이트 하한(비율 1)보다 높게 잡는다.
 * 통과 최소선과 "지금 들어가면 먹는다"는 같은 값일 수 없다.
 */
export const DEFAULT_EARLY_MOVER: EarlyMoverThresholds = {
  minRatio: 2,
  /*
   * 관측 주기보다 짧으면 이 조건은 **영원히 못 맞춘다** (2026-08-11 확인).
   *
   * 장부는 보드 배치가 돌 때만 적힌다. 배치는 월·금 07:00 뿐이라 두 관측 사이의
   * 최소 간격이 금→월 72시간, 월→금 96시간이다. 72시간으로 두면 금→월 이 딱
   * 경계에 걸리고(실제로는 회차 안에서 배치·발행 시각이 벌어져 늘 72를 넘는다),
   * 월→금 은 96시간이라 무조건 탈락한다. 그래서 '선점 적기' 가 구조적으로 0행이었다.
   *
   * 이 값이 재는 것은 "세상에 없던 말" 이 아니라 **"직전 회차에는 우리 장부에
   * 없던 말"** 이다. 주 2회 관측으로 그보다 정밀하게 말할 수는 없다.
   * 그래서 한 회차 간격(최대 96시간)에 여유를 붙인다. 주기를 바꾸면 여기도 바꾼다.
   */
  freshHours: 120,
};

const num = (value: number) => value.toLocaleString('ko-KR');

function hoursSince(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return (nowMs - then) / 3_600_000;
}

/**
 * 선점 적기인지 가른다.
 *
 * 다섯 조건 중 하나라도 못 재면 그 조건은 **만족하지 않은 것으로** 둔다.
 * 모르는 것을 만족으로 세면 "지금 들어가면 먹는다"고 말해 놓고 근거가 없게 된다.
 */
export function judgeEarlyMover(
  input: EarlyMoverInput,
  thresholds: EarlyMoverThresholds = DEFAULT_EARLY_MOVER,
): EarlyMoverResult {
  const reasons: string[] = [];
  const missing: string[] = [];
  const nowMs = input.nowMs ?? Date.now();

  if (input.shape === 'rising') {
    reasons.push('24개월 수요 곡선이 오르는 중이다');
  } else {
    missing.push('수요가 오르는 중이 아니다');
  }

  /*
   * "밭이 비어 있다" 는 문서수 비율이 아니라 **정면 글 수**로 잰다 (2026-08-12 교체).
   *
   * 비율(검색량 ÷ 문서수) 2배 조건은 단위가 안 맞아 거의 못 넘는다 — 검색량은 지난
   * 한 달의 횟수이고 문서수는 10년치 누적 broad 매치다. 실측 34행 중 6행만 통과했고,
   * 다른 조건들과의 교집합은 0 이라 '선점 적기' 가 구조적으로 0행이었다.
   * 상위 표본에서 정면으로 다룬 글이 0건이면 그 밭은 비어 있는 것이다 —
   * 같은 날 titleCoverage 를 고치며 확립한 기준과 같은 자를 쓴다.
   */
  const facing = input.facingPosts;
  const sampled = input.sampledTitles;
  if (typeof facing === 'number' && typeof sampled === 'number' && sampled > 0) {
    if (facing === 0) {
      reasons.push(`상위 ${num(sampled)}개 중 정면으로 다룬 글 0건 — 밭이 비어 있다`);
    } else {
      missing.push(`이미 정면으로 다룬 글이 ${num(facing)}건 있다`);
    }
  } else {
    missing.push('정면 글 수를 못 쟀다');
  }

  /*
   * 못 잰 것을 "없다" 로 세지 않는다.
   *
   * 보드 워크플로가 실시간 스냅샷을 안 넘기던 동안 이 값이 전 행 false 였고,
   * 그래서 "실시간 검색어에는 아직 없다 — 대중화 전이다" 가 **재보지도 않은 채**
   * 근거로 붙었다. hasAiBriefing 과 같은 3상태로 다룬다(true/false/못 쟀음).
   */
  if (input.inRealtimeNow === false) {
    reasons.push('실시간 검색어에는 아직 없다 — 대중화 전이다');
  } else {
    missing.push(input.inRealtimeNow === true
      ? '실시간 검색어에 이미 올라 있다'
      : '실시간 검색어를 못 쟀다');
  }

  if (input.hasAiBriefing === false) {
    reasons.push('AI 브리핑이 없다 — 클릭이 글로 온다');
  } else {
    missing.push(input.hasAiBriefing === true ? 'AI 브리핑이 답을 대신한다' : 'AI 브리핑을 못 쟀다');
  }

  const age = hoursSince(input.firstSeenAt, nowMs);
  if (age !== null && age <= thresholds.freshHours) {
    reasons.push(`${Math.max(1, Math.round(age))}시간 전에 처음 관측된 말이다`);
  } else {
    missing.push('새로 생긴 말이라는 근거가 없다');
  }

  return { early: missing.length === 0, reasons, missing };
}
