/**
 * AdSense 키워드 헌터
 *
 * PRO 트래픽 헌터(조회수)·황금키워드(구매전환)와 차별화된 광고수익 특화 모듈.
 * 핵심 차이:
 *  - 검색량보다 "정보형 의도(how/what/이유/방법)" 가중치가 높음 (구매 직전 의도는 광고 클릭률 낮음)
 *  - 카테고리 CPC × Google 트래픽 비율 × 추정 CTR × 광고밀도 보정으로 RPM 산출
 *  - YMYL(의료/금융/법률) 카테고리는 위험도 가중치로 페널티
 *  - 결과는 {예상 RPM, 월 예상 수익, 정보의도 점수, YMYL 위험도, 등급}
 */

import {
    CATEGORY_CPC_DATABASE,
    INFO_SEARCH_PATTERNS,
    PURCHASE_INTENT_PATTERNS,
    estimateCPC,
    evaluateKeywordSafety,
} from './profit-golden-keyword-engine';

import { huntProTrafficKeywords } from './pro-traffic-keyword-hunter';
import { safeCall, callAllSources } from './sources/source-registry';
import { getNaverKeywordSearchVolumeSeparate } from './naver-datalab-api';
import { getNaverAutocompleteKeywords } from './naver-autocomplete';
import { EnvironmentManager } from './environment-manager';

// ============================================================
// 1) AdSense RPM 보정 테이블
// ============================================================

/**
 * 카테고리별 추정 CTR (애드센스 광고 클릭률)
 * 구글 공식 평균 0.5%~2.0% 범위에서 카테고리 특성 반영
 */
const CATEGORY_CTR: Record<string, number> = {
    finance: 0.018, insurance: 0.020, loan: 0.022, realestate: 0.015, legal: 0.020,
    medical: 0.015, dental: 0.014, plastic: 0.012,
    health: 0.014, supplement: 0.016, diet: 0.014,
    laptop: 0.016, smartphone: 0.014, it: 0.013, tech: 0.013,
    education: 0.015, certificate: 0.017, business: 0.014,
    travel: 0.012, hotel: 0.013, flight: 0.013,
    interior: 0.013, moving: 0.014, wedding: 0.012, appliance: 0.014,
    parenting: 0.012, baby: 0.013, pet: 0.011,
    food: 0.008, restaurant: 0.007, cafe: 0.007,
    beauty: 0.010, skincare: 0.011, cosmetic: 0.010, fashion: 0.009, shopping: 0.010,
    recipe: 0.008, cooking: 0.008,
    game: 0.006, movie: 0.006, drama: 0.005, music: 0.005, celeb: 0.005, entertainment: 0.005,
    sports: 0.007, review: 0.012,
    life: 0.009, life_tips: 0.011,
    living: 0.011, diy: 0.012, gardening: 0.009,
    tax: 0.020, job: 0.015,
    car: 0.014, app: 0.011, hobby: 0.010,
    subsidy: 0.022,
    season: 0.014,
    'naver-home': 0.018,  // 홈판은 정보형 우대 + 실시간 트렌드 → 클릭률 ↑
    all: 0.010, default: 0.010,
};

/**
 * 카테고리별 광고밀도 보정 (페이지당 노출되는 광고 슬롯 수 보정)
 * 정보성 콘텐츠가 길수록 광고 노출 ↑
 */
const CATEGORY_AD_DENSITY: Record<string, number> = {
    finance: 1.4, insurance: 1.4, loan: 1.4, realestate: 1.3, legal: 1.3,
    medical: 1.3, dental: 1.3, plastic: 1.2,
    health: 1.3, supplement: 1.3, diet: 1.2,
    laptop: 1.3, smartphone: 1.2, it: 1.3, tech: 1.3,
    education: 1.2, certificate: 1.2, business: 1.2,
    travel: 1.2, hotel: 1.2, flight: 1.2,
    interior: 1.1, moving: 1.1, wedding: 1.0, appliance: 1.1,
    parenting: 1.1, baby: 1.1, pet: 1.0,
    food: 0.9, restaurant: 0.8, cafe: 0.8,
    beauty: 1.0, skincare: 1.0, cosmetic: 1.0, fashion: 0.9, shopping: 0.9,
    recipe: 0.9, cooking: 0.9,
    game: 0.8, movie: 0.7, drama: 0.7, music: 0.7, celeb: 0.6, entertainment: 0.7,
    sports: 0.8, review: 1.1,
    life: 0.9, life_tips: 1.0,
    living: 1.0, diy: 1.1, gardening: 0.9,
    tax: 1.3, job: 1.2,
    car: 1.2, app: 1.0, hobby: 1.0,
    subsidy: 1.4,
    season: 1.2,
    'naver-home': 1.2,  // 홈판 글은 광고 슬롯 풍부 (트렌드 광고주 입찰 ↑)
    all: 1.0, default: 1.0,
};

// 네이버 검색량 → 구글 트래픽 변환 비율 (profit-golden 엔진과 동일 사상)
const GOOGLE_TRAFFIC_RATIO_LOCAL: Record<string, number> = {
    it: 0.55, tech: 0.55, game: 0.45, laptop: 0.50, smartphone: 0.45,
    education: 0.35, certificate: 0.30, business: 0.35,
    finance: 0.30, insurance: 0.25, loan: 0.25, realestate: 0.25, legal: 0.25,
    medical: 0.30, dental: 0.25, plastic: 0.20, health: 0.25, supplement: 0.20,
    travel: 0.25, hotel: 0.30, flight: 0.35,
    food: 0.15, restaurant: 0.10, cafe: 0.10,
    beauty: 0.20, skincare: 0.20, cosmetic: 0.20, fashion: 0.20, shopping: 0.25,
    pet: 0.20, parenting: 0.20, baby: 0.20,
    interior: 0.25, moving: 0.20, wedding: 0.15, appliance: 0.30,
    celeb: 0.10, entertainment: 0.10, movie: 0.15, drama: 0.15, music: 0.15, sports: 0.20,
    recipe: 0.15, cooking: 0.15, diet: 0.20,
    life: 0.15, life_tips: 0.20, review: 0.25,
    living: 0.20, diy: 0.30, gardening: 0.20,
    tax: 0.30, job: 0.30,
    car: 0.30, app: 0.40, hobby: 0.25,
    subsidy: 0.30,
    season: 0.25,
    'naver-home': 0.20,  // 홈판은 네이버 메인 트래픽 비중 높음
    all: 0.25, default: 0.25,
};

// ============================================================
// 2) 정보형 의도 점수 (애드센스에서 가장 중요한 신호)
// ============================================================

/**
 * 🚫 0클릭 SERP 위험도 — AI 답변/Featured Snippet으로 검색자가 블로그를 안 누르는 위험
 *
 * 네이버 AI 브리핑(40% 확대) + 구글 SGE/AI Overviews 영향:
 *   - "증상/뜻/의미" → AI 요약 답변 박스 출현 70%+ → 트래픽 -40%
 *   - "언제/어디/얼마" → Featured Snippet 50%+ → 트래픽 -25%
 *   - "최고/순위/1위" → People Also Ask 분산 40% → 트래픽 -15%
 *   - 일반 정보형 → 영향 없음
 */
export type ZeroClickRiskLevel = 'high' | 'medium' | 'low';

export interface ZeroClickRiskResult {
    level: ZeroClickRiskLevel;
    trafficDiscountRatio: number;   // 0.6~1.0 (실제 트래픽 잔존율)
    matchedPattern: string | null;
    summary: string;
}

const ZERO_CLICK_HIGH_PATTERNS = [
    '증상', '뜻', '의미', '정의', '란', '란뜻',
    '왜', '이유', '원인',
];
const ZERO_CLICK_MEDIUM_PATTERNS = [
    '언제', '어디', '얼마', '며칠', '몇일', '몇시',
    '얼마나', '어떤', '어디서',
];
const ZERO_CLICK_LOW_PATTERNS = [
    '최고', '순위', '1위', '랭킹', 'top10', 'top 10', '베스트',
];

export function calculateZeroClickRisk(keyword: string): ZeroClickRiskResult {
    const lower = String(keyword || '').toLowerCase();

    for (const p of ZERO_CLICK_HIGH_PATTERNS) {
        if (lower.includes(p.toLowerCase())) {
            return {
                level: 'high',
                trafficDiscountRatio: 0.6,  // -40% 트래픽 손실
                matchedPattern: p,
                summary: `🚫 0클릭 고위험 (${p}) — AI 답변/SGE 출현 70%+, 트래픽 -40%`,
            };
        }
    }
    for (const p of ZERO_CLICK_MEDIUM_PATTERNS) {
        if (lower.includes(p.toLowerCase())) {
            return {
                level: 'medium',
                trafficDiscountRatio: 0.75,  // -25% 트래픽 손실
                matchedPattern: p,
                summary: `⚠️ 0클릭 중위험 (${p}) — Featured Snippet 50%+, 트래픽 -25%`,
            };
        }
    }
    for (const p of ZERO_CLICK_LOW_PATTERNS) {
        if (lower.includes(p.toLowerCase())) {
            return {
                level: 'low',
                trafficDiscountRatio: 0.85,  // -15% 트래픽 손실
                matchedPattern: p,
                summary: `📊 0클릭 저위험 (${p}) — PAA 분산 40%, 트래픽 -15%`,
            };
        }
    }

    return {
        level: 'low',
        trafficDiscountRatio: 1.0,
        matchedPattern: null,
        summary: '✅ 0클릭 위험 없음',
    };
}

/**
 * 💎 블루오션 등급 시스템
 *  competitionRatio = searchVolume / documentCount
 *
 *  - ultra-blue (≥ 5.0): 거의 독점 노출 가능 (검색량은 풍부, 문서 거의 없음)
 *  - blue (≥ 2.0): 신생 블로거 진입 매우 쉬움
 *  - green (≥ 1.0): 정상 경쟁 (1페이지 가능)
 *  - red (≥ 0.3): 어려움 (DA 30+ 필요)
 *  - crimson (< 0.3): 사실상 불가 (메이저 사이트 독점)
 *
 *  최소 검색량 200 미달 시 "noise"로 분리 (트래픽 자체가 없음)
 */
export type BlueOceanLevel = 'ultra-blue' | 'blue' | 'green' | 'red' | 'crimson' | 'noise';

export interface BlueOceanResult {
    level: BlueOceanLevel;
    ratio: number;             // competitionRatio
    score: number;             // 0~100 블루오션 점수
    summary: string;
    isBlueOcean: boolean;      // ultra-blue 또는 blue
}

export function calculateBlueOceanLevel(searchVolume: number, documentCount: number): BlueOceanResult {
    const ratio = documentCount > 0 ? searchVolume / documentCount : 0;
    const ratioRounded = Math.round(ratio * 100) / 100;

    if (searchVolume < 200) {
        return {
            level: 'noise', ratio: ratioRounded, score: 0,
            isBlueOcean: false,
            summary: `🪨 노이즈 (검색량 ${searchVolume} < 200)`,
        };
    }

    let level: BlueOceanLevel;
    let score: number;
    let summary: string;
    if (ratio >= 5.0) {
        level = 'ultra-blue';
        score = Math.min(100, 80 + ratio * 2);  // 최대 100
        summary = `💎💎💎 극블루오션 (경쟁비 ${ratioRounded}배 — 거의 독점 노출)`;
    } else if (ratio >= 2.0) {
        level = 'blue';
        score = 60 + (ratio - 2.0) * 6.66;  // 60~80
        summary = `💎 블루오션 (경쟁비 ${ratioRounded}배 — 신생 진입 쉬움)`;
    } else if (ratio >= 1.0) {
        level = 'green';
        score = 40 + (ratio - 1.0) * 20;  // 40~60
        summary = `🟢 정상 (경쟁비 ${ratioRounded}배)`;
    } else if (ratio >= 0.3) {
        level = 'red';
        score = 20 + (ratio - 0.3) * 28.5;  // 20~40
        summary = `🔴 레드오션 (경쟁비 ${ratioRounded}배 — DA 30+ 필요)`;
    } else {
        level = 'crimson';
        score = Math.max(0, ratio * 66);  // 0~20
        summary = `💀 크림슨 (경쟁비 ${ratioRounded}배 — 메이저 사이트 독점)`;
    }

    return {
        level, ratio: ratioRounded, score: Math.round(score),
        isBlueOcean: level === 'ultra-blue' || level === 'blue',
        summary,
    };
}

/**
 * 🚫 AdSense 광고 게재 적합성 평가 (Phase 4.4)
 *  Google AdSense 정책: 의료/금융/도박 콘텐츠 + 신생계정 = 광고 거절률 높음.
 *  RPM = 0 가능성을 사전 경고하여 사용자가 콘텐츠 제작 시간 낭비 방지.
 *
 *  - eligible: 일반적으로 광고 게재 (대부분의 키워드)
 *  - restricted: 게재 가능하나 단가 낮거나 일부 광고만
 *  - blocked: 광고 거절률 높음 (콘텐츠 정책 / 무효 트래픽 / YMYL 신생)
 */
export type AdsenseEligibility = 'eligible' | 'restricted' | 'blocked';

export interface AdsenseEligibilityResult {
    status: AdsenseEligibility;
    rpmFactor: number;            // 0~1 (실제 광고 게재 시 RPM 보정)
    blockingReasons: string[];
    summary: string;
}

const ADSENSE_BLOCKED_TOKENS = [
    '도박', '카지노', '토토', '슬롯', '바카라', '포커사이트',
    '성인', '음주', '음란',
    '대부', '사채', '급전',  // 광고법 + AdSense 정책
];

const ADSENSE_RESTRICTED_TOKENS = [
    '대출', '신용대출', '주담대',  // YMYL 금융
    '의료', '진료', '치료', '수술', '시술',  // 의료
    '약', '의약품', '처방',
    '주식', '투자', '코인', '비트코인',
];

export function evaluateAdsenseEligibility(input: {
    keyword: string;
    ymylRisk: 'low' | 'medium' | 'high';
    safety: 'safe' | 'caution' | 'danger';
    dataConfidence: 'high' | 'medium' | 'low';
}): AdsenseEligibilityResult {
    const { keyword, ymylRisk, safety, dataConfidence } = input;
    const lower = keyword.toLowerCase();
    const reasons: string[] = [];

    // 1. 절대 차단 (도박/성인 등)
    for (const t of ADSENSE_BLOCKED_TOKENS) {
        if (lower.includes(t)) {
            return {
                status: 'blocked',
                rpmFactor: 0,
                blockingReasons: [`🚫 AdSense 정책 위반 ("${t}" 포함) — 광고 게재 거절`],
                summary: '🚫 광고 게재 불가 (RPM = 0)',
            };
        }
    }

    // 2. safety = danger (광고법 위반)
    if (safety === 'danger') {
        return {
            status: 'blocked',
            rpmFactor: 0.05,
            blockingReasons: ['🚫 콘텐츠 안전성 danger — 대부분 광고 거절'],
            summary: '🚫 광고 게재 95% 거절 (RPM 사실상 0)',
        };
    }

    // 3. YMYL High + 신생 계정(추정 데이터) → 게재 거절률 60~70%
    if (ymylRisk === 'high' && dataConfidence === 'low') {
        return {
            status: 'restricted',
            rpmFactor: 0.30,
            blockingReasons: ['⚠️ YMYL 고위험 + 신생 계정 — 광고 거절률 60~70%'],
            summary: '⚠️ 광고 게재 30% 수준 (RPM × 0.30)',
        };
    }

    // 4. 제한 토큰 (대출/의료/투자) — 광고 게재되나 단가 낮음
    for (const t of ADSENSE_RESTRICTED_TOKENS) {
        if (lower.includes(t)) {
            reasons.push(`⚠️ AdSense 제한 토큰 ("${t}") — 일부 광고 거절 가능`);
            break;
        }
    }
    if (reasons.length > 0) {
        return {
            status: 'restricted',
            rpmFactor: 0.70,
            blockingReasons: reasons,
            summary: '⚠️ 일부 광고 제한 (RPM × 0.70)',
        };
    }

    // 5. YMYL High + 데이터 확실해도 50% 페널티
    if (ymylRisk === 'high') {
        return {
            status: 'restricted',
            rpmFactor: 0.60,
            blockingReasons: ['⚠️ YMYL 고위험 — 광고 단가 페널티'],
            summary: '⚠️ 단가 ×0.60',
        };
    }

    return {
        status: 'eligible',
        rpmFactor: 1.0,
        blockingReasons: [],
        summary: '✅ 광고 게재 정상',
    };
}

/**
 * 🎯 SEO 검색의도 4분류 — AdSense 광고 게재 적합성 핵심 지표
 *
 * - Informational (정보형): "방법/이유/뜻/효능" → AdSense 광고 100% 게재, CTR 최적
 * - Commercial (상업조사): "비교/순위/추천/리뷰" → Affiliate 우선, AdSense 부분
 * - Transactional (거래형): "가격/구매/주문/할인" → AdSense 광고 거의 0% (구매 직전)
 * - Navigational (항해형): "[브랜드명]/로그인/다운로드" → 광고 불가
 */
export type SearchIntent = 'informational' | 'commercial' | 'transactional' | 'navigational';

export interface SearchIntentResult {
    primary: SearchIntent;
    confidence: number;            // 0~1
    ctrMultiplier: number;          // 의도별 CTR 보정 (정보 1.0, 상업 0.7, 거래 0.4, 항해 0.1)
    summary: string;
}

const INTENT_PATTERNS: Record<SearchIntent, string[]> = {
    informational: [
        '방법', '하는법', '하는방법', '만드는법', '만들기', '사용법', '활용법',
        '이유', '원인', '왜', '뜻', '의미', '정의', '효능', '효과', '부작용',
        '종류', '유형', '차이', '차이점', '뭐가다른가',
        '얼마나', '언제', '어디서', '어떻게', '어떤',
        '신청', '신청방법', '신청절차', '신청자격', '대상', '대상자', '기준', '요건',
        '계산기', '계산법', '계산방법', '조회', '확인',
        '가이드', '정리', '총정리', '꿀팁', '노하우',
        '?', '주의사항',
    ],
    commercial: [
        '추천', '비교', '순위', '랭킹', 'top', 'best', '베스트', '인기',
        '1위', '톱', 'vs', '대비',
        '후기', '리뷰', '사용기', '체험기', '내돈내산', '솔직후기',
        '장단점', '장점', '단점', '문제점', '아쉬운점', '좋은점',
    ],
    transactional: [
        '가격', '비용', '얼마', '최저가', '할인', '쿠폰', '세일', '특가',
        '구매', '구입', '주문', '결제', '주문방법',
        '무료배송', '사은품', '프로모션', '직구',
    ],
    navigational: [
        '로그인', '회원가입', '다운로드', '설치', '앱설치',
        '공식', '공식사이트', '홈페이지', '홈페이지주소',
    ],
};

const INTENT_CTR_MULTIPLIER: Record<SearchIntent, number> = {
    informational: 1.0,    // AdSense 최적 — 정보 검색자가 광고 클릭률 가장 높음
    commercial: 0.7,        // 비교/리뷰는 광고보다 affiliate가 더 강력
    transactional: 0.4,     // 구매 직전은 광고 무시
    navigational: 0.1,      // 특정 사이트 가려는 검색자 — 광고 거의 안 봄
};

export function classifySearchIntent(keyword: string): SearchIntentResult {
    const lower = String(keyword || '').toLowerCase();
    const scores: Record<SearchIntent, number> = {
        informational: 0, commercial: 0, transactional: 0, navigational: 0,
    };

    for (const intent of Object.keys(INTENT_PATTERNS) as SearchIntent[]) {
        for (const pattern of INTENT_PATTERNS[intent]) {
            if (lower.includes(pattern.toLowerCase())) {
                scores[intent]++;
            }
        }
    }

    // 영문 브랜드명/약자 (전부 대문자 또는 영문만) → 항해형
    if (/^[A-Z][A-Za-z0-9]*$/.test(keyword.split(/\s+/)[0] || '')) {
        scores.navigational += 2;
    }

    // 가장 높은 점수의 의도 선택
    let primary: SearchIntent = 'informational';
    let maxScore = scores.informational;
    for (const intent of Object.keys(scores) as SearchIntent[]) {
        if (scores[intent] > maxScore) {
            maxScore = scores[intent];
            primary = intent;
        }
    }

    // 매칭 0개 = 기본 informational + 낮은 신뢰도
    const totalMatches = Object.values(scores).reduce((s, n) => s + n, 0);
    const confidence = totalMatches === 0 ? 0.3 : Math.min(1, maxScore / Math.max(1, totalMatches));

    const ctrMultiplier = INTENT_CTR_MULTIPLIER[primary];
    const summary = totalMatches === 0
        ? '의도 불명 (정보형 추정)'
        : `${primary === 'informational' ? '📖 정보형' : primary === 'commercial' ? '⭐ 상업조사' : primary === 'transactional' ? '💰 거래형' : '🧭 항해형'} (CTR ×${ctrMultiplier.toFixed(1)})`;

    return { primary, confidence: Math.round(confidence * 100) / 100, ctrMultiplier, summary };
}

/**
 * 정보형 의도 점수 (0~100)
 * 정보형(방법/이유/뜻/효능)은 광고 클릭이 일어나는 의도
 * 구매 직전 의도(가격/할인/주문)는 광고를 무시하므로 감점
 */
export function calculateInfoIntentScore(keyword: string): number {
    const kw = String(keyword || '').toLowerCase();
    let score = 40;

    const infoMatches = INFO_SEARCH_PATTERNS.filter(p => kw.includes(p)).length;
    score += Math.min(40, infoMatches * 12);

    // 구매 직전 의도는 광고 클릭이 적음 → 감점
    const purchaseMatches = PURCHASE_INTENT_PATTERNS.filter(p => kw.includes(p)).length;
    score -= Math.min(25, purchaseMatches * 8);

    // 질문형 키워드는 가산
    if (/\?$|왜|어떻게|언제|어디|얼마|뭐가|어떤|어디서/.test(keyword)) score += 10;

    // 특정 정보 패턴 가산
    if (/방법|하는법|이유|원인|뜻|의미|효능|효과/.test(keyword)) score += 8;

    return Math.max(0, Math.min(100, Math.round(score)));
}

// ============================================================
// 3) YMYL 위험도 (구글이 가장 엄격하게 평가하는 카테고리)
// ============================================================

const YMYL_HIGH_RISK = ['의료', '진단', '치료', '처방', '약', '수술', '시술', '병원진료', '응급'];
const YMYL_MED_RISK = ['금융', '대출', '투자', '보험', '세금', '법률', '소송', '판결'];

export function calculateYmylRisk(keyword: string): { level: 'low' | 'medium' | 'high'; score: number } {
    const kw = String(keyword || '').toLowerCase();
    if (YMYL_HIGH_RISK.some(p => kw.includes(p))) return { level: 'high', score: 80 };
    if (YMYL_MED_RISK.some(p => kw.includes(p))) return { level: 'medium', score: 50 };
    return { level: 'low', score: 15 };
}

// ============================================================
// 4) 핵심: AdSense RPM 산출
// ============================================================

export interface AdsenseKeywordData {
    keyword: string;
    searchVolume: number;
    documentCount: number;
    category: string;
    estimatedCPC: number;
    estimatedRPM: number;            // Publisher 실수익 RPM (구글 수수료 차감 후, ×0.40)
    grossRPM: number;                 // 광고주 입찰 기준 Gross RPM (참고용)
    estimatedMonthlyRevenue: number;  // Publisher 월 실수익 추정 (KRW, 100% SERP 점유 가정)
    estimatedGrossMonthlyRevenue: number;  // 광고주 입찰 기준 월 매출 (참고용)
    reachability: ReachabilityScenarios;  // 🎯 신생 블로그 시간별 도달률 시나리오
    annualizedVolume: AnnualizedVolume;   // 📅 연평균 검색량 환산 (시즌 키워드 보정)
    seasonalTiming: SeasonalTimingInfo;   // 📅 시즌 D-day + 발행 적기 (Phase 4.3)
    adsenseEligibility: AdsenseEligibilityResult;  // 🚫 AdSense 광고 게재 적합성 (Phase 4.4)
    blueOcean: BlueOceanResult;                     // 💎 블루오션 등급 (검색량/문서수 비율)
    searchIntent: SearchIntentResult;     // 🎯 검색의도 4분류 (Phase 2.1)
    zeroClickRisk: ZeroClickRiskResult;   // 🚫 0클릭 SERP 위험도 (Phase 2.2)
    revenueConfidenceInterval: ConfidenceInterval;  // 🎯 월수익 신뢰구간 ±오차 (Phase 3.1)
    revenueRangeAt12m: ConfidenceInterval;          // 🎯 12개월 도달 후 월수익 신뢰구간
    googleTrafficShare: number;       // 구글 트래픽 비중 (0~1)
    ctr: number;                      // 추정 CTR
    infoIntentScore: number;          // 정보형 의도 점수 (0~100)
    ymylRisk: 'low' | 'medium' | 'high';
    ymylRiskScore: number;
    safety: 'safe' | 'caution' | 'danger';
    safetyReason: string;
    grade: 'SSS' | 'SS' | 'S' | 'A' | 'B';
    gradeReason: string;
    competitionRatio: number;         // 검색량 / 문서수
    writable: boolean;                // ✍️ 글쓰기 가능 여부 (필수 게이트)
    writableReason: string;
    valueScore: number;               // 💎 종합 가치 점수 (0~100)
    valueBreakdown: ValueScoreBreakdown;
    // 🔍 데이터 신뢰도 (사용자가 "실제 검색되는 키워드인지" 검증)
    dataSource: 'naver-api' | 'pro-validated' | 'estimated';
    dataConfidence: 'high' | 'medium' | 'low';
    dataSourceReason: string;
    // ⭐ 다중 소스 교차 검증 (네이버 외 추가 신호)
    crossValidation: CrossValidationResult;
    // 📅 시즌 카테고리에서 자동 분류된 sub-카테고리 (beauty/fashion/travel/food/...)
    subCategory?: string;
}

export interface CrossValidationResult {
    level: 'verified' | 'double' | 'single' | 'unverified';
    score: number;                    // 0~6 (소스 매칭 개수)
    signals: {
        naverApi: boolean;            // 네이버 검색광고 API 실측
        naverSuggest: boolean;        // 네이버 자동완성 매칭
        proCrossSource: boolean;      // PRO 다중 소스 교차 등장
        wikiPageView: boolean;        // 위키 페이지뷰 매칭
        googleTrends: boolean;        // 구글 트렌드 (현재 비활성)
        youtubeResults: boolean;      // 유튜브 검색 결과 (현재 비활성)
    };
    summary: string;
}

/**
 * RPM (Revenue Per Mille) 계산
 *
 *   RPM = CPC × CTR × 1000 × 광고밀도 × YMYL_보정
 *
 * 단, 정보형 의도가 낮으면 CTR 보정으로 추가 페널티
 */
/**
 * 구글 AdSense 수수료 차감 비율.
 * 공식: 구글이 광고주 입찰가의 ~32%를 수수료로 차감, Publisher는 ~68% 수령
 * 단, 콘텐츠 정책 위반/저품질/무효 트래픽 페널티 고려 시 실수익은 ~40%
 * (5명 오푸스 토론 결과: 신생 블로그 실측 평균 40%)
 */
export const PUBLISHER_REVENUE_FACTOR = 0.40;

/**
 * 🎯 CTR 캘리브레이션 — 신뢰 구간(±오차) 명시
 *
 * 공개된 AdSense 벤치마크 (industry averages, 2024~2025):
 *   - 디스플레이 광고 평균 CTR: 0.46% ~ 1.2% (Google 공개 데이터)
 *   - 한국 시장 정보형 콘텐츠: 0.5% ~ 2.0%
 *   - 우리 모델은 카테고리별 0.5%~2.2% — 산업 평균과 일치
 *
 * 추정 오차 범위 (5명 오푸스 토론 합의):
 *   - 신뢰 구간 ±40% (실제 RPM은 추정값의 60%~140% 범위)
 *   - 정보형 + 실측 데이터 + 교차검증 ⭐⭐⭐ 시 ±25%로 좁아짐
 *   - 추정 데이터 또는 의도 불명 시 ±60%로 넓어짐
 */
export interface ConfidenceInterval {
    lower: number;       // 하한 (보수적 추정)
    upper: number;       // 상한 (낙관적 추정)
    errorMargin: number; // ±%
}

export function calculateRevenueConfidenceInterval(
    expectedRevenue: number,
    factors: {
        dataConfidence: 'high' | 'medium' | 'low';
        crossValidationLevel?: 'verified' | 'double' | 'single' | 'unverified';
        intentConfidence?: number;  // 0~1
    }
): ConfidenceInterval {
    let errorMargin = 0.40;  // 기본 ±40%

    // 실측 데이터 + 다중 검증 시 좁아짐
    if (factors.dataConfidence === 'high') errorMargin -= 0.10;
    if (factors.crossValidationLevel === 'verified') errorMargin -= 0.05;
    if (factors.crossValidationLevel === 'double') errorMargin -= 0.02;
    if ((factors.intentConfidence || 0) >= 0.7) errorMargin -= 0.03;

    // 추정 데이터 또는 의도 불명 시 넓어짐
    if (factors.dataConfidence === 'low') errorMargin += 0.20;
    if (factors.crossValidationLevel === 'unverified') errorMargin += 0.10;
    if ((factors.intentConfidence || 0) < 0.3) errorMargin += 0.05;

    errorMargin = Math.max(0.20, Math.min(0.80, errorMargin));

    return {
        lower: Math.round(expectedRevenue * (1 - errorMargin)),
        upper: Math.round(expectedRevenue * (1 + errorMargin)),
        errorMargin: Math.round(errorMargin * 100),
    };
}

/**
 * 🎯 SERP 점유율 시뮬레이터 — 신생 블로그가 얼마나 트래픽 흡수하는지 실측 추정
 *
 * 5명 오푸스 토론 결과: "검색량 174,900 → 월수익 ₩323만"은 환상.
 * 신생 블로그 1페이지 진입 점유율은 시간/경쟁비/정보의도 함수.
 *
 * 모델:
 *   기본 점유율 = min(0.20, max(0.005, 경쟁비 × 0.025))  [0.5%~20%]
 *   - 경쟁비 0.3 → 0.75% (레드오션)
 *   - 경쟁비 1.0 → 2.5%
 *   - 경쟁비 5.0 → 12.5%
 *   - 경쟁비 10+ → 20% (블루오션)
 *
 *   시간 진행에 따른 도달률 (경험치 기반):
 *   - 1개월: 기본 점유율 × 0.10  (대부분 노출 0)
 *   - 6개월: 기본 점유율 × 0.50  (롱테일 진입 시작)
 *   - 12개월: 기본 점유율 × 1.00 (안정 진입)
 *   - 24개월: 기본 점유율 × 1.50 (도메인 권위 ↑)
 *
 *   정보의도 보너스: 정보형 키워드는 SEO 진입 쉬움 (×1.2 가산)
 */
export interface ReachabilityScenarios {
    baseShare: number;          // 잠재 점유율 (0~0.20)
    month1: { share: number; monthlyClicks: number; monthlyRevenue: number };
    month6: { share: number; monthlyClicks: number; monthlyRevenue: number };
    month12: { share: number; monthlyClicks: number; monthlyRevenue: number };
    month24: { share: number; monthlyClicks: number; monthlyRevenue: number };
    summary: string;
}

/**
 * 📅 연평균 검색량 환산
 * 시즌 키워드는 피크 월에만 검색량 폭증 → 연평균은 매우 낮음.
 * 신생 블로거가 "월 검색량 39,880" 보고 글 쓰면 시즌 외 11개월 동안 거의 노출 없음.
 *
 * 모델:
 *   비시즌 키워드: 그대로 사용 (피크 = 평균)
 *   시즌 키워드(detectSeasonality.isSeasonal=true):
 *     활성 기간 = peakMonths.length / 12
 *     비활성 기간 검색량 ≈ 피크 × 0.08 (약 8%)
 *     연평균 = 피크 × (활성비율 + (1-활성비율) × 0.08)
 *     예: 5월 어버이날(1개월 활성) → 연평균 = 피크 × (0.083 + 0.917 × 0.08) = 피크 × 0.157
 *     예: 7~8월 여름(2개월) → 연평균 = 피크 × (0.167 + 0.833 × 0.08) = 피크 × 0.234
 */
export interface AnnualizedVolume {
    peakMonthly: number;           // 입력 검색량 (피크)
    annualAverage: number;         // 연평균 추정
    isSeasonal: boolean;
    activeMonths: number[];
    annualMultiplier: number;      // peak → annual 비율 (0.08~1.0)
    summary: string;
}

/**
 * Phase 4.3: 시즌 키워드 D-day + 발행 적기 계산
 *  - 피크월의 1일~말일 기준
 *  - 발행 권장: 피크 시작 D-14 ~ D-day 시작
 *  - 마감 권장: 피크 끝 D+7 (시즌 후 클릭 잔존)
 */
export interface SeasonalTimingInfo {
    isSeasonal: boolean;
    peakMonths: number[];
    peakStartDate: string | null;       // YYYY-MM-DD (현재 또는 다음 가까운 피크 시작일)
    peakEndDate: string | null;         // 피크 종료일
    publishWindowStart: string | null;  // 발행 권장 시작 (D-14)
    publishWindowEnd: string | null;    // 발행 권장 마감 (피크 시작일)
    daysToPeak: number | null;          // 피크까지 남은 일수 (음수면 이미 시작)
    daysToPublishDeadline: number | null;
    status: 'in-peak' | 'pre-peak' | 'post-peak' | 'far-future' | 'not-seasonal';
    summary: string;
}

function formatYMD(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function calculateSeasonalTiming(keyword: string): SeasonalTimingInfo {
    const seasonality = detectSeasonality(keyword);
    if (!seasonality.isSeasonal || seasonality.peakMonths.length === 0) {
        return {
            isSeasonal: false, peakMonths: [],
            peakStartDate: null, peakEndDate: null,
            publishWindowStart: null, publishWindowEnd: null,
            daysToPeak: null, daysToPublishDeadline: null,
            status: 'not-seasonal',
            summary: '연중 키워드 (시즌 무관)',
        };
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const currentMonth = now.getMonth() + 1;

    // 가장 가까운 다음 피크월 찾기
    const sortedPeaks = [...seasonality.peakMonths].sort((a, b) => a - b);
    let nearestPeakMonth: number | null = null;
    let peakYear = now.getFullYear();

    // 현재 피크 진행 중인지
    if (sortedPeaks.includes(currentMonth)) {
        nearestPeakMonth = currentMonth;
    } else {
        // 현재 월보다 이후 피크
        const futureInThisYear = sortedPeaks.find(m => m > currentMonth);
        if (futureInThisYear !== undefined) {
            nearestPeakMonth = futureInThisYear;
        } else {
            // 내년 첫 피크
            nearestPeakMonth = sortedPeaks[0];
            peakYear = now.getFullYear() + 1;
        }
    }

    const peakStart = new Date(peakYear, nearestPeakMonth - 1, 1);
    const peakEnd = new Date(peakYear, nearestPeakMonth, 0);  // 해당월 마지막날
    const publishStart = new Date(peakStart);
    publishStart.setDate(publishStart.getDate() - 14);
    const publishEnd = peakStart;

    const daysToPeak = Math.ceil((peakStart.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const daysToPublishDeadline = Math.ceil((publishEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    let status: SeasonalTimingInfo['status'];
    let summary: string;
    if (today >= peakStart && today <= peakEnd) {
        status = 'in-peak';
        summary = `🔥 피크 진행 중 (${nearestPeakMonth}월) — 즉시 발행 권장`;
    } else if (daysToPeak > 0 && daysToPeak <= 14) {
        status = 'pre-peak';
        summary = `⏰ 발행 적기 D-${daysToPeak} (${nearestPeakMonth}월 시작) — 지금 발행하면 SEO 안정화 후 피크`;
    } else if (daysToPeak > 14) {
        status = 'far-future';
        summary = `📅 ${nearestPeakMonth}월 시즌 — 발행 권장 D-${daysToPublishDeadline} (피크 14일 전)`;
    } else {
        status = 'post-peak';
        summary = `⚠️ 피크 종료 (${nearestPeakMonth}월) — 다음 시즌 대기`;
    }

    return {
        isSeasonal: true,
        peakMonths: seasonality.peakMonths,
        peakStartDate: formatYMD(peakStart),
        peakEndDate: formatYMD(peakEnd),
        publishWindowStart: formatYMD(publishStart),
        publishWindowEnd: formatYMD(publishEnd),
        daysToPeak,
        daysToPublishDeadline,
        status,
        summary,
    };
}

export function calculateAnnualizedVolume(keyword: string, peakSearchVolume: number): AnnualizedVolume {
    const seasonality = detectSeasonality(keyword);

    if (!seasonality.isSeasonal) {
        return {
            peakMonthly: peakSearchVolume,
            annualAverage: peakSearchVolume,
            isSeasonal: false,
            activeMonths: [],
            annualMultiplier: 1.0,
            summary: '연중 일정한 검색량',
        };
    }

    const activeRatio = seasonality.peakMonths.length / 12;
    const inactiveBaseline = 0.08;  // 비활성 기간 검색량 ~8%
    const annualMultiplier = activeRatio + (1 - activeRatio) * inactiveBaseline;
    const annualAverage = Math.round(peakSearchVolume * annualMultiplier);

    const monthLabels = seasonality.peakMonths.map(m => `${m}월`).join('·');
    const summary = `📅 시즌 키워드 (${monthLabels} 피크) — 연평균 ${(annualMultiplier * 100).toFixed(0)}% 수준`;

    return {
        peakMonthly: peakSearchVolume,
        annualAverage,
        isSeasonal: true,
        activeMonths: seasonality.peakMonths,
        annualMultiplier: Math.round(annualMultiplier * 1000) / 1000,
        summary,
    };
}

export function calculateReachabilityScenarios(input: {
    searchVolume: number;
    competitionRatio: number;
    infoIntentScore: number;
    googleTrafficShare: number;
    publisherRpm: number;
}): ReachabilityScenarios {
    const { searchVolume, competitionRatio, infoIntentScore, googleTrafficShare, publisherRpm } = input;

    // 기본 점유율 (경쟁비 × 0.025, 클램프 [0.005, 0.20])
    let baseShare = Math.min(0.20, Math.max(0.005, competitionRatio * 0.025));
    // 정보형 의도 보너스 (정보형 키워드는 SEO 진입 쉬움)
    if (infoIntentScore >= 65) baseShare *= 1.2;
    baseShare = Math.min(0.25, baseShare);

    const phases = [
        { key: 'month1', label: '1개월', factor: 0.10 },
        { key: 'month6', label: '6개월', factor: 0.50 },
        { key: 'month12', label: '12개월', factor: 1.00 },
        { key: 'month24', label: '24개월', factor: 1.50 },
    ];

    const monthlyImpressionsTotal = searchVolume * googleTrafficShare;
    const result: any = { baseShare: Math.round(baseShare * 10000) / 10000 };
    for (const p of phases) {
        const share = Math.min(0.30, baseShare * p.factor);
        const monthlyClicks = Math.round(monthlyImpressionsTotal * share);
        const monthlyRevenue = Math.round((monthlyClicks * publisherRpm) / 1000);
        result[p.key] = {
            share: Math.round(share * 10000) / 10000,
            monthlyClicks,
            monthlyRevenue,
        };
    }

    const m12Revenue = result.month12.monthlyRevenue;
    const summary = m12Revenue >= 100000
        ? `💎 12개월 후 월 ${(m12Revenue / 10000).toFixed(1)}만원 (블루오션 진입 가능)`
        : m12Revenue >= 30000
        ? `📈 12개월 후 월 ${(m12Revenue / 10000).toFixed(1)}만원 (안정형)`
        : m12Revenue >= 10000
        ? `🌱 12개월 후 월 ${(m12Revenue / 10000).toFixed(1)}만원 (입문형)`
        : `⚠️ 12개월 후 월 ${m12Revenue.toLocaleString()}원 (레드오션, 신생 블로거 비추천)`;

    return { ...result, summary };
}

export function calculateAdsenseRPM(params: {
    keyword: string;
    category: string;
    cpc: number;
    infoIntentScore: number;
    ymylScore: number;
    intentType?: SearchIntent;   // v3.7: 의도별 CTR 보정 (Phase 2.1)
}): number {
    const { keyword, category, cpc, infoIntentScore, ymylScore } = params;

    const baseCTR = CATEGORY_CTR[category] ?? CATEGORY_CTR.default;
    const adDensity = CATEGORY_AD_DENSITY[category] ?? CATEGORY_AD_DENSITY.default;
    const intentMultiplier = 0.6 + (infoIntentScore / 100) * 0.8;
    const ymylPenalty = ymylScore >= 70 ? 0.7 : ymylScore >= 40 ? 0.85 : 1.0;
    // 검색의도별 CTR 보정 (정보형 1.0, 상업조사 0.7, 거래형 0.4, 항해형 0.1)
    const intentType = params.intentType || classifySearchIntent(keyword).primary;
    const searchIntentMultiplier = INTENT_CTR_MULTIPLIER[intentType];

    const effectiveCTR = baseCTR * intentMultiplier * searchIntentMultiplier;
    const grossRpm = cpc * effectiveCTR * 1000 * adDensity * ymylPenalty;
    const publisherRpm = grossRpm * PUBLISHER_REVENUE_FACTOR;

    return Math.round(publisherRpm);
}

/**
 * 광고주 입찰 기준 Gross RPM (참고용, Publisher 수익 계산엔 사용 안 함)
 */
export function calculateGrossRPM(params: {
    keyword: string;
    category: string;
    cpc: number;
    infoIntentScore: number;
    ymylScore: number;
    intentType?: SearchIntent;
}): number {
    const { keyword, category, cpc, infoIntentScore, ymylScore } = params;
    const baseCTR = CATEGORY_CTR[category] ?? CATEGORY_CTR.default;
    const adDensity = CATEGORY_AD_DENSITY[category] ?? CATEGORY_AD_DENSITY.default;
    const intentMultiplier = 0.6 + (infoIntentScore / 100) * 0.8;
    const ymylPenalty = ymylScore >= 70 ? 0.7 : ymylScore >= 40 ? 0.85 : 1.0;
    const intentType = params.intentType || classifySearchIntent(keyword).primary;
    const searchIntentMultiplier = INTENT_CTR_MULTIPLIER[intentType];
    return Math.round(cpc * baseCTR * intentMultiplier * searchIntentMultiplier * 1000 * adDensity * ymylPenalty);
}

/**
 * 단일 키워드 → AdsenseKeywordData
 */
export function evaluateAdsenseKeyword(input: {
    keyword: string;
    searchVolume: number;
    documentCount: number;
    category: string;
    realCpc?: number;
    dataSource?: 'naver-api' | 'pro-validated' | 'estimated';
    proSourcesCount?: number;     // PRO에서 몇 개 소스 교차 등장했는지
    wikiHit?: boolean;             // 위키 페이지뷰 매칭 여부
}): AdsenseKeywordData {
    const { keyword, searchVolume, documentCount, category } = input;
    const dataSource = input.dataSource || 'estimated';

    // 신뢰도 등급 산출
    let dataConfidence: 'high' | 'medium' | 'low';
    let dataSourceReason: string;
    if (dataSource === 'naver-api') {
        dataConfidence = (searchVolume >= 100 && documentCount > 0) ? 'high' : 'medium';
        dataSourceReason = dataConfidence === 'high'
            ? '✅ 네이버 검색광고 API 실측 (검색량+문서수 모두 확보)'
            : '◐ 네이버 API 부분 데이터 (검색량 또는 문서수 부족)';
    } else if (dataSource === 'pro-validated') {
        dataConfidence = (searchVolume >= 100 && documentCount > 0) ? 'high' : 'medium';
        dataSourceReason = '✅ PRO 헌터 검증 (네이버 API 기반)';
    } else {
        dataConfidence = 'low';
        dataSourceReason = '⚠️ 추정값 (네이버 API 미사용 — 실제 검색량과 다를 수 있음)';
    }

    const cpc = input.realCpc && input.realCpc > 0
        ? input.realCpc
        : estimateCPC(keyword, category);

    const infoIntentScore = calculateInfoIntentScore(keyword);
    const ymyl = calculateYmylRisk(keyword);
    const safety = evaluateKeywordSafety(keyword);

    const searchIntent = classifySearchIntent(keyword);
    const estimatedRPM = calculateAdsenseRPM({
        keyword, category, cpc, infoIntentScore, ymylScore: ymyl.score,
        intentType: searchIntent.primary,
    });
    const grossRPM = calculateGrossRPM({
        keyword, category, cpc, infoIntentScore, ymylScore: ymyl.score,
        intentType: searchIntent.primary,
    });

    // 월 예상 수익 (Publisher 실수익) = 검색량 × 구글 트래픽 비율 × Publisher RPM / 1000
    const googleShare = GOOGLE_TRAFFIC_RATIO_LOCAL[category] ?? GOOGLE_TRAFFIC_RATIO_LOCAL.default;
    const monthlyImpressions = searchVolume * googleShare;
    const estimatedMonthlyRevenue = Math.round((monthlyImpressions * estimatedRPM) / 1000);
    const estimatedGrossMonthlyRevenue = Math.round((monthlyImpressions * grossRPM) / 1000);

    const competitionRatio = documentCount > 0 ? searchVolume / documentCount : 0;
    const blueOcean = calculateBlueOceanLevel(searchVolume, documentCount);
    const annualizedVolume = calculateAnnualizedVolume(keyword, searchVolume);
    const seasonalTiming = calculateSeasonalTiming(keyword);
    const zeroClickRisk = calculateZeroClickRisk(keyword);
    // SERP 도달률 = 연평균 × 0클릭 트래픽 할인 (Phase 1.3 + Phase 2.2 결합)
    const adjustedAnnualVolume = Math.round(annualizedVolume.annualAverage * zeroClickRisk.trafficDiscountRatio);
    const reachability = calculateReachabilityScenarios({
        searchVolume: adjustedAnnualVolume,
        competitionRatio,
        infoIntentScore,
        googleTrafficShare: googleShare,
        publisherRpm: estimatedRPM,
    });
    const ctr = (CATEGORY_CTR[category] ?? CATEGORY_CTR.default) *
        (0.6 + (infoIntentScore / 100) * 0.8);

    // 등급 — 다중 게이트 (점수만으로 결정 금지, CLAUDE.md 규칙)
    let grade: AdsenseKeywordData['grade'] = 'B';
    let gradeReason = '';

    // v3 완화 게이트 (4 에이전트 토론 반영):
    // - SSS: 5중 → 4중 (경쟁비 2+ 로 완화, 검색량 800+로 완화)
    // - SS: 4중 → 3중 (경쟁비 게이트 제거, 정보의도/수익으로만 판단)
    // v3.6: Publisher Revenue Factor 0.40 적용 후 게이트 재조정
    // (광고주 입찰 기준 월수익 → Publisher 실수익은 ×0.40이라 게이트도 ×0.40)
    if (
        estimatedMonthlyRevenue >= 60000 &&
        infoIntentScore >= 65 &&
        searchVolume >= 800 &&
        competitionRatio >= 2 &&
        safety.level !== 'danger'
    ) {
        grade = 'SSS';
        gradeReason = `💎 Publisher 실수익 월 ${(estimatedMonthlyRevenue / 10000).toFixed(1)}만원+ · 정보의도 ${infoIntentScore} · 경쟁비 ${competitionRatio.toFixed(1)}배`;
    } else if (
        estimatedMonthlyRevenue >= 24000 &&
        infoIntentScore >= 55 &&
        searchVolume >= 400 &&
        safety.level !== 'danger'
    ) {
        grade = 'SS';
        gradeReason = `🏆 Publisher 실수익 월 ${(estimatedMonthlyRevenue / 10000).toFixed(1)}만원+ · 정보의도 ${infoIntentScore}`;
    } else if (
        estimatedMonthlyRevenue >= 8000 &&
        infoIntentScore >= 45 &&
        searchVolume >= 150 &&
        safety.level !== 'danger'
    ) {
        grade = 'S';
        gradeReason = `⭐ 월 ${(estimatedMonthlyRevenue / 10000).toFixed(1)}만원+ · 안정형`;
    } else if (estimatedMonthlyRevenue >= 4000 && infoIntentScore >= 40) {
        grade = 'A';
        gradeReason = `📈 Publisher 실수익 월 ${(estimatedMonthlyRevenue / 10000).toFixed(1)}만원 · 입문형`;
    } else {
        grade = 'B';
        gradeReason = `예상수익 낮음 (월 ${estimatedMonthlyRevenue.toLocaleString()}원)`;
    }

    const writability = isWritableKeyword(keyword);
    const valueBreakdown = calculateValueScore({
        keyword, searchVolume, documentCount,
        estimatedCPC: cpc, infoIntentScore,
        safety: safety.level,
    });

    // Phase 3.1: 신뢰구간 산출 (revenue ± errorMargin)
    const ciDataConfidence: 'high' | 'medium' | 'low' = (input.dataSource === 'naver-api' || input.dataSource === 'pro-validated')
        ? (searchVolume >= 100 && documentCount > 0 ? 'high' : 'medium')
        : 'low';

    // Phase 4.4: AdSense 광고 게재 적합성
    const adsenseEligibility = evaluateAdsenseEligibility({
        keyword,
        ymylRisk: ymyl.level,
        safety: safety.level,
        dataConfidence: ciDataConfidence,
    });
    const revenueConfidenceInterval = calculateRevenueConfidenceInterval(estimatedMonthlyRevenue, {
        dataConfidence: ciDataConfidence,
        intentConfidence: searchIntent.confidence,
    });
    const revenueRangeAt12m = calculateRevenueConfidenceInterval(reachability.month12.monthlyRevenue, {
        dataConfidence: ciDataConfidence,
        intentConfidence: searchIntent.confidence,
    });

    return {
        keyword,
        searchVolume,
        documentCount,
        category,
        estimatedCPC: cpc,
        estimatedRPM,
        grossRPM,
        estimatedMonthlyRevenue,
        estimatedGrossMonthlyRevenue,
        reachability,
        annualizedVolume,
        seasonalTiming,
        searchIntent,
        zeroClickRisk,
        adsenseEligibility,
        blueOcean,
        revenueConfidenceInterval,
        revenueRangeAt12m,
        googleTrafficShare: googleShare,
        ctr: Math.round(ctr * 10000) / 10000,
        infoIntentScore,
        ymylRisk: ymyl.level,
        ymylRiskScore: ymyl.score,
        safety: safety.level,
        safetyReason: safety.reason,
        grade,
        gradeReason,
        competitionRatio: Math.round(competitionRatio * 100) / 100,
        writable: writability.writable,
        writableReason: writability.reason,
        valueScore: valueBreakdown.total,
        valueBreakdown,
        dataSource,
        dataConfidence,
        dataSourceReason,
        crossValidation: buildInitialCrossValidation(dataSource, input.proSourcesCount || 0, input.wikiHit === true),
    };
}

/**
 * 동기 단계: 이미 알려진 신호 기반 초기 교차검증 (네이버 자동완성은 비동기 enrich에서)
 */
function buildInitialCrossValidation(
    dataSource: 'naver-api' | 'pro-validated' | 'estimated',
    proSourcesCount: number,
    wikiHit: boolean
): CrossValidationResult {
    const signals = {
        naverApi: dataSource === 'naver-api' || dataSource === 'pro-validated',
        naverSuggest: false,           // 비동기 enrich에서 채워짐
        proCrossSource: proSourcesCount >= 2,  // PRO에서 2+ 소스 교차 등장
        wikiPageView: wikiHit,
        googleTrends: false,            // 향후 구글 트렌드 API 연동 시 활성
        youtubeResults: false,          // 향후 유튜브 API 연동 시 활성
    };
    return scoreCrossValidation(signals);
}

function scoreCrossValidation(signals: CrossValidationResult['signals']): CrossValidationResult {
    const score = Object.values(signals).filter(Boolean).length;
    let level: CrossValidationResult['level'];
    let summary: string;

    const labels: string[] = [];
    if (signals.naverApi) labels.push('네이버API');
    if (signals.naverSuggest) labels.push('네이버자동완성');
    if (signals.proCrossSource) labels.push('PRO교차');
    if (signals.wikiPageView) labels.push('위키조회');
    if (signals.googleTrends) labels.push('구글트렌드');
    if (signals.youtubeResults) labels.push('유튜브');

    if (score >= 3) {
        level = 'verified';
        summary = `⭐⭐⭐ 검증완료 (${labels.join(' + ')})`;
    } else if (score === 2) {
        level = 'double';
        summary = `⭐⭐ 이중검증 (${labels.join(' + ')})`;
    } else if (score === 1) {
        level = 'single';
        summary = `⭐ 단일소스 (${labels[0] || '미상'})`;
    } else {
        level = 'unverified';
        summary = '⚠️ 미검증 (소스 매칭 0개)';
    }

    return { level, score, signals, summary };
}

/**
 * 🎯 Phase 3.3: Levenshtein 거리 기반 자동완성 매칭 정밀도 강화
 * 기존 부분 매칭(includes)은 false positive 많음 ("대출"이 "한도대출계산"에 매칭).
 * Levenshtein 정규화 거리 ≤ 0.3 (즉 70%+ 일치) 또는 토큰 단위 정확 일치로 강화.
 */
function levenshteinDistance(a: string, b: string): number {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost,
            );
        }
    }
    return dp[m][n];
}

function normalizedLevenshtein(a: string, b: string): number {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 0;
    return levenshteinDistance(a, b) / maxLen;
}

/**
 * 자동완성 매칭 정밀도 검증
 *  1. 정확 일치 (lowercase, 공백 제거 비교) → 매칭
 *  2. 토큰 단위 완전 포함 (suggest 결과의 모든 토큰이 keyword에 있음) → 매칭
 *  3. 정규화 Levenshtein 거리 ≤ 0.30 → 매칭 (단, 짧은 키워드는 더 엄격)
 *  - 최소 길이: 짧은 키워드(< 6자)는 정확 일치만 인정 (false positive 방지)
 */
export function isAutocompleteMatch(keyword: string, suggest: string): boolean {
    const k = String(keyword || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const s = String(suggest || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!k || !s) return false;

    // 정확 일치
    const kNoSpace = k.replace(/\s+/g, '');
    const sNoSpace = s.replace(/\s+/g, '');
    if (kNoSpace === sNoSpace) return true;

    // 짧은 키워드는 정확 일치만 (false positive 방지)
    if (kNoSpace.length < 6 || sNoSpace.length < 6) return false;

    // 토큰 단위 완전 포함 (양방향)
    const kTokens = k.split(/\s+/).filter(t => t.length >= 2);
    const sTokens = s.split(/\s+/).filter(t => t.length >= 2);
    if (kTokens.length > 0 && sTokens.length > 0) {
        const sInK = sTokens.every(st => kTokens.some(kt => kt.includes(st) || st.includes(kt)));
        const kInS = kTokens.every(kt => sTokens.some(st => st.includes(kt) || kt.includes(st)));
        if (sInK || kInS) return true;
    }

    // Levenshtein 정규화 거리 ≤ 0.30
    const dist = normalizedLevenshtein(kNoSpace, sNoSpace);
    return dist <= 0.30;
}

/**
 * 🔥 비동기 교차 검증 enrichment
 *  - 네이버 자동완성 API 호출하여 키워드가 실제 사용자 검색에 등장하는지 검증
 *  - 호출 비용 큼 → TOP N 키워드에만 선택 적용
 *  - Phase 3.3: Levenshtein 거리 기반 정밀 매칭 (false positive 차단)
 */
export async function enrichWithCrossValidation(
    items: AdsenseKeywordData[],
    config: { naverClientId: string; naverClientSecret: string }
): Promise<void> {
    console.log(`[ADSENSE-CROSS-VAL] 🔍 ${items.length}개 키워드 자동완성 교차검증 시작`);
    let hits = 0;

    // 동시 호출 제한 (네이버 rate limit 보호)
    const CONCURRENCY = 4;
    for (let i = 0; i < items.length; i += CONCURRENCY) {
        const batch = items.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(async (item) => {
            try {
                const firstToken = item.keyword.split(/\s+/)[0] || item.keyword;
                const suggests = await getNaverAutocompleteKeywords(firstToken, {
                    clientId: config.naverClientId,
                    clientSecret: config.naverClientSecret,
                });
                // Phase 3.3: Levenshtein + 토큰 단위 정확 매칭 (false positive 차단)
                const hit = suggests.some(s => isAutocompleteMatch(item.keyword, String(s || '')));
                if (hit) {
                    hits++;
                    item.crossValidation.signals.naverSuggest = true;
                    Object.assign(item.crossValidation, scoreCrossValidation(item.crossValidation.signals));
                }
            } catch (err: any) {
                // 단일 실패 무시 (다른 신호로 평가됨)
            }
        }));
    }

    console.log(`[ADSENSE-CROSS-VAL] ✅ ${hits}/${items.length}개 자동완성 hit (실제 사용자 검색 증거)`);
}

// ============================================================
// 4.4) 가치 점수 (Value Score) — 황금키워드 가치 종합 평가
// ============================================================
//
// 글쓰기 가능 + 카테고리 적합 ≠ 가치 있는 키워드.
// 진짜 가치 = 실제 트래픽 + 광고 수익 + 상위노출 가능성 + 안전성.
//
// 가치점수(0~100) 계산식:
//   - 검색량 가산 (log10 scale): max +25
//   - 황금비율 가산 (검색/문서, 1배 이상): max +25
//   - CPC 가산 (1000원 기준): max +15
//   - 정보의도 가산: max +15
//   - 구체성 가산 (토큰수 + 액션패턴 다중매칭): max +20
//   - 안전성 페널티: caution -10, danger -50
//   - 시즌 페널티: 시즌키워드인데 비시즌 -15
//
// 가치 게이트 (모두 통과 필수):
//   1. 검색량 ≥ 200/월 (이하는 글 써도 트래픽 0)
//   2. 황금비율 ≥ 0.3 (이하는 레드오션, 상위노출 불가)
//   3. CPC ≥ 100원 (이하는 광고 클릭해도 무수익)
//   4. 정보의도 ≥ 40 (이하는 광고 클릭률 낮음)
//   5. valueScore ≥ 50 (종합 가치)
//   6. 시즌 키워드면 in-season만

import { detectSeasonality } from './profit-golden-keyword-engine';

export interface ValueScoreBreakdown {
    total: number;            // 0~100
    searchVolume: number;     // max 25
    goldenRatio: number;      // max 25
    cpc: number;              // max 15
    infoIntent: number;       // max 15
    specificity: number;      // max 20
    safetyPenalty: number;    // 0 ~ -50
    seasonPenalty: number;    // 0 or -15
    reason: string;
}

export function calculateValueScore(data: {
    keyword: string;
    searchVolume: number;
    documentCount: number;
    estimatedCPC: number;
    infoIntentScore: number;
    safety: 'safe' | 'caution' | 'danger';
}): ValueScoreBreakdown {
    const sv = data.searchVolume;
    const dc = data.documentCount;
    const ratio = dc > 0 ? sv / dc : 0;

    // 1. 검색량 (log10 기반: 100→10, 1000→15, 10000→20, 100000→25)
    const svScore = sv > 0 ? Math.min(25, Math.max(0, (Math.log10(Math.max(sv, 1)) - 1) * 6.25)) : 0;

    // 2. 황금비율 (0.3→5, 1→12, 3→20, 10→25)
    let ratioScore = 0;
    if (ratio >= 10) ratioScore = 25;
    else if (ratio >= 5) ratioScore = 22;
    else if (ratio >= 3) ratioScore = 20;
    else if (ratio >= 1) ratioScore = 12 + (ratio - 1) * 4;
    else if (ratio >= 0.3) ratioScore = 5 + (ratio - 0.3) * 10;
    else ratioScore = 0;

    // 3. CPC (100원→3, 500원→8, 1000원→12, 3000원→15)
    let cpcScore = 0;
    const cpc = data.estimatedCPC;
    if (cpc >= 3000) cpcScore = 15;
    else if (cpc >= 1000) cpcScore = 12;
    else if (cpc >= 500) cpcScore = 8;
    else if (cpc >= 100) cpcScore = 3 + (cpc - 100) / 80;
    else cpcScore = 0;

    // 4. 정보의도 (단순 비례)
    const intentScore = (data.infoIntentScore / 100) * 15;

    // 5. 구체성 — 토큰 수 × 4 + 액션 패턴 매칭 개수 × 2
    const tokens = data.keyword.split(/[\s·,/]+/).filter(t => t.length >= 1);
    const lower = data.keyword.toLowerCase();
    const actionMatches = ACTIONABLE_PATTERNS.filter(p => lower.includes(p.toLowerCase())).length;
    const specificity = Math.min(20, tokens.length * 4 + actionMatches * 2);

    // 6. 안전성 페널티
    let safetyPenalty = 0;
    if (data.safety === 'danger') safetyPenalty = -50;
    else if (data.safety === 'caution') safetyPenalty = -10;

    // 7. 시즌 페널티
    const seasonality = detectSeasonality(data.keyword);
    const seasonPenalty = (seasonality.isSeasonal && !seasonality.isInSeason) ? -15 : 0;

    const total = Math.max(0, Math.min(100, Math.round(
        svScore + ratioScore + cpcScore + intentScore + specificity + safetyPenalty + seasonPenalty
    )));

    const parts: string[] = [];
    if (svScore >= 18) parts.push('검색량풍부');
    if (ratioScore >= 18) parts.push('블루오션');
    else if (ratioScore >= 10) parts.push('경쟁적정');
    if (cpcScore >= 12) parts.push('고CPC');
    if (intentScore >= 10) parts.push('광고적합');
    if (specificity >= 14) parts.push('구체적');
    if (safetyPenalty < 0) parts.push(`⚠️안전감점${safetyPenalty}`);
    if (seasonPenalty < 0) parts.push('⏰비시즌');
    const reason = parts.length > 0 ? parts.join(' · ') : '평범';

    return {
        total,
        searchVolume: Math.round(svScore),
        goldenRatio: Math.round(ratioScore),
        cpc: Math.round(cpcScore),
        infoIntent: Math.round(intentScore),
        specificity: Math.round(specificity),
        safetyPenalty,
        seasonPenalty,
        reason,
    };
}

// ============================================================
// 4.5) 글쓰기 가능 키워드 게이트 (사용자 핵심 요구)
// ============================================================
//
// 문제: 뉴스 RSS/커뮤니티 명사 추출은 "금리", "대출", "이재명", "윤석열" 같은
//      단일 명사·시사·일회성 뉴스 토큰을 다수 반환 → 블로그 글로 못 쓰는 키워드.
// 해결: 글로 풀어쓸 수 있는 형태의 키워드만 통과시키는 강제 게이트.
//
// 통과 조건 (모두 충족):
//  1. 길이 ≥ 5자 (단일 1~4자 명사 차단)
//  2. 토큰 수 ≥ 2 (단어 하나뿐인 키워드 차단)
//  3. 정치/시사 인물·기관 토큰 미포함
//  4. 일회성 뉴스 토큰 미포함 (속보/논란/사망/체포 등)
//  5. 액션 가능 패턴 포함 OR (토큰 ≥ 3 AND 길이 ≥ 8자)
//     → "방법/추천/비교/후기/계산기..." 등의 글쓰기 의도 마커가 있거나
//       구체적인 롱테일(3토큰+ 8자+)이어야 함

/**
 * 🎤 인물·연예인 의존 키워드 차단
 *  - "아이유베개", "나연 메이크업", "장원영 다이어트" 같은 인물 의존 키워드는
 *    인물의 인기가 떨어지면 검색량 즉시 0 → 콘텐츠 수명 짧음
 *  - 200+ 한국 유명 인물/그룹/캐릭터명 + NER 패턴 결합 차단
 */
const CELEBRITY_NAMES = new Set<string>([
    // K-Pop 솔로/그룹 멤버 (자주 검색 상위)
    '아이유', '뉴진스', '르세라핌', '아이브', '스테이씨', '에스파', '블랙핑크', '트와이스',
    '있지', '있지유나', '제니', '리사', '로제', '지수', '나연', '쯔위', '사나', '모모', '미나', '정연', '다현', '채영',
    '카리나', '윈터', '닝닝', '지젤', '안유진', '장원영', '레이', '가을', '리즈', '이서',
    '카즈하', '사쿠라', '채원', '허윤진', '김채원', '홍은채', '미야와키사쿠라',
    '하니', '민지', '하린', '다니엘', '혜인', '하니뉴진스',
    '아이즈원', '여자아이들', '미연', '민니', '소연', '슈화', '우기',
    '우주소녀', '오마이걸', '러블리즈', '에이프릴',
    'BTS', '방탄', '뷔', '정국', 'RM', '진', '슈가', '제이홉', '지민',
    '스트레이키즈', '엔하이펜', '투바투', '제로베이스원', '엑소', '세븐틴', 'NCT',
    '이찬원', '임영웅', '영탁', '장민호', '김호중', '이무진', '폴킴',
    // 배우/MC
    '송혜교', '전지현', '김혜수', '김희선', '한가인', '김태희', '한지민', '박보영', '박민영',
    '아이린', '슬기', '예리', '웬디', '조이',
    '류준열', '박서준', '이종석', '이민호', '공유', '현빈', '강동원', '이병헌', '하정우',
    '유재석', '강호동', '김구라', '신동엽', '서장훈', '이수근',
    // 캐릭터
    '뽀로로', '핑크퐁', '핑퐁', '아기상어', '카카오프렌즈', '라이언', '춘식이', '어피치',
]);

const PERSON_DEPENDENT_PATTERNS = [
    '메이크업', '화장법', '뷰티', '룩', '스타일', '패션', '코디',
    '컴백', '복귀', '근황', '소식', '인스타', '데이트', '열애',
    '프로필', '사주', '나이', '생년월일', '성형', '키', '몸무게', '다이어트',
    '발언', '공항패션', '시구', '광고', '화보',
];

/**
 * 인물 의존 키워드 감지
 * 1. 명확한 유명인 이름 포함 → 차단
 * 2. 2~3자 한글 토큰 + 인물 의존 패턴 결합 → 차단
 */
export function isPersonDependentKeyword(keyword: string): { dependent: boolean; reason: string } {
    const lower = String(keyword || '').toLowerCase();
    // 1. 명시 유명인 이름
    for (const name of CELEBRITY_NAMES) {
        if (lower.includes(name.toLowerCase())) {
            return { dependent: true, reason: `🎤 인물 의존 키워드 차단 ("${name}" 포함 — 인기 변동 시 검색량 0)` };
        }
    }
    // 2. 인물 의존 패턴 + 짧은 인명 추정 토큰 결합
    const hasPersonPattern = PERSON_DEPENDENT_PATTERNS.some(p => lower.includes(p));
    if (hasPersonPattern) {
        const tokens = keyword.split(/\s+/).filter(t => t.length >= 1);
        // 토큰 중 2~3자 순수 한글 단어 (인명 후보)
        const namelikeToken = tokens.find(t =>
            /^[가-힣]{2,3}$/.test(t) &&
            !['추천', '비교', '순위', '방법', '후기', '리뷰', '효과', '효능', '가격', '제품', '용품', '음식', '요리', '식품', '상품'].includes(t)
        );
        if (namelikeToken) {
            return { dependent: true, reason: `🎤 인물 의존 추정 ("${namelikeToken}" + "${PERSON_DEPENDENT_PATTERNS.find(p => lower.includes(p))}" — 인물 의존 가능성 높음)` };
        }
    }
    return { dependent: false, reason: '' };
}

const POLITICAL_NOISE_TOKENS = [
    '이재명', '윤석열', '한동훈', '이준석', '문재인', '박근혜', '대통령', '국회', '국회의원',
    '장관', '청와대', '국감', '국정감사', '여당', '야당', '민주당', '국민의힘', '대선', '총선',
    '검찰', '경찰청', '검사', '판사', '판결', '구속', '체포', '구형', '선고',
    '도지사', '시장님', '구청장', '시의원', '의원',
];

/**
 * 🚨 YMYL × 비전문가 결합 차단
 * 의료/금융/법률 영역에 일반인 표현(리뷰/후기/초보/추천 등)이 결합되면
 * 의료법/투자자문업/광고법 위반 위험 → 강제 차단
 */
const YMYL_NOVICE_BLOCK_PAIRS: Array<{ ymyl: string[]; novice: string[]; reason: string }> = [
    {
        ymyl: ['병원', '의원', '의사', '진료', '의료', '치과', '한의원', '피부과', '비뇨', '산부인과', '정형외과', '재활'],
        novice: ['리뷰', '후기', '추천', '베스트', '솔직', '내돈내산', '순위', 'top', 'best', '잘하는', '좋은'],
        reason: '🚨 의료기관 리뷰/추천은 의료법 + 의료광고 사전심의 위반',
    },
    {
        ymyl: ['주식', '투자', '코인', '비트코인', '증권', '선물', '옵션', '레버리지', '공매도', '단타'],
        novice: ['초보', '입문', '시작', '추천', '꿀팁', '비법', '비밀', '필승', '확실한', '돈버는'],
        reason: '🚨 투자 자문/추천은 자본시장법 위반 (투자자문업 미등록)',
    },
    {
        ymyl: ['약', '영양제', '한약', '치료제', '처방약', '치료법'],
        novice: ['효과', '효능', '봤어요', '낫는', '치유', '완치', '확실한', '비법'],
        reason: '⚠️ 의약품 효능 후기는 약사법/표시광고법 위반 위험',
    },
    {
        ymyl: ['보험', '실손', '암보험', '종신보험'],
        novice: ['추천', '비교', '솔직', '꿀팁', '비밀', '필수', '베스트'],
        reason: '⚠️ 보험 비교/추천은 보험설계사 영역 (보험업법 위반 위험)',
    },
    {
        ymyl: ['대출', '신용대출', '사금융', '대부'],
        novice: ['추천', '비교', '잘되는', '꿀팁', '비법', '쉬운', '빠른'],
        reason: '🚨 대출 추천은 등록 금융사 영역 (대부업법/광고법 위반)',
    },
    {
        ymyl: ['변호사', '소송', '고소', '판결', '재판'],
        novice: ['추천', '잘하는', '솔직', '후기', '비교', '베스트', '순위'],
        reason: '⚠️ 법률 자문은 변호사법 위반',
    },
    {
        ymyl: ['수술', '시술', '필러', '보톡스', '레이저', '쌍꺼풀', '코성형', '지방흡입'],
        novice: ['후기', '리뷰', '추천', '잘하는', '솔직', '효과'],
        reason: '🚨 시술 후기/추천은 의료법 위반 (의료기관 외 광고 금지)',
    },
];

const ONE_TIME_NEWS_TOKENS = [
    '속보', '단독', '특보', '긴급', '논란', '의혹', '폭로', '발언', '인터뷰',
    '사망', '부고', '별세', '실종', '체포', '구속', '구형', '징역',
    '재판', '기소', '소환', '압수수색', '내사', '수사',
    '인용', '반응', '답변', '비판', '해명', '공식입장',
];

const ACTIONABLE_PATTERNS = [
    // 정보형
    '방법', '하는법', '하는방법', '만드는법', '만들기', '사용법', '활용법',
    '이유', '원인', '왜', '뜻', '의미', '정의', '효능', '효과', '부작용', '주의사항',
    '종류', '유형', '차이', '차이점', '다른점',
    // 비교/리뷰
    '추천', '비교', '순위', '랭킹', 'top', 'best', '베스트', '인기',
    '1위', '톱', 'vs',
    // 가이드/정리
    '가이드', '정리', '총정리', '꿀팁', '노하우', '비결',
    // 후기/리뷰
    '후기', '리뷰', '사용기', '체험기', '내돈내산', '솔직후기', '한달',
    // 도구/계산
    '계산기', '계산법', '계산방법', '조회', '확인', '신청', '신청방법',
    // 가격/쇼핑
    '가격', '비용', '얼마', '저렴', '최저가', '할인', '쿠폰', '특가', '구매',
    // 시간/주기
    '언제', '얼마나', '며칠', '몇일',
    // 솔루션
    '해결', '해결법', '해결방법', '문제', '에러', '오류',
    // 추천형
    '대신', '대체', '대안',
    // 신청/혜택
    '혜택', '지원금', '보조금', '환급', '공제',
    // 후기/체험
    '리얼', '직접', '실제',
    // 강조형
    '꼭', '필수', '베스트',
];

export interface WritabilityCheck {
    writable: boolean;
    reason: string;
}

/**
 * 글쓰기 가능 여부 게이트.
 * AdSense 결과의 모든 키워드는 이 게이트 통과 필수.
 *
 * v3.7 — Phase 2.3: 신생 블로거 모드 옵션 추가
 *   - newbie=true (기본): 5토큰+ AND 8자+ 필수 (DA<20 도메인 진입 가능 필수 조건)
 *   - newbie=false: 기존 2토큰+ 5자+ (전통 게이트)
 */
export function isWritableKeyword(keyword: string, options: { newbie?: boolean } = {}): WritabilityCheck {
    const newbie = options.newbie === true;
    const kw = String(keyword || '').trim();
    const lower = kw.toLowerCase();

    // 1. 최소 길이
    if (kw.length < 5) {
        return { writable: false, reason: '길이 부족 (5자 미만 — 단일 명사)' };
    }

    // 2. 토큰 수 (한글/영문 분리, 공백 또는 한↔영/숫자 경계)
    const tokens = kw.split(/[\s·,/]+/).filter(t => t.length >= 1);
    if (tokens.length < 2) {
        return { writable: false, reason: '토큰 1개 (단일 단어로는 글 못씀)' };
    }

    // 3. 정치/시사 인물 차단
    for (const noise of POLITICAL_NOISE_TOKENS) {
        if (lower.includes(noise.toLowerCase())) {
            return { writable: false, reason: `정치/시사 키워드 차단 (${noise})` };
        }
    }

    // 4. 일회성 뉴스 차단
    for (const news of ONE_TIME_NEWS_TOKENS) {
        if (lower.includes(news.toLowerCase())) {
            return { writable: false, reason: `일회성 뉴스 차단 (${news})` };
        }
    }

    // 4.4 🎤 인물·연예인 의존 키워드 차단 (Phase 4.1)
    const personCheck = isPersonDependentKeyword(kw);
    if (personCheck.dependent) {
        return { writable: false, reason: personCheck.reason };
    }

    // 4.5 🚨 YMYL × 비전문가 결합 차단 (병원리뷰/주식초보/의료후기 등)
    for (const pair of YMYL_NOVICE_BLOCK_PAIRS) {
        const hasYmyl = pair.ymyl.some(y => lower.includes(y.toLowerCase()));
        const hasNovice = pair.novice.some(n => lower.includes(n.toLowerCase()));
        if (hasYmyl && hasNovice) {
            const matchedY = pair.ymyl.find(y => lower.includes(y.toLowerCase()));
            const matchedN = pair.novice.find(n => lower.includes(n.toLowerCase()));
            return { writable: false, reason: `${pair.reason} ("${matchedY}" + "${matchedN}")` };
        }
    }

    // 4.7 ⏰ 시기 지난 키워드 차단 (출시일/예정/공개일/런칭/발매일 + 과거 연도)
    const releaseTokens = ['출시일', '출시 예정', '공개일', '공개 예정', '런칭', '발매일', '예약판매', '사전예약', '공식 출시'];
    if (releaseTokens.some(t => lower.includes(t))) {
        const yearMatch = kw.match(/(?:20)?(2[0-9])(?!\d)/);
        if (yearMatch) {
            const year = parseInt('20' + yearMatch[1], 10);
            const currentYear = new Date().getFullYear();
            if (year < currentYear) {
                return { writable: false, reason: `⏰ 출시 지난 키워드 차단 (${year}년 < 현재 ${currentYear}년)` };
            }
        }
        // 갤럭시 s24 이전, 아이폰 16 이전 등 모델명 기반 차단
        const expiredModels = [
            { pattern: /갤럭시\s*s\s*(\d+)/i, threshold: 26 },  // s26 미만 차단
            { pattern: /갤럭시\s*z\s*폴드\s*(\d+)/i, threshold: 7 },
            { pattern: /갤럭시\s*z\s*플립\s*(\d+)/i, threshold: 7 },
            { pattern: /아이폰\s*(\d+)/i, threshold: 17 },  // iPhone 17 미만 차단
        ];
        for (const m of expiredModels) {
            const match = kw.match(m.pattern);
            if (match && parseInt(match[1], 10) < m.threshold) {
                return { writable: false, reason: `⏰ 출시 지난 모델 (${match[0]} < ${m.threshold} 세대)` };
            }
        }
    }

    // 4.8 ⏰ 지난 시즌 차단 (2024 어버이날, 2023 추석 등)
    const seasonTokens = ['어버이날', '어린이날', '추석', '설날', '발렌타인', '화이트데이', '크리스마스', '연말정산', '근로장려금', '자녀장려금'];
    if (seasonTokens.some(t => lower.includes(t))) {
        const yearMatch = kw.match(/(?:20)?(2[0-9])(?!\d)/);
        if (yearMatch) {
            const year = parseInt('20' + yearMatch[1], 10);
            const currentYear = new Date().getFullYear();
            if (year < currentYear) {
                return { writable: false, reason: `⏰ 지난 시즌 차단 (${year}년 < 현재 ${currentYear}년)` };
            }
        }
    }

    // 5. 액션 가능 패턴 OR 충분한 specificity (롱테일)
    const hasActionable = ACTIONABLE_PATTERNS.some(p => lower.includes(p.toLowerCase()));
    const isLongtail = tokens.length >= 3 && kw.length >= 8;
    if (!hasActionable && !isLongtail) {
        return { writable: false, reason: '글쓰기 패턴 없음 + 롱테일 아님 (방법/추천/리뷰 등 부재)' };
    }

    // 5.5 🆕 신생 블로거 모드: 4토큰+ AND 10자+ 필수 (DA<20 진입 조건, 5명 토론 후 완화)
    if (newbie) {
        if (tokens.length < 4 || kw.length < 10) {
            return {
                writable: false,
                reason: `🌱 신생 블로거 모드: 4토큰+ AND 10자+ 필수 (현재 ${tokens.length}토큰/${kw.length}자) — 짧은 키워드는 DA 높은 사이트가 독점`,
            };
        }
    }

    // 6. 숫자만 또는 영문약자만 (글 작성 어려움)
    if (/^[\d\s]+$/.test(kw) || /^[A-Z\s]+$/.test(kw)) {
        return { writable: false, reason: '숫자/대문자약어만으로 구성' };
    }

    return {
        writable: true,
        reason: hasActionable
            ? `✍️ 액션 패턴 포함 (${ACTIONABLE_PATTERNS.find(p => lower.includes(p.toLowerCase()))})`
            : `✍️ 구체 롱테일 (${tokens.length}토큰)`,
    };
}

// ============================================================
// 5) 카테고리 → 데이터소스 직접 라우팅 (사용자 지적 핵심)
// ============================================================

/**
 * 각 AdSense 카테고리에 가장 적합한 source-registry 소스 ID 매핑.
 * PRO 헌터의 일반 fallback이 부적합한 키워드를 반환하는 문제 해결.
 */
// ✅ 라이브 검증 통과한 30개 소스만 사용 (죽은 13개 제거 후 재매핑)
const ADSENSE_CATEGORY_SOURCES: Record<string, string[]> = {
    // 💰 금융·재테크
    finance: ['finance', 'naver-news', 'yna-breaking', 'mk-realestate'],
    loan: ['finance', 'naver-news', 'yna-breaking'],
    insurance: ['naver-news', 'finance', 'yna-breaking'],

    // 🏠 부동산
    realestate: ['realestate', 'mk-realestate', 'naver-news'],

    // ⚖️ 법률
    legal: ['naver-news', 'yna-breaking'],

    // 🏥 의료/건강
    medical: ['health', 'naver-news', 'yna-breaking'],
    dental: ['health', 'naver-news'],
    plastic: ['health', 'oliveyoung'],
    health: ['health', 'mom-cafe', 'babynews'],
    supplement: ['health', 'mom-cafe', 'oliveyoung'],
    diet: ['health', 'mom-cafe', 'oliveyoung'],

    // 💻 IT·테크
    it: ['clien', 'gamenews', 'zdnet', 'ppomppu'],
    tech: ['clien', 'gamenews', 'zdnet', 'ppomppu'],
    laptop: ['clien', 'ppomppu', 'zdnet'],
    smartphone: ['clien', 'ppomppu', 'zdnet'],
    appliance: ['ppomppu', 'clien'],

    // 📚 교육/자격증
    education: ['moel', 'naver-news', 'babynews'],
    certificate: ['moel', 'naver-news'],

    // 💼 비즈니스/취업
    business: ['finance', 'mafra', 'naver-news'],
    job: ['moel', 'naver-news'],

    // ✈️ 여행
    travel: ['theqoo', 'hani-culture', 'ppomppu', 'youtube-kr'],
    hotel: ['theqoo', 'hani-culture', 'ppomppu'],
    flight: ['hani-culture', 'ppomppu'],

    // 👶 육아
    parenting: ['mom-cafe', 'babynews', 'theqoo'],
    baby: ['mom-cafe', 'babynews'],

    // 🛋️ 인테리어/리빙
    interior: ['ppomppu', 'theqoo', 'mk-realestate'],
    moving: ['ppomppu', 'mk-realestate'],
    wedding: ['theqoo', 'womentimes'],
    living: ['mom-cafe', 'ppomppu', 'theqoo', 'mk-realestate'],
    diy: ['clien', 'ppomppu'],
    gardening: ['mom-cafe', 'theqoo', 'mafra'],

    // 💄 뷰티
    beauty: ['oliveyoung', 'theqoo', 'womentimes'],
    skincare: ['oliveyoung', 'theqoo', 'womentimes'],
    cosmetic: ['oliveyoung', 'theqoo', 'womentimes'],
    fashion: ['musinsa', 'theqoo', 'womentimes'],

    // 🍳 음식
    recipe: ['recipe', 'mom-cafe', 'mafra'],
    cooking: ['recipe', 'mom-cafe', 'mafra'],
    food: ['recipe', 'mafra', 'theqoo'],

    // ⭐ 리뷰/쇼핑
    review: ['ppomppu', 'dcinside', 'clien'],
    shopping: ['ppomppu', 'theqoo', 'oliveyoung', 'musinsa'],

    // 🐶 펫
    pet: ['theqoo', 'mom-cafe'],

    // 🎮 게임
    game: ['gamenews', 'ruliweb', 'dcinside'],

    // 🎬 엔터
    movie: ['theqoo', 'naver-news', 'natepann', 'sbs-ent'],
    drama: ['theqoo', 'naver-news', 'natepann', 'sbs-ent'],
    music: ['theqoo', 'natepann', 'sbs-ent'],
    celeb: ['theqoo', 'natepann', 'naver-news', 'sbs-ent'],
    entertainment: ['theqoo', 'natepann', 'naver-news', 'sbs-ent'],

    // 🏃 스포츠
    sports: ['mlbpark', 'naver-news'],

    // 💡 생활/꿀팁
    life: ['ppomppu', 'mom-cafe', 'clien'],
    life_tips: ['mom-cafe', 'ppomppu', 'clien', 'theqoo'],

    // 📊 세금
    tax: ['finance', 'naver-news', 'yna-breaking'],

    // 🚗 자동차
    car: ['bobaedream', 'ppomppu'],

    // 📲 앱
    app: ['clien', 'naver-news', 'zdnet'],

    // 📷 취미
    hobby: ['clien', 'theqoo', 'ppomppu', 'gamenews'],

    // 💎 정부 지원금 — 살아남은 정책 RSS 활용
    subsidy: ['moel', 'env-kr', 'mafra', 'naver-news', 'finance', 'mom-cafe'],

    // 📅 시즌 키워드
    season: ['naver-news', 'theqoo', 'ppomppu', 'mom-cafe', 'wikipedia-ko', 'hani-culture', 'sbs-ent'],

    // 🎯 전체 (자동)
    all: ['naver-news', 'ppomppu', 'wikipedia-ko', 'theqoo', 'yna-breaking'],

    // 🏠 네이버 홈판 — 메인 노출 특화 (실시간 트렌드 + 신선도 우선)
    'naver-home': ['naver-news', 'theqoo', 'natepann', 'ppomppu', 'wikipedia-ko', 'mom-cafe', 'todayhumor', 'yna-breaking'],
};

/**
 * 🌱 카테고리 빌트인 시드 — 외부 소스 실패해도 결과 0개 방지.
 * 자동완성 입력으로 사용 → 롱테일 확장.
 * 각 토큰은 카테고리에서 가장 검색량 많은 핵심 단어들.
 */
/**
 * 📅 월별 시즌 황금 시드 뱅크 — 매월 검색량 폭증하는 키워드
 * 현재 월 자동 감지하여 season 카테고리에서 사용.
 * 각 월에 정부 시즌 키워드 + 명절/기념일 + 계절 트렌드 모두 포함.
 */
const MONTHLY_SEED_BANK: Record<number, string[]> = {
    1: [  // 신년·연말정산
        '연말정산', '연말정산 환급', '연말정산 간소화', '연말정산 공제',
        '신년계획', '새해 운동', '새해 다이어트', '신정 연휴',
        '겨울방학 캠프', '겨울 스키장', '겨울 보일러', '겨울 옷 추천',
        '입춘 음식', '한파 대비', '난방비 절약', '전기장판 추천',
        '신년 인사말', '신년 명함', '새해 인사말', '연말 보너스',
    ],
    2: [  // 설날·발렌타인
        '설날 선물', '설날 인사말', '세뱃돈', '설 연휴', '구정 선물세트',
        '명절 음식', '떡국 끓이는 법', '설 차례상', '명절 증후군',
        '발렌타인 선물', '발렌타인 초콜릿', '발렌타인 데이',
        '입학식 선물', '새학기 준비물', '초등 입학 준비',
        '졸업 선물', '졸업식 코사지', '꽃샘추위', '환절기 건강',
    ],
    3: [  // 새학기·화이트데이·벚꽃
        '화이트데이 선물', '화이트데이 사탕', '화이트데이 캔디',
        '새학기 준비물', '입학식', '초등 책가방 추천', '학용품 세트',
        '벚꽃 명소', '벚꽃 개화시기', '벚꽃 축제', '봄 나들이',
        '봄 옷 추천', '꽃샘추위 옷차림', '미세먼지 마스크',
        '이사철 견적', '이사 짐 정리', '봄 청소', '환절기 알레르기',
    ],
    4: [  // 봄나들이·식목일·총선
        '벚꽃 엔딩', '봄 나들이 옷', '식목일 행사', '봄 캠핑',
        '4월 가볼만한 곳', '봄 여행지 추천', '봄 등산',
        '봄 미세먼지', '환절기 옷차림', '봄 알레르기 약',
        '봄 다이어트', '봄 화장법', '봄 메이크업', '봄 네일',
        '벚꽃 사진 명소', '봄꽃 축제 일정', '주말 나들이 추천',
        '근로장려금 신청', '근로장려금 자격', '자녀장려금 신청',
    ],
    5: [  // 가정의 달
        '어린이날 선물', '어린이날 행사', '어린이날 이벤트',
        '어버이날 선물', '카네이션 꽃다발', '어버이날 카드', '용돈 봉투',
        '스승의날 선물', '스승의날 카네이션', '스승의날 카드',
        '부부의날 선물', '성년의날 선물', '가정의달 행사',
        '5월 여행지 추천', '5월 가볼만한 곳', '봄 캠핑',
        '종합소득세 신고', '종합소득세 환급', '근로장려금 신청기간',
    ],
    6: [  // 호국보훈·장마
        '현충일 의미', '호국보훈의 달', '국가유공자 혜택',
        '장마 대비', '장마철 빨래', '제습기 추천', '곰팡이 제거',
        '장마철 옷 관리', '실내 습도 관리', '장마 끝나는 시기',
        '여름 시작', '에어컨 청소', '여름 이불 추천',
        '여름 다이어트', '여름 옷 정리', '여름 메이크업',
        '하지 음식', '6월 여행지', '여름 휴가 계획',
    ],
    7: [  // 여름휴가·물놀이
        '여름 휴가지 추천', '국내 여행지 추천', '제주도 여행 코스',
        '물놀이 용품', '워터파크 할인', '해수욕장 추천', '계곡 추천',
        '여름 수영복 추천', '래쉬가드 추천', '비치웨어',
        '에어컨 추천', '에어컨 청소', '에어컨 전기세',
        '선풍기 추천', '서큘레이터 추천', '제습기 추천',
        '여름 보양식', '삼계탕 끓이는 법', '복날 음식',
        '여름 휴가 옷', '여름 캠핑', '캠핑 용품',
    ],
    8: [  // 늦여름·광복절·휴가 마무리
        '광복절 의미', '광복절 행사', '광복절 휴일',
        '말복 음식', '처서 의미', '여름 끝 환절기',
        '여름 방학 숙제', '방학 자유주제', '독서감상문 쓰는법',
        '8월 여행지 추천', '여름 마지막 여행', '늦여름 옷차림',
        '에어컨 끄는 시기', '제습기 청소', '여름 옷 보관',
        '8월 가볼만한 곳', '늦여름 데이트', '여름 끝 다이어트',
    ],
    9: [  // 추석·수능D-100
        '추석 선물세트', '추석 명절 선물', '추석 한과 세트',
        '추석 차례상', '송편 만드는 법', '추석 음식 차림',
        '명절 인사말', '추석 카드', '추석 연휴 여행',
        '한가위 의미', '추석 고속도로 통행료',
        '수능 D-100', '수능 D-50', '수능 시간표', '수능 시험장',
        '9월 가볼만한 곳', '단풍 시작 시기', '환절기 감기약',
        '가을 옷 추천', '가을 패션', '가을 메이크업',
    ],
    10: [  // 단풍·할로윈·김장 준비
        '단풍 명소', '단풍 시기', '단풍 절정 시기',
        '가을 등산 추천', '가을 여행지 추천', '가을 캠핑',
        '할로윈 코스튬', '할로윈 의상', '할로윈 데코',
        '김장 시기', '김장 재료 준비', '김장 양념',
        '수능 마무리 공부법', '수능 컨디션 관리', '수능 도시락',
        '가을 옷 추천', '트렌치코트 추천', '가을 부츠',
        '환절기 건강', '독감 예방주사', '독감 시기',
    ],
    11: [  // 김장·수능·블프
        '김장 담그는 법', '김장 양념 비율', '김치 보관',
        '수능 시험', '수능 합격 기원', '수능 후 여행',
        '블랙프라이데이', '블프 직구', '블프 추천',
        '11월 가볼만한 곳', '늦가을 단풍', '겨울 시작',
        '겨울 옷 정리', '겨울 패딩 추천', '겨울 부츠 추천',
        '에너지바우처 신청', '난방비 지원', '연말 정산 준비',
        '독감 예방접종', '환절기 건강관리',
    ],
    12: [  // 크리스마스·연말
        '크리스마스 선물', '크리스마스 트리', '크리스마스 장식',
        '크리스마스 케이크', '크리스마스 데이트', '크리스마스 영화',
        '연말 모임 장소', '송년회 장소', '송년회 게임',
        '연말 정산 준비', '연말 정산 공제', '연말 정산 환급',
        '새해 선물', '새해 인사말', '연하장 만들기',
        '겨울 스키장', '스키장 패키지', '겨울 여행지',
        '크리스마스 코디', '연말 모임 옷', '겨울 패딩',
        '연말 보너스', '연말 세액공제',
    ],
};

/**
 * 현재 월의 시즌 시드 반환 (매월 자동 갱신)
 */
export function getCurrentMonthSeasonalSeeds(): { month: number; seeds: string[]; nextMonthPreview: string[] } {
    const now = new Date();
    const month = now.getMonth() + 1;
    const nextMonth = month === 12 ? 1 : month + 1;
    return {
        month,
        seeds: MONTHLY_SEED_BANK[month] || [],
        nextMonthPreview: (MONTHLY_SEED_BANK[nextMonth] || []).slice(0, 8),
    };
}

// ============================================================
// 📊 표본 편향 HHI (Herfindahl-Hirschman Index) — 데이터 다양성 측정
// ============================================================
//
// HHI = Σ (sourceShare_i)² × 10000  (0~10000)
//   - HHI < 1500: 다양성 높음 (중-저 집중)
//   - 1500~2500: 중등도 집중
//   - HHI > 2500: 고도 집중 (특정 소스 과의존)
//
// 5명 토론 합의: 상위 2개 소스 점유율 ≥ 35% 시 redistribution 권고
//
export interface SampleBiasMetrics {
    hhi: number;                          // 0~10000
    topSourceShare: number;               // 최대 소스 점유율 (0~1)
    top2SourcesShare: number;             // 상위 2개 합산 점유율
    bySource: Record<string, number>;     // 소스별 키워드 개수
    diversityLevel: 'high' | 'medium' | 'low';
    summary: string;
}

export function calculateSampleBias(seedSources: Array<{ keyword: string; sources: string[] }>): SampleBiasMetrics {
    const total = seedSources.length;
    if (total === 0) {
        return {
            hhi: 0, topSourceShare: 0, top2SourcesShare: 0, bySource: {},
            diversityLevel: 'high', summary: '시드 0개',
        };
    }

    // 키워드의 첫 소스를 대표 소스로 카운트 (또는 모든 소스에 1/n 할당)
    const sourceCounts: Record<string, number> = {};
    for (const seed of seedSources) {
        if (seed.sources.length === 0) continue;
        const weight = 1 / seed.sources.length;
        for (const src of seed.sources) {
            sourceCounts[src] = (sourceCounts[src] || 0) + weight;
        }
    }

    const totalWeight = Object.values(sourceCounts).reduce((s, n) => s + n, 0) || 1;
    const shares = Object.entries(sourceCounts)
        .map(([src, c]) => ({ src, share: c / totalWeight }))
        .sort((a, b) => b.share - a.share);

    const hhi = Math.round(shares.reduce((s, x) => s + x.share * x.share, 0) * 10000);
    const topSourceShare = shares[0]?.share || 0;
    const top2SourcesShare = (shares[0]?.share || 0) + (shares[1]?.share || 0);

    let diversityLevel: 'high' | 'medium' | 'low';
    if (hhi < 1500) diversityLevel = 'high';
    else if (hhi < 2500) diversityLevel = 'medium';
    else diversityLevel = 'low';

    const summary = `HHI ${hhi} (${diversityLevel === 'high' ? '✅ 다양' : diversityLevel === 'medium' ? '⚠️ 중집중' : '🚨 고집중'}) · 상위2 ${(top2SourcesShare * 100).toFixed(0)}%`;

    return {
        hhi,
        topSourceShare: Math.round(topSourceShare * 1000) / 1000,
        top2SourcesShare: Math.round(top2SourcesShare * 1000) / 1000,
        bySource: Object.fromEntries(shares.map(s => [s.src, Math.round(s.share * 1000) / 1000])),
        diversityLevel,
        summary,
    };
}

/**
 * 편향 강제 redistribution — 상위 소스가 35%+ 차지 시 비례 가중 축소
 * 결과: 다양한 소스 시드가 균형있게 통과
 */
export function rebalanceSeedsForDiversity(
    seeds: Array<{ keyword: string; sources: string[]; freq: number }>,
    maxTopShare: number = 0.35
): Array<{ keyword: string; sources: string[]; freq: number }> {
    const bias = calculateSampleBias(seeds);
    if (bias.topSourceShare <= maxTopShare) return seeds;  // 이미 균형

    // 과대 소스 식별
    const overweightSources = Object.entries(bias.bySource)
        .filter(([_, share]) => share > maxTopShare)
        .map(([src]) => src);
    if (overweightSources.length === 0) return seeds;

    // 과대 소스에서 온 시드는 빈도 가중 ×0.5로 축소
    const rebalanced = seeds.map(s => {
        const isOverweight = s.sources.some(src => overweightSources.includes(src));
        return isOverweight ? { ...s, freq: s.freq * 0.5 } : s;
    });
    // freq 기준 재정렬
    rebalanced.sort((a, b) => b.freq - a.freq);
    return rebalanced;
}

// ============================================================
// 🔬 자동 시즌×카테고리 시드 발견 (28개 데이터 소스 활용)
// ============================================================

/**
 * 28개 등록 소스 → sub-카테고리 친화도 매핑.
 * 각 소스가 어떤 카테고리에 강점이 있는지 정의.
 * 키워드 분류 시 소스 친화도가 1차 가중치로 작용.
 */
// ✅ 라이브 검증 통과한 30개 소스만 등록 (2026-04-27 검증)
// 죽은 소스: naver-shopping-rank, tiktok-cc, openalex, rakuten, fmkorea, korea-kr, bigkinds,
//           digital-times, mt-industry, mohw, ddaily, herald-life, pettimes (13개)
const SOURCE_CATEGORY_AFFINITY: Record<string, string[]> = {
    // 뷰티
    'oliveyoung': ['beauty'],
    // 패션
    'musinsa': ['fashion'],
    // 부동산
    'realestate': ['living', 'family'],
    // 금융
    'finance': ['subsidy', 'shopping'],
    // 의료/건강
    'health': ['health', 'subsidy'],
    // 자동차
    'bobaedream': ['car'],
    // 게임
    'gamenews': ['hobby'],
    'ruliweb': ['hobby'],
    // 육아/맘카페
    'mom-cafe': ['parenting', 'living', 'food', 'family'],
    // 요리
    'recipe': ['food'],
    // 여성 핫게시글
    'theqoo': ['beauty', 'fashion', 'travel', 'gift'],
    'natepann': ['family', 'gift'],
    // IT/디지털
    'clien': ['hobby', 'shopping'],
    // 핫딜
    'ppomppu': ['shopping', 'living', 'hobby'],
    // 뉴스
    'naver-news': ['family', 'subsidy', 'health', 'travel'],
    'yna-breaking': ['family', 'travel'],
    // 트렌드
    'wikipedia-ko': ['etc', 'family', 'travel', 'gift'],
    'youtube-kr': ['etc', 'gift', 'travel'],
    'dcinside': ['etc', 'shopping', 'hobby'],
    'todayhumor': ['etc'],
    'mlbpark': ['hobby'],
    // Phase 6 — 라이브 검증 통과 8개
    'zdnet': ['hobby', 'shopping'],
    'mk-realestate': ['living', 'family'],
    'hani-culture': ['travel', 'gift', 'family'],
    'sbs-ent': ['gift', 'family'],
    'moel': ['subsidy', 'job', 'education'],
    'env-kr': ['subsidy', 'living', 'health'],
    'mafra': ['food', 'subsidy', 'shopping'],
    'babynews': ['parenting', 'family', 'health'],
    'womentimes': ['beauty', 'fashion', 'parenting', 'family'],
};

interface DiscoveredSeed {
    keyword: string;
    sources: string[];
    freq: number;
    subCategory: string;
    seasonRelevance: number;  // 0~1 (시즌 마커 포함도)
}

/**
 * 시즌 마커 감지: 키워드에 현재/지난/다음 시즌 마커가 있으면 가산
 */
const SEASON_MARKER_BY_MONTH: Record<number, string[]> = {
    1: ['1월', '신년', '연말정산', '한파', '겨울', '입춘', '설'],
    2: ['2월', '설', '발렌타인', '입학', '졸업', '꽃샘'],
    3: ['3월', '화이트데이', '벚꽃', '봄', '입학', '새학기'],
    4: ['4월', '벚꽃', '봄', '식목일', '근로장려금', '자녀장려금'],
    5: ['5월', '어린이날', '어버이날', '카네이션', '스승의날', '가정의달', '종합소득세'],
    6: ['6월', '현충일', '장마', '제습', '여름'],
    7: ['7월', '여름', '휴가', '에어컨', '복날', '삼계탕', '워터파크'],
    8: ['8월', '광복절', '말복', '여름방학', '늦여름'],
    9: ['9월', '추석', '한가위', '송편', '수능', '가을'],
    10: ['10월', '단풍', '할로윈', '김장', '수능'],
    11: ['11월', '김장', '수능', '블프', '블랙프라이데이', '에너지바우처'],
    12: ['12월', '크리스마스', '연말', '송년', '연말정산', '스키'],
};

function detectSeasonRelevance(keyword: string, month: number): number {
    const markers = SEASON_MARKER_BY_MONTH[month] || [];
    const lower = keyword.toLowerCase();
    const hits = markers.filter(m => lower.includes(m.toLowerCase())).length;
    return Math.min(1, hits * 0.4);  // 1개 매칭 = 0.4, 3개+ = 1.0
}

/**
 * 🔬 매월 자동 시즌×카테고리 시드 발견
 *  - 28개 소스 병렬 호출 (이미 부트스트랩됨 가정)
 *  - 키워드별 sub-카테고리 자동 분류 (소스 친화도 + 토큰 매칭)
 *  - 빈도 + 교차 + 시즌 관련도로 점수 산정
 *  - 카테고리별 TOP N 시드 반환
 */
export async function discoverMonthlyCategorySeeds(
    targetMonth?: number,
    options: { topPerCategory?: number; minFreq?: number } = {}
): Promise<Record<string, string[]>> {
    const month = targetMonth || (new Date().getMonth() + 1);
    const topN = options.topPerCategory || 8;
    const minFreq = options.minFreq || 1;

    console.log(`[SEED-DISCOVERY] 🔬 ${month}월 시즌×카테고리 자동 시드 발견 시작`);

    let sourceResults: Map<string, { success: boolean; keywords: string[]; error?: string }>;
    try {
        sourceResults = await callAllSources({ healthy: false });
    } catch (err: any) {
        console.warn(`[SEED-DISCOVERY] callAllSources 실패: ${err?.message}`);
        return {};
    }

    // 카테고리별 후보 집계: keyword → { sources, freq, score }
    const candidates: Map<string, { sources: Set<string>; freq: number; subCategory: string; seasonRelevance: number }> = new Map();

    for (const [sourceId, result] of sourceResults) {
        if (!result.success || !result.keywords || result.keywords.length === 0) continue;
        const sourceCats = SOURCE_CATEGORY_AFFINITY[sourceId] || ['etc'];

        for (const kw of result.keywords) {
            const cleaned = String(kw || '').trim();
            if (cleaned.length < 2 || cleaned.length > 40) continue;
            // 글쓰기 가능 키워드만 후보로 (단일명사/시사/일회성뉴스 차단)
            if (!isWritableKeyword(cleaned).writable) continue;

            // sub-카테고리 분류: 토큰 매칭 1차, 소스 친화도 2차
            let subCat = classifyKeywordToSubCategory(cleaned, new Map());
            if (subCat === 'etc' && sourceCats.length > 0) {
                subCat = sourceCats[0];  // 소스 친화도 폴백
            }

            const seasonScore = detectSeasonRelevance(cleaned, month);
            const existing = candidates.get(cleaned);
            if (existing) {
                existing.sources.add(sourceId);
                existing.freq++;
            } else {
                candidates.set(cleaned, {
                    sources: new Set([sourceId]),
                    freq: 1,
                    subCategory: subCat,
                    seasonRelevance: seasonScore,
                });
            }
        }
    }

    console.log(`[SEED-DISCOVERY] 📊 ${candidates.size}개 후보 키워드 (${sourceResults.size}개 소스)`);

    // 점수화 + 카테고리별 그룹화
    const byCategory: Record<string, Array<{ keyword: string; score: number; sources: string[] }>> = {};
    for (const [kw, meta] of candidates) {
        if (meta.freq < minFreq) continue;
        const score = meta.freq * meta.sources.size * (1 + meta.seasonRelevance * 2);  // 시즌 가중치 ×3
        const cat = meta.subCategory;
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push({ keyword: kw, score, sources: Array.from(meta.sources) });
    }

    // 카테고리별 TOP N 정렬
    const result: Record<string, string[]> = {};
    for (const [cat, items] of Object.entries(byCategory)) {
        items.sort((a, b) => b.score - a.score);
        result[cat] = items.slice(0, topN).map(i => i.keyword);
    }

    const totalDiscovered = Object.values(result).reduce((s, arr) => s + arr.length, 0);
    console.log(`[SEED-DISCOVERY] ✅ ${Object.keys(result).length}개 카테고리 × TOP${topN} = 총 ${totalDiscovered}개 시드 발견`);
    for (const [cat, seeds] of Object.entries(result)) {
        console.log(`  ${cat}: ${seeds.slice(0, 3).join(', ')}${seeds.length > 3 ? ` (+${seeds.length - 3}개)` : ''}`);
    }

    return result;
}

/**
 * 매트릭스 시드 + 자동 발견 시드 병합 (정적 + 동적 통합)
 * 정적 매트릭스는 핵심 보장, 동적 발견은 풍부도/시의성 보강.
 */
export async function getMergedMonthlyCategorySeeds(): Promise<{
    month: number;
    byCategory: Record<string, string[]>;
    seedToCategory: Map<string, string>;
    flatSeeds: string[];
    discoveredCount: number;
    staticCount: number;
}> {
    const staticData = getCurrentMonthCategorySeeds();
    let discovered: Record<string, string[]> = {};
    try {
        discovered = await discoverMonthlyCategorySeeds(staticData.month, { topPerCategory: 6, minFreq: 1 });
    } catch (err: any) {
        console.warn('[SEED-DISCOVERY] 동적 발견 실패, 정적 매트릭스만 사용:', err?.message);
    }

    // 병합: static 우선, discovered는 추가 (중복 제거)
    const merged: Record<string, string[]> = {};
    const allCats = new Set([...Object.keys(staticData.byCategory), ...Object.keys(discovered)]);
    for (const cat of allCats) {
        const set = new Set<string>([
            ...(staticData.byCategory[cat] || []),
            ...(discovered[cat] || []),
        ]);
        merged[cat] = Array.from(set);
    }

    // 시드 → 카테고리 역매핑
    const seedToCategory = new Map<string, string>();
    const flatSeeds: string[] = [];
    for (const [cat, seeds] of Object.entries(merged)) {
        for (const s of seeds) {
            if (!seedToCategory.has(s)) {
                seedToCategory.set(s, cat);
                flatSeeds.push(s);
            }
        }
    }

    const staticCount = Object.values(staticData.byCategory).reduce((s, arr) => s + arr.length, 0);
    const discoveredCount = Object.values(discovered).reduce((s, arr) => s + arr.length, 0);
    console.log(`[SEED-MERGE] 📦 정적 ${staticCount}개 + 동적 ${discoveredCount}개 → 통합 ${flatSeeds.length}개 (${Object.keys(merged).length} 카테고리)`);

    return { month: staticData.month, byCategory: merged, seedToCategory, flatSeeds, discoveredCount, staticCount };
}

/**
 * 📅 월별 × sub-카테고리 시즌 황금 시드 매트릭스
 * season 카테고리 호출 시 카테고리별로 그룹화된 결과 반환.
 */
const MONTHLY_CATEGORY_SEEDS: Record<number, Record<string, string[]>> = {
    1: {
        subsidy: ['연말정산', '연말정산 환급', '연말정산 간소화', '연말정산 공제'],
        living: ['겨울 보일러', '난방비 절약', '전기장판', '겨울 이불'],
        beauty: ['겨울 화장법', '건조한 피부', '핸드크림 추천'],
        fashion: ['겨울 패딩', '겨울 코트', '롱부츠'],
        travel: ['겨울 스키장', '겨울 온천', '1월 여행지'],
        health: ['새해 운동', '새해 다이어트', '겨울 감기'],
        food: ['신년 음식', '겨울 보양식', '뜨끈한 국물요리'],
        gift: ['신년 선물', '새해 인사말', '연말 보너스'],
    },
    2: {
        gift: ['설날 선물', '세뱃돈', '발렌타인 선물', '발렌타인 초콜릿', '졸업 선물'],
        food: ['떡국 끓이는 법', '설 차례상', '명절 음식'],
        family: ['명절 인사말', '설 연휴', '명절 증후군'],
        parenting: ['새학기 준비물', '초등 입학 준비', '입학식 선물'],
        beauty: ['졸업 메이크업', '설날 한복 메이크업'],
        fashion: ['졸업식 코사지', '설날 한복', '꽃샘추위 옷차림'],
        health: ['환절기 건강', '꽃샘추위 감기'],
    },
    3: {
        gift: ['화이트데이 선물', '화이트데이 사탕', '화이트데이 캔디'],
        parenting: ['새학기 준비물', '초등 책가방', '학용품 세트'],
        travel: ['벚꽃 명소', '벚꽃 개화시기', '벚꽃 축제', '봄 나들이'],
        beauty: ['봄 메이크업', '봄 화장법', '봄 립스틱'],
        fashion: ['봄 옷 추천', '꽃샘추위 옷차림', '트렌치 코트'],
        living: ['이사철 견적', '이사 짐 정리', '봄 청소'],
        health: ['미세먼지 마스크', '환절기 알레르기'],
    },
    4: {
        beauty: ['봄 네일', '봄 메이크업', '봄 컬러 메이크업', '봄 화장법', '봄 립스틱', '봄 네일 디자인', '봄 네일 컬러'],
        fashion: ['봄 자켓', '봄 옷 추천', '봄 코디', '봄 신발', '트렌치 코트', '봄 원피스'],
        travel: ['벚꽃 명소', '벚꽃 엔딩', '봄 여행지 추천', '봄 캠핑', '4월 가볼만한 곳', '주말 나들이 추천', '봄 데이트'],
        food: ['봄 제철음식', '봄나물', '도다리쑥국', '봄동 김치', '봄 멸치'],
        living: ['봄 청소', '환절기 청소', '봄 이불 정리', '베란다 정리'],
        gardening: ['봄 식물', '봄꽃 키우기', '베란다 텃밭 시작', '봄 화분 분갈이', '몬스테라 키우기'],
        subsidy: ['근로장려금 신청', '근로장려금 자격', '자녀장려금 신청', '근로장려금 신청기간'],
        health: ['봄 알레르기', '환절기 면역력', '봄 운동', '봄 다이어트', '미세먼지 마스크'],
        parenting: ['초등 봄 옷', '아이 봄 옷', '4월 어린이집 행사'],
    },
    5: {
        gift: ['어린이날 선물', '어버이날 선물', '카네이션 꽃다발', '스승의날 선물', '용돈 봉투', '부부의날 선물', '성년의날 선물'],
        parenting: ['어린이날 행사', '어린이날 이벤트', '어린이날 가볼만한 곳', '5월 어린이 캠핑'],
        travel: ['5월 여행지 추천', '가정의달 여행', '어버이 모시고 갈 여행지'],
        food: ['카네이션 케이크', '어버이날 음식', '5월 제철음식'],
        beauty: ['5월 메이크업', '봄 끝 메이크업'],
        fashion: ['5월 결혼식 하객 옷', '5월 옷 추천'],
        subsidy: ['종합소득세 신고', '종합소득세 환급', '근로장려금 신청기간', '자녀장려금 신청기간'],
        health: ['가정의달 건강검진', '5월 운동'],
    },
    6: {
        living: ['장마 대비', '장마철 빨래', '제습기 추천', '곰팡이 제거', '실내 습도 관리'],
        fashion: ['여름 시작 옷', '장마철 옷'],
        food: ['하지 음식', '6월 제철음식', '여름 보양식'],
        travel: ['현충일 여행', '6월 여행지', '여름 휴가 계획'],
        beauty: ['여름 메이크업', '여름 다이어트', '땀 화장법'],
        health: ['여름 다이어트', '습한 날씨 건강'],
        gardening: ['장마철 식물', '실내 가드닝'],
        family: ['현충일 의미', '호국보훈의 달'],
    },
    7: {
        travel: ['여름 휴가지 추천', '국내 여행지 추천', '제주도 여행 코스', '해외여행 추천'],
        living: ['에어컨 추천', '에어컨 청소', '에어컨 전기세', '선풍기 추천', '서큘레이터'],
        fashion: ['여름 수영복', '래쉬가드 추천', '비치웨어', '여름 원피스'],
        food: ['여름 보양식', '삼계탕 끓이는 법', '복날 음식', '여름 메뉴'],
        beauty: ['여름 메이크업', '땀 화장법', '여름 자외선 차단제'],
        hobby: ['여름 캠핑', '캠핑 용품', '물놀이 용품'],
        health: ['여름 다이어트', '여름 운동', '폭염 건강'],
        parenting: ['여름 방학 캠프', '아이 여름 옷'],
    },
    8: {
        travel: ['8월 여행지 추천', '여름 마지막 여행', '늦여름 가볼만한 곳'],
        food: ['말복 음식', '처서 음식', '여름 끝 보양식'],
        parenting: ['여름 방학 숙제', '방학 자유주제', '독서감상문'],
        fashion: ['늦여름 옷차림', '8월 옷 추천'],
        beauty: ['여름 끝 다이어트', '여름 끝 메이크업'],
        living: ['에어컨 끄는 시기', '제습기 청소', '여름 옷 보관'],
        family: ['광복절 의미', '광복절 행사', '광복절 휴일'],
    },
    9: {
        gift: ['추석 선물세트', '추석 명절 선물', '추석 한과 세트', '추석 카드'],
        food: ['추석 차례상', '송편 만드는 법', '추석 음식', '한가위 음식'],
        family: ['명절 인사말', '추석 연휴 여행', '한가위 의미'],
        education: ['수능 D-100', '수능 D-50', '수능 시간표', '수능 시험장'],
        fashion: ['가을 옷 추천', '가을 패션', '환절기 옷차림'],
        beauty: ['가을 메이크업', '가을 컬러'],
        travel: ['9월 가볼만한 곳', '추석 연휴 여행'],
        health: ['환절기 감기약', '가을 알레르기'],
    },
    10: {
        travel: ['단풍 명소', '단풍 시기', '단풍 절정', '가을 등산 추천', '가을 캠핑'],
        gift: ['할로윈 코스튬', '할로윈 의상', '할로윈 데코', '할로윈 파티'],
        food: ['김장 시기', '김장 재료 준비', '김장 양념'],
        education: ['수능 마무리 공부법', '수능 컨디션 관리', '수능 도시락'],
        fashion: ['가을 옷 추천', '트렌치 코트', '가을 부츠'],
        beauty: ['가을 메이크업', '가을 립스틱'],
        health: ['환절기 건강', '독감 예방주사', '독감 시기'],
    },
    11: {
        food: ['김장 담그는 법', '김장 양념 비율', '김치 보관'],
        education: ['수능 시험', '수능 합격 기원', '수능 후 여행'],
        shopping: ['블랙프라이데이', '블프 직구', '블프 추천'],
        travel: ['11월 가볼만한 곳', '늦가을 단풍'],
        fashion: ['겨울 패딩 추천', '겨울 부츠 추천', '겨울 옷 정리'],
        subsidy: ['에너지바우처 신청', '난방비 지원', '연말 정산 준비'],
        health: ['독감 예방접종', '환절기 건강관리'],
    },
    12: {
        gift: ['크리스마스 선물', '크리스마스 트리', '크리스마스 장식', '새해 선물', '연하장'],
        food: ['크리스마스 케이크', '크리스마스 요리', '연말 모임 메뉴'],
        family: ['연말 모임 장소', '송년회 장소', '송년회 게임', '크리스마스 데이트'],
        subsidy: ['연말 정산 준비', '연말 정산 공제', '연말 정산 환급', '연말 세액공제'],
        travel: ['겨울 스키장', '스키장 패키지', '겨울 여행지'],
        fashion: ['크리스마스 코디', '연말 모임 옷', '겨울 패딩'],
        beauty: ['크리스마스 메이크업', '연말 메이크업'],
    },
};

/**
 * 현재 월의 카테고리별 시드 반환 + 시드→카테고리 역매핑
 */
export function getCurrentMonthCategorySeeds(): {
    month: number;
    byCategory: Record<string, string[]>;
    seedToCategory: Map<string, string>;
    flatSeeds: string[];
} {
    const month = new Date().getMonth() + 1;
    const byCategory = MONTHLY_CATEGORY_SEEDS[month] || {};
    const seedToCategory = new Map<string, string>();
    const flatSeeds: string[] = [];
    for (const [cat, seeds] of Object.entries(byCategory)) {
        for (const s of seeds) {
            seedToCategory.set(s, cat);
            flatSeeds.push(s);
        }
    }
    return { month, byCategory, seedToCategory, flatSeeds };
}

/**
 * 키워드 → sub-카테고리 자동 매칭 (시즌 결과의 카테고리 분류용)
 * 시드 키워드의 핵심 토큰 포함 여부로 판단.
 */
/**
 * Phase 4.2: 카테고리 분류 NER 정밀화
 * 우선순위 기반 엔티티 매칭 (예: "벚꽃엔딩 뜻" → entertainment 음악)
 */

// 🎵 명확한 엔티티 사전 (sub-카테고리 우선 결정)
const ENTITY_DICTIONARY: Array<{ tokens: string[]; category: string; priority: number }> = [
    // 음악·노래 제목 (entertainment)
    { tokens: ['벚꽃엔딩', '엔딩', '발라드', '가사', '노래', '뮤직비디오', '앨범', '신곡', '음원'], category: 'entertainment', priority: 100 },
    // 드라마·영화
    { tokens: ['드라마', '영화', '시즌', '회차', '결말', '예고편', '예고', '시청률', '개봉'], category: 'entertainment', priority: 100 },
    // 게임
    { tokens: ['게임', '플스', 'PS5', 'PS4', '닌텐도', '스위치', '엑박', '스팀', 'PC게임', '온라인게임', '캐릭터', '직업', '레벨'], category: 'hobby', priority: 90 },
    // 의료/건강 (YMYL)
    { tokens: ['병원', '진료', '치료', '처방', '의사', '진단'], category: 'health', priority: 90 },
    // 정부 지원
    { tokens: ['지원금', '장려금', '바우처', '보조금', '수당'], category: 'subsidy', priority: 90 },
    // 부동산
    { tokens: ['아파트', '청약', '분양', '재건축', '주담대', '전세', '월세'], category: 'living', priority: 80 },
];

export function classifyKeywordToSubCategory(keyword: string, seedToCategory: Map<string, string>): string {
    const lowerKw = keyword.toLowerCase();

    // 🥇 1차 우선순위: 명확한 엔티티 사전 (priority 높은 순)
    const sortedEntities = [...ENTITY_DICTIONARY].sort((a, b) => b.priority - a.priority);
    for (const entity of sortedEntities) {
        if (entity.tokens.some(t => lowerKw.includes(t.toLowerCase()))) {
            return entity.category;
        }
    }

    // 🥈 2차: 시드 키워드와 직접 매칭
    for (const [seed, cat] of seedToCategory) {
        if (lowerKw.includes(seed.toLowerCase())) return cat;
    }

    // 🥉 3차: 카테고리별 핵심 토큰 매칭
    const categoryTokens: Record<string, string[]> = {
        beauty: ['네일', '메이크업', '화장', '립스틱', '쿠션', '에센스', '세럼', '클렌징', '스킨', '로션', '향수', '뷰티'],
        fashion: ['옷', '패션', '코트', '자켓', '신발', '운동화', '부츠', '원피스', '코디', '패딩', '한복', '드레스', '청바지'],
        travel: ['여행', '명소', '가볼만한', '캠핑', '나들이', '데이트', '명승', '관광', '호텔', '리조트', '항공', '비행기'],
        food: ['음식', '요리', '레시피', '제철', '메뉴', '맛', '국물', '음식점', '맛집', '도시락', '간식', '베이커리'],
        living: ['청소', '정리', '수납', '인테리어', '가구', '가전', '에어컨', '제습기', '선풍기', '보일러', '주방', '욕실'],
        gardening: ['식물', '화분', '가드닝', '몬스테라', '꽃', '베란다', '정원', '텃밭', '다육이'],
        subsidy: ['지원금', '장려금', '바우처', '환급', '신청', '자격', '보조금', '수당'],
        health: ['건강', '운동', '다이어트', '면역', '감기', '알레르기', '검진', '의료', '영양제', '비타민'],
        parenting: ['아이', '어린이', '아기', '학용품', '입학', '책가방', '캠프', '신생아', '유아'],
        education: ['공부', '수능', '시험', '강의', '학원', '교재', '자격증', '취업'],
        gift: ['선물', '카드', '카네이션', '꽃다발', '코사지', '용돈', '인사말'],
        family: ['연휴', '명절', '인사말', '모임'],
        shopping: ['블프', '직구', '할인', '쿠폰', '특가', '세일'],
        hobby: ['캠핑', '낚시', '등산', '카메라', '미러리스', '기타', '피아노'],
        entertainment: ['엔터', '연예', '아이돌', '예능', '오디션', '명대사'],
    };
    for (const [cat, tokens] of Object.entries(categoryTokens)) {
        if (tokens.some(t => lowerKw.includes(t))) return cat;
    }
    return 'etc';
}

const CATEGORY_BUILTIN_SEEDS: Record<string, string[]> = {
    'naver-home': [
        // 홈판 자주 노출되는 핵심 시드 (트렌드 + 시즌 + 정보형 우선)
        '오늘의 운세', '주식 추천', '점심 메뉴 추천', '저녁 메뉴 추천',
        '봄 나들이', '가볼만한 곳', '주말 데이트', '맛집 추천',
        '다이어트 식단', '건강한 음식', '면역력 음식', '환절기 음식',
        '인테리어 꿀팁', '청소 꿀팁', '생활 꿀팁', '돈 버는 방법',
        '시간 관리', '재테크 추천', '연말정산 환급', '소상공인 지원',
        '근로장려금 신청', '자녀장려금 자격', '국민지원금 신청', '에너지바우처',
        '봄 네일 추천', '봄 메이크업', '벚꽃 명소', '봄 옷 추천',
        '수면 꿀팁', '스트레스 해소', '운동 루틴', '홈트레이닝',
        '직장인 점심', '도시락 레시피', '간식 만들기', '제철 음식',
        '취업 팁', '면접 후기', '자기소개서 쓰는법', '이력서 작성법',
        '자동차 관리', '겨울 타이어', '자동차 보험 비교', '주유 절약',
        '아이 교육', '학원 추천', '학습지 비교', '독서 추천',
        '반려동물 사료', '강아지 훈련', '고양이 모래', '반려동물 보험',
    ],
    subsidy: [
        '근로장려금', '자녀장려금', '청년내일저축계좌', '청년도약계좌', '청년월세지원',
        '소상공인지원금', '소상공인새출발기금', '재난지원금', '에너지바우처', '기초생활수급',
        '한부모가정지원금', '출산지원금', '양육수당', '아이돌봄서비스', '국민취업지원제도',
        '내일배움카드', '실업급여', '취업성공패키지', '농민기본소득', '문화누리카드',
    ],
    loan: ['대출', '신용대출', '주담대', '전세대출', '대환대출', '햇살론', '대출금리', '대출한도'],
    finance: ['주식', '투자', 'ETF', '연금', '적금', '예금', '재테크', '코인', '연말정산', '세테크'],
    insurance: ['보험', '실손보험', '자동차보험', '암보험', '운전자보험', '태아보험', '종신보험'],
    realestate: ['아파트', '청약', '분양', '재건축', '전세', '월세', '주담대', '오피스텔', '갭투자'],
    legal: ['이혼', '상속', '소송', '변호사', '계약서', '판결', '고소', '합의'],
    tax: ['연말정산', '소득세', '종합소득세', '부가세', '양도세', '증여세', '상속세', '환급'],
    medical: ['병원', '진료', '검진', '수술', '치료', '의료보험', '응급실', '약국'],
    dental: ['치과', '임플란트', '교정', '스케일링', '충치', '발치', '신경치료'],
    health: ['건강검진', '운동', '다이어트', '혈압', '혈당', '면역력', '단백질'],
    supplement: ['영양제', '비타민', '유산균', '오메가3', '루테인', '콜라겐', '프로바이오틱스'],
    diet: ['다이어트', '식단', '단백질', '저탄고지', '간헐적단식', '운동'],
    it: ['컴퓨터', '소프트웨어', 'AI', '프로그래밍', 'PC', '서버', '클라우드'],
    laptop: ['노트북', '맥북', '갤럭시북', 'LG그램', '게이밍노트북', '울트라북'],
    smartphone: ['아이폰', '갤럭시', '에어팟', '버즈', '스마트워치', '폴드'],
    appliance: ['로봇청소기', '건조기', '세탁기', '에어컨', '냉장고', '공기청정기', '식기세척기'],
    app: ['앱', '어플', '구독', '멤버십', '서비스'],
    education: ['공부', '학원', '인강', '교재', '강의'],
    certificate: ['자격증', '공무원시험', '토익', '한국사', '컴활', '운전면허'],
    business: ['창업', '사업자등록', '소상공인', '스마트스토어', '부업', '프리랜서'],
    job: ['취업', '이직', '면접', '자소서', '연봉', '채용'],
    living: ['침구', '매트리스', '소파', '책상', '주방용품', '수납', '러그', '커튼', '식탁', '의자', '서랍장', '옷장', '주방수납', '욕실용품', '베개', '이불', '식기', '전동커튼', '정리수납', '다이소'],
    life_tips: ['절약', '청소', '세탁', '정리', '수납', '꿀팁', '곰팡이', '얼룩제거'],
    interior: ['인테리어', '소파', '침대', '조명', '벽지', '러그', '리모델링'],
    diy: ['DIY', '셀프인테리어', '셀프수리', '페인팅', '도배', '조립가구'],
    gardening: ['식물', '화분', '몬스테라', '다육이', '베란다텃밭', '가드닝'],
    parenting: ['아기', '신생아', '유모차', '카시트', '분유', '기저귀', '이유식', '돌잔치'],
    wedding: ['웨딩홀', '스드메', '신혼여행', '예단', '예물', '청첩장', '드레스'],
    pet: ['강아지', '고양이', '사료', '간식', '반려동물', '용품', '펫보험'],
    travel: ['여행', '항공권', '호텔', '리조트', '패키지여행', '국내여행', '제주도'],
    car: ['자동차', '신차', '중고차', '타이어', '엔진오일', '블랙박스', '카시트'],
    beauty: ['스킨', '로션', '에센스', '세럼', '쿠션', '립스틱', '클렌징', '마스크팩'],
    fashion: ['옷', '코트', '자켓', '운동화', '가방', '원피스'],
    recipe: ['김치찌개', '된장찌개', '제육볶음', '계란찜', '비빔밥', '파스타'],
    food: ['맛집', '음식', '디저트', '베이커리', '카페'],
    cooking: ['요리', '레시피', '반찬', '간식'],
    game: ['게임', 'PS5', '닌텐도스위치', '플스', '모바일게임', '신작'],
    sports: ['헬스', '필라테스', '요가', '러닝', '골프', '축구'],
    hobby: ['카메라', '미러리스', '기타', '피아노', '캠핑', '낚시'],
    review: ['리뷰', '후기', '내돈내산', '솔직후기', '비교'],
    shopping: ['할인', '쿠폰', '핫딜', '특가', '직구'],
    all: ['추천', '비교', '리뷰', '방법', '계산기', '신청', '가격'],
};

/**
 * 글쓰기 불가 시드(단일 명사)를 네이버 자동완성으로 롱테일 확장.
 * "금리" → "금리 비교 방법", "금리 인상 시기", "금리 계산기" 등 글쓰기 가능 형태.
 * 라이브 호출 결과 핵심 솔루션 — 외부 소스가 명사만 줘도 자동완성으로 롱테일 확보.
 */
/**
 * 🌱 의도 패턴 변형 — 시드에 의도 토큰을 합성하여 세부 키워드 풍부 확보
 *  예: "고유가 지원금 신청방법" → ["~조건", "~기간", "~금액", "~대상자", "~서류", "~온라인", "~후기", "~거절", "~재신청"]
 *  자동완성 검증 후 살아남는 변형만 채택.
 */
const INTENT_VARIATION_PATTERNS = [
    // 신청/자격
    '조건', '자격', '대상', '대상자', '기준', '요건', '신청 방법', '신청 기간', '신청 자격',
    // 절차/서류
    '서류', '준비물', '절차', '방법', '온라인', '오프라인', '모바일', '앱',
    // 금액/혜택
    '금액', '얼마', '한도', '상한', '지원금', '환급액', '혜택',
    // 후기/문제
    '후기', '거절', '탈락', '재신청', '실패', '안되는 이유', '문제',
    // 비교/차이
    '차이', '비교', 'vs', '같은점', '다른점',
    // 시기
    '언제', '기간', '마감', '종료일', '시작일', '오늘',
    // 도구
    '계산기', '계산법', '조회', '확인',
    // 추천/순위 (단, YMYL 키워드와는 결합 안 됨 — 위에서 차단)
    '추천', '순위', 'top10', '베스트', '인기',
    // 정보형
    '뜻', '의미', '이유', '원인', '효과', '효능',
];

async function expandSeedsToWritable(
    rawSeeds: string[],
    config: { naverClientId: string; naverClientSecret: string },
    maxSeeds: number = 20
): Promise<string[]> {
    const writable = new Set<string>();

    // 1차: 이미 글쓰기 가능한 시드는 그대로 통과
    for (const s of rawSeeds) {
        if (isWritableKeyword(s).writable) writable.add(s);
    }

    // 2차: 글쓰기 불가 시드 → 자동완성 확장 (상위 N개만, 비용 제한)
    const blockedSeeds = rawSeeds.filter(s => !isWritableKeyword(s).writable).slice(0, maxSeeds);
    console.log(`[ADSENSE-EXPAND] 🌱 글쓰기 불가 시드 ${blockedSeeds.length}개 → 자동완성 확장`);

    const CONCURRENCY = 4;
    let expanded = 0;
    for (let i = 0; i < blockedSeeds.length; i += CONCURRENCY) {
        const batch = blockedSeeds.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(async (seed) => {
            try {
                const suggests = await getNaverAutocompleteKeywords(seed, {
                    clientId: config.naverClientId,
                    clientSecret: config.naverClientSecret,
                });
                for (const s of suggests) {
                    const k = String(s || '').trim();
                    if (k.length >= 5 && isWritableKeyword(k).writable) {
                        writable.add(k);
                        expanded++;
                    }
                }
            } catch (err: any) { /* 단일 실패 무시 */ }
        }));
    }
    console.log(`[ADSENSE-EXPAND] ✅ 1단계 자동완성: ${expanded}개 → 통과 ${writable.size}개`);

    // 3차: 🌱 의도 패턴 변형 — 시드 + 의도 토큰 합성 후 자동완성 검증
    const initialSeeds = rawSeeds.slice(0, 10);  // 비용 제한
    let intentExpanded = 0;
    for (const seed of initialSeeds) {
        const variations = INTENT_VARIATION_PATTERNS.slice(0, 12).map(intent => `${seed} ${intent}`);
        // 의도 변형 키워드 자체도 글쓰기 가능하면 통과
        for (const v of variations) {
            if (isWritableKeyword(v).writable) {
                writable.add(v);
                intentExpanded++;
            }
        }
    }
    console.log(`[ADSENSE-EXPAND] 🎯 의도 변형: ${intentExpanded}개 추가`);

    // 4차: 🌳 딥 자동완성 트리 — 1단계 결과의 상위 N개에 다시 자동완성 (2-hop)
    const topForDeepDive = Array.from(writable).slice(0, 8);
    let deepExpanded = 0;
    for (let i = 0; i < topForDeepDive.length; i += CONCURRENCY) {
        const batch = topForDeepDive.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(async (seed) => {
            try {
                const suggests = await getNaverAutocompleteKeywords(seed, {
                    clientId: config.naverClientId,
                    clientSecret: config.naverClientSecret,
                });
                for (const s of suggests.slice(0, 15)) {
                    const k = String(s || '').trim();
                    if (k.length >= 5 && isWritableKeyword(k).writable && !writable.has(k)) {
                        writable.add(k);
                        deepExpanded++;
                    }
                }
            } catch (err: any) { /* 단일 실패 무시 */ }
        }));
    }
    console.log(`[ADSENSE-EXPAND] 🌳 2-hop 딥 자동완성: ${deepExpanded}개 추가 → 최종 ${writable.size}개`);

    return Array.from(writable);
}

/**
 * 카테고리별 키워드 적합성 필터 토큰.
 * 소스가 broad한 키워드를 반환하므로 (예: finance 소스는 모든 경제뉴스),
 * 카테고리에 적합한 토큰을 포함한 키워드만 통과시킨다.
 */
const CATEGORY_FILTER_TOKENS: Record<string, string[]> = {
    finance: ['금리', '주식', '투자', '재테크', '연금', '적금', '예금', '펀드', '채권', '환율', 'ETF', 'IRP', 'ISA', '배당', '코인', '비트', '청약', '연말정산', '소득세', '양도세', '절세'],
    loan: ['대출', '금리', '한도', '이자', '신용', '주담대', '전세대출', '담보'],
    insurance: ['보험', '실손', '실비', '암보험', '자동차보험', '운전자보험', '태아보험', '종신', '연금보험'],
    realestate: ['부동산', '아파트', '청약', '분양', '재건축', '재개발', '매매', '전세', '월세', '임대', '주택', '오피스텔'],
    legal: ['법', '판결', '소송', '변호사', '이혼', '상속', '계약', '고소', '고발', '합의', '위자료', '양육비'],
    medical: ['병원', '진료', '치료', '수술', '의료', '의사', '진단', '약', '처방', '응급', '수면', '갑상선', '디스크'],
    dental: ['치과', '임플란트', '교정', '스케일링', '충치', '발치', '신경치료', '잇몸'],
    health: ['건강', '운동', '영양제', '비타민', '유산균', '오메가', '루테인', '콜라겐', '다이어트', '혈압', '혈당', '면역', '단백질'],
    supplement: ['영양제', '비타민', '유산균', '오메가', '루테인', '콜라겐', '프로바이오틱스', '글루코사민', '마그네슘', '철분', '아연'],
    diet: ['다이어트', '체중', '감량', '단백질', '식단', '운동'],
    it: ['컴퓨터', '노트북', '소프트웨어', '앱', 'AI', '인공지능', '프로그램', '서버', '데이터', '클라우드', 'IT'],
    laptop: ['노트북', '랩탑', '컴퓨터', 'CPU', 'RAM', 'SSD', '모니터', '키보드', '마우스', '맥북', '갤럭시북'],
    smartphone: ['스마트폰', '아이폰', '갤럭시', '폰', '핸드폰', '이어폰', '에어팟', '버즈', '스마트워치'],
    education: ['공부', '학습', '강의', '교재', '시험', '학원', '인강', '독학'],
    certificate: ['자격증', '시험', '공무원', '토익', '한국사', '컴활', '정처기', '조리사', '한식', '운전면허'],
    business: ['창업', '사업', '사업자', '소상공인', '자영업', '프리랜서', '부업', '온라인쇼핑몰', '스마트스토어'],
    travel: ['여행', '항공', '호텔', '리조트', '관광', '투어', '패키지', '비자', '입국', '면세', '캐리어', '렌터카'],
    parenting: ['육아', '아기', '신생아', '유아', '어린이', '유모차', '카시트', '분유', '기저귀', '이유식', '출산', '임신', '돌'],
    interior: ['인테리어', '가구', '소파', '침대', '책상', '의자', '조명', '커튼', '벽지', '러그', '수납', '리모델링'],
    beauty: ['화장품', '스킨', '로션', '크림', '에센스', '세럼', '마스크팩', '쿠션', '립', '아이섀도', '파운데이션', '클렌징'],
    fashion: ['옷', '패션', '신발', '가방', '코트', '자켓', '바지', '스커트', '드레스', '운동화', '스니커즈'],
    recipe: ['레시피', '요리', '만드는법', '음식', '반찬', '국', '찌개', '볶음', '구이', '조림'],
    cooking: ['요리', '레시피', '음식', '만드는법'],
    review: ['후기', '리뷰', '솔직', '내돈내산', '직접', '체험', '사용기', '구매', '비교'],
    pet: ['강아지', '고양이', '반려동물', '사료', '간식', '용품', '건강', '훈련', '미용'],
    game: ['게임', '플스', '닌텐도', '스위치', 'PC게임', '모바일게임', '온라인', '신작', '업데이트'],
    sports: ['축구', '야구', '농구', '배구', '골프', '테니스', '러닝', '헬스', '필라테스', '요가', '런닝', '운동기구', '덤벨'],

    // 💎 정부 지원금
    subsidy: ['지원금', '보조금', '장려금', '수당', '혜택', '신청', '자격', '기준', '대상', '바우처', '공제', '환급', '저축계좌', '내일배움', '국민취업', '한부모', '기초생활', '근로장려', '자녀장려', '양육수당', '청년월세', '소상공인', '재난지원', '에너지바우처'],

    // 🏠 네이버 홈판 — 필터 비활성 (모든 토픽 허용, homeScore가 자체 게이트)
    'naver-home': [],

    // 📅 시즌 — 필터 비활성 (월별 시드가 이미 시즌 한정이므로 필터 불필요)
    season: [],

    // 🛏️ 리빙·홈
    living: ['침구', '이불', '베개', '매트리스', '커튼', '러그', '카펫', '수납', '정리', '주방', '욕실', '식기', '컵', '주전자', '냄비', '프라이팬', '도마', '식탁', '의자', '소파', '조명', '전등'],

    // 💡 생활꿀팁
    life_tips: ['절약', '꿀팁', '청소', '세탁', '빨래', '얼룩', '정리', '수납', '제거', '없애는법', '관리', '보관', '냉장고', '곰팡이', '냄새', '주부', '살림', '가계부', '전기세', '가스비', '수도세'],

    // 🔧 DIY
    diy: ['DIY', '셀프', '직접', '수리', '교체', '시공', '설치', '조립', '리폼', '페인팅', '도배', '장판', '목공', '드릴', '공구'],

    // 🌿 가드닝
    gardening: ['식물', '화분', '정원', '베란다', '텃밭', '꽃', '다육이', '화초', '관엽', '몬스테라', '스킨답서스', '가드닝', '키우는법', '물주기', '분갈이'],

    // 📊 세금
    tax: ['세금', '연말정산', '소득세', '종합소득세', '부가세', '양도세', '증여세', '상속세', '취득세', '재산세', '환급', '공제', '신고', '간이과세'],

    // 💼 취업·이직
    job: ['취업', '이직', '면접', '자소서', '이력서', '연봉', '복지', '채용', '신입', '경력', '인턴', '공채', '스카우트', '커리어', '이직사이트'],

    // 🚗 자동차
    car: ['자동차', '차', '승용차', 'SUV', '세단', '수입차', '신차', '중고차', '차량', '운전', '주유', '타이어', '엔진오일', '와이퍼', '블랙박스', '내비게이션', '카시트', '시승'],

    // 📲 앱·서비스
    app: ['앱', '어플', '서비스', '플랫폼', '구독', '멤버십', '추천앱', '필수앱', '유용한앱', '무료앱'],

    // 📷 취미
    hobby: ['카메라', '미러리스', 'DSLR', '렌즈', '삼각대', '기타', '피아노', '드럼', '바이올린', '뜨개질', '수예', '캘리그라피', '드로잉', '독서', '낚시', '캠핑', '등산'],

    // 🍱 음식·맛집
    food: ['맛집', '음식', '메뉴', '식당', '카페', '디저트', '베이커리', '배달', '포장', '신메뉴'],

    // 🛒 쇼핑·핫딜
    shopping: ['할인', '특가', '쿠폰', '핫딜', '세일', '프로모션', '블프', '직구', '오픈마켓', '쇼핑몰'],

    // 💍 결혼·웨딩
    wedding: ['웨딩', '결혼', '예식', '신혼', '신부', '드레스', '예복', '청첩장', '스드메', '신혼여행', '예단', '예물', '혼수', '웨딩홀'],

    all: [],  // 전체는 필터 없음 (모두 통과)
};

/**
 * 직접 소스 라우팅으로 시드 키워드 수집
 *  - PRO 헌터 우회, source-registry safeCall 직접 호출
 *  - 카테고리 적합성 토큰 필터링
 *  - 빈도 가중치 (여러 소스에서 등장 = 우선순위 ↑)
 */
async function collectAdsenseSeeds(category: string): Promise<{ keyword: string; sources: string[]; freq: number }[]> {
    const sourceIds = ADSENSE_CATEGORY_SOURCES[category] || ADSENSE_CATEGORY_SOURCES.all;
    const filterTokens = CATEGORY_FILTER_TOKENS[category] || [];

    console.log(`[ADSENSE-COLLECT] category=${category} → sources=[${sourceIds.join(',')}]`);

    const results = await Promise.all(
        sourceIds.map(id => safeCall(id).then(r => ({ id, ...r })))
    );

    // 키워드 → 빈도/소스 집계
    const map = new Map<string, { sources: Set<string>; freq: number }>();
    for (const r of results) {
        if (!r.success) {
            console.warn(`[ADSENSE-COLLECT] ${r.id} 실패: ${r.error}`);
            continue;
        }
        for (const kw of r.keywords) {
            const k = String(kw || '').trim();
            if (k.length < 2 || k.length > 40) continue;
            const existing = map.get(k);
            if (existing) {
                existing.sources.add(r.id);
                existing.freq++;
            } else {
                map.set(k, { sources: new Set([r.id]), freq: 1 });
            }
        }
    }

    let collected = Array.from(map.entries()).map(([keyword, v]) => ({
        keyword,
        sources: Array.from(v.sources),
        freq: v.freq,
    }));

    console.log(`[ADSENSE-COLLECT] 원본 ${collected.length}개 (${results.filter(r => r.success).length}/${sourceIds.length} 소스 성공)`);

    // 🔥 v3.1: 글쓰기 가능 게이트 1차 적용 (단일명사/시사/일회성뉴스 사전 차단)
    const beforeWritable = collected.length;
    collected = collected.filter(c => isWritableKeyword(c.keyword).writable);
    console.log(`[ADSENSE-COLLECT] 글쓰기 가능 시드: ${collected.length}/${beforeWritable}`);

    // 카테고리 토큰 필터 (all은 미적용)
    if (filterTokens.length > 0) {
        const before = collected.length;
        collected = collected.filter(c => {
            const lower = c.keyword.toLowerCase();
            return filterTokens.some(t => lower.includes(t.toLowerCase()));
        });
        console.log(`[ADSENSE-COLLECT] 카테고리 필터 통과: ${collected.length}/${before}`);
    }

    // 빈도 + 소스 다양성으로 정렬
    collected.sort((a, b) => {
        const scoreA = a.freq * a.sources.length;
        const scoreB = b.freq * b.sources.length;
        return scoreB - scoreA;
    });

    return collected;
}

// ============================================================
// 6) 진입점: huntAdsenseKeywords
// ============================================================

export interface AdsenseHunterOptions {
    category?: string;
    seedKeywords?: string[];
    count?: number;
    excludeYmylHigh?: boolean;
    minInfoIntent?: number;
    minMonthlyRevenue?: number;
    requireRealData?: boolean;
    newbieMode?: boolean;
    excludeZeroClickHigh?: boolean;
    excludeNonInformational?: boolean;
    forceRefresh?: boolean;            // 💾 캐시 무시하고 새로 계산 (Phase 5.2)
    blueOceanOnly?: boolean;            // 💎 블루오션(blue/ultra-blue)만 결과
    minBlueOceanRatio?: number;         // 💎 최소 경쟁비 (기본 1.0)
    sortBy?: 'value' | 'blueOcean' | 'revenue' | 'reachable';  // 정렬 기준
}

// ============================================================
// 💾 Phase 5.2: LRU 캐시 (24시간 TTL)
// ============================================================
const HUNT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;  // 24시간
const HUNT_CACHE_MAX_SIZE = 50;
const huntCache = new Map<string, { result: AdsenseHunterResult; expiresAt: number }>();

function buildCacheKey(opts: AdsenseHunterOptions): string {
    return JSON.stringify({
        c: opts.category, ct: opts.count, eyh: opts.excludeYmylHigh,
        mi: opts.minInfoIntent, mr: opts.minMonthlyRevenue, rr: opts.requireRealData,
        nb: opts.newbieMode, ez: opts.excludeZeroClickHigh, en: opts.excludeNonInformational,
        sk: (opts.seedKeywords || []).slice(0, 5).join(','),
    });
}

function getCachedResult(key: string): AdsenseHunterResult | null {
    const entry = huntCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        huntCache.delete(key);
        return null;
    }
    // LRU 순서 갱신
    huntCache.delete(key);
    huntCache.set(key, entry);
    return entry.result;
}

function setCachedResult(key: string, result: AdsenseHunterResult): void {
    if (huntCache.size >= HUNT_CACHE_MAX_SIZE) {
        const oldest = huntCache.keys().next().value;
        if (oldest) huntCache.delete(oldest);
    }
    huntCache.set(key, { result, expiresAt: Date.now() + HUNT_CACHE_TTL_MS });
}

export function clearHuntCache(): void {
    huntCache.clear();
    console.log('[ADSENSE-HUNTER] 💾 캐시 전체 삭제');
}

export function getHuntCacheStats(): { size: number; entries: Array<{ key: string; ttlMs: number }> } {
    const now = Date.now();
    return {
        size: huntCache.size,
        entries: Array.from(huntCache.entries()).map(([key, v]) => ({ key, ttlMs: v.expiresAt - now })),
    };
}

export interface StageStatus {
    name: string;
    status: 'success' | 'partial' | 'failed' | 'skipped';
    durationMs: number;
    contributedKeywords: number;
    error?: string;
}

export interface AdsenseHunterResult {
    keywords: AdsenseKeywordData[];
    keywordsByCategory?: Record<string, AdsenseKeywordData[]>;  // 📅 season 카테고리에서만
    categoryRisk?: { level: 'safe' | 'caution' | 'danger'; reason: string };
    sampleBias?: SampleBiasMetrics;       // 📊 표본 편향 HHI (Phase 3.2)
    stages?: StageStatus[];               // 📦 Phase 5.1: 단계별 실패/성공 추적
    summary: {
        totalFound: number;
        sssCount: number;
        ssCount: number;
        sCount: number;
        avgMonthlyRevenue: number;
        totalEstimatedMonthlyRevenue: number;
        // 🔍 데이터 신뢰도 카운트
        realDataCount: number;        // naver-api/pro-validated
        estimatedCount: number;        // estimated
        highConfidenceCount: number;   // dataConfidence === 'high'
        // ⭐ 다중 소스 교차 검증 통계
        verifiedCount: number;         // 3+ 소스 매칭
        doubleVerifiedCount: number;   // 2 소스 매칭
        singleSourceCount: number;     // 1 소스만
        // 💎 블루오션 통계
        ultraBlueCount: number;
        blueCount: number;
        greenCount: number;
        redCount: number;
    };
}

/**
 * AdSense 키워드 헌팅 메인 함수.
 *
 * v3 (4 에이전트 토론 반영 — PRO Primary 하이브리드):
 *  1) PRO 헌터 huntProTrafficKeywords({mode:'category', useDeepMining:true})를 PRIMARY로 호출
 *     → rich-feed-builder + autocomplete + related + deep-mining + 네이버 SV/DC 자동 보강된
 *       풍부한 시드 확보 (직접 safeCall 28개보다 압도적으로 풍부)
 *  2) 직접 라우팅(collectAdsenseSeeds)은 PRO에 빠진 카테고리 특화 시드를 보강하는 보조 역할
 *  3) 보조 시드는 네이버 검색광고 API로 SV/DC 보강 (PRO에 없는 키워드만)
 *  4) 통합된 시드를 AdSense 평가(RPM·정보의도·YMYL) → 등급 산정
 */
export async function huntAdsenseKeywords(
    options: AdsenseHunterOptions = {}
): Promise<AdsenseHunterResult> {
    const {
        category = 'all',
        seedKeywords = [],
        count = 20,
        excludeYmylHigh = false,
        minInfoIntent = 40,
        minMonthlyRevenue = 5000,
        requireRealData = true,
        newbieMode = false,
        excludeZeroClickHigh = false,
        excludeNonInformational = false,
        forceRefresh = false,
        blueOceanOnly = false,
        minBlueOceanRatio,
        sortBy,
    } = options;

    // 💾 Phase 5.2: 캐시 체크
    const cacheKey = buildCacheKey(options);
    if (!forceRefresh) {
        const cached = getCachedResult(cacheKey);
        if (cached) {
            console.log(`[ADSENSE-HUNTER v3] 💾 캐시 HIT (${category}) — ${cached.summary.totalFound}개 결과 즉시 반환`);
            return cached;
        }
    }

    console.log('[ADSENSE-HUNTER v3] 🚀 PRO Primary + 직접라우팅 보강:', { category, count });
    const stages: StageStatus[] = [];

    // ===== STEP 1: PRO 헌터 PRIMARY 호출 (rich-feed-builder + 다단계 확장 활용) =====
    let proKeywords: any[] = [];
    const t1 = Date.now();
    try {
        const proResult = await huntProTrafficKeywords({
            mode: 'category',
            seedKeywords,
            category,
            targetRookie: false,
            includeSeasonKeywords: true,
            explosionMode: false,
            useDeepMining: true,            // 🔥 deep-mining 활성화 (autocomplete + related)
            count: Math.min(count * 5, 100), // 평가 후 필터될 것 고려해 5배 요청
            forceRefresh: true,
        });
        if (proResult.keywords && proResult.keywords.length > 0) {
            proKeywords = proResult.keywords;
            console.log(`[ADSENSE-HUNTER v3] ✅ PRO 시드 ${proKeywords.length}개 (검색량/문서수 자동 보강됨)`);
        }
        stages.push({ name: 'pro-hunter', status: proKeywords.length > 0 ? 'success' : 'partial', durationMs: Date.now() - t1, contributedKeywords: proKeywords.length });
    } catch (err: any) {
        console.warn('[ADSENSE-HUNTER v3] ⚠️ PRO 호출 실패 (보조 라우팅으로 진행):', err?.message);
        stages.push({ name: 'pro-hunter', status: 'failed', durationMs: Date.now() - t1, contributedKeywords: 0, error: err?.message });
    }

    // ===== STEP 2: 직접 라우팅으로 보조 시드 수집 (PRO 누락 보강) =====
    const proKeywordSet = new Set(proKeywords.map(k => k.keyword));
    const t2 = Date.now();
    let directSeedsRaw: Awaited<ReturnType<typeof collectAdsenseSeeds>> = [];
    try {
        directSeedsRaw = await collectAdsenseSeeds(category);
        stages.push({ name: 'direct-routing', status: directSeedsRaw.length > 0 ? 'success' : 'partial', durationMs: Date.now() - t2, contributedKeywords: directSeedsRaw.length });
    } catch (err: any) {
        console.warn('[ADSENSE-HUNTER v3] ⚠️ 직접 라우팅 실패:', err?.message);
        stages.push({ name: 'direct-routing', status: 'failed', durationMs: Date.now() - t2, contributedKeywords: 0, error: err?.message });
    }
    // 호환성을 위한 _ (구 코드 흐름 유지)
    const _unused = await Promise.resolve(directSeedsRaw);
    // 📊 Phase 3.2: 표본 편향 측정 + 균형 재분배
    const sampleBiasBefore = calculateSampleBias(directSeedsRaw);
    const directSeeds = sampleBiasBefore.topSourceShare > 0.35
        ? rebalanceSeedsForDiversity(directSeedsRaw)
        : directSeedsRaw;
    const sampleBias = calculateSampleBias(directSeeds);
    if (sampleBiasBefore.topSourceShare > 0.35) {
        console.log(`[ADSENSE-HUNTER v3] 📊 표본 편향 ${sampleBiasBefore.summary} → 재분배 후 ${sampleBias.summary}`);
    } else {
        console.log(`[ADSENSE-HUNTER v3] 📊 ${sampleBias.summary}`);
    }
    const supplementarySeeds = directSeeds
        .filter(s => !proKeywordSet.has(s.keyword))
        .slice(0, Math.min(count * 2, 40));
    console.log(`[ADSENSE-HUNTER v3] 📦 보조 시드 ${supplementarySeeds.length}개 (PRO 미포함)`);

    // 🌱 STEP 2.5: 빌트인 시드 + 자동완성 확장 (라이브 결과 0개 방지의 핵심)
    const env_ = EnvironmentManager.getInstance().getConfig();
    // 📅 season 카테고리는 (정적 매트릭스 + 동적 발견 시드) 통합 사용
    let seasonSeedMap: Map<string, string> | null = null;
    const t3 = Date.now();
    if (env_.naverClientId && env_.naverClientSecret) {
        let builtinSeeds: string[];
        if (category === 'season') {
            try {
                const merged = await getMergedMonthlyCategorySeeds();
                builtinSeeds = merged.flatSeeds;
                seasonSeedMap = merged.seedToCategory;
                console.log(`[ADSENSE-HUNTER v3] 📅 ${merged.month}월 통합 시드 ${builtinSeeds.length}개 (정적 ${merged.staticCount} + 동적 ${merged.discoveredCount}, ${Object.keys(merged.byCategory).length} 카테고리)`);
            } catch (err: any) {
                builtinSeeds = getCurrentMonthSeasonalSeeds().seeds;
                console.warn('[ADSENSE-HUNTER v3] ⚠️ 동적 시드 발견 실패, 정적만 사용:', err?.message);
            }
        } else {
            builtinSeeds = CATEGORY_BUILTIN_SEEDS[category] || CATEGORY_BUILTIN_SEEDS.all;
        }
        // 외부 소스에서 받은 raw 명사들도 함께 확장 후보로
        const rawForExpansion = [
            ...builtinSeeds,
            ...directSeeds.filter(s => !isWritableKeyword(s.keyword).writable).slice(0, 20).map(s => s.keyword),
        ];
        const expandedKeywords = await expandSeedsToWritable(
            rawForExpansion,
            { naverClientId: env_.naverClientId, naverClientSecret: env_.naverClientSecret },
            15
        );
        for (const ek of expandedKeywords) {
            if (!proKeywordSet.has(ek) && !supplementarySeeds.find(s => s.keyword === ek)) {
                supplementarySeeds.push({ keyword: ek, sources: ['naver-suggest', 'builtin'], freq: 3 });
            }
        }
        console.log(`[ADSENSE-HUNTER v3] 🌱 빌트인+자동완성 확장 후 보조 시드: ${supplementarySeeds.length}개`);
        stages.push({ name: 'autocomplete-expand', status: 'success', durationMs: Date.now() - t3, contributedKeywords: supplementarySeeds.length });
    } else {
        stages.push({ name: 'autocomplete-expand', status: 'skipped', durationMs: 0, contributedKeywords: 0, error: 'naver API key missing' });
    }

    // 사용자 시드도 합성
    for (const userSeed of seedKeywords) {
        const k = String(userSeed || '').trim();
        if (k.length >= 2 && !proKeywordSet.has(k) && !supplementarySeeds.find(s => s.keyword === k)) {
            supplementarySeeds.push({ keyword: k, sources: ['user'], freq: 10 });
        }
    }

    // ===== STEP 3: PRO 키워드 → 글쓰기 게이트 → AdSense 평가 =====
    const evaluated: AdsenseKeywordData[] = [];
    let proBlocked = 0;
    for (const kw of proKeywords) {
        if (!isWritableKeyword(kw.keyword).writable) { proBlocked++; continue; }
        const hasRealData = (kw.searchVolume || 0) > 0;
        // PRO 키워드의 sources 카운트 (PRO 결과 포맷에 따라 보수적으로)
        const proSourcesCount = Array.isArray(kw.sources) ? kw.sources.length
            : Array.isArray(kw.sourceList) ? kw.sourceList.length
            : (kw.crossValidated ? 2 : 1);
        evaluated.push(evaluateAdsenseKeyword({
            keyword: kw.keyword,
            searchVolume: kw.searchVolume || 0,
            documentCount: kw.documentCount || 0,
            category: String(kw.category || category),
            realCpc: kw.estimatedCPC || kw.cpc,
            dataSource: hasRealData ? 'pro-validated' : 'estimated',
            proSourcesCount,
            wikiHit: false,
        }));
    }
    if (proBlocked > 0) console.log(`[ADSENSE-HUNTER v3] 🚫 PRO 시드 ${proBlocked}개 글쓰기 게이트 탈락`);

    // ===== STEP 4: 보조 시드는 네이버 API로 SV/DC 보강 후 평가 =====
    if (supplementarySeeds.length > 0) {
        const env = EnvironmentManager.getInstance().getConfig();

        if (env.naverClientId && env.naverClientSecret) {
            try {
                const supplementaryKeywords = supplementarySeeds.map(s => s.keyword);
                console.log(`[ADSENSE-HUNTER v3] 📊 보조 시드 ${supplementaryKeywords.length}개 SV/DC 조회`);
                const volumes = await getNaverKeywordSearchVolumeSeparate(
                    { clientId: env.naverClientId, clientSecret: env.naverClientSecret },
                    supplementaryKeywords,
                    { includeDocumentCount: true }
                );
                for (const v of volumes) {
                    if (!v.keyword) continue;
                    const sv = (v.pcSearchVolume || 0) + (v.mobileSearchVolume || 0);
                    if (sv === 0) continue;
                    // 보조 시드의 source 다양성 → proCrossSource 신호로 활용
                    const meta = supplementarySeeds.find(s => s.keyword === v.keyword);
                    const proSourcesCount = meta ? meta.sources.length : 1;
                    // wikipedia-ko 소스에 등장했으면 wikiHit
                    const wikiHit = !!(meta && meta.sources.includes('wikipedia-ko'));
                    evaluated.push(evaluateAdsenseKeyword({
                        keyword: v.keyword,
                        searchVolume: sv,
                        documentCount: v.documentCount || 0,
                        category,
                        realCpc: v.monthlyAveCpc || undefined,
                        dataSource: 'naver-api',
                        proSourcesCount,
                        wikiHit,
                    }));
                }
            } catch (err: any) {
                console.warn('[ADSENSE-HUNTER v3] 보조 시드 SV 조회 실패:', err?.message);
            }
        } else {
            // API 없을 때만 보조 시드도 추정값 사용 (PRO 시드가 있으면 그것 위주로)
            console.warn('[ADSENSE-HUNTER v3] 네이버 API 미설정 — 보조 시드는 보수적 추정');
            for (const s of supplementarySeeds) {
                const baseVolume = ESTIMATED_BASE_SV[category] || ESTIMATED_BASE_SV.default;
                const estimatedSv = Math.min(s.freq * s.sources.length * baseVolume, 5000);
                evaluated.push(evaluateAdsenseKeyword({
                    keyword: s.keyword,
                    searchVolume: estimatedSv,
                    documentCount: Math.max(10, Math.round(estimatedSv * 0.3)),
                    category,
                    dataSource: 'estimated',
                    proSourcesCount: s.sources.length,
                    wikiHit: s.sources.includes('wikipedia-ko'),
                }));
            }
        }
    }

    if (evaluated.length === 0) {
        console.warn('[ADSENSE-HUNTER v3] ❌ 평가 키워드 0개 — 모든 소스 실패');
        return emptyResult();
    }

    // 📅 season 카테고리: 결과 키워드에 sub-카테고리 자동 부여
    if (category === 'season' && seasonSeedMap) {
        for (const k of evaluated) {
            k.subCategory = classifyKeywordToSubCategory(k.keyword, seasonSeedMap);
        }
    }

    // 🚨 카테고리 위험도 경고 (사용자에게 표시될 메타정보)
    const categoryRisk = CATEGORY_RISK[category] || CATEGORY_RISK.all;
    if (categoryRisk.level === 'danger') {
        console.warn(`[ADSENSE-HUNTER v3] 🚨 ${category} 카테고리 고위험: ${categoryRisk.reason}`);
    }

    console.log(`[ADSENSE-HUNTER v3] 🎯 평가 ${evaluated.length}개 → 교차검증 enrichment`);

    // ===== STEP 5: 다중 소스 교차 검증 (네이버 자동완성) — TOP N에만 =====
    const env5 = EnvironmentManager.getInstance().getConfig();
    const t5 = Date.now();
    if (env5.naverClientId && env5.naverClientSecret && evaluated.length > 0) {
        evaluated.sort((a, b) => b.valueScore - a.valueScore);
        const topForEnrich = evaluated.slice(0, Math.min(30, evaluated.length));
        try {
            await enrichWithCrossValidation(topForEnrich, {
                naverClientId: env5.naverClientId,
                naverClientSecret: env5.naverClientSecret,
            });
            const enriched = topForEnrich.filter(k => k.crossValidation.signals.naverSuggest).length;
            stages.push({ name: 'cross-validation', status: 'success', durationMs: Date.now() - t5, contributedKeywords: enriched });
        } catch (err: any) {
            console.warn('[ADSENSE-HUNTER v3] 교차검증 enrich 실패:', err?.message);
            stages.push({ name: 'cross-validation', status: 'failed', durationMs: Date.now() - t5, contributedKeywords: 0, error: err?.message });
        }
    } else {
        stages.push({ name: 'cross-validation', status: 'skipped', durationMs: 0, contributedKeywords: 0 });
    }

    const result = finalizeAdsenseResults(evaluated, {
        count, excludeYmylHigh, minInfoIntent, minMonthlyRevenue, requireRealData,
        category, newbieMode, excludeZeroClickHigh, excludeNonInformational,
        blueOceanOnly, minBlueOceanRatio, sortBy,
    });
    result.categoryRisk = categoryRisk;
    result.sampleBias = sampleBias;
    result.stages = stages;

    // 💾 캐시 저장 (24시간 TTL)
    if (result.keywords.length > 0) {
        setCachedResult(cacheKey, result);
        console.log(`[ADSENSE-HUNTER v3] 💾 캐시 저장 (${category}, TTL 24h, 전체 캐시 ${huntCache.size}/${HUNT_CACHE_MAX_SIZE})`);
    }

    // 📅 season 카테고리: 결과를 sub-카테고리별 그룹핑
    if (category === 'season' && result.keywords.length > 0) {
        const grouped: Record<string, AdsenseKeywordData[]> = {};
        for (const k of result.keywords) {
            const sub = k.subCategory || 'etc';
            if (!grouped[sub]) grouped[sub] = [];
            grouped[sub].push(k);
        }
        // 각 카테고리 내부도 가치점수 정렬 유지
        for (const sub of Object.keys(grouped)) {
            grouped[sub].sort((a, b) => b.valueScore - a.valueScore);
        }
        result.keywordsByCategory = grouped;
    }

    return result;
}

/**
 * API 없을 때 보조 시드 검색량 추정용 카테고리별 기준값 (월 검색량).
 * 4 에이전트 검증 결과: 기존 200 고정값 → 카테고리별 차등으로 보정.
 * 고RPM 키워드(loan/finance/legal)는 검색량은 적지만 단가가 높음.
 */
const ESTIMATED_BASE_SV: Record<string, number> = {
    subsidy: 800,
    season: 600,
    'naver-home': 1200,  // 홈판 키워드는 트렌드 폭증 시 검색량 매우 높음
    loan: 400, finance: 500, insurance: 400, realestate: 600, legal: 350, tax: 500,
    medical: 600, dental: 400, health: 800, supplement: 600, diet: 700,
    laptop: 500, smartphone: 600, it: 700, app: 500,
    education: 600, certificate: 500, business: 400, job: 500,
    living: 400, life_tips: 600, interior: 500, diy: 400, gardening: 300,
    parenting: 500, wedding: 300, pet: 400,
    travel: 500, car: 400,
    beauty: 600, fashion: 500,
    recipe: 700, food: 600, cooking: 500,
    game: 500, sports: 400, hobby: 300,
    review: 400, shopping: 500,
    all: 500, default: 400,
};

function emptyResult(): AdsenseHunterResult {
    return {
        keywords: [],
        summary: {
            totalFound: 0, sssCount: 0, ssCount: 0, sCount: 0,
            avgMonthlyRevenue: 0, totalEstimatedMonthlyRevenue: 0,
            realDataCount: 0, estimatedCount: 0, highConfidenceCount: 0,
            verifiedCount: 0, doubleVerifiedCount: 0, singleSourceCount: 0,
            ultraBlueCount: 0, blueCount: 0, greenCount: 0, redCount: 0,
        },
    };
}

function finalizeAdsenseResults(
    evaluated: AdsenseKeywordData[],
    opts: {
        count: number;
        excludeYmylHigh: boolean;
        minInfoIntent: number;
        minMonthlyRevenue: number;
        requireRealData?: boolean;
        category?: string;
        newbieMode?: boolean;
        excludeZeroClickHigh?: boolean;
        excludeNonInformational?: boolean;
        blueOceanOnly?: boolean;
        minBlueOceanRatio?: number;
        sortBy?: 'value' | 'blueOcean' | 'revenue' | 'reachable';
    }
): AdsenseHunterResult {
    // 사용자 선택 카테고리 기반 통일 게이트 (PRO가 다른 카테고리 채워도 무시)
    const userRiskLevel = CATEGORY_RISK[opts.category || 'all']?.level || 'caution';
    // 🔍 v3.3: 실측 데이터 게이트 (사용자 핵심 요구 — "실제 사람들이 찾는 키워드?")
    if (opts.requireRealData !== false) {
        const beforeReal = evaluated.length;
        evaluated = evaluated.filter(k => k.dataSource !== 'estimated');
        const blockedByReal = beforeReal - evaluated.length;
        if (blockedByReal > 0) {
            console.log(`[ADSENSE-HUNTER] 🔍 추정 검색량 ${blockedByReal}개 차단 (실측 데이터만 허용)`);
        }
    }

    // 🔥 v3.1: 글쓰기 불가 키워드 강제 차단
    const beforeWritable = evaluated.length;
    evaluated = evaluated.filter(k => k.writable);
    const blockedByWritable = beforeWritable - evaluated.length;
    if (blockedByWritable > 0) {
        console.log(`[ADSENSE-HUNTER] 🚫 글쓰기 불가 ${blockedByWritable}개 차단`);
    }

    // 🌱 v3.7 Phase 2.3: 신생 블로거 모드 — 5토큰+ AND 8자+ 강제 재검증
    if (opts.newbieMode) {
        const before = evaluated.length;
        evaluated = evaluated.filter(k => isWritableKeyword(k.keyword, { newbie: true }).writable);
        const blocked = before - evaluated.length;
        if (blocked > 0) console.log(`[ADSENSE-HUNTER] 🌱 신생모드 5토큰 미달 ${blocked}개 차단`);
    }

    // 🚫 v3.7 Phase 2.2: 0클릭 고위험 제외 옵션
    if (opts.excludeZeroClickHigh) {
        const before = evaluated.length;
        evaluated = evaluated.filter(k => k.zeroClickRisk?.level !== 'high');
        const blocked = before - evaluated.length;
        if (blocked > 0) console.log(`[ADSENSE-HUNTER] 🚫 0클릭 고위험 ${blocked}개 차단`);
    }

    // 🎯 v3.7 Phase 2.1: 정보형 외 의도 제외 옵션 (AdSense 최적화)
    if (opts.excludeNonInformational) {
        const before = evaluated.length;
        evaluated = evaluated.filter(k => k.searchIntent?.primary === 'informational');
        const blocked = before - evaluated.length;
        if (blocked > 0) console.log(`[ADSENSE-HUNTER] 🎯 비정보형 ${blocked}개 차단`);
    }

    // 💎 블루오션 게이트
    if (opts.blueOceanOnly) {
        const before = evaluated.length;
        evaluated = evaluated.filter(k => k.blueOcean?.isBlueOcean);
        const blocked = before - evaluated.length;
        if (blocked > 0) console.log(`[ADSENSE-HUNTER] 💎 블루오션 외 ${blocked}개 차단 (ultra-blue/blue만)`);
    }
    if (typeof opts.minBlueOceanRatio === 'number' && opts.minBlueOceanRatio > 0) {
        const before = evaluated.length;
        evaluated = evaluated.filter(k => (k.blueOcean?.ratio || 0) >= opts.minBlueOceanRatio!);
        const blocked = before - evaluated.length;
        if (blocked > 0) console.log(`[ADSENSE-HUNTER] 💎 경쟁비 < ${opts.minBlueOceanRatio} ${blocked}개 차단`);
    }

    // 💎 v3.5: 적응형 가치 게이트 (사용자 선택 카테고리 위험도 기준 통일 적용)
    const thresholds = {
        safe:    { sv: 100, ratio: 0.2, cpc: 50,  intent: 35, value: 30 },
        caution: { sv: 200, ratio: 0.3, cpc: 100, intent: 40, value: 45 },
        danger:  { sv: 200, ratio: 0.3, cpc: 100, intent: 40, value: 50 },
    }[userRiskLevel];

    const beforeValue = evaluated.length;
    evaluated = evaluated.filter(k => {
        if (k.searchVolume < thresholds.sv) return false;
        if (k.competitionRatio < thresholds.ratio) return false;
        if (k.estimatedCPC < thresholds.cpc) return false;
        if (k.infoIntentScore < thresholds.intent) return false;
        if (k.valueScore < thresholds.value) return false;
        return true;
    });
    const blockedByValue = beforeValue - evaluated.length;
    if (blockedByValue > 0) {
        console.log(`[ADSENSE-HUNTER] 💎 가치 부족 ${blockedByValue}개 차단 (${userRiskLevel} 게이트: sv≥${thresholds.sv} ratio≥${thresholds.ratio} cpc≥${thresholds.cpc} value≥${thresholds.value})`);
    }
    if (evaluated.length > 0) {
        console.log(`[ADSENSE-HUNTER] 📊 통과 샘플:`, evaluated.slice(0, 3).map(k => `${k.keyword}(sv=${k.searchVolume},cpc=${k.estimatedCPC},val=${k.valueScore},grade=${k.grade})`).join(' | '));
    }

    // safe 카테고리는 등급 게이트 + minMonthlyRevenue 자동 완화 (저RPM 특성 반영)
    const adjustedMinRevenue = userRiskLevel === 'safe' ? Math.min(opts.minMonthlyRevenue, 100) : opts.minMonthlyRevenue;
    const allowBGrade = userRiskLevel === 'safe';  // safe는 B 등급도 통과 허용

    const filtered = evaluated.filter(k => {
        if (k.safety === 'danger') return false;
        if (opts.excludeYmylHigh && k.ymylRisk === 'high') return false;
        if (k.infoIntentScore < opts.minInfoIntent) return false;
        if (k.estimatedMonthlyRevenue < adjustedMinRevenue) return false;
        if (!allowBGrade && k.grade === 'B') return false;
        return true;
    });

    // 정렬 — sortBy 옵션 (기본: value)
    const sortBy = opts.sortBy || 'value';
    filtered.sort((a, b) => {
        if (sortBy === 'blueOcean') {
            // 💎 블루오션 우선 (ratio ↓ 큰 것)
            const ra = a.blueOcean?.ratio || 0;
            const rb = b.blueOcean?.ratio || 0;
            if (rb !== ra) return rb - ra;
            return (b.reachability?.month12.monthlyRevenue || 0) - (a.reachability?.month12.monthlyRevenue || 0);
        } else if (sortBy === 'reachable') {
            // 🎯 12개월 도달 후 실수익 우선 (가장 현실적)
            const ra = a.reachability?.month12.monthlyRevenue || 0;
            const rb = b.reachability?.month12.monthlyRevenue || 0;
            if (rb !== ra) return rb - ra;
            return (b.blueOcean?.ratio || 0) - (a.blueOcean?.ratio || 0);
        } else if (sortBy === 'revenue') {
            return b.estimatedMonthlyRevenue - a.estimatedMonthlyRevenue;
        }
        // 기본 value: 교차검증 → 가치점수 → 월수익
        const cvA = a.crossValidation?.score || 0;
        const cvB = b.crossValidation?.score || 0;
        if (cvB !== cvA) return cvB - cvA;
        if (b.valueScore !== a.valueScore) return b.valueScore - a.valueScore;
        if (b.estimatedMonthlyRevenue !== a.estimatedMonthlyRevenue) return b.estimatedMonthlyRevenue - a.estimatedMonthlyRevenue;
        return b.infoIntentScore - a.infoIntentScore;
    });

    const top = filtered.slice(0, opts.count);

    const summary = {
        totalFound: top.length,
        sssCount: top.filter(k => k.grade === 'SSS').length,
        ssCount: top.filter(k => k.grade === 'SS').length,
        sCount: top.filter(k => k.grade === 'S').length,
        avgMonthlyRevenue: top.length > 0
            ? Math.round(top.reduce((s, k) => s + k.estimatedMonthlyRevenue, 0) / top.length)
            : 0,
        totalEstimatedMonthlyRevenue: top.reduce((s, k) => s + k.estimatedMonthlyRevenue, 0),
        realDataCount: top.filter(k => k.dataSource !== 'estimated').length,
        estimatedCount: top.filter(k => k.dataSource === 'estimated').length,
        highConfidenceCount: top.filter(k => k.dataConfidence === 'high').length,
        verifiedCount: top.filter(k => k.crossValidation?.level === 'verified').length,
        doubleVerifiedCount: top.filter(k => k.crossValidation?.level === 'double').length,
        singleSourceCount: top.filter(k => k.crossValidation?.level === 'single').length,
        ultraBlueCount: top.filter(k => k.blueOcean?.level === 'ultra-blue').length,
        blueCount: top.filter(k => k.blueOcean?.level === 'blue').length,
        greenCount: top.filter(k => k.blueOcean?.level === 'green').length,
        redCount: top.filter(k => k.blueOcean?.level === 'red').length,
    };

    console.log(`[ADSENSE-HUNTER] ✅ ${top.length}개 추출 (SSS=${summary.sssCount}, SS=${summary.ssCount}, S=${summary.sCount})`);
    return { keywords: top, summary };
}

// ============================================================
// 6) 카테고리 옵션 (UI에서 사용)
// ============================================================

/**
 * 카테고리별 위험도 분류 (사용자가 글 썼을 때 받을 위험)
 *  - danger: 광고법 위반 + YMYL 최고위험 — 등록 사업자/전문가만 권장
 *  - caution: YMYL + 전문성 요구 — 정확한 정보 + 면책 문구 필수
 *  - safe: 일반 블로거 안전 — 누구나 작성 가능
 */
export const CATEGORY_RISK: Record<string, { level: 'safe' | 'caution' | 'danger'; reason: string }> = {
    // 🚨 DANGER — 광고법/저품질/법적 위험
    loan: { level: 'danger', reason: '🚨 대출 광고는 등록 금융사만 가능 (광고법 위반 위험) + 신생 블로그 저품질' },
    legal: { level: 'danger', reason: '🚨 법률 자문은 변호사만 가능 + 잘못된 정보 시 법적 책임' },
    medical: { level: 'danger', reason: '🚨 의료 정보는 의료법 적용 + 신생 블로그 저품질 + 의료기관 공식 글에 밀림' },
    dental: { level: 'danger', reason: '🚨 치과 시술 광고는 의료법 위반, 의료기관만 가능' },
    plastic: { level: 'danger', reason: '🚨 성형/시술 광고는 의료법 위반, 의료기관 전용' },

    // ⚠️ CAUTION — YMYL + 전문성 필요
    insurance: { level: 'caution', reason: '⚠️ 보험 비교는 보험설계사 영역 + 정확한 약관 인용 필요' },
    finance: { level: 'caution', reason: '⚠️ 금융 투자 정보는 투자자문업 등록 필요 + 손실 면책 문구' },
    realestate: { level: 'caution', reason: '⚠️ 부동산 정보는 정확한 시세/법규 인용 필요' },
    tax: { level: 'caution', reason: '⚠️ 세무 정보는 세법 변경에 민감 + 세무사 자문 권장' },
    supplement: { level: 'caution', reason: '⚠️ 효능 과장 시 표시광고법/식품위생법 위반' },
    diet: { level: 'caution', reason: '⚠️ 건강 영향 → 정확한 근거 + 면책 문구 필요' },
    health: { level: 'caution', reason: '⚠️ 건강 정보는 의학적 근거 필요 (전문가 인용 권장)' },

    // ✅ SAFE — 일반 블로거 안전
    subsidy: { level: 'safe', reason: '✅ 정부 지원금 정보 공유는 안전 + 고CPC (대출/금융 광고 게재) — 신생 블로거 추천' },
    season: { level: 'safe', reason: '✅ 매월 시즌 황금키워드 — 선물/여행/이벤트 등 검색 폭증 시즌만 자동 추출' },
    'naver-home': { level: 'safe', reason: '🏠 네이버 메인 홈판 노출 특화 — CTR + 신선도 + 카테고리 적합도 + 빈자리 종합' },
    laptop: { level: 'safe', reason: '✅ 제품 리뷰 — 안전' },
    smartphone: { level: 'safe', reason: '✅ 제품 리뷰 — 안전' },
    appliance: { level: 'safe', reason: '✅ 제품 리뷰 — 안전' },
    it: { level: 'safe', reason: '✅ IT 정보 — 안전' },
    app: { level: 'safe', reason: '✅ 앱 추천 — 안전' },
    education: { level: 'safe', reason: '✅ 학습 정보 — 안전' },
    certificate: { level: 'safe', reason: '✅ 자격증 정보 — 안전' },
    business: { level: 'caution', reason: '⚠️ 창업 정보 — 사업자 등록 절차 정확성 주의' },
    job: { level: 'safe', reason: '✅ 취업 정보 — 안전' },
    living: { level: 'safe', reason: '✅ 리빙 — 가장 안전 (제품 리뷰/꿀팁)' },
    life_tips: { level: 'safe', reason: '✅ 생활꿀팁 — 가장 안전 (정보형)' },
    interior: { level: 'safe', reason: '✅ 인테리어 — 안전' },
    diy: { level: 'safe', reason: '✅ DIY — 안전' },
    gardening: { level: 'safe', reason: '✅ 가드닝 — 안전' },
    parenting: { level: 'safe', reason: '✅ 육아 — 안전 (의학 조언은 caution)' },
    wedding: { level: 'safe', reason: '✅ 웨딩 — 안전' },
    pet: { level: 'safe', reason: '✅ 반려동물 — 안전' },
    travel: { level: 'safe', reason: '✅ 여행 — 안전' },
    car: { level: 'safe', reason: '✅ 자동차 리뷰 — 안전' },
    beauty: { level: 'safe', reason: '✅ 뷰티 — 안전' },
    fashion: { level: 'safe', reason: '✅ 패션 — 안전' },
    recipe: { level: 'safe', reason: '✅ 레시피 — 안전' },
    food: { level: 'safe', reason: '✅ 음식·맛집 — 안전' },
    cooking: { level: 'safe', reason: '✅ 요리 — 안전' },
    game: { level: 'safe', reason: '✅ 게임 — 안전' },
    sports: { level: 'safe', reason: '✅ 스포츠 — 안전' },
    hobby: { level: 'safe', reason: '✅ 취미 — 안전' },
    review: { level: 'safe', reason: '✅ 제품 리뷰 — 안전' },
    shopping: { level: 'safe', reason: '✅ 쇼핑 — 안전' },
    all: { level: 'caution', reason: '⚠️ 자동 분류 — 카테고리에 따라 위험도 다름' },
};

export const ADSENSE_CATEGORIES = [
    { value: 'all', label: '🎯 전체 (자동 분류)' },

    // 🏠 네이버 홈판 (메인 노출 특화 — 신규)
    { value: 'naver-home', label: '🏠 ✨ 네이버 홈판 (CTR+신선도+빈자리·끝판왕)' },

    // 📅 매월 시즌 황금키워드 (자동 갱신)
    { value: 'season', label: '📅 ✅ 이번 달 시즌 황금키워드 (자동 갱신·강추)' },

    // 💎 SAFE + 고RPM (정부 지원금 — 가장 추천)
    { value: 'subsidy', label: '💎 ✅ 정부 지원금·보조금 (안전+고CPC·강추)' },

    // 💰 고RPM (금융·법률 계열) — 🚨 광고법/YMYL 위험
    { value: 'loan', label: '🚨 대출·신용 (최고RPM·고위험)' },
    { value: 'finance', label: '⚠️ 금융·재테크 (고RPM·주의)' },
    { value: 'insurance', label: '⚠️ 보험 (고RPM·주의)' },
    { value: 'realestate', label: '⚠️ 부동산·청약 (고RPM·주의)' },
    { value: 'legal', label: '🚨 법률·소송 (고RPM·고위험)' },
    { value: 'tax', label: '⚠️ 세금·연말정산 (고RPM·주의)' },

    // 🏥 의료·건강
    { value: 'medical', label: '🚨 의료·진료 (고위험)' },
    { value: 'dental', label: '🚨 치과·임플란트 (의료법위험)' },
    { value: 'health', label: '⚠️ 건강·운동 (주의)' },
    { value: 'supplement', label: '⚠️ 영양제·건강기능식품 (주의)' },
    { value: 'diet', label: '⚠️ 다이어트 (주의)' },

    // 💻 IT·디지털
    { value: 'it', label: '💻 IT·소프트웨어' },
    { value: 'laptop', label: '💻 노트북·PC' },
    { value: 'smartphone', label: '📱 스마트폰·이어폰' },
    { value: 'appliance', label: '🔌 가전·생활가전' },
    { value: 'app', label: '📲 앱·서비스 추천' },

    // 📚 교육·커리어
    { value: 'education', label: '📚 교육·학습' },
    { value: 'certificate', label: '🎓 자격증·시험 (블루오션)' },
    { value: 'business', label: '💼 비즈니스·창업·부업' },
    { value: 'job', label: '💼 취업·이직' },

    // 🏡 리빙·생활 (✅ 신생블로거 추천)
    { value: 'living', label: '✅ 🛏️ 리빙·홈 (안전·추천)' },
    { value: 'life_tips', label: '✅ 💡 생활꿀팁 (안전·추천)' },
    { value: 'interior', label: '✅ 🛋️ 인테리어·홈데코 (안전)' },
    { value: 'diy', label: '✅ 🔧 셀프수리·DIY (안전)' },
    { value: 'gardening', label: '✅ 🌿 가드닝·반려식물 (안전)' },

    // 👨‍👩‍👧 가족·육아
    { value: 'parenting', label: '👶 육아·출산' },
    { value: 'wedding', label: '💍 결혼·웨딩' },
    { value: 'pet', label: '🐶 반려동물·펫케어' },

    // ✈️ 여행·라이프스타일
    { value: 'travel', label: '✈️ 여행·항공·호텔' },
    { value: 'car', label: '🚗 자동차·카라이프' },

    // 💄 뷰티·패션
    { value: 'beauty', label: '💄 뷰티·스킨케어' },
    { value: 'fashion', label: '👗 패션·옷' },

    // 🍳 음식·요리
    { value: 'recipe', label: '🍳 레시피·요리' },
    { value: 'food', label: '🍱 음식·맛집' },

    // 🎮 취미·문화
    { value: 'game', label: '🎮 게임·콘솔' },
    { value: 'sports', label: '🏃 운동·피트니스' },
    { value: 'hobby', label: '📷 취미·카메라·악기' },

    // ⭐ 종합
    { value: 'review', label: '⭐ 제품리뷰·후기' },
    { value: 'shopping', label: '🛒 쇼핑·핫딜' },
];
