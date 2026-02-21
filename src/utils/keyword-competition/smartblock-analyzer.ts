/**
 * 스마트블록 분석기 (끝판왕 버전)
 * 
 * 정확한 데이터 기반 분석:
 * - 최신성 점수 (40점)
 * - 연관도 점수 (35점)
 * - 전문성 점수 (25점)
 */

import { 
  SmartBlockData, 
  SmartBlockAnalysis, 
  SmartBlockItem, 
  ScoreBreakdown,
  AuthorityLevel,
  BlogIndex
} from './types';
import { matchKeywordInTitle } from './keyword-matcher';
import { calculateAuthorityLevel } from './blogdex-crawler';

interface AnalysisInput {
  keyword: string;
  smartBlocks: SmartBlockData[];
  visitorCounts: Map<string, number | null>;
  blogIndexes: Map<string, BlogIndex>;
}

interface AnalysisOutput {
  analysis: {
    blocks: SmartBlockAnalysis[];
    overallScore: number;
  };
  scoreBreakdown: ScoreBreakdown;
}

/**
 * 스마트블록 분석
 */
export function analyzeSmartBlock(input: AnalysisInput): AnalysisOutput {
  const { keyword, smartBlocks, visitorCounts, blogIndexes } = input;
  
  console.log(`[SMARTBLOCK] 📊 "${keyword}" 스마트블록 분석...`);
  
  const analyzedBlocks: SmartBlockAnalysis[] = [];
  
  for (const block of smartBlocks) {
    const analyzedItems: SmartBlockItem[] = [];
    
    block.items.forEach((item, index) => {
      const titleMatch = matchKeywordInTitle(keyword, item.title);
      const visitorCount = visitorCounts.get(item.blogId) || null;
      const blogIndex = blogIndexes.get(item.blogId);
      
      analyzedItems.push({
        rank: index + 1,
        title: item.title,
        titleKeywordMatch: titleMatch.type,
        matchScore: titleMatch.score,
        publishedDaysAgo: item.publishedDaysAgo || 0,
        visitorCount,
        blogUrl: item.blogUrl,
        blogId: item.blogId,
        authorName: item.authorName || '',
        blogdexRank: blogIndex?.indexRank || null,
        blogdexPercentile: blogIndex?.indexPercentile || null,
        authorityLevel: blogIndex 
          ? calculateAuthorityLevel(blogIndex.indexRank, blogIndex.indexPercentile)
          : estimateAuthorityFromVisitors(visitorCount)
      });
    });
    
    analyzedBlocks.push({
      blockKeyword: block.blockKeyword,
      items: analyzedItems,
      blockScore: 0  // 나중에 계산
    });
  }
  
  // 점수 계산 (상위 3개 기준)
  const top3 = analyzedBlocks[0]?.items.slice(0, 3) || [];
  
  // 1. 최신성 점수 (40점 만점)
  const freshnessScore = calculateFreshnessScore(top3);
  
  // 2. 연관도 점수 (35점 만점)
  const relevanceScore = calculateRelevanceScore(top3);
  
  // 3. 전문성 점수 (25점 만점)
  const authorityScore = calculateAuthorityScore(top3);
  
  const overallScore = freshnessScore.score + relevanceScore.score + authorityScore.score;
  
  // 블록별 점수 업데이트
  if (analyzedBlocks.length > 0) {
    analyzedBlocks[0].blockScore = overallScore;
  }
  
  console.log(`[SMARTBLOCK] ✅ 분석 완료 - 점수: ${overallScore}/100`);
  
  return {
    analysis: {
      blocks: analyzedBlocks,
      overallScore
    },
    scoreBreakdown: {
      freshness: freshnessScore,
      relevance: relevanceScore,
      authority: authorityScore
    }
  };
}

/**
 * 최신성 점수 계산 (40점 만점)
 */
function calculateFreshnessScore(items: SmartBlockItem[]): { score: number; max: number; details: string } {
  if (items.length === 0) {
    return { score: 20, max: 40, details: '데이터 없음' };
  }
  
  const days = items.map(i => i.publishedDaysAgo);
  const count300Plus = days.filter(d => d >= 300).length;
  const count100Plus = days.filter(d => d >= 100).length;
  const countRecent = days.filter(d => d <= 30).length;
  
  let score = 0;
  let details = '';
  
  if (count300Plus >= 2) {
    score = 40;
    details = `상위 3개 중 ${count300Plus}개가 300일 이상 오래됨 (아주 좋음)`;
  } else if (count300Plus >= 1) {
    score = 30;
    details = `상위 3개 중 1개가 300일 이상 오래됨 (좋음)`;
  } else if (count100Plus >= 2) {
    score = 25;
    details = `상위 3개 중 ${count100Plus}개가 100일 이상 오래됨`;
  } else if (count100Plus >= 1) {
    score = 15;
    details = `상위 3개 중 1개가 100일 이상 오래됨`;
  } else if (countRecent === 3) {
    score = 0;
    details = '상위 3개 모두 30일 이내 최신글 (경쟁 치열)';
  } else {
    score = 5;
    details = '대부분 최근 글 (경쟁 치열)';
  }
  
  return { score, max: 40, details };
}

/**
 * 연관도 점수 계산 (35점 만점)
 */
function calculateRelevanceScore(items: SmartBlockItem[]): { score: number; max: number; details: string } {
  if (items.length === 0) {
    return { score: 17, max: 35, details: '데이터 없음' };
  }
  
  const exactCount = items.filter(i => i.titleKeywordMatch === 'exact').length;
  const partialCount = items.filter(i => i.titleKeywordMatch === 'partial').length;
  
  let score = 0;
  let details = '';
  
  if (partialCount === 3 || (partialCount >= 2 && exactCount === 0)) {
    score = 35;
    details = `상위 3개 모두 '포함' (매우 좋음)`;
  } else if (partialCount >= 2) {
    score = 25;
    details = `상위 3개 중 ${partialCount}개 '포함'`;
  } else if (partialCount >= 1) {
    score = 15;
    details = `상위 3개 중 ${partialCount}개 '포함'`;
  } else if (exactCount === 3) {
    score = 0;
    details = '상위 3개 모두 키워드 정확히 일치 (경쟁 치열)';
  } else {
    score = 5;
    details = '대부분 키워드 일치';
  }
  
  return { score, max: 35, details };
}

/**
 * 전문성 점수 계산 (25점 만점)
 */
function calculateAuthorityScore(items: SmartBlockItem[]): { score: number; max: number; details: string } {
  if (items.length === 0) {
    return { score: 12, max: 25, details: '데이터 없음' };
  }
  
  // 방문자 수 평균 계산
  const visitors = items.map(i => i.visitorCount).filter(v => v !== null) as number[];
  const avgVisitors = visitors.length > 0 
    ? visitors.reduce((a, b) => a + b, 0) / visitors.length 
    : null;
  
  // 블로그 영향력지수 순위 기반 평가
  const optimalCount = items.filter(i => i.authorityLevel === 'optimal').length;
  const semiOptimalCount = items.filter(i => i.authorityLevel === 'semi-optimal').length;
  
  let score = 0;
  let details = '';
  
  if (avgVisitors !== null) {
    if (avgVisitors < 100) {
      score = 25;
      details = `평균 방문자 ${Math.round(avgVisitors)}명 (아주 좋음)`;
    } else if (avgVisitors < 500) {
      score = 20;
      details = `평균 방문자 ${Math.round(avgVisitors)}명 (좋음)`;
    } else if (avgVisitors < 1000) {
      score = 15;
      details = `평균 방문자 ${Math.round(avgVisitors)}명`;
    } else if (avgVisitors < 3000) {
      score = 10;
      details = `평균 방문자 ${Math.round(avgVisitors)}명 (경쟁 있음)`;
    } else {
      score = 0;
      details = `평균 방문자 ${Math.round(avgVisitors)}명 이상 (강한 경쟁)`;
    }
  } else if (optimalCount >= 2) {
    score = 0;
    details = '최적 블로그 다수 점령 (강한 경쟁)';
  } else if (optimalCount >= 1) {
    score = 10;
    details = '최적 블로그 1개 있음';
  } else if (semiOptimalCount >= 2) {
    score = 15;
    details = '준최적 블로그 다수';
  } else {
    score = 20;
    details = '일반 블로그 위주 (좋음)';
  }
  
  return { score, max: 25, details };
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
