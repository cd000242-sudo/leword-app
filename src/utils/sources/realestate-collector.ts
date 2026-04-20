/**
 * 부동산 이슈 수집 — 청약/분양/재건축/대출 트렌드
 *
 * 합법성: 공공 뉴스 RSS.
 * 차별점: 부동산 블로그 CPC 최상위. 정책 변동에 따라 검색량 폭증 패턴.
 *
 * 전략: 다각 RSS 소스 (yna economy + mbn economy) + 제목에서 부동산 키워드만 선별 부스트.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractKoreanNouns } from './youtube-kr-rss';

const URLS = [
    'https://www.yna.co.kr/rss/economy.xml',
    'https://www.mbn.co.kr/rss/economy/?S=110',
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
            console.warn('[realestate] 수집 실패:', err?.message);
        }
    }
    return titles;
}

const REALESTATE_RE = /(부동산|청약|분양|전세|월세|매매|재건축|재개발|아파트|주택|오피스텔|빌라|LTV|DSR|대출|주담대|금리)/;

export async function getRealestateKeywords(): Promise<Array<{ keyword: string; frequency: number }>> {
    const titles = await fetchTitles();
    if (titles.length === 0) return [];

    // 부동산 관련 제목만 필터
    const relevant = titles.filter(t => REALESTATE_RE.test(t));
    const pool = relevant.length >= 10 ? relevant : titles;   // 너무 적으면 전체 사용

    const freq = extractKoreanNouns(pool);
    const BOOST = ['청약', '분양', '전세', '월세', '매매', '재건축', '재개발', '아파트', '주택', '대출', 'LTV', 'DSR', '주담대', '금리'];
    for (const t of pool) {
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
