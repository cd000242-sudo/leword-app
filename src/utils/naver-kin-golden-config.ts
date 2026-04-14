/**
 * 네이버 지식인 황금질문 — 통합 스코어링/등급 판정 설정
 *
 * 단일 소스 원칙: 모든 지식인 scoring/grading 로직은 이 파일에서만 정의.
 * naver-kin-golden-hunter-v3.ts 와 naver-kin-crawler.ts 는 이 파일을 import.
 *
 * 가중치 근거: baseline/BASELINE.md (2026-04-14 측정)
 * - 실측 평균 점수 53, 최대 75 (단일 임계 120+=SSS 구조적 불가능)
 * - "답변수=0" 이 가장 강한 signal → answer 가중치 최대
 * - 목표: SSS 비율 5~15%
 */

// ============================================================
// Signal 타입
// ============================================================

export interface KinSignals {
  viewCount: number;       // 조회수
  answerCount: number;     // 답변 수
  hoursAgo: number;        // 작성 후 경과 시간 (시간 단위)
  likeCount: number;       // 좋아요/공감 수
  isAdopted: boolean;      // 채택 답변 존재 여부
  viewsPerHour?: number;   // 시간당 조회수 (급상승 탭에서만)
}

export type KinGrade = 'SSS' | 'SS' | 'S' | 'A' | 'B';

// ============================================================
// 가중치 (합=1.0) — Phase 1 기준
// ============================================================

export const KIN_WEIGHTS = {
  view: 0.25,      // 조회수 — 가치 있는 트래픽의 존재 증거
  answer: 0.40,    // 답변수 — 가장 강한 signal (경쟁 없음 = 기회)
  freshness: 0.20, // 신선도 — 너무 오래된 질문은 노출 감소
  competition: 0.15, // 경쟁도 (좋아요 적음 = 경쟁 약함)
} as const;

// ============================================================
// 개별 signal → 0~100 정규화 함수
// ============================================================

/** 조회수 → 0~100. 20 미만은 의미 없고 2000+는 최고. */
export function normalizeViewScore(viewCount: number): number {
  const v = Math.max(0, viewCount || 0);
  if (v >= 2000) return 100;
  if (v >= 1000) return 90;
  if (v >= 500) return 80;
  if (v >= 200) return 65;
  if (v >= 100) return 50;
  if (v >= 50) return 35;
  if (v >= 20) return 20;
  return 0;
}

/** 답변수 → 0~100. 0개가 최고 (첫 답변 기회). */
export function normalizeAnswerScore(answerCount: number): number {
  const a = Math.max(0, answerCount || 0);
  if (a === 0) return 100;
  if (a === 1) return 85;
  if (a === 2) return 65;
  if (a === 3) return 45;
  if (a === 4) return 25;
  if (a === 5) return 10;
  return 0;
}

/** 신선도 → 0~100. 작성 후 시간 경과가 적을수록 높음. */
export function normalizeFreshnessScore(hoursAgo: number): number {
  const h = Math.max(0, hoursAgo || 0);
  if (h <= 6) return 100;
  if (h <= 24) return 80;
  if (h <= 72) return 60;
  if (h <= 168) return 40;
  if (h <= 336) return 20;
  return 10;
}

/** 경쟁도 → 0~100. 좋아요 적을수록 경쟁이 적음. */
export function normalizeCompetitionScore(likeCount: number): number {
  const l = Math.max(0, likeCount || 0);
  if (l === 0) return 100;
  if (l <= 2) return 70;
  if (l <= 5) return 40;
  if (l <= 10) return 20;
  return 0;
}

// ============================================================
// 통합 점수 계산 (0~100)
// ============================================================

/**
 * 지식인 질문의 황금 점수를 계산 (0~100).
 * 채택된 질문은 50점 페널티, 급상승은 20점 보너스.
 */
export function calculateGoldenScore(signals: KinSignals): number {
  const viewNorm = normalizeViewScore(signals.viewCount);
  const answerNorm = normalizeAnswerScore(signals.answerCount);
  const freshNorm = normalizeFreshnessScore(signals.hoursAgo);
  const compNorm = normalizeCompetitionScore(signals.likeCount);

  let score =
    viewNorm * KIN_WEIGHTS.view +
    answerNorm * KIN_WEIGHTS.answer +
    freshNorm * KIN_WEIGHTS.freshness +
    compNorm * KIN_WEIGHTS.competition;

  // 채택된 질문은 강한 페널티 (기회가 없음)
  if (signals.isAdopted) score -= 50;

  // 급상승 보너스 (시간당 조회수 50+ = 실시간 폭발)
  if (signals.viewsPerHour && signals.viewsPerHour >= 50) {
    score += 20;
  } else if (signals.viewsPerHour && signals.viewsPerHour >= 20) {
    score += 10;
  }

  return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
}

// ============================================================
// 다중 게이트 등급 판정
// ============================================================

/**
 * 지식인 질문의 등급을 판정. 점수 + 원시 signal 다중 AND 게이트.
 *
 * 게이트 설계 원칙:
 * - SSS: 점수 + 모든 주요 signal이 동시에 강함 (5~15% 목표)
 * - 채택된 질문은 자동 B (기회 없음)
 */
export function calculateGrade(signals: KinSignals, score: number): KinGrade {
  // 채택된 질문은 무조건 B (score 무시)
  if (signals.isAdopted) return 'B';

  const { viewCount = 0, answerCount = 0, hoursAgo = 999 } = signals;

  // 임계값은 2026-04-14 실측 분포에 맞춰 튜닝됨 (baseline/grade-distribution.json)
  // 실측: avg 47.7, SS avg 64.5, S avg 51.9, A avg 34.4
  // 목표: SSS 비율 5~15% (DoD)

  // SSS: 점수 60+ AND 조회 300+ AND 답변 ≤3 AND 1주 이내
  if (
    score >= 60 &&
    viewCount >= 300 &&
    answerCount <= 3 &&
    hoursAgo <= 168
  ) {
    return 'SSS';
  }

  // SS: 점수 50+ AND 조회 100+ AND 답변 ≤5 AND 2주 이내
  if (
    score >= 50 &&
    viewCount >= 100 &&
    answerCount <= 5 &&
    hoursAgo <= 336
  ) {
    return 'SS';
  }

  // S: 점수 38+ AND 조회 30+
  if (score >= 38 && viewCount >= 30) {
    return 'S';
  }

  // A: 점수 25+
  if (score >= 25) return 'A';

  return 'B';
}

/**
 * 편의 함수: signal만으로 점수와 등급을 한 번에 계산.
 */
export function gradeQuestion(signals: KinSignals): { score: number; grade: KinGrade } {
  const score = calculateGoldenScore(signals);
  const grade = calculateGrade(signals, score);
  return { score, grade };
}
