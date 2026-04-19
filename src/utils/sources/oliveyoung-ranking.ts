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
export async function fetchOliveyoungBest(dispCatNo: string = ''): Promise<OliveyoungProduct[]> {
    try {
        const params = new URLSearchParams();
        if (dispCatNo) params.append('dispCatNo', dispCatNo);
        params.append('pageIdx', '1');
        params.append('rowsPerPage', '100');

        const url = `${BEST_URL}?${params.toString()}`;

        // 1차: curl 우회 (올리브영 JA3 차단 회피)
        let html = '';
        try {
            html = await fetchViaCurl(url, 20000);
        } catch (curlErr: any) {
            // 2차 폴백: axios (curl 미설치 환경 대응 — 대부분 403 예상)
            console.warn('[oliveyoung] curl 실패, axios 폴백:', curlErr.message);
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
            html = String(res.data || '');
        }

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
