/**
 * 네이트판 — 10~30대 여초 커뮤니티, 일상/연애/이슈
 *
 * 합법성: 공개 제목만.
 * 차별점: 이토랜드 대체, 광범위 일상·이슈 바이럴 키워드 확보.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractKoreanNouns } from './youtube-kr-rss';

const URLS = [
    'https://pann.nate.com/',
    'https://pann.nate.com/talk/ranking',
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
                    'Referer': 'https://pann.nate.com/',
                },
                validateStatus: s => s < 500,
            });
            if (typeof res.data !== 'string') continue;
            const $ = cheerio.load(res.data);
            const NAV_WORDS = ['내가 쓴 글', '랭킹', '보기', '검색', '로그인', '공지'];
            $('a').each((_, el) => {
                const t = $(el).text().trim().replace(/\s+/g, ' ');
                if (!t || t.length < 6 || t.length > 80) return;
                if (NAV_WORDS.some(w => t.includes(w))) return;
                const href = $(el).attr('href') || '';
                // 실제 포스트로 가는 링크만
                if (href.includes('talk/') || href.includes('view.html') || href.includes('report/')) {
                    titles.push(t);
                }
            });
        } catch (err: any) {
            console.warn('[natepann] 수집 실패:', err?.message);
        }
    }
    return titles;
}

export async function getNatepannKeywords(): Promise<Array<{ keyword: string; frequency: number }>> {
    const titles = await fetchTitles();
    if (titles.length === 0) return [];
    const freq = extractKoreanNouns(titles);
    return Array.from(freq.entries())
        .filter(([_, c]) => c >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 100)
        .map(([keyword, frequency]) => ({ keyword, frequency }));
}
