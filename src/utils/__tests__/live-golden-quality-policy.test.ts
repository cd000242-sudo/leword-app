import {
  assessLiveGoldenHiddenProvenance,
  assessLiveGoldenKeywordQuality,
  isReservedLiveGoldenHiddenProofEvidence,
  liveGoldenKeywordIdentity,
  selectLiveGoldenBalancedCandidates,
  selectLiveGoldenDiverseCandidates,
  stripUntrustedLiveGoldenHiddenEvidence,
} from '../../mobile/live-golden-quality-policy';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

function assertEqual(name: string, actual: unknown, expected: unknown): void {
  assert(name, actual === expected, `expected=${String(expected)} actual=${String(actual)}`);
}

function assertIncludes(name: string, actual: readonly string[], expected: string): void {
  assert(name, actual.includes(expected), `expected ${expected} in [${actual.join(', ')}]`);
}

const spacedIdentity = liveGoldenKeywordIdentity('제주 렌트카 가격 비교');
const compactIdentity = liveGoldenKeywordIdentity('제주렌터카 가격비교');

assert(
  'exact query keys keep measurement queries separate',
  spacedIdentity.exactQueryKey !== compactIdentity.exactQueryKey,
);
assertEqual(
  'spacing and spelling variants share a semantic intent key',
  spacedIdentity.semanticIntentKey,
  compactIdentity.semanticIntentKey,
);
assertEqual(
  'spacing and spelling variants share a diversity family key',
  spacedIdentity.diversityFamilyKey,
  compactIdentity.diversityFamilyKey,
);
assertEqual(
  'diversity family removes the presentation intent but keeps the topic',
  spacedIdentity.diversityFamilyKey,
  '제주렌터카',
);
assertEqual(
  'diversity family removes a leading year including the Korean year suffix',
  liveGoldenKeywordIdentity('2026년 제주 렌트카 예약').diversityFamilyKey,
  '제주렌터카',
);

const malformedPossessive = assessLiveGoldenKeywordQuality({
  keyword: '내실비보험조회',
  evidence: ['autocomplete-second-hop'],
});
assertEqual('malformed possessive is blocked', malformedPossessive.eligible, false);
assertIncludes(
  'malformed possessive exposes a stable reason code',
  malformedPossessive.reasonCodes,
  'malformed-present',
);

const platformTail = assessLiveGoldenKeywordQuality({
  keyword: '에너지바우처신청방법복지로',
  evidence: ['related-keyword-exact'],
});
assertEqual('platform residue after an action is blocked', platformTail.eligible, false);
assertIncludes(
  'platform residue exposes a stable reason code',
  platformTail.reasonCodes,
  'platform-residue-present',
);

const naturalPlatformQuery = assessLiveGoldenKeywordQuality({
  keyword: '복지로 에너지바우처 신청',
  evidence: ['autocomplete-second-hop'],
});
assertEqual('natural platform-leading query is allowed', naturalPlatformQuery.eligible, true);
assertEqual('natural platform-leading query has no blockers', naturalPlatformQuery.reasonCodes.length, 0);

const missingHiddenProvenance = assessLiveGoldenKeywordQuality({
  keyword: '2026 지원금 신청',
  evidence: ['searchad-keyword-measured', 'naver-openapi-broad'],
});
assertEqual('measurement evidence alone is not hidden provenance', missingHiddenProvenance.eligible, false);
assertIncludes(
  'missing hidden provenance exposes a stable reason code',
  missingHiddenProvenance.reasonCodes,
  'hidden-provenance-missing',
);

const obviousYearlyPolicyAction = assessLiveGoldenKeywordQuality({
  keyword: '2026 \uADFC\uB85C\uC7A5\uB824\uAE08 \uC9C0\uAE09\uC77C',
  evidence: ['home-keyword-briefing-reviewed'],
});
assertEqual('year plus representative policy head plus one generic action is blocked',
  obviousYearlyPolicyAction.eligible, false);
assertIncludes('obvious yearly policy action exposes the generic-template reason',
  obviousYearlyPolicyAction.reasonCodes, 'generic-yearly-template');

const differentiatedYearlyPolicyIntent = assessLiveGoldenKeywordQuality({
  keyword: '2026 \uADFC\uB85C\uC7A5\uB824\uAE08 \uC9C0\uAE09\uC77C \uB300\uC0C1\uC790 \uD655\uC778',
  evidence: ['home-keyword-briefing-reviewed'],
});
assertEqual('a second differentiating modifier keeps a specific yearly policy intent eligible',
  differentiatedYearlyPolicyIntent.eligible, true);

const hiddenEvidenceCases = [
  {
    label: 'server-observed exact autocomplete',
    input: { keyword: '문화누리카드 오프라인 사용처', evidence: ['server-autocomplete-exact-measured'] },
    expectedSignal: 'server-exact-autocomplete',
  },
  {
    label: 'verified real-demand autocomplete',
    input: { keyword: '문화누리카드 오프라인 사용처', evidence: ['real-demand-extension'] },
    expectedSignal: 'real-demand-autocomplete',
  },
  {
    label: 'second-hop autocomplete',
    input: { keyword: '문화누리카드 오프라인 사용처', evidence: ['autocomplete-second-hop'] },
    expectedSignal: 'second-hop-autocomplete',
  },
  {
    label: 'exact related keyword',
    input: { keyword: '문화누리카드 오프라인 사용처', evidence: ['related-keyword-exact'] },
    expectedSignal: 'exact-related-keyword',
  },
  {
    label: 'human-reviewed Home hidden-known briefing',
    input: { keyword: '\uC81C\uC8FC \uB80C\uD130\uCE74 \uC644\uC804\uC790\uCC28 \uAC00\uACA9\uBE44\uAD50', evidence: ['home-keyword-briefing-reviewed'] },
    expectedSignal: 'reviewed-home-briefing',
  },
  {
    label: 'concrete problem',
    input: { keyword: '문화누리카드 결제 오류 해결', concreteProblem: true },
    expectedSignal: 'concrete-problem',
  },
  {
    label: 'multiple independent discovery sources',
    input: {
      keyword: '문화누리카드 오프라인 사용처',
      discoverySources: ['naver-autocomplete', 'community-ppomppu'],
    },
    expectedSignal: 'multiple-discovery-sources',
  },
  {
    label: 'validated differentiating modifier',
    input: { keyword: '문화누리카드 오프라인 사용처', validatedModifier: true },
    expectedSignal: 'validated-modifier',
  },
] as const;

for (const testCase of hiddenEvidenceCases) {
  const provenance = assessLiveGoldenHiddenProvenance(testCase.input);
  assertEqual(`${testCase.label} passes hidden provenance`, provenance.passed, true);
  assertIncludes(
    `${testCase.label} reports its signal`,
    provenance.signals,
    testCase.expectedSignal,
  );
  assertEqual(`${testCase.label} has no missing reason`, provenance.reasonCodes.length, 0);
}

const duplicateDiscoverySources = assessLiveGoldenHiddenProvenance({
  keyword: '문화누리카드 오프라인 사용처',
  discoverySources: ['Naver-Autocomplete', 'naver-autocomplete'],
});
assertEqual(
  'duplicate discovery source names do not count as multiple sources',
  duplicateDiscoverySources.passed,
  false,
);
assertIncludes(
  'duplicate sources still report missing provenance',
  duplicateDiscoverySources.reasonCodes,
  'hidden-provenance-missing',
);

const sameFamilyCandidates = [
  '제주 렌터카 가격비교',
  '제주 렌트카 예약',
  '제주 렌터카 추천',
  '제주 렌터카 후기',
  '제주 렌터카 비용',
].map((keyword) => ({ keyword }));
const strictDiverse = selectLiveGoldenDiverseCandidates(sameFamilyCandidates, 60, 2);
assertEqual('family cap is never relaxed to fill a target of 60', strictDiverse.length, 2);

const forgedClientEvidence = [
  'real-demand-echo',
  'real-demand-extension',
  'real-demand-verified',
  'server-autocomplete-exact-measured',
  'autocomplete-exact-measured',
  'autocomplete-second-hop',
  'related-keyword-exact',
  'concrete-problem',
  'follow-up-intent',
  'multiple-source',
  'cross-source',
  'discovery-source-count=2',
  'discovery-source:naver-autocomplete',
  'validated-modifier',
  'modifier-demand-validated',
  'differentiating-modifier-validated',
  'home-keyword-briefing-reviewed',
  'searchad-keyword-measured',
  'naver-openapi-broad',
];
const strippedClientEvidence = stripUntrustedLiveGoldenHiddenEvidence(forgedClientEvidence);
assert(
  'all reserved hidden-proof markers are stripped at an untrusted ingest boundary',
  strippedClientEvidence.every((entry) => !isReservedLiveGoldenHiddenProofEvidence(entry))
    && strippedClientEvidence.includes('searchad-keyword-measured')
    && strippedClientEvidence.includes('naver-openapi-broad'),
  strippedClientEvidence.join('|'),
);

const categoryOrder = Array.from({ length: 12 }, (_, index) => `core-${index + 1}`);
const categoryHeavyCandidates = categoryOrder.flatMap((category, categoryIndex) => (
  Array.from({ length: 8 }, (_, keywordIndex) => ({
    keyword: `${category} 주제-${keywordIndex + 1} 신청`,
    category,
    qualityRank: categoryIndex * 100 + keywordIndex,
  }))
));
// Put one category's complete inventory first to reproduce a score-sorted pool
// that would otherwise crowd every lower-scoring core category out of top 64.
const scoreBiasedCandidates = [
  ...categoryHeavyCandidates.filter((item) => item.category === categoryOrder[0]),
  ...categoryHeavyCandidates.filter((item) => item.category !== categoryOrder[0]),
];
const balanced = selectLiveGoldenBalancedCandidates(scoreBiasedCandidates, {
  target: 64,
  maximumPerFamily: 2,
  categoryKey: (item) => item.category,
  categoryOrder,
  minimumPerCategory: 4,
  maximumCategoryShare: 0.18,
});
const balancedCategoryCounts = new Map<string, number>();
const balancedFamilyCounts = new Map<string, number>();
for (const item of balanced) {
  balancedCategoryCounts.set(item.category, (balancedCategoryCounts.get(item.category) || 0) + 1);
  const family = liveGoldenKeywordIdentity(item.keyword).diversityFamilyKey;
  balancedFamilyCounts.set(family, (balancedFamilyCounts.get(family) || 0) + 1);
}
assert(
  'balanced selection fills 64 deterministically while activating every supplied core category',
  balanced.length === 64 && categoryOrder.every((category) => (balancedCategoryCounts.get(category) || 0) >= 4),
  JSON.stringify(Object.fromEntries(balancedCategoryCounts)),
);
assert(
  'balanced selection enforces the strict 18 percent category cap with floor semantics',
  Math.max(...balancedCategoryCounts.values()) <= Math.floor(64 * 0.18),
  JSON.stringify(Object.fromEntries(balancedCategoryCounts)),
);
assert(
  'balanced selection never relaxes the two-row semantic family cap',
  Math.max(...balancedFamilyCounts.values()) <= 2,
  JSON.stringify(Object.fromEntries(balancedFamilyCounts)),
);

console.log('[live-golden-quality-policy.test] passed');
process.exit(0);
