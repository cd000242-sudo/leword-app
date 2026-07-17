import {
  buildLiveGoldenSupplyReport,
  evaluateLiveGoldenHumanReviewAttestation,
  liveGoldenBoardFingerprint,
  parseLiveGoldenHumanReviewAttestation,
} from '../../mobile/live-golden-supply-report';
import { LIVE_GOLDEN_CORE_CATEGORY_POLICIES } from '../../mobile/live-golden-category-policy';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

function measuredItem(keyword: string, category: string, index: number): any {
  return {
    id: `${category}-${index}`,
    keyword,
    category,
    grade: 'S',
    score: 80,
    pcSearchVolume: 200,
    mobileSearchVolume: 800,
    totalSearchVolume: 1000,
    documentCount: 200,
    goldenRatio: 5,
    source: 'searchad-measured',
    isMeasured: true,
    searchVolumeSource: 'searchad',
    searchVolumeConfidence: 'high',
    searchVolumeBindingVersion: 'keyword-keyed-v2',
    searchVolumeMeasuredAt: '2026-07-11T09:00:00.000Z',
    isSearchVolumeEstimated: false,
    documentCountSource: 'naver-api',
    documentCountConfidence: 'high',
    documentCountQueryMode: 'exact-phrase',
    isDocumentCountEstimated: false,
    discoveredAt: '2026-07-11T09:00:00.000Z',
    updatedAt: '2026-07-11T09:00:00.000Z',
  };
}

const balancedItems = LIVE_GOLDEN_CORE_CATEGORY_POLICIES.flatMap((policy) => (
  Array.from({ length: 5 }, (_, index) => measuredItem(
    `${policy.label} 검증 키워드 ${index + 1}`,
    policy.discoveryIds[index % policy.discoveryIds.length],
    index,
  ))
));
const balanced = buildLiveGoldenSupplyReport(balancedItems, {
  nowMs: Date.parse('2026-07-11T10:00:00.000Z'),
  verifiedTarget: 60,
  minimumActiveCoreCategories: 10,
});
assert('balanced measured portfolio passes the automated supply gate',
  balanced.verifiedCount === 60
    && balanced.activeCoreCategoryCount === 12
    && balanced.measuredCompletenessRate === 1
    && balanced.maximumCoreCategoryShare <= 0.18
    && balanced.automatedSupplyGate === 'pass',
  JSON.stringify(balanced));
assert('automated supply cannot claim full superiority before blind human review',
  balanced.superiorityGate === 'pending-human-review',
  JSON.stringify(balanced));

const boardUpdatedAt = '2026-07-11T09:30:00.000Z';
const validHumanReview = {
  schemaVersion: 'live-golden-human-review-v1' as const,
  fingerprintVersion: 'verified-semantics-v2' as const,
  boardUpdatedAt,
  boardFingerprint: liveGoldenBoardFingerprint(balancedItems),
  reviewedAt: '2026-07-11T10:00:00.000Z',
  reviewer: 'human-reviewer',
  reviewed: balancedItems.length,
  precisionPassed: balancedItems.length,
  malformedCount: 0,
  semanticDuplicateCount: 0,
  platformResidueCount: 0,
  sentenceResidueCount: 0,
};
const parsedHumanReview = parseLiveGoldenHumanReviewAttestation(
  validHumanReview,
  balancedItems,
  boardUpdatedAt,
  Date.parse('2026-07-11T10:01:00.000Z'),
);
const humanApproved = buildLiveGoldenSupplyReport(balancedItems, {
  nowMs: Date.parse('2026-07-11T10:01:00.000Z'),
  humanReview: parsedHumanReview,
});
assert('exact-board human attestation can pass superiority after every blind-review gate passes',
  parsedHumanReview?.reviewed === 60
    && humanApproved.superiorityGate === 'pass',
  JSON.stringify(humanApproved));
assert('human attestation is rejected when the reviewed board fingerprint no longer matches',
  parseLiveGoldenHumanReviewAttestation(
    validHumanReview,
    balancedItems.map((item, index) => index === 0 ? { ...item, intent: 'changed' } : item),
    boardUpdatedAt,
    Date.parse('2026-07-11T10:01:00.000Z'),
  ) === undefined);
assert('human attestation rejects row additions, removals, and category changes',
  parseLiveGoldenHumanReviewAttestation(
    validHumanReview,
    [...balancedItems, measuredItem('새 검수 대상', 'policy', 99)],
    boardUpdatedAt,
    Date.parse('2026-07-11T10:01:00.000Z'),
  ) === undefined
    && parseLiveGoldenHumanReviewAttestation(
      validHumanReview,
      balancedItems.slice(1),
      boardUpdatedAt,
      Date.parse('2026-07-11T10:01:00.000Z'),
    ) === undefined
    && parseLiveGoldenHumanReviewAttestation(
      validHumanReview,
      balancedItems.map((item, index) => index === 0 ? { ...item, category: 'finance' } : item),
      boardUpdatedAt,
      Date.parse('2026-07-11T10:01:00.000Z'),
    ) === undefined);
assert('legacy fingerprint versions are rejected explicitly',
  evaluateLiveGoldenHumanReviewAttestation(
    { ...validHumanReview, fingerprintVersion: 'verified-supply-v1' },
    balancedItems,
    boardUpdatedAt,
    Date.parse('2026-07-11T10:01:00.000Z'),
  ).reason === 'invalid-fingerprint-version');
assert('a board timestamp beyond the allowed clock skew fails closed',
  evaluateLiveGoldenHumanReviewAttestation(
    validHumanReview,
    balancedItems,
    '2026-07-11T10:07:00.000Z',
    Date.parse('2026-07-11T10:01:00.000Z'),
  ).reason === 'board-in-future');
const refreshedMetrics = balancedItems.map((item, index) => index === 0 ? {
  ...item,
  id: 'rekeyed-internal-row-id',
  pcSearchVolume: 250,
  mobileSearchVolume: 850,
  totalSearchVolume: 1100,
  searchVolumeMeasuredAt: '2026-07-11T09:31:00.000Z',
  updatedAt: '2026-07-11T09:31:00.000Z',
} : item);
assert('human attestation survives a newer board save when the reviewed semantic set is unchanged',
  parseLiveGoldenHumanReviewAttestation(
    validHumanReview,
    refreshedMetrics,
    '2026-07-11T09:31:00.000Z',
    Date.parse('2026-07-11T10:01:00.000Z'),
  )?.reviewed === 60);
assert('human attestation rejects null or string counters instead of coercing them to zero',
  parseLiveGoldenHumanReviewAttestation(
    { ...validHumanReview, malformedCount: null },
    balancedItems,
    boardUpdatedAt,
    Date.parse('2026-07-11T10:01:00.000Z'),
  ) === undefined
    && parseLiveGoldenHumanReviewAttestation(
      { ...validHumanReview, precisionPassed: '60' },
      balancedItems,
      boardUpdatedAt,
      Date.parse('2026-07-11T10:01:00.000Z'),
    ) === undefined);
assert('90 percent human precision passes while 53 of 60 fails',
  buildLiveGoldenSupplyReport(balancedItems, {
    nowMs: Date.parse('2026-07-11T10:01:00.000Z'),
    humanReview: { ...parsedHumanReview!, precision: 54 / 60 },
  }).superiorityGate === 'pass'
    && buildLiveGoldenSupplyReport(balancedItems, {
      nowMs: Date.parse('2026-07-11T10:01:00.000Z'),
      humanReview: { ...parsedHumanReview!, precision: 53 / 60 },
    }).superiorityGate === 'fail');
const duplicateFound = buildLiveGoldenSupplyReport(balancedItems, {
  nowMs: Date.parse('2026-07-11T10:01:00.000Z'),
  humanReview: { ...parsedHumanReview!, semanticDuplicateCount: 1 },
});
assert('human review cannot pass with semantic duplicates or platform and sentence residue',
  duplicateFound.superiorityGate === 'fail'
    && buildLiveGoldenSupplyReport(balancedItems, {
      nowMs: Date.parse('2026-07-11T10:01:00.000Z'),
      humanReview: { ...parsedHumanReview!, platformResidueCount: 1 },
    }).superiorityGate === 'fail'
    && buildLiveGoldenSupplyReport(balancedItems, {
      nowMs: Date.parse('2026-07-11T10:01:00.000Z'),
      humanReview: { ...parsedHumanReview!, sentenceResidueCount: 1 },
    }).superiorityGate === 'fail');

const dominatedItems = [
  ...Array.from({ length: 18 }, (_, index) => measuredItem(`정책 키워드 ${index}`, 'policy', index)),
  ...Array.from({ length: 5 }, (_, index) => measuredItem(`교육 키워드 ${index}`, 'education', index)),
];
const dominated = buildLiveGoldenSupplyReport(dominatedItems, {
  nowMs: Date.parse('2026-07-11T10:00:00.000Z'),
  verifiedTarget: 60,
  minimumActiveCoreCategories: 10,
});
assert('policy-dominated production-like portfolio fails with explicit reasons',
  dominated.verifiedCount === 23
    && dominated.activeCoreCategoryCount === 2
    && dominated.maximumCoreCategoryShare > 0.7
    && dominated.automatedSupplyGate === 'fail'
    && dominated.failureReasons.includes('verified-target-shortfall')
    && dominated.failureReasons.includes('category-coverage-shortfall')
    && dominated.failureReasons.includes('category-share-cap-exceeded'),
  JSON.stringify(dominated));
assert('human attestation cannot override a failed automated supply gate',
  buildLiveGoldenSupplyReport(dominatedItems, {
    nowMs: Date.parse('2026-07-11T10:01:00.000Z'),
    humanReview: parsedHumanReview,
  }).superiorityGate === 'fail');

const incomplete = measuredItem('미측정 후보', 'health', 1);
incomplete.isMeasured = false;
incomplete.documentCount = null;
incomplete.documentCountSource = 'fallback';
const incompleteReport = buildLiveGoldenSupplyReport([incomplete], {
  nowMs: Date.parse('2026-07-11T10:00:00.000Z'),
  verifiedTarget: 1,
  minimumActiveCoreCategories: 1,
});
assert('unmeasured fallback rows are excluded from verified supply',
  incompleteReport.verifiedCount === 0
    && incompleteReport.untrustedCount === 1
    && incompleteReport.measuredCompletenessRate === 0,
  JSON.stringify(incompleteReport));

const missingDocumentScope = measuredItem('missing exact scope', 'finance', 6);
delete missingDocumentScope.documentCountQueryMode;
const missingDocumentScopeReport = buildLiveGoldenSupplyReport([missingDocumentScope], {
  nowMs: Date.parse('2026-07-11T10:00:00.000Z'),
  verifiedTarget: 1,
  minimumActiveCoreCategories: 1,
});
assert('document counts without an exact-phrase scope remain untrusted',
  missingDocumentScopeReport.verifiedCount === 0
    && missingDocumentScopeReport.untrustedCount === 1
    && missingDocumentScopeReport.failureReasons.includes('untrusted-row-present'),
  JSON.stringify(missingDocumentScopeReport));

const broadDocumentScope = measuredItem('broad document scope', 'finance', 7);
broadDocumentScope.documentCountQueryMode = 'broad';
const broadDocumentScopeReport = buildLiveGoldenSupplyReport([broadDocumentScope], {
  nowMs: Date.parse('2026-07-11T10:00:00.000Z'),
  verifiedTarget: 1,
  minimumActiveCoreCategories: 1,
});
assert('canonical broad Naver OpenAPI document counts satisfy verified supply',
  broadDocumentScopeReport.verifiedCount === 1
    && broadDocumentScopeReport.untrustedCount === 0
    && !broadDocumentScopeReport.failureReasons.includes('untrusted-row-present'),
  JSON.stringify(broadDocumentScopeReport));

const scrapedDocumentCount = measuredItem('scraped document count', 'finance', 8);
scrapedDocumentCount.documentCountSource = 'scrape';
const scrapedDocumentCountReport = buildLiveGoldenSupplyReport([scrapedDocumentCount], {
  nowMs: Date.parse('2026-07-11T10:00:00.000Z'),
  verifiedTarget: 1,
  minimumActiveCoreCategories: 1,
});
assert('scraped document counts remain untrusted even when labeled exact-phrase',
  scrapedDocumentCountReport.verifiedCount === 0
    && scrapedDocumentCountReport.untrustedCount === 1
    && scrapedDocumentCountReport.failureReasons.includes('untrusted-row-present'),
  JSON.stringify(scrapedDocumentCountReport));

for (const [label, mutate] of [
  ['missing measured flag', (item: any) => { delete item.isMeasured; }],
  ['missing search-volume estimated flag', (item: any) => { delete item.isSearchVolumeEstimated; }],
  ['missing document-count estimated flag', (item: any) => { delete item.isDocumentCountEstimated; }],
] as const) {
  const unknownProvenance = measuredItem(label, 'finance', 20);
  mutate(unknownProvenance);
  const unknownProvenanceReport = buildLiveGoldenSupplyReport([unknownProvenance], {
    nowMs: Date.parse('2026-07-11T10:00:00.000Z'),
    verifiedTarget: 1,
    minimumActiveCoreCategories: 1,
  });
  assert(`${label} remains untrusted instead of being inferred as measured`,
    unknownProvenanceReport.verifiedCount === 0
      && unknownProvenanceReport.untrustedCount === 1
      && unknownProvenanceReport.failureReasons.includes('untrusted-row-present'),
    JSON.stringify(unknownProvenanceReport));
}

const splitless = measuredItem('사대보험계산기프리랜서', 'insurance_safe', 2);
splitless.pcSearchVolume = 0;
splitless.mobileSearchVolume = 0;
splitless.totalSearchVolume = 43600;
const splitlessReport = buildLiveGoldenSupplyReport([splitless], {
  nowMs: Date.parse('2026-07-11T10:00:00.000Z'),
  verifiedTarget: 1,
  minimumActiveCoreCategories: 1,
});
assert('splitless total-only rows cannot satisfy measured completeness',
  splitlessReport.verifiedCount === 0
    && splitlessReport.untrustedCount === 1
    && splitlessReport.measuredCompletenessRate === 0
    && splitlessReport.failureReasons.includes('untrusted-row-present'),
  JSON.stringify(splitlessReport));

const unversioned = measuredItem('legacy positional binding', 'finance', 3);
delete unversioned.searchVolumeBindingVersion;
const unversionedReport = buildLiveGoldenSupplyReport([unversioned], {
  nowMs: Date.parse('2026-07-11T10:00:00.000Z'),
  verifiedTarget: 1,
  minimumActiveCoreCategories: 1,
});
assert('legacy positional SearchAd bindings stay untrusted until keyword-keyed revalidation',
  unversionedReport.verifiedCount === 0
    && unversionedReport.untrustedCount === 1
    && unversionedReport.failureReasons.includes('untrusted-row-present'),
  JSON.stringify(unversionedReport));

const inconsistentSplit = measuredItem('mismatched bound total', 'finance', 4);
inconsistentSplit.totalSearchVolume = 999;
const inconsistentSplitReport = buildLiveGoldenSupplyReport([inconsistentSplit], {
  nowMs: Date.parse('2026-07-11T10:00:00.000Z'),
  verifiedTarget: 1,
  minimumActiveCoreCategories: 1,
});
assert('keyword binding marker cannot bless a total that differs from its PC/mobile split',
  inconsistentSplitReport.verifiedCount === 0
    && inconsistentSplitReport.untrustedCount === 1
    && inconsistentSplitReport.failureReasons.includes('untrusted-row-present'),
  JSON.stringify(inconsistentSplitReport));

const oneSidedNullSplit = measuredItem('one-sided null split', 'finance', 5);
oneSidedNullSplit.pcSearchVolume = null;
oneSidedNullSplit.mobileSearchVolume = 1000;
oneSidedNullSplit.totalSearchVolume = 1000;
const oneSidedNullSplitReport = buildLiveGoldenSupplyReport([oneSidedNullSplit], {
  nowMs: Date.parse('2026-07-11T10:00:00.000Z'),
  verifiedTarget: 1,
  minimumActiveCoreCategories: 1,
});
assert('one-sided null SearchAd split cannot be coerced to zero and counted as verified',
  oneSidedNullSplitReport.verifiedCount === 0
    && oneSidedNullSplitReport.untrustedCount === 1
    && oneSidedNullSplitReport.measuredCompletenessRate === 0
    && oneSidedNullSplitReport.failureReasons.includes('untrusted-row-present'),
  JSON.stringify(oneSidedNullSplitReport));

function shareBoundaryPortfolio(total: number): any[] {
  const dominant = Array.from({ length: 11 }, (_, index) => measuredItem(
    `dominant-policy-${index}`,
    LIVE_GOLDEN_CORE_CATEGORY_POLICIES[0].discoveryIds[0],
    index,
  ));
  const remainingPolicies = LIVE_GOLDEN_CORE_CATEGORY_POLICIES.slice(1);
  const remaining = Array.from({ length: total - dominant.length }, (_, index) => {
    const policy = remainingPolicies[index % remainingPolicies.length];
    return measuredItem(`balanced-${policy.key}-${index}`, policy.discoveryIds[0], index + 100);
  });
  return [...dominant, ...remaining];
}

const shareFailAt60 = buildLiveGoldenSupplyReport(shareBoundaryPortfolio(60), {
  nowMs: Date.parse('2026-07-11T10:00:00.000Z'),
});
assert('11 of 60 fails the raw 18 percent share cap',
  shareFailAt60.maximumCoreCategoryShare > 0.18
    && shareFailAt60.failureReasons.includes('category-share-cap-exceeded'),
  JSON.stringify(shareFailAt60));

const sharePassAt62 = buildLiveGoldenSupplyReport(shareBoundaryPortfolio(62), {
  nowMs: Date.parse('2026-07-11T10:00:00.000Z'),
});
assert('11 of 62 passes the raw 18 percent share cap',
  sharePassAt62.maximumCoreCategoryShare < 0.18
    && !sharePassAt62.failureReasons.includes('category-share-cap-exceeded')
    && sharePassAt62.automatedSupplyGate === 'pass',
  JSON.stringify(sharePassAt62));

console.log('[live-golden-supply-report.test] passed');

export {};
