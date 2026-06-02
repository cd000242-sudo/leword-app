import { calculateKinHoneyPotProfile, gradeQuestion } from '../naver-kin-golden-config';
import {
  hasActionableHoneyDemand,
  hasKinAnswerGap,
  getLatestHiddenSortScore,
  isActionableHoneyResult,
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

assert('SSS latest hidden candidate is actionable',
  isActionableHoneyResult({ ...freshHotQuestion, honeyPotGrade: 'SSS' }));
assert('SSS latest hidden candidate has measurable actionable demand',
  hasActionableHoneyDemand({ ...freshHotQuestion, honeyPotGrade: 'SSS' }));

const thinDemand = {
  ...freshHotQuestion,
  title: '청년 월세 지원 서류 궁금합니다',
  viewCount: 50,
  hoursAgo: 8,
  viewsPerHour: 5,
};
const thinDemandProfile = calculateKinHoneyPotProfile(thinDemand);
assert('SSS는 신선함만이 아니라 강한 조회 수요가 있어야 한다',
  thinDemandProfile.grade !== 'SSS',
  `${thinDemandProfile.grade} ${thinDemandProfile.score} ${thinDemandProfile.reason}`);

const mainExposed = { ...freshHotQuestion, isMainExposed: true };
assert('메인 노출 질문은 SSS로 승격하지 않는다',
  calculateKinHoneyPotProfile(mainExposed).grade !== 'SSS');
assert('메인 노출 질문은 최신 꿀통 후보에서 제외', !isLatestHiddenHoneyCandidate(mainExposed));
assert('기존 goldenGrade 경로도 메인 노출 질문을 SSS로 올리지 않는다',
  gradeQuestion(mainExposed).grade !== 'SSS',
  gradeQuestion(mainExposed).grade);
assert('정렬 점수는 미노출 후보를 메인 노출 후보보다 우선한다',
  getLatestHiddenSortScore(freshHotQuestion) > getLatestHiddenSortScore(mainExposed),
  `${getLatestHiddenSortScore(freshHotQuestion)} <= ${getLatestHiddenSortScore(mainExposed)}`);

const overAnswered = { ...freshHotQuestion, answerCount: 4 };
assert('답변 4개 이상은 최신 꿀통 후보에서 제외', !isLatestHiddenHoneyCandidate(overAnswered));

const solvedButUnadoptedHighTraffic = {
  ...freshHotQuestion,
  title: '아이폰 배터리 교체 비용 얼마나 나오나요',
  viewCount: 780,
  answerCount: 3,
  hoursAgo: 9,
  viewsPerHour: 86.7,
  answerQualityScore: 92,
  questionIntentScore: 88,
  honeyPotGrade: 'S',
};
assert('미채택이어도 이미 충분한 답변이 있으면 숨은 꿀통 공백이 아니다',
  !hasKinAnswerGap(solvedButUnadoptedHighTraffic)
    && !isLatestHiddenHoneyCandidate(solvedButUnadoptedHighTraffic)
    && !isActionableHoneyResult(solvedButUnadoptedHighTraffic),
  `${hasKinAnswerGap(solvedButUnadoptedHighTraffic)} ${isLatestHiddenHoneyCandidate(solvedButUnadoptedHighTraffic)} ${isActionableHoneyResult(solvedButUnadoptedHighTraffic)}`);

const weakAnsweredHighTraffic = {
  ...freshHotQuestion,
  title: '아이폰 배터리 교체 비용과 예약 방법 알려주세요',
  viewCount: 780,
  answerCount: 2,
  hoursAgo: 9,
  viewsPerHour: 86.7,
  answerQualityScore: 32,
  questionIntentScore: 88,
  honeyPotGrade: 'SS',
};
assert('조회 반응이 크고 기존 답변이 빈약하면 보강형 꿀질문으로 유지',
  hasKinAnswerGap(weakAnsweredHighTraffic)
    && isLatestHiddenHoneyCandidate(weakAnsweredHighTraffic)
    && isActionableHoneyResult(weakAnsweredHighTraffic),
  `${hasKinAnswerGap(weakAnsweredHighTraffic)} ${isLatestHiddenHoneyCandidate(weakAnsweredHighTraffic)} ${isActionableHoneyResult(weakAnsweredHighTraffic)}`);
assert('정렬은 이미 충분한 답변보다 실제 답변 공백을 우선한다',
  getLatestHiddenSortScore(weakAnsweredHighTraffic) > getLatestHiddenSortScore(solvedButUnadoptedHighTraffic),
  `${getLatestHiddenSortScore(weakAnsweredHighTraffic)} <= ${getLatestHiddenSortScore(solvedButUnadoptedHighTraffic)}`);

assert('B-grade candidate is not actionable even if it passes the loose latest gate',
  !isActionableHoneyResult({ ...freshHotQuestion, viewCount: 70, viewsPerHour: 8.8, honeyPotGrade: 'B' }));

const weakSGrade = {
  ...freshHotQuestion,
  viewCount: 24,
  hoursAgo: 18,
  viewsPerHour: 1.3,
  answerCount: 1,
  honeyPotGrade: 'S',
};
assert('최신 후보라도 조회 반응이 약한 S급은 최종 꿀질문에서 제외',
  isLatestHiddenHoneyCandidate(weakSGrade) && !hasActionableHoneyDemand(weakSGrade) && !isActionableHoneyResult(weakSGrade),
  `${isLatestHiddenHoneyCandidate(weakSGrade)} ${hasActionableHoneyDemand(weakSGrade)} ${isActionableHoneyResult(weakSGrade)}`);

const freshNoAnswerSGrade = {
  ...freshHotQuestion,
  viewCount: 64,
  hoursAgo: 12,
  viewsPerHour: 5.3,
  answerCount: 0,
  honeyPotGrade: 'S',
};
assert('24시간 내 무답변+반응 있는 S급은 최종 꿀질문으로 유지',
  hasActionableHoneyDemand(freshNoAnswerSGrade) && isActionableHoneyResult(freshNoAnswerSGrade));

const oldPopular = { ...freshHotQuestion, viewCount: 5000, answerCount: 0, hoursAgo: 240, viewsPerHour: 20 };
assert('7일 초과 질문은 조회수가 높아도 최신 꿀통 후보 제외', !isLatestHiddenHoneyCandidate(oldPopular));

const adopted = { ...freshHotQuestion, answerCount: 1, isAdopted: true };
assert('채택 질문은 조회수가 높아도 후보 제외', !isLatestHiddenHoneyCandidate(adopted));

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
assert('저의도 질문은 조회 반응이 약하면 후보 제외', !isLatestHiddenHoneyCandidate(lowerIntent));
assert('정렬은 조회+답변공백+검색의도+신선도를 함께 본다',
  getLatestHiddenSortScore(freshHotQuestion) > getLatestHiddenSortScore(lowerIntent),
  `${getLatestHiddenSortScore(freshHotQuestion)} <= ${getLatestHiddenSortScore(lowerIntent)}`);

console.log(`\n[kin-hidden-honey-quality.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
