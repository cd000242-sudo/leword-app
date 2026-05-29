/**
 * 🏠 네이버 홈판 노출 점수 엔진
 *
 * 10명 오푸스 토론 결과: 키워드+제목이 홈판 노출 70~80% 결정
 *
 * homeScore 공식:
 *   = (CTR잠재 × 0.35) + (신선도 × 0.30) + (카테고리적합도 × 0.20) + (빈자리 × 0.15)
 *
 * 70점+ = 홈판 상위 후보, 85점+ = 고가능성 후보
 */

export interface HomeScoreInput {
    keyword: string;
    searchVolume: number;
    documentCount: number;
    blogPublishCount24h?: number;
    daysSinceFirstAppear?: number;
    surgeRatio?: number;
    titleCtrScore?: number;
    userBlogCategory?: string;
    keywordCategory?: string;
    influencerCount?: number;
    vacancySlots?: number;
    // v2.42.59: 블로그 도메인 권위 컨텍스트 (네이버 노출 결정 50%+ 변수)
    blogAuthority?: BlogAuthorityInput;
}

export interface BlogAuthorityInput {
    monthlyVisitors?: number;     // 일평균 방문자 (월 평균 / 30)
    operationDays?: number;       // 블로그 운영 일수
    topicConsistency?: number;    // 주제 일관성 0~1 (해당 키워드 주제 누적 글 비율)
}

export interface HomeScoreResult {
    homeScore: number;
    breakdown: {
        ctrPotential: number;
        freshness: number;
        categoryFit: number;
        vacancy: number;
    };
    grade: 'IMPOSSIBLE' | 'HARD' | 'POSSIBLE' | 'EASY' | 'CERTAIN';
    summary: string;
    actionable: string[];
    // v2.42.59: 블로그 권위 컨텍스트 보정값 (같은 점수라도 체감 난이도 다름)
    contextualMultiplier?: number; // 0.3 (신생) ~ 1.5 (베테랑)
    estimatedExposureProbability?: number; // legacy field: 0~100 상대 가능성 지수
}

// v2.42.59: 블로그 권위 → 상대 가능성 보정 multiplier
//   네이버 노출은 키워드 점수만이 아니라 블로그 권위(C-Rank)에 좌우됨
//   같은 67점 키워드도 신생 블로그와 베테랑 블로그의 체감 난이도가 다르다.
export function calculateBlogAuthorityMultiplier(authority?: BlogAuthorityInput): number {
    if (!authority) return 1.0; // 미지정 시 중립
    let m = 0.5; // 기본 (정보 부재 = 보수적)

    // 일평균 방문자 (가장 결정적 — C-Rank 누적 신호)
    const v = authority.monthlyVisitors || 0;
    if (v >= 5000) m = 1.5;       // 일 5000+ = 최상위 베테랑
    else if (v >= 1000) m = 1.2;  // 일 1000+ = 베테랑
    else if (v >= 500) m = 1.0;   // 일 500+ = 안정
    else if (v >= 100) m = 0.7;   // 일 100+ = 성장기
    else if (v >= 30) m = 0.5;    // 일 30+ = 초기
    else if (v > 0) m = 0.3;      // 일 30 미만 = 신생

    // 운영 일수 보정 (긴 운영 = C-Rank 누적)
    const days = authority.operationDays || 0;
    if (days >= 1095) m *= 1.15;   // 3년+
    else if (days >= 365) m *= 1.05; // 1년+
    else if (days < 90) m *= 0.85;   // 3개월 미만

    // 주제 일관성 (전문 블로그 보너스)
    const consistency = authority.topicConsistency ?? 0;
    if (consistency >= 0.7) m *= 1.15; // 같은 주제 70%+
    else if (consistency >= 0.4) m *= 1.05;

    return Math.max(0.2, Math.min(2.0, m));
}

export function calculateHomeScore(input: HomeScoreInput): HomeScoreResult {
    // 1. CTR 잠재 (35점) — 미측정 시 0점
    let ctrPotential = 0;
    const titleScore = input.titleCtrScore;
    if (titleScore != null && titleScore > 0) {
        ctrPotential = Math.round((titleScore / 100) * 35);
        // v2.42.58: info 보너스 +5 → +2 (거의 모든 정보 키워드 매칭으로 변별력 0이던 문제)
        //   추가: titleScore >= 60 일 때만 적용 (저점 키워드 인플레이션 차단)
        if (titleScore >= 60) {
            const infoTokens = ['방법', '이유', '효능', '뜻', '의미', '추천', '비교', '후기', '가이드', '정리'];
            const lower = input.keyword.toLowerCase();
            if (infoTokens.some(t => lower.includes(t))) ctrPotential = Math.min(35, ctrPotential + 2);
        }
    }

    // 2. 신선도 (30점) — 미측정 시 0점
    let freshness = 0;
    const days = input.daysSinceFirstAppear;
    if (days != null) {
        if (days <= 1) freshness = 30;
        else if (days <= 3) freshness = 26;
        else if (days <= 7) freshness = 22;
        else if (days <= 14) freshness = 16;
        else if (days <= 30) freshness = 10;
        else if (days <= 60) freshness = 5;
        else freshness = 0;
    }
    // surge ratio 보너스
    const surge = input.surgeRatio || 1.0;
    if (surge >= 3.0) freshness = Math.min(30, freshness + 6);
    else if (surge >= 2.0) freshness = Math.min(30, freshness + 4);
    else if (surge >= 1.5) freshness = Math.min(30, freshness + 2);
    // 발행 경쟁 페널티
    const publishCount = input.blogPublishCount24h || 0;
    if (publishCount >= 100) freshness = Math.max(0, freshness - 10);
    else if (publishCount >= 50) freshness = Math.max(0, freshness - 5);
    else if (publishCount >= 20) freshness = Math.max(0, freshness - 2);

    // 3. 카테고리 적합도 (20점) — C-Rank 시뮬레이션
    // v2.42.58: default 14 → 10 (25개 시드 전부 14점 동률로 변별력 0이던 문제)
    //   'general' 카테고리도 빈 카테고리로 취급 (자동 분류기 fallback 값)
    let categoryFit = 10;
    const userCat = input.userBlogCategory && input.userBlogCategory !== 'naver-home' ? input.userBlogCategory : '';
    const skipKwCat = (c?: string) => !c || c === 'naver-home' || c === 'general';
    const kwCat = skipKwCat(input.keywordCategory) ? '' : (input.keywordCategory as string);

    if (userCat && kwCat) {
        if (userCat === kwCat) categoryFit = 20;
        else if (areCategoriesRelated(userCat, kwCat)) categoryFit = 16;
        else categoryFit = 8;
    } else if (!userCat && kwCat) {
        categoryFit = 12; // 사용자 미지정 + 키워드 카테고리만 — 14→12 (차별 확보)
    }

    // 4. 빈자리 (15점) — 미측정/측정실패 시 0점, slots ≤ 2 = HARD KILL
    let vacancy = 0;
    const slots = input.vacancySlots;
    const inf = input.influencerCount;
    let vacancyHardKill = false;
    // v2.42.58: null 처리 강화 (emptyVacancyResult 가 vacancySlots=null 반환하도록 수정됨)
    if (slots == null || typeof slots !== 'number' || !Number.isFinite(slots)) {
        vacancy = 0; // 측정 실패 = 점수 X (이전 5점 부여 버그 차단)
    } else if (slots >= 7 && (inf ?? 0) <= 1) vacancy = 15;
    else if (slots >= 5 && (inf ?? 0) <= 2) vacancy = 13;
    else if (slots >= 3 && (inf ?? 0) <= 3) vacancy = 9;
    else {
        vacancy = 0;
        vacancyHardKill = true;
    }

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

    // v2.42.58: 학습 multiplier overflow 차단 — 항목별 상한선 보존
    const ctrAdj = Math.min(35, ctrPotential * adjMultipliers.ctrPotential);
    const freshAdj = Math.min(30, freshness * adjMultipliers.freshness);
    const catAdj = Math.min(20, categoryFit * adjMultipliers.categoryFit);
    const vacAdj = Math.min(15, vacancy * adjMultipliers.vacancy);
    // vacancy hard kill = 빈자리 ≤2면 homeScore 무조건 0
    // v2.42.58: 최종 점수 100 clamp (multiplier 곱셈 후 overflow 방지)
    const homeScore = vacancyHardKill ? 0 : Math.min(100, Math.max(0, Math.round(ctrAdj + freshAdj + catAdj + vacAdj)));

    // 등급
    let grade: HomeScoreResult['grade'];
    let summary: string;
    if (vacancyHardKill) { grade = 'IMPOSSIBLE'; summary = '🛑 빅도메인 독점 — 신생 진입 불가 (vacancy ≤ 2)'; }
    else if (homeScore >= 85) { grade = 'CERTAIN'; summary = '🏠 홈판 고가능성 후보 — 발행 우선'; }
    else if (homeScore >= 70) { grade = 'EASY'; summary = '✅ 홈판 상위 후보 — 발행 추천'; }
    else if (homeScore >= 55) { grade = 'POSSIBLE'; summary = '⚠️ 홈판 후보 — 제목 최적화 필수'; }
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

    // v2.42.59: 블로그 권위 보정 — homeScore × multiplier = 상대 가능성 지수
    const contextualMultiplier = calculateBlogAuthorityMultiplier(input.blogAuthority);
    const estimatedExposureProbability = Math.min(100, Math.round(homeScore * contextualMultiplier));

    return {
        homeScore,
        breakdown: vacancyHardKill ? {
            ctrPotential: 0, freshness: 0, categoryFit: 0, vacancy: 0,
        } : {
            ctrPotential,
            freshness,
            categoryFit,
            vacancy,
        },
        grade,
        summary,
        actionable,
        contextualMultiplier,
        estimatedExposureProbability,
    };
}

// v2.42.34: 카테고리 풀 확장 — UI 25 카테고리 매칭 + 관련 분야 보너스
const RELATED_CATEGORY_PAIRS: Array<[string, string[]]> = [
    // 일상·리빙
    ['beauty', ['fashion', 'living', 'hobby']],
    ['fashion', ['beauty', 'shopping', 'wedding']],
    ['food', ['recipe', 'cooking', 'living', 'camping']],
    ['recipe', ['food', 'cooking', 'parenting']],
    ['living', ['interior', 'food', 'parenting', 'pet', 'garden']],
    ['interior', ['living', 'garden', 'hobby', 'realestate']],
    ['parenting', ['baby', 'living', 'health', 'education', 'recipe']],
    ['pet', ['living', 'health', 'hobby']],
    ['health', ['supplement', 'diet', 'medical', 'sports', 'parenting']],
    ['garden', ['interior', 'living', 'hobby']],
    // 비즈니스·재테크
    ['finance', ['realestate', 'career', 'tax', 'insurance']],
    ['career', ['finance', 'education', 'it']],
    ['realestate', ['finance', 'interior', 'living']],
    // 라이프·취미
    ['travel', ['camping', 'hobby', 'food']],
    ['camping', ['travel', 'food', 'hobby', 'pet']],
    ['hobby', ['camping', 'travel', 'interior', 'pet']],
    ['wedding', ['fashion', 'beauty', 'parenting']],
    ['car', ['camping', 'travel', 'sports']],
    // 콘텐츠·엔터
    ['entertainment', ['music', 'book', 'hobby']],
    ['music', ['entertainment', 'hobby']],
    ['book', ['education', 'entertainment', 'hobby']],
    ['game', ['it', 'hobby', 'entertainment']],
    ['sports', ['health', 'car', 'travel']],
    // 기술·교육
    ['it', ['laptop', 'smartphone', 'app', 'game', 'career']],
    ['education', ['parenting', 'book', 'career']],
    // 메타
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
