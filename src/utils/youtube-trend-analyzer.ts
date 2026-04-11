/**
 * YouTube 트렌드 분석 엔진
 * 트렌딩 영상 데이터를 분석하여 콘텐츠 크리에이터에게 유용한 인사이트를 제공
 */

import {
  YouTubeVideo,
  YouTubeSearchConfig,
  searchYouTubeVideos,
  getYouTubeTrending,
} from './youtube-data-api';
import { getNaverKeywordSearchVolumeSeparate, NaverDatalabConfig } from './naver-datalab-api';

// ============================================
// 타입 정의
// ============================================

export type ContentGrade = 'SSS' | 'SS' | 'S' | 'A' | 'B';

export type TitleType = 'list' | 'question' | 'emotional' | 'informational' | 'review';

export interface WordFrequency {
  word: string;
  count: number;
}

export interface TitleTypeDistribution {
  list: number;       // 리스트형
  question: number;   // 질문형
  emotional: number;  // 감성형
  informational: number; // 정보형
  review: number;     // 후기형
}

export interface PatternViewCorrelation {
  pattern: string;
  withPattern: number;    // 패턴 있는 영상 평균 조회수
  withoutPattern: number; // 패턴 없는 영상 평균 조회수
  lift: number;           // withPattern / withoutPattern (1 이상이면 효과 있음)
  recommendation: string;
}

export interface TitlePatternAnalysis {
  numberInclusionRate: number;       // 숫자 포함률
  questionRate: number;              // 질문형 비율
  emotionalTriggerFrequency: WordFrequency[];  // 감성 트리거 빈도
  bracketUsageRate: number;          // 괄호/꺾쇠 사용률
  averageTitleLength: number;        // 평균 제목 길이
  emojiUsageRate: number;            // 이모지 사용률
  topWords: WordFrequency[];         // 자주 사용되는 단어 TOP 20
  titleTypeDistribution: TitleTypeDistribution; // 제목 유형 분류
  patternCorrelations: PatternViewCorrelation[]; // 패턴별 조회수 상관관계
  totalAnalyzed: number;
}

export interface ContentOpportunityResult {
  keyword: string;
  averageViewCount: number;         // 평균 조회수
  competitorCount: number;          // 경쟁 영상 수
  opportunityScore: number;         // 기회 점수
  freshnessWeight: number;          // 신선도 가중치
  isBlueOcean: boolean;             // 블루오션 판정
  recommendedDirection: string[];   // 추천 콘텐츠 방향
}

export interface DemandCategory {
  review: string[];
  comparison: string[];
  tutorial: string[];
  information: string[];
}

export interface DemandSignalResult {
  topDemandKeywords: WordFrequency[]; // 수요 키워드 TOP 20
  demandPatterns: WordFrequency[];    // 수요 패턴
  demandCategories: DemandCategory;   // 수요 카테고리 분류
  totalCommentsAnalyzed: number;
}

export interface Percentiles {
  average: number;
  median: number;
  min: number;
  max: number;
}

export interface OptimalDurationBucket {
  rangeLabel: string;   // 예: "10~20분"
  averageViews: number;
  videoCount: number;
}

export interface BenchmarkResult {
  viewCountStats: Percentiles;
  likeRateStats: Percentiles;    // 좋아요/조회수
  commentRateStats: Percentiles; // 댓글/조회수
  averageDurationSeconds: number;
  shortsRatio: number;
  longformRatio: number;
  optimalDurationBucket: OptimalDurationBucket;
  optimalPublishHour: number;    // 0~23
  totalVideosAnalyzed: number;
}

export interface CategoryStat {
  categoryName: string;
  videoCount: number;
  averageViewCount: number;
  averageEngagementRate: number;
}

export interface TrendDashboardResult {
  categoryStats: CategoryStat[];
  risingTop10: YouTubeVideo[];       // viewsPerHour 기준
  shortsRatio: number;
  hotKeywords: WordFrequency[];      // 제목에서 추출
  totalVideos: number;
}

export interface GoldenKeywordSuggestion {
  keyword: string;
  trendScore: number;        // 트렌드성
  competitionScore: number;  // 경쟁도 (낮을수록 좋음)
  engagementScore: number;   // 수익성
  totalScore: number;
  grade: ContentGrade;
  reason: string;
}

export interface NaverCrossReference {
  keyword: string;
  pcSearchVolume: number;          // 네이버 API 실측
  mobileSearchVolume: number;      // 네이버 API 실측
  totalSearchVolume: number;       // pc + mobile 합산
  documentCount: number;           // 네이버 API 실측
  ratio: number;                   // totalSearchVolume / documentCount
  youtubeViewsPerHour: number;     // YouTube API 실측
  urgencyScore: number;            // 실측 데이터 기반 계산
  verdict: string;
  warnings: string[];
  relatedKeywords: string[];       // 영상 태그/제목에서 추출
}

export interface CrossAnalysisResult {
  opportunities: NaverCrossReference[];
  analyzedKeywords: number;
  timestamp: string;
}

export interface FullAnalysisResult {
  titlePatterns: TitlePatternAnalysis;
  contentOpportunity: ContentOpportunityResult | null;
  benchmark: BenchmarkResult;
  trendDashboard: TrendDashboardResult;
  goldenKeywords: GoldenKeywordSuggestion[];
  analyzedAt: string;
  keyword?: string;
  crossAnalysis: CrossAnalysisResult | null;
}

// ============================================
// 상수
// ============================================

const STOP_WORDS = new Set([
  '이', '가', '을', '를', '의', '에', '는', '은', '로', '으로', '와', '과',
  '에서', '에게', '까지', '부터', '이다', '하다', '있다', '없다', '되다',
  '하는', '되는', '있는', '없는', '한', '된', '있어', '없어', '해서',
  '그', '이', '저', '것', '수', '때', '년', '월', '일', '더',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
  'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'but',
]);

const EMOTIONAL_TRIGGERS = [
  '충격', '역대급', '실화', '레전드', 'ㄷㄷ', '미쳤', '대박', '헐', '실화냐',
  '경악', '눈물', '감동', '웃김', '황당', '놀라운', '믿을수없', '말이안됨',
  '빵터짐', '꿀잼', '개웃김', '개쩐다', '쩐다', '미침', '대미쳤',
];

const DEMAND_PATTERNS = [
  '해주세요', '궁금', '알려주세요', '리뷰', '비교', '추천',
  '어떻게', '방법', '어디서', '뭐가', '무엇이', '알고싶',
];

const DEMAND_REVIEW_WORDS = ['리뷰', '후기', '솔직', '사용해봤', '써봤'];
const DEMAND_COMPARISON_WORDS = ['비교', '차이', '어느게', '뭐가 나', 'vs', 'VS'];
const DEMAND_TUTORIAL_WORDS = ['방법', '어떻게', '따라하기', '강좌', '튜토리얼', '만들기'];
const DEMAND_INFO_WORDS = ['궁금', '알려주', '정보', '뭔지', '뭐야', '해주세요'];

// ============================================
// 내부 유틸리티
// ============================================

function containsNumber(text: string): boolean {
  return /\d/.test(text);
}

function isQuestionTitle(text: string): boolean {
  return /[?？]|왜|어떻게|어떤|뭐|무엇|어디|언제|누가|얼마/.test(text);
}

function containsBracket(text: string): boolean {
  return /[\[\]()（）【】\<\>《》「」『』]/.test(text);
}

function containsEmoji(text: string): boolean {
  return /[\u{1F300}-\u{1FFFF}]|[\u{2600}-\u{27BF}]/u.test(text);
}

function extractWords(title: string): string[] {
  return title
    .replace(/[\[\]()（）【】\<\>《》「」『』?？!！,，.。]/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length >= 2 && !STOP_WORDS.has(w));
}

function classifyTitleType(title: string): TitleType {
  if (/TOP\s?\d|^\d+가지|\d+개|순위|베스트/.test(title)) return 'list';
  if (isQuestionTitle(title)) return 'question';
  if (EMOTIONAL_TRIGGERS.some(t => title.includes(t))) return 'emotional';
  if (/후기|리뷰|사용해봤|써봤|솔직/.test(title)) return 'review';
  return 'informational';
}

function computeMedian(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function computePercentiles(values: number[]): Percentiles {
  if (values.length === 0) return { average: 0, median: 0, min: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const average = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  return {
    average,
    median: computeMedian(sorted),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

function getTopN<T extends { count: number }>(arr: T[], n: number): T[] {
  return [...arr].sort((a, b) => b.count - a.count).slice(0, n);
}

function buildFrequencyMap(words: string[]): Map<string, number> {
  return words.reduce((map, word) => {
    map.set(word, (map.get(word) ?? 0) + 1);
    return map;
  }, new Map<string, number>());
}

function freqMapToArray(map: Map<string, number>): WordFrequency[] {
  return Array.from(map.entries()).map(([word, count]) => ({ word, count }));
}

function assignGrade(score: number): ContentGrade {
  if (score >= 85) return 'SSS';
  if (score >= 75) return 'SS';
  if (score >= 65) return 'S';
  if (score >= 55) return 'A';
  return 'B';
}

function daysBetween(dateStr: string, now: Date): number {
  const diff = now.getTime() - new Date(dateStr).getTime();
  return diff / (1000 * 60 * 60 * 24);
}

// ============================================
// 1. analyzeTitlePatterns
// ============================================

function computePatternCorrelation(
  videos: YouTubeVideo[],
  patternName: string,
  predicate: (title: string) => boolean
): PatternViewCorrelation {
  const withP = videos.filter(v => predicate(v.title));
  const withoutP = videos.filter(v => !predicate(v.title));
  const avgWith = withP.length > 0 ? withP.reduce((s, v) => s + v.viewCount, 0) / withP.length : 0;
  const avgWithout = withoutP.length > 0 ? withoutP.reduce((s, v) => s + v.viewCount, 0) / withoutP.length : 0;
  const lift = avgWithout > 0 ? avgWith / avgWithout : 0;
  const recommendation = lift >= 1.5
    ? `${patternName} 사용 시 조회수 ${((lift - 1) * 100).toFixed(0)}% 높음 → 적극 활용`
    : lift >= 1.1
    ? `${patternName} 소폭 효과 있음`
    : lift > 0
    ? `${patternName} 효과 미미 → 선택적 사용`
    : '';
  return { pattern: patternName, withPattern: avgWith, withoutPattern: avgWithout, lift, recommendation };
}

export function analyzeTitlePatterns(videos: YouTubeVideo[]): TitlePatternAnalysis {
  if (videos.length === 0) {
    return {
      numberInclusionRate: 0,
      questionRate: 0,
      emotionalTriggerFrequency: [],
      bracketUsageRate: 0,
      averageTitleLength: 0,
      emojiUsageRate: 0,
      topWords: [],
      titleTypeDistribution: { list: 0, question: 0, emotional: 0, informational: 0, review: 0 },
      patternCorrelations: [],
      totalAnalyzed: 0,
    };
  }

  const total = videos.length;
  const titles = videos.map(v => v.title);

  const numberCount = titles.filter(containsNumber).length;
  const questionCount = titles.filter(isQuestionTitle).length;
  const bracketCount = titles.filter(containsBracket).length;
  const emojiCount = titles.filter(containsEmoji).length;
  const totalLength = titles.reduce((s, t) => s + t.length, 0);

  const emotionalMap = buildFrequencyMap(
    titles.flatMap(t => EMOTIONAL_TRIGGERS.filter(trigger => t.includes(trigger)))
  );

  // topWords: 태그(실제 키워드) 우선, 제목 2어절 구문 보조
  const tagWords = videos
    .flatMap(v => v.tags)
    .filter(t => t.length >= 2 && t.length <= 20 && isValidKeyword(t));
  const titlePhrases = videos.flatMap(v => {
    const parts = v.title
      .replace(/[\[\]()（）【】<>《》「」『』?？!！,，.。|·#]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2 && !STOP_WORDS.has(w));
    const phrases: string[] = [];
    for (let i = 0; i < parts.length - 1; i++) {
      const twoWord = parts[i] + ' ' + parts[i + 1];
      if (twoWord.length >= 4 && twoWord.length <= 15) phrases.push(twoWord);
    }
    return phrases;
  });
  const allKeywordCandidates = [...tagWords, ...titlePhrases];
  const wordMap = buildFrequencyMap(allKeywordCandidates);
  const topWords = getTopN(freqMapToArray(wordMap), 20);

  const typeCount = titles.reduce(
    (acc, t) => {
      const type = classifyTitleType(t);
      return { ...acc, [type]: acc[type] + 1 };
    },
    { list: 0, question: 0, emotional: 0, informational: 0, review: 0 }
  );

  // 패턴별 조회수 상관관계 분석 — "이 패턴을 쓰면 실제로 조회수가 높은가?"
  const patternCorrelations = [
    computePatternCorrelation(videos, '숫자 포함', containsNumber),
    computePatternCorrelation(videos, '질문형', isQuestionTitle),
    computePatternCorrelation(videos, '감성 트리거', t => EMOTIONAL_TRIGGERS.some(tr => t.includes(tr))),
    computePatternCorrelation(videos, '괄호/꺾쇠', containsBracket),
    computePatternCorrelation(videos, '이모지', containsEmoji),
  ].sort((a, b) => b.lift - a.lift);

  return {
    numberInclusionRate: numberCount / total,
    questionRate: questionCount / total,
    emotionalTriggerFrequency: getTopN(freqMapToArray(emotionalMap), 10),
    bracketUsageRate: bracketCount / total,
    averageTitleLength: totalLength / total,
    emojiUsageRate: emojiCount / total,
    topWords,
    titleTypeDistribution: typeCount,
    patternCorrelations,
    totalAnalyzed: total,
  };
}

// ============================================
// 2. scoreContentOpportunity
// ============================================

export function scoreContentOpportunity(
  videos: YouTubeVideo[],
  keyword: string
): ContentOpportunityResult {
  const lower = keyword.toLowerCase();
  const related = videos.filter(
    v => v.title.toLowerCase().includes(lower) || v.tags.some(t => t.toLowerCase().includes(lower))
  );

  const competitorCount = related.length;
  const averageViewCount =
    competitorCount > 0
      ? related.reduce((s, v) => s + v.viewCount, 0) / competitorCount
      : 0;

  const now = new Date();
  const recentCount = related.filter(v => daysBetween(v.publishedAt, now) <= 7).length;
  const freshnessWeight = competitorCount > 0 ? 1 + recentCount / competitorCount : 1;

  const opportunityScore = (averageViewCount / (competitorCount + 1)) * freshnessWeight;

  const allScores = videos.map(v => {
    const cnt = videos.filter(
      x => x.title.toLowerCase().includes(v.title.toLowerCase().slice(0, 5))
    ).length;
    return (v.viewCount / (cnt + 1)) * freshnessWeight;
  });
  const sorted = [...allScores].sort((a, b) => a - b);
  const p80Index = Math.floor(sorted.length * 0.8);
  const isBlueOcean = opportunityScore >= (sorted[p80Index] ?? 0);

  const topRelated = [...related]
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, 5);
  const recommendedDirection = topRelated
    .map(v => classifyTitleType(v.title))
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .map(type => {
      const labels: Record<TitleType, string> = {
        list: '리스트형 제목 활용 (TOP N, N가지)',
        question: '질문형 제목으로 호기심 유발',
        emotional: '감성 트리거 단어 삽입',
        informational: '정보형 제목으로 신뢰 구축',
        review: '솔직 후기/리뷰 포맷',
      };
      return labels[type];
    });

  return {
    keyword,
    averageViewCount,
    competitorCount,
    opportunityScore,
    freshnessWeight,
    isBlueOcean,
    recommendedDirection,
  };
}

// ============================================
// 3. extractDemandSignals
// ============================================

export function extractDemandSignals(
  comments: Array<{ text: string; likeCount: number }>
): DemandSignalResult {
  if (comments.length === 0) {
    return {
      topDemandKeywords: [],
      demandPatterns: [],
      demandCategories: { review: [], comparison: [], tutorial: [], information: [] },
      totalCommentsAnalyzed: 0,
    };
  }

  const patternMap = new Map<string, number>();
  const keywordMap = new Map<string, number>();

  for (const { text, likeCount } of comments) {
    const weight = 1 + likeCount;

    for (const pattern of DEMAND_PATTERNS) {
      if (text.includes(pattern)) {
        patternMap.set(pattern, (patternMap.get(pattern) ?? 0) + weight);
      }
    }

    const words = extractWords(text);
    for (const word of words) {
      keywordMap.set(word, (keywordMap.get(word) ?? 0) + weight);
    }
  }

  const topDemandKeywords = getTopN(freqMapToArray(keywordMap), 20);
  const demandPatterns = getTopN(freqMapToArray(patternMap), 20);

  const allCommentTexts = comments.map(c => c.text);
  const categorize = (words: string[]): string[] =>
    topDemandKeywords
      .filter(kw => words.some(w => kw.word.includes(w) || w.includes(kw.word)))
      .map(kw => kw.word);

  return {
    topDemandKeywords,
    demandPatterns,
    demandCategories: {
      review: categorize(DEMAND_REVIEW_WORDS),
      comparison: categorize(DEMAND_COMPARISON_WORDS),
      tutorial: categorize(DEMAND_TUTORIAL_WORDS),
      information: categorize(DEMAND_INFO_WORDS),
    },
    totalCommentsAnalyzed: allCommentTexts.length,
  };
}

// ============================================
// 4. generateBenchmark
// ============================================

function getOptimalDurationBucket(videos: YouTubeVideo[]): OptimalDurationBucket {
  const buckets: Array<{ label: string; min: number; max: number }> = [
    { label: '1분 미만', min: 0, max: 60 },
    { label: '1~3분', min: 60, max: 180 },
    { label: '3~10분', min: 180, max: 600 },
    { label: '10~20분', min: 600, max: 1200 },
    { label: '20~30분', min: 1200, max: 1800 },
    { label: '30분 이상', min: 1800, max: Infinity },
  ];

  const bucketResults = buckets.map(b => {
    const matching = videos.filter(
      v => v.durationSeconds >= b.min && v.durationSeconds < b.max
    );
    const avgViews =
      matching.length > 0
        ? matching.reduce((s, v) => s + v.viewCount, 0) / matching.length
        : 0;
    return { rangeLabel: b.label, averageViews: avgViews, videoCount: matching.length };
  });

  return bucketResults.reduce(
    (best, cur) => (cur.averageViews > best.averageViews ? cur : best),
    bucketResults[0]
  );
}

function getOptimalPublishHour(videos: YouTubeVideo[]): number {
  const hourMap = new Map<number, { totalViews: number; count: number }>();

  for (const v of videos) {
    const hour = new Date(v.publishedAt).getHours();
    const prev = hourMap.get(hour) ?? { totalViews: 0, count: 0 };
    hourMap.set(hour, { totalViews: prev.totalViews + v.viewCount, count: prev.count + 1 });
  }

  let bestHour = 0;
  let bestAvg = 0;
  for (const [hour, { totalViews, count }] of hourMap.entries()) {
    const avg = totalViews / count;
    if (avg > bestAvg) {
      bestAvg = avg;
      bestHour = hour;
    }
  }
  return bestHour;
}

export function generateBenchmark(videos: YouTubeVideo[]): BenchmarkResult {
  if (videos.length === 0) {
    return {
      viewCountStats: { average: 0, median: 0, min: 0, max: 0 },
      likeRateStats: { average: 0, median: 0, min: 0, max: 0 },
      commentRateStats: { average: 0, median: 0, min: 0, max: 0 },
      averageDurationSeconds: 0,
      shortsRatio: 0,
      longformRatio: 0,
      optimalDurationBucket: { rangeLabel: '-', averageViews: 0, videoCount: 0 },
      optimalPublishHour: 0,
      totalVideosAnalyzed: 0,
    };
  }

  const viewCounts = videos.map(v => v.viewCount);
  const likeRates = videos.map(v => (v.viewCount > 0 ? v.likeCount / v.viewCount : 0));
  const commentRates = videos.map(v => (v.viewCount > 0 ? v.commentCount / v.viewCount : 0));
  const durations = videos.map(v => v.durationSeconds);

  const shortsCount = videos.filter(v => v.isShorts).length;

  return {
    viewCountStats: computePercentiles(viewCounts),
    likeRateStats: computePercentiles(likeRates),
    commentRateStats: computePercentiles(commentRates),
    averageDurationSeconds: durations.reduce((s, d) => s + d, 0) / durations.length,
    shortsRatio: shortsCount / videos.length,
    longformRatio: (videos.length - shortsCount) / videos.length,
    optimalDurationBucket: getOptimalDurationBucket(videos),
    optimalPublishHour: getOptimalPublishHour(videos),
    totalVideosAnalyzed: videos.length,
  };
}

// ============================================
// 5. aggregateTrendDashboard
// ============================================

export function aggregateTrendDashboard(videos: YouTubeVideo[]): TrendDashboardResult {
  if (videos.length === 0) {
    return {
      categoryStats: [],
      risingTop10: [],
      shortsRatio: 0,
      hotKeywords: [],
      totalVideos: 0,
    };
  }

  const categoryMap = new Map<string, { totalViews: number; totalEngagement: number; count: number }>();

  for (const v of videos) {
    const name = v.categoryName || '기타';
    const prev = categoryMap.get(name) ?? { totalViews: 0, totalEngagement: 0, count: 0 };
    const engagementRate = v.viewCount > 0
      ? (v.likeCount + v.commentCount) / v.viewCount
      : 0;
    categoryMap.set(name, {
      totalViews: prev.totalViews + v.viewCount,
      totalEngagement: prev.totalEngagement + engagementRate,
      count: prev.count + 1,
    });
  }

  const categoryStats: CategoryStat[] = Array.from(categoryMap.entries()).map(
    ([categoryName, { totalViews, totalEngagement, count }]) => ({
      categoryName,
      videoCount: count,
      averageViewCount: totalViews / count,
      averageEngagementRate: totalEngagement / count,
    })
  );

  const risingTop10 = [...videos]
    .sort((a, b) => b.viewsPerHour - a.viewsPerHour)
    .slice(0, 10);

  const shortsCount = videos.filter(v => v.isShorts).length;

  // 키워드 소스 1: 영상 태그 (크리에이터가 직접 설정한 실제 키워드)
  const tagKeywords = videos
    .flatMap(v => v.tags)
    .filter(t => t.length >= 2 && t.length <= 20 && isValidKeyword(t));

  // 키워드 소스 2: 제목에서 2~3어절 구문 추출 (단어 쪼개기 아님)
  const phraseKeywords = videos.flatMap(v => {
    const parts = v.title
      .replace(/[\[\]()（）【】<>《》「」『』?？!！,，.。|·#]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2 && !STOP_WORDS.has(w));
    const phrases: string[] = [];
    for (let i = 0; i < parts.length - 1; i++) {
      const twoWord = parts[i] + ' ' + parts[i + 1];
      if (twoWord.length >= 4 && twoWord.length <= 15) phrases.push(twoWord);
      if (i < parts.length - 2) {
        const threeWord = twoWord + ' ' + parts[i + 2];
        if (threeWord.length >= 6 && threeWord.length <= 20) phrases.push(threeWord);
      }
    }
    return phrases.filter(p => isValidKeyword(p.split(' ')[0]));
  });

  // 태그 우선, 구문 보조
  const allKeywords = [...tagKeywords, ...phraseKeywords];
  const wordMap = buildFrequencyMap(allKeywords);
  const hotKeywords = getTopN(freqMapToArray(wordMap), 30);

  return {
    categoryStats,
    risingTop10,
    shortsRatio: shortsCount / videos.length,
    hotKeywords,
    totalVideos: videos.length,
  };
}

// ============================================
// 6. generateGoldenKeywords
// ============================================

function computeKeywordScore(
  keyword: WordFrequency,
  dashboard: TrendDashboardResult,
  patterns: TitlePatternAnalysis,
  allVideos: YouTubeVideo[]
): { trendScore: number; competitionScore: number; engagementScore: number; total: number } {
  const kw = keyword.word.toLowerCase();

  // 트렌드성: 급상승 영상 히트 + 전체 영상에서 해당 키워드 포함 영상의 평균 viewsPerHour
  const risingHits = dashboard.risingTop10.filter(v => v.title.toLowerCase().includes(kw)).length;
  const kwVideos = allVideos.filter(v => v.title.toLowerCase().includes(kw));
  const avgVph = kwVideos.length > 0
    ? kwVideos.reduce((s, v) => s + v.viewsPerHour, 0) / kwVideos.length
    : 0;
  const maxVph = allVideos.length > 0
    ? Math.max(...allVideos.map(v => v.viewsPerHour), 1)
    : 1;
  const trendScore = Math.min(100,
    (risingHits / Math.max(dashboard.risingTop10.length, 1)) * 40 +
    (avgVph / maxVph) * 60
  );

  // 경쟁도: 해당 키워드 영상이 많을수록 경쟁 높음 → 점수 낮음
  // 전체 영상 대비 해당 키워드 영상 비율의 역수
  const kwRatio = allVideos.length > 0 ? kwVideos.length / allVideos.length : 0;
  const competitionScore = Math.max(0, Math.min(100, (1 - kwRatio) * 100));

  // 참여도: 해당 키워드 영상들의 실제 engagement rate (좋아요+댓글/조회수)
  const kwEngagement = kwVideos.length > 0
    ? kwVideos.reduce((s, v) => s + (v.viewCount > 0 ? (v.likeCount + v.commentCount) / v.viewCount : 0), 0) / kwVideos.length
    : 0;
  // 전체 평균 engagement 대비 상대 점수
  const allEngagement = allVideos.length > 0
    ? allVideos.reduce((s, v) => s + (v.viewCount > 0 ? (v.likeCount + v.commentCount) / v.viewCount : 0), 0) / allVideos.length
    : 0;
  const engagementScore = allEngagement > 0
    ? Math.min(100, (kwEngagement / allEngagement) * 50)
    : 0;

  const total = trendScore * 0.4 + competitionScore * 0.35 + engagementScore * 0.25;
  return { trendScore, competitionScore, engagementScore, total };
}

export function generateGoldenKeywords(
  dashboard: TrendDashboardResult,
  titlePatterns: TitlePatternAnalysis,
  allVideos: YouTubeVideo[] = []
): GoldenKeywordSuggestion[] {
  const candidates = [...dashboard.hotKeywords, ...titlePatterns.topWords]
    .filter(kw => isValidKeyword(kw.word));

  const deduped = Array.from(
    candidates.reduce((map, kw) => {
      const existing = map.get(kw.word);
      return map.set(kw.word, existing ? { ...kw, count: existing.count + kw.count } : kw);
    }, new Map<string, WordFrequency>()).values()
  );

  return deduped
    .map(kw => {
      const { trendScore, competitionScore, engagementScore, total } =
        computeKeywordScore(kw, dashboard, titlePatterns, allVideos);
      const grade = assignGrade(total);

      // 구체적인 판단 이유 제공
      const reasons: string[] = [];
      if (trendScore >= 50) reasons.push('급상승 트렌드');
      if (competitionScore >= 80) reasons.push('경쟁 적음');
      if (engagementScore >= 50) reasons.push('참여도 높음');
      if (reasons.length === 0) reasons.push('일반');
      const reason = reasons.join(' + ') + ` (${trendScore.toFixed(0)}/${competitionScore.toFixed(0)}/${engagementScore.toFixed(0)})`;

      return { keyword: kw.word, trendScore, competitionScore, engagementScore, totalScore: total, grade, reason };
    })
    .filter(k => k.totalScore >= 45) // B등급 이상만
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, 50);
}

// ============================================
// 7. crossReferenceWithNaver / generateRelatedKeywords
// ============================================

function generateRelatedKeywords(keyword: string, videos: YouTubeVideo[]): string[] {
  const kwLower = keyword.toLowerCase();
  const relatedVideos = videos
    .filter(v => v.title.toLowerCase().includes(kwLower) || v.tags.some(t => t.toLowerCase().includes(kwLower)))
    .sort((a, b) => b.viewCount - a.viewCount);

  // 태그에서 키워드 조합 추출
  const tagKeywords = relatedVideos
    .flatMap(v => v.tags)
    .filter(t => t.length >= 2 && t.length <= 15 && t.toLowerCase() !== kwLower)
    .map(t => t.trim());

  // 제목에서 키워드+수식어 조합 추출
  const titleWords = relatedVideos
    .flatMap(v => {
      const title = v.title;
      const combinations: string[] = [];
      const parts = title.replace(/[\[\]()（）【】<>《》「」『』?？!！,，.。|·]/g, ' ').split(/\s+/).filter(w => w.length >= 1);
      const kwIdx = parts.findIndex(p => p.toLowerCase().includes(kwLower));
      if (kwIdx >= 0) {
        if (kwIdx > 0) combinations.push(parts[kwIdx - 1] + ' ' + parts[kwIdx]);
        if (kwIdx < parts.length - 1) combinations.push(parts[kwIdx] + ' ' + parts[kwIdx + 1]);
        if (kwIdx > 0 && kwIdx < parts.length - 1) {
          combinations.push(parts[kwIdx - 1] + ' ' + parts[kwIdx] + ' ' + parts[kwIdx + 1]);
        }
      }
      return combinations.filter(c => c.length >= 4 && c.length <= 20);
    });

  // 빈도순 정렬 + 중복 제거
  const allCandidates = [...tagKeywords, ...titleWords];
  const freqMap = new Map<string, number>();
  for (const c of allCandidates) {
    const key = c.toLowerCase();
    freqMap.set(key, (freqMap.get(key) ?? 0) + 1);
  }

  const sorted = Array.from(freqMap.entries())
    .filter(([k]) => k !== kwLower && k.length >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);

  // 원본 키워드와의 조합 키워드 추가
  const suffixes = ['추천', '후기', '비교', '순위', '방법', '종류', '가격', '효과', '부작용', '차이'];
  const combinedKeywords = suffixes
    .map(s => keyword + ' ' + s)
    .slice(0, 3);

  return [...new Set([...sorted.slice(0, 5), ...combinedKeywords])].slice(0, 8);
}

function computeUrgencyScore(
  youtubeViewsPerHour: number,
  maxVph: number,
  ratio: number
): number {
  const trendUrgency = Math.min(50, maxVph > 0 ? (youtubeViewsPerHour / maxVph) * 50 : 0);
  const gapUrgency = ratio >= 10 ? 50 : ratio >= 5 ? 35 : ratio >= 2 ? 20 : ratio * 10;
  return Math.min(100, trendUrgency + Math.min(50, gapUrgency));
}

function computeVerdict(urgencyScore: number): string {
  if (urgencyScore >= 80) return '🔥 트렌드 상승 + 빈집! 선점 기회';
  if (urgencyScore >= 60) return '⚡ 경쟁 적음! 빠르게 선점 가능';
  if (urgencyScore >= 40) return '💡 수요 대비 공급 부족';
  return '📋 참고용';
}

function computeWarnings(
  totalSearchVolume: number,
  documentCount: number,
  ratio: number,
  youtubeViewsPerHour: number
): string[] {
  const warnings: string[] = [];
  if (documentCount > 50000) {
    warnings.push('경쟁 문서 5만+: 상위 노출 난이도 매우 높음');
  }
  if (totalSearchVolume >= 5000 && documentCount < 100) {
    warnings.push('검색량 대비 문서 극소: 트렌드 초기, 빠른 선점 유리');
  }
  if (youtubeViewsPerHour > 10000) {
    warnings.push('유튜브 급상승 중: 네이버 검색량 1-2일 후 급증 가능');
  }
  return warnings;
}

// 포괄적/무의미 키워드 필터
const BROAD_KEYWORDS = new Set([
  '영상', '동영상', '비디오', '채널', '구독', '좋아요', '조회수',
  '오늘', '내일', '어제', '이번', '올해', '지금', '최근', '이거',
  '정말', '진짜', '너무', '아주', '매우', '완전', '그냥', '약간',
  '우리', '나의', '여기', '거기', '어디', '무엇', '이런', '저런',
  '뉴스', '속보', '기사', '보도', '관련', '시청', '알림', '설정',
  '방송', '라이브', '실시간', '공식', '발표', '확인', '공개',
]);

function isValidKeyword(kw: string): boolean {
  if (kw.length < 2) return false;          // 1글자 제거
  if (kw.length > 20) return false;         // 너무 긴 키워드
  if (/^\d+$/.test(kw)) return false;       // 순수 숫자
  if (BROAD_KEYWORDS.has(kw)) return false; // 포괄적 키워드
  if (!/[가-힣]/.test(kw)) return false;    // 한글 미포함 제거 (영문만 키워드 차단)
  return true;
}

export async function crossReferenceWithNaver(
  keywords: string[],
  naverConfig: NaverDatalabConfig,
  youtubeVideos: YouTubeVideo[]
): Promise<CrossAnalysisResult> {
  // 1단계: 무의미/포괄 키워드 필터링
  const validKeywords = keywords.filter(isValidKeyword);
  if (validKeywords.length === 0) {
    return { opportunities: [], analyzedKeywords: 0, timestamp: new Date().toISOString() };
  }

  // 2단계: 네이버 실제 데이터 조회
  const naverData = await getNaverKeywordSearchVolumeSeparate(naverConfig, validKeywords, { includeDocumentCount: true });

  const maxVph = youtubeVideos.length > 0
    ? Math.max(...youtubeVideos.map(v => v.viewsPerHour), 1)
    : 1;

  const opportunities: NaverCrossReference[] = naverData
    .map(item => {
      const pcSearchVolume = item.pcSearchVolume ?? 0;
      const mobileSearchVolume = item.mobileSearchVolume ?? 0;
      const totalSearchVolume = pcSearchVolume + mobileSearchVolume;
      const documentCount = item.documentCount ?? 0;

      // 네이버에서 검색량이 0이면 = 실제 수요 없음 → 제거
      if (totalSearchVolume === 0) return null;

      const ratio = totalSearchVolume / Math.max(1, documentCount);

      const kwLower = item.keyword.toLowerCase();
      const kwVideos = youtubeVideos.filter(v => v.title.toLowerCase().includes(kwLower));
      const youtubeViewsPerHour = kwVideos.length > 0
        ? kwVideos.reduce((s, v) => s + v.viewsPerHour, 0) / kwVideos.length
        : 0;

      const urgencyScore = computeUrgencyScore(youtubeViewsPerHour, maxVph, ratio);
      const warnings = computeWarnings(totalSearchVolume, documentCount, ratio, youtubeViewsPerHour);

      return {
        keyword: item.keyword,
        pcSearchVolume,
        mobileSearchVolume,
        totalSearchVolume,
        documentCount,
        ratio,
        youtubeViewsPerHour,
        urgencyScore,
        verdict: computeVerdict(urgencyScore),
        warnings,
        relatedKeywords: generateRelatedKeywords(item.keyword, youtubeVideos),
      };
    })
    .filter((item): item is NaverCrossReference => item !== null)
    // 3단계: 경쟁 과열 키워드 제거 (문서수 10만 이상)
    .filter(item => item.documentCount < 100000)
    // 4단계: 수요/공급 비율 1 미만 제거 (공급 과잉)
    .filter(item => item.ratio >= 1)
    .sort((a, b) => b.urgencyScore - a.urgencyScore);

  return {
    opportunities,
    analyzedKeywords: opportunities.length,
    timestamp: new Date().toISOString(),
  };
}

// ============================================
// 8. runFullAnalysis
// ============================================

export async function runFullAnalysis(config: {
  apiKey: string;
  keyword?: string;
  maxResults?: number;
  naverClientId?: string;
  naverClientSecret?: string;
}): Promise<FullAnalysisResult> {
  const searchConfig: YouTubeSearchConfig = {
    apiKey: config.apiKey,
    keyword: config.keyword,
    maxResults: config.maxResults ?? 50,
    regionCode: 'KR',
    order: 'viewCount',
  };

  const [searchResult, trendingResult] = await Promise.all([
    config.keyword
      ? searchYouTubeVideos(searchConfig)
      : Promise.resolve({ success: true, videos: [] as YouTubeVideo[], totalResults: 0, timestamp: new Date().toISOString() }),
    getYouTubeTrending({ ...searchConfig, keyword: undefined }),
  ]);

  const searchVideos = searchResult.success ? searchResult.videos : [];
  const trendingVideos = trendingResult.success ? trendingResult.videos : [];

  // 음악 MV만 제외 (엔터/영화/게임 이슈는 블로그 소재로 유효)
  const EXCLUDE_CATEGORIES = new Set([
    '10',  // 음악 (MV, 라이브 무대 등 — 키워드 가치 없음)
  ]);

  const allVideos = [...trendingVideos, ...searchVideos]
    .filter((v, i, arr) => arr.findIndex(x => x.videoId === v.videoId) === i)
    .filter(v => !EXCLUDE_CATEGORIES.has(v.categoryId));

  const titlePatterns = analyzeTitlePatterns(allVideos);
  const benchmark = generateBenchmark(allVideos);
  const trendDashboard = aggregateTrendDashboard(allVideos);
  const goldenKeywords = generateGoldenKeywords(trendDashboard, titlePatterns, allVideos);
  const contentOpportunity = config.keyword
    ? scoreContentOpportunity(allVideos, config.keyword)
    : null;

  let crossAnalysis: CrossAnalysisResult | null = null;
  if (config.naverClientId && config.naverClientSecret) {
    const topKeywords = goldenKeywords.slice(0, 20).map(k => k.keyword);
    const hotKws = trendDashboard.hotKeywords.slice(0, 10).map(k => k.word);
    const uniqueKeywords = [...new Set([...topKeywords, ...hotKws])].slice(0, 30);

    try {
      crossAnalysis = await crossReferenceWithNaver(
        uniqueKeywords,
        { clientId: config.naverClientId, clientSecret: config.naverClientSecret },
        allVideos
      );
    } catch (e) {
      console.warn('[YT-ANALYZER] 네이버 교차 분석 실패:', e);
    }
  }

  return {
    titlePatterns,
    contentOpportunity,
    benchmark,
    trendDashboard,
    goldenKeywords,
    analyzedAt: new Date().toISOString(),
    keyword: config.keyword,
    crossAnalysis,
  };
}
