/**
 * 홈판 벤치마크 작성 안내 창고(2026-10-10 사장님 "전부 다 붙이고 싶다 — 12장만이 아니라, 확인하는 사람이 있거든").
 * 판 수집과 따로 도는 안내 작업이 카드마다 안내를 짓고 자기 파일(homefeed-benchmark-guides.json)에만 쌓는다.
 * 사이트가 판과 합친다(카드 id → 없으면 원문 주소).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { cardsForGuides, pruneStore, pickGuideTargets, generateGuides, mergeStore, coverage, suggestionsFor, kinQuestionsFor, MISS_RETRY_MS, GRACE_MS } = require('./enrich-benchmark-guides.js');

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

// 2026-10-13 애드센스 벤치마크 안내 — 자동완성은 실측한 대표 검색어(metrics.query)로, 없으면 소재 키워드로
test('자동완성을 물을 말 — 애드센스 판은 대표 검색어(metrics.query), 없으면 키워드', () => {
  const cards = cardsForGuides({ candidates: [card('a', { keyword: '근로장려금 기한 받습니다', metrics: { query: '근로장려금 기한후신청' } }), card('b')] });
  assert.equal(cards[0].suggestQuery, '근로장려금 기한후신청');
  assert.equal(cards[1].suggestQuery, '키워드 b');
});

// 2026-10-20 사장님 "지식인에서 문제점을 보고 그걸 해결해 주는 글" — 애드센스 안내는 지식인 질문을 재료로 넣고, 질문 3개(링크)를 안내와 함께 저장한다.
test('enrich 가 붙인 지식인 질문이 AI 재료로 가고, 저장 칸 kinQuestions 로 남는다', async () => {
  const seen = [];
  const cards = [{ id: 'a', keyword: '기초연금 모의계산', urls: ['u1'], suggestQuery: '기초연금 모의계산' }];
  const enrich = async () => ({ kinQuestions: [{ title: '모의계산 처음 할 때', summary: '재산', views: 10 }], kinStore: [{ title: '모의계산 처음 할 때', link: 'https://kin.naver.com/qna/detail.naver?docId=1', views: 10 }] });
  const result = await generateGuides(cards, {
    batchSize: 3, concurrency: 1, budgetMs: 60000, rules: 'r', suggest: async () => [], enrich,
    guidesFor: async (batch) => { seen.push(...batch); return { provider: 'p', results: [{ id: 'a', guide: { direction: 'd', searchTargets: [], mustInclude: ['x', 'y'], mustAvoid: [], checkBefore: [] } }] }; },
  });
  assert.equal(seen[0].kinQuestions[0].title, '모의계산 처음 할 때');
  assert.equal(result.made[0].kinQuestions[0].link, 'https://kin.naver.com/qna/detail.naver?docId=1');
});

test('kinQuestionsFor — 워커 지식인 검색에서 질문 5개(재료) · 3개(저장, 링크 포함)', async () => {
  const fake = async (url, init) => {
    assert.deepEqual(JSON.parse(init.body), { action: 'kin-search', query: '기초연금 모의계산', limit: '5' });
    return { json: async () => ({ ok: true, questions: Array.from({ length: 6 }, (_, i) => ({ title: `질문${i}`, link: `https://kin.naver.com/qna/detail.naver?docId=${i}`, summary: `요약${i}`, views: 100 - i, answers: 1, askedAt: '2026.10.01' })) }) };
  };
  const got = await kinQuestionsFor('기초연금 모의계산', fake);
  assert.equal(got.kinQuestions.length, 5);
  assert.equal(got.kinStore.length, 3);
  assert.equal(got.kinStore[0].link, 'https://kin.naver.com/qna/detail.naver?docId=0');
  assert.deepEqual(await kinQuestionsFor('x', async () => { throw new Error('down'); }), {});
});

/*
 * 2026-11-08 사장님 "반드시 들어갈 내용 · 넣지 않을 내용이 있는 카드와 없는 카드가 일관되지 않다" — 안내가 있는 카드는 1,000장 중 33장(3%)이었다.
 * 뿌리: 제목 작업이 같은 구독 주간 한도를 먹어 안내 작업이 rate_limited 로 0건인데도 '성공'으로 끝났다(11/05 이후 3일).
 * 고친 것: 한도에 닿으면 남은 배치를 시작하지 않고(헛 호출 · 자동완성 낭비 방지), 0건이면 빨간불, 일부만 되면 경고. 다른 엔진으로 넘어가지 않는다.
 */
const { isRateLimitError, guideRunSummary, summaryVerdict } = require('./benchmark-run-summary.cjs');

test('한도 소진 판별 — CI 로그에 실제로 찍힌 두 문구(첫 실패 · 쉬는 중 건너뜀)는 한도, 시간 초과 · 로그인 문제는 한도가 아니다', () => {
  assert.equal(isRateLimitError(new Error('구독 CLI 전부 실패: claude: Claude Code 생성 실패 (원인 코드: rate_limited). 현재 구독 사용 한도가 소진되었습니다. 상세: You\'ve hit your weekly limit')), true);
  assert.equal(isRateLimitError(new Error('구독 CLI 전부 실패: claude: 건너뜀: 사용 한도 초과 — 30분 뒤 다시 시도 → codex: 건너뜀: 로그인 필요 — 3분 뒤 다시 시도')), true);
  assert.equal(isRateLimitError('weekly limit reached'), true);
  assert.equal(isRateLimitError(new Error('구독 CLI 전부 실패: claude: Claude Code 생성 실패 (원인 코드: timeout). 제한 시간 안에 응답을 받지 못했습니다.')), false);
  assert.equal(isRateLimitError(new Error('구독 CLI 전부 실패: claude: 건너뜀: 로그인 필요 — 3분 뒤 다시 시도')), false);
  assert.equal(isRateLimitError(null), false);
  assert.equal(isRateLimitError(undefined), false);
});

test('안내 짓기 — 한도에 닿으면 남은 배치를 시작하지 않는다(자동완성 · 호출 낭비 없이) · 실패 수와 한도 여부를 돌려준다', async () => {
  const cards = cardsForGuides({ candidates: Array.from({ length: 12 }, (_, i) => card(`c${i}`)) });
  let calls = 0; let suggested = 0;
  const out = await generateGuides(cards, {
    batchSize: 3, concurrency: 1, budgetMs: 60_000, now: () => now, rules: 'R',
    suggest: async () => { suggested += 1; return []; },
    guidesFor: async () => { calls += 1; throw new Error('구독 CLI 전부 실패: claude: Claude Code 생성 실패 (원인 코드: rate_limited). 현재 구독 사용 한도가 소진되었습니다.'); },
  });
  assert.equal(calls, 1, '첫 배치가 한도에 닿으면 나머지 3개 배치는 시작하지 않는다');
  assert.equal(suggested, 3, '자동완성도 첫 배치 카드 3장만');
  assert.deepEqual([out.made.length, out.missed.length, out.failed, out.rateLimited, out.skipped], [0, 0, 1, true, 3]);
});

test('안내 짓기 — 한도가 아닌 실패(시간 초과 등)는 그 배치만 건너뛰고 계속, 한도 여부는 거짓', async () => {
  const cards = cardsForGuides({ candidates: Array.from({ length: 6 }, (_, i) => card(`c${i}`)) });
  const out = await generateGuides(cards, {
    batchSize: 3, concurrency: 1, budgetMs: 60_000, now: () => now, rules: 'R', suggest: async () => [],
    guidesFor: async (batch) => { if (batch[0].id === 'c0') throw new Error('시간 초과'); return { provider: 'fake', results: batch.map((c) => ({ id: c.id, guide })) }; },
  });
  assert.deepEqual([out.made.length, out.failed, out.rateLimited, out.skipped], [3, 1, false, 0]);
});

test('안내 순서 — 안내가 없는 카드를 화면 위쪽(추천 → 우선순위)부터 채운다 · 첫 배치가 가장 위쪽 카드, 이미 안내가 있는 카드는 다시 묻지 않는다', async () => {
  const cards = cardsForGuides({ candidates: [
    card('low1', { priority: 1 }), card('top-done', { recommended: true, priority: 99 }), card('mid', { priority: 50 }),
    card('top2', { recommended: true, priority: 80 }), card('top1', { recommended: true, priority: 90 }), card('low2', { priority: 2 }),
  ] });
  const store = { guides: [{ id: 'top-done', urls: [], guide, rules: 'R' }], misses: [] };
  const targets = pickGuideTargets(cards, store, 'R', 100);
  assert.deepEqual(targets.map((c) => c.id), ['top1', 'top2', 'mid', 'low2', 'low1']);
  const asked = [];
  await generateGuides(targets, { batchSize: 2, concurrency: 1, budgetMs: 60_000, now: () => now, rules: 'R', suggest: async () => [],
    guidesFor: async (batch) => { asked.push(batch.map((c) => c.id)); return { provider: 'fake', results: batch.map((c) => ({ id: c.id, guide })) }; } });
  assert.deepEqual(asked, [['top1', 'top2'], ['mid', 'low2'], ['low1']], '한도가 중간에 끊겨도 위쪽 카드부터 채워져 있다');
});

test('회차 요약 — 요청했는데 0건이고 실패 배치가 있으면 stalled, 거르개가 다 버린 것(실패 없음)은 stalled 아님', () => {
  assert.deepEqual(guideRunSummary({ asked: 953, made: 0, missed: 0, failed: 159, rateLimited: true, skipped: 0 }), { asked: 953, made: 0, missed: 0, failed: 159, rateLimited: true, skipped: 0, stalled: true });
  assert.equal(guideRunSummary({ asked: 10, made: 4, failed: 2, rateLimited: true }).stalled, false);
  assert.equal(guideRunSummary({ asked: 10, made: 0, missed: 10, failed: 0 }).stalled, false, '답은 왔고 거르개가 버린 것');
  assert.equal(guideRunSummary({ asked: 0, made: 0 }).stalled, false);
  assert.equal(guideRunSummary({}).asked, 0);
});

test('회차 판정 — 0건+한도는 빨간불(한도 안내), 0건+다른 실패도 빨간불, 일부만 되고 한도면 경고, 정상은 통과', () => {
  const stalledLimit = summaryVerdict(guideRunSummary({ asked: 953, made: 0, failed: 159, rateLimited: true }));
  assert.equal(stalledLimit.level, 'error');
  assert.match(stalledLimit.message, /953/);
  assert.match(stalledLimit.message, /한도/);
  const stalledOther = summaryVerdict(guideRunSummary({ asked: 12, made: 0, failed: 4, rateLimited: false }));
  assert.equal(stalledOther.level, 'error');
  assert.doesNotMatch(stalledOther.message, /한도 소진/);
  const partial = summaryVerdict(guideRunSummary({ asked: 100, made: 40, failed: 20, rateLimited: true }));
  assert.equal(partial.level, 'warning');
  assert.match(partial.message, /40\/100/);
  assert.equal(summaryVerdict(guideRunSummary({ asked: 100, made: 100, failed: 0 })).level, 'ok');
  assert.equal(summaryVerdict(guideRunSummary({ asked: 0, made: 0 })).level, 'ok');
  assert.equal(summaryVerdict(null).level, 'ok', '요약 파일이 없으면(AI 단계를 건너뜀) 말하지 않는다');
});

test('회차 판정 CLI — 빨간불이면 종료 코드 1과 ::error::, 경고는 0과 ::warning::, 파일이 없으면 0', () => {
  const { spawnSync } = require('node:child_process');
  const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-run-'));
  const run = (summary) => {
    const file = path.join(dir, 'run.json');
    if (summary === null) { try { fs.unlinkSync(file); } catch { /* 없어도 된다 */ } } else fs.writeFileSync(file, JSON.stringify(summary));
    return spawnSync(process.execPath, [path.join(__dirname, 'benchmark-run-summary.cjs'), file], { encoding: 'utf8' });
  };
  try {
    const red = run(guideRunSummary({ asked: 953, made: 0, failed: 159, rateLimited: true }));
    assert.equal(red.status, 1);
    assert.match(red.stdout, /::error::/);
    const yellow = run(guideRunSummary({ asked: 100, made: 40, failed: 20, rateLimited: true }));
    assert.equal(yellow.status, 0);
    assert.match(yellow.stdout, /::warning::/);
    assert.equal(run(guideRunSummary({ asked: 100, made: 100 })).status, 0);
    assert.equal(run(null).status, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
