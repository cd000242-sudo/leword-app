#!/usr/bin/env node
/**
 * 홈판 벤치마크 작성 안내 창고 — 판의 카드마다 "이렇게 쓰세요 · 노릴 검색어 · 반드시 · 넣지 말 것 · 작성 전 확인"을 구독 AI 로 짓는다.
 *
 * 2026-10-10 사장님 "이렇게 쓰세요가 하드코딩 — 뻔한 소리" → AI 안내(src/utils/homefeed/writing-guide.ts),
 * 이어서 "전부 다 붙이고 싶다 — 12장만이 아니라, 확인하는 사람이 있거든".
 *
 * ## 판 수집과 따로 돈다
 *
 * 회차마다 새 카드가 228~501장(실측 2026-10-09~10, 원문 주소가 겹쳐 옮겨 쓸 수 있는 건 약 30%)이라
 * 판 수집 작업(30분 상한) 안에서는 다 못 짓는다. 그래서 수집이 끝날 때마다 이 작업이 이어서 돌고(homefeed-guides.yml),
 * 결과는 **자기 파일(homefeed-benchmark-guides.json)에만** 쓴다 — 판 파일을 두 작업이 같이 고치면 판 발행이 충돌로 멈춘다.
 * 사이트가 판과 합친다(카드 id → 없으면 원문 주소, spa/src/lib/homefeedGuides.mjs).
 *
 * ## 창고 규칙
 *
 * - 지금 판 카드와 맞는(id 또는 원문 주소) 안내 + 24시간 안에 지은 안내만 남긴다(파일이 끝없이 커지지 않게).
 * - 거르개를 통과 못 한 카드는 12시간 동안 다시 묻지 않는다(같은 재료면 같은 답).
 * - 배치가 터진 카드(시간 초과 등)는 기록하지 않는다 — 다음 회차에 다시 묻는다.
 *
 * 사용:
 *   node scripts/enrich-benchmark-guides.js --board=<homefeed-benchmarks.json> --store=<homefeed-benchmark-guides.json>
 *     [--max=1000] [--concurrency=6] [--budget-min=40] [--no-ai]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { serialize } = require('./homefeed-benchmarks-core.cjs');

const GRACE_MS = 24 * 60 * 60 * 1000;
const MISS_RETRY_MS = 12 * 60 * 60 * 1000;

function arg(name, fallback = '') {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}
function flag(name) { return process.argv.includes(`--${name}`); }
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
function atomicWrite(file, value) {
  const resolved = path.resolve(file); fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const temp = `${resolved}.${process.pid}.tmp`;
  try { fs.writeFileSync(temp, serialize(value) + '\n', 'utf8'); fs.renameSync(temp, resolved); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}

const clean = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const iso = (ms) => new Date(ms).toISOString();
const timeOf = (v) => { const t = Date.parse(String(v || '')); return Number.isFinite(t) ? t : NaN; };
const byPriority = (a, b) => Number(Boolean(b.recommended)) - Number(Boolean(a.recommended)) || (b.priority || 0) - (a.priority || 0);

/** 판에서 안내를 지을 카드 — 낡은(stale) · 협찬 소재는 뺀다. 원문 주소(urls)는 창고가 카드 id 가 바뀌어도 안내를 찾는 열쇠다. */
function cardsForGuides(board) {
  const candidates = board && Array.isArray(board.candidates) ? board.candidates : [];
  const out = [];
  for (const row of candidates) {
    const id = clean(row && row.id, 120);
    const keyword = clean(row && row.keyword, 80);
    const flags = Array.isArray(row && row.flags) ? row.flags.map(String) : [];
    if (!id || !keyword || row.status === 'stale' || flags.includes('sponsored')) continue;
    const sources = Array.isArray(row.sources) ? row.sources : [];
    out.push({
      id, keyword,
      category: clean(row.category, 40),
      title: clean(row.title, 200),
      summary: clean(row.summary, 400),
      sourceTitles: [...new Set(sources.map((s) => clean(s && s.title, 200)).filter(Boolean))].slice(0, 6),
      relatedKeywords: (Array.isArray(row.relatedKeywords) ? row.relatedKeywords : []).map((x) => clean(x, 120)).filter(Boolean).slice(0, 8),
      recommended: row.recommended === true,
      priority: Number(row.priority) || 0,
      urls: [...new Set(sources.map((s) => String((s && s.url) || '')).filter(Boolean))],
    });
  }
  return out;
}

const validGuide = (g) => g && typeof g.id === 'string' && g.guide && typeof g.guide.direction === 'string' && g.guide.direction && Number.isFinite(timeOf(g.at));

/** 지금 판 카드와 맞거나(id · 원문 주소) 24시간 안에 지은 안내만, 통과 못 한 기록은 12시간 안의 것만 남긴다. */
function pruneStore(store, board, nowMs) {
  const candidates = board && Array.isArray(board.candidates) ? board.candidates : [];
  const ids = new Set(candidates.map((c) => c && c.id).filter(Boolean));
  const urls = new Set(candidates.flatMap((c) => (Array.isArray(c && c.sources) ? c.sources : []).map((s) => s && s.url).filter(Boolean)));
  const guides = (Array.isArray(store && store.guides) ? store.guides : []).filter(validGuide)
    .filter((g) => ids.has(g.id) || (Array.isArray(g.urls) && g.urls.some((u) => urls.has(u))) || timeOf(g.at) > nowMs - GRACE_MS);
  const misses = (Array.isArray(store && store.misses) ? store.misses : [])
    .filter((m) => m && typeof m.id === 'string' && timeOf(m.at) > nowMs - MISS_RETRY_MS);
  return { guides, misses };
}

/** 이번 회차에 지을 카드 — 안내가 없는 카드(추천 → 우선순위) 먼저, 옛 규칙으로 지은 카드는 그다음. 최근 통과 못 한 카드는 건너뛴다. 최대 max. */
function pickGuideTargets(cards, store, rules, max) {
  const current = store.guides.filter((g) => g.rules === rules);
  const coveredBy = (list) => {
    const ids = new Set(list.map((g) => g.id));
    const urls = new Set(list.flatMap((g) => (Array.isArray(g.urls) ? g.urls : [])));
    return (c) => ids.has(c.id) || c.urls.some((u) => urls.has(u));
  };
  const isCurrent = coveredBy(current);
  const isAny = coveredBy(store.guides);
  const missed = new Set(store.misses.map((m) => m.id));
  const open = cards.filter((c) => !missed.has(c.id) && !isCurrent(c));
  const missing = open.filter((c) => !isAny(c)).sort(byPriority);
  const outdated = open.filter((c) => isAny(c)).sort(byPriority);
  return [...missing, ...outdated].slice(0, max);
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

/**
 * 카드를 배치로 나눠 동시에 짓는다. 자동완성은 배치마다 그 자리에서 붙인다(1,000장을 미리 다 받으면 그것만 몇 분).
 * 시간 상한이 지나면 새 배치를 시작하지 않는다. 배치가 터지면(시간 초과 등) 그 카드는 기록 없이 다음 회차로.
 */
async function generateGuides(cards, { batchSize, concurrency, budgetMs, guidesFor, suggest = suggestionsFor, now = Date.now, rules, log = () => {} }) {
  const startedAt = now();
  const stamp = iso(startedAt);
  const batches = [];
  for (let i = 0; i < cards.length; i += batchSize) batches.push(cards.slice(i, i + batchSize));
  const made = []; const missed = [];
  let provider = ''; let next = 0; let skipped = 0;
  async function worker() {
    while (next < batches.length) {
      if (now() - startedAt >= budgetMs) { skipped = batches.length - next; next = batches.length; return; }
      const batch = batches[next++];
      try {
        const withSuggestions = await Promise.all(batch.map(async (c) => ({ ...c, searchSuggestions: await suggest(c.keyword) })));
        const result = await guidesFor(withSuggestions);
        provider = result.provider || provider;
        for (const row of result.results) {
          const c = batch.find((x) => x.id === row.id);
          if (c) made.push({ id: c.id, urls: c.urls, guide: row.guide, at: stamp, rules, provider: result.provider });
        }
        for (const c of batch) if (!result.results.some((r) => r.id === c.id)) missed.push(c.id);
      } catch (error) {
        log(`  !! 안내 배치 실패(다음 회차에 다시): ${String((error && error.message) || error).slice(0, 160)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, batches.length)) }, worker));
  const order = new Map(cards.map((c, i) => [c.id, i]));
  made.sort((a, b) => order.get(a.id) - order.get(b.id));
  missed.sort((a, b) => order.get(a) - order.get(b));
  return { made, missed, provider, skipped };
}

/** 새 안내가 같은 id 의 옛 안내를 대체하고, 새로 지어진 카드의 '통과 못 함' 기록은 지운다. */
function mergeStore(store, { made, missed }, nowMs) {
  const madeIds = new Set(made.map((g) => g.id));
  const missedIds = new Set(missed);
  return {
    guides: [...store.guides.filter((g) => !madeIds.has(g.id)), ...made],
    misses: [...store.misses.filter((m) => !madeIds.has(m.id) && !missedIds.has(m.id)), ...missed.map((id) => ({ id, at: iso(nowMs) }))],
  };
}

/** 카드 중 안내가 있는(id 또는 원문 주소로 찾히는) 카드 수. */
function coverage(cards, store) {
  const ids = new Set(store.guides.map((g) => g.id));
  const urls = new Set(store.guides.flatMap((g) => (Array.isArray(g.urls) ? g.urls : [])));
  return { covered: cards.filter((c) => ids.has(c.id) || c.urls.some((u) => urls.has(u))).length, total: cards.length };
}

async function main() {
  const boardPath = arg('board');
  const storePath = arg('store');
  if (!boardPath || !storePath) {
    console.error('--board=<homefeed-benchmarks.json> --store=<homefeed-benchmark-guides.json> 이 필요합니다.');
    process.exit(2);
  }
  const board = readJson(boardPath);
  if (!board || !Array.isArray(board.candidates)) throw new Error(`벤치마크 판을 읽지 못했습니다: ${boardPath}`);
  const nowMs = Date.now();
  let store = pruneStore(readJson(storePath) || {}, board, nowMs);
  const cards = cardsForGuides(board);
  let rules = ''; let model = '';
  if (flag('no-ai')) console.log('AI 생성 건너뜀(--no-ai) · 창고 정리만 한다.');
  else {
    require('ts-node/register/transpile-only');
    const { guidesForCards, GUIDE_BATCH, GUIDE_RULES, GUIDE_MODEL } = require('../src/utils/homefeed/writing-guide');
    rules = GUIDE_RULES; model = GUIDE_MODEL;
    const max = Math.max(0, Number(arg('max')) || 1000);
    const concurrency = Math.max(1, Number(arg('concurrency')) || 6);
    const budgetMs = Math.max(0, Number(arg('budget-min')) || 40) * 60_000;
    const targets = pickGuideTargets(cards, store, GUIDE_RULES, max);
    console.log(`안내 대상 ${targets.length}장 (판 카드 ${cards.length} · 창고 ${store.guides.length} · 통과 못 함 대기 ${store.misses.length}) · ${GUIDE_MODEL} · 배치 ${GUIDE_BATCH} · 동시 ${concurrency}`);
    const result = await generateGuides(targets, { batchSize: GUIDE_BATCH, concurrency, budgetMs, guidesFor: (batch) => guidesForCards(batch), rules: GUIDE_RULES, log: console.log });
    store = mergeStore(store, result, nowMs);
    console.log(`새 안내 ${result.made.length}장 · 통과 못 함 ${result.missed.length}장${result.skipped ? ` · 시간 상한으로 배치 ${result.skipped}개는 다음 회차로` : ''}`);
    if (targets.length > 0 && result.made.length === 0) console.log('::warning::이번 회차 새 안내 0건 — 구독 CLI 상태를 확인하세요.');
  }
  const { covered, total } = coverage(cards, store);
  atomicWrite(storePath, { schemaVersion: 1, generatedAt: iso(Date.now()), rules: rules || (readJson(storePath) || {}).rules || '', model, guides: store.guides, misses: store.misses });
  console.log(`판 카드 ${total}장 중 안내 ${covered}장 → ${storePath}`);
}

module.exports = { cardsForGuides, pruneStore, pickGuideTargets, generateGuides, mergeStore, coverage, suggestionsFor, MISS_RETRY_MS, GRACE_MS };

if (require.main === module) {
  main().catch((error) => { console.error('작성 안내 창고 실패:', error); process.exit(1); });
}
