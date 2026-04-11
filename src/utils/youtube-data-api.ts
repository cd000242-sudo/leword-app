/**
 * YouTube 크롤러 V3 (진짜 끝판왕)
 * 
 * 모든 기능:
 * - 키워드 검색 + 조회수 순
 * - 날짜 필터
 * - 실시간 인기
 * - 카테고리별
 * - 급상승 (시간당 조회수)
 * - 50개 이상 페이지네이션 (최대 500개)
 * - 다중 키워드 검색 (OR)
 * - 쇼츠 필터 (쇼츠만 / 쇼츠 제외)
 * - 조회수 필터 (최소/최대)
 * - 영상 길이 필터
 * - 채널 구독자 필터
 * - 댓글 분석 (키워드 추출)
 * - 관련 영상 추천
 * - 에러 재시도
 * - 결과 캐싱
 */

// ============================================
// 타입 정의
// ============================================

export interface YouTubeVideo {
  rank: number;
  videoId: string;
  title: string;
  description: string;
  channelTitle: string;
  channelId: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  duration: string;
  durationSeconds: number;
  thumbnail: string;
  categoryId: string;
  categoryName: string;
  viewsPerHour: number;
  tags: string[];
  isShorts: boolean;
  subscriberCount?: number;
}

export interface YouTubeChannel {
  channelId: string;
  title: string;
  description: string;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  thumbnail: string;
}

export interface YouTubeComment {
  commentId: string;
  text: string;
  authorName: string;
  likeCount: number;
  publishedAt: string;
}

export interface YouTubeSearchConfig {
  apiKey: string;
  keyword?: string;
  keywords?: string[];           // 다중 키워드 (OR 검색)
  publishedAfter?: string;
  publishedBefore?: string;
  maxResults?: number;           // 최대 500개까지
  regionCode?: string;
  categoryId?: string;
  order?: 'viewCount' | 'date' | 'rating' | 'relevance';
  
  // 필터 옵션
  minViewCount?: number;         // 최소 조회수
  maxViewCount?: number;         // 최대 조회수
  minDuration?: number;          // 최소 길이 (초)
  maxDuration?: number;          // 최대 길이 (초)
  shortsOnly?: boolean;          // 쇼츠만
  excludeShorts?: boolean;       // 쇼츠 제외
  minSubscribers?: number;       // 최소 구독자
  maxSubscribers?: number;       // 최대 구독자
  
  // 옵션
  includeChannelInfo?: boolean;  // 채널 정보 포함
  useCache?: boolean;            // 캐시 사용
  retryCount?: number;           // 재시도 횟수
}

export interface YouTubeSearchResult {
  success: boolean;
  videos: YouTubeVideo[];
  totalResults: number;
  keyword?: string;
  keywords?: string[];
  dateRange?: { from: string; to: string };
  filters?: Record<string, any>;
  timestamp: string;
  cached?: boolean;
  error?: string;
}

export interface CommentAnalysisResult {
  videoId: string;
  totalComments: number;
  keywords: Array<{ word: string; count: number }>;
  sentimentScore: number;  // -1 ~ 1
  topComments: YouTubeComment[];
}

// ============================================
// 상수
// ============================================

const CATEGORY_MAP: Record<string, string> = {
  '1': '영화/애니메이션',
  '2': '자동차',
  '10': '음악',
  '15': '동물',
  '17': '스포츠',
  '18': '단편영화',
  '19': '여행/이벤트',
  '20': '게임',
  '21': '블로그',
  '22': '피플/블로그',
  '23': '코미디',
  '24': '엔터테인먼트',
  '25': '뉴스/정치',
  '26': '노하우/스타일',
  '27': '교육',
  '28': '과학기술',
  '29': '비영리/사회운동'
};

const SHORTS_MAX_DURATION = 60; // 쇼츠 최대 60초

// 캐시 저장소
const cache = new Map<string, { data: any; expiry: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5분

// ============================================
// 유틸리티 함수
// ============================================

/**
 * ISO 8601 duration을 초로 변환
 */
function parseDurationToSeconds(duration: string): number {
  if (!duration) return 0;
  
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  
  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');
  const seconds = parseInt(match[3] || '0');
  
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * 초를 읽기 쉬운 형식으로 변환
 */
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * 날짜를 ISO 형식으로 변환
 */
function toISODate(dateStr: string, isEnd: boolean = false): string {
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return isEnd ? `${dateStr}T23:59:59Z` : `${dateStr}T00:00:00Z`;
    }
    if (dateStr.includes('T')) return dateStr;
    return new Date(dateStr).toISOString();
  } catch (e) {
    return dateStr;
  }
}

/**
 * N일 전부터 오늘까지 날짜 범위
 */
export function getDateRange(days: number): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: now.toISOString() };
}

/**
 * 캐시 키 생성
 */
function getCacheKey(config: any): string {
  return JSON.stringify(config, Object.keys(config).sort());
}

/**
 * 캐시에서 가져오기
 */
function getFromCache(key: string): any | null {
  const cached = cache.get(key);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }
  cache.delete(key);
  return null;
}

/**
 * 캐시에 저장
 */
function setCache(key: string, data: any): void {
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
}

/**
 * 재시도 래퍼
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      console.warn(`[YOUTUBE] 재시도 ${i + 1}/${retries}: ${error.message}`);
      
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, delay * (i + 1)));
      }
    }
  }
  
  throw lastError;
}

/**
 * 쇼츠 여부 판단
 */
function isShorts(video: { durationSeconds: number; title: string }): boolean {
  const titleLower = video.title.toLowerCase();
  // #shorts 태그 있으면 확실한 쇼츠
  if (titleLower.includes('#shorts') || titleLower.includes('#short')) {
    return true;
  }
  // 60초 이하이고 제목이 짧으면(50자 미만) 쇼츠 가능성 높음
  if (video.durationSeconds <= SHORTS_MAX_DURATION && video.durationSeconds > 0 && video.title.length < 50) {
    return true;
  }
  return false;
}

// ============================================
// API 함수
// ============================================

/**
 * API 요청 (재시도 포함)
 */
async function apiRequest(
  url: string,
  params: URLSearchParams,
  retryCount: number = 3
): Promise<any> {
  return withRetry(async () => {
    const response = await fetch(`${url}?${params}`);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`YouTube API 오류: ${response.status}`);
    }
    
    return response.json();
  }, retryCount);
}

/**
 * 비디오 상세 정보 조회
 */
async function getVideoDetails(
  apiKey: string,
  videoIds: string[],
  includeChannelInfo: boolean = false
): Promise<YouTubeVideo[]> {
  if (videoIds.length === 0) return [];
  
  // 50개씩 나눠서 요청 (API 제한)
  const chunks: string[][] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    chunks.push(videoIds.slice(i, i + 50));
  }
  
  const allVideos: YouTubeVideo[] = [];
  const channelIds = new Set<string>();
  
  for (const chunk of chunks) {
    const params = new URLSearchParams({
      part: 'snippet,statistics,contentDetails',
      id: chunk.join(','),
      key: apiKey
    });
    
    const data = await apiRequest(
      'https://www.googleapis.com/youtube/v3/videos',
      params
    );
    
    const videos = (data.items || []).map((item: any, index: number) => {
      const snippet = item.snippet || {};
      const statistics = item.statistics || {};
      const contentDetails = item.contentDetails || {};
      
      const viewCount = parseInt(statistics.viewCount || '0', 10);
      const publishedAt = snippet.publishedAt || '';
      const durationSeconds = parseDurationToSeconds(contentDetails.duration || '');
      
      // 시간당 조회수
      let viewsPerHour = 0;
      if (publishedAt) {
        const publishedDate = new Date(publishedAt);
        const hoursSincePublished = Math.max(1, (Date.now() - publishedDate.getTime()) / (1000 * 60 * 60));
        viewsPerHour = Math.round(viewCount / hoursSincePublished);
      }
      
      const categoryId = snippet.categoryId || '';
      const title = snippet.title || '';
      
      if (snippet.channelId) {
        channelIds.add(snippet.channelId);
      }
      
      const video: YouTubeVideo = {
        rank: 0,
        videoId: item.id,
        title: title,
        description: snippet.description || '',
        channelTitle: snippet.channelTitle || '',
        channelId: snippet.channelId || '',
        publishedAt: publishedAt,
        viewCount: viewCount,
        likeCount: parseInt(statistics.likeCount || '0', 10),
        commentCount: parseInt(statistics.commentCount || '0', 10),
        duration: formatDuration(durationSeconds),
        durationSeconds: durationSeconds,
        thumbnail: snippet.thumbnails?.maxres?.url || snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || '',
        categoryId: categoryId,
        categoryName: CATEGORY_MAP[categoryId] || '기타',
        viewsPerHour: viewsPerHour,
        tags: snippet.tags || [],
        isShorts: isShorts({ durationSeconds, title })
      };
      
      return video;
    });
    
    allVideos.push(...videos);
  }
  
  // 채널 정보 추가
  if (includeChannelInfo && channelIds.size > 0) {
    const channelMap = await getChannelsInfo(apiKey, Array.from(channelIds));
    
    const enrichedVideos = allVideos.map(video => {
      const channel = channelMap.get(video.channelId);
      return channel
        ? { ...video, subscriberCount: channel.subscriberCount }
        : video;
    });
    return enrichedVideos;
  }

  return allVideos;
}

/**
 * 채널 정보 조회
 */
async function getChannelsInfo(
  apiKey: string,
  channelIds: string[]
): Promise<Map<string, YouTubeChannel>> {
  const channelMap = new Map<string, YouTubeChannel>();
  
  if (channelIds.length === 0) return channelMap;
  
  // 50개씩 나눠서 요청
  const chunks: string[][] = [];
  for (let i = 0; i < channelIds.length; i += 50) {
    chunks.push(channelIds.slice(i, i + 50));
  }
  
  for (const chunk of chunks) {
    try {
      const params = new URLSearchParams({
        part: 'snippet,statistics',
        id: chunk.join(','),
        key: apiKey
      });
      
      const data = await apiRequest(
        'https://www.googleapis.com/youtube/v3/channels',
        params
      );
      
      (data.items || []).forEach((item: any) => {
        const snippet = item.snippet || {};
        const statistics = item.statistics || {};
        
        channelMap.set(item.id, {
          channelId: item.id,
          title: snippet.title || '',
          description: snippet.description || '',
          subscriberCount: parseInt(statistics.subscriberCount || '0', 10),
          videoCount: parseInt(statistics.videoCount || '0', 10),
          viewCount: parseInt(statistics.viewCount || '0', 10),
          thumbnail: snippet.thumbnails?.high?.url || ''
        });
      });
    } catch (e) {
      console.warn('[YOUTUBE] 채널 정보 조회 실패:', e);
    }
  }
  
  return channelMap;
}

/**
 * 필터 적용
 */
function applyFilters(videos: YouTubeVideo[], config: YouTubeSearchConfig): YouTubeVideo[] {
  return videos.filter(video => {
    // 조회수 필터
    if (config.minViewCount !== undefined && video.viewCount < config.minViewCount) {
      return false;
    }
    if (config.maxViewCount !== undefined && video.viewCount > config.maxViewCount) {
      return false;
    }
    
    // 길이 필터
    if (config.minDuration !== undefined && video.durationSeconds < config.minDuration) {
      return false;
    }
    if (config.maxDuration !== undefined && video.durationSeconds > config.maxDuration) {
      return false;
    }
    
    // 쇼츠 필터
    if (config.shortsOnly && !video.isShorts) {
      return false;
    }
    if (config.excludeShorts && video.isShorts) {
      return false;
    }
    
    // 구독자 필터
    if (video.subscriberCount !== undefined) {
      if (config.minSubscribers !== undefined && video.subscriberCount < config.minSubscribers) {
        return false;
      }
      if (config.maxSubscribers !== undefined && video.subscriberCount > config.maxSubscribers) {
        return false;
      }
    }
    
    return true;
  });
}

// ============================================
// 메인 검색 함수
// ============================================

/**
 * 키워드로 영상 검색 (페이지네이션 지원, 최대 500개)
 */
export async function searchYouTubeVideos(
  config: YouTubeSearchConfig
): Promise<YouTubeSearchResult> {
  const timestamp = new Date().toLocaleString('ko-KR');
  
  try {
    const {
      apiKey,
      keyword,
      keywords,
      publishedAfter,
      publishedBefore,
      maxResults = 50,
      regionCode = 'KR',
      categoryId,
      order = 'viewCount',
      useCache = true,
      retryCount = 3,
      includeChannelInfo = false
    } = config;
    
    if (!apiKey) {
      throw new Error('API 키가 필요합니다');
    }
    
    // 캐시 확인
    const cacheKey = getCacheKey({ keyword, keywords, publishedAfter, publishedBefore, maxResults, categoryId });
    if (useCache) {
      const cached = getFromCache(cacheKey);
      if (cached) {
        console.log('[YOUTUBE] 📦 캐시에서 로드');
        return { ...cached, cached: true };
      }
    }
    
    // 검색 키워드 처리
    let searchQuery = '';
    if (keywords && keywords.length > 0) {
      // 다중 키워드 OR 검색
      searchQuery = keywords.join(' | ');
      console.log(`[YOUTUBE] 🔍 다중 키워드 검색: ${keywords.join(', ')}`);
    } else if (keyword) {
      searchQuery = keyword;
      console.log(`[YOUTUBE] 🔍 키워드 검색: "${keyword}"`);
    }
    
    // 페이지네이션으로 최대 500개까지
    const allVideoIds: string[] = [];
    let nextPageToken: string | undefined;
    const maxPages = Math.ceil(Math.min(maxResults, 500) / 50);
    
    for (let page = 0; page < maxPages; page++) {
      const searchParams = new URLSearchParams({
        part: 'snippet',
        type: 'video',
        maxResults: '50',
        order: order,
        regionCode: regionCode,
        key: apiKey
      });
      
      if (searchQuery) {
        searchParams.append('q', searchQuery);
      }
      
      if (publishedAfter) {
        searchParams.append('publishedAfter', toISODate(publishedAfter));
      }
      if (publishedBefore) {
        searchParams.append('publishedBefore', toISODate(publishedBefore, true));
      }
      
      if (categoryId) {
        searchParams.append('videoCategoryId', categoryId);
      }
      
      if (nextPageToken) {
        searchParams.append('pageToken', nextPageToken);
      }
      
      const data = await apiRequest(
        'https://www.googleapis.com/youtube/v3/search',
        searchParams,
        retryCount
      );
      
      const videoIds = (data.items || [])
        .map((item: any) => item.id?.videoId)
        .filter(Boolean);
      
      allVideoIds.push(...videoIds);
      
      nextPageToken = data.nextPageToken;
      if (!nextPageToken || allVideoIds.length >= maxResults) {
        break;
      }
      
      console.log(`[YOUTUBE] 📄 페이지 ${page + 1}: ${videoIds.length}개 (총 ${allVideoIds.length}개)`);
    }
    
    console.log(`[YOUTUBE] 📹 총 ${allVideoIds.length}개 영상 발견`);
    
    if (allVideoIds.length === 0) {
      return {
        success: true,
        videos: [],
        totalResults: 0,
        keyword: searchQuery,
        timestamp
      };
    }
    
    // 비디오 상세 정보 조회
    let videos = await getVideoDetails(
      apiKey,
      allVideoIds.slice(0, maxResults),
      includeChannelInfo || config.minSubscribers !== undefined || config.maxSubscribers !== undefined
    );
    
    // 필터 적용
    videos = applyFilters(videos, config);
    
    // 조회수 순 정렬
    videos.sort((a, b) => b.viewCount - a.viewCount);
    
    // 순위 부여
    videos.forEach((video, idx) => {
      video.rank = idx + 1;
    });
    
    console.log(`[YOUTUBE] ✅ ${videos.length}개 영상 수집 완료`);
    
    const result: YouTubeSearchResult = {
      success: true,
      videos,
      totalResults: videos.length,
      keyword: searchQuery,
      keywords: keywords,
      dateRange: publishedAfter || publishedBefore ? {
        from: publishedAfter || '',
        to: publishedBefore || ''
      } : undefined,
      timestamp
    };
    
    // 캐시 저장
    if (useCache) {
      setCache(cacheKey, result);
    }
    
    return result;
    
  } catch (error: any) {
    console.error('[YOUTUBE] ❌ 검색 실패:', error.message);
    return {
      success: false,
      videos: [],
      totalResults: 0,
      timestamp,
      error: error.message
    };
  }
}

/**
 * 실시간 인기 영상
 */
export async function getYouTubeTrending(
  config: YouTubeSearchConfig
): Promise<YouTubeSearchResult> {
  const timestamp = new Date().toLocaleString('ko-KR');
  
  try {
    const {
      apiKey,
      maxResults = 50,
      regionCode = 'KR',
      categoryId,
      useCache = true
    } = config;
    
    if (!apiKey) {
      throw new Error('API 키가 필요합니다');
    }
    
    // 캐시 확인
    const cacheKey = getCacheKey({ type: 'trending', categoryId, regionCode });
    if (useCache) {
      const cached = getFromCache(cacheKey);
      if (cached) {
        console.log('[YOUTUBE] 📦 캐시에서 로드 (트렌딩)');
        return { ...cached, cached: true };
      }
    }
    
    console.log('[YOUTUBE] 🔥 실시간 인기 영상 수집...');
    
    const params = new URLSearchParams({
      part: 'snippet,statistics,contentDetails',
      chart: 'mostPopular',
      regionCode: regionCode,
      maxResults: String(Math.min(maxResults, 50)),
      key: apiKey
    });
    
    if (categoryId) {
      params.append('videoCategoryId', categoryId);
    }
    
    const data = await apiRequest(
      'https://www.googleapis.com/youtube/v3/videos',
      params
    );
    
    let videos = (data.items || []).map((item: any, index: number) => {
      const snippet = item.snippet || {};
      const statistics = item.statistics || {};
      const contentDetails = item.contentDetails || {};
      
      const viewCount = parseInt(statistics.viewCount || '0', 10);
      const publishedAt = snippet.publishedAt || '';
      const durationSeconds = parseDurationToSeconds(contentDetails.duration || '');
      
      let viewsPerHour = 0;
      if (publishedAt) {
        const publishedDate = new Date(publishedAt);
        const hoursSincePublished = Math.max(1, (Date.now() - publishedDate.getTime()) / (1000 * 60 * 60));
        viewsPerHour = Math.round(viewCount / hoursSincePublished);
      }
      
      const categoryId = snippet.categoryId || '';
      const title = snippet.title || '';
      
      return {
        rank: index + 1,
        videoId: item.id,
        title: title,
        description: snippet.description || '',
        channelTitle: snippet.channelTitle || '',
        channelId: snippet.channelId || '',
        publishedAt: publishedAt,
        viewCount: viewCount,
        likeCount: parseInt(statistics.likeCount || '0', 10),
        commentCount: parseInt(statistics.commentCount || '0', 10),
        duration: formatDuration(durationSeconds),
        durationSeconds: durationSeconds,
        thumbnail: snippet.thumbnails?.maxres?.url || snippet.thumbnails?.high?.url || '',
        categoryId: categoryId,
        categoryName: CATEGORY_MAP[categoryId] || '기타',
        viewsPerHour: viewsPerHour,
        tags: snippet.tags || [],
        isShorts: isShorts({ durationSeconds, title })
      } as YouTubeVideo;
    });
    
    // 필터 적용
    videos = applyFilters(videos, config);
    
    console.log(`[YOUTUBE] ✅ 실시간 인기 ${videos.length}개 수집 완료`);
    
    const result: YouTubeSearchResult = {
      success: true,
      videos,
      totalResults: videos.length,
      timestamp
    };
    
    if (useCache) {
      setCache(cacheKey, result);
    }
    
    return result;
    
  } catch (error: any) {
    console.error('[YOUTUBE] ❌ 트렌딩 수집 실패:', error.message);
    return {
      success: false,
      videos: [],
      totalResults: 0,
      timestamp,
      error: error.message
    };
  }
}

/**
 * 급상승 영상 (시간당 조회수 기준)
 */
export async function getYouTubeRisingVideos(
  config: YouTubeSearchConfig
): Promise<YouTubeSearchResult> {
  const timestamp = new Date().toLocaleString('ko-KR');
  
  try {
    console.log('[YOUTUBE] 📈 급상승 영상 수집...');
    
    const { from, to } = getDateRange(1); // 최근 24시간
    
    const result = await searchYouTubeVideos({
      ...config,
      publishedAfter: from,
      publishedBefore: to,
      order: 'viewCount',
      includeChannelInfo: true
    });
    
    if (!result.success) {
      return result;
    }
    
    // 시간당 조회수로 재정렬
    result.videos.sort((a, b) => b.viewsPerHour - a.viewsPerHour);
    
    // 순위 재부여
    result.videos.forEach((video, idx) => {
      video.rank = idx + 1;
    });
    
    console.log(`[YOUTUBE] ✅ 급상승 ${result.videos.length}개 수집 완료`);
    
    return result;
    
  } catch (error: any) {
    console.error('[YOUTUBE] ❌ 급상승 수집 실패:', error.message);
    return {
      success: false,
      videos: [],
      totalResults: 0,
      timestamp,
      error: error.message
    };
  }
}

/**
 * 관련 영상 추천
 */
export async function getRelatedVideos(
  config: YouTubeSearchConfig & { videoId: string }
): Promise<YouTubeSearchResult> {
  const timestamp = new Date().toLocaleString('ko-KR');
  
  try {
    const { apiKey, videoId, maxResults = 25 } = config;
    
    if (!apiKey || !videoId) {
      throw new Error('API 키와 비디오 ID가 필요합니다');
    }
    
    console.log(`[YOUTUBE] 🔗 관련 영상 수집: ${videoId}`);
    
    const params = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      relatedToVideoId: videoId,
      maxResults: String(Math.min(maxResults, 50)),
      key: apiKey
    });
    
    const data = await apiRequest(
      'https://www.googleapis.com/youtube/v3/search',
      params
    );
    
    const videoIds = (data.items || [])
      .map((item: any) => item.id?.videoId)
      .filter(Boolean);
    
    if (videoIds.length === 0) {
      return {
        success: true,
        videos: [],
        totalResults: 0,
        timestamp
      };
    }
    
    let videos = await getVideoDetails(apiKey, videoIds);
    
    // 필터 적용
    videos = applyFilters(videos, config);
    
    // 조회수 순 정렬
    videos.sort((a, b) => b.viewCount - a.viewCount);
    
    videos.forEach((video, idx) => {
      video.rank = idx + 1;
    });
    
    console.log(`[YOUTUBE] ✅ 관련 영상 ${videos.length}개 수집 완료`);
    
    return {
      success: true,
      videos,
      totalResults: videos.length,
      timestamp
    };
    
  } catch (error: any) {
    console.error('[YOUTUBE] ❌ 관련 영상 수집 실패:', error.message);
    return {
      success: false,
      videos: [],
      totalResults: 0,
      timestamp,
      error: error.message
    };
  }
}

/**
 * 댓글 분석
 */
export async function analyzeVideoComments(
  config: YouTubeSearchConfig & { videoId: string; maxComments?: number }
): Promise<CommentAnalysisResult> {
  try {
    const { apiKey, videoId, maxComments = 100 } = config;
    
    if (!apiKey || !videoId) {
      throw new Error('API 키와 비디오 ID가 필요합니다');
    }
    
    console.log(`[YOUTUBE] 💬 댓글 분석: ${videoId}`);
    
    // 댓글 수집
    const allComments: YouTubeComment[] = [];
    let nextPageToken: string | undefined;
    
    while (allComments.length < maxComments) {
      const params = new URLSearchParams({
        part: 'snippet',
        videoId: videoId,
        maxResults: '100',
        order: 'relevance',
        key: apiKey
      });
      
      if (nextPageToken) {
        params.append('pageToken', nextPageToken);
      }
      
      const data = await apiRequest(
        'https://www.googleapis.com/youtube/v3/commentThreads',
        params
      );
      
      const comments = (data.items || []).map((item: any) => {
        const snippet = item.snippet?.topLevelComment?.snippet || {};
        return {
          commentId: item.id,
          text: snippet.textDisplay || '',
          authorName: snippet.authorDisplayName || '',
          likeCount: snippet.likeCount || 0,
          publishedAt: snippet.publishedAt || ''
        };
      });
      
      allComments.push(...comments);
      
      nextPageToken = data.nextPageToken;
      if (!nextPageToken) break;
    }
    
    // 키워드 추출
    const wordCount: Record<string, number> = {};
    let positiveCount = 0;
    let negativeCount = 0;
    
    const positiveWords = ['좋아요', '최고', '대박', '굿', '잘', '감사', '사랑', '웃겨', '재밌', '멋져', '👍', '❤️', '😂', '🔥'];
    const negativeWords = ['싫어', '별로', '최악', '안좋', '실망', '짜증', '화나', '👎', '😡', '🤮'];
    
    allComments.forEach(comment => {
      const text = comment.text.toLowerCase();
      
      // 감성 분석
      positiveWords.forEach(word => {
        if (text.includes(word.toLowerCase())) positiveCount++;
      });
      negativeWords.forEach(word => {
        if (text.includes(word.toLowerCase())) negativeCount++;
      });
      
      // 키워드 추출 (한글 단어)
      const words = text.match(/[가-힣]{2,10}/g) || [];
      words.forEach(word => {
        if (word.length >= 2 && !positiveWords.includes(word) && !negativeWords.includes(word)) {
          wordCount[word] = (wordCount[word] || 0) + 1;
        }
      });
    });
    
    // 키워드 정렬
    const keywords = Object.entries(wordCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word, count]) => ({ word, count }));
    
    // 감성 점수 (-1 ~ 1)
    const total = positiveCount + negativeCount;
    const sentimentScore = total > 0 ? (positiveCount - negativeCount) / total : 0;
    
    console.log(`[YOUTUBE] ✅ 댓글 ${allComments.length}개 분석 완료`);
    
    return {
      videoId,
      totalComments: allComments.length,
      keywords,
      sentimentScore: Math.round(sentimentScore * 100) / 100,
      topComments: allComments.slice(0, 10)
    };
    
  } catch (error: any) {
    console.error('[YOUTUBE] ❌ 댓글 분석 실패:', error.message);
    return {
      videoId: config.videoId,
      totalComments: 0,
      keywords: [],
      sentimentScore: 0,
      topComments: []
    };
  }
}

/**
 * 채널 인기 영상
 */
export async function getChannelPopularVideos(
  config: YouTubeSearchConfig & { channelId: string }
): Promise<YouTubeSearchResult> {
  const timestamp = new Date().toLocaleString('ko-KR');
  
  try {
    const { apiKey, channelId, maxResults = 50 } = config;
    
    if (!apiKey || !channelId) {
      throw new Error('API 키와 채널 ID가 필요합니다');
    }
    
    console.log(`[YOUTUBE] 📺 채널 인기 영상: ${channelId}`);
    
    const params = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      channelId: channelId,
      maxResults: String(Math.min(maxResults, 50)),
      order: 'viewCount',
      key: apiKey
    });
    
    const data = await apiRequest(
      'https://www.googleapis.com/youtube/v3/search',
      params
    );
    
    const videoIds = (data.items || [])
      .map((item: any) => item.id?.videoId)
      .filter(Boolean);
    
    if (videoIds.length === 0) {
      return {
        success: true,
        videos: [],
        totalResults: 0,
        timestamp
      };
    }
    
    let videos = await getVideoDetails(apiKey, videoIds);
    
    // 필터 적용
    videos = applyFilters(videos, config);
    
    videos.sort((a, b) => b.viewCount - a.viewCount);
    videos.forEach((video, idx) => {
      video.rank = idx + 1;
    });
    
    console.log(`[YOUTUBE] ✅ 채널 영상 ${videos.length}개 수집 완료`);
    
    return {
      success: true,
      videos,
      totalResults: videos.length,
      timestamp
    };
    
  } catch (error: any) {
    console.error('[YOUTUBE] ❌ 채널 영상 수집 실패:', error.message);
    return {
      success: false,
      videos: [],
      totalResults: 0,
      timestamp,
      error: error.message
    };
  }
}

// ============================================
// 편의 함수
// ============================================

/** 오늘 인기 영상 */
export async function getTodayPopularVideos(config: YouTubeSearchConfig): Promise<YouTubeSearchResult> {
  const { from, to } = getDateRange(1);
  return searchYouTubeVideos({ ...config, publishedAfter: from, publishedBefore: to });
}

/** 이번 주 인기 영상 */
export async function getWeeklyPopularVideos(config: YouTubeSearchConfig): Promise<YouTubeSearchResult> {
  const { from, to } = getDateRange(7);
  return searchYouTubeVideos({ ...config, publishedAfter: from, publishedBefore: to });
}

/** 이번 달 인기 영상 */
export async function getMonthlyPopularVideos(config: YouTubeSearchConfig): Promise<YouTubeSearchResult> {
  const { from, to } = getDateRange(30);
  return searchYouTubeVideos({ ...config, publishedAfter: from, publishedBefore: to });
}

/** 쇼츠만 검색 */
export async function getShortsVideos(config: YouTubeSearchConfig): Promise<YouTubeSearchResult> {
  return searchYouTubeVideos({ ...config, shortsOnly: true });
}

/** 긴 영상만 (10분 이상) */
export async function getLongVideos(config: YouTubeSearchConfig): Promise<YouTubeSearchResult> {
  return searchYouTubeVideos({ ...config, minDuration: 600, excludeShorts: true });
}

/** 조회수 10만 이상 영상 */
export async function getViralVideos(config: YouTubeSearchConfig): Promise<YouTubeSearchResult> {
  return searchYouTubeVideos({ ...config, minViewCount: 100000 });
}

/** 소형 채널 영상 (구독자 1만 이하) */
export async function getSmallChannelVideos(config: YouTubeSearchConfig): Promise<YouTubeSearchResult> {
  return searchYouTubeVideos({ ...config, maxSubscribers: 10000, includeChannelInfo: true });
}

/** 대형 채널 영상 (구독자 100만 이상) */
export async function getBigChannelVideos(config: YouTubeSearchConfig): Promise<YouTubeSearchResult> {
  return searchYouTubeVideos({ ...config, minSubscribers: 1000000, includeChannelInfo: true });
}

// 카테고리별
export async function getNewsVideos(config: YouTubeSearchConfig) { return getYouTubeTrending({ ...config, categoryId: '25' }); }
export async function getEntertainmentVideos(config: YouTubeSearchConfig) { return getYouTubeTrending({ ...config, categoryId: '24' }); }
export async function getGamingVideos(config: YouTubeSearchConfig) { return getYouTubeTrending({ ...config, categoryId: '20' }); }
export async function getMusicVideos(config: YouTubeSearchConfig) { return getYouTubeTrending({ ...config, categoryId: '10' }); }
export async function getSportsVideos(config: YouTubeSearchConfig) { return getYouTubeTrending({ ...config, categoryId: '17' }); }
export async function getEducationVideos(config: YouTubeSearchConfig) { return getYouTubeTrending({ ...config, categoryId: '27' }); }
export async function getTechVideos(config: YouTubeSearchConfig) { return getYouTubeTrending({ ...config, categoryId: '28' }); }

/** 캐시 초기화 */
/**
 * YouTube 트렌드 키워드 추출 (트렌딩 영상 제목 기반)
 */
export async function getYouTubeTrendKeywords(config: { 
  apiKey: string; 
  maxResults?: number;
}): Promise<Array<{ keyword: string; viewCount?: number; changeRate?: number; category?: string }>> {
  try {
    const { apiKey, maxResults = 50 } = config;
    
    if (!apiKey) {
      console.warn('[YOUTUBE] API 키가 없습니다.');
      return [];
    }
    
    // 트렌딩 영상 가져오기
    const trendingResult = await getYouTubeTrending({
      apiKey,
      maxResults,
      regionCode: 'KR',
      useCache: true
    });
    
    if (!trendingResult.success || !trendingResult.videos || trendingResult.videos.length === 0) {
      console.warn('[YOUTUBE] 트렌딩 영상이 없습니다.');
      return [];
    }
    
    // 영상 제목에서 키워드 추출
    const keywords: Array<{ keyword: string; viewCount: number; changeRate: number; category: string }> = [];
    const seenKeywords = new Set<string>();

    // 시간당 조회수 기반 급상승률 계산을 위한 최대값 사전 계산
    const maxViewsPerHour = Math.max(...trendingResult.videos.map(v => v.viewsPerHour), 1);

    trendingResult.videos.forEach((video) => {
      // 제목에서 핵심 키워드 추출 (2-10자 단어)
      const title = video.title || '';
      const words = title
        .replace(/[^\w\s가-힣]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length >= 2 && word.length <= 10)
        .filter(word => !['영상', '동영상', '비디오', '보기', '시청', '구독', '좋아요'].includes(word));

      // 조회수가 높은 영상의 키워드 우선
      words.forEach(word => {
        const keyword = word.trim();
        if (keyword && keyword.length >= 2 && !seenKeywords.has(keyword)) {
          seenKeywords.add(keyword);
          // 시간당 조회수 기반 실제 급상승률 계산
          const changeRate = Math.round((video.viewsPerHour / maxViewsPerHour) * 200);
          keywords.push({
            keyword,
            viewCount: video.viewCount || 0,
            changeRate,
            category: video.categoryName || '기타'
          });
        }
      });
    });
    
    // 조회수 순으로 정렬
    keywords.sort((a, b) => b.viewCount - a.viewCount);
    
    console.log(`[YOUTUBE] ✅ 트렌드 키워드 ${keywords.length}개 추출 완료`);
    
    return keywords.slice(0, maxResults);
    
  } catch (error: any) {
    console.error('[YOUTUBE] ❌ 트렌드 키워드 추출 실패:', error.message);
    return [];
  }
}

export function clearCache(): void {
  cache.clear();
  console.log('[YOUTUBE] 🗑️ 캐시 초기화');
}

// ============================================
// 테스트
// ============================================

if (require.main === module) {
  const API_KEY = process.env.YOUTUBE_API_KEY || 'YOUR_API_KEY';
  
  async function test() {
    console.log('\n========== YouTube 크롤러 V3 (끝판왕) 테스트 ==========\n');
    
    // 1. 실시간 인기
    console.log('1. 🔥 실시간 인기 영상:');
    const trending = await getYouTubeTrending({ apiKey: API_KEY, maxResults: 5 });
    if (trending.success) {
      trending.videos.forEach(v => {
        console.log(`  ${v.rank}. ${v.title.substring(0, 35)}... (${v.viewCount.toLocaleString()}회)`);
      });
    }
    
    // 2. 다중 키워드 검색
    console.log('\n2. 🔍 다중 키워드 검색 (아이폰 OR 삼성):');
    const multiSearch = await searchYouTubeVideos({
      apiKey: API_KEY,
      keywords: ['아이폰', '삼성'],
      maxResults: 5
    });
    if (multiSearch.success) {
      multiSearch.videos.forEach(v => {
        console.log(`  ${v.rank}. ${v.title.substring(0, 35)}... (${v.viewCount.toLocaleString()}회)`);
      });
    }
    
    // 3. 쇼츠만
    console.log('\n3. 📱 쇼츠만:');
    const shorts = await getShortsVideos({
      apiKey: API_KEY,
      keyword: '먹방',
      maxResults: 5
    });
    if (shorts.success) {
      shorts.videos.forEach(v => {
        console.log(`  ${v.rank}. ${v.title.substring(0, 35)}... (${v.duration})`);
      });
    }
    
    // 4. 조회수 100만 이상
    console.log('\n4. 💥 조회수 100만 이상:');
    const viral = await searchYouTubeVideos({
      apiKey: API_KEY,
      minViewCount: 1000000,
      maxResults: 5
    });
    if (viral.success) {
      viral.videos.forEach(v => {
        console.log(`  ${v.rank}. ${v.title.substring(0, 35)}... (${v.viewCount.toLocaleString()}회)`);
      });
    }
    
    // 5. 급상승
    console.log('\n5. 📈 급상승 (시간당 조회수):');
    const rising = await getYouTubeRisingVideos({ apiKey: API_KEY, maxResults: 5 });
    if (rising.success) {
      rising.videos.forEach(v => {
        console.log(`  ${v.rank}. ${v.title.substring(0, 35)}... (${v.viewsPerHour.toLocaleString()}/시간)`);
      });
    }
    
    console.log('\n========== 테스트 완료 ==========');
  }
  
  test().catch(console.error);
}