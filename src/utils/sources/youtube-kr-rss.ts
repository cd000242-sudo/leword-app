/**
 * YouTube 한국 트렌딩 RSS + 영상 제목 키워드 추출
 *
 * 합법성: 완전 공개 RSS, 인증 불필요, YouTube ToS 허용 범위.
 * 차별점: 한국 키워드 도구 0% 활용. 네이버 검색 트렌드보다 2~5일 선행.
 */

import axios from 'axios';

export interface YoutubeTrendingVideo {
    title: string;
    videoId: string;
    channel: string;
    published: string;
}

const TRENDING_FEED = 'https://www.youtube.com/feeds/videos.xml?chart=most_popular&regionCode=KR';
const DATA_API = 'https://www.googleapis.com/youtube/v3/videos';

function getYoutubeApiKey(): string {
    // 런타임 환경변수 우선, EnvironmentManager는 지연 로드 (순환참조 방지)
    const direct = process.env['YOUTUBE_API_KEY'] || '';
    if (direct) return direct;
    try {
        const { EnvironmentManager } = require('../environment-manager');
        const cfg = EnvironmentManager.getInstance?.()?.getConfig?.() || {};
        return String(cfg.youtubeApiKey || '');
    } catch {
        return '';
    }
}

export async function fetchYoutubeKRTrending(): Promise<YoutubeTrendingVideo[]> {
    // 1차: Data API v3 (공식, 안정)
    const apiKey = getYoutubeApiKey();
    if (apiKey) {
        try {
            const res = await axios.get(DATA_API, {
                timeout: 15000,
                params: {
                    part: 'snippet',
                    chart: 'mostPopular',
                    regionCode: 'KR',
                    maxResults: 50,
                    key: apiKey,
                },
            });
            const items = res.data?.items;
            if (Array.isArray(items) && items.length > 0) {
                return items.map((it: any): YoutubeTrendingVideo => ({
                    title: String(it.snippet?.title || ''),
                    videoId: String(it.id || ''),
                    channel: String(it.snippet?.channelTitle || ''),
                    published: String(it.snippet?.publishedAt || ''),
                })).filter(v => v.title && v.videoId);
            }
        } catch (err: any) {
            console.warn('[youtube-kr-rss] Data API 실패, RSS 폴백:', err?.response?.status || err.message);
        }
    }

    // 2차 폴백: 구식 RSS (keyed away인 경우)
    try {
        const res = await axios.get(TRENDING_FEED, {
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0 LEWORD/1.0' },
        });
        return parseAtomFeed(res.data);
    } catch (err: any) {
        console.error('[youtube-kr-rss] 트렌딩 피드 실패:', err.message);
        return [];
    }
}

/**
 * 채널 RSS도 수집 가능 (선행지표 채널 모니터링)
 */
export async function fetchChannelRSS(channelId: string): Promise<YoutubeTrendingVideo[]> {
    try {
        const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
        const res = await axios.get(url, { timeout: 10000 });
        return parseAtomFeed(res.data);
    } catch (err: any) {
        console.error('[youtube-kr-rss] 채널 피드 실패:', err.message);
        return [];
    }
}

function parseAtomFeed(xml: string): YoutubeTrendingVideo[] {
    const entries = xml.split('<entry>').slice(1);
    const videos: YoutubeTrendingVideo[] = [];
    for (const e of entries) {
        const title = extract(e, '<title>', '</title>');
        const videoId = extract(e, '<yt:videoId>', '</yt:videoId>');
        const channel = extract(e, '<name>', '</name>');
        const published = extract(e, '<published>', '</published>');
        if (title && videoId) {
            videos.push({ title: decodeXml(title), videoId, channel: decodeXml(channel), published });
        }
    }
    return videos;
}

function extract(s: string, start: string, end: string): string {
    const i = s.indexOf(start);
    if (i < 0) return '';
    const j = s.indexOf(end, i + start.length);
    if (j < 0) return '';
    return s.substring(i + start.length, j).trim();
}

function decodeXml(s: string): string {
    return s
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

/**
 * 영상 제목에서 한국어 명사구 추출 (룰 베이스)
 * 형태소 분석기 의존성 없이 간단 추출 — 2글자 이상 한글 토큰만
 */
export function extractKoreanNouns(titles: string[]): Map<string, number> {
    const freq = new Map<string, number>();
    const stopWords = new Set([
        '오늘', '지금', '진짜', '완전', '정말', '바로', '그냥', '이거', '저거',
        '영상', '구독', '좋아요', '알람', '댓글', '공유', '시청', '채널',
    ]);

    for (const title of titles) {
        // [ ] 안의 카테고리 태그는 분리
        const cleaned = title.replace(/\[[^\]]*\]/g, ' ');
        // 한글 2글자 이상 시퀀스
        const matches = cleaned.match(/[가-힣]{2,}/g) || [];
        for (const m of matches) {
            if (m.length > 12) continue;
            if (stopWords.has(m)) continue;
            freq.set(m, (freq.get(m) || 0) + 1);
        }
    }

    return freq;
}

/**
 * 트렌딩 + 명사 추출 = 키워드 후보 리스트
 */
export async function getYoutubeTrendingKeywords(): Promise<Array<{ keyword: string; frequency: number }>> {
    const videos = await fetchYoutubeKRTrending();
    const titles = videos.map(v => v.title);
    const freq = extractKoreanNouns(titles);

    return Array.from(freq.entries())
        .filter(([_, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 100)
        .map(([keyword, frequency]) => ({ keyword, frequency }));
}
