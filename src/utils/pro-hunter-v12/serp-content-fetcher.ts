// PRO Hunter v12 — SERP 본문 크롤
// 작성: 2026-04-15
// 네이버 블로그 검색 상위 10개의 실제 본문을 수집해 콘텐츠 차원 분석에 사용한다.

import puppeteer, { Browser } from 'puppeteer';

export interface FetchedPost {
  rank: number;
  title: string;
  url: string;
  bloggerName: string;
  postDate: string;
  bodyText: string;
  h2Count: number;
  h3Count: number;
  imageCount: number;
  videoCount: number;
  externalLinkCount: number;
  wordCount: number;
  charCount: number;
  ageDays: number | null;
}

const NAVER_SEARCH_URL = (kw: string) =>
  `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(kw)}&sm=tab_opt&nso=so%3Ar%2Cp%3Aall`;

async function launchBrowser(): Promise<Browser> {
  const { findChromePath } = await import('../chrome-finder');
  const chromePath = findChromePath();
  return puppeteer.launch({
    headless: 'new',
    executablePath: chromePath || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-web-security',
    ],
  });
}

async function fetchTopUrls(
  browser: Browser,
  keyword: string,
  limit: number
): Promise<Array<{ rank: number; title: string; url: string; blogger: string; date: string }>> {
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  );
  await page.setViewport({ width: 1920, height: 1080 });

  await page.goto(NAVER_SEARCH_URL(keyword), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2500));

  const items = await page.evaluate(() => {
    const out: Array<{ title: string; url: string; blogger: string; date: string }> = [];
    const links = document.querySelectorAll('a[href*="blog.naver.com"]');
    const seen = new Set<string>();
    for (const a of Array.from(links)) {
      const href = (a as HTMLAnchorElement).href;
      if (!href || seen.has(href)) continue;
      // 블로그 포스트 URL만 (blog.naver.com/{id}/{postId})
      if (!/blog\.naver\.com\/[^/]+\/\d+/.test(href)) continue;
      seen.add(href);
      const title = (a.textContent || '').trim();
      if (!title || title.length < 3) continue;
      // 작성자 / 날짜는 부모 컨테이너에서 best-effort
      const container = a.closest('li, .bx, .total_wrap') || a.parentElement;
      const blogger = (container?.querySelector('.user_info, .name, .author') as HTMLElement | null)?.innerText?.trim() || '';
      const date = (container?.querySelector('.user_info .sub, .date, time') as HTMLElement | null)?.innerText?.trim() || '';
      out.push({ title, url: href, blogger, date });
    }
    return out;
  });

  await page.close();
  return items.slice(0, limit).map((it, i) => ({ rank: i + 1, ...it }));
}

async function fetchPostBody(
  browser: Browser,
  url: string
): Promise<{ title: string; body: string; h2: number; h3: number; img: number; vid: number; ext: number; html: string }> {
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  );
  await page.setViewport({ width: 1280, height: 800 });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await new Promise((r) => setTimeout(r, 1500));

    // 네이버 블로그는 iframe(mainFrame)에 본문이 들어있다
    const mainFrame = page.frames().find((f) => f.url().includes('PostView') || f.name() === 'mainFrame');
    const target = mainFrame || page.mainFrame();

    const data = await target.evaluate(() => {
      const titleEl = document.querySelector('.se-title-text, .pcol1, h3.tit_h3, .se_title, [class*="title"]');
      const title = (titleEl as HTMLElement | null)?.innerText?.trim() || document.title || '';

      // 본문 후보 선택자
      const bodySelectors = [
        '.se-main-container',
        '.post_ct',
        '#postViewArea',
        '.se_doc_viewer',
        '.post-view',
        'div[id^="post-view"]',
      ];
      let bodyEl: Element | null = null;
      for (const sel of bodySelectors) {
        const el = document.querySelector(sel);
        if (el && (el as HTMLElement).innerText && (el as HTMLElement).innerText.length > 100) {
          bodyEl = el;
          break;
        }
      }
      const root = bodyEl || document.body;

      const text = (root as HTMLElement).innerText || '';
      const html = (root as HTMLElement).innerHTML || '';

      const h2Count = root.querySelectorAll('h2, .se-title, .se_textarea h2, .se-section-text h2').length;
      const h3Count = root.querySelectorAll('h3').length;
      const imgCount = root.querySelectorAll('img').length;
      const vidCount = root.querySelectorAll('iframe[src*="youtube"], iframe[src*="vimeo"], video').length;

      // 외부 링크 (현재 도메인 제외)
      const links = Array.from(root.querySelectorAll('a[href]'));
      const ext = links.filter((a) => {
        const href = (a as HTMLAnchorElement).href;
        try {
          const u = new URL(href);
          return u.hostname !== location.hostname && u.hostname !== 'blog.naver.com';
        } catch {
          return false;
        }
      }).length;

      return { title, body: text, h2: h2Count, h3: h3Count, img: imgCount, vid: vidCount, ext, html };
    });

    return data;
  } finally {
    await page.close().catch(() => {});
  }
}

function parseKoreanDate(s: string): Date | null {
  if (!s) return null;
  // "2025. 12. 1." / "2025-12-01" / "1일 전" 등 best-effort
  const m = s.match(/(\d{4})[.\-\s]*(\d{1,2})[.\-\s]*(\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return null;
}

export async function fetchSerpTop10(
  keyword: string,
  options: { limit?: number; concurrent?: number } = {}
): Promise<FetchedPost[]> {
  const limit = options.limit ?? 10;
  const browser = await launchBrowser();
  const results: FetchedPost[] = [];

  try {
    const tops = await fetchTopUrls(browser, keyword, limit);
    if (tops.length === 0) return [];

    // 동시 실행 제한 (네이버 차단 회피)
    const concurrent = options.concurrent ?? 3;
    const queue = [...tops];
    const workers: Promise<void>[] = [];

    const worker = async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) return;
        try {
          const body = await fetchPostBody(browser, item.url);
          const text = body.body || '';
          const wordCount = text.split(/\s+/).filter(Boolean).length;
          const charCount = text.length;
          const date = parseKoreanDate(item.date || '');
          const ageDays = date ? Math.floor((Date.now() - date.getTime()) / 86400000) : null;
          results.push({
            rank: item.rank,
            title: body.title || item.title,
            url: item.url,
            bloggerName: item.blogger,
            postDate: item.date,
            bodyText: text.slice(0, 8000), // 안전 상한
            h2Count: body.h2,
            h3Count: body.h3,
            imageCount: body.img,
            videoCount: body.vid,
            externalLinkCount: body.ext,
            wordCount,
            charCount,
            ageDays,
          });
        } catch (err) {
          console.warn(`[SERP-FETCH] ${item.url} 실패:`, (err as Error).message);
        }
      }
    };

    for (let i = 0; i < concurrent; i++) workers.push(worker());
    await Promise.all(workers);
  } finally {
    await browser.close().catch(() => {});
  }

  results.sort((a, b) => a.rank - b.rank);
  return results;
}
