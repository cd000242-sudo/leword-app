'use strict';
// 전/후 분포 보고(today-picks-niche-report.js) — 이미 잰 값만 읽고 세기만 한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const { viewStats, poolTopics, median } = require('./today-picks-niche-report');

const row = (keyword, searchVolume, documentCount, extra = {}) => ({
  keyword, searchVolume, documentCount, ratio: Math.round((searchVolume / documentCount) * 100) / 100, ...extra,
});

test('중앙값 — 짝수 개는 가운데 두 값의 평균, 비면 null', () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([1, 2, 3, 4]), 3);
  assert.equal(median([]), null);
});

test('분포 — 등급 · 검색량 구간 · 문서수 구간 · 앞 N칸을 센다', () => {
  const topics = [{ topic: 'A', rows: [row('대형', 50000, 400000), row('니치', 3000, 1000), row('고볼륨', 20000, 2000), row('일반', 800, 90000)] }];
  const stats = viewStats(topics, { minRatio: 1, keep: 4, heads: [1, 2] });
  assert.deepEqual(stats.tiers, { niche: 1, mid: 1, plain: 1, large: 1 });
  assert.equal(stats.rows, 4);
  assert.equal(stats.golden, 2, '황금비 1+ 는 니치와 고볼륨 둘뿐 — 이 표본의 대형은 황금비 미달이다');
  assert.equal(stats.volume['1천 미만'], 1);
  assert.equal(stats.volume['3천~1만'], 1);
  assert.equal(stats.volume['1만~3만'], 1);
  assert.equal(stats.volume['3만 이상'], 1);
  assert.equal(stats.docs['5천 이하'], 2);
  assert.equal(stats.docs['5만 초과'], 2);
  assert.equal(stats.head[1].tiers.large, 1);
  assert.equal(stats.head[2].tiers.niche, 1);
  assert.equal(stats.nicheShortfall, 2);
  assert.equal(stats.topicsWithoutNiche, 0);
});

test('니치가 없는 주제와 모자란 칸을 센다', () => {
  const stats = viewStats([{ topic: 'A', rows: [row('대형', 50000, 400000)] }, { topic: 'B', rows: [row('니치', 3000, 1000)] }], { keep: 100 });
  assert.equal(stats.topicsWithoutNiche, 1);
  assert.equal(stats.nicheShortfall, 100 + 99);
});

test('풀 — 판과 보관함의 같은 말은 가장 최근 실측 한 줄만 남기고 재추천 표시는 떼어 낸다', () => {
  const older = { builtAt: '2026-11-10T00:00:00Z', topics: [{ topic: 'A', rows: [row('같은말', 3000, 1000, { measuredAt: '2026-11-10T00:00:00Z', freshness: { status: 'new' } }), row('옛날말', 2000, 500, { measuredAt: '2026-11-10T00:00:00Z' })] }] };
  const newer = { builtAt: '2026-11-14T00:00:00Z', topics: [{ topic: 'A', rows: [row('같은말', 3000, 1200, { measuredAt: '2026-11-14T00:00:00Z', tier: 'niche' })] }] };
  const [topic] = poolTopics([newer, older]);
  assert.deepEqual(topic.rows.map((r) => [r.keyword, r.documentCount]).sort(), [['같은말', 1200], ['옛날말', 500]]);
  assert.equal(topic.rows.some((r) => 'freshness' in r || 'tier' in r), false);
});
