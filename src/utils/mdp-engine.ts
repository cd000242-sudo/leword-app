import { splitKeywordSemantically } from './semantic-splitter';
import { generateQueryPatterns } from './pattern-generator';
import { classifyKeywordIntent, getNaverKeywordSearchVolumeSeparate, getNaverSerpSignal } from './naver-datalab-api';
import { getNaverAutocompleteKeywords } from './naver-autocomplete';
import { estimateCPC, calculatePurchaseIntent, calculateCompetitionLevel, CATEGORY_CPC_DATABASE } from './profit-golden-keyword-engine';

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
    // Phase 2: SERP Signals
    hasSmartBlock?: boolean;
    hasViewSection?: boolean;
    hasInfluencer?: boolean;
    difficultyScore?: number;
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

    /**
     * 6단계 발굴 파이프라인 실행
     */
    public async *discover(seed: string, options: { limit: number; minVolume?: number }) {
        this.queue.push(seed);
        let count = 0;
        const minVolume = options.minVolume || 10;

        while (this.queue.length > 0 && count < options.limit) {
            if (this.abortRequested) break;

            const current = this.queue.shift()!;
            if (this.visited.has(current)) continue;
            this.visited.add(current);

            try {
                // Step 1: Semantic Split
                const units = splitKeywordSemantically(current);

                // Phase 1 Upgrade: 실시간 자동완성 신호 수집 (Intelligent Semantic Analysis)
                console.log(`[MDP-ENGINE] 실시간 신호 수집 중: "${current}"`);
                const autocompleteResults = await getNaverAutocompleteKeywords(current, this.config);
                const dynamicSuffixes = autocompleteResults
                    .map(kw => kw.replace(current, '').trim())
                    .filter(suf => suf.length > 0 && suf.length < 10);

                // Step 2 & 3: Intent Classifier & Dynamic Pattern Generator
                const patterns = generateQueryPatterns(units, dynamicSuffixes);

                // Step 4: Signal Collection (Batch)
                // 전체 패턴을 한 번에 조회하지 않고, 10개씩 배치 처리
                const patternArray = Array.from(patterns).slice(0, 50); // v2.0: 샘플링 범위 확대
                const chunks: string[][] = [];
                for (let i = 0; i < patternArray.length; i += 10) {
                    chunks.push(patternArray.slice(i, i + 10));
                }

                let adaptiveDelay = 300; // 기본 스로틀링

                for (const chunk of chunks) {
                    if (this.abortRequested) break;

                    const startTime = Date.now();
                    const signals = await getNaverKeywordSearchVolumeSeparate(this.config, chunk);
                    const duration = Date.now() - startTime;

                    // Phase 4: Smart Throttling (부하에 따라 지연 시간 조정)
                    if (duration > 2000) adaptiveDelay = Math.min(2000, adaptiveDelay + 200);
                    else if (duration < 1000) adaptiveDelay = Math.max(100, adaptiveDelay - 50);

                    // Step 5: Money Filter & Scoring
                    for (const sig of signals) {
                        // Phase 4: Semantic Distance Control (순수도 제어)
                        // 시드 키워드와 너무 동떨어진 키워드 배제
                        const similarity = this.calculateSemanticSimilarity(seed, sig.keyword);
                        if (similarity < 0.15) continue; // 최소 유사도 기준 (0~1)
                        const totalVolume = (sig.pcSearchVolume || 0) + (sig.mobileSearchVolume || 0);
                        if (totalVolume < minVolume) continue;

                        const docCount = sig.documentCount || 0;
                        const goldenRatio = docCount === 0 ? 10 : totalVolume / docCount;

                        const intentInfo = classifyKeywordIntent(sig.keyword);

                        // Phase 2 Upgrade: SERP 신호 분석
                        const serpSignal = await getNaverSerpSignal(sig.keyword);

                        // Phase 3 Upgrade: 카테고리 인식 수익성 모델링 (v3.0)
                        const detectedCategory = this.detectCategory(sig.keyword);
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

                        // 2. 경쟁도 점수 (25%) — SERP 난이도 + 문서수 기반
                        const serpDifficulty = serpSignal.difficultyScore ?? 50;
                        const serpPenalty = serpSignal.hasSmartBlock ? 10 : 0;
                        const influencerPenalty = serpSignal.hasInfluencer ? 15 : 0;
                        const rawCompetitionScore = 100 - serpDifficulty - serpPenalty - influencerPenalty;
                        const docPenalty = docCount > 50000 ? 30 : docCount > 20000 ? 20 : docCount > 10000 ? 10 : docCount > 5000 ? 5 : 0;
                        const competitionScore = Math.max(0, Math.min(100, rawCompetitionScore - docPenalty));

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

                        // ====== 등급 판정 (다중 게이트) ======
                        const grade = this.calculateGrade(clampedScore, totalVolume, docCount, goldenRatio, serpDifficulty);

                        // B등급 미만 필터링
                        if (grade === 'C' || grade === 'D') continue;

                        // 황금 사유 생성
                        const goldenReason = this.generateGoldenReason(
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
                            score: clampedScore,
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
                        };

                        yield result;
                        count++;

                        // Step 6: Recursive Expansion — B등급 이상만 확장
                        if (goldenRatio > 2.0 && clampedScore >= 50 && count < options.limit) {
                            this.queue.push(sig.keyword);
                        }

                        if (count >= options.limit) break;
                    }

                    // 레이트 리밋 방지를 위한 미세 지연
                    await new Promise(resolve => setTimeout(resolve, adaptiveDelay));
                }
            } catch (err) {
                console.error(`[MDP-ENGINE] Error discovering "${current}":`, err);
            }
        }
    }

    /**
     * v3.0: 카테고리 자동 감지
     */
    private detectCategory(keyword: string): string {
        const kw = keyword.toLowerCase();
        const categoryMap: Array<[string[], string]> = [
            [['대출', '금리', '이자', '은행', '적금', '예금', '투자', '주식', '펀드', '연금'], 'finance'],
            [['보험', '실비', '자동차보험', '생명보험'], 'insurance'],
            [['아파트', '부동산', '전세', '월세', '매매', '분양'], 'realestate'],
            [['변호사', '소송', '법률', '이혼', '상속'], 'legal'],
            [['병원', '치료', '수술', '진료', '의사'], 'medical'],
            [['임플란트', '치아', '교정', '치과'], 'dental'],
            [['성형', '시술', '필러', '보톡스'], 'plastic'],
            [['영양제', '비타민', '프로바이오틱스', '유산균', '건강식품'], 'supplement'],
            [['다이어트', '체중', '살빼기', '단식'], 'diet'],
            [['노트북', '스마트폰', '태블릿', '이어폰', '모니터'], 'tech'],
            [['여행', '호텔', '숙소', '펜션', '항공'], 'travel'],
            [['맛집', '카페', '레스토랑', '음식점'], 'food'],
            [['화장품', '스킨케어', '선크림', '파운데이션'], 'beauty'],
            [['육아', '신생아', '이유식', '어린이집'], 'parenting'],
            [['자격증', '공부', '학원', '강의', '인강'], 'education'],
            [['쿠팡', '할인', '세일', '추천', '리뷰', '후기', '비교', '가성비'], 'review'],
            [['지원금', '보조금', '신청', '급여', '수당', '장려금'], 'finance'],
            [['부업', '사이드잡', '재택', '블로그수익', '애드센스'], 'business'],
        ];
        for (const [keywords, cat] of categoryMap) {
            if (keywords.some(k => kw.includes(k))) return cat;
        }
        return 'default';
    }

    /**
     * v3.0: 다중 게이트 등급 판정
     */
    private calculateGrade(
        score: number, volume: number, docCount: number, ratio: number, serpDifficulty: number
    ): GoldenGrade {
        // SSS: 점수 85+ AND 검색량 1000+ AND 문서수 5000 이하 AND 비율 5+
        if (score >= 85 && volume >= 1000 && docCount <= 5000 && ratio >= 5) return 'SSS';
        // SS: 점수 75+ AND 검색량 500+ AND 문서수 10000 이하 AND 비율 3+
        if (score >= 75 && volume >= 500 && docCount <= 10000 && ratio >= 3) return 'SS';
        // S: 점수 65+ AND 검색량 300+ AND 비율 2+
        if (score >= 65 && volume >= 300 && ratio >= 2) return 'S';
        // A: 점수 55+ AND 검색량 100+
        if (score >= 55 && volume >= 100) return 'A';
        // B: 점수 45+
        if (score >= 45) return 'B';
        // C: 점수 30+
        if (score >= 30) return 'C';
        return 'D';
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
