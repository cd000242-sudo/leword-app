#!/usr/bin/env node
/**
 * 선점 보드를 사이트로 발행한다.
 *
 * 배치가 낸 보드에는 운영자용 정보(탈락 사유·게이트 임계값·표본 로그)가 섞여 있다.
 * 그대로 올리면 공개 파일에 내부 판단 근거가 통째로 나간다. 여기서 화면에 필요한
 * 것만 골라 옮긴다.
 *
 * 안전장치 — 전부 "조용히 나쁜 것을 올리지 않기" 위한 것이다:
 *   ① 0행이면 기존 파일을 덮지 않는다. 빈 회차가 좋은 보드를 지우면 안 된다.
 *   ② 근거(evidence)가 없는 행은 버린다. 근거 없는 행이 화면에 나가면 이 보드의
 *      값어치가 사라진다.
 *   ③ 합성·샘플 표식(generator 가 sample/ui-check)이면 거부한다. 검증용 가짜
 *      데이터를 실수로 발행하는 사고를 막는다.
 *
 * 사용:
 *   node scripts/publish-preemption-board.js --in=board32.json
 *   ... --dest=<경로>   기본: tmp/leaderspro-admin-work/spa/public/data/preemption-board.json
 *   ... --dryRun        무엇이 올라갈지만 보여준다
 */
'use strict';

require('ts-node/register/transpile-only');

const fs = require('fs');
const path = require('path');
const { classifySearchIntent, resolveIntentFromSerp } = require('../src/utils/keyword-intent');
const { SECTION_MARKER_VERSION, trustedSections } = require('../src/utils/naver-serp-structure');
const { judgeEarlyMover } = require('../src/utils/early-mover');
const { shapeFromLabel } = require('../src/utils/keyword-demand-shape');
const { judgeNamedPersonRisk } = require('../src/utils/named-person-risk');
const { judgeCompleteness } = require('../src/utils/keyword-completeness');
const { adviseFromLayout } = require('../src/utils/serp-layout-advice');
const { referenceRowReason } = require('../src/utils/reference-row-reason');
const { judgeTimingGroup } = require('../src/utils/preemption-timing-group');
const { mergeCarryRows } = require('../src/utils/board-carry');

const DEFAULT_DEST = path.join(
  __dirname, '..', 'tmp', 'leaderspro-admin-work', 'spa', 'public', 'data', 'preemption-board.json',
);

function arg(name, fallback = '') {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

/**
 * 화면이 쓰는 필드만 남긴다. 운영자용 정보는 여기서 걸러진다.
 *
 * 의도 판정을 여기서 한 번 더 하는 이유: 후보 단계에서는 SERP 를 아직 안 봤기 때문에
 * 명사형 키워드('강아지 사료')가 전부 '분류 안 됨' 으로 남는다. 발행 시점에는 구획
 * 실측이 있으므로 그걸로 채운다. 화면이 보는 값의 단일 출처는 여기다.
 */
function toPublicRow(row) {
  const serp = row.serp || {};

  // 옛 세대 마커로 센 구획은 "못 본 것"으로 본다.
  // v1 은 탭바를 쇼핑으로 셌고, 그걸 믿으면 69행 전부가 '구매 검토'가 된다.
  const sections = trustedSections(serp);
  const trusted = sections !== null;

  /*
   * "뜨는 중인데 아직 아무도 모르는" 판정.
   * 자리가 빈 이유가 '관심이 없어서'인지 '아직 못 채서'인지를 여기서 가른다.
   */
  const earlyMover = judgeEarlyMover({
    // trendShape 를 싣기 전 세대의 배치 결과는 라벨에서 되짚는다.
    shape: row.trendShape || shapeFromLabel(row.trendLabel),
    searchVolume: row.searchVolume ?? null,
    documentCount: row.documentCount ?? null,
    // '밭 비어 있음'은 정면 글 실측으로 잰다(early-mover 2026-08-12 교체와 짝).
    facingPosts: row.serp && typeof row.serp.exactTitleHits === 'number' ? row.serp.exactTitleHits : null,
    sampledTitles: row.serp && typeof row.serp.sampledTitles === 'number' ? row.serp.sampledTitles : null,
    // null(못 쟀음)을 false 로 눌러 담으면 안 잰 사실이 근거로 되살아난다.
    inRealtimeNow: row.inRealtimeNow ?? null,
    firstSeenAt: row.firstSeenAt || null,
    hasAiBriefing: row.serp && row.serp.hasAiBriefing,
  });

  // 어느 판에서 싸울 것인가 — 구획의 유무가 아니라 **위아래 순서**가 정한다.
  const layout = adviseFromLayout(sections);

  const intent = resolveIntentFromSerp(classifySearchIntent(row.keyword), sections);
  const intentLabel = intent.intent === 'unknown' ? (row.intentLabel || '') : intent.intentLabel;
  return {
    serpSections: sections || [],
    layoutBestFor: layout.bestFor,
    layoutHeadline: layout.headline,
    layoutRanked: layout.ranked,
    layoutAdsOnTop: layout.adsOnTop,
    earlyMover: earlyMover.early,
    earlyMoverReasons: earlyMover.early ? earlyMover.reasons : [],
    sectionsMeasured: trusted,
    intentSource: intent.source,
    keyword: row.keyword,
    topic: row.topic,
    tier: row.tier,
    tierLabel: row.tierLabel,
    openSlot: row.openSlot ?? null,
    searchVolume: row.searchVolume ?? null,
    documentCount: row.documentCount ?? null,
    evidence: Array.isArray(row.evidence) ? row.evidence : [],
    intentLabel,
    briefingRisk: row.briefingRisk || null,
    regulatoryLabel: row.regulatoryLabel || '',
    trendLabel: row.trendLabel || '',
    timing: row.timing || '',
    monthsToPeak: row.monthsToPeak ?? null,
    /*
     * 시기 그룹 — 화면이 "언제 쓸 것"으로 묶는 키. 실측 산술만 쓴다
     * (preemption-timing-group). 못 쟀으면 빈 문자열로 남는다.
     */
    timingGroup: judgeTimingGroup({
      trendShape: row.trendShape || shapeFromLabel(row.trendLabel),
      monthsToPeak: row.monthsToPeak ?? null,
    }),
    /*
     * SEO/홈판 제목 2종 + 근거. 배치가 회차 실측(형제 후보·1페이지 제목·시기)으로
     * 만든 값을 그대로 통과시킨다. 없으면(옛 세대 board.json) null.
     */
    titles: row.titles && row.titles.seo ? {
      seo: { text: row.titles.seo.text, frame: row.titles.seo.frame, basis: row.titles.seo.basis },
      home: { text: row.titles.home.text, frame: row.titles.home.frame, basis: row.titles.home.basis },
    } : null,
    /*
     * 애드센스(티스토리/구글) 적합 배지. null = 재료 부족(미판정) — 화면은
     * 배지를 안 그리면 된다. 네이버 적합 배지는 없다 — 본판 통과 자체가 그 증거다.
     */
    adsenseFit: row.adsenseFit ?? null,
    // 수익 결론(클릭할까·무슨 광고·머물까). 보강이 붙인 행에만 있다.
    monetize: row.monetize ?? null,
    // "지금 왜 검색되는가" AI 추론 + 지식인 질문 수 실측 (2026-08-19 사장님 지시)
    whySearch: row.whySearch ?? null,
    kinCount: typeof row.kinCount === 'number' ? row.kinCount : null,
    kinTop: Array.isArray(row.kinTop) ? row.kinTop : null,
    // kinMode 마커가 발행본에 남아야 다음 보강이 재조회 여부를 안다.
    kinMode: typeof row.kinMode === 'string' ? row.kinMode : undefined,
    // 실측 키워드 풀(연관 실측 + AI 검증분, 검색량 순 최대 12) — 전부 실존.
    keywordPool: Array.isArray(row.keywordPool) ? row.keywordPool : null,
    // 30일 트렌드(데이터랩 상대값 실측) — 폰에서도 카드 안에서 그려진다.
    trend: row.trend && Array.isArray(row.trend.series) ? row.trend : null,
    adsenseReason: row.adsenseReason || '',
    /* 문제해결 서브(형제 실측 선별). 빈 배열 = 실측 파생 없음(정직) — 화면은 줄을 숨긴다. */
    subKeywords: Array.isArray(row.subKeywords)
      ? row.subKeywords.map((s) => ({ keyword: s.keyword, searchVolume: s.searchVolume ?? null, frame: s.frame || '' }))
      : [],
    /*
     * 이 숫자가 언제쩍 결과인지.
     *
     * 검색량은 지난 한 달의 총합이라, 정점이 1년 전인 키워드와 지금이 정점인
     * 키워드가 화면에서 똑같은 숫자로 보인다. 어느 달까지 반영된 값인지와
     * 정점 대비 지금 수준을 같이 낸다 — 둘 다 실측 시계열의 단순 나눗셈이다.
     */
    measuredAt: row.measuredAt || null,
    demandAsOf: row.demandAsOf || null,
    latestVsPeakPct: row.latestVsPeakPct ?? null,
    monthsSincePeak: row.monthsSincePeak ?? null,
    recencySummary: row.recencySummary || '',
    // 실측 시계열 — 화면이 '그래프보기'에서 그대로 그린다(추정 아님, 데이터랩 실측).
    demandSeries: Array.isArray(row.demandSeries) ? row.demandSeries : [],
    // 화면이 "이게 뭔데" 를 보여줄 재료. 전부 검색결과에서 그대로 옮긴 글자다.
    meaning: serp.meaning ? {
      citedTitles: serp.meaning.citedTitles || [],
      questions: serp.meaning.questions || [],
      productNames: serp.meaning.productNames || [],
      priceMedian: serp.meaning.priceMedian ?? null,
      priceSamples: serp.meaning.priceSamples ?? 0,
    } : null,
    serp: {
      sampledTitles: serp.sampledTitles ?? null,
      exactTitleHits: serp.exactTitleHits ?? null,
      medianDaysAgo: serp.medianDaysAgo ?? null,
      hasAiBriefing: serp.hasAiBriefing,
      aiBriefingSourceCount: serp.aiBriefingSourceCount ?? null,
      adCount: serp.adCount ?? null,
    },
  };
}

function main() {
  const inPath = arg('in');
  if (!inPath) { console.error('--in=<보드 JSON> 이 필요합니다.'); process.exit(2); }
  if (!fs.existsSync(inPath)) { console.error(`입력 파일 없음: ${inPath}`); process.exit(2); }

  const board = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const dest = arg('dest') || DEFAULT_DEST;

  // ③ 가짜 데이터 차단
  const generator = String(board.generator || '');
  if (/sample|ui-check|test/i.test(generator)) {
    console.error(`거부 — 검증용 데이터로 보인다 (generator: ${generator}).`);
    process.exit(3);
  }

  const rows = Array.isArray(board.rows) ? board.rows : [];

  // ② 근거 없는 행 제거
  const hasEvidence = rows.filter((row) => Array.isArray(row.evidence) && row.evidence.length > 0);
  const dropped = rows.length - hasEvidence.length;

  /*
   * 같은 키워드가 두 주제로 올라오는 일이 있다 — 실측에서 '정형외과 임형태'가
   * 건강·의학과 스포츠에 동시에 떴다. 씨앗이 겹치면 생기는 일이고, 화면에서는
   * 같은 카드가 두 번 보인다. 먼저 온 것(=확실한 층)만 남긴다.
   */
  /*
   * 마지막 방어선 — 화면 직전에 한 번 더 거른다.
   *
   * 배치를 돌린 뒤에 규칙이 늘어나는 일이 실제로 있었다. 금지 주제 필터를 넣기
   * 전에 뽑은 후보에 '야설록뜻'이 남아 있었고, 실명 판정을 만들기 전 후보에
   * '정형외과 임형태'가 남아 발행까지 갔다. 발행기가 마지막으로 붙잡는다.
   */
  const blocked = [];
  const safe = hasEvidence.filter((row) => {
    const named = judgeNamedPersonRisk(row.keyword);
    if (named.risky) { blocked.push(`${row.keyword} — ${named.reason}`); return false; }
    const complete = judgeCompleteness(row.keyword, []);
    if (!complete.complete) { blocked.push(`${row.keyword} — ${complete.reason}`); return false; }
    return true;
  });

  const seen = new Set();
  const withEvidence = safe.filter((row) => {
    const key = String(row.keyword).replace(/\s+/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const deduped = safe.length - withEvidence.length;

  console.log('='.repeat(70));
  console.log('선점 보드 발행');
  console.log('='.repeat(70));
  console.log(`  입력        ${inPath}`);
  console.log(`  행          ${rows.length}${dropped > 0 ? ` · 근거 없는 ${dropped}행 제외` : ''}${blocked.length > 0 ? ` · 규칙 위반 ${blocked.length}행 제외` : ''}${deduped > 0 ? ` · 중복 ${deduped}행 제외` : ''} → ${withEvidence.length}`);
  blocked.forEach((line) => console.log(`                ✕ ${line}`));

  const byTopic = new Map();
  withEvidence.forEach((row) => byTopic.set(row.topic, (byTopic.get(row.topic) || 0) + 1));
  const byTier = {};
  withEvidence.forEach((row) => { byTier[row.tier] = (byTier[row.tier] || 0) + 1; });
  console.log(`  주제        ${byTopic.size}종`);
  console.log(`  참고용(2군)  ${Array.isArray(board.rejections) ? board.rejections.length : 0}행 중 실측 사실이 있는 것만 내보냅니다`);
  console.log(`  층          ${Object.entries(byTier).map(([t, n]) => `${t} ${n}`).join(' · ') || '없음'}`);
  const staleSections = withEvidence.filter((r) => r.serp?.sectionMarkerVersion !== SECTION_MARKER_VERSION).length;
  if (staleSections > 0) {
    console.log(`  구획        ${staleSections}행이 옛 마커(v${withEvidence[0]?.serp?.sectionMarkerVersion ?? '?'}) — 구획·의도 판정을 비웁니다`);
  }
  const aiSeen = withEvidence.filter((r) => r.serp?.hasAiBriefing !== undefined).length;
  console.log(`  AI 브리핑    ${withEvidence.filter((r) => r.serp?.hasAiBriefing === true).length}건 있음 / ${aiSeen}건 측정`);
  const early = withEvidence.filter((r) => judgeEarlyMover({
    shape: r.trendShape || shapeFromLabel(r.trendLabel),
    searchVolume: r.searchVolume ?? null,
    documentCount: r.documentCount ?? null,
    facingPosts: r.serp && typeof r.serp.exactTitleHits === 'number' ? r.serp.exactTitleHits : null,
    sampledTitles: r.serp && typeof r.serp.sampledTitles === 'number' ? r.serp.sampledTitles : null,
    inRealtimeNow: r.inRealtimeNow ?? null,
    firstSeenAt: r.firstSeenAt || null,
    hasAiBriefing: r.serp && r.serp.hasAiBriefing,
  }).early).length;
  console.log(`  선점 적기    ${early}행 (뜨는 중 · 밭 비어 있음 · 실시간 전 · 브리핑 없음 · 새로 생긴 말)`);

  // ① 빈 회차가 기존 보드를 지우지 않게
  if (withEvidence.length === 0) {
    const existing = fs.existsSync(dest);
    console.error(`\n거부 — 발행할 행이 없다. ${existing ? '기존 보드를 그대로 둔다.' : '발행할 것이 없다.'}`);
    process.exit(4);
  }

  /*
   * 2군 — **네이버 자리는 늦었지만 외부 유입으로는 쓸 수 있는 밭.**
   *
   * 사장님 지적(2026-08-11): "외부 유입 글로 쓸 수도 있는데…?"
   * 맞다. 여기 떨어진 것은 대부분 '이미 누가 정면으로 썼다' 이지 '수요가 없다' 가
   * 아니다. 실측 예: '시나공 cbt' 는 **월 검색량 7,610** 인데 정면 4건이라 1군에서
   * 빠졌다. 네이버 블로그로는 늦었어도 구글·워드프레스로는 충분한 자리다.
   *
   * 1군과 **한 칸에 섞지 않는다** — 섞으면 "이것도 황금, 저것도 황금"이 되어
   * 보드의 값어치가 사라진다. 별도 배열이고, 화면도 따로 낸다.
   *
   * 외부 유입 판단에 필요한 실측을 함께 싣는다 — 문서수·광고수·정면 건수·어느 판인가.
   * 예전에는 검색량과 이유 문장만 나가서, 화면이 "쓸 만한지" 를 판단할 재료가 없었다.
   *
   * 실명·조각·금지 주제는 여기에도 안 넣는다. 법적 위험이거나 글 제목이 못 되는
   * 것은 참고 가치도 없다.
   */
  const reference = (Array.isArray(board.rejections) ? board.rejections : [])
    .filter((row) => row && row.keyword)
    .filter((row) => !judgeNamedPersonRisk(row.keyword).risky)
    .filter((row) => judgeCompleteness(row.keyword, []).complete)
    .map((row) => ({
      keyword: row.keyword,
      topic: row.topic || '주제 선택 안 함',
      searchVolume: row.searchVolume ?? null,
      documentCount: row.documentCount ?? null,
      /*
       * 광고가 붙어 있으면 외부 유입으로도 값이 나가는 자리다 — 광고주가 이미
       * 돈을 넣고 있다는 뜻이니까. 못 쟀으면 null 이다(0 으로 눌러 담지 않는다).
       */
      adCount: row.serp && typeof row.serp.adCount === 'number' ? row.serp.adCount : null,
      facingPosts: row.serp && typeof row.serp.exactTitleHits === 'number' ? row.serp.exactTitleHits : null,
      sampledTitles: row.serp && typeof row.serp.sampledTitles === 'number' ? row.serp.sampledTitles : null,
      // 이유는 실측 사실만. 임계값은 여기서 걸러진다(reference-row-reason 이 단일 출처).
      note: referenceRowReason(row),
      intentLabel: row.intentLabel || '',
      trendLabel: row.trendLabel || '',
      recencySummary: row.recencySummary || '',
      demandAsOf: row.demandAsOf || null,
      measuredAt: row.measuredAt || null,
    }))
    .filter((row) => row.note);

  /*
   * 누적(이월) 병합 — 회차가 돌 때마다 보드가 쌓인다 (목표 2,000키워드+).
   * 직전 발행본(dest)의 행 중 신규에 없는 것을 carryDays 안에서 이월하고,
   * 같은 키워드는 신규가 이기되 기존 AI 보강 자산을 접붙인다(재보강 콜 절약).
   * --noCarry 로 끄면 예전처럼 대체 발행한다.
   */
  const carryDays = Number(arg('carryDays')) || 90;
  let prevPayload = null;
  if (!hasFlag('noCarry') && fs.existsSync(dest)) {
    try {
      prevPayload = JSON.parse(fs.readFileSync(dest, 'utf8'));
    } catch {
      prevPayload = null; // 못 읽으면 이월 없이 — 회차를 죽이지 않는다
    }
  }
  const merged = mergeCarryRows(withEvidence.map(toPublicRow), prevPayload, {
    carryDays,
    nowMs: Date.now(),
  });
  console.log(
    `  누적        신규 ${merged.fresh} + 이월 ${merged.carried}(≤${carryDays}일)`
    + `${merged.expired > 0 ? ` · 만료 ${merged.expired}` : ''}`
    + `${merged.grafted > 0 ? ` · 보강 접붙임 ${merged.grafted}` : ''}`
    + ` = 총 ${merged.rows.length}행 (목표 200)`,
  );

  const mergedTopics = new Set(merged.rows.map((row) => row.topic).filter(Boolean));
  const payload = {
    publishedAt: new Date().toISOString(),
    generator: 'preemption-board-batch',
    topicsTotal: board.topicsTotal ?? 32,
    topicsWithRows: mergedTopics.size,
    verified: board.verified ?? null,
    rows: merged.rows,
    reference,
    /*
     * 쇼핑 레인으로 라우팅된 키워드 — 조용히 사라지면 "왜 줄었나"를 화면이
     * 설명할 수 없다. 실측 근거(reasons)와 함께 그대로 내보낸다. 화면은
     * "쇼핑 커넥트 소관 N건" 안내와 목록으로 쓴다. 없으면 빈 배열.
     */
    routedShopping: (Array.isArray(board.routedShopping) ? board.routedShopping : []).map((row) => ({
      topic: row.topic || '',
      keyword: row.keyword,
      searchVolume: row.searchVolume ?? null,
      reasons: Array.isArray(row.reasons) ? row.reasons : [],
    })),
  };

  if (hasFlag('dryRun')) {
    console.log('\ndryRun — 파일을 쓰지 않고 종료합니다.');
    console.log('상위 5행:');
    payload.rows.slice(0, 5).forEach((r) => console.log(`  · [${r.topic}] ${r.keyword} — ${r.tierLabel}`));
    console.log(`참고용(2군) ${payload.reference.length}행:`);
    payload.reference.slice(0, 5).forEach((r) => console.log(`  · [${r.topic}] ${r.keyword} — ${r.note}`));
    process.exit(0);
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(payload, null, 1), 'utf8');
  console.log(`\n발행: ${dest}`);
  console.log('  이 파일은 커밋·배포해야 사이트에 반영된다.');
}

main();
