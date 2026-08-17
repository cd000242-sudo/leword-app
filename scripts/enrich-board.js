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
const { pickSubKeywords } = require('../src/utils/title-forge/subkeyword-forge');
const { sharesToken } = require('../src/utils/title-forge/board-titles');
const { forgeTitles } = require('../src/utils/title-forge/forge');
const { runClaude } = require('../src/utils/agent-cli/claudeRunner');
const { runCodex } = require('../src/utils/agent-cli/codexRunner');
const { runGemini } = require('../src/utils/agent-cli/geminiRunner');
const { runGrok } = require('../src/utils/agent-cli/grokRunner');
const { runWithAnyAgent } = require('../src/utils/agent-cli/runAny');
const { tryExtractJson } = require('../src/utils/agent-cli/parse');

/*
 * 구독 CLI 는 하나만 믿지 않는다. 2026-08-18 회차는 클로드 로그인이 끊겨
 * 30회가 전부 죽었는데, 코덱스 구독은 멀쩡히 살아 있었다 — 데스크톱 경로는
 * 원래 세 개를 차례로 시도하는데 이 스크립트만 클로드 하나였다.
 */
/*
 * 배치 전용 모델 고정(2026-08-18). 사장님 클로드코드 기본 모델은 페이블5 —
 * 최상위 티어라 그 한도는 사장님이 직접 쓰는 자리에 남겨 두고, 배치는
 * 오푸스5 로 돌린다(사장님 선택: 소네트보다 품질 우선, 짧은 배치 호출이라
 * 오푸스 주간 한도 안에서 충분히 감당된다. 실왕복 확인).
 */
const BATCH_CLAUDE_MODEL = 'opus';

const AGENT_CHAIN = [
  { provider: 'claude', run: (p, o) => runClaude(p, { ...(o || {}), model: BATCH_CLAUDE_MODEL }) },
  { provider: 'codex', run: runCodex },
  { provider: 'gemini', run: runGemini },
  { provider: 'grok', run: runGrok },
];

function arg(name, fallback = '') {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}

const AI_TIMEOUT_MS = 60_000;
/*
 * 검증을 통과한 것 중에서 문제해결형을 고르는 구조라, 풀이 넓어야 고를 것이
 * 생긴다. 5개로는 통과분이 1~2개뿐이라 프레임 선별에서 전부 떨어졌다.
 */
const AI_PROPOSAL_CAP = 10;

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
  /*
   * 2026-08-18 실측: "문제해결형만" 을 강요했더니 제안 142건 중 3건만 실존
   * 확인을 통과했다(2%). 각도를 좁게 못 박으면 AI 가 **말이 되는 검색어를
   * 지어낸다** — 실제로 아무도 안 치는 말이다.
   *
   * 같은 날 수요 분석기는 "실제로 칠 법한 검색어"만 물었더니 6건 중 6건이
   * 실측 검색량으로 확인됐다. 그래서 여기서도 각도를 강요하지 않는다.
   * 문제해결형 선별은 검증을 통과한 **실존 검색어 풀**에서 나중에 한다
   * (pickProblemSubKeywords) — 없는 것을 만들어 내는 것보다 있는 것 중에
   * 고르는 편이 언제나 낫다.
   */
  const prompt = [
    '너는 네이버 검색어 데이터 전문가다.',
    `검색 키워드 "${mainKeyword}" 를 찾는 사람들이 **실제로 네이버에 치는 다른 검색어** ${AI_PROPOSAL_CAP}개를 대라.`,
    '',
    '가장 중요한 것: **실제로 존재하는 검색어만**. 우리가 검색량으로 확인하므로',
    '지어낸 말은 전부 탈락하고, 탈락하면 이 키워드는 빈손으로 나간다.',
    '확신이 없으면 개수를 줄여라 — 적고 진짜인 편이 많고 가짜인 것보다 낫다.',
    '',
    '이런 것들이 실제로 많이 검색된다:',
    '- 정식 명칭 ↔ 구어·줄임말 (예: 민증사진 ↔ 주민등록증 사진)',
    '- 세부 조건 (규격·크기·가격·기간·자격·준비물)',
    '- 막히는 지점 (안 됨·반려·오류·취소·환불)',
    '- 바로 옆 대안 (비교 대상, 대체 서비스, 다음 단계)',
    '',
    '형식:',
    `- "${mainKeyword}" 의 핵심 명사를 포함`,
    '- 검색창에 치는 짧은 명사구: 2~4어절, 공백 제외 15자 이내. 질문 문장 금지',
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

/**
 * 수익 결론 — 클릭할까·무슨 광고가 뜰까·머물까를 하나하나 따진다.
 * keyword-demand-service 의 판정과 같은 원칙: 실측 검색어를 직접 인용해야
 * 하고, 예상 수익·트래픽 숫자는 금지. 근거 없는 판정이면 null.
 */
async function judgeMonetization(keyword, verifiedSubs) {
  const lines = verifiedSubs
    .filter((s) => s && s.keyword)
    .slice(0, 10)
    .map((s) => `${s.keyword}${s.searchVolume ? ` (월 ${s.searchVolume})` : ''}`);
  const run = await runWithAnyAgent([
    '너는 애드센스 블로그 수익 분석가다. 아래는 실측 값이다.',
    '',
    `키워드: ${keyword}`,
    `같이 검색되는 확인된 검색어: ${lines.join(', ') || '(없음)'}`,
    '',
    '이 키워드로 글을 쓸지 말지, 다음을 하나하나 따져 결론을 내라:',
    '1) 검색자가 무엇을 손에 넣으면 만족하나 (도구 URL / 정보 / 구매처 / 절차)',
    '2) 그 사람이 광고를 클릭할 상태인가 — 어떤 종류의 광고가 뜰 법한가',
    '3) 글에 머무는 시간 — 한 줄 얻고 나가는 검색인가, 읽어야 풀리는 검색인가',
    '4) 결론: good(써라)/bad(광고 수익 안 나온다)/mixed(각도에 달렸다)',
    '',
    '- 각 판단은 위 실측 검색어를 직접 인용해서 근거를 댄다',
    '- 예상 수익·트래픽 숫자를 지어내지 마라. 뻔한 덕담 금지',
    '',
    'JSON 만 출력: {"verdict":"good|bad|mixed","points":[{"text":"..."}],"angle":"쓴다면 이런 각도"}',
  ].join('\n'), AGENT_CHAIN, { timeoutMs: AI_TIMEOUT_MS });
  const parsed = tryExtractJson(run.reply);
  if (!parsed || !['good', 'bad', 'mixed'].includes(String(parsed.verdict))) return null;
  const points = (Array.isArray(parsed.points) ? parsed.points : [])
    .map((p) => String((p && p.text) || '').replace(/\s+/g, ' ').trim())
    .filter((t) => t.length >= 12)
    .slice(0, 4)
    .map((text) => ({ text }));
  if (points.length === 0) return null;
  return {
    verdict: String(parsed.verdict),
    points,
    angle: String(parsed.angle || '').replace(/\s+/g, ' ').trim().slice(0, 200),
    provider: lastProvider || 'unknown',
  };
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
  const stats = { enriched: 0, subsAdded: 0, titleUpgraded: 0, proposed: 0, verified: 0, judged: 0, judgedBad: 0 };

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
    /*
     * 문제해결형 우선, 모자라면 실존 검색어로 채운다. 엄격한 판정만 쓰면
     * 실측 통과 61건을 쥐고도 보강 0행이 된다(2026-08-18 실측).
     */
    const merged = pickSubKeywords(row.keyword, [...existingSubs, ...verified]);
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

    /*
     * 수익 결론 — 애드센스 후보 행만. "인스타 폰트 변환처럼 광고 수익이 안
     * 나오는 키워드는 황금키워드 탈락"(사장님, 2026-08-18). 실측 검색어를
     * 인용한 판단만 남고, bad 판정 행은 애드센스 레인에서 빠진다(화면 필터).
     * 조용히 지우지 않는다 — 행에는 남아 판정 이유가 보인다.
     */
    if (row.adsenseFit === true && !row.monetize) {
      try {
        const verdict = await judgeMonetization(row.keyword, [...existingSubs, ...verified]);
        if (verdict) {
          row.monetize = verdict;
          stats.judged += 1;
          if (verdict.verdict === 'bad') stats.judgedBad += 1;
          console.log(`  ₩ [${row.keyword}] 수익 판정 ${verdict.verdict}${verdict.verdict === 'bad' ? ' — 애드센스 레인 탈락' : ''}`);
        }
      } catch (error) {
        console.log(`  !! [${row.keyword}] 수익 판정 실패(없이 계속): ${String((error && error.message) || error).slice(0, 80)}`);
      }
    }
  }

  board.enrichedAt = new Date().toISOString();
  board.enrichStats = { ...stats, aiCalls };
  fs.writeFileSync(outPath, JSON.stringify(board, null, 2), 'utf8');
  console.log(`\n보강 완료: AI ${aiCalls}회 → 제안 ${stats.proposed} → 검증 통과 ${stats.verified} → 보강 행 ${stats.enriched} (서브 +${stats.subsAdded} · 제목 승급 ${stats.titleUpgraded}) · 수익 판정 ${stats.judged}행(탈락 ${stats.judgedBad})`);
  console.log(`저장: ${outPath}`);
}

main().catch((error) => { console.error('보강 실패:', error); process.exit(1); });
