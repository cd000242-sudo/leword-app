// PRO Hunter v12 — Rank Tracker (Phase F)
// 작성: 2026-04-15
// 사용자 등록 글의 순위를 매일 추적 → 예측 vs 실측 비교

import { listTrackedPosts, recordPostRank, recordPostRankMulti } from './tracking-store';
import { notifyRankChange } from './notifier';
import { retrainFromTracking } from './model-retrainer';
import { browserPool } from '../puppeteer-pool';
import { isSameNaverBlogPost } from './rank-url-normalizer';

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24시간
let timer: NodeJS.Timeout | null = null;
let initTimer: NodeJS.Timeout | null = null;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const SEARCH_URL = (kw: string) =>
  `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(kw)}&sm=tab_opt&nso=so%3Ar%2Cp%3Aall`;

async function findRankForPost(keyword: string, postUrl: string): Promise<number | null> {
  let browser: any = null;
  let page: any = null;
  try {
    browser = await browserPool.acquire();
    page = await browser.newPage({
      userAgent: USER_AGENT,
      viewport: { width: 1280, height: 800 },
      locale: 'ko-KR',
      extraHTTPHeaders: { 'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7' },
    });
    await page.setUserAgent(USER_AGENT);
    await page.goto(SEARCH_URL(keyword), { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(1200);

    // 상위 30개 URL 수집
    const urls = await page.evaluate(() => {
      const out: string[] = [];
      const links = document.querySelectorAll('a[href*="blog.naver.com"]');
      const seen = new Set<string>();
      for (const a of Array.from(links)) {
        const href = (a as HTMLAnchorElement).href;
        if (!href || seen.has(href)) continue;
        let expanded = href;
        try {
          expanded = decodeURIComponent(href);
        } catch {}
        const isPathPost = /(?:m\.)?blog\.naver\.com\/[^/?#]+\/\d+/i.test(expanded);
        const isPostView = /PostView\.naver\?[^#\s]*(?:blogId=|logNo=)/i.test(expanded);
        const isRedirect = /[?&](?:u|url|target)=https?:\/\/(?:m\.)?blog\.naver\.com/i.test(expanded);
        if (!isPathPost && !isPostView && !isRedirect) continue;
        seen.add(href);
        out.push(href);
        if (out.length >= 30) break;
      }
      return out;
    });

    // postUrl 매칭 (정규화)
    for (let i = 0; i < urls.length; i++) {
      if (isSameNaverBlogPost(urls[i], postUrl)) {
        // postId까지 비교
        return i + 1;
      }
    }
    return null;
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) browserPool.release(browser);
  }
}

async function runCheck(): Promise<void> {
  // v2.46.0 E: 사용자 발굴 중이면 skip
  try {
    const { shouldSkipBackground } = require('../hunt-progress-flag');
    if (shouldSkipBackground()) {
      console.log('[RANK-TRACKER] ⏸ 사용자 발굴 중 — 순위 체크 skip');
      return;
    }
  } catch {}
  const posts = listTrackedPosts();
  if (posts.length === 0) return;

  console.log(`[RANK-TRACKER] ${posts.length}개 글 순위 체크 시작`);
  let checked = 0;
  for (const p of posts) {
    try {
      // 다중 키워드 지원 (없으면 단일 키워드만)
      const keywords = p.keywords && p.keywords.length > 0 ? p.keywords : [p.keyword];
      const perKeyword: Record<string, number | null> = {};
      const prevRank = [...p.history].reverse().find((h) => h.rank != null)?.rank ?? null;

      for (const kw of keywords) {
        try {
          const rank = await findRankForPost(kw, p.postUrl);
          perKeyword[kw] = rank;
          await new Promise((r) => setTimeout(r, 2000));
        } catch (err) {
          perKeyword[kw] = null;
        }
      }

      // 다중 결과 저장
      if (keywords.length > 1) {
        recordPostRankMulti(p.postUrl, perKeyword);
      } else {
        recordPostRank(p.postUrl, perKeyword[keywords[0]] ?? null);
      }

      // 가장 좋은 순위로 알림 판정
      const ranks = Object.values(perKeyword).filter((r): r is number => r != null);
      const bestRank = ranks.length > 0 ? Math.min(...ranks) : null;
      notifyRankChange(p.keyword, prevRank, bestRank);

      checked++;
      await new Promise((r) => setTimeout(r, 1500));
    } catch (err) {
      console.warn(`[RANK-TRACKER] ${p.postUrl} 실패:`, (err as Error).message);
    }
  }
  console.log(`[RANK-TRACKER] ✅ ${checked}/${posts.length} 체크 완료`);

  // 체크 후 모델 자동 보정 (5개 이상 샘플이 있을 때)
  try {
    const r = retrainFromTracking();
    if (r.trained >= 5) {
      console.log(`[RANK-TRACKER] 🤖 모델 자동 보정: ${r.trained}개 샘플, bias=${r.bias}`);
    }
  } catch (err) {
    console.warn('[RANK-TRACKER] 모델 보정 실패:', (err as Error).message);
  }
}

export function startRankTracker(): void {
  if (timer || initTimer) return;
  const { markWorkerStarted, markWorkerTick } = require('./worker-status');
  markWorkerStarted('rank');
  initTimer = setTimeout(() => {
    initTimer = null;
    Promise.resolve(runCheck()).then(() => markWorkerTick('rank')).catch((e: any) => markWorkerTick('rank', e?.message));
    timer = setInterval(() => {
      Promise.resolve(runCheck()).then(() => markWorkerTick('rank')).catch((e: any) => markWorkerTick('rank', e?.message));
    }, CHECK_INTERVAL_MS);
    (timer as any).unref?.(); // v2.45.0
  }, 5 * 60 * 1000);
  (initTimer as any).unref?.();
  console.log('[RANK-TRACKER] ✅ 순위 추적 시작 (24h 주기)');
}

export function stopRankTracker(): void {
  if (initTimer) {
    clearTimeout(initTimer);
    initTimer = null;
  }
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export async function runRankCheckNow(): Promise<{ checked: number; total: number }> {
  await runCheck();
  return { checked: listTrackedPosts().length, total: listTrackedPosts().length };
}
