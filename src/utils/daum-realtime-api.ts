/**
 * 🔥 다음(Daum) AI 이슈 브리핑 크롤러
 * 
 * 다음은 더 이상 실시간 검색어를 제공하지 않고,
 * "AI 이슈 브리핑" 형태로 6개의 이슈 키워드만 제공합니다.
 * 
 * 주의: 다음 메인 페이지는 JavaScript로 동적 렌더링되므로
 * Puppeteer 또는 브라우저 풀을 사용해야 합니다.
 */

import { browserPool } from './puppeteer-pool';

export interface DaumRealtimeKeyword {
  rank: number;
  keyword: string;
  source: string;
  timestamp: string;
}

/**
 * 다음 AI 이슈 브리핑 크롤링 (브라우저 풀 사용)
 * 최적화: 브라우저 풀을 사용하여 재사용, 리소스 차단으로 속도 향상
 */
export async function getDaumRealtimeKeywordsWithPuppeteer(limit: number = 10): Promise<DaumRealtimeKeyword[]> {
  const MAX_RETRIES = 2;
  const RETRY_DELAY = 1000;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let browser: any = null;
    let page: any = null;
    
    try {
      console.log(`[DAUM-REALTIME] ========== AI 이슈 브리핑 수집 시작 (시도 ${attempt}/${MAX_RETRIES}) ==========`);
      
      // 브라우저 풀에서 가져오기
      browser = await browserPool.acquire();
      page = await browser.newPage();
      
      // 리소스 차단으로 속도 향상
      await page.setRequestInterception(true);
      page.on('request', (req: any) => {
        const resourceType = req.resourceType();
        if (['image', 'font', 'media', 'stylesheet'].includes(resourceType)) {
          req.abort();
        } else {
          req.continue();
        }
      });
      
      // User-Agent 설정
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // 다음 메인 페이지 접속
      const daumUrl = 'https://www.daum.net/';
      console.log(`[DAUM-REALTIME] 페이지 로딩: ${daumUrl}`);
      
      await page.goto(daumUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });
      
      // JavaScript 렌더링 대기
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      console.log('[DAUM-REALTIME] 페이지 크롤링 중...');
      
      // 페이지에서 이슈 키워드 추출 (다양한 방법 시도)
      const keywords = await page.evaluate((maxLimit: number) => {
        const result: Array<{ keyword: string; rank: number }> = [];
        const seenKeywords = new Set<string>();
        
        // 제외할 텍스트 패턴
        const excludePatterns = [
          /^더보기$/i, /^전체보기$/i, /^검색$/i, /^다음$/i,
          /^로그인$/i, /^회원가입$/i, /^자세히/i, /^닫기$/i,
          /^도움말/i, /^AI 이슈 브리핑$/i, /^이전$/i, /^다음$/i,
          /^접기$/i, /MOMENT/i, /^선택됨/i, /^주요 뉴스/i,
          /^정렬 기준/i, /광고/i, /^바로가기$/i, /^이슈$/i,
          // 주식 정보 제외
          /코스피|코스닥|다우존스|나스닥|현재가|전일대비/i,
          /\+\d+\.\d+%|\-\d+\.\d+%/,
          // 기타 제외
          /^뉴스$/i, /^스포츠$/i, /^연예$/i, /^쇼핑$/i,
        ];
        
        const addKeyword = (text: string) => {
          if (result.length >= maxLimit) return;
          text = text?.trim() || '';
          
          // 기본 검증
          if (text.length < 4 || text.length > 60) return;
          if (!/[가-힣]/.test(text)) return;
          if (excludePatterns.some(p => p.test(text))) return;
          if (seenKeywords.has(text.toLowerCase())) return;
          
          // 숫자로 시작하면 순위 번호 제거 (예: "1박주민, 서울시장" → "박주민, 서울시장")
          const cleaned = text.replace(/^\d+\.?\s*/, '').trim();
          if (cleaned.length < 4) return;
          if (seenKeywords.has(cleaned.toLowerCase())) return;
          
          seenKeywords.add(text.toLowerCase());
          seenKeywords.add(cleaned.toLowerCase());
          result.push({
            keyword: cleaned,
            rank: result.length + 1
          });
        };
        
        // 방법 1: "이슈" 섹션에서 리스트 아이템 찾기
        const headings = document.querySelectorAll('h2, h3, h4, strong, .tit_g');
        
        for (const h of Array.from(headings)) {
          const text = h.textContent?.trim() || '';
          if (text === '이슈' || text.includes('이슈')) {
            // 부모 요소에서 리스트 찾기
            let parent = h.parentElement;
            for (let i = 0; i < 15 && parent; i++) {
              // ol, ul 리스트
              const lists = parent.querySelectorAll('ol li, ul li');
              if (lists.length >= 3) {
                lists.forEach(li => {
                  const link = li.querySelector('a');
                  const linkText = link?.textContent?.trim() || li.textContent?.trim() || '';
                  addKeyword(linkText);
                });
                if (result.length >= 5) break;
              }
              parent = parent.parentElement;
            }
            if (result.length >= 5) break;
          }
        }
        
        // 방법 2: 순위 형태의 리스트 찾기 (1, 2, 3... 번호가 있는)
        if (result.length < 5) {
          const allLists = document.querySelectorAll('ol li, ul li');
          let foundRanked = false;
          
          allLists.forEach(li => {
            if (result.length >= maxLimit) return;
            const text = li.textContent?.trim() || '';
            
            // 순위 패턴 확인 (1 키워드, 2 키워드...)
            if (/^\d+\s*[가-힣]/.test(text) && text.length >= 6 && text.length <= 50) {
              addKeyword(text);
              foundRanked = true;
            }
          });
        }
        
        // 방법 3: 뉴스 제목 스타일의 키워드 찾기
        if (result.length < 5) {
          document.querySelectorAll('.txt_issue a, .issue_item a, [class*="issue"] a, a[href*="search"]').forEach(a => {
            if (result.length >= maxLimit) return;
            const text = a.textContent?.trim() || '';
            if (text.length >= 6 && text.length <= 40) {
              addKeyword(text);
            }
          });
        }
        
        // 방법 4: 모든 링크에서 이슈 키워드 패턴 찾기
        if (result.length < 5) {
          document.querySelectorAll('a').forEach(a => {
            if (result.length >= maxLimit) return;
            const text = a.textContent?.trim() || '';
            
            // 이슈 키워드 스타일: 콤마로 구분된 이름,사건 형태
            if (text.length >= 5 && text.length <= 40) {
              const isIssueStyle = 
                /[,，].*[가-힣]/.test(text) ||  // "이름, 무엇" 형태
                /논란|선언|발표|구속|체포|사망|결혼|이혼|출마|당선|사퇴|은퇴/.test(text);
              
              if (isIssueStyle) {
                addKeyword(text);
              }
            }
          });
        }
        
        // 방법 5: 뉴스 헤드라인에서 추출
        if (result.length < 5) {
          document.querySelectorAll('.news_item a, .headline a, .tit_news a, .link_txt').forEach(a => {
            if (result.length >= maxLimit) return;
            const text = a.textContent?.trim() || '';
            if (text.length >= 10 && text.length <= 50 && /[가-힣].*[가-힣]/.test(text)) {
              addKeyword(text);
            }
          });
        }
        
        return result;
      }, limit);
      
      console.log(`[DAUM-REALTIME] ${keywords.length}개 키워드 발견`);
      
      // 부족하면 뉴스 섹션에서 추가 수집
      if (keywords.length < limit) {
        console.log(`[DAUM-REALTIME] 키워드 부족, 뉴스 헤드라인에서 추가 수집...`);
        
        const additionalKeywords = await page.evaluate((currentCount: number, maxLimit: number) => {
          const result: Array<{ keyword: string; rank: number }> = [];
          const seenKeywords = new Set<string>();
          
          // 다음 뉴스 헤드라인
          const newsSelectors = [
            '.cont_newsheadline a',
            '.news_headline a',
            '.list_newsissue a',
            '.news_view a',
            '.tit_wrap a',
            'article a'
          ];
          
          for (const selector of newsSelectors) {
            if (result.length >= maxLimit - currentCount) break;
            
            document.querySelectorAll(selector).forEach(a => {
              if (result.length >= maxLimit - currentCount) return;
              
              const text = a.textContent?.trim() || '';
              
              // 뉴스 제목에서 핵심 키워드 추출
              if (text.length >= 8 && text.length <= 50 && /[가-힣]/.test(text)) {
                // 인물명 + 이벤트 패턴
                const match = text.match(/([가-힣]{2,4})[,\s]+(.*)/);
                if (match && !seenKeywords.has(text.toLowerCase())) {
                  seenKeywords.add(text.toLowerCase());
                  result.push({
                    keyword: text.substring(0, 40),
                    rank: currentCount + result.length + 1
                  });
                }
                // 일반 뉴스 제목
                else if (!seenKeywords.has(text.toLowerCase()) && text.length <= 35) {
                  seenKeywords.add(text.toLowerCase());
                  result.push({
                    keyword: text,
                    rank: currentCount + result.length + 1
                  });
                }
              }
            });
          }
          
          return result;
        }, keywords.length, limit);
        
        keywords.push(...additionalKeywords);
        console.log(`[DAUM-REALTIME] 추가 ${additionalKeywords.length}개, 총 ${keywords.length}개`);
      }
      
      // 결과 변환
      const realtimeKeywords: DaumRealtimeKeyword[] = keywords
        .slice(0, limit)
        .map((item: { keyword: string; rank: number }, index: number) => ({
          rank: index + 1,
          keyword: item.keyword,
          source: 'daum',
          timestamp: new Date().toISOString()
        }));
      
      if (realtimeKeywords.length > 0) {
        console.log(`[DAUM-REALTIME] ✅ 다음 이슈 키워드 ${realtimeKeywords.length}개 수집 완료`);
        realtimeKeywords.forEach((k, i) => {
          console.log(`  ${i + 1}. ${k.keyword}`);
        });
        return realtimeKeywords;
      } else {
        throw new Error('No keywords found on daum.net');
      }
      
    } catch (error: any) {
      console.error(`[DAUM-REALTIME] ⚠️ 시도 ${attempt} 실패:`, error.message || error);
      
      if (attempt < MAX_RETRIES) {
        console.log(`[DAUM-REALTIME] ${RETRY_DELAY}ms 후 재시도...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      } else {
        console.error('[DAUM-REALTIME] ❌ 모든 시도 실패');
        throw error;
      }
    } finally {
      if (page) {
        try {
          await page.close();
        } catch (e) {
          // 무시
        }
      }
      if (browser) {
        browserPool.release(browser);
      }
    }
  }
  
  return [];
}
