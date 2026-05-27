/**
 * datalab-shopping-trend.ts
 *
 * 네이버 데이터랩 shopping insight 의 카테고리별 top 인기 키워드 자동 추출.
 *
 * Playwright probe (scripts/probe-datalab-shopping.ts) 로 spec 캡처:
 *   POST https://datalab.naver.com/shoppingInsight/getCategoryKeywordRank.naver
 *   Form: cid=50000000&timeUnit=date&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *         &age=&gender=&device=&page=1&count=20
 *   응답: { ranks: [{ rank, keyword, linkId }, ...] }
 *
 * 공식 API 가 아니라 datalab 페이지의 내부 호출 — 페이지 구조 변경 시 깨질 수 있음.
 * fail-safe: try/catch + timeout + 빈 배열 반환.
 */
import axios from 'axios';

export interface ShoppingCategoryKeyword {
    cid: string;
    categoryName: string;
    rank: number;
    keyword: string;
}

/**
 * 주요 1뎁스 카테고리 (probe 결과 + 알려진 매핑).
 * - cid 50000000: 패션의류
 * - cid 50000001: 패션잡화
 * - cid 50000002: 화장품/미용
 * - cid 50000003: 디지털/가전
 * - cid 50000004: 가구/인테리어
 * - cid 50000005: 출산/육아
 * - cid 50000006: 식품
 * - cid 50000007: 스포츠/레저
 * - cid 50000008: 생활/건강
 * - cid 50000009: 여가/생활편의
 * - cid 50000010: 면세점 (제외 — 카테고리 외)
 */
export const SHOPPING_CATEGORIES: { cid: string; name: string }[] = [
    { cid: '50000000', name: '패션의류' },
    { cid: '50000001', name: '패션잡화' },
    { cid: '50000002', name: '화장품/미용' },
    { cid: '50000003', name: '디지털/가전' },
    { cid: '50000004', name: '가구/인테리어' },
    { cid: '50000005', name: '출산/육아' },
    { cid: '50000006', name: '식품' },
    { cid: '50000007', name: '스포츠/레저' },
    { cid: '50000008', name: '생활/건강' },
    { cid: '50000009', name: '여가/생활편의' },
];

const ENDPOINT = 'https://datalab.naver.com/shoppingInsight/getCategoryKeywordRank.naver';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function formatDate(d: Date): string {
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}

/**
 * 단일 카테고리의 top 인기 키워드 (지난 30일).
 * fail-safe: 에러 시 빈 배열.
 */
export async function fetchTopKeywordsByCategory(cid: string, count = 20): Promise<ShoppingCategoryKeyword[]> {
    const cat = SHOPPING_CATEGORIES.find(c => c.cid === cid);
    const categoryName = cat?.name || cid;
    try {
        const end = new Date();
        const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
        const params = new URLSearchParams();
        params.append('cid', cid);
        params.append('timeUnit', 'date');
        params.append('startDate', formatDate(start));
        params.append('endDate', formatDate(end));
        params.append('age', '');
        params.append('gender', '');
        params.append('device', '');
        params.append('page', '1');
        params.append('count', String(count));

        const resp = await axios.post(ENDPOINT, params.toString(), {
            headers: {
                'User-Agent': UA,
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'ko-KR,ko;q=0.9',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Referer': 'https://datalab.naver.com/shoppingInsight/sCategory.naver',
            },
            timeout: 10000,
        });

        const data = resp.data as { statusCode?: number; ranks?: Array<{ rank: number; keyword: string; linkId?: string }> };
        if (data?.statusCode !== 200 || !Array.isArray(data.ranks)) {
            return [];
        }

        return data.ranks
            .filter(r => typeof r.keyword === 'string' && r.keyword.trim().length > 0)
            .map(r => ({
                cid,
                categoryName,
                rank: r.rank,
                keyword: r.keyword.trim(),
            }));
    } catch (e: any) {
        console.warn(`[datalab-shopping-trend] cid=${cid} (${categoryName}) 실패: ${e?.message || e}`);
        return [];
    }
}

/**
 * 모든 주요 shopping 카테고리의 top 키워드 종합.
 * 사용자 카테고리 매칭 키워드 우선 + 전체 카테고리 보강.
 *
 * @param categoryFilter 사용자 선택 BloggerCategoryId 목록 (선택 시 매칭 카테고리만 우선)
 * @param perCategory 카테고리당 top N (기본 20)
 */
export async function fetchAllShoppingTrendKeywords(
    perCategory = 20,
): Promise<ShoppingCategoryKeyword[]> {
    const all: ShoppingCategoryKeyword[] = [];
    // 순차 호출 (datalab 동시 호출 시 rate-limit 위험)
    for (const cat of SHOPPING_CATEGORIES) {
        const items = await fetchTopKeywordsByCategory(cat.cid, perCategory);
        all.push(...items);
        // 호출 간격 (rate-limit 안전)
        await new Promise(r => setTimeout(r, 400));
    }
    return all;
}

/**
 * BloggerCategoryId → shopping cid 매핑 (대략적 매칭).
 * 사용자 카테고리 선택 시 매칭되는 shopping 카테고리 우선 추출용.
 */
export const BLOGGER_TO_SHOPPING_MAP: Record<string, string[]> = {
    fashion: ['50000000', '50000001'],     // 패션의류, 패션잡화
    beauty: ['50000002'],                   // 화장품/미용
    it: ['50000003'],                       // 디지털/가전
    home: ['50000004'],                     // 가구/인테리어
    parenting: ['50000005'],                // 출산/육아
    parenting_kids: ['50000005'],
    pregnancy: ['50000005'],
    food: ['50000006'],                     // 식품
    health: ['50000008'],                   // 생활/건강
    senior: ['50000008'],
    pet: ['50000009'],
    travel: ['50000009'],
    wedding: ['50000001'],
};
