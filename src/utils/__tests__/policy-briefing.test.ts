/**
 * policy-briefing.test.ts
 *
 * 정책브리핑 카드가 기사 본문 전체를 제목처럼 표시하지 않도록
 * 표시 제목 정제 규칙을 검증한다.
 */

import { compactPolicyDisplayTitle } from '../policy-briefing-api';

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

const longBodyTitle =
  '공공부문 비정규직 처우개선 대책 차질 없이 추진하고 있습니다. - 관계부처 합동, 공공부문 비정규직 처우개선 가이드라인 및 공공부문 비정규직 채용 사전심사제 운영방안 개정안 마련·시행 고용노동부는 지난 4.28. 국무회의에서 관계부처 합동으로 발표한 공공부문 비정규직 처우개선 대책의 후속조치로 공공부문 비정규직 처우개선 가이드라인을 개정하고 각 기관에 안내했습니다.';

const compact = compactPolicyDisplayTitle(longBodyTitle, '공공부문 비정규직 처우개선 대책');
assert('본문형 긴 제목은 첫 제목 문장만 사용', compact === '공공부문 비정규직 처우개선 대책 차질 없이 추진하고 있습니다.', compact);
assert('표시 제목은 96자 이내', compact.length <= 96, `${compact.length}자`);
assert('관계부처 이후 본문 덩어리 제거', !compact.includes('관계부처 합동'), compact);

const noSentence = compactPolicyDisplayTitle(
  '청년 월세 지원 신청 대상 자격 접수 방법 2026년 변경사항과 지역별 제출서류 상세 정리 고용센터 지자체 안내 자료 기반 온라인 신청 절차와 소득 기준 예외 사례까지 한 번에 확인하는 긴 제목',
  '청년 월세 지원 신청'
);
assert('문장 구분이 없으면 말줄임으로 제한', noSentence.length <= 99 && noSentence.endsWith('...'), noSentence);

console.log(`\n[policy-briefing.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
