// 검색어 덧붙이기(2026-10-20 사장님 "시즌키워드도 오늘의 글감도 마찬가지") — 그래프 · 지식인 · 해결할 문제 · 행동 제목 · (시즌) 검색량 · 문서수.
const test = require('node:test');
const assert = require('node:assert/strict');
const ke = require('./keyword-enrich.cjs');

const NOW = Date.parse('2026-10-20T03:00:00Z');
const DAY = 86400000;

test('시즌 판과 글감 판에서 검색어를 뽑는다 — 같은 검색어는 하나로, 글감은 모든 회차에서', () => {
  const seasonal = { topics: [{ id: 's1', keyword: '연말정산 간소화', angle: '자료 조회 시점', category: '세금·경제', suggestions: ['연말정산 간소화 자료'] }] };
  const briefs = {
    briefs: [{ coreKeyword: '독감 예방접종', title: '독감 무료접종 대상', field: '건강', keywords: ['독감 예방접종 무료'], facts: [{ title: '질병청 발표' }] }],
    rounds: [{ briefs: [{ coreKeyword: '독감 예방접종', title: '중복' }, { coreKeyword: '연말정산 간소화', title: '중복2' }, { coreKeyword: '김장 매트', title: '김장', field: '생활' }] }],
  };
  const items = ke.collectItems([['seasonal', seasonal], ['briefs', briefs]]);
  assert.deepEqual(items.map((i) => [i.query, i.kinds.join('+')]), [['연말정산 간소화', 'seasonal+briefs'], ['독감 예방접종', 'briefs'], ['김장 매트', 'briefs']]);
  assert.deepEqual(items[0].suggestions, ['연말정산 간소화 자료']);
  assert.deepEqual(items[1].sourceTitles, ['질병청 발표']);
});

test('이번에 잴 것 — 그래프는 3일(모름은 1일), 측정은 시즌 검색어만 7일, 안내는 7일 · 각 상한까지', () => {
  const items = ['a', 'b', 'c'].map((q) => ({ query: q, kinds: q === 'c' ? ['briefs'] : ['seasonal'] }));
  const store = { entries: {
    a: { demand: { verdict: 'rising' }, demandAt: new Date(NOW - DAY).toISOString(), measure: { searchVolume: 1 }, measureAt: new Date(NOW - DAY).toISOString(), guideAt: new Date(NOW - DAY).toISOString(), rules: 'r' },
    b: { demand: { verdict: 'unknown' }, demandAt: new Date(NOW - 2 * DAY).toISOString(), guideAt: new Date(NOW - 8 * DAY).toISOString(), rules: 'r' },
  } };
  const plan = ke.planEnrich(items, store, NOW, { trendMax: 10, measureMax: 10, guideMax: 1, rules: 'r' });
  assert.deepEqual(plan.trend, ['b', 'c']);
  assert.deepEqual(plan.measure, ['b'], '시즌 검색어만 재고(글감은 이미 실측이 있다)');
  assert.deepEqual(plan.guide.map((i) => i.query), ['b'], '상한 1');
});

test('판에서 사라지고 7일 지난 검색어는 정리하고, 새 값은 원래 칸을 지우지 않고 덧붙인다', () => {
  const store = { entries: { old: { demandAt: new Date(NOW - 9 * DAY).toISOString() }, live: { demandAt: new Date(NOW - 9 * DAY).toISOString(), kinQuestions: [1] } } };
  const pruned = ke.pruneEntries(store, new Set(['live']), NOW);
  assert.deepEqual(Object.keys(pruned.entries), ['live']);
  const merged = ke.patchEntry(pruned, 'live', { demand: { verdict: 'steady' }, demandAt: 'x' });
  assert.deepEqual(merged.entries.live.kinQuestions, [1]);
  assert.equal(merged.entries.live.demand.verdict, 'steady');
  assert.equal(store.entries.live.demand, undefined, '원본은 그대로');
});

// 2026-10-20 사장님 "실시간검색어 틈새키워드도 마찬가지로" — 틈새 판의 추천 행 · 관찰 행 키워드도 잰다(측정은 판에 이미 있어 안 함).
test('틈새 판에서 추천 · 관찰 키워드를 뽑는다 — 이유 문장 · 하위 키워드를 재료로', () => {
  const issue = {
    rows: [{ keyword: '엘리스그룹 공모주', issue: '엘리스그룹', topic: '엘리스그룹', whySearch: { text: '코스닥 상장 첫날 급락' }, subKeywords: [{ keyword: '엘리스그룹 상장일', searchVolume: 7780 }] }],
    observations: [{ keyword: '태풍 경로', issue: '태풍', topic: '날씨', whySearch: { text: '' }, subKeywords: [] }],
  };
  const items = ke.collectItems([['issue', issue]]);
  assert.deepEqual(items.map((i) => i.query), ['엘리스그룹 공모주', '태풍 경로']);
  assert.equal(items[0].title, '코스닥 상장 첫날 급락');
  assert.deepEqual(items[0].suggestions, ['엘리스그룹 상장일']);
  const plan = ke.planEnrich(items, { entries: {} }, NOW, { trendMax: 9, measureMax: 9, guideMax: 9, rules: 'r' });
  assert.deepEqual(plan.measure, [], '틈새는 판에 실측이 있다');
});
