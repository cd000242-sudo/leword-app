// v2.42.72: 자동 노출 추적 — 사용자 블로그 RSS → 글 자동 수집 → 키워드 매칭 → SERP 추적 → hit rate 누적
// AI API 미사용 (RSS XML 파싱 + 토큰 매칭 + 모바일 SERP HTTP fetch)
import { ipcMain, app } from 'electron';
import axios from 'axios';
import { summarizeProof } from '../../utils/leword-proof';
import * as cheerio from 'cheerio';
import * as path from 'path';
import * as fs from 'fs';
import { rankExposureGrowthSeeds } from '../../utils/exposure-growth-loop';
import { transformNaverRequest } from '../../utils/naver-api-hub';
import { pickMeasuredKeywords, pickRelatedKeywords, type RelatedKeyword } from '../../utils/exposure-keyword-picker';
import {
  exactSearchAdTotal,
  getNaverSearchAdKeywordSuggestions,
  getNaverSearchAdKeywordVolume,
  type NaverSearchAdConfig,
} from '../../utils/naver-searchad-api';
import { getNaverAutocompleteQuick } from '../../utils/naver-autocomplete';
import { readSerpStructure, trustedSections } from '../../utils/naver-serp-structure';
import { closeLocalSerpFetch, localSerpFetch, localSerpStats } from '../../utils/local-serp-fetch';
import { NAVER_TABS } from '../../utils/naver-serp-rank';

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
  /**
   * LEWORD 가 고를 때 잰 값. 손으로 넣은 옛 기록에는 없다.
   *
   * 왜 남기나(2026-09-11): 나중에 "정면 N개 이하 · 경쟁 글 M개 이하에서는 올라갔다" 는 경계를
   * **이 블로그 실측으로** 뽑으려면, 고른 순간의 조건을 그때 박아 둬야 한다.
   * 나중에 다시 재면 자리가 이미 변해 있어서 무엇이 갈랐는지 알 수 없다.
   */
  pick?: PickFacts;
  /**
   * 이 검색어의 네이버 통합검색 구획 배치(위→아래). 순위를 재는 회차에 함께 잰다.
   * 사장님 2026-09-30: "배치순서를 보여줫으면좋겠어 예를 들면 AI 답변 뉴스 지식인 블로그 카페".
   */
  serp?: SerpFacts;
}

/** 통합검색 화면에서 실측한 구획 배치. 세대(sectionMarkerVersion)가 다르면 화면은 '안 잼'으로 다룬다. */
interface SerpFacts {
  sections: string[];
  sectionMarkerVersion: number;
  hasAiBriefing: boolean;
  adCount: number;
  measuredAt: string;
}

/** 씨앗 검색어 하나의 실측 연관 검색어 묶음(related.json 한 줄). */
interface RelatedRecord {
  seed: string;
  related: RelatedKeyword[];
  measuredAt: string;
}

/** 고를 때 잰 값 — leword-proof.ts 의 PickFacts 와 같은 모양이다. */
export interface PickFacts {
  source: string;
  searchVolume: number | null;
  documentCount: number | null;
  seat: string | null;
  facing: number | null;
  measuredAt: string;
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
const FILE_RELATED = () => path.join(STORAGE_DIR(), 'related.json');
/** 제목을 검색광고에 물어 본 글(주소 → 물은 시각). 검색량이 안 잡힌 글도 적어 두어 다시 묻지 않는다. */
const FILE_MEASURED_POSTS = () => path.join(STORAGE_DIR(), 'measured-posts.json');

/** 구획 배치는 하루 한 번만 다시 잰다 — 순위 회차마다 통합검색을 또 받으면 차단만 빨라진다. */
const SERP_SECTIONS_TTL_MS = 24 * 60 * 60 * 1000;
/** 연관 검색어는 이레에 한 번 — 검색광고 연관어는 천천히 변한다. */
const RELATED_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** 검색광고 키워드도구는 한 번에 5개씩 받는다(blog-class-rank 와 같은 규격). */
const VOLUME_BATCH = 5;

const compactKey = (s: string) => String(s || '').toLowerCase().replace(/\s+/g, '');

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

/*
 * 2026-09-30: 제목을 잘라 만든 조각(extractCoreKeywords)은 걷어냈다.
 * 추적 319쌍 중 307쌍이 그 조각이었고 검색광고에 물은 12건이 전부 "모름"이었다 —
 * 아무도 안 치는 말에서 1위 하는 건 쉽다(사장님 "추적하는 키워드가 잘못되었어").
 * 이제 후보는 내 블로그 체급이 쓰는 같은 후보기(title-candidates)로 만들고,
 * 검색광고가 검색량을 아는 것만 남긴다. 판정은 exposure-keyword-picker 가 한다.
 */
function searchAdConfig(): NaverSearchAdConfig | null {
  const { EnvironmentManager } = require('../../utils/environment-manager');
  const cfg = EnvironmentManager.getInstance().getConfig() as any;
  const accessLicense = cfg.naverSearchAdAccessLicense || process.env.NAVER_SEARCH_AD_ACCESS_LICENSE || '';
  const secretKey = cfg.naverSearchAdSecretKey || process.env.NAVER_SEARCH_AD_SECRET_KEY || '';
  if (!accessLicense || !secretKey) return null;
  const customerId = cfg.naverSearchAdCustomerId || process.env.NAVER_SEARCH_AD_CUSTOMER_ID || '';
  return customerId ? { accessLicense, secretKey, customerId } : { accessLicense, secretKey };
}

/** 검색광고 키워드도구에 5개씩 물어 {keyword, total} 로 돌려준다. 모르는 말은 total null. */
async function measureVolumes(config: NaverSearchAdConfig, keywords: string[]): Promise<Array<{ keyword: string; total: number | null }>> {
  const byKey = new Map<string, number | null>();
  for (let i = 0; i < keywords.length; i += VOLUME_BATCH) {
    const batch = keywords.slice(i, i + VOLUME_BATCH);
    try {
      const rows = await getNaverSearchAdKeywordVolume(config, batch);
      for (const row of rows) byKey.set(compactKey(row.keyword), exactSearchAdTotal(row));
    } catch (err: any) {
      // 쿼터 소진·네트워크 실패는 "모름"이다 — 0 으로 적지 않는다.
      console.warn('[EXPOSURE-TRACKING] 검색량 실측 실패:', err?.message);
    }
  }
  return keywords.map((keyword) => ({ keyword, total: byKey.get(compactKey(keyword)) ?? null }));
}

/**
 * 통합검색 화면을 이 PC 크로미엄으로 받아 구획 배치를 읽는다. 못 받으면 null(없는 것과 못 본 것을 섞지 않는다).
 * 순위 재기(오픈 API)와 별개의 요청이라 검색어당 하루 한 번만 한다.
 */
async function measureSerpSections(keyword: string): Promise<SerpFacts | null> {
  const allTab = NAVER_TABS.find((t) => t.id === 'all');
  if (!allTab) return null;
  const result = await localSerpFetch(allTab.url(encodeURIComponent(keyword.slice(0, 80))));
  if (!result.ok) return null;
  const structure = readSerpStructure(result.body);
  if (!structure) return null;
  return {
    sections: structure.sections,
    sectionMarkerVersion: structure.sectionMarkerVersion,
    hasAiBriefing: structure.hasAiBriefing,
    adCount: structure.adCount,
    measuredAt: new Date().toISOString(),
  };
}

function isFresh(iso: string | undefined, ttlMs: number): boolean {
  const t = new Date(String(iso || '')).getTime();
  return Number.isFinite(t) && Date.now() - t < ttlMs;
}

/** related.json → growth-loop 가 받는 모양(씨앗 compact 키 → 연관어 문자열). 오래된 것은 뺀다. */
function relatedExpansions(records: Record<string, RelatedRecord>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, rec] of Object.entries(records || {})) {
    if (!rec || !Array.isArray(rec.related) || !isFresh(rec.measuredAt, RELATED_TTL_MS)) continue;
    out[key] = rec.related.map((r) => r.keyword);
  }
  return out;
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

    const { url, headers } = transformNaverRequest(
      `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(keyword)}&display=30&sort=sim`,
      {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      }
    );
    const resp = await axios.get(url, {
      timeout: 10000,
      headers,
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

/**
 * 노출 추적에 글 한 쌍(키워드 · 글 주소)을 등록한다. exposure-add-manual 과 설계실(2026-10-06 3차)이 같은 함수를 쓴다.
 * pick(고른 순간의 실측)은 준 것만 담는다 — 없으면 없는 채로 둔다(빈 값을 잰 것처럼 만들지 않는다).
 */
export function addTrackedPost(p: { keyword: string; postUrl: string; postTitle?: string; category?: string; pick?: PickFacts }): { success: boolean; error?: string; totalTracked?: number } {
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
      ...(p.pick ? { pick: p.pick } : {}),
    });
    writeJson(FILE_TRACKED(), tracked);
    return { success: true, totalTracked: tracked.length };
  } catch (err: any) { return { success: false, error: err?.message }; }
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
          writeJson(FILE_MEASURED_POSTS(), {});
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

  // 4. RSS 글 ↔ 키워드 매칭
  //    1차: LEWORD history 매칭 (홈판/마인드맵에서 발굴한 키워드와 글 제목 토큰 80%+ 매칭)
  //    2차(2026-09-30): 제목 후보 중 **검색광고가 검색량을 아는 말**만 글마다 최대 N개 등록.
  //    검색광고 키가 없으면 2차는 건너뛰고 그 사실을 note 로 알린다 — 조각을 대신 넣지 않는다.
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
        let note: string | null = null;

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

        // 2차: 제목 후보 → 검색광고 실측 → 검색량이 잡힌 말만
        if (autoExtract) {
          const adConfig = searchAdConfig();
          if (!adConfig) {
            note = '검색광고 API 키가 없어 제목에서 검색어를 고르지 못했습니다(환경설정에서 등록)';
          } else {
            // 한 번 물은 글은 다시 묻지 않는다(검색량이 하나도 안 잡힌 글 포함) — 검색광고 호출은 글당 한 번.
            const measuredPosts = readJson<Record<string, string>>(FILE_MEASURED_POSTS(), {});
            for (const post of posts) {
              if (measuredPosts[post.url]) continue;
              const picked = await pickMeasuredKeywords(
                post.title,
                (keywords) => measureVolumes(adConfig, keywords),
                { perPost, candidateLimit: 8 },
              );
              const measuredAt = new Date().toISOString();
              measuredPosts[post.url] = measuredAt;
              for (const { keyword, searchVolume } of picked) {
                const k = `${keyword}|${post.url}`;
                if (existingKey.has(k)) continue;
                tracked.push({
                  keyword,
                  postUrl: post.url,
                  postTitle: post.title,
                  category: 'title-measured',
                  registeredAt: measuredAt,
                  history: [],
                  pick: { source: 'title-measured', searchVolume, documentCount: null, seat: null, facing: null, measuredAt },
                });
                existingKey.add(k);
                autoExtractMatches++;
              }
            }
            writeJson(FILE_MEASURED_POSTS(), measuredPosts);
          }
        }

        writeJson(FILE_TRACKED(), tracked);
        return {
          success: true,
          newMatches: historyMatches + autoExtractMatches,
          historyMatches,
          autoExtractMatches,
          totalTracked: tracked.length,
          note,
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

        let checked = 0, exposed = 0, blocked = 0, errored = 0, sectionsMeasured = 0;
        const ts = new Date().toISOString();
        let blockedStreak = 0;
        // 구획 배치는 검색어마다 한 번(같은 검색어가 여러 글에 걸려도). 하루 안에 잰 것은 그대로 쓴다.
        const sectionsByKeyword = new Map<string, SerpFacts | null>();
        for (const t of tracked) {
          if (t.serp && isFresh(t.serp.measuredAt, SERP_SECTIONS_TTL_MS)) sectionsByKeyword.set(compactKey(t.keyword), t.serp);
        }
        let sectionsStopped = false;

        for (const t of targets) {
          const r = await checkSerpRank(t.keyword, t.postUrl);

          // 통합검색 구획 배치 — 사장님 "AI 답변 뉴스 지식인 블로그 카페" 순서를 그대로 보여 주기 위해 잰다.
          const kk = compactKey(t.keyword);
          if (!sectionsStopped && !sectionsByKeyword.has(kk)) {
            const facts = await measureSerpSections(t.keyword);
            sectionsByKeyword.set(kk, facts);
            if (facts) sectionsMeasured++;
            if (localSerpStats().consecutiveBlocked >= 5) {
              console.warn('[EXPOSURE-TRACKING] 통합검색 5건 연속 차단 → 이번 회차 구획 실측 중단');
              sectionsStopped = true;
            }
          }
          const facts = sectionsByKeyword.get(kk);
          if (facts) t.serp = facts;
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

          try { event.sender.send('exposure-progress', { checked, blocked, errored, total: targets.length, exposed, sectionsMeasured }); } catch {}

          // 요청 간격 1.2~1.8초 (랜덤) — IP 차단 회피
          await new Promise(res => setTimeout(res, 1200 + Math.random() * 600));
        }

        // 같은 검색어를 단 다른 글에도 이번에 잰 배치를 붙인다 — 배치는 글이 아니라 검색어의 사실이다.
        for (const t of tracked) {
          const facts = sectionsByKeyword.get(compactKey(t.keyword));
          if (facts) t.serp = facts;
        }
        await closeLocalSerpFetch();

        writeJson(FILE_TRACKED(), tracked);
        return {
          success: true,
          checked, exposed, blocked, errored, sectionsMeasured,
          hitRate30: checked > 0 ? Math.round((exposed / checked) * 100) : 0,
          blockedHit: blockedStreak >= 5,
          message: blockedStreak >= 5
            ? '⚠️ 네이버가 일시 차단 (IP 보호) — 10~30분 후 다시 시도하세요'
            : (blocked > 0 ? `${blocked}건 차단됨 (재시도 필요)` : null),
        };
      } catch (err: any) {
        await closeLocalSerpFetch().catch(() => undefined);
        return { success: false, error: err?.message };
      }
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
          // 구획 배치: 세대가 다르면 null(안 잼) — 옛 세대 값을 지금 화면처럼 보이게 하지 않는다.
          const sections = trustedSections(t.serp);
          return {
            keyword: t.keyword,
            postUrl: t.postUrl,
            postTitle: t.postTitle,
            category: t.category,
            registeredAt: t.registeredAt,
            lastCheckedAt: t.lastCheckedAt,
            searchVolume: t.pick?.searchVolume ?? null,
            sections,
            hasAiBriefing: sections ? !!t.serp?.hasAiBriefing : null,
            serpMeasuredAt: sections ? t.serp?.measuredAt ?? null : null,
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
        // 연관 검색어는 related.json 의 실측만 붙는다. 아직 안 잰 씨앗은 빈 칩으로 나가고 화면이 '안 잼'이라 적는다.
        const relatedRecords = readJson<Record<string, RelatedRecord>>(FILE_RELATED(), {});
        const expansionSeeds = rankExposureGrowthSeeds(tracked, {
          limit: 12,
          expansionLimit: 6,
          expansions: relatedExpansions(relatedRecords),
        });

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
          // 칩마다 출처(검색광고 연관어 / 자동완성)를 밝히기 위한 원본. 씨앗 compact 키로 찾는다.
          related: Object.fromEntries(
            Object.entries(relatedRecords).filter(([, rec]) => rec && isFresh(rec.measuredAt, RELATED_TTL_MS)),
          ),
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
        writeJson(FILE_MEASURED_POSTS(), {});
        writeJson(FILE_RELATED(), {});
        return { success: true, cleared: { tracked: t.length, keywordHistory: k.length } };
      } catch (err: any) { return { success: false, error: err?.message }; }
    });
  }

  // 7. 수동 페어 등록 (자동 매칭이 못 잡은 경우)
  if (!ipcMain.listenerCount('exposure-add-manual')) {
    ipcMain.handle('exposure-add-manual', async (_e, p: { keyword: string; postUrl: string; postTitle?: string; category?: string; pick?: PickFacts }) => addTrackedPost(p));
  }

  /*
   * LEWORD 가 고른 것이 실제로 올라갔나 — 사장님 "그걸 꾸준히 쓰면 성과가 나는거야?"(2026-09-11).
   *
   * 지금까지는 답할 근거가 없었다. 추적 319건 중 307건이 제목을 잘라 만든 조각이라
   * '첫 페이지 59건' 이 숫자로는 화려한데 그 12건을 검색광고에 물으니 전부 "모름" 이었다.
   * 아무도 안 치는 말에서 1위 하는 건 쉽다.
   *
   * 그래서 표시(leword-pick)가 붙은 것만 센다. 판정은 leword-proof 가 하고 여기는 읽어서 넘기기만 한다.
   */
  if (!ipcMain.listenerCount('exposure-proof')) {
    ipcMain.handle('exposure-proof', async () => {
      try {
        const tracked = readJson<TrackedKeyword[]>(FILE_TRACKED(), []);
        return { success: true, proof: summarizeProof(tracked as any) };
      } catch (err: any) { return { success: false, error: err?.message }; }
    });
  }

  /*
   * 글 하나만 딱 집어서 본다 — 실측 순위 + 실측 RPM 을 한 화면에.
   *
   * 사장님 착상(2026-08-23): "수익 = 방문자 수 × RPM 이니까, RPM 을 알면
   * 방문자 수에만 집중하면 된다."
   * 마침 애드센스가 **글 주소를 열쇠로** 실적을 주므로 키워드 매핑 없이
   * URL 하나로 바로 이어진다.
   *
   * 두 숫자 다 실측이다. 못 재면 못 쟀다고 말하고, 값을 만들어 내지 않는다.
   * 특히 애드센스가 안 붙는 네이버 블로그 주소는 RPM 이 아예 존재하지 않는다 —
   * 0 원이 아니라 '해당 없음' 이다.
   */
  if (!ipcMain.listenerCount('exposure-analyze-post')) {
    ipcMain.handle('exposure-analyze-post', async (_e, p: { postUrl: string; keyword?: string; days?: number }) => {
      const url = String(p?.postUrl || '').trim();
      if (!url) return { success: false, error: '글 주소가 필요합니다' };

      const out: any = { success: true, postUrl: url, rank: null, rpm: null };

      // ── 순위: 검색 화면 실측(오픈 API 순서가 아니다) ──────────────────
      if (p?.keyword && String(p.keyword).trim()) {
        try {
          const { measureNaverTabRanks, NAVER_TABS } = require('../../utils/naver-serp-rank');
          const tabRanks = await measureNaverTabRanks(String(p.keyword).trim(), url);
          out.rank = {
            keyword: String(p.keyword).trim(),
            tabs: NAVER_TABS.map((t: any) => ({
              id: t.id,
              label: t.label,
              rank: tabRanks[t.id] ? tabRanks[t.id].rank : null,
              sampled: tabRanks[t.id] ? tabRanks[t.id].sampled : 0,
            })),
          };
        } catch (err: any) {
          out.rankError = err?.message || '순위 실측 실패';
        }

        /*
         * 구글 자리도 같이 잰다(2026-08-23).
         *
         * 그동안 "확인 필요" 만 뜬 이유: 구글 검색 화면을 그냥 요청하면 결과를
         * 못 읽는다. 가정용 회선에서 직접 재봐도 응답은 200/91KB 인데 결과
         * 링크가 0개였다 — 자바스크립트를 켜라는 안내 페이지다. gbv=1 도 같다.
         * 공식 창구(커스텀 검색)는 순서를 그대로 준다. 다만 google.com 화면과
         * 100% 같지는 않으므로 근거를 'google-cse' 로 밝혀 화면이 그대로 적는다.
         */
        try {
          const { EnvironmentManager } = require('../../utils/environment-manager');
          const cfg = EnvironmentManager.getInstance().getConfig() as any;
          if (cfg.googleApiKey && cfg.googleCseId) {
            const { measureGoogleRank } = require('../../utils/google-serp-rank');
            const g = await measureGoogleRank(
              String(p.keyword).trim(), url, cfg.googleApiKey, cfg.googleCseId, { depth: 30 },
            );
            out.google = { rank: g.rank, sampled: g.sampled, totalResults: g.totalResults, source: g.source };
          } else {
            out.google = { rank: null, sampled: 0, unavailable: '구글 검색 API 키와 검색엔진 ID가 필요합니다' };
          }
        } catch (err: any) {
          // 할당량 소진 등은 "노출 안 됨" 이 아니다 — 못 쟀다고 말한다.
          out.google = { rank: null, sampled: 0, unavailable: err?.message || '구글 순위 조회 실패' };
        }
      }

      // ── RPM: 애드센스 실측. 네이버 블로그는 애초에 해당 없음 ───────────
      const host = url.replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
      if (/(^|\.)blog\.naver\.com$/.test(host) || /(^|\.)m\.blog\.naver\.com$/.test(host)) {
        out.rpm = { available: false, reason: '네이버 블로그에는 애드센스를 붙일 수 없습니다' };
        return out;
      }

      try {
        const { EnvironmentManager } = require('../../utils/environment-manager');
        const env = EnvironmentManager.getInstance().getConfig() as any;
        let accessToken = env.adsenseOAuthAccessToken || '';
        const expiresAt = Number(env.adsenseTokenExpiresAt || 0);
        if (!accessToken) {
          out.rpm = { available: false, reason: '애드센스 연동이 필요합니다', needsAuth: true };
          return out;
        }
        // 만료됐으면 갱신부터. 만료된 토큰으로 부르면 401 만 받는다.
        if (expiresAt && Date.now() > expiresAt - 60_000) {
          const { refreshAdSenseToken } = require('../key-wizard/providers/adsense');
          if (await refreshAdSenseToken()) {
            accessToken = (EnvironmentManager.getInstance().getConfig() as any).adsenseOAuthAccessToken || '';
          }
        }

        const { listAccounts, fetchPageEarnings } = require('../../utils/adsense-rpm');
        const accounts = await listAccounts(accessToken);
        if (!accounts.length) {
          out.rpm = { available: false, reason: '애드센스 계정을 찾지 못했습니다' };
          return out;
        }
        const report = await fetchPageEarnings(accounts[0].name, accessToken, { days: Number(p?.days) || 28 });

        /*
         * 애드센스의 PAGE_URL 은 스킴이 없고 호스트+경로 모양으로 온다.
         * 양쪽을 같은 모양으로 깎아서 맞춘다 — 그냥 문자열 비교하면 전부 미매칭이다.
         */
        const norm = (u: string) => String(u || '')
          .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
        const target = norm(url);
        const hit = report.rows.find((r: any) => norm(r.pageUrl) === target);

        out.rpm = hit
          ? {
            available: true,
            rpm: hit.rpm,
            earnings: hit.earnings,
            pageViews: hit.pageViews,
            currency: report.currency,
            periodStart: report.startDate,
            periodEnd: report.endDate,
            note: hit.rpm === null ? '페이지뷰가 0이라 RPM을 낼 수 없습니다' : '',
          }
          : {
            available: false,
            reason: `최근 ${report.startDate}~${report.endDate} 애드센스 실적에 이 주소가 없습니다`,
          };
      } catch (err: any) {
        const authish = err && err.name === 'AdSenseAuthError';
        out.rpm = { available: false, reason: err?.message || 'RPM 조회 실패', needsAuth: Boolean(authish) };
      }
      return out;
    });
  }

  /*
   * 9. 연관 검색어 실측(2026-09-30).
   *
   * 씨앗(노출이 검증된 검색어)마다 검색광고 연관어 1회 + 자동완성 1회를 물어 related.json 에 이레 동안 둔다.
   * 예전엔 '조건·자격·신청기간' 접미사를 붙여 만들었는데 그 말들은 사람들이 치는 말이 아니었다
   * (사장님 "연관키워드가 잘못되었어"). 씨앗을 안 주면 지금 화면의 씨앗 카드를 그대로 쓴다.
   */
  if (!ipcMain.listenerCount('exposure-measure-related')) {
    ipcMain.handle('exposure-measure-related', async (_e, p?: { seeds?: string[]; force?: boolean; maxSeeds?: number }) => {
      try {
        const adConfig = searchAdConfig();
        const tracked = readJson<TrackedKeyword[]>(FILE_TRACKED(), []);
        const seeds = (Array.isArray(p?.seeds) && p!.seeds!.length > 0
          ? p!.seeds!
          : rankExposureGrowthSeeds(tracked, { limit: 12, expansionLimit: 6 }).map(s => s.keyword)
        ).map(s => String(s || '').replace(/\s+/g, ' ').trim()).filter(Boolean)
          .slice(0, Math.max(1, Math.min(24, p?.maxSeeds || 12)));

        const records = readJson<Record<string, RelatedRecord>>(FILE_RELATED(), {});
        let measured = 0, skipped = 0, failed = 0;
        for (const seed of seeds) {
          const key = compactKey(seed);
          if (!p?.force && records[key] && isFresh(records[key].measuredAt, RELATED_TTL_MS)) { skipped++; continue; }
          try {
            // 검색광고 키가 없으면 연관어는 못 받고 자동완성만 남는다 — 그 사실은 칩 출처로 드러난다.
            const suggestions = adConfig
              ? await getNaverSearchAdKeywordSuggestions(adConfig, seed, 60, { maxWaitMs: 30000 }).catch(() => [])
              : [];
            const autocomplete = await getNaverAutocompleteQuick(seed).catch(() => []);
            const related = pickRelatedKeywords(seed, {
              suggestions: suggestions.map(s => ({ keyword: s.keyword, searchVolume: exactSearchAdTotal(s) })),
              autocomplete,
            }, 6);
            records[key] = { seed, related, measuredAt: new Date().toISOString() };
            measured++;
          } catch (err: any) {
            failed++;
            console.warn('[EXPOSURE-TRACKING] 연관 검색어 실측 실패:', seed, err?.message);
          }
        }
        writeJson(FILE_RELATED(), records);
        return {
          success: true,
          seeds: seeds.length, measured, skipped, failed,
          note: adConfig ? null : '검색광고 API 키가 없어 자동완성만 실측했습니다',
        };
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

  console.log('[KEYWORD-MASTER] ✅ exposure-tracking 핸들러 9종 등록 완료');
}
