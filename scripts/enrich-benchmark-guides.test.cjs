/**
 * 홈판 벤치마크 작성 안내 창고(2026-10-10 사장님 "전부 다 붙이고 싶다 — 12장만이 아니라, 확인하는 사람이 있거든").
 * 판 수집과 따로 도는 안내 작업이 카드마다 안내를 짓고 자기 파일(homefeed-benchmark-guides.json)에만 쌓는다.
 * 사이트가 판과 합친다(카드 id → 없으면 원문 주소).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { cardsForGuides, pruneStore, pickGuideTargets, generateGuides, mergeStore, coverage, suggestionsFor, MISS_RETRY_MS, GRACE_MS } = require('./enrich-benchmark-guides.js');

const now = Date.parse('2026-10-10T09:00:00.000Z');
const iso = (ms) => new Date(ms).toISOString();
const card = (id, more = {}) => ({ id, keyword: `키워드 ${id}`, title: `제목 ${id}`, category: '사회·이슈', summary: '요약', status: 'review-now', recommended: false, priority: 10, sources: [{ url: `https://blog.naver.com/x/${id}`, title: `원문 ${id}` }], relatedKeywords: [], flags: [], ...more });
const guide = { direction: '방향', searchTargets: [], mustInclude: ['가', '나'], mustAvoid: [], checkBefore: [] };

test('안내 지을 카드 — 낡은(stale) · 협찬 카드는 빼고, 원문 주소를 함께 싣는다', () => {
  const board = { candidates: [card('a'), card('b', { status: 'stale' }), card('c', { flags: ['sponsored'] }), card('d', { sources: [{ url: 'https://x/1', title: '채널 제목' }, { url: 'https://x/2', title: '채널 제목' }] })] };
  const cards = cardsForGuides(board);
  assert.deepEqual(cards.map((c) => c.id), ['a', 'd']);
  assert.deepEqual(cards[1].urls, ['https://x/1', 'https://x/2']);
  assert.deepEqual(cards[1].sourceTitles, ['채널 제목'], '같은 제목은 한 번만');
});

test('창고 정리 — 지금 판 카드(id 또는 원문 주소)와 맞거나 24시간 안에 지은 것만 남긴다 · 통과 못 한 기록은 12시간만', () => {
  const board = { candidates: [card('a'), card('n', { sources: [{ url: 'https://blog.naver.com/x/old-url', title: 't' }] })] };
  const store = {
    guides: [
      { id: 'a', urls: [], guide, at: iso(now - 3 * 86400000), rules: 'R' },
      { id: 'gone-but-url', urls: ['https://blog.naver.com/x/old-url'], guide, at: iso(now - 3 * 86400000), rules: 'R' },
      { id: 'gone-old', urls: ['https://x/none'], guide, at: iso(now - GRACE_MS - 1000), rules: 'R' },
      { id: 'gone-fresh', urls: ['https://x/none2'], guide, at: iso(now - 1000), rules: 'R' },
      { id: 'broken', at: iso(now) },
    ],
    misses: [{ id: 'm1', at: iso(now - 1000) }, { id: 'm2', at: iso(now - MISS_RETRY_MS - 1000) }],
  };
  const out = pruneStore(store, board, now);
  assert.deepEqual(out.guides.map((g) => g.id), ['a', 'gone-but-url', 'gone-fresh']);
  assert.deepEqual(out.misses.map((m) => m.id), ['m1']);
});

test('지을 카드 고르기 — 안내 없는 카드 먼저(추천 → 우선순위), 원문 주소로 이미 덮인 카드 · 최근 통과 못 한 카드는 건너뛰고, 옛 규칙은 그다음', () => {
  const cards = cardsForGuides({ candidates: [
    card('done'), card('url-covered', { sources: [{ url: 'https://shared/1', title: 't' }] }),
    card('missed'), card('old-rules'),
    card('p90', { priority: 90 }), card('rec', { recommended: true, priority: 5 }), card('p20', { priority: 20 }),
  ] });
  const store = {
    guides: [{ id: 'done', urls: [], guide, rules: 'R' }, { id: 'other', urls: ['https://shared/1'], guide, rules: 'R' }, { id: 'old-rules', urls: [], guide, rules: '옛' }],
    misses: [{ id: 'missed', at: iso(now) }],
  };
  assert.deepEqual(pickGuideTargets(cards, store, 'R', 10).map((c) => c.id), ['rec', 'p90', 'p20', 'old-rules']);
  assert.deepEqual(pickGuideTargets(cards, store, 'R', 2).map((c) => c.id), ['rec', 'p90']);
});

test('안내 짓기 — 배치를 동시에 돌리고(상한 지킴) · 배치마다 자동완성을 붙이고 · 통과 못 한 카드는 기록 · 시간 상한이면 새 배치 안 시작', async () => {
  const cards = cardsForGuides({ candidates: Array.from({ length: 10 }, (_, i) => card(`c${i}`)) });
  let active = 0; let peak = 0; const suggested = [];
  const guidesFor = async (batch) => {
    active += 1; peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 20));
    active -= 1;
    for (const c of batch) assert.deepEqual(c.searchSuggestions, [`${c.keyword} 뜻`]);
    return { provider: 'fake', results: batch.filter((c) => c.id !== 'c3').map((c) => ({ id: c.id, guide })) };
  };
  const suggest = async (kw) => { suggested.push(kw); return [`${kw} 뜻`]; };
  const out = await generateGuides(cards, { batchSize: 3, concurrency: 2, budgetMs: 60_000, guidesFor, suggest, now: () => now, rules: 'R' });
  assert.equal(out.made.length, 9);
  assert.deepEqual(out.missed, ['c3']);
  assert.ok(peak <= 2 && peak >= 2, `동시 ${peak}`);
  assert.equal(suggested.length, 10);
  assert.deepEqual(out.made[0].urls, ['https://blog.naver.com/x/c0']);
  assert.equal(out.made[0].rules, 'R');
  const none = await generateGuides(cards, { batchSize: 3, concurrency: 2, budgetMs: 0, guidesFor, suggest, now: () => now, rules: 'R' });
  assert.equal(none.made.length, 0);
  // 배치 하나가 터져도 나머지는 간다(그 배치 카드는 통과 못 함으로 기록하지 않는다 — 다음 회차에 다시)
  const flaky = await generateGuides(cards.slice(0, 6), { batchSize: 3, concurrency: 1, budgetMs: 60_000, suggest, now: () => now, rules: 'R',
    guidesFor: async (batch) => { if (batch[0].id === 'c0') throw new Error('시간 초과'); return { provider: 'fake', results: batch.map((c) => ({ id: c.id, guide })) }; } });
  assert.deepEqual(flaky.made.map((g) => g.id), ['c3', 'c4', 'c5']);
  assert.deepEqual(flaky.missed, []);
});

test('창고 합치기 · 덮임 세기 — 새 안내가 같은 id 를 대체, 통과 못 한 기록은 새로 지어지면 지운다', () => {
  const store = { guides: [{ id: 'a', urls: [], guide: { ...guide, direction: '옛' }, at: iso(now - 1000), rules: '옛' }], misses: [{ id: 'b', at: iso(now - 5000) }] };
  const merged = mergeStore(store, { made: [{ id: 'a', urls: [], guide, at: iso(now), rules: 'R' }, { id: 'b', urls: ['https://u/b'], guide, at: iso(now), rules: 'R' }], missed: ['c'] }, now);
  assert.deepEqual(merged.guides.map((g) => `${g.id}:${g.guide.direction}`), ['a:방향', 'b:방향']);
  assert.deepEqual(merged.misses.map((m) => m.id), ['c']);
  const cards = cardsForGuides({ candidates: [card('a'), card('x', { sources: [{ url: 'https://u/b', title: 't' }] }), card('z')] });
  assert.deepEqual(coverage(cards, merged), { covered: 2, total: 3 });
});

test('자동완성 — 검색어 통째 → 앞 3어절 → 앞 2어절 순으로 모아 10개까지 · 같은 말 · 검색어 자신은 빼고 · 실패해도 빈 목록', async () => {
  const asked = [];
  const fake = async (q) => { asked.push(q); return { '대전 동구동락 축제 리센느 가수': [], '대전 동구동락 축제': ['대전 동구동락 축제 라인업', '대전 동구동락 축제'], '대전 동구동락': ['대전 동구동락 축제 라인업', '대전 동구동락 주차'] }[q] || []; };
  const got = await suggestionsFor('대전 동구동락 축제 리센느 가수', fake);
  assert.deepEqual(got, ['대전 동구동락 축제 라인업', '대전 동구동락 축제', '대전 동구동락 주차']);
  assert.deepEqual(asked, ['대전 동구동락 축제 리센느 가수', '대전 동구동락 축제', '대전 동구동락']);
  assert.deepEqual(await suggestionsFor('장기전세', async () => { throw new Error('막힘'); }), []);
});
