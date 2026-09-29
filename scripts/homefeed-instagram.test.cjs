'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ig = require('./homefeed-instagram.cjs');
const core = require('./homefeed-benchmarks-core.cjs');
const { collect } = require('./homefeed-benchmarks.cjs');

const now = '2026-09-30T02:17:00.000Z'; // KST 2026-09-30 11:17
const sources = [
  { id: 'wide_story', platform: 'instagram', name: '와이드스토리', url: 'https://www.instagram.com/wide_story/' },
  { id: 'eyesmag', platform: 'instagram', name: '아이즈매거진', url: 'https://www.instagram.com/eyesmag/' },
];
const record = (extra = {}) => ({
  url: 'https://www.instagram.com/p/DcOX3hWFiey/', user_posted: 'wide_story', post_id: '3851176228498036124',
  description: '박나래 변호사 선임 소식\n\n자세한 내용은 본문에서 #연예', num_comments: 42, likes: 1200,
  date_posted: '2026-09-29T23:00:00.000Z', content_type: 'Image', is_paid_partnership: false, ...extra,
});

/** 가짜 Bright Data: 호출 순서를 기록하고 단계별 응답을 돌려준다. */
function fakeBrightData({ progress = ['running', 'ready'], records = [record()], triggerStatus = 200 } = {}) {
  const calls = [];
  let progressIndex = 0;
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null, auth: init.headers?.Authorization });
    const json = (status, value) => ({ ok: status < 400, status, json: async () => value, text: async () => JSON.stringify(value) });
    if (url.includes('/datasets/v3/trigger')) return json(triggerStatus, triggerStatus < 400 ? { snapshot_id: 'sd_test1' } : { error: 'bad' });
    if (url.includes('/datasets/v3/progress/')) return json(200, { status: progress[Math.min(progressIndex++, progress.length - 1)] });
    if (url.includes('/datasets/v3/snapshot/')) return json(200, records);
    throw new Error(`unexpected ${url}`);
  };
  return { calls, fetchImpl };
}
function fakeQuota({ granted } = {}) {
  const log = [];
  return {
    log,
    reserve(feature, count) { log.push(['reserve', feature, count]); const g = granted ?? count; return { allowed: g >= count && g > 0, granted: g, reason: g < count ? '잔여 예산 부족' : undefined }; },
    record(feature, count) { log.push(['record', feature, count]); return {}; },
  };
}
const run = (opts) => ig.collectInstagram({ sources, now, token: 'tok', postsPerAccount: 3, pollMs: 0, maxPollMs: 1000, ...opts });

test('토큰이 없으면 Bright Data 에 한 번도 닿지 않고 저장된 풀만 돌려준다', async () => {
  const bd = fakeBrightData(); const quota = fakeQuota();
  const cache = { schemaVersion: 1, day: '2026-09-29', snapshotStatus: 'ready', posts: [ig.normalizeRecord(record(), 'wide_story', '2026-09-29T02:17:00.000Z')] };
  const out = await run({ token: '', cache, fetchImpl: bd.fetchImpl, quota });
  assert.equal(bd.calls.length, 0); assert.equal(quota.log.length, 0);
  assert.equal(out.results.get('wide_story').status, 'ok'); assert.equal(out.results.get('wide_story').posts.length, 1);
  assert.equal(out.results.get('eyesmag').status, 'unavailable');
  assert.match(out.results.get('eyesmag').reason, /토큰/);
  assert.equal(out.cache.posts.length, 1, '풀은 그대로 남는다');
});

test('새 날이면 예약→trigger→progress→snapshot→record 순서로 한 번만 읽는다', async () => {
  const bd = fakeBrightData(); const quota = fakeQuota();
  const cache = { schemaVersion: 1, day: '2026-09-29', snapshotStatus: 'ready', posts: [ig.normalizeRecord(record({ post_id: 'old1', url: 'https://www.instagram.com/p/OLD/' }), 'wide_story', '2026-09-29T02:17:00.000Z')] };
  const out = await run({ cache, fetchImpl: bd.fetchImpl, quota });
  assert.deepEqual(quota.log, [['reserve', 'homefeed', 6], ['record', 'homefeed', 1]]);
  const trigger = bd.calls[0];
  assert.equal(trigger.method, 'POST'); assert.equal(trigger.auth, 'Bearer tok');
  assert.match(trigger.url, /^https:\/\/api\.brightdata\.com\/datasets\/v3\/trigger\?/);
  for (const q of ['dataset_id=gd_lk5ns7kz21pck8jpis', 'type=discover_new', 'discover_by=url', 'include_errors=true']) assert.ok(trigger.url.includes(q), q);
  assert.ok(!/[?&]notify=/.test(trigger.url), 'notify 는 웹훅 URL 칸 — 값을 넣으면 400(2026-09-30 실측)');
  assert.deepEqual(trigger.body.input.map((i) => i.url), sources.map((s) => s.url));
  assert.equal(trigger.body.input[0].num_of_posts, 3);
  assert.deepEqual(trigger.body.input[0].posts_to_not_include, ['old1'], '이미 읽은 게시물 id 는 제외해 크레딧을 아낀다');
  assert.equal(trigger.body.input[1].posts_to_not_include, undefined);
  assert.deepEqual(bd.calls.slice(1).map((c) => c.url.split('/datasets/v3/')[1].split('?')[0]), ['progress/sd_test1', 'progress/sd_test1', 'snapshot/sd_test1']);
  assert.equal(out.cache.day, '2026-09-30'); assert.equal(out.cache.snapshotStatus, 'ready'); assert.equal(out.cache.snapshotId, 'sd_test1');
  assert.equal(out.cache.posts.length, 2, '옛 게시물과 새 게시물이 풀에 같이 남는다');
  const ws = out.results.get('wide_story');
  assert.equal(ws.status, 'ok'); assert.equal(ws.posts.length, 2); assert.equal(ws.fetchedAt, now);
  assert.equal(out.results.get('eyesmag').status, 'failed');
});

test('같은 날 이미 읽었으면 Bright Data 를 다시 부르지 않는다', async () => {
  const bd = fakeBrightData(); const quota = fakeQuota();
  const cache = { schemaVersion: 1, day: '2026-09-30', snapshotStatus: 'ready', snapshotId: 'sd_x', posts: [ig.normalizeRecord(record(), 'wide_story', now)] };
  const out = await run({ cache, fetchImpl: bd.fetchImpl, quota });
  assert.equal(bd.calls.length, 0); assert.equal(quota.log.length, 0);
  assert.equal(out.results.get('wide_story').posts.length, 1);
});

test('지난 회차가 pending 이면 예약·trigger 없이 같은 snapshot 을 이어서 받고 그때 기록한다', async () => {
  const bd = fakeBrightData({ progress: ['ready'] }); const quota = fakeQuota();
  const cache = { schemaVersion: 1, day: '2026-09-30', snapshotStatus: 'pending', snapshotId: 'sd_test1', reserved: 6, attempts: 1, posts: [] };
  const out = await run({ cache, fetchImpl: bd.fetchImpl, quota });
  assert.deepEqual(quota.log, [['record', 'homefeed', 1]]);
  assert.ok(!bd.calls.some((c) => c.url.includes('/trigger')));
  assert.equal(out.cache.snapshotStatus, 'ready'); assert.equal(out.cache.posts.length, 1);
});

test('폴링 시간 안에 안 끝나면 pending 으로 남기고 기록하지 않는다 — 다음 회차가 이어받는다', async () => {
  const bd = fakeBrightData({ progress: ['running'] }); const quota = fakeQuota();
  const out = await run({ cache: null, fetchImpl: bd.fetchImpl, quota, maxPollMs: 1 });
  assert.deepEqual(quota.log, [['reserve', 'homefeed', 6]]);
  assert.equal(out.cache.snapshotStatus, 'pending'); assert.equal(out.cache.snapshotId, 'sd_test1'); assert.equal(out.cache.reserved, 6);
  assert.equal(out.results.get('wide_story').status, 'unavailable');
  assert.match(out.results.get('wide_story').reason, /처리 중/);
});

test('예산이 막히면 trigger 하지 않고 이유를 남긴다', async () => {
  const bd = fakeBrightData(); const quota = fakeQuota({ granted: 0 });
  const out = await run({ cache: null, fetchImpl: bd.fetchImpl, quota });
  assert.equal(bd.calls.length, 0);
  assert.equal(out.cache.snapshotStatus, 'blocked');
  assert.match(out.results.get('wide_story').reason, /예산/);
});

test('일부만 승인되면 계정당 게시물 수를 줄여서 읽는다', async () => {
  const bd = fakeBrightData(); const quota = fakeQuota({ granted: 4 });
  await run({ cache: null, fetchImpl: bd.fetchImpl, quota });
  assert.equal(bd.calls[0].body.input[0].num_of_posts, 2);
});

test('trigger 가 실패하면 failed 로 남기고 같은 날 최대 3번까지만 다시 시도한다', async () => {
  const bd = fakeBrightData({ triggerStatus: 500 }); const quota = fakeQuota();
  const logged = [];
  const first = await run({ cache: null, fetchImpl: bd.fetchImpl, quota, log: (line) => logged.push(line) });
  assert.equal(first.cache.snapshotStatus, 'failed'); assert.equal(first.cache.attempts, 1);
  assert.deepEqual(quota.log, [['reserve', 'homefeed', 6]], '실패한 호출은 기록하지 않는다');
  assert.match(logged.join('\n'), /HTTP 500\)\. 응답: \{"error":"bad"\}/, '응답 본문이 로그에 남아야 원인을 볼 수 있다(첫 회차 400 은 본문이 없어 못 봤다)');
  assert.equal(first.results.get('wide_story').reason, '인스타 읽기 요청 실패(HTTP 500).', '공개 판에는 상태 코드만');
  const exhausted = await run({ cache: { ...first.cache, attempts: 3 }, fetchImpl: bd.fetchImpl, quota });
  assert.equal(bd.calls.length, 1, '3번 실패한 날은 더 부르지 않는다');
  assert.match(exhausted.results.get('wide_story').reason, /실패/);
});

test('오류 레코드·설명 없는 게시물·7일 지난 게시물은 풀에서 빠지고 과금 계산에도 안 들어간다', async () => {
  const bd = fakeBrightData({ records: [record(), { input: { url: 'x' }, error: 'blocked', warning_code: 'dead_page' }, record({ post_id: 'p2', url: 'https://www.instagram.com/p/EMPTY/', description: '' }), record({ post_id: 'p3', url: 'https://www.instagram.com/p/OTHER/', user_posted: 'someone_else' })] });
  const quota = fakeQuota();
  const stale = ig.normalizeRecord(record({ post_id: 'stale', url: 'https://www.instagram.com/p/STALE/' }), 'wide_story', '2026-09-20T00:00:00.000Z');
  const out = await run({ cache: { schemaVersion: 1, day: '2026-09-29', snapshotStatus: 'ready', posts: [stale] }, fetchImpl: bd.fetchImpl, quota });
  assert.deepEqual(quota.log[1], ['record', 'homefeed', 3], '오류 레코드는 과금 대상이 아니다');
  assert.deepEqual(out.cache.posts.map((p) => p.postId), ['3851176228498036124'], '남의 계정·빈 설명·오래된 것은 빠진다');
});

test('레코드는 기존 기준 게시물 형식으로 옮겨진다 — 첫 줄이 제목, 좋아요·댓글이 지표', () => {
  const item = ig.normalizeRecord(record({ is_paid_partnership: true, video_view_count: '1500' }), 'wide_story', now);
  assert.equal(item.url, 'https://www.instagram.com/p/DcOX3hWFiey', '끝 슬래시는 뗀다');
  const { posts } = core.parseInstagram([item], sources[0], now);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].title, '박나래 변호사 선임 소식');
  assert.equal(posts[0].url, 'https://www.instagram.com/p/DcOX3hWFiey');
  assert.equal(posts[0].publishedAt, '2026-09-29T23:00:00.000Z');
  assert.deepEqual(posts[0].metrics, { views: 1500, likes: 1200, comments: 42 });
  assert.match(posts[0].summary, /유료광고 파트너십 표시/);
  assert.equal(posts[0].platform, 'instagram');
});

test('safeLink 는 인스타 게시물 주소만 통과시키고 프로필·외부 매개변수는 거른다', () => {
  assert.equal(core.safeLink('https://www.instagram.com/p/DcOX3hWFiey/?igsh=abc'), 'https://www.instagram.com/p/DcOX3hWFiey/');
  assert.equal(core.safeLink('https://www.instagram.com/reel/Cxyz_-12/'), 'https://www.instagram.com/reel/Cxyz_-12/');
  assert.equal(core.safeLink('https://www.instagram.com/wide_story/'), null);
  assert.equal(core.safeLink('https://instagram.com/p/DcOX3hWFiey/'), null);
});

test('수집기는 인스타 묶음이 있으면 그 결과를, 없으면 미확인 사유를 돌려준다', async () => {
  const bundle = new Map([['wide_story', { status: 'ok', posts: [core.parseInstagram([ig.normalizeRecord(record(), 'wide_story', now)], sources[0], now).posts[0]], fetchedAt: now }]]);
  const withBundle = await collect(sources[0], now, undefined, bundle);
  assert.equal(withBundle.status, 'ok'); assert.equal(withBundle.posts.length, 1); assert.equal(withBundle.fetchedAt, now);
  const without = await collect(sources[0], now, undefined, null);
  assert.equal(without.status, 'unavailable'); assert.equal(without.posts.length, 0);
});
