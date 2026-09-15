import { assessGoldenKeywordPrecision, isPreciseGoldenKeywordCandidate } from '../golden-keyword-precision';

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

const sssMetrics = {
  grade: 'SSS',
  score: 92,
  searchVolume: 2400,
  documentCount: 320,
  goldenRatio: 7.5,
};

for (const keyword of [
  '티빙 정보 유출 피해 확인',
  '고유가 지원금 2차 신청방법',
  '뉴진스 컴백 일정 신곡',
  '임영웅 콘서트 예매 티켓팅',
]) {
  assert(`precise SSS keyword passes: ${keyword}`,
    isPreciseGoldenKeywordCandidate({ keyword, ...sssMetrics }),
    JSON.stringify(assessGoldenKeywordPrecision({ keyword, ...sssMetrics })));
}

for (const keyword of [
  '아이돌 컴백 일정',
  '드라마 공개일',
  '지원금 신청',
  '정보 유출 확인',
  '뉴스 속보',
]) {
  assert(`generic SSS keyword is blocked: ${keyword}`,
    !isPreciseGoldenKeywordCandidate({ keyword, ...sssMetrics }),
    JSON.stringify(assessGoldenKeywordPrecision({ keyword, ...sssMetrics })));
}

assert('SSS precision requires measured data gates',
  !isPreciseGoldenKeywordCandidate({
    keyword: '티빙 정보 유출 피해 확인',
    grade: 'SSS',
    score: 92,
    searchVolume: 900,
    documentCount: 2000,
    goldenRatio: 0.45,
  }),
  'SSS without classic or winnable metrics still passed');

// 등급표(grade.ts)의 winnable SSS — 검색량 100~1500 · 경쟁 글 500 이하 · 비율 3 이상 · 점수 80 이상(2026-09-15).
// 전에는 이 검사가 검색량 1000 미만을 전부 버려서, 등급표가 SSS 로 인정한 작은 말을 다시 떨궜다.
assert('winnable SSS metrics pass the precision gate',
  isPreciseGoldenKeywordCandidate({
    keyword: '티빙 정보 유출 피해 확인',
    grade: 'SSS',
    score: 92,
    searchVolume: 900,
    documentCount: 320,
    goldenRatio: 7.5,
  }),
  'winnable SSS was dropped');

assert('category strict precision blocks mismatched SSS keywords',
  !isPreciseGoldenKeywordCandidate({
    keyword: '뉴진스 컴백 일정 신곡',
    ...sssMetrics,
    categoryStrict: true,
    categoryIds: ['policy'],
  }),
  'category mismatch still passed');

assert('non-SSS candidates do not use the strict SSS precision gate',
  isPreciseGoldenKeywordCandidate({
    keyword: '아이돌 컴백 일정',
    grade: 'B',
    score: 52,
    searchVolume: 240,
    documentCount: 8000,
    goldenRatio: 0.03,
  }),
  'non-SSS helper candidate was over-filtered');

console.log(`\n[golden-keyword-precision.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
