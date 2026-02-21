/**
 * 네이버 블로그 분석 시스템
 * 키워드 입력 → 검색결과/블로그지수/작성일 분석
 */

export interface NaverApiConfig {
  clientId: string;
  clientSecret: string;
}

export interface BlogSearchResult {
  title: string;
  link: string;
  description: string;
  bloggername: string;
  bloggerlink: string;
  postdate: string; // YYYYMMDD 형식
}

export interface BlogStats {
  visitors?: number;          // 일일 방문자 수
  totalVisitors?: number;     // 누적 방문자 수
  blogIndex?: number;         // 블로그 지수
  totalPosts?: number;        // 총 포스트 수
  follower?: number;          // 이웃/구독자 수
}

export interface AnalyzedBlog {
  // 기본 정보
  title: string;
  link: string;
  description: string;
  blogger: {
    name: string;
    link: string;
  };
  
  // 날짜 정보
  postDate: Date;
  postDateFormatted: string;     // "2024년 11월 14일"
  timeAgo: string;               // "3시간 전" / "2일 전"
  daysAgo: number;               // 숫자로 몇 일 전인지
  hoursAgo: number;              // 시간으로 몇 시간 전인지
  
  // 통계 정보
  stats: BlogStats | null;
  statsCollected: boolean;       // 통계 수집 성공 여부
  
  // 순위
  rank: number;
}

export interface BlogAnalysisResult {
  keyword: string;
  totalResults: number;
  analyzedBlogs: AnalyzedBlog[];
  searchTime: number;            // 분석 소요 시간 (ms)
  timestamp: Date;
  statsSuccessRate: number;      // 통계 수집 성공률 (%)
}

/**
 * 네이버 블로그 검색 API 클라이언트
 */
export class NaverBlogSearchAPI {
  private config: NaverApiConfig;
  
  constructor(config: NaverApiConfig) {
    this.config = config;
  }
  
  /**
   * 네이버 블로그 검색
   */
  async searchBlogs(keyword: string, display: number = 100): Promise<{
    lastBuildDate: string;
    total: number;
    start: number;
    display: number;
    items: BlogSearchResult[];
  }> {
    const url = 'https://openapi.naver.com/v1/search/blog.json';
    
    try {
      const params = new URLSearchParams({
        query: keyword,
        display: String(Math.min(display, 100)), // 최대 100개
        sort: 'sim', // sim(정확도순) 또는 date(날짜순)
      });

      const response = await fetch(`${url}?${params}`, {
        headers: {
          'X-Naver-Client-Id': this.config.clientId,
          'X-Naver-Client-Secret': this.config.clientSecret,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error: any) {
      console.error('[NAVER-BLOG-ANALYZER] API 호출 실패:', error);
      throw new Error('네이버 블로그 검색 실패');
    }
  }
}

/**
 * 날짜 처리 유틸리티
 */
export class DateProcessor {
  /**
   * YYYYMMDD 형식을 Date 객체로 변환
   */
  parseNaverDate(dateString: string): Date {
    const year = parseInt(dateString.substring(0, 4));
    const month = parseInt(dateString.substring(4, 6)) - 1;
    const day = parseInt(dateString.substring(6, 8));
    
    return new Date(year, month, day);
  }
  
  /**
   * 날짜를 "2024년 11월 14일" 형식으로 포맷
   */
  formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    
    return `${year}년 ${month.toString().padStart(2, '0')}월 ${day.toString().padStart(2, '0')}일`;
  }
  
  /**
   * 현재 시간 기준으로 "3시간 전", "2일 전" 계산
   */
  getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);
    
    if (diffHours < 1) {
      return '방금 전';
    } else if (diffHours < 24) {
      return `${diffHours}시간 전`;
    } else if (diffDays < 30) {
      return `${diffDays}일 전`;
    } else if (diffMonths < 12) {
      return `${diffMonths}개월 전`;
    } else {
      return `${diffYears}년 전`;
    }
  }
  
  /**
   * 며칠 전인지 숫자로 반환
   */
  getDaysAgo(date: Date): number {
    const now = new Date();
    const diffTime = now.getTime() - date.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }
  
  /**
   * 몇 시간 전인지 숫자로 반환
   */
  getHoursAgo(date: Date): number {
    const now = new Date();
    const diffTime = now.getTime() - date.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60));
  }
}

/**
 * 블로그 통계 크롤러 (간단 버전 - API 우선 사용)
 * 🚀 혁신적인 방법 통합: Puppeteer + RSS + 다중 소스 융합
 */
export class BlogStatsCrawler {
  /**
   * 블로그 통계 정보 크롤링 (개선된 방법 - 여러 엔드포인트 시도)
   * 🚀 새로운 방법: Puppeteer 동적 추출 + RSS 분석 + 다중 소스 융합
   * 실패해도 계속 진행
   */
  async fetchBlogStats(bloggerLink: string, searchRank?: number): Promise<BlogStats | null> {
    try {
      // 타임아웃 설정 (15초로 증가)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      try {
        // 실제 브라우저처럼 보이는 헤더 설정
        const headers: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Referer': 'https://www.naver.com/',
          'DNT': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1',
        };

        // 방법 1: 메인 블로그 페이지에서 추출
        let response = await fetch(bloggerLink, {
          signal: controller.signal,
          headers: headers,
          redirect: 'follow',
        } as any);

        clearTimeout(timeoutId);

        if (response.ok) {
          const html = await response.text();
          
          // 디버깅: HTML 샘플 확인 (처음 10000자만, 블로그 지수 관련 부분만)
          const blogIndexSnippet = html.match(/[\s\S]{0,200}blogIndex[\s\S]{0,200}|[\s\S]{0,200}블로그지수[\s\S]{0,200}/i);
          if (blogIndexSnippet) {
            console.log(`[NAVER-BLOG-ANALYZER] 블로그 지수 관련 HTML 스니펫:`, blogIndexSnippet[0]);
          }
          
          // HTML에서 블로그 지수 추출 시도 (개선된 방법)
          const stats = this.extractStatsFromHTML(html);
          
          if (stats && Object.keys(stats).length > 0) {
            console.log(`[NAVER-BLOG-ANALYZER] 통계 추출 성공:`, stats);
            return stats;
          } else {
            console.log(`[NAVER-BLOG-ANALYZER] 통계 추출 실패: HTML 구조 확인 필요`);
          }
        }

        // 방법 2: 블로그 ID 추출 후 API 엔드포인트 시도
        const blogIdMatch1 = bloggerLink.match(/blog\.naver\.com\/([^\/\?]+)/);
        if (blogIdMatch1 && blogIdMatch1[1]) {
          const blogId = blogIdMatch1[1];
          
          // 네이버 블로그 공개 API 엔드포인트 시도 (여러 패턴)
          const apiEndpoints = [
            `https://blog.naver.com/ProfileView.naver?blogId=${blogId}`,
            `https://blog.naver.com/${blogId}`,
            `https://section.blog.naver.com/BlogHome.naver?directoryNo=0&listType=2&blogId=${blogId}`,
          ];

          for (const endpoint of apiEndpoints) {
            try {
              const apiController = new AbortController();
              const apiTimeoutId = setTimeout(() => apiController.abort(), 10000);
              
              const apiResponse = await fetch(endpoint, {
                signal: apiController.signal,
                headers: headers,
                redirect: 'follow',
              } as any);
              
              clearTimeout(apiTimeoutId);
              
              if (apiResponse.ok) {
                const apiHtml = await apiResponse.text();
                const apiStats = this.extractStatsFromHTML(apiHtml);
                
                if (apiStats && Object.keys(apiStats).length > 0) {
                  return apiStats;
                }
              }
              
              // API 호출 간격 조절
              await new Promise(resolve => setTimeout(resolve, 500));
            } catch (e) {
              // 다음 엔드포인트 시도
              continue;
            }
          }
        }

        // 🚀 방법 3: 혁신적인 방법 시도 (Puppeteer + RSS + 융합)
        const blogIdMatch2 = bloggerLink.match(/blog\.naver\.com\/([^\/\?]+)/);
        if (blogIdMatch2 && blogIdMatch2[1]) {
          const blogId = blogIdMatch2[1];
          try {
            const { AdvancedBlogIndexExtractor } = await import('./blog-index-extractor-advanced');
            const advancedExtractor = new AdvancedBlogIndexExtractor();
            
            const advancedStats = await advancedExtractor.extractBlogIndex(
              blogId,
              searchRank || 999
            );
            
            if (advancedStats.blogIndex || advancedStats.estimatedIndex) {
              const result: BlogStats = {};
              
              if (advancedStats.blogIndex) {
                result.blogIndex = advancedStats.blogIndex;
                console.log(`[NAVER-BLOG-ANALYZER] 🚀 Puppeteer 추출 성공: ${result.blogIndex}`);
              } else if (advancedStats.estimatedIndex) {
                result.blogIndex = advancedStats.estimatedIndex;
                console.log(`[NAVER-BLOG-ANALYZER] 🚀 융합 추정 성공: ${result.blogIndex} (신뢰도: ${advancedStats.confidence}%)`);
              }
              
              if (advancedStats.metrics.puppeteerVisitors) {
                result.visitors = advancedStats.metrics.puppeteerVisitors;
              }
              if (advancedStats.metrics.puppeteerFollowers) {
                result.follower = advancedStats.metrics.puppeteerFollowers;
              }
              if (advancedStats.metrics.rssTotalPosts) {
                result.totalPosts = advancedStats.metrics.rssTotalPosts;
              }
              
              if (Object.keys(result).length > 0) {
                console.log(`[NAVER-BLOG-ANALYZER] ✅ 혁신적 방법으로 통계 추출 성공!`);
                return result;
              }
            }
          } catch (advancedError: any) {
            console.warn(`[NAVER-BLOG-ANALYZER] 혁신적 방법 실패 (계속 진행): ${advancedError.message || String(advancedError)}`);
            // 실패해도 계속 진행
          }
        }

        return null;
      } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          console.warn('[NAVER-BLOG-ANALYZER] 타임아웃 발생');
        } else if (error.message?.includes('403') || error.message?.includes('429')) {
          console.warn('[NAVER-BLOG-ANALYZER] 접근 제한 (403/429)');
        }
        return null;
      }
    } catch (error: any) {
      console.warn('[NAVER-BLOG-ANALYZER] 블로그 통계 크롤링 실패:', error?.message || String(error));
      return null;
    }
  }

  /**
   * HTML에서 통계 정보 추출 (개선된 방법)
   */
  private extractStatsFromHTML(html: string): BlogStats | null {
    try {
      const stats: BlogStats = {};

      // 방법 1: JSON 데이터에서 추출 (가장 안정적)
      const jsonData = this.extractJsonData(html);
      if (jsonData) {
        if (jsonData.blogIndex !== undefined) stats.blogIndex = jsonData.blogIndex;
        if (jsonData.visitors !== undefined) stats.visitors = jsonData.visitors;
        if (jsonData.totalVisitors !== undefined) stats.totalVisitors = jsonData.totalVisitors;
        if (jsonData.totalPosts !== undefined) stats.totalPosts = jsonData.totalPosts;
        if (jsonData.follower !== undefined) stats.follower = jsonData.follower;
        
        if (Object.keys(stats).length > 0) {
          return stats;
        }
      }

      // 방법 2: HTML 패턴 매칭 (다양한 패턴 시도)
      const patterns = this.extractFromPatterns(html);
      if (patterns) {
        if (patterns.blogIndex !== undefined) stats.blogIndex = patterns.blogIndex;
        if (patterns.visitors !== undefined) stats.visitors = patterns.visitors;
        if (patterns.totalVisitors !== undefined) stats.totalVisitors = patterns.totalVisitors;
        if (patterns.totalPosts !== undefined) stats.totalPosts = patterns.totalPosts;
        if (patterns.follower !== undefined) stats.follower = patterns.follower;
      }

      // 최소한 하나라도 추출되면 반환
      if (Object.keys(stats).length > 0) {
        return stats;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * HTML에서 JSON 데이터 추출 (네이버 블로그는 내부적으로 JSON 사용)
   */
  private extractJsonData(html: string): BlogStats | null {
    try {
      const stats: BlogStats = {};
      
      // 방법 0: 네이버 블로그 특정 데이터 구조 직접 추출 (우선순위 최상)
      // 네이버 블로그는 특정 패턴으로 데이터를 저장합니다
      const directPatterns = [
        // 블로그 지수 패턴 (다양한 형식)
        /blogIndex["\s:]*(\d+)/gi,
        /blog_index["\s:]*(\d+)/gi,
        /blogIndexValue["\s:]*(\d+)/gi,
        /data-blog-index=["']?(\d+)["']?/gi,
        /"index"\s*:\s*(\d{4,})/gi, // 4자리 이상 숫자 (블로그 지수는 보통 4자리 이상)
        
        // 방문자 패턴
        /dailyVisitors["\s:]*(\d+)/gi,
        /daily_visitors["\s:]*(\d+)/gi,
        /todayVisitors["\s:]*(\d+)/gi,
        
        // 누적 방문자
        /totalVisitors["\s:]*(\d+)/gi,
        /total_visitors["\s:]*(\d+)/gi,
        /cumulativeVisitors["\s:]*(\d+)/gi,
        
        // 총 포스트
        /postCount["\s:]*(\d+)/gi,
        /post_count["\s:]*(\d+)/gi,
        /totalPosts["\s:]*(\d+)/gi,
        /total_posts["\s:]*(\d+)/gi,
        
        // 이웃/구독자
        /neighborCount["\s:]*(\d+)/gi,
        /neighbor_count["\s:]*(\d+)/gi,
        /followerCount["\s:]*(\d+)/gi,
        /followers["\s:]*(\d+)/gi,
      ];

      const directFoundValues: Record<string, number[]> = {};
      
      for (const pattern of directPatterns) {
        const matches = Array.from(html.matchAll(pattern));
        for (const match of matches) {
          if (match[1]) {
            const value = parseInt(match[1], 10);
            if (value > 0) {
              let key = '';
              if (pattern.source.includes('blogIndex') || pattern.source.includes('blog_index') || (pattern.source.includes('"index"') && value >= 1000)) {
                key = 'blogIndex';
              } else if (pattern.source.includes('dailyVisitors') || pattern.source.includes('daily_visitors') || pattern.source.includes('todayVisitors')) {
                key = 'visitors';
              } else if (pattern.source.includes('totalVisitors') || pattern.source.includes('total_visitors') || pattern.source.includes('cumulativeVisitors')) {
                key = 'totalVisitors';
              } else if (pattern.source.includes('postCount') || pattern.source.includes('post_count') || pattern.source.includes('totalPosts') || pattern.source.includes('total_posts')) {
                key = 'totalPosts';
              } else if (pattern.source.includes('neighborCount') || pattern.source.includes('neighbor_count') || pattern.source.includes('followerCount') || pattern.source.includes('followers')) {
                key = 'follower';
              }
              
              if (key) {
                if (!directFoundValues[key]) {
                  directFoundValues[key] = [];
                }
                const arr = directFoundValues[key];
                if (arr) {
                  arr.push(value);
                }
              }
            }
          }
        }
      }

      // 가장 큰 값 선택 (여러 값이 있으면 가장 큰 값)
      if (directFoundValues['blogIndex'] && directFoundValues['blogIndex'].length > 0) {
        stats.blogIndex = Math.max(...directFoundValues['blogIndex']);
      }
      if (directFoundValues['visitors'] && directFoundValues['visitors'].length > 0) {
        stats.visitors = Math.max(...directFoundValues['visitors']);
      }
      if (directFoundValues['totalVisitors'] && directFoundValues['totalVisitors'].length > 0) {
        stats.totalVisitors = Math.max(...directFoundValues['totalVisitors']);
      }
      if (directFoundValues['totalPosts'] && directFoundValues['totalPosts'].length > 0) {
        stats.totalPosts = Math.max(...directFoundValues['totalPosts']);
      }
      if (directFoundValues['follower'] && directFoundValues['follower'].length > 0) {
        stats.follower = Math.max(...directFoundValues['follower']);
      }

      if (Object.keys(stats).length > 0) {
        console.log(`[NAVER-BLOG-ANALYZER] 직접 패턴으로 통계 추출 성공:`, stats);
        return stats;
      }
      
      // 방법 1: script 태그 내 JSON-LD 또는 구조화된 데이터 찾기
      const scriptTagMatches = html.matchAll(/<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi);
      for (const match of scriptTagMatches) {
        if (match[1]) {
          try {
            const jsonData = JSON.parse(match[1]);
            const extracted = this.extractFromJsonObject(jsonData);
            if (extracted) {
              Object.assign(stats, extracted);
            }
          } catch (e) {
            // JSON 파싱 실패 시 계속
          }
        }
      }

      // 방법 2: window 객체에 할당된 변수들 찾기 (더 유연한 정규식)
      const windowVarPatterns = [
        /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/,
        /window\.__NEXT_DATA__\s*=\s*({[\s\S]*?});/,
        /window\.__BLOG_DATA__\s*=\s*({[\s\S]*?});/,
        /window\.__BLOG_INFO__\s*=\s*({[\s\S]*?});/,
        /var\s+blogData\s*=\s*({[\s\S]*?});/,
        /var\s+blogInfo\s*=\s*({[\s\S]*?});/,
        /const\s+blogData\s*=\s*({[\s\S]*?});/,
        /const\s+blogInfo\s*=\s*({[\s\S]*?});/,
        /let\s+blogData\s*=\s*({[\s\S]*?});/,
        /let\s+blogInfo\s*=\s*({[\s\S]*?});/,
      ];

      for (const pattern of windowVarPatterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          try {
            // JSON이 완전하지 않을 수 있으므로 부분 파싱 시도
            const jsonStr = match[1].trim();
            // 중괄호가 닫히지 않은 경우 마지막 부분 제거 후 재시도
            let cleanJson = jsonStr;
            if (!this.isValidJson(jsonStr)) {
              // 중괄호 균형 맞추기
              const openBraces = (jsonStr.match(/{/g) || []).length;
              const closeBraces = (jsonStr.match(/}/g) || []).length;
              if (openBraces > closeBraces) {
                cleanJson = jsonStr + '}'.repeat(openBraces - closeBraces);
              }
            }
            
            try {
              const data = JSON.parse(cleanJson);
              const extracted = this.extractFromJsonObject(data);
              if (extracted) {
                Object.assign(stats, extracted);
              }
            } catch (e) {
              // 완전한 JSON이 아니면 부분 추출 시도
              const partialStats = this.extractPartialJson(cleanJson);
              if (partialStats) {
                Object.assign(stats, partialStats);
              }
            }
          } catch (e) {
            // 다음 패턴 시도
            continue;
          }
        }
      }

      // 방법 3: 네이버 블로그 특정 데이터 구조 찾기
      // 네이버 블로그는 특정 패턴을 사용함
      const naverPatterns = [
        /"blogIndex"\s*:\s*(\d+)/g,
        /"blog_index"\s*:\s*(\d+)/g,
        /"index"\s*:\s*(\d+)/g,
        /"dailyVisitors"\s*:\s*(\d+)/g,
        /"daily_visitors"\s*:\s*(\d+)/g,
        /"totalVisitors"\s*:\s*(\d+)/g,
        /"total_visitors"\s*:\s*(\d+)/g,
        /"postCount"\s*:\s*(\d+)/g,
        /"post_count"\s*:\s*(\d+)/g,
        /"neighborCount"\s*:\s*(\d+)/g,
        /"neighbor_count"\s*:\s*(\d+)/g,
      ];

      const foundValues: Record<string, number> = {};
      for (const pattern of naverPatterns) {
        const matches = html.matchAll(pattern);
        for (const match of matches) {
          if (match[1]) {
            const value = parseInt(match[1], 10);
            if (pattern.source.includes('blogIndex') || pattern.source.includes('blog_index') || pattern.source.includes('"index"')) {
              foundValues['blogIndex'] = Math.max(foundValues['blogIndex'] || 0, value);
            } else if (pattern.source.includes('dailyVisitors') || pattern.source.includes('daily_visitors')) {
              foundValues['visitors'] = Math.max(foundValues['visitors'] || 0, value);
            } else if (pattern.source.includes('totalVisitors') || pattern.source.includes('total_visitors')) {
              foundValues['totalVisitors'] = Math.max(foundValues['totalVisitors'] || 0, value);
            } else if (pattern.source.includes('postCount') || pattern.source.includes('post_count')) {
              foundValues['totalPosts'] = Math.max(foundValues['totalPosts'] || 0, value);
            } else if (pattern.source.includes('neighborCount') || pattern.source.includes('neighbor_count')) {
              foundValues['follower'] = Math.max(foundValues['follower'] || 0, value);
            }
          }
        }
      }

      if (foundValues['blogIndex']) stats.blogIndex = foundValues['blogIndex'];
      if (foundValues['visitors']) stats.visitors = foundValues['visitors'];
      if (foundValues['totalVisitors']) stats.totalVisitors = foundValues['totalVisitors'];
      if (foundValues['totalPosts']) stats.totalPosts = foundValues['totalPosts'];
      if (foundValues['follower']) stats.follower = foundValues['follower'];

      if (Object.keys(stats).length > 0) {
        return stats;
      }

      // 방법 4: script 태그 내 JSON 객체 패턴 찾기 (기존 방식 개선)

      return Object.keys(stats).length > 0 ? stats : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * JSON 객체에서 통계 정보 추출 (재귀적으로 탐색)
   */
  private extractFromJsonObject(obj: any, depth: number = 0): BlogStats | null {
    if (depth > 10) return null; // 무한 루프 방지
    if (!obj || typeof obj !== 'object') return null;

    const stats: BlogStats = {};

    // 직접 키 확인
    const keys = Object.keys(obj);
    for (const key of keys) {
      const lowerKey = key.toLowerCase();
      const value = obj[key];

      if (typeof value === 'number') {
        if (lowerKey.includes('blogindex') || lowerKey.includes('blog_index') || (lowerKey === 'index' && value > 100)) {
          stats.blogIndex = Math.max(stats.blogIndex || 0, value);
        } else if (lowerKey.includes('dailyvisitor') || (lowerKey.includes('visitor') && !lowerKey.includes('total'))) {
          stats.visitors = Math.max(stats.visitors || 0, value);
        } else if (lowerKey.includes('totalvisitor') || (lowerKey.includes('total') && lowerKey.includes('visitor'))) {
          stats.totalVisitors = Math.max(stats.totalVisitors || 0, value);
        } else if (lowerKey.includes('postcount') || lowerKey.includes('post_count') || (lowerKey.includes('post') && lowerKey.includes('count'))) {
          stats.totalPosts = Math.max(stats.totalPosts || 0, value);
        } else if (lowerKey.includes('neighborcount') || lowerKey.includes('neighbor_count') || lowerKey.includes('follower')) {
          stats.follower = Math.max(stats.follower || 0, value);
        }
      }
    }

    // 중첩 객체 재귀 탐색
    for (const key of keys) {
      const value = obj[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const nestedStats = this.extractFromJsonObject(value, depth + 1);
        if (nestedStats) {
          if (nestedStats.blogIndex) stats.blogIndex = Math.max(stats.blogIndex || 0, nestedStats.blogIndex);
          if (nestedStats.visitors) stats.visitors = Math.max(stats.visitors || 0, nestedStats.visitors);
          if (nestedStats.totalVisitors) stats.totalVisitors = Math.max(stats.totalVisitors || 0, nestedStats.totalVisitors);
          if (nestedStats.totalPosts) stats.totalPosts = Math.max(stats.totalPosts || 0, nestedStats.totalPosts);
          if (nestedStats.follower) stats.follower = Math.max(stats.follower || 0, nestedStats.follower);
        }
      }
    }

    return Object.keys(stats).length > 0 ? stats : null;
  }

  /**
   * 완전하지 않은 JSON 문자열에서 부분 추출
   */
  private extractPartialJson(jsonStr: string): BlogStats | null {
    const stats: BlogStats = {};
    const patterns = [
      { key: 'blogIndex', regex: /"blogIndex"\s*:\s*(\d+)/g },
      { key: 'blogIndex', regex: /"blog_index"\s*:\s*(\d+)/g },
      { key: 'blogIndex', regex: /"index"\s*:\s*(\d+)/g },
      { key: 'visitors', regex: /"dailyVisitors"\s*:\s*(\d+)/g },
      { key: 'visitors', regex: /"visitors"\s*:\s*(\d+)/g },
      { key: 'totalVisitors', regex: /"totalVisitors"\s*:\s*(\d+)/g },
      { key: 'totalPosts', regex: /"postCount"\s*:\s*(\d+)/g },
      { key: 'totalPosts', regex: /"totalPosts"\s*:\s*(\d+)/g },
      { key: 'follower', regex: /"neighborCount"\s*:\s*(\d+)/g },
      { key: 'follower', regex: /"follower"\s*:\s*(\d+)/g },
    ];

    for (const pattern of patterns) {
      const matches = jsonStr.matchAll(pattern.regex);
      for (const match of matches) {
        if (match[1]) {
          const value = parseInt(match[1], 10);
          if (value > 0) {
            const currentValue = (stats as any)[pattern.key] || 0;
            (stats as any)[pattern.key] = Math.max(currentValue, value);
          }
        }
      }
    }

    return Object.keys(stats).length > 0 ? stats : null;
  }

  /**
   * JSON 문자열 유효성 검사
   */
  private isValidJson(str: string): boolean {
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * HTML 패턴에서 통계 정보 추출 (다양한 패턴 시도)
   */
  private extractFromPatterns(html: string): BlogStats | null {
    try {
      const stats: BlogStats = {};

      // 숫자 추출 헬퍼
      const extractNumber = (match: RegExpMatchArray | null): number | undefined => {
        if (!match || !match[1]) return undefined;
        return parseInt(match[1].replace(/,/g, ''), 10);
      };

      // 다양한 패턴 시도
      const patterns = [
        // 블로그 지수 패턴
        { key: 'blogIndex', regex: /블로그지수[^\d]*(\d{1,3}(?:,\d{3})*)/i },
        { key: 'blogIndex', regex: /blogIndex["\s:]*(\d+)/i },
        { key: 'blogIndex', regex: /지수[^\d]*(\d{1,3}(?:,\d{3})*)/i },
        { key: 'blogIndex', regex: /data-index=["']?(\d+)["']?/i },
        
        // 방문자 패턴
        { key: 'visitors', regex: /일일\s*방문자[^\d]*(\d{1,3}(?:,\d{3})*)/i },
        { key: 'visitors', regex: /오늘\s*방문자[^\d]*(\d{1,3}(?:,\d{3})*)/i },
        { key: 'visitors', regex: /daily.*?visitor[^\d]*(\d+)/i },
        { key: 'visitors', regex: /"visitors"["\s:]*(\d+)/i },
        
        // 누적 방문자
        { key: 'totalVisitors', regex: /누적\s*방문자[^\d]*(\d{1,3}(?:,\d{3})*)/i },
        { key: 'totalVisitors', regex: /total.*?visitor[^\d]*(\d+)/i },
        { key: 'totalVisitors', regex: /"totalVisitors"["\s:]*(\d+)/i },
        
        // 총 포스트
        { key: 'totalPosts', regex: /총\s*글[^\d]*(\d{1,3}(?:,\d{3})*)/i },
        { key: 'totalPosts', regex: /총\s*포스트[^\d]*(\d{1,3}(?:,\d{3})*)/i },
        { key: 'totalPosts', regex: /post.*?count[^\d]*(\d+)/i },
        { key: 'totalPosts', regex: /"totalPosts"["\s:]*(\d+)/i },
        { key: 'totalPosts', regex: /"postCount"["\s:]*(\d+)/i },
        
        // 이웃/구독자
        { key: 'follower', regex: /이웃[^\d]*(\d{1,3}(?:,\d{3})*)/i },
        { key: 'follower', regex: /구독자[^\d]*(\d{1,3}(?:,\d{3})*)/i },
        { key: 'follower', regex: /follower[^\d]*(\d+)/i },
        { key: 'follower', regex: /neighbor[^\d]*(\d+)/i },
        { key: 'follower', regex: /"follower"["\s:]*(\d+)/i },
        { key: 'follower', regex: /"neighborCount"["\s:]*(\d+)/i },
      ];

      for (const pattern of patterns) {
        const match = html.match(pattern.regex);
        if (match) {
          const value = extractNumber(match);
          if (value !== undefined) {
            // 블로그 지수는 보통 4자리 이상이므로 필터링
            if (pattern.key === 'blogIndex' && value < 1000) {
              continue;
            }
            // 기존 값이 있으면 더 큰 값 선택
            const currentValue = (stats as any)[pattern.key];
            if (!currentValue || value > currentValue) {
              (stats as any)[pattern.key] = value;
            }
          }
        }
      }

      return Object.keys(stats).length > 0 ? stats : null;
    } catch (error) {
      return null;
    }
  }
}

/**
 * 작성일자 기반 빠른 분석 결과
 */
export interface FastDateAnalysisResult {
  keyword: string;
  totalResults: number;
  blogs: Array<{
    title: string;
    link: string;
    blogger: {
      name: string;
      link: string;
    };
    postDate: Date;
    postDateFormatted: string;
    daysAgo: number;
    hoursAgo: number;
    timeAgo: string;
    rank: number;
    // 작성일자 기반 분석 점수
    opportunityScore: number; // 0-100, 높을수록 작성 기회가 좋음
    opportunityReason: string; // 왜 좋은 기회인지 설명
  }>;
  analysisTime: number; // 분석 소요 시간 (ms)
  timestamp: Date;
  summary: {
    avgDaysAgo: number; // 평균 작성일
    oldestPostDays: number; // 가장 오래된 글 (일)
    newestPostDays: number; // 가장 최신 글 (일)
    opportunityCount: number; // 작성 기회가 좋은 글 수
  };
}

/**
 * 블로그 분석기 (메인 클래스)
 */
export class BlogAnalyzer {
  private searchApi: NaverBlogSearchAPI;
  private crawler: BlogStatsCrawler;
  private dateProcessor: DateProcessor;
  
  constructor(config: NaverApiConfig) {
    this.searchApi = new NaverBlogSearchAPI(config);
    this.crawler = new BlogStatsCrawler();
    this.dateProcessor = new DateProcessor();
  }
  
  /**
   * 🚀 작성일자 기반 빠른 분석 (블로그 지수 없이도 분석 가능)
   * 1분 안에 완료되도록 최적화
   * 
   * 분석 기준:
   * - 작성일자가 오래 전이면 최신글을 밀어줄 수 있음 (기회)
   * - 작성일자가 최근이면 경쟁이 치열할 수 있음
   * - 평균 작성일과 비교하여 기회 점수 계산
   */
  async analyzeFastByDate(keyword: string, maxResults: number = 30): Promise<FastDateAnalysisResult> {
    const startTime = Date.now();
    
    console.log(`[NAVER-BLOG-ANALYZER] 🚀 빠른 분석 시작 (작성일자 기반): "${keyword}"`);
    
    // 1단계: 네이버 API로 블로그 검색 (빠름)
    const searchResult = await this.searchApi.searchBlogs(keyword, maxResults);
    
    console.log(`[NAVER-BLOG-ANALYZER] 총 ${searchResult.total.toLocaleString()}개 결과 발견`);
    console.log(`[NAVER-BLOG-ANALYZER] 상위 ${searchResult.items.length}개 분석 중...`);
    
    // 2단계: 작성일자만으로 빠른 분석
    const blogs: FastDateAnalysisResult['blogs'] = [];
    const daysAgoList: number[] = [];
    
    for (let i = 0; i < searchResult.items.length; i++) {
      const item = searchResult.items[i];
      if (!item || !item.postdate) continue;
      
      const cleanTitle = this.cleanHtml(item.title);
      
      // 날짜 처리
      const postDate = this.dateProcessor.parseNaverDate(item.postdate);
      const daysAgo = this.dateProcessor.getDaysAgo(postDate);
      const hoursAgo = this.dateProcessor.getHoursAgo(postDate);
      const timeAgo = this.dateProcessor.getTimeAgo(postDate);
      
      daysAgoList.push(daysAgo);
      
      // 작성일자 기반 기회 점수 계산
      const { opportunityScore, opportunityReason } = this.calculateOpportunityScore(daysAgo, i + 1);
      
      blogs.push({
        title: cleanTitle,
        link: item.link,
        blogger: {
          name: item.bloggername,
          link: item.bloggerlink,
        },
        postDate,
        postDateFormatted: this.dateProcessor.formatDate(postDate),
        daysAgo,
        hoursAgo,
        timeAgo,
        rank: i + 1,
        opportunityScore,
        opportunityReason,
      });
    }
    
    // 3단계: 요약 통계 계산
    const avgDaysAgo = daysAgoList.length > 0 
      ? Math.round(daysAgoList.reduce((a, b) => a + b, 0) / daysAgoList.length)
      : 0;
    const oldestPostDays = daysAgoList.length > 0 ? Math.max(...daysAgoList) : 0;
    const newestPostDays = daysAgoList.length > 0 ? Math.min(...daysAgoList) : 0;
    const opportunityCount = blogs.filter(b => b.opportunityScore >= 70).length;
    
    const endTime = Date.now();
    const analysisTime = endTime - startTime;
    
    console.log(`[NAVER-BLOG-ANALYZER] ✅ 빠른 분석 완료! 소요 시간: ${(analysisTime / 1000).toFixed(2)}초`);
    console.log(`[NAVER-BLOG-ANALYZER] 평균 작성일: ${avgDaysAgo}일 전, 기회 글 수: ${opportunityCount}개`);
    
    return {
      keyword,
      totalResults: searchResult.total,
      blogs,
      analysisTime,
      timestamp: new Date(),
      summary: {
        avgDaysAgo,
        oldestPostDays,
        newestPostDays,
        opportunityCount,
      },
    };
  }
  
  /**
   * 작성일자 기반 기회 점수 계산
   * 
   * 점수 기준:
   * - 작성일자가 오래 전이면 (30일 이상) 높은 점수 (최신글을 밀어줄 수 있음)
   * - 작성일자가 최근이면 (7일 이내) 낮은 점수 (경쟁이 치열함)
   * - 순위가 높을수록 (1위에 가까울수록) 높은 점수
   */
  private calculateOpportunityScore(daysAgo: number, rank: number): { opportunityScore: number; opportunityReason: string } {
    let score = 0;
    let reason = '';
    
    // 1. 작성일자 점수 (50점 만점)
    if (daysAgo >= 90) {
      // 90일 이상: 매우 오래됨 → 최신글 밀어주기 가능성 높음
      score += 50;
      reason = '작성일이 90일 이상 지나 최신글을 밀어줄 가능성이 매우 높습니다';
    } else if (daysAgo >= 60) {
      // 60-89일: 오래됨 → 최신글 밀어주기 가능성 높음
      score += 45;
      reason = '작성일이 60일 이상 지나 최신글을 밀어줄 가능성이 높습니다';
    } else if (daysAgo >= 30) {
      // 30-59일: 적당히 오래됨 → 최신글 밀어주기 가능성 있음
      score += 35;
      reason = '작성일이 30일 이상 지나 최신글을 밀어줄 가능성이 있습니다';
    } else if (daysAgo >= 14) {
      // 14-29일: 보통 → 보통 기회
      score += 25;
      reason = '작성일이 보통입니다. 경쟁이 있을 수 있습니다';
    } else if (daysAgo >= 7) {
      // 7-13일: 최근 → 경쟁 있음
      score += 15;
      reason = '작성일이 최근이라 경쟁이 있을 수 있습니다';
    } else {
      // 7일 이내: 매우 최근 → 경쟁 치열
      score += 5;
      reason = '작성일이 매우 최근이라 경쟁이 치열할 수 있습니다';
    }
    
    // 2. 순위 점수 (50점 만점)
    // 순위가 높을수록 (1위에 가까울수록) 높은 점수
    if (rank <= 3) {
      // 상위 3위: 매우 높은 점수
      score += 50;
      reason += ', 상위 3위에 노출되어 기회가 매우 좋습니다';
    } else if (rank <= 10) {
      // 상위 10위: 높은 점수
      score += 40;
      reason += ', 상위 10위에 노출되어 기회가 좋습니다';
    } else if (rank <= 20) {
      // 상위 20위: 보통 점수
      score += 30;
      reason += ', 상위 20위에 노출되어 기회가 있습니다';
    } else if (rank <= 30) {
      // 상위 30위: 낮은 점수
      score += 20;
      reason += ', 상위 30위에 노출되어 기회가 보통입니다';
    } else {
      // 30위 이후: 매우 낮은 점수
      score += 10;
      reason += ', 30위 이후에 노출되어 기회가 낮습니다';
    }
    
    // 점수 정규화 (0-100)
    score = Math.min(100, Math.max(0, score));
    
    return { opportunityScore: Math.round(score), opportunityReason: reason };
  }
  
  /**
   * 키워드 분석 (메인 함수)
   */
  async analyze(keyword: string, maxResults: number = 30, includeStats: boolean = false): Promise<BlogAnalysisResult> {
    const startTime = Date.now();
    
    console.log(`[NAVER-BLOG-ANALYZER] 키워드 분석 시작: "${keyword}"`);
    
    // 1단계: 네이버 API로 블로그 검색
    const searchResult = await this.searchApi.searchBlogs(keyword, maxResults);
    
    console.log(`[NAVER-BLOG-ANALYZER] 총 ${searchResult.total.toLocaleString()}개 결과 발견`);
    console.log(`[NAVER-BLOG-ANALYZER] 상위 ${searchResult.items.length}개 분석 중...`);
    
    // 2단계: 각 블로그 상세 분석
    const analyzedBlogs: AnalyzedBlog[] = [];
    let statsSuccessCount = 0;
    
    for (let i = 0; i < searchResult.items.length; i++) {
      const item = searchResult.items[i];
      if (!item) continue;
      
      const cleanTitle = this.cleanHtml(item.title);
      
      // 날짜 처리
      const postDate = this.dateProcessor.parseNaverDate(item.postdate);
      const daysAgo = this.dateProcessor.getDaysAgo(postDate);
      const hoursAgo = this.dateProcessor.getHoursAgo(postDate);
      const timeAgo = this.dateProcessor.getTimeAgo(postDate);
      
      // 블로그 통계 수집 (선택적)
      let stats: BlogStats | null = null;
      let statsCollected = false;
      
      if (includeStats && item.bloggerlink) {
        try {
          // 🚀 검색 순위 전달하여 더 정확한 추정
          stats = await this.crawler.fetchBlogStats(item.bloggerlink, i + 1);
          
          if (stats && Object.values(stats).some(v => v !== undefined && v !== null && v > 0)) {
            statsCollected = true;
            statsSuccessCount++;
          }
        } catch (error) {
          // 실패해도 계속 진행
        }
        
        // API 호출 간격 조절 (Puppeteer 사용 시 더 긴 대기)
        const delay = stats && stats.blogIndex ? 2000 : 500; // Puppeteer 사용 시 2초, 일반 0.5초
        if (i < searchResult.items.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      analyzedBlogs.push({
        title: cleanTitle,
        link: item.link,
        description: this.cleanHtml(item.description),
        blogger: {
          name: item.bloggername,
          link: item.bloggerlink,
        },
        postDate,
        postDateFormatted: this.dateProcessor.formatDate(postDate),
        timeAgo,
        daysAgo,
        hoursAgo,
        stats,
        statsCollected,
        rank: i + 1,
      });
    }
    
    const endTime = Date.now();
    const searchTime = endTime - startTime;
    const statsSuccessRate = searchResult.items.length > 0 
      ? (statsSuccessCount / searchResult.items.length) * 100 
      : 0;
    
    console.log(`[NAVER-BLOG-ANALYZER] 분석 완료! 소요 시간: ${(searchTime / 1000).toFixed(2)}초, 통계 수집 성공률: ${statsSuccessRate.toFixed(1)}%`);
    
    return {
      keyword,
      totalResults: searchResult.total,
      analyzedBlogs,
      searchTime,
      timestamp: new Date(),
      statsSuccessRate,
    };
  }
  
  /**
   * HTML 태그 제거
   */
  private cleanHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .trim();
  }
}

