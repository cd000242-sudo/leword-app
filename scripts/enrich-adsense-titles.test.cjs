// 애드센스 제목 창고 — 부착 · 대상 고르기(2026-10-07).
const test = require('node:test');
const assert = require('node:assert/strict');
const { attachAdsenseTitles, pickAdsenseTargets } = require('./enrich-adsense-titles.js');

test('창고에 있는 카드만 titles 를 받고 없는 카드는 빈 목록', () => {
  const board = { candidates: [{ id: 'a', titles: [] }, { id: 'b', titles: [] }] };
  const out = attachAdsenseTitles(board, [{ id: 'a', titles: ['국민연금 추납 신청 전에 따져 볼 비용과 조건'], at: '2026-10-07T00:00:00Z' }]);
  assert.deepEqual(out.candidates[0].titles, ['국민연금 추납 신청 전에 따져 볼 비용과 조건']);
  assert.deepEqual(out.candidates[1].titles, []);
  assert.deepEqual(board.candidates[0].titles, [], '원본은 바꾸지 않는다');
});

test('대상은 창고에 없는 카드를 판 순서대로 상한까지', () => {
  const cards = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(pickAdsenseTargets(cards, [{ id: 'a' }], 1).map((c) => c.id), ['b']);
});

// 상위호환 규칙(2026-10-07): 예전 규칙으로 지은 제목(고수 제목을 다시 쓴 수준)은 다시 짓고, 고수보다 나은 점(titleEdges)을 판에 싣는다.
test('예전 규칙 제목은 다시 짓는 대상 — 창고에 없는 카드보다 먼저(이미 화면에 보이는 카드)', () => {
  const { ADSENSE_TITLE_RULES } = require('./enrich-adsense-titles.js');
  const cards = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const kept = [{ id: 'b', rules: '2026-10-07-search' }, { id: 'c', rules: ADSENSE_TITLE_RULES }];
  assert.deepEqual(pickAdsenseTargets(cards, kept, 2).map((c) => c.id), ['b', 'a']);
});

test('고수보다 나은 점을 제목과 같은 순서로 싣는다(없으면 빈 목록)', () => {
  const board = { candidates: [{ id: 'a' }, { id: 'b' }] };
  const out = attachAdsenseTitles(board, [{ id: 'a', titles: ['t1', 't2'], edges: ['e1', 'e2'], masterBest: 9, at: '2026-10-07T00:00:00Z' }, { id: 'b', titles: ['t3'], at: '2026-10-07T00:00:00Z' }]);
  assert.deepEqual(out.candidates[0].titleEdges, ['e1', 'e2']);
  assert.equal(out.candidates[0].masterBest, 9);
  assert.deepEqual(out.candidates[1].titleEdges, []);
});
