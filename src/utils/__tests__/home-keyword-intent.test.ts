import {
  expandHomeNeedKeywords,
  isWeakHomeNeedKeyword,
  rankHomeNeedKeywords,
  scoreHomeNeedKeyword,
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

const now = new Date('2026-06-01T09:00:00+09:00');

const generic = scoreHomeNeedKeyword('넷플릭스 추천', 'celebrity', now);
const homeFit = scoreHomeNeedKeyword('이번 주 넷플릭스 가족 영화 추천 5개', 'celebrity', now);
assert('홈판형 제목화 니즈가 일반 추천보다 높다', homeFit > generic + 20, `${homeFit} <= ${generic}`);

assert('짧고 검색형인 키워드는 약한 홈판 후보로 분류', isWeakHomeNeedKeyword('날씨', 'general'));

const policyVariants = expandHomeNeedKeywords('소상공인 지원금', 'policy', 8);
assert('정책 시드는 6월 신청/조건형으로 확장된다',
  policyVariants.some(v => /6월|신청|조건|준비서류|변경/.test(v.keyword)),
  policyVariants.map(v => v.keyword).join(', '));
assert('정책 확장 후보가 5개 이상 나온다', policyVariants.length >= 5, `${policyVariants.length}`);

const ranked = rankHomeNeedKeywords([
  { keyword: '드라마 추천', category: 'celebrity' },
  { keyword: '장마철 빨래 냄새 제거 체크리스트', category: 'living' },
  { keyword: '오늘 이슈', category: 'issue' },
]);
assert('랭커가 실전 글감 후보를 상단으로 보낸다',
  ranked[0].keyword === '장마철 빨래 냄새 제거 체크리스트',
  ranked.map(r => `${r.keyword}:${r.homeNeedScore}`).join(', '));

console.log(`\n[home-keyword-intent.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
