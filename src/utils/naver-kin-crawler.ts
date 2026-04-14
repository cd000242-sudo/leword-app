/**
 * 🔍 네이버 지식인 숨은 꿀질문 크롤러 (자동 발굴)
 * 
 * 메인 페이지 "많이 본 Q&A" 수집 + 숨은 꿀질문 발굴
 * 
 * ⚠️ 100% 실제 크롤링 데이터 - 더미 데이터 절대 사용 안함!
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, Page } from 'puppeteer';
import * as fs from 'fs';

puppeteer.use(StealthPlugin());

// ============================================================
// 인터페이스 정의
// ============================================================

export interface KinQuestion {
  title: string;
  url: string;
  category: string;
  viewCount: number;        // 조회수
  answerCount: number;      // 답변수
  publishedDate: string;
  daysAgo: number;
  isExpertOnly: boolean;
  hasBlogLinks: boolean;
  blogLinkCount: number;    // 외부 링크 개수
  linkTypes: string;        // 링크 종류 (블로그, 카페, 유튜브 등)
  goldenScore: number;
  goldenReason: string;
  isHidden: boolean;
  isRealData: boolean;
  upCount: number;
}

export interface KinSearchResult {
  popularQuestions: KinQuestion[];
  hiddenGoldenQuestions: KinQuestion[];
  timestamp: string;
  stats: {
    totalFound: number;
    goldenCount: number;
    avgViewCount: number;
    avgAnswerCount: number;
  };
  categories: string[];
}

// ============================================================
// 브라우저 관리
// ============================================================

let browserInstance: Browser | null = null;

function getChromePath(): string | undefined {
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : '',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome'
  ].filter(p => p);
  
  for (const p of paths) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return undefined;
}

async function getBrowser(): Promise<Browser> {
  if (browserInstance) {
    try { await browserInstance.version(); return browserInstance; } catch { browserInstance = null; }
  }
  
  console.log('[KIN-CRAWLER] 🌐 브라우저 시작...');
  
  browserInstance = await puppeteer.launch({
    headless: 'new',
    executablePath: getChromePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--window-size=1920,1080']
  }) as Browser;
  
  return browserInstance;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) { try { await browserInstance.close(); } catch {} browserInstance = null; }
}

// ============================================================
// 카테고리 (숨은 꿀질문용)
// ============================================================

const CATEGORY_URLS = [
  { name: '컴퓨터/인터넷', dirId: '1' },
  { name: '게임', dirId: '2' },
  { name: '생활', dirId: '8' },
  { name: '쇼핑', dirId: '4' },
  { name: '건강', dirId: '7' },
];

// ============================================================
// 🔥 메인 페이지 "많이 본 Q&A" 수집 (조회수 포함!)
// ============================================================

export async function getPopularQuestions(limit: number = 20): Promise<KinQuestion[]> {
  console.log(`[KIN-CRAWLER] 📊 메인 페이지 "많이 본 Q&A" 수집 시작...`);
  
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  try {
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    await page.setRequestInterception(true);
    page.on('request', req => {
      if (['image', 'font', 'media'].includes(req.resourceType())) req.abort();
      else req.continue();
    });
    
    // 메인 페이지로 이동
    await page.goto('https://kin.naver.com/', { waitUntil: 'networkidle2', timeout: 20000 });
    await new Promise(r => setTimeout(r, 2000));
    
    // "많이 본 Q&A" 섹션에서 질문 추출
    const questions = await page.evaluate(() => {
      const items: any[] = [];
      
      // "많이 본 Q&A" 섹션 찾기
      const sections = document.querySelectorAll('div, section');
      let targetSection: Element | null = null;
      
      sections.forEach(sec => {
        const text = sec.textContent || '';
        if (text.includes('많이 본 Q&A') && sec.querySelector('a')) {
          targetSection = sec;
        }
      });
      
      // 질문 리스트 찾기 (ol 또는 ul)
      const lists = document.querySelectorAll('ol, ul');
      
      lists.forEach(list => {
        const listItems = list.querySelectorAll('li');
        
        listItems.forEach((li, idx) => {
          const text = li.textContent || '';
          
          // 조회수와 답변수가 있는 항목만
          const viewMatch = text.match(/조회수\s*([\d,]+)/);
          const answerMatch = text.match(/답변수\s*(\d+)/);
          
          if (!viewMatch) return;
          
          const viewCount = parseInt(viewMatch[1].replace(/,/g, '')) || 0;
          const answerCount = answerMatch ? parseInt(answerMatch[1]) : 0;
          
          // 링크 찾기
          const link = li.querySelector('a');
          if (!link) return;
          
          let url = link.getAttribute('href') || '';
          if (!url.startsWith('http')) {
            url = 'https://kin.naver.com' + url;
          }
          
          // 제목 추출 (링크 텍스트에서 조회수/답변수 제외)
          let title = link.textContent?.trim() || '';
          title = title.replace(/조회수\s*[\d,]+/g, '').replace(/답변수\s*\d+/g, '').trim();
          
          if (title && url && viewCount > 0) {
            items.push({
              title,
              url,
              viewCount,
              answerCount,
              category: '',
              publishedDate: '',
              daysAgo: 0
            });
          }
        });
      });
      
      // 다른 선택자 시도 (숫자 순위가 있는 리스트)
      if (items.length === 0) {
        document.querySelectorAll('[class*="popular"], [class*="best"], [class*="rank"]').forEach(sec => {
          sec.querySelectorAll('a').forEach(link => {
            const text = link.closest('li, div, tr')?.textContent || '';
            const viewMatch = text.match(/조회수\s*([\d,]+)/);
            const answerMatch = text.match(/답변수\s*(\d+)/);
            
            if (!viewMatch) return;
            
            let url = link.getAttribute('href') || '';
            if (!url.includes('qna/detail')) return;
            if (!url.startsWith('http')) url = 'https://kin.naver.com' + url;
            
            let title = link.textContent?.trim() || '';
            const viewCount = parseInt(viewMatch[1].replace(/,/g, '')) || 0;
            const answerCount = answerMatch ? parseInt(answerMatch[1]) : 0;
            
            if (title && viewCount > 0) {
              items.push({ title, url, viewCount, answerCount, category: '', publishedDate: '', daysAgo: 0 });
            }
          });
        });
      }
      
      // 마지막 시도: 모든 링크에서 조회수가 있는 것 찾기
      if (items.length === 0) {
        document.querySelectorAll('a[href*="qna/detail"]').forEach(link => {
          const parent = link.closest('li, div, tr');
          if (!parent) return;
          
          const text = parent.textContent || '';
          const viewMatch = text.match(/조회수\s*([\d,]+)/);
          const answerMatch = text.match(/답변수\s*(\d+)/);
          
          if (!viewMatch) return;
          
          let url = link.getAttribute('href') || '';
          if (!url.startsWith('http')) url = 'https://kin.naver.com' + url;
          
          let title = link.textContent?.trim() || '';
          title = title.replace(/조회수.*$/, '').replace(/답변수.*$/, '').trim();
          
          const viewCount = parseInt(viewMatch[1].replace(/,/g, '')) || 0;
          const answerCount = answerMatch ? parseInt(answerMatch[1]) : 0;
          
          if (title && title.length > 5 && viewCount > 0 && !items.some(i => i.url === url)) {
            items.push({ title, url, viewCount, answerCount, category: '', publishedDate: '', daysAgo: 0 });
          }
        });
      }
      
      return items;
    });
    
    console.log(`[KIN-CRAWLER] 📊 메인 페이지에서 ${questions.length}개 발견`);
    
    // 결과가 부족하면 "많이 본 질문" 페이지도 크롤링
    if (questions.length < limit) {
      console.log(`[KIN-CRAWLER] 📄 추가 페이지 크롤링...`);
      
      // 조회순 정렬 페이지
      await page.goto('https://kin.naver.com/qna/list.naver?dirId=0&sort=vcount', { waitUntil: 'networkidle2', timeout: 15000 });
      await new Promise(r => setTimeout(r, 1500));
      
      const moreQuestions = await page.evaluate(() => {
        const items: any[] = [];
        
        // 테이블에서 추출
        document.querySelectorAll('table tbody tr').forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length < 3) return;
          
          const link = cells[0]?.querySelector('a');
          if (!link) return;
          
          let url = link.getAttribute('href') || '';
          if (!url.startsWith('http')) url = 'https://kin.naver.com' + url;
          
          const title = link.textContent?.trim() || '';
          
          // 각 셀에서 숫자 추출
          let viewCount = 0;
          let answerCount = 0;
          
          cells.forEach((cell, idx) => {
            const text = cell.textContent?.replace(/[^0-9]/g, '') || '';
            const num = parseInt(text) || 0;
            
            if (idx === cells.length - 2) answerCount = num; // 답변수
            if (idx === cells.length - 1 || cell.textContent?.includes('조회')) {
              if (num > answerCount) viewCount = num;
            }
          });
          
          if (title && url) {
            items.push({ title, url, viewCount, answerCount, category: '', publishedDate: '', daysAgo: 0 });
          }
        });
        
        return items;
      });
      
      // 중복 제거하고 합치기
      const existingUrls = new Set(questions.map(q => q.url));
      moreQuestions.forEach(q => {
        if (!existingUrls.has(q.url)) {
          questions.push(q);
        }
      });
      
      console.log(`[KIN-CRAWLER] 📊 총 ${questions.length}개 수집`);
    }
    
    // 조회수순 정렬
    questions.sort((a, b) => b.viewCount - a.viewCount);
    
    // 결과 생성
    const result: KinQuestion[] = questions.slice(0, limit).map(q => ({
      ...q,
      upCount: 0,
      isExpertOnly: false,
      hasBlogLinks: false,
      blogLinkCount: 0,
      linkTypes: '',
      goldenScore: calculateGoldenScore(q.viewCount, q.answerCount, q.daysAgo, false, 0),
      goldenReason: generateGoldenReason(q),
      isHidden: false,
      isRealData: true
    }));
    
    console.log(`[KIN-CRAWLER] ✅ 많이 본 Q&A ${result.length}개 수집 완료 (조회수 포함!)`);
    return result;
    
  } catch (error: any) {
    console.error('[KIN-CRAWLER] ❌ 많이 본 Q&A 수집 실패:', error.message);
    return [];
  } finally {
    await page.close();
  }
}

// ============================================================
// 숨은 꿀질문 자동 발굴 (프리미엄)
// ============================================================

export async function findHiddenGoldenQuestions(options: {
  minViewCount?: number;
  maxAnswerCount?: number;
  limit?: number;
} = {}): Promise<KinQuestion[]> {
  const { minViewCount = 10, maxAnswerCount = 5, limit = 30 } = options;  // 조건 완화!
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[KIN-CRAWLER] 🔍 숨은 꿀질문 자동 발굴 시작!`);
  console.log(`  - 최소 조회수: ${minViewCount}`);
  console.log(`  - 최대 답변수: ${maxAnswerCount}`);
  console.log(`${'='.repeat(60)}\n`);
  
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  try {
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    await page.setRequestInterception(true);
    page.on('request', req => {
      if (['image', 'font', 'media'].includes(req.resourceType())) req.abort();
      else req.continue();
    });
    
    // 1단계: 많이 본 Q&A URL 수집 (제외할 목록)
    console.log('[KIN-CRAWLER] 📋 많이 본 Q&A 목록 확인 중...');
    
    await page.goto('https://kin.naver.com/', { waitUntil: 'networkidle2', timeout: 20000 });
    await new Promise(r => setTimeout(r, 1500));
    
    const popularUrls = await page.evaluate(() => {
      const urls = new Set<string>();
      document.querySelectorAll('a[href*="qna/detail"]').forEach(link => {
        let url = link.getAttribute('href') || '';
        if (!url.startsWith('http')) url = 'https://kin.naver.com' + url;
        urls.add(url);
      });
      return Array.from(urls);
    });
    
    const popularUrlSet = new Set(popularUrls);
    console.log(`[KIN-CRAWLER] 📊 많이 본 Q&A ${popularUrlSet.size}개 확인 (이건 제외)`);
    
    // 2단계: 각 카테고리에서 최신 질문 수집 후 조회수 확인
    const hiddenQuestions: KinQuestion[] = [];
    const processedUrls = new Set<string>();
    
    for (const cat of CATEGORY_URLS) {
      if (hiddenQuestions.length >= limit) break;
      
      console.log(`[KIN-CRAWLER] 📁 ${cat.name} 카테고리 크롤링...`);
      
      // 최신순으로 수집
      const url = `https://kin.naver.com/qna/list.naver?dirId=${cat.dirId}&sort=date`;
      
      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
        await new Promise(r => setTimeout(r, 1200));
        
        // 질문 URL 수집
        const questionUrls = await page.evaluate((popularList: string[]) => {
          const urls: string[] = [];
          const popularSet = new Set(popularList);
          
          document.querySelectorAll('a[href*="qna/detail"]').forEach(link => {
            let url = link.getAttribute('href') || '';
            if (!url.startsWith('http')) url = 'https://kin.naver.com' + url;
            
            // 많이 본 Q&A에 없는 것만 (숨은 질문!)
            if (!popularSet.has(url) && !urls.includes(url)) {
              urls.push(url);
            }
          });
          
          return urls.slice(0, 10); // 카테고리당 10개
        }, popularUrls);
        
        console.log(`[KIN-CRAWLER]   → ${cat.name}: ${questionUrls.length}개 후보`);
        
        // 각 질문 페이지 방문하여 조회수 확인
        for (const qUrl of questionUrls) {
          if (hiddenQuestions.length >= limit) break;
          if (processedUrls.has(qUrl)) continue;
          processedUrls.add(qUrl);
          
          try {
            await page.goto(qUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
            
            const qData = await page.evaluate(() => {
              const text = document.body.innerText || '';
              
              // 제목
              const titleEl = document.querySelector('h1, .title, [class*="title"]');
              const title = titleEl?.textContent?.trim() || '';
              
              // 조회수
              const viewMatch = text.match(/조회\s*([\d,]+)/);
              const viewCount = viewMatch ? parseInt(viewMatch[1].replace(/,/g, '')) : 0;
              
              // 답변수
              const answerMatch = text.match(/답변\s*(\d+)/);
              const answerCount = answerMatch ? parseInt(answerMatch[1]) : 0;
              
              // 답변 영역에서 모든 외부 링크 체크 (블로그, 카페, 외부사이트 등)
              const answerArea = document.querySelector('.answer_area, .answer_content, [class*="answer"]') || document.body;
              const allLinks = answerArea.querySelectorAll('a[href^="http"]');
              let externalLinkCount = 0;
              const linkTypes: string[] = [];
              
              allLinks.forEach(link => {
                const href = link.getAttribute('href') || '';
                // 네이버 지식인 내부 링크 제외
                if (href.includes('kin.naver.com')) return;
                
                externalLinkCount++;
                if (href.includes('blog.naver.com')) linkTypes.push('블로그');
                else if (href.includes('cafe.naver.com')) linkTypes.push('카페');
                else if (href.includes('youtube.com') || href.includes('youtu.be')) linkTypes.push('유튜브');
                else linkTypes.push('외부링크');
              });
              
              return {
                title: title.substring(0, 100),
                viewCount,
                answerCount,
                blogLinkCount: externalLinkCount,
                hasBlogLinks: externalLinkCount > 0,
                linkTypes: [...new Set(linkTypes)].join(', ')
              };
            });
            
            console.log(`[KIN-CRAWLER]     📊 조회:${qData.viewCount} 답변:${qData.answerCount} 제목:${qData.title.substring(0, 20)}...`);
            
            // 조건 체크: 조회수 높고, 답변수 적음
            if (qData.viewCount >= minViewCount && qData.answerCount <= maxAnswerCount) {
              console.log(`[KIN-CRAWLER]     ✅ 황금 발견! ${qData.linkTypes ? '링크:' + qData.linkTypes : '링크 없음'}`);
              
              hiddenQuestions.push({
                title: qData.title,
                url: qUrl,
                category: cat.name,
                viewCount: qData.viewCount,
                answerCount: qData.answerCount,
                upCount: 0,
                publishedDate: '',
                daysAgo: 0,
                isExpertOnly: false,
                hasBlogLinks: qData.hasBlogLinks,
                blogLinkCount: qData.blogLinkCount,
                linkTypes: qData.linkTypes || '',
                goldenScore: 0,
                goldenReason: '',
                isHidden: true,
                isRealData: true
              });
            }
            
          } catch {}
          
          await new Promise(r => setTimeout(r, 300));
        }
        
      } catch {}
      
      console.log(`[KIN-CRAWLER]   → ${cat.name}: 누적 ${hiddenQuestions.length}개 황금 질문`);
    }
    
    // 황금 점수 계산
    hiddenQuestions.forEach(q => {
      q.goldenScore = calculateGoldenScore(q.viewCount, q.answerCount, q.daysAgo, q.hasBlogLinks, q.blogLinkCount);
      q.goldenReason = generateGoldenReason(q);
    });
    
    // 점수순 정렬
    hiddenQuestions.sort((a, b) => b.goldenScore - a.goldenScore);
    
    console.log(`\n[KIN-CRAWLER] ✅ 숨은 꿀질문 ${hiddenQuestions.length}개 발굴 완료!\n`);
    
    return hiddenQuestions;
    
  } catch (error: any) {
    console.error('[KIN-CRAWLER] ❌ 실패:', error.message);
    return [];
  } finally {
    await page.close();
  }
}

// ============================================================
// 통합 함수
// ============================================================

export async function searchKinQuestions(isPremium: boolean = false): Promise<KinSearchResult> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[KIN-CRAWLER] 🔍 지식인 황금 질문 자동 발굴!`);
  console.log(`  - 프리미엄: ${isPremium ? 'Yes' : 'No'}`);
  console.log(`${'='.repeat(60)}\n`);
  
  const startTime = Date.now();
  
  const popularQuestions = await getPopularQuestions(20);
  
  let hiddenGoldenQuestions: KinQuestion[] = [];
  if (isPremium) {
    hiddenGoldenQuestions = await findHiddenGoldenQuestions({
      minViewCount: 10,   // 조건 완화
      maxAnswerCount: 5,  // 조건 완화
      limit: 30
    });
  }
  
  const allQuestions = isPremium ? hiddenGoldenQuestions : popularQuestions;
  const stats = {
    totalFound: allQuestions.length,
    goldenCount: allQuestions.filter(q => q.goldenScore >= 70).length,
    avgViewCount: allQuestions.length > 0 
      ? Math.round(allQuestions.reduce((sum, q) => sum + q.viewCount, 0) / allQuestions.length)
      : 0,
    avgAnswerCount: allQuestions.length > 0
      ? Math.round(allQuestions.reduce((sum, q) => sum + q.answerCount, 0) / allQuestions.length * 10) / 10
      : 0
  };
  
  const categories = [...new Set(allQuestions.map(q => q.category).filter(c => c))];
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n[KIN-CRAWLER] ✅ 완료! (${elapsed}초)`);
  console.log(`  - 많이 본 Q&A: ${popularQuestions.length}개`);
  console.log(`  - 숨은 꿀질문: ${hiddenGoldenQuestions.length}개`);
  console.log(`  - 황금 질문: ${stats.goldenCount}개\n`);
  
  return {
    popularQuestions,
    hiddenGoldenQuestions,
    timestamp: new Date().toISOString(),
    stats,
    categories
  };
}

// ============================================================
// 유틸리티
// ============================================================

/**
 * Phase 1: 통합 config로 델리게이트.
 * 모든 지식인 scoring은 naver-kin-golden-config.ts 의 단일 소스를 사용.
 * blogLinks 패널티는 config가 다루지 않으므로 여기서 후처리로 감점.
 */
function calculateGoldenScore(
  viewCount: number,
  answerCount: number,
  daysAgo: number,
  hasBlogLinks: boolean,
  blogLinkCount: number
): number {
  const { calculateGoldenScore: scoreFn } = require('./naver-kin-golden-config');
  const base = scoreFn({
    viewCount,
    answerCount,
    hoursAgo: Math.max(0, daysAgo) * 24,
    likeCount: 0,
    isAdopted: false,
  });
  const blogPenalty = hasBlogLinks ? Math.min(blogLinkCount * 5, 20) : 0;
  return Math.max(0, Math.min(100, base - blogPenalty));
}

function generateGoldenReason(q: any): string {
  const reasons: string[] = [];
  
  if (q.viewCount >= 300) reasons.push(`🔥 조회수 ${q.viewCount.toLocaleString()}!`);
  else if (q.viewCount >= 100) reasons.push(`👀 조회수 ${q.viewCount.toLocaleString()}`);
  else if (q.viewCount >= 50) reasons.push(`📊 조회수 ${q.viewCount}`);
  
  if (q.answerCount === 0) reasons.push('🎯 첫 답변 기회!');
  else if (q.answerCount <= 2) reasons.push(`📝 답변 ${q.answerCount}개 (경쟁 낮음)`);
  else if (q.answerCount <= 5) reasons.push(`📝 답변 ${q.answerCount}개`);
  
  if (!q.hasBlogLinks) reasons.push('✨ 블로그 링크 없음');
  else if (q.blogLinkCount) reasons.push(`⚠️ 블로그 ${q.blogLinkCount}개`);
  
  const score = q.goldenScore || calculateGoldenScore(q.viewCount, q.answerCount, q.daysAgo || 0, q.hasBlogLinks || false, q.blogLinkCount || 0);
  
  if (score >= 80) return `🏆 황금 질문! ${reasons.join(' | ')}`;
  if (score >= 60) return `⭐ 좋은 기회! ${reasons.join(' | ')}`;
  return reasons.join(' | ') || '일반 질문';
}
