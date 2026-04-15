/**
 * Google "People Also Ask" (PAA) + 연관 검색어 스크래퍼
 *
 * 합법성: 공개 검색 결과 페이지 파싱. rate limit 준수 필수.
 * 차별점: PAA는 사용자 실제 질문 = 블로그 글 제목으로 직결되는 롱테일 보고.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

export interface PaaResult {
    questions: string[];
    relatedSearches: string[];
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function fetchGooglePaa(keyword: string, hl: string = 'ko', gl: string = 'kr'): Promise<PaaResult> {
    const url = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&hl=${hl}&gl=${gl}`;

    try {
        const res = await axios.get(url, {
            timeout: 15000,
            headers: {
                'User-Agent': UA,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'ko-KR,ko;q=0.9',
            },
        });

        return parseGoogleSerp(res.data);
    } catch (err: any) {
        console.error('[google-paa] 호출 실패:', err.message);
        return { questions: [], relatedSearches: [] };
    }
}

function parseGoogleSerp(html: string): PaaResult {
    const $ = cheerio.load(html);

    const questions: string[] = [];
    const seen = new Set<string>();

    $('div[jsname="Cpkphb"], div.related-question-pair, div[data-q]').each((_, el) => {
        const q = $(el).attr('data-q') || $(el).find('span').first().text().trim();
        if (q && q.length > 5 && !seen.has(q)) {
            seen.add(q);
            questions.push(q);
        }
    });

    $('div.iDjcJe, div.JolIg, div.s75CSd').each((_, el) => {
        const q = $(el).text().trim();
        if (q && q.length > 5 && q.length < 120 && !seen.has(q)) {
            seen.add(q);
            questions.push(q);
        }
    });

    const relatedSearches: string[] = [];
    const relSeen = new Set<string>();

    $('a').each((_, el) => {
        const href = $(el).attr('href') || '';
        if (!href.includes('/search?')) return;
        const text = $(el).text().trim();
        if (!text || text.length > 60 || text.length < 2) return;
        if (relSeen.has(text)) return;
        if (/^https?:/.test(text)) return;
        relSeen.add(text);
        if (relatedSearches.length < 20) relatedSearches.push(text);
    });

    return {
        questions: questions.slice(0, 30),
        relatedSearches,
    };
}

/**
 * 키워드 배치 PAA 수집 (rate limit 보호)
 */
export async function batchPaa(keywords: string[]): Promise<Map<string, PaaResult>> {
    const results = new Map<string, PaaResult>();
    for (const kw of keywords) {
        const r = await fetchGooglePaa(kw);
        results.set(kw, r);
        await new Promise(res => setTimeout(res, 3000 + Math.random() * 2000));
    }
    return results;
}
