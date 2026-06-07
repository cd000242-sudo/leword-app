import {
  buildDirectGoldenKeywordCandidatePlan,
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

const liveEntityPlan = buildDirectGoldenKeywordCandidatePlan({
  category: '',
  maxSeeds: 120,
  maxCandidates: 900,
  includeCrossCategory: true,
  liveSeeds: ['김유정 백아진 다시 만난다', '1227회 로또 1등 11명 각 26억', '하트시그널5'],
});

assert(
  'live titles are split into writeable entity-intent candidates',
  liveEntityPlan.candidates.includes('김유정 프로필')
    && liveEntityPlan.candidates.includes('백아진 프로필')
    && liveEntityPlan.candidates.includes('1227회 로또 당첨번호')
    && liveEntityPlan.candidates.includes('하트시그널5 몇부작')
    && liveEntityPlan.candidates.includes('하트시그널5 인물관계도'),
  liveEntityPlan.candidates.filter(keyword => /김유정|백아진|로또|하트시그널/.test(keyword)).slice(0, 40).join('|'),
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
  'direct plan blocks broad shopping head terms the user rejected',
  !allPlan.candidates.some(keyword => /^(여름\s*)?원피스\s*(추천|코디|사이즈 비교)$/.test(keyword)),
  allPlan.candidates.filter(keyword => /원피스/.test(keyword)).slice(0, 10).join('|'),
);

assert(
  'cross-category issue plan includes exam, holiday, and profile intents',
  allPlan.candidates.includes('2027 6모 등급컷')
    && allPlan.candidates.includes('2027 6모 답지')
    && allPlan.candidates.includes('2026 제헌절 공휴일')
    && allPlan.candidates.includes('강훈식 프로필'),
  allPlan.candidates.filter(keyword => /6모|제헌절|강훈식/.test(keyword)).slice(0, 30).join('|'),
);

assert(
  'user-approved issue samples are actionable when measured metrics pass',
  [
    '2027 6모 등급컷',
    '2027 6모 답지',
    '중간계 영화 출연진',
    '송지호 바다하늘길 주차',
    '2026 제헌절 공휴일',
    '강훈식 프로필',
    '1227회 로또 당첨번호',
    '멋진 신세계 공식영상',
    '멋진 신세계 인물관계도',
    '신입사원 강회장 원작',
  ].every(isActionableGoldenKeyword),
);

const ranked = rankGoldenDiscoveryResults([
  {
    keyword: '2027 6모 등급컷',
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
  ranked.length === 1 && ranked[0].keyword === '2027 6모 등급컷',
  JSON.stringify(ranked),
);

console.log(`\n[direct-golden-keyword-miner.test] passed: ${passed} / failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
