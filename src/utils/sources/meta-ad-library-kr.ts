/**
 * Meta Ad Library KR — 한국 광고 카피에서 키워드 역추출
 *
 * 합법성: facebook.com/ads/library 공개 페이지. 로그인 불필요.
 *         API는 한국 상업광고 미지원이라 UI 스크래핑이 유일한 경로.
 *
 * 차별점: 광고주가 돈 쓰는 키워드 = 수익성 검증 완료.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractKoreanNouns } from './youtube-kr-rss';

export interface AdLibraryEntry {
    advertiser: string;
    body: string;
    pageId?: string;
    startDate?: string;
}

const SEARCH_URL = 'https://www.facebook.com/ads/library/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

/**
 * 키워드로 한국 활성 광고 검색 (UI HTML 파싱)
 *
 * 주의: 페이스북은 동적 렌더링이라 단순 HTML 파싱은 한계가 있음.
 * 본격 운영 시 stealth-browser를 사용해야 하지만 1차 구현은 정적 파싱.
 */
export async function searchAdLibraryKR(keyword: string): Promise<AdLibraryEntry[]> {
    const params = new URLSearchParams({
        active_status: 'active',
        ad_type: 'all',
        country: 'KR',
        q: keyword,
        sort_data: JSON.stringify({ direction: 'desc', mode: 'relevancy_monthly_grouped' }),
        search_type: 'keyword_unordered',
        media_type: 'all',
    });

    const url = `${SEARCH_URL}?${params.toString()}`;

    try {
        const res = await axios.get(url, {
            timeout: 20000,
            headers: {
                'User-Agent': UA,
                'Accept': 'text/html',
                'Accept-Language': 'ko-KR,ko;q=0.9',
            },
        });

        return parseAdLibraryHtml(res.data);
    } catch (err: any) {
        console.error('[meta-ad-library] 검색 실패:', err.message);
        return [];
    }
}

function parseAdLibraryHtml(html: string): AdLibraryEntry[] {
    const $ = cheerio.load(html);
    const entries: AdLibraryEntry[] = [];

    const scriptContent = $('script').map((_, el) => $(el).html() || '').get().join('\n');
    const bodyMatches = scriptContent.match(/"body":\{"text":"([^"]{20,500})"/g) || [];
    const advertiserMatches = scriptContent.match(/"page_name":"([^"]+)"/g) || [];

    const bodies = bodyMatches.map(m => m.match(/"text":"([^"]+)"/)?.[1] || '').filter(Boolean);
    const advertisers = advertiserMatches.map(m => m.match(/"page_name":"([^"]+)"/)?.[1] || '').filter(Boolean);

    for (let i = 0; i < Math.min(bodies.length, 100); i++) {
        entries.push({
            advertiser: advertisers[i] || 'Unknown',
            body: bodies[i].replace(/\\u([0-9a-f]{4})/gi, (_, code) => String.fromCharCode(parseInt(code, 16))),
        });
    }

    return entries;
}

/**
 * 광고 카피에서 고빈도 명사 추출 = 수익성 검증 키워드
 */
export async function extractAdKeywordsFromCategory(seedKeyword: string): Promise<Array<{ keyword: string; frequency: number; advertisers: number }>> {
    const ads = await searchAdLibraryKR(seedKeyword);
    if (ads.length === 0) return [];

    const bodies = ads.map(a => a.body);
    const freq = extractKoreanNouns(bodies);

    const advertiserMap = new Map<string, Set<string>>();
    for (const ad of ads) {
        const nouns = extractKoreanNouns([ad.body]);
        for (const noun of nouns.keys()) {
            if (!advertiserMap.has(noun)) advertiserMap.set(noun, new Set());
            advertiserMap.get(noun)!.add(ad.advertiser);
        }
    }

    return Array.from(freq.entries())
        .filter(([_, count]) => count >= 3)
        .map(([keyword, frequency]) => ({
            keyword,
            frequency,
            advertisers: advertiserMap.get(keyword)?.size || 0,
        }))
        .sort((a, b) => b.advertisers - a.advertisers || b.frequency - a.frequency)
        .slice(0, 50);
}
