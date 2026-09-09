#!/usr/bin/env node
/**
 * 제휴 황금키워드 — 자리 실측 + 글감 브리프 덧붙이기 (사장님 2026-09-09: "작성하면 노출될 확률이 높아야").
 *
 * 수집기(affiliate-refresh.js, 다른 에이전트 소관)가 낸 사이트 스냅샷을 **읽어서 덧붙이기만** 한다. 수집기 파일은 안 건드린다.
 *   상품마다 후보 검색어(니즈 검색어 → 상품명 검색어)의 블로그탭을 내 크로미엄으로 실제로 받아 자리(빈자리·정면 글)를 재고,
 *   자리가 열린 상품에는 실측 수치 + 그 검색어 뉴스 카드 안에서만 쓴 글감 브리프를 붙인다.
 *   item.seat = { keyword, openSlot, facing, verdict, measuredAt } · item.brief = keyword-brief
 *
 *   node scripts/affiliate-enrich.js --in=<site>/spa/public/data/affiliate-campaigns.json [--out=같은 파일] [--maxSeat=120] [--maxAi=30] [--noBrief]
 * 수집기가 스냅샷을 새로 내면 이 필드는 사라진다 — 그때 다시 돌린다(멱등: 같은 상품·같은 검색어면 같은 자리).
 */
require('ts-node/register/transpile-only');
require('./load-project-env').loadProjectEnv();

const fs = require('fs');
const path = require('path');
const { measureSeat, seatBlogTabUrl } = require('../src/utils/seat-measure');
const { localSerpFetch, closeLocalSerpFetch } = require('../src/utils/local-serp-fetch');
const { toFactCards, kstToday } = require('../src/utils/topic-briefs');
const { buildKeywordBriefPrompt, validateKeywordBrief } = require('../src/utils/keyword-brief');
const { naverApiFetch } = require('../src/utils/naver-api-hub');
const { EnvironmentManager } = require('../src/utils/environment-manager');
const { runClaude } = require('../src/utils/agent-cli/claudeRunner');
const { runCodex } = require('../src/utils/agent-cli/codexRunner');
const { runWithAnyAgent } = require('../src/utils/agent-cli/runAny');
const { tryExtractJson } = require('../src/utils/agent-cli/parse');

const arg = (name, fallback = '') => {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
const has = (name) => process.argv.includes(`--${name}`);
const AGENT_CHAIN = [
  { provider: 'claude', run: (p, o) => runClaude(p, { ...(o || {}), model: 'opus' }) },
  { provider: 'codex', run: runCodex },
];

/** 자리 판정 순위 — 열림이 제일 좋다. */
const VERDICT_RANK = { '열림': 0, '반열림': 1, '자료없음': 2, '잠김': 3, '카드답': 4 };

async function main() {
  const inPath = path.resolve(arg('in'));
  if (!arg('in') || !fs.existsSync(inPath)) { console.error('--in=<affiliate-campaigns.json> 이 필요합니다.'); process.exit(2); }
  const outPath = path.resolve(arg('out', inPath));
  const maxSeat = Number(arg('maxSeat')) || 120;
  const maxAi = Number(arg('maxAi')) || 30;
  const wantBrief = !has('noBrief');
  const today = kstToday();

  const snapshot = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const sites = snapshot.sites || {};
  const items = Object.values(sites).flatMap((s) => (s && Array.isArray(s.items) ? s.items : []));

  const manager = typeof EnvironmentManager.getInstance === 'function' ? EnvironmentManager.getInstance() : new EnvironmentManager();
  const cfg = manager.getConfig();
  const openApi = { clientId: cfg.naverClientId || process.env.NAVER_CLIENT_ID || '', clientSecret: cfg.naverClientSecret || process.env.NAVER_CLIENT_SECRET || '' };

  // 1) 자리 실측 — 후보 검색어(니즈 → 상품명)마다 블로그탭을 받아 잰다. 같은 검색어는 한 번만.
  const candidatesOf = (item) => [...new Set([item.needKeyword, item.keyword].map((k) => String(k || '').trim()).filter((k) => k.length >= 2))];
  const targets = items.filter((item) => candidatesOf(item).length > 0);
  console.log(`제휴 자리 실측 — 상품 ${items.length} · 검색어 있는 상품 ${targets.length} · 상한 ${maxSeat}`);
  const seatCache = new Map();
  let fetched = 0;
  const measureKeyword = async (keyword) => {
    if (seatCache.has(keyword)) return seatCache.get(keyword);
    if (fetched >= maxSeat) return null;
    fetched += 1;
    const res = await localSerpFetch(seatBlogTabUrl(keyword));
    if (!res.ok) { seatCache.set(keyword, null); return null; }
    const seat = measureSeat({ keyword, blogTabHtml: res.body, allTabHtml: null });
    const out = seat.sampled >= 3 ? { keyword, openSlot: seat.vacancy, facing: seat.facing, verdict: seat.verdict, sampled: seat.sampled, measuredAt: new Date().toISOString() } : null;
    seatCache.set(keyword, out);
    return out;
  };
  let seated = 0;
  for (const item of targets) {
    const measured = [];
    for (const k of candidatesOf(item)) { const s = await measureKeyword(k); if (s) measured.push(s); }
    if (measured.length === 0) continue;
    measured.sort((a, b) => (VERDICT_RANK[a.verdict] ?? 9) - (VERDICT_RANK[b.verdict] ?? 9) || (a.facing ?? 99) - (b.facing ?? 99));
    item.seat = measured[0];
    seated += 1;
  }
  await closeLocalSerpFetch();
  const byVerdict = targets.reduce((m, it) => { if (it.seat) m[it.seat.verdict] = (m[it.seat.verdict] || 0) + 1; return m; }, {});
  console.log(`  자리 실측 ${seated}/${targets.length} (블로그탭 ${fetched}회) · ${Object.entries(byVerdict).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2), 'utf8');

  // 2) 글감 브리프 — 자리가 열린(열림·반열림) 상품만, 실측 수치 + 뉴스 카드 안에서
  if (!wantBrief) { console.log('끝 — 브리프 생략(--noBrief)'); process.exit(0); }
  const newsFacts = async (keyword) => {
    if (!openApi.clientId) return [];
    const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(keyword)}&display=20&sort=date`;
    try {
      const res = await naverApiFetch(url, { headers: { 'X-Naver-Client-Id': openApi.clientId, 'X-Naver-Client-Secret': openApi.clientSecret } });
      if (!res.ok) return [];
      const data = await res.json().catch(() => null);
      return toFactCards((data && data.items) || [], '제휴').sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 10);
    } catch { return []; }
  };
  const briefTargets = targets.filter((it) => it.seat && (it.seat.verdict === '열림' || it.seat.verdict === '반열림') && !(it.brief && it.brief.builtAt && Date.now() - new Date(it.brief.builtAt).getTime() < 7 * 24 * 3600 * 1000)).slice(0, maxAi);
  console.log(`  브리프 대상 ${briefTargets.length} (자리 열림·반열림, 상한 ${maxAi})`);
  let done = 0; let failed = 0;
  for (const item of briefTargets) {
    const kw = item.seat.keyword;
    const isNeed = kw === item.needKeyword;
    const row = {
      keyword: kw,
      topic: '제휴',
      searchVolume: isNeed ? item.needVolume : item.searchVolume,
      documentCount: isNeed ? item.needDocs : item.documentCount,
      openSlot: item.seat.openSlot,
      serp: { exactTitleHits: item.seat.facing },
      evidence: [
        { code: 'product', text: `제휴 상품: ${item.name}${item.brand ? ` (${item.brand})` : ''}${item.price ? ` · 가격 ${item.price}` : ''}` },
        ...(item.reward ? [{ code: 'reward', text: `제휴 보상: ${item.reward}` }] : []),
        ...(typeof item.perSaleWon === 'number' && item.perSaleWon > 0 ? [{ code: 'per-sale', text: `건당 수익 약 ${item.perSaleWon.toLocaleString('ko-KR')}원(가격×수수료율 단순 산술)` }] : []),
      ],
    };
    const facts = await newsFacts(kw);
    const prompt = buildKeywordBriefPrompt(row, facts, today)
      + '\n\n이 글감은 제휴 상품 글이다: 글 안에서 위 제휴 상품을 자연스럽게 다루되, 검색하는 사람의 질문(비교·선택 기준·사용법)에 먼저 답하는 구조여야 한다. angle 에 그 연결을 한 문장으로 적어라.';
    let reply = '';
    try { reply = (await runWithAnyAgent(prompt, AGENT_CHAIN, { timeoutMs: 150_000 })).reply; } catch (error) { failed += 1; console.log(`  ✗ ${kw} — 에이전트 ${String((error && error.message) || error).slice(0, 60)}`); continue; }
    const { ok, reason } = validateKeywordBrief(tryExtractJson(reply), row, facts, today);
    if (!ok) { failed += 1; console.log(`  ✗ ${kw} — ${reason}`); continue; }
    item.brief = ok;
    done += 1;
    console.log(`  ✓ ${kw} [${ok.timing}] ${item.name.slice(0, 24)} — ${ok.angle.slice(0, 50)}`);
    fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2), 'utf8');
  }
  console.log(`끝 — 자리 ${seated} · 브리프 ${done} · 실패 ${failed} → ${outPath}`);
  process.exit(0);
}

main().catch((error) => { console.error(`제휴 보강 실패: ${error && error.stack ? error.stack : error}`); process.exit(1); });
