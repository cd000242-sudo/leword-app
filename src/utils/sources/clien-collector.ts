/**
 * 클리앙 새로운 소식 — IT/가전/생활 트렌드
 *
 * 합법성: 공개 제목만.
 * 차별점: IT 기기/가전/생활정보 집단지성 수준 높음.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractKoreanNouns } from './youtube-kr-rss';

const URLS = [
    'https://www.clien.net/service/board/park',      // 새로운 소식
    'https://www.clien.net/service/recommend',        // 추천글
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
                    'Referer': 'https://www.clien.net/',
                },
                validateStatus: s => s < 500,
            });
            if (typeof res.data !== 'string') continue;
            const $ = cheerio.load(res.data);
            const selectors = [
                'a.list_subject',
                '.subject_fixed',
                '.list_item .list_title a',
                'a[href*="/service/board/"]',
            ];
            for (const sel of selectors) {
                $(sel).each((_, el) => {
                    const t = $(el).text().trim().replace(/\s+/g, ' ');
                    if (t && t.length >= 4 && t.length <= 80) titles.push(t);
                });
            }
        } catch (err: any) {
            console.warn('[clien] 수집 실패:', err?.message);
        }
    }
    return titles;
}

export async function getClienKeywords(): Promise<Array<{ keyword: string; frequency: number }>> {
    const titles = await fetchTitles();
    if (titles.length === 0) return [];
    const freq = extractKoreanNouns(titles);
    return Array.from(freq.entries())
        .filter(([_, c]) => c >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 100)
        .map(([keyword, frequency]) => ({ keyword, frequency }));
}
