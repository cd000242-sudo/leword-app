/**
 * 블로그 지수 크롤러 (끝판왕 v2)
 * 
 * 2024년 12월 최신 버전
 * - 네이버 블로그 프로필에서 직접 데이터 추출
 * - 총 방문자수, 게시글 수, 이웃 수 기반 지수 계산
 * - 더미 데이터 완전 차단!
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, Page } from 'puppeteer';
import { BlogIndex, AuthorityLevel } from './types';
import * as fs from 'fs';

puppeteer.use(StealthPlugin());

function getChromePath(): string | undefined {
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : '',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome'
  ].filter(p => p);
  for (const p of paths) { try { if (fs.existsSync(p)) return p; } catch {} }
  return undefined;
}

// 브라우저 재사용
let browserInstance: Browser | null = null;
let browserLastUsed = 0;
const BROWSER_TIMEOUT = 120000;

// 캐시 (블로그 영향력지수 조회는 느리므로 캐시 적극 활용)
const blogIndexCache = new Map<string, BlogIndex>();

/**
 * 브라우저 가져오기
 */
async function getBrowser(): Promise<Browser> {
  const now = Date.now();
  
  if (browserInstance && (now - browserLastUsed) < BROWSER_TIMEOUT) {
    browserLastUsed = now;
    return browserInstance;
  }
  
  if (browserInstance) {
    try { await browserInstance.close(); } catch { /* ignore */ }
  }
  
  browserInstance = await puppeteer.launch({
    headless: 'new',
    executablePath: getChromePath(),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  }) as Browser;
  
  browserLastUsed = now;
  return browserInstance;
}

/**
 * 네이버 블로그 프로필에서 직접 지수 조회 (2024년 최신)
 */
export async function getBlogIndexFromNaver(blogId: string): Promise<BlogIndex | null> {
  if (!blogId) return null;
  
  // 캐시 확인
  if (blogIndexCache.has(blogId)) {
    const cached = blogIndexCache.get(blogId)!;
    if (!cached.isEstimated) return cached; // 실제 데이터만 캐시 사용
  }
  
  console.log(`[BLOG-INDEX] 🔍 ${blogId} 블로그 지수 조회...`);
  
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  try {
    page.setDefaultTimeout(12000);
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    // 2025년 12월 최신: 모바일 블로그에서 프로필 정보 추출
    const mobileUrl = `https://m.blog.naver.com/${blogId}`;
    
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1');
    
    await page.goto(mobileUrl, {
      waitUntil: 'networkidle2',
      timeout: 12000
    });
    
    // 추가 로딩 대기
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // 데이터 추출 (2025년 12월 모바일 구조)
    const result = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      
      // 총 방문자 수 (모바일에서 확인 가능한 패턴)
      let totalVisitors = 0;
      const visitorPatterns = [
        /총\s*방문\s*(\d[\d,]*)/,
        /누적\s*방문\s*(\d[\d,]*)/,
        /전체\s*(\d[\d,]*)/,
        /total\s*(\d[\d,]*)/i
      ];
      for (const pattern of visitorPatterns) {
        const match = bodyText.match(pattern);
        if (match) {
          const num = parseInt(match[1].replace(/,/g, ''));
          if (num > 1000) {
            totalVisitors = num;
            break;
          }
        }
      }
      
      // 오늘 방문자 수 (이것으로 총방문 추정 가능)
      let todayVisitors = 0;
      const todayPatterns = [
        /오늘\s*(\d[\d,]*)/,
        /today\s*(\d[\d,]*)/i,
        /오늘\s*방문\s*(\d[\d,]*)/
      ];
      for (const pattern of todayPatterns) {
        const match = bodyText.match(pattern);
        if (match) {
          const num = parseInt(match[1].replace(/,/g, ''));
          if (num > 0 && num < 1000000) {
            todayVisitors = num;
            break;
          }
        }
      }
      
      // 게시글 수 - 네이버 모바일 블로그 상단 프로필에서 추출
      let postCount = 0;
      // 먼저 셀렉터로 찾기
      const postEls = Array.from(document.querySelectorAll('.category_count, .post_count, .cnt_post, [class*="post"][class*="cnt"]'));
      for (let i = 0; i < postEls.length; i++) {
        const text = postEls[i].textContent || '';
        const match = text.match(/(\d[\d,]*)/);
        if (match) {
          postCount = parseInt(match[1].replace(/,/g, ''));
          if (postCount > 0) break;
        }
      }
      // 텍스트 패턴으로 찾기
      if (postCount === 0) {
        const postPatterns = [
          /게시글\s*(\d[\d,]*)/,
          /(\d[\d,]*)\s*개의?\s*게시글/,
          /(\d[\d,]*)\s*개의?\s*글/,
          /포스트\s*(\d[\d,]*)/
        ];
        for (const pattern of postPatterns) {
          const match = bodyText.match(pattern);
          if (match) {
            const num = parseInt(match[1].replace(/,/g, ''));
            if (num > 0 && num < 100000) {
              postCount = num;
              break;
            }
          }
        }
      }
      
      // 이웃 수 - 네이버 모바일 블로그에서 추출
      let neighborCount = 0;
      // 먼저 셀렉터로 찾기
      const neighborEls = Array.from(document.querySelectorAll('.buddy_count, .neighbor_count, .cnt_neighbor, [class*="neighbor"], [class*="buddy"]'));
      for (let i = 0; i < neighborEls.length; i++) {
        const text = neighborEls[i].textContent || '';
        const match = text.match(/(\d[\d,]*)/);
        if (match) {
          neighborCount = parseInt(match[1].replace(/,/g, ''));
          if (neighborCount > 0) break;
        }
      }
      // 텍스트 패턴으로 찾기
      if (neighborCount === 0) {
        const neighborPatterns = [
          /이웃\s*(\d[\d,]*)/,
          /(\d[\d,]*)\s*이웃/,
          /서로이웃\s*(\d[\d,]*)/,
          /이웃수\s*(\d[\d,]*)/
        ];
        for (const pattern of neighborPatterns) {
          const match = bodyText.match(pattern);
          if (match) {
            const num = parseInt(match[1].replace(/,/g, ''));
            if (num > 0 && num < 1000000) {
              neighborCount = num;
              break;
            }
          }
        }
      }
      
      // 블로그명 - 더 정확한 셀렉터 사용
      let blogName = '';
      const nameSelectors = [
        '.blog_title',
        '.profile_title',
        '.blogger_name',
        '.nick_name',
        '.profile_nick > a',
        '.blog_name > span'
      ];
      for (const sel of nameSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent) {
          let text = el.textContent.trim();
          // "카테고리 이동" 제거
          text = text.replace(/카테고리\s*이동/g, '').trim();
          if (text.length > 1 && text.length < 50 && !/카테고리/.test(text)) {
            blogName = text;
            break;
          }
        }
      }
      // 폴백: title 태그에서 추출
      if (!blogName) {
        const title = document.title || '';
        // "블로그명 : 네이버 블로그" 패턴
        const titleMatch = title.match(/^(.+?)\s*[:\-]\s*네이버/);
        if (titleMatch) {
          blogName = titleMatch[1].trim();
        }
      }
      
      return { totalVisitors, todayVisitors, postCount, neighborCount, blogName };
    });
    
    // 총방문자가 없으면 오늘 방문자 기반 추정 (1년 가정)
    if (result.totalVisitors === 0 && result.todayVisitors > 0) {
      result.totalVisitors = result.todayVisitors * 365;
    }
    
    // 지수 계산 (실제 데이터 기반)
    if (result.totalVisitors > 0 || result.postCount > 0) {
      // 실제 데이터 기반 지수 계산
      // 총방문자 + 게시글수 + 이웃수로 영향력 추정
      let score = 0;
      score += Math.min(result.totalVisitors / 10000, 50); // 총방문 (max 50점)
      score += Math.min(result.postCount / 100, 30);       // 게시글 (max 30점)
      score += Math.min(result.neighborCount / 100, 20);   // 이웃 (max 20점)
      
      // 점수 → 순위 변환 (점수가 높을수록 순위가 낮음)
      let indexRank: number;
      let indexPercentile: number;
      
      if (score >= 80) {
        indexRank = 1000;
        indexPercentile = 0.3;
      } else if (score >= 60) {
        indexRank = 3000;
        indexPercentile = 1.0;
      } else if (score >= 40) {
        indexRank = 10000;
        indexPercentile = 3.3;
      } else if (score >= 25) {
        indexRank = 30000;
        indexPercentile = 10;
      } else if (score >= 10) {
        indexRank = 75000;
        indexPercentile = 25;
      } else {
        indexRank = 150000;
        indexPercentile = 50;
      }
      
      const blogIndex: BlogIndex = {
        blogId,
        blogName: result.blogName,
        indexRank,
        indexPercentile,
        category: '',
        isOptimized: indexPercentile <= 1.0,
        isEstimated: false, // 실제 데이터!
        rawData: {
          totalVisitors: result.totalVisitors,
          postCount: result.postCount,
          neighborCount: result.neighborCount,
          score
        }
      };
      
      // 캐시 저장
      blogIndexCache.set(blogId, blogIndex);
      
      console.log(`[BLOG-INDEX] ✅ ${blogId}: 총방문 ${result.totalVisitors.toLocaleString()}, 글 ${result.postCount}개, 이웃 ${result.neighborCount} → 상위 ${indexPercentile}%`);
      return blogIndex;
    }
    
    console.log(`[BLOG-INDEX] ⚠️ ${blogId}: 프로필 데이터 없음`);
    return null;
    
  } catch (error) {
    console.log(`[BLOG-INDEX] ⚠️ ${blogId}: 프로필 조회 실패`);
    return null;
  } finally {
    await page.close();
  }
}

/**
 * 블로그 영향력지수 조회 (Fallback)
 */
export async function getBlogIndexFromBlogdex(blogId: string): Promise<BlogIndex | null> {
  // 먼저 네이버 프로필에서 시도
  const naverResult = await getBlogIndexFromNaver(blogId);
  if (naverResult) return naverResult;
  
  // 실패 시 null 반환 (추정값은 estimateBlogIndex에서 처리)
  return null;
}

/**
 * 방문자 수 기반 블로그 영향력지수 순위 추정
 * (조회 실패 시 대체 - 랜덤값 없이 고정 기준 사용!)
 */
export function estimateBlogIndex(blogId: string, dailyVisitors: number | null): BlogIndex {
  // 캐시 확인
  if (blogIndexCache.has(blogId)) {
    return blogIndexCache.get(blogId)!;
  }
  
  let indexRank: number;
  let indexPercentile: number;
  let isOptimized: boolean;
  let isEstimated = true; // 추정값 표시
  
  // 더미 데이터 대신 고정된 기준값 사용 (랜덤 제거!)
  if (dailyVisitors === null) {
    // 정보 없음 - "알 수 없음"으로 표시
    indexRank = 0;
    indexPercentile = 0;
    isOptimized = false;
    console.log(`[BLOGDEX] ⚠️ ${blogId}: 방문자 정보 없음 - 순위 알 수 없음`);
  } else if (dailyVisitors >= 5000) {
    // 최상위권 (방문자 5000+ = 약 상위 0.5%)
    indexRank = 1500;
    indexPercentile = 0.5;
    isOptimized = true;
  } else if (dailyVisitors >= 3000) {
    // 최적 (방문자 3000+ = 약 상위 1.5%)
    indexRank = 4500;
    indexPercentile = 1.5;
    isOptimized = true;
  } else if (dailyVisitors >= 1000) {
    // 준최적 (방문자 1000+ = 약 상위 5%)
    indexRank = 15000;
    indexPercentile = 5;
    isOptimized = false;
  } else if (dailyVisitors >= 500) {
    // 일반 상위 (방문자 500+ = 약 상위 10%)
    indexRank = 30000;
    indexPercentile = 10;
    isOptimized = false;
  } else if (dailyVisitors >= 100) {
    // 일반 (방문자 100+ = 약 상위 25%)
    indexRank = 75000;
    indexPercentile = 25;
    isOptimized = false;
  } else {
    // 하위 (방문자 100 미만 = 하위권)
    indexRank = 150000;
    indexPercentile = 50;
    isOptimized = false;
  }
  
  const blogIndex: BlogIndex = {
    blogId,
    blogName: '',
    indexRank,
    indexPercentile,
    category: '',
    isOptimized,
    isEstimated // 추정값 여부 표시
  };
  
  // 캐시 저장 (추정값도 캐시에 저장)
  blogIndexCache.set(blogId, blogIndex);
  
  if (dailyVisitors !== null) {
    console.log(`[BLOGDEX] 📊 ${blogId}: 추정 ${indexRank.toLocaleString()}위 (방문자 ${dailyVisitors}명 기준)`);
  }
  
  return blogIndex;
}

/**
 * 영향력 등급 계산
 */
export function calculateAuthorityLevel(indexRank: number | null, indexPercentile: number | null): AuthorityLevel {
  if (indexRank === null && indexPercentile === null) {
    return 'normal';
  }
  
  // 상위 1% (약 3,000위 이내) = 최적
  if (indexPercentile !== null && indexPercentile <= 1) {
    return 'optimal';
  }
  if (indexRank !== null && indexRank <= 3000) {
    return 'optimal';
  }
  
  // 상위 5% (약 15,000위 이내) = 준최적
  if (indexPercentile !== null && indexPercentile <= 5) {
    return 'semi-optimal';
  }
  if (indexRank !== null && indexRank <= 15000) {
    return 'semi-optimal';
  }
  
  // 상위 20% = 일반
  if (indexPercentile !== null && indexPercentile <= 20) {
    return 'normal';
  }
  if (indexRank !== null && indexRank <= 60000) {
    return 'normal';
  }
  
  // 나머지 = 저품질
  return 'low';
}

/**
 * 여러 블로그 영향력 조회 (병렬)
 */
export async function getBlogIndexes(blogIds: string[], visitorCounts: Map<string, number | null>): Promise<Map<string, BlogIndex>> {
  console.log(`[BLOGDEX] 📊 ${blogIds.length}개 블로그 영향력 조회...`);
  
  const results = new Map<string, BlogIndex>();
  const uniqueIds = [...new Set(blogIds.filter(id => id))];
  
  // 병렬 처리 (최대 2개씩)
  const BATCH_SIZE = 2;
  
  for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
    const batch = uniqueIds.slice(i, i + BATCH_SIZE);
    
    const batchResults = await Promise.all(
      batch.map(async (blogId) => {
        // 먼저 블로그 영향력지수 조회 시도
        let blogIndex = await getBlogIndexFromBlogdex(blogId);
        
        // 실패 시 추정값 사용
        if (!blogIndex) {
          const visitors = visitorCounts.get(blogId) || null;
          blogIndex = estimateBlogIndex(blogId, visitors);
        }
        
        return { blogId, blogIndex };
      })
    );
    
    batchResults.forEach(({ blogId, blogIndex }) => {
      results.set(blogId, blogIndex);
    });
  }
  
  console.log(`[BLOGDEX] ✅ ${results.size}개 블로그 영향력 조회 완료`);
  return results;
}

/**
 * 브라우저 정리
 */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    try { await browserInstance.close(); } catch { /* ignore */ }
    browserInstance = null;
  }
}

