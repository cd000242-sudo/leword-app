/**
 * home-publish-planner.test.ts
 *
 * 홈판 헌터가 키워드만 보여주지 않고 오늘 발행 판단/제목/작성각도까지
 * 안정적으로 만들어주는지 검증한다.
 */

import { buildHomePublishPlan, scoreHomePanelTitleNeed } from '../pro-hunter-v12/home-publish-planner';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

const policyPlan = buildHomePublishPlan({
  keyword: '청년 월세 지원금 신청 대상',
  category: 'policy',
  searchVolume: 5400,
  documentCount: 1800,
  homeScore: 78,
  titleCandidates: [
    { title: '청년 월세 지원금 신청 대상과 자격 조건 총정리', ctrScore: 72, expectedCtr: 3.7, matchedPatterns: ['최신성'], penalties: [] },
    { title: '청년 월세 지원금 신청 기간·준비서류 한눈에 정리', ctrScore: 68, expectedCtr: 3.4, matchedPatterns: ['숫자형'], penalties: [] },
  ],
  qualityScore: 82,
  vacancySlots: 6,
  influencerCount: 1,
  bigDomainCount: 1,
  surgeRatio: 2.4,
  blogPublishCount24h: 12,
  daysSinceFirstAppear: 2,
});

assert('강한 정책 키워드는 오늘 발행 후보', ['PUBLISH_NOW', 'WRITE_TODAY'].includes(policyPlan.status), policyPlan.status);
assert('대표 제목에 키워드가 포함된다', policyPlan.primaryTitle.includes('청년 월세 지원금 신청 대상'), policyPlan.primaryTitle);
assert('제목 후보가 3개 제공된다', policyPlan.titleOptions.length === 3, `${policyPlan.titleOptions.length}`);
assert('정책 글에 필요한 항목이 포함된다', policyPlan.mustInclude.includes('신청 대상') && policyPlan.mustInclude.includes('공식 확인 경로'), policyPlan.mustInclude.join(','));
assert('노출 보장 표현을 피하도록 안내한다', policyPlan.avoid.includes('노출 보장 표현'), policyPlan.avoid.join(','));
assert('첫 문단에서 보장을 말하지 않는다', !/보장|확정/.test(policyPlan.firstParagraph), policyPlan.firstParagraph);

const genericTitleScore = scoreHomePanelTitleNeed('청년 월세 지원금 최신 정리', '청년 월세 지원금', 'policy');
const actionableTitleScore = scoreHomePanelTitleNeed('청년 월세 지원금 신청 대상과 준비서류 총정리', '청년 월세 지원금', 'policy');
assert('홈판 제목 점수는 단순 최신 정리보다 실행 니즈를 더 높게 본다',
  actionableTitleScore >= genericTitleScore + 20,
  `${actionableTitleScore} <= ${genericTitleScore}`);

const titleGatePlan = buildHomePublishPlan({
  keyword: '청년 월세 지원금',
  category: 'policy',
  homeScore: 82,
  titleCandidates: [
    { title: '청년 월세 지원금 최신 정리', ctrScore: 95, expectedCtr: 4.8, matchedPatterns: ['최신성'], penalties: [] },
    { title: '청년 월세 지원금 신청 대상과 준비서류 총정리', ctrScore: 62, expectedCtr: 3.3, matchedPatterns: [], penalties: [] },
  ],
  qualityScore: 86,
  vacancySlots: 7,
  influencerCount: 1,
  bigDomainCount: 1,
  surgeRatio: 1.8,
  daysSinceFirstAppear: 1,
});

assert('홈판 발행 제목은 뻔한 정리형보다 클릭 후 해결할 각도를 우선한다',
  /신청|대상|자격|조건|서류|준비/.test(titleGatePlan.primaryTitle),
  titleGatePlan.primaryTitle);

const weakPlan = buildHomePublishPlan({
  keyword: '날씨',
  category: 'general',
  homeScore: 12,
  titleCandidates: [{ title: '날씨 최신 핵심 정리, 지금 확인할 것', ctrScore: 45, expectedCtr: 2.5, matchedPatterns: [], penalties: [] }],
  vacancySlots: 1,
  influencerCount: 4,
  daysSinceFirstAppear: 90,
});

assert('빈자리 없는 약한 키워드는 제외', weakPlan.status === 'SKIP', weakPlan.status);

const overclaimPlan = buildHomePublishPlan({
  keyword: '봄 네일 추천',
  category: 'beauty',
  homeScore: 72,
  titleCandidates: [
    { title: '봄 네일 추천으로 월 100만원 버는 법', ctrScore: 85, expectedCtr: 4.3, matchedPatterns: ['결과약속'], penalties: [] },
    { title: '봄 네일 추천 디자인과 컬러 조합 정리', ctrScore: 60, expectedCtr: 3.2, matchedPatterns: ['최신성'], penalties: [] },
  ],
  qualityScore: 70,
  vacancySlots: 5,
  daysSinceFirstAppear: 3,
});

assert('비정책/비수익 키워드의 과장 제목은 대표 제목에서 밀린다', !/월\s*100만원/.test(overclaimPlan.primaryTitle), overclaimPlan.primaryTitle);

const again = buildHomePublishPlan({
  keyword: '청년 월세 지원금 신청 대상',
  category: 'policy',
  searchVolume: 5400,
  documentCount: 1800,
  homeScore: 78,
  titleCandidates: [
    { title: '청년 월세 지원금 신청 대상과 자격 조건 총정리', ctrScore: 72, expectedCtr: 3.7, matchedPatterns: ['최신성'], penalties: [] },
  ],
  qualityScore: 82,
  vacancySlots: 6,
  daysSinceFirstAppear: 2,
});

assert('플래너는 결정적이다', again.primaryTitle === buildHomePublishPlan({
  keyword: '청년 월세 지원금 신청 대상',
  category: 'policy',
  searchVolume: 5400,
  documentCount: 1800,
  homeScore: 78,
  titleCandidates: [
    { title: '청년 월세 지원금 신청 대상과 자격 조건 총정리', ctrScore: 72, expectedCtr: 3.7, matchedPatterns: ['최신성'], penalties: [] },
  ],
  qualityScore: 82,
  vacancySlots: 6,
  daysSinceFirstAppear: 2,
}).primaryTitle, again.primaryTitle);

console.log(`\n[home-publish-planner.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
