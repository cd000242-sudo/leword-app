import {
  expandHomeNeedKeywords,
  gradeHomeNeedScore,
  HOME_HUNTER_MIN_SPLUS_RESULTS,
  HOME_NEED_SPLUS_SCORE,
  normalizeHomeNeedCategory,
  rankHomeNeedKeywords,
} from '../pro-hunter-v12/home-keyword-intent';

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

function compactKey(keyword: string): string {
  return String(keyword || '').toLowerCase().replace(/\s+/g, '');
}

const scenarios = [
  {
    category: 'policy',
    seed: '소상공인 지원금',
    intent: /(신청|대상|서류|마감|공식|조회|조건|지급일)/,
  },
  {
    category: 'celebrity',
    seed: '넷플릭스 가족 영화',
    intent: /(이번 주|오늘|방송|회차|다시보기|출연진|관전|최신)/,
  },
  {
    category: 'living',
    seed: '장마철 빨래 냄새',
    intent: /(장마|제습|냄새|집안|초여름|체크리스트|관리)/,
  },
  {
    category: 'finance',
    seed: '청년도약계좌',
    intent: /(환급|공제|직장인|조건|비교|변경|체크리스트|비용)/,
  },
  {
    category: 'travel',
    seed: '제주도 가족 여행',
    intent: /(코스|예약|비용|일정|여름휴가|준비물|동선)/,
  },
];

for (let run = 0; run < 100; run++) {
  const scenario = scenarios[run % scenarios.length];
  const expanded = expandHomeNeedKeywords(
    scenario.seed,
    scenario.category,
    HOME_HUNTER_MIN_SPLUS_RESULTS,
  );
  const splus = expanded.filter(item => item.grade === 'S+' && item.score >= HOME_NEED_SPLUS_SCORE);
  const keys = new Set(expanded.map(item => compactKey(item.keyword)));

  assert(`run ${run + 1}: ${scenario.category} S+ 30개 이상`, splus.length >= HOME_HUNTER_MIN_SPLUS_RESULTS,
    expanded.map(item => `${item.keyword}:${item.score}:${item.grade}`).join(' | '));
  assert(`run ${run + 1}: ${scenario.category} 정확히 요청 수량 반환`, expanded.length === HOME_HUNTER_MIN_SPLUS_RESULTS,
    `${expanded.length}`);
  assert(`run ${run + 1}: ${scenario.category} 중복 제거`, keys.size === expanded.length,
    expanded.map(item => item.keyword).join(', '));
  assert(`run ${run + 1}: ${scenario.category} 의도 단어 포함`, expanded.some(item => scenario.intent.test(item.keyword)),
    expanded.slice(0, 8).map(item => item.keyword).join(', '));
}

const ranked = rankHomeNeedKeywords([
  { keyword: '넷플릭스 추천', category: 'celebrity' },
  { keyword: '넷플릭스 가족 영화 이번 주 확인할 핵심 5가지', category: 'celebrity' },
  { keyword: '소상공인 지원금 2026 6월 신청 대상 정리', category: 'policy' },
]);

assert('랭커가 S+ 홈판 니즈 후보를 우선 정렬', ranked[0].homeNeedGrade === 'S+',
  ranked.map(item => `${item.keyword}:${item.homeNeedScore}:${item.homeNeedGrade}`).join(', '));
assert('S+ 점수 기준이 명확하다', gradeHomeNeedScore(HOME_NEED_SPLUS_SCORE) === 'S+');

const labelScenarios = [
  { category: 'celeb', expected: 'celebrity', seed: '아이돌 컴백' },
  { category: '스타/연예 이슈', expected: 'celebrity', seed: '아이돌 컴백' },
  { category: '문화/엔터', expected: 'celebrity', seed: '넷플릭스 가족 영화' },
  { category: '지원금/정책/복지', expected: 'policy', seed: '소상공인 지원금' },
  { category: '인테리어/생활', expected: 'living', seed: '장마철 곰팡이 제거' },
  { category: '재테크/투자', expected: 'finance', seed: '청년청약계좌' },
];

for (const scenario of labelScenarios) {
  const normalized = normalizeHomeNeedCategory(scenario.category);
  const expanded = expandHomeNeedKeywords(
    scenario.seed,
    scenario.category,
    HOME_HUNTER_MIN_SPLUS_RESULTS,
  );
  const splus = expanded.filter(item => item.grade === 'S+' && item.score >= HOME_NEED_SPLUS_SCORE);

  assert(`profile/home category label ${scenario.category} normalizes to ${scenario.expected}`,
    normalized === scenario.expected,
    `${scenario.category} => ${normalized}`);
  assert(`profile/home category label ${scenario.category} keeps 30 S+ home angles`,
    expanded.length === HOME_HUNTER_MIN_SPLUS_RESULTS
      && splus.length >= HOME_HUNTER_MIN_SPLUS_RESULTS
      && expanded.every(item => item.category === scenario.expected),
    expanded.map(item => `${item.keyword}:${item.category}:${item.score}:${item.grade}`).join(' | '));
}

console.log(`\n[home-hunter-splus-floor.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
