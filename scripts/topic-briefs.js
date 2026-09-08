#!/usr/bin/env node
/**
 * 오늘의 글감 브리프(NOW/NEXT/ALWAYS) — 사장님 예시 형식(2026-09-09).
 *
 * 흐름: 분야별 뉴스 질의(오픈 API, 무료) → 사실 카드(제목·요약·발행일·날짜) → 에이전트(클로드 CLI: 로컬 로그인 또는
 * CI OAuth)가 카드 **안에서만** 글감을 고름 → 검증기(카드 인용·날짜 근거·시기) → 핵심 검색어의 검색량 실측(검색광고)
 * → 자리 실측(--serp=local 이면 내 크로미엄, brightdata 면 BD, none 이면 미측정) → JSON.
 * 추정치는 없다: 검색량·정면 글 수는 실측이고, 적합성은 정면 글 수의 표기일 뿐이며, 안 쟀으면 '미측정'이다.
 *
 * 쓰기:
 *   node scripts/topic-briefs.js --out=topic-briefs.json --serp=local --perField=3
 */
require('ts-node/register/transpile-only');
require('./load-project-env').loadProjectEnv();

const fs = require('fs');
const path = require('path');
const {
  BRIEF_FIELDS, toFactCards, pickFactsForPrompt, buildBriefPrompt, validateBriefs, serpFitOf, markStars, kstToday, applyMeasuredVolumes,
} = require('../src/utils/topic-briefs');
const { naverApiFetch } = require('../src/utils/naver-api-hub');
const { EnvironmentManager } = require('../src/utils/environment-manager');
const { runClaude } = require('../src/utils/agent-cli/claudeRunner');
const { runCodex } = require('../src/utils/agent-cli/codexRunner');
const { runWithAnyAgent } = require('../src/utils/agent-cli/runAny');
const { tryExtractJson } = require('../src/utils/agent-cli/parse');
const { getNaverSearchAdKeywordVolume } = require('../src/utils/naver-searchad-api');

const arg = (name, fallback = '') => {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const AGENT_CHAIN = [
  { provider: 'claude', run: (p, o) => runClaude(p, { ...(o || {}), model: 'opus' }) },
  { provider: 'codex', run: runCodex },
];

async function main() {
  const outPath = path.resolve(arg('out', 'topic-briefs.json'));
  const perField = Number(arg('perField')) || 3;
  const serpMode = arg('serp', 'none'); // local | brightdata | none
  const maxSerp = Number(arg('maxSerp')) || 40;
  const today = kstToday(); // ISO 날짜 자리 = 한국 날짜

  const manager = typeof EnvironmentManager.getInstance === 'function' ? EnvironmentManager.getInstance() : new EnvironmentManager();
  const cfg = manager.getConfig();
  const openApi = { clientId: cfg.naverClientId || process.env.NAVER_CLIENT_ID || '', clientSecret: cfg.naverClientSecret || process.env.NAVER_CLIENT_SECRET || '' };
  if (!openApi.clientId) { console.error('네이버 오픈 API 키가 필요합니다(뉴스 실측).'); process.exit(2); }
  const adConfig = {
    accessLicense: cfg.naverSearchAdAccessLicense || process.env.NAVER_SEARCH_AD_ACCESS_LICENSE || '',
    secretKey: cfg.naverSearchAdSecretKey || process.env.NAVER_SEARCH_AD_SECRET_KEY || '',
    customerId: cfg.naverSearchAdCustomerId || process.env.NAVER_SEARCH_AD_CUSTOMER_ID || '',
  };

  console.log(`오늘의 글감 — ${today.toISOString().slice(0, 10)} · 분야 ${BRIEF_FIELDS.length} · 분야당 ${perField}개 · 자리 실측 ${serpMode}`);

  // 1) 사실 카드
  const newsItems = async (query) => {
    const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=50&sort=date`;
    try {
      const res = await naverApiFetch(url, { headers: { 'X-Naver-Client-Id': openApi.clientId, 'X-Naver-Client-Secret': openApi.clientSecret } });
      if (!res.ok) return [];
      const data = await res.json().catch(() => null);
      return (data && data.items) || [];
    } catch { return []; }
  };
  const fieldFacts = new Map();
  let newsCalls = 0;
  for (const { field, queries } of BRIEF_FIELDS) {
    const seen = new Set();
    const cards = [];
    for (const q of queries) {
      const items = await newsItems(q);
      newsCalls += 1;
      cards.push(...toFactCards(items, field, seen));
      await sleep(120);
    }
    const picked = pickFactsForPrompt(cards, today, 18);
    fieldFacts.set(field, picked);
    console.log(`  ${field.padEnd(14)} 기사 ${String(cards.length).padStart(3)} → 근거 카드 ${String(picked.length).padStart(2)}`);
  }

  // 2) 에이전트 — 카드 안에서만 글감
  const all = [];
  const droppedAll = [];
  let agentCalls = 0;
  for (const { field } of BRIEF_FIELDS) {
    const facts = fieldFacts.get(field) || [];
    if (facts.length < 2) { console.log(`  ${field}: 근거 카드 ${facts.length}개 — 건너뜀`); continue; }
    const prompt = buildBriefPrompt(field, facts, today, perField);
    let reply = '';
    let provider = '';
    try {
      const run = await runWithAnyAgent(prompt, AGENT_CHAIN, { timeoutMs: 150_000 });
      reply = run.reply; provider = run.provider; agentCalls += 1;
    } catch (error) {
      console.log(`  ${field}: 에이전트 실패 — ${String((error && error.message) || error).slice(0, 80)}`);
      continue;
    }
    const parsed = tryExtractJson(reply);
    const { ok, dropped } = validateBriefs(parsed, facts, field, today);
    all.push(...ok);
    droppedAll.push(...dropped.map((d) => ({ field, ...d })));
    console.log(`  ${field.padEnd(14)} ${provider} → 글감 ${ok.length} · 떨어짐 ${dropped.length}${dropped.length ? ` (${dropped.map((d) => d.reason).join(' / ')})` : ''}`);
  }

  // 3) 검색량 실측 — 후보 검색어 전부 재서 가장 큰 것을 핵심 검색어로(null = '< 10' 실측)
  let measuredBriefs = all;
  if (adConfig.accessLicense && adConfig.secretKey && all.length > 0) {
    const volumes = new Map();
    const wanted = [...new Set(all.flatMap((b) => b.keywords))];
    for (let i = 0; i < wanted.length; i += 5) {
      const chunk = wanted.slice(i, i + 5);
      try {
        const vols = await getNaverSearchAdKeywordVolume(adConfig, chunk);
        const byKey = new Map((vols || []).map((v) => [String(v.keyword || '').replace(/\s+/g, ''), v]));
        for (const k of chunk) {
          const v = byKey.get(k.replace(/\s+/g, ''));
          if (v) volumes.set(k.replace(/\s+/g, ''), typeof v.totalSearchVolume === 'number' ? v.totalSearchVolume : null);
        }
      } catch (error) {
        console.log(`  !! 검색량 실측 실패(계속) — ${String((error && error.message) || error).slice(0, 80)}`);
      }
      await sleep(300);
    }
    measuredBriefs = all.map((b) => applyMeasuredVolumes(b, volumes));
    console.log(`  검색량 실측  검색어 ${wanted.length}개 → 잰 것 ${volumes.size} · 10+ ${[...volumes.values()].filter((v) => v != null).length}`);
  } else if (all.length > 0) {
    console.log('  검색광고 키 없음 — 검색량은 null 로 둔다');
  }
  all.length = 0; all.push(...measuredBriefs);

  // 4) 자리 실측
  if (serpMode !== 'none' && all.length > 0) {
    const { measureSeat, seatBlogTabUrl } = require('../src/utils/seat-measure');
    let fetchPage = null;
    let close = async () => {};
    if (serpMode === 'local') {
      const { localSerpFetch, closeLocalSerpFetch } = require('../src/utils/local-serp-fetch');
      fetchPage = localSerpFetch; close = closeLocalSerpFetch;
    } else if (serpMode === 'brightdata') {
      // 기능 'briefs' 장부로 센다(선점 'golden' 과 분리). 상한은 워크플로의 FEATURE_CAPS(월 400). 사장님 승인 2026-09-09.
      const { brightDataFetch } = require('../src/utils/brightdata-client');
      fetchPage = (url) => brightDataFetch(url, 'briefs', { zone: process.env.BRIGHTDATA_ZONE || '77' });
    }
    let measured = 0;
    // 검색량 큰 순으로 상한까지 — 트래픽이 있는 글감부터 자리를 확인한다.
    const targets = [...all].sort((a, b) => (b.searchVolume || 0) - (a.searchVolume || 0)).slice(0, maxSerp);
    for (const b of targets) {
      const res = await fetchPage(seatBlogTabUrl(b.coreKeyword));
      if (!res.ok) continue;
      const seat = measureSeat({ keyword: b.coreKeyword, blogTabHtml: res.body, allTabHtml: null });
      if (seat.sampled >= 3) { b.serpFacing = seat.facing; b.serpVacancy = seat.vacancy; measured += 1; }
    }
    await close();
    console.log(`  자리 실측    ${targets.length}건 중 ${measured}건 (${serpMode})`);
  }
  for (const b of all) b.serpFit = serpFitOf(b.serpFacing, b.serpVacancy);
  const briefs = markStars(all);

  const order = { NOW: 0, NEXT: 1, ALWAYS: 2 };
  briefs.sort((a, b) => (order[a.timing] - order[b.timing]) || (Number(b.star) - Number(a.star)) || ((b.searchVolume || 0) - (a.searchVolume || 0)));
  const result = {
    builtAt: new Date().toISOString(),
    method: {
      facts: '네이버 뉴스 API 실측 기사(분야별 질의, 최신순). 카드에 없는 날짜·숫자는 검증기가 떨어뜨린다',
      timing: 'NOW=최근 5일 안 기사 · NEXT=기사에 미래 날짜 · ALWAYS=철 안 타는 제도(카드 근거 필수)',
      searchVolume: '검색광고 키워드도구 월간 검색량 실측(핵심 검색어) · 없으면 null',
      serpFit: `정면 글 수 실측(${serpMode}) — 높음 ≤2(또는 빈자리 ≤3) · 보통 ≤5 · 낮음 · 안 쟀으면 미측정. 높음은 상위노출 보장이 아니다`,
      star: '적합성 높음 + (검색량 500+ 또는 날짜 박힌 NOW/NEXT)',
    },
    counts: { briefs: briefs.length, now: briefs.filter((b) => b.timing === 'NOW').length, next: briefs.filter((b) => b.timing === 'NEXT').length, always: briefs.filter((b) => b.timing === 'ALWAYS').length, star: briefs.filter((b) => b.star).length, dropped: droppedAll.length, newsCalls, agentCalls },
    briefs,
    dropped: droppedAll.slice(0, 50),
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 1), 'utf8');
  console.log(`끝 — 글감 ${briefs.length} (NOW ${result.counts.now} · NEXT ${result.counts.next} · ALWAYS ${result.counts.always} · ★ ${result.counts.star}) · 떨어짐 ${droppedAll.length} · 뉴스 ${newsCalls}콜 · 에이전트 ${agentCalls}콜 → ${outPath}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(`오늘의 글감 실패: ${error && error.stack ? error.stack : error}`);
  process.exit(1);
});
