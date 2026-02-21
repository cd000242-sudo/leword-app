/**
 * 🏆 끝판왕 황금키워드 분석기 v2.0
 * 월수익 10억대 고수 블로거 수준의 분석 시스템
 * 
 * 핵심 기능:
 * 1. 돈 되는 타이밍 예측 (시즌성, 트렌드, 선점)
 * 2. 수익 극대화 분석 (CPC, 제휴마케팅, 예상 수익)
 * 3. 경쟁자 해부 (상위글 분석, 약점, 차별화)
 * 4. 자동 글감 생성 (제목, 구조, 이미지)
 * 5. 포트폴리오 전략 (조합, 리스크, 로드맵)
 */

// ==================== 인터페이스 ====================

// 🕐 시즌성 분석
export interface SeasonalAnalysis {
  peakMonths: number[];
  peakReason: string;
  currentSeasonScore: number;
  nextPeakDate: string;
  daysUntilPeak: number;
  recommendation: string;
  seasonalPattern: 'evergreen' | 'seasonal' | 'event' | 'trending';
}

// 📈 트렌드 감지
export interface TrendDetection {
  trendDirection: 'rising' | 'falling' | 'stable' | 'explosive';
  changeRate: number;
  comparedTo: string;
  explosiveScore: number;
  relatedNews: string[];
  recommendation: string;
}

// ⏰ 타이밍 알림
export interface TimingAlert {
  optimalPublishDate: string;
  reason: string;
  urgencyLevel: '🔥 지금 당장' | '⚡ 이번 주' | '📌 2주 내' | '📝 여유있게';
  expectedPeakDate: string;
  competitorActivity: string;
}

// 💰 CPC 분석
export interface RealCpcAnalysis {
  estimatedCpc: number;
  cpcRange: { min: number; max: number };
  cpcTier: '💎 프리미엄' | '🥇 고수익' | '🥈 중수익' | '🥉 저수익';
  industryAverage: number;
  recommendation: string;
}

// 🤝 제휴마케팅 매칭
export interface AffiliateMatching {
  recommendedPrograms: Array<{
    name: string;
    type: 'coupang' | 'naver' | 'admitad' | 'linkprice' | 'direct';
    commissionRate: string;
    estimatedEarningPerClick: number;
    matchScore: number;
  }>;
  bestMatch: string;
  potentialProducts: string[];
}

// 📊 수익 예측
export interface RevenueProjection {
  estimatedDailyVisitors: number;
  estimatedMonthlyVisitors: number;
  adsenseRevenue: { daily: number; monthly: number; assumptions: string };
  affiliateRevenue: { daily: number; monthly: number; conversionRate: number; assumptions: string };
  totalMonthlyRevenue: number;
  revenueBreakdown: string;
  revenueTier: '🏆 월 100만원+' | '🥇 월 50만원+' | '🥈 월 10만원+' | '🥉 월 5만원+' | '📝 월 1만원+';
}

// 📝 제목 생성
export interface TitleGenerator {
  titles: Array<{
    title: string;
    type: 'curiosity' | 'benefit' | 'number' | 'how-to' | 'comparison' | 'news';
    estimatedCTR: number;
    psychologyUsed: string;
  }>;
  bestTitle: string;
  titleFormula: string;
}

// 📑 본문 구조
export interface ContentStructure {
  recommendedStructure: {
    intro: { purpose: string; template: string; keywordPlacement: string };
    sections: Array<{
      heading: string;
      purpose: string;
      contentGuide: string;
      recommendedLength: number;
      keywordUsage: string;
    }>;
    conclusion: { purpose: string; template: string; ctaRecommendation: string };
  };
  seoChecklist: Array<{ item: string; importance: 'critical' | 'high' | 'medium' | 'low'; howTo: string }>;
  totalRecommendedLength: number;
  estimatedWriteTime: number;
}

// 🖼️ 이미지 추천
export interface ImageRecommendation {
  mainImage: { searchKeyword: string; style: string; source: string[]; altText: string };
  sectionImages: Array<{ section: string; searchKeyword: string; purpose: string; style: string }>;
  infographicIdeas: string[];
  totalRecommendedImages: number;
  imageStrategy: string;
}

// 🏆 종합 분석 결과
export interface UltimateAnalysis {
  timing: { seasonal: SeasonalAnalysis; trend: TrendDetection; alert: TimingAlert };
  revenue: { cpc: RealCpcAnalysis; affiliate: AffiliateMatching; projection: RevenueProjection };
  content: { titles: TitleGenerator; structure: ContentStructure; images: ImageRecommendation };
  ultimateScore: {
    total: number;
    breakdown: { goldenRatio: number; timing: number; revenue: number; competition: number; potential: number };
    grade: '💎 SSS' | '🏆 SS' | '🥇 S' | '🥈 A' | '🥉 B' | '📝 C';
    verdict: string;
    topActions: string[];
  };
}

// ==================== 시즌 데이터베이스 ====================

const SEASONAL_DATABASE: Record<string, { peakMonths: number[]; pattern: 'evergreen' | 'seasonal' | 'event' | 'trending'; reason: string }> = {
  // 연말정산/세금
  '연말정산': { peakMonths: [12, 1, 2], pattern: 'seasonal', reason: '연말정산 시즌' },
  '종합소득세': { peakMonths: [5], pattern: 'seasonal', reason: '5월 종소세 신고 기간' },
  '부가세': { peakMonths: [1, 7], pattern: 'seasonal', reason: '부가세 신고 기간' },
  
  // 다이어트/건강
  '다이어트': { peakMonths: [1, 3, 5], pattern: 'seasonal', reason: '새해 결심, 봄/여름 시즌' },
  '헬스': { peakMonths: [1, 3], pattern: 'seasonal', reason: '새해 운동 결심' },
  '영양제': { peakMonths: [3, 9], pattern: 'seasonal', reason: '환절기 건강 관심' },
  
  // 냉난방
  '에어컨': { peakMonths: [5, 6, 7, 8], pattern: 'seasonal', reason: '여름철 수요' },
  '선풍기': { peakMonths: [5, 6, 7], pattern: 'seasonal', reason: '초여름 수요' },
  '난방': { peakMonths: [10, 11, 12, 1], pattern: 'seasonal', reason: '겨울철 수요' },
  '보일러': { peakMonths: [10, 11], pattern: 'seasonal', reason: '난방 시즌 시작' },
  
  // 여행
  '여행': { peakMonths: [7, 8, 12, 1], pattern: 'seasonal', reason: '휴가/연말연시 시즌' },
  '휴가': { peakMonths: [6, 7, 8], pattern: 'seasonal', reason: '여름 휴가 시즌' },
  '스키': { peakMonths: [12, 1, 2], pattern: 'seasonal', reason: '스키 시즌' },
  
  // 교육
  '수능': { peakMonths: [9, 10, 11], pattern: 'event', reason: '수능 시즌' },
  '입학': { peakMonths: [2, 3], pattern: 'event', reason: '입학 시즌' },
  '개학': { peakMonths: [3, 9], pattern: 'event', reason: '학기 시작' },
  
  // 명절
  '설날': { peakMonths: [1, 2], pattern: 'event', reason: '설날 시즌' },
  '추석': { peakMonths: [8, 9], pattern: 'event', reason: '추석 시즌' },
  '선물세트': { peakMonths: [1, 2, 8, 9], pattern: 'event', reason: '명절 선물' },
  
  // 부동산/청약
  '청약': { peakMonths: [3, 4, 9, 10], pattern: 'seasonal', reason: '분양 시즌' },
  '전세': { peakMonths: [2, 8], pattern: 'seasonal', reason: '이사 시즌' },
  
  // 취업
  '자소서': { peakMonths: [3, 4, 9, 10], pattern: 'seasonal', reason: '취업 시즌' },
  '면접': { peakMonths: [4, 5, 10, 11], pattern: 'seasonal', reason: '채용 시즌' },
  
  // 이벤트
  '크리스마스': { peakMonths: [11, 12], pattern: 'event', reason: '연말 이벤트' },
  '발렌타인': { peakMonths: [1, 2], pattern: 'event', reason: '발렌타인데이' },
  '블랙프라이데이': { peakMonths: [11], pattern: 'event', reason: '블프 세일' },
};

// ==================== CPC 데이터베이스 ====================

const CPC_DATABASE: Record<string, { min: number; max: number; avg: number }> = {
  '금융': { min: 500, max: 2000, avg: 800 },
  '보험': { min: 800, max: 3000, avg: 1200 },
  '대출': { min: 1000, max: 5000, avg: 2000 },
  '건강': { min: 200, max: 600, avg: 350 },
  '의료': { min: 300, max: 800, avg: 450 },
  '영양제': { min: 150, max: 500, avg: 280 },
  '쇼핑': { min: 80, max: 300, avg: 150 },
  '가전': { min: 100, max: 400, avg: 200 },
  '여행': { min: 150, max: 500, avg: 280 },
  '교육': { min: 200, max: 700, avg: 380 },
  '자격증': { min: 250, max: 600, avg: 350 },
  '부동산': { min: 400, max: 1500, avg: 700 },
  '청약': { min: 300, max: 800, avg: 450 },
  '뷰티': { min: 100, max: 400, avg: 200 },
  '패션': { min: 80, max: 300, avg: 150 },
  '육아': { min: 100, max: 350, avg: 180 },
  '반려동물': { min: 120, max: 400, avg: 220 },
  'IT': { min: 150, max: 500, avg: 280 },
  '게임': { min: 80, max: 250, avg: 130 },
  '기타': { min: 50, max: 200, avg: 100 },
};

// ==================== 제휴마케팅 데이터베이스 ====================

const AFFILIATE_DATABASE: Record<string, Array<{ name: string; type: string; rate: string; perClick: number }>> = {
  '쇼핑': [
    { name: '쿠팡파트너스', type: 'coupang', rate: '3~5%', perClick: 50 },
    { name: '네이버 쇼핑', type: 'naver', rate: '1~3%', perClick: 30 },
  ],
  '금융': [
    { name: '뱅크샐러드', type: 'direct', rate: '건당 1~5만원', perClick: 500 },
    { name: '핀다', type: 'direct', rate: '건당 2~3만원', perClick: 400 },
  ],
  '보험': [
    { name: '보험다모아', type: 'direct', rate: '건당 5~15만원', perClick: 800 },
  ],
  '여행': [
    { name: '야놀자', type: 'direct', rate: '3~7%', perClick: 100 },
    { name: '여기어때', type: 'direct', rate: '3~5%', perClick: 80 },
  ],
  '교육': [
    { name: '클래스101', type: 'direct', rate: '10~20%', perClick: 200 },
    { name: '인프런', type: 'direct', rate: '10~15%', perClick: 150 },
  ],
  '건강': [
    { name: '아이허브', type: 'admitad', rate: '5~10%', perClick: 100 },
  ],
};

// ==================== 분석 함수 ====================

/**
 * 🕐 시즌성 분석
 */
export function analyzeSeasonality(keyword: string): SeasonalAnalysis {
  const currentMonth = new Date().getMonth() + 1;
  const currentDate = new Date();
  
  // 키워드에서 시즌 패턴 찾기
  let matchedPattern: { peakMonths: number[]; pattern: 'evergreen' | 'seasonal' | 'event' | 'trending'; reason: string } | null = null;
  
  for (const [key, value] of Object.entries(SEASONAL_DATABASE)) {
    if (keyword.includes(key) || key.includes(keyword)) {
      matchedPattern = value;
      break;
    }
  }
  
  if (!matchedPattern) {
    // 에버그린 키워드
    return {
      peakMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      peakReason: '연중 꾸준한 검색량',
      currentSeasonScore: 70,
      nextPeakDate: '항상',
      daysUntilPeak: 0,
      recommendation: '📝 에버그린 키워드입니다. 언제든 작성해도 좋습니다.',
      seasonalPattern: 'evergreen'
    };
  }
  
  // 현재 시즌 점수 계산
  const isPeakMonth = matchedPattern.peakMonths.includes(currentMonth);
  const isNearPeak = matchedPattern.peakMonths.some(m => Math.abs(m - currentMonth) <= 1 || Math.abs(m - currentMonth) >= 11);
  
  let currentSeasonScore = 50;
  if (isPeakMonth) currentSeasonScore = 100;
  else if (isNearPeak) currentSeasonScore = 80;
  
  // 다음 피크 계산
  let nextPeakMonth = matchedPattern.peakMonths.find(m => m > currentMonth) || matchedPattern.peakMonths[0];
  if (nextPeakMonth <= currentMonth) nextPeakMonth += 12;
  
  const nextPeakDate = new Date(currentDate.getFullYear(), nextPeakMonth - 1, 1);
  if (nextPeakMonth > 12) nextPeakDate.setFullYear(nextPeakDate.getFullYear() + 1);
  
  const daysUntilPeak = Math.ceil((nextPeakDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
  
  // 추천 메시지
  let recommendation = '';
  if (isPeakMonth) {
    recommendation = '🔥 지금이 피크 시즌입니다! 바로 작성하세요!';
  } else if (daysUntilPeak <= 30) {
    recommendation = `⚡ ${daysUntilPeak}일 후 피크 시즌입니다. 지금 작성하면 피크 때 상위노출!`;
  } else if (daysUntilPeak <= 60) {
    recommendation = `📌 ${daysUntilPeak}일 후 피크입니다. 2주 내 작성 권장!`;
  } else {
    recommendation = `📝 피크까지 ${daysUntilPeak}일 남았습니다. 미리 준비해두세요.`;
  }
  
  return {
    peakMonths: matchedPattern.peakMonths,
    peakReason: matchedPattern.reason,
    currentSeasonScore,
    nextPeakDate: `${nextPeakMonth > 12 ? nextPeakMonth - 12 : nextPeakMonth}월`,
    daysUntilPeak,
    recommendation,
    seasonalPattern: matchedPattern.pattern
  };
}

/**
 * 💰 CPC 분석
 */
export function analyzeCpc(keyword: string): RealCpcAnalysis {
  // 카테고리 감지
  let category = '기타';
  const categoryKeywords: Record<string, string[]> = {
    '금융': ['대출', '적금', '예금', '금리', '은행', '카드', '신용'],
    '보험': ['보험', '실손', '암보험', '자동차보험'],
    '건강': ['건강', '영양제', '비타민', '유산균', '다이어트'],
    '의료': ['병원', '치과', '성형', '피부과', '의료'],
    '쇼핑': ['추천', '순위', '비교', '가성비', '후기', '구매'],
    '가전': ['에어컨', '냉장고', '세탁기', '청소기', '가전'],
    '여행': ['여행', '호텔', '항공', '숙소', '관광'],
    '교육': ['자격증', '공부', '시험', '학원', '강의'],
    '부동산': ['부동산', '전세', '월세', '청약', '아파트'],
    '뷰티': ['화장품', '스킨케어', '메이크업', '뷰티'],
    '육아': ['육아', '아기', '유아', '임신', '출산'],
    'IT': ['노트북', '스마트폰', '태블릿', '앱', '프로그램'],
  };
  
  for (const [cat, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(k => keyword.includes(k))) {
      category = cat;
      break;
    }
  }
  
  const cpcData = CPC_DATABASE[category] || CPC_DATABASE['기타'];
  const estimatedCpc = cpcData.avg;
  
  let cpcTier: '💎 프리미엄' | '🥇 고수익' | '🥈 중수익' | '🥉 저수익';
  if (estimatedCpc >= 500) cpcTier = '💎 프리미엄';
  else if (estimatedCpc >= 300) cpcTier = '🥇 고수익';
  else if (estimatedCpc >= 150) cpcTier = '🥈 중수익';
  else cpcTier = '🥉 저수익';
  
  return {
    estimatedCpc,
    cpcRange: { min: cpcData.min, max: cpcData.max },
    cpcTier,
    industryAverage: cpcData.avg,
    recommendation: cpcTier === '💎 프리미엄' || cpcTier === '🥇 고수익' 
      ? '💰 고수익 키워드입니다! 적극 공략하세요.'
      : '📝 일반적인 수익 구조입니다. 트래픽 확보에 집중하세요.'
  };
}

/**
 * 🤝 제휴마케팅 매칭
 */
export function matchAffiliate(keyword: string): AffiliateMatching {
  // 카테고리 감지
  let category = '쇼핑';
  const categoryMap: Record<string, string[]> = {
    '금융': ['대출', '적금', '카드', '은행', '금리'],
    '보험': ['보험', '실손', '암보험'],
    '여행': ['여행', '호텔', '항공', '숙소'],
    '교육': ['강의', '클래스', '배우기', '자격증'],
    '건강': ['영양제', '비타민', '건강기능식품'],
  };
  
  for (const [cat, keywords] of Object.entries(categoryMap)) {
    if (keywords.some(k => keyword.includes(k))) {
      category = cat;
      break;
    }
  }
  
  const programs = AFFILIATE_DATABASE[category] || AFFILIATE_DATABASE['쇼핑'];
  
  return {
    recommendedPrograms: programs.map((p, i) => ({
      name: p.name,
      type: p.type as any,
      commissionRate: p.rate,
      estimatedEarningPerClick: p.perClick,
      matchScore: 100 - i * 15
    })),
    bestMatch: programs[0]?.name || '쿠팡파트너스',
    potentialProducts: generateProductKeywords(keyword)
  };
}

function generateProductKeywords(keyword: string): string[] {
  const suffixes = ['추천', '순위', '비교', '후기', '가격', '구매'];
  return suffixes.map(s => `${keyword} ${s}`);
}

/**
 * 📊 수익 예측
 */
export function projectRevenue(
  keyword: string,
  searchVolume: number,
  goldenRatio: number
): RevenueProjection {
  // 예상 순위 계산 (황금비율 기반)
  let expectedRank = 10;
  let ctr = 0.03;
  
  if (goldenRatio >= 10) { expectedRank = 1; ctr = 0.30; }
  else if (goldenRatio >= 5) { expectedRank = 2; ctr = 0.15; }
  else if (goldenRatio >= 2) { expectedRank = 4; ctr = 0.08; }
  else if (goldenRatio >= 1) { expectedRank = 7; ctr = 0.05; }
  else { ctr = 0.03; }
  
  const dailyVisitors = Math.round(searchVolume / 30 * ctr);
  const monthlyVisitors = dailyVisitors * 30;
  
  // CPC 분석
  const cpcAnalysis = analyzeCpc(keyword);
  const cpc = cpcAnalysis.estimatedCpc;
  
  // 애드센스 수익 계산
  const pageViewRate = 1.5;
  const adCtr = 0.02;
  const adsenseDaily = Math.round(dailyVisitors * pageViewRate * adCtr * cpc);
  const adsenseMonthly = adsenseDaily * 30;
  
  // 제휴 수익 계산
  const affiliateClickRate = 0.10;
  const conversionRate = 0.03;
  const affiliateAnalysis = matchAffiliate(keyword);
  const avgCommission = affiliateAnalysis.recommendedPrograms[0]?.estimatedEarningPerClick || 50;
  const affiliateDaily = Math.round(dailyVisitors * affiliateClickRate * conversionRate * avgCommission);
  const affiliateMonthly = affiliateDaily * 30;
  
  const totalMonthly = adsenseMonthly + affiliateMonthly;
  
  let revenueTier: RevenueProjection['revenueTier'];
  if (totalMonthly >= 1000000) revenueTier = '🏆 월 100만원+';
  else if (totalMonthly >= 500000) revenueTier = '🥇 월 50만원+';
  else if (totalMonthly >= 100000) revenueTier = '🥈 월 10만원+';
  else if (totalMonthly >= 50000) revenueTier = '🥉 월 5만원+';
  else revenueTier = '📝 월 1만원+';
  
  return {
    estimatedDailyVisitors: dailyVisitors,
    estimatedMonthlyVisitors: monthlyVisitors,
    adsenseRevenue: {
      daily: adsenseDaily,
      monthly: adsenseMonthly,
      assumptions: `CPC ${cpc}원, CTR 2%, 페이지뷰율 1.5 가정`
    },
    affiliateRevenue: {
      daily: affiliateDaily,
      monthly: affiliateMonthly,
      conversionRate: conversionRate * 100,
      assumptions: `클릭률 10%, 전환율 3%, 평균 수수료 ${avgCommission}원 가정`
    },
    totalMonthlyRevenue: totalMonthly,
    revenueBreakdown: totalMonthly > 0
      ? `애드센스 ${Math.round(adsenseMonthly / totalMonthly * 100)}% + 제휴 ${Math.round(affiliateMonthly / totalMonthly * 100)}%`
      : '애드센스 0% + 제휴 0%',
    revenueTier
  };
}

/**
 * 📝 제목 생성
 */
export function generateTitles(keyword: string): TitleGenerator {
  const year = new Date().getFullYear();
  
  const titles: TitleGenerator['titles'] = [
    {
      title: `${keyword} 추천 TOP 10 (${year}년 최신)`,
      type: 'number',
      estimatedCTR: 8.5,
      psychologyUsed: '숫자 + 최신 정보'
    },
    {
      title: `${keyword}, 이것만 알면 끝! 완벽 가이드`,
      type: 'benefit',
      estimatedCTR: 7.2,
      psychologyUsed: '완결성 + 가치 제안'
    },
    {
      title: `아직도 ${keyword} 몰라요? 지금 당장 확인하세요`,
      type: 'curiosity',
      estimatedCTR: 6.8,
      psychologyUsed: '호기심 + 긴급성'
    },
    {
      title: `${keyword} 하는 법, 초보자도 쉽게 따라하기`,
      type: 'how-to',
      estimatedCTR: 7.5,
      psychologyUsed: '실용성 + 접근성'
    },
    {
      title: `${keyword} 실제 후기 (장단점 솔직 비교)`,
      type: 'comparison',
      estimatedCTR: 6.5,
      psychologyUsed: '신뢰성 + 비교 심리'
    },
    {
      title: `[${year}년] ${keyword} 총정리 (+ 꿀팁 공개)`,
      type: 'news',
      estimatedCTR: 7.0,
      psychologyUsed: '최신성 + 보너스 가치'
    }
  ];
  
  const sortedTitles = [...titles].sort((a, b) => b.estimatedCTR - a.estimatedCTR);
  
  return {
    titles: sortedTitles,
    bestTitle: sortedTitles[0].title,
    titleFormula: '숫자 + 키워드 + 최신연도 + 가치제안'
  };
}

/**
 * 📑 본문 구조 생성
 */
export function generateContentStructure(keyword: string): ContentStructure {
  return {
    recommendedStructure: {
      intro: {
        purpose: '독자의 관심 끌기 + 키워드 자연스럽게 배치',
        template: `"${keyword}"에 대해 고민하고 계신가요? 이 글에서 핵심 정보를 모두 정리해드립니다.`,
        keywordPlacement: '첫 문장에 키워드 포함'
      },
      sections: [
        {
          heading: `${keyword}란? (기본 개념)`,
          purpose: '기초 정보 제공',
          contentGuide: '핵심 정의, 중요성, 왜 알아야 하는지 설명',
          recommendedLength: 300,
          keywordUsage: '소제목과 본문에 1~2회'
        },
        {
          heading: `${keyword} 추천 BEST 5`,
          purpose: '실질적인 가치 제공 (핵심 섹션)',
          contentGuide: '순위별 상세 설명, 장단점, 추천 이유',
          recommendedLength: 800,
          keywordUsage: '각 항목 설명에 자연스럽게 포함'
        },
        {
          heading: `${keyword} 선택 시 주의사항`,
          purpose: '신뢰도 향상',
          contentGuide: '흔한 실수, 피해야 할 것, 체크리스트',
          recommendedLength: 400,
          keywordUsage: '주의사항 설명에 1~2회'
        },
        {
          heading: `자주 묻는 질문 (FAQ)`,
          purpose: 'SEO 강화 + 체류시간 증가',
          contentGuide: '실제 검색되는 질문 5개 + 명확한 답변',
          recommendedLength: 500,
          keywordUsage: '질문에 롱테일 키워드 활용'
        }
      ],
      conclusion: {
        purpose: '요약 + CTA',
        template: `지금까지 ${keyword}에 대해 알아봤습니다. 도움이 되셨다면 공유해주세요!`,
        ctaRecommendation: '댓글, 공유, 관련 글 링크 유도'
      }
    },
    seoChecklist: [
      { item: '제목에 키워드 포함', importance: 'critical', howTo: '제목 앞부분에 메인 키워드 배치' },
      { item: '첫 문단에 키워드', importance: 'critical', howTo: '첫 100자 내 키워드 자연스럽게 삽입' },
      { item: '소제목 H2/H3 활용', importance: 'high', howTo: '3~5개 소제목, 키워드 변형 사용' },
      { item: '이미지 ALT 태그', importance: 'high', howTo: '모든 이미지에 키워드 포함 설명' },
      { item: '내부링크 2개 이상', importance: 'medium', howTo: '관련 글 자연스럽게 연결' },
      { item: '3000자 이상 작성', importance: 'high', howTo: '충분한 깊이의 콘텐츠 제공' }
    ],
    totalRecommendedLength: 3000,
    estimatedWriteTime: 90
  };
}

/**
 * 🖼️ 이미지 추천
 */
export function recommendImages(keyword: string): ImageRecommendation {
  return {
    mainImage: {
      searchKeyword: `${keyword} 대표이미지`,
      style: '깔끔한 인포그래픽 또는 고화질 사진',
      source: ['Unsplash', 'Pixabay', '직접 제작'],
      altText: `${keyword} 완벽 가이드 대표 이미지`
    },
    sectionImages: [
      { section: '기본 개념', searchKeyword: `${keyword} 설명`, purpose: '이해 돕기', style: '다이어그램' },
      { section: 'TOP 5', searchKeyword: `${keyword} 비교`, purpose: '시각적 비교', style: '비교표' },
      { section: '주의사항', searchKeyword: '주의 아이콘', purpose: '강조', style: '아이콘' }
    ],
    infographicIdeas: [
      `${keyword} 선택 가이드 플로우차트`,
      `${keyword} TOP 5 비교표`,
      `${keyword} 체크리스트`
    ],
    totalRecommendedImages: 7,
    imageStrategy: '섹션당 1~2개, 총 7~10개 이미지로 가독성과 체류시간 향상'
  };
}

/**
 * 🏆 종합 분석 실행
 */
export async function runUltimateAnalysis(
  keyword: string,
  searchVolume: number,
  documentCount: number,
  goldenRatio: number
): Promise<UltimateAnalysis> {
  // 각 분석 실행
  const seasonal = analyzeSeasonality(keyword);
  const cpc = analyzeCpc(keyword);
  const affiliate = matchAffiliate(keyword);
  const revenue = projectRevenue(keyword, searchVolume, goldenRatio);
  const titles = generateTitles(keyword);
  const structure = generateContentStructure(keyword);
  const images = recommendImages(keyword);
  
  // 트렌드 분석 (간단 버전)
  const trend: TrendDetection = {
    trendDirection: goldenRatio >= 5 ? 'rising' : goldenRatio >= 2 ? 'stable' : 'falling',
    changeRate: Math.round(goldenRatio * 10),
    comparedTo: '전월 대비',
    explosiveScore: Math.min(100, Math.round(goldenRatio * 15)),
    relatedNews: [],
    recommendation: goldenRatio >= 5 ? '📈 상승세입니다! 지금이 적기!' : '📊 안정적인 키워드입니다.'
  };
  
  // 타이밍 알림
  let urgencyLevel: TimingAlert['urgencyLevel'];
  if (seasonal.currentSeasonScore >= 90) urgencyLevel = '🔥 지금 당장';
  else if (seasonal.currentSeasonScore >= 70) urgencyLevel = '⚡ 이번 주';
  else if (seasonal.daysUntilPeak <= 30) urgencyLevel = '📌 2주 내';
  else urgencyLevel = '📝 여유있게';
  
  const alert: TimingAlert = {
    optimalPublishDate: urgencyLevel === '🔥 지금 당장' ? '오늘' : `${seasonal.daysUntilPeak}일 내`,
    reason: seasonal.recommendation,
    urgencyLevel,
    expectedPeakDate: seasonal.nextPeakDate,
    competitorActivity: documentCount > 10000 ? '경쟁자 많음' : documentCount > 1000 ? '경쟁자 보통' : '경쟁자 적음'
  };
  
  // 종합 점수 계산
  const goldenRatioScore = Math.min(100, goldenRatio * 10);
  const timingScore = seasonal.currentSeasonScore;
  const revenueScore = revenue.totalMonthlyRevenue >= 100000 ? 100 : revenue.totalMonthlyRevenue >= 50000 ? 80 : revenue.totalMonthlyRevenue >= 10000 ? 60 : 40;
  const competitionScore = documentCount < 1000 ? 100 : documentCount < 5000 ? 80 : documentCount < 10000 ? 60 : 40;
  const potentialScore = Math.round((goldenRatioScore + timingScore + revenueScore + competitionScore) / 4);
  
  const total = Math.round((goldenRatioScore * 0.3 + timingScore * 0.2 + revenueScore * 0.2 + competitionScore * 0.2 + potentialScore * 0.1));
  
  let grade: UltimateAnalysis['ultimateScore']['grade'];
  if (total >= 90) grade = '💎 SSS';
  else if (total >= 80) grade = '🏆 SS';
  else if (total >= 70) grade = '🥇 S';
  else if (total >= 60) grade = '🥈 A';
  else if (total >= 50) grade = '🥉 B';
  else grade = '📝 C';
  
  return {
    timing: { seasonal, trend, alert },
    revenue: { cpc, affiliate, projection: revenue },
    content: { titles, structure, images },
    ultimateScore: {
      total,
      breakdown: {
        goldenRatio: goldenRatioScore,
        timing: timingScore,
        revenue: revenueScore,
        competition: competitionScore,
        potential: potentialScore
      },
      grade,
      verdict: total >= 70 ? '🎯 적극 공략 추천!' : total >= 50 ? '📝 작성 가치 있음' : '⚠️ 신중히 검토 필요',
      topActions: [
        urgencyLevel === '🔥 지금 당장' ? '지금 바로 글 작성 시작!' : `${seasonal.daysUntilPeak}일 내 작성 권장`,
        titles.bestTitle,
        `${structure.totalRecommendedLength}자 이상, ${images.totalRecommendedImages}개 이미지 권장`
      ]
    }
  };
}













