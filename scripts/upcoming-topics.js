#!/usr/bin/env node
/**
 * 미리 써 둘 소재 판 — site/spa/public/data/upcoming-topics.json
 *
 * 2026-10-11 사장님 "지금 홈판도 미리 쓰면 뜰 소재가 있으면 — 예: A매치 우루과이전에 처음 나온 김민수 선수 글이 그날만 43만 명".
 *
 *   1) 사건: 네이버 스포츠 경기 일정(국가대표 · K리그 · KBO · 배구 · 농구, 앞으로 7일) + 기사 속 예정(첫 방송 · 컴백 · 개봉 …)
 *   2) 사람: 사건 기사에서 '처음' 신호(첫 발탁 · 데뷔 · 복귀 …)가 붙은 이름 — AI(Sonnet)가 짚고, 기사 인용 검사로 거른다
 *   3) 실측: 검색량(워커) · 블로그 문서 수(오픈 API) · 자동완성 — 문서가 적을수록 먼저 쓰면 첫 글이 된다
 *   4) 제목: 문서가 적은 사람부터 상위 N명에 홈판 제목(제목 엔진, Opus)
 * 엔진(검사 · 카드)은 src/utils/upcoming/upcoming-core.ts. 화면엔 잰 사실만 — 추정 숫자 없음.
 *
 * 사용: node scripts/upcoming-topics.js --out=<upcoming-topics.json> [--days=7] [--max-events=40] [--concurrency=4] [--budget-min=20] [--titles=12]
 */
'use strict';

require('ts-node/register/transpile-only');
require('./load-project-env').loadProjectEnv();

const fs = require('fs');
const path = require('path');
const { sportsEvents, scheduleEventsFromNews, buildWatchPrompt, validateWatch, upcomingCards, SPORTS_LEAGUES, SCHEDULE_QUERIES } = require('../src/utils/upcoming/upcoming-core');
const { naverApiFetch } = require('../src/utils/naver-api-hub');
const { EnvironmentManager } = require('../src/utils/environment-manager');
const { getNaverBlogDocumentCount } = require('../src/utils/naver-blog-api');
const { createDefaultAgentChain } = require('../src/utils/agent-cli/defaultChain');
const { runWithAnyAgent } = require('../src/utils/agent-cli/runAny');
const { requireJsonArray } = require('../src/utils/agent-cli/replyValidators');
const { tryExtractJson } = require('../src/utils/agent-cli/parse');
const { suggestionsFor } = require('./enrich-benchmark-guides.js');
const { serialize } = require('./homefeed-benchmarks-core.cjs');

const arg = (name, fallback = '') => { const hit = process.argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const KST = 9 * 3_600_000;
const kstYmd = (ms) => new Date(ms + KST).toISOString().slice(0, 10);
const WORKER = 'https://leword-keyword-api.leword.workers.dev/';

function atomicWrite(file, value) {
  const resolved = path.resolve(file); fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const temp = `${resolved}.${process.pid}.tmp`;
  try { fs.writeFileSync(temp, serialize(value) + '\n', 'utf8'); fs.renameSync(temp, resolved); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}

async function fetchGames(nowMs, days) {
  const from = kstYmd(nowMs); const to = kstYmd(nowMs + days * 86_400_000);
  const games = [];
  for (const [categoryId, { upper }] of Object.entries(SPORTS_LEAGUES)) {
    const url = `https://api-gw.sports.naver.com/schedule/games?fields=basic&upperCategoryId=${upper}&categoryId=${categoryId}&fromDate=${from}&toDate=${to}&size=200`;
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://m.sports.naver.com/' }, signal: AbortSignal.timeout(15_000) });
      const data = await res.json();
      const list = data && data.result && Array.isArray(data.result.games) ? data.result.games : [];
      games.push(...list.filter((g) => g && g.categoryId === categoryId));
    } catch (error) { console.log(`  !! 경기 일정 ${categoryId}: ${String((error && error.message) || error).slice(0, 80)}`); }
  }
  return games;
}

function newsClient(cfg) {
  let calls = 0;
  const search = async (query, display = 20) => {
    calls += 1;
    const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=${display}&sort=date`;
    try {
      const res = await naverApiFetch(url, { headers: { 'X-Naver-Client-Id': cfg.naverClientId, 'X-Naver-Client-Secret': cfg.naverClientSecret } });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data && data.items) ? data.items : [];
    } catch { return []; }
  };
  return { search, calls: () => calls };
}

const plain = (s) => String(s || '').replace(/<\/?[a-z][^>]*>/gi, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const toArticle = (it) => ({ title: plain(it.title), description: plain(it.description), url: String(it.originallink || it.link || ''), publishedAt: Number.isFinite(Date.parse(it.pubDate)) ? new Date(Date.parse(it.pubDate)).toISOString() : '' });

/** 경기마다 관련 기사(두 팀 이름 · 국가대표는 명단 · 발탁 기사까지) — 최근 기사 8개. */
async function attachSportsArticles(events, news) {
  const squad = [...(await news.search('축구대표팀 명단', 30)), ...(await news.search('대표팀 첫 발탁', 30))].map(toArticle);
  const out = [];
  for (const e of events) {
    const [home, away] = e.title.split(' vs ');
    const items = (await news.search(`${home} ${away}`, 20)).map(toArticle);
    const pool = e.league === SPORTS_LEAGUES.amatch.label ? [...items, ...squad.filter((a) => a.title.includes(home) || a.title.includes(away) || /대표팀/.test(a.title))] : items;
    const seen = new Set();
    const articles = pool.filter((a) => a.title && a.url && !seen.has(a.url) && seen.add(a.url)).slice(0, 8);
    if (articles.length) out.push({ ...e, articles });
    await sleep(120);
  }
  return out;
}

async function findWatches(events, { batch, concurrency, budgetMs, model }) {
  const chain = createDefaultAgentChain({ claudeModel: model });
  const batches = [];
  for (let i = 0; i < events.length; i += batch) batches.push(events.slice(i, i + batch));
  const watchById = new Map();
  const started = Date.now();
  let next = 0; let ok = 0; let failed = 0;
  async function worker() {
    while (next < batches.length) {
      if (Date.now() - started >= budgetMs) { console.log(`  · 시간 상한으로 사건 배치 ${batches.length - next}개 건너뜀`); next = batches.length; return; }
      const group = batches[next++];
      try {
        const run = await runWithAnyAgent(buildWatchPrompt(group), chain, { timeoutMs: 180_000, validate: requireJsonArray() });
        const parsed = tryExtractJson(String(run.reply || ''));
        const rows = new Map((Array.isArray(parsed) ? parsed : []).map((r) => [String(r && r.id), r]));
        for (const e of group) watchById.set(e.id, validateWatch(e, rows.get(e.id)));
        ok += 1;
      } catch (error) {
        failed += 1;
        console.log(`  !! 사람 짚기 배치 실패(계속): ${String((error && error.message) || error).slice(0, 120)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, batches.length)) }, worker));
  return { watchById, ok, failed };
}

async function workerVolumes(keywords) {
  const got = {};
  const key = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();
  const ask = async (list, size) => {
    for (let i = 0; i < list.length; i += size) {
      try {
        const res = await fetch(WORKER, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'keyword-volumes', keywords: list.slice(i, i + size).join('\n') }), signal: AbortSignal.timeout(60_000) });
        const data = await res.json().catch(() => null);
        if (res.ok && data && data.ok && data.volumes) Object.assign(got, data.volumes);
      } catch { /* 못 잰 말은 null */ }
    }
  };
  await ask(keywords, 10);
  const have = new Set(Object.keys(got).map(key));
  await ask(keywords.filter((k) => !have.has(key(k))), 3);
  return got;
}

async function measure(names, cfg) {
  const documents = {}; const suggestions = {};
  for (const name of names) {
    try { const n = await getNaverBlogDocumentCount(name, { config: { clientId: cfg.naverClientId, clientSecret: cfg.naverClientSecret } }); if (Number.isFinite(n)) documents[name] = n; } catch { /* null */ }
    suggestions[name] = await suggestionsFor(name);
    await sleep(120);
  }
  return { volumes: await workerVolumes(names), documents, suggestions };
}

/** 문서가 적은 사람부터(같으면 검색량 큰 순) 상위 n명에 홈판 제목 20개. */
async function attachTitles(cards, n) {
  if (n <= 0) return { made: 0, cards };
  const { titlesForCards, BENCHMARK_TITLE_BATCH } = require('../src/utils/benchmark-title-engine');
  const targets = cards.flatMap((c) => c.watch.map((w) => ({ c, w })))
    .sort((a, b) => (a.w.documentCount ?? Infinity) - (b.w.documentCount ?? Infinity) || (b.w.searchVolume ?? 0) - (a.w.searchVolume ?? 0))
    .slice(0, n);
  const titles = new Map();
  for (let i = 0; i < targets.length; i += BENCHMARK_TITLE_BATCH) {
    const group = targets.slice(i, i + BENCHMARK_TITLE_BATCH);
    const input = group.map(({ c, w }) => ({ id: `${c.id}:${w.name}`, keyword: w.name, category: c.league || '', title: `${c.title} — ${w.signal}`, summary: w.quote, sourceTitles: c.articles.map((a) => a.title).slice(0, 6), relatedKeywords: w.suggestions.slice(0, 6) }));
    try {
      const out = await titlesForCards(input);
      for (const r of out.results) if (r.titles.length) titles.set(r.id, r.titles);
    } catch (error) { console.log(`  !! 제목 배치 실패(계속): ${String((error && error.message) || error).slice(0, 120)}`); }
  }
  return { made: titles.size, cards: cards.map((c) => ({ ...c, watch: c.watch.map((w) => (titles.has(`${c.id}:${w.name}`) ? { ...w, homeTitles: titles.get(`${c.id}:${w.name}`) } : w)) })) };
}

async function main() {
  const outPath = arg('out');
  if (!outPath) { console.error('--out=<upcoming-topics.json> 이 필요합니다.'); process.exit(2); }
  const days = Math.max(1, Number(arg('days')) || 7);
  const maxEvents = Math.max(1, Number(arg('max-events')) || 40);
  const nowMs = Date.now();
  const cfg = (typeof EnvironmentManager.getInstance === 'function' ? EnvironmentManager.getInstance() : new EnvironmentManager()).getConfig();
  if (!cfg.naverClientId || !cfg.naverClientSecret) { console.error('네이버 오픈 API 자격증명이 필요합니다(뉴스 · 문서 수).'); process.exit(2); }
  const news = newsClient(cfg);

  const sports = await attachSportsArticles(sportsEvents(await fetchGames(nowMs, days), nowMs, days), news);
  const scheduleItems = [];
  for (const q of SCHEDULE_QUERIES) { scheduleItems.push(...(await news.search(q, 50))); await sleep(120); }
  const schedule = scheduleEventsFromNews(scheduleItems, nowMs, days);
  const events = [...sports, ...schedule].slice(0, maxEvents);
  console.log(`사건 ${events.length}개 (경기 ${sports.length} · 기사 속 예정 ${schedule.length}) · 뉴스 호출 ${news.calls()}`);

  const { watchById, ok, failed } = await findWatches(events, { batch: Math.max(1, Number(arg('batch')) || 4), concurrency: Math.max(1, Number(arg('concurrency')) || 4), budgetMs: Math.max(1, Number(arg('budget-min')) || 20) * 60_000, model: arg('model', 'sonnet') });
  const names = [...new Set([...watchById.values()].flat().map((w) => w.name))];
  console.log(`사람 짚기 배치 성공 ${ok} · 실패 ${failed} → 주목할 사람 ${names.length}명`);
  if (ok === 0 && events.length > 0 && fs.existsSync(outPath)) { console.log('::warning::사람 짚기 전부 실패 — 지난 판을 그대로 둔다.'); return; }

  const metrics = await measure(names, cfg);
  const { made: titled, cards } = await attachTitles(upcomingCards(events, watchById, metrics), Math.max(0, Number(arg('titles') || 12)));
  atomicWrite(outPath, {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    windowDays: days,
    method: {
      events: '네이버 스포츠 경기 일정(국가대표 A매치 · K리그1 · KBO · V리그 · KBL) + 기사 속 예정(첫 방송 · 컴백 · 개봉 …, 기사 날짜 해석)',
      watch: "사건 기사에서 '처음' 신호(첫 발탁 · 데뷔 · 복귀 · 첫 방송 …)가 붙은 사람 — 기사 문장 인용이 그대로 있고 이름 · 신호 낱말이 인용 안에 있는 것만",
      metrics: '검색량 = 검색광고 월간 실측(워커) · 블로그 문서 수 = 네이버 오픈 API 실측 · 자동완성 = 네이버 검색창',
    },
    cards,
  });
  console.log(`카드 ${cards.length}개 · 사람 ${cards.reduce((n, c) => n + c.watch.length, 0)}명 · 제목 붙은 사람 ${titled}명 → ${outPath}`);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((error) => { console.error('미리 써 둘 소재 실패:', error); process.exit(1); });
}
