/**
 * 블로그 방문자 수 크롤러 (끝판왕 v2)
 * 
 * 2024년 12월 최신 네이버 모바일 블로그 구조 대응
 * 병렬 처리로 빠르게 방문자 수 수집
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, Page } from 'puppeteer';
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
 * 블로그 ID 추출
 */
export function extractBlogId(url: string): string {
  const match = url.match(/blog\.naver\.com\/([^\/\?]+)/);
  return match ? match[1] : '';
}

/**
 * 단일 블로그 방문자 수 조회
 */
export async function getBlogVisitorCount(blogId: string): Promise<number | null> {
  if (!blogId) return null;
  
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  try {
    page.setDefaultTimeout(8000);
    
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1');
    
    // 모바일 블로그 접속 (방문자 수 표시됨)
    const mobileUrl = `https://m.blog.naver.com/${blogId}`;
    
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    await page.goto(mobileUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 8000
    });
    
    // 방문자 수 추출 (2024년 12월 최신 네이버 모바일 구조 대응)
    const visitorCount = await page.evaluate(() => {
      // 2024년 최신 네이버 모바일 블로그 셀렉터
      const selectors = [
        // 최신 모바일 블로그 구조
        '.blog_info_area .count',
        '.blog_info_area .visitor_count',
        '.profile_info .today',
        '.profile_area .count',
        // 프로필 영역
        '.blog_profile .visitor',
        '.profile_visitor .count',
        '.blogger_info .today_visit',
        // 구 버전 호환
        '.blog_visitor .count',
        '.visitor_count',
        '.today_cnt',
        '.blog_info .cnt',
        '[class*="visitor"] [class*="count"]',
        '[class*="today"][class*="visit"]',
        // 통계 영역
        '.stat_area .today',
        '.visitor_wrap .count'
      ];
      
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el) {
          const text = el.textContent || '';
          const numMatch = text.replace(/,/g, '').match(/\d+/);
          if (numMatch && parseInt(numMatch[0]) > 0) {
            return parseInt(numMatch[0]);
          }
        }
      }
      
      // 전체 페이지에서 방문자 패턴 찾기
      const bodyText = document.body.innerText;
      
      // "오늘 N" 또는 "오늘 방문 N" 패턴
      const patterns = [
        /오늘\s*방문\s*(\d[\d,]*)/,
        /오늘\s*(\d[\d,]*)/,
        /today\s*(\d[\d,]*)/i,
        /방문자\s*(\d[\d,]*)/,
        /일일\s*방문\s*(\d[\d,]*)/
      ];
      
      for (const pattern of patterns) {
        const match = bodyText.match(pattern);
        if (match) {
          const num = parseInt(match[1].replace(/,/g, ''));
          if (num > 0 && num < 1000000) { // 합리적인 범위
            return num;
          }
        }
      }
      
      return null;
    });
    
    console.log(`[VISITOR] ${blogId}: ${visitorCount || 'N/A'}`);
    return visitorCount;
    
  } catch (error) {
    console.log(`[VISITOR] ${blogId}: 조회 실패`);
    return null;
  } finally {
    await page.close();
  }
}

/**
 * 여러 블로그 방문자 수 병렬 조회
 */
export async function getBlogVisitorCounts(blogIds: string[]): Promise<Map<string, number | null>> {
  console.log(`[VISITOR] 📊 ${blogIds.length}개 블로그 방문자 수 조회...`);
  
  const results = new Map<string, number | null>();
  
  // 중복 제거
  const uniqueIds = [...new Set(blogIds.filter(id => id))];
  
  if (uniqueIds.length === 0) {
    return results;
  }
  
  // 병렬 처리 (최대 3개씩)
  const BATCH_SIZE = 3;
  
  for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
    const batch = uniqueIds.slice(i, i + BATCH_SIZE);
    
    const batchResults = await Promise.all(
      batch.map(async (blogId) => {
        const count = await getBlogVisitorCount(blogId);
        return { blogId, count };
      })
    );
    
    batchResults.forEach(({ blogId, count }) => {
      results.set(blogId, count);
    });
  }
  
  console.log(`[VISITOR] ✅ ${results.size}개 블로그 조회 완료`);
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
