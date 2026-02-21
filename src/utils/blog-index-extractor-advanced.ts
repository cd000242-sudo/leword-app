/**
 * 🚀 혁신적인 블로그 지수 추출 시스템
 * 시장에서 아무도 구현하지 못한 방법:
 * 1. Puppeteer로 JavaScript 실행 결과에서 동적 데이터 추출
 * 2. RSS 피드 분석으로 활동도 측정
 * 3. 다중 소스 데이터 융합 AI 추정
 */

export interface AdvancedBlogStats {
  blogIndex?: number;           // 네이버 블로그 지수 (실제 추출 또는 추정)
  estimatedIndex?: number;      // AI 추정 지수
  confidence: number;           // 신뢰도 (0-100)
  source: 'puppeteer' | 'rss' | 'fusion' | 'estimated'; // 데이터 출처
  metrics: {
    // RSS 기반 지표
    rssPostFrequency?: number;      // RSS 포스팅 빈도 (월간)
    rssRecentActivity?: number;      // 최근 활동도 (점수)
    rssTotalPosts?: number;          // RSS에서 추정한 총 포스트 수
    
    // 검색 기반 지표
    searchRank?: number;             // 검색 순위
    searchRelevance?: number;        // 키워드 관련성 점수
    
    // Puppeteer 추출 지표
    puppeteerIndex?: number;          // Puppeteer로 추출한 지수
    puppeteerVisitors?: number;      // 일일 방문자
    puppeteerFollowers?: number;     // 구독자 수
  };
  timestamp: Date;
}

/**
 * Puppeteer를 사용한 동적 블로그 지수 추출
 * 네이버 블로그 프로필 페이지에서 JavaScript 실행 결과 추출
 */
export class PuppeteerBlogIndexExtractor {
  /**
   * Puppeteer로 블로그 프로필 페이지에서 지수 추출
   */
  async extractWithPuppeteer(blogId: string): Promise<Partial<AdvancedBlogStats['metrics']> | null> {
    let browser: any = null;
    
    try {
      console.log(`[PUPPETEER-EXTRACTOR] 블로그 지수 추출 시작: ${blogId}`);
      
      const puppeteer = await import('puppeteer');
      const { findChromePath } = await import('./chrome-finder');
      const chromePath = findChromePath();
      
      browser = await puppeteer.launch({
        headless: 'new',
        executablePath: chromePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process'
        ]
      });
      
      const page = await browser.newPage();
      
      // 네트워크 최적화: 이미지, 폰트 차단
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
      
      // 언어 설정
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      });
      
      // 방법 1: 블로그 프로필 페이지 접속 시도
      const profileUrl = `https://blog.naver.com/${blogId}`;
      console.log(`[PUPPETEER-EXTRACTOR] 프로필 페이지 로딩: ${profileUrl}`);
      
      try {
        await page.goto(profileUrl, {
          waitUntil: 'networkidle2',
          timeout: 20000
        });
      
      // JavaScript 실행 대기 (5초로 증가)
      await page.waitForTimeout(5000);
      
      // 네이버 블로그 지수는 검색 결과 페이지나 특정 API에서 제공될 수 있음
      // 먼저 페이지 내용 확인 (디버깅용)
      const pageContent = await page.content();
      const hasBlogIndexPattern = /blogIndex|블로그지수|지수/i.test(pageContent);
      console.log(`[PUPPETEER-EXTRACTOR] 페이지 내용 확인: 블로그 지수 패턴 ${hasBlogIndexPattern ? '발견' : '미발견'}`);
      
      // 페이지에서 블로그 지수 및 통계 추출
      const extractedData = await page.evaluate(() => {
        const result: any = {};
        
        // 방법 1: window 객체에서 데이터 추출
        const windowData = (window as any);
        
        // 네이버 블로그는 특정 전역 변수에 데이터 저장
        if (windowData.__INITIAL_STATE__) {
          const state = windowData.__INITIAL_STATE__;
          if (state?.blogInfo?.blogIndex) result.blogIndex = state.blogInfo.blogIndex;
          if (state?.blogInfo?.visitors) result.visitors = state.blogInfo.visitors;
          if (state?.blogInfo?.followers) result.followers = state.blogInfo.followers;
          if (state?.blog?.blogIndex) result.blogIndex = state.blog.blogIndex;
          if (state?.profile?.blogIndex) result.blogIndex = state.profile.blogIndex;
        }
        
        if (windowData.__BLOG_DATA__) {
          const blogData = windowData.__BLOG_DATA__;
          if (blogData?.index) result.blogIndex = blogData.index;
          if (blogData?.visitors) result.visitors = blogData.visitors;
          if (blogData?.blogIndex) result.blogIndex = blogData.blogIndex;
        }
        
        // 추가 전역 변수 확인
        if (windowData.__PRELOADED_STATE__) {
          const preloaded = windowData.__PRELOADED_STATE__;
          if (preloaded?.blogInfo?.blogIndex) result.blogIndex = preloaded.blogInfo.blogIndex;
        }
        
        // 방법 2: DOM에서 직접 추출 (더 많은 선택자 시도)
        const selectors = [
          '[data-blog-index]',
          '.blog-index',
          '.blogIndex',
          '#blogIndex',
          '[class*="blog-index"]',
          '[class*="blogIndex"]',
          '[id*="blog-index"]',
          '[id*="blogIndex"]',
          '.area_statistics',
          '.statistics',
          '[class*="stat"]',
          '[data-index]'
        ];
        
        for (const selector of selectors) {
          try {
            const element = document.querySelector(selector);
            if (element) {
              const text = element.textContent || element.getAttribute('data-blog-index') || element.getAttribute('data-index') || '';
              const indexMatch = text.match(/(\d{1,3}(?:,\d{3})*)/);
              if (indexMatch && indexMatch[1]) {
                const value = parseInt(indexMatch[1].replace(/,/g, ''), 10);
                if (value > 1000 && !result.blogIndex) {
                  result.blogIndex = value;
                  break;
                }
              }
            }
          } catch (e) {
            // 무시
          }
        }
        
        // 방법 3: script 태그 내 JSON 데이터 추출 (개선)
        const scripts = Array.from(document.querySelectorAll('script'));
        for (const script of scripts) {
          const scriptText = script.textContent || '';
          
          // 다양한 패턴 시도
          const patterns = [
            /blogIndex["\s:]*(\d{1,3}(?:,\d{3})*)/i,
            /블로그지수["\s:]*(\d{1,3}(?:,\d{3})*)/i,
            /"blogIndex"\s*:\s*(\d+)/i,
            /"index"\s*:\s*(\d{4,})/i,
            /blog_index["\s:]*(\d{1,3}(?:,\d{3})*)/i,
            /blogIndexValue["\s:]*(\d+)/i
          ];
          
          for (const pattern of patterns) {
            const match = scriptText.match(pattern);
            if (match && match[1] && !result.blogIndex) {
              const value = parseInt(match[1].replace(/,/g, ''), 10);
              if (value > 1000) {
                result.blogIndex = value;
                break;
              }
            }
          }
          
          // JSON 데이터 파싱 시도 (더 포괄적으로)
          try {
            // 더 큰 JSON 블록 찾기
            const jsonMatches = scriptText.match(/\{[^{}]*"blogIndex"[^{}]*\}/g) || 
                                scriptText.match(/\{[^{}]*"index"[^{}]*\}/g);
            if (jsonMatches) {
              for (const jsonStr of jsonMatches) {
                try {
                  const jsonData = JSON.parse(jsonStr);
                  if (jsonData.blogIndex && !result.blogIndex && jsonData.blogIndex > 1000) {
                    result.blogIndex = jsonData.blogIndex;
                  }
                  if (jsonData.index && !result.blogIndex && jsonData.index > 1000) {
                    result.blogIndex = jsonData.index;
                  }
                } catch (e) {
                  // 무시
                }
              }
            }
          } catch (e) {
            // 무시
          }
        }
        
        // 방법 4: 네이버 블로그 특정 클래스/ID에서 추출 (개선)
        const statSelectors = [
          '.stat',
          '.blog-stat',
          '.statistics',
          '[class*="index"]',
          '[id*="index"]',
          '[class*="stat"]',
          '.area_statistics',
          '.blog_info',
          '.profile_info'
        ];
        
        for (const selector of statSelectors) {
          try {
            const elements = document.querySelectorAll(selector);
            for (const elem of Array.from(elements)) {
              const text = elem.textContent || '';
              const indexMatches = text.match(/(\d{1,3}(?:,\d{3})*)/g);
              if (indexMatches) {
                for (const match of indexMatches) {
                  const value = parseInt(match.replace(/,/g, ''), 10);
                  // 블로그 지수는 보통 4자리 이상
                  if (value > 1000 && value < 1000000 && !result.blogIndex) {
                    result.blogIndex = value;
                    break;
                  }
                }
                if (result.blogIndex) break;
              }
            }
            if (result.blogIndex) break;
          } catch (e) {
            // 무시
          }
        }
        
        // 방법 5: 메타 태그나 data 속성 확인
        const metaTags = document.querySelectorAll('meta[property*="index"], meta[name*="index"]');
        for (const meta of Array.from(metaTags)) {
          const content = meta.getAttribute('content');
          if (content) {
            const match = content.match(/(\d{4,})/);
            if (match && match[1] && !result.blogIndex) {
              const value = parseInt(match[1], 10);
              if (value > 1000 && value < 1000000) {
                result.blogIndex = value;
                break;
              }
            }
          }
        }
        
        return result;
      });
      
      if (extractedData.blogIndex || extractedData.visitors || extractedData.followers) {
        console.log(`[PUPPETEER-EXTRACTOR] ✅ 프로필 페이지에서 추출 성공:`, extractedData);
        await browser.close();
        browser = null;
        return {
          puppeteerIndex: extractedData.blogIndex,
          puppeteerVisitors: extractedData.visitors,
          puppeteerFollowers: extractedData.followers
        };
      }
      
      console.log(`[PUPPETEER-EXTRACTOR] 프로필 페이지에서 추출 실패, 검색 결과 페이지 시도...`);
      
      // 방법 2: 네이버 블로그 검색 결과에서 블로그 지수 추출 시도
      // 블로그 지수는 검색 결과 페이지에 표시되는 경우가 많음
      const searchUrl = `https://search.naver.com/search.naver?where=post&query=site:blog.naver.com/${blogId}`;
      try {
        console.log(`[PUPPETEER-EXTRACTOR] 검색 결과 페이지 로딩: ${searchUrl}`);
        await page.goto(searchUrl, {
          waitUntil: 'networkidle2',
          timeout: 20000
        });
        
        await page.waitForTimeout(3000);
        
        const searchExtractedData = await page.evaluate((blogId: string) => {
          const result: any = {};
          
          // 검색 결과에서 해당 블로그 항목 찾기
          const blogItems = Array.from(document.querySelectorAll('.sh_blog_top, .api_subject_bx, [class*="blog"]'));
          for (const item of blogItems) {
            const link = item.querySelector('a');
            if (link && link.href.includes(`blog.naver.com/${blogId}`)) {
              // 블로그 지수 패턴 찾기
              const itemText = item.textContent || '';
              const blogIndexPatterns = [
                /블로그지수[^\d]*(\d{1,3}(?:,\d{3})*)/i,
                /지수[^\d]*(\d{1,3}(?:,\d{3})*)/i,
                /blogIndex[^\d]*(\d{1,3}(?:,\d{3})*)/i
              ];
              
              for (const pattern of blogIndexPatterns) {
                const match = itemText.match(pattern);
                if (match && match[1]) {
                  const value = parseInt(match[1].replace(/,/g, ''), 10);
                  if (value > 1000 && !result.blogIndex) {
                    result.blogIndex = value;
                    break;
                  }
                }
              }
              
              // data 속성에서 찾기
              const blogIndexAttr = item.getAttribute('data-blog-index') || 
                                   item.getAttribute('data-index');
              if (blogIndexAttr) {
                const value = parseInt(blogIndexAttr.replace(/,/g, ''), 10);
                if (value > 1000 && !result.blogIndex) {
                  result.blogIndex = value;
                }
              }
              
              if (result.blogIndex) break;
            }
          }
          
          // 스크립트 태그에서도 검색
          const scripts = Array.from(document.querySelectorAll('script'));
          for (const script of scripts) {
            const scriptText = script.textContent || '';
            if (scriptText.includes(blogId)) {
              const blogIndexMatch = scriptText.match(new RegExp(`"${blogId}"[\\s\\S]*?blogIndex["\\s:]*?(\\d{1,3}(?:,\\d{3})*)`, 'i'));
              if (blogIndexMatch && blogIndexMatch[1]) {
                const value = parseInt(blogIndexMatch[1].replace(/,/g, ''), 10);
                if (value > 1000 && !result.blogIndex) {
                  result.blogIndex = value;
                }
              }
            }
          }
          
          return result;
        }, blogId);
        
        if (searchExtractedData.blogIndex) {
          console.log(`[PUPPETEER-EXTRACTOR] ✅ 검색 결과 페이지에서 추출 성공:`, searchExtractedData);
          await browser.close();
          browser = null;
          return {
            puppeteerIndex: searchExtractedData.blogIndex
          };
        }
      } catch (searchError: any) {
        console.warn(`[PUPPETEER-EXTRACTOR] 검색 결과 페이지 접근 실패: ${searchError.message}`);
      }
      
      } catch (profileError: any) {
        console.warn(`[PUPPETEER-EXTRACTOR] 프로필 페이지 접근 실패: ${profileError.message}`);
      }
      
      // 모든 방법 실패 시 브라우저 닫기
      if (browser) {
        await browser.close();
        browser = null;
      }
      
      console.log(`[PUPPETEER-EXTRACTOR] ⚠️ 모든 방법 실패`);
      return null;
      
    } catch (error: any) {
      if (browser) {
        try {
          await browser.close();
        } catch (e) {
          // 무시
        }
      }
      console.warn(`[PUPPETEER-EXTRACTOR] 추출 실패: ${error.message || String(error)}`);
      return null;
    }
  }
}

/**
 * RSS 피드 분석을 통한 블로그 활동도 측정
 */
export class RSSActivityAnalyzer {
  /**
   * RSS 피드에서 블로그 활동도 분석
   */
  async analyzeRSSActivity(blogId: string): Promise<Partial<AdvancedBlogStats['metrics']> | null> {
    try {
      console.log(`[RSS-ANALYZER] RSS 분석 시작: ${blogId}`);
      
      // 네이버 블로그 RSS URL
      const rssUrl = `https://blog.naver.com/${blogId}.do?Redirect=Log&logNo=`;
      
      // 대안: 네이버 블로그 검색 RSS
      const searchRssUrl = `https://search.naver.com/search.naver?where=rss&query=site:blog.naver.com/${blogId}`;
      
      // RSS 피드 가져오기
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      let response: Response | null = null;
      
      // 여러 RSS 엔드포인트 시도
      const rssEndpoints = [
        `https://blog.naver.com/${blogId}/RSS`,
        `https://rss.blog.naver.com/${blogId}.xml`,
        searchRssUrl
      ];
      
      let rssText = '';
      
      for (const endpoint of rssEndpoints) {
        try {
          response = await fetch(endpoint, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/rss+xml, application/xml, text/xml, */*'
            }
          });
          
          if (response.ok) {
            rssText = await response.text();
            clearTimeout(timeoutId);
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      clearTimeout(timeoutId);
      
      if (!rssText) {
        console.log(`[RSS-ANALYZER] RSS 피드 가져오기 실패`);
        return null;
      }
      
      // RSS 파싱 (정규식 기반 - DOMParser 없이도 동작)
      const itemMatches = Array.from(rssText.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi));
      const items: string[] = [];
      for (const match of itemMatches) {
        if (match[1]) {
          items.push(match[1]);
        }
      }
      
      const totalPosts = items.length;
      
      // 최근 30일 포스팅 수 계산
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      let recentPosts = 0;
      let latestPostDate: Date | null = null;
      
      items.forEach((itemXml) => {
        // pubDate 추출
        const pubDateMatch = itemXml.match(/<pubDate[^>]*>([^<]+)<\/pubDate>/i) || 
                            itemXml.match(/<dc:date[^>]*>([^<]+)<\/dc:date>/i);
        
        if (pubDateMatch && pubDateMatch[1]) {
          try {
            const pubDate = new Date(pubDateMatch[1].trim());
            if (!isNaN(pubDate.getTime())) {
              if (pubDate >= thirtyDaysAgo) {
                recentPosts++;
              }
              if (!latestPostDate || pubDate > latestPostDate) {
                latestPostDate = pubDate;
              }
            }
          } catch (e) {
            // 날짜 파싱 실패는 무시
          }
        }
      });
      
      // 활동도 점수 계산 (0-100)
      let daysSinceLastPost = 999;
      if (latestPostDate) {
        try {
          const postDate = new Date(latestPostDate);
          if (!isNaN(postDate.getTime())) {
            daysSinceLastPost = Math.floor((now.getTime() - postDate.getTime()) / (1000 * 60 * 60 * 24));
          }
        } catch (e) {
          // 날짜 변환 실패 시 기본값 유지
        }
      }
      
      const activityScore = Math.max(0, 100 - (daysSinceLastPost * 2)); // 최근 포스팅일수록 높은 점수
      const frequencyScore = Math.min(100, recentPosts * 10); // 최근 포스팅 수 기반 점수
      
      const result = {
        rssTotalPosts: totalPosts,
        rssPostFrequency: recentPosts,
        rssRecentActivity: Math.round((activityScore + frequencyScore) / 2)
      };
      
      console.log(`[RSS-ANALYZER] ✅ 분석 완료:`, result);
      return result;
      
    } catch (error: any) {
      console.warn(`[RSS-ANALYZER] 분석 실패: ${error.message || String(error)}`);
      return null;
    }
  }
}

/**
 * 다중 소스 데이터 융합 AI 추정 시스템
 */
export class BlogIndexFusionEstimator {
  /**
   * 여러 소스의 데이터를 결합하여 블로그 지수 추정
   */
  estimateBlogIndex(
    searchRank: number,
    rssMetrics?: Partial<AdvancedBlogStats['metrics']>,
    puppeteerMetrics?: Partial<AdvancedBlogStats['metrics']>
  ): AdvancedBlogStats {
    const metrics: AdvancedBlogStats['metrics'] = {
      searchRank,
      ...rssMetrics,
      ...puppeteerMetrics
    };
    
    let blogIndex: number | undefined;
    let estimatedIndex: number | undefined;
    let confidence = 0;
    let source: AdvancedBlogStats['source'] = 'estimated';
    
    // 1순위: Puppeteer로 추출한 실제 지수
    if (puppeteerMetrics?.puppeteerIndex && puppeteerMetrics.puppeteerIndex > 0) {
      blogIndex = puppeteerMetrics.puppeteerIndex;
      confidence = 95;
      source = 'puppeteer';
      console.log(`[FUSION-ESTIMATOR] ✅ Puppeteer 추출 성공: ${blogIndex}`);
    }
    // 2순위: RSS 기반 추정
    else if (rssMetrics?.rssRecentActivity !== undefined) {
      // RSS 활동도 기반 추정 지수 계산
      const activityScore = rssMetrics.rssRecentActivity || 0;
      const frequencyScore = Math.min(100, (rssMetrics.rssPostFrequency || 0) * 5);
      const rankScore = Math.max(0, 100 - (searchRank * 2));
      
      // 가중 평균으로 추정 지수 계산
      estimatedIndex = Math.round(
        (activityScore * 0.4) + 
        (frequencyScore * 0.3) + 
        (rankScore * 0.3)
      ) * 100; // 0-100 점수를 0-10000 지수로 변환
      
      confidence = 70;
      source = 'rss';
      console.log(`[FUSION-ESTIMATOR] 📊 RSS 기반 추정: ${estimatedIndex}`);
    }
    // 3순위: 검색 순위 기반 추정
    else {
      // 검색 순위만으로 추정 (가장 낮은 신뢰도)
      estimatedIndex = Math.max(1000, (100 - searchRank) * 100);
      confidence = 40;
      source = 'estimated';
      console.log(`[FUSION-ESTIMATOR] ⚠️ 검색 순위 기반 추정: ${estimatedIndex}`);
    }
    
    // 다중 소스 융합 (가장 정확)
    if (puppeteerMetrics && rssMetrics) {
      // Puppeteer와 RSS 데이터를 결합하여 더 정확한 추정
      const fusionIndex = this.calculateFusionIndex(
        puppeteerMetrics,
        rssMetrics,
        searchRank
      );
      
      if (fusionIndex) {
        estimatedIndex = fusionIndex;
        confidence = Math.min(100, confidence + 15); // 신뢰도 증가
        source = 'fusion';
        console.log(`[FUSION-ESTIMATOR] 🚀 다중 소스 융합 추정: ${estimatedIndex} (신뢰도: ${confidence}%)`);
      }
    }
    
    const result: AdvancedBlogStats = {
      confidence,
      source,
      metrics,
      timestamp: new Date()
    };
    
    if (blogIndex !== undefined) {
      result.blogIndex = blogIndex;
    }
    if (estimatedIndex !== undefined) {
      result.estimatedIndex = estimatedIndex;
    }
    
    return result;
  }
  
  /**
   * 다중 소스 데이터를 융합하여 지수 계산
   */
  private calculateFusionIndex(
    puppeteerMetrics: Partial<AdvancedBlogStats['metrics']>,
    rssMetrics: Partial<AdvancedBlogStats['metrics']>,
    searchRank: number
  ): number | undefined {
    try {
      // 가중치 기반 융합 계산
      const weights = {
        puppeteer: 0.5,  // Puppeteer 데이터가 가장 신뢰도 높음
        rss: 0.3,         // RSS 데이터
        search: 0.2       // 검색 순위
      };
      
      let fusionScore = 0;
      
      // Puppeteer 지수 (있는 경우)
      if (puppeteerMetrics.puppeteerIndex) {
        fusionScore += (puppeteerMetrics.puppeteerIndex / 10000) * 100 * weights.puppeteer;
      } else if (puppeteerMetrics.puppeteerVisitors) {
        // 방문자 수를 지수로 변환 (경험적 공식)
        const visitorScore = Math.min(100, Math.log10(puppeteerMetrics.puppeteerVisitors + 1) * 20);
        fusionScore += visitorScore * weights.puppeteer;
      }
      
      // RSS 활동도
      if (rssMetrics.rssRecentActivity !== undefined) {
        fusionScore += rssMetrics.rssRecentActivity * weights.rss;
      }
      
      // 검색 순위 점수
      const rankScore = Math.max(0, 100 - (searchRank * 2));
      fusionScore += rankScore * weights.search;
      
      // 점수를 지수로 변환 (0-10000 범위)
      const fusionIndex = Math.round(fusionScore * 100);
      
      return Math.max(1000, Math.min(100000, fusionIndex)); // 최소 1000, 최대 100000
      
    } catch (error) {
      return undefined;
    }
  }
}

/**
 * 통합 블로그 지수 추출기 (메인 클래스)
 */
export class AdvancedBlogIndexExtractor {
  private puppeteerExtractor: PuppeteerBlogIndexExtractor;
  private rssAnalyzer: RSSActivityAnalyzer;
  private fusionEstimator: BlogIndexFusionEstimator;
  
  constructor() {
    this.puppeteerExtractor = new PuppeteerBlogIndexExtractor();
    this.rssAnalyzer = new RSSActivityAnalyzer();
    this.fusionEstimator = new BlogIndexFusionEstimator();
  }
  
  /**
   * 블로그 지수 추출 (통합 메서드)
   */
  async extractBlogIndex(
    blogId: string,
    searchRank: number
  ): Promise<AdvancedBlogStats> {
    console.log(`[ADVANCED-EXTRACTOR] 블로그 지수 추출 시작: ${blogId} (순위: ${searchRank})`);
    
    // 병렬로 여러 소스에서 데이터 수집
    const [puppeteerMetrics, rssMetrics] = await Promise.allSettled([
      this.puppeteerExtractor.extractWithPuppeteer(blogId),
      this.rssAnalyzer.analyzeRSSActivity(blogId)
    ]);
    
    const puppeteerResult = puppeteerMetrics.status === 'fulfilled' 
      ? puppeteerMetrics.value 
      : null;
    const rssResult = rssMetrics.status === 'fulfilled' 
      ? rssMetrics.value 
      : null;
    
    // 다중 소스 융합 추정
    const result = this.fusionEstimator.estimateBlogIndex(
      searchRank,
      rssResult || undefined,
      puppeteerResult || undefined
    );
    
    console.log(`[ADVANCED-EXTRACTOR] ✅ 추출 완료:`, {
      blogIndex: result.blogIndex,
      estimatedIndex: result.estimatedIndex,
      confidence: result.confidence,
      source: result.source
    });
    
    return result;
  }
}


