// PRO Hunter v12 — Win Prediction
// 작성: 2026-04-15
// 사용자 블로그 지수 + 키워드 난이도 → 예상 순위/도달 일수/신뢰구간
// 학습 데이터가 모이기 전까지는 보정된 휴리스틱 (Phase F가 보정)

import type { SerpAnalysis } from './serp-content-analyzer';
import type { FetchedPost } from './serp-content-fetcher';

export interface UserCapability {
  blogIndex: number;          // 0~100 (사용자 블로그 지수)
  experienceMonths: number;   // 운영 개월
  avgPostWordCount: number;   // 사용자 평균 글 길이
  category?: string;          // 사용자 주력 카테고리
}

export interface WinPrediction {
  estimatedRankP10: number;   // 낙관 (10퍼센타일)
  estimatedRankP50: number;   // 중간값
  estimatedRankP90: number;   // 비관 (90퍼센타일)
  rankRange: string;          // "1~3위" 같은 표시용
  confidence: 'high' | 'medium' | 'low';
  timeToRankDays: number;     // 예상 노출 도달 일수
  monthlyTrafficP10: number;
  monthlyTrafficP50: number;
  monthlyTrafficP90: number;
  difficultyScore: number;    // 0~100 (높을수록 어려움)
  reasoning: string[];        // 판단 근거
  warnings: string[];
}

const DEFAULT_USER: UserCapability = {
  blogIndex: 40,              // 일반 블로그 평균
  experienceMonths: 6,
  avgPostWordCount: 1000,
};

/**
 * 키워드 난이도 (0~100, 높을수록 어려움)
 * - 평균 단어수 (긴 글이 1위면 진입장벽 높음)
 * - 평균 이미지 수
 * - 평균 글 신선도 (오래된 글 많을수록 쉬움 → 낮은 난이도)
 * - 본문 평균 외부링크 (많을수록 정성)
 */
function computeDifficulty(analysis: SerpAnalysis, posts: FetchedPost[]): number {
  let score = 30; // 기본

  // 글 길이
  if (analysis.avgWordCount >= 2500) score += 25;
  else if (analysis.avgWordCount >= 1800) score += 18;
  else if (analysis.avgWordCount >= 1200) score += 10;
  else if (analysis.avgWordCount < 800) score -= 10;

  // 이미지 (정성도)
  if (analysis.avgImageCount >= 12) score += 12;
  else if (analysis.avgImageCount >= 8) score += 6;
  else if (analysis.avgImageCount < 4) score -= 8;

  // h2 구조
  if (analysis.avgH2Count >= 6) score += 8;
  else if (analysis.avgH2Count < 3) score -= 5;

  // 신선도 (오래된 글 많으면 쉬움)
  if (analysis.oldPostRatio >= 0.6) score -= 15;
  else if (analysis.oldPostRatio >= 0.3) score -= 8;
  else if (analysis.oldPostRatio === 0) score += 10;

  // 영상 사용
  if (analysis.videoUsageRatio >= 0.5) score += 8;

  // 외부 링크 (참조 정성)
  if (analysis.avgExternalLinks >= 3) score += 5;

  // 비어있는 SERP (10개 미만 수집됨)
  if (analysis.postCount < 5) score -= 20;

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * 사용자 능력 vs 키워드 난이도 → 예상 순위 분포
 */
function estimateRank(
  user: UserCapability,
  difficulty: number,
  analysis: SerpAnalysis
): { p10: number; p50: number; p90: number; reasoning: string[] } {
  const reasoning: string[] = [];

  // 사용자 점수 (0~100)
  // 블로그 지수가 가장 큰 가중치
  const userScore = user.blogIndex * 0.7 + Math.min(100, user.experienceMonths * 2) * 0.15 + Math.min(100, user.avgPostWordCount / 20) * 0.15;

  // gap = userScore - difficulty
  // gap > 30 → 거의 1위 가능
  // gap > 0 → 상위권
  // gap < 0 → 어려움
  const gap = userScore - difficulty;
  reasoning.push(`사용자 점수 ${Math.round(userScore)} vs 키워드 난이도 ${difficulty} (격차 ${gap > 0 ? '+' : ''}${Math.round(gap)})`);

  let p50: number;
  if (gap >= 40) p50 = 1.5;
  else if (gap >= 25) p50 = 3;
  else if (gap >= 10) p50 = 5;
  else if (gap >= 0) p50 = 8;
  else if (gap >= -15) p50 = 13;
  else if (gap >= -30) p50 = 20;
  else p50 = 30;

  // 신선도 보너스: 오래된 글 많은 SERP → 사용자가 신선도로 우위
  if (analysis.oldPostRatio >= 0.5 && user.experienceMonths >= 3) {
    p50 = Math.max(1, p50 - 2);
    reasoning.push(`📉 상위권 ${Math.round(analysis.oldPostRatio * 100)}%가 1년+ 노후 → 신선도 우위 -2위`);
  }

  // 약한 경쟁자 보너스
  const weakCount = analysis.postCount - Math.ceil(analysis.postCount * 0.5);
  if (weakCount >= 5) {
    p50 = Math.max(1, p50 - 1);
  }

  // 신뢰구간: 사용자 데이터가 적을수록 넓게
  const variance = user.experienceMonths < 3 ? 6 : user.experienceMonths < 12 ? 4 : 2.5;
  const p10 = Math.max(1, Math.round(p50 - variance));
  const p90 = Math.round(p50 + variance);

  return { p10, p50: Math.round(p50), p90, reasoning };
}

function estimateTimeToRank(rank: number, user: UserCapability): number {
  // 일반적으로 신생 블로그가 글 발행 → 인덱싱 → 순위 자리잡기까지
  // 1위권: 평균 14일, 5위권: 21일, 10위권: 30일
  const base = rank <= 3 ? 14 : rank <= 5 ? 18 : rank <= 10 ? 25 : 35;
  const exp = user.experienceMonths < 3 ? 1.4 : user.experienceMonths < 12 ? 1.1 : 1.0;
  return Math.round(base * exp);
}

function estimateMonthlyTraffic(rank: number, searchVolume: number | null): number {
  // 네이버 블로그 CTR 추정 (대략적)
  const ctrTable: Record<number, number> = {
    1: 0.28, 2: 0.16, 3: 0.10, 4: 0.07, 5: 0.05,
    6: 0.04, 7: 0.03, 8: 0.025, 9: 0.02, 10: 0.018,
  };
  const ctr = ctrTable[Math.min(10, Math.max(1, Math.round(rank)))] || 0.01;
  const sv = searchVolume || 0;
  return Math.round(sv * ctr);
}

export function predictWin(
  analysis: SerpAnalysis,
  posts: FetchedPost[],
  user: UserCapability = DEFAULT_USER,
  searchVolume: number | null = null
): WinPrediction {
  const difficulty = computeDifficulty(analysis, posts);
  const { p10, p50, p90, reasoning } = estimateRank(user, difficulty, analysis);

  const timeToRank = estimateTimeToRank(p50, user);

  const trafficP10 = estimateMonthlyTraffic(p10, searchVolume);
  const trafficP50 = estimateMonthlyTraffic(p50, searchVolume);
  const trafficP90 = estimateMonthlyTraffic(p90, searchVolume);

  // 신뢰도
  let confidence: WinPrediction['confidence'] = 'medium';
  if (analysis.postCount >= 8 && user.experienceMonths >= 6) confidence = 'high';
  else if (analysis.postCount < 5 || user.experienceMonths === 0) confidence = 'low';

  const warnings: string[] = [];
  if (difficulty >= 75) warnings.push(`난이도 매우 높음 (${difficulty}/100). 사용자 지수 ${user.blogIndex}로는 도전적`);
  if (analysis.postCount < 5) warnings.push('SERP 데이터 부족 → 예측 정확도 낮음');
  if (user.experienceMonths < 3) warnings.push('블로그 운영 3개월 미만 → 첫 노출까지 시간 더 걸림');

  // 표시용 범위
  const rankRange = p10 === p50 && p50 === p90 ? `${p50}위` : `${p10}~${p90}위`;

  return {
    estimatedRankP10: p10,
    estimatedRankP50: p50,
    estimatedRankP90: p90,
    rankRange,
    confidence,
    timeToRankDays: timeToRank,
    monthlyTrafficP10: trafficP10,
    monthlyTrafficP50: trafficP50,
    monthlyTrafficP90: trafficP90,
    difficultyScore: difficulty,
    reasoning,
    warnings,
  };
}
