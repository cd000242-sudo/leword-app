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
const { SECTION_MARKER_VERSION } = require('../src/utils/naver-serp-structure');

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
  const trusted = serp.sectionMarkerVersion === SECTION_MARKER_VERSION;
  const sections = trusted && Array.isArray(serp.sections) ? serp.sections : null;

  const intent = resolveIntentFromSerp(classifySearchIntent(row.keyword), sections);
  const intentLabel = intent.intent === 'unknown' ? (row.intentLabel || '') : intent.intentLabel;
  return {
    serpSections: sections || [],
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
  const withEvidence = rows.filter((row) => Array.isArray(row.evidence) && row.evidence.length > 0);
  const dropped = rows.length - withEvidence.length;

  console.log('='.repeat(70));
  console.log('선점 보드 발행');
  console.log('='.repeat(70));
  console.log(`  입력        ${inPath}`);
  console.log(`  행          ${rows.length}${dropped > 0 ? ` → ${withEvidence.length} (근거 없는 ${dropped}행 제외)` : ''}`);

  const byTopic = new Map();
  withEvidence.forEach((row) => byTopic.set(row.topic, (byTopic.get(row.topic) || 0) + 1));
  const byTier = {};
  withEvidence.forEach((row) => { byTier[row.tier] = (byTier[row.tier] || 0) + 1; });
  console.log(`  주제        ${byTopic.size}종`);
  console.log(`  층          ${Object.entries(byTier).map(([t, n]) => `${t} ${n}`).join(' · ') || '없음'}`);
  const staleSections = withEvidence.filter((r) => r.serp?.sectionMarkerVersion !== SECTION_MARKER_VERSION).length;
  if (staleSections > 0) {
    console.log(`  구획        ${staleSections}행이 옛 마커(v${withEvidence[0]?.serp?.sectionMarkerVersion ?? '?'}) — 구획·의도 판정을 비웁니다`);
  }
  const aiSeen = withEvidence.filter((r) => r.serp?.hasAiBriefing !== undefined).length;
  console.log(`  AI 브리핑    ${withEvidence.filter((r) => r.serp?.hasAiBriefing === true).length}건 있음 / ${aiSeen}건 측정`);

  // ① 빈 회차가 기존 보드를 지우지 않게
  if (withEvidence.length === 0) {
    const existing = fs.existsSync(dest);
    console.error(`\n거부 — 발행할 행이 없다. ${existing ? '기존 보드를 그대로 둔다.' : '발행할 것이 없다.'}`);
    process.exit(4);
  }

  const payload = {
    publishedAt: new Date().toISOString(),
    generator: 'preemption-board-batch',
    topicsTotal: board.topicsTotal ?? 32,
    topicsWithRows: byTopic.size,
    verified: board.verified ?? null,
    rows: withEvidence.map(toPublicRow),
  };

  if (hasFlag('dryRun')) {
    console.log('\ndryRun — 파일을 쓰지 않고 종료합니다.');
    console.log('상위 5행:');
    payload.rows.slice(0, 5).forEach((r) => console.log(`  · [${r.topic}] ${r.keyword} — ${r.tierLabel}`));
    process.exit(0);
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(payload, null, 1), 'utf8');
  console.log(`\n발행: ${dest}`);
  console.log('  이 파일은 커밋·배포해야 사이트에 반영된다.');
}

main();
