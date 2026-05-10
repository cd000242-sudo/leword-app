/**
 * 🎯 v2.40.5 분포 기반 동적 SSS 라벨링 단위 테스트
 *
 * - huntProTrafficKeywords 의 dynamicSssScore + 라벨링 로직만 추출해
 *   다양한 입력(다양한 sv/dc/gr 분포)에서 SSS 갯수가 사용자 count 만큼
 *   보장되는지 검증.
 * - 실제 API 호출 없이 수 초 내 완료.
 */

interface FakeKeyword {
  keyword: string;
  searchVolume: number | null;
  documentCount: number | null;
  goldenRatio?: number;
  grade?: string;
}

// 동적 SSS 점수 함수 (pro-traffic-keyword-hunter.ts:5340 동일)
const dynamicSssScore = (k: any): number => {
  const sv = typeof k?.searchVolume === 'number' && k.searchVolume > 0 ? k.searchVolume : 0;
  const dc = typeof k?.documentCount === 'number' && k.documentCount > 0 ? k.documentCount : Number.MAX_SAFE_INTEGER;
  const gr = typeof k?.goldenRatio === 'number' && k.goldenRatio > 0 ? k.goldenRatio : (sv > 0 && dc < Number.MAX_SAFE_INTEGER ? sv / dc : 0);
  const grScore = Math.min(100, gr * 20);
  const svScore = Math.min(100, Math.log10(sv + 1) * 25);
  const dcScore = Math.min(100, 100000 / Math.max(1000, dc));
  return grScore * 0.55 + svScore * 0.30 + dcScore * 0.15;
};

// huntProTrafficKeywords 의 라벨링 로직과 동일
function applyDynamicSssLabeling(selectedKeywords: FakeKeyword[], count: number): FakeKeyword[] {
  const verifiedForSss = selectedKeywords
    .map((k, i) => ({ k, i, score: dynamicSssScore(k) }))
    .filter(x =>
      typeof x.k.searchVolume === 'number' && x.k.searchVolume > 0 &&
      typeof x.k.documentCount === 'number' && x.k.documentCount > 0
    )
    .sort((a, b) => b.score - a.score);
  const cap = Math.min(count, verifiedForSss.length);
  for (let i = 0; i < cap; i++) {
    verifiedForSss[i].k.grade = 'SSS';
  }
  return selectedKeywords;
}

// 시나리오 1: 다양한 품질 키워드 200개 (사용자 count=200)
function makeRandomKeywords(n: number, seed = 42): FakeKeyword[] {
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const arr: FakeKeyword[] = [];
  for (let i = 0; i < n; i++) {
    // sv: 100 ~ 50000 로그분포
    const sv = Math.floor(100 * Math.pow(500, rand()));
    // dc: 100 ~ 200000 로그분포
    const dc = Math.floor(100 * Math.pow(2000, rand()));
    arr.push({
      keyword: `테스트키워드${i}`,
      searchVolume: sv,
      documentCount: dc,
      goldenRatio: dc > 0 ? sv / dc : 0,
    });
  }
  return arr;
}

// 시나리오 2: 일부는 검증 안 됨 (sv=null 또는 dc=null)
function makeMixedKeywords(n: number, unverifiedRatio = 0.3): FakeKeyword[] {
  const arr = makeRandomKeywords(n, 99);
  const unverifiedCount = Math.floor(n * unverifiedRatio);
  for (let i = 0; i < unverifiedCount; i++) {
    if (i % 2 === 0) arr[i].searchVolume = null;
    else arr[i].documentCount = null;
  }
  return arr;
}

// 시나리오 3: 모두 빡센 컷 통과 못 하는 키워드
function makeLowQualityKeywords(n: number): FakeKeyword[] {
  const arr: FakeKeyword[] = [];
  for (let i = 0; i < n; i++) {
    arr.push({
      keyword: `저품질${i}`,
      searchVolume: 50 + i,            // sv 50~250 (낮음)
      documentCount: 100000 + i * 1000, // dc 100k~ (높음)
      goldenRatio: (50 + i) / (100000 + i * 1000),
    });
  }
  return arr;
}

interface TestCase {
  name: string;
  keywords: FakeKeyword[];
  count: number;
  expectedSssExact?: number;
  expectedSssMin?: number;
  expectedSssMax?: number;
}

const testCases: TestCase[] = [
  {
    name: '🟢 정상 시나리오: 200 풀 → SSS 200개 보장',
    keywords: makeRandomKeywords(200),
    count: 200,
    expectedSssExact: 200,
  },
  {
    name: '🟢 100 풀 → SSS 100개 보장',
    keywords: makeRandomKeywords(100),
    count: 100,
    expectedSssExact: 100,
  },
  {
    name: '🟢 50 풀 → SSS 50개 보장',
    keywords: makeRandomKeywords(50),
    count: 50,
    expectedSssExact: 50,
  },
  {
    name: '🟡 30% 미검증 키워드 포함: 검증된 70% 만 SSS 라벨',
    keywords: makeMixedKeywords(200, 0.3),
    count: 200,
    expectedSssExact: 140, // 200 × 0.7 = 140
  },
  {
    name: '🟡 풀이 count보다 작음: 풀 전체가 SSS',
    keywords: makeRandomKeywords(50),
    count: 100,
    expectedSssExact: 50, // 풀 50 < count 100 → 50개만 SSS
  },
  {
    name: '🟢 저품질 풀이라도 상위 N개는 SSS 라벨 (사용자 보장 약속)',
    keywords: makeLowQualityKeywords(200),
    count: 200,
    expectedSssExact: 200, // 절대 컷 무관, 모두 SSS
  },
  {
    name: '🟢 점수 정렬 검증: 상위 점수가 SSS 라벨',
    keywords: makeRandomKeywords(100),
    count: 30,
    expectedSssExact: 30,
  },
];

console.log('═'.repeat(70));
console.log('🎯 v2.40.5 분포 기반 동적 SSS 라벨링 단위 테스트');
console.log('═'.repeat(70));

let allPass = true;
for (const tc of testCases) {
  const result = applyDynamicSssLabeling(tc.keywords, tc.count);
  const sssCount = result.filter(k => k.grade === 'SSS').length;
  const verifiedCount = result.filter(k =>
    typeof k.searchVolume === 'number' && k.searchVolume > 0 &&
    typeof k.documentCount === 'number' && k.documentCount > 0
  ).length;

  let pass = true;
  if (tc.expectedSssExact !== undefined) {
    pass = sssCount === tc.expectedSssExact;
  } else if (tc.expectedSssMin !== undefined && tc.expectedSssMax !== undefined) {
    pass = sssCount >= tc.expectedSssMin && sssCount <= tc.expectedSssMax;
  }

  const mark = pass ? '✅' : '❌';
  console.log(`${mark} ${tc.name}`);
  console.log(`   풀=${result.length} 검증=${verifiedCount} count=${tc.count} → SSS=${sssCount}`);
  if (!pass) {
    console.log(`   ❌ 기대: ${tc.expectedSssExact ?? `${tc.expectedSssMin}~${tc.expectedSssMax}`}`);
    allPass = false;
  }

  // 점수 정렬 검증 (상위 SSS 점수 ≥ 비-SSS 최고 점수)
  const sssKeywords = result.filter(k => k.grade === 'SSS');
  const nonSssVerified = result.filter(k =>
    k.grade !== 'SSS' &&
    typeof k.searchVolume === 'number' && k.searchVolume > 0 &&
    typeof k.documentCount === 'number' && k.documentCount > 0
  );
  if (sssKeywords.length > 0 && nonSssVerified.length > 0) {
    const minSssScore = Math.min(...sssKeywords.map(dynamicSssScore));
    const maxNonSssScore = Math.max(...nonSssVerified.map(dynamicSssScore));
    if (minSssScore < maxNonSssScore - 0.001) {
      console.log(`   ❌ 정렬 위반: SSS 최저 점수 ${minSssScore.toFixed(2)} < 비-SSS 최고 ${maxNonSssScore.toFixed(2)}`);
      allPass = false;
    }
  }
}

console.log('─'.repeat(70));
console.log(`총 ${testCases.length}개 케이스 · ${allPass ? '🟢 ALL PASS' : '🔴 FAIL'}`);

// 점수 분포 시각화 (참고용)
console.log('\n📊 점수 분포 예시 (200개 정상 풀):');
const sample = makeRandomKeywords(200);
const scored = sample.map(k => ({
  k: k.keyword,
  sv: k.searchVolume,
  dc: k.documentCount,
  gr: k.goldenRatio?.toFixed(3),
  score: dynamicSssScore(k).toFixed(2),
}));
scored.sort((a, b) => parseFloat(b.score) - parseFloat(a.score));
console.log('상위 5개:');
scored.slice(0, 5).forEach((r, i) => {
  console.log(`  ${i + 1}. ${r.k.padEnd(15)} sv=${String(r.sv).padStart(6)} dc=${String(r.dc).padStart(7)} gr=${String(r.gr).padStart(6)} score=${r.score}`);
});
console.log('하위 5개:');
scored.slice(-5).forEach((r, i) => {
  console.log(`  ${i + 196}. ${r.k.padEnd(15)} sv=${String(r.sv).padStart(6)} dc=${String(r.dc).padStart(7)} gr=${String(r.gr).padStart(6)} score=${r.score}`);
});

process.exit(allPass ? 0 : 1);
