/**
 * 맘카페/육아 커뮤니티 — 육아·유아 블로그 고CPC 카테고리
 *
 * 합법성: 공개 RSS.
 * 차별점: 맘 유저 실제 고민/제품 관심사 반영. 육아용품 블로그 수익성 최상위.
 * 전략: 네이버 카페는 로그인 필요 → 육아 전문지 RSS 사용.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractKoreanNouns } from './youtube-kr-rss';

const URLS = [
    'https://www.babytimes.co.kr/rss/allArticle.xml',   // 베이비타임즈 전체
    'http://www.babytimes.co.kr/rss/S1N1.xml',          // 육아 섹션
];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

async function fetchTitles(): Promise<string[]> {
    const titles: string[] = [];
    for (const url of URLS) {
        try {
            const res = await axios.get(url, {
                timeout: 10000,
                headers: { 'User-Agent': UA, 'Accept': 'application/rss+xml,text/xml,*/*' },
                validateStatus: s => s < 500,
            });
            if (typeof res.data !== 'string') continue;
            const $ = cheerio.load(res.data, { xmlMode: true });
            $('item > title').each((_, el) => {
                const t = $(el).text().trim().replace(/\s+/g, ' ');
                if (t && t.length >= 6 && t.length <= 100) titles.push(t);
            });
        } catch (err: any) {
            console.warn(`[mom-cafe] ${url} 실패:`, err?.message);
        }
    }
    return titles;
}

export async function getMomCafeKeywords(): Promise<Array<{ keyword: string; frequency: number }>> {
    const titles = await fetchTitles();
    if (titles.length === 0) return [];
    const freq = extractKoreanNouns(titles);
    const BOOST = ['아기', '신생아', '유아', '이유식', '어린이집', '유치원', '초등', '출산', '임산부', '수유', '분유', '육아', '부모', '아이'];
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
