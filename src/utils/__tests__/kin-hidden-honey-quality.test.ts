import { calculateKinHoneyPotProfile } from '../naver-kin-golden-config';
import {
  getLatestHiddenSortScore,
  isLatestHiddenHoneyCandidate,
  resolveKinFreshHoursAgo,
} from '../naver-kin-golden-hunter-v3';

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

const freshHotQuestion = {
  title: '청년 월세 지원금 신청 대상 어떻게 확인하나요',
  url: 'https://kin.naver.com/qna/detail.naver?docId=10001',
  viewCount: 320,
  answerCount: 0,
  hoursAgo: 8,
  viewsPerHour: 40,
  likeCount: 0,
  isAdopted: false,
  isMainExposed: false,
  hasExternalLinks: false,
  externalLinkCount: 0,
  questionIntentScore: 94,
};

const profile = calculateKinHoneyPotProfile(freshHotQuestion);
assert('최신 고조회 무답변 미노출 질문은 SSS 꿀통', profile.grade === 'SSS',
  `${profile.grade} ${profile.score} ${profile.reason}`);
assert('최신 꿀통 후보 게이트 통과', isLatestHiddenHoneyCandidate(freshHotQuestion));

const mainExposed = { ...freshHotQuestion, isMainExposed: true };
assert('메인 노출 질문은 SSS로 승격하지 않는다',
  calculateKinHoneyPotProfile(mainExposed).grade !== 'SSS');

const overAnswered = { ...freshHotQuestion, answerCount: 4 };
assert('답변 4개 이상은 최신 꿀통 후보에서 제외', !isLatestHiddenHoneyCandidate(overAnswered));

const oldPopular = { ...freshHotQuestion, viewCount: 5000, answerCount: 0, hoursAgo: 240, viewsPerHour: 20 };
assert('7일 초과 질문은 조회수가 높아도 최신 꿀통 후보 제외', !isLatestHiddenHoneyCandidate(oldPopular));

assert('목록 최신 시간이 있으면 상세 오래된 날짜 오탐을 버린다',
  resolveKinFreshHoursAgo(3, 1463, 24) === 3);
assert('목록 시간이 없고 상세 시간이 신선하면 상세 시간을 사용한다',
  resolveKinFreshHoursAgo(999, 2, 24) === 2);
assert('둘 다 불신이면 안전 fallback을 사용한다',
  resolveKinFreshHoursAgo(999, 999, 24) === 24);

const lowerIntent = {
  ...freshHotQuestion,
  title: '제발 알려주세요',
  questionIntentScore: 35,
  viewCount: 80,
  viewsPerHour: 3.3,
};
assert('정렬은 조회+답변공백+검색의도+신선도를 함께 본다',
  getLatestHiddenSortScore(freshHotQuestion) > getLatestHiddenSortScore(lowerIntent),
  `${getLatestHiddenSortScore(freshHotQuestion)} <= ${getLatestHiddenSortScore(lowerIntent)}`);

console.log(`\n[kin-hidden-honey-quality.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
