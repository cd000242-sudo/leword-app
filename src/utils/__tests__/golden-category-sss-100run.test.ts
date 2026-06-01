/**
 * golden-category-sss-100run.test.ts
 *
 * Representative-category golden discovery must not regress into a shallow
 * mixed-topic feed. When enough data-valid SSS candidates exist, the visible
 * result floor must surface 30+ SSS candidates on every deterministic run.
 */

import {
  countSss,
  getGoldenDiscoveryScanLimit,
  rankGoldenDiscoveryResults,
} from '../golden-discovery-floor';

type FixtureKeyword = {
  keyword: string;
  category: string;
  grade: 'SSS' | 'SS' | 'S' | 'A' | 'B';
  score: number;
  searchVolume: number;
  documentCount: number;
  goldenRatio: number;
  cpc: number;
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

const categoryFixtures = [
  {
    category: '지원금',
    seeds: ['청년 지원금', '근로장려금', '소상공인 정책자금', '긴급복지 생계지원', '전기차 보조금'],
    intents: ['신청방법', '대상', '지급일', '서류', '조회', '마감'],
  },
  {
    category: '스타',
    seeds: ['아이돌 콘서트', '배우 팬미팅', '컴백 일정', '시상식 라인업', '공식입장'],
    intents: ['예매', '근황', '일정', '공식영상', '인스타', '출연'],
  },
  {
    category: '교육/자격증',
    seeds: ['한국사능력검정시험', '국비지원 교육', '요양보호사 자격증', '컴활 접수', '토익 시험일정'],
    intents: ['접수', '시험일정', '기출', '준비물', '합격률', '독학'],
  },
  {
    category: '건강/운동',
    seeds: ['건강검진 대상자', '오메가3 복용법', '단백질 쉐이크', '혈당 관리', '러닝화 추천'],
    intents: ['효능', '부작용', '비교', '검사', '후기', '주의사항'],
  },
  {
    category: '재테크/투자',
    seeds: ['청년도약계좌', '연말정산 환급', 'ISA 계좌', '주택청약 통장', '자동차 보험료'],
    intents: ['조건', '한도', '비교', '세액공제', '신청방법', '조회'],
  },
];

function buildRunPool(run: number): FixtureKeyword[] {
  const fixture = categoryFixtures[run % categoryFixtures.length];
  const year = 2026;

  const sss = Array.from({ length: 38 }, (_, i): FixtureKeyword => {
    const seed = fixture.seeds[(i + run) % fixture.seeds.length];
    const intent = fixture.intents[(i * 3 + run) % fixture.intents.length];
    const volume = 1200 + ((run * 37 + i * 173) % 8200);
    const docCount = 120 + ((run * 19 + i * 83) % 1380);
    return {
      keyword: `${year}년 ${seed} ${intent} ${i + 1}`,
      category: fixture.category,
      grade: 'SSS',
      score: 96 - ((run + i) % 12) * 0.25,
      searchVolume: volume,
      documentCount: docCount,
      goldenRatio: Number((Math.max(5.1, volume / Math.max(1, docCount)) + (i % 3) * 0.2).toFixed(2)),
      cpc: 300 + ((run + i) % 9) * 40,
    };
  });

  const lower = Array.from({ length: 70 }, (_, i): FixtureKeyword => {
    const seed = fixture.seeds[(i + 2) % fixture.seeds.length];
    const intent = fixture.intents[(i + 1) % fixture.intents.length];
    return {
      keyword: `${seed} ${intent} 일반 후보 ${run}-${i}`,
      category: fixture.category,
      grade: i % 3 === 0 ? 'SS' : i % 3 === 1 ? 'S' : 'A',
      score: 82 - (i % 15),
      searchVolume: 700 + i * 11,
      documentCount: 9000 + i * 120,
      goldenRatio: 1.2 + (i % 4) * 0.3,
      cpc: 150,
    };
  });

  const duplicates = sss.slice(0, 4).map(item => ({
    ...item,
    keyword: item.keyword.replace(/\s+/g, ''),
    score: item.score - 0.1,
  }));

  return rotate([...lower, ...duplicates, ...sss], run * 17);
}

const categoryScanLimit = getGoldenDiscoveryScanLimit(30, false, 360, { categoryFirst: true });
assert('category-first scan limit is deep enough for a 30 SSS floor',
  categoryScanLimit >= 4000,
  `${categoryScanLimit}`);

const normalScanLimit = getGoldenDiscoveryScanLimit(30, false, 360);
assert('non-category scan limit stays bounded',
  normalScanLimit <= 5000,
  `${normalScanLimit}`);

for (let run = 0; run < 100; run++) {
  const pool = buildRunPool(run);
  const requestedLimit = [10, 20, 30][run % 3];
  const ranked = rankGoldenDiscoveryResults(pool, requestedLimit, false);
  const sssCount = countSss(ranked);
  const firstThirty = ranked.slice(0, 30);
  const duplicateCount = ranked.length - new Set(ranked.map(item => compact(item.keyword))).size;

  assert(`run ${run + 1}: visible SSS count is 30+`,
    sssCount >= 30,
    `requested=${requestedLimit}, sss=${sssCount}`);
  assert(`run ${run + 1}: top 30 are all SSS when enough SSS exists`,
    firstThirty.length === 30 && firstThirty.every(item => item.grade === 'SSS'),
    firstThirty.map(item => item.grade).join(','));
  assert(`run ${run + 1}: SSS fixtures obey data gates`,
    firstThirty.every(item =>
      item.searchVolume >= 1000
      && item.documentCount <= 5000
      && item.goldenRatio >= 5
      && item.score >= 85
    ),
    firstThirty.map(item => `${item.keyword}:${item.searchVolume}/${item.documentCount}/${item.goldenRatio}/${item.score}`).join('|'));
  assert(`run ${run + 1}: compact duplicates are removed`,
    duplicateCount === 0,
    `${duplicateCount}`);
}

console.log(`\n[golden-category-sss-100run.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
