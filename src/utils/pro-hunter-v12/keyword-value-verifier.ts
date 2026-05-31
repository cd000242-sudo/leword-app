/**
 * 🎯 홈판 키워드 가치 검증 — 12 게이트 끝판왕 시스템
 *
 * 6 → 12 게이트로 확장 (v2.34.0):
 *
 * Kill-switch 게이트 (즉시 차단):
 *   1. 인물 의존 차단 (셀럽/정치인)
 *   2. YMYL 안전 (의료/법률/투자 위험)
 *   3. 글감 가능 (4토큰+ 또는 10자+ — 단일 명사 X)
 *
 * 일반 게이트:
 *   4. 실측 검색량 ≥ 100/월
 *   5. 경쟁 비율 ≥ 0.05 또는 sv ≥ 1000
 *   6. 검색 의도 명확 (정보형/구매형 토큰)
 *   7. 🆕 시즌 적합성 (현재 월/계절 매칭 또는 시즌 무관)
 *   8. 🆕 롱테일 깊이 (5토큰+ 또는 15자+ — 깊은 구체성 보너스)
 *   9. 🆕 콘텐츠 깊이 가능 (정보형 + 토큰 4+ → 1500자 글 작성 가능)
 *  10. 🆕 신생 블로거 진입 가능 (토큰 4+ + 비-단일실체)
 *  11. 🆕 자동완성 매칭 (실측 시 활성, 옵션)
 *  12. 🆕 AI 의미 검증 (Claude 모드 시, 옵션)
 *
 * 종합 품질 점수: (passedCount / totalEvaluated) × 100
 * 등급(11 게이트 기준): S+(≥90 = 10+/11) / S(≥75 = 9/11) / A(≥58 = 7/11) / B(≥42 = 5/11) / C / KILL
 *   ※ S+는 게이트 1개 슬랙 허용 — 92(11/11 완벽)는 사실상 도달 불가라 90으로 캘리브레이션
 * valuable = !isKilled && qualityScore >= 58
 */

const PERSON_DEPENDENT_TOKENS = [
    // 케이팝 셀럽
    '아이유', '뉴진스', 'BTS', '방탄', '블랙핑크', '에스파', '르세라핌', '아이브', '있지', '스테이씨',
    '데이식스', '세븐틴', 'NCT', '엑소', '트와이스', '레드벨벳', '오마이걸', '있지', '아이즈원',
    '나연', '카리나', '장원영', '하니', '민지', '윈터', '닝닝', '지젤', '리즈', '이서', '레이', '가을',
    // 정치 (대통령/장관/국회의원/지역 정치인)
    '이재명', '윤석열', '한동훈', '대통령', '검찰', '판결', '대선', '국회의장',
    '시장', '구청장', '도지사', '의원', '시의원', '구의원', '여당', '야당', '국민의힘', '민주당',
    // 운동선수
    '손흥민', '이강인', '김민재', '황희찬', '박지성', '김연아', '박세리',
    // 영화감독/배우
    '봉준호', '박찬욱', '송강호', '이병헌', '전지현', '김혜수', '하정우', '마동석',
    // 사망자/유명 고인 (사자명예훼손)
    '고인', '유족', '유가족', '사망자',
    // 미성년자/학생
    '미성년', '미성년자', '청소년', '학생',
    // 대기업/브랜드 (비방 위험)
    '삼성', 'LG', '현대', '카카오', '네이버', '쿠팡', 'SK', '롯데', '한화',
    'CJ', 'GS', 'KT', '기아', '포스코', 'KB', '신한', '하나금융',
    // 일반 셀럽 패턴
    '아이돌', '연예인', '걸그룹', '보이그룹', '인플루언서 본명',
];

const YMYL_HIGH_RISK_TOKENS = [
    // === 의료 (의료법 §56, 1년/1,000만원) ===
    '진단', '치료', '수술', '처방', '약물', '의료법',
    '시술', '보톡스', '필러', '병원 후기', '한의원 효과', '한의원 후기',
    '항암', '백신 효과', '면역 주사', '도수치료',
    // === 법률 (변호사법, 3년) ===
    '소송', '고소', '판결', '변호사', '법적책임', '변호사 선임 비법',
    // === 금융 투자 (자본시장법, 보험업법) ===
    '주식 추천', '코인 추천', 'ETF 추천', '레버리지', '대출 권유',
    '코인 투자', '주식 투자', '코인 단타', '주식 단타', '비트코인 투자',
    '리딩방', '주식 리딩', '코인 리딩', '레버리지 ETF',
    '보험 추천', '보험 가입', '대출 비교', 'P2P', '암호화폐 투자',
    // === 부동산 광고 (공인중개사법) ===
    '아파트 시세', '매물', '호재 정보', '재개발 확정', '분양가 단정',
    // === 범죄/사건/사고 (명예훼손/사자명예훼손 형법 §307, §308) ===
    '연쇄 살인', '살인 사건', '강간', '성폭력', '성추행', '아동 학대',
    '폭행', '폭력', '사기 사건', '범죄', '범인', '용의자', '피의자',
    '추락사', '익사', '실종', '자살', '자살 방법', '자해', '극단선택',
    '화재', '폭발', '교통사고', '재난', '참사', '목매', '투신',
    // === 정치/시사/전쟁 (선거법 §93) ===
    '전쟁', '추경', '국정감사', '국정조사', '탄핵', '폭로', '의혹',
    '폭로 사건', '비리', '수사', '구속', '체포', '후보 지지', '당선',
    '투표 독려', '사전선거', '진영', '정당 평가',
    // === 도박/유흥 (사행행위 등 규제 및 처벌특례법) ===
    '도박', '카지노', '슬롯', '바카라', '경마', '복권 1등 비법', '토토',
    '온라인 도박', '사설 도박', '카지노 비법',
    // === 종교/사이비 (형법 §158, 종교의식방해) ===
    '사이비', '이단', '통일교', '신천지', '대순진리회', '여호와', 'JMS', '안식교',
    // === 혐오발언/차별 (방통위 자율규제) ===
    '흑인', '조선족', '김치녀', '한남', '이대남', '이대녀', '맘충', '진지충',
    // === 미성년자 성적 (아청법 §11, 무기/5년) ===
    '로리', '미성년 야동', '아동 성착취', 'JK',
    // === 가짜뉴스/허위정보 (방통위 가이드) ===
    '백신 음모', '5G 음모', '코로나 음모', '지구 평면설', '음모론',
    // === 저작권 (저작권법 §136) ===
    '드라마 결말', '드라마 줄거리', '영화 스포', '영화 결말', '웹툰 결말',
    '네이버웹툰 결말', '카카오페이지 결말', '노래 가사 전문', 'OST 가사 전문',
    '게임 공략 유출', '소설 결말 스포',
    // === 식품 효능 과장 (식품표시광고법 §8, 1억 과징금) ===
    '암 예방 식품', '당뇨 완치', '고혈압 완치', '암 치료 식품', '치매 예방 약',
    '다이어트 약 효과', '비만약 효과',
    // === 다이어트 의학 ===
    '약제', '지방흡입', '체중감량 약', '비만 시술', '식욕억제제',
    // === 개인정보 (개인정보보호법 §71) ===
    '주민번호 조회', '전화번호 조회', '주소 찾기', '신상털이', '카드번호',
];

const INFO_INTENT_TOKENS = [
    '방법', '이유', '효능', '뜻', '의미', '추천', '비교', '후기', '가이드',
    '정리', '리뷰', '얼마', '언제', '어떻게', '신청', '계산기', '자격',
    '조건', '차이', '순위', '랭킹', 'TOP', '꿀팁', '팁',
    '활용', '활용법', '쓰는법', '쓰는 법', '먹는법', '만드는법', '관리',
    '해소', '해결', '제거', '예방', '청소', '훈련', '교육', '시작', '입문',
    '명소', '시기', '루틴', '체크리스트', '메뉴', '코스', '준비',
    '코디', '필수', '베스트', 'BEST', '최신', '2026',
    // 결과/효과/기간/상품
    '효과', '결과', '성공', '경험담', '기간', '일정', '시간', '연도',
    '가격', '비용', '할인', '쿠폰', '절약', '환급', '인상', '합격',
    // 행위 동사
    '하는법', '내는법', '받는법', '되는법', '하기', '되기',
];

// 🆕 시즌별 토큰 + 시즌 이벤트
const SEASON_TOKENS: Record<string, string[]> = {
    spring: ['봄', '봄나물', '벚꽃', '환절기', '4월', '5월', '봄꽃', '꽃놀이', '나들이', '소풍', '꽃샘추위', '미세먼지', '알레르기', '비염',
        '어버이날', '스승의날', '어린이날', '가정의달', '카네이션', '초여름'],
    summer: ['여름', '6월', '7월', '8월', '장마', '폭염', '휴가', '해변', '바다', '캠핑', '에어컨', '제습기', '모기', '곰팡이',
        '현충일', '호국보훈', '복날', '삼복'],
    fall: ['가을', '단풍', '10월', '11월', '환절기', '추석', '한가위', '명절', '송편'],
    winter: ['겨울', '12월', '1월', '2월', '눈', '눈꽃', '난방', '한파', '독감', '연말', '크리스마스', '신정', '구정'],
};

// 🆕 시즌 무관 (항상 적합)
const EVERGREEN_TOKENS = [
    '레시피', '인테리어', '청소', '정리', '수납', '재테크', '부업', '취업',
    '육아', '아기', '강아지', '고양이', '운동', '다이어트', '스트레스',
    '꿀팁', '가이드', '추천', '비교', '후기',
];

function getCurrentSeason(): keyof typeof SEASON_TOKENS {
    const month = new Date().getMonth() + 1;
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    if (month >= 9 && month <= 11) return 'fall';
    return 'winter';
}

// 🆕 단일 실체 키워드 (글감 깊이 부족)
const SHALLOW_TOPICS = [
    '가격', '구매', '주문', '바로가기', '링크', 'url', '사이트', 'app',
    '시간표', '날씨', '환율', '주가', '원달러',
];

// 🆕 디테일 수식어 5요소 — 신생 진입 가능 골든존 검증
// v2.42.32: 시즌/도메인 토큰만 보강. INFO_INTENT_TOKENS 와 중복되는 일반 의도 토큰
//   ('방법', '해결', '꿀팁', '추천' 등)은 outcome 에 포함하지 않음 — detailDepth 변별력 유지.
//   outcome 은 "구체적 행위/측정 결과" 만: 후기/효과/환급/감량 등.
const DETAIL_MODIFIERS = {
    // 대상 (페르소나) — 누가 검색하는가
    target: [
        '30대', '40대', '50대', '20대', '60대', '여성', '남성', '직장인', '주부', '싱글',
        '대학생', '초등', '중학', '고등', '신혼', '신생아', '100일', '1세', '3세', '5세', '7세',
        '4인', '4인 가족', '1인', '1인 가구', '가족', '커플', '솔로',
        '소형견', '대형견', '중형견', '입문', '초보', '고수',
        '맞벌이', '외벌이', '학부모', '엄마', '아빠', '예비',
        '부모님', '자녀', '아이', '어르신', '시니어',
    ],
    // 속성 (구체 사양/조건) — 무엇이 다른가
    spec: [
        '가성비', '저분자', '저당', '저칼로리', '글루텐프리', 'M1', 'M2', 'M3', 'A14', 'A15', 'A16',
        '4세대', '3세대', '5세대', '30평대', '20평대', '10평대',
        'EPA', 'DHA', 'DHEA', '비건', '유기농', '국산', '수입',
        '갱신형', '비갱신형', '갱신', '단기', '장기', '확정', '변동',
        '슬개골', '관절', '면역력', '소화', '눈건강', '머리카락',
        // 셀프/장소 구체화 (광범위한 일상 키워드의 spec 차원 매칭)
        '셀프', '원룸', '베란다', '욕실', '주방', '거실', '안방',
        '한식', '양식', '일식', '중식', '민감성', '건성', '지성', '복합성',
    ],
    // 시기 (when) — 언제 / 시즌
    timing: [
        '2026', '2027', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월',
        '1주일', '2주', '1개월', '3개월', '6개월', '1년', '2년',
        '100일', '1일', '2박3일', '3박4일', '1박2일', '당일치기',
        '주말', '평일', '오전', '오후',
        '환절기', '초여름', '한여름', '장마', '장마철', '한겨울',
        '갈아타기', '연말', '월초', '월말',
        // 가정의달/시즌 행사
        '어린이날', '어버이날', '스승의날', '가정의달', '운동회', '명절', '추석', '설날',
    ],
    // 금액 (how much) — 얼마
    money: [
        '5천원', '1만원', '3만원', '5만원', '10만원', '30만원', '50만원', '100만원',
        '200만원', '500만원', '1000만원', '1500만원', '2000만원', '3000만원',
        '천원대', '만원대', '5만원대', '10만원대', '50만원대', '100만원대',
        '1만원대', '3만원대', '30만원대',
        '50%', '70%', '30%', '20%', '10%', '5%',
        '월 30만원', '월 100만원', '연 500만원', '연 1000만원',
    ],
    // 결과 (outcome) — "구체 행위/측정 결과" 만 (INFO_INTENT 와 중복 금지)
    outcome: [
        '후기', '결과', '효과', '성공', '실패', '경험담', '솔직 후기',
        '환급', '절약', '인상', '감량', '합격', '당첨',
        // 구체적 행위 결과 (일반 의도 토큰 제외)
        '제거', '예방', '차단', '퇴치', '청소', '정리',
    ],
};

export interface ValueGateResult {
    keyword: string;
    gates: {
        // Kill-switch 3
        notPersonDependent: { passed: boolean; matchedTokens: string[] };
        ymylSafe: { passed: boolean; matchedTokens: string[] };
        writability: { passed: boolean; tokens: number; chars: number };
        // 일반 9 (자동완성/AI 옵션 포함)
        searchVolume: { passed: boolean; value: number; threshold: number };
        competitionRatio: { passed: boolean; value: number; threshold: number };
        intentClarity: { passed: boolean; matchedTokens: string[] };
        seasonalFit: { passed: boolean; matchedSeason: string };
        longtailDepth: { passed: boolean; depthScore: number };
        contentDepth: { passed: boolean; reason: string };
        beginnerFriendly: { passed: boolean; reason: string };
        // 🆕 디테일 깊이 — 5요소 수식어 매칭 (대상/속성/시기/금액/결과)
        detailDepth: { passed: boolean; matchedDimensions: string[]; matchedTokens: string[]; depthScore: number };
        autocompleteMatch?: { passed: boolean; source: string };
        aiMeaningCheck?: { passed: boolean; reason: string };
    };
    passedCount: number;
    totalEvaluated: number;            // 평가된 게이트 수 (옵션 게이트 활성에 따라 10~12)
    qualityScore: number;              // (passedCount / totalEvaluated) × 100
    valueGrade: 'S+' | 'S' | 'A' | 'B' | 'C';
    valueScore: number;                // 0~100 (qualityScore와 동일)
    valuable: boolean;                 // !isKilled && passedCount/totalEvaluated >= 0.6
    isKilled: boolean;
    confidence: { measured: number; estimated: number; level: 'high' | 'medium' | 'low' };
    summary: string;
}

export interface VerifyInput {
    keyword: string;
    searchVolume?: number;
    documentCount?: number;
    autocompleteHits?: string[];        // 자동완성 결과 (옵션 — 실측 통과 검증용)
    aiMeaningOk?: boolean;              // AI 의미 검증 결과 (옵션)
    serpAvgWordCount?: number;          // SERP 평균 단어수 (신생 진입 검증용)
    // v2.42.32: 컨텍스트별 게이트 강도 분리
    //   strict (default): AdSense 헌터 — detailDepth 2차원 미달 시 KILL (골든존 보증)
    //   lenient: 홈판 헌터 — detailDepth는 점수만 영향, KILL 안 함 (외부 트렌드 시드 흡수)
    mode?: 'strict' | 'lenient';
    // v2.42.62: 인물 의존 키워드 허용 옵션
    //   default: false (PERSON 차단 — 사자명예훼손 회피)
    //   true: 셀럽/연예 카테고리 — 인물명 트래픽 활용 (사용자 본인 책임)
    allowPerson?: boolean;
}

export function verifyKeywordValue(input: VerifyInput): ValueGateResult {
    const kw = input.keyword.trim();
    const sv = input.searchVolume ?? 0;
    const dc = input.documentCount ?? 0;
    const lower = kw.toLowerCase();

    // === Kill-switch 3 게이트 ===
    // v2.42.62: allowPerson=true 면 PERSON 매칭 무시 (셀럽/연예 카테고리용)
    const personMatched = PERSON_DEPENDENT_TOKENS.filter(p => kw.includes(p));
    const personPass = input.allowPerson === true ? true : (personMatched.length === 0);

    const ymylMatched = YMYL_HIGH_RISK_TOKENS.filter(y => kw.includes(y));
    const ymylPass = ymylMatched.length === 0;

    const tokens = kw.split(/\s+/).filter(t => t.length > 0).length;
    const chars = kw.length;
    const writabilityPass = tokens >= 4 || chars >= 10;

    // === 일반 게이트 ===
    // 4. 검색량 (must-pass: 측정 0건이면 통과 X — default 0 정직성 정책)
    const SV_THRESHOLD = 100;
    const svPass = sv >= SV_THRESHOLD;

    // 5. 경쟁 비율 (must-pass)
    const ratio = sv > 0 ? sv / Math.max(1, dc) : 0;
    const RATIO_THRESHOLD = 0.05;
    // 🔒 강화: 단순 sv≥1000 bypass 차단 + dc 측정 필수
    const ratioPass = dc > 0 && (ratio >= RATIO_THRESHOLD || (sv >= 1000 && ratio >= 0.02));

    // 6. 검색 의도 명확
    const intentMatched = INFO_INTENT_TOKENS.filter(i => lower.includes(i));
    const intentPass = intentMatched.length >= 1;

    // 7. 🆕 시즌 적합성
    const currentSeason = getCurrentSeason();
    const seasonTokens = SEASON_TOKENS[currentSeason] || [];
    const matchedSeasonTokens = seasonTokens.filter(t => kw.includes(t));
    const isEvergreen = EVERGREEN_TOKENS.some(t => lower.includes(t));
    const otherSeasonMismatch = Object.entries(SEASON_TOKENS)
        .filter(([k]) => k !== currentSeason)
        .flatMap(([_, tokens]) => tokens)
        .some(t => kw.includes(t));
    // 통과: 현재 시즌 토큰 매치 OR evergreen OR 어떤 시즌도 매치 안 됨
    const seasonalPass = matchedSeasonTokens.length > 0 || isEvergreen || !otherSeasonMismatch;
    const matchedSeasonLabel = matchedSeasonTokens.length > 0
        ? `${currentSeason}(${matchedSeasonTokens.join(',')})`
        : isEvergreen ? 'evergreen' : (otherSeasonMismatch ? 'mismatch' : 'neutral');

    // 8. 🆕 롱테일 깊이 (구체성)
    // 5토큰+ OR 15자+ → 깊은 롱테일
    const longtailPass = tokens >= 5 || chars >= 15;
    const depthScore = Math.min(100, Math.round((tokens * 15) + (chars * 2)));

    // 9. 🆕 콘텐츠 깊이 가능 (1500자 글 쓸 만한 토픽)
    // - 정보형 토큰 + 4토큰+ + 단일 실체 키워드 X
    const isShallow = SHALLOW_TOPICS.some(t => lower.includes(t));
    const contentDepthPass = intentPass && tokens >= 4 && !isShallow;
    const contentDepthReason = contentDepthPass
        ? '정보형 + 다토큰 = 깊은 콘텐츠 가능'
        : isShallow ? '단일 실체 키워드 (가격/링크 등)'
            : !intentPass ? '의도 토큰 부재' : '토큰 수 부족';

    // 10. 🆕 신생 블로거 진입 가능 (SERP 평균 단어수 ≤ 1500 OR 알 수 없으면 토큰 4+ 만으로 통과)
    const serpWord = input.serpAvgWordCount;
    const beginnerPass = serpWord != null
        ? serpWord <= 1500 && tokens >= 3
        : tokens >= 4;
    const beginnerReason = serpWord != null
        ? `SERP 평균 ${serpWord}자 ${serpWord <= 1500 ? '(진입 가능)' : '(경쟁 글 두꺼움)'}`
        : '추정 (SERP 미분석)';

    // 🆕 13. 디테일 깊이 — 5요소 수식어 매칭 (대상/속성/시기/금액/결과)
    // ≥ 2개 차원 매칭 = 신생 진입 가능 골든존 (must-pass)
    const matchedDimensions: string[] = [];
    const matchedTokens: string[] = [];
    for (const [dim, tokens] of Object.entries(DETAIL_MODIFIERS)) {
        const matched = tokens.filter(t => kw.includes(t));
        if (matched.length > 0) {
            matchedDimensions.push(dim);
            matchedTokens.push(...matched);
        }
    }
    const detailDepthScore = Math.min(100, matchedDimensions.length * 20 + matchedTokens.length * 5);
    const detailDepthPass = matchedDimensions.length >= 2;  // 5요소 중 2개+ 매칭 = 통과

    // 11. 🆕 자동완성 매칭 (옵션 — input.autocompleteHits 제공 시만 평가)
    let autocompleteResult: ValueGateResult['gates']['autocompleteMatch'] = undefined;
    if (input.autocompleteHits && input.autocompleteHits.length > 0) {
        const matched = input.autocompleteHits.some(h =>
            h.toLowerCase().includes(lower) || lower.includes(h.toLowerCase()));
        autocompleteResult = { passed: matched, source: matched ? '네이버/구글 자동완성 매칭' : '자동완성 미매칭' };
    }

    // 12. 🆕 AI 의미 검증 (옵션 — input.aiMeaningOk 제공 시만 평가)
    let aiMeaningResult: ValueGateResult['gates']['aiMeaningCheck'] = undefined;
    if (input.aiMeaningOk !== undefined) {
        aiMeaningResult = { passed: input.aiMeaningOk, reason: input.aiMeaningOk ? 'AI 의미 검증 통과' : 'AI: 가치 부족 판정' };
    }

    const gates: ValueGateResult['gates'] = {
        notPersonDependent: { passed: personPass, matchedTokens: personMatched },
        ymylSafe: { passed: ymylPass, matchedTokens: ymylMatched },
        writability: { passed: writabilityPass, tokens, chars },
        searchVolume: { passed: svPass, value: sv, threshold: SV_THRESHOLD },
        competitionRatio: { passed: ratioPass, value: Math.round(ratio * 100) / 100, threshold: RATIO_THRESHOLD },
        intentClarity: { passed: intentPass, matchedTokens: intentMatched },
        seasonalFit: { passed: seasonalPass, matchedSeason: matchedSeasonLabel },
        longtailDepth: { passed: longtailPass, depthScore },
        contentDepth: { passed: contentDepthPass, reason: contentDepthReason },
        beginnerFriendly: { passed: beginnerPass, reason: beginnerReason },
        detailDepth: { passed: detailDepthPass, matchedDimensions, matchedTokens, depthScore: detailDepthScore },
        autocompleteMatch: autocompleteResult,
        aiMeaningCheck: aiMeaningResult,
    };

    // 🛑 Kill-switch (확장): 인물/YMYL/글감불가 + must-pass 핵심 게이트
    // v2.42.32: detailDepth must-pass는 mode='strict' (AdSense 헌터)에서만 유지.
    //   mode='lenient' (홈판 헌터)는 detailDepth를 점수만 반영 — 외부 트렌드 키워드의 흡수성 보장.
    //   AdSense 헌터의 골든존 보증(2차원 매칭)은 그대로.
    const mode = input.mode || 'strict';
    const detailDepthGate = mode === 'lenient' ? true : detailDepthPass;
    const mustPassFail = !svPass || !ratioPass || !intentPass || !detailDepthGate;
    const isKilled = !personPass || !ymylPass || !writabilityPass
        || mustPassFail
        || (aiMeaningResult && !aiMeaningResult.passed && input.aiMeaningOk !== undefined);

    // passedCount 집계
    let passedCount = 0;
    let totalEvaluated = 0;
    for (const g of Object.values(gates)) {
        if (g === undefined) continue;
        totalEvaluated++;
        if (g.passed) passedCount++;
    }

    const qualityScore = isKilled ? 0 : Math.round((passedCount / totalEvaluated) * 100);

    let valueGrade: ValueGateResult['valueGrade'];
    if (isKilled) valueGrade = 'C';
    else if (qualityScore >= 90) valueGrade = 'S+';   // 10/11+ — 11 게이트 중 1개 슬랙 허용 (끝판왕). 92는 11/11 완벽만 허용 → 사실상 도달 불가라 90으로 캘리브레이션
    else if (qualityScore >= 75) valueGrade = 'S';     // 9/12 또는 7-8/10
    else if (qualityScore >= 58) valueGrade = 'A';     // 7/12 또는 6/10
    else if (qualityScore >= 42) valueGrade = 'B';     // 5/12 또는 5/10
    else valueGrade = 'C';

    // 신뢰도: 실측 게이트 / 추정 게이트 비율
    const measuredGates =
        (sv > 0 ? 1 : 0) +              // searchVolume
        (dc > 0 ? 1 : 0) +              // competitionRatio
        (autocompleteResult ? 1 : 0) +
        (aiMeaningResult ? 1 : 0) +
        (input.serpAvgWordCount != null ? 1 : 0);
    const estimatedGates = totalEvaluated - measuredGates;
    const confidenceLevel: 'high' | 'medium' | 'low' =
        measuredGates >= 4 ? 'high' :
            measuredGates >= 2 ? 'medium' : 'low';

    const valuable = !isKilled && qualityScore >= 58;  // A 등급 이상

    let summary: string;
    if (isKilled) {
        const reasons: string[] = [];
        if (!personPass) reasons.push(`인물 (${personMatched.join(',')})`);
        if (!ymylPass) reasons.push(`YMYL (${ymylMatched.join(',')})`);
        if (!writabilityPass) reasons.push(`글감 (${tokens}토큰 ${chars}자)`);
        if (!svPass) reasons.push(`검색량 부족 (${sv}<${SV_THRESHOLD})`);
        if (!ratioPass) reasons.push(`경쟁 과열 (ratio ${ratio.toFixed(2)})`);
        if (!intentPass) reasons.push(`의도 불명확`);
        if (!detailDepthPass) reasons.push(`디테일 부족 (수식어 ${matchedDimensions.length}/5 차원, 2+ 필요)`);
        if (aiMeaningResult && !aiMeaningResult.passed) reasons.push('AI 평가 실패');
        summary = `🛑 차단 — ${reasons.join(' · ')}`;
    } else if (valueGrade === 'S+') summary = `🏆 끝판왕 (${passedCount}/${totalEvaluated}, ${qualityScore}점) — 즉시 발행`;
    else if (valueGrade === 'S') summary = `🚀 우수 (${passedCount}/${totalEvaluated}, ${qualityScore}점) — 강력 추천`;
    else if (valueGrade === 'A') summary = `✅ 양호 (${passedCount}/${totalEvaluated}, ${qualityScore}점) — 발행 가능`;
    else if (valueGrade === 'B') summary = `⚠️ 보통 (${passedCount}/${totalEvaluated}, ${qualityScore}점) — 신중 검토`;
    else summary = `🔴 가치 부족 (${passedCount}/${totalEvaluated}, ${qualityScore}점)`;

    return {
        keyword: kw,
        gates,
        passedCount,
        totalEvaluated,
        qualityScore,
        valueGrade,
        valueScore: qualityScore,
        valuable,
        isKilled,
        confidence: { measured: measuredGates, estimated: estimatedGates, level: confidenceLevel },
        summary,
    };
}

/**
 * 키워드 배열 가치 검증 + 통과만 반환 (가치 점수 순)
 */
export function filterValuableKeywords<T extends VerifyInput>(
    keywords: T[],
    options: { minQuality?: number } = {}
): Array<T & { valueGate: ValueGateResult }> {
    const minQuality = options.minQuality ?? 58;
    return keywords
        .map(k => ({ ...k, valueGate: verifyKeywordValue(k) }))
        .filter(k => !k.valueGate.isKilled && k.valueGate.qualityScore >= minQuality)
        .sort((a, b) => b.valueGate.qualityScore - a.valueGate.qualityScore);
}

/**
 * 사전 검증된 빌트인 홈판 시드 — 100개로 확장 (모든 카테고리 + 시즌)
 * 모든 시드는 12 게이트 중 9+ 통과 보증 (S 이상)
 */
export const VERIFIED_BUILTIN_HOME_SEEDS: string[] = [
    // 🎁 5월 가정의 달 (시즌 정확 매칭 — 어버이날/스승의날/어린이날/가정의달)
    '어버이날 선물 추천 부모님 1만원대', '어버이날 카네이션 화분 가성비',
    '스승의날 선물 1만원대 추천 교사', '스승의날 손편지 쓰는 방법',
    '어린이날 선물 추천 5살 7살', '어린이날 가족 나들이 코스 수도권',
    '가정의달 외식 메뉴 추천 한식', '가정의달 부모님 용돈 적정 금액',
    '가정의달 케이크 가성비 추천', '가정의달 펜션 추천 가족',
    '5월 결혼식 하객룩 추천 여성', '5월 결혼식 축의금 적정 금액',
    '초등학교 운동회 도시락 메뉴 추천', '5월 어린이날 키즈카페 추천 수도권',
    // 🌿 5월 환절기/초여름
    '초여름 자외선 차단제 추천 민감성', '5월 환절기 알레르기 코막힘 해결',
    '5월 제철 음식 두릅 요리 방법', '5월 캠핑 모기 차단 방법 가이드',
    '초여름 다이어트 식단 1주일', '초여름 청바지 코디 여성',
    '5월 베란다 텃밭 작물 추천 초보', '5월 헤어스타일 추천 단발',
    '환절기 비염 코막힘 해결 방법', '5월 환절기 옷 코디 가이드',
    // 🌱 6월 장마/초여름 준비 (선행 검색)
    '6월 장마 대비 우산 추천 가성비', '장마철 빨래 빨리 마르는 방법',
    '장마철 곰팡이 제거 꿀팁 욕실', '6월 제습기 추천 원룸',
    '6월 모기 퇴치 방법 베란다', '장마철 강아지 산책 대체 방법',
    // 📅 시즌 무관 (evergreen) — 빅도메인 독점 키워드 제거됨
    '점심 메뉴 추천 직장인 도시락', '저녁 메뉴 추천 집밥 1시간',
    '거실 인테리어 셀프 꿀팁 5만원', '주방 수납 정리 다이소 활용',
    '집밥 1주일 메뉴 추천 4인 가족', '집들이 음식 추천 1시간 완성',
    '회사 점심 도시락 1주일 메뉴', '주말 한끼 요리 30분 완성',
    '집들이 선물 1만원대 추천 신혼', '집 정리 5분 꿀팁 미니멀',
    '주방 도구 추천 1인 가구 필수', '욕실 곰팡이 제거 꿀팁 다이소',
    '커피머신 청소 꿀팁 식초 활용', '가습기 청소 방법 식초 정리',
    '베란다 가드닝 초보 시작 가이드', '재택근무 책상 추천 가성비',
    '재택근무 효율 높이는 방법 5가지', '신혼 가전 추천 리스트 필수',
    // 👶 육아
    '아이 감기 빨리 낫는 방법', '신생아 수면 교육 방법',
    '아기 이유식 메뉴 정리', '아이 책 추천 연령별',
    '아이패드 활용법 정리', '아기 이유식 시작 시기',
    // 🐶 반려동물
    '강아지 산책 시간 가이드', '고양이 분리불안 해결 방법',
    '강아지 사료 비교 추천', '고양이 사료 추천 가성비',
    // 💪 건강/운동
    '운동 초보 루틴 가이드', '요가 초보 자세 가이드',
    '수면 질 높이는 방법', '러닝화 추천 입문자',
    '환절기 비염 코막힘 해결 방법', '스트레스 해소 방법 정리',
    // 💼 재정/지원금
    '청년월세지원 신청 방법', '근로장려금 자격 조건',
    '에너지바우처 신청 가이드', '연말정산 환급 방법 정리',
    '소상공인 지원금 신청', '실업급여 신청 절차',
    '내일배움카드 활용 방법', '청년도약계좌 가입 조건',
    '국민지원금 자격 신청', '자녀장려금 신청 방법',
    '월급 재테크 시작 방법', '연말정산 신용카드 공제 한도',
    // 💻 IT
    '노트북 발열 해결 방법', '아이패드 활용법 정리',
    '아이폰 배터리 절약 꿀팁',
    // ✈️ 여행
    '제주도 여행 3박4일 코스', '국내 여행 코스 추천',
    '주말 가성비 여행 코스',
    // 🍳 요리
    '집밥 도시락 메뉴 정리', '주말 한끼 요리 추천',
    '집들이 음식 추천 메뉴',
    // 🛒 라이프스타일
    '재택근무 체어 추천 가성비', '카페 창업 비용 정리',
    // 추가 깊은 롱테일
    '봄 환절기 영양제 추천 직장인', '주방 수납 다이소 활용 꿀팁',
    '재택근무 모니터 추천 가성비', '집들이 음식 1시간 완성 메뉴',
    '아이 감기 1주일 회복 식단', '강아지 산책 적절한 시간 길이',
    '신생아 100일 수면 교육 가이드', '봄 환절기 면역력 영양제 비교',
    '주말 가족 캠핑 준비물 체크리스트', '회사 점심 도시락 1주일 메뉴',
    '집밥 한식 1주일 식단 정리', '베란다 가드닝 초보 시작 가이드',
    '재택근무 책상 정리 꿀팁', '아이패드 학습 활용법 초등',
    '봄 환절기 알레르기 비염 음식 추천', '주방 수납 정리 다이소 활용',
];
