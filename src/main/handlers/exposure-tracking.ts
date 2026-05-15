// v2.42.72: 자동 노출 추적 — 사용자 블로그 RSS → 글 자동 수집 → 키워드 매칭 → SERP 추적 → hit rate 누적
// AI API 미사용 (RSS XML 파싱 + 토큰 매칭 + 모바일 SERP HTTP fetch)
import { ipcMain, app } from 'electron';
import axios from 'axios';
import * as cheerio from 'cheerio';
import * as path from 'path';
import * as fs from 'fs';

interface BlogPost {
  url: string;
  title: string;
  publishedAt: string; // ISO date
  description?: string;
}

interface TrackedKeyword {
  keyword: string;
  postUrl: string;
  postTitle: string;
  category?: string;
  registeredAt: string;
  lastCheckedAt?: string;
  history: SerpCheck[];
}

interface SerpCheck {
  checkedAt: string;
  inTop10: boolean;
  inTop30: boolean;
  rank: number | null; // null = not in top 30
}

const STORAGE_DIR = () => path.join(app.getPath('userData'), 'exposure-tracking');
const FILE_CONFIG = () => path.join(STORAGE_DIR(), 'config.json');
const FILE_TRACKED = () => path.join(STORAGE_DIR(), 'tracked.json');
const FILE_KEYWORD_HISTORY = () => path.join(STORAGE_DIR(), 'keyword-history.json');

function ensureDir(): void {
  const dir = STORAGE_DIR();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch { return fallback; }
}

function writeJson(file: string, data: unknown): void {
  ensureDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// 블로그 ID 추출 (https://blog.naver.com/{id}/... or https://m.blog.naver.com/{id}/...)
function extractBlogId(url: string): string | null {
  try {
    const m = url.match(/blog\.naver\.com\/([^/?#]+)/i);
    return m ? m[1] : null;
  } catch { return null; }
}

// RSS XML → BlogPost[]
async function fetchBlogPostsFromRss(rssUrl: string): Promise<BlogPost[]> {
  const resp = await axios.get(rssUrl, {
    timeout: 10000,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LEWORD-tracker/1.0)' },
    responseType: 'text',
  });
  const xml = resp.data as string;
  const $ = cheerio.load(xml, { xmlMode: true });
  const posts: BlogPost[] = [];
  $('item').each((_i, el) => {
    const $el = $(el);
    const url = $el.find('link').first().text().trim();
    const title = $el.find('title').first().text().trim();
    const pubDateStr = $el.find('pubDate').first().text().trim();
    const description = $el.find('description').first().text().trim();
    if (url && title) {
      const publishedAt = pubDateStr ? new Date(pubDateStr).toISOString() : new Date().toISOString();
      posts.push({ url, title, publishedAt, description: description?.slice(0, 300) });
    }
  });
  return posts;
}

// 토큰 매칭: 키워드의 토큰 ≥80% 가 글 제목에 등장하면 match
function matchKeywordToTitle(keyword: string, title: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[\s　]+/g, ' ').trim();
  const tokens = norm(keyword).split(/\s+/).filter(t => t.length >= 2);
  if (tokens.length === 0) return false;
  const titleN = norm(title);
  const hits = tokens.filter(t => titleN.includes(t)).length;
  return hits / tokens.length >= 0.8;
}

// 모바일 SERP 에서 특정 blogId+postNo 가 몇 위에 있는지 확인 (top 30)
async function checkSerpRank(keyword: string, postUrl: string): Promise<{ rank: number | null }> {
  // post URL → blogId + postNo
  const m = postUrl.match(/blog\.naver\.com\/(?:PostView\.naver\?blogId=([^&]+)&logNo=(\d+)|([^/?#]+)\/(\d+))/i);
  let blogId = ''; let postNo = '';
  if (m) {
    blogId = m[1] || m[3] || '';
    postNo = m[2] || m[4] || '';
  } else {
    blogId = extractBlogId(postUrl) || '';
  }
  if (!blogId) return { rank: null };

  try {
    const url = `https://m.search.naver.com/search.naver?where=view&sm=tab_jum&query=${encodeURIComponent(keyword)}`;
    const resp = await axios.get(url, {
      timeout: 12000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      responseType: 'text',
    });
    const html = resp.data as string;
    const $ = cheerio.load(html);

    const links: { href: string; isAd: boolean }[] = [];
    $('a').each((_i, el) => {
      const href = String($(el).attr('href') || '');
      if (!href.includes('blog.naver.com')) return;
      const $parent = $(el).closest('.type_ad,.ad_section,.lst_ad');
      links.push({ href, isAd: $parent.length > 0 });
    });

    let rank = 0;
    const seen = new Set<string>();
    for (const { href, isAd } of links) {
      if (isAd) continue;
      // dedupe by blogId+postNo combo
      const hrefM = href.match(/blog\.naver\.com\/(?:PostView\.naver\?blogId=([^&]+)&logNo=(\d+)|([^/?#]+)\/(\d+))/i);
      const hBlogId = hrefM?.[1] || hrefM?.[3] || extractBlogId(href) || '';
      const hPostNo = hrefM?.[2] || hrefM?.[4] || '';
      const key = `${hBlogId}/${hPostNo}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rank++;
      if (rank > 30) break;
      const matches = postNo ? (hBlogId === blogId && hPostNo === postNo) : (hBlogId === blogId);
      if (matches) return { rank };
    }
    return { rank: null };
  } catch (err: any) {
    console.warn('[EXPOSURE-TRACKING] SERP fetch failed:', err?.message);
    return { rank: null };
  }
}

export function setupExposureTrackingHandlers(): void {
  // 1. RSS URL 저장/조회
  if (!ipcMain.listenerCount('exposure-set-blog-rss')) {
    ipcMain.handle('exposure-set-blog-rss', async (_e, p: { rssUrl: string }) => {
      try {
        const cfg = readJson<{ rssUrl?: string }>(FILE_CONFIG(), {});
        cfg.rssUrl = String(p?.rssUrl || '').trim();
        writeJson(FILE_CONFIG(), cfg);
        return { success: true, rssUrl: cfg.rssUrl };
      } catch (err: any) { return { success: false, error: err?.message }; }
    });
  }
  if (!ipcMain.listenerCount('exposure-get-config')) {
    ipcMain.handle('exposure-get-config', async () => {
      const cfg = readJson<{ rssUrl?: string }>(FILE_CONFIG(), {});
      return { success: true, ...cfg };
    });
  }

  // 2. RSS 글 목록 가져오기 (사용자 블로그 글)
  if (!ipcMain.listenerCount('exposure-fetch-blog-posts')) {
    ipcMain.handle('exposure-fetch-blog-posts', async () => {
      try {
        const cfg = readJson<{ rssUrl?: string }>(FILE_CONFIG(), {});
        if (!cfg.rssUrl) return { success: false, error: 'RSS URL 미등록' };
        const posts = await fetchBlogPostsFromRss(cfg.rssUrl);
        return { success: true, posts, count: posts.length };
      } catch (err: any) { return { success: false, error: err?.message }; }
    });
  }

  // 3. LEWORD에서 발굴한 키워드 history 추가 (홈판/마인드맵/PRO 핸터 등에서 호출)
  if (!ipcMain.listenerCount('exposure-record-keyword')) {
    ipcMain.handle('exposure-record-keyword', async (_e, p: { keyword: string; category?: string; source?: string }) => {
      try {
        const kw = String(p?.keyword || '').trim();
        if (!kw) return { success: false, error: 'no keyword' };
        const list = readJson<Array<{ keyword: string; category?: string; source?: string; recordedAt: string }>>(FILE_KEYWORD_HISTORY(), []);
        if (!list.find(x => x.keyword === kw)) {
          list.push({ keyword: kw, category: p.category, source: p.source, recordedAt: new Date().toISOString() });
          // 최대 1000개 유지 (오래된 것부터 제거)
          if (list.length > 1000) list.splice(0, list.length - 1000);
          writeJson(FILE_KEYWORD_HISTORY(), list);
        }
        return { success: true, total: list.length };
      } catch (err: any) { return { success: false, error: err?.message }; }
    });
  }

  // 4. RSS 글 ↔ 키워드 history 자동 매칭 (제목 토큰 80%+ 매칭)
  if (!ipcMain.listenerCount('exposure-auto-match')) {
    ipcMain.handle('exposure-auto-match', async () => {
      try {
        const cfg = readJson<{ rssUrl?: string }>(FILE_CONFIG(), {});
        if (!cfg.rssUrl) return { success: false, error: 'RSS URL 미등록' };
        const posts = await fetchBlogPostsFromRss(cfg.rssUrl);
        const kwHistory = readJson<Array<{ keyword: string; category?: string; recordedAt: string }>>(FILE_KEYWORD_HISTORY(), []);
        const tracked = readJson<TrackedKeyword[]>(FILE_TRACKED(), []);
        const existingKey = new Set(tracked.map(t => `${t.keyword}|${t.postUrl}`));

        let newCount = 0;
        for (const post of posts) {
          for (const kw of kwHistory) {
            if (!matchKeywordToTitle(kw.keyword, post.title)) continue;
            const k = `${kw.keyword}|${post.url}`;
            if (existingKey.has(k)) continue;
            tracked.push({
              keyword: kw.keyword,
              postUrl: post.url,
              postTitle: post.title,
              category: kw.category,
              registeredAt: new Date().toISOString(),
              history: [],
            });
            existingKey.add(k);
            newCount++;
          }
        }
        writeJson(FILE_TRACKED(), tracked);
        return { success: true, newMatches: newCount, totalTracked: tracked.length };
      } catch (err: any) { return { success: false, error: err?.message }; }
    });
  }

  // 5. SERP 추적 1회 (전체 tracked 순회)
  if (!ipcMain.listenerCount('exposure-run-serp-check')) {
    ipcMain.handle('exposure-run-serp-check', async (event) => {
      try {
        const tracked = readJson<TrackedKeyword[]>(FILE_TRACKED(), []);
        if (tracked.length === 0) return { success: true, checked: 0, exposed: 0 };

        let checked = 0, exposed = 0;
        const concurrency = 3;
        const ts = new Date().toISOString();
        for (let i = 0; i < tracked.length; i += concurrency) {
          const batch = tracked.slice(i, i + concurrency);
          await Promise.all(batch.map(async t => {
            const { rank } = await checkSerpRank(t.keyword, t.postUrl);
            const check: SerpCheck = {
              checkedAt: ts,
              inTop10: rank !== null && rank <= 10,
              inTop30: rank !== null && rank <= 30,
              rank,
            };
            t.history.push(check);
            // 최대 30개 히스토리 유지
            if (t.history.length > 30) t.history = t.history.slice(-30);
            t.lastCheckedAt = ts;
            checked++;
            if (check.inTop30) exposed++;
          }));
          // 진행 알림
          try { event.sender.send('exposure-progress', { checked, total: tracked.length, exposed }); } catch {}
        }
        writeJson(FILE_TRACKED(), tracked);
        return { success: true, checked, exposed, hitRate30: checked > 0 ? Math.round((exposed / checked) * 100) : 0 };
      } catch (err: any) { return { success: false, error: err?.message }; }
    });
  }

  // 6. 통계 / 대시보드 데이터
  if (!ipcMain.listenerCount('exposure-get-stats')) {
    ipcMain.handle('exposure-get-stats', async () => {
      try {
        const tracked = readJson<TrackedKeyword[]>(FILE_TRACKED(), []);
        const kwHistory = readJson<Array<{ keyword: string; category?: string; recordedAt: string }>>(FILE_KEYWORD_HISTORY(), []);
        const cfg = readJson<{ rssUrl?: string }>(FILE_CONFIG(), {});

        const items = tracked.map(t => {
          const latest = t.history[t.history.length - 1];
          return {
            keyword: t.keyword,
            postUrl: t.postUrl,
            postTitle: t.postTitle,
            category: t.category,
            registeredAt: t.registeredAt,
            lastCheckedAt: t.lastCheckedAt,
            currentRank: latest?.rank ?? null,
            currentInTop10: !!latest?.inTop10,
            currentInTop30: !!latest?.inTop30,
            totalChecks: t.history.length,
            top10Count: t.history.filter(h => h.inTop10).length,
            top30Count: t.history.filter(h => h.inTop30).length,
          };
        });

        // 카테고리별 hit rate
        const catMap: Record<string, { tracked: number; top10: number; top30: number }> = {};
        for (const i of items) {
          const c = i.category || 'general';
          if (!catMap[c]) catMap[c] = { tracked: 0, top10: 0, top30: 0 };
          catMap[c].tracked++;
          if (i.currentInTop10) catMap[c].top10++;
          if (i.currentInTop30) catMap[c].top30++;
        }
        const byCategory = Object.entries(catMap).map(([cat, s]) => ({
          category: cat,
          tracked: s.tracked,
          top10: s.top10,
          top30: s.top30,
          hitRate10: s.tracked ? Math.round((s.top10 / s.tracked) * 100) : 0,
          hitRate30: s.tracked ? Math.round((s.top30 / s.tracked) * 100) : 0,
        })).sort((a, b) => b.hitRate30 - a.hitRate30);

        const totalChecks = items.reduce((s, i) => s + i.totalChecks, 0);
        const totalExposed30 = items.filter(i => i.currentInTop30).length;
        const totalExposed10 = items.filter(i => i.currentInTop10).length;

        return {
          success: true,
          configured: !!cfg.rssUrl,
          rssUrl: cfg.rssUrl,
          totals: {
            keywordHistorySize: kwHistory.length,
            trackedPairs: items.length,
            totalChecks,
            currentlyInTop30: totalExposed30,
            currentlyInTop10: totalExposed10,
            hitRate30: items.length ? Math.round((totalExposed30 / items.length) * 100) : 0,
            hitRate10: items.length ? Math.round((totalExposed10 / items.length) * 100) : 0,
          },
          byCategory,
          items: items.sort((a, b) => (b.totalChecks - a.totalChecks)),
        };
      } catch (err: any) { return { success: false, error: err?.message }; }
    });
  }

  // 7. 수동 페어 등록 (자동 매칭이 못 잡은 경우)
  if (!ipcMain.listenerCount('exposure-add-manual')) {
    ipcMain.handle('exposure-add-manual', async (_e, p: { keyword: string; postUrl: string; postTitle?: string; category?: string }) => {
      try {
        const kw = String(p?.keyword || '').trim();
        const url = String(p?.postUrl || '').trim();
        if (!kw || !url) return { success: false, error: 'keyword/postUrl 필수' };
        const tracked = readJson<TrackedKeyword[]>(FILE_TRACKED(), []);
        if (tracked.find(t => t.keyword === kw && t.postUrl === url)) {
          return { success: false, error: '이미 등록됨' };
        }
        tracked.push({
          keyword: kw, postUrl: url,
          postTitle: p.postTitle || '',
          category: p.category,
          registeredAt: new Date().toISOString(),
          history: [],
        });
        writeJson(FILE_TRACKED(), tracked);
        return { success: true, totalTracked: tracked.length };
      } catch (err: any) { return { success: false, error: err?.message }; }
    });
  }

  // 8. 페어 삭제
  if (!ipcMain.listenerCount('exposure-remove-pair')) {
    ipcMain.handle('exposure-remove-pair', async (_e, p: { keyword: string; postUrl: string }) => {
      try {
        const tracked = readJson<TrackedKeyword[]>(FILE_TRACKED(), []);
        const filtered = tracked.filter(t => !(t.keyword === p.keyword && t.postUrl === p.postUrl));
        writeJson(FILE_TRACKED(), filtered);
        return { success: true, removed: tracked.length - filtered.length };
      } catch (err: any) { return { success: false, error: err?.message }; }
    });
  }

  console.log('[KEYWORD-MASTER] ✅ exposure-tracking 핸들러 8종 등록 완료');
}
