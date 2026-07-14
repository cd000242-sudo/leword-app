import { buildLiveGoldenSupplyReport } from '../../mobile/live-golden-supply-report';
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
