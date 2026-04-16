import { calculateProfitGoldenRatio, type ProfitKeywordData } from './profit-golden-keyword-engine';
import {
  analyzeKeywordCompetition,
  type BlogIndexLevel,
  type TopBlogAnalysisResult,
} from './top-blog-analyzer';

export interface UltimateGoldenKeyword {
  keyword: string;
  category: string;
  searchVolume: number;
  documentCount: number;
  profit: {
    estimatedCPC: number;
    purchaseIntentScore: number;
    profitGoldenRatio: number;
    estimatedDailyRevenue: number;
    estimatedMonthlyRevenue: number;
    grade: 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' | 'D';
    gradeReason: string;
  };
  competition: {
    analyzed: boolean;
    difficulty: 'very_easy' | 'easy' | 'medium' | 'hard' | 'very_hard';
    difficultyScore: number;
    avgPostAgeDays: number;
    oldPostRatio: number;
    weakCompetitorCount: number;
    canRankTop10: boolean;
    canRankTop5: boolean;
    requiredBlogIndex: string;
    estimatedRankingDays: number;
    bestOpportunity: string;
  };
  blueOcean: {
    isRealBlueOcean: boolean;
    reason: string;
    score: number;
  };
  verdict: {
    totalScore: number;
    grade: 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' | 'D';
    recommendation: string;
    shouldWrite: boolean;
    priority: 'immediate' | 'high' | 'medium' | 'low' | 'skip';
  };
  strategy: {
    approach: string;
    monetization: string;
    timing: string;
    titleSuggestion: string;
    outline: string[];
    wordCount: number;
  };
}

export async function analyzeUltimateGoldenKeyword(
  keyword: string,
  searchVolume: number,
  documentCount: number,
  category: string,
  naverClientId: string,
  naverClientSecret: string,
  myBlogIndex: BlogIndexLevel = '일반',
  skipCompetitionAnalysis: boolean = false,
  realCpc?: number | null
): Promise<UltimateGoldenKeyword> {
  const profitAnalysis = calculateProfitGoldenRatio(keyword, searchVolume, documentCount, category, { realCpc });

  let competitionAnalysis: TopBlogAnalysisResult | null = null;
  if (!skipCompetitionAnalysis) {
    competitionAnalysis = await analyzeKeywordCompetition(keyword, naverClientId, naverClientSecret, myBlogIndex);
  }

  return calculateUltimateScore(keyword, category, searchVolume, documentCount, profitAnalysis, competitionAnalysis);
}

function calculateUltimateScore(
  keyword: string,
  category: string,
  searchVolume: number,
  documentCount: number,
  profitAnalysis: ProfitKeywordData,
  competitionAnalysis: TopBlogAnalysisResult | null
): UltimateGoldenKeyword {
  const profitScore = Math.min(100, profitAnalysis.profitGoldenRatio * 2);

  let competitionScore = 50;
  if (competitionAnalysis) {
    competitionScore = 100 - competitionAnalysis.verdict.difficultyScore;
  } else {
    if (documentCount <= 500) competitionScore = 90;
    else if (documentCount <= 1000) competitionScore = 75;
    else if (documentCount <= 2000) competitionScore = 60;
    else if (documentCount <= 5000) competitionScore = 45;
    else competitionScore = 30;
  }

  const cpcScore = Math.min(100, profitAnalysis.estimatedCPC / 5);

  const totalScore = Math.round(profitScore * 0.4 + competitionScore * 0.4 + cpcScore * 0.2);

  let grade: UltimateGoldenKeyword['verdict']['grade'];
  if (totalScore >= 85) grade = 'SSS';
  else if (totalScore >= 75) grade = 'SS';
  else if (totalScore >= 65) grade = 'S';
  else if (totalScore >= 55) grade = 'A';
  else if (totalScore >= 45) grade = 'B';
  else if (totalScore >= 35) grade = 'C';
  else grade = 'D';

  let priority: UltimateGoldenKeyword['verdict']['priority'];
  let shouldWrite: boolean;
  let recommendation: string;

  if (grade === 'SSS') {
    priority = 'immediate';
    shouldWrite = true;
    recommendation = '최상급. 지금 바로 작성 권장';
  } else if (grade === 'SS') {
    priority = 'immediate';
    shouldWrite = true;
    recommendation = '우수. 빠른 작성 권장';
  } else if (grade === 'S') {
    priority = 'high';
    shouldWrite = true;
    recommendation = '추천. 이번 주 내 작성 권장';
  } else if (grade === 'A') {
    priority = 'medium';
    shouldWrite = true;
    recommendation = '양호. 작성 가치 있음';
  } else if (grade === 'B') {
    priority = 'low';
    shouldWrite = competitionScore >= 60;
    recommendation = '보통. 경쟁 상황 보고 결정';
  } else {
    priority = 'skip';
    shouldWrite = false;
    recommendation = '비추천. 더 좋은 키워드 탐색 권장';
  }

  const isRealBlueOcean = (
    profitAnalysis.isRealBlueOcean ||
    (searchVolume >= 300 && documentCount <= 1000 && competitionScore >= 70)
  );

  let blueOceanReason: string;
  if (isRealBlueOcean) {
    blueOceanReason = `진짜 블루오션. 검색량 ${searchVolume}, 문서 ${documentCount}`;
    if (competitionAnalysis?.opportunities.hasFreshnessOpportunity) blueOceanReason += ' + 오래된 글 많음';
  } else {
    blueOceanReason = `경쟁 있음. 문서 ${documentCount}`;
  }

  const strategy = generateUltimateStrategy(keyword, grade, profitAnalysis, competitionAnalysis);

  return {
    keyword,
    category,
    searchVolume,
    documentCount,
    profit: {
      estimatedCPC: profitAnalysis.estimatedCPC,
      purchaseIntentScore: profitAnalysis.purchaseIntentScore,
      profitGoldenRatio: profitAnalysis.profitGoldenRatio,
      estimatedDailyRevenue: profitAnalysis.estimatedDailyRevenue,
      estimatedMonthlyRevenue: profitAnalysis.estimatedMonthlyRevenue,
      grade: profitAnalysis.grade,
      gradeReason: profitAnalysis.gradeReason,
    },
    competition: {
      analyzed: !!competitionAnalysis,
      difficulty: competitionAnalysis?.verdict.difficulty || 'medium',
      difficultyScore: competitionAnalysis?.verdict.difficultyScore || 50,
      avgPostAgeDays: competitionAnalysis?.summary.avgPostAgeDays || 0,
      oldPostRatio: competitionAnalysis?.summary.oldPostRatio || 0,
      weakCompetitorCount: competitionAnalysis?.summary.weakCompetitorCount || 0,
      canRankTop10: competitionAnalysis?.verdict.canRankTop10 ?? true,
      canRankTop5: competitionAnalysis?.verdict.canRankTop5 ?? false,
      requiredBlogIndex: competitionAnalysis?.verdict.requiredBlogIndex || '일반',
      estimatedRankingDays: competitionAnalysis?.verdict.estimatedRankingDays || 14,
      bestOpportunity: competitionAnalysis?.opportunities.bestOpportunity || '분석 필요',
    },
    blueOcean: {
      isRealBlueOcean,
      reason: blueOceanReason,
      score: isRealBlueOcean ? 95 : Math.max(30, competitionScore),
    },
    verdict: {
      totalScore,
      grade,
      recommendation,
      shouldWrite,
      priority,
    },
    strategy,
  };
}

function generateUltimateStrategy(
  keyword: string,
  grade: string,
  profitAnalysis: ProfitKeywordData,
  competitionAnalysis: TopBlogAnalysisResult | null
): UltimateGoldenKeyword['strategy'] {
  let approach: string;
  if (grade === 'SSS' || grade === 'SS') approach = '즉시 작성. 고품질 심층 콘텐츠';
  else if (grade === 'S' || grade === 'A') approach = '경쟁 글 분석 후 차별화 콘텐츠';
  else approach = '롱테일 변형 키워드로 우회';

  let monetization: string;
  if (profitAnalysis.estimatedCPC >= 500) monetization = '애드센스 + 제휴 동시 운영';
  else if (profitAnalysis.purchaseIntentScore >= 60) monetization = '제휴(구매의도) 중심';
  else monetization = '애드센스 중심 + 내부링크';

  let timing: string;
  if (competitionAnalysis?.opportunities.hasFreshnessOpportunity) timing = '즉시. 오래된 글 기회';
  else if (grade === 'SSS' || grade === 'SS') timing = '이번 주 내 작성 권장';
  else timing = '준비 후 작성';

  const year = new Date().getFullYear();
  let titleSuggestion: string;
  if (profitAnalysis.purchaseIntentScore >= 70) titleSuggestion = `${keyword} 추천 TOP 5 (${year} 최신)`;
  else if (profitAnalysis.purchaseIntentScore >= 50) titleSuggestion = `${keyword} 솔직 후기 | 장단점 총정리 (${year})`;
  else titleSuggestion = `${keyword} 완벽 가이드 | 초보자도 쉽게 (${year})`;

  const outline = [
    `1. ${keyword}란?`,
    `2. ${keyword} 종류/유형 비교`,
    `3. ${keyword} 추천 TOP 3~5`,
    `4. ${keyword} 선택 가이드`,
    `5. ${keyword} 주의사항/팁`,
    `6. 마무리`,
  ];

  let wordCount: number;
  if (grade === 'SSS' || grade === 'SS') wordCount = 3000;
  else if (grade === 'S' || grade === 'A') wordCount = 2500;
  else wordCount = 2000;

  return {
    approach,
    monetization,
    timing,
    titleSuggestion,
    outline,
    wordCount,
  };
}

export interface BatchAnalysisOptions {
  keywords: Array<{ keyword: string; searchVolume: number; documentCount: number }>;
  category: string;
  naverClientId: string;
  naverClientSecret: string;
  myBlogIndex?: BlogIndexLevel;
  analyzeCompetition?: boolean;
  topCount?: number;
}

export interface BatchAnalysisResult {
  all: UltimateGoldenKeyword[];
  top: UltimateGoldenKeyword[];
  summary: {
    totalAnalyzed: number;
    sssCount: number;
    ssCount: number;
    sCount: number;
    blueOceanCount: number;
    avgMonthlyRevenue: number;
    totalPotentialRevenue: number;
  };
  tips: string[];
}

export async function batchAnalyzeGoldenKeywords(options: BatchAnalysisOptions): Promise<BatchAnalysisResult> {
  const {
    keywords,
    category,
    naverClientId,
    naverClientSecret,
    myBlogIndex = '일반',
    analyzeCompetition = true,
    topCount = 10,
  } = options;

  const results: UltimateGoldenKeyword[] = [];

  for (let i = 0; i < keywords.length; i++) {
    const { keyword, searchVolume, documentCount } = keywords[i];

    try {
      const result = await analyzeUltimateGoldenKeyword(
        keyword,
        searchVolume,
        documentCount,
        category,
        naverClientId,
        naverClientSecret,
        myBlogIndex,
        !analyzeCompetition
      );

      results.push(result);

      if (analyzeCompetition && i < keywords.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch {
      // ignore failures in batch
    }
  }

  results.sort((a, b) => b.verdict.totalScore - a.verdict.totalScore);

  const top = results.slice(0, topCount);

  const sssCount = results.filter((r) => r.verdict.grade === 'SSS').length;
  const ssCount = results.filter((r) => r.verdict.grade === 'SS').length;
  const sCount = results.filter((r) => r.verdict.grade === 'S').length;
  const blueOceanCount = results.filter((r) => r.blueOcean.isRealBlueOcean).length;

  const avgMonthlyRevenue = top.length > 0
    ? Math.round(top.reduce((sum, r) => sum + r.profit.estimatedMonthlyRevenue, 0) / top.length)
    : 0;

  const totalPotentialRevenue = top.reduce((sum, r) => sum + r.profit.estimatedMonthlyRevenue, 0);

  const tips: string[] = [];
  if (sssCount >= 3) tips.push(`SSS급 ${sssCount}개 발견. 최우선 작성 권장`);
  if (blueOceanCount >= 5) tips.push(`블루오션 ${blueOceanCount}개. 빠른 선점 권장`);
  if (avgMonthlyRevenue >= 30000) tips.push(`평균 월 ${Math.round(avgMonthlyRevenue / 10000)}만원 예상`);
  tips.push(`TOP ${topCount}개 모두 작성 시 월 ${Math.round(totalPotentialRevenue / 10000)}만원 예상`);

  return {
    all: results,
    top,
    summary: {
      totalAnalyzed: results.length,
      sssCount,
      ssCount,
      sCount,
      blueOceanCount,
      avgMonthlyRevenue,
      totalPotentialRevenue,
    },
    tips,
  };
}
