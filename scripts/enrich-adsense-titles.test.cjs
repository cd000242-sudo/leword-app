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
