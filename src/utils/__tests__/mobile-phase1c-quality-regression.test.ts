import { __liveGoldenRadarTestInternals } from '../../mobile/live-golden-radar';
import { liveGoldenPolicyKeyForDiscoveryId } from '../../mobile/live-golden-category-policy';

const {
  goldenBoardSemanticId,
  inferLiveCategory,
  liveGradeFromMetrics,
  normalizeLiveMetricGrade,
  publicLiveGoldenIntent,
  resolveDeclaredLiveCategory,
} = __liveGoldenRadarTestInternals as {
  goldenBoardSemanticId: (keyword: string) => string;
  inferLiveCategory: (keyword: string, categoryId: string) => string;
  liveGradeFromMetrics: (
    score: number,
    volume: number,
    docs: number,
    ratio: number,
    keyword?: string,
  ) => string;
  normalizeLiveMetricGrade: (
    keyword: string,
    currentGrade: string,
    score: number,
    volume: number,
    docs: number,
    ratio: number,
  ) => string;
  publicLiveGoldenIntent: (keyword: string, intent?: string) => string;
  resolveDeclaredLiveCategory: (keyword: string, category: string, policyKey?: string) => string;
};

const failures: string[] = [];

function expectEqual(label: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    failures.push(`${label}: expected=${String(expected)} actual=${String(actual)}`);
  }
}

const semanticDuplicateClusters: Array<{ label: string; keywords: string[] }> = [
  {
    label: '근로장려금 금액/지급액 조회',
    keywords: ['근로장려금금액조회', '근로장려금지급액조회'],
  },
  {
    label: '실비/실손 보험 청구서류',
    keywords: ['의료실비보험청구서류', '실손보험청구서류', '실비보험청구서류'],
  },
  {
    label: '국민내일배움카드 자격',
    keywords: ['내일배움카드자격', '국민내일배움카드자격'],
  },
  {
    label: '국민내일배움카드 사용처 조회',
    keywords: ['국민내일배움카드사용처', '국민내일배움카드사용처조회'],
  },
  {
    label: '강아지 스케일링/치석제거 비용',
    keywords: ['강아지스케일링비용', '강아지치석제거비용'],
  },
];

for (const cluster of semanticDuplicateClusters) {
  const semanticIds = cluster.keywords.map((keyword) => goldenBoardSemanticId(keyword));
  expectEqual(
    `semantic duplicate cluster (${cluster.label})`,
    new Set(semanticIds).size,
    1,
  );
}

const distinctSemanticIntentPairs = [
  ['근로장려금신청조회', '근로장려금금액조회'],
  ['실비보험청구방법', '실비보험청구서류'],
  ['국민내일배움카드사용처', '국민내일배움카드자격'],
  ['강아지스케일링후기', '강아지스케일링비용'],
];

for (const [left, right] of distinctSemanticIntentPairs) {
  expectEqual(
    `distinct semantic intents (${left} / ${right})`,
    goldenBoardSemanticId(left) === goldenBoardSemanticId(right),
    false,
  );
}

const categoryPolicyCases = [
  { keyword: '자동차검사예약', expectedCategory: 'car', expectedPolicy: 'auto' },
  { keyword: '개인사업자 부가세 신고 방법', expectedCategory: 'finance', expectedPolicy: 'finance_insurance' },
  { keyword: '국민내일배움카드사용처', expectedCategory: 'education', expectedPolicy: 'education_jobs' },
  { keyword: '중문설치비용', expectedCategory: 'interior', expectedPolicy: 'home_life' },
  { keyword: '주방인테리어견적', expectedCategory: 'interior', expectedPolicy: 'home_life' },
  { keyword: '도어락교체비용', expectedCategory: 'home_life', expectedPolicy: 'home_life' },
  { keyword: '부산문화누리카드사용처', expectedCategory: 'policy', expectedPolicy: 'policy' },
  { keyword: '근무시간계산기', expectedCategory: 'education', expectedPolicy: 'education_jobs' },
  { keyword: '전산회계자격증', expectedCategory: 'education', expectedPolicy: 'education_jobs' },
];

for (const testCase of categoryPolicyCases) {
  const category = inferLiveCategory(testCase.keyword, 'all');
  const policy = liveGoldenPolicyKeyForDiscoveryId(category);
  expectEqual(
    `category (${testCase.keyword})`,
    category,
    testCase.expectedCategory,
  );
  expectEqual(
    `category policy (${testCase.keyword}; category=${category})`,
    policy,
    testCase.expectedPolicy,
  );
}

const persistedCategoryCases = [
  { keyword: '자동차검사예약', stored: 'health', declaredPolicy: 'health', expected: 'car' },
  { keyword: '도어락교체비용', stored: 'car', declaredPolicy: 'auto', expected: 'home_life' },
  { keyword: '부산문화누리카드사용처', stored: 'travel_domestic', declaredPolicy: 'travel', expected: 'policy' },
];

for (const testCase of persistedCategoryCases) {
  expectEqual(
    `persisted category override (${testCase.keyword})`,
    resolveDeclaredLiveCategory(testCase.keyword, testCase.stored, testCase.declaredPolicy),
    testCase.expected,
  );
}

const unifiedGradeCases = [
  {
    label: '노트북 SSD 교체 비용',
    keyword: '노트북 SSD 교체 비용',
    score: 80,
    volume: 200,
    docs: 44,
    ratio: 4.55,
    expectedGrade: 'A',
  },
  {
    label: '국세청 근로장려금 지급일',
    keyword: '국세청근로장려금지급일',
    score: 84,
    volume: 380,
    docs: 46,
    ratio: 8.26,
    expectedGrade: 'S',
  },
  {
    label: '대장내시경 비용',
    keyword: '대장내시경비용',
    score: 80,
    volume: 10_600,
    docs: 3_499,
    ratio: 3.03,
    expectedGrade: 'SS',
  },
];

for (const testCase of unifiedGradeCases) {
  const grade = liveGradeFromMetrics(
    testCase.score,
    testCase.volume,
    testCase.docs,
    testCase.ratio,
    testCase.keyword,
  );
  expectEqual(`unified grade cascade (${testCase.label})`, grade, testCase.expectedGrade);
}

expectEqual(
  'persisted grade upgrades to the metric SSoT',
  normalizeLiveMetricGrade('대장내시경비용', 'S', 80, 10_600, 3_499, 3.03),
  'SS',
);
expectEqual(
  'persisted grade downgrades to the metric SSoT',
  normalizeLiveMetricGrade('노트북 SSD 교체 비용', 'SSS', 80, 200, 44, 4.55),
  'A',
);

const publicIntentCases = [
  { keyword: '2026근로장려금지급일', stored: 'persistent-measured-golden-cache', expected: 'Informational' },
  { keyword: '송지호바다하늘길입장료', stored: 'measured-cache-golden-discovery', expected: 'Informational' },
  { keyword: '청년미래적금신청일', stored: 'live-golden-discovery', expected: 'Transactional' },
  { keyword: '노트북수리비용', stored: 'Commercial', expected: 'Commercial' },
];

for (const testCase of publicIntentCases) {
  expectEqual(
    `public intent (${testCase.keyword}; stored=${testCase.stored})`,
    publicLiveGoldenIntent(testCase.keyword, testCase.stored),
    testCase.expected,
  );
}

if (failures.length > 0) {
  throw new Error(`mobile Phase 1C quality regression:\n- ${failures.join('\n- ')}`);
}

console.log('[mobile-phase1c-quality-regression.test] passed');
process.exit(0);
