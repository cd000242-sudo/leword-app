import {
  expandHomeNeedKeywords,
  HOME_HUNTER_MIN_SPLUS_RESULTS,
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

const celebrityIssuePool = expandHomeNeedKeywords('아이유', 'celebrity', HOME_HUNTER_MIN_SPLUS_RESULTS);
assert('연예 홈판 후보는 인물명 seed를 가족/직장인/생활 템플릿으로 오염시키지 않는다',
  celebrityIssuePool.length >= HOME_HUNTER_MIN_SPLUS_RESULTS
    && celebrityIssuePool.every(item => item.grade === 'S+')
    && celebrityIssuePool.every(item => /(이슈|방송|일정|공개|출연|팬|반응|장면|컴백|공식입장|다시보기|회차|줄거리|시상식|근황)/.test(item.keyword))
    && !celebrityIssuePool.some(item => /(가족|직장인|초여름 관리|비용 정리|장단점 비교|대상별 차이|준비물)/.test(item.keyword)),
  celebrityIssuePool.map(item => item.keyword).join(', '));

const policyIssuePool = expandHomeNeedKeywords('소상공인 지원금', 'policy', HOME_HUNTER_MIN_SPLUS_RESULTS);
assert('정책 홈판 후보는 지원금 seed를 생활/일반 체크리스트로 오염시키지 않는다',
  policyIssuePool.length >= HOME_HUNTER_MIN_SPLUS_RESULTS
    && policyIssuePool.every(item => item.grade === 'S+')
    && policyIssuePool.every(item => /(신청|대상|자격|조건|서류|지급일|사용처|조회|마감|공식|공고|제외|소득|기준|온라인|접수|변경사항)/.test(item.keyword))
    && !policyIssuePool.some(item => /(초여름 관리|가족이|직장인 체크|장단점 비교|비용 정리)/.test(item.keyword)),
  policyIssuePool.map(item => item.keyword).join(', '));

console.log(`\n[home-keyword-intent.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
