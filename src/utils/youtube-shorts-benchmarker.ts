/**
 * 유튜브 숏츠 벤치마킹 v2.43.8 — 10팀 비평 전면 반영
 *
 * 개선:
 * - 메모리 TTL 캐시 (15분) → 쿼터 90% 절감
 * - 일일 쿼터 예산 추적 (soft cap 8000) → hashtag 자동 비활성화
 * - search→videos 2단계 헬퍼 통합 (중복 제거)
 * - 응답에 diagnostics 포함 (소스별 ok/count/errorCode)
 * - viewRatio 폭주 차단 (floor 100 subs, hard cap 50)
 * - velocity 시간 정규화 (period 컷)
 * - likeRate 2.5% 기준 (이전 5%)
 * - mostPopular 시간 컷 통일 + categoryId 사후 필터 통일
 * - 한국형 multi-category (10+24 머지 등)
 * - 공식채널/한글콘텐츠 필터 옵션
 * - API 키 마스킹, videoId/categoryId 화이트리스트 검증
 * - AbortController + 8초 timeout
 */

import { EnvironmentManager } from './environment-manager';

const DATA_API_BASE = 'https://www.googleapis.com/youtube/v3';

// ────────────────────────────────────────────────────────────────────────────
// 상수 (이전 매직 넘버 모두 추출)
// ────────────────────────────────────────────────────────────────────────────

const WEIGHTS = { viewRatio: 0.35, velocity: 0.25, absViews: 0.20, likeRate: 0.20 } as const;
const PERIOD_HOURS = { '24h': 24, '7d': 168, '30d': 720 } as const;
const BATCH_SIZE = 50;
const SHORTS_MAX_DURATION_SEC = 180; // YouTube 공식 Shorts 사양
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_SIZE = 32;
const FETCH_TIMEOUT_MS = 8000;
const VIEW_RATIO_FLOOR_SUBS = 100;   // 0~99구독 채널의 ratio 폭주 차단
const VIEW_RATIO_HARD_CAP = 50;      // ratio 50을 상한선 (만점 도달 조건)
const LIKE_RATE_FULL_SCORE = 0.025;  // 2.5% (업계 평균 1~3% 반영)
const VELOCITY_LOG_DIVISOR = 4;
const ABS_VIEWS_LOG_DIVISOR = 7;
const OFFICIAL_CHANNEL_THRESHOLD = 1_000_000; // 100만+ = 공식채널 간주

// 일일 쿼터 예산 (YouTube Data API v3 = 10,000 units/day free)
const DAILY_QUOTA_LIMIT = 10_000;
const QUOTA_SOFT_CAP = 8_000; // 80% 도달 시 hashtag 비활성화
const COST_SEARCH = 100;
const COST_VIDEOS = 1;
const COST_CHANNELS = 1;

// 한국 시장 — 카테고리 프리셋 (UI에서 K-콘텐츠 등 머지 카테고리로 노출)
export const KR_CATEGORY_PRESETS: Record<string, string[]> = {
  kcontent: ['10', '24'],     // 음악 + 엔터
  game: ['20'],
  life: ['22', '26'],          // People & Blogs + 스타일
  tech: ['28'],
};

// ────────────────────────────────────────────────────────────────────────────
// 타입
// ────────────────────────────────────────────────────────────────────────────

export type ShortsPeriod = '24h' | '7d' | '30d';
export type ShortsSort = 'score' | 'views' | 'latest';
export type SourceName = 'rising' | 'popular' | 'hashtag' | 'channels' | 'config';

export interface ShortsItem {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  subscriberCount: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  publishedAt: string;
  hoursAgo: number;
  durationSec: number;
  categoryId: string;
  thumbnail: string;
  url: string;
  benchmarkScore: number;
  signals: {
    viewRatio: number;
    velocity: number;
    likeRate: number;
  };
}

export interface ShortsQuery {
  period?: ShortsPeriod;
  categoryId?: string;       // 단일 (구 호환)
  categoryIds?: string[];    // 다중 (한국형 머지 카테고리)
  preset?: keyof typeof KR_CATEGORY_PRESETS; // 'kcontent' | 'game' | 'life' | 'tech'
  maxResults?: number;
  sort?: ShortsSort;
  excludeOfficial?: boolean; // 100만+ 구독 제외 (따라하기 모드)
  koreanOnly?: boolean;       // 제목 한글 비율 ≥ 30%만
}

export interface SourceDiagnostic {
  source: SourceName;
  ok: boolean;
  count: number;
  status?: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface ShortsResponse {
  items: ShortsItem[];
  diagnostics: SourceDiagnostic[];
  fromCache: boolean;
  cacheAgeSec?: number;
  quotaUsedToday: number;
}

interface YtVideoRaw {
  id: string;
  snippet?: {
    publishedAt?: string;
    channelId?: string;
    channelTitle?: string;
    title?: string;
    description?: string;
    categoryId?: string;
    thumbnails?: { default?: { url?: string }; medium?: { url?: string }; high?: { url?: string } };
  };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration?: string };
}

// ────────────────────────────────────────────────────────────────────────────
// 유틸: API 키 / 마스킹 / 입력 검증
// ────────────────────────────────────────────────────────────────────────────

function getYoutubeApiKey(): string {
  const direct = process.env['YOUTUBE_API_KEY'] || '';
  if (direct) return direct;
  try {
    const cfg: any = EnvironmentManager.getInstance().getConfig();
    return String(cfg.youtubeApiKey || '');
  } catch {
    return '';
  }
}

function maskApiKey(msg: string): string {
  return String(msg || '').replace(/key=[A-Za-z0-9_-]+/g, 'key=***');
}

function sanitizeCategoryId(raw?: string): string | undefined {
  if (!raw) return undefined;
  return /^[0-9]{1,3}$/.test(raw) ? raw : undefined;
}

function sanitizeVideoId(raw: any): string | null {
  return typeof raw === 'string' && /^[A-Za-z0-9_-]{11}$/.test(raw) ? raw : null;
}

function isMostlyKorean(text: string, minRatio = 0.3): boolean {
  if (!text) return false;
  const stripped = text.replace(/\s+/g, '');
  if (stripped.length === 0) return false;
  const korean = (stripped.match(/[가-힯]/g) || []).length;
  return korean / stripped.length >= minRatio;
}

// ────────────────────────────────────────────────────────────────────────────
// 안전 fetch (timeout + key 마스킹)
// ────────────────────────────────────────────────────────────────────────────

async function safeFetch(url: string, label: string): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      const err: any = new Error(`[${label}] HTTP ${res.status} ${maskApiKey(errText.slice(0, 200))}`);
      err.status = res.status;
      err.label = label;
      // quota / 키 에러 분류
      if (res.status === 403) {
        if (errText.includes('quotaExceeded')) err.code = 'QUOTA_EXCEEDED';
        else if (errText.includes('keyInvalid') || errText.includes('API key not valid')) err.code = 'KEY_INVALID';
        else if (errText.includes('accessNotConfigured')) err.code = 'API_NOT_ENABLED';
        else err.code = 'FORBIDDEN';
      } else if (res.status === 400) err.code = 'BAD_REQUEST';
      throw err;
    }
    return await res.json();
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      const err: any = new Error(`[${label}] timeout after ${FETCH_TIMEOUT_MS}ms`);
      err.code = 'TIMEOUT';
      throw err;
    }
    e.message = maskApiKey(e?.message || String(e));
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// LRU TTL 캐시
// ────────────────────────────────────────────────────────────────────────────

class TTLCache<V> {
  private map = new Map<string, { v: V; t: number }>();
  constructor(private maxSize = CACHE_MAX_SIZE, private ttlMs = CACHE_TTL_MS) {}

  get(k: string): { v: V; ageSec: number } | null {
    const entry = this.map.get(k);
    if (!entry) return null;
    const ageMs = Date.now() - entry.t;
    if (ageMs > this.ttlMs) {
      this.map.delete(k);
      return null;
    }
    // LRU touch
    this.map.delete(k);
    this.map.set(k, entry);
    return { v: entry.v, ageSec: Math.round(ageMs / 1000) };
  }

  set(k: string, v: V): void {
    if (this.map.has(k)) {
      this.map.delete(k);
    } else if (this.map.size >= this.maxSize) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) this.map.delete(oldestKey);
    }
    this.map.set(k, { v, t: Date.now() });
  }

  clear(): void {
    this.map.clear();
  }
}

const shortsCache = new TTLCache<ShortsResponse>();

// ────────────────────────────────────────────────────────────────────────────
// 쿼터 예산 추적 (프로세스 메모리 — 재시작 시 리셋)
// ────────────────────────────────────────────────────────────────────────────

let _quotaUsedToday = 0;
let _quotaResetDate = '';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function trackQuota(cost: number): void {
  const today = todayStr();
  if (_quotaResetDate !== today) {
    _quotaResetDate = today;
    _quotaUsedToday = 0;
  }
  _quotaUsedToday += cost;
}

function canUseHashtag(): boolean {
  const today = todayStr();
  if (_quotaResetDate !== today) return true;
  return _quotaUsedToday < QUOTA_SOFT_CAP;
}

export function getQuotaUsedToday(): number {
  const today = todayStr();
  return _quotaResetDate === today ? _quotaUsedToday : 0;
}

// ────────────────────────────────────────────────────────────────────────────
// 헬퍼: ISO 8601 → 초, hoursSince, 카테고리 결합
// ────────────────────────────────────────────────────────────────────────────

function parseDurationToSec(iso: string): number {
  if (!iso) return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] || '0', 10)) * 3600 + (parseInt(m[2] || '0', 10)) * 60 + (parseInt(m[3] || '0', 10));
}

function hoursSince(isoDate: string): number {
  const t = new Date(isoDate).getTime();
  if (!isFinite(t)) return 1;
  return Math.max(1, (Date.now() - t) / 3_600_000);
}

function resolveCategoryIds(q: ShortsQuery): string[] {
  if (q.preset && KR_CATEGORY_PRESETS[q.preset]) return KR_CATEGORY_PRESETS[q.preset];
  if (q.categoryIds && q.categoryIds.length > 0) {
    return q.categoryIds.map(sanitizeCategoryId).filter((x): x is string => !!x);
  }
  const single = sanitizeCategoryId(q.categoryId);
  return single ? [single] : [];
}

// ────────────────────────────────────────────────────────────────────────────
// 스코어링 (10팀 #7 반영)
// ────────────────────────────────────────────────────────────────────────────

function normViewRatio(views: number, subs: number): number {
  const safeSubs = Math.max(subs, VIEW_RATIO_FLOOR_SUBS);
  const ratio = Math.min(views / safeSubs, VIEW_RATIO_HARD_CAP);
  const v = Math.log10(ratio + 0.001) / Math.log10(VIEW_RATIO_HARD_CAP);
  return Math.max(0, Math.min(100, v * 100));
}

function normVelocity(views: number, hours: number, periodHours: number): number {
  // period 범위 내로 hours 클램프 → 신생/오래된 채널 공정 비교
  const safeHours = Math.max(Math.min(hours, periodHours), 1);
  const viewsPerHour = views / safeHours;
  const v = Math.log10(viewsPerHour + 1) / VELOCITY_LOG_DIVISOR;
  return Math.max(0, Math.min(100, v * 100));
}

function normAbsViews(views: number): number {
  const v = Math.log10(views + 1) / ABS_VIEWS_LOG_DIVISOR;
  return Math.max(0, Math.min(100, v * 100));
}

function normLikeRate(likes: number, views: number): number {
  if (views <= 0) return 0;
  const rate = likes / views;
  return Math.max(0, Math.min(100, (rate / LIKE_RATE_FULL_SCORE) * 100));
}

export function computeBenchmarkScore(
  item: Omit<ShortsItem, 'benchmarkScore' | 'signals'>,
  periodHours: number = PERIOD_HOURS['24h'],
): { score: number; signals: ShortsItem['signals'] } {
  const safeSubs = Math.max(item.subscriberCount, VIEW_RATIO_FLOOR_SUBS);
  const viewRatio = Math.min(item.viewCount / safeSubs, VIEW_RATIO_HARD_CAP);
  const safeHours = Math.max(Math.min(item.hoursAgo, periodHours), 1);
  const velocity = item.viewCount / safeHours;
  const likeRate = item.viewCount > 0 ? item.likeCount / item.viewCount : 0;

  const vrScore = normViewRatio(item.viewCount, item.subscriberCount);
  const velScore = normVelocity(item.viewCount, item.hoursAgo, periodHours);
  const absScore = normAbsViews(item.viewCount);
  const lrScore = normLikeRate(item.likeCount, item.viewCount);

  const score = Math.round(
    vrScore * WEIGHTS.viewRatio +
    velScore * WEIGHTS.velocity +
    absScore * WEIGHTS.absViews +
    lrScore * WEIGHTS.likeRate,
  );

  return {
    score: Math.max(0, Math.min(100, score)),
    signals: {
      viewRatio: Math.round(viewRatio * 100) / 100,
      velocity: Math.round(velocity),
      likeRate: Math.round(likeRate * 10000) / 100,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 통합 search→videos 2단계 (rising / hashtag 공유)
// ────────────────────────────────────────────────────────────────────────────

async function searchAndFetchVideos(
  apiKey: string,
  searchOverrides: Record<string, string>,
  label: string,
): Promise<{ items: YtVideoRaw[]; cost: number }> {
  let cost = 0;
  const searchParams = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    regionCode: 'KR',
    relevanceLanguage: 'ko',
    videoDuration: 'short',
    maxResults: String(BATCH_SIZE),
    key: apiKey,
    ...searchOverrides,
  });
  const searchData = await safeFetch(`${DATA_API_BASE}/search?${searchParams.toString()}`, `${label}/search`);
  cost += COST_SEARCH;

  const videoIds: string[] = (searchData.items || [])
    .map((it: any) => sanitizeVideoId(it.id?.videoId))
    .filter((id: string | null): id is string => !!id);
  if (videoIds.length === 0) return { items: [], cost };

  const videoParams = new URLSearchParams({
    part: 'snippet,statistics,contentDetails',
    id: videoIds.join(','),
    key: apiKey,
  });
  const videosData = await safeFetch(`${DATA_API_BASE}/videos?${videoParams.toString()}`, `${label}/videos`);
  cost += COST_VIDEOS;

  const items: YtVideoRaw[] = (videosData.items || []).filter(
    (it: any) => parseDurationToSec(it.contentDetails?.duration || '') <= SHORTS_MAX_DURATION_SEC,
  );
  return { items, cost };
}

// ────────────────────────────────────────────────────────────────────────────
// mostPopular (videos.list 1회) — 카테고리 단일 적용, 머지는 사후 처리
// ────────────────────────────────────────────────────────────────────────────

async function fetchMostPopular(
  apiKey: string,
  categoryId: string | undefined,
): Promise<{ items: YtVideoRaw[]; cost: number }> {
  const params = new URLSearchParams({
    part: 'snippet,statistics,contentDetails',
    chart: 'mostPopular',
    regionCode: 'KR',
    maxResults: String(BATCH_SIZE),
    key: apiKey,
  });
  if (categoryId) params.append('videoCategoryId', categoryId);
  const data = await safeFetch(`${DATA_API_BASE}/videos?${params.toString()}`, 'popular');
  const items: YtVideoRaw[] = (data.items || []).filter(
    (it: any) => parseDurationToSec(it.contentDetails?.duration || '') <= SHORTS_MAX_DURATION_SEC,
  );
  return { items, cost: COST_VIDEOS };
}

// ────────────────────────────────────────────────────────────────────────────
// 채널 구독자 (50개 batch)
// ────────────────────────────────────────────────────────────────────────────

async function fetchChannelSubscribers(apiKey: string, channelIds: string[]): Promise<{ map: Map<string, number>; cost: number }> {
  const map = new Map<string, number>();
  if (channelIds.length === 0) return { map, cost: 0 };
  const unique = Array.from(new Set(channelIds.filter(id => /^[A-Za-z0-9_-]+$/.test(id))));
  let cost = 0;
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    const params = new URLSearchParams({
      part: 'statistics',
      id: batch.join(','),
      key: apiKey,
    });
    try {
      const data = await safeFetch(`${DATA_API_BASE}/channels?${params.toString()}`, 'channels');
      cost += COST_CHANNELS;
      for (const ch of data.items || []) {
        const count = parseInt(ch.statistics?.subscriberCount || '0', 10);
        if (typeof ch.id === 'string') map.set(ch.id, count);
      }
    } catch {
      // batch 1개 실패는 무시 (graceful)
    }
  }
  return { map, cost };
}

// ────────────────────────────────────────────────────────────────────────────
// 메인
// ────────────────────────────────────────────────────────────────────────────

export async function getTrendingShorts(query: ShortsQuery = {}): Promise<ShortsResponse> {
  const apiKey = getYoutubeApiKey();
  const diagnostics: SourceDiagnostic[] = [];

  if (!apiKey) {
    diagnostics.push({ source: 'config', ok: false, count: 0, errorCode: 'NO_API_KEY', errorMessage: 'YouTube API 키 미설정' });
    return { items: [], diagnostics, fromCache: false, quotaUsedToday: getQuotaUsedToday() };
  }

  const period = query.period || '24h';
  const categoryIds = resolveCategoryIds(query);
  const maxResults = query.maxResults || 30;
  const sort = query.sort || 'score';
  const excludeOfficial = query.excludeOfficial === true;
  const koreanOnly = query.koreanOnly === true;
  const periodHours = PERIOD_HOURS[period];

  // 캐시 조회
  const cacheKey = `${period}|${categoryIds.sort().join(',')}|${sort}|${excludeOfficial ? 1 : 0}|${koreanOnly ? 1 : 0}|${maxResults}`;
  const cached = shortsCache.get(cacheKey);
  if (cached) {
    return { ...cached.v, fromCache: true, cacheAgeSec: cached.ageSec, quotaUsedToday: getQuotaUsedToday() };
  }

  const publishedAfter = new Date(Date.now() - periodHours * 3_600_000).toISOString();
  const hashtagAllowed = canUseHashtag();

  // 3개 소스 병렬 (hashtag는 쿼터 예산 따라 조건부)
  type TaskResult = { source: SourceName; items: YtVideoRaw[]; cost: number; err?: any };
  const tasks: Promise<TaskResult>[] = [];

  tasks.push(
    searchAndFetchVideos(apiKey, { order: 'viewCount', publishedAfter }, 'rising')
      .then(r => ({ source: 'rising' as SourceName, ...r }))
      .catch((e: any) => ({ source: 'rising' as SourceName, items: [], cost: COST_SEARCH, err: e })),
  );

  // popular — categoryIds가 1개면 직접 적용, 0개거나 2개+면 categoryId 미지정 후 사후 필터
  const popularCategoryParam = categoryIds.length === 1 ? categoryIds[0] : undefined;
  tasks.push(
    fetchMostPopular(apiKey, popularCategoryParam)
      .then(r => ({ source: 'popular' as SourceName, ...r }))
      .catch((e: any) => ({ source: 'popular' as SourceName, items: [], cost: COST_VIDEOS, err: e })),
  );

  if (hashtagAllowed) {
    tasks.push(
      searchAndFetchVideos(apiKey, { q: '#shorts', order: 'viewCount', publishedAfter }, 'hashtag')
        .then(r => ({ source: 'hashtag' as SourceName, ...r }))
        .catch((e: any) => ({ source: 'hashtag' as SourceName, items: [], cost: COST_SEARCH, err: e })),
    );
  } else {
    diagnostics.push({
      source: 'hashtag',
      ok: false,
      count: 0,
      errorCode: 'QUOTA_BUDGET',
      errorMessage: `일일 쿼터 예산 보존 (${_quotaUsedToday}/${DAILY_QUOTA_LIMIT}) — hashtag 소스 자동 비활성화`,
    });
  }

  const results = await Promise.all(tasks);

  // 쿼터 차감 + diagnostic 작성
  for (const r of results) {
    trackQuota(r.cost);
    if (r.err) {
      diagnostics.push({
        source: r.source,
        ok: false,
        count: 0,
        status: r.err?.status,
        errorCode: r.err?.code || 'FETCH_ERROR',
        errorMessage: maskApiKey(r.err?.message || '실패'),
      });
    } else {
      diagnostics.push({ source: r.source, ok: true, count: r.items.length });
    }
  }

  // 전면 실패 검증 — 403 / KEY_INVALID 같은 치명적 에러는 throw로 격상
  const fatal = diagnostics.find(d => !d.ok && (d.errorCode === 'KEY_INVALID' || d.errorCode === 'QUOTA_EXCEEDED' || d.errorCode === 'API_NOT_ENABLED'));
  if (fatal) {
    const err: any = new Error(`YouTube API ${fatal.errorCode}: ${fatal.errorMessage}`);
    err.code = fatal.errorCode;
    throw err;
  }

  // 우선순위 dedupe: rising → hashtag → popular
  const order: SourceName[] = ['rising', 'hashtag', 'popular'];
  const merged: YtVideoRaw[] = [];
  const seen = new Set<string>();
  for (const src of order) {
    const r = results.find(x => x.source === src);
    if (!r) continue;
    for (const it of r.items) {
      const id = String(it.id || '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      merged.push(it);
    }
  }

  if (merged.length === 0) {
    const resp: ShortsResponse = { items: [], diagnostics, fromCache: false, quotaUsedToday: getQuotaUsedToday() };
    shortsCache.set(cacheKey, resp);
    return resp;
  }

  // 시간축 통일 (popular 포함 사후 컷)
  let rawItems = merged.filter(it => hoursSince(it.snippet?.publishedAt || '') <= periodHours);

  // categoryId 사후 필터 통일 (다중 머지 카테고리 지원)
  if (categoryIds.length > 0) {
    const set = new Set(categoryIds);
    rawItems = rawItems.filter(it => set.has(String(it.snippet?.categoryId || '')));
  }

  // 한글 콘텐츠 필터 (옵션)
  if (koreanOnly) {
    rawItems = rawItems.filter(it => {
      const text = String(it.snippet?.title || '') + ' ' + String(it.snippet?.description || '');
      return isMostlyKorean(text);
    });
  }

  if (rawItems.length === 0) {
    const resp: ShortsResponse = { items: [], diagnostics, fromCache: false, quotaUsedToday: getQuotaUsedToday() };
    shortsCache.set(cacheKey, resp);
    return resp;
  }

  // 채널 구독자
  const channelIds = rawItems.map(it => String(it.snippet?.channelId || '')).filter(Boolean);
  const { map: subsMap, cost: chCost } = await fetchChannelSubscribers(apiKey, channelIds);
  trackQuota(chCost);
  diagnostics.push({ source: 'channels', ok: true, count: subsMap.size });

  // 변환 + 스코어링
  let items: ShortsItem[] = rawItems.map((raw: YtVideoRaw) => {
    const snippet = raw.snippet || {};
    const stats = raw.statistics || {};
    const cd = raw.contentDetails || {};
    const videoId = String(raw.id || '');
    const publishedAt = String(snippet.publishedAt || '');
    const channelId = String(snippet.channelId || '');
    const partial = {
      videoId,
      title: String(snippet.title || ''),
      channelId,
      channelTitle: String(snippet.channelTitle || ''),
      subscriberCount: subsMap.get(channelId) || 0,
      viewCount: parseInt(stats.viewCount || '0', 10),
      likeCount: parseInt(stats.likeCount || '0', 10),
      commentCount: parseInt(stats.commentCount || '0', 10),
      publishedAt,
      hoursAgo: Math.round(hoursSince(publishedAt)),
      durationSec: parseDurationToSec(cd.duration || ''),
      categoryId: String(snippet.categoryId || ''),
      thumbnail: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || '',
      url: `https://youtube.com/shorts/${videoId}`,
    };
    const { score, signals } = computeBenchmarkScore(partial, periodHours);
    return { ...partial, benchmarkScore: score, signals };
  });

  // 공식채널 제외 (따라하기 모드)
  if (excludeOfficial) {
    items = items.filter(it => it.subscriberCount < OFFICIAL_CHANNEL_THRESHOLD);
  }

  // 정렬
  if (sort === 'views') items.sort((a, b) => b.viewCount - a.viewCount);
  else if (sort === 'latest') items.sort((a, b) => (new Date(b.publishedAt).getTime()) - (new Date(a.publishedAt).getTime()));
  else items.sort((a, b) => b.benchmarkScore - a.benchmarkScore);

  const resp: ShortsResponse = {
    items: items.slice(0, maxResults),
    diagnostics,
    fromCache: false,
    quotaUsedToday: getQuotaUsedToday(),
  };
  shortsCache.set(cacheKey, resp);
  return resp;
}

// 캐시 강제 초기화 (테스트 / IPC 진단용)
export function clearShortsCache(): void {
  shortsCache.clear();
}
