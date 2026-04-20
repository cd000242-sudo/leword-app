/**
 * 네이버 뉴스 랭킹 — 실시간 많이 본 뉴스
 *
 * 합법성: 공개 웹페이지 제목만.
 * 차별점: 기자 작성 제목 = 검색 의도와 직결, 실시간 이슈 선행.
 *
 * 데스크톱(news.naver.com) 은 EUC-KR 응답으로 인코딩 깨짐 → 모바일(m.news.naver.com) 사용.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractKoreanNouns } from './youtube-kr-rss';

const URLS = [
    'https://m.news.naver.com/rankingList',
];
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

async function fetchTitles(): Promise<string[]> {
    const titles: string[] = [];
    for (const url of URLS) {
        try {
            const res = await axios.get(url, {
                timeout: 10000,
                headers: {
                    'User-Agent': MOBILE_UA,
                    'Accept-Language': 'ko-KR,ko;q=0.9',
                    'Accept': 'text/html,application/xhtml+xml',
                    'Referer': 'https://m.news.naver.com/',
                },
                validateStatus: s => s < 500,
            });
            if (typeof res.data !== 'string') continue;
            const $ = cheerio.load(res.data);
            // 순위 뉴스 제목 — a 태그 텍스트가 "1 제목 시간" 형태
            $('a').each((_, el) => {
                const $el = $(el);
                const cls = $el.attr('class') || '';
                // 상단 네비게이션 링크 제외 (Nitem_link 등)
                if (cls.includes('Nitem') || cls.includes('head') || cls.includes('gnb')) return;
                let t = $el.text().trim().replace(/\s+/g, ' ');
                // "1 제목 2시간전" 형태 → 앞 숫자 + 뒤 시간 표기 제거
                t = t.replace(/^\d{1,3}\s+/, '');
                t = t.replace(/\s+\d{1,2}(시간|분|초|일)\s*전\s*$/, '');
                t = t.replace(/\s+동영상\s*$/, '');
                if (t && t.length >= 8 && t.length <= 100) titles.push(t);
            });
        } catch (err: any) {
            console.warn('[naver-news] 수집 실패:', err?.message);
        }
    }
    return titles;
}

export async function getNaverNewsRankingKeywords(): Promise<Array<{ keyword: string; frequency: number }>> {
    const titles = await fetchTitles();
    if (titles.length === 0) return [];
    const freq = extractKoreanNouns(titles);
    return Array.from(freq.entries())
        .filter(([_, c]) => c >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 120)
        .map(([keyword, frequency]) => ({ keyword, frequency }));
}
