// 애드센스 벤치마크 2단계 — 소재마다 실측(대표 검색어 · 월 검색량 · 문서수 · 파워링크 입찰가). 2026-10-07.
const test = require('node:test');
const assert = require('node:assert/strict');
const m = require('./adsense-benchmarks-measure.cjs');

test('힌트 — 카드 앞 낱말 둘을 붙여 15자 안(검색광고 힌트 한도), 넘으면 첫 낱말', () => {
  assert.equal(m.hintOf({ keyword: '국민연금 추납 순서 보험료율' }), '국민연금추납');
  assert.equal(m.hintOf({ keyword: '청년미래적금우대형조건정리합니다 어쩌구' }), '');
  assert.equal(m.hintOf({ keyword: '누리호' }), '누리호');
});

test('후보 검색어 — 카드 앞 낱말 2개 · 3개를 붙인 말(15자 안) · 낱말이 하나면 그 말', () => {
  assert.deepEqual(m.candidatesOf({ keyword: '국민연금 추납 순서 보험료율' }), ['국민연금추납', '국민연금추납순서']);
  assert.deepEqual(m.candidatesOf({ keyword: '누리호' }), ['누리호']);
  assert.deepEqual(m.candidatesOf({ keyword: '청년미래적금우대형조건정리합니다 어쩌구' }), []);
});

test('대표 검색어 — 후보 중 실측 검색량 최대 · 실측이 없으면 null(넓은 한 낱말로 바꾸지 않는다)', () => {
  const vol = new Map([['국민연금추납', 2400], ['국민연금추납순서', 0]]);
  assert.deepEqual(m.pickQuery(['국민연금추납', '국민연금추납순서'], vol), { query: '국민연금추납', searchVolume: 2400 });
  assert.equal(m.pickQuery(['누리호발사일정'], new Map([['누리호발사일정', null]])), null);
});

test('대상 — ★ 먼저 · 캐시(7일)에 있는 힌트는 다시 재지 않고 붙이기만 · 상한', () => {
  const now = Date.parse('2026-10-07T00:00:00Z');
  const cards = [{ id: '1', keyword: '누리호 발사', recommended: false }, { id: '2', keyword: '국민연금 추납', recommended: true }, { id: '3', keyword: '청약 가점', recommended: true }];
  const cache = { 국민연금추납: { query: '국민연금추납', searchVolume: 2400, documentCount: 3000, bid: 500, at: '2026-10-05T00:00:00Z' }, 누리호발사: { at: '2026-09-01T00:00:00Z' } };
  const plan = m.planTargets(cards, cache, now, 2);
  assert.deepEqual(plan.cached.map((c) => c.id), ['2'], '7일 안 캐시는 붙이기만');
  assert.deepEqual(plan.measure.map((c) => c.id), ['3', '1'], '★ 먼저 · 낡은 캐시는 다시 잰다');
});

test('카드에 붙이기 — 실측 칸만 채우고 나머지는 그대로', () => {
  const card = { id: '1', keyword: 'x', metrics: { searchVolume: null, documentCount: null, bid: null } };
  const out = m.withMetrics(card, { query: '국민연금추납', searchVolume: 2400, documentCount: 3000, bid: 520, at: '2026-10-07T00:00:00Z' });
  assert.deepEqual(out.metrics, { query: '국민연금추납', searchVolume: 2400, documentCount: 3000, bid: 520, measuredAt: '2026-10-07T00:00:00Z' });
  assert.equal(card.metrics.searchVolume, null, '원본은 바꾸지 않는다');
});

// 2026-10-07: 대표 검색어가 '실업급여구직급여'(같은 뜻 말 두 개)로 잡혀 제목이 "실업급여 구직급여 …"로 어색해졌다 — 같은 뜻 말은 앞의 하나만.
test('후보 검색어 — 같은 뜻 말(실업급여 · 구직급여)은 앞의 하나만 남기고 붙인다', () => {
  assert.deepEqual(m.candidatesOf({ keyword: '실업급여 구직급여 신청 조건' }), ['실업급여신청', '실업급여신청조건']);
  assert.deepEqual(m.candidatesOf({ keyword: '부가세 부가가치세' }), ['부가세']);
});
