/**
 * live-golden-curiosity-supply — 근본길: 저경쟁 호기심 롱테일 공급 (2026-07-23).
 *
 * 배경: 코어 발굴이 "글감 의도(상용/정책) 정규식"으로 씨앗·후보를 걸러서
 * '꺼먹살이 뜻'·'이창섭 사주' 같은 저경쟁 호기심 롱테일을 측정 전에 버렸다.
 * 급등 레인은 이 정규식 게이트 없이 경제성(비율·문서수)만 봐서 이런 키워드로
 * 성공한다. 이 계약은 코어 경로도 호기심·정보성 의도를 수용하되, 품질 보증은
 * 여전히 비율/문서수 게이트가 하도록 고정한다.
 *
 * 고정 계약:
 * 1. hasLiveCuriosityIntent: 뜻/유래/사주/프롬프트/가사/실화 등 정보성 의도 인식
 * 2. isStrongLiveIssueSeed: 호기심 롱테일 씨앗을 이제 통과시킨다(측정까지 도달)
 * 3. 그러나 포화 헤드('보일러 교체 비용' 등 문서수 폭탄)는 비율/문서수 게이트에서
 *    여전히 탈락한다(품질 게이트 불변) — 게이트를 풀어서가 아니라 공급으로 해결
 * 4. 경제성이 좋은 호기심 롱테일(문서수 ≪ 검색량)은 게이트를 통과한다
 */

import { __liveGoldenRadarTestInternals } from '../../mobile/live-golden-radar';

const {
  hasLiveCuriosityIntent,
  isStrongLiveIssueSeed,
  isLiveRadarUsableKeyword,
  normalizeLiveMetricGrade,
} = __liveGoldenRadarTestInternals as unknown as {
  hasLiveCuriosityIntent: (kw: string) => boolean;
  isStrongLiveIssueSeed: (kw: string) => boolean;
  isLiveRadarUsableKeyword: (kw: string, vol: number | null, docs: number | null, now?: Date) => boolean;
  normalizeLiveMetricGrade: (kw: string, cur: unknown, sc: number | null, vol: number, docs: number, ratio: number) => string;
};

const gradeOf = (kw: string, vol: number, docs: number, ratio: number) =>
  normalizeLiveMetricGrade(kw, null, null, vol, docs, ratio);

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    console.error(`[live-golden-curiosity-supply.test] failed: ${name}${detail ? ` - ${detail}` : ''}`);
    process.exit(1);
  }
}

let passed = 0;
const ok = (name: string, condition: boolean, detail?: string) => {
  assert(name, condition, detail);
  passed += 1;
};

// 1. 호기심·정보성 의도 인식
ok('뜻 recognized as curiosity intent', hasLiveCuriosityIntent('꺼먹살이 뜻'));
ok('사주 recognized', hasLiveCuriosityIntent('이창섭 사주'));
ok('프롬프트 recognized', hasLiveCuriosityIntent('이창섭 사주 프롬프트'));
ok('가사 recognized', hasLiveCuriosityIntent('만찬가 가사'));
ok('유래 recognized', hasLiveCuriosityIntent('아프리카 tv 별풍선 유래'));
ok('실화 recognized', hasLiveCuriosityIntent('그 영화 실화'));
ok('plain commercial head is not curiosity', !hasLiveCuriosityIntent('보일러 교체 비용'));
ok('empty is not curiosity', !hasLiveCuriosityIntent(''));

// 2. 호기심 롱테일 씨앗이 이제 강한 이슈 씨앗으로 통과 (측정까지 도달)
ok('curiosity 뜻 seed now passes the seed gate', isStrongLiveIssueSeed('꺼먹살이 뜻'));
ok('curiosity 사주 seed passes', isStrongLiveIssueSeed('이창섭 사주'));
ok('curiosity 배그부부 뜻 seed passes', isStrongLiveIssueSeed('배그부부 뜻'));

// 3. 포화 헤드는 여전히 비율/문서수 게이트에서 탈락 (품질 게이트 불변)
ok('saturated head stays rejected by doc ceiling (보일러 교체 비용)',
  !isLiveRadarUsableKeyword('보일러 교체 비용', 3540, 315006));
ok('saturated head stays rejected (입주청소 비용)',
  !isLiveRadarUsableKeyword('입주청소 비용', 14440, 1040851));

// 4. 경제성 좋은 호기심 롱테일(문서수 ≪ 검색량)은 통과
ok('low-competition curiosity long-tail passes the usable gate',
  isLiveRadarUsableKeyword('꺼먹살이 뜻', 800, 300));
ok('curiosity with saturated docs still rejected (economics, not shape)',
  !isLiveRadarUsableKeyword('사랑 뜻', 500, 900000));

// 5. 등급 캘리브레이션 — "골고루 많이": 경제성 좋은 호기심 황금키워드가 SSS 유지
//    (예전엔 need-intent 없다고 SS로 강등돼 SSS-only 보드에서 빠졌다)
ok('curiosity SSS-economics keeps SSS (이창섭 사주 프롬프트, ratio 102)',
  gradeOf('이창섭 사주 프롬프트', 1020, 10, 102) === 'SSS');
ok('curiosity 뜻 keeps SSS (배그부부 뜻, ratio 49)',
  gradeOf('배그부부 뜻', 34490, 700, 49) === 'SSS');
ok('curiosity 가사 keeps SSS (만찬가 가사, ratio 27)',
  gradeOf('만찬가 가사', 39650, 1432, 27) === 'SSS');
ok('curiosity 실화 keeps SSS with classic economics',
  gradeOf('그 드라마 실화', 5200, 240, 21) === 'SSS');

// 6. 그러나 경제성이 약하면(문서수 폭탄/저비율) 여전히 SSS 아님 — 지표 게이트 불변
ok('weak-economics curiosity is NOT SSS (docs bomb)',
  gradeOf('사랑 뜻', 500, 900000, 0.0006) !== 'SSS');
ok('mid-ratio curiosity below classic floor is NOT SSS',
  gradeOf('무슨 영화 뜻', 900, 7000, 0.13) !== 'SSS');

// 7. 상용 황금키워드는 그대로 SSS (회귀 없음)
ok('commercial golden keyword still SSS',
  gradeOf('근로장려금 신청 방법', 8200, 300, 27) === 'SSS');

// 8. "골고루" — 상용/호기심 문구가 전혀 없어도 실측 경제성이 증명되면 SSS
//    (실측 수요 + 실측 저경쟁이 곧 황금의 정의. 문구 정규식이 아니라 숫자가 판정)
ok('proven economics alone reaches SSS without any intent wording (ratio 210)',
  gradeOf('장윤기 큰아버지 계급', 8610, 41, 210) === 'SSS');
ok('proven economics alone reaches SSS (news-ish, ratio 68)',
  gradeOf('미쉐린 2스타 디저트 징역 구형', 21690, 320, 67.78) === 'SSS');
// 그러나 경제성 미달(문서수 상한 초과)은 승격되지 않는다
ok('high volume but heavy docs does NOT get the economics bypass',
  gradeOf('임의 이벤트 키워드', 50000, 40000, 1.25) !== 'SSS');

console.log(`[live-golden-curiosity-supply.test] passed: ${passed} / failed: 0`);
process.exit(0); // 무거운 radar 모듈 임포트가 남기는 핸들 때문에 명시 종료
