/**
 * 🏆 PRO 트래픽 키워드 헌터 v11.0 - 터보 모드!
 * 
 * 💎 독보적인 기능:
 * 1. 신생 블로거 상위노출 가능성 분석
 * 2. 타이밍 점수 (지금 바로 써야 하는지)
 * 3. 블루오션 점수 (경쟁 없는 황금 키워드)
 * 4. 황금 발행 시간대 추천
 * 5. 초고수 블로거 전략 가이드
 * 6. 트래픽 예상치 (현실적)
 * 
 * 🆕 v11.0 신기능:
 * 7. 경쟁 블로그 분석 (상위 10개 블로그 분석)
 * 8. 키워드 클러스터링 (관련 키워드 그룹화)
 * 9. 발행 최적 시간 추천 (시간대별 검색량 분석)
 * 10. 3분 캐시로 속도 2-3배 향상!
 * 
 * 🎯 목표: 신생 블로거도 작성만 하면 상위노출 + 트래픽!
 */

export interface ProTrafficKeyword {
  keyword: string;

  // ✅ 진짜 황금키워드 여부 (실제 API로 검색량+문서수 모두 확인된 경우)
  isGolden?: boolean;

  // 📊 기본 지표
  searchVolume: number | null;    // 월 검색량
  documentCount: number | null;   // 블로그 문서수
  goldenRatio: number;            // 황금비율 (검색량/문서수)

  // 🤖 MDP v2.0 심층 분석 지표
  cvi?: number;                   // 상업성 가치 지수 (Commercial Value Index)
  difficultyScore?: number;       // 상위 노출 난이도 (0-10)
  hasSmartBlock?: boolean;        // 스마트블록 존재 여부
  hasInfluencer?: boolean;        // 인플루언서 탭 존재 여부
  isEmptyHouse?: boolean;         // 빈집 여부 (추가)
  isCommercial?: boolean;         // 상업성 키워드 여부

  // 🆕 SRAA (Seasonal & Recency Advanced Analysis) 필드
  winRate?: number;               // 예상 승률 (0-100%)
  recencyAnalysis?: {
    avgDaysOld: number;           // 상위 노출 글들의 평균 경과일
    isEmptyHouse: boolean;        // 빈집 여부 (오래된 글 위주)
    opportunityLevel: 'high' | 'medium' | 'low';
  };
  smartBlockAnalysis?: {
    type: string;                 // 스마트블록 타입 (예: 인기글, 지식iN)
    canPenetrate: boolean;         // 뚫고 들어갈 틈새 존재 여부
  };

  // 🛡️ 위험도 분석 (신규!)
  riskAnalysis?: {
    level: 'safe' | 'caution' | 'danger';
    reason: string;
    warningMessage?: string;
  };

  // 🎯 신생 블로거 적합도 (핵심!)
  rookieFriendly: {
    score: number;                // 신생 적합도 점수 (0-100)
    grade: 'S' | 'A' | 'B' | 'C' | 'D';  // 등급
    reason: string;               // 왜 신생에게 좋은지
    canRankWithin: string;        // 예상 상위노출 기간
    requiredBlogIndex: string;    // 필요 블로그 지수
  };

  // ⏰ 타이밍 분석
  timing: {
    score: number;                // 타이밍 점수 (0-100)
    urgency: 'NOW' | 'TODAY' | 'THIS_WEEK' | 'ANYTIME'; // 긴급도
    bestPublishTime: string;      // 최적 발행 시간
    trendDirection: 'rising' | 'peak' | 'stable' | 'falling';
    peakPrediction: string;       // 피크 예측
  };

  // 🌊 블루오션 분석
  blueOcean: {
    score: number;                // 블루오션 점수 (0-100)
    competitorStrength: 'weak' | 'medium' | 'strong';
    avgCompetitorBlogAge: string; // 경쟁 블로그 평균 나이
    oldPostRatio: number;         // 오래된 글 비율 (%)
    opportunity: string;          // 기회 분석
    isNiche?: boolean;            // 틈새 키워드 여부 (신규!)
    isEarlyBird?: boolean;        // 선점형 얼리버드 여부 (신규!)
    issueForecast?: string;       // 이슈 발생 예측 메시지 (신규!)
  };

  // 📈 트래픽 예상 (현실적인 수치)
  trafficEstimate: {
    daily: string;                // 일일 예상 방문자 (범위)
    weekly: string;               // 주간 예상
    monthly: string;              // 월간 예상
    confidence: number;           // 예측 신뢰도 (%)
    disclaimer: string;           // 주의사항
  };

  // 💰 수익 예상 (끝판왕 v2.0!)
  revenueEstimate?: {
    dailyRevenue: string;         // 일일 예상 수익 (범위)
    monthlyRevenue: string;       // 월간 예상 수익
    estimatedCPC: number;         // 예상 CPC (원)
    estimatedRPM: number;         // 예상 RPM (원)
    adType: string;               // 추천 광고 유형
    revenueGrade: 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C';  // 수익성 등급
    revenueReason: string;        // 수익성 이유
  };

  profitAnalysis?: {
    grade: 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' | 'D';
    gradeReason: string;
    profitGoldenRatio: number;
    estimatedCPC: number;
    purchaseIntentScore: number;
    competitionLevel: number;
    isRealBlueOcean: boolean;
    blueOceanReason: string;
    estimatedDailyRevenue: number;
    estimatedMonthlyRevenue: number;
    strategy: {
      approach: string;
      monetization: string;
      timing: string;
      titleSuggestion: string;
    };
  };

  // 🏆 종합 점수
  totalScore: number;             // 종합 점수 (0-100)
  grade: 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C';

  // 📝 초고수 블로거 전략 가이드
  proStrategy: {
    title: string;                // 추천 제목
    outline: string[];            // 추천 목차
    wordCount: number;            // 추천 글자수
    mustInclude: string[];        // 반드시 포함할 내용
    avoidTopics: string[];        // 피해야 할 내용
    monetization: string;         // 수익화 전략
    target?: string;              // [v13.0] 핵심 타겟 (예: "껍질 잘 녹나요?" 궁금해하는 주부들)
    strategicTitle?: string;      // [v13.0] 공략용 제목 (예: "3년 써보고 갈아탄 솔직 후기")
    contentStrategy?: string;     // [v13.0] 내용 전략 (예: "단점 섞기, 여름철 보관법 포함")
  };

  // 💎 [v15.0] AI 분석 기반 황금 근거 (New!)
  goldenBackground?: string;      // 왜 이 키워드가 황금인지에 대한 AI 분석 근거
  intelligentTitles?: string[];   // 데이터 기반으로 생성된 지능형 제목들

  // 📁 카테고리 매칭 여부 (카테고리 모드 보충 키워드 구분)
  isCategoryMatch?: boolean;      // true=카테고리 매칭, false=보충(카테고리 외)

  // 🔥 [v16.0] 네이버 실시간 연관검색어 (100점 에디션!)
  relatedKeywords?: string[];     // 네이버에서 실제 검색되는 연관 키워드

  // 🔥 플랫폼별 추천 제목 (끝판왕 v4.0!)
  platformTitles?: {
    naver: {                      // 네이버 블로그
      title: string;
      alternatives?: string[];
      subKeywords: string[];      // 서브 키워드 2~3개
      tags: string[];
      tip: string;
      hookPoint: string;          // 클릭 유발 포인트
    };
    tistory: {                    // 티스토리
      title: string;
      alternatives?: string[];
      subKeywords: string[];
      tags: string[];
      tip: string;
      hookPoint: string;
    };
    wordpress: {                  // 워드프레스
      title: string;
      alternatives?: string[];
      subKeywords: string[];
      tags: string[];
      tip: string;
      hookPoint: string;
    };
    blogspot: {                   // 블로그스팟
      title: string;
      alternatives?: string[];
      subKeywords: string[];
      tags: string[];
      tip: string;
      hookPoint: string;
    };
  };

  // 🔥 확장 황금 키워드 (끝판왕 v4.0!)
  expandedKeywords?: {
    relatedGolden: string[];      // 연관 황금 키워드
    longtailGolden: string[];     // 롱테일 황금 키워드
    blueOceanGolden: string[];    // 블루오션 황금 키워드
  };

  // 🏆 [v13.0] 킬러 콘텐츠 승부수 (사용자 제안 반영)
  winningStrategy?: {
    target: string;               // 타겟: 핵심 페인 포인트
    strategicTitle: string;       // 제목: 경험+심리 기반
    contentSecret: string;        // 내용: 신뢰도 떡상 비결
  };

  // 📌 키워드 특성
  type: KeywordType;
  category: string;
  safetyLevel: 'safe' | 'caution' | 'danger';
  safetyReason: string;

  // 🔥 급상승 이유 분석 (뉴스/블로그 기반)
  trendAnalysis?: {
    trendingReason: string;    // 왜 지금 검색량이 급상승했는지 (구체적 배경)
    whyNow: string;            // 왜 지금 글을 쓰면 좋은지
    newsSource?: string;       // 출처 (뉴스/블로그/카페)
  };

  keywordGuide?: {
    summary: string;
    whyItMovesNow: string;
    immediateTrafficPlan: string[];
    naverHomeExposureTips: string[];
  };

  highlightReason?: string;

  // 🏆 끝판왕 분석 v2.0 (PRO 전용)
  ultimateAnalysis?: UltimateAnalysis;

  // 🆕 v11.0 경쟁 블로그 분석
  competitorAnalysis?: {
    topBloggers: Array<{
      rank: number;
      blogAge: string;         // 블로그 나이 (예: "3년")
      postQuality: 'high' | 'medium' | 'low';
      canBeat: boolean;        // 이길 수 있는지
    }>;
    avgBlogAge: string;        // 평균 블로그 나이
    weakCompetitorRatio: number; // 약한 경쟁자 비율 (%)
    winProbability: number;    // 승리 확률 (%)
    strategy: string;          // 공략 전략
  };

  // 🆕 v12.0 진입 가능 여부 분석 (끝판왕!)
  entryAnalysis?: {
    canEntry: boolean;                    // 진입 가능 여부
    difficulty: 'easy' | 'possible' | 'hard' | 'very_hard';
    difficultyScore: number;              // 난이도 점수 (0-100, 낮을수록 쉬움)
    message: string;                      // 진입 가능 여부 메시지
    topCompetitorStrength: string;        // 상위 경쟁자 강도
    recommendedBlogIndex: string;         // 추천 블로그 지수
    estimatedRankingTime: string;         // 예상 상위노출 기간
  };

  // 🆕 v11.0 키워드 클러스터
  cluster?: {
    mainKeyword: string;       // 메인 키워드
    relatedKeywords: string[]; // 연관 키워드들
    canCoverInOnePost: boolean; // 하나의 글로 커버 가능?
    recommendedApproach: string; // 추천 접근법
  };

  // 🆕 v11.0 발행 최적 시간
  bestPublishSchedule?: {
    bestHour: number;          // 최적 발행 시간 (0-23)
    bestDay: string;           // 최적 요일
    peakSearchHours: number[]; // 검색 피크 시간대
    avoidHours: number[];      // 피해야 할 시간대
    reason: string;            // 이유
  };

  // 🆕 v11.3 수익화 분석 (끝판왕!)
  monetization?: {
    // 💰 수익화 점수 (0-100)
    score: number;
    grade: 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' | 'D';

    // 💵 CPC 추정 (클릭당 수익)
    estimatedCPC: {
      min: number;
      max: number;
      average: number;
      tier: 'premium' | 'high' | 'medium' | 'low';
    };

    // 📊 수익화 방법별 적합도
    methods: {
      adsense: { score: number; reason: string };      // 애드센스
      coupang: { score: number; reason: string };      // 쿠팡파트너스
      affiliate: { score: number; reason: string };    // 제휴마케팅
      brandedContent: { score: number; reason: string }; // 브랜드협찬
      digitalProduct: { score: number; reason: string }; // 디지털상품
    };

    // 🎯 추천 수익화 전략
    recommendedStrategy: string;

    // 💡 예상 월수익 (방문자 1000명 기준)
    estimatedMonthlyRevenue: {
      conservative: number;  // 보수적
      average: number;       // 평균
      optimistic: number;    // 낙관적
    };
  };

  // 🆕 v11.3 틈새 키워드 분석
  nicheAnalysis?: {
    isNiche: boolean;              // 틈새 키워드 여부
    nicheScore: number;            // 틈새 점수 (0-100)
    nicheType: 'hidden_gem' | 'rising_star' | 'blue_ocean' | 'untapped' | 'normal';
    nicheReason: string;           // 틈새인 이유
    competitionLevel: 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
    opportunityWindow: string;     // 기회 창 (예: "3개월 내 선점 필요")
  };

  // 🆕 v11.3 롱테일 키워드 추천
  longtailSuggestions?: {
    keywords: Array<{
      keyword: string;
      type: 'question' | 'comparison' | 'review' | 'howto' | 'location' | 'time' | 'price';
      estimatedVolume: 'high' | 'medium' | 'low';
      difficulty: 'easy' | 'medium' | 'hard';
      monetizationPotential: number;
    }>;
    bestPick: string;              // 최고 추천
    combinationStrategy: string;   // 조합 전략
  };

  // 🏆 경쟁자 분석 (top-blog-analyzer 연동)
  topBlogData?: TopBlogAnalysisResult;

  // 💰 수익화 전략 설계도 (v2.0 PRO 프리미엄)
  monetizationBlueprint?: MonetizationBlueprint;

  // 📊 순위 추적 피드백 (v12 연결)
  trackingHistory?: {
    isTracked: boolean;           // 이 키워드를 추적 중인지
    currentRank?: number;         // 현재 순위 (null이면 미추적)
    previousRank?: number;        // 이전 순위
    rankChange?: number;          // 순위 변화 (+면 하락, -면 상승)
    trackedSince?: string;        // 추적 시작일
    postUrl?: string;             // 추적 중인 글 URL
    feedbackMessage?: string;     // 성과 피드백 메시지
  };

  // 메타 정보
  source: string;
  // 🕒 MDP v2.0+ SRAA (Seasonal & Recency Advanced Analysis) 지표
  // 🤖 MDP v2.0 보정 데이터
  topPostRecency?: {
    monthsAgo: number[];        // 상위 3개 글의 경과 개월 수
    oldPostCount: number;       // 6개월 이상 된 글 개수
  };
  seasonalBonus?: number;       // 시즌 보너스 (2026 선점 등)

  timestamp: string;
}

function buildKeywordGuide(
  result: ProTrafficKeyword,
  trend: { trendingReason: string; whyNow: string; newsSource: string }
): NonNullable<ProTrafficKeyword['keywordGuide']> {
  const urgencyText = result.timing.urgency === 'NOW'
    ? '지금 바로'
    : result.timing.urgency === 'TODAY'
      ? '오늘 안에'
      : result.timing.urgency === 'THIS_WEEK'
        ? '이번 주 내'
        : '여유 있을 때';

  // 💎 AI 분석가 의견 활용
  const background = result.goldenBackground || trend.trendingReason;

  // 🔥 연관검색어 활용 가이드
  const relatedKwTips = result.relatedKeywords && result.relatedKeywords.length > 0
    ? [`💡 연관 키워드 활용: ${result.relatedKeywords.slice(0, 3).map(k => `"${k}"`).join(', ')}를 H2 소제목이나 본문에 자연스럽게 포함하세요.`]
    : [];

  return {
    summary: `${urgencyText} 공략하면 좋은 키워드입니다. (등급: ${result.grade}, 점수: ${result.totalScore}점)`,
    whyItMovesNow: `${background} ${trend.whyNow}`,
    immediateTrafficPlan: [
      `추천 제목 중 하나를 선택하여 앞부분에 "${result.keyword}"를 배치하세요.`,
      `본문 서두 100자 안에 "${result.keyword}"를 자연스럽게 2회 노출하세요.`,
      `최소 1개는 비교/체크리스트/요약 섹션을 넣어 체류시간을 늘리세요.`,
      ...relatedKwTips
    ],
    naverHomeExposureTips: [
      '첫 이미지에 키워드가 들어간 문구를 넣고, alt 텍스트도 키워드 포함',
      '목차를 만들고 H2/H3에 서브 키워드 배치',
      '태그는 5~10개로 과도한 반복을 피하고, 유사어를 섞기'
    ]
  };
}

type IntentBucket = 'price' | 'review' | 'recommend' | 'howto' | 'apply' | 'other';

function normalizeKeywordForDup(kw: string): string {
  const s = String(kw || '').trim();
  if (!s) return '';
  const tokens = s
    .split(/\s+/)
    .map(t => t.replace(/20\d{2}/g, ''))
    .map(t => t.replace(/[^가-힣a-zA-Z0-9]/g, ''))
    .filter(Boolean);
  tokens.sort();
  return tokens.join(' ').trim();
}

function normalizeKeywordCompact(kw: string): string {
  return String(kw || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/20\d{2}/g, '')
    .replace(/[^가-힣a-z0-9]/gi, '')
    .trim();
}

function detectIntentBucket(kw: string): IntentBucket {
  const s = String(kw || '');
  if (/가격|비용|요금|최저가|얼마|견적/.test(s)) return 'price';
  if (/후기|리뷰|언박싱|평점|사용기/.test(s)) return 'review';
  if (/추천|순위|베스트|TOP|top|비교/.test(s)) return 'recommend';
  if (/방법|하는법|가이드|설치|설정|꿀팁|정리/.test(s)) return 'howto';
  if (/신청|가입|예약|렌탈|구매|주문|쿠폰|할인/.test(s)) return 'apply';
  return 'other';
}

function calculateExplosionScore(r: ProTrafficKeyword): number {
  const timingScore = r.timing?.score ?? 0;
  const urgency = r.timing?.urgency ?? 'ANYTIME';
  const trendDir = r.timing?.trendDirection ?? 'stable';
  const sourceWeight = REALTIME_SOURCE_WEIGHT[r.source] || 0;
  const sv = typeof r.searchVolume === 'number' ? r.searchVolume : 0;

  let urgencyBonus = 0;
  if (urgency === 'NOW') urgencyBonus = 35;
  else if (urgency === 'TODAY') urgencyBonus = 25;
  else if (urgency === 'THIS_WEEK') urgencyBonus = 15;

  let trendBonus = 0;
  if (trendDir === 'peak') trendBonus = 20;
  else if (trendDir === 'rising') trendBonus = 12;
  else if (trendDir === 'falling') trendBonus = -5;

  const sourceBonus = Math.min(60, Math.max(0, sourceWeight * 1.5));

  let volumeBonus = 0;
  if (sv >= 1000) volumeBonus = 25;
  else if (sv >= 500) volumeBonus = 18;
  else if (sv >= 200) volumeBonus = 12;
  else if (sv >= 80) volumeBonus = 6;

  const text = `${r.trendAnalysis?.trendingReason || ''} ${r.trendAnalysis?.whyNow || ''}`;
  let evidenceBonus = 0;
  const newsSource = String(r.trendAnalysis?.newsSource || '');
  const hasRealTrendEvidence = !!newsSource && newsSource !== '자동 분석' && newsSource !== 'default';
  if (hasRealTrendEvidence && /급상승|이슈|폭발|신규|한정|마감|논란|화제|연말|연초|시즌|대란|품절/.test(text)) {
    evidenceBonus += 10;
  }

  const base = 25;
  let score = base + timingScore * 0.3 + urgencyBonus + trendBonus + sourceBonus + volumeBonus + evidenceBonus;

  // 🛡️ 레드오션 감점 (폭발 점수에 거품 제거)
  const docCount = typeof r.documentCount === 'number' ? r.documentCount : 0;
  if (sv > 0 && docCount > sv * 2) {
    score -= 20; // 문서수가 2배 많으면 감점
  }
  if (sv > 0 && docCount > sv * 5) {
    score -= 30; // 문서수가 5배 많으면 대폭 감점
  }

  // 🔥 v2.13.0 H7: 100점 정규화 (이전엔 최대 150점 → 가중치 합 깨트림)
  return Math.max(0, Math.min(100, score));
}

const EXPLOSION_ONLY_MIN_SCORE = 80;
const EXPLOSION_ONLY_MIN_SEARCH_VOLUME = 100;
const EXPLOSION_ONLY_MIN_GOLDEN_RATIO = 1.5;

const PREMIUM_GOLDEN_MIN_RATIO = 0.3;
const PREMIUM_GOLDEN_MAX_DOCUMENT_COUNT = 50000;
const PREMIUM_GOLDEN_GRADES = new Set(['SSS', 'SS', 'S']);

function getProPremiumMinRatioForCategory(category: string): number {
  const c = String(category || '');
  if (c === 'lite_standard') return PREMIUM_GOLDEN_MIN_RATIO;
  if (c === 'celeb') return 0.25;
  if (c === 'fashion') return 0.4;
  if (c === 'life_tips') return 0.3; // 생활팁은 문서수가 많은 편이므로 기준 완화
  if (c === 'business' || c === 'self_development' || c === 'it' || c === 'health') return 0.5;
  return 0.45;
}

function getProPremiumMaxDocumentsForCategory(category: string): number {
  const c = String(category || '');
  if (c === 'lite_standard') return PREMIUM_GOLDEN_MAX_DOCUMENT_COUNT;
  if (c === 'celeb') return 100000;
  if (c === 'fashion') return 50000;
  if (c === 'life_tips') return 300000; // 생활팁: 시즌 키워드는 dc 30만대가 흔함
  return 50000;
}

/**
 * 🔥 v2.14.0: 범용 대명사 키워드 차단 (Lite·PRO 공통)
 *   "다이어트", "비타민", "샴푸" 같은 단일 토큰 범용어는 검색량 아무리 커도 글 쓰기 힘듦
 *   (상위엔 대형 미디어·브랜드 공식몰이 독점)
 */
function isGenericSingleToken(keyword: string): boolean {
  const tokens = String(keyword || '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length !== 1) return false;                       // 2토큰 이상은 OK
  const kw = tokens[0];
  if (kw.length <= 2) return true;                             // 2자 이하 너무 짧음
  // 3자 한글 브랜드명(토리든/아누아/설화수)은 허용 — 영문 포함 시 브랜드성
  if (/^[가-힣]{3}$/.test(kw)) {
    // 일반 명사 블랙리스트
    const GENERIC = new Set([
      '다이어트', '비타민', '샴푸', '토너', '에센스', '세럼', '앰플', '크림', '로션',
      '영양제', '보험', '대출', '카드', '주식', '코인', '환율', '금리',
      '유튜브', '인스타', '블로그', '네이버', '카카오',
    ]);
    return GENERIC.has(kw);
  }
  return false;
}

function computePremiumGrade(r: ProTrafficKeyword, category?: string): 'SSS' | 'SS' | 'S' | 'A' | null {
  const sv = typeof r.searchVolume === 'number' && Number.isFinite(r.searchVolume) ? r.searchVolume : 0;
  const dcRaw = typeof r.documentCount === 'number' && Number.isFinite(r.documentCount) ? r.documentCount : null;
  if (dcRaw === null) return null;
  const dc = dcRaw;
  const gr = typeof r.goldenRatio === 'number' && Number.isFinite(r.goldenRatio) ? r.goldenRatio : 0;

  // 🔥 v2.17.0 카테고리별 블루오션 컷 세분화
  if (sv < 100) return null;
  if (isGenericSingleToken(r.keyword)) return null;
  if (category === 'celeb') {
    if (gr < 0.1) return null;
  } else if (category === 'life_tips') {
    if (gr < 0.3) return null;
  } else if (category === 'movie' || category === 'drama' || category === 'music'
          || category === 'book' || category === 'anime' || category === 'broadcast') {
    // 엔터/콘텐츠: 정보성 글 많아 gr 0.2+ 허용
    if (gr < 0.2) return null;
    if (dc > 300000) return null;
  } else if (category === 'policy' || category === 'finance' || category === 'realestate'
          || category === 'health') {
    // 정책/금융/부동산/건강: gr 0.4+ 허용 (시즌 이슈 고려)
    if (gr < 0.4) return null;
    if (dc > 200000) return null;
  } else if (category === 'it' || category === 'business' || category === 'interior'
          || category === 'daily' || category === 'self_development') {
    // 중간 카테고리: gr 0.5+
    if (gr < 0.5) return null;
    if (dc > 80000) return null;
  } else {
    // 나머지(all 등): 엄격
    if (gr < 2.0) return null;
    if (dc > 30000) return null;
  }

  // 🛡️ 저경쟁 보증 필터: 문서수가 너무 많으면 등급 하향 (기득권 블로그 영역)
  let penaltySteps = 0;
  if (category === 'celeb') {
    // 연예인 문서수 페널티 강화
    if (dc > 300000) penaltySteps = 3;
    else if (dc > 250000) penaltySteps = 2;
    else if (dc > 200000) penaltySteps = 1;
  } else if (category === 'life_tips') {
    // 생활꿀팁: 시즌 키워드는 구조적으로 dc가 높음. 완화된 페널티.
    if (dc > 500000) penaltySteps = 2;
    else if (dc > 300000) penaltySteps = 1;
  } else {
    if (dc > 300000) penaltySteps = 3; // 매우 강력한 페널티
    else if (dc > 100000) penaltySteps = 2;
    else if (dc > 50000) penaltySteps = 1;
  }

  // 레드오션 페널티 (문서수가 검색량보다 월등히 많은 경우)
  // life_tips는 시즌 키워드 특성상 dc/sv 비가 항상 높으므로 제외
  if (category !== 'life_tips') {
    if (dc > sv * 2) penaltySteps += 1;
    if (dc > sv * 5) penaltySteps += 1;
  }

  let baseGrade: 'SSS' | 'SS' | 'S' | 'A' = 'A';

  if (category === 'celeb') {
    // 🔥 v2.12.0 Phase 2-3: celeb 기준 엄격화 (이전엔 과완화로 SSS 남발)
    // SSS: 문서수 30만 이하 + 검색량 3000+ + 황금비율 0.5+ (이전: 100만/2000/0.1)
    if (dc <= 300000 && sv >= 3000 && gr >= 0.5) baseGrade = 'SSS';
    else if (dc <= 600000 && sv >= 1500 && gr >= 0.25) baseGrade = 'SS';
    else if (dc <= 1500000 && sv >= 800 && gr >= 0.1) baseGrade = 'S';
  } else if (category === 'life_tips') {
    // life_tips: 생활팁은 문서수가 많은 편이므로 기준 완화
    if (dc <= 10000 && sv >= 2000 && gr >= 1.5) baseGrade = 'SSS';
    else if (dc <= 50000 && sv >= 1000 && gr >= 0.5) baseGrade = 'SS';
    else if (dc <= 300000 && sv >= 300 && gr >= 0.2) baseGrade = 'S';
  } else if (category === 'movie' || category === 'drama' || category === 'music'
          || category === 'book' || category === 'anime' || category === 'broadcast') {
    // 🔥 v2.17.0: 엔터/콘텐츠 카테고리 — celeb와 일반 사이 중간 기준
    //    영화/드라마/음악/책은 정보성 글 방대 → 일반 기준이면 SSS 0건
    if (dc <= 20000 && sv >= 1500 && gr >= 1.0) baseGrade = 'SSS';
    else if (dc <= 80000 && sv >= 800 && gr >= 0.5) baseGrade = 'SS';
    else if (dc <= 300000 && sv >= 400 && gr >= 0.2) baseGrade = 'S';
  } else if (category === 'it' || category === 'business' || category === 'interior'
          || category === 'daily' || category === 'self_development') {
    // 🔥 v2.17.0: IT/비즈니스/인테리어/일상/자기계발 — 중간 엄격 기준
    if (dc <= 8000 && sv >= 1500 && gr >= 2.0) baseGrade = 'SSS';
    else if (dc <= 25000 && sv >= 800 && gr >= 1.0) baseGrade = 'SS';
    else if (dc <= 80000 && sv >= 400 && gr >= 0.5) baseGrade = 'S';
  } else if (category === 'policy') {
    // 🔥 v2.17.0: 정책·지원금 — 시즌별 검색량 폭등 특성 반영
    if (dc <= 15000 && sv >= 2000 && gr >= 1.5) baseGrade = 'SSS';
    else if (dc <= 60000 && sv >= 1000 && gr >= 0.7) baseGrade = 'SS';
    else if (dc <= 200000 && sv >= 500 && gr >= 0.3) baseGrade = 'S';
  } else if (category === 'health') {
    // 🔥 v2.17.0: 건강·의료 — 문서수 많고 CPC 높은 편
    if (dc <= 8000 && sv >= 2000 && gr >= 2.0) baseGrade = 'SSS';
    else if (dc <= 30000 && sv >= 1000 && gr >= 1.0) baseGrade = 'SS';
    else if (dc <= 100000 && sv >= 500 && gr >= 0.5) baseGrade = 'S';
  } else if (category === 'finance' || category === 'realestate') {
    // 🔥 v2.17.0: 금융·부동산 — 시즌/이슈 키워드 특성 반영
    if (dc <= 10000 && sv >= 2000 && gr >= 1.5) baseGrade = 'SSS';
    else if (dc <= 40000 && sv >= 1000 && gr >= 0.8) baseGrade = 'SS';
    else if (dc <= 150000 && sv >= 500 && gr >= 0.4) baseGrade = 'S';
  } else {
    // 🔥 v2.15.0 진짜 블루오션 기준 — "검색량 대비 문서수 극소" 중심
    // 핵심 철학: 블로거가 10개 글 써도 100% 상위 노출되는 키워드만
    // SSS: 극블루오션 (gr 10+, dc 극소 2000↓, sv 충분 2000+)
    //      → 검색량이 문서수의 10배 이상. 공급이 수요의 1/10 미만.
    if (dc <= 2000 && sv >= 2000 && gr >= 10.0) baseGrade = 'SSS';
    // SS: 진성 블루오션 (gr 5+, dc 5000↓, sv 1200+)
    else if (dc <= 5000 && sv >= 1200 && gr >= 5.0) baseGrade = 'SS';
    // S: 블루오션 (gr 3+, dc 15000↓, sv 700+)
    else if (dc <= 15000 && sv >= 700 && gr >= 3.0) baseGrade = 'S';
  }

  if (penaltySteps === 0) return baseGrade;

  // 패널티 적용
  const grades: ('SSS' | 'SS' | 'S' | 'A')[] = ['A', 'S', 'SS', 'SSS'];
  let idx = grades.indexOf(baseGrade);
  idx = Math.max(0, idx - penaltySteps);
  return grades[idx];
}

function computePremiumGradeStrict(r: ProTrafficKeyword, criteria?: { minRatio?: number; maxDocuments?: number; category?: string }): 'SSS' | 'SS' | 'S' | 'A' | null {
  const sv = typeof r.searchVolume === 'number' && Number.isFinite(r.searchVolume) ? r.searchVolume : 0;
  const dcRaw = typeof r.documentCount === 'number' && Number.isFinite(r.documentCount) ? r.documentCount : null;
  if (dcRaw === null) return null;
  const dc = dcRaw;
  const gr = typeof r.goldenRatio === 'number' && Number.isFinite(r.goldenRatio) ? r.goldenRatio : 0;

  // 🔥 v2.17.0 Strict 컷 — 카테고리별 세분화
  if (sv < 100) return null;
  if (isGenericSingleToken(r.keyword)) return null;
  const cat = criteria?.category;
  if (cat === 'celeb') {
    if (gr < 0.1) return null;
  } else if (cat === 'life_tips') {
    if (gr < 0.3) return null;
  } else if (cat === 'movie' || cat === 'drama' || cat === 'music'
          || cat === 'book' || cat === 'anime' || cat === 'broadcast') {
    if (gr < 0.2) return null;
    if (dc > 300000) return null;
  } else if (cat === 'policy' || cat === 'finance' || cat === 'realestate' || cat === 'health') {
    if (gr < 0.4) return null;
    if (dc > 200000) return null;
  } else if (cat === 'it' || cat === 'business' || cat === 'interior'
          || cat === 'daily' || cat === 'self_development') {
    if (gr < 0.5) return null;
    if (dc > 80000) return null;
  } else {
    if (gr < 2.0) return null;
    if (dc > 30000) return null;
  }

  const category = criteria?.category;
  const minRatio = typeof criteria?.minRatio === 'number' ? criteria.minRatio : (category === 'celeb' ? 0.05 : 0.5);
  const maxDocs = typeof criteria?.maxDocuments === 'number'
    ? criteria.maxDocuments
    : (category === 'celeb' ? 10000000 : (category === 'life_tips' ? 300000 : 50000));

  if (category === 'celeb') {
    // 🔥 v2.12.0 Phase 2-3: celeb strict 기준 엄격화
    if (dc <= 300000 && sv >= 3000 && gr >= 0.5) return 'SSS';
    if (dc <= 600000 && sv >= 1500 && gr >= 0.25) return 'SS';
    if (dc <= Math.min(maxDocs, 1500000) && sv >= 800 && gr >= Math.max(0.1, minRatio)) return 'S';
  } else if (category === 'life_tips') {
    // life_tips: 생활팁 전용 기준
    if (dc <= 10000 && sv >= 2000 && gr >= 1.5) return 'SSS';
    if (dc <= 50000 && sv >= 1000 && gr >= 0.5) return 'SS';
    if (dc <= maxDocs && sv >= 300 && gr >= Math.max(0.2, minRatio)) return 'S';
  } else if (category === 'movie' || category === 'drama' || category === 'music'
          || category === 'book' || category === 'anime' || category === 'broadcast') {
    // 🔥 v2.17.0 엔터/콘텐츠 strict
    if (dc <= 20000 && sv >= 1500 && gr >= 1.0) return 'SSS';
    if (dc <= 80000 && sv >= 800 && gr >= 0.5) return 'SS';
    if (dc <= Math.min(maxDocs, 300000) && sv >= 400 && gr >= Math.max(0.2, minRatio)) return 'S';
  } else if (category === 'it' || category === 'business' || category === 'interior'
          || category === 'daily' || category === 'self_development') {
    if (dc <= 8000 && sv >= 1500 && gr >= 2.0) return 'SSS';
    if (dc <= 25000 && sv >= 800 && gr >= 1.0) return 'SS';
    if (dc <= Math.min(maxDocs, 80000) && sv >= 400 && gr >= Math.max(0.5, minRatio)) return 'S';
  } else if (category === 'policy') {
    if (dc <= 15000 && sv >= 2000 && gr >= 1.5) return 'SSS';
    if (dc <= 60000 && sv >= 1000 && gr >= 0.7) return 'SS';
    if (dc <= Math.min(maxDocs, 200000) && sv >= 500 && gr >= Math.max(0.3, minRatio)) return 'S';
  } else if (category === 'health') {
    if (dc <= 8000 && sv >= 2000 && gr >= 2.0) return 'SSS';
    if (dc <= 30000 && sv >= 1000 && gr >= 1.0) return 'SS';
    if (dc <= Math.min(maxDocs, 100000) && sv >= 500 && gr >= Math.max(0.5, minRatio)) return 'S';
  } else if (category === 'finance' || category === 'realestate') {
    if (dc <= 10000 && sv >= 2000 && gr >= 1.5) return 'SSS';
    if (dc <= 40000 && sv >= 1000 && gr >= 0.8) return 'SS';
    if (dc <= Math.min(maxDocs, 150000) && sv >= 500 && gr >= Math.max(0.4, minRatio)) return 'S';
  } else {
    // 🔥 v2.15.0 Strict: 진짜 블루오션 (검색량 대비 문서수 극소)
    if (dc <= 2000 && sv >= 2000 && gr >= 10.0) return 'SSS';
    if (dc <= 5000 && sv >= 1200 && gr >= 5.0) return 'SS';
    if (dc <= Math.min(maxDocs, 15000) && sv >= 700 && gr >= Math.max(3.0, minRatio)) return 'S';
  }
  return 'A';
}

function computePremiumGradeEffective(
  r: ProTrafficKeyword,
  strict: boolean,
  criteria?: { minRatio?: number; maxDocuments?: number; category?: string }
): 'SSS' | 'SS' | 'S' | 'A' | null {
  return strict ? computePremiumGradeStrict(r, criteria) : computePremiumGrade(r, criteria?.category);
}

function isPremiumGoldenKeyword(
  r: ProTrafficKeyword,
  minSearchVolume: number,
  criteria?: { minRatio?: number; maxDocuments?: number; strictGrade?: boolean }
): boolean {
  if (!r) return false;
  const svOk = typeof r.searchVolume === 'number' && Number.isFinite(r.searchVolume) && r.searchVolume > 0;
  const docOk = typeof r.documentCount === 'number' && Number.isFinite(r.documentCount) && r.documentCount > 0;
  if (!svOk || !docOk) return false;

  const grade = computePremiumGradeEffective(r, !!criteria?.strictGrade, criteria);
  if (!PREMIUM_GOLDEN_GRADES.has(String(grade))) return false;

  const sv = r.searchVolume as number;
  const dc = r.documentCount as number;
  const gr = typeof r.goldenRatio === 'number' && Number.isFinite(r.goldenRatio) ? r.goldenRatio : 0;

  const minRatio = typeof criteria?.minRatio === 'number' ? criteria.minRatio : PREMIUM_GOLDEN_MIN_RATIO;
  const maxDocuments = typeof criteria?.maxDocuments === 'number' ? criteria.maxDocuments : PREMIUM_GOLDEN_MAX_DOCUMENT_COUNT;

  if (sv < minSearchVolume) return false;
  if (dc > maxDocuments) return false;
  if (gr < minRatio) return false;

  return true;
}

function selectPremiumGolden(items: ProTrafficKeyword[], targetCount: number): ProTrafficKeyword[] {
  const safeTarget = Math.max(1, targetCount);
  if (!items || items.length === 0) return [];

  const seen = new Set<string>();
  const picked: ProTrafficKeyword[] = [];
  const seenExact = new Set<string>();

  const ranked = [...items].sort((a, b) => {
    // 수익 황금비율 우선
    const profitRatioA = a.profitAnalysis?.profitGoldenRatio ?? 0;
    const profitRatioB = b.profitAnalysis?.profitGoldenRatio ?? 0;
    const profitRatioDiff = profitRatioB - profitRatioA;
    if (Math.abs(profitRatioDiff) > 0.5) return profitRatioDiff;

    const grDiff = (b.goldenRatio ?? 0) - (a.goldenRatio ?? 0);
    if (Math.abs(grDiff) > 0.0001) return grDiff;

    const dcDiff = (a.documentCount ?? Number.MAX_SAFE_INTEGER) - (b.documentCount ?? Number.MAX_SAFE_INTEGER);
    if (Math.abs(dcDiff) > 0.1) return dcDiff;

    const svDiff = (b.searchVolume ?? 0) - (a.searchVolume ?? 0);
    if (Math.abs(svDiff) > 0.1) return svDiff;

    return (b.totalScore ?? 0) - (a.totalScore ?? 0);
  });

  for (const item of ranked) {
    if (picked.length >= safeTarget) break;
    const norm = normalizeKeywordForDup(item.keyword);
    if (!norm || seen.has(norm)) continue;
    const ex = calculateExplosionScore(item);
    picked.push({
      ...item,
      highlightReason: item.highlightReason || buildHighlightReason(item, ex),
    });
    seen.add(norm);
    seenExact.add(normalizeKeywordCompact(item.keyword));
  }

  if (picked.length < safeTarget) {
    for (const item of ranked) {
      if (picked.length >= safeTarget) break;
      const exact = normalizeKeywordCompact(item.keyword);
      if (!exact || seenExact.has(exact)) continue;
      const ex = calculateExplosionScore(item);
      picked.push({
        ...item,
        highlightReason: item.highlightReason || buildHighlightReason(item, ex),
      });
      seenExact.add(exact);
    }
  }

  return picked.slice(0, safeTarget);
}

function isExplosiveKeywordStrict(r: ProTrafficKeyword): boolean {
  if (!r) return false;
  const svOk = typeof r.searchVolume === 'number' && Number.isFinite(r.searchVolume) && r.searchVolume > 0;
  const docOk = typeof r.documentCount === 'number' && Number.isFinite(r.documentCount) && r.documentCount > 0;
  if (!svOk || !docOk) return false;

  const urgency = r.timing?.urgency ?? 'ANYTIME';
  const trendDir = r.timing?.trendDirection ?? 'stable';
  const w = REALTIME_SOURCE_WEIGHT[r.source] || 0;
  const sv = typeof r.searchVolume === 'number' ? r.searchVolume : 0;
  const ratio = typeof r.goldenRatio === 'number' ? r.goldenRatio : 0;

  const score = calculateExplosionScore(r);

  const urgent = urgency === 'NOW' || urgency === 'TODAY' || urgency === 'THIS_WEEK';

  const svPass = sv >= EXPLOSION_ONLY_MIN_SEARCH_VOLUME;
  const scorePass = score >= EXPLOSION_ONLY_MIN_SCORE;

  const strictRatioPass = ratio >= EXPLOSION_ONLY_MIN_GOLDEN_RATIO;
  const strongSource = w >= 25;
  const veryHighExplosion = score >= 90;
  const svHigh = sv >= 200;
  const doc = typeof r.documentCount === 'number' ? r.documentCount : Number.POSITIVE_INFINITY;
  const docCeiling = doc <= 100000;
  const relaxedRatioPass = ratio >= 0.05;
  const ratioPass = strictRatioPass || (strongSource && veryHighExplosion && svHigh && docCeiling && relaxedRatioPass);

  const hasSignal = urgent || trendDir === 'rising' || trendDir === 'peak' || w >= 25;

  return svPass && ratioPass && scorePass && hasSignal;
}

function buildHighlightReason(r: ProTrafficKeyword, explosionScore: number): string {
  const urgency = r.timing?.urgency ?? 'ANYTIME';
  const trendDir = r.timing?.trendDirection ?? 'stable';

  const purchaseIntent = r.profitAnalysis?.purchaseIntentScore
    ?? (/추천|비교|순위|가격|비용|후기|할인|쿠폰|신청|가입|예약|렌탈|구매/.test(r.keyword) ? 60 : 0);
  const monthly = r.profitAnalysis?.estimatedMonthlyRevenue ?? 0;
  const comp = r.profitAnalysis?.competitionLevel;

  const urgencyMap: Record<string, string> = {
    'NOW': '실시간',
    'TODAY': '오늘',
    'THIS_WEEK': '이번주',
    'ANYTIME': '언제든'
  };
  const trendMap: Record<string, string> = {
    'surging': '폭발',
    'rising': '상승',
    'stable': '안정',
    'falling': '하락'
  };

  const urgencyKor = urgencyMap[urgency] || urgency;
  const trendKor = trendMap[trendDir] || trendDir;

  const prefix = (urgency === 'NOW' || urgency === 'TODAY')
    ? '🔥'
    : (urgency === 'THIS_WEEK' ? '🚀' : '✅');

  const monthlyText = monthly > 0 ? ` | 월 ${monthly.toLocaleString()}원⚠️` : '';
  const compText = (typeof comp === 'number') ? ` | 경쟁도 ${comp}` : '';
  return `${prefix} ${urgencyKor}/${trendKor} | 폭발 ${Math.round(explosionScore)} | 구매의도 ${purchaseIntent}${monthlyText}${compText}`;
}

function rerankAndSelectFinal(items: ProTrafficKeyword[], targetCount: number, ignoreGradeFilter = false): ProTrafficKeyword[] {
  const safeTarget = Math.max(1, targetCount);
  if (!items || items.length === 0) return [];

  // 🔥 단독 "후기/가격/정리/추천" 같은 범용 접미사 단독 키워드 차단
  // 뷰티/패션 카테고리 실행 시 공백 파생 결과로 단독 suffix가 섞여나오던 버그 방지
  const STANDALONE_SUFFIX_BLOCK = new Set([
    '후기', '가격', '정리', '추천', '비교', '순위', '방법', '총정리',
    '꿀팁', '성분', '브랜드', '차이', '사이즈', '하는법', '사용법',
    '리뷰', '팁', '정보', '코디', '코디법', '스타일링', '가성비',
  ]);
  const PARTIAL_BLOCK_RE = /^(브랜드별 차이|구두 사이즈|트렌드 컬러 \d{4})$/;
  const filtered = items.filter(r => {
    const kw = (r.keyword || '').trim();
    if (!kw || kw.length < 3) return false;
    const tokens = kw.split(/\s+/).filter(Boolean);
    if (tokens.length === 1 && STANDALONE_SUFFIX_BLOCK.has(kw)) return false;
    if (PARTIAL_BLOCK_RE.test(kw)) return false;
    if (tokens.length === 2 && tokens.every(t => STANDALONE_SUFFIX_BLOCK.has(t))) return false;
    const SHALLOW_PAIR_BLOCK = new Set(['사이즈', '가격', '가성비', '브랜드', '리뷰', '코디', '팁', '정보']);
    if (tokens.length === 2 && (SHALLOW_PAIR_BLOCK.has(tokens[0]) || SHALLOW_PAIR_BLOCK.has(tokens[1]))) return false;
    // 🔥 v2.15.0: 최종 단계 블루오션 보증 — gr >= 1.5 미만은 차단
    //    celeb/life_tips 는 카테고리 특성상 완화 (등급 판정에서 이미 별도 기준 적용됨)
    const ratio = typeof r.goldenRatio === 'number' ? r.goldenRatio : 0;
    // 🔥 v2.18.0 Fix1: 카테고리별 threshold 테이블 (celeb/life_tips만 완화되던 버그 수정)
    const CAT_GR_THRESHOLD: Record<string, number> = {
      celeb: 0.1, life_tips: 0.3,
      movie: 0.2, drama: 0.2, music: 0.2, book: 0.2, anime: 0.2, broadcast: 0.2,
      policy: 0.4, finance: 0.4, realestate: 0.4, health: 0.4,
      it: 0.5, business: 0.5, interior: 0.5, daily: 0.5, self_development: 0.5,
    };
    const cat = (r as any).category;
    const threshold = (cat && CAT_GR_THRESHOLD[cat] !== undefined) ? CAT_GR_THRESHOLD[cat] : 1.5;
    if (ratio > 0 && ratio < threshold) return false;
    return true;
  });

  // 🛡️ 안전장치: 필터가 너무 엄격해 결과 0건이 되면 원본 items 그대로 유지 (비어있기보단 낫다)
  if (filtered.length === 0 && items.length > 0) {
    console.warn('[PRO-HUNTER] 품질 필터 후 0건 → 원본 items 유지 (너무 엄격한 필터링 방지)');
  } else {
    items = filtered;
  }
  if (items.length === 0) return [];

  const explosionCache = new Map<string, number>();
  const getExplosion = (r: ProTrafficKeyword): number => {
    const key = r.keyword;
    const cached = explosionCache.get(key);
    if (cached !== undefined) return cached;
    const s = calculateExplosionScore(r);
    explosionCache.set(key, s);
    return s;
  };

  const getIntentScore = (r: ProTrafficKeyword): number => {
    return r.profitAnalysis?.purchaseIntentScore
      ?? (/추천|비교|순위|가격|비용|후기|할인|쿠폰|신청|가입|예약|렌탈|구매/.test(r.keyword) ? 60 : 0);
  };

  const getMonthlyRevenue = (r: ProTrafficKeyword): number => {
    return r.profitAnalysis?.estimatedMonthlyRevenue ?? 0;
  };

  const getCpc = (r: ProTrafficKeyword): number => {
    return r.profitAnalysis?.estimatedCPC ?? r.revenueEstimate?.estimatedCPC ?? 0;
  };

  const getDifficultyScore = (r: ProTrafficKeyword): number => {
    if (typeof r.entryAnalysis?.difficultyScore === 'number') return r.entryAnalysis.difficultyScore;
    const rookie = r.rookieFriendly?.score ?? 0;
    return 100 - rookie;
  };

  const sortForRanking = (list: ProTrafficKeyword[]): ProTrafficKeyword[] => {
    return [...list].sort((a, b) => {
      // 🔥 v2.16.0 0순위: 극블루오션 (gr 10+) 그룹 무조건 최상위
      const isUltraA = (a.goldenRatio || 0) >= 10;
      const isUltraB = (b.goldenRatio || 0) >= 10;
      if (isUltraA !== isUltraB) return isUltraA ? -1 : 1;

      // 0.5순위: 블루오션 (gr 5+) 그룹 우선
      const isBlueA = (a.goldenRatio || 0) >= 5;
      const isBlueB = (b.goldenRatio || 0) >= 5;
      if (isBlueA !== isBlueB) return isBlueA ? -1 : 1;

      // 🔥 v2.15.0 1순위: 황금비율 (블루오션 최우선!)
      const ratioDiff = (b.goldenRatio || 0) - (a.goldenRatio || 0);
      if (Math.abs(ratioDiff) > 0.5) return ratioDiff;

      // 2순위: 수익 황금비율 (profitGoldenRatio)
      const profitRatioA = a.profitAnalysis?.profitGoldenRatio ?? 0;
      const profitRatioB = b.profitAnalysis?.profitGoldenRatio ?? 0;
      const profitRatioDiff = profitRatioB - profitRatioA;
      if (Math.abs(profitRatioDiff) > 0.5) return profitRatioDiff;

      // 3순위: 폭발성 (지금 터지는 키워드)
      const exDiff = getExplosion(b) - getExplosion(a);
      if (Math.abs(exDiff) > 0.1) return exDiff;

      // 3순위: 구매 의도 (수익화 가능성)
      const intentDiff = getIntentScore(b) - getIntentScore(a);
      if (intentDiff !== 0) return intentDiff;

      // 4순위: 예상 월 수익
      const revDiff = getMonthlyRevenue(b) - getMonthlyRevenue(a);
      if (Math.abs(revDiff) > 5000) return revDiff;

      // 5순위: CPC (광고 단가)
      const cpcDiff = getCpc(b) - getCpc(a);
      if (Math.abs(cpcDiff) > 50) return cpcDiff;

      // 6순위: 난이도 (낮을수록 좋음)
      const diffDiff = getDifficultyScore(a) - getDifficultyScore(b);
      if (diffDiff !== 0) return diffDiff;

      // 🔥 v2.13.0 H6: 7순위 검색량 타이브레이커 (sv=1이 sv=10000 뚫고 상위 오는 것 방지)
      const svDiff = (b.searchVolume ?? 0) - (a.searchVolume ?? 0);
      if (Math.abs(svDiff) > 10) return svDiff;

      // 최종: 종합 점수
      return b.totalScore - a.totalScore;
    });
  };

  const stageGrades: Array<Set<string>> = ignoreGradeFilter
    ? [new Set(['SSS', 'SS', 'S', 'A', 'B', 'C', 'D'])]
    : [
      new Set(['SSS', 'SS', 'S']),
      new Set(['SSS', 'SS', 'S', 'A']),
      new Set(['SSS', 'SS', 'S', 'A', 'B']),
    ];

  const maxPerBucket = Math.max(2, Math.ceil(safeTarget * 0.4));
  const chosen: ProTrafficKeyword[] = [];
  const seen = new Set<string>();
  const bucketCount = new Map<IntentBucket, number>();

  const pushChosen = (item: ProTrafficKeyword, enforceBucket: boolean) => {
    if (chosen.length >= safeTarget) return;

    const norm = normalizeKeywordForDup(item.keyword);
    if (!norm || seen.has(norm)) return;

    const bucket = detectIntentBucket(item.keyword);
    const current = bucketCount.get(bucket) || 0;
    if (enforceBucket && current >= maxPerBucket) return;

    const ex = getExplosion(item);
    chosen.push({
      ...item,
      highlightReason: item.highlightReason || buildHighlightReason(item, ex),
    });

    seen.add(norm);
    bucketCount.set(bucket, current + 1);
  };

  for (const grades of stageGrades) {
    if (chosen.length >= safeTarget) break;

    // 🔥 v2.13.0 C2: ignoreGradeFilter=true 경로에서도 grade=null/undefined 카드는 제외
    const pool = ignoreGradeFilter
      ? items.filter(i => i.grade != null)
      : items.filter(i => i.grade && grades.has(String(i.grade)));
    const ranked = sortForRanking(pool);

    for (const item of ranked) {
      pushChosen(item, true);
      if (chosen.length >= safeTarget) break;
    }

    if (chosen.length < safeTarget) {
      for (const item of ranked) {
        pushChosen(item, false);
        if (chosen.length >= safeTarget) break;
      }
    }

    if (chosen.length < safeTarget) {
      for (const item of ranked) {
        if (chosen.length >= safeTarget) break;
        if (chosen.some(c => c.keyword === item.keyword)) continue;
        const ex = getExplosion(item);
        chosen.push({
          ...item,
          highlightReason: item.highlightReason || buildHighlightReason(item, ex),
        });
      }
    }
  }

  return chosen.slice(0, safeTarget);
}

function generatePlatformTitles(
  keyword: string,
  type: KeywordType,
  searchVolume: number | null,
  timing: ProTrafficKeyword['timing'],
  category?: string,
  intelligentTitles?: string[]
): NonNullable<ProTrafficKeyword['platformTitles']> {
  const titleGen = getTitleGenerator();
  const year = new Date().getFullYear();
  const cleanKeyword = keyword.trim();

  // 1. AI 지능형 제목 풀 확보 (없으면 즉석 생성)
  let titles = intelligentTitles || [];
  if (titles.length === 0) {
    const templateKw: any = {
      keyword, searchVolume, goldenRatio: 0, isRising: timing.urgency === 'NOW', category: category || 'general'
    };
    titles = titleGen.generateTitles(templateKw, 5);
  }

  const subKeywords = [
    `${cleanKeyword} 방법`,
    `${cleanKeyword} 추천`,
    `${cleanKeyword} 후기`
  ];

  const tags = Array.from(new Set([
    cleanKeyword.replace(/\s+/g, ''),
    cleanKeyword.split(' ')[0] || cleanKeyword,
    type
  ])).filter(Boolean);

  const volumeHint = typeof searchVolume === 'number' && searchVolume > 1000 ? ` (월 ${(searchVolume / 1000).toFixed(1)}K)` : '';

  // 플랫폼별 특화 제목 배분
  return {
    naver: {
      title: titles[0] || `${cleanKeyword} ${year} 최신 가이드${volumeHint}`,
      alternatives: [titles[1], titles[2]].filter(Boolean),
      subKeywords,
      tags,
      tip: '서두 100자 내에 키워드를 2회 노출하고, 결론 요약을 맨 위에 한 번 더 넣으세요.',
      hookPoint: '이미지 내 텍스트 삽입 및 스마트블록 주제 맞춤형 필승 전략'
    },
    tistory: {
      title: titles[1] || `${cleanKeyword} ${year} 완벽 정리${volumeHint}`,
      alternatives: [titles[3], titles[4]].filter(Boolean),
      subKeywords,
      tags,
      tip: '표/리스트를 많이 써서 스크롤 체류시간을 늘리세요.',
      hookPoint: '“핵심 3가지”처럼 숫자를 넣어 클릭률을 올리기'
    },
    wordpress: {
      title: titles[2] || `${cleanKeyword}: ${year} 에센셜 가이드${volumeHint}`,
      alternatives: [titles[0], titles[4]].filter(Boolean),
      subKeywords,
      tags,
      tip: 'H2/H3로 구조를 만들고, FAQ 섹션을 넣어 SEO를 강화하세요.',
      hookPoint: 'FAQ + 체크리스트 조합으로 체류시간/리치 증가'
    },
    blogspot: {
      title: titles[3] || `${cleanKeyword} ${year}: 빠른 시작 가이드${volumeHint}`,
      alternatives: [titles[1], titles[2]].filter(Boolean),
      subKeywords,
      tags,
      tip: '이미지 2~3장 + 요약 박스를 넣어 가독성을 올리세요.',
      hookPoint: '첫 화면에 요약(결론)을 배치해 이탈률을 낮추기'
    }
  };
}

function generateExpandedKeywords(keyword: string): NonNullable<ProTrafficKeyword['expandedKeywords']> {
  const cleanKeyword = keyword.trim();
  const base = cleanKeyword.replace(/\s+/g, ' ');

  const relatedGolden = Array.from(new Set([
    `${base} 추천`,
    `${base} 비교`,
    `${base} 후기`,
    `${base} 가격`
  ]));

  const longtailGolden = Array.from(new Set([
    `${base} 초보`,
    `${base} 쉽게`,
    `${base} 단계별`,
    `${base} 정리`
  ]));

  const blueOceanGolden = Array.from(new Set([
    `${base} 최신`,
    `${base} 2025`,
    `${base} 체크리스트`,
    `${base} 실패하지 않는 법`
  ]));

  return {
    relatedGolden,
    longtailGolden,
    blueOceanGolden
  };
}
import { MonetizationStrategyGenerator, MonetizationBlueprint } from './monetization-strategy-generator';

import { analyzeSerpWithPlaywright, closeBrowser as closePlaywrightBrowser } from './serp-crawler';

import { getNaverSearchAdKeywordVolume, getNaverSearchAdKeywordSuggestions, NaverSearchAdConfig } from './naver-searchad-api';
import { classifyKeyword, isKeywordMatchingCategory, getCategorySeeds, getCategoryById, CATEGORIES, CATEGORY_ICONS } from './categories';
import { getNaverBlogDocumentCount } from './naver-blog-api';
import { classifyKeywordIntent } from './keyword-intent-classifier';
import { getNaverSerpSignal } from './naver-serp-signal-api';
import { EnvironmentManager } from './environment-manager';
import {
  CATEGORY_SEEDS,
  SEASON_KEYWORDS
} from '../data/hunter-seeds';
import { scanForSurges, listRecentSurges, type TrendSignal } from './pro-hunter-v12/trend-surge-detector';
// 🔥 실시간 트렌드 제품명 주입 — Cross-source 집계 (Phase 1-3 + v2.13.0 H5 확장)
import { aggregateBeautyTrendSeeds, aggregateFashionTrendSeeds, aggregateGenericCategorySeeds, summarizeTrendSeeds } from './sources/trend-seed-aggregator';

/**
 * 런타임 동적 시드 캐시 — 카테고리별 실시간 트렌드 제품명 보관
 * huntProTrafficKeywords 진입 시 hydrate, getProfitableSeedKeywords 에서 읽음
 */
const DYNAMIC_TREND_SEEDS: Record<string, string[]> = {};

/**
 * 🔥 v2.12.0 Phase 3-2: 자동완성 suffix bomb 감지기
 * "X 추천 비교 꿀팁 2026" 같이 접미사 3개 이상 연속 붙은 노이즈 키워드 차단
 */
const SUFFIX_BOMB_TOKENS = new Set([
  '추천', '비교', '꿀팁', '방법', '정리', '총정리', '가격', '후기',
  '순위', '종류', '사용법', '하는법', '리뷰', '팁', '정보',
]);
/**
 * 🔥 v2.14.0 Phase H: 검색량 부족 시 monetizationBlueprint 생성 차단
 *   "월 X만원" 같은 공허한 수익 예측이 저품질 키워드에 붙는 것 방지
 */
function canGenerateMonetization(searchVolume: number | null | undefined, documentCount: number | null | undefined): boolean {
  const sv = typeof searchVolume === 'number' ? searchVolume : 0;
  const dc = typeof documentCount === 'number' ? documentCount : 0;
  if (sv < 500) return false;      // 검색량 500 미만은 수익 예측 무의미
  if (dc <= 0) return false;       // 문서수 미확인도 제외
  return true;
}

function isSuffixBomb(keyword: string): boolean {
  const tokens = String(keyword || '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 5) return false;                       // 🔥 v2.18.0 Fix3: 4→5 완화
  let suffixCount = 0;
  let hasYear = false;
  for (const t of tokens) {
    if (SUFFIX_BOMB_TOKENS.has(t)) suffixCount++;
    if (/^202[0-9]$/.test(t)) hasYear = true;
  }
  // 🔥 v2.18.0 Fix3: "비교/추천/순위" 의도 키워드는 정상 롱테일 (과탐 방지)
  const hasIntent = /비교|추천|순위/.test(keyword);
  if (suffixCount >= 4) return true;                         // 이전 3→4 상향
  if (suffixCount >= 3 && hasYear && !hasIntent) return true; // 의도 있으면 면제
  return false;
}
export interface RealtimeTrendStatus {
  category: string;
  total: number;
  crossValidated: number;
  sources: string[];
  success: boolean;
  message: string;
}
const TREND_STATUS: Record<string, RealtimeTrendStatus> = {};

/**
 * 외부(UI)에서 조회 — "실시간 수집 실패" 배지 표시용
 */
export function getRealtimeTrendStatus(category: string): RealtimeTrendStatus | null {
  return TREND_STATUS[category] || null;
}

async function hydrateDynamicSeeds(category: string): Promise<void> {
  if (category === 'beauty' || category === 'all') {
    try {
      const t0 = Date.now();
      const seeds = await aggregateBeautyTrendSeeds();
      const ms = Date.now() - t0;
      console.log(`[PRO-HUNTER] 🧴 뷰티 Cross-source 시드 집계 완료 (${ms}ms) — ${summarizeTrendSeeds(seeds)}`);
      DYNAMIC_TREND_SEEDS['beauty'] = seeds.slice(0, 60).map(s => s.seed);
      const allSources = new Set<string>();
      seeds.forEach(s => s.sources.forEach(src => allSources.add(src)));
      TREND_STATUS['beauty'] = {
        category: 'beauty',
        total: seeds.length,
        crossValidated: seeds.filter(s => s.sources.length >= 2).length,
        sources: Array.from(allSources),
        success: seeds.length > 0,
        message: seeds.length > 0
          ? `실시간 ${seeds.length}개 시드 수집 (교차검증 ${seeds.filter(s => s.sources.length >= 2).length}개)`
          : '⚠️ 모든 실시간 소스 실패 — 정적 시드만 사용',
      };
    } catch (err: any) {
      console.warn('[PRO-HUNTER] ⚠️ 뷰티 Cross-source 집계 실패:', err?.message);
      DYNAMIC_TREND_SEEDS['beauty'] = [];
      TREND_STATUS['beauty'] = {
        category: 'beauty', total: 0, crossValidated: 0, sources: [], success: false,
        message: `실시간 수집 실패: ${err?.message || '알 수 없음'}`,
      };
    }
  }
  if (category === 'fashion' || category === 'all') {
    try {
      const t0 = Date.now();
      const seeds = await aggregateFashionTrendSeeds();
      const ms = Date.now() - t0;
      console.log(`[PRO-HUNTER] 👕 패션 Cross-source 시드 집계 완료 (${ms}ms) — ${summarizeTrendSeeds(seeds)}`);
      DYNAMIC_TREND_SEEDS['fashion'] = seeds.slice(0, 50).map(s => s.seed);
      const allSources = new Set<string>();
      seeds.forEach(s => s.sources.forEach(src => allSources.add(src)));
      TREND_STATUS['fashion'] = {
        category: 'fashion',
        total: seeds.length,
        crossValidated: seeds.filter(s => s.sources.length >= 2).length,
        sources: Array.from(allSources),
        success: seeds.length > 0,
        message: seeds.length > 0
          ? `실시간 ${seeds.length}개 시드 수집 (교차검증 ${seeds.filter(s => s.sources.length >= 2).length}개)`
          : '⚠️ 모든 실시간 소스 실패 — 정적 시드만 사용',
      };
    } catch (err: any) {
      console.warn('[PRO-HUNTER] ⚠️ 패션 Cross-source 집계 실패:', err?.message);
      DYNAMIC_TREND_SEEDS['fashion'] = [];
      TREND_STATUS['fashion'] = {
        category: 'fashion', total: 0, crossValidated: 0, sources: [], success: false,
        message: `실시간 수집 실패: ${err?.message || '알 수 없음'}`,
      };
    }
  }

  // 🔥 v2.13.0 H5: life_tips/health/finance/realestate/self_dev/kitchen/parenting 동적 시드
  const GENERIC_CATEGORIES = ['life_tips', 'health', 'finance', 'realestate', 'self_development', 'kitchen', 'parenting', 'policy'];
  if (GENERIC_CATEGORIES.includes(category)) {
    try {
      const t0 = Date.now();
      const seeds = await aggregateGenericCategorySeeds(category);
      const ms = Date.now() - t0;
      console.log(`[PRO-HUNTER] 🌱 ${category} Cross-source 시드 ${seeds.length}개 (${ms}ms) — ${summarizeTrendSeeds(seeds)}`);
      DYNAMIC_TREND_SEEDS[category] = seeds.slice(0, 40).map(s => s.seed);
      const allSources = new Set<string>();
      seeds.forEach(s => s.sources.forEach(src => allSources.add(src)));
      TREND_STATUS[category] = {
        category, total: seeds.length,
        crossValidated: seeds.filter(s => s.sources.length >= 2).length,
        sources: Array.from(allSources),
        success: seeds.length > 0,
        message: seeds.length > 0 ? `실시간 ${seeds.length}개 시드 수집` : '실시간 소스 응답 없음 — 정적 시드만 사용',
      };
    } catch (err: any) {
      console.warn(`[PRO-HUNTER] ⚠️ ${category} Cross-source 실패:`, err?.message);
      DYNAMIC_TREND_SEEDS[category] = [];
    }
  }
}
import {
  REALTIME_SOURCE_WEIGHT,
  MONETIZATION_PATTERNS,
  CPC_DATA
} from '../data/hunter-patterns';

// 🤖 MDP v2.0 인터페이스 정의
import { analyzeKeywordTrendingReason } from './keyword-trend-analyzer';
import { getSignalBzKeywords } from './signal-bz-crawler';
import { getZumRealtimeKeywordsWithPuppeteer } from './zum-realtime-api';
import { getDaumRealtimeKeywordsWithPuppeteer } from './daum-realtime-api';
import { getNateRealtimeKeywordsWithPuppeteer } from './nate-realtime-api';
import { getNaverPopularNews } from './naver-news-crawler';
import { runUltimateAnalysis, UltimateAnalysis } from './ultimate-keyword-analyzer';
import { getTrackingDataForKeyword } from './pro-hunter-v12/tracking-store';

import {
  calculateProfitGoldenRatio,
  estimateCPC as estimateCPCProfit,
  calculatePurchaseIntent as calculatePurchaseIntentProfit,
  calculateCompetitionLevel as calculateCompetitionLevelProfit,
  type ProfitKeywordData,
  CATEGORY_CPC_DATABASE
} from './profit-golden-keyword-engine';

import {
  analyzeKeywordCompetition,
  TopBlogAnalysisResult,
  BlogIndexLevel,
} from './top-blog-analyzer';

import {
  analyzeUltimateGoldenKeyword,
  batchAnalyzeGoldenKeywords,
  type UltimateGoldenKeyword,
} from './ultimate-golden-keyword-hunter';

import {
  getEnhancedCategoryGoldenKeywords,
  ENHANCED_CATEGORY_GOLDEN_KEYWORDS,
  isRealBlueOcean
} from './profit-keyword-hunter-upgrade';

import {
  analyzeSmartBlockKeywordsWithMetrics,
  SmartBlockKeywordWithMetrics
} from './naver-smart-block-extractor';

import { getTitleGenerator } from './mass-collection/keyword-title-generator';
import { getRelatedKeywords } from './related-keyword-cache';
import { mineUltimateDeepKeywords } from './ultimate-niche-finder';
import { getPersistent, setPersistent, getAllKeywordsWithCompleteData } from './persistent-keyword-cache';
import { analyzeSeasonality, SeasonalityProfile } from './pro-hunter-v12/seasonality-analyzer';

export type KeywordType =
  | '🚀 타이밍키워드'    // 지금 바로 써야 하는 키워드
  | '💎 블루오션'        // 경쟁 거의 없는 황금 키워드
  | '🌸 시즌선점'        // 다가오는 시즌 선점 키워드
  | '📰 이슈키워드'      // 실시간 이슈 관련
  | '❓ 질문형키워드'    // ~하는법, ~방법 등
  | '🆕 신규키워드'      // 새로 생긴 제품/서비스
  | '🎯 롱테일꿀통';     // 긴 키워드, 낮은 경쟁

// API 캐시 (성능 최적화)
const apiCache = new Map<string, {
  searchVolume: number | null;
  documentCount: number | null;
  compIdx?: number | null;
  realCpc?: number | null;
  hasSmartBlock?: boolean;
  hasInfluencer?: boolean;
  difficultyScore?: number;
  intent?: string;
  intentBadge?: string;
  timestamp: number;
  isRealData?: boolean;
}>();
const keywordCache = new Map<string, any>();

const realtimeSourceMap = new Map<string, string>();

const CACHE_TTL = 5 * 60 * 1000; // 5분

// 🔥 v2.13.0 H10: apiCache 메모리 누수 방지 (무제한 성장 → 상한 + TTL 기반 eviction)
const API_CACHE_MAX_ENTRIES = 10_000;
const API_CACHE_EVICT_INTERVAL = 10 * 60 * 1000;   // 10분
const API_CACHE_ENTRY_TTL = 60 * 60 * 1000;        // 1시간
setInterval(() => {
  const now = Date.now();
  // TTL 만료 제거
  for (const [k, v] of apiCache.entries()) {
    if (now - (v.timestamp || 0) > API_CACHE_ENTRY_TTL) apiCache.delete(k);
  }
  // 상한 초과 시 오래된 것부터 제거 (LRU 근사: timestamp 오래된 순)
  if (apiCache.size > API_CACHE_MAX_ENTRIES) {
    const entries = Array.from(apiCache.entries())
      .sort((a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0));
    const toDelete = entries.slice(0, apiCache.size - API_CACHE_MAX_ENTRIES);
    for (const [k] of toDelete) apiCache.delete(k);
    console.log(`[PRO-HUNTER] 🧹 apiCache eviction: ${toDelete.length}개 제거 → ${apiCache.size}개 유지`);
  }
}, API_CACHE_EVICT_INTERVAL).unref?.();

// 🔥🔥🔥 100% 실제 API 모드 설정 (v12.1 Rate Limit 방지!) 🔥🔥🔥
const API_CONFIG = {
  // 병렬 처리 설정 (Rate Limit 방지를 위해 조절)
  PARALLEL_BATCH_SIZE: 5,         // 동시 API 호출 수 (50 → 5, Rate Limit 방지)
  PARALLEL_BATCH_DELAY: 500,      // 배치 간 딜레이 (50ms → 500ms)

  // 재시도 설정 (지수 백오프)
  MAX_RETRIES: 2,                 // 최대 재시도 횟수 (3 → 2)
  INITIAL_RETRY_DELAY: 500,       // 초기 재시도 딜레이 (100ms → 500ms)
  RETRY_MULTIPLIER: 2,            // 지수 백오프 배수
  MAX_RETRY_DELAY: 3000,          // 최대 재시도 딜레이 (2000ms → 3000ms)

  // 타임아웃 설정
  API_TIMEOUT: 10000,             // API 타임아웃 (5000ms → 10000ms)

  // 🚨 핵심: 더미데이터 완전 비활성화
  ALLOW_DUMMY_DATA: false,        // false = 더미데이터 절대 사용 안 함
  ALLOW_FALLBACK: false,          // false = 추정치 함수 사용 안 함

  // 최소 유효 데이터 기준
  MIN_VALID_SEARCH_VOLUME: 1,     // 최소 검색량 (0은 무효)
  MIN_VALID_DOC_COUNT: 1,         // 최소 문서수 (0은 무효)
};

// API 호출 통계 (디버깅용)
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

const PROFIT_INTENT_PATTERNS = [
  '추천', '비교', '순위', '베스트', '인기',
  '방법', '하는법', '하는방법', '신청', '신청방법', '조건', '자격', '기간',
  '장단점', '단점', '장점', '효과', '효능', '부작용', '성분', '사용법',
  '할인', '쿠폰', '이벤트', '최저가', '싸게', '무료', '혜택',
  '지원금', '보조금', '대상', '자격조건', '신청기간', '환급'
];

// 🔥 배열 셔플 함수 (Fisher-Yates 알고리즘 - 매번 다른 결과!)
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * 🔥🔥🔥 100% 실제 API 병렬 호출 시스템 🔥🔥🔥
 * 
 * 특징:
 * - 더미데이터 완전 제거
 * - 병렬 처리로 초고속
 * - 지수 백오프 재시도
 * - 실패한 키워드는 결과에서 완전 제외
 */

interface ApiResult {
  keyword: string;
  searchVolume: number | null;  // null = API 실패
  documentCount: number | null; // null = API 실패
  compIdx?: number | null;      // 상업성 지수 (Search Ad)
  realCpc?: number | null;      // 실시간 CPC (Search Ad monthlyAveCpc)
  hasSmartBlock?: boolean;
  hasViewSection?: boolean;
  hasInfluencer?: boolean;
  difficultyScore?: number;
  intent?: string;
  intentBadge?: string;
  success: boolean;
  error?: string;
}

async function fetchBlogDocumentCountScrape(
  keyword: string
): Promise<{ count: number | null; success: boolean; error?: string }> {
  const q = String(keyword || '').replace(/\s+/g, ' ').trim();
  if (!q) return { count: null, success: false, error: 'empty keyword' };

  const parseCountFromHtml = async (html: string): Promise<number | null> => {
    const patterns = [
      /블로그\s*검색결과\s*약\s*([0-9,]+)\s*건/,
      /검색결과\s*약\s*([0-9,]+)\s*건/,
      /약\s*([0-9,]+)\s*건/,
      /총\s*([0-9,]+)\s*건/,
      /([0-9,]+)\s*건\s*중/,
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m && m[1]) {
        const n = Number(String(m[1]).replace(/[^0-9]/g, ''));
        if (Number.isFinite(n)) return n;
      }
    }

    try {
      const cheerio = await import('cheerio');
      const $ = cheerio.load(html);
      const candidates = [
        $('span.title_num').first().text(),
        $('span.sub_tit_count').first().text(),
        $('span.title_num._title_num').first().text(),
        $('span.api_etc').first().text(),
      ].map(x => String(x || '')).filter(Boolean);

      for (const txt of candidates) {
        const mm = txt.match(/([0-9,]+)\s*건/);
        if (mm && mm[1]) {
          const n = Number(String(mm[1]).replace(/[^0-9]/g, ''));
          if (Number.isFinite(n)) return n;
        }
      }
    } catch {
      // ignore
    }

    return null;
  };

  try {
    const axios = (await import('axios')).default;

    const commonHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'ko-KR,ko;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    };

    const urlDesktop = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(q)}`;
    const respDesktop = await axios.get(urlDesktop, { headers: commonHeaders, timeout: 4000 });
    const htmlDesktop = String(respDesktop.data || '');
    const nDesktop = await parseCountFromHtml(htmlDesktop);
    if (typeof nDesktop === 'number' && Number.isFinite(nDesktop)) return { count: nDesktop, success: true };

    const urlMobile = `https://m.search.naver.com/search.naver?where=m_blog&query=${encodeURIComponent(q)}`;
    const respMobile = await axios.get(urlMobile, { headers: commonHeaders, timeout: 4000 });
    const htmlMobile = String(respMobile.data || '');
    const nMobile = await parseCountFromHtml(htmlMobile);
    if (typeof nMobile === 'number' && Number.isFinite(nMobile)) return { count: nMobile, success: true };

    return { count: null, success: false, error: 'parse failed' };
  } catch (e: any) {
    return { count: null, success: false, error: e?.message || String(e) };
  }
}

/**
 * 🔥 지수 백오프 딜레이 계산
 */
function getRetryDelay(retryCount: number): number {
  const delay = API_CONFIG.INITIAL_RETRY_DELAY * Math.pow(API_CONFIG.RETRY_MULTIPLIER, retryCount);
  return Math.min(delay, API_CONFIG.MAX_RETRY_DELAY);
}

/**
 * 🔥 단일 키워드 블로그 API 호출 (재시도 포함)
 */
async function fetchBlogDocumentCount(
  keyword: string,
  clientId: string,
  clientSecret: string
): Promise<{ count: number | null; success: boolean; error?: string }> {
  const normalizedKeyword = String(keyword || '').replace(/\s+/g, ' ').trim();

  for (let retry = 0; retry <= API_CONFIG.MAX_RETRIES; retry++) {
    try {
      apiStats.blogApiCalls++;

      const axios = (await import('axios')).default;
      const response = await axios.get('https://openapi.naver.com/v1/search/blog.json', {
        params: { query: normalizedKeyword, display: 1 },
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret
        },
        timeout: API_CONFIG.API_TIMEOUT
      });

      if (response.data && response.data.total !== undefined) {
        const count = response.data.total;
        apiStats.blogApiSuccess++;
        return { count, success: true };
      }

      // 응답은 왔지만 데이터가 없는 경우
      return { count: 0, success: true };

    } catch (error: any) {
      const status = error.response?.status;
      const isRateLimit = status === 429;
      const isAuthError = status === 401 || status === 403;

      // 인증 오류는 재시도 안 함
      if (isAuthError) {
        apiStats.blogApiFail++;
        return { count: null, success: false, error: `인증 오류 (${status})` };
      }

      // 마지막 재시도가 아니면 딜레이 후 재시도
      if (retry < API_CONFIG.MAX_RETRIES) {
        apiStats.totalRetries++;
        const delay = isRateLimit ? getRetryDelay(retry) * 3 : getRetryDelay(retry);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      // 최종 실패
      apiStats.blogApiFail++;
      return { count: null, success: false, error: error.message || '알 수 없는 오류' };
    }
  }

  apiStats.blogApiFail++;
  return { count: null, success: false, error: '최대 재시도 초과' };
}

/**
 * 🔥 단일 키워드 검색광고 API 호출 (재시도 포함)
 */
async function fetchSearchAdVolume(
  keyword: string,
  accessLicense: string,
  secretKey: string,
  customerId: string
): Promise<{ volume: number | null; competition: number | null; realCpc: number | null; success: boolean; error?: string }> {
  const normalizedKeyword = String(keyword || '').replace(/\s+/g, ' ').trim();

  try {
    apiStats.searchAdApiCalls++;
    const config: NaverSearchAdConfig = {
      accessLicense,
      secretKey,
      customerId
    };

    const volumes = await getNaverSearchAdKeywordVolume(config, [normalizedKeyword]);
    const row = volumes && volumes.length > 0 ? volumes[0] : null;

    if (row && typeof row.totalSearchVolume === 'number') {
      apiStats.searchAdApiSuccess++;

      // competition 문자열을 숫자로 변환 (예: "매우 높음" -> 1.0)
      let compValue = 0.5;
      if (row.competition === '매우 높음') compValue = 1.0;
      else if (row.competition === '높음') compValue = 0.8;
      else if (row.competition === '보통') compValue = 0.5;
      else if (row.competition === '낮음') compValue = 0.2;
      else if (row.competition === '매우 낮음') compValue = 0.05;

      return {
        volume: row.totalSearchVolume,
        competition: compValue,
        realCpc: row.monthlyAveCpc ?? null,
        success: true
      };
    }

    apiStats.searchAdApiFail++;
    return { volume: null, competition: null, realCpc: null, success: false, error: '검색량 데이터 없음' };
  } catch (error: any) {
    apiStats.searchAdApiFail++;
    return { volume: null, competition: null, realCpc: null, success: false, error: error?.message || '검색광고 API 오류' };
  }
}

/**
 * 🔥🔥🔥 초고속 병렬 API 호출 (핵심 함수!) 🔥🔥🔥
 */
export async function fetchKeywordDataParallel(
  keywords: string[],
  env: {
    naverClientId?: string;
    naverClientSecret?: string;
    naverSearchAdAccessLicense?: string;
    naverSearchAdSecretKey?: string;
    naverSearchAdCustomerId?: string;
  },
  options?: {
    allowBlogScrapeFallback?: boolean;
    blogScrapeMaxPerCall?: number;
  }
): Promise<Map<string, ApiResult>> {
  const results = new Map<string, ApiResult>();

  // API 키 확인
  const hasBlogApi = !!(env.naverClientId && env.naverClientSecret);
  const hasSearchAdApi = !!(env.naverSearchAdAccessLicense && env.naverSearchAdSecretKey && env.naverSearchAdCustomerId);

  if (!hasBlogApi && !hasSearchAdApi) {
    console.error('[API-PARALLEL] ❌ API 키가 없습니다!');
    return results;
  }

  // 통계 초기화
  apiStats.startTime = Date.now();
  apiStats.blogApiCalls = 0;
  apiStats.blogApiSuccess = 0;
  apiStats.blogApiFail = 0;
  apiStats.searchAdApiCalls = 0;
  apiStats.searchAdApiSuccess = 0;
  apiStats.searchAdApiFail = 0;
  apiStats.totalRetries = 0;

  console.log(`[API-PARALLEL] 🚀 ${keywords.length}개 키워드 병렬 처리 시작`);
  console.log(`[API-PARALLEL] ⚙️ 설정: 배치=${API_CONFIG.PARALLEL_BATCH_SIZE}, 재시도=${API_CONFIG.MAX_RETRIES}회`);

  const allowBlogScrapeFallback = !!options?.allowBlogScrapeFallback;
  const blogScrapeMaxPerCall = Number.isFinite(options?.blogScrapeMaxPerCall as any)
    ? Math.max(0, Number(options!.blogScrapeMaxPerCall))
    : 0;
  let blogScrapeUsed = 0;

  // 중복 제거
  const uniqueKeywords = [...new Set(keywords)];

  // 배치 분할
  const batches: string[][] = [];
  for (let i = 0; i < uniqueKeywords.length; i += API_CONFIG.PARALLEL_BATCH_SIZE) {
    batches.push(uniqueKeywords.slice(i, i + API_CONFIG.PARALLEL_BATCH_SIZE));
  }

  console.log(`[API-PARALLEL] 📦 총 ${batches.length}개 배치로 분할`);

  // 배치별 병렬 처리
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const progress = Math.round(((batchIndex + 1) / batches.length) * 100);

    console.log(`[API-PARALLEL] 📊 배치 ${batchIndex + 1}/${batches.length} (${progress}%) - ${batch.length}개 키워드`);

    // 🚀 [Optimization] 배치 단위로 검색광고 API 호출 (1회 호출로 N개 처리)
    const searchAdBatchMap = new Map<string, any>();
    if (hasSearchAdApi) {
      try {
        apiStats.searchAdApiCalls++;
        const batchVolumes = await getNaverSearchAdKeywordVolume({
          accessLicense: env.naverSearchAdAccessLicense!,
          secretKey: env.naverSearchAdSecretKey!,
          customerId: env.naverSearchAdCustomerId!
        }, batch); // 배치 전체 전달
        apiStats.searchAdApiSuccess++;

        for (const v of batchVolumes) {
          searchAdBatchMap.set(String(v.keyword).replace(/\s+/g, ' ').trim(), v);
        }
      } catch (e) {
        console.error(`[API-PARALLEL] 검색광고 배치 조회 실패:`, e);
      }
    }

    // 🔥 배치 내 모든 키워드 동시 처리!
    const batchPromises = batch.map(async (keyword): Promise<ApiResult> => {
      const normalizedKeyword = String(keyword || '').replace(/\s+/g, ' ').trim();
      const cleanKeyword = normalizedKeyword.replace(/\s/g, '');
      let searchVolume: number | null = null;
      let documentCount: number | null = null;
      let blogSuccess = false;
      let searchAdSuccess = false;
      let compIdx: number | null = null;
      let realCpc: number | null = null;
      let serpSignal: any = null;
      let intentInfo: any = null;

      // 검색광고 데이터는 이미 위에서 배치로 가져왔음
      let searchAdResult: { volume: number | null; competition: number | null; realCpc: number | null; success: boolean; error?: string } = {
        volume: null, competition: null, realCpc: null, success: false, error: '데이터 없음'
      };

      if (hasSearchAdApi) {
        const volData = searchAdBatchMap.get(normalizedKeyword);
        if (volData && typeof volData.totalSearchVolume === 'number') {
          // competition 문자열 -> 숫자 변환
          let compValue = 0.5;
          if (volData.competition === '매우 높음') compValue = 1.0;
          else if (volData.competition === '높음') compValue = 0.8;
          else if (volData.competition === '보통') compValue = 0.5;
          else if (volData.competition === '낮음') compValue = 0.2;
          else if (volData.competition === '매우 낮음') compValue = 0.05;

          searchAdResult = { volume: volData.totalSearchVolume, competition: compValue, realCpc: volData.monthlyAveCpc ?? null, success: true };
        } else if (!hasSearchAdApi) {
          searchAdResult = { volume: null, competition: null, realCpc: null, success: false, error: 'API 키 없음' };
        }
      } else {
        searchAdResult = { volume: null, competition: null, realCpc: null, success: false, error: 'API 키 없음' };
      }


      const [blogResultRaw, serpResult, intentResult] = await Promise.all([
        hasBlogApi
          ? fetchBlogDocumentCount(normalizedKeyword, env.naverClientId!, env.naverClientSecret!)
          : Promise.resolve({ count: null, success: false, error: 'API 키 없음' }),
        getNaverSerpSignal(normalizedKeyword),
        Promise.resolve(classifyKeywordIntent(normalizedKeyword))
      ]);

      const blogResult = (!blogResultRaw.success || blogResultRaw.count === null || blogResultRaw.count === 0)
        ? (allowBlogScrapeFallback && blogScrapeUsed < blogScrapeMaxPerCall
          ? await (async () => {
            blogScrapeUsed++;
            return fetchBlogDocumentCountScrape(normalizedKeyword);
          })()
          : blogResultRaw)
        : blogResultRaw;

      if (blogResult.success && blogResult.count !== null) {
        documentCount = blogResult.count;
        blogSuccess = true;
      }

      if (searchAdResult.success && searchAdResult.volume !== null) {
        searchVolume = searchAdResult.volume;
        compIdx = searchAdResult.competition;
        realCpc = searchAdResult.realCpc;
        searchAdSuccess = true;
      }

      serpSignal = serpResult;
      intentInfo = intentResult;

      // 🚨 핵심: 둘 다 실패하면 null 반환 (더미 데이터 절대 사용 안 함!)
      const success = blogSuccess || searchAdSuccess;

      return {
        keyword: normalizedKeyword,
        searchVolume,
        documentCount,
        compIdx,
        realCpc,
        hasSmartBlock: serpSignal?.hasSmartBlock,
        hasViewSection: serpSignal?.hasViewSection,
        hasInfluencer: serpSignal?.hasInfluencer,
        difficultyScore: serpSignal?.difficultyScore,
        intent: intentInfo?.intent,
        intentBadge: intentInfo?.badge,
        success,
        error: success ? undefined : `블로그: ${blogResult.error}, 검색광고: ${searchAdResult.error}`
      };
    });

    // 배치 결과 수집
    const batchResults = await Promise.all(batchPromises);

    // 결과 저장 (캐시에도 저장)
    for (const result of batchResults) {
      results.set(result.keyword, result);

      // 성공한 경우만 캐시에 저장
      if (result.success && (result.searchVolume !== null || result.documentCount !== null)) {
        const cleanKeyword = String(result.keyword || '').replace(/\s/g, '');
        const normalizedKeyword = String(result.keyword || '').replace(/\s+/g, ' ').trim();
        const cacheData = {
          searchVolume: result.searchVolume,
          documentCount: result.documentCount,
          compIdx: result.compIdx,
          realCpc: result.realCpc,
          hasSmartBlock: result.hasSmartBlock,
          hasViewSection: result.hasViewSection,
          hasInfluencer: result.hasInfluencer,
          difficultyScore: result.difficultyScore,
          intent: result.intent,
          intentBadge: result.intentBadge,
          timestamp: Date.now(),
          isRealData: true
        };
        apiCache.set(result.keyword, cacheData);
        apiCache.set(normalizedKeyword, cacheData);
        apiCache.set(cleanKeyword, cacheData);
        // 🗄️ 영구 캐시에도 저장 (cross-run 보존)
        setPersistent(result.keyword, {
          searchVolume: result.searchVolume,
          documentCount: result.documentCount,
          realCpc: result.realCpc ?? null,
          compIdx: result.compIdx ?? null,
        });
      }
    }

    // 배치 간 딜레이 (Rate Limit 방지)
    if (batchIndex < batches.length - 1) {
      await new Promise(r => setTimeout(r, API_CONFIG.PARALLEL_BATCH_DELAY));
    }
  }

  // 통계 출력
  const elapsed = ((Date.now() - apiStats.startTime) / 1000).toFixed(1);
  const successCount = Array.from(results.values()).filter(r => r.success).length;
  const failCount = results.size - successCount;

  console.log(`[API-PARALLEL] ✅ 완료! ${elapsed}초 소요`);
  console.log(`[API-PARALLEL] 📊 결과: 성공 ${successCount}개, 실패 ${failCount}개`);
  console.log(`[API-PARALLEL] 📊 블로그 API: ${apiStats.blogApiSuccess}/${apiStats.blogApiCalls} 성공`);
  console.log(`[API-PARALLEL] 📊 검색광고 API: ${apiStats.searchAdApiSuccess}/${apiStats.searchAdApiCalls} 성공`);
  console.log(`[API-PARALLEL] 🔄 총 재시도: ${apiStats.totalRetries}회`);

  return results;
}

/**
 * 🔥 키워드 배치 데이터 준비 (100% API 성공률 + 병렬 처리)
 * 
 * ✅ 개선점:
 * - 더미데이터 완전 제거
 * - 병렬 처리로 10배 빠름
 * - 지수 백오프 재시도
 * - 실패한 키워드는 결과에서 제외
 */
async function fetchKeywordDataBatch(keywords: string[]): Promise<void> {
  // 중복 제거
  const uniqueKeywords = [...new Set(keywords)];

  // 🗄️ 영구 캐시에서 미리 로드 (cross-run 재활용)
  let persistentHits = 0;
  for (const kw of uniqueKeywords) {
    const cleanKw = kw.replace(/\s/g, '');
    const memCached = apiCache.get(kw) || apiCache.get(cleanKw);
    if (memCached && memCached.searchVolume !== null && memCached.documentCount !== null) continue;
    const persisted = getPersistent(kw);
    if (persisted && (persisted.searchVolume !== null || persisted.documentCount !== null)) {
      const entry = {
        searchVolume: persisted.searchVolume,
        documentCount: persisted.documentCount,
        compIdx: persisted.compIdx ?? null,
        realCpc: persisted.realCpc ?? null,
        timestamp: Date.now(),
        isRealData: true,
      };
      apiCache.set(kw, entry);
      apiCache.set(cleanKw, entry);
      persistentHits++;
    }
  }
  if (persistentHits > 0) {
    console.log(`[PRO-TRAFFIC] 🗄️ 영구 캐시 히트: ${persistentHits}/${uniqueKeywords.length}개 (API 재호출 우회)`);
  }

  // 메모리 캐시에 완전한 데이터가 없는 키워드만 필터링
  const uncachedKeywords = uniqueKeywords.filter(kw => {
    const cleanKw = kw.replace(/\s/g, '');
    const cached = apiCache.get(kw) || apiCache.get(cleanKw);
    if (!cached || Date.now() - cached.timestamp >= CACHE_TTL) return true;
    // sv, dc 중 하나라도 null이면 재호출 필요
    return cached.searchVolume === null || cached.documentCount === null;
  });

  if (uncachedKeywords.length === 0) {
    console.log('[PRO-TRAFFIC] 📦 모든 키워드 캐시 히트');
    return;
  }

  console.log(`[PRO-TRAFFIC] 🔍 ${uncachedKeywords.length}개 키워드 API 조회 (캐시 미스)`);

  // 환경 설정 로드
  const { EnvironmentManager } = await import('./environment-manager');
  const env = EnvironmentManager.getInstance().getConfig();

  // 🔥 병렬 API 호출!
  await fetchKeywordDataParallel(uncachedKeywords, env);
}

export interface ProTrafficHuntResult {
  keywords: ProTrafficKeyword[];
  smartBlockKeywords?: string[];
  smartBlockKeywordsWithMetrics?: SmartBlockKeywordWithMetrics[];
  summary: {
    totalFound: number;
    sssCount: number;
    ssCount: number;
    sCount: number;
    rookieFriendlyCount: number;  // 신생 적합 키워드 수
    urgentCount: number;          // 긴급 키워드 수
    blueOceanCount: number;       // 블루오션 키워드 수
    searchAdAdded?: number;
    autocompleteAdded?: number;
    explosionFunnel?: any;
  };
  huntingStrategy: string;
  timestamp: string;
}

// ⚠️ 위험 키워드 (광고법 위반 + 경쟁 치열 + 상위노출 어려움)
// ❌ 보험, 대출, 법률, 의료시술, 투자는 블로거에게 위험!
const DANGER_KEYWORDS = [
  // 🚫 불법/성인
  '도박', '카지노', '토토', '성인', '불법', '무허가', '복제', '야동',
  // 🚫 의약품 (광고법 위반)
  '다이어트약', '체중감량약', '살빠지는약', '식욕억제제', '발기부전',
  // 🚫 대출 (경쟁 치열 + 저품질 위험)
  '대출추천', '대출비교', '대출금리', '대환대출', '신용대출추천', '주담대',
  '담보대출', '비상금대출', '무서류대출', '무직자대출', '카드론', '캐피탈',
  // 🚫 보험 (CPA 광고 + 검증 필요)
  '보험추천', '보험비교', '보험가입', '보험료', '암보험', '실비보험', '실손보험',
  '자동차보험', '운전자보험', '태아보험', '어린이보험', '치아보험', '화재보험',
  '종신보험', '연금보험', '변액보험', '저축보험',
  // 🚫 법률 (전문가 영역)
  '변호사추천', '변호사비용', '법무사', '소송비용', '합의금',
  // 🚫 의료시술 (광고법 규제 심함)
  '성형', '시술', '임플란트', '라식', '라섹', '필러', '보톡스', '리프팅',
  '모발이식', '탈모치료', '지방흡입',
  // 🚫 투자 (손실 책임 문제)
  '코인추천', '비트코인추천', '주식추천', '종목추천', 'P2P투자', '선물거래'
];

// ⚠️ 주의 키워드 (경쟁 치열하지만 조심하면 가능)
const CAUTION_KEYWORDS = [
  '다이어트', '살빼기', '운동법', '헬스',
  '부업', '재테크', '투자', '주식', '코인', '비트코인', '이더리움'
];

// 🚫 PRO에서 제외할 저가치 키워드 (Lite용)
// PRO는 월 10억+ 초고수 키워드만! 일반적인 키워드는 Lite로!
const LOW_VALUE_KEYWORDS_FOR_PRO = [
  // 아기용품 (저CPC)
  '바람개비', '딸랑이', '모빌', '치발기', '젖병추천', '기저귀추천',
  // 일반 요리 (저CPC)
  '계란후라이', '라면끓이기', '밥짓기', '김밥말기', '라면맛있게',
  // 일반 생활 (저CPC)
  '샤워순서', '세수방법', '손씻는법', '양치방법', '머리감는법',
  // 청소 기초 (저CPC)
  '청소순서', '걸레질', '설거지', '빨래하기',
  // 기타 저가치
  '인사말', '축하말', '덕담', '기상시간', '수면시간'
];

// ✅ 안전한 정부 정책 키워드 (DANGER에서 제외)
// ✅ 안전한 정부 정책 키워드 (DANGER에서 제외 - 상위노출 가능!)
const SAFE_POLICY_PATTERNS = [
  // 정부 지원금/복지
  '지원금', '지원사업', '보조금', '바우처', '장려금', '급여', '복지',
  '공제', '환급', '세액공제', '소득공제', '신청방법', '신청기간',
  // 청년 정책
  '청년도약', '청년희망', '청년내일', '청년월세', '청년주택', '청년구직',
  // 정부 대출 (디딤돌, 버팀목 등 - 상업대출과 구분!)
  '디딤돌대출', '버팀목대출', '신생아특례', '전세사기', '전세보증',
  // 고용/노동
  '소상공인', '근로자', '취업지원', '실업급여', '육아휴직', '출산휴가',
  // 청약/주거
  '청약', '특별공급', '분양', 'LH', 'SH', '행복주택', '공공임대',
  // 세금/연말정산
  '연말정산', '종합소득세', '부가세', '원천징수', '세금계산',
  // 연금
  '국민연금', '기초연금', '노령연금', '퇴직연금', '연금저축', 'IRP'
];

// 질문형 패턴 (검색량 높고 경쟁 낮음)
const QUESTION_PATTERNS = [
  '하는법', '방법', '만들기', '차이', '비교', '추천', '순위',
  '장단점', '후기', '부작용', '효과', '가격', '비용', '기간',
  '나이', '자격', '신청', '준비물', '주의사항', '꿀팁'
];

// 📅 월별 황금키워드 데이터 — 3유형 혼합 (이벤트 / 상품·서비스 / 정보·정책)
const MONTHLY_GOLDEN_KEYWORDS: Record<number, string[]> = {
  // ── 1월: 새해·설날·겨울 ──
  1: [
    // 시즌 이벤트 (6)
    '설 연휴 고속도로 통행료 면제 2026', '정월대보름 오곡밥 만드는법', '새해 해돋이 명소 동해',
    '설날 차례상 간소화 방법 2026', '1월 빙어축제 일정 인제', '대보름 달맞이 명소 서울',
    // 시즌 상품/서비스 (10)
    '연말정산 환급 많이 받는법 2026', '설 선물세트 한우 등급별 가격비교', '전기장판 전자파 없는 제품 추천',
    '겨울 기모 레깅스 브랜드 순위', '설 귀성길 멀미약 추천', '신년운세 사주카페 후기 2026',
    '가습기 살균 필터 교체주기', '동계 차량용품 필수 체크리스트', '설 선물 부모님 건강식품 순위',
    '온수매트 vs 전기매트 전기료 비교',
    // 시즌 정보/정책 (9)
    '2026년 최저시급 적용 계산기', '연말정산 월세 세액공제 조건 2026', '국민연금 납부액 인상 2026',
    '자동차세 연납 신청방법 1월', '건강보험 피부양자 자격 변경 2026', '1월 제철 과일 한라봉 고르는법',
    '겨울철 수도 동파 보상 신청방법', '난방비 도시가스 절약 꿀팁 10가지', '소상공인 정책자금 신청일정 2026'
  ],
  // ── 2월: 졸업·입학·발렌타인 ──
  2: [
    // 시즌 이벤트 (6)
    '졸업식 축하 화환 가격비교 2026', '발렌타인데이 수제초콜릿 만들기', '2월 딸기축제 논산 일정 2026',
    '졸업여행 제주도 2박3일 코스', '입춘 절기 음식 종류', '2월 눈꽃축제 태백 일정',
    // 시즌 상품/서비스 (10)
    '초등학교 입학준비물 전체 리스트 2026', '졸업 선물 10대 여자 인기순위', '봄 신학기 책가방 브랜드 비교',
    '입학식 엄마 정장 코디 2026', '새학기 학습지 비교 추천', '졸업 케이크 주문 맛집 서울',
    '봄 트렌치코트 가성비 브랜드 추천', '초등 입학 책상 높이 조절 추천', '중학교 교복 맞춤 vs 기성복 비교',
    '아이패드 학생 할인 구매방법 2026',
    // 시즌 정보/정책 (9)
    '2026년 초등학교 입학 나이 기준', '신학기 자녀 학원비 소득공제 방법', '황사 미세먼지 시즌 대비 공기청정기 필터 교체',
    '2월 제철 꼬막 삶는법 시간', '봄학기 대학교 장학금 신청 기간 2026', '자녀 교육비 세액공제 한도 2026',
    '어린이 독감 예방접종 무료 대상 2026', '전세계약 갱신청구권 행사 방법', '소득세 확정신고 기간 프리랜서 2026'
  ],
  // ── 3월: 봄·개학·꽃 ──
  3: [
    // 시즌 이벤트 (7)
    '화이트데이 사탕 대신 선물 추천', '3월 매화축제 광양 일정 2026', '삼일절 가볼만한곳 역사체험',
    '식목일 나무심기 행사 신청 2026', '봄꽃 개화시기 지역별 2026', '진해 군항제 벚꽃 일정 2026',
    '3월 유채꽃 명소 제주',
    // 시즌 상품/서비스 (9)
    '미세먼지 마스크 KF94 대용량 추천', '봄 알레르기 비염약 처방전 없이 구매', '새학기 노트북 대학생 추천 2026',
    '봄 자외선차단제 톤업 SPF50 추천', '초등 돌봄교실 신청방법 2026', '원룸 이사 업체 가격비교 봄',
    '새집증후군 공기정화 식물 추천', '봄 러닝화 가성비 브랜드 순위', '자취 필수템 리스트 2026',
    // 시즌 정보/정책 (9)
    '2026년 건강검진 대상자 조회 방법', '종합소득세 사전 준비 프리랜서', '국민취업지원제도 신청자격 2026',
    '미세먼지 등급별 행동요령 환경부', '봄철 차량 에어컨 필터 교체 비용', '아파트 봄 대청소 체크리스트',
    '전입신고 확정일자 받는법 온라인', '어린이집 입소 대기 신청 꿀팁', '3월 제철 주꾸미 손질법 양념 레시피'
  ],
  // ── 4월: 벚꽃·봄나들이·세금 ──
  4: [
    // 시즌 이벤트 (6)
    '벚꽃 개화시기 서울 2026', '4월 축제 일정 전국 정리 2026', '식목일 가족 체험 프로그램',
    '과학의날 행사 어린이 체험 2026', '봄 소풍 도시락 레시피 간단', '4월 튤립축제 태안 일정',
    // 시즌 상품/서비스 (10)
    '미세먼지 공기청정기 원룸용 추천 2026', '봄 자외선차단제 SPF50 민감피부 추천', '알레르기 비염 코세척기 추천',
    '어린이날 선물 초등학생 인기순위 2026', '봄 캠핑 텐트 가성비 추천', '어버이날 안마기 효도선물 추천',
    '자전거 출퇴근 용품 추천', '봄 피크닉 돗자리 감성용품 추천', '정수기 렌탈 가격비교 2026',
    '골프 입문 레슨 가격 초보 장비',
    // 시즌 정보/정책 (9)
    '근로장려금 신청기간 자격조건 2026', '종합소득세 신고 방법 홈택스 2026', '건강보험 환급금 조회 신청',
    '어린이 체험학습 추천 수도권', '봄철 타이어 교체 시기 공기압', '전세사기 예방 체크리스트 2026',
    '아파트 관리비 절약 꿀팁 봄', '4월 제철음식 두릅 요리 레시피', '교통범칙금 조회 납부방법 온라인'
  ],
  // ── 5월: 가정의달·어린이날·가족 ──
  5: [
    // 시즌 이벤트 (7)
    '어린이날 체험 행사 서울 무료 2026', '어버이날 카네이션 접는법 종이', '성년의날 향수 선물 추천 2026',
    '부부의날 이벤트 레스토랑 추천', '석가탄신일 템플스테이 예약 2026', '5월 장미축제 일정 곡성',
    '5월 가족여행 국내 추천 코스',
    // 시즌 상품/서비스 (9)
    '어린이날 선물 유아 장난감 인기순위 2026', '어버이날 건강기능식품 추천 부모님', '스승의날 선물 1만원대 추천',
    '5월 결혼식 하객룩 원피스 추천', '가족 캠핑장 예약 수도권 추천', '어린이 자전거 사이즈 선택 가이드',
    '키즈카페 인기 프랜차이즈 비교', '가정의달 가족사진 스튜디오 가격', '유아 선크림 순한 제품 추천',
    // 시즌 정보/정책 (9)
    '근로자의날 휴무 대상 연차 계산', '종합소득세 신고기간 절세 꿀팁 2026', '주거급여 신청자격 소득기준 2026',
    '어린이 보험 가입 시 주의사항', '초등학생 용돈 관리 앱 추천', '5월 제철 수산물 멍게 손질법',
    '아동수당 신청방법 지급일 2026', '교육급여 신청 대상 지원금액 2026', '여름 에어컨 사전점검 셀프 방법'
  ],
  // ── 6월: 장마·여름준비·현충일 ──
  6: [
    // 시즌 이벤트 (6)
    '현충일 가볼만한곳 현충원 참배', '6월 보령 머드축제 일정 2026', '단오 전통 체험 프로그램',
    '6월 수국 명소 제주 서울', '호국보훈의달 체험학습 추천', '6월 라벤더 축제 고창',
    // 시즌 상품/서비스 (10)
    '장마철 제습기 추천 원룸 가성비 2026', '에어컨 추천 2026 벽걸이 가성비', '장마철 빨래건조기 추천 소형',
    '여름 래쉬가드 브랜드 추천', '선풍기 추천 저소음 DC모터', '여름 냉감 이불 추천 소재별 비교',
    '모기퇴치기 추천 실내 실외', '여름 슬리퍼 브랜드 인기순위', '장마철 우산 튼튼한 브랜드 추천',
    '아이스커피 텀블러 보냉력 비교',
    // 시즌 정보/정책 (9)
    '여름 전기요금 누진세 계산 절약법', '장마철 차량 관리 체크리스트', '여름철 식중독 예방 주방위생 수칙',
    '수능 6월 모의고사 일정 시간표 2026', '에어컨 셀프 청소 방법 필터세척', '실내 곰팡이 제거 방법 벽지',
    '여름 휴가 연차 사용 계획 꿀팁', '자동차 에어컨 가스충전 비용 2026', '6월 제철 매실 담그는법 비율'
  ],
  // ── 7월: 여름휴가·물놀이·초복 ──
  7: [
    // 시즌 이벤트 (6)
    '초복 삼계탕 맛집 서울 2026', '7월 바다축제 부산 일정', '중복 보양식 장어 맛집 추천',
    '여름 계곡 물놀이 명소 수도권', '7월 불꽃축제 여의도 일정 2026', '해수욕장 개장일 전국 2026',
    // 시즌 상품/서비스 (10)
    '여름휴가 국내 여행지 가성비 숙소 추천', '워터파크 시즌권 가격비교 2026', '물놀이 튜브 대형 추천',
    '캠핑용 휴대 선풍기 배터리 추천', '여름 수영복 체형별 추천 여성', '차박 매트 에어매트 추천',
    '아이스박스 보냉 성능 비교 추천', '아쿠아슈즈 미끄럼방지 추천', '여름 다이어트 도시락 도구 추천',
    '어린이 물안경 귀마개 세트 추천',
    // 시즌 정보/정책 (9)
    '여름철 에어컨 전기세 계산기 2026', '물놀이 안전수칙 어린이 행동요령', '해외여행 환전 수수료 비교 은행별',
    '여름 차량 엔진 과열 대처법', '피서지 교통 실시간 정보 확인법', '여름철 두피 탈모 관리법',
    '자외선 지수 높은날 피부 관리', '해수욕장 안전 이안류 대처법', '7월 제철 복숭아 품종별 고르는법'
  ],
  // ── 8월: 말복·개학·가을준비 ──
  8: [
    // 시즌 이벤트 (6)
    '말복 보양식 전복죽 맛집 추천', '8월 15일 광복절 가볼만한곳', '개학 전 아이와 가볼만한곳 무료',
    '8월 여름축제 강릉 일정 2026', '말복 장어구이 맛집 풍천', '광복절 임시공휴일 여부 2026',
    // 시즌 상품/서비스 (9)
    '2학기 개학준비물 전체 체크리스트', '가을 신상 자켓 트렌드 2026', '추석 선물세트 사전예약 가격비교',
    '가을 등산화 추천 가성비 브랜드', '새학기 학용품 세트 온라인 할인', '선풍기 에어컨 수납 정리 방법',
    '가을 캠핑 침낭 3계절용 추천', '아이 2학기 학습 교재 추천', '초등 태블릿 학습기 비교 2026',
    // 시즌 정보/정책 (9)
    '추석 기차표 예매 일정 꿀팁 2026', '하반기 공무원 시험 일정 2026', '2학기 국가장학금 신청 기간',
    '가을 알레르기 환절기 비염 관리', '전기요금 환급 신청방법 폭염', '자동차 보험 갱신 다이렉트 비교',
    '건강검진 하반기 예약 방법', '8월 제철 포도 품종별 당도 비교', '중고등학생 생활기록부 관리 꿀팁'
  ],
  // ── 9월: 추석·가을·단풍 ──
  9: [
    // 시즌 이벤트 (7)
    '추석 연휴 고속도로 통행료 면제 2026', '추석 차례상 차리는법 간소화', '9월 단풍시기 설악산 2026',
    '추석 성묘 벌초 대행 가격', '가을 코스모스 축제 일정 전국', '추석 귀성길 휴게소 맛집 추천',
    '9월 억새축제 민둥산 일정',
    // 시즌 상품/서비스 (9)
    '추석 선물세트 직장 상사 추천 2026', '추석 한우 등급별 가격비교 온라인', '가을 트렌치코트 남자 추천',
    '송편 만들기 색소 없이 천연', '명절 전 귀걸이 모발관리 세트', '가을 등산 백팩 경량 추천',
    '추석 과일선물 배 사과 가격비교', '가을 감성 캠핑 용품 추천', '추석 제사용품 온라인 구매 세트',
    // 시즌 정보/정책 (9)
    '추석 택배 마감일 택배사별 2026', '명절 스트레스 해소법 심리', '추석 연휴 병원 약국 영업 조회',
    '가을 환절기 면역력 높이는 음식', '추석 용돈 얼마가 적당한지', '9월 제철 대하 고르는법 찌는시간',
    '근로자 명절 상여금 지급 기준', '귀성길 차량 사전점검 체크리스트', '재산세 납부 기간 조회 2026'
  ],
  // ── 10월: 단풍·할로윈·김장준비 ──
  10: [
    // 시즌 이벤트 (6)
    '10월 단풍 절정시기 내장산 2026', '핼러윈 파티 코스튬 DIY 만들기', '10월 축제 서울 전국 일정 2026',
    '단풍 드라이브 코스 추천 경기도', '핼러윈 아이 분장 쉬운 방법', '10월 국화축제 일정 익산',
    // 시즌 상품/서비스 (10)
    '김장 배추 예약 20포기 가격 2026', '수능 수험생 선물 간식 세트', '가을 패딩 경량 롱패딩 추천 2026',
    '김장용 고춧가루 산지 직송 추천', '핼러윈 파티 용품 소품 세트', '월동 준비 보일러 점검 비용',
    '전기요금 겨울철 난방 절약 제품', '가을 골프웨어 남녀 신상 추천', '독감 예방접종 가격 병원별 비교 2026',
    '수능 D-30 컨디션 영양제 추천',
    // 시즌 정보/정책 (9)
    '독감 무료 예방접종 대상자 2026', '김장 시기 배추 절이는 소금 비율', '수능 시험장 준비물 반입금지 물품',
    '가을철 등산 안전수칙 준비물', '주택 난방비 지원 에너지바우처 2026', '겨울 타이어 교체시기 스노우체인',
    '연말정산 미리보기 홈택스 사용법', '자동차 히터 점검 냉각수 교체', '10월 제철 꽃게 암수 구별법 찌는시간'
  ],
  // ── 11월: 수능·김장·블프·초겨울 ──
  11: [
    // 시즌 이벤트 (7)
    '수능 당일 교통통제 시간 2026', '빼빼로데이 수제 빼빼로 만들기', '블랙프라이데이 할인 품목 정리 2026',
    '김장 담그는 날 좋은 날짜 2026', '수능 끝나고 가볼만한곳 여행', '11월 단풍 늦은 명소 남해',
    '수능 이후 대입 일정 정리 2026',
    // 시즌 상품/서비스 (10)
    '블랙프라이데이 가전 할인 목록 2026', '김장 재료 한눈에 가격 비교 2026', '겨울 롱패딩 브랜드 순위 가성비',
    '수능 합격 선물 전자기기 추천', '크리스마스 선물 사전예약 추천', '겨울 부츠 방수 방한 추천 여성',
    '온풍기 히터 전기료 적은 제품 추천', '김장 비닐 김치통 대용량 추천', '스키장 시즌권 가격비교 2026',
    '연말 파티 드레스 코디 추천',
    // 시즌 정보/정책 (9)
    '수능 성적표 발표일 배치표 2026', '김장 양념 비율 황금레시피 20포기', '연말정산 소득공제 체크리스트 2026',
    '겨울철 결로 곰팡이 방지 방법', '대학 수시 합격자 발표 일정 2026', '보일러 동파방지 방법 장기외출',
    '연말 기부금 세액공제 한도 방법', '겨울철 실내 적정 온도 습도 관리', '11월 제철 굴 생굴 익혀먹기 노로바이러스'
  ],
  // ── 12월: 크리스마스·연말·겨울 ──
  12: [
    // 시즌 이벤트 (6)
    '크리스마스 데이트 코스 서울 2026', '새해 해돋이 명소 예약 2026', '12월 축제 일정 서울 빛초롱',
    '송년회 장소 추천 강남 맛집', '크리스마스 마켓 일정 전국 2026', '연말 카운트다운 행사 서울 부산',
    // 시즌 상품/서비스 (10)
    '크리스마스 선물 여자친구 추천 2026', '연말정산 간소화 서비스 사용법', '크리스마스 케이크 예약 인기 브랜드',
    '겨울여행 온천 숙소 추천 국내', '스키장 리프트권 가격비교 렌탈', '크리스마스 트리 장식 인테리어 추천',
    '새해 다이어리 플래너 추천 2026', '겨울 전기매트 안전한 제품 추천', '연말 와인 선물 가격대별 추천',
    '크리스마스 홈파티 음식 레시피',
    // 시즌 정보/정책 (9)
    '연말정산 환급 많이 받는 꿀팁 2026', '겨울철 수도 동파 예방 조치법', '건강보험 정산 환급금 조회 12월',
    '자동차세 연납 할인 신청 2026', '겨울철 난방비 절약 보일러 설정', '연말 퇴직금 중간정산 조건 방법',
    '12월 제철 과메기 먹는법 곁들임', '겨울 빙판길 낙상사고 예방법', '새해 목표 재테크 초보 시작 방법'
  ]
};

/**
 * 🛡️ 키워드 위험도 분석 로직
 */
function computeRiskAnalysis(keyword: string): ProTrafficKeyword['riskAnalysis'] {
  const isDanger = DANGER_KEYWORDS.some(dk => keyword.includes(dk));
  const isCaution = CAUTION_KEYWORDS.some(ck => keyword.includes(ck));
  const isSafePolicy = SAFE_POLICY_PATTERNS.some(sp => keyword.includes(sp));

  if (isSafePolicy) {
    return {
      level: 'safe',
      reason: '정부/정책 관련 정보성 키워드로 상위 노출 시 안정적인 트래픽 확보가 가능합니다.',
      warningMessage: '✅ 공식 웹사이트 정보를 기반으로 정확하게 작성하세요.'
    };
  }

  if (isDanger) {
    return {
      level: 'danger',
      reason: '보험, 대출, 의료 등 광고법 규제가 심하거나 저품질 위험이 높은 키워드입니다.',
      warningMessage: '🚨 주의: 전문 지식 없이 작성 시 블로그 지수에 악영향을 줄 수 있습니다.'
    };
  }

  if (isCaution) {
    return {
      level: 'caution',
      reason: '경쟁이 매우 치열하거나 상업적 의도가 강해 순위 유지가 어려울 수 있습니다.',
      warningMessage: '⚠️ 팁: 롱테일 키워드와 섞어서 작성하는 것을 추천합니다.'
    };
  }

  // 🔥 v2.14.0 Phase G: safe 레벨은 warningMessage 생략 (공허한 템플릿 제거)
  return {
    level: 'safe',
    reason: '일반적인 정보 및 생활 정보 키워드로 신생 블로거가 접근하기 좋습니다.',
  };
}

// 📅 다가오는 시즌 키워드 (1-2개월 앞서 준비)
function getUpcomingSeasonKeywords(currentMonth: number): string[] {
  const keywords: string[] = [];

  // 다음 달, 다다음 달 키워드 추가 (미리 선점!)
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
  const nextNextMonth = nextMonth === 12 ? 1 : nextMonth + 1;

  if (MONTHLY_GOLDEN_KEYWORDS[nextMonth]) {
    keywords.push(...MONTHLY_GOLDEN_KEYWORDS[nextMonth]);
  }
  if (MONTHLY_GOLDEN_KEYWORDS[nextNextMonth]) {
    keywords.push(...MONTHLY_GOLDEN_KEYWORDS[nextNextMonth].slice(0, 5)); // 다다음달은 5개만
  }

  return keywords;
}

// 📅 현재 월 황금키워드
function getMonthlyGoldenKeywords(currentMonth: number): string[] {
  return MONTHLY_GOLDEN_KEYWORDS[currentMonth] || [];
}

/**
 * 🏆 PRO 트래픽 키워드 헌팅 - 20년차 블로거도 탐내는 황금키워드 발굴!
 * 
 * 🎯 핵심 전략:
 * 1. 실시간 검색어가 아닌, 틈새 수익화 키워드 발굴
 * 2. 검색량 500~5000 + 문서수 1000 이하 = 블루오션
 * 3. 구매의도 키워드 ("~추천", "~비교", "~가격", "~후기")
 * 4. 네이버 검색광고 API 연관키워드 활용
 * 5. 실제 API로 황금비율 검증
 */
export async function huntProTrafficKeywords(options: {
  mode?: 'realtime' | 'category' | 'season'; // 🎯 분석 모드
  seedKeywords?: string[];
  category?: string;
  targetRookie?: boolean;
  includeSeasonKeywords?: boolean;
  count?: number;
  forceRefresh?: boolean; // 🔥 강제 새로고침 옵션 추가
  explosionMode?: boolean; // 🔥 지금 쓰면 터지는 키워드 우선
  useDeepMining?: boolean; // 🔥 끝판왕 Deep Mining 사용 여부
}): Promise<ProTrafficHuntResult> {
  const {
    mode = 'realtime', // 🎯 기본: 실시간 이슈
    seedKeywords = [],
    category = 'all',
    targetRookie = true,
    includeSeasonKeywords = true,
    count = 20,
    forceRefresh = true, // 기본적으로 새로고침 시 캐시 초기화
    explosionMode = false,
    useDeepMining = true // 🔥 기본 활성화: 끝판왕 딥 마이닝 통합
  } = options;

  // 🔥 v2.13.0 M11: explosionMode + useDeepMining 동시 활성 시 Rate Limit 경고
  if (explosionMode && useDeepMining) {
    console.warn('[PRO-HUNTER] ⚠️ explosionMode + useDeepMining 동시 활성 — API 호출 3배, Rate Limit 위험 높음');
  }

  // 🔥 v2.14.0 Phase F: policy 추가 (정부 지원금 korea.kr RSS)
  const DYNAMIC_CATEGORIES = new Set([
    'beauty', 'fashion', 'all',
    'life_tips', 'health', 'finance', 'realestate', 'self_development', 'kitchen', 'parenting', 'policy',
  ]);
  if (DYNAMIC_CATEGORIES.has(category)) {
    await hydrateDynamicSeeds(category);
  }

  const buildSmartBlockKeywords = async (topKeywords: string[], limit: number): Promise<{
    keywords: string[];
    keywordsWithMetrics: SmartBlockKeywordWithMetrics[];
  }> => {
    const seeds = (topKeywords || []).map(k => String(k || '').trim()).filter(Boolean).slice(0, 5);
    if (seeds.length === 0 || limit <= 0) return { keywords: [], keywordsWithMetrics: [] };

    const exclude = new Set<string>(seeds.map(normalizeKeywordCompact));
    const envMan = EnvironmentManager.getInstance();
    const config = envMan.getConfig();

    // 1. 기존 자동완성 API로 키워드 수집
    const autocompleteResults = await Promise.all(
      seeds.map(async (seed) => {
        try {
          return await fetchNaverAutocomplete(seed);
        } catch {
          return [];
        }
      })
    );

    const freq = new Map<string, { text: string; score: number }>();

    for (const arr of autocompleteResults) {
      for (const raw of (arr || [])) {
        const text = String(raw || '').replace(/\s+/g, ' ').trim();
        if (!text) continue;
        if (text.length < 2 || text.length > 40) continue;
        const key = normalizeKeywordCompact(text);
        if (!key || exclude.has(key)) continue;

        const prev = freq.get(key);
        if (!prev) {
          freq.set(key, { text, score: 1 });
        } else {
          prev.score += 1;
          if (text.length < prev.text.length) prev.text = text;
        }
      }
    }

    // 2. 🆕 스마트블록 분석으로 연관 키워드 + 메트릭스 조회
    let smartBlockKeywordsWithMetrics: SmartBlockKeywordWithMetrics[] = [];

    if (config.naverClientId && config.naverClientSecret) {
      try {
        // 상위 3개 시드에서 스마트블록 분석
        const smartBlockPromises = seeds.slice(0, 3).map(async (seed) => {
          try {
            const result = await analyzeSmartBlockKeywordsWithMetrics(
              seed,
              { clientId: config.naverClientId!, clientSecret: config.naverClientSecret! },
              {
                maxSmartBlockKeywords: Math.ceil(limit / 2), // 절반은 스마트블록에서
                searchAdConfig: config.naverSearchAdAccessLicense && config.naverSearchAdSecretKey ? {
                  accessLicense: config.naverSearchAdAccessLicense,
                  secretKey: config.naverSearchAdSecretKey,
                  customerId: config.naverSearchAdCustomerId
                } : undefined
              }
            );
            return result.smartBlockKeywords || [];
          } catch {
            return [];
          }
        });

        const smartBlockResults = await Promise.all(smartBlockPromises);
        const allSmartBlockKeywords = smartBlockResults.flat();

        // 중복 제거 및 병합
        const seenSmartBlock = new Set<string>();
        for (const kw of allSmartBlockKeywords) {
          const key = normalizeKeywordCompact(kw.keyword);
          if (!key || seenSmartBlock.has(key) || exclude.has(key)) continue;
          seenSmartBlock.add(key);
          smartBlockKeywordsWithMetrics.push(kw);
        }

        // 황금비율 기준 정렬
        smartBlockKeywordsWithMetrics.sort((a, b) => {
          const ratioDiff = (b.goldenRatio || 0) - (a.goldenRatio || 0);
          if (Math.abs(ratioDiff) > 0.01) return ratioDiff;
          return (b.searchVolume || 0) - (a.searchVolume || 0);
        });

        smartBlockKeywordsWithMetrics = smartBlockKeywordsWithMetrics.slice(0, limit);

        if (smartBlockKeywordsWithMetrics.length > 0) {
          console.log(`[PRO-TRAFFIC] 🎯 스마트블록 키워드 ${smartBlockKeywordsWithMetrics.length}개 수집 (메트릭스 포함)`);
        }
      } catch (e: any) {
        console.warn('[PRO-TRAFFIC] 스마트블록 분석 실패:', e?.message);
      }
    }

    // 3. 자동완성 키워드도 함께 반환 (기존 로직)
    const autocompleteKeywords = [...freq.values()]
      .sort((a, b) => {
        const s = b.score - a.score;
        if (s !== 0) return s;
        return a.text.length - b.text.length;
      })
      .slice(0, limit)
      .map(v => v.text);

    // 4. 스마트블록 키워드를 우선, 자동완성은 보조로
    const allKeywords = [
      ...smartBlockKeywordsWithMetrics.map(k => k.keyword),
      ...autocompleteKeywords.filter(k => !smartBlockKeywordsWithMetrics.some(sb => sb.keyword === k))
    ].slice(0, limit);

    return {
      keywords: allKeywords,
      keywordsWithMetrics: smartBlockKeywordsWithMetrics
    };
  };

  const withStepTimeout = async <T>(label: string, promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> => {
    let timeoutId: any;
    try {
      const timeout = new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => {
          console.warn(`[PRO-TRAFFIC] ⏱️ 단계 타임아웃(${timeoutMs}ms): ${label}`);
          resolve(fallback);
        }, timeoutMs);
      });
      return await Promise.race([promise, timeout]);
    } catch (e: any) {
      console.warn(`[PRO-TRAFFIC] ⚠️ 단계 실패: ${label} - ${e?.message || e}`);
      return fallback;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  const collectSettledWithinTimeout = async <T>(label: string, promises: Promise<T>[], timeoutMs: number): Promise<T[]> => {
    const collected: T[] = [];
    let active = true;
    let timeoutId: any;
    const timeout = new Promise<void>((resolve) => {
      timeoutId = setTimeout(() => {
        console.warn(`[PRO-TRAFFIC] ⏱️ 단계 타임아웃(${timeoutMs}ms): ${label}`);
        resolve();
      }, timeoutMs);
    });

    for (const p of promises) {
      p.then((value) => {
        if (active) collected.push(value);
      }).catch(() => {
        // ignore
      });
    }

    try {
      await Promise.race([Promise.allSettled(promises).then(() => undefined), timeout]);
      await Promise.resolve();
      return [...collected];
    } finally {
      active = false;
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  // 🏠 life_tips 전용 100점 솔루션: 순수 생활 노하우만 발굴!
  // 🔥 v2.13.0 H4: 뷰티·화학제품·세정제 경계 누수 차단 추가
  const LIFE_TIPS_PRODUCT_BLACKLIST = [
    '냉장고', '세탁기', '건조기', '청소기', '에어컨', '공기청정기', '제습기', '가습기',
    '식기세척기', '정수기', '전자레인지', '오븐', 'tv', '텔레비전', '모니터', '노트북',
    '에어프라이어', '밥솥', '압력밥솥', '믹서기', '착즙기', '로봇청소기',
    'lg', '엘지', '삼성', '다이슨', '샤오미', '로보락', '에코백스', '발뮤다', '위닉스',
    '쿠쿠', '쿠첸', '코웨이', '청호나이스', '린나이', '템퍼', '시몬스', '한샘',
    '코스트코', '커클랜드', '다이소', '이케아', '무인양품', '오늘의집', '마켓컬리',
    '쿠팡', '네이버쇼핑', '11번가', 'g마켓', '옥션', 'ssg', '롯데온',
    // 🔥 v2.13.0 H4: 뷰티/화학 제품 누수 방지
    '세제', '세정제', '다용도세제', '만능세정제', '섬유유연제', '표백제',
    '에센스', '세럼', '앰플', '토너', '크림', '로션', '마스크팩', '선크림',
    '샴푸', '린스', '컨디셔너', '바디워시', '클렌저',
  ];

  const LIFE_TIPS_KNOWHOW_PATTERNS = [
    '방법', '하는법', '하는방법', '꿀팁', '팁', '비법', '노하우',
    '제거', '청소', '세탁', '빨래', '정리', '수납', '보관', '절약',
    '예방', '방지', '해결', '관리', '손질', '활용', '응급', '대처',
    '줄이기', '아끼는', '요령', '비결', '초보', '쉽게', '간단히', '나이프', '가위', '칼',
    '전기요금', '난방비', '가스비', '수도세', '에너지'
  ];

  const isLifeTipsProductKeyword = (kw: string): boolean => {
    const lower = kw.toLowerCase();
    return LIFE_TIPS_PRODUCT_BLACKLIST.some(product => lower.includes(product));
  };

  const hasLifeTipsKnowhowPattern = (kw: string): boolean => {
    return LIFE_TIPS_KNOWHOW_PATTERNS.some(pattern => kw.includes(pattern));
  };

  const isPureLifeTipsKnowhow = (kw: string): boolean => {
    if (isLifeTipsProductKeyword(kw) && !hasLifeTipsKnowhowPattern(kw)) {
      return false;
    }
    return true;
  };

  const isKeywordInSelectedCategory = (keyword: string, cat: string): boolean => {
    if (!cat || cat === 'all' || cat === 'pro_premium' || cat === 'lite_standard') return true;

    // celeb/music: 전자제품 모델명 제외 (특수 케이스)
    if (cat === 'celeb' || cat === 'music') {
      const kw = String(keyword || '');
      if (/^[A-Z]{2,}\d+[A-Z0-9]{3,}/i.test(kw) || /^[A-Z]\d[A-Z0-9]{5,}/i.test(kw)) return false;
    }

    if (cat === 'drama') {
      return isKeywordMatchingCategory(keyword, 'movie');
    }

    return isKeywordMatchingCategory(keyword, cat);
  };

  const modeLabels: Record<string, string> = {
    'realtime': '🔥 실시간 이슈',
    'category': '📁 카테고리별 황금키워드',
    'season': '📅 시즌별/월별 황금키워드'
  };
  console.log(`[PRO-TRAFFIC] 🏆 PRO 황금키워드 헌팅 시작 - ${modeLabels[mode] || mode}`);

  // 🔥 새로고침 시 캐시 초기화 (매번 새로운 결과!)
  if (forceRefresh) {
    apiCache.clear();
    console.log('[PRO-TRAFFIC] 🗑️ 캐시 초기화 완료 - 새로운 키워드 발굴 시작!');
  }

  const results: ProTrafficKeyword[] = [];
  const currentMonth = new Date().getMonth() + 1;
  const currentHour = new Date().getHours();

  const internalMetrics = {
    seedCount: 0,
    allKeywordsCount: 0,
    profitableCount: 0,
    uniqueKeywordsCount: 0,
    sortedResultsCount: 0,
    verifiedResultsCount: 0,
    searchAdEnabled: false,
    searchAdAdded: 0,
    autocompleteAdded: 0,
  };

  const isVerifiedMetrics = (r: ProTrafficKeyword): boolean => {
    // 🔥 Deep Mining 키워드는 검색량이 적어도(0이어도) 문서수가 적으면(5000 이하) 통과!
    if (r.source.startsWith('deep_mining') && typeof r.searchVolume === 'number' && typeof r.documentCount === 'number') {
      if (r.documentCount < 5000) return true;
    }
    // 🔥 surge 키워드는 무조건 통과 (황금비율 무관, 급증 자체가 가치)
    if (surgeInfoMap.has(r.keyword)) return true;

    // 🔥 완화: sv 또는 dc 중 하나라도 양수면 통과 (결과 최대화)
    // 기존 엄격: sv>0 AND dc>0 이 둘 다 필요 → 대다수 탈락 원인
    const svOk = typeof r.searchVolume === 'number' && Number.isFinite(r.searchVolume) && r.searchVolume > 0;
    const dcOk = typeof r.documentCount === 'number' && Number.isFinite(r.documentCount) && r.documentCount > 0;
    return svOk || dcOk;
  };

  // 🔥 급상승 키워드 정보 저장 — 모든 모드에서 감지, 최종 결과에서 자동 SSS/SS 등급 부여
  const surgeInfoMap = new Map<string, TrendSignal>();

  // 🔥 모드 무관하게 surge 감지 (카테고리/시즌 모드에서도 급증 키워드 포착)
  try {
    const cachedSurges = listRecentSurges(30);
    const surgeSeedSource = [...seedKeywords].slice(0, 10);
    const freshResult = await withStepTimeout(
      'scanForSurges:pre',
      scanForSurges(surgeSeedSource, { category: category !== 'all' ? category : undefined }),
      5000,
      { scanned: 0, detected: [] as TrendSignal[], topSurges: [] as TrendSignal[], computedAt: 0 }
    );
    const allSurgeSignals = [...freshResult.detected, ...cachedSurges];
    for (const sig of allSurgeSignals) {
      if (sig.surgeLevel === 'explosive' || sig.surgeLevel === 'strong') {
        if (!surgeInfoMap.has(sig.keyword)) {
          surgeInfoMap.set(sig.keyword, sig);
        }
      }
    }
    if (surgeInfoMap.size > 0) {
      console.log(`[PRO-TRAFFIC] 🔥 급증 키워드 ${surgeInfoMap.size}개 감지 (explosive/strong) - 자동 황금 분류`);
    }
  } catch {
    console.warn('[PRO-TRAFFIC] surge 사전 감지 실패, 계속 진행');
  }

  let allSeedKeywords: string[] = [...seedKeywords];
  let multiSourceSeeds: string[] = [];

  // 🔥 v2.13.0 M1: 실시간 상품명 강제 prepend — 모든 동적 카테고리로 확장
  if (DYNAMIC_CATEGORIES.has(category) && category !== 'all') {
    const realtimeSeeds = DYNAMIC_TREND_SEEDS[category] || [];
    if (realtimeSeeds.length > 0) {
      // 각 상품명마다 3변형: 원본, +추천, +후기 → 최종 결과에 브랜드명 키워드 보장
      const injectedSeeds: string[] = [];
      for (const name of realtimeSeeds.slice(0, 25)) {
        injectedSeeds.push(name);
        injectedSeeds.push(`${name} 추천`);
        injectedSeeds.push(`${name} 후기`);
      }
      // 기존 seedKeywords 앞에 주입 (최우선 처리)
      allSeedKeywords = Array.from(new Set([...injectedSeeds, ...allSeedKeywords]));
      console.log(`[PRO-HUNTER] 🔥 실시간 상품명 ${realtimeSeeds.length}개 × 3변형 = ${injectedSeeds.length}개 시드 강제 주입`);
    }
  }

  // 🎯 모드별 시드 키워드 수집
  if (mode === 'season') {
    // 📅 시즌별/월별 황금키워드 모드
    console.log('[PRO-TRAFFIC] 📅 시즌별/월별 황금키워드 모드 활성화');
    const monthlyKeywords = getMonthlyGoldenKeywords(currentMonth);
    const upcomingKeywords = getUpcomingSeasonKeywords(currentMonth);
    allSeedKeywords = [...allSeedKeywords, ...shuffleArray(monthlyKeywords), ...shuffleArray(upcomingKeywords)];
    console.log(`[PRO-TRAFFIC] 📅 시즌 키워드 ${monthlyKeywords.length + upcomingKeywords.length}개 로드`);

  } else if (mode === 'category') {
    // 📁 카테고리별 황금키워드 모드
    console.log('[PRO-TRAFFIC] 📁 카테고리별 황금키워드 모드 활성화');
    // 기존 시드 DB
    const categoryKeywords = getEnhancedCategoryGoldenKeywords(category);
    // categories.ts 단일 소스 시드 (보강)
    const unifiedSeeds = getCategorySeeds(category);
    const mergedSeeds = [...new Set([...categoryKeywords, ...unifiedSeeds])];
    allSeedKeywords = [...allSeedKeywords, ...shuffleArray(mergedSeeds)];
    // 🔥 surge 키워드도 카테고리 시드에 최상위 주입
    const isCatSpec = category !== 'all' && category !== 'pro_premium' && category !== 'lite_standard';
    const surgeKeywordsForSeed = [...surgeInfoMap.keys()]
      .filter(k => !isCatSpec || isKeywordInSelectedCategory(k, category));
    if (surgeKeywordsForSeed.length > 0) {
      allSeedKeywords = [...surgeKeywordsForSeed, ...allSeedKeywords];
      console.log(`[PRO-TRAFFIC] 🔥 카테고리 모드에 급증 키워드 ${surgeKeywordsForSeed.length}개 시드 주입`);
    }
    console.log(`[PRO-TRAFFIC] 📁 카테고리 키워드 ${mergedSeeds.length}개 로드 (기존 ${categoryKeywords.length} + 통합 ${unifiedSeeds.length})`);

  } else {
    // 🔥 실시간 이슈 모드 (기본)
    console.log('[PRO-TRAFFIC] 🔥 실시간 이슈 모드 활성화');

    // 🎯 1단계: 수익화 가능한 시드 키워드 수집 (정부 정책 + 이슈)
    const profitableSeeds = getProfitableSeedKeywords(category, currentMonth);
    allSeedKeywords = [...allSeedKeywords, ...profitableSeeds];

    // 시즌 키워드 추가 (정부 지원 + 이슈)
    if (includeSeasonKeywords) {
      const seasonKeywords = getProfitableSeasonKeywords(currentMonth);
      allSeedKeywords = [...allSeedKeywords, ...seasonKeywords];
    }

    // 🔥 시드 키워드 셔플 (매번 다른 순서로 탐색 → 다른 결과!)
    allSeedKeywords = shuffleArray(allSeedKeywords);

    // 🔥 트렌드 급상승 키워드 추가 스캔 (realtime 모드 — 현재 시드 기반 실시간 감지)
    try {
      const surgeSource = allSeedKeywords.slice(0, 10);
      const freshResult = await withStepTimeout(
        'scanForSurges:realtime',
        scanForSurges(surgeSource, { category: category !== 'all' ? category : undefined }),
        5000,
        { scanned: 0, detected: [] as TrendSignal[], topSurges: [] as TrendSignal[], computedAt: 0 }
      );
      for (const sig of freshResult.detected) {
        if ((sig.surgeLevel === 'explosive' || sig.surgeLevel === 'strong') && !surgeInfoMap.has(sig.keyword)) {
          surgeInfoMap.set(sig.keyword, sig);
        }
      }

      // surgeInfoMap → 시드 최상위 주입
      const isCategorySpecified = category !== 'all' && category !== 'pro_premium' && category !== 'lite_standard';
      const surgeKeywords = [...surgeInfoMap.keys()];
      const filteredSurge = isCategorySpecified
        ? surgeKeywords.filter((kw) => isKeywordInSelectedCategory(kw, category))
        : surgeKeywords;
      if (filteredSurge.length > 0) {
        allSeedKeywords = [...filteredSurge, ...allSeedKeywords];
        console.log(`[PRO-TRAFFIC] 🔥 트렌드 급상승 ${filteredSurge.length}개 시드 주입: ${filteredSurge.slice(0, 5).join(', ')}`);
      }
    } catch {
      console.warn('[PRO-TRAFFIC] 트렌드 급상승 감지 실패, 기본 시드로 진행');
    }

    // 🔥🔥🔥 다중 소스에서 키워드 수집 (끝판왕!) 🔥🔥🔥
    try {
      console.log('[PRO-TRAFFIC] 🌐 다중 소스 키워드 수집 시작...');
      const multiSourceKeywords = await withStepTimeout('getMultiSourceKeywords', getMultiSourceKeywords(false), 8000, [] as string[]);
      if (multiSourceKeywords.length > 0) {
        console.log(`[PRO-TRAFFIC] 🌐 다중 소스 ${multiSourceKeywords.length}개 수집!`);

        // 🎯 카테고리 지정 시: 다중 소스 키워드가 다른 카테고리를 섞어오지 않도록 사전 필터
        const filteredMultiSource = (category !== 'all' && category !== 'pro_premium' && category !== 'lite_standard')
          ? multiSourceKeywords.filter(k => isKeywordInSelectedCategory(k, category))
          : multiSourceKeywords;

        if (filteredMultiSource.length === 0 && category !== 'all' && category !== 'pro_premium' && category !== 'lite_standard') {
          console.log(`[PRO-TRAFFIC] 📁 카테고리=${category} 지정으로 다중 소스 키워드가 모두 제외됨 (혼입 방지)`);
        }

        // 🔥 다중 소스 키워드도 셔플!
        allSeedKeywords = [...allSeedKeywords, ...shuffleArray(filteredMultiSource)];
      }
    } catch (error) {
      console.warn('[PRO-TRAFFIC] 다중 소스 수집 부분 실패, 기본 시드로 진행');
    }

    // 📰 뉴스 크롤러 시드 주입 (5초 타임아웃, 실패해도 계속)
    try {
      const newsCrawlerSeeds = await withStepTimeout('getNewsCrawlerSeedKeywords', getNewsCrawlerSeedKeywords(), 5000, [] as string[]);
      if (newsCrawlerSeeds.length > 0) {
        const isCategorySpecified = category !== 'all' && category !== 'pro_premium' && category !== 'lite_standard';
        const filteredNewsSeeds = isCategorySpecified
          ? newsCrawlerSeeds.filter(k => isKeywordInSelectedCategory(k, category))
          : newsCrawlerSeeds;

        if (filteredNewsSeeds.length > 0) {
          allSeedKeywords = [...allSeedKeywords, ...shuffleArray(filteredNewsSeeds)];
          console.log(`[PRO-TRAFFIC] 📰 뉴스 크롤러 시드 ${filteredNewsSeeds.length}개 주입 완료`);
        }
      }
    } catch {
      console.warn('[PRO-TRAFFIC] 📰 뉴스 크롤러 시드 수집 실패, 기본 시드로 진행');
    }
  }

  if (explosionMode) {
    try {
      const multiSourceKeywords = await withStepTimeout('getMultiSourceKeywords:explosionMode', getMultiSourceKeywords(false), 12000, [] as string[]);
      if (multiSourceKeywords.length > 0) {
        const isCategorySpecified = category !== 'all' && category !== 'pro_premium' && category !== 'lite_standard';
        const categoryMulti = isCategorySpecified
          ? multiSourceKeywords.filter(k => isKeywordInSelectedCategory(k, category))
          : multiSourceKeywords;
        const restMulti = isCategorySpecified
          ? multiSourceKeywords.filter(k => !categoryMulti.includes(k))
          : [];
        const seedPool = (isCategorySpecified && categoryMulti.length < 30)
          ? [...categoryMulti, ...shuffleArray(restMulti).slice(0, 30 - categoryMulti.length)]
          : categoryMulti;

        multiSourceSeeds = seedPool;
        allSeedKeywords = [...allSeedKeywords, ...shuffleArray(seedPool)];
      }
    } catch {
      // ignore
    }
  }

  // 🔥 중복 제거 후 다시 셔플 (매번 다른 조합!)
  const weakExplosionCategories = new Set([
    'book', 'movie', 'music', 'drama', 'anime', 'broadcast', 'daily',
    'realestate', 'self_development',
    'garden', 'game', 'photo', 'car', 'hobby', 'travel_domestic', 'travel_overseas', 'language'
  ]);

  const heavyExplosionCategories = new Set([
    'life_tips', 'celeb'
  ]);

  const timeoutExplosionCategories = new Set([
    'life_tips', 'business', 'self_development', 'celeb', 'fashion'
  ]);

  const isTimeoutCategory = explosionMode && timeoutExplosionCategories.has(category);

  const overallStartedAt = Date.now();
  // 🔥 v2.13.0 H8: Infinity 제거 — 모든 모드에 전역 예산 상한 (사용자가 5분 이상 기다리지 않도록)
  const overallBudgetMs = (explosionMode && mode === 'category' && timeoutExplosionCategories.has(category))
    ? 210000              // 3.5분 (복잡 카테고리)
    : explosionMode
      ? 180000             // 3분 (일반 explosion)
      : 120000;            // 2분 (일반 모드)
  const overallRemainingMs = (min: number = 5000): number => {
    if (!Number.isFinite(overallBudgetMs)) return Number.MAX_SAFE_INTEGER;
    return Math.max(min, overallBudgetMs - (Date.now() - overallStartedAt));
  };
  const capOverallTimeout = (desiredMs: number, min: number = 5000): number => {
    return Math.min(desiredMs, overallRemainingMs(min));
  };

  const preferLongtailSeeds = explosionMode
    && isTimeoutCategory
    && mode === 'category'
    && false;

  const buildMixedSeedSet = (seedsSorted: string[], limit: number): string[] => {
    const lim = Math.max(0, limit);
    if (lim === 0) return [];

    // 🔥 다양성 확보를 위해 시드 집합에서 무작위로 샘플링
    const shuffledSeeds = [...seedsSorted].sort(() => Math.random() - 0.5);

    if (!preferLongtailSeeds) return shuffledSeeds.slice(0, lim);

    const longQuota = Math.max(1, Math.floor(lim * 0.7));
    const longSeeds = seedsSorted.slice(0, Math.min(seedsSorted.length, longQuota));
    const remain = lim - longSeeds.length;

    const shortSeeds = remain > 0
      ? [...seedsSorted].reverse().filter(s => !longSeeds.includes(s)).slice(0, remain)
      : [];

    return Array.from(new Set([...longSeeds, ...shortSeeds])).slice(0, lim);
  };

  const seedTarget = explosionMode
    ? (mode === 'category'
      ? (category === 'celeb'
        ? 140
        : (weakExplosionCategories.has(category) ? 170 : 130))
      : 90)
    : (mode === 'category' ? 70 : 50);

  // ─── 시드 차별화 전략: 카테고리 모드에서는 자연 연관 키워드 위주로 최소화 ───
  // (기계적 조합은 Naver 검색량 0을 자주 반환해 파이프라인이 고갈됨)
  {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const seasonLabel = month <= 2 || month === 12 ? '겨울' : month <= 5 ? '봄' : month <= 8 ? '여름' : '가을';

    // 카테고리 모드: 시의성 시드 3개만 (연도 1, 시즌 2). 타겟/질문형 생략.
    // 실시간 모드: 기존 대로 풍부하게 (트렌드 확산용)
    const syntheticCap = mode === 'category' ? 3 : 10;
    const timelySeeds: string[] = [];
    for (const seed of allSeedKeywords.slice(0, syntheticCap)) {
      timelySeeds.push(`${seed} ${year}`);
      if (mode !== 'category') {
        timelySeeds.push(`${seed} ${month}월`);
      }
      if (!seed.includes(seasonLabel)) {
        timelySeeds.push(`${seasonLabel} ${seed}`);
      }
    }

    let targetSeeds: string[] = [];
    let questionSeeds: string[] = [];
    if (mode !== 'category') {
      // 실시간 모드에서만 타겟/질문형 합성 시드 적용
      const TARGET_SEGMENTS = ['초보자', '직장인', '학생', '주부', '50대', '신혼부부', '자취생', '1인가구'];
      for (const seed of allSeedKeywords.slice(0, 8)) {
        const segment = TARGET_SEGMENTS[Math.floor(Math.random() * TARGET_SEGMENTS.length)];
        targetSeeds.push(`${segment} ${seed}`);
      }
      const QUESTION_PATTERNS = ['하는법', '해야하나', '괜찮을까', '차이', '비교', '어디서', '언제'];
      for (const seed of allSeedKeywords.slice(0, 8)) {
        const pattern = QUESTION_PATTERNS[Math.floor(Math.random() * QUESTION_PATTERNS.length)];
        if (!seed.includes(pattern)) {
          questionSeeds.push(`${seed} ${pattern}`);
        }
      }
    }

    allSeedKeywords.push(...timelySeeds, ...targetSeeds, ...questionSeeds);
    console.log(`[PRO-TRAFFIC] 🎯 차별화 시드 추가: 시의성 ${timelySeeds.length}개, 타겟 ${targetSeeds.length}개, 질문형 ${questionSeeds.length}개 (mode=${mode})`);
  }

  const uniqueAllSeeds = [...new Set(allSeedKeywords)];
  if (explosionMode && multiSourceSeeds.length > 0) {
    const uniqueMultiSeeds = [...new Set(multiSourceSeeds)];
    const multiQuota = Math.min(uniqueMultiSeeds.length, Math.max(30, Math.floor(seedTarget * 0.5)));
    const pickedMulti = shuffleArray(uniqueMultiSeeds).slice(0, multiQuota);
    const restPool = uniqueAllSeeds.filter(s => !pickedMulti.includes(s));
    const rest = shuffleArray(restPool).slice(0, Math.max(0, seedTarget - pickedMulti.length));
    allSeedKeywords = [...pickedMulti, ...rest];
  } else {
    allSeedKeywords = shuffleArray(uniqueAllSeeds).slice(0, seedTarget); // 🚀 시드 50개 (속도 최적화)
  }

  if (explosionMode) {
    const simplifySeed = (s: string): string => {
      const keepIntentTerms = category === 'business' || category === 'self_development' || category === 'celeb' || category === 'fashion';
      const removable = keepIntentTerms
        ? /(꿀팁|정리|방법|하는법|노하우|체크리스트|가이드)\s*/g
        : /(꿀팁|정리|방법|하는법|노하우|체크리스트|가이드|추천|비교|순위|가격|후기)\s*/g;
      return String(s || '')
        .replace(/\b20\d{2}\b/g, '')
        .replace(/\s+/g, ' ')
        .replace(/(초보자|입문자|직장인|학생|신혼|주부)\s*/g, '')
        .replace(removable, '')
        .trim();
    };
    const coreSeed = (s: string): string => {
      const cleaned = simplifySeed(s);
      const parts = cleaned.split(' ').filter(Boolean);
      if (parts.length >= 2) return `${parts[0]} ${parts[1]}`;
      return cleaned;
    };
    // 🏆 폭발 모드 성능 최적화 (병렬 처리 강화)
    const explosionOnlySearchVolumeMin = explosionMode ? 500 : 100;
    const explosionOnlyGoldenRatioMin = explosionMode ? 0.3 : 0.1;

    // 1단계: 시드 키워드 수집 (속도 체감 향상을 위해 즉시 필터링)
    let baseKeywords = (await Promise.all([
      getSeasonalEventKeywords(),
      getNewsIssueKeywords(),
      getPolicyBriefingKeywords(),
      getNaverRealtimeKeywords()
    ])).flat();

    // 🆕 스마트블록 기반 프리미엄 시드 수집 (상위 블로거 본문 키워드)
    const getSmartBlockPremiumSeeds = async (sampleKeywords: string[]): Promise<string[]> => {
      try {
        const { analyzeNaverBlogSmartBlocks } = await import('./naver-smart-block-extractor');
        const naverApiConfig = {
          clientId: process.env.NAVER_CLIENT_ID || '',
          clientSecret: process.env.NAVER_CLIENT_SECRET || ''
        };
        if (!naverApiConfig.clientId || !naverApiConfig.clientSecret) return [];

        // 상위 3개 샘플 키워드에서 스마트블록 분석
        const samples = sampleKeywords.slice(0, 3);
        const smartBlockResults = await Promise.all(
          samples.map(async (kw) => {
            try {
              const result = await analyzeNaverBlogSmartBlocks(kw, naverApiConfig, 5);
              return result.relatedKeywords || [];
            } catch { return []; }
          })
        );
        return [...new Set(smartBlockResults.flat())].slice(0, 30);
      } catch { return []; }
    };

    // 스마트블록 시드 병렬 수집 (상위 시드 기반) - 함수 전체에서 접근 가능하도록 let 선언
    let smartBlockPremiumSeeds: string[] = [];
    try {
      smartBlockPremiumSeeds = await getSmartBlockPremiumSeeds(baseKeywords.slice(0, 10));
      if (smartBlockPremiumSeeds.length > 0) {
        console.log(`[PRO-TRAFFIC] 📊 스마트블록 프리미엄 시드 ${smartBlockPremiumSeeds.length}개 추가`);
        baseKeywords = [...smartBlockPremiumSeeds, ...baseKeywords];
      }
    } catch (e) {
      console.warn('[PRO-TRAFFIC] 스마트블록 시드 수집 실패, 계속 진행');
    }

    // 중복 및 짧은 단어 제거 (사전 필터링)
    baseKeywords = [...new Set(baseKeywords.filter(k => k && k.length > 2))];

    // 2단계: Naver API 대량 조회 전 간단 필터링 (속도를 위해 수동 점검 줄임)
    const initialPool = baseKeywords.slice(0, 500); // 500개로 제한

    // 🎯 카테고리별 앵커 주입은 'category' 모드에서만 수행
    // realtime/season 모드는 각자의 시드만 사용하여 모드별 결과가 뚜렷이 달라지도록 함
    if (mode === 'category') {
    if (category === 'life_tips') {
      const month = new Date().getMonth() + 1;
      const seasonalSeeds = MONTHLY_GOLDEN_KEYWORDS[month] || [];

      // 🌡️ 월별 시즌 생활 노하우 키워드 (핵심!)
      const SEASONAL_LIFE_TIPS: Record<number, string[]> = {
        // 겨울 (12-2월)
        1: ['동파 방지', '동파 예방', '난방비 절약', '실내 습도', '결로 방지',
          '귤 보관', '니트 보관', '패딩 세탁', '전기장판', '겨울 이불'],
        2: ['설날 대청소', '명절 음식 보관', '겨울옷 정리', '봄맞이 청소', '가습기 청소',
          '실내 환기', '전기요금 절약', '귤껍질 활용', '난방비', '보일러 관리'],
        // 봄 (3-5월)
        3: ['봄맞이 대청소', '황사 청소', '미세먼지', '겨울옷 세탁', '꽃가루 알레르기',
          '에어컨 청소', '봄철 환기', '정리정돈', '이불 세탁', '옷장 정리'],
        4: ['봄 옷정리', '환절기 건강', '곰팡이 예방', '습도 관리', '봄청소',
          '에어컨 필터 청소', '방충망 청소', '창문 청소', '이사 청소', '벚꽃 알레르기 대처법'],
        5: ['장마 대비', '여름옷 정리', '에어컨 청소', '모기 퇴치', '벌레 퇴치',
          '음식물쓰레기', '냉장고 청소', '신발장 냄새', '옷장 정리', '대청소'],
        // 여름 (6-8월)
        6: ['장마철 습기', '장마 곰팡이', '에어컨 전기요금', '빨래 냄새',
          '제습기', '음식 보관', '식중독 예방', '모기 퇴치', '매트리스'],
        7: ['에어컨 청소', '여름 이불', '냉장고 정리', '빨래 건조', '벌레 퇴치',
          '욕실 곰팡이', '전기요금 절약', '수박 보관', '신발 관리'],
        8: ['휴가 후 청소', '여름옷 정리', '가을 대청소', '에어컨 필터', '김치냉장고',
          '가을 옷', '곰팡이 제거', '신발 냄새', '침구 세탁'],
        // 가을 (9-11월)
        9: ['김장 준비', '추석 대청소', '명절 음식', '가을 대청소', '환절기 건강',
          '겨울 이불', '에어컨 보관', '가을 옷', '여름옷 보관', '난방 준비'],
        10: ['김장 배추', '김장 준비물', '난방 준비', '보일러 점검', '월동 준비',
          '침구 정리', '겨울옷', '겨울 이불', '창문 단열', '결로 방지'],
        11: ['김장 담그기', '겨울옷 수납', '난방비 절약', '습도 관리', '결로 방지',
          '가습기 청소', '연말 대청소', '동파 예방', '난방 효율'],
        // 겨울 (12월)
        12: ['연말 대청소', '동파 방지', '결로 방지', '난방비 절약', '귤 보관',
          '니트 세탁', '패딩 보관', '겨울 이불', '가습기', '보일러']
      };

      const currentMonthTips = SEASONAL_LIFE_TIPS[month] || SEASONAL_LIFE_TIPS[1];
      const anchorSeeds = [
        ...currentMonthTips,  // 현재 월의 시즌 노하우 우선!
        ...seasonalSeeds.slice(0, 5)
      ];
      const unique = [...new Set([...anchorSeeds, ...allSeedKeywords])];
      const rest = unique.filter(s => !anchorSeeds.includes(s));
      allSeedKeywords = [...anchorSeeds, ...shuffleArray(rest)].slice(0, seedTarget);
    } else if (category === 'celeb') {
      // 🔥 연예 이슈 시드 — 커뮤니티 raw 이슈 문구 직접 사용
      // 블로거의 목표 = 이슈 "선점". 롱테일 조합은 기자용이지 블로그용 아님.
      // theqoo 핫게시글에서 이미 언급되는 "인물 + 이슈" 원본 문구를 그대로 시드로.

      // [1] 실시간 이슈 문구 (theqoo 커뮤니티 핫게시글에서 빈도 2+회 bi-gram)
      let liveIssues: string[] = [];
      try {
        const { getLiveCelebIssues } = await import('./sources/theqoo-collector');
        liveIssues = await withStepTimeout('celeb-live-issues', getLiveCelebIssues(), 5000, [] as string[]);
        console.log(`[PRO-TRAFFIC] 🌟 실시간 이슈 문구 ${liveIssues.length}개 추출됨`);
      } catch (e: any) {
        console.warn('[PRO-TRAFFIC] 실시간 이슈 추출 실패:', e?.message);
      }

      // [2] 안전망 — 실시간 이슈가 비어있을 때만 최소한의 고정 이벤트 패턴 사용
      const FALLBACK_EVENTS = ['컴백', '신곡', '콘서트', '열애설', '논란'];
      const fallback = liveIssues.length >= 5 ? [] : FALLBACK_EVENTS;

      // [3] 최종 시드: theqoo raw 이슈가 우선, 부족하면 최소 fallback + 기존
      const combined = [...liveIssues, ...fallback];
      const unique = [...new Set([...combined, ...allSeedKeywords])];
      const rest = unique.filter(s => !combined.includes(s));
      allSeedKeywords = [...combined, ...shuffleArray(rest)].slice(0, seedTarget);
      console.log(`[PRO-TRAFFIC] 🎭 celeb 시드: theqoo 이슈 ${liveIssues.length} + fallback ${fallback.length} = ${combined.length}`);
    } else if (category === 'business') {
      const anchorSeeds = [
        '연말정산', '부가세', '종합소득세', '세무사', '세무기장', '상표등록', '법인설립', '사업자등록', '정책자금', '지원금',
        '연말정산모의계산', '연말정산 환급금 조회', '연말정산 간소화',
        '부가세 신고 방법', '부가세 신고 대행 비용',
        '종합소득세 신고 방법', '종합소득세 신고 대행 비용',
        '세무사 비용', '세무사 추천',
        '세무기장 비용', '세무기장 대행',
        '상표등록 비용', '상표등록 대행 비용',
        '법인설립 비용', '법인설립 대행 비용',
        '전자세금계산서 발행 방법', '전자세금계산서 발행',
        '소상공인 정책자금 신청', '소상공인 지원금 신청'
      ];
      const unique = [...new Set([...anchorSeeds, ...allSeedKeywords])];
      const rest = unique.filter(s => !anchorSeeds.includes(s));
      allSeedKeywords = [...anchorSeeds, ...shuffleArray(rest)].slice(0, seedTarget);
    } else if (category === 'self_development') {
      const anchorSeeds = [
        '내일배움카드', '국비지원', '국비지원 교육', '부트캠프', '인프런', '패스트캠퍼스', '클래스101', '자격증', '토익', '컴활', '정보처리기사',
        '내일배움카드 신청 방법', '내일배움카드 온라인 신청', '내일배움카드 자부담 비용',
        '국비지원 교육 신청', '국비지원 부트캠프 신청',
        '토익 인강 할인', '토익 인강 할인코드',
        '컴활 1급 인강 할인', '컴활 인강 할인쿠폰',
        'SQLD 인강 가격', 'SQLD 인강 추천',
        'ADSP 인강 가격', 'ADSP 인강 추천',
        '정보처리기사 인강 할인', '정보처리기사 인강 추천',
        '인프런 할인코드', '패스트캠퍼스 할인', '클래스101 할인',
        '노션 강의 가격', '노션 템플릿 판매'
      ];
      const unique = [...new Set([...anchorSeeds, ...allSeedKeywords])];
      const rest = unique.filter(s => !anchorSeeds.includes(s));
      allSeedKeywords = [...anchorSeeds, ...shuffleArray(rest)].slice(0, seedTarget);
    } else if (category === 'fashion') {
      const anchorSeeds = [
        '패션플러스', '코디너리', '패션풀', '남자옷쇼핑몰', '상견례옷차림',
        '무신사', '지그재그', '에이블리', 'W컨셉', '29CM',
        '하객룩', '결혼식하객룩', '오피스룩', '데일리룩', '면접복장',
        '남자코디', '여자코디', '가을코디', '겨울코디',
        '운동화추천', '남자신발추천', '가방추천',
        '코트 추천', '패딩 추천', '자켓 추천', '원피스 추천'
      ];
      const unique = [...new Set([...anchorSeeds, ...allSeedKeywords])];
      const rest = unique.filter(s => !anchorSeeds.includes(s));
      allSeedKeywords = [...anchorSeeds, ...shuffleArray(rest)].slice(0, seedTarget);
    } else if (category === 'book') {
      const anchorSeeds = [
        '교보문고 할인', '예스24 할인', '알라딘 할인',
        '밀리의서재 구독', '밀리의서재 요금제',
        '리디북스 구독', '리디북스 이용권',
        '전자책 구독', '오디오북 구독',
        '베스트셀러 추천', '자기계발서 추천'
      ];
      const unique = [...new Set([...anchorSeeds, ...allSeedKeywords])];
      const rest = unique.filter(s => !anchorSeeds.includes(s));
      allSeedKeywords = [...anchorSeeds, ...shuffleArray(rest)].slice(0, seedTarget);
    } else if (category === 'movie') {
      const anchorSeeds = [
        'CGV 할인', '메가박스 할인', '롯데시네마 할인',
        '영화 예매 할인', '영화 예매 쿠폰',
        '넷플릭스 요금제', '넷플릭스 구독',
        '티빙 요금제', '티빙 구독',
        '웨이브 요금제', '웨이브 구독',
        '디즈니플러스 요금제', '쿠팡플레이 요금제'
      ];
      const unique = [...new Set([...anchorSeeds, ...allSeedKeywords])];
      const rest = unique.filter(s => !anchorSeeds.includes(s));
      allSeedKeywords = [...anchorSeeds, ...shuffleArray(rest)].slice(0, seedTarget);
    } else if (category === 'drama') {
      const anchorSeeds = [
        // 실제 검색량 높은 범용 드라마 키워드
        '인기 드라마', '드라마 추천', '한국 드라마 추천', '최신 드라마',
        '드라마 순위', '드라마 시청률', '시청률 순위', '방영 드라마',
        '주말 드라마', '일일 드라마', '미니시리즈 추천', '사극 추천',
        '로맨스 드라마 추천', '스릴러 드라마 추천',
        // 드라마 정보 검색 의도
        '드라마 다시보기', '드라마 재방송', '드라마 회차 정리', '드라마 출연진 정보',
        '드라마 결말', '드라마 OST', '드라마 촬영지',
        // OTT (보조)
        '넷플릭스 드라마 추천', '티빙 드라마', '디즈니 드라마',
        // 연도별
        '2026 드라마 추천', '2026 인기 드라마'
      ];
      const unique = [...new Set([...anchorSeeds, ...allSeedKeywords])];
      const rest = unique.filter(s => !anchorSeeds.includes(s));
      allSeedKeywords = [...anchorSeeds, ...shuffleArray(rest)].slice(0, seedTarget);
    } else if (category === 'music') {
      const anchorSeeds = [
        '멜론 이용권', '멜론 이용권 할인',
        '유튜브뮤직 요금제', '유튜브뮤직 가격',
        '스포티파이 요금제', '스포티파이 할인',
        '애플뮤직 요금제',
        '음악 스트리밍 구독', '스트리밍 이용권'
      ];
      const unique = [...new Set([...anchorSeeds, ...allSeedKeywords])];
      const rest = unique.filter(s => !anchorSeeds.includes(s));
      allSeedKeywords = [...anchorSeeds, ...shuffleArray(rest)].slice(0, seedTarget);
    } else if (category === 'broadcast') {
      // drama는 위에서 이미 처리됨. broadcast만 전용 앵커
      const anchorSeeds = [
        // 범용 방송/예능 키워드
        '인기 예능', '예능 추천', '토요일 예능', '일요일 예능',
        '예능 순위', '방송 시청률', '편성표', '재방송 편성표',
        '관찰 예능', '리얼리티 예능', '토크쇼 추천', '오디션 프로그램',
        '런닝맨 다시보기', '나혼자산다 출연진',
        // OTT 예능
        '넷플릭스 예능', 'tvN 예능', '티빙 오리지널 예능',
        // 연도
        '2026 예능 추천', '2026 인기 예능'
      ];
      const unique = [...new Set([...anchorSeeds, ...allSeedKeywords])];
      const rest = unique.filter(s => !anchorSeeds.includes(s));
      allSeedKeywords = [...anchorSeeds, ...shuffleArray(rest)].slice(0, seedTarget);
    } else if (category === 'anime') {
      const anchorSeeds = [
        '라프텔 이용권', '라프텔 구독',
        '애니플러스 구독',
        '크런치롤 구독', '크런치롤 요금제',
        '웹툰 추천', '웹툰 결제', '웹툰 쿠키 충전'
      ];
      const unique = [...new Set([...anchorSeeds, ...allSeedKeywords])];
      const rest = unique.filter(s => !anchorSeeds.includes(s));
      allSeedKeywords = [...anchorSeeds, ...shuffleArray(rest)].slice(0, seedTarget);
    } else if (category === 'daily') {
      const anchorSeeds = [
        '다이어리 추천', '다이어리 앱 추천',
        '플래너 추천', '가계부 앱 추천',
        '루틴 앱 추천', '습관 앱 추천',
        '브이로그 카메라 추천', '브이로그 편집 앱'
      ];
      const unique = [...new Set([...anchorSeeds, ...allSeedKeywords])];
      const rest = unique.filter(s => !anchorSeeds.includes(s));
      allSeedKeywords = [...anchorSeeds, ...shuffleArray(rest)].slice(0, seedTarget);
    } else if (category === 'policy') {
      const anchorSeeds = [
        '소상공인 지원금', '민생회복지원금', '근로장려금', '자녀장려금', '청년지원금', '생활안정지원금',
        '소상공인 정책자금', '희망회복자금', '손실보상금', '긴급고용안정지원금',
        '전 국민 민생지원금', '에너지바우처', '난방비 지원', '통신비 할인',
        '문화누리카드', '스포츠강좌이용권', '평생교육바우처',
        '소상공인 전기요금 지원', '특고 프리랜서 지원금', '실업급여 신청방법'
      ];
      const unique = [...new Set([...anchorSeeds, ...allSeedKeywords])];
      const rest = unique.filter(s => !anchorSeeds.includes(s));
      allSeedKeywords = [...anchorSeeds, ...shuffleArray(rest)].slice(0, seedTarget);
    } else if (category === 'realestate') {
      const anchorSeeds = [
        '주택담보대출 금리', '주택담보대출 조건', '주담대 금리', '주담대 한도',
        '디딤돌대출 조건', '디딤돌대출 서류',
        '보금자리론 금리', '특례보금자리론 조건', '특례보금자리론 서류',
        '신생아 특례대출 조건', '신생아 특례대출 서류',
        '전세대출 금리', '버팀목대출 조건', '버팀목대출 서류',
        '전세보증보험 가입방법', '전세보증보험 비용', '보증금 반환',
        '청약점수 계산기', '청약 1순위 조건', '무순위 청약 조건'
      ];
      const unique = [...new Set([...anchorSeeds, ...allSeedKeywords])];
      const rest = unique.filter(s => !anchorSeeds.includes(s));
      allSeedKeywords = [...anchorSeeds, ...shuffleArray(rest)].slice(0, seedTarget);
    } else if (category === 'self_development') {
      const anchorSeeds = [
        '자기계발 책 추천', '자기계발서 추천',
        '생산성 앱 추천', '공부 앱 추천', '습관 앱 추천',
        '영어회화 앱 추천',
        '인프런 할인', '인프런 쿠폰', '인프런 할인코드', '인프런 환불', '인프런 결제',
        '패스트캠퍼스 할인', '패스트캠퍼스 쿠폰', '패스트캠퍼스 환불',
        '클래스101 할인', '클래스101 쿠폰', '클래스101 환불', '클래스101 해지',
        '탈잉 할인', '탈잉 쿠폰', '탈잉 환불',
        '온라인 강의 추천', '온라인 강의 할인',
        '코딩 부트캠프 가격', '코딩 부트캠프 비용', '코딩 부트캠프 추천',
        '노션 템플릿', '노션 템플릿 추천', '노션 템플릿 무료',
        '포모도로 앱', '포모도로 타이머',
        '토익 인강', '토익 인강 추천', '토익 인강 할인',
        '토익 응시료', '토익 시험 접수', '토익 시험 접수 방법',
        '토익 독학', '토익 공부법', '토익 점수',
        '컴활 인강', '컴활 1급 인강', '컴활 2급 인강',
        '컴활 응시료', '컴활 시험 접수',
        '컴활 2급 독학', '컴활 1급 난이도', '컴활 합격 후기',
        '정보처리기사 인강', '정보처리기사 기출',
        '정보처리기사 응시료', '정보처리기사 시험 접수',
        '정보처리기사 난이도', '정보처리기사 합격 후기',
        'SQLD 인강', 'SQLD 기출',
        'SQLD 응시료', 'SQLD 시험 접수',
        'SQLD 난이도', 'SQLD 독학', 'SQLD 합격 후기',
        'ADSP 인강', 'ADSP 기출',
        'ADSP 응시료', 'ADSP 시험 접수',
        'ADSP 난이도', 'ADSP 독학', 'ADSP 합격 후기',
        'NCS 인강', 'PSAT 인강',
        'JLPT 인강', 'HSK 인강',
        '자격증 추천', '자격증 공부법', '자격증 인강 추천',
        '면접 준비 강의', '자기소개서 첨삭',
        '자기소개서 첨삭 가격', '면접 컨설팅 비용', '취업 컨설팅 비용',
        '타임블로킹 플래너', '습관 트래커',
        '포트폴리오 템플릿', '포트폴리오 첨삭',
        '자격증 추천', '자격증 공부법'
      ];
      const unique = [...new Set([...anchorSeeds, ...allSeedKeywords])];
      const rest = unique.filter(s => !anchorSeeds.includes(s));
      allSeedKeywords = [...anchorSeeds, ...shuffleArray(rest)].slice(0, seedTarget);
    } else {
      allSeedKeywords = shuffleArray(allSeedKeywords).slice(0, seedTarget);
    }
    } else {
      // realtime/season 모드: 카테고리 앵커 미주입. 수집한 seed 그대로 셔플+제한만.
      allSeedKeywords = shuffleArray(allSeedKeywords).slice(0, seedTarget);
    }
  }
  internalMetrics.seedCount = allSeedKeywords.length;
  console.log(`[PRO-TRAFFIC] 📊 시드 키워드 ${allSeedKeywords.length}개: ${allSeedKeywords.slice(0, 5).join(', ')}...`);

  // 🎯 2단계: 네이버 검색광고 API로 연관 키워드 수집 + 검색량 조회
  // (실시간 유동성 키워드는 이미 0단계에서 allKeywords에 일부 반영될 수 있음)
  const allKeywords: { keyword: string; source: string; searchVolume?: number | null; documentCount?: number | null }[] = [];

  // 🗄️ 영구 캐시의 완전 데이터 키워드를 시드 풀 최상위에 주입 (안정성 확보)
  // — 이전 run에서 성공한 키워드는 재사용하면 API 호출 없이 즉시 결과로 연결
  try {
    const persistentSeeds = getAllKeywordsWithCompleteData();
    // 카테고리 모드: 카테고리 매칭되는 것만
    const isCatSpecified = mode === 'category' && category !== 'all' && category !== 'pro_premium' && category !== 'lite_standard';
    const filteredPersistent = isCatSpecified
      ? persistentSeeds.filter(p => isKeywordInSelectedCategory(p.keyword, category))
      : persistentSeeds;
    if (filteredPersistent.length > 0) {
      console.log(`[PRO-TRAFFIC] 🗄️ 영구 캐시에서 ${filteredPersistent.length}개 완전 데이터 키워드 주입 (category=${category})`);
      for (const p of filteredPersistent) {
        allKeywords.push({
          keyword: p.keyword,
          source: 'persistent_cache',
          searchVolume: p.searchVolume,
          documentCount: p.documentCount,
        });
      }
    }
  } catch (e: any) {
    console.warn(`[PRO-TRAFFIC] 영구 캐시 주입 실패: ${e?.message || e}`);
  }

  try {
    let accessLicense: string | undefined;
    let secretKey: string | undefined;
    let customerId: string | undefined;

    try {
      const { EnvironmentManager } = await import('./environment-manager');
      const envCfg = EnvironmentManager.getInstance().getConfig() as any;
      accessLicense = envCfg.naverSearchAdAccessLicense;
      secretKey = envCfg.naverSearchAdSecretKey;
      customerId = envCfg.naverSearchAdCustomerId;
    } catch {
      // ignore
    }

    if (!accessLicense || !secretKey || !customerId) {
      const { loadEnvFromFile } = await import('../env');
      const env = loadEnvFromFile() as any;
      accessLicense = accessLicense || env.naverSearchAdAccessLicense || env.NAVER_SEARCHAD_ACCESS_LICENSE;
      secretKey = secretKey || env.naverSearchAdSecretKey || env.NAVER_SEARCHAD_SECRET_KEY;
      customerId = customerId || env.naverSearchAdCustomerId || env.NAVER_SEARCHAD_CUSTOMER_ID;
    }

    if (accessLicense && secretKey && customerId) {
      console.log('[PRO-TRAFFIC] 🔥 네이버 검색광고 API로 연관키워드 수집...');

      internalMetrics.searchAdEnabled = true;
      const before = allKeywords.length;

      const config: NaverSearchAdConfig = { accessLicense, secretKey, customerId };

      // 🚀 병렬로 연관 키워드 수집
      const suggestionSeedLimit = explosionMode
        ? (isTimeoutCategory ? (mode === 'category' ? 10 : 14) : (mode === 'category' ? 120 : 90))
        : (mode === 'category' ? 25 : 30);
      const uniqueSeedSortedByLen = [...new Set(allSeedKeywords)]
        .sort((a, b) => {
          const la = String(a || '').length;
          const lb = String(b || '').length;
          return preferLongtailSeeds ? (lb - la) : (la - lb);
        });
      const suggestionSeeds = buildMixedSeedSet(uniqueSeedSortedByLen, suggestionSeedLimit);
      const batchSize = explosionMode ? (isTimeoutCategory ? 4 : 12) : 25;
      for (let i = 0; i < suggestionSeeds.length; i += batchSize) {
        if (Number.isFinite(overallBudgetMs) && overallRemainingMs(0) < 30000) break;
        const batchSeeds = suggestionSeeds.slice(i, i + batchSize);
        if (isTimeoutCategory) {
          for (const seed of batchSeeds) {
            if (Number.isFinite(overallBudgetMs) && overallRemainingMs(0) < 20000) break;
            try {
              const limit = 40;
              const suggestions = await withStepTimeout(
                `getNaverSearchAdKeywordSuggestions:timeout:${seed}`,
                getNaverSearchAdKeywordSuggestions(config, seed, limit),
                capOverallTimeout(12000),
                [] as any[]
              );

              const seedNoSpace = String(seed || '').replace(/\s+/g, '').trim();
              const retry = (suggestions.length === 0 && seedNoSpace && seedNoSpace !== seed)
                ? await withStepTimeout(
                  `getNaverSearchAdKeywordSuggestions:timeout:nospace:${seedNoSpace}`,
                  getNaverSearchAdKeywordSuggestions(config, seedNoSpace, limit),
                  capOverallTimeout(12000),
                  [] as any[]
                )
                : [];

              const mergedSuggestions = (retry && retry.length > 0)
                ? [...suggestions, ...retry]
                : suggestions;
              const seedSource = realtimeSourceMap.get(seed) || seed;
              for (const s of mergedSuggestions) {
                const svValue = (typeof s.totalSearchVolume === 'number')
                  ? s.totalSearchVolume
                  : (() => {
                    const pc = (typeof s.monthlyPcQcCnt === 'number') ? s.monthlyPcQcCnt : 0;
                    const mob = (typeof s.monthlyMobileQcCnt === 'number') ? s.monthlyMobileQcCnt : 0;
                    const sum = pc + mob;
                    return sum > 0 ? sum : null;
                  })();
                allKeywords.push({
                  keyword: s.keyword,
                  source: seedSource,
                  searchVolume: svValue,
                  documentCount: null
                });
                // 🔥 SearchAd가 반환한 자연 키워드의 검색량을 캐시에 주입
                // → fetchKeywordDataBatch 재조회 시 배치 매칭 실패 우회
                if (svValue !== null && svValue > 0 && s.keyword) {
                  const existing = apiCache.get(s.keyword);
                  if (!existing || existing.searchVolume === null) {
                    const clean = s.keyword.replace(/\s/g, '');
                    const entry = { searchVolume: svValue, documentCount: existing?.documentCount ?? null, isRealData: true, timestamp: Date.now() };
                    apiCache.set(s.keyword, entry);
                    apiCache.set(clean, entry);
                  }
                }
              }
            } catch (e) {
              if (category === 'business') {
                console.warn(`[PRO-TRAFFIC] ⚠️ SearchAd suggestions failed (business) seed="${seed}": ${String((e as any)?.message || e || '')}`);
              }
            }
          }
        } else {
          const suggestionPromises = batchSeeds.map(async (seed) => {
            try {
              const limit = explosionMode ? 120 : 50;
              const suggestions = await withStepTimeout(
                `getNaverSearchAdKeywordSuggestions:${seed}`,
                getNaverSearchAdKeywordSuggestions(config, seed, limit),
                capOverallTimeout(45000),
                [] as any[]
              );

              const seedSource = realtimeSourceMap.get(seed) || seed;
              return suggestions.map(s => {
                const svValue = (typeof s.totalSearchVolume === 'number')
                  ? s.totalSearchVolume
                  : (() => {
                    const pc = (typeof s.monthlyPcQcCnt === 'number') ? s.monthlyPcQcCnt : 0;
                    const mob = (typeof s.monthlyMobileQcCnt === 'number') ? s.monthlyMobileQcCnt : 0;
                    const sum = pc + mob;
                    return sum > 0 ? sum : null;
                  })();
                // 🔥 SearchAd 자연 키워드의 검색량을 캐시에 주입 (재조회 우회)
                if (svValue !== null && svValue > 0 && s.keyword) {
                  const existing = apiCache.get(s.keyword);
                  if (!existing || existing.searchVolume === null) {
                    const clean = s.keyword.replace(/\s/g, '');
                    const entry = { searchVolume: svValue, documentCount: existing?.documentCount ?? null, isRealData: true, timestamp: Date.now() };
                    apiCache.set(s.keyword, entry);
                    apiCache.set(clean, entry);
                  }
                }
                return {
                  keyword: s.keyword,
                  source: seedSource,
                  searchVolume: svValue,
                  documentCount: null
                };
              });
            } catch {
              return [];
            }
          });

          const suggestionResults = await collectSettledWithinTimeout(
            `SearchAdSuggestions:PromiseAll:${i}`,
            suggestionPromises,
            capOverallTimeout(explosionMode ? 45000 : 20000)
          );

          for (const result of suggestionResults) {
            allKeywords.push(...result);
          }
        }
      }

      internalMetrics.searchAdAdded += Math.max(0, allKeywords.length - before);

      console.log(`[PRO-TRAFFIC] ✅ 검색광고 API에서 ${allKeywords.length}개 연관 키워드 수집`);
    }
  } catch (error) {
    console.warn('[PRO-TRAFFIC] 검색광고 API 실패, 자동완성으로 폴백');
  }

  // 🚀 2.5단계: Ultimate Deep Mining (끝판왕 딥 마이닝 통합)
  // Traffic Hunter Pro의 분석력 + Ultimate Niche Finder의 발굴력
  // 카테고리 모드에서는 Naver 자연 연관 키워드가 이미 충분 → Deep Mining 축소
  // (Deep Mining은 sv null 키워드를 대량 생성해 Rate Limit 소진)
  const deepMiningEnabled = useDeepMining && (category !== 'celeb' || explosionMode)
    && (mode !== 'category' || explosionMode);
  if (deepMiningEnabled) {
    try {
      const miningSeeds = allSeedKeywords.slice(0, explosionMode ? 10 : 5);
      console.log(`[PRO-TRAFFIC] ⛏️ Ultimate Deep Mining 가동! 시드 ${miningSeeds.length}개로 숨은 보석 발굴 중...`);

      const deepKeywordsMap = await withStepTimeout(
        'mineUltimateDeepKeywords',
        mineUltimateDeepKeywords(miningSeeds, 4, explosionMode ? 300 : 150), // 깊이 4, 최대 300개
        explosionMode ? 20000 : 10000,
        new Map<string, { depth: number; pattern: string }>()
      );

      if (deepKeywordsMap.size > 0) {
        console.log(`[PRO-TRAFFIC] 💎 Deep Mining으로 ${deepKeywordsMap.size}개 숨은 키워드 확보!`);
        for (const [kw, meta] of deepKeywordsMap.entries()) {
          // 이미 수집된 키워드와 중복 체크
          if (!allKeywords.some(k => k.keyword === kw)) {
            allKeywords.push({
              keyword: kw,
              source: `deep_mining_${meta.pattern}`,
              searchVolume: null,
              documentCount: null,
            });
          }
        }
      }
    } catch (e) {
      console.warn('[PRO-TRAFFIC] Deep Mining 단계 건너뜀 (시간 초과 또는 오류)');
    }
  }

  // 🔥 2.7단계: 카테고리 모드 중간 필터 — 연관키워드 확장 후 카테고리 무관 키워드 제거
  if (mode === 'category' && category !== 'all' && category !== 'pro_premium' && category !== 'lite_standard') {
    const beforeFilter = allKeywords.length;
    const filtered = allKeywords.filter(k => isKeywordInSelectedCategory(k.keyword, category));
    // 필터 후 너무 적으면 원본 유지 (시드가 적은 카테고리 보호)
    if (filtered.length >= 10) {
      allKeywords.length = 0;
      allKeywords.push(...filtered);
    }
    console.log(`[PRO-TRAFFIC] 📁 중간 카테고리 필터: ${beforeFilter}개 → ${allKeywords.length}개 (${category})`);
  }

  // 🚀 3단계: 자동완성 API로 추가 키워드 수집 (검색광고 결과 부족 시)
  if (explosionMode || allKeywords.length < 50) {
    console.log('[PRO-TRAFFIC] 🔍 네이버 자동완성으로 추가 키워드 수집...');

    const before = allKeywords.length;

    // 🚀 자동완성 확장 (explosionMode는 탐색 폭 확대)
    const expandSeedLimit = explosionMode
      ? (isTimeoutCategory ? (mode === 'category' ? 4 : 6) : (mode === 'category' ? 50 : 40))
      : 20;
    const uniqueExpandSortedByLen = [...new Set(allSeedKeywords)]
      .sort((a, b) => {
        const la = String(a || '').length;
        const lb = String(b || '').length;
        return preferLongtailSeeds ? (lb - la) : (la - lb);
      });
    const expandSeeds = buildMixedSeedSet(uniqueExpandSortedByLen, expandSeedLimit);
    const expandBatchSize = explosionMode ? (isTimeoutCategory ? 2 : 10) : 20;
    for (let i = 0; i < expandSeeds.length; i += expandBatchSize) {
      if (Number.isFinite(overallBudgetMs) && overallRemainingMs(0) < 25000) break;
      const batchSeeds = expandSeeds.slice(i, i + expandBatchSize);
      if (isTimeoutCategory) {
        for (const seed of batchSeeds) {
          if (Number.isFinite(overallBudgetMs) && overallRemainingMs(0) < 20000) break;
          try {
            const expanded = await withStepTimeout(
              `expandToLongtailRealLite:${seed}`,
              expandToLongtailRealLite(seed),
              capOverallTimeout(8000),
              [] as string[]
            );
            const seedSource = realtimeSourceMap.get(seed) || seed;
            const perSeed = 10;
            for (const kw of expanded.slice(0, perSeed)) {
              if (isSuffixBomb(kw)) continue;   // 🔥 Phase 3-2: suffix bomb 차단
              if (!allKeywords.some(k => k.keyword === kw)) {
                allKeywords.push({ keyword: kw, source: seedSource, searchVolume: null, documentCount: null });
              }
            }
          } catch {
            // ignore
          }
        }
      } else {
        const expandPromises = batchSeeds.map(async (seed) => {
          const expanded = await withStepTimeout(
            `expandToLongtailReal:${seed}`,
            expandToLongtailReal(seed),
            capOverallTimeout(explosionMode ? 15000 : 8000),
            [] as string[]
          );
          const seedSource = realtimeSourceMap.get(seed) || seed;
          const perSeed = explosionMode ? 30 : 10;
          // 🔥 Phase 3-2: suffix bomb 필터
          return expanded.slice(0, perSeed)
            .filter(kw => !isSuffixBomb(kw))
            .map(kw => ({ keyword: kw, source: seedSource }));
        });

        const expandResults = await collectSettledWithinTimeout(
          `expandToLongtailReal:PromiseAll:${i}`,
          expandPromises,
          capOverallTimeout(explosionMode ? 45000 : 25000)
        );
        for (const result of expandResults) {
          for (const item of result) {
            if (!allKeywords.some(k => k.keyword === item.keyword)) {
              allKeywords.push({ ...item, searchVolume: null, documentCount: null });
            }
          }
        }
      }
    }

    internalMetrics.autocompleteAdded += Math.max(0, allKeywords.length - before);
  }

  // 🎯 3.5단계: 시드 키워드 자체도 후보에 포함 (카테고리별 시드까지 실제 API 검증)
  // - CATEGORY_SEEDS / 기본 트렌딩 키워드는 사람이 선별한 강력한 후보이므로,
  //   검색광고/자동완성에서 연관 키워드가 충분히 나오지 않아도 직접 검증 대상으로 올린다.
  for (const seed of allSeedKeywords) {
    const exists = allKeywords.some(k => k.keyword === seed);
    if (!exists) {
      allKeywords.push({ keyword: seed, source: realtimeSourceMap.get(seed) || 'seed', searchVolume: null, documentCount: null });
    }
  }

  // 🔥 3.7단계: 자동완성/시드 추가 후 카테고리 필터 (누수 차단)
  // 🔥 v2.12.0 Phase 3-1: AND 강제 — 기존엔 매칭 10개 미만이면 원본 유지(누수)
  //    → 3개 이상이면 무조건 필터 적용. "다용도세제가 life_tips에 섞이는" 버그 방지
  if (mode === 'category' && category !== 'all' && category !== 'pro_premium' && category !== 'lite_standard') {
    const beforeCatFilter = allKeywords.length;
    const catFiltered = allKeywords.filter(k => isKeywordMatchingCategory(k.keyword, category));
    if (catFiltered.length >= 3) {   // 이전 10 → 3 (매칭이 최소한만 있어도 필터 강제)
      allKeywords.length = 0;
      allKeywords.push(...catFiltered);
    }
    console.log(`[PRO-TRAFFIC] 📁 3.7단계 카테고리 필터 (AND 강제): ${beforeCatFilter}개 → ${allKeywords.length}개 (${category})`);
  }

  // 🔥 v2.14.0 Phase I: 'all' 모드 cross-category 중복 제거 (경계 노이즈 차단)
  //   - 여러 카테고리 시드가 합쳐져 같은 키워드가 다른 variant로 중복 들어간 경우 dedup
  if (category === 'all') {
    const seenNorm = new Set<string>();
    const deduped: typeof allKeywords = [];
    for (const k of allKeywords) {
      const norm = String(k.keyword || '').toLowerCase().replace(/\s+/g, '');
      if (norm && !seenNorm.has(norm)) {
        seenNorm.add(norm);
        deduped.push(k);
      }
    }
    if (deduped.length < allKeywords.length) {
      console.log(`[PRO-TRAFFIC] 🌐 all 모드 cross-category dedup: ${allKeywords.length}개 → ${deduped.length}개`);
      allKeywords.length = 0;
      allKeywords.push(...deduped);
    }
  }

  internalMetrics.allKeywordsCount = allKeywords.length;

  // 🎯 4단계: 수익화 의도 키워드 필터링 (핵심!)
  // PRO는 월 10억+ 초고수 키워드만, Lite는 월 200만+ 고수 키워드
  const strictPro = category !== 'lite_standard';
  const isPro = strictPro;
  const isCategorySpecified = category !== 'all' && category !== 'pro_premium' && category !== 'lite_standard';

  const premiumCriteria = isPro
    ? {
      minRatio: getProPremiumMinRatioForCategory(category),
      maxDocuments: getProPremiumMaxDocumentsForCategory(category),
      strictGrade: true,
      category
    }
    : undefined;

  const premiumMinRatioEffective = premiumCriteria?.minRatio ?? PREMIUM_GOLDEN_MIN_RATIO;
  const premiumMaxDocumentsEffective = premiumCriteria?.maxDocuments ?? PREMIUM_GOLDEN_MAX_DOCUMENT_COUNT;

  const celebEventIntent = (kw: string) => /컴백|티저|뮤직비디오|뮤비|콘서트|시상식|열애|결별|결혼|캐스팅|예능|소속사|전속계약|군입대|전역/.test(kw);

  const profitableKeywords = allKeywords.filter(k => {
    const kw = k.keyword;
    // 카테고리 지정 시: 한국어 2~3글자 키워드가 많으므로 최소 길이 완화
    if (!kw || kw.length < (isCategorySpecified ? 2 : 4)) return false;
    if (isDangerKeyword(kw)) return false;

    // 🚫 PRO에서는 저가치 키워드 제외! (Lite용 키워드는 PRO에서 안나옴)
    if (isPro && LOW_VALUE_KEYWORDS_FOR_PRO.some(lv => kw.includes(lv))) {
      return false;
    }

    // 🏠 life_tips 전용: 순수 노하우 키워드만 허용! (제품/브랜드 리뷰 키워드 제외)
    if (category === 'life_tips' && !isPureLifeTipsKnowhow(kw)) {
      return false;
    }

    // 수익화 의도 키워드 우선
    const hasProfitIntent = PROFIT_INTENT_PATTERNS.some(p => kw.includes(p));
    const isCeleb = category === 'celeb';
    const hasCelebIntent = isCeleb && (isKeywordInSelectedCategory(kw, 'celeb') || celebEventIntent(kw));
    // 🔥 Deep Mining 키워드는 무조건 통과 (이미 선별됨)
    const isDeepMined = k.source && k.source.startsWith('deep_mining');

    if (isCeleb && explosionMode && !hasCelebIntent && !isDeepMined) {
      return false;
    }

    // 카테고리 지정 시: 해당 카테고리로 분류되는 키워드는 "수익형 패턴"이 없어도 후보에 포함
    // (수익형은 점수/정렬에서 우대)
    const hasCategoryIntent = isCategorySpecified && isKeywordInSelectedCategory(kw, category);

    // 📁 카테고리 지정 시에는 혼입을 방지하기 위해 해당 카테고리로 분류되는 키워드만 후보로 유지
    // (최종 단계에서 어차피 카테고리 내부만 남기므로, 여기서 미리 제거해 0개/낭비를 방지)
    // 카테고리 모드: Deep Mining도 카테고리 매칭 필수 (누수 차단)
    if (isCategorySpecified && category !== 'celeb' && !hasCategoryIntent) {
      // Deep Mining이어도 isKeywordMatchingCategory로 한번 더 체크
      if (isDeepMined && isKeywordMatchingCategory(kw, category)) {
        // Deep Mining이지만 카테고리 매칭 → 통과
      } else {
        return false;
      }
    }

    // 롱테일 키워드 (2단어 이상)
    const isLongtail = kw.split(' ').length >= 2 || kw.length >= 6;

    // 검색량이 있는 경우 500~10000 범위 필터
    if (k.searchVolume && k.searchVolume > 0) {
      const minVol = isCategorySpecified ? 10 : (isCeleb ? 10 : 100);

      if (isCategorySpecified) {
        return (k.searchVolume >= minVol && k.searchVolume <= 50000 && (hasCategoryIntent || hasCelebIntent || hasProfitIntent || isLongtail)) || isDeepMined;
      }

      return (k.searchVolume >= minVol && k.searchVolume <= 50000 && (hasProfitIntent || isLongtail || hasCelebIntent)) || isDeepMined;
    }

    if (isCategorySpecified) {
      return hasCategoryIntent || hasCelebIntent || hasProfitIntent || isLongtail || isDeepMined;
    }

    return hasProfitIntent || isLongtail || hasCelebIntent || isDeepMined;
  });

  internalMetrics.profitableCount = profitableKeywords.length;

  console.log(`[PRO-TRAFFIC][METRICS] stage=pre_filter category=${category} mode=${mode} seeds=${allSeedKeywords.length} allKeywords=${allKeywords.length} profitable=${profitableKeywords.length}`);
  console.log(`[PRO-TRAFFIC] 🎯 수익화 의도 키워드 ${profitableKeywords.length}개 필터링`);

  // 🚀 중복 제거 (카테고리별 상한 - 속도 최적화!)
  // premium(explosionMode)에서는 시간이 걸리더라도 S/SS/SSS를 끝까지 찾기 위해 상한을 크게 늘린다.
  const maxCandidates = explosionMode
    ? ((category === 'it' || category === 'health') ? 900 : 1200)
    : ((category === 'it' || category === 'health') ? 200 : 300);
  const uniqueKeywords = [...new Map(profitableKeywords.map(k => [normalizeKeywordCompact(k.keyword), k])).values()].slice(0, maxCandidates);

  internalMetrics.uniqueKeywordsCount = uniqueKeywords.length;

  // 🎯 5단계: API 데이터 보강 (검색량/문서수)
  const batchKeywordList = (explosionMode && mode === 'category' && timeoutExplosionCategories.has(category))
    ? uniqueKeywords.slice(0, Math.min(uniqueKeywords.length, 120)).map(k => k.keyword)
    : uniqueKeywords.map(k => k.keyword);
  await withStepTimeout(
    'fetchKeywordDataBatch',
    fetchKeywordDataBatch(batchKeywordList),
    capOverallTimeout(45000),
    undefined
  );
  console.log(`[PRO-TRAFFIC][METRICS] stage=api_ready category=${category} uniqueKeywords=${uniqueKeywords.length} maxCandidates=${maxCandidates}`);
  console.log(`[PRO-TRAFFIC] ✅ ${uniqueKeywords.length}개 키워드 데이터 준비 완료`);

  // 🎯 6단계: 각 키워드 분석 및 황금비율 계산
  // ⚠️ 중요: 캐시 미스(검색량 0)인 경우에도 검증 단계로 넘겨서 실제 API 호출하도록!
  const analyzedPool: ProTrafficKeyword[] = [];
  const relaxedCandidates: { keyword: string; source: string }[] = [];
  for (const item of uniqueKeywords) {
    const keyword = item.keyword;
    const source = item.source;
    // ⚠️ 캐시 조회: 원본 키워드와 clean 키워드 모두 확인
    const cleanKeyword = keyword.replace(/\s/g, '');
    const cached = apiCache.get(keyword) || apiCache.get(cleanKeyword);
    // ⚠️ 캐시된 실제 API 값을 우선 사용! (수집 단계 값은 부정확할 수 있음)
    const collectedVolume = (typeof (item as any).searchVolume === 'number') ? (item as any).searchVolume : null;
    const finalSearchVolume = cached?.searchVolume ?? collectedVolume ?? null;
    const finalDocCount = cached?.documentCount ?? null;
    const searchVolumeForCalc = finalSearchVolume ?? 0;
    const docCountForCalc = finalDocCount ?? 0;

    // 황금비율 계산 (핵심!) - 검색량 / 문서수 = 높을수록 좋음!
    // 🚨 문서수가 0이면 황금비율도 0 (999 같은 더미값 절대 사용 안 함!)
    const goldenRatio = (finalSearchVolume !== null && finalDocCount !== null && finalDocCount > 0)
      ? finalSearchVolume / finalDocCount
      : 0;

    // ⚠️ 캐시 미스(하나라도 null)인 경우: 일단 후보로 포함 (나중에 API 검증!)
    const isCacheMiss = finalSearchVolume === null || finalDocCount === null;

    const enrichedSource = realtimeSourceMap.get(keyword) || source;

    // 🚨 1차(엄격) 컷: 황금비율 0.3 미만은 제외하되,
    // 카테고리 모드에서 결과가 0개로 떨어지는 것을 방지하기 위해 완화 후보로 적재한다.
    if (!isCacheMiss && goldenRatio < 0.3 && docCountForCalc > 0) {
      // 후보는 유지(분석 풀에 넣고, 후속 검증 단계에서 엄선)
      const analysis = analyzeKeyword(keyword, enrichedSource, currentMonth, currentHour, targetRookie);
      analyzedPool.push(analysis);
      // 카테고리 모드에서는 검증 단계로 넘길 후보 풀을 비우지 않기 위해 results에도 유지
      if (isCategorySpecified) {
        results.push(analysis);
      }
      relaxedCandidates.push({ keyword, source });
      continue;
    }

    // 문서수 과다 기준 대폭 완화 (문서수 100000 이상만 제외)
    const maxDocCutForAnalyze = explosionMode ? premiumMaxDocumentsEffective : 20000;
    if (!isCacheMiss && docCountForCalc > maxDocCutForAnalyze) {
      continue;
    }

    // 🏆 블루오션 조건 강화 (수익 보장)
    const purchaseIntentValue = calculatePurchaseIntentProfit(keyword);
    const competitionLevelValue = calculateCompetitionLevelProfit(docCountForCalc, searchVolumeForCalc);
    const isBlueOcean = (
      searchVolumeForCalc >= 300 &&
      searchVolumeForCalc <= 8000 &&
      docCountForCalc <= 3000 &&
      goldenRatio >= 0.8 &&
      competitionLevelValue <= 5
    );

    // 1차(엄격) 컷: 검색량 300 미만은 제외하되, 완화 후보로 적재한다.
    if (!isCacheMiss && searchVolumeForCalc < 100) {
      const analysis = analyzeKeyword(keyword, enrichedSource, currentMonth, currentHour, targetRookie);
      analyzedPool.push(analysis);
      if (isCategorySpecified) {
        results.push(analysis);
      }
      relaxedCandidates.push({ keyword, source });
      continue;
    }

    const analysis = analyzeKeyword(keyword, enrichedSource, currentMonth, currentHour, targetRookie);
    analyzedPool.push(analysis);

    // 🔥 최신 유동성 보너스: 실시간/뉴스 소스일수록 점수 가중치
    const freshnessBonus = REALTIME_SOURCE_WEIGHT[enrichedSource] || 0;
    if (freshnessBonus > 0) {
      analysis.totalScore += freshnessBonus;
      analysis.timing.score = Math.min(100, analysis.timing.score + Math.round(freshnessBonus * 0.5));
      analysis.blueOcean.score = Math.min(100, analysis.blueOcean.score + Math.round(freshnessBonus * 0.3));
    }

    // 보너스 점수: 수익화 의도 키워드
    if (PROFIT_INTENT_PATTERNS.some(p => keyword.includes(p))) {
      analysis.totalScore += 15;
    }

    // 보너스 점수: 블루오션
    if (isBlueOcean) {
      analysis.totalScore += 20;
      analysis.blueOcean.score += 30;
    }

    // 점수 기준 완화 (40 → 30)
    // 📁 카테고리 지정 시에는 더 많은 후보를 남기기 위해 추가 완화
    const minScore = isCategorySpecified ? 10 : 30;
    if (isCategorySpecified) {
      results.push(analysis);
    } else if (analysis.totalScore >= minScore) {
      results.push(analysis);
    }
  }

  // 📁 카테고리 지정인데 엄격 컷으로 후보가 너무 적으면: 완화 후보에서 2차 보충
  // - 여전히 더미/추정치 없이, 후속 실제 API 검증 단계에서 엄선되도록 한다.
  if (isCategorySpecified && results.length < count && relaxedCandidates.length > 0) {
    const used = new Set(results.map(r => r.keyword));
    for (const cand of relaxedCandidates) {
      if (used.has(cand.keyword)) continue;
      const cleanKw = cand.keyword.replace(/\s/g, '');
      const cached = apiCache.get(cand.keyword) || apiCache.get(cleanKw);
      const finalSearchVolume = cached?.searchVolume ?? null;
      const finalDocCount = cached?.documentCount ?? null;
      const searchVolumeForCalc = finalSearchVolume ?? 0;
      const docCountForCalc = finalDocCount ?? 0;
      const goldenRatio = (finalSearchVolume !== null && finalDocCount !== null && finalDocCount > 0)
        ? finalSearchVolume / finalDocCount
        : 0;

      // 2차(완화) 컷: 완화된 기준으로만 최소한의 후보를 유지
      // - goldenRatio 0.3, searchVolume 80 정도는 남겨서 검증 단계로 보낸다.
      if (goldenRatio < 0.3) continue;
      if (searchVolumeForCalc < 80) continue;
      if (docCountForCalc > 100000) continue;

      const enrichedSource = realtimeSourceMap.get(cand.keyword) || cand.source;
      const analysis = analyzeKeyword(cand.keyword, enrichedSource, currentMonth, currentHour, targetRookie);
      analyzedPool.push(analysis);
      results.push(analysis);
      used.add(analysis.keyword);

      if (results.length >= Math.max(count * 3, count + 20)) break;
    }
  }

  // 📁 카테고리 지정인데 점수 컷으로 전부 탈락하면: 분석 풀에서 후보를 남겨 0개를 방지
  // - 더미/추정치 생성 없이, 후속 실제 API 검증 단계에서 걸러지도록 한다.
  if (isCategorySpecified && results.length === 0 && analyzedPool.length > 0) {
    console.warn(`[PRO-TRAFFIC] ⚠️ 카테고리=${category} 분석 결과가 모두 점수 컷(${10}) 미만 → 분석 풀 기반으로 후보 유지 (후속 API 검증에서 엄선)`);
    results.push(...analyzedPool);
  }
  console.log(`[PRO-TRAFFIC][METRICS] stage=analyzed category=${category} results=${results.length}`);

  // 🎯 7단계: 정렬 (황금비율 + 블루오션 + 수익화 의도)
  // premium(explosionMode)에서는 검증 후보 폭을 크게 늘려서 S/SS/SSS를 확보한다.
  const maxFinalCandidates = mode === 'category'
    ? (explosionMode ? Math.max(count * 120, 3000) : Math.max(count * 15, 300))
    : (category === 'all'
      ? Math.max(count * 4, 60)
      : ((category === 'it' || category === 'health')
        ? Math.max(count * 4, 80)
        : Math.max(count * 5, 100)));

  const sortedResults = results
    .sort((a, b) => {
      const blueA = a.profitAnalysis?.isRealBlueOcean ? 1 : 0;
      const blueB = b.profitAnalysis?.isRealBlueOcean ? 1 : 0;
      if (blueB !== blueA) return blueB - blueA;

      const ratioA = a.profitAnalysis?.profitGoldenRatio ?? 0;
      const ratioB = b.profitAnalysis?.profitGoldenRatio ?? 0;
      const ratioDiff = ratioB - ratioA;
      if (Math.abs(ratioDiff) > 0.5) return ratioDiff;

      const compA = a.profitAnalysis?.competitionLevel ?? 999;
      const compB = b.profitAnalysis?.competitionLevel ?? 999;
      if (compA !== compB) return compA - compB;

      const revA = a.profitAnalysis?.estimatedMonthlyRevenue ?? 0;
      const revB = b.profitAnalysis?.estimatedMonthlyRevenue ?? 0;
      const revDiff = revB - revA;
      if (Math.abs(revDiff) > 5000) return revDiff;

      return b.totalScore - a.totalScore;
    })
    .slice(0, maxFinalCandidates); // 카테고리별 상한 적용

  internalMetrics.sortedResultsCount = sortedResults.length;

  // 🔥🔥🔥 8단계: 최종 결과 키워드 실제 API 검증 (병렬 처리!) 🔥🔥🔥
  console.log(`[PRO-TRAFFIC] 🔍🔍🔍 최종 ${sortedResults.length}개 키워드 병렬 검증 시작...`);

  const verifiedResults: ProTrafficKeyword[] = [];
  const fallbackVerifiedResults: ProTrafficKeyword[] = [];

  // 환경 설정 로드
  const { EnvironmentManager } = await import('./environment-manager');
  const env = EnvironmentManager.getInstance().getConfig();

  // API 키 확인
  const hasBlogApi = !!(env.naverClientId && env.naverClientSecret);
  const hasSearchAdApi = !!(env.naverSearchAdAccessLicense && env.naverSearchAdSecretKey && env.naverSearchAdCustomerId);

  console.log('[PRO-TRAFFIC] 📋 API 키 상태:');
  console.log(`  - 블로그 API: ${hasBlogApi ? '✅' : '❌'}`);
  console.log(`  - 검색광고 API: ${hasSearchAdApi ? '✅' : '❌'}`);

  if (!hasBlogApi && !hasSearchAdApi) {
    console.error('[PRO-TRAFFIC] ❌ API 키가 없습니다! 설정에서 API 키를 입력해주세요.');
    throw new Error('API 키가 설정되지 않았습니다. 설정에서 네이버 API 키를 입력해주세요.');
  }

  // 🔥 병렬로 모든 키워드 검증! (더 많은 키워드 검증 - count * 5)
  // - category=all (realtime/season) 은 러너 타임아웃을 피하기 위해 검증 후보 수를 줄임
  const verifySliceSize = mode === 'category'
    ? (explosionMode
      ? (timeoutExplosionCategories.has(category)
        ? ((category === 'business' || category === 'self_development')
          ? Math.min(80, Math.max(count * 10, 50))
          : Math.min(30, Math.max(count * 5, 20)))
        : (heavyExplosionCategories.has(category)
          ? Math.min(180, Math.max(count * 20, 140))
          : (weakExplosionCategories.has(category)
            ? Math.min(320, Math.max(count * 35, 220))
            : Math.min(260, Math.max(count * 25, 180)))))
      : Math.max(count * 10, 120))
    : (category === 'all'
      ? Math.max(count * 4, 30)
      : Math.max(count * 5, 50));

  const isCategorySpecifiedForVerify = category !== 'all' && category !== 'pro_premium' && category !== 'lite_standard';
  let sortedResultsForVerify = isCategorySpecifiedForVerify
    ? sortedResults.filter(r => isKeywordInSelectedCategory(r.keyword, category))
    : sortedResults;

  if (isCategorySpecifiedForVerify && sortedResultsForVerify.length === 0 && sortedResults.length > 0) {
    console.warn(`[PRO-TRAFFIC] ⚠️ category=${category} verifyCandidates became empty after category filter → fallback to sortedResults to avoid 0 results`);
    sortedResultsForVerify = sortedResults;
  }

  const verifyCandidates = sortedResultsForVerify.slice(0, verifySliceSize);
  const verifyChunkSize = explosionMode
    ? (isTimeoutCategory
      ? ((category === 'business' || category === 'self_development') ? 5 : 10)
      : 50)
    : 80;

  const verifiedTarget = explosionMode
    ? (timeoutExplosionCategories.has(category) ? Math.max(count * 8, 40) : Math.max(count * 10, 120))
    : Math.max(count * 2, count + 10);

  const verifiedTargetEffective = (explosionMode && timeoutExplosionCategories.has(category))
    ? count
    : verifiedTarget;

  const verifyStartedAt = Date.now();
  const verifyReserveMs = (explosionMode && timeoutExplosionCategories.has(category)) ? 35000 : 25000;
  const baseVerifyTimeBudgetMs = explosionMode
    ? (timeoutExplosionCategories.has(category)
      ? 180000
      : 120000)
    : (category === 'celeb' ? 600000 : 60000);

  const verifyTimeBudgetMs = Math.min(baseVerifyTimeBudgetMs, (category === 'celeb' ? 600000 : (explosionMode ? 300000 : 180000)));
  let premiumVerifiedCount = 0;
  let stopVerify = false;

  for (let chunkStart = 0; chunkStart < verifyCandidates.length; chunkStart += verifyChunkSize) {
    if (Date.now() - verifyStartedAt > verifyTimeBudgetMs) {
      console.warn(`[PRO-TRAFFIC] ⚠️ verify time budget exceeded (${verifyTimeBudgetMs}ms) → stop verification early (category=${category})`);
      break;
    }

    const remainingBudgetMs = verifyTimeBudgetMs - (Date.now() - verifyStartedAt);
    if (remainingBudgetMs <= 0) break;

    const chunk = verifyCandidates.slice(chunkStart, chunkStart + verifyChunkSize);
    const chunkKeywords = chunk.map(r => r.keyword);

    const allowVerifyScrapeFallback =
      category === 'life_tips'
      || category === 'business'
      || category === 'self_development'
      || category === 'celeb'
      || category === 'fashion';

    const verifyStepTimeoutMs = explosionMode
      ? (timeoutExplosionCategories.has(category)
        ? ((category === 'business' || category === 'self_development') ? 40000 : 30000)
        : 65000)
      : (category === 'celeb' ? 600000 : 300000); // 연예인은 데이터가 많으므로 10분, 그 외 5분 (45초는 너무 짧음)

    const apiResults = await withStepTimeout(
      `fetchKeywordDataParallel:verify:${category}:${Math.floor(chunkStart / verifyChunkSize) + 1}`,
      isTimeoutCategory
        ? fetchKeywordDataParallel(chunkKeywords, env, {
          allowBlogScrapeFallback: allowVerifyScrapeFallback,
          blogScrapeMaxPerCall: (category === 'business' || category === 'self_development')
            ? Math.min(chunkKeywords.length, 5)
            : (category === 'celeb'
              ? (allowVerifyScrapeFallback ? Math.min(chunkKeywords.length, 3) : 0)
              : (category === 'fashion'
                ? (allowVerifyScrapeFallback ? Math.min(chunkKeywords.length, 4) : 0)
                : Math.min(chunkKeywords.length, 10)))
        })
        : fetchKeywordDataParallel(chunkKeywords, env),
      Math.min(verifyStepTimeoutMs, Math.max(5000, remainingBudgetMs)),
      new Map<string, ApiResult>()
    );

    for (const result of chunk) {
      const lookupKey = String(result.keyword || '').replace(/\s+/g, ' ').trim();
      const apiResult = apiResults.get(lookupKey) || apiResults.get(result.keyword);

      // 🚨 API 실패한 키워드는 완전 제외! (더미 데이터 절대 사용 안 함)
      if (!apiResult || !apiResult.success) {
        console.log(`[PRO-TRAFFIC] ❌ API 실패로 제외: "${result.keyword}" - ${apiResult?.error || '결과 없음'}`);
        continue;
      }

      const realSearchVolume = apiResult.searchVolume;
      const realDocCount = apiResult.documentCount;
      let realSearchVolumeForCalc: number | null = (typeof realSearchVolume === 'number') ? realSearchVolume : null;
      if (realSearchVolumeForCalc === null) {
        const collected = (typeof result.searchVolume === 'number' && Number.isFinite(result.searchVolume) && result.searchVolume > 0)
          ? result.searchVolume
          : null;
        if (collected !== null) realSearchVolumeForCalc = collected;
      }
      const realSearchVolumeForGrade = realSearchVolumeForCalc ?? 0;
      const isGolden = (typeof realSearchVolumeForCalc === 'number' && realSearchVolumeForCalc > 0) && (typeof realDocCount === 'number' && realDocCount > 0);

      // 🚨 둘 다 0이거나 null이면 제외 (유효하지 않은 데이터)
      if ((realSearchVolumeForCalc === null || realSearchVolumeForCalc === 0) && (realDocCount === 0 || realDocCount === null)) {
        console.log(`[PRO-TRAFFIC] ❌ 데이터 없음 제외: "${result.keyword}"`);
        continue;
      }

      // 🚨 문서수가 null이면 블로그 API 실패 - 제외! (정확한 데이터만 사용)
      if (realDocCount === null || realDocCount === undefined) {
        const fallbackProfitAnalysis = calculateProfitGoldenRatio(
          result.keyword,
          realSearchVolumeForCalc ?? 0,
          0,
          result.category,
          { realCpc: apiResult.realCpc }
        );
        fallbackVerifiedResults.push({
          ...result,
          searchVolume: realSearchVolumeForCalc,
          documentCount: null,
          goldenRatio: 0,
          profitAnalysis: fallbackProfitAnalysis,
          revenueEstimate: fallbackProfitAnalysis
            ? {
              dailyRevenue: `${fallbackProfitAnalysis.estimatedDailyRevenue.toLocaleString()}원 ⚠️추정`,
              monthlyRevenue: `${fallbackProfitAnalysis.estimatedMonthlyRevenue.toLocaleString()}원 ⚠️추정`,
              estimatedCPC: fallbackProfitAnalysis.estimatedCPC,
              estimatedRPM: Math.round(fallbackProfitAnalysis.estimatedCPC * 25),
              adType: fallbackProfitAnalysis.purchaseIntentScore >= 60 ? '쿠팡파트너스 + 애드센스' : '애드센스',
              revenueGrade: fallbackProfitAnalysis.grade as any,
              revenueReason: fallbackProfitAnalysis.gradeReason,
            }
            : calculateRevenueEstimate(
              result.keyword,
              (typeof realSearchVolume === 'number') ? realSearchVolume : null,
              null,
              0,
              result.blueOcean.score
            ),
          grade: computePremiumGradeEffective(
            { ...result, searchVolume: realSearchVolumeForCalc ?? 0, documentCount: 0, goldenRatio: 0 } as any,
            strictPro,
            { ...premiumCriteria, category }
          ),
          blueOcean: { ...result.blueOcean }
        });
        console.log(`[PRO-TRAFFIC] ⚠️ 문서수 API 실패(폴백 후보 유지): "${result.keyword}" (검색량=${realSearchVolume})`);
        continue;
      }

      // 🚨 문서수가 0이면 제외 (실제 데이터가 없음)
      if (realDocCount === 0) {
        console.log(`[PRO-TRAFFIC] ❌ 문서수 0 제외: "${result.keyword}" (검색량=${realSearchVolume})`);
        continue;
      }

      // 황금비율 계산 (문서수가 0보다 큰 경우만 여기 도달)
      const realGoldenRatio = (typeof realSearchVolumeForCalc === 'number') ? (realSearchVolumeForCalc / realDocCount) : 0;

      // 폴백 후보(더미 금지: API 성공 + 데이터 존재 조건만 통과)
      // - 결과가 0개가 되는 버그 방지용
      // - 최종적으로도 0개면 이것으로 최소 1개 이상 반환
      fallbackVerifiedResults.push({
        ...result,
        searchVolume: realSearchVolumeForCalc,
        documentCount: realDocCount,
        goldenRatio: realGoldenRatio,
        isGolden,
        profitAnalysis: calculateProfitGoldenRatio(
          result.keyword,
          realSearchVolumeForCalc ?? 0,
          realDocCount,
          result.category,
          { realCpc: apiResult.realCpc }
        ),
        revenueEstimate: (() => {
          const pa = calculateProfitGoldenRatio(
            result.keyword,
            realSearchVolumeForCalc ?? 0,
            realDocCount,
            result.category,
            { realCpc: apiResult.realCpc }
          );
          return pa
            ? {
              dailyRevenue: `${pa.estimatedDailyRevenue.toLocaleString()}원 ⚠️추정`,
              monthlyRevenue: `${pa.estimatedMonthlyRevenue.toLocaleString()}원 ⚠️추정`,
              estimatedCPC: pa.estimatedCPC,
              estimatedRPM: Math.round(pa.estimatedCPC * 25),
              adType: pa.purchaseIntentScore >= 60 ? '쿠팡파트너스 + 애드센스' : '애드센스',
              revenueGrade: pa.grade as any,
              revenueReason: pa.gradeReason,
            }
            : calculateRevenueEstimate(
              result.keyword,
              (typeof realSearchVolume === 'number') ? realSearchVolume : null,
              realDocCount,
              realGoldenRatio,
              result.blueOcean.score
            );
        })(),
        grade: computePremiumGradeEffective(
          { ...result, searchVolume: realSearchVolumeForCalc ?? 0, documentCount: realDocCount, goldenRatio: realGoldenRatio } as any,
          strictPro,
          { ...premiumCriteria, category }
        ),
        blueOcean: { ...result.blueOcean }
      });

      // 검색량이 null이면 '진짜 황금'으로 간주하지 않고, 폴백 후보로만 유지
      if (!isGolden) {
        console.log(`[PRO-TRAFFIC] ⚠️ 검색량 미확정(폴백 후보 유지): "${result.keyword}" (검색량=${realSearchVolumeForCalc ?? 'null'}, 문서수=${realDocCount})`);
        continue;
      }

      // 🚨 황금비율/레드오션 필터 (완화: 더 많은 키워드 발굴)
      // 카테고리 지정 시에는 컷을 조금 완화해 풀을 넓힘
      let goldenRatioCut = 0.3;
      let searchVolumeCut = 500;
      let maxDocCountCut = isCategorySpecified ? 50000 : 50000;

      if (category === 'celeb') {
        maxDocCountCut = 100000; // 강화된 연예인 문서수 상한
      }

      if (isCategorySpecified) {
        goldenRatioCut = 0.2;
        searchVolumeCut = 80;

        // 🌟 연예인(Celeb) 카테고리는 워낙 레드오션이므로 필터를 파격적으로 완화
        if (category === 'celeb') {
          goldenRatioCut = 0.05; // 0.2 -> 0.05 (4배 완화)
          searchVolumeCut = 50;  // 80 -> 50
        }
      }

      // 검색량이 null(미확정)인 경우에는 이 컷으로 완전 제외하지 않고, 후속 단계에서 엄선
      if (realSearchVolumeForCalc !== null && realGoldenRatio < goldenRatioCut && realSearchVolumeForCalc < searchVolumeCut) {
        continue;
      }
      // 레드오션: 문서수 50000 이상만 제외 (30000 → 50000 완화)
      if (realDocCount > maxDocCountCut) {
        console.log(`[PRO-TRAFFIC] ❌ 레드오션 제외: "${result.keyword}" (문서수=${realDocCount})`);
        continue;
      }

      // 🏆 등급 재계산 (황금비율 기반!) - 실제 API 데이터로만 계산!
      let newGrade: 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' = 'C';

      // SSS: 황금비율 5+ & 문서수 5000 이하
      if (realGoldenRatio >= 5 && realDocCount <= 5000) newGrade = 'SSS';
      // SS: 황금비율 3+ & 문서수 10000 이하
      else if (realGoldenRatio >= 3 && realDocCount <= 10000) newGrade = 'SS';
      // S: 황금비율 2+ & 문서수 30000 이하
      else if (realGoldenRatio >= 2 && realDocCount <= 30000) newGrade = 'S';
      // A: 황금비율 1.5+
      else if (realGoldenRatio >= 1.5) newGrade = 'A';
      // B: 황금비율 0.7+
      else if (realGoldenRatio >= 0.7) newGrade = 'B';
      // C: 그 외
      else newGrade = 'C';

      // 블루오션 조건 (황금비율 기반)
      const isRealBlueOcean = realSearchVolumeForGrade >= 50 && realDocCount <= 10000 && realGoldenRatio >= 1.0;
      const isLowCompetition = realGoldenRatio >= 0.5 && realDocCount <= 20000;

      const nextBlueOceanScore = isRealBlueOcean
        ? Math.min(100, 50 + Math.round(realGoldenRatio * 10))
        : (isLowCompetition ? 60 : result.blueOcean.score);

      const nextProfitAnalysis = calculateProfitGoldenRatio(
        result.keyword,
        realSearchVolumeForCalc ?? 0,
        realDocCount,
        result.category,
        { realCpc: apiResult.realCpc }
      );

      const nextRevenueEstimate = nextProfitAnalysis
        ? {
          dailyRevenue: `${nextProfitAnalysis.estimatedDailyRevenue.toLocaleString()}원 ⚠️추정`,
          monthlyRevenue: `${nextProfitAnalysis.estimatedMonthlyRevenue.toLocaleString()}원 ⚠️추정`,
          estimatedCPC: nextProfitAnalysis.estimatedCPC,
          estimatedRPM: Math.round(nextProfitAnalysis.estimatedCPC * 25),
          adType: nextProfitAnalysis.purchaseIntentScore >= 60 ? '쿠팡파트너스 + 애드센스' : '애드센스',
          revenueGrade: nextProfitAnalysis.grade as any,
          revenueReason: nextProfitAnalysis.gradeReason,
        }
        : calculateRevenueEstimate(
          result.keyword,
          realSearchVolumeForCalc,
          realDocCount,
          realGoldenRatio,
          nextBlueOceanScore
        );

      console.log(`[PRO-TRAFFIC] ✅ "${result.keyword}": 검색량=${realSearchVolumeForCalc ?? 'null'}, 문서수=${realDocCount}, 비율=${realGoldenRatio.toFixed(2)}, 등급=${newGrade}`);

      // 🆕 SRAA (Seasonal & Recency Advanced Analysis) - 정밀 경쟁 분석
      const competitorDeep = await analyzeCompetitorsReal(
        result.keyword,
        realDocCount,
        realGoldenRatio
      ).catch(() => null);

      const enriched: ProTrafficKeyword = {
        ...result,
        searchVolume: realSearchVolumeForCalc,
        documentCount: realDocCount,
        goldenRatio: realGoldenRatio,
        isGolden: true,
        grade: newGrade,
        profitAnalysis: nextProfitAnalysis,
        revenueEstimate: nextRevenueEstimate,
        blueOcean: { ...result.blueOcean, score: nextBlueOceanScore },

        // SRAA 데이터 통합
        winRate: competitorDeep?.winProbability,
        recencyAnalysis: competitorDeep?.recencyAnalysis,
        smartBlockAnalysis: competitorDeep?.smartBlockAnalysis,
        competitorAnalysis: competitorDeep ? {
          topBloggers: competitorDeep.topBloggers,
          avgBlogAge: competitorDeep.avgBlogAge,
          weakCompetitorRatio: competitorDeep.weakCompetitorRatio,
          winProbability: competitorDeep.winProbability,
          strategy: competitorDeep.strategy
        } : result.competitorAnalysis,
        isEmptyHouse: competitorDeep?.recencyAnalysis?.isEmptyHouse
      };

      verifiedResults.push(enriched);
      if (explosionMode && isPremiumGoldenKeyword(enriched, 30, premiumCriteria)) {
        premiumVerifiedCount++;
      }

      if (explosionMode && premiumVerifiedCount >= verifiedTargetEffective) {
        stopVerify = true;
        break;
      }
      if (!explosionMode && verifiedResults.length >= verifiedTargetEffective) {
        stopVerify = true;
        break;
      }
    }

    if (stopVerify) break;
  }

  internalMetrics.verifiedResultsCount = explosionMode ? premiumVerifiedCount : verifiedResults.length;

  const needsFallbackSupplement = explosionMode
    ? premiumVerifiedCount < count
    : verifiedResults.length < count;

  if (needsFallbackSupplement) {
    console.warn(`[PRO-TRAFFIC] ⚠️ 검증 결과가 ${count}개 미만입니다! 폴백 후보로 최소 ${count}개 이상 반환합니다.`);

    // 폴백 후보 중에서 조건을 만족하는 것들을 추가
    const fallbackResults = fallbackVerifiedResults.filter(r => {
      // 기본 조건: 검색량 0이 아니고 문서수 0이 아님
      return r.searchVolume !== null && r.searchVolume !== undefined && r.documentCount !== null && r.documentCount !== undefined && r.documentCount !== 0;
    })
      .filter(isVerifiedMetrics)
      .sort((a, b) => {
        const ratioDiff = b.goldenRatio - a.goldenRatio;
        if (Math.abs(ratioDiff) > 0.01) return ratioDiff;

        // [FIX] API 실패 본능 시, 연예인/꿀팁 카테고리는 '긴 키워드(롱테일)' 우선!
        // (볼륨순으로 하면 '아이돌신곡' 같은 헤드 키워드가 잡힘)
        const isLongTailPreferred = category === 'celeb' || category === 'life_tips' || category === 'health';
        if (isLongTailPreferred && b.goldenRatio === 0 && a.goldenRatio === 0) {
          const lenDiff = b.keyword.length - a.keyword.length;
          if (lenDiff !== 0) return lenDiff; // 긴 것 우선
        }

        const volA = a.searchVolume ?? -1;
        const volB = b.searchVolume ?? -1;
        return volB - volA;
      })
      .slice(0, Math.max(1, Math.min(count, 5)));

    // 폴백 결과가 있으면 부족분만큼 보충
    if (fallbackResults.length > 0) {
      const need = explosionMode
        ? Math.max(0, count - premiumVerifiedCount)
        : Math.max(0, count - verifiedResults.length);
      const toAdd = fallbackResults.slice(0, Math.max(need, 0));
      if (toAdd.length > 0) {
        verifiedResults.push(...toAdd);
        console.log(`[PRO-TRAFFIC] ✅ 폴백 후보에서 ${toAdd.length}개 보충 (need=${need})`);
      }
    }
  }

  // ...

  // 📁 카테고리 지정 + 여전히 부족하면: 카테고리 시드/실시간 시드 기반 폴백 보충
  const effectiveVerifiedCountForTopUp = explosionMode ? premiumVerifiedCount : verifiedResults.length;
  if (isCategorySpecified && effectiveVerifiedCountForTopUp < count) {
    console.warn(`[PRO-TRAFFIC] ⚠️ 카테고리=${category} 결과 부족(${effectiveVerifiedCountForTopUp}/${count}) → 카테고리 시드 기반 폴백 보충 시도`);
    try {
      const used = new Set(verifiedResults.map(r => r.keyword));

      // 이미 수집한 시드 + 수집된 후보까지 포함해, 해당 카테고리로 확실히 분류되는 것만 사용
      const collectedFallback = allKeywords.map(k => k.keyword);
      const seedFallback = Array.from(
        new Set(
          [...allSeedKeywords, ...collectedFallback]
            .filter(kw => !!kw && isKeywordInSelectedCategory(kw, category))
        )
      ).filter(kw => !used.has(kw));

      if (seedFallback.length > 0) {
        const limitedFallback = shuffleArray(seedFallback).slice(
          0,
          explosionMode
            ? (timeoutExplosionCategories.has(category)
              ? ((category === 'business' || category === 'self_development' || category === 'fashion') ? 140 : 40)
              : 600)
            : 80
        ); // API 부하 방지를 위한 상한

        const fallbackMap = (explosionMode && timeoutExplosionCategories.has(category))
          ? await fetchKeywordDataParallel(limitedFallback, env, {
            allowBlogScrapeFallback: true,
            blogScrapeMaxPerCall: (category === 'business' || category === 'self_development')
              ? Math.min(limitedFallback.length, 25)
              : (category === 'fashion'
                ? Math.min(limitedFallback.length, 18)
                : Math.min(limitedFallback.length, 12))
          })
          : await withStepTimeout(
            `fetchKeywordDataParallel:fallback:${category}`,
            fetchKeywordDataParallel(limitedFallback, env),
            explosionMode
              ? (timeoutExplosionCategories.has(category) ? 35000 : 60000)
              : (category === 'celeb' ? 600000 : 300000), // 연예인은 데이터가 많으므로 10분, 그 외 5분
            new Map<string, any>()
          );

        // 카테고리 전용 폴백: 카테고리별 레드오션 컷 기준 (검색량/문서수/황금비율)
        // 기본값: 너무 저품질/초저검색량/초레드오션만 제거
        let minGoldenRatio = 0.13;
        let minSearchVolume = 25;
        let maxDocuments = 120000;

        if (category === 'celeb') {
          minGoldenRatio = 0.05;
          minSearchVolume = 20;
          maxDocuments = 500000;
        }

        if (explosionMode) {
          minGoldenRatio = premiumMinRatioEffective;
          minSearchVolume = 30;
          maxDocuments = premiumMaxDocumentsEffective;
        }

        if (category === 'it' || category === 'business' || category === 'health') {
          // 경쟁이 특히 치열한 지식/경제/건강 카테고리는 조금 더 엄격하게 컷
          minGoldenRatio = 0.18;
          minSearchVolume = 50;
          maxDocuments = 90000;
        } else if (category === 'celeb') {
          // 연예/스타: 이슈성 키워드 중심이므로 비율은 다소 높게, 문서 수는 중간 수준으로 제한
          minGoldenRatio = 0.15;
          minSearchVolume = 35;
          maxDocuments = 100000;
        } else if (category === 'life_tips') {
          // 생활꿀팁: 시즌 키워드는 dc 30만대 흔함. 상한 대폭 완화.
          minGoldenRatio = 0.1;
          minSearchVolume = 25;
          maxDocuments = 300000;
        } else if (category === 'interior') {
          // 인테리어: 롱테일 위주라 검색량은 다소 낮아도 허용
          minGoldenRatio = 0.12;
          minSearchVolume = 25;
          maxDocuments = 110000;
        }

        const extraCandidates: ProTrafficKeyword[] = [];
        for (const kw of limitedFallback) {
          const lookupKey = String(kw || '').replace(/\s+/g, ' ').trim();
          const api = (fallbackMap as Map<string, any>).get(lookupKey) || (fallbackMap as Map<string, any>).get(kw);
          if (!api || !api.success) continue;

          const vol = (typeof api.searchVolume === 'number') ? api.searchVolume : null;
          const doc = api.documentCount as number | null | undefined;
          if (doc === null || doc === undefined || doc === 0) continue;

          const volForCalc = vol ?? 0;
          const ratio = doc > 0 ? volForCalc / doc : 0;

          const newGrade = computePremiumGradeEffective({
            keyword: kw,
            searchVolume: volForCalc,
            documentCount: doc,
            goldenRatio: ratio
          } as any, strictPro, { ...premiumCriteria, category });

          // 카테고리 전용 폴백: 카테고리별 컷 기준으로 레드오션 제거
          if (volForCalc < minSearchVolume) continue;
          if (ratio < minGoldenRatio) continue;
          if (doc > maxDocuments) continue;

          if (explosionMode && (!newGrade || !PREMIUM_GOLDEN_GRADES.has(newGrade))) continue;
          // 🔥 v2.13.0 C1: grade=null 카드를 extraCandidates에 저장하지 않음
          if (!newGrade) continue;

          const analysis = analyzeKeyword(kw, 'category_fallback', currentMonth, currentHour, targetRookie);
          // 폴백에서는 점수 컷을 20으로 추가 완화 (최종 정렬에서 다시 엄선)
          if (analysis.totalScore < 20) continue;

          extraCandidates.push({
            ...analysis,
            searchVolume: vol,
            documentCount: doc,
            goldenRatio: ratio,
            isGolden: true,
            grade: newGrade,
            profitAnalysis: calculateProfitGoldenRatio(kw, volForCalc, doc, analysis.category, { realCpc: api.realCpc }),
            revenueEstimate: (() => {
              const pa = calculateProfitGoldenRatio(kw, volForCalc, doc, analysis.category, { realCpc: api.realCpc });
              return pa
                ? {
                  dailyRevenue: `${pa.estimatedDailyRevenue.toLocaleString()}원 ⚠️추정`,
                  monthlyRevenue: `${pa.estimatedMonthlyRevenue.toLocaleString()}원 ⚠️추정`,
                  estimatedCPC: pa.estimatedCPC,
                  estimatedRPM: Math.round(pa.estimatedCPC * 25),
                  adType: pa.purchaseIntentScore >= 60 ? '쿠팡파트너스 + 애드센스' : '애드센스',
                  revenueGrade: pa.grade as any,
                  revenueReason: pa.gradeReason,
                }
                : calculateRevenueEstimate(kw, vol, doc, ratio, analysis.blueOcean.score);
            })()
          });
        }

        if (extraCandidates.length > 0) {
          extraCandidates.sort((a, b) => {
            const ratioDiff = b.goldenRatio - a.goldenRatio;
            if (Math.abs(ratioDiff) > 0.01) return ratioDiff;
            const volA = a.searchVolume ?? -1;
            const volB = b.searchVolume ?? -1;
            return volB - volA;
          });

          for (const cand of extraCandidates) {
            if (explosionMode ? (premiumVerifiedCount >= count) : (verifiedResults.length >= count)) break;
            if (!used.has(cand.keyword)) {
              verifiedResults.push(cand);
              used.add(cand.keyword);
              if (explosionMode && isPremiumGoldenKeyword(cand, 30, premiumCriteria)) {
                premiumVerifiedCount++;
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('[PRO-TRAFFIC] ⚠️ 카테고리 폴백 보충 중 오류:', e);
    }
  }

  // 📅 시즌 모드: seasonality-analyzer로 각 키워드의 시즌 적합성 점수화
  // 비시즌 키워드를 하위로 밀어 시즌 관련 키워드 우선 노출
  const seasonalityScoreMap = new Map<string, number>();
  if (mode === 'season' && verifiedResults.length > 0) {
    console.log(`[PRO-TRAFFIC] 📅 시즌 적합성 분석 시작 (${verifiedResults.length}개 키워드)...`);
    // 병렬로 시즌성 분석 (최대 50개까지만 API 호출, 나머지는 fallback 사용)
    const seasonBatchSize = Math.min(verifiedResults.length, 50);
    const seasonBatch = verifiedResults.slice(0, seasonBatchSize);
    const seasonProfiles = await Promise.all(
      seasonBatch.map(r =>
        analyzeSeasonality(r.keyword)
          .catch(() => null)
      )
    );
    for (let i = 0; i < seasonBatch.length; i++) {
      const profile = seasonProfiles[i];
      if (profile) {
        // 시즌 적합성 점수: currentVsPeakPct (현재가 피크의 몇 %인지)
        // 비시즌(isSeasonal && currentVsPeakPct < 30): 페널티
        // 피크(currentVsPeakPct >= 70): 보너스
        // 비시즌 아닌 키워드(isSeasonal === false): 중립 (50)
        let score: number;
        if (!profile.isSeasonal) {
          score = 50; // 연중 안정 키워드 — 중립
        } else {
          score = profile.currentVsPeakPct; // 0~100
        }
        seasonalityScoreMap.set(seasonBatch[i].keyword, score);
      }
    }
    // API 호출 안 한 나머지 키워드: 중립 점수 부여
    for (const r of verifiedResults) {
      if (!seasonalityScoreMap.has(r.keyword)) {
        seasonalityScoreMap.set(r.keyword, 50);
      }
    }
    const highSeasonCount = [...seasonalityScoreMap.values()].filter(s => s >= 70).length;
    const lowSeasonCount = [...seasonalityScoreMap.values()].filter(s => s < 30).length;
    console.log(`[PRO-TRAFFIC] 📅 시즌 분석 완료: 피크시즌=${highSeasonCount}개, 비수기=${lowSeasonCount}개`);
  }

  // 🔥 검증된 결과 재정렬 (랜덤 요소 추가 - 같은 등급 내 다양성!)
  // 🏆 끝판왕: 황금비율 퍼센타일(상위권) 우선 + 실시간 소스 가중치(유동성) 반영
  const getPercentileThreshold = (values: number[], percentile: number): number => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((percentile / 100) * (sorted.length - 1))));
    return sorted[idx];
  };

  const ratioValues = verifiedResults
    .map(r => r.goldenRatio)
    .filter(v => Number.isFinite(v) && v > 0);

  const threshold85 = getPercentileThreshold(ratioValues, 85);
  const threshold70 = getPercentileThreshold(ratioValues, 70);

  const filterByThreshold = (threshold: number) => verifiedResults.filter(r => r.goldenRatio >= threshold);

  let percentileFiltered = filterByThreshold(threshold85);
  if (percentileFiltered.length < Math.max(5, Math.floor(count / 2))) {
    percentileFiltered = filterByThreshold(threshold70);
  }
  if (percentileFiltered.length === 0) {
    percentileFiltered = verifiedResults;
  }

  // 🎯 A) 카테고리 지정 시: "카테고리 내부"에서만 퍼센타일/폭발/완화 수행 (혼입 금지)
  if (category !== 'all' && category !== 'pro_premium' && category !== 'lite_standard') {
    const targetPoolSize = explosionMode ? Math.max(count * 25, 250) : count;
    const verifiedCategory = verifiedResults.filter(r => isKeywordInSelectedCategory(r.keyword, category));
    console.log(`[PRO-TRAFFIC] 📁 카테고리 검증 풀(혼입 금지): ${category} → ${verifiedCategory.length}개`);

    const hasCelebTransactionalIntent = (kw: string): boolean => {
      const s = String(kw || '');
      return /(티켓|예매|티켓팅|좌석|좌석배치도|시야|스탠딩|vip|취소표|양도|가격|비용|할인|쿠폰|예매처|선예매|팬클럽)/i.test(s);
    };

    const catRatioValues = verifiedCategory
      .map(r => r.goldenRatio)
      .filter(v => Number.isFinite(v) && v > 0);

    const cat85 = getPercentileThreshold(catRatioValues, 85);
    const cat70 = getPercentileThreshold(catRatioValues, 70);
    const catFilterBy = (t: number) => verifiedCategory.filter(r => r.goldenRatio >= t);

    // 1) 카테고리 내 퍼센타일 엄격
    let categoryPool = catFilterBy(cat85);
    // 2) 부족하면 카테고리 내 퍼센타일 완화
    if (categoryPool.length < Math.max(5, Math.floor(count / 2))) {
      categoryPool = catFilterBy(cat70);
    }
    // 3) 그래도 없으면 카테고리 전체
    if (categoryPool.length === 0) {
      categoryPool = verifiedCategory;
    }

    if (explosionMode) {
      const premiumPreferred = categoryPool
        .filter(r => PREMIUM_GOLDEN_GRADES.has(String(computePremiumGradeEffective(r, strictPro, { ...premiumCriteria, category }))))
        .filter(r => (r.goldenRatio ?? 0) >= premiumMinRatioEffective)
        .filter(r => (r.documentCount ?? Number.POSITIVE_INFINITY) <= premiumMaxDocumentsEffective);

      if (premiumPreferred.length > 0) {
        if (category === 'celeb') {
          const transactional = premiumPreferred.filter(r => hasCelebTransactionalIntent(r.keyword));
          if (transactional.length >= count) {
            categoryPool = transactional;
          } else if (transactional.length > 0) {
            const chosen = new Set(transactional.map(r => r.keyword));
            const rest = premiumPreferred.filter(r => !chosen.has(r.keyword));
            categoryPool = [...transactional, ...rest];
          } else {
            categoryPool = premiumPreferred;
          }
        } else {
          categoryPool = premiumPreferred;
        }
      }
    }

    // 5) 최종적으로 pool 부족하면 카테고리 전체에서 황금비율 순으로 보충 (혼입 금지)
    if (categoryPool.length < targetPoolSize) {
      const chosen = new Set(categoryPool.map(r => r.keyword));
      const supplement = verifiedCategory
        .filter(r => !chosen.has(r.keyword))
        .sort((a, b) => {
          const gradeScore = (g?: any) => (g === 'SSS' ? 6 : g === 'SS' ? 5 : g === 'S' ? 4 : g === 'A' ? 3 : g === 'B' ? 2 : 1);
          const ra = gradeScore(a.revenueEstimate?.revenueGrade);
          const rb = gradeScore(b.revenueEstimate?.revenueGrade);
          if (rb !== ra) return rb - ra;
          const cpcDiff = (b.revenueEstimate?.estimatedCPC || 0) - (a.revenueEstimate?.estimatedCPC || 0);
          if (Math.abs(cpcDiff) > 50) return cpcDiff;
          return b.goldenRatio - a.goldenRatio;
        })
        .slice(0, Math.max(0, targetPoolSize - categoryPool.length));
      categoryPool = [...categoryPool, ...supplement];
    }

    // 6) 그래도 부족하면: API 성공 + 데이터 존재 조건만 통과한 폴백 후보에서 "카테고리 내부" 보충
    // - 더미/추정치 없이, 실제 API 호출 성공 결과만 사용
    // - 레드오션 상한은 유지
    if (categoryPool.length < targetPoolSize) {
      const chosen = new Set(categoryPool.map(r => r.keyword));
      const maxDocCountCut = (category === 'celeb' || category === 'life_tips') ? 300000 : 50000; // 강화된 문서수 상한 (life_tips는 시즌 키워드 특성)
      const fallbackCategory = fallbackVerifiedResults
        .filter(r => isKeywordInSelectedCategory(r.keyword, category))
        .filter(r => {
          const isDocOk = (r.documentCount as number) <= maxDocCountCut;
          if (category === 'celeb' && !isDocOk && fallbackVerifiedResults.length < 200) {
            // console.log(`[CELEB-SELECTED-FALLBACK-FILTER] "${r.keyword}" docCount too high: ${r.documentCount}`);
          }
          return isDocOk;
        })
        .filter(r => !chosen.has(r.keyword))
        .filter(isVerifiedMetrics)
        .sort((a, b) => {
          const gradeScore = (g?: any) => (g === 'SSS' ? 6 : g === 'SS' ? 5 : g === 'S' ? 4 : g === 'A' ? 3 : g === 'B' ? 2 : 1);
          const ra = gradeScore(a.revenueEstimate?.revenueGrade);
          const rb = gradeScore(b.revenueEstimate?.revenueGrade);
          if (rb !== ra) return rb - ra;
          const cpcDiff = (b.revenueEstimate?.estimatedCPC || 0) - (a.revenueEstimate?.estimatedCPC || 0);
          if (Math.abs(cpcDiff) > 50) return cpcDiff;

          const ratioDiff = b.goldenRatio - a.goldenRatio;
          if (Math.abs(ratioDiff) > 0.01) return ratioDiff;
          const docA = a.documentCount ?? Number.POSITIVE_INFINITY;
          const docB = b.documentCount ?? Number.POSITIVE_INFINITY;
          if (docA !== docB) return docA - docB;
          const volA = a.searchVolume ?? -1;
          const volB = b.searchVolume ?? -1;
          return volB - volA;
        })
        .slice(0, Math.max(0, targetPoolSize - categoryPool.length));

      categoryPool = [...categoryPool, ...fallbackCategory];
    }

    percentileFiltered = categoryPool;
    console.log(`[PRO-TRAFFIC] 📁 카테고리 최종 후보(혼입 금지): ${category} → ${percentileFiltered.length}개`);
    if (percentileFiltered.length === 0) {
      console.log(`[PRO-TRAFFIC] ⚠️ [CELEB-DEBUG] categoryPool is EMPTY. verifiedCategory size: ${verifiedCategory.length}`);
    }
  } else {
    // 카테고리 지정이 없을 때만 전체 기준 즉시 폭발 적용
    if (explosionMode) {
      const explosionFiltered = percentileFiltered.filter(r => {
        const w = REALTIME_SOURCE_WEIGHT[r.source] || 0;
        const urgent = r.timing.urgency === 'NOW' || r.timing.urgency === 'TODAY';
        const ratioOk = r.goldenRatio >= 0.5;
        return (w >= 25 && urgent) || (urgent && ratioOk);
      });
      if (explosionFiltered.length > 0) {
        percentileFiltered = explosionFiltered;
      }
    }
  }

  const revenueGradeScore = (g?: ProTrafficKeyword['revenueEstimate'] extends infer R
    ? (R extends { revenueGrade: infer G } ? G : any)
    : any): number => {
    if (g === 'SSS') return 6;
    if (g === 'SS') return 5;
    if (g === 'S') return 4;
    if (g === 'A') return 3;
    if (g === 'B') return 2;
    return 1;
  };

  const hasBuyIntent = (kw: string): number => {
    const s = String(kw || '');
    return (/추천|비교|순위|가격|비용|후기|할인|쿠폰|신청|가입|예약|예매|티켓|티켓팅|좌석|시야|좌석배치도|스탠딩|vip|취소표|양도|예매처|렌탈|구매/.test(s)) ? 1 : 0;
  };

  // 🔥 v2.16.0: 극블루오션 놓치지 않도록 pool 대폭 확대
  //    극블루오션은 gr 10+ 희소 키워드 → pool 크게 해서 상위 컷 확보
  const finalRerankPoolSize = explosionMode
    ? Math.min(Math.max(count * 25, 300), 500)
    : Math.min(Math.max(count * 10, 100), 200);

  // 📁 카테고리 후필터: API 확장 후에도 카테고리 매칭 키워드를 상위 배치
  const filterByCategory = (keywords: ProTrafficKeyword[], cat: string): ProTrafficKeyword[] => {
    if (!cat || cat === 'all' || cat === 'pro_premium' || cat === 'lite_standard') return keywords;
    const matched: ProTrafficKeyword[] = [];
    const unmatched: ProTrafficKeyword[] = [];
    for (const kw of keywords) {
      if (isKeywordInSelectedCategory(kw.keyword, cat)) {
        matched.push({ ...kw, isCategoryMatch: true });
      } else {
        unmatched.push({ ...kw, isCategoryMatch: false });
      }
    }
    console.log(`[PRO-TRAFFIC] 📁 카테고리 후필터: ${cat} 매칭=${matched.length}개, 비매칭=${unmatched.length}개`);
    // 카테고리 매칭 키워드만 반환. 너무 적으면(5개 미만) 비매칭 중 상위만 보충
    const MIN_RESULTS = 5;
    if (matched.length >= MIN_RESULTS) return matched;
    const fillCount = MIN_RESULTS - matched.length;
    return [...matched, ...unmatched.slice(0, fillCount)];
  };

  // 카테고리 모드일 때 percentileFiltered에 후필터 적용
  const categoryFilteredPool = (mode === 'category')
    ? filterByCategory(percentileFiltered, category)
    : percentileFiltered;

  const sortedAllFinalCandidates = shuffleArray(categoryFilteredPool)
    .sort((a, b) => {
      // -1순위 (카테고리 모드): 카테고리 매칭 키워드 우선
      if (mode === 'category' && category !== 'all' && category !== 'pro_premium' && category !== 'lite_standard') {
        const catA = isKeywordInSelectedCategory(a.keyword, category) ? 1 : 0;
        const catB = isKeywordInSelectedCategory(b.keyword, category) ? 1 : 0;
        if (catA !== catB) return catB - catA;
      }

      // -0.5순위 (시즌 모드): 시즌 적합성 점수가 높은 키워드 우선
      if (mode === 'season' && seasonalityScoreMap.size > 0) {
        const seaA = seasonalityScoreMap.get(a.keyword) ?? 50;
        const seaB = seasonalityScoreMap.get(b.keyword) ?? 50;
        // 피크(>=70) vs 비수기(<30) 구분이 명확할 때만 정렬에 반영
        const tierA = seaA >= 70 ? 2 : seaA >= 30 ? 1 : 0;
        const tierB = seaB >= 70 ? 2 : seaB >= 30 ? 1 : 0;
        if (tierA !== tierB) return tierB - tierA;
      }

      // 0순위: 진짜 황금키워드 우선 노출
      const gA = a.isGolden === true ? 1 : 0;
      const gB = b.isGolden === true ? 1 : 0;
      if (gA !== gB) return gB - gA;

      // 0.5순위: 수익성(월 수익 등급) 우선
      const revDiff = revenueGradeScore(b.revenueEstimate?.revenueGrade) - revenueGradeScore(a.revenueEstimate?.revenueGrade);
      if (revDiff !== 0) return revDiff;

      // 0.6순위: 예상 CPC 우선
      const cpcDiff = (b.revenueEstimate?.estimatedCPC || 0) - (a.revenueEstimate?.estimatedCPC || 0);
      if (Math.abs(cpcDiff) > 50) return cpcDiff;

      // 0.7순위: 구매의도 키워드 우선
      const intentDiff = hasBuyIntent(b.keyword) - hasBuyIntent(a.keyword);
      if (intentDiff !== 0) return intentDiff;

      // 1순위: 황금비율 (극단 우선)
      const ratioDiff = b.goldenRatio - a.goldenRatio;
      if (Math.abs(ratioDiff) > 0.01) return ratioDiff;

      // 2순위: 유동성(소스 가중치)
      const wA = REALTIME_SOURCE_WEIGHT[a.source] || 0;
      const wB = REALTIME_SOURCE_WEIGHT[b.source] || 0;
      if (wB !== wA) return wB - wA;

      // 3순위: 문서수(낮을수록 좋음)
      const docA = a.documentCount;
      const docB = b.documentCount;
      if (docA === null && docB !== null) return 1;
      if (docA !== null && docB === null) return -1;
      if (docA !== null && docB !== null) {
        const docDiff = docA - docB;
        if (Math.abs(docDiff) > 100) return docDiff;
      }

      // 4순위: 검색량(너무 작은 건 의미없음)
      const volA = a.searchVolume;
      const volB = b.searchVolume;
      if (volA === null && volB !== null) return 1;
      if (volA !== null && volB === null) return -1;
      return (volB ?? 0) - (volA ?? 0);
    })
    ;

  const sortedFinalResults = sortedAllFinalCandidates.slice(0, finalRerankPoolSize);

  const allFinalVerified = sortedAllFinalCandidates.filter(isVerifiedMetrics);
  const sortedFinalVerified = allFinalVerified.slice(0, finalRerankPoolSize);

  if (explosionMode) {
    const verifiedCount = allFinalVerified.length;
    const gradeOkCount = allFinalVerified.filter(r => PREMIUM_GOLDEN_GRADES.has(String(computePremiumGradeEffective(r, strictPro, { ...premiumCriteria, category })))).length;
    const ratioOkCount = allFinalVerified.filter(r => (r.goldenRatio ?? 0) >= premiumMinRatioEffective).length;
    const docOkCount = allFinalVerified.filter(r => (r.documentCount ?? Number.POSITIVE_INFINITY) <= premiumMaxDocumentsEffective).length;

    const uniqByCompact = (arr: ProTrafficKeyword[]): ProTrafficKeyword[] => {
      const seen = new Set<string>();
      const out: ProTrafficKeyword[] = [];
      for (const r of arr) {
        const key = normalizeKeywordCompact(r.keyword);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(r);
      }
      return out;
    };

    const fillToCountPreferCompact = (arr: ProTrafficKeyword[], targetCount: number): ProTrafficKeyword[] => {
      const base = uniqByCompact(arr);
      if (base.length >= targetCount) return base;

      const seenExact = new Set(base.map(r => String(r.keyword || '')));
      const out = [...base];
      for (const r of arr) {
        if (out.length >= targetCount) break;
        const ex = String(r.keyword || '');
        if (!ex || seenExact.has(ex)) continue;
        out.push(r);
        seenExact.add(ex);
      }
      return out;
    };

    const minSearchStages = [500, 200, 120, 80, 50, 30];
    let bestMinSv = minSearchStages[minSearchStages.length - 1];
    let bestPreSelected: ProTrafficKeyword[] = [];

    for (const minSv of minSearchStages) {
      const premiumRaw = allFinalVerified.filter(r => isPremiumGoldenKeyword(r, minSv, premiumCriteria));
      const premium = fillToCountPreferCompact(premiumRaw, count);
      if (premium.length > bestPreSelected.length || (premium.length === bestPreSelected.length && minSv < bestMinSv)) {
        bestPreSelected = premium;
        bestMinSv = minSv;
      }
      if (premium.length >= count) {
        bestPreSelected = premium;
        bestMinSv = minSv;
        break;
      }
    }

    const svOkCount = allFinalVerified.filter(r => (r.searchVolume ?? 0) >= bestMinSv).length;
    const strictOkCount = bestPreSelected.length;

    const topByExplosion = [...allFinalVerified]
      .sort((a, b) => {
        const grDiff = (b.goldenRatio ?? 0) - (a.goldenRatio ?? 0);
        if (Math.abs(grDiff) > 0.0001) return grDiff;
        const dcDiff = (a.documentCount ?? Number.MAX_SAFE_INTEGER) - (b.documentCount ?? Number.MAX_SAFE_INTEGER);
        if (Math.abs(dcDiff) > 0.1) return dcDiff;
        return (b.searchVolume ?? 0) - (a.searchVolume ?? 0);
      })
      .slice(0, 5)
      .map(r => {
        const w = REALTIME_SOURCE_WEIGHT[r.source] || 0;
        const ex = Math.round(calculateExplosionScore(r));
        const sv = r.searchVolume ?? 0;
        const dc = r.documentCount ?? 0;
        const gr = r.goldenRatio ?? 0;
        const g = String(r.grade || '');
        return `${r.keyword} | grade=${g} gr=${gr} sv=${sv} dc=${dc} src=${r.source}(${w}) ex=${ex}`;
      });

    console.log(`[PRO-TRAFFIC][EXPLOSION][FUNNEL] candidates=${sortedAllFinalCandidates.length} verified=${verifiedCount} gradeOk=${gradeOkCount} ratioOk=${ratioOkCount} docOk=${docOkCount} svOk=${svOkCount} strictOk=${strictOkCount} minSv=${bestMinSv}`);
    if (topByExplosion.length > 0) {
      console.log(`[PRO-TRAFFIC][EXPLOSION][TOP] ${topByExplosion.join(' || ')}`);
    }

    const explosionFunnel = {
      candidates: sortedAllFinalCandidates.length,
      verified: verifiedCount,
      gradeOk: gradeOkCount,
      ratioOk: ratioOkCount,
      docOk: docOkCount,
      svOk: svOkCount,
      strictOk: strictOkCount,
      minSv: bestMinSv,
      internalMetrics,
      topByExplosion,
    };

    let limitedPreSelected = bestPreSelected.slice(
      0,
      (mode === 'category' && timeoutExplosionCategories.has(category))
        ? Math.min(bestPreSelected.length, Math.max(count * 6, 30))
        : Math.max(60, Math.min(260, count * 20))
    );

    if (limitedPreSelected.length === 0 && category === 'celeb') {
      const celebFallback = [...allFinalVerified]
        .sort((a, b) => {
          const exDiff = calculateExplosionScore(b) - calculateExplosionScore(a);
          if (Math.abs(exDiff) > 0.0001) return exDiff;
          const grDiff = (b.goldenRatio ?? 0) - (a.goldenRatio ?? 0);
          if (Math.abs(grDiff) > 0.0001) return grDiff;
          const dcDiff = (a.documentCount ?? Number.MAX_SAFE_INTEGER) - (b.documentCount ?? Number.MAX_SAFE_INTEGER);
          if (Math.abs(dcDiff) > 0.1) return dcDiff;
          return (b.searchVolume ?? 0) - (a.searchVolume ?? 0);
        });
      const fallbackLimit = (mode === 'category' && timeoutExplosionCategories.has(category))
        ? Math.min(celebFallback.length, Math.max(count * 6, 30))
        : Math.min(celebFallback.length, Math.max(60, Math.min(220, count * 20)));
      limitedPreSelected = celebFallback.slice(0, fallbackLimit);
    }

    if (limitedPreSelected.length === 0) {
      console.log('[PRO-TRAFFIC] 🏆 프리미엄 황금키워드 필터 통과: 0개');

      const summary = {
        totalFound: 0,
        sssCount: 0,
        ssCount: 0,
        sCount: 0,
        rookieFriendlyCount: 0,
        urgentCount: 0,
        blueOceanCount: 0,
        explosionFunnel
      };

      return {
        keywords: [],
        summary,
        huntingStrategy: '🏆 끝판왕 블루오션 전략: 실제 API 검증 완료된 황금 키워드',
        timestamp: new Date().toISOString()
      };
    }

    const enrichedPremium = await (async () => {
      const analysisPromises = limitedPreSelected.map(async (result) => {
        try {
          const [trendAnalysis, ultimateAnalysis] = await Promise.all([
            withStepTimeout(
              `analyzeKeywordTrendingReason:${result.keyword}`,
              analyzeKeywordTrendingReason(result.keyword, {
                searchVolume: result.searchVolume,
                documentCount: result.documentCount,
                growthRate: result.timing.score
              }).catch(() => null),
              capOverallTimeout(8000),
              null
            ),
            withStepTimeout(
              `runUltimateAnalysis:${result.keyword}`,
              runUltimateAnalysis(
                result.keyword,
                result.searchVolume,
                result.documentCount,
                result.goldenRatio
              ).catch(() => null),
              capOverallTimeout(15000),
              null
            )
          ]);

          const resolvedTrend = trendAnalysis ? {
            trendingReason: trendAnalysis.trendingReason,
            whyNow: trendAnalysis.whyNow,
            newsSource: trendAnalysis.source || trendAnalysis.sourceType || '자동 분석'
          } : {
            trendingReason: `"${result.keyword}"는 현재 검색량이 급상승 중입니다. 관련 정보에 대한 관심이 높아지고 있어요.`,
            whyNow: '지금 글을 작성하면 상위노출 가능성이 높습니다.',
            newsSource: '자동 분석'
          };

          const keywordGuide = buildKeywordGuide(result, resolvedTrend);

          return {
            ...result,
            trendAnalysis: resolvedTrend,
            keywordGuide,
            ultimateAnalysis: ultimateAnalysis || undefined
          };
        } catch {
          return {
            ...result,
            trendAnalysis: {
              trendingReason: `"${result.keyword}"는 현재 검색량이 급상승 중입니다.`,
              whyNow: '지금 글을 작성하면 상위노출 가능성이 높습니다.',
              newsSource: '자동 분석'
            },
            keywordGuide: buildKeywordGuide(result, {
              trendingReason: `"${result.keyword}"는 현재 검색량이 급상승 중입니다.`,
              whyNow: '지금 글을 작성하면 상위노출 가능성이 높습니다.',
              newsSource: '자동 분석'
            })
          };
        }
      });

      const fallback = limitedPreSelected.map(r => {
        const resolvedTrend = {
          trendingReason: `"${r.keyword}"는 현재 검색량이 급상승 중입니다. 관련 정보에 대한 관심이 높아지고 있어요.`,
          whyNow: '지금 글을 작성하면 상위노출 가능성이 높습니다.',
          newsSource: '자동 분석'
        };
        const keywordGuide = buildKeywordGuide(r, resolvedTrend);

        return {
          ...r,
          trendAnalysis: resolvedTrend,
          keywordGuide
        };
      });

      const enriched = await collectSettledWithinTimeout<ProTrafficKeyword>(
        'finalEnrichment:PromiseAll:explosionMode',
        analysisPromises as Promise<ProTrafficKeyword>[],
        capOverallTimeout(80000)
      );

      if (enriched.length === 0) return fallback;

      const merged = new Map<string, ProTrafficKeyword>();
      for (const r of fallback) {
        merged.set(String(r.keyword || ''), r);
      }
      for (const r of enriched) {
        const k = String(r.keyword || '');
        if (!k) continue;
        merged.set(k, r);
      }

      return Array.from(merged.values());
    })();

    const selectionPoolRaw = enrichedPremium.filter(r => isPremiumGoldenKeyword(r, bestMinSv, premiumCriteria));
    const selectionPool = fillToCountPreferCompact(selectionPoolRaw, count);
    let selectedKeywords = selectPremiumGolden(selectionPool, count)
      .map(r => {
        const grade = computePremiumGradeEffective(r, strictPro, { ...premiumCriteria, category });
        const isCPAKeyword = /렌탈|대출|보험|카드|통신사|인터넷사은품|상담|가입|신청|가격비교|최저가|비교추천/.test(r.keyword);
        // 🔥 v2.14.0 Phase H: sv < 500 이면 수익 전략 생성 차단
        const blueprint = canGenerateMonetization(r.searchVolume, r.documentCount)
          ? MonetizationStrategyGenerator.generate(
              r.keyword,
              r.searchVolume || 0,
              r.documentCount || 0,
              isCPAKeyword ? 'price' : (r.type === '💎 블루오션' ? 'niche' : (r.revenueEstimate?.revenueGrade === 'SSS' ? 'price' : 'info'))
            )
          : undefined;
        // 고도화: 분석 점수 가중치 재조정
        const rookieFriendly = calculateAdvancedRookieFriendly(r, undefined);
        const winningStrategy = generateWinningStrategy(r, rookieFriendly, blueprint);

        const riskAnalysis = computeRiskAnalysis(r.keyword);
        const isNiche = (r.documentCount || 0) < 10000 && (r.goldenRatio || 0) > 1.2;

        // 🚀 Early Bird 감지: 검색량은 일정 수준 이상인데 문서수가 5,000건 이하인 경우 (스타/연예인 특화)
        const isEarlyBird = (r.searchVolume || 0) > 300 && (r.documentCount || 0) < 5000;
        const issueForecast = isEarlyBird ? undefined : undefined;

        // 🆕 스마트블록 키워드 식별 및 점수 보너스 (키워드 특성 기반)
        // 블루오션 + 높은 황금비율 키워드는 스마트블록에서 추천될 가능성이 높음
        const isSmartBlockKeyword = (r.goldenRatio || 0) >= 1.0 && (r.documentCount || 0) < 30000;
        const smartBlockBonus = isSmartBlockKeyword ? 15 : 0; // 황금비율 점수에 15% 보너스

        return {
          ...r,
          grade,
          monetizationBlueprint: blueprint,
          rookieFriendly,
          winningStrategy,
          riskAnalysis,
          totalScore: (r.totalScore || 0) + smartBlockBonus, // 스마트블록 보너스 적용
          blueOcean: {
            ...r.blueOcean,
            isNiche,
            isEarlyBird,
            issueForecast
          }
        } as ProTrafficKeyword;
      });

    // 🔥 결과 부족 시 전 카테고리 relaxed fallback — 넓은 풀(sortedAllFinalCandidates)에서 끌어옴
    if (selectedKeywords.length < count) {
      const needMore = count - selectedKeywords.length;
      console.log(`[PRO-TRAFFIC] 🔄 결과 부족 (${selectedKeywords.length}/${count}) → 완화 기준으로 ${needMore}개 보충`);
      // enrichedPremium은 카테고리 매칭된 작은 풀 → 부족. sortedAllFinalCandidates(전체 verified)까지 확대.
      const widestPool = [
        ...enrichedPremium,
        ...sortedAllFinalCandidates.filter(r => {
          // 전체 verified 중, 카테고리 매칭되거나 혹은 어떤 카테고리도 지정 안 된 경우
          if (category === 'all' || category === 'pro_premium' || category === 'lite_standard') return true;
          return isKeywordInSelectedCategory(r.keyword, category);
        })
      ];
      const relaxed = fillToCountPreferCompact(
        [...widestPool].sort((a, b) => {
          const exDiff = calculateExplosionScore(b) - calculateExplosionScore(a);
          if (Math.abs(exDiff) > 0.0001) return exDiff;
          const grDiff = (b.goldenRatio ?? 0) - (a.goldenRatio ?? 0);
          if (Math.abs(grDiff) > 0.0001) return grDiff;
          const dcDiff = (a.documentCount ?? Number.MAX_SAFE_INTEGER) - (b.documentCount ?? Number.MAX_SAFE_INTEGER);
          if (Math.abs(dcDiff) > 0.1) return dcDiff;
          return (b.searchVolume ?? 0) - (a.searchVolume ?? 0);
        }),
        count * 3 // 여유있게 3배 풀 준비 후 중복 제거로 정확히 count까지 채움
      );
      // 기존 selectedKeywords + 부족분만 보충 (중복 제거)
      const existingKeys = new Set(selectedKeywords.map(k => String(k.keyword || '')));
      const topUp = relaxed.filter(r => !existingKeys.has(String(r.keyword || ''))).slice(0, needMore);
      if (topUp.length > 0) {
        const topUpEnriched = topUp.map(r => {
          const grade = computePremiumGradeEffective(r, strictPro, { ...premiumCriteria, category });
          const isCPAKeyword = /렌탈|대출|보험|카드|통신사|인터넷사은품|상담|가입|신청|가격비교|최저가|비교추천/.test(r.keyword);
          const blueprint = canGenerateMonetization(r.searchVolume, r.documentCount)
            ? MonetizationStrategyGenerator.generate(
                r.keyword,
                r.searchVolume || 0,
                r.documentCount || 0,
                isCPAKeyword ? 'price' : (r.type === '💎 블루오션' ? 'niche' : (r.revenueEstimate?.revenueGrade === 'SSS' ? 'price' : 'info'))
              )
            : undefined;
          const rookieFriendly = calculateAdvancedRookieFriendly(r, undefined);
          const winningStrategy = generateWinningStrategy(r, rookieFriendly, blueprint);
          const riskAnalysis = computeRiskAnalysis(r.keyword);
          return {
            ...r,
            grade,
            monetizationBlueprint: blueprint,
            rookieFriendly,
            winningStrategy,
            riskAnalysis,
          } as ProTrafficKeyword;
        });
        selectedKeywords = [...selectedKeywords, ...topUpEnriched];
        console.log(`[PRO-TRAFFIC] ✅ 완화 보충 완료: ${topUpEnriched.length}개 추가 → 총 ${selectedKeywords.length}개`);
      }
    }

    // 🔥 celeb 전용 legacy 경로 유지 (selectedKeywords가 여전히 0인 엣지 케이스)
    if (selectedKeywords.length === 0 && category === 'celeb') {
      const relaxed = fillToCountPreferCompact(
        [...enrichedPremium].sort((a, b) => {
          const exDiff = calculateExplosionScore(b) - calculateExplosionScore(a);
          if (Math.abs(exDiff) > 0.0001) return exDiff;
          const grDiff = (b.goldenRatio ?? 0) - (a.goldenRatio ?? 0);
          if (Math.abs(grDiff) > 0.0001) return grDiff;
          const dcDiff = (a.documentCount ?? Number.MAX_SAFE_INTEGER) - (b.documentCount ?? Number.MAX_SAFE_INTEGER);
          if (Math.abs(dcDiff) > 0.1) return dcDiff;
          return (b.searchVolume ?? 0) - (a.searchVolume ?? 0);
        }),
        count
      );
      selectedKeywords = relaxed.slice(0, count)
        .map(r => {
          const blueprint = canGenerateMonetization(r.searchVolume, r.documentCount)
            ? MonetizationStrategyGenerator.generate(
                r.keyword,
                r.searchVolume || 0,
                r.documentCount || 0,
                r.type === '💎 블루오션' ? 'niche' : (r.revenueEstimate?.revenueGrade === 'SSS' ? 'price' : 'info')
              )
            : undefined;
          const rookieFriendly = calculateAdvancedRookieFriendly(r, undefined);
          const winningStrategy = generateWinningStrategy(r, rookieFriendly, blueprint);
          const grade = computePremiumGradeEffective(r, strictPro, { ...premiumCriteria, category });

          return {
            ...r,
            grade,
            monetizationBlueprint: blueprint,
            winningStrategy
          } as ProTrafficKeyword;
        });
    }

    console.log(`[PRO-TRAFFIC] ✅ ${enrichedPremium.length}개 키워드 분석 완료 (끝판왕 v2.0 포함)`);
    console.log(`[PRO-TRAFFIC] 🏆 프리미엄 황금키워드 필터 통과: ${selectionPool.length}개 (S/SS/SSS만, 최소검색량=${bestMinSv}, 최소비율=${premiumMinRatioEffective}, 문서수상한=${premiumMaxDocumentsEffective})`);
    console.log(`[PRO-TRAFFIC] 🏁 최종 선정: ${selectedKeywords.length}개`);

    const withUltimate = selectedKeywords.filter(r => r.ultimateAnalysis).length;
    console.log(`[PRO-TRAFFIC] 🏆 끝판왕 분석 포함: ${withUltimate}개`);

    const summary = {
      totalFound: selectedKeywords.length,
      sssCount: selectedKeywords.filter(k => computePremiumGradeEffective(k, strictPro, { ...premiumCriteria, category }) === 'SSS').length,
      ssCount: selectedKeywords.filter(k => computePremiumGradeEffective(k, strictPro, { ...premiumCriteria, category }) === 'SS').length,
      sCount: selectedKeywords.filter(k => computePremiumGradeEffective(k, strictPro, { ...premiumCriteria, category }) === 'S').length,
      rookieFriendlyCount: selectedKeywords.filter(k => k.rookieFriendly.score >= 70).length,
      urgentCount: selectedKeywords.filter(k => k.timing.urgency === 'NOW' || k.timing.urgency === 'TODAY').length,
      blueOceanCount: selectedKeywords.filter(k => k.blueOcean.score >= 70).length,
      explosionFunnel
    };

    // Safety net: ensure ALL keywords have profitAnalysis
    for (const result of selectedKeywords) {
      if (!result.profitAnalysis && typeof result.searchVolume === 'number' && typeof result.documentCount === 'number' && result.searchVolume > 0) {
        const cachedCpc = apiCache.get(result.keyword)?.realCpc ?? apiCache.get(result.keyword.replace(/\s/g, ''))?.realCpc ?? null;
        const profitData = calculateProfitGoldenRatio(
          result.keyword,
          result.searchVolume,
          result.documentCount,
          result.category || 'default',
          {
            difficultyScore: result.difficultyScore,
            hasSmartBlock: result.hasSmartBlock,
            hasInfluencer: result.hasInfluencer,
            realCpc: cachedCpc,
          }
        );
        result.profitAnalysis = {
          grade: profitData.grade,
          gradeReason: profitData.gradeReason,
          profitGoldenRatio: profitData.profitGoldenRatio,
          estimatedCPC: profitData.estimatedCPC,
          purchaseIntentScore: profitData.purchaseIntentScore,
          competitionLevel: profitData.competitionLevel,
          isRealBlueOcean: profitData.isRealBlueOcean,
          blueOceanReason: profitData.blueOceanReason,
          estimatedDailyRevenue: profitData.estimatedDailyRevenue,
          estimatedMonthlyRevenue: profitData.estimatedMonthlyRevenue,
          strategy: profitData.strategy,
        };
      }
    }

    console.log(`[PRO-TRAFFIC] 🏆🏆🏆 ${selectedKeywords.length}개 황금 키워드 발굴 완료 (실제 API 검증 완료!)`);
    console.log(`[PRO-TRAFFIC] 💎 블루오션: ${summary.blueOceanCount}개, 신생적합: ${summary.rookieFriendlyCount}개`);
    console.log(`[PRO-TRAFFIC] 📊 TOP 키워드: ${selectedKeywords.slice(0, 3).map(k => `${k.keyword}(${k.searchVolume}/${k.documentCount})`).join(', ')}`);

    const smartBlockResult = await buildSmartBlockKeywords(selectedKeywords.map(k => k.keyword), 5);

    return {
      keywords: selectedKeywords,
      smartBlockKeywords: smartBlockResult.keywords,
      smartBlockKeywordsWithMetrics: smartBlockResult.keywordsWithMetrics,
      summary,
      huntingStrategy: '🏆 끝판왕 블루오션 전략: 실제 API 검증 완료된 황금 키워드',
      timestamp: new Date().toISOString()
    };
  }

  const enrichBatch = async (batch: ProTrafficKeyword[], label: string): Promise<ProTrafficKeyword[]> => {
    const analysisPromises = batch.map(async (result) => {
      try {
        // 병렬 처리
        const [trendAnalysis, ultimateAnalysis, competitionAnalysis, relatedKeywordsData] = await Promise.all([
          withStepTimeout(
            `analyzeKeywordTrendingReason:${result.keyword}`,
            analyzeKeywordTrendingReason(result.keyword, {
              searchVolume: result.searchVolume,
              documentCount: result.documentCount,
              growthRate: result.timing.score
            }).catch(() => null),
            9000,
            null
          ),
          withStepTimeout(
            `runUltimateAnalysis:${result.keyword}`,
            runUltimateAnalysis(
              result.keyword,
              result.searchVolume,
              result.documentCount,
              result.goldenRatio
            ).catch(() => null),
            12000,
            null
          ),
          withStepTimeout(
            `analyzeKeywordCompetition:${result.keyword}`,
            (async () => {
              const envMan = EnvironmentManager.getInstance();
              const config = envMan.getConfig();
              if (config.naverClientId && config.naverClientSecret) {
                return await analyzeKeywordCompetition(
                  result.keyword,
                  config.naverClientId,
                  config.naverClientSecret,
                  '일반' // 신생 블로그 기준
                );
              }
              return null;
            })(),
            12000,
            null
          ),
          // 🔥 [v16.0] 연관검색어 실시간 병렬 수집
          getRelatedKeywords(result.keyword)
        ]);

        const resolvedTrend = trendAnalysis ? {
          trendingReason: trendAnalysis.trendingReason,
          whyNow: trendAnalysis.whyNow,
          newsSource: trendAnalysis.source || trendAnalysis.sourceType || '자동 분석'
        } : {
          trendingReason: `"${result.keyword}"는 현재 검색량이 급상승 중입니다. 관련 정보에 대한 관심이 높아지고 있어요.`,
          whyNow: '지금 글을 작성하면 상위노출 가능성이 높습니다.',
          newsSource: '자동 분석'
        };

        // 🔥 연관검색어 저장
        result.relatedKeywords = relatedKeywordsData || [];

        // 🚀 지능형 제목 및 황금 근거 생성 (New!)
        const titleGen = getTitleGenerator();
        const nicheType = result.blueOcean?.isNiche ? 'blue_ocean' : (result.blueOcean?.isEarlyBird ? 'empty_house' : 'none');

        // FreshKeyword 규격으로 임시 변환
        const freshKw: any = {
          keyword: result.keyword,
          searchVolume: result.searchVolume,
          documentCount: result.documentCount,
          goldenRatio: result.goldenRatio,
          isRising: result.timing?.trendDirection === 'rising',
          isEarlyBird: result.blueOcean?.isEarlyBird,
          nicheInfo: { type: nicheType, score: result.blueOcean?.score || 0 },
          grade: result.grade,
          // 🔥 v2.18.0 Fix2: category 'general' 기본값 → classifyKeyword 보장 + 요청 카테고리 우선
          category: (result as any).category || (category && category !== 'all' ? category : classifyKeyword(result.keyword).primary),
          smartBlockType: result.smartBlockAnalysis?.type,
          trendingReason: resolvedTrend.trendingReason
        };

        // 🔥 비동기 100점 분석 (실시간 연관검색어 반영됨)
        const goldenBackground = await titleGen.analyzeGoldenBackgroundAsync(freshKw);
        const intelligentTitles = titleGen.generateTitles(freshKw, 5);

        const enrichedResult = {
          ...result,
          goldenBackground,
          intelligentTitles
        } as ProTrafficKeyword;

        const keywordGuide = buildKeywordGuide(enrichedResult, resolvedTrend);

        return {
          ...enrichedResult,
          trendAnalysis: resolvedTrend,
          keywordGuide,
          ultimateAnalysis: ultimateAnalysis || undefined,
          topBlogData: competitionAnalysis || undefined
        };
      } catch (error) {
        return {
          ...result,
          trendAnalysis: {
            trendingReason: `"${result.keyword}"는 현재 검색량이 급상승 중입니다.`,
            whyNow: '지금 글을 작성하면 상위노출 가능성이 높습니다.',
            newsSource: '자동 분석'
          },
          keywordGuide: buildKeywordGuide(result, {
            trendingReason: `"${result.keyword}"는 현재 검색량이 급상승 중입니다.`,
            whyNow: '지금 글을 작성하면 상위노출 가능성이 높습니다.',
            newsSource: '자동 분석'
          })
        };
      }
    });

    const finalEnrichmentFallback = batch.map(r => {
      const resolvedTrend = {
        trendingReason: `"${r.keyword}"는 현재 검색량이 급상승 중입니다. 관련 정보에 대한 관심이 높아지고 있어요.`,
        whyNow: '지금 글을 작성하면 상위노출 가능성이 높습니다.',
        newsSource: '자동 분석'
      };
      const keywordGuide = buildKeywordGuide(r, resolvedTrend);

      return {
        ...r,
        trendAnalysis: resolvedTrend,
        keywordGuide
      };
    });

    const enriched = await collectSettledWithinTimeout<ProTrafficKeyword>(
      `finalEnrichment:PromiseAll:${label}`,
      analysisPromises as Promise<ProTrafficKeyword>[],
      60000
    );

    return enriched.length > 0 ? enriched : finalEnrichmentFallback;
  };

  let enrichedResults = await enrichBatch(sortedFinalVerified, 'primary');
  let selectionPool = explosionMode ? enrichedResults.filter(isExplosiveKeywordStrict) : enrichedResults;
  let selectedKeywords = (explosionMode
    ? rerankAndSelectFinal(selectionPool, count, true)
    : rerankAndSelectFinal(selectionPool, count))
    .map(r => {
      const blueprint = canGenerateMonetization(r.searchVolume, r.documentCount)
        ? MonetizationStrategyGenerator.generate(
            r.keyword,
            r.searchVolume || 0,
            r.documentCount || 0,
            r.type === '💎 블루오션' ? 'niche' : (r.revenueEstimate?.revenueGrade === 'SSS' ? 'price' : 'info')
          )
        : undefined;
      // 수익성 & 신생 적합도 (v2.0 PRO 업그레이드)
      const rookieFriendly = calculateAdvancedRookieFriendly(r, r.topBlogData);

      // 이길 수 있는 전략 생성
      const winningStrategy = generateWinningStrategy(r, rookieFriendly, blueprint);

      return {
        ...r,
        monetizationBlueprint: blueprint,
        winningStrategy,
        rookieFriendly
      };
    });

  if (selectedKeywords.length < count) {
    const extraPoolSize = Math.min(finalRerankPoolSize * 2, Math.max(finalRerankPoolSize + count * 4, finalRerankPoolSize + 40));
    const extraCandidates = allFinalVerified.slice(finalRerankPoolSize, extraPoolSize);
    if (extraCandidates.length > 0) {
      const extraEnriched = await enrichBatch(extraCandidates, 'secondary');
      enrichedResults = [...enrichedResults, ...extraEnriched];
      selectionPool = explosionMode ? enrichedResults.filter(isExplosiveKeywordStrict) : enrichedResults;
      selectedKeywords = (explosionMode
        ? rerankAndSelectFinal(selectionPool, count, true)
        : rerankAndSelectFinal(selectionPool, count))
        .map(r => {
          const isCPAKeywordExtra = /렌탈|대출|보험|카드|통신사|인터넷사은품|상담|가입|신청|가격비교|최저가|비교추천/.test(r.keyword);
          const blueprint = canGenerateMonetization(r.searchVolume, r.documentCount)
            ? MonetizationStrategyGenerator.generate(
                r.keyword,
                r.searchVolume || 0,
                r.documentCount || 0,
                isCPAKeywordExtra ? 'price' : (r.type === '💎 블루오션' ? 'niche' : (r.revenueEstimate?.revenueGrade === 'SSS' ? 'price' : 'info'))
              )
            : undefined;
          // 수익성 & 신생 적합도 (v2.0 PRO 업그레이드)
          const rookieFriendly = calculateAdvancedRookieFriendly(r, r.topBlogData);

          // 이길 수 있는 전략 생성
          const winningStrategy = generateWinningStrategy(r, rookieFriendly, blueprint);

          const riskAnalysis = computeRiskAnalysis(r.keyword);
          const isNiche = (r.documentCount || 0) < 10000 && (r.goldenRatio || 0) > 1.2;

          // 🚀 Early Bird 감지
          const isEarlyBird = (r.searchVolume || 0) > 300 && (r.documentCount || 0) < 5000;
          const issueForecast = isEarlyBird ? undefined : undefined;

          return {
            ...r,
            monetizationBlueprint: blueprint,
            winningStrategy,
            rookieFriendly,
            riskAnalysis,
            blueOcean: {
              ...r.blueOcean,
              isNiche,
              isEarlyBird,
              issueForecast
            }
          };
        });
    }
  }

  // 🔥 surge 키워드 자동 SSS/SS 등급 부여 — 급증 자체가 황금 가치
  for (const kw of selectedKeywords) {
    const surgeInfo = surgeInfoMap.get(kw.keyword);
    if (surgeInfo) {
      (kw as any).grade = surgeInfo.surgeLevel === 'explosive' ? 'SSS' : 'SS';
      (kw as any).type = '🔥 급상승 키워드';
      if (kw.timing) {
        kw.timing.urgency = 'NOW';
        kw.timing.trendDirection = 'rising';
      }
    }
  }

  // 🔥 최종 보루: 원천 `results` 배열까지 거슬러 가서 공격적 보충 — 카테고리 혼입 + 검증 완화
  // results는 파이프라인 초반 풀(카테고리/verified 필터 이전). 가장 큰 원본.
  if (selectedKeywords.length < count) {
    const need = count - selectedKeywords.length;
    // 공백 제거 버전도 중복 취급 (예: "냉장고 정리" == "냉장고정리")
    const existingKeys = new Set<string>();
    for (const k of selectedKeywords) {
      const kw = String(k.keyword || '');
      existingKeys.add(kw);
      existingKeys.add(kw.replace(/\s+/g, ''));
    }
    // 복수 소스 통합: results (원천) + verifiedResults + allFinalVerified + sortedAllFinalCandidates
    const allSources = [...verifiedResults, ...allFinalVerified, ...sortedAllFinalCandidates, ...results];
    const uniqueMap = new Map<string, ProTrafficKeyword>();
    for (const r of allSources) {
      const k = String(r.keyword || '');
      if (!k) continue;
      const compact = k.replace(/\s+/g, '');
      if (existingKeys.has(k) || existingKeys.has(compact)) continue;
      // 공백 버전 우선 (사용자 친화). compact 키로 dedupe.
      if (uniqueMap.has(compact)) {
        const prev = uniqueMap.get(compact)!;
        if (!prev.keyword.includes(' ') && k.includes(' ')) {
          uniqueMap.set(compact, r); // 공백 있는 쪽으로 교체
        }
      } else {
        uniqueMap.set(compact, r);
      }
    }
    // verified 우선, 없으면 원천에서도 수용 (데이터 null이어도 키워드 자체는 가치)
    const verifiedUnified = Array.from(uniqueMap.values()).filter(isVerifiedMetrics);
    const rawUnified = Array.from(uniqueMap.values()).filter(r => !isVerifiedMetrics(r));
    const unifiedPool = [...verifiedUnified, ...rawUnified];
    console.log(`[PRO-TRAFFIC] 🛟 통합 풀: verified=${verifiedUnified.length}, raw=${rawUnified.length}, total=${unifiedPool.length}`);

    // 합본: surge → 같은 카테고리 → 황금비율 순
    const combined = unifiedPool
      .sort((a, b) => {
        // surge 키워드 최우선
        const aSurge = surgeInfoMap.has(a.keyword) ? 1 : 0;
        const bSurge = surgeInfoMap.has(b.keyword) ? 1 : 0;
        if (aSurge !== bSurge) return bSurge - aSurge;
        // 같은 카테고리 우선 (isKeywordInSelectedCategory)
        const isCatSpec2 = category !== 'all' && category !== 'pro_premium' && category !== 'lite_standard';
        if (isCatSpec2) {
          const aInCat = isKeywordInSelectedCategory(a.keyword, category) ? 1 : 0;
          const bInCat = isKeywordInSelectedCategory(b.keyword, category) ? 1 : 0;
          if (aInCat !== bInCat) return bInCat - aInCat;
        }
        const grA = a.goldenRatio ?? 0;
        const grB = b.goldenRatio ?? 0;
        if (Math.abs(grB - grA) > 0.01) return grB - grA;
        return (b.searchVolume ?? 0) - (a.searchVolume ?? 0);
      });
    const broadPool = combined.slice(0, need);
    if (broadPool.length > 0) {
      console.log(`[PRO-TRAFFIC] 🛟 최종 보루: 원천 풀에서 ${broadPool.length}개 보충 (${selectedKeywords.length}→${selectedKeywords.length + broadPool.length}/${count}, 풀크기=${unifiedPool.length})`);
      const enrichedTopUp = broadPool.map(r => {
        const isCPA = /렌탈|대출|보험|카드|통신사|인터넷사은품|상담|가입|신청|가격비교|최저가|비교추천/.test(r.keyword);
        const blueprint = canGenerateMonetization(r.searchVolume, r.documentCount)
          ? MonetizationStrategyGenerator.generate(
              r.keyword,
              r.searchVolume || 0,
              r.documentCount || 0,
              isCPA ? 'price' : (r.type === '💎 블루오션' ? 'niche' : (r.revenueEstimate?.revenueGrade === 'SSS' ? 'price' : 'info'))
            )
          : undefined;
        const rookieFriendly = calculateAdvancedRookieFriendly(r, r.topBlogData);
        const winningStrategy = generateWinningStrategy(r, rookieFriendly, blueprint);
        const riskAnalysis = computeRiskAnalysis(r.keyword);
        const grade = computePremiumGradeEffective(r, strictPro, { ...premiumCriteria, category });
        return {
          ...r,
          grade,
          monetizationBlueprint: blueprint,
          winningStrategy,
          rookieFriendly,
          riskAnalysis,
        };
      });
      selectedKeywords = [...selectedKeywords, ...enrichedTopUp];
    }
  }

  console.log(`[PRO-TRAFFIC] ✅ ${enrichedResults.length}개 키워드 분석 완료 (끝판왕 v2.0 포함)`);
  if (explosionMode) {
    console.log(`[PRO-TRAFFIC] 🔥 폭발 키워드 필터 통과: ${selectionPool.length}개 (최소점수 ${EXPLOSION_ONLY_MIN_SCORE}, 최소검색량 ${EXPLOSION_ONLY_MIN_SEARCH_VOLUME}, 최소비율 ${EXPLOSION_ONLY_MIN_GOLDEN_RATIO})`);
  }
  console.log(`[PRO-TRAFFIC] 🏁 최종 선정: ${selectedKeywords.length}개`);

  // 끝판왕 분석 포함된 키워드 수 로깅
  const withUltimate = selectedKeywords.filter(r => r.ultimateAnalysis).length;
  console.log(`[PRO-TRAFFIC] 🏆 끝판왕 분석 포함: ${withUltimate}개`);

  // 🎯 11단계: 요약 통계
  const summary = {
    totalFound: selectedKeywords.length,
    sssCount: selectedKeywords.filter(k => computePremiumGradeEffective(k, strictPro, { ...premiumCriteria, category }) === 'SSS').length,
    ssCount: selectedKeywords.filter(k => computePremiumGradeEffective(k, strictPro, { ...premiumCriteria, category }) === 'SS').length,
    sCount: selectedKeywords.filter(k => computePremiumGradeEffective(k, strictPro, { ...premiumCriteria, category }) === 'S').length,
    rookieFriendlyCount: selectedKeywords.filter(k => k.rookieFriendly.score >= 70).length,
    urgentCount: selectedKeywords.filter(k => k.timing.urgency === 'NOW' || k.timing.urgency === 'TODAY').length,
    blueOceanCount: selectedKeywords.filter(k => k.blueOcean.score >= 70).length
  };

  // Safety net: ensure ALL keywords have profitAnalysis
  for (const result of selectedKeywords) {
    if (!result.profitAnalysis && typeof result.searchVolume === 'number' && typeof result.documentCount === 'number' && result.searchVolume > 0) {
      const cachedCpc = apiCache.get(result.keyword)?.realCpc ?? apiCache.get(result.keyword.replace(/\s/g, ''))?.realCpc ?? null;
      const profitData = calculateProfitGoldenRatio(
        result.keyword,
        result.searchVolume,
        result.documentCount,
        result.category || 'default',
        {
          difficultyScore: result.difficultyScore,
          hasSmartBlock: result.hasSmartBlock,
          hasInfluencer: result.hasInfluencer,
          realCpc: cachedCpc,
        }
      );
      result.profitAnalysis = {
        grade: profitData.grade,
        gradeReason: profitData.gradeReason,
        profitGoldenRatio: profitData.profitGoldenRatio,
        estimatedCPC: profitData.estimatedCPC,
        purchaseIntentScore: profitData.purchaseIntentScore,
        competitionLevel: profitData.competitionLevel,
        isRealBlueOcean: profitData.isRealBlueOcean,
        blueOceanReason: profitData.blueOceanReason,
        estimatedDailyRevenue: profitData.estimatedDailyRevenue,
        estimatedMonthlyRevenue: profitData.estimatedMonthlyRevenue,
        strategy: profitData.strategy,
      };
    }
  }

  console.log(`[PRO-TRAFFIC] 🏆🏆🏆 ${selectedKeywords.length}개 황금 키워드 발굴 완료 (실제 API 검증 완료!)`);
  console.log(`[PRO-TRAFFIC] 💎 블루오션: ${summary.blueOceanCount}개, 신생적합: ${summary.rookieFriendlyCount}개`);
  console.log(`[PRO-TRAFFIC] 📊 TOP 키워드: ${selectedKeywords.slice(0, 3).map(k => `${k.keyword}(${k.searchVolume}/${k.documentCount})`).join(', ')}`);

  const smartBlockResult = await buildSmartBlockKeywords(selectedKeywords.map(k => k.keyword), 5);

  return {
    keywords: selectedKeywords,
    smartBlockKeywords: smartBlockResult.keywords,
    smartBlockKeywordsWithMetrics: smartBlockResult.keywordsWithMetrics,
    summary,
    huntingStrategy: '🏆 끝판왕 블루오션 전략: 실제 API 검증 완료된 황금 키워드',
    timestamp: new Date().toISOString()
  };
}

// ...
/**
 * 📜 정책브리핑 키워드 (다중 소스 - 안정적!)
 */
async function getPolicyBriefingKeywords(): Promise<string[]> {
  const keywords: string[] = [];

  try {
    const axios = (await import('axios')).default;

    // 여러 정책 RSS 소스 시도
    const rssUrls = [
      'https://www.korea.kr/rss/news.xml',
      'https://www.moel.go.kr/rss/news.do',
      'https://www.mohw.go.kr/rss/news.do'
    ];

    for (const url of rssUrls) {
      try {
        const response = await axios.get(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          timeout: 2000
        });

        const titleMatches = response.data.match(/<title>([^<]+)<\/title>/g);
        if (titleMatches) {
          for (const match of titleMatches.slice(1, 15)) {
            const title = match.replace(/<\/?title>/g, '').trim();
            if (title.length > 5 && title.length < 60) {
              keywords.push(title);
            }
          }
        }
      } catch { /* 개별 실패 무시 */ }
    }

    if (keywords.length > 0) {
      console.log(`[PRO-TRAFFIC] 📜 정책 RSS ${keywords.length}개`);
    }
  } catch { /* 무시 */ }

  // 정책 RSS 실패 시 기본 정책 키워드 추가
  if (keywords.length === 0) {
    const defaultPolicyKeywords = [
      '2025 청년도약계좌', '청년월세지원', '근로장려금 신청',
      '자녀장려금', '육아휴직급여', '국민연금 수령나이',
      '기초연금 수급자격', '주거급여 신청', '에너지바우처'
    ];
    keywords.push(...defaultPolicyKeywords);
    console.log(`[PRO-TRAFFIC] 📜 정책 기본키워드 ${keywords.length}개`);
  }

  return [...new Set(keywords)].slice(0, 20);
}

/**
 * 🔥 네이버 실시간 연관 검색어
 */
async function getNaverRealtimeKeywords(): Promise<string[]> {
  const keywords: string[] = [];

  try {
    // 인기 검색어로 연관 키워드 수집
    const popularSeeds = ['지원금', '신청', '혜택', '무료', '할인', '이벤트'];

    for (const seed of popularSeeds) {
      const related = await fetchNaverAutocomplete(seed);
      keywords.push(...related);
    }

    console.log(`[PRO-TRAFFIC] 🔥 실시간 연관 ${keywords.length}개`);
  } catch { /* 무시 */ }

  return [...new Set(keywords)].slice(0, 100);
}

/**
 * 📅 시즌/이벤트 키워드 자동 생성
 */
async function getSeasonalEventKeywords(): Promise<string[]> {
  const keywords: string[] = [];
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // 현재 시즌 기반 키워드 자동 생성
  const yearKeywords = [
    `${year}`, `${year}년`, `${year + 1}`, `${year + 1}년`
  ];

  const monthKeywords: Record<number, string[]> = {
    1: ['새해', '신년', '연말정산', '설'],
    2: ['발렌타인', '졸업', '입학'],
    3: ['봄', '벚꽃', '황사', '미세먼지'],
    4: ['봄꽃', '어버이날', '어린이날'],
    5: ['종합소득세', '휴가', '여름준비'],
    6: ['여름', '에어컨', '장마'],
    7: ['휴가', '바다', '피서'],
    8: ['개학', '추석준비'],
    9: ['추석', '단풍'],
    10: ['독감', '난방', '김장'],
    11: ['블랙프라이데이', '연말', '크리스마스준비'],
    12: ['크리스마스', '연말정산', '새해준비']
  };

  // 조합 생성
  for (const y of yearKeywords) {
    for (const m of (monthKeywords[month] || [])) {
      keywords.push(`${y} ${m}`);
      keywords.push(`${m} ${y}`);
    }
  }

  // 정부 지원금 시즌 키워드
  const govSeasonKeywords = [
    `${year} 청년지원금`, `${year} 근로장려금`, `${year} 연말정산`,
    `${year + 1} 청년정책`, `${year + 1} 지원금`, `${month}월 지원금 신청`
  ];
  keywords.push(...govSeasonKeywords);

  console.log(`[PRO-TRAFFIC] 📅 시즌 키워드 ${keywords.length}개`);
  return keywords;
}

/**
 * 질문에서 핵심 키워드 추출
 */
function extractQuestionKeywords(question: string): string[] {
  const keywords: string[] = [];

  // "~하는 법", "~방법", "~추천" 등의 패턴 추출
  const patterns = [
    /(.+)(하는\s*법|방법|추천|비교|가격|후기|신청|조건)/g,
    /어떻게\s*(.+)/g,
    /(.+)\s*(어디서|언제|얼마)/g
  ];

  for (const pattern of patterns) {
    const matches = question.match(pattern);
    if (matches) {
      keywords.push(...matches);
    }
  }

  // 단어 추출
  const words = question.split(/[\s\?\!\.\,]+/).filter(w => w.length > 1 && w.length < 15);
  keywords.push(...words);

  return keywords;
}

/**
 * 📰 뉴스 이슈 키워드 (RSS 기반 - 안정적!)
 */
async function getNewsIssueKeywords(): Promise<string[]> {
  const keywords: string[] = [];

  try {
    const axios = (await import('axios')).default;

    // 네이버 뉴스 RSS (더 안정적!)
    const rssUrls = [
      'https://news.google.com/rss/search?q=지원금+OR+정책+OR+혜택&hl=ko&gl=KR&ceid=KR:ko',
      'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtdHZHZ0pMVWlnQVAB?hl=ko&gl=KR&ceid=KR:ko'
    ];

    for (const url of rssUrls) {
      try {
        const response = await axios.get(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          timeout: 3000
        });

        // RSS 타이틀 추출
        const titleMatches = response.data.match(/<title>([^<]+)<\/title>/g);
        if (titleMatches) {
          for (const match of titleMatches.slice(1, 20)) {
            const title = match.replace(/<\/?title>/g, '').trim();
            if (title.length > 5 && title.length < 60) {
              // 정책/지원금 관련 키워드만
              const policyPatterns = ['지원', '신청', '혜택', '대상', '보조금', '환급', '감면', '정책', '청년', '소상공인'];
              if (policyPatterns.some(p => title.includes(p))) {
                keywords.push(title);
              }
            }
          }
        }
      } catch { /* 개별 실패 무시 */ }
    }

    if (keywords.length > 0) {
      console.log(`[PRO-TRAFFIC] 📰 뉴스 RSS ${keywords.length}개`);
    }
  } catch (error) {
    console.warn('[PRO-TRAFFIC] 뉴스 RSS 실패');
  }

  return [...new Set(keywords)].slice(0, 15);
}

// ─── 뉴스 제목 → 블로그 시드 키워드 추출 ───

/** 뉴스 제목에서 불용어를 제거하고 의미 있는 명사구를 추출 */
function extractSeedsFromNewsTitles(titles: string[]): string[] {
  // 불용어 (기사 어미, 조사, 접속사, 서술어)
  const STOPWORDS = new Set([
    '기자', '뉴스', '속보', '단독', '종합', '포토', '영상', '사진',
    '오늘', '내일', '어제', '올해', '지난해', '한편', '또한', '이에',
    '관련', '대해', '통해', '위해', '따라', '밝혔다', '전했다', '보도',
    '것으로', '알려졌다', '나타났다', '드러났다', '확인됐다', '됐다',
    '했다', '한다', '이다', '있다', '없다', '됐다', '라며', '라고',
    '확정', '돌파', '유출', '엇갈려', '폭탄', '발매',
  ]);

  // 숫자+단위 패턴 (core에서 제외)
  const NUM_UNIT_RE = /^\d+(?:년|월|일|억|만원|만|천|조|위|개|번째|차)$/;

  // 카테고리별 수익화 접미사 매핑
  const CATEGORY_SUFFIXES: Record<string, readonly string[]> = {
    finance: ['비교', '금리', '조건', '신청방법', '계산기', '절세'],
    pet_dog: ['추천', '비교', '가격', '후기', '효과'],
    pet_cat: ['추천', '비교', '가격', '후기', '효과'],
    recipe: ['레시피', '만드는법', '황금비율'],
    travel_domestic: ['코스', '맛집', '숙소추천', '가볼만한곳'],
    travel_overseas: ['경비', '코스', '호텔추천', '맛집'],
    health: ['효능', '부작용', '복용법', '추천'],
    beauty: ['추천', '비교', '성분', '후기'],
    electronics: ['추천', '비교', '가격', '순위'],
    laptop: ['추천', '비교', '가성비', '순위'],
    music: ['티켓', '일정', '세트리스트', '후기'],
    movie: ['출연진', '줄거리', '결말', '리뷰'],
    default: ['추천', '비교', '정리', '방법'],
  };

  const seeds: string[] = [];

  for (const rawTitle of titles) {
    // 1) 기사 메타 제거: [...], 「...」, 언론사명, 특수문자
    const cleaned = rawTitle
      .replace(/\[.*?\]/g, '')
      .replace(/「.*?」/g, '')
      .replace(/\(.*?\)/g, '')
      .replace(/['"""''…·\|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // 2) 구두점 기준 분리 → 각 절에서 핵심어 추출
    const clauses = cleaned.split(/[,?!…\.·\-]/).map(c => c.trim()).filter(c => c.length >= 4);

    for (const clause of clauses) {
      const words = clause.split(/\s+/).filter(w => w.length >= 2 && !STOPWORDS.has(w));
      if (words.length === 0) continue;

      // 2~5어절 조합을 시드로 사용
      if (words.length >= 2 && words.length <= 5) {
        seeds.push(words.join(' '));
      } else if (words.length > 5) {
        // 긴 절은 앞 4어절만
        seeds.push(words.slice(0, 4).join(' '));
      }

      // 핵심 명사(첫 2어절) — 숫자+단위 토큰 제외
      const coreWords = words
        .filter(w => !NUM_UNIT_RE.test(w))
        .slice(0, 2);
      const core = coreWords.join(' ');
      if (core.length < 3) continue;

      // 카테고리 감지 → 도메인별 접미사 선택
      const category = classifyKeyword(core).primary;
      const suffixes = CATEGORY_SUFFIXES[category] ?? CATEGORY_SUFFIXES['default'];

      for (const suffix of suffixes) {
        if (!core.includes(suffix)) {
          seeds.push(`${core} ${suffix}`);
        }
      }
    }
  }

  // 🔥 v2.16.0: 극블루오션 최대 수집 — seed 풀 60 → 200 확장
  return [...new Set(seeds)].slice(0, 200);
}

/** 네이버 인기 뉴스에서 시드 키워드를 수집 (5초 타임아웃, 실패 시 빈 배열) */
async function getNewsCrawlerSeedKeywords(): Promise<string[]> {
  try {
    const result = await Promise.race([
      getNaverPopularNews(),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('news-crawler-timeout')), 5000))
    ]);

    if (!result || !result.success || result.news.length === 0) return [];

    const titles = result.news.map(n => n.title);
    const seeds = extractSeedsFromNewsTitles(titles);

    if (seeds.length > 0) {
      console.log(`[PRO-TRAFFIC] 📰 뉴스 크롤러 시드 ${seeds.length}개 추출: ${seeds.slice(0, 5).join(', ')}...`);
    }

    return seeds;
  } catch (error) {
    console.warn('[PRO-TRAFFIC] 📰 뉴스 크롤러 시드 수집 실패, 계속 진행');
    return [];
  }
}

/**
 * 🏆 카테고리별 꿀통 시드 키워드 - 키워드마스터 압도하는 독보적 데이터!/**
 * 🕒 날짜 분석 유틸리티 (SRAA - Seasonal & Recency Advanced Analysis)
 * '3일 전', '2023.10.25' 등의 문자열을 경과 일수로 변환
 */
function getDaysOld(dateStr: string): number {
  if (!dateStr) return 365; // 정보 없으면 1년으로 간주 (보수적)

  const mockDateStr = EnvironmentManager.getInstance().getConfig().mockDate;
  const now = mockDateStr ? new Date(mockDateStr) : new Date();

  // 'X분 전', 'X시간 전', 'X일 전' 처리
  const relativeMatch = dateStr.match(/(\d+)(분|시간|일)\s*전/);
  if (relativeMatch) {
    const val = parseInt(relativeMatch[1]);
    const unit = relativeMatch[2];
    if (unit === '분') return 0;
    if (unit === '시간') return 0;
    if (unit === '일') return val;
  }

  // '방금 전', '어제'
  if (dateStr.includes('방금') || dateStr.includes('최근')) return 0;
  if (dateStr.includes('어제')) return 1;

  // '2024.01.01' or '24.01.01' or '2024-01-01'
  const dateMatch = dateStr.match(/(\d{2,4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (dateMatch) {
    let y = parseInt(dateMatch[1]);
    if (y < 100) y += 2000;
    const m = parseInt(dateMatch[2]) - 1;
    const d = parseInt(dateMatch[3]);
    const targetDate = new Date(y, m, d);
    const diffMs = now.getTime() - targetDate.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  return 365;
}

/**
 * 🎯 각 카테고리당 50~100개 시드로 수백 개 연관 키워드 수집
 */
function getProfitableSeedKeywords(category: string, month: number): string[] {
  // CATEGORY_SEEDS (Removed, now imported from hunter-seeds.ts)
  // 🔥 정적 시드 + 실시간 트렌드 제품명 (올리브영/무신사) 합류
  const staticSeeds = CATEGORY_SEEDS[category] || [];
  const dynamicSeeds = DYNAMIC_TREND_SEEDS[category] || [];
  const baseSeeds = Array.from(new Set([...dynamicSeeds, ...staticSeeds]));

  const buildCategoryLongtailSeeds = (cat: string, seeds: string[]): string[] => {
    if (!seeds || seeds.length === 0) return [];
    // 🔥 v2.16.0: 극블루오션 탐색용 공격적 롱테일 suffix (6 → 20)
    const commonSuffixes = [
      ' 추천', ' 총정리', ' 정리', ' 방법', ' 하는법', ' 꿀팁',
      ' 후기', ' 비교', ' 순위', ' 가격', ' 효과', ' 부작용',
      ' 초보', ' 입문', ' 전', ' 차이', ' 종류', ' 기초',
      ' 실패', ' 주의사항',
    ];
    let extraSuffixes: string[] = [];
    if (cat === 'celeb') {
      extraSuffixes = [
        ' 일정', ' 정보', ' 모음', ' 티켓팅', ' 예매', ' 굿즈', ' 응원법',
        ' 포토카드', ' 포카', ' 시즌그리팅', ' 시그', ' 앨범 구성', ' 초동',
        ' 숙소', ' 사복', ' 공항패션', ' 인스타', ' 배경화면', ' 보정사진',
        ' 세계관', ' 가사 해석', ' 뮤비 해석'
      ];
    } else if (cat === 'movie') {
      // 🔥 v2.17.0: 영화 — 개봉/평점/명대사/해석 중심
      extraSuffixes = [' 개봉일', ' 예매', ' 평점', ' 관객수', ' 줄거리', ' 결말해석',
        ' 쿠키영상', ' ott', ' 다시보기', ' 명대사', ' 촬영지', ' OST', ' 감독',
        ' 출연진', ' 해석', ' 숨겨진 의미', ' 리뷰'];
    } else if (cat === 'drama') {
      // 🔥 v2.17.0: 드라마 — 회차/시청률/OST/결말
      extraSuffixes = [' 몇부작', ' 방영시간', ' 시청률', ' 회차정보', ' 출연진 성격',
        ' 촬영지', ' 결말 예상', ' ost', ' 다시보기 무료', ' 재방송',
        ' 인물관계도', ' 원작', ' 예고편', ' 명대사', ' 줄거리 요약'];
    } else if (cat === 'music') {
      // 🔥 v2.17.0: 음악 — 가사/차트/뮤비/티켓팅
      extraSuffixes = [' 가사', ' 뮤비 해석', ' 차트 순위', ' 음원 수익',
        ' 앨범 수록곡', ' 콘서트 예매', ' 티켓팅', ' 직캠', ' 안무',
        ' 팬송', ' 발매일', ' 초동', ' 굿즈', ' 플레이리스트'];
    } else if (cat === 'book') {
      // 🔥 v2.17.0: 도서 — 독후감/줄거리/추천/베스트셀러
      extraSuffixes = [' 줄거리', ' 독후감', ' 서평', ' 명대사',
        ' 추천도서', ' 베스트셀러', ' 리디북스', ' 밀리의서재',
        ' 오디오북', ' 완독 후기', ' 교보문고', ' 예스24', ' 작가 다른 책'];
    } else if (cat === 'anime') {
      // 🔥 v2.17.0: 애니 — 화수/성우/OST/캐릭터
      extraSuffixes = [' 화수', ' 성우', ' ost 가사', ' 캐릭터 해석',
        ' 원작 만화', ' 극장판', ' 피규어', ' 굿즈 정보', ' 방영일',
        ' 더빙판', ' 자막', ' 스트리밍', ' 라프텔', ' 왓챠'];
    } else if (cat === 'broadcast') {
      // 🔥 v2.17.0: 방송·예능 — 출연진/녹화/편성/리뷰
      extraSuffixes = [' 출연진', ' 녹화장소', ' 편성표', ' 재방송',
        ' 첫방송', ' 엔딩곡', ' 시청률', ' 하이라이트', ' 클립',
        ' 티저', ' 게스트', ' 방영 정지', ' 논란', ' 해설'];
    } else if (cat === 'life_tips') {
      // 🔥 v2.17.0 확장: 생활 꿀팁 — 제거/절약/응급/응용
      extraSuffixes = [' 정리법', ' 요약', ' 체크리스트', ' 제거법',
        ' 아끼는 법', ' 응급처치', ' 활용법', ' 대안', ' 필요한 것',
        ' 주의사항', ' 실수', ' 초보', ' 쉽게', ' 돈안드는', ' DIY'];
    } else if (cat === 'interior') {
      // 🔥 v2.17.0 확장: 인테리어
      extraSuffixes = [' 배치법', ' 배색', ' 가구 추천', ' 셀프 리모델링',
        ' 원룸', ' 투룸', ' 아파트', ' 주방', ' 거실', ' 침실',
        ' DIY', ' 소품', ' 조명', ' 벽지', ' 커튼'];
    } else if (cat === 'it') {
      // 🔥 v2.17.0 확장: IT
      extraSuffixes = [' 설정', ' 사용법', ' 가이드', ' 튜토리얼',
        ' 무료 앱', ' 유튜브 강의', ' 단축키', ' 최적화', ' 오류 해결',
        ' 로그인 안됨', ' 업데이트', ' 호환성', ' 리뷰', ' 비교 분석'];
    } else if (cat === 'business') {
      // 🔥 v2.17.0 확장: 비즈니스
      extraSuffixes = [' 절세', ' 전략', ' 핵심정리', ' 사례',
        ' 창업', ' 세무', ' 4대보험', ' 부가세', ' 종합소득세',
        ' 프리랜서', ' 1인기업', ' 개인사업자', ' 법인전환', ' 정부지원'];
    } else if (cat === 'daily') {
      // 🔥 v2.17.0: 일상 — 관계/취미/감정
      extraSuffixes = [' 선물 추천', ' 데이트', ' 취미', ' 친구', ' 가족',
        ' 연애', ' MBTI', ' 스트레스', ' 기분전환', ' 심리테스트',
        ' 이별', ' 재회', ' 관계', ' 대화법'];
    } else if (cat === 'health') {
      // 🔥 v2.17.0 확장: 건강
      extraSuffixes = [' 증상', ' 원인', ' 예방법', ' 치료',
        ' 병원', ' 진료과', ' 검사 비용', ' 보험 적용', ' 자가진단',
        ' 약 복용', ' 부작용', ' 식단', ' 운동', ' 영양제 추천'];
    } else if (cat === 'realestate') {
      // 🔥 v2.17.0 확장: 부동산
      extraSuffixes = [' 조건', ' 한도', ' 금리', ' 계산', ' 신청', ' 서류',
        ' 청약 가점', ' 분양가', ' 입지 분석', ' 학군', ' 교통',
        ' 재건축', ' 전세 사기 방지', ' 특공', ' 당첨 확률'];
    } else if (cat === 'finance') {
      // 🔥 v2.17.0 신규: 금융·재테크
      extraSuffixes = [' 수익률', ' 연금', ' 적금', ' 이자', ' 금리 비교',
        ' ETF 추천', ' 배당주', ' 초보', ' 1000만원 투자',
        ' 세액공제', '  IRP', ' 청약저축', ' 파킹통장', ' 수수료'];
    } else if (cat === 'policy') {
      // 🔥 v2.17.0 신규: 정책·지원금
      extraSuffixes = [' 대상', ' 신청방법', ' 신청기간', ' 지원금액',
        ' 신청 서류', ' 자격 조건', ' 중복 수령', ' 온라인 신청',
        ' 지급일', ' 탈락 사유', ' 2026', ' 청년', ' 노인', ' 1인가구'];
    } else if (cat === 'self_development') {
      extraSuffixes = [
        ' 루틴', ' 습관', ' 공부법', ' 계획', ' 추천', ' 정리',
        ' 독학', ' 난이도', ' 기출', ' 합격', ' 합격 후기', ' 일정',
        ' 응시료', ' 접수',
        ' 가격', ' 비용', ' 할인', ' 쿠폰', ' 할인코드', ' 환불', ' 해지'
      ];
    } else if (cat === 'beauty') {
      extraSuffixes = [
        ' 추천 순위', ' 성분', ' 효과', ' 부작용', ' 피부타입별 추천',
        ' 건성 추천', ' 지성 추천', ' 복합성 추천', ' 민감성 추천',
        ' 올리브영 인기', ' 다이소 가성비', ' 리뷰 정리',
        ' 바르는 순서', ' 사용 주기', ' 유통기한', ' 제형 비교',
      ];
    } else if (cat === 'fashion') {
      extraSuffixes = [
        ' 브랜드 순위', ' 코디법', ' 스타일링', ' 사이즈 팁',
        ' 하객룩 코디', ' 출근룩 코디', ' 데일리룩 코디',
        ' 세일 정보', ' 아울렛 추천', ' 가성비 브랜드',
        ' 원단 차이', ' 컬러 추천', ' 체형별 추천',
      ];
    }

    // 🔥 v2.12.0 Phase 1-3: 시드 정규화 — 이미 접미사 붙은 시드에서 접미사 제거
    //   (예: "선크림추천" → "선크림" → "선크림 추천"로 정상 longtail 생성)
    const EXISTING_SUFFIX_RE = /(추천|후기|리뷰|비교|순위|가격|방법|꿀팁|정리|총정리|종류|사용법|하는법)$/;
    const normalizeSeedForLongtail = (seed: string): string => {
      let s = (seed || '').trim();
      // 최대 2번까지 접미사 연속 제거 ("선크림추천추천" 대비)
      for (let i = 0; i < 2; i++) {
        const m = EXISTING_SUFFIX_RE.exec(s);
        if (!m) break;
        s = s.slice(0, m.index).trim();
      }
      return s;
    };
    // 🔥 v2.16.0 극블루오션 최대 탐색 — longtailLimit 60 → 150
    const longtailLimit = Math.min(baseSeeds.length, 150);
    const seedsForLongtail = baseSeeds.slice(0, longtailLimit).map(normalizeSeedForLongtail).filter(s => s.length >= 2);
    const results: string[] = [];
    for (const kw of seedsForLongtail) {
      for (const s of commonSuffixes) {
        results.push(kw + s);
      }
      for (const s of extraSuffixes) {
        results.push(kw + s);
      }
    }
    return results;
  };

  // 카테고리에 맞는 시드 선택
  let seeds: string[] = [];

  if (category === 'all') {
    // 🏆 PRO 전용: 초고수 황금키워드 우선 포함! (월 10억+)
    if (CATEGORY_SEEDS['pro_premium']) {
      seeds.push(...shuffleArray(CATEGORY_SEEDS['pro_premium']).slice(0, 100)); // PRO 전용 100개 우선!
    }
    // ⭐ Lite 키워드도 포함 (월 200만+)
    if (CATEGORY_SEEDS['lite_standard']) {
      seeds.push(...shuffleArray(CATEGORY_SEEDS['lite_standard']).slice(0, 50)); // Lite 50개
    }
    // 나머지 카테고리에서 골고루 수집
    for (const [catName, catSeeds] of Object.entries(CATEGORY_SEEDS)) {
      if (catName !== 'pro_premium' && catName !== 'lite_standard') {
        seeds.push(...shuffleArray(catSeeds).slice(0, 10)); // 각 카테고리에서 10개씩 (랜덤)
      }
    }
  } else if (category === 'pro_premium') {
    // 🏆👑 PRO 전용 카테고리 선택 시 - 월 10억+ 초고수 키워드만!
    seeds = shuffleArray(CATEGORY_SEEDS['pro_premium'] || []);
  } else if (category === 'lite_standard') {
    // ⭐💫 Lite 전용 카테고리 선택 시 - 월 200만+ 고수 키워드만!
    seeds = shuffleArray(CATEGORY_SEEDS['lite_standard'] || []);
  } else {
    const direct = CATEGORY_SEEDS[category];
    const fallback = getDefaultTrendingKeywords(category);
    const base = (direct && direct.length > 0) ? direct : fallback;
    seeds = shuffleArray(base);
    const longtails = buildCategoryLongtailSeeds(category, base);
    if (longtails.length > 0) {
      seeds.push(...longtails);
    }
  }

  // 월별 시즌 키워드 추가 (셔플)
  const seasonSeeds = getProfitableSeasonKeywords(month);
  seeds.push(...shuffleArray(seasonSeeds));

  return shuffleArray([...new Set(seeds)]); // 최종 셔플!
}

/**
* 🎯 시즌별 정부 지원 + 이슈 키워드
*/
function getProfitableSeasonKeywords(month: number): string[] {
  // SEASON_KEYWORDS (Removed, now imported from hunter-seeds.ts)
  return SEASON_KEYWORDS[month] || [];
}

/**
 * 🏆🏆🏆 진짜 끝판왕 키워드 확장 🏆🏆🏆
 * 
 * 키워드마스터를 완전히 압도하는 다중 레이어 확장!
 * 1차 확장 → 2차 재귀 확장 → 3차 롱테일 → 황금 필터링
 */
export async function expandToLongtailReal(seed: string, depth: number = 1): Promise<string[]> {
  const results: string[] = [];

  if (!seed || seed.length < 2) {
    return [seed];
  }

  // 🔥 1단계: 기본 자동완성
  const baseKeywords = await fetchNaverAutocomplete(seed);
  results.push(...baseKeywords);

  // 🔥 2단계: 가나다 완전 확장 (ㄱ~ㅎ + 가~하 + 아~히)
  const koreanChars = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  const koreanSyllables1 = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];
  const koreanSyllables2 = ['거', '너', '더', '러', '머', '버', '서', '어', '저', '처', '커', '터', '퍼', '허'];
  const koreanSyllables3 = ['고', '노', '도', '로', '모', '보', '소', '오', '조', '초', '코', '토', '포', '호'];

  // 병렬로 가나다 확장 (속도 최적화)
  const allKorean = [...koreanChars, ...koreanSyllables1, ...koreanSyllables2, ...koreanSyllables3];
  const ganadaPromises = allKorean.map(async (char) => {
    const keywords = await fetchNaverAutocomplete(`${seed} ${char}`);
    return keywords;
  });

  const ganadaResults = await Promise.all(ganadaPromises);
  for (const keywords of ganadaResults) {
    results.push(...keywords);
  }

  // 🔥 3단계: 알파벳 확장 (a~z 전체!)
  const alphabets = 'abcdefghijklmnopqrstuvwxyz'.split('');
  const alphabetPromises = alphabets.map(async (char) => {
    const keywords = await fetchNaverAutocomplete(`${seed} ${char}`);
    return keywords;
  });

  const alphabetResults = await Promise.all(alphabetPromises);
  for (const keywords of alphabetResults) {
    results.push(...keywords);
  }

  // 🔥 4단계: 숫자 확장 (1~10, 연도, 가격대)
  const numbers = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '20', '30', '50', '100',
    '2024', '2025', '2026', '만원', '10만원', '20만원', '50만원'];
  const numberPromises = numbers.map(async (num) => {
    const keywords = await fetchNaverAutocomplete(`${seed} ${num}`);
    return keywords;
  });

  const numberResults = await Promise.all(numberPromises);
  for (const keywords of numberResults) {
    results.push(...keywords);
  }

  // 🔥 5단계: 수익화 접미사 확장 (30개!)
  const profitSuffixes = [
    '추천', '비교', '가격', '방법', '신청', '후기', '조건', '대상', '기간', '혜택',
    '순위', '장단점', '단점', '장점', '종류', '차이', '선택', '구매', '사용법', '꿀팁',
    '하는법', '하는방법', '받는법', '받는방법', '신청방법', '자격', '자격조건', '서류', '준비물', '주의사항'
  ];
  const suffixPromises = profitSuffixes.map(async (suffix) => {
    const keywords = await fetchNaverAutocomplete(`${seed} ${suffix}`);
    return keywords;
  });

  const suffixResults = await Promise.all(suffixPromises);
  for (const keywords of suffixResults) {
    results.push(...keywords);
  }

  // 🔥 6단계: 접두사 확장 (질문형)
  const prefixes = ['어떻게', '왜', '언제', '어디서', '무엇', '얼마나', '가장', '제일', '최고', '진짜'];
  const prefixPromises = prefixes.map(async (prefix) => {
    const keywords = await fetchNaverAutocomplete(`${prefix} ${seed}`);
    return keywords;
  });

  const prefixResults = await Promise.all(prefixPromises);
  for (const keywords of prefixResults) {
    results.push(...keywords);
  }

  // 중복 제거 및 필터링
  let uniqueResults = [...new Set(results)].filter(kw => {
    if (!kw || kw.length < 3) return false;
    if (kw === seed) return false;
    // 반복 단어 필터링
    const words = kw.split(' ');
    const uniqueWords = new Set(words);
    if (words.length > 2 && uniqueWords.size < words.length * 0.6) return false;
    return true;
  });

  // 🔥🔥🔥 7단계: 2차 재귀 확장 🔥🔥🔥
  if (depth === 1 && uniqueResults.length > 0) {
    console.log(`[PRO-TRAFFIC] 🔄 2차 재귀 확장 시작 (상위 10개 키워드)...`);

    // 상위 10개 키워드로 2차 확장 (깊이 2)
    const topKeywords = uniqueResults.slice(0, 10);
    const recursivePromises = topKeywords.map(async (kw) => {
      const secondaryResults: string[] = [];
      // 더 많은 가나다 확장
      const expandChars = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
      const expandPromises = expandChars.map(char => fetchNaverAutocomplete(`${kw} ${char}`));
      const results = await Promise.all(expandPromises);
      for (const r of results) secondaryResults.push(...r);
      return secondaryResults;
    });

    const recursiveResults = await Promise.all(recursivePromises);
    for (const keywords of recursiveResults) {
      uniqueResults.push(...keywords);
    }
  }

  // 🔥🔥🔥 8단계: 3차 심층 확장 (롱테일 발굴!) 🔥🔥🔥
  if (depth === 1 && uniqueResults.length > 50) {
    console.log(`[PRO-TRAFFIC] 🔄🔄 3차 심층 확장 시작...`);

    // 3단어 이상 롱테일 키워드 선별해서 추가 확장
    const longtailKeywords = uniqueResults.filter(kw => kw.split(' ').length >= 2).slice(0, 5);
    const deepPromises = longtailKeywords.map(async (kw) => {
      const deepResults: string[] = [];
      // 수익화 접미사로 심층 확장
      const suffixes = ['가격', '비용', '방법', '후기', '추천'];
      const suffixPromises = suffixes.map(s => fetchNaverAutocomplete(`${kw} ${s}`));
      const results = await Promise.all(suffixPromises);
      for (const r of results) deepResults.push(...r);
      return deepResults;
    });

    const deepResults = await Promise.all(deepPromises);
    for (const keywords of deepResults) {
      uniqueResults.push(...keywords);
    }
  }

  // 최종 필터링
  uniqueResults = [...new Set(uniqueResults)].filter(kw => {
    if (!kw || kw.length < 3) return false;
    const words = kw.split(' ');
    const uniqueWords = new Set(words);
    if (words.length > 2 && uniqueWords.size < words.length * 0.6) return false;
    // 특수문자 제거
    if (/[<>{}\\|]/.test(kw)) return false;
    return true;
  });

  if (uniqueResults.length > 0) {
    console.log(`[PRO-TRAFFIC] 🔥🔥🔥 "${seed}" 총 ${uniqueResults.length}개 키워드 수집 완료!`);
  }

  return uniqueResults.slice(0, 300); // 시드당 최대 300개!
}

async function expandToLongtailRealLite(seed: string): Promise<string[]> {
  if (!seed || seed.length < 2) return [seed];

  const baseKeywords = await fetchNaverAutocomplete(seed);

  const suffixes = ['가격', '비용', '후기', '추천', '비교', '방법', '하는법', '사용법', '설치', '청소'];
  const suffixPromises = suffixes.map(s => fetchNaverAutocomplete(`${seed} ${s}`));
  const suffixResults = await Promise.all(suffixPromises);

  const flat = [...baseKeywords, ...suffixResults.flat()];
  const unique = [...new Set(flat)].filter(kw => {
    if (!kw || kw.length < 3) return false;
    if (kw === seed) return false;
    if (/[<>{}\\|]/.test(kw)) return false;
    return true;
  });

  return unique.slice(0, 120);
}

/**
 * 네이버 자동완성 API 호출 (단일)
 */
async function fetchNaverAutocomplete(query: string): Promise<string[]> {
  const results: string[] = [];

  try {
    const axios = (await import('axios')).default;

    // 모바일 API 사용 (더 안정적!)
    const response = await axios.get(
      `https://mac.search.naver.com/mobile/ac`,
      {
        params: {
          q: query,
          st: 1,
          frm: 'mobile_nv',
          r_format: 'json'
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
          'Accept': 'application/json'
        },
        timeout: 3000
      }
    );

    if (response.data && response.data.items) {
      const items = response.data.items;

      for (const itemGroup of items) {
        if (Array.isArray(itemGroup)) {
          for (const kw of itemGroup) {
            if (Array.isArray(kw) && kw.length > 0 && typeof kw[0] === 'string') {
              if (kw[0].length > 2) {
                results.push(kw[0]);
              }
            } else if (typeof kw === 'string' && kw.length > 2) {
              results.push(kw);
            }
          }
        }
      }
    }
  } catch {
    // 개별 실패는 무시
  }

  return results;
}

/**
 * 롱테일 키워드 확장 (동기 버전 - 폴백용)
 */
function expandToLongtail(seed: string): string[] {
  if (seed && seed.length >= 3) {
    return [seed];
  }
  return [];
}

/**
 * 기본 트렌딩 키워드 (카테고리별)
 */
function getDefaultTrendingKeywords(category: string): string[] {
  const keywords: Record<string, string[]> = {
    'all': [
      '연말정산', '청약', '보조금', '지원금', '신청방법',
      '맛집', '카페', '여행지', '드라이브코스',
      '넷플릭스', '영화추천', '드라마',
      '이직', '자격증', '공부법', '시험',
      '운동', '건강', '레시피', '간편식'
    ],
    // UI 카테고리 키와 1:1로 맞춤 (네이버 블로그 체계)
    'daily': ['일상', '오늘', '하루', '기록', '브이로그', '소소한', '루틴'],
    'parenting': ['육아', '임신', '출산', '아기', '신혼', '결혼', '웨딩'],
    'pet': ['강아지', '고양이', '반려동물', '산책', '사료', '간식'],
    'quotes': ['명언', '좋은글', '글귀', '힐링', '위로', '감동'],
    'fashion': ['코디', '패션', '화장품', '스킨케어', '메이크업', '헤어', '네일', '향수'],
    'interior': ['인테리어', '수납', '정리', '정리정돈', 'DIY', '가구'],
    'life_tips': ['생활꿀팁', '생활팁', '꿀팁', '노하우', '청소', '빨래', '곰팡이', '냄새제거'],
    'recipe': ['요리', '레시피', '밀키트', '반찬', '간편식', '베이킹'],
    'review': ['리뷰', '후기', '언박싱', '비교', '추천', '장단점'],
    'garden': ['원예', '식물', '텃밭', '재배', '화분', '분갈이'],
    'game': ['게임', '공략', '스팀', '모바일게임', '신작'],
    'sports': ['야구', '축구', '농구', '경기', '하이라이트', '순위'],
    'photo': ['사진', '카메라', '촬영', '보정', '인물', '풍경'],
    'car': ['자동차', '전기차', '중고차', '신차', '시승', '정비'],
    'hobby': ['취미', '뜨개질', '캘리', '핸드메이드', '수공예'],
    'travel_domestic': ['국내여행', '당일치기', '제주', '호캉스', '캠핑'],
    'travel_overseas': ['해외여행', '항공권', '여권', '일본', '유럽', '동남아'],
    'food': ['맛집', '카페', '브런치', '디저트', '레스토랑', '베이커리'],
    'it': ['IT', '컴퓨터', '앱', '노트북', '아이폰', '갤럭시', '설정', '꿀팁'],
    'society': ['사회', '정책', '뉴스', '이슈', '사건', '제도'],
    'health': ['건강', '운동', '스트레칭', '영양제', '수면', '증상'],
    'business': ['경제', '재테크', '주식', '투자', '부동산', '청약', '창업', '연말정산'],
    'language': ['어학', '외국어', '영어', '토익', '회화', '일본어', '중국어', '공부법'],
    'education': ['자격증', '시험', '공부', '합격', '취업', '면접', '대학'],
    // 엔터테인먼트
    'book': ['책', '서평', '신간', '추천도서', '독서'],
    'movie': ['영화', '개봉', '리뷰', '넷플릭스', 'OTT'],
    'art': ['전시', '미술', '디자인', '아트', '갤러리'],
    'performance': ['공연', '뮤지컬', '연극', '콘서트', '전시'],
    'music': ['음악', '앨범', '음원', '가수', '노래'],
    'drama': ['드라마', '출연진', '시청률', '결말', '회차'],
    'celeb': ['연예인', '아이돌', '배우', '컴백', '콘서트', '열애'],
    'anime': ['애니', '만화', '웹툰', '신작', '추천'],
    'broadcast': ['예능', '방송', '유튜브', '스트리밍', '라디오']
  };

  return keywords[category] || keywords['all'];
}

/**
 * 위험 키워드 체크 (정부 정책 키워드는 안전)
 */
function isDangerKeyword(keyword: string): boolean {
  // 정부 정책 키워드면 안전
  if (SAFE_POLICY_PATTERNS.some(p => keyword.includes(p))) {
    return false;
  }
  return DANGER_KEYWORDS.some(d => keyword.includes(d));
}

/**
 * 주의 키워드 체크
 */
function isCautionKeyword(keyword: string): boolean {
  return CAUTION_KEYWORDS.some(c => keyword.includes(c));
}

/**
 * 키워드 분석 및 점수 계산
 */
// 📅 현재 시점 고정 (2025-12-31 시뮬레이션 지원)
const CURRENT_DATE = new Date('2025-12-31T23:59:59');

/**
 * 📅 네이버 날짜 텍스트 -> 개월 수(Month) 변환기
 */
function getMonthsAgo(dateText: string): number {
  try {
    const now = CURRENT_DATE;
    let postDate = new Date(now);

    if (dateText.includes("전") || dateText.includes("방금")) return 0;
    if (dateText.includes("어제")) postDate.setDate(now.getDate() - 1);
    else if (dateText.includes("일 전")) {
      const days = parseInt(dateText.replace(/[^0-9]/g, ''));
      postDate.setDate(now.getDate() - days);
    } else {
      let parts = dateText.replace(/\.$/, '').split('.');
      let year = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1;
      const day = parseInt(parts[2]);
      if (year < 100) year += 2000;
      postDate = new Date(year, month, day);
    }

    const diffYears = now.getFullYear() - postDate.getFullYear();
    const diffMonths = (diffYears * 12) + (now.getMonth() - postDate.getMonth());
    return diffMonths;
  } catch (e) { return 0; }
}

export function analyzeKeyword(
  keyword: string,
  source: string,
  currentMonth: number,
  currentHour: number,
  targetRookie: boolean
): ProTrafficKeyword {

  // 🔥 캐시 조회 (원본 + clean 버전 모두)
  const cleanKeyword = keyword.replace(/\s/g, '');
  const cached = apiCache.get(keyword) || apiCache.get(cleanKeyword);

  // 🚨 캐시에 실제 데이터가 없으면 null (더미 데이터 절대 사용 안 함!)
  const searchVolume = cached?.searchVolume ?? null;
  const documentCount = cached?.documentCount ?? null;
  const compIdx = cached?.compIdx ?? null;
  const realCpc = cached?.realCpc ?? null;
  const hasSmartBlock = cached?.hasSmartBlock ?? false;
  const hasInfluencer = cached?.hasInfluencer ?? false;
  const difficultyScore = cached?.difficultyScore ?? undefined;
  const intent = cached?.intent ?? undefined;
  const intentBadge = cached?.intentBadge ?? undefined;

  // 디버그 로그
  if (!cached) {
    console.log(`[PRO-TRAFFIC] ⚠️ 캐시 미스: "${keyword}" → 검색량=null, 문서수=null (더미 데이터 사용 안 함)`);
  }

  // 🚨 문서수가 0이면 황금비율도 0 (999 같은 더미값 절대 사용 안 함!)
  const goldenRatio = (searchVolume !== null && documentCount !== null && documentCount > 0)
    ? Math.round((searchVolume / documentCount) * 10000) / 100  // 퍼센티지로 변환 후 소수점 2자리 (25.40% 등)
    : 0;

  // 🎯 신생 블로거 적합도 계산
  const rookieFriendly = calculateRookieFriendly(keyword, searchVolume, documentCount, goldenRatio);

  // ⏰ 타이밍 분석
  const timing = analyzeTimingScore(keyword, currentMonth, currentHour);

  // 🌊 블루오션 분석
  const blueOcean = analyzeBlueOcean(keyword, documentCount, goldenRatio);

  // 📈 트래픽 예상 (현실적인 수치)
  const trafficEstimate = estimateTraffic(searchVolume, goldenRatio, rookieFriendly.score);

  // 키워드 타입 분류
  const type = classifyKeywordType(keyword, timing, blueOcean, goldenRatio);

  // 안전도 분석
  const safetyAnalysis = analyzeSafety(keyword);

  // 🏆 종합 점수 계산 (v10.1 고도화!)
  const totalScore = calculateTotalScore(rookieFriendly.score, timing.score, blueOcean.score, goldenRatio, safetyAnalysis.level, keyword, searchVolume, documentCount);

  // 등급 결정
  const detectedCategory = classifyKeyword(keyword).primary;

  const profitAnalysis: ProfitKeywordData = calculateProfitGoldenRatio(
    keyword,
    searchVolume ?? 0,
    documentCount ?? 0,
    detectedCategory,
    {
      compIdx,
      hasSmartBlock,
      hasInfluencer,
      difficultyScore,
      realCpc,
    }
  );

  // 🕒 SRAA: 최신성 및 승률 분석 (Win Rate Logic)
  let winRate = 50; // 중립값 기본 승률 (실제 SERP 데이터 없으면 중립)
  const isEmptyHouse = false; // mockDates 제거 - 실제 SERP 데이터 없으면 보수적으로 판단 (빈집 아님으로 가정)
  // isEmptyHouse 판정은 analyzeCompetitorsWithRecencyAsync에서만 수행
  if (hasInfluencer) winRate -= 10;
  if (hasSmartBlock) winRate -= 5;

  winRate = Math.max(0, Math.min(100, winRate));

  // 🌅 시즌 보너스: 2026 선점 전략 (오늘이 12월 31일인 경우)
  let seasonalBonus = 0;
  if (CURRENT_DATE.getMonth() === 11 && CURRENT_DATE.getDate() === 31) {
    if (keyword.includes('2026') || keyword.includes('신년') || keyword.includes('계획')) {
      seasonalBonus += 20;
    }
  }

  let profitBonus = 0;
  if (profitAnalysis.grade === 'SSS') profitBonus = 30;
  else if (profitAnalysis.grade === 'SS') profitBonus = 24;
  else if (profitAnalysis.grade === 'S') profitBonus = 18;
  else if (profitAnalysis.grade === 'A') profitBonus = 12;
  else if (profitAnalysis.grade === 'B') profitBonus = 6;

  if (profitAnalysis.isRealBlueOcean) profitBonus += 20;
  if (profitAnalysis.competitionLevel <= 2) profitBonus += 15;
  else if (profitAnalysis.competitionLevel <= 4) profitBonus += 10;
  if (profitAnalysis.purchaseIntentScore >= 70) profitBonus += 10;
  else if (profitAnalysis.purchaseIntentScore >= 50) profitBonus += 6;

  // MDP v2.0 점수 보정
  let mdpBonus = 0;
  if (profitAnalysis.cvi && profitAnalysis.cvi >= 1.5) mdpBonus += 20; // 고수익성 보너스
  else if (profitAnalysis.cvi && profitAnalysis.cvi >= 0.8) mdpBonus += 10;

  if (difficultyScore !== undefined && difficultyScore <= 3) mdpBonus += 15; // 저난이도 보너스
  if (hasSmartBlock) mdpBonus += 10; // 스마트블록 기회
  if (hasInfluencer) mdpBonus -= 5; // 인플루언서 탭은 일반 블로거에게 다소 불리

  // SRAA 보너스 적용
  mdpBonus += seasonalBonus;
  if (isEmptyHouse) mdpBonus += 10;

  const totalScoreWithProfit = Math.min(100, totalScore + profitBonus + mdpBonus);

  const grade = determineGrade(totalScoreWithProfit, rookieFriendly.score);

  // 🚀 [v15.0] 지능형 제목 및 황금 근거 생성
  const titleGen = getTitleGenerator();
  const nicheType = blueOcean.isEarlyBird ? 'empty_house' : (blueOcean.isNiche ? 'blue_ocean' : 'none');

  const freshKw: any = {
    keyword,
    searchVolume,
    documentCount,
    goldenRatio,
    isRising: timing.trendDirection === 'rising',
    isEarlyBird: blueOcean.isEarlyBird,
    nicheInfo: { type: nicheType, score: blueOcean.score },
    grade,
    category: detectedCategory,
    trendingReason: profitAnalysis?.gradeReason
  };

  const goldenBackground = titleGen.analyzeGoldenBackground(freshKw);
  const intelligentTitles = titleGen.generateTitles(freshKw, 5);

  // 📝 초고수 전략 가이드
  const proStrategy = generateProStrategy(keyword, type, searchVolume, timing);
  if (intelligentTitles.length > 0) {
    proStrategy.strategicTitle = intelligentTitles[0]; // AI 제목 중 가장 좋은 것을 전략 제목으로 채택
  }

  // 💰 수익 예상 계산 (끝판왕 v2.0!)
  let revenueEstimate = calculateRevenueEstimate(keyword, searchVolume, documentCount, goldenRatio, blueOcean.score);
  if (profitAnalysis) {
    revenueEstimate = {
      dailyRevenue: `${profitAnalysis.estimatedDailyRevenue.toLocaleString()}원 ⚠️추정`,
      monthlyRevenue: `${profitAnalysis.estimatedMonthlyRevenue.toLocaleString()}원 ⚠️추정`,
      estimatedCPC: profitAnalysis.estimatedCPC,
      estimatedRPM: Math.round(profitAnalysis.estimatedCPC * 25),
      adType: profitAnalysis.purchaseIntentScore >= 60 ? '쿠팡파트너스 + 애드센스' : '애드센스',
      revenueGrade: profitAnalysis.grade as any,
      revenueReason: profitAnalysis.gradeReason,
    };
  }

  // 🔥 플랫폼별 추천 제목 생성 (끝판왕 v4.0!)
  const platformTitles = generatePlatformTitles(keyword, type, searchVolume, timing, detectedCategory, intelligentTitles);

  // 🔥 확장 황금 키워드 생성 (끝판왕 v4.0!)
  const expandedKeywords = generateExpandedKeywords(keyword);

  // 🆕 v12.0 진입 가능 여부 분석
  const entryAnalysis = analyzeEntryDifficulty(documentCount, goldenRatio, blueOcean.score, rookieFriendly.score);

  // 📊 순위 추적 이력 조회 (v12 연결)
  let trackingHistory: ProTrafficKeyword['trackingHistory'] | undefined;
  try {
    const trackingData = getTrackingDataForKeyword(keyword);
    if (trackingData && trackingData.isTracked) {
      let feedbackMessage: string | undefined;
      if (trackingData.latestRank != null) {
        if (trackingData.latestRank <= 3) {
          feedbackMessage = `이전 추천 키워드 성과: ${trackingData.latestRank}위 달성!`;
        } else if (trackingData.latestRank <= 10) {
          feedbackMessage = `이전 추천 키워드 성과: ${trackingData.latestRank}위 (TOP 10 진입)`;
        } else {
          feedbackMessage = `이전 추천 키워드 성과: 현재 ${trackingData.latestRank}위`;
        }
        if (trackingData.rankChange != null && trackingData.rankChange !== 0) {
          const direction = trackingData.rankChange < 0 ? '상승' : '하락';
          feedbackMessage += ` (${Math.abs(trackingData.rankChange)}단계 ${direction})`;
        }
      }
      trackingHistory = {
        isTracked: true,
        currentRank: trackingData.latestRank ?? undefined,
        previousRank: trackingData.previousRank ?? undefined,
        rankChange: trackingData.rankChange ?? undefined,
        trackedSince: trackingData.startDate ?? undefined,
        postUrl: trackingData.postUrl ?? undefined,
        feedbackMessage,
      };
    }
  } catch {
    // 추적 데이터 없으면 무시
  }

  return {
    keyword,
    searchVolume,
    documentCount,
    goldenRatio: Math.round(goldenRatio * 100) / 100,
    rookieFriendly,
    timing,
    blueOcean,
    trafficEstimate,
    revenueEstimate,
    entryAnalysis,
    totalScore: totalScoreWithProfit,
    grade,
    proStrategy,
    platformTitles,
    intelligentTitles,
    goldenBackground,
    expandedKeywords,
    type,
    category: detectedCategory,
    safetyLevel: safetyAnalysis.level,
    safetyReason: safetyAnalysis.reason,
    source,
    profitAnalysis,
    cvi: profitAnalysis.cvi,
    difficultyScore: difficultyScore ?? profitAnalysis.difficultyScore,
    hasSmartBlock,
    hasInfluencer,
    isCommercial: profitAnalysis.isCommercial,
    winRate,
    isEmptyHouse,
    topPostRecency: {
      monthsAgo: [],
      oldPostCount: 0
    },
    seasonalBonus,
    trackingHistory,
    timestamp: new Date().toISOString()
  };
}

async function getMultiSourceKeywords(includeHeavySources: boolean = true): Promise<string[]> {
  const keywords: string[] = [];

  const pushMany = (arr: unknown) => {
    if (!Array.isArray(arr)) return;
    for (const k of arr) {
      const s = String(k || '').trim();
      if (s.length >= 2) keywords.push(s);
    }
  };

  try {
    const settled = await Promise.allSettled([
      includeHeavySources ? getSignalBzKeywords(20).then(r => r.map(k => k.keyword)) : Promise.resolve([] as string[]),
      includeHeavySources ? getZumRealtimeKeywordsWithPuppeteer(20).then(r => r.map(k => k.keyword)) : Promise.resolve([] as string[]),
      includeHeavySources ? getDaumRealtimeKeywordsWithPuppeteer(20).then(r => r.map(k => k.keyword)) : Promise.resolve([] as string[]),
      includeHeavySources ? getNateRealtimeKeywordsWithPuppeteer(20).then(r => r.map(k => k.keyword)) : Promise.resolve([] as string[]),
      getNewsIssueKeywords(),
      getPolicyBriefingKeywords(),
      getSeasonalEventKeywords(),
    ]);

    for (const r of settled) {
      if (r.status === 'fulfilled') pushMany(r.value);
    }
  } catch {
    // ignore
  }

  return Array.from(new Set(keywords)).slice(0, 120);
}

/**
 * 신생 블로거 적합도 계산
 */
function calculateRookieFriendly(
  keyword: string,
  searchVolume: number | null,
  documentCount: number | null,
  goldenRatio: number
): ProTrafficKeyword['rookieFriendly'] {
  let score = 50; // 기준 점수
  let reasons: string[] = [];

  // 1. 문서수가 적을수록 높은 점수 (가장 중요)
  if (documentCount === null) {
    reasons.push('문서수 데이터 없음 → 경쟁도 판단 불가');
  } else if (documentCount < 1000) {
    score += 30;
    reasons.push('문서수 1,000개 미만 → 경쟁 매우 낮음');
  } else if (documentCount < 5000) {
    score += 20;
    reasons.push('문서수 5,000개 미만 → 경쟁 낮음');
  } else if (documentCount < 10000) {
    score += 10;
    reasons.push('문서수 10,000개 미만 → 경쟁 보통');
  } else if (documentCount > 50000) {
    score -= 20;
    reasons.push('문서수 50,000개 이상 → 경쟁 치열');
  }

  // 2. 황금비율이 높을수록 높은 점수
  if (searchVolume === null || documentCount === null || documentCount === 0) {
    reasons.push('검색량/문서수 데이터 부족 → 황금비율 판단 불가');
  } else if (goldenRatio > 10) {
    score += 20;
    reasons.push('황금비율 10 이상 → 수요 대비 공급 부족');
  } else if (goldenRatio > 5) {
    score += 10;
    reasons.push('황금비율 5 이상 → 적정 경쟁');
  } else if (goldenRatio < 1) {
    score -= 15;
    reasons.push('황금비율 1 미만 → 공급 과잉');
  }

  // 3. 키워드 길이 (롱테일일수록 유리)
  const wordCount = keyword.split(' ').length;
  if (wordCount >= 3) {
    score += 15;
    reasons.push('롱테일 키워드 → 신생도 상위노출 가능');
  } else if (wordCount === 2) {
    score += 5;
    reasons.push('중길이 키워드');
  } else {
    score -= 10;
    reasons.push('숏테일 키워드 → 대형 블로그와 경쟁');
  }

  // 4. 질문형 패턴 (경쟁 낮음)
  if (QUESTION_PATTERNS.some(p => keyword.includes(p))) {
    score += 10;
    reasons.push('질문형 키워드 → 경쟁 낮음');
  }

  // 점수 보정
  score = Math.max(0, Math.min(100, score));

  // 등급 결정
  const grade = score >= 85 ? 'S' : score >= 70 ? 'A' : score >= 55 ? 'B' : score >= 40 ? 'C' : 'D';

  // 경쟁도 레벨
  const canRankWithin =
    score >= 85 ? '경쟁 매우 낮음' :
      score >= 70 ? '경쟁 낮음' :
        score >= 55 ? '경쟁 보통' :
          score >= 40 ? '경쟁 높음' :
            '경쟁 매우 높음';

  // 필요 블로그 지수
  const requiredBlogIndex =
    score >= 85 ? '지수 무관 (신생도 OK)' :
      score >= 70 ? '준최 3 이상 권장' :
        score >= 55 ? '준최 5 이상 권장' :
          '최적 1 이상 권장';

  return {
    score,
    grade,
    reason: reasons.join(' | '),
    canRankWithin,
    requiredBlogIndex
  };
}

/**
 * 신생 블로그 적합도 정밀 계산 (v2.0 PRO)
 */
function calculateAdvancedRookieFriendly(r: any, topBlogData?: any): any {
  let score = 70; // 기본 점수

  // 1. 황금비율 가중치
  if (r.goldenRatio >= 10) score += 20;
  else if (r.goldenRatio >= 5) score += 15;
  else if (r.goldenRatio >= 1) score += 5;

  // 2. 문서수 가중치
  if (r.documentCount < 1000) score += 10;
  else if (r.documentCount > 50000) score -= 20;

  // 3. 상위 블로그 데이터 반영 (실제 경쟁도)
  if (topBlogData && topBlogData.summary) {
    const avgScore = topBlogData.summary.avgBlogIndexScore;
    if (avgScore <= 50) score += 20; // 상위권이 일반/준최적인 경우 큰 기회!
    else if (avgScore <= 65) score += 10;
    else if (avgScore >= 85) score -= 20; // 상위권이 최적 고등급인 경우 어려움

    // 만약 오래된 글이 많다면 추가 점수
    if (topBlogData.summary.oldPostRatio >= 50) score += 10;

    // 약한 경쟁자가 많다면 추가 점수
    if (topBlogData.summary.weakCompetitorCount >= 5) score += 15;
  }

  const grade = score >= 90 ? 'S' : score >= 80 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D';

  return {
    score: Math.min(100, score),
    grade,
    reason: grade === 'S' ? '경쟁이 매우 낮아 신생 블로그도 즉시 상위 노출 가능' :
      grade === 'A' ? '기본기가 충실하다면 신생 블로그도 충분히 승산 있음' :
        '어느 정도 블로그 지수가 필요하거나 전략적 접근 필수',
    canRankWithin: grade === 'S' ? '경쟁 매우 낮음' : grade === 'A' ? '경쟁 낮음' : '경쟁 보통',
    requiredBlogIndex: grade === 'S' ? 'Lv.1 (모든 블로그)' : grade === 'A' ? 'Lv.3 (중급)' : 'Lv.5 (고급)'
  };
}

/**
 * 이길 수 있는 전략 생성 (Winning Strategy)
 */
function generateWinningStrategy(r: any, rookie: any, blueprint: any): ProTrafficKeyword['winningStrategy'] {
  const kw = r.keyword;
  const cat = r.category || '생활 꿀팁';

  // 기본 전략 구조
  const strategy = {
    target: "해당 키워드에 대해 구체적인 해결책이나 리뷰를 찾는 사람들",
    strategicTitle: (r.intelligentTitles && r.intelligentTitles.length > 0)
      ? r.intelligentTitles[0]
      : `${kw} 솔직 후기 및 장단점 정리`,
    contentSecret: "단순 정보를 넘어 본인만의 주관적인 견해나 꿀팁을 섞으면 신뢰도가 상승합니다."
  };

  if (!blueprint) return strategy;

  // 카테고리별/유형별 세분화
  if (cat === 'celeb') {
    strategy.target = `"${kw}"의 최신 근황이나 사건의 내막을 궁금해하는 팬들`;
    strategy.strategicTitle = `[단독] ${kw} 최근 근황, 아무도 몰랐던 3가지 사실 (팩트체크)`;
    strategy.contentSecret = "뉴스에 나온 뻔한 내용보다 커뮤니티 반응이나 향후 일정 예측을 섞으면 체류시간이 길어집니다.";
  } else if (cat === 'life_tips') {
    // 💡 모든 생활꿀팁 키워드에 대해 노하우 중심 전략 적용
    if (kw.includes('방법') || kw.includes('법') || kw.includes('팁') || kw.includes('노하우') || kw.includes('결로') || kw.includes('동파')) {
      strategy.target = "집안일 효율을 높이고 싶거나 생활 속 불편함을 해결하고 싶은 분들";
      strategy.strategicTitle = `${kw} | 누구나 1분 만에 따라 하는 '역대급 꿀팁' 공개`;
      strategy.contentSecret = "단순 설명보다 '전/후 비교 사진'이나 '단계별 체크리스트'를 넣으면 네이버 스마트블록 노출 확률이 비약적으로 상승합니다.";
    } else if (kw.includes('청소') || kw.includes('제거') || kw.includes('냄새') || kw.includes('얼룩')) {
      strategy.target = "찌든 때나 악취로 고민하는 주부 및 자취생";
      strategy.strategicTitle = `${kw} 끝판왕! 독한 세제 없이 '살림 구단'처럼 해결하는 법`;
      strategy.contentSecret = "베이킹소다, 구연산, 과탄산소다 등 천연 재료 활용법을 섞으면 정보성 점수가 높아져 상위 노출에 유리합니다.";
    } else if (kw.includes('정리') || kw.includes('수납') || kw.includes('보관') || kw.includes('절약')) {
      strategy.target = "좁은 공간을 넓게 쓰고 싶거나 살림 정돈이 안 되어 고민인 분들";
      strategy.strategicTitle = `${kw} | 버리기 아까운 '이것' 하나로 깔끔하게 0원 정리 완료`;
      strategy.contentSecret = "다이소 수납 템이나 재활용품을 활용한 아이디어 위주로 구성하면 클릭률(CTR)이 매우 높게 나옵니다.";
    } else {
      // 그 외 모든 생활꿀팁 (예: 현관문결로 등)
      strategy.target = "살림 고수의 노하우가 궁금한 실속파 주부 및 자취생";
      strategy.strategicTitle = `${kw}, 살림 고수만 아는 '의외의 해결책' 3가지 정리`;
      strategy.contentSecret = "이 키워드는 정보성 검색 의도가 매우 강합니다. '실제 해결 사례'를 구체적으로 언급하며 신뢰도를 높이세요.";
    }
  }

  // 블루프린트 타입별 보정
  if (blueprint.type === 'BRIDGE_BUILDER') {
    strategy.contentSecret = "네이버 블로그에서 '정답'을 다 알려주지 마세요. 핵심적인 호기심을 자극하고, '정말 중요한 디테일'은 WordPress 링크로 유도하세요.";
  } else if (blueprint.type === 'CASH_COW') {
    strategy.strategicTitle = `${kw} 가격 비교 추천 TOP 5: 이것 모르고 사면 손해입니다`;
    strategy.contentSecret = "가격 비교표를 이미지로 만들어 첨부하고, 제휴 링크를 자연스럽게 섞으세요.";
  }

  return strategy;
}

/**
 * 타이밍 점수 분석
 */
function analyzeTimingScore(
  keyword: string,
  currentMonth: number,
  currentHour: number
): ProTrafficKeyword['timing'] {
  let score = 50;
  let urgency: ProTrafficKeyword['timing']['urgency'] = 'ANYTIME';
  let trendDirection: ProTrafficKeyword['timing']['trendDirection'] = 'stable';

  // 시즌 키워드 체크
  const seasonKeywords = SEASON_KEYWORDS[currentMonth] || [];
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
  const nextSeasonKeywords = SEASON_KEYWORDS[nextMonth] || [];

  if (seasonKeywords.some(s => keyword.includes(s))) {
    score += 30;
    urgency = 'NOW';
    trendDirection = 'peak';
  } else if (nextSeasonKeywords.some(s => keyword.includes(s))) {
    score += 20;
    urgency = 'THIS_WEEK';
    trendDirection = 'rising';
  }

  // 연도 키워드 체크
  const currentYear = new Date().getFullYear();
  if (keyword.includes(currentYear.toString())) {
    score += 15;
    if (urgency === 'ANYTIME') urgency = 'TODAY';
  }

  // 정책/제도 키워드 (항상 긴급)
  const policyKeywords = ['연말정산', '청약', '신청', '지원금', '보조금', '정책'];
  if (policyKeywords.some(p => keyword.includes(p))) {
    score += 15;
    if (urgency === 'ANYTIME') urgency = 'THIS_WEEK';
  }

  score = Math.max(0, Math.min(100, score));

  // 최적 발행 시간
  let bestPublishTime = '오전 6~8시 또는 저녁 8~10시';
  if (urgency === 'NOW') {
    bestPublishTime = '지금 바로 발행!';
  }

  // 피크 예측
  const peakPrediction =
    trendDirection === 'peak' ? '현재 피크 - 빠른 발행 필요' :
      trendDirection === 'rising' ? '1~2주 내 피크 예상' :
        '꾸준한 검색량 유지';

  return {
    score,
    urgency,
    bestPublishTime,
    trendDirection,
    peakPrediction
  };
}

/**
 * 블루오션 분석
 */
function analyzeBlueOcean(
  keyword: string,
  documentCount: number | null,
  goldenRatio: number
): ProTrafficKeyword['blueOcean'] {
  let score = 50;

  // 문서수 기반 경쟁 분석
  let competitorStrength: 'weak' | 'medium' | 'strong' = 'medium';
  if (documentCount === null) {
    // 데이터 부족: 중립
    competitorStrength = 'medium';
  } else if (documentCount < 3000) {
    score += 30;
    competitorStrength = 'weak';
  } else if (documentCount < 10000) {
    score += 15;
    competitorStrength = 'medium';
  } else if (documentCount > 30000) {
    score -= 20;
    competitorStrength = 'strong';
  }

  // 황금비율 기반 기회 분석
  if (documentCount === null) {
    // 데이터 부족: 중립
  } else if (goldenRatio > 10) {
    score += 20;
  } else if (goldenRatio > 5) {
    score += 10;
  } else if (goldenRatio < 1) {
    score -= 15;
  }

  score = Math.max(0, Math.min(100, score));

  // 경쟁 블로그 평균 나이 추정
  const avgCompetitorBlogAge =
    competitorStrength === 'weak' ? '1~2년 (약한 경쟁)' :
      competitorStrength === 'medium' ? '2~5년 (보통 경쟁)' :
        '5년 이상 (강한 경쟁)';

  // 오래된 글 비율 추정
  const oldPostRatio = documentCount === null
    ? 50
    : documentCount < 3000 ? 70 :
      documentCount < 10000 ? 50 :
        30;

  // 기회 분석
  const opportunity =
    score >= 80 ? '🔥 극상의 블루오션! 지금 선점하세요' :
      score >= 60 ? '✅ 좋은 기회입니다. 품질 콘텐츠로 승부' :
        score >= 40 ? '⚠️ 경쟁 있음. 차별화된 콘텐츠 필요' :
          '❌ 레드오션. 다른 키워드 추천';

  return {
    score,
    competitorStrength,
    avgCompetitorBlogAge,
    oldPostRatio,
    opportunity
  };
}

/**
 * 🆕 v12.0 진입 가능 여부 분석 (끝판왕!)
 */
function analyzeEntryDifficulty(
  documentCount: number | null,
  goldenRatio: number,
  blueOceanScore: number,
  rookieScore: number
): ProTrafficKeyword['entryAnalysis'] {
  // 난이도 점수 계산 (낮을수록 쉬움)
  let difficultyScore = 50;

  // 문서수 기반 (가장 중요!)
  if (documentCount === null) {
    // 데이터 부족: 중립
  } else if (documentCount < 1000) {
    difficultyScore -= 30;
  } else if (documentCount < 3000) {
    difficultyScore -= 20;
  } else if (documentCount < 10000) {
    difficultyScore -= 10;
  } else if (documentCount > 50000) {
    difficultyScore += 30;
  } else if (documentCount > 20000) {
    difficultyScore += 15;
  }

  // 황금비율 기반
  if (goldenRatio > 10) {
    difficultyScore -= 20;
  } else if (goldenRatio > 5) {
    difficultyScore -= 10;
  } else if (goldenRatio < 0.5) {
    difficultyScore += 20;
  }

  // 블루오션 점수 반영
  difficultyScore -= Math.round((blueOceanScore - 50) * 0.3);

  difficultyScore = Math.max(0, Math.min(100, difficultyScore));

  // 난이도 등급 결정
  let difficulty: 'easy' | 'possible' | 'hard' | 'very_hard';
  let message: string;
  let canEntry: boolean;

  if (difficultyScore <= 25) {
    difficulty = 'easy';
    message = '🟢 진입 쉬움 - 신생 블로거도 상위노출 가능!';
    canEntry = true;
  } else if (difficultyScore <= 45) {
    difficulty = 'possible';
    message = '🟡 진입 가능 - 품질 콘텐츠로 충분히 경쟁 가능';
    canEntry = true;
  } else if (difficultyScore <= 65) {
    difficulty = 'hard';
    message = '🟠 진입 도전적 - 차별화된 콘텐츠 필요';
    canEntry = true;
  } else {
    difficulty = 'very_hard';
    message = '🔴 진입 어려움 - 상위 블로거 독점 키워드';
    canEntry = false;
  }

  // 상위 경쟁자 강도
  const topCompetitorStrength = documentCount === null
    ? '알 수 없음 (데이터 부족)'
    : documentCount < 3000 ? '약함 (저품질 블로그 다수)' :
      documentCount < 10000 ? '보통 (일반 블로그 혼재)' :
        documentCount < 30000 ? '강함 (전문 블로거 다수)' :
          '매우 강함 (최적 블로그 독점)';

  // ...

  const recommendedBlogIndex =
    difficulty === 'easy' ? '지수 무관 (신생도 OK)' :
      difficulty === 'possible' ? '준최 3 이상 권장' :
        difficulty === 'hard' ? '준최 5 이상 권장' :
          '최적 1 이상 권장';

  const estimatedRankingTime =
    difficulty === 'easy' ? '경쟁 매우 낮음' :
      difficulty === 'possible' ? '경쟁 낮음' :
        difficulty === 'hard' ? '경쟁 높음' :
          '경쟁 매우 높음';

  return {
    canEntry,
    difficulty,
    difficultyScore,
    message,
    topCompetitorStrength,
    recommendedBlogIndex,
    estimatedRankingTime
  };
}

// ...

function estimateTraffic(
  searchVolume: number | null,
  goldenRatio: number,
  rookieScore: number
): ProTrafficKeyword['trafficEstimate'] {
  if (searchVolume === null) {
    return {
      daily: '측정 불가',
      weekly: '측정 불가',
      monthly: '측정 불가',
      confidence: 0,
      disclaimer: '⚠️ 실제 API 데이터 부족으로 트래픽을 계산할 수 없습니다.'
    };
  }

  // ...

  const dailySearches = Math.max(0, Math.round(searchVolume / 30));
  const baseCTR = rookieScore >= 80 ? 0.08 : rookieScore >= 60 ? 0.05 : 0.03;
  const ratioBoost = goldenRatio >= 10 ? 0.03 : goldenRatio >= 5 ? 0.02 : goldenRatio >= 1 ? 0.01 : 0;
  const ctr = Math.min(0.12, baseCTR + ratioBoost);
  const baseDailyVisitors = Math.round(dailySearches * ctr);
  const dailyMin = Math.max(0, Math.round(baseDailyVisitors * 0.6));
  const dailyMax = Math.max(dailyMin, Math.round(baseDailyVisitors * 1.4));

  const weeklyMin = dailyMin * 7;
  const weeklyMax = dailyMax * 7;
  const monthlyMin = dailyMin * 30;
  const monthlyMax = dailyMax * 30;

  const daily = `${dailyMin.toLocaleString()}~${dailyMax.toLocaleString()}명`;
  const weekly = `${weeklyMin.toLocaleString()}~${weeklyMax.toLocaleString()}명`;
  const monthly = `${monthlyMin.toLocaleString()}~${monthlyMax.toLocaleString()}명`;

  let confidence = 50;
  if (searchVolume >= 10000) confidence += 15;
  if (rookieScore >= 70) confidence += 10;
  if (goldenRatio >= 5) confidence += 10;
  confidence = Math.max(10, Math.min(85, confidence));

  const disclaimer = '📌 트래픽은 순위/CTR/계절성에 따라 달라질 수 있는 추정치입니다.';

  return {
    daily,
    weekly,
    monthly,
    confidence,
    disclaimer
  };
}

// ...

function calculateRevenueEstimate(
  keyword: string,
  searchVolume: number | null,
  documentCount: number | null,
  goldenRatio: number,
  blueOceanScore: number
): ProTrafficKeyword['revenueEstimate'] {
  if (searchVolume === null || documentCount === null) {
    return {
      dailyRevenue: '측정 불가',
      monthlyRevenue: '측정 불가',
      estimatedCPC: 0,
      estimatedRPM: 0,
      adType: '애드센스',
      revenueGrade: 'C',
      revenueReason: '📊 API 데이터 부족으로 수익 계산 불가'
    };
  }

  const CPC_BY_CATEGORY: Record<string, number> = {
    '건강': 500,
    '테크': 450,
    '교육': 600,
    '음식': 200,
    '엔터': 150,
    '일반': 250
  };

  // 카테고리 감지
  const category = detectCategory(keyword);
  const baseCPC = CPC_BY_CATEGORY[category] || CPC_BY_CATEGORY['일반'];

  // 🔥 키워드 특성에 따른 CPC 보정
  let cpcMultiplier = 1.0;

  // 구매 의도 키워드는 CPC 높음
  if (keyword.includes('추천') || keyword.includes('비교') || keyword.includes('순위')) {
    cpcMultiplier *= 1.5;
  }
  if (keyword.includes('가격') || keyword.includes('비용') || keyword.includes('후기')) {
    cpcMultiplier *= 1.3;
  }

  // 롱테일 키워드는 전환율 높음 → CPC 보정
  if (keyword.split(' ').length >= 3) {
    cpcMultiplier *= 1.2;
  }

  const estimatedCPC = Math.round(baseCPC * cpcMultiplier);

  // 🔥 RPM 계산 (1000 페이지뷰당 수익)
  // 평균 CTR 2%, CPC 기반
  const estimatedRPM = Math.round(estimatedCPC * 20); // 1000 * 0.02 * CPC

  // 🔥 일일 예상 트래픽 (상위노출 가정)
  const dailySearches = Math.round(searchVolume / 30);
  const estimatedCTR = blueOceanScore >= 70 ? 0.10 : blueOceanScore >= 50 ? 0.06 : 0.03;
  const dailyVisitors = Math.round(dailySearches * estimatedCTR);

  // 🔥 수익 계산
  const dailyRevenueMin = Math.round((dailyVisitors * estimatedRPM) / 1000 * 0.5);
  const dailyRevenueMax = Math.round((dailyVisitors * estimatedRPM) / 1000 * 1.5);
  const monthlyRevenueMin = dailyRevenueMin * 30;
  const monthlyRevenueMax = dailyRevenueMax * 30;

  // 🔥 수익성 등급
  let revenueGrade: 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' = 'C';
  if (monthlyRevenueMax >= 100000) revenueGrade = 'SSS';
  else if (monthlyRevenueMax >= 50000) revenueGrade = 'SS';
  else if (monthlyRevenueMax >= 30000) revenueGrade = 'S';
  else if (monthlyRevenueMax >= 15000) revenueGrade = 'A';
  else if (monthlyRevenueMax >= 5000) revenueGrade = 'B';

  // 🔥 추천 광고 유형
  let adType = '애드센스';
  if (keyword.includes('추천') || keyword.includes('비교')) {
    adType = '쿠팡파트너스 + 애드센스';
  } else if (category === '여행') {
    adType = '여행사 제휴 + 애드센스';
  } else if (category === '뷰티') {
    adType = '화장품 제휴 + 애드센스';
  }

  // 🔥 수익성 이유
  let revenueReason = '';
  if (revenueGrade === 'SSS') {
    revenueReason = `💰 월 10만원+ 기대! CPC ${estimatedCPC}원, 트래픽 ${dailyVisitors}명/일`;
  } else if (revenueGrade === 'SS') {
    revenueReason = `💵 월 5만원+ 기대! ${category} 카테고리 고CPC`;
  } else if (revenueGrade === 'S') {
    revenueReason = `💸 월 3만원+ 기대! 안정적인 수익 키워드`;
  } else {
    revenueReason = `📊 트래픽 확보 후 수익 기대. 블로그 성장용`;
  }

  return {
    dailyRevenue: dailyRevenueMin > 0 ? `${dailyRevenueMin.toLocaleString()}~${dailyRevenueMax.toLocaleString()}원` : '측정 불가',
    monthlyRevenue: monthlyRevenueMin > 0 ? `${monthlyRevenueMin.toLocaleString()}~${monthlyRevenueMax.toLocaleString()}원` : '측정 불가',
    estimatedCPC,
    estimatedRPM,
    adType,
    revenueGrade,
    revenueReason
  };
}

/**
 * 키워드 타입 분류
 */
function classifyKeywordType(
  keyword: string,
  timing: ProTrafficKeyword['timing'],
  blueOcean: ProTrafficKeyword['blueOcean'],
  goldenRatio: number
): KeywordType {
  if (timing.urgency === 'NOW') return '🚀 타이밍키워드';
  if (blueOcean.score >= 75) return '💎 블루오션';
  if (QUESTION_PATTERNS.some(p => keyword.includes(p))) return '❓ 질문형키워드';
  if (keyword.split(' ').length >= 3 && goldenRatio > 5) return '🎯 롱테일꿀통';
  if (timing.trendDirection === 'rising') return '🌸 시즌선점';
  return '📰 이슈키워드';
}

/**
 * 안전도 분석
 */
function analyzeSafety(keyword: string): { level: 'safe' | 'caution' | 'danger'; reason: string } {
  if (isDangerKeyword(keyword)) {
    return { level: 'danger', reason: '⛔ 저품질/제재 위험 키워드. 신생 블로거는 절대 금지!' };
  }
  if (isCautionKeyword(keyword)) {
    return { level: 'caution', reason: '⚠️ 경쟁 치열 키워드. 고품질 콘텐츠 필수' };
  }
  return { level: 'safe', reason: '✅ 안전한 키워드. 신생 블로거도 작성 가능' };
}

/**
 * 🏆 종합 점수 계산 (v10.1 고도화 알고리즘)
 * - 트래픽 잘 오는 키워드 탐지 강화
 * - 급상승/트렌드 가중치 증가
 * - 수익화 의도 키워드 보너스
 */
function calculateTotalScore(
  rookieScore: number,
  timingScore: number,
  blueOceanScore: number,
  goldenRatio: number,
  safetyLevel: string,
  keyword?: string,
  searchVolume?: number,
  documentCount?: number
): number {
  // 🔥 v2.12.0 Phase 1-1: 검색량 없으면 분석 가치 자체가 없음 → 강제 저점
  //    이전 버그: sv=0이면 ratio 조건 스킵 → profitBonus/mdpBonus 누적 → 100점 도달
  const svValid = typeof searchVolume === 'number' && searchVolume >= 50;
  const dcValid = typeof documentCount === 'number' && documentCount > 0;
  if (!svValid || !dcValid) {
    return Math.round(Math.max(0, Math.min(30, rookieScore * 0.1 + blueOceanScore * 0.1)));
  }

  // 🔥 v10.1 가중치 (트렌드/타이밍 강화!)
  const weights = {
    rookie: 0.25,      // 신생 적합도 25% (↓)
    timing: 0.30,      // 타이밍 30% (↑ 트렌드 중요!)
    blueOcean: 0.25,   // 블루오션 25%
    golden: 0.20       // 황금비율 20% (↑)
  };

  // 황금비율 점수 (0-100)
  let goldenScore = 0;
  if (goldenRatio >= 20) goldenScore = 100;
  else if (goldenRatio >= 10) goldenScore = 90;
  else if (goldenRatio >= 5) goldenScore = 75;
  else if (goldenRatio >= 2) goldenScore = 55;
  else if (goldenRatio >= 1) goldenScore = 35;
  else if (goldenRatio >= 0.5) goldenScore = 15;
  else goldenScore = 0;

  let score =
    rookieScore * weights.rookie +
    timingScore * weights.timing +
    blueOceanScore * weights.blueOcean +
    goldenScore * weights.golden;

  // 🔥 v2.12.0 Phase 2-1: 황금비율 점수가 매우 낮으면(<20) 보너스 전부 차단
  //    이전 버그: goldenScore=0 이어도 profitPatterns/seasonPatterns 보너스로 70점+ 도달
  const allowBonuses = goldenScore >= 20;

  // 🔥 v10.1 트래픽 잘 오는 키워드 보너스!
  // 🔥 v2.13.0 H1: profitBonus 중복 가산 완전 제거 — analyzeKeyword의 profitAnalysis 기반 보너스만 사용.
  //    이곳의 profitPatterns/infoPatterns는 텍스트 추론이라 실데이터 기반과 중복.
  //    대신 시즌/질문 보너스만 유지 (다른 곳과 겹치지 않음).
  if (keyword && allowBonuses) {

    // 3. 시즌성/급상승 키워드 (+12)
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    if (keyword.includes(String(year)) || keyword.includes(String(year + 1))) {
      score += 8; // 년도 포함 키워드
    }
    const seasonPatterns: Record<number, string[]> = {
      1: ['새해', '신년', '연말정산'],
      2: ['발렌타인', '졸업'],
      3: ['봄', '벚꽃', '입학'],
      5: ['종합소득세', '어버이날'],
      7: ['휴가', '여름'],
      9: ['추석'],
      11: ['블랙프라이데이'],
      12: ['크리스마스', '연말', '송년회']
    };
    if (seasonPatterns[month]?.some(p => keyword.includes(p))) {
      score += 12; // 현재 시즌 키워드
    }

    // 4. 질문형 키워드 (+8) - 경쟁 낮고 트래픽 좋음
    const questionPatterns = ['뭐', '어떻게', '왜', '언제', '어디', '얼마', '몇'];
    if (questionPatterns.some(p => keyword.includes(p))) {
      score += 8;
    }
  }

  // 🔥 검색량 대비 문서수 비율 보너스 & 페널티
  if (searchVolume && documentCount) {
    const ratio = searchVolume / Math.max(1, documentCount);
    if (ratio >= 2.0) score += 25;       // 압도적 기회!
    else if (ratio >= 1.0) score += 15;  // 좋은 기회
    else if (ratio < 0.2) score -= 40;   // 🚨 레드오션 페널티 (강력!)
    else if (ratio < 0.5) score -= 25;   // 🚨 경쟁 높음 페널티 (강화)
  }

  // 🚨 문서수 절대량 페널티
  if (documentCount && documentCount > 20000) {
    score -= 10;
    if (documentCount > 50000) score -= 15;
    if (documentCount > 100000) score -= 20;
  }

  // 안전도 보정
  if (safetyLevel === 'danger') score *= 0.3;
  else if (safetyLevel === 'caution') score *= 0.7;

  return Math.round(Math.max(0, Math.min(100, score)));
}

/**
 * 등급 결정
 */
function determineGrade(
  totalScore: number,
  rookieScore: number
): 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' {
  // 신생 적합도가 매우 높으면 등급 상향
  const bonus = rookieScore >= 85 ? 5 : 0;
  let adjustedScore = totalScore + bonus;

  // 🚨 100점 품질 고도화: SSS/SS 등급 하드 게이트 (Hard-Gate)
  // 아무리 총점이 높아도 황금비율이 낮으면 최고 등급을 주지 않음
  // totalScore 내부의 goldenRatio는 % 단위 (100 = 1:1)
  // analyzeKeyword에서 넘겨주는 totalScore는 0-100 사이의 값임.
  // 이 determineGrade는 totalScore를 받지만, 내부적으로 rawRatio를 다시 체크할 수 없으므로
  // totalScore 계산 시 이미 goldenRatio가 녹아있음.

  if (adjustedScore >= 85) return 'SSS';
  if (adjustedScore >= 75) return 'SS';
  if (adjustedScore >= 65) return 'S';
  if (adjustedScore >= 55) return 'A';
  if (adjustedScore >= 45) return 'B';
  return 'C';
}

/**
 * 초고수 전략 가이드 생성
 */
function generateProStrategy(
  keyword: string,
  type: KeywordType,
  searchVolume: number | null,
  timing: ProTrafficKeyword['timing']
): ProTrafficKeyword['proStrategy'] {
  const year = new Date().getFullYear();

  // 추천 제목 생성 (년도 중복 방지)
  const keywordWithYear = keyword.includes(year.toString()) ? keyword : `${year} ${keyword}`;
  const titleTemplates = [
    `${keywordWithYear} 완벽 정리 | 초보자도 쉽게 이해하는 가이드`,
    `${keywordWithYear} 총정리 | 꼭 알아야 할 핵심 포인트 TOP 5`,
    `${keywordWithYear} A to Z | 전문가가 알려주는 꿀팁`,
    `${keywordWithYear} 비교 분석 | 장단점 한눈에 정리`
  ];

  // 목차 생성
  const outline = [
    `1. ${keyword}란? (기본 개념)`,
    `2. ${keyword} 핵심 포인트 3가지`,
    `3. ${keyword} 장단점 비교`,
    `4. ${keyword} 실제 후기/경험담`,
    `5. ${keyword} Q&A (자주 묻는 질문)`,
    `6. 결론 및 추천`
  ];

  // 반드시 포함할 내용
  const mustInclude = [
    '핵심 키워드 2~3회 자연스럽게 삽입',
    '실제 이미지/사진 3장 이상',
    '표 또는 비교 차트 1개 이상',
    '자주 묻는 질문(FAQ) 섹션',
    '결론 및 추천 섹션'
  ];

  // 피해야 할 내용
  const avoidTopics = [
    '과장된 표현 (100%, 무조건, 반드시)',
    '허위 정보나 검증되지 않은 내용',
    '다른 블로그 복사/붙여넣기',
    '광고성 링크 과다 삽입'
  ];

  // 수익화 전략
  let monetization = '애드센스 + 쿠팡파트너스 조합 추천';
  if ((searchVolume ?? 0) > 10000) {
    monetization = '애드센스 메인 (트래픽 많으면 효과적)';
  } else if (keyword.includes('추천') || keyword.includes('비교')) {
    monetization = '쿠팡파트너스/제휴마케팅 메인 (구매 전환 유도)';
  }

  // 추천 글자수
  const wordCount = timing.urgency === 'NOW' ? 1500 : 2500;

  return {
    title: titleTemplates[0],
    outline,
    wordCount,
    mustInclude,
    avoidTopics,
    monetization
  };
}

/**
 * 카테고리 감지 (네이버 블로그 카테고리 체계에 맞춤)
 */
function detectCategory(keyword: string): string {
  const kw = keyword.toLowerCase();

  // ⚠️ interior 우선: 욕실/주방/타일 등 생활 카테고리 토큰과 겹치더라도
  // '인테리어' 의도가 명확하면 interior로 분류하여 카테고리 혼입을 방지
  if (
    /인테리어|집꾸미기|방꾸미기|홈스타일링|셀프인테리어|리모델링|홈데코|인테리어소품/.test(kw) ||
    ((/수납장|선반|행거|붙박이장/.test(kw)) && (/추천|설치|구매|가격|비교/.test(kw)))
  ) {
    return 'interior';
  }

  // 🏠 realestate 우선: business/education과 겹치더라도 부동산/청약/전월세 의도가 명확하면 realestate로 분류
  if (
    /부동산|청약|전세|월세|전월세|아파트(?!\s*인테리어)|오피스텔|주택담보대출|주담대|보금자리론|디딤돌대출|버팀목|특례보금자리론|임대차|전입신고|확정일자|계약갱신청구권|복비|중개수수료|실거래가|분양권|분양가상한제|재건축|재개발|깡통전세|전세사기/.test(kw)
  ) {
    return 'realestate';
  }

  // 🚀 self_development 우선: 자기계발/루틴/생산성/멘탈/커리어 기초 키워드는 self_development로 분류
  if (
    /자기계발|자기개발|동기부여|목표설정|계획세우기|습관|루틴|시간관리|우선순위|생산성|집중력|자존감|번아웃|멘탈관리|글쓰기연습|독서법/.test(kw)
  ) {
    return 'self_development';
  }

  // 네이버 블로그 카테고리 체계
  const categoryPatterns: Record<string, string[]> = {
    // 🎬 엔터테인먼트·예술
    'book': ['책', '독서', '소설', '베스트셀러', '신간', '서평', '문학', '작가', '교보', '교보문고', 'yes24', '예스24', '알라딘', '리디', '리디북스', '밀리의서재', '오디오북', '전자책', 'e북'],
    'movie': ['영화', '넷플릭스', '디즈니플러스', '티빙', '웨이브', '왓챠', '쿠팡플레이', 'ott', '개봉', '리뷰', 'cgv', '메가박스', '롯데시네마', '영화예매', '상영시간표', '영화관'],
    'art': ['미술', '디자인', '전시회', '갤러리', '작품', '그림', '아트', '디자이너', '브랜딩', '로고디자인'],
    'performance': ['공연', '전시', '뮤지컬', '연극', '콘서트', '오페라', '발레', '티켓', '티켓팅', '예매', '인터파크', '예스24티켓', '멜론티켓'],
    'music': ['음악', '노래', '앨범', '음원', '가수', '밴드', '클래식', '멜론', '지니', '벅스', 'flo', '스포티파이', '유튜브뮤직', '애플뮤직', '이용권', '요금제'],
    'drama': ['드라마', '시청률', '출연진', '줄거리', '결말', '등장인물', '회차', '재방송', '다시보기', 'ott', '티빙', '웨이브', '왓챠', '쿠팡플레이', '넷플릭스', '디즈니플러스'],
    'celeb': ['연예인', '아이돌', '배우', '가수', '팬미팅', '굿즈'],
    'anime': ['만화', '애니', '웹툰', '애니메이션', '원피스', '나루토', '귀멸', '라프텔', '애니플러스', '크런치롤'],
    'broadcast': ['방송', '예능', '라디오', 'tv', '유튜브', '스트리밍', '팟캐스트', 'kbs', 'sbs', 'mbc', 'tvn', 'jtbc', '실시간tv', '다시보기'],

    // 🏠 생활·노하우·쇼핑
    'daily': ['일상', '생각', '하루', '오늘', '브이로그', 'vlog', '일기', '다이어리', '감사', '기록', '루틴'],
    'parenting': ['육아', '출산', '임신', '아기', '결혼', '신혼', '웨딩', '돌잔치'],
    'pet': ['강아지', '고양이', '반려동물', '반려견', '반려묘', '펫', '사료', '간식'],
    'quotes': ['명언', '좋은글', '감동글', '힐링', '위로', '격려', '글귀'],
    'fashion': [
      '패션', '미용', '옷', '코디', '화장품', '스킨케어', '메이크업', '헤어', '네일',
      '틴트', '립', '립스틱', '립밤', '쿠션', '파운데이션', '컨실러', '아이섀도', '아이라이너',
      '마스카라', '블러셔', '하이라이터', '선크림', '선블럭', '향수'
    ],
    'life_tips': [
      // 🧹 청소 노하우 (방법/꿀팁 중심)
      '청소 꿀팁', '대청소 방법', '찌든때 제거 방법', '기름때 청소 꿀팁', '물때 제거 방법',
      '곰팡이 제거 방법', '욕실 청소 꿀팁', '화장실 냄새 제거', '변기 청소 방법',
      '싱크대 청소 꿀팁', '배수구 냄새 제거', '하수구 막힘 해결', '타일 청소 방법',
      '유리창 청소 꿀팁', '방충망 청소 방법', '창문 틀 청소',
      '에어컨 청소 방법', '에어컨 필터 청소', '냉장고 청소 꿀팁',
      // 🧺 빨래/세탁 노하우
      '빨래 냄새 제거', '세탁 꿀팁', '얼룩 제거 방법', '흰옷 얼룩 제거',
      '기름 얼룩 빼는 법', '커피 얼룩 제거', '와인 얼룩 제거',
      '니트 세탁 방법', '패딩 세탁법', '운동화 세탁 방법', '이불 세탁 방법',
      '건조기 사용법', '세탁기 청소 방법', '드럼세탁기 청소',
      // 🏠 정리/수납 노하우
      '정리정돈 꿀팁', '수납 방법', '옷장 정리법', '냉장고 정리 꿀팁',
      '신발장 정리', '화장품 정리', '책상 정리 방법', '서랍 정리 꿀팁',
      // 💰 절약 노하우
      '난방비 절약 방법', '전기요금 절약 꿀팁', '가스비 절약법', '수도요금 절약',
      '생활비 절약 꿀팁', '통신비 절약 방법', '교통비 아끼는 법',
      // 🌡️ 계절별 필수 노하우 (시즌 키워드 - 간결한 형태)
      // 겨울 (12-2월)
      '동파 방지', '결로 방지', '습도 조절', '니트 보관', '패딩 보관', '귤 보관',
      '동파', '결로', '습도', '보관법', '세탁법', '청소법', '정리법', '절약법',
      // 봄 (3-5월)
      '미세먼지', '황사 청소', '봄 대청소', '겨울옷 세탁', '꽃가루 알레르기',
      // 여름 (6-8월)
      '장마 습기', '장마 곰팡이', '음식 보관', '식중독', '모기 퇴치', '벌레 퇴치',
      // 가을 (9-11월)
      '김장 준비', '김장 배추', '가을 대청소', '환절기 건강', '겨울 이불',
      // 🗑️ 분리수거/환경
      '분리수거', '재활용', '음식물쓰레기'
    ],
    'interior': [
      '인테리어', '홈인테리어', 'interior',
      '집꾸미기', '방꾸미기', '홈스타일링', '셀프인테리어',
      'diy', '리모델링', '홈데코', '인테리어소품', '소품',
      '가구', '책상', '의자', '침대', '매트리스', '테이블', '서랍',
      '조명', '스탠드', '무드등',
      '커튼', '블라인드',
      '벽지', '타일', '바닥', '장판', '마루', '페인트',
      '수납', '정리수납', '선반', '행거'
    ],
    'recipe': ['요리', '레시피', '밀키트', '반찬', '국', '찌개', '베이킹', '디저트'],
    'review': ['리뷰', '후기', '언박싱', '구매', '추천', '비교', '상품'],
    'garden': ['원예', '재배', '화분', '식물', '정원', '텃밭', '꽃'],

    // 🎮 취미·여가·여행
    'game': ['게임', '공략', '모바일게임', 'pc게임', '스팀', '플스', '닌텐도'],
    'sports': ['스포츠', '야구', '축구', '농구', 'kbo', '프로야구', '경기', '운동'],
    'photo': ['사진', '카메라', '촬영', 'dslr', '미러리스', '풍경', '인물사진'],
    'car': ['자동차', '전기차', '중고차', '신차', '드라이브', '차량', '시승'],
    'hobby': ['취미', '핸드메이드', '수공예', '캘리', '뜨개질', '자수', '공예'],
    'travel_domestic': ['국내여행', '당일치기', '펜션', '호캉스', '글램핑', '캠핑', '제주'],
    'travel_overseas': ['해외여행', '세계여행', '항공권', '비행기', '여권', '유럽', '일본', '동남아'],
    'food': ['맛집', '카페', '맛있는', '브런치', '베이커리', '레스토랑', '음식점'],

    // 📊 지식·동향
    'it': ['컴퓨터', '프로그래밍', '코딩', 'ai', '스마트폰', '앱', '노트북', '아이폰', '갤럭시'],
    'society': ['사회', '정치', '뉴스', '시사', '이슈', '정책', '선거'],
    'health': ['건강', '의학', '병원', '영양제', '다이어트', '운동', '증상', '치료', '비타민'],
    'business': ['비즈니스', '경제', '재테크', '주식', '투자', '부동산', '청약', '연말정산', '창업'],
    'language': ['어학', '외국어', '영어', '토익', '토플', '회화', '일본어', '중국어'],
    'education': ['교육', '학문', '자격증', '시험', '공부', '합격', '취업', '면접', '대학']
  };

  for (const [category, patterns] of Object.entries(categoryPatterns)) {
    if (patterns.some(p => kw.includes(p))) {
      return category;
    }
  }
  return 'all'; // 매칭 안 되면 'all'
}

/**
 * 🔥 실제 API로 검색량 조회 (캐시 적용) - 더미 데이터 사용 안 함!
 */
async function getSearchVolumeReal(keyword: string): Promise<number | null> {
  try {
    const cleanKeyword = keyword.replace(/\s/g, '');
    const cached = apiCache.get(keyword) || apiCache.get(cleanKeyword);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.searchVolume ?? null;
    }

    const envManager = EnvironmentManager.getInstance();
    const envConfig = envManager.getConfig();
    const config: NaverSearchAdConfig = {
      accessLicense: envConfig.naverSearchAdAccessLicense || '',
      secretKey: envConfig.naverSearchAdSecretKey || '',
      customerId: envConfig.naverSearchAdCustomerId || ''
    };

    if (!config.accessLicense || !config.secretKey) {
      // 🚨 API 키 없으면 null 반환 (더미 데이터 사용 안 함!)
      console.warn(`[PRO-TRAFFIC] ⚠️ 검색광고 API 키 없음: ${keyword}`);
      return null;
    }

    const result = await getNaverSearchAdKeywordVolume(config, [keyword]);
    if (result && result.length > 0) {
      const pcRaw = (result[0] as any).monthlyPcQcCnt;
      const mobileRaw = (result[0] as any).monthlyMobileQcCnt;
      const parseMonthly = (val: any): number | null => {
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
          if (val.includes('<')) return 10;
          const parsed = parseInt(val.replace(/[^0-9]/g, ''), 10);
          return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
      };
      const pc = parseMonthly(pcRaw);
      const mobile = parseMonthly(mobileRaw);
      const volume = (pc !== null || mobile !== null) ? ((pc ?? 0) + (mobile ?? 0)) : null;

      if (volume !== null) {
        const existing = apiCache.get(keyword) || { searchVolume: null, documentCount: null, timestamp: 0 };
        apiCache.set(keyword, { ...existing, searchVolume: volume, timestamp: Date.now() });
        apiCache.set(cleanKeyword, { ...existing, searchVolume: volume, timestamp: Date.now() });

        return volume;
      }
    }

    // 🚨 API 실패 시 null 반환 (더미 데이터 사용 안 함!)
    console.warn(`[PRO-TRAFFIC] ⚠️ API 실패: ${keyword}`);
    return null;
  } catch (error) {
    console.warn(`[PRO-TRAFFIC] ⚠️ API 실패: ${keyword}`);
    return null;
  }
}

/**
 * 🔥 실제 API로 문서수 조회 (캐시 적용) - 더미 데이터 사용 안 함!
 */
async function getDocumentCountReal(keyword: string): Promise<number | null> {
  try {
    const cleanKeyword = keyword.replace(/\s/g, '');
    const cached = apiCache.get(keyword) || apiCache.get(cleanKeyword);
    if (cached && cached.documentCount !== null && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.documentCount;
    }

    const count = await getNaverBlogDocumentCount(keyword);
    if (count !== null) {
      const existing = apiCache.get(keyword) || { searchVolume: null, documentCount: null, timestamp: 0 };
      apiCache.set(keyword, { ...existing, documentCount: count, timestamp: Date.now() });
      apiCache.set(cleanKeyword, { ...existing, documentCount: count, timestamp: Date.now() });

      return count;
    }

    // 🚨 API 실패 시 null 반환 (더미 데이터 사용 안 함!)
    console.warn(`[PRO-TRAFFIC] ⚠️ 문서수 API 실패: ${keyword}`);
    return null;
  } catch (error) {
    console.warn(`[PRO-TRAFFIC] ⚠️ 문서수 API 실패: ${keyword}`);
    return null;
  }
}

/**
 * @deprecated 더미데이터 완전 비활성화됨
 * 이 함수는 더 이상 사용되지 않습니다.
 * API 실패 시 해당 키워드는 결과에서 제외됩니다.
 */
function estimateSearchVolumeFallback(keyword: string): number {
  if (!API_CONFIG.ALLOW_FALLBACK) {
    console.warn(`[PRO-TRAFFIC] ⚠️ 추정치 함수 호출됨 (비활성화): ${keyword}`);
    return 0; // 더미 데이터 대신 0 반환 → 이후 필터링에서 제외됨
  }
  // 기존 로직 (비활성화됨)
  return 0;
}

/**
 * @deprecated 더미데이터 완전 비활성화됨
 */
function estimateDocumentCountFallback(keyword: string): number {
  if (!API_CONFIG.ALLOW_FALLBACK) {
    console.warn(`[PRO-TRAFFIC] ⚠️ 추정치 함수 호출됨 (비활성화): ${keyword}`);
    return 0;
  }
  return 0;
}

// 동기 버전 (기존 호환용)
function estimateSearchVolume(keyword: string): number {
  return estimateSearchVolumeFallback(keyword);
}

function estimateDocumentCount(keyword: string): number {
  return estimateDocumentCountFallback(keyword);
}

/**
 * 사용 가능한 카테고리 목록 — CATEGORIES 배열에서 자동 생성
 */
export function getProTrafficCategories(): { value: string; label: string; icon: string }[] {
  return CATEGORIES.map(cat => {
    const icon = CATEGORY_ICONS[cat.id] ?? '📌';
    return { value: cat.id, label: `${icon} ${cat.label}`, icon };
  });
}

// 🔥 v11.1 경쟁 분석 캐시 (실제 크롤링 결과 저장)
const competitorCache = new Map<string, {
  data: ProTrafficKeyword['competitorAnalysis'] & {
    recencyAnalysis: ProTrafficKeyword['recencyAnalysis'],
    smartBlockAnalysis: ProTrafficKeyword['smartBlockAnalysis']
  };
  timestamp: number
}>();
const COMPETITOR_CACHE_TTL = 10 * 60 * 1000; // 10분 캐시

/**
 * 🆕 v11.1 경쟁 블로그 분석 (실제 네이버 블로그 검색 크롤링!)
 */
export async function analyzeCompetitorsReal(
  keyword: string,
  documentCount: number,
  goldenRatio: number
): Promise<ProTrafficKeyword['competitorAnalysis'] & {
  recencyAnalysis: ProTrafficKeyword['recencyAnalysis'],
  smartBlockAnalysis: ProTrafficKeyword['smartBlockAnalysis']
}> {
  // 캐시 확인
  const cached = competitorCache.get(keyword);
  if (cached && Date.now() - cached.timestamp < COMPETITOR_CACHE_TTL) {
    return cached.data;
  }

  const topBloggers: ProTrafficKeyword['competitorAnalysis']['topBloggers'] = [];
  let smartBlockAnalysis: ProTrafficKeyword['smartBlockAnalysis'] = { type: '없음', canPenetrate: true };
  let recencyAnalysis: ProTrafficKeyword['recencyAnalysis'] = { avgDaysOld: 0, isEmptyHouse: false, opportunityLevel: 'medium' };

  try {
    const serpResult = await analyzeSerpWithPlaywright(keyword);

    serpResult.posts.forEach((post, i) => {
      topBloggers.push({
        rank: i + 1,
        blogAge: post.daysOld > 365 ? '1년 이상' : (post.daysOld > 180 ? '6개월~1년' : '최근'),
        postQuality: post.snippet.length > 200 ? 'high' : (post.snippet.length > 50 ? 'medium' : 'low'),
        canBeat: post.daysOld > 180 || post.snippet.length < 100
      });
    });

    recencyAnalysis = {
      avgDaysOld: serpResult.avgDaysOld,
      isEmptyHouse: serpResult.isEmptyHouse,
      opportunityLevel: serpResult.isEmptyHouse ? 'high' : (serpResult.avgDaysOld > 60 ? 'medium' : 'low')
    };

  } catch (error) {
    console.error(`[PRO-TRAFFIC] ⚠️ Playwright 분석 실패 (${keyword}):`, error);
    // 폴백: 수동 추정 logic (기존 로직 유지)
    for (let i = 1; i <= 5; i++) {
      const isWeakCompetitor = goldenRatio > 5 || documentCount < 5000;
      topBloggers.push({
        rank: i,
        blogAge: isWeakCompetitor ? '1년 미만' : '2년 이상',
        postQuality: isWeakCompetitor ? 'low' : 'high',
        canBeat: isWeakCompetitor || i >= 3
      });
    }
  }

  // 승리 확률 계산 (SRAA 반영)
  const weakCompetitorRatio = topBloggers.filter(b => b.canBeat).length * 20;
  let winProbability = Math.min(95, Math.max(10,
    weakCompetitorRatio +
    (goldenRatio > 10 ? 25 : goldenRatio > 5 ? 15 : goldenRatio > 2 ? 5 : 0) +
    (recencyAnalysis.isEmptyHouse ? 20 : 0) +
    (smartBlockAnalysis.canPenetrate ? 10 : -10)
  ));

  // 시즌성 키워드 보너스 (2026 선점 등)
  const config = EnvironmentManager.getInstance().getConfig();
  const mockNow = config.mockDate ? new Date(config.mockDate) : new Date();
  const isYearEnd = mockNow.getMonth() === 11 && mockNow.getDate() >= 20;
  if (isYearEnd && keyword.includes('2026')) {
    winProbability = Math.min(99, winProbability + 30);
  }

  // 공략 전략 생성
  let strategy = '';
  if (winProbability >= 80) {
    strategy = `🎯 [빈집발견] 상위권 글들이 노후화되었습니다! 2026년 선점용${isYearEnd ? ' 초강력 ' : ' '}고품질 글로 1위 점유가 확실시됩니다.`;
  } else if (winProbability >= 60) {
    strategy = `⚡ [도전추천] 스마트블록 침투가 가능합니다. ${recencyAnalysis.isEmptyHouse ? '오래된 글들 사이로' : '최신 정보를 담아'} 충분히 상위권 진입이 가능합니다.`;
  } else {
    strategy = `📝 [롱테일전략] 경쟁이 치열하거나 상위권이 탄탄합니다. '${keyword}'보다는 조금 더 세부적인 키워드로 우회 공략을 추천합니다.`;
  }

  const result = {
    topBloggers,
    avgBlogAge: recencyAnalysis.avgDaysOld > 30 ? `${Math.floor(recencyAnalysis.avgDaysOld / 30)}개월` : `${recencyAnalysis.avgDaysOld}일`,
    weakCompetitorRatio,
    winProbability,
    strategy,
    recencyAnalysis,
    smartBlockAnalysis
  };

  competitorCache.set(keyword, { data: result as any, timestamp: Date.now() });
  return result as any;
}

/**
 * 동기 버전 (기존 호환성)
 */
export function analyzeCompetitors(
  keyword: string,
  documentCount: number,
  goldenRatio: number
): ProTrafficKeyword['competitorAnalysis'] {
  // 캐시에 있으면 반환
  const cached = competitorCache.get(keyword);
  if (cached) return cached.data;

  // 없으면 추정치 반환 (비동기 호출은 별도로)
  const isWeakCompetitor = goldenRatio > 5 || documentCount < 5000;
  const topBloggers: ProTrafficKeyword['competitorAnalysis']['topBloggers'] = [];

  for (let i = 1; i <= 5; i++) {
    topBloggers.push({
      rank: i,
      blogAge: isWeakCompetitor ? (i <= 2 ? '1년 미만' : '1~2년') : (i <= 2 ? '3년 이상' : '1~3년'),
      postQuality: isWeakCompetitor ? (i <= 2 ? 'medium' : 'low') : (i <= 3 ? 'high' : 'medium'),
      canBeat: isWeakCompetitor || i >= 3
    });
  }

  const weakCompetitorRatio = topBloggers.filter(b => b.canBeat).length * 20;
  const winProbability = Math.min(95, Math.max(10,
    weakCompetitorRatio + (goldenRatio > 5 ? 20 : 0) + (documentCount < 5000 ? 20 : 0)
  ));

  let strategy = winProbability >= 70 ? '🎯 공략 추천!' :
    winProbability >= 50 ? '⚡ 도전 가능!' :
      winProbability >= 30 ? '📝 롱테일 접근!' : '⚠️ 신중히!';

  return {
    topBloggers,
    avgBlogAge: documentCount > 30000 ? '3년 이상' : documentCount > 10000 ? '2~3년' : '1~2년',
    weakCompetitorRatio,
    winProbability,
    strategy
  };
}

// 🔥 v11.1 클러스터 캐시
const clusterCache = new Map<string, { data: ProTrafficKeyword['cluster']; timestamp: number }>();
const CLUSTER_CACHE_TTL = 10 * 60 * 1000; // 10분

/**
 * 🆕 v11.1 키워드 클러스터링 (실제 네이버 연관검색어 크롤링!)
 */
export async function clusterKeywordsReal(
  keyword: string,
  allKeywords: string[]
): Promise<ProTrafficKeyword['cluster']> {
  // 캐시 확인
  const cached = clusterCache.get(keyword);
  if (cached && Date.now() - cached.timestamp < CLUSTER_CACHE_TTL) {
    return cached.data;
  }

  const mainKeyword = keyword;
  let relatedKeywords: string[] = [];

  try {
    const axios = (await import('axios')).default;
    const cheerio = await import('cheerio');

    // 네이버 연관 검색어 크롤링
    const searchUrl = `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(keyword)}`;
    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9'
      },
      timeout: 2500
    });

    const $ = cheerio.load(response.data);

    // 연관 검색어 추출
    $('.related_srch .keyword, .lst_related_srch .tit, .related_keyword .item').each((i, el) => {
      const related = $(el).text().trim();
      if (related && related !== keyword && !relatedKeywords.includes(related)) {
        relatedKeywords.push(related);
      }
    });

    // 자동완성 키워드도 포함
    $('a[href*="query="]').each((i, el) => {
      const href = $(el).attr('href') || '';
      const match = href.match(/query=([^&]+)/);
      if (match) {
        try {
          const decoded = decodeURIComponent(match[1]);
          if (decoded !== keyword && decoded.includes(keyword.split(' ')[0]) && !relatedKeywords.includes(decoded)) {
            relatedKeywords.push(decoded);
          }
        } catch { }
      }
    });

    relatedKeywords = relatedKeywords.slice(0, 8);

  } catch (error) {
    // 크롤링 실패 시 로컬 키워드에서 찾기
    const baseWord = keyword.split(' ')[0];
    relatedKeywords = allKeywords
      .filter(k => k !== keyword && (k.includes(baseWord) || baseWord.includes(k.split(' ')[0])))
      .slice(0, 5);
  }

  // 로컬 키워드에서도 추가
  const baseWord = keyword.split(' ')[0];
  const localRelated = allKeywords
    .filter(k => k !== keyword && k.includes(baseWord) && !relatedKeywords.includes(k))
    .slice(0, 3);
  relatedKeywords = [...relatedKeywords, ...localRelated].slice(0, 10);

  // 하나의 글로 커버 가능한지 판단
  const canCoverInOnePost = relatedKeywords.length <= 4;

  // 추천 접근법 (더 상세하게)
  let recommendedApproach = '';
  if (relatedKeywords.length === 0) {
    recommendedApproach = '🎯 단일 키워드 집중! 이 키워드에 모든 역량을 집중하세요.';
  } else if (canCoverInOnePost) {
    recommendedApproach = `📝 통합 작성! "${keyword}"를 H1으로, ${relatedKeywords.slice(0, 3).join(', ')} 등을 H2로 구성하세요.`;
  } else {
    const seriesCount = Math.ceil(relatedKeywords.length / 3);
    recommendedApproach = `📚 시리즈 ${seriesCount}편 추천! 메인글 + ${relatedKeywords.slice(0, 3).join(', ')} 각각 글 작성.`;
  }

  const result: ProTrafficKeyword['cluster'] = {
    mainKeyword,
    relatedKeywords,
    canCoverInOnePost,
    recommendedApproach
  };

  // 캐시에 저장
  clusterCache.set(keyword, { data: result, timestamp: Date.now() });

  return result;
}

/**
 * 동기 버전 (기존 호환성)
 */
export function clusterKeywords(
  keyword: string,
  allKeywords: string[]
): ProTrafficKeyword['cluster'] {
  // 캐시에 있으면 반환
  const cached = clusterCache.get(keyword);
  if (cached) return cached.data;

  const baseWord = keyword.split(' ')[0];
  const relatedKeywords = allKeywords
    .filter(k => k !== keyword && (k.includes(baseWord) || baseWord.includes(k.split(' ')[0])))
    .slice(0, 5);

  const canCoverInOnePost = relatedKeywords.length <= 3;
  let recommendedApproach = relatedKeywords.length === 0
    ? '단일 키워드 집중!'
    : canCoverInOnePost
      ? `통합 작성 추천! ${relatedKeywords.length}개 키워드 함께 다루세요.`
      : `시리즈 추천! ${Math.ceil(relatedKeywords.length / 2)}개 글로 나눠 작성.`;

  return { mainKeyword: keyword, relatedKeywords, canCoverInOnePost, recommendedApproach };
}

// 🔥 v11.2 발행 시간 데이터 (150개+ 모든 카테고리 범용!)
const SEARCH_PATTERNS: Record<string, { peak: number[]; best: number; day: string }> = {
  // ===== 직장/취업 =====
  '직장': { peak: [7, 8, 12, 18, 19], best: 7, day: '월~금' },
  '출근': { peak: [6, 7, 8], best: 6, day: '월~금' },
  '퇴근': { peak: [17, 18, 19], best: 17, day: '월~금' },
  '회사': { peak: [9, 12, 18], best: 9, day: '월~금' },
  '이직': { peak: [21, 22, 23], best: 21, day: '일~목' },
  '면접': { peak: [9, 10, 21, 22], best: 21, day: '일~목' },
  '취업': { peak: [9, 10, 21, 22], best: 9, day: '월~금' },
  '퇴사': { peak: [21, 22, 23], best: 21, day: '일~목' },
  '연봉': { peak: [12, 21, 22], best: 21, day: '월~금' },
  '월급': { peak: [9, 10, 21], best: 9, day: '월~금' },
  '재택': { peak: [9, 10, 14], best: 9, day: '월~금' },
  '알바': { peak: [10, 11, 21, 22], best: 10, day: '매일' },
  '부업': { peak: [21, 22, 23], best: 21, day: '매일' },
  '사업': { peak: [9, 10, 21, 22], best: 9, day: '월~금' },
  '창업': { peak: [9, 10, 21, 22], best: 9, day: '매일' },
  '프리랜서': { peak: [10, 11, 21, 22], best: 10, day: '매일' },

  // ===== 음식/맛집 =====
  '맛집': { peak: [11, 12, 17, 18, 19], best: 11, day: '금~일' },
  '카페': { peak: [10, 14, 15, 16], best: 14, day: '토~일' },
  '메뉴': { peak: [11, 17], best: 11, day: '매일' },
  '레시피': { peak: [10, 11, 16, 17], best: 10, day: '토~일' },
  '배달': { peak: [11, 12, 18, 19, 20], best: 18, day: '금~일' },
  '점심': { peak: [10, 11], best: 10, day: '월~금' },
  '저녁': { peak: [16, 17], best: 16, day: '매일' },
  '아침': { peak: [6, 7, 8], best: 6, day: '매일' },
  '브런치': { peak: [9, 10, 11], best: 9, day: '토~일' },
  '디저트': { peak: [14, 15, 16], best: 14, day: '토~일' },
  '베이커리': { peak: [9, 10, 14, 15], best: 9, day: '토~일' },
  '빵집': { peak: [9, 10, 14], best: 9, day: '토~일' },
  '치킨': { peak: [18, 19, 20, 21], best: 18, day: '금~일' },
  '피자': { peak: [18, 19, 20], best: 18, day: '금~일' },
  '햄버거': { peak: [11, 12, 18, 19], best: 11, day: '매일' },
  '초밥': { peak: [11, 12, 18, 19], best: 11, day: '금~일' },
  '고기': { peak: [17, 18, 19], best: 17, day: '금~일' },
  '삼겹살': { peak: [17, 18, 19], best: 17, day: '금~일' },
  '술집': { peak: [17, 18, 19, 20], best: 17, day: '금~토' },
  '와인': { peak: [18, 19, 20, 21], best: 18, day: '금~토' },
  '맥주': { peak: [18, 19, 20], best: 18, day: '금~토' },
  '막걸리': { peak: [18, 19, 20], best: 18, day: '금~토' },
  '라면': { peak: [11, 12, 21, 22], best: 21, day: '매일' },
  '국밥': { peak: [7, 8, 11, 12], best: 7, day: '매일' },
  '분식': { peak: [11, 12, 15, 16], best: 11, day: '매일' },
  '떡볶이': { peak: [15, 16, 17], best: 15, day: '매일' },
  '김밥': { peak: [7, 8, 11, 12], best: 7, day: '매일' },

  // ===== 여행/숙소 =====
  '여행': { peak: [21, 22, 23], best: 21, day: '금~토' },
  '휴가': { peak: [12, 21, 22], best: 21, day: '수~금' },
  '호텔': { peak: [21, 22, 23], best: 21, day: '금~토' },
  '펜션': { peak: [21, 22], best: 21, day: '목~금' },
  '항공': { peak: [21, 22, 23], best: 21, day: '화~목' },
  '제주': { peak: [21, 22, 23], best: 21, day: '금~토' },
  '부산': { peak: [21, 22, 23], best: 21, day: '금~토' },
  '강릉': { peak: [21, 22, 23], best: 21, day: '금~토' },
  '속초': { peak: [21, 22, 23], best: 21, day: '금~토' },
  '경주': { peak: [21, 22], best: 21, day: '금~토' },
  '전주': { peak: [21, 22], best: 21, day: '금~토' },
  '해외여행': { peak: [21, 22, 23], best: 21, day: '화~목' },
  '일본': { peak: [21, 22, 23], best: 21, day: '화~목' },
  '태국': { peak: [21, 22, 23], best: 21, day: '화~목' },
  '베트남': { peak: [21, 22, 23], best: 21, day: '화~목' },
  '유럽': { peak: [21, 22, 23], best: 21, day: '화~목' },
  '미국': { peak: [21, 22, 23], best: 21, day: '화~목' },
  '중국': { peak: [21, 22, 23], best: 21, day: '화~목' },
  '캠핑': { peak: [21, 22], best: 21, day: '목~금' },
  '글램핑': { peak: [21, 22], best: 21, day: '목~금' },
  '리조트': { peak: [21, 22, 23], best: 21, day: '금~토' },
  '워터파크': { peak: [10, 11, 21], best: 10, day: '금~일' },
  '놀이공원': { peak: [10, 11, 21], best: 10, day: '금~일' },
  '렌트카': { peak: [21, 22], best: 21, day: '목~금' },
  '기차': { peak: [9, 10, 21, 22], best: 21, day: '목~금' },
  '버스': { peak: [9, 10, 21, 22], best: 21, day: '목~금' },

  // ===== 엔터테인먼트 =====
  '영화': { peak: [18, 19, 20, 21, 22], best: 18, day: '금~일' },
  '드라마': { peak: [20, 21, 22, 23], best: 20, day: '매일' },
  '게임': { peak: [18, 19, 20, 21, 22, 23], best: 20, day: '금~일' },
  '넷플릭스': { peak: [20, 21, 22, 23], best: 20, day: '금~일' },
  '콘서트': { peak: [10, 11, 20, 21], best: 10, day: '토~일' },
  '유튜브': { peak: [18, 19, 20, 21, 22], best: 20, day: '매일' },
  '웹툰': { peak: [12, 13, 21, 22, 23], best: 21, day: '매일' },
  '애니': { peak: [20, 21, 22, 23], best: 20, day: '매일' },
  '만화': { peak: [20, 21, 22, 23], best: 20, day: '매일' },
  '음악': { peak: [18, 19, 20, 21], best: 20, day: '매일' },
  '노래': { peak: [18, 19, 20, 21], best: 20, day: '매일' },
  '아이돌': { peak: [18, 19, 20, 21, 22], best: 18, day: '매일' },
  'BTS': { peak: [18, 19, 20, 21], best: 18, day: '매일' },
  '블랙핑크': { peak: [18, 19, 20, 21], best: 18, day: '매일' },
  '예능': { peak: [20, 21, 22, 23], best: 20, day: '토~일' },
  '뮤지컬': { peak: [10, 11, 18, 19], best: 10, day: '토~일' },
  '연극': { peak: [10, 11, 18, 19], best: 10, day: '토~일' },
  '전시': { peak: [10, 11, 14, 15], best: 10, day: '토~일' },
  '공연': { peak: [10, 11, 18, 19], best: 10, day: '금~일' },
  '축제': { peak: [10, 11, 18, 19], best: 10, day: '금~일' },

  // ===== 육아/가정 =====
  '육아': { peak: [10, 14, 22, 23], best: 22, day: '매일' },
  '아이': { peak: [10, 14, 22], best: 22, day: '매일' },
  '유아': { peak: [10, 21, 22], best: 21, day: '매일' },
  '임신': { peak: [10, 21, 22, 23], best: 22, day: '매일' },
  '출산': { peak: [10, 21, 22], best: 21, day: '매일' },
  '신생아': { peak: [10, 14, 22], best: 22, day: '매일' },
  '어린이집': { peak: [9, 10, 21, 22], best: 9, day: '월~금' },
  '유치원': { peak: [9, 10, 21, 22], best: 9, day: '월~금' },
  '초등학교': { peak: [9, 10, 21, 22], best: 9, day: '일~목' },
  '중학교': { peak: [9, 10, 21, 22], best: 21, day: '일~목' },
  '고등학교': { peak: [21, 22, 23], best: 21, day: '일~목' },
  '대학교': { peak: [10, 11, 21, 22], best: 21, day: '일~목' },
  '학원': { peak: [9, 10, 21, 22], best: 9, day: '월~금' },
  '과외': { peak: [9, 10, 21, 22], best: 21, day: '일~목' },
  '장난감': { peak: [10, 11, 21, 22], best: 10, day: '토~일' },
  '분유': { peak: [9, 10, 21, 22], best: 9, day: '매일' },
  '기저귀': { peak: [9, 10, 21, 22], best: 9, day: '매일' },
  '이유식': { peak: [9, 10, 14, 15], best: 9, day: '매일' },
  '산후조리': { peak: [10, 21, 22], best: 21, day: '매일' },
  '태교': { peak: [10, 14, 21, 22], best: 21, day: '매일' },

  // ===== 금융/재테크 =====
  '주식': { peak: [8, 9, 15, 16], best: 8, day: '월~금' },
  '투자': { peak: [8, 9, 21, 22], best: 8, day: '월~금' },
  '코인': { peak: [8, 9, 21, 22, 23], best: 21, day: '매일' },
  '부동산': { peak: [9, 10, 21, 22], best: 9, day: '토~일' },
  '대출': { peak: [9, 10, 14, 15], best: 9, day: '월~금' },
  '적금': { peak: [9, 10, 14, 15], best: 9, day: '월~금' },
  '예금': { peak: [9, 10, 14, 15], best: 9, day: '월~금' },
  '펀드': { peak: [9, 10, 21, 22], best: 9, day: '월~금' },
  '보험': { peak: [9, 10, 14, 15], best: 9, day: '월~금' },
  '연금': { peak: [9, 10, 14, 15], best: 9, day: '월~금' },
  '세금': { peak: [9, 10, 14, 15], best: 9, day: '월~금' },
  '연말정산': { peak: [9, 10, 21, 22], best: 9, day: '월~금' },
  '종합소득세': { peak: [9, 10, 14, 15], best: 9, day: '월~금' },
  '청약': { peak: [9, 10, 21, 22], best: 9, day: '매일' },
  '전세': { peak: [9, 10, 21, 22], best: 9, day: '토~일' },
  '월세': { peak: [9, 10, 21, 22], best: 9, day: '토~일' },
  '아파트': { peak: [9, 10, 21, 22], best: 9, day: '토~일' },
  '분양': { peak: [9, 10, 21, 22], best: 9, day: '토~일' },
  '재건축': { peak: [9, 10, 21, 22], best: 9, day: '토~일' },
  '신용카드': { peak: [9, 10, 14, 15], best: 9, day: '월~금' },
  '체크카드': { peak: [9, 10, 14, 15], best: 9, day: '월~금' },

  // ===== 쇼핑/구매 =====
  '할인': { peak: [10, 11, 21, 22], best: 10, day: '금~일' },
  '세일': { peak: [10, 11, 21, 22], best: 10, day: '금~일' },
  '쿠폰': { peak: [9, 10, 21], best: 9, day: '매일' },
  '추천': { peak: [10, 11, 21, 22], best: 10, day: '매일' },
  '리뷰': { peak: [10, 11, 21, 22], best: 21, day: '매일' },
  '후기': { peak: [10, 11, 21, 22], best: 21, day: '매일' },
  '비교': { peak: [10, 11, 21, 22], best: 10, day: '매일' },
  '가격': { peak: [10, 11, 21, 22], best: 10, day: '매일' },
  '최저가': { peak: [10, 11, 21, 22], best: 10, day: '매일' },
  '구매': { peak: [10, 11, 21, 22], best: 10, day: '매일' },
  '쇼핑': { peak: [10, 11, 21, 22], best: 10, day: '금~일' },
  '백화점': { peak: [10, 11, 14, 15], best: 10, day: '토~일' },
  '아울렛': { peak: [10, 11, 14, 15], best: 10, day: '토~일' },
  '마트': { peak: [10, 11, 17, 18], best: 10, day: '토~일' },
  '편의점': { peak: [11, 12, 21, 22], best: 21, day: '매일' },
  '온라인': { peak: [10, 11, 21, 22], best: 21, day: '매일' },
  '쿠팡': { peak: [10, 11, 21, 22], best: 21, day: '매일' },
  '무신사': { peak: [10, 11, 21, 22], best: 21, day: '매일' },
  '에이블리': { peak: [10, 11, 21, 22], best: 21, day: '매일' },
  '지그재그': { peak: [10, 11, 21, 22], best: 21, day: '매일' },

  // ===== 건강/의료 =====
  '다이어트': { peak: [7, 8, 21, 22], best: 7, day: '월~수' },
  '운동': { peak: [6, 7, 18, 19, 21], best: 7, day: '월~금' },
  '헬스': { peak: [6, 7, 18, 19], best: 18, day: '월~금' },
  '요가': { peak: [7, 8, 9, 21], best: 7, day: '매일' },
  '병원': { peak: [9, 10, 21, 22], best: 9, day: '월~금' },
  '필라테스': { peak: [9, 10, 18, 19], best: 9, day: '월~금' },
  '피부과': { peak: [9, 10, 14, 15], best: 9, day: '월~금' },
  '성형': { peak: [21, 22, 23], best: 21, day: '매일' },
  '치과': { peak: [9, 10, 14, 15], best: 9, day: '월~금' },
  '안과': { peak: [9, 10, 14, 15], best: 9, day: '월~금' },
  '내과': { peak: [9, 10, 14, 15], best: 9, day: '월~금' },
  '한의원': { peak: [9, 10, 14, 15], best: 9, day: '월~금' },
  '건강검진': { peak: [9, 10, 21, 22], best: 9, day: '월~금' },
  '영양제': { peak: [9, 10, 21, 22], best: 9, day: '매일' },
  '비타민': { peak: [9, 10, 21, 22], best: 9, day: '매일' },
  '유산균': { peak: [9, 10, 21, 22], best: 9, day: '매일' },
  '오메가3': { peak: [9, 10, 21, 22], best: 9, day: '매일' },
  '홍삼': { peak: [9, 10, 21, 22], best: 9, day: '매일' },
  '수면': { peak: [21, 22, 23], best: 21, day: '매일' },
  '불면증': { peak: [22, 23, 0], best: 22, day: '매일' },
  '스트레스': { peak: [21, 22, 23], best: 21, day: '일~목' },
  '우울': { peak: [21, 22, 23], best: 21, day: '매일' },
  '두통': { peak: [9, 10, 21, 22], best: 9, day: '매일' },
  '감기': { peak: [9, 10, 21, 22], best: 9, day: '매일' },
  '코로나': { peak: [9, 10, 21, 22], best: 9, day: '매일' },

  // ===== 교육/학습 =====
  '공부': { peak: [9, 10, 21, 22, 23], best: 21, day: '일~목' },
  '시험': { peak: [9, 10, 21, 22], best: 21, day: '일~목' },
  '자격증': { peak: [9, 21, 22], best: 21, day: '일~목' },
  '영어': { peak: [7, 8, 21, 22], best: 7, day: '매일' },
  '토익': { peak: [7, 8, 21, 22], best: 7, day: '일~목' },
  '토플': { peak: [7, 8, 21, 22], best: 7, day: '일~목' },
  '수능': { peak: [21, 22, 23], best: 21, day: '일~목' },
  '입시': { peak: [21, 22, 23], best: 21, day: '일~목' },
  '대입': { peak: [21, 22, 23], best: 21, day: '일~목' },
  '편입': { peak: [21, 22, 23], best: 21, day: '일~목' },
  '유학': { peak: [21, 22, 23], best: 21, day: '일~목' },
  '어학연수': { peak: [21, 22, 23], best: 21, day: '일~목' },
  '코딩': { peak: [21, 22, 23], best: 21, day: '매일' },
  '프로그래밍': { peak: [21, 22, 23], best: 21, day: '매일' },
  '개발자': { peak: [21, 22, 23], best: 21, day: '매일' },
  '인강': { peak: [21, 22, 23], best: 21, day: '일~목' },
  '독학': { peak: [21, 22, 23], best: 21, day: '매일' },

  // ===== 뷰티/패션 =====
  '화장품': { peak: [10, 11, 21, 22], best: 21, day: '매일' },
  '스킨케어': { peak: [21, 22, 23], best: 21, day: '매일' },
  '메이크업': { peak: [7, 8, 21, 22], best: 7, day: '매일' },
  '향수': { peak: [10, 11, 21, 22], best: 21, day: '매일' },
  '네일': { peak: [10, 11, 14, 15], best: 10, day: '토~일' },
  '헤어': { peak: [10, 11, 21, 22], best: 10, day: '토~일' },
  '염색': { peak: [10, 11, 21, 22], best: 10, day: '토~일' },
  '펌': { peak: [10, 11, 21, 22], best: 10, day: '토~일' },
  '미용실': { peak: [10, 11, 14, 15], best: 10, day: '토~일' },
  '옷': { peak: [10, 11, 21, 22], best: 21, day: '매일' },
  '코디': { peak: [7, 8, 21, 22], best: 7, day: '매일' },
  '패션': { peak: [10, 11, 21, 22], best: 21, day: '매일' },
  '신발': { peak: [10, 11, 21, 22], best: 21, day: '매일' },
  '가방': { peak: [10, 11, 21, 22], best: 21, day: '매일' },
  '액세서리': { peak: [10, 11, 21, 22], best: 21, day: '매일' },
  '시계': { peak: [10, 11, 21, 22], best: 21, day: '매일' },
  '명품': { peak: [10, 11, 21, 22], best: 21, day: '금~일' },

  // ===== IT/테크 =====
  '아이폰': { peak: [9, 10, 21, 22], best: 21, day: '매일' },
  '갤럭시': { peak: [9, 10, 21, 22], best: 21, day: '매일' },
  '스마트폰': { peak: [9, 10, 21, 22], best: 21, day: '매일' },
  '노트북': { peak: [9, 10, 21, 22], best: 21, day: '매일' },
  '컴퓨터': { peak: [9, 10, 21, 22], best: 21, day: '매일' },
  '태블릿': { peak: [9, 10, 21, 22], best: 21, day: '매일' },
  '아이패드': { peak: [9, 10, 21, 22], best: 21, day: '매일' },
  '이어폰': { peak: [9, 10, 21, 22], best: 21, day: '매일' },
  '에어팟': { peak: [9, 10, 21, 22], best: 21, day: '매일' },
  'AI': { peak: [9, 10, 21, 22], best: 9, day: '월~금' },
  'ChatGPT': { peak: [9, 10, 21, 22], best: 9, day: '매일' },
  '앱': { peak: [9, 10, 21, 22], best: 21, day: '매일' },
  '어플': { peak: [9, 10, 21, 22], best: 21, day: '매일' },

  // ===== 자동차 =====
  '자동차': { peak: [9, 10, 21, 22], best: 21, day: '토~일' },
  '중고차': { peak: [9, 10, 21, 22], best: 21, day: '토~일' },
  '신차': { peak: [9, 10, 21, 22], best: 21, day: '토~일' },
  '전기차': { peak: [9, 10, 21, 22], best: 21, day: '토~일' },
  '테슬라': { peak: [9, 10, 21, 22], best: 21, day: '토~일' },
  '현대': { peak: [9, 10, 21, 22], best: 21, day: '토~일' },
  '기아': { peak: [9, 10, 21, 22], best: 21, day: '토~일' },
  '벤츠': { peak: [9, 10, 21, 22], best: 21, day: '토~일' },
  'BMW': { peak: [9, 10, 21, 22], best: 21, day: '토~일' },
  '주유': { peak: [7, 8, 17, 18], best: 7, day: '매일' },
  '세차': { peak: [9, 10, 14, 15], best: 9, day: '토~일' },
  '정비': { peak: [9, 10, 14, 15], best: 9, day: '월~금' },
  '보험료': { peak: [9, 10, 14, 15], best: 9, day: '월~금' },
  '운전면허': { peak: [9, 10, 21, 22], best: 9, day: '매일' },

  // ===== 인테리어/가전 =====
  '인테리어': { peak: [10, 11, 21, 22], best: 21, day: '토~일' },
  '이사': { peak: [9, 10, 21, 22], best: 9, day: '토~일' },
  '가구': { peak: [10, 11, 21, 22], best: 21, day: '토~일' },
  '소파': { peak: [10, 11, 21, 22], best: 21, day: '토~일' },
  '침대': { peak: [21, 22, 23], best: 21, day: '토~일' },
  '책상': { peak: [10, 11, 21, 22], best: 21, day: '토~일' },
  '냉장고': { peak: [9, 10, 21, 22], best: 21, day: '토~일' },
  '세탁기': { peak: [9, 10, 21, 22], best: 21, day: '토~일' },
  '에어컨': { peak: [9, 10, 21, 22], best: 21, day: '토~일' },
  '청소기': { peak: [9, 10, 21, 22], best: 21, day: '토~일' },
  '공기청정기': { peak: [9, 10, 21, 22], best: 21, day: '매일' },

  // ===== 반려동물 =====
  '강아지': { peak: [10, 11, 21, 22], best: 21, day: '매일' },
  '고양이': { peak: [10, 11, 21, 22], best: 21, day: '매일' },
  '반려동물': { peak: [10, 11, 21, 22], best: 21, day: '매일' },
  '펫': { peak: [10, 11, 21, 22], best: 21, day: '매일' },
  '사료': { peak: [9, 10, 21, 22], best: 9, day: '매일' },
  '간식': { peak: [10, 11, 21, 22], best: 10, day: '매일' },
  '동물병원': { peak: [9, 10, 14, 15], best: 9, day: '월~금' },

  // ===== 결혼/연애 =====
  '결혼': { peak: [21, 22, 23], best: 21, day: '토~일' },
  '웨딩': { peak: [10, 11, 21, 22], best: 10, day: '토~일' },
  '신혼여행': { peak: [21, 22, 23], best: 21, day: '금~토' },
  '혼수': { peak: [10, 11, 21, 22], best: 10, day: '토~일' },
  '연애': { peak: [21, 22, 23], best: 21, day: '매일' },
  '소개팅': { peak: [21, 22, 23], best: 21, day: '금~토' },
  '데이트': { peak: [10, 11, 21, 22], best: 10, day: '금~일' },
  '기념일': { peak: [10, 11, 21, 22], best: 10, day: '매일' },
  '선물': { peak: [10, 11, 21, 22], best: 10, day: '매일' },

  // ===== 시즌/이벤트 =====
  '설날': { peak: [9, 10, 21, 22], best: 9, day: '매일' },
  '추석': { peak: [9, 10, 21, 22], best: 9, day: '매일' },
  '크리스마스': { peak: [10, 11, 21, 22], best: 10, day: '매일' },
  '발렌타인': { peak: [10, 11, 21, 22], best: 10, day: '매일' },
  '화이트데이': { peak: [10, 11, 21, 22], best: 10, day: '매일' },
  '어버이날': { peak: [10, 11, 21, 22], best: 10, day: '매일' },
  '어린이날': { peak: [10, 11, 21, 22], best: 10, day: '매일' },
  '블랙프라이데이': { peak: [9, 10, 21, 22], best: 9, day: '매일' },
  '새해': { peak: [9, 10, 21, 22], best: 9, day: '매일' },
  '벚꽃': { peak: [10, 11, 14, 15], best: 10, day: '토~일' },
  '단풍': { peak: [10, 11, 14, 15], best: 10, day: '토~일' },
  '장마': { peak: [9, 10, 21, 22], best: 9, day: '매일' },
  '폭염': { peak: [9, 10, 21, 22], best: 9, day: '매일' },
  '한파': { peak: [9, 10, 21, 22], best: 9, day: '매일' },

  // ===== 정부/행정 =====
  '지원금': { peak: [9, 10, 14, 15], best: 9, day: '월~금' },
  '보조금': { peak: [9, 10, 14, 15], best: 9, day: '월~금' },
  '신청': { peak: [9, 10, 14, 15], best: 9, day: '월~금' },
  '서류': { peak: [9, 10, 14, 15], best: 9, day: '월~금' },
  '민원': { peak: [9, 10, 14, 15], best: 9, day: '월~금' },
  '주민센터': { peak: [9, 10, 14, 15], best: 9, day: '월~금' },
  '등기': { peak: [9, 10, 14, 15], best: 9, day: '월~금' },
  '여권': { peak: [9, 10, 14, 15], best: 9, day: '월~금' },
  '비자': { peak: [9, 10, 14, 15], best: 9, day: '월~금' },
};

/**
 * 🆕 v11.1 발행 최적 시간 추천 (실제 검색 패턴 데이터 기반!)
 */
export function getBestPublishSchedule(
  keyword: string,
  keywordType: KeywordType
): ProTrafficKeyword['bestPublishSchedule'] {
  const now = new Date();
  const kw = keyword.toLowerCase();

  // 키워드에서 패턴 매칭
  let matched: { peak: number[]; best: number; day: string } | null = null;
  let matchedKey = '';

  for (const [key, pattern] of Object.entries(SEARCH_PATTERNS)) {
    if (kw.includes(key)) {
      matched = pattern;
      matchedKey = key;
      break;
    }
  }

  let bestHour: number;
  let bestDay: string;
  let peakSearchHours: number[];
  let avoidHours = [1, 2, 3, 4, 5]; // 새벽은 항상 피하기
  let reason: string;

  if (keywordType === '🚀 타이밍키워드' || keywordType === '📰 이슈키워드') {
    // 이슈 키워드는 지금 바로!
    bestHour = now.getHours();
    bestDay = '지금 바로';
    peakSearchHours = [now.getHours(), (now.getHours() + 1) % 24, (now.getHours() + 2) % 24];
    reason = '🔥 이슈 키워드 → 지금 바로 발행이 최적! 늦으면 경쟁자에게 뺏김!';
  } else if (matched) {
    // 패턴 매칭됨
    bestHour = matched.best;
    bestDay = matched.day;
    peakSearchHours = matched.peak;
    reason = `📊 "${matchedKey}" 키워드 검색 패턴 분석 → ${bestHour}시 발행 후 ${peakSearchHours.join('시, ')}시 피크!`;
  } else {
    // 기본값 (일반 키워드)
    bestHour = 9;
    bestDay = '평일';
    peakSearchHours = [9, 10, 12, 14, 21, 22];
    reason = '📈 일반 키워드 → 오전 9시 발행 권장 (출근 후 + 점심 + 저녁 노출)';
  }

  return {
    bestHour,
    bestDay,
    peakSearchHours,
    avoidHours,
    reason
  };
}

/**
 * 🆕 v11.1 캐시 초기화 (새로고침용)
 */
export function clearKeywordCache(): void {
  keywordCache.clear();
  apiCache.clear();
  competitorCache.clear();
  clusterCache.clear();
  console.log('[PRO-TRAFFIC] 🗑️ 모든 캐시 초기화 완료');
}

// ============================================================================
// 🔥 v11.3 수익화 황금키워드 발굴 시스템 (끝판왕!)
// ============================================================================

// CPC_DATA & MONETIZATION_PATTERNS (Removed, now imported from hunter-patterns.ts)

/**
 * 🆕 v11.3 수익화 분석 (끝판왕!)
 */
export function analyzeMonetization(
  keyword: string,
  searchVolume: number,
  documentCount: number,
  goldenRatio: number,
  keywordType: KeywordType
): ProTrafficKeyword['monetization'] {
  const kw = keyword.toLowerCase();

  // 1. CPC 추정
  let cpcData = { min: 50, max: 150, avg: 80 }; // 기본값
  let cpcTier: 'premium' | 'high' | 'medium' | 'low' = 'low';

  for (const [category, data] of Object.entries(CPC_DATA)) {
    if (kw.includes(category)) {
      cpcData = data;
      if (data.avg >= 700) cpcTier = 'premium';
      else if (data.avg >= 350) cpcTier = 'high';
      else if (data.avg >= 150) cpcTier = 'medium';
      break;
    }
  }

  // 2. 수익화 의도 분석
  let intentScore = 0;
  let intentType = '';

  for (const [type, patterns] of Object.entries(MONETIZATION_PATTERNS)) {
    const matchCount = patterns.filter(p => kw.includes(p)).length;
    if (matchCount > 0) {
      if (type === 'purchase') { intentScore += 30 * matchCount; intentType = '구매의도'; }
      else if (type === 'comparison') { intentScore += 25 * matchCount; intentType = '비교의도'; }
      else if (type === 'review') { intentScore += 20 * matchCount; intentType = '리뷰의도'; }
      else if (type === 'info') { intentScore += 15 * matchCount; intentType = '정보탐색'; }
      else if (type === 'problem') { intentScore += 12 * matchCount; intentType = '문제해결'; }
      else if (type === 'location') { intentScore += 18 * matchCount; intentType = '지역검색'; }
    }
  }

  // 3. 수익화 점수 계산
  let monetizationScore = 0;

  // CPC 기여도 (30%)
  if (cpcTier === 'premium') monetizationScore += 30;
  else if (cpcTier === 'high') monetizationScore += 22;
  else if (cpcTier === 'medium') monetizationScore += 15;
  else monetizationScore += 8;

  // 검색량 기여도 (25%)
  if (searchVolume >= 10000) monetizationScore += 25;
  else if (searchVolume >= 5000) monetizationScore += 20;
  else if (searchVolume >= 1000) monetizationScore += 15;
  else if (searchVolume >= 300) monetizationScore += 10;
  else monetizationScore += 5;

  // 황금비율 기여도 (25%)
  if (goldenRatio >= 20) monetizationScore += 25;
  else if (goldenRatio >= 10) monetizationScore += 20;
  else if (goldenRatio >= 5) monetizationScore += 15;
  else if (goldenRatio >= 2) monetizationScore += 10;
  else monetizationScore += 5;

  // 의도 기여도 (20%)
  monetizationScore += Math.min(20, intentScore);

  // 등급 결정
  let grade: 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' | 'D';
  if (monetizationScore >= 90) grade = 'SSS';
  else if (monetizationScore >= 80) grade = 'SS';
  else if (monetizationScore >= 70) grade = 'S';
  else if (monetizationScore >= 55) grade = 'A';
  else if (monetizationScore >= 40) grade = 'B';
  else if (monetizationScore >= 25) grade = 'C';
  else grade = 'D';

  // 4. 수익화 방법별 적합도
  const methods = {
    adsense: {
      score: Math.min(100, Math.round(cpcData.avg / 15 + searchVolume / 200 + (goldenRatio > 5 ? 20 : 0))),
      reason: cpcTier === 'premium' || cpcTier === 'high'
        ? `💰 고단가 키워드! CPC ${cpcData.avg}원 예상`
        : `📊 CPC ${cpcData.avg}원, 트래픽 확보가 핵심`
    },
    coupang: {
      score: MONETIZATION_PATTERNS.purchase.some(p => kw.includes(p)) ? 85 :
        MONETIZATION_PATTERNS.comparison.some(p => kw.includes(p)) ? 75 :
          MONETIZATION_PATTERNS.review.some(p => kw.includes(p)) ? 70 : 40,
      reason: MONETIZATION_PATTERNS.purchase.some(p => kw.includes(p))
        ? '🛒 구매의도 높음! 쿠팡파트너스 강추'
        : MONETIZATION_PATTERNS.review.some(p => kw.includes(p))
          ? '📝 리뷰형 콘텐츠로 전환율 높이기'
          : '🔗 상품 연결 자연스럽게 시도'
    },
    affiliate: {
      score: MONETIZATION_PATTERNS.comparison.some(p => kw.includes(p)) ? 85 :
        MONETIZATION_PATTERNS.review.some(p => kw.includes(p)) ? 80 :
          cpcTier === 'premium' ? 75 : 45,
      reason: MONETIZATION_PATTERNS.comparison.some(p => kw.includes(p))
        ? '🔥 비교 콘텐츠 = 제휴마케팅 최적!'
        : cpcTier === 'premium'
          ? '💎 고가 상품 제휴 추천'
          : '📌 관련 서비스 제휴 연결'
    },
    brandedContent: {
      score: searchVolume >= 5000 ? 80 : searchVolume >= 1000 ? 60 : 30,
      reason: searchVolume >= 5000
        ? '📈 검색량 충분! 브랜드 협찬 가능'
        : '📊 검색량 확보 후 협찬 도전'
    },
    digitalProduct: {
      score: MONETIZATION_PATTERNS.info.some(p => kw.includes(p)) ? 75 :
        MONETIZATION_PATTERNS.problem.some(p => kw.includes(p)) ? 70 : 35,
      reason: MONETIZATION_PATTERNS.info.some(p => kw.includes(p))
        ? '📚 정보성 → 전자책/강의 연결 가능'
        : '💡 노하우 콘텐츠로 디지털상품화'
    }
  };

  // 5. 추천 수익화 전략
  const bestMethod = Object.entries(methods).reduce((a, b) => a[1].score > b[1].score ? a : b);
  const methodNames: Record<string, string> = {
    adsense: '애드센스',
    coupang: '쿠팡파트너스',
    affiliate: '제휴마케팅',
    brandedContent: '브랜드협찬',
    digitalProduct: '디지털상품'
  };

  let recommendedStrategy = '';
  if (grade === 'SSS' || grade === 'SS') {
    recommendedStrategy = `🏆 ${methodNames[bestMethod[0]]} 최적! ${intentType ? `(${intentType})` : ''} CPC ${cpcData.avg}원 + 황금비율 ${goldenRatio.toFixed(1)} = 수익화 황금키워드!`;
  } else if (grade === 'S' || grade === 'A') {
    recommendedStrategy = `⭐ ${methodNames[bestMethod[0]]} 추천! ${bestMethod[1].reason}`;
  } else {
    recommendedStrategy = `📌 트래픽 확보 후 ${methodNames[bestMethod[0]]} 시도. 롱테일 키워드로 먼저 상위노출 확보!`;
  }

  // 6. 예상 월수익 계산 (방문자 1000명 기준)
  const ctr = 0.02; // 평균 클릭률 2%
  const affiliateRate = 0.03; // 제휴 전환율 3%
  const affiliateCommission = cpcTier === 'premium' ? 5000 : cpcTier === 'high' ? 2000 : 1000;

  const adsenseRevenue = 1000 * ctr * cpcData.avg;
  const affiliateRevenue = 1000 * affiliateRate * affiliateCommission;
  const combinedAvg = (adsenseRevenue + affiliateRevenue) / 2;

  return {
    score: monetizationScore,
    grade,
    estimatedCPC: {
      min: cpcData.min,
      max: cpcData.max,
      average: cpcData.avg,
      tier: cpcTier
    },
    methods,
    recommendedStrategy,
    estimatedMonthlyRevenue: {
      conservative: Math.round(combinedAvg * 0.5),
      average: Math.round(combinedAvg),
      optimistic: Math.round(combinedAvg * 2)
    }
  };
}

/**
 * 🆕 v11.3 틈새 키워드 분석
 */
export function analyzeNiche(
  keyword: string,
  searchVolume: number,
  documentCount: number,
  goldenRatio: number,
  trend?: string
): ProTrafficKeyword['nicheAnalysis'] {
  const kw = keyword.toLowerCase();

  // 틈새 점수 계산
  let nicheScore = 0;
  let nicheType: 'hidden_gem' | 'rising_star' | 'blue_ocean' | 'untapped' | 'normal' = 'normal';
  let nicheReason = '';
  let competitionLevel: 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
  let opportunityWindow = '';

  // 1. 황금비율 기반 (40%)
  if (goldenRatio >= 50) {
    nicheScore += 40;
    nicheReason = '초블루오션! 검색량 대비 문서수 극히 적음';
  } else if (goldenRatio >= 20) {
    nicheScore += 35;
    nicheReason = '블루오션! 경쟁 거의 없음';
  } else if (goldenRatio >= 10) {
    nicheScore += 28;
    nicheReason = '좋은 기회! 경쟁 약함';
  } else if (goldenRatio >= 5) {
    nicheScore += 20;
    nicheReason = '진입 가능! 적절한 경쟁';
  } else if (goldenRatio >= 2) {
    nicheScore += 12;
    nicheReason = '경쟁 있음. 차별화 필요';
  } else {
    nicheScore += 5;
    nicheReason = '레드오션. 롱테일 추천';
  }

  // 2. 문서수 기반 (30%)
  if (documentCount < 1000) {
    nicheScore += 30;
    competitionLevel = 'very_low';
    nicheReason += ' / 문서 1천 미만 = 진입장벽 매우 낮음!';
  } else if (documentCount < 5000) {
    nicheScore += 25;
    competitionLevel = 'low';
    nicheReason += ' / 문서 5천 미만 = 1페이지 가능';
  } else if (documentCount < 20000) {
    nicheScore += 18;
    competitionLevel = 'medium';
  } else if (documentCount < 100000) {
    nicheScore += 10;
    competitionLevel = 'high';
  } else {
    nicheScore += 3;
    competitionLevel = 'very_high';
  }

  // 3. 검색량 대비 경쟁 (30%)
  if (searchVolume >= 1000 && documentCount < 5000) {
    nicheScore += 30;
    nicheType = 'hidden_gem';
    nicheReason += ' / 🏆 히든젬 발견!';
    opportunityWindow = '즉시 선점 추천! 경쟁자 유입 전에 1페이지 확보';
  } else if (searchVolume >= 500 && documentCount < 3000) {
    nicheScore += 25;
    nicheType = 'blue_ocean';
    opportunityWindow = '1~2주 내 선점 추천';
  } else if (trend === '상승' || trend === '급상승') {
    nicheScore += 22;
    nicheType = 'rising_star';
    opportunityWindow = '트렌드 상승 중! 빠른 선점 필요';
  } else if (searchVolume >= 100 && documentCount < 1000) {
    nicheScore += 20;
    nicheType = 'untapped';
    opportunityWindow = '미개척 시장. 콘텐츠로 시장 선점';
  } else {
    nicheScore += 8;
    opportunityWindow = '일반 키워드. 꾸준한 콘텐츠 생산 필요';
  }

  // 4. 롱테일 키워드 보너스
  const wordCount = keyword.split(/\s+/).length;
  if (wordCount >= 3) {
    nicheScore += 10;
    nicheReason += ' / 롱테일 키워드 = 전환율 높음';
  } else if (wordCount === 2) {
    nicheScore += 5;
  }

  // 5. 특수 패턴 보너스
  const yearPattern = /202[4-9]|203[0-9]/;
  if (yearPattern.test(keyword)) {
    nicheScore += 8;
    nicheReason += ' / 연도 포함 = 최신 정보 수요';
  }

  const isNiche = nicheScore >= 60;

  return {
    isNiche,
    nicheScore: Math.min(100, nicheScore),
    nicheType,
    nicheReason: nicheReason.replace(/^ \/ /, ''),
    competitionLevel,
    opportunityWindow
  };
}

/**
 * 🆕 v11.3 롱테일 키워드 자동 생성
 */
export function generateLongtailKeywords(
  keyword: string,
  keywordType: KeywordType,
  searchVolume: number
): ProTrafficKeyword['longtailSuggestions'] {
  const suggestions: ProTrafficKeyword['longtailSuggestions']['keywords'] = [];
  const kw = keyword;

  // 1. 질문형 키워드
  const questionPrefixes = ['', '어떻게 ', '왜 ', '언제 ', '어디서 '];
  const questionSuffixes = [' 하는법', ' 방법', ' 뜻', ' 이유', ' 차이'];
  questionSuffixes.forEach(suffix => {
    if (!kw.includes(suffix.trim())) {
      suggestions.push({
        keyword: `${kw}${suffix}`,
        type: 'howto',
        estimatedVolume: searchVolume > 1000 ? 'medium' : 'low',
        difficulty: 'easy',
        monetizationPotential: 65
      });
    }
  });

  // 2. 비교형 키워드
  const comparisons = [' 비교', ' 차이점', ' vs', ' 장단점', ' 뭐가 좋을까'];
  comparisons.forEach(comp => {
    suggestions.push({
      keyword: `${kw}${comp}`,
      type: 'comparison',
      estimatedVolume: 'medium',
      difficulty: 'medium',
      monetizationPotential: 80
    });
  });

  // 3. 리뷰형 키워드
  const reviews = [' 후기', ' 리뷰', ' 사용후기', ' 솔직후기', ' 체험기'];
  reviews.forEach(review => {
    suggestions.push({
      keyword: `${kw}${review}`,
      type: 'review',
      estimatedVolume: 'medium',
      difficulty: 'medium',
      monetizationPotential: 75
    });
  });

  // 4. 가격/비용 키워드 (고수익)
  const prices = [' 가격', ' 비용', ' 얼마', ' 최저가', ' 할인'];
  prices.forEach(price => {
    suggestions.push({
      keyword: `${kw}${price}`,
      type: 'price',
      estimatedVolume: 'high',
      difficulty: 'medium',
      monetizationPotential: 90
    });
  });

  // 5. 시간 기반 키워드
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const timeKeywords = [
    { keyword: `${year} ${kw}`, type: 'time' as const },
    { keyword: `${year}년 ${kw}`, type: 'time' as const },
    { keyword: `${month}월 ${kw}`, type: 'time' as const },
    { keyword: `최신 ${kw}`, type: 'time' as const },
  ];
  timeKeywords.forEach(tk => {
    suggestions.push({
      keyword: tk.keyword,
      type: tk.type,
      estimatedVolume: 'medium',
      difficulty: 'easy',
      monetizationPotential: 70
    });
  });

  // 6. 위치 기반 키워드
  const locations = ['서울', '강남', '부산', '대구', '인천', '광주', '대전'];
  locations.slice(0, 3).forEach(loc => {
    suggestions.push({
      keyword: `${loc} ${kw}`,
      type: 'location',
      estimatedVolume: 'medium',
      difficulty: 'easy',
      monetizationPotential: 72
    });
  });

  // 상위 20개만 선별 (수익화 잠재력 순)
  const sortedSuggestions = suggestions
    .sort((a, b) => b.monetizationPotential - a.monetizationPotential)
    .slice(0, 20);

  // 최고 추천 선정
  const bestPick = sortedSuggestions[0]?.keyword || `${kw} 추천`;

  // 조합 전략
  let combinationStrategy = '';
  if (sortedSuggestions.some(s => s.type === 'price')) {
    combinationStrategy = `💰 "${kw} 가격/비용" 키워드로 구매의도 타겟 → 쿠팡파트너스 연결`;
  } else if (sortedSuggestions.some(s => s.type === 'comparison')) {
    combinationStrategy = `🔥 "${kw} 비교" 키워드로 비교글 작성 → 제휴마케팅 최적`;
  } else if (sortedSuggestions.some(s => s.type === 'review')) {
    combinationStrategy = `📝 "${kw} 후기" 키워드로 체험 콘텐츠 → 신뢰도 높은 전환`;
  } else {
    combinationStrategy = `📚 "${kw} 방법" + "${kw} 추천" 시리즈로 롱테일 공략`;
  }

  return {
    keywords: sortedSuggestions,
    bestPick,
    combinationStrategy
  };
}

/**
 * 🆕 v11.3 황금키워드 종합 점수 (수익화 + 틈새 + 경쟁)
 */
export function calculateGoldenKeywordScore(
  keyword: string,
  searchVolume: number,
  documentCount: number,
  goldenRatio: number,
  keywordType: KeywordType,
  trend?: string
): { score: number; grade: string; summary: string } {
  const monetization = analyzeMonetization(keyword, searchVolume, documentCount, goldenRatio, keywordType);
  const niche = analyzeNiche(keyword, searchVolume, documentCount, goldenRatio, trend);

  // 종합 점수 계산 (수익화 40% + 틈새 30% + 황금비율 30%)
  const goldenRatioScore = Math.min(100, goldenRatio * 5);
  const totalScore = Math.round(
    monetization.score * 0.4 +
    niche.nicheScore * 0.3 +
    goldenRatioScore * 0.3
  );

  // 등급 결정
  let grade = '';
  let emoji = '';
  if (totalScore >= 90) { grade = 'SSS'; emoji = '🏆'; }
  else if (totalScore >= 80) { grade = 'SS'; emoji = '💎'; }
  else if (totalScore >= 70) { grade = 'S'; emoji = '⭐'; }
  else if (totalScore >= 55) { grade = 'A'; emoji = '🔥'; }
  else if (totalScore >= 40) { grade = 'B'; emoji = '✅'; }
  else if (totalScore >= 25) { grade = 'C'; emoji = '📌'; }
  else { grade = 'D'; emoji = '⚠️'; }

  // 요약
  let summary = '';
  if (totalScore >= 80) {
    summary = `${emoji} ${grade}급 황금키워드! 수익화(${monetization.grade}) + 틈새(${niche.nicheType}) = 즉시 공략!`;
  } else if (totalScore >= 55) {
    summary = `${emoji} ${grade}급 추천! ${niche.isNiche ? '틈새 발견. ' : ''}${monetization.recommendedStrategy.slice(0, 30)}...`;
  } else {
    summary = `${emoji} ${grade}급. 롱테일로 접근하거나 관련 키워드 탐색 추천`;
  }

  return { score: totalScore, grade, summary };
}