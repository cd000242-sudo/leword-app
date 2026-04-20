/**
 * 루리웹 — 게임/애니/IT/일상 커뮤니티
 *
 * 합법성: 공개 제목만.
 * 차별점: 서브컬처/일본산 콘텐츠·애니 트렌드 감지.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractKoreanNouns } from './youtube-kr-rss';

const URLS = [
    'https://bbs.ruliweb.com/news',
    'https://bbs.ruliweb.com/best/humor',
];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchTitles(): Promise<string[]> {
    const titles: string[] = [];
    for (const url of URLS) {
        try {
            const res = await axios.get(url, {
                timeout: 10000,
                headers: {
                    'User-Agent': UA,
                    'Accept-Language': 'ko-KR,ko;q=0.9',
                    'Referer': 'https://bbs.ruliweb.com/',
                },
                validateStatus: s => s < 500,
            });
            if (typeof res.data !== 'string') continue;
            const $ = cheerio.load(res.data);
            const selectors = [
                'a.deco',                 // 베스트/뉴스 제목 공통
                '.subject a',             // 일반 리스트 제목
                '.table_body .subject a',
                'a[href*="/read/"]',
            ];
            for (const sel of selectors) {
                $(sel).each((_, el) => {
                    const t = $(el).text().trim().replace(/\s+/g, ' ');
                    if (t && t.length >= 4 && t.length <= 80) titles.push(t);
                });
            }
        } catch (err: any) {
            console.warn('[ruliweb] 수집 실패:', err?.message);
        }
    }
    return titles;
}

export async function getRuliwebKeywords(): Promise<Array<{ keyword: string; frequency: number }>> {
    const titles = await fetchTitles();
    if (titles.length === 0) return [];
    const freq = extractKoreanNouns(titles);
    return Array.from(freq.entries())
        .filter(([_, c]) => c >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 100)
        .map(([keyword, frequency]) => ({ keyword, frequency }));
}
