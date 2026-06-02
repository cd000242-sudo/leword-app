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
  isMainExposed?: boolean;  // 지식인 메인 노출 여부
  hasExternalLinks?: boolean; // 기존 답변에 외부 링크가 있는지
  externalLinkCount?: number; // 기존 답변 외부 링크 수
  answerQualityScore?: number; // 기존 답변 품질 점수 (0~100)
  questionIntentScore?: number; // 블로그/검색 전환 의도 점수 (0~100)
  isExpertOnly?: boolean;   // 전문가 전용/공식 답변 성격

  // Phase 2: 확장 signal (선택적, enrichKinSignals 로 주입)
  monthlySearchVolume?: number; // 네이버 검색광고 월 검색량
  estimatedCpc?: number;        // profit-engine CPC 추정
  blogDocCount?: number;        // 네이버 블로그 문서수 (경쟁 강도)
  enrichmentAvailable?: boolean; // 외부 데이터 수집 성공 여부
}

export type KinGrade = 'SSS' | 'SS' | 'S' | 'A' | 'B';
export type KinTrafficPotential = 'very_high' | 'high' | 'medium' | 'low';

export interface KinHoneyPotProfile {
  score: number;
  grade: KinGrade;
  reason: string;
  externalTrafficPotential: KinTrafficPotential;
  route: string[];
}

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

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
}

function normalizeTrafficDemand(signals: KinSignals): number {
  const viewScore = normalizeViewScore(signals.viewCount);
  const vph = Math.max(0, signals.viewsPerHour || 0);
  const velocityScore = vph >= 50 ? 100 : vph >= 20 ? 82 : vph >= 10 ? 68 : vph >= 5 ? 54 : vph > 0 ? 38 : 0;
  return Math.max(viewScore, velocityScore);
}

function normalizeAnswerGap(signals: KinSignals): number {
  if (signals.isAdopted) return 0;
  const answerGap = normalizeAnswerScore(signals.answerCount);
  const quality = Math.max(0, Math.min(100, signals.answerQualityScore ?? (signals.answerCount === 0 ? 0 : 55)));
  const weakAnswerBonus = signals.answerCount === 0 ? 100 : 100 - quality;
  return clampScore(answerGap * 0.65 + weakAnswerBonus * 0.35);
}

function normalizeExternalGap(signals: KinSignals): number {
  const linkCount = Math.max(0, signals.externalLinkCount || 0);
  if (signals.hasExternalLinks && linkCount >= 3) return 10;
  if (signals.hasExternalLinks) return 35;
  return 100;
}

function normalizeSearchGap(signals: KinSignals): number {
  if (!signals.enrichmentAvailable) return 55;

  const volume = Math.max(0, signals.monthlySearchVolume || 0);
  const docs = Math.max(0, signals.blogDocCount || 0);
  const cpc = Math.max(0, signals.estimatedCpc || 0);
  let score = 35;

  if (volume >= 5000) score += 25;
  else if (volume >= 1000) score += 18;
  else if (volume >= 300) score += 10;
  else if (volume >= 100) score += 5;

  if (docs > 0 && volume > 0) {
    const ratio = volume / docs;
    if (ratio >= 5) score += 25;
    else if (ratio >= 2) score += 16;
    else if (ratio >= 1) score += 8;
  } else if (volume >= 300 && docs === 0) {
    score += 18;
  }

  if (cpc >= 1000) score += 8;
  else if (cpc >= 500) score += 4;

  return clampScore(score);
}

function calculateHoneyPotGrade(signals: KinSignals, score: number): KinGrade {
  if (signals.isAdopted || signals.isExpertOnly) return 'B';

  const { viewCount = 0, answerCount = 0, hoursAgo = 999 } = signals;
  const vph = signals.viewsPerHour || 0;
  const externalLinks = signals.externalLinkCount || 0;
  const intentScore = Math.max(0, Math.min(100, signals.questionIntentScore ?? 50));
  const hasDemand = viewCount >= 50 || vph >= 3;
  const hasStrongSssDemand = viewCount >= 120 || vph >= 8;

  if (intentScore < 38) return score >= 45 ? 'A' : 'B';
  if (intentScore < 50 && score >= 62) return 'S';

  if (
    score >= 82 &&
    hasDemand &&
    hasStrongSssDemand &&
    intentScore >= 60 &&
    answerCount <= 1 &&
    hoursAgo <= 72 &&
    !signals.isMainExposed &&
    !signals.hasExternalLinks
  ) {
    return 'SSS';
  }
  if (score >= 72 && (viewCount >= 35 || vph >= 2) && answerCount <= 2 && hoursAgo <= 168 && externalLinks <= 1) {
    return 'SS';
  }
  if (score >= 62 && (viewCount >= 20 || vph >= 1.5) && answerCount <= 3 && hoursAgo <= 336 && externalLinks <= 1) {
    return 'S';
  }
  if (score >= 45 && answerCount <= 5 && hoursAgo <= 720) return 'A';
  return 'B';
}

export function calculateKinHoneyPotProfile(signals: KinSignals): KinHoneyPotProfile {
  const demandScore = normalizeTrafficDemand(signals);
  const answerGapScore = normalizeAnswerGap(signals);
  const freshnessScore = normalizeFreshnessScore(signals.hoursAgo);
  const externalGapScore = normalizeExternalGap(signals);
  const intentScore = Math.max(35, Math.min(100, signals.questionIntentScore ?? 50));
  const searchGapScore = normalizeSearchGap(signals);
  const hiddenScore = signals.isMainExposed ? 42 : 100;

  let score =
    demandScore * 0.24 +
    answerGapScore * 0.26 +
    intentScore * 0.18 +
    externalGapScore * 0.12 +
    searchGapScore * 0.10 +
    freshnessScore * 0.06 +
    hiddenScore * 0.04;

  if (signals.isAdopted) score -= 35;
  if (signals.answerCount >= 6) score -= 45;
  else if (signals.answerCount >= 4) score -= 28;
  if (signals.isExpertOnly) score -= 25;
  if ((signals.externalLinkCount || 0) >= 3) score -= 30;
  else if ((signals.externalLinkCount || 0) >= 2) score -= 18;
  if (signals.hoursAgo > 720) score -= 35;
  else if (signals.hoursAgo > 336) score -= 22;
  else if (signals.hoursAgo > 168) score -= 12;
  if (signals.hoursAgo > 2160 && (signals.viewsPerHour || 0) < 1) score -= 10;

  const finalScore = clampScore(score);
  const grade = calculateHoneyPotGrade(signals, finalScore);
  const reasonParts: string[] = [];

  if ((signals.viewsPerHour || 0) >= 5) reasonParts.push(`${Math.round(signals.viewsPerHour || 0)}회/시간`);
  else if (signals.viewCount >= 80) reasonParts.push(`조회 ${signals.viewCount.toLocaleString()}`);

  if (signals.answerCount === 0) reasonParts.push('무답변');
  else if (signals.answerCount <= 2) reasonParts.push(`답변 ${signals.answerCount}개`);
  else if (signals.answerCount <= 5) reasonParts.push('낮은 답변 경쟁');

  if (!signals.isAdopted) reasonParts.push('미채택');
  if (!signals.hasExternalLinks) reasonParts.push('외부링크 빈자리');
  if (!signals.isMainExposed) reasonParts.push('메인 미노출');
  if (intentScore >= 70) reasonParts.push('검색의도 강함');

  const potential: KinTrafficPotential =
    finalScore >= 84 ? 'very_high' :
    finalScore >= 72 ? 'high' :
    finalScore >= 56 ? 'medium' : 'low';

  const route = ['지식인 답변'];
  if (!signals.hasExternalLinks) route.push('블로그 상세글 연결');
  if (intentScore >= 70) route.push('네이버 검색 유입');
  if ((signals.monthlySearchVolume || 0) >= 300) route.push('월검색 수요');

  return {
    score: finalScore,
    grade,
    reason: reasonParts.length ? reasonParts.slice(0, 5).join(' · ') : '기본 수요 확인 필요',
    externalTrafficPotential: potential,
    route,
  };
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
  if (signals.isExpertOnly) score -= 30;
  if (signals.isMainExposed) score -= 22;
  if (signals.hasExternalLinks || (signals.externalLinkCount || 0) > 0) score -= 15;
  if ((signals.questionIntentScore ?? 50) < 45) score -= 18;

  // 급상승 보너스 (시간당 조회수 50+ = 실시간 폭발)
  if (signals.viewsPerHour && signals.viewsPerHour >= 50) {
    score += 20;
  } else if (signals.viewsPerHour && signals.viewsPerHour >= 20) {
    score += 10;
  }

  // Phase 2: 확장 signal 보너스 (enrichment 성공 시)
  if (signals.enrichmentAvailable) {
    // 월 검색량 보너스: 트래픽 수요가 실제로 있음
    if (signals.monthlySearchVolume && signals.monthlySearchVolume >= 5000) score += 10;
    else if (signals.monthlySearchVolume && signals.monthlySearchVolume >= 1000) score += 6;
    else if (signals.monthlySearchVolume && signals.monthlySearchVolume >= 300) score += 3;

    // 블루오션 보너스: 검색량 대비 문서 적음
    if (
      signals.monthlySearchVolume &&
      signals.blogDocCount !== undefined &&
      signals.blogDocCount > 0
    ) {
      const ratio = signals.monthlySearchVolume / signals.blogDocCount;
      if (ratio >= 5) score += 8;
      else if (ratio >= 2) score += 4;
    }

    // CPC 보너스: 수익성 있는 키워드
    if (signals.estimatedCpc && signals.estimatedCpc >= 1000) score += 5;
    else if (signals.estimatedCpc && signals.estimatedCpc >= 500) score += 2;
  }

  return clampScore(score);
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
  if (signals.isAdopted || signals.isExpertOnly) return 'B';

  const { viewCount = 0, answerCount = 0, hoursAgo = 999 } = signals;
  const intentScore = Math.max(0, Math.min(100, signals.questionIntentScore ?? 50));
  const externalLinks = signals.externalLinkCount || 0;

  // 임계값은 2026-04-14 실측 분포에 맞춰 튜닝됨 (baseline/grade-distribution.json)
  // 실측: avg 47.7, SS avg 64.5, S avg 51.9, A avg 34.4
  // 목표: SSS 비율 5~15% (DoD)

  // SSS: 최신·고조회·저답변·미채택·미노출·검색 전환 의도가 모두 살아있는 질문.
  if (
    score >= 60 &&
    viewCount >= 300 &&
    answerCount <= 1 &&
    hoursAgo <= 72 &&
    intentScore >= 60 &&
    !signals.isMainExposed &&
    !signals.hasExternalLinks &&
    externalLinks === 0
  ) {
    return 'SSS';
  }

  // SS: 점수 50+ AND 조회 100+ AND 답변 ≤5 AND 2주 이내
  if (
    score >= 50 &&
    viewCount >= 100 &&
    answerCount <= 3 &&
    hoursAgo <= 168 &&
    intentScore >= 45 &&
    externalLinks <= 1
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
