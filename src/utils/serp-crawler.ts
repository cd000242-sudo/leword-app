import { chromium, Browser, Page } from 'playwright';
import { findSystemChrome } from './chrome-finder';

export interface SerpPost {
  rank: number;
  title: string;
  url: string;
  publishedDate: string | null;  // "2025-03-15" 형식
  daysOld: number;               // 발행 후 경과일
  snippet: string;               // 미리보기 텍스트
  isOfficialBlog: boolean;       // 공식 블로그 여부
}

export interface SerpAnalysisResult {
  keyword: string;
  posts: SerpPost[];
  avgDaysOld: number;
  isEmptyHouse: boolean;       // 상위 글이 오래되었는지
  hasOfficialBlog: boolean;    // 상위에 공식 블로그가 있는지
  analyzedAt: string;
}

// 브라우저 싱글톤
let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    const executablePath = findSystemChrome();
    browserInstance = await chromium.launch({
      headless: true,
      executablePath, // undefined면 Playwright 기본 Chromium 사용
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
  }
  return browserInstance;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

/**
 * 네이버 블로그 검색 SERP 분석
 * Playwright로 실제 검색 결과를 크롤링
 */
export async function analyzeSerpWithPlaywright(keyword: string): Promise<SerpAnalysisResult> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    // 네이버 블로그 검색
    const searchUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}&sm=tab_opt&nso=so%3Ar%2Cp%3Aall`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);

    // 상위 5개 블로그 글 파싱
    const posts: SerpPost[] = [];

    const results = await page.evaluate(() => {
      const items: Array<{title: string; url: string; date: string; snippet: string; isOfficial: boolean}> = [];

      // ── 1단계: 아이템 컨테이너 탐색 (2025년 SDS 컴포넌트 우선, 구버전 순) ──
      const containerSelectors = [
        '[data-template-id="ugcItem"]',           // 2025년 SDS 컴포넌트 구조
        '.fds-ugc-single-intention-item-list > div > div',
        'li.bx',                                   // VIEW/블로그탭 공통 아이템
        '.total_wrap > ul > li',                   // 구버전 total_wrap 리스트
        '.api_subject_bx .total_area',             // 섹션 내 total_area
        '.total_wrap',                             // total_wrap 직접 (폴백)
      ];

      let containerItems: Element[] = [];
      for (const sel of containerSelectors) {
        const found = document.querySelectorAll(sel);
        if (found.length > 0) {
          containerItems = Array.from(found).filter(el => !el.classList.contains('type_ad'));
          break;
        }
      }

      // ── 2단계: 컨테이너가 없으면 blog.naver.com 링크 기반으로 역탐색 ──
      if (containerItems.length === 0) {
        const blogLinks = document.querySelectorAll('a[href*="blog.naver.com"]');
        const seenContainers = new Set<Element>();
        blogLinks.forEach(link => {
          const href = (link as HTMLAnchorElement).href;
          if (!/\/\d+/.test(href)) return; // 포스트 링크만 (숫자 포함)
          const container =
            link.closest('[data-template-id="ugcItem"]') ||
            link.closest('li.bx') ||
            link.closest('.total_wrap') ||
            link.closest('li') ||
            link.parentElement;
          if (container && !seenContainers.has(container)) {
            seenContainers.add(container);
            containerItems.push(container);
          }
        });
      }

      // ── 3단계: 각 아이템에서 정보 추출 ──
      for (let i = 0; i < Math.min(containerItems.length, 5); i++) {
        const item = containerItems[i];

        // 제목 + URL
        // 우선순위: SDS text-type-title → title_link → api_txt_lines → total_tit → blog.naver.com 링크
        let titleEl: HTMLAnchorElement | null = null;
        const titleCandidates = [
          item.querySelector('[class*="text-type-title"] a'),
          item.querySelector('a.title_link'),
          item.querySelector('a.api_txt_lines'),
          item.querySelector('.total_tit a'),
          item.querySelector('a[href*="blog.naver.com"]'),
          item.querySelector('a'),
        ];
        for (const el of titleCandidates) {
          if (el && (el as HTMLAnchorElement).href) {
            titleEl = el as HTMLAnchorElement;
            break;
          }
        }
        const title = titleEl?.textContent?.trim() || '';
        const url = titleEl?.href || '';

        // 날짜
        // 우선순위: SDS 프로필 "블로그명 · 날짜" → sub_time/date → 텍스트 정규식 추출
        let date = '';
        const profileSection = item.querySelector('.sds-comps-profile, [class*="profile"]');
        if (profileSection) {
          const profileText = profileSection.textContent?.trim() || '';
          // "블로그명 · 3시간 전" 또는 "블로그명 · 2025.03.15." 패턴
          const midotMatch = profileText.match(/\u00b7\s*(.+)$/);
          if (midotMatch) date = midotMatch[1].trim();
        }
        if (!date) {
          const dateEl =
            item.querySelector('.sub_time') ||
            item.querySelector('.date') ||
            item.querySelector('.time') ||
            item.querySelector('.sub_info');
          date = dateEl?.textContent?.trim() || '';
        }
        if (!date) {
          const itemText = item.textContent || '';
          const dateMatch = itemText.match(/(\d+\s*[시간일분년개월]+\s*전|\d{4}\.\d{1,2}\.\d{1,2}\.?)/);
          if (dateMatch) date = dateMatch[1];
        }

        // 본문 미리보기 (snippet)
        const snippetEl =
          item.querySelector('[class*="dsc_txt"]') ||
          item.querySelector('[class*="desc"]') ||
          item.querySelector('.dsc_area') ||
          item.querySelector('p');
        const snippet = snippetEl?.textContent?.trim() || '';

        // 작성자 / 블로그명 (공식 블로그 판별용)
        let authorName = '';
        const authorEl =
          item.querySelector('.sds-comps-profile-name') ||
          item.querySelector('[class*="profile-name"]') ||
          item.querySelector('.user_info .name') ||
          item.querySelector('.sub_txt .name') ||
          item.querySelector('.source_box .name') ||
          item.querySelector('.name');
        if (authorEl) {
          authorName = authorEl.textContent?.trim() || '';
        } else if (profileSection) {
          const profileText = profileSection.textContent?.trim() || '';
          authorName = profileText.split(/[\u00b7|]/)[0].trim();
        }

        const isOfficial =
          authorName.includes('공식') ||
          authorName.includes('official') ||
          !!item.querySelector('.ico_influencer, .badge_influencer, .sp_nreview');

        if (url) {
          items.push({ title, url, date, snippet, isOfficial });
        }
      }

      return items;
    });

    const now = new Date();

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const publishedDate = parseNaverDate(r.date);
      const daysOld = publishedDate
        ? Math.floor((now.getTime() - new Date(publishedDate).getTime()) / (1000 * 60 * 60 * 24))
        : 365; // 날짜 파싱 실패 시 보수적으로 1년

      posts.push({
        rank: i + 1,
        title: r.title,
        url: r.url,
        publishedDate,
        daysOld,
        snippet: r.snippet,
        isOfficialBlog: r.isOfficial
      });
    }

    const validPosts = posts.filter(p => p.publishedDate !== null);
    const avgDaysOld = validPosts.length > 0
      ? Math.floor(validPosts.reduce((s, p) => s + p.daysOld, 0) / validPosts.length)
      : 365;

    return {
      keyword,
      posts,
      avgDaysOld,
      isEmptyHouse: avgDaysOld > 150,
      hasOfficialBlog: posts.some(p => p.isOfficialBlog),
      analyzedAt: new Date().toISOString()
    };

  } catch (error: any) {
    console.warn(`[SERP-CRAWLER] ${keyword} 분석 실패:`, error.message);
    return {
      keyword,
      posts: [],
      avgDaysOld: 0,
      isEmptyHouse: false,
      hasOfficialBlog: false,
      analyzedAt: new Date().toISOString()
    };
  } finally {
    await context.close();
  }
}

/**
 * 네이버 날짜 문자열 파싱
 * "2025.3.15.", "3일 전", "2시간 전", "어제" 등 처리
 */
function parseNaverDate(dateStr: string): string | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();

  // "2025.3.15." or "2025.03.15"
  const fullMatch = trimmed.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (fullMatch) {
    return `${fullMatch[1]}-${fullMatch[2].padStart(2, '0')}-${fullMatch[3].padStart(2, '0')}`;
  }

  const now = new Date();

  // "N일 전"
  const daysAgo = trimmed.match(/(\d+)\s*일\s*전/);
  if (daysAgo) {
    const d = new Date(now.getTime() - parseInt(daysAgo[1]) * 86400000);
    return d.toISOString().slice(0, 10);
  }

  // "N시간 전"
  const hoursAgo = trimmed.match(/(\d+)\s*시간\s*전/);
  if (hoursAgo) {
    return now.toISOString().slice(0, 10); // 오늘
  }

  // "N분 전"
  if (/\d+\s*분\s*전/.test(trimmed)) {
    return now.toISOString().slice(0, 10);
  }

  // "어제"
  if (trimmed.includes('어제')) {
    const d = new Date(now.getTime() - 86400000);
    return d.toISOString().slice(0, 10);
  }

  // "N주 전"
  const weeksAgo = trimmed.match(/(\d+)\s*주\s*전/);
  if (weeksAgo) {
    const d = new Date(now.getTime() - parseInt(weeksAgo[1]) * 7 * 86400000);
    return d.toISOString().slice(0, 10);
  }

  // "N개월 전"
  const monthsAgo = trimmed.match(/(\d+)\s*개?월\s*전/);
  if (monthsAgo) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - parseInt(monthsAgo[1]));
    return d.toISOString().slice(0, 10);
  }

  // "N년 전"
  const yearsAgo = trimmed.match(/(\d+)\s*년\s*전/);
  if (yearsAgo) {
    const d = new Date(now);
    d.setFullYear(d.getFullYear() - parseInt(yearsAgo[1]));
    return d.toISOString().slice(0, 10);
  }

  return null;
}

/**
 * 여러 키워드 일괄 분석 (순차, 서버 부하 방지)
 */
export async function analyzeSerpBatch(
  keywords: string[],
  delayMs: number = 2000
): Promise<SerpAnalysisResult[]> {
  const results: SerpAnalysisResult[] = [];
  for (const kw of keywords) {
    const result = await analyzeSerpWithPlaywright(kw);
    results.push(result);
    if (keywords.indexOf(kw) < keywords.length - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return results;
}
