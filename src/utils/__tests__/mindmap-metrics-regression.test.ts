import {
  buildMindmapMeasuredKeywordItem,
  compactMindmapKeyword,
  isMindmapDisplayMetric,
  isMindmapExpansionSeedMetric,
} from '../mindmap-metrics';
import * as fs from 'fs';
import * as path from 'path';

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
assert('hidden low-volume seed is displayable but not reused as an expansion seed',
  isMindmapDisplayMetric(hiddenLowVolume) === true
    && isMindmapExpansionSeedMetric(hiddenLowVolume) === false,
  JSON.stringify(hiddenLowVolume));

const partiallyMaskedVolume = buildMindmapMeasuredKeywordItem({
  keyword: 'earned income support application period',
  pcSearchVolume: 0,
  mobileSearchVolume: 30,
  documentCount: 126479,
  pcSearchVolumeLt10: true,
  mobileSearchVolumeLt10: false,
}, { seed: 'earned income support', depth: 1 });

assert('partially masked SearchAd volume is displayed as a bounded range, not plus-only',
  partiallyMaskedVolume.searchVolumeDisplay === '30~39'
    && partiallyMaskedVolume.searchVolumeLowerBound === 30
    && partiallyMaskedVolume.searchVolumeUpperBound === 40
    && partiallyMaskedVolume.goldenRatioDisplay === '< 0.01',
  JSON.stringify(partiallyMaskedVolume));

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
assert('measured related fallback can be reused for deeper expansion',
  isMindmapDisplayMetric(fallbackVolume) === true
    && isMindmapExpansionSeedMetric(fallbackVolume) === true,
  JSON.stringify(fallbackVolume));

const redOceanShoppingSeed = buildMindmapMeasuredKeywordItem({
  keyword: '원피스 추천',
  pcSearchVolume: 180,
  mobileSearchVolume: 180,
  documentCount: 1611294,
}, { seed: '원피스', depth: 1 });

assert('mindmap red-ocean measured keyword is displayed but not promoted as an expansion seed',
  redOceanShoppingSeed.grade === 'C'
    && redOceanShoppingSeed.goldenRatio === 0
    && isMindmapDisplayMetric(redOceanShoppingSeed) === true
    && isMindmapExpansionSeedMetric(redOceanShoppingSeed) === false,
  JSON.stringify(redOceanShoppingSeed));

const docOnlyUnknownVolume = buildMindmapMeasuredKeywordItem({
  keyword: '정확하지 않은 문서수만 있는 후보',
  pcSearchVolume: null,
  mobileSearchVolume: null,
  documentCount: 1200,
}, { seed: '닥터린 영양제 추천', depth: 1 });

assert('document-count-only mindmap rows are hidden until search volume is known',
  docOnlyUnknownVolume.searchVolumeKnown === false
    && isMindmapDisplayMetric(docOnlyUnknownVolume) === false
    && isMindmapExpansionSeedMetric(docOnlyUnknownVolume) === false,
  JSON.stringify(docOnlyUnknownVolume));

const sourceSignals = fs.readFileSync(
  path.join(__dirname, '..', '..', 'main', 'handlers', 'source-signals.ts'),
  'utf8',
);
assert('mindmap metrics handler filters display rows and deeper seeds with SSoT helpers',
  /isMindmapDisplayMetric/.test(sourceSignals)
    && /filter\(isMindmapDisplayMetric\)/.test(sourceSignals)
    && /isMindmapExpansionSeedMetric/.test(sourceSignals)
    && !/filter\(i => i\.documentCount > 0 \|\| i\.searchVolume !== null\)/.test(sourceSignals),
  'mindmap handler can expose unknown-volume rows again');

console.log(`\n[mindmap-metrics-regression.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
