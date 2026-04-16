export interface ProfitKeywordData {
  keyword: string;
  searchVolume: number;
  documentCount: number;
  estimatedCPC: number;
  purchaseIntentScore: number;
  competitionLevel: number;
  freshnessOpportunity: number;
  profitGoldenRatio: number;
  estimatedDailyRevenue: number;
  estimatedMonthlyRevenue: number;
  grade: 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' | 'D';
  gradeReason: string;
  isRealBlueOcean: boolean;
  blueOceanReason: string;
  strategy: {
    approach: string;
    monetization: string;
    timing: string;
    titleSuggestion: string;
  };
  cvi?: number;                // Commercial Value Index (MDP v2.0)
  difficultyScore?: number;    // SERP Difficulty (MDP v2.0)
  hasSmartBlock?: boolean;
  hasInfluencer?: boolean;
  isCommercial?: boolean;
  safetyLevel?: 'safe' | 'caution' | 'danger';
  safetyReason?: string;
}

export const CATEGORY_CPC_DATABASE: Record<string, { min: number; max: number; avg: number }> = {
  finance: { min: 1500, max: 6000, avg: 3000 },
  insurance: { min: 1200, max: 5000, avg: 2500 },
  loan: { min: 2000, max: 8000, avg: 4000 },
  realestate: { min: 800, max: 3000, avg: 1500 },
  legal: { min: 1000, max: 4000, avg: 2000 },
  medical: { min: 500, max: 1500, avg: 800 },
  dental: { min: 600, max: 1800, avg: 1000 },
  plastic: { min: 700, max: 2000, avg: 1100 },

  health: { min: 300, max: 800, avg: 500 },
  supplement: { min: 400, max: 1000, avg: 600 },
  diet: { min: 350, max: 900, avg: 550 },
  wedding: { min: 350, max: 900, avg: 550 },
  interior: { min: 300, max: 700, avg: 450 },
  moving: { min: 250, max: 600, avg: 380 },
  appliance: { min: 200, max: 500, avg: 320 },
  laptop: { min: 250, max: 600, avg: 380 },
  smartphone: { min: 200, max: 500, avg: 320 },
  it: { min: 200, max: 500, avg: 320 },
  tech: { min: 200, max: 500, avg: 320 },
  education: { min: 300, max: 800, avg: 500 },
  certificate: { min: 350, max: 900, avg: 550 },

  travel: { min: 150, max: 400, avg: 250 },
  hotel: { min: 200, max: 500, avg: 300 },
  flight: { min: 200, max: 450, avg: 280 },
  food: { min: 100, max: 300, avg: 180 },
  restaurant: { min: 100, max: 300, avg: 180 },
  cafe: { min: 80, max: 250, avg: 150 },
  beauty: { min: 150, max: 400, avg: 250 },
  skincare: { min: 200, max: 500, avg: 300 },
  cosmetic: { min: 150, max: 400, avg: 250 },
  fashion: { min: 100, max: 300, avg: 180 },
  shopping: { min: 100, max: 300, avg: 180 },
  parenting: { min: 150, max: 400, avg: 250 },
  baby: { min: 200, max: 500, avg: 300 },
  pet: { min: 150, max: 350, avg: 220 },
  life: { min: 100, max: 300, avg: 180 },
  life_tips: { min: 100, max: 300, avg: 180 },

  game: { min: 50, max: 200, avg: 100 },
  movie: { min: 50, max: 150, avg: 90 },
  drama: { min: 50, max: 150, avg: 90 },
  music: { min: 40, max: 120, avg: 70 },
  celeb: { min: 30, max: 100, avg: 50 },
  entertainment: { min: 30, max: 100, avg: 50 },
  recipe: { min: 60, max: 180, avg: 100 },
  cooking: { min: 60, max: 180, avg: 100 },

  business: { min: 400, max: 1500, avg: 800 },
  sports: { min: 60, max: 200, avg: 120 },
  review: { min: 120, max: 350, avg: 200 },

  all: { min: 100, max: 300, avg: 180 },
  default: { min: 80, max: 200, avg: 120 }
};

export const PURCHASE_INTENT_PATTERNS = [
  '가격', '비용', '얼마', '최저가', '할인', '쿠폰', '세일', '특가',
  '무료배송', '사은품', '프로모션',
  '구매', '구입', '주문', '결제', '신청', '가입', '등록',
  '비교', 'vs', '차이', '뭐가', '어떤게', '추천', '순위', '랭킹',
  'top', '베스트', '인기', '1위',
  '어디서', '파는곳', '구매처', '판매처', '온라인', '오프라인',
  '설치', '시공', '견적', '업체',
  '대신', '대체품', '저렴한', '가성비',
  '나이별', '연령별', '직업별', '연차별'
];

export const COMPARISON_PATTERNS = [
  '후기', '리뷰', '사용기', '체험기', '솔직후기', '실사용',
  '한달', '6개월', '1년',
  '장단점', '장점', '단점', '문제점', '아쉬운점', '좋은점',
  '차이점', '다른점', '비슷한', '대체', '대안',
  '고민', '선택', '결정',
  '후회', '실패', '망한', '주의'
];

export const INFO_SEARCH_PATTERNS = [
  '방법', '하는법', '하는방법', '만드는법', '만들기',
  '사용법', '사용방법', '이용방법', '활용법',
  '뜻', '의미', '정의', '개념', '원리', '이유',
  '종류', '유형', '분류', '카테고리',
  '효능', '효과', '부작용', '주의사항', '금기',
  '성분', '원료', '재료',
  '기간', '시간', '언제', '얼마나', '며칠',
  '조건', '자격', '기준', '요건', '필요',
  '서류', '절차', '과정', '단계',
  '신청방법', '지원금', '혜택', '보조금', '지원'
];

// ==================== 키워드 안전성 판정 ====================

// 🚫 위험: 네이버 저품질/제재, 광고법 위반, 불법 콘텐츠
const DANGER_PATTERNS: Array<{ patterns: string[]; reason: string }> = [
  {
    patterns: ['대출', '사채', '급전', '소액대출', '무직자대출', '카드론', '현금서비스'],
    reason: '🚫 금융 광고법 위반 위험 — 대출/금융 키워드는 등록 금융사만 광고 가능',
  },
  {
    patterns: ['채무', '파산', '회생', '개인회생', '면책'],
    reason: '🚫 채무/파산 관련 — 법률 전문가 콘텐츠만 노출, 일반 블로그 저품질 위험',
  },
  {
    patterns: ['시술', '수술', '주사', '라식', '라섹', '성형', '지방흡입', '임플란트', '필러', '보톡스'],
    reason: '🚫 의료법 위반 — 의료 시술 광고는 의료기관만 가능, 블로그 제재 대상',
  },
  {
    patterns: ['탈모치료', '탈모약', '탈모병원', '다이어트약', '살빠지는약', '지방분해', '식욕억제제'],
    reason: '🚫 의약품 광고 — 전문의약품 홍보는 약사법 위반, 네이버 제재 대상',
  },
  {
    patterns: ['도박', '카지노', '토토', '배팅', '슬롯', '바카라', '포커사이트'],
    reason: '🚫 불법 도박 — 즉시 제재 + 블로그 영구정지 위험',
  },
  {
    patterns: ['불법', '무허가', '탈세', '위조', '변조', '사기'],
    reason: '🚫 불법 관련 — 네이버 정책 위반으로 블로그 제재',
  },
];

// ⚠️ 주의: YMYL(전문성 필요), 높은 경쟁, 저품질 위험 가능성
const CAUTION_PATTERNS: Array<{ patterns: string[]; reason: string }> = [
  {
    patterns: ['보험', '실비', '암보험', '자동차보험', '종신보험', '태아보험'],
    reason: '⚠️ 보험 YMYL — 전문성 없는 글은 저품질 위험, 보험사 공식 블로그와 경쟁',
  },
  {
    patterns: ['주식', '투자', '코인', '비트코인', '재테크', '펀드', 'etf'],
    reason: '⚠️ 투자 YMYL — 금융투자 조언은 전문 자격 필요, 부정확한 정보 시 법적 문제',
  },
  {
    patterns: ['부동산', '청약', '분양', '전세', '월세'],
    reason: '⚠️ 부동산 YMYL — 부동산 정보는 전문성 요구, 오정보 시 신뢰도 하락',
  },
  {
    patterns: ['병원', '치과', '피부과', '한의원', '비뇨기과'],
    reason: '⚠️ 병원 추천 — 의료기관 관련 글은 의료법 주의, 스마트블록에 밀림',
  },
  {
    patterns: ['다이어트', '살빼기', '단식'],
    reason: '⚠️ 다이어트 — 건강 관련 YMYL, 허위/과장 시 저품질 위험',
  },
  {
    patterns: ['약', '영양제', '비타민', '프로바이오틱스'],
    reason: '⚠️ 건강기능식품 — 효능 과장 시 광고법 위반, 근거 있는 정보만 작성',
  },
  {
    patterns: ['세금', '연말정산', '종합소득세', '부가세', '양도세'],
    reason: '⚠️ 세금/세무 — 세법은 매년 변경, 부정확한 정보 시 신뢰 하락',
  },
  {
    patterns: ['이혼', '소송', '고소', '합의금', '위자료', '변호사'],
    reason: '⚠️ 법률 YMYL — 법률 조언은 전문 자격 필요, 정보 오류 시 피해 발생',
  },
];

// 🛡️ 면제 패턴: 위험 키워드 포함이지만 실제로 안전한 롱테일
const EXEMPT_PATTERNS: string[] = [
  '대출이자계산기', '대출금리비교', '대출상환계산', '대출조건확인',
  '보험료계산', '보험비교사이트', '보험해지방법',
  '다이어트식단', '다이어트운동', '다이어트레시피', '다이어트도시락',
  '병원예약방법', '병원비환급', '병원진료비',
  '주식용어', '주식초보', '주식계좌개설',
  '세금계산기', '연말정산하는법', '종합소득세신고방법',
];

export type SafetyLevel = 'safe' | 'caution' | 'danger';

export function evaluateKeywordSafety(keyword: string): { level: SafetyLevel; reason: string } {
  const kw = keyword.toLowerCase();
  // 공백 제거 버전: "다이어트 식단" → "다이어트식단"으로 면제 패턴 매칭
  const kwNoSpace = kw.replace(/\s+/g, '');

  // 면제 패턴 우선 체크: 롱테일로 구체화된 키워드는 안전
  if (EXEMPT_PATTERNS.some(p => kwNoSpace.includes(p))) {
    return { level: 'safe', reason: '✅ 안전 — 정보성 롱테일 키워드' };
  }

  // 위험 체크
  for (const danger of DANGER_PATTERNS) {
    if (danger.patterns.some(p => kw.includes(p))) {
      return { level: 'danger', reason: danger.reason };
    }
  }

  // 주의 체크
  for (const caution of CAUTION_PATTERNS) {
    if (caution.patterns.some(p => kw.includes(p))) {
      return { level: 'caution', reason: caution.reason };
    }
  }

  return { level: 'safe', reason: '✅ 안전' };
}

// 계절성 감지: 키워드에 시즌 패턴이 있으면 현재 월과 비교
const SEASON_PATTERNS: Array<{ patterns: string[]; peakMonths: number[] }> = [
  { patterns: ['벚꽃', '꽃구경', '봄나들이', '새학기', '입학'], peakMonths: [3, 4] },
  { patterns: ['여름', '휴가', '물놀이', '에어컨', '선풍기', '제습기', '장마', '수영', '워터파크'], peakMonths: [6, 7, 8] },
  { patterns: ['단풍', '가을여행', '김장', '추석', '한가위'], peakMonths: [9, 10, 11] },
  { patterns: ['크리스마스', '연말', '스키', '보일러', '난방', '겨울', '패딩', '핫초코'], peakMonths: [11, 12, 1, 2] },
  { patterns: ['발렌타인', '화이트데이'], peakMonths: [2, 3] },
  { patterns: ['어버이날', '스승의날', '어린이날'], peakMonths: [5] },
  { patterns: ['수능', '입시', '대학입학'], peakMonths: [9, 10, 11] },
  { patterns: ['블프', '블랙프라이데이', '사이버먼데이'], peakMonths: [11] },
  { patterns: ['설날', '설연휴', '구정'], peakMonths: [1, 2] },
  { patterns: ['장마철', '우기'], peakMonths: [6, 7] },
];

export function detectSeasonality(keyword: string): { isSeasonal: boolean; isInSeason: boolean; peakMonths: number[] } {
  const kw = keyword.toLowerCase();
  const currentMonth = new Date().getMonth() + 1;

  for (const season of SEASON_PATTERNS) {
    if (season.patterns.some(p => kw.includes(p))) {
      return {
        isSeasonal: true,
        isInSeason: season.peakMonths.includes(currentMonth),
        peakMonths: season.peakMonths,
      };
    }
  }
  return { isSeasonal: false, isInSeason: true, peakMonths: [] };
}

// 카테고리별 구글 트래픽 비율: 네이버 검색량 대비 구글 유입 추정치
// 애드센스 수익 = 구글 트래픽 기반이므로, 네이버 검색량만으로 수익 계산하면 과대평가됨
const GOOGLE_TRAFFIC_RATIO: Record<string, number> = {
  it: 0.55, tech: 0.55, game: 0.45, laptop: 0.50, smartphone: 0.45,
  education: 0.35, certificate: 0.30, business: 0.35,
  finance: 0.30, insurance: 0.25, loan: 0.25, realestate: 0.25, legal: 0.25,
  medical: 0.30, dental: 0.25, plastic: 0.20, health: 0.25, supplement: 0.20,
  travel: 0.25, hotel: 0.30, flight: 0.35,
  food: 0.15, restaurant: 0.10, cafe: 0.10,
  beauty: 0.20, skincare: 0.20, cosmetic: 0.20, fashion: 0.20, shopping: 0.25,
  pet: 0.20, parenting: 0.20, baby: 0.20,
  interior: 0.25, moving: 0.20, wedding: 0.15, appliance: 0.30,
  celeb: 0.10, entertainment: 0.10, movie: 0.15, drama: 0.15, music: 0.15, sports: 0.20,
  recipe: 0.15, cooking: 0.15, diet: 0.20,
  life: 0.15, life_tips: 0.15, review: 0.25,
  all: 0.25, default: 0.25,
};

// 카테고리별 구매의도 가중치: 고관여 카테고리는 구매 패턴 매칭 시 더 높은 점수
const CATEGORY_INTENT_WEIGHT: Record<string, number> = {
  loan: 1.6, finance: 1.5, insurance: 1.5, realestate: 1.4, legal: 1.4,
  medical: 1.3, dental: 1.3, plastic: 1.3,
  interior: 1.2, moving: 1.2, wedding: 1.2, education: 1.2,
  appliance: 1.1, laptop: 1.1, supplement: 1.1,
  default: 1.0,
};

export function estimateCPC(keyword: string, category: string): number {
  const kw = String(keyword || '').toLowerCase();
  let baseCPC = CATEGORY_CPC_DATABASE[category]?.avg ?? CATEGORY_CPC_DATABASE.default.avg;

  const hasPurchaseIntent = PURCHASE_INTENT_PATTERNS.some(p => kw.includes(p));
  if (hasPurchaseIntent) baseCPC *= 1.4;

  const hasComparison = COMPARISON_PATTERNS.some(p => kw.includes(p));
  if (hasComparison) baseCPC *= 1.2;

  const hasBrandPattern = /[A-Z]{2,}|[가-힣]+[0-9]+/.test(keyword);
  if (hasBrandPattern) baseCPC *= 1.15;

  return Math.round(baseCPC);
}

export function calculatePurchaseIntent(keyword: string, category?: string): number {
  const kw = String(keyword || '').toLowerCase();
  let score = 30;

  const purchaseMatches = PURCHASE_INTENT_PATTERNS.filter(p => kw.includes(p));
  const comparisonMatches = COMPARISON_PATTERNS.filter(p => kw.includes(p));
  const infoMatches = INFO_SEARCH_PATTERNS.filter(p => kw.includes(p));

  // 체감 감소: 첫 매칭 15점, 추가 매칭마다 8점 (단순 카운팅 x 15 대신)
  if (purchaseMatches.length > 0) {
    score += 15 + (purchaseMatches.length - 1) * 8;
  }
  if (comparisonMatches.length > 0) {
    score += 10 + (comparisonMatches.length - 1) * 5;
  }
  if (infoMatches.length > 0) {
    score += 5 + (infoMatches.length - 1) * 3;
  }

  // 콤보 보너스: 구매 + 비교 동시 매칭 → 전환 직전 단계 ("추천 후기", "비교 가격")
  if (purchaseMatches.length > 0 && comparisonMatches.length > 0) {
    score += 12;
  }
  // 구매 + 정보 콤보 → 구매 전 리서치 ("신청 방법", "가격 비교 방법")
  if (purchaseMatches.length > 0 && infoMatches.length > 0) {
    score += 8;
  }

  // 구조 분석: 3단어+ 롱테일에 구매 패턴 → 구체적 검색 의도 (전환율 높음)
  const words = kw.split(/\s+/).filter(Boolean);
  if (words.length >= 3 && purchaseMatches.length > 0) {
    score += 10;
  } else if (words.length >= 3) {
    score += 5;
  }
  if (words.length >= 4) score += 3;

  // 부정 시그널: 정보 패턴만 있고 구매/비교 패턴 없으면 → 정보 탐색용, 전환 가치 낮음
  if (infoMatches.length > 0 && purchaseMatches.length === 0 && comparisonMatches.length === 0) {
    score = Math.max(20, score - 10);
  }

  // 카테고리별 구매의도 가중치: 금융 "비교"는 쇼핑 "추천"보다 전환 가치가 높음
  if (category && purchaseMatches.length > 0) {
    const catWeight = CATEGORY_INTENT_WEIGHT[category] ?? CATEGORY_INTENT_WEIGHT.default;
    score = 30 + Math.round((score - 30) * catWeight);
  }

  return Math.min(100, score);
}

export function calculateCompetitionLevel(documentCount: number, searchVolume: number): number {
  let docScore: number;
  if (documentCount <= 100) docScore = 1;
  else if (documentCount <= 500) docScore = 2;
  else if (documentCount <= 1000) docScore = 3;
  else if (documentCount <= 3000) docScore = 4;
  else if (documentCount <= 5000) docScore = 5;
  else if (documentCount <= 10000) docScore = 6;
  else if (documentCount <= 30000) docScore = 7;
  else if (documentCount <= 50000) docScore = 8;
  else if (documentCount <= 100000) docScore = 9;
  else docScore = 10;

  const ratio = searchVolume / Math.max(documentCount, 1);
  if (ratio >= 10) docScore = Math.max(1, docScore - 2);
  else if (ratio >= 5) docScore = Math.max(1, docScore - 1);
  else if (ratio < 0.5) docScore = Math.min(10, docScore + 1);

  return docScore;
}

export function calculateFreshnessOpportunity(avgTopPostAge?: number, keyword?: string, category?: string): number {
  // 실측 데이터가 있으면 그대로 사용
  if (avgTopPostAge) {
    if (avgTopPostAge >= 365) return 1.8;
    if (avgTopPostAge >= 180) return 1.5;
    if (avgTopPostAge >= 90) return 1.3;
    if (avgTopPostAge >= 30) return 1.1;
    return 1.0;
  }

  // 실측 데이터 없으면 키워드/카테고리 패턴으로 추정
  if (keyword) {
    const kw = keyword.toLowerCase();

    // 에버그린 패턴: "방법", "뜻" 류는 오래된 글이 상위에 머무는 경향 → 신선한 글로 밀어낼 기회
    const evergreenPatterns = ['방법', '하는법', '하는방법', '뜻', '의미', '정의', '개념', '원리', '만드는법'];
    if (evergreenPatterns.some(p => kw.includes(p))) return 1.4;

    // 정보/절차 패턴: "신청", "조건" 류는 정책 변경 시 오래된 글이 부정확해짐
    const procedurePatterns = ['신청', '조건', '자격', '절차', '서류', '지원금', '혜택'];
    if (procedurePatterns.some(p => kw.includes(p))) return 1.3;

    // 최신 리뷰 패턴: "후기", "리뷰" 류는 이미 신선한 글이 계속 올라옴 → 기회 적음
    const freshPatterns = ['후기', '리뷰', '사용기', '체험기', '최신', '신상'];
    if (freshPatterns.some(p => kw.includes(p))) return 1.0;
  }

  // 카테고리 기반 추정: 느린 카테고리일수록 오래된 글이 상위 유지 → 기회 큼
  if (category) {
    const slowCategories = ['recipe', 'cooking', 'life_tips', 'life'];
    if (slowCategories.includes(category)) return 1.3;

    const fastCategories = ['it', 'tech', 'smartphone', 'laptop', 'game', 'celeb', 'entertainment'];
    if (fastCategories.includes(category)) return 1.1;
  }

  return 1.15;
}

// titleSuggestion은 outline-generator의 strategicTitle로 대체됨
// 인터페이스 호환성을 위해 빈 문자열 반환
function generateTitleSuggestion(_keyword: string, _purchaseIntent: number): string {
  return '';
}

interface StrategyContext {
  keyword: string;
  grade: string;
  cpc: number;
  purchaseIntent: number;
  searchVolume: number;
  documentCount: number;
  competitionLevel: number;
  profitAxis: number;
  entryAxis: number;
}

function generateStrategy(ctx: StrategyContext): ProfitKeywordData['strategy'] {
  const { grade, cpc, purchaseIntent, searchVolume, documentCount, competitionLevel, profitAxis, entryAxis } = ctx;
  const year = new Date().getFullYear();

  // 접근 전략: 등급 + 진입/수익 축 조합으로 구체적 조언
  let approach: string;
  if (grade === 'SSS') {
    approach = `🚀 즉시 작성! 문서 ${documentCount}개뿐 — 2000자+ 심층 콘텐츠로 1페이지 선점`;
  } else if (grade === 'SS') {
    approach = competitionLevel <= 5
      ? `🚀 고수익 + 경쟁 적음 — 2000자+ 비교/분석 글로 빠르게 선점`
      : `🚀 광고 단가 높음 — 경쟁자(${documentCount}개) 분석 후 차별화 포인트 잡고 작성`;
  } else if (grade === 'S') {
    approach = `✍️ 경쟁자 적어서 진입 쉬움 — 1500자+ 정보성 글로 빠르게 상위 확보`;
  } else if (grade === 'A') {
    approach = profitAxis >= entryAxis
      ? `✍️ 수익 잠재력 있음 — "${ctx.keyword} ${year}" 등 롱테일로 경쟁 낮춰서 접근`
      : `✍️ 진입 가능하나 수익 보통 — 내부링크용 트래픽 글로 활용`;
  } else if (grade === 'B') {
    approach = searchVolume >= 1000
      ? `🔍 검색량은 충분 — "초보자", "${year}", "비교" 등 붙여서 틈새 공략`
      : `🔍 검색량·경쟁 모두 애매 — 상위 키워드의 보조 글로 활용`;
  } else {
    approach = '⏸️ 투자 대비 효율 낮음 — 더 좋은 키워드 찾기 추천';
  }

  // 수익화: CPC + 구매의도 + 검색량 종합
  let monetization: string;
  if (cpc >= 500 && purchaseIntent >= 60) {
    monetization = '💰 쿠팡파트너스 + 애드센스 동시 운영 — 상품 비교표 + 광고 배치 최적화';
  } else if (cpc >= 500) {
    monetization = '📊 애드센스 집중 — 광고 단가 높으니 본문 중간·하단 광고 배치 필수';
  } else if (purchaseIntent >= 60) {
    monetization = '🛒 쿠팡파트너스 집중 — TOP 3~5 비교 형식으로 클릭 유도';
  } else if (searchVolume >= 3000) {
    monetization = '📊 트래픽형 애드센스 — 방문자 수로 승부, 광고 위치 최적화';
  } else if (purchaseIntent >= 40) {
    monetization = '🛒 쿠팡파트너스 위주 — 추천/후기 형식으로 전환율 높이기';
  } else {
    monetization = '📝 트래픽 확보 우선 — 이후 관련 고수익 키워드로 내부링크 연결';
  }

  // 타이밍: 경쟁도 기반 현실적 예측
  let timing: string;
  if (competitionLevel <= 3) {
    timing = '⚡ 발행 후 1~2주 내 상위노출 기대 (경쟁 낮음)';
  } else if (competitionLevel <= 5) {
    timing = '📅 발행 후 2~4주 — 꾸준한 유입으로 순위 상승 기대';
  } else if (competitionLevel <= 7) {
    timing = '📅 1~2개월 — 품질 + 체류시간으로 서서히 올라감';
  } else {
    timing = '🗓️ 장기전 — 상위 블로그 분석 후 시리즈 글로 도메인 권위 확보';
  }

  return { approach, monetization, timing, titleSuggestion: '' };
}

export function calculateProfitGoldenRatio(
  keyword: string,
  searchVolume: number,
  documentCount: number,
  category: string,
  options?: {
    avgTopPostAge?: number;
    compIdx?: number | null;
    hasSmartBlock?: boolean;
    hasInfluencer?: boolean;
    difficultyScore?: number;
    realCpc?: number | null;     // 네이버 검색광고 API 실시간 CPC (monthlyAveCpc)
  }
): ProfitKeywordData {
  const avgTopPostAge = options?.avgTopPostAge;
  const compIdx = options?.compIdx;
  const hasSmartBlock = options?.hasSmartBlock;
  const hasInfluencer = options?.hasInfluencer;
  const difficultyScore = options?.difficultyScore;
  const realCpc = options?.realCpc;

  // 실시간 CPC가 있으면 우선 사용, 없으면 정적 DB 추정
  const estimatedCPC = (realCpc && realCpc > 0) ? realCpc : estimateCPC(keyword, category);

  // MDP v2.0: CVI (Commercial Value Index) 계산
  // 공식: CVI = (Intent Weight * CPC Index * CTR Base)
  // Intent Score가 높고, 광고 단가가 높을수록 CVI 상승
  const purchaseIntentScore = calculatePurchaseIntent(keyword, category);
  const intentWeight = 0.5 + (purchaseIntentScore / 100) * 1.5;
  const effectiveCompIdx = compIdx ?? 0.7;
  const cvi = Number((intentWeight * (estimatedCPC / 500) * effectiveCompIdx).toFixed(2));

  const competitionLevel = difficultyScore !== undefined
    ? Math.round(difficultyScore)
    : calculateCompetitionLevel(documentCount, searchVolume);

  const freshnessOpportunity = calculateFreshnessOpportunity(avgTopPostAge, keyword, category);

  const cpcWeight = Math.min(3, (estimatedCPC / 200) * effectiveCompIdx);

  const profitGoldenRatio =
    (searchVolume * cpcWeight * intentWeight * freshnessOpportunity)
    / (Math.max(1, competitionLevel) * 100);

  // 현실 기반 CTR: 네이버 블로그 1위 기준 ~15%, 경쟁도별 감소
  const clickThroughRate = Math.max(0.02, 0.15 - (competitionLevel * 0.013));
  // 실제 블로그 광고 클릭률 1~2% 범위
  const adClickRate = 0.015;
  // 전체 방문자 (네이버 + 구글)
  const dailyVisitors = Math.round((searchVolume / 30) * clickThroughRate);
  // 애드센스 수익은 구글 트래픽에서만 발생 — 카테고리별 구글 비율 적용
  const googleRatio = GOOGLE_TRAFFIC_RATIO[category] ?? GOOGLE_TRAFFIC_RATIO.default;
  const googleDailyVisitors = Math.round(dailyVisitors * googleRatio);
  const estimatedDailyRevenue = Math.round(googleDailyVisitors * adClickRate * estimatedCPC);
  const estimatedMonthlyRevenue = estimatedDailyRevenue * 30;

  let grade: ProfitKeywordData['grade'];
  let gradeReason: string;

  // 키워드 안전성 판정
  const safety = evaluateKeywordSafety(keyword);

  const rawRatio = searchVolume / Math.max(1, documentCount);
  const isCandidateForGolden = documentCount <= 10000 && rawRatio >= 1.5;

  // 계절성 감지: 비시즌 키워드 경고
  const seasonality = detectSeasonality(keyword);

  // SERP 환경 페널티: 스마트블록/인플루언서가 있으면 블로그 노출 순위가 밀림
  const serpPenalty = (hasSmartBlock ? 20 : 0) + (hasInfluencer ? 15 : 0);

  // 2축 스코어링: 수익축(얼마 버나) vs 진입축(얼마나 쉬우나)
  // 구매의도 없는 정보전용 키워드는 CPC가 높아도 실제 광고 클릭이 적음 → profitAxis 할인
  const intentDiscount = purchaseIntentScore < 35 ? 0.65 : 1.0;
  const profitAxis = Math.min(100,
    ((estimatedCPC / 15) +
    (purchaseIntentScore * 0.3) +
    Math.min(20, estimatedMonthlyRevenue / 300)) * intentDiscount
  );
  const entryAxis = Math.min(100, Math.max(0,
    (11 - competitionLevel) * 9 +
    (rawRatio >= 3 ? 15 : rawRatio >= 1.5 ? 8 : 0) -
    (documentCount > 50000 ? 15 : 0) -
    serpPenalty
  ));

  // 수익 표시: 소액은 "수익 미미"로 표시하여 도구 신뢰 유지 (구글 비율 적용 후 기준)
  const formatRevenue = (v: number): string => {
    if (v < 1000) return '수익 미미';
    if (v >= 10000) return `월 ${Math.round(v / 10000)}만원`;
    return `월 ${Math.round(v / 1000)}천원`;
  };

  // SERP 환경 경고 태그
  const serpWarning = hasSmartBlock && hasInfluencer
    ? ' ⚠️스마트블록+인플루언서'
    : hasSmartBlock ? ' ⚠️스마트블록' : hasInfluencer ? ' ⚠️인플루언서' : '';

  // 등급 수익 임계값: 구글 트래픽 비율 적용 후 현실 기준
  if (profitGoldenRatio >= 50 && estimatedMonthlyRevenue >= 3000 && isCandidateForGolden) {
    grade = 'SSS';
    gradeReason = `🏆 경쟁자 ${documentCount}개뿐인데 검색 ${searchVolume}회 — 지금 잡으면 1페이지 가능 (${formatRevenue(estimatedMonthlyRevenue)})${serpWarning}`;
  } else if (profitAxis >= 55 && profitGoldenRatio >= 20 && (estimatedMonthlyRevenue >= 1500 || (profitAxis >= 65 && estimatedMonthlyRevenue >= 600))) {
    // SS: profitAxis 충분히 높으면(65+) MR 기준 완화 — 구글비율 낮은 고CPC 키워드 구제
    grade = 'SS';
    gradeReason = `💎 광고 단가 높은 키워드 — 글 하나로 ${formatRevenue(estimatedMonthlyRevenue)} 기대${serpWarning}`;
  } else if (entryAxis >= 60 && profitGoldenRatio >= 10 && (estimatedMonthlyRevenue >= 500 || (entryAxis >= 80 && estimatedMonthlyRevenue >= 200))) {
    grade = 'S';
    gradeReason = `⭐ 문서 ${documentCount}개로 경쟁 약함 — 초보 블로그도 상위노출 가능 (${formatRevenue(estimatedMonthlyRevenue)})${serpWarning}`;
  } else if ((profitAxis >= 35 || entryAxis >= 45) && entryAxis >= 15 && estimatedMonthlyRevenue >= 200) {
    grade = 'A';
    gradeReason = profitAxis >= entryAxis
      ? `✅ 수익은 나오지만 경쟁자 ${documentCount}개 — 차별화된 글이 필요${serpWarning}`
      : `✅ 진입 쉬우나 광고 단가 낮음 — 트래픽 확보용${serpWarning}`;
  } else if (profitGoldenRatio >= 4) {
    grade = 'B';
    gradeReason = `📌 이대로는 애매함 — "${keyword} 추천" 등 롱테일로 확장 필요${serpWarning}`;
  } else if (profitGoldenRatio >= 2) {
    grade = 'C';
    gradeReason = `⚠️ 문서 ${documentCount}개 대비 검색 ${searchVolume}회 — 투자 대비 효율 낮음${serpWarning}`;
  } else {
    grade = 'D';
    gradeReason = `❌ 검색량 적고 경쟁 많음 — 다른 키워드 추천${serpWarning}`;
  }

  // 계절성 경고: 비시즌 키워드면 등급 관계없이 경고 추가
  if (seasonality.isSeasonal && !seasonality.isInSeason) {
    const monthNames = seasonality.peakMonths.map(m => `${m}월`).join('/');
    gradeReason += ` 🗓️시즌: ${monthNames}`;
    const gradeOrder: ProfitKeywordData['grade'][] = ['SSS', 'SS', 'S', 'A', 'B', 'C', 'D'];
    const currentIdx = gradeOrder.indexOf(grade);
    if (currentIdx < gradeOrder.length - 1) {
      grade = gradeOrder[currentIdx + 1];
    }
  }

  // 안전성 등급 반영: danger → 강제 D, caution → 최대 B로 제한
  if (safety.level === 'danger') {
    grade = 'D';
    gradeReason = `${safety.reason}`;
  } else if (safety.level === 'caution') {
    const gradeOrder: ProfitKeywordData['grade'][] = ['SSS', 'SS', 'S', 'A', 'B', 'C', 'D'];
    const maxCautionIdx = gradeOrder.indexOf('B');
    const currentIdx = gradeOrder.indexOf(grade);
    if (currentIdx < maxCautionIdx) {
      grade = 'B';
      gradeReason = `${safety.reason} | 원래 ${gradeOrder[currentIdx]}급이나 주의 키워드로 B 제한`;
    } else {
      gradeReason += ` | ${safety.reason}`;
    }
  }

  const isRealBlueOcean = (
    searchVolume >= 300 &&
    documentCount <= 2000 &&
    profitGoldenRatio >= 10 &&
    estimatedCPC >= 100 &&
    competitionLevel <= 4
  );

  let blueOceanReason: string;
  if (isRealBlueOcean) {
    blueOceanReason = `🌊 진짜 블루오션! 검색량 ${searchVolume}, 문서 ${documentCount}개, CPC ${estimatedCPC}원`;
  } else if (documentCount <= 1000) {
    blueOceanReason = `📘 문서수 적음 (${documentCount}개). 검색량 확인 필요`;
  } else if (searchVolume >= 500 && documentCount <= 5000) {
    blueOceanReason = '📗 잠재 블루오션. 상위노출 가능성 있음';
  } else {
    blueOceanReason = '📕 경쟁 시장. 차별화 전략 필요';
  }

  const strategy = generateStrategy({
    keyword, grade, cpc: estimatedCPC, purchaseIntent: purchaseIntentScore,
    searchVolume, documentCount, competitionLevel, profitAxis, entryAxis,
  });

  return {
    keyword,
    searchVolume,
    documentCount,
    estimatedCPC,
    purchaseIntentScore,
    competitionLevel,
    freshnessOpportunity,
    profitGoldenRatio: Math.round(profitGoldenRatio * 100) / 100,
    estimatedDailyRevenue,
    estimatedMonthlyRevenue,
    grade,
    gradeReason,
    isRealBlueOcean,
    blueOceanReason,
    strategy,
    cvi,
    difficultyScore: difficultyScore ?? competitionLevel,
    hasSmartBlock,
    hasInfluencer,
    isCommercial: purchaseIntentScore >= 50,
    safetyLevel: safety.level,
    safetyReason: safety.reason,
  };
}
