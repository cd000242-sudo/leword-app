import {
  mergeMeasuredMetric,
  metricFromMdpResult,
} from '../../mobile/pc-engine-executor';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const baseMetric: any = {
  keyword: 'exact keyword',
  grade: 'S',
  pcSearchVolume: 10,
  mobileSearchVolume: 20,
  totalSearchVolume: 30,
  documentCount: 10,
  goldenRatio: 3,
  cpc: null,
  category: 'test',
  source: 'fixture',
  intent: 'test',
  evidence: [],
  isMeasured: true,
  searchVolumeSource: 'searchad',
  searchVolumeConfidence: 'high',
  searchVolumeBindingVersion: 'keyword-keyed-v2',
  searchVolumeMeasuredAt: '2026-07-14T00:00:00.000Z',
  isSearchVolumeEstimated: false,
};

const mdpMetric = metricFromMdpResult({
  keyword: 'mdp exact keyword',
  intent: 'how-to',
  intentBadge: 'how-to',
  searchVolume: 300,
  documentCount: 100,
  goldenRatio: 3,
  score: 80,
  pcSearchVolume: 100,
  mobileSearchVolume: 200,
  searchVolumeBindingVersion: 'keyword-keyed-v2',
  searchVolumeMeasuredAt: '2026-07-15T01:02:03.000Z',
} as any, 'test');

assert(
  'MDP conversion preserves exact SearchAd split provenance',
  mdpMetric.pcSearchVolume === 100
    && mdpMetric.mobileSearchVolume === 200
    && mdpMetric.searchVolumeBindingVersion === 'keyword-keyed-v2'
    && mdpMetric.searchVolumeMeasuredAt === '2026-07-15T01:02:03.000Z',
  JSON.stringify(mdpMetric),
);

const measuredAtMs = Date.parse('2026-07-15T02:03:04.000Z');
const rebound = mergeMeasuredMetric(baseMetric, {
  keyword: 'exact keyword',
  pcSearchVolume: 30,
  mobileSearchVolume: 70,
  totalSearchVolume: 100,
  measuredAtMs,
  searchVolumeBindingVersion: 'keyword-keyed-v2',
}, undefined);
assert(
  'PC SearchAd merge binds values and measurement time from the same exact row',
  rebound.pcSearchVolume === 30
    && rebound.mobileSearchVolume === 70
    && rebound.searchVolumeBindingVersion === 'keyword-keyed-v2'
    && rebound.searchVolumeMeasuredAt === '2026-07-15T02:03:04.000Z',
  JSON.stringify(rebound),
);

const missingRow = mergeMeasuredMetric(baseMetric, {
  keyword: 'exact keyword',
  pcSearchVolume: null,
  mobileSearchVolume: null,
  totalSearchVolume: null,
}, undefined);
assert(
  'missing SearchAd row cannot launder an existing split with a fresh trusted source',
  missingRow.pcSearchVolume === 10
    && missingRow.mobileSearchVolume === 20
    && missingRow.searchVolumeBindingVersion === 'keyword-keyed-v2'
    && missingRow.searchVolumeMeasuredAt === '2026-07-14T00:00:00.000Z',
  JSON.stringify(missingRow),
);

const unboundReplacement = mergeMeasuredMetric(baseMetric, {
  keyword: 'exact keyword',
  pcSearchVolume: 300,
  mobileSearchVolume: 700,
  totalSearchVolume: 1000,
}, undefined);
assert(
  'unversioned replacement cannot inherit an older binding marker',
  unboundReplacement.pcSearchVolume === 10
    && unboundReplacement.mobileSearchVolume === 20
    && unboundReplacement.searchVolumeBindingVersion === 'keyword-keyed-v2'
    && unboundReplacement.searchVolumeMeasuredAt === '2026-07-14T00:00:00.000Z',
  JSON.stringify(unboundReplacement),
);

const inconsistentExisting = mergeMeasuredMetric({
  ...baseMetric,
  totalSearchVolume: 999,
}, undefined, undefined);
assert(
  'an inconsistent legacy total cannot retain a trusted binding marker',
  inconsistentExisting.searchVolumeBindingVersion === undefined
    && inconsistentExisting.searchVolumeMeasuredAt === undefined,
  JSON.stringify(inconsistentExisting),
);

const inconsistentReplacement = mergeMeasuredMetric(baseMetric, {
  keyword: 'exact keyword',
  pcSearchVolume: 30,
  mobileSearchVolume: 70,
  totalSearchVolume: 999,
  measuredAtMs,
  searchVolumeBindingVersion: 'keyword-keyed-v2',
}, undefined);
assert(
  'bound SearchAd split remains the total source of truth',
  inconsistentReplacement.totalSearchVolume === 100
    && inconsistentReplacement.searchVolumeBindingVersion === 'keyword-keyed-v2',
  JSON.stringify(inconsistentReplacement),
);

console.log('[mobile-pc-engine-searchad-provenance.test] passed');
process.exit(0);
