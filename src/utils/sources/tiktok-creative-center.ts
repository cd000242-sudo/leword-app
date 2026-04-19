/**
 * TikTok Creative Center 트렌드 수집
 *
 * 합법성: ads.tiktok.com/business/creativecenter는 게스트 무료 공개.
 * 내부 API(creative_radar_api/v1)는 비공식이지만 인증 불필요.
 *
 * 차별점: 한국 10~20대 트렌드 2~4주 선행 지표. 경쟁 키워드 도구 0% 활용.
 */

import axios from 'axios';

export interface TiktokHashtagTrend {
    hashtag: string;
    rank: number;
    publishCount: number;
    viewCount: number;
    rankDiff: number;
    industry?: string;
}

const HASHTAG_API = 'https://ads.tiktok.com/creative_radar_api/v1/popular_trend/hashtag/list';

let tiktokAuthWarned = false;

export async function fetchTiktokTrendingHashtags(options: {
    period?: 7 | 30 | 120;
    countryCode?: string;
    limit?: number;
} = {}): Promise<TiktokHashtagTrend[]> {
    const params = {
        period: options.period || 7,
        country_code: options.countryCode || 'KR',
        page: 1,
        limit: options.limit || 50,
    };

    try {
        const res = await axios.get(HASHTAG_API, {
            params,
            timeout: 20000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Referer': 'https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en',
            },
        });

        // API가 인증 토큰 필요로 변경됨: code 40101 'no permission'. 감지해서 조용히 skip.
        const code = res.data?.code;
        if (code && code !== 0) {
            if (!tiktokAuthWarned) {
                console.warn(`[tiktok-cc] API 인증 필요 (code=${code}) — 이 소스는 비활성화됩니다.`);
                tiktokAuthWarned = true;
            }
            return [];
        }
        const list = res.data?.data?.list;
        if (!Array.isArray(list)) return [];

        return list.map((item: any) => ({
            hashtag: String(item.hashtag_name || '').replace(/^#/, ''),
            rank: Number(item.rank) || 0,
            publishCount: Number(item.publish_cnt) || 0,
            viewCount: Number(item.view_cnt) || 0,
            rankDiff: Number(item.rank_diff) || 0,
            industry: item.industry_info?.value || undefined,
        })).filter((h: TiktokHashtagTrend) => h.hashtag.length > 0);
    } catch (err: any) {
        console.error('[tiktok-cc] 해시태그 API 실패:', err.message);
        return [];
    }
}

const KEYWORD_API = 'https://ads.tiktok.com/creative_radar_api/v1/keyword_insights/keyword/list';

export interface TiktokKeywordInsight {
    keyword: string;
    ctr: number;
    cvr: number;
    impression: number;
    likes: number;
}

export async function fetchTiktokKeywordInsights(countryCode: string = 'KR'): Promise<TiktokKeywordInsight[]> {
    try {
        const res = await axios.get(KEYWORD_API, {
            params: { country_code: countryCode, period: 7, page: 1, limit: 50 },
            timeout: 20000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
                'Referer': 'https://ads.tiktok.com/business/creativecenter/keyword-insights',
            },
        });

        const list = res.data?.data?.keyword_list || res.data?.data?.list;
        if (!Array.isArray(list)) return [];

        return list.map((item: any) => ({
            keyword: String(item.keyword || '').trim(),
            ctr: Number(item.ctr) || 0,
            cvr: Number(item.cvr) || 0,
            impression: Number(item.impression) || 0,
            likes: Number(item.likes) || 0,
        })).filter((k: TiktokKeywordInsight) => k.keyword.length > 0);
    } catch (err: any) {
        console.error('[tiktok-cc] 키워드 인사이트 실패:', err.message);
        return [];
    }
}

/**
 * 급상승 해시태그 (rank_diff 양수가 큰 것)
 */
export async function getRisingHashtags(): Promise<TiktokHashtagTrend[]> {
    const all = await fetchTiktokTrendingHashtags({ period: 7 });
    return all
        .filter(h => h.rankDiff > 0)
        .sort((a, b) => b.rankDiff - a.rankDiff)
        .slice(0, 30);
}
