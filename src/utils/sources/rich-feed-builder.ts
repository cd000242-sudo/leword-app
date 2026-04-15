/**
 * Rich Feed Builder — LEWORD 핵심 가치 엔진
 *
 * 흐름:
 *   1. 17개 소스에서 시드 키워드 풀링 (registry.callAllSources)
 *   2. 위생 필터링 + 중복 제거
 *   3. 네이버 검색광고 API 일괄 호출 → 검색량 + 문서수 + 경쟁도
 *   4. 카테고리 자동 감지 (mdp-engine.detectCategory 재사용)
 *   5. CPC 추정 (profit-engine 재사용)
 *   6. goldenRatio + 등급 (다중 게이트)
 *   7. 신선도 판정 (시계열 + 신규 등장 + 소스 다양성)
 *   8. 발견 소스 추적
 *   9. goldenRatio 내림차순 정렬
 *
 * 차별화: "경쟁자가 못 찾는 소스에서 시드 발굴 + 검색량 실측 + 한눈에 표"
 */

import { callAllSources, SourceTier } from './source-registry';
import { getKeywordTrend } from './source-storage';
import { getNaverKeywordSearchVolumeSeparate } from '../naver-datalab-api';
import { estimateCPC, calculatePurchaseIntent, calculateCompetitionLevel } from '../profit-golden-keyword-engine';
import { EnvironmentManager } from '../environment-manager';

export type Freshness = 'BURNING' | 'RISING' | 'STABLE' | 'EVERGREEN';
export type GoldenGrade = 'SSS' | 'SS' | 'S' | 'A' | 'B';

export interface RichKeywordRow {
    rank: number;
    keyword: string;
    category: string;
    categoryIcon: string;
    grade: GoldenGrade | '';
    searchVolume: number;
    documentCount: number;
    goldenRatio: number;
    cpc: number;
    estimatedMonthlyRevenue: number;
    freshness: Freshness;
    sources: string[];
    sourceCount: number;
    purchaseIntent: number;
    isBlueOcean: boolean;
}

export interface RichFeedResult {
    timestamp: number;
    total: number;
    tier: 'lite' | 'pro';
    rows: RichKeywordRow[];
    byCategory: Record<string, number>;
    bySource: Record<string, number>;
}

const STOP = new Set([
    '오늘', '지금', '진짜', '완전', '정말', '바로', '그냥', '이거', '저거', '있다', '없다',
    '대문', '한국', '대한민국', '서울', '관련', '특집', '뉴스', '소개', '공개', '발표',
    '시작', '종료', '오늘의', '이번', '지난', '최근', '계속', '다음', '먼저', '나중',
]);

function normalize(kw: string): string {
    return String(kw || '').trim()
        .replace(/^[#\[\(]+|[\]\)]+$/g, '')
        .replace(/\s+/g, ' ');
}

function isValid(kw: string): boolean {
    if (kw.length < 2 || kw.length > 30) return false;
    if (STOP.has(kw)) return false;
    if (/^\d+$/.test(kw)) return false;
    if (!/[가-힣a-zA-Z]/.test(kw)) return false;
    if (kw.startsWith('특수:') || kw.startsWith('파일:') || kw.startsWith('분류:')) return false;
    return true;
}

const CATEGORY_MAP: Array<[string[], { id: string; icon: string; label: string }]> = [
    [['대출', '금리', '이자', '은행', '적금', '예금', '투자', '주식', '펀드', '연금', '카드', '토스'], { id: 'finance', icon: '💰', label: '금융' }],
    [['보험', '실비'], { id: 'insurance', icon: '🛡️', label: '보험' }],
    [['아파트', '부동산', '전세', '월세', '매매', '분양', '청약'], { id: 'realestate', icon: '🏢', label: '부동산' }],
    [['변호사', '소송', '법률', '이혼', '상속'], { id: 'legal', icon: '⚖️', label: '법률' }],
    [['병원', '치료', '수술', '진료', '의사', '약', '증상'], { id: 'medical', icon: '🏥', label: '의료' }],
    [['임플란트', '치아', '교정', '치과'], { id: 'dental', icon: '🦷', label: '치과' }],
    [['성형', '시술', '필러', '보톡스'], { id: 'plastic', icon: '💉', label: '시술' }],
    [['영양제', '비타민', '프로바이오틱스', '유산균', '건강식품', '단백질'], { id: 'supplement', icon: '💊', label: '건강' }],
    [['다이어트', '체중', '살빼기', '단식'], { id: 'diet', icon: '🏃', label: '다이어트' }],
    [['노트북', '스마트폰', '갤럭시', '아이폰', '맥북', '태블릿', '이어폰', '모니터', 'PC'], { id: 'tech', icon: '📱', label: 'IT' }],
    [['여행', '호텔', '숙소', '펜션', '항공', '리조트', '관광', '여행지'], { id: 'travel', icon: '✈️', label: '여행' }],
    [['맛집', '카페', '레스토랑', '음식점', '오마카세', '디저트', '브런치'], { id: 'food', icon: '🍽️', label: '맛집' }],
    [['화장품', '스킨케어', '선크림', '파운데이션', '쿠션', '립스틱', '마스카라', '세럼', '토너'], { id: 'beauty', icon: '💄', label: '뷰티' }],
    [['육아', '신생아', '이유식', '어린이집', '유모차', '카시트', '기저귀'], { id: 'parenting', icon: '👶', label: '육아' }],
    [['자격증', '공부', '학원', '강의', '인강', '시험', '문제집'], { id: 'education', icon: '📚', label: '교육' }],
    [['쿠팡', '할인', '세일', '추천', '리뷰', '후기', '비교', '가성비', '최저가'], { id: 'shopping', icon: '🛒', label: '쇼핑' }],
    [['지원금', '보조금', '신청', '급여', '수당', '장려금', '환급'], { id: 'gov', icon: '🏛️', label: '정부지원' }],
    [['옷', '코디', '룩북', '신상', '셔츠', '바지', '재킷', '자켓', '슬랙스', '원피스', '패션'], { id: 'fashion', icon: '👕', label: '패션' }],
    [['차', '자동차', 'BMW', '벤츠', '현대', '기아', '제네시스', '테슬라', '캐스퍼', '전기차'], { id: 'car', icon: '🚗', label: '자동차' }],
    [['게임', '롤', '로아', '발로란트', '디아블로', '닌텐도', '플스', 'PS5'], { id: 'game', icon: '🎮', label: '게임' }],
    [['인테리어', '가구', '소파', '침대', '책상', '의자', '무타공', '집들이'], { id: 'interior', icon: '🏠', label: '인테리어' }],
];

function detectCategory(keyword: string): { id: string; icon: string; label: string } {
    const kw = keyword.toLowerCase();
    for (const [keys, meta] of CATEGORY_MAP) {
        if (keys.some(k => kw.includes(k))) return meta;
    }
    // 인물명 휴리스틱 (한글 2-3자 + 그 외 공백)
    if (/^[가-힣]{2,3}\s\S+/.test(keyword)) return { id: 'celeb', icon: '🌟', label: '연예/이슈' };
    return { id: 'misc', icon: '🔥', label: '이슈' };
}

/**
 * 등급 판정 (다중 게이트, mdp-engine과 일관성 유지)
 */
function calculateGrade(volume: number, docCount: number, ratio: number, score: number): GoldenGrade | '' {
    if (score >= 85 && volume >= 1000 && docCount <= 5000 && ratio >= 5) return 'SSS';
    if (score >= 75 && volume >= 500 && docCount <= 10000 && ratio >= 3) return 'SS';
    if (score >= 65 && volume >= 300 && ratio >= 2) return 'S';
    if (score >= 55 && volume >= 100) return 'A';
    if (score >= 45) return 'B';
    return '';
}

function calculateScore(volume: number, docCount: number, ratio: number, cpc: number, intent: number): number {
    // 수요공급 (40%)
    const sd = Math.min(100,
        ratio >= 20 ? 100 :
        ratio >= 10 ? 80 + (ratio - 10) * 2 :
        ratio >= 5 ? 60 + (ratio - 5) * 4 :
        ratio >= 2 ? 35 + (ratio - 2) * 8.3 :
        ratio >= 1 ? 15 + (ratio - 1) * 20 :
        ratio * 15);
    // 검색량 (25%)
    const vol = Math.min(100,
        volume >= 50000 ? 100 :
        volume >= 10000 ? 80 + (volume - 10000) * 0.0005 :
        volume >= 5000 ? 65 + (volume - 5000) * 0.003 :
        volume >= 1000 ? 40 + (volume - 1000) * 0.00625 :
        volume >= 300 ? 15 + (volume - 300) * 0.036 :
        volume * 0.05);
    // 수익성 (20%)
    const cpcScore = Math.min(100, cpc >= 2000 ? 100 : cpc >= 1000 ? 70 + (cpc - 1000) * 0.03 : cpc >= 500 ? 40 + (cpc - 500) * 0.06 : cpc >= 200 ? 15 + (cpc - 200) * 0.083 : cpc * 0.075);
    const monetization = (cpcScore * 0.5 + intent * 0.5);
    // 경쟁도 (15%)
    const docPenalty = docCount > 50000 ? 30 : docCount > 20000 ? 20 : docCount > 10000 ? 10 : docCount > 5000 ? 5 : 0;
    const comp = Math.max(0, 100 - docPenalty);
    return Math.round(sd * 0.40 + vol * 0.25 + monetization * 0.20 + comp * 0.15);
}

/**
 * 신선도 판정
 *  - BURNING: 신규 등장 + 다중 소스 매칭
 *  - RISING: 시계열 ratio >= 2.0
 *  - EVERGREEN: 시계열 7일 모두 등장
 *  - STABLE: 그 외
 */
function judgeFreshness(keyword: string, sources: string[]): Freshness {
    let isNew = false;
    let maxRatio = 0;
    let consecDays = 0;

    for (const src of sources) {
        const trend = getKeywordTrend(src, keyword);
        if (trend.weekAvg === 0 && trend.today > 0) isNew = true;
        if (trend.ratio > maxRatio) maxRatio = trend.ratio;
        if (trend.weekAvg > 0) consecDays++;
    }

    if (isNew && sources.length >= 2) return 'BURNING';
    if (maxRatio >= 2.0) return 'RISING';
    if (consecDays >= 5) return 'EVERGREEN';
    return 'STABLE';
}

/**
 * 메인 빌더
 */
export async function buildRichFeed(options: { tier?: SourceTier; limit?: number } = {}): Promise<RichFeedResult> {
    const tier: 'lite' | 'pro' = options.tier === 'pro' ? 'pro' : 'lite';
    const limit = options.limit || 100;

    // 1. 시드 풀링
    const sourceResults = await callAllSources({
        tier: tier === 'lite' ? 'lite' : undefined,
        healthy: true,
    });

    // 2. 키워드 → 소스 맵
    const seedMap = new Map<string, Set<string>>();
    for (const [sourceId, result] of sourceResults.entries()) {
        if (!result.success) continue;
        for (const raw of result.keywords) {
            const kw = normalize(raw);
            if (!isValid(kw)) continue;
            if (!seedMap.has(kw)) seedMap.set(kw, new Set());
            seedMap.get(kw)!.add(sourceId);
        }
    }

    // 3. 검증 우선순위: 다중 소스 매칭 키워드 우선
    const candidates = Array.from(seedMap.entries())
        .map(([kw, srcs]) => ({ keyword: kw, sources: Array.from(srcs) }))
        .sort((a, b) => b.sources.length - a.sources.length)
        .slice(0, Math.min(300, limit * 3));

    if (candidates.length === 0) {
        return { timestamp: Date.now(), total: 0, tier, rows: [], byCategory: {}, bySource: {} };
    }

    // 4. 네이버 검색량 + 문서수 일괄 조회 (50개씩 배치)
    const env = EnvironmentManager.getInstance().getConfig();
    const clientId = env.naverClientId || process.env['NAVER_CLIENT_ID'] || '';
    const clientSecret = env.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '';

    if (!clientId || !clientSecret) {
        // API 키 없으면 검증 없이 반환
        const rows: RichKeywordRow[] = candidates.slice(0, limit).map((c, idx) => {
            const cat = detectCategory(c.keyword);
            return {
                rank: idx + 1,
                keyword: c.keyword,
                category: cat.label,
                categoryIcon: cat.icon,
                grade: '' as const,
                searchVolume: 0,
                documentCount: 0,
                goldenRatio: 0,
                cpc: 0,
                estimatedMonthlyRevenue: 0,
                freshness: judgeFreshness(c.keyword, c.sources),
                sources: c.sources,
                sourceCount: c.sources.length,
                purchaseIntent: 0,
                isBlueOcean: false,
            };
        });
        return { timestamp: Date.now(), total: rows.length, tier, rows, byCategory: countBy(rows, 'category'), bySource: countSources(rows) };
    }

    const enrichedRows: RichKeywordRow[] = [];
    const batchSize = 30;

    for (let i = 0; i < candidates.length; i += batchSize) {
        const batch = candidates.slice(i, i + batchSize);
        try {
            const sigs = await getNaverKeywordSearchVolumeSeparate(
                { clientId, clientSecret },
                batch.map(b => b.keyword),
                { includeDocumentCount: true }
            );

            for (const sig of sigs) {
                const seed = batch.find(b => b.keyword === sig.keyword);
                if (!seed) continue;

                const totalVolume = (sig.pcSearchVolume || 0) + (sig.mobileSearchVolume || 0);
                if (totalVolume < 10) continue;

                const docCount = sig.documentCount ?? 0;
                const goldenRatio = docCount === 0 ? totalVolume : totalVolume / Math.max(1, docCount);

                const cat = detectCategory(sig.keyword);
                const cpc = estimateCPC(sig.keyword, cat.id);
                const intent = calculatePurchaseIntent(sig.keyword);
                const compLvl = calculateCompetitionLevel(docCount, totalVolume);

                const score = calculateScore(totalVolume, docCount, goldenRatio, cpc, intent);
                const grade = calculateGrade(totalVolume, docCount, goldenRatio, score);
                if (!grade) continue;

                const ctr = Math.max(0.05, 0.3 - compLvl * 0.025);
                const dailyVisitors = Math.round((totalVolume / 30) * ctr);
                const monthlyRev = Math.round(dailyVisitors * 0.03 * cpc * 30);

                const isBlueOcean = totalVolume >= 300 && totalVolume <= 10000 && docCount <= 2000 && goldenRatio >= 5;

                enrichedRows.push({
                    rank: 0,
                    keyword: sig.keyword,
                    category: cat.label,
                    categoryIcon: cat.icon,
                    grade,
                    searchVolume: totalVolume,
                    documentCount: docCount,
                    goldenRatio: parseFloat(goldenRatio.toFixed(2)),
                    cpc,
                    estimatedMonthlyRevenue: monthlyRev,
                    freshness: judgeFreshness(sig.keyword, seed.sources),
                    sources: seed.sources,
                    sourceCount: seed.sources.length,
                    purchaseIntent: intent,
                    isBlueOcean,
                });
            }
        } catch (e: any) {
            console.warn('[rich-feed] 배치 실패:', e?.message);
        }

        if (enrichedRows.length >= limit) break;
        await new Promise(r => setTimeout(r, 300));
    }

    // 5. 정렬 (등급 → 기회지수 → 소스 수)
    const gradeOrder: Record<string, number> = { SSS: 5, SS: 4, S: 3, A: 2, B: 1 };
    enrichedRows.sort((a, b) => {
        const ga = gradeOrder[a.grade] || 0;
        const gb = gradeOrder[b.grade] || 0;
        if (ga !== gb) return gb - ga;
        if (a.goldenRatio !== b.goldenRatio) return b.goldenRatio - a.goldenRatio;
        return b.sourceCount - a.sourceCount;
    });

    const top = enrichedRows.slice(0, limit).map((r, idx) => ({ ...r, rank: idx + 1 }));

    return {
        timestamp: Date.now(),
        total: top.length,
        tier,
        rows: top,
        byCategory: countBy(top, 'category'),
        bySource: countSources(top),
    };
}

function countBy<T>(arr: T[], key: keyof T): Record<string, number> {
    const out: Record<string, number> = {};
    for (const item of arr) {
        const k = String((item as any)[key]);
        out[k] = (out[k] || 0) + 1;
    }
    return out;
}

function countSources(rows: RichKeywordRow[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const row of rows) {
        for (const src of row.sources) {
            out[src] = (out[src] || 0) + 1;
        }
    }
    return out;
}

let cached: { result: RichFeedResult; expiresAt: number } | null = null;
const CACHE_TTL = 15 * 60_000;

export async function getCachedRichFeed(force: boolean = false, options: { tier?: SourceTier; limit?: number } = {}): Promise<RichFeedResult> {
    const now = Date.now();
    if (!force && cached && cached.expiresAt > now) return cached.result;
    const result = await buildRichFeed(options);
    cached = { result, expiresAt: now + CACHE_TTL };
    return result;
}

export function clearRichFeedCache(): void {
    cached = null;
}
