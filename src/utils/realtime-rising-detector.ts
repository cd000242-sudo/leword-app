/**
 * 🔥 진짜 실시간 급상승 키워드 감지기
 * 
 * 📊 블랙키위 vs 우리 앱 차이점:
 * 
 * 블랙키위:
 * - 네이버 데이터랩 API 사용 (비공개 키워드 제외)
 * - 검색량 증가량 표시
 * - 시간대별 변화 추적
 * 
 * 우리 앱:
 * - 4개 소스 (Signal.bz, ZUM, Nate, Daum) 실시간 크롤링
 * - 모든 키워드 포함 (비공개 키워드도 수집)
 * - 월간 검색량 표시
 * 
 * ✅ 우리 앱의 장점:
 * 1. 실시간성이 더 빠름 (크롤링 기반)
 * 2. 비공개 키워드도 수집
 * 3. 여러 소스 비교 가능
 * 4. 검색량 + 문서수로 황금비율 분석 가능
 */

import { getAllRealtimeKeywords, RealtimeKeyword } from './realtime-search-keywords';
import { getNaverSearchAdKeywordVolume, NaverSearchAdConfig } from './naver-searchad-api';
import { EnvironmentManager } from './environment-manager';

export interface RealtimeRisingKeyword {
  keyword: string;
  status: 'new' | 'rising' | 'hot';  // new: 새로 등장, rising: 순위 상승, hot: 여러 소스에 등장
  rankChange: number;  // 순위 변화 (+: 상승, -: 하락)
  currentRank: number;
  previousRank: number | null;  // null이면 이전에 없었음
  sources: string[];  // 등장한 소스들
  sourceCount: number;  // 몇 개 소스에 등장?
  firstSeen: Date;
  trend: 'up' | 'down' | 'same' | 'new';
  hotScore: number;  // 핫 점수 (높을수록 급상승)
  trendIndicator?: string;  // 상승/하락 표시
  searchVolume?: number | null;  // 월간 검색량 (블랙키위 스타일)
  searchVolumeFormatted?: string;  // 포맷된 검색량 (+13만)
}

interface KeywordHistory {
  keyword: string;
  rank: number;
  source: string;
  timestamp: Date;
}

// 메모리에 히스토리 저장 (최근 1시간)
const keywordHistory: Map<string, KeywordHistory[]> = new Map();
const HISTORY_RETENTION_MINUTES = 60;

/**
 * 실시간 급상승 키워드 감지
 */
export async function detectRealtimeRising(): Promise<RealtimeRisingKeyword[]> {
  console.log('[REALTIME-RISING] 🔥 실시간 급상승 감지 시작...');
  
  try {
    // 1. 현재 실시간 검색어 수집
    const currentData = await getAllRealtimeKeywords();
    
    if (!currentData) {
      console.warn('[REALTIME-RISING] 실시간 데이터 없음');
      return [];
    }
    
    const now = new Date();
    const allKeywords: Map<string, { sources: string[]; ranks: number[]; currentRank: number; trendIndicator?: string }> = new Map();
    
    // 2. 각 소스별 키워드 수집
    const sources = [
      { name: 'naver', data: currentData.naver },
      { name: 'zum', data: currentData.zum },
      { name: 'nate', data: currentData.nate },
      { name: 'daum', data: currentData.daum },
    ];
    
    for (const { name, data } of sources) {
      if (!data || !Array.isArray(data)) continue;
      
      data.forEach((item: RealtimeKeyword, idx: number) => {
        const keyword = item.keyword?.trim();
        if (!keyword) return;
        
        const rank = item.rank || idx + 1;
        const trendIndicator = item.change || '';
        
        // 현재 데이터 기록
        if (!allKeywords.has(keyword)) {
          allKeywords.set(keyword, { sources: [], ranks: [], currentRank: rank, trendIndicator });
        }
        
        const kw = allKeywords.get(keyword)!;
        kw.sources.push(name);
        kw.ranks.push(rank);
        kw.currentRank = Math.min(kw.currentRank, rank);
        if (trendIndicator) kw.trendIndicator = trendIndicator;
        
        // 히스토리에 추가
        if (!keywordHistory.has(keyword)) {
          keywordHistory.set(keyword, []);
        }
        keywordHistory.get(keyword)!.push({
          keyword,
          rank,
          source: name,
          timestamp: now
        });
      });
    }
    
    // 3. 오래된 히스토리 정리 (1시간 이상)
    const cutoffTime = new Date(now.getTime() - HISTORY_RETENTION_MINUTES * 60 * 1000);
    for (const [keyword, history] of keywordHistory.entries()) {
      const filtered = history.filter(h => h.timestamp > cutoffTime);
      if (filtered.length === 0) {
        keywordHistory.delete(keyword);
      } else {
        keywordHistory.set(keyword, filtered);
      }
    }
    
    // 4. 급상승 키워드 분석 (모든 키워드를 분석!)
    const risingKeywords: RealtimeRisingKeyword[] = [];
    
    for (const [keyword, data] of allKeywords.entries()) {
      const history = keywordHistory.get(keyword) || [];
      
      // 30분 전 데이터 찾기
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
      const oldHistory = history.filter(h => h.timestamp < thirtyMinutesAgo);
      const recentHistory = history.filter(h => h.timestamp >= thirtyMinutesAgo);
      
      let status: 'new' | 'rising' | 'hot' = 'hot';
      let previousRank: number | null = null;
      let rankChange = 0;
      let trend: 'up' | 'down' | 'same' | 'new' = 'same';
      
      // 트렌드 표시에서 상승/하락 판단
      const trendStr = data.trendIndicator?.toLowerCase() || '';
      const isNewFromSource = trendStr.includes('new') || trendStr === '신규';
      const isUpFromSource = trendStr.includes('up') || trendStr === '상승' || trendStr.includes('↑');
      
      // 🔍 실시간성 개선: 최근 10분 이내 데이터만 NEW로 판단
      const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
      const veryRecentHistory = history.filter(h => h.timestamp > tenMinutesAgo);
      
      // 새로 등장한 키워드 (최근 10분 이내에만 등장)
      if ((isNewFromSource || oldHistory.length === 0) && veryRecentHistory.length <= 2) {
        status = 'new';
        trend = 'new';
        previousRank = null;
        rankChange = 10; // NEW는 기본 +10 점수
      } else if (isUpFromSource) {
        status = 'rising';
        trend = 'up';
        rankChange = 5; // UP은 기본 +5 점수
      } else if (oldHistory.length > 0) {
        // 이전 순위 계산 (평균)
        previousRank = Math.round(oldHistory.reduce((sum, h) => sum + h.rank, 0) / oldHistory.length);
        rankChange = previousRank - data.currentRank;
        
        if (rankChange > 3) {
          status = 'rising';
          trend = 'up';
        } else if (rankChange < -3) {
          trend = 'down';
        } else {
          trend = 'same';
        }
      }
      
      // 여러 소스에 동시 등장하면 hot (2개 이상이면 hot!)
      if (data.sources.length >= 2) {
        status = 'hot';
      }
      
      // 핫 점수 계산
      let hotScore = 0;
      if (status === 'new' || isNewFromSource) hotScore += 50;
      if (isUpFromSource) hotScore += 30;
      hotScore += Math.max(0, rankChange) * 5;
      hotScore += data.sources.length * 15;  // 소스당 15점
      if (data.currentRank === 1) hotScore += 30;
      if (data.currentRank <= 3) hotScore += 15;
      if (data.currentRank <= 5) hotScore += 10;
      if (data.currentRank <= 10) hotScore += 5;
      
      // 모든 키워드를 결과에 추가 (핫 점수 0 이상)
      if (hotScore > 0) {
        risingKeywords.push({
          keyword,
          status,
          rankChange,
          currentRank: data.currentRank,
          previousRank,
          sources: data.sources,
          sourceCount: data.sources.length,
          firstSeen: oldHistory.length > 0 ? oldHistory[0].timestamp : now,
          trend,
          hotScore,
          trendIndicator: data.trendIndicator
        });
      }
    }
    
    // 5. 핫 점수로 정렬
    risingKeywords.sort((a, b) => b.hotScore - a.hotScore);
    
    // 6. 상위 30개에 대해 검색량 조회 (블랙키위 스타일)
    const top30Keywords = risingKeywords.slice(0, 30);
    
    try {
      // API 설정 로드
      const envManager = new EnvironmentManager();
      const config = await envManager.getConfig();
      
      if (config.naverSearchAdAccessLicense && config.naverSearchAdSecretKey && config.naverSearchAdCustomerId) {
        const apiConfig: NaverSearchAdConfig = {
          accessLicense: config.naverSearchAdAccessLicense,
          secretKey: config.naverSearchAdSecretKey,
          customerId: config.naverSearchAdCustomerId
        };
        
        console.log('[REALTIME-RISING] 📊 검색량 조회 시작...');
        
        // 5개씩 배치로 검색량 조회
        for (let i = 0; i < top30Keywords.length; i += 5) {
          const batch = top30Keywords.slice(i, i + 5);
          const keywords = batch.map(k => k.keyword);
          
          try {
            const stats = await getNaverSearchAdKeywordVolume(apiConfig, keywords);
            
            if (stats && Array.isArray(stats)) {
              stats.forEach(stat => {
                const kw = top30Keywords.find(k => k.keyword === stat.keyword);
                if (!kw) return;

                const parseVolume = (value: unknown): number | null => {
                  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
                  if (typeof value === 'string') {
                    const cleaned = value.replace(/[^0-9]/g, '');
                    if (!cleaned) return null;
                    const parsed = parseInt(cleaned, 10);
                    return Number.isFinite(parsed) ? parsed : null;
                  }
                  return null;
                };

                const pcVolume = parseVolume((stat as any).monthlyPcQcCnt);
                const mobileVolume = parseVolume((stat as any).monthlyMobileQcCnt);
                const totalVolume = typeof (stat as any).totalSearchVolume === 'number'
                  ? (stat as any).totalSearchVolume
                  : (pcVolume !== null || mobileVolume !== null)
                    ? ((pcVolume ?? 0) + (mobileVolume ?? 0))
                    : null;

                kw.searchVolume = totalVolume;

                if (typeof totalVolume === 'number') {
                  // 포맷팅 (+13만, +5.2만 형식)
                  if (totalVolume >= 10000) {
                    kw.searchVolumeFormatted = `+${(totalVolume / 10000).toFixed(1)}만`;
                  } else if (totalVolume >= 1000) {
                    kw.searchVolumeFormatted = `+${(totalVolume / 1000).toFixed(1)}천`;
                  } else {
                    kw.searchVolumeFormatted = `+${totalVolume}`;
                  }
                } else {
                  kw.searchVolumeFormatted = undefined;
                }
              });
            }
            
            await new Promise(r => setTimeout(r, 100)); // API 제한 방지
          } catch (e) {
            console.warn('[REALTIME-RISING] 배치 검색량 조회 실패:', e);
          }
        }
        
        // 검색량으로 재정렬
        top30Keywords.sort((a, b) => (b.searchVolume ?? -1) - (a.searchVolume ?? -1));
        
        console.log('[REALTIME-RISING] ✅ 검색량 조회 완료!');
      } else {
        console.warn('[REALTIME-RISING] ⚠️ 네이버 검색광고 API 키가 설정되지 않음');
      }
    } catch (e) {
      console.warn('[REALTIME-RISING] 검색량 조회 중 오류:', e);
    }
    
    console.log(`[REALTIME-RISING] ✅ ${top30Keywords.length}개 실시간 키워드 분석 완료!`);
    top30Keywords.slice(0, 10).forEach((kw, idx) => {
      const statusEmoji = kw.status === 'new' ? '⚡NEW' : kw.status === 'rising' ? '📈' : '🔥';
      const volume = kw.searchVolumeFormatted || '';
      console.log(`  ${idx + 1}. ${kw.keyword} ${statusEmoji} ${volume} (소스: ${kw.sourceCount}개)`);
    });
    
    return top30Keywords;
    
  } catch (error) {
    console.error('[REALTIME-RISING] 오류:', error);
    return [];
  }
}

/**
 * 히스토리 초기화 (디버깅용)
 */
export function clearHistory(): void {
  keywordHistory.clear();
  console.log('[REALTIME-RISING] 히스토리 초기화 완료');
}

/**
 * 히스토리 크기 확인
 */
export function getHistorySize(): number {
  return keywordHistory.size;
}

