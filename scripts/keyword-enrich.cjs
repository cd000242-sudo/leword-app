#!/usr/bin/env node
/**
 * 검색어 덧붙이기 — 시즌별 키워드 · 오늘의 글감(2026-10-20 사장님 "시즌키워드도 오늘의 글감도 마찬가지").
 *
 * 애드센스 벤치마크에 넣은 것을 두 판에도 준다. 두 판의 원래 생산(사이트 build-seasonal-keywords · 앱 topic-briefs)은 건드리지 않고,
 * 대표 검색어마다 덧붙일 것을 **자기 파일(keyword-enrich.json)에만** 쌓는다 — 사이트가 검색어로 찾아 붙인다.
 *   demand        데이터랩 주별 실측 판정 · 26주 선(src/utils/demand-now.ts, 5개 묶음) — 3일 기억(추이 모름은 하루)
 *   measure       월 검색량 · 블로그 문서수(시즌 검색어만 — 글감은 이미 실측이 있다) — 워커 서버 키로, 7일 기억
 *   kinQuestions  지식인에서 실제로 묻는 질문 3개(링크 · 조회수) — 워커 kin-search
 *   solves · actionTitles  이 글이 해결할 문제 · 행동 키워드 제목 — 구독 AI(Sonnet, 작성 안내 'keyword' 모드), 7일 기억
 * 판에서 사라지고 7일 지난 검색어는 정리한다. 못 잰 것은 비워 둔다(지어내지 않음).
 *
 * 사용: node scripts/keyword-enrich.cjs [--issue=<issue-niche-board.json>] --seasonal=<seasonal-keywords.json> --briefs=<topic-briefs.json> --store=<keyword-enrich.json>
 *        [--trend-max=300] [--measure-max=120] [--guide-max=150] [--concurrency=4] [--budget-min=35] [--no-ai]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DAY_MS = 24 * 60 * 60 * 1000;
const TREND_TTL_MS = 3 * DAY_MS;
const UNKNOWN_TTL_MS = DAY_MS;
// 데이터랩에 기록이 없던 검색어(새 말 · 긴 조각)는 이틀 기억 — 안 그러면 회차마다 같은 빈 검색어가 줄 맨 앞을 차지한다(2026-10-22 실측 0/200).
const MISS_TTL_MS = 2 * DAY_MS;
const MEASURE_TTL_MS = 7 * DAY_MS;
const GUIDE_TTL_MS = 7 * DAY_MS;
const KEEP_MS = 7 * DAY_MS;
const WORKER = 'https://leword-keyword-api.leword.workers.dev/';

const clean = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const age = (iso, nowMs) => { const t = Date.parse(String(iso || '')); return Number.isFinite(t) ? nowMs - t : Infinity; };
const arg = (name, fallback = '') => { const f = process.argv.find((a) => a.startsWith(`--${name}=`)); return f ? f.slice(name.length + 3) : fallback; };
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };

/**
 * 홈판 카드의 검색어 — 카드 keyword 는 기사 제목 조각이라 데이터랩에 기록이 없다(2026-10-22 실측).
 * 작성 안내의 노릴 검색어(네이버 자동완성) 첫 번째만 쓴다 — 안내는 카드 id, 없으면 원문 주소로 짝짓는다(회차마다 id 가 바뀐다).
 * 연관 키워드는 'A2O' · '날짜도' 같은 낱말 조각이라 쓰지 않는다(실측). 없으면 ''(재지 않음 — 지어내지 않음).
 * 사이트(HomefeedBenchmarkCard)는 안내가 합쳐진 card.searchTargets[0] 으로 같은 검색어를 찾는다.
 */
function homefeedQuery(card, targetsByKey) {
  const keys = [card && card.id, ...((card && Array.isArray(card.sources)) ? card.sources.map((s) => s && s.url) : [])].filter(Boolean);
  const found = keys.map((k) => targetsByKey && targetsByKey.get(k)).find((t) => Array.isArray(t) && t.length);
  const targets = found || (Array.isArray(card && card.searchTargets) ? card.searchTargets : []);
  return clean(targets[0] || '', 60);
}

/** 판 → 검색어 항목. 같은 검색어는 하나로 모으고 어느 판에서 왔는지(kinds) 남긴다. */
function collectItems(sources, { homefeedGuides = null } = {}) {
  const targetsById = new Map();
  for (const g of (homefeedGuides && Array.isArray(homefeedGuides.guides) ? homefeedGuides.guides : [])) {
    if (!g || !g.guide || !Array.isArray(g.guide.searchTargets) || !g.guide.searchTargets.length) continue;
    for (const key of [g.id, ...(Array.isArray(g.urls) ? g.urls : [])]) if (typeof key === 'string' && key && !targetsById.has(key)) targetsById.set(key, g.guide.searchTargets);
  }
  const byQuery = new Map();
  const add = (kind, row) => {
    const query = clean(row.query, 60);
    if (!query) return;
    const prev = byQuery.get(query);
    if (prev) { if (!prev.kinds.includes(kind)) prev.kinds.push(kind); return; }
    byQuery.set(query, { ...row, query, kinds: [kind] });
  };
  for (const [kind, json] of sources) {
    if (!json) continue;
    if (kind === 'seasonal') {
      for (const t of Array.isArray(json.topics) ? json.topics : []) {
        add('seasonal', { query: t.keyword, title: clean(t.angle, 200), category: clean(t.category, 40), suggestions: (t.suggestions || []).map((s) => clean(s, 80)).filter(Boolean).slice(0, 10), sourceTitles: [] });
      }
    }
    if (kind === 'issue' || kind === 'golden') {
      // 실검 틈새 판(2026-10-20 "실시간검색어 틈새키워드도 마찬가지로") · 리더남 황금키워드(선점 보드, 2026-10-21 "황금키워드에도 마찬가지")
      // — 행 + (틈새) 관찰 행. 이유 문장 · 하위 키워드가 재료. 측정은 판에 이미 있다.
      for (const r of [...(Array.isArray(json.rows) ? json.rows : []), ...(Array.isArray(json.observations) ? json.observations : [])]) {
        add(kind, {
          query: r.keyword, title: clean((r.whySearch && r.whySearch.text) || r.issue, 200), category: clean(r.topic, 40),
          suggestions: (Array.isArray(r.subKeywords) ? r.subKeywords : []).map((k) => clean(typeof k === 'string' ? k : k && k.keyword, 80)).filter(Boolean).slice(0, 10),
          sourceTitles: [],
        });
      }
    }
    if (kind === 'homefeed') {
      // 리더남 홈판 추천(2026-10-22 "그래프가 안 나오네요") — 그래프만. 작성 안내 · 제목은 홈판 판에 이미 있다(noGuide).
      // 카드가 하루 수백 장이라 데이터랩 한도를 지키려고 추천 · 지금 검토 카드만, 최대 300개.
      const cards = (Array.isArray(json.candidates) ? json.candidates : [])
        .filter((c) => c && (c.recommended === true || c.status === 'review-now'))
        .slice(0, 300);
      for (const c of cards) add('homefeed', { query: homefeedQuery(c, targetsById), title: clean(c.title, 200), category: clean(c.category, 40), suggestions: [], sourceTitles: [], noGuide: true });
    }
    if (kind === 'briefs') {
      const all = [...(Array.isArray(json.briefs) ? json.briefs : []), ...(Array.isArray(json.rounds) ? json.rounds.flatMap((r) => (Array.isArray(r && r.briefs) ? r.briefs : [])) : [])];
      for (const b of all) {
        add('briefs', {
          query: b.coreKeyword, title: clean(b.title, 200), category: clean(b.field, 40),
          suggestions: (Array.isArray(b.keywords) ? b.keywords : []).map((s) => clean(typeof s === 'string' ? s : s && s.keyword, 80)).filter(Boolean).slice(0, 10),
          sourceTitles: (Array.isArray(b.facts) ? b.facts : []).map((f) => clean(f && f.title, 160)).filter(Boolean).slice(0, 4),
        });
      }
    }
  }
  return [...byQuery.values()];
}

/** 이번 회차에 잴 것 — 각 상한까지, 판 순서대로. */
function planEnrich(items, store, nowMs, { trendMax, measureMax, guideMax, rules }) {
  const entries = (store && store.entries) || {};
  const trend = []; const measure = []; const guide = [];
  for (const item of items) {
    const e = entries[item.query] || {};
    const trendTtl = e.demand && e.demand.verdict === 'unknown' ? UNKNOWN_TTL_MS : TREND_TTL_MS;
    const missed = age(e.demandMissAt, nowMs) < MISS_TTL_MS;
    if (!(e.demand && age(e.demandAt, nowMs) < trendTtl) && !missed && trend.length < trendMax) trend.push(item.query);
    if (item.kinds.includes('seasonal') && !(e.measure && age(e.measureAt, nowMs) < MEASURE_TTL_MS) && measure.length < measureMax) measure.push(item.query);
    if (!item.noGuide && !(e.rules === rules && age(e.guideAt, nowMs) < GUIDE_TTL_MS) && guide.length < guideMax) guide.push(item);
  }
  return { trend, measure, guide };
}

/** 판에서 사라지고 7일 지난 검색어는 버린다(새 객체). */
function pruneEntries(store, liveQueries, nowMs) {
  const entries = {};
  for (const [q, e] of Object.entries((store && store.entries) || {})) {
    const latest = Math.min(...['demandAt', 'demandMissAt', 'measureAt', 'guideAt'].map((k) => age(e && e[k], nowMs)));
    if (liveQueries.has(q) || latest < KEEP_MS) entries[q] = e;
  }
  return { ...(store || {}), entries };
}

/** 한 검색어에 새 칸을 덧붙인다(새 객체 — 원래 칸은 그대로). */
function patchEntry(store, query, patch) {
  const entries = (store && store.entries) || {};
  return { ...store, entries: { ...entries, [query]: { ...(entries[query] || {}), ...patch } } };
}

async function worker(body, serverKey) {
  const res = await fetch(WORKER, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(serverKey ? { 'x-leword-server': serverKey } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(90_000) });
  return res.json();
}

async function main() {
  const storePath = arg('store');
  if (!storePath) throw new Error('--store=<keyword-enrich.json> 이 필요합니다.');
  // 틈새를 먼저 — 실시간 키워드라 판정이 가장 빨리 낡는다
  const sources = [['issue', arg('issue') ? readJson(arg('issue')) : null], ['golden', arg('golden') ? readJson(arg('golden')) : null], ['seasonal', arg('seasonal') ? readJson(arg('seasonal')) : null], ['briefs', arg('briefs') ? readJson(arg('briefs')) : null], ['homefeed', arg('homefeed') ? readJson(arg('homefeed')) : null]];
  const items = collectItems(sources, { homefeedGuides: arg('homefeed-guides') ? readJson(arg('homefeed-guides')) : null });
  const nowMs = Date.now();
  const at = new Date(nowMs).toISOString();
  const todayKst = new Date(nowMs + 9 * 3600000).toISOString().slice(0, 10);
  require('ts-node/register/transpile-only');
  const { fetchWeeklyDemandBatch, readDemandNow } = require('../src/utils/demand-now');
  const { guidesForCards, GUIDE_BATCH, GUIDE_MODEL } = require('../src/utils/homefeed/writing-guide');
  const rules = 'keyword-2026-10-20';
  let store = pruneEntries(readJson(storePath) || { schemaVersion: 1, entries: {} }, new Set(items.map((i) => i.query)), nowMs);
  const plan = planEnrich(items, store, nowMs, {
    trendMax: Number(arg('trend-max', '300')), measureMax: Number(arg('measure-max', '120')),
    guideMax: process.argv.includes('--no-ai') ? 0 : Number(arg('guide-max', '150')), rules,
  });
  console.log(`검색어 ${items.length}개 · 이번 회차 그래프 ${plan.trend.length} · 측정 ${plan.measure.length} · 안내 ${plan.guide.length}`);

  // 1) 그래프 — 데이터랩 5개 묶음
  const datalab = { clientId: process.env.NAVER_CLIENT_ID || '', clientSecret: process.env.NAVER_CLIENT_SECRET || '' };
  let judged = 0;
  for (let i = 0; i < plan.trend.length; i += 5) {
    const chunk = plan.trend.slice(i, i + 5);
    const series = await fetchWeeklyDemandBatch(chunk, datalab);
    for (const q of chunk) {
      const points = series.get(q) || [];
      if (points.length) { store = patchEntry(store, q, { demand: readDemandNow(points, todayKst), demandAt: at, demandMissAt: null }); judged += 1; }
      else if (series.size > 0) store = patchEntry(store, q, { demandMissAt: at }); // 같은 묶음의 다른 말은 받았다 = 이 말은 기록이 없다(호출 실패와 구분)
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  // 2) 시즌 검색어 측정 — 워커(서버 키) 검색량 · 문서수
  const serverKey = process.env.LEWORD_WORKER_SERVER_KEY || '';
  let measured = 0;
  const compact = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();
  for (let i = 0; i < plan.measure.length; i += 10) {
    const chunk = plan.measure.slice(i, i + 10);
    try {
      const [vol, docs] = await Promise.all([worker({ action: 'keyword-volumes', keywords: chunk.join('\n') }, serverKey), worker({ action: 'keyword-docs', keywords: chunk.join('\n') }, serverKey)]);
      const volumes = new Map(Object.entries((vol && vol.volumes) || {}).map(([k, v]) => [compact(k), v]));
      for (const q of chunk) {
        const searchVolume = volumes.get(compact(q));
        const documentCount = docs && docs.docs ? docs.docs[q] : undefined;
        if (Number.isFinite(searchVolume) || Number.isFinite(documentCount)) {
          store = patchEntry(store, q, { measure: { searchVolume: Number.isFinite(searchVolume) ? searchVolume : null, documentCount: Number.isFinite(documentCount) ? documentCount : null }, measureAt: at });
          measured += 1;
        }
      }
    } catch (error) { console.log(`  !! 측정 실패(다음 회차에): ${String((error && error.message) || error).slice(0, 100)}`); }
  }

  // 3) 지식인 질문 + 해결할 문제 · 행동 제목 — 구독 AI, 시간 상한
  const { kinQuestionsFor, suggestionsFor } = require('./enrich-benchmark-guides.js');
  const budgetMs = Number(arg('budget-min', '35')) * 60_000;
  const concurrency = Math.max(1, Number(arg('concurrency', '4')));
  const started = Date.now();
  const batches = [];
  for (let i = 0; i < plan.guide.length; i += GUIDE_BATCH) batches.push(plan.guide.slice(i, i + GUIDE_BATCH));
  let next = 0; let guided = 0; let skipped = 0;
  const run = async () => {
    while (next < batches.length) {
      if (Date.now() - started > budgetMs) { skipped = batches.length - next; next = batches.length; return; }
      const batch = batches[next++];
      try {
        const cards = await Promise.all(batch.map(async (it, j) => {
          const kin = await kinQuestionsFor(it.query);
          const suggestions = it.suggestions.length ? it.suggestions : await suggestionsFor(it.query);
          return { id: `k${j}`, keyword: it.query, category: it.category, title: it.title || it.query, summary: '', sourceTitles: it.sourceTitles, relatedKeywords: [], searchSuggestions: suggestions, kinQuestions: kin.kinQuestions || [], query: it.query, kinStore: kin.kinStore || [] };
        }));
        const result = await guidesForCards(cards.map(({ query, kinStore, ...c }) => c), undefined, 'keyword');
        for (const card of cards) {
          const guide = (result.results.find((r) => r.id === card.id) || {}).guide || {};
          store = patchEntry(store, card.query, { kinQuestions: card.kinStore, solves: guide.solves || [], actionTitles: guide.actionTitles || [], guideAt: at, rules });
          if (guide.solves || guide.actionTitles) guided += 1;
        }
      } catch (error) { console.log(`  !! 안내 배치 실패(다음 회차에): ${String((error && error.message) || error).slice(0, 120)}`); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, batches.length)) }, run));

  fs.mkdirSync(path.dirname(path.resolve(storePath)), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), rules, model: GUIDE_MODEL, entries: store.entries }) + '\n', 'utf8');
  console.log(`그래프 ${judged}/${plan.trend.length} · 측정 ${measured}/${plan.measure.length} · 안내 ${guided}/${plan.guide.length}${skipped ? ` · 시간 상한으로 배치 ${skipped}개는 다음 회차로` : ''} → 검색어 ${Object.keys(store.entries).length}개`);
}

if (require.main === module) {
  main().catch((error) => { console.error('검색어 덧붙이기 실패:', error); process.exit(1); });
}

module.exports = { collectItems, planEnrich, pruneEntries, patchEntry, homefeedQuery };
