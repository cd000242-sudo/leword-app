/**
 * 🔥 급상승 키워드 파인더 (블랙키위 스타일)
 * 네이버 데이터랩 API로 검색량 급상승 키워드 자동 발견
 */

import { getNaverTrendKeywords, getNaverRelatedKeywords, NaverDatalabConfig } from './naver-datalab-api';
import { EnvironmentManager } from './environment-manager';

export interface RisingKeyword {
  keyword: string;
  currentSearchVolume: number;
  previousSearchVolume: number;
  growthRate: number; // 증가율 (%)
  growthType: 'explosive' | 'rapid' | 'steady'; // 폭발적 / 급속 / 꾸준함
  rank?: number;
  reason?: string; // 급상승 이유
}

/**
 * 급상승 키워드 자동 발견
 * @param seedKeywords 시드 키워드 (없으면 인기 카테고리에서 자동 생성)
 * @param options 옵션
 */
export async function findRisingKeywords(
  seedKeywords?: string[],
  options: {
    minGrowthRate?: number; // 최소 증가율 (기본: 50%)
    lookbackDays?: number; // 비교 기간 (기본: 7일)
    maxResults?: number; // 최대 결과 (기본: 20)
  } = {}
): Promise<RisingKeyword[]> {
  const {
    minGrowthRate = 50,
    lookbackDays = 7,
    maxResults = 20
  } = options;

  console.log('[RISING-KEYWORDS] 🔥 급상승 키워드 검색 시작...');

  // 환경 설정 로드
  const envManager = EnvironmentManager.getInstance();
  const config = envManager.getConfig();
  
  const naverConfig: NaverDatalabConfig = {
    clientId: config.naverClientId || '',
    clientSecret: config.naverClientSecret || ''
  };

  if (!naverConfig.clientId || !naverConfig.clientSecret) {
    console.warn('[RISING-KEYWORDS] ⚠️ 네이버 API 키 없음. 빈 배열 반환.');
    return [];
  }

  // 시드 키워드가 없으면 인기 카테고리에서 생성
  const keywords = seedKeywords && seedKeywords.length > 0
    ? seedKeywords
    : await generateSeedKeywords();

  console.log(`[RISING-KEYWORDS] 시드 키워드 ${keywords.length}개로 검색 시작:`, keywords.slice(0, 5));

  const risingKeywords: RisingKeyword[] = [];

  // 날짜 계산
  const today = new Date();
  const endDate = formatDate(today);
  const compareDate = new Date(today);
  compareDate.setDate(compareDate.getDate() - lookbackDays);
  const startDate = formatDate(compareDate);
  
  const previousDate = new Date(compareDate);
  previousDate.setDate(previousDate.getDate() - lookbackDays);
  const previousStartDate = formatDate(previousDate);

  console.log(`[RISING-KEYWORDS] 기간 비교: ${previousStartDate}~${startDate} vs ${startDate}~${endDate}`);

  // 키워드를 5개씩 묶어서 처리 (API 제한)
  const batchSize = 5;
  for (let i = 0; i < keywords.length; i += batchSize) {
    const batch = keywords.slice(i, Math.min(i + batchSize, keywords.length));
    
    try {
      // 현재 기간 트렌드
      const currentTrends = await getNaverTrendKeywords(naverConfig, {
        keywords: batch,
        startDate,
        endDate,
        timeUnit: 'date'
      });

      // 이전 기간 트렌드
      const previousTrends = await getNaverTrendKeywords(naverConfig, {
        keywords: batch,
        startDate: previousStartDate,
        endDate: startDate,
        timeUnit: 'date'
      });

      // 증가율 계산
      for (const keyword of batch) {
        const currentData = currentTrends.find(t => t.keyword === keyword);
        const previousData = previousTrends.find(t => t.keyword === keyword);

        if (!currentData || !previousData) continue;

        const currentAvg = currentData.searchVolume || 0;
        const previousAvg = previousData.searchVolume || 0;

        if (previousAvg === 0) continue; // 이전 검색량 0이면 제외

        const growthRate = ((currentAvg - previousAvg) / previousAvg) * 100;

        if (growthRate >= minGrowthRate) {
          let growthType: 'explosive' | 'rapid' | 'steady' = 'steady';
          if (growthRate >= 200) growthType = 'explosive';
          else if (growthRate >= 100) growthType = 'rapid';

          risingKeywords.push({
            keyword,
            currentSearchVolume: currentAvg,
            previousSearchVolume: previousAvg,
            growthRate: Math.round(growthRate),
            growthType,
            reason: generateRisingReason(keyword, growthRate, growthType)
          });
        }
      }

      // API Rate Limit 방지
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.warn(`[RISING-KEYWORDS] 배치 ${i}-${i + batchSize} 실패:`, error);
    }
  }

  // 증가율 기준 정렬 및 순위 부여
  risingKeywords.sort((a, b) => b.growthRate - a.growthRate);
  risingKeywords.forEach((kw, idx) => {
    kw.rank = idx + 1;
  });

  const result = risingKeywords.slice(0, maxResults);
  
  console.log(`[RISING-KEYWORDS] ✅ 급상승 키워드 ${result.length}개 발견!`);
  result.forEach(kw => {
    console.log(`  ${kw.rank}. ${kw.keyword} (+${kw.growthRate}%) [${kw.growthType}]`);
  });

  return result;
}

/**
 * 시드 키워드 자동 생성 (인기 카테고리 기반)
 */
async function generateSeedKeywords(): Promise<string[]> {
  const popularCategories = [
    '건강', '금융', '부동산', '자동차', '육아',
    '여행', '음식', '패션', '뷰티', '운동',
    '게임', '영화', '드라마', '음악', '책',
    '정치', '경제', '사회', 'IT', '스마트폰'
  ];

  const seeds: string[] = [...popularCategories];

  // 각 카테고리에서 연관 키워드 추출 (3개씩)
  const envManager = EnvironmentManager.getInstance();
  const config = envManager.getConfig();

  if (config.naverClientId && config.naverClientSecret) {
    for (const category of popularCategories.slice(0, 10)) { // 상위 10개만
      try {
        const related = await getNaverRelatedKeywords(category, {
          clientId: config.naverClientId,
          clientSecret: config.naverClientSecret
        }, { limit: 3 });

        seeds.push(...related.map(r => r.keyword));
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        // 무시
      }
    }
  }

  return [...new Set(seeds)]; // 중복 제거
}

/**
 * 급상승 이유 생성
 */
function generateRisingReason(keyword: string, growthRate: number, growthType: string): string {
  if (growthType === 'explosive') {
    return `폭발적 급상승 (+${growthRate}%) - 최근 핫이슈`;
  } else if (growthType === 'rapid') {
    return `빠른 상승세 (+${growthRate}%) - 주목받는 키워드`;
  } else {
    return `꾸준한 증가 (+${growthRate}%) - 관심도 상승 중`;
  }
}

/**
 * 날짜 포맷 (YYYY-MM-DD)
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

