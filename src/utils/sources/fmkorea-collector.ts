/**
 * 에펨코리아 인기글 — 게임/스포츠/이슈 선행지표
 *
 * 합법성: 공개 게시글 제목만.
 * 차별점: 남초 커뮤니티 대표, 스포츠/게임/IT 이슈 반영 빠름.
 * 주의: 데스크톱(www.fmkorea.com) 은 CDN 430 차단 → 모바일(m.fmkorea.com) 사용.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractKoreanNouns } from './youtube-kr-rss';

const URLS = [
    'https://m.fmkorea.com/best',
    'https://m.fmkorea.com/hotdeal',
];
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

async function fetchTitles(): Promise<string[]> {
    const titles: string[] = [];
    for (const u of URLS) {
        try {
            const res = await axios.get(u, {
                timeout: 10000,
                headers: {
                    'User-Agent': MOBILE_UA,
                    'Accept-Language': 'ko-KR,ko;q=0.9',
                    'Accept': 'text/html,application/xhtml+xml',
                    'Referer': 'https://m.fmkorea.com/',
                },
                validateStatus: s => s < 500,
            });
            if (typeof res.data !== 'string') continue;
            const $ = cheerio.load(res.data);

            // 모바일 best: .read_more 또는 hotdeal_var 클래스
            $('.read_more, [class*="hotdeal_var"]').each((_, el) => {
                const $el = $(el);
                let text = $el.text().trim().replace(/\s+/g, ' ');
                // 말미 [228] 같은 댓글 카운트 제거
                text = text.replace(/\s*\[\d+\]\s*$/, '');
                if (text && text.length >= 4 && text.length <= 80) titles.push(text);
            });

            // Fallback: 직접 a 태그
            if (titles.length < 5) {
                $('a').each((_, el) => {
                    const text = $(el).text().trim().replace(/\s+/g, ' ').replace(/\s*\[\d+\]\s*$/, '');
                    const href = $(el).attr('href') || '';
                    if (href.includes('document_srl=') && text.length >= 4 && text.length <= 80) {
                        titles.push(text);
                    }
                });
            }
        } catch (err: any) {
            console.warn('[fmkorea] 수집 실패:', err?.message);
        }
    }
    return titles;
}

export async function getFmkoreaKeywords(): Promise<Array<{ keyword: string; frequency: number }>> {
    const titles = await fetchTitles();
    if (titles.length === 0) return [];
    const freq = extractKoreanNouns(titles);
    return Array.from(freq.entries())
        .filter(([_, c]) => c >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 100)
        .map(([keyword, frequency]) => ({ keyword, frequency }));
}
