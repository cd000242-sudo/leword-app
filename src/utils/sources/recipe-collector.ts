/**
 * 요리/레시피 트렌드 — 만개의레시피 + 네이버 레시피
 *
 * 합법성: 공개 레시피 제목/태그.
 * 차별점: 음식/요리 블로그 수익성. 계절 레시피·신 식재료 트렌드 반영.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractKoreanNouns } from './youtube-kr-rss';

const URLS = [
    'https://www.10000recipe.com/ranking/home_new.html',
    'https://www.10000recipe.com/recipe/list.html?order=reco',
];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

async function fetchTitles(): Promise<string[]> {
    const titles: string[] = [];
    for (const url of URLS) {
        try {
            const res = await axios.get(url, {
                timeout: 10000,
                headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' },
                validateStatus: s => s < 500,
            });
            if (typeof res.data !== 'string') continue;
            const $ = cheerio.load(res.data);
            const selectors = [
                '.common_sp_caption_tit',      // 레시피 카드 제목
                '.common_sp_link_tit',
                'h4.ellipsis_title',
                'a[href*="/recipe/"] .common_sp_caption_tit',
            ];
            for (const sel of selectors) {
                $(sel).each((_, el) => {
                    const t = $(el).text().trim().replace(/\s+/g, ' ');
                    if (t && t.length >= 3 && t.length <= 60) titles.push(t);
                });
            }
        } catch (err: any) {
            console.warn('[recipe] 수집 실패:', err?.message);
        }
    }
    return titles;
}

export async function getRecipeKeywords(): Promise<Array<{ keyword: string; frequency: number }>> {
    const titles = await fetchTitles();
    if (titles.length === 0) return [];
    const freq = extractKoreanNouns(titles);
    const BOOST = ['레시피', '만들기', '요리', '밑반찬', '도시락', '다이어트', '반찬', '간식', '디저트'];
    for (const t of titles) {
        for (const kw of BOOST) {
            if (t.includes(kw)) freq.set(kw, (freq.get(kw) || 0) + 1);
        }
    }
    return Array.from(freq.entries())
        .filter(([kw, _]) => kw.length >= 2 && kw.length <= 15)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 100)
        .map(([keyword, frequency]) => ({ keyword, frequency }));
}
