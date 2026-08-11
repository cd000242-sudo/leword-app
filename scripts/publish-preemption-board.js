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
   * 2군 — 자리를 확인하지 못했거나 조금 미달한 것들.
   *
   * 버리지 않고 참고용으로 낸다. 다만 1군과 **한 칸에 섞지 않는다** — 섞으면
   * "이것도 황금, 저것도 황금"이 되어 보드의 값어치가 사라진다. 별도 배열이다.
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
      // 이유는 실측 사실만. 임계값은 여기서 걸러진다(reference-row-reason 이 단일 출처).
      note: referenceRowReason(row),
      intentLabel: row.intentLabel || '',
      trendLabel: row.trendLabel || '',
      recencySummary: row.recencySummary || '',
      demandAsOf: row.demandAsOf || null,
      measuredAt: row.measuredAt || null,
    }))
    .filter((row) => row.note);

  const payload = {
    publishedAt: new Date().toISOString(),
    generator: 'preemption-board-batch',
    topicsTotal: board.topicsTotal ?? 32,
    topicsWithRows: byTopic.size,
    verified: board.verified ?? null,
    rows: withEvidence.map(toPublicRow),
    reference,
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
