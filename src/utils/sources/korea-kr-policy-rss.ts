/**
 * 정책브리핑 korea.kr — 정부 정책/지원금 키워드
 *
 * 합법성: 공공 웹페이지.
 * 차별점: 정책/지원금 블로그 최고 CPC + 공백 카테고리 메움.
 *
 * RSS(www.korea.kr/rss/*.xml) 가 ECONNRESET 잦음 → HTML 목록 페이지 파싱.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractKoreanNouns } from './youtube-kr-rss';

const URLS = [
    'https://www.korea.kr/news/policyNewsList.do',
    'https://www.korea.kr/news/deptNewsList.do',
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
                    'Referer': 'https://www.korea.kr/',
                },
                validateStatus: s => s < 500,
            });
            if (typeof res.data !== 'string') continue;
            const $ = cheerio.load(res.data);
            // 다양한 셀렉터 폴백
            const selectors = [
                'a[href*="/news/policyNewsView.do"]',
                'a[href*="/news/deptNewsView.do"]',
                '.list_type1 .tit a',
                '.board-list .tit a',
                '.news-list a',
            ];
            for (const sel of selectors) {
                $(sel).each((_, el) => {
                    const t = $(el).text().trim().replace(/\s+/g, ' ');
                    if (t && t.length >= 6 && t.length <= 100) titles.push(t);
                });
            }
        } catch (err: any) {
            console.warn(`[korea.kr] 수집 실패 (${url}):`, err?.message);
        }
    }
    return titles;
}

export async function getPolicyKeywords(): Promise<Array<{ keyword: string; frequency: number }>> {
    const titles = await fetchTitles();
    if (titles.length === 0) return [];

    const freq = extractKoreanNouns(titles);
    // 정책 특화 패턴 가중치
    const BOOST = ['지원금', '보조금', '혜택', '지원', '신청', '정책', '지원사업', '급여', '수당', '바우처'];
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
