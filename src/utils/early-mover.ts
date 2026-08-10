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
 *   최초 관측 장부(새로 생긴 말인가). 흩어져 있던 걸 여기서 합친다.
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
  /** 실시간 검색어에 지금 올라와 있는가. 올라와 있으면 이미 퍼진 것이다. */
  inRealtimeNow: boolean;
  /** 우리 장부에 처음 들어온 시각. 없으면 언제부터 있었는지 모른다. */
  firstSeenAt?: string | null;
  nowMs?: number;
}

export interface EarlyMoverResult {
  /** 네 조건을 다 만족했는가. */
  early: boolean;
  /** 화면에 그대로 쓸 근거. 만족한 것만 담는다. */
  reasons: string[];
  /** 만족 못 한 조건. 왜 아닌지 설명할 때 쓴다. */
  missing: string[];
}

export interface EarlyMoverThresholds {
  /** 이 배수 이상으로 문서보다 검색이 많아야 "아직 안 채워진 밭"이다. */
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
  freshHours: 72,
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
 * 네 조건 중 하나라도 못 재면 그 조건은 **만족하지 않은 것으로** 둔다.
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

  const { searchVolume, documentCount } = input;
  if (searchVolume !== null && documentCount !== null && documentCount > 0
    && searchVolume / documentCount >= thresholds.minRatio) {
    reasons.push(`검색 ${num(searchVolume)}회에 글이 ${num(documentCount)}개뿐이다`);
  } else {
    missing.push('밭이 이미 채워져 있다');
  }

  if (!input.inRealtimeNow) {
    reasons.push('실시간 검색어에는 아직 없다 — 대중화 전이다');
  } else {
    missing.push('실시간 검색어에 이미 올라 있다');
  }

  const age = hoursSince(input.firstSeenAt, nowMs);
  if (age !== null && age <= thresholds.freshHours) {
    reasons.push(`${Math.max(1, Math.round(age))}시간 전에 처음 관측된 말이다`);
  } else {
    missing.push('새로 생긴 말이라는 근거가 없다');
  }

  return { early: missing.length === 0, reasons, missing };
}
