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
  roundSlotOf, roundCounts, todaysRounds, excludeListOf, dropRepeats, carrySeats, pickAltCandidates, pickRelatedKeywords, chooseAlternative,
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
  const perField = Number(arg('perField')) || 5; // 사장님 2026-09-09: 주제마다 5개 이상
  const serpMode = arg('serp', 'none'); // local | brightdata | none
  const maxSerp = Number(arg('maxSerp')) || 40;
  const today = kstToday(); // ISO 날짜 자리 = 한국 날짜
  const slot = roundSlotOf(today);
  // --carry: 사이트에 실린 직전 파일. 오늘(KST) 앞 회차를 남기고 이번 회차를 덧붙인다(아침·오후·저녁).
  const carryPath = arg('carry') ? path.resolve(arg('carry')) : '';
  let carried = null;
  try { carried = carryPath && fs.existsSync(carryPath) ? JSON.parse(fs.readFileSync(carryPath, 'utf8')) : null; } catch { carried = null; }
  const priorRounds = todaysRounds(carried && Array.isArray(carried.rounds) ? carried.rounds : [], today);

  /*
   * --skipIfSlotDone: 이 회차가 오늘 이미 실렸으면 아무것도 하지 않고 나간다.
   *
   * 왜(사장님 2026-09-10 "오늘의 글감도 또 안바껴"): 깃허브 예약이 늦거나 아예 빠진다.
   * 실측 — 09-09 09:23 예약이 13:47 에 돌았고(4.4시간), 21:23·03:23 예약은 돌지 않았다.
   * 늦으면 회차 이름까지 밀린다(아침 예약이 11시 넘어 돌면 '오후'로 기록된다).
   * 그래서 회차마다 예약을 여러 번 걸고, 먼저 도는 하나만 일하고 나머지는 여기서 곧장 나간다.
   * 비용이 드는 단계(뉴스·에이전트·검색광고·자리 실측) 앞이라 헛돈이 안 나간다.
   */
  if (arg('skipIfSlotDone') === 'true' && priorRounds.some((r) => r.slot === slot)) {
    const done = priorRounds.find((r) => r.slot === slot);
    console.log(`${slot} 회차는 오늘 이미 실렸다(${done.builtAt} · 글감 ${done.briefs.length}). 아무것도 하지 않고 나간다.`);
    process.exit(0);
  }

  const manager = typeof EnvironmentManager.getInstance === 'function' ? EnvironmentManager.getInstance() : new EnvironmentManager();
  const cfg = manager.getConfig();
  const openApi = { clientId: cfg.naverClientId || process.env.NAVER_CLIENT_ID || '', clientSecret: cfg.naverClientSecret || process.env.NAVER_CLIENT_SECRET || '' };
  if (!openApi.clientId) { console.error('네이버 오픈 API 키가 필요합니다(뉴스 실측).'); process.exit(2); }
  const adConfig = {
    accessLicense: cfg.naverSearchAdAccessLicense || process.env.NAVER_SEARCH_AD_ACCESS_LICENSE || '',
    secretKey: cfg.naverSearchAdSecretKey || process.env.NAVER_SEARCH_AD_SECRET_KEY || '',
    customerId: cfg.naverSearchAdCustomerId || process.env.NAVER_SEARCH_AD_CUSTOMER_ID || '',
  };

  console.log(`오늘의 글감 — ${today.toISOString().slice(0, 10)} ${slot} 회차 · 분야 ${BRIEF_FIELDS.length} · 분야당 ${perField}개+ · 자리 실측 ${serpMode} · 앞 회차 ${priorRounds.length}(${priorRounds.map((r) => r.slot).join('·') || '없음'})`);

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
    const picked = pickFactsForPrompt(cards, today, 24);
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
    // 5개 이상을 받기 위해 한 개 더 청한다 — 검증기에서 한둘 떨어져도 5가 남게.
    const prompt = buildBriefPrompt(field, facts, today, perField + 1, excludeListOf(priorRounds, field));
    let reply = '';
    let provider = '';
    try {
      const run = await runWithAnyAgent(prompt, AGENT_CHAIN, { timeoutMs: 240_000 });
      reply = run.reply; provider = run.provider; agentCalls += 1;
    } catch (error) {
      console.log(`  ${field}: 에이전트 실패 — ${String((error && error.message) || error).slice(0, 80)}`);
      continue;
    }
    const parsed = tryExtractJson(reply);
    const { ok, dropped } = validateBriefs(parsed, facts, field, today);
    const { kept, repeated } = dropRepeats(ok, priorRounds);
    all.push(...kept);
    droppedAll.push(...dropped.map((d) => ({ field, ...d })), ...repeated.map((b) => ({ field, title: b.title, reason: '앞 회차와 같은 검색어' })));
    console.log(`  ${field.padEnd(14)} ${provider} → 글감 ${kept.length} · 떨어짐 ${dropped.length + repeated.length}${dropped.length + repeated.length ? ` (${[...dropped.map((d) => d.reason), ...repeated.map(() => '앞 회차 중복')].join(' / ')})` : ''}`);
  }

  // 3) 검색량 실측 — 후보 검색어 전부 재서 가장 큰 것을 핵심 검색어로(null = '< 10' 실측)
  let measuredBriefs = all;
  const volumes = new Map(); // 공백 걷은 검색어 → 월 검색량(null = '< 10'). 5) 대안 검색어 후보에도 쓴다.
  if (adConfig.accessLicense && adConfig.secretKey && all.length > 0) {
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
  all.length = 0; all.push(...carrySeats(measuredBriefs, priorRounds)); // 앞 회차가 잰 자리는 그대로(BD 절약)

  // 4) 자리 실측 — 아직 안 잰 것만, 검색량 큰 순으로 상한까지
  if (serpMode !== 'none' && all.some((b) => b.serpFacing == null)) {
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
    const targets = all.filter((b) => b.serpFacing == null).sort((a, b) => (b.searchVolume || 0) - (a.searchVolume || 0)).slice(0, maxSerp);
    for (const b of targets) {
      const res = await fetchPage(seatBlogTabUrl(b.coreKeyword));
      if (!res.ok) continue;
      const seat = measureSeat({ keyword: b.coreKeyword, blogTabHtml: res.body, allTabHtml: null });
      if (seat.sampled >= 3) { b.serpFacing = seat.facing; b.serpVacancy = seat.vacancy; measured += 1; }
    }
    console.log(`  자리 실측    ${targets.length}건 중 ${measured}건 (${serpMode})`);
    for (const b of all) b.serpFit = serpFitOf(b.serpFacing, b.serpVacancy);

    /*
     * 5) 대안 검색어 — 핵심 검색어가 '낮음/보통'인 글감(사장님 2026-09-09 "적합성이 낮으면 그 글을 쓰면 별로 안 좋은 거 아니야").
     * 같은 주제의 더 좁은 검색어(브리프 후보 + 검색광고 연관어)를 검색량 순 3개까지 재서 열린 것을 붙인다.
     * 앞 회차가 이미 붙인 글감은 건너뛴다. 상한 --maxAltSerp(기본 70) — 회차 전체 SERP 는 80 + 70.
     */
    const maxAltSerp = Number(arg('maxAltSerp')) || 70;
    if (adConfig.accessLicense && adConfig.secretKey && maxAltSerp > 0) {
      const { getNaverSearchAdKeywordSuggestions } = require('../src/utils/naver-searchad-api');
      /*
       * 연관어는 **모든 글감**에 대해 한 번씩 부른다(사장님 2026-09-10 "확장키워드나 연관키워드도
       * 같이 보여주면 그걸로 글 쓸 수 있게"). 예전에는 적합성이 낮은 것만 불렀는데, 같이 넣을 말은
       * 자리가 열린 글감에도 필요하다 — 그 글을 실제로 쓸 때 본문에 담을 말이기 때문이다.
       * 호출은 글감당 1회 그대로이고, 그 한 번의 응답을 '같이 넣을 말'과 '대안 검색어'가 나눠 쓴다.
       */
      const ordered = [...all].sort((a, b) => (b.searchVolume || 0) - (a.searchVolume || 0));
      const needAltSet = new Set(all.filter((b) => (b.serpFit === '낮음' || b.serpFit === '보통') && b.alternative === undefined));
      let altFetched = 0; let altFound = 0; let altTried = 0; let relFound = 0;
      for (const b of ordered) {
        let suggestions = [];
        try { suggestions = await getNaverSearchAdKeywordSuggestions(adConfig, b.coreKeyword, 60); } catch { suggestions = []; }
        await sleep(300);
        b.related = pickRelatedKeywords(b, suggestions, volumes, 6);
        if (b.related.length > 0) relFound += 1;

        if (!needAltSet.has(b) || altFetched >= maxAltSerp) continue;
        const candidates = pickAltCandidates(b, suggestions, volumes, 3);
        if (candidates.length === 0) { b.alternative = null; continue; }
        altTried += 1;
        const measuredAlts = [];
        for (const c of candidates) {
          if (altFetched >= maxAltSerp) break;
          altFetched += 1;
          const res = await fetchPage(seatBlogTabUrl(c.keyword));
          if (!res.ok) continue;
          const seat = measureSeat({ keyword: c.keyword, blogTabHtml: res.body, allTabHtml: null });
          if (seat.sampled < 3) continue;
          measuredAlts.push({ keyword: c.keyword, searchVolume: c.searchVolume, serpFacing: seat.facing, serpVacancy: seat.vacancy, serpFit: serpFitOf(seat.facing, seat.vacancy) });
          if (measuredAlts[measuredAlts.length - 1].serpFit === '높음') break; // 열린 것을 찾았으면 더 안 잰다
        }
        b.alternative = chooseAlternative(measuredAlts);
        if (b.alternative && b.alternative.serpFit === '높음') altFound += 1;
      }
      console.log(`  같이 넣을 말  ${relFound}/${ordered.length} 글감에 연관어를 붙였다`);
      console.log(`  대안 검색어  대상 ${needAltSet.size} · 후보 있음 ${altTried} · 자리 실측 ${altFetched}회 · 열린 대안 ${altFound}`);
    }
    await close();
  }
  for (const b of all) b.serpFit = serpFitOf(b.serpFacing, b.serpVacancy);
  const briefs = markStars(all);

  const order = { NOW: 0, NEXT: 1, ALWAYS: 2 };
  briefs.sort((a, b) => (order[a.timing] - order[b.timing]) || (Number(b.star) - Number(a.star)) || ((b.searchVolume || 0) - (a.searchVolume || 0)));
  const builtAt = new Date().toISOString();
  const thisRound = { slot, builtAt, counts: roundCounts(briefs), briefs };
  // 같은 회차 이름이 오늘 이미 있으면(수동 재실행) 그 자리를 갈아끼운다.
  const rounds = [...priorRounds.filter((r) => r.slot !== slot), thisRound];
  const result = {
    builtAt,
    slot,
    // 오늘의 회차들(아침·오후·저녁) — 화면은 이걸 회차 탭으로 그린다. briefs 는 이번 회차(호환용).
    rounds,
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
  const perFieldCounts = BRIEF_FIELDS.map(({ field }) => `${field.split('·')[0]} ${briefs.filter((b) => b.field === field).length}`).join(' · ');
  console.log(`  분야별: ${perFieldCounts}`);
  console.log(`끝 — ${slot} 회차 글감 ${briefs.length} (NOW ${result.counts.now} · NEXT ${result.counts.next} · ALWAYS ${result.counts.always} · ★ ${result.counts.star}) · 오늘 누적 ${rounds.reduce((s, r) => s + r.briefs.length, 0)}(${rounds.map((r) => r.slot).join('·')}) · 떨어짐 ${droppedAll.length} · 뉴스 ${newsCalls}콜 · 에이전트 ${agentCalls}콜 → ${outPath}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(`오늘의 글감 실패: ${error && error.stack ? error.stack : error}`);
  process.exit(1);
});
