import {
  classifyPracticalIntentGroup,
  rankKeywordExpansionCandidates,
  rankKeywordExpansionStrings,
} from '../keyword-expansion-ranker';
import * as fs from 'fs';
import * as path from 'path';

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

const supplement = rankKeywordExpansionStrings('닥터린 영양제 추천', [
  '닥터린 영양제 후기',
  '영양제 복용시간',
  '뉴트리원 영양제 추천',
  '박나래 갑질 가격',
  '나이키 운동화 추천',
  '바로가기 이동',
], { source: 'autocomplete', limit: 10, minScore: 30 });

assert('keyword analyzer expansion keeps direct autocomplete intent',
  supplement.includes('닥터린 영양제 후기'), supplement.join(', '));
assert('keyword analyzer expansion keeps same-head informational longtail',
  supplement.includes('영양제 복용시간'), supplement.join(', '));
assert('keyword analyzer expansion keeps semantic sibling in the same product head',
  supplement.includes('뉴트리원 영양제 추천'), supplement.join(', '));
assert('keyword analyzer expansion drops unrelated title noise with intent suffix',
  !supplement.includes('박나래 갑질 가격'), supplement.join(', '));
assert('keyword analyzer expansion drops unrelated shopping drift',
  !supplement.includes('나이키 운동화 추천'), supplement.join(', '));
assert('keyword analyzer expansion drops navigation noise',
  !supplement.includes('바로가기 이동'), supplement.join(', '));

const supplementDomain = rankKeywordExpansionStrings('닥터린 영양제 추천', [
  '오메가3 복용법',
  '비타민D 부족 증상',
  '유산균 추천',
  '이강인 이적료',
  '아이폰 배터리 교체',
], { source: 'autocomplete', limit: 10, minScore: 30 });

assert('keyword analyzer expansion keeps same-domain supplement needs even without exact seed token',
  supplementDomain.includes('오메가3 복용법')
    && supplementDomain.includes('비타민D 부족 증상')
    && supplementDomain.includes('유산균 추천'),
  supplementDomain.join(', '));
assert('keyword analyzer expansion still drops cross-domain news and device drift',
  !supplementDomain.includes('이강인 이적료') && !supplementDomain.includes('아이폰 배터리 교체'),
  supplementDomain.join(', '));

const shoes = rankKeywordExpansionStrings('나이키 운동화 추천', [
  '아디다스 운동화 추천',
  '뉴발란스 운동화',
  '나이키 운동화 사이즈',
  '아이폰 가격',
  '청년 지원금 신청',
], { source: 'autocomplete', limit: 10, minScore: 30 });

assert('keyword analyzer expansion keeps peer brand with shared head',
  shoes.includes('아디다스 운동화 추천') && shoes.includes('뉴발란스 운동화'),
  shoes.join(', '));
assert('keyword analyzer expansion keeps direct size longtail',
  shoes.includes('나이키 운동화 사이즈'), shoes.join(', '));
assert('keyword analyzer expansion blocks unrelated policy and device drift',
  !shoes.includes('청년 지원금 신청') && !shoes.includes('아이폰 가격'),
  shoes.join(', '));

const policy = rankKeywordExpansionStrings('소상공인 지원금', [
  '소상공인 지원금 신청',
  '정부 지원금 대상',
  '청년 지원금 조건',
  '무선 이어폰 추천',
], { source: 'naver-relkwd', limit: 10, minScore: 30 });

assert('keyword analyzer expansion keeps policy segment siblings',
  policy.includes('정부 지원금 대상') && policy.includes('청년 지원금 조건'),
  policy.join(', '));
assert('keyword analyzer expansion drops unrelated commerce from policy seed',
  !policy.includes('무선 이어폰 추천'), policy.join(', '));

const policyDomain = rankKeywordExpansionStrings('근로장려금 신청', [
  '자녀장려금 지급일',
  '에너지바우처 신청',
  '긴급복지 생계지원 대상',
  '에어컨 전기세 줄이는법',
  '갤럭시 업데이트 방법',
], { source: 'naver-relkwd', limit: 10, minScore: 30 });

assert('keyword analyzer expansion keeps same-domain government benefit needs',
  policyDomain.includes('자녀장려금 지급일')
    && policyDomain.includes('에너지바우처 신청')
    && policyDomain.includes('긴급복지 생계지원 대상'),
  policyDomain.join(', '));
assert('keyword analyzer expansion blocks adjacent but non-policy drift',
  !policyDomain.includes('에어컨 전기세 줄이는법') && !policyDomain.includes('갤럭시 업데이트 방법'),
  policyDomain.join(', '));

const duplicateSignals = rankKeywordExpansionCandidates('소상공인 지원금', [
  { keyword: '청년 지원금 조건', sources: ['title-extract'] },
  { keyword: '청년 지원금 조건', sources: ['naver-relkwd'], monthlyVolume: 2400 },
  { keyword: '무선 이어폰 추천', sources: ['naver-shopping'], monthlyVolume: 5000 },
], { limit: 5, minScore: 30 });
const mergedYouthSupport = duplicateSignals.find(item => item.keyword === '청년 지원금 조건');
assert('keyword analyzer expansion merges duplicate source signals before ranking',
  !!mergedYouthSupport &&
    (mergedYouthSupport.sources || []).includes('title-extract') &&
    (mergedYouthSupport.sources || []).includes('naver-relkwd') &&
    (mergedYouthSupport.monthlyVolume || 0) === 2400,
  JSON.stringify(duplicateSignals));

const noisyPolicyEnough = rankKeywordExpansionStrings('민생회복지원금', [
  '민생회복지원금 뉴스',
  '민생회복지원금 발표',
  '민생회복지원금 여론',
  '민생회복지원금 국회',
  '민생회복지원금 지자체',
  '민생회복지원금 지역화폐',
  '민생회복지원금 소비쿠폰',
  '민생회복지원금 총정리',
  '민생회복지원금 최신',
], {
  source: 'autocomplete',
  limit: 14,
  minScore: 30,
  ensureIntentCoverage: true,
  intentCoverageMin: 8,
});
assert('keyword analyzer policy expansion backfills practical action intents even when noisy results are enough',
  noisyPolicyEnough.includes('민생회복지원금 대상')
    && noisyPolicyEnough.includes('민생회복지원금 지급일')
    && noisyPolicyEnough.includes('민생회복지원금 신청기간'),
  noisyPolicyEnough.join(', '));

const celebrityEnough = rankKeywordExpansionStrings('장원영', [
  '장원영 아이돌',
  '장원영 공항패션',
  '장원영 직캠',
  '장원영 사진',
  '장원영 움짤',
  '장원영 무대',
  '장원영 셀카',
  '장원영 커버',
], {
  source: 'autocomplete',
  limit: 14,
  minScore: 30,
  ensureIntentCoverage: true,
  intentCoverageMin: 8,
});
assert('keyword analyzer celebrity expansion infers star intent from candidate context',
  celebrityEnough.includes('장원영 프로필')
    && celebrityEnough.includes('장원영 인스타')
    && celebrityEnough.includes('장원영 출연'),
  celebrityEnough.join(', '));

const personNoise = rankKeywordExpansionStrings('장윤기', [
  '장윤기 나이',
  '장윤기 부모',
  '장윤기 부모 가격',
  '장윤기 부모 추천',
  '장윤기 부모 비교',
  '장윤기 부모 후기',
  '장윤기 부모 방법',
  '장윤기 일정 가격',
  '장윤기 다시보기',
  '장윤기 예능',
], {
  source: 'autocomplete',
  limit: 20,
  minScore: 30,
  ensureIntentCoverage: true,
  intentCoverageMin: 8,
});
assert('keyword analyzer person expansion blocks awkward family-commerce suffixes',
  personNoise.includes('장윤기 나이')
    && personNoise.includes('장윤기 부모')
    && personNoise.includes('장윤기 다시보기')
    && !personNoise.some(keyword => /장윤기.*(부모|일정).*(가격|추천|비교|후기|방법)/.test(keyword)),
  personNoise.join(', '));

const sparsePolicy = rankKeywordExpansionStrings('근로장려금 신청', [
  '바로가기 이동',
], {
  source: 'autocomplete',
  limit: 12,
  minScore: 30,
  ensureIntentCoverage: true,
  intentCoverageMin: 8,
});
assert('keyword analyzer sparse policy autocomplete backfills practical intent keywords',
  sparsePolicy.length >= 8
    && sparsePolicy.includes('근로장려금 대상')
    && sparsePolicy.includes('근로장려금 지급일')
    && sparsePolicy.includes('근로장려금 서류'),
  sparsePolicy.join(', '));
assert('keyword analyzer sparse policy backfill does not keep navigation noise',
  !sparsePolicy.includes('바로가기 이동'),
  sparsePolicy.join(', '));

const policyPillars = rankKeywordExpansionStrings('고유가 지원금 2차', [
  '고유가 지원금 2차 가격',
  '고유가 지원금 2차 추천',
  '고유가 지원금 2차 후기',
], {
  source: 'autocomplete',
  limit: 24,
  minScore: 30,
  ensureIntentCoverage: true,
  intentCoverageMin: 18,
});
const requiredPolicyPillars = [
  '고유가 지원금 2차 신청방법',
  '고유가 지원금 2차 자격',
  '고유가 지원금 2차 혜택',
  '고유가 지원금 2차 지원내용',
  '고유가 지원금 2차 지원금액',
  '고유가 지원금 2차 신청기간',
  '고유가 지원금 2차 서류',
  '고유가 지원금 2차 조회',
  '고유가 지원금 2차 마감',
  '고유가 지원금 2차 문의처',
];
assert('keyword analyzer policy seed expands into article-pillar intents for spiderweb content',
  requiredPolicyPillars.every(keyword => policyPillars.includes(keyword))
    && !policyPillars.some(keyword => /가격|추천|후기|리뷰|비교|순위/.test(keyword.replace('고유가 지원금 2차', ''))),
  policyPillars.join(', '));

const sparseSupplement = rankKeywordExpansionStrings('닥터린 영양제 추천', [], {
  source: 'autocomplete',
  limit: 12,
  minScore: 30,
  ensureIntentCoverage: true,
  intentCoverageMin: 8,
});
assert('keyword analyzer sparse supplement autocomplete backfills buyer and info intents',
  sparseSupplement.length >= 8
    && sparseSupplement.includes('닥터린 영양제 후기')
    && sparseSupplement.includes('닥터린 영양제 복용법')
    && sparseSupplement.includes('닥터린 영양제 부작용'),
  sparseSupplement.join(', '));

const sparseShoes = rankKeywordExpansionStrings('나이키 운동화 추천', [], {
  source: 'autocomplete',
  limit: 10,
  minScore: 30,
  ensureIntentCoverage: true,
  intentCoverageMin: 6,
});
assert('keyword analyzer sparse footwear autocomplete backfills shopping decision intents',
  sparseShoes.length >= 6
    && sparseShoes.includes('나이키 운동화 사이즈')
    && sparseShoes.includes('나이키 운동화 후기')
    && sparseShoes.includes('나이키 운동화 가격'),
  sparseShoes.join(', '));

const sparseHomeAppliance = rankKeywordExpansionStrings('가정용 제습기', [
  '무선 이어폰 추천',
  '에어컨 청소 비용',
], {
  source: 'autocomplete',
  limit: 12,
  minScore: 30,
  ensureIntentCoverage: true,
  intentCoverageMin: 8,
});
assert('keyword analyzer home-appliance expansion backfills practical operation and problem intents',
  sparseHomeAppliance.length >= 8
    && sparseHomeAppliance.includes('가정용 제습기 전기세')
    && sparseHomeAppliance.includes('가정용 제습기 소음')
    && sparseHomeAppliance.includes('가정용 제습기 곰팡이')
    && sparseHomeAppliance.includes('가정용 제습기 청소')
    && !sparseHomeAppliance.includes('무선 이어폰 추천')
    && !sparseHomeAppliance.includes('에어컨 청소 비용'),
  sparseHomeAppliance.join(', '));

const crowdedPolicy = rankKeywordExpansionStrings('소상공인 지원금', [
  '소상공인 지원금 뉴스',
  '소상공인 지원금 발표',
  '소상공인 지원금 총정리',
  '소상공인 지원금 최신',
  '소상공인 지원금 기사',
  '소상공인 지원금 블로그',
  '소상공인 지원금 바로가기',
  '무선 이어폰 추천',
], {
  source: 'autocomplete',
  limit: 12,
  minScore: 30,
  ensureIntentCoverage: true,
  intentCoverageMin: 10,
});
const crowdedPolicyGroups = new Set(crowdedPolicy.map(keyword => classifyPracticalIntentGroup(keyword, 'policy')));
assert('keyword analyzer policy expansion balances action-intent groups instead of returning one-note news/summary results',
  crowdedPolicyGroups.has('eligibility')
    && crowdedPolicyGroups.has('apply')
    && crowdedPolicyGroups.has('timing')
    && crowdedPolicyGroups.has('documents')
    && crowdedPolicyGroups.has('lookup')
    && !crowdedPolicy.includes('무선 이어폰 추천'),
  crowdedPolicy.map(keyword => `${keyword}:${classifyPracticalIntentGroup(keyword, 'policy')}`).join(', '));

const crowdedCelebrity = rankKeywordExpansionStrings('아이유', [
  '아이유 사진',
  '아이유 이미지',
  '아이유 움짤',
  '아이유 갤러리',
  '아이유 배경화면',
  '아이유 기사',
  '아이유 뉴스',
  '소상공인 지원금 신청',
], {
  source: 'autocomplete',
  limit: 12,
  minScore: 30,
  ensureIntentCoverage: true,
  intentCoverageMin: 10,
});
const crowdedCelebrityGroups = new Set(crowdedCelebrity.map(keyword => classifyPracticalIntentGroup(keyword, 'entertainment')));
assert('keyword analyzer celebrity expansion balances profile/content/schedule/watch/reaction intents',
  crowdedCelebrityGroups.has('profile')
    && crowdedCelebrityGroups.has('appearance')
    && crowdedCelebrityGroups.has('timing')
    && crowdedCelebrityGroups.has('watch')
    && crowdedCelebrityGroups.has('reaction')
    && !crowdedCelebrity.includes('소상공인 지원금 신청'),
  crowdedCelebrity.map(keyword => `${keyword}:${classifyPracticalIntentGroup(keyword, 'entertainment')}`).join(', '));

const incidentKeyword = rankKeywordExpansionStrings('티빙 정보 유출', [
  '티빙 정보 유출 확인',
  '티빙 정보 유출 피해 확인',
  '티빙 정보 유출 공지',
  '티빙 정보 유출 보상',
  '티빙 정보 유출 장 방법',
  '티빙 정보 유출 장 가격',
  '티빙 정보 유출 장 비교',
  '티빙 정보 유출 추천',
  '티빙 정보 유출 후기',
  'kt 티빙 정보 유출',
], {
  source: 'autocomplete',
  limit: 16,
  minScore: 30,
  ensureIntentCoverage: true,
  intentCoverageMin: 10,
});
assert('keyword analyzer incident expansion keeps verification and damage intents',
  incidentKeyword.includes('티빙 정보 유출 확인')
    && incidentKeyword.includes('티빙 정보 유출 피해 확인')
    && incidentKeyword.includes('티빙 정보 유출 공지')
    && incidentKeyword.includes('티빙 정보 유출 보상'),
  incidentKeyword.join(', '));
assert('keyword analyzer incident expansion blocks commerce suffix noise',
  !incidentKeyword.some(keyword => /장\s*(방법|가격|비교)|추천|후기|리뷰|가격|비교|순위/.test(keyword.replace('티빙 정보 유출', ''))),
  incidentKeyword.join(', '));

const sparseIncident = rankKeywordExpansionStrings('티빙 정보 유출', [], {
  source: 'autocomplete',
  limit: 12,
  minScore: 30,
  ensureIntentCoverage: true,
  intentCoverageMin: 8,
});
const sparseIncidentGroups = new Set(sparseIncident.map(keyword => classifyPracticalIntentGroup(keyword, 'incident')));
assert('keyword analyzer sparse incident autocomplete backfills practical response intents',
  sparseIncident.length >= 8
    && sparseIncidentGroups.has('lookup')
    && sparseIncidentGroups.has('risk')
    && sparseIncidentGroups.has('usage')
    && sparseIncidentGroups.has('criteria')
    && !sparseIncident.some(keyword => /가격|비교|추천|후기|리뷰|순위|장단점/.test(keyword)),
  sparseIncident.map(keyword => `${keyword}:${classifyPracticalIntentGroup(keyword, 'incident')}`).join(', '));

const keywordAnalysisHandler = fs.readFileSync(
  path.join(__dirname, '..', '..', 'main', 'handlers', 'keyword-analysis.ts'),
  'utf8',
);
const naverAutocompleteSource = fs.readFileSync(
  path.join(__dirname, '..', 'naver-autocomplete.ts'),
  'utf8',
);
const coverageOptionCount = (keywordAnalysisHandler.match(/ensureIntentCoverage:\s*true/g) || []).length;
assert('keyword analysis IPC enables sparse-result practical intent coverage on expansion paths',
  coverageOptionCount >= 3
    && /intentCoverageMin:\s*Math\.min\(40,\s*Math\.max\(12,\s*targetCount\)\)/.test(keywordAnalysisHandler)
    && /intentCoverageMin:\s*isUnlimited\s*\?\s*40\s*:\s*Math\.min\(24,\s*Math\.max\(8,\s*Math\.floor\(targetCount \/ 2\)\)\)/.test(keywordAnalysisHandler),
  `coverageOptionCount=${coverageOptionCount}`);

assert('keyword analysis IPC routes policy seeds to article-pillar suffix harvesting',
  /POLICY_CONTEXT_RE/.test(keywordAnalysisHandler)
    && /' 신청방법', ' 자격', ' 대상', ' 혜택', ' 지원내용', ' 지원금액'/.test(keywordAnalysisHandler)
    && /' 신청 대상', ' 신청 절차', ' 신청 안되는 이유'/.test(keywordAnalysisHandler),
  'policy seeds can fall back to generic commerce suffixes again');

assert('naver autocomplete uses practical intent coverage when raw related sources are sparse',
  /rankKeywordExpansionCandidates/.test(naverAutocompleteSource)
    && /ensureIntentCoverage:\s*true/.test(naverAutocompleteSource)
    && /intentCoverageMin:\s*30/.test(naverAutocompleteSource)
    && !/rankRelatedKeywordCandidates\(baseKeyword,\s*candidates/.test(naverAutocompleteSource),
  'autocomplete suggestions can return thin raw related-keyword output again');

console.log(`\n[keyword-expansion-ranker.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
