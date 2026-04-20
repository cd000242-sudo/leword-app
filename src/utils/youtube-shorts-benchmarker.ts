/**
 * 유튜브 숏츠 벤치마킹 — 블로거/크리에이터가 "따라 만들면 성공할 숏츠" 발굴
 *
 * 출력: 최근 업로드된 인기 Shorts + 벤치마킹 점수 (0~100)
 * 시그널: viralVelocity / channelLeverage / likeRate / absViews
 */

import { EnvironmentManager } from './environment-manager';

const DATA_API_BASE = 'https://www.googleapis.com/youtube/v3';

export type ShortsPeriod = '24h' | '7d' | '30d';
export type ShortsSort = 'score' | 'views' | 'latest';

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
  // 스코어링
  benchmarkScore: number;
  signals: {
    viewRatio: number;       // views / subscribers
    velocity: number;         // views per hour
    likeRate: number;         // likes / views
  };
}

export interface ShortsQuery {
  period?: ShortsPeriod;      // 기본 24h
  categoryId?: string;         // YouTube videoCategoryId (예: '10'=음악, '20'=게임, '24'=엔터)
  maxResults?: number;         // 기본 30
  sort?: ShortsSort;           // 기본 score
}

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

// ISO 8601 duration (PT#M#S) → 초
function parseDurationToSec(iso: string): number {
  if (!iso) return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const h = parseInt(m[1] || '0', 10);
  const min = parseInt(m[2] || '0', 10);
  const s = parseInt(m[3] || '0', 10);
  return h * 3600 + min * 60 + s;
}

function hoursSince(isoDate: string): number {
  const t = new Date(isoDate).getTime();
  if (!isFinite(t)) return 1;
  return Math.max(1, (Date.now() - t) / 3_600_000);
}

// 시그널 정규화 0~100
function normViewRatio(views: number, subs: number): number {
  const ratio = views / Math.max(subs, 1);
  // ratio 0.01 → ~20점, 1.0 → ~67점, 10+ → 100점
  const v = Math.log10(ratio + 0.001) / Math.log10(1000);
  return Math.max(0, Math.min(100, v * 100));
}

function normVelocity(views: number, hours: number): number {
  const viewsPerHour = views / Math.max(hours, 1);
  // log10(1)→0, log10(10000)→100
  const v = Math.log10(viewsPerHour + 1) / 4;
  return Math.max(0, Math.min(100, v * 100));
}

function normAbsViews(views: number): number {
  // 1K→43, 100K→71, 1M→86, 10M→100
  const v = Math.log10(views + 1) / 7;
  return Math.max(0, Math.min(100, v * 100));
}

function normLikeRate(likes: number, views: number): number {
  if (views <= 0) return 0;
  const rate = likes / views;
  // 5%+ → 100
  return Math.max(0, Math.min(100, (rate / 0.05) * 100));
}

export function computeBenchmarkScore(item: Omit<ShortsItem, 'benchmarkScore' | 'signals'>): { score: number; signals: ShortsItem['signals'] } {
  const viewRatio = item.viewCount / Math.max(item.subscriberCount, 1);
  const velocity = item.viewCount / Math.max(item.hoursAgo, 1);
  const likeRate = item.viewCount > 0 ? item.likeCount / item.viewCount : 0;

  const vrScore = normViewRatio(item.viewCount, item.subscriberCount);
  const velScore = normVelocity(item.viewCount, item.hoursAgo);
  const absScore = normAbsViews(item.viewCount);
  const lrScore = normLikeRate(item.likeCount, item.viewCount);

  // 가중합 (blueprint: viewRatio 35% + velocity 25% + absViews 20% + likeRate 20%)
  // 댓글률은 likeRate에 흡수해 단순화 (commentCount는 자주 0/disabled)
  const score = Math.round(
    vrScore * 0.35 + velScore * 0.25 + absScore * 0.20 + lrScore * 0.20
  );

  return {
    score: Math.max(0, Math.min(100, score)),
    signals: {
      viewRatio: Math.round(viewRatio * 100) / 100,
      velocity: Math.round(velocity),
      likeRate: Math.round(likeRate * 10000) / 100, // %
    },
  };
}

/**
 * 인기 Shorts 가져오기 (chart=mostPopular) + duration 60초 이하 필터
 */
async function fetchMostPopularShorts(apiKey: string, categoryId?: string, maxResults = 50): Promise<any[]> {
  const params = new URLSearchParams({
    part: 'snippet,statistics,contentDetails',
    chart: 'mostPopular',
    regionCode: 'KR',
    maxResults: String(Math.min(maxResults, 50)),
    key: apiKey,
  });
  if (categoryId) params.append('videoCategoryId', categoryId);

  const res = await fetch(`${DATA_API_BASE}/videos?${params.toString()}`);
  if (!res.ok) throw new Error(`YouTube API 오류 ${res.status}`);
  const data = (await res.json()) as any;
  const items = Array.isArray(data.items) ? data.items : [];
  // duration 60초 이하만
  return items.filter((it: any) => parseDurationToSec(it.contentDetails?.duration || '') <= 60);
}

/**
 * 최근 업로드 급상승 Shorts (search → videos.list 2단계)
 */
async function fetchRecentRisingShorts(apiKey: string, period: ShortsPeriod, maxResults = 50): Promise<any[]> {
  const hours = period === '24h' ? 24 : period === '7d' ? 168 : 720;
  const publishedAfter = new Date(Date.now() - hours * 3_600_000).toISOString();

  // Step 1: search — 최근 업로드 조회수순 (videoDuration=short = 4분 이하, 완벽한 60초는 아님)
  const searchParams = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    order: 'viewCount',
    regionCode: 'KR',
    videoDuration: 'short', // <4분 — 1차 필터
    publishedAfter,
    maxResults: String(Math.min(maxResults * 2, 50)), // 60초 필터로 반 정도 걸러내기 전제
    key: apiKey,
  });
  const searchRes = await fetch(`${DATA_API_BASE}/search?${searchParams.toString()}`);
  if (!searchRes.ok) throw new Error(`YouTube search API 오류 ${searchRes.status}`);
  const searchData = (await searchRes.json()) as any;
  const videoIds: string[] = (searchData.items || [])
    .map((it: any) => it.id?.videoId)
    .filter(Boolean);
  if (videoIds.length === 0) return [];

  // Step 2: videos.list — duration, statistics 확보
  const videosParams = new URLSearchParams({
    part: 'snippet,statistics,contentDetails',
    id: videoIds.join(','),
    key: apiKey,
  });
  const videosRes = await fetch(`${DATA_API_BASE}/videos?${videosParams.toString()}`);
  if (!videosRes.ok) throw new Error(`YouTube videos API 오류 ${videosRes.status}`);
  const videosData = (await videosRes.json()) as any;
  const items = Array.isArray(videosData.items) ? videosData.items : [];
  return items.filter((it: any) => parseDurationToSec(it.contentDetails?.duration || '') <= 60);
}

/**
 * 채널 구독자 수 일괄 조회 (50개씩)
 */
async function fetchChannelSubscribers(apiKey: string, channelIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (channelIds.length === 0) return result;
  const unique = Array.from(new Set(channelIds));
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    const params = new URLSearchParams({
      part: 'statistics',
      id: batch.join(','),
      key: apiKey,
    });
    try {
      const res = await fetch(`${DATA_API_BASE}/channels?${params.toString()}`);
      if (!res.ok) continue;
      const data = (await res.json()) as any;
      for (const ch of data.items || []) {
        const count = parseInt(ch.statistics?.subscriberCount || '0', 10);
        result.set(ch.id, count);
      }
    } catch {
      // batch 실패는 무시, 다음 batch로
    }
  }
  return result;
}

/**
 * 메인 — 숏츠 + 벤치마킹 점수 반환
 */
export async function getTrendingShorts(query: ShortsQuery = {}): Promise<ShortsItem[]> {
  const apiKey = getYoutubeApiKey();
  if (!apiKey) {
    console.warn('[shorts] YouTube API 키 없음 — 빈 배열 반환');
    return [];
  }

  const period = query.period || '24h';
  const maxResults = query.maxResults || 30;
  const sort = query.sort || 'score';

  let rawItems: any[] = [];
  try {
    // 24h면 "급상승" 우선, 그 외엔 "most popular" 우선
    if (period === '24h') {
      rawItems = await fetchRecentRisingShorts(apiKey, '24h', 50);
      // 부족하면 mostPopular로 보충
      if (rawItems.length < maxResults) {
        const extra = await fetchMostPopularShorts(apiKey, query.categoryId, 50);
        const seen = new Set(rawItems.map(r => r.id));
        for (const e of extra) if (!seen.has(e.id)) rawItems.push(e);
      }
    } else {
      rawItems = await fetchMostPopularShorts(apiKey, query.categoryId, 50);
      // 기간 필터
      const maxHours = period === '7d' ? 168 : 720;
      rawItems = rawItems.filter(it => hoursSince(it.snippet?.publishedAt || '') <= maxHours);
    }
  } catch (e: any) {
    console.warn('[shorts] Shorts 수집 실패:', e?.message);
    return [];
  }

  if (rawItems.length === 0) return [];

  // categoryId 필터 (Search API는 categoryId 지원 안 함 → 사후 필터)
  if (query.categoryId) {
    rawItems = rawItems.filter(it => String(it.snippet?.categoryId || '') === query.categoryId);
  }

  // 채널 구독자 수 조회
  const channelIds = rawItems.map(it => it.snippet?.channelId).filter(Boolean) as string[];
  const subsMap = await fetchChannelSubscribers(apiKey, channelIds);

  // 변환 + 스코어링
  const items: ShortsItem[] = rawItems.map((raw: any) => {
    const snippet = raw.snippet || {};
    const stats = raw.statistics || {};
    const cd = raw.contentDetails || {};
    const videoId = String(raw.id || '');
    const publishedAt = String(snippet.publishedAt || '');
    const partial = {
      videoId,
      title: String(snippet.title || ''),
      channelId: String(snippet.channelId || ''),
      channelTitle: String(snippet.channelTitle || ''),
      subscriberCount: subsMap.get(String(snippet.channelId || '')) || 0,
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
    const { score, signals } = computeBenchmarkScore(partial);
    return { ...partial, benchmarkScore: score, signals };
  });

  // 30점 미만 제외
  const filtered = items.filter(it => it.benchmarkScore >= 30);

  // 정렬
  if (sort === 'views') filtered.sort((a, b) => b.viewCount - a.viewCount);
  else if (sort === 'latest') filtered.sort((a, b) => (new Date(b.publishedAt).getTime()) - (new Date(a.publishedAt).getTime()));
  else filtered.sort((a, b) => b.benchmarkScore - a.benchmarkScore);

  return filtered.slice(0, maxResults);
}
