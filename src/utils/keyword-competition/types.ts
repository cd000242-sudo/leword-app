/**
 * 키워드 경쟁력 분석기 타입 정의 (끝판왕 버전)
 */

// 영향력 등급
export type AuthorityLevel = 'optimal' | 'semi-optimal' | 'normal' | 'low';

// 추천 등급
export type RecommendationLevel = 'green' | 'yellow' | 'orange' | 'red';

// 키워드 매칭 타입
export type KeywordMatchType = 'exact' | 'partial' | 'none';

// 블로그 지수
export interface BlogIndex {
  blogId: string;
  blogName: string;
  indexRank: number;           // 전체 순위
  indexPercentile: number;     // 상위 %
  category: string;
  isOptimized: boolean;        // 최적 블로그 여부
  isEstimated?: boolean;       // 추정값 여부 (true = 실제 블로그 영향력지수 조회 아님)
  rawData?: {                  // 실제 크롤링 데이터 (디버깅/검증용)
    totalVisitors: number;     // 총 방문자수
    postCount: number;         // 게시글 수
    neighborCount: number;     // 이웃 수
    score: number;             // 계산된 점수
  };
}

// 스마트블록 아이템 (검색 결과)
export interface SmartBlockItemData {
  title: string;
  blogUrl: string;
  blogId: string;
  authorName?: string;
  publishedDateStr?: string;
  publishedDaysAgo?: number;
}

// 스마트블록 데이터
export interface SmartBlockData {
  blockKeyword: string;
  items: SmartBlockItemData[];
}

// 인기글 아이템 데이터
export interface PopularItemData {
  rank: number;
  type: 'blog' | 'cafe' | 'post';
  title: string;
  authorName: string;
  blogUrl: string;
  blogId: string;
  publishedDateStr?: string;
  publishedDaysAgo?: number;
  // 🆕 본문 내용 분석용
  contentPreview?: string;        // 본문 미리보기 (200자)
  contentKeyPoints?: string[];    // 핵심 포인트 (충격적인 내용, 숫자, 사실 등)
}

// 네이버 검색 결과 레이아웃 정보
export interface SerpLayout {
  hasAd: boolean;
  hasShopping: boolean;
  hasKin: boolean;
  hasNews: boolean;
  hasVideo: boolean;
  adCount: number;
  blogRank: number;            // 블로그 섹션이 나타나는 순서 (1부터 시작)
  sections: string[];          // 섹션 순서 (예: ["AD", "SHOPPING", "BLOG", ...])
}

// 네이버 검색 결과
export interface NaverSearchResult {
  displayType: 'smartblock' | 'popular';
  keyword: string;
  smartBlocks?: SmartBlockData[];
  popularItems?: PopularItemData[];
  layout?: SerpLayout;
}

// 스마트블록 분석 아이템
export interface SmartBlockItem {
  rank: number;
  title: string;
  titleKeywordMatch: KeywordMatchType;
  matchScore: number;
  publishedDaysAgo: number;
  visitorCount: number | null;
  blogUrl: string;
  blogId: string;
  authorName: string;
  blogdexRank: number | null;
  blogdexPercentile: number | null;
  authorityLevel: AuthorityLevel;
}

// 스마트블록 분석 결과
export interface SmartBlockAnalysis {
  blockKeyword: string;
  items: SmartBlockItem[];
  blockScore: number;
}

// 진입 가능 여부
export type EntryDifficulty = 'easy' | 'possible' | 'hard' | 'very_hard';

// 인기글 분석 아이템
export interface PopularItemAnalysis {
  rank: number;
  type: 'blog' | 'cafe' | 'post' | 'influencer';
  authorName: string;
  blogdexRank: number | null;
  blogdexPercentile: number | null;
  authorityLevel: AuthorityLevel;
  title: string;
  titleKeywordMatch: KeywordMatchType;
  publishedDaysAgo: number;
  visitorCount: number | null;
  blogUrl: string;
  blogId: string;
  isRealData?: boolean;         // true = 실제 크롤링 데이터, false = 추정값
  entryDifficulty?: EntryDifficulty;  // 진입 난이도
  entryMessage?: string;              // 진입 가능 여부 메시지
}

// 점수 breakdown 항목
export interface ScoreBreakdownItem {
  score: number;
  max: number;
  details: string;
}

// 점수 breakdown
export interface ScoreBreakdown {
  freshness: ScoreBreakdownItem;
  relevance: ScoreBreakdownItem;
  authority: ScoreBreakdownItem;
  bonus?: ScoreBreakdownItem;
}

// 키워드 추천
export interface KeywordRecommendation {
  keyword: string;
  searchVolume: number;
  publishVolume: number;
  competitionScore: number;
  improvementRate: number;
  displayType: 'smartblock' | 'popular';
  reason: string;
  recommendation: 'green' | 'yellow';
}

// 체크리스트 아이템
export interface ChecklistItem {
  id: string;
  text: string;
  importance: 'must' | 'recommended' | 'optional';
  example?: string;
}

// 글 구조 섹션
export interface StructureSection {
  name: string;
  purpose: string;
  recommendedLength: number;
  keyPoints?: string[];
}

// 초보자 글쓰기 가이드
export interface BeginnerGuide {
  whyTop1: string;
  checklist: {
    title: string;
    items: ChecklistItem[];
  };
  recommendedStructure?: {
    title: string;
    sections: StructureSection[];
  };
  proTips?: string[];
}

// 최종 분석 결과
export interface KeywordAnalysisResult {
  keyword: string;
  searchVolume: number;
  publishVolume: number;
  supplyDemandRatio: number;
  displayType: 'smartblock' | 'popular';

  // 스마트블록 분석
  smartBlockAnalysis?: {
    blocks: SmartBlockAnalysis[];
    overallScore: number;
  };

  // 인기글 분석
  popularAnalysis?: {
    items: PopularItemAnalysis[];
    overallScore: number;
  };

  // 종합 점수
  competitionScore: number;
  recommendation: RecommendationLevel;
  recommendationText: string;

  // 점수 breakdown
  scoreBreakdown: ScoreBreakdown;

  // 연관 키워드 추천
  easierKeywords: KeywordRecommendation[];
  relatedSmartBlocks: string[];

  // 글쓰기 가이드
  guide?: BeginnerGuide;

  // 🆕 제목 전략 분석
  titleStrategy?: TitleStrategyAnalysis;

  // 🆕 띄어쓰기 버전 비교 (메인 키워드만)
  spaceVariant?: {
    withSpace: {
      keyword: string;
      searchVolume: number;
      publishVolume: number;
    };
    noSpace: {
      keyword: string;
      searchVolume: number;
      publishVolume: number;
    };
  };

  // 오류 메시지 (분석 실패 시)
  error?: string;
}

// 점수 가중치
export interface ScoreWeights {
  freshness: number;
  relevance: number;
  authority: number;
  supplyDemand: number;
}

// 키워드 랭킹 정보
export interface KeywordRanking {
  rank: number;
  blogId: string;
  blogName: string;
  indexRank: number;
  indexPercentile: number;
  postTitle: string;
  postUrl: string;
}

// 🆕 제목 분석 결과
export interface TitleAnalysis {
  originalTitle: string;
  coreKeyword: string;              // 핵심 키워드
  subKeywords: string[];            // 서브 키워드들
  titleStructure: string;           // 제목 구조 (예: "핵심+서브+수식어")
  firstChar: string;                // 첫 글자 (가나다순 분석용)
  charOrder: number;                // 가나다순 순서 (ㄱ=1, ㄴ=2...)
  strengthScore: number;            // 제목 강도 점수 (0-100)
  weakPoints: string[];             // 약점
  strongPoints: string[];           // 강점
  // 🆕 본문 기반 분석
  contentKeyPoints?: string[];      // 본문에서 추출한 핵심 포인트
  hookingElements?: string[];       // 후킹에 사용할 수 있는 요소
}

// 🆕 추천 제목
export interface RecommendedTitle {
  title: string;
  reason: string;                   // 추천 이유
  expectedRank: string;             // 예상 순위
  keywordPlacement: string;         // 키워드 배치 설명
  charAdvantage: string;            // 가나다순 이점
  score: number;                    // 추천 점수 (0-100)
}

// 🆕 제목 전략 분석
export interface TitleStrategyAnalysis {
  searchKeyword: string;            // 검색 키워드
  topTitles: TitleAnalysis[];       // 상위 노출 제목 분석
  commonPatterns: string[];         // 공통 패턴
  missingKeywords: string[];        // 상위 글에 없는 키워드 (기회!)
  recommendedTitles: RecommendedTitle[];  // 추천 제목들
  ganadaStrategy: {                 // 가나다순 전략
    currentFirstChars: string[];    // 현재 상위 글 첫 글자들
    recommendedFirstChar: string;   // 추천 첫 글자
    reason: string;
  };
}
