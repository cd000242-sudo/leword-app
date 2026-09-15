import { describe, expect, it } from 'vitest';
import { AI_IMAGE_LABEL, aiPromptPlans, decideVisualStrategy, realImageGuide, thumbnailPlanOf } from '../homefeed/visual';
import {
  buildTitlePrompt, buildTitleVisualPairs, classifyTitle, parseTitleCandidates, pickTopStops, titleCheckContextOf, titleMaterialsOf, type RawTitleCandidate,
} from '../homefeed/titles';
import { buildDraftPrompt, draftMaterialsOf, validateDraft } from '../homefeed/draft';
import { summarizeCalibration } from '../homefeed/calibration';
import { buildStory } from '../homefeed/engine';
import type { HomefeedPerformanceEntry, HomefeedPost } from '../homefeed/types';
import { at, issue, ledger, sample, settings, snapshot } from './homefeed-fixtures';

/**
 * 홈판 신호 — 이미지 · 썸네일 · 제목 · 원고 · 성과학습(2026-09-16).
 * 기사 사진은 후보일 뿐(권리 확인 필요 · 워터마크 모름), AI 이미지는 실제 사건 사진이 아니라고 표기, 제목은 표본에 없는 숫자 · 과장 = OVER.
 */
const KEY = '손흥민 이적';
const latestSamples = [
  sample('손흥민 이적 결국 LA행 확정', { url: 'https://a.com/1', press: 'a.com', image: 'https://img.a.com/1.jpg' }),
  sample('손흥민, 이적료 "300억" 알고 보니', { url: 'https://b.com/2', press: 'b.com', image: 'https://img.a.com/1.jpg?w=2' }),
  sample('손흥민 10년 만에 토트넘 떠난다', { url: 'https://c.com/3', press: 'c.com', image: 'https://img.c.com/3.jpg' }),
  sample('손흥민 이적 결국 LA행 확정 공식', { url: 'https://d.com/4', press: 'd.com' }),
];
const rows = [
  snapshot(at(0), [issue(KEY, { category: 'sports', ranks: { 'signal.bz': 8 }, samples: [sample('손흥민 이적설 솔솔', { url: 'https://old.com/1' })] })]),
  snapshot(at(40), [issue(KEY, { category: 'sports', ranks: { 'signal.bz': 3, nate: 5 }, blogDocCount: 130, samples: latestSamples })]),
];
const story = buildStory(rows, rows[1], rows[1].issues[0], ledger([{ keyword: KEY, firstSeenAt: at(0) }]), settings());
const FORBIDDEN_IMAGE_WORDS = /사용\s?가능|워터마크\S{0,3}\s?(?:지우|제거|없애)/u;

describe('이미지 전략 · 실제 이미지 가이드', () => {
  it('주제로 전략을 고른다 — 돈은 AI 우선, 연예는 실제 사진 우선(증거 필요)', () => {
    expect(decideVisualStrategy('money', [], { visualCandidateCount: 0 }, [])).toMatchObject({ strategy: 'AI-FIRST', evidenceImageRequired: false });
    expect(decideVisualStrategy('entertainment', [], { visualCandidateCount: 0 }, [])).toMatchObject({ strategy: 'REAL-FIRST', evidenceImageRequired: true });
  });

  it('기사 사진은 권리 확인 필요 · 워터마크 모름으로만 싣고, 같은 사진은 한 번, 새 사실 기사 사진이 대표다', () => {
    const guide = realImageGuide(latestSamples, story.delta, story.alternativeAngles, 'sports');
    expect(guide.map((item) => [item.id, item.role])).toEqual([['real-0', 'hero'], ['real-2', 'proof']]);
    expect(guide.every((item) => item.rightsStatus === 'rights_check_required' && item.watermark === 'unknown')).toBe(true);
    expect(JSON.stringify(guide)).not.toMatch(FORBIDDEN_IMAGE_WORDS);
  });

  it('AI 프롬프트는 실제 사건 사진이 아니라고 표기하고, 실존 인물 주제는 식별 가능한 얼굴을 빼고 짠다', () => {
    const plans = aiPromptPlans('유승호', 'entertainment', 'REAL-FIRST', [], { defaultAspectRatio: '16:9' });
    expect(plans.map((plan) => plan.id)).toEqual(['ai-hero']);
    expect(plans[0]).toMatchObject({ realPersonSafe: true, label: AI_IMAGE_LABEL, aspectRatio: '16:9' });
    expect(plans[0].finalPromptEn).toContain('no identifiable faces');
    expect(plans[0].negativePrompt).toContain('실존 인물 얼굴');
    const ai = aiPromptPlans('금리', 'money', 'AI-FIRST', [
      { kind: 'number', value: '3.5%', evidence: story.evidence[0] }, { kind: 'quote', value: '인하 없다', evidence: story.evidence[0] }, { kind: 'event', value: '인상', evidence: story.evidence[0] },
    ], { defaultAspectRatio: '1:1' });
    expect(ai.map((plan) => plan.id)).toEqual(['ai-hero', 'ai-section-1', 'ai-section-2']);
  });
});

describe('썸네일 계획', () => {
  it('실제 사진 우선인데 후보가 없으면 NEEDS_REAL_IMAGE, AI 우선인데 아직 안 만들었으면 NEEDS_AI', () => {
    const base = { anchorText: '금리', tensions: [], funGap: [], payoffLayers: [], delta: null, firstCard: { hook: null } };
    expect(thumbnailPlanOf({ ...base, category: 'entertainment', strategy: 'REAL-FIRST', realImages: [] }, { thumbnailTextMaxChars: 12 }).readiness).toBe('NEEDS_REAL_IMAGE');
    expect(thumbnailPlanOf({ ...base, category: 'money', strategy: 'AI-FIRST', realImages: [] }, { thumbnailTextMaxChars: 12 }).readiness).toBe('NEEDS_AI');
    expect(thumbnailPlanOf({ ...base, category: 'money', strategy: 'AI-FIRST', realImages: [], hasGeneratedImage: true }, { thumbnailTextMaxChars: 12 }).readiness).toBe('READY');
  });

  it('문구는 0~2줄 · 줄당 상한 이하이고, 금지 목록에 워터마크 사진 · AI 사진 오용이 있다', () => {
    expect(story.thumbnail.textOverlay.length).toBeLessThanOrEqual(2);
    expect(story.thumbnail.textOverlay.every((line) => line.length <= 12)).toBe(true);
    expect(story.thumbnail.doNotUse).toContain('AI 이미지를 실제 사건 사진처럼 쓰기');
    expect(JSON.stringify(story.thumbnail)).not.toMatch(FORBIDDEN_IMAGE_WORDS);
  });
});

describe('제목 엔진', () => {
  const ctx = titleCheckContextOf(story);
  const raw = (title: string, extra: Partial<RawTitleCandidate> = {}): RawTitleCandidate => ({
    title, firstHook: '결국', secondHook: '이유', triggerType: 'result_first', selfCheck: 'STOP', visual: 'real', thumbCopy: '300억', ...extra,
  });

  it('교리를 지킨 제목은 STOP', () => {
    expect(classifyTitle(raw('손흥민 이적 결국 확정됐는데 이유가 따로 있더라고요'), ctx)).toMatchObject({ verdict: 'STOP', reasons: [] });
  });

  it('표본에 없는 숫자 · 과장어는 OVER', () => {
    const over = classifyTitle(raw('손흥민 이적료 500억 충격'), ctx);
    expect(over.verdict).toBe('OVER');
    expect(over.overclaim).toEqual({ unsupportedNumbers: ['500억'], hypeWords: ['충격'] });
  });

  it('쉼표 끊기 · 상투구 · 기사 제목 옮기기 · 기준어 없음은 FLAT', () => {
    expect(classifyTitle(raw('손흥민, 이적 총정리'), ctx).reasons).toEqual(expect.arrayContaining(['COMMA_SPLIT', 'CLICHE']));
    expect(classifyTitle(raw('손흥민 이적 결국 LA행 확정'), ctx).reasons).toContain('ARTICLE_COPY');
    expect(classifyTitle(raw('결국 떠나는 이유가 따로 있었네요'), ctx)).toMatchObject({ verdict: 'FLAT', reasons: ['NO_ANCHOR'] });
  });

  it('AI 가 스스로 밋밋하다고 한 제목은 검사를 통과해도 FLAT', () => {
    expect(classifyTitle(raw('손흥민 이적 결국 확정됐는데 이유가 따로 있더라고요', { selfCheck: 'FLAT' }), ctx)).toMatchObject({ verdict: 'FLAT', reasons: ['AI_SELF_FLAT'] });
  });

  it('답을 읽고, 중복 · 모르는 유형은 걸러 최대 12개', () => {
    const reply = `설명입니다 {"titles":[${Array.from({ length: 14 }, (_, index) => `{"title":"손흥민 이적 결국 확정 ${index}번째 이야기","first_hook":"결국","trigger_type":"${index === 0 ? 'magic' : 'result_first'}","self_check":"stop"}`).join(',')},{"title":"손흥민 이적 결국 확정 1번째 이야기"}]}`;
    const parsed = parseTitleCandidates(reply);
    expect(parsed).toHaveLength(12);
    expect(parsed[0]).toMatchObject({ triggerType: null, selfCheck: 'STOP' });
    expect(parseTitleCandidates('JSON 없음')).toEqual([]);
  });

  it('STOP 상위 3은 유형이 겹치지 않게 고르고, 조합의 썸네일 문구는 제목과 겹치지 않는다', () => {
    const candidates = [
      classifyTitle(raw('손흥민 이적 결국 확정됐는데 이유가 따로 있더라고요', { thumbCopy: '이유가 따로' }), ctx),
      classifyTitle(raw('손흥민 이적 결국 확정됐대요 다들 놀란 이유', { triggerType: 'result_first' }), ctx),
      classifyTitle(raw('손흥민 이적 10년 만에 떠나는 길이 이랬네요', { triggerType: 'before_after' }), ctx),
      classifyTitle(raw('손흥민 이적료 들어 보니 생각과 달랐어요', { triggerType: 'expectation_break' }), ctx),
    ];
    const tops = pickTopStops(candidates, 3);
    expect(tops.map((top) => top.triggerType)).toEqual(['result_first', 'before_after', 'expectation_break']);
    const pairs = buildTitleVisualPairs(story, tops, 12);
    expect(pairs[0].thumbnailCopy).not.toContain('이유가 따로');
    expect(pairs.every((pair) => pair.thumbnailCopy.every((line) => !pair.title.includes(line)))).toBe(true);
  });

  it('프롬프트는 재료와 교리만 싣는다', () => {
    const prompt = buildTitlePrompt(titleMaterialsOf(story));
    expect(prompt).toContain('쉼표로 끊어 앞에 붙이면 실패다');
    expect(prompt).toContain('지어내지 마라');
    expect(prompt).not.toContain('https://');
  });
});

describe('원고 검사', () => {
  const materials = draftMaterialsOf(story, '손흥민 이적 결국 확정됐는데 이유가 따로 있더라고요', null);
  const good = [
    '최종 제목: 손흥민 이적 결국 확정됐는데 이유가 따로 있더라고요',
    '',
    '결국 소식이 떴더라고요. 저도 아침에 보고 한참 들여다봤어요. 다들 궁금한 건 왜 지금이냐는 거죠?',
    '',
    '## 무엇이 달라졌나',
    '기사들을 모아 보니 몇 가지가 겹치더라고요.',
    '',
    '#손흥민 #이적 #토트넘 #LA #축구',
    '',
    '## 이미지 배치 가이드',
    '- 맨 위: 실제 사진 · a.com · 권리 확인 필요',
  ].join('\n');

  it('규칙을 지킨 원고는 문제 없음', () => {
    expect(validateDraft(good, materials)).toEqual([]);
  });

  it('첫 줄 · ### · 해시태그 수 · 가이드 · 기사체 시작 · 워터마크 제거 권유를 잡는다', () => {
    const bad = [
      '손흥민 이적 이야기',
      '손흥민이 이적했다. 구단이 밝혔다. 이적료는 300억으로 알려졌다.',
      '### 소제목',
      '워터마크를 지우고 쓰세요',
      '#손흥민 #이적',
    ].join('\n');
    expect(validateDraft(bad, materials)).toEqual(['FIRST_LINE_NOT_TITLE', 'H3_USED', 'NO_IMAGE_GUIDE', 'HASHTAG_COUNT', 'ARTICLE_TONE_OPENING', 'CARD_PROMISE_LATE', 'WATERMARK_REMOVAL']);
  });

  it('프롬프트는 최종 제목 줄 · 이미지 가이드 · AI 표기를 요구하고, 다시 쓸 때 사유를 붙인다', () => {
    const prompt = buildDraftPrompt(materials, ['HASHTAG_COUNT']);
    expect(prompt).toContain('"최종 제목: 손흥민 이적 결국 확정됐는데 이유가 따로 있더라고요"');
    expect(prompt).toContain('## 이미지 배치 가이드');
    expect(prompt).toContain(AI_IMAGE_LABEL);
    expect(prompt).toContain('지난 원고의 문제: HASHTAG_COUNT');
  });
});

describe('성과학습 표본 규칙', () => {
  const post = (index: number, pattern: string): HomefeedPost => ({
    id: `post-${index}`, storyId: 's', issueKey: 'k', keyword: 'k', title: 't', titleId: null, triggerType: 'result_first', storyPattern: pattern,
    visualStrategy: 'REAL-FIRST', thumbnailType: 'FACE+NUMBER', thumbnailHasText: true, postUrl: 'https://blog.naver.com/x/1', publishedAt: at(0), recordedAt: at(0),
    atPublish: { window: 'OPEN', status: 'NOW', ageMinutes: 30, sourceCountNow: 2, cloneRatio: 0.3 },
  });
  const day = (index: number, views: number | null): HomefeedPerformanceEntry => ({
    postId: `post-${index}`, checkpoint: '24h', recordedAt: at(1440), totalViews: 100, searchViews: 10, recommendViews: views, feedSeen: null, referrerNote: '',
  });
  const posts = [
    ...Array.from({ length: 3 }, (_, i) => post(i, 'few')),
    ...Array.from({ length: 6 }, (_, i) => post(100 + i, 'mid')),
    ...Array.from({ length: 20 }, (_, i) => post(200 + i, 'many')),
  ];
  const entries = [
    ...posts.slice(0, 3).map((row, i) => day(i, 5)),
    ...[0, 0, 10, 20, 30, null].map((views, i) => day(100 + i, views)),
    ...Array.from({ length: 20 }, (_, i) => day(200 + i, i < 5 ? 0 : i)),
  ];
  const summary = summarizeCalibration(posts, entries, { calibration: { sampleShortN: 2, successRateMinN: 3 } });
  const group = (value: string) => summary.groups.find((row) => row.dimension === 'storyPattern' && row.value === value);

  it('하한은 설정으로도 못 내린다(5 · 20)', () => {
    expect(summary.thresholds).toEqual({ sampleShortN: 5, successRateMinN: 20 });
  });

  it('n<5 는 수치를 숨긴다', () => {
    expect(group('few')).toMatchObject({ n: 3, display: 'sample_short', entered: null, medianRecommend24h: null, entryRate: null });
  });

  it('n<20 은 개수 · 중앙값만, 비율은 없다', () => {
    expect(group('mid')).toMatchObject({ n: 6, display: 'counts', entered: 3, medianRecommend24h: 10, p25: null, p75: null, entryRate: null });
  });

  it('n≥20 에서만 진입 비율 · 분위수를 낸다', () => {
    // 20건: 추천 0 이 5건, 나머지 5~19 — 가장 가까운 순위 분위수로 p25 는 5번째 값(0), 중앙값은 10번째(9), p75 는 15번째(14).
    expect(group('many')).toMatchObject({ n: 20, display: 'rates', entered: 15, entryRate: 0.75, medianRecommend24h: 9, p25: 0, p75: 14 });
  });
});
