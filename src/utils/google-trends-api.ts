/**
 * Google Trends API 유틸리티
 * Puppeteer를 사용하여 실제 Google Trends 페이지를 크롤링
 * 공식 API가 없으므로 웹 크롤링 방식 활용
 */

export interface GoogleTrendKeyword {
  rank: number;
  keyword: string;
  changeRate: number;
  category: string;
}

let cachedTrendKeywords: GoogleTrendKeyword[] | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60 * 1000;

export function clearCache(): void {
  cachedTrendKeywords = null;
  cachedAt = 0;
}

/**
 * Google CSE를 사용하여 Google Trends 인기 검색어 가져오기 (우선순위 1)
 */
async function getGoogleTrendKeywordsWithCSE(): Promise<GoogleTrendKeyword[] | null> {
  try {
    // 환경 변수에서 Google CSE 키 로드
    const { loadEnvFromFile } = await import('../env');
    const env = loadEnvFromFile();
    const googleCseKey = env['googleCseKey'] || env['GOOGLE_CSE_KEY'] || process.env['GOOGLE_CSE_KEY'];
    const googleCseCx = env['googleCseCx'] || env['GOOGLE_CSE_CX'] || env['googleCseId'] || env['GOOGLE_CSE_ID'] || process.env['GOOGLE_CSE_CX'] || process.env['GOOGLE_CSE_ID'];
    
    if (!googleCseKey || !googleCseCx) {
      console.log('[GOOGLE-TRENDS] Google CSE 키가 설정되지 않음, Puppeteer로 전환');
      return null;
    }
    
    console.log('[GOOGLE-TRENDS] Google CSE를 사용하여 트렌드 키워드 검색 시작');
    
    // Google CSE로 한국 인기 검색어 관련 쿼리들
    const trendingQueries = [
      '인기 검색어',
      '트렌드 검색어',
      '실시간 검색어',
      '오늘의 검색어',
      '인기 키워드'
    ];
    
    const allKeywords: GoogleTrendKeyword[] = [];
    const keywordSet = new Set<string>();
    
    for (const query of trendingQueries.slice(0, 3)) {
      try {
        const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${googleCseKey}&cx=${googleCseCx}&q=${encodeURIComponent(query)}&num=10&lr=lang_ko&cr=countryKR`;
        const response = await fetch(searchUrl);
        const data = await response.json();
        
        if (data.items && data.items.length > 0) {
          data.items.forEach((item: any) => {
            // 제목에서 키워드 추출
            const title = (item.title || '').replace(/<[^>]*>/g, '').trim();
            const snippet = (item.snippet || '').replace(/<[^>]*>/g, '').trim();
            
            // 제목과 스니펫에서 키워드 추출 (한글 위주, 2-15자)
            const extractKeywords = (text: string) => {
              const keywords: string[] = [];
              // 한글 단어 추출 (2-15자)
              const koreanMatches = text.match(/[가-힣]{2,15}/g);
              if (koreanMatches) {
                keywords.push(...koreanMatches);
              }
              return keywords;
            };
            
            const titleKeywords = extractKeywords(title);
            const snippetKeywords = extractKeywords(snippet);
            const combinedKeywords = [...titleKeywords, ...snippetKeywords];
            
            combinedKeywords.forEach((keyword) => {
              // 유효성 검증
              if (keyword.length >= 2 && 
                  keyword.length <= 15 &&
                  !keyword.includes('검색') &&
                  !keyword.includes('인기') &&
                  !keyword.includes('트렌드') &&
                  !keyword.includes('실시간') &&
                  !keyword.includes('키워드') &&
                  !keyword.includes('오늘의') &&
                  !keywordSet.has(keyword)) {
                keywordSet.add(keyword);
                allKeywords.push({
                  rank: allKeywords.length + 1,
                  keyword: keyword,
                  changeRate: 100 - (allKeywords.length * 5),
                  category: '일반'
                });
              }
            });
            
            if (allKeywords.length >= 10) return;
          });
        }
        
        if (allKeywords.length >= 10) break;
        
        // API 호출 제한 고려
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (cseError: any) {
        console.warn(`[GOOGLE-TRENDS] CSE 쿼리 "${query}" 실패:`, cseError.message);
        continue;
      }
    }
    
    if (allKeywords.length > 0) {
      console.log(`[GOOGLE-TRENDS] Google CSE에서 ${allKeywords.length}개 키워드 추출 성공`);
      return allKeywords.slice(0, 10);
    }
    
    return null;
  } catch (error: any) {
    console.warn('[GOOGLE-TRENDS] Google CSE 실패:', error.message);
    return null;
  }
}

/**
 * Puppeteer를 사용하여 Google Trends 인기 검색어 크롤링 (Fallback)
 */
export async function getGoogleTrendKeywords(): Promise<GoogleTrendKeyword[]> {
  if (cachedTrendKeywords && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedTrendKeywords;
  }

  // 우선순위 1: Google CSE 사용
  const cseKeywords = await getGoogleTrendKeywordsWithCSE();
  if (cseKeywords && cseKeywords.length > 0) {
    cachedTrendKeywords = cseKeywords;
    cachedAt = Date.now();
    return cseKeywords;
  }
  
  // 우선순위 2: Puppeteer 사용
  let browser: any = null;
  
  try {
    console.log('[GOOGLE-TRENDS] Puppeteer로 Google Trends 크롤링 시작');
    
    // Puppeteer 동적 import (일반 puppeteer 사용)
    const puppeteer = await import('puppeteer');
    
    console.log('[GOOGLE-TRENDS] 브라우저 실행 중...');
    browser = await puppeteer.default.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage'
      ]
    });
    
    const page = await browser.newPage();
    
    // User-Agent 설정
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // 언어 설정
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
    });
    
    // Google Trends 한국 일일 트렌드 페이지 접속
    const trendsUrl = 'https://trends.google.co.kr/trendingsearches/daily?geo=KR&hl=ko';
    console.log('[GOOGLE-TRENDS] 페이지 로딩 중 (일일 트렌드):', trendsUrl);
    
    await page.goto(trendsUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    // 페이지 로딩 대기 (JavaScript 렌더링 완료까지 - 더 긴 대기)
    await page.waitForTimeout(8000);
    
    // 테이블이 로드될 때까지 대기 (여러 선택자 시도)
    let tableFound = false;
    const tableSelectors = [
      'tbody[jsname="cC57zf"]',
      'tbody',
      '.mZ3RIc',
      'table',
      '[jsname="cC57zf"]'
    ];
    
    for (const selector of tableSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        console.log(`[GOOGLE-TRENDS] 선택자 "${selector}" 로드 완료`);
        tableFound = true;
        break;
      } catch (e) {
        console.log(`[GOOGLE-TRENDS] 선택자 "${selector}" 로드 대기 실패`);
      }
    }
    
    if (!tableFound) {
      console.log('[GOOGLE-TRENDS] 테이블을 찾지 못했지만 계속 진행...');
    }
    
    // 추가 대기 시간 (동적 콘텐츠 로딩)
    await page.waitForTimeout(3000);
    
    console.log('[GOOGLE-TRENDS] 페이지 크롤링 중...');
    
    // Google Trends 페이지에서 키워드 추출 (강화된 방법)
    const keywords = await page.evaluate(() => {
      const result: Array<{ keyword: string; rank: number }> = [];
      
      console.log('[GOOGLE-TRENDS] 페이지 구조 분석 시작...');
      
      // 우선순위 1: tbody[jsname="cC57zf"] 내의 tr[data-row-id]에서 .mZ3RIc 추출
      const tableBody = document.querySelector('tbody[jsname="cC57zf"]');
      if (tableBody) {
        console.log('[GOOGLE-TRENDS] 테이블 tbody 발견');
        const rows = tableBody.querySelectorAll('tr[data-row-id]');
        console.log(`[GOOGLE-TRENDS] 행 ${rows.length}개 발견`);
        
        for (let i = 0; i < rows.length && result.length < 10; i++) {
          const row = rows[i];
          if (!row) continue;
          
          // 여러 방법으로 키워드 추출 시도
          let keyword = '';
          
          // 방법 1: .mZ3RIc 클래스
          const keywordEl = row.querySelector('.mZ3RIc');
          if (keywordEl) {
            keyword = keywordEl.textContent?.trim() || '';
          }
          
          // 방법 2: data-term 속성
          if (!keyword || keyword.length < 2) {
            keyword = row.getAttribute('data-term') || '';
          }
          
          // 방법 3: 행 내의 모든 텍스트에서 첫 번째 의미있는 텍스트 추출
          if (!keyword || keyword.length < 2) {
            const allTexts = row.querySelectorAll('div, span, a');
            for (const textEl of Array.from(allTexts)) {
              const text = textEl.textContent?.trim() || '';
              if (text && text.length >= 2 && text.length <= 30 && /[가-힣]/.test(text)) {
                keyword = text;
                break;
              }
            }
          }
          
          // 기본적인 검증만 (필터링 최소화 - 일일 트렌드 그대로 가져오기)
          if (keyword && 
              keyword.length >= 2 && 
              keyword.length <= 30 &&
              !keyword.includes('http') &&
              !keyword.includes('google') &&
              !keyword.includes('trends') &&
              !keyword.includes('검색') &&
              !keyword.includes('탐색') &&
              !/^[\d\s\-_]+$/.test(keyword)) {
            
            // 중복 체크
            const isDuplicate = result.some(item => 
              item.keyword.toLowerCase() === keyword.toLowerCase()
            );
            
            if (!isDuplicate) {
              result.push({
                keyword: keyword,
                rank: result.length + 1
              });
              console.log(`[GOOGLE-TRENDS] 키워드 발견 (${result.length}번째): ${keyword}`);
            }
          }
        }
      } else {
        console.log('[GOOGLE-TRENDS] tbody[jsname="cC57zf"]를 찾지 못함');
      }
      
      // 우선순위 2: .mZ3RIc 클래스 직접 검색 (방법 1이 실패한 경우)
      if (result.length < 10) {
        const keywordElements = document.querySelectorAll('.mZ3RIc');
        console.log(`[GOOGLE-TRENDS] .mZ3RIc 요소 ${keywordElements.length}개 발견`);
        
        for (let i = 0; i < keywordElements.length && result.length < 10; i++) {
          const el = keywordElements[i];
          if (!el) continue;
          
          let keyword = el.textContent?.trim() || '';
          
          if (keyword && 
              keyword.length >= 2 && 
              keyword.length <= 30 &&
              !keyword.includes('http') &&
              !keyword.includes('google') &&
              !keyword.includes('trends') &&
              !keyword.includes('검색') &&
              !keyword.includes('탐색') &&
              !/^[\d\s\-_]+$/.test(keyword)) {
            
            const isDuplicate = result.some(item => 
              item.keyword.toLowerCase() === keyword.toLowerCase()
            );
            
            if (!isDuplicate) {
              result.push({
                keyword: keyword,
                rank: result.length + 1
              });
              console.log(`[GOOGLE-TRENDS] .mZ3RIc에서 키워드 발견: ${keyword}`);
            }
          }
        }
      }
      
      // 우선순위 3: 모든 테이블 행에서 키워드 추출 시도
      if (result.length < 10) {
        const allRows = document.querySelectorAll('tr[data-row-id]');
        console.log(`[GOOGLE-TRENDS] 모든 data-row-id 행 ${allRows.length}개 발견`);
        
        for (let i = 0; i < allRows.length && result.length < 10; i++) {
          const row = allRows[i];
          if (!row) continue;
          
          // 행 내의 모든 div, span에서 텍스트 추출
          const textElements = row.querySelectorAll('div, span');
          for (const textEl of Array.from(textElements)) {
            if (result.length >= 10) break;
            
            const text = textEl.textContent?.trim() || '';
            if (text && 
                text.length >= 2 && 
                text.length <= 30 &&
                /[가-힣]/.test(text) &&
                !text.includes('http') &&
                !text.includes('google') &&
                !text.includes('trends') &&
                !text.includes('검색') &&
                !text.includes('탐색') &&
                !/^[\d\s\-_]+$/.test(text)) {
              
              const isDuplicate = result.some(item => 
                item.keyword.toLowerCase() === text.toLowerCase()
              );
              
              if (!isDuplicate) {
                result.push({
                  keyword: text,
                  rank: result.length + 1
                });
                console.log(`[GOOGLE-TRENDS] 대체 방법으로 키워드 발견: ${text}`);
                break; // 한 행에서 하나만 추출
              }
            }
          }
        }
      }
      
      console.log(`[GOOGLE-TRENDS] 총 ${result.length}개 키워드 추출 완료`);
      return result;
    });
    
    console.log(`[GOOGLE-TRENDS] ${keywords.length}개 키워드 발견`);
    
    // 결과 변환 및 키워드 정제
    const trendKeywords: GoogleTrendKeyword[] = keywords
      .slice(0, 10) // 최대 10개
      .map((item: { keyword: string; rank: number }, index: number) => {
        // 키워드 정제
        let cleanKeyword = item.keyword
          .replace(/^\d+\.\s*/, '') // 순위 번호 제거
          .replace(/\s*-\s*Google\s*Trends.*/i, '') // "- Google Trends" 제거
          .replace(/\s*\(.*?\)/g, '') // 괄호 내용 제거
          .replace(/\s*\[.*?\]/g, '') // 대괄호 내용 제거
          .replace(/\s+/g, ' ') // 공백 정리
          .trim();
        
        // 추가 필터링: "search", "탐색" 등 불필요한 단어 제거
        if (cleanKeyword.toLowerCase().includes('search') || 
            cleanKeyword.includes('탐색') || 
            cleanKeyword.toLowerCase() === 'search' ||
            cleanKeyword === '탐색' ||
            cleanKeyword.toLowerCase().includes('search탐색')) {
          return null;
        }
        
        // 키워드가 비어있거나 너무 짧으면 스킵
        if (!cleanKeyword || cleanKeyword.length < 2) {
          return null;
        }
        
        // 너무 긴 키워드는 자르기 (50자 제한)
        if (cleanKeyword.length > 50) {
          cleanKeyword = cleanKeyword.substring(0, 50).trim();
          const lastSpace = cleanKeyword.lastIndexOf(' ');
          if (lastSpace > 0) {
            cleanKeyword = cleanKeyword.substring(0, lastSpace);
          }
        }
        
        return {
          rank: index + 1,
          keyword: cleanKeyword,
          changeRate: 100 - (index * 5), // 순위 기반 변화율 추정
          category: '일반'
        };
      })
      .filter((item: GoogleTrendKeyword | null): item is GoogleTrendKeyword => item !== null); // null 제거
    
    console.log(`[GOOGLE-TRENDS] 트렌드 키워드 ${trendKeywords.length}개 수집 완료`);
    
    if (trendKeywords.length > 0) {
      cachedTrendKeywords = trendKeywords;
      cachedAt = Date.now();
      return trendKeywords;
    }
    
    // 크롤링 실패 시 RSS 피드 시도
    console.log('[GOOGLE-TRENDS] 크롤링 결과 없음, RSS 피드 시도...');
    throw new Error('크롤링 결과 없음, RSS 피드로 전환');
    
  } catch (error: any) {
    console.warn('[GOOGLE-TRENDS] 크롤링 실패:', error.message || error);
    
    // Puppeteer 관련 에러 처리
    if (error.message && (error.message.includes('puppeteer') || error.message.includes('browser'))) {
      console.warn('[GOOGLE-TRENDS] Puppeteer 초기화 실패, RSS 피드로 전환');
    }
    
    // Fallback 1: RSS 피드 시도
    console.log('[GOOGLE-TRENDS] RSS 피드로 전환 시도...');
    try {
      const rssUrl = 'https://trends.google.com/trends/trendingsearches/daily/rss?geo=KR';
      const response = await fetch(rssUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8'
        }
      });
      
      if (response.ok) {
        const xmlText = await response.text();
        const itemMatches = xmlText.match(/<item>[\s\S]*?<\/item>/gi) || [];
        const keywords: GoogleTrendKeyword[] = [];
        
        itemMatches.forEach((item: string, index: number) => {
          const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/i);
          const keyword = (titleMatch?.[1] || titleMatch?.[2] || '').trim();
          
          if (keyword && keyword !== 'Google Trends') {
            keywords.push({
              rank: index + 1,
              keyword: keyword,
              changeRate: 100 - (index * 5),
              category: '일반'
            });
          }
        });
        
        if (keywords.length > 0) {
          console.log(`[GOOGLE-TRENDS] RSS 피드에서 ${keywords.length}개 키워드 추출 성공`);
          const finalKeywords = keywords.slice(0, 10);
          cachedTrendKeywords = finalKeywords;
          cachedAt = Date.now();
          return finalKeywords;
        }
      }
    } catch (rssError) {
      console.warn('[GOOGLE-TRENDS] RSS 피드도 실패:', rssError);
    }
    
    // Fallback 2: Google CSE 사용 (환경 변수에서 키 로드)
    console.log('[GOOGLE-TRENDS] Google CSE로 전환 시도...');
    try {
      // 환경 변수에서 Google CSE 키 로드
      const { loadEnvFromFile } = await import('../env');
      const env = loadEnvFromFile();
      const googleCseKey = env['googleCseKey'] || env['GOOGLE_CSE_KEY'];
      const googleCseCx = env['googleCseCx'] || env['GOOGLE_CSE_CX'];
      
      if (googleCseKey && googleCseCx) {
        console.log('[GOOGLE-TRENDS] Google CSE 키 확인됨, 인기 키워드 검색 시도...');
        
        // 한국 인기 검색어 관련 쿼리들
        const popularQueries = [
          '인기 검색어',
          '트렌드 키워드',
          '실시간 검색어',
          '인기 블로그 주제',
          '최신 트렌드'
        ];
        
        const allKeywords: GoogleTrendKeyword[] = [];
        
        for (const query of popularQueries.slice(0, 2)) { // 2개 쿼리만 시도
          try {
            const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${googleCseKey}&cx=${googleCseCx}&q=${encodeURIComponent(query)}&num=10&lr=lang_ko&cr=countryKR`;
            const response = await fetch(searchUrl);
            const data = await response.json();
            
            if (data.items && data.items.length > 0) {
              data.items.forEach((item: any) => {
                // 제목에서 키워드 추출
                const title = item.title || '';
                
                // 제목에서 키워드 추출 (간단한 추출)
                const extractedKeywords = title
                  .split(/[\s,\-\.]+/)
                  .filter((word: string) => word.length > 1 && word.length < 20);
                
                extractedKeywords.forEach((keyword: string) => {
                  if (!allKeywords.some(k => k.keyword === keyword) && keyword.length > 1) {
                    allKeywords.push({
                      rank: allKeywords.length + 1,
                      keyword: keyword,
                      changeRate: 100 - (allKeywords.length * 5),
                      category: '일반'
                    });
                  }
                });
                
                if (allKeywords.length >= 10) return;
              });
            }
            
            if (allKeywords.length >= 10) break;
          } catch (cseError) {
            console.warn(`[GOOGLE-TRENDS] CSE 쿼리 "${query}" 실패:`, cseError);
            continue;
          }
        }
        
        if (allKeywords.length > 0) {
          console.log(`[GOOGLE-TRENDS] Google CSE에서 ${allKeywords.length}개 키워드 추출 성공`);
          const finalKeywords = allKeywords.slice(0, 10);
          cachedTrendKeywords = finalKeywords;
          cachedAt = Date.now();
          return finalKeywords;
        }
      } else {
        console.warn('[GOOGLE-TRENDS] Google CSE 키가 설정되지 않았습니다.');
      }
    } catch (cseError) {
      console.warn('[GOOGLE-TRENDS] Google CSE 실패:', cseError);
    }
    
    console.log('[GOOGLE-TRENDS] 모든 방법 실패, 빈 배열 반환');
    return [];
  } finally {
    if (browser) {
      try {
        await browser.close();
        console.log('[GOOGLE-TRENDS] 브라우저 종료 완료');
      } catch (e) {
        console.warn('[GOOGLE-TRENDS] 브라우저 종료 오류:', e);
      }
    }
  }
}

