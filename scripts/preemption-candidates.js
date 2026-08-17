#!/usr/bin/env node
/**
 * 선점 배치에 넣을 **실측 후보**를 32개 주제 전부에서 뽑는다.
 *
 * 왜 발굴기(run-core-golden-ingest)를 안 쓰나:
 *   ① 발굴기가 아는 카테고리는 29개뿐이라 10개 주제가 통째로 0건이 된다.
 *   ② 발굴기 결과는 연예·트렌드로 쏠린다. 그건 실시간 검색어에 이미 있고
 *      사장님이 매일 따로 올리는 것과도 겹쳐서 값이 없다.
 *
 * 대신 이렇게 뽑는다 — 전부 실측이고, 조합해서 만들어 내지 않는다:
 *   주제 씨앗어 → 검색광고 연관키워드(실측 검색량) + 네이버 자동완성(실측)
 *              → 롱테일 우선 정렬 → 블로그 문서수 실측 → 비율로 거르기
 *
 * 유형은 대체로 **라벨로 붙인다**. 롱테일만 값진 게 아니다 —
 * 시즌성·에버그린·실시간 전부 쓸모가 다르므로 보여주고 화면에서 고르게 한다.
 * 유형 판정은 데이터랩 24개월 월별 실측 시계열이 한다(keyword-demand-shape).
 *
 * 거르는 것은 둘이다:
 *   ① **자리가 없는 것**(문서수 ≫ 검색량)
 *   ② **식어가는 것**(declining) — 자리가 있어도 사람이 안 온다.
 *      예전에는 이것도 라벨로만 붙였고, 그 결과 통과 26건 중 7건이 이미 꺾인
 *      키워드였다. 월 검색량은 지난 한 달의 총합이라 방향이 안 보인다.
 *
 * Bright Data 는 안 쓴다. SERP 판정은 다음 단계(preemption-board-batch.js)다.
 *
 * 사용:
 *   node scripts/preemption-candidates.js --topics=반려동물,건강·의학 --perTopic=12 --out=c.json
 *   node scripts/preemption-candidates.js --all --perTopic=10 --out=c.json
 */
'use strict';

require('ts-node/register/transpile-only');
require('./load-project-env').loadProjectEnv();

const fs = require('fs');
const path = require('path');
const {
  BLOG_TOPIC_COVERAGE,
  topicsWithoutCoverage,
  oversizedSeedTerms,
} = require('../src/utils/blog-topic-coverage');
const { createInterval, mapWithConcurrency } = require('../src/utils/rate-limited-pool');
const { titleCoverage, DEFAULT_SERP_THRESHOLDS: SERP_THRESHOLDS } = require('../src/utils/serp-winnability');
// 검색량 하한은 게이트가 단일 출처다. 여기 숫자를 따로 적으면 두 값이 갈라지고,
// 후보가 전부 게이트에서 탈락하는 걸 BD 크레딧을 태워서야 알게 된다.
const { DEFAULT_PREEMPTION_THRESHOLDS } = require('../src/utils/preemption-gate');
const { judgeCompleteness } = require('../src/utils/keyword-completeness');
const { analyzeKeywordSignals, sortWeight } = require('../src/utils/keyword-intent');
const { sharesSeedToken } = require('../src/utils/seed-drift');
const { judgeEphemeralKeyword, judgeRestrictedKeyword } = require('../src/utils/preemption-supply-guards');

function arg(name, fallback = '') {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 어절 수. 짧은 말은 이미 점령돼 있어 선점 대상이 아니다. */
const wordCount = (keyword) => String(keyword).trim().split(/\s+/).filter(Boolean).length;

/** 지금 실시간에 올라와 있는 것은 선점이 아니다. */
function loadRealtime(signalsPath) {
  if (!signalsPath || !fs.existsSync(signalsPath)) return new Set();
  try {
    const data = JSON.parse(fs.readFileSync(signalsPath, 'utf8'));
    const set = new Set();
    for (const lane of data.lanes || []) {
      for (const item of lane.items || []) {
        const keyword = String(item.keyword || item.title || '').replace(/\s+/g, '');
        if (keyword) set.add(keyword);
      }
    }
    return set;
  } catch {
    return new Set();
  }
}

async function main() {
  const uncovered = topicsWithoutCoverage();
  if (uncovered.length > 0) {
    console.error(`씨앗어가 없는 주제가 있다: ${uncovered.join(', ')}`);
    process.exit(2);
  }
  const oversized = oversizedSeedTerms();
  if (oversized.length > 0) {
    // 15자를 넘으면 검색광고가 잘라서 **다른 키워드의** 연관어를 준다. 조용히 틀린다.
    console.error(`15자를 넘는 씨앗어: ${oversized.map((o) => `${o.topic}/${o.term}`).join(', ')}`);
    process.exit(2);
  }

  const { EnvironmentManager } = require('../src/utils/environment-manager');
  const manager = typeof EnvironmentManager.getInstance === 'function'
    ? EnvironmentManager.getInstance()
    : new EnvironmentManager();
  const config = manager.getConfig();
  const searchAd = {
    accessLicense: config.naverSearchAdAccessLicense,
    secretKey: config.naverSearchAdSecretKey,
    customerId: config.naverSearchAdCustomerId,
  };
  const openApi = { clientId: config.naverClientId, clientSecret: config.naverClientSecret };
  if (!searchAd.accessLicense || !openApi.clientId) {
    console.error('네이버 검색광고·오픈 API 자격증명이 필요합니다.');
    process.exit(2);
  }

  const { getNaverSearchAdKeywordSuggestions, getNaverSearchAdKeywordVolume } = require('../src/utils/naver-searchad-api');
  const { getNaverAutocompleteKeywords } = require('../src/utils/naver-autocomplete');
  const { getNaverBlogDocumentCount, takeRecentBlogTitles } = require('../src/utils/naver-blog-api');
  const { analyzeDemandWithRecency } = require('../src/utils/keyword-demand-shape');

  const perTopic = Number(arg('perTopic')) || 10;
  const minWords = Number(arg('minWords')) || 3;
  const minVolume = Number(arg('minVolume')) || DEFAULT_PREEMPTION_THRESHOLDS.minSearchVolume;
  /*
   * 문서수 절대 상한 — BD 를 태울 가치가 없는 밭만 자른다. 자리 판정이 아니다.
   *
   * 30,000 이었다. 2026-08-11 SERP 실측에서 문서 47,509('윈도우11 설치비용')와
   * 40,560('미니멀라이프 반대')이 CONTESTED(자리 있음)로 나와서 올렸다.
   * 실측한 범위가 거기까지라 50,000 으로 둔다 — 그 위는 아직 안 재봤다.
   */
  const maxDocumentCount = Number(arg('maxDocumentCount')) || 50000;
  /*
   * 검색량 대비 문서수 하한 — 게이트와 **같은 값**을 쓴다.
   * 예전에 후보 하한과 게이트 하한이 갈라져 후보 30건이 전량 탈락했고,
   * 그걸 BD 크레딧 30건 태우고서야 알았다. 기본값은 게이트에서 가져온다.
   */
  const minRatio = Number(arg('minRatio')) || DEFAULT_PREEMPTION_THRESHOLDS.minVolumeToDocumentRatio;
  const perSeed = Number(arg('perSeed')) || 3;
  /*
   * 문서수를 몇 배수까지 훑을 것인가.
   * 비율을 만족하는 후보는 드물다(실측 304건 중 11건). 좁게 훑으면 주제당 0건이
   * 되므로 넉넉히 재고 조건에 맞는 것만 담는다. 문서수 조회는 무료다.
   */
  // 무료 선별이 붙어 더 깊이 훑어도 BD 비용이 안 는다. 병렬화로 시간도 여유가 생겼다.
  const scanWidth = Number(arg('scanWidth')) || 28;
  const secondarySeeds = Number(arg('secondarySeeds')) || 12;
  const outPath = arg('out') || 'preemption-candidates.json';
  /** 탈락분까지 포함한 실측 원장. 게이트 하한을 숫자로 고르기 위한 것이다. */
  const measureLogPath = arg('measureLog');
  const measureLog = measureLogPath ? [] : null;
  const realtime = loadRealtime(arg('signals'));

  const topics = hasFlag('all')
    ? BLOG_TOPIC_COVERAGE.map((e) => e.topic)
    : arg('topics').split(',').map((t) => t.trim()).filter(Boolean);
  if (topics.length === 0) {
    console.error('--topics=주제1,주제2 또는 --all 이 필요합니다.');
    process.exit(2);
  }

  console.log('='.repeat(76));
  console.log(`선점 후보 발굴 — ${topics.length}개 주제 · 주제당 최대 ${perTopic}건`);
  console.log(`거르기: 검색량 ${minVolume} 이상 · 문서수 절대상한 ${maxDocumentCount.toLocaleString('ko-KR')} · 씨앗당 최대 ${perSeed}건`
    + (minRatio > 0 ? ` · 비율 ${minRatio} 이상` : ' · 비율 컷 없음'));
  console.log('자리 유무 판정은 다음 단계인 Bright Data SERP 가 한다 — 여기서 미리 버리지 않는다.');
  console.log('비율은 최소선이다 — 문서수가 검색량보다 많으면 뺀다. 자리의 최종 판정은 SERP 가 한다.');
  console.log(`유형: 데이터랩 30일 실측 시계열로 에버그린·떡상·단발성·시즌성 분류 · 롱테일 기준 어절 ${minWords}개`);
  console.log('='.repeat(76));

  const byTopic = {};
  const report = [];
  let trendWarned = false;

  /*
   * 주제를 **동시에** 훑는다. 주제끼리는 아무 상관이 없는데 예전에는 1번이 끝나야
   * 2번을 시작해서 32주제에 63분이 걸렸다(실측). 그 시간은 계산이 아니라 네트워크
   * 왕복을 하나씩 기다린 것이다 — 주제당 약 190회 호출.
   *
   * 그냥 동시에 돌리면 초당 호출이 배로 뛰어 네이버가 429 를 준다. 그래서 호출
   * 사이 sleep 을 **API 별 공용 간격기**로 바꿨다. 몇 개가 동시에 돌든 그 API 로
   * 나가는 호출은 정해진 간격 이상 벌어진다 — 속도 제한은 그대로인데 기다리는
   * 시간이 겹쳐 사라진다. 간격 값은 예전 sleep 과 같다.
   */
  /*
   * 6 으로 둔다. 동시 실행을 올려도 **초당 호출은 안 는다** — 아래 공용 간격기가
   * API 별 속도를 묶기 때문이다. 늘어나는 것은 기다리는 시간이 겹치는 정도뿐이라,
   * 이 배치처럼 지연이 지배적인 곳에서는 그만큼 그대로 빨라진다.
   * 천장은 간격기다: 문서수 120ms → 초당 8.3건이 이 회차의 하한 시간을 정한다.
   */
  const concurrency = Number(arg('concurrency')) || 6;
  const adGate = createInterval(220);
  const autoGate = createInterval(150);
  const docGate = createInterval(120);
  const trendGate = createInterval(150);
  console.log(`동시 처리: 주제 ${concurrency}개 (API 별 호출 간격은 공용으로 유지)`);

  const perTopicResults = await mapWithConcurrency(topics, concurrency, async (topic) => {
    const coverage = BLOG_TOPIC_COVERAGE.find((e) => e.topic === topic);
    if (!coverage) { console.log(`  ?? ${topic} — 커버리지 표에 없음`); return null; }

    const started = Date.now();
    const incompleteLog = [];
    const decliningLog = [];
    const driftLog = [];
    /** BD 태우기 전에 무료로 걸러낸 것. 예산을 어디에 아꼈는지 남긴다. */
    const preScreened = [];
    /** 유통기한 며칠짜리 일정 조회. 자리가 비어 있어도 글이 바로 부패한다. */
    const ephemeralLog = [];
    let expansionWarned = false;

    // ── 1) 확장 씨앗을 넓힌다 ──────────────────────────────────────────
    // 검색광고 연관어는 **공백을 지운 1어절**로만 온다("강아지사료"). 그래서
    // 연관어 자체는 롱테일이 될 수 없고, 다음 단계의 씨앗으로만 쓴다.
    const expansionSeeds = new Set(coverage.seedTerms);
    for (const seed of coverage.seedTerms) {
      try {
        const suggestions = await getNaverSearchAdKeywordSuggestions(searchAd, seed, 200);
        suggestions
          .filter((row) => Number(row.totalSearchVolume || 0) >= minVolume)
          .slice(0, secondarySeeds)
          .forEach((row) => {
            const keyword = String(row.keyword || '').trim();
            if (keyword && keyword.replace(/\s+/g, '').length <= 15) expansionSeeds.add(keyword);
          });
      } catch (error) {
        console.log(`  !! ${topic}/${seed} 연관어 — ${String(error.message).slice(0, 70)}`);
      }
      await adGate();
    }

    // ── 2) 자동완성으로 롱테일 문장을 받는다 ────────────────────────────
    // 자동완성은 사람이 실제로 치는 형태(띄어쓰기 포함)로 돌려준다.
    // 여기가 "어디에서도 찾기 힘든" 키워드가 나오는 유일한 지점이다.
    const phrases = new Map();
    for (const seed of expansionSeeds) {
      try {
        const expansions = await getNaverAutocompleteKeywords(seed, openApi);
        for (const phrase of expansions) {
          const keyword = String(phrase || '').replace(/\s+/g, ' ').trim();
          if (!keyword || phrases.has(keyword)) continue;
          /*
           * 완결성 검사 — 여기서 조각을 버린다.
           *
           * 자동완성은 사람이 친 것을 그대로 주므로 검색어로는 전부 진짜다.
           * 그런데 '강아지 사료 대신', '고양이 화장실 삽' 같은 건 글 제목이 못 된다.
           * 검색량·문서수 어떤 숫자로도 안 갈리고, 실측 30건을 하나씩 읽고서야 보였다.
           */
          const completeness = judgeCompleteness(keyword, coverage.seedIntents);
          if (!completeness.complete) {
            incompleteLog.push(`${keyword} — ${completeness.reason}`);
            continue;
          }
          /*
           * 주제 이탈 검사.
           *
           * 자동완성은 몇 단계 확장되면 주제를 벗어난다. 실측에서
           * 씨앗 '예방접종 비용' 이 **반려동물** 주제에서 '풍진 예방접종 비용'
           * (사람 예방접종)을 물어왔고, '베게' 는 맞춤법 질문으로 샜다.
           *
           * 씨앗의 어절 중 최소 하나를 키워드가 그대로 갖고 있어야 한다.
           * 자동완성은 원래 씨앗을 앞에 두고 늘리므로, 이걸 못 지키면
           * 이미 다른 주제로 건너간 것이다.
           */
          // 규칙은 seed-drift.ts 가 단일 출처다(테스트가 실측 오염 사례를 고정한다).
          if (!sharesSeedToken(keyword, seed)) {
            driftLog.push(`${keyword} — 씨앗 '${seed}' 와 공유 어절 없음`);
            continue;
          }
          // 어절 수·실시간 여부로는 **거르지 않는다**. 라벨로만 남긴다 —
          // 롱테일만 값진 게 아니고, 실시간도 쓸 데가 있다.
          phrases.set(keyword, {
            keyword,
            seed,
            longTail: wordCount(keyword) >= minWords,
            inRealtime: realtime.has(keyword.replace(/\s+/g, '')),
          });
        }
      } catch (error) {
        /*
         * 씨앗 하나가 실패해도 주제 전체를 버리지 않는다.
         * 다만 **조용히 삼키지는 않는다** — 여기 catch 가 코드 오류(정의되지 않은
         * 변수 참조)를 먹어서 롱테일이 1,800건에서 8건으로 떨어진 걸 한참 뒤에 알았다.
         */
        if (!expansionWarned) {
          console.log(`  !! 자동완성 처리 실패 — ${String(error && error.message || error).slice(0, 120)}`);
          expansionWarned = true;
        }
      }
      await autoGate();
    }

    // ── 3) 롱테일 문장들의 검색량 실측 ──────────────────────────────────
    /*
     * 씨앗별로 돌아가며 표본을 뽑는다.
     *
     * 앞에서부터 자르면 첫 씨앗의 자동완성이 표본을 다 채운다. 완결성 규칙을
     * 블랙리스트로 바꾸면서 통과 문구가 144 → 1,800 으로 늘었더니, 96개 표본이
     * 전부 한 씨앗에서 나와 후보가 1건으로 떨어졌다. 씨앗을 5개 넣은 의미가
     * 사라지는 것은 앞서 한 번 겪은 문제다.
     */
    const bySeedQueue = new Map();
    for (const row of phrases.values()) {
      if (!bySeedQueue.has(row.seed)) bySeedQueue.set(row.seed, []);
      bySeedQueue.get(row.seed).push(row);
    }
    const phraseList = [];
    const queues = [...bySeedQueue.values()];
    /*
     * 검색량을 실측할 표본 수.
     *
     * 기본값이 perTopic 에 묶여 있었다. 그래서 씨앗을 205 → 275 로 늘렸을 때
     * 발굴 문장은 29,175개가 됐는데 실측한 것은 주제당 72개(전체의 7.9%)뿐이었고,
     * 늘린 씨앗이 결과를 못 바꿨다 — 씨앗을 늘릴수록 각 씨앗의 몫만 얇아진다.
     * 검색량 조회는 무료다(5개씩 묶어 보낸다). 표본은 따로 정한다.
     */
    const sampleCap = Number(arg('sampleCap')) || perTopic * 20;
    for (let round = 0; phraseList.length < sampleCap; round += 1) {
      let added = 0;
      for (const queue of queues) {
        if (round >= queue.length) continue;
        phraseList.push(queue[round]);
        added += 1;
        if (phraseList.length >= sampleCap) break;
      }
      if (added === 0) break;
    }
    const volumes = new Map();
    /*
     * CPC·광고 경쟁도는 같은 응답에 이미 실려 온다 — 예전엔 검색량만 꺼내고
     * 버렸다. 애드센스 레인 판정(platform-lane)이 CPC 실측을 근거로 쓰므로
     * 이제 보존한다. 추가 호출·쿼터 소모 없음.
     */
    const adSignals = new Map();
    for (let i = 0; i < phraseList.length; i += 5) {
      const chunk = phraseList.slice(i, i + 5).map((row) => row.keyword);
      try {
        const rows = await getNaverSearchAdKeywordVolume(searchAd, chunk);
        for (const row of rows) {
          const total = Number(row.pcSearchVolume || 0) + Number(row.mobileSearchVolume || 0);
          const compact = String(row.keyword).replace(/\s+/g, '');
          if (total > 0) volumes.set(compact, total);
          adSignals.set(compact, {
            cpc: Number.isFinite(Number(row.monthlyAveCpc)) && Number(row.monthlyAveCpc) > 0
              ? Number(row.monthlyAveCpc) : null,
            competition: row.competition || null,
          });
        }
      } catch { /* 측정 실패분은 후보에서 빠진다 — 지어내지 않는다 */ }
    }

    /*
     * 씨앗당 상한을 둔다.
     *
     * 자동완성이 풍성한 씨앗 하나가 결과를 독식한다. 실측: 반려동물 10건 중
     * 8건이 '강아지 사료', 건강·의학은 10건 전부가 '허리 통증'에서 나왔다.
     * 씨앗을 5개 넣은 의미가 사라지고, 한 주제가 한 소재로만 채워진다.
     */
    const bySeed = new Map();
    const shortlist = phraseList
      .map((row) => ({ ...row, searchVolume: volumes.get(row.keyword.replace(/\s+/g, '')) ?? null }))
      .filter((row) => (row.searchVolume || 0) >= minVolume)
      .sort((a, b) => (a.searchVolume || 0) - (b.searchVolume || 0))  // 롱테일 우선
      .filter((row) => {
        const used = bySeed.get(row.seed) || 0;
        if (used >= perSeed) return false;
        bySeed.set(row.seed, used + 1);
        return true;
      })
      .slice(0, perTopic * scanWidth);

    // ── 4) 문서수 실측 → 비율로 자리 가능성 1차 판정 ────────────────────
    const measured = [];
    for (const row of shortlist) {
      /*
       * 필요한 만큼 찾으면 멈춘다 — 문서수 조회를 아끼기 위해서다.
       * 다만 원장을 뜰 때는 끝까지 잰다. 통과분만 보고 하한을 정하면
       * 잘라낸 쪽이 어디에 몰려 있는지 모른 채 고르게 된다.
       */
      if (measured.length >= perTopic && !measureLog) break;
      /*
       * 유통기한 컷 — 문서수 조회(쿼터) 전에 자른다.
       *
       * 8/14 회차 통과 35행 중 5행이 무대인사 일정·재방송 편성표·서버 점검류였다.
       * 씨앗은 정리했지만 자동완성이 같은 부류를 도로 만들어 온다('스파이더맨
       * 무대인사 일정'은 확장 산물이었다). 그래서 씨앗과 후보 양쪽에서 막는다.
       */
      const rot = judgeEphemeralKeyword(row.keyword);
      if (rot.ephemeral) {
        ephemeralLog.push(`${row.keyword} — ${rot.reason}`);
        continue;
      }
      // 규제 컷 — '무료 영화 사이트'류는 자리가 있어도 쓸 수 없는 글이 된다.
      const restricted = judgeRestrictedKeyword(row.keyword);
      if (restricted.ephemeral) {
        ephemeralLog.push(`${row.keyword} — ${restricted.reason}`);
        continue;
      }
      /*
       * 문서수는 broad 매치 실측만 싣는다. 참고용이고 여기서 거르지 않는다.
       *
       * 정확구문 문서수를 쓰려다 전량 측정 실패했다. measure-dc 의 exact-phrase
       * 모드는 API 로 증명할 수 없어 스크랩 경로를 타는데 그게 안 붙는다.
       * 그런데 애초에 그 일은 다음 단계인 Bright Data SERP 가 한다 —
       * **자리가 있느냐**는 검색결과 제목을 봐야 알 수 있고(정면 대응 몇 건),
       * broad 문서수로는 롱테일 문구의 자리를 판단할 수 없다.
       * 그래서 여기서 문서수로 거르면 자리 있는 후보까지 통째로 버린다.
       */
      let documentCount = null;
      try {
        documentCount = await getNaverBlogDocumentCount(row.keyword, { config: openApi });
      } catch {
        documentCount = null;
      }
      await docGate();
      if (documentCount !== null && !Number.isFinite(documentCount)) documentCount = null;

      /*
       * **Bright Data 를 태우기 전에 무료로 걸러낸다.**
       *
       * 문서수를 잴 때 상위 제목 10개가 같이 온다(display=10, 쿼터는 같다).
       * 거기서 이미 정면으로 다룬 글이 2건 이상이면 SERP 판정도 거의 확실히 탈락이다.
       * 실측(2026-08-12, 26건): 무료 판정이 BD 판정과 88% 일치했고, 어긋난 3건은
       * 전부 "무료는 통과·BD는 탈락" 방향이었다 — **좋은 것을 잘못 버리지는 않는다.**
       * 무료로 정면 2건 이상이라고 본 13건은 13건 모두 BD 에서도 탈락했다.
       *
       * 이게 왜 중요한가: 지난 회차는 107건을 태워 27건만 통과했다(25%). 예산 344 중
       * 214만 쓰고도 후보가 모자라 못 채웠다. 여기서 미리 버리면 같은 예산으로
       * **자리가 있을 만한 것만** 태울 수 있다.
       *
       * 제목을 못 받았으면(캐시 적중 등) 거르지 않는다 — 못 본 것을 나쁜 것으로 치지 않는다.
       */
      /*
       * 황금 비율(검색량 > 문서수)은 무료 선별을 **건너뛴다** — 사장님 최종 기준
       * (2026-08-12): "검색량이 문서수보다 높은 키워드들이야, 다 통과시켜서 보여줘."
       * 정면 글이 있어도 게이트가 golden-ratio 층으로 전부 통과시키므로, 여기서
       * 걸러 버리면 그 층에 도달할 후보가 없어진다.
       */
      const goldenRatio = documentCount !== null && Number(row.searchVolume) > documentCount;
      const freeTitles = takeRecentBlogTitles(row.keyword);
      if (!goldenRatio && Array.isArray(freeTitles) && freeTitles.length >= 5) {
        const facing = freeTitles.filter(
          (title) => titleCoverage(title, row.keyword) >= SERP_THRESHOLDS.exactCoverage,
        ).length;
        if (facing >= 2) {
          preScreened.push(`${row.keyword} — 무료 판정 정면 ${facing}건`);
          continue;
        }
      }

      /*
       * 게이트 캘리브레이션용 원장. --measureLog 를 줄 때만 남긴다.
       *
       * 지금은 **통과한 것만** 저장돼서 떨어진 것이 어디에 몰려 있는지 볼 수가 없다.
       * 그래서 "비율 하한을 얼마로 둘 것인가" 를 느낌으로 정하게 된다.
       * 재 놓고 고르려면 탈락분의 분포가 있어야 한다. 문서수 조회는 이미 끝났으므로
       * 여기서 받아 적는 데 드는 추가 비용은 없다.
       */
      if (measureLog) {
        measureLog.push({
          topic,
          keyword: row.keyword,
          searchVolume: row.searchVolume ?? null,
          documentCount,
          ratio: documentCount ? (row.searchVolume || 0) / documentCount : null,
        });
      }

      /*
       * 문서수 상한 — 여기서 걸러야 BD 크레딧이 안 샌다.
       *
       * 상한이 없어서 dc 613,600(검색량의 4,720배)짜리가 후보로 올라왔다.
       * 그런 건 자리가 있을 수 없는데 SERP 를 태울 참이었다. 실측 30건 중
       * 18건이 dc 10만 이상이었다 — 그대로 돌렸으면 크레딧의 60%가 헛돈다.
       */
      if (documentCount !== null && documentCount > maxDocumentCount) continue;
      /*
       * 비율 컷(게이트가 단일 출처). 2026-08-11 에 다시 켰다 — 기본 1.
       *
       * 잠깐 껐던 근거는 "버린 롱테일 36건을 SERP 로 재보니 18건에 자리가 있더라"
       * 였는데, 그 실측이 무효였다. 자리를 잰 titleCoverage 가 붙여 쓴 검색어를
       * 전부 '정면 0건'으로 냈기 때문이다. 사장님 기준으로 돌아간다 —
       * 검색량이 높고 문서수가 적어야 황금키워드다.
       */
      // 문서수 0 은 무경쟁이 아니라 측정 실패다(게이트와 같은 판단).
      if (documentCount === 0) continue;
      if (documentCount !== null
        && (row.searchVolume || 0) / documentCount < minRatio) {
        continue;
      }
      /*
       * 유형 판정: 데이터랩 **12개월 월별** 실측 시계열.
       *
       * 30일 일별로 받으면 저볼륨 롱테일은 1~3포인트뿐이라(데이터랩이 검색 없는
       * 날을 통째로 뺀다) 전부 판정불가가 된다. 실측으로 확인했다.
       * 게다가 시즌성은 30일로는 원리상 판별이 불가능하다.
       */
      let trend = { type: 'unknown', label: '', evidence: '', monthsToPeak: null, timing: '' };
      /*
       * 이 숫자가 **언제쩍 결과인지**. 검색량은 지난 한 달의 총합이라 화면에서는
       * 정점이 1년 전인 키워드와 지금이 정점인 키워드가 똑같아 보인다.
       * 실측 시계열의 마지막 달과 정점 대비 비율을 같이 싣는다(단순 나눗셈).
       */
      let recency = { asOf: null, latestVsPeakPct: null, monthsSincePeak: null, summary: '' };
      try {
        const analyzed = await analyzeDemandWithRecency(row.keyword, openApi);
        const shape = analyzed.shape;
        recency = analyzed.recency;
        /*
         * monthsToPeak·timing 을 여기서 안 옮기면 계산해 놓고 버리는 것이다 —
         * 배치 로더(preemption-board-batch.js loadCandidates)가 읽을 원본이
         * 이 행뿐이라, 여기서 떨어뜨리면 보드의 시기 표시가 통째로 빈다.
         * 2026-08-14 회차 34행 전부 timing='' 이 그 결과였다.
         */
        trend = {
          type: shape.shape,
          label: shape.label,
          evidence: shape.evidence,
          monthsToPeak: Number.isFinite(shape.monthsToPeak) ? shape.monthsToPeak : null,
          timing: shape.timing || '',
        };
        /*
         * 식어가는 키워드는 자리가 있어도 내보내지 않는다.
         *
         * 여기까지는 유형을 **라벨로만** 붙이고 거르지 않았다. 그 결과 통과한 26건 중
         * 7건이 이미 꺾인 것이었다 — '브롤 스타즈 서버 점검 시간'은 월 검색량 120이
         * 멀쩡해 보이지만 실측 시계열은 서버 장애 한 번에 튄 스파이크 하나였고,
         * '냥코 계정 복구'는 정점이 25개월 전이다. 월 검색량은 지난 한 달의 총합이라
         * 방향이 안 보인다. 초보자가 이런 걸 받아 글을 쓰면 자리가 있어도 사람이 안 온다.
         *
         * 판정은 1년 전 같은 기간과 비교한다(keyword-demand-shape). 그래서 시즌성
         * 키워드가 비수기라는 이유로 하락으로 몰리지 않는다.
         */
        if (shape.shape === 'declining') {
          decliningLog.push(`${row.keyword} — ${shape.evidence}`);
          continue;
        }
      } catch (error) {
        // 조용히 삼키면 "왜 전부 미상인지"를 또 못 찾는다. 한 번만 찍는다.
        if (!trendWarned) {
          console.log(`  !! 유형 판정 실패 — ${String(error && error.message || error).slice(0, 120)}`);
          trendWarned = true;
        }
      }
      await trendGate();

      // 원장을 뜨느라 끝까지 재는 중이어도, 내보내는 후보 수는 평소와 같게 둔다.
      if (measured.length >= perTopic) continue;

      const signals = analyzeKeywordSignals(row.keyword);
      measured.push({
        keyword: row.keyword,
        intent: signals.intent.intent,
        intentLabel: signals.intent.intentLabel,
        briefingRisk: signals.briefing.risk,
        briefingReason: signals.briefing.reason,
        regulatoryRisk: signals.regulatory.risk,
        regulatoryLabel: signals.regulatory.label,
        searchVolume: row.searchVolume,
        documentCount,
        seed: row.seed,
        longTail: row.longTail,
        inRealtime: row.inRealtime,
        trendType: trend.type,
        trendShape: trend.type,
        trendLabel: trend.label,
        trendEvidence: trend.evidence,
        monthsToPeak: trend.monthsToPeak,
        timing: trend.timing,
        // 검색량 응답에 같이 온 실측 — 애드센스 레인 판정 재료. 없으면 null.
        cpc: adSignals.get(row.keyword.replace(/\s+/g, ''))?.cpc ?? null,
        adCompetition: adSignals.get(row.keyword.replace(/\s+/g, ''))?.competition ?? null,
        // 언제 잰 값인지. 없으면 화면이 "언제쩍 숫자인지" 를 말할 수 없다.
        measuredAt: new Date().toISOString(),
        demandAsOf: recency.asOf,
        latestVsPeakPct: recency.latestVsPeakPct,
        monthsSincePeak: recency.monthsSincePeak,
        recencySummary: recency.summary,
      });
    }

    /*
     * 구매 검토형을 앞에, AI 브리핑에 잠식될 것을 뒤로 민다.
     * 가중치는 내부 정렬에만 쓰고 화면에 내보내지 않는다.
     */
    measured.sort((a, b) => sortWeight(analyzeKeywordSignals(a.keyword)) - sortWeight(analyzeKeywordSignals(b.keyword)));
    const seconds = Math.round((Date.now() - started) / 1000);
    console.log(
      `  ${measured.length > 0 ? 'OK' : '00'} ${topic.padEnd(15)}`
      + ` 씨앗 ${String(expansionSeeds.size).padStart(3)} → 완결 ${String(phrases.size).padStart(4)}(조각 ${incompleteLog.length}·이탈 ${driftLog.length} 제외)`
      + ` → 수요통과 ${String(shortlist.length).padStart(3)}(식음 ${decliningLog.length}·부패 ${ephemeralLog.length} 제외) → 무료선별 ${String(preScreened.length).padStart(3)} 제외 → 후보 ${String(measured.length).padStart(3)}건  ${seconds}초`,
    );
    return {
      topic,
      measured,
      report: {
      topic, seeds: expansionSeeds.size, phrases: phrases.size,
      incomplete: incompleteLog.length, drift: driftLog.length, shortlist: shortlist.length,
      declining: decliningLog.length, decliningSamples: decliningLog.slice(0, 5),
      ephemeral: ephemeralLog.length, ephemeralSamples: ephemeralLog.slice(0, 5),
      driftSamples: driftLog.slice(0, 5),
      rows: measured.length, seconds,
      incompleteSamples: incompleteLog.slice(0, 8),
      },
    };
  }, (error, topic) => {
    // 주제 하나가 죽어도 회차를 버리지 않는다 — 예전 루프도 그렇게 돌았다.
    console.log(`  !! ${topic} — ${String(error && error.message || error).slice(0, 90)}`);
  });

  /*
   * 결과는 **주제 입력 순서 그대로** 담는다.
   * 콜백 안에서 byTopic 에 바로 쓰면 키 순서가 완료 순이 되어, 회차마다 순서가
   * 바뀌고 다음 단계(예산 배분)가 다른 결과를 낸다.
   */
  for (const result of perTopicResults) {
    if (!result) continue;
    if (result.measured.length > 0) byTopic[result.topic] = result.measured;
    report.push(result.report);
  }

  const total = Object.values(byTopic).reduce((sum, rows) => sum + rows.length, 0);
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(path.resolve(outPath), JSON.stringify({
    generatedAt: new Date().toISOString(),
    filters: { minWords, minVolume },
    report,
    topics: byTopic,
  }, null, 1), 'utf8');

  if (measureLog) {
    fs.mkdirSync(path.dirname(path.resolve(measureLogPath)), { recursive: true });
    fs.writeFileSync(path.resolve(measureLogPath), JSON.stringify({
      generatedAt: new Date().toISOString(),
      note: '문서수까지 실측한 전량(탈락분 포함). 게이트 하한을 숫자로 고르기 위한 원장이다.',
      thresholdsAtRun: { minVolume, minRatio, maxDocumentCount },
      rows: measureLog,
    }, null, 1), 'utf8');
    console.log(`실측 원장 ${measureLog.length}건 → ${measureLogPath}`);
  }

  console.log('-'.repeat(76));
  console.log(`후보 ${total}건 / 주제 ${Object.keys(byTopic).length}종 → ${outPath}`);
  const all = Object.values(byTopic).flat();
  if (all.length > 0) {
    const byType = {};
    all.forEach((r) => { byType[r.trendType || 'unknown'] = (byType[r.trendType || 'unknown'] || 0) + 1; });
    console.log('유형 분포: ' + Object.entries(byType).map(([t, n]) => `${t} ${n}`).join(' · '));
    console.log(`롱테일 ${all.filter((r) => r.longTail).length}건 · 실시간 노출 중 ${all.filter((r) => r.inRealtime).length}건`);
    const byIntent = {};
    all.forEach((r) => { byIntent[r.intentLabel || '?'] = (byIntent[r.intentLabel || '?'] || 0) + 1; });
    console.log('검색 의도: ' + Object.entries(byIntent).map(([k, n]) => `${k} ${n}`).join(' · '));
    const risky = all.filter((r) => r.briefingRisk === 'high').length;
    const reg = all.filter((r) => r.regulatoryRisk).length;
    console.log(`AI 잠식 위험 높음 ${risky}건 · 규제 주의 ${reg}건`);
  }
  const empty = report.filter((r) => r.rows === 0);
  if (empty.length > 0) {
    console.log(`후보 0건 주제 ${empty.length}종: ${empty.map((r) => r.topic).join(', ')}`);
    console.log('  → 씨앗어를 늘리거나 --minVolume/--minRatio 를 낮춰야 한다. 이 주제는 화면이 빈다.');
  }
}

main().catch((e) => { console.error('실패:', e.message); process.exit(1); });
