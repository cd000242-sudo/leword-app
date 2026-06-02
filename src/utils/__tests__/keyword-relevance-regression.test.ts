import { rankRelatedKeywordCandidates } from '../keyword-relevance';

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

const supplement = rankRelatedKeywordCandidates('닥터린 영양제 추천', [
  { keyword: '닥터린 영양제 후기', sources: ['naver-pc'] },
  { keyword: '뉴트라원 영양제 추천', sources: ['sibling'] },
  { keyword: '영양제 복용시간', sources: ['google-suggest'] },
  { keyword: '바로가기 이동', sources: ['naver-smartblock'] },
  { keyword: '박나래 갑질 가격', sources: ['title-extract'] },
  { keyword: '나이키 운동화 추천', sources: ['naver-shopping'] },
], { minScore: 30, limit: 10 });

const supplementKeywords = supplement.map(item => item.keyword);
assert('keeps direct autocomplete expansion', supplementKeywords.includes('닥터린 영양제 후기'), supplementKeywords.join(', '));
assert('keeps semantic sibling with same meaningful head', supplementKeywords.includes('뉴트라원 영양제 추천'), supplementKeywords.join(', '));
assert('keeps useful informational longtail', supplementKeywords.includes('영양제 복용시간'), supplementKeywords.join(', '));
assert('drops navigation noise', !supplementKeywords.includes('바로가기 이동'), supplementKeywords.join(', '));
assert('drops unrelated title-extract noise', !supplementKeywords.includes('박나래 갑질 가격'), supplementKeywords.join(', '));
assert('drops unrelated shopping drift', !supplementKeywords.includes('나이키 운동화 추천'), supplementKeywords.join(', '));

const supplementDomain = rankRelatedKeywordCandidates('닥터린 영양제 추천', [
  { keyword: '오메가3 복용법', sources: ['autocomplete'] },
  { keyword: '비타민D 부족 증상', sources: ['google-suggest'] },
  { keyword: '유산균 추천', sources: ['naver-pc'] },
  { keyword: '이강인 이적료', sources: ['naver-pc'] },
], { minScore: 30, limit: 10 }).map(item => item.keyword);
assert('keeps supplement domain siblings without exact token overlap',
  supplementDomain.includes('오메가3 복용법')
    && supplementDomain.includes('비타민D 부족 증상')
    && supplementDomain.includes('유산균 추천'),
  supplementDomain.join(', '));
assert('drops non-supplement news drift from supplement seed',
  !supplementDomain.includes('이강인 이적료'),
  supplementDomain.join(', '));

const policy = rankRelatedKeywordCandidates('소상공인 지원금', [
  { keyword: '소상공인 지원금 신청', sources: ['naver-pc'] },
  { keyword: '정부 지원금 대상', sources: ['naver-relkwd'], monthlyVolume: 2400 },
  { keyword: '청년 지원금 조건', sources: ['google-suggest'] },
  { keyword: '무선 이어폰 추천', sources: ['naver-shopping'] },
], { minScore: 30, limit: 10 });
const policyKeywords = policy.map(item => item.keyword);
assert('keeps same seed phrase policy keyword', policyKeywords.includes('소상공인 지원금 신청'), policyKeywords.join(', '));
assert('keeps same-head support fund keyword', policyKeywords.includes('정부 지원금 대상'), policyKeywords.join(', '));
assert('keeps related policy segment keyword', policyKeywords.includes('청년 지원금 조건'), policyKeywords.join(', '));
assert('drops unrelated commerce keyword', !policyKeywords.includes('무선 이어폰 추천'), policyKeywords.join(', '));

const policyDomain = rankRelatedKeywordCandidates('근로장려금 신청', [
  { keyword: '자녀장려금 지급일', sources: ['naver-relkwd'] },
  { keyword: '에너지바우처 신청', sources: ['naver-pc'] },
  { keyword: '긴급복지 생계지원 대상', sources: ['google-suggest'] },
  { keyword: '갤럭시 업데이트 방법', sources: ['naver-pc'] },
], { minScore: 30, limit: 10 }).map(item => item.keyword);
assert('keeps government benefit siblings without exact token overlap',
  policyDomain.includes('자녀장려금 지급일')
    && policyDomain.includes('에너지바우처 신청')
    && policyDomain.includes('긴급복지 생계지원 대상'),
  policyDomain.join(', '));
assert('drops non-policy device drift from benefit seed',
  !policyDomain.includes('갤럭시 업데이트 방법'),
  policyDomain.join(', '));

const person = rankRelatedKeywordCandidates('장윤기', [
  { keyword: '장윤기 나이', sources: ['autocomplete'] },
  { keyword: '장윤기 부모', sources: ['autocomplete'] },
  { keyword: '장윤기 부모 가격', sources: ['naver-suffix'] },
  { keyword: '장윤기 부모 추천', sources: ['naver-suffix'] },
  { keyword: '장윤기 일정 가격', sources: ['naver-suffix'] },
  { keyword: '장윤기 다시보기', sources: ['autocomplete'] },
  { keyword: '장윤기 예능', sources: ['autocomplete'] },
], { minScore: 30, limit: 10 }).map(item => item.keyword);
assert('drops awkward person family-commerce keywords',
  person.includes('장윤기 나이')
    && person.includes('장윤기 부모')
    && person.includes('장윤기 다시보기')
    && !person.some(keyword => /장윤기.*(부모|일정).*(가격|추천|비교|후기|방법)/.test(keyword)),
  person.join(', '));

console.log(`\n[keyword-relevance-regression.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
