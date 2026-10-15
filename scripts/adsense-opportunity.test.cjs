const test = require('node:test');
const assert = require('node:assert/strict');
const { rankOpportunities, opportunityOf } = require('./adsense-benchmarks-core.cjs');
const now = '2026-10-15T03:00:00Z';
const card = (id, overrides = {}) => ({ id, sources: [{ id: 'a' }, { id: 'b' }], metrics: { query: id, searchVolume: 2000, documentCount: 500, bid: 1000, measuredAt: now }, ...overrides });

test('수요·경쟁·입찰가가 좋은 후보가 발행 수만 많은 고경쟁 소재보다 앞선다', () => {
  const good = card('niche');
  const busy = card('crowded', { sources: Array.from({ length: 6 }, (_, i) => ({ id: '' + i })), metrics: { ...good.metrics, query: 'crowded', documentCount: 1000000 } });
  const out = rankOpportunities([busy, good], now);
  assert.equal(out[0].id, 'niche');
  assert.equal(out[0].opportunity.qualified, true);
  assert.equal(out[1].opportunity.qualified, false);
  assert.equal(good.opportunity, undefined);
});

test('미측정·누락·낡은·미래·0건·음수·NaN 실측은 황금 후보로 승격하지 않는다', () => {
  for (const metrics of [
    {}, { ...card('x').metrics, bid: null }, { ...card('x').metrics, measuredAt: '2026-10-08T03:00:00Z' },
    { ...card('x').metrics, measuredAt: '2026-10-16T03:00:00Z' }, { ...card('x').metrics, measuredAt: null },
    { ...card('x').metrics, documentCount: 0 }, { ...card('x').metrics, documentCount: -1 },
    { ...card('x').metrics, searchVolume: NaN }, { ...card('x').metrics, searchVolume: 0 },
  ]) assert.equal(opportunityOf(card('x', { metrics }), now).qualified, false);
  assert.equal(opportunityOf(card('x', { metrics: {} }), now).score, null);
});

test('같은 블로그의 중복 발행은 고수 수와 점수를 부풀리지 않는다', () => {
  const a = opportunityOf(card('x', { sources: [{ id: 'a' }] }), now);
  const b = opportunityOf(card('x', { sources: [{ id: 'a' }, { id: 'a' }, {}] }), now);
  assert.equal(a.score, b.score);
  assert.equal(b.blogs, 1);
});

test('입력 순서에 관계없이 정렬이 일정하고 측정 부족은 점수를 만들지 않는다', () => {
  const a = card('a'); const b = card('b'); const missing = card('m', { metrics: {} });
  const ids = (cards) => rankOpportunities(cards, now).map((c) => c.id);
  assert.deepEqual(ids([missing, b, a]), ['a', 'b', 'm']);
  assert.deepEqual(ids([b, missing, a]), ['a', 'b', 'm']);
});
