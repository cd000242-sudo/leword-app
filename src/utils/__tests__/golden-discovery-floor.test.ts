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
  rankGoldenDiscoveryResults,
  resolveGoldenDiscoveryTarget,
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

console.log(`\n[golden-discovery-floor.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
