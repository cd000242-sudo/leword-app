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

const housing = rankRelatedKeywordCandidates('\uC6D0\uB8F8', [
  { keyword: '\uC6D0\uB8F8 \uCD9C\uC2DC\uC77C \uBE44\uC6A9', sources: ['mindmap'] },
  { keyword: '\uC6D0\uB8F8 \uACF5\uC2DD\uC601\uC0C1', sources: ['naver-suffix'] },
  { keyword: '\uB178\uD2B8\uBD81\uC790\uCDE8\uBC29\uCD5C\uC800\uAC00\uC124\uCE58\uBE44', sources: ['title-extract'] },
  { keyword: '\uC6D0\uB8F8 \uAD00\uB9AC\uBE44 \uACC4\uC0B0', sources: ['naver-relkwd'], monthlyVolume: 2400 },
  { keyword: '\uC6D0\uB8F8 \uBCF4\uC99D\uAE08 \uC8FC\uC758\uC0AC\uD56D', sources: ['autocomplete'] },
], { minScore: 10, limit: 10 }).map(item => item.keyword);
assert('drops housing launch/product hybrids and keeps housing decision keywords',
  housing.includes('\uC6D0\uB8F8 \uAD00\uB9AC\uBE44 \uACC4\uC0B0')
    && housing.includes('\uC6D0\uB8F8 \uBCF4\uC99D\uAE08 \uC8FC\uC758\uC0AC\uD56D')
    && !housing.some(keyword => /(?:\uCD9C\uC2DC\uC77C|\uACF5\uC2DD\uC601\uC0C1|\uCD5C\uC800\uAC00|\uC124\uCE58\uBE44)/u.test(keyword)),
  housing.join(', '));

const terminalPolicy = rankRelatedKeywordCandidates('\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC\uC0AC\uC6A9\uCC98', [
  { keyword: '\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC \uC0AC\uC6A9\uCC98 \uC870\uD68C', sources: ['naver-relkwd'], monthlyVolume: 2200 },
  { keyword: '\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC\uC0AC\uC6A9\uCC98\uC9C0\uAE09\uC77C', sources: ['mindmap'] },
  { keyword: '\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC\uC0AC\uC6A9\uCC98 \uC18C\uB4DD\uAE30\uC900', sources: ['naver-suffix'] },
  { keyword: '\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC \uC0AC\uC6A9\uCC98 \uC628\uB77C\uC778', sources: ['autocomplete'] },
], { minScore: 10, limit: 10 }).map(item => item.keyword);
assert('drops terminal policy intent chains and keeps usage-place queries',
  terminalPolicy.includes('\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC \uC0AC\uC6A9\uCC98 \uC870\uD68C')
    && terminalPolicy.includes('\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC \uC0AC\uC6A9\uCC98 \uC628\uB77C\uC778')
    && !terminalPolicy.some(keyword => /(?:\uC9C0\uAE09\uC77C|\uC18C\uB4DD\uAE30\uC900)/u.test(keyword)),
  terminalPolicy.join(', '));

const terminalProduct = rankRelatedKeywordCandidates('\uCFE0\uCFE0\uC81C\uC2B5\uAE30\uB80C\uD0C8\uAD6C\uB9E4\uCC98', [
  { keyword: '\uCFE0\uCFE0\uC81C\uC2B5\uAE30\uB80C\uD0C8 \uAD6C\uB9E4\uCC98 \uD6C4\uAE30', sources: ['autocomplete'] },
  { keyword: '\uCFE0\uCFE0\uC81C\uC2B5\uAE30\uB80C\uD0C8\uAD6C\uB9E4\uCC98\uC790\uCDE8\uBC29\uC18C\uC74C', sources: ['mindmap'] },
  { keyword: '\uCFE0\uCFE0\uC81C\uC2B5\uAE30\uB80C\uD0C8\uAD6C\uB9E4\uCC98 \uC6D0\uB8F8 \uC804\uAE30\uC694\uAE08', sources: ['naver-suffix'] },
], { minScore: 10, limit: 10 }).map(item => item.keyword);
assert('drops terminal product purchase-context chains',
  terminalProduct.includes('\uCFE0\uCFE0\uC81C\uC2B5\uAE30\uB80C\uD0C8 \uAD6C\uB9E4\uCC98 \uD6C4\uAE30')
    && !terminalProduct.some(keyword => /(?:\uC790\uCDE8\uBC29|\uC6D0\uB8F8|\uC804\uAE30\uC694\uAE08|\uC18C\uC74C)/u.test(keyword)),
  terminalProduct.join(', '));

const productHousingOverchain = rankRelatedKeywordCandidates('\uC81C\uC2B5\uAE30\uB80C\uD0C8\uC790\uCDE8\uBC29\uC18C\uC74C', [
  { keyword: '\uC81C\uC2B5\uAE30\uB80C\uD0C8\uC790\uCDE8\uBC29\uC18C\uC74C \uAD6C\uB9E4\uCC98', sources: ['mindmap'] },
  { keyword: '\uC81C\uC2B5\uAE30\uB80C\uD0C8\uC790\uCDE8\uBC29\uC18C\uC74C \uC6D0\uB8F8', sources: ['naver-suffix'] },
  { keyword: '\uC81C\uC2B5\uAE30 \uC790\uCDE8\uBC29 \uC18C\uC74C \uD6C4\uAE30', sources: ['autocomplete'] },
  { keyword: '\uC81C\uC2B5\uAE30 \uC790\uCDE8\uBC29 \uC18C\uC74C \uBE44\uAD50', sources: ['autocomplete'] },
], { minScore: 10, limit: 10 }).map(item => item.keyword);
assert('drops over-chained home product housing tails while keeping useful sound-intent variants',
  !productHousingOverchain.some(keyword => /(?:\uAD6C\uB9E4\uCC98|\uC6D0\uB8F8)$/u.test(keyword)),
  productHousingOverchain.join(', '));

const productHousingUseful = rankRelatedKeywordCandidates('\uC81C\uC2B5\uAE30', [
  { keyword: '\uC81C\uC2B5\uAE30 \uC790\uCDE8\uBC29 \uC18C\uC74C \uD6C4\uAE30', sources: ['autocomplete'] },
  { keyword: '\uC81C\uC2B5\uAE30 \uC790\uCDE8\uBC29 \uC18C\uC74C \uBE44\uAD50', sources: ['autocomplete'] },
], { minScore: 10, limit: 10 }).map(item => item.keyword);
assert('keeps useful short home product housing sound variants',
  productHousingUseful.includes('\uC81C\uC2B5\uAE30 \uC790\uCDE8\uBC29 \uC18C\uC74C \uD6C4\uAE30')
    && productHousingUseful.includes('\uC81C\uC2B5\uAE30 \uC790\uCDE8\uBC29 \uC18C\uC74C \uBE44\uAD50'),
  productHousingUseful.join(', '));

const housingLaunchOverchain = rankRelatedKeywordCandidates('\uC6D0\uB8F8', [
  { keyword: '\uC6D0\uB8F8\uCD9C\uC2DC\uC77C\uBE44\uC6A9', sources: ['mindmap'] },
  { keyword: '\uC6D0\uB8F8 \uC785\uC8FC \uBE44\uC6A9', sources: ['autocomplete'] },
  { keyword: '\uC6D0\uB8F8 \uAD00\uB9AC\uBE44 \uACC4\uC0B0', sources: ['autocomplete'] },
], { minScore: 10, limit: 10 }).map(item => item.keyword);
assert('drops impossible housing launch-cost chains',
  housingLaunchOverchain.includes('\uC6D0\uB8F8 \uAD00\uB9AC\uBE44 \uACC4\uC0B0')
    && !housingLaunchOverchain.some(keyword => /\uCD9C\uC2DC\uC77C/u.test(keyword)),
  housingLaunchOverchain.join(', '));

console.log(`\n[keyword-relevance-regression.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
