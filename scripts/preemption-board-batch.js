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
const { brightDataQuotaSnapshot } = require('../src/utils/brightdata-quota-governor');
const { selectWithFill, TIER_ORDER, TIER_LABEL, DEFAULT_PREEMPTION_THRESHOLDS } = require('../src/utils/preemption-gate');
const { BLOG_TOPIC_COVERAGE, topicsWithoutCoverage } = require('../src/utils/blog-topic-coverage');

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
      trendLabel: row.trendLabel || '',
      monthsToPeak: Number.isFinite(Number(row.monthsToPeak)) ? Number(row.monthsToPeak) : null,
      timing: row.timing || '',
      longTail: Boolean(row.longTail),
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
  let added = 0;
  for (const keyword of keywords) {
    if (!state[keyword]) {
      state[keyword] = nowIso;
      added += 1;
    }
  }
  return { state, added };
}

/** 지금 실시간 검색어에 올라와 있는 키워드 집합. */
function loadRealtimeKeywords(signalsPath) {
  if (!signalsPath || !fs.existsSync(signalsPath)) return new Set();
  try {
    const data = JSON.parse(fs.readFileSync(signalsPath, 'utf8'));
    const set = new Set();
    for (const lane of data.lanes || []) {
      for (const item of lane.items || []) {
        const keyword = String(item.keyword || item.title || '').trim();
        if (keyword) set.add(keyword.replace(/\s+/g, ''));
      }
    }
    return set;
  } catch {
    return new Set();
  }
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
    serp.sections = structure.sections;
    serp.sectionMarkerVersion = structure.sectionMarkerVersion;
  }
  return { serp, quotaBlocked: false };
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
  const { state: firstSeen, added } = loadFirstSeen(statePath, allKeywords, nowIso);
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
  console.log(`  실시간 대조군     ${realtime.size}건${signalsPath ? '' : ' (--signals 미지정 — ④조건이 전부 통과된다)'}`);
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

  const tierTotals = { top3: 0, page1: 0, 'page1-weak': 0, contested: 0 };
  const shortTopics = [];
  const rejectionLog = [];

  for (const [topic, take] of allocation) {
    if (blocked) break;
    const candidates = byTopic.get(topic).slice(0, take);

    // 주제 하나를 통째로 검증한 뒤 층을 나눈다. 한 건씩 즉시 판정하면
    // "1층이 모자라니 2층을 깐다"를 결정할 수가 없다.
    const judgedInputs = [];
    for (const candidate of candidates) {
      await sleep(DELAY_MS);
      const { serp, quotaBlocked, error } = await verify(candidate.keyword, withStructure);
      if (quotaBlocked) {
        console.log(`  쿼터 한도 도달 — 중단 (${stats.verified}건 처리됨)`);
        blocked = true;
        break;
      }
      stats.verified += 1;
      if (!serp) {
        stats.failed += 1;
        console.log(`  ?? [${topic}] ${candidate.keyword} — 수집 실패 ${error}`);
        continue;
      }
      judgedInputs.push({
        candidate,
        input: {
          keyword: candidate.keyword,
          searchVolume: candidate.searchVolume,
          documentCount: candidate.documentCount,
          serp,
          firstSeenAt: firstSeen[candidate.keyword] || null,
          inRealtimeNow: realtime.has(candidate.keyword.replace(/\s+/g, '')),
        },
      });
    }
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
      rejectionLog.push({ topic, keyword: result.keyword, reason: result.failed[0] || '알 수 없음' });
    }

    for (const result of outcome.rows) {
      const source = judgedInputs.find((e) => e.input.keyword === result.keyword);
      const serp = source ? source.input.serp : null;
      const candidate = source ? source.candidate : null;
      rows.push({
        keyword: result.keyword,
        topic,
        intentLabel: candidate?.intentLabel || '',
        briefingRisk: candidate?.briefingRisk || null,
        regulatoryLabel: candidate?.regulatoryLabel || '',
        trendLabel: candidate?.trendLabel || '',
        monthsToPeak: candidate?.monthsToPeak ?? null,
        timing: candidate?.timing || '',
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
          sections: serp.sections,
          sectionMarkerVersion: serp.sectionMarkerVersion ?? null,
          topTitles: serp.topTitles || [],
        } : null,
        firstSeenAt: firstSeen[result.keyword] || null,
      });
    }
    const layerSummary = TIER_ORDER
      .filter((tier) => outcome.rows.some((r) => r.tier === tier))
      .map((tier) => `${tier} ${outcome.rows.filter((r) => r.tier === tier).length}`)
      .join(' + ');
    console.log(`  [${topic}] ${outcome.rows.length}/${targetPerTopic}건 — ${layerSummary || '없음'}${outcome.short ? '  ← 목표 미달' : ''}`);
  }

  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(firstSeen, null, 0), 'utf8');

  const after = brightDataQuotaSnapshot();
  console.log('\n' + '-'.repeat(72));
  console.log(`검증 ${stats.verified}건 → 통과 ${stats.passed} · 탈락 ${stats.rejected} · 판정불가 ${stats.undetermined} · 수집실패 ${stats.failed}`);
  console.log(`통과 주제 ${new Set(rows.map((r) => r.topic)).size}종 / 후보 있던 주제 ${byTopic.size}종`);
  console.log(`사용량 ${before.used} → ${after.used} (이번 실행 ${after.used - before.used}건) · 남은 ${after.remainingFree}`);

  if (stats.verified > 0 && stats.passed === 0) {
    console.log('\n⚠️ 통과 0건. 게이트가 과하게 조였거나 후보 품질이 낮다.');
    console.log('   preemption-gate 의 임계값은 인자로 뺐다 — 실측 결과로 보정할 것.');
  }

  if (outPath) {
    const board = {
      publishedAt: nowIso,
      generator: 'preemption-board-batch',
      gate: DEFAULT_PREEMPTION_THRESHOLDS,
      targetPerTopic,
      tierTotals,
      topicsTotal: BLOG_TOPIC_COVERAGE.length,
      topicsWithRows: new Set(rows.map((r) => r.topic)).size,
      verified: stats.verified,
      rejections: rejectionLog,
      rows,
    };
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    fs.writeFileSync(path.resolve(outPath), JSON.stringify(board, null, 2), 'utf8');
    console.log(`보드 저장: ${outPath} (${rows.length}행)`);
  }
}

main().catch((e) => { console.error('실패:', e.message); process.exit(1); });
