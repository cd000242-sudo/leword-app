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
 * 유형은 거르지 않고 **라벨로 붙인다**. 롱테일만 값진 게 아니다 —
 * 시즌성·에버그린·실시간·떡상 전부 쓸모가 다르므로 다 보여주고 화면에서 고르게 한다.
 * 유형 판정은 데이터랩 30일 실측 시계열이 한다(trend-type-classifier).
 *
 * 거르는 것은 하나뿐이다: **자리가 없는 것**(문서수 ≫ 검색량).
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
// 검색량 하한은 게이트가 단일 출처다. 여기 숫자를 따로 적으면 두 값이 갈라지고,
// 후보가 전부 게이트에서 탈락하는 걸 BD 크레딧을 태워서야 알게 된다.
const { DEFAULT_PREEMPTION_THRESHOLDS } = require('../src/utils/preemption-gate');
const { judgeCompleteness } = require('../src/utils/keyword-completeness');
const { analyzeKeywordSignals, sortWeight } = require('../src/utils/keyword-intent');

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
  const { getNaverBlogDocumentCount } = require('../src/utils/naver-blog-api');
  const { analyzeDemandShape } = require('../src/utils/keyword-demand-shape');

  const perTopic = Number(arg('perTopic')) || 10;
  const minWords = Number(arg('minWords')) || 3;
  const minVolume = Number(arg('minVolume')) || DEFAULT_PREEMPTION_THRESHOLDS.minSearchVolume;
  // 실측 경계: 쓸 만한 후보는 dc 1,549~26,064 · 자리 없는 것은 30,188 이상이었다.
  const maxDocumentCount = Number(arg('maxDocumentCount')) || 30000;
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
  const scanWidth = Number(arg('scanWidth')) || 16;
  const secondarySeeds = Number(arg('secondarySeeds')) || 8;
  const outPath = arg('out') || 'preemption-candidates.json';
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
  console.log(`거르기: 검색량 ${minVolume} 이상 · 문서수 ≤ 검색량÷${minRatio} · 절대상한 ${maxDocumentCount.toLocaleString('ko-KR')} · 씨앗당 최대 ${perSeed}건`);
  console.log('자리 유무 판정은 다음 단계인 Bright Data SERP 가 한다 — 여기서 미리 버리지 않는다.');
  console.log(`유형: 데이터랩 30일 실측 시계열로 에버그린·떡상·단발성·시즌성 분류 · 롱테일 기준 어절 ${minWords}개`);
  console.log('='.repeat(76));

  const byTopic = {};
  const report = [];
  let trendWarned = false;

  for (const topic of topics) {
    const coverage = BLOG_TOPIC_COVERAGE.find((e) => e.topic === topic);
    if (!coverage) { console.log(`  ?? ${topic} — 커버리지 표에 없음`); continue; }

    const started = Date.now();
    const incompleteLog = [];
    const driftLog = [];
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
      await sleep(220);
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
          const seedTokens = String(seed).split(/\s+/).filter((t) => t.length >= 2);
          const kwCompact = keyword.replace(/\s+/g, '');
          const shares = seedTokens.length === 0
            || seedTokens.some((token) => kwCompact.includes(token.replace(/\s+/g, '')));
          if (!shares) {
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
      await sleep(150);
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
    const sampleCap = perTopic * 12;
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
    for (let i = 0; i < phraseList.length; i += 5) {
      const chunk = phraseList.slice(i, i + 5).map((row) => row.keyword);
      try {
        const rows = await getNaverSearchAdKeywordVolume(searchAd, chunk);
        for (const row of rows) {
          const total = Number(row.pcSearchVolume || 0) + Number(row.mobileSearchVolume || 0);
          if (total > 0) volumes.set(String(row.keyword).replace(/\s+/g, ''), total);
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
      if (measured.length >= perTopic) break;
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
      await sleep(120);
      if (documentCount !== null && !Number.isFinite(documentCount)) documentCount = null;

      /*
       * 문서수 상한 — 여기서 걸러야 BD 크레딧이 안 샌다.
       *
       * 상한이 없어서 dc 613,600(검색량의 4,720배)짜리가 후보로 올라왔다.
       * 그런 건 자리가 있을 수 없는데 SERP 를 태울 참이었다. 실측 30건 중
       * 18건이 dc 10만 이상이었다 — 그대로 돌렸으면 크레딧의 60%가 헛돈다.
       */
      if (documentCount !== null && documentCount > maxDocumentCount) continue;
      /*
       * 검색량보다 문서가 많으면 포화된 밭이다.
       *
       * 절대 상한(3만)만 두었더니 검색량 140 / 문서 29,721(비율 0.005) 같은 것이
       * 후보로 올라와 1층까지 갔다. "상위 3개가 정면으로 안 다뤘다"는 사실이어도
       * 그 정도 밭을 빈자리라고 팔 수는 없다. 게이트와 같은 하한을 여기서도 건다.
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
      let trend = { type: 'unknown', label: '', evidence: '' };
      try {
        const shape = await analyzeDemandShape(row.keyword, openApi);
        trend = { type: shape.shape, label: shape.label, evidence: shape.evidence };
      } catch (error) {
        // 조용히 삼키면 "왜 전부 미상인지"를 또 못 찾는다. 한 번만 찍는다.
        if (!trendWarned) {
          console.log(`  !! 유형 판정 실패 — ${String(error && error.message || error).slice(0, 120)}`);
          trendWarned = true;
        }
      }
      await sleep(150);

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
      });
    }

    /*
     * 구매 검토형을 앞에, AI 브리핑에 잠식될 것을 뒤로 민다.
     * 가중치는 내부 정렬에만 쓰고 화면에 내보내지 않는다.
     */
    measured.sort((a, b) => sortWeight(analyzeKeywordSignals(a.keyword)) - sortWeight(analyzeKeywordSignals(b.keyword)));
    if (measured.length > 0) byTopic[topic] = measured;
    const seconds = Math.round((Date.now() - started) / 1000);
    report.push({
      topic, seeds: expansionSeeds.size, phrases: phrases.size,
      incomplete: incompleteLog.length, drift: driftLog.length, shortlist: shortlist.length,
      driftSamples: driftLog.slice(0, 5),
      rows: measured.length, seconds,
      incompleteSamples: incompleteLog.slice(0, 8),
    });
    console.log(
      `  ${measured.length > 0 ? 'OK' : '00'} ${topic.padEnd(15)}`
      + ` 씨앗 ${String(expansionSeeds.size).padStart(3)} → 완결 ${String(phrases.size).padStart(4)}(조각 ${incompleteLog.length}·이탈 ${driftLog.length} 제외)`
      + ` → 수요통과 ${String(shortlist.length).padStart(3)} → 후보 ${String(measured.length).padStart(3)}건  ${seconds}초`,
    );
  }

  const total = Object.values(byTopic).reduce((sum, rows) => sum + rows.length, 0);
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(path.resolve(outPath), JSON.stringify({
    generatedAt: new Date().toISOString(),
    filters: { minWords, minVolume },
    report,
    topics: byTopic,
  }, null, 1), 'utf8');

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
