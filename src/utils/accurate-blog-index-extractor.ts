/**
 * 🎯 정확한 블로그 지수 추출기 (2025년 완전 개선 버전)
 * 
 * 네이버 블로그 지수는 공개 API로 제공되지 않으므로,
 * 블로그 통계(총 포스트 수, 방문자 수, 활동 기간 등)를 기반으로 추정합니다.
 * 
 * 추정 방식:
 * 1. 블로그 프로필에서 총 포스트 수 추출
 * 2. 블로그 활동 기간 추정
 * 3. 최근 포스팅 빈도 분석
 * 4. 이를 기반으로 블로그 지수 추정
 */

import puppeteer, { Browser, Page } from 'puppeteer';

export interface AccurateBlogIndexResult {
  blogIndex: number;           // 추정 블로그 지수
  confidence: number;          // 신뢰도 (0-100)
  source: 'profile' | 'estimated' | 'stats'; // 데이터 출처
  stats: {
    totalPosts?: number;       // 총 포스트 수
    blogAge?: string;          // 블로그 나이
    blogAgeYears?: number;     // 블로그 나이 (년)
    recentActivity?: string;   // 최근 활동 상태
    visitorCount?: number;     // 방문자 수 (추정)
  };
  methods: {
    profilePage?: number;
    searchResult?: number;
    apiResponse?: number;
  };
  timestamp: Date;
}

/**
 * 블로그 통계 기반 지수 계산 공식
 * 
 * 블로그 지수 = (총포스트수 × 10) + (블로그나이년 × 5000) + (활동보너스)
 * 
 * 참고: 실제 네이버 블로그 지수와 100% 일치하지 않을 수 있으나,
 * 상대적 비교에는 유용합니다.
 */
function calculateEstimatedBlogIndex(stats: {
  totalPosts: number;
  blogAgeYears: number;
  isActive: boolean;
  hasQualityContent: boolean;
}): number {
  let index = 0;
  
  // 1. 총 포스트 수 기여 (최대 100,000)
  // 포스트 1개당 약 10점
  const postScore = Math.min(stats.totalPosts * 10, 100000);
  index += postScore;
  
  // 2. 블로그 나이 기여 (최대 50,000)
  // 1년당 약 5,000점
  const ageScore = Math.min(stats.blogAgeYears * 5000, 50000);
  index += ageScore;
  
  // 3. 활동 보너스 (최대 30,000)
  if (stats.isActive) {
    index += 15000; // 최근 활동 보너스
  }
  if (stats.hasQualityContent) {
    index += 15000; // 품질 콘텐츠 보너스
  }
  
  // 4. 기본 지수 (최소 1,000)
  index = Math.max(index, 1000);
  
  // 5. 최대 제한 (200,000)
  index = Math.min(index, 200000);
  
  return Math.round(index);
}

/**
 * 정확한 블로그 지수 추출기
 */
export class AccurateBlogIndexExtractor {
  private browserInstance: Browser | null = null;
  
  /**
   * 브라우저 인스턴스 가져오기 (재사용)
   */
  private async getBrowser(): Promise<Browser> {
    if (this.browserInstance && this.browserInstance.connected) {
      return this.browserInstance;
    }
    
    this.browserInstance = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1920,1080'
      ]
    });
    
    return this.browserInstance;
  }
  
  /**
   * 브라우저 종료
   */
  async closeBrowser(): Promise<void> {
    if (this.browserInstance) {
      await this.browserInstance.close();
      this.browserInstance = null;
    }
  }
  
  /**
   * 블로그 지수 추출 (통계 기반 추정)
   */
  async extractAccurateBlogIndex(blogId: string): Promise<AccurateBlogIndexResult | null> {
    console.log(`[BLOG-INDEX-EXTRACTOR] 블로그 지수 추출 시작: ${blogId}`);
    
    let browser: Browser | null = null;
    let page: Page | null = null;
    
    try {
      browser = await this.getBrowser();
      page = await browser.newPage();
      
      // User-Agent 설정 (봇 탐지 우회)
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1920, height: 1080 });
    
      // 추가 헤더 설정
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      });
    
      // 블로그 프로필 페이지 접근
      const profileUrl = `https://blog.naver.com/${blogId}`;
      console.log(`[BLOG-INDEX-EXTRACTOR] 프로필 페이지 접근: ${profileUrl}`);
      
      await page.goto(profileUrl, { 
        waitUntil: 'networkidle2', 
        timeout: 30000 
      });
      
      // 페이지 로딩 대기
      await page.waitForTimeout(3000);
      
      // 블로그 통계 추출
      const stats = await this.extractBlogStats(page, blogId);
      
      if (!stats) {
        console.log(`[BLOG-INDEX-EXTRACTOR] ❌ 통계 추출 실패`);
        await page.close();
        return null;
      }
      
      console.log(`[BLOG-INDEX-EXTRACTOR] 📊 추출된 통계:`, JSON.stringify(stats, null, 2));
      
      // 블로그 지수 계산
      const blogIndex = calculateEstimatedBlogIndex({
        totalPosts: stats.totalPosts || 0,
        blogAgeYears: stats.blogAgeYears || 1,
        isActive: stats.isActive || false,
        hasQualityContent: (stats.totalPosts || 0) > 100
      });
      
      // 신뢰도 계산
      let confidence = 60; // 기본 신뢰도
      
      if (stats.totalPosts && stats.totalPosts > 0) confidence += 15;
      if (stats.blogAgeYears && stats.blogAgeYears > 0) confidence += 10;
      if (stats.isActive) confidence += 10;
      if (stats.blogName) confidence += 5;
      
      confidence = Math.min(confidence, 95); // 최대 95% (추정치이므로)
      
      console.log(`[BLOG-INDEX-EXTRACTOR] ✅ 추정 블로그 지수: ${blogIndex.toLocaleString()} (신뢰도: ${confidence}%)`);
      
      await page.close();
      
      return {
        blogIndex,
        confidence,
        source: 'stats',
        stats: {
          totalPosts: stats.totalPosts,
          blogAge: stats.blogAge,
          blogAgeYears: stats.blogAgeYears,
          recentActivity: stats.isActive ? '활발' : '비활성',
          visitorCount: stats.visitorCount
        },
        methods: {
          profilePage: blogIndex
        },
        timestamp: new Date()
      };
      
    } catch (error: any) {
      console.error(`[BLOG-INDEX-EXTRACTOR] 오류:`, error.message);
      
      if (page) {
        try { await page.close(); } catch {}
      }
      
      return null;
    }
  }
  
  /**
   * 블로그 통계 추출 (프로필 페이지에서)
   */
  private async extractBlogStats(page: Page, blogId: string): Promise<{
    totalPosts: number;
    blogName?: string;
    blogAge?: string;
    blogAgeYears?: number;
    isActive?: boolean;
    visitorCount?: number;
  } | null> {
    
    try {
      // 1. 페이지 내 통계 정보 추출
      const pageStats = await page.evaluate(() => {
        const result: any = {
          totalPosts: 0,
          blogName: null,
          foundElements: []
        };
          
        // 블로그 이름 찾기
        const nameSelectors = [
          '.nick', '.blog-name', '.blog_name', 
          '#nickNameArea', '.blog_title', 'h1.tit',
          '.area_title .name', '.profile_area .name'
        ];
        
        for (const selector of nameSelectors) {
          const el = document.querySelector(selector);
          if (el?.textContent?.trim()) {
            result.blogName = el.textContent.trim();
            result.foundElements.push(`blogName: ${selector}`);
            break;
          }
        }
        
        // 총 포스트 수 찾기 - 다양한 패턴
        const postCountPatterns = [
          // 숫자 + "개의 글" 패턴
          /(\d{1,3}(?:,\d{3})*)\s*개의?\s*글/,
          // "전체글 (숫자)" 패턴
          /전체\s*글?\s*[\(\[]?\s*(\d{1,3}(?:,\d{3})*)/,
          // "포스트 숫자" 패턴
          /포스트\s*[\(\[]?\s*(\d{1,3}(?:,\d{3})*)/,
          // "글 숫자개" 패턴
          /글\s*(\d{1,3}(?:,\d{3})*)\s*개/,
          // 단순 숫자 (카테고리 옆)
          /\((\d{1,3}(?:,\d{3})*)\)/
        ];
        
        // 전체 페이지 텍스트에서 찾기
        const bodyText = document.body.innerText || '';
          
        for (const pattern of postCountPatterns) {
          const match = bodyText.match(pattern);
          if (match && match[1]) {
            const count = parseInt(match[1].replace(/,/g, ''), 10);
            if (count > 0 && count < 100000) {
              result.totalPosts = count;
              result.foundElements.push(`totalPosts: ${pattern.toString()}`);
              break;
            }
          }
        }
        
        // 특정 셀렉터에서 포스트 수 찾기
        if (result.totalPosts === 0) {
          const countSelectors = [
            '.category_count', '.post_count', '.cnt', 
            '.count', '.num', '[class*="count"]',
            '.total_count', '.all_count'
        ];
        
          for (const selector of countSelectors) {
          const elements = document.querySelectorAll(selector);
            for (const el of Array.from(elements)) {
              const text = el.textContent?.trim() || '';
              const match = text.match(/(\d{1,3}(?:,\d{3})*)/);
              if (match && match[1]) {
                const count = parseInt(match[1].replace(/,/g, ''), 10);
                if (count > 0 && count < 100000) {
                  result.totalPosts = count;
                  result.foundElements.push(`totalPosts: ${selector}`);
                  break;
                }
              }
            }
            if (result.totalPosts > 0) break;
          }
        }
        
        // 방문자 수 찾기
        const visitorPatterns = [
          /방문자\s*[\(\[]?\s*(\d{1,3}(?:,\d{3})*)/,
          /오늘\s*(\d{1,3}(?:,\d{3})*)/,
          /전체\s*방문\s*(\d{1,3}(?:,\d{3})*)/
        ];
        
        for (const pattern of visitorPatterns) {
          const match = bodyText.match(pattern);
          if (match && match[1]) {
            result.visitorCount = parseInt(match[1].replace(/,/g, ''), 10);
            break;
          }
        }
        
        // 디버깅: 페이지 구조 확인
        result.pageTitle = document.title;
        result.bodyLength = bodyText.length;
        
        return result;
      });
      
      console.log(`[BLOG-INDEX-EXTRACTOR] 페이지 분석 결과:`, pageStats.foundElements);
      
      // 2. iframe 내부 확인 (네이버 블로그는 iframe 사용)
      let totalPosts = pageStats.totalPosts;
      
      if (totalPosts === 0) {
        console.log(`[BLOG-INDEX-EXTRACTOR] iframe 내부 확인 중...`);
        
        // mainFrame 확인
        const frames = page.frames();
        for (const frame of frames) {
          try {
            const frameStats = await frame.evaluate(() => {
              const text = document.body?.innerText || '';
              const patterns = [
                /(\d{1,3}(?:,\d{3})*)\s*개의?\s*글/,
                /전체\s*글?\s*[\(\[]?\s*(\d{1,3}(?:,\d{3})*)/,
                /\((\d{1,3}(?:,\d{3})*)\)/
              ];
              
              for (const pattern of patterns) {
                const match = text.match(pattern);
                if (match && match[1]) {
                  const count = parseInt(match[1].replace(/,/g, ''), 10);
                  if (count > 0 && count < 100000) {
                    return count;
                  }
                }
              }
              return 0;
            });
            
            if (frameStats > 0) {
              totalPosts = frameStats;
              console.log(`[BLOG-INDEX-EXTRACTOR] iframe에서 포스트 수 발견: ${totalPosts}`);
              break;
            }
          } catch {}
        }
      }
      
      // 3. 포스트 수를 못 찾은 경우 - 검색 결과로 대체
      if (totalPosts === 0) {
        console.log(`[BLOG-INDEX-EXTRACTOR] 프로필에서 포스트 수 못 찾음, 검색 API 시도...`);
        totalPosts = await this.getPostCountFromSearch(blogId);
      }
      
      // 4. 블로그 나이 추정 (기본값: 2년)
      let blogAgeYears = 2;
      
      // 포스트 수 기반 블로그 나이 추정
      if (totalPosts > 0) {
        // 평균 주 2회 포스팅 가정 → 연간 약 100개
        blogAgeYears = Math.max(1, Math.round(totalPosts / 100));
        blogAgeYears = Math.min(blogAgeYears, 15); // 최대 15년
      }
      
      // 5. 활동 상태 판단
      const isActive = totalPosts > 50; // 50개 이상이면 활발한 블로그로 간주
      
      return {
        totalPosts,
        blogName: pageStats.blogName,
        blogAge: `약 ${blogAgeYears}년`,
        blogAgeYears,
        isActive,
        visitorCount: pageStats.visitorCount
      };
      
    } catch (error: any) {
      console.error(`[BLOG-INDEX-EXTRACTOR] 통계 추출 오류:`, error.message);
      return null;
    }
  }
  
  /**
   * 네이버 검색으로 포스트 수 확인
   */
  private async getPostCountFromSearch(blogId: string): Promise<number> {
    let browser: Browser | null = null;
    let page: Page | null = null;
    
    try {
      browser = await this.getBrowser();
      page = await browser.newPage();
      
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // site: 검색으로 해당 블로그의 포스트 수 확인
      const searchUrl = `https://search.naver.com/search.naver?where=post&query=site:blog.naver.com/${blogId}`;
      
      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 20000 });
      await page.waitForTimeout(2000);
      
      const count = await page.evaluate(() => {
        // 검색 결과 수 찾기
        const countSelectors = [
          '.title_num', '.total_count', '.result_count',
          '[class*="count"]', '.search_result_count'
        ];
        
        for (const selector of countSelectors) {
          const el = document.querySelector(selector);
          if (el?.textContent) {
            const match = el.textContent.match(/(\d{1,3}(?:,\d{3})*)/);
            if (match && match[1]) {
              return parseInt(match[1].replace(/,/g, ''), 10);
            }
          }
        }
        
        // 검색 결과 항목 수로 대체 추정
        const items = document.querySelectorAll('.sh_blog_top, .api_subject_bx, [class*="blog_item"]');
        if (items.length > 0) {
          return items.length * 10; // 첫 페이지 결과 × 10으로 추정
        }
        
        return 0;
      });
      
      await page.close();
      
      console.log(`[BLOG-INDEX-EXTRACTOR] 검색 결과 포스트 수: ${count}`);
      return count;
      
    } catch (error: any) {
      console.error(`[BLOG-INDEX-EXTRACTOR] 검색 포스트 수 확인 실패:`, error.message);
      if (page) {
        try { await page.close(); } catch {}
      }
      return 0;
    }
  }
  
  /**
   * 빠른 블로그 지수 추정 (Puppeteer 없이)
   * 블로그 ID만으로 기본 추정치 반환
   */
  async quickEstimate(blogId: string): Promise<AccurateBlogIndexResult> {
    console.log(`[BLOG-INDEX-EXTRACTOR] 빠른 추정: ${blogId}`);
    
    // 기본 추정값 (평균적인 블로그)
    const defaultIndex = 15000;
    
    return {
      blogIndex: defaultIndex,
      confidence: 30, // 낮은 신뢰도
      source: 'estimated',
      stats: {
        totalPosts: undefined,
        blogAge: undefined,
        blogAgeYears: undefined,
        recentActivity: '알 수 없음'
      },
      methods: {},
      timestamp: new Date()
    };
  }
}

// 싱글톤 인스턴스
let extractorInstance: AccurateBlogIndexExtractor | null = null;

export function getExtractorInstance(): AccurateBlogIndexExtractor {
  if (!extractorInstance) {
    extractorInstance = new AccurateBlogIndexExtractor();
  }
  return extractorInstance;
}
