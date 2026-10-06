// 애드센스 고수 벤치마크 출처 고르기(2026-10-07 사장님 엑셀 6,440곳 → 홈판과 같은 상한 786곳).
const test = require('node:test');
const assert = require('node:assert/strict');
const { selectSources, toSource } = require('./adsense-benchmarks-sources.cjs');

const row = (over) => ({ 등급: 'B', 점수: 50, 카테고리: '금융·재테크', 블로그명: 'b', URL: 'https://a.tistory.com', 플랫폼: '티스토리', RSS: 'https://a.tistory.com/rss', '7일 발행(RSS)': 0, 애드센스: '미확인', '애드센스 pub ID': 'ca-pub-1', ...over });

test('엑셀 행 → 출처: https RSS 만, 플랫폼 정리, pub ID 는 싣지 않는다', () => {
  const s = toSource(row({ URL: 'https://c.useful-info.kr', RSS: 'https://c.useful-info.kr/rss', 플랫폼: '티스토리(개인도메인)', 애드센스: 'Y', 등급: 'S', 점수: 129 }));
  assert.equal(s.feedUrl, 'https://c.useful-info.kr/rss');
  assert.equal(s.platform, 'tistory');
  assert.equal(s.adsense, true);
  assert.equal(s.grade, 'S');
  assert.ok(!JSON.stringify(s).includes('ca-pub'), 'pub ID 가 새면 안 된다');
  assert.equal(toSource(row({ RSS: '' })), null);
  assert.equal(toSource(row({ RSS: 'http://a.tistory.com/rss' })), null, 'http 는 받지 않는다');
  assert.equal(toSource(row({ RSS: 'https://b.com/feed', 플랫폼: '워드프레스' })).platform, 'wordpress');
});

test('7일 발행 있음 → 등급 → 7일 발행 수 → 애드센스 Y → 점수 순으로 고르고 상한을 지킨다', () => {
  const rows = [
    row({ URL: 'https://c1.tistory.com', RSS: 'https://c1.tistory.com/rss', 등급: 'C', 점수: 99 }),
    row({ URL: 'https://s1.tistory.com', RSS: 'https://s1.tistory.com/rss', 등급: 'S', 점수: 10 }),
    row({ URL: 'https://a1.tistory.com', RSS: 'https://a1.tistory.com/rss', 등급: 'A', '7일 발행(RSS)': 0 }),
    row({ URL: 'https://a2.tistory.com', RSS: 'https://a2.tistory.com/rss', 등급: 'A', '7일 발행(RSS)': 5 }),
    row({ URL: 'https://a3.tistory.com', RSS: 'https://a3.tistory.com/rss', 등급: 'A', '7일 발행(RSS)': 5, 애드센스: 'Y' }),
  ];
  const picked = selectSources(rows, { cap: 4, minPerCategory: 0 });
  // 7일간 글이 없는 S(s1)보다 7일 안에 쓴 A 가 앞 — 7일 판에 소재를 보태는 출처가 먼저다
  assert.deepEqual(picked.map((s) => s.url), ['https://a3.tistory.com', 'https://a2.tistory.com', 'https://s1.tistory.com', 'https://a1.tistory.com']);
});

test('분야마다 최소 자리를 먼저 채워 한 분야가 상한을 다 먹지 않는다 · 같은 RSS 는 한 번', () => {
  const fin = Array.from({ length: 10 }, (_, i) => row({ URL: `https://f${i}.tistory.com`, RSS: `https://f${i}.tistory.com/rss`, 등급: 'S' }));
  const pet = [row({ 카테고리: '반려동물', URL: 'https://p0.tistory.com', RSS: 'https://p0.tistory.com/rss', 등급: 'C' })];
  const dup = [row({ URL: 'https://f0.tistory.com', RSS: 'https://f0.tistory.com/rss', 등급: 'S' })];
  const picked = selectSources([...fin, ...pet, ...dup], { cap: 5, minPerCategory: 1 });
  assert.equal(picked.length, 5);
  assert.ok(picked.some((s) => s.category === '반려동물'), '작은 분야도 최소 한 자리');
  assert.equal(new Set(picked.map((s) => s.feedUrl)).size, picked.length);
});
