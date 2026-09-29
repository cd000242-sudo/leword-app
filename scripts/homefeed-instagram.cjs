'use strict';
/**
 * 홈판 벤치마크 — 인스타그램 게시물 읽기(Bright Data Instagram Scraper API, datasets v3).
 *
 * 인스타는 프로필·embed 전부 로그인 벽이라 공개 경로가 없다(2026-09 실측). 유일한 길이
 * Bright Data 게시물 데이터셋(discover_new by profile url)이고, **게시물 레코드 1건 = 1크레딧**
 * (성공분만 과금, 계정 공용 무료 5,000/월)이다. 사장님 승인 2026-09-30.
 *
 * 비용 규율:
 *  - 하루 1회(KST 날짜 기준)만 trigger 한다. 워크플로는 매시 돌지만 나머지 회차는 저장된 풀만 쓴다.
 *  - trigger 전에 쿼터 거버너 reserve(계정 수 × 계정당 게시물 수), 받은 뒤 실제 레코드 수로 record.
 *  - 이미 읽은 게시물 id 는 posts_to_not_include 로 빼 같은 게시물에 두 번 과금하지 않는다.
 *  - 폴링이 회차 안에 안 끝나면 snapshot_id 를 pending 으로 남기고 다음 회차가 이어받는다
 *    (같은 날 새로 trigger 하지 않는다 — 두 번 과금 방지).
 *
 * 스펙 근거(2소스 교차: docs.brightdata.com + 공식 Node SDK README, 2026-09-30):
 *  POST /datasets/v3/trigger?dataset_id=gd_lk5ns7kz21pck8jpis&type=discover_new&discover_by=url&include_errors=true
 *  GET  /datasets/v3/progress/{id} → status starting|running|ready|failed|canceled
 *  GET  /datasets/v3/snapshot/{id}?format=json → 레코드 배열(url, user_posted, description, likes, num_comments, date_posted, post_id …)
 */
const API = 'https://api.brightdata.com/datasets/v3';
const POSTS_DATASET = 'gd_lk5ns7kz21pck8jpis';
const FEATURE = 'homefeed';
const KST_MS = 9 * 3600 * 1000;
const DAY = 86400000;
const POOL_DAYS = 7;
const MAX_ATTEMPTS_PER_DAY = 3;

const kstDay = (iso) => new Date(Date.parse(iso) + KST_MS).toISOString().slice(0, 10);
const positiveInt = (value, fallback) => { const n = Math.floor(Number(value)); return Number.isSafeInteger(n) && n > 0 ? n : fallback; };
const accountOf = (url) => { try { return decodeURIComponent(new URL(url).pathname.replace(/^\/+|\/+$/g, '')).toLowerCase(); } catch { return ''; } };

/** 기본 쿼터 창구: TS 거버너를 실제 호출 직전에만 싣는다(테스트·무토큰 경로는 ts-node 를 안 건드린다). */
function defaultQuota() {
  require('ts-node/register/transpile-only');
  const g = require('../src/utils/brightdata-quota-governor');
  return { reserve: (f, n) => g.reserveBrightDataRequests(f, n), record: (f, n) => g.recordBrightDataRequests(f, n) };
}

/** Bright Data 레코드 → 풀에 저장하는 공개 필드만(본문 300자, 사진·영상 주소는 안 남긴다). */
function normalizeRecord(rec, sourceId, capturedAt) {
  const numberOrNull = (v) => { const n = Number(String(v ?? '').replace(/,/g, '')); return v !== null && v !== undefined && v !== '' && Number.isFinite(n) ? n : null; };
  return {
    sourceId,
    account: String(rec.user_posted || '').toLowerCase(),
    postId: rec.post_id ? String(rec.post_id) : null,
    url: String(rec.url || '').replace(/\/+$/, ''),
    description: String(rec.description || '').slice(0, 300),
    datePosted: rec.date_posted || null,
    likes: numberOrNull(rec.likes),
    comments: numberOrNull(rec.num_comments),
    views: numberOrNull(rec.video_view_count ?? rec.video_play_count),
    paidPartnership: rec.is_paid_partnership === true,
    capturedAt,
  };
}

function prunePool(posts, now) {
  const seen = new Set(); const floor = Date.parse(now) - POOL_DAYS * DAY; const out = [];
  for (const p of [...(posts || [])].reverse()) {
    if (!p || !p.url || seen.has(p.url) || !(Date.parse(p.capturedAt) >= floor)) continue;
    seen.add(p.url); out.push(p);
  }
  return out.reverse();
}

async function bdJson(fetchImpl, token, url, init = {}) {
  const response = await fetchImpl(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) }, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function trigger({ fetchImpl, token, sources, postsPerAccount, pool }) {
  const input = sources.map((s) => {
    const known = pool.filter((p) => p.sourceId === s.id && p.postId).map((p) => p.postId);
    return { url: s.url, num_of_posts: postsPerAccount, ...(known.length ? { posts_to_not_include: known } : {}) };
  });
  const query = new URLSearchParams({ dataset_id: POSTS_DATASET, type: 'discover_new', discover_by: 'url', include_errors: 'true', notify: 'false' });
  const data = await bdJson(fetchImpl, token, `${API}/trigger?${query}`, { method: 'POST', body: JSON.stringify({ input }) });
  if (!data || typeof data.snapshot_id !== 'string' || !data.snapshot_id) throw new Error('snapshot_id missing');
  return data.snapshot_id;
}

/** ready 면 레코드 배열, 아직이면 null, 실패면 throw. */
async function pollSnapshot({ fetchImpl, token, snapshotId, pollMs, maxPollMs, sleep }) {
  const deadline = Date.now() + maxPollMs;
  for (;;) {
    const progress = await bdJson(fetchImpl, token, `${API}/progress/${encodeURIComponent(snapshotId)}`);
    const status = String(progress?.status || '');
    if (status === 'ready') {
      const records = await bdJson(fetchImpl, token, `${API}/snapshot/${encodeURIComponent(snapshotId)}?format=json`);
      return Array.isArray(records) ? records : [];
    }
    if (status === 'failed' || status === 'canceled') throw new Error(`snapshot ${status}`);
    if (Date.now() >= deadline) return null;
    await sleep(pollMs);
  }
}

function acceptRecords(records, sources, now) {
  const accounts = new Map(sources.map((s) => [accountOf(s.url), s.id]));
  const charged = records.filter((r) => r && typeof r === 'object' && r.url && !r.error && !r.warning_code);
  const accepted = [];
  for (const rec of charged) {
    const item = normalizeRecord(rec, null, now);
    const sourceId = accounts.get(item.account) || accounts.get(accountOf(rec.discovery_input?.url || rec.profile_url || ''));
    if (!sourceId || !item.description.trim()) continue;
    accepted.push({ ...item, sourceId });
  }
  return { charged: charged.length, accepted };
}

function resultsFrom(sources, pool, { status, reason, fetchedAt }) {
  return new Map(sources.map((s) => {
    const posts = pool.filter((p) => p.sourceId === s.id);
    if (posts.length) return [s.id, { status: 'ok', posts, fetchedAt }];
    return [s.id, { status, reason, posts: [] }];
  }));
}

/**
 * 인스타 출처 묶음을 한 번에 읽는다. 순수 함수에 가깝게: 캐시 객체를 받아 새 캐시를 돌려주고 파일은 건드리지 않는다.
 * results: Map<sourceId, { status:'ok'|'failed'|'unavailable', reason?, posts:(normalized)[], fetchedAt? }>
 */
async function collectInstagram({ sources, now, cache, token, fetchImpl = fetch, quota, postsPerAccount, pollMs = 10000, maxPollMs = 240000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {} }) {
  const day = kstDay(now);
  const perAccount = positiveInt(postsPerAccount ?? process.env.LEWORD_IG_POSTS_PER_ACCOUNT, 8);
  const prior = cache && cache.schemaVersion === 1 ? cache : { schemaVersion: 1, posts: [] };
  const pool = prunePool(prior.posts, now);
  const fetchedAt = prior.fetchedAt || null;
  const sameDay = prior.day === day;
  const base = { schemaVersion: 1, day, posts: pool, fetchedAt, snapshotId: sameDay ? prior.snapshotId || null : null, snapshotStatus: sameDay ? prior.snapshotStatus || null : null, reserved: sameDay ? prior.reserved || 0 : 0, attempts: sameDay ? prior.attempts || 0 : 0, reason: sameDay ? prior.reason || null : null };
  const done = (patch, verdict) => { const next = { ...base, ...patch }; return { cache: next, results: resultsFrom(sources, next.posts, { fetchedAt: next.fetchedAt, ...verdict }) }; };

  if (!sources.length) return done({}, { status: 'unavailable', reason: '인스타 출처가 없습니다.' });
  if (!token) return done({}, { status: 'unavailable', reason: '인스타 수집 토큰(BRIGHTDATA_TOKEN)이 없어 새 게시물을 확인하지 못했습니다.' });
  if (sameDay && base.snapshotStatus === 'ready') return done({}, { status: 'failed', reason: '오늘 읽은 결과에 이 계정의 설명 있는 게시물이 없었습니다.' });
  if (sameDay && base.snapshotStatus === 'blocked') return done({}, { status: 'unavailable', reason: base.reason });
  if (sameDay && base.snapshotStatus === 'failed' && base.attempts >= MAX_ATTEMPTS_PER_DAY) return done({}, { status: 'unavailable', reason: `오늘 인스타 읽기가 ${base.attempts}번 실패해 내일 다시 시도합니다.` });

  const q = quota || defaultQuota();
  let snapshotId = sameDay && base.snapshotStatus === 'pending' ? base.snapshotId : null;
  let reserved = base.reserved; let attempts = base.attempts;
  if (!snapshotId) {
    const want = sources.length * perAccount;
    const decision = q.reserve(FEATURE, want);
    const granted = Math.max(0, Math.floor(decision.granted || 0));
    if (granted <= 0) {
      const reason = `이번 달 Bright Data 예산이 막혀 인스타를 읽지 않았습니다(${decision.reason || '상한 소진'}).`;
      log(`[instagram] ${reason}`);
      return done({ snapshotStatus: 'blocked', reason }, { status: 'unavailable', reason });
    }
    const perAccountGranted = Math.max(1, Math.floor(granted / sources.length));
    attempts += 1;
    try {
      snapshotId = await trigger({ fetchImpl, token, sources, postsPerAccount: perAccountGranted, pool });
      reserved = perAccountGranted * sources.length;
      log(`[instagram] trigger ${snapshotId} (${sources.length}계정 × ${perAccountGranted}건 예약, 시도 ${attempts})`);
    } catch (error) {
      const reason = `인스타 읽기 요청 실패(${/^HTTP \d+$/.test(error.message) ? error.message : '응답 형식 오류'}).`;
      log(`[instagram] ${reason}`);
      return done({ snapshotStatus: 'failed', attempts, reason }, { status: 'unavailable', reason });
    }
  }

  let records;
  try {
    records = await pollSnapshot({ fetchImpl, token, snapshotId, pollMs, maxPollMs, sleep });
  } catch (error) {
    const reason = `인스타 읽기 작업이 실패했습니다(${/^HTTP \d+$/.test(error.message) ? error.message : error.message.replace(/[^\w\s]/g, '')}).`;
    log(`[instagram] ${reason}`);
    return done({ snapshotId, snapshotStatus: 'failed', attempts, reserved, reason }, { status: 'unavailable', reason });
  }
  if (records === null) {
    const reason = '인스타 읽기 작업이 아직 처리 중이라 다음 회차에 이어받습니다.';
    log(`[instagram] ${snapshotId} pending`);
    return done({ snapshotId, snapshotStatus: 'pending', attempts, reserved, reason }, { status: 'unavailable', reason });
  }
  const { charged, accepted } = acceptRecords(records, sources, now);
  q.record(FEATURE, charged);
  log(`[instagram] ${snapshotId} ready: 레코드 ${charged}건 과금, 채택 ${accepted.length}건`);
  const posts = prunePool([...pool, ...accepted], now);
  return done({ snapshotId, snapshotStatus: 'ready', attempts, reserved, charged, fetchedAt: now, posts, reason: null }, { status: 'failed', reason: '오늘 읽은 결과에 이 계정의 설명 있는 게시물이 없었습니다.' });
}

module.exports = { collectInstagram, normalizeRecord, prunePool, acceptRecords, kstDay, POSTS_DATASET, FEATURE };
