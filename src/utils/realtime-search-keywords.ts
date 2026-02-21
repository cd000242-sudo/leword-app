// 실시간 검색어 크롤링 유틸리티
import axios from 'axios';
import * as cheerio from 'cheerio';

export interface RealtimeKeyword {
  keyword: string;
  rank: number;
  source: 'zum' | 'google' | 'nate' | 'daum' | 'naver' | 'bokjiro' | 'youtube';
  timestamp: string;
  change?: 'up' | 'down' | 'new' | 'stable';
  previousRank?: number;
  searchVolume?: number;
  changeRate?: number;
}

let cachedAllRealtime: {
  zum: RealtimeKeyword[];
  google: RealtimeKeyword[];
  nate: RealtimeKeyword[];
  daum: RealtimeKeyword[];
  naver: RealtimeKeyword[];
  bokjiro: RealtimeKeyword[];
  timestamp: string;
} | null = null;
let cachedAllRealtimeAt = 0;
const ALL_REALTIME_CACHE_TTL_MS = 60 * 1000;

export function clearCache(): void {
  cachedAllRealtime = null;
  cachedAllRealtimeAt = 0;
}

/**
 * ZUM 실시간 검색어 크롤링
 */
export async function getZumRealtimeKeywords(limit: number = 20): Promise<RealtimeKeyword[]> {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[ZUM-REALTIME] ========== ZUM 실시간 검색어 수집 시작 (시도 ${attempt}/${MAX_RETRIES}) ==========`);
      const keywords: RealtimeKeyword[] = [];
      
      console.log('[ZUM-REALTIME] ZUM 메인 페이지에서 실시간 검색어 크롤링');
      const urls = [
        'https://www.zum.com/',
        'https://zum.com/',
        'https://m.zum.com/'
      ];
      
      let response;
      for (const url of urls) {
        try {
          console.log(`[ZUM-REALTIME] HTML 페이지 요청: ${url}`);
          response = await axios.get(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
              'Referer': 'https://www.zum.com/',
              'Accept-Encoding': 'gzip, deflate, br',
              'Connection': 'keep-alive',
              'Upgrade-Insecure-Requests': '1'
            },
            timeout: 20000,
            validateStatus: (status) => status < 500,
            maxRedirects: 5
          });
          
          console.log(`[ZUM-REALTIME] HTML 응답: ${url} - 상태: ${response.status}, 길이: ${response.data?.length || 0} bytes`);
          
          if (response.status === 200 && response.data) {
            break;
          }
        } catch (err: any) {
          console.warn(`[ZUM-REALTIME] HTML 요청 실패 (${url}):`, {
            message: err?.message,
            status: err?.response?.status,
            code: err?.code
          });
        }
      }
    
      if (response && response.data) {
        const fullHtml = response.data;
        console.log(`[ZUM-REALTIME] HTML 파싱 시작, HTML 길이: ${fullHtml?.length || 0}`);
        
        // 실시간 검색어 관련 키워드 확인
        const realtimeMatch = fullHtml.match(/실시간[\s\S]{0,500}/i);
        console.log(`[ZUM-REALTIME] "실시간" 키워드 발견: ${realtimeMatch ? '있음' : '없음'}`);
        
        // 디버깅: 실제 매칭된 내용 출력
        if (realtimeMatch) {
          console.log(`[ZUM-REALTIME] 실시간 섹션 샘플:`, realtimeMatch[0].substring(0, 200));
        }
        
        // Cheerio로 DOM 파싱
        const $ = cheerio.load(fullHtml);
        
        // 방법 1: JSON 데이터 추출 (스크립트 태그에서)
        console.log('[ZUM-REALTIME] 방법 1: 스크립트 태그에서 JSON 데이터 추출');
        const scriptTags = $('script');
        console.log(`[ZUM-REALTIME] 발견된 스크립트 태그: ${scriptTags.length}개`);
        
        $('script').each((_i, scriptEl) => {
          if (keywords.length >= limit) return;
          
          const scriptContent = $(scriptEl).html() || '';
          if (scriptContent.length < 50) return; // 너무 짧은 스크립트는 스킵
          
          // ZUM JSON 패턴들 (더 많은 패턴 추가)
          const jsonPatterns = [
            /window\.zum\s*=\s*JSON\.parse\(['"]([^'"]+)['"]\)/,
            /guideQuery\s*[:=]\s*(\{[^}]+\})/s,
            /realtimeKeywords\s*[:=]\s*(\[[^\]]+\])/s,
            /issueKeywords\s*[:=]\s*(\[[^\]]+\])/s,
            /trendKeywords\s*[:=]\s*(\[[^\]]+\])/s,
            /"keyword"\s*:\s*"([^"]+)"/g,
            /"query"\s*:\s*"([^"]+)"/g,
            /"title"\s*:\s*"([^"]+)"/g,
            /"text"\s*:\s*"([^"]+)"/g,
            /"word"\s*:\s*"([^"]+)"/g,
            /"name"\s*:\s*"([^"]+)"/g
          ];
          
          for (const pattern of jsonPatterns) {
            if (keywords.length >= limit) break;
            
            let match;
            while ((match = pattern.exec(scriptContent)) !== null && keywords.length < limit) {
              const jsonStr = match[1];
              if (!jsonStr) continue;
              
              try {
                // JSON 문자열인 경우 파싱
                if (jsonStr.startsWith('{') || jsonStr.startsWith('[')) {
                  const data = JSON.parse(jsonStr);
                  if (Array.isArray(data)) {
                    data.forEach((item: any) => {
                      if (keywords.length >= limit) return;
                      const keyword = typeof item === 'string' ? item : (item.keyword || item.text || item.title || item.query || item.word || item.name || '');
                      if (keyword && keyword.length > 1 && keyword.length < 50 &&
                          !keyword.includes('http') &&
                          !keyword.includes('🔥') &&
                          !keyword.includes('뉴스') &&
                          !keyword.includes('문서') &&
                          !keyword.includes('검색') &&
                          !keyword.includes('더보기') &&
                          !/^[a-zA-Z\s]+$/.test(keyword)) {
                        keywords.push({
                          rank: keywords.length + 1,
                          keyword: keyword.trim(),
                          source: 'zum',
                          timestamp: new Date().toISOString()
                        });
                        console.log(`[ZUM-REALTIME] JSON에서 키워드 발견: ${keyword}`);
                      }
                    });
                  } else if (data.keywords || data.items || data.list || data.data) {
                    const keywordList = data.keywords || data.items || data.list || data.data || [];
                    keywordList.forEach((item: any) => {
                      if (keywords.length >= limit) return;
                      const keyword = typeof item === 'string' ? item : (item.keyword || item.text || item.title || item.query || item.word || item.name || '');
                      if (keyword && keyword.length > 1 && keyword.length < 50 &&
                          !keyword.includes('http') &&
                          !keyword.includes('🔥') &&
                          !keyword.includes('뉴스') &&
                          !keyword.includes('문서') &&
                          !keyword.includes('검색') &&
                          !keyword.includes('더보기') &&
                          !/^[a-zA-Z\s]+$/.test(keyword)) {
                        keywords.push({
                          rank: keywords.length + 1,
                          keyword: keyword.trim(),
                          source: 'zum',
                          timestamp: new Date().toISOString()
                        });
                        console.log(`[ZUM-REALTIME] JSON에서 키워드 발견: ${keyword}`);
                      }
                    });
                  }
                } else {
                  // 단순 문자열인 경우
                  const keyword = jsonStr.trim();
                  if (keyword && keyword.length > 1 && keyword.length < 50 &&
                      !keyword.includes('http') &&
                      !keyword.includes('🔥') &&
                      !keyword.includes('뉴스') &&
                      !keyword.includes('문서') &&
                      !keyword.includes('검색') &&
                      !keyword.includes('더보기') &&
                      !/^[a-zA-Z\s]+$/.test(keyword)) {
                    if (!keywords.some(k => k.keyword === keyword)) {
                      keywords.push({
                        rank: keywords.length + 1,
                        keyword: keyword,
                        source: 'zum',
                        timestamp: new Date().toISOString()
                      });
                      console.log(`[ZUM-REALTIME] 패턴에서 키워드 발견: ${keyword}`);
                    }
                  }
                }
              } catch (parseError) {
                // 파싱 실패 무시
              }
            }
          }
        });
        
        console.log(`[ZUM-REALTIME] JSON 파싱 후 키워드 개수: ${keywords.length}`);
        
        // 방법 2: HTML DOM 파싱 (실시간 검색어 섹션 찾기)
        if (keywords.length < limit) {
          console.log('[ZUM-REALTIME] HTML DOM 파싱 시도');
          
          const selectors = [
            'a[href*="/search?q="]',
            'a[href*="/search?query="]',
            'a[href*="search"]',
            '.realtime_keyword a',
            '.keyword_list a',
            '.rank_list a',
            '.issue_keyword a',
            'li[class*="rank"] a',
            'li[class*="keyword"] a',
            'li[class*="issue"] a',
            '[class*="realtime"] a',
            '[class*="issue"] a',
            'ol li a',
            'ul li a',
            'div[class*="keyword"] a',
            'div[class*="rank"] a',
            'div[class*="issue"] a'
          ];
          
          const tempKeywords = new Set<string>();
          
          for (const selector of selectors) {
            if (tempKeywords.size >= limit) break;
            
            const elements = $(selector);
            console.log(`[ZUM-REALTIME] 선택자 "${selector}": ${elements.length}개 발견`);
            
            for (let idx = 0; idx < elements.length && tempKeywords.size < limit * 2; idx++) {
              const el = elements.eq(idx);
              let keyword = el.text().trim();
              
              // href에서 키워드 추출 (우선순위 높음)
              const href = el.attr('href') || '';
              if (href) {
                const hrefMatch = href.match(/[?&](?:q|query|keyword)=([^&]+)/);
                if (hrefMatch && hrefMatch[1]) {
                  try {
                    const decoded = decodeURIComponent(hrefMatch[1]).trim();
                    if (decoded && decoded.length > 1) {
                      keyword = decoded;
                    }
                  } catch (e) {
                    // 디코딩 실패 무시
                  }
                }
              }
              
              // data 속성에서 키워드 추출
              if (!keyword || keyword.length < 2) {
                keyword = el.attr('data-keyword') || el.attr('data-query') || el.attr('data-text') || '';
              }
              
              // 키워드 정제
              keyword = keyword.replace(/^\d+\.?\s*/, '').replace(/^\d+위\s*/, '').trim();
              
              if (keyword && 
                  keyword.length >= 2 && 
                  keyword.length < 50 &&
                  !keyword.includes('http') &&
                  !keyword.includes('://') &&
                  !keyword.includes('🔥') &&
                  !keyword.includes('뉴스') &&
                  !keyword.includes('문서') &&
                  !keyword.includes('검색') &&
                  !keyword.includes('더보기') &&
                  !keyword.includes('전체보기') &&
                  !keyword.match(/^(제목|내용|링크|URL|이미지|사진|영상|동영상|비디오)$/i) &&
                  !/^[a-zA-Z\s]+$/.test(keyword)) {
                tempKeywords.add(keyword);
                console.log(`[ZUM-REALTIME] HTML에서 키워드 발견: ${keyword}`);
              }
            }
            
            if (tempKeywords.size >= 5) {
              console.log(`[ZUM-REALTIME] 선택자 "${selector}"에서 ${tempKeywords.size}개 키워드 발견`);
              break;
            }
          }
          
          // Set에서 키워드 추가
          Array.from(tempKeywords).slice(0, limit).forEach((keyword, idx) => {
            if (!keywords.some(k => k.keyword === keyword)) {
              keywords.push({
                rank: keywords.length + 1,
                keyword: keyword,
                source: 'zum',
                timestamp: new Date().toISOString()
              });
            }
          });
        }
        
        // 키워드 수집 성공 시 즉시 반환
        if (keywords.length >= 5) {
          console.log(`[ZUM-REALTIME] ✅ 수집 완료: ${keywords.length}개 키워드 (시도 ${attempt}/${MAX_RETRIES})`);
          
          // 중복 제거
          const uniqueKeywords = Array.from(
            new Map(keywords.map(k => [k.keyword, k])).values()
          );
          
          // 🔥 광고성 키워드 필터링 적용 (보험, 병원, 학원 등)
          const zumAdFilters = ['보험', '병원', '학원', '대출', '클리닉', '성형', '치과', '라식', '라섹', '임플란트', '탈모', '비뇨', '한의원', '변호사', '회생', '파산', '쿠팡', '사주', '운세', '중고차', '시세', '이사', '인테리어', '창업', '분양', '렌탈', '렌트', '매매'];
          const filteredKeywords = uniqueKeywords.filter(k => {
            const lowerKw = k.keyword.toLowerCase();
            const isAd = zumAdFilters.some(f => lowerKw.includes(f));
            if (isAd) {
              console.log(`[ZUM-REALTIME] ⚠️ 광고 필터링: ${k.keyword}`);
            }
            return !isAd;
          });
          
          // 필터링 후 순위 재정렬
          return filteredKeywords.slice(0, limit).map((k, idx) => ({
            ...k,
            rank: idx + 1
          }));
        }
        
        console.warn(`[ZUM-REALTIME] ⚠️ 키워드 부족: ${keywords.length}개만 수집됨`);
      }
      
      // 재시도
      if (attempt < MAX_RETRIES) {
        console.log(`[ZUM-REALTIME] ${RETRY_DELAY}ms 후 재시도...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }
      
    } catch (error: any) {
      console.error(`[ZUM-REALTIME] ❌ 시도 ${attempt} 실패:`, {
        message: error?.message,
        status: error?.response?.status,
        code: error?.code
      });
      
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }
    }
  }
  
  console.warn('[ZUM-REALTIME] 모든 재시도 실패, 빈 배열 반환');
  return [];
}

/**
 * Google 실시간 검색어 (Google Trends 활용)
 */
export async function getGoogleRealtimeKeywords(limit: number = 20): Promise<RealtimeKeyword[]> {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[GOOGLE-REALTIME] ========== Google 실시간 검색어 수집 시작 (시도 ${attempt}/${MAX_RETRIES}) ==========`);
      const keywords: RealtimeKeyword[] = [];
      
      // 방법 1: Google Trends RSS 피드 시도 (우선순위 1 - 일일 트렌드 순위대로 10개)
      console.log('[GOOGLE-REALTIME] 방법 1: Google Trends RSS 피드 시도 (일일 트렌드 10개)');
      try {
        const rssUrls = [
          'https://trends.google.com/trends/trendingsearches/daily/rss?geo=KR&hl=ko',
          'https://trends.google.com/trends/trendingsearches/daily/rss?geo=KR'
        ];
        
        for (const rssUrl of rssUrls) {
          try {
            console.log(`[GOOGLE-REALTIME] RSS 피드 요청: ${rssUrl}`);
            const rssResponse = await axios.get(rssUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/rss+xml, application/xml, text/xml, */*'
              },
              timeout: 10000
            });
            
            if (rssResponse.status === 200 && rssResponse.data) {
              const rssContent = rssResponse.data;
              const $rss = cheerio.load(rssContent, { xmlMode: true });
              
              // 순서대로 최대 10개만 가져오기 (필터링 없이)
              $rss('item title').each((_i, el) => {
                if (keywords.length >= Math.min(limit, 10)) return; // 최대 10개
                const title = $rss(el).text().trim();
                
                // 기본적인 검증만 (너무 짧거나 URL 등은 제외)
                if (title && 
                    title.length >= 2 && 
                    !title.includes('http') && 
                    !title.includes('google') &&
                    !title.match(/^[\d\s\-_]+$/)) {
                  keywords.push({
                    rank: keywords.length + 1,
                    keyword: title,
                    source: 'google',
                    timestamp: new Date().toISOString()
                  });
                  console.log(`[GOOGLE-REALTIME] RSS에서 키워드 발견 (${keywords.length}번째): ${title}`);
                }
              });
              
              if (keywords.length >= Math.min(limit, 10)) {
                console.log(`[GOOGLE-REALTIME] ✅ RSS 피드에서 ${keywords.length}개 키워드 발견 (일일 트렌드 순위대로)`);
                return keywords.slice(0, Math.min(limit, 10)); // 최대 10개 반환
              }
            }
          } catch (rssError: any) {
            console.warn(`[GOOGLE-REALTIME] RSS 피드 실패 (${rssUrl}):`, rssError.message);
          }
        }
      } catch (rssError: any) {
        console.warn('[GOOGLE-REALTIME] RSS 피드 전체 실패:', rssError.message);
      }
      
      // 방법 2: Google Trends 일일 트렌드 HTML 페이지 크롤링 (RSS 실패 시)
      if (keywords.length < Math.min(limit, 10)) {
        try {
          console.log('[GOOGLE-REALTIME] 방법 2: Google Trends 일일 트렌드 HTML 크롤링');
          const response = await axios.get('https://trends.google.co.kr/trendingsearches/daily?geo=KR&hl=ko', {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
            'Referer': 'https://trends.google.co.kr/'
          },
          timeout: 15000,
          validateStatus: (status) => status < 500
        });
        
        console.log(`[GOOGLE-REALTIME] HTML 응답 상태: ${response.status}`);
        
        if (response.status === 200 && response.data) {
          const html = response.data;
          const $ = cheerio.load(html);
          
            // Google Trends 페이지에서 키워드 추출 (제공된 HTML 구조에 맞춤)
            // 우선순위 1: tbody[jsname="cC57zf"] 내의 tr[data-row-id]에서 .mZ3RIc 추출
            const tempKeywords = new Set<string>();
            
            // 방법 1: 테이블 구조에서 직접 추출 (Google Trends 실제 구조)
            const tableBody = $('tbody[jsname="cC57zf"]');
            if (tableBody.length > 0) {
              console.log(`[GOOGLE-REALTIME] 테이블 tbody 발견, 행 찾는 중...`);
              
              const rows = tableBody.find('tr[data-row-id]');
              for (let i = 0; i < rows.length && tempKeywords.size < Math.min(limit, 10); i++) {
                const row = rows.eq(i);
                // .mZ3RIc 클래스에서 키워드 추출 (제공된 HTML 구조)
                const keywordEl = row.find('.mZ3RIc').first();
                
                if (keywordEl.length > 0) {
                  let keyword = keywordEl.text().trim();
                  
                  // 기본적인 검증만 (필터링 최소화 - 일일 트렌드 그대로 가져오기)
                  if (keyword && 
                      keyword.length >= 2 && 
                      !keyword.includes('http') &&
                      !keyword.includes('google') &&
                      !keyword.includes('trends') &&
                      !/^[\d\s\-_]+$/.test(keyword)) {
                    tempKeywords.add(keyword);
                    console.log(`[GOOGLE-REALTIME] 테이블에서 키워드 발견 (${tempKeywords.size}번째): ${keyword}`);
                  }
                }
              }
              
              if (tempKeywords.size >= Math.min(limit, 10)) {
                console.log(`[GOOGLE-REALTIME] ✅ 테이블 구조에서 ${tempKeywords.size}개 키워드 발견`);
              }
            }
            
            // 방법 2: 대체 선택자들 시도 (방법 1이 실패한 경우)
            if (tempKeywords.size < Math.min(limit, 10)) {
              console.log(`[GOOGLE-REALTIME] 대체 선택자 시도 중...`);
              const selectors = [
                '.mZ3RIc', // 직접 키워드 클래스
                'a[href*="/trends/explore?q="]',
                'a[href*="/trends?q="]',
                '.trending-item-title',
                '.trending-item',
                '[data-trend]',
                '[data-term]', // data-term 속성
                '.md-list-item-text'
              ];
              
              for (const selector of selectors) {
                if (tempKeywords.size >= Math.min(limit, 10)) break;
                
                const elements = $(selector);
                console.log(`[GOOGLE-REALTIME] 선택자 "${selector}": ${elements.length}개 발견`);
                
                for (let idx = 0; idx < elements.length && tempKeywords.size < Math.min(limit, 10); idx++) {
                  const el = elements.eq(idx);
                  let keyword = el.text().trim();
                  
                  // href에서 키워드 추출 시도
                  const href = el.attr('href') || '';
                  if (href) {
                    const hrefMatch = href.match(/[?&]q=([^&]+)/);
                    if (hrefMatch && hrefMatch[1]) {
                      try {
                        keyword = decodeURIComponent(hrefMatch[1]).trim();
                      } catch (e) {
                        // 디코딩 실패 무시
                      }
                    }
                  }
                  
                  // data 속성에서 키워드 추출
                  if (!keyword || keyword.length < 2) {
                    keyword = el.attr('data-trend') || el.attr('data-keyword') || el.attr('data-term') || '';
                  }
                  
                  // 기본적인 검증만 (필터링 최소화 - 일일 트렌드 그대로 가져오기)
                  if (keyword && 
                      keyword.length >= 2 && 
                      !keyword.includes('http') &&
                      !keyword.includes('google') &&
                      !keyword.includes('trends') &&
                      !/^[\d\s\-_]+$/.test(keyword)) {
                    tempKeywords.add(keyword);
                    console.log(`[GOOGLE-REALTIME] 대체 선택자에서 키워드 발견: ${keyword}`);
                  }
                }
                
                if (tempKeywords.size >= Math.min(limit, 10)) {
                  console.log(`[GOOGLE-REALTIME] 선택자 "${selector}"에서 ${tempKeywords.size}개 키워드 발견`);
                  break;
                }
              }
            }
            
            // 스크립트 태그에서 JSON 데이터 추출 시도
            if (tempKeywords.size < 5) {
              console.log('[GOOGLE-REALTIME] 스크립트 태그에서 JSON 데이터 추출 시도');
              const scriptCount = $('script').length;
              console.log(`[GOOGLE-REALTIME] 발견된 스크립트 태그: ${scriptCount}개`);
              
              $('script').each((_i, scriptEl) => {
                if (tempKeywords.size >= limit * 2) return;
                
                const scriptContent = $(scriptEl).html() || '';
                
                // JSON 데이터에서 키워드 추출 (더 많은 패턴)
                const jsonPatterns = [
                  /trendingSearches\s*[:=]\s*(\[.*?\])/s,
                  /trendingSearchesDays\s*[:=]\s*(\[.*?\])/s,
                  /"query"\s*:\s*"([^"]+)"/g,
                  /"keyword"\s*:\s*"([^"]+)"/g,
                  /"title"\s*:\s*"([^"]+)"/g,
                  /"topic"\s*:\s*"([^"]+)"/g,
                  /"searchTerm"\s*:\s*"([^"]+)"/g,
                  /"formattedValue"\s*:\s*"([^"]+)"/g
                ];
                
                for (const pattern of jsonPatterns) {
                  let match;
                  while ((match = pattern.exec(scriptContent)) !== null && tempKeywords.size < limit * 2) {
                    const keyword = (match[2] || match[1] || '').trim();
                    
                    // 기본적인 검증만 (필터링 최소화)
                    if (keyword && 
                        keyword.length >= 2 && 
                        !keyword.includes('http') &&
                        !keyword.includes('google') &&
                        !keyword.includes('trends') &&
                        !keyword.match(/^[\d\s\-_]+$/) &&
                        !keyword.match(/^[a-zA-Z\s]+$/)) {
                      tempKeywords.add(keyword);
                      console.log(`[GOOGLE-REALTIME] 스크립트에서 키워드 발견: ${keyword}`);
                    }
                  }
                }
              });
              
              console.log(`[GOOGLE-REALTIME] 스크립트 파싱 후 키워드 개수: ${tempKeywords.size}`);
            }
            
            
            if (tempKeywords.size > 0) {
              console.log(`[GOOGLE-REALTIME] 총 ${tempKeywords.size}개 키워드 발견`);
              
              // 최대 10개만 순서대로 가져오기
              Array.from(tempKeywords).slice(0, Math.min(limit, 10)).forEach((keyword, idx) => {
                keywords.push({
                  rank: idx + 1,
                  keyword: keyword,
                  source: 'google',
                  timestamp: new Date().toISOString()
                });
              });
              
              if (keywords.length >= Math.min(limit, 10)) {
                console.log(`[GOOGLE-REALTIME] ✅ 수집 완료: ${keywords.length}개 (일일 트렌드 순위대로)`);
                console.log(`[GOOGLE-REALTIME] 샘플:`, keywords.slice(0, 3).map(k => k.keyword));
                return keywords.slice(0, Math.min(limit, 10)); // 최대 10개 반환
              }
            }
          }
        } catch (apiError: any) {
          console.error(`[GOOGLE-REALTIME] HTML 크롤링 에러:`, apiError.message);
        }
      }
      
      // 재시도
      if (keywords.length < Math.min(limit, 10) && attempt < MAX_RETRIES) {
        console.log(`[GOOGLE-REALTIME] ${RETRY_DELAY}ms 후 재시도...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }
      
    } catch (error: any) {
      console.error(`[GOOGLE-REALTIME] 시도 ${attempt} 실패:`, error.message);
      
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }
    }
  }
  
  console.warn('[GOOGLE-REALTIME] 모든 재시도 실패, 빈 배열 반환');
  return [];
}

// 광고성 키워드 필터 (블로그 글쓰기에 적합하지 않은 키워드)
const AD_KEYWORDS_FILTER = [
  // 의료/건강 광고
  '학원', '변호사', '보험', '병원', '클리닉', '이식', '대출', '창업',
  '사주', '운세', '라식', '라섹', '임플란트', '치과', '성형', '피부과',
  '법무', '법률', '세무', '회계', '정형외과', '한의원', '약국', '헬스장',
  'PT', '필라테스', '요가', '헬스', '다이어트약', '살빼는', '탈모치료',
  '비뇨기과', '산부인과', '내과', '외과', '안과', '이비인후과', '신경외과',
  '조루', '발기부전', '남성수술', '성기확대', '음경확대',
  '재활치료', '물리치료', '도수치료', '통증치료', '추나',
  // 금융/투자 광고
  '주식리딩', '코인', '투자', '재테크', '부업', '알바', '채용', '구인',
  '렌탈', '임대', '분양', '매매', '중개', '경매', '공인중개사',
  '개인회생', '파산', '채무조정', '빚청산',
  // 만남/성인 광고
  '결혼정보', '소개팅', '만남', '채팅', '애인', '미팅',
  '카지노', '토토', '배팅', '도박', '슬롯',
  // 서비스 광고
  '대리운전', '퀵서비스', '이사', '용달', '청소업체',
  '간판', '인테리어', '시공', '철거', '도배', '장판',
  // 교육 광고
  '국비지원', '무료교육', '자격증취득', '직업훈련', '취업지원',
  '컴퓨터활용', '정보처리', '워드프로세서', '자격증시험', '기사자격',
  '제과제빵', '기숙학원', '웹디자인', '네일아트',
  // 자동차 광고  
  '중고차', '시세표', '매입', '판매', '리스', '렌트',
  '자동차운전', '운전면허', '도로주행',
  // 기타 광고
  '쿠팡', '쇼핑', '할인', '이벤트', '프로모션', '세일',
  '전원주택', '성범죄', '노안',
  // UI 요소
  '이슈+', '뉴스', '더보기', '전체보기'
];

/**
 * 광고성 키워드인지 확인
 */
function isAdKeyword(keyword: string): boolean {
  const lowerKeyword = keyword.toLowerCase();
  return AD_KEYWORDS_FILTER.some(filter => lowerKeyword.includes(filter));
}

/**
 * 네이트 실시간 이슈 키워드 크롤링
 * 
 * 네이트 메인 페이지의 "실시간 이슈 키워드" 섹션을 정확하게 크롤링합니다.
 * 형식: "순위 키워드 변화상태 변화량"
 * 예: "1 인요한 의원직 사퇴 상승 2"
 */
export async function getNateRealtimeKeywords(limit: number = 20): Promise<RealtimeKeyword[]> {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000;
  
  /**
   * 네이트 키워드 텍스트 파싱
   * 예: "인요한 의원직 사퇴 상승 2" -> "인요한 의원직 사퇴"
   */
  const parseNateKeyword = (text: string): { keyword: string; change?: string } | null => {
    let keyword = text.trim()
      .replace(/^\d+\.?\s*/, '')  // 앞의 순위 숫자 제거
      .replace(/\s*(상승|하락|동일)\s*\d*\s*$/i, '')  // 뒤의 "상승 2", "하락 1" 등 제거
      .replace(/\s*(new|NEW|신규)\s*$/i, '')  // 뒤의 NEW 제거
      .replace(/▲|▼|↑|↓/g, '')  // 화살표 제거
      .replace(/\s+/g, ' ')
      .trim();
    
    if (!keyword || keyword.length < 2 || keyword.length > 50) {
      return null;
    }
    
    // UI 텍스트 필터링
    const uiPatterns = [
      /^더보기$/, /^전체보기$/, /^검색$/, /^로그인$/, /^회원가입$/,
      /^네이트$/, /^NATE$/, /^메일$/, /^판$/, /^뉴스$/, /^쇼핑$/, /^닫기$/,
      /바로가기/, /^네이트앱$/, /^AI챗/, /이슈키워드란/, /AI 이슈/
    ];
    
    if (uiPatterns.some(p => p.test(keyword))) {
      return null;
    }
    
    // 광고성 키워드 필터링
    if (isAdKeyword(keyword)) {
      return null;
    }
    
    // 변화 상태 추출
    let change: string | undefined;
    if (/상승/.test(text)) change = 'up';
    else if (/하락/.test(text)) change = 'down';
    else if (/new|NEW|신규/.test(text)) change = 'new';
    else if (/동일/.test(text)) change = 'stable';
    
    return { keyword, change };
  };
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[NATE-REALTIME] ========== 네이트 실시간 이슈 크롤링 시작 (시도 ${attempt}/${MAX_RETRIES}) ==========`);
      
      // 네이트 메인 페이지 요청
      const response = await axios.get('https://www.nate.com/', {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          'Referer': 'https://www.nate.com/',
          'Cache-Control': 'no-cache',
        },
      });
      
      const html = response.data;
      const $ = cheerio.load(html);
      
      console.log(`[NATE-REALTIME] HTML 수신: ${html.length} bytes`);
      
      const keywords: RealtimeKeyword[] = [];
      const seenKeywords = new Set<string>();
      
      // 🎯 핵심: "실시간 이슈 키워드" 섹션 찾기
      let foundSection = false;
      
      // 방법 1: 제목 텍스트로 섹션 찾기
      $('h1, h2, h3, h4, h5, h6, strong, b, span, div').each((_, el) => {
        if (foundSection && keywords.length >= limit) return false;
        
        const $el = $(el);
        const headingText = $el.text().trim();
        
        // "실시간 이슈 키워드" 또는 "실시간 이슈" 제목 찾기
        if (headingText === '실시간 이슈 키워드' || headingText === '실시간 이슈') {
          console.log(`[NATE-REALTIME] ✅ 섹션 발견: "${headingText}"`);
          foundSection = true;
          
          // 부모 또는 형제에서 리스트 찾기
          const $parent = $el.parent();
          let $list = $parent.find('ol, ul').first();
          
          // 형제 요소에서 찾기
          if ($list.length === 0) $list = $el.next('ol, ul');
          if ($list.length === 0) $list = $el.siblings('ol, ul').first();
          if ($list.length === 0) $list = $parent.parent().find('ol, ul').first();
          
          if ($list.length > 0) {
            console.log(`[NATE-REALTIME] 리스트 발견: ${$list.find('li').length}개 항목`);
            
            $list.find('li').each((index, liEl) => {
              if (keywords.length >= limit) return false;
              
              const $li = $(liEl);
              const linkText = $li.find('a').first().text().trim();
              const fullText = $li.text().trim();
              const textToParse = linkText || fullText;
              
              const parsed = parseNateKeyword(textToParse);
              
              if (parsed && !seenKeywords.has(parsed.keyword.toLowerCase())) {
                seenKeywords.add(parsed.keyword.toLowerCase());
                
                keywords.push({
                  rank: index + 1,
                  keyword: parsed.keyword,
                  change: parsed.change as RealtimeKeyword['change'],
                  source: 'nate',
                  timestamp: new Date().toISOString(),
                });
                
                console.log(`[NATE-REALTIME] ✅ ${index + 1}. ${parsed.keyword}`);
              }
            });
          }
        }
      });
      
      // 방법 2: 클래스/ID로 섹션 찾기 (백업)
      if (keywords.length < 3) {
        console.log('[NATE-REALTIME] 방법 2: 클래스/ID로 검색...');
        
        const selectors = [
          '[class*="issue_keyword"] li',
          '[class*="realtime"] li',
          '[id*="realtime"] li',
          '[class*="ai_issue"] li',
          '#olLiveIssueKeyword li',
          'ol.isKeywordList li',
        ];
        
        for (const selector of selectors) {
          $(selector).each((index, liEl) => {
            if (keywords.length >= limit) return false;
            
            const $li = $(liEl);
            const linkText = $li.find('a').first().text().trim();
            const fullText = $li.text().trim();
            const textToParse = linkText || fullText;
            
            const parsed = parseNateKeyword(textToParse);
            
            if (parsed && !seenKeywords.has(parsed.keyword.toLowerCase())) {
              seenKeywords.add(parsed.keyword.toLowerCase());
              
              keywords.push({
                rank: keywords.length + 1,
                keyword: parsed.keyword,
                change: parsed.change as RealtimeKeyword['change'],
                source: 'nate',
                timestamp: new Date().toISOString(),
              });
              
              console.log(`[NATE-REALTIME] ${keywords.length}. ${parsed.keyword}`);
            }
          });
          
          if (keywords.length >= limit) break;
        }
      }
      
      console.log(`[NATE-REALTIME] 총 ${keywords.length}개 키워드 수집`);
      
      // 키워드 수집 성공 시 반환
      if (keywords.length >= 3) {
        console.log(`[NATE-REALTIME] ✅ 네이트 실시간 이슈 ${keywords.length}개 수집 완료`);
        return keywords.slice(0, limit);
      }
      
      // 키워드가 부족하면 다음으로 폴백
      if (keywords.length < 3 && attempt === MAX_RETRIES) {
        console.log(`[NATE-REALTIME] ⚠️ 키워드 부족, 다음 이슈로 폴백...`);
        try {
          const daumKeywords = await getDaumRealtimeKeywords(limit);
          if (daumKeywords.length > 0) {
            console.log(`[NATE-REALTIME] ✅ 다음에서 ${daumKeywords.length}개 키워드로 대체`);
            return daumKeywords.map((kw, idx) => ({
              ...kw,
              rank: idx + 1,
              source: 'nate' as const
            }));
          }
        } catch (e) {
          console.error('[NATE-REALTIME] 다음 폴백 실패');
        }
      }
      
      // 수집된 것이라도 반환
      if (keywords.length > 0) {
        return keywords.slice(0, limit);
      }
      
      // 재시도
      if (attempt < MAX_RETRIES) {
        console.warn(`[NATE-REALTIME] ⚠️ 키워드 부족, ${RETRY_DELAY}ms 후 재시도...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        continue;
      }
      
      return [];
      
    } catch (error: any) {
      console.error(`[NATE-REALTIME] 시도 ${attempt}/${MAX_RETRIES} 실패:`, error?.message);
      
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        continue;
      }
    }
  }
  
  console.warn('[NATE-REALTIME] 모든 재시도 실패, 빈 배열 반환');
  return [];
}

/**
 * 다음 실시간 검색어 크롤링
 */
export async function getDaumRealtimeKeywords(limit: number = 20): Promise<RealtimeKeyword[]> {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[DAUM-REALTIME] ========== 다음 실시간 검색어 수집 시작 (시도 ${attempt}/${MAX_RETRIES}) ==========`);
      const keywords: RealtimeKeyword[] = [];
      
      // 방법 1: 다음 실시간 검색어 API
      const apiUrls = [
        'https://m.daum.net/api/realtime/keyword',
        'https://www.daum.net/api/realtime/keyword',
      ];
      
      console.log('[DAUM-REALTIME] 방법 1: API 직접 호출');
      for (const apiUrl of apiUrls) {
        try {
          console.log(`[DAUM-REALTIME] API 호출: ${apiUrl}`);
          const apiResponse = await axios.get(apiUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json, */*',
              'Accept-Language': 'ko-KR,ko;q=0.9',
              'Referer': 'https://www.daum.net/'
            },
            timeout: 10000,
            validateStatus: (status) => status < 500
          });
        
          console.log(`[DAUM-REALTIME] 응답: ${apiUrl}, 상태: ${apiResponse.status}`);
          
          if (apiResponse.data) {
            const data = apiResponse.data;
            console.log(`[DAUM-REALTIME] 응답 키:`, Object.keys(data));
            
            const keywordList = data.data || 
                               data.keywords || 
                               data.items || 
                               data.list ||
                               (Array.isArray(data) ? data : []);
            
            console.log(`[DAUM-REALTIME] 키워드 개수: ${Array.isArray(keywordList) ? keywordList.length : 0}`);
            
            if (Array.isArray(keywordList) && keywordList.length > 0) {
              keywordList.slice(0, limit).forEach((item: any, idx: number) => {
                // title은 제목이므로 제외하고, keyword/word/text/query만 사용
                const keyword = item.keyword || 
                               item.word || 
                               item.text || 
                               item.query;
                
                // title 필드가 있으면 무시 (제목이 키워드로 들어가는 것 방지)
                // String(item)으로 변환하는 것도 제거 (제목이 문자열로 변환될 수 있음)
                if (!keyword && item.title) {
                  return; // title만 있으면 스킵
                }
                
                if (keyword && typeof keyword === 'string' && keyword.trim().length >= 2) {
                  const trimmedKeyword = keyword.trim();
                  // 제목처럼 보이는 긴 텍스트 필터링 (50자 이상이고 공백이 많으면 제목일 가능성)
                  if (trimmedKeyword.length > 50 && trimmedKeyword.split(/\s+/).length > 8) {
                    console.log(`[DAUM-REALTIME] 제목처럼 보이는 텍스트 제외: ${trimmedKeyword.substring(0, 30)}...`);
                    return;
                  }
                  
                  keywords.push({
                    rank: idx + 1,
                    keyword: trimmedKeyword,
                    source: 'daum',
                    timestamp: new Date().toISOString()
                  });
                }
              });
              
              if (keywords.length >= 5) {
                console.log(`[DAUM-REALTIME] ✅ API 성공: ${keywords.length}개`);
                console.log(`[DAUM-REALTIME] 샘플:`, keywords.slice(0, 3).map(k => k.keyword));
                return keywords.slice(0, limit);
              }
            }
          }
        } catch (apiError: any) {
          console.warn(`[DAUM-REALTIME] API 실패 (${apiUrl}):`, apiError.message);
        }
      }
      
      // 방법 2: HTML 페이지에서 추출 (정규식 기반)
      if (keywords.length === 0) {
        console.log('[DAUM-REALTIME] 방법 2: HTML 페이지 파싱 (정규식 기반)');
        
        try {
          const response = await axios.get('https://www.daum.net/', {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'ko-KR,ko;q=0.9',
              'Accept-Encoding': 'gzip, deflate, br',
              'Connection': 'keep-alive'
            },
            timeout: 10000
          });
          
          const html = response.data;
          console.log(`[DAUM-REALTIME] HTML 받음: ${html.length} bytes`);
          
          // 방법 2-1: list_briefing_wrap (브리핑 영역) - 우선순위 1
          console.log('[DAUM-REALTIME] 방법 2-1: list_briefing 영역 검색');
          const briefingMatch = html.match(/<div[^>]*class="list_briefing_wrap"[^>]*>([\s\S]*?)<\/div>/i);
          
          if (briefingMatch) {
            console.log('[DAUM-REALTIME] list_briefing 영역 발견');
            const pattern = /<em[^>]*class="txt_briefing"[^>]*>([^<]+)<\/em>/gi;
            let match;
            let rank = 1;
            
            while ((match = pattern.exec(briefingMatch[1])) !== null && rank <= limit) {
              const keyword = match[1]?.trim();
              if (keyword && keyword.length >= 2 && keyword.length < 100) {
                keywords.push({
                  rank: rank,
                  keyword: keyword,
                  source: 'daum',
                  timestamp: new Date().toISOString()
                });
                console.log(`[DAUM-REALTIME] 발견: ${rank}위 - ${keyword}`);
                rank++;
              }
            }
          }
          
          // 방법 2-2: list_trend_wrap (트렌드 영역) - 방법 2-1 실패 시
          if (keywords.length === 0) {
            console.log('[DAUM-REALTIME] 방법 2-2: list_trend 영역 검색');
            const trendMatch = html.match(/<div[^>]*class="list_trend_wrap"[^>]*>([\s\S]*?)<\/div>/i);
            
            if (trendMatch) {
              console.log('[DAUM-REALTIME] list_trend 영역 발견');
              const pattern = /<strong[^>]*class="txt_keyword[^"]*"[^>]*>([^<]+)<\/strong>/gi;
              let match;
              const uniqueKeywords = new Set<string>();
              
              while ((match = pattern.exec(trendMatch[1])) !== null) {
                const keyword = match[1]?.trim();
                
                // 중복 제거 (같은 키워드가 여러 번 나타남)
                if (keyword && 
                    keyword.length >= 2 && 
                    keyword.length < 100 &&
                    !uniqueKeywords.has(keyword)) {
                  
                  uniqueKeywords.add(keyword);
                  const rank = uniqueKeywords.size;
                  
                  keywords.push({
                    rank: rank,
                    keyword: keyword,
                    source: 'daum',
                    timestamp: new Date().toISOString()
                  });
                  
                  console.log(`[DAUM-REALTIME] 발견: ${rank}위 - ${keyword}`);
                  
                  if (uniqueKeywords.size >= limit) {
                    break;
                  }
                }
              }
            }
          }
          
          // 방법 2-3: Cheerio를 사용한 DOM 파싱 (폴백)
          if (keywords.length === 0) {
            console.log('[DAUM-REALTIME] 방법 2-3: Cheerio DOM 파싱 (폴백)');
            const $ = cheerio.load(html);
            const tempKeywords = new Set<string>();
          
          // 방법 2-1: DOM 선택자로 실시간 검색어 찾기 (더 많은 선택자 추가)
          const selectors = [
            '.link_issue',
            '.issue_keyword a',
            '.rank_list a',
            '.keyword_list a',
            '.realtime_keyword a',
            'li[class*="rank"] a',
            'li[class*="keyword"] a',
            'li[class*="issue"] a',
            'li[class*="realtime"] a',
            '[class*="realtime"] a',
            '[class*="issue"] a',
            '[class*="keyword"] a',
            '[data-keyword]',
            'a[href*="/search?q="]',
            'a[href*="/search?query="]',
            'a[href*="/search?keyword="]',
            'ol li a[href*="search"]',
            'ul li a[href*="search"]',
            '[id*="rank"] li a',
            '[id*="keyword"] li a',
            '[id*="issue"] li a'
          ];
          
          for (const selector of selectors) {
            if (tempKeywords.size >= limit) break;
            
            const elements = $(selector);
            console.log(`[DAUM-REALTIME] 선택자 "${selector}": ${elements.length}개 발견`);
            
            for (let idx = 0; idx < elements.length && tempKeywords.size < limit * 2; idx++) {
              const el = elements.eq(idx);
              let keyword = el.text().trim();
              
              // data-keyword 속성에서 추출
              if (!keyword) {
                keyword = el.attr('data-keyword') || '';
              }
              
              // href에서 키워드 추출
              const href = el.attr('href') || '';
              if (href) {
                const hrefMatch = href.match(/[?&]q=([^&]+)/);
                if (hrefMatch && hrefMatch[1]) {
                  try {
                    keyword = decodeURIComponent(hrefMatch[1]).trim();
                  } catch (e) {
                    // 디코딩 실패 무시
                  }
                }
              }
              
              // 키워드 정제
              keyword = keyword.replace(/^\d+\.?\s*/, '').replace(/^\d+위\s*/, '').trim();
              
              // 제목처럼 보이는 긴 텍스트 필터링
              const wordCount = keyword.split(/\s+/).length;
              const isLikelyTitle = keyword.length > 50 && wordCount > 8;
              
              // 제목 관련 속성 제외
              const isTitleAttribute = el.attr('title') && el.attr('title') === keyword;
              const isNewsTitle = el.closest('[class*="news"], [class*="article"], [class*="title"]').length > 0;
              
              if (keyword && 
                  keyword.length >= 2 && 
                  keyword.length < 50 &&
                  !isLikelyTitle &&
                  !isTitleAttribute &&
                  !isNewsTitle &&
                  !keyword.includes('http') &&
                  !keyword.includes('://') &&
                  !keyword.includes('더보기') &&
                  !keyword.includes('전체보기') &&
                  !keyword.includes('검색') &&
                  !keyword.match(/^(제목|내용|링크|URL|이미지|사진|영상|동영상|비디오)$/i) &&
                  !/^[\d\s\-_]+$/.test(keyword)) {
                tempKeywords.add(keyword);
                console.log(`[DAUM-REALTIME] HTML에서 키워드 발견: ${keyword}`);
              }
            }
            
            if (tempKeywords.size >= 5) {
              console.log(`[DAUM-REALTIME] 선택자 "${selector}"에서 ${tempKeywords.size}개 키워드 발견`);
              break;
            }
          }
          
          // 방법 2-2: 스크립트 태그에서 JSON 데이터 추출
          if (tempKeywords.size < 5) {
            $('script').each((_i, scriptEl) => {
              if (tempKeywords.size >= limit) return;
              
              const scriptContent = $(scriptEl).html() || '';
              
              // TIARA 데이터 패턴
              const patterns = [
                /TIARA[\s\S]*?keyword["']\s*:\s*["']([^"']+)["']/gi,
                /"keyword"\s*:\s*"([^"]+)"/g,
                /"query"\s*:\s*"([^"]+)"/g,
                /data-keyword=["']([^"']+)["']/gi
              ];
              
              for (const pattern of patterns) {
                let match;
                while ((match = pattern.exec(scriptContent)) !== null && tempKeywords.size < limit * 2) {
                  const keyword = (match[1] || '').trim();
                  if (keyword && 
                      keyword.length >= 2 && 
                      keyword.length < 50 &&
                      !keyword.includes('http') &&
                      !keyword.includes('더보기') &&
                      !keyword.includes('전체보기')) {
                    tempKeywords.add(keyword);
                  }
                }
              }
            });
          }
          
            if (tempKeywords.size > 0) {
              console.log(`[DAUM-REALTIME] 총 ${tempKeywords.size}개 키워드 발견`);
              
              Array.from(tempKeywords).slice(0, limit).forEach((keyword, idx) => {
                keywords.push({
                  rank: idx + 1,
                  keyword: keyword,
                  source: 'daum',
                  timestamp: new Date().toISOString()
                });
              });
            }
          }
          
        } catch (htmlError: any) {
          console.error(`[DAUM-REALTIME] HTML 파싱 실패:`, htmlError.message);
        }
      }
      
      // 키워드 수집 성공 시 반환
      if (keywords.length >= 5) {
        console.log(`[DAUM-REALTIME] ✅ 수집 완료: ${keywords.length}개`);
        return keywords.slice(0, limit);
      }
      
      // 재시도
      if (attempt < MAX_RETRIES) {
        console.log(`[DAUM-REALTIME] ${RETRY_DELAY}ms 후 재시도...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }
      
    } catch (error: any) {
      console.error(`[DAUM-REALTIME] 시도 ${attempt} 실패:`, error.message);
      
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }
    }
  }
  
  console.warn('[DAUM-REALTIME] 모든 재시도 실패, 빈 배열 반환');
  return [];
}

/**
 * 네이버 실시간 검색어 (Signal.bz 사용)
 * signal.bz는 네이버 검색 트렌드 기반 실시간 검색어를 제공
 */
export async function getNaverRealtimeKeywords(limit: number = 10): Promise<RealtimeKeyword[]> {
  console.log('[NAVER-REALTIME] ========== 네이버 실시간 검색어 (Signal.bz) ==========');
  
  try {
    // Signal.bz에서 네이버 실시간 검색어 가져오기
    const { getSignalBzKeywords } = await import('./signal-bz-crawler');
    const signalKeywords = await getSignalBzKeywords(limit);
    
    if (signalKeywords.length > 0) {
      console.log(`[NAVER-REALTIME] ✅ Signal.bz에서 ${signalKeywords.length}개 키워드 수집`);
      return signalKeywords.map((kw, idx) => ({
        keyword: kw.keyword,
        rank: idx + 1,
        source: 'naver' as const,
        timestamp: new Date().toISOString(),
        change: kw.status === 'up' ? 'up' : kw.status === 'down' ? 'down' : kw.status === 'new' ? 'new' : 'stable'
      }));
    }
  } catch (error: any) {
    console.error('[NAVER-REALTIME] Signal.bz 크롤링 실패:', error.message);
  }
  
  // Signal.bz 실패 시 다음으로 폴백
  console.log('[NAVER-REALTIME] 다음 이슈 키워드로 대체 시도...');
  try {
    const daumKeywords = await getDaumRealtimeKeywords(limit);
    
    if (daumKeywords.length > 0) {
      console.log(`[NAVER-REALTIME] ✅ 다음 이슈 키워드 ${daumKeywords.length}개를 네이버 대체로 사용`);
      return daumKeywords.map((kw, idx) => ({
        ...kw,
        rank: idx + 1,
        source: 'naver' as const
      }));
    }
  } catch (error: any) {
    console.error('[NAVER-REALTIME] 다음 대체 실패:', error.message);
  }
  
  // 다음도 실패하면 네이트로 시도
  console.log('[NAVER-REALTIME] 네이트 실시간 검색어로 대체 시도...');
  try {
    const nateKeywords = await getNateRealtimeKeywords(limit);
    
    if (nateKeywords.length > 0) {
      // 광고성 키워드 필터링
      const filteredKeywords = nateKeywords.filter(kw => {
        const lowerKeyword = kw.keyword.toLowerCase();
        return !lowerKeyword.includes('보험') &&
               !lowerKeyword.includes('대출') &&
               !lowerKeyword.includes('변호사') &&
               !lowerKeyword.includes('창업') &&
               !lowerKeyword.includes('학원') &&
               !lowerKeyword.includes('병원') &&
               !lowerKeyword.includes('사주') &&
               !lowerKeyword.includes('라식') &&
               kw.keyword.length < 30;
      });
      
      if (filteredKeywords.length > 0) {
        console.log(`[NAVER-REALTIME] ✅ 네이트 실시간 검색어 ${filteredKeywords.length}개를 네이버 대체로 사용`);
        return filteredKeywords.slice(0, limit).map((kw, idx) => ({
          ...kw,
          rank: idx + 1,
          source: 'naver' as const
        }));
      }
    }
  } catch (error: any) {
    console.error('[NAVER-REALTIME] 네이트 대체 실패:', error.message);
  }
  
  console.log('[NAVER-REALTIME] 모든 대체 소스 실패, 빈 배열 반환');
  return [];
}

/**
 * 대한민국 정책브리핑 인기검색어
 * 정부 정책 관련 실시간 인기 검색어 추출
 */
export async function getBokjiroRealtimeKeywords(limit: number = 20): Promise<RealtimeKeyword[]> {
  try {
    console.log('[POLICY-BRIEFING] ========== 대한민국 정책브리핑 인기검색어 수집 시작 ==========');
    
    // 정책브리핑 API 호출
    const { getPolicyBriefingKeywords } = await import('./policy-briefing-api');
    const policyKeywords = await getPolicyBriefingKeywords(limit);
    
    if (policyKeywords && policyKeywords.length > 0) {
      const keywords: RealtimeKeyword[] = policyKeywords.map((kw, idx) => ({
        rank: idx + 1,
        keyword: kw.keyword,
        source: 'bokjiro' as const, // 호환성 유지
              timestamp: new Date().toISOString()
      }));
      
      console.log(`[POLICY-BRIEFING] ✅ 수집 완료: ${keywords.length}개`);
      keywords.forEach((kw, i) => console.log(`  ${i + 1}. ${kw.keyword}`));
      return keywords;
    }
  } catch (error: any) {
    console.error('[POLICY-BRIEFING] 크롤링 실패:', error.message);
  }
  
  // 실패 시 ZUM 데이터 대체
  console.log('[POLICY-BRIEFING] ZUM 데이터로 대체');
  try {
    const zumKeywords = await getZumRealtimeKeywords(limit);
    if (zumKeywords && zumKeywords.length > 0) {
      return zumKeywords.map((kw, idx) => ({
        ...kw,
        source: 'bokjiro' as const,
        rank: idx + 1
      }));
    }
  } catch (e) {
    console.error('[POLICY-BRIEFING] ZUM 대체 실패');
  }
  
  return [];

}

/**
 * 모든 플랫폼의 실시간 검색어 통합 조회
 */
export async function getAllRealtimeKeywords(limitPerPlatform: number = 10): Promise<{
  zum: RealtimeKeyword[];
  google: RealtimeKeyword[];
  nate: RealtimeKeyword[];
  daum: RealtimeKeyword[];
  naver: RealtimeKeyword[];
  bokjiro: RealtimeKeyword[];
  timestamp: string;
}> {
  if (cachedAllRealtime && Date.now() - cachedAllRealtimeAt < ALL_REALTIME_CACHE_TTL_MS) {
    return cachedAllRealtime;
  }

  try {
    const [zum, google, nate, daum, naver, bokjiro] = await Promise.allSettled([
      getZumRealtimeKeywords(limitPerPlatform).catch(() => [] as RealtimeKeyword[]),
      getGoogleRealtimeKeywords(limitPerPlatform).catch(() => [] as RealtimeKeyword[]),
      getNateRealtimeKeywords(limitPerPlatform).catch(() => [] as RealtimeKeyword[]),
      getDaumRealtimeKeywords(limitPerPlatform).catch(() => [] as RealtimeKeyword[]),
      getNaverRealtimeKeywords(limitPerPlatform).catch(() => [] as RealtimeKeyword[]),
      getBokjiroRealtimeKeywords(limitPerPlatform).catch(() => [] as RealtimeKeyword[])
    ]);

    const result = {
      zum: (zum.status === 'fulfilled' ? zum.value : []) as RealtimeKeyword[],
      google: (google.status === 'fulfilled' ? google.value : []) as RealtimeKeyword[],
      nate: (nate.status === 'fulfilled' ? nate.value : []) as RealtimeKeyword[],
      daum: (daum.status === 'fulfilled' ? daum.value : []) as RealtimeKeyword[],
      naver: (naver.status === 'fulfilled' ? naver.value : []) as RealtimeKeyword[],
      bokjiro: (bokjiro.status === 'fulfilled' ? bokjiro.value : []) as RealtimeKeyword[],
      timestamp: new Date().toISOString()
    };

    cachedAllRealtime = result;
    cachedAllRealtimeAt = Date.now();

    return result;
  } catch {
    // 에러가 발생해도 빈 배열 반환 (부분 실패 허용, 로그 제거)
    const result = {
      zum: [] as RealtimeKeyword[],
      google: [] as RealtimeKeyword[],
      nate: [] as RealtimeKeyword[],
      daum: [] as RealtimeKeyword[],
      naver: [] as RealtimeKeyword[],
      bokjiro: [] as RealtimeKeyword[],
      timestamp: new Date().toISOString()
    };

    cachedAllRealtime = result;
    cachedAllRealtimeAt = Date.now();

    return result;
  }
}