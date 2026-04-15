/**
 * Threads Graph API — 키워드 검색 + 버즈 측정
 *
 * 합법성: Meta 공식 Graph API (v22.0). 사용자 access token 필요.
 * 차별점: 한국 20~30대 여성 얼리어답터 트렌드. 경쟁 도구 0개.
 */

import axios from 'axios';
import { EnvironmentManager } from '../environment-manager';

export interface ThreadsPost {
    id: string;
    text: string;
    timestamp: string;
    likeCount: number;
    repliesCount: number;
    repostsCount: number;
    quotesCount: number;
}

const GRAPH_BASE = 'https://graph.threads.net/v1.0';

function getAccessToken(): string {
    const envMgr = EnvironmentManager.getInstance();
    const cfg: any = envMgr.getConfig();
    const token = cfg.threadsAccessToken || process.env['THREADS_ACCESS_TOKEN'] || '';
    if (!token) {
        throw new Error('Threads access token이 설정되지 않았습니다. 환경설정에서 THREADS_ACCESS_TOKEN을 설정하세요.');
    }
    return token;
}

/**
 * 키워드 검색 (Threads Keyword Search API)
 */
export async function searchThreads(query: string, options: { searchType?: 'TOP' | 'RECENT'; limit?: number } = {}): Promise<ThreadsPost[]> {
    try {
        const token = getAccessToken();
        const url = `${GRAPH_BASE}/keyword_search`;
        const res = await axios.get(url, {
            params: {
                q: query,
                search_type: options.searchType || 'TOP',
                fields: 'id,text,timestamp,permalink',
                access_token: token,
            },
            timeout: 15000,
        });

        const data = res.data?.data;
        if (!Array.isArray(data)) return [];

        return data.slice(0, options.limit || 50).map((p: any) => ({
            id: String(p.id || ''),
            text: String(p.text || ''),
            timestamp: String(p.timestamp || ''),
            likeCount: Number(p.like_count) || 0,
            repliesCount: Number(p.replies_count) || 0,
            repostsCount: Number(p.reposts_count) || 0,
            quotesCount: Number(p.quotes_count) || 0,
        }));
    } catch (err: any) {
        console.error('[threads] 검색 실패:', err.message);
        return [];
    }
}

/**
 * 키워드 버즈 점수 = (게시물 수 + 평균 인게이지먼트) 정규화
 */
export async function getKeywordBuzzScore(keyword: string): Promise<{ posts: number; avgEngagement: number; buzzScore: number }> {
    const posts = await searchThreads(keyword, { searchType: 'RECENT', limit: 50 });
    if (posts.length === 0) return { posts: 0, avgEngagement: 0, buzzScore: 0 };

    const totalEng = posts.reduce((sum, p) => sum + p.likeCount + p.repliesCount + p.repostsCount + p.quotesCount, 0);
    const avgEng = totalEng / posts.length;
    const buzzScore = Math.min(100, Math.round(Math.sqrt(posts.length) * 10 + Math.log10(1 + avgEng) * 15));

    return {
        posts: posts.length,
        avgEngagement: parseFloat(avgEng.toFixed(2)),
        buzzScore,
    };
}

/**
 * 배치 키워드 버즈 측정
 */
export async function batchKeywordBuzz(keywords: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    for (const kw of keywords) {
        try {
            const { buzzScore } = await getKeywordBuzzScore(kw);
            result.set(kw, buzzScore);
        } catch {
            result.set(kw, 0);
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    return result;
}
