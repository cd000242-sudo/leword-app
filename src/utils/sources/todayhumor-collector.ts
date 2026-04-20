/**
 * 오늘의 유머(오유) 베오베 — 밈/이슈/일상 트렌드
 * (개드립넷은 차단이 잦아 안정적 대체로 오유 채택)
 *
 * 합법성: 공개 제목만.
 * 차별점: 베오베는 일반 유저 이슈·밈 집중지표.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractKoreanNouns } from './youtube-kr-rss';

const URLS = [
    'https://www.todayhumor.co.kr/board/list.php?table=bestofbest',
    'https://www.todayhumor.co.kr/board/list.php?table=best',
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
                    'Referer': 'https://www.todayhumor.co.kr/',
                },
                validateStatus: s => s < 500,
            });
            if (typeof res.data !== 'string') continue;
            const $ = cheerio.load(res.data);
            const selectors = [
                'td.subject a',
                '.list_table .subject a',
                'a[href*="view.php"]',
            ];
            for (const sel of selectors) {
                $(sel).each((_, el) => {
                    const t = $(el).text().trim().replace(/\s+/g, ' ');
                    if (t && t.length >= 4 && t.length <= 80) titles.push(t);
                });
            }
        } catch (err: any) {
            console.warn('[todayhumor] 수집 실패:', err?.message);
        }
    }
    return titles;
}

export async function getTodayhumorKeywords(): Promise<Array<{ keyword: string; frequency: number }>> {
    const titles = await fetchTitles();
    if (titles.length === 0) return [];
    const freq = extractKoreanNouns(titles);
    return Array.from(freq.entries())
        .filter(([_, c]) => c >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 100)
        .map(([keyword, frequency]) => ({ keyword, frequency }));
}
