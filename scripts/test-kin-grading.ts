/**
 * 지식인 황금질문 등급 로직 단위 테스트
 * 실행: npx ts-node --transpile-only scripts/test-kin-grading.ts
 *
 * 종료 코드:
 *   0 - 모든 테스트 통과
 *   1 - 테스트 실패 있음
 */

import {
  calculateGoldenScore,
  calculateGrade,
  gradeQuestion,
  normalizeViewScore,
  normalizeAnswerScore,
  normalizeFreshnessScore,
  normalizeCompetitionScore,
  KinSignals,
  KinGrade,
} from '../src/utils/naver-kin-golden-config';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assertEq<T>(actual: T, expected: T, name: string) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    const msg = `  ❌ ${name}\n     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`;
    failures.push(msg);
    console.log(msg);
  }
}

function assertGrade(signals: KinSignals, expected: KinGrade, name: string) {
  const { score, grade } = gradeQuestion(signals);
  if (grade === expected) {
    passed++;
  } else {
    failed++;
    const msg = `  ❌ ${name} (score=${score})\n     expected grade: ${expected}\n     actual grade:   ${grade}\n     signals: ${JSON.stringify(signals)}`;
    failures.push(msg);
    console.log(msg);
  }
}

function assertScoreInRange(signals: KinSignals, min: number, max: number, name: string) {
  const score = calculateGoldenScore(signals);
  if (score >= min && score <= max) {
    passed++;
  } else {
    failed++;
    const msg = `  ❌ ${name}\n     expected score: ${min}~${max}\n     actual:   ${score}`;
    failures.push(msg);
    console.log(msg);
  }
}

console.log('\n=== 지식인 등급 로직 단위 테스트 ===\n');

// -----------------------------------------------------------
console.log('[1] 정규화 함수');
// -----------------------------------------------------------
assertEq(normalizeViewScore(0), 0, '조회 0 → 0');
assertEq(normalizeViewScore(10), 0, '조회 10 → 0 (임계 이하)');
assertEq(normalizeViewScore(20), 20, '조회 20 → 20');
assertEq(normalizeViewScore(500), 80, '조회 500 → 80');
assertEq(normalizeViewScore(5000), 100, '조회 5000 → 100');
assertEq(normalizeAnswerScore(0), 100, '답변 0 → 100 (최고)');
assertEq(normalizeAnswerScore(2), 65, '답변 2 → 65');
assertEq(normalizeAnswerScore(10), 0, '답변 10 → 0');
assertEq(normalizeFreshnessScore(1), 100, '1시간 전 → 100');
assertEq(normalizeFreshnessScore(72), 60, '72시간 전 → 60');
assertEq(normalizeFreshnessScore(1000), 10, '1000시간 전 → 10');
assertEq(normalizeCompetitionScore(0), 100, '좋아요 0 → 100');
assertEq(normalizeCompetitionScore(20), 0, '좋아요 20 → 0');

// -----------------------------------------------------------
console.log('\n[2] 등급 경계값 — SSS');
// -----------------------------------------------------------

// 완벽한 SSS 후보
assertGrade(
  { viewCount: 500, answerCount: 0, hoursAgo: 3, likeCount: 0, isAdopted: false },
  'SSS',
  'SSS: 조회500 답변0 3시간전 좋아요0'
);

// SSS 실패: 조회 부족 (300 미달) → SS로 떨어짐 (score는 높으니까)
assertGrade(
  { viewCount: 299, answerCount: 0, hoursAgo: 1, likeCount: 0, isAdopted: false },
  'SS',
  'SSS 실패: 조회 299 (300 미달) → SS 강등'
);

// SSS 실패: 답변 4개 (3 초과)
assertGrade(
  { viewCount: 1000, answerCount: 4, hoursAgo: 1, likeCount: 0, isAdopted: false },
  'SS',
  'SSS 실패: 답변 4개 → SS'
);

// SSS 실패: 169시간 경과 (1주 초과)
assertGrade(
  { viewCount: 1000, answerCount: 0, hoursAgo: 169, likeCount: 0, isAdopted: false },
  'SS',
  'SSS 실패: 169시간 전 (1주 초과) → SS'
);

// -----------------------------------------------------------
console.log('\n[3] 등급 경계값 — SS/S/A/B');
// -----------------------------------------------------------

// SS: 점수 55+ 조회 100+ 답변 ≤5 2주 이내
assertGrade(
  { viewCount: 200, answerCount: 2, hoursAgo: 24, likeCount: 0, isAdopted: false },
  'SS',
  'SS: 조회200 답변2 어제 좋아요0'
);

// S: 조회 30+ 점수 40+
assertGrade(
  { viewCount: 100, answerCount: 4, hoursAgo: 48, likeCount: 1, isAdopted: false },
  'S',
  'S: 조회100 답변4 2일전'
);

// A: 점수 25~40
assertGrade(
  { viewCount: 30, answerCount: 3, hoursAgo: 200, likeCount: 1, isAdopted: false },
  'A',
  'A: 조회30 답변3 8일전'
);

// B: 최악 케이스
assertGrade(
  { viewCount: 5, answerCount: 10, hoursAgo: 1000, likeCount: 20, isAdopted: false },
  'B',
  'B: 모든 signal 최악'
);

// -----------------------------------------------------------
console.log('\n[4] 채택 질문 페널티');
// -----------------------------------------------------------

// 완벽한 SSS 후보라도 isAdopted=true면 B
assertGrade(
  { viewCount: 1000, answerCount: 0, hoursAgo: 1, likeCount: 0, isAdopted: true },
  'B',
  '채택된 질문은 무조건 B (다른 signal 무시)'
);

// -----------------------------------------------------------
console.log('\n[5] 결정성 (같은 입력 → 같은 출력)');
// -----------------------------------------------------------

const testSignal: KinSignals = {
  viewCount: 500,
  answerCount: 1,
  hoursAgo: 12,
  likeCount: 2,
  isAdopted: false,
};
const r1 = gradeQuestion(testSignal);
const r2 = gradeQuestion(testSignal);
const r3 = gradeQuestion(testSignal);
assertEq(r1.score, r2.score, '결정성: score run1=run2');
assertEq(r2.score, r3.score, '결정성: score run2=run3');
assertEq(r1.grade, r2.grade, '결정성: grade run1=run2');

// -----------------------------------------------------------
console.log('\n[6] 급상승 보너스');
// -----------------------------------------------------------

const baseRising: KinSignals = {
  viewCount: 100,
  answerCount: 3,
  hoursAgo: 24,
  likeCount: 0,
  isAdopted: false,
};
const scoreNoBonus = calculateGoldenScore(baseRising);
const scoreWithBonus = calculateGoldenScore({ ...baseRising, viewsPerHour: 60 });
if (scoreWithBonus > scoreNoBonus) {
  passed++;
} else {
  failed++;
  const msg = `  ❌ 급상승 보너스 미적용: 무보너스=${scoreNoBonus}, 보너스=${scoreWithBonus}`;
  failures.push(msg);
  console.log(msg);
}

// -----------------------------------------------------------
console.log('\n[7] 베이스라인 샘플 분포 검증');
// -----------------------------------------------------------

// 베이스라인(bench.json)에서 본 전형적인 15개 샘플 시뮬레이션
// getPopularQnA 결과: avg 조회 764, avg 답변 5.8, mostly 24h 이내
const simulatedSamples: KinSignals[] = [
  // 실제 관측된 패턴 모사
  { viewCount: 525, answerCount: 3, hoursAgo: 4, likeCount: 2, isAdopted: false },
  { viewCount: 991, answerCount: 3, hoursAgo: 8, likeCount: 1, isAdopted: false },
  { viewCount: 428, answerCount: 3, hoursAgo: 7, likeCount: 2, isAdopted: false },
  { viewCount: 66, answerCount: 1, hoursAgo: 0, likeCount: 1, isAdopted: false },
  { viewCount: 37, answerCount: 2, hoursAgo: 8, likeCount: 0, isAdopted: false },
  { viewCount: 4902, answerCount: 5, hoursAgo: 8, likeCount: 3, isAdopted: false },
  { viewCount: 702, answerCount: 17, hoursAgo: 0, likeCount: 9, isAdopted: false },
  { viewCount: 4798, answerCount: 4, hoursAgo: 7, likeCount: 12, isAdopted: false },
  { viewCount: 1035, answerCount: 9, hoursAgo: 21, likeCount: 6, isAdopted: false },
  { viewCount: 980, answerCount: 11, hoursAgo: 0, likeCount: 10, isAdopted: false },
  { viewCount: 769, answerCount: 7, hoursAgo: 7, likeCount: 1, isAdopted: false },
  { viewCount: 1179, answerCount: 14, hoursAgo: 24, likeCount: 14, isAdopted: false },
  { viewCount: 913, answerCount: 2, hoursAgo: 120, likeCount: 2, isAdopted: false },
  { viewCount: 1911, answerCount: 22, hoursAgo: 144, likeCount: 30, isAdopted: false },
  { viewCount: 1246, answerCount: 11, hoursAgo: 96, likeCount: 9, isAdopted: false },
];

const grades = simulatedSamples.map((s) => gradeQuestion(s));
const hist: Record<KinGrade, number> = { SSS: 0, SS: 0, S: 0, A: 0, B: 0 };
for (const { grade } of grades) hist[grade]++;
const total = simulatedSamples.length;
const sssPct = (hist.SSS / total) * 100;
const ssPct = (hist.SS / total) * 100;

console.log(`  분포: SSS ${hist.SSS}(${sssPct.toFixed(1)}%) / SS ${hist.SS}(${ssPct.toFixed(1)}%) / S ${hist.S} / A ${hist.A} / B ${hist.B}`);

// DoD: SSS 비율 0 아님 (구조적 가능성 확인) + 80% 초과 쏠림 없음
// 실제 DoD 5~15%는 실측 분포(baseline/grade-distribution.json)에서 검증
if (sssPct > 0 && sssPct < 50) {
  passed++;
  console.log(`  ✅ SSS 구조적 가능성 확보: ${sssPct.toFixed(1)}% (시뮬 샘플)`);
} else {
  failed++;
  const msg = `  ❌ SSS 구조 문제: ${sssPct.toFixed(1)}% (0 또는 >=50)`;
  failures.push(msg);
  console.log(msg);
}

// S/A/B 중 아무 등급도 전체의 80% 이상 차지하지 않아야 함 (분포 쏠림 방지)
let maxPct = 0;
for (const g of ['S', 'A', 'B'] as KinGrade[]) {
  const pct = (hist[g] / total) * 100;
  if (pct > maxPct) maxPct = pct;
}
if (maxPct < 80) {
  passed++;
} else {
  failed++;
  const msg = `  ❌ 분포 쏠림: 한 등급이 ${maxPct.toFixed(1)}% 차지`;
  failures.push(msg);
  console.log(msg);
}

// -----------------------------------------------------------
console.log('\n[8] 타당성: 신호별 기여도');
// -----------------------------------------------------------

// 답변 0 하나만 바뀌어도 점수가 크게 올라야 함
const baseLow = { viewCount: 100, answerCount: 5, hoursAgo: 24, likeCount: 0, isAdopted: false };
const baseHigh = { ...baseLow, answerCount: 0 };
const scoreLow = calculateGoldenScore(baseLow);
const scoreHigh = calculateGoldenScore(baseHigh);
if (scoreHigh - scoreLow >= 30) {
  passed++;
} else {
  failed++;
  const msg = `  ❌ 답변 가중치 부족: 답변5→0 차이 ${scoreHigh - scoreLow}점 (≥30 기대)`;
  failures.push(msg);
  console.log(msg);
}

// -----------------------------------------------------------
console.log('\n[9] Phase 2: enrichment signal 보너스');
// -----------------------------------------------------------

const baseEnrich: KinSignals = {
  viewCount: 300, answerCount: 3, hoursAgo: 24, likeCount: 0, isAdopted: false,
};
const baseScore = calculateGoldenScore(baseEnrich);

// 고검색량 + 저경쟁 enrichment 보너스
const withRichSignals: KinSignals = {
  ...baseEnrich,
  enrichmentAvailable: true,
  monthlySearchVolume: 5000,
  blogDocCount: 500, // ratio = 10 (블루오션)
  estimatedCpc: 1200,
};
const richScore = calculateGoldenScore(withRichSignals);
if (richScore > baseScore + 15) {
  passed++;
  console.log(`  ✅ 확장 signal 보너스: ${baseScore} → ${richScore} (+${(richScore - baseScore).toFixed(1)})`);
} else {
  failed++;
  const msg = `  ❌ 확장 signal 보너스 부족: ${baseScore} → ${richScore}`;
  failures.push(msg);
  console.log(msg);
}

// enrichmentAvailable=false는 base와 동일
const disabledEnrich: KinSignals = {
  ...baseEnrich,
  enrichmentAvailable: false,
  monthlySearchVolume: 9999, // 무시되어야 함
};
assertEq(
  calculateGoldenScore(disabledEnrich),
  baseScore,
  'enrichmentAvailable=false 시 확장 signal 무시'
);

// -----------------------------------------------------------
// enrichment 모듈 단위 테스트
// -----------------------------------------------------------
console.log('\n[10] enrichment: 키워드 추출 + 쿼터');

const { extractKeywordFromTitle, getEnrichmentQuota, isEnrichmentEnabled } =
  require('../src/utils/naver-kin-signal-enrichment');

assertEq(
  typeof extractKeywordFromTitle('아이폰 15 프로 카메라 어때요?'),
  'string',
  'extractKeywordFromTitle 리턴 타입'
);

const kw = extractKeywordFromTitle('아이폰 15 프로 카메라 어때요');
if (kw.length > 0) {
  passed++;
  console.log(`  ✅ 키워드 추출: "아이폰 15 프로..." → "${kw}"`);
} else {
  failed++;
  failures.push('  ❌ 키워드 추출 결과가 빈 문자열');
}

assertEq(
  extractKeywordFromTitle(''),
  '',
  '빈 제목 → 빈 문자열'
);

const quota = getEnrichmentQuota();
if (quota && typeof quota.searchAd.limit === 'number' && quota.searchAd.limit > 0) {
  passed++;
} else {
  failed++;
  failures.push('  ❌ getEnrichmentQuota 구조 오류');
}

assertEq(
  typeof isEnrichmentEnabled(),
  'boolean',
  'isEnrichmentEnabled() 리턴 타입'
);

// -----------------------------------------------------------
console.log('\n' + '='.repeat(50));
console.log(`결과: ${passed} 통과 / ${failed} 실패`);
console.log('='.repeat(50));

if (failed > 0) {
  console.log('\n[실패 내역]');
  failures.forEach((f) => console.log(f));
  process.exit(1);
} else {
  console.log('\n✅ 모든 테스트 통과');
  process.exit(0);
}
