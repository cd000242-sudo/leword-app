/**
 * keyword-value-verifier.test.ts
 *
 * C4: dormant 필살 엔진 keyword-value-verifier(verifyKeywordValue)를 메인 발굴에 승격하기 전
 * 현 동작을 고정(characterization). 계약: kill-switch(인물/YMYL), 등급↔품질점수 밴드, valuable 공식.
 */
import { verifyKeywordValue } from '../pro-hunter-v12/keyword-value-verifier';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else { failed++; failures.push(`FAIL ${name}${detail ? ' - ' + detail : ''}`); }
}
const eq = (name: string, got: unknown, want: unknown) =>
  assert(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// 발굴 배선은 mode:'lenient' 사용 → 특성화도 lenient 파리티로 고정.
// ── kill-switch: YMYL 토큰('치료')은 mode 불문 kill → ymylSafe 실패 + valueGrade 'C' ──
const ymyl = verifyKeywordValue({ keyword: '무릎 통증 치료 방법 정리', searchVolume: 2000, documentCount: 100, mode: 'lenient' });
assert('YMYL 킬', !!ymyl.isKilled, `isKilled=${ymyl.isKilled}`);
eq('YMYL → valueGrade C', ymyl.valueGrade, 'C');
eq('YMYL → not valuable', ymyl.valuable, false);
eq('YMYL 게이트 ymylSafe 실패', ymyl.gates.ymylSafe.passed, false);

// ── kill-switch: 인물 토큰('아이유'), allowPerson 기본(false) → notPersonDependent 실패 + kill ──
const person = verifyKeywordValue({ keyword: '아이유 콘서트 예매 방법', searchVolume: 5000, documentCount: 200, mode: 'lenient' });
assert('인물 킬(allowPerson 기본 false)', !!person.isKilled, `isKilled=${person.isKilled}`);
eq('인물 게이트 notPersonDependent 실패', person.gates.notPersonDependent.passed, false);

// ── allowPerson:true → 인물 게이트 통과(kill 해제 가능) ──
const personAllowed = verifyKeywordValue({ keyword: '아이유 콘서트 예매 방법', searchVolume: 5000, documentCount: 200, allowPerson: true, mode: 'lenient' });
eq('allowPerson=true → 인물 게이트 통과', personAllowed.gates.notPersonDependent.passed, true);

// ── 검색량 0(측정 안 됨) → searchVolume 게이트 실패, valuable 아님 (default 0 정직성) ──
const noVol = verifyKeywordValue({ keyword: '겨울 캠핑 난로 추천 비교 정리', searchVolume: 0, documentCount: 0, mode: 'lenient' });
eq('검색량 0 게이트 실패', noVol.gates.searchVolume.passed, false);
eq('검색량 0 → not valuable', noVol.valuable, false);

// ── 정상 정보형 롱테일(lenient) → 킬 안 됨, valuable ──
const good = verifyKeywordValue({ keyword: '전기장판 전기요금 계산 방법 비교', searchVolume: 3000, documentCount: 300, mode: 'lenient' });
assert('정상 롱테일 킬 안 됨', !good.isKilled, `isKilled=${good.isKilled}`);
assert('정상 롱테일 valuable', good.valuable === true, `valuable=${good.valuable}, q=${good.qualityScore}`);

// ── 계약 불변식: 여러 입력에서 등급↔품질점수 밴드 + valuable 공식 일관 ──
const samples = [ymyl, person, personAllowed, noVol, good];
samples.forEach((r, i) => {
  assert(`[${i}] qualityScore 0~100`, r.qualityScore >= 0 && r.qualityScore <= 100, `${r.qualityScore}`);
  // 등급↔품질점수 밴드(소스 390-396 계승): kill이면 C, 아니면 90/75/58/42 경계
  const expectedGrade = r.isKilled ? 'C'
    : r.qualityScore >= 90 ? 'S+'
    : r.qualityScore >= 75 ? 'S'
    : r.qualityScore >= 58 ? 'A'
    : r.qualityScore >= 42 ? 'B' : 'C';
  eq(`[${i}] valueGrade 밴드 일관`, r.valueGrade, expectedGrade);
  // valuable = !isKilled && passedCount/totalEvaluated >= 0.6
  const expectedValuable = !r.isKilled && (r.passedCount / r.totalEvaluated) >= 0.6;
  eq(`[${i}] valuable 공식 일관`, r.valuable, expectedValuable);
});

console.log(`\n[keyword-value-verifier.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach((f) => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
