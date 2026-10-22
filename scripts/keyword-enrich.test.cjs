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

test('황금 판(선점 보드) 키워드도 뽑는다 — 이유 문장 · 하위 키워드를 재료로, 측정은 판에 있어 안 함', () => {
  const golden = { rows: [{ keyword: '카니발 하이브리드', topic: '자동차', whySearch: { text: '신형 대기 판단' }, subKeywords: [{ keyword: '카니발 하이브리드 연비' }] }] };
  const items = ke.collectItems([['golden', golden]]);
  assert.deepEqual(items.map((i) => [i.query, i.title, i.suggestions.join(',')]), [['카니발 하이브리드', '신형 대기 판단', '카니발 하이브리드 연비']]);
  assert.deepEqual(ke.planEnrich(items, { entries: {} }, NOW, { trendMax: 9, measureMax: 9, guideMax: 9, rules: 'r' }).measure, []);
});

// 2026-10-22 사장님 "리더남 홈판 추천에는 그래프가 안 나오네요" — 홈판 판 키워드는 그래프만(작성 안내 · 제목은 홈판 판에 이미 있다).
test('홈판 판은 추천 · 지금 검토 카드만 최대 300개, 그래프만 잰다(안내 · 측정 없음)', () => {
  const homefeed = { candidates: [
    { id: 'h1', keyword: '김민수 국가대표 데뷔전 조각', status: 'review-now', recommended: true, searchTargets: ['김민수 국가대표'] },
    { id: 'h2', keyword: '오래된 소재', status: 'stale', recommended: false },
    { id: 'h3', keyword: '확인 필요 소재', status: 'verify', recommended: false },
  ] };
  const items = ke.collectItems([['homefeed', homefeed]]);
  assert.deepEqual(items.map((i) => i.query), ['김민수 국가대표']);
  const plan = ke.planEnrich(items, { entries: {} }, NOW, { trendMax: 9, measureMax: 9, guideMax: 9, rules: 'r' });
  assert.deepEqual(plan.trend, ['김민수 국가대표']);
  assert.deepEqual(plan.guide, []);
  assert.deepEqual(plan.measure, []);
});

// 2026-10-22 실측: 홈판 카드 키워드는 기사 제목 조각("날짜도 정했는데 바쁘대요 박세미 결혼식")이라 데이터랩 기록이 없다 → 그래프 0.
test('홈판은 실제 검색어로 잰다 — 작성 안내의 노릴 검색어(자동완성) 첫 번째(카드 id · 원문 주소로 짝짓기), 없으면 뺀다', () => {
  const homefeed = { candidates: [
    { id: 'h1', keyword: '날짜도 정했는데 바쁘대요 박세미 결혼식', status: 'review-now', relatedKeywords: ['박세미 결혼'] },
    { id: 'h2', keyword: '주소로 짝짓는 소재 조각', status: 'review-now', relatedKeywords: ['두루미'], sources: [{ url: 'https://blog.naver.com/x/2' }] },
    { id: 'h3', keyword: '아무 재료 없는 조각', status: 'review-now' },
  ] };
  const guides = { guides: [{ id: 'h1', guide: { searchTargets: ['박세미 결혼식 날짜'] } }, { id: 'old-id', urls: ['https://blog.naver.com/x/2'], guide: { searchTargets: ['두루미 라이브 방송'] } }] };
  const items = ke.collectItems([['homefeed', homefeed]], { homefeedGuides: guides });
  assert.deepEqual(items.map((i) => i.query), ['박세미 결혼식 날짜', '두루미 라이브 방송'], '연관 키워드 낱말 조각은 쓰지 않는다');
  assert.equal(ke.homefeedQuery(homefeed.candidates[0], new Map([['h1', ['박세미 결혼식 날짜']]])), '박세미 결혼식 날짜');
});

test('데이터랩 기록이 없던 검색어는 이틀 동안 다시 재지 않는다 — 같은 빈 검색어가 회차마다 줄 맨 앞을 차지하지 않게', () => {
  const items = [{ query: 'dead', kinds: ['briefs'] }, { query: 'alive', kinds: ['briefs'] }];
  const store = { entries: { dead: { demandMissAt: new Date(NOW - DAY).toISOString() } } };
  assert.deepEqual(ke.planEnrich(items, store, NOW, { trendMax: 9, measureMax: 0, guideMax: 0, rules: 'r' }).trend, ['alive']);
  const later = { entries: { dead: { demandMissAt: new Date(NOW - 3 * DAY).toISOString() } } };
  assert.deepEqual(ke.planEnrich(items, later, NOW, { trendMax: 9, measureMax: 0, guideMax: 0, rules: 'r' }).trend, ['dead', 'alive']);
});

// 2026-10-22 — CI 데이터랩 키 한도 소진(그래프 0/200) → 워커 키(datalab-weekly, 서버 키 전용)로 먼저 묻는다.
test('워커 경유 데이터랩 — 데이터랩 요청 본문을 워커 창구로 옮기고 결과를 그대로 돌려준다', async () => {
  const sent = [];
  const saved = global.fetch;
  global.fetch = async (url, init) => { sent.push({ url, init }); return { json: async () => ({ ok: true, results: [{ title: '김장', data: [{ period: '2026-10-05', ratio: 50 }] }] }) }; };
  try {
    const f = ke.workerDatalabFetch('srv');
    const res = await f('https://openapi.naver.com/v1/datalab/search', { body: JSON.stringify({ startDate: '2025-09-15', endDate: '2026-10-22', timeUnit: 'week', keywordGroups: [{ groupName: '김장', keywords: ['김장'] }] }) });
    assert.equal(res.ok, true);
    assert.equal((await res.json()).results[0].title, '김장');
    const body = JSON.parse(sent[0].init.body);
    assert.deepEqual([body.action, body.keywords, body.startDate], ['datalab-weekly', ['김장'], '2025-09-15']);
    assert.equal(sent[0].init.headers['x-leword-server'], 'srv');
  } finally { global.fetch = saved; }
});

// 2026-10-22 실측: 다섯 개가 모두 기록 없는 묶음은 결과가 통째로 비어 '호출 실패'와 구분이 안 돼 기억되지 않았다 → 회차마다 같은 묶음이 줄 맨 앞(2~3/200).
test('워커가 정상 응답하면 기록이 빈 검색어도 "없음"으로 구분한다(호출 실패면 null)', async () => {
  const saved = global.fetch;
  try {
    global.fetch = async () => ({ json: async () => ({ ok: true, results: [{ title: '김장', data: [{ period: '2026-10-05', ratio: 50 }] }, { title: '빈말', data: [] }] }) });
    const got = await ke.workerWeekly(['김장', '빈말'], 'srv', new Date('2026-10-22T00:00:00Z'));
    assert.equal(got.get('김장').length, 1);
    assert.equal(got.has('빈말'), false);
    global.fetch = async () => ({ json: async () => ({ ok: false, error: 'datalab', status: 429 }) });
    assert.equal(await ke.workerWeekly(['김장'], 'srv', new Date('2026-10-22T00:00:00Z')), null);
  } finally { global.fetch = saved; }
});
