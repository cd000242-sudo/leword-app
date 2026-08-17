#!/usr/bin/env node
/**
 * 회차 후 보강 — 에이전트(클로드코드 구독)가 보드 전 행에 두뇌로 개입한다.
 *
 * 첫 수동 회차(2026-08-17) 실측이 이 스크립트의 존재 이유다:
 *   - 문제해결 서브 0/24행 — 같은 회차 형제 실측만으론 문제형 파생이 안 나온다.
 *   - 제목 24행 전부 generic("핵심 정리") — 파생 프레임 근거가 없어서다.
 *
 * 행마다: 클로드가 문제해결형 파생을 제안 → **실존 결재**(검색광고 검색량>0,
 * 아니면 자동완성 프로브 echo)를 통과한 것만 서브로 합류 → 그 파생을 근거로
 * 제목을 다시 조립한다. 이때 SERP 상위 10개 제목(보드에 이미 실측돼 있음)을
 * 프레임 분석에 넣으므로 "1페이지에 없는 각도"가 실제로 작동한다.
 *
 * 실행 환경: 로컬(사장님 PC — claude CLI 로그인) 또는 CI(agent-worker.yml —
 * CLAUDE_CODE_OAUTH_TOKEN). 검색광고·오픈API 자격증명은 env/config 에서 읽는다.
 *
 * 사용:
 *   node scripts/enrich-board.js --in=board.json --out=board-enriched.json [--maxAi=30]
 */
'use strict';

require('ts-node/register/transpile-only');
require('./load-project-env').loadProjectEnv();

const fs = require('fs');
const { EnvironmentManager } = require('../src/utils/environment-manager');
const { getNaverSearchAdKeywordVolume } = require('../src/utils/naver-searchad-api');
const { probeNaverAutocompleteSuggestions } = require('../src/utils/naver-autocomplete');
const { pickProblemSubKeywords } = require('../src/utils/title-forge/subkeyword-forge');
const { sharesToken } = require('../src/utils/title-forge/board-titles');
const { forgeTitles } = require('../src/utils/title-forge/forge');
const { runClaude } = require('../src/utils/agent-cli/claudeRunner');
const { runCodex } = require('../src/utils/agent-cli/codexRunner');
const { runGemini } = require('../src/utils/agent-cli/geminiRunner');
const { runWithAnyAgent } = require('../src/utils/agent-cli/runAny');
const { tryExtractJson } = require('../src/utils/agent-cli/parse');

/*
 * 구독 CLI 는 하나만 믿지 않는다. 2026-08-18 회차는 클로드 로그인이 끊겨
 * 30회가 전부 죽었는데, 코덱스 구독은 멀쩡히 살아 있었다 — 데스크톱 경로는
 * 원래 세 개를 차례로 시도하는데 이 스크립트만 클로드 하나였다.
 */
const AGENT_CHAIN = [
  { provider: 'claude', run: runClaude },
  { provider: 'codex', run: runCodex },
  { provider: 'gemini', run: runGemini },
];

function arg(name, fallback = '') {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}

const AI_TIMEOUT_MS = 60_000;
const AI_PROPOSAL_CAP = 5;

/** 마지막으로 답한 구독 CLI. 어느 배선이 이 결과를 만들었는지 행에 남긴다. */
let lastProvider = '';

function buildSearchAdConfig() {
  const env = EnvironmentManager.getInstance().getConfig();
  const accessLicense = env.naverSearchAdAccessLicense || '';
  const secretKey = env.naverSearchAdSecretKey || '';
  if (!accessLicense || !secretKey) return null;
  const customerId = (env.naverSearchAdCustomerId || '').trim()
    || accessLicense.split(':')[0] || accessLicense.substring(0, 10);
  return { accessLicense, secretKey, customerId };
}

async function measureVolumes(searchAd, keywords) {
  const volumes = new Map();
  if (!searchAd || keywords.length === 0) return volumes;
  try {
    for (let i = 0; i < keywords.length; i += 5) {
      const rows = await getNaverSearchAdKeywordVolume(searchAd, keywords.slice(i, i + 5));
      for (const row of rows) {
        const total = Number(row.pcSearchVolume || 0) + Number(row.mobileSearchVolume || 0);
        if (total > 0) volumes.set(String(row.keyword).replace(/\s+/g, ''), total);
      }
    }
  } catch (error) {
    console.log(`  !! 검색량 실측 실패(프로브로 계속): ${String(error && error.message || error).slice(0, 80)}`);
  }
  return volumes;
}

/** 클로드에 문제해결형 파생 제안을 받는다 — 반환은 미검증 후보다. */
async function proposeSubKeywords(mainKeyword) {
  const prompt = [
    '너는 네이버 검색어 데이터 전문가다.',
    `검색 키워드 "${mainKeyword}" 에 대해, 사람들이 실제로 네이버 검색창에 치는 **문제해결형 파생 검색어** ${AI_PROPOSAL_CAP}개를 제안하라.`,
    '',
    '지켜라:',
    `- "${mainKeyword}" 의 핵심 명사를 포함`,
    '- 검색창에 치는 짧은 명사구 형태: 2~4어절, 공백 제외 15자 이내. 질문 문장·조사 금지',
    '- 문제/실수/원인/해결/안됨/비교 각도만 (추천·후기·일반 정보형 금지)',
    '- 예시 형태: "여권사진 안경", "여권사진 반려 사유" (이 키워드가 아니라 형태만 참고)',
    '- JSON 문자열 배열로만 출력: ["검색어1", "검색어2", ...]',
  ].join('\n');
  const run = await runWithAnyAgent(prompt, AGENT_CHAIN, { timeoutMs: AI_TIMEOUT_MS });
  lastProvider = run.provider;
  const parsed = tryExtractJson(run.reply);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length >= 4 && item.replace(/\s+/g, '').length <= 15 && item !== mainKeyword)
    .filter((item) => sharesToken(item, mainKeyword))
    .slice(0, AI_PROPOSAL_CAP);
}

/** 실존 결재 2단: 검색량>0 이 강한 증거, "<10" 롱테일은 자동완성 프로브. */
async function verifyProposals(searchAd, proposals) {
  const volumes = await measureVolumes(searchAd, proposals);
  const verified = [];
  for (const keyword of proposals) {
    const volume = volumes.get(keyword.replace(/\s+/g, '')) || 0;
    if (volume > 0) {
      verified.push({ keyword, searchVolume: volume, source: 'ai-verified' });
      continue;
    }
    try {
      const probe = await probeNaverAutocompleteSuggestions(keyword);
      const compact = keyword.replace(/\s+/g, '').toLowerCase();
      const echoed = probe.ok && probe.suggestions.some(
        (s) => s.replace(/\s+/g, '').toLowerCase().includes(compact),
      );
      if (echoed) verified.push({ keyword, searchVolume: null, source: 'ai-verified' });
    } catch { /* 프로브 실패 = 미검증 = 탈락 */ }
  }
  return verified;
}

async function main() {
  const inPath = arg('in');
  const outPath = arg('out');
  const maxAi = Number(arg('maxAi')) || 30;
  if (!inPath || !outPath) {
    console.error('--in=<board.json> --out=<enriched.json> 이 필요합니다.');
    process.exit(2);
  }

  const board = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const rows = Array.isArray(board.rows) ? board.rows : [];
  const searchAd = buildSearchAdConfig();
  console.log(`보강 대상 ${rows.length}행 · AI 호출 상한 ${maxAi} · 검색광고 ${searchAd ? 'OK' : '없음(프로브만)'}`);

  let aiCalls = 0;
  const stats = { enriched: 0, subsAdded: 0, titleUpgraded: 0, proposed: 0, verified: 0 };

  for (const row of rows) {
    const existingSubs = Array.isArray(row.subKeywords) ? row.subKeywords : [];
    if (existingSubs.length >= 3) continue;
    if (aiCalls >= maxAi) { console.log('  AI 호출 상한 도달 — 남은 행은 다음 보강으로.'); break; }

    aiCalls += 1;
    let proposals = [];
    try {
      proposals = await proposeSubKeywords(row.keyword);
    } catch (error) {
      console.log(`  !! [${row.keyword}] AI 제안 실패: ${String(error && error.message || error).slice(0, 80)}`);
      continue;
    }
    stats.proposed += proposals.length;
    const verified = await verifyProposals(searchAd, proposals);
    stats.verified += verified.length;

    /*
     * 병합: 기존(형제 실측) + AI 검증분을 한 풀로 두고 프레임 게이트를 다시
     * 통과시킨다 — 출처가 달라도 기준은 하나다.
     */
    const merged = pickProblemSubKeywords(row.keyword, [...existingSubs, ...verified]);
    const gotNewSubs = merged.length > existingSubs.length;

    /*
     * 제목 재조립 — 이제 파생 근거가 있으니 프레임이 살고, SERP 상위 10개
     * 제목(회차 실측)이 있으니 "1페이지에 없는 각도" 선택이 실제로 돈다.
     */
    const serpTitles = (row.serp && Array.isArray(row.serp.topTitles)) ? row.serp.topTitles : [];
    const newTitles = forgeTitles({
      keyword: row.keyword,
      derivedKeywords: [...existingSubs, ...verified],
      serpTitles,
      timing: row.timing || '',
    });
    const titleUpgraded = newTitles.seo.frame !== 'generic'
      && (!row.titles || !row.titles.seo || row.titles.seo.frame === 'generic');

    if (gotNewSubs) { row.subKeywords = merged; stats.subsAdded += 1; }
    if (titleUpgraded || gotNewSubs) { row.titles = newTitles; if (titleUpgraded) stats.titleUpgraded += 1; }
    if (gotNewSubs || titleUpgraded) {
      stats.enriched += 1;
      row.enrichedBy = { provider: lastProvider || 'unknown', proposed: proposals.length, verified: verified.length };
      console.log(`  ✚ [${row.keyword}] 서브 ${merged.length}개${titleUpgraded ? ` · 제목 ${newTitles.seo.frame}` : ''} — ${merged.map((s) => s.keyword).join(' / ')}`);
    }
  }

  board.enrichedAt = new Date().toISOString();
  board.enrichStats = { ...stats, aiCalls };
  fs.writeFileSync(outPath, JSON.stringify(board, null, 2), 'utf8');
  console.log(`\n보강 완료: AI ${aiCalls}회 → 제안 ${stats.proposed} → 검증 통과 ${stats.verified} → 보강 행 ${stats.enriched} (서브 +${stats.subsAdded} · 제목 승급 ${stats.titleUpgraded})`);
  console.log(`저장: ${outPath}`);
}

main().catch((error) => { console.error('보강 실패:', error); process.exit(1); });
