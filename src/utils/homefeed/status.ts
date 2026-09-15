/**
 * WINDOW(창) · STATUS(상태) 판정과 정렬 — 사유 코드 배열로만 말한다. 점수 · 확률은 없다.
 *
 * 임계값은 중앙 설정(가설값)에서만 온다. 처음 본 시각이 검열(censored)이면 나이가 하한일 뿐이라
 * '열리는 중(OPENING)'으로 부르지 않는다 — 실제로는 더 오래된 이슈일 수 있기 때문이다.
 */
import type {
  HomefeedAngle,
  HomefeedDecision,
  HomefeedDelta,
  HomefeedFirstCard,
  HomefeedFunGapReason,
  HomefeedNoSearch,
  HomefeedRevealLayer,
  HomefeedSignals,
  HomefeedStory,
  HomefeedStoryStatus,
  HomefeedTellability,
  HomefeedWindowState,
} from './types';
import type { HomefeedSettings } from './settings';

export function decideWindow(
  input: { signals: HomefeedSignals; alternativeAngles: readonly HomefeedAngle[]; funGap: readonly HomefeedFunGapReason[] },
  settings: HomefeedSettings,
): HomefeedDecision<HomefeedWindowState> {
  const s = input.signals;
  const w = settings.window;
  if (s.sampleN === 0) return { state: 'UNKNOWN', reasons: ['NO_SAMPLE'] };
  if (s.ageMinutes === null) return { state: 'UNKNOWN', reasons: ['NO_AGE'] };
  if (s.cloneRatio !== null && s.cloneRatio >= w.closedCloneRatio && input.alternativeAngles.length === 0) {
    return { state: 'CLOSED', reasons: ['CLONE_SATURATED', 'NO_ALT_ANGLE'] };
  }

  const narrowing: string[] = [];
  if (s.cloneRatio !== null && s.cloneRatioPrev30m !== null && s.cloneRatio - s.cloneRatioPrev30m >= w.narrowingCloneRise) narrowing.push('CLONE_RISING');
  if (s.docVelocity30m !== null && s.docVelocity30m >= w.narrowingDocVelocity) narrowing.push('DOC_VELOCITY_HIGH');
  if (narrowing.length > 0) return { state: 'NARROWING', reasons: narrowing };

  if (!s.firstSeenCensored && s.ageMinutes <= w.openingMaxAgeMinutes) {
    const decelerating = s.docAcceleration !== null && s.docAcceleration < 0
      && !(s.sourceDelta30m !== null && s.sourceDelta30m > 0)
      && !(s.rankDelta30m !== null && s.rankDelta30m < 0);
    if (decelerating) return { state: 'NARROWING', reasons: ['EARLY_BUT_DECELERATING'] };
    const reasons = ['YOUNG_ISSUE'];
    if (s.docAcceleration !== null && s.docAcceleration >= 0) reasons.push('DOC_ACCELERATING');
    if (s.sourceDelta30m !== null && s.sourceDelta30m > 0) reasons.push('SOURCES_GROWING');
    if (s.rankDelta30m !== null && s.rankDelta30m < 0) reasons.push('RANK_RISING');
    return { state: 'OPENING', reasons };
  }

  const hasAngle = input.alternativeAngles.length > 0 || input.funGap.length > 0;
  if (s.sourceCountNow !== null && s.sourceCountNow >= w.openMinSources && s.cloneRatio !== null && s.cloneRatio <= w.openMaxCloneRatio && hasAngle) {
    return { state: 'OPEN', reasons: ['SOURCES_OK', 'CLONE_LOW', input.alternativeAngles.length > 0 ? 'ALT_ANGLE' : 'FUN_GAP'] };
  }
  if (s.cloneRatio !== null && s.cloneRatio > w.openMaxCloneRatio) return { state: 'NARROWING', reasons: ['CLONE_ABOVE_OPEN'] };
  if (s.sourceCountNow === null) return { state: 'UNKNOWN', reasons: ['SOURCES_UNMEASURED'] };
  if (!hasAngle) return { state: 'NARROWING', reasons: ['NO_ANGLE_EVIDENCE'] };
  return { state: 'NARROWING', reasons: ['SOURCES_BELOW_OPEN'] };
}

export interface StatusInput {
  signals: HomefeedSignals;
  window: HomefeedDecision<HomefeedWindowState>;
  delta: HomefeedDelta | null;
  deltaReason: string | null;
  alternativeAngles: readonly HomefeedAngle[];
  funGap: readonly HomefeedFunGapReason[];
  payoffLayers: readonly HomefeedRevealLayer[];
  noSearch: HomefeedNoSearch;
  tellability: HomefeedTellability;
  firstCard: HomefeedFirstCard;
  risks: readonly string[];
}

const DROP_RISKS = ['NO_EVIDENCE', 'RUMOR_ONLY', 'FAN_ONLY'];

export function decideStatus(input: StatusInput, settings: HomefeedSettings): HomefeedDecision<HomefeedStoryStatus> {
  const dropRisks = input.risks.filter((risk) => DROP_RISKS.includes(risk));
  if (dropRisks.length > 0) return { state: 'DROP', reasons: dropRisks };
  if (input.risks.includes('SINGLE_SOURCE') && input.payoffLayers.length <= 1) return { state: 'DROP', reasons: ['SINGLE_SOURCE', 'SHALLOW_PAYOFF'] };

  const gates: string[] = [];
  if (input.window.state !== 'OPEN' && input.window.state !== 'OPENING') gates.push(`WINDOW_${input.window.state}`);
  if (!input.delta) gates.push(input.deltaReason === 'NO_HISTORY' ? 'NO_HISTORY' : 'NO_FRESH_DELTA');
  if (input.signals.sampleN < settings.story.minSamplesForNow) gates.push('FEW_SAMPLES');
  if (input.signals.pressCountNow < settings.story.minPressForNow) gates.push('FEW_PRESS');
  if (input.alternativeAngles.length === 0) gates.push('NO_ALT_ANGLE');
  if (input.funGap.length === 0) gates.push('NO_FUN_GAP');
  if (input.payoffLayers.length < settings.story.payoffMin) gates.push('SHALLOW_PAYOFF');
  if (!input.noSearch.passed) gates.push('NO_SEARCH_FAILED');
  if (!input.tellability.passed) gates.push('NOT_TELLABLE');
  if (!input.firstCard.possible) gates.push('CARD_NOT_READY');

  // 창이 닫힌 이슈는 걸림 말이 없어도 '늦음'이다 — 한때 있던 이야기가 포화된 것이지 처음부터 카드가 안 되는 것이 아니다.
  if (input.window.state === 'CLOSED') return { state: 'LATE', reasons: gates };
  if (!input.firstCard.hook && input.deltaReason !== 'NO_HISTORY') return { state: 'DROP', reasons: ['NO_CARD_HOOK'] };
  if (gates.length === 0) return { state: 'NOW', reasons: ['ALL_GATES_PASSED'] };
  if (input.window.state === 'NARROWING' && input.alternativeAngles.length === 0) return { state: 'LATE', reasons: gates };
  if (input.deltaReason === 'NO_HISTORY' || input.window.state === 'OPENING') return { state: 'EARLY', reasons: gates };
  return { state: 'WATCH', reasons: gates };
}

const WINDOW_ORDER: Record<HomefeedWindowState, number> = { OPEN: 0, OPENING: 1, NARROWING: 2, UNKNOWN: 3, CLOSED: 4 };

function descNullLast(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

function ascNullLast(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

/** 명령서 정렬: WINDOW → 가속 → 원천 확산 → 재미 근거 수 → 정보층 수 → 나이(젊은 것 먼저). */
export function compareStories(a: HomefeedStory, b: HomefeedStory): number {
  return WINDOW_ORDER[a.window.state] - WINDOW_ORDER[b.window.state]
    || descNullLast(a.signals.docAcceleration, b.signals.docAcceleration)
    || descNullLast(a.signals.sourceCountNow, b.signals.sourceCountNow)
    || b.funGap.length - a.funGap.length
    || b.payoffLayers.length - a.payoffLayers.length
    || ascNullLast(a.signals.ageMinutes, b.signals.ageMinutes)
    || a.keyword.localeCompare(b.keyword, 'ko');
}
