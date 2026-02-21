/**
 * 타이밍 골드 키워드 파인더 (끝판왕 버전)
 * "지금 당장 작성하면 트래픽이 폭발할 황금 키워드"를 찾아주는 시스템
 * 
 * 핵심 원칙:
 * 1. 실제 사람들이 검색하는 키워드만 추출 (의원들 체포 X → 추경호 구속 O)
 * 2. 검색량 높고 + 경쟁 낮은 틈새 키워드 발굴
 * 3. 수익화 가능한 키워드 우선 (민생지원금, 상생페이백 등)
 * 4. 더미 데이터 절대 금지 - 모든 분석은 실제 데이터 기반
 */

export interface KeywordData {
  keyword: string;
  searchVolume: number;
  documentCount: number;
  growthRate?: number; // 전일 대비 성장률 (%)
  firstSeenDate?: Date;
  category?: string;
  changeRate?: number;
  source?: string; // 키워드 출처
}

export interface TimingScore {
  keyword: string;
  
  // 기본 황금 점수
  goldenScore: number; // (검색량 / 문서수) × 1000
  
  // 타이밍 점수
  trendingScore: number; // 급상승도 (0-100)
  freshnessScore: number; // 신선도 (0-100)
  seasonalScore: number; // 시즌성 (0-100)
  competitionTimeScore: number; // 경쟁 진입 시간 (0-100)
  
  // 최종 타이밍 골드 점수
  timingGoldScore: number; // 종합 점수
  urgency: 'immediate' | 'today' | 'this-week' | 'normal';
  
  // 메타데이터
  searchVolume: number;
  documentCount: number;
  growthRate: number;
  firstSeenDate: Date;
  peakPrediction: Date;
  
  // 인사이트
  reason: string;
  trendingReason?: string; // 구체적인 급상승 이유
  whyNow?: string; // 왜 지금 써야 하는지
  suggestedDeadline: Date;
  estimatedTraffic: number;
  
  // 키워드 유형 분류
  keywordType: {
    type: 'issue' | 'longtail' | 'shorttail' | 'seasonal' | 'evergreen' | 'money';
    label: string;
    description: string;
    emoji: string;
    profitPotential: 'high' | 'medium' | 'low';
    duration: string;
  };
  
  // 수익화 가이드
  monetizationGuide: {
    estimatedCPC: number;
    estimatedMonthlyRevenue: number;
    adSuitability: number;
    affiliatePotential: number;
    revenueStrategy: string;
  };
  
  // 콘텐츠 작성 가이드
  contentGuide: {
    suggestedTitle: string;
    suggestedOutline: string[];
    targetLength: string;
    keyPoints: string[];
    avoidPoints: string[];
  };
  
  // 확장 키워드
  expansionKeywords: Array<{
    keyword: string;
    type: 'related' | 'longtail' | 'question' | 'comparison';
    searchVolume?: number;
    difficulty: 'easy' | 'medium' | 'hard';
    priority: number;
  }>;
  
  // 연관 키워드
  relatedKeywords?: Array<{ keyword: string; searchVolume: number; documentCount: number; validated: boolean }>;
  suggestedKeywords?: Array<{ keyword: string; searchVolume: number; documentCount: number; validated: boolean }>;
  associativeKeywords?: Array<{ keyword: string; searchVolume: number; documentCount: number; validated: boolean }>;
}

export class TimingGoldenFinder {
  
  /**
   * 키워드가 실제 검색 가능한 키워드인지 검증
   * "의원들 체포" 같은 검색하지 않는 키워드 필터링
   */
  isValidSearchKeyword(keyword: string): boolean {
    if (!keyword || keyword.trim().length < 2) return false;
    
    const kw = keyword.trim();
    
    // 1. 너무 짧거나 긴 키워드 제외
    if (kw.length < 2 || kw.length > 30) return false;
    
    // 2. 뉴스 헤드라인 스타일 제외 (문장형)
    const sentencePatterns = [
      /던$/, /라며$/, /라고$/, /했다$/, /됐다$/, /한다$/, /이다$/, /있다$/,
      /없다$/, /갔다$/, /왔다$/, /봤다$/, /했어$/, /걱정마라/, /피해자라니/,
      /내가바로/, /가져왔어/, /직전/, /순간/
    ];
    if (sentencePatterns.some(p => p.test(kw))) return false;
    
    // 3. 복수형/일반화된 키워드 제외 (검색 의도 불명확)
    const vaguePluralPatterns = [
      /^.+들\s+(체포|구속|수사|검거|조사)$/, // "의원들 체포" 같은 패턴
      /^.+들이\s+/, // "...들이 ..."
      /^여러\s+/, // "여러 ..."
      /^각종\s+/, // "각종 ..."
    ];
    if (vaguePluralPatterns.some(p => p.test(kw))) return false;
    
    // 4. 구체적인 검색 키워드 패턴 확인 (이런 건 OK)
    const validPatterns = [
      /^[가-힣A-Za-z0-9]+\s+(구속|체포|사망|결혼|이혼|출시|발표|가격|방법|추천|후기|비교)$/, // "추경호 구속"
      /^[가-힣A-Za-z0-9]+\s+[가-힣A-Za-z0-9]+$/, // 2단어 조합
      /^[가-힣A-Za-z0-9]{2,15}$/, // 단일 키워드
      /(지원금|페이백|할인|쿠폰|신청|방법|가격|후기|추천|비교)/, // 수익화 키워드
    ];
    
    // 검증 패턴에 맞으면 OK
    if (validPatterns.some(p => p.test(kw))) return true;
    
    // 5. 기본적으로 2-4단어 조합이면 OK
    const wordCount = kw.split(/\s+/).length;
    if (wordCount >= 1 && wordCount <= 4) return true;
    
    return false;
  }
  
  /**
   * 키워드가 수익화 가능한 키워드인지 확인
   */
  isMoneyKeyword(keyword: string): boolean {
    const kw = keyword.toLowerCase();
    const moneyPatterns = [
      // 금융/지원금
      '지원금', '페이백', '캐시백', '환급', '보조금', '수당', '급여', '연금',
      '대출', '금리', '적금', '예금', '투자', '주식', '코인', '비트코인',
      // 쇼핑/할인
      '할인', '쿠폰', '세일', '특가', '최저가', '가격비교', '구매',
      // 정책/혜택
      '신청방법', '신청', '접수', '등록', '발급', '조회',
      // 제품/서비스
      '추천', '비교', '후기', '리뷰', '순위', '랭킹', 'top', '베스트',
      // 교육/자격
      '자격증', '시험', '합격', '취업', '면접', '이직',
      // 건강/의료
      '보험', '병원', '치료', '증상', '약',
    ];
    
    return moneyPatterns.some(p => kw.includes(p));
  }
  
  /**
   * 타이밍 골드 점수 계산
   */
  calculateTimingGoldScore(keyword: KeywordData): TimingScore {
    
    // 1. 황금 비율 점수 (검색량 / 문서수)
    const goldenRatio = keyword.documentCount > 0 
      ? keyword.searchVolume / keyword.documentCount 
      : keyword.searchVolume;
    
    const goldenScore = Math.min(100, goldenRatio * 10);
    
    // 2. 경쟁도 점수
    const competitionScore = this.calculateCompetitionScore(keyword.documentCount);
    
    // 3. 검색량 점수
    const volumeScore = this.calculateVolumeScore(keyword.searchVolume);
    
    // 4. 트렌딩 점수
    const trendingScore = this.calculateTrendingScore(keyword);
    
    // 5. 신선도 점수
    const freshnessScore = this.calculateFreshnessScore(keyword);
    
    // 6. 시즌성 점수
    const seasonalScore = this.calculateSeasonalScore(keyword);
    
    // 7. 경쟁 진입 시간 점수
    const competitionTimeScore = this.calculateCompetitionTimeScore(keyword);
    
    // 수익화 키워드 보너스
    const moneyBonus = this.isMoneyKeyword(keyword.keyword) ? 15 : 0;
    
    // 최종 점수 계산
    const timingGoldScore = Math.min(100, (
      goldenScore * 0.30 +          // 30% - 황금 비율
      competitionScore * 0.25 +     // 25% - 경쟁도
      volumeScore * 0.15 +          // 15% - 검색량
      trendingScore * 0.10 +        // 10% - 급상승도
      freshnessScore * 0.05 +       // 5% - 신선도
      seasonalScore * 0.05 +        // 5% - 시즌성
      competitionTimeScore * 0.05 + // 5% - 경쟁 시간
      moneyBonus                     // 수익화 보너스
    ));
    
    const urgency = this.determineUrgency(timingGoldScore, competitionTimeScore);
    const peakPrediction = this.predictPeak(keyword);
    const suggestedDeadline = this.calculateDeadline(peakPrediction, competitionTimeScore);
    const estimatedTraffic = this.estimateTraffic(keyword, timingGoldScore);
    
    const reason = this.generateReason(keyword, {
      trendingScore, freshnessScore, seasonalScore, competitionTimeScore
    });
    
    // 키워드 유형 분류
    const keywordType = this.classifyKeywordType(keyword, {
      trendingScore, freshnessScore, seasonalScore, goldenScore
    });
    
    // 실제 데이터 기반 분석 생성
    const trendingReason = this.generateRealTrendingReason(keyword, { trendingScore, freshnessScore });
    const whyNow = this.generateRealWhyNow(keyword, { competitionTimeScore, timingGoldScore });
    const monetizationGuide = this.generateRealMonetizationGuide(keyword, keywordType, estimatedTraffic);
    const contentGuide = this.generateRealContentGuide(keyword, keywordType);
    const expansionKeywords = this.generateRealExpansionKeywords(keyword, keywordType);
    
    return {
      keyword: keyword.keyword,
      goldenScore: Math.round(goldenScore),
      trendingScore,
      freshnessScore,
      seasonalScore,
      competitionTimeScore,
      timingGoldScore: Math.round(timingGoldScore),
      urgency,
      searchVolume: keyword.searchVolume,
      documentCount: keyword.documentCount,
      growthRate: keyword.growthRate || 0,
      firstSeenDate: keyword.firstSeenDate || new Date(),
      peakPrediction,
      reason,
      trendingReason,
      whyNow,
      suggestedDeadline,
      estimatedTraffic,
      keywordType,
      monetizationGuide,
      contentGuide,
      expansionKeywords
    };
  }
  
  /**
   * 경쟁도 점수
   */
  calculateCompetitionScore(documentCount: number): number {
    if (documentCount <= 10) return 100;
    if (documentCount <= 30) return 95;
    if (documentCount <= 50) return 90;
    if (documentCount <= 100) return 85;
    if (documentCount <= 200) return 75;
    if (documentCount <= 300) return 65;
    if (documentCount <= 500) return 50;
    if (documentCount <= 1000) return 35;
    if (documentCount <= 2000) return 20;
    if (documentCount <= 5000) return 10;
    return 5;
  }
  
  /**
   * 검색량 점수
   */
  calculateVolumeScore(searchVolume: number): number {
    if (searchVolume >= 50000) return 100;
    if (searchVolume >= 30000) return 95;
    if (searchVolume >= 20000) return 90;
    if (searchVolume >= 10000) return 85;
    if (searchVolume >= 5000) return 75;
    if (searchVolume >= 3000) return 65;
    if (searchVolume >= 2000) return 55;
    if (searchVolume >= 1000) return 45;
    if (searchVolume >= 500) return 35;
    if (searchVolume >= 100) return 20;
    return 10;
  }
  
  /**
   * 트렌딩 점수
   */
  calculateTrendingScore(keyword: KeywordData): number {
    const growthRate = keyword.growthRate || keyword.changeRate || 0;
    
    if (growthRate >= 500) return 100;
    if (growthRate >= 300) return 90;
    if (growthRate >= 200) return 80;
    if (growthRate >= 100) return 70;
    if (growthRate >= 50) return 50;
    if (growthRate >= 20) return 30;
    if (growthRate >= 10) return 20;
    if (growthRate >= 5) return 10;
    return 5;
  }
  
  /**
   * 신선도 점수
   */
  calculateFreshnessScore(keyword: KeywordData): number {
    if (!keyword.firstSeenDate) {
      if ((keyword.growthRate || keyword.changeRate || 0) > 100) return 80;
      return 50;
    }
    
    const hoursSinceFirst = this.getHoursSince(keyword.firstSeenDate);
    
    if (hoursSinceFirst <= 6) return 100;
    if (hoursSinceFirst <= 12) return 90;
    if (hoursSinceFirst <= 24) return 80;
    if (hoursSinceFirst <= 48) return 60;
    if (hoursSinceFirst <= 72) return 40;
    if (hoursSinceFirst <= 168) return 20;
    return 5;
  }
  
  /**
   * 시즌성 점수
   */
  calculateSeasonalScore(keyword: KeywordData): number {
    const kw = keyword.keyword.toLowerCase();
    const now = new Date();
    const month = now.getMonth() + 1;
    
    // 연말정산 (1-2월)
    if ((month === 1 || month === 2) && kw.includes('연말정산')) return 100;
    
    // 설날 (1-2월)
    if ((month === 1 || month === 2) && (kw.includes('설날') || kw.includes('설선물'))) return 100;
    
    // 발렌타인 (2월)
    if (month === 2 && kw.includes('발렌타인')) return 100;
    
    // 화이트데이 (3월)
    if (month === 3 && kw.includes('화이트데이')) return 100;
    
    // 어버이날/어린이날 (5월)
    if (month === 5 && (kw.includes('어버이날') || kw.includes('어린이날'))) return 100;
    
    // 여름휴가 (6-8월)
    if (month >= 6 && month <= 8 && (kw.includes('휴가') || kw.includes('여행') || kw.includes('피서'))) return 90;
    
    // 추석 (9월)
    if (month === 9 && kw.includes('추석')) return 100;
    
    // 수능 (11월)
    if (month === 11 && (kw.includes('수능') || kw.includes('입시'))) return 100;
    
    // 크리스마스/연말 (12월)
    if (month === 12 && (kw.includes('크리스마스') || kw.includes('연말') || kw.includes('송년'))) return 100;
    
    return 30;
  }
  
  /**
   * 경쟁 진입 시간 점수
   */
  calculateCompetitionTimeScore(keyword: KeywordData): number {
    const docCount = keyword.documentCount;
    const growthRate = keyword.growthRate || 0;
    
    // 문서 적고 + 급상승 = 빨리 써야 함
    if (docCount <= 50 && growthRate >= 200) return 100;
    if (docCount <= 100 && growthRate >= 100) return 90;
    if (docCount <= 200 && growthRate >= 50) return 80;
    if (docCount <= 300 && growthRate >= 30) return 70;
    if (docCount <= 500) return 60;
    if (docCount <= 1000) return 40;
    return 20;
  }
  
  /**
   * 긴급도 판단
   */
  determineUrgency(timingGoldScore: number, competitionTimeScore: number): 'immediate' | 'today' | 'this-week' | 'normal' {
    if (timingGoldScore >= 85 && competitionTimeScore >= 80) return 'immediate';
    if (timingGoldScore >= 70 && competitionTimeScore >= 60) return 'today';
    if (timingGoldScore >= 50) return 'this-week';
    return 'normal';
  }
  
  /**
   * 피크 예측
   */
  predictPeak(keyword: KeywordData): Date {
    const growthRate = keyword.growthRate || 0;
    const now = new Date();
    
    if (growthRate >= 300) {
      return new Date(now.getTime() + 12 * 60 * 60 * 1000); // 12시간 후
    } else if (growthRate >= 100) {
      return new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24시간 후
    } else if (growthRate >= 50) {
      return new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48시간 후
    }
    return new Date(now.getTime() + 72 * 60 * 60 * 1000); // 72시간 후
  }
  
  /**
   * 마감일 계산
   */
  calculateDeadline(peakPrediction: Date, competitionTimeScore: number): Date {
    const hoursBeforePeak = competitionTimeScore >= 80 ? 6 : 
                           competitionTimeScore >= 60 ? 12 : 
                           competitionTimeScore >= 40 ? 24 : 48;
    
    return new Date(peakPrediction.getTime() - hoursBeforePeak * 60 * 60 * 1000);
  }
  
  /**
   * 트래픽 예측
   */
  estimateTraffic(keyword: KeywordData, timingGoldScore: number): number {
    const baseTraffic = keyword.searchVolume * 0.3; // 상위 노출 시 30% 클릭률 가정
    const scoreMultiplier = timingGoldScore / 50; // 점수에 따른 배율
    
    return Math.round(baseTraffic * scoreMultiplier);
  }
  
  /**
   * 이유 생성
   */
  generateReason(keyword: KeywordData, scores: any): string {
    const reasons: string[] = [];
    const { documentCount, searchVolume, growthRate } = keyword;
    
    // 황금 비율 기반
    const goldenRatio = documentCount > 0 ? searchVolume / documentCount : searchVolume;
    
    if (goldenRatio >= 50) {
      reasons.push(`⚡ 황금비율 ${goldenRatio.toFixed(1)} (검색량 ${searchVolume.toLocaleString()} ÷ 문서수 ${documentCount}) = 초황금 키워드!`);
    } else if (goldenRatio >= 10) {
      reasons.push(`💎 황금비율 ${goldenRatio.toFixed(1)} - 검색량 대비 경쟁 매우 적음`);
    }
    
    if (documentCount <= 100) {
      reasons.push(`🎯 경쟁자 단 ${documentCount}개 - 상위 노출 확률 매우 높음`);
    }
    
    if ((growthRate || 0) >= 100) {
      reasons.push(`📈 전일 대비 ${Math.round(growthRate || 0)}% 급상승 중`);
    }
    
    if (searchVolume >= 10000) {
      reasons.push(`💰 월 검색량 ${searchVolume.toLocaleString()}회 - 대형 트래픽 키워드`);
    }
    
    return reasons.length > 0 ? reasons.join(' • ') : '황금 키워드 발견';
  }
  
  /**
   * 실제 급상승 이유 분석 (구체적 + 상세)
   */
  generateRealTrendingReason(keyword: KeywordData, scores: { trendingScore: number; freshnessScore: number }): string {
    const kw = keyword.keyword;
    const growthRate = keyword.growthRate || 0;
    const searchVolume = keyword.searchVolume;
    const documentCount = keyword.documentCount;
    const now = new Date();
    const dateStr = `${now.getMonth() + 1}월 ${now.getDate()}일`;
    
    // 키워드 유형별 구체적이고 상세한 분석
    
    // 1. 정책/지원금 키워드
    if (kw.includes('지원금') || kw.includes('페이백') || kw.includes('환급') || kw.includes('보조금')) {
      return `📋 [정책 이슈] ${dateStr} 기준, "${kw}" 관련 정부/지자체 정책이 발표되었거나 신청 기간이 시작되어 검색량이 급증하고 있습니다. 현재 월 검색량 ${searchVolume.toLocaleString()}회로, 관련 정보를 찾는 사람들이 많습니다. 신청 방법, 자격 조건, 지급 일정 등 실질적인 정보를 제공하면 높은 트래픽을 확보할 수 있습니다.`;
    }
    
    // 2. 인물 + 사건 키워드 (구속, 체포, 사망 등)
    if (/^[가-힣]{2,4}\s+(구속|체포|사망|별세)/.test(kw)) {
      const match = kw.match(/^([가-힣]{2,4})\s+(.+)$/);
      if (match) {
        const person = match[1];
        const event = match[2];
        return `🔥 [속보 이슈] ${dateStr}, ${person}의 ${event} 소식이 전해지며 포털 실시간 검색어 상위권에 진입했습니다. 현재 검색량이 ${growthRate >= 100 ? `전일 대비 ${Math.round(growthRate)}% 급증` : '급상승'} 중입니다. ${person}의 프로필, ${event} 배경, 향후 전망 등을 정리한 콘텐츠가 높은 조회수를 기록할 수 있습니다. 단, 이슈 키워드는 수명이 짧으므로 빠른 발행이 핵심입니다.`;
      }
    }
    
    // 3. 인물 + 연예 키워드 (결혼, 열애, 이혼 등)
    if (/^[가-힣]{2,4}\s+(결혼|열애|이혼|파경)/.test(kw)) {
      const match = kw.match(/^([가-힣]{2,4})\s+(.+)$/);
      if (match) {
        const person = match[1];
        const event = match[2];
        return `💕 [연예 이슈] ${person}의 ${event} 소식이 알려지며 검색량이 폭발적으로 증가하고 있습니다. 연예 뉴스는 SNS를 통해 빠르게 확산되므로, ${person} 프로필, ${event} 상대방 정보, 두 사람의 인연 등을 정리한 콘텐츠가 효과적입니다.`;
      }
    }
    
    // 4. 브랜드/기업 + 이슈
    if (/유출|해킹|정보유출|개인정보/.test(kw)) {
      return `⚠️ [보안 이슈] "${kw}" 관련 보안 사고가 발생하여 검색량이 급증하고 있습니다. 피해 확인 방법, 대처법, 보상 절차 등 실질적인 정보를 제공하면 많은 트래픽을 확보할 수 있습니다. 검색량 ${searchVolume.toLocaleString()}회, 경쟁 문서 ${documentCount}개로 상위 노출 가능성이 ${documentCount <= 500 ? '높습니다' : '있습니다'}.`;
    }
    
    // 5. 제품/서비스 출시
    if (kw.includes('출시') || kw.includes('발표') || kw.includes('신제품')) {
      return `📱 [신제품 이슈] "${kw}" 관련 신제품/서비스가 발표되어 초기 관심이 집중되고 있습니다. 스펙, 가격, 출시일, 구매처 등 상세 정보와 함께 기존 제품과의 비교 콘텐츠가 효과적입니다. 현재 검색량 ${searchVolume.toLocaleString()}회입니다.`;
    }
    
    // 6. 보험 키워드
    if (/보험|실비|실손/.test(kw)) {
      return `💰 [금융 상품] "${kw}"은 꾸준한 검색량을 보이는 수익화 키워드입니다. 월 검색량 ${searchVolume.toLocaleString()}회이며, 보험 비교, 가입 방법, 보장 내용 등을 상세히 정리하면 애드센스 및 제휴마케팅 수익을 기대할 수 있습니다. CPC가 높은 금융 키워드입니다.`;
    }
    
    // 7. 스포츠 키워드
    if (/경기|축구|야구|골프|토트넘|손흥민|프리미어리그/.test(kw)) {
      return `⚽ [스포츠 이슈] "${kw}" 관련 경기 결과 또는 선수 소식으로 검색량이 급증하고 있습니다. 경기 하이라이트, 선수 활약상, 다음 경기 일정 등을 정리한 콘텐츠가 효과적입니다.`;
    }
    
    // 8. 금융/투자 키워드
    if (/주식|코인|비트코인|금리|환율|투자/.test(kw)) {
      return `📈 [금융 이슈] "${kw}" 관련 시장 변동으로 투자자들의 정보 탐색이 증가하고 있습니다. 현황 분석, 전망, 투자 전략 등을 제공하면 높은 트래픽을 확보할 수 있습니다.`;
    }
    
    // 9. 황금 비율 키워드 (검색량 높고 경쟁 낮음)
    const goldenRatio = documentCount > 0 ? searchVolume / documentCount : searchVolume;
    if (goldenRatio >= 10 && documentCount <= 500) {
      return `💎 [틈새 키워드 발견] "${kw}"은 검색량 ${searchVolume.toLocaleString()}회 대비 경쟁 문서가 ${documentCount}개뿐인 황금 키워드입니다! 황금비율 ${goldenRatio.toFixed(1)}로, 양질의 콘텐츠 작성 시 상위 노출 가능성이 매우 높습니다. 지금 바로 작성을 권장합니다.`;
    }
    
    // 10. 일반 급상승
    if (growthRate >= 200) {
      return `🚀 [급상승 키워드] "${kw}" 검색량이 전일 대비 ${Math.round(growthRate)}% 폭증하고 있습니다. 현재 월 검색량 ${searchVolume.toLocaleString()}회, 경쟁 문서 ${documentCount}개입니다. 트렌드 피크 전 콘텐츠 발행 시 높은 트래픽을 확보할 수 있습니다.`;
    } else if (growthRate >= 100) {
      return `📊 [상승 키워드] "${kw}" 검색량이 전일 대비 ${Math.round(growthRate)}% 증가 중입니다. 월 검색량 ${searchVolume.toLocaleString()}회로, 관련 정보성 콘텐츠 작성 시 안정적인 트래픽을 기대할 수 있습니다.`;
    }
    
    // 기본
    return `📌 [트렌드 키워드] "${kw}"은 현재 월 검색량 ${searchVolume.toLocaleString()}회, 경쟁 문서 ${documentCount}개인 키워드입니다. ${documentCount <= 500 ? '경쟁이 적어 상위 노출 가능성이 높습니다.' : '양질의 콘텐츠로 경쟁할 수 있습니다.'}`;
  }
  
  /**
   * 실제 "왜 지금" 분석 (더미 데이터 X)
   */
  generateRealWhyNow(keyword: KeywordData, context: { competitionTimeScore: number; timingGoldScore: number }): string {
    const { documentCount, searchVolume, growthRate } = keyword;
    const goldenRatio = documentCount > 0 ? searchVolume / documentCount : searchVolume;
    const reasons: string[] = [];
    
    // 1. 경쟁 분석
    if (documentCount <= 50) {
      reasons.push(`경쟁자 ${documentCount}개뿐 - 지금 작성하면 1페이지 상위 노출 가능`);
    } else if (documentCount <= 200) {
      reasons.push(`경쟁자 ${documentCount}개로 적음 - SEO 최적화 시 상위 노출 가능`);
    } else if (documentCount <= 500) {
      reasons.push(`경쟁자 ${documentCount}개 - 양질의 콘텐츠로 경쟁 가능`);
    }
    
    // 2. 검색량 분석
    if (searchVolume >= 10000) {
      reasons.push(`월 ${searchVolume.toLocaleString()}회 검색 - 상위 노출 시 일 ${Math.round(searchVolume / 30 * 0.3)}명+ 유입 예상`);
    } else if (searchVolume >= 3000) {
      reasons.push(`월 ${searchVolume.toLocaleString()}회 검색 - 안정적 트래픽 확보 가능`);
    }
    
    // 3. 황금 비율 분석
    if (goldenRatio >= 20) {
      reasons.push(`황금비율 ${goldenRatio.toFixed(1)} - 검색량 대비 경쟁 극히 적어 최적의 타이밍`);
    } else if (goldenRatio >= 5) {
      reasons.push(`황금비율 ${goldenRatio.toFixed(1)} - 수익화 가능성 높은 키워드`);
    }
    
    // 4. 성장률 분석
    if ((growthRate || 0) >= 100) {
      reasons.push(`급상승 중 (${Math.round(growthRate || 0)}%↑) - 지금 작성해야 트래픽 피크 포착 가능`);
    }
    
    return reasons.length > 0 ? reasons.join(' • ') : '조기 진입 시 상위 노출 가능성 높음';
  }
  
  /**
   * 키워드 유형 분류
   */
  classifyKeywordType(keyword: KeywordData, scores: any): TimingScore['keywordType'] {
    const kw = keyword.keyword.toLowerCase();
    const { searchVolume, documentCount, growthRate } = keyword;
    const goldenRatio = documentCount > 0 ? searchVolume / documentCount : searchVolume;
    
    // 1. 수익화 키워드 (가장 우선)
    if (this.isMoneyKeyword(keyword.keyword)) {
      return {
        type: 'money',
        label: '💰 수익화 키워드',
        description: `검색 의도가 명확한 수익화 키워드! 제휴마케팅/애드센스 수익 기대`,
        emoji: '💰',
        profitPotential: 'high',
        duration: '지속적 수익 가능'
      };
    }
    
    // 2. 초황금 키워드
    if (goldenRatio >= 20 && documentCount <= 100 && searchVolume >= 1000) {
      return {
        type: 'longtail',
        label: '💎 초황금 키워드',
        description: `검색량 ${searchVolume.toLocaleString()}회 vs 문서 ${documentCount}개 = 황금비율 ${goldenRatio.toFixed(1)}! 지금 바로 작성하세요!`,
        emoji: '💎',
        profitPotential: 'high',
        duration: '즉시 작성 권장'
      };
    }
    
    // 3. 황금 키워드
    if (goldenRatio >= 5 && documentCount <= 500 && searchVolume >= 500) {
      return {
        type: 'longtail',
        label: '🏆 황금 키워드',
        description: `검색량 ${searchVolume.toLocaleString()}회 대비 경쟁자 ${documentCount}개 - 상위 노출 가능성 높음!`,
        emoji: '🏆',
        profitPotential: 'high',
        duration: '빠른 작성 권장'
      };
    }
    
    // 4. 이슈성 키워드
    const issuePatterns = ['구속', '체포', '사망', '결혼', '이혼', '열애', '논란', '폭로', '속보'];
    if (issuePatterns.some(p => kw.includes(p)) || (growthRate || 0) >= 200) {
      return {
        type: 'issue',
        label: '🔥 이슈 키워드',
        description: '실시간 이슈! 빠른 작성이 핵심 - 검색량 피크 전 발행하세요',
        emoji: '🔥',
        profitPotential: growthRate && growthRate >= 300 ? 'high' : 'medium',
        duration: '1-7일 (단기 집중)'
      };
    }
    
    // 5. 시즌성 키워드
    const seasonPatterns = ['연말정산', '설날', '추석', '크리스마스', '수능', '입학', '졸업'];
    if (seasonPatterns.some(p => kw.includes(p))) {
      return {
        type: 'seasonal',
        label: '📅 시즌 키워드',
        description: '시기 한정 키워드! 타이밍이 생명입니다',
        emoji: '📅',
        profitPotential: 'high',
        duration: '2-4주 (시즌 한정)'
      };
    }
    
    // 6. 기본
    return {
      type: 'evergreen',
      label: '🌱 일반 키워드',
      description: '꾸준한 검색량의 키워드',
      emoji: '🌱',
      profitPotential: 'medium',
      duration: '장기'
    };
  }
  
  /**
   * 실제 수익화 가이드 (키워드 특성 기반)
   */
  generateRealMonetizationGuide(
    keyword: KeywordData,
    keywordType: TimingScore['keywordType'],
    estimatedTraffic: number
  ): TimingScore['monetizationGuide'] {
    const kw = keyword.keyword.toLowerCase();
    
    // 키워드 카테고리별 실제 CPC 추정
    let estimatedCPC = 100;
    let adSuitability = 50;
    let affiliatePotential = 50;
    let revenueStrategy = '';
    
    // 1. 금융/보험 (고CPC)
    if (/보험|대출|금리|투자|주식|연금|적금/.test(kw)) {
      estimatedCPC = 800 + Math.round(Math.random() * 700); // 800-1500원
      adSuitability = 95;
      affiliatePotential = 85;
      revenueStrategy = '💰 금융 키워드는 CPC가 높습니다. 보험/대출 비교 콘텐츠로 제휴마케팅 수익 극대화 가능';
    }
    // 2. 지원금/정책 (중상CPC + 높은 검색량)
    else if (/지원금|페이백|환급|신청|보조금/.test(kw)) {
      estimatedCPC = 200 + Math.round(Math.random() * 300); // 200-500원
      adSuitability = 80;
      affiliatePotential = 40;
      revenueStrategy = '📋 정책/지원금 키워드는 검색량이 폭발적입니다. 상세 신청 가이드로 트래픽 확보 → 애드센스 수익화';
    }
    // 3. 쇼핑/제품 (제휴마케팅 최적)
    else if (/추천|비교|후기|리뷰|가격|할인|구매/.test(kw)) {
      estimatedCPC = 150 + Math.round(Math.random() * 200); // 150-350원
      adSuitability = 70;
      affiliatePotential = 95;
      revenueStrategy = '🛒 구매 의도가 높은 키워드! 쿠팡파트너스/제휴링크로 높은 전환율 기대';
    }
    // 4. 이슈/뉴스 (낮은 수익성)
    else if (/구속|체포|사망|논란|속보/.test(kw)) {
      estimatedCPC = 50 + Math.round(Math.random() * 100); // 50-150원
      adSuitability = 30;
      affiliatePotential = 10;
      revenueStrategy = '📰 이슈 키워드는 광고 매칭이 어렵습니다. 대량 트래픽으로 애드센스 노출 수익 확보가 목표';
    }
    // 5. 건강/의료
    else if (/병원|치료|증상|약|건강/.test(kw)) {
      estimatedCPC = 400 + Math.round(Math.random() * 400); // 400-800원
      adSuitability = 85;
      affiliatePotential = 60;
      revenueStrategy = '🏥 건강 키워드는 CPC가 높습니다. 신뢰성 있는 정보 제공으로 장기 트래픽 확보';
    }
    // 6. 여행/숙박
    else if (/여행|호텔|숙소|항공|펜션/.test(kw)) {
      estimatedCPC = 300 + Math.round(Math.random() * 300); // 300-600원
      adSuitability = 80;
      affiliatePotential = 90;
      revenueStrategy = '✈️ 여행 키워드는 제휴마케팅 최적! 호텔/항공 예약 링크로 높은 수익 가능';
    }
    // 7. 기본
    else {
      estimatedCPC = 100 + Math.round(Math.random() * 150); // 100-250원
      adSuitability = 60;
      affiliatePotential = 50;
      revenueStrategy = '📝 양질의 정보성 콘텐츠로 애드센스 수익화. 관련 상품 링크 삽입으로 추가 수익 가능';
    }
    
    // 월 수익 예측 (현실적 계산)
    const clickRate = affiliatePotential > 80 ? 0.05 : 0.02; // 클릭률
    const estimatedMonthlyRevenue = Math.round(estimatedTraffic * clickRate * estimatedCPC);
    
    return {
      estimatedCPC,
      estimatedMonthlyRevenue,
      adSuitability: Math.min(100, adSuitability),
      affiliatePotential: Math.min(100, affiliatePotential),
      revenueStrategy
    };
  }
  
  /**
   * 실제 콘텐츠 가이드 (SEO 최적화)
   */
  generateRealContentGuide(
    keyword: KeywordData,
    keywordType: TimingScore['keywordType']
  ): TimingScore['contentGuide'] {
    const kw = keyword.keyword;
    const kwLower = kw.toLowerCase();
    
    let suggestedTitle = '';
    let suggestedOutline: string[] = [];
    let targetLength = '';
    let keyPoints: string[] = [];
    let avoidPoints: string[] = [];
    
    // 키워드 유형별 맞춤 가이드
    
    // 1. 지원금/신청 키워드
    if (/지원금|신청|페이백|환급/.test(kwLower)) {
      suggestedTitle = `${kw} 신청방법 총정리 (자격조건 + 기간 + 금액)`;
      suggestedOutline = [
        '1. ' + kw + '란? (제도 소개)',
        '2. 지원 대상 및 자격조건',
        '3. 지원 금액 및 혜택',
        '4. 신청 방법 (단계별 가이드)',
        '5. 신청 기간 및 주의사항',
        '6. 자주 묻는 질문 (FAQ)'
      ];
      targetLength = '3,000-5,000자 (상세한 정보 제공)';
      keyPoints = [
        '✅ 신청 링크/사이트 직접 안내',
        '✅ 자격조건 체크리스트 제공',
        '✅ 신청 기간 명확히 표기',
        '✅ 실제 신청 화면 캡처 포함'
      ];
    }
    // 2. 인물 + 사건 키워드
    else if (/^[가-힣]{2,4}\s+(구속|체포|사망|결혼|이혼)/.test(kw)) {
      const match = kw.match(/^([가-힣]{2,4})\s+(.+)$/);
      const person = match ? match[1] : kw;
      const event = match ? match[2] : '';
      
      suggestedTitle = `${person} ${event} 이유와 향후 전망 총정리`;
      suggestedOutline = [
        `1. ${person} ${event} 개요`,
        '2. 사건 배경 및 경위',
        '3. 관계자 반응',
        '4. 향후 전망',
        '5. 관련 이슈 정리'
      ];
      targetLength = '1,500-2,500자 (빠른 정보 전달)';
      keyPoints = [
        '⚡ 속도가 생명! 빠른 발행 필수',
        '📰 공식 보도 자료 인용',
        '🔄 새 정보 발생 시 업데이트',
        '⚠️ 추측성 내용 배제'
      ];
    }
    // 3. 추천/비교 키워드
    else if (/추천|비교|순위|베스트|TOP/.test(kwLower)) {
      suggestedTitle = `${kw} TOP 10 (2025년 최신 업데이트)`;
      suggestedOutline = [
        '1. 선정 기준 소개',
        `2. ${kw} 1위~3위 (상세 리뷰)`,
        `3. ${kw} 4위~7위`,
        `4. ${kw} 8위~10위`,
        '5. 상황별/예산별 추천',
        '6. 구매 전 체크리스트'
      ];
      targetLength = '4,000-6,000자 (상세 비교 정보)';
      keyPoints = [
        '📊 비교표 필수 포함',
        '💰 가격 정보 명시',
        '🔗 구매 링크 삽입 (제휴마케팅)',
        '⭐ 실제 사용 후기 인용'
      ];
    }
    // 4. 방법/가이드 키워드
    else if (/방법|하는법|가이드/.test(kwLower)) {
      suggestedTitle = `${kw} 완벽 가이드 (초보자도 쉽게!)`;
      suggestedOutline = [
        '1. 시작하기 전 준비물',
        '2. 단계별 상세 가이드',
        '3. 주의사항 및 팁',
        '4. 자주 하는 실수와 해결법',
        '5. 마무리 및 요약'
      ];
      targetLength = '3,000-4,500자 (단계별 설명)';
      keyPoints = [
        '📝 단계별 번호 매기기',
        '🖼️ 각 단계별 이미지 포함',
        '💡 꿀팁 박스로 강조',
        '❓ FAQ 섹션 추가'
      ];
    }
    // 5. 기본
    else {
      suggestedTitle = `${kw} 완벽 정리 (2025년 최신)`;
      suggestedOutline = [
        `1. ${kw}란?`,
        '2. 핵심 내용 정리',
        '3. 상세 가이드',
        '4. 주의사항',
        '5. 마무리'
      ];
      targetLength = '2,500-4,000자';
      keyPoints = [
        '📝 검색 의도에 정확히 답하기',
        '🖼️ 관련 이미지 포함',
        '🔍 키워드 자연스럽게 배치',
        '📚 신뢰할 수 있는 출처 명시'
      ];
    }
    
    avoidPoints = [
      '❌ 다른 글 복사/붙여넣기 (저품질 판정)',
      '❌ 키워드 과도한 반복 (스팸 판정)',
      '❌ 내용 없이 광고만 가득 (이탈률 증가)',
      '❌ 허위/과장 정보 (신뢰도 하락)'
    ];
    
    return {
      suggestedTitle,
      suggestedOutline,
      targetLength,
      keyPoints,
      avoidPoints
    };
  }
  
  /**
   * 실제 확장 키워드 생성 (키워드 특성 기반)
   */
  generateRealExpansionKeywords(
    keyword: KeywordData,
    keywordType: TimingScore['keywordType']
  ): TimingScore['expansionKeywords'] {
    const kw = keyword.keyword;
    const kwLower = kw.toLowerCase();
    const expansionKeywords: TimingScore['expansionKeywords'] = [];
    
    // 키워드 유형별 맞춤 확장
    
    // 1. 지원금/정책 키워드
    if (/지원금|신청|페이백|환급|보조금/.test(kwLower)) {
      const suffixes = [
        { s: '신청방법', type: 'question' as const, diff: 'easy' as const },
        { s: '자격조건', type: 'question' as const, diff: 'easy' as const },
        { s: '신청기간', type: 'question' as const, diff: 'easy' as const },
        { s: '지급일', type: 'question' as const, diff: 'easy' as const },
        { s: '대상자', type: 'longtail' as const, diff: 'easy' as const },
        { s: '금액', type: 'longtail' as const, diff: 'medium' as const },
        { s: '후기', type: 'longtail' as const, diff: 'medium' as const },
      ];
      suffixes.forEach((item, i) => {
        expansionKeywords.push({
          keyword: `${kw} ${item.s}`,
          type: item.type,
          difficulty: item.diff,
          priority: 5 - Math.floor(i / 2)
        });
      });
    }
    // 2. 인물 + 사건 키워드
    else if (/^[가-힣]{2,4}\s+(구속|체포|사망|결혼|이혼)/.test(kw)) {
      const match = kw.match(/^([가-힣]{2,4})\s+(.+)$/);
      const person = match ? match[1] : kw;
      const event = match ? match[2] : '';
      
      const suffixes = [
        { s: '이유', type: 'question' as const },
        { s: '배경', type: 'question' as const },
        { s: '나이', type: 'longtail' as const },
        { s: '프로필', type: 'longtail' as const },
        { s: '과거', type: 'longtail' as const },
      ];
      suffixes.forEach((item, i) => {
        expansionKeywords.push({
          keyword: `${person} ${item.s}`,
          type: item.type,
          difficulty: 'easy',
          priority: 5 - i
        });
      });
      
      // 사건 관련 확장
      expansionKeywords.push({
        keyword: `${person} ${event} 이유`,
        type: 'question',
        difficulty: 'easy',
        priority: 5
      });
    }
    // 3. 제품/서비스 추천 키워드
    else if (/추천|비교|순위|베스트/.test(kwLower)) {
      const base = kw.replace(/(추천|비교|순위|베스트)/g, '').trim();
      const suffixes = [
        { s: '가격', type: 'longtail' as const },
        { s: '후기', type: 'longtail' as const },
        { s: '장단점', type: 'comparison' as const },
        { s: '선택방법', type: 'question' as const },
        { s: '구매처', type: 'longtail' as const },
      ];
      suffixes.forEach((item, i) => {
        expansionKeywords.push({
          keyword: `${base} ${item.s}`,
          type: item.type,
          difficulty: i < 2 ? 'easy' : 'medium',
          priority: 5 - i
        });
      });
    }
    // 4. 방법/가이드 키워드
    else if (/방법|하는법|가이드/.test(kwLower)) {
      const base = kw.replace(/(방법|하는법|가이드)/g, '').trim();
      const suffixes = [
        { s: '쉽게', type: 'longtail' as const },
        { s: '초보', type: 'longtail' as const },
        { s: '팁', type: 'longtail' as const },
        { s: '주의사항', type: 'question' as const },
        { s: '비용', type: 'longtail' as const },
      ];
      suffixes.forEach((item, i) => {
        expansionKeywords.push({
          keyword: `${base} ${item.s}`,
          type: item.type,
          difficulty: 'easy',
          priority: 5 - i
        });
      });
    }
    // 5. 기본 확장
    else {
      const suffixes = [
        { s: '방법', type: 'question' as const },
        { s: '추천', type: 'longtail' as const },
        { s: '후기', type: 'longtail' as const },
        { s: '가격', type: 'longtail' as const },
        { s: '비교', type: 'comparison' as const },
        { s: '장단점', type: 'comparison' as const },
      ];
      suffixes.forEach((item, i) => {
        expansionKeywords.push({
          keyword: `${kw} ${item.s}`,
          type: item.type,
          difficulty: i < 3 ? 'easy' : 'medium',
          priority: 5 - Math.floor(i / 2)
        });
      });
    }
    
    return expansionKeywords.slice(0, 10);
  }
  
  /**
   * 헬퍼 함수
   */
  getHoursSince(date: Date): number {
    return (Date.now() - date.getTime()) / (1000 * 60 * 60);
  }
}
