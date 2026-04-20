/**
 * 디시인사이드 실시간 베스트 — 광범위 이슈/밈/연예 선행지표
 *
 * 합법성: 공개 게시글 제목만 수집.
 * 차별점: 한국 최대 규모 커뮤니티, 밈/신조어 최전선, 카테고리 광범위.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractKoreanNouns } from './youtube-kr-rss';

const URLS = [
    'https://gall.dcinside.com/board/lists/?id=dcbest',
    'https://www.dcinside.com/',
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
                    'Accept': 'text/html,application/xhtml+xml',
                    'Accept-Language': 'ko-KR,ko;q=0.9',
                    'Referer': 'https://www.dcinside.com/',
                },
                validateStatus: s => s < 500,
            });
            if (typeof res.data !== 'string') continue;
            const $ = cheerio.load(res.data);
            // 최신 gall/실베 구조가 자주 바뀌므로 후보 셀렉터 다중 폴백
            const selectors = [
                'a.issue-link',           // 실베 이슈 링크
                'td.gall_tit a',          // 갤러리 제목
                'a.tit',                  // 일반 제목
                '.dcbest_list a',         // dcbest 리스트
                'a[href*="/board/view"]', // view 링크 공통
            ];
            for (const sel of selectors) {
                $(sel).each((_, el) => {
                    const t = $(el).text().trim().replace(/\s+/g, ' ');
                    if (t && t.length >= 4 && t.length <= 80) titles.push(t);
                });
            }
        } catch (err: any) {
            console.warn(`[dcinside] 수집 실패 (${url}):`, err?.message);
        }
    }
    return titles;
}

export async function getDcinsideKeywords(): Promise<Array<{ keyword: string; frequency: number }>> {
    const titles = await fetchTitles();
    if (titles.length === 0) return [];
    const freq = extractKoreanNouns(titles);
    return Array.from(freq.entries())
        .filter(([_, c]) => c >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 100)
        .map(([keyword, frequency]) => ({ keyword, frequency }));
}
