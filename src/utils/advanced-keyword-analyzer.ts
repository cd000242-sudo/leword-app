/**
 * 고급 키워드 분석 시스템
 * "돈으로 환산할 수 없을 정도의 기능"을 제공하는 트래픽 폭발 예측 엔진
 */

import { EnvironmentManager } from './environment-manager';

export interface AdvancedKeywordAnalysis {
  keyword: string;
  
  // 1. 경쟁자 품질 분석
  competitionQuality: {
    avgQualityScore: number; // 경쟁자 평균 품질 점수 (0-100)
    topCompetitorCount: number; // 상위 경쟁자 수
    beatableScore: number; // 우리가 이길 수 있는 가능성 (0-100)
    competitorWeaknesses: string[]; // 경쟁자들의 약점
    differentiationOpportunity: string; // 차별화 기회
  };
  
  // 2. 실시간 검색 트렌드 분석
  searchTrendAnalysis: {
    trendPattern: 'explosive' | 'growing' | 'stable' | 'declining'; // 트렌드 패턴
    growthVelocity: number; // 시간당 증가율
    peakPrediction: {
      date: Date; // 예상 피크 날짜
      confidence: number; // 신뢰도 (0-100)
      searchVolumeAtPeak: number; // 피크 시 검색량
    };
    lifecycleStage: 'emerging' | 'rising' | 'peak' | 'declining' | 'dead'; // 수명주기 단계
    remainingHotDays: number; // 남은 인기 기간 (일)
  };
  
  // 3. 실제 트래픽 예측
  trafficPrediction: {
    estimatedMonthlyTraffic: number; // 예상 월간 트래픽
    estimatedDailyTraffic: number; // 예상 일일 트래픽
    top10Traffic: number; // 상위 10개 진입 시 트래픽
    top3Traffic: number; // 상위 3개 진입 시 트래Fㅔ픽
    clickThroughRate: number; // 예상 CTR (%)
    trafficConfidence: number; // 트래픽 예측 신뢰도 (0-100)
  };
  
  // 4. 수익화 잠재력
  monetizationPotential: {
    estimatedMonthlyRevenue: number; // 예상 월간 수익 (원)
    cpc: number; // 예상 클릭당 비용
    adRelevance: number; // 광고 관련성 (0-100)
    revenueConfidence: number; // 수익 예측 신뢰도 (0-100)
    revenueFactors: string[]; // 수익에 영향을 주는 요소
  };
  
  // 5. AI 기반 급상승 이유 분석
  aiInsight: {
    trendingReason: string; // 왜 급상승했는지 (AI 분석)
    newsContext: string[]; // 관련 뉴스 맥락
    socialMentions: number; // SNS 언급량 추정
    viralPotential: number; // 바이럴 가능성 (0-100)
    stayingPower: number; // 지속 가능성 (0-100)
  };
  
  // 6. 최적 진입 시점
  optimalEntry: {
    bestTimeToPublish: Date; // 최적 발행 시간
    urgency: 'critical' | 'high' | 'medium' | 'low'; // 긴급도
    timeWindow: string; // 유효한 시간 창
    competitionGrowth: number; // 경쟁자 증가율 (시간당)
  };
  
  // 7. 종합 점수
  overallScore: {
    trafficExplosionScore: number; // 트래픽 폭발 점수 (0-100)
    monetizationScore: number; // 수익화 점수 (0-100)
    competitionScore: number; // 경쟁 우위 점수 (0-100)
    timingScore: number; // 타이밍 점수 (0-100)
    finalScore: number; // 최종 종합 점수 (0-100)
  };
}

export class AdvancedKeywordAnalyzer {
  
  /**
   * 고급 키워드 분석 수행
   */
  async analyzeAdvanced(keyword: string, searchVolume: number, documentCount: number, growthRate: number): Promise<AdvancedKeywordAnalysis> {
    console.log(`[ADVANCED-ANALYZER] "${keyword}" 고급 분석 시작...`);
    
    // 병렬로 모든 분석 수행
    const [
      competitionQuality,
      searchTrendAnalysis,
      trafficPrediction,
      monetizationPotential,
      aiInsight,
      optimalEntry
    ] = await Promise.all([
      this.analyzeCompetitionQuality(keyword, documentCount),
      this.analyzeSearchTrend(keyword, searchVolume, growthRate),
      this.predictTraffic(keyword, searchVolume, documentCount),
      this.analyzeMonetization(keyword, searchVolume, documentCount),
      this.analyzeAIInsight(keyword, growthRate),
      this.calculateOptimalEntry(keyword, growthRate, documentCount)
    ]);
    
    // 종합 점수 계산
    const overallScore = this.calculateOverallScore({
      competitionQuality,
      searchTrendAnalysis,
      trafficPrediction,
      monetizationPotential,
      aiInsight,
      optimalEntry
    });
    
    return {
      keyword,
      competitionQuality,
      searchTrendAnalysis,
      trafficPrediction,
      monetizationPotential,
      aiInsight,
      optimalEntry,
      overallScore
    };
  }
  
  /**
   * 경쟁자 품질 분석
   */
  private async analyzeCompetitionQuality(keyword: string, documentCount: number): Promise<AdvancedKeywordAnalysis['competitionQuality']> {
    try {
      const envManager = EnvironmentManager.getInstance();
      const env = envManager.getConfig();
      const naverClientId = env.naverClientId || process.env['NAVER_CLIENT_ID'] || '';
      const naverClientSecret = env.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '';
      
      // 네이버 블로그 검색 결과 분석
      const apiUrl = 'https://openapi.naver.com/v1/search/blog.json';
      const params = new URLSearchParams({
        query: keyword,
        display: '10', // 상위 10개 분석
        sort: 'sim' // 정확도 순
      });
      
      let topCompetitorCount = Math.min(documentCount, 10);
      let avgQualityScore = 70; // 기본값
      let beatableScore = 60; // 기본값
      const competitorWeaknesses: string[] = [];
      let differentiationOpportunity = '기본적인 정보 제공';
      
      if (naverClientId && naverClientSecret) {
        try {
          const response = await fetch(`${apiUrl}?${params}`, {
            headers: {
              'X-Naver-Client-Id': naverClientId,
              'X-Naver-Client-Secret': naverClientSecret
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            const items = data.items || [];
            
            topCompetitorCount = items.length;
            
            // 상위 콘텐츠들의 품질 분석
            let totalQuality = 0;
            const weaknesses: Set<string> = new Set();
            
            items.forEach((item: any, index: number) => {
              const title = item.title || '';
              const description = item.description || '';
              
              // 품질 점수 계산
              let quality = 50; // 기본 점수
              
              // 제목 길이 (20-50자 최적)
              if (title.length >= 20 && title.length <= 50) quality += 10;
              else if (title.length < 20) quality -= 5;
              
              // 설명 길이 (100자 이상이면 좋음)
              if (description.length >= 100) quality += 10;
              else if (description.length < 50) quality -= 10;
              
              // 키워드 포함 여부
              if (title.toLowerCase().includes(keyword.toLowerCase())) quality += 10;
              if (description.toLowerCase().includes(keyword.toLowerCase())) quality += 5;
              
              // 숫자/리스트 포함 (구체적 정보)
              if (/\d+/.test(title) || /[1-9]\.|첫째|둘째|셋째/.test(description)) quality += 10;
              
              // 질문형 제목 (약점)
              if (/^[가-힣]*\?/.test(title) || /어떻게|왜|무엇/.test(title)) {
                quality -= 5;
                weaknesses.add('질문형 제목 (클릭률 낮음)');
              }
              
              // 짧은 설명 (약점)
              if (description.length < 100) {
                weaknesses.add('설명 부족 (상위 콘텐츠 품질 낮음)');
              }
              
              totalQuality += Math.max(0, Math.min(100, quality));
            });
            
            avgQualityScore = items.length > 0 ? Math.round(totalQuality / items.length) : 70;
            
            // 우리가 이길 수 있는 가능성
            if (avgQualityScore < 60) beatableScore = 90;
            else if (avgQualityScore < 70) beatableScore = 75;
            else if (avgQualityScore < 80) beatableScore = 60;
            else beatableScore = 40;
            
            // 경쟁자 약점 분석
            competitorWeaknesses.push(...Array.from(weaknesses));
            
            // 차별화 기회
            if (avgQualityScore < 60) {
              differentiationOpportunity = '경쟁자 품질이 낮아 고품질 콘텐츠로 쉽게 이길 수 있음';
            } else if (documentCount < 100) {
              differentiationOpportunity = '경쟁자가 적어 조기 진입 시 상위 노출 가능';
            } else {
              differentiationOpportunity = '구체적 정보, 실용적 팁, 최신 데이터로 차별화 가능';
            }
          }
        } catch (error: any) {
          console.warn(`[ADVANCED-ANALYZER] 경쟁자 분석 실패:`, error.message);
        }
      }
      
      return {
        avgQualityScore,
        topCompetitorCount,
        beatableScore,
        competitorWeaknesses: competitorWeaknesses.slice(0, 5),
        differentiationOpportunity
      };
    } catch (error: any) {
      console.warn(`[ADVANCED-ANALYZER] 경쟁자 품질 분석 실패:`, error.message);
      return {
        avgQualityScore: 70,
        topCompetitorCount: documentCount,
        beatableScore: 60,
        competitorWeaknesses: [],
        differentiationOpportunity: '기본적인 정보 제공'
      };
    }
  }
  
  /**
   * 실시간 검색 트렌드 분석
   */
  private async analyzeSearchTrend(keyword: string, searchVolume: number, growthRate: number): Promise<AdvancedKeywordAnalysis['searchTrendAnalysis']> {
    // 트렌드 패턴 판단
    let trendPattern: 'explosive' | 'growing' | 'stable' | 'declining';
    if (growthRate >= 300) trendPattern = 'explosive';
    else if (growthRate >= 100) trendPattern = 'growing';
    else if (growthRate >= 0) trendPattern = 'stable';
    else trendPattern = 'declining';
    
    // 시간당 증가율 계산
    const growthVelocity = growthRate >= 0 ? growthRate / 24 : 0; // 일일 증가율을 시간당으로
    
    // 피크 예측
    const now = new Date();
    let peakDate: Date;
    let confidence: number;
    let searchVolumeAtPeak: number;
    
    if (growthRate >= 300) {
      peakDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 1일 후
      confidence = 85;
      searchVolumeAtPeak = Math.floor(searchVolume * (1 + growthRate / 100));
    } else if (growthRate >= 200) {
      peakDate = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 2일 후
      confidence = 75;
      searchVolumeAtPeak = Math.floor(searchVolume * (1 + growthRate / 100 * 0.8));
    } else if (growthRate >= 100) {
      peakDate = new Date(now.getTime() + 72 * 60 * 60 * 1000); // 3일 후
      confidence = 65;
      searchVolumeAtPeak = Math.floor(searchVolume * (1 + growthRate / 100 * 0.6));
    } else {
      peakDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7일 후
      confidence = 50;
      searchVolumeAtPeak = Math.floor(searchVolume * 1.2);
    }
    
    // 수명주기 단계
    let lifecycleStage: 'emerging' | 'rising' | 'peak' | 'declining' | 'dead';
    let remainingHotDays: number;
    
    if (growthRate >= 300) {
      lifecycleStage = 'emerging';
      remainingHotDays = 3;
    } else if (growthRate >= 100) {
      lifecycleStage = 'rising';
      remainingHotDays = 7;
    } else if (growthRate >= 0) {
      lifecycleStage = 'peak';
      remainingHotDays = 14;
    } else {
      lifecycleStage = 'declining';
      remainingHotDays = 7;
    }
    
    return {
      trendPattern,
      growthVelocity,
      peakPrediction: {
        date: peakDate,
        confidence,
        searchVolumeAtPeak
      },
      lifecycleStage,
      remainingHotDays
    };
  }
  
  /**
   * 실제 트래픽 예측
   */
  private async predictTraffic(keyword: string, searchVolume: number, documentCount: number): Promise<AdvancedKeywordAnalysis['trafficPrediction']> {
    // CTR 계산 (경쟁이 적을수록 높음)
    let clickThroughRate: number;
    if (documentCount <= 10) clickThroughRate = 35; // 상위 10개 진입 시 35% CTR
    else if (documentCount <= 50) clickThroughRate = 25;
    else if (documentCount <= 100) clickThroughRate = 18;
    else if (documentCount <= 500) clickThroughRate = 12;
    else clickThroughRate = 8;
    
    // 예상 순위별 트래픽
    const top10Traffic = Math.floor(searchVolume * (clickThroughRate / 100) * 0.3); // 상위 10개 중 30% 획득 가정
    const top3Traffic = Math.floor(searchVolume * (clickThroughRate / 100) * 0.5); // 상위 3개 중 50% 획득 가정
    
    // 월간 트래픽 (일일 검색량 × 30)
    const estimatedDailyTraffic = Math.floor(searchVolume * (clickThroughRate / 100) * 0.2); // 상위 노출 시 일일 트래픽
    const estimatedMonthlyTraffic = estimatedDailyTraffic * 30;
    
    // 신뢰도 계산
    const trafficConfidence = documentCount <= 100 ? 80 : documentCount <= 500 ? 60 : 40;
    
    return {
      estimatedMonthlyTraffic,
      estimatedDailyTraffic,
      top10Traffic,
      top3Traffic,
      clickThroughRate,
      trafficConfidence
    };
  }
  
  /**
   * 수익화 잠재력 분석
   */
  private async analyzeMonetization(keyword: string, searchVolume: number, documentCount: number): Promise<AdvancedKeywordAnalysis['monetizationPotential']> {
    // 키워드별 CPC 추정 (카테고리 기반)
    let cpc = 500; // 기본값 (원)
    let adRelevance = 70; // 기본값
    
    const keywordLower = keyword.toLowerCase();
    
    // 고수익 카테고리
    if (/금융|투자|대출|보험|주식|부동산/.test(keywordLower)) {
      cpc = 2000;
      adRelevance = 95;
    } else if (/의료|병원|치료|약품|건강/.test(keywordLower)) {
      cpc = 1500;
      adRelevance = 90;
    } else if (/교육|학원|강의|자격증/.test(keywordLower)) {
      cpc = 1200;
      adRelevance = 85;
    } else if (/여행|호텔|항공|예약/.test(keywordLower)) {
      cpc = 1000;
      adRelevance = 80;
    } else if (/쇼핑|구매|할인|이벤트/.test(keywordLower)) {
      cpc = 800;
      adRelevance = 75;
    } else {
      cpc = 500;
      adRelevance = 70;
    }
    
    // 예상 월간 수익 계산
    const trafficPrediction = await this.predictTraffic(keyword, searchVolume, documentCount);
    const estimatedMonthlyRevenue = Math.floor(trafficPrediction.estimatedMonthlyTraffic * (cpc / 1000)); // CTR 고려
    
    // 수익 예측 신뢰도
    const revenueConfidence = documentCount <= 100 ? 85 : documentCount <= 500 ? 65 : 45;
    
    // 수익 요소
    const revenueFactors: string[] = [];
    if (cpc >= 1500) revenueFactors.push('고수익 카테고리');
    if (documentCount <= 100) revenueFactors.push('경쟁 적음 (상위 노출 가능)');
    if (trafficPrediction.estimatedMonthlyTraffic >= 1000) revenueFactors.push('높은 트래픽 예상');
    
    return {
      estimatedMonthlyRevenue,
      cpc,
      adRelevance,
      revenueConfidence,
      revenueFactors
    };
  }
  
  /**
   * AI 기반 인사이트 분석
   */
  private async analyzeAIInsight(keyword: string, growthRate: number): Promise<AdvancedKeywordAnalysis['aiInsight']> {
    // 실제로는 뉴스 API, SNS API 등을 사용하여 분석
    // 여기서는 시뮬레이션
    
    let trendingReason = '검색량 급증 중';
    const newsContext: string[] = [];
    let socialMentions = 0;
    let viralPotential = 50;
    let stayingPower = 50;
    
    if (growthRate >= 300) {
      trendingReason = '최근 뉴스나 이슈로 인한 급상승';
      newsContext.push('관련 뉴스 급증');
      socialMentions = Math.floor(growthRate * 10);
      viralPotential = 85;
      stayingPower = 30; // 빠르게 상승하면 빠르게 사라질 수 있음
    } else if (growthRate >= 100) {
      trendingReason = '점진적 검색량 증가';
      newsContext.push('관련 주제 관심 증가');
      socialMentions = Math.floor(growthRate * 5);
      viralPotential = 60;
      stayingPower = 60;
    } else {
      trendingReason = '안정적인 검색 트렌드';
      newsContext.push('지속적인 관심');
      socialMentions = Math.floor(growthRate * 2);
      viralPotential = 40;
      stayingPower = 80;
    }
    
    return {
      trendingReason,
      newsContext,
      socialMentions,
      viralPotential,
      stayingPower
    };
  }
  
  /**
   * 최적 진입 시점 계산
   */
  private async calculateOptimalEntry(keyword: string, growthRate: number, documentCount: number): Promise<AdvancedKeywordAnalysis['optimalEntry']> {
    const now = new Date();
    
    // 최적 발행 시간 계산
    let bestTimeToPublish: Date;
    let urgency: 'critical' | 'high' | 'medium' | 'low';
    let timeWindow: string;
    let competitionGrowth: number;
    
    if (growthRate >= 300 && documentCount <= 50) {
      // 급상승 + 경쟁 적음 = 지금 당장!
      bestTimeToPublish = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2시간 후
      urgency = 'critical';
      timeWindow = '2-6시간 내';
      competitionGrowth = 5; // 시간당 5개씩 증가 예상
    } else if (growthRate >= 200 && documentCount <= 100) {
      bestTimeToPublish = new Date(now.getTime() + 6 * 60 * 60 * 1000); // 6시간 후
      urgency = 'high';
      timeWindow = '6-12시간 내';
      competitionGrowth = 3;
    } else if (growthRate >= 100) {
      bestTimeToPublish = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 1일 후
      urgency = 'medium';
      timeWindow = '1-2일 내';
      competitionGrowth = 2;
    } else {
      bestTimeToPublish = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // 3일 후
      urgency = 'low';
      timeWindow = '3-7일 내';
      competitionGrowth = 1;
    }
    
    return {
      bestTimeToPublish,
      urgency,
      timeWindow,
      competitionGrowth
    };
  }
  
  /**
   * 종합 점수 계산
   */
  private calculateOverallScore(analysis: Partial<AdvancedKeywordAnalysis>): AdvancedKeywordAnalysis['overallScore'] {
    const comp = analysis.competitionQuality!;
    const trend = analysis.searchTrendAnalysis!;
    const traffic = analysis.trafficPrediction!;
    const monetization = analysis.monetizationPotential!;
    const ai = analysis.aiInsight!;
    const entry = analysis.optimalEntry!;
    
    // 트래픽 폭발 점수
    const trafficExplosionScore = Math.min(100, 
      (traffic.estimatedMonthlyTraffic / 1000) * 20 + // 트래픽 점수
      (trend.growthVelocity / 10) * 30 + // 급상승 점수
      (trend.peakPrediction.confidence / 100) * 30 + // 피크 예측 신뢰도
      (ai.viralPotential / 100) * 20 // 바이럴 가능성
    );
    
    // 수익화 점수
    const monetizationScore = Math.min(100,
      (monetization.estimatedMonthlyRevenue / 10000) * 30 + // 수익 점수
      (monetization.cpc / 2000) * 30 + // CPC 점수
      (monetization.adRelevance / 100) * 20 + // 광고 관련성
      (traffic.trafficConfidence / 100) * 20 // 트래픽 신뢰도
    );
    
    // 경쟁 우위 점수
    const competitionScore = Math.min(100,
      comp.beatableScore * 0.4 + // 이길 가능성
      (100 - comp.avgQualityScore) * 0.3 + // 경쟁자 품질 낮음
      (1000 - (analysis as any).documentCount) / 10 * 0.3 // 경쟁자 수 적음
    );
    
    // 타이밍 점수
    const timingScore = Math.min(100,
      (entry.urgency === 'critical' ? 100 : entry.urgency === 'high' ? 80 : entry.urgency === 'medium' ? 60 : 40) * 0.4 +
      (trend.lifecycleStage === 'emerging' ? 100 : trend.lifecycleStage === 'rising' ? 80 : 60) * 0.3 +
      (ai.stayingPower / 100) * 30 // 지속 가능성
    );
    
    // 최종 종합 점수
    const finalScore = Math.round(
      trafficExplosionScore * 0.3 +
      monetizationScore * 0.25 +
      competitionScore * 0.25 +
      timingScore * 0.2
    );
    
    return {
      trafficExplosionScore: Math.round(trafficExplosionScore),
      monetizationScore: Math.round(monetizationScore),
      competitionScore: Math.round(competitionScore),
      timingScore: Math.round(timingScore),
      finalScore
    };
  }
}
























