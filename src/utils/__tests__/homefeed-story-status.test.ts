import { describe, expect, it } from 'vitest';
import { anglesOf, clusterSamples, revealLayersOf } from '../homefeed/clusters';
import { buildStories, buildStory } from '../homefeed/engine';
import { compareStories, decideStatus, decideWindow } from '../homefeed/status';
import { detectTensions, freshDeltaOf, funGapOf, risksOf, tellabilityOf } from '../homefeed/story';
import { titleTokens } from '../homefeed/text';
import type { HomefeedSignals, HomefeedStory } from '../homefeed/types';
import { at, issue, ledger, sample, settings, snapshot } from './homefeed-fixtures';

/**
 * 홈판 신호 — 스토리 6요소 · 게이트 · 창 · 상태(2026-09-16).
 * 근거 없는 요소는 만들지 않는다: 긴장 · 재미 근거 · 각도 · 정보층은 전부 표본 제목에 실제로 있는 말과 그 주소를 싣는다.
 */
const KEY = '손흥민 이적';
const latestSamples = [
  sample('손흥민 이적 결국 LA행 확정', { url: 'https://a.com/1', press: 'a.com', image: 'https://img.a.com/1.jpg' }),
  sample('손흥민, 이적료 "300억" 알고 보니', { url: 'https://b.com/2', press: 'b.com', image: 'https://img.b.com/2.jpg' }),
  sample('손흥민 10년 만에 토트넘 떠난다', { url: 'https://c.com/3', press: 'c.com' }),
  sample('손흥민 이적 결국 LA행 확정 공식', { url: 'https://d.com/4', press: 'd.com' }),
];
const baselineSamples = [sample('손흥민 이적설 솔솔', { url: 'https://old.com/1', press: 'old.com' })];

function storyHistory() {
  return [
    snapshot(at(0), [issue(KEY, { category: 'sports', ranks: { 'signal.bz': 8 }, blogDocCount: 100, samples: baselineSamples })]),
    snapshot(at(40), [issue(KEY, { category: 'sports', ranks: { 'signal.bz': 3, nate: 5 }, blogDocCount: 130, samples: latestSamples })]),
  ];
}

describe('묶음 · 각도 · 정보층', () => {
  const anchor = titleTokens(KEY);
  const clusters = clusterSamples(latestSamples, anchor, 0.6);

  it('기준어를 빼고 비슷한 제목끼리 묶는다', () => {
    expect(clusters.map((cluster) => cluster.members)).toEqual([[0, 3], [1], [2]]);
  });

  it('작은 묶음의 사실 말(숫자 · 사건 말)만 다른 각도로 싣고, 근거 주소를 붙인다', () => {
    const { dominant, alternatives, confidence } = anglesOf(latestSamples, clusters, anchor);
    expect(dominant?.label).toBe('결국 LA행 확정 공식');
    expect(alternatives.map((angle) => angle.label)).toEqual(['이적료 300억', '10년']);
    expect(alternatives[0].evidence[0].url).toBe('https://b.com/2');
    expect(confidence).toBe('low');
  });

  it('정보층은 숫자 · 인용 · 사건 말을 값으로 접는다(같은 값은 한 층)', () => {
    expect(revealLayersOf(latestSamples, KEY).map((layer) => [layer.kind, layer.value])).toEqual([['event', '확정'], ['number', '300억'], ['number', '10년']]);
  });
});

describe('긴장 · 새 사실 · 재미 근거', () => {
  const tensions = detectTensions(latestSamples);

  it('제목 표면에서 긴장을 찾고 걸린 말과 근거 제목을 싣는다', () => {
    expect(tensions.map((tension) => [tension.type, tension.matched])).toEqual([
      ['relationship_shift', '이적'], ['result_first', '결국'], ['expectation_break', '알고 보니'], ['number_conflict', '10년 만에'], ['past_vs_now', '10년 만'],
    ]);
    expect(tensions[3].evidence.url).toBe('https://c.com/3');
  });

  it('이력이 없으면 새 사실은 NO_HISTORY, 새로 쓴 말이 없으면 NO_NEW_FACT', () => {
    const latest = issue(KEY, { samples: latestSamples });
    expect(freshDeltaOf(latest, null)).toEqual({ delta: null, reason: 'NO_HISTORY' });
    expect(freshDeltaOf(latest, { capturedAt: at(0), issue: issue(KEY, { samples: latestSamples }) }).reason).toBe('NO_NEW_FACT');
  });

  it('30분 전 표본에 없던 사실 말을 원래 표기로 싣는다', () => {
    const { delta } = freshDeltaOf(issue(KEY, { samples: latestSamples }), { capturedAt: at(0), issue: issue(KEY, { samples: baselineSamples }) });
    expect(delta).toMatchObject({ text: '결국 LA행 확정', comparedWith: at(0) });
    expect(delta?.evidence.url).toBe('https://a.com/1');
  });

  it('재미 근거는 긴장 · 인용 · 한 줄 요약에서만 나오고 전부 근거를 단다', () => {
    const { delta } = freshDeltaOf(issue(KEY, { samples: latestSamples }), { capturedAt: at(0), issue: issue(KEY, { samples: baselineSamples }) });
    const tell = tellabilityOf({ text: '손흥민' }, delta, tensions);
    expect(tell).toMatchObject({ passed: true, sentence: '손흥민 결국 LA행 확정 이적' });
    const funGap = funGapOf(tensions, latestSamples, { visualCandidateCount: 2 }, tell);
    expect(funGap.map((reason) => reason.flag)).toEqual([
      'relationship_change', 'outcome_mismatch', 'unexpected_fact', 'surprising_number', 'visible_contrast', 'before_after', 'strong_quote', 'socially_tellable',
    ]);
    expect(funGap.every((reason) => reason.evidence.url.startsWith('https://'))).toBe(true);
    expect(funGapOf([], [sample('평범한 제목')], { visualCandidateCount: 0 }, { passed: false, sentence: null, evidence: null, reason: 'NO_DELTA_OR_TENSION' })).toEqual([]);
  });

  it('루머 표지뿐인 표본 · 매체 하나 · 팬 전용 말은 위험 사유가 된다', () => {
    const rumor = [sample('아이돌 A 열애설'), sample('아이돌 A 열애설 솔솔', { press: 'x.com' })];
    expect(risksOf(rumor, { sampleN: 2, pressCountNow: 2, firstSeenCensored: false }, 'entertainment')).toEqual(['RUMOR_ONLY']);
    expect(risksOf([sample('단독 기사')], { sampleN: 1, pressCountNow: 1, firstSeenCensored: true }, 'incident')).toEqual(['SINGLE_SOURCE', 'AGE_CENSORED', 'SENSITIVE_INCIDENT']);
  });
});

describe('스토리 조립 · 게이트', () => {
  const rows = storyHistory();
  const state = ledger([{ keyword: KEY, firstSeenAt: at(0) }]);
  const story = buildStory(rows, rows[1], rows[1].issues[0], state, settings());

  it('게이트를 모두 통과하면 NOW, 사유는 ALL_GATES_PASSED', () => {
    expect(story.window).toEqual({ state: 'OPENING', reasons: ['YOUNG_ISSUE', 'SOURCES_GROWING', 'RANK_RISING'] });
    expect(story.status).toEqual({ state: 'NOW', reasons: ['ALL_GATES_PASSED'] });
    expect(story.noSearch.passed).toBe(true);
    expect(story.firstCard).toMatchObject({ possible: true, headline1: '손흥민 결국', headline2: '이적', hook: '결국' });
    expect(story.firstCard.checks.every((check) => check.passed)).toBe(true);
    expect(story.id.startsWith('손흥민이적:')).toBe(true);
  });

  it('카드 3안은 실제 이미지 · 숫자 문구 · 미니멀이고, 문구는 근거 제목의 말 조각이다', () => {
    expect(story.firstCard.variants.map((variant) => [variant.id, variant.line1, variant.line2])).toEqual([
      ['A', '손흥민 결국', '이적'], ['B', '10년 만에', '손흥민'], ['C', '손흥민', null],
    ]);
  });

  it('이력이 없는 첫 회차(검열된 나이)는 OPENING 이라 부르지 않고 EARLY 로 둔다', () => {
    const lone = [rows[1]];
    const first = buildStory(lone, lone[0], lone[0].issues[0], ledger([{ keyword: KEY, firstSeenAt: at(40), censored: true }]), settings());
    expect(first.deltaReason).toBe('NO_HISTORY');
    expect(first.window.state).toBe('OPEN');
    expect(first.status.state).toBe('EARLY');
    expect(first.status.reasons).toContain('NO_HISTORY');
  });

  it('같은 제목만 가득하고 다른 각도가 없으면 CLOSED · LATE', () => {
    const clones = Array.from({ length: 5 }, (_, index) => sample('유튜버 A 복귀 영상 공개', { url: `https://x.com/${index}`, press: `p${index}.com` }));
    const closedRows = [
      snapshot(at(0), [issue('유튜버 A', { category: 'entertainment', samples: clones })]),
      snapshot(at(120), [issue('유튜버 A', { category: 'entertainment', samples: clones })]),
    ];
    const closed = buildStory(closedRows, closedRows[1], closedRows[1].issues[0], ledger([{ keyword: '유튜버 A', firstSeenAt: at(0) }]), settings());
    expect(closed.window).toEqual({ state: 'CLOSED', reasons: ['CLONE_SATURATED', 'NO_ALT_ANGLE'] });
    expect(closed.status.state).toBe('LATE');
  });

  it('스냅샷이 없으면 빈 목록 — 지어낸 스토리가 없다', () => {
    expect(buildStories({ history: [], state: ledger([]), settings: settings(), computedAt: at(0) })).toMatchObject({ stories: [], snapshotAt: null });
  });
});

function signalsWith(patch: Partial<HomefeedSignals>): HomefeedSignals {
  return {
    ageMinutes: 200, firstSeenAt: at(0), firstSeenCensored: false, sourceCountNow: 2, sourceNames: ['signal.bz', 'nate'], sourceDelta30m: 0, sourceDelta60m: 0,
    pressCountNow: 3, rankNow: 3, rankSource: 'signal.bz', rankDelta30m: 0, rankDelta60m: 0, newsTotalNow: 10, newsDelta30m: 0, blogDocNow: 100,
    docDelta10m: 0, docDelta30m: 0, docDelta60m: 0, docVelocity30m: 0, docAcceleration: 0, persistenceStreak: 3, presence60m: { seen: 3, total: 3 },
    sampleN: 6, cloneN: 2, cloneRatio: 0.33, cloneRatioPrev30m: 0.33, visualCandidateCount: 1, ...patch,
  };
}

describe('창(WINDOW) 규칙', () => {
  const angle = [{ label: '다른 각도', tokens: ['다른'], evidence: [] }];
  const s = settings();

  it('필수 지표를 못 쟀으면 UNKNOWN', () => {
    expect(decideWindow({ signals: signalsWith({ sampleN: 0 }), alternativeAngles: angle, funGap: [] }, s).state).toBe('UNKNOWN');
    expect(decideWindow({ signals: signalsWith({ ageMinutes: null }), alternativeAngles: angle, funGap: [] }, s).reasons).toEqual(['NO_AGE']);
  });

  it('복제 비율이 오르거나 문서가 빨리 늘면 NARROWING', () => {
    expect(decideWindow({ signals: signalsWith({ cloneRatio: 0.5, cloneRatioPrev30m: 0.3 }), alternativeAngles: angle, funGap: [] }, s).reasons).toEqual(['CLONE_RISING']);
    expect(decideWindow({ signals: signalsWith({ docVelocity30m: 5 }), alternativeAngles: angle, funGap: [] }, s).reasons).toEqual(['DOC_VELOCITY_HIGH']);
  });

  it('젊어도 문서 증가가 꺾이고 원천 · 순위가 안 오르면 NARROWING', () => {
    expect(decideWindow({ signals: signalsWith({ ageMinutes: 30, docAcceleration: -5 }), alternativeAngles: angle, funGap: [] }, s).reasons).toEqual(['EARLY_BUT_DECELERATING']);
  });

  it('원천 · 낮은 복제 · 각도가 있으면 OPEN, 각도 근거가 없으면 NARROWING', () => {
    expect(decideWindow({ signals: signalsWith({}), alternativeAngles: angle, funGap: [] }, s).state).toBe('OPEN');
    expect(decideWindow({ signals: signalsWith({}), alternativeAngles: [], funGap: [] }, s).reasons).toEqual(['NO_ANGLE_EVIDENCE']);
  });
});

describe('정렬', () => {
  const make = (keyword: string, window: HomefeedStory['window']['state'], acceleration: number | null, age: number | null) => ({
    keyword, window: { state: window, reasons: [] }, signals: signalsWith({ docAcceleration: acceleration, ageMinutes: age }), funGap: [], payoffLayers: [],
  }) as unknown as HomefeedStory;

  it('WINDOW → 가속(미측정은 뒤) → … → 나이 순', () => {
    const sorted = [
      make('닫힘', 'CLOSED', 99, 1), make('좁아짐', 'NARROWING', 1, 1), make('열림-가속null', 'OPEN', null, 1),
      make('열림-가속5', 'OPEN', 5, 50), make('열리는중', 'OPENING', 0, 5), make('모름', 'UNKNOWN', 3, 1),
    ].sort(compareStories).map((row) => row.keyword);
    expect(sorted).toEqual(['열림-가속5', '열림-가속null', '열리는중', '좁아짐', '모름', '닫힘']);
  });
});

describe('상태(STATUS) 규칙', () => {
  const rows = storyHistory();
  const base = buildStory(rows, rows[1], rows[1].issues[0], ledger([{ keyword: KEY, firstSeenAt: at(0) }]), settings());

  it('루머뿐 · 팬 전용 · 근거 없음은 DROP', () => {
    expect(decideStatus({ ...base, risks: ['RUMOR_ONLY'] }, settings())).toEqual({ state: 'DROP', reasons: ['RUMOR_ONLY'] });
  });

  it('게이트 하나라도 못 넘으면 NOW 가 아니고 못 넘은 게이트를 사유로 남긴다', () => {
    const noSearchFailed = { ...base.noSearch, passed: false };
    const decision = decideStatus({ ...base, noSearch: noSearchFailed, window: { state: 'OPEN', reasons: [] } }, settings());
    expect(decision).toEqual({ state: 'WATCH', reasons: ['NO_SEARCH_FAILED'] });
  });
});
