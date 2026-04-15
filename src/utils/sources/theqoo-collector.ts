/**
 * 더쿠 핫게시글 수집 — 여성·뷰티·아이돌·드라마 트렌드
 *
 * 합법성: 공개 게시글 제목만 수집, 작성자/개인정보 제외, rate limit 준수.
 * 차별점: 여성 소비 트렌드 2~4일 선행. 한국 키워드 도구 0% 활용.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractKoreanNouns } from './youtube-kr-rss';

export interface TheqooPost {
    title: string;
    url: string;
    category?: string;
    commentCount?: number;
    viewCount?: number;
}

const HOT_URL = 'https://theqoo.net/hot';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function fetchTheqooHot(): Promise<TheqooPost[]> {
    try {
        const res = await axios.get(HOT_URL, {
            timeout: 15000,
            headers: {
                'User-Agent': UA,
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'ko-KR,ko;q=0.9',
            },
        });

        const $ = cheerio.load(res.data);
        const posts: TheqooPost[] = [];

        $('table.bd_lst tbody tr').each((_, el) => {
            const $tr = $(el);
            const $titleA = $tr.find('td.title a').first();
            const title = $titleA.text().trim().replace(/\s+/g, ' ');
            const href = $titleA.attr('href') || '';
            const category = $tr.find('td.cate').text().trim();
            const comment = parseInt($tr.find('td.title .replyNum').text().trim() || '0', 10);
            const view = parseInt($tr.find('td.m_no').text().trim().replace(/,/g, '') || '0', 10);

            if (title && title.length > 3 && href) {
                posts.push({
                    title,
                    url: href.startsWith('http') ? href : `https://theqoo.net${href}`,
                    category: category || undefined,
                    commentCount: comment || undefined,
                    viewCount: view || undefined,
                });
            }
        });

        return posts;
    } catch (err: any) {
        console.error('[theqoo] 핫게시글 수집 실패:', err.message);
        return [];
    }
}

/**
 * 더쿠 인기글 제목에서 키워드 추출
 */
export async function getTheqooKeywords(): Promise<Array<{ keyword: string; frequency: number }>> {
    const posts = await fetchTheqooHot();
    const titles = posts.map(p => p.title);
    const freq = extractKoreanNouns(titles);

    return Array.from(freq.entries())
        .filter(([_, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 100)
        .map(([keyword, frequency]) => ({ keyword, frequency }));
}
