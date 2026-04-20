/**
 * MLB파크 불펜 베스트 — 스포츠/연예/이슈 광범위
 *
 * 합법성: 공개 게시글 제목만.
 * 차별점: 불펜은 스포츠 외에도 시사/연예/이슈글 집결지.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractKoreanNouns } from './youtube-kr-rss';

const URLS = [
    'https://mlbpark.donga.com/mp/b.php?b=bullpen&select=&query=&subselect=&subquery=&user=&reply=&source=',
    'https://mlbpark.donga.com/mp/b.php?b=bullpen2',
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
                    'Referer': 'https://mlbpark.donga.com/',
                },
                validateStatus: s => s < 500,
            });
            if (typeof res.data !== 'string') continue;
            const $ = cheerio.load(res.data);
            const selectors = [
                'a.bullpenbox',         // 불펜 제목
                'td.t_left a',          // 일반 리스트 제목
                '.tit a',               // 신규 구조
                'a[href*="/b_view.php"]',
            ];
            for (const sel of selectors) {
                $(sel).each((_, el) => {
                    const t = $(el).text().trim().replace(/\s+/g, ' ');
                    if (t && t.length >= 4 && t.length <= 80) titles.push(t);
                });
            }
        } catch (err: any) {
            console.warn('[mlbpark] 수집 실패:', err?.message);
        }
    }
    return titles;
}

export async function getMlbparkKeywords(): Promise<Array<{ keyword: string; frequency: number }>> {
    const titles = await fetchTitles();
    if (titles.length === 0) return [];
    const freq = extractKoreanNouns(titles);
    return Array.from(freq.entries())
        .filter(([_, c]) => c >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 100)
        .map(([keyword, frequency]) => ({ keyword, frequency }));
}
