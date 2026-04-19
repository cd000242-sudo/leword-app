/**
 * 네이버 쇼핑인사이트 비공식 키워드랭크 (getKeywordRank.naver)
 * 카테고리별 TOP20 인기 검색어 + 성별/연령/기기 필터
 *
 * 합법성: 공개 웹페이지(datalab.naver.com)가 자체 호출하는 XHR 엔드포인트.
 * 로그인 불필요, 공개 데이터, robots.txt 회색지대.
 *
 * 차별점: 경쟁 키워드 도구 99%가 공식 OpenAPI만 사용하고 이 엔드포인트는 안 씀.
 */

import axios from 'axios';

export interface ShoppingRankItem {
    rank: number;
    keyword: string;
    linkId: string;
}

export interface ShoppingRankFilter {
    cid: string;                          // 카테고리 ID (예: '50000000' = 패션의류)
    timeUnit?: 'date' | 'week' | 'month'; // 기본 date
    startDate?: string;                   // YYYY-MM-DD
    endDate?: string;                     // YYYY-MM-DD
    age?: string[];                       // ['10','20','30','40','50','60']
    gender?: 'm' | 'f' | '';              // 빈 문자열 = 전체
    device?: 'pc' | 'mo' | '';            // 빈 문자열 = 전체
}

const ENDPOINT = 'https://datalab.naver.com/shoppingInsight/getKeywordRank.naver';

function formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// Rate limit 차단 상태 기억: 429 받으면 TTL 동안 모든 호출 즉시 실패 (스팸 방지)
let rateLimitedUntil = 0;
let rateLimitWarned = false;
const RATE_LIMIT_COOLDOWN = 5 * 60_000; // 5분

function isRateLimited(): boolean {
    return Date.now() < rateLimitedUntil;
}

function markRateLimited(): void {
    rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN;
    if (!rateLimitWarned) {
        console.warn(`[shopping-keyword-rank] 429 감지 — ${RATE_LIMIT_COOLDOWN / 60000}분간 모든 호출 스킵`);
        rateLimitWarned = true;
        setTimeout(() => { rateLimitWarned = false; }, RATE_LIMIT_COOLDOWN);
    }
}

export async function fetchShoppingKeywordRank(filter: ShoppingRankFilter): Promise<ShoppingRankItem[]> {
    if (isRateLimited()) return [];

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const monthAgo = new Date(today);
    monthAgo.setDate(today.getDate() - 30);

    const params = new URLSearchParams();
    params.append('cid', filter.cid);
    params.append('timeUnit', filter.timeUnit || 'date');
    params.append('startDate', filter.startDate || formatDate(monthAgo));
    params.append('endDate', filter.endDate || formatDate(yesterday));
    params.append('age', (filter.age || []).join(','));
    params.append('gender', filter.gender || '');
    params.append('device', filter.device || '');
    params.append('page', '1');
    params.append('count', '20');

    try {
        const response = await axios.post(ENDPOINT, params.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': 'https://datalab.naver.com/shoppingInsight/sCategory.naver',
                'Origin': 'https://datalab.naver.com',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
            timeout: 15000,
            validateStatus: () => true,
        });

        // 429: rate limited — 차단 상태 기억하고 즉시 반환
        if (response.status === 429) {
            markRateLimited();
            return [];
        }
        if (response.status >= 400) return [];

        // 응답 구조: [{ ranks: [...], returnCode, datetime, ... }]
        const payload = Array.isArray(response.data) ? response.data[0] : response.data;
        const ranks = payload?.ranks;
        if (!Array.isArray(ranks)) return [];

        return ranks.map((r: any) => ({
            rank: Number(r.rank) || 0,
            keyword: String(r.keyword || '').trim(),
            linkId: String(r.linkId || ''),
        })).filter(r => r.keyword.length > 0);
    } catch (err: any) {
        // 네트워크 에러는 1회만 로그
        if (!rateLimitWarned) {
            console.error('[shopping-keyword-rank] 호출 실패:', err.message);
        }
        return [];
    }
}

/**
 * 카테고리 1차 분류 ID 매핑 (네이버 쇼핑 정식 분류)
 */
export const NAVER_SHOPPING_CATEGORIES: Record<string, string> = {
    '50000000': '패션의류',
    '50000001': '패션잡화',
    '50000002': '화장품/미용',
    '50000003': '디지털/가전',
    '50000004': '가구/인테리어',
    '50000005': '출산/육아',
    '50000006': '식품',
    '50000007': '스포츠/레저',
    '50000008': '생활/건강',
    '50000009': '여가/생활편의',
    '50000010': '면세점',
    '50005542': '도서',
};

/**
 * 전 카테고리 일괄 수집 (시드 키워드 풀 생성용)
 */
export async function fetchAllCategoryRanks(filter: Omit<ShoppingRankFilter, 'cid'> = {}): Promise<Record<string, ShoppingRankItem[]>> {
    const result: Record<string, ShoppingRankItem[]> = {};
    const cids = Object.keys(NAVER_SHOPPING_CATEGORIES);

    // 10초 hard timeout 안에 12개 카테고리 완료해야 함.
    // 전체 병렬은 429 트리거 → 3개씩 배치 병렬 (12 / 3 = 4 라운드, 각 ~1.5s = 6s)
    const BATCH = 3;
    for (let i = 0; i < cids.length; i += BATCH) {
        const chunk = cids.slice(i, i + BATCH);
        const entries = await Promise.all(
            chunk.map(async cid => {
                try {
                    const items = await fetchShoppingKeywordRank({ ...filter, cid });
                    return [cid, items] as const;
                } catch {
                    return [cid, [] as ShoppingRankItem[]] as const;
                }
            })
        );
        for (const [cid, items] of entries) result[cid] = items;
        if (i + BATCH < cids.length) {
            await new Promise(r => setTimeout(r, 300));
        }
    }

    return result;
}

/**
 * 인구통계 세그먼트별 TOP 키워드 (예: 2030 여성 모바일)
 */
export async function fetchSegmentRanks(
    cid: string,
    segments: Array<{ age?: string[]; gender?: 'm' | 'f'; device?: 'pc' | 'mo'; label: string }>
): Promise<Array<{ label: string; items: ShoppingRankItem[] }>> {
    const out: Array<{ label: string; items: ShoppingRankItem[] }> = [];
    for (const seg of segments) {
        const items = await fetchShoppingKeywordRank({
            cid,
            age: seg.age,
            gender: seg.gender || '',
            device: seg.device || '',
        });
        out.push({ label: seg.label, items });
        await new Promise(r => setTimeout(r, 800));
    }
    return out;
}
