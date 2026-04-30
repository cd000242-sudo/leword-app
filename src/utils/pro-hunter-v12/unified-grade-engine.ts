/**
 * 🏆 통합 등급 엔진 — PRO 트래픽 + AdSense 수익 + 홈판 노출
 *
 * 한 키워드의 3차원 점수를 가중평균 → 종합 등급 (S+/S/A/B/C)
 *
 * 가중치:
 *   - PRO 트래픽 (방문자 잠재): 30%
 *   - AdSense 수익 (월 광고수익): 30%
 *   - 홈판 노출 (검색 1페이지 진입): 40%
 *
 * 등급 컷:
 *   - S+ (90~100): 즉시 발행 권장
 *   - S  (80~89): 강력 추천
 *   - A  (65~79): 추천
 *   - B  (50~64): 보통
 *   - C  (~49):  비추천
 */

export interface UnifiedGradeInput {
    keyword: string;
    proTrafficScore?: number;        // 0~100 (PRO Hunter mdpScore 등)
    adsenseValueScore?: number;      // 0~100 (AdSense Hunter valueScore)
    homeScore?: number;              // 0~100 (homeScore)
    monthlyRevenue?: number;         // 원 (참고용)
    searchVolume?: number;           // 참고용
}

export interface UnifiedGradeResult {
    keyword: string;
    unifiedScore: number;            // 0~100
    grade: 'S+' | 'S' | 'A' | 'B' | 'C';
    breakdown: {
        proTraffic: number;
        adsenseValue: number;
        home: number;
    };
    recommendation: string;
    available: { pro: boolean; adsense: boolean; home: boolean };
    coverageWarning?: string;
}

const W_PRO = 0.30;
const W_ADSENSE = 0.30;
const W_HOME = 0.40;

export function calculateUnifiedGrade(input: UnifiedGradeInput): UnifiedGradeResult {
    const pro = clamp(input.proTrafficScore ?? -1, -1, 100);
    const ads = clamp(input.adsenseValueScore ?? -1, -1, 100);
    const home = clamp(input.homeScore ?? -1, -1, 100);

    const available = {
        pro: pro >= 0,
        adsense: ads >= 0,
        home: home >= 0,
    };

    // 가중치 동적 재분배 (없는 차원 제외)
    let totalW = 0;
    if (available.pro) totalW += W_PRO;
    if (available.adsense) totalW += W_ADSENSE;
    if (available.home) totalW += W_HOME;

    let weighted = 0;
    if (available.pro) weighted += pro * (W_PRO / totalW);
    if (available.adsense) weighted += ads * (W_ADSENSE / totalW);
    if (available.home) weighted += home * (W_HOME / totalW);

    const unifiedScore = totalW === 0 ? 0 : Math.round(weighted);

    let grade: UnifiedGradeResult['grade'];
    let recommendation: string;
    if (unifiedScore >= 90) { grade = 'S+'; recommendation = '🏆 즉시 발행 권장 — 3차원 모두 우수'; }
    else if (unifiedScore >= 80) { grade = 'S'; recommendation = '🚀 강력 추천 — 발행 시 큰 효과'; }
    else if (unifiedScore >= 65) { grade = 'A'; recommendation = '✅ 추천 — 발행 가치 충분'; }
    else if (unifiedScore >= 50) { grade = 'B'; recommendation = '⚠️ 보통 — 제목/콘텐츠 차별화 필요'; }
    else { grade = 'C'; recommendation = '🔴 비추천 — 다른 키워드 검토'; }

    let coverageWarning: string | undefined;
    const missing = [
        !available.pro ? 'PRO' : null,
        !available.adsense ? 'AdSense' : null,
        !available.home ? '홈판' : null,
    ].filter(Boolean);
    if (missing.length > 0) {
        coverageWarning = `${missing.join('/')} 점수 누락 — 통합 점수 신뢰도 ↓`;
    }

    return {
        keyword: input.keyword,
        unifiedScore,
        grade,
        breakdown: {
            proTraffic: available.pro ? Math.round(pro) : 0,
            adsenseValue: available.adsense ? Math.round(ads) : 0,
            home: available.home ? Math.round(home) : 0,
        },
        recommendation,
        available,
        coverageWarning,
    };
}

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

/**
 * 배치 통합 등급 — 결과를 등급 → 점수 순 정렬
 */
export function batchUnifiedGrade(inputs: UnifiedGradeInput[]): UnifiedGradeResult[] {
    return inputs
        .map(calculateUnifiedGrade)
        .sort((a, b) => b.unifiedScore - a.unifiedScore);
}
