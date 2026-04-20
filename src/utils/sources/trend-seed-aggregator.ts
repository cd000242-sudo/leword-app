/**
 * Trend Seed Aggregator — 여러 실시간 소스의 뷰티/패션 제품명을 교차검증해 시드 생성
 *
 * 원칙:
 *  1. 폴백 하드코딩 금지. 모든 소스 실패 시 빈 배열 반환 (호출측이 정직하게 사용자에게 알림)
 *  2. 여러 소스 병렬 fetch. 한 소스 실패해도 나머지로 커버
 *  3. 제품명 정규화 (괄호/수량 제거)
 *  4. Cross-source 빈도 가중치 — 2+ 소스 공통 등장 = "진짜 유행" 가중
 *  5. 각 제품당 다중 시드 파생 (전체명 / 브랜드+카테고리 2-gram / 핵심 토큰)
 */

import { fetchOliveyoungBest, extractOliveyoungKeywords, fetchOliveyoungMultiCategory, OliveyoungProduct } from './oliveyoung-ranking';
import { fetchShoppingKeywordRank } from './naver-shopping-keyword-rank';
import { fetchMusinsaRanking, extractMusinsaKeywords } from './musinsa-ranking';
import { fetchYoutubeBeautyTrending, fetchYoutubeFashionTrending } from './youtube-beauty-trending';

export interface TrendSeed {
    seed: string;                 // 쿼리용 정규화 키워드
    rawName: string;              // 원본 제품명
    sources: string[];            // 어느 소스에서 나왔는지
    crossScore: number;           // 빈도 * 소스 수 가중치
}

/**
 * 제품명 정규화
 *  - 괄호/대괄호 내용 제거
 *  - 용량/수량 표기 제거 (50ml, 100g, 5매 등)
 *  - 홍보 문구 제거 ([증정], [+1] 등)
 *  - 선행/후행 공백 정리
 */
function normalizeProductName(name: string): string {
    return String(name || '')
        .replace(/\[[^\]]*\]/g, ' ')
        .replace(/\([^)]*\)/g, ' ')
        .replace(/\d+(ml|g|매|개|호|ea|EA|팩|세트)/gi, ' ')
        .replace(/\d+\+\d+/g, ' ')                        // 1+1, 10+1
        .replace(/[★☆※]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function addCandidate(
    map: Map<string, { rawName: string; sources: Set<string>; freq: number }>,
    seed: string,
    rawName: string,
    source: string,
    weight = 1
): void {
    if (!seed || seed.length < 2) return;
    const key = seed.toLowerCase();
    const existing = map.get(key);
    if (existing) {
        existing.sources.add(source);
        existing.freq += weight;
    } else {
        map.set(key, { rawName, sources: new Set([source]), freq: weight });
    }
}

/**
 * 제품 1개에서 3종의 시드 파생:
 *  1. 전체명 (정규화됨): "메디힐 에센셜 마스크팩"
 *  2. 첫 2토큰: "메디힐 에센셜"
 *  3. 브랜드 + 마지막 토큰(카테고리): "메디힐 마스크팩"
 */
function deriveSeedsFromProductName(rawName: string, brand?: string): string[] {
    const normalized = normalizeProductName(rawName);
    if (normalized.length < 3) return [];

    const tokens = normalized.split(/\s+/).filter(t => t.length >= 1);
    if (tokens.length === 0) return [];

    const seeds = new Set<string>();
    // 1. 전체 (4토큰 이하만 — 너무 길면 API 무반응)
    if (tokens.length <= 4) seeds.add(normalized);

    // 2. 첫 2-3토큰
    if (tokens.length >= 2) {
        seeds.add(tokens.slice(0, 2).join(' '));
    }
    if (tokens.length >= 3) {
        seeds.add(tokens.slice(0, 3).join(' '));
    }

    // 3. 브랜드 + 마지막 토큰 (카테고리)
    if (brand && tokens.length >= 2) {
        const last = tokens[tokens.length - 1];
        if (last.length >= 2) seeds.add(`${brand} ${last}`);
    }

    return Array.from(seeds);
}

/**
 * 뷰티 카테고리 통합 시드 생성
 *  - 올리브영 멀티 카테고리 (주)
 *  - 네이버 쇼핑 데이터랩 뷰티 (cid=50000002) (보조, 실시간 확정)
 *  - YouTube 뷰티 트렌딩 영상 제목 (보조)
 */
export async function aggregateBeautyTrendSeeds(): Promise<TrendSeed[]> {
    const map = new Map<string, { rawName: string; sources: Set<string>; freq: number }>();

    // 병렬 fetch — 독립 실패 허용
    const [oliveyoungProducts, naverShoppingItems, youtubeTrending] = await Promise.all([
        fetchOliveyoungMultiCategory().catch(() => [] as OliveyoungProduct[]),
        fetchShoppingKeywordRank({ cid: '50000002' }).catch(() => [] as any[]),
        fetchYoutubeBeautyTrending().catch(() => []),
    ]);

    console.log(`[trend-agg:beauty] 올리브영=${oliveyoungProducts.length}, 네이버쇼핑=${naverShoppingItems.length}, YouTube=${youtubeTrending.length}`);

    // 1. 올리브영 제품 → 다중 시드
    for (const p of oliveyoungProducts) {
        const derived = deriveSeedsFromProductName(p.productName, p.brand);
        for (const s of derived) addCandidate(map, s, p.productName, 'oliveyoung');
    }

    // 2. 네이버 쇼핑 키워드 (이미 검색 가능 형태) — 가중치 2x (확정 실시간)
    for (const it of naverShoppingItems) {
        const kw = (it.keyword || '').trim();
        if (kw && kw.length >= 2) addCandidate(map, kw, kw, 'naver-shopping', 2);
    }

    // 3. YouTube 트렌딩 제품명 (영상 제목 추출)
    for (const t of youtubeTrending) {
        if (t.name && t.name.length >= 2) {
            addCandidate(map, t.name, t.name, 'youtube', Math.min(3, t.frequency));
        }
    }

    // cross-validation 스코어 계산
    // 🔥 YouTube 단독 시드는 노이즈 비율 높아 제외 (영상 제목 내 단어 나열)
    //    다른 소스와 교차된 YouTube 시드만 승격 (검증된 유행 제품)
    return Array.from(map.entries())
        .filter(([_, v]) => {
            if (v.sources.size >= 2) return true;   // 2개 이상 소스면 무조건 통과
            if (v.sources.has('youtube') && v.sources.size === 1) return false;   // YouTube 단독 = 노이즈
            return true;   // 올리브영/네이버쇼핑 단독은 유지 (실제 상점 데이터)
        })
        .map(([seed, v]) => ({
            seed,
            rawName: v.rawName,
            sources: Array.from(v.sources),
            crossScore: v.freq * v.sources.size,
        }))
        .sort((a, b) => b.crossScore - a.crossScore);
}

/**
 * 패션 카테고리 통합 시드
 *  - 무신사 (주)
 *  - 네이버 쇼핑 패션의류 (cid=50000000)
 *  - 네이버 쇼핑 패션잡화 (cid=50000001)
 *  - YouTube 패션 트렌딩
 */
export async function aggregateFashionTrendSeeds(): Promise<TrendSeed[]> {
    const map = new Map<string, { rawName: string; sources: Set<string>; freq: number }>();

    const [musinsaProducts, naverFashion, naverFashionAcc, youtubeTrending] = await Promise.all([
        fetchMusinsaRanking().catch(() => [] as any[]),
        fetchShoppingKeywordRank({ cid: '50000000' }).catch(() => [] as any[]),
        fetchShoppingKeywordRank({ cid: '50000001' }).catch(() => [] as any[]),
        fetchYoutubeFashionTrending().catch(() => []),
    ]);

    console.log(`[trend-agg:fashion] 무신사=${musinsaProducts.length}, 네이버패션=${naverFashion.length}+${naverFashionAcc.length}, YouTube=${youtubeTrending.length}`);

    // 1. 무신사 제품 → 추출된 키워드 (이미 브랜드+제품 형태)
    const musinsaKws = extractMusinsaKeywords(musinsaProducts);
    for (const mk of musinsaKws) {
        if (mk.keyword && mk.keyword.length >= 2) {
            addCandidate(map, mk.keyword, mk.keyword, 'musinsa');
        }
    }

    // 2. 네이버 쇼핑 패션/잡화 키워드
    for (const it of [...naverFashion, ...naverFashionAcc]) {
        const kw = (it.keyword || '').trim();
        if (kw && kw.length >= 2) addCandidate(map, kw, kw, 'naver-shopping', 2);
    }

    // 3. YouTube 트렌딩
    for (const t of youtubeTrending) {
        if (t.name && t.name.length >= 2) {
            addCandidate(map, t.name, t.name, 'youtube', Math.min(3, t.frequency));
        }
    }

    return Array.from(map.entries())
        .filter(([_, v]) => {
            if (v.sources.size >= 2) return true;
            if (v.sources.has('youtube') && v.sources.size === 1) return false;
            return true;
        })
        .map(([seed, v]) => ({
            seed,
            rawName: v.rawName,
            sources: Array.from(v.sources),
            crossScore: v.freq * v.sources.size,
        }))
        .sort((a, b) => b.crossScore - a.crossScore);
}

/**
 * 진단/로깅용: 수집된 시드 요약
 */
export function summarizeTrendSeeds(seeds: TrendSeed[]): string {
    const total = seeds.length;
    const crossHit = seeds.filter(s => s.sources.length >= 2).length;
    const oneSource = seeds.filter(s => s.sources.length === 1).length;
    const top5 = seeds.slice(0, 5).map(s => `${s.seed}(${s.sources.join(',')}:${s.crossScore})`).join(' / ');
    return `전체 ${total}개, 교차검증 ${crossHit}개, 단일소스 ${oneSource}개. TOP5: ${top5}`;
}
