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
