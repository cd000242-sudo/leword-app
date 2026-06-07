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
  isActionableGoldenKeyword,
  isQualityGoldenDiscoveryResult,
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

  const invalidSss = Array.from({ length: 8 }, (_, i): FixtureKeyword => ({
    keyword: `invalid fake SSS broad ${run}-${i}`,
    category: fixture.category,
    grade: 'SSS',
    score: 99 - i * 0.1,
    searchVolume: 120 + i * 30,
    documentCount: 100000 + i * 10000,
    goldenRatio: 0.01,
    cpc: 50,
  }));

  return rotate([...lower, ...invalidSss, ...duplicates, ...sss], run * 17);
}

function buildRepetitiveCluster(run: number): FixtureKeyword[] {
  return Array.from({ length: 20 }, (_, i): FixtureKeyword => {
    const searchVolume = 6200 - i * 30;
    const documentCount = 300 + i;
    return {
      keyword: `run ${run} summer dress recommendation variant ${i + 1}`,
      category: 'fashion',
      grade: 'SSS',
      score: 99 - i * 0.05,
      searchVolume,
      documentCount,
      goldenRatio: Number((searchVolume / documentCount).toFixed(2)),
      cpc: 280,
    };
  });
}

const diverseBackfillTopics = [
  '2027 6모 등급컷 발표',
  '여름 하객 원피스 코디',
  '키작녀 원피스 사이즈 비교',
  '임영웅 콘서트 예매 일정',
  '유재석 새 예능 방송시간',
  '프로야구 올스타전 티켓팅 일정',
  '월드컵 예선 중계 시간',
  '드라마 결말 해석',
  '아이돌 컴백 쇼케이스 일정',
  '청년월세지원 신청 서류',
  '근로장려금 지급일 조회',
  '신혼부부 전세대출 조건',
  '장마철 제습기 전기세 비교',
  '40대 선크림 민감성 피부 추천',
  '아이폰17 사전예약 가격',
  '부산 불꽃축제 주차 위치',
  '여름휴가 제주 숙소 예약',
  '반려견 심장사상충 검사 비용',
  '자취 원룸 에어컨 전기세 비교',
  '아파트 청약 당첨자 발표 조회',
  '초등 여름방학 체험학습 신청',
  '대학생 국가장학금 신청 기간',
  '직장인 연말정산 환급 조회',
  'KBO 개막전 예매 일정',
  '방송 출연진 공개 시간',
  '영화 개봉일 예매 일정',
  '서울 축제 입장료 주차',
  '지역 병원 휴일 진료 시간표',
  '고속버스 시간표 예약',
  '도서관 문화강좌 신청 방법',
  '박람회 사전등록 신청',
  '학교 급식 변경 조회',
  '콘서트 좌석 배치도 예매',
  '호텔 패키지 할인 예약',
  '공영주차장 요금 변경',
  '독감 백신 접종 비용',
  '전입신고 준비물 체크리스트',
  '소상공인 정책자금 대상 조건',
  '청년도약계좌 신청 방법',
  '스포츠 결승전 티켓팅 일정',
];

function buildDiverseBackfill(run: number): FixtureKeyword[] {
  return diverseBackfillTopics.map((topic, i): FixtureKeyword => {
    const searchVolume = 3000 + ((run * 29 + i * 137) % 5000);
    const documentCount = 30 + ((run * 7 + i * 13) % 450);
    return {
      keyword: `${topic} ${run}-${i}`,
      category: 'mixed',
      grade: 'SSS',
      score: 94 - (i % 6) * 0.2,
      searchVolume,
      documentCount,
      goldenRatio: Number((searchVolume / documentCount).toFixed(2)),
      cpc: 220 + (i % 7) * 30,
    };
  });
}

function buildBeginnerBareNoise(run: number): FixtureKeyword[] {
  const bareTopics = [
    'dress',
    'samsung',
    'cocobu',
    'breaking news',
    'economy',
    'market',
    'celebrity',
    'weather',
    'sports',
    'coin',
  ];
  return bareTopics.map((topic, i): FixtureKeyword => ({
    keyword: `${topic} ${run}-${i}`,
    category: 'mixed',
    grade: 'SSS',
    score: 99 - i * 0.1,
    searchVolume: 9000 + i * 300,
    documentCount: 40 + i,
    goldenRatio: 90 - i,
    cpc: 100,
  }));
}

function buildQualityBackfill(run: number): FixtureKeyword[] {
  return diverseBackfillTopics.map((topic, i): FixtureKeyword => {
    const isSs = i % 2 === 0;
    const searchVolume = isSs
      ? 700 + ((run * 31 + i * 43) % 1200)
      : 360 + ((run * 17 + i * 29) % 700);
    const documentCount = isSs
      ? 90 + ((run * 11 + i * 7) % 210)
      : 80 + ((run * 13 + i * 5) % 180);
    return {
      keyword: `${topic} 품질보충 ${run}-${i}`,
      category: 'mixed',
      grade: isSs ? 'SS' : 'S',
      score: isSs ? 82 - (i % 5) * 0.3 : 71 - (i % 5) * 0.4,
      searchVolume,
      documentCount,
      goldenRatio: Number((searchVolume / documentCount).toFixed(2)),
      cpc: 180 + (i % 6) * 25,
    };
  });
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
  const quickPreview = rankGoldenDiscoveryResults(pool, 10, false, { honorRequestedLimit: true });
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
  assert(`run ${run + 1}: invalid measured SSS labels are removed`,
    ranked.every(item => !item.keyword.startsWith('invalid fake SSS')),
    ranked.map(item => `${item.keyword}:${item.searchVolume}/${item.documentCount}/${item.goldenRatio}`).join('|'));
  assert(`run ${run + 1}: quick preview honors 10-result requests`,
    quickPreview.length === 10 && countSss(quickPreview) === 10,
    `len=${quickPreview.length}, sss=${countSss(quickPreview)}`);

  const diversified = rankGoldenDiscoveryResults(
    rotate([...buildRepetitiveCluster(run), ...buildDiverseBackfill(run), ...pool], run * 11),
    30,
    false,
    {
      diversifySimilarIntents: true,
      maxSimilarPerCluster: 2,
      strictVisibleSssOnly: true,
    },
  );
  const repeatedClusterCount = diversified
    .filter(item => item.keyword.startsWith(`run ${run} summer dress recommendation`)).length;
  assert(`run ${run + 1}: diversified ranker keeps repeated intent clusters capped`,
    diversified.length === 30 && repeatedClusterCount <= 2,
    `len=${diversified.length}, repeated=${repeatedClusterCount}, keywords=${diversified.map(item => item.keyword).join('|')}`);
  assert(`run ${run + 1}: diversified ranker still fills 30 valid SSS results`,
    countSss(diversified) === 30 && diversified.every(item =>
      item.grade === 'SSS'
      && item.searchVolume >= 1000
      && item.documentCount <= 5000
      && item.goldenRatio >= 5
      && item.score >= 85
    ),
    diversified.map(item => `${item.keyword}:${item.grade}:${item.searchVolume}/${item.documentCount}/${item.goldenRatio}/${item.score}`).join('|'));

  const actionable = rankGoldenDiscoveryResults(
    rotate([...buildBeginnerBareNoise(run), ...buildRepetitiveCluster(run), ...buildDiverseBackfill(run)], run * 13),
    30,
    false,
    {
      diversifySimilarIntents: true,
      maxSimilarPerCluster: 2,
      strictVisibleSssOnly: true,
      requireActionableIntent: true,
    },
  );
  assert(`run ${run + 1}: actionable ranker removes broad bare topics and still fills 30 SSS results`,
    actionable.length === 30
      && countSss(actionable) === 30
      && actionable.every(item => isActionableGoldenKeyword(item.keyword))
      && actionable.every(item => !buildBeginnerBareNoise(run).some(noise => noise.keyword === item.keyword)),
    actionable.map(item => `${item.keyword}:${item.grade}`).join('|'));

  const scarceDiversified = rankGoldenDiscoveryResults(
    rotate([...buildRepetitiveCluster(run), ...pool.slice(0, 22), ...pool.filter(item => item.grade !== 'SSS').slice(0, 20)], run * 5),
    30,
    false,
    {
      diversifySimilarIntents: true,
      maxSimilarPerCluster: 2,
      strictVisibleSssOnly: true,
    },
  );
  assert(`run ${run + 1}: strict golden output never backfills with lower grades`,
    scarceDiversified.every(item => item.grade === 'SSS') && countSss(scarceDiversified) === scarceDiversified.length,
    scarceDiversified.map(item => `${item.keyword}:${item.grade}`).join('|'));

  const qualityBackfilled = rankGoldenDiscoveryResults(
    rotate([
      ...buildDiverseBackfill(run).slice(0, 12),
      ...buildQualityBackfill(run),
      ...buildBeginnerBareNoise(run),
    ], run * 19),
    30,
    false,
    {
      diversifySimilarIntents: true,
      maxSimilarPerCluster: 2,
      strictVisibleSssOnly: true,
      requireActionableIntent: true,
      qualityBackfillToTarget: true,
    },
  );
  assert(`run ${run + 1}: quality backfill fills 30 results when strict SSS is scarce`,
    qualityBackfilled.length === 30
      && countSss(qualityBackfilled) === 12
      && qualityBackfilled.every(item => isQualityGoldenDiscoveryResult(item, { requireActionableIntent: true }))
      && qualityBackfilled.every(item => !buildBeginnerBareNoise(run).some(noise => noise.keyword === item.keyword)),
    qualityBackfilled.map(item => `${item.keyword}:${item.grade}:${item.searchVolume}/${item.documentCount}/${item.goldenRatio}/${item.score}`).join('|'));
}

console.log(`\n[golden-category-sss-100run.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
