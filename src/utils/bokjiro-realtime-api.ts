/**
 * 복지로 일간 인기 키워드 API 유틸리티
 * Puppeteer를 사용하여 복지로 검색 페이지에서 인기 키워드 크롤링
 */

import { browserPool } from './puppeteer-pool';
import { apiCache, cachedApiCall } from './api-cache';
import { ErrorHandler } from './error-handler';

export interface BokjiroRealtimeKeyword {
  rank: number;
  keyword: string;
  source: string;
  timestamp: string;
}

/**
 * Puppeteer를 사용하여 복지로 일간 인기 키워드 크롤링
 */
export async function getBokjiroRealtimeKeywordsWithPuppeteer(limit: number = 10): Promise<BokjiroRealtimeKeyword[]> {
  // 캐시 키 생성 (1시간 TTL)
  const cacheKey = `bokjiro-realtime:${limit}`;
  
  return cachedApiCall(
    cacheKey,
    async () => {
      let browser: any = null;
      let page: any = null;
      
      try {
        console.log('[BOKJIRO-REALTIME] 복지로 일간 인기 키워드 크롤링 시작 (Puppeteer)');
        
        // 브라우저 풀에서 가져오기
        browser = await browserPool.acquire();
        
        page = await browser.newPage();
    
        // User-Agent 설정
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // 언어 설정
        await page.setExtraHTTPHeaders({
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        });
        
        // 복지로 통합검색 페이지 접속
        const bokjiroUrl = 'https://www.bokjiro.go.kr/ssis-tbu/twatzzza/intgSearch/moveTWZZ02000M.do';
        console.log('[BOKJIRO-REALTIME] 페이지 로딩 중:', bokjiroUrl);
        
        // 페이지 로딩 (타임아웃 및 재시도 적용)
        await ErrorHandler.withRetry(
          async () => {
            await ErrorHandler.withTimeout(
              async () => page.goto(bokjiroUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 20000
              }),
              25000, // 25초 타임아웃
              '복지로 페이지 로딩 시간 초과'
            );
          },
          {
            maxRetries: 2,
            retryDelay: 2000,
            retryableErrors: ['timeout', 'network']
          }
        );
        
        // 페이지 로딩 대기 (5초 -> 2초로 단축)
        await page.waitForTimeout(2000);
    
        // 다양한 선택자로 키워드 요소 대기 시도
        const selectors = [
          '.rankmenu .keyword',
          '.rankmenu .cl-text',
          '.keyword',
          '.rank_keyword',
          '.popular_keyword',
          '[class*="keyword"]',
          '[class*="rank"]'
        ];
        
        let foundSelector = false;
        for (const selector of selectors) {
          try {
            await page.waitForSelector(selector, { timeout: 3000 });
            console.log(`[BOKJIRO-REALTIME] ${selector} 요소 발견`);
            foundSelector = true;
            break;
          } catch (e) {
            // 다음 선택자 시도
          }
        }
        
        if (!foundSelector) {
          console.log('[BOKJIRO-REALTIME] 선택자 대기 실패 (계속 진행)');
        }
        
        console.log('[BOKJIRO-REALTIME] 페이지 크롤링 중...');
        
        // 복지로 페이지에서 인기 키워드 추출
        const keywords = await page.evaluate((maxLimit: number) => {
      const result: Array<{ keyword: string; rank: number }> = [];
      
      // 제외할 텍스트 패턴
      const excludePatterns = [
        /^더보기$/i,
        /^전체보기$/i,
        /^검색$/i,
        /^복지로$/i,
        /^BOKJIRO$/i,
        /^로그인$/i,
        /^회원가입$/i,
        /^공동인증서$/i,
        /^통합검색$/i,
        /^데이터랩$/i,
        /^순위$/i,
        /^검색어$/i,
        /^본문$/i,
        /^제목$/i,
        /^내용$/i,
        /^링크$/i,
        /^URL$/i,
        /^(제\d+호|제\d+조|제\d+항)$/i,
      ];
      
      // UI 요소 키워드
      const uiKeywords = [
        '통합검색', '로그인', '로그아웃', '본문', '공동인증서', '검색어', '순위', '데이터랩',
        '더보기', '전체보기', '검색', '복지로', 'BOKJIRO', '제목', '내용', '링크', 'URL'
      ];
      
      // 방법 1: .rankmenu .keyword 구조 (기존 방식)
      const rankMenus = document.querySelectorAll('.rankmenu');
      console.log(`[BOKJIRO-REALTIME] 방법 1: rankmenu ${rankMenus.length}개 발견`);
      
      if (rankMenus.length > 0) {
        rankMenus.forEach((rankMenu, menuIndex) => {
          if (result.length >= maxLimit) return;
          
          // rankmenu 내의 .keyword 요소 찾기
          const keywordElements = rankMenu.querySelectorAll('.keyword');
          console.log(`[BOKJIRO-REALTIME] rankmenu[${menuIndex}]에 keyword ${keywordElements.length}개 발견`);
          
          keywordElements.forEach((keywordEl, kwIndex) => {
            if (result.length >= maxLimit) return;
            
            // 여러 방법으로 텍스트 추출 시도
            let keywordText = '';
            
            // 방법 1-1: .cl-text에서 추출
            const clText = keywordEl.querySelector('.cl-text');
            if (clText) {
              keywordText = clText.textContent?.trim() || '';
              if (keywordText) {
                console.log(`[BOKJIRO-REALTIME] rankmenu[${menuIndex}] keyword[${kwIndex}] cl-text: "${keywordText}"`);
              }
            }
            
            // 방법 1-2: 직접 텍스트 노드에서 추출
            if (!keywordText || keywordText.length < 2) {
              const directText = Array.from(keywordEl.childNodes)
                .filter(node => node.nodeType === Node.TEXT_NODE)
                .map(node => node.textContent?.trim())
                .join(' ')
                .trim();
              if (directText && directText.length >= 2) {
                keywordText = directText;
              }
            }
            
            // 방법 1-3: 전체 텍스트에서 추출
            if (!keywordText || keywordText.length < 2) {
              keywordText = keywordEl.textContent?.trim() || '';
            }
            
            // 방법 1-4: innerHTML에서 추출
            if (!keywordText || keywordText.length < 2) {
              const innerHTML = keywordEl.innerHTML;
              keywordText = innerHTML.replace(/<[^>]*>/g, '').trim();
            }
            
            // 키워드 정제
            if (keywordText) {
              keywordText = keywordText
                .replace(/^\d+\.?\s*/, '')
                .replace(/^\d+위\s*/, '')
                .replace(/^상승\s*/, '')
                .replace(/^하락\s*/, '')
                .replace(/^신규\s*/, '')
                .replace(/^▶\s*/, '')
                .replace(/^▶/, '')
                .replace(/^▲\s*/, '')
                .replace(/^▼\s*/, '')
                .replace(/^NEW\s*/i, '')
                .replace(/^HOT\s*/i, '')
                .replace(/\s+/g, ' ')
                .trim();
            }
            
            // 키워드 검증 및 추가
            if (keywordText && 
                keywordText.length >= 2 && 
                keywordText.length <= 30 &&
                /[가-힣]/.test(keywordText) &&
                !/^\d+$/.test(keywordText) &&
                !excludePatterns.some(p => p.test(keywordText)) &&
                !uiKeywords.includes(keywordText)) {
              
              // 중복 체크
              const isDuplicate = result.some(item => 
                item.keyword.toLowerCase() === keywordText.toLowerCase()
              );
              
              if (!isDuplicate) {
                result.push({
                  keyword: keywordText,
                  rank: result.length + 1
                });
                console.log(`[BOKJIRO-REALTIME] ✅ 키워드 발견 (${result.length}위): "${keywordText}"`);
              }
            }
          });
        });
      }
      
      // 방법 2: 다른 선택자로 키워드 찾기 (rankmenu가 없는 경우)
      if (result.length < maxLimit) {
        console.log(`[BOKJIRO-REALTIME] 방법 2: 대체 선택자 시도 (현재 ${result.length}개)`);
        
        const alternativeSelectors = [
          '.rank_keyword',
          '.popular_keyword',
          '.keyword_list .keyword',
          '.rank_list .keyword',
          '[class*="keyword"]',
          '[class*="rank"] a',
          'a[href*="searchKeyword"]',
          'a[href*="search"]'
        ];
        
        const tempKeywords: string[] = [];
        
        for (const selector of alternativeSelectors) {
          if (tempKeywords.length >= maxLimit) break;
          
          const elements = document.querySelectorAll(selector);
          console.log(`[BOKJIRO-REALTIME] 선택자 "${selector}": ${elements.length}개 발견`);
          
          elements.forEach((el) => {
            if (tempKeywords.length >= maxLimit) return;
            
            let keywordText = '';
            
            // href에서 키워드 추출
            if (el.tagName === 'A') {
              const href = (el as HTMLAnchorElement).href || '';
              const hrefMatch = href.match(/[?&](?:searchKeyword|keyword|q|query)=([^&]+)/);
              if (hrefMatch && hrefMatch[1]) {
                try {
                  keywordText = decodeURIComponent(hrefMatch[1]).trim();
                } catch (e) {
                  keywordText = hrefMatch[1].trim();
                }
              }
            }
            
            // 텍스트에서 추출
            if (!keywordText || keywordText.length < 2) {
              keywordText = el.textContent?.trim() || '';
              keywordText = keywordText
                .replace(/^\d+\.?\s*/, '')
                .replace(/^\d+위\s*/, '')
                .replace(/^상승\s*/, '')
                .replace(/^하락\s*/, '')
                .replace(/^신규\s*/, '')
                .replace(/^▶\s*/, '')
                .replace(/^▶/, '')
                .replace(/^▲\s*/, '')
                .replace(/^▼\s*/, '')
                .replace(/^NEW\s*/i, '')
                .replace(/^HOT\s*/i, '')
                .replace(/\s+/g, ' ')
                .trim();
            }
            
            // 키워드 검증
            if (keywordText && 
                keywordText.length >= 2 && 
                keywordText.length <= 30 &&
                /[가-힣]/.test(keywordText) &&
                !/^\d+$/.test(keywordText) &&
                !excludePatterns.some(p => p.test(keywordText)) &&
                !uiKeywords.includes(keywordText)) {
              
              const keywordLower = keywordText.toLowerCase();
              if (!tempKeywords.some(k => k.toLowerCase() === keywordLower)) {
                tempKeywords.push(keywordText);
                console.log(`[BOKJIRO-REALTIME] 대체 선택자에서 키워드 발견: "${keywordText}"`);
              }
            }
          });
          
          if (tempKeywords.length >= 5) {
            console.log(`[BOKJIRO-REALTIME] 선택자 "${selector}"에서 ${tempKeywords.length}개 키워드 발견`);
            break;
          }
        }
        
        // 대체 선택자 결과 추가
        tempKeywords.forEach((keyword) => {
          if (result.length >= maxLimit) return;
          
          const isDuplicate = result.some(item => 
            item.keyword.toLowerCase() === keyword.toLowerCase()
          );
          
          if (!isDuplicate) {
            result.push({
              keyword: keyword,
              rank: result.length + 1
            });
          }
        });
      }
      
          console.log(`[BOKJIRO-REALTIME] 최종 결과: ${result.length}개 키워드`);
          return result;
        }, limit);
        
        console.log(`[BOKJIRO-REALTIME] ${keywords.length}개 키워드 발견`);
        
        // 키워드가 없으면 에러 메시지와 함께 상세 정보 출력
        if (keywords.length === 0) {
          // 페이지 구조 다시 확인
          const debugInfo = await page.evaluate(() => {
        const rankMenus = document.querySelectorAll('.rankmenu');
        const firstRankMenu = rankMenus[0];
        const firstKeyword = firstRankMenu?.querySelector('.keyword');
        
            return {
              rankmenuCount: rankMenus.length,
              firstRankMenuExists: !!firstRankMenu,
              firstKeywordExists: !!firstKeyword,
              firstKeywordHTML: firstKeyword ? firstKeyword.innerHTML.substring(0, 200) : 'N/A',
              firstKeywordText: firstKeyword ? firstKeyword.textContent : 'N/A',
              firstKeywordClText: firstKeyword?.querySelector('.cl-text')?.textContent || 'N/A'
            };
          });
          
          console.error('[BOKJIRO-REALTIME] 키워드 추출 실패 - 디버그 정보:', JSON.stringify(debugInfo, null, 2));
          throw new Error(`키워드 수집 부족: 0개 (디버그: rankmenu=${debugInfo.rankmenuCount}, firstKeyword=${debugInfo.firstKeywordExists})`);
        }
        
        // 결과 변환
        const realtimeKeywords: BokjiroRealtimeKeyword[] = keywords
          .slice(0, limit)
          .map((item: { keyword: string; rank: number }, index: number) => ({
            rank: index + 1,
            keyword: item.keyword,
            source: 'bokjiro',
            timestamp: new Date().toISOString()
          }));
    
        console.log(`[BOKJIRO-REALTIME] 일간 인기 키워드 ${realtimeKeywords.length}개 수집 완료`);
        
        // 1개 이상이면 반환
        if (realtimeKeywords.length > 0) {
          return realtimeKeywords;
        }
        
        // 0개일 경우에만 에러 발생
        throw new Error(`키워드 수집 부족: 0개`);
        
      } catch (error: any) {
        console.error('[BOKJIRO-REALTIME] Puppeteer 크롤링 실패:', error.message || error);
        throw error;
      } finally {
        if (page) {
          try {
            await page.close();
          } catch (e) {
            console.warn('[BOKJIRO-REALTIME] 페이지 종료 오류:', e);
          }
        }
        // 브라우저를 풀에 반환
        if (browser) {
          browserPool.release(browser);
        }
      }
    },
    3600000 // 1시간 TTL
  );
}

