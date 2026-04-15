// PRO Hunter v12 — Rank Tracker (Phase F)
// 작성: 2026-04-15
// 사용자 등록 글의 순위를 매일 추적 → 예측 vs 실측 비교

import puppeteer from 'puppeteer';
import { listTrackedPosts, recordPostRank } from './tracking-store';

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24시간
let timer: NodeJS.Timeout | null = null;

const SEARCH_URL = (kw: string) =>
  `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(kw)}&sm=tab_opt&nso=so%3Ar%2Cp%3Aall`;

async function findRankForPost(keyword: string, postUrl: string): Promise<number | null> {
  const { findChromePath } = await import('../chrome-finder');
  const chromePath = findChromePath();
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: chromePath || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );
    await page.goto(SEARCH_URL(keyword), { waitUntil: 'domcontentloaded', timeout: 25000 });
    await new Promise((r) => setTimeout(r, 1500));

    // 상위 30개 URL 수집
    const urls = await page.evaluate(() => {
      const out: string[] = [];
      const links = document.querySelectorAll('a[href*="blog.naver.com"]');
      const seen = new Set<string>();
      for (const a of Array.from(links)) {
        const href = (a as HTMLAnchorElement).href;
        if (!href || seen.has(href)) continue;
        if (!/blog\.naver\.com\/[^/]+\/\d+/.test(href)) continue;
        seen.add(href);
        out.push(href);
        if (out.length >= 30) break;
      }
      return out;
    });

    // postUrl 매칭 (정규화)
    const normalize = (u: string) => u.replace(/^https?:\/\//, '').replace(/^m\./, '').replace(/[?#].*$/, '');
    const target = normalize(postUrl);
    for (let i = 0; i < urls.length; i++) {
      if (normalize(urls[i]).includes(target.split('/').slice(0, 3).join('/'))) {
        // postId까지 비교
        const postIdMatch = postUrl.match(/\/(\d+)$/);
        if (postIdMatch && urls[i].includes(postIdMatch[1])) return i + 1;
      }
    }
    return null;
  } finally {
    await browser.close().catch(() => {});
  }
}

async function runCheck(): Promise<void> {
  const posts = listTrackedPosts();
  if (posts.length === 0) return;

  console.log(`[RANK-TRACKER] ${posts.length}개 글 순위 체크 시작`);
  let checked = 0;
  for (const p of posts) {
    try {
      const rank = await findRankForPost(p.keyword, p.postUrl);
      recordPostRank(p.postUrl, rank);
      checked++;
      // rate limit 방지 (네이버 차단 회피)
      await new Promise((r) => setTimeout(r, 3000));
    } catch (err) {
      console.warn(`[RANK-TRACKER] ${p.postUrl} 실패:`, (err as Error).message);
    }
  }
  console.log(`[RANK-TRACKER] ✅ ${checked}/${posts.length} 체크 완료`);
}

export function startRankTracker(): void {
  if (timer) return;
  // 첫 실행은 5분 뒤 (앱 기동과 충돌 방지)
  setTimeout(() => {
    runCheck();
    timer = setInterval(runCheck, CHECK_INTERVAL_MS);
  }, 5 * 60 * 1000);
  console.log('[RANK-TRACKER] ✅ 순위 추적 시작 (24h 주기)');
}

export function stopRankTracker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export async function runRankCheckNow(): Promise<{ checked: number; total: number }> {
  await runCheck();
  return { checked: listTrackedPosts().length, total: listTrackedPosts().length };
}
