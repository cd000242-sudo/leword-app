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

console.log('[live-golden-supply-report.test] passed');

export {};
