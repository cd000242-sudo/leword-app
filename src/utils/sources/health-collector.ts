/**
 * 건강/의료 이슈 수집 — 병원 블로그 최상위 CPC 카테고리
 *
 * 합법성: 공공 뉴스 RSS.
 * 차별점: 건강·의료 키워드는 블로그 CPC·CPM 최상위. 희귀질환/신약 선점 가치 큼.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractKoreanNouns } from './youtube-kr-rss';

const URLS = [
    'https://www.yna.co.kr/rss/health.xml',
    'https://www.yna.co.kr/rss/medic.xml',
    'https://www.docdocdoc.co.kr/rss/allArticle.xml',  // 청년의사 (의료 전문지)
];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

async function fetchTitles(): Promise<string[]> {
    const titles: string[] = [];
    for (const url of URLS) {
        try {
            const res = await axios.get(url, {
                timeout: 10000,
                headers: { 'User-Agent': UA, 'Accept': 'application/rss+xml,text/xml,*/*', 'Accept-Language': 'ko-KR,ko;q=0.9' },
                validateStatus: s => s < 500,
            });
            if (typeof res.data !== 'string') continue;
            const $ = cheerio.load(res.data, { xmlMode: true });
            $('item > title').each((_, el) => {
                const t = $(el).text().trim().replace(/\s+/g, ' ');
                if (t && t.length >= 6 && t.length <= 100) titles.push(t);
            });
        } catch (err: any) {
            console.warn(`[health] RSS 실패 (${url}):`, err?.message);
        }
    }
    return titles;
}

export async function getHealthKeywords(): Promise<Array<{ keyword: string; frequency: number }>> {
    const titles = await fetchTitles();
    if (titles.length === 0) return [];
    const freq = extractKoreanNouns(titles);
    const BOOST = ['건강검진', '영양제', '다이어트', '비타민', '당뇨', '고혈압', '갱년기', '감기', '독감', '우울증', '치매', '탈모'];
    for (const t of titles) {
        for (const kw of BOOST) {
            if (t.includes(kw)) freq.set(kw, (freq.get(kw) || 0) + 1);
        }
    }
    return Array.from(freq.entries())
        .filter(([kw, _]) => kw.length >= 2 && kw.length <= 15)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 120)
        .map(([keyword, frequency]) => ({ keyword, frequency }));
}
