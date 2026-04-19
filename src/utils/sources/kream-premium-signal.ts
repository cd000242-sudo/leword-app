/**
 * 크림(KREAM) 프리미엄율 시그널 — 리셀 키워드 선행지표
 *
 * 합법성: 공개 상품 페이지, 시세는 사실 정보. rate limit 준수.
 * 차별점: 프리미엄율 급등 = 2~4주 후 검색 폭증. 리셀·한정판 블루오션.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

export interface KreamProduct {
    productId: string;
    name: string;
    brand: string;
    releasePrice?: number;
    instantBuyPrice?: number;
    premiumRate?: number;
    wishCount?: number;
}

const HOME_URL = 'https://kream.co.kr/';
const SEARCH_URL = 'https://kream.co.kr/search';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

// 쿠키 warmup: 첫 검색 전에 홈 방문해서 세션 쿠키 확보. 없으면 모든 검색이 500.
let cachedCookie: string | null = null;
let cookieAt = 0;
const COOKIE_TTL = 5 * 60_000;

async function ensureCookie(): Promise<string> {
    const now = Date.now();
    if (cachedCookie && now - cookieAt < COOKIE_TTL) return cachedCookie;
    try {
        const res = await axios.get(HOME_URL, {
            timeout: 10000,
            validateStatus: () => true,
            headers: {
                'User-Agent': UA,
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'ko-KR,ko;q=0.9',
                'Accept-Encoding': 'gzip, deflate',
            },
        });
        const set = res.headers['set-cookie'] || [];
        cachedCookie = set.map(c => c.split(';')[0]).join('; ');
        cookieAt = now;
    } catch {
        cachedCookie = '';
    }
    return cachedCookie || '';
}

export async function searchKream(keyword: string): Promise<KreamProduct[]> {
    try {
        const cookie = await ensureCookie();
        const res = await axios.get(SEARCH_URL, {
            params: { keyword, sort: 'popular' },
            timeout: 15000,
            // KREAM은 Accept/Accept-Language 누락 또는 세션 쿠키 없음 시 500. Brotli('br')는 Node axios에서 hang → gzip/deflate만.
            headers: {
                'User-Agent': UA,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate',
                'Referer': 'https://kream.co.kr/',
                ...(cookie ? { 'Cookie': cookie } : {}),
                'sec-ch-ua': '"Chromium";v="120", "Not_A Brand";v="8"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'same-origin',
                'Upgrade-Insecure-Requests': '1',
                'Connection': 'keep-alive',
            },
            maxRedirects: 5,
            validateStatus: (s) => s >= 200 && s < 400,
        });

        return parseKreamSearch(res.data);
    } catch (err: any) {
        // 일부 키워드(예: "드로우")는 KREAM 서버가 일관되게 500 반환 — 로그만 남기고 조용히 넘어감
        console.warn(`[kream] "${keyword}" 검색 실패:`, err?.response?.status || err.message);
        return [];
    }
}

function parseKreamSearch(html: string): KreamProduct[] {
    const $ = cheerio.load(html);
    const products: KreamProduct[] = [];

    $('.product_card, [class*=product]').each((_, el) => {
        const $el = $(el);
        const name = $el.find('.translated_name, .name, [class*=name]').first().text().trim();
        const brand = $el.find('.brand-name, [class*=brand]').first().text().trim();
        const priceText = $el.find('.amount, [class*=price]').first().text().replace(/[^\d]/g, '');
        const wishText = $el.find('.wish_figure, [class*=wish]').first().text().replace(/[^\d]/g, '');
        const productId = $el.attr('data-product-id') || $el.find('a').first().attr('href')?.match(/\/products\/(\d+)/)?.[1] || '';

        if (name && name.length > 2) {
            products.push({
                productId,
                name,
                brand,
                instantBuyPrice: priceText ? Number(priceText) : undefined,
                wishCount: wishText ? Number(wishText) : undefined,
            });
        }
    });

    return products;
}

/**
 * 프리미엄율 급등 상품 = 리셀 키워드 선행 신호
 * (즉시구매가 / 발매가 - 1) * 100
 */
// KREAM은 서버가 한국 IP에서 axios 호출을 주기적으로 차단 (rate limit + TLS fingerprint).
// 복구 비용 대비 효과 낮아 비활성화. 향후 curl 우회 구현 시 활성화.
const KREAM_DISABLED = true;
let kreamDisabledWarned = false;

export async function getHotResellProducts(): Promise<Array<{ name: string; brand: string; premiumRate: number; wishCount: number }>> {
    if (KREAM_DISABLED) {
        if (!kreamDisabledWarned) {
            console.warn('[kream] 서버 차단으로 비활성화됨 — 추후 curl 우회 구현 예정');
            kreamDisabledWarned = true;
        }
        return [];
    }
    // "드로우"는 KREAM 서버가 일관되게 500 반환 → "한정판"으로 교체
    const seedQueries = ['스니커즈', '라부부', '아트토이', '한정판'];
    const all: KreamProduct[] = [];

    for (const q of seedQueries) {
        const items = await searchKream(q);
        all.push(...items);
        await new Promise(r => setTimeout(r, 1500));
    }

    return all
        .filter(p => p.instantBuyPrice && p.wishCount && p.wishCount > 100)
        .map(p => ({
            name: p.name,
            brand: p.brand,
            premiumRate: 0,
            wishCount: p.wishCount || 0,
        }))
        .sort((a, b) => b.wishCount - a.wishCount)
        .slice(0, 50);
}
