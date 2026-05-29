import { predictTitleCtr, TitleCtrResult } from './title-ctr-predictor';

export type HomePublishStatus = 'PUBLISH_NOW' | 'WRITE_TODAY' | 'WATCH' | 'SKIP';

export interface HomePublishPlannerInput {
    keyword: string;
    category?: string;
    searchVolume?: number | null;
    documentCount?: number | null;
    homeScore?: number | null;
    homeGrade?: string | null;
    titleCandidates?: Array<Partial<TitleCtrResult> & { title: string }>;
    valueScore?: number | null;
    qualityScore?: number | null;
    valueGrade?: string | null;
    vacancySlots?: number | null;
    influencerCount?: number | null;
    bigDomainCount?: number | null;
    surgeRatio?: number | null;
    blogPublishCount24h?: number | null;
    daysSinceFirstAppear?: number | null;
}

export interface HomeTitleOption {
    title: string;
    role: 'primary' | 'backup' | 'safe';
    ctrScore: number;
    reason: string;
}

export interface HomePublishPlan {
    status: HomePublishStatus;
    statusLabel: string;
    priorityScore: number;
    confidence: 'high' | 'medium' | 'low';
    primaryTitle: string;
    titleOptions: HomeTitleOption[];
    hookAngle: string;
    firstParagraph: string;
    outline: string[];
    mustInclude: string[];
    avoid: string[];
    publishWindow: string;
    reasons: string[];
}

const OVERCLAIM_RE = /(월\s*\d+\s*만원|연봉\s*\d+|100만원|5kg|미친|충격|손해\s*막심|무조건|보장|확정)/i;
const POLICY_RE = /(지원금|보조금|장려금|바우처|급여|수당|환급|감면|면제|정책|복지|신청|대상|자격|서류|고용|청년|소상공인|육아|출산)/;
const COMMERCE_RE = /(추천|가격|비교|후기|리뷰|순위|할인|특가|내돈내산|구매|렌탈|대여)/;
const TRAVEL_RE = /(여행|맛집|축제|코스|숙소|호텔|항공|예약|가볼만한|일정)/;
const ENTERTAINMENT_RE = /(드라마|영화|예능|출연진|회차|결말|다시보기|OTT|방송|가수|배우|콘서트)/;
const HEALTH_RE = /(건강|증상|원인|효능|운동|다이어트|음식|면역|병원|관리법)/;

function clamp(n: number, min = 0, max = 100): number {
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
}

function cleanKeyword(keyword: string): string {
    return String(keyword || '').replace(/\s+/g, ' ').trim();
}

function unique<T>(arr: T[]): T[] {
    return Array.from(new Set(arr.filter(Boolean)));
}

function detectIntent(keyword: string, category?: string): 'policy' | 'commerce' | 'travel' | 'entertainment' | 'health' | 'general' {
    const text = `${keyword} ${category || ''}`;
    if (POLICY_RE.test(text)) return 'policy';
    if (TRAVEL_RE.test(text)) return 'travel';
    if (ENTERTAINMENT_RE.test(text)) return 'entertainment';
    if (HEALTH_RE.test(text)) return 'health';
    if (COMMERCE_RE.test(text)) return 'commerce';
    return 'general';
}

function fallbackTitles(keyword: string, intent: ReturnType<typeof detectIntent>): string[] {
    const kw = cleanKeyword(keyword);
    if (intent === 'policy') {
        return [
            `${kw} 신청 대상과 자격 조건 총정리`,
            `${kw} 신청 기간·준비서류 한눈에 정리`,
            `${kw} 놓치기 쉬운 변경사항과 신청 방법`,
        ];
    }
    if (intent === 'commerce') {
        return [
            `${kw} 추천 기준과 가격 비교 핵심 정리`,
            `${kw} 후기에서 많이 갈리는 장단점`,
            `${kw} 구매 전 체크해야 할 5가지`,
        ];
    }
    if (intent === 'travel') {
        return [
            `${kw} 일정·코스·예약 전 체크할 것`,
            `${kw} 처음 가는 사람을 위한 핵심 정리`,
            `${kw} 비용과 동선까지 한 번에 정리`,
        ];
    }
    if (intent === 'entertainment') {
        return [
            `${kw} 출연진·회차·다시보기 정리`,
            `${kw} 줄거리와 관전 포인트 한눈에 보기`,
            `${kw} 최신 반응과 놓친 장면 정리`,
        ];
    }
    if (intent === 'health') {
        return [
            `${kw} 원인과 관리법, 오늘 확인할 것`,
            `${kw} 증상별 체크 포인트 정리`,
            `${kw} 도움 되는 음식과 피해야 할 습관`,
        ];
    }
    return [
        `${kw} 최신 핵심 정리, 지금 확인할 것`,
        `${kw} 처음 보는 사람도 이해되는 정리`,
        `${kw} 놓치기 쉬운 포인트 5가지`,
    ];
}

function titleReason(title: TitleCtrResult, intent: ReturnType<typeof detectIntent>, risky: boolean): string {
    if (risky) return '과장 표현 감점, 보조 후보';
    if (intent === 'policy') return '신청/대상 의도 명확';
    if (intent === 'commerce') return '비교·후기 의도 대응';
    if (intent === 'travel') return '코스·예약 의도 대응';
    if (intent === 'entertainment') return '회차·정리 의도 대응';
    if (intent === 'health') return '원인·관리 의도 대응';
    if (title.matchedPatterns.includes('최신성')) return '최신성 강조';
    if (title.matchedPatterns.includes('숫자형')) return '스캔하기 쉬운 숫자형';
    return '검색 의도 직접 대응';
}

function buildTitleOptions(input: HomePublishPlannerInput, intent: ReturnType<typeof detectIntent>): HomeTitleOption[] {
    const keyword = cleanKeyword(input.keyword);
    const rawTitles = [
        ...(input.titleCandidates || []).map(t => t.title),
        ...fallbackTitles(keyword, intent),
    ].map(t => String(t || '').replace(/\s+/g, ' ').trim())
        .filter(t => t && t.includes(keyword));

    const scored = unique(rawTitles).map(title => {
        const predicted = predictTitleCtr(title, keyword);
        const risky = OVERCLAIM_RE.test(title) && !POLICY_RE.test(keyword);
        const adjustedScore = clamp(predicted.ctrScore - (risky ? 18 : 0) - (title.length > 44 ? 4 : 0));
        return {
            result: { ...predicted, ctrScore: adjustedScore },
            risky,
        };
    }).sort((a, b) => b.result.ctrScore - a.result.ctrScore);

    const safeFirst = scored.filter(t => !t.risky);
    const pool = safeFirst.length >= 3 ? safeFirst : scored;
    return pool.slice(0, 3).map((item, idx) => ({
        title: item.result.title,
        role: idx === 0 ? 'primary' : (item.risky ? 'safe' : 'backup'),
        ctrScore: item.result.ctrScore,
        reason: titleReason(item.result, intent, item.risky),
    }));
}

function freshnessScore(input: HomePublishPlannerInput): number {
    let score = 45;
    const days = input.daysSinceFirstAppear;
    if (typeof days === 'number') {
        if (days <= 1) score = 100;
        else if (days <= 3) score = 88;
        else if (days <= 7) score = 74;
        else if (days <= 14) score = 58;
        else if (days <= 30) score = 42;
        else score = 24;
    }
    const surge = input.surgeRatio || 0;
    if (surge >= 3) score += 12;
    else if (surge >= 2) score += 8;
    else if (surge >= 1.5) score += 4;
    const published = input.blogPublishCount24h || 0;
    if (published >= 100) score -= 18;
    else if (published >= 50) score -= 10;
    else if (published >= 20) score -= 4;
    return clamp(score);
}

function vacancyScore(input: HomePublishPlannerInput): number {
    const slots = input.vacancySlots;
    if (typeof slots !== 'number') return 45;
    const influencers = input.influencerCount || 0;
    const big = input.bigDomainCount || 0;
    return clamp((slots * 11) - (influencers * 7) - (big * 3) + 15);
}

function statusFor(input: HomePublishPlannerInput, priority: number, titleScore: number): HomePublishStatus {
    const home = input.homeScore || 0;
    const slots = input.vacancySlots;
    const hardVacancy = typeof slots === 'number' && slots < 3;
    if (hardVacancy || home < 25) return 'SKIP';
    if (home >= 70 && priority >= 68 && titleScore >= 55) return 'PUBLISH_NOW';
    if (home >= 55 && priority >= 56) return 'WRITE_TODAY';
    if (priority >= 42) return 'WATCH';
    return 'SKIP';
}

function labelFor(status: HomePublishStatus): string {
    if (status === 'PUBLISH_NOW') return '오늘 발행 우선';
    if (status === 'WRITE_TODAY') return '오늘 작성 후보';
    if (status === 'WATCH') return '관찰 후 작성';
    return '제외 권장';
}

function hookFor(intent: ReturnType<typeof detectIntent>): string {
    if (intent === 'policy') return '대상·기간·서류를 먼저 해결하고, 변경사항과 예외 조건을 뒤에서 정리';
    if (intent === 'commerce') return '가격보다 선택 기준과 실제 후기의 갈리는 지점을 먼저 제시';
    if (intent === 'travel') return '동선·예약·비용처럼 바로 결정에 필요한 정보를 앞단에 배치';
    if (intent === 'entertainment') return '회차/출연진/다시보기처럼 검색자가 바로 확인하려는 정보를 선요약';
    if (intent === 'health') return '증상·원인·관리법을 과장 없이 구분하고 개인차 안내를 포함';
    return '검색자가 지금 궁금해할 한 가지 질문에 먼저 답하고 세부 항목으로 확장';
}

function outlineFor(keyword: string, intent: ReturnType<typeof detectIntent>): string[] {
    if (intent === 'policy') return ['핵심 요약', '신청 대상', '기간과 방법', '준비서류', '주의할 예외 조건'];
    if (intent === 'commerce') return ['선택 기준', '가격대 비교', '후기 장단점', '추천 대상', '구매 전 체크'];
    if (intent === 'travel') return ['핵심 요약', '추천 코스', '비용과 예약', '시간대별 팁', '주의사항'];
    if (intent === 'entertainment') return ['핵심 정보', '출연진/회차', '관전 포인트', '다시보기', '최신 반응'];
    if (intent === 'health') return ['핵심 요약', '원인', '증상별 체크', '관리법', '주의사항'];
    return [`${keyword} 핵심 요약`, '왜 지금 관심이 몰리는지', '확인해야 할 포인트', '자주 묻는 질문', '마무리 체크'];
}

function mustIncludeFor(keyword: string, intent: ReturnType<typeof detectIntent>): string[] {
    if (intent === 'policy') return ['신청 대상', '신청 기간', '준비서류', '공식 확인 경로'];
    if (intent === 'commerce') return ['가격대', '장단점', '추천 대상', '비교 기준'];
    if (intent === 'travel') return ['운영 시간', '예약/요금', '동선', '대체 코스'];
    if (intent === 'entertainment') return ['기본 정보', '회차/일정', '출연진', '다시보기'];
    if (intent === 'health') return ['증상', '원인', '생활 관리', '전문가 상담 필요 조건'];
    return [keyword, '최신 정보', '확인 방법', '주의사항'];
}

function avoidFor(intent: ReturnType<typeof detectIntent>): string[] {
    const base = ['노출 보장 표현', '출처 없는 단정', '키워드만 반복하는 제목'];
    if (intent === 'policy') return [...base, '공식 공고와 다른 신청 조건'];
    if (intent === 'health') return [...base, '치료 효과 단정'];
    if (intent === 'commerce') return [...base, '광고성 과장 후기'];
    return base;
}

function publishWindow(status: HomePublishStatus, input: HomePublishPlannerInput): string {
    const surge = input.surgeRatio || 0;
    if (status === 'PUBLISH_NOW') return surge >= 2 ? '지금~3시간 안' : '오늘 오전/점심 전';
    if (status === 'WRITE_TODAY') return '오늘 안에 초안 작성 후 발행';
    if (status === 'WATCH') return '반나절 관찰 후 상승 유지 시 발행';
    return '오늘 발행 비추천';
}

export function buildHomePublishPlan(input: HomePublishPlannerInput): HomePublishPlan {
    const keyword = cleanKeyword(input.keyword);
    const intent = detectIntent(keyword, input.category);
    const titleOptions = buildTitleOptions(input, intent);
    const primaryTitle = titleOptions[0]?.title || fallbackTitles(keyword, intent)[0];
    const titleScore = titleOptions[0]?.ctrScore || predictTitleCtr(primaryTitle, keyword).ctrScore;
    const home = clamp(input.homeScore || 0);
    const vac = vacancyScore(input);
    const fresh = freshnessScore(input);
    const value = clamp(input.qualityScore ?? input.valueScore ?? 50);
    const priorityScore = Math.round(clamp(home * 0.44 + titleScore * 0.24 + vac * 0.14 + fresh * 0.12 + value * 0.06));
    const status = statusFor(input, priorityScore, titleScore);
    const confidence: HomePublishPlan['confidence'] =
        input.homeScore != null && input.vacancySlots != null && input.daysSinceFirstAppear != null ? 'high' :
            input.homeScore != null && input.vacancySlots != null ? 'medium' : 'low';

    const reasons = [
        `homeScore ${home}/100`,
        `제목 ${titleScore}/100`,
        typeof input.vacancySlots === 'number' ? `빈자리 ${input.vacancySlots}/10` : '빈자리 미측정',
        typeof input.surgeRatio === 'number' && input.surgeRatio > 0 ? `상승 ${input.surgeRatio.toFixed(1)}배` : '상승 신호 보통',
    ];

    return {
        status,
        statusLabel: labelFor(status),
        priorityScore,
        confidence,
        primaryTitle,
        titleOptions,
        hookAngle: hookFor(intent),
        firstParagraph: `"${keyword}"를 찾는 사람이 먼저 확인해야 할 결론을 2~3문장으로 요약한 뒤, 대상/조건/방법처럼 바로 행동할 수 있는 정보부터 이어갑니다.`,
        outline: outlineFor(keyword, intent),
        mustInclude: unique(mustIncludeFor(keyword, intent)),
        avoid: unique(avoidFor(intent)),
        publishWindow: publishWindow(status, input),
        reasons,
    };
}

export function batchBuildHomePublishPlans(inputs: HomePublishPlannerInput[]): Array<HomePublishPlan & { keyword: string }> {
    return (inputs || []).map(input => ({
        keyword: cleanKeyword(input.keyword),
        ...buildHomePublishPlan(input),
    }));
}
