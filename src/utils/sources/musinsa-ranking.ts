/**
 * 무신사 랭킹 — 패션 카테고리 키워드 시드
 *
 * 합법성: 공개 랭킹 페이지, 상품명·브랜드는 사실 정보. rate limit 5~10초.
 * 차별점: 1600만 회원, 패션 트렌드 선행 1순위.
 */

import axios from 'axios';

export interface MusinsaProduct {
    rank: number;
    brand: string;
    productName: string;
    productId: string;
    price?: number;
    discountRate?: number;
}

// Next.js 리뉴얼 이후 실제 랭킹 데이터는 백엔드 API에서 JSON으로 제공 (storeCode로 카테고리 구분)
const RANKING_API = 'https://api.musinsa.com/api2/hm/v5/pans/ranking';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

const CATEGORY_TO_STORE: Record<string, string> = {
    all: 'musinsa',
    top: 'musinsa',
    outer: 'musinsa',
    pants: 'musinsa',
    shoes: 'sneaker',
    bag: 'musinsa',
};

export async function fetchMusinsaRanking(category: 'all' | 'top' | 'outer' | 'pants' | 'shoes' | 'bag' = 'all'): Promise<MusinsaProduct[]> {
    try {
        const storeCode = CATEGORY_TO_STORE[category] || 'musinsa';
        const res = await axios.get(RANKING_API, {
            timeout: 20000,
            params: { storeCode },
            headers: {
                'User-Agent': UA,
                'Accept': 'application/json',
                'Accept-Language': 'ko-KR,ko;q=0.9',
                'Referer': 'https://www.musinsa.com/main/musinsa/ranking',
            },
        });

        const modules = res.data?.data?.modules;
        if (!Array.isArray(modules)) return [];

        const products: MusinsaProduct[] = [];
        let rank = 0;

        for (const mod of modules) {
            if (mod?.type !== 'THREECOLUMN') continue;
            const items = Array.isArray(mod.items) ? mod.items : [];
            for (const item of items) {
                if (item?.type !== 'PRODUCT_COLUMN') continue;
                const info = item.info || {};
                const brand = String(info.brandName || '').trim();
                const name = String(info.productName || '').trim().replace(/\s+/g, ' ');
                const productId = String(item.id || '');
                if (!name || name.length < 2) continue;
                rank += 1;
                products.push({
                    rank,
                    brand,
                    productName: name,
                    productId,
                    price: typeof info.finalPrice === 'number' ? info.finalPrice : undefined,
                    discountRate: typeof info.discountRatio === 'number' ? info.discountRatio : undefined,
                });
                if (rank >= 100) return products;
            }
        }

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
