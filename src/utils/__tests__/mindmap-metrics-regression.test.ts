import {
  buildMindmapMeasuredKeywordItem,
  compactMindmapKeyword,
} from '../mindmap-metrics';

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

const compactSeed = compactMindmapKeyword('닥터린 영양제 추천');
assert('compact keyword ignores whitespace and plus signs',
  compactSeed === compactMindmapKeyword('닥터린+영양제추천'),
  compactSeed);

const hiddenLowVolume = buildMindmapMeasuredKeywordItem({
  keyword: '닥터린 영양제 추천',
  pcSearchVolume: 0,
  mobileSearchVolume: 0,
  documentCount: 4091,
  monthlyAveCpc: 0,
}, { seed: '닥터린 영양제 추천', depth: 1 });

assert('hidden low-volume SearchAd rows are displayed as a range, not zero',
  hiddenLowVolume.searchVolumeDisplay === '< 20'
    && hiddenLowVolume.searchVolume === 0
    && hiddenLowVolume.searchVolumeKnown === true
    && hiddenLowVolume.searchVolumeIsRange === true,
  JSON.stringify(hiddenLowVolume));

const normalizedSeed = buildMindmapMeasuredKeywordItem({
  keyword: '닥터린영양제추천',
  pcSearchVolume: 14950,
  mobileSearchVolume: 0,
  documentCount: 4091,
}, { seed: '닥터린 영양제 추천', depth: 1 });

assert('seed row is recognized even when API removes spaces',
  normalizedSeed.isSeed === true && normalizedSeed.searchVolume === 14950,
  JSON.stringify(normalizedSeed));

const fallbackVolume = buildMindmapMeasuredKeywordItem({
  keyword: '뉴트리원 영양제 추천',
  pcSearchVolume: null,
  mobileSearchVolume: null,
  searchVolume: 13870,
  documentCount: 54692,
}, { seed: '닥터린 영양제 추천', depth: 1 });

assert('related API volume fallback is preserved when SearchAd exact match is missing',
  fallbackVolume.searchVolume === 13870
    && fallbackVolume.searchVolumeDisplay === '13,870',
  JSON.stringify(fallbackVolume));

console.log(`\n[mindmap-metrics-regression.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
