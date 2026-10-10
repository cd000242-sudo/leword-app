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

/** 판의 카드마다 창고 제목을 `homeTitles` 로 얹는다. 없으면 빈 목록 — 화면이 "준비 중" 을 그린다. */
function attachTitles(board, entries) {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const candidates = (board && Array.isArray(board.candidates) ? board.candidates : []).map((card) => {
    const hit = byId.get(card.id);
    return { ...card, homeTitles: hit ? [...hit.titles] : [], ...(hit ? { homeTitlesAt: hit.at } : {}) };
  });
  return { ...board, candidates };
}

/*
 * 작성 안내(2026-10-10 사장님 "이렇게 쓰세요 · 반드시 · 넣지 말 것이 하드코딩 — 면밀하게 분석해서 트래픽을 가져올 올바른 방향").
 * 수집기는 이제 안내를 찍지 않는다. 여기서 구독 AI 가 카드 재료(제목 · 요약 · 채널들이 쓴 제목 · 네이버 자동완성)로 짓고
 * (src/utils/homefeed/writing-guide.ts), 창고(guides, 7일)에 쌓아 판에 붙인다. 안내가 없는 카드는 빈칸 — 뻔한 말로 채우지 않는다.
 */
const GUIDE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function freshGuides(store, nowMs = Date.now()) {
  const list = Array.isArray(store && store.guides) ? store.guides : [];
  return list.filter((g) => g && typeof g.id === 'string' && g.guide && typeof g.guide.direction === 'string'
    && Number.isFinite(Date.parse(String(g.at || ''))) && Date.parse(g.at) > nowMs - GUIDE_TTL_MS);
}

/** 이번 회차에 안내를 지을 카드 — 지금 규칙으로 지은 게 없는 카드 중 추천 먼저, 그다음 우선순위 순. 최대 max. */
function pickGuideTargets(cards, kept, rules, max) {
  const done = new Set(kept.filter((g) => g.rules === rules).map((g) => g.id));
  return cards.filter((c) => !done.has(c.id))
    .sort((a, b) => Number(Boolean(b.recommended)) - Number(Boolean(a.recommended)) || (b.priority || 0) - (a.priority || 0))
    .slice(0, max);
}

/** 판의 카드마다 안내를 붙인다. 없으면 빈칸. 작성 전 확인은 안내의 확인 항목 + 수집기가 단 그 카드 경고(협찬 · 민감 의혹). */
function attachGuides(board, guides) {
  const byId = new Map(guides.map((g) => [g.id, g.guide]));
  const candidates = (board && Array.isArray(board.candidates) ? board.candidates : []).map((card) => {
    const g = byId.get(card.id);
    const warnings = Array.isArray(card.verificationNeeded) ? card.verificationNeeded : [];
    if (!g) return { ...card, writingDirection: '', searchTargets: [], mustInclude: [], mustAvoid: [], verificationNeeded: warnings };
    return {
      ...card,
      writingDirection: g.direction,
      searchTargets: [...(g.searchTargets || [])],
      mustInclude: [...(g.mustInclude || [])],
      mustAvoid: [...(g.mustAvoid || [])],
      verificationNeeded: [...new Set([...(g.checkBefore || []), ...warnings])],
    };
  });
  return { ...board, candidates };
}

/** 네이버 검색창 자동완성(무료 · 쿼터 없음) — 사람들이 이 소재로 실제로 검색하는 말. */
async function naverAutocomplete(query) {
  const url = `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(query)}&con=1&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&run=2&rev=4&q_enc=UTF-8&st=100`;
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://www.naver.com/' }, signal: AbortSignal.timeout(8000) });
  const data = await res.json();
  return (data && Array.isArray(data.items) && Array.isArray(data.items[0]) ? data.items[0] : []).map((x) => (Array.isArray(x) ? x[0] : x)).filter((x) => typeof x === 'string');
}

/** 검색어 통째 → 앞 3어절 → 앞 2어절로 자동완성을 모은다(긴 검색어는 자동완성이 비어서). 10개까지 · 검색어 자신 · 같은 말 제외. */
async function suggestionsFor(keyword, fetchAc = naverAutocomplete) {
  const words = String(keyword || '').trim().split(/\s+/).filter(Boolean);
  const queries = [...new Set([words.join(' '), words.slice(0, 3).join(' '), words.slice(0, 2).join(' ')].filter(Boolean))];
  const key = (s) => String(s).replace(/\s+/g, '');
  const seen = new Set([key(keyword)]);
  const out = [];
  for (const q of queries) {
    let got = [];
    try { got = await fetchAc(q); } catch { got = []; }
    for (const s of got) { if (out.length >= 10) break; const k = key(s); if (!k || seen.has(k)) continue; seen.add(k); out.push(s); }
    if (out.length >= 10) break;
  }
  return out;
}

async function generateGuides(board, kept, max, concurrency, budgetMs, now = Date.now) {
  require('ts-node/register/transpile-only');
  const { guideCardsFromBoard, guidesForCards, GUIDE_BATCH, GUIDE_RULES } = require('../src/utils/homefeed/writing-guide');
  const targets = pickGuideTargets(guideCardsFromBoard(board), kept, GUIDE_RULES, max);
  console.log(`작성 안내 대상 ${targets.length}장 (창고 유지 ${kept.length}장) · 배치 ${GUIDE_BATCH} · 동시 ${concurrency}`);
  const startedAt = now();
  const stamp = new Date(startedAt).toISOString();
  const cards = [];
  for (const c of targets) cards.push({ ...c, searchSuggestions: await suggestionsFor(c.keyword) });
  const batches = [];
  for (let i = 0; i < cards.length; i += GUIDE_BATCH) batches.push(cards.slice(i, i + GUIDE_BATCH));
  const made = [];
  let next = 0;
  async function worker() {
    while (next < batches.length) {
      if (now() - startedAt >= budgetMs) { console.log(`  · 시간 상한으로 안내 배치 ${batches.length - next}개는 다음 회차로`); next = batches.length; return; }
      const batch = batches[next++];
      try {
        const result = await guidesForCards(batch);
        for (const row of result.results) {
          made.push({ id: row.id, guide: row.guide, at: stamp, rules: GUIDE_RULES, provider: result.provider });
          const card = batch.find((c) => c.id === row.id);
          console.log(`  ✎ ${row.id} ${card ? card.keyword : ''} → 반드시 ${row.guide.mustInclude.length} · 노릴 검색어 ${row.guide.searchTargets.length}`);
        }
        const missing = batch.filter((c) => !result.results.some((r) => r.id === c.id));
        for (const c of missing) console.log(`  - ${c.id} ${c.keyword} 안내 통과 못 함(뻔한 말 · 재료 없음)`);
      } catch (error) {
        console.log(`  !! 안내 배치 실패(계속): ${String((error && error.message) || error).slice(0, 160)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, batches.length)) }, worker));
  return made;
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
          if (row.titles.length === 0) { console.log(`  - ${row.id} 통과 제목 0건 (탈락 ${why})`); continue; }
          const card = batch.find((c) => c.id === row.id);
          made.push({ id: row.id, keyword: card ? card.keyword : '', category: card ? card.category : '', titles: row.titles, rejected: row.rejected.length, provider: result.provider, at: stamp, rules: TITLE_RULES });
          console.log(`  ✚ ${row.id} ${card ? card.keyword : ''} → ${row.titles.length}개 (탈락 ${why}, ${result.provider})`);
        }
      } catch (error) {
        console.log(`  !! 배치 실패(계속): ${String((error && error.message) || error).slice(0, 160)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, batches.length)) }, worker));
  if (skipped > 0) console.log(`  · 시간 상한(${Math.round(budgetMs / 60000)}분)으로 배치 ${skipped}개는 다음 회차로`);
  return { made, provider, asked: cards.length };
}

async function generate(board, kept, max, concurrency, budgetMs) {
  // ts-node 는 생성 단계에서만 필요하다 — 부착만 할 때는 없어도 돈다.
  require('ts-node/register/transpile-only');
  const { cardsFromBenchmarks, titlesForCards, BENCHMARK_TITLE_BATCH } = require('../src/utils/benchmark-title-engine');
  const cards = pickTitleTargets(cardsFromBenchmarks(board), kept, max);
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
  const kept = freshEntries(readJson(storePath));

  let made = [];
  let provider = '';
  let asked = 0;
  if (flag('no-ai')) console.log('AI 생성 건너뜀(--no-ai) · 창고 부착만 한다.');
  else {
    try { ({ made, provider, asked } = await generate(board, kept, max, concurrency, budgetMs)); }
    catch (error) { console.log(`!! 생성 단계 실패(부착은 계속): ${String((error && error.message) || error).slice(0, 200)}`); }
  }

  const entries = mergeEntries(kept, made);
  // 작성 안내 — 제목과 따로 시간 상한(제목이 실패해도 · 안내가 실패해도 판은 나간다)
  const keptGuides = freshGuides(readJson(storePath));
  let madeGuides = [];
  if (!flag('no-ai')) {
    const guideMax = Math.max(0, Number(arg('guide-max')) || 12);
    const guideBudgetMs = Math.max(0, Number(arg('guide-budget-min')) || 5) * 60_000;
    try { madeGuides = await generateGuides(board, keptGuides, guideMax, concurrency, guideBudgetMs); }
    catch (error) { console.log(`!! 작성 안내 단계 실패(부착은 계속): ${String((error && error.message) || error).slice(0, 200)}`); }
  }
  const guides = mergeEntries(keptGuides, madeGuides);
  const previousProvider = (readJson(storePath) || {}).provider || '';
  atomicWrite(storePath, { generatedAt: new Date().toISOString(), provider: provider || previousProvider, total: entries.length, entries, guides });
  atomicWrite(boardPath, attachGuides(attachTitles(board, entries), guides));
  console.log(`작성 안내 창고 ${guides.length}장 (새로 ${madeGuides.length}장)`);

  const attached = board.candidates.filter((c) => entries.some((e) => e.id === c.id)).length;
  console.log(`\n제목 창고 ${entries.length}장 (새로 ${made.length}/${asked}장) → ${storePath}`);
  console.log(`판 부착: 카드 ${board.candidates.length}장 중 제목 있는 카드 ${attached}장`);
  if (asked > 0 && made.length === 0) console.log('::warning::이번 회차 새 제목 0건 — 구독 CLI 상태를 확인하세요. 판은 창고 제목으로 나갑니다.');
}

module.exports = { attachTitles, freshEntries, generateTitles, mergeEntries, pickTitleTargets, TITLE_RULES, TITLE_TTL_MS, attachGuides, freshGuides, pickGuideTargets, suggestionsFor, GUIDE_TTL_MS };

if (require.main === module) {
  main().catch((error) => { console.error('벤치마크 제목 창고 실패:', error); process.exit(1); });
}
