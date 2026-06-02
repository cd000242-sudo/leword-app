// v2.42.72: 자동 노출 추적 — 사용자 블로그 RSS → 글 자동 수집 → 키워드 매칭 → SERP 추적 → hit rate 누적
// AI API 미사용 (RSS XML 파싱 + 토큰 매칭 + 모바일 SERP HTTP fetch)
import { ipcMain, app } from 'electron';
import axios from 'axios';
import * as cheerio from 'cheerio';
import * as path from 'path';
import * as fs from 'fs';
import { rankExposureGrowthSeeds } from '../../utils/exposure-growth-loop';

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
    // v2.42.80: m. 서브도메인도 매칭 + PostView 쿼리 형태도 매칭
    const m1 = url.match(/PostView\.naver\?blogId=([^&]+)/i);
    if (m1) return m1[1];
    const m2 = url.match(/(?:m\.)?blog\.naver\.com\/([^/?#]+)/i);
    return m2 ? m2[1] : null;
  } catch { return null; }
}

// URL → { blogId, postNo } (m. 서브도메인 + PostView 형식 모두 지원)
function extractBlogIdPostNo(url: string): { blogId: string; postNo: string } {
  // PostView.naver?blogId=...&logNo=...
  const m1 = url.match(/PostView\.naver\?blogId=([^&]+)&logNo=(\d+)/i);
  if (m1) return { blogId: m1[1], postNo: m1[2] };
  // blog.naver.com/{id}/{postNo} 또는 m.blog.naver.com/{id}/{postNo}
  const m2 = url.match(/(?:m\.)?blog\.naver\.com\/([^/?#]+)\/(\d+)/i);
  if (m2) return { blogId: m2[1], postNo: m2[2] };
  return { blogId: extractBlogId(url) || '', postNo: '' };
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

// v2.42.83: 글 제목에서 핵심 키워드 후보 자동 추출 (휴리스틱 — 한국어 형태소 분석 없음)
function extractCoreKeywords(title: string, maxCandidates = 3): string[] {
  if (!title) return [];
  let clean = title
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/["""''『』「」<>《》]/g, ' ')
    .replace(/[…⋯—–]/g, ' ')
    .replace(/[^ 가-힣a-zA-Z0-9% ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 광범위 불용어 (조사/어미/형용사/일반 단어)
  const STOPS = new Set([
    // 매체 라벨
    '단독', '종합', '속보', '경향', '뉴스', '취재', '인터뷰', '화보',
    // 일반 형용/명사
    '추천', '리뷰', '후기', '소식', '공개', '발표', '경악', '충격', '폭로', '주목',
    // 의문/지시
    '왜', '어떻게', '무엇', '내가', '내', '그', '이', '저', '나의', '우리',
    '오늘', '어제', '내일', '지금', '드디어', '결국', '바로',
    '진짜', '정말', '드디어', '갑자기', '함께', '먼저',
    // 의미 없는 일반어
    '방법', '이유', '결과', '비밀', '주의', '필독', '필수', '관련', '대상',
    '분들', '여러분', '직접', '실제', '여전히', '예전',
    // 조사 단독 (혹시)
    '에서', '으로', '에게', '한테', '부터', '까지',
  ]);

  // 끝이 조사/어미로 보이는 토큰은 제외
  const ENDING_JOSA = /(는|은|이|가|을|를|와|과|에|의|도|만|와|과|로|으로|이라|이라고|에서|에게|부터|까지|일까|할까|것|까)$/;
  // 끝이 동사·서술형 어미
  const ENDING_VERB = /(했다|한다|됐다|된다|있다|없다|이다|아니다|줍니다|입니다|했어|놓친|않은|어요|에요|예요)$/;

  const isMeaningfulToken = (t: string): boolean => {
    if (t.length < 2 || t.length > 12) return false;
    if (STOPS.has(t)) return false;
    if (/^\d+%?$/.test(t)) return false;
    if (/^\d+(분|시간|일|초|월|년|만원|원|배)$/.test(t)) return false;
    if (ENDING_VERB.test(t)) return false;
    // 끝 조사 — 길이 3+ 일 때만 조사 의심
    if (t.length >= 3 && ENDING_JOSA.test(t)) {
      // 조사 떼면 의미 명사 남는지 확인 — 안 떼고 그냥 차단
      return false;
    }
    return true;
  };

  const tokens = clean.split(/\s+/).filter(isMeaningfulToken);
  if (tokens.length === 0) return [];

  // 후보 생성: 2~3 토큰 인접 조합 + 단일 토큰 (4자+)
  const candidates: string[] = [];
  for (let len = 3; len >= 2; len--) {
    for (let i = 0; i + len <= tokens.length; i++) {
      candidates.push(tokens.slice(i, i + len).join(' '));
    }
  }
  for (const t of tokens) {
    if (t.length >= 4) candidates.push(t);
  }

  // 중복 제거 + 너무 짧은 거 (5자 미만) 제외
  const seen = new Set<string>();
  const unique = candidates.filter(c => {
    if (seen.has(c)) return false;
    seen.add(c);
    return c.replace(/\s+/g, '').length >= 5;
  });

  // 정렬: 의미 명사 점수 — "지원금/혜택/신청/방법/조회" 같은 도메인 명사 가산점
  const DOMAIN_BIAS = /(지원금|혜택|신청|조회|방법|기준|대상|결과|비교|순위|추천|후기|레시피|증상|치료|예방|관리|효과|가격|할인|쿠폰|이벤트|시세|매물|투자|수익|재테크|면접|자격증|연봉|이직|취업)/;
  const scored = unique.map(c => {
    let s = 0;
    if (DOMAIN_BIAS.test(c)) s += 10;
    // 토큰 수 2개일 때 약간 우대 (짧고 명확)
    const tk = c.split(/\s+/).length;
    if (tk === 2) s += 3;
    if (tk === 3) s += 1;
    // 글자수 적당 (8~14자) 우대
    const len = c.replace(/\s+/g, '').length;
    if (len >= 7 && len <= 14) s += 2;
    return { c, s };
  }).sort((a, b) => b.s - a.s);

  return scored.slice(0, maxCandidates).map(x => x.c);
}

// v2.42.89: 모바일 SERP는 차단 빈번 → 데스크탑 search.naver.com 사용 (200 OK 안정)
const DESKTOP_UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
];

type SerpStatus = 'found' | 'not-in-top30' | 'blocked' | 'error' | 'invalid-url';

export async function closeExposureBrowser(): Promise<void> {
  const { browserPool } = await import('../../utils/puppeteer-pool');
  await browserPool.closeIdle();
}

function parseHtmlForRank(html: string, blogId: string, postNo: string): { rank: number | null; status: SerpStatus } {
  const $ = cheerio.load(html);
  const links: { href: string; isAd: boolean }[] = [];
  $('a').each((_i, el) => {
    const href = String($(el).attr('href') || '');
    if (!/(?:m\.)?blog\.naver\.com/.test(href)) return;
    const $parent = $(el).closest('.type_ad,.ad_section,.lst_ad');
    links.push({ href, isAd: $parent.length > 0 });
  });
  let rank = 0;
  const seen = new Set<string>();
  for (const { href, isAd } of links) {
    if (isAd) continue;
    const { blogId: hBlogId, postNo: hPostNo } = extractBlogIdPostNo(href);
    const key = `${hBlogId}/${hPostNo}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rank++;
    if (rank > 30) break;
    const matches = postNo ? (hBlogId === blogId && hPostNo === postNo) : (hBlogId === blogId);
    if (matches) return { rank, status: 'found' };
  }
  return { rank: null, status: 'not-in-top30' };
}

async function checkSerpRankHttp(keyword: string, blogId: string, postNo: string): Promise<{ rank: number | null; status: SerpStatus }> {
  try {
    const ua = DESKTOP_UAS[Math.floor(Math.random() * DESKTOP_UAS.length)];
    // v2.42.89: 데스크탑 SERP — m.search.naver.com 보다 차단 적음
    const url = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}`;
    const resp = await axios.get(url, {
      timeout: 12000,
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Referer': 'https://www.naver.com/',
      },
      responseType: 'text',
      validateStatus: () => true,
    });
    if (resp.status === 429 || resp.status === 403) return { rank: null, status: 'blocked' };
    if (resp.status !== 200) return { rank: null, status: 'error' };
    return parseHtmlForRank(resp.data as string, blogId, postNo);
  } catch (err: any) {
    return { rank: null, status: 'error' };
  }
}

async function checkSerpRankPlaywright(keyword: string, blogId: string, postNo: string): Promise<{ rank: number | null; status: SerpStatus }> {
  let browser: any = null;
  let page: any = null;
  try {
    const { browserPool } = await import('../../utils/puppeteer-pool');
    browser = await browserPool.acquire();
    const ua = DESKTOP_UAS[Math.floor(Math.random() * DESKTOP_UAS.length)];
    page = await browser.newPage({
      userAgent: ua,
      viewport: { width: 1280, height: 800 },
      locale: 'ko-KR',
      extraHTTPHeaders: { 'Accept-Language': 'ko-KR,ko;q=0.9' },
    });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    // v2.42.89: 데스크탑 SERP — 차단 회피
    const url = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}`;
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    if (!resp || resp.status() === 403 || resp.status() === 429) {
      return { rank: null, status: 'blocked' };
    }
    await page.waitForTimeout(800 + Math.random() * 600);
    const html = await page.content();
    return parseHtmlForRank(html, blogId, postNo);
  } catch (err: any) {
    console.warn('[EXPOSURE-PLAYWRIGHT] err:', err?.message);
    return { rank: null, status: 'error' };
  } finally {
    try { if (page) await page.close(); } catch {}
    if (browser) {
      try {
        const { browserPool } = await import('../../utils/puppeteer-pool');
        browserPool.release(browser);
      } catch {}
    }
  }
}

// v2.42.90: 네이버 블로그 검색 API 우선 사용 — 차단 없음, 100건까지 받음
async function checkSerpRankNaverApi(keyword: string, blogId: string, postNo: string): Promise<{ rank: number | null; status: SerpStatus }> {
  try {
    const { EnvironmentManager } = await import('../../utils/environment-manager');
    const env = EnvironmentManager.getInstance().getConfig();
    const clientId = env.naverClientId || process.env['NAVER_CLIENT_ID'] || '';
    const clientSecret = env.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '';
    if (!clientId || !clientSecret) return { rank: null, status: 'error' }; // 키 없으면 폴백

    const url = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(keyword)}&display=30&sort=sim`;
    const resp = await axios.get(url, {
      timeout: 10000,
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
      validateStatus: () => true,
    });
    if (resp.status === 429) return { rank: null, status: 'blocked' };
    if (resp.status !== 200) return { rank: null, status: 'error' };

    const items = resp.data?.items || [];
    let rank = 0;
    const seen = new Set<string>();
    for (const it of items) {
      const link = String(it?.link || '');
      const { blogId: hBlogId, postNo: hPostNo } = extractBlogIdPostNo(link);
      const key = `${hBlogId}/${hPostNo}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rank++;
      if (rank > 30) break;
      const matches = postNo ? (hBlogId === blogId && hPostNo === postNo) : (hBlogId === blogId);
      if (matches) return { rank, status: 'found' };
    }
    return { rank: null, status: 'not-in-top30' };
  } catch (err: any) {
    console.warn('[EXPOSURE-API] err:', err?.message);
    return { rank: null, status: 'error' };
  }
}

// v2.42.90: 자동 폴백 체인 — Naver Open API → HTTP SERP → Playwright SERP
let preferPlaywright = false;
async function checkSerpRank(keyword: string, postUrl: string): Promise<{ rank: number | null; status: SerpStatus; method?: 'naver-api' | 'http' | 'playwright' }> {
  const { blogId, postNo } = extractBlogIdPostNo(postUrl);
  if (!blogId) return { rank: null, status: 'invalid-url' };

  // 1순위: 네이버 검색 API (차단 없음, 안정)
  const apiResult = await checkSerpRankNaverApi(keyword, blogId, postNo);
  if (apiResult.status === 'found' || apiResult.status === 'not-in-top30') {
    return { ...apiResult, method: 'naver-api' };
  }
  // API 키 없거나 실패 → HTTP SERP
  if (!preferPlaywright) {
    const httpResult = await checkSerpRankHttp(keyword, blogId, postNo);
    if (httpResult.status !== 'blocked') {
      return { ...httpResult, method: 'http' };
    }
    console.warn('[EXPOSURE-TRACKING] HTTP 차단 → Playwright 자동 전환');
    preferPlaywright = true;
  }
  const pwResult = await checkSerpRankPlaywright(keyword, blogId, postNo);
  return { ...pwResult, method: 'playwright' };
}

// v2.42.81: 사용자 입력을 RSS URL 로 자동 정규화
//   허용 입력: 블로그 ID / 블로그 URL / 글 URL / 모바일 URL / 이미 RSS URL
function normalizeBlogRssUrl(input: string): string | null {
  const s = String(input || '').trim();
  if (!s) return null;
  // 1) 이미 RSS URL: rss.blog.naver.com/{id}.xml
  const rssWithXml = s.match(/rss\.blog\.naver\.com\/([^/?#]+)\.xml/i);
  if (rssWithXml) return `https://rss.blog.naver.com/${rssWithXml[1]}.xml`;
  // 1b) .xml 없는 RSS 도메인
  const rssNoXml = s.match(/rss\.blog\.naver\.com\/([^/?#]+)/i);
  if (rssNoXml) {
    const id = rssNoXml[1].replace(/\.xml$/i, '');
    return `https://rss.blog.naver.com/${id}.xml`;
  }
  // 2) PostView.naver?blogId=xxx  (urlMatch보다 먼저 — URL에 PostView 포함될 수 있음)
  const pvMatch = s.match(/PostView\.naver\?blogId=([^&]+)/i);
  if (pvMatch) return `https://rss.blog.naver.com/${pvMatch[1]}.xml`;
  // 3) blog.naver.com/{id}/... 또는 m.blog.naver.com/{id}/...
  const urlMatch = s.match(/(?:m\.)?blog\.naver\.com\/([^/?#]+)/i);
  if (urlMatch && urlMatch[1].toLowerCase() !== 'postview.naver') {
    return `https://rss.blog.naver.com/${urlMatch[1]}.xml`;
  }
  // 4) 블로그 ID 단독 (영문/숫자/대시/언더스코어/마침표)
  if (/^[a-zA-Z0-9._-]+$/.test(s)) return `https://rss.blog.naver.com/${s}.xml`;
  return null;
}

export function setupExposureTrackingHandlers(): void {
  // 1. RSS URL 저장/조회 — 어떤 형태로 입력해도 자동 RSS URL 변환
  //    v2.42.87: RSS 변경 시 이전 블로그의 tracked/history 자동 클리어 (혼란 방지)
  if (!ipcMain.listenerCount('exposure-set-blog-rss')) {
    ipcMain.handle('exposure-set-blog-rss', async (_e, p: { rssUrl: string }) => {
      try {
        const raw = String(p?.rssUrl || '').trim();
        const normalized = normalizeBlogRssUrl(raw);
        if (!normalized) {
          return { success: false, error: '인식할 수 없는 형식입니다. 블로그 ID(예: rimi_77-) 또는 블로그 URL을 입력하세요.' };
        }
        // 정규화된 URL 이 실제로 RSS 로 접근 가능한지 검증 (200 + <item>+ 1개 이상)
        try {
          const probe = await axios.get(normalized, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LEWORD-tracker/1.0)' },
            timeout: 8000, responseType: 'text', validateStatus: () => true,
          });
          if (probe.status !== 200 || !String(probe.data || '').includes('<item')) {
            return {
              success: false,
              error: `등록 실패: "${raw}" 의 RSS 를 찾을 수 없습니다. 블로그 ID를 다시 확인하세요. (시도한 URL: ${normalized})`,
            };
          }
        } catch (probeErr: any) {
          return { success: false, error: `RSS 접속 실패: ${probeErr?.message}` };
        }

        const cfg = readJson<{ rssUrl?: string }>(FILE_CONFIG(), {});
        const previousUrl = cfg.rssUrl;

        // v2.42.87: 블로그 변경 감지 → 이전 데이터 자동 클리어
        let cleared = { tracked: 0, keywordHistory: 0 };
        if (previousUrl && previousUrl !== normalized) {
          const prevTracked = readJson<TrackedKeyword[]>(FILE_TRACKED(), []);
          cleared.tracked = prevTracked.length;
          writeJson(FILE_TRACKED(), []);
          const prevKwHistory = readJson<any[]>(FILE_KEYWORD_HISTORY(), []);
          cleared.keywordHistory = prevKwHistory.length;
          writeJson(FILE_KEYWORD_HISTORY(), []);
          console.log(`[EXPOSURE-TRACKING] 블로그 변경: ${previousUrl} → ${normalized}, 이전 데이터 클리어 (tracked=${cleared.tracked}, history=${cleared.keywordHistory})`);
        }

        cfg.rssUrl = normalized;
        writeJson(FILE_CONFIG(), cfg);
        return {
          success: true,
          rssUrl: normalized,
          originalInput: raw,
          previousBlog: previousUrl && previousUrl !== normalized ? previousUrl : null,
          cleared,
        };
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

  // 4. RSS 글 ↔ 키워드 매칭 (v2.42.83 강화)
  //    1차: LEWORD history 매칭 (홈판/마인드맵에서 발굴한 키워드와 글 제목 토큰 80%+ 매칭)
  //    2차: 제목에서 핵심 키워드 자동 추출 → 글마다 최대 N개 페어 자동 등록
  //    이로써 LEWORD history 가 비어있어도 작동
  if (!ipcMain.listenerCount('exposure-auto-match')) {
    ipcMain.handle('exposure-auto-match', async (_e, payload?: { autoExtract?: boolean; perPost?: number }) => {
      try {
        const autoExtract = payload?.autoExtract !== false; // 기본 true
        const perPost = Math.max(1, Math.min(5, payload?.perPost || 3));

        const cfg = readJson<{ rssUrl?: string }>(FILE_CONFIG(), {});
        if (!cfg.rssUrl) return { success: false, error: 'RSS URL 미등록' };
        const posts = await fetchBlogPostsFromRss(cfg.rssUrl);
        const kwHistory = readJson<Array<{ keyword: string; category?: string; recordedAt: string }>>(FILE_KEYWORD_HISTORY(), []);
        const tracked = readJson<TrackedKeyword[]>(FILE_TRACKED(), []);
        const existingKey = new Set(tracked.map(t => `${t.keyword}|${t.postUrl}`));

        let historyMatches = 0;
        let autoExtractMatches = 0;

        // 1차: LEWORD history 매칭
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
            historyMatches++;
          }
        }

        // 2차: 글 제목 자체에서 핵심 키워드 자동 추출
        if (autoExtract) {
          for (const post of posts) {
            const candidates = extractCoreKeywords(post.title, perPost);
            for (const kw of candidates) {
              const k = `${kw}|${post.url}`;
              if (existingKey.has(k)) continue;
              tracked.push({
                keyword: kw,
                postUrl: post.url,
                postTitle: post.title,
                category: 'auto-extracted',
                registeredAt: new Date().toISOString(),
                history: [],
              });
              existingKey.add(k);
              autoExtractMatches++;
            }
          }
        }

        writeJson(FILE_TRACKED(), tracked);
        return {
          success: true,
          newMatches: historyMatches + autoExtractMatches,
          historyMatches,
          autoExtractMatches,
          totalTracked: tracked.length,
        };
      } catch (err: any) { return { success: false, error: err?.message }; }
    });
  }

  // 5. SERP 추적 1회 (전체 tracked 순회)
  //    v2.42.88: 차단 회피 — 직렬 호출 + 요청 간격 1.2s + 차단 감지 시 즉시 중단
  if (!ipcMain.listenerCount('exposure-run-serp-check')) {
    ipcMain.handle('exposure-run-serp-check', async (event, payload?: { maxItems?: number }) => {
      try {
        const tracked = readJson<TrackedKeyword[]>(FILE_TRACKED(), []);
        if (tracked.length === 0) return { success: true, checked: 0, exposed: 0, blocked: 0 };

        // 미체크 우선, 그 다음 오래된 체크 우선
        const sorted = [...tracked].sort((a, b) => (a.history.length - b.history.length));
        const maxItems = Math.min(payload?.maxItems || 50, sorted.length);
        const targets = sorted.slice(0, maxItems);

        let checked = 0, exposed = 0, blocked = 0, errored = 0;
        const ts = new Date().toISOString();
        let blockedStreak = 0;

        for (const t of targets) {
          const r = await checkSerpRank(t.keyword, t.postUrl);
          const inTop30 = r.status === 'found' && r.rank !== null && r.rank <= 30;
          const inTop10 = r.status === 'found' && r.rank !== null && r.rank <= 10;
          const check: SerpCheck = {
            checkedAt: ts,
            inTop10,
            inTop30,
            rank: r.rank,
          };
          // 차단/에러는 history 기록 X — 다음 사이클에서 재시도 (체크된 척 안 함)
          if (r.status === 'blocked') {
            blocked++;
            blockedStreak++;
            // 5건 연속 차단이면 중단 (IP 차단 회피)
            if (blockedStreak >= 5) {
              console.warn('[EXPOSURE-TRACKING] 차단 5건 연속 → 중단 (잠시 후 재시도 권장)');
              break;
            }
          } else if (r.status === 'error') {
            errored++;
            blockedStreak = 0;
          } else {
            t.history.push(check);
            if (t.history.length > 30) t.history = t.history.slice(-30);
            t.lastCheckedAt = ts;
            checked++;
            if (inTop30) exposed++;
            blockedStreak = 0;
          }

          try { event.sender.send('exposure-progress', { checked, blocked, errored, total: targets.length, exposed }); } catch {}

          // 요청 간격 1.2~1.8초 (랜덤) — IP 차단 회피
          await new Promise(res => setTimeout(res, 1200 + Math.random() * 600));
        }

        writeJson(FILE_TRACKED(), tracked);
        return {
          success: true,
          checked, exposed, blocked, errored,
          hitRate30: checked > 0 ? Math.round((exposed / checked) * 100) : 0,
          blockedHit: blockedStreak >= 5,
          message: blockedStreak >= 5
            ? '⚠️ 네이버가 일시 차단 (IP 보호) — 10~30분 후 다시 시도하세요'
            : (blocked > 0 ? `${blocked}건 차단됨 (재시도 필요)` : null),
        };
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

        // v2.42.84: hit rate 분모는 "측정된 페어"만 — 미체크 페어로 0% 표시되는 오해 방지
        const checkedItems = items.filter(i => (i.totalChecks || 0) > 0);

        const catMap: Record<string, { tracked: number; checked: number; top10: number; top30: number }> = {};
        for (const i of items) {
          const c = i.category || 'general';
          if (!catMap[c]) catMap[c] = { tracked: 0, checked: 0, top10: 0, top30: 0 };
          catMap[c].tracked++;
          if ((i.totalChecks || 0) > 0) {
            catMap[c].checked++;
            if (i.currentInTop10) catMap[c].top10++;
            if (i.currentInTop30) catMap[c].top30++;
          }
        }
        const byCategory = Object.entries(catMap).map(([cat, s]) => ({
          category: cat,
          tracked: s.tracked,
          checked: s.checked,
          top10: s.top10,
          top30: s.top30,
          hitRate10: s.checked ? Math.round((s.top10 / s.checked) * 100) : 0,
          hitRate30: s.checked ? Math.round((s.top30 / s.checked) * 100) : 0,
        })).sort((a, b) => b.hitRate30 - a.hitRate30);

        const totalChecks = items.reduce((s, i) => s + i.totalChecks, 0);
        const totalExposed30 = items.filter(i => i.currentInTop30).length;
        const totalExposed10 = items.filter(i => i.currentInTop10).length;
        const checkedPairs = checkedItems.length;
        const uncheckedPairs = items.length - checkedPairs;
        const expansionSeeds = rankExposureGrowthSeeds(tracked, { limit: 12, expansionLimit: 6 });

        return {
          success: true,
          configured: !!cfg.rssUrl,
          rssUrl: cfg.rssUrl,
          totals: {
            keywordHistorySize: kwHistory.length,
            trackedPairs: items.length,
            checkedPairs,
            uncheckedPairs,
            totalChecks,
            currentlyInTop30: totalExposed30,
            currentlyInTop10: totalExposed10,
            // v2.42.84: hit rate 분모는 측정된 페어만
            hitRate30: checkedPairs ? Math.round((totalExposed30 / checkedPairs) * 100) : 0,
            hitRate10: checkedPairs ? Math.round((totalExposed10 / checkedPairs) * 100) : 0,
            expansionSeedCount: expansionSeeds.length,
          },
          byCategory,
          expansionSeeds,
          items: items.sort((a, b) => (b.totalChecks - a.totalChecks)),
        };
      } catch (err: any) { return { success: false, error: err?.message }; }
    });
  }

  // v2.42.90: 수동 초기화 — 모든 추적/키워드 history 삭제 (블로그 바꿔도 데이터 안 지워지는 경우)
  if (!ipcMain.listenerCount('exposure-clear-all')) {
    ipcMain.handle('exposure-clear-all', async () => {
      try {
        const t = readJson<TrackedKeyword[]>(FILE_TRACKED(), []);
        const k = readJson<any[]>(FILE_KEYWORD_HISTORY(), []);
        writeJson(FILE_TRACKED(), []);
        writeJson(FILE_KEYWORD_HISTORY(), []);
        return { success: true, cleared: { tracked: t.length, keywordHistory: k.length } };
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
