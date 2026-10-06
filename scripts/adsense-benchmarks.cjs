#!/usr/bin/env node
/**
 * 애드센스 고수 벤치마크 판 만들기(2026-10-07) — 출처 786곳 RSS 를 동시에 읽어 최근 7일 소재를 묶고 공개 판 JSON 을 쓴다.
 * 한 출처가 실패해도 나머지는 간다. 이번에 글을 하나도 못 받으면 지난 판을 유지한다(빈 판으로 덮지 않음).
 *
 * 사용: node scripts/adsense-benchmarks.cjs --output <site/spa/public/data/adsense-benchmarks.json> [--sources scripts/adsense-benchmarks-sources.json] [--concurrency 16]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const core = require('./adsense-benchmarks-core.cjs');
const { serialize } = require('./homefeed-benchmarks-core.cjs');

function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
function atomicWrite(file, value) {
  const resolved = path.resolve(file);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const temp = `${resolved}.${process.pid}.tmp`;
  try { fs.writeFileSync(temp, serialize(value) + '\n', 'utf8'); fs.renameSync(temp, resolved); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}

// onProgress(done, total) — 앱 화면이 6,412곳 수집 진행을 그린다(2026-10-07 앱 전체판).
/*
 * 티스토리 차단 예방(2026-10-07 사장님 "자동화된 접근차단이 뜬다").
 * 출처의 74%(앱 4,757곳)가 티스토리 — 블로그가 달라도 같은 서버다. 동시 24로 읽자 티스토리가 이 IP 를 막았고
 * ("과도한 접근 요청으로 블로그 사용이 잠시 중단… 자동화된 접근"), 같은 IP 로 보는 사장님 브라우저까지 막혔다.
 *  - 티스토리는 따로 한 줄: 동시 tistoryConcurrency(2) · 요청 사이 tistoryGapMs(700ms) 쉼.
 *  - 429 가 한 번이라도 오면 그 회차 티스토리는 거기서 멈춘다. 다시 두드리면 차단이 길어진다(남은 곳은 'skipped').
 *  - 다른 블로그는 서로 다른 서버라 동시 concurrency 로 그대로.
 */
const isTistory = (source) => { try { return /(^|.)tistory.com$/i.test(new URL(source.feedUrl).hostname); } catch { return false; } };
const is429 = (e) => /HTTP 429/.test(String((e && e.message) || e));
const TISTORY_SKIPPED = '티스토리 차단 예방 — 이번 회차는 건너뜀(429 를 받아 더 묻지 않음)';

async function collectAll(sources, now, { concurrency = 16, tistoryConcurrency = 2, tistoryGapMs = 700, fetcher = core.fetchFeed, onProgress = null, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const allow = core.buildAllowlist(sources);
  const results = new Array(sources.length);
  let done = 0;
  let tistoryHalted = false;
  const finish = (i, result) => {
    results[i] = result;
    done += 1;
    if (onProgress) { try { onProgress(done, sources.length); } catch { /* 화면 알림 실패는 수집과 무관 */ } }
  };
  async function fetchSource(source) {
    try { return await fetcher(source.feedUrl, allow); } catch (error) {
      if (is429(error)) throw error;
      // 그 밖: 한 번만 더. 방화벽이 머리글을 거른 경우(403/406/415)는 흔한 형식 머리글로.
      await sleep(600);
      const plain = /HTTP (403|406|415)/.test(String((error && error.message) || error));
      return fetcher(source.feedUrl, allow, plain ? { headers: core.PLAIN_HEADERS } : undefined);
    }
  }
  function lane(indexes, width, gapMs, tistory) {
    let next = 0;
    async function worker() {
      while (next < indexes.length) {
        const i = indexes[next++];
        const source = sources[i];
        if (tistory && tistoryHalted) { finish(i, { id: source.id, status: 'skipped', error: TISTORY_SKIPPED, posts: [] }); continue; }
        try {
          const xml = await fetchSource(source);
          finish(i, { id: source.id, status: 'ok', posts: core.parseFeed(xml, source, now).posts });
        } catch (error) {
          if (tistory && is429(error)) tistoryHalted = true;
          finish(i, { id: source.id, status: 'error', error: String((error && error.message) || error), posts: [] });
        }
        if (gapMs > 0 && next < indexes.length && !(tistory && tistoryHalted)) await sleep(gapMs);
      }
    }
    return Array.from({ length: Math.max(1, Math.min(width, indexes.length)) }, worker);
  }
  const tistoryIdx = [];
  const otherIdx = [];
  sources.forEach((s, i) => (isTistory(s) ? tistoryIdx : otherIdx).push(i));
  await Promise.all([...lane(tistoryIdx, tistoryConcurrency, tistoryGapMs, true), ...lane(otherIdx, concurrency, 0, false)]);
  return results;
}

async function main(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!['--output', '--sources', '--concurrency'].includes(argv[i]) || !argv[i + 1]) throw new Error('Usage: node scripts/adsense-benchmarks.cjs --output <public.json> [--sources <sources.json>] [--concurrency 16]');
    args[argv[i].slice(2)] = argv[++i];
  }
  if (!args.output) throw new Error('--output 이 필요합니다.');
  const registry = readJson(args.sources || path.join(__dirname, 'adsense-benchmarks-sources.json'));
  const sources = Array.isArray(registry && registry.sources) ? registry.sources : [];
  if (!sources.length) throw new Error('출처 목록이 비었습니다.');
  const now = new Date().toISOString();
  const started = Date.now();
  const results = await collectAll(sources, now, { concurrency: Number(args.concurrency) || 16 });
  const board = core.buildBoard(results, sources, now);
  const previous = readJson(args.output);
  if (!board.collectedPostCount && previous && previous.schemaVersion === 1 && Array.isArray(previous.candidates)) {
    atomicWrite(args.output, { ...previous, attemptedAt: now, status: 'stale', okCount: board.okCount, reason: '이번 수집에서 글을 받지 못해 마지막 판을 유지합니다.' });
    console.log(`글 0건 — 지난 판 유지 (성공 출처 ${board.okCount}/${sources.length})`);
    return;
  }
  atomicWrite(args.output, board);
  const errors = results.filter((r) => r.status !== 'ok');
  const reasons = Object.entries(errors.reduce((m, r) => ({ ...m, [r.error.slice(0, 24)]: (m[r.error.slice(0, 24)] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${v}`).join(' · ');
  console.log(`출처 ${board.okCount}/${sources.length} 성공 · 7일 글 ${board.collectedPostCount}건 · 카드 ${board.candidates.length}장(★ ${board.candidates.filter((c) => c.recommended).length}) · ${Math.round((Date.now() - started) / 1000)}초`);
  if (errors.length) console.log(`실패 사유: ${reasons}`);
}

module.exports = { collectAll };

if (require.main === module) {
  main().catch((error) => { console.error('애드센스 벤치마크 수집 실패:', error.message); process.exit(1); });
}
