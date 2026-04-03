/**
 * 🎯 실시간 키워드 추천 API (Fresh Keywords API)
 * 
 * 72시간 내 수집된 키워드만 추천하는 API
 * 99% 실시간성 보장
 */

import {
    KeywordStorage,
    getKeywordStorage,
    StoredKeyword,
    CollectorSource,
    KeywordGrade,
    FilterOptions
} from './keyword-storage';
import { KeywordMetricsUpdater, getMetricsUpdater, GradeChange } from './keyword-metrics-updater';
import { KeywordCollectorScheduler, getCollectorScheduler, SchedulerStatus } from './keyword-collector-scheduler';
import { getTitleGenerator } from './keyword-title-generator';
import { detectSmartBlockType } from '../naver-smart-block-extractor';
import { fetchNaverBlogSearchResults, calculateDaysAgo, parseNaverDate } from '../top-blog-analyzer';
import { getNaverSerpSignal } from '../naver-serp-signal-api';
import { EnvironmentManager } from '../environment-manager';



// ============================================================================
// 인터페이스 정의
// ============================================================================

/**
 * 신선한 키워드 추천 옵션
 */
export interface FreshKeywordOptions {
    category?: string;               // 카테고리 필터
    sources?: CollectorSource[];     // 소스 필터
    minGrade?: KeywordGrade;         // 최소 등급 (기본: A)
    minFreshness?: number;           // 최소 신선도 0-100 (기본: 50)
    minSearchVolume?: number;        // 최소 검색량
    maxDocumentCount?: number;       // 최대 문서수
    minGoldenRatio?: number;         // 최소 황금비율
    count?: number;                  // 결과 개수 (기본: 20)
    includeRising?: boolean;         // 급등 키워드 포함 (기본: true)
}

/**
 * 신선한 키워드 결과
 */
export interface FreshKeyword extends StoredKeyword {
    freshness: number;               // 신선도 0-100 (100 = 방금 수집)
    isRising?: boolean;              // 급등 키워드 여부
    isEarlyBird?: boolean;           // 🚀 초기 선점 필승 키워드 여부 (급등 + 빈집)
    risingInfo?: {
        previousGrade: KeywordGrade;
        gradeJump: number;             // 등급 상승폭
    };
    nicheInfo?: {                    // 틈새 시장 정보 (New)
        score: number;                 // 틈새 점수 (높을수록 좋음)
        type: 'empty_house' | 'blue_ocean' | 'gold_mine' | 'none'; // 빈집털이, 블루오션, 꿀통
        competitionRate: number;       // 경쟁률 (문서수 / 검색량) - 낮을수록 좋음
        // v3.0: 진짜 빈집 감지 데이터
        avgPostAgeDays?: number;       // 상위 포스트 평균 나이 (일)
        oldPostRatio?: number;         // 6개월+ 오래된 글 비율 (%)
        hasSmartBlock?: boolean;       // 스마트블록 존재 여부
        hasInfluencer?: boolean;       // 인플루언서 탭 존재 여부
        emptyHouseReason?: string;     // 빈집 판정 사유
    };
    suggestedTitles?: string[];      // 킬러 타이틀 제안 (Old)
    intelligentTitles?: string[];    // AI 지능형 제목 (New)
    goldenBackground?: string;       // AI 황금 근거 (New)
    trendingReason?: string;         // 키워드가 급상승한 구체적 이유 (New)
    smartBlockType?: string;         // 스마트블록 타입 (person, place, movie, product, policy, etc.)
}

/**
 * 틈새 키워드 옵션
 */
export interface NicheKeywordOptions extends FreshKeywordOptions {
    minNicheScore?: number;          // 최소 틈새 점수
    targetTypes?: ('empty_house' | 'blue_ocean' | 'gold_mine')[];
}

/**
 * 추천 결과
 */
export interface FreshKeywordResult {
    keywords: FreshKeyword[];
    summary: {
        totalFound: number;
        validCount: number;            // 72시간 이내
        averageFreshness: number;      // 평균 신선도
        risingCount: number;           // 급등 키워드 수
        nicheCount: number;            // 틈새 키워드 수 (New)
        gradeDistribution: Record<KeywordGrade, number>;
    };
    systemStatus: {
        isCollectorRunning: boolean;
        lastCollectionAt: string | null;
        totalStoredKeywords: number;
    };
    timestamp: string;
}

/**
 * 시스템 상태
 */
export interface MassCollectionSystemStatus {
    storage: {
        totalKeywords: number;
        validKeywords: number;
        expiredKeywords: number;
        oldestKeyword: string | null;
        newestKeyword: string | null;
    };
    collector: SchedulerStatus;
    lastMetricsUpdate: string | null;
}

// ============================================================================
// 상수
// ============================================================================

const GRADE_ORDER: Record<KeywordGrade, number> = {
    'SSS': 6,
    'SS': 5,
    'S': 4,
    'A': 3,
    'B': 2,
    'C': 1
};

const VALIDITY_HOURS = 72;

// ============================================================================
// 유틸리티 함수
// ============================================================================

/**
 * 신선도 계산 (0-100)
 * 100 = 방금 수집, 0 = 72시간 지남
 */
function calculateFreshness(collectedAt: string): number {
    const collected = new Date(collectedAt).getTime();
    const now = Date.now();
    const age = now - collected;
    const maxAge = VALIDITY_HOURS * 60 * 60 * 1000; // 72시간 in ms

    if (age >= maxAge) return 0;

    return Math.round((1 - age / maxAge) * 100);
}

/**
 * 틈새 점수 및 타입 분석 (기본 — 비율만 사용, 빠름)
 */
function analyzeNicheBasic(searchVolume: number | null, documentCount: number | null): FreshKeyword['nicheInfo'] {
    const sv = searchVolume ?? 0;
    const dc = documentCount ?? 1;
    const competitionRate = dc / (sv || 1);
    const goldenRatio = sv / (dc || 1);

    let type: 'empty_house' | 'blue_ocean' | 'gold_mine' | 'none' = 'none';
    let score = 0;

    if (sv >= 300 && dc <= 2000 && goldenRatio >= 3) {
        type = 'empty_house';
        score = Math.min(100, 75 + (goldenRatio * 3));
    } else if (sv >= 3000 && goldenRatio >= 2.0) {
        type = 'gold_mine';
        score = Math.min(100, 70 + (goldenRatio * 3));
    } else if (sv >= 200 && goldenRatio >= 1.5) {
        type = 'blue_ocean';
        score = Math.min(100, 55 + (goldenRatio * 5));
    } else {
        score = Math.min(50, goldenRatio * 15);
    }

    return { score: Math.min(Math.round(score), 100), type, competitionRate };
}

/**
 * 🏚️ 진짜 빈집 감지 — 상위 포스트 나이 + SERP 신호 + 비율 종합 분석
 * 원클릭 빈집털이에서 호출됨. 키워드당 2-3초 소요.
 */
async function analyzeNicheDeep(
    keyword: string,
    searchVolume: number | null,
    documentCount: number | null
): Promise<FreshKeyword['nicheInfo']> {
    const sv = searchVolume ?? 0;
    const dc = documentCount ?? 1;
    const competitionRate = dc / (sv || 1);
    const goldenRatio = sv / (dc || 1);

    // 1단계: 비율 기반 기본 분석
    const basic = analyzeNicheBasic(searchVolume, documentCount);

    // 검색량 200 미만이면 심층 분석 스킵 (투자 가치 없음)
    if (sv < 200) return basic;

    try {
        const envManager = EnvironmentManager.getInstance();
        const config = envManager.getConfig();
        const clientId = config.naverClientId || '';
        const clientSecret = config.naverClientSecret || '';

        if (!clientId || !clientSecret) return basic;

        // 2단계: 상위 블로그 포스트 나이 분석 (네이버 블로그 검색 상위 5개)
        const topPosts = await fetchNaverBlogSearchResults(keyword, clientId, clientSecret, 5);
        let avgPostAgeDays = 0;
        let oldPostCount = 0;

        if (topPosts.length > 0) {
            const ages = topPosts.map(post => {
                const date = parseNaverDate(post.postDate);
                return calculateDaysAgo(date);
            });
            avgPostAgeDays = Math.round(ages.reduce((a, b) => a + b, 0) / ages.length);
            oldPostCount = ages.filter(age => age >= 180).length; // 6개월 이상
        }

        // 3단계: SERP 신호 분석
        const serpSignal = await getNaverSerpSignal(keyword);

        // 4단계: 종합 빈집 점수 계산
        // 포스트 나이 점수 (40%) — 오래될수록 빈집
        const ageScore = avgPostAgeDays >= 365 ? 100
            : avgPostAgeDays >= 180 ? 85
            : avgPostAgeDays >= 90 ? 60
            : avgPostAgeDays >= 30 ? 30 : 10;

        // 경쟁 장벽 점수 (30%) — 스마트블록/인플루언서 없을수록 좋음
        const barrierScore = 100
            - (serpSignal.hasSmartBlock ? 25 : 0)
            - (serpSignal.hasInfluencer ? 30 : 0)
            - (serpSignal.difficultyScore * 5);

        // 비율 점수 (30%) — 검색량 대비 문서수
        const ratioScore = goldenRatio >= 10 ? 100
            : goldenRatio >= 5 ? 80
            : goldenRatio >= 2 ? 60
            : goldenRatio >= 1 ? 40 : 15;

        const totalScore = Math.min(100, Math.round(
            ageScore * 0.40 + Math.max(0, barrierScore) * 0.30 + ratioScore * 0.30
        ));

        // 5단계: 타입 판정 (진짜 빈집 = 포스트 오래됨 + 장벽 낮음 + 비율 좋음)
        const oldPostRatio = topPosts.length > 0 ? Math.round((oldPostCount / topPosts.length) * 100) : 0;

        let type: 'empty_house' | 'blue_ocean' | 'gold_mine' | 'none' = 'none';
        let emptyHouseReason = '';

        // 빈집: 상위 포스트 평균 90일+ AND (인플루언서 없음 OR 비율 3+)
        if (avgPostAgeDays >= 90 && (!serpSignal.hasInfluencer || goldenRatio >= 3)) {
            type = 'empty_house';
            emptyHouseReason = `상위 글 평균 ${avgPostAgeDays}일 전 (${oldPostRatio}% 6개월+)`;
            if (!serpSignal.hasSmartBlock) emptyHouseReason += ' | 스마트블록 없음';
            if (!serpSignal.hasInfluencer) emptyHouseReason += ' | 인플루언서 없음';
        }
        // 꿀통: 검색량 많고 비율 좋음
        else if (sv >= 3000 && goldenRatio >= 2.0 && !serpSignal.hasInfluencer) {
            type = 'gold_mine';
            emptyHouseReason = `검색량 ${sv.toLocaleString()} + 비율 ${goldenRatio.toFixed(1)} + 인플루언서 없음`;
        }
        // 블루오션: 비율 적당 + 장벽 낮음
        else if (goldenRatio >= 1.5 && barrierScore >= 50) {
            type = 'blue_ocean';
            emptyHouseReason = `비율 ${goldenRatio.toFixed(1)} + 진입 장벽 낮음`;
        }

        return {
            score: totalScore,
            type,
            competitionRate,
            avgPostAgeDays,
            oldPostRatio,
            hasSmartBlock: serpSignal.hasSmartBlock,
            hasInfluencer: serpSignal.hasInfluencer,
            emptyHouseReason
        };

    } catch (error) {
        console.warn(`[NICHE-DEEP] ${keyword} 심층 분석 실패, 기본 분석 사용:`, error);
        return basic;
    }
}

// 하위 호환: 기존 호출 유지
function analyzeNiche(searchVolume: number | null, documentCount: number | null): FreshKeyword['nicheInfo'] {
    return analyzeNicheBasic(searchVolume, documentCount);
}

// ============================================================================
// FreshKeywordsAPI 클래스
// ============================================================================

export class FreshKeywordsAPI {
    private storage: KeywordStorage;
    private updater: KeywordMetricsUpdater;
    private scheduler: KeywordCollectorScheduler;
    private lastMetricsUpdate: Date | null = null;

    constructor() {
        this.storage = getKeywordStorage();
        this.updater = getMetricsUpdater();
        this.scheduler = getCollectorScheduler();
    }

    // ==========================================================================
    // 키워드 추천
    // ==========================================================================

    /**
     * 72시간 이내 신선한 키워드만 추천
     */
    async getFreshKeywords(options: FreshKeywordOptions = {}): Promise<FreshKeywordResult> {
        const {
            category,
            sources,
            minGrade = 'A',
            minFreshness = 50,
            minSearchVolume,
            maxDocumentCount,
            minGoldenRatio,
            count = 20,
            includeRising = true
        } = options;

        // 1. 유효한 키워드 조회
        const filterOptions: FilterOptions = {
            category,
            sources,
            minGrade,
            minSearchVolume,
            maxDocumentCount,
            minGoldenRatio,
            validOnly: true,
            sortBy: 'goldenRatio',
            sortOrder: 'desc'
        };

        const storedKeywords = await this.storage.getValidKeywords(filterOptions);

        // 2. 급등 키워드 조회
        let risingKeywords: GradeChange[] = [];
        if (includeRising) {
            risingKeywords = await this.updater.detectRisingKeywords();
        }

        const risingKeywordSet = new Set(risingKeywords.map(r => r.keyword));

        // 3. 신선도, 틈새 점수 계산 및 필터링
        let freshKeywords: FreshKeyword[] = storedKeywords
            .map(kw => {
                const freshness = calculateFreshness(kw.collectedAt);
                const rising = risingKeywords.find(r => r.keyword === kw.keyword);
                const niche = analyzeNiche(kw.searchVolume, kw.documentCount);

                const isEarlyBird = risingKeywordSet.has(kw.keyword) && kw.documentCount < 1000 && kw.searchVolume >= 500;

                return {
                    ...kw,
                    freshness,
                    isRising: risingKeywordSet.has(kw.keyword),
                    isEarlyBird,
                    risingInfo: rising ? {
                        previousGrade: rising.previousGrade,
                        gradeJump: GRADE_ORDER[rising.newGrade] - GRADE_ORDER[rising.previousGrade]
                    } : undefined,
                    nicheInfo: niche
                } as FreshKeyword;
            })
            .filter(kw => {
                // 1. 신선도 필터: 유효한 것만 (이미 Storage에서 isValid 필터링됨)
                if (kw.freshness < minFreshness && !kw.isRising) return false;

                // 2. 과거 연도 필터 (현재: 2025년)
                const currentYear = new Date().getFullYear();
                const yearMatches = kw.keyword.match(/20[1-2][0-9]/g);
                if (yearMatches) {
                    for (const yearStr of yearMatches) {
                        const year = parseInt(yearStr, 10);
                        if (year < currentYear) return false;
                    }
                }

                // 3. (옵션) 특정 시즌 지난 키워드 하드코딩 필터 (예시)
                if (kw.keyword.includes('아이폰16') || kw.keyword.includes('아이폰 16')) return false;

                return true;
            });

        // [추가 필터] 카테고리별 노이즈 제거
        freshKeywords = freshKeywords.filter(kw => {
            // 스타/연예 카테고리 노이즈: 계산기, 날씨, 단순 유틸 등
            if (category === 'entertainment' || category === 'star' || category === 'issue') {
                const noise = ['계산기', '날씨', '운세', '로또', '환율', '맞춤법', '전역일'];
                if (noise.some(n => kw.keyword.includes(n))) return false;
            }
            return true;
        });

        // 4. 정렬 로직 고도화: "신선도(Freshness)"를 최우선 가중치로 부여
        freshKeywords.sort((a, b) => {
            // 0순위: 급등 중인 Early Bird (방금 터진 실시간 이슈)
            if (a.isEarlyBird && !b.isEarlyBird) return -1;
            if (!a.isEarlyBird && b.isEarlyBird) return 1;

            // 1순위: 신선도 (Freshness) - 최근에 처음 수집된 것일수록 상단
            // 12시간 이내 수집된 아주 신선한 키워드는 빈집털이보다 우선할 수 있음
            if (a.freshness > 85 && b.freshness <= 85) return -1;
            if (a.freshness <= 85 && b.freshness > 85) return 1;

            // 2순위: 빈집털이 (Empty House)
            const aEmpty = a.nicheInfo?.type === 'empty_house';
            const bEmpty = b.nicheInfo?.type === 'empty_house';
            if (aEmpty && !bEmpty) return -1;
            if (!aEmpty && bEmpty) return 1;

            // 3순위: 꿀통 (Gold Mine)
            const aGold = a.nicheInfo?.type === 'gold_mine';
            const bGold = b.nicheInfo?.type === 'gold_mine';
            if (aGold && !bGold) return -1;
            if (!aGold && bGold) return 1;

            // 4순위: 신선도 + 틈새 점수 합산 가중치
            const aFinalScore = (a.nicheInfo?.score || 0) + (a.freshness * 0.5);
            const bFinalScore = (b.nicheInfo?.score || 0) + (b.freshness * 0.5);
            return bFinalScore - aFinalScore;
        });

        // 5. 결과 제한 및 타이틀 생성
        freshKeywords = freshKeywords.slice(0, count);

        // [New] 스마트블록 타입 감지 (Top Keywords Only)
        if (freshKeywords.length > 0) {
            console.log(`[FRESH-API] 스마트블록 타입 감지 시작 (${freshKeywords.length}개)...`);
            const enriched = await Promise.all(freshKeywords.map(async kw => {
                try {
                    const type = await detectSmartBlockType(kw.keyword);
                    // 타입이 있으면 로그 찍기
                    if (type) console.log(`[SMART-BLOCK] ${kw.keyword} -> ${type}`);
                    return { ...kw, smartBlockType: type || undefined };
                } catch (e) {
                    return kw;
                }
            }));
            freshKeywords = enriched as FreshKeyword[];
        }

        const titleGen = getTitleGenerator();
        freshKeywords = await Promise.all(freshKeywords.map(async kw => {
            // 1. 배경 분석 (비동기 - 네이버 연관검색어 등 실시간 데이터 반영)
            const goldenBackground = await titleGen.analyzeGoldenBackgroundAsync(kw);

            // 2. 키워드 객체 업데이트
            const kwWithBg = { ...kw, goldenBackground };

            // 3. 타이틀 생성 (분석된 배경 반영)
            const intelligentTitles = titleGen.generateTitles(kwWithBg, 3);

            return {
                ...kwWithBg,
                suggestedTitles: intelligentTitles, // 하위 호환성 유지
                intelligentTitles
            };
        }));

        // 6. 통계 계산
        const gradeDistribution: Record<KeywordGrade, number> = {
            'SSS': 0, 'SS': 0, 'S': 0, 'A': 0, 'B': 0, 'C': 0
        };

        let nicheCount = 0;

        for (const kw of freshKeywords) {
            gradeDistribution[kw.grade]++;
            if (kw.nicheInfo?.type !== 'none') nicheCount++;
        }

        const averageFreshness = freshKeywords.length > 0
            ? Math.round(freshKeywords.reduce((sum, kw) => sum + kw.freshness, 0) / freshKeywords.length)
            : 0;

        const risingCount = freshKeywords.filter(kw => kw.isRising).length;

        // 7. 시스템 상태
        const schedulerStatus = this.scheduler.getStatus();
        const stats = await this.storage.getStats();

        return {
            keywords: freshKeywords,
            summary: {
                totalFound: storedKeywords.length,
                validCount: freshKeywords.length,
                averageFreshness,
                risingCount,
                nicheCount,
                gradeDistribution
            },
            systemStatus: {
                isCollectorRunning: schedulerStatus.isRunning,
                lastCollectionAt: schedulerStatus.lastCollectionAt,
                totalStoredKeywords: stats.totalKeywords
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * 🏆 독보적 틈새 키워드("빈집털이") 추천
     * 경쟁은 현저히 낮고 수요는 있는 알짜 키워드만 발굴
     */
    async getNicheKeywords(options: Partial<NicheKeywordOptions> = {}): Promise<FreshKeywordResult> {
        // 빈집털이 및 꿀통 위주로 필터링
        const result = await this.getFreshKeywords({
            ...options,
            minGrade: undefined, // 등급 제한 없이 모두 조회 (데이터 부족 방지)
            minSearchVolume: 500, // 최소한의 검색량
            count: (options.count || 20) * 5, // 필터링을 고려하여 5배수 조회
            includeRising: true
        });

        // 틈새 타입이 있는 것만 필터링 (빈집털이, 꿀통, 블루오션)
        const targetTypes = options.targetTypes || ['empty_house', 'gold_mine', 'blue_ocean'];

        // 1차 필터링: 타겟 타입에 맞는 것만
        let filtered = result.keywords.filter(kw =>
            kw.nicheInfo && (targetTypes as string[]).includes(kw.nicheInfo.type)
        );

        // 만약 필터링 결과가 요청 개수보다 적으면, 황금비율 1.5 이상인 키워드만 보충
        if (filtered.length < (options.count || 20)) {
            const others = result.keywords
                .filter(kw => !filtered.includes(kw) && (kw.goldenRatio || 0) >= 1.5)
                .sort((a, b) => (b.goldenRatio || 0) - (a.goldenRatio || 0));
            filtered = [...filtered, ...others];
        }

        result.keywords = filtered;

        // 🏚️ v3.0: 상위 키워드에 대해 진짜 빈집 감지 (상위 포스트 나이 + SERP 분석)
        const deepAnalysisCount = Math.min(filtered.length, options.count || 20);
        const deepTargets = filtered.slice(0, deepAnalysisCount);
        console.log(`[NICHE] 🏚️ 심층 빈집 분석 시작: ${deepTargets.length}개 키워드`);

        for (let i = 0; i < deepTargets.length; i++) {
            const kw = deepTargets[i];
            try {
                const deepResult = await analyzeNicheDeep(kw.keyword, kw.searchVolume, kw.documentCount);
                kw.nicheInfo = deepResult;
                console.log(`[NICHE] ${i + 1}/${deepTargets.length} ${kw.keyword}: ${deepResult.type} (${deepResult.score}점) ${deepResult.emptyHouseReason || ''}`);
            } catch (err) {
                console.warn(`[NICHE] ${kw.keyword} 심층 분석 실패:`, err);
            }
            // Rate limit (네이버 API 보호)
            if (i < deepTargets.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }

        // 심층 분석 후 빈집이 아닌 것 재필터링 (type이 none으로 바뀐 것 제거)
        result.keywords = result.keywords.filter(kw =>
            kw.nicheInfo && kw.nicheInfo.type !== 'none'
        );

        // 틈새 점수순 재정렬
        result.keywords.sort((a, b) => (b.nicheInfo?.score || 0) - (a.nicheInfo?.score || 0));

        // [데이터 부족 시 자동 수집 트리거]
        // 요청한 개수보다 결과가 적으면, 강제로 수집기를 한 번 돌리고 재시도한다 (최대 1회)
        if (options.count && result.keywords.length < options.count && !options['isRetry']) {
            console.log('📉 키워드 부족으로 인한 긴급 수집 시작...');
            try {
                await this.scheduler.collectNow(); // 수집 실행 (약 3-5초 소요 예상)

                // 🆕 수집된 키워드의 메트릭(검색량 등)이 없으면 필터링되므로, 즉시 분석 실행
                console.log('📈 긴급 메트릭스 갱신 시작...');
                await this.updater.updateAllMetrics();

                // 재시도
                const retryResult = await this.getFreshKeywords({
                    ...options,
                    minGrade: undefined,
                    minSearchVolume: 500,
                    count: (options.count || 20) * 5,
                    includeRising: true
                });

                // 재시도 결과 병합 (중복 제거)
                const existingIds = new Set(result.keywords.map(k => k.keyword));
                for (const kw of retryResult.keywords) {
                    if (!existingIds.has(kw.keyword)) {
                        result.keywords.push(kw);
                        existingIds.add(kw.keyword);
                    }
                }

                // 다시 필터링 및 정렬
                const targetTypes = options.targetTypes || ['empty_house', 'gold_mine', 'blue_ocean'];
                let filtered = result.keywords.filter(kw =>
                    kw.nicheInfo && (targetTypes as string[]).includes(kw.nicheInfo.type)
                );

                if (filtered.length < options.count) {
                    const others = result.keywords
                        .filter(kw => !filtered.includes(kw))
                        .sort((a, b) => (b.goldenRatio || 0) - (a.goldenRatio || 0));
                    filtered = [...filtered, ...others];
                }
                result.keywords = filtered;

            } catch (e) {
                console.error('Auto-collect failed during keyword fetch', e);
            }
        }

        // 개수 조정
        if (options.count) {
            result.keywords = result.keywords.slice(0, options.count);
        }

        result.summary.validCount = result.keywords.length;
        result.summary.nicheCount = result.keywords.length;

        return result;
    }

    /**
     * 카테고리별 신선한 키워드 추천
     */
    async getFreshKeywordsByCategory(
        category: string,
        count: number = 10
    ): Promise<FreshKeywordResult> {
        return this.getFreshKeywords({
            category,
            count,
            minGrade: 'B',
            minFreshness: 30
        });
    }

    /**
     * 급등 키워드만 추천
     */
    async getRisingKeywords(count: number = 10): Promise<FreshKeywordResult> {
        const result = await this.getFreshKeywords({
            count: count * 3, // 필터링을 위해 더 많이 조회
            minGrade: 'C',
            minFreshness: 0,
            includeRising: true
        });

        // 급등 키워드만 필터링
        result.keywords = result.keywords.filter(kw => kw.isRising).slice(0, count);
        result.summary.validCount = result.keywords.length;
        result.summary.risingCount = result.keywords.length;

        return result;
    }

    /**
     * 블루오션 키워드 추천 (높은 황금비율 + 낮은 문서수)
     */
    async getBlueOceanKeywords(count: number = 10): Promise<FreshKeywordResult> {
        return this.getFreshKeywords({
            count,
            minGrade: 'S',
            minGoldenRatio: 1.0,
            maxDocumentCount: 10000,
            minFreshness: 30
        });
    }

    // ==========================================================================
    // 시스템 제어
    // ==========================================================================

    /**
     * 수집 시스템 시작
     */
    startCollection(): void {
        this.scheduler.start();
    }

    /**
     * 수집 시스템 중지
     */
    stopCollection(): void {
        this.scheduler.stop();
    }

    /**
     * 즉시 수집 실행
     */
    async collectNow(): Promise<void> {
        await this.scheduler.collectNow();
    }

    /**
     * 메트릭스 즉시 갱신
     */
    async updateMetricsNow(): Promise<void> {
        await this.updater.updateAllMetrics();
        this.lastMetricsUpdate = new Date();
    }

    /**
     * 만료 키워드 정리
     */
    async cleanupExpired(): Promise<number> {
        return this.storage.cleanupExpired();
    }

    // ==========================================================================
    // 시스템 상태
    // ==========================================================================

    /**
     * 시스템 전체 상태 조회
     */
    async getSystemStatus(): Promise<MassCollectionSystemStatus> {
        const stats = await this.storage.getStats();
        const schedulerStatus = this.scheduler.getStatus();

        return {
            storage: {
                totalKeywords: stats.totalKeywords,
                validKeywords: stats.validKeywords,
                expiredKeywords: stats.expiredKeywords,
                oldestKeyword: stats.oldestKeyword || null,
                newestKeyword: stats.newestKeyword || null
            },
            collector: schedulerStatus,
            lastMetricsUpdate: this.lastMetricsUpdate?.toISOString() || null
        };
    }

    /**
     * 저장소 통계 조회
     */
    async getStorageStats() {
        return this.storage.getStats();
    }
}

// ============================================================================
// 싱글톤 인스턴스
// ============================================================================

let apiInstance: FreshKeywordsAPI | null = null;

/**
 * 싱글톤 API 인스턴스 가져오기
 */
export function getFreshKeywordsAPI(): FreshKeywordsAPI {
    if (!apiInstance) {
        apiInstance = new FreshKeywordsAPI();
    }
    return apiInstance;
}

/**
 * API 인스턴스 리셋 (테스트용)
 */
export function resetFreshKeywordsAPI(): void {
    apiInstance = null;
}
