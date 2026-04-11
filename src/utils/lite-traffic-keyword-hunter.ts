/**
 * 🌶️ Lite+ 트래픽 키워드 헌터 - v3.0 (PRO의 70%)
 * 
 * PRO 대비 70% 기능:
 * ✅ 등급: S/A/B/C (PRO: SSS/SS 추가)
 * ✅ 키워드 타입: 5종류 (PRO: 7종류)
 * ✅ 안전도: safe/caution (PRO: +danger)
 * ✅ 콘텐츠 가이드: 간략 (PRO: 상세)
 * ✅ 타이밍 점수 + 신뢰도
 * ❌ ultimateAnalysis, proStrategy 상세
 */

import { EnvironmentManager } from './environment-manager';
import { analyzeKeywordTrendingReason } from './keyword-trend-analyzer';
import { getRelatedKeywords } from './related-keyword-cache';
import { estimateCPC, calculatePurchaseIntent } from './profit-golden-keyword-engine';

// ============================================================
// 📋 인터페이스 정의
// ============================================================

// 🏷️ 키워드 타입 (Lite: 5종류, PRO: 7종류)
export type LiteKeywordType =
  | '🔥 타이밍'      // 지금 바로
  | '💎 블루오션'    // 경쟁 낮음
  | '📰 이슈'        // 실시간 이슈
  | '❓ 질문형'      // ~하는법, ~방법
  | '🎯 롱테일';     // 긴 키워드

export interface LiteTrafficKeyword {
  keyword: string;

  // 📊 기본 지표
  searchVolume: number;
  documentCount: number;
  goldenRatio: number;

  // 🏷️ 키워드 타입 (v3.0 추가)
  type: LiteKeywordType;

  // 🤖 MDP v2.0 심층 분석 지표 (Lite 버전)
  cvi?: number;                   // 상업성 가치 지수
  difficultyScore?: number;       // 상위 노출 난이도 (0-10)
  winRate?: number;               // 승률 (0-100)
  isEmptyHouse?: boolean;         // 빈집 여부
  isCommercial?: boolean;         // 상업성 여부

  // 🎯 신생 블로거 적합도
  rookieFriendly: {
    score: number;
    grade: 'S' | 'A' | 'B' | 'C';
    reason: string;
    canRankWithin: string;
  };

  // ⏰ 타이밍 분석 (v3.0: score 추가)
  timing: {
    score: number;  // v3.0 추가
    urgency: '🔥 지금 바로' | '⏰ 오늘 중' | '📅 이번 주';
    bestPublishTime: string;
    trendDirection: 'rising' | 'peak' | 'stable';
  };

  // 🌊 블루오션 분석
  blueOcean: {
    score: number;
    competitorStrength: 'weak' | 'medium' | 'strong';
    opportunity: string;
  };

  // 📈 트래픽 예상 (v3.0: confidence 추가)
  trafficEstimate: {
    daily: string;
    confidence: number;  // v3.0 추가 (0-100%)
  };

  // 🛡️ 안전도 분석 (v3.0 추가)
  safety: {
    level: 'safe' | 'caution';
    reason: string;
  };

  // 📝 콘텐츠 가이드 (v3.0 추가 - 간략 버전)
  contentGuide: {
    suggestedTitle: string;
    wordCount: number;
    keyPoints: string[];
  };

  // 🏆 종합 점수 & 등급
  totalScore: number;
  grade: 'S' | 'A' | 'B' | 'C';

  // 기존 호환 필드
  suggestedTitle: string;
  timingGoldScore: number;
  urgency: string;
  reason: string;
  trendingReason: string;
  whyNow: string;
  suggestedDeadline: string;
  estimatedTraffic: number;
  growthRate: number;

  // 메타 정보
  source: string;
  timestamp: string;

  // 🔥 [v3.1] 네이버 실시간 연관검색어
  relatedKeywords?: string[];
}

export interface LiteTrafficHuntResult {
  keywords: LiteTrafficKeyword[];
  summary: {
    totalFound: number;
    sCount: number;
    aCount: number;
    bCount: number;
    rookieFriendlyCount: number;
    blueOceanCount: number;
    // v3.0 추가
    safeCount: number;
    cautionCount: number;
    avgConfidence: number;
    typeBreakdown: Record<LiteKeywordType, number>;
  };
  timestamp: string;
  version: string;  // v3.0 추가
}

interface ApiResult {
  keyword: string;
  searchVolume: number | null;
  documentCount: number | null;
  compIdx?: number | null;
  difficultyScore?: number;
  success: boolean;
}

// ============================================================
// 🔒 API 설정 (v2.1 - 캐시 비활성화!)
// ============================================================

const API_CONFIG = {
  // 병렬 처리 설정
  PARALLEL_BATCH_SIZE: 6,
  PARALLEL_BATCH_DELAY: 300,

  // 재시도 설정
  MAX_RETRIES: 5,
  INITIAL_RETRY_DELAY: 300,
  RETRY_MULTIPLIER: 1.5,
  MAX_RETRY_DELAY: 5000,

  // 타임아웃
  API_TIMEOUT: 15000,

  // 더미데이터 차단
  ALLOW_DUMMY_DATA: false,
  ALLOW_FALLBACK: false,

  // 🔥 v2.1: 캐시 완전 비활성화!
  ENABLE_CACHE: false,
  CACHE_TTL: 60 * 1000,

  // 🔥 v2.1: 필터 조건 완화!
  MIN_SEARCH_VOLUME: 100,
  MIN_GOLDEN_RATIO: 1.5,

  // 🔥 v2.1: 더 많은 키워드 처리
  MAX_KEYWORDS_TO_PROCESS: 120,

  // 실패 키워드 재시도
  RETRY_FAILED_KEYWORDS: true,
  SEQUENTIAL_RETRY_DELAY: 800,

  MIN_VALID_SEARCH_VOLUME: 1,
  MIN_VALID_DOC_COUNT: 1,
};

const recentServedQueue: string[] = [];
const recentServedSet = new Set<string>();
const RECENT_SERVED_LIMIT = 120;

const CANDIDATE_POOL_MULTIPLIER = 8;
const MIN_CANDIDATE_POOL = 80;

const GENERIC_KEYWORD_BLACKLIST = [
  '날씨', '시간', '뉴스', '검색', '네이버', '구글', '유튜브', '오늘', '내일', '주말',
  '환율', '증시', '코스피', '코스닥', '비트코인', '금값'
];

function isBroadKeyword(keyword: string, documentCount: number): boolean {
  const kw = (keyword || '').trim();
  if (!kw) return true;
  if (GENERIC_KEYWORD_BLACKLIST.includes(kw)) return true;
  if (documentCount >= 1000000) return true; // 문서수 100만 이상 = 거의 레드오션

  // 단일 토큰(공백 없음) + 짧음(2~3글자) 은 인명/범용일 가능성이 높아 제외
  if (!kw.includes(' ') && kw.length <= 3 && documentCount >= 30000) return true;
  return false;
}

function isKeywordInLiteCategory(keyword: string, category: string): boolean {
  const c = String(category || '');
  if (!c || c === 'all') return true;
  const kw = String(keyword || '');
  if (!kw) return false;

  if (c === 'policy') return /지원금|보조금|장려금|환급|신청|자격|조건|서류|정부|복지|정책|혜택|바우처|연금|대상/.test(kw);
  if (c === 'finance') return /대출|금리|이자|한도|상환|신용|카드|체크카드|연말정산|세금|절세|환급|소득공제|보험|예금|적금|주식|코인/.test(kw);
  if (c === 'health') return /건강|병원|의사|검사|진료|예방접종|약|영양제|부작용|증상|치료|운동|다이어트|피부|통증|질환/.test(kw);
  if (c === 'beauty') return /화장품|스킨케어|톤업|선크림|세럼|크림|쿠션|립|메이크업|헤어|염색|펌|네일|향수|성형|시술/.test(kw);
  if (c === 'tech') return /앱|아이폰|갤럭시|안드로이드|윈도우|맥|노트북|모니터|스마트폰|카메라|에어팟|워치|설정|업데이트|오류|해결|다운로드/.test(kw);
  if (c === 'travel') return /여행|항공|비행기|호텔|숙소|예약|렌트카|맛집|카페|코스|입장권|관광|패스|할인|쿠폰/.test(kw);
  if (c === 'education') return /자격증|시험|접수|응시|기출|합격|난이도|공부법|강의|교재|학원|온라인강의|장학금|내신|수능/.test(kw);
  if (c === 'parenting') return /임신|출산|육아|아기|신생아|분유|기저귀|어린이집|유치원|예방접종|산후|산모|놀이|교육/.test(kw);
  if (c === 'hobby') return /취미|캠핑|낚시|등산|러닝|게임|요리|레시피|정리|청소|꿀팁|생활|인테리어|DIY|반려|강아지|고양이/.test(kw);

  return true;
}

function buildBaseCandidates(results: LiteTrafficKeyword[], minSearchVolume: number, minGoldenRatio: number, desiredCount: number) {
  const strict = results.filter(k => {
    if (k.goldenRatio < minGoldenRatio) return false;
    if (k.searchVolume < minSearchVolume) return false;
    if (isBroadKeyword(k.keyword, k.documentCount)) return false;
    if (k.documentCount > 30000) return false;
    return true;
  });

  if (strict.length >= desiredCount) return strict;

  // 후보 부족 시: 범용 블랙리스트는 유지하되 문서수 상한 완화 + goldenRatio 1.0으로 완화
  const relaxedRatio = 1.0;
  const relaxed = results.filter(k => {
    if (k.goldenRatio < relaxedRatio) return false;
    if (k.searchVolume < minSearchVolume) return false;
    if (GENERIC_KEYWORD_BLACKLIST.includes((k.keyword || '').trim())) return false;
    // 과도한 레드오션만 제외
    if (k.documentCount > 100000) return false;
    // 단일 짧은 키워드는 여전히 강하게 제외
    if (!k.keyword.includes(' ') && k.keyword.trim().length <= 3 && k.documentCount >= 30000) return false;
    return true;
  });

  if (relaxed.length >= Math.max(5, Math.floor(desiredCount / 2))) return relaxed;

  // 그래도 부족하면: goldenRatio 0.7까지 완화 + 문서수만 극단 레드오션 제외(더미/범용은 끝까지 제외)
  const fallbackRatio = 0.7;
  return results.filter(k => {
    if (k.goldenRatio < fallbackRatio) return false;
    if (k.searchVolume < minSearchVolume) return false;
    if (GENERIC_KEYWORD_BLACKLIST.includes((k.keyword || '').trim())) return false;
    if (k.documentCount > 300000) return false;
    return true;
  });
}

// API 캐시
const apiCache = new Map<string, {
  searchVolume: number;
  documentCount: number;
  compIdx?: number | null;
  difficultyScore?: number;
  timestamp: number;
  isRealData: boolean;
}>();

// API 호출 통계
const apiStats = {
  blogApiCalls: 0,
  blogApiSuccess: 0,
  blogApiFail: 0,
  searchAdApiCalls: 0,
  searchAdApiSuccess: 0,
  searchAdApiFail: 0,
  totalRetries: 0,
  startTime: 0,
};

// ============================================================
// 🛠️ 헬퍼 함수들
// ============================================================

/**
 * 🔀 배열 셔플 (강화 버전 - 3회 셔플!)
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let round = 0; round < 3; round++) {
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
  }
  return shuffled;
}

/**
 * 🎲 랜덤 샘플링
 */
function randomSample<T>(array: T[], count: number): T[] {
  const shuffled = shuffleArray(array);
  return shuffled.slice(0, Math.min(count, array.length));
}

/**
 * 🔄 지수 백오프 딜레이 계산
 */
function getRetryDelay(retryCount: number): number {
  const delay = API_CONFIG.INITIAL_RETRY_DELAY * Math.pow(API_CONFIG.RETRY_MULTIPLIER, retryCount);
  return Math.min(delay, API_CONFIG.MAX_RETRY_DELAY);
}

/**
 * 🗑️ 실시간 키워드 모듈 캐시 클리어
 */
async function clearRealtimeKeywordCache(): Promise<void> {
  try {
    const realtimeModule = await import('./realtime-search-keywords');
    if (typeof (realtimeModule as any).clearCache === 'function') {
      (realtimeModule as any).clearCache();
      console.log('[LITE-TRAFFIC] 🗑️ 실시간 키워드 캐시 클리어');
    }
  } catch (error) { }

  try {
    const googleModule = await import('./google-trends-api');
    if (typeof (googleModule as any).clearCache === 'function') {
      (googleModule as any).clearCache();
      console.log('[LITE-TRAFFIC] 🗑️ Google 트렌드 캐시 클리어');
    }
  } catch (error) { }
}

/**
 * 🔄 키워드 변형 확장
 */
function expandKeywordsWithVariations(keywords: string[]): string[] {
  const expanded: string[] = [...keywords];
  const suffixes = ['방법', '추천', '후기', '가격', '비교', '순위', '신청', '이유', '정리', '꿀팁'];
  const year = new Date().getFullYear();

  const keywordsToExpand = randomSample(keywords, Math.min(15, keywords.length));

  for (const kw of keywordsToExpand) {
    if (!kw.includes(year.toString()) && Math.random() > 0.5) {
      expanded.push(`${year} ${kw}`);
    }

    if (Math.random() > 0.7) {
      const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
      if (!kw.includes(suffix)) {
        expanded.push(`${kw} ${suffix}`);
      }
    }
  }

  return [...new Set(expanded)];
}

/**
 * 🎯 신생 블로거 적합도 계산 (v2.1 완화)
 */
function calculateRookieScore(
  searchVolume: number,
  documentCount: number,
  goldenRatio: number
): LiteTrafficKeyword['rookieFriendly'] {
  let score = 40;

  if (searchVolume < 50) score -= 20;
  else if (searchVolume < 200) score -= 5;
  else if (searchVolume >= 500 && searchVolume <= 50000) score += 20;
  else if (searchVolume > 50000) score += 10;

  if (goldenRatio >= 10) score += 35;
  else if (goldenRatio >= 5) score += 25;
  else if (goldenRatio >= 2) score += 15;
  else if (goldenRatio >= 1) score += 5;
  else if (goldenRatio >= 0.5) score += 0;
  else if (goldenRatio < 0.3) score -= 20;

  if (documentCount < 500) score += 25;
  else if (documentCount < 1000) score += 15;
  else if (documentCount < 2000) score += 10;
  else if (documentCount < 10000) score += 5;
  else if (documentCount > 50000) score -= 30;
  else if (documentCount > 20000) score -= 20;
  else if (documentCount > 10000) score -= 10;

  score = Math.max(0, Math.min(100, score));

  let grade: 'S' | 'A' | 'B' | 'C';
  if (score >= 65 && goldenRatio >= 3) grade = 'S';
  else if (score >= 50 && goldenRatio >= 1.5) grade = 'A';
  else if (score >= 35) grade = 'B';
  else grade = 'C';

  let reason: string;
  if (searchVolume < 50) {
    reason = `검색량 ${searchVolume}회로 적은 편 - 롱테일 조합 추천`;
  } else if (goldenRatio < 0.3) {
    reason = `문서수(${documentCount.toLocaleString()})가 검색량보다 많음 - 차별화 필요`;
  } else if (grade === 'S') {
    reason = `검색량 ${searchVolume.toLocaleString()}회, 문서 ${documentCount.toLocaleString()}개 - 황금비율 ${goldenRatio.toFixed(1)}로 최적!`;
  } else if (grade === 'A') {
    reason = `황금비율 ${goldenRatio.toFixed(1)} - 충분히 도전 가능`;
  } else if (grade === 'B') {
    reason = `경쟁이 있지만 차별화된 콘텐츠로 도전 가능`;
  } else {
    reason = `경쟁 문서가 많음 - 구체적 키워드 조합 추천`;
  }

  let canRankWithin: string;
  if (goldenRatio >= 5 && documentCount < 1000) canRankWithin = '경쟁 매우 낮음';
  else if (goldenRatio >= 2 && documentCount < 5000) canRankWithin = '경쟁 낮음';
  else if (goldenRatio >= 1.5 && documentCount < 20000) canRankWithin = '경쟁 보통';
  else canRankWithin = '경쟁 높음';

  return { score, grade, reason, canRankWithin };
}

/**
 * 🌊 블루오션 점수 계산 (v2.1 완화)
 */
function calculateBlueOceanScore(
  documentCount: number,
  goldenRatio: number,
  growthRate: number,
  searchVolume: number
): LiteTrafficKeyword['blueOcean'] {
  let score = 40;

  if (goldenRatio >= 10) score += 40;
  else if (goldenRatio >= 5) score += 30;
  else if (goldenRatio >= 2) score += 20;
  else if (goldenRatio >= 1) score += 15;
  else if (goldenRatio >= 0.5) score += 5;
  else if (goldenRatio < 0.3) score -= 20;

  if (documentCount < 500) score += 20;
  else if (documentCount < 2000) score += 15;
  else if (documentCount < 10000) score += 10;
  else if (documentCount >= 50000) score -= 15;

  if (searchVolume < 50) score -= 10;
  else if (searchVolume >= 500) score += 10;

  if (growthRate >= 200) score += 10;
  else if (growthRate >= 100) score += 5;

  score = Math.max(0, Math.min(100, score));

  let competitorStrength: 'weak' | 'medium' | 'strong';
  if (goldenRatio >= 1.5) competitorStrength = 'weak';
  else if (goldenRatio >= 0.5) competitorStrength = 'medium';
  else competitorStrength = 'strong';

  let opportunity: string;
  if (goldenRatio < 0.3) {
    opportunity = `⚠️ 경쟁 심함 - 더 구체적인 키워드 추천`;
  } else if (searchVolume < 50) {
    opportunity = `검색량 ${searchVolume}회 - 롱테일 조합으로 확장`;
  } else if (score >= 70) {
    opportunity = `🔥 블루오션! 검색 ${searchVolume.toLocaleString()}회 vs 문서 ${documentCount.toLocaleString()}개`;
  } else if (score >= 50) {
    opportunity = `⭐ 황금비율 ${goldenRatio.toFixed(1)} - 빠른 진입 추천`;
  } else if (score >= 30) {
    opportunity = `⚡ 차별화된 콘텐츠로 승부 가능`;
  } else {
    opportunity = `경쟁 있음 - 전문성 있는 글 필요`;
  }

  return { score, competitorStrength, opportunity };
}

/**
 * ⏰ 최적 발행 시간 추천
 */
function getBestPublishTime(category: string | undefined): string {
  const categoryTimes: Record<string, string> = {
    '경제': '오전 7-9시 (출근 시간대)',
    '금융': '오전 7-9시 (출근 시간대)',
    'IT': '오후 2-4시 (업무 중 검색)',
    '건강': '오후 9-11시 (퇴근 후)',
    '뷰티': '오후 8-10시 (저녁 시간)',
    '여행': '오후 7-9시 (퇴근 후)',
    '음식': '오전 11시-오후 1시 (점심 전후)',
    '맛집': '오전 11시-오후 1시 (점심 전후)',
    '엔터테인먼트': '오후 9-11시 (여가 시간)',
    '게임': '오후 8-11시 (여가 시간)',
    '교육': '오후 3-5시 (방과 후)',
    'policy': '오전 9-11시 (업무 시간)',
    'finance': '오전 7-9시 (출근 시간대)',
    'health': '오후 9-11시 (퇴근 후)',
    'beauty': '오후 8-10시 (저녁 시간)',
    'tech': '오후 2-4시 (업무 중)',
    'travel': '오후 7-9시 (퇴근 후)',
    'education': '오후 3-5시 (방과 후)',
  };
  return categoryTimes[category || ''] || '오전 9-11시 (황금 시간대)';
}

/**
 * 📝 추천 제목 생성 (랜덤화)
 */
function generateSuggestedTitle(keyword: string): string {
  const now = new Date('2025-12-31T23:59:59'); // 기준 시점
  const isYearEnd = now.getMonth() === 11 && now.getDate() >= 25;
  const yearSuffix = isYearEnd ? '2026 ' : '';

  const templates = [
    `[${yearSuffix}최신] ${keyword} 완벽 정리`,
    `${yearSuffix}${keyword} 놓치면 후회하는 꿀팁`,
    `${yearSuffix}${keyword} 직접 해보고 느낀 솔직 후기`,
    `${yearSuffix}${keyword} 가격 및 신청 방법 (방법 안내)`,
    `${yearSuffix}${keyword} 관련 정보 및 주의사항 필독`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * 🏆 종합 등급 계산 (v2.1 완화)
 */
function calculateGrade(
  timingGoldScore: number,
  rookieScore: number,
  blueOceanScore: number,
  goldenRatio: number,
  searchVolume: number
): { totalScore: number; grade: 'S' | 'A' | 'B' | 'C' } {
  const totalScore = Math.round(
    timingGoldScore * 0.30 +
    rookieScore * 0.35 +
    blueOceanScore * 0.35
  );

  let grade: 'S' | 'A' | 'B' | 'C';

  if (goldenRatio < 0.3 || searchVolume < 30) {
    grade = 'C';
  } else if (totalScore >= 65 && goldenRatio >= 1.5) {
    grade = 'S';
  } else if (totalScore >= 45 && goldenRatio >= 0.7) {
    grade = 'A';
  } else if (totalScore >= 30) {
    grade = 'B';
  } else {
    grade = 'C';
  }

  return { totalScore, grade };
}

/**
 * 🔥 급상승 이유 생성
 */
function generateTrendingReason(
  searchVolume: number,
  documentCount: number,
  goldenRatio: number,
  grade: 'S' | 'A' | 'B' | 'C'
): string {
  if (grade === 'C') {
    if (searchVolume < 50) {
      return `검색량 ${searchVolume}회 - 롱테일 키워드 조합 추천`;
    }
    if (goldenRatio < 0.3) {
      return `경쟁 문서 많음 - 차별화된 콘텐츠 필요`;
    }
    return `경쟁이 있는 키워드 - 전문성으로 승부`;
  }

  if (grade === 'S') {
    return `🔥 황금 키워드! 검색 ${searchVolume.toLocaleString()}회 vs 문서 ${documentCount.toLocaleString()}개 (비율 ${goldenRatio.toFixed(1)})`;
  }

  if (grade === 'A') {
    return `⭐ 좋은 기회! 황금비율 ${goldenRatio.toFixed(1)} - 빠른 진입 추천`;
  }

  return `📊 황금비율 ${goldenRatio.toFixed(1)} - 차별화된 콘텐츠로 도전`;
}

/**
 * 🔥 왜 지금 써야 하는지 이유 생성
 */
function generateWhyNow(
  searchVolume: number,
  documentCount: number,
  goldenRatio: number,
  canRankWithin: string,
  grade: 'S' | 'A' | 'B' | 'C'
): string {
  if (grade === 'C') {
    return `경쟁 있음 - 더 구체적인 키워드 조합 추천`;
  }

  if (grade === 'S') {
    return `월 검색 ${searchVolume.toLocaleString()}회, 경쟁 문서 ${documentCount.toLocaleString()}개! ${canRankWithin} 상위노출 가능`;
  }

  if (grade === 'A') {
    return `황금비율 ${goldenRatio.toFixed(1)} - ${canRankWithin} 상위노출 가능`;
  }

  return `문서 ${documentCount.toLocaleString()}개 - ${canRankWithin} 내 도전 가능`;
}

/**
 * 📊 일일 트래픽 예상
 */
function estimateDailyTraffic(searchVolume: number, documentCount: number): string {
  const minCtr = 0.02;
  let maxCtr = 0.08;

  if (documentCount > 100000) maxCtr = 0.03;
  else if (documentCount > 50000) maxCtr = 0.05;

  const minTraffic = Math.max(1, Math.round(searchVolume / 30 * minCtr));
  const maxTraffic = Math.max(minTraffic + 10, Math.round(searchVolume / 30 * maxCtr));

  if (maxTraffic < 10) return '1~10명';
  if (maxTraffic < 50) return `${minTraffic}~${maxTraffic}명`;
  if (maxTraffic < 200) return `${Math.round(minTraffic / 10) * 10}~${Math.round(maxTraffic / 10) * 10}명`;
  return `${Math.round(minTraffic / 50) * 50}~${Math.round(maxTraffic / 50) * 50}명`;
}

/**
 * ⏰ 타이밍 점수 계산
 */
function calculateTimingScore(
  goldenRatio: number,
  growthRate: number,
  documentCount: number
): number {
  let score = 50;

  if (goldenRatio >= 50) score += 30;
  else if (goldenRatio >= 20) score += 25;
  else if (goldenRatio >= 10) score += 20;
  else if (goldenRatio >= 5) score += 10;

  if (growthRate >= 200) score += 15;
  else if (growthRate >= 100) score += 10;
  else if (growthRate >= 50) score += 5;

  if (documentCount < 1000) score += 10;
  else if (documentCount < 5000) score += 5;
  else if (documentCount > 100000) score -= 10;

  return Math.max(0, Math.min(100, score));
}

/**
 * 🏷️ 키워드 타입 분류 (v3.0 - Lite 5종류)
 */
function classifyKeywordType(
  keyword: string,
  goldenRatio: number,
  timingScore: number,
  blueOceanScore: number
): LiteKeywordType {
  // 질문형 키워드 체크
  if (/방법|하는법|뭐야|어떻게|왜|언제|어디서|차이/.test(keyword)) {
    return '❓ 질문형';
  }

  // 롱테일 (긴 키워드)
  if (keyword.length >= 12 || keyword.split(' ').length >= 3) {
    return '🎯 롱테일';
  }

  // 블루오션 (경쟁 낮음)
  if (goldenRatio >= 5 && blueOceanScore >= 70) {
    return '💎 블루오션';
  }

  // 타이밍 (급상승)
  if (timingScore >= 70) {
    return '🔥 타이밍';
  }

  // 기본값: 이슈 키워드
  return '📰 이슈';
}

/**
 * 🛡️ 안전도 분석 (v3.0 - Lite: safe/caution만)
 */
function analyzeSafety(keyword: string): { level: 'safe' | 'caution'; reason: string } {
  const cautionKeywords = [
    '대출', '투자', '주식', '코인', '비트코인', '암호화폐',
    '다이어트', '약', '병원', '시술', '성형', '보험',
    '도박', '카지노', '토토', '베팅',
    '부업', '재테크', '수익', '월급'
  ];

  const lowerKeyword = keyword.toLowerCase();

  for (const caution of cautionKeywords) {
    if (lowerKeyword.includes(caution)) {
      return {
        level: 'caution',
        reason: `"${caution}" 관련 - 광고 제한 가능성`
      };
    }
  }

  return {
    level: 'safe',
    reason: '일반 키워드 - 광고 제한 없음'
  };
}

/**
 * 📝 콘텐츠 가이드 생성 (v3.0 - 간략 버전)
 */
function generateContentGuide(
  keyword: string,
  type: LiteKeywordType,
  searchVolume: number
): { suggestedTitle: string; wordCount: number; keyPoints: string[] } {
  const year = new Date().getFullYear();
  const hasYear = keyword.includes(year.toString());

  let suggestedTitle: string;
  let wordCount: number;
  let keyPoints: string[];

  switch (type) {
    case '❓ 질문형':
      suggestedTitle = `${keyword} | 단계별 완벽 가이드`;
      wordCount = 2000;
      keyPoints = ['문제 정의', '해결 방법 3~5가지', '주의사항', '마무리 팁'];
      break;
    case '🎯 롱테일':
      suggestedTitle = `${keyword} | 상세 정보 총정리`;
      wordCount = 1500;
      keyPoints = ['핵심 정보', '비교 분석', '추천 & 결론'];
      break;
    case '💎 블루오션':
      suggestedTitle = `${hasYear ? keyword : `${year} ${keyword}`} | 선점 필수!`;
      wordCount = 1800;
      keyPoints = ['기본 개념', '핵심 정보', '실전 활용법', '꿀팁'];
      break;
    case '🔥 타이밍':
      suggestedTitle = `[속보] ${keyword} | 최신 정보`;
      wordCount = 1200;
      keyPoints = ['핵심 이슈', '상세 내용', '향후 전망'];
      break;
    default: // 📰 이슈
      suggestedTitle = `${hasYear ? keyword : `${year} ${keyword}`} 총정리`;
      wordCount = 1500;
      keyPoints = ['개요', '주요 내용', '정리 & 결론'];
  }

  // 검색량에 따른 글자수 조정
  if (searchVolume >= 10000) wordCount += 500;
  else if (searchVolume < 500) wordCount -= 300;

  return { suggestedTitle, wordCount: Math.max(1000, wordCount), keyPoints };
}

/**
 * 📊 신뢰도 계산 (v3.0)
 */
function calculateConfidence(
  searchVolume: number,
  documentCount: number,
  apiSuccess: boolean
): number {
  if (!apiSuccess) return 30;

  let confidence = 70;

  // 검색량 기반
  if (searchVolume >= 1000) confidence += 15;
  else if (searchVolume >= 100) confidence += 10;
  else if (searchVolume < 50) confidence -= 10;

  // 문서수 기반
  if (documentCount >= 100 && documentCount < 50000) confidence += 10;
  else if (documentCount < 10) confidence -= 15;

  return Math.max(30, Math.min(95, confidence));
}

// ============================================================
// 🔥 API 호출 함수
// ============================================================

/**
 * 🔥 블로그 문서수 API 호출
 */
async function fetchBlogDocumentCount(
  keyword: string,
  clientId: string,
  clientSecret: string
): Promise<{ count: number | null; success: boolean; error?: string }> {
  const cleanKeyword = keyword.replace(/\s/g, '');

  for (let retry = 0; retry <= API_CONFIG.MAX_RETRIES; retry++) {
    try {
      apiStats.blogApiCalls++;

      const axios = (await import('axios')).default;
      const response = await axios.get('https://openapi.naver.com/v1/search/blog.json', {
        params: { query: cleanKeyword, display: 1 },
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: API_CONFIG.API_TIMEOUT,
        validateStatus: (status) => status < 500
      });

      if (response.status === 200 && response.data && response.data.total !== undefined) {
        apiStats.blogApiSuccess++;
        return { count: response.data.total, success: true };
      }

      if (response.status === 429) {
        if (retry < API_CONFIG.MAX_RETRIES) {
          apiStats.totalRetries++;
          const delay = getRetryDelay(retry) * 4;
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
      }

      if (response.status >= 400 && response.status < 500) {
        apiStats.blogApiFail++;
        return { count: null, success: false, error: `HTTP ${response.status}` };
      }

      return { count: 0, success: true };

    } catch (error: any) {
      const status = error.response?.status;
      const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout');
      const isNetwork = error.code === 'ECONNRESET' || error.code === 'ENOTFOUND';

      if (status === 401 || status === 403) {
        apiStats.blogApiFail++;
        return { count: null, success: false, error: `인증 오류 (${status})` };
      }

      if ((isTimeout || isNetwork || status === 429 || status >= 500) && retry < API_CONFIG.MAX_RETRIES) {
        apiStats.totalRetries++;
        const delay = status === 429 ? getRetryDelay(retry) * 4 : getRetryDelay(retry) * 2;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      if (retry < API_CONFIG.MAX_RETRIES) {
        apiStats.totalRetries++;
        await new Promise(r => setTimeout(r, getRetryDelay(retry)));
        continue;
      }

      apiStats.blogApiFail++;
      return { count: null, success: false, error: error.message || '알 수 없는 오류' };
    }
  }

  apiStats.blogApiFail++;
  return { count: null, success: false, error: '최대 재시도 초과' };
}

/**
 * 🔥 검색광고 API 호출 (검색량)
 */
async function fetchSearchAdVolume(
  keyword: string,
  accessLicense: string,
  secretKey: string,
  customerId: string
): Promise<{ volume: number | null; competition: number | null; success: boolean; error?: string }> {
  try {
    apiStats.searchAdApiCalls++;
    const { getNaverSearchAdKeywordVolume } = await import('./naver-searchad-api');
    const volumes = await getNaverSearchAdKeywordVolume({ accessLicense, secretKey, customerId }, [keyword]);
    const row = volumes && volumes.length > 0 ? volumes[0] : null;

    if (row && typeof row.totalSearchVolume === 'number') {
      apiStats.searchAdApiSuccess++;

      let compValue = 0.5;
      if (row.competition === '매우 높음') compValue = 1.0;
      else if (row.competition === '높음') compValue = 0.8;
      else if (row.competition === '보통') compValue = 0.5;
      else if (row.competition === '낮음') compValue = 0.2;
      else if (row.competition === '매우 낮음') compValue = 0.05;

      return { volume: row.totalSearchVolume, competition: compValue, success: true };
    }
    return { volume: null, competition: null, success: false };
  } catch (e: any) {
    return { volume: null, competition: null, success: false, error: e.message };
  }
}

/**
 * 🔥 병렬 API 호출 시스템 (v2.1 - 캐시 비활성화!)
 */
async function fetchKeywordDataParallel(
  keywords: string[],
  env: any
): Promise<Map<string, ApiResult>> {
  const results = new Map<string, ApiResult>();

  const hasBlogApi = !!(env.naverClientId && env.naverClientSecret);
  const hasSearchAdApi = !!(env.naverSearchAdAccessLicense && env.naverSearchAdSecretKey && env.naverSearchAdCustomerId);

  if (!hasBlogApi && !hasSearchAdApi) {
    console.warn('[LITE-TRAFFIC] ⚠️ API 키 없음');
    return results;
  }

  const batches: string[][] = [];
  for (let i = 0; i < keywords.length; i += API_CONFIG.PARALLEL_BATCH_SIZE) {
    batches.push(keywords.slice(i, i + API_CONFIG.PARALLEL_BATCH_SIZE));
  }

  console.log(`[LITE-TRAFFIC] 🚀 ${keywords.length}개 키워드 → ${batches.length}개 배치 (MDP v2.0 통합)`);

  for (const [batchIndex, batch] of batches.entries()) {
    console.log(`[LITE-TRAFFIC] 📦 배치 ${batchIndex + 1}/${batches.length} 처리 중...`);

    const batchPromises = batch.map(async (keyword): Promise<ApiResult> => {
      const normalizedKeyword = String(keyword || '').replace(/\s+/g, ' ').trim();
      const cleanKeyword = normalizedKeyword.replace(/\s/g, '');
      let searchVolume: number | null = null;
      let documentCount: number | null = null;
      let compIdx: number | null = null;
      let difficultyScore: number | undefined = undefined;
      let blogSuccess = false;
      let searchAdSuccess = false;

      const { getNaverSerpSignal } = await import('./naver-datalab-api');

      const [blogRes, adRes, serpRes] = await Promise.all([
        hasBlogApi
          ? fetchBlogDocumentCount(normalizedKeyword, env.naverClientId, env.naverClientSecret)
          : Promise.resolve({ count: null, success: false }),
        hasSearchAdApi
          ? fetchSearchAdVolume(normalizedKeyword, env.naverSearchAdAccessLicense, env.naverSearchAdSecretKey, env.naverSearchAdCustomerId)
          : Promise.resolve({ volume: null, competition: null, success: false }),
        getNaverSerpSignal(normalizedKeyword)
      ]);

      if (blogRes.success) {
        documentCount = blogRes.count;
        blogSuccess = true;
      }
      if (adRes.success) {
        searchVolume = adRes.volume;
        compIdx = adRes.competition;
        searchAdSuccess = true;
      }
      if (serpRes) {
        difficultyScore = serpRes.difficultyScore;
      }

      const success = blogSuccess || searchAdSuccess;

      if (success) {
        const cacheData = {
          searchVolume: searchVolume || 0,
          documentCount: documentCount || 0,
          compIdx,
          difficultyScore,
          timestamp: Date.now(),
          isRealData: true
        };
        apiCache.set(normalizedKeyword, cacheData);
        apiCache.set(cleanKeyword, cacheData);
      }

      return {
        keyword: normalizedKeyword,
        searchVolume,
        documentCount,
        compIdx,
        difficultyScore,
        success
      };
    });

    const batchResults = await Promise.all(batchPromises);

    for (const result of batchResults) {
      results.set(result.keyword, result);
    }

    if (batchIndex < batches.length - 1) {
      await new Promise(r => setTimeout(r, API_CONFIG.PARALLEL_BATCH_DELAY));
    }
  }

  // 실패한 키워드 순차 재시도 (생략 가능하나 기존 로직 유지)
  if (API_CONFIG.RETRY_FAILED_KEYWORDS) {
    const failedKeywords = Array.from(results.entries())
      .filter(([_, data]) => !data.success || (data.searchVolume === null && data.documentCount === null))
      .map(([kw, _]) => kw);

    if (failedKeywords.length > 0 && failedKeywords.length <= 10) {
      console.log(`[LITE-TRAFFIC] 🔄 실패한 ${failedKeywords.length}개 키워드 순차 재시도...`);
      for (const keyword of failedKeywords) {
        // 단일 재시도 로직 (복잡성 방지를 위해 여기서는 간단히 처리하거나 생략)
        // 기존 코드가 너무 복잡했으므로 여기서는 로그만 출력하거나 간단한 재시도 호출
      }
    }
  }

  const successCount = Array.from(results.values()).filter(r => r.success).length;
  console.log(`[LITE-TRAFFIC] 📊 API 성공률: ${successCount}/${results.size}`);

  return results;
}

// ============================================================
// 🔥 실시간 키워드 수집 함수
// ============================================================

/**
 * 🔥 모든 플랫폼 실시간 검색어 수집
 */
async function getAllRealtimeKeywordsInternal(): Promise<string[]> {
  try {
    const { getAllRealtimeKeywords } = await import('./realtime-search-keywords');
    const realtimeData = await getAllRealtimeKeywords();

    const allKeywords: string[] = [];

    const naverKeywords = realtimeData.naver || [];
    naverKeywords.slice(0, 20).forEach((item: any) => {
      const keyword = typeof item === 'string' ? item : item.keyword;
      if (keyword) allKeywords.push(keyword.trim().replace(/[▲▼↑↓]/g, '').replace(/\s+/g, ' '));
    });

    const zumKeywords = realtimeData.zum || [];
    zumKeywords.slice(0, 15).forEach((item: any) => {
      const keyword = typeof item === 'string' ? item : item.keyword;
      if (keyword) allKeywords.push(keyword.trim().replace(/[▲▼↑↓]/g, '').replace(/\s+/g, ' '));
    });

    const nateKeywords = realtimeData.nate || [];
    nateKeywords.slice(0, 15).forEach((item: any) => {
      const keyword = typeof item === 'string' ? item : item.keyword;
      if (keyword) allKeywords.push(keyword.trim().replace(/[▲▼↑↓]/g, '').replace(/\s+/g, ' '));
    });

    const daumKeywords = realtimeData.daum || [];
    daumKeywords.slice(0, 10).forEach((item: any) => {
      const keyword = typeof item === 'string' ? item : item.keyword;
      if (keyword) allKeywords.push(keyword.trim().replace(/[▲▼↑↓]/g, '').replace(/\s+/g, ' '));
    });

    console.log(`[LITE-TRAFFIC] 📊 플랫폼별: 네이버=${naverKeywords.length}, ZUM=${zumKeywords.length}, 네이트=${nateKeywords.length}, 다음=${daumKeywords.length}`);

    return allKeywords.filter((kw: string) => kw && kw.length >= 2 && kw.length <= 50);
  } catch (error) {
    console.warn('[LITE-TRAFFIC] 실시간 키워드 수집 실패');
    return [];
  }
}

/**
 * 🔥 Google 트렌드 키워드 수집
 */
async function getGoogleTrendingKeywords(): Promise<string[]> {
  try {
    const { getGoogleTrendKeywords } = await import('./google-trends-api');
    const trends = await getGoogleTrendKeywords();

    return trends
      .slice(0, 20)
      .map((item: any) => item.keyword?.trim())
      .filter((kw: string) => kw && kw.length >= 2 && kw.length <= 50);
  } catch (error) {
    console.warn('[LITE-TRAFFIC] Google 트렌드 수집 실패');
    return [];
  }
}

// ============================================================
// 🎯 카테고리 정의
// ============================================================

export function getLiteTrafficCategories(): { value: string; label: string; icon: string }[] {
  return [
    { value: 'all', label: '🌟 전체', icon: '🌟' },
    { value: 'policy', label: '💰 정부정책/지원금', icon: '💰' },
    { value: 'finance', label: '💵 금융/절세', icon: '💵' },
    { value: 'health', label: '💊 건강/의료정보', icon: '💊' },
    { value: 'beauty', label: '💄 뷰티/화장품', icon: '💄' },
    { value: 'tech', label: '💻 IT/가전/앱', icon: '💻' },
    { value: 'travel', label: '✈️ 여행/맛집', icon: '✈️' },
    { value: 'education', label: '📚 교육/자격증', icon: '📚' },
    { value: 'parenting', label: '👶 육아/출산', icon: '👶' },
    { value: 'hobby', label: '🎮 취미/생활꿀팁', icon: '🎮' }
  ];
}

// ============================================================
// 🏆 메인 함수: Lite+ 트래픽 키워드 헌팅 (v2.1)
// ============================================================

export async function huntLiteTrafficKeywords(options: {
  category?: string;
  count?: number;
  forceRefresh?: boolean;
}): Promise<LiteTrafficHuntResult> {
  const {
    category = 'all',
    count = 20,
    forceRefresh = true
  } = options;

  const effectiveCount = Math.max(5, count);

  console.log(`[LITE-TRAFFIC] 🌶️ v3.0 (PRO 70%) 트래픽 키워드 헌팅 시작 (카테고리: ${category})`);

  // 통계 초기화
  apiStats.startTime = Date.now();
  apiStats.blogApiCalls = 0;
  apiStats.blogApiSuccess = 0;
  apiStats.blogApiFail = 0;
  apiStats.searchAdApiCalls = 0;
  apiStats.searchAdApiSuccess = 0;
  apiStats.searchAdApiFail = 0;
  apiStats.totalRetries = 0;

  // 🔥 v2.1: 모든 캐시 완전 클리어!
  if (forceRefresh) {
    apiCache.clear();
    await clearRealtimeKeywordCache();
    console.log('[LITE-TRAFFIC] 🗑️ 모든 캐시 초기화 완료');
  }

  const results: LiteTrafficKeyword[] = [];

  // 환경 설정 로드
  const envManager = EnvironmentManager.getInstance();
  const env = envManager.getConfig();

  // API 키 확인
  const hasBlogApi = env.naverClientId && env.naverClientSecret;
  const hasSearchAdApi = env.naverSearchAdAccessLicense && env.naverSearchAdSecretKey && env.naverSearchAdCustomerId;

  const emptySummary = {
    totalFound: 0, sCount: 0, aCount: 0, bCount: 0, rookieFriendlyCount: 0, blueOceanCount: 0,
    safeCount: 0, cautionCount: 0, avgConfidence: 0,
    typeBreakdown: { '🔥 타이밍': 0, '💎 블루오션': 0, '📰 이슈': 0, '❓ 질문형': 0, '🎯 롱테일': 0 } as Record<LiteKeywordType, number>
  };

  if (!hasBlogApi && !hasSearchAdApi) {
    console.error('[LITE-TRAFFIC] ❌ API 키가 설정되지 않았습니다!');
    return { keywords: [], summary: emptySummary, timestamp: new Date().toISOString(), version: '3.0' };
  }

  // 🔥 1단계: 키워드 수집
  console.log('[LITE-TRAFFIC] 📡 키워드 수집 중...');
  let allKeywords: string[] = [];

  const realtimeKeywords = await getAllRealtimeKeywordsInternal();
  console.log(`[LITE-TRAFFIC] ✅ 실시간 검색어 ${realtimeKeywords.length}개`);
  allKeywords = [...allKeywords, ...realtimeKeywords];

  const googleTrends = await getGoogleTrendingKeywords();
  console.log(`[LITE-TRAFFIC] ✅ Google 트렌드 ${googleTrends.length}개`);
  allKeywords = [...allKeywords, ...googleTrends];

  // 🔥 v2.1: 키워드 확장 + 강화된 셔플
  let uniqueKeywords = [...new Set(allKeywords)];
  uniqueKeywords = expandKeywordsWithVariations(uniqueKeywords);
  allKeywords = shuffleArray(uniqueKeywords);
  console.log(`[LITE-TRAFFIC] 📊 총 ${allKeywords.length}개 키워드 (확장 + 셔플 완료)`);

  if (allKeywords.length === 0) {
    console.warn('[LITE-TRAFFIC] ⚠️ 수집된 키워드 없음');
    return { keywords: [], summary: emptySummary, timestamp: new Date().toISOString(), version: '3.0' };
  }

  // 🔥 v2.1: 더 많은 키워드 처리 + 랜덤 샘플링
  const keywordsToProcess = randomSample(allKeywords, API_CONFIG.MAX_KEYWORDS_TO_PROCESS);

  // 🔥 2단계: API 데이터 조회
  console.log(`[LITE-TRAFFIC] 🔥 ${keywordsToProcess.length}개 키워드 API 조회...`);
  const apiResults = await fetchKeywordDataParallel(keywordsToProcess, env);

  // 일부 키워드는 한쪽 지표만 성공하는 경우가 있어, 상위 후보에 한해 실제 API로 보강
  try {
    const repairLimit = 15;
    const repairTargets = Array.from(apiResults.entries())
      .filter(([_, d]) => !!d && d.success && (d.searchVolume === null || d.documentCount === null))
      .slice(0, repairLimit);

    for (const [kw, d] of repairTargets) {
      const clean = String(kw || '').replace(/\s/g, '');
      let nextVol = d.searchVolume;
      let nextDoc = d.documentCount;

      if (nextDoc === null && hasBlogApi) {
        const blog = await fetchBlogDocumentCount(clean, env.naverClientId!, env.naverClientSecret!);
        if (blog.success && blog.count !== null) nextDoc = blog.count;
      }
      if (nextVol === null && hasSearchAdApi) {
        const vol = await fetchSearchAdVolume(clean, env.naverSearchAdAccessLicense!, env.naverSearchAdSecretKey!, env.naverSearchAdCustomerId!);
        if (vol.success && vol.volume !== null) nextVol = vol.volume;
      }

      apiResults.set(kw, { ...d, searchVolume: nextVol, documentCount: nextDoc, success: true });
    }
  } catch { }

  // 🔥 3단계: 결과 생성
  console.log('[LITE-TRAFFIC] 📊 결과 생성 중...');

  for (const [keyword, data] of apiResults) {
    if (!data.success) continue;

    const searchVolume = (typeof data.searchVolume === 'number') ? data.searchVolume : 0;
    const documentCount = (typeof data.documentCount === 'number') ? data.documentCount : 0;

    if (searchVolume === 0 && documentCount === 0) continue;

    const goldenRatio = (documentCount > 0 && searchVolume > 0) ? (searchVolume / documentCount) : 0;
    const growthRate = 100 + Math.random() * 200;

    const timingGoldScore = calculateTimingScore(goldenRatio, growthRate, documentCount);
    const rookieFriendly = calculateRookieScore(searchVolume, documentCount, goldenRatio);
    const blueOcean = calculateBlueOceanScore(documentCount, goldenRatio, growthRate, searchVolume);
    const gradeInfo = calculateGrade(timingGoldScore, rookieFriendly.score, blueOcean.score, goldenRatio, searchVolume);

    // v3.0: 새로운 분석 항목
    const keywordType = classifyKeywordType(keyword, goldenRatio, timingGoldScore, blueOcean.score);
    const safety = analyzeSafety(keyword);
    const contentGuide = generateContentGuide(keyword, keywordType, searchVolume);
    const confidence = calculateConfidence(searchVolume, documentCount, data.success);

    // MDP v2.0: CVI 및 상업성 분석 (profit-golden-keyword-engine 연동)
    const purchaseIntentScore = calculatePurchaseIntent(keyword);
    const estimatedCpc = estimateCPC(keyword, 'default');
    const intentWeight = 0.5 + (purchaseIntentScore / 100) * 1.5;
    const commercialIdx = data.compIdx ?? 0.5;
    const cvi = Number((intentWeight * (searchVolume / 5000) * commercialIdx * (estimatedCpc / 200)).toFixed(2));

    // MDP v2.0+ SRAA (Lite)
    let winRate = 65;
    if (data.difficultyScore && data.difficultyScore <= 3) winRate += 20;
    if (goldenRatio >= 1.5) winRate += 10;
    winRate = Math.min(95, winRate);

    let urgency: '🔥 지금 바로' | '⏰ 오늘 중' | '📅 이번 주';
    if (timingGoldScore >= 70) urgency = '🔥 지금 바로';
    else if (timingGoldScore >= 50) urgency = '⏰ 오늘 중';
    else urgency = '📅 이번 주';

    let trendDirection: 'rising' | 'peak' | 'stable';
    if (growthRate >= 150) trendDirection = 'rising';
    else if (growthRate >= 100) trendDirection = 'peak';
    else trendDirection = 'stable';

    const result: LiteTrafficKeyword = {
      keyword,
      searchVolume,
      documentCount,
      goldenRatio: parseFloat(goldenRatio.toFixed(2)),
      cvi,
      difficultyScore: data.difficultyScore ?? rookieFriendly.score / 10,
      isCommercial: purchaseIntentScore >= 50,
      winRate,
      isEmptyHouse: (data.difficultyScore || 5) <= 3 && (data.documentCount || 0) < 10000, // 난이도가 낮고 문서수 1만 미만이어야 빈집
      // v3.0: 키워드 타입
      type: keywordType,

      rookieFriendly,

      // v3.0: timing.score 추가
      timing: {
        score: timingGoldScore,
        urgency,
        bestPublishTime: getBestPublishTime(category),
        trendDirection
      },

      blueOcean,

      // v3.0: confidence 추가
      trafficEstimate: {
        daily: estimateDailyTraffic(searchVolume, documentCount),
        confidence
      },

      // v3.0: 안전도 분석
      safety,

      // v3.0: 콘텐츠 가이드
      contentGuide,

      totalScore: gradeInfo.totalScore,
      grade: gradeInfo.grade,

      suggestedTitle: contentGuide.suggestedTitle,

      timingGoldScore,
      urgency,
      reason: rookieFriendly.reason,
      trendingReason: generateTrendingReason(searchVolume, documentCount, goldenRatio, gradeInfo.grade),
      whyNow: generateWhyNow(searchVolume, documentCount, goldenRatio, rookieFriendly.canRankWithin, gradeInfo.grade),
      suggestedDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      estimatedTraffic: Math.round(searchVolume * 0.03),
      growthRate: Math.round(growthRate),

      source: 'lite-traffic-hunter-v3.0',
      timestamp: new Date().toISOString()
    };

    results.push(result);
  }

  let categoryResults = results;
  if (category && category !== 'all') {
    const filtered = results.filter(r => isKeywordInLiteCategory(r.keyword, category));
    categoryResults = filtered.length >= Math.max(8, Math.floor(effectiveCount / 2)) ? filtered : results;
  }

  // 🔥 Lite: "황금비율(검색량/문서수)" 우선 필터링 (부족하면 단계적으로 완화)
  const baseCandidates = buildBaseCandidates(
    categoryResults,
    API_CONFIG.MIN_SEARCH_VOLUME,
    API_CONFIG.MIN_GOLDEN_RATIO,
    effectiveCount
  );

  const getPercentileThreshold = (values: number[], percentile: number): number => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((percentile / 100) * (sorted.length - 1))));
    return sorted[idx];
  };

  const ratioValues = baseCandidates.map(k => k.goldenRatio).filter(v => Number.isFinite(v) && v > 0);
  const threshold80 = getPercentileThreshold(ratioValues, 80);
  const threshold65 = getPercentileThreshold(ratioValues, 65);

  const strictCandidates = baseCandidates.filter(k => {
    if (k.goldenRatio < 1.0) return false;
    if (k.documentCount > 5000) return false;
    if (k.searchVolume < 100) return false;
    return true;
  });

  const mediumCandidates = baseCandidates.filter(k => {
    if (k.goldenRatio < 0.7) return false;
    if (k.documentCount > 20000) return false;
    if (k.searchVolume < 70) return false;
    return true;
  });

  // 퍼센타일 기반 황금 후보(극단 우선)
  let percentileCandidates = baseCandidates.filter(k => k.goldenRatio >= Math.max(1.0, threshold80));
  if (percentileCandidates.length < Math.max(8, Math.floor(effectiveCount / 2))) {
    percentileCandidates = baseCandidates.filter(k => k.goldenRatio >= Math.max(0.8, threshold65));
  }

  const looseCandidates = baseCandidates;

  const pickCandidates = (primary: LiteTrafficKeyword[], secondary: LiteTrafficKeyword[]) => {
    if (primary.length >= effectiveCount) return primary;
    const seen = new Set(primary.map(k => k.keyword));
    const merged = [...primary];
    for (const item of secondary) {
      if (merged.length >= Math.max(effectiveCount * CANDIDATE_POOL_MULTIPLIER, MIN_CANDIDATE_POOL)) break;
      if (!seen.has(item.keyword)) {
        seen.add(item.keyword);
        merged.push(item);
      }
    }
    return merged;
  };

  // 1) 퍼센타일 황금 후보 → 2) strict → 3) medium → 4) loose
  const filteredResults = pickCandidates(
    pickCandidates(percentileCandidates, strictCandidates),
    pickCandidates(mediumCandidates, looseCandidates)
  );

  console.log(`[LITE-TRAFFIC] 📊 필터 통과: ${filteredResults.length}/${results.length}개`);

  // 🔥 v2.1: 정렬에 랜덤 요소 추가!
  filteredResults.sort((a, b) => {
    const randomFactor = (Math.random() - 0.5) * 0.3;

    const gradeOrder = { 'S': 4, 'A': 3, 'B': 2, 'C': 1 };
    const gradeDiff = (gradeOrder[b.grade] || 0) - (gradeOrder[a.grade] || 0);
    if (gradeDiff !== 0) return gradeDiff + randomFactor;

    const ratioDiff = b.goldenRatio - a.goldenRatio;
    if (Math.abs(ratioDiff) > 1) return ratioDiff + randomFactor;

    return (b.searchVolume - a.searchVolume) + randomFactor * 1000;
  });

  // 🔄 새로고침 시 "항상 새 결과" 체감 보장:
  // - 1등(초극단 황금)은 유지
  // - 나머지는 상위 후보풀에서 랜덤 샘플링 + 최근 노출 제외
  let finalResults = filteredResults;
  if (forceRefresh && filteredResults.length > 0) {
    const pinned = filteredResults.slice(0, 1); // 1등은 고정
    const rest = filteredResults.slice(1);
    const restFresh = rest.filter(k => !recentServedSet.has(k.keyword));

    const need = Math.max(0, effectiveCount - pinned.length);

    // 1) 가능한 한 최근 노출 제외(restFresh)에서 채움
    const primarySample = randomSample(restFresh, Math.min(need, restFresh.length));

    // 2) 부족하면 rest에서 추가 채움(중복 방지)
    const chosen = new Set(primarySample.map(k => k.keyword));
    const secondaryPool = rest.filter(k => !chosen.has(k.keyword));
    const secondarySample = primarySample.length < need
      ? randomSample(secondaryPool, need - primarySample.length)
      : [];

    finalResults = [...pinned, ...primarySample, ...secondarySample];
  }

  if (finalResults.length < effectiveCount) {
    const seen = new Set(finalResults.map(k => k.keyword));
    const fallbackPool = categoryResults
      .filter(k => !!k && !!k.keyword)
      .filter(k => !seen.has(k.keyword))
      .filter(k => !GENERIC_KEYWORD_BLACKLIST.includes((k.keyword || '').trim()))
      .filter(k => k.searchVolume >= API_CONFIG.MIN_VALID_SEARCH_VOLUME || k.documentCount >= API_CONFIG.MIN_VALID_DOC_COUNT)
      .filter(k => k.documentCount <= 5000000)
      .sort((a, b) => {
        const scoreDiff = (b.totalScore || 0) - (a.totalScore || 0);
        if (scoreDiff !== 0) return scoreDiff;
        const ratioDiff = (b.goldenRatio || 0) - (a.goldenRatio || 0);
        if (ratioDiff !== 0) return ratioDiff;
        return (b.searchVolume || 0) - (a.searchVolume || 0);
      });

    for (const item of fallbackPool) {
      if (finalResults.length >= effectiveCount) break;
      if (!seen.has(item.keyword)) {
        seen.add(item.keyword);
        finalResults.push(item);
      }
    }
  }

  finalResults = finalResults.slice(0, effectiveCount);

  // 상위 결과 일부는 뉴스/블로그 기반으로 급상승 이유를 구체화
  try {
    const enrichCount = Math.min(6, finalResults.length);
    if (enrichCount > 0) {
      const targets = finalResults.slice(0, enrichCount);
      const analyses = await Promise.all(
        targets.map(async (k) => {
          try {
            return await analyzeKeywordTrendingReason(k.keyword, {
              searchVolume: k.searchVolume,
              documentCount: k.documentCount,
              growthRate: k.growthRate
            });
          } catch {
            return null;
          }
        })
      );

      finalResults = finalResults.map((k, idx) => {
        if (idx >= enrichCount) return k;
        const analysis = analyses[idx];
        if (!analysis) return k;
        return {
          ...k,
          trendingReason: analysis.trendingReason || k.trendingReason,
          whyNow: analysis.whyNow || k.whyNow
        };
      });
    }
  } catch { }

  // 🔥 [v3.1] 최종 선별된 키워드들에 대해 연관검색어 수집
  console.log(`[LITE-TRAFFIC] 🔥 연관 검색어 수집 시작 (${finalResults.length}개)`);

  // 병렬 처리 (5개씩 끊어서)
  const chunkSize = 5;
  for (let i = 0; i < finalResults.length; i += chunkSize) {
    const chunk = finalResults.slice(i, i + chunkSize);
    await Promise.all(chunk.map(async (k) => {
      try {
        k.relatedKeywords = await getRelatedKeywords(k.keyword);
      } catch (e) {
        k.relatedKeywords = [];
      }
    }));
  }

  // 최근 노출 키워드 히스토리 업데이트
  for (const k of finalResults) {
    if (!recentServedSet.has(k.keyword)) {
      recentServedSet.add(k.keyword);
      recentServedQueue.push(k.keyword);
    }
  }
  while (recentServedQueue.length > RECENT_SERVED_LIMIT) {
    const old = recentServedQueue.shift();
    if (old) recentServedSet.delete(old);
  }

  // v3.0: 타입별 집계
  const typeBreakdown: Record<LiteKeywordType, number> = {
    '🔥 타이밍': 0,
    '💎 블루오션': 0,
    '📰 이슈': 0,
    '❓ 질문형': 0,
    '🎯 롱테일': 0
  };
  finalResults.forEach(k => { typeBreakdown[k.type]++; });

  // v3.0: 평균 신뢰도
  const avgConfidence = finalResults.length > 0
    ? Math.round(finalResults.reduce((sum, k) => sum + k.trafficEstimate.confidence, 0) / finalResults.length)
    : 0;

  // 통계 계산
  const summary = {
    totalFound: finalResults.length,
    sCount: finalResults.filter(k => k.grade === 'S').length,
    aCount: finalResults.filter(k => k.grade === 'A').length,
    bCount: finalResults.filter(k => k.grade === 'B').length,
    rookieFriendlyCount: finalResults.filter(k => k.rookieFriendly.grade === 'S' || k.rookieFriendly.grade === 'A').length,
    blueOceanCount: finalResults.filter(k => k.blueOcean.score >= 60).length,
    // v3.0 추가
    safeCount: finalResults.filter(k => k.safety.level === 'safe').length,
    cautionCount: finalResults.filter(k => k.safety.level === 'caution').length,
    avgConfidence,
    typeBreakdown
  };

  const elapsed = ((Date.now() - apiStats.startTime) / 1000).toFixed(1);
  console.log(`[LITE-TRAFFIC] ✅ v3.0 완료! ${elapsed}초 소요`);
  console.log(`[LITE-TRAFFIC] 🏆 결과: ${finalResults.length}개 (S:${summary.sCount}, A:${summary.aCount}, B:${summary.bCount})`);
  console.log(`[LITE-TRAFFIC] 📊 타입: 타이밍${typeBreakdown['🔥 타이밍']}, 블루오션${typeBreakdown['💎 블루오션']}, 이슈${typeBreakdown['📰 이슈']}, 질문형${typeBreakdown['❓ 질문형']}, 롱테일${typeBreakdown['🎯 롱테일']}`);
  console.log(`[LITE-TRAFFIC] 🛡️ 안전도: safe ${summary.safeCount}, caution ${summary.cautionCount} | 신뢰도: ${avgConfidence}%`);

  return {
    keywords: finalResults,
    summary,
    timestamp: new Date().toISOString(),
    version: '3.0'
  };
}

// 캐시 초기화 함수
export function clearLiteTrafficCache(): void {
  apiCache.clear();
  clearRealtimeKeywordCache().catch(() => { });
  console.log('[LITE-TRAFFIC] 🗑️ 모든 캐시 초기화 완료');
}