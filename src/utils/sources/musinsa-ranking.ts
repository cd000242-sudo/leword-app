/**
 * 무신사 랭킹 — 패션 카테고리 키워드 시드
 *
 * 합법성: 공개 랭킹 페이지, 상품명·브랜드는 사실 정보. rate limit 5~10초.
 * 차별점: 1600만 회원, 패션 트렌드 선행 1순위.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

export interface MusinsaProduct {
    rank: number;
    brand: string;
    productName: string;
    productId: string;
    price?: number;
    discountRate?: number;
}

const RANKING_URL = 'https://www.musinsa.com/ranking/best';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

export async function fetchMusinsaRanking(category: 'all' | 'top' | 'outer' | 'pants' | 'shoes' | 'bag' = 'all'): Promise<MusinsaProduct[]> {
    try {
        const url = category === 'all' ? RANKING_URL : `${RANKING_URL}?category=${category}`;
        const res = await axios.get(url, {
            timeout: 20000,
            headers: {
                'User-Agent': UA,
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'ko-KR,ko;q=0.9',
                'Referer': 'https://www.musinsa.com/',
            },
        });

        const $ = cheerio.load(res.data);
        const products: MusinsaProduct[] = [];

        $('.list-box, .li_box, [data-product-id]').each((idx, el) => {
            const $el = $(el);
            const brand = $el.find('.item_title, .brand, [class*=brand]').first().text().trim();
            const name = $el.find('.list_info, .item_name, [class*=name]').first().text().trim().replace(/\s+/g, ' ');
            const productId = $el.attr('data-product-id') || $el.find('a').first().attr('href')?.match(/\/(\d+)/)?.[1] || '';
            const priceText = $el.find('.price, [class*=price]').first().text().replace(/[^\d]/g, '');
            const discountText = $el.find('.discount, [class*=discount]').first().text().replace(/[^\d]/g, '');

            if (name && name.length > 1 && idx < 100) {
                products.push({
                    rank: idx + 1,
                    brand,
                    productName: name,
                    productId,
                    price: priceText ? Number(priceText) : undefined,
                    discountRate: discountText ? Number(discountText) : undefined,
                });
            }
        });

        return products;
    } catch (err: any) {
        console.error('[musinsa] 랭킹 수집 실패:', err.message);
        return [];
    }
}

/**
 * 무신사 상품 → 패션 키워드 시드
 */
export function extractMusinsaKeywords(products: MusinsaProduct[]): Array<{ keyword: string; suggestions: string[] }> {
    return products.map(p => {
        const cleanName = p.productName.replace(/\[[^\]]+\]/g, '').replace(/\([^)]+\)/g, '').trim();
        const baseKeyword = cleanName.split(/\s+/).slice(0, 4).join(' ');
        return {
            keyword: baseKeyword,
            suggestions: [
                `${p.brand} ${baseKeyword} 후기`,
                `${baseKeyword} 코디`,
                `${baseKeyword} 사이즈`,
                `${p.brand} 신상`,
            ],
        };
    });
}
