/**
 * Trending Products — 네이버 쇼핑 API + 자동완성에서 카테고리 키워드의 **실제 인기 제품** 추출.
 * v2.49.2: 사용자 요구 "잘 팔리거나 요즘 뜨는 제품" 노출.
 *
 * 흐름:
 *   1) 네이버 쇼핑 검색 (sort='sim' 인기순) → top 상품 title 받음
 *   2) simplifyProductTitleForSearch 로 검색 가능한 짧은 키워드 형태 변환 ("LG 그램 17 2024" 같은)
 *   3) brand prefix 매칭 횟수로 빈도 카운트 (자주 등장 = 인기)
 *   4) 상위 N개 반환 + 원본 키워드 결합 변형 ("LG 그램 17 게이밍 후기" 등)
 */

import { searchNaverShopping, simplifyProductTitleForSearch } from './naver-shopping-api';

/**
 * 입력 카테고리 키워드 → 실제 trending 제품 검색어 후보 추출.
 *
 * @param seed   원본 키워드 (예: "게이밍 노트북 추천")
 * @param maxProducts  추출할 trending 제품 수 (기본 12)
 * @returns 정렬된 product 키워드 배열 (인기순)
 */
export async function findTrendingProducts(seed: string, maxProducts: number = 12): Promise<string[]> {
    const clean = seed.trim();
    if (!clean) return [];

    // 카테고리 토큰 추출 — "추천/비교/베스트/순위" 같은 의도 suffix 제거 후 실제 카테고리 추출
    const SEARCH_INTENT_SUFFIX = /(추천|비교|베스트|순위|랭킹|TOP|가성비|할인|세일)$/;
    let categoryQuery = clean.replace(SEARCH_INTENT_SUFFIX, '').trim();
    if (!categoryQuery) categoryQuery = clean;

    try {
        // Step 1: 네이버 쇼핑 검색 (인기순)
        const result = await searchNaverShopping(categoryQuery, { display: 40, sort: 'sim' });
        const items = result?.items || [];
        if (items.length === 0) return [];

        // Step 2: title → 검색 가능한 product 키워드 변환 + 빈도 카운트
        const productCount = new Map<string, number>();
        for (const item of items) {
            const simplified = simplifyProductTitleForSearch(item.title || '', item.brand);
            if (!simplified || simplified.length < 3) continue;
            // 너무 긴 키워드 (5토큰 이상) 제외 — 검색량 거의 0
            const tokenCount = simplified.split(/\s+/).filter(Boolean).length;
            if (tokenCount > 5 || tokenCount < 2) continue;
            // 너무 짧은 키워드 (1토큰) 제외 — 너무 generic
            productCount.set(simplified, (productCount.get(simplified) || 0) + 1);
        }

        if (productCount.size === 0) return [];

        // Step 3: 빈도 내림차순 정렬 → top N
        const trending = Array.from(productCount.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, maxProducts)
            .map(([kw]) => kw);

        return trending;
    } catch (err: any) {
        console.warn('[trending-products] 네이버 쇼핑 검색 실패:', err?.message);
        return [];
    }
}

/**
 * trending products 와 원본 키워드를 결합 → 검색 키워드 확장.
 *
 * 입력 seed="게이밍 노트북 추천", trending=["LG 그램 17 2024", "갤럭시북 4 프로"]
 * 출력: ["LG 그램 17 2024 추천", "LG 그램 17 2024 게이밍", "갤럭시북 4 프로 추천", "갤럭시북 4 프로 게이밍", ...]
 */
export function combineProductWithIntent(seed: string, trendingProducts: string[]): string[] {
    const out = new Set<string>();
    const clean = seed.trim();
    if (!clean || trendingProducts.length === 0) return [];

    const INTENT_TOKENS_RE = /(추천|비교|베스트|순위|랭킹|가성비|후기|리뷰)/g;
    const intentMatches = clean.match(INTENT_TOKENS_RE) || [];
    const primaryIntent = intentMatches[0] || '추천';
    const stripped = clean.replace(INTENT_TOKENS_RE, '').trim();

    for (const product of trendingProducts) {
        // 변형 1: 제품명 + 원본 의도 ("LG 그램 17 추천")
        out.add(`${product} ${primaryIntent}`);
        // 변형 2: 제품명 + 원본 카테고리 (의도 제거) — "LG 그램 17 게이밍 노트북"
        if (stripped && stripped !== clean && stripped.length >= 3) {
            out.add(`${product} ${stripped}`);
        }
        // 변형 3: 제품명 + 후기/리뷰 (블로그 친화적)
        out.add(`${product} 후기`);
    }
    return Array.from(out);
}

/**
 * 원샷 헬퍼 — seed → trending product 검색 키워드.
 */
export async function expandWithTrendingProducts(seed: string, maxProducts: number = 12): Promise<string[]> {
    const trending = await findTrendingProducts(seed, maxProducts);
    if (trending.length === 0) return [];
    return combineProductWithIntent(seed, trending);
}
