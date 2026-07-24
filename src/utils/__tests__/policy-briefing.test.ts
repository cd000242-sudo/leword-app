/**
 * policy-briefing.test.ts
 *
 * 정책브리핑 카드가 기사 본문 전체를 제목처럼 표시하지 않도록
 * 표시 제목 정제 규칙을 검증한다.
 */

import {
  compactPolicyDisplayTitle,
  compactPolicyKeywordPhrase,
  expandPolicyDiscoverySeeds,
  getPolicyFallbackKeywords,
} from '../policy-briefing-api';

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

assert('정책 키워드는 조회·기간·서류형 의도를 보존',
  compactPolicyKeywordPhrase('청년 월세 지원금 신청 기간과 준비서류를 확인하세요') === '청년 월세 지원금 신청',
  compactPolicyKeywordPhrase('청년 월세 지원금 신청 기간과 준비서류를 확인하세요'));

// v2.49.72 회귀: korea.kr RSS 중단(404) → HTML 스크래핑 잔재가 "등 …" 조각/문장으로 새던 결함
{
  const cut = compactPolicyKeywordPhrase('등 피해에 대한 재난지원금 지급');
  assert('앞머리 "등" 조각 + "○○에 대한" 수식절 제거',
    !cut.startsWith('등') && !/피해에 대한/.test(cut) && /재난지원금/.test(cut),
    cut);
}
assert('앞머리 연결어 "및" 제거',
  !compactPolicyKeywordPhrase('및 소상공인 지원 대상').startsWith('및'),
  compactPolicyKeywordPhrase('및 소상공인 지원 대상'));
assert('"누구나" 포함 기사 헤드라인은 키워드에서 배제',
  compactPolicyKeywordPhrase('학생은 누구나 사전신청') === '',
  compactPolicyKeywordPhrase('학생은 누구나 사전신청'));

// v2.49.72 배포 실측 회귀: 문장 조각·의료 통계 용어가 정책 키워드로 새던 사례
assert('동사 연결형(~한다든지) 문장 조각 배제',
  compactPolicyKeywordPhrase('취약계층에게 일자리를 제공한다든지') === '',
  compactPolicyKeywordPhrase('취약계층에게 일자리를 제공한다든지'));
assert('의료 기사 조각(악화되지 않고/생존기간) 배제',
  compactPolicyKeywordPhrase('암이 악화되지 않고 유지되는 기간') === ''
    && compactPolicyKeywordPhrase('무진행 생존기간') === '',
  `${compactPolicyKeywordPhrase('암이 악화되지 않고 유지되는 기간')} / ${compactPolicyKeywordPhrase('무진행 생존기간')}`);
assert('정상 정책 키워드는 그대로 보존(과교정 방지)',
  compactPolicyKeywordPhrase('청년 월세 지원금 신청') === '청년 월세 지원금 신청'
    && compactPolicyKeywordPhrase('소상공인 정책자금 신청') === '소상공인 정책자금 신청',
  `${compactPolicyKeywordPhrase('청년 월세 지원금 신청')} / ${compactPolicyKeywordPhrase('소상공인 정책자금 신청')}`);

assert('지원금 fallback은 빈 소스 상황에서도 30개 이상 제공',
  getPolicyFallbackKeywords(36).length >= 36,
  `${getPolicyFallbackKeywords(36).length}`);

assert('지원금 fallback은 실제 작성 가능한 신청/대상형 키워드를 포함',
  getPolicyFallbackKeywords(36).some(k => /소상공인|청년|근로장려금/.test(k) && /신청|대상|조회|기간/.test(k)),
  getPolicyFallbackKeywords(36).join(', '));

const expandedPolicySeeds = expandPolicyDiscoverySeeds('청년 월세 지원금', 12);
assert('정책 공식명 하나는 신청/대상/서류형 검색 의도로 확장',
  expandedPolicySeeds.length >= 8
    && expandedPolicySeeds.includes('청년 월세 지원금 신청')
    && expandedPolicySeeds.some(k => /대상|자격|조건/.test(k))
    && expandedPolicySeeds.some(k => /서류|기간|조회/.test(k)),
  expandedPolicySeeds.join(', '));

assert('정책 확장 시드는 너무 큰 단일 토큰으로 후퇴하지 않음',
  !expandedPolicySeeds.includes('지원금')
    && expandedPolicySeeds.every(k => k.length <= 42)
    && expandedPolicySeeds.length === new Set(expandedPolicySeeds.map(k => k.replace(/\s+/g, ''))).size,
  expandedPolicySeeds.join(', '));

const fallback100 = getPolicyFallbackKeywords(100);
assert('정책 fallback은 네트워크 실패 상황에서도 100개 이상 대량 시드 제공',
  fallback100.length >= 100,
  `${fallback100.length}`);

assert('정책 fallback 100개는 작성 가능한 의도형 키워드 중심',
  fallback100.slice(0, 100).filter(k => /신청|대상|자격|조건|기간|서류|조회|지급일|마감|금액|방법|변경|온라인/.test(k)).length >= 90,
  fallback100.slice(0, 100).join(', '));

console.log(`\n[policy-briefing.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
