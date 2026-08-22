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
const { getNaverSearchAdKeywordVolume, getNaverSearchAdKeywordSuggestions } = require('../src/utils/naver-searchad-api');
const { getNaverKeywordSearchVolumeSeparate } = require('../src/utils/naver-datalab-api');
const { analyzeKeywordTrend } = require('../src/utils/trend-type-classifier');
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

/**
 * 지식인 질문 페이지에서 조회수·답변수를 실측한다 — 실패하면 null(정렬 맨 뒤).
 * 검색 API 가 둘 다 안 주므로 이 실측이 "조회수 높은 순"과 황금질문 판별
 * (조회 많고 답변 적음)의 유일한 근거다. 마크업 실측: '조회수 37,956' ·
 * 'answerCount">8<' 형태가 페이지에 실린다.
 */
async function fetchKinStats(link) {
  try {
    const res = await fetch(link, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { views: null, answers: null };
    const html = await res.text();
    const viewsMatch = html.match(/조회수\s*([\d,]+)/);
    const answersMatch = html.match(/answerCount"\s*>\s*([\d,]+)\s*</);
    return {
      views: viewsMatch ? Number(viewsMatch[1].replace(/,/g, '')) : null,
      answers: answersMatch ? Number(answersMatch[1].replace(/,/g, '')) : null,
    };
  } catch {
    return { views: null, answers: null };
  }
}

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

/**
 * 연관 키워드 실측 수확 — 검색광고 keywordstool 은 시드 하나에 연관 키워드를
 * 검색량과 함께 돌려준다. **지어낼 필요가 없는 100% 실존 풀**이라 통과율
 * 문제가 아예 없다(사장님 지시 2026-08-18: "통과율을 좀 더 올려서 키워드를
 * 최대치로"). AI 는 이 실측이 못 잡는 것(구어·줄임말·막히는 지점)만 채운다.
 */
async function harvestRelated(searchAd, mainKeyword) {
  if (!searchAd) return { tokenMatched: [], candidates: [] };
  try {
    const suggestions = await getNaverSearchAdKeywordSuggestions(searchAd, mainKeyword, 200);
    if (suggestions.length === 0) {
      // 조용한 0 은 진단 불가다 — 쿼터 소프트 상한이거나 15자 초과 시드다.
      console.log(`  ~~ [${mainKeyword}] 연관 실측 0건 (쿼터 상한 또는 시드 제한) — AI 로 계속`);
    }
    const compact = (t) => String(t || '').replace(/\s+/g, '').toLowerCase();
    const compactMain = compact(mainKeyword);
    const mainTokens = mainKeyword.split(/\s+/).filter((t) => t.length >= 2).map(compact);
    const rows = suggestions
      // 띄어쓰기만 다른 메인 자신은 뺀다 — 풀에 넣어 봐야 같은 키워드다.
      .filter((s) => s.keyword && compact(s.keyword) !== compactMain)
      .map((s) => ({
        keyword: s.keyword,
        searchVolume: s.totalSearchVolume ?? null,
        source: 'searchad-related',
      }))
      .sort((a, b) => (b.searchVolume ?? -1) - (a.searchVolume ?? -1));
    /*
     * 연관어는 붙여 쓴 형태가 많아('소워니놀이터무료도안') 어절 단위 비교가
     * 전량 빗나간다(실측: tokenMatched 0). 공백을 걷은 포함 비교로 잡는다.
     */
    const sharesMain = (keyword) => {
      const c = compact(keyword);
      return sharesToken(keyword, mainKeyword) || mainTokens.some((t) => c.includes(t));
    };
    /*
     * 연관 목록은 **주제 연관**이라 어절을 공유하지 않는 진짜 연관이 많다
     * ('소워니놀이터' → '스퀴시만들기' 실측). 어절 공유분은 자동 합류,
     * 나머지는 AI 가 "이 키워드로 글 쓰는 사람이 같이 노릴 것"만 고른다 —
     * 고르는 대상이 전부 실측이라 통과율 문제가 없다.
     */
    return {
      tokenMatched: rows.filter((r) => sharesMain(r.keyword)).slice(0, 20),
      candidates: rows.filter((r) => !sharesMain(r.keyword)).slice(0, 40),
    };
  } catch (error) {
    console.log(`  !! 연관 실측 실패(AI 로 계속): ${String((error && error.message) || error).slice(0, 80)}`);
    return { tokenMatched: [], candidates: [] };
  }
}

/** 클로드에 문제해결형 파생 제안을 받는다 — 반환은 미검증 후보다. */
async function proposeSubKeywords(mainKeyword, groundingExamples, relatedCandidates) {
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
    /*
     * 어느 쪽이 실제로 자리가 비는지 알려 준다(2026-08-22 실측).
     *
     * 통과한 행을 열어 보니 모양이 갈렸다:
     *   동탄 아이맥스 명당    검색 870 / 문서 188   ← 자리 있음
     *   오디세이 시사회 응모  검색 800 / 문서 111   ← 자리 있음
     *   김부장 웹툰      검색 168,100 / 문서 20,811 ← 2어절 헤드, 8대 1
     * 짧은 헤드는 검색량이 커도 이미 글이 쌓여 있어 게이트에서 떨어진다.
     * 조건이 하나 더 붙은 3어절이 살아남는다.
     *
     * 각도를 **강요하지는 않는다** — 좁게 못 박았더니 제안 142건 중 3건만
     * 실존을 통과한 적이 있다(위 주석). 우선순위로만 기울인다.
     */
    '같은 값이면 이런 쪽을 먼저 대라 — 글이 아직 적어서 쓸 자리가 남는 말이다:',
    '- 2어절 짧은 말보다 **조건이 하나 더 붙은 3어절**',
    '  (좋음: 동탄 아이맥스 명당 · 오디세이 시사회 응모)',
    '  (덜 좋음: 김부장 웹툰 — 짧고 흔해서 이미 글이 넘친다)',
    '- 붙는 조건은 지역·시기·대상·상황처럼 **사람이 실제로 덧붙여 치는 말**이어야 한다.',
    '  억지로 붙여 만든 말은 아무도 안 치므로 그냥 탈락한다.',
    '',
    ...(groundingExamples && groundingExamples.length > 0 ? [
      // 실측 예시를 보여주면 모델이 실제 검색 패턴에 닻을 내린다 — 통과율이 오른다.
      `참고 — 이 키워드와 같이 검색되는 것으로 이미 확인된 검색어: ${groundingExamples.slice(0, 8).join(', ')}`,
      '위 목록에 이미 있는 것은 다시 내지 마라. 저 패턴 옆의 빈틈을 채워라.',
      '',
    ] : []),
    ...(relatedCandidates && relatedCandidates.length > 0 ? [
      /*
       * 실측 연관 목록에서의 **선별**. 이 목록은 네이버가 실제로 같이
       * 검색된다고 잰 것들이라 통과율이 100%다 — AI 의 역할은 발명이 아니라
       * "이 키워드로 글 쓰는 사람이 같이 노릴 것"을 골라내는 것뿐이다.
       */
      `추가 임무 — 아래는 "${mainKeyword}" 와 같이 검색되는 것으로 **실측된** 연관 검색어다.`,
      `이 중 "${mainKeyword}" 로 글을 쓰는 사람이 같은 글이나 다음 글에서 노릴 만한 것만 골라라.`,
      '주제가 다른 것(우연히 같이 검색된 유행어·무관한 브랜드)은 버려라. 최대 8개.',
      `목록: ${relatedCandidates.slice(0, 40).join(', ')}`,
      '',
      'JSON 만 출력: {"new":["새 검색어",...], "picked":["목록에서 고른 것",...]}',
    ] : [
      '형식:',
      `- "${mainKeyword}" 의 핵심 명사를 포함`,
      '- 검색창에 치는 짧은 명사구: 2~4어절, 공백 제외 15자 이내. 질문 문장 금지',
      'JSON 만 출력: {"new":["검색어1","검색어2",...], "picked":[]}',
    ]),
    ...(relatedCandidates && relatedCandidates.length > 0 ? [
      '',
      '새 검색어(new) 형식:',
      `- "${mainKeyword}" 의 핵심 명사를 포함, 2~4어절, 공백 제외 15자 이내, 질문 문장 금지`,
    ] : []),
    '',
    /*
     * 제목도 같은 콜에서 받는다(2026-08-18 속도 병합 — 행당 AI 콜을 줄인다).
     * 근거는 위 실측 목록뿐. 검증(메인 포함·상투구·서브 포함)은 밖에서 한다.
     */
    '마지막 임무 — 위 실측 검색어들을 근거로 블로그 제목 두 개도 함께 지어라:',
    `- seo: "${mainKeyword}" 로 시작 + 상위노출을 노리는 구체 정보(숫자·비교·시점). 40자 이내.`,
    `- home: 공식은 넷 다 갖춰야 한다 — 메인키워드("${mainKeyword}") + 위 실측 서브키워드 하나`,
    '  + 클릭할 수밖에 없는 자극적인 강한 훅 + 사람냄새. 키워드는 문장 속에 자연스럽게 녹인다. 38자 이내.',
    '  홈판 제목의 승부처는 "AI 가 지은 티"의 완전 제거다. 네이버 노출 판정과 독자 둘 다',
    '  제목에서 AI 냄새를 맡으면 본문이 아무리 좋아도 열지 않는다.',
    '  결의 표본(주제가 달라도 같은 결이다 — 문구·어미를 복붙하지 말고 결만 배워서',
    '  이 키워드의 실측 사실로 새로 지어라):',
    '    "포켓몬고 위치정보 오류 이러니까 바로 풀리네요"',
    '    "김부장 드라마만 보고 결말 안다고 하면 큰일 납니다"',
    '    "청년내일저축계좌 만기 때 이거 모르면 한참 헤맵니다"',
    '  ① 말하듯 쓴다 — ~네요/~어요/~더라고요. 문어체 완결문, 대구·대칭 리듬 금지.',
    '  ② "키워드, 후킹문" 쉼표 이분법 금지 — 그 틀 자체가 AI 서명이다.',
    '  ③ 답의 존재만 알리고 내용은 숨긴다 — "이러니까"의 정체는 본문에만. 무엇이 아닌지까지는',
    '     말해도 되지만, 무엇인지 적는 순간 독자는 제목만 보고 가 버린다.',
    '  ④ 사람의 흔적 — 삽질·후기·실제 오류 문구 인용. 단 없는 수치·없는 경험 디테일 금지.',
    '  ⑤ 자극적으로 — 심심하면 아무도 반응하지 않는다. 자극은 독자의 진짜 공포·억울함',
    '     (날림·헛돈·큰일·삽질)에서 끌어와라. 사실을 지어내지 말고 감정의 진폭만 키워라.',
    '  **제목을 쓰기 전에 먼저 정하라: "이 제목을 왜 클릭하나?"** — 어떤 상황의 사람이',
    '  무엇이 궁금하거나 불안해서 멈추는지, 이 글이 그에게 무엇을 준다고 약속하는지.',
    '  그 동기가 제목에서 읽혀야 한다. 맥락을 못 잡는 후킹, 말이 안 되는 호기심 유발,',
    '  본문이 못 지킬 약속은 전부 실패다.',
    '  짓고 나서 자문하라: "AI 가 지었다고 눈치챌 구석이 하나라도 있나? 누구나 다 하는 제목인가?',
    '  스치던 손가락이 멈출 만큼 자극적인가? 왜 클릭하는지 읽는 사람이 알 수 있나?"',
    '  하나라도 걸리면 버리고 다시.',
    '  "~하는 방법" 서술형·"핵심 정리"류 라벨형은 전부 탈락이다.',
    `- why: 사람들이 지금 "${mainKeyword}" 를 검색하는 이유 한 문장(60자 이내).`,
    '  위 실측 검색어들에서 읽히는 의도만 근거로 써라. 근거 없는 사건·날짜를 지어내지 마라.',
    '',
    '최종 출력(JSON 하나만): {"new":[...], "picked":[...], "seo":"...", "home":"...", "why":"..."}',
  ].join('\n');
  const run = await runWithAnyAgent(prompt, AGENT_CHAIN, { timeoutMs: AI_TIMEOUT_MS });
  lastProvider = run.provider;
  const parsed = tryExtractJson(run.reply);
  const candidateSet = new Set(relatedCandidates || []);
  const asClean = (list) => (Array.isArray(list) ? list : [])
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);

  // 옛 형태(배열만) 응답도 받아 준다 — 형식이 어긋났다고 결과를 버리진 않는다.
  if (Array.isArray(parsed)) {
    return { proposals: asClean(parsed).filter((k) => k !== mainKeyword && sharesToken(k, mainKeyword)).slice(0, AI_PROPOSAL_CAP), picked: [], seoRaw: '', homeRaw: '', whyRaw: '' };
  }
  if (!parsed || typeof parsed !== 'object') return { proposals: [], picked: [], seoRaw: '', homeRaw: '', whyRaw: '' };
  return {
    proposals: asClean(parsed.new)
      .filter((k) => k.length >= 4 && k.replace(/\s+/g, '').length <= 15 && k !== mainKeyword)
      .filter((k) => sharesToken(k, mainKeyword))
      .slice(0, AI_PROPOSAL_CAP),
    // 고른 것은 반드시 준 목록 안에 있어야 한다 — 목록 밖 발명은 버린다.
    picked: asClean(parsed.picked).filter((k) => candidateSet.has(k)).slice(0, 8),
    seoRaw: typeof parsed.seo === 'string' ? parsed.seo : '',
    homeRaw: typeof parsed.home === 'string' ? parsed.home : '',
    whyRaw: typeof parsed.why === 'string' ? parsed.why : '',
  };
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

/** 아무 키워드에나 붙는 상투구 — 이게 나오면 제목이 아니라 라벨이다. */
// 금지 상투구는 대장간이 단일 출처다 — 발원지와 검증기가 갈라지면 이번처럼
// 규칙 폴백이 금지 문구를 만들어 화면까지 간다(2026-08-19 실사고).
const { TITLE_CLICHES } = require('../src/utils/title-forge/forge');

/**
 * 제목을 AI 가 실측 근거로 짓는다(사장님 지적 2026-08-18: "'마키나락스 주가
 * 핵심 정리'가 클릭하고 싶을까? 내가 분명 어떻게 하라고 명령했을 텐데").
 *
 * 규격은 브리프와 동일한 사장님 명령이다:
 *   SEO  = 메인키워드로 시작 + 상위노출을 노리는 구체 정보(숫자·비교·시점)
 *   홈판 = 메인키워드 + 서브키워드 + 클릭할 수밖에 없는 후킹
 * 재료는 실측 풀(검색량·문서수 붙은 검색어들)뿐 — 지어낸 수치 금지.
 * 검증 실패(메인 미포함·상투구·서브 미포함)면 버리고 규칙 제목을 유지한다.
 */
/**
 * AI 가 낸 제목의 **검증만** 한다(2026-08-18 속도 병합 — 제목 생성이 제안
 * 콜에 합쳐져 행당 AI 콜이 줄었다). 규격은 그대로: 메인 포함·상투구 금지·
 * 홈판은 서브 포함. 실패한 쪽은 버려 규칙 제목이 남는다.
 */
function validateAiTitles(mainKeyword, subKeywords, seoRaw, homeRaw) {
  const subs = (subKeywords || []).map((s) => s.keyword);
  const head = mainKeyword.split(/\s+/)[0] || '';
  const clean = (t, max) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, max + 10);
  const seo = clean(seoRaw, 40);
  const home = clean(homeRaw, 38);
  const subTokens = subs.flatMap((s) => s.split(/\s+/)).filter((t) => t.length >= 2 && !mainKeyword.includes(t));

  /*
   * "키워드, 후킹문" 쉼표 이분법은 AI 서명이다(사장님 확정 2026-08-20 — 네이버
   * 봇이 제목에서 AI 티를 잡으면 본문과 무관하게 노출이 막힌다). 첫 쉼표가
   * 키워드 직후에 오는 구조를 기계적으로 자른다 — 프롬프트만 믿지 않는다.
   */
  const commaTellOf = (t) => {
    const firstComma = t.indexOf(',');
    return firstComma > -1 && firstComma <= mainKeyword.length + 6 && t.slice(0, firstComma).includes(head);
  };
  const seoOk = seo.length >= 10 && seo.includes(head) && !TITLE_CLICHES.test(seo);
  const homeOk = home.length >= 10 && home.includes(head) && !TITLE_CLICHES.test(home)
    && !commaTellOf(home)
    && (subTokens.length === 0 || subTokens.some((t) => home.includes(t)));
  if (!seoOk && !homeOk) return null;
  return {
    ...(seoOk ? { seo: { text: seo, frame: 'ai', basis: '실측 풀 근거 AI 작성' } } : {}),
    ...(homeOk ? { home: { text: home, frame: 'ai', basis: '메인+서브+후킹 (실측 근거)' } } : {}),
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
  const envConfig = EnvironmentManager.getInstance().getConfig();
  const openApi = {
    clientId: envConfig.naverClientId || process.env.NAVER_CLIENT_ID || '',
    clientSecret: envConfig.naverClientSecret || process.env.NAVER_CLIENT_SECRET || '',
  };
  console.log(`보강 대상 ${rows.length}행 · AI 호출 상한 ${maxAi} · 검색광고 ${searchAd ? 'OK' : '없음(프로브만)'}`);

  let aiCalls = 0;
  const stats = { enriched: 0, subsAdded: 0, titleUpgraded: 0, proposed: 0, verified: 0, judged: 0, judgedBad: 0, related: 0, picked: 0, pooled: 0, aiTitled: 0, trended: 0 };

  /*
   * 행 3개 동시 처리(2026-08-18 — 사장님: "좀 빠르게 안 될까"). 행끼리는
   * 독립이고, 공용 API 들은 각자 내부 간격기(검색광고 500ms 등)가 초당
   * 호출을 그대로 묶는다 — 기다리는 시간만 겹쳐 사라진다. AI 3콜 동시는
   * 구독 사용량 자체를 늘리지 않는다(같은 콜 수를 겹쳐 보낼 뿐).
   */
  let capReached = false;
  const processRow = async (row) => {
    if (capReached) return;
    const existingSubs = Array.isArray(row.subKeywords) ? row.subKeywords : [];
    /*
     * "다 됐다"의 기준(2026-08-18 재적용 — stash 복구 사고로 이 조건이 옛
     * 버전으로 되돌아간 채 커밋돼, 3차 재보강이 31행을 완제품으로 오판하고
     * 4행만 돌았다). 서브 3개만으로는 안 끝난다: AI 제목이 붙었고 풀에
     * 문서수까지 실려 있어야 완제품이다.
     */
    // SEO·홈판 **둘 다** AI 여야 완제품 — SEO 만 보면 홈판이 규칙 폴백(상투구)인
    // 행이 완제품으로 오인돼 영영 재보강이 안 된다(2026-08-19 노각무침 실사고).
    const hasAiTitles = Boolean(row.titles
      && row.titles.seo && row.titles.seo.frame === 'ai'
      && row.titles.home && row.titles.home.frame === 'ai');
    const poolHasDocs = Array.isArray(row.keywordPool)
      && row.keywordPool.some((p) => typeof p.documentCount === 'number');
    // whySearch 도 완제품 조건이다(2026-08-19) — 빼먹으면 기존 완성 행이 영영
    // "왜 지금?"을 못 받는다(사장님 실측: 화면에 안 보임).
    const hasWhy = Boolean(row.whySearch && row.whySearch.text);

    /*
     * 지식인 수는 AI 콜이 아니라 무료 실측이라 스킵보다 먼저 잰다 — 완성 행도
     * 이 값은 새로 받아야 한다.
     */
    if (typeof row.kinCount !== 'number' || row.kinMode !== 'date-views-v2') {
      try {
        const { naverApiFetch } = require('../src/utils/naver-api-hub');
        /*
         * sort=date(최신 질문) — 사장님 지시 2026-08-19 "제일 최신 질문을
         * 바탕으로 조회수 높은 순". API 는 조회수를 안 주므로 질문 페이지에서
         * 실측한다(페이지에 '조회수 37,956' 형태로 정확히 한 번 실림 — 검증됨).
         * point 순은 관련성보다 인기를 앞세워 "김부장 결말"에 코난 질문이
         * 섞였던 실사고가 있어 토큰 필터는 유지한다. kinMode 마커로 옛 방식
         * (추천순·조회수 없음)으로 구운 칩도 전부 재조회된다.
         */
        const kinRes = await naverApiFetch(
          `https://openapi.naver.com/v1/search/kin.json?query=${encodeURIComponent(row.keyword)}&display=10&sort=date`,
          { headers: { 'X-Naver-Client-Id': envConfig.naverClientId || '', 'X-Naver-Client-Secret': envConfig.naverClientSecret || '' } },
        );
        if (kinRes.ok) {
          const kinBody = await kinRes.json();
          const total = Number(kinBody && kinBody.total);
          if (Number.isFinite(total)) row.kinCount = total;
          const items = Array.isArray(kinBody && kinBody.items) ? kinBody.items : [];
          const kwTokens = row.keyword.split(/\s+/).filter((t) => t.length >= 2);
          const compactKw = row.keyword.replace(/\s+/g, '');
          const seenKinDocs = new Set();
          const candidates = items
            .map((item) => ({
              title: String(item.title || '').replace(/<[^>]*>/g, '').trim(),
              link: String(item.link || ''),
            }))
            .filter((item) => item.title && item.link.startsWith('https://kin.naver.com'))
            .filter((item) => {
              const compactTitle = item.title.replace(/\s+/g, '');
              return kwTokens.some((t) => compactTitle.includes(t)) || compactTitle.includes(compactKw);
            })
            // 같은 질문이 answerNo 만 다른 링크로 두 번 온다(실측) — docId 로 걸러낸다.
            .filter((item, _idx, _arr) => {
              const docId = (item.link.match(/docId=(\d+)/) || [])[1] || item.link;
              if (seenKinDocs.has(docId)) return false;
              seenKinDocs.add(docId);
              return true;
            });
          const withViews = [];
          for (const item of candidates) {
            withViews.push({ ...item, ...(await fetchKinStats(item.link)) });
          }
          // 최대 5개(사장님 지시 2026-08-19) — 최신 질문을 조회수 높은 순으로.
          row.kinTop = withViews
            .sort((a, b) => (b.views ?? -1) - (a.views ?? -1))
            .slice(0, 5);
          row.kinMode = 'date-views-v2';
        }
      } catch (error) {
        console.log(`  !! [${row.keyword}] 지식인 실측 실패(빈 채로): ${String((error && error.message) || error).slice(0, 60)}`);
      }
    }

    if (existingSubs.length >= 3 && hasAiTitles && poolHasDocs && hasWhy) return;
    if (aiCalls >= maxAi) {
      if (!capReached) console.log('  AI 호출 상한 도달 — 남은 행은 다음 보강으로.');
      capReached = true;
      return;
    }

    /*
     * ① 실측 수확이 먼저다. 연관 실측은 통과율 100%(이미 잰 값)이고,
     * AI 는 그 실측을 예시로 받아 빈틈만 채운다 — 통과율이 함께 오른다.
     */
    const related = await harvestRelated(searchAd, row.keyword);
    stats.related += related.tokenMatched.length;

    aiCalls += 1;
    let proposals = [];
    let picked = [];
    let titlesRaw = { seoRaw: '', homeRaw: '', whyRaw: '' };
    try {
      const result = await proposeSubKeywords(
        row.keyword,
        related.tokenMatched.map((r) => r.keyword),
        related.candidates.map((r) => r.keyword),
      );
      proposals = result.proposals;
      picked = result.picked;
      titlesRaw = { seoRaw: result.seoRaw || '', homeRaw: result.homeRaw || '', whyRaw: result.whyRaw || '' };
      stats.picked += picked.length;
    } catch (error) {
      console.log(`  !! [${row.keyword}] AI 제안 실패: ${String(error && error.message || error).slice(0, 80)}`);
      return;
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
    /*
     * 풀 = 연관 실측 + AI 검증분. 서브 3개는 이 풀에서 고르고,
     * 풀 자체도 행에 싣는다(keywordPool) — 사장님 지시 "키워드를 최대치로".
     * 전부 실측이 붙은 검색어라 지어낸 것이 없다.
     */
    const pickedRows = related.candidates.filter((r) => picked.includes(r.keyword));
    const pool = [...related.tokenMatched, ...pickedRows, ...verified];
    const merged = pickSubKeywords(row.keyword, [...existingSubs, ...pool]);
    const gotNewSubs = merged.length > existingSubs.length;

    const seenPool = new Set();
    const keywordPool = pool
      .filter((p) => p.keyword && !seenPool.has(p.keyword) && seenPool.add(p.keyword))
      .sort((a, b) => (b.searchVolume ?? -1) - (a.searchVolume ?? -1))
      .slice(0, 12)
      .map((p) => ({ keyword: p.keyword, searchVolume: p.searchVolume ?? null, source: p.source }));

    /*
     * 풀에 문서수 실측을 붙인다(사장님 지시 2026-08-18: "검색량만 있네,
     * 문서수도 같이 — 177500/2345 이런 식으로"). 검색량÷문서수가 황금
     * 비율의 눈이다 — 검색량만 보이면 경쟁이 안 보인다.
     */
    if (keywordPool.length > 0) {
      try {
        const docRows = await getNaverKeywordSearchVolumeSeparate(
          openApi,
          keywordPool.map((p) => p.keyword),
          { includeDocumentCount: true },
        );
        const docByKeyword = new Map(docRows.map((d) => [String(d.keyword).replace(/\s+/g, ''), d.documentCount]));
        for (const p of keywordPool) {
          const dc = docByKeyword.get(p.keyword.replace(/\s+/g, ''));
          if (typeof dc === 'number' && dc >= 0) p.documentCount = dc;
        }
      } catch (error) {
        console.log(`  !! 풀 문서수 실측 실패(검색량만): ${String((error && error.message) || error).slice(0, 70)}`);
      }
      row.keywordPool = keywordPool;
      stats.pooled += keywordPool.length;
    }

    /*
     * 제목 재조립 — 이제 파생 근거가 있으니 프레임이 살고, SERP 상위 10개
     * 제목(회차 실측)이 있으니 "1페이지에 없는 각도" 선택이 실제로 돈다.
     */
    const serpTitles = (row.serp && Array.isArray(row.serp.topTitles)) ? row.serp.topTitles : [];
    const newTitles = forgeTitles({
      keyword: row.keyword,
      derivedKeywords: [...existingSubs, ...pool],
      serpTitles,
      timing: row.timing || '',
    });
    let titleUpgraded = newTitles.seo.frame !== 'generic'
      && (!row.titles || !row.titles.seo || row.titles.seo.frame === 'generic');

    if (gotNewSubs) { row.subKeywords = merged; stats.subsAdded += 1; }
    if (titleUpgraded || gotNewSubs) { row.titles = newTitles; if (titleUpgraded) stats.titleUpgraded += 1; }

    /*
     * 규칙 제목 위에 AI 제목을 덮는다 — 규칙 폴백("핵심 정리")은 아무 키워드에나
     * 붙는 라벨이지 클릭을 부르는 제목이 아니다(사장님 지적). 검증을 통과한
     * 것만 덮고, 실패하면 규칙 제목이 남는다.
     */
    const aiTitles = validateAiTitles(row.keyword, merged, titlesRaw.seoRaw, titlesRaw.homeRaw);
    if (aiTitles) {
      row.titles = { ...(row.titles || newTitles), ...aiTitles };
      stats.aiTitled += 1;
      titleUpgraded = true;
    }

    /*
     * 상투구 홈판 생존 구멍(2026-08-20 실측 31행): AI 홈판이 검증에서 떨어지고
     * 서브도 안 늘면 titles 가 안 갈려서 옛 폴백("핵심만 추렸습니다")이 남는다.
     * 현행 대장간 홈판으로 강제 교체 — 금지 목록 위반 제목은 화면에 못 간다.
     */
    if (row.titles && row.titles.home && TITLE_CLICHES.test(row.titles.home.text) && newTitles.home) {
      row.titles = { ...row.titles, home: newTitles.home };
    }

    /*
     * "지금 왜 검색되는가" — 에이전트 추론 한 문장(사장님 지시 2026-08-19).
     * 근거는 프롬프트에 실은 실측 연관뿐이고, 화면에는 'AI 추론' 라벨을 명시해
     * 실측 지표와 구분한다. 10자 미만·70자 초과·상투구는 버린다.
     */
    const why = String(titlesRaw.whyRaw || '').replace(/^["']|["']$/g, '').replace(/\s+/g, ' ').trim();
    if (why.length >= 10 && why.length <= 70 && !TITLE_CLICHES.test(why)) {
      row.whySearch = { text: why, basis: 'AI 추론 — 실측 연관 검색어 근거' };
      stats.whyAdded = (stats.whyAdded || 0) + 1;
    }

    if (gotNewSubs || titleUpgraded) {
      stats.enriched += 1;
      row.enrichedBy = { provider: lastProvider || 'unknown', proposed: proposals.length, verified: verified.length };
      console.log(`  ✚ [${row.keyword}] 서브 ${merged.length}개 · 제목 ${row.titles && row.titles.seo ? row.titles.seo.frame : '-'} — ${merged.map((s) => s.keyword).join(' / ')}`);
    }

    /*
     * 30일 트렌드를 행에 굽는다(2026-08-18). 웹 그래프는 브리지(사용자 PC 앱)
     * 로만 그렸는데, 폰에서는 127.0.0.1 이 닿을 수 없어 데이터랩 새 창으로
     * 튕겼다("그래프가 광고 사이트로 간다" — 사장님 실측). 데이터에 실으면
     * 어느 기기에서든 카드 안에서 바로 그려진다. 데이터랩 상대값 실측이다.
     */
    if (!row.trend || !Array.isArray(row.trend.series) || row.trend.series.length === 0) {
      try {
        const trend = await analyzeKeywordTrend(row.keyword, openApi);
        if (trend && Array.isArray(trend.series) && trend.series.length > 0) {
          row.trend = {
            series: trend.series.map((v) => Math.round(v)),
            label: (trend.analysis && trend.analysis.label) || '',
            recommendation: (trend.analysis && trend.analysis.recommendation) || '',
          };
          stats.trended += 1;
        }
      } catch (error) {
        console.log(`  !! [${row.keyword}] 트렌드 실측 실패(그래프 없이): ${String((error && error.message) || error).slice(0, 60)}`);
      }
    }

    // 지식인 수는 위(스킵 전)에서 이미 잰다 — 완성 행도 받아야 하는 값이라서다.

    /*
     * 수익 결론 — 애드센스 후보 행만. "인스타 폰트 변환처럼 광고 수익이 안
     * 나오는 키워드는 황금키워드 탈락"(사장님, 2026-08-18). 실측 검색어를
     * 인용한 판단만 남고, bad 판정 행은 애드센스 레인에서 빠진다(화면 필터).
     * 조용히 지우지 않는다 — 행에는 남아 판정 이유가 보인다.
     */
    if (row.adsenseFit === true && !row.monetize) {
      try {
        const verdict = await judgeMonetization(row.keyword, [...existingSubs, ...pool]);
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

    /*
     * 체크포인트 — 행 하나 끝날 때마다 통째로 저장한다(2026-08-18).
     * 재보강이 CI 시간제한에 잘리면 끝의 한 번 저장으로는 **전부** 잃는다
     * (run 32084322753: 20분 제한에 4행 작업분 증발 실측). 부분본 > 빈손.
     */
    board.enrichedAt = new Date().toISOString();
    board.enrichStats = { ...stats, aiCalls, partial: true };
    fs.writeFileSync(outPath, JSON.stringify(board, null, 2), 'utf8');
  };

  const { mapWithConcurrency } = require('../src/utils/rate-limited-pool');
  await mapWithConcurrency(rows, 3, processRow, (error, row) => {
    console.log(`  !! [${row && row.keyword}] 행 처리 예외(계속): ${String((error && error.message) || error).slice(0, 80)}`);
  });

  board.enrichedAt = new Date().toISOString();
  board.enrichStats = { ...stats, aiCalls, partial: false };
  fs.writeFileSync(outPath, JSON.stringify(board, null, 2), 'utf8');
  console.log(`\n보강 완료: 연관 실측 ${stats.related} + AI 선별 ${stats.picked} + AI 신규(제안 ${stats.proposed} → 통과 ${stats.verified}) → 풀 ${stats.pooled}개 · AI 제목 ${stats.aiTitled}행 · 보강 행 ${stats.enriched} (서브 +${stats.subsAdded}) · 수익 판정 ${stats.judged}행(탈락 ${stats.judgedBad}) · AI ${aiCalls}회`);
  console.log(`저장: ${outPath}`);
}

/*
 * 명시적 종료 — 3차 재보강이 "저장:" 을 찍고도 150분 매달렸다(실측).
 * 어딘가의 열린 핸들(keep-alive 소켓·타이머)이 이벤트 루프를 붙잡는다.
 * 결과 파일은 이미 저장됐으므로 종료를 미룰 이유가 없다.
 */
main()
  .then(() => process.exit(0))
  .catch((error) => { console.error('보강 실패:', error); process.exit(1); });
