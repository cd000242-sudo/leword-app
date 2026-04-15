/**
 * 보배드림 베스트 — 자동차 카테고리 키워드 선행지표
 *
 * 합법성: 공개 게시글 제목, robots.txt 부분 허용.
 * 차별점: 신차 출시 2~4일 선행, 자동차 블로거 고CPC 카테고리.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractKoreanNouns } from './youtube-kr-rss';

export interface BobaePost {
    title: string;
    url: string;
    commentCount?: number;
    viewCount?: number;
    category?: string;
}

const BEST_URL = 'https://www.bobaedream.co.kr/list?code=best';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

export async function fetchBobaeBest(): Promise<BobaePost[]> {
    try {
        const res = await axios.get(BEST_URL, {
            timeout: 15000,
            headers: {
                'User-Agent': UA,
                'Accept-Language': 'ko-KR,ko;q=0.9',
            },
        });

        const $ = cheerio.load(res.data);
        const posts: BobaePost[] = [];

        $('table.basictable tbody tr, .post-list .row').each((_, el) => {
            const $row = $(el);
            const $titleA = $row.find('a.bsubject, a.title').first();
            const title = $titleA.text().trim().replace(/\s+/g, ' ').replace(/^\[[^\]]*\]\s*/, '');
            const href = $titleA.attr('href') || '';

            if (title && title.length > 3 && href) {
                posts.push({
                    title,
                    url: href.startsWith('http') ? href : `https://www.bobaedream.co.kr${href}`,
                });
            }
        });

        return posts;
    } catch (err: any) {
        console.error('[bobaedream] 베스트 수집 실패:', err.message);
        return [];
    }
}

const CAR_BRANDS = ['현대', '기아', '제네시스', 'BMW', '벤츠', '아우디', '폭스바겐', '테슬라', '포르쉐', '볼보', '도요타', '렉서스', '혼다', '쉐보레', '르노', '쌍용', '미니', '재규어', '랜드로버', '페라리', '람보르기니'];

/**
 * 보배 베스트 제목에서 차종/브랜드 키워드 추출
 */
export async function getBobaeKeywords(): Promise<Array<{ keyword: string; frequency: number; brand?: string }>> {
    const posts = await fetchBobaeBest();
    const titles = posts.map(p => p.title);
    const freq = extractKoreanNouns(titles);

    const result = Array.from(freq.entries())
        .filter(([_, count]) => count >= 2)
        .map(([keyword, frequency]) => {
            const brand = CAR_BRANDS.find(b => titles.some(t => t.includes(b) && t.includes(keyword)));
            return { keyword, frequency, brand };
        })
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 100);

    return result;
}
