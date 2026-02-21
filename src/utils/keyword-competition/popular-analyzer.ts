/**
 * 인기글 분석기 (끝판왕 버전)
 * 
 * 정확한 데이터 기반 분석:
 * - 블로그 지수 점수 (50점)
 * - 제목 연관도 점수 (30점)
 * - 콘텐츠 유형 보너스 (20점)
 */

import {
  PopularItemData,
  PopularItemAnalysis,
  ScoreBreakdown,
  AuthorityLevel,
  BlogIndex
} from './types';
import { matchKeywordInTitle } from './keyword-matcher';
import { calculateAuthorityLevel } from './blogdex-crawler';

interface AnalysisInput {
  keyword: string;
  popularItems: PopularItemData[];
  visitorCounts: Map<string, number | null>;
  blogIndexes: Map<string, BlogIndex>;
}

interface AnalysisOutput {
  analysis: {
    items: PopularItemAnalysis[];
    overallScore: number;
  };
  scoreBreakdown: ScoreBreakdown;
}

/**
 * 인기글 분석
 */
export function analyzePopular(input: AnalysisInput): AnalysisOutput {
  const { keyword, popularItems, visitorCounts, blogIndexes } = input;
  
  console.log(`[POPULAR] 📊 "${keyword}" 인기글 분석...`);
  
  const analyzedItems: PopularItemAnalysis[] = [];
  
  popularItems.forEach((item, index) => {
    const titleMatch = matchKeywordInTitle(keyword, item.title);
    const visitorCount = visitorCounts.get(item.blogId) || null;
    const blogIndex = blogIndexes.get(item.blogId);
    
    analyzedItems.push({
      rank: item.rank || index + 1,
      type: item.type,
      authorName: item.authorName,
      blogdexRank: blogIndex?.indexRank || null,
      blogdexPercentile: blogIndex?.indexPercentile || null,
      authorityLevel: blogIndex
        ? calculateAuthorityLevel(blogIndex.indexRank, blogIndex.indexPercentile)
        : estimateAuthorityFromVisitors(visitorCount),
      title: item.title,
      titleKeywordMatch: titleMatch.type,
      publishedDaysAgo: item.publishedDaysAgo || 0,
      visitorCount,
      blogUrl: item.blogUrl,
      blogId: item.blogId
    });
  });
  
  // 점수 계산 (상위 5개 기준)
  const top5 = analyzedItems.slice(0, 5);
  
  // 1. 블로그 지수 점수 (50점 만점)
  const indexScore = calculateIndexScore(top5);
  
  // 2. 제목 연관도 점수 (30점 만점)
  const relevanceScore = calculateTitleRelevanceScore(top5);
  
  // 3. 콘텐츠 유형 보너스 (20점 만점)
  const bonusScore = calculateContentBonus(top5);
  
  const overallScore = indexScore.score + relevanceScore.score + bonusScore.score;
  
  console.log(`[POPULAR] ✅ 분석 완료 - 점수: ${overallScore}/100`);
  
  return {
    analysis: {
      items: analyzedItems,
      overallScore
    },
    scoreBreakdown: {
      freshness: indexScore,  // 인기글에서는 지수가 freshness 위치
      relevance: relevanceScore,
      authority: bonusScore   // bonus가 authority 위치
    }
  };
}

/**
 * 블로그 지수 점수 (50점 만점)
 */
function calculateIndexScore(items: PopularItemAnalysis[]): { score: number; max: number; details: string } {
  if (items.length === 0) {
    return { score: 25, max: 50, details: '데이터 없음' };
  }
  
  const optimalCount = items.filter(i => i.authorityLevel === 'optimal').length;
  const semiOptimalCount = items.filter(i => i.authorityLevel === 'semi-optimal').length;
  const normalCount = items.filter(i => i.authorityLevel === 'normal').length;
  const lowCount = items.filter(i => i.authorityLevel === 'low').length;
  
  let score = 0;
  let details = '';
  
  if (lowCount >= 3 || (normalCount + lowCount >= 4)) {
    score = 50;
    details = '저품질/일반 블로그 다수 (매우 좋음)';
  } else if (semiOptimalCount >= 2 || (normalCount >= 2 && optimalCount <= 1)) {
    score = 45;
    details = '준최적 블로그 다수, 진입 가능';
  } else if (optimalCount <= 3) {
    score = 35;
    details = `최적 블로그 ${optimalCount}개`;
  } else if (optimalCount <= 4) {
    score = 20;
    details = `최적 블로그 ${optimalCount}개 (경쟁 치열)`;
  } else {
    score = 0;
    details = '최적 블로그 독점 (매우 어려움)';
  }
  
  // 블로그 영향력지수 순위 상세 정보 추가
  const topItem = items[0];
  if (topItem?.blogdexRank) {
    details += ` | 1위: ${topItem.blogdexRank.toLocaleString()}위`;
    if (topItem.blogdexPercentile) {
      details += ` (상위 ${topItem.blogdexPercentile.toFixed(2)}%)`;
    }
  }
  
  return { score, max: 50, details };
}

/**
 * 제목 연관도 점수 (30점 만점)
 */
function calculateTitleRelevanceScore(items: PopularItemAnalysis[]): { score: number; max: number; details: string } {
  if (items.length === 0) {
    return { score: 15, max: 30, details: '데이터 없음' };
  }
  
  const exactCount = items.filter(i => i.titleKeywordMatch === 'exact').length;
  const partialCount = items.filter(i => i.titleKeywordMatch === 'partial').length;
  const noneCount = items.filter(i => i.titleKeywordMatch === 'none').length;
  
  let score = 0;
  let details = '';
  
  if (noneCount >= 1) {
    score = 30;
    details = '키워드 미포함 글 있음 (매우 좋음)';
  } else if (partialCount >= 3) {
    score = 25;
    details = `${partialCount}개가 키워드 '포함' (좋음)`;
  } else if (partialCount >= 2) {
    score = 15;
    details = `${partialCount}개가 키워드 '포함'`;
  } else if (exactCount === 5) {
    score = 0;
    details = '모두 키워드 정확히 일치 (경쟁 치열)';
  } else {
    score = 10;
    details = '대부분 키워드 일치';
  }
  
  return { score, max: 30, details };
}

/**
 * 콘텐츠 유형 보너스 (20점 만점)
 */
function calculateContentBonus(items: PopularItemAnalysis[]): { score: number; max: number; details: string } {
  if (items.length === 0) {
    return { score: 10, max: 20, details: '데이터 없음' };
  }
  
  let score = 0;
  const bonusDetails: string[] = [];
  
  // 카페글 있으면 +10점
  const cafeCount = items.filter(i => i.type === 'cafe').length;
  if (cafeCount > 0) {
    score += 10;
    bonusDetails.push(`카페글 ${cafeCount}개`);
  }
  
  // 1년 이상 오래된 글 있으면 +10점
  const oldCount = items.filter(i => i.publishedDaysAgo >= 365).length;
  if (oldCount > 0) {
    score += 10;
    bonusDetails.push(`1년+ 오래된 글 ${oldCount}개`);
  }
  
  // 100일 이상 오래된 글 있으면 +5점 (중복 아닐 때만)
  const old100Count = items.filter(i => i.publishedDaysAgo >= 100 && i.publishedDaysAgo < 365).length;
  if (old100Count > 0 && score < 20) {
    score = Math.min(score + 5, 20);
    bonusDetails.push(`100일+ 오래된 글 ${old100Count}개`);
  }
  
  const details = bonusDetails.length > 0 
    ? bonusDetails.join(', ') 
    : '특별한 보너스 없음';
  
  return { score, max: 20, details };
}

/**
 * 방문자 수로 영향력 추정
 */
function estimateAuthorityFromVisitors(visitors: number | null): AuthorityLevel {
  if (visitors === null) return 'normal';
  if (visitors >= 3000) return 'optimal';
  if (visitors >= 500) return 'semi-optimal';
  if (visitors >= 100) return 'normal';
  return 'low';
}
