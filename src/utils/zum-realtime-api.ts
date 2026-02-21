/**
 * ZUM 실시간 검색어 API 유틸리티
 * 
 * zum.com 메인 페이지에서 실시간 검색어를 추출합니다.
 * axios + cheerio 기반으로 빠르게 크롤링합니다.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

export interface ZumRealtimeKeyword {
  rank: number;
  keyword: string;
  source: string;
  timestamp: string;
}

/**
 * ZUM 실시간 검색어 크롤링 (axios + cheerio)
 * Puppeteer 없이 빠르게 실시간 검색어를 추출합니다.
 */
export async function getZumRealtimeKeywordsWithPuppeteer(limit: number = 10): Promise<ZumRealtimeKeyword[]> {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[ZUM-REALTIME] ========== 실시간 검색어 수집 시작 (시도 ${attempt}/${MAX_RETRIES}) ==========`);
      
      // ZUM 메인 페이지 요청
      const response = await axios.get('https://zum.com/', {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Cache-Control': 'no-cache',
        },
      });
      
      const html = response.data;
      console.log(`[ZUM-REALTIME] HTML 수신: ${html.length} bytes`);
      
      const $ = cheerio.load(html);
      const keywords: string[] = [];
      
      // 광고/제외 키워드 패턴
      const excludePatterns = [
        '보험', '대출', '변호사', '학원', '병원', '창업', '사주', '라식', '임플란트',
        '다이어트', '성형', '탈모', '더보기', '전체보기', 'AI 이슈트렌드'
      ];
      
      const isExcluded = (text: string) => {
        return excludePatterns.some(p => text.includes(p)) ||
               /^[\d\s]+$/.test(text) ||
               text.length < 2 ||
               text.length > 50;
      };
      
      // 순위 번호 제거 (끝에 붙는 경우 - 예: "손흥민 토트넘 복귀 1")
      const cleanKeyword = (text: string) => {
        return text
          .replace(/\s+\d+$/, '') // 끝의 숫자 제거
          .replace(/^\d+\s*/, '') // 앞의 순위 번호 제거
          .trim();
      };
      
      // 방법 1: 검색 링크에서 직접 추출 (가장 정확)
      console.log('[ZUM-REALTIME] 검색 링크에서 키워드 추출 중...');
      $('a[href*="search.zum.com"]').each((i, el) => {
        if (keywords.length >= limit) return false;
        
        const href = $(el).attr('href') || '';
        const match = href.match(/[?&]q(?:uery)?=([^&]+)/);
        if (match) {
          try {
            const keyword = decodeURIComponent(match[1]).trim();
            const cleaned = cleanKeyword(keyword);
            if (cleaned && !isExcluded(cleaned) && !keywords.includes(cleaned)) {
              keywords.push(cleaned);
            }
          } catch (e) {
            // 디코딩 실패 무시
          }
        }
      });
      
      console.log(`[ZUM-REALTIME] 검색 링크에서 ${keywords.length}개 추출`);
      
      // 방법 2: issue-word-list 영역에서 추출
      if (keywords.length < limit) {
        console.log('[ZUM-REALTIME] issue-word-list에서 추가 키워드 추출 중...');
        $('[class*="issue-word-list"] a, [class*="issue-word-list"] span').each((i, el) => {
          if (keywords.length >= limit) return false;
          
          const text = $(el).text().trim();
          const cleaned = cleanKeyword(text);
          if (cleaned && !isExcluded(cleaned) && !keywords.includes(cleaned)) {
            keywords.push(cleaned);
          }
        });
      }
      
      // 방법 3: rank/keyword 관련 클래스에서 추출
      if (keywords.length < limit) {
        console.log('[ZUM-REALTIME] rank 클래스에서 추가 키워드 추출 중...');
        $('ul li a, ol li a').each((i, el) => {
          if (keywords.length >= limit) return false;
          
          // rank/issue/trend/keyword 관련 부모 요소 확인
          const parent = $(el).closest('[class*="rank"], [class*="issue"], [class*="trend"], [class*="keyword"]');
          if (parent.length === 0) return;
          
          const text = $(el).text().trim();
          const cleaned = cleanKeyword(text);
          if (cleaned && !isExcluded(cleaned) && !keywords.includes(cleaned)) {
            keywords.push(cleaned);
          }
        });
      }
      
      console.log(`[ZUM-REALTIME] 총 ${keywords.length}개 키워드 추출 완료`);
      
      if (keywords.length >= 5) {
        const result: ZumRealtimeKeyword[] = keywords.slice(0, limit).map((keyword, index) => ({
          rank: index + 1,
          keyword,
          source: 'zum',
          timestamp: new Date().toISOString()
        }));
        
        console.log('[ZUM-REALTIME] ✅ 실시간 검색어 수집 완료:');
        result.forEach(k => console.log(`  ${k.rank}. ${k.keyword}`));
        
        return result;
      }
      
      throw new Error(`키워드 부족 (${keywords.length}개)`);
      
    } catch (error: any) {
      console.error(`[ZUM-REALTIME] ❌ 시도 ${attempt} 실패:`, error.message || error);
      
      if (attempt < MAX_RETRIES) {
        console.log(`[ZUM-REALTIME] ${RETRY_DELAY}ms 후 재시도...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      } else {
        throw new Error(`ZUM 실시간 검색어 수집 실패: ${error.message || error}`);
      }
    }
  }
  
  throw new Error('ZUM 실시간 검색어 수집 실패: 최대 재시도 횟수 초과');
}
