/**
 * Rich Feed Builder — LEWORD 핵심 가치 엔진
 *
 * 흐름:
 *   1. 17개 소스에서 시드 키워드 풀링 (registry.callAllSources)
 *   2. 위생 필터링 + 중복 제거
 *   3. 네이버 검색광고 API 일괄 호출 → 검색량 + 문서수 + 경쟁도
 *   4. 카테고리 자동 감지 (categories.classifyKeyword 사용)
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
import { classifyKeyword, getCategoryById } from '../categories';
import { getEvergreenSafetyNetSeeds } from './evergreen-safety-net';
import { buildIDFStats, scoreSeedKeyword, isQualitySeed } from './quality-extractor';

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
    cpc: number | null;           // 네이버 검색광고 API 실측 평균 입찰가 (null = 미확인)
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
    let s = String(kw || '').trim();
    // 여는 괄호/대괄호/해시 선두 제거
    s = s.replace(/^[#\[\(]+/, '');
    // 닫는 괄호/대괄호 말미 제거
    s = s.replace(/[\]\)]+$/, '');
    // 짝 안 맞는 괄호 쌍방 정리: "(" 만 있으면 해당 토큰 이후 전체 잘라냄
    const openIdx = s.indexOf('(');
    const closeIdx = s.indexOf(')');
    if (openIdx >= 0 && closeIdx < 0) s = s.slice(0, openIdx).trim();
    else if (closeIdx >= 0 && openIdx < 0) s = s.slice(closeIdx + 1).trim();
    const openBracket = s.indexOf('[');
    const closeBracket = s.indexOf(']');
    if (openBracket >= 0 && closeBracket < 0) s = s.slice(0, openBracket).trim();
    else if (closeBracket >= 0 && openBracket < 0) s = s.slice(closeBracket + 1).trim();
    return s.replace(/\s+/g, ' ');
}

function isValid(kw: string): boolean {
    if (kw.length < 2 || kw.length > 30) return false;
    if (STOP.has(kw)) return false;
    if (/^\d+$/.test(kw)) return false;
    if (!/[가-힣a-zA-Z]/.test(kw)) return false;
    if (kw.startsWith('특수:') || kw.startsWith('파일:') || kw.startsWith('분류:')) return false;
    return true;
}

const CATEGORY_ICON_MAP: Record<string, string> = {
    finance: '💰', insurance_safe: '🛡️', realestate: '🏢',
    hospital: '🏥', health: '💊', diet: '🏃',
    electronics: '📱', smartphone: '📱', laptop: '📱',
    travel_domestic: '✈️', travel_overseas: '✈️', food: '🍽️', recipe: '🍽️',
    beauty: '💄', parenting: '👶', baby_products: '👶',
    education: '📚', english: '📚', coding: '📚',
    policy: '🏛️', fashion: '👕', car: '🚗', car_maintain: '🚗',
    game: '🎮', interior: '🏠', home_life: '🏠',
    pet_dog: '🐶', pet_cat: '🐱', pet_etc: '🐾',
    movie: '🎬', music: '🎵', sports: '🏅', hobby: '🎨',
    book: '📖', app: '📲', ai_tool: '🤖',
    sidejob: '💼', job: '💼', wedding: '💍', mental: '🧠',
    season_spring: '🌸', season_summer: '☀️', season_fall: '🍂', season_winter: '❄️',
    kitchen: '🍳',
};

function classifyForFeed(keyword: string): { id: string; icon: string; label: string } {
    const primary = classifyKeyword(keyword).primary;
    const cat = getCategoryById(primary);
    const icon = CATEGORY_ICON_MAP[primary] || '🔥';
    const label = cat?.label || '이슈';
    return { id: primary, icon, label };
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
    // 수요공급 (45%) — 정보성 블루오션 시드(위키/트렌딩)의 기회지수 반영 강화
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
    // 수익성 (15%) — 수익형 키워드 우대는 유지하되, 정보성 블루오션 억제 방지
    const cpcScore = Math.min(100, cpc >= 2000 ? 100 : cpc >= 1000 ? 70 + (cpc - 1000) * 0.03 : cpc >= 500 ? 40 + (cpc - 500) * 0.06 : cpc >= 200 ? 15 + (cpc - 200) * 0.083 : cpc * 0.075);
    const monetization = (cpcScore * 0.5 + intent * 0.5);
    // 경쟁도 (15%)
    const docPenalty = docCount > 50000 ? 30 : docCount > 20000 ? 20 : docCount > 10000 ? 10 : docCount > 5000 ? 5 : 0;
    const comp = Math.max(0, 100 - docPenalty);
    return Math.round(sd * 0.45 + vol * 0.25 + monetization * 0.15 + comp * 0.15);
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

export type RichFeedProgress = { step: string; percent: number; message: string };
export type RichFeedProgressCallback = (payload: RichFeedProgress) => void;

/**
 * 메인 빌더
 */
export async function buildRichFeed(
    options: { tier?: SourceTier; limit?: number } = {},
    onProgress?: RichFeedProgressCallback
): Promise<RichFeedResult> {
    const tier: 'lite' | 'pro' = options.tier === 'pro' ? 'pro' : 'lite';
    const limit = options.limit || 100;

    const emit = (step: string, percent: number, message: string) => {
        try { onProgress?.({ step, percent, message }); } catch {}
    };

    emit('seed', 5, '28개 외부 소스에서 시드 수집 시작...');

    // 1. 시드 풀링
    const sourceResults = await callAllSources({
        tier: tier === 'lite' ? 'lite' : undefined,
        healthy: true,
    });

    const successSources = Array.from(sourceResults.values()).filter(r => r.success).length;
    const totalSources = sourceResults.size;
    emit('seed', 15, `시드 풀링 완료 (성공 ${successSources}/${totalSources})`);

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

    // 2-1. 안전망 seed 합류 — 외부 소스 실패 시에도 최소 결과 보장
    // 중복이면 기존 source 유지, 신규면 'evergreen' 소스로 추가
    for (const seed of getEvergreenSafetyNetSeeds(40)) {
        const kw = normalize(seed);
        if (!isValid(kw)) continue;
        if (!seedMap.has(kw)) seedMap.set(kw, new Set());
        seedMap.get(kw)!.add('evergreen');
    }

    // 3. 모든 seed 수집 + 소스별 그룹화 (round-robin용)
    const allSeeds = Array.from(seedMap.entries())
        .map(([kw, srcs]) => ({ keyword: kw, sources: Array.from(srcs) }))
        .sort((a, b) => b.sources.length - a.sources.length);

    // 3-1. 소스별로 그룹화 → 다양성 보장
    const perSource = new Map<string, Array<{ keyword: string; sources: string[] }>>();
    for (const seed of allSeeds) {
        const primary = seed.sources[0] || 'unknown';
        if (!perSource.has(primary)) perSource.set(primary, []);
        perSource.get(primary)!.push(seed);
    }

    // 3-2. 품질 기반 선별 — 다양성 CAP + TF-IDF + 고유명사 + 카테고리 부스팅
    //
    // 기존: 소스별 상위 N개 단순 take
    // 개선: 소스 쿼터는 유지하되, 각 소스 내에서 품질 점수로 정렬 후 상위 N개만.
    //       stopwords/노이즈 사전 필터 + IDF 기반 과다등장 키워드 디메리트.
    const HEAVY_SOURCE_CAP = 100;   // 시드 100개 초과 소스는 상위 100개만 (편중 완화)

    // IDF 기반 통계: 소스별 유니크 키워드 집합
    const sourceBuckets = new Map<string, string[]>();
    for (const [sourceId, list] of perSource.entries()) {
        sourceBuckets.set(sourceId, list.map(s => s.keyword));
    }
    const idfStats = buildIDFStats(sourceBuckets);

    const baseSeeds: Array<{ keyword: string; sources: string[]; qualityScore: number }> = [];
    const seenKeywords = new Set<string>();
    for (const [, list] of perSource.entries()) {
        // 품질 점수로 소스 내 재정렬
        const scored = list
            .filter(s => isQualitySeed(s.keyword))
            .map(s => ({
                ...s,
                qualityScore: scoreSeedKeyword(s.keyword, idfStats, s.sources.length),
            }))
            .sort((a, b) => b.qualityScore - a.qualityScore);

        const take = scored.length > HEAVY_SOURCE_CAP ? HEAVY_SOURCE_CAP : scored.length;
        for (let i = 0; i < take; i++) {
            const seed = scored[i];
            if (!seenKeywords.has(seed.keyword)) {
                baseSeeds.push(seed);
                seenKeywords.add(seed.keyword);
            }
        }
    }

    // 3-3. Longtail 확장
    // - Heavy source(seed 100+): 상위 20개만 파생 (전체 파생 폭증 방지)
    // - Minor source(seed 30-): 모든 seed 파생 (최종 feed 기여 확보)
    const LONGTAIL_SUFFIXES = ['추천', '후기', '가격', '비교', '방법', '순위', '종류'];
    const MINOR_THRESHOLD = 30;
    const HEAVY_LONGTAIL_CAP = 20;
    const extraSeeds: typeof baseSeeds = [];
    for (const [, list] of perSource.entries()) {
        const isMinor = list.length <= MINOR_THRESHOLD;
        const targetList = isMinor ? list : list.slice(0, HEAVY_LONGTAIL_CAP);
        for (const base of targetList) {
            const bkw = base.keyword;
            if (bkw.length < 2 || bkw.length > 20) continue;
            if (LONGTAIL_SUFFIXES.some(s => bkw.endsWith(s))) continue;
            const baseScore = scoreSeedKeyword(bkw, idfStats, base.sources.length);
            for (const suffix of LONGTAIL_SUFFIXES) {
                const derived = `${bkw} ${suffix}`;
                if (seedMap.has(derived) || seenKeywords.has(derived)) continue;
                extraSeeds.push({
                    keyword: derived,
                    sources: [...base.sources, 'longtail'],
                    qualityScore: baseScore * 0.8,
                });
                seenKeywords.add(derived);
            }
        }
    }

    // base + longtail 합쳐서 품질 점수 내림차순 정렬 → 상위 후보만 API 검증
    const candidates = [...baseSeeds, ...extraSeeds]
        .sort((a, b) => b.qualityScore - a.qualityScore)
        .slice(0, Math.min(600, limit * 6));

    if (candidates.length === 0) {
        emit('done', 100, '수집된 키워드 없음');
        return { timestamp: Date.now(), total: 0, tier, rows: [], byCategory: {}, bySource: {} };
    }

    emit('candidates', 20, `후보 ${candidates.length}개 선별 완료. 네이버 API 검증 시작...`);

    // 4. 네이버 검색량 + 문서수 일괄 조회 (50개씩 배치)
    const env = EnvironmentManager.getInstance().getConfig();
    const clientId = env.naverClientId || process.env['NAVER_CLIENT_ID'] || '';
    const clientSecret = env.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '';

    if (!clientId || !clientSecret) {
        // API 키 없으면 검증 없이 반환 (실측 값 없음 → null로 표시)
        const rows: RichKeywordRow[] = candidates.slice(0, limit).map((c, idx) => {
            const cat = classifyForFeed(c.keyword);
            return {
                rank: idx + 1,
                keyword: c.keyword,
                category: cat.label,
                categoryIcon: cat.icon,
                grade: '' as const,
                searchVolume: 0,
                documentCount: 0,
                goldenRatio: 0,
                cpc: null,
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
    const totalBatches = Math.ceil(candidates.length / batchSize);

    for (let i = 0; i < candidates.length; i += batchSize) {
        const batchIdx = Math.floor(i / batchSize);
        const batchPercent = 20 + Math.round((batchIdx / totalBatches) * 65); // 20% → 85%
        emit('api', batchPercent, `네이버 API 검증 ${batchIdx + 1}/${totalBatches} (누적 ${enrichedRows.length}건 수집)`);
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
                // longtail 파생 키워드는 월 5회 이상, 원본 seed는 월 10회 이상
                const isLongtailDerived = (seed.sources || []).includes('longtail');
                const minVolume = isLongtailDerived ? 5 : 10;
                if (totalVolume < minVolume) continue;

                // 문서수 미확인(null) / 0 → Naver 블로그 API 실패. 등급 과대평가 방지 위해 B 캡
                const hasValidDocCount = sig.documentCount !== null && sig.documentCount !== undefined && sig.documentCount > 0;
                const docCount = hasValidDocCount ? (sig.documentCount as number) : 0;
                const goldenRatio = hasValidDocCount ? totalVolume / Math.max(1, docCount) : 0;

                const cat = classifyForFeed(sig.keyword);
                // 🔥 네이버 검색광고 API 실측 평균 입찰가 (더미 절대 금지)
                // 실측값이 0이거나 없으면 null — UI에서 "-"로 표시
                const realCpc = (typeof sig.monthlyAveCpc === 'number' && sig.monthlyAveCpc > 0) ? sig.monthlyAveCpc : null;
                const intent = calculatePurchaseIntent(sig.keyword);

                // 스코어링에는 정적 추정 CPC 사용 (점수 일관성 위해) — UI 노출값은 realCpc만
                const scoringCpc = estimateCPC(sig.keyword, cat.id);
                const score = calculateScore(totalVolume, docCount, goldenRatio, scoringCpc, intent);
                let grade = calculateGrade(totalVolume, docCount, goldenRatio, score);
                // 문서수 미확인 키워드는 최고 B등급까지만
                if (!hasValidDocCount && grade && grade !== 'B') grade = 'B';
                if (!grade) continue;

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
                    cpc: realCpc, // 🔥 실측 API 값 only (null 허용, 더미 금지)
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

    emit('grading', 90, `등급 판정 및 정렬 (${enrichedRows.length}건)...`);

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

    emit('done', 100, `완료 — ${top.length}건 발굴`);

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
const CACHE_TTL = 15 * 60_000;        // 메모리 캐시: 15분
const DISK_CACHE_TTL = 4 * 60 * 60_000; // 디스크 캐시: 4시간 (신선도 확보)
const MIN_ACCEPTABLE_TOTAL = 20;       // 이 미만이면 "실패"로 간주, 디스크 캐시 폴백

function getDiskCachePath(): string {
    // app.getPath 가 있으면 userData, 없으면 temp 사용 (테스트/개발 환경)
    // 동적 require로 Electron 없어도 로드 실패 안 하도록
    try {
        const { app } = require('electron');
        if (app?.getPath) {
            const path = require('path');
            return path.join(app.getPath('userData'), 'rich-feed-cache.json');
        }
    } catch {}
    const os = require('os');
    const path = require('path');
    return path.join(os.tmpdir(), 'leword-rich-feed-cache.json');
}

function readDiskCache(): RichFeedResult | null {
    try {
        const fs = require('fs');
        const file = getDiskCachePath();
        if (!fs.existsSync(file)) return null;
        const raw = fs.readFileSync(file, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.rows) || typeof parsed.timestamp !== 'number') return null;
        if (Date.now() - parsed.timestamp > DISK_CACHE_TTL) return null;
        return parsed;
    } catch {
        return null;
    }
}

function writeDiskCache(result: RichFeedResult): void {
    try {
        const fs = require('fs');
        fs.writeFileSync(getDiskCachePath(), JSON.stringify(result), 'utf8');
    } catch (e: any) {
        console.warn('[rich-feed] 디스크 캐시 저장 실패:', e?.message);
    }
}

export async function getCachedRichFeed(
    force: boolean = false,
    options: { tier?: SourceTier; limit?: number } = {},
    onProgress?: RichFeedProgressCallback
): Promise<RichFeedResult> {
    const now = Date.now();

    // 1) 메모리 캐시 (15분, force 아니면 우선)
    if (!force && cached && cached.expiresAt > now) {
        try { onProgress?.({ step: 'cache', percent: 100, message: `캐시 사용 (${cached.result.total}건)` }); } catch {}
        return cached.result;
    }

    // 2) 라이브 빌드
    const result = await buildRichFeed(options, onProgress);

    // 3) 성공적인 빌드 — 캐시 양쪽 저장
    if (result.total >= MIN_ACCEPTABLE_TOTAL) {
        cached = { result, expiresAt: now + CACHE_TTL };
        writeDiskCache(result);
        return result;
    }

    // 4) 빌드 실패/부족 — 디스크 캐시 폴백 (24h 내 성공 결과 재사용)
    const disk = readDiskCache();
    if (disk && disk.total >= MIN_ACCEPTABLE_TOTAL) {
        console.warn(`[rich-feed] 빌드 부족(total=${result.total}) → 디스크 캐시 폴백 (${Math.round((now - disk.timestamp) / 60000)}분 전 저장, ${disk.total}건)`);
        // 메모리에도 캐시 (다음 호출용)
        cached = { result: disk, expiresAt: now + CACHE_TTL };
        return disk;
    }

    // 5) 폴백도 없음 — 빌드 결과 그대로 반환 (적을 수 있음)
    cached = { result, expiresAt: now + CACHE_TTL };
    return result;
}

export function clearRichFeedCache(): void {
    cached = null;
    try {
        const fs = require('fs');
        const file = getDiskCachePath();
        if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch {}
}
