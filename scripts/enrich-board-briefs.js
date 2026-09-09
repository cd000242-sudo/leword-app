#!/usr/bin/env node
/**
 * 황금키워드 행마다 글감 브리프를 붙인다 — 사장님 2026-09-09 "황금키워드 TMI 가 오늘의 글감보다 약하다".
 *
 * 행의 실측 수치 + 그 키워드로 실측한 뉴스 카드 → 에이전트(클로드 CLI) → 검증기(근거 밖 날짜·숫자 탈락) → row.brief.
 * 행마다 저장(체크포인트)하므로 잘려도 붙은 만큼 남는다. 이미 brief 가 있는 행은 --maxAgeDays(기본 7) 안이면 건너뛴다.
 *
 *   node scripts/enrich-board-briefs.js --in=board.json --out=board.json [--maxAi=60] [--maxAgeDays=7]
 * 입력은 회차 원장(board.json)과 사이트 발행본(preemption-board.json) 둘 다 된다 — 둘 다 rows[] 에 같은 필드다.
 */
require('ts-node/register/transpile-only');
require('./load-project-env').loadProjectEnv();

const fs = require('fs');
const path = require('path');
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
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const AGENT_CHAIN = [
  { provider: 'claude', run: (p, o) => runClaude(p, { ...(o || {}), model: 'opus' }) },
  { provider: 'codex', run: runCodex },
];

async function main() {
  const inPath = path.resolve(arg('in', 'board.json'));
  const outPath = path.resolve(arg('out', inPath));
  const maxAi = Number(arg('maxAi')) || 60;
  const maxAgeMs = (Number(arg('maxAgeDays')) || 7) * 24 * 3600 * 1000;
  const today = kstToday();
  if (!fs.existsSync(inPath)) { console.error(`입력 없음: ${inPath}`); process.exit(2); }
  const board = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const rows = Array.isArray(board.rows) ? board.rows : [];

  const manager = typeof EnvironmentManager.getInstance === 'function' ? EnvironmentManager.getInstance() : new EnvironmentManager();
  const cfg = manager.getConfig();
  const openApi = { clientId: cfg.naverClientId || process.env.NAVER_CLIENT_ID || '', clientSecret: cfg.naverClientSecret || process.env.NAVER_CLIENT_SECRET || '' };

  const newsFacts = async (keyword, topic) => {
    if (!openApi.clientId) return [];
    const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(keyword)}&display=20&sort=date`;
    try {
      const res = await naverApiFetch(url, { headers: { 'X-Naver-Client-Id': openApi.clientId, 'X-Naver-Client-Secret': openApi.clientSecret } });
      if (!res.ok) return [];
      const data = await res.json().catch(() => null);
      const cards = toFactCards((data && data.items) || [], topic || '');
      // 키워드 브리프는 오래된 카드도 배경으로 쓴다 — 최신순 10장
      return cards.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 10);
    } catch { return []; }
  };

  const targets = rows.filter((r) => {
    if (!r || !r.keyword) return false;
    if (r.brief && r.brief.builtAt && Date.now() - new Date(r.brief.builtAt).getTime() < maxAgeMs) return false;
    return true;
  }).slice(0, maxAi);
  console.log(`글감 브리프 보강 — 행 ${rows.length} · 대상 ${targets.length} (상한 ${maxAi}) · 뉴스 카드 ${openApi.clientId ? '켬' : '끔(키 없음)'}`);

  let done = 0; let failed = 0; let newsCalls = 0;
  for (const row of targets) {
    const facts = await newsFacts(row.keyword, row.topic);
    newsCalls += 1;
    const prompt = buildKeywordBriefPrompt(row, facts, today);
    let reply = '';
    try {
      const run = await runWithAnyAgent(prompt, AGENT_CHAIN, { timeoutMs: 150_000 });
      reply = run.reply;
    } catch (error) {
      failed += 1;
      console.log(`  ✗ ${row.keyword} — 에이전트 실패 ${String((error && error.message) || error).slice(0, 60)}`);
      continue;
    }
    const { ok, reason } = validateKeywordBrief(tryExtractJson(reply), row, facts, today);
    if (!ok) { failed += 1; console.log(`  ✗ ${row.keyword} — ${reason}`); continue; }
    row.brief = ok;
    done += 1;
    console.log(`  ✓ ${row.keyword} [${ok.timing}] 카드 ${ok.facts.length} — ${ok.angle.slice(0, 50)}`);
    fs.writeFileSync(outPath, JSON.stringify(board, null, 1), 'utf8'); // 체크포인트
    await sleep(200);
  }
  fs.writeFileSync(outPath, JSON.stringify(board, null, 1), 'utf8');
  console.log(`끝 — 붙임 ${done} · 실패 ${failed} · 건너뜀 ${rows.length - targets.length} · 뉴스 ${newsCalls}콜 → ${outPath}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(`글감 브리프 보강 실패: ${error && error.stack ? error.stack : error}`);
  process.exit(1);
});
