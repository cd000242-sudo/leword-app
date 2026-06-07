import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type {
  MobileRankTrackingCategorySummary,
  MobileRankTrackingActionResult,
  MobileRankTrackingHistoryPoint,
  MobileRankTrackingManualInput,
  MobileRankTrackingPairInput,
  MobileProTrackedPostInput,
  MobileRankTrackingKeywordItem,
  MobileRankTrackingPostItem,
  MobileRankTrackingRunInput,
  MobileRankTrackingSnapshot,
} from './contracts';
import { extractNaverBlogPostIdentity } from '../utils/pro-hunter-v12/rank-url-normalizer';

interface RankTrackingOptions {
  exposureTrackedFile?: string;
  exposureKeywordHistoryFile?: string;
  exposureConfigFile?: string;
  proTrackingFile?: string;
  now?: () => Date;
}

export type MobileRankTrackingCheckStatus = 'found' | 'not-in-top30' | 'blocked' | 'error' | 'invalid-url';

export interface MobileRankTrackingCheckResult {
  rank: number | null;
  status: MobileRankTrackingCheckStatus;
  method?: 'naver-api' | 'http' | 'test';
}

export type MobileRankTrackingRankChecker = (
  keyword: string,
  postUrl: string,
) => Promise<MobileRankTrackingCheckResult>;

interface RankTrackingActionOptions extends RankTrackingOptions {
  checker?: MobileRankTrackingRankChecker;
  delayMs?: number;
}

interface ExposureTrackedItem {
  keyword?: unknown;
  postUrl?: unknown;
  postTitle?: unknown;
  category?: unknown;
  registeredAt?: unknown;
  lastCheckedAt?: unknown;
  history?: unknown;
}

interface ExposureHistoryItem {
  checkedAt?: unknown;
  inTop10?: unknown;
  inTop30?: unknown;
  rank?: unknown;
}

interface ProTrackingStore {
  version?: unknown;
  keywords?: Record<string, ProTrackedKeyword>;
  posts?: Record<string, ProTrackedPost>;
}

interface ProTrackedKeyword {
  keyword?: unknown;
  registeredAt?: unknown;
  lastCheckedAt?: unknown;
  initialDocCount?: unknown;
  history?: unknown;
  alerts?: unknown;
}

interface ProKeywordHistoryItem {
  ts?: unknown;
  docCount?: unknown;
  searchVolume?: unknown;
}

interface ProTrackedPost {
  postUrl?: unknown;
  keyword?: unknown;
  keywords?: unknown;
  registeredAt?: unknown;
  lastCheckedAt?: unknown;
  predictedRank?: unknown;
  history?: unknown;
}

interface ProPostHistoryItem {
  ts?: unknown;
  rank?: unknown;
  checked?: unknown;
  perKeyword?: unknown;
}

function appDataDirs(): string[] {
  const roots = [
    process.env['APPDATA'],
    process.env['LOCALAPPDATA'],
    process.env['HOME'],
    os.homedir(),
    process.cwd(),
  ].filter(Boolean) as string[];
  const appNames = ['LEWORD', 'leword', 'blogger-admin-panel', 'com.leword.app'];
  const dirs = roots.flatMap((root) => appNames.map((name) => path.join(root, name)));
  return [...new Set(dirs)];
}

function firstExisting(candidates: string[]): string {
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

export function resolvePcRankTrackingFiles(options: RankTrackingOptions = {}): Required<Omit<RankTrackingOptions, 'now'>> {
  const exposureDir = process.env['LEWORD_EXPOSURE_TRACKING_DIR']
    || process.env['LEWORD_MOBILE_EXPOSURE_TRACKING_DIR']
    || '';
  const bases = appDataDirs();
  const exposureDirs = [
    ...(exposureDir ? [exposureDir] : []),
    ...bases.map((base) => path.join(base, 'exposure-tracking')),
  ];
  const proDirs = bases.map((base) => path.join(base, 'pro-hunter-v12'));

  return {
    exposureTrackedFile: options.exposureTrackedFile
      || process.env['LEWORD_EXPOSURE_TRACKED_FILE']
      || process.env['LEWORD_MOBILE_EXPOSURE_TRACKED_FILE']
      || firstExisting(exposureDirs.map((dir) => path.join(dir, 'tracked.json'))),
    exposureKeywordHistoryFile: options.exposureKeywordHistoryFile
      || process.env['LEWORD_EXPOSURE_KEYWORD_HISTORY_FILE']
      || process.env['LEWORD_MOBILE_EXPOSURE_KEYWORD_HISTORY_FILE']
      || firstExisting(exposureDirs.map((dir) => path.join(dir, 'keyword-history.json'))),
    exposureConfigFile: options.exposureConfigFile
      || process.env['LEWORD_EXPOSURE_CONFIG_FILE']
      || process.env['LEWORD_MOBILE_EXPOSURE_CONFIG_FILE']
      || firstExisting(exposureDirs.map((dir) => path.join(dir, 'config.json'))),
    proTrackingFile: options.proTrackingFile
      || process.env['LEWORD_PRO_TRACKING_FILE']
      || process.env['LEWORD_MOBILE_PRO_TRACKING_FILE']
      || firstExisting(proDirs.map((dir) => path.join(dir, 'tracking-store.json'))),
  };
}

function readJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function compactText(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanValue(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function sameKeywordPostPair(item: ExposureTrackedItem, input: MobileRankTrackingPairInput): boolean {
  return compactText(item.keyword) === compactText(input.keyword)
    && compactText(item.postUrl) === compactText(input.postUrl);
}

function normalizeMaxItems(value: unknown, total: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return Math.min(10, total);
  return Math.min(Math.max(1, Math.floor(parsed)), Math.min(50, total));
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractBlogLinksFromHtml(html: string): string[] {
  const links: string[] = [];
  const linkPattern = /href=["']([^"']*(?:m\.)?blog\.naver\.com[^"']*)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(html)) !== null) {
    links.push(decodeHtml(match[1]));
  }
  return links;
}

function parseRankFromLinks(links: string[], postUrl: string): Pick<MobileRankTrackingCheckResult, 'rank' | 'status'> {
  const target = extractNaverBlogPostIdentity(postUrl);
  if (!target) return { rank: null, status: 'invalid-url' };

  let rank = 0;
  const seen = new Set<string>();
  for (const link of links) {
    const identity = extractNaverBlogPostIdentity(link);
    if (!identity) continue;
    const key = `${identity.blogId}/${identity.postNo}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rank += 1;
    if (rank > 30) break;
    if (identity.blogId === target.blogId && identity.postNo === target.postNo) {
      return { rank, status: 'found' };
    }
  }

  return { rank: null, status: 'not-in-top30' };
}

async function checkRankWithNaverOpenApi(keyword: string, postUrl: string): Promise<MobileRankTrackingCheckResult> {
  const clientId = process.env['NAVER_CLIENT_ID'] || process.env['NAVER_SEARCH_CLIENT_ID'] || '';
  const clientSecret = process.env['NAVER_CLIENT_SECRET'] || process.env['NAVER_SEARCH_CLIENT_SECRET'] || '';
  if (!clientId || !clientSecret) return { rank: null, status: 'error' };

  const response = await fetch(`https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(keyword)}&display=30&sort=sim`, {
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
  });
  if (response.status === 429 || response.status === 403) return { rank: null, status: 'blocked', method: 'naver-api' };
  if (!response.ok) return { rank: null, status: 'error', method: 'naver-api' };

  const payload = await response.json().catch(() => null) as { items?: Array<{ link?: unknown }> } | null;
  const links = (payload?.items || []).map((item) => compactText(item.link)).filter(Boolean);
  return {
    ...parseRankFromLinks(links, postUrl),
    method: 'naver-api',
  };
}

async function checkRankWithNaverHtml(keyword: string, postUrl: string): Promise<MobileRankTrackingCheckResult> {
  const response = await fetch(`https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'ko-KR,ko;q=0.9',
      Referer: 'https://www.naver.com/',
    },
  });
  if (response.status === 429 || response.status === 403) return { rank: null, status: 'blocked', method: 'http' };
  if (!response.ok) return { rank: null, status: 'error', method: 'http' };

  const html = await response.text();
  return {
    ...parseRankFromLinks(extractBlogLinksFromHtml(html), postUrl),
    method: 'http',
  };
}

async function defaultRankChecker(keyword: string, postUrl: string): Promise<MobileRankTrackingCheckResult> {
  const identity = extractNaverBlogPostIdentity(postUrl);
  if (!identity) return { rank: null, status: 'invalid-url' };

  try {
    const apiResult = await checkRankWithNaverOpenApi(keyword, postUrl);
    if (apiResult.status === 'found' || apiResult.status === 'not-in-top30' || apiResult.status === 'blocked') {
      return apiResult;
    }
  } catch {
    // Fall back to HTML search below.
  }

  try {
    return await checkRankWithNaverHtml(keyword, postUrl);
  } catch {
    return { rank: null, status: 'error', method: 'http' };
  }
}

function isoFromDateLike(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const date = typeof value === 'number'
    ? new Date(value)
    : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function hashId(...parts: string[]): string {
  const digest = crypto.createHash('sha1').update(parts.join('\n')).digest('hex').slice(0, 12);
  return `mobile_rank_${digest}`;
}

function arrayFrom(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeKeywordList(value: unknown, primary: string): string[] {
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of [primary, ...raw]) {
    const keyword = compactText(item);
    if (!keyword) continue;
    const key = keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(keyword);
  }
  return output;
}

function normalizePredictedRank(value: unknown): number {
  const rank = numeric(value);
  if (rank === null || rank <= 0) return 5;
  return Math.floor(rank);
}

function normalizePerKeyword(value: unknown): Record<string, number | null> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const output: Record<string, number | null> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const keyword = compactText(key);
    if (!keyword) continue;
    output[keyword] = numeric(raw);
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

function rankedHistory(history: MobileRankTrackingHistoryPoint[]): MobileRankTrackingHistoryPoint[] {
  return history.filter((item) => item.rank !== null);
}

function rankChange(history: MobileRankTrackingHistoryPoint[]): {
  currentRank: number | null;
  previousRank: number | null;
  rankChange: number | null;
} {
  const ranked = rankedHistory(history);
  const currentRank = ranked.length > 0 ? ranked[ranked.length - 1].rank : null;
  const previousRank = ranked.length > 1 ? ranked[ranked.length - 2].rank : null;
  return {
    currentRank,
    previousRank,
    rankChange: currentRank !== null && previousRank !== null ? currentRank - previousRank : null,
  };
}

function normalizeExposureHistory(raw: unknown): MobileRankTrackingHistoryPoint[] {
  return arrayFrom(raw)
    .map((item) => {
      const history = item as ExposureHistoryItem;
      const rank = numeric(history.rank);
      const inTop10 = booleanValue(history.inTop10) || (rank !== null && rank <= 10);
      const inTop30 = booleanValue(history.inTop30) || (rank !== null && rank <= 30);
      return {
        checkedAt: isoFromDateLike(history.checkedAt) || '',
        rank,
        inTop10,
        inTop30,
      };
    })
    .filter((item) => !!item.checkedAt)
    .sort((a, b) => a.checkedAt.localeCompare(b.checkedAt));
}

function normalizeProPostHistory(raw: unknown): MobileRankTrackingHistoryPoint[] {
  return arrayFrom(raw)
    .map((item) => {
      const history = item as ProPostHistoryItem;
      const rank = numeric(history.rank);
      return {
        checkedAt: isoFromDateLike(history.ts) || '',
        rank,
        inTop10: rank !== null && rank <= 10,
        inTop30: rank !== null && rank <= 30,
        perKeyword: normalizePerKeyword(history.perKeyword),
      };
    })
    .filter((item) => !!item.checkedAt)
    .sort((a, b) => a.checkedAt.localeCompare(b.checkedAt));
}

function normalizeExposurePost(item: ExposureTrackedItem): MobileRankTrackingPostItem | null {
  const keyword = compactText(item.keyword);
  const postUrl = compactText(item.postUrl);
  if (!keyword || !postUrl) return null;
  const history = normalizeExposureHistory(item.history);
  const latest = history[history.length - 1] || null;
  const ranks = rankChange(history);
  const totalChecks = history.length;
  const top10Count = history.filter((point) => point.inTop10).length;
  const top30Count = history.filter((point) => point.inTop30).length;

  return {
    id: hashId('exposure-tracking', keyword, postUrl),
    source: 'exposure-tracking',
    keyword,
    keywords: [keyword],
    postUrl,
    postTitle: compactText(item.postTitle),
    category: compactText(item.category) || 'general',
    registeredAt: isoFromDateLike(item.registeredAt),
    lastCheckedAt: isoFromDateLike(item.lastCheckedAt) || latest?.checkedAt || null,
    currentRank: ranks.currentRank,
    previousRank: ranks.previousRank,
    rankChange: ranks.rankChange,
    currentInTop10: !!latest?.inTop10,
    currentInTop30: !!latest?.inTop30,
    predictedRank: null,
    totalChecks,
    top10Count,
    top30Count,
    history: history.slice(-10).reverse(),
  };
}

function normalizeProPost(item: ProTrackedPost): MobileRankTrackingPostItem | null {
  const keyword = compactText(item.keyword);
  const postUrl = compactText(item.postUrl);
  if (!keyword || !postUrl) return null;
  const history = normalizeProPostHistory(item.history);
  const latest = history[history.length - 1] || null;
  const ranks = rankChange(history);
  const totalChecks = history.length;
  const top10Count = history.filter((point) => point.inTop10).length;
  const top30Count = history.filter((point) => point.inTop30).length;

  return {
    id: hashId('pro-hunter-v12', keyword, postUrl),
    source: 'pro-hunter-v12',
    keyword,
    keywords: normalizeKeywordList(item.keywords, keyword),
    postUrl,
    postTitle: '',
    category: 'pro-rank',
    registeredAt: isoFromDateLike(item.registeredAt),
    lastCheckedAt: isoFromDateLike(item.lastCheckedAt) || latest?.checkedAt || null,
    currentRank: ranks.currentRank,
    previousRank: ranks.previousRank,
    rankChange: ranks.rankChange,
    currentInTop10: !!latest?.inTop10,
    currentInTop30: !!latest?.inTop30,
    predictedRank: numeric(item.predictedRank),
    totalChecks,
    top10Count,
    top30Count,
    history: history.slice(-10).reverse(),
  };
}

function normalizeProKeyword(item: ProTrackedKeyword, fallbackKeyword: string): MobileRankTrackingKeywordItem | null {
  const keyword = compactText(item.keyword || fallbackKeyword);
  if (!keyword) return null;
  const history = arrayFrom(item.history) as ProKeywordHistoryItem[];
  const first = history[0] || null;
  const latest = history[history.length - 1] || null;
  const initialDocCount = numeric(item.initialDocCount) ?? numeric(first?.docCount);
  const latestDocCount = numeric(latest?.docCount) ?? initialDocCount;
  const alerts = arrayFrom(item.alerts) as Array<{ message?: unknown; ts?: unknown }>;
  const latestAlert = alerts.length > 0 ? compactText(alerts[alerts.length - 1].message) : null;

  return {
    keyword,
    registeredAt: isoFromDateLike(item.registeredAt),
    lastCheckedAt: isoFromDateLike(item.lastCheckedAt),
    initialDocCount,
    latestDocCount,
    latestSearchVolume: numeric(latest?.searchVolume),
    docDelta: initialDocCount !== null && latestDocCount !== null ? latestDocCount - initialDocCount : null,
    totalChecks: history.length,
    alertCount: alerts.length,
    latestAlert,
    source: 'pro-hunter-v12',
  };
}

function buildByCategory(posts: MobileRankTrackingPostItem[]): MobileRankTrackingCategorySummary[] {
  const grouped = new Map<string, MobileRankTrackingCategorySummary>();
  for (const post of posts) {
    const key = post.category || 'general';
    const current = grouped.get(key) || {
      category: key,
      tracked: 0,
      checked: 0,
      top10: 0,
      top30: 0,
      hitRate10: 0,
      hitRate30: 0,
    };
    current.tracked += 1;
    if (post.totalChecks > 0) {
      current.checked += 1;
      if (post.currentInTop10) current.top10 += 1;
      if (post.currentInTop30) current.top30 += 1;
    }
    grouped.set(key, current);
  }

  return Array.from(grouped.values())
    .map((item) => ({
      ...item,
      hitRate10: item.checked ? Math.round((item.top10 / item.checked) * 100) : 0,
      hitRate30: item.checked ? Math.round((item.top30 / item.checked) * 100) : 0,
    }))
    .sort((a, b) => b.hitRate30 - a.hitRate30 || b.tracked - a.tracked || a.category.localeCompare(b.category));
}

export function readMobileRankTrackingSnapshot(
  options: RankTrackingOptions = {},
): MobileRankTrackingSnapshot {
  const files = resolvePcRankTrackingFiles(options);
  const now = options.now?.() || new Date();
  const exposureConfig = readJson<{ rssUrl?: unknown }>(files.exposureConfigFile, {});
  const exposureTracked = readJson<ExposureTrackedItem[]>(files.exposureTrackedFile, []);
  const exposureKeywordHistory = readJson<unknown[]>(files.exposureKeywordHistoryFile, []);
  const proStore = readJson<ProTrackingStore>(files.proTrackingFile, { version: 1, keywords: {}, posts: {} });

  const exposurePosts = arrayFrom(exposureTracked)
    .map((item) => normalizeExposurePost(item as ExposureTrackedItem))
    .filter((item): item is MobileRankTrackingPostItem => !!item);
  const proPosts = Object.values(proStore.posts || {})
    .map(normalizeProPost)
    .filter((item): item is MobileRankTrackingPostItem => !!item);
  const posts = [...exposurePosts, ...proPosts]
    .sort((a, b) => {
      const aTime = a.lastCheckedAt || a.registeredAt || '';
      const bTime = b.lastCheckedAt || b.registeredAt || '';
      return bTime.localeCompare(aTime) || a.keyword.localeCompare(b.keyword);
    });
  const keywords = Object.entries(proStore.keywords || {})
    .map(([keyword, item]) => normalizeProKeyword(item, keyword))
    .filter((item): item is MobileRankTrackingKeywordItem => !!item)
    .sort((a, b) => (b.lastCheckedAt || '').localeCompare(a.lastCheckedAt || '') || a.keyword.localeCompare(b.keyword));

  const checkedPairs = posts.filter((item) => item.totalChecks > 0).length;
  const currentlyInTop30 = posts.filter((item) => item.currentInTop30).length;
  const currentlyInTop10 = posts.filter((item) => item.currentInTop10).length;
  const totalChecks = posts.reduce((sum, item) => sum + item.totalChecks, 0);
  const alerts = keywords.reduce((sum, item) => sum + item.alertCount, 0);

  return {
    updatedAt: now.toISOString(),
    storage: {
      exposureTracked: 'pc-exposure-tracking-json',
      proTracking: 'pc-pro-hunter-v12-json',
    },
    configured: !!compactText(exposureConfig.rssUrl) || posts.length > 0 || keywords.length > 0,
    rssUrl: compactText(exposureConfig.rssUrl) || null,
    totals: {
      keywordHistorySize: arrayFrom(exposureKeywordHistory).length,
      exposureTrackedPairs: exposurePosts.length,
      proTrackedPosts: proPosts.length,
      proTrackedKeywords: keywords.length,
      trackedPairs: posts.length,
      checkedPairs,
      uncheckedPairs: posts.length - checkedPairs,
      totalChecks,
      currentlyInTop30,
      currentlyInTop10,
      hitRate30: checkedPairs ? Math.round((currentlyInTop30 / checkedPairs) * 100) : 0,
      hitRate10: checkedPairs ? Math.round((currentlyInTop10 / checkedPairs) * 100) : 0,
      alerts,
    },
    byCategory: buildByCategory(posts),
    posts: {
      total: posts.length,
      items: posts.slice(0, 50),
    },
    keywords: {
      total: keywords.length,
      items: keywords.slice(0, 50),
    },
  };
}

export function addMobileRankTrackingManualPair(params: {
  input: MobileRankTrackingManualInput;
  options?: RankTrackingActionOptions;
}): MobileRankTrackingActionResult {
  const options = params.options || {};
  const files = resolvePcRankTrackingFiles(options);
  const keyword = compactText(params.input.keyword);
  const postUrl = compactText(params.input.postUrl);
  const now = (options.now?.() || new Date()).toISOString();

  if (!keyword || !postUrl) {
    return {
      success: false,
      action: 'manual-add',
      error: 'keyword-post-url-required',
      snapshot: readMobileRankTrackingSnapshot(options),
    };
  }

  const tracked = readJson<ExposureTrackedItem[]>(files.exposureTrackedFile, []);
  if (tracked.some((item) => sameKeywordPostPair(item, { keyword, postUrl }))) {
    return {
      success: false,
      action: 'manual-add',
      error: 'already-tracked',
      totalTracked: tracked.length,
      snapshot: readMobileRankTrackingSnapshot(options),
    };
  }

  tracked.push({
    keyword,
    postUrl,
    postTitle: compactText(params.input.postTitle),
    category: compactText(params.input.category) || 'manual',
    registeredAt: now,
    history: [],
  });
  writeJson(files.exposureTrackedFile, tracked);

  return {
    success: true,
    action: 'manual-add',
    totalTracked: tracked.length,
    snapshot: readMobileRankTrackingSnapshot(options),
  };
}

export function addMobileProTrackedPost(params: {
  input: MobileProTrackedPostInput;
  options?: RankTrackingActionOptions;
}): MobileRankTrackingActionResult {
  const options = params.options || {};
  const files = resolvePcRankTrackingFiles(options);
  const keyword = compactText(params.input.keyword);
  const postUrl = compactText(params.input.postUrl);
  const nowMs = (options.now?.() || new Date()).getTime();

  if (!keyword || !postUrl) {
    return {
      success: false,
      action: 'pro-post-add',
      error: 'keyword-post-url-required',
      snapshot: readMobileRankTrackingSnapshot(options),
    };
  }

  const store = readJson<ProTrackingStore>(files.proTrackingFile, { version: 1, keywords: {}, posts: {} });
  store.version = 1;
  store.keywords = store.keywords || {};
  store.posts = store.posts || {};

  const existing = store.posts[postUrl];
  if (existing) {
    const existingKeywords = Array.isArray(existing.keywords) ? existing.keywords : [existing.keyword];
    existing.keywords = normalizeKeywordList([...existingKeywords, ...(params.input.keywords || [])], keyword);
    if (numeric(existing.predictedRank) === null) {
      existing.predictedRank = normalizePredictedRank(params.input.predictedRank);
    }
  } else {
    store.posts[postUrl] = {
      postUrl,
      keyword,
      keywords: normalizeKeywordList(params.input.keywords, keyword),
      registeredAt: nowMs,
      lastCheckedAt: 0,
      predictedRank: normalizePredictedRank(params.input.predictedRank),
      history: [],
    };
  }

  writeJson(files.proTrackingFile, store);

  return {
    success: true,
    action: 'pro-post-add',
    totalTracked: Object.keys(store.posts || {}).length,
    snapshot: readMobileRankTrackingSnapshot(options),
  };
}

export function removeMobileRankTrackingPair(params: {
  input: MobileRankTrackingPairInput;
  options?: RankTrackingActionOptions;
}): MobileRankTrackingActionResult {
  const options = params.options || {};
  const files = resolvePcRankTrackingFiles(options);
  const postUrl = compactText(params.input.postUrl);
  const tracked = readJson<ExposureTrackedItem[]>(files.exposureTrackedFile, []);
  const filtered = tracked.filter((item) => !sameKeywordPostPair(item, params.input));
  let removed = tracked.length - filtered.length;
  writeJson(files.exposureTrackedFile, filtered);

  const proStore = readJson<ProTrackingStore>(files.proTrackingFile, { version: 1, keywords: {}, posts: {} });
  if (postUrl && proStore.posts?.[postUrl]) {
    delete proStore.posts[postUrl];
    removed += 1;
    writeJson(files.proTrackingFile, proStore);
  }

  return {
    success: true,
    action: 'remove-pair',
    removed,
    snapshot: readMobileRankTrackingSnapshot(options),
  };
}

export async function runMobileRankTrackingSerpCheck(params: {
  input?: MobileRankTrackingRunInput;
  options?: RankTrackingActionOptions;
} = {}): Promise<MobileRankTrackingActionResult> {
  const options = params.options || {};
  const files = resolvePcRankTrackingFiles(options);
  const tracked = readJson<ExposureTrackedItem[]>(files.exposureTrackedFile, []);
  if (tracked.length === 0) {
    return {
      success: true,
      action: 'run-serp-check',
      checked: 0,
      exposed: 0,
      blocked: 0,
      errored: 0,
      hitRate30: 0,
      snapshot: readMobileRankTrackingSnapshot(options),
    };
  }

  const sorted = [...tracked]
    .map((item, originalIndex) => ({ item, originalIndex }))
    .sort((a, b) => arrayFrom(a.item.history).length - arrayFrom(b.item.history).length);
  const targets = sorted.slice(0, normalizeMaxItems(params.input?.maxItems, tracked.length));

  if (params.input?.dryRun) {
    return {
      success: true,
      action: 'run-serp-check',
      checked: 0,
      exposed: 0,
      blocked: 0,
      errored: 0,
      hitRate30: 0,
      message: `dry-run: ${targets.length} target(s) selected`,
      snapshot: readMobileRankTrackingSnapshot(options),
    };
  }

  const checker = options.checker || defaultRankChecker;
  const checkedAt = (options.now?.() || new Date()).toISOString();
  const delayMs = options.delayMs ?? 1200;
  let checked = 0;
  let exposed = 0;
  let blocked = 0;
  let errored = 0;
  let blockedStreak = 0;

  for (const target of targets) {
    const keyword = compactText(target.item.keyword);
    const postUrl = compactText(target.item.postUrl);
    const result = await checker(keyword, postUrl);

    if (result.status === 'blocked') {
      blocked += 1;
      blockedStreak += 1;
      if (blockedStreak >= 5) break;
    } else if (result.status === 'error' || result.status === 'invalid-url') {
      errored += 1;
      blockedStreak = 0;
    } else {
      const rank = result.rank;
      const inTop10 = rank !== null && rank <= 10;
      const inTop30 = rank !== null && rank <= 30;
      const history = arrayFrom(target.item.history) as ExposureHistoryItem[];
      history.push({
        checkedAt,
        rank,
        inTop10,
        inTop30,
      });
      target.item.history = history.slice(-30);
      target.item.lastCheckedAt = checkedAt;
      checked += 1;
      if (inTop30) exposed += 1;
      blockedStreak = 0;
    }

    if (delayMs > 0 && target !== targets[targets.length - 1]) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  writeJson(files.exposureTrackedFile, tracked);

  return {
    success: true,
    action: 'run-serp-check',
    checked,
    exposed,
    blocked,
    errored,
    hitRate30: checked > 0 ? Math.round((exposed / checked) * 100) : 0,
    blockedHit: blockedStreak >= 5,
    message: blockedStreak >= 5
      ? 'Naver blocked repeated checks. Try again after a short cooldown.'
      : blocked > 0 ? `${blocked} blocked check(s) need retry` : null,
    snapshot: readMobileRankTrackingSnapshot(options),
  };
}
