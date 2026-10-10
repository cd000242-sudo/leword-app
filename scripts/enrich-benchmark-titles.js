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
 * 2026-10-01(2): 원제목 변주 10 + 새 각도 10 — 사장님 "벤치마킹 제목이랑 갭 차이가 너무 크다".
 */
const TITLE_RULES = '2026-10-01-variants';
/**
 * 2026-10-10 사장님 "제목도 전부 채워 달라" — 카드 전부를 짓는 제목 작업(homefeed-guides.yml titles)이 창고만 쓰고,
 * 판 수집(homefeed-benchmarks.yml)은 붙이기만 한다(--attach-only). 창고는 지금 판 카드(id · 원문 주소)와 24시간 안의 것만 —
 * 전부 채우면 7일치가 20MB 를 넘는다. 0개 통과한 카드는 12시간 쉰다(같은 재료면 같은 결과).
 */
const GRACE_MS = 24 * 60 * 60 * 1000;
const MISS_RETRY_MS = 12 * 60 * 60 * 1000;

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

/**
 * 이번 회차에 지을 카드 — 옛 규칙으로 지은 카드(지금 판에 보이는 제목)와 창고에 없는 카드를 번갈아. 최대 max.
 * 새 카드를 먼저 다 채우게 하면 카드가 매시 새로 들어와 옛 제목이 끝내 안 바뀐다(2026-10-01 첫 회차 16장 전부 새 카드).
 */
function pickTitleTargets(cards, kept, max) {
  const have = new Set(kept.map((e) => e.id));
  const current = new Set(kept.filter((e) => e.rules === TITLE_RULES).map((e) => e.id));
  const missing = cards.filter((c) => !have.has(c.id));
  const outdated = cards.filter((c) => have.has(c.id) && !current.has(c.id));
  const picked = [];
  for (let i = 0; picked.length < max && (i < outdated.length || i < missing.length); i++) {
    if (i < outdated.length) picked.push(outdated[i]);
    if (i < missing.length && picked.length < max) picked.push(missing[i]);
  }
  return picked;
}

/** 새로 지은 항목이 같은 id 의 옛 항목을 대체한다. */
function mergeEntries(kept, made) {
  const replaced = new Set(made.map((e) => e.id));
  return [...kept.filter((e) => !replaced.has(e.id)), ...made];
}

/** 판의 카드마다 창고 제목을 `homeTitles` 로 얹는다(카드 id → 없으면 같은 원문 주소). 없으면 빈 목록 — 화면이 [지금 제목 만들기]를 그린다. */
function attachTitles(board, entries) {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const byUrl = new Map();
  for (const e of entries) for (const u of (Array.isArray(e.urls) ? e.urls : [])) if (u && !byUrl.has(u)) byUrl.set(u, e);
  const candidates = (board && Array.isArray(board.candidates) ? board.candidates : []).map((card) => {
    const hit = byId.get(card.id) || (Array.isArray(card.sources) ? card.sources.map((src) => byUrl.get(src && src.url)).find(Boolean) : undefined);
    return { ...card, homeTitles: hit ? [...hit.titles] : [], ...(hit ? { homeTitlesAt: hit.at } : {}) };
  });
  return { ...board, candidates };
}

/** 지금 판 카드와 맞거나(id · 원문 주소) 24시간 안에 지은 제목만 남긴다. */
function pruneEntries(entries, board, nowMs) {
  const candidates = board && Array.isArray(board.candidates) ? board.candidates : [];
  const ids = new Set(candidates.map((c) => c && c.id).filter(Boolean));
  const urls = new Set(candidates.flatMap((c) => (Array.isArray(c && c.sources) ? c.sources : []).map((src) => src && src.url).filter(Boolean)));
  return entries.filter((e) => ids.has(e.id) || (Array.isArray(e.urls) && e.urls.some((u) => urls.has(u))) || Date.parse(e.at) > nowMs - GRACE_MS);
}

/** 지을 후보 — 같은 원문 주소로 이미 지금 규칙 제목이 있는 카드 · 12시간 안에 0개 통과한 카드는 빼고, 추천 → 우선순위 순. */
function openTitleCards(cards, kept, misses, nowMs) {
  const covered = new Set(kept.filter((e) => e.rules === TITLE_RULES).flatMap((e) => (Array.isArray(e.urls) ? e.urls : [])));
  const missed = new Set((Array.isArray(misses) ? misses : []).filter((m) => m && Date.parse(m.at) > nowMs - MISS_RETRY_MS).map((m) => m.id));
  return cards.filter((c) => !missed.has(c.id) && !(Array.isArray(c.urls) && c.urls.some((u) => covered.has(u))))
    .sort((a, b) => Number(Boolean(b.recommended)) - Number(Boolean(a.recommended)) || (b.priority || 0) - (a.priority || 0));
}

/** 탈락 이유를 세어 한 줄로 — "20 (NO_ANCHOR 14, ARTICLE_COPY 3)". 규칙이 너무 조이는지 CI 로그에서 바로 보인다. */
function reasonSummary(rejected) {
  const counts = rejected.flatMap((r) => r.reasons).reduce((acc, reason) => ({ ...acc, [reason]: (acc[reason] || 0) + 1 }), {});
  const parts = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([reason, n]) => `${reason} ${n}`);
  return parts.length ? `${rejected.length} (${parts.join(', ')})` : String(rejected.length);
}

/**
 * 고른 카드를 배치로 나눠 동시에 짓는다(2026-10-07 — 직렬 8장이라 1,000장 판에 제목이 25장뿐이었다).
 * 동시 개수(concurrency)와 시간 상한(budgetMs, 넘으면 새 배치를 시작하지 않음)을 지킨다. 배치 하나가 실패해도 나머지는 간다.
 */
async function generateTitles(cards, kept, { batchSize, concurrency, budgetMs, titlesFor, now = Date.now }) {
  const startedAt = now();
  const stamp = new Date(startedAt).toISOString();
  const batches = [];
  for (let i = 0; i < cards.length; i += batchSize) batches.push(cards.slice(i, i + batchSize));
  const made = [];
  const missed = [];
  let provider = '';
  let next = 0;
  let skipped = 0;
  async function worker() {
    while (next < batches.length) {
      if (now() - startedAt >= budgetMs) { skipped = batches.length - next; next = batches.length; return; }
      const batch = batches[next++];
      try {
        const result = await titlesFor(batch);
        provider = result.provider || provider;
        for (const row of result.results) {
          const why = reasonSummary(row.rejected);
          if (row.titles.length === 0) { missed.push(row.id); console.log(`  - ${row.id} 통과 제목 0건 (탈락 ${why})`); continue; }
          const card = batch.find((c) => c.id === row.id);
          made.push({ id: row.id, keyword: card ? card.keyword : '', category: card ? card.category : '', urls: card && Array.isArray(card.urls) ? card.urls : [], titles: row.titles, rejected: row.rejected.length, provider: result.provider, at: stamp, rules: TITLE_RULES });
          console.log(`  ✚ ${row.id} ${card ? card.keyword : ''} → ${row.titles.length}개 (탈락 ${why}, ${result.provider})`);
        }
      } catch (error) {
        console.log(`  !! 배치 실패(계속): ${String((error && error.message) || error).slice(0, 160)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, batches.length)) }, worker));
  if (skipped > 0) console.log(`  · 시간 상한(${Math.round(budgetMs / 60000)}분)으로 배치 ${skipped}개는 다음 회차로`);
  return { made, provider, asked: cards.length, missed };
}

async function generate(board, kept, misses, max, concurrency, budgetMs) {
  // ts-node 는 생성 단계에서만 필요하다 — 부착만 할 때는 없어도 돈다.
  require('ts-node/register/transpile-only');
  const { cardsFromBenchmarks, titlesForCards, BENCHMARK_TITLE_BATCH } = require('../src/utils/benchmark-title-engine');
  // 원문 주소 · 추천 · 우선순위는 판 카드에서 — 창고가 카드 id 가 바뀌어도 제목을 찾는 열쇠 · 고르는 순서
  const rows = new Map((board.candidates || []).map((c) => [c.id, c]));
  const withMeta = cardsFromBenchmarks(board).map((c) => {
    const row = rows.get(c.id) || {};
    return { ...c, urls: [...new Set((row.sources || []).map((src) => String((src && src.url) || '')).filter(Boolean))], recommended: row.recommended === true, priority: Number(row.priority) || 0 };
  });
  const cards = pickTitleTargets(openTitleCards(withMeta, kept, misses, Date.now()), kept, max);
  const outdated = cards.filter((c) => kept.some((e) => e.id === c.id)).length;
  console.log(`제목 대상 ${cards.length}장 (새 카드 ${cards.length - outdated} · 옛 규칙 다시 짓기 ${outdated} · 창고 유지 ${kept.length}장) · 배치 ${BENCHMARK_TITLE_BATCH} · 동시 ${concurrency}`);
  return generateTitles(cards, kept, { batchSize: BENCHMARK_TITLE_BATCH, concurrency, budgetMs, titlesFor: (batch) => titlesForCards(batch) });
}

async function main() {
  const boardPath = arg('board');
  const storePath = arg('store');
  const max = Number(arg('max')) || 8;
  // 동시 배치 수 · 시간 상한(분). 작업 전체 상한 30분 중 수집이 약 8분이라 제목은 12분까지.
  const concurrency = Math.max(1, Number(arg('concurrency')) || 4);
  const budgetMs = Math.max(0, Number(arg('budget-min')) || 12) * 60_000;
  if (!boardPath || !storePath) {
    console.error('--board=<homefeed-benchmarks.json> --store=<homefeed-benchmark-titles.json> 이 필요합니다.');
    process.exit(2);
  }
  const board = readJson(boardPath);
  if (!board || !Array.isArray(board.candidates)) throw new Error(`벤치마크 판을 읽지 못했습니다: ${boardPath}`);
  const store = readJson(storePath) || {};
  // --attach-only: 판 수집 작업 — 창고 제목을 판에 붙이기만(창고는 안 쓴다, 쓰는 쪽은 제목 작업 하나)
  // --store-only : 제목 작업 — 짓고 창고만 쓴다(판은 안 쓴다, 판 파일을 두 작업이 고치면 판 발행 rebase 충돌)
  const attachOnly = flag('attach-only');
  const storeOnly = flag('store-only');
  const nowMs = Date.now();
  const kept = attachOnly ? freshEntries(store) : pruneEntries(freshEntries(store), board, nowMs);
  const keptMisses = (Array.isArray(store.misses) ? store.misses : []).filter((m) => m && typeof m.id === 'string' && Date.parse(m.at) > nowMs - MISS_RETRY_MS);

  let made = [];
  let missed = [];
  let provider = '';
  let asked = 0;
  if (flag('no-ai') || attachOnly) console.log('AI 생성 건너뜀 · 창고 부착만 한다.');
  else {
    try { ({ made, provider, asked, missed } = await generate(board, kept, keptMisses, max, concurrency, budgetMs)); }
    catch (error) { console.log(`!! 생성 단계 실패(부착은 계속): ${String((error && error.message) || error).slice(0, 200)}`); }
  }

  const entries = mergeEntries(kept, made);
  if (!attachOnly) {
    const madeIds = new Set(made.map((e) => e.id));
    const misses = [...keptMisses.filter((m) => !madeIds.has(m.id) && !missed.includes(m.id)), ...missed.map((id) => ({ id, at: new Date(nowMs).toISOString() }))];
    atomicWrite(storePath, { generatedAt: new Date().toISOString(), provider: provider || store.provider || '', total: entries.length, entries, misses });
  }
  if (!storeOnly) atomicWrite(boardPath, attachTitles(board, entries));

  const attached = attachTitles(board, entries).candidates.filter((c) => c.homeTitles.length > 0).length;
  console.log(`\n제목 창고 ${entries.length}장 (새로 ${made.length}/${asked}장) → ${storePath}`);
  console.log(`판 부착: 카드 ${board.candidates.length}장 중 제목 있는 카드 ${attached}장`);
  if (asked > 0 && made.length === 0) console.log('::warning::이번 회차 새 제목 0건 — 구독 CLI 상태를 확인하세요. 판은 창고 제목으로 나갑니다.');
}

module.exports = { attachTitles, freshEntries, generateTitles, mergeEntries, pickTitleTargets, pruneEntries, openTitleCards, TITLE_RULES, TITLE_TTL_MS, GRACE_MS, MISS_RETRY_MS };

if (require.main === module) {
  main().catch((error) => { console.error('벤치마크 제목 창고 실패:', error); process.exit(1); });
}
