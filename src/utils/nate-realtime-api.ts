/**
 * 네이트(Nate) 실시간 이슈 키워드 크롤러
 * 
 * 네이트 메일 페이지의 "실시간 이슈 키워드" 10개를 크롤링합니다.
 * mail3.nate.com 페이지에서 10개 전체가 표시됩니다.
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, Page } from 'puppeteer';
import * as fs from 'fs';

puppeteer.use(StealthPlugin());

export interface NateRealtimeKeyword {
  rank: number;
  keyword: string;
  change?: 'up' | 'down' | 'new' | 'stable';
  changeAmount?: number;
  source: string;
  timestamp: string;
}

// 중앙화된 Chrome 찾기 사용
import { getPuppeteerLaunchOptions } from './chrome-finder';

// 브라우저 재사용
let browserInstance: Browser | null = null;
let browserLastUsed = 0;
const BROWSER_TIMEOUT = 60000;

async function getBrowser(): Promise<Browser> {
  const now = Date.now();
  
  if (browserInstance && (now - browserLastUsed) < BROWSER_TIMEOUT) {
    browserLastUsed = now;
    return browserInstance;
  }
  
  if (browserInstance) {
    try { await browserInstance.close(); } catch { /* ignore */ }
  }
  
  const launchOptions = getPuppeteerLaunchOptions({ headless: 'new' });
  
  browserInstance = await puppeteer.launch(launchOptions) as Browser;
  
  browserLastUsed = now;
  return browserInstance;
}

/**
 * 키워드에서 변화 상태 텍스트 제거하고 정제
 */
function cleanKeyword(rawText: string): { keyword: string; change?: 'up' | 'down' | 'new' | 'stable'; changeAmount?: number } {
  let text = rawText.trim();
  let change: 'up' | 'down' | 'new' | 'stable' | undefined;
  let changeAmount: number | undefined;
  
  // 순위 제거 (앞의 숫자)
  text = text.replace(/^\d+\s*/, '');
  
  // "NEW" 처리
  if (/NEW/i.test(text)) {
    change = 'new';
    text = text.replace(/NEW/gi, '').trim();
  }
  
  // "동일" / "-" 처리 (stable)
  if (/\s+동일$/.test(text) || /\s+-$/.test(text)) {
    change = 'stable';
    text = text.replace(/\s+(동일|-)$/, '').trim();
  }
  
  // "▲N" / "상승 N" 처리
  const upMatch = text.match(/[▲△]\s*(\d*)|상승\s*(\d*)/);
  if (upMatch) {
    change = 'up';
    changeAmount = parseInt(upMatch[1] || upMatch[2]) || undefined;
    text = text.replace(/[▲△]\s*\d*|상승\s*\d*/g, '').trim();
  }
  
  // "▼N" / "하락 N" 처리
  const downMatch = text.match(/[▼▽]\s*(\d*)|하락\s*(\d*)/);
  if (downMatch) {
    change = 'down';
    changeAmount = parseInt(downMatch[1] || downMatch[2]) || undefined;
    text = text.replace(/[▼▽]\s*\d*|하락\s*\d*/g, '').trim();
  }
  
  // 추가 정제
  text = text.replace(/\s+\d+$/, '').trim();
  text = text.replace(/\s+/g, ' ').trim();
  
  return { keyword: text, change, changeAmount };
}

/**
 * 네이트 실시간 이슈 키워드 크롤링 (Puppeteer)
 * mail3.nate.com 또는 www.nate.com에서 크롤링
 */
export async function getNateRealtimeKeywordsWithPuppeteer(limit: number = 10): Promise<NateRealtimeKeyword[]> {
  console.log('[NATE-REALTIME] ========== 네이트 실시간 이슈 키워드 수집 시작 ==========');
  
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  try {
    page.setDefaultTimeout(20000);
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });
    
    // 리소스 차단 (속도 향상)
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    // 1차 시도: 네이트 메인 페이지
    console.log('[NATE-REALTIME] 네이트 메인 페이지 로딩...');
    await page.goto('https://www.nate.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 실시간 이슈 키워드 추출
    let rawKeywords = await extractKeywords(page);
    
    // 10개 미만이면 mail3.nate.com 시도 (로그인 페이지지만 위젯은 표시될 수 있음)
    if (rawKeywords.length < 10) {
      console.log(`[NATE-REALTIME] 메인에서 ${rawKeywords.length}개만 수집, 다른 페이지 시도...`);
      
      try {
        await page.goto('https://mail3.nate.com/', {
          waitUntil: 'domcontentloaded',
          timeout: 15000
        });
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const moreKeywords = await extractKeywords(page);
        if (moreKeywords.length > rawKeywords.length) {
          rawKeywords = moreKeywords;
          console.log(`[NATE-REALTIME] mail3.nate.com에서 ${rawKeywords.length}개 수집`);
        }
      } catch (e) {
        console.log('[NATE-REALTIME] mail3.nate.com 접근 실패, 메인 결과 사용');
      }
    }
    
    // 키워드 정제
    const cleanedKeywords: NateRealtimeKeyword[] = [];
    
    for (const raw of rawKeywords) {
      const { keyword, change, changeAmount } = cleanKeyword(raw);
      
      if (!keyword || keyword.length < 2) continue;
      if (cleanedKeywords.find(k => k.keyword === keyword)) continue;
      
      // 광고/UI 필터링
      const filterPatterns = [
        /^더보기$/, /^전체$/, /^검색$/, /^뉴스$/, /^메일$/, /^NOW$/, /^홈$/,
        /보험$/, /대출$/, /변호사/, /창업$/, /학원$/, /병원$/, /^로그인$/
      ];
      if (filterPatterns.some(p => p.test(keyword))) continue;
      
      cleanedKeywords.push({
        rank: cleanedKeywords.length + 1,
        keyword,
        change,
        changeAmount,
        source: 'nate',
        timestamp: new Date().toISOString()
      });
      
      if (cleanedKeywords.length >= limit) break;
    }
    
    console.log(`[NATE-REALTIME] ✅ ${cleanedKeywords.length}개 실시간 이슈 키워드 수집 완료:`);
    cleanedKeywords.forEach(k => {
      const changeText = k.change === 'up' ? `▲${k.changeAmount || ''}` :
                        k.change === 'down' ? `▼${k.changeAmount || ''}` :
                        k.change === 'new' ? 'NEW' : '-';
      console.log(`[NATE-REALTIME]   ${k.rank}. ${k.keyword} (${changeText})`);
    });
    
    return cleanedKeywords;
    
  } catch (error: any) {
    console.error('[NATE-REALTIME] ❌ 크롤링 오류:', error.message);
    return [];
  } finally {
    await page.close();
  }
}

/**
 * 페이지에서 실시간 이슈 키워드 추출
 */
async function extractKeywords(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const results: string[] = [];
    
    // 방법 1: "실시간 이슈 키워드" 제목 근처의 리스트 찾기
    const allElements = document.querySelectorAll('*');
    let issueSection: Element | null = null;
    
    allElements.forEach(el => {
      const text = el.textContent?.trim() || '';
      if (text === '실시간 이슈 키워드') {
        issueSection = el;
      }
    });
    
    if (issueSection) {
      let parent: Element | null = issueSection;
      for (let i = 0; i < 15 && parent; i++) {
        // ol, ul 리스트 찾기
        const lists = parent.querySelectorAll('ol, ul');
        lists.forEach(list => {
          const items = list.querySelectorAll('li');
          items.forEach(li => {
            const link = li.querySelector('a');
            let text = link?.textContent?.trim() || li.textContent?.trim() || '';
            if (text && text.length >= 2 && !results.includes(text)) {
              results.push(text);
            }
          });
        });
        
        // 테이블에서 찾기
        const rows = parent.querySelectorAll('tr, div[class*="item"], div[class*="keyword"]');
        rows.forEach(row => {
          const link = row.querySelector('a');
          let text = link?.textContent?.trim() || row.textContent?.trim() || '';
          if (text && text.length >= 2 && text.length <= 100 && !results.includes(text)) {
            // 순위 패턴 확인
            if (/^\d+\s+/.test(text) || /NEW|▲|▼|동일/.test(text)) {
              results.push(text);
            }
          }
        });
        
        if (results.length >= 10) break;
        parent = parent.parentElement;
      }
    }
    
    // 방법 2: 링크에서 직접 찾기 (search.nate.com 링크)
    if (results.length < 10) {
      const searchLinks = document.querySelectorAll('a[href*="search.nate.com"]');
      searchLinks.forEach(link => {
        const text = link.textContent?.trim() || '';
        if (text && text.length >= 2 && text.length <= 50) {
          if (!results.includes(text) && !['더보기', '검색', '전체'].includes(text)) {
            results.push(text);
          }
        }
      });
    }
    
    // 방법 3: 순위 패턴이 있는 모든 요소 찾기
    if (results.length < 10) {
      const allLi = document.querySelectorAll('li');
      allLi.forEach(li => {
        const text = li.textContent?.trim() || '';
        // "1 김지미 -" 또는 "2 안창호 위원장 ▲1" 패턴
        if (/^\d+\s+.+\s+(NEW|▲|▼|-)/.test(text)) {
          if (!results.includes(text)) {
            results.push(text);
          }
        }
      });
    }
    
    return results.slice(0, 15); // 충분히 수집 후 나중에 필터링
  });
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    try { await browserInstance.close(); } catch { /* ignore */ }
    browserInstance = null;
  }
}
