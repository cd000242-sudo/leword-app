/**
 * 빅카인즈 뉴스 버즈 — 한국언론재단 공공 뉴스 빅데이터
 *
 * 합법성: 공공 뉴스 빅데이터, 회원가입 후 무료 사용. 웹 검색은 무료, API는 신청 필요.
 * 차별점: 뉴스 언급 급증 → 검색 버즈 12~48시간 선행 신호.
 */

import axios from 'axios';

const SEARCH_ENDPOINT = 'https://www.bigkinds.or.kr/api/news/search.do';

export interface NewsArticle {
    title: string;
    publishedAt: string;
    provider: string;
    url: string;
    category: string;
}

export interface BuzzMeasurement {
    keyword: string;
    todayCount: number;
    weekAvg: number;
    buzzScore: number;
    isRising: boolean;
}

/**
 * 키워드 뉴스 검색 (최근 N일)
 */
export async function searchNews(keyword: string, days: number = 7): Promise<NewsArticle[]> {
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - days);

    const fmt = (d: Date) => d.toISOString().split('T')[0];

    try {
        const res = await axios.post(SEARCH_ENDPOINT, {
            indexName: 'news',
            searchKey: keyword,
            searchKeys: [{ orKeywords: [keyword] }],
            byLine: '',
            searchFilterType: '1',
            searchScopeType: '1',
            searchSortType: 'date',
            sortMethod: 'date',
            mainTodayPersonYn: '',
            startDate: fmt(start),
            endDate: fmt(end),
            newsIds: [],
            categoryCodes: [],
            providerCodes: [],
            incidentCodes: [],
            networkNodeType: '',
            topicOrigin: '',
            dateCodes: [],
            startNo: 1,
            resultNumber: 100,
            isTmUsable: false,
            isNotTmUsable: false,
        }, {
            timeout: 20000,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Referer': 'https://www.bigkinds.or.kr/v2/news/index.do',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            },
        });

        const docs = res.data?.resultList || res.data?.documents || [];
        if (!Array.isArray(docs)) return [];

        return docs.map((d: any) => ({
            title: String(d.TITLE || d.title || '').replace(/<[^>]+>/g, ''),
            publishedAt: String(d.DATE || d.published_at || ''),
            provider: String(d.PROVIDER || d.provider || ''),
            url: String(d.PROVIDER_LINK_PAGE || d.url || ''),
            category: String(d.CATEGORY_MAIN || d.category || ''),
        }));
    } catch (err: any) {
        console.error('[bigkinds] 뉴스 검색 실패:', err.message);
        return [];
    }
}

/**
 * 키워드 버즈 측정: 오늘 vs 지난 7일 평균
 */
export async function measureKeywordBuzz(keyword: string): Promise<BuzzMeasurement> {
    const news = await searchNews(keyword, 8);
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');

    const todayCount = news.filter(n => n.publishedAt.startsWith(today)).length;
    const weekTotal = news.length - todayCount;
    const weekAvg = weekTotal / 7;
    const ratio = weekAvg > 0 ? todayCount / weekAvg : (todayCount > 0 ? 10 : 0);
    const buzzScore = Math.min(100, Math.round(ratio * 20));
    const isRising = ratio >= 2.0 && todayCount >= 3;

    return {
        keyword,
        todayCount,
        weekAvg: parseFloat(weekAvg.toFixed(2)),
        buzzScore,
        isRising,
    };
}

/**
 * 배치 버즈 측정
 */
export async function batchMeasureBuzz(keywords: string[]): Promise<BuzzMeasurement[]> {
    const results: BuzzMeasurement[] = [];
    for (const kw of keywords) {
        results.push(await measureKeywordBuzz(kw));
        await new Promise(r => setTimeout(r, 1500));
    }
    return results;
}
