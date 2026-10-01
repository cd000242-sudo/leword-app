#!/usr/bin/env node
/**
 * 홈판 벤치마크 제목 창고 — 소재(카드) 1개당 홈판 후킹형 제목 20개를 구독 CLI 로 짓는다.
 *
 * ## 왜 여기서 만드나
 *
 * 벤치마크 판(homefeed-benchmarks.json)은 매시 수집기가 통째로 다시 만든다. 밖에서
 * 제목을 붙여도 다음 회차에 지워지므로, 수집 직후 이 자리에서 붙여야 한다. 구독
 * 자격(CLAUDE_CODE_OAUTH_TOKEN)은 이 저장소에만 있다 — brief-titles 와 같은 구조.
 *
 * ## 두 단계, 서로 독립
 *
 * 1. 생성: 창고에 없는(또는 낡은) 카드만 골라 2장씩 묶어 제목을 짓는다. 배치 하나가
 *    실패해도 다음 배치는 계속 간다. AI 가 전부 실패해도 여기서 죽지 않는다.
 * 2. 부착: 창고에 있는 제목을 판의 카드에 `homeTitles` 로 얹는다. AI 없이도 돈다.
 *    이 단계가 죽으면 판이 안 나가므로 절대 throw 하지 않게 짜여 있다.
 *
 * ## 지어내지 않기
 *
 * 재료는 카드의 제목·요약·함께 검색되는 말뿐이다. 재료에 없는 숫자, 쉼표 이분법,
 * 콜론·라벨형, 과장어, 기사 제목 베끼기는 엔진(benchmark-title-engine)이 떨어뜨린다.
 *
 * 사용:
 *   node scripts/enrich-benchmark-titles.js --board=<homefeed-benchmarks.json> --store=<homefeed-benchmark-titles.json> [--max=8] [--no-ai]
 */
'use strict';

const fs = require('fs');
const path = require('path');

/** 창고 유효기간. 카드는 발행 7일이 지나면 stale 이라 어차피 제목을 안 짓는다. */
const TITLE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * 제목 규칙 판 — 규칙이 바뀌면 올린다. 옛 판으로 지은 항목은 새 카드 다음 차례로 다시 짓고, 그때까지는 판에 그대로 남는다.
 * 2026-10-01: 완결된 제목(28자 하한 · 말을 걸다 만 꼬리 금지 · 두 박자 · 실제 홈판 본보기) — 사장님 "만들다 만 느낌".
 */
const TITLE_RULES = '2026-10-01-complete';

function arg(name, fallback = '') {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}
function flag(name) { return process.argv.includes(`--${name}`); }

function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
// 판과 같은 파일 규격(인라인 안전 이스케이프)을 쓰려고 수집기 코어의 serialize 를 그대로 쓴다.
const { serialize } = require('./homefeed-benchmarks-core.cjs');
function atomicWrite(file, value) {
  const resolved = path.resolve(file); fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const temp = `${resolved}.${process.pid}.tmp`;
  try { fs.writeFileSync(temp, serialize(value) + '\n', 'utf8'); fs.renameSync(temp, resolved); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}

/** 창고에서 아직 안 낡고 제목이 있는 항목만 남긴다. */
function freshEntries(store, nowMs = Date.now()) {
  const list = Array.isArray(store && store.entries) ? store.entries : [];
  return list.filter((e) => e && typeof e.id === 'string'
    && Array.isArray(e.titles) && e.titles.length > 0
    && Number.isFinite(Date.parse(String(e.at || ''))) && Date.parse(e.at) > nowMs - TITLE_TTL_MS);
}

/** 이번 회차에 지을 카드 — 창고에 없는 카드 먼저, 그다음 옛 규칙으로 지은 카드. 최대 max. */
function pickTitleTargets(cards, kept, max) {
  const have = new Set(kept.map((e) => e.id));
  const current = new Set(kept.filter((e) => e.rules === TITLE_RULES).map((e) => e.id));
  const missing = cards.filter((c) => !have.has(c.id));
  const outdated = cards.filter((c) => have.has(c.id) && !current.has(c.id));
  return [...missing, ...outdated].slice(0, max);
}

/** 새로 지은 항목이 같은 id 의 옛 항목을 대체한다. */
function mergeEntries(kept, made) {
  const replaced = new Set(made.map((e) => e.id));
  return [...kept.filter((e) => !replaced.has(e.id)), ...made];
}

/** 판의 카드마다 창고 제목을 `homeTitles` 로 얹는다. 없으면 빈 목록 — 화면이 "준비 중" 을 그린다. */
function attachTitles(board, entries) {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const candidates = (board && Array.isArray(board.candidates) ? board.candidates : []).map((card) => {
    const hit = byId.get(card.id);
    return { ...card, homeTitles: hit ? [...hit.titles] : [], ...(hit ? { homeTitlesAt: hit.at } : {}) };
  });
  return { ...board, candidates };
}

/** 탈락 이유를 세어 한 줄로 — "20 (NO_ANCHOR 14, ARTICLE_COPY 3)". 규칙이 너무 조이는지 CI 로그에서 바로 보인다. */
function reasonSummary(rejected) {
  const counts = rejected.flatMap((r) => r.reasons).reduce((acc, reason) => ({ ...acc, [reason]: (acc[reason] || 0) + 1 }), {});
  const parts = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([reason, n]) => `${reason} ${n}`);
  return parts.length ? `${rejected.length} (${parts.join(', ')})` : String(rejected.length);
}

async function generate(board, kept, max) {
  // ts-node 는 생성 단계에서만 필요하다 — 부착만 할 때는 없어도 돈다.
  require('ts-node/register/transpile-only');
  const { cardsFromBenchmarks, titlesForCards, BENCHMARK_TITLE_BATCH } = require('../src/utils/benchmark-title-engine');
  const cards = pickTitleTargets(cardsFromBenchmarks(board), kept, max);
  const outdated = cards.filter((c) => kept.some((e) => e.id === c.id)).length;
  console.log(`제목 대상 ${cards.length}장 (새 카드 ${cards.length - outdated} · 옛 규칙 다시 짓기 ${outdated} · 창고 유지 ${kept.length}장) · 배치 ${BENCHMARK_TITLE_BATCH}`);
  const stamp = new Date().toISOString();
  const made = [];
  let provider = '';
  for (let i = 0; i < cards.length; i += BENCHMARK_TITLE_BATCH) {
    const batch = cards.slice(i, i + BENCHMARK_TITLE_BATCH);
    try {
      const result = await titlesForCards(batch);
      provider = result.provider || provider;
      for (const row of result.results) {
        const why = reasonSummary(row.rejected);
        if (row.titles.length === 0) { console.log(`  - ${row.id} 통과 제목 0건 (탈락 ${why})`); continue; }
        const card = batch.find((c) => c.id === row.id);
        made.push({ id: row.id, keyword: card ? card.keyword : '', category: card ? card.category : '', titles: row.titles, rejected: row.rejected.length, provider: result.provider, at: stamp, rules: TITLE_RULES });
        console.log(`  ✚ ${row.id} ${card ? card.keyword : ''} → ${row.titles.length}개 (탈락 ${why}, ${result.provider})`);
      }
    } catch (error) {
      console.log(`  !! 배치 실패(계속): ${String((error && error.message) || error).slice(0, 160)}`);
    }
  }
  return { made, provider, asked: cards.length };
}

async function main() {
  const boardPath = arg('board');
  const storePath = arg('store');
  const max = Number(arg('max')) || 8;
  if (!boardPath || !storePath) {
    console.error('--board=<homefeed-benchmarks.json> --store=<homefeed-benchmark-titles.json> 이 필요합니다.');
    process.exit(2);
  }
  const board = readJson(boardPath);
  if (!board || !Array.isArray(board.candidates)) throw new Error(`벤치마크 판을 읽지 못했습니다: ${boardPath}`);
  const kept = freshEntries(readJson(storePath));

  let made = [];
  let provider = '';
  let asked = 0;
  if (flag('no-ai')) console.log('AI 생성 건너뜀(--no-ai) · 창고 부착만 한다.');
  else {
    try { ({ made, provider, asked } = await generate(board, kept, max)); }
    catch (error) { console.log(`!! 생성 단계 실패(부착은 계속): ${String((error && error.message) || error).slice(0, 200)}`); }
  }

  const entries = mergeEntries(kept, made);
  const previousProvider = (readJson(storePath) || {}).provider || '';
  atomicWrite(storePath, { generatedAt: new Date().toISOString(), provider: provider || previousProvider, total: entries.length, entries });
  atomicWrite(boardPath, attachTitles(board, entries));

  const attached = board.candidates.filter((c) => entries.some((e) => e.id === c.id)).length;
  console.log(`\n제목 창고 ${entries.length}장 (새로 ${made.length}/${asked}장) → ${storePath}`);
  console.log(`판 부착: 카드 ${board.candidates.length}장 중 제목 있는 카드 ${attached}장`);
  if (asked > 0 && made.length === 0) console.log('::warning::이번 회차 새 제목 0건 — 구독 CLI 상태를 확인하세요. 판은 창고 제목으로 나갑니다.');
}

module.exports = { attachTitles, freshEntries, mergeEntries, pickTitleTargets, TITLE_RULES, TITLE_TTL_MS };

if (require.main === module) {
  main().catch((error) => { console.error('벤치마크 제목 창고 실패:', error); process.exit(1); });
}
