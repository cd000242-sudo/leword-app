/**
 * golden-discovery-floor.test.ts
 *
 * Guards the golden keyword discovery floor:
 * category discovery must scan beyond the visible count, dedupe compactly,
 * and surface 30 SSS candidates before lower grades when they exist.
 */

import {
  createGoldenSssTargetTracker,
  countSss,
  getGoldenDiscoveryScanLimit,
  isActionableGoldenKeyword,
  isQualityGoldenDiscoveryResult,
  rankGoldenDiscoveryResults,
  resolveGoldenDiscoveryTarget,
  scoreGoldenKeywordVirality,
} from '../golden-discovery-floor';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`FAIL ${name}${detail ? ' - ' + detail : ''}`);
  }
}

const sss = Array.from({ length: 42 }, (_, i) => ({
  keyword: `황금 후보 ${i + 1}`,
  grade: 'SSS',
  score: 95 - i * 0.1,
  searchVolume: 1000 + i * 10,
  documentCount: 200 + i,
  goldenRatio: 8 - i * 0.01,
}));

const lower = Array.from({ length: 20 }, (_, i) => ({
  keyword: `보통 후보 ${i + 1}`,
  grade: i % 2 === 0 ? 'SS' : 'A',
  score: 80 - i,
  searchVolume: 5000,
  documentCount: 12000,
  goldenRatio: 1.2,
}));

const ranked = rankGoldenDiscoveryResults([...lower, ...sss], 30, false);
assert('ranker returns at least 30 visible results', ranked.length === 30, `${ranked.length}`);
assert('ranker puts 30 SSS results in the visible floor', countSss(ranked) === 30, `${countSss(ranked)}`);
assert('ranker keeps lower grades out while enough SSS exists',
  ranked.every(item => item.grade === 'SSS'),
  ranked.map(item => String(item.grade)).join(','));

const quickRanked = rankGoldenDiscoveryResults([...lower, ...sss], 10, false, { honorRequestedLimit: true });
assert('quick preview returns exactly requested 10 results',
  quickRanked.length === 10,
  `${quickRanked.length}`);
assert('quick preview still ranks SSS first',
  countSss(quickRanked) === 10,
  `${countSss(quickRanked)}`);
assert('quick preview target honors requested limit',
  resolveGoldenDiscoveryTarget(10, { honorRequestedLimit: true }) === 10);

const duplicateRanked = rankGoldenDiscoveryResults([
  { keyword: '청년 지원금 신청', grade: 'SSS', score: 110, searchVolume: 1000, documentCount: 100, goldenRatio: 10 },
  { keyword: '청년지원금신청', grade: 'SSS', score: 109, searchVolume: 5000, documentCount: 50, goldenRatio: 30 },
  ...sss,
], 30, false);
const compactDuplicates = duplicateRanked.filter(item => item.keyword.replace(/\s+/g, '') === '청년지원금신청');
assert('ranker removes compact keyword duplicates', compactDuplicates.length === 1, `${compactDuplicates.length}`);

const duplicateQualityOrder = rankGoldenDiscoveryResults([
  { keyword: '신혼부부 전세대출 조건', grade: 'SS', score: 80, searchVolume: 700, documentCount: 170, goldenRatio: 4.12 },
  { keyword: '신혼부부 전세대출 조건', grade: 'SSS', score: 92, searchVolume: 3960, documentCount: 120, goldenRatio: 33 },
], 1, false, {
  honorRequestedLimit: true,
  strictVisibleSssOnly: true,
  requireActionableIntent: true,
  qualityBackfillToTarget: true,
});
assert('ranker keeps the stronger duplicate after sorting, not the first-seen weaker row',
  duplicateQualityOrder.length === 1 && duplicateQualityOrder[0].grade === 'SSS',
  duplicateQualityOrder.map(item => `${item.keyword}:${item.grade}:${item.searchVolume}/${item.documentCount}/${item.goldenRatio}/${item.score}`).join('|'));

const fakeSssRanked = rankGoldenDiscoveryResults([
  { keyword: 'broad fake golden seed', grade: 'SSS', score: 99, searchVolume: 360, documentCount: 1611294, goldenRatio: 0 },
  ...sss.slice(0, 30),
], 30, false);
assert('ranker removes SSS labels that fail measured golden gates',
  !fakeSssRanked.some(item => item.keyword === 'broad fake golden seed'),
  fakeSssRanked.map(item => `${item.keyword}:${item.grade}:${item.searchVolume}/${item.documentCount}/${item.goldenRatio}`).join('|'));

const clustered = [
  { keyword: 'summer dress recommendation', grade: 'SSS', score: 99, searchVolume: 5400, documentCount: 420, goldenRatio: 12.86 },
  { keyword: 'best summer dress recommendation', grade: 'SSS', score: 98, searchVolume: 5200, documentCount: 430, goldenRatio: 12.09 },
  { keyword: 'summer dress recommendation outfit', grade: 'SSS', score: 97, searchVolume: 5100, documentCount: 440, goldenRatio: 11.59 },
  { keyword: 'exam answer release date', grade: 'SSS', score: 92, searchVolume: 3300, documentCount: 25, goldenRatio: 132 },
  { keyword: 'garden flower festival tickets', grade: 'SSS', score: 91, searchVolume: 4400, documentCount: 49, goldenRatio: 89.8 },
  { keyword: 'local movie screening schedule', grade: 'SSS', score: 90, searchVolume: 2800, documentCount: 35, goldenRatio: 80 },
  { keyword: 'new device recall lookup', grade: 'SSS', score: 89, searchVolume: 2500, documentCount: 40, goldenRatio: 62.5 },
];
const clusteredRanked = rankGoldenDiscoveryResults(clustered, 5, false, {
  honorRequestedLimit: true,
  diversifySimilarIntents: true,
  maxSimilarPerCluster: 1,
} as any);
const repeatedRecommendationCount = clusteredRanked
  .filter(item => item.keyword.includes('summer dress recommendation')).length;
assert('ranker limits near-duplicate intent clusters when diversity is requested',
  clusteredRanked.length === 5 && repeatedRecommendationCount === 1,
  clusteredRanked.map(item => item.keyword).join('|'));

const beginnerActionablePool = [
  { keyword: '원피스', grade: 'SSS', score: 99, searchVolume: 12000, documentCount: 300, goldenRatio: 40 },
  { keyword: '여름 원피스 코디', grade: 'SSS', score: 98, searchVolume: 9000, documentCount: 200, goldenRatio: 45 },
  { keyword: '원피스 사이즈 비교', grade: 'SSS', score: 97, searchVolume: 3000, documentCount: 100, goldenRatio: 30 },
  { keyword: '삼성전자', grade: 'SSS', score: 96, searchVolume: 50000, documentCount: 400, goldenRatio: 125 },
  { keyword: '뉴스', grade: 'SSS', score: 95, searchVolume: 5200, documentCount: 210, goldenRatio: 24.76 },
  { keyword: 'festival parking guide', grade: 'SSS', score: 94, searchVolume: 4100, documentCount: 180, goldenRatio: 22.78 },
  { keyword: '여름 하객 원피스 코디', grade: 'SSS', score: 93, searchVolume: 2600, documentCount: 90, goldenRatio: 28.89 },
  { keyword: '키작녀 원피스 사이즈 비교', grade: 'SSS', score: 92, searchVolume: 4800, documentCount: 80, goldenRatio: 60 },
  { keyword: '코코부 뜻', grade: 'SSS', score: 91, searchVolume: 3200, documentCount: 110, goldenRatio: 29.09 },
  { keyword: '2027 6모 등급컷', grade: 'SSS', score: 90, searchVolume: 5100, documentCount: 70, goldenRatio: 72.86 },
  { keyword: '임영웅 콘서트 예매 일정', grade: 'SSS', score: 89, searchVolume: 4600, documentCount: 120, goldenRatio: 38.33 },
  { keyword: '프로야구 올스타전 티켓팅 일정', grade: 'SSS', score: 88, searchVolume: 3900, documentCount: 95, goldenRatio: 41.05 },
];
const beginnerActionableRanked = rankGoldenDiscoveryResults(beginnerActionablePool, 6, false, {
  honorRequestedLimit: true,
  strictVisibleSssOnly: true,
  requireActionableIntent: true,
});
assert('actionable gate identifies beginner-writeable keywords',
  ['여름 하객 원피스 코디', '키작녀 원피스 사이즈 비교', '코코부 뜻', '2027 6모 등급컷', '임영웅 콘서트 예매 일정', '프로야구 올스타전 티켓팅 일정'].every(keyword => isActionableGoldenKeyword(keyword))
    && ['원피스', '여름 원피스 코디', '원피스 사이즈 비교', '삼성전자', '뉴스', 'festival parking guide'].every(keyword => !isActionableGoldenKeyword(keyword)),
  beginnerActionableRanked.map(item => item.keyword).join('|'));
assert('ranker removes broad or bare SSS keywords when actionable output is required',
  beginnerActionableRanked.length === 6
    && beginnerActionableRanked.every(item => isActionableGoldenKeyword(item.keyword))
    && !beginnerActionableRanked.some(item => ['원피스', '여름 원피스 코디', '원피스 사이즈 비교', '삼성전자', '뉴스', 'festival parking guide'].includes(item.keyword)),
  beginnerActionableRanked.map(item => item.keyword).join('|'));

const scarceStrictSssPool = [
  { keyword: '임영웅 콘서트 예매 일정', grade: 'SSS', score: 95, searchVolume: 4600, documentCount: 120, goldenRatio: 38.33 },
  { keyword: '2027 6모 등급컷', grade: 'SSS', score: 94, searchVolume: 5100, documentCount: 70, goldenRatio: 72.86 },
  { keyword: '프로야구 올스타전 티켓팅 일정', grade: 'SSS', score: 93, searchVolume: 3900, documentCount: 95, goldenRatio: 41.05 },
  { keyword: '부산 드림콘서트 예매 일정', grade: 'SSS', score: 92, searchVolume: 2600, documentCount: 90, goldenRatio: 28.89 },
  { keyword: '문서수 폭발 가짜 SSS', grade: 'SSS', score: 99, searchVolume: 9000, documentCount: 200000, goldenRatio: 0.04 },
  { keyword: '드라마 폭싹 속았수다 방송시간', grade: 'SS', score: 82, searchVolume: 900, documentCount: 180, goldenRatio: 5 },
  { keyword: '넷플릭스 신작 드라마 몇부작', grade: 'SS', score: 81, searchVolume: 800, documentCount: 200, goldenRatio: 4 },
  { keyword: 'KBO 올스타전 중계 일정', grade: 'SS', score: 80, searchVolume: 1200, documentCount: 240, goldenRatio: 5 },
  { keyword: '청년 월세 지원금 신청 서류', grade: 'SS', score: 79, searchVolume: 700, documentCount: 170, goldenRatio: 4.12 },
  { keyword: '여름 축제 주차 위치', grade: 'S', score: 70, searchVolume: 420, documentCount: 120, goldenRatio: 3.5 },
  { keyword: '토익 접수 일정 준비물', grade: 'S', score: 68, searchVolume: 350, documentCount: 150, goldenRatio: 2.33 },
  { keyword: '원피스', grade: 'SS', score: 82, searchVolume: 5000, documentCount: 100, goldenRatio: 50 },
  { keyword: 'festival parking guide', grade: 'SS', score: 82, searchVolume: 5000, documentCount: 100, goldenRatio: 50 },
  { keyword: '드라마 방송시간 부실 후보', grade: 'SS', score: 74, searchVolume: 900, documentCount: 180, goldenRatio: 5 },
  { keyword: '드라마 방송시간 문서수 과다', grade: 'SS', score: 82, searchVolume: 900, documentCount: 15000, goldenRatio: 0.06 },
];
const qualityBackfilled = rankGoldenDiscoveryResults(scarceStrictSssPool, 10, false, {
  honorRequestedLimit: true,
  diversifySimilarIntents: true,
  maxSimilarPerCluster: 2,
  strictVisibleSssOnly: true,
  requireActionableIntent: true,
  qualityBackfillToTarget: true,
});
assert('quality backfill fills the requested quantity without exposing weak keywords',
  qualityBackfilled.length === 10
    && countSss(qualityBackfilled) === 4
    && qualityBackfilled.every(item => isQualityGoldenDiscoveryResult(item, { requireActionableIntent: true }))
    && !qualityBackfilled.some(item => ['문서수 폭발 가짜 SSS', '원피스', 'festival parking guide', '드라마 방송시간 부실 후보', '드라마 방송시간 문서수 과다'].includes(item.keyword)),
  qualityBackfilled.map(item => `${item.keyword}:${item.grade}:${item.searchVolume}/${item.documentCount}/${item.goldenRatio}/${item.score}`).join('|'));
assert('quality backfill keeps strict SSS candidates at the top',
  qualityBackfilled.slice(0, 4).every(item => item.grade === 'SSS')
    && qualityBackfilled.slice(4).every(item => ['SS', 'S'].includes(String(item.grade))),
  qualityBackfilled.map(item => `${item.keyword}:${item.grade}`).join('|'));

assert('S quality allows very large document pools when volume ratio is strong',
  isQualityGoldenDiscoveryResult({
    keyword: '삼성전자 주가',
    grade: 'S',
    score: 86,
    searchVolume: 38312700,
    documentCount: 1080381,
    goldenRatio: 35.46,
  }, { requireActionableIntent: true }),
  'high-volume high-ratio S result should stay eligible');

assert('profile issue intent accepts common no-space Korean search forms',
  isQualityGoldenDiscoveryResult({
    keyword: '성리프로필',
    grade: 'SS',
    score: 86,
    searchVolume: 42140,
    documentCount: 835,
    goldenRatio: 50.47,
  }, { requireActionableIntent: true }),
  'no-space profile keywords are common Naver search forms');

const bulkThirtySss = Array.from({ length: 30 }, (_, i) => ({
  keyword: `${['2027 6모 등급컷', '2026 제헌절 공휴일', '리센느 프로필', '송지호 바다하늘길 주차', '1227회 로또 당첨번호'][i % 5]} ${Math.floor(i / 5) + 1}`,
  grade: 'SSS',
  score: 92 - i * 0.05,
  searchVolume: 2600 + i * 30,
  documentCount: 180 + i,
  goldenRatio: 12,
}));
const bulkQualityBackfill = Array.from({ length: 45 }, (_, i) => ({
  keyword: `${['KBO 올스타전 예매 일정', '드라마 공식영상 다시보기', '흠뻑쇼 티켓팅 일정', '모의고사 답지 발표', '정책지원금 신청 서류'][i % 5]} ${Math.floor(i / 5) + 1}`,
  grade: i % 3 === 0 ? 'SS' : i % 3 === 1 ? 'S' : 'A',
  score: i % 3 === 0 ? 78 : i % 3 === 1 ? 68 : 61,
  searchVolume: i % 3 === 0 ? 900 : i % 3 === 1 ? 420 : 180,
  documentCount: i % 3 === 0 ? 230 : i % 3 === 1 ? 160 : 90,
  goldenRatio: i % 3 === 0 ? 3.9 : i % 3 === 1 ? 2.7 : 2,
}));
const bulkSixtyRanked = rankGoldenDiscoveryResults(
  [
    ...bulkQualityBackfill,
    ...bulkThirtySss,
    { keyword: '원피스', grade: 'SS', score: 90, searchVolume: 50000, documentCount: 1000000, goldenRatio: 0.05 },
  ],
  60,
  false,
  {
    diversifySimilarIntents: true,
    maxSimilarPerCluster: 6,
    strictVisibleSssOnly: true,
    requireActionableIntent: true,
    qualityBackfillToTarget: true,
  },
);
assert('bulk 60 fills with SSS first and measured SS/S/A quality backfill',
  bulkSixtyRanked.length === 60
    && countSss(bulkSixtyRanked) === 30
    && bulkSixtyRanked.slice(0, 30).every(item => item.grade === 'SSS')
    && bulkSixtyRanked.slice(30).every(item => isQualityGoldenDiscoveryResult(item, { requireActionableIntent: true }))
    && !bulkSixtyRanked.some(item => item.keyword === '원피스'),
  bulkSixtyRanked.map(item => `${item.keyword}:${item.grade}`).join('|'));

const sssTracker = createGoldenSssTargetTracker(30);
for (let i = 0; i < 29; i++) sssTracker.add(sss[i]);
sssTracker.add({ ...sss[0], keyword: sss[0].keyword.replace(/\s+/g, '') });
sssTracker.add({ ...lower[0], grade: 'SS' });
assert('unique SSS tracker ignores duplicate compact variants before stopping',
  sssTracker.uniqueSssCount === 29 && !sssTracker.shouldStop(),
  `${sssTracker.uniqueSssCount}`);
sssTracker.add(sss[29]);
assert('unique SSS tracker stops only after 30 unique SSS keywords',
  sssTracker.uniqueSssCount === 30 && sssTracker.shouldStop(),
  `${sssTracker.uniqueSssCount}`);

const quickSssTracker = createGoldenSssTargetTracker(10, { honorRequestedLimit: true });
for (let i = 0; i < 10; i++) quickSssTracker.add(sss[i]);
assert('quick preview SSS tracker stops after requested 10 unique SSS keywords',
  quickSssTracker.uniqueSssCount === 10 && quickSssTracker.shouldStop(),
  `${quickSssTracker.uniqueSssCount}`);

const scanLimit = getGoldenDiscoveryScanLimit(30, false, 80);
assert('scan limit searches deeper than the visible floor', scanLimit >= 360, `${scanLimit}`);

const categoryScanLimit = getGoldenDiscoveryScanLimit(30, false, 420);
assert('category seed pressure scans much deeper for 30 SSS target',
  categoryScanLimit >= 1600,
  `${categoryScanLimit}`);

const quickCategoryScanLimit = getGoldenDiscoveryScanLimit(10, false, 420, {
  categoryFirst: true,
  honorRequestedLimit: true,
});
assert('quick preview category scan stays bounded for 10-result requests',
  quickCategoryScanLimit < categoryScanLimit && quickCategoryScanLimit <= 1800,
  `${quickCategoryScanLimit} vs ${categoryScanLimit}`);

const unlimitedRanked = rankGoldenDiscoveryResults([...lower, ...sss], 30, true);
assert('unlimited mode does not clamp result count', unlimitedRanked.length === lower.length + sss.length, `${unlimitedRanked.length}`);

const bulkSss = Array.from({ length: 130 }, (_, i) => ({
  keyword: `bulk SSS candidate ${i + 1}`,
  grade: 'SSS',
  score: 98 - i * 0.01,
  searchVolume: 1500 + i * 20,
  documentCount: 100 + i,
  goldenRatio: 9 - i * 0.01,
}));

const bulkRanked = rankGoldenDiscoveryResults([...lower, ...bulkSss], 100, false);
assert('bulk mode returns 100 visible results when 100 SSS candidates exist',
  bulkRanked.length === 100,
  `${bulkRanked.length}`);
assert('bulk mode keeps all visible 100 results as SSS when enough SSS exists',
  countSss(bulkRanked) === 100 && bulkRanked.every(item => item.grade === 'SSS'),
  `${countSss(bulkRanked)} / ${bulkRanked.map(item => item.grade).join(',')}`);

const bulkSssTracker = createGoldenSssTargetTracker(100);
for (let i = 0; i < 99; i++) bulkSssTracker.add(bulkSss[i]);
assert('bulk SSS tracker does not stop before 100 unique SSS keywords',
  bulkSssTracker.uniqueSssCount === 99 && !bulkSssTracker.shouldStop(),
  `${bulkSssTracker.uniqueSssCount}`);
bulkSssTracker.add(bulkSss[99]);
assert('bulk SSS tracker stops at 100 unique SSS keywords',
  bulkSssTracker.uniqueSssCount === 100 && bulkSssTracker.shouldStop(),
  `${bulkSssTracker.uniqueSssCount}`);

const bulkCategoryScanLimit = getGoldenDiscoveryScanLimit(100, false, 720, { categoryFirst: true });
assert('bulk category scan limit is deep enough for a 100 SSS target',
  bulkCategoryScanLimit >= 8000,
  `${bulkCategoryScanLimit}`);

const viralIntentPool = [
  { keyword: '배우 김도현 프로필', grade: 'SSS', score: 99, searchVolume: 50000, documentCount: 500, goldenRatio: 100 },
  { keyword: '1228회 로또 당첨번호', grade: 'SSS', score: 98, searchVolume: 60000, documentCount: 400, goldenRatio: 150 },
  { keyword: '청년월세지원금 신청 대상 2026', grade: 'SSS', score: 92, searchVolume: 12000, documentCount: 340, goldenRatio: 35.29, cpc: 420 },
  { keyword: '여름 제주 렌트카 가격비교 후기', grade: 'SSS', score: 91, searchVolume: 9000, documentCount: 290, goldenRatio: 31.03, cpc: 720 },
];
const viralRanked = rankGoldenDiscoveryResults(viralIntentPool, 4, false, {
  honorRequestedLimit: true,
  strictVisibleSssOnly: true,
});
assert('viral scoring ranks blog-actionable hooks above profile or lookup SSS rows',
  viralRanked[0].keyword === '여름 제주 렌트카 가격비교 후기'
    && viralRanked[1].keyword === '청년월세지원금 신청 대상 2026'
    && viralRanked.findIndex(item => item.keyword === '배우 김도현 프로필') > 1
    && viralRanked.findIndex(item => item.keyword === '1228회 로또 당첨번호') > 1,
  viralRanked.map(item => `${item.keyword}:${scoreGoldenKeywordVirality(item)}`).join('|'));
assert('viral score separates sellable/actionable keywords from weak lookup topics',
  scoreGoldenKeywordVirality(viralIntentPool[2]) >= scoreGoldenKeywordVirality(viralIntentPool[0]) + 30
    && scoreGoldenKeywordVirality(viralIntentPool[3]) >= scoreGoldenKeywordVirality(viralIntentPool[1]) + 35,
  viralIntentPool.map(item => `${item.keyword}:${scoreGoldenKeywordVirality(item)}`).join('|'));

console.log(`\n[golden-discovery-floor.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
