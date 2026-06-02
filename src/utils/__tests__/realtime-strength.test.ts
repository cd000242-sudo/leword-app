/**
 * realtime-strength.test.ts
 *
 * 포털 실시간 키워드를 단순 순위가 아니라 교차소스/글감성/노이즈 기준으로
 * 재정렬하는 강도 스코어 회귀 테스트.
 */

import {
  getRealtimeKeywordFamilyKey,
  RealtimeKeyword,
  scoreRealtimeKeywordStrength,
  strengthenRealtimeKeywordGroups
} from '../realtime-search-keywords';

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

const strongPolicy = scoreRealtimeKeywordStrength('청년 월세 지원금 신청 대상', {
  rank: 2,
  change: 'up',
  primarySource: 'naver',
  matchedSources: ['naver', 'daum', 'policy']
});

assert('정책/지원금성 + 교차소스 키워드는 STRONG', strongPolicy.strengthGrade === 'STRONG', JSON.stringify(strongPolicy));
assert('교차소스 수가 보존된다', strongPolicy.sourceCount === 3, `${strongPolicy.sourceCount}`);
assert('글감 의도 점수가 붙는다', strongPolicy.blogIntentScore >= 60, `${strongPolicy.blogIntentScore}`);

const broad = scoreRealtimeKeywordStrength('날씨', {
  rank: 1,
  primarySource: 'zum',
  matchedSources: ['zum']
});

assert('너무 넓은 단일 키워드는 약하게 본다', broad.strengthGrade === 'WEAK', JSON.stringify(broad));
assert('빅키워드 감점이 붙는다', broad.noisePenalty >= 20, `${broad.noisePenalty}`);

const now = new Date().toISOString();
const groups = strengthenRealtimeKeywordGroups({
  naver: [
    { keyword: '날씨', rank: 1, source: 'naver', timestamp: now },
    { keyword: '청년 월세 지원금 신청 대상', rank: 8, source: 'naver', timestamp: now, change: 'up' }
  ],
  daum: [
    { keyword: '청년 월세 지원금 신청 대상', rank: 3, source: 'daum', timestamp: now },
    { keyword: '날씨', rank: 1, source: 'daum', timestamp: now }
  ],
  zum: [
    { keyword: '비즈넵 세나', rank: 2, source: 'zum', timestamp: now }
  ]
}, 10);

const naverTop = (groups.naver || [])[0] as RealtimeKeyword;
assert('플랫폼 목록은 강한 후보를 위로 재정렬한다', naverTop.keyword === '청년 월세 지원금 신청 대상', naverTop.keyword);
assert('재정렬된 키워드에 근거가 붙는다', !!naverTop.strengthReasons?.some(reason => /교차|글감|혜택/.test(reason)), JSON.stringify(naverTop.strengthReasons));

const variantGroups = strengthenRealtimeKeywordGroups({
  naver: [
    { keyword: '날씨', rank: 1, source: 'naver', timestamp: now },
    { keyword: '청년월세지원금 신청', rank: 8, source: 'naver', timestamp: now, change: 'up' }
  ],
  daum: [
    { keyword: '청년 월세 지원금 대상', rank: 3, source: 'daum', timestamp: now }
  ],
  bokjiro: [
    { keyword: '청년 월세 지원금 신청 대상', rank: 1, source: 'bokjiro', timestamp: now }
  ]
}, 10);

const variantTop = (variantGroups.naver || [])[0] as RealtimeKeyword;
assert('정책 이슈 표현이 달라도 같은 실시간 가족으로 묶는다',
  getRealtimeKeywordFamilyKey('청년월세지원금 신청') === getRealtimeKeywordFamilyKey('청년 월세 지원금 대상')
    && getRealtimeKeywordFamilyKey('청년 월세 지원금 대상') === getRealtimeKeywordFamilyKey('청년 월세 지원금 신청 대상'),
  `${getRealtimeKeywordFamilyKey('청년월세지원금 신청')} / ${getRealtimeKeywordFamilyKey('청년 월세 지원금 대상')} / ${getRealtimeKeywordFamilyKey('청년 월세 지원금 신청 대상')}`);
assert('표현만 다른 정책 후보도 교차소스 STRONG으로 승격',
  variantTop.keyword === '청년월세지원금 신청'
    && variantTop.sourceCount >= 3
    && variantTop.strengthGrade === 'STRONG',
  JSON.stringify(variantTop));

const deterministicA = scoreRealtimeKeywordStrength('청년 월세 지원금 신청 대상', {
  rank: 2,
  change: 'up',
  primarySource: 'naver',
  matchedSources: ['naver', 'daum', 'policy']
});
const deterministicB = scoreRealtimeKeywordStrength('청년 월세 지원금 신청 대상', {
  rank: 2,
  change: 'up',
  primarySource: 'naver',
  matchedSources: ['naver', 'daum', 'policy']
});

assert('스코어링은 결정적이다', deterministicA.strengthScore === deterministicB.strengthScore, `${deterministicA.strengthScore} !== ${deterministicB.strengthScore}`);

console.log(`\n[realtime-strength.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
