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

async function collectAll(sources, now, { concurrency = 16, fetcher = core.fetchFeed } = {}) {
  const allow = core.buildAllowlist(sources);
  const results = new Array(sources.length);
  let next = 0;
  async function worker() {
    while (next < sources.length) {
      const i = next++;
      const source = sources[i];
      try {
        let xml;
        try { xml = await fetcher(source.feedUrl, allow); } catch (first) {
          await new Promise((r) => setTimeout(r, 600));
          // 방화벽이 머리글을 거른 경우(403/406/415)는 흔한 형식 머리글로, 그 밖(시간 초과 등)은 같은 머리글로 한 번 더.
          const blocked = /HTTP (403|406|415)/.test(String((first && first.message) || first));
          xml = await fetcher(source.feedUrl, allow, blocked ? { headers: core.PLAIN_HEADERS } : undefined);
        }
        results[i] = { id: source.id, status: 'ok', posts: core.parseFeed(xml, source, now).posts };
      } catch (error) {
        results[i] = { id: source.id, status: 'error', error: String((error && error.message) || error), posts: [] };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, sources.length)) }, worker));
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
