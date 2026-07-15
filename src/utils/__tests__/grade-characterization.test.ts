/**
 * grade-characterization.test.ts
 *
 * 등급 SSoT(../grade) 의 동작을 경계값 격자로 고정(characterization/oracle).
 * C1(등급 단일화) 리팩토링 시 mdp/radar/mindmap 를 이 SSoT 로 재연결할 때
 * 의도치 않은 동작 변경을 즉시 잡기 위한 회귀 방어선.
 */
import {
  classifyGrade,
  classifyGradeByMetrics,
  isClassicSss,
  isWinnableSss,
  isGoldenSss,
  normalizeStoredGrade,
  GRADE_THRESHOLDS,
  Grade,
} from '../grade';
import {
  isClassicSssMetrics,
  isWinnableSssMetrics,
  isGoldenSssMetrics,
} from '../golden-discovery-floor';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else { failed++; failures.push(`FAIL ${name}${detail ? ' - ' + detail : ''}`); }
}
const eq = (name: string, got: unknown, want: unknown) =>
  assert(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ── classic SSS 지표 경계 (v≥1000, docs≤5000, ratio≥5) ──
eq('classic 정상', isClassicSss(1000, 200, 5), true);
eq('classic vol 999 탈락', isClassicSss(999, 200, 5), false);
eq('classic docs 5000 통과', isClassicSss(1000, 5000, 5), true);
eq('classic docs 5001 탈락', isClassicSss(1000, 5001, 5), false);
eq('classic docs 0 탈락', isClassicSss(1000, 0, 5), false);
eq('classic ratio 4.9 탈락', isClassicSss(1000, 200, 4.9), false);

// ── 저볼륨 winnable SSS 경로 폐기 ──
eq('winnable 정상 지표도 SSS 우회 승격 금지', isWinnableSss(300, 80, 3), false);
eq('winnable vol 99 탈락', isWinnableSss(99, 80, 3), false);
eq('winnable vol 1500도 승격 금지', isWinnableSss(1500, 400, 3), false);
eq('winnable vol 1501 탈락', isWinnableSss(1501, 400, 3), false);
eq('winnable docs 500도 승격 금지', isWinnableSss(300, 500, 3), false);
eq('winnable docs 501 탈락', isWinnableSss(300, 501, 3), false);
eq('winnable ratio 2.9 탈락', isWinnableSss(300, 80, 2.9), false);

// ── golden = classic only ──
eq('golden classic', isGoldenSss(1000, 200, 5), true);
eq('golden 저볼륨 winnable 제외', isGoldenSss(300, 80, 3), false);
eq('golden 둘다 탈락', isGoldenSss(800, 900, 0.9), false);

// ── classifyGrade 풀 래더 (점수+지표) ──
eq('SSS classic', classifyGrade({ score: 85, volume: 1000, docs: 200, ratio: 5 }), 'SSS');
// classic 지표라도 점수 84면 SSS가 아니며 하위 SS로 내려간다.
eq('classic-only 점수 84 → SS', classifyGrade({ score: 84, volume: 2000, docs: 3000, ratio: 5 }), 'SS');
eq('classic 지표 점수 84 → SS', classifyGrade({ score: 84, volume: 1000, docs: 200, ratio: 5 }), 'SS');
eq('저볼륨 winnable 점수 80 → S', classifyGrade({ score: 80, volume: 300, docs: 80, ratio: 3 }), 'S');
eq('winnable 점수 79 → S', classifyGrade({ score: 79, volume: 300, docs: 80, ratio: 3 }), 'S');
eq('SS 정상', classifyGrade({ score: 75, volume: 500, docs: 9000, ratio: 3 }), 'SS');
eq('SS 점수 74 → S', classifyGrade({ score: 74, volume: 500, docs: 9000, ratio: 3 }), 'S');
eq('S 정상', classifyGrade({ score: 65, volume: 300, docs: 99999, ratio: 2 }), 'S');
eq('A 정상', classifyGrade({ score: 55, volume: 100, docs: 99999, ratio: 1 }), 'A');
eq('B 정상', classifyGrade({ score: 45, volume: 10, docs: 99999, ratio: 0.5 }), 'B');
eq('C 정상', classifyGrade({ score: 30, volume: 10, docs: 99999, ratio: 0.5 }), 'C');
eq('D 정상', classifyGrade({ score: 29, volume: 10, docs: 99999, ratio: 0.5 }), 'D');
// SSS/SS 는 docs 상한이 있어 docs 폭발 시 탈락하지만, S 는 docs 상한 없음(mdp 원본 계승 — C3 개선 대상).
eq('점수85 docs폭발 → SSS/SS 아님, S로 내려감', classifyGrade({ score: 85, volume: 1000, docs: 60000, ratio: 5 }), 'S');

// ── classifyGradeByMetrics (마인드맵, 지표-only) ──
eq('metric SSS classic', classifyGradeByMetrics(1000, 200, 5), 'SSS');
eq('metric 저볼륨 winnable → S', classifyGradeByMetrics(300, 80, 3), 'S');
eq('metric SS', classifyGradeByMetrics(500, 10000, 3), 'SS');
eq('metric S', classifyGradeByMetrics(300, 15000, 2), 'S');
eq('metric A', classifyGradeByMetrics(100, 30000, 1.5), 'A');
eq('metric B', classifyGradeByMetrics(30, 80000, 1.1), 'B');
eq('metric C (sv 0)', classifyGradeByMetrics(0, 100, 5), 'C');
eq('metric C (docs 0)', classifyGradeByMetrics(1000, 0, 5), 'C');

// ── normalizeStoredGrade: 유효 등급 통과 + 점수-only 는 SSS/SS 승격 금지(최대 S) ──
eq('stored SSS 통과', normalizeStoredGrade('SSS', 10), 'SSS');
eq('stored SS 통과', normalizeStoredGrade('ss', 10), 'SS');
eq('점수85 but 등급없음 → S(가짜SSS 차단)', normalizeStoredGrade('', 85), 'S');
eq('점수55 등급없음 → A', normalizeStoredGrade(null, 55), 'A');
eq('점수10 등급없음 → D', normalizeStoredGrade(undefined, 10), 'D');

// ── floor 별칭이 grade SSoT 와 동일 동작 (위임 무결성) ──
const grid: Array<[number, number, number]> = [
  [1000, 200, 5], [999, 200, 5], [300, 80, 3], [99, 80, 3], [800, 900, 0.9], [1500, 500, 3], [1501, 500, 3],
];
grid.forEach(([v, d, r], i) => {
  eq(`floor classic 위임[${i}]`, isClassicSssMetrics(v, d, r), isClassicSss(v, d, r));
  eq(`floor winnable 위임[${i}]`, isWinnableSssMetrics(v, d, r), isWinnableSss(v, d, r));
  eq(`floor golden 위임[${i}]`, isGoldenSssMetrics(v, d, r), isGoldenSss(v, d, r));
});

// ── 임계값 상수 스냅샷 (CLAUDE.md 등급 시스템과 정합) ──
eq('thr sssClassic vol', GRADE_THRESHOLDS.sssClassic.volumeMin, 1000);
eq('thr sssWinnable 폐기', 'sssWinnable' in GRADE_THRESHOLDS, false);
eq('thr ss score', GRADE_THRESHOLDS.ss.scoreMin, 75);
const _t: Grade = 'SSS'; void _t;

console.log(`\n[grade-characterization.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
