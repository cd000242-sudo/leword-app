// 애드센스 벤치마크 3단계 — 대표 검색어마다 "지금 쓰면 트래픽이 오나"(데이터랩 주별 실측) 판정을 붙인다(2026-10-20).
const test = require('node:test');
const assert = require('node:assert/strict');
const trend = require('./adsense-benchmarks-trend.cjs');

const NOW = Date.parse('2026-10-20T03:00:00Z');
const card = (id, query, sv, dc, over = {}) => ({ id, keyword: id, metrics: query ? { query, searchVolume: sv, documentCount: dc } : { searchVolume: null }, ...over });

test('대표 검색어가 있는 카드만, 3일 안에 잰 건 다시 재지 않는다', () => {
  const cards = [card('a', '김장', 9000, 3000), card('b', null), card('c', '연말정산', 20000, 90000)];
  const cache = { '김장': { at: '2026-10-19T00:00:00Z', demand: { verdict: 'rising' } } };
  const plan = trend.planTrend(cards, cache, NOW, 40);
  assert.deepEqual(plan.measure, ['연말정산']);
});

test('잴 순서는 경쟁 낮은(문서/검색 비율 작은) 소재 먼저, 상한까지', () => {
  const cards = [card('x', '경쟁큼', 1000, 50000), card('y', '경쟁작음', 1000, 300), card('z', '중간', 1000, 4000)];
  assert.deepEqual(trend.planTrend(cards, {}, NOW, 2).measure, ['경쟁작음', '중간']);
});

test('3일 지난 판정은 버리고, 판에는 살아 있는 판정만 붙인다', () => {
  const cards = [card('a', '김장', 9000, 3000), card('c', '연말정산', 20000, 90000)];
  const cache = { '김장': { at: '2026-10-19T00:00:00Z', demand: { verdict: 'rising', label: '지금 오르는 중' } }, '연말정산': { at: '2026-10-10T00:00:00Z', demand: { verdict: 'steady' } } };
  const { candidates, cache: pruned } = trend.attachDemand(cards, cache, NOW);
  assert.equal(candidates[0].demand.verdict, 'rising');
  assert.equal(candidates[1].demand, undefined);
  assert.deepEqual(Object.keys(pruned), ['김장']);
  assert.equal(cards[0].demand, undefined, '원본 카드는 건드리지 않는다');
});
