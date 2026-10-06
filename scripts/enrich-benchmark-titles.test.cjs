const test = require('node:test');
const assert = require('node:assert/strict');
const { attachTitles, freshEntries, mergeEntries, TITLE_TTL_MS } = require('./enrich-benchmark-titles.js');

const now = '2026-09-30T03:00:00.000Z';
const board = { status: 'partial', candidates: [
  { id: 'a1', keyword: '장기전세 만기', homeTitle: '편집자 제목' },
  { id: 'b2', keyword: '독감 무료 접종' },
] };

test('창고에 있는 카드만 homeTitles 를 받고 없는 카드는 빈 목록이다', () => {
  const entries = [{ id: 'a1', keyword: '장기전세 만기', titles: ['가', '나'], provider: 'claude', at: now }];
  const result = attachTitles(board, entries);
  assert.deepEqual(result.candidates[0].homeTitles, ['가', '나']);
  assert.equal(result.candidates[0].homeTitle, '편집자 제목');
  assert.deepEqual(result.candidates[1].homeTitles, []);
  // 원본은 그대로 둔다.
  assert.equal(board.candidates[0].homeTitles, undefined);
});

test('낡은 항목·빈 항목은 창고에서 빠진다', () => {
  const old = new Date(Date.parse(now) - TITLE_TTL_MS - 1000).toISOString();
  const entries = [
    { id: 'a1', titles: ['가'], at: now },
    { id: 'old', titles: ['가'], at: old },
    { id: 'empty', titles: [], at: now },
    { id: 'broken', titles: ['가'], at: 'not-a-date' },
  ];
  assert.deepEqual(freshEntries({ entries }, Date.parse(now)).map((e) => e.id), ['a1']);
  assert.deepEqual(freshEntries(null, Date.parse(now)), []);
});

test('새 결과는 같은 id 의 옛 항목을 대체한다', () => {
  const kept = [{ id: 'a1', titles: ['옛'], at: '2026-09-29T00:00:00.000Z' }, { id: 'c3', titles: ['다'], at: now }];
  const made = [{ id: 'a1', titles: ['새'], at: now }];
  const merged = mergeEntries(kept, made);
  assert.deepEqual(merged.map((e) => `${e.id}:${e.titles[0]}`), ['c3:다', 'a1:새']);
});

test('옛 규칙으로 지은 제목은 새 카드와 번갈아 다시 짓는다 — 다시 지을 때까지 옛 제목은 판에 남는다(2026-10-01)', () => {
  const { pickTitleTargets, TITLE_RULES } = require('./enrich-benchmark-titles.js');
  const cards = ['new1', 'old1', 'cur1', 'new2', 'old2'].map((id) => ({ id }));
  const kept = [{ id: 'old1', titles: ['t'] }, { id: 'old2', titles: ['t'], rules: 'past' }, { id: 'cur1', titles: ['t'], rules: TITLE_RULES }];
  // 옛 규칙 카드(지금 판에 보이는 제목)와 새 카드를 번갈아 — 새 카드가 끝없이 들어와도 옛 제목이 언젠가는 바뀐다
  assert.deepEqual(pickTitleTargets(cards, kept, 3).map((c) => c.id), ['old1', 'new1', 'old2']);
  assert.deepEqual(pickTitleTargets(cards, kept, 10).map((c) => c.id), ['old1', 'new1', 'old2', 'new2']);
  assert.deepEqual(pickTitleTargets([{ id: 'n' }], [], 5).map((c) => c.id), ['n']);
});

// 2026-10-07: 회차당 8장(직렬)이라 1,000장 판에 제목이 25장뿐이었다. 동시에 여러 배치 + 시간 상한.
test('제목 짓기는 배치를 동시에 돌리되 동시 개수 상한과 시간 상한을 지킨다', async () => {
  const { generateTitles } = require('./enrich-benchmark-titles.js');
  const cards = Array.from({ length: 10 }, (_, i) => ({ id: 'c' + i, keyword: 'k' + i, category: '사회·이슈' }));
  let live = 0; let peak = 0; const seen = [];
  const titlesFor = async (batch) => {
    live += 1; peak = Math.max(peak, live); seen.push(...batch.map((c) => c.id));
    await new Promise((r) => setTimeout(r, 20));
    live -= 1;
    return { provider: 'fake', results: batch.map((c) => ({ id: c.id, titles: [c.keyword + ' 제목'], rejected: [] })) };
  };
  const all = await generateTitles(cards, [], { batchSize: 2, concurrency: 3, budgetMs: 60_000, titlesFor });
  assert.equal(all.made.length, 10);
  assert.ok(peak <= 3, '동시 ' + peak);
  assert.ok(peak >= 2, '실제로 동시에 돌아야 한다');
  assert.equal(new Set(seen).size, 10);
  // 시간 상한 0 이면 새 배치를 하나도 시작하지 않는다(이미 지은 창고는 그대로 부착된다)
  const none = await generateTitles(cards, [], { batchSize: 2, concurrency: 3, budgetMs: 0, titlesFor });
  assert.equal(none.made.length, 0);
});
