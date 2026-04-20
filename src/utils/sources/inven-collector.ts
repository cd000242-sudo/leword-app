/**
 * 게임 뉴스 통합 수집 — 디스이즈게임 + 게임톡
 * (구 inven-collector: 인벤은 bot 감지로 요청마다 응답 달라 불안정 → 대체)
 *
 * 합법성: 공개 기사 제목만.
 * 차별점: 게임 신작/업데이트/업계 이슈 커버, 게임 블로거용 고CPC.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractKoreanNouns } from './youtube-kr-rss';

const URLS = [
    'https://www.thisisgame.com/',
    'https://www.gametoc.co.kr/',
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
                    'Referer': url,
                },
                validateStatus: s => s < 500,
            });
            if (typeof res.data !== 'string') continue;
            const $ = cheerio.load(res.data);
            $('a').each((_, el) => {
                const t = $(el).text().trim().replace(/\s+/g, ' ');
                const href = $(el).attr('href') || '';
                if (t.length < 10 || t.length > 80) return;
                // 기사·뉴스 형태의 링크만
                if (href.includes('article') || href.includes('news_') ||
                    href.includes('board_view') || href.includes('/news/') ||
                    href.includes('view.php') || href.includes('articleView')) {
                    titles.push(t);
                }
            });
        } catch (err: any) {
            console.warn('[game-news] 수집 실패:', err?.message);
        }
    }
    return titles;
}

// 함수명은 bootstrap과 일치 유지 (getInvenKeywords)
export async function getInvenKeywords(): Promise<Array<{ keyword: string; frequency: number }>> {
    const titles = await fetchTitles();
    if (titles.length === 0) return [];
    const freq = extractKoreanNouns(titles);
    return Array.from(freq.entries())
        .filter(([kw, _]) => kw.length >= 2 && kw.length <= 15)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 100)
        .map(([keyword, frequency]) => ({ keyword, frequency }));
}
