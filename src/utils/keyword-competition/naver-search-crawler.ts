/**
 * 네이버 검색 결과 크롤러 (완벽 버전)
 * 
 * 네이버 VIEW 탭에서 블로그 검색 결과를 정확하게 크롤링합니다.
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, Page } from 'puppeteer';
import { NaverSearchResult, SmartBlockData, PopularItemData, SerpLayout } from './types';
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
  for (const p of paths) { try { if (fs.existsSync(p)) return p; } catch { } }
  return undefined;
}

// 브라우저 재사용
let browserInstance: Browser | null = null;
let browserLastUsed = 0;
const BROWSER_TIMEOUT = 120000;

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
    headless: 'new', // 최신 Puppeteer headless 모드
    executablePath: getChromePath(),
    defaultViewport: null,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--no-first-run'
    ]
  }) as Browser;


  browserLastUsed = now;
  return browserInstance;
}

export function extractBlogId(url: string): string {
  const match = url.match(/blog\.naver\.com\/([^\/\?]+)/);
  return match ? match[1] : '';
}

function parseDaysAgo(dateStr: string): number {
  if (!dateStr) return 0;

  const dayMatch = dateStr.match(/(\d+)일\s*전/);
  if (dayMatch) return parseInt(dayMatch[1]);

  const hourMatch = dateStr.match(/(\d+)시간\s*전/);
  if (hourMatch) return 0;

  const minMatch = dateStr.match(/(\d+)분\s*전/);
  if (minMatch) return 0;

  const monthMatch = dateStr.match(/(\d+)개월\s*전/);
  if (monthMatch) return parseInt(monthMatch[1]) * 30;

  const yearMatch = dateStr.match(/(\d+)년\s*전/);
  if (yearMatch) return parseInt(yearMatch[1]) * 365;

  // YYYY.MM.DD 패턴
  const datePattern = dateStr.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/);
  if (datePattern) {
    const postDate = new Date(
      parseInt(datePattern[1]),
      parseInt(datePattern[2]) - 1,
      parseInt(datePattern[3])
    );
    const diffTime = Date.now() - postDate.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }

  return 30; // 기본값
}

/**
 * 네이버 VIEW 검색 결과 크롤링 (2025년 12월 인기글 영역 정확 추출)
 */
export async function crawlNaverSearch(keyword: string): Promise<NaverSearchResult> {
  console.log(`[NAVER-SEARCH] 🔍 "${keyword}" 인기글 크롤링 시작...`);

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    page.setDefaultTimeout(25000);
    page.setDefaultNavigationTimeout(25000);

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });

    // 네이버 VIEW 탭에서 검색 (인기글 영역 포함)
    const searchUrl = `https://search.naver.com/search.naver?where=view&sm=tab_jum&query=${encodeURIComponent(keyword)}`;
    console.log(`[NAVER-SEARCH] URL: ${searchUrl}`);

    await page.goto(searchUrl, {
      waitUntil: 'networkidle2',
      timeout: 25000
    });

    // 충분한 로딩 대기
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 데이터 추출 (2025년 12월 네이버 인기글 영역 정확 추출)
    const extractedData = await page.evaluate((kw: string) => {
      const result = {
        popularItems: [] as any[],
        debugInfo: '',
        layout: {
          hasAd: false,
          hasShopping: false,
          hasKin: false,
          hasNews: false,
          hasVideo: false,
          adCount: 0,
          blogRank: -1, // 블로그 섹션의 시작 순서
          sections: [] as string[]
        }
      };

      // 🎯 0단계: 레이아웃 분석
      const allApiSections = document.querySelectorAll('.api_subject_bx, .sc_new, .api_subject_bx');
      let currentRank = 1;
      allApiSections.forEach((section) => {
        const header = section.querySelector('.api_title, .tit_area, h2')?.textContent || '';
        const className = section.className;

        if (header.includes('광고') || className.includes('ad_section')) {
          result.layout.hasAd = true;
          result.layout.adCount++;
          result.layout.sections.push('AD');
        } else if (header.includes('쇼핑') || className.includes('shopping')) {
          result.layout.hasShopping = true;
          result.layout.sections.push('SHOPPING');
        } else if (header.includes('지식iN') || header.includes('지식인')) {
          result.layout.hasKin = true;
          result.layout.sections.push('KIN');
        } else if (header.includes('뉴스')) {
          result.layout.hasNews = true;
          result.layout.sections.push('NEWS');
        } else if (header.includes('동영상') || header.includes('비디오')) {
          result.layout.hasVideo = true;
          result.layout.sections.push('VIDEO');
        } else if (header.includes('인기글') || header.includes('블로그') || header.includes('VIEW')) {
          if (result.layout.blogRank === -1) result.layout.blogRank = currentRank;
          result.layout.sections.push('BLOG');
        } else {
          result.layout.sections.push('OTHER');
        }
        currentRank++;
      });
      // 인기글 섹션 헤더 찾기
      let popularSection: Element | null = null;

      // "인기글" 또는 블로그 콘텐츠 섹션 찾기
      const allSections = document.querySelectorAll('.api_subject_bx, .group_blog, [class*="popular"], .sc_new');
      for (const section of Array.from(allSections)) {
        const headerText = section.querySelector('.tit_area, .api_title, h2, .title_area')?.textContent || '';
        // 인기글, 블로그 섹션만 허용 (브랜드 콘텐츠 제외)
        if ((headerText.includes('인기글') || headerText.includes('블로그')) && !headerText.includes('브랜드')) {
          popularSection = section;
          result.debugInfo = `인기글 섹션 발견: ${headerText.substring(0, 20)}`;
          break;
        }
      }

      // 인기글 섹션이 없으면 전체 페이지에서 검색
      if (!popularSection) {
        popularSection = document.querySelector('#main_pack') || document.body;
        result.debugInfo = '인기글 섹션 없음, 전체 검색';
      }

      // 🎯 2단계: 인기글 아이템들 추출 (2025년 12월 SDS 컴포넌트 구조)
      // 네이버 인기글: data-template-id="ugcItem" 또는 sds-comps 구조
      const itemSelectors = [
        '[data-template-id="ugcItem"]',     // 2025년 SDS 컴포넌트 구조
        '.fds-ugc-single-intention-item-list > div > div',
        '[class*="ugcItem"]',
        'ul.list_base > li.bx',
        '.total_wrap > ul > li.bx',
        'li.bx'
      ];

      let items: Element[] = [];
      for (const sel of itemSelectors) {
        const found = popularSection.querySelectorAll(sel);
        if (found.length > 0) {
          items = Array.from(found);
          result.debugInfo += ` | 셀렉터: ${sel} (${items.length}개)`;
          break;
        }
      }

      // 아이템이 없으면 블로그 링크 기반으로 찾기
      if (items.length === 0) {
        // 블로그 프로필 링크를 찾아서 부모 컨테이너 추출
        const profileLinks = popularSection.querySelectorAll('a[href*="blog.naver.com"][class*="fender"], .sds-comps-profile a[href*="blog.naver.com"]');
        result.debugInfo += ` | 프로필 링크: ${profileLinks.length}개`;

        const seenContainers = new Set<Element>();
        profileLinks.forEach(link => {
          // ugcItem 또는 상위 div 찾기
          let container = link.closest('[data-template-id="ugcItem"]');
          if (!container) {
            container = link.closest('.sds-comps-vertical-layout');
          }
          if (!container) {
            // 3단계 상위 부모
            let parent = link.parentElement;
            for (let i = 0; i < 5 && parent; i++) {
              if (parent.querySelector('a[href*="blog.naver.com"][class*="title"], .sds-comps-text-type-title')) {
                container = parent;
                break;
              }
              parent = parent.parentElement;
            }
          }
          if (container && !seenContainers.has(container)) {
            seenContainers.add(container);
            items.push(container);
          }
        });
        result.debugInfo += ` | 컨테이너: ${items.length}개`;
      }

      // 여전히 아이템이 없으면 전체 페이지에서 블로그 링크 찾기
      if (items.length === 0) {
        // 전체 페이지에서 블로그/카페/인플루언서 링크 찾기
        const allBlogLinks = document.querySelectorAll('a[href*="blog.naver.com"], a[href*="in.naver.com/"]');
        result.debugInfo += ` | 전체 블로그링크: ${allBlogLinks.length}개`;

        const seenUrls = new Set<string>();
        allBlogLinks.forEach(link => {
          const href = (link as HTMLAnchorElement).href;
          // 포스트 링크만 (숫자 포함)
          if ((/\/\d+/.test(href) || href.includes('/contents/')) && !seenUrls.has(href)) {
            seenUrls.add(href);
            const container = link.closest('li, .bx, article, [class*="item"]') || link.parentElement;
            if (container) {
              items.push(container);
            }
          }
        });
        items = items.slice(0, 10);
        result.debugInfo += ` | 추출: ${items.length}개`;
      }

      result.debugInfo += ` | 최종 아이템: ${items.length}개`;

      // 🎯 3단계: 각 아이템에서 정보 추출 (2025년 12월 SDS 컴포넌트 구조)
      // 모든 인기글 추출 (제한 없음)
      items.forEach((item, idx) => {
        let title = '';
        let url = '';
        let blogId = '';
        let authorName = '';
        let dateStr = '';

        // 2025년 SDS 컴포넌트 구조에서 정보 추출
        // 1. 제목 찾기 (sds-comps-text-type-title 또는 title 클래스)
        const titleEl = item.querySelector('[class*="text-type-title"], [class*="title_link"], a.title_link, .total_tit a');
        if (titleEl) {
          title = titleEl.textContent?.trim() || '';
          // 제목 링크에서 URL 추출
          const titleLink = titleEl.closest('a') || titleEl.querySelector('a') || titleEl as HTMLAnchorElement;
          if (titleLink && titleLink.href) {
            url = titleLink.href;
          }
        }

        // 2. URL이 없으면 블로그/카페/인플루언서 링크 찾기
        if (!url) {
          // 블로그, 카페, 인플루언서 링크 모두 찾기
          const allLinks = item.querySelectorAll('a[href*="blog.naver.com"], a[href*="cafe.naver.com"], a[href*="in.naver.com"]');
          for (const link of Array.from(allLinks)) {
            const href = (link as HTMLAnchorElement).href;
            const text = link.textContent?.trim() || '';
            // 포스트 링크 (숫자 포함) 우선, 또는 제목이 있는 링크
            if (/\/\d+/.test(href) || href.includes('PostView') || href.includes('/contents/') || (text.length > 10 && !text.includes('Keep'))) {
              url = href;
              if (!title && text.length > 5 && !text.includes('Keep')) {
                title = text;
              }
              break;
            }
          }
        }

        // URL이 없으면 스킵
        if (!url) return;

        // 3. 블로그/카페/인플루언서 ID 추출
        let contentType: 'blog' | 'cafe' | 'influencer' = 'blog';
        const blogIdMatch = url.match(/blog\.naver\.com\/([^\/\?#]+)/);
        const cafeIdMatch = url.match(/cafe\.naver\.com\/([^\/\?#]+)/);
        const influencerMatch = url.match(/in\.naver\.com\/([^\/\?#]+)/);

        if (blogIdMatch) {
          blogId = blogIdMatch[1];
          contentType = 'blog';
        } else if (cafeIdMatch) {
          blogId = cafeIdMatch[1];
          contentType = 'cafe';
        } else if (influencerMatch) {
          blogId = influencerMatch[1];
          contentType = 'influencer';
        }

        if (!blogId) return;

        // 4. 작성자명 찾기 (SDS 프로필 컴포넌트)
        const profileEl = item.querySelector('.sds-comps-profile-name, [class*="profile-name"], .sds-comps-text');
        if (profileEl) {
          authorName = profileEl.textContent?.trim() || '';
        }

        // 프로필 섹션에서 추출
        if (!authorName) {
          const profileSection = item.querySelector('.sds-comps-profile, [class*="profile"]');
          if (profileSection) {
            // 프로필 텍스트에서 블로그명과 날짜 분리
            const profileText = profileSection.textContent?.trim() || '';
            // "블로그명 · 3시간 전" 패턴
            const match = profileText.match(/^(.+?)\s*\u00b7\s*(.+)$/);
            if (match) {
              authorName = match[1].trim();
              dateStr = match[2].trim();
            } else {
              authorName = profileText.split(/[\u00b7\|]/)[0].trim();
            }
          }
        }

        // 5. 날짜 찾기
        if (!dateStr) {
          const itemText = item.textContent || '';
          const dateMatch = itemText.match(/(\d+\s*[시간일분년개월]+\s*전|\d{4}\.\d{1,2}\.\d{1,2})/);
          if (dateMatch) {
            dateStr = dateMatch[1];
          }
        }

        // 유효한 데이터만 추가
        if (title && title.length > 3 && blogId) {
          result.popularItems.push({
            rank: result.popularItems.length + 1,
            type: contentType,
            title: title.substring(0, 100),
            authorName: authorName || blogId,
            blogUrl: url,
            blogId,
            publishedDateStr: dateStr
          });
        }
      });

      // 중복 제거 (포스트 URL 기준 - 같은 블로그의 다른 글은 허용)
      const seen = new Set<string>();
      result.popularItems = result.popularItems.filter((item: any) => {
        // 포스트 번호까지 포함한 전체 URL로 중복 체크
        const postUrl = item.blogUrl;
        if (seen.has(postUrl)) return false;
        seen.add(postUrl);
        return true;
      });

      // 순위 재정렬
      result.popularItems.forEach((item: any, idx: number) => {
        item.rank = idx + 1;
      });

      result.debugInfo += ` | 최종 결과: ${result.popularItems.length}개`;

      return result;
    }, keyword);

    console.log(`[NAVER-SEARCH] 디버그: ${extractedData.debugInfo}`);

    // 추출된 아이템 로깅
    extractedData.popularItems.forEach((item: any, idx: number) => {
      console.log(`[NAVER-SEARCH] ${idx + 1}. "${item.title?.substring(0, 30)}..." - ${item.authorName} - ${item.publishedDateStr}`);
    });

    // 결과 생성
    const popularItems: PopularItemData[] = extractedData.popularItems.map((item: any) => ({
      ...item,
      publishedDaysAgo: parseDaysAgo(item.publishedDateStr || '')
    }));

    // 데이터가 여전히 없으면 에러 로깅 후 빈 결과 반환
    if (popularItems.length === 0) {
      console.log('[NAVER-SEARCH] ⚠️ 실제 데이터 추출 실패');

      // 페이지 HTML 일부 로깅 (디버깅용)
      const htmlSnapshot = await page.evaluate(() => {
        const main = document.querySelector('#main_pack, .view_wrap, body');
        return main?.innerHTML?.substring(0, 1000) || 'HTML 없음';
      });
      console.log('[NAVER-SEARCH] HTML 스냅샷:', htmlSnapshot.substring(0, 500));
    }

    const result: NaverSearchResult = {
      displayType: 'popular',
      keyword,
      popularItems,
      layout: extractedData.layout
    };

    console.log(`[NAVER-SEARCH] ✅ 완료: ${result.popularItems?.length}개 아이템`);

    return result;

  } catch (error: any) {
    console.error('[NAVER-SEARCH] ❌ 크롤링 오류:', error.message);

    return {
      displayType: 'popular',
      keyword,
      popularItems: []
    };
  } finally {
    await page.close();
  }
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    try { await browserInstance.close(); } catch { /* ignore */ }
    browserInstance = null;
  }
}

/**
 * 🆕 상위 글 본문 내용 크롤링 (제목 전략 분석용)
 * 
 * 블로그 포스트의 실제 내용을 크롤링하여 핵심 포인트 추출
 */
export async function crawlPostContent(postUrl: string): Promise<{
  content: string;
  keyPoints: string[];
}> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(15000);

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    await page.goto(postUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    // 본문 내용 추출
    const extracted = await page.evaluate(() => {
      let content = '';

      // 네이버 블로그 본문 셀렉터들
      const contentSelectors = [
        '.se-main-container',           // 스마트에디터 ONE
        '.post-view',                   // 구버전
        '#postViewArea',                // 구버전
        '.se_component_wrap',           // 스마트에디터 2.0
        'article',
        '.content',
        '#content'
      ];

      for (const sel of contentSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent && el.textContent.length > 100) {
          content = el.textContent.trim();
          break;
        }
      }

      // iframe 내부 확인 (네이버 블로그는 iframe 사용)
      if (!content || content.length < 100) {
        const iframe = document.querySelector('#mainFrame') as HTMLIFrameElement;
        if (iframe && iframe.contentDocument) {
          for (const sel of contentSelectors) {
            const el = iframe.contentDocument.querySelector(sel);
            if (el && el.textContent && el.textContent.length > 100) {
              content = el.textContent.trim();
              break;
            }
          }
        }
      }

      return content;
    });

    // 핵심 포인트 추출
    const keyPoints = extractKeyPoints(extracted);

    return {
      content: extracted.substring(0, 500), // 500자까지만
      keyPoints
    };

  } catch (error: any) {
    console.log(`[CONTENT] ⚠️ 본문 크롤링 실패: ${error.message}`);
    return { content: '', keyPoints: [] };
  } finally {
    await page.close();
  }
}

/**
 * 🆕 본문에서 핵심 포인트 추출 (후킹 제목 생성용)
 */
function extractKeyPoints(content: string): string[] {
  const keyPoints: string[] = [];

  if (!content || content.length < 50) return keyPoints;

  // 1. 숫자 + 단위 패턴 (충격적인 수치)
  const numberPatterns = content.match(/(\d+[,\d]*\s*(억|만|천|원|명|개|회|번|일|시간|분|년|개월|kg|cm|m|%))/g);
  if (numberPatterns) {
    keyPoints.push(...numberPatterns.slice(0, 3));
  }

  // 2. 충격적인 키워드 포함 문장
  const shockKeywords = ['충격', '폭로', '논란', '고백', '실체', '진실', '폭행', '피해', '사기', '거짓', '위험', '경고', '주의', '심각', '긴급', '속보', '단독', '최초'];
  const sentences = content.split(/[.!?]/);
  for (const sentence of sentences) {
    for (const keyword of shockKeywords) {
      if (sentence.includes(keyword) && sentence.length > 10 && sentence.length < 100) {
        keyPoints.push(sentence.trim());
        break;
      }
    }
    if (keyPoints.length >= 5) break;
  }

  // 3. 인용문 패턴 ("..." 또는 '...')
  const quotes = content.match(/["'"]([^"'"]{10,50})["'"]/g);
  if (quotes) {
    keyPoints.push(...quotes.slice(0, 2));
  }

  // 4. 핵심 사실 (~ 밝혀졌다, ~ 드러났다, ~ 확인됐다)
  const factPatterns = content.match(/[^.!?]*(?:밝혀졌|드러났|확인됐|알려졌|전해졌|보도됐)[^.!?]*/g);
  if (factPatterns) {
    keyPoints.push(...factPatterns.slice(0, 2).map(s => s.trim()));
  }

  // 중복 제거 및 정리
  return [...new Set(keyPoints)].slice(0, 5);
}

/**
 * 🆕 여러 포스트 본문 병렬 크롤링
 */
export async function crawlMultiplePostContents(postUrls: string[]): Promise<Map<string, { content: string; keyPoints: string[] }>> {
  const results = new Map<string, { content: string; keyPoints: string[] }>();

  console.log(`[CONTENT] 📝 ${postUrls.length}개 포스트 본문 크롤링 시작...`);

  // 병렬 처리 (최대 3개씩)
  const batchSize = 3;
  for (let i = 0; i < postUrls.length; i += batchSize) {
    const batch = postUrls.slice(i, i + batchSize);
    const promises = batch.map(async (url) => {
      const result = await crawlPostContent(url);
      return { url, result };
    });

    const batchResults = await Promise.all(promises);
    for (const { url, result } of batchResults) {
      results.set(url, result);
    }
  }

  console.log(`[CONTENT] ✅ ${results.size}개 포스트 본문 크롤링 완료`);

  return results;
}

/**
 * 🆕 뉴스/VIEW 스니펫 크롤링 (Puppeteer 버전)
 */
export async function crawlNewsSnippets(keyword: string): Promise<string[]> {
  console.log(`[PUPPETEER] 🔍 "${keyword}" 뉴스/VIEW 스니펫 크롤링 시작...`);
  const browser = await getBrowser();
  const page = await browser.newPage();
  const snippets: string[] = [];

  try {
    page.setDefaultTimeout(25000);
    await page.setViewport({ width: 1280, height: 900 });

    // User-Agent 설정 (최신 Chrome 버전)
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

    // 통합검색(nexearch) 페이지
    const url = `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(keyword)}`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 25000 });

    // 동적 콘텐츠 로딩 대기 (네이버는 JS 렌더링이 느림)
    await new Promise(r => setTimeout(r, 3000));

    // 데이터 추출 (2026년 네이버 SERP 레이아웃 - 진단 기반 업데이트)
    const results = await page.evaluate(() => {
      const data = {
        snippets: [] as string[],
        related: [] as string[]
      };

      // 노이즈 워드 (시스템 UI 텍스트)
      const noiseWords = [
        '검색어 저장', '자동완성', '도움말', '로그인', '로그아웃', '기록', '삭제',
        '검색어끄기', '컨텍스트', '검색 이력', '더보기', '이전', '다음', '펴고 접기',
        'Keep에 저장', 'Keep에 바로', '문서 저장하기', '바로가기', '메뉴 영역',
        '본문 영역', '설정이 초기화', '최근 검색어', '추천 검색어', '일시적인 오류',
        '다시 시도', '레이어 닫기', '네이버 멤버십', '알림을 모두', '즐겨찾기',
        'naver.search', 'function()', 'jQuery', 'startApplication',
        // 추가 노이즈 패턴 (UI 요소)
        '정보확인', '열고 닫기', '직접 관리', '인플루언서', '네이버 인플루언서',
        '관련도순', '최신순', '모바일 메인', '언론사', '네이버뉴스',
        'tv.naver.com', 'blog.naver.com', '약 1.1', '창작자의 콘텐츠',
        '팔로우', '팬', '활동하는'
      ];

      const isNoise = (text: string) => {
        if (!text || text.length < 5) return true;
        if (text.length > 300) return true;
        // 순순하게 숫자+야만 있는 것 (날짜, 시간 등)
        if (/^[\d\s\.\/\:\-]+$/.test(text)) return true;
        return noiseWords.some(nw => text.includes(nw));
      };

      // 1. 메인 검색 결과 섹션 (.sc_new, .api_subject_bx)
      document.querySelectorAll('.sc_new, .api_subject_bx').forEach(section => {
        // 섹션 내 모든 텍스트 요소 추출
        section.querySelectorAll('a, span, p, div, strong, em').forEach(el => {
          const t = el.textContent?.trim();
          if (t && t.length > 10 && t.length < 200 && !isNoise(t)) {
            // 중복 방지
            if (!data.snippets.includes(t)) {
              data.snippets.push(t);
            }
          }
        });
      });

      // 2. 인물정보 (.info_group)
      document.querySelectorAll('.info_group').forEach(el => {
        const t = el.textContent?.trim();
        if (t && t.length > 5 && t.length < 100 && !isNoise(t)) {
          if (!data.snippets.includes(t)) {
            data.snippets.push(t);
          }
        }
      });

      // 3. 연관검색어 - 여러 셀렉터 시도
      const relatedSelectors = [
        '.lst_related_srch a',
        '.related_srch a',
        '[class*="related"] a',
        '.fds-comps-keyword-group a'
      ];

      relatedSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
          const t = el.textContent?.trim();
          if (t && t.length > 1 && t.length < 30 && !isNoise(t)) {
            if (!data.related.includes(t)) {
              data.related.push(t);
            }
          }
        });
      });

      return data;
    });

    // 중복 제거 및 필터링 (100점 품질 필터)
    const additionalNoise = [
      'Keep', '저장', '바로가기', '사이트인스타그램', '유튜브', '온라인콘텐츠',
      '정보확인', '열고 닫기', '직접 관리', '소속레페리'
    ];

    const cleanSnippets = results.snippets
      .filter(t => t.length > 15 && t.length < 250)
      .filter(t => !additionalNoise.some(n => t.includes(n)))
      // 실제 뉴스/콘텐츠 가능성이 높은 것만 (최소 20자 이상의 문장)
      .filter(t => t.length >= 20 || t.includes('['))
      .slice(0, 12);

    const uniqueRelated = [...new Set(results.related)].filter(t => t.length >= 2);

    snippets.push(...cleanSnippets);

    // 연관검색어도 스니펫에 포함
    if (uniqueRelated.length > 0) {
      console.log(`[PUPPETEER] 실시간 연관어 발견: ${uniqueRelated.join(', ')}`);
      snippets.push(...uniqueRelated.map(r => `[연관어] ${r}`));
    }

    console.log(`[PUPPETEER] 크롤링 완료: ${snippets.length}개 스니펫`);
    if (snippets.length > 0) {
      console.log(`[PUPPETEER] 샘플: "${snippets[0].substring(0, 50)}..."`);
    } else {
      console.log(`[PUPPETEER] ⚠️ 유효한 스니펫을 찾지 못했습니다.`);
    }
    return snippets;

  } catch (error: any) {
    console.error(`[PUPPETEER] 크롤링 실패: ${error.message}`);
    return [];
  } finally {
    await page.close();
  }
}
