export interface TopBlogPost {
  rank: number;
  title: string;
  blogName: string;
  blogUrl: string;
  postUrl: string;
  postDate: Date | null;
  postAgeDays: number;
  estimatedBlogIndex: BlogIndexLevel;
  blogIndexScore: number;
  blogIndexReason: string;
  quality: {
    estimatedWordCount: number;
    hasImages: boolean;
    hasVideo: boolean;
    qualityScore: number;
    qualityLevel: 'high' | 'medium' | 'low';
  };
  beatable: {
    canBeat: boolean;
    difficulty: 'easy' | 'medium' | 'hard' | 'very_hard';
    reason: string;
    requiredBlogIndex: string;
    estimatedDays: number;
  };
}

export interface TopBlogAnalysisResult {
  keyword: string;
  analyzedAt: Date;
  topBlogs: TopBlogPost[];
  summary: {
    avgPostAgeDays: number;
    oldPostRatio: number;
    weakCompetitorCount: number;
    strongCompetitorCount: number;
    avgBlogIndexScore: number;
    avgQualityScore: number;
  };
  verdict: {
    canRankTop10: boolean;
    canRankTop5: boolean;
    canRankTop3: boolean;
    difficulty: 'very_easy' | 'easy' | 'medium' | 'hard' | 'very_hard';
    difficultyScore: number;
    requiredBlogIndex: BlogIndexLevel;
    estimatedRankingDays: number;
    recommendation: string;
    strategy: string;
  };
  opportunities: {
    hasFreshnessOpportunity: boolean;
    hasQualityOpportunity: boolean;
    hasWeakCompetitorOpportunity: boolean;
    bestOpportunity: string;
  };
}

export type BlogIndexLevel =
  | '최적1' | '최적2' | '최적3' | '최적4' | '최적5'
  | '준최적1' | '준최적2' | '준최적3' | '준최적4' | '준최적5'
  | '일반';

export function estimateBlogIndex(
  blogUrl: string,
  blogName: string,
  searchRank: number,
  postQuality: number
): { level: BlogIndexLevel; score: number; reason: string } {
  let score = 50;
  const reasons: string[] = [];

  const url = String(blogUrl || '').toLowerCase();
  if (url.includes('official') || url.includes('brand') || /[a-z]+korea/.test(url)) {
    score += 20;
    reasons.push('공식/브랜드 블로그');
  }

  const lastPart = url.split('/').filter(Boolean).pop() || '';
  if (/^[a-z]{2,5}[0-9]{2,4}$/.test(lastPart)) {
    score += 10;
    reasons.push('인플루언서 추정');
  }

  const name = String(blogName || '').toLowerCase();
  if (/전문|공식|리뷰어|인플루언서|파워블로거/.test(name)) {
    score += 15;
    reasons.push('전문 블로거');
  }

  if (/일상|소소한|나의|내/.test(name) && name.length < 10) {
    score -= 10;
    reasons.push('일상 블로그');
  }

  if (searchRank <= 3) {
    score += 15;
    reasons.push(`검색 ${searchRank}위`);
  } else if (searchRank <= 5) {
    score += 10;
  } else if (searchRank <= 7) {
    score += 5;
  }

  if (postQuality >= 80) {
    score += 10;
    reasons.push('고품질 콘텐츠');
  } else if (postQuality <= 40) {
    score -= 10;
    reasons.push('저품질 콘텐츠');
  }

  score = Math.max(0, Math.min(100, score));

  let level: BlogIndexLevel;
  if (score >= 90) level = '최적1';
  else if (score >= 85) level = '최적2';
  else if (score >= 80) level = '최적3';
  else if (score >= 75) level = '최적4';
  else if (score >= 70) level = '최적5';
  else if (score >= 65) level = '준최적1';
  else if (score >= 60) level = '준최적2';
  else if (score >= 55) level = '준최적3';
  else if (score >= 50) level = '준최적4';
  else if (score >= 45) level = '준최적5';
  else level = '일반';

  return {
    level,
    score,
    reason: reasons.length > 0 ? reasons.join(', ') : '일반 블로그'
  };
}

export function parseNaverDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  const now = new Date();
  const str = dateStr.trim();

  const minutesMatch = str.match(/(\d+)\s*분\s*전/);
  if (minutesMatch) {
    const minutes = parseInt(minutesMatch[1], 10);
    return new Date(now.getTime() - minutes * 60 * 1000);
  }

  const hoursMatch = str.match(/(\d+)\s*시간\s*전/);
  if (hoursMatch) {
    const hours = parseInt(hoursMatch[1], 10);
    return new Date(now.getTime() - hours * 60 * 60 * 1000);
  }

  const daysMatch = str.match(/(\d+)\s*일\s*전/);
  if (daysMatch) {
    const days = parseInt(daysMatch[1], 10);
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }

  const weeksMatch = str.match(/(\d+)\s*주\s*전/);
  if (weeksMatch) {
    const weeks = parseInt(weeksMatch[1], 10);
    return new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);
  }

  const monthsMatch = str.match(/(\d+)\s*개월\s*전/);
  if (monthsMatch) {
    const months = parseInt(monthsMatch[1], 10);
    const date = new Date(now);
    date.setMonth(date.getMonth() - months);
    return date;
  }

  if (str.includes('어제')) {
    return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }

  const dateMatch = str.match(/(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})/);
  if (dateMatch) {
    const year = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10) - 1;
    const day = parseInt(dateMatch[3], 10);
    return new Date(year, month, day);
  }

  const shortDateMatch = str.match(/^(\d{1,2})\s*\.\s*(\d{1,2})\s*\.?$/);
  if (shortDateMatch) {
    const month = parseInt(shortDateMatch[1], 10) - 1;
    const day = parseInt(shortDateMatch[2], 10);
    return new Date(now.getFullYear(), month, day);
  }

  return null;
}

export function calculateDaysAgo(date: Date | null): number {
  if (!date) return 365;

  const now = new Date();
  const diffTime = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  return Math.max(0, diffDays);
}

export function analyzePostQuality(
  snippet: string,
  title: string,
  hasImage: boolean = true,
  hasVideo: boolean = false
): {
  estimatedWordCount: number;
  qualityScore: number;
  qualityLevel: 'high' | 'medium' | 'low';
} {
  let score = 50;

  const snippetLength = snippet?.length || 0;
  const estimatedWordCount = Math.round(snippetLength * 15);

  if (estimatedWordCount >= 2000) score += 20;
  else if (estimatedWordCount >= 1500) score += 15;
  else if (estimatedWordCount >= 1000) score += 10;
  else if (estimatedWordCount >= 500) score += 5;
  else score -= 10;

  const titleLength = title?.length || 0;
  if (titleLength >= 20 && titleLength <= 40) score += 10;
  else if (titleLength < 10) score -= 10;

  if (/추천|비교|후기|방법|가격|순위|TOP/i.test(title)) {
    score += 5;
  }

  if (hasVideo) score += 15;
  if (hasImage) score += 5;

  if (/\d+\.|①|②|③|첫째|둘째|1\)|2\)/.test(snippet || '')) {
    score += 10;
  }

  score = Math.max(0, Math.min(100, score));

  let qualityLevel: 'high' | 'medium' | 'low';
  if (score >= 70) qualityLevel = 'high';
  else if (score >= 45) qualityLevel = 'medium';
  else qualityLevel = 'low';

  return {
    estimatedWordCount,
    qualityScore: score,
    qualityLevel
  };
}

export function analyzeBeatable(
  blogIndexScore: number,
  postAgeDays: number,
  qualityScore: number,
  myBlogIndex: BlogIndexLevel = '일반'
): {
  canBeat: boolean;
  difficulty: 'easy' | 'medium' | 'hard' | 'very_hard';
  reason: string;
  requiredBlogIndex: string;
  estimatedDays: number;
} {
  const myIndexScore = blogIndexToScore(myBlogIndex);

  let difficultyScore = 0;
  const reasons: string[] = [];

  const indexGap = blogIndexScore - myIndexScore;
  if (indexGap > 30) {
    difficultyScore += 40;
    reasons.push('상대 블로그 지수 높음');
  } else if (indexGap > 15) {
    difficultyScore += 25;
    reasons.push('상대 블로그 지수 우위');
  } else if (indexGap > 0) {
    difficultyScore += 10;
  } else {
    difficultyScore -= 10;
    reasons.push('블로그 지수 유리');
  }

  if (postAgeDays >= 365) {
    difficultyScore -= 30;
    reasons.push('1년+ 오래된 글');
  } else if (postAgeDays >= 180) {
    difficultyScore -= 20;
    reasons.push('6개월+ 오래된 글');
  } else if (postAgeDays >= 90) {
    difficultyScore -= 10;
    reasons.push('3개월+ 오래된 글');
  } else if (postAgeDays <= 7) {
    difficultyScore += 20;
    reasons.push('최근 1주일 내 글');
  } else if (postAgeDays <= 30) {
    difficultyScore += 10;
    reasons.push('최근 1개월 내 글');
  }

  if (qualityScore >= 80) {
    difficultyScore += 20;
    reasons.push('고품질 경쟁 글');
  } else if (qualityScore <= 40) {
    difficultyScore -= 15;
    reasons.push('저품질 경쟁 글');
  }

  difficultyScore = Math.max(0, Math.min(100, difficultyScore + 50));

  let difficulty: 'easy' | 'medium' | 'hard' | 'very_hard';
  let canBeat: boolean;
  let estimatedDays: number;
  let requiredBlogIndex: string;

  if (difficultyScore <= 30) {
    difficulty = 'easy';
    canBeat = true;
    estimatedDays = 7;
    requiredBlogIndex = '일반';
  } else if (difficultyScore <= 50) {
    difficulty = 'medium';
    canBeat = true;
    estimatedDays = 14;
    requiredBlogIndex = '준최적5';
  } else if (difficultyScore <= 70) {
    difficulty = 'hard';
    canBeat = myIndexScore >= 50;
    estimatedDays = 30;
    requiredBlogIndex = '준최적3';
  } else {
    difficulty = 'very_hard';
    canBeat = myIndexScore >= 70;
    estimatedDays = 60;
    requiredBlogIndex = '최적5';
  }

  return {
    canBeat,
    difficulty,
    reason: reasons.join(', ') || '일반 경쟁',
    requiredBlogIndex,
    estimatedDays
  };
}

function blogIndexToScore(level: BlogIndexLevel): number {
  const scores: Record<BlogIndexLevel, number> = {
    '최적1': 95,
    '최적2': 90,
    '최적3': 85,
    '최적4': 80,
    '최적5': 75,
    '준최적1': 70,
    '준최적2': 65,
    '준최적3': 60,
    '준최적4': 55,
    '준최적5': 50,
    '일반': 40,
  };

  return scores[level] ?? 40;
}

export function analyzeTopBlogs(
  keyword: string,
  searchResults: Array<{
    title: string;
    link: string;
    bloggerName: string;
    bloggerLink: string;
    postDate: string;
    description: string;
  }>,
  myBlogIndex: BlogIndexLevel = '일반'
): TopBlogAnalysisResult {
  const topBlogs: TopBlogPost[] = [];

  searchResults.slice(0, 10).forEach((result, index) => {
    const rank = index + 1;
    const postDate = parseNaverDate(result.postDate);
    const postAgeDays = calculateDaysAgo(postDate);

    const quality = analyzePostQuality(result.description, result.title, true, false);

    const blogIndex = estimateBlogIndex(result.bloggerLink, result.bloggerName, rank, quality.qualityScore);

    const beatable = analyzeBeatable(blogIndex.score, postAgeDays, quality.qualityScore, myBlogIndex);

    topBlogs.push({
      rank,
      title: result.title,
      blogName: result.bloggerName,
      blogUrl: result.bloggerLink,
      postUrl: result.link,
      postDate,
      postAgeDays,
      estimatedBlogIndex: blogIndex.level,
      blogIndexScore: blogIndex.score,
      blogIndexReason: blogIndex.reason,
      quality: {
        ...quality,
        hasImages: true,
        hasVideo: false,
      },
      beatable,
    });
  });

  const avgPostAgeDays = topBlogs.length > 0
    ? Math.round(topBlogs.reduce((sum, b) => sum + b.postAgeDays, 0) / topBlogs.length)
    : 0;

  const oldPostRatio = topBlogs.length > 0
    ? Math.round((topBlogs.filter(b => b.postAgeDays >= 90).length / topBlogs.length) * 100)
    : 0;

  const weakCompetitorCount = topBlogs.filter(b => b.beatable.difficulty === 'easy' || b.beatable.difficulty === 'medium').length;

  const strongCompetitorCount = topBlogs.filter(b => b.beatable.difficulty === 'hard' || b.beatable.difficulty === 'very_hard').length;

  const avgBlogIndexScore = topBlogs.length > 0
    ? Math.round(topBlogs.reduce((sum, b) => sum + b.blogIndexScore, 0) / topBlogs.length)
    : 50;

  const avgQualityScore = topBlogs.length > 0
    ? Math.round(topBlogs.reduce((sum, b) => sum + b.quality.qualityScore, 0) / topBlogs.length)
    : 50;

  const summary = {
    avgPostAgeDays,
    oldPostRatio,
    weakCompetitorCount,
    strongCompetitorCount,
    avgBlogIndexScore,
    avgQualityScore,
  };

  const verdict = generateVerdict(topBlogs, summary, myBlogIndex);
  const opportunities = analyzeOpportunities(summary);

  return {
    keyword,
    analyzedAt: new Date(),
    topBlogs,
    summary,
    verdict,
    opportunities,
  };
}

function generateVerdict(
  topBlogs: TopBlogPost[],
  summary: TopBlogAnalysisResult['summary'],
  myBlogIndex: BlogIndexLevel
): TopBlogAnalysisResult['verdict'] {
  let difficultyScore = 50;

  const weakRatio = summary.weakCompetitorCount / Math.max(topBlogs.length, 1);
  difficultyScore -= weakRatio * 30;

  difficultyScore -= summary.oldPostRatio * 0.3;

  difficultyScore += (summary.avgBlogIndexScore - 50) * 0.5;
  difficultyScore += (summary.avgQualityScore - 50) * 0.3;

  difficultyScore = Math.max(0, Math.min(100, difficultyScore));

  let difficulty: TopBlogAnalysisResult['verdict']['difficulty'];
  if (difficultyScore <= 20) difficulty = 'very_easy';
  else if (difficultyScore <= 40) difficulty = 'easy';
  else if (difficultyScore <= 60) difficulty = 'medium';
  else if (difficultyScore <= 80) difficulty = 'hard';
  else difficulty = 'very_hard';

  const myScore = blogIndexToScore(myBlogIndex);
  const canRankTop10 = difficultyScore <= 70 || myScore >= 60;
  const canRankTop5 = difficultyScore <= 50 || myScore >= 70;
  const canRankTop3 = difficultyScore <= 30 || myScore >= 80;

  let requiredBlogIndex: BlogIndexLevel;
  if (difficultyScore <= 30) requiredBlogIndex = '일반';
  else if (difficultyScore <= 45) requiredBlogIndex = '준최적5';
  else if (difficultyScore <= 60) requiredBlogIndex = '준최적3';
  else if (difficultyScore <= 75) requiredBlogIndex = '준최적1';
  else requiredBlogIndex = '최적5';

  let estimatedRankingDays: number;
  if (difficultyScore <= 20) estimatedRankingDays = 3;
  else if (difficultyScore <= 40) estimatedRankingDays = 7;
  else if (difficultyScore <= 60) estimatedRankingDays = 14;
  else if (difficultyScore <= 80) estimatedRankingDays = 30;
  else estimatedRankingDays = 60;

  let recommendation: string;
  let strategy: string;

  if (difficulty === 'very_easy') {
    recommendation = '최상의 기회. 신규 블로거도 1주 내 상위노출 가능';
    strategy = '2000자+ 품질 글 작성 후 즉시 발행';
  } else if (difficulty === 'easy') {
    recommendation = '좋은 기회. 2주 내 상위노출 기대';
    strategy = '상위 글 분석 후 최신 정보 보강해 발행';
  } else if (difficulty === 'medium') {
    recommendation = '도전 가치 있음. 품질로 승부';
    strategy = '상위 글 3개 분석 후 차별화 포인트 중심 심층 콘텐츠';
  } else if (difficulty === 'hard') {
    recommendation = '경쟁 치열. 블로그 지수 필요';
    strategy = '연관 롱테일로 지수 상승 후 재도전';
  } else {
    recommendation = '비추천. 다른 키워드 탐색 권장';
    strategy = '롱테일 변형 키워드 공략';
  }

  return {
    canRankTop10,
    canRankTop5,
    canRankTop3,
    difficulty,
    difficultyScore: Math.round(difficultyScore),
    requiredBlogIndex,
    estimatedRankingDays,
    recommendation,
    strategy,
  };
}

function analyzeOpportunities(summary: TopBlogAnalysisResult['summary']): TopBlogAnalysisResult['opportunities'] {
  const hasFreshnessOpportunity = summary.oldPostRatio >= 50;
  const hasQualityOpportunity = summary.avgQualityScore <= 50;
  const hasWeakCompetitorOpportunity = summary.weakCompetitorCount >= 5;

  let bestOpportunity: string;
  if (hasFreshnessOpportunity && hasQualityOpportunity) bestOpportunity = '최신 고품질 콘텐츠로 압도 가능';
  else if (hasFreshnessOpportunity) bestOpportunity = '오래된 글 많음. 최신 정보로 승부';
  else if (hasQualityOpportunity) bestOpportunity = '저품질 글 많음. 품질로 승부';
  else if (hasWeakCompetitorOpportunity) bestOpportunity = '약한 경쟁자 많음. 기본기로 승부';
  else bestOpportunity = '차별화 포인트 발굴 필요';

  return {
    hasFreshnessOpportunity,
    hasQualityOpportunity,
    hasWeakCompetitorOpportunity,
    bestOpportunity,
  };
}

export async function fetchNaverBlogSearchResults(
  keyword: string,
  clientId: string,
  clientSecret: string,
  display: number = 10
): Promise<Array<{
  title: string;
  link: string;
  bloggerName: string;
  bloggerLink: string;
  postDate: string;
  description: string;
}>> {
  try {
    const axios = (await import('axios')).default;

    const response = await axios.get('https://openapi.naver.com/v1/search/blog.json', {
      params: {
        query: keyword,
        display,
        sort: 'sim',
      },
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
      timeout: 10000,
    });

    if (!response.data?.items) return [];

    return response.data.items.map((item: any) => ({
      title: item.title?.replace(/<[^>]*>/g, '') || '',
      link: item.link || '',
      bloggerName: item.bloggername || '',
      bloggerLink: item.bloggerlink || '',
      postDate: item.postdate || '',
      description: item.description?.replace(/<[^>]*>/g, '') || '',
    }));
  } catch {
    return [];
  }
}

export async function analyzeKeywordCompetition(
  keyword: string,
  clientId: string,
  clientSecret: string,
  myBlogIndex: BlogIndexLevel = '일반'
): Promise<TopBlogAnalysisResult | null> {
  const searchResults = await fetchNaverBlogSearchResults(keyword, clientId, clientSecret, 10);
  if (searchResults.length === 0) return null;
  return analyzeTopBlogs(keyword, searchResults, myBlogIndex);
}
