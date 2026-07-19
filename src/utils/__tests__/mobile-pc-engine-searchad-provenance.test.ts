import {
  documentCountBroadQueryKey,
  mergeMeasuredMetric,
  metricFromMdpResult,
  selectForceFreshDocumentCountQueryKey,
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
const freshDocumentMeasuredAt = new Date().toISOString();
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
  'an explicit missing SearchAd remeasurement invalidates the older exact split',
  missingRow.pcSearchVolume === null
    && missingRow.mobileSearchVolume === null
    && missingRow.totalSearchVolume === null
    && missingRow.searchVolumeBindingVersion === undefined
    && missingRow.searchVolumeMeasuredAt === undefined
    && missingRow.goldenRatio === null
    && missingRow.grade === 'C'
    && missingRow.isMeasured === false
    && missingRow.evidence.includes('search-volume-binding-invalidated'),
  JSON.stringify(missingRow),
);

const unboundReplacement = mergeMeasuredMetric(baseMetric, {
  keyword: 'exact keyword',
  pcSearchVolume: 300,
  mobileSearchVolume: 700,
  totalSearchVolume: 1000,
}, undefined);
assert(
  'an unversioned replacement invalidates the older bound split',
  unboundReplacement.pcSearchVolume === null
    && unboundReplacement.mobileSearchVolume === null
    && unboundReplacement.totalSearchVolume === null
    && unboundReplacement.searchVolumeBindingVersion === undefined
    && unboundReplacement.searchVolumeMeasuredAt === undefined
    && unboundReplacement.grade === 'C'
    && unboundReplacement.isMeasured === false,
  JSON.stringify(unboundReplacement),
);

const oneSidedNullReplacement = mergeMeasuredMetric(baseMetric, {
  keyword: 'exact keyword',
  pcSearchVolume: null,
  mobileSearchVolume: 700,
  totalSearchVolume: 700,
  measuredAtMs,
  searchVolumeBindingVersion: 'keyword-keyed-v2',
}, undefined);
assert(
  'one-sided null SearchAd remeasurement invalidates the older exact split',
  oneSidedNullReplacement.pcSearchVolume === null
    && oneSidedNullReplacement.mobileSearchVolume === null
    && oneSidedNullReplacement.totalSearchVolume === null
    && oneSidedNullReplacement.searchVolumeBindingVersion === undefined
    && oneSidedNullReplacement.searchVolumeMeasuredAt === undefined
    && oneSidedNullReplacement.grade === 'C'
    && oneSidedNullReplacement.isMeasured === false,
  JSON.stringify(oneSidedNullReplacement),
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

const rangedSearchVolume = mergeMeasuredMetric(baseMetric, {
  keyword: 'exact keyword',
  pcSearchVolume: null,
  mobileSearchVolume: 70,
  totalSearchVolume: null,
  pcSearchVolumeLt10: true,
  mobileSearchVolumeLt10: false,
  svEstimated: true,
  measuredAtMs,
  searchVolumeBindingVersion: 'keyword-keyed-v2',
}, {
  documentCount: 25,
  source: 'naver-api',
  confidence: 'high',
  isEstimated: false,
  queryMode: 'broad',
  queryKey: documentCountBroadQueryKey(baseMetric.keyword),
  measuredAt: freshDocumentMeasuredAt,
});
assert(
  'a per-device <10 SearchAd range stays partial and cannot retain an exact grade or ratio',
  rangedSearchVolume.pcSearchVolume === null
    && rangedSearchVolume.mobileSearchVolume === 70
    && rangedSearchVolume.totalSearchVolume === null
    && rangedSearchVolume.pcSearchVolumeLt10 === true
    && rangedSearchVolume.mobileSearchVolumeLt10 === false
    && rangedSearchVolume.searchVolumeBindingVersion === 'keyword-keyed-v2'
    && rangedSearchVolume.isSearchVolumeEstimated === true
    && rangedSearchVolume.searchVolumeConfidence === 'low'
    && rangedSearchVolume.measurementStatus === 'partial'
    && rangedSearchVolume.goldenRatio === null
    && rangedSearchVolume.grade === 'C'
    && rangedSearchVolume.score === null
    && rangedSearchVolume.isMeasured === false
    && rangedSearchVolume.evidence.includes('pc-searchad-lt10-range'),
  JSON.stringify(rangedSearchVolume),
);

const exactNumericZeroSearchVolume = mergeMeasuredMetric(baseMetric, {
  keyword: 'exact keyword',
  pcSearchVolume: 0,
  mobileSearchVolume: 70,
  totalSearchVolume: 70,
  pcSearchVolumeLt10: false,
  mobileSearchVolumeLt10: false,
  svEstimated: false,
  measuredAtMs,
  searchVolumeBindingVersion: 'keyword-keyed-v2',
}, {
  documentCount: 25,
  source: 'naver-api',
  confidence: 'high',
  isEstimated: false,
  queryMode: 'broad',
  queryKey: documentCountBroadQueryKey(baseMetric.keyword),
  measuredAt: freshDocumentMeasuredAt,
});
assert(
  'an actual numeric SearchAd zero remains an exact device value',
  exactNumericZeroSearchVolume.pcSearchVolume === 0
    && exactNumericZeroSearchVolume.mobileSearchVolume === 70
    && exactNumericZeroSearchVolume.totalSearchVolume === 70
    && exactNumericZeroSearchVolume.pcSearchVolumeLt10 === false
    && exactNumericZeroSearchVolume.mobileSearchVolumeLt10 === false
    && exactNumericZeroSearchVolume.isSearchVolumeEstimated === false
    && exactNumericZeroSearchVolume.searchVolumeConfidence === 'high'
    && exactNumericZeroSearchVolume.measurementStatus !== 'partial'
    && exactNumericZeroSearchVolume.goldenRatio === 2.8
    && exactNumericZeroSearchVolume.isMeasured === true,
  JSON.stringify(exactNumericZeroSearchVolume),
);

const rangedMdpMetric = metricFromMdpResult({
  keyword: 'ranged mdp keyword',
  intent: 'how-to',
  intentBadge: 'how-to',
  searchVolume: 70,
  documentCount: 25,
  goldenRatio: 2.8,
  score: 80,
  grade: 'S',
  pcSearchVolume: 0,
  mobileSearchVolume: 70,
  pcSearchVolumeLt10: true,
  mobileSearchVolumeLt10: false,
  searchVolumeBindingVersion: 'keyword-keyed-v2',
  searchVolumeMeasuredAt: '2026-07-15T01:02:03.000Z',
} as any, 'test');
assert(
  'MDP mapping preserves <10 range provenance but fails closed as partial',
  rangedMdpMetric.pcSearchVolume === null
    && rangedMdpMetric.mobileSearchVolume === 70
    && rangedMdpMetric.totalSearchVolume === null
    && rangedMdpMetric.pcSearchVolumeLt10 === true
    && rangedMdpMetric.mobileSearchVolumeLt10 === false
    && rangedMdpMetric.searchVolumeBindingVersion === 'keyword-keyed-v2'
    && rangedMdpMetric.isSearchVolumeEstimated === true
    && rangedMdpMetric.searchVolumeConfidence === 'low'
    && rangedMdpMetric.measurementStatus === 'partial'
    && rangedMdpMetric.goldenRatio === null
    && rangedMdpMetric.grade === 'C'
    && rangedMdpMetric.score === null
    && rangedMdpMetric.isMeasured === false,
  JSON.stringify(rangedMdpMetric),
);

const broadDocumentMeasurement = mergeMeasuredMetric(baseMetric, undefined, {
  documentCount: 25,
  source: 'naver-api',
  confidence: 'high',
  isEstimated: false,
  queryMode: 'broad',
  queryKey: documentCountBroadQueryKey(baseMetric.keyword),
  measuredAt: freshDocumentMeasuredAt,
});
assert(
  'PC OpenAPI document merge preserves broad query-mode provenance',
  broadDocumentMeasurement.documentCount === 25
    && broadDocumentMeasurement.documentCountSource === 'naver-api'
    && broadDocumentMeasurement.documentCountQueryMode === 'broad'
    && broadDocumentMeasurement.documentCountQueryKey === documentCountBroadQueryKey(baseMetric.keyword)
    && broadDocumentMeasurement.documentCountMeasuredAt === freshDocumentMeasuredAt,
  JSON.stringify(broadDocumentMeasurement),
);

const mismatchedLegacyDocumentMetric: any = {
  ...baseMetric,
  keyword: '제주 렌터카',
  grade: 'SSS',
  score: 99,
  documentCount: 222,
  goldenRatio: 4.5,
  documentCountSource: 'naver-api',
  documentCountConfidence: 'high',
  documentCountQueryMode: 'broad',
  documentCountQueryKey: documentCountBroadQueryKey('제주렌터카'),
  documentCountMeasuredAt: freshDocumentMeasuredAt,
  isDocumentCountEstimated: false,
  aiJudge: { verdict: 'publish', score: 99 },
  publishDecision: { verdict: 'publish', score: 99 },
  agentInsight: { reason: 'old metric tuple' },
};
const failedDocumentRemeasurement = mergeMeasuredMetric(
  mismatchedLegacyDocumentMetric,
  undefined,
  null,
);
assert(
  'failed document remeasurement clears an old mismatched broad-query tuple and derived decisions',
  failedDocumentRemeasurement.documentCount === null
    && failedDocumentRemeasurement.documentCountSource === undefined
    && failedDocumentRemeasurement.documentCountQueryMode === undefined
    && failedDocumentRemeasurement.documentCountQueryKey === undefined
    && failedDocumentRemeasurement.documentCountMeasuredAt === undefined
    && failedDocumentRemeasurement.goldenRatio === null
    && failedDocumentRemeasurement.grade === 'C'
    && failedDocumentRemeasurement.score === null
    && failedDocumentRemeasurement.aiJudge === undefined
    && failedDocumentRemeasurement.publishDecision === undefined
    && failedDocumentRemeasurement.agentInsight === undefined
    && failedDocumentRemeasurement.isMeasured === false
    && failedDocumentRemeasurement.evidence.includes('document-count-query-binding-invalidated'),
  JSON.stringify(failedDocumentRemeasurement),
);

const skippedDocumentRemeasurement = mergeMeasuredMetric(
  mismatchedLegacyDocumentMetric,
  undefined,
  undefined,
);
assert(
  'an unattempted merge still refuses to display a missing or mismatched document query binding',
  skippedDocumentRemeasurement.documentCount === null
    && skippedDocumentRemeasurement.documentCountQueryKey === undefined
    && skippedDocumentRemeasurement.goldenRatio === null
    && skippedDocumentRemeasurement.grade === 'C'
    && skippedDocumentRemeasurement.isMeasured === false,
  JSON.stringify(skippedDocumentRemeasurement),
);

const trustedExistingDocumentMetric = mergeMeasuredMetric({
  ...mismatchedLegacyDocumentMetric,
  documentCountQueryKey: documentCountBroadQueryKey('제주 렌터카'),
}, undefined, undefined);
assert(
  'a fresh exact broad-query tuple remains reusable when no new document request was made',
  trustedExistingDocumentMetric.documentCount === 222
    && trustedExistingDocumentMetric.documentCountQueryKey === documentCountBroadQueryKey('제주 렌터카')
    && trustedExistingDocumentMetric.documentCountMeasuredAt === freshDocumentMeasuredAt,
  JSON.stringify(trustedExistingDocumentMetric),
);

const mismatchedNewDocumentMeasurement = mergeMeasuredMetric(baseMetric, undefined, {
  documentCount: 777,
  source: 'naver-api',
  confidence: 'high',
  isEstimated: false,
  queryMode: 'broad',
  queryKey: documentCountBroadQueryKey('different keyword'),
  measuredAt: freshDocumentMeasuredAt,
});
assert(
  'a newly returned document count cannot be displayed under a different broad query key',
  mismatchedNewDocumentMeasurement.documentCount === null
    && mismatchedNewDocumentMeasurement.documentCountQueryKey === undefined
    && mismatchedNewDocumentMeasurement.goldenRatio === null
    && mismatchedNewDocumentMeasurement.grade === 'C'
    && mismatchedNewDocumentMeasurement.isMeasured === false,
  JSON.stringify(mismatchedNewDocumentMeasurement),
);

const documentMap = new Map<string, { documentCount: number; measuredAt: string }>();
documentMap.set(documentCountBroadQueryKey('제주 렌터카'), {
  documentCount: 1_234,
  measuredAt: '2026-07-15T03:00:00.000Z',
});
documentMap.set(documentCountBroadQueryKey('제주렌터카'), {
  documentCount: 5_678,
  measuredAt: '2026-07-15T03:00:01.000Z',
});
assert(
  'PC Blog map keeps spaced and unspaced broad queries as distinct measurements',
  documentMap.size === 2
    && documentMap.get(documentCountBroadQueryKey('제주 렌터카'))?.documentCount === 1_234
    && documentMap.get(documentCountBroadQueryKey('제주 렌터카'))?.measuredAt === '2026-07-15T03:00:00.000Z'
    && documentMap.get(documentCountBroadQueryKey('제주렌터카'))?.documentCount === 5_678
    && documentMap.get(documentCountBroadQueryKey('제주렌터카'))?.measuredAt === '2026-07-15T03:00:01.000Z',
  JSON.stringify(Array.from(documentMap.entries())),
);

const forceFreshKey = selectForceFreshDocumentCountQueryKey([
  { keyword: '확장 후보', intent: 'how-to', source: 'pc-naver-autocomplete' },
  { keyword: '사용자 요청 키워드', intent: 'requested-keyword', source: 'pc-keyword-analysis-exact' },
  { keyword: '두 번째 요청형 후보', intent: 'requested-keyword', source: 'pc-keyword-analysis-exact' },
] as any);
assert(
  'keyword-analysis selects only the first direct requested seed for force-fresh Blog measurement',
  forceFreshKey === documentCountBroadQueryKey('사용자 요청 키워드'),
  String(forceFreshKey),
);
assert(
  'expansion-only metrics keep normal 15-minute document cache reuse',
  selectForceFreshDocumentCountQueryKey([
    { keyword: '확장 후보', intent: 'how-to', source: 'pc-naver-autocomplete' },
  ] as any) === null,
);

console.log('[mobile-pc-engine-searchad-provenance.test] passed');
process.exit(0);
