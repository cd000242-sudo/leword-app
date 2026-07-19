import {
  assessLiveGoldenKeywordQuality,
  liveGoldenDiversityFamilyKey,
  liveGoldenSemanticIntentKey,
  LIVE_GOLDEN_STRICT_REVIEW_MAXIMUM_PER_FAMILY,
  selectLiveGoldenBalancedCandidates,
  type LiveGoldenQualityReasonCode,
} from '../../mobile/live-golden-quality-policy';

type FailureClass =
  | 'obvious-head'
  | 'generic-yearly-template'
  | 'sentence-residue'
  | 'malformed'
  | 'platform-residue'
  | 'near-duplicate';

interface HiddenKnownBenchmarkFixture {
  keyword: string;
  evidence: string[];
  expectedPositive: boolean;
  failureClass?: FailureClass;
  expectedReason?: LiveGoldenQualityReasonCode;
}

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const trustedExact = ['server-autocomplete-exact-measured'];
const trustedSecondHop = ['autocomplete-second-hop'];
const trustedRelated = ['related-keyword-exact'];
const trustedRealDemand = ['real-demand-extension'];

// Fixed from existing LEWORD fixtures/seed inventories. These are natural
// search phrases with a concrete subject plus a problem, audience, or action.
const positiveCorpus: HiddenKnownBenchmarkFixture[] = [
  { keyword: '문화누리카드 온라인 사용처', evidence: trustedExact, expectedPositive: true },
  { keyword: '실업급여 구직외활동 인정 횟수', evidence: trustedRealDemand, expectedPositive: true },
  { keyword: '자동차 에어컨 필터 교체 비용', evidence: trustedRelated, expectedPositive: true },
  { keyword: '프리랜서 근로장려금 지급액 조회', evidence: trustedExact, expectedPositive: true },
  { keyword: '청년도약계좌 중도해지 불이익', evidence: trustedSecondHop, expectedPositive: true },
  { keyword: '소상공인 정책자금 직접대출 서류', evidence: trustedRelated, expectedPositive: true },
  { keyword: '제주 렌터카 완전자차 비용', evidence: trustedExact, expectedPositive: true },
  { keyword: '국민내일배움카드 온라인 신청 준비물', evidence: trustedRealDemand, expectedPositive: true },
  { keyword: '한부모가정 지원금 소득기준', evidence: trustedExact, expectedPositive: true },
  { keyword: '도수치료 실비 청구 필요서류', evidence: trustedSecondHop, expectedPositive: true },
  { keyword: '로봇청소기 물걸레 냄새 해결', evidence: trustedExact, expectedPositive: true },
  { keyword: '강아지 치석 제거 비용', evidence: trustedRelated, expectedPositive: true },
  { keyword: '2026 근로장려금 지급일 대상자 확인', evidence: trustedExact, expectedPositive: true },
  { keyword: '2026 청년 월세 지원금 신청 서류', evidence: trustedRealDemand, expectedPositive: true },
];

const policyNegativeCorpus: HiddenKnownBenchmarkFixture[] = [
  { keyword: '근로장려금', evidence: trustedExact, expectedPositive: false, failureClass: 'obvious-head', expectedReason: 'obvious-head-term' },
  { keyword: '청년도약계좌', evidence: trustedExact, expectedPositive: false, failureClass: 'obvious-head', expectedReason: 'obvious-head-term' },
  { keyword: '문화누리카드', evidence: trustedExact, expectedPositive: false, failureClass: 'obvious-head', expectedReason: 'obvious-head-term' },
  { keyword: '실업급여', evidence: trustedExact, expectedPositive: false, failureClass: 'obvious-head', expectedReason: 'obvious-head-term' },
  { keyword: '국민내일배움카드', evidence: trustedExact, expectedPositive: false, failureClass: 'obvious-head', expectedReason: 'obvious-head-term' },
  { keyword: '제주 렌터카', evidence: trustedExact, expectedPositive: false, failureClass: 'obvious-head', expectedReason: 'obvious-head-term' },
  { keyword: '자동차 에어컨', evidence: trustedExact, expectedPositive: false, failureClass: 'obvious-head', expectedReason: 'obvious-head-term' },
  { keyword: '2026 지원금', evidence: trustedExact, expectedPositive: false, failureClass: 'generic-yearly-template', expectedReason: 'generic-yearly-template' },
  { keyword: '2026년 정책', evidence: trustedExact, expectedPositive: false, failureClass: 'generic-yearly-template', expectedReason: 'generic-yearly-template' },
  { keyword: '2026 정부 혜택 총정리', evidence: trustedExact, expectedPositive: false, failureClass: 'generic-yearly-template', expectedReason: 'generic-yearly-template' },
  { keyword: '2026 청년 지원금 신청', evidence: trustedExact, expectedPositive: false, failureClass: 'generic-yearly-template', expectedReason: 'generic-yearly-template' },
  { keyword: '근로장려금 지급일은 언제인가요?', evidence: trustedExact, expectedPositive: false, failureClass: 'sentence-residue', expectedReason: 'sentence-residue-present' },
  { keyword: '문화누리카드 어디서 쓸 수 있나요', evidence: trustedExact, expectedPositive: false, failureClass: 'sentence-residue', expectedReason: 'sentence-residue-present' },
  { keyword: '자동차 에어컨 필터를 교체해야 합니다', evidence: trustedExact, expectedPositive: false, failureClass: 'sentence-residue', expectedReason: 'sentence-residue-present' },
  { keyword: '청년도약계좌 중도해지 불이익 알려주세요', evidence: trustedExact, expectedPositive: false, failureClass: 'sentence-residue', expectedReason: 'sentence-residue-present' },
  { keyword: '내 실비보험 조회', evidence: trustedExact, expectedPositive: false, failureClass: 'malformed', expectedReason: 'malformed-present' },
  { keyword: '에너지바우처 신청 복지로', evidence: trustedExact, expectedPositive: false, failureClass: 'platform-residue', expectedReason: 'platform-residue-present' },
];

// Individually natural, but redundant with an earlier positive row. The
// benchmark requires the selector to collapse spelling and presentation tails.
const nearDuplicateCorpus: HiddenKnownBenchmarkFixture[] = [
  { keyword: '제주 렌트카 완전자차 비용', evidence: trustedExact, expectedPositive: false, failureClass: 'near-duplicate' },
  { keyword: '제주 렌터카 완전자차 가격', evidence: trustedExact, expectedPositive: false, failureClass: 'near-duplicate' },
  { keyword: '문화누리카드 온라인 사용처 조회', evidence: trustedExact, expectedPositive: false, failureClass: 'near-duplicate' },
];

for (const fixture of positiveCorpus) {
  const assessment = assessLiveGoldenKeywordQuality(fixture);
  assert(
    `positive hidden-known fixture remains eligible: ${fixture.keyword}`,
    assessment.eligible,
    assessment.reasonCodes.join(','),
  );
}

for (const fixture of policyNegativeCorpus) {
  const assessment = assessLiveGoldenKeywordQuality(fixture);
  assert(
    `negative fixture fails closed: ${fixture.keyword}`,
    !assessment.eligible,
    JSON.stringify(assessment),
  );
  assert(
    `negative fixture exposes its stable reason: ${fixture.keyword}`,
    !!fixture.expectedReason && assessment.reasonCodes.includes(fixture.expectedReason),
    assessment.reasonCodes.join(','),
  );
}

for (const fixture of nearDuplicateCorpus) {
  const assessment = assessLiveGoldenKeywordQuality(fixture);
  assert(
    `near-duplicate fixture is natural before cohort selection: ${fixture.keyword}`,
    assessment.eligible,
    assessment.reasonCodes.join(','),
  );
}

const benchmark = [
  ...positiveCorpus,
  ...policyNegativeCorpus,
  ...nearDuplicateCorpus,
].map((fixture) => ({
  ...fixture,
  assessment: assessLiveGoldenKeywordQuality(fixture),
}));
const selected = selectLiveGoldenBalancedCandidates(
  benchmark.filter((fixture) => fixture.assessment.eligible),
  {
    target: benchmark.length,
    maximumPerFamily: LIVE_GOLDEN_STRICT_REVIEW_MAXIMUM_PER_FAMILY,
    categoryKey: () => 'fixed-hidden-known-benchmark',
    maximumCategoryShare: 1,
  },
);
const selectedKeywords = new Set(selected.map((fixture) => fixture.keyword));
const selectedTruePositives = selected.filter((fixture) => fixture.expectedPositive).length;
const precision = selected.length > 0 ? selectedTruePositives / selected.length : 0;
const positiveRecall = positiveCorpus.filter((fixture) => selectedKeywords.has(fixture.keyword)).length
  / positiveCorpus.length;
const selectedFailureCount = (failureClass: FailureClass): number => selected
  .filter((fixture) => fixture.failureClass === failureClass)
  .length;
const semanticDuplicateCount = selected.length
  - new Set(selected.map((fixture) => liveGoldenSemanticIntentKey(fixture.keyword))).size;
const familyDuplicateCount = selected.length
  - new Set(selected.map((fixture) => liveGoldenDiversityFamilyKey(fixture.keyword))).size;

assert('fixed hidden-known benchmark precision is at least 90 percent', precision >= 0.9, String(precision));
assert('the fixed benchmark uses the same strict family cap as the production review cohort',
  LIVE_GOLDEN_STRICT_REVIEW_MAXIMUM_PER_FAMILY === 1);
assert('fixed hidden-known benchmark positive recall remains exactly 100 percent', positiveRecall === 1, String(positiveRecall));
assert('fixed hidden-known benchmark selects every positive exactly once', selectedTruePositives === positiveCorpus.length, JSON.stringify([...selectedKeywords]));
assert('fixed hidden-known benchmark has zero malformed rows', selectedFailureCount('malformed') === 0);
assert('fixed hidden-known benchmark has zero platform residue rows', selectedFailureCount('platform-residue') === 0);
assert('fixed hidden-known benchmark has zero sentence residue rows', selectedFailureCount('sentence-residue') === 0);
assert('fixed hidden-known benchmark has zero semantic duplicates', semanticDuplicateCount === 0, String(semanticDuplicateCount));
assert('fixed hidden-known benchmark has zero family near-duplicates', familyDuplicateCount === 0, String(familyDuplicateCount));
assert('fixed hidden-known benchmark has zero obvious head terms', selectedFailureCount('obvious-head') === 0);
assert('fixed hidden-known benchmark has zero generic yearly templates', selectedFailureCount('generic-yearly-template') === 0);
assert('fixed hidden-known benchmark has zero selected near-duplicate fixtures', selectedFailureCount('near-duplicate') === 0);

console.log('[live-golden-hidden-known-benchmark.test] passed', {
  selected: selected.length,
  precision,
  positiveRecall,
  malformedCount: selectedFailureCount('malformed'),
  platformResidueCount: selectedFailureCount('platform-residue'),
  sentenceResidueCount: selectedFailureCount('sentence-residue'),
  semanticDuplicateCount,
  familyDuplicateCount,
});
