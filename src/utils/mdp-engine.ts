import { splitKeywordSemantically } from './semantic-splitter';
import { generateQueryPatterns } from './pattern-generator';
import {
    classifyKeywordIntent,
    getNaverKeywordSearchVolumeSeparate,
    hasFreshCanonicalNaverDocumentCount,
} from './naver-datalab-api';
import { getNaverAutocompleteKeywords } from './naver-autocomplete';
import { estimateCPC, calculatePurchaseIntent, calculateCompetitionLevel, CATEGORY_CPC_DATABASE } from './profit-golden-keyword-engine';
import { classifyKeyword, isKeywordMatchingCategory } from './categories';
import { classifyGrade } from './grade';
import { assessGoldenKeywordPrecision } from './golden-keyword-precision';

/**
 * Master Discovery Protocol (MDP) Engine v4.0
 * 6단계 키워드 발굴 파이프라인 + 7차원 통합 황금 스코어링
 *
 * v4.0 추가 차원:
 *  - communityBuzzScore: 커뮤니티 언급 빈도 (더쿠/뽐뿌/보배/디시)
 *  - snsLeadingScore: SNS 선행 신호 (TikTok/Threads/YouTube)
 * 신규 차원은 데이터 수집 안정화 전까지 가중치 0으로 시작 → 점진 상향
 */

export type GoldenGrade = 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' | 'D';

export interface MDPResult {
    keyword: string;
    intent: string;
    intentBadge: string;
    searchVolume: number;
    documentCount: number;
    goldenRatio: number;
    score: number;
    // 실측 분리 검색량(SearchAd PC/모바일) — 존재하면 searchVolume 이 실측임을 뜻하는 provenance.
    // 라다 mapDirectResult·서버 ingest 가 실측 판정에 사용. 추정 경로는 채우지 않는다.
    pcSearchVolume?: number | null;
    mobileSearchVolume?: number | null;
    searchVolumeBindingVersion?: 'keyword-keyed-v2';
    searchVolumeMeasuredAt?: string;
    documentCountSource?: 'naver-api' | 'scrape' | 'fallback' | 'cache' | 'unknown' | 'none';
    documentCountConfidence?: 'high' | 'medium' | 'low';
    documentCountQueryMode?: 'broad' | 'exact-phrase';
    documentCountMeasuredAt?: string;
    isDocumentCountEstimated?: boolean;
    // Phase 2: SERP Signals
    hasSmartBlock?: boolean;
    hasViewSection?: boolean;
    hasInfluencer?: boolean;
    difficultyScore?: number;
    // C2 phase 2: 상위 후보 실측 SERP 심층분석(브라우저 가용 시에만 채워짐, 무측정이면 undefined)
    winnable?: boolean;
    blogFriendly?: boolean;
    shoppingDominant?: boolean;
    opportunityScore?: number;
    serpMeasured?: boolean;
    // C4: keyword-value-verifier 순수 가치검증(표시용 부가 — 코어 등급/필터와 무관)
    valueGrade?: 'S+' | 'S' | 'A' | 'B' | 'C';
    valueQualityScore?: number;
    valueVerified?: boolean;
    valueSummary?: string;
    // C4 slice2: vacancy-detector 빈집분석(상위 후보, 브라우저 불필요 axios). 미측정이면 undefined
    vacancySlots?: number;
    vacancyReliable?: boolean;
    vacancyAction?: string;
    // C4 slice3: serp-content-analyzer 실측 콘텐츠 브리핑(상위 소수, puppeteer 본문크롤). 실측 사실만(추정치 아님)
    briefRecommendedWords?: number;
    briefAvgImages?: number;
    briefMustInclude?: string[];
    briefCompetitorTitles?: string[];
    briefMeasured?: boolean;
    // Phase 3: Monetization
    cvi?: number;
    cpc?: number;
    // Phase 4: Golden Grade (v3.0)
    grade?: GoldenGrade;
    goldenReason?: string;
    estimatedMonthlyRevenue?: number;
    purchaseIntentScore?: number;
    competitionLevel?: number;
    isBlueOcean?: boolean;
    // v4.0: 외부 신호 차원
    communityBuzzScore?: number;
    snsLeadingScore?: number;
    externalSources?: string[];
    measurementOnly?: boolean;
    categoryMatched?: boolean;
}

/**
 * v4.0 외부 신호 주입 인터페이스
 * Signal Aggregator에서 주입받음
 */
export interface ExternalSignals {
    communityBuzzScore: number;  // 0-100
    snsLeadingScore: number;      // 0-100
    sources: string[];
}

export interface MDPDiscoverOptions {
    limit: number;
    minVolume?: number;
    seedKeywords?: string[];
    categoryIds?: string[];
    categoryStrict?: boolean;
    maxCheckedSignals?: number;
    maxProcessedSeeds?: number;
    fastPreview?: boolean;
    includeMeasuredFallback?: boolean;
    onProgress?: (progress: MDPDiscoverProgress) => void;
}

export interface MDPDiscoverProgress {
    phase: 'start' | 'seed' | 'autocomplete' | 'patterns' | 'batch' | 'yield' | 'complete';
    currentSeed?: string;
    processedSeeds?: number;
    queuedSeeds?: number;
    batchIndex?: number;
    totalBatches?: number;
    checked?: number;
    yielded?: number;
    patterns?: number;
}

/**
 * v4.0 가중치 — 신규 차원은 0부터 시작 (안전한 점진 도입)
 */
export const MDP_V4_WEIGHTS = {
    sd: 0.30,        // 수요공급
    comp: 0.25,      // 경쟁도
    money: 0.25,     // 수익성
    vol: 0.10,       // 검색량
    acc: 0.10,       // 접근성
    community: 0.0,  // 커뮤니티 버즈 (데이터 안정화 후 0.05~0.10)
    sns: 0.0,        // SNS 선행 (데이터 안정화 후 0.05~0.10)
};

export class MDPEngine {
    private visited = new Set<string>();
    private queue: string[] = [];
    private config: any;
    private abortRequested = false;

    constructor(config: { clientId: string; clientSecret: string }) {
        this.config = config;
    }

    public abort() {
        this.abortRequested = true;
    }

    /**
     * v4.0: 외부 신호 주입기 — Signal Aggregator에서 호출 시 키워드별 신호를 미리 등록
     * 해당 키워드가 discover 결과로 yield될 때 점수에 반영됨
     */
    private externalSignalsMap = new Map<string, ExternalSignals>();
    private externalSeedKeys: string[] = [];

    public injectExternalSignals(keyword: string, signals: ExternalSignals): void {
        this.externalSignalsMap.set(keyword, signals);
        this.rebuildSeedKeys();
    }

    public injectBatchSignals(map: Map<string, ExternalSignals>): void {
        for (const [k, v] of map.entries()) this.externalSignalsMap.set(k, v);
        this.rebuildSeedKeys();
    }

    private externalSeedLowerMap = new Map<string, string>(); // lowercase → original
    private rebuildSeedKeys(): void {
        // F3: 최소 4자 OR 공백 포함 (compound) — 짧은 generic 시드는 fuzzy 제외
        this.externalSeedKeys = Array.from(this.externalSignalsMap.keys())
            .filter(k => k.length >= 4 || k.includes(' '))
            .sort((a, b) => b.length - a.length);
        this.externalSeedLowerMap.clear();
        for (const seed of this.externalSeedKeys) {
            this.externalSeedLowerMap.set(seed.toLowerCase(), seed);
        }
    }

    /**
     * v4.0: Fuzzy lookup — 정확 일치 우선, lowercase substring 매칭
     * 안전장치:
     *  - 시드 길이 >= 4 OR 공백 포함 (짧은 generic 매칭 차단)
     *  - lowercase 정규화
     *  - 매칭 시 점수 70%로 감쇠 (직접 매칭 우대)
     */
    private lookupExternalSignals(kw: string): ExternalSignals | undefined {
        const direct = this.externalSignalsMap.get(kw);
        if (direct) return direct;

        const kwLower = kw.toLowerCase();
        for (const [seedLower, seedOrig] of this.externalSeedLowerMap.entries()) {
            if (seedLower === kwLower) continue;
            if (kwLower.includes(seedLower) || seedLower.includes(kwLower)) {
                const sig = this.externalSignalsMap.get(seedOrig);
                if (sig) {
                    return {
                        communityBuzzScore: Math.round(sig.communityBuzzScore * 0.7),
                        snsLeadingScore: Math.round(sig.snsLeadingScore * 0.7),
                        sources: sig.sources,
                    };
                }
            }
        }
        return undefined;
    }

    private reportProgress(options: MDPDiscoverOptions, progress: MDPDiscoverProgress): void {
        try {
            options.onProgress?.(progress);
        } catch {
            // Progress listeners must never interrupt discovery.
        }
    }

    private isEntertainmentCategoryContext(categoryIds: string[]): boolean {
        return categoryIds.some(id => ['celeb', 'broadcast', 'music', 'drama', 'movie', 'anime'].includes(id));
    }

    private isKoreanEntity(text: string): boolean {
        const compact = String(text || '').replace(/\s+/g, '');
        return compact.length >= 2 && /[\uac00-\ud7a3]/.test(compact);
    }

    // C2: 대량 발굴 경로의 SERP 신호. 문자열매칭(getNaverSerpSignal)은 현대 네이버(JS 렌더)에서
    // 마크업이 없어 신호를 못 잡고 catch 시 '경쟁 없음' 편향까지 유발 → 대량 경로에서 제거.
    // 대량 경로는 실측 문서수 기반 경쟁도만 신뢰하고 SERP 블록 난이도는 중립(5/10)으로 둔다.
    // 진짜 SERP 난이도는 상위 후보 puppeteer 심층분석(analyzeSmartBlocks)에서 별도 주입 (C2 phase 2).
    private getNeutralSerpSignal() {
        return {
            hasSmartBlock: false,
            hasViewSection: true,
            hasInfluencer: false,
            difficultyScore: 5,
        };
    }

    /**
     * 6단계 발굴 파이프라인 실행
     */
    public async *discover(seed: string, options: MDPDiscoverOptions) {
        const initialSeeds = Array.from(new Set([
            seed,
            ...(Array.isArray(options.seedKeywords) ? options.seedKeywords : []),
        ].map(s => String(s || '').replace(/\s+/g, ' ').trim()).filter(Boolean)));

        for (const initialSeed of initialSeeds) {
            this.queue.push(initialSeed);
        }

        if (this.queue.length === 0) return;

        const semanticAnchors = initialSeeds;
        const categoryIds = Array.from(new Set((options.categoryIds || [])
            .map(id => String(id || '').trim())
            .filter(Boolean)));
        const categoryStrict = options.categoryStrict === true && categoryIds.length > 0;
        let count = 0;
        let processedSeeds = 0;
        let checkedSignals = 0;
        const minVolume = options.minVolume || 10;
        const maxCheckedSignals = Number.isFinite(options.maxCheckedSignals)
            ? Math.max(1, Math.floor(Number(options.maxCheckedSignals)))
            : Number.POSITIVE_INFINITY;
        const maxProcessedSeeds = Number.isFinite(options.maxProcessedSeeds)
            ? Math.max(1, Math.floor(Number(options.maxProcessedSeeds)))
            : Number.POSITIVE_INFINITY;
        const fastPreview = options.fastPreview === true;
        const includeMeasuredFallback = options.includeMeasuredFallback === true;

        this.reportProgress(options, {
            phase: 'start',
            currentSeed: seed,
            processedSeeds,
            queuedSeeds: this.queue.length,
            checked: checkedSignals,
            yielded: count,
        });

        while (
            this.queue.length > 0 &&
            count < options.limit &&
            checkedSignals < maxCheckedSignals &&
            processedSeeds < maxProcessedSeeds
        ) {
            if (this.abortRequested) break;

            const current = this.queue.shift()!;
            if (this.visited.has(current)) continue;
            this.visited.add(current);
            processedSeeds++;

            try {
                this.reportProgress(options, {
                    phase: 'seed',
                    currentSeed: current,
                    processedSeeds,
                    queuedSeeds: this.queue.length,
                    checked: checkedSignals,
                    yielded: count,
                });

                // Step 1: Semantic Split
                const units = splitKeywordSemantically(current);

                // Phase 1 Upgrade: 실시간 자동완성 신호 수집 (Intelligent Semantic Analysis)
                if (!fastPreview) {
                    console.log(`[MDP-ENGINE] 실시간 신호 수집 중: "${current}"`);
                    this.reportProgress(options, {
                        phase: 'autocomplete',
                        currentSeed: current,
                        processedSeeds,
                        queuedSeeds: this.queue.length,
                        checked: checkedSignals,
                        yielded: count,
                    });
                }
                const autocompleteResults = fastPreview
                    ? []
                    : await getNaverAutocompleteKeywords(current, this.config);
                const dynamicSuffixes = autocompleteResults
                    .map(kw => kw.replace(current, '').trim())
                    .filter(suf => suf.length > 0 && suf.length < 10);

                // Step 2 & 3: Intent Classifier & Dynamic Pattern Generator
                const patterns = generateQueryPatterns(units, dynamicSuffixes);

                // Step 4: Signal Collection (Batch)
                // 전체 패턴을 한 번에 조회하지 않고, 10개씩 배치 처리
                const patternArray = Array.from(patterns).slice(0, fastPreview ? 18 : 50); // v2.0: 샘플링 범위 확대
                const chunks: string[][] = [];
                const patternBatchSize = fastPreview ? 18 : 10;
                for (let i = 0; i < patternArray.length; i += patternBatchSize) {
                    chunks.push(patternArray.slice(i, i + patternBatchSize));
                }
                this.reportProgress(options, {
                    phase: 'patterns',
                    currentSeed: current,
                    processedSeeds,
                    queuedSeeds: this.queue.length,
                    checked: checkedSignals,
                    yielded: count,
                    patterns: patternArray.length,
                    totalBatches: chunks.length,
                });

                let adaptiveDelay = fastPreview ? 0 : 300; // 기본 스로틀링

                for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
                    const chunk = chunks[chunkIndex];
                    if (this.abortRequested) break;

                    this.reportProgress(options, {
                        phase: 'batch',
                        currentSeed: current,
                        processedSeeds,
                        queuedSeeds: this.queue.length,
                        batchIndex: chunkIndex + 1,
                        totalBatches: chunks.length,
                        checked: checkedSignals,
                        yielded: count,
                    });

                    const startTime = Date.now();
                    const signals = await getNaverKeywordSearchVolumeSeparate(this.config, chunk);
                    const duration = Date.now() - startTime;

                    // Phase 4: Smart Throttling (부하에 따라 지연 시간 조정)
                    if (duration > 2000) adaptiveDelay = Math.min(2000, adaptiveDelay + 200);
                    else if (duration < 1000) adaptiveDelay = Math.max(100, adaptiveDelay - 50);

                    // Step 5: Money Filter & Scoring
                    for (const sig of signals) {
                        if (checkedSignals >= maxCheckedSignals) break;
                        checkedSignals++;
                        // Phase 4: Semantic Distance Control (순수도 제어)
                        // 시드 키워드와 너무 동떨어진 키워드 배제
                        const anchorsForCurrent = semanticAnchors.includes(current)
                            ? semanticAnchors
                            : [...semanticAnchors, current];
                        const similarity = anchorsForCurrent.reduce((best, anchor) => {
                            return Math.max(best, this.calculateSemanticSimilarity(anchor, sig.keyword));
                        }, 0);
                        if (similarity < 0.15) continue; // 최소 유사도 기준 (0~1)
                        const totalVolume = (sig.pcSearchVolume || 0) + (sig.mobileSearchVolume || 0);
                        if (totalVolume < minVolume) continue;

                        // Never turn an OpenAPI failure into an artificial high ratio.
                        // Missing, exact, estimated, or stale counts are not golden
                        // measurements and must not enter MDP scoring.
                        if (!hasFreshCanonicalNaverDocumentCount(sig)) continue;
                        const docCount = sig.documentCount as number;
                        const goldenRatio = totalVolume / Math.max(1, docCount);

                        const intentInfo = classifyKeywordIntent(sig.keyword);

                        // Phase 3 Upgrade: 카테고리 인식 수익성 모델링 (v3.0)
                        const detectedCategory = classifyKeyword(sig.keyword).primary;
                        const seedCat = categoryIds.some(id => isKeywordMatchingCategory(current, id));
                        const entCat = categoryStrict && this.isEntertainmentCategoryContext(categoryIds) && this.isKoreanEntity(current) && similarity >= 0.45;
                        const categoryMatched = !categoryStrict
                            || categoryIds.some(id => isKeywordMatchingCategory(sig.keyword, id))
                            || seedCat
                            || entCat;
                        if (!categoryMatched && !includeMeasuredFallback) {
                            continue;
                        }

                        // C2: SERP 신호 = 중립(대량 경로는 실측 문서수만 신뢰). 죽은 문자열매칭 네트워크
                        // 호출(getNaverSerpSignal) 제거 → fastPreview 분기 불필요, 네트워크/편향 제거.
                        const serpSignal = this.getNeutralSerpSignal();
                        const categoryCPC = estimateCPC(sig.keyword, detectedCategory);
                        const purchaseIntent = calculatePurchaseIntent(sig.keyword);
                        const competitionLvl = calculateCompetitionLevel(docCount, totalVolume);

                        // Intent Weight
                        let intentWeight = 0.8;
                        if (intentInfo.intent === 'Commercial') intentWeight = 1.5;
                        else if (intentInfo.intent === 'Transactional') intentWeight = 1.2;
                        else if (intentInfo.intent === 'Navigational') intentWeight = 0.5;

                        // CVI (Commercial Value Index) - profit-engine 연동
                        const compIdx = parseFloat(sig.competition || '10');
                        const cvi = (0.5 + (purchaseIntent / 100) * 1.5) * (categoryCPC / 500) * (compIdx || 0.5);

                        // ====== v3.0 통합 황금 점수 (0-100 정규화) ======
                        // 1. 수요공급 점수 (30%) — 검색량÷문서수 비율
                        const supplyDemandScore = Math.min(100, goldenRatio >= 20 ? 100 :
                            goldenRatio >= 10 ? 80 + (goldenRatio - 10) * 2 :
                            goldenRatio >= 5 ? 60 + (goldenRatio - 5) * 4 :
                            goldenRatio >= 2 ? 35 + (goldenRatio - 2) * 8.3 :
                            goldenRatio >= 1 ? 15 + (goldenRatio - 1) * 20 :
                            goldenRatio * 15);

                        // 2. 경쟁도 점수 (25%) — 실측 문서수 기반. SERP 문자열매칭 신호는 현대 네이버에서
                        //    죽어 제거(C2). 중립 SERP 난이도(5/10)를 기준선으로 실측 문서수 페널티만 반영.
                        //    (진짜 SERP 블록 난이도는 상위 후보 puppeteer 심층분석에서 별도 주입)
                        const serpDifficulty = serpSignal.difficultyScore ?? 5;
                        const docPenalty = docCount > 50000 ? 30 : docCount > 20000 ? 20 : docCount > 10000 ? 10 : docCount > 5000 ? 5 : 0;
                        const competitionScore = Math.max(0, Math.min(100, 100 - serpDifficulty - docPenalty));

                        // 3. 수익성 점수 (25%) — CPC × 구매의도
                        const cpcScore = Math.min(100, categoryCPC >= 2000 ? 100 :
                            categoryCPC >= 1000 ? 70 + (categoryCPC - 1000) * 0.03 :
                            categoryCPC >= 500 ? 40 + (categoryCPC - 500) * 0.06 :
                            categoryCPC >= 200 ? 15 + (categoryCPC - 200) * 0.083 :
                            categoryCPC * 0.075);
                        const monetizationScore = (cpcScore * 0.5) + (purchaseIntent * 0.5);

                        // 4. 검색량 점수 (10%) — 절대 검색량
                        const volumeScore = Math.min(100, totalVolume >= 50000 ? 100 :
                            totalVolume >= 10000 ? 80 + (totalVolume - 10000) * 0.0005 :
                            totalVolume >= 5000 ? 65 + (totalVolume - 5000) * 0.003 :
                            totalVolume >= 1000 ? 40 + (totalVolume - 1000) * 0.00625 :
                            totalVolume >= 300 ? 15 + (totalVolume - 300) * 0.036 :
                            totalVolume * 0.05);

                        // 5. 접근성 점수 (10%) — 키워드 길이, 진입장벽
                        const wordCount = sig.keyword.split(/\s+/).filter(Boolean).length;
                        const lengthBonus = wordCount >= 4 ? 30 : wordCount >= 3 ? 20 : wordCount >= 2 ? 10 : 0;
                        const accessibilityScore = Math.min(100, lengthBonus + (100 - competitionLvl * 10));

                        // v4.0: 외부 신호 주입 (정확 일치 + fuzzy substring 매칭)
                        const ext = this.lookupExternalSignals(sig.keyword);
                        const communityScore = ext?.communityBuzzScore ?? 0;
                        const snsScore = ext?.snsLeadingScore ?? 0;

                        // 통합 점수 (가중 기하평균 기반 — 한 차원 0이면 전체 하락)
                        const w = MDP_V4_WEIGHTS;
                        const safeScore = (s: number) => Math.max(1, s);
                        let finalScore = Math.pow(safeScore(supplyDemandScore), w.sd) *
                            Math.pow(safeScore(competitionScore), w.comp) *
                            Math.pow(safeScore(monetizationScore), w.money) *
                            Math.pow(safeScore(volumeScore), w.vol) *
                            Math.pow(safeScore(accessibilityScore), w.acc);

                        // v4.0 외부 차원 — 가중치 > 0일 때만 곱
                        if (w.community > 0) finalScore *= Math.pow(safeScore(communityScore), w.community);
                        if (w.sns > 0) finalScore *= Math.pow(safeScore(snsScore), w.sns);

                        // v4.0 보너스 — 외부 신호 1개 이상 매칭 시 가산점 (가중치 0이라도 발견 사실은 보상)
                        const externalBonus = ext ? Math.min(5, (ext.sources.length || 0) * 1.5) : 0;
                        const clampedScore = Math.min(100, Math.max(0, Math.round(finalScore + externalBonus)));
                        const measuredSssGate = totalVolume >= 1000
                            && docCount > 0
                            && docCount <= 5000
                            && goldenRatio >= 5;
                        const scoreAfterMetricRescue = measuredSssGate
                            ? Math.max(85, clampedScore)
                            : clampedScore;

                        // ====== 등급 판정 (다중 게이트) ======
                        const rawGrade = this.calculateGrade(scoreAfterMetricRescue, totalVolume, docCount, goldenRatio, serpDifficulty);
                        const measurementOnly = includeMeasuredFallback
                            && (rawGrade === 'C' || rawGrade === 'D' || !categoryMatched);

                        // B등급 미만 필터링
                        if ((rawGrade === 'C' || rawGrade === 'D') && !includeMeasuredFallback) continue;
                        let grade: GoldenGrade = measurementOnly ? 'B' : rawGrade;
                        let scoreForDisplay = measurementOnly ? Math.max(45, scoreAfterMetricRescue) : scoreAfterMetricRescue;
                        const precision = assessGoldenKeywordPrecision({
                            keyword: sig.keyword,
                            grade,
                            score: scoreForDisplay,
                            searchVolume: totalVolume,
                            documentCount: docCount,
                            goldenRatio,
                            categoryIds,
                            categoryStrict,
                            measurementOnly,
                        });
                        if (!precision.ok) {
                            if (!includeMeasuredFallback) continue;
                            grade = 'B';
                            scoreForDisplay = Math.min(74, Math.max(45, scoreForDisplay));
                        }

                        // 황금 사유 생성
                        const goldenReason = measurementOnly
                            ? `Measured keyword metrics: sv ${totalVolume.toLocaleString()}, dc ${docCount.toLocaleString()} - golden gates not met, review candidate`
                            : this.generateGoldenReason(
                                totalVolume, docCount, goldenRatio, categoryCPC, purchaseIntent, competitionScore, grade
                            );

                        // 월수익 추정
                        const ctr = Math.max(0.05, 0.3 - (competitionLvl * 0.025));
                        const dailyVisitors = Math.round((totalVolume / 30) * ctr);
                        const estimatedMonthlyRevenue = Math.round(dailyVisitors * 0.03 * categoryCPC * 30);

                        // 블루오션 판정
                        const isBlueOcean = totalVolume >= 300 && totalVolume <= 10000 &&
                            docCount <= 2000 && goldenRatio >= 5 && categoryCPC >= 150 && competitionLvl <= 4;

                        const result: MDPResult = {
                            keyword: sig.keyword,
                            intent: intentInfo.intent,
                            intentBadge: intentInfo.badge,
                            searchVolume: totalVolume,
                            documentCount: docCount,
                            goldenRatio: parseFloat(goldenRatio.toFixed(2)),
                            score: scoreForDisplay,
                            pcSearchVolume: sig.pcSearchVolume,
                            mobileSearchVolume: sig.mobileSearchVolume,
                            searchVolumeBindingVersion: sig.searchVolumeBindingVersion,
                            searchVolumeMeasuredAt: sig.searchVolumeMeasuredAt,
                            documentCountSource: sig.documentCountSource,
                            documentCountConfidence: sig.documentCountConfidence,
                            documentCountQueryMode: sig.documentCountQueryMode,
                            documentCountMeasuredAt: sig.documentCountMeasuredAt,
                            isDocumentCountEstimated: sig.isDocumentCountEstimated,
                            // Phase 2 Data
                            hasSmartBlock: serpSignal.hasSmartBlock,
                            hasViewSection: serpSignal.hasViewSection,
                            hasInfluencer: serpSignal.hasInfluencer,
                            difficultyScore: serpSignal.difficultyScore,
                            // Phase 3 Data
                            cvi: parseFloat(cvi.toFixed(2)),
                            cpc: categoryCPC,
                            // Phase 4: Golden Grade (v3.0)
                            grade,
                            goldenReason,
                            estimatedMonthlyRevenue,
                            purchaseIntentScore: purchaseIntent,
                            competitionLevel: competitionLvl,
                            isBlueOcean,
                            // v4.0
                            communityBuzzScore: communityScore,
                            snsLeadingScore: snsScore,
                            externalSources: ext?.sources,
                            measurementOnly,
                            categoryMatched,
                        };

                        yield result;
                        count++;
                        this.reportProgress(options, {
                            phase: 'yield',
                            currentSeed: current,
                            processedSeeds,
                            queuedSeeds: this.queue.length,
                            checked: checkedSignals,
                            yielded: count,
                        });

                        // Step 6: Recursive Expansion — B등급 이상만 확장
                        if (!measurementOnly && goldenRatio > 2.0 && clampedScore >= 50 && count < options.limit) {
                            this.queue.push(sig.keyword);
                        }

                        if (count >= options.limit) break;
                    }

                    if (checkedSignals >= maxCheckedSignals) break;

                    // 레이트 리밋 방지를 위한 미세 지연
                    if (!fastPreview && adaptiveDelay > 0) {
                        await new Promise(resolve => setTimeout(resolve, adaptiveDelay));
                    }
                }
            } catch (err) {
                console.error(`[MDP-ENGINE] Error discovering "${current}":`, err);
            }
        }

        this.reportProgress(options, {
            phase: 'complete',
            currentSeed: seed,
            processedSeeds,
            queuedSeeds: this.queue.length,
            checked: checkedSignals,
            yielded: count,
        });
    }

    /**
     * v3.0: 다중 게이트 등급 판정
     */
    // 등급 배정 SSoT는 ./grade.classifyGrade (C1 단일화). serpDifficulty 는 기존에도 미사용(SSoT에 미포함).
    // SSS = classic OR winnable — 이전 classic-only 대비 저볼륨 winnable(문서수≪검색량)이 정본 SSS로 승격.
    private calculateGrade(
        score: number, volume: number, docCount: number, ratio: number, _serpDifficulty: number
    ): GoldenGrade {
        return classifyGrade({ score, volume, docs: docCount, ratio });
    }

    /**
     * v3.0: 황금 사유 생성 — "왜 이 키워드가 황금인지" 설명
     */
    private generateGoldenReason(
        volume: number, docCount: number, ratio: number,
        cpc: number, purchaseIntent: number, competitionScore: number, grade: GoldenGrade
    ): string {
        const parts: string[] = [];

        if (ratio >= 10) parts.push(`검색량 ${volume.toLocaleString()} 대비 문서 ${docCount.toLocaleString()}개 — 경쟁 극히 낮음`);
        else if (ratio >= 5) parts.push(`검색량 ${volume.toLocaleString()} 대비 문서 ${docCount.toLocaleString()}개 — 블루오션`);
        else if (ratio >= 2) parts.push(`검색량 대비 경쟁 적절 (비율 ${ratio.toFixed(1)})`);

        if (cpc >= 1000) parts.push(`고단가 키워드 (CPC ${cpc.toLocaleString()}원)`);
        if (purchaseIntent >= 60) parts.push('구매의도 높음');
        if (competitionScore >= 70) parts.push('SERP 진입 용이');
        if (docCount <= 500) parts.push('문서수 극소 — 즉시 상위노출 가능');

        if (parts.length === 0) parts.push(`종합 점수 기반 ${grade}등급`);

        return parts.join(' | ');
    }

    /**
     * Phase 4: 세만틱 유사도 계산 (Dice Coefficient 기반)
     */
    private calculateSemanticSimilarity(str1: string, str2: string): number {
        const getBigrams = (s: string) => {
            const bigrams = new Set<string>();
            const clean = s.replace(/\s+/g, '').toLowerCase();
            for (let i = 0; i < clean.length - 1; i++) {
                bigrams.add(clean.substring(i, i + 2));
            }
            return bigrams;
        };

        const b1 = getBigrams(str1);
        const b2 = getBigrams(str2);
        if (b1.size === 0 || b2.size === 0) return 0;

        let intersect = 0;
        for (const gram of b1) {
            if (b2.has(gram)) intersect++;
        }

        return (2 * intersect) / (b1.size + b2.size);
    }
}
