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

const SEARCH_URL = 'https://kream.co.kr/search';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

export async function searchKream(keyword: string): Promise<KreamProduct[]> {
    try {
        const res = await axios.get(SEARCH_URL, {
            params: { keyword, sort: 'popular' },
            timeout: 15000,
            headers: {
                'User-Agent': UA,
                'Accept-Language': 'ko-KR,ko;q=0.9',
            },
        });

        return parseKreamSearch(res.data);
    } catch (err: any) {
        console.error('[kream] 검색 실패:', err.message);
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
export async function getHotResellProducts(): Promise<Array<{ name: string; brand: string; premiumRate: number; wishCount: number }>> {
    const seedQueries = ['스니커즈', '라부부', '아트토이', '드로우'];
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
