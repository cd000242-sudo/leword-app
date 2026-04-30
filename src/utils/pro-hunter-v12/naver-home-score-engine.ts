/**
 * 🏠 네이버 홈판 노출 점수 엔진
 *
 * 10명 오푸스 토론 결과: 키워드+제목이 홈판 노출 70~80% 결정
 *
 * homeScore 공식:
 *   = (CTR잠재 × 0.35) + (신선도 × 0.30) + (카테고리적합도 × 0.20) + (빈자리 × 0.15)
 *
 * 70점+ = 홈판 진입 가능, 85점+ = 진입 거의 확실
 */

export interface HomeScoreInput {
    keyword: string;
    searchVolume: number;
    documentCount: number;
    blogPublishCount24h?: number;   // 어제 같은 키워드로 발행된 글 수
    daysSinceFirstAppear?: number;  // 키워드 첫 등장 후 일수
    surgeRatio?: number;             // 1시간 vs 24시간 검색량 비율
    titleCtrScore?: number;          // 제목 CTR 점수 (0~100)
    userBlogCategory?: string;       // 사용자 블로그 카테고리
    keywordCategory?: string;        // 키워드 카테고리
    influencerCount?: number;        // 검색 1페이지 인플루언서 수
    vacancySlots?: number;           // 빈자리 (0~10)
}

export interface HomeScoreResult {
    homeScore: number;                  // 0~100
    breakdown: {
        ctrPotential: number;             // 0~35
        freshness: number;                  // 0~30
        categoryFit: number;                // 0~20
        vacancy: number;                    // 0~15
    };
    grade: 'IMPOSSIBLE' | 'HARD' | 'POSSIBLE' | 'EASY' | 'CERTAIN';
    summary: string;
    actionable: string[];                 // 추천 액션
}

export function calculateHomeScore(input: HomeScoreInput): HomeScoreResult {
    // 1. CTR 잠재 (35점)
    let ctrPotential = 0;
    const titleScore = input.titleCtrScore || 50;  // 제목 미입력시 평균
    ctrPotential = Math.round((titleScore / 100) * 35);
    // 정보형 키워드 가산 (방법/이유/효능 등)
    const infoTokens = ['방법', '이유', '효능', '뜻', '의미', '추천', '비교'];
    const lower = input.keyword.toLowerCase();
    if (infoTokens.some(t => lower.includes(t))) ctrPotential = Math.min(35, ctrPotential + 3);

    // 2. 신선도 (30점) — 가장 중요
    let freshness = 0;
    const days = input.daysSinceFirstAppear ?? 30;
    if (days <= 1) freshness = 30;        // 오늘 처음
    else if (days <= 3) freshness = 25;
    else if (days <= 7) freshness = 18;
    else if (days <= 14) freshness = 10;
    else if (days <= 30) freshness = 5;
    else freshness = 0;
    // surge ratio 보너스
    const surge = input.surgeRatio || 1.0;
    if (surge >= 3.0) freshness = Math.min(30, freshness + 5);
    else if (surge >= 2.0) freshness = Math.min(30, freshness + 3);
    // 발행 경쟁 페널티 (어제 100명+가 발행했으면 신선도 ↓)
    const publishCount = input.blogPublishCount24h || 0;
    if (publishCount >= 100) freshness = Math.max(0, freshness - 10);
    else if (publishCount >= 50) freshness = Math.max(0, freshness - 5);
    else if (publishCount >= 20) freshness = Math.max(0, freshness - 2);

    // 3. 카테고리 적합도 (20점) — C-Rank 시뮬레이션
    // 'naver-home'은 모드 표시이므로 카테고리 매칭에서 제외 (사용자 블로그만 비교)
    let categoryFit = 12;  // 기본 (카테고리 미입력 시 중립)
    const userCat = input.userBlogCategory && input.userBlogCategory !== 'naver-home' ? input.userBlogCategory : '';
    const kwCat = input.keywordCategory && input.keywordCategory !== 'naver-home' ? input.keywordCategory : '';

    if (userCat && kwCat) {
        if (userCat === kwCat) categoryFit = 20;
        else if (areCategoriesRelated(userCat, kwCat)) categoryFit = 15;
        else categoryFit = 5;
    } else if (!userCat && kwCat) {
        // 사용자 카테고리 미지정 — 키워드 카테고리만 알 때는 중립 (12)
        categoryFit = 12;
    }

    // 4. 빈자리 (15점) — 검색 1페이지 분석
    let vacancy = 8;  // 기본
    const slots = input.vacancySlots ?? 5;
    const inf = input.influencerCount ?? 3;
    if (slots >= 7 && inf <= 1) vacancy = 15;       // 빈자리 많음 + 인플루언서 거의 없음
    else if (slots >= 5 && inf <= 2) vacancy = 12;
    else if (slots >= 3 && inf <= 3) vacancy = 8;
    else if (slots >= 1) vacancy = 4;
    else vacancy = 0;

    // 학습된 가중치 적용 (Phase F — 발행 후 노출 추적 기반)
    let adjMultipliers = { ctrPotential: 1, freshness: 1, categoryFit: 1, vacancy: 1 };
    try {
        const { getWeightAdjustments } = require('./home-exposure-tracker');
        const adj = getWeightAdjustments();
        if (adj && adj.confidence > 0.2) {
            adjMultipliers = {
                ctrPotential: adj.ctrPotential || 1,
                freshness: adj.freshness || 1,
                categoryFit: adj.categoryFit || 1,
                vacancy: adj.vacancy || 1,
            };
        }
    } catch { /* 학습 데이터 없음 */ }

    const ctrAdj = ctrPotential * adjMultipliers.ctrPotential;
    const freshAdj = freshness * adjMultipliers.freshness;
    const catAdj = categoryFit * adjMultipliers.categoryFit;
    const vacAdj = vacancy * adjMultipliers.vacancy;
    const homeScore = Math.round(ctrAdj + freshAdj + catAdj + vacAdj);

    // 등급
    let grade: HomeScoreResult['grade'];
    let summary: string;
    if (homeScore >= 85) { grade = 'CERTAIN'; summary = '🏠 홈판 진입 거의 확실 — 즉시 발행'; }
    else if (homeScore >= 70) { grade = 'EASY'; summary = '✅ 홈판 진입 쉬움 — 발행 추천'; }
    else if (homeScore >= 55) { grade = 'POSSIBLE'; summary = '⚠️ 홈판 진입 가능 — 제목 최적화 필수'; }
    else if (homeScore >= 35) { grade = 'HARD'; summary = '🔴 홈판 진입 어려움 — 신선도/제목 문제'; }
    else { grade = 'IMPOSSIBLE'; summary = '💀 홈판 진입 불가 — 다른 키워드 권장'; }

    // 액션 가이드
    const actionable: string[] = [];
    if (ctrPotential < 20) actionable.push(`📝 제목 CTR 점수 부족 (${titleScore}/100) — 12 패턴 적용 필요`);
    if (freshness < 15) {
        if (days > 14) actionable.push(`⏰ 키워드 신선도 부족 (${days}일 경과) — 더 신선한 키워드 권장`);
        if (publishCount >= 50) actionable.push(`🚫 발행 경쟁 과열 (어제 ${publishCount}건) — 차별화 제목 필수`);
    }
    if (categoryFit < 10) actionable.push(`🎯 카테고리 불일치 — 블로그 전문 카테고리와 일치하는 키워드 권장`);
    if (vacancy < 5) actionable.push(`👤 인플루언서 점유 (${inf}/10) — 진입 매우 어려움`);
    if (actionable.length === 0) actionable.push(`🚀 모든 조건 통과 — 즉시 발행 권장`);

    return {
        homeScore,
        breakdown: {
            ctrPotential,
            freshness,
            categoryFit,
            vacancy,
        },
        grade,
        summary,
        actionable,
    };
}

const RELATED_CATEGORY_PAIRS: Array<[string, string[]]> = [
    ['beauty', ['fashion', 'living']],
    ['fashion', ['beauty', 'shopping']],
    ['food', ['recipe', 'cooking', 'living']],
    ['recipe', ['food', 'cooking']],
    ['parenting', ['baby', 'living', 'health']],
    ['health', ['supplement', 'diet', 'medical']],
    ['it', ['laptop', 'smartphone', 'app']],
    ['naver-home', ['all']],
];

function areCategoriesRelated(a: string, b: string): boolean {
    if (a === b) return true;
    for (const [base, related] of RELATED_CATEGORY_PAIRS) {
        if (a === base && related.includes(b)) return true;
        if (b === base && related.includes(a)) return true;
    }
    return false;
}
