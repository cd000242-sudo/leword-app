/**
 * golden-discovery-floor.test.ts
 *
 * Guards the golden keyword discovery floor:
 * category discovery must scan beyond the visible count, dedupe compactly,
 * and surface 30 SSS candidates before lower grades when they exist.
 */

import {
  countSss,
  getGoldenDiscoveryScanLimit,
  rankGoldenDiscoveryResults,
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

const duplicateRanked = rankGoldenDiscoveryResults([
  { keyword: '청년 지원금 신청', grade: 'SSS', score: 110, searchVolume: 1000, documentCount: 100, goldenRatio: 10 },
  { keyword: '청년지원금신청', grade: 'SSS', score: 109, searchVolume: 5000, documentCount: 50, goldenRatio: 30 },
  ...sss,
], 30, false);
const compactDuplicates = duplicateRanked.filter(item => item.keyword.replace(/\s+/g, '') === '청년지원금신청');
assert('ranker removes compact keyword duplicates', compactDuplicates.length === 1, `${compactDuplicates.length}`);

const scanLimit = getGoldenDiscoveryScanLimit(30, false, 80);
assert('scan limit searches deeper than the visible floor', scanLimit >= 360, `${scanLimit}`);

const categoryScanLimit = getGoldenDiscoveryScanLimit(30, false, 420);
assert('category seed pressure scans much deeper for 30 SSS target',
  categoryScanLimit >= 1600,
  `${categoryScanLimit}`);

const unlimitedRanked = rankGoldenDiscoveryResults([...lower, ...sss], 30, true);
assert('unlimited mode does not clamp result count', unlimitedRanked.length === lower.length + sss.length, `${unlimitedRanked.length}`);

console.log(`\n[golden-discovery-floor.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
