/**
 * 다음(Daum) 실시간 트렌드 크롤러 (Playwright)
 *
 * 다음 검색 페이지의 "실시간 트렌드" 영역 크롤링
 * 셀렉터: ul.list_trend > li > a.link_trend[data-keyword]
 */

import { chromium, Browser } from 'playwright';
import { findSystemChrome } from './chrome-finder';

export interface DaumRealtimeKeyword {
  rank: number;
  keyword: string;
  source: string;
  timestamp: string;
}

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    const executablePath = findSystemChrome();
    browserInstance = await chromium.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
  }
  return browserInstance;
}

/**
 * 다음 실시간 트렌드 크롤링
 * 검색 페이지의 ul.list_trend에서 data-keyword 속성으로 키워드 추출
 */
export async function getDaumRealtimeKeywordsWithPuppeteer(limit: number = 10): Promise<DaumRealtimeKeyword[]> {
  let context: any = null;

  try {
    console.log('[DAUM-REALTIME] 실시간 트렌드 수집 시작');

    const browser = await getBrowser();
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    // 다음 검색 페이지 (아무 검색어로 접속하면 오른쪽에 실시간 트렌드 표시)
    await page.goto('https://search.daum.net/search?w=tot&q=test', {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });
    await page.waitForTimeout(2000);

    // ul.list_trend > li > a.link_trend 에서 data-keyword 추출
    const keywords = await page.evaluate((maxLimit: number) => {
      const items = document.querySelectorAll('ul.list_trend li a.link_trend');
      const result: Array<{ keyword: string; rank: number }> = [];

      items.forEach((a) => {
        if (result.length >= maxLimit) return;
        const keyword = a.getAttribute('data-keyword') || '';
        const rank = parseInt(a.getAttribute('data-rank') || '0', 10);

        if (keyword && keyword.length >= 2) {
          result.push({ keyword: keyword.trim(), rank: rank || result.length + 1 });
        }
      });

      return result;
    }, limit);

    const realtimeKeywords: DaumRealtimeKeyword[] = keywords
      .slice(0, limit)
      .map((item, index) => ({
        rank: item.rank || index + 1,
        keyword: item.keyword,
        source: 'daum',
        timestamp: new Date().toISOString()
      }));

    if (realtimeKeywords.length > 0) {
      console.log(`[DAUM-REALTIME] ✅ ${realtimeKeywords.length}개 수집 완료`);
      realtimeKeywords.forEach((k, i) => {
        console.log(`  ${i + 1}. ${k.keyword}`);
      });
    } else {
      console.warn('[DAUM-REALTIME] ⚠️ 실시간 트렌드를 찾을 수 없습니다');
    }

    return realtimeKeywords;

  } catch (error: any) {
    console.error('[DAUM-REALTIME] ❌ 수집 실패:', error.message);
    return [];
  } finally {
    if (context) {
      try { await context.close(); } catch { /* 무시 */ }
    }
  }
}
