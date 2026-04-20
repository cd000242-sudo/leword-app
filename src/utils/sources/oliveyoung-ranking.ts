/**
 * 올리브영 베스트 랭킹 — 뷰티 카테고리 키워드 시드
 *
 * 합법성: 공개 베스트 페이지, 상품명은 사실 정보.
 * 차별점: 월 검색 675만, 제품명=롱테일 시드 직결, 뷰티 블루오션 1순위.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { spawn } from 'child_process';

export interface OliveyoungProduct {
    rank: number;
    productName: string;
    brand: string;
    productNo: string;
    price?: number;
    salePrice?: number;
    reviewCount?: number;
}

const BEST_URL = 'https://www.oliveyoung.co.kr/store/main/getBestList.do';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

/**
 * 올리브영은 Node TLS 지문(JA3)을 감지하여 axios 전부 403 차단.
 * 시스템 curl로 우회 (Windows 10+, macOS 12+, Linux 대부분 기본 탑재).
 */
function fetchViaCurl(url: string, timeoutMs = 20000): Promise<string> {
    return new Promise((resolve, reject) => {
        const args = [
            '-s', '-L', '--compressed',
            '--max-time', String(Math.ceil(timeoutMs / 1000)),
            '-H', `User-Agent: ${UA}`,
            '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            '-H', 'Accept-Language: ko-KR,ko;q=0.9,en;q=0.7',
            '-H', 'Referer: https://www.oliveyoung.co.kr/',
            url,
        ];
        const p = spawn('curl', args);
        let out = '';
        let err = '';
        const killTimer = setTimeout(() => p.kill('SIGKILL'), timeoutMs + 2000);
        p.stdout.on('data', d => { out += d; });
        p.stderr.on('data', d => { err += d; });
        p.on('error', e => { clearTimeout(killTimer); reject(e); });
        p.on('close', code => {
            clearTimeout(killTimer);
            if (code === 0 && out.length > 500) resolve(out);
            else reject(new Error(`curl exit=${code}, len=${out.length}, stderr=${err.slice(0, 200)}`));
        });
    });
}

/**
 * 카테고리 코드:
 *   '' = 전체
 *   '10000010001' = 스킨케어, '10000010002' = 마스크팩 등
 */
const MIN_VALID_HTML_SIZE = 100_000;   // 50KB 수준 응답은 올리브영 봇 차단 fallback 페이지
const MAX_FETCH_RETRIES = 3;

async function fetchOliveyoungHtml(url: string): Promise<string> {
    let lastErr = '';
    for (let attempt = 1; attempt <= MAX_FETCH_RETRIES; attempt++) {
        try {
            const html = await fetchViaCurl(url, 20000);
            if (html.length >= MIN_VALID_HTML_SIZE) return html;
            lastErr = `attempt ${attempt}: html=${html.length}b (too small, likely bot-block)`;
        } catch (e: any) {
            lastErr = `attempt ${attempt}: ${e.message}`;
        }
        // backoff
        if (attempt < MAX_FETCH_RETRIES) await new Promise(r => setTimeout(r, 1000 * attempt));
    }
    // curl 전부 실패/차단 → axios 마지막 시도
    try {
        const res = await axios.get(url, {
            timeout: 20000,
            headers: {
                'User-Agent': UA,
                'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
                'Accept-Language': 'ko-KR,ko;q=0.9',
                'Accept-Encoding': 'gzip, deflate',
                'Referer': 'https://www.oliveyoung.co.kr/',
            },
            maxRedirects: 5,
            validateStatus: (s) => s >= 200 && s < 400,
        });
        const html = String(res.data || '');
        if (html.length >= MIN_VALID_HTML_SIZE) return html;
    } catch {}
    throw new Error(`올리브영 fetch 실패: ${lastErr}`);
}

export async function fetchOliveyoungBest(dispCatNo: string = ''): Promise<OliveyoungProduct[]> {
    try {
        const params = new URLSearchParams();
        if (dispCatNo) params.append('dispCatNo', dispCatNo);
        params.append('pageIdx', '1');
        params.append('rowsPerPage', '100');

        const url = `${BEST_URL}?${params.toString()}`;
        const html = await fetchOliveyoungHtml(url);

        const $ = cheerio.load(html);
        const products: OliveyoungProduct[] = [];

        $('ul.cate_prd_list li, .prd_info').each((idx, el) => {
            const $el = $(el);
            const brand = $el.find('.tx_brand').text().trim();
            const name = $el.find('.tx_name').text().trim().replace(/\s+/g, ' ');
            const productNo = $el.find('a').first().attr('data-ref-goodsno') || '';
            const priceText = $el.find('.tx_cur .tx_num').first().text().replace(/[^\d]/g, '');
            const reviewText = $el.find('.review_count, .num').first().text().replace(/[^\d]/g, '');

            if (name && name.length > 2) {
                products.push({
                    rank: idx + 1,
                    productName: name,
                    brand,
                    productNo,
                    price: priceText ? Number(priceText) : undefined,
                    reviewCount: reviewText ? Number(reviewText) : undefined,
                });
            }
        });

        return products;
    } catch (err: any) {
        console.error('[oliveyoung] 베스트 수집 실패:', err.message);
        return [];
    }
}

/**
 * 올리브영 여러 카테고리 병렬 fetch — 차단 시 일부만 성공해도 다량 확보
 *  대분류 dispCatNo (검증된 것만):
 *   10000010001 스킨케어, 10000010010 마스크팩, 10000010009 클렌징
 *   10000020003 선케어, 10000020004 바디케어, 10000020005 헤어케어
 *   10000030001 메이크업(베이스), 10000030002 메이크업(립/아이)
 */
const CATEGORY_CODES: Array<{ code: string; label: string }> = [
    { code: '', label: '전체' },
    { code: '10000010001', label: '스킨케어' },
    { code: '10000010010', label: '마스크팩' },
    { code: '10000010009', label: '클렌징' },
    { code: '10000020003', label: '선케어' },
    { code: '10000020004', label: '바디케어' },
    { code: '10000020005', label: '헤어케어' },
    { code: '10000030001', label: '메이크업-베이스' },
    { code: '10000030002', label: '메이크업-색조' },
];

export async function fetchOliveyoungMultiCategory(): Promise<OliveyoungProduct[]> {
    const all: OliveyoungProduct[] = [];
    const seen = new Set<string>();
    for (const { code, label } of CATEGORY_CODES) {
        try {
            const products = await fetchOliveyoungBest(code);
            if (products.length > 0) {
                console.log(`[oliveyoung] ${label}(${code || '전체'}): ${products.length}개`);
                for (const p of products) {
                    if (p.productName && !seen.has(p.productName)) {
                        seen.add(p.productName);
                        all.push(p);
                    }
                }
            }
            await new Promise(r => setTimeout(r, 800));   // rate limit 보호
        } catch (err: any) {
            console.warn(`[oliveyoung] ${label} 실패:`, err?.message);
        }
    }
    return all;
}

/**
 * 상품명에서 키워드 시드 추출 (브랜드 + 제품 핵심 키워드)
 */
export function extractOliveyoungKeywords(products: OliveyoungProduct[]): Array<{ keyword: string; suggestions: string[] }> {
    const result: Array<{ keyword: string; suggestions: string[] }> = [];

    for (const p of products) {
        const cleanName = p.productName
            .replace(/\[[^\]]+\]/g, '')
            .replace(/\([^)]+\)/g, '')
            .replace(/\d+ml|\d+g|\d+매|\d+개|\d+호/g, '')
            .trim();

        const baseKeyword = cleanName.split(/\s+/).slice(0, 4).join(' ');
        const suggestions = [
            `${baseKeyword} 후기`,
            `${baseKeyword} 추천`,
            `${baseKeyword} 성분`,
            `${baseKeyword} 사용법`,
            `${p.brand} ${baseKeyword.split(/\s+/).slice(0, 2).join(' ')} 비교`,
        ];

        result.push({ keyword: baseKeyword, suggestions });
    }

    return result;
}
