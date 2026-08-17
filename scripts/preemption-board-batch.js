#!/usr/bin/env node
/**
 * 선점 황금키워드 배치 — 32개 블로그 주제를 한 번에 훑는다.
 *
 * 왜 만들었나:
 *   ① 사용자가 어느 주제로 블로그를 하는지 우리는 모른다. "카테고리를 고르세요"는
 *      사용자에게 검색 노동을 떠넘기는 것이다. 32종 전부 훑어 놓고 고르게 한다.
 *   ② 평범한 황금키워드(검색량↑ 문서수↓)는 실시간 검색어·남의 툴과 겹쳐 값이 없다.
 *      우리가 팔 것은 "지금 쓰면 자리가 있는" 것 하나다. 그 판정은 실제 검색결과를
 *      봐야만 할 수 있고, 그래서 Bright Data SERP 를 태운다.
 *
 * 판정은 preemption-gate.ts 가 한다(테스트 23건). 이 파일은 예산·순서·발행만 맡는다.
 *
 * 비용:
 *   BD 무료 5,000/월. 이 배치의 golden 몫은 회당 --maxPerRun 으로 못 박는다.
 *   --dryRun 은 네트워크를 아예 건드리지 않으므로 소요량만 볼 때 공짜다.
 *   **실주행은 크레딧을 태운다. 반복 실행 전에 매번 승인받을 것.**
 *
 * 사용:
 *   node scripts/preemption-board-batch.js --in=candidates.json --dryRun
 *   BRIGHTDATA_TOKEN=xxx node scripts/preemption-board-batch.js --in=candidates.json --out=board.json
 *
 * 입력: [{ keyword, topic, searchVolume, documentCount }] 또는
 *       { topics: { "주제라벨": [ {keyword, searchVolume, documentCount}, ... ] } }
 */
'use strict';

require('ts-node/register/transpile-only');
require('./load-project-env').loadProjectEnv();

const fs = require('fs');
const path = require('path');
const { brightDataFetch } = require('../src/utils/brightdata-client');
const { analyzeSerp } = require('../src/utils/serp-winnability');
const { readSerpStructure } = require('../src/utils/naver-serp-structure');
const { readSerpMeaning } = require('../src/utils/serp-meaning');
const { brightDataQuotaSnapshot } = require('../src/utils/brightdata-quota-governor');
const { selectWithFill, TIER_ORDER, TIER_LABEL, DEFAULT_PREEMPTION_THRESHOLDS } = require('../src/utils/preemption-gate');
const { BLOG_TOPIC_COVERAGE, topicsWithoutCoverage } = require('../src/utils/blog-topic-coverage');
const { judgeTopicByEvidence } = require('../src/utils/topic-evidence');
const { createInterval, mapWithConcurrency } = require('../src/utils/rate-limited-pool');
const { buildBoardTitles } = require('../src/utils/title-forge/board-titles');
const { judgePlatformLane } = require('../src/utils/platform-lane');

const ZONE = process.env.BRIGHTDATA_ZONE || '77';
const FEATURE = 'golden';
const DELAY_MS = 400;

/**
 * 회당 요청 상한. golden 월 3,000 ÷ 주2회(월 8.7회) ≈ 344.
 * 32주제로 나누면 주제당 약 10건을 검증할 수 있다.
 */
const DEFAULT_MAX_PER_RUN = 344;

/**
 * 주제당 채우고 싶은 개수.
 * 확실한 층부터 채우고 모자라면 아래 층을 깐다 — 빈손으로 끝내지 않기 위해서다.
 */
const DEFAULT_TARGET_PER_TOPIC = 5;

/** 최초 관측 시각 장부. 이게 없으면 "막 올라왔다"를 판정할 수 없다. */
const DEFAULT_STATE_PATH = path.join(__dirname, '..', 'data', 'preemption-first-seen.json');

function arg(name, fallback = '') {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function blogTabUrl(keyword) {
  return `https://search.naver.com/search.naver?ssc=tab.blog.all&sm=tab_jum&query=${encodeURIComponent(keyword)}`;
}

/** 입력을 주제별 후보 목록으로 정규화. */
function loadCandidates(inPath) {
  const parsed = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const byTopic = new Map();
  const push = (topic, row) => {
    const keyword = String(row.keyword || '').trim();
    if (!keyword) return;
    if (!byTopic.has(topic)) byTopic.set(topic, []);
    byTopic.get(topic).push({
      keyword,
      topic,
      searchVolume: Number.isFinite(Number(row.searchVolume)) ? Number(row.searchVolume) : null,
      documentCount: Number.isFinite(Number(row.documentCount)) ? Number(row.documentCount) : null,
      /*
       * 후보 단계에서 붙인 라벨을 그대로 들고 간다.
       * 여기서 안 넘기면 검색 의도·시즌성·규제 위험이 보드까지 도달하지 못해
       * 화면에 못 쓴다 — 만들어 놓고 안 보여주는 상태가 된다.
       */
      intent: row.intent || null,
      intentLabel: row.intentLabel || '',
      briefingRisk: row.briefingRisk || null,
      regulatoryRisk: row.regulatoryRisk || null,
      regulatoryLabel: row.regulatoryLabel || '',
      trendType: row.trendType || null,
      trendShape: row.trendShape || null,
      trendLabel: row.trendLabel || '',
      // 제목 배선용 — 같은 씨앗 형제를 찾는 열쇠다. 없으면 어절 공유로 대신한다.
      seed: row.seed || null,
      // 애드센스 레인 판정 재료(검색량 응답에 같이 온 실측). 없으면 null.
      cpc: Number.isFinite(Number(row.cpc)) && Number(row.cpc) > 0 ? Number(row.cpc) : null,
      adCompetition: row.adCompetition || null,
      monthsToPeak: Number.isFinite(Number(row.monthsToPeak)) ? Number(row.monthsToPeak) : null,
      timing: row.timing || '',
      longTail: Boolean(row.longTail),
      // 언제 잰 값인지. 여기서 안 넘기면 화면이 "언제쩍 숫자인지" 를 말할 수 없다.
      measuredAt: row.measuredAt || null,
      demandAsOf: row.demandAsOf || null,
      latestVsPeakPct: Number.isFinite(Number(row.latestVsPeakPct)) ? Number(row.latestVsPeakPct) : null,
      monthsSincePeak: Number.isFinite(Number(row.monthsSincePeak)) ? Number(row.monthsSincePeak) : null,
      recencySummary: row.recencySummary || '',
    });
  };

  if (Array.isArray(parsed)) {
    parsed.forEach((row) => push(String(row.topic || '주제 선택 안 함'), row));
  } else if (parsed && parsed.topics) {
    for (const [topic, rows] of Object.entries(parsed.topics)) {
      (rows || []).forEach((row) => push(topic, row));
    }
  }
  return byTopic;
}

/** 최초 관측 장부를 읽고, 처음 보는 키워드는 지금 시각으로 등록한다. */
function loadFirstSeen(statePath, keywords, nowIso) {
  let state = {};
  if (fs.existsSync(statePath)) {
    try {
      state = JSON.parse(fs.readFileSync(statePath, 'utf8')) || {};
    } catch {
      // 깨진 장부로 전부 "신규"가 되면 게이트가 무력해진다. 비우지 말고 알린다.
      console.warn('  ⚠️ 최초 관측 장부를 읽지 못했다 — 이번 회차 신규 판정은 믿지 말 것');
      state = {};
    }
  }
  /*
   * 이번 회차에 처음 장부에 오른 것은 **나이를 모른다**.
   *
   * 장부는 "우리가 언제 처음 봤나" 만 안다. 이번에 처음 등록한 키워드에
   * 지금 시각을 적어 두고 그걸 나이로 읽으면 0시간이 되어, 몇 년 된 말에도
   * "N시간 전에 처음 관측된 말이다" 가 화면에 붙는다. 이건 실측이 아니라 거짓이다.
   *
   * CI 는 매 회차 새 러너라 장부 파일이 없다 — 그대로 두면 **전 행이** 그렇게 된다.
   * 그래서 등록은 하되(다음 회차부터 의미가 생긴다) 이번 회차에는 안 알려 준다.
   */
  const addedKeywords = new Set();
  for (const keyword of keywords) {
    if (!state[keyword]) {
      state[keyword] = nowIso;
      addedKeywords.add(keyword);
    }
  }
  return { state, added: addedKeywords.size, addedKeywords };
}

/** 이번 회차에 처음 본 것은 null(모름) 로 넘긴다. */
function observedSince(firstSeen, addedKeywords, keyword) {
  if (addedKeywords.has(keyword)) return null;
  return firstSeen[keyword] || null;
}

/**
 * 지금 실시간 검색어에 올라와 있는 키워드 집합.
 *
 * **measured 를 함께 돌려준다.** 빈 집합만 돌려주면 "실시간에 없다" 와 "실시간을
 * 못 쟀다" 가 같은 모양이 된다. 그 둘을 섞은 탓에 워크플로가 --signals 를 안 넘기던
 * 내내 화면에는 "실시간 검색어에는 아직 없다 — 대중화 전이다" 가 근거로 붙어 있었다.
 */
function loadRealtimeKeywords(signalsPath) {
  const unmeasured = { keywords: new Set(), measured: false };
  if (!signalsPath || !fs.existsSync(signalsPath)) return unmeasured;
  try {
    const data = JSON.parse(fs.readFileSync(signalsPath, 'utf8'));
    const set = new Set();
    for (const lane of data.lanes || []) {
      for (const item of lane.items || []) {
        const keyword = String(item.keyword || item.title || '').trim();
        if (keyword) set.add(keyword.replace(/\s+/g, ''));
      }
    }
    // 0건짜리 스냅샷은 수집 실패의 흔적이다 — 잰 것으로 치지 않는다.
    if (set.size === 0) return unmeasured;
    return { keywords: set, measured: true };
  } catch {
    return unmeasured;
  }
}

/** 실시간 여부. 못 쟀으면 null 로 넘긴다 — 아래 판정기들이 근거에서 뺀다. */
function realtimeState(realtime, keyword) {
  if (!realtime.measured) return null;
  return realtime.keywords.has(keyword.replace(/\s+/g, ''));
}

/**
 * 주제별로 공평하게 예산을 나눈다.
 * 한 주제가 후보를 많이 냈다고 예산을 독식하면, 그 주제로 블로그를 안 하는
 * 사용자에게는 이번 회차가 통째로 헛돈 것이 된다.
 */
function allocateBudget(byTopic, maxPerRun) {
  const topics = [...byTopic.keys()];
  if (topics.length === 0) return new Map();
  const base = Math.floor(maxPerRun / topics.length);
  const allocation = new Map();
  let spent = 0;
  for (const topic of topics) {
    const take = Math.min(base, byTopic.get(topic).length);
    allocation.set(topic, take);
    spent += take;
  }
  // 후보가 적어 남은 예산은 후보가 많은 주제에 되돌려 준다.
  let leftover = maxPerRun - spent;
  for (const topic of topics) {
    if (leftover <= 0) break;
    const rows = byTopic.get(topic).length;
    const extra = Math.min(leftover, Math.max(0, rows - allocation.get(topic)));
    allocation.set(topic, allocation.get(topic) + extra);
    leftover -= extra;
  }
  return allocation;
}

/** 통합검색 주소. 블로그탭과 달리 AI 브리핑·인플루언서 구획이 함께 온다. */
function allTabUrl(keyword) {
  return `https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`;
}

/**
 * 한 키워드를 검증한다.
 *
 * 호출 두 번이다:
 *   ① 블로그탭 — 제목 실측(자리 판정). 이게 본체다.
 *   ② 통합검색 — AI 브리핑 실측. --withStructure 일 때만 부른다.
 *
 * ②는 크레딧을 두 배로 쓴다. 그래도 값어치가 있는 이유: 자리가 비어 있어도
 * AI 가 답을 대신하면 클릭이 안 온다. 그걸 유형 추론으로만 판단하다가
 * 실측으로 바꾸는 것이라 첫 회차에는 켜고 도는 것이 맞다.
 */
async function verify(keyword, withStructure) {
  const res = await brightDataFetch(blogTabUrl(keyword), FEATURE, { zone: ZONE });
  if (!res.ok) return { serp: null, quotaBlocked: Boolean(res.quotaBlocked), error: res.error || res.status };
  const serp = analyzeSerp(res.body, keyword);

  if (!withStructure) return { serp, quotaBlocked: false };

  const whole = await brightDataFetch(allTabUrl(keyword), FEATURE, { zone: ZONE });
  if (whole.quotaBlocked) return { serp, quotaBlocked: true };
  const structure = whole.ok ? readSerpStructure(whole.body) : null;
  if (structure) {
    // 못 본 것을 '없음'으로 적지 않는다. 판독 실패면 필드를 안 채운다.
    serp.hasAiBriefing = structure.hasAiBriefing;
    serp.aiBriefingSourceCount = structure.aiBriefingSources.length;
    serp.adCount = structure.adCount;
    serp.sections = structure.sections;
    serp.sectionMarkerVersion = structure.sectionMarkerVersion;
    /*
     * "이 키워드가 뭔데" 를 같은 문서에서 함께 읽는다.
     * 따로 부르면 크레딧이 두 배가 되는데, 필요한 글자는 이미 이 HTML 안에 있다.
     */
    serp.meaning = readSerpMeaning(whole.body);
  }
  return { serp, quotaBlocked: false };
}

/**
 * 후보에 붙어 있던 주제를 검색결과로 되짚는다.
 *
 * 왜 여기서 하나: 후보를 만들 때는 재료가 압축된 키워드 한 줄뿐이라 주제 이탈을
 * 가릴 수가 없다(씨앗 '독서대 추천' → 연관어 '노트북받침대' → 문학·책으로 실림).
 * SERP 를 태우고 나면 사람이 띄어 쓴 제목이 생기고, 거기서는 낱말 경계가 존재한다.
 * 판정 규칙은 topic-evidence.ts 가 단일 출처다.
 */
function settleTopic(topic, keyword, serp) {
  return judgeTopicByEvidence({
    keyword,
    claimedTopic: topic,
    meaning: serp ? serp.meaning : null,
    topTitles: serp ? serp.topTitles : null,
  });
}

async function main() {
  const inPath = arg('in');
  if (!inPath) { console.error('--in=<후보 JSON> 이 필요합니다.'); process.exit(2); }
  if (!fs.existsSync(inPath)) { console.error(`입력 파일 없음: ${inPath}`); process.exit(2); }

  const dryRun = hasFlag('dryRun');
  const maxPerRun = Number(arg('maxPerRun')) || DEFAULT_MAX_PER_RUN;
  const statePath = arg('state') || DEFAULT_STATE_PATH;
  const signalsPath = arg('signals');
  const outPath = arg('out');
  const targetPerTopic = Number(arg('targetPerTopic')) || DEFAULT_TARGET_PER_TOPIC;
  // 통합검색까지 받아 AI 브리핑을 실측한다. 크레딧이 키워드당 2배가 된다.
  const withStructure = hasFlag('withStructure');
  const nowIso = new Date().toISOString();

  const byTopic = loadCandidates(inPath);
  const allKeywords = [...byTopic.values()].flat().map((row) => row.keyword);
  const { state: firstSeen, added, addedKeywords } = loadFirstSeen(statePath, allKeywords, nowIso);
  /*
   * 장부는 **BD 를 태우기 전에** 저장한다.
   *
   * 예전에는 전 주제를 다 돈 뒤에 썼다. 그래서 2026-08-11 회차가 90분 잡 타임아웃에
   * 걸려 취소됐을 때, 102건을 새로 관측해 놓고도 장부가 통째로 날아갔다 —
   * 다음 회차가 또 빈 장부로 시작하고 '선점 적기' 는 또 0행이 된다.
   *
   * 등록은 후보를 만든 시점에 이미 끝났다(그때 우리가 그 말을 처음 본 것이다).
   * SERP 검증 성공 여부와는 상관없는 사실이므로 여기서 적어도 거짓이 아니다.
   */
  // dryRun 은 아무것도 바꾸지 않는다. 시늉 실행이 장부를 늘리면 다음 회차의
  // '새로 생긴 말' 판정이 실제로 본 적 없는 관측을 근거로 삼게 된다.
  if (!dryRun) {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(firstSeen, null, 0), 'utf8');
  }
  const realtime = loadRealtimeKeywords(signalsPath);
  const allocation = allocateBudget(byTopic, maxPerRun);
  const planned = [...allocation.values()].reduce((sum, n) => sum + n, 0) * (process.argv.includes('--withStructure') ? 2 : 1);

  console.log('='.repeat(72));
  console.log(`선점 황금키워드 배치  (존 ${ZONE})`);
  console.log('='.repeat(72));
  console.log(`  블로그 주제      ${BLOG_TOPIC_COVERAGE.length}종 중 후보가 있는 주제 ${byTopic.size}종`);

  // 후보가 0건인 주제를 반드시 찍는다. 조용한 0건이 이 프로젝트의 단골 실패다.
  const emptyTopics = BLOG_TOPIC_COVERAGE.map((e) => e.topic).filter((t) => !byTopic.has(t));
  if (emptyTopics.length > 0) {
    console.log(`  ⚠️ 후보 0건 주제  ${emptyTopics.length}종 — ${emptyTopics.slice(0, 8).join(', ')}${emptyTopics.length > 8 ? ' …' : ''}`);
    console.log('     이 주제로 블로그하는 사용자에게는 이번 회차가 빈 화면이다. 발굴 씨앗 확인 필요.');
  }
  const uncovered = topicsWithoutCoverage();
  if (uncovered.length > 0) console.log(`  ❌ 발굴 근거 자체가 없는 주제: ${uncovered.join(', ')}`);

  console.log(`  후보 총           ${allKeywords.length}건`);
  console.log(`  최초 관측 신규    ${added}건 (장부 ${Object.keys(firstSeen).length}건)`);
  console.log(`  실시간 대조군     ${realtime.measured ? `${realtime.keywords.size}건` : '못 쟀음 — 실시간 조건을 근거로 쓰지 않는다'}`);
  console.log(`  이번 실행 소요    ${planned}건 / 회당 예산 ${maxPerRun}건`);
  console.log(`  주제당 목표       ${targetPerTopic}건 (확실한 층부터 채우고 모자라면 아래 층을 깐다)`);
  console.log('  층 순서           ' + TIER_ORDER.map((t, i) => `${i + 1}) ${TIER_LABEL[t]}`).join('  '));

  /*
   * 사전 점검 — 크레딧을 쓰기 전에 "이 후보들이 게이트를 통과할 수 있는가"를 본다.
   *
   * 후보 엔진과 게이트의 검색량 하한이 어긋나 후보 30건이 전량 탈락한 적이 있다.
   * BD 30건을 태우고 나서야 알았다. 통과 가능한 후보가 없으면 여기서 멈춘다.
   */
  const eligible = [...byTopic.values()].flat()
    .filter((row) => Number(row.searchVolume) >= DEFAULT_PREEMPTION_THRESHOLDS.minSearchVolume);
  console.log(`  AI 브리핑 실측    ${withStructure ? '켬 (키워드당 크레딧 2배)' : '끔'}`);
  console.log(`  게이트 통과 가능  ${eligible.length}/${allKeywords.length}건 (검색량 ${DEFAULT_PREEMPTION_THRESHOLDS.minSearchVolume} 이상)`);
  if (eligible.length === 0) {
    console.error('\n중단 — 검색량 조건만으로 후보 전량이 탈락한다. BD 를 부르지 않는다.');
    console.error(`  후보 엔진의 --minVolume 과 게이트의 minSearchVolume(${DEFAULT_PREEMPTION_THRESHOLDS.minSearchVolume})을 맞출 것.`);
    process.exit(3);
  }

  const before = brightDataQuotaSnapshot();
  console.log(`  이번 달 사용      ${before.used} / ${before.freeCeiling} (남은 ${before.remainingFree})\n`);

  if (dryRun) {
    console.log('주제별 배정:');
    for (const [topic, take] of allocation) {
      console.log(`  ${String(take).padStart(3)}건  ${topic}  (후보 ${byTopic.get(topic).length})`);
    }
    console.log('\ndryRun — Bright Data 를 호출하지 않고 종료합니다. 크레딧 소모 0.');
    process.exit(0);
  }
  if (!(process.env.BRIGHTDATA_TOKEN || '').trim()) {
    console.error('BRIGHTDATA_TOKEN 환경변수가 필요합니다.');
    process.exit(2);
  }

  const rows = [];
  const stats = { verified: 0, passed: 0, rejected: 0, undetermined: 0, failed: 0 };
  let blocked = false;
  /*
   * 동시에 몇 개를 검증할 것인가.
   *
   * 3 이면 이 단계가 대략 3분의 1로 줄어든다(실측 60분 → 20분대). 크레딧 소모는
   * 그대로다 — 같은 요청을 순서만 겹쳐서 보낸다. Bright Data 는 프록시라
   * 동시 요청을 감당하지만, 간격기(bdGate)가 초당 요청 수를 원래대로 묶는다.
   */
  const concurrency = Number(arg('concurrency')) || 3;
  const bdGate = createInterval(DELAY_MS);
  /*
   * 검증 한 건의 시간 상한. 클라이언트 자체 타임아웃(90s)이 있지만, 2026-08-11
   * 회차가 검증 도중 **아무 오류 없이 exit 0** 으로 죽었다 — 어딘가의 요청이
   * 핸들 없이 매달리면 이벤트 루프가 비면서 그렇게 된다. 여기서 한 번 더 감싸
   * 어떤 경우에도 그 키워드만 '수집 실패'로 치고 회차는 계속 가게 한다.
   */
  const VERIFY_DEADLINE_MS = 150_000;
  const withDeadline = (promise) => new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ serp: null, quotaBlocked: false, error: `응답 없음 ${VERIFY_DEADLINE_MS / 1000}s` }), VERIFY_DEADLINE_MS);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); resolve({ serp: null, quotaBlocked: false, error: String(err && err.message || err).slice(0, 60) }); },
    );
  });
  console.log(`  동시 검증        ${concurrency}건 (호출 간격 ${DELAY_MS}ms 는 공용으로 유지)`);

  const tierTotals = { top3: 0, page1: 0, 'golden-ratio': 0, 'page1-weak': 0, contested: 0 };
  const shortTopics = [];
  const rejectionLog = [];
  /*
   * 쇼핑 레인으로 라우팅한 행 — 이 보드의 오염이 아니라 쇼핑 커넥트의 소관이다
   * (사장님 지시 2026-08-17: "쇼핑은 이미 탭에 있는데 여기 있을 필요가 없죠").
   * 조용히 버리지 않는다 — 무엇이 어떤 실측 근거로 빠졌는지 원장에 남긴다.
   */
  const routedShopping = [];
  /*
   * 체크포인트 — 주제 하나 끝날 때마다 지금까지의 결과를 통째로 저장한다.
   *
   * 2026-08-11 회차: 20주제를 검증해 놓고 프로세스가 조용히 죽어 **크레딧 ~80건의
   * 결과가 전부 증발**했다(저장이 맨 끝에 한 번뿐이었다). 파일이 몇 십 KB 라
   * 매번 다시 쓰는 비용은 없는 것과 같다. partial 플래그로 "끝까지 못 간 회차"
   * 임을 밝힌다 — 발행기는 있는 행만 내보내므로 부분 보드도 빈손보다 낫다.
   */
  const saveBoard = (partial) => {
    if (!outPath) return;
    const covered = new Set(rows.map((r) => r.topic).filter((t) => t !== '주제 선택 안 함'));
    const board = {
      publishedAt: nowIso,
      generator: 'preemption-board-batch',
      partial,
      gate: DEFAULT_PREEMPTION_THRESHOLDS,
      targetPerTopic,
      tierTotals,
      topicsTotal: BLOG_TOPIC_COVERAGE.length,
      topicsWithRows: covered.size,
      topicVerdicts: topicVerdictTotals,
      verified: stats.verified,
      rejections: rejectionLog,
      routedShopping,
      rows,
    };
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    fs.writeFileSync(path.resolve(outPath), JSON.stringify(board, null, 2), 'utf8');
  };
  /** 주제 되짚기 결과. 과교정(정상 후보까지 라벨을 떼는 것)을 이 숫자로 감시한다. */
  const topicVerdictTotals = { supported: 0, reassigned: 0, unlabeled: 0, insufficient: 0 };
  const topicMoves = [];

  for (const [topic, take] of allocation) {
    if (blocked) break;
    const candidates = byTopic.get(topic).slice(0, take);

    /*
     * 주제 하나를 통째로 검증한 뒤 층을 나눈다. 한 건씩 즉시 판정하면
     * "1층이 모자라니 2층을 깐다"를 결정할 수가 없다.
     *
     * 검증은 **동시에** 돈다. 이 단계의 시간은 전부 Bright Data 응답을 기다리는
     * 것이고(회당 60분, 키워드당 두 번), 키워드끼리는 아무 상관이 없다.
     * 다만 호출 간격(DELAY_MS)은 공용 문지기가 지키므로 **초당 요청 수는 그대로**다 —
     * 기다리는 시간만 겹쳐서 사라진다.
     */
    const verified = await mapWithConcurrency(candidates, concurrency, async (candidate) => {
      if (blocked) return null;
      await bdGate();
      const { serp, quotaBlocked, error } = await withDeadline(verify(candidate.keyword, withStructure));
      if (quotaBlocked) {
        if (!blocked) console.log(`  쿼터 한도 도달 — 중단 (${stats.verified}건 처리됨)`);
        blocked = true;
        return null;
      }
      stats.verified += 1;
      if (!serp) {
        stats.failed += 1;
        console.log(`  ?? [${topic}] ${candidate.keyword} — 수집 실패 ${error}`);
        return null;
      }
      return {
        candidate,
        input: {
          keyword: candidate.keyword,
          searchVolume: candidate.searchVolume,
          documentCount: candidate.documentCount,
          serp,
          firstSeenAt: observedSince(firstSeen, addedKeywords, candidate.keyword),
          inRealtimeNow: realtimeState(realtime, candidate.keyword),
        },
      };
    }, (error, candidate) => {
      stats.failed += 1;
      console.log(`  ?? [${topic}] ${candidate.keyword} — ${String(error && error.message || error).slice(0, 70)}`);
    });
    // 순서는 후보 순 그대로다(mapWithConcurrency 가 보장한다) — 회차 간 대조를 위해서다.
    const allJudged = verified.filter(Boolean);
    if (allJudged.length === 0) continue;

    /*
     * 레인 분리 — 상품판 키워드는 **선발 전에** 뺀다.
     *
     * 선발 후에 빼면 상품 키워드가 자리를 차지한 채 빠져서 목표 미달이 된다.
     * 판정은 SERP 실측 3중 증거(쇼핑 구획·상품명 카드·스마트블록)만 쓴다 —
     * 8/17 월요일 회차 28행으로 캘리브레이션했고, 브랜드명 추측은 쓰지 않는다.
     */
    const laned = allJudged.map((e) => ({
      ...e,
      laneVerdict: judgePlatformLane({
        keyword: e.input.keyword,
        serpSections: e.input.serp ? (e.input.serp.sections || null) : null,
        productNames: e.input.serp && e.input.serp.meaning
          ? (e.input.serp.meaning.productNames || null) : null,
        intentLabel: e.candidate.intentLabel || null,
        adCount: e.input.serp ? (e.input.serp.adCount ?? null) : null,
        cpc: e.candidate.cpc ?? null,
      }),
    }));
    for (const routed of laned.filter((e) => e.laneVerdict.lane === 'shopping')) {
      routedShopping.push({
        topic,
        keyword: routed.input.keyword,
        searchVolume: routed.input.searchVolume ?? null,
        documentCount: routed.input.documentCount ?? null,
        reasons: routed.laneVerdict.laneReasons,
      });
      console.log(`  ~> [${topic}] ${routed.input.keyword} — 쇼핑 레인 (${routed.laneVerdict.laneReasons[0]})`);
    }
    const judgedInputs = laned.filter((e) => e.laneVerdict.lane === 'content');
    if (judgedInputs.length === 0) continue;

    const outcome = selectWithFill(judgedInputs.map((e) => e.input), { target: targetPerTopic });
    stats.passed += outcome.rows.length;
    stats.rejected += outcome.rejected.length;
    stats.undetermined += outcome.undetermined.length;
    for (const tier of TIER_ORDER) tierTotals[tier] += outcome.byTier[tier];
    if (outcome.short) shortTopics.push(`${topic}(${outcome.rows.length}/${targetPerTopic})`);

    // 탈락 사유를 남긴다. 첫 주행에서 45건이 왜 떨어졌는지 되짚을 수가 없어서
    // 게이트를 보정할 근거가 사라졌다. 같은 실수를 반복하지 않는다.
    for (const result of outcome.rejected) {
      /*
       * 탈락분도 실측 사실을 함께 남긴다.
       *
       * 사장님 지시: "조금 미달되더라도 그 키워드를 사용할 수 있다면, 참고할 수
       * 있다면 상관없다. 좋은 것만 가져오려면 돈과 시간이 너무 든다."
       * 그래서 버리지 않고 2군으로 내보낸다. 다만 화면에 나갈 이유는 **실측 사실**
       * 이어야 한다 — 임계값(내부 숫자)은 발행기가 걸러낸다.
       */
      const source = judgedInputs.find((e) => e.input.keyword === result.keyword);
      const serp = source ? source.input.serp : null;
      const candidate = source ? source.candidate : null;
      const settled = settleTopic(topic, result.keyword, serp);
      rejectionLog.push({
        topic: settled.topic,
        claimedTopic: topic,
        topicVerdict: settled.kind,
        topicReason: settled.reason,
        keyword: result.keyword,
        reason: result.failed[0] || '알 수 없음',
        undetermined: Boolean(result.undetermined),
        searchVolume: source ? source.input.searchVolume : null,
        documentCount: source ? source.input.documentCount : null,
        serp: serp ? {
          sampledTitles: serp.sampledTitles,
          exactTitleHits: serp.exactTitleHits,
          partialTitleHits: serp.partialTitleHits,
          medianDaysAgo: serp.medianDaysAgo,
          hasAiBriefing: serp.hasAiBriefing,
          /*
           * 탈락분에도 광고수를 싣는다. 2군은 "네이버 자리는 늦었지만 외부 유입으로
           * 쓸 밭" 인데, 그게 쓸 만한지 가르는 신호가 바로 광고다(광고주가 이미
           * 돈을 넣는 검색어인가). 통과분에만 실으면 2군이 판단 재료 없이 나간다.
           */
          adCount: serp.adCount ?? null,
        } : null,
        intentLabel: candidate?.intentLabel || '',
        trendLabel: candidate?.trendLabel || '',
        recencySummary: candidate?.recencySummary || '',
        demandAsOf: candidate?.demandAsOf || null,
        latestVsPeakPct: candidate?.latestVsPeakPct ?? null,
        measuredAt: candidate?.measuredAt || null,
      });
    }

    for (const result of outcome.rows) {
      const source = judgedInputs.find((e) => e.input.keyword === result.keyword);
      const serp = source ? source.input.serp : null;
      const candidate = source ? source.candidate : null;
      const settled = settleTopic(topic, result.keyword, serp);
      topicVerdictTotals[settled.kind] += 1;
      if (settled.kind !== 'supported' && settled.kind !== 'insufficient') {
        topicMoves.push(`${result.keyword}: ${topic} → ${settled.topic} (${settled.reason})`);
      }
      rows.push({
        keyword: result.keyword,
        topic: settled.topic,
        claimedTopic: topic,
        topicVerdict: settled.kind,
        topicReason: settled.reason,
        intentLabel: candidate?.intentLabel || '',
        briefingRisk: candidate?.briefingRisk || null,
        regulatoryLabel: candidate?.regulatoryLabel || '',
        trendShape: candidate?.trendShape || null,
        trendLabel: candidate?.trendLabel || '',
        inRealtimeNow: realtimeState(realtime, result.keyword),
        monthsToPeak: candidate?.monthsToPeak ?? null,
        timing: candidate?.timing || '',
        measuredAt: candidate?.measuredAt || null,
        demandAsOf: candidate?.demandAsOf || null,
        latestVsPeakPct: candidate?.latestVsPeakPct ?? null,
        monthsSincePeak: candidate?.monthsSincePeak ?? null,
        recencySummary: candidate?.recencySummary || '',
        tier: result.tier,
        tierLabel: result.tierLabel,
        openSlot: result.openSlot,
        searchVolume: source ? source.candidate.searchVolume : null,
        documentCount: source ? source.candidate.documentCount : null,
        evidence: result.evidence,
        serp: serp ? {
          sampledTitles: serp.sampledTitles,
          exactTitleHits: serp.exactTitleHits,
          partialTitleHits: serp.partialTitleHits,
          medianDaysAgo: serp.medianDaysAgo,
          hasAiBriefing: serp.hasAiBriefing,
          aiBriefingSourceCount: serp.aiBriefingSourceCount,
          adCount: serp.adCount ?? null,
          sections: serp.sections,
          sectionMarkerVersion: serp.sectionMarkerVersion ?? null,
          topTitles: serp.topTitles || [],
          meaning: serp.meaning || null,
        } : null,
        /*
         * SEO/홈판 제목 2종. 재료는 전부 이 회차의 실측이다 —
         * 같은 주제 형제 후보(검색량)·1페이지 제목·시기. 새 API 호출 없음.
         * 형제가 없으면 낚시 가드대로 generic 이 된다.
         */
        titles: buildBoardTitles(
          { keyword: result.keyword, seed: candidate?.seed, timing: candidate?.timing || '' },
          byTopic.get(topic),
          (serp && serp.topTitles) || [],
        ),
        /*
         * 애드센스(티스토리/구글) 적합 — 의도·CPC 실측 기반(platform-lane).
         * null 은 '재료 부족' 이지 '부적합' 이 아니다. 네이버 적합은 따로 안 싣는다 —
         * 이 보드의 통과 자체가 네이버 자리 실측이다.
         */
        adsenseFit: source ? source.laneVerdict.adsenseFit : null,
        adsenseReason: source ? source.laneVerdict.adsenseReason : '',
        firstSeenAt: observedSince(firstSeen, addedKeywords, result.keyword),
      });
    }
    const layerSummary = TIER_ORDER
      .filter((tier) => outcome.rows.some((r) => r.tier === tier))
      .map((tier) => `${tier} ${outcome.rows.filter((r) => r.tier === tier).length}`)
      .join(' + ');
    console.log(`  [${topic}] ${outcome.rows.length}/${targetPerTopic}건 — ${layerSummary || '없음'}${outcome.short ? '  ← 목표 미달' : ''}`);
    saveBoard(true);
  }

  const after = brightDataQuotaSnapshot();
  console.log('\n' + '-'.repeat(72));
  console.log(`검증 ${stats.verified}건 → 통과 ${stats.passed} · 탈락 ${stats.rejected} · 판정불가 ${stats.undetermined} · 수집실패 ${stats.failed} · 쇼핑 라우팅 ${routedShopping.length}`);
  /*
   * 주제 커버리지는 **진짜 주제만** 센다.
   * 되짚기로 라벨을 뗀 행('주제 선택 안 함')까지 세면 커버리지가 부풀려진다.
   */
  const coveredTopics = new Set(rows.map((r) => r.topic).filter((t) => t !== '주제 선택 안 함'));
  console.log(`통과 주제 ${coveredTopics.size}종 / 후보 있던 주제 ${byTopic.size}종`);
  console.log(`사용량 ${before.used} → ${after.used} (이번 실행 ${after.used - before.used}건) · 남은 ${after.remainingFree}`);

  /*
   * 주제 되짚기 결과를 매 회차 찍는다.
   *
   * 이 검사는 과교정이 위험이다 — 규칙이 세면 정상 후보의 라벨까지 뗀다.
   * 그런데 그건 조용히 일어나므로(라벨만 바뀌고 행 수는 그대로) 숫자로 안 찍으면
   * 아무도 모른다. 옮긴 것은 키워드까지 전부 적는다.
   */
  const settled = topicVerdictTotals;
  const judged = settled.supported + settled.reassigned + settled.unlabeled;
  console.log(`주제 되짚기 — 유지 ${settled.supported} · 옮김 ${settled.reassigned} · 주제 뗌 ${settled.unlabeled}`
    + ` · 판정 안 함(화면 못 읽음) ${settled.insufficient}`);
  if (judged > 0 && (settled.reassigned + settled.unlabeled) / judged > 0.3) {
    console.log('  ⚠️ 되짚기로 바뀐 비율이 30%를 넘는다. 고유 낱말표가 얇거나 규칙이 세다 — topic-evidence.ts 를 볼 것.');
  }
  for (const move of topicMoves.slice(0, 20)) console.log(`    ${move}`);
  if (topicMoves.length > 20) console.log(`    … 외 ${topicMoves.length - 20}건 (보드 JSON 의 topicVerdict 참조)`);

  if (stats.verified > 0 && stats.passed === 0) {
    console.log('\n⚠️ 통과 0건. 게이트가 과하게 조였거나 후보 품질이 낮다.');
    console.log('   preemption-gate 의 임계값은 인자로 뺐다 — 실측 결과로 보정할 것.');
  }

  saveBoard(false);
  if (outPath) console.log(`보드 저장: ${outPath} (${rows.length}행 · 완주)`);
}

/*
 * 조기 종료 감시.
 *
 * 2026-08-11 회차가 검증 도중 **아무 오류 없이 exit 0** 으로 죽었다 — 어딘가의
 * 대기가 핸들 없이 사라지면 이벤트 루프가 비고, 노드는 그걸 정상 종료로 친다.
 * CI 는 exit 0 을 성공으로 읽어 다음 스텝(발행)이 없는 파일을 찾다 죽었다.
 * beforeExit 는 루프가 빌 때 불린다 — main 이 안 끝났는데 불렸다면 그 죽음이다.
 * 시끄럽게 실패로 바꾼다. 체크포인트 덕에 결과는 마지막 주제까지 남아 있다.
 */
let mainFinished = false;
process.on('beforeExit', () => {
  if (mainFinished) return;
  mainFinished = true; // 재진입 방지
  console.error('\n⚠️ 프로세스가 일을 끝내기 전에 이벤트 루프가 비었다 — 매달린 요청이 증발한 것이다.');
  console.error('   지금까지의 결과는 체크포인트(--out)에 저장돼 있다. 이 회차는 실패로 기록한다.');
  process.exitCode = 1;
});

main().then(() => { mainFinished = true; }).catch((e) => { mainFinished = true; console.error('실패:', e.message); process.exit(1); });
