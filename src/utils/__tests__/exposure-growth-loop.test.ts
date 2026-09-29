import { rankExposureGrowthSeeds } from '../exposure-growth-loop';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else {
    failed++;
    failures.push(`FAIL ${name}${detail ? ' - ' + detail : ''}`);
  }
}

const now = Date.now();
const seeds = rankExposureGrowthSeeds([
  {
    keyword: '민생회복지원금 대상',
    category: 'policy',
    postUrl: 'https://blog.naver.com/me/1',
    postTitle: '민생회복지원금 대상 지급일 정리',
    history: [
      { ts: now - 86400000 * 2, rank: 18, inTop30: true, inTop10: false },
      { ts: now - 86400000, rank: 8, inTop30: true, inTop10: true },
      { ts: now, rank: 5, inTop30: true, inTop10: true },
    ],
  },
  {
    keyword: '민생회복지원금 대상',
    category: 'policy',
    postUrl: 'https://blog.naver.com/me/2',
    postTitle: '민생회복지원금 신청기간 서류',
    history: [
      { ts: now - 3600000, rank: 12, inTop30: true, inTop10: false },
    ],
  },
  {
    keyword: '아이폰 색상',
    category: 'it',
    postUrl: 'https://blog.naver.com/me/3',
    postTitle: '아이폰 색상 비교',
    history: [
      { ts: now - 86400000, rank: null, inTop30: false, inTop10: false },
      { ts: now, rank: null, inTop30: false, inTop10: false },
    ],
  },
  {
    keyword: '장원영 프로필',
    category: 'celeb',
    postUrl: 'https://blog.naver.com/me/4',
    postTitle: '장원영 프로필 인스타 출연 정리',
    history: [
      { ts: now - 86400000, rank: 28, inTop30: true, inTop10: false },
      { ts: now, rank: 24, inTop30: true, inTop10: false },
    ],
  },
  {
    keyword: '미측정 키워드',
    category: 'manual',
    history: [],
  },
], {
  limit: 5,
  expansionLimit: 5,
  // 실측 연관어만 붙는다 — 씨앗 키는 공백 제거 소문자. 연예 씨앗은 일부러 안 준다(안 잰 것은 빈 채).
  expansions: {
    '민생회복지원금대상': ['민생회복지원금 사용처', '민생회복지원금 신청', '민생회복지원금 대상', '민생회복지원금 대상 조회'],
  },
});

const policy = seeds.find(seed => seed.keyword === '민생회복지원금 대상');
const celeb = seeds.find(seed => seed.keyword === '장원영 프로필');

assert('exposure growth ranks proven top10/top30 keyword first',
  seeds[0]?.keyword === '민생회복지원금 대상' && seeds[0].growthGrade === 'S+',
  JSON.stringify(seeds));
assert('exposure growth merges duplicate keyword evidence across posts',
  !!policy && policy.postCount === 2 && policy.totalChecks === 4 && policy.top30Rate === 100,
  JSON.stringify(policy));
assert('exposure growth attaches only measured expansions, seed itself removed, in given order',
  !!policy
    && policy.expansionSource === 'measured'
    && JSON.stringify(policy.suggestedExpansions) === JSON.stringify(['민생회복지원금 사용처', '민생회복지원금 신청', '민생회복지원금 대상 조회'])
    && policy.nextAction.includes('마인드맵'),
  JSON.stringify(policy?.suggestedExpansions));
assert('exposure growth keeps weaker but repeated top30 star keyword without inventing expansions',
  !!celeb && ['S', 'A'].includes(celeb.growthGrade)
    && celeb.suggestedExpansions.length === 0 && celeb.expansionSource === 'none',
  JSON.stringify(celeb));
assert('exposure growth excludes unmeasured and never-exposed keywords',
  !seeds.some(seed => seed.keyword === '아이폰 색상' || seed.keyword === '미측정 키워드'),
  seeds.map(seed => seed.keyword).join(', '));

console.log(`\n[exposure-growth-loop.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
