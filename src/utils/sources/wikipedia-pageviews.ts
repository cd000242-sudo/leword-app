/**
 * 위키피디아 한국어 Pageviews API
 *
 * 합법성: Wikimedia 공식 무료 API. 인증 불필요. 상업 이용 OK.
 * 차별점: 정량적 페이지뷰 데이터로 "오늘 한국인이 가장 궁금해하는 개념" 측정.
 */

import axios from 'axios';

export interface WikiPageView {
    article: string;
    rank: number;
    views: number;
}

const BASE = 'https://wikimedia.org/api/rest_v1/metrics/pageviews';
const PROJECT = 'ko.wikipedia.org';

function pad(n: number): string {
    return String(n).padStart(2, '0');
}

function getDateParts(daysAgo: number = 1): { y: string; m: string; d: string } {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return {
        y: String(date.getFullYear()),
        m: pad(date.getMonth() + 1),
        d: pad(date.getDate()),
    };
}

/**
 * 한국어 위키 일별 Top 1000 페이지뷰
 */
export async function fetchKoreanWikiTop(daysAgo: number = 1): Promise<WikiPageView[]> {
    const { y, m, d } = getDateParts(daysAgo);
    const url = `${BASE}/top/${PROJECT}/all-access/${y}/${m}/${d}`;

    try {
        const res = await axios.get(url, {
            timeout: 15000,
            headers: { 'User-Agent': 'LEWORD-KeywordTool/1.0 (research; cd000242@gmail.com)' },
        });

        const articles = res.data?.items?.[0]?.articles;
        if (!Array.isArray(articles)) return [];

        const skipPatterns = /^(특수|위키백과|파일|틀|분류|도움말|Special):/;

        return articles
            .map((a: any) => ({
                article: String(a.article || '').replace(/_/g, ' '),
                rank: Number(a.rank) || 0,
                views: Number(a.views) || 0,
            }))
            .filter((a: WikiPageView) => a.article && !skipPatterns.test(a.article) && a.article !== '대문');
    } catch (err: any) {
        console.error('[wikipedia-pageviews] Top 호출 실패:', err.message);
        return [];
    }
}

/**
 * 단일 문서의 시계열 페이지뷰 (급상승 감지용)
 */
export async function fetchArticleViewsTimeseries(article: string, days: number = 30): Promise<Array<{ date: string; views: number }>> {
    const end = new Date();
    end.setDate(end.getDate() - 1);
    const start = new Date(end);
    start.setDate(end.getDate() - days);

    const fmt = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    const encoded = encodeURIComponent(article.replace(/ /g, '_'));
    const url = `${BASE}/per-article/${PROJECT}/all-access/all-agents/${encoded}/daily/${fmt(start)}/${fmt(end)}`;

    try {
        const res = await axios.get(url, {
            timeout: 15000,
            headers: { 'User-Agent': 'LEWORD-KeywordTool/1.0' },
        });
        const items = res.data?.items;
        if (!Array.isArray(items)) return [];
        return items.map((it: any) => ({
            date: String(it.timestamp || '').slice(0, 8),
            views: Number(it.views) || 0,
        }));
    } catch (err: any) {
        return [];
    }
}

/**
 * 급상승 감지: 어제 vs 7일 평균 비교
 */
export async function detectWikiRisingArticles(threshold: number = 3.0): Promise<Array<{ article: string; views: number; ratio: number }>> {
    const top = await fetchKoreanWikiTop(1);
    const result: Array<{ article: string; views: number; ratio: number }> = [];

    for (const item of top.slice(0, 50)) {
        const series = await fetchArticleViewsTimeseries(item.article, 8);
        if (series.length < 7) continue;
        const yesterday = series[series.length - 1]?.views || 0;
        const prior7 = series.slice(0, 7).map(s => s.views);
        const avg = prior7.reduce((a, b) => a + b, 0) / Math.max(1, prior7.length);
        const ratio = avg > 0 ? yesterday / avg : 0;
        if (ratio >= threshold) {
            result.push({ article: item.article, views: yesterday, ratio: parseFloat(ratio.toFixed(2)) });
        }
        await new Promise(r => setTimeout(r, 200));
    }

    return result.sort((a, b) => b.ratio - a.ratio);
}
