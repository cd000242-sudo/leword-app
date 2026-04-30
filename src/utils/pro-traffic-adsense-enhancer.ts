/**
 * 🚀 PRO 트래픽 헌터 AdSense 강화 wrapper
 *
 * 10명 오푸스 토론 결과: PRO와 황금이 동일 엔진을 공유. PRO만의 차별 가치 부재.
 * 해결: AdSense Hunter의 검증된 9개 게이트 + Publisher 0.40 + Reachability 시나리오를
 *       PRO 결과에 후처리로 적용 → 환상적 추정 제거 + 가치 게이트 통과 키워드만 노출.
 *
 * 적용 게이트:
 *   1. Publisher Revenue Factor ×0.40 (구글 60% 수수료 차감)
 *   2. 글쓰기 가능 게이트 (단일명사/시사/일회성뉴스 차단)
 *   3. YMYL × 비전문가 차단 (병원리뷰/주식초보)
 *   4. 시기 지난 차단 (2024 어버이날/갤럭시 s23 출시일)
 *   5. 인물 의존 차단 (아이유베개/나연 메이크업)
 *   6. 0클릭 SERP 위험도 (트래픽 -40% 할인)
 *   7. 검색의도 4분류 (정보/상업/거래/항해 + CTR 보정)
 *   8. 블루오션 5단계 (ultra-blue~crimson)
 *   9. AdSense Eligibility (도박/대출/의료 광고 거절 사전 경고)
 *   + Reachability 6/12/24개월 시나리오
 *   + 연평균 검색량 환산
 *   + 신뢰구간 ±오차
 */

import {
    isWritableKeyword,
    classifySearchIntent,
    calculateZeroClickRisk,
    calculateBlueOceanLevel,
    evaluateAdsenseEligibility,
    isPersonDependentKeyword,
    calculateReachabilityScenarios,
    calculateAnnualizedVolume,
    calculateRevenueConfidenceInterval,
    calculateSeasonalTiming,
    calculateAdsenseRPM,
    calculateYmylRisk,
    PUBLISHER_REVENUE_FACTOR,
    type BlueOceanResult,
    type ReachabilityScenarios,
    type SearchIntentResult,
    type ZeroClickRiskResult,
    type AdsenseEligibilityResult,
    type ConfidenceInterval,
    type AnnualizedVolume,
    type SeasonalTimingInfo,
} from './adsense-keyword-hunter';
import { evaluateKeywordSafety, estimateCPC } from './profit-golden-keyword-engine';
import { getCalibrationMultiplier } from './pro-hunter-v12/feedback-learner';
import { calculatePreferenceScore } from './pro-hunter-v12/preference-learner';

export interface ProEnhancedKeyword {
    // 원본 PRO 데이터 보존
    keyword: string;
    searchVolume: number;
    documentCount: number;
    estimatedCPC: number;
    grade: string;
    type?: string;
    category?: string;
    goldenRatio?: number;
    monetizationBlueprint?: any;

    // 🚀 AdSense 9-게이트 후처리 결과
    publisherRPM: number;             // Gross × 0.40
    publisherMonthlyRevenue: number;  // Publisher 실수익
    grossRPM: number;                  // 광고주 입찰 기준 (참고)
    blueOcean: BlueOceanResult;
    searchIntent: SearchIntentResult;
    zeroClickRisk: ZeroClickRiskResult;
    adsenseEligibility: AdsenseEligibilityResult;
    reachability: ReachabilityScenarios;
    annualizedVolume: AnnualizedVolume;
    seasonalTiming: SeasonalTimingInfo;
    revenueConfidenceInterval: ConfidenceInterval;
    revenueRangeAt12m: ConfidenceInterval;

    // 게이트 통과 사유 / 차단 사유
    gates: {
        writable: { passed: boolean; reason: string };
        personDependent: { passed: boolean; reason: string };
        ymylNoviceCombo: { passed: boolean; reason: string };
        eligibility: 'eligible' | 'restricted' | 'blocked';
    };

    // 🧠 사용자 학습 적용 (Phase 5)
    preferenceScore?: number;        // 0~1
    preferenceSummary?: string;

    // 종합 평가
    proEnhancedGrade: 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'BLOCKED';
    enhancedSummary: string;
}

export interface ProEnhanceOptions {
    blueOceanOnly?: boolean;
    excludeBlocked?: boolean;          // 광고 거절 키워드 제외
    excludePersonDependent?: boolean;  // 인물 의존 제외
    excludeNonWritable?: boolean;      // 글쓰기 불가 제외
    minPublisherRevenue?: number;      // 최소 Publisher 월수익
    excludeZeroClickHigh?: boolean;
}

/**
 * PRO 결과 키워드 1개를 AdSense 9-게이트로 강화
 */
export function enhanceProKeyword(input: {
    keyword: string;
    searchVolume: number;
    documentCount: number;
    estimatedCPC?: number;
    grade?: string;
    type?: string;
    category?: string;
    goldenRatio?: number;
    monetizationBlueprint?: any;
}): ProEnhancedKeyword {
    const sv = input.searchVolume || 0;
    const dc = input.documentCount || 0;
    const category = String(input.category || 'all');
    // CPC fallback: PRO에서 0 반환 시 카테고리/키워드 기반 추정
    const cpc = (input.estimatedCPC && input.estimatedCPC > 0)
        ? input.estimatedCPC
        : estimateCPC(input.keyword, category);

    // 1. 검색의도 분류
    const searchIntent = classifySearchIntent(input.keyword);

    // 2. 글쓰기 가능 게이트
    const writableCheck = isWritableKeyword(input.keyword);

    // 3. 인물 의존 차단
    const personCheck = isPersonDependentKeyword(input.keyword);

    // 4. YMYL × 비전문가 (writable 게이트에 통합되어 있음 — writable false 사유 확인)
    const ymylNoviceBlocked = !writableCheck.writable && writableCheck.reason.includes('YMYL');

    // 5. 0클릭 SERP 위험도
    const zeroClickRisk = calculateZeroClickRisk(input.keyword);

    // 6. 블루오션 등급
    const blueOcean = calculateBlueOceanLevel(sv, dc);

    // 7. 안전성 + YMYL
    const safety = evaluateKeywordSafety(input.keyword);
    const ymyl = calculateYmylRisk(input.keyword);

    // 8. AdSense Eligibility
    const adsenseEligibility = evaluateAdsenseEligibility({
        keyword: input.keyword,
        ymylRisk: ymyl.level,
        safety: safety.level,
        dataConfidence: sv >= 100 && dc > 0 ? 'high' : 'medium',
    });

    // 9. 시즌성 + 연평균
    const annualizedVolume = calculateAnnualizedVolume(input.keyword, sv);
    const seasonalTiming = calculateSeasonalTiming(input.keyword);

    // 10. RPM (Publisher 0.40 적용)
    const infoIntentScore = searchIntent.primary === 'informational' ? 70
        : searchIntent.primary === 'commercial' ? 50 : 30;
    const publisherRPM = calculateAdsenseRPM({
        keyword: input.keyword,
        category, cpc, infoIntentScore, ymylScore: ymyl.score,
        intentType: searchIntent.primary,
    });
    // Eligibility의 rpmFactor 추가 적용 (광고 거절 위험 반영)
    const adjustedPublisherRPM = Math.round(publisherRPM * adsenseEligibility.rpmFactor);
    const grossRPM = Math.round(publisherRPM / PUBLISHER_REVENUE_FACTOR);

    // 11. Reachability — 연평균 × 0클릭 할인 기준
    const adjustedAnnualVolume = Math.round(annualizedVolume.annualAverage * zeroClickRisk.trafficDiscountRatio);
    const googleShare = 0.25;  // 일반 평균
    const reachability = calculateReachabilityScenarios({
        searchVolume: adjustedAnnualVolume,
        competitionRatio: blueOcean.ratio,
        infoIntentScore,
        googleTrafficShare: googleShare,
        publisherRpm: adjustedPublisherRPM,
    });

    // 12. 100% 점유 가정 월수익 (참고용) — 🧠 카테고리 보정 계수 자동 적용
    const monthlyImpressions = sv * googleShare;
    const calibrationMultiplier = getCalibrationMultiplier(category);
    const publisherMonthlyRevenue = Math.round((monthlyImpressions * adjustedPublisherRPM) / 1000 * calibrationMultiplier);

    // 13. 신뢰구간
    const revenueConfidenceInterval = calculateRevenueConfidenceInterval(publisherMonthlyRevenue, {
        dataConfidence: sv >= 100 && dc > 0 ? 'high' : 'medium',
        intentConfidence: searchIntent.confidence,
    });
    const revenueRangeAt12m = calculateRevenueConfidenceInterval(reachability.month12.monthlyRevenue, {
        dataConfidence: sv >= 100 && dc > 0 ? 'high' : 'medium',
        intentConfidence: searchIntent.confidence,
    });

    // 14. 종합 등급 산정
    let proEnhancedGrade: ProEnhancedKeyword['proEnhancedGrade'];
    if (adsenseEligibility.status === 'blocked') {
        proEnhancedGrade = 'BLOCKED';
    } else if (
        publisherMonthlyRevenue >= 60000 && infoIntentScore >= 65 &&
        sv >= 800 && blueOcean.ratio >= 2 &&
        writableCheck.writable && !personCheck.dependent
    ) {
        proEnhancedGrade = 'SSS';
    } else if (
        publisherMonthlyRevenue >= 24000 && infoIntentScore >= 55 &&
        sv >= 400 && writableCheck.writable && !personCheck.dependent
    ) {
        proEnhancedGrade = 'SS';
    } else if (
        publisherMonthlyRevenue >= 8000 && infoIntentScore >= 45 &&
        sv >= 150 && writableCheck.writable
    ) {
        proEnhancedGrade = 'S';
    } else if (publisherMonthlyRevenue >= 1000 && writableCheck.writable && !personCheck.dependent) {
        proEnhancedGrade = 'A';
    } else {
        proEnhancedGrade = 'B';
    }

    // 15. 종합 요약
    const summaryParts: string[] = [];
    summaryParts.push(blueOcean.summary.split(' ')[0]);  // 블루오션 아이콘
    summaryParts.push(`Publisher ₩${(publisherMonthlyRevenue / 10000).toFixed(1)}만/월 (12m: ₩${(reachability.month12.monthlyRevenue / 10000).toFixed(1)}만)`);
    if (zeroClickRisk.level === 'high') summaryParts.push('🚫0클릭');
    if (personCheck.dependent) summaryParts.push('🎤인물의존');
    if (adsenseEligibility.status === 'blocked') summaryParts.push('🚫광고거절');
    const enhancedSummary = summaryParts.join(' · ');

    // 🧠 Phase 5: 사용자 선호 학습 점수 적용
    const prefScore = calculatePreferenceScore(input.keyword, category);

    return {
        keyword: input.keyword,
        searchVolume: sv,
        documentCount: dc,
        estimatedCPC: cpc,
        grade: input.grade || 'B',
        type: input.type,
        category,
        preferenceScore: prefScore.score,
        preferenceSummary: prefScore.summary,
        goldenRatio: input.goldenRatio,
        monetizationBlueprint: input.monetizationBlueprint,

        publisherRPM: adjustedPublisherRPM,
        publisherMonthlyRevenue,
        grossRPM,
        blueOcean,
        searchIntent,
        zeroClickRisk,
        adsenseEligibility,
        reachability,
        annualizedVolume,
        seasonalTiming,
        revenueConfidenceInterval,
        revenueRangeAt12m,

        gates: {
            writable: { passed: writableCheck.writable, reason: writableCheck.reason },
            personDependent: { passed: !personCheck.dependent, reason: personCheck.reason },
            ymylNoviceCombo: { passed: !ymylNoviceBlocked, reason: ymylNoviceBlocked ? writableCheck.reason : '' },
            eligibility: adsenseEligibility.status,
        },

        proEnhancedGrade,
        enhancedSummary,
    };
}

/**
 * 🔥 P1: PRO 결과를 7중 폴백(SmartBlock + AI 브리핑 + 다음 + 구글 + 검색광고RelKwd)으로 보강
 *  TOP N 시드에 대해 fetchRelatedKeywordsMulti 호출 → 신규 키워드 추가
 */
export async function enrichProWithFallback(
    enhanced: ProEnhancedKeyword[],
    options: { topSeeds?: number; maxNewKeywords?: number } = {}
): Promise<{ enhanced: ProEnhancedKeyword[]; addedCount: number }> {
    if (enhanced.length === 0) return { enhanced, addedCount: 0 };
    try {
        const { fetchRelatedKeywordsMulti } = await import('./related-keyword-fallback');
        const { EnvironmentManager } = await import('./environment-manager');
        const env = EnvironmentManager.getInstance().getConfig();
        const cfg = {
            naverSearchAdAccessLicense: env.naverSearchAdAccessLicense,
            naverSearchAdSecretKey: env.naverSearchAdSecretKey,
            naverSearchAdCustomerId: env.naverSearchAdCustomerId,
        };
        const topSeeds = enhanced.slice(0, options.topSeeds || 5);
        const existing = new Set(enhanced.map(e => e.keyword));
        const newKeywords: ProEnhancedKeyword[] = [];

        for (const seed of topSeeds) {
            try {
                const related = await fetchRelatedKeywordsMulti(seed.keyword, cfg);
                for (const r of related.slice(0, 30)) {
                    if (existing.has(r.keyword)) continue;
                    if (newKeywords.length >= (options.maxNewKeywords || 20)) break;
                    const e = enhanceProKeyword({
                        keyword: r.keyword,
                        searchVolume: r.monthlyVolume || 0,
                        documentCount: 0,
                        estimatedCPC: 0,
                        category: seed.category,
                    });
                    if (e.gates.writable.passed && e.gates.eligibility !== 'blocked') {
                        newKeywords.push(e);
                        existing.add(r.keyword);
                    }
                }
            } catch { /* skip individual failure */ }
        }
        console.log(`[PRO-ENHANCER] 🔥 7중 폴백: ${newKeywords.length}개 신규 키워드 추가 (SmartBlock+AI브리핑+다음+구글+RelKwd)`);
        return { enhanced: [...enhanced, ...newKeywords], addedCount: newKeywords.length };
    } catch (err: any) {
        console.warn('[PRO-ENHANCER] 폴백 보강 실패:', err?.message);
        return { enhanced, addedCount: 0 };
    }
}

/**
 * PRO 헌터 결과 배열 일괄 강화 + 옵션 기반 필터
 */
export function enhanceProResults(
    proKeywords: any[],
    options: ProEnhanceOptions = {}
): { enhanced: ProEnhancedKeyword[]; blockedCount: number; blockedReasons: Record<string, number> } {
    const enhanced: ProEnhancedKeyword[] = [];
    let blockedCount = 0;
    const blockedReasons: Record<string, number> = {};

    for (const kw of proKeywords) {
        const e = enhanceProKeyword({
            keyword: kw.keyword,
            searchVolume: kw.searchVolume || 0,
            documentCount: kw.documentCount || 0,
            estimatedCPC: kw.estimatedCPC || kw.cpc || 0,
            grade: kw.grade,
            type: kw.type,
            category: kw.category,
            goldenRatio: kw.goldenRatio,
            monetizationBlueprint: kw.monetizationBlueprint,
        });

        // 게이트 적용
        if (options.excludeNonWritable !== false && !e.gates.writable.passed) {
            blockedCount++;
            blockedReasons['글쓰기 불가'] = (blockedReasons['글쓰기 불가'] || 0) + 1;
            continue;
        }
        if (options.excludePersonDependent !== false && !e.gates.personDependent.passed) {
            blockedCount++;
            blockedReasons['인물 의존'] = (blockedReasons['인물 의존'] || 0) + 1;
            continue;
        }
        if (options.excludeBlocked !== false && e.gates.eligibility === 'blocked') {
            blockedCount++;
            blockedReasons['광고 거절'] = (blockedReasons['광고 거절'] || 0) + 1;
            continue;
        }
        if (options.excludeZeroClickHigh && e.zeroClickRisk.level === 'high') {
            blockedCount++;
            blockedReasons['0클릭 고위험'] = (blockedReasons['0클릭 고위험'] || 0) + 1;
            continue;
        }
        if (options.blueOceanOnly && !e.blueOcean.isBlueOcean) {
            blockedCount++;
            blockedReasons['블루오션 외'] = (blockedReasons['블루오션 외'] || 0) + 1;
            continue;
        }
        if (typeof options.minPublisherRevenue === 'number' && e.publisherMonthlyRevenue < options.minPublisherRevenue) {
            blockedCount++;
            blockedReasons['수익 미달'] = (blockedReasons['수익 미달'] || 0) + 1;
            continue;
        }

        enhanced.push(e);
    }

    return { enhanced, blockedCount, blockedReasons };
}
