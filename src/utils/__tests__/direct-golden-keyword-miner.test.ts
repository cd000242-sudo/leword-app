import {
  buildDirectGoldenKeywordCandidatePlan,
  resolveDirectGoldenBulkSssTarget,
  shouldContinueDirectGoldenSssHunt,
} from '../direct-golden-keyword-miner';
import {
  isActionableGoldenKeyword,
  rankGoldenDiscoveryResults,
} from '../golden-discovery-floor';

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed++;
    console.log(`PASS ${name}`);
    return;
  }
  failed++;
  console.error(`FAIL ${name}${detail ? ` - ${detail}` : ''}`);
}

function currentLottoRound(now: Date = new Date()): number {
  const firstDrawAtKstMs = Date.UTC(2002, 11, 7, 11, 35, 0);
  const intervalMs = 7 * 24 * 60 * 60 * 1000;
  const nowMs = now.getTime();
  return Math.floor((nowMs - firstDrawAtKstMs) / intervalMs) + 1;
}

const currentYear = new Date().getFullYear();
const lottoRound = currentLottoRound();

const culturePlan = buildDirectGoldenKeywordCandidatePlan({
  category: '문화/엔터',
  maxSeeds: 120,
  maxCandidates: 500,
  liveSeeds: ['새 드라마 제작발표회', '인기 배우 공식입장'],
});

assert(
  'culture plan creates a broad direct candidate pool',
  culturePlan.candidates.length >= 180,
  `count=${culturePlan.candidates.length}`,
);

assert(
  'culture plan includes movie and broadcast writing intents',
  culturePlan.candidates.some(keyword => /출연진|방송시간|OTT 보는곳|결말 해석/.test(keyword)),
  culturePlan.candidates.slice(0, 50).join('|'),
);

const sportsPlan = buildDirectGoldenKeywordCandidatePlan({
  category: '스포츠',
  maxSeeds: 80,
  maxCandidates: 300,
});

assert(
  'sports plan includes event-first intents',
  sportsPlan.candidates.some(keyword => /KBO 올스타전/.test(keyword))
    && sportsPlan.candidates.some(keyword => /중계|예매|티켓팅 일정|라인업/.test(keyword)),
  sportsPlan.candidates.slice(0, 80).join('|'),
);

const boundedHealthPlan = buildDirectGoldenKeywordCandidatePlan({
  category: 'health',
  maxSeeds: 220,
  maxCandidates: 80,
  includeCrossCategory: false,
});
const boundedHealthFamilies = new Set(
  boundedHealthPlan.candidates.slice(0, 80).map((keyword) => (
    ['멀티비타민', '도수치료', '치아보험', '임플란트', '비타민D', '수면다원검사', '예방접종']
      .find((base) => keyword.includes(base)) || ''
  )).filter(Boolean),
);
assert(
  'bounded core-category plan spreads measurement across base families',
  boundedHealthFamilies.size >= 4,
  JSON.stringify([...boundedHealthFamilies]),
);
assert(
  'non-entertainment seeds never receive person-profile residue',
  boundedHealthPlan.candidates.slice(0, 80).every((keyword) => (
    !/(?:멀티비타민|도수치료|치아보험|임플란트|비타민D).*(?:프로필|나이|근황|공식입장|인스타)/.test(keyword)
  )),
  boundedHealthPlan.candidates.slice(0, 40).join('|'),
);
assert(
  'health seeds do not receive policy or product-commerce residue',
  boundedHealthPlan.candidates.slice(0, 80).every((keyword) => (
    !/(?:멀티비타민|도수치료|치아보험|임플란트|비타민D).*(?:신청방법|신청대상|자격|마감|렌탈|최저가|구매처|할인쿠폰)/.test(keyword)
  )),
  boundedHealthPlan.candidates.slice(0, 50).join('|'),
);
const boundedTravelPlan = buildDirectGoldenKeywordCandidatePlan({
  category: 'travel_domestic',
  maxSeeds: 220,
  maxCandidates: 80,
  includeCrossCategory: false,
});
assert(
  'writer-ready curated anchors are measured as real queries without stacked foreign intents',
  boundedTravelPlan.candidates.includes('제주 렌터카 완전자차 가격비교')
    && boundedTravelPlan.candidates.every((keyword) => !/(?:제주 렌터카 완전자차 가격비교|여권 재발급 방법).*(?:예매 일정|주차 입장료|운영시간|준비물)/.test(keyword)),
  boundedTravelPlan.candidates.slice(0, 30).join('|'),
);
const boundedFinancePlan = buildDirectGoldenKeywordCandidatePlan({
  category: 'finance',
  maxSeeds: 220,
  maxCandidates: 80,
  includeCrossCategory: false,
});
assert(
  'finance utility anchors do not receive stock-market residue',
  boundedFinancePlan.candidates.includes('ISA 만기 수령액')
    && boundedFinancePlan.candidates.every((keyword) => !/ISA 만기 수령액.*(?:목표가|실적 발표|배당금|청약 일정)/.test(keyword)),
  boundedFinancePlan.candidates.slice(0, 30).join('|'),
);

const liveEntityPlan = buildDirectGoldenKeywordCandidatePlan({
  category: '',
  maxSeeds: 120,
  maxCandidates: 900,
  includeCrossCategory: true,
  liveSeeds: ['김유정 백아진 다시 만난다', `${lottoRound}회 로또 1등 11명 각 26억`, '하트시그널5'],
});

assert(
  'live titles are split into writeable entity-intent candidates',
  liveEntityPlan.candidates.includes('김유정 프로필')
    && liveEntityPlan.candidates.includes('백아진 프로필')
    && liveEntityPlan.candidates.includes(`${lottoRound}회 로또 당첨번호`)
    && liveEntityPlan.candidates.includes('하트시그널5 몇부작')
    && liveEntityPlan.candidates.includes('하트시그널5 인물관계도'),
  liveEntityPlan.candidates.filter(keyword => /김유정|백아진|로또|하트시그널/.test(keyword)).slice(0, 40).join('|'),
);

const invalidCommercePlan = buildDirectGoldenKeywordCandidatePlan({
  category: '',
  maxSeeds: 120,
  maxCandidates: 900,
  includeCrossCategory: true,
  liveSeeds: [
    '1229회 로또 당첨번호',
    '2026 광복절 대체공휴일',
    '2026 KBO 올스타전',
    '멋진 신세계 몇부작',
    '송지호 바다하늘길 주차',
    '송지호 바다하늘길 입장료',
  ],
});
const invalidCommerceKeywords = invalidCommercePlan.candidates.filter(keyword =>
  /(?:로또|당첨번호|공휴일|대체공휴일|KBO|올스타전|몇부작|송지호|바다하늘길|입장료|주차)/u.test(keyword)
    && /(?:최저가|가격비교|구매처|렌탈|보험\s*적용\s*비용|추천\s*후기)/u.test(keyword),
);

assert(
  'direct plan blocks non-product commerce tails before search-ad measurement',
  invalidCommerceKeywords.length === 0,
  invalidCommerceKeywords.slice(0, 12).join('|'),
);

const allPlan = buildDirectGoldenKeywordCandidatePlan({
  category: '',
  maxSeeds: 120,
  maxCandidates: 500,
  includeCrossCategory: true,
});

assert(
  'direct plan drops english-only candidates',
  allPlan.candidates.every(keyword => /[가-힣]/.test(keyword)),
  allPlan.candidates.filter(keyword => !/[가-힣]/.test(keyword)).slice(0, 10).join('|'),
);

assert(
  'bulk direct discovery keeps a high SSS target instead of stopping at filled slots',
  resolveDirectGoldenBulkSssTarget(120) === 84
    && resolveDirectGoldenBulkSssTarget(60) === 42
    && resolveDirectGoldenBulkSssTarget(30) === 30,
  `${resolveDirectGoldenBulkSssTarget(120)}/${resolveDirectGoldenBulkSssTarget(60)}/${resolveDirectGoldenBulkSssTarget(30)}`,
);

assert(
  'bulk direct discovery continues hunting when visible rows are full but SSS quota is short',
  shouldContinueDirectGoldenSssHunt(
    Array.from({ length: 120 }, (_, i) => ({
      keyword: `吏?먭툑 ?좎껌 ?꾨낫 ${i + 1}`,
      grade: i < 12 ? 'SSS' : 'SS',
      score: i < 12 ? 90 : 78,
      searchVolume: i < 12 ? 2200 : 900,
      documentCount: i < 12 ? 240 : 360,
      goldenRatio: i < 12 ? 9 : 3.1,
      intent: 'test-bulk-sss-target',
      intentBadge: 'TEST',
    })),
    120,
    2600,
    3600,
  ),
);

const calculatorPlan = buildDirectGoldenKeywordCandidatePlan({
  keyword: '\u0034\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30',
  category: 'policy',
  maxSeeds: 80,
  maxCandidates: 260,
});

assert(
  'calculator seeds expand into writer-ready no-space and spaced longtails',
  calculatorPlan.candidates.includes('\u0034\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30 \uD504\uB9AC\uB79C\uC11C')
    && calculatorPlan.candidates.includes('\u0034\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30\uD504\uB9AC\uB79C\uC11C')
    && calculatorPlan.candidates.includes('\u0034\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30 \uC2E4\uC218\uB839\uC561'),
  calculatorPlan.candidates.slice(0, 80).join('|'),
);

assert(
  'calculator seeds expand into compound buyer-ready longtails before measurement',
  calculatorPlan.candidates.includes('\u0034\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30 \uD504\uB9AC\uB79C\uC11C \uC2E4\uC218\uB839\uC561')
    && calculatorPlan.candidates.includes('\u0034\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30\uD504\uB9AC\uB79C\uC11C\uC2E4\uC218\uB839\uC561')
    && calculatorPlan.candidates.includes('\u0034\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30 \uAC1C\uC778\uC0AC\uC5C5\uC790 \uACF5\uC81C\uD56D\uBAA9'),
  calculatorPlan.candidates.slice(0, 120).join('|'),
);

assert(
  'direct plan blocks broad shopping head terms the user rejected',
  !allPlan.candidates.some(keyword => /^(여름\s*)?원피스\s*(추천|코디|사이즈 비교)$/.test(keyword)),
  allPlan.candidates.filter(keyword => /원피스/.test(keyword)).slice(0, 10).join('|'),
);

assert(
  'cross-category plan removes stale exam-answer seeds and keeps live-safe issue intents',
  !allPlan.candidates.some(keyword => /2027 6모|1227회|6모\s*(등급컷|답지|정답)|6월 모의고사\s*(등급컷|답지|정답)/.test(keyword))
    && allPlan.candidates.includes(`${currentYear} 제헌절 공휴일`)
    && allPlan.candidates.includes(`${lottoRound}회 로또 당첨번호`),
  allPlan.candidates.filter(keyword => /6모|1227회|제헌절|강훈식|로또/.test(keyword)).slice(0, 40).join('|'),
);

assert(
  'live-safe issue samples are actionable when measured metrics pass',
  [
    `${lottoRound}회 로또 당첨번호`,
    `${currentYear} 제헌절 공휴일`,
    '중간계 영화 출연진',
    '송지호 바다하늘길 주차',
    '2026 흠뻑쇼 일정',
    'KBO 올스타전 예매 일정',
    '멋진 신세계 공식영상',
    '멋진 신세계 인물관계도',
    '신입사원 강회장 원작',
  ].every(isActionableGoldenKeyword),
);

const ranked = rankGoldenDiscoveryResults([
  {
    keyword: '임영웅 콘서트 예매 일정',
    grade: 'SSS',
    score: 89,
    searchVolume: 27480,
    documentCount: 250,
    goldenRatio: 109.92,
  },
  {
    keyword: '여름 원피스 코디',
    grade: 'SSS',
    score: 90,
    searchVolume: 210,
    documentCount: 339525,
    goldenRatio: 0.0006,
  },
  {
    keyword: 'Knew',
    grade: 'SSS',
    score: 90,
    searchVolume: 10000,
    documentCount: 100,
    goldenRatio: 100,
  },
], 30, false, {
  strictVisibleSssOnly: true,
  requireActionableIntent: true,
  qualityBackfillToTarget: true,
});

assert(
  'ranking keeps measured actionable SSS and drops broad/english noise',
  ranked.length === 1 && ranked[0].keyword === '임영웅 콘서트 예매 일정',
  JSON.stringify(ranked),
);

console.log(`\n[direct-golden-keyword-miner.test] passed: ${passed} / failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
