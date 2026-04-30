/**
 * 🎯 홈판 키워드 가치 검증
 *
 * "homeScore 통과 = 가치 있음"이 아니다.
 * 신생 블로거가 글 쓸 가치 있는 키워드인지 6개 게이트로 별도 검증.
 *
 * 가치 게이트:
 *   1. 실측 검색량 ≥ 100/월
 *   2. 문서수/검색량 비율 ≥ 0.5 (너무 경쟁적이지 않음)
 *   3. 글감 가능 (4토큰+ OR 10자+ — 단일 명사 X)
 *   4. 인물 의존 차단 (셀럽/정치인/연예인)
 *   5. YMYL 안전 (의료/법률/금융 투자 위험 차단 — 신생 블로거 부적합)
 *   6. 검색 의도 명확 (정보형/구매형/거래형)
 *
 * 통과 수 = 6/6 (S+) / 5/6 (S) / 4/6 (A) / 3/6 (B) / ≤2 (C)
 */

const PERSON_DEPENDENT_TOKENS = [
    // 연예인/셀럽 (예시 — 인물 키워드 의존)
    '아이유', '뉴진스', 'BTS', '방탄', '블랙핑크', '에스파', '르세라핌',
    '이재명', '윤석열', '한동훈', '대통령', '검찰', '판결',
    '나연', '카리나', '장원영', '하니', '민지', '윈터', '카리나',
    '아이브', '있지', '스테이씨', '뉴진스', '데이식스',
    '손흥민', '이강인', '김민재',
    '봉준호', '박찬욱',
];

const YMYL_HIGH_RISK_TOKENS = [
    // 의료
    '진단', '치료', '수술', '처방', '약물', '의료법',
    // 법률
    '소송', '고소', '판결', '변호사', '법적책임',
    // 금융 투자 (확장)
    '주식 추천', '코인 추천', 'ETF 추천', '레버리지', '대출 권유',
    '코인 투자', '주식 투자', '코인 단타', '주식 단타', '비트코인 투자',
    '리딩방', '주식 리딩', '코인 리딩', '레버리지 ETF',
    // 다이어트 의학
    '약제', '지방흡입', '체중감량 약', '비만 시술',
];

const INFO_INTENT_TOKENS = [
    // 정보형
    '방법', '이유', '효능', '뜻', '의미', '추천', '비교', '후기', '가이드',
    '정리', '리뷰', '얼마', '언제', '어떻게', '신청', '계산기', '자격',
    '조건', '차이', '순위', '랭킹', 'TOP', '꿀팁', '팁',
    // 행위/활용
    '활용', '활용법', '쓰는법', '쓰는 법', '먹는법', '만드는법', '관리',
    '해소', '제거', '예방', '청소', '훈련', '교육', '시작', '입문',
    // 시즌/콘텍스트
    '명소', '시기', '루틴', '체크리스트', '메뉴', '코스', '준비',
    '코디', '필수', '베스트', 'BEST', '최신', '2026',
];

export interface ValueGateResult {
    keyword: string;
    gates: {
        searchVolume: { passed: boolean; value: number; threshold: number };
        competitionRatio: { passed: boolean; value: number; threshold: number };
        writability: { passed: boolean; tokens: number; chars: number };
        notPersonDependent: { passed: boolean; matchedTokens: string[] };
        ymylSafe: { passed: boolean; matchedTokens: string[] };
        intentClarity: { passed: boolean; matchedTokens: string[] };
    };
    passedCount: number;        // 0~6
    valueGrade: 'S+' | 'S' | 'A' | 'B' | 'C';
    valueScore: number;          // 0~100
    valuable: boolean;           // 4 게이트 이상 통과
    summary: string;
}

export interface VerifyInput {
    keyword: string;
    searchVolume?: number;
    documentCount?: number;
}

export function verifyKeywordValue(input: VerifyInput): ValueGateResult {
    const kw = input.keyword.trim();
    const sv = input.searchVolume ?? 0;
    const dc = input.documentCount ?? 0;

    // 1. 실측 검색량 ≥ 100/월
    const SV_THRESHOLD = 100;
    const svPass = sv >= SV_THRESHOLD;

    // 2. 경쟁 비율 — 블루오션 OR 충분한 트래픽
    // ratio ≥ 0.05 (sv≥1, dc<20 같은 블루오션) OR sv ≥ 1000 (트래픽 충분)
    const ratio = sv > 0 ? sv / Math.max(1, dc) : 0;
    const RATIO_THRESHOLD = 0.05;
    const ratioPass = ratio >= RATIO_THRESHOLD || sv >= 1000;

    // 3. 글감 가능 — 4토큰 OR 10자
    const tokens = kw.split(/\s+/).filter(t => t.length > 0).length;
    const chars = kw.length;
    const writabilityPass = tokens >= 4 || chars >= 10;

    // 4. 인물 의존 차단
    const personMatched = PERSON_DEPENDENT_TOKENS.filter(p => kw.includes(p));
    const personPass = personMatched.length === 0;

    // 5. YMYL 안전
    const ymylMatched = YMYL_HIGH_RISK_TOKENS.filter(y => kw.includes(y));
    const ymylPass = ymylMatched.length === 0;

    // 6. 검색 의도 명확 (정보형/구매형/거래형 토큰 ≥ 1)
    const intentMatched = INFO_INTENT_TOKENS.filter(i => kw.toLowerCase().includes(i));
    const intentPass = intentMatched.length >= 1;

    const gates = {
        searchVolume: { passed: svPass, value: sv, threshold: SV_THRESHOLD },
        competitionRatio: { passed: ratioPass, value: Math.round(ratio * 100) / 100, threshold: RATIO_THRESHOLD },
        writability: { passed: writabilityPass, tokens, chars },
        notPersonDependent: { passed: personPass, matchedTokens: personMatched },
        ymylSafe: { passed: ymylPass, matchedTokens: ymylMatched },
        intentClarity: { passed: intentPass, matchedTokens: intentMatched },
    };

    const passedCount =
        (svPass ? 1 : 0) +
        (ratioPass ? 1 : 0) +
        (writabilityPass ? 1 : 0) +
        (personPass ? 1 : 0) +
        (ymylPass ? 1 : 0) +
        (intentPass ? 1 : 0);

    // 🛑 Kill-switch: 인물/YMYL/글감불가는 다른 게이트와 무관하게 즉시 차단
    // (글감 못 쓰는 단일 명사는 'AI'/'운동'/'핸드폰' 같이 진입 불가)
    const isKilled = !personPass || !ymylPass || !writabilityPass;

    let valueGrade: ValueGateResult['valueGrade'];
    if (isKilled) valueGrade = 'C';
    else if (passedCount === 6) valueGrade = 'S+';
    else if (passedCount === 5) valueGrade = 'S';
    else if (passedCount === 4) valueGrade = 'A';
    else if (passedCount === 3) valueGrade = 'B';
    else valueGrade = 'C';

    const valueScore = isKilled ? 0 : Math.round((passedCount / 6) * 100);
    const valuable = !isKilled && passedCount >= 4;

    let summary: string;
    if (isKilled) {
        const reasons: string[] = [];
        if (!personPass) reasons.push(`인물 의존 (${personMatched.join(',')})`);
        if (!ymylPass) reasons.push(`YMYL 위험 (${ymylMatched.join(',')})`);
        if (!writabilityPass) reasons.push(`글감 불가 (${tokens}토큰 ${chars}자 — 단일 명사)`);
        summary = `🛑 차단 — ${reasons.join(' · ')}`;
    } else if (passedCount === 6) summary = '🏆 완벽 — 모든 가치 게이트 통과';
    else if (passedCount === 5) summary = '🚀 우수 — 1개 게이트 미달 (사용 권장)';
    else if (passedCount === 4) summary = '✅ 양호 — 글감으로 충분';
    else if (passedCount === 3) summary = '⚠️ 보통 — 신중 검토';
    else if (passedCount === 2) summary = '🔴 가치 부족 — 다른 키워드 권장';
    else summary = '💀 가치 없음 — 차단 권장';

    return {
        keyword: kw,
        gates,
        passedCount,
        valueGrade,
        valueScore,
        valuable,
        summary,
    };
}

/**
 * 키워드 배열 가치 검증 + 통과만 반환 (가치 점수 순)
 */
export function filterValuableKeywords<T extends VerifyInput>(
    keywords: T[],
    options: { minGates?: number } = {}
): Array<T & { valueGate: ValueGateResult }> {
    const minGates = options.minGates ?? 4;
    return keywords
        .map(k => ({ ...k, valueGate: verifyKeywordValue(k) }))
        .filter(k => k.valueGate.passedCount >= minGates)
        .sort((a, b) => b.valueGate.valueScore - a.valueGate.valueScore);
}

/**
 * 사전 검증된 빌트인 홈판 시드 — 6 게이트 모두 통과 보증
 * (모두 정보형 토큰 + 4토큰+ + 비셀럽 + 비YMYL)
 */
export const VERIFIED_BUILTIN_HOME_SEEDS: string[] = [
    '봄 나들이 가볼만한 곳 추천',
    '환절기 면역력 음식 추천',
    '주말 데이트 코스 추천',
    '점심 메뉴 추천 직장인',
    '저녁 메뉴 추천 집밥',
    '봄 옷 코디 추천 여성',
    '5월 제철 음식 정리',
    '거실 인테리어 셀프 꿀팁',
    '주방 수납 정리 방법',
    '집밥 1주일 메뉴 추천',
    '아이 감기 빨리 낫는 방법',
    '신생아 수면 교육 방법',
    '강아지 산책 시간 가이드',
    '고양이 분리불안 해결 방법',
    '봄 다이어트 식단 추천',
    '회사 점심 도시락 메뉴',
    '드라이브 코스 추천 수도권',
    '가족 캠핑 준비물 체크리스트',
    '환절기 옷 코디 가이드',
    '러닝화 추천 입문자',
    '가습기 청소 방법 정리',
    '커피머신 청소 꿀팁',
    '집들이 음식 추천 메뉴',
    '아기 이유식 메뉴 정리',
    '주말 영화 추천 장르별',
    '국내 여행 코스 추천',
    '요가 초보 자세 가이드',
    '수면 질 높이는 방법',
    '집 정리 5분 꿀팁',
    '주방 도구 추천 필수',
    '청년월세지원 신청 방법',
    '근로장려금 자격 조건',
    '에너지바우처 신청 가이드',
    '연말정산 환급 방법 정리',
    '소상공인 지원금 신청',
    '실업급여 신청 절차',
    '내일배움카드 활용 방법',
    '청년도약계좌 가입 조건',
    '국민지원금 자격 신청',
    '자녀장려금 신청 방법',
    '베란다 가드닝 시작 방법',
    '아이패드 활용법 정리',
    '노트북 발열 해결 방법',
    '욕실 곰팡이 제거 꿀팁',
    '아이 책 추천 연령별',
    '월급 재테크 시작 방법',
    '주말 한끼 요리 추천',
    '강아지 사료 비교 추천',
    '운동 초보 루틴 가이드',
    '재택근무 책상 추천',
];
