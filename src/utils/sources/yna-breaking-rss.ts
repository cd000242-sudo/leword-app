/**
 * 연합뉴스 속보 RSS — 속보성 이슈 키워드 (최상단 섹션)
 *
 * 합법성: 공공 RSS.
 * 차별점: 통신사 속보 = 타 매체보다 빠름, 이슈 블로그에 직결.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractKoreanNouns } from './youtube-kr-rss';

const RSS_URLS = [
    'https://www.yna.co.kr/rss/news.xml',         // 연합뉴스 속보
    'https://www.yna.co.kr/rss/politics.xml',
    'https://www.yna.co.kr/rss/economy.xml',
    'https://www.yna.co.kr/rss/society.xml',
    'https://www.yna.co.kr/rss/industry.xml',
    'https://www.yna.co.kr/rss/entertainment.xml',
];
const UA = 'Mozilla/5.0 (compatible; LEWORD/1.0; +https://leword.app)';

async function fetchRss(url: string): Promise<string[]> {
    try {
        const res = await axios.get(url, {
            timeout: 10000,
            headers: { 'User-Agent': UA, 'Accept': 'application/rss+xml,text/xml,*/*' },
            validateStatus: s => s < 500,
        });
        if (typeof res.data !== 'string') return [];
        const $ = cheerio.load(res.data, { xmlMode: true });
        const out: string[] = [];
        $('item > title').each((_, el) => {
            const t = $(el).text().trim().replace(/\s+/g, ' ');
            if (t && t.length >= 6 && t.length <= 100) out.push(t);
        });
        return out;
    } catch (err: any) {
        console.warn(`[yna] RSS 실패 (${url}):`, err?.message);
        return [];
    }
}

export async function getYnaBreakingKeywords(): Promise<Array<{ keyword: string; frequency: number }>> {
    const all: string[] = [];
    for (const url of RSS_URLS) {
        all.push(...await fetchRss(url));
    }
    if (all.length === 0) return [];
    const freq = extractKoreanNouns(all);
    return Array.from(freq.entries())
        .filter(([_, c]) => c >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 150)
        .map(([keyword, frequency]) => ({ keyword, frequency }));
}
