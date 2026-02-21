import { splitKeywordSemantically } from './semantic-splitter';
import { generateQueryPatterns } from './pattern-generator';
import { classifyKeywordIntent, getNaverKeywordSearchVolumeSeparate, getNaverSerpSignal } from './naver-datalab-api';
import { getNaverAutocompleteKeywords } from './naver-autocomplete';

/**
 * Master Discovery Protocol (MDP) Engine v2.0
 * 6단계 키워드 발굴 파이프라인을 총괄합니다.
 */

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
    cvi?: number;   // Commercial Value Index
    cpc?: number;   // Estimated CPC
}

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

                        // Phase 3 Upgrade: 수익성 모델링
                        // 1. Intent Weight 설정
                        let intentWeight = 0.8;
                        if (intentInfo.intent === 'Commercial') intentWeight = 1.5;
                        else if (intentInfo.intent === 'Transactional') intentWeight = 1.2;
                        else if (intentInfo.intent === 'Navigational') intentWeight = 0.5;

                        // 2. CVI (Commercial Value Index) 계산
                        const compIdx = parseFloat(sig.competition || '10');
                        const cvi = (totalVolume * (compIdx / 100) * intentWeight) / 10;

                        // 3. CPC 추정 (단순 모델)
                        const estimatedCPC = Math.round((compIdx / 100) * 1500 * intentWeight);

                        // 점수 계산 (개편): 기본 점수(70%) + 수익성 점수(30%)
                        const basicScore = (Math.log10(totalVolume + 1) * 20) + (Math.min(10, goldenRatio) * 6);
                        const monetizationScore = Math.min(40, Math.log10(cvi + 1) * 20);
                        const finalScore = (basicScore * 0.7) + (monetizationScore * 0.3);

                        const result: MDPResult = {
                            keyword: sig.keyword,
                            intent: intentInfo.intent,
                            intentBadge: intentInfo.badge,
                            searchVolume: totalVolume,
                            documentCount: docCount,
                            goldenRatio: parseFloat(goldenRatio.toFixed(2)),
                            score: parseFloat(finalScore.toFixed(2)),
                            // Phase 2 Data
                            hasSmartBlock: serpSignal.hasSmartBlock,
                            hasViewSection: serpSignal.hasViewSection,
                            hasInfluencer: serpSignal.hasInfluencer,
                            difficultyScore: serpSignal.difficultyScore,
                            // Phase 3 Data
                            cvi: parseFloat(cvi.toFixed(2)),
                            cpc: estimatedCPC
                        };

                        yield result;
                        count++;

                        // Step 6: Recursive Expansion (황금 키워드면 다시 큐에 삽입)
                        // v2.0: 시드와의 관련성 유지를 위해 단순 점수외에 패턴 일치 여부 등 고려 가능 (향후 고도화)
                        if (goldenRatio > 2.0 && count < options.limit) {
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
