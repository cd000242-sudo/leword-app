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

import { searchNaverShopping, simplifyProductTitleForSearch, cleanProductTitle } from './naver-shopping-api';

/**
 * v2.49.3: brand alias 사전 — "LG전자" → "LG", "삼성전자" → "삼성" 같은 한글/영문 변종 매칭.
 * cleanProductTitle 이 brand 인자 받아 정확 매칭 시도하지만, 변종 처리는 안 됨 → 추가 dedup.
 */
const BRAND_ALIAS: Record<string, string[]> = {
    'LG': ['LG전자', '엘지', '엘지전자'],
    '삼성': ['삼성전자', 'SAMSUNG'],
    'ASUS': ['에이수스', '아수스'],
    'MSI': ['엠에스아이'],
    'HP': ['에이치피', 'HP전자'],
    '레노버': ['LENOVO', 'Lenovo'],
    '애플': ['Apple', 'APPLE'],
    '소니': ['SONY', 'Sony'],
    '필립스': ['PHILIPS', 'Philips'],
};

/**
 * v2.49.3: 카테고리별 토큰 cap — 디지털 제품은 모델명+세대 표시에 5~6 토큰 필요.
 * simplifyProductTitleForSearch 의 default 4 가 "LG 그램 17 2024" 같은 핵심 모델명을 자름.
 */
const CATEGORY_MAX_TOKENS: Record<string, number> = {
    laptop: 5, phone: 5, tv: 5, appliance: 5, peripheral: 5, camera: 5,
    headphone: 5, tablet: 5, smallAppliance: 5, game: 5,
    // 의류/패션은 short 가 자연
    shoes: 4, sportswear: 4, fashionSPA: 4, bag: 4,
};

/**
 * brand 변종 dedup — "LG전자 LG 그램 17" → "LG 그램 17".
 */
function dedupBrandAlias(title: string): string {
    const tokens = title.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) return title;

    const out: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
        const cur = tokens[i];
        const next = tokens[i + 1];
        if (next) {
            // cur 이 next 의 alias 면 cur skip
            const aliases = BRAND_ALIAS[next];
            if (aliases && aliases.some(a => a.toLowerCase() === cur.toLowerCase())) {
                continue;
            }
            // next 가 cur 의 alias 면 다음 iter 에서 next skip
            const aliasesCur = BRAND_ALIAS[cur];
            if (aliasesCur && aliasesCur.some(a => a.toLowerCase() === next.toLowerCase())) {
                out.push(cur);
                i++; // skip next
                continue;
            }
        }
        out.push(cur);
    }
    return out.join(' ');
}

/**
 * 카테고리 가변 cap 으로 title 재가공.
 * 원본 simplifyProductTitleForSearch 의 4토큰 cap 을 카테고리별로 늘림.
 */
function simplifyForCategory(rawTitle: string, brand: string | undefined, family: string | null): string {
    let t = cleanProductTitle(rawTitle, brand);
    if (!t) return '';
    t = t.replace(/\([^)]*\)/g, ' ').replace(/\{[^}]*\}/g, ' ').replace(/\[[^\]]*\]/g, ' ');
    t = t.replace(/\b\d+(\.\d+)?\s*(IU|mg|g|kg|ml|L|정|캡슐|매|개입|개|팩|세트|봉|호|년|일|회|장|p|pcs|ea|EA)\b/gi, ' ');
    t = t.replace(/\b\d+\s*[+x×]\s*\d+\b/g, ' ');
    t = t.replace(/,\s*\d+\S*/g, ' ');
    t = t.replace(/\s+/g, ' ').trim();

    const maxTokens = (family && CATEGORY_MAX_TOKENS[family]) || 4;
    const tokens = t.split(/\s+/).filter(Boolean);
    const final = tokens.slice(0, Math.min(tokens.length, maxTokens)).join(' ').trim();
    return dedupBrandAlias(final);
}

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

    // v2.49.3: 카테고리별 가변 cap을 위해 family 검출
    let family: string | null = null;
    try {
        const { detectCategoryFamily } = await import('./brand-families');
        const detected = detectCategoryFamily(clean);
        family = detected ? String(detected.family) : null;
    } catch { /* ignore */ }

    try {
        // Step 1: 네이버 쇼핑 검색 (인기순)
        const result = await searchNaverShopping(categoryQuery, { display: 40, sort: 'sim' });
        const items = result?.items || [];
        if (items.length === 0) return [];

        // Step 2: title → 검색 가능한 product 키워드 변환 + 빈도 카운트
        //         v2.49.3: simplifyForCategory 가 family 별 가변 cap + brand alias dedup
        const productCount = new Map<string, number>();
        for (const item of items) {
            const simplified = family
                ? simplifyForCategory(item.title || '', item.brand, family)
                : simplifyProductTitleForSearch(item.title || '', item.brand);
            if (!simplified || simplified.length < 3) continue;
            const tokenCount = simplified.split(/\s+/).filter(Boolean).length;
            // 디지털 카테고리는 6토큰까지 허용, 그 외 5
            const maxAllowed = (family && CATEGORY_MAX_TOKENS[family]) || 5;
            if (tokenCount > maxAllowed + 1 || tokenCount < 2) continue;
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

    // v2.49.3: stripped 카테고리 토큰들을 미리 분리 — product에 이미 포함된 토큰 중복 차단용
    const strippedTokens = stripped.split(/\s+/).filter(Boolean).map(t => t.toLowerCase());

    for (const product of trendingProducts) {
        const productLower = product.toLowerCase();

        // 변형 1: 제품명 + 원본 의도 ("LG 그램 17 추천")
        out.add(`${product} ${primaryIntent}`);

        // 변형 2: 제품명 + 원본 카테고리 (의도 제거) — "LG 그램 17 게이밍 노트북"
        //   product 가 stripped 의 모든 의미 토큰을 이미 포함하면 skip (중복 단어 생성 방지)
        //   예: product="한성컴퓨터 TFG MAX 게이밍" + stripped="게이밍 노트북"
        //       → product에 "게이밍" 이미 있어 "...게이밍 게이밍 노트북" 어색 → skip
        if (stripped && stripped !== clean && stripped.length >= 3) {
            const allTokensInProduct = strippedTokens.length > 0 &&
                strippedTokens.every(t => productLower.includes(t));
            if (!allTokensInProduct) {
                out.add(`${product} ${stripped}`);
            }
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
