/**
 * 블로그 지수 크롤러 (새 버전)
 * 키워드의 상위노출 블로그 5개를 추출하고, 각 블로그의 전체 지수를 파악
 */

import puppeteer, { Browser, Page } from 'puppeteer';

export interface TopBlogPost {
  rank: number; // 순위 (1~5)
  title: string; // 글 제목
  blogName: string; // 블로그 이름
  blogUrl: string; // 블로그 URL
  postUrl: string; // 글 URL
  postDate: string; // 작성일자 (YYYY-MM-DD)
  daysAgo: number; // 며칠 전
  
  // 블로그 상세 정보 (검증 가능한 지표만)
  totalPosts: number; // 블로그 전체 글 개수
  blogAge?: number; // 블로그 운영 기간 (일)
  blogAgeYears?: number; // 블로그 운영 연수
  recentPostingFrequency?: number; // 최근 포스팅 빈도 (일/글)
  averageComments?: number; // 평균 댓글 수
  averageLikes?: number; // 평균 공감 수
  
  // 블로그 지수 정보
  blogIndex: string; // 블로그 지수 (최적5 ~ 일반)
  blogIndexScore: number; // 블로그 지수 점수 (0~10)
}

export interface BlogAnalysisResult {
  keyword: string;
  topPosts: TopBlogPost[]; // 상위 5개 글
  averageBlogIndex: string; // 평균 블로그 지수
  averageDaysAgo: number; // 평균 작성일
  entryPossibility: number; // 진입 가능성 (0~100)
  competitionLevel: string; // 경쟁 강도
}

/**
 * 블로그 지수 계산 (검증 가능한 지표만 사용)
 */
function calculateBlogIndex(stats: {
  totalPosts: number;
  blogAgeYears?: number;
  recentPostingFrequency?: number;
  averageComments?: number;
  averageLikes?: number;
}): { index: string; score: number } {
  let score = 10;
  
  if (stats.totalPosts >= 1000) score -= 4;
  else if (stats.totalPosts >= 500) score -= 3;
  else if (stats.totalPosts >= 300) score -= 2;
  else if (stats.totalPosts >= 100) score -= 1;
  
  if (stats.blogAgeYears !== undefined && stats.blogAgeYears > 0) {
    if (stats.blogAgeYears >= 5) score -= 2;
    else if (stats.blogAgeYears >= 3) score -= 1.5;
    else if (stats.blogAgeYears >= 1) score -= 1;
  }
  
  if (stats.recentPostingFrequency !== undefined && stats.recentPostingFrequency > 0) {
    if (stats.recentPostingFrequency <= 1) score -= 2;
    else if (stats.recentPostingFrequency <= 2) score -= 1.5;
    else if (stats.recentPostingFrequency <= 7) score -= 1;
    else if (stats.recentPostingFrequency <= 14) score -= 0.5;
  }
  
  const totalEngagement = (stats.averageComments || 0) + (stats.averageLikes || 0);
  if (totalEngagement >= 100) score -= 2;
  else if (totalEngagement >= 50) score -= 1.5;
  else if (totalEngagement >= 10) score -= 1;
  else if (totalEngagement >= 5) score -= 0.5;
  
  score = Math.max(0, Math.min(10, score));
  
  if (score >= 9) return { index: '최적5', score };
  if (score >= 8) return { index: '최적4', score };
  if (score >= 7) return { index: '최적3', score };
  if (score >= 6.5) return { index: '최적2', score };
  if (score >= 6) return { index: '최적1', score };
  if (score >= 5) return { index: '준최5', score };
  if (score >= 4) return { index: '준최4', score };
  if (score >= 3) return { index: '준최3', score };
  if (score >= 2) return { index: '준최2', score };
  if (score >= 1) return { index: '준최1', score };
  return { index: '일반', score };
}

/**
 * 날짜 문자열을 파싱하여 daysAgo 계산
 */
function parseDate(dateStr: string): { date: string; daysAgo: number } {
  const now = new Date();
  
  if (dateStr.includes('시간 전')) {
    return { date: now.toISOString().split('T')[0], daysAgo: 0 };
  }
  
  if (dateStr.includes('일 전')) {
    const days = parseInt(dateStr);
    const date = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return { date: date.toISOString().split('T')[0], daysAgo: days };
  }
  
  if (dateStr.includes('주 전')) {
    const weeks = parseInt(dateStr);
    const days = weeks * 7;
    const date = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return { date: date.toISOString().split('T')[0], daysAgo: days };
  }
  
  if (dateStr.includes('개월 전')) {
    const months = parseInt(dateStr);
    const days = months * 30;
    const date = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return { date: date.toISOString().split('T')[0], daysAgo: days };
  }
  
  if (dateStr.match(/\d{4}\.\d{1,2}\.\d{1,2}/)) {
    const match = dateStr.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/);
    if (match) {
      const [_, year, month, day] = match;
      const postDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
      const daysAgo = Math.floor((now.getTime() - postDate.getTime()) / (24 * 60 * 60 * 1000));
      return { date: postDate.toISOString().split('T')[0], daysAgo };
    }
  }
  
  return { date: dateStr, daysAgo: 999 };
}

/**
 * 블로그 URL에서 검증 가능한 정보 추출
 */
async function getBlogStats(page: Page, blogUrl: string): Promise<{
  totalPosts: number;
  blogAge?: number;
  blogAgeYears?: number;
  recentPostingFrequency?: number;
  averageComments?: number;
  averageLikes?: number;
}> {
  try {
    console.log(`[BLOG-INDEX] 블로그 상세 정보 조회: ${blogUrl}`);
    
    if (!blogUrl || !blogUrl.includes('blog.naver.com')) {
      console.log(`[BLOG-INDEX] 유효하지 않은 블로그 URL: ${blogUrl}`);
      return { totalPosts: 0 };
    }
    
    await page.goto(blogUrl, { waitUntil: 'networkidle2', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1500));
    
    const stats = await page.evaluate(() => {
      const result: any = {
        totalPosts: 0,
        blogStartDate: null,
        recentPostDates: [],
        comments: [],
        likes: [],
      };
      
      // 🔥 업데이트된 포스트 수 셀렉터 (2024년)
      const postSelectors = [
        '.blog_post_num',
        '.pcol1', 
        '.blog_post_total', 
        '.category_list .num', 
        '.blog-menu .num', 
        '.category .num',
        '.blog_menu .count',
        '.blog_category .count',
        '.wrap_blog_title .cnt',
        '.area_blogmenu .count',
        'em.num',
        '.total_count',
        '.all_count',
        '[class*="postCount"]',
        '[class*="post_count"]',
      ];
      
      for (const selector of postSelectors) {
        const el = document.querySelector(selector);
        if (el && el.textContent) {
          const match = el.textContent.match(/(\d[\d,]*)/);
          if (match) {
            result.totalPosts = parseInt(match[1].replace(/,/g, ''));
            console.log(`[BLOG-INDEX] 셀렉터 "${selector}"에서 포스트 수 발견: ${result.totalPosts}`);
            break;
          }
        }
      }
      
      // 전체 텍스트에서 포스트 수 추출 시도
      if (!result.totalPosts) {
        const bodyText = document.body.textContent || '';
        const postPatterns = [
          /전체글\s*[:\s]*(\d[\d,]*)/,
          /전체\s*[:\s]*(\d[\d,]*)\s*개/,
          /포스트\s*[:\s]*(\d[\d,]*)/,
          /게시글\s*[:\s]*(\d[\d,]*)/,
          /글\s*[:\s]*(\d[\d,]*)\s*개/,
          /총\s*(\d[\d,]*)\s*개/,
        ];
        for (const pattern of postPatterns) {
          const match = bodyText.match(pattern);
          if (match) {
            result.totalPosts = parseInt(match[1].replace(/,/g, ''));
            console.log(`[BLOG-INDEX] 텍스트 패턴에서 포스트 수 발견: ${result.totalPosts}`);
            break;
          }
        }
      }
      
      // 카테고리 메뉴에서 전체 글 수 합산 시도
      if (!result.totalPosts) {
        const categoryItems = document.querySelectorAll('.blog_category li, .category_list li, .menu_list li');
        let total = 0;
        categoryItems.forEach((item) => {
          const countMatch = item.textContent?.match(/\((\d+)\)/);
          if (countMatch) {
            total += parseInt(countMatch[1]);
          }
        });
        if (total > 0) {
          result.totalPosts = total;
          console.log(`[BLOG-INDEX] 카테고리 합산에서 포스트 수 발견: ${result.totalPosts}`);
        }
      }
      
      // 최소값 보장 (블로그가 존재하면 최소 1개는 있을 것)
      if (result.totalPosts === 0) {
        const hasContent = document.querySelector('.post_ct, .se-main-container, .contents_style, article');
        if (hasContent) {
          result.totalPosts = 1;
          console.log(`[BLOG-INDEX] 컨텐츠 존재 확인, 최소값 1 설정`);
        }
      }
      
      return result;
    });
    
    console.log(`[BLOG-INDEX] 블로그 통계 결과: totalPosts=${stats.totalPosts}`);
    
    let blogAge: number | undefined;
    let blogAgeYears: number | undefined;
    
    if (stats.blogStartDate) {
      const startDate = new Date(stats.blogStartDate);
      const now = new Date();
      blogAge = Math.floor((now.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
      blogAgeYears = blogAge / 365;
    }
    
    return {
      totalPosts: stats.totalPosts,
      blogAge,
      blogAgeYears,
      recentPostingFrequency: undefined,
      averageComments: undefined,
      averageLikes: undefined,
    };
    
  } catch (error) {
    console.error(`[BLOG-INDEX] 블로그 통계 조회 실패:`, error);
    return { totalPosts: 0 };
  }
}

/**
 * 네이버 블로그 검색 결과에서 상위 5개 추출 및 각 블로그 지수 분석
 */
export async function crawlBlogIndex(keyword: string): Promise<BlogAnalysisResult> {
  console.log(`[BLOG-INDEX] 키워드 분석 시작: "${keyword}"`);
  
  let browser: Browser | undefined;
  
  try {
    // Chrome 경로 찾기
    const { findChromePath } = await import('./chrome-finder');
    const chromePath = findChromePath();
    console.log(`[BLOG-INDEX] Chrome 경로: ${chromePath || 'bundled'}`);
    
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: chromePath || undefined,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage', 
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ],
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });
    
    // 쿠키 수락 등 방해 요소 방지
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
    });
    
    const searchUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}&sm=tab_opt&nso=so%3Ar%2Cp%3Aall`;
    console.log(`[BLOG-INDEX] 검색 URL: ${searchUrl}`);
    
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    
    // 🔥 업데이트된 네이버 블로그 검색 셀렉터 (2024년)
    const topPostsRaw = await page.evaluate(() => {
      const posts: Array<{ title: string; blogName: string; blogUrl: string; postUrl: string; postDate: string }> = [];
      
      // 🔥 2024년 네이버 블로그 검색 결과 셀렉터 (다양한 버전 대응)
      const containerSelectors = [
        '.lst_view li',           // 새로운 리스트 형태
        '.api_ani_send',          // API 기반 결과
        '.bx',                    // 기존 형태
        '.view_wrap',             // 뷰 랩
        '.total_wrap',            // 전체 검색 랩
        '.sp_blog li',            // 블로그 리스트
        '#main_pack .bx',         // 메인팩 내부
        '.blog_list > li',        // 블로그 리스트
        'section.sc_new li.bx',   // 새 섹션 형태
        'ul.lst_view > li',       // 리스트 뷰
      ];
      
      let items: NodeListOf<Element> | null = null;
      let usedSelector = '';
      
      for (const selector of containerSelectors) {
        const found = document.querySelectorAll(selector);
        if (found && found.length > 0) {
          items = found;
          usedSelector = selector;
          console.log(`[BLOG-INDEX] 셀렉터 "${selector}": ${found.length}개 발견`);
          break;
        }
      }
      
      // 🔥 추가: 모든 a 태그 중 블로그 링크 찾기
      if (!items || items.length === 0) {
        const allLinks = document.querySelectorAll('a[href*="blog.naver.com"]');
        console.log(`[BLOG-INDEX] 블로그 링크 총 ${allLinks.length}개 발견`);
        
        const seenUrls = new Set<string>();
        allLinks.forEach((link) => {
          const href = (link as HTMLAnchorElement).href;
          if (href && href.includes('blog.naver.com') && !seenUrls.has(href) && posts.length < 10) {
            seenUrls.add(href);
            
            // 부모 요소에서 정보 추출
            const container = link.closest('li, .bx, .view_wrap, div[class*="blog"]') || link.parentElement;
            let title = link.textContent?.trim() || '';
            let blogName = '';
            let postDate = '';
            
            if (container) {
              // 제목 찾기
              const titleEl = container.querySelector('.title_link, .api_txt_lines, .total_tit, .tit, a.title') as HTMLElement;
              if (titleEl) title = titleEl.textContent?.trim() || title;
              
              // 블로그명 찾기
              const nameEl = container.querySelector('.name, .sub_txt, .source, .source_txt, .blog_name, .user_info') as HTMLElement;
              if (nameEl) blogName = nameEl.textContent?.trim() || '';
              
              // 날짜 찾기
              const dateEl = container.querySelector('.sub_time, .txt_inline, .date, .time, .sub_info') as HTMLElement;
              if (dateEl) postDate = dateEl.textContent?.trim() || '';
            }
            
            // 블로그 URL 추출
            const blogUrlMatch = href.match(/(https?:\/\/blog\.naver\.com\/[^\/\?]+)/);
            const blogUrl = blogUrlMatch ? blogUrlMatch[1] : '';
            
            if (title.length > 2) {
              posts.push({
                title: title.substring(0, 100),
                blogName: blogName || '블로그',
                blogUrl: blogUrl,
                postUrl: href,
                postDate: postDate,
              });
            }
          }
        });
      } else {
        // 기존 컨테이너 기반 추출 (상위 10개)
        for (let i = 0; i < Math.min(10, items.length); i++) {
          const item = items[i];
          try {
            // 🔥 업데이트된 셀렉터들
            const titleSelectors = ['.title_link', '.api_txt_lines', '.total_tit', '.tit', 'a.title', '.title'];
            const blogSelectors = ['.name', '.sub_txt', '.source_txt', '.source', '.blog_name', '.user_info'];
            const dateSelectors = ['.sub_time', '.txt_inline', '.date', '.time', '.sub_info'];
            const linkSelectors = ['a.title_link', 'a.api_txt_lines', 'a[href*="blog.naver.com"]'];
            
            let titleEl: Element | null = null;
            let blogEl: Element | null = null;
            let dateEl: Element | null = null;
            let linkEl: Element | null = null;
            
            for (const sel of titleSelectors) {
              titleEl = item.querySelector(sel);
              if (titleEl && titleEl.textContent?.trim()) break;
            }
            
            for (const sel of blogSelectors) {
              blogEl = item.querySelector(sel);
              if (blogEl && blogEl.textContent?.trim()) break;
            }
            
            for (const sel of dateSelectors) {
              dateEl = item.querySelector(sel);
              if (dateEl && dateEl.textContent?.trim()) break;
            }
            
            for (const sel of linkSelectors) {
              linkEl = item.querySelector(sel);
              if (linkEl) break;
            }
            
            const postUrl = linkEl ? (linkEl as HTMLAnchorElement).href : '';
            const blogUrlMatch = postUrl.match(/(https?:\/\/blog\.naver\.com\/[^\/\?]+)/);
            const blogUrl = blogUrlMatch ? blogUrlMatch[1] : '';
            
            if (titleEl && titleEl.textContent) {
              posts.push({
                title: titleEl.textContent.trim().substring(0, 100),
                blogName: blogEl?.textContent?.trim() || '블로그',
                blogUrl: blogUrl,
                postUrl: postUrl,
                postDate: dateEl?.textContent?.trim() || '',
              });
            }
          } catch (e) {
            console.log(`[BLOG-INDEX] 아이템 ${i} 파싱 오류`);
          }
        }
      }
      
      console.log(`[BLOG-INDEX] 최종 추출된 포스트: ${posts.length}개`);
      return posts;
    });
    
    console.log(`[BLOG-INDEX] 추출된 포스트 수: ${topPostsRaw.length}개`);
    
    const topPosts: TopBlogPost[] = [];
    
    for (let i = 0; i < topPostsRaw.length; i++) {
      const rawPost = topPostsRaw[i];
      const { date, daysAgo } = parseDate(rawPost.postDate);
      
      let stats = { totalPosts: 0 };
      if (rawPost.blogUrl) {
        stats = await getBlogStats(page, rawPost.blogUrl);
      }
      
      const { index: blogIndex, score: blogIndexScore } = calculateBlogIndex(stats);
      
      topPosts.push({
        rank: i + 1,
        title: rawPost.title,
        blogName: rawPost.blogName,
        blogUrl: rawPost.blogUrl,
        postUrl: rawPost.postUrl,
        postDate: date,
        daysAgo,
        totalPosts: stats.totalPosts,
        blogIndex,
        blogIndexScore,
      });
    }
    
    const avgScore = topPosts.length > 0 ? topPosts.reduce((sum, p) => sum + p.blogIndexScore, 0) / topPosts.length : 0;
    const avgDaysAgo = topPosts.length > 0 ? Math.round(topPosts.reduce((sum, p) => sum + p.daysAgo, 0) / topPosts.length) : 999;
    
    let averageBlogIndex = '일반';
    if (avgScore >= 9.5) averageBlogIndex = '최적5';
    else if (avgScore >= 9) averageBlogIndex = '최적4';
    else if (avgScore >= 8) averageBlogIndex = '최적3';
    else if (avgScore >= 7) averageBlogIndex = '준최5';
    else if (avgScore >= 6) averageBlogIndex = '준최4';
    else if (avgScore >= 5) averageBlogIndex = '준최3';
    
    let competitionLevel = '매우 높음';
    if (avgScore >= 9 && avgDaysAgo > 30) competitionLevel = '매우 낮음';
    else if (avgScore >= 8 && avgDaysAgo > 14) competitionLevel = '낮음';
    else if (avgScore >= 6) competitionLevel = '보통';
    else if (avgScore >= 4) competitionLevel = '높음';
    
    const indexWeight = avgScore * 7;
    const recencyWeight = avgDaysAgo > 30 ? 30 : avgDaysAgo > 7 ? 20 : 10;
    const entryPossibility = Math.max(0, Math.min(100, Math.round(indexWeight + recencyWeight)));
    
    return {
      keyword,
      topPosts,
      averageBlogIndex,
      averageDaysAgo: avgDaysAgo,
      entryPossibility,
      competitionLevel,
    };
    
  } catch (error: any) {
    console.error(`[BLOG-INDEX] 크롤링 오류:`, error.message);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * 여러 키워드 일괄 조회
 */
export async function crawlMultipleBlogIndex(
  keywords: string[],
  onProgress?: (current: number, total: number) => void
): Promise<BlogAnalysisResult[]> {
  const results: BlogAnalysisResult[] = [];
  
  for (let i = 0; i < keywords.length; i++) {
    try {
      const result = await crawlBlogIndex(keywords[i]);
      results.push(result);
      
      if (onProgress) {
        onProgress(i + 1, keywords.length);
      }
      
      if (i < keywords.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`[BLOG-INDEX] "${keywords[i]}" 분석 실패:`, error);
    }
  }
  
  return results;
}
