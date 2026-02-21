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
}

export const CATEGORY_CPC_DATABASE: Record<string, { min: number; max: number; avg: number }> = {
  finance: { min: 800, max: 3000, avg: 1500 },
  insurance: { min: 700, max: 2500, avg: 1200 },
  loan: { min: 1000, max: 4000, avg: 2000 },
  realestate: { min: 600, max: 2000, avg: 1000 },
  legal: { min: 800, max: 2500, avg: 1300 },
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
  '어디서', '파는곳', '구매처', '판매처', '온라인', '오프라인'
];

export const COMPARISON_PATTERNS = [
  '후기', '리뷰', '사용기', '체험기', '솔직후기', '실사용',
  '한달', '6개월', '1년',
  '장단점', '장점', '단점', '문제점', '아쉬운점', '좋은점',
  '차이점', '다른점', '비슷한', '대체', '대안',
  '고민', '선택', '결정'
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
  '서류', '절차', '과정', '단계'
];

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

export function calculatePurchaseIntent(keyword: string): number {
  const kw = String(keyword || '').toLowerCase();
  let score = 30;

  const purchaseMatches = PURCHASE_INTENT_PATTERNS.filter(p => kw.includes(p));
  score += purchaseMatches.length * 15;

  const comparisonMatches = COMPARISON_PATTERNS.filter(p => kw.includes(p));
  score += comparisonMatches.length * 10;

  const infoMatches = INFO_SEARCH_PATTERNS.filter(p => kw.includes(p));
  score += infoMatches.length * 5;

  const wordCount = kw.split(/\s+/).filter(Boolean).length;
  if (wordCount >= 3) score += 10;
  if (wordCount >= 4) score += 5;

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

export function calculateFreshnessOpportunity(avgTopPostAge?: number): number {
  if (!avgTopPostAge) return 1.0;
  if (avgTopPostAge >= 365) return 1.8;
  if (avgTopPostAge >= 180) return 1.5;
  if (avgTopPostAge >= 90) return 1.3;
  if (avgTopPostAge >= 30) return 1.1;
  return 1.0;
}

function generateTitleSuggestion(keyword: string, purchaseIntent: number): string {
  const year = new Date().getFullYear();
  if (purchaseIntent >= 70) return `${keyword} 추천 TOP 5 (${year} 최신) | 가성비 비교 총정리`;
  if (purchaseIntent >= 50) return `${keyword} 솔직 후기 | 장단점 총정리 (${year})`;
  return `${keyword} 완벽 가이드 | 초보자도 쉽게 따라하기`;
}

function generateStrategy(keyword: string, grade: string, cpc: number, purchaseIntent: number): ProfitKeywordData['strategy'] {
  let approach: string;
  if (grade === 'SSS' || grade === 'SS') approach = '🚀 즉시 작성! 최우선 키워드. 2000자+ 심층 콘텐츠로 상위 장악';
  else if (grade === 'S' || grade === 'A') approach = '✍️ 빠른 작성 권장. 1500자+ 품질 콘텐츠로 상위 노출 노려볼만';
  else if (grade === 'B') approach = '🔍 롱테일 확장 후 작성. "초보자", "2025", "비교" 등 붙여서 경쟁 낮추기';
  else approach = '⏸️ 보류. 더 좋은 키워드 찾기 추천';

  let monetization: string;
  if (cpc >= 500 && purchaseIntent >= 60) monetization = '💰 쿠팡파트너스 + 애드센스 동시 운영. 상품 링크 필수!';
  else if (cpc >= 300) monetization = '📊 애드센스 메인. 광고 위치 최적화로 RPM 극대화';
  else if (purchaseIntent >= 50) monetization = '🛒 쿠팡파트너스 집중. 비교/추천 형식으로 전환율 높이기';
  else monetization = '📝 트래픽 확보 우선. 이후 관련 고수익 키워드로 내부링크';

  let timing: string;
  if (grade === 'SSS' || grade === 'SS') timing = '⚡ 지금 바로! 1~2주 내 상위노출 가능';
  else if (grade === 'S' || grade === 'A') timing = '📅 이번 주 내 작성. 2~4주 내 상위노출 기대';
  else timing = '🗓️ 여유있게 준비. 롱테일 전략으로 접근';

  return { approach, monetization, timing, titleSuggestion: generateTitleSuggestion(keyword, purchaseIntent) };
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
  }
): ProfitKeywordData {
  const avgTopPostAge = options?.avgTopPostAge;
  const compIdx = options?.compIdx;
  const hasSmartBlock = options?.hasSmartBlock;
  const hasInfluencer = options?.hasInfluencer;
  const difficultyScore = options?.difficultyScore;

  const estimatedCPC = estimateCPC(keyword, category);

  // MDP v2.0: CVI (Commercial Value Index) 계산
  // 공식: CVI = (Intent Weight * CPC Index * CTR Base)
  // Intent Score가 높고, 광고 단가가 높을수록 CVI 상승
  const purchaseIntentScore = calculatePurchaseIntent(keyword);
  const intentWeight = 0.5 + (purchaseIntentScore / 100) * 1.5;
  const commercialIdx = compIdx ?? 0.5;
  const cvi = Number((intentWeight * (estimatedCPC / 500) * commercialIdx).toFixed(2));

  const competitionLevel = difficultyScore !== undefined
    ? Math.round(difficultyScore)
    : calculateCompetitionLevel(documentCount, searchVolume);

  const freshnessOpportunity = calculateFreshnessOpportunity(avgTopPostAge);

  const cpcWeight = Math.min(3, (estimatedCPC / 200) * (compIdx ?? 1));

  const profitGoldenRatio =
    (searchVolume * cpcWeight * intentWeight * freshnessOpportunity)
    / (Math.max(1, competitionLevel) * 100);

  const clickThroughRate = Math.max(0.05, 0.3 - (competitionLevel * 0.025));
  const adClickRate = 0.03;
  const dailyVisitors = Math.round((searchVolume / 30) * clickThroughRate);
  const estimatedDailyRevenue = Math.round(dailyVisitors * adClickRate * estimatedCPC);
  const estimatedMonthlyRevenue = estimatedDailyRevenue * 30;

  let grade: ProfitKeywordData['grade'];
  let gradeReason: string;

  // 🚨 100점 품질: 진짜 황금 키워드 조건 (문서수 1만 이하, 검색량/문서수 비율 1.5 이상)
  const rawRatio = searchVolume / Math.max(1, documentCount);
  const isCandidateForGolden = documentCount <= 10000 && rawRatio >= 1.5;

  if (profitGoldenRatio >= 50 && estimatedMonthlyRevenue >= 50000 && isCandidateForGolden) {
    grade = 'SSS';
    gradeReason = `🏆 최상급! 월 ${Math.round(estimatedMonthlyRevenue / 10000)}만원+ 예상, 진짜 블루오션 (비율 ${rawRatio.toFixed(1)})`;
  } else if (profitGoldenRatio >= 30 && estimatedMonthlyRevenue >= 30000 && (documentCount <= 30000 && rawRatio >= 1.0)) {
    grade = 'SS';
    gradeReason = `💎 우수! 월 ${Math.round(estimatedMonthlyRevenue / 10000)}만원 예상, 경쟁 적음 (비율 ${rawRatio.toFixed(1)})`;
  } else if (profitGoldenRatio >= 15 && estimatedMonthlyRevenue >= 15000 && (documentCount <= 60000)) {
    grade = 'S';
    gradeReason = `⭐ 추천! 월 ${Math.round(estimatedMonthlyRevenue / 1000)}천원 예상`;
  } else if (profitGoldenRatio >= 8 && estimatedMonthlyRevenue >= 8000) {
    grade = 'A';
    gradeReason = `✅ 양호! 월 ${Math.round(estimatedMonthlyRevenue / 1000)}천원 예상`;
  } else if (profitGoldenRatio >= 4) {
    grade = 'B';
    gradeReason = '📌 보통 (수익성 위주). 롱테일 확장 추천';
  } else if (profitGoldenRatio >= 2) {
    grade = 'C';
    gradeReason = '⚠️ 경쟁 높음. 틈새 접근 필요';
  } else {
    grade = 'D';
    gradeReason = '❌ 비추천. 수익성 및 경쟁력 낮음';
  }

  const isRealBlueOcean = (
    searchVolume >= 300 &&
    searchVolume <= 10000 &&
    documentCount <= 2000 &&
    profitGoldenRatio >= 10 &&
    estimatedCPC >= 150 &&
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

  const strategy = generateStrategy(keyword, grade, estimatedCPC, purchaseIntentScore);

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
    isCommercial: purchaseIntentScore >= 50
  };
}
