/**
 * pro-traffic-sss-100run.test.ts
 *
 * PRO Traffic Hunter is the higher-capacity successor to golden discovery.
 * If a category pool contains enough data-valid SSS candidates, final ranking
 * must preserve 30/50/100/250 SSS floors instead of collapsing to a shallow set.
 */

import {
  PRO_TRAFFIC_CATEGORY_SSS_FLOOR,
  PRO_TRAFFIC_MAX_RESULT_COUNT,
  countProTrafficSss,
  getProTrafficCategoryMiningPoolSize,
  getProTrafficFinalRerankPoolSize,
  normalizeProTrafficResultCount,
  rankProTrafficSssFloorResults,
  selectProTrafficSssPromotionCandidates,
} from '../pro-traffic-floor';

type ProFixtureKeyword = {
  keyword: string;
  grade: 'SSS' | 'SS' | 'S' | 'A' | 'B';
  category: string;
  searchVolume: number;
  documentCount: number;
  goldenRatio: number;
  totalScore: number;
  profitAnalysis: {
    profitGoldenRatio: number;
    estimatedMonthlyRevenue: number;
    purchaseIntentScore: number;
  };
  revenueEstimate: {
    estimatedCPC: number;
    revenueGrade: 'SSS' | 'SS' | 'S' | 'A';
  };
};

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`FAIL ${name}${detail ? ' - ' + detail : ''}`);
  }
}

function compact(keyword: string): string {
  return keyword.toLowerCase().replace(/\s+/g, '').trim();
}

function rotate<T>(items: T[], amount: number): T[] {
  if (items.length === 0) return [];
  const n = amount % items.length;
  return [...items.slice(n), ...items.slice(0, n)];
}

const proCategories = [
  {
    category: 'policy',
    seeds: ['청년 월세 지원', '근로장려금 신청', '소상공인 정책자금', '전기차 보조금', '긴급복지 생계지원'],
    intents: ['대상', '신청방법', '지급일', '서류', '마감', '조회'],
  },
  {
    category: 'celeb',
    seeds: ['아이돌 팬미팅', '배우 공식입장', '콘서트 티켓팅', '컴백 쇼케이스', '시상식 라인업'],
    intents: ['예매', '좌석', '일정', '근황', '공식영상', '인스타'],
  },
  {
    category: 'finance',
    seeds: ['청년도약계좌', 'ISA 계좌', '연말정산 환급', '자동차 보험료', '주택청약 통장'],
    intents: ['조건', '한도', '비교', '신청방법', '세액공제', '조회'],
  },
  {
    category: 'health',
    seeds: ['건강검진 대상자', '오메가3 복용법', '단백질 쉐이크', '혈당 관리', '러닝화 추천'],
    intents: ['효능', '부작용', '비교', '검사', '후기', '주의사항'],
  },
  {
    category: 'it',
    seeds: ['갤럭시 업데이트', '아이폰 설정', '노트북 추천', 'AI 툴 비교', '윈도우 오류 해결'],
    intents: ['사용법', '설정', '비교', '가격', '후기', '오류'],
  },
];

function buildPool(run: number, requestedCount: number): ProFixtureKeyword[] {
  const fixture = proCategories[run % proCategories.length];
  const sssCount = Math.max(PRO_TRAFFIC_CATEGORY_SSS_FLOOR + 12, requestedCount + 24);
  const lowerCount = Math.max(80, Math.ceil(requestedCount * 1.4));

  const sss = Array.from({ length: sssCount }, (_, i): ProFixtureKeyword => {
    const seed = fixture.seeds[(i + run) % fixture.seeds.length];
    const intent = fixture.intents[(i * 2 + run) % fixture.intents.length];
    const volume = 900 + ((run * 101 + i * 197) % 16000);
    const docCount = 220 + ((run * 53 + i * 89) % 3600);
    const ratio = Math.max(0.8, volume / Math.max(1, docCount));
    return {
      keyword: `2026 ${seed} ${intent} PRO ${i + 1}`,
      grade: 'SSS',
      category: fixture.category,
      searchVolume: volume,
      documentCount: docCount,
      goldenRatio: Number(ratio.toFixed(2)),
      totalScore: 98 - ((i + run) % 18) * 0.15,
      profitAnalysis: {
        profitGoldenRatio: Number((ratio * 12).toFixed(2)),
        estimatedMonthlyRevenue: 20000 + volume * 18,
        purchaseIntentScore: 92 - (i % 7),
      },
      revenueEstimate: {
        estimatedCPC: 450 + (i % 13) * 35,
        revenueGrade: 'SSS',
      },
    };
  });

  const lower = Array.from({ length: lowerCount }, (_, i): ProFixtureKeyword => {
    const seed = fixture.seeds[(i + 2) % fixture.seeds.length];
    const intent = fixture.intents[(i + 3) % fixture.intents.length];
    return {
      keyword: `${seed} ${intent} 일반 PRO 후보 ${run}-${i}`,
      grade: i % 3 === 0 ? 'SS' : i % 3 === 1 ? 'S' : 'A',
      category: fixture.category,
      searchVolume: 500 + i * 17,
      documentCount: 8000 + i * 131,
      goldenRatio: 0.2 + (i % 7) * 0.08,
      totalScore: 82 - (i % 20),
      profitAnalysis: {
        profitGoldenRatio: 3 + (i % 5),
        estimatedMonthlyRevenue: 3000 + i * 700,
        purchaseIntentScore: 50 + (i % 15),
      },
      revenueEstimate: {
        estimatedCPC: 120 + (i % 6) * 25,
        revenueGrade: i % 2 === 0 ? 'SS' : 'S',
      },
    };
  });

  const duplicateSss = sss.slice(0, 6).map(item => ({
    ...item,
    keyword: item.keyword.replace(/\s+/g, ''),
    totalScore: item.totalScore - 0.5,
  }));

  return rotate([...lower, ...duplicateSss, ...sss], run * 29);
}

assert('PRO category mode still floors tiny requests to 30',
  normalizeProTrafficResultCount('category', 10) === PRO_TRAFFIC_CATEGORY_SSS_FLOOR);
assert('PRO category mode supports 250 requested results',
  normalizeProTrafficResultCount('category', 250) === PRO_TRAFFIC_MAX_RESULT_COUNT);
assert('PRO 250 mode uses a deep rerank pool',
  getProTrafficFinalRerankPoolSize(250, false) >= 1000,
  `${getProTrafficFinalRerankPoolSize(250, false)}`);
assert('PRO 30 mode uses a 12x+ rerank pool over the visible SSS floor',
  getProTrafficFinalRerankPoolSize(30, false) >= PRO_TRAFFIC_CATEGORY_SSS_FLOOR * 12,
  `${getProTrafficFinalRerankPoolSize(30, false)}`);
assert('PRO 250 mode uses a 2000+ rerank pool as the golden-discovery supersetter',
  getProTrafficFinalRerankPoolSize(250, false) >= 2000,
  `${getProTrafficFinalRerankPoolSize(250, false)}`);
assert('PRO 250 explosion mode also uses a deep rerank pool',
  getProTrafficFinalRerankPoolSize(250, true) >= 1000,
  `${getProTrafficFinalRerankPoolSize(250, true)}`);
assert('PRO category mining pool is deeper than the visible floor',
  getProTrafficCategoryMiningPoolSize(30, false) > PRO_TRAFFIC_CATEGORY_SSS_FLOOR,
  `${getProTrafficCategoryMiningPoolSize(30, false)}`);
assert('PRO category 250 mode mines 1000+ before selecting 250 visible SSS',
  getProTrafficCategoryMiningPoolSize(250, false) >= 1000,
  `${getProTrafficCategoryMiningPoolSize(250, false)}`);
assert('PRO category 250 mode mines 2000+ before selecting 250 visible SSS',
  getProTrafficCategoryMiningPoolSize(250, false) >= 2000,
  `${getProTrafficCategoryMiningPoolSize(250, false)}`);

const blockedBeforeEligible = [
  ...Array.from({ length: 35 }, (_, i): ProFixtureKeyword => ({
    keyword: `blocked red ocean top candidate ${i + 1}`,
    grade: 'SS',
    category: 'policy',
    searchVolume: 5000 + i,
    documentCount: 250000 + i,
    goldenRatio: 0.02,
    totalScore: 99,
    profitAnalysis: {
      profitGoldenRatio: 0.2,
      estimatedMonthlyRevenue: 50000,
      purchaseIntentScore: 95,
    },
    revenueEstimate: {
      estimatedCPC: 700,
      revenueGrade: 'SS',
    },
  })),
  ...Array.from({ length: 270 }, (_, i): ProFixtureKeyword => ({
    keyword: `eligible policy support sss candidate ${i + 1}`,
    grade: 'SS',
    category: 'policy',
    searchVolume: 1800 + i,
    documentCount: 650 + i,
    goldenRatio: Number(((1800 + i) / (650 + i)).toFixed(2)),
    totalScore: 96,
    profitAnalysis: {
      profitGoldenRatio: 30,
      estimatedMonthlyRevenue: 80000,
      purchaseIntentScore: 91,
    },
    revenueEstimate: {
      estimatedCPC: 650,
      revenueGrade: 'SSS',
    },
  })),
];

const promoted30 = selectProTrafficSssPromotionCandidates(
  blockedBeforeEligible,
  30,
  true,
  item => item.goldenRatio >= 1 && item.documentCount <= 10000,
);
assert('PRO dynamic SSS promotion scans beyond the first requested bucket',
  promoted30.length === PRO_TRAFFIC_CATEGORY_SSS_FLOOR,
  `${promoted30.length}`);
assert('PRO dynamic SSS promotion skips blocked high-score red-ocean candidates',
  promoted30.every(item => item.keyword.startsWith('eligible policy support')),
  promoted30.map(item => item.keyword).slice(0, 5).join(', '));

const promoted250 = selectProTrafficSssPromotionCandidates(
  blockedBeforeEligible,
  250,
  true,
  item => item.goldenRatio >= 1 && item.documentCount <= 10000,
);
assert('PRO 250 mode keeps scanning until 250 SSS-eligible candidates are found',
  promoted250.length === 250,
  `${promoted250.length}`);

const requestedCounts = [10, 30, 50, 100, 250];

for (let run = 0; run < 100; run++) {
  const requested = requestedCounts[run % requestedCounts.length];
  const expected = normalizeProTrafficResultCount('category', requested);
  const ranked = rankProTrafficSssFloorResults(buildPool(run, expected), requested, true);
  const sssCount = countProTrafficSss(ranked);
  const firstTarget = ranked.slice(0, expected);
  const duplicateCount = ranked.length - new Set(ranked.map(item => compact(item.keyword))).size;

  assert(`run ${run + 1}: returns requested category target`,
    ranked.length === expected,
    `requested=${requested}, expected=${expected}, actual=${ranked.length}`);
  assert(`run ${run + 1}: SSS fills category target`,
    sssCount >= expected,
    `requested=${requested}, expected=${expected}, sss=${sssCount}`);
  assert(`run ${run + 1}: first target bucket is SSS only`,
    firstTarget.every(item => item.grade === 'SSS'),
    firstTarget.map(item => item.grade).join(','));
  assert(`run ${run + 1}: data-valid PRO SSS metrics are preserved`,
    firstTarget.every(item =>
      item.searchVolume > 0
      && item.documentCount > 0
      && item.goldenRatio > 0
      && item.profitAnalysis.purchaseIntentScore >= 80
    ),
    firstTarget.map(item => `${item.keyword}:${item.searchVolume}/${item.documentCount}/${item.goldenRatio}`).join('|'));
  assert(`run ${run + 1}: compact duplicates are removed`,
    duplicateCount === 0,
    `${duplicateCount}`);
}

console.log(`\n[pro-traffic-sss-100run.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
