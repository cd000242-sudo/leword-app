/**
 * 재테크/주식 이슈 수집 — 금융 블로그 고CPC
 *
 * 합법성: 공개 뉴스 RSS + 네이버 증권 HTML.
 * 차별점: 종목 테마 블루오션. 테마 한 번 터지면 검색량 급등.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractKoreanNouns } from './youtube-kr-rss';

const URLS = [
    'https://www.yna.co.kr/rss/economy.xml',
    'https://www.yna.co.kr/rss/stockmarket.xml',
    'https://www.yna.co.kr/rss/financing.xml',
    'https://finance.naver.com/news/mainnews.naver',
];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

async function fetchTitles(): Promise<string[]> {
    const titles: string[] = [];
    for (const url of URLS) {
        try {
            const res = await axios.get(url, {
                timeout: 10000,
                headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' },
                validateStatus: s => s < 500,
            });
            if (typeof res.data !== 'string') continue;
            const isXml = url.endsWith('.xml');
            const $ = cheerio.load(res.data, { xmlMode: isXml });
            if (isXml) {
                $('item > title').each((_, el) => {
                    const t = $(el).text().trim().replace(/\s+/g, ' ');
                    if (t && t.length >= 6 && t.length <= 100) titles.push(t);
                });
            } else {
                const selectors = [
                    'dd.articleSubject a',
                    '.mainNewsList .articleSubject a',
                    'a[href*="/news/news_read"]',
                ];
                for (const sel of selectors) {
                    $(sel).each((_, el) => {
                        const t = $(el).text().trim().replace(/\s+/g, ' ');
                        if (t && t.length >= 6 && t.length <= 100) titles.push(t);
                    });
                }
            }
        } catch (err: any) {
            console.warn('[finance] 수집 실패:', err?.message);
        }
    }
    return titles;
}

export async function getFinanceKeywords(): Promise<Array<{ keyword: string; frequency: number }>> {
    const titles = await fetchTitles();
    if (titles.length === 0) return [];
    const freq = extractKoreanNouns(titles);
    const BOOST = ['주식', '코스피', '코스닥', '비트코인', '이더리움', '금리', '환율', '배당', 'ETF', '펀드', '연금', 'IRP', '청약'];
    for (const t of titles) {
        for (const kw of BOOST) {
            if (t.includes(kw)) freq.set(kw, (freq.get(kw) || 0) + 1);
        }
    }
    return Array.from(freq.entries())
        .filter(([kw, _]) => kw.length >= 2 && kw.length <= 15)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 120)
        .map(([keyword, frequency]) => ({ keyword, frequency }));
}
