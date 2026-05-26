/**
 * Rich Feed Builder — LEWORD 핵심 가치 엔진
 *
 * 흐름:
 *   1. 17개 소스에서 시드 키워드 풀링 (registry.callAllSources)
 *   2. 위생 필터링 + 중복 제거
 *   3. 네이버 검색광고 API 일괄 호출 → 검색량 + 문서수 + 경쟁도
 *   4. 카테고리 자동 감지 (categories.classifyKeyword 사용)
 *   5. CPC 추정 (profit-engine 재사용)
 *   6. goldenRatio + 등급 (다중 게이트)
 *   7. 신선도 판정 (시계열 + 신규 등장 + 소스 다양성)
 *   8. 발견 소스 추적
 *   9. goldenRatio 내림차순 정렬
 *
 * 차별화: "경쟁자가 못 찾는 소스에서 시드 발굴 + 검색량 실측 + 한눈에 표"
 */

import { callAllSources, SourceTier } from './source-registry';
import { getNaverAutocompleteKeywords } from '../naver-autocomplete';
import { getKeywordTrend } from './source-storage';
import { getNaverKeywordSearchVolumeSeparate } from '../naver-datalab-api';
import { estimateCPC, calculatePurchaseIntent, calculateCompetitionLevel } from '../profit-golden-keyword-engine';
import { EnvironmentManager } from '../environment-manager';
import { classifyKeyword, getCategoryById } from '../categories';
import { getEvergreenSafetyNetSeeds, getAllRevenueSeeds } from './evergreen-safety-net';
import { buildIDFStats, scoreSeedKeyword, isQualitySeed } from './quality-extractor';
import { loadBloggerProfile, calculateProfileAffinity, experienceAdjustment, BloggerProfile } from '../blogger-profile';

export type Freshness = 'BURNING' | 'RISING' | 'STABLE' | 'EVERGREEN';
// 🔥 v2.31.0: SSR 등급 신설 — "수익 황금" (SSS + 고CPC + 상업의도 + 수익 카테고리)
export type GoldenGrade = 'SSR' | 'SSS' | 'SS' | 'S' | 'A' | 'B';

// 🔥 v2.31.0: 수익 카테고리 — 광고주 CPC 높고 구매 전환 강한 카테고리
const REVENUE_CATEGORIES = new Set([
    'health', 'finance', 'realestate', 'beauty', 'business',
    'self_development', 'policy', 'insurance', 'legal', 'medical',
    'parenting', 'wedding',
]);

function isRevenueCategory(categoryId: string): boolean {
    return REVENUE_CATEGORIES.has((categoryId || '').toLowerCase());
}

export interface RichKeywordRow {
    rank: number;
    keyword: string;
    category: string;
    categoryId?: string;          // v2.43.15: 다양성 가산/필터링용
    categoryIcon: string;
    grade: GoldenGrade | '';
    searchVolume: number;
    documentCount: number;
    goldenRatio: number;
    cpc: number | null;           // 네이버 검색광고 API 실측 평균 입찰가 (null = 미확인)
    freshness: Freshness;
    sources: string[];
    sourceCount: number;
    purchaseIntent: number;
    isBlueOcean: boolean;
    // 🔥 v2.41.0: dc 추정값 여부 — 분포 기반 동적 SSS 승격 풀에서 제외용 (신뢰도 가드)
    dcEstimated?: boolean;
    // v2.49.5+: AI 브리핑 실측 결과 — true: 박스 떴음 (skip 권장), false: 안 떴음 (블로그 클릭 기회)
    aiBriefingDetected?: boolean;
    // 🔥 v2.43.14: 블로거 친화도 점수 (0~100) — 일반 블로거가 글쓰기 좋은 정도
    bloggerWritability?: number;
    // v2.43.26 (사이클#3 5팀): 친화도 사유 분해 (UI에 인라인 칩으로 가시화)
    writabilityFactors?: Array<{ delta: number; label: string }>;
    // v2.43.28: 최근 추세 (네이버 데이터랩 30일 실측, dead/declining/stable/rising)
    recencyStatus?: 'rising' | 'stable' | 'declining' | 'dead' | 'unknown';
    // 🔥 v2.19.0 Phase L-2: 30일 트렌드 타입 (상위 30개만 분류됨)
    trendType?: 'evergreen' | 'skyrocket' | 'flash' | 'seasonal' | 'unknown';
    trendLabel?: string;
    trendRecommendation?: string;
    // 🔥 v2.42.14: Claude AI 추천 + 관대 게이트 통과 마커
    claudeDiscovered?: boolean;
    claudeReason?: string;
}

export interface RichFeedDiagnostic {
    seeds: {
        sourcesSuccess: number;
        sourcesTotal: number;
        seedMapSize: number;        // seedMap.size — unique 시드 수
        afterQualityFilter: number;  // isQualitySeed + !isTooGeneric2Token 통과
    };
    longtail: {
        expandedAdded: number;       // longtail 확장으로 추가된 키워드 수
    };
    candidates: {
        targetSize: number;          // stratified sampling 목표
        actualSampled: number;       // 실제 샘플링된 후보
        sentToNaver: number;         // Naver API 호출 대상
    };
    naver: {
        withValidSv: number;         // sv > 0
        withValidDc: number;         // dc > 0
        dcEstimated: number;         // dc 추정값
    };
    grading: {
        SSS: number;
        SSR: number;
        SS: number;
        S: number;
        A: number;
        B: number;
        filtered: number;            // grade '' (가장 큰 컷)
    };
    writableAnalysis: {
        singleTokenBroad: number;    // 단일 토큰 GENERIC_BROAD (writable=false)
        singleTokenAction: number;   // 단일 토큰 GENERIC_ACTION (writable=false)
        twoTokenGeneric: number;     // 2-token BROAD+ACTION (writable=false)
        singleTokenHighDc: number;   // 단일 토큰 dc>500 (writable=false)
        passedWritable: number;      // 통과
    };
    redOcean: {
        ratioBelow1: number;         // ratio<1 차단됨
    };
    promotion: {
        targetSSS: number;
        naturalSSS: number;
        poolSize: number;
        promoted: number;
    };
    final: {
        afterSSROnlyFilter: number;
        topNReturned: number;
    };
}

export interface RichFeedResult {
    timestamp: number;
    total: number;
    tier: 'lite' | 'pro';
    rows: RichKeywordRow[];
    byCategory: Record<string, number>;
    bySource: Record<string, number>;
    diagnostic?: RichFeedDiagnostic;  // v2.42.13: 0건 발생 시 진단용
}

const STOP = new Set([
    '오늘', '지금', '진짜', '완전', '정말', '바로', '그냥', '이거', '저거', '있다', '없다',
    '대문', '한국', '대한민국', '서울', '관련', '특집', '뉴스', '소개', '공개', '발표',
    '시작', '종료', '오늘의', '이번', '지난', '최근', '계속', '다음', '먼저', '나중',
]);

/**
 * 블로그 발행 부적합 키워드 블랙리스트
 * - 광고주 기피 카테고리 (애드센스·네이버 애드포스트 노출 제한)
 * - 정치 혐오·극단 커뮤니티명 (블로거가 다룰 가치 없음)
 * - 성인·도박·마약 등 규제 업종
 * - 이런 키워드가 SSS 등급에 뜨면 "끝판왕" 신뢰도가 무너짐
 */
const BLACKLIST_EXACT = new Set([
    // 극단 커뮤니티 사이트명 (일베·메갈·워마드 등)
    '일베', '일베저장소', '일간베스트', '일간베스트저장소',
    '메갈리아', '메갈', '워마드', '일부메갈', '남초', '여초',
    // 일반 커뮤니티 사이트명 (정보성 가치 낮음)
    '디시인사이드', '더쿠', '펨코', '에펨코리아', '엠팍', 'MLB파크',
    '뽐뿌', '루리웹', '클리앙', '이토랜드', '오늘의유머', '오유',
    '보배드림', '개드립', '네이트판', '웃긴대학', '인스티즈',
]);

const BLACKLIST_PATTERNS: RegExp[] = [
    // 정치·혐오 표현
    /(좌파|우파|빨갱이|틀딱|급식충|한남충|김치녀|된장녀)/,
    // 극단 선정/성적 표현
    /(야동|포르노|음란|성매매|유흥업소|ㅅㅅ|섹스)/,
    // 도박·불법
    /(사설토토|먹튀|바카라사이트|카지노사이트|불법도박)/,
    // 마약 직접 언급
    /(필로폰|히로뽕|코카인|대마초매매)/,
];

function isBlacklisted(kw: string): boolean {
    if (BLACKLIST_EXACT.has(kw)) return true;
    for (const re of BLACKLIST_PATTERNS) {
        if (re.test(kw)) return true;
    }
    return false;
}

function normalize(kw: string): string {
    let s = String(kw || '').trim();
    // 여는 괄호/대괄호/해시 선두 제거
    s = s.replace(/^[#\[\(]+/, '');
    // 닫는 괄호/대괄호 말미 제거
    s = s.replace(/[\]\)]+$/, '');
    // 짝 안 맞는 괄호 쌍방 정리: "(" 만 있으면 해당 토큰 이후 전체 잘라냄
    const openIdx = s.indexOf('(');
    const closeIdx = s.indexOf(')');
    if (openIdx >= 0 && closeIdx < 0) s = s.slice(0, openIdx).trim();
    else if (closeIdx >= 0 && openIdx < 0) s = s.slice(closeIdx + 1).trim();
    const openBracket = s.indexOf('[');
    const closeBracket = s.indexOf(']');
    if (openBracket >= 0 && closeBracket < 0) s = s.slice(0, openBracket).trim();
    else if (closeBracket >= 0 && openBracket < 0) s = s.slice(closeBracket + 1).trim();
    return s.replace(/\s+/g, ' ');
}

function isValid(kw: string): boolean {
    if (kw.length < 2 || kw.length > 30) return false;
    if (STOP.has(kw)) return false;
    if (isBlacklisted(kw)) return false;
    if (/^\d+$/.test(kw)) return false;
    if (!/[가-힣a-zA-Z]/.test(kw)) return false;
    if (kw.startsWith('특수:') || kw.startsWith('파일:') || kw.startsWith('분류:')) return false;
    return true;
}

const CATEGORY_ICON_MAP: Record<string, string> = {
    finance: '💰', insurance_safe: '🛡️', realestate: '🏢',
    hospital: '🏥', health: '💊', diet: '🏃',
    electronics: '📱', smartphone: '📱', laptop: '📱',
    travel_domestic: '✈️', travel_overseas: '✈️', food: '🍽️', recipe: '🍽️',
    beauty: '💄', parenting: '👶', baby_products: '👶',
    education: '📚', english: '📚', coding: '📚',
    policy: '🏛️', fashion: '👕', car: '🚗', car_maintain: '🚗',
    game: '🎮', interior: '🏠', home_life: '🏠',
    pet_dog: '🐶', pet_cat: '🐱', pet_etc: '🐾',
    movie: '🎬', music: '🎵', sports: '🏅', hobby: '🎨',
    book: '📖', app: '📲', ai_tool: '🤖',
    sidejob: '💼', job: '💼', wedding: '💍', mental: '🧠',
    season_spring: '🌸', season_summer: '☀️', season_fall: '🍂', season_winter: '❄️',
    kitchen: '🍳',
};

function classifyForFeed(keyword: string): { id: string; icon: string; label: string } {
    const primary = classifyKeyword(keyword).primary;
    const cat = getCategoryById(primary);
    const icon = CATEGORY_ICON_MAP[primary] || '🔥';
    const label = cat?.label || '이슈';
    return { id: primary, icon, label };
}

/**
 * 키워드가 "블로그 집필 가능한 구체성" 을 갖는지 판정
 *  - 2토큰 이상 (롱테일) OR 검색 의도 어미 포함 OR 저경쟁 희소 고유명사
 *  - 단일 범용 명사 (챗GPT, 유튜브, 제미나이 등) → false
 *
 * 목적: 개인 블로거가 실제로 글 주제를 잡을 수 있는 키워드만 SSS/SS 등급 허용
 */
const INTENT_SUFFIX_RE = /(추천|후기|비교|방법|순위|종류|가격|리뷰|만드는법|만들기|하는법|사용법|뜻|차이|장단점|원인|증상|효과|부작용|쓰는법|설치법|가입|해지|환불)$/;
const COMMERCIAL_RE = /(추천|비교|후기|가격|순위|할인|최저가|리뷰|원데이|무료|가성비|베스트|인기|신상|브랜드|구매)/;

// 🔥 v2.23.0: 한국 인명 패턴 — 단일 토큰 + 한글 2~4자 + 성씨 시작 의심
// 이(Lee), 김(Kim), 박(Park), 최(Choi), 정(Jung), 강(Kang) 등 40+ 성씨
const KOREAN_SURNAMES = '김이박최정강조윤장임한오서신권황안송류홍전고문양손배백허유남심노하곽성차주우구민유진지엄채원방공현함변염여추도석선설마길연위표명기반나왕금옥육인맹제모탁국어육';
const CELEB_PATTERN_RE = new RegExp(`^[${KOREAN_SURNAMES}][가-힣]{1,3}$`);

function isLikelyCelebrityName(keyword: string): boolean {
    const clean = keyword.trim();
    if (clean.length < 2 || clean.length > 4) return false;
    if (clean.includes(' ')) return false;
    return CELEB_PATTERN_RE.test(clean);
}

// 🔥 v2.27.6: 집필 가능성 필터 — "글 쓸 수 있는 키워드"만 통과
// 🔥 v2.32.1: 공공·정책·기관·추상명사 대폭 추가 — 실측 피드에서 글감 약한 키워드 차단
//   추가된 카테고리:
//   - 공공정책: 국민연금, 아동수당, 근로장려금, 청년도약계좌, 기초연금, 실업급여, 재난지원금, 건강보험, 고용보험, 산재보험, 4대보험 (2토큰 조합은 개별 게이트)
//   - 공공기관: 취업지원센터, 건강보험공단, 국민연금공단, 농협금융, 청약홈
//   - 추상·뉴스 명사: 협력, 대상, 사정, 병용, 산산조각, 리브스, 호르무즈 (단일 토큰 + 뜻/가격 조합 차단)
// v2.42.51: BROAD = "추상 명사 / 너무 광범위 명사" 만. 행위어는 GENERIC_ACTION_RE 로 이동.
//   - BROAD ∩ ACTION 중복으로 "보험 등록"/"카드 발급"/"청약 조회" 정상 2토큰 차단되던 부작용 제거
const GENERIC_BROAD_RE = /^(적금|예금|카드|대출|보험|투자|주식|펀드|ETF|연금|세금|건강|영양제|비타민|음식|요리|청소|여행|맛집|공부|운동|헬스|다이어트|뷰티|화장품|샴푸|선크림|의류|패션|가구|인테리어|네이버|구글|카카오|삼성|엘지|쿠팡|클로드|챗GPT|유튜브|인스타|페이스북|브랜드|제품|상품|서비스|리뷰|일본|미국|중국|한국|영국|독일|프랑스|이탈리아|러시아|인도|호주|캐나다|스페인|태국|베트남|유럽|아시아|동남아|북미|남미|중동|서울|부산|대구|인천|제주|강남|홍대|이태원|명동|성수|경기|강원|충청|전라|경상|국내|국외|해외|반려동물|돼지고기|소고기|닭고기|생선|아파트|빌라|오피스텔|주식종류|레고|정부|로마|청약|영화|드라마|음악|게임|애니|웹툰|소설|방송|예능|공연|뉴스|사건|사고|이슈|사람|인물|기업|회사|단체|기관|학교|대학|학원|은행|금융|경제|사회|정치|스포츠|선수|팀|경기|시합|대회|올림픽|월드컵|IT|AI|로봇|우주|과학|기술|발명|연구|교육|입시|시험|공무원|자격증|취업|직장|연봉|면접|국민연금|아동수당|근로장려금|자녀장려금|청년도약계좌|청년희망적금|기초연금|실업급여|재난지원금|건강보험|고용보험|산재보험|4대보험|사대보험|청년수당|국민행복카드|취업지원센터|건강보험공단|국민연금공단|농협금융|청약홈|정부24|홈택스|협력|대상|사정|병용|산산조각|리브스|호르무즈|우베|자위행위|절반|일부|전부|종합|일반|보통|평균|비율|수준|결과|가능|불가|필수|차이|이유|장점|단점|특징|특성|기능|효율|효과)$/;
// v2.42.51: ACTION 을 2분류로 분리
//   VAGUE: 너무 일반적 (BROAD 와 조합 시 차단) — 추천/리뷰/가격 등 무엇이든 매칭되는 어미
//   PROCESS: 구체 행위어 (단독은 차단, BROAD 와 조합은 정상 의도) — 등록/발급/해지 등
const GENERIC_VAGUE_ACTION_RE = /^(추천|후기|리뷰|비교|순위|가격|방법|꿀팁|정리|할인|세일|이벤트|인기|베스트|신상|최신|tips|모음|목록|소개|설명|정보|뜻|의미|브랜드|종류|안내|공지)$/i;
const GENERIC_PROCESS_ACTION_RE = /^(신청|해지|환불|가입|취소|결제|구매|판매|반품|교환|반납|연장|예약|배송|발급|승인|승급|등록|탈퇴|로그인|로그아웃|회원|업데이트|다운로드|설치|제거|삭제|초기화|변경|수정|이전|이체|입금|출금|적립|충전|충전금|증명|발행|발송|수신|전송|확인서|증명서|영수증|계산|계산법|환산)$/i;
// 호환성 유지: 단일 토큰 차단은 양쪽 OR
const GENERIC_ACTION_RE = new RegExp(`${GENERIC_VAGUE_ACTION_RE.source.slice(1,-1)}|${GENERIC_PROCESS_ACTION_RE.source.slice(1,-1)}`, 'i');

// 🔥 v2.28.1: 뉴스성 단일 토큰 차단 (분기/폐지/사망/협상 등 — 글감 부족)
//   사용자 피드백: "분기, 폐지, 주식종류, 세계, 개최, 사망, 협상 이런 건 어떻게 쓰라고"
//   이유: 단일 뉴스 명사는 주제 추상적 + 시의성 스파이크 후 급락 + 블로그 집필 불가능
const NEWS_NOISE_RE = /^(분기|폐지|종류|세계|개최|사망|협상|발표|공개|선언|입장|대응|가능성|전망|예정|인터뷰|논란|제기|의혹|해명|공지|답변|반응|이슈|속보|긴급|비상|충격|폭로|고백|루머|소문|공방|격돌|대결|파장|파문|후폭풍|여파|보도|특종|거부|결렬|철회|취소|승인|기각|제출|접수|공시|공표|해제|연장|중단|재개|해임|사임|지명|임명|승진|퇴임|방문|순방|귀국|출국|도착|출발|회담|회의|총회|위원회|처분|결정|검토|합의|체결|조사|수사|기소|판결|선고|결과|최종|잠정|추가|수정|확정|변경|조정|전달|언급|경고|강조|지적|주장|반박|반대|찬성|동의|거절|요구|요청|제안|건의|권고|충고|촉구|호소|지지|비판|우려|기대|환영|축하|위로|애도|분노|공분|여론|민심|표심|속설|미담)$/;

function isNewsNoise(keyword: string): boolean {
    const clean = keyword.trim();
    if (clean.includes(' ')) return false; // 2-token 이상은 롱테일이라 예외
    return NEWS_NOISE_RE.test(clean);
}

// v2.43.16 (다의어 차단): 단일 토큰 다의어/동음이의어 차단
//   10팀 비평: 시각/통화/세대/필름/상인/콜라보/캠페인은 5+ 의미 → 블로거 체류시간/CTR/RPM 폭락
const POLYSEMY_RE = /^(시각|통화|세대|필름|상인|콜라보|캠페인|시사|피해|시간|시점|관점|입장|상황|환경|구조|조건|기준|대상|방송|진행|운영|개시|상태|상승|상승세|하락|하락세|시각화|시간대|시즌|시리즈|시즌권|시즌제|역사|역할|국가|국민|국제|국내|지역|지방|시각적|시각장|관계|관련|관여|관심|관광|관광지|관행|관망|결과|결정|결심|결산|결단|결의|결합|결과적|문화|문서|문구|문제|문의|소속|소속사|소식|소통|소형|소형주|단계|단어|단순|단지|단가|단점|기능|기관|기념|기록|기본|기본기|기초|기준점|기존|기간|기간제|상관|상하|상태계|중심|중심지|중요|중복|중간|중앙)$/;

// v2.43.16 (단일 동사 차단): 명사/동사 모호한 단일 토큰
const GENERIC_VERB_RE = /^(입다|쓰다|먹다|마시다|보다|듣다|읽다|쉬다|자다|놀다|근무|출근|퇴근|이용|사용|운동|걷다|뛰다|달리다|일하다|쇼핑|구경|기다리다|만나다|보내다|받다|주다)$/;

function isPolysemousOrVerb(keyword: string): boolean {
    const clean = keyword.trim();
    if (clean.includes(' ')) return false; // 2-token 이상은 통과
    return POLYSEMY_RE.test(clean) || GENERIC_VERB_RE.test(clean);
}

// 🔥 v2.32.1: 순수 숫자/연도 토큰 — BROAD + 연도 조합 차단 ("아동수당 2026")
const YEAR_OR_NUMBER_RE = /^\d{2,4}(년|월|일|%)?$/;

function isTooGeneric2Token(keyword: string): boolean {
    const tokens = keyword.trim().split(/\s+/).filter(Boolean);
    if (tokens.length !== 2) return false;
    const [a, b] = tokens;
    // v2.42.51: BROAD + VAGUE_ACTION 조합 (예: "적금 추천", "일본 가격") — 차단
    //   BROAD + PROCESS_ACTION (예: "보험 등록", "카드 발급") 은 의도 명확 → 통과
    if (GENERIC_BROAD_RE.test(a) && GENERIC_VAGUE_ACTION_RE.test(b)) return true;
    if (GENERIC_BROAD_RE.test(b) && GENERIC_VAGUE_ACTION_RE.test(a)) return true;
    // BROAD + BROAD 조합 (예: "일본 미국", "네이버 구글")
    if (GENERIC_BROAD_RE.test(a) && GENERIC_BROAD_RE.test(b)) return true;
    // VAGUE_ACTION + VAGUE_ACTION (예: "가격 후기", "추천 리뷰")
    if (GENERIC_VAGUE_ACTION_RE.test(a) && GENERIC_VAGUE_ACTION_RE.test(b)) return true;
    // BROAD + 연도/숫자 조합 (예: "아동수당 2026")
    if (GENERIC_BROAD_RE.test(a) && YEAR_OR_NUMBER_RE.test(b)) return true;
    if (GENERIC_BROAD_RE.test(b) && YEAR_OR_NUMBER_RE.test(a)) return true;
    return false;
}

// v2.42.52: 카테고리별 화이트리스트 (자동 감지 + 컨텍스트 기반 필터)
//   목적: "뉴발란스 프리들" 같이 fashion/shoes 도메인 시드면 그 카테고리 핵심 2자 단어만 우선 통과
//        뷰티 블로거가 "전세" 같이 부동산 키워드 안 보이게, 부동산 블로거가 "세럼" 안 보이게
const CATEGORY_WHITELISTS: Record<string, Set<string>> = {
    health: new Set(['탈모', '탈피', '도수', '비염', '치질', '치아', '시력', '척추', '관절', '발톱', '근육', '혈압', '간염', '대장', '심장', '갑상', '디스크', '두통', '치통', '복통', '편두', '불면', '코골이', '안구', '구취']),
    beauty: new Set(['세럼', '에센스', '쿠션', '틴트', '크림', '로션', '토너', '미백', '주름', '팩', '마스크', '에센', '베이스', '메이크', '브로우', '컨실', '하이', '쉐도', '블러', '입술']),
    finance: new Set(['전세', '월세', '청약', '금리', '연체', '예금', '입금', '출금', '이체', '잔금', '계약', '담보', '신용', '체크', '환전', '환율', '대출', '카드', '적금', '펀드', '증여', '상속', '세금', '환급']),
    realestate: new Set(['전세', '월세', '청약', '잔금', '계약', '담보', '재건', '재개', '아파', '빌라', '주택', '오피', '땅값', '평당']),
    it: new Set(['맥북', '에어팟', '갤럭시', '아이폰', '키보드', '마우스', '모니터', '노트북', '서피스', '윈도우', 'iOS', 'M1', 'M2', 'M3', 'M4', 'A14', 'A15', 'A16', 'A17', 'A18']),
    food: new Set(['한식', '일식', '중식', '양식', '분식', '치킨', '피자', '버거', '커피', '디저트', '면', '국', '국밥', '죽', '회', '초밥', '라멘', '돈가스', '파스타', '리조또']),
    fashion: new Set(['샤넬', '구찌', '디올', '에르메스', '롤렉스', '나이키', '아디다스', '뉴발', '푸마', '반스', '캠퍼', '클락', '버켄', '코치', '프라', '셀린', '버버', '톰포']),
    parenting: new Set(['이유식', '기저귀', '분유', '치발기', '카시트', '유모차', '신생', '돌상', '아기', '신생아', '백일']),
    shopping: new Set(['직구', '공구', '구매', '핫딜', '세일', '쿠폰']),
    travel: new Set(['렌트', '여권', '비자', '환전', '체크인', '경유', '직항', '왕복', '편도']),
};

// 전체 합집합 — 카테고리 자동 감지 실패 시 fallback (기존 v2.42.51 동작 유지)
const ALL_2CHAR_WHITELIST = new Set<string>();
for (const list of Object.values(CATEGORY_WHITELISTS)) {
    for (const w of list) ALL_2CHAR_WHITELIST.add(w);
}

// v2.42.54: 사용자 정의 화이트리스트 (UI 환경설정에서 등록)
//   isWritableKeyword 최우선 통과 — 도메인 사전에 없는 사용자 전문 키워드 보호
let USER_WHITELIST: Set<string> = new Set<string>();
// v2.43.30: 진단/테스트용 export (실제 SSS 게이트 + 친화도 미리보기)
export function diagnoseKeyword(keyword: string, docCount: number, searchVolume: number): {
    keyword: string;
    writable: boolean;
    writabilityScore: number;
    factors: Array<{ delta: number; label: string }>;
    blockedBy?: string;
} {
    const clean = keyword.trim();
    let blockedBy: string | undefined;
    if (isNewsNoise(clean)) blockedBy = 'NEWS_NOISE';
    else if (isPolysemousOrVerb(clean)) blockedBy = 'POLYSEMY/VERB';
    else if (clean.split(/\s+/).length === 1 && GENERIC_ACTION_RE.test(clean)) blockedBy = 'GENERIC_ACTION';
    else if (clean.split(/\s+/).length === 1 && GENERIC_BROAD_RE.test(clean)) blockedBy = 'GENERIC_BROAD';
    else if (clean.split(/\s+/).length === 2 && isTooGeneric2Token(clean)) blockedBy = 'TOO_GENERIC_2TOKEN';
    const writable = isWritableKeyword(clean, docCount, searchVolume);
    const bd = calculateBloggerWritabilityBreakdown(clean, docCount, searchVolume);
    return {
        keyword: clean,
        writable,
        writabilityScore: bd.score,
        factors: bd.factors,
        blockedBy,
    };
}

export function setUserWhitelist(words: string[] | null | undefined): void {
    USER_WHITELIST = new Set(
        (Array.isArray(words) ? words : [])
            .map(w => String(w || '').trim())
            .filter(w => w.length > 0 && w.length <= 30)
    );
}
export function getUserWhitelist(): string[] {
    return Array.from(USER_WHITELIST);
}

// 키워드에서 도메인 자동 감지 (카테고리별 시그니처 토큰 매칭)
const CATEGORY_SIGNATURES: Record<string, RegExp> = {
    health: /(병원|의료|진료|약|증상|치료|건강|체력|복용|복약|효능|부작용)/,
    beauty: /(화장품|뷰티|선크림|클렌징|스킨|메이크업|브랜드|올영|올리브영|시카|크림|에센스)/,
    finance: /(대출|적금|예금|투자|펀드|연금|보험|세금|이자|금리|증여|상속|연말정산)/,
    realestate: /(부동산|아파트|빌라|오피스텔|청약|월세|전세|시세|매매|호가)/,
    it: /(노트북|스마트폰|이어폰|키보드|마우스|어플|앱|소프트웨어|어플리케이션|업데이트)/,
    food: /(레시피|맛집|요리|음식|식당|배달|메뉴|간식)/,
    fashion: /(코디|패션|운동화|스니커즈|가방|의류|옷|신발|매장)/,
    parenting: /(육아|아기|신생아|돌|영아|유아|돌잔치|어린이집|어린이날|기저귀|이유식|분유)/,
    shopping: /(직구|공구|핫딜|쿠팡|마켓컬리|위메프|11번가|네이버쇼핑)/,
    travel: /(여행|호텔|항공|패키지|투어|렌트카|숙박|에어비앤비)/,
};

function detectCategory(keyword: string): string | null {
    const k = keyword.toLowerCase();
    for (const [cat, sig] of Object.entries(CATEGORY_SIGNATURES)) {
        if (sig.test(k)) return cat;
    }
    return null;
}

// v2.43.12: 단일 토큰 게이트 강화 — "시각/통화/경북/입다" 같은 일반 명사 SSS 통과 차단
//   문제: 이전 sv>=1000 AND ratio>=2 게이트는 dc 추정값(sv*0.5 → ratio=2.0 정확) 단일 명사도 통과시킴
//   → 사용자 캡처에서 시각/통화/경북/콜라보 등 13개가 정확히 ratio=2.0으로 SSS 승격
//   수정: sv 5000+ AND ratio 3+ AND dc 실측 필수 (3가지 모두 충족 필요)
function isHighIntentSingleToken(keyword: string, searchVolume: number, docCount: number, dcEstimated: boolean = false): boolean {
    if (!searchVolume || !docCount) return false;
    if (dcEstimated) return false; // 추정값으로는 single token SSS 절대 불가
    const ratio = searchVolume / docCount;
    // sv 5000+ AND ratio 3+ AND dc 실측 → 진짜 의도 명확 단일 명사 (의료/뷰티 빅워드)
    return searchVolume >= 5000 && ratio >= 3 && docCount <= 100000;
}

// v2.43.14: 블로거 친화도 점수 (0~100) — "일반 블로거가 이 키워드로 글을 쓸 수 있는가"
//   캡처 신고: "잘 찾아주긴 하는데 누가 이걸로 글을 쓸까" → 셀럽/지역시설/음식점/의료전문 비중 너무 큼
//   룰베이스, AI 사용 안 함 (사용자 정책 반영)
const FACILITY_RE = /(구민체육센터|시민체육센터|문화센터|공원|연등축제|박물관|미술관|도서관|체육관|보건소|주민센터|구청|시청|법원)/;
const SHOP_BRAND_RE = /(쌍뺨|쌍뱀|식당|곱창|닭갈비|국밥|냉면|레스토랑|카페|베이커리|치킨집|호프|포차|분식|마라탕)/;
const APARTMENT_RE = /(아파트|푸르지오|자이|래미안|롯데캐슬|더샵|힐스테이트|이편한세상|롯데|위브|센트럴|파크|타워|그란테르|레미안|아이파크|어반|시티|뷰)$/;
const MEDICAL_PROFESSIONAL_RE = /(처방|진단|투여|복용량|투약|항생제|항암제|마취|수술법|시술법|병기|병태|예후|투석|이식)/;
const PARENTING_RE = /(신생아|아기|영아|유아|돌|이유식|분유|기저귀|육아|어린이|어린이집|돌잔치|태교|태열|모유|수유|배앓이|황달|예방접종)/;
const BEAUTY_RE = /(화장품|선크림|클렌징|스킨|메이크업|쿠션|파운데이션|에센스|세럼|마스카라|아이라이너|립스틱|올영|올리브영|시카)/;
const FOOD_RECIPE_RE = /(레시피|만드는법|만들기|조리법|요리법|냉동|보관법|손질|손질법)/;
const TRAVEL_RE = /(여행|호텔|항공|패키지|투어|렌트카|숙박|에어비앤비|일정|코스|당일치기|1박2일)/;
const TECH_GUIDE_RE = /(설정|방법|단축키|튜토리얼|입문|초보|시작하기|사용법|꿀팁|업데이트)/;
const INTENT_COMMERCIAL_RE = /(추천|비교|후기|순위|가격|할인|구매|리뷰|장단점|차이|차이점)/;

// v2.43.33: 하우투/실행 패턴 — "토스주식 하는법", "환급금 조회", "X 신청 방법" 등
//   검색의도 매우 명확, commercial intent 강, 일반 블로거가 글 쓸 수 있는 영역
const HOWTO_INTENT_RE = /(하는법|하는\s*방법|만드는법|만드는\s*방법|조회|신청|신청\s*방법|받는\s*법|받는\s*방법|시작하는\s*법|시작\s*방법|등록\s*방법|가입\s*방법|해지\s*방법|확인\s*방법|이용\s*방법|사용\s*방법|쓰는\s*법|첫\s*걸음|초보|입문|시작)/;

// v2.43.33: 시즌/이벤트 키워드 — 연말정산/종합소득세/김장/설날/추석 등
//   5월 = 종합소득세, 1월 = 연말정산, 11월 = 김장, 9월 = 추석 등 시즌 폭발
const SEASONAL_HOT_RE = /(종합소득세|종소세|연말정산|환급금|세금\s*환급|환급\s*신청|김장|설날|추석|명절|어버이날|어린이날|크리스마스|핼러윈|발렌타인|화이트데이|블랙프라이데이|11번가|광군절|개강|개학|입학|졸업|수능|면접|입사|이사|이직|취업|출산|결혼식|돌잔치|회식)/;

// v2.43.33: 시민참여/공공 키워드 — 선거/투표/공공서비스
const CIVIC_PUBLIC_RE = /(선거|투표|개표|공약|후보|지방선거|대선|총선|보궐|국민투표|청원|민원|주민등록|등본|초본|인감|위임장|공증|민방위|예비군)/;

// v2.43.16: niche/은어/게임 패턴 — 일반 블로거 도메인 밖
const GAME_TITLE_RE = /(서브노티카|마인크래프트|로블록스|배그|배틀그라운드|롤|리그오브레전드|발로란트|오버워치|스타크래프트|디아블로|월드오브워크래프트|와우|던파|던전앤파이터|메이플|메이플스토리|피파|fc온라인|에펨|이터널리턴|로스트아크|블레이드앤소울|아이온|리니지|원신|붕괴|젠레스|페그오|페이트|호요버스|쿠키런|브롤스타즈|클래시오브클랜|클래시로얄|포켓몬|위치)/;
const NEWBORN_PRODUCT_MODEL_RE = /(13\s*M|14\s*M|15\s*M|m\d{2,3}\b|pro\s*max|ultra\s*\d|nano\s*\d|aldidas|아디제로|nike|adidas|에어맥스|에어조던|울트라부스트|이지|덩크|어글리슈)/i;
const SLANG_JARGON_RE = /(셔세권|슬세권|숲세권|편세권|학세권|역세권은어|먹튀|꿀템|혜자|창렬|국밥|진성|찐텐|찐|존맛탱|존맛|JMT|광클|존버|할매니얼|텐션|MZ|꿀잼|핵잼|찐사랑)/;

// v2.43.19: 금융/보험/부동산 전문 영역 — 일반 블로거는 정보 신뢰성/E-A-T 부족으로 SERP 1페이지 진입 불가
//   "정기예금 금리 비교" 같은 키워드는 commercial 가산점 받지만 실제로는 재테크 전문 블로거만 글쓸 수 있음
// v2.43.33: 금융 전문 페널티 — "정기예금 금리 비교" 같은 분석/전문 패턴만
//   "환급/조회/신청" 같은 실행/생활 패턴은 일반 블로거 영역 → 제외
const FINANCE_EXPERT_RE = /(정기예금|적금|예금|펀드|채권|ETF|증권사|배당주|증여세|상속세|법인세|부가가치세|양도세|취득세|등록세|재산세|이자율|금리\s*비교|이율\s*비교|투자\s*전망|시세\s*분석|환율\s*전망|재테크\s*전략|자산배분|포트폴리오|매매전략|매수타이밍|매도타이밍)/;
const REALESTATE_EXPERT_RE = /(재건축|재개발|분양|청약|전세|월세|매매|시세|호가|등기|취등록세|아파트투자|부동산투자|입주권|분양권|토지|상가)/;
const INSURANCE_EXPERT_RE = /(생명보험|실비보험|암보험|의료실비|연금보험|종신보험|정기보험|보장보험|치아보험|간병보험|보험비교|보험료|보험금|보험금청구)/;

// v2.43.20-23: 외국 셀럽/회사명/약품명/영문 단일토큰 차단 (대폭 보강)
// 잭슨 가문, 일본 인명, 정치인 등 풀네임/부분 매칭
// v2.43.30: 단음절/2음절 일본 이름 false positive 제거 — 한글 단어 (사료/추천 등) 에 부분 매칭 차단
//   풀네임 + 한국에서 자주 회자되는 외국인 정치인/셀럽만 유지
const FOREIGN_CELEB_RE = /(호소키\s*카즈코|패리스\s*잭슨|마이클\s*잭슨|자파\s*잭슨|저메인\s*잭슨|티토\s*잭슨|랜디\s*잭슨|재키\s*잭슨|블랭킷\s*잭슨|프린스\s*잭슨|리사\s*마리\s*프레슬리|엘비스\s*프레슬리|엘론\s*머스크|일론\s*머스크|도널드\s*트럼프|조\s*바이든|블라디미르\s*푸틴|시진핑|아베\s*신조|기시다\s*후미오|히카루\s*우타다|아이코\s*공주|미사키\s*이토)/;
// 회사명/항공사/조직 패턴 (한국 회사 + 외국 회사)
const COMPANY_BRAND_NAME_RE = /(컴퍼니|코퍼레이션|코퍼레이트|주식회사|유한회사|holdings|corporation|company|inc\.|ltd\.|코리아\b|글로벌\b|인터내셔널|엔터프라이즈|솔루션|시스템즈|네트웍스|테크놀로지|티슈진|파마|항공\b|에어\b|증권\b|투자증권|자산운용|캐피탈|파이낸셜|일렉트로닉스|디스플레이|반도체|중공업|해운|물산|산업)/i;
const DRUG_NAME_RE = /^(아티반|자낙스|발륨|리브리움|로라제팜|디아제팜|알프라졸람|졸피뎀|에티졸람|클로나제팜|디아제팜|트라마돌|옥시코돈|모르핀|코데인|펜타닐|메타돈|아세트아미노펜|이부프로펜)$/;
// v2.43.23: 한국 게임명 보강 (캡처 #3 프래그마타, #14 붉은사막 등)
const KR_GAME_TITLE_RE = /(프래그마타|붉은사막|검은사막|P의\s*거짓|던파|던전앤파이터|메이플|메이플스토리|로스트아크|블레이드앤소울|아이온|리니지|배그|배틀그라운드|오버워치|발로란트|롤|리그오브레전드|스타크래프트|디아블로|와우|월드오브워크래프트|피파|fc온라인|에펨|이터널리턴|원신|붕괴|젠레스|포켓몬|쿠키런|브롤스타즈|클래시오브클랜|클래시로얄|마비노기|소울워커|아키에이지|블랙데저트|미르의전설|모탈블레이드|니어|엘든링|젤다)/i;
// AI 도구/플랫폼명 (단독 키워드는 글감 잡기 어려움)
const AI_PLATFORM_RE = /^(구글\s*제미나이|제미나이|챗GPT|챗지피티|GPT|클로드|claude|copilot|코파일럿|미드저니|midjourney|stable\s*diffusion|dall-e|런웨이|runway|소라|sora|퍼플렉시티|perplexity|deepseek|딥시크|grok|그록|llama|gemini|bard|바드)$/i;
// 정치/법률 추상 단어 (긴급조정권 등)
const POLITICS_LEGAL_ABSTRACT_RE = /^(긴급조정권|법률개정|법안발의|국정감사|국정조사|탄핵|사면|특별사면|장관후보|총리지명|국무위원|위헌결정|위헌|합헌|헌법재판|소추|배임죄|횡령죄)$/;
// 영문 단일토큰 (CORTIS, BTS, IVE 등 그룹/제품명) — 한글 1자 이상 없으면 일반 블로거 도메인 밖
function isEnglishSingleToken(keyword: string): boolean {
    const clean = keyword.trim();
    if (clean.includes(' ')) return false;
    // 한글 1자 이상이면 통과
    if (/[가-힣]/.test(clean)) return false;
    // 순수 영문 단일토큰
    return /^[A-Za-z]{2,15}$/.test(clean);
}

// v2.43.26 (사이클#3 5팀): 친화도 점수 사유 분해
export interface WritabilityBreakdown {
    score: number;
    factors: Array<{ delta: number; label: string }>;
}

// v2.43.52: 7팀 — keyword+docBucket+svBucket 메모이제이션
//   PRO Hunter 1회 발굴에서 동일 키워드를 5~8회 calculateBloggerWritability 호출.
//   docCount/searchVolume 을 bucket 으로 양자화하면 hit rate 90%+
const writabilityMemo = new Map<string, WritabilityBreakdown>();
function dcBucket(dc: number): number {
    if (dc <= 0) return 0;
    if (dc < 200) return 100;
    if (dc < 500) return 300;
    if (dc < 5000) return Math.floor(dc / 1000) * 1000 + 500;
    if (dc < 10000) return 7500;
    if (dc < 20000) return 15000;
    return 30000;
}
function svBucket(sv: number): number {
    if (sv <= 0) return 0;
    if (sv < 100) return 50;
    if (sv < 1000) return Math.floor(sv / 250) * 250 + 125;
    if (sv < 20000) return 5000;
    return 50000;
}
function calculateBloggerWritabilityBreakdown(keyword: string, docCount: number, searchVolume: number): WritabilityBreakdown {
    const clean = keyword.trim();
    if (!clean) return { score: 0, factors: [] };
    const memoKey = `${clean}|${dcBucket(docCount)}|${svBucket(searchVolume)}`;
    const cached = writabilityMemo.get(memoKey);
    if (cached) return cached;
    if (writabilityMemo.size > 8000) {
        // 메모리 보호 — 가장 오래된 1000건 제거
        const it = writabilityMemo.keys();
        for (let i = 0; i < 1000; i++) writabilityMemo.delete(it.next().value);
    }
    const tokens = clean.split(/\s+/).filter(Boolean);
    const tokenCount = tokens.length;
    const factors: Array<{ delta: number; label: string }> = [];

    let score = 50; // base
    const apply = (delta: number, label: string) => {
        if (delta === 0) return;
        score += delta;
        factors.push({ delta, label });
    };

    if (isLikelyCelebrityName(clean)) apply(-30, '셀럽');
    if (FACILITY_RE.test(clean)) apply(-25, '시설/축제');
    if (SHOP_BRAND_RE.test(clean)) apply(-20, '음식점/상호');
    if (APARTMENT_RE.test(clean)) apply(-10, '아파트');
    if (MEDICAL_PROFESSIONAL_RE.test(clean) && tokenCount === 1) apply(-18, '의료전문');
    if (tokenCount === 1 && clean.length <= 3) apply(-8, '단일짧음');

    if (GAME_TITLE_RE.test(clean)) apply(-25, '게임');
    if (NEWBORN_PRODUCT_MODEL_RE.test(clean)) apply(-20, '모델명');
    if (SLANG_JARGON_RE.test(clean)) apply(-25, '은어');

    if (FINANCE_EXPERT_RE.test(clean)) apply(-28, '금융전문');
    if (REALESTATE_EXPERT_RE.test(clean)) apply(-25, '부동산');
    if (INSURANCE_EXPERT_RE.test(clean)) apply(-25, '보험');

    if (FOREIGN_CELEB_RE.test(clean)) apply(-35, '외국셀럽');
    if (COMPANY_BRAND_NAME_RE.test(clean)) apply(-28, '회사명');
    if (DRUG_NAME_RE.test(clean)) apply(-30, '약품');
    if (isEnglishSingleToken(clean)) apply(-28, '영문단일');
    if (KR_GAME_TITLE_RE.test(clean)) apply(-28, '한국게임');
    if (AI_PLATFORM_RE.test(clean)) apply(-22, 'AI도구');
    if (POLITICS_LEGAL_ABSTRACT_RE.test(clean)) apply(-25, '정치법률');

    if (INTENT_COMMERCIAL_RE.test(clean)) apply(20, 'commercial');

    // v2.43.33: 하우투/시즌/시민참여 — 검색의도 매우 명확한 실행형
    if (HOWTO_INTENT_RE.test(clean)) apply(25, '실행형');     // 가장 강한 가산
    if (SEASONAL_HOT_RE.test(clean)) apply(22, '시즌이벤트');
    if (CIVIC_PUBLIC_RE.test(clean)) apply(18, '공공/시민');

    if (PARENTING_RE.test(clean)) apply(20, '육아');
    if (BEAUTY_RE.test(clean)) apply(18, '뷰티');
    if (FOOD_RECIPE_RE.test(clean)) apply(18, '레시피');
    if (TRAVEL_RE.test(clean)) apply(15, '여행');
    if (TECH_GUIDE_RE.test(clean)) apply(15, 'IT가이드');

    // v2.43.31: longtail 가산 강화 — 사용자 요구 "세부적인 확장성키워드"
    if (tokenCount === 2) apply(15, '2-token');         // 12 → 15
    else if (tokenCount === 3) apply(22, '3-token');    // 15 → 22 (best longtail)
    else if (tokenCount >= 4) apply(15, '4+ token');    // 8 → 15

    if (docCount >= 500 && docCount <= 5000) apply(8, 'dc적정');
    else if (docCount > 0 && docCount < 200) apply(3, 'dc초저');
    else if (docCount > 5000 && docCount <= 10000) apply(-8, 'dc경쟁');
    else if (docCount > 10000 && docCount <= 20000) apply(-18, 'dc강경쟁');
    else if (docCount > 20000) apply(-28, 'dc치열');

    if (searchVolume >= 1000 && searchVolume <= 20000) apply(5, 'sv적정');

    const result: WritabilityBreakdown = { score: Math.max(0, Math.min(100, score)), factors };
    writabilityMemo.set(memoKey, result);
    return result;
}

// 기존 호출 호환: number만 필요한 곳
function calculateBloggerWritability(keyword: string, docCount: number, searchVolume: number): number {
    return calculateBloggerWritabilityBreakdown(keyword, docCount, searchVolume).score;
}

function isWritableKeyword(keyword: string, docCount: number, searchVolume: number = 0, dcEstimated: boolean = false): boolean {
    const clean = keyword.trim();
    // v2.42.54: 사용자 정의 화이트리스트 — 모든 게이트 우선 통과 (개인 전문 키워드 보호)
    if (USER_WHITELIST.has(clean)) return true;
    const tokens = clean.split(/\s+/).filter(Boolean).length;
    if (tokens === 2 && isTooGeneric2Token(keyword)) return false;
    if (isNewsNoise(keyword)) return false;
    // v2.43.16: 다의어/동음이의어 + 단일 동사 차단 (10팀 비평 반영)
    if (isPolysemousOrVerb(keyword)) return false;
    if (tokens === 1 && GENERIC_ACTION_RE.test(clean)) return false;
    if (tokens === 1 && GENERIC_BROAD_RE.test(clean)) return false;
    if (tokens >= 2) return true;

    // v2.42.52: 카테고리별 화이트리스트
    if (ALL_2CHAR_WHITELIST.has(clean)) return true;
    if (clean.length < 2) return false;
    if (INTENT_SUFFIX_RE.test(clean)) return false;
    // v2.43.12: 단일 토큰 의도 명확 게이트 — dcEstimated true 면 false 반환 (가짜 ratio 차단)
    if (isHighIntentSingleToken(clean, searchVolume, docCount, dcEstimated)) return true;
    if (isLikelyCelebrityName(clean)) {
        return docCount > 0 && docCount <= 500;
    }
    if (clean.length === 2) return docCount > 0 && docCount <= 100;
    if (docCount > 0 && docCount <= 300) return true;
    return false;
}

function hasCommercialIntent(keyword: string): boolean {
    return COMMERCIAL_RE.test(keyword);
}

/**
 * 등급 판정 (다중 게이트, mdp-engine과 일관성 유지)
 *
 * 규칙 (균형 버전):
 *  - 극단 범용 빅워드만 제거: 단일 명사 + docCount > 100,000 → 피드 제외
 *    (제미나이·챗GPT·유튜브·환율·트럼프 등)
 *  - SSS/SS 는 writable 필수 (엄격한 품질)
 *  - S/A/B 는 docCount 자연 필터만 적용 (문근영·장동혁 같은 중도 키워드는 유지)
 */
function calculateGrade(volume: number, docCount: number, ratio: number, score: number, keyword: string, dcEstimated: boolean = false): GoldenGrade | '' {
    // ★ v2.49.9: Single Source of Truth — sanity-gate.ts 단일 검증 layer (Phase A 합의안)
    //   기존 inline halfSvRatio ±5% → sanity-gate validateGrade 가 ±5% 정확 + ±40% 광역 인접 매칭 모두 처리.
    //   사용자 메모리 규칙 4종 enforcement (추정값 가드 / UI 노출 금지 / Math.random 금지 / Manus 우선).
    //   다른 8 path 도 같은 함수 호출 → 통일 임계치.
    const { validateGrade } = require('../sanity-gate');
    const _sanity = validateGrade({
        keyword, searchVolume: volume, documentCount: docCount,
        goldenRatio: ratio, score, dcEstimated, source: 'rich-feed',
    });
    dcEstimated = _sanity.estimatedFlags.dc;  // caller 동기화 — 다운스트림 isWritableKeyword 등이 동기화된 값 사용

    // v2.43.12: dcEstimated 전달 → isHighIntentSingleToken 가 가짜 ratio=2.0 단일 명사 차단
    const writable = isWritableKeyword(keyword, docCount, volume, dcEstimated);
    // 극단 범용 빅워드 제거
    if (!writable && docCount > 100_000) return '';
    // 🔥 v2.27.6: 범용 2-token 조합은 dc 무관 탈락
    if (!writable && isTooGeneric2Token(keyword)) return '';
    // 🔥 v2.28.1: 뉴스성 단일 토큰 dc 무관 즉시 탈락 (분기/폐지/사망 등)
    if (isNewsNoise(keyword)) return '';

    // 인명 단일 토큰은 dc 1000 초과 시 grade 제외
    const isCelebLike = isLikelyCelebrityName(keyword);
    if (isCelebLike && docCount > 1000) return '';

    // 🔥 v2.40.6: ratio<1 레드오션 하드 차단 (실측 dc 기준)
    //   sv<dc 면 문서수가 검색량보다 많은 레드오션 — "황금키워드" 정의에 위배.
    //   기존엔 A/B 게이트에 ratio 하한이 없어 sv 큰 레드오션(IRP 계좌 추천 ratio=0.04 등)이 A 통과.
    if (docCount > 0 && ratio < 1.0) return '';

    // 🔥 v2.31.3: writable 강제 — 희소 예외 완전 제거 (단일 action "할인" 통과 문제 해결)
    //   실측에서 SS [할인], SS [가격] 통과 — allowSS 의 dc 예외 때문. 제거.
    const allowSS = writable;
    const allowS = writable;
    const allowA = writable;
    const commercial = hasCommercialIntent(keyword);

    // 🔥 v2.41.0: dcEstimated 부분 완화 — commercial 또는 빅볼륨 키워드는 SS 까지 허용
    //   기존: 추정값은 무조건 A 상한 → SSS 풀의 절반 차단 (한국 환경에서 dc=null 비율 40-60%)
    //   완화: 추정값이라도 commercial+sv 충분 시 SS 허용 → 분포 기반 동적 SSS 승격 풀에는 미포함 (dcEstimated 가드)
    //   SSS/SSR 직승은 여전히 차단 (신뢰도 보존)
    if (dcEstimated) {
        if (commercial && volume >= 1500 && score >= 70 && writable) return 'SS';
        if (volume >= 3000 && score >= 75 && writable) return 'SS';
        if (score >= 45 && volume >= 200 && writable) return 'A';
        if (score >= 38 && volume >= 100 && writable) return 'B';
        return '';
    }

    // 🔥 v2.42.12: 자연 SSS 직승 경로 'loose' 완화 — 시뮬레이션 데이터 기반
    //   배경: v2.41.3 strict 게이트(sv 1k-10k + dc<=5k + r>=5)로 자연 SSS 1.3%(realistic) / 0.1%(pessimistic).
    //   30 소스 200 후보 환경에서 자연 SSS 0~3개 → "총 0건" 사용자 신고 (스크린샷 확정).
    //   완화: sv 300-30k / dc<=10k / r>=2 generic / r>=1.5 commercial → 자연 SSS 5.8% / 1.3% (5x 개선)
    //   유지: v2.40.6 ratio<1 redOcean 차단 (정책 그대로) + commercial 우대
    // v2.43.31: longtail 세부 키워드 우선 — sv 상한 30K (이전 50K), 빅워드 차단
    //   사용자 요구: "너무 대형키워드보다는 세부적인 확장성키워드"
    //   sv 30K+ 키워드는 보통 단일 명사/빅워드 → SSS 자격 박탈
    if (writable && !isCelebLike && docCount > 0 && volume >= 200 && volume <= 30000 && docCount <= 12000) {
        if (ratio >= 1.7) return 'SSS';
        if (commercial && ratio >= 1.3) return 'SSS';
        if (ratio >= 4 && docCount <= 8000) return 'SSS';
        if (commercial && docCount <= 5000 && ratio >= 1) return 'SSS';
    }

    // SSS 기본 게이트도 빅워드 제외
    const sssScore = commercial ? 62 : 68;
    const sssSvMin = 200;
    const sssSvMax = 30000;   // 50000 → 30000 (빅워드 차단)
    const sssDc = 12000;      // 15000 → 12000 (저경쟁 우선)
    const sssRatio = commercial ? 1.3 : 1.7;
    if (score >= sssScore && volume >= sssSvMin && volume <= sssSvMax && docCount > 0 && docCount <= sssDc && ratio >= sssRatio && allowSS) return 'SSS';

    // 🔥 v2.29.0: SS 자동 승격에도 writable 강제
    if (writable && !isCelebLike && docCount > 0) {
        if (ratio >= 5 && docCount <= 15000 && volume >= 500) return 'SS';
        if (commercial && docCount <= 8000 && volume >= 300 && ratio >= 2) return 'SS';
        if (ratio >= 3 && docCount <= 5000 && volume >= 200) return 'SS';
    }

    const ssScore = commercial ? 58 : 62;
    const ssSv = commercial ? 150 : 250;
    const ssDc = commercial ? 35000 : 25000;
    const ssRatio = commercial ? 1.2 : 1.8;
    if (score >= ssScore && volume >= ssSv && docCount > 0 && docCount <= ssDc && ratio >= ssRatio && allowSS) return 'SS';

    // 🔥 v2.29.0: S/A 도 writable 강제 (기존 allowS/allowA 대신)
    //   "세대/회복/비전" 등 dc 수천 단일 명사가 S/A 통과 → 차단
    // 🔥 v2.32.1: S/A 최저 볼륨 상향 — sv<100 은 통계적 무의미 (예: "주식 초보 공부 sv 40", "현대건설 순위 sv 30")
    if (score >= 48 && volume >= 150 && ratio >= 0.5 && writable) return 'S';
    if (score >= 38 && volume >= 100 && writable) return 'A';
    if (score >= 35 && volume >= 50 && writable) return 'B';
    return '';
}

function calculateScore(volume: number, docCount: number, ratio: number, cpc: number, intent: number, keyword?: string): number {
    // 🔥 v2.30.0: goldenRatio log scale — 극단값 왜곡 완화 (팀D 제안)
    //   gr=100(dc=1)과 gr=100(dc=500) 구분 가능하게. sd 는 log scale 기준 재구성.
    const logRatio = Math.log1p(Math.min(ratio, 1000)); // log(1+ratio), 1000 cap 으로 극단값 방어
    const sd = Math.min(100,
        logRatio >= 5.0 ? 100 :                 // ratio ~150+
        logRatio >= 3.0 ? 80 + (logRatio - 3.0) * 10 :  // ratio ~20~150
        logRatio >= 1.8 ? 55 + (logRatio - 1.8) * 20.8 : // ratio ~5~20
        logRatio >= 1.0 ? 30 + (logRatio - 1.0) * 31 :  // ratio ~1.7~5
        logRatio >= 0.5 ? 10 + (logRatio - 0.5) * 40 :  // ratio ~0.6~1.7
        logRatio * 20);
    // 검색량 (25%)
    const vol = Math.min(100,
        volume >= 50000 ? 100 :
        volume >= 10000 ? 80 + (volume - 10000) * 0.0005 :
        volume >= 5000 ? 65 + (volume - 5000) * 0.003 :
        volume >= 1000 ? 40 + (volume - 1000) * 0.00625 :
        volume >= 300 ? 15 + (volume - 300) * 0.036 :
        volume * 0.05);
    // 수익성 (15%) — 수익형 키워드 우대는 유지하되, 정보성 블루오션 억제 방지
    const cpcScore = Math.min(100, cpc >= 2000 ? 100 : cpc >= 1000 ? 70 + (cpc - 1000) * 0.03 : cpc >= 500 ? 40 + (cpc - 500) * 0.06 : cpc >= 200 ? 15 + (cpc - 200) * 0.083 : cpc * 0.075);
    const monetization = (cpcScore * 0.5 + intent * 0.5);
    // 경쟁도 (15%)
    const docPenalty = docCount > 50000 ? 30 : docCount > 20000 ? 20 : docCount > 10000 ? 10 : docCount > 5000 ? 5 : 0;
    const comp = Math.max(0, 100 - docPenalty);
    let base = sd * 0.45 + vol * 0.25 + monetization * 0.15 + comp * 0.15;

    // 🔥 v2.23.0: 끝판왕 품질 보정
    if (keyword) {
        // (+) 상업성 키워드 (추천/비교/후기/가격/순위...): +15%
        if (hasCommercialIntent(keyword)) base *= 1.15;
        // (+) 진짜 블루오션 (dc<1000 + sv>500 + gr>10): +20%
        if (docCount > 0 && docCount < 1000 && volume > 500 && ratio >= 10) base *= 1.20;
        // (+) 고CPC (2000원+): 이미 cpcScore 반영되지만 SSS 승격 위해 추가 +8%
        if (cpc >= 2000) base *= 1.08;
        // (-) 인명 의심 단일 토큰: -35% (writable=false라 grade 는 탈락하나 score 자체도 낮게)
        if (isLikelyCelebrityName(keyword)) base *= 0.65;
        // (-) 의도 없는 단일 범용 토큰 + 낮은 intent: -15%
        const tokens = keyword.trim().split(/\s+/).length;
        if (tokens === 1 && !INTENT_SUFFIX_RE.test(keyword) && intent < 3) base *= 0.85;
    }

    return Math.round(Math.min(100, Math.max(0, base)));
}

/**
 * 신선도 판정
 *  - BURNING: 신규 등장 + 다중 소스 매칭
 *  - RISING: 시계열 ratio >= 2.0
 *  - EVERGREEN: 시계열 7일 모두 등장
 *  - STABLE: 그 외
 */
function judgeFreshness(keyword: string, sources: string[]): Freshness {
    let isNew = false;
    let maxRatio = 0;
    let consecDays = 0;

    for (const src of sources) {
        const trend = getKeywordTrend(src, keyword);
        if (trend.weekAvg === 0 && trend.today > 0) isNew = true;
        if (trend.ratio > maxRatio) maxRatio = trend.ratio;
        if (trend.weekAvg > 0) consecDays++;
    }

    if (isNew && sources.length >= 2) return 'BURNING';
    if (maxRatio >= 2.0) return 'RISING';
    if (consecDays >= 5) return 'EVERGREEN';
    return 'STABLE';
}

export type RichFeedProgress = { step: string; percent: number; message: string };
export type RichFeedProgressCallback = (payload: RichFeedProgress) => void;

/**
 * 메인 빌더
 */
// v2.43.25: 모듈 스코프에 프로필 보관 (validated 행 생성 시 참조)
let _bloggerProfile: BloggerProfile | null = null;

export async function buildRichFeed(
    options: { tier?: SourceTier; limit?: number; aiAugmentation?: 'none' | 'claude' } = {},
    onProgress?: RichFeedProgressCallback
): Promise<RichFeedResult> {
    const tier: 'lite' | 'pro' = options.tier === 'pro' ? 'pro' : 'lite';
    const limit = options.limit || 100;

    // v2.43.25 (사이클#2): 블로거 프로필 로드 — 사용자 카테고리에 맞춘 친화도 보정
    _bloggerProfile = loadBloggerProfile();
    if (_bloggerProfile) {
        console.log(`[rich-feed v2.43.25] 블로거 프로필 적용: 카테고리[${_bloggerProfile.selectedCategories.join(',')}] 경험[${_bloggerProfile.experienceLevel}]`);
    }

    // 🔥 v2.27.9: 하드캡 8분 → 6분 (사용자 "실제 그 시간 안 걸리는데 확실하게 대량")
    //   사용자 환경은 네이버 API 정상 → 후보 2500 + concurrency 8 이 6분 내 가능
    // v2.43.32: 하드캡 6분 → 3.5분 (사용자 "너무 오래걸린다")
    const HARD_CAP_MS = 3.5 * 60 * 1000;
    const startedAt = Date.now();
    const isExceeded = () => Date.now() - startedAt > HARD_CAP_MS;

    // 🔥 v2.32.1: 진행률 단조증가 강제 — pseudo-animation timer + 하드캡 경로가 섞여 역행하던 버그 방지
    //   예: seed animation 이 14 보낸 후 candidates 20 보내기 전에 늦게 도착한 seed 13 이 렌더러 도달 → 역행
    let lastEmittedPercent = 0;
    const emit = (step: string, percent: number, message: string) => {
        const p = Math.max(0, Math.min(100, Math.round(percent)));
        if (p < lastEmittedPercent) return; // 역행 차단 (메시지도 함께 무시 — UI 혼란 방지)
        lastEmittedPercent = p;
        try { onProgress?.({ step, percent: p, message }); } catch {}
    };

    // v2.42.13: 진단 카운터 — 실 데이터 funnel 측정용
    const diagnostic: RichFeedDiagnostic = {
        seeds: { sourcesSuccess: 0, sourcesTotal: 0, seedMapSize: 0, afterQualityFilter: 0 },
        longtail: { expandedAdded: 0 },
        candidates: { targetSize: 0, actualSampled: 0, sentToNaver: 0 },
        naver: { withValidSv: 0, withValidDc: 0, dcEstimated: 0 },
        grading: { SSS: 0, SSR: 0, SS: 0, S: 0, A: 0, B: 0, filtered: 0 },
        writableAnalysis: { singleTokenBroad: 0, singleTokenAction: 0, twoTokenGeneric: 0, singleTokenHighDc: 0, passedWritable: 0 },
        redOcean: { ratioBelow1: 0 },
        promotion: { targetSSS: 0, naturalSSS: 0, poolSize: 0, promoted: 0 },
        final: { afterSSROnlyFilter: 0, topNReturned: 0 },
    };

    emit('seed', 3, '28개 외부 소스에서 시드 수집 시작...');

    // 1. 시드 풀링 — 진행률 pseudo-animation (callAllSources는 Promise.all이라 중간 진행 불가)
    let seedProgress = 3;
    const seedAnimTimer = setInterval(() => {
        seedProgress = Math.min(14, seedProgress + 1);
        emit('seed', seedProgress, `외부 소스 수집 중... (${seedProgress}%)`);
    }, 900);

    const sourceResults = await callAllSources({
        tier: tier === 'lite' ? 'lite' : undefined,
        healthy: true,
    });
    clearInterval(seedAnimTimer);

    const successSources = Array.from(sourceResults.values()).filter(r => r.success).length;
    const totalSources = sourceResults.size;
    diagnostic.seeds.sourcesSuccess = successSources;
    diagnostic.seeds.sourcesTotal = totalSources;
    emit('seed', 15, `시드 풀링 완료 (성공 ${successSources}/${totalSources})`);

    // 2. 키워드 → 소스 맵
    const seedMap = new Map<string, Set<string>>();
    for (const [sourceId, result] of sourceResults.entries()) {
        if (!result.success) continue;
        for (const raw of result.keywords) {
            const kw = normalize(raw);
            if (!isValid(kw)) continue;
            if (!seedMap.has(kw)) seedMap.set(kw, new Set());
            seedMap.get(kw)!.add(sourceId);
        }
    }

    // 2-1. 안전망 seed 합류 — 외부 소스 실패 시에도 최소 결과 보장
    for (const seed of getEvergreenSafetyNetSeeds(40)) {
        const kw = normalize(seed);
        if (!isValid(kw)) continue;
        if (!seedMap.has(kw)) seedMap.set(kw, new Set());
        seedMap.get(kw)!.add('evergreen');
    }

    // 🔥 v2.32.0: 수익 카테고리 시드 전량 주입 (엔터 편중 해소, SSR 수량 증대)
    //   health/finance/realestate/beauty/business/parenting/policy 200+ 시드
    //   특별 소스 태그 'revenue' 로 qualityScore 가중치 상승 효과
    for (const seed of getAllRevenueSeeds()) {
        const kw = normalize(seed);
        if (!isValid(kw)) continue;
        if (!seedMap.has(kw)) seedMap.set(kw, new Set());
        seedMap.get(kw)!.add('revenue');
    }

    // 3. 모든 seed 수집 + 소스별 그룹화 (round-robin용)
    const allSeeds = Array.from(seedMap.entries())
        .map(([kw, srcs]) => ({ keyword: kw, sources: Array.from(srcs) }))
        .sort((a, b) => b.sources.length - a.sources.length);
    diagnostic.seeds.seedMapSize = allSeeds.length;

    // 3-1. 소스별로 그룹화 → 다양성 보장
    const perSource = new Map<string, Array<{ keyword: string; sources: string[] }>>();
    for (const seed of allSeeds) {
        const primary = seed.sources[0] || 'unknown';
        if (!perSource.has(primary)) perSource.set(primary, []);
        perSource.get(primary)!.push(seed);
    }

    // 3-2. 품질 기반 선별 — 다양성 CAP + TF-IDF + 고유명사 + 카테고리 부스팅
    //
    // 기존: 소스별 상위 N개 단순 take
    // 개선: 소스 쿼터는 유지하되, 각 소스 내에서 품질 점수로 정렬 후 상위 N개만.
    //       stopwords/노이즈 사전 필터 + IDF 기반 과다등장 키워드 디메리트.
    const HEAVY_SOURCE_CAP = 600;   // 🔥 v2.27.0: 400→600 (전체 소스 총 동원)

    // IDF 기반 통계: 소스별 유니크 키워드 집합
    const sourceBuckets = new Map<string, string[]>();
    for (const [sourceId, list] of perSource.entries()) {
        sourceBuckets.set(sourceId, list.map(s => s.keyword));
    }
    const idfStats = buildIDFStats(sourceBuckets);

    const baseSeeds: Array<{ keyword: string; sources: string[]; qualityScore: number }> = [];
    const seenKeywords = new Set<string>();
    for (const [, list] of perSource.entries()) {
        // 품질 점수로 소스 내 재정렬
        const scored = list
            // 🔥 v2.27.7: 시드 단계 pre-filter — 범용 2-token 조합 제거 (API 호출 낭비 방지)
            .filter(s => isQualitySeed(s.keyword) && !isTooGeneric2Token(s.keyword))
            .map(s => ({
                ...s,
                qualityScore: scoreSeedKeyword(s.keyword, idfStats, s.sources.length),
            }))
            .sort((a, b) => b.qualityScore - a.qualityScore);

        const take = scored.length > HEAVY_SOURCE_CAP ? HEAVY_SOURCE_CAP : scored.length;
        for (let i = 0; i < take; i++) {
            const seed = scored[i];
            if (!seenKeywords.has(seed.keyword)) {
                baseSeeds.push(seed);
                seenKeywords.add(seed.keyword);
            }
        }
    }
    diagnostic.seeds.afterQualityFilter = baseSeeds.length;

    // 🔥 v2.42.15: 네이버 자동완성 기반 longtail 확장 (코어 품질 도약)
    //   이전 (v2.27.0~v2.42.14): 50개 generic suffix 기계 결합 → 인위적 조합, 대부분 isTooGeneric2Token 차단
    //   현재: 상위 N개 시드 → 네이버 자동완성 4채널(PC/Mobile/Shopping/연관) 호출 → 실제 사용자 검색 쿼리만
    //   효과: 인위 조합 5000개 → 실제 검색 longtail 300~800개. SSS 통과율 5~10배 ↑
    const env_ac = EnvironmentManager.getInstance().getConfig();
    const AC_TOP_N = 80;        // 상위 80 시드만 자동완성 호출 (Naver autocomplete 부담 통제)
    const AC_CONCURRENCY = 5;
    const acSeeds = baseSeeds.slice(0, AC_TOP_N);
    const extraSeeds: typeof baseSeeds = [];
    const acClientId = env_ac.naverClientId || '';
    const acClientSecret = env_ac.naverClientSecret || '';

    if (acSeeds.length > 0 && acClientId && acClientSecret) {
        emit('longtail', 16, `네이버 자동완성 longtail 확장 시작 (${acSeeds.length}개 시드)...`);
        let acDone = 0;
        const processAcSeed = async (base: typeof baseSeeds[0]) => {
            try {
                const autoKws = await getNaverAutocompleteKeywords(base.keyword, {
                    clientId: acClientId,
                    clientSecret: acClientSecret,
                });
                for (const kw of autoKws) {
                    if (!kw || kw === base.keyword) continue;
                    if (seedMap.has(kw) || seenKeywords.has(kw)) continue;
                    if (!isQualitySeed(kw) || isTooGeneric2Token(kw)) continue;
                    extraSeeds.push({
                        keyword: kw,
                        sources: [...base.sources, 'autocomplete'],
                        // 자동완성 출처는 quality bonus 1.3 (실제 검색 보장)
                        qualityScore: scoreSeedKeyword(kw, idfStats, base.sources.length) * 1.3,
                    });
                    seenKeywords.add(kw);
                }
            } catch (e: any) {
                console.warn(`[rich-feed] 자동완성 실패 "${base.keyword}":`, e?.message);
            }
            acDone++;
        };

        for (let i = 0; i < acSeeds.length; i += AC_CONCURRENCY) {
            if (isExceeded()) {
                console.warn(`[rich-feed v2.42.15] 자동완성 단계 timeout - ${acDone}/${acSeeds.length} 처리 후 중단`);
                break;
            }
            const batch = acSeeds.slice(i, i + AC_CONCURRENCY);
            await Promise.all(batch.map(processAcSeed));
            const pct = 16 + Math.round((acDone / acSeeds.length) * 3);
            emit('longtail', pct, `자동완성 ${acDone}/${acSeeds.length} (실제 검색 longtail 누적 ${extraSeeds.length}개)`);
            if (i + AC_CONCURRENCY < acSeeds.length) await new Promise(r => setTimeout(r, 100));
        }

        emit('longtail', 19, `자동완성 완료 — 실제 검색 longtail ${extraSeeds.length}개 수집`);
    } else {
        console.warn('[rich-feed v2.42.15] 자동완성 스킵 — Naver API 키 미설정 또는 시드 없음');
    }

    // 🔥 v2.42.16: Modifier 조합 niche 생성 (진짜 황금 니치는 specific context에서 옴)
    //   - 자동완성은 popular query (head)라 ratio 낮음
    //   - 연령/상황/예산/효과 modifier × 베이스 시드 = 3+ 토큰 specific niche
    //   - Naver 실측 통과 시 dc 낮을 확률 높음 → SSS 자연 통과 ↑
    //   - 사용자 비즈니스 통찰: "진짜 황금 니치여야 한다" 반영
    const NICHE_MODIFIERS: string[] = [
        // 연령
        '20대', '30대', '40대', '50대', '학생', '직장인', '주부', '신혼', '신생아', '영유아', '초등생', '중학생', '고등학생', '대학생',
        // 상황
        '초보', '입문', '처음', '주말', '저녁', '평일', '재택', '비대면', '온라인', '오프라인', '재방문', '신규',
        // 예산
        '저렴한', '가성비', '합리적인', '프리미엄', '고급', '무료',
        // 효과·품질
        '빠른', '쉬운', '안전한', '효과적인', '검증된', '진짜', '확실한',
        // 시간·기간
        '1주일', '1개월', '3개월', '한달', '단기간', '장기',
        // 장소·범위
        '집에서', '동네', '근처', '서울', '지방',
    ];
    const TOP_FOR_MODIFIER = 100;
    const MOD_PER_SEED = 5;

    const modifierExtraSeeds: typeof baseSeeds = [];
    for (const base of baseSeeds.slice(0, TOP_FOR_MODIFIER)) {
        const bkw = base.keyword.trim();
        if (!bkw || bkw.length > 12) continue;
        const baseTokens = bkw.split(/\s+/).length;
        if (baseTokens >= 3) continue;
        // 베이스 자체가 modifier이면 의미 없음 (중복 modifier 결합)
        if (NICHE_MODIFIERS.includes(bkw)) continue;

        const shuffled = NICHE_MODIFIERS.slice().sort(() => Math.random() - 0.5);
        const picks = shuffled.slice(0, MOD_PER_SEED);
        const baseScore = scoreSeedKeyword(bkw, idfStats, base.sources.length);

        for (const mod of picks) {
            const orderFront = Math.random() < 0.5;
            const derived = orderFront ? `${mod} ${bkw}` : `${bkw} ${mod}`;
            if (seedMap.has(derived) || seenKeywords.has(derived)) continue;
            if (!isQualitySeed(derived) || isTooGeneric2Token(derived)) continue;
            if (derived.length < 4 || derived.length > 30) continue;
            modifierExtraSeeds.push({
                keyword: derived,
                sources: [...base.sources, 'modifier-niche'],
                qualityScore: baseScore * 1.5,
            });
            seenKeywords.add(derived);
        }
    }
    extraSeeds.push(...modifierExtraSeeds);
    console.log(`[rich-feed v2.42.16] Modifier 니치 ${modifierExtraSeeds.length}개 생성`);
    emit('longtail', 19, `진짜 황금 니치 ${modifierExtraSeeds.length}개 추가 (modifier 조합)`);

    // v2.43.42: 사용자 프로필 카테고리 → evergreen 시드 강제 주입
    //   1팀 사이클#1 D 옵션: "카테고리 quota 시드 주입" 실현
    //   사용자가 [육아/뷰티/IT] 선택 시 매 발굴마다 해당 evergreen 시드 자동 추가
    try {
        if (_bloggerProfile && _bloggerProfile.selectedCategories.length > 0) {
            const { getSeedsForUserCategories } = await import('./category-seed-catalog');
            const userCatSeeds = getSeedsForUserCategories(
                _bloggerProfile.selectedCategories as any[],
                30, // 카테고리당 30개
            );
            const injected: typeof baseSeeds = [];
            for (const kw of userCatSeeds) {
                if (seenKeywords.has(kw)) continue;
                seenKeywords.add(kw);
                injected.push({
                    keyword: kw,
                    sources: ['user-category'],
                    qualityScore: 1.6, // 시즌(1.4) 보다 약간 높게 — 사용자 맞춤 우선
                });
            }
            if (injected.length > 0) {
                extraSeeds.push(...injected);
                console.log(`[rich-feed v2.43.42] 사용자 카테고리(${_bloggerProfile.selectedCategories.join(',')}) evergreen 시드 ${injected.length}개 주입`);
                emit('user-category', 19, `👤 내 카테고리 evergreen ${injected.length}개 시드 주입`);
            }
        }
    } catch (e: any) {
        console.warn('[rich-feed v2.43.42] 사용자 카테고리 시드 주입 실패:', e?.message);
    }

    // v2.43.34-46: 시즌 시드 + 카테고리×시즌 매트릭스 + 의도 suffix + 의미 검증
    try {
        const { getCurrentSeasonalSeeds, expandWithSemanticVerify, getSeasonalForUserCategories } = await import('./seasonal-calendar');
        // v2.43.46: 사용자 카테고리 매칭 시즌 시드 우선 가산
        let userPatterns: RegExp[] = [];
        if (_bloggerProfile && _bloggerProfile.selectedCategories.length > 0) {
            const { BLOGGER_CATEGORIES } = await import('../blogger-profile');
            userPatterns = _bloggerProfile.selectedCategories
                .map(id => BLOGGER_CATEGORIES.find(c => c.id === id))
                .filter((c): c is any => !!c)
                .map(c => c.affinityPattern);
        }
        const matrix = getSeasonalForUserCategories(userPatterns);

        // matched 시드 우선 의도 suffix 확장 (perSeed 10, 미매칭은 6)
        const { items: matchedExpanded, verified, blocked } = await expandWithSemanticVerify(matrix.matched, 10, 0.45);
        const generalExpanded = (await expandWithSemanticVerify(matrix.general, 6, 0.45)).items;

        const seasonalSeeds: typeof baseSeeds = [];
        for (const kw of matchedExpanded) {
            if (seenKeywords.has(kw)) continue;
            seenKeywords.add(kw);
            seasonalSeeds.push({
                keyword: kw,
                sources: ['seasonal-calendar', 'user-matched'],
                qualityScore: 1.8, // 매트릭스 매칭 우선
            });
        }
        for (const kw of generalExpanded) {
            if (seenKeywords.has(kw)) continue;
            seenKeywords.add(kw);
            seasonalSeeds.push({
                keyword: kw,
                sources: ['seasonal-calendar'],
                qualityScore: 1.4,
            });
        }
        extraSeeds.push(...seasonalSeeds);
        const monthLabel = new Date().getMonth() + 1;
        const verifyTag = verified ? ` (🧠 ${blocked}건 차단)` : '';
        const matchTag = matrix.matched.length > 0 ? ` (내 카테고리 매칭 ${matrix.matched.length})` : '';
        console.log(`[rich-feed v2.43.46] ${monthLabel}월 시즌 ${matrix.matched.length}+${matrix.general.length} → ${seasonalSeeds.length} longtail${verifyTag}`);
        emit('seasonal', 20, `📅 ${monthLabel}월 시즌 longtail ${seasonalSeeds.length}개${matchTag}${verifyTag}`);
    } catch (e: any) {
        console.warn('[rich-feed v2.43.46] seasonal-calendar 로드 실패:', e?.message);
    }

    // v2.43.34 (Phase 1): trend-surge-detector 결과 → 발굴 풀 합류
    //   기존 이미 만든 surge 감지기 (한일가왕전 같은 신규 이벤트 자동 감지)를 발굴에 연결
    try {
        const { listRecentSurges } = await import('../pro-hunter-v12/trend-surge-detector');
        const surges = listRecentSurges(40); // 최근 40개 급증 신호
        const surgeSeeds: typeof baseSeeds = [];
        for (const s of surges) {
            if (!s.keyword || seenKeywords.has(s.keyword)) continue;
            // 'explosive' / 'strong' 만 시드로 (moderate 이하는 노이즈 가능)
            if (s.surgeLevel !== 'explosive' && s.surgeLevel !== 'strong') continue;
            seenKeywords.add(s.keyword);
            surgeSeeds.push({
                keyword: s.keyword,
                sources: ['surge-detector', ...s.multiSourceEvidence].slice(0, 5),
                qualityScore: 1.6 + (s.surgeLevel === 'explosive' ? 0.4 : 0.2),
            });
        }
        if (surgeSeeds.length > 0) {
            extraSeeds.push(...surgeSeeds);
            console.log(`[rich-feed v2.43.34] 급증 신호 시드 ${surgeSeeds.length}개 합류`);
            emit('surge', 21, `📈 급증 키워드 ${surgeSeeds.length}개 자동 추가 (신규 이벤트)`);
        }
    } catch (e: any) {
        console.warn('[rich-feed v2.43.34] surge-detector 로드 실패:', e?.message);
    }

    diagnostic.longtail.expandedAdded = extraSeeds.length;

    // 🔥 v2.27.9: 후보 풀 1500 → 2500 (대량 보장)
    const allScored = [...baseSeeds, ...extraSeeds].sort((a, b) => b.qualityScore - a.qualityScore);
    const targetSize = Math.min(2500, Math.max(limit * 8, 1500));
    diagnostic.candidates.targetSize = targetSize;

    const weightedSampleWithoutReplacement = <T extends { qualityScore: number }>(
        items: T[],
        k: number,
        exponent: number = 1.5
    ): T[] => {
        if (items.length <= k) return items.slice();
        // Efraimidis-Spirakis: key = rand^(1/weight), 상위 k 선택 = 품질 가중 샘플링
        const keyed = items.map(x => ({
            item: x,
            key: Math.pow(Math.random(), 1 / Math.max(0.0001, Math.pow(x.qualityScore, exponent))),
        }));
        keyed.sort((a, b) => b.key - a.key);
        return keyed.slice(0, k).map(e => e.item);
    };

    // 4-layer Stratified (100점 튜닝 — jaccard 73% 목표):
    //   Fixed:  상위 50개 절대 고정 (SSS 보장)
    //   A': rank 50~350 풀 (300) 에서 280개 가중 샘플링 → 93% 선택률 (다양성 조절)
    //   B:  rank 350~800 풀 (450) 에서 50개 탐색
    //   C:  rank 800+ 풀 에서 나머지 (롱테일)
    // 🔥 v2.28.0: Fixed 비율 동적 조정 (다양성 개선 — Jaccard 80%→52%)
    const fixedCount = Math.min(
        Math.max(3, Math.round(limit * 0.15)),
        Math.floor(targetSize * 0.125)
    );
    const aPrimeSize = Math.floor(targetSize * 0.70);
    const layerBSize = Math.floor(targetSize * 0.125);
    const layerCSize = targetSize - fixedCount - aPrimeSize - layerBSize;

    const fixedPool = allScored.slice(0, fixedCount);
    const aPrimePoolEnd = Math.min(allScored.length, fixedCount + Math.floor(aPrimeSize * 1.07));
    const bPoolEnd = Math.min(allScored.length, aPrimePoolEnd + Math.max(layerBSize * 9, 450));
    const aPrimePool = allScored.slice(fixedCount, aPrimePoolEnd);
    const bPool = allScored.slice(aPrimePoolEnd, bPoolEnd);
    const cPool = allScored.slice(bPoolEnd);

    const aPrime = weightedSampleWithoutReplacement(aPrimePool, aPrimeSize, 0.8); // 🔥 v2.28.0: 1.2→0.8 다양성↑
    const layerB = weightedSampleWithoutReplacement(bPool, layerBSize, 0.6);
    const layerC = weightedSampleWithoutReplacement(cPool, layerCSize, 0.3);
    const layerA = [...fixedPool, ...aPrime];

    // 최종 후보 = guaranteed + sampled (중복 제거, 품질순 정렬 복원)
    const seenCand = new Set<string>();
    const candidates: typeof allScored = [];
    for (const r of [...layerA, ...layerB, ...layerC]) {
        if (seenCand.has(r.keyword)) continue;
        seenCand.add(r.keyword);
        candidates.push(r);
    }
    candidates.sort((a, b) => b.qualityScore - a.qualityScore);

    diagnostic.candidates.actualSampled = candidates.length;

    if (candidates.length === 0) {
        emit('done', 100, '수집된 키워드 없음');
        return { timestamp: Date.now(), total: 0, tier, rows: [], byCategory: {}, bySource: {}, diagnostic };
    }

    emit('candidates', 20, `후보 ${candidates.length}개 선별 완료. 네이버 API 검증 시작...`);

    // 4. 네이버 검색량 + 문서수 일괄 조회 (50개씩 배치)
    const env = EnvironmentManager.getInstance().getConfig();
    const clientId = env.naverClientId || process.env['NAVER_CLIENT_ID'] || '';
    const clientSecret = env.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '';

    if (!clientId || !clientSecret) {
        // API 키 없으면 검증 없이 반환 (실측 값 없음 → null로 표시)
        const rows: RichKeywordRow[] = candidates.slice(0, limit).map((c, idx) => {
            const cat = classifyForFeed(c.keyword);
            return {
                rank: idx + 1,
                keyword: c.keyword,
                category: cat.label,
                categoryIcon: cat.icon,
                grade: '' as const,
                searchVolume: 0,
                documentCount: 0,
                goldenRatio: 0,
                cpc: null,
                freshness: judgeFreshness(c.keyword, c.sources),
                sources: c.sources,
                sourceCount: c.sources.length,
                purchaseIntent: 0,
                isBlueOcean: false,
            };
        });
        return { timestamp: Date.now(), total: rows.length, tier, rows, byCategory: countBy(rows, 'category'), bySource: countSources(rows) };
    }

    const enrichedRows: RichKeywordRow[] = [];
    // 🔥 v2.32.1: 데이터 정확성 최우선 — rate-limit 회피
    //   기존 batch 40 × 병렬 10 × 내부 concurrency 8 = 최대 80 동시 요청 → rate-limit → scrapeFallback 오염
    //   신규 batch 40 × 병렬 5 × 내부 concurrency 3 = 최대 15 동시 요청 → API 성공률 최우선
    const batchSize = 40;
    // v2.43.32: API 측정 동시 batch 5 → 10 (2배 속도)
    const PARALLEL_BATCHES = 10;
    const batches: typeof candidates[] = [];
    for (let i = 0; i < candidates.length; i += batchSize) {
        batches.push(candidates.slice(i, i + batchSize));
    }
    const totalBatches = batches.length;
    let completedBatches = 0;

    const processBatch = async (batch: typeof candidates) => {
        try {
            const sigs = await getNaverKeywordSearchVolumeSeparate(
                { clientId, clientSecret },
                batch.map(b => b.keyword),
                { includeDocumentCount: true }
            );

            for (const sig of sigs) {
                const seed = batch.find(b => b.keyword === sig.keyword);
                if (!seed) continue;

                const totalVolume = (sig.pcSearchVolume || 0) + (sig.mobileSearchVolume || 0);
                // 🔥 v2.24.1: 더 완화 — longtail 1, 원본 3 (결과 건수 복구)
                //   v2.24.0 에서 "< 10" → median 5 반환되므로 실질 컷은 이미 약간 완화됨
                const isLongtailDerived = (seed.sources || []).includes('longtail');
                const minVolume = isLongtailDerived ? 1 : 3;
                if (totalVolume < minVolume) continue;

                // 🔥 v2.28.0: dc=null 보존 — sv 기반 추정 문서수로 grade 기회 제공
                //   기존: dc=null → continue → 후보 절반 탈락 (API 응답 미제공 키워드 다수)
                //   신규: dc=null + sv>=30 이면 sv*0.5 로 추정 (보수적), sv<30 은 노이즈 컷
                const hasValidDocCount = sig.documentCount !== null && sig.documentCount !== undefined && sig.documentCount > 0;
                if (!hasValidDocCount && totalVolume < 30) continue;
                const docCount = hasValidDocCount
                    ? (sig.documentCount as number)
                    : Math.max(10, Math.round(totalVolume * 0.5));
                const goldenRatio = totalVolume / Math.max(1, docCount);

                const cat = classifyForFeed(sig.keyword);
                // 🔥 네이버 검색광고 API 실측 평균 입찰가 (더미 절대 금지)
                // 실측값이 0이거나 없으면 null — UI에서 "-"로 표시
                const realCpc = (typeof sig.monthlyAveCpc === 'number' && sig.monthlyAveCpc > 0) ? sig.monthlyAveCpc : null;
                const intent = calculatePurchaseIntent(sig.keyword);

                const scoringCpc = estimateCPC(sig.keyword, cat.id);
                const score = calculateScore(totalVolume, docCount, goldenRatio, scoringCpc, intent, sig.keyword);
                // 🔥 v2.32.1: dc 추정 여부를 grade 판정에 전달 — 추정값은 A 상한
                let grade: GoldenGrade | '' = calculateGrade(totalVolume, docCount, goldenRatio, score, sig.keyword, !hasValidDocCount);

                // v2.42.13 진단 카운터
                if (totalVolume > 0) diagnostic.naver.withValidSv++;
                if (hasValidDocCount) diagnostic.naver.withValidDc++; else diagnostic.naver.dcEstimated++;
                const _tokens = sig.keyword.trim().split(/\s+/).filter(Boolean).length;
                const _kClean = sig.keyword.trim();
                if (_tokens === 1 && GENERIC_BROAD_RE.test(_kClean)) diagnostic.writableAnalysis.singleTokenBroad++;
                else if (_tokens === 1 && GENERIC_ACTION_RE.test(_kClean)) diagnostic.writableAnalysis.singleTokenAction++;
                else if (_tokens === 2 && isTooGeneric2Token(_kClean)) diagnostic.writableAnalysis.twoTokenGeneric++;
                else if (_tokens === 1 && docCount > 500) diagnostic.writableAnalysis.singleTokenHighDc++;
                else diagnostic.writableAnalysis.passedWritable++;
                if (grade === 'SSS') diagnostic.grading.SSS++;
                else if (grade === 'SSR') diagnostic.grading.SSR++;
                else if (grade === 'SS') diagnostic.grading.SS++;
                else if (grade === 'S') diagnostic.grading.S++;
                else if (grade === 'A') diagnostic.grading.A++;
                else if (grade === 'B') diagnostic.grading.B++;
                else diagnostic.grading.filtered++;
                if (!grade && docCount > 0 && goldenRatio < 1.0) diagnostic.redOcean.ratioBelow1++;

                if (!grade) continue;

                // 🔥 v2.31.1: SSR 승격 경로 다양화 (5~15건 → 20~50건)
                //   확정 수익 키워드가 많아야 정상. 6가지 승격 경로로 커버리지 확대.
                const isCommercialKw = hasCommercialIntent(sig.keyword);
                const cpcVal = typeof realCpc === 'number' ? realCpc : 0;
                const isRevenueCat = isRevenueCategory(cat.id);
                const isSssOrAbove = grade === 'SSS';
                const isSsOrAbove = grade === 'SSS' || grade === 'SS';
                const isSOrAbove = grade === 'SSS' || grade === 'SS' || grade === 'S';

                // 🔥 v2.31.4: SSR 경로 단순화 (실전 적합, 0건 → 10~30건)
                //   기존 7경로 너무 빡빡 + CPC null 많아 SSS 확보에도 탈락.
                //   핵심만 4경로: 수익 카테고리 + commercial OR 고CPC.
                let isSsr = false;
                // 경로 1: SSS + commercial + 수익 카테고리 (가장 넓음 — CPC/토큰 무관)
                if (isSssOrAbove && isCommercialKw && isRevenueCat) isSsr = true;
                // 경로 2: SSS + 수익 카테고리 + 초저경쟁 dc≤2000 (commercial 없어도 신규 수익)
                else if (isSssOrAbove && isRevenueCat && docCount <= 2000) isSsr = true;
                // 경로 3: SS + commercial + 수익 카테고리 + dc≤3000 (SS 도 수익 조건 강하면)
                else if (isSsOrAbove && isCommercialKw && isRevenueCat && docCount <= 3000) isSsr = true;
                // 경로 4: 초고CPC ≥2000 + commercial (카테고리 무관 — 광고주 경쟁 치열)
                else if (isSOrAbove && cpcVal >= 2000 && isCommercialKw) isSsr = true;

                if (isSsr) grade = 'SSR';

                const isBlueOcean = totalVolume >= 300 && totalVolume <= 10000 && docCount <= 2000 && goldenRatio >= 5;

                enrichedRows.push({
                    rank: 0,
                    keyword: sig.keyword,
                    category: cat.label,
                    categoryId: cat.id, // v2.43.15: 카테고리 다양성 가산용
                    categoryIcon: cat.icon,
                    grade,
                    searchVolume: totalVolume,
                    documentCount: docCount,
                    goldenRatio: parseFloat(goldenRatio.toFixed(2)),
                    cpc: realCpc, // 🔥 실측 API 값 only (null 허용, 더미 금지)
                    freshness: judgeFreshness(sig.keyword, seed.sources),
                    sources: seed.sources,
                    sourceCount: seed.sources.length,
                    purchaseIntent: intent,
                    isBlueOcean,
                    dcEstimated: !hasValidDocCount, // 🔥 v2.41.0: 동적 SSS 승격 풀 신뢰도 가드용
                    // v2.43.25-26: 블로거 프로필 보정 + 사유 분해 (UI 칩용)
                    ...(() => {
                        const bd = calculateBloggerWritabilityBreakdown(sig.keyword, docCount, totalVolume);
                        const profileAdj = calculateProfileAffinity(sig.keyword, _bloggerProfile);
                        const expAdj = experienceAdjustment(docCount, _bloggerProfile);
                        const factors = [...bd.factors];
                        if (profileAdj > 0) factors.push({ delta: profileAdj, label: '내카테고리' });
                        else if (profileAdj < 0) factors.push({ delta: profileAdj, label: '카테고리외' });
                        if (expAdj < 0) factors.push({ delta: expAdj, label: '경험페널티' });
                        return {
                            bloggerWritability: Math.max(0, Math.min(100, bd.score + profileAdj + expAdj)),
                            writabilityFactors: factors,
                        };
                    })(),
                });
            }
        } catch (e: any) {
            console.warn('[rich-feed] 배치 실패:', e?.message);
        }
    };

    for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
        // 🔥 v2.27.5: 5분 하드캡 체크 — 초과 시 현재까지 수집된 것만 사용
        if (isExceeded()) {
            console.warn(`[rich-feed] ⏱️ 5분 하드캡 도달, ${i}/${batches.length} 배치에서 중단 — ${enrichedRows.length}건 수집`);
            emit('api', 85, `⏱️ 시간 한도 도달 — 수집된 ${enrichedRows.length}건으로 진행`);
            break;
        }
        const slice = batches.slice(i, i + PARALLEL_BATCHES);
        await Promise.all(slice.map(processBatch));
        completedBatches += slice.length;
        const batchPercent = 20 + Math.round((completedBatches / totalBatches) * 65);
        emit('api', batchPercent, `네이버 API 검증 ${completedBatches}/${totalBatches} (누적 ${enrichedRows.length}건)`);
        await new Promise(r => setTimeout(r, 50));
    }

    // 🔥 v2.42.14: Claude AI 추천으로 SSS 풀 보강 (사용자 옵션)
    //   - 28 소스 시드 풀이 한정적이라 자연 SSS 부족 발생
    //   - Claude가 카테고리 다양화된 SSS-targeted 키워드 50개 추천
    //   - 각 추천 → Naver 실측 → 관대 게이트(writable + ratio>=1)만 통과 시 SSS 추가
    //   - 정책 유지: redOcean 차단 + writable 검사. SSR/SSS only 노출.
    if ((options as any).aiAugmentation === 'claude' && clientId && clientSecret) {
        emit('ai-augment', 87, '🧠 Claude AI 추천 키워드 검증 중...');
        try {
            const claudeRows = await augmentWithClaude(50, { naverClientId: clientId, naverClientSecret: clientSecret });
            if (claudeRows.length > 0) {
                enrichedRows.push(...claudeRows);
                console.log(`[rich-feed v2.42.14] Claude augmentation: ${claudeRows.length}건 SSS 추가 (관대 게이트 통과)`);
                emit('ai-augment', 89, `🧠 Claude 추천 ${claudeRows.length}건 SSS 추가됨`);
            }
        } catch (e: any) {
            // v2.43.50: 529 overloaded 친화 메시지
            const msg = String(e?.message || '');
            const isOverloaded = msg.includes('529') || msg.toLowerCase().includes('overloaded');
            if (isOverloaded) {
                console.warn('[rich-feed v2.43.50] Claude 서버 과부하 (529) — Claude 보강 스킵, 다른 시드로 정상 진행');
                emit('ai-augment', 89, '⚠️ Claude 서버 과부하 — 보강 스킵 (다른 시드는 정상 진행)');
            } else {
                console.warn('[rich-feed] Claude augmentation 실패 (무시):', msg);
            }
        }
    }

    // v2.43.31: 빅워드 (sv 30K+) + 단일/2-token 조합 SSS 자격 박탈 (longtail 우선)
    let bigwordDowngraded = 0;
    for (const r of enrichedRows) {
        if (r.grade !== 'SSS' && r.grade !== 'SSR') continue;
        const tokens = String(r.keyword || '').trim().split(/\s+/).filter(Boolean).length;
        if (r.searchVolume >= 30000 && tokens <= 2) {
            r.grade = 'SS';
            bigwordDowngraded++;
        }
    }
    if (bigwordDowngraded > 0) {
        console.log(`[rich-feed v2.43.31] 빅워드 (sv≥30K + ≤2-token) SSS 강등: ${bigwordDowngraded}건`);
    }

    // v2.43.23: 친화도 강등 컷 25 → 40 상향 (품질 우선 — 사용자 비판 "영양가 없는 키워드만")
    //   캡처에서 친화도 22 (코오롱티슈진), 20 (CORTIS), 34 (구글 제미나이) 가 SSS 통과 → 명백히 부적합
    //   대량 발굴은 데이터 수집 단계로 보장하고, 등급은 진짜 글쓰기 좋은 것만 SSS 유지
    let writabilityDowngraded = 0;
    for (const r of enrichedRows) {
        const writability = typeof r.bloggerWritability === 'number' ? r.bloggerWritability : 50;
        if ((r.grade === 'SSS') && writability < 40) {
            r.grade = 'SS';
            writabilityDowngraded++;
        }
    }
    if (writabilityDowngraded > 0) {
        console.log(`[rich-feed v2.43.23] 친화도 < 40 SSS 강등: ${writabilityDowngraded}건`);
    }

    // 🔥 v2.41.0: 분포 기반 동적 SSS 승격 (필터 전)
    //   사용자 정책: SSS-only 화면 + SSS 절대 수 대량 보장.
    //   안전 풀: writable + 실측 dc + ratio>=1 통과한 SS/S/A 중 dynamicSssScore 상위 N개를 SSS 로 승격.
    //   dcEstimated 행은 신뢰도 낮아 풀 제외. SSR 은 SSS superset 이라 그대로 유지.
    //   pro-traffic-keyword-hunter v2.40.5 의 검증된 점수 식 차용 (grScore×0.55 + svScore×0.30 + dcScore×0.15).
    const sssCount = enrichedRows.filter(r => r.grade === 'SSS' || r.grade === 'SSR').length;
    // v2.43.24 (사이클#1 1팀): TARGET_SSS floor 제거 — 강제 승격이 가짜 SSS 양산하는 사이클 차단
    //   이전: max(150, limit*0.5) → 무조건 150개 채우기 → 친화도 25 까지 풀어줌
    //   변경: floor 없음. 자연 통과 + 1차 promotion 만. 부족하면 "오늘 N개" 정직 표시
    const TARGET_SSS = Math.min(60, Math.floor(limit * 0.2));
    diagnostic.promotion.poolSize = 0; // updated below if promotion runs
    if (sssCount < TARGET_SSS) {
        // 🔥 v2.41.2: 진짜 SSS = 저경쟁 + 중수요 + 높은 비율 (CLAUDE.md 정의)
        //   기존 svScore 가중치 30% 가 sv 폭주 키워드(챗GPT 무료 sv 117K 등)를 우대해 SSS 라벨 오염.
        //   풀 진입에서 sv/dc 상한 + 점수식 재설계로 진짜 황금만 승격.
        // 🔥 v2.42.11: 게이트 완화 — '0개 결과' 사용자 신고 후 풀 약 3배 확장
        //   유지 정책: SSR/SSS only 노출 + ratio<1 레드오션 차단 + commercial 우선
        //   완화 사유: dc<=5000 / sv 1000~10000 / ratio>=3 너무 엄격해 promotion pool 자주 0
        //   참조: feedback_result_count_floor — "SSS 절대 수 풀 확장+게이트 캘리브레이션으로 늘려라"
        const promotionPool = enrichedRows
            .filter(r => {
                // v2.43.18: dcEstimated 라도 친화도 70+ longtail 이면 promotion 풀 진입 허용
                //   완전 차단 → SSS 풀이 너무 작아짐 (한국 환경 dc=null 비율 40-60%)
                //   품질 가드: 친화도 70+ AND 2+ tokens AND commercial intent 필수
                const tokenCount = String(r.keyword || '').trim().split(/\s+/).filter(Boolean).length;
                if (tokenCount === 1) return false;

                // ★ v2.49.7: sv*0.5 fallback dc 정확 매칭 차단 (가짜 SSS 진입 금지)
                //   사용자 보고: TOP 20 SSS 중 18건이 ratio 정확히 2.00 = sv/dc=2 = dc=sv*0.5 추정값
                //   calculateGrade 의 sanity gate 가 적용됐지만 promotion 이 우회 → 여기서 추가 차단
                if (r.documentCount > 0 && r.searchVolume > 0) {
                    const halfSvRatio = r.documentCount / (r.searchVolume * 0.5);
                    if (halfSvRatio >= 0.95 && halfSvRatio <= 1.05) return false;
                }

                const writability = typeof r.bloggerWritability === 'number' ? r.bloggerWritability : 50;
                if (r.dcEstimated) {
                    // 추정값은 보수적 가드 (친화도 70+ 필수)
                    if (writability < 70) return false;
                    if (!hasCommercialIntent(r.keyword)) return false;
                } else {
                    // v2.49.7: 실측 풀 확장 — 친화도 35 → 30 (사용자 메모리 "대량 보장")
                    if (writability < 30) return false;
                }
                // v2.43.31: longtail 우선 — sv 200~30K, 빅워드는 promotion 풀 진입 불가
                const tokens = String(r.keyword || '').trim().split(/\s+/).filter(Boolean).length;
                if (tokens >= 1 && tokens <= 2 && r.searchVolume >= 30000) return false; // 빅워드 차단
                return (
                    (r.grade === 'SS' || r.grade === 'S' || r.grade === 'A') &&
                    r.searchVolume >= 200 &&
                    r.searchVolume <= 30000 &&
                    // v2.49.7: 실측 dc 게이트 완화 — ratio 1.3 → 1.15, maxDc 12000 → 15000 (풀 확장)
                    (r.dcEstimated ? r.goldenRatio >= 2.0 : (r.documentCount > 0 && r.documentCount <= 15000 && r.goldenRatio >= 1.15))
                );
            })
            .map(r => {
                const dcScore = r.documentCount <= 1000 ? 100 :
                    r.documentCount <= 2000 ? 85 :
                    r.documentCount <= 3000 ? 70 :
                    r.documentCount <= 5000 ? 50 :
                    r.documentCount <= 10000 ? 30 : 0;
                const grScore = Math.min(100, r.goldenRatio * 15);
                const sv = r.searchVolume;
                const svScore = sv >= 1000 && sv <= 10000 ? 100 :
                    sv >= 500 && sv < 1000 ? 60 :
                    sv > 10000 && sv <= 30000 ? 70 :
                    0;
                const writability = typeof r.bloggerWritability === 'number' ? r.bloggerWritability : 50;
                let baseScore = dcScore * 0.30 + grScore * 0.25 + svScore * 0.15 + writability * 0.30;
                if (r.dcEstimated) baseScore *= 0.7;
                return { row: r, baseScore };
            })
            .sort((a, b) => b.baseScore - a.baseScore);

        // v2.43.15: 카테고리 다양성 라운드로빈 승격
        //   이전: baseScore 상위 N개만 뽑아서 한 카테고리가 30+ SSS 독식 → 사용자 "카테고리 한쪽 쏠림" 신고
        //   변경: 라운드 1 — 각 카테고리에서 best 1개씩, 라운드 2 — best 2번째씩, ...
        //   결과: 30개 카테고리에서 SSS가 골고루 분포. 한 카테고리당 max ≈ TARGET_SSS / 카테고리수 + 잔여
        const need = TARGET_SSS - sssCount;
        // v2.43.17: 카테고리당 cap 완화 — 4→8, 다양성 유지하되 대량 발굴 가능
        const MAX_PER_CATEGORY_HARD = Math.max(8, Math.ceil(need / 4));

        // 기존 자연 SSS 의 카테고리 카운트 (라운드로빈 시작 시 가중치)
        const sssCategoryCount = new Map<string, number>();
        // v2.43.19: brand prefix 카운트 — 첫 토큰 동일 키워드 cap 3 (동아제약 9개 쏠림 방지)
        const brandPrefixCount = new Map<string, number>();
        const BRAND_PREFIX_CAP = 3;
        const getBrandPrefix = (kw: string): string => {
            const tokens = String(kw || '').trim().split(/\s+/).filter(Boolean);
            return tokens.length >= 2 ? tokens[0].toLowerCase() : '';
        };
        for (const r of enrichedRows) {
            if (r.grade === 'SSS' || r.grade === 'SSR') {
                const cid = r.categoryId || 'all';
                sssCategoryCount.set(cid, (sssCategoryCount.get(cid) || 0) + 1);
                const prefix = getBrandPrefix(r.keyword);
                if (prefix) brandPrefixCount.set(prefix, (brandPrefixCount.get(prefix) || 0) + 1);
            }
        }

        // 카테고리별 후보 큐 구성
        const byCat = new Map<string, Array<{ row: RichKeywordRow; baseScore: number }>>();
        for (const e of promotionPool) {
            const cid = e.row.categoryId || 'all';
            if (!byCat.has(cid)) byCat.set(cid, []);
            byCat.get(cid)!.push(e);
        }

        // 라운드로빈 + score 기반 fairness: 다양한 카테고리에서 골고루 뽑되 점수 너무 낮은 건 제외
        const promotionTargets: Array<{ row: RichKeywordRow; baseScore: number; cid: string }> = [];
        // round-robin 라운드 수: max 카테고리 큐 크기 만큼
        const maxQueueSize = Math.max(0, ...Array.from(byCat.values()).map(q => q.length));
        for (let round = 0; round < maxQueueSize && promotionTargets.length < need; round++) {
            // 카테고리 순서: 현재 SSS 적은 카테고리 우선 (다양성 강화)
            const sortedCats = Array.from(byCat.keys()).sort((a, b) => {
                const aCnt = (sssCategoryCount.get(a) || 0);
                const bCnt = (sssCategoryCount.get(b) || 0);
                return aCnt - bCnt;
            });
            for (const cid of sortedCats) {
                if (promotionTargets.length >= need) break;
                const queue = byCat.get(cid)!;
                if (round >= queue.length) continue;
                if ((sssCategoryCount.get(cid) || 0) >= MAX_PER_CATEGORY_HARD) continue;
                const entry = queue[round];
                // v2.43.19: brand prefix cap — 한 브랜드/첫토큰 최대 3개
                const prefix = getBrandPrefix(entry.row.keyword);
                if (prefix && (brandPrefixCount.get(prefix) || 0) >= BRAND_PREFIX_CAP) continue;
                promotionTargets.push({ ...entry, cid });
                sssCategoryCount.set(cid, (sssCategoryCount.get(cid) || 0) + 1);
                if (prefix) brandPrefixCount.set(prefix, (brandPrefixCount.get(prefix) || 0) + 1);
            }
        }

        // 실제 승격 적용 — v2.49.10: sanity-gate.ts SSoT 통과 행만 SSS 부여
        const { validateGrade, applySanity } = require('../sanity-gate');
        let promotionBlocked = 0;
        for (const t of promotionTargets) {
            const sanity = validateGrade({
                keyword: t.row.keyword,
                searchVolume: t.row.searchVolume,
                documentCount: t.row.documentCount,
                goldenRatio: t.row.goldenRatio,
                score: t.baseScore,
                dcEstimated: t.row.dcEstimated,
                source: 'rich-feed',
            });
            const finalGrade = applySanity('SSS', sanity);
            t.row.grade = finalGrade;
            t.row.dcEstimated = sanity.estimatedFlags.dc;  // 동기화
            if (finalGrade !== 'SSS') promotionBlocked++;
        }
        if (promotionBlocked > 0) {
            console.log(`[rich-feed v2.49.10] promotion sanity 통과: ${promotionTargets.length - promotionBlocked}/${promotionTargets.length} (${promotionBlocked}건 강등)`);
        }

        // v2.43.20-21: TARGET_SSS 미달 시 3-tier FALLBACK 라운드
        let totalPromoted = promotionTargets.length;

        const runFallbackTier = (tierName: string, opts: {
            minWritability: number;
            minSv: number;
            maxSv: number;
            minRatioMeasured: number;
            minRatioEstimated: number;
            maxDc: number;
            minWritabilityEstimated: number;
            categoryCap: number;
            brandCap: number;
            allowSingleToken: boolean;
        }): number => {
            const remaining = need - totalPromoted;
            if (remaining <= 0) return 0;
            const usedKeys = new Set<string>();
            for (const r of enrichedRows) {
                if (r.grade === 'SSS' || r.grade === 'SSR') usedKeys.add(r.keyword);
            }
            const fallbackPool = enrichedRows
                .filter(r => {
                    if (r.grade === 'SSS' || r.grade === 'SSR') return false;
                    if (usedKeys.has(r.keyword)) return false;
                    const tokenCount = String(r.keyword || '').trim().split(/\s+/).filter(Boolean).length;
                    if (tokenCount === 1 && !opts.allowSingleToken) return false;
                    const writability = typeof r.bloggerWritability === 'number' ? r.bloggerWritability : 50;
                    if (writability < opts.minWritability) return false;
                    if (r.dcEstimated && writability < opts.minWritabilityEstimated) return false;

                    // ★ v2.49.7: sv*0.5 fallback dc 정확 매칭 차단 (가짜 SSS 진입 금지)
                    if (r.documentCount > 0 && r.searchVolume > 0) {
                        const halfSvRatio = r.documentCount / (r.searchVolume * 0.5);
                        if (halfSvRatio >= 0.95 && halfSvRatio <= 1.05) return false;
                    }

                    return (
                        (r.grade === 'SS' || r.grade === 'S' || r.grade === 'A') &&
                        r.searchVolume >= opts.minSv &&
                        r.searchVolume <= opts.maxSv &&
                        (r.dcEstimated ? r.goldenRatio >= opts.minRatioEstimated : (r.documentCount > 0 && r.documentCount <= opts.maxDc && r.goldenRatio >= opts.minRatioMeasured))
                    );
                })
                .map(r => ({
                    row: r,
                    writability: typeof r.bloggerWritability === 'number' ? r.bloggerWritability : 50,
                }))
                .sort((a, b) => b.writability - a.writability);

            // v2.49.10: fallback tier 도 sanity-gate.ts SSoT 통과 행만 SSS 부여
            const { validateGrade: vg, applySanity: as } = require('../sanity-gate');
            let promoted = 0;
            for (const f of fallbackPool) {
                if (promoted >= remaining) break;
                const cid = f.row.categoryId || 'all';
                if ((sssCategoryCount.get(cid) || 0) >= opts.categoryCap) continue;
                const prefix = getBrandPrefix(f.row.keyword);
                if (prefix && (brandPrefixCount.get(prefix) || 0) >= opts.brandCap) continue;
                const sanity = vg({
                    keyword: f.row.keyword,
                    searchVolume: f.row.searchVolume,
                    documentCount: f.row.documentCount,
                    goldenRatio: f.row.goldenRatio,
                    score: f.writability,
                    dcEstimated: f.row.dcEstimated,
                    source: 'rich-feed',
                });
                const finalGrade = as('SSS', sanity);
                f.row.grade = finalGrade;
                f.row.dcEstimated = sanity.estimatedFlags.dc;
                if (finalGrade !== 'SSS') continue;  // SSoT 차단 시 다음 fallback 후보로
                promoted++;
                totalPromoted++;
                sssCategoryCount.set(cid, (sssCategoryCount.get(cid) || 0) + 1);
                if (prefix) brandPrefixCount.set(prefix, (brandPrefixCount.get(prefix) || 0) + 1);
            }
            if (promoted > 0) {
                console.log(`[rich-feed v2.43.21] ${tierName}: ${promoted}건 추가 (누적 ${totalPromoted}/${need})`);
            }
            return promoted;
        };

        // v2.43.23: Tier 2/3 폐기. Tier 1만 유지하되 친화도 40+ (이전 30+) 상향
        //   사용자 비판: "영양가 없는 키워드만 나온다" — Tier 2/3 가 친화도 25/20 까지 풀어줘서 가짜 SSS 양산
        //   품질 우선 정책: 친화도 40+ 만 SSS 자격, 결과 수 부족은 데이터 수집 단계로 별도 보강
        runFallbackTier('FALLBACK', {
            minWritability: 40, minSv: 100, maxSv: 30000,   // v2.43.31: 100K → 30K (빅워드 차단)
            minRatioMeasured: 1.1, minRatioEstimated: 1.5,
            maxDc: 15000, minWritabilityEstimated: 65,      // 30K → 15K (저경쟁)
            categoryCap: MAX_PER_CATEGORY_HARD, brandCap: BRAND_PREFIX_CAP,
            allowSingleToken: false,
        });

        diagnostic.promotion.poolSize = promotionPool.length;
        diagnostic.promotion.promoted = totalPromoted;
        const distribution = Array.from(sssCategoryCount.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([k, v]) => `${k}:${v}`)
            .join(' ');
        console.log(`[rich-feed v2.43.20] 카테고리 다양성 승격 완료: 풀 ${promotionPool.length} → ${totalPromoted}건 (TARGET ${TARGET_SSS}, cap/cat ${MAX_PER_CATEGORY_HARD}) 분포 [${distribution}]`);
    }

    // 🔥 v2.41.0: SSR + SSS only 화면 (사용자 정책 — 다층 노출 금지)
    const highGradeOnly = enrichedRows.filter(r =>
        r.grade === 'SSR' || r.grade === 'SSS'
    );
    enrichedRows.length = 0;
    enrichedRows.push(...highGradeOnly);

    // v2.43.49: 사용자가 명시적으로 제외한 키워드 차단
    try {
        const { getExcludedKeywords } = await import('../user-behavior-learning');
        const excluded = getExcludedKeywords();
        if (excluded.size > 0) {
            const before = enrichedRows.length;
            const survivors = enrichedRows.filter(r => !excluded.has(r.keyword));
            const removed = before - survivors.length;
            if (removed > 0) {
                enrichedRows.length = 0;
                enrichedRows.push(...survivors);
                console.log(`[rich-feed v2.43.49] 사용자 제외 키워드 ${removed}건 차단`);
            }
        }
    } catch (e: any) {
        console.warn('[rich-feed v2.43.49] excluded 차단 실패:', e?.message);
    }

    emit('grading', 88, `SSS-only 필터 적용 (${enrichedRows.length}건)...`);

    // v2.43.28-29: 네이버 데이터랩 30일 추세 검증
    //   v2.43.28: dead keyword 즉시 제외 → 사용자 우려 "결과 0건 되면 곤란"
    //   v2.43.29 안전장치: dead 제외 후 최소 20건 유지. 부족하면 마커만 적용하고 결과 유지
    try {
        const envCfg: any = EnvironmentManager.getInstance().getConfig();
        const datalabConfig = { clientId: envCfg.naverClientId || '', clientSecret: envCfg.naverClientSecret || '' };
        if (datalabConfig.clientId && datalabConfig.clientSecret && enrichedRows.length > 0) {
            const { checkKeywordsRecency } = await import('../naver-datalab-api');
            const toCheck = enrichedRows.slice(0, 60);
            emit('verify-recency', 89, `최근 30일 추세 실측 검증 — ${toCheck.length}건...`);
            const recencyMap = await checkKeywordsRecency(datalabConfig, toCheck.map(r => r.keyword));

            // 모든 행에 recencyStatus 마커 적용 (제외 여부와 무관)
            for (const r of enrichedRows) {
                const rec = recencyMap.get(r.keyword);
                if (rec) r.recencyStatus = rec.status;
            }

            // dead 제외 시뮬레이션 → 최소 결과 보장 안전장치
            const MIN_RESULTS_FLOOR = 20;
            const liveRows = enrichedRows.filter(r => r.recencyStatus !== 'dead');
            const deadCount = enrichedRows.length - liveRows.length;

            if (liveRows.length >= MIN_RESULTS_FLOOR || deadCount === 0) {
                // 충분히 남았으면 dead 제외 적용
                enrichedRows.length = 0;
                enrichedRows.push(...liveRows);
                console.log(`[rich-feed v2.43.29] 추세 검증: ${deadCount}건 dead 제외, ${enrichedRows.length}건 잔존`);
                if (deadCount > 0) emit('verify-recency', 89, `dead 키워드 ${deadCount}건 자동 제외 (최근 7일 검색 거의 0)`);
            } else {
                // 결과 부족 시 dead 도 유지 (마커만 표시) — "결과 0건" 방지
                console.log(`[rich-feed v2.43.29] dead 제외 시 ${liveRows.length}건 < 최소 ${MIN_RESULTS_FLOOR}건 → 전부 유지하되 마커만 표시 (dead ${deadCount}건)`);
                emit('verify-recency', 89, `결과 부족(${liveRows.length}건) → dead 제외 안 함, 마커만 표시`);
            }
        } else {
            console.warn('[rich-feed v2.43.29] 네이버 API 키 없음 — 추세 검증 스킵');
        }
    } catch (e: any) {
        console.warn('[rich-feed v2.43.29] 추세 검증 실패 (계속 진행):', e?.message);
    }

    // 🔥 v2.42.22: 모든 SSS/SSR 후보에 dc 강제 scrape 재검증 (200 limit 제거 + 무조건 신뢰)
    //   사용자 재신고: "황금키워드 나와도 dc 안 맞아". v2.42.21로 부족했던 부분:
    //     1) enrichedRows > 200이면 verify 스킵 ❌ → 제거
    //     2) 2x threshold는 너무 보수적 (1.5x 미만 차이도 사용자에게 wrong) → 항상 scrape 채택
    //     3) persistent cache 업데이트 안 함 → 다음 호출에 옛 API 값 재사용 → cache write 추가
    //   비용: SSS/SSR 후보 50~300건 × 1초 = 50~300초. 6분 하드캡 내 흡수.
    if (enrichedRows.length > 0) {
        // v2.43.32: dc scrape 재검증을 dcEstimated=true 행에만 한정 + 상위 80건만
        //   사용자 요구: "최대한 빠르고 정확하면서 안정적이게"
        //   실측 dc 행은 이미 신뢰. 추정값 (sv*0.5 fallback) 행만 재검증 필요
        // v2.43.52: persistent cache read-first — 24h 내 측정값 있으면 스크래핑 skip
        let persistentGet: ((k: string) => any) | null = null;
        let persistentSet: ((k: string, e: any) => void) | null = null;
        try {
            const pc = await import('../persistent-keyword-cache');
            persistentGet = pc.getPersistent;
            persistentSet = pc.setPersistent;
        } catch {}

        const FRESH_DC_MS = 24 * 60 * 60 * 1000;
        let cacheHits = 0;
        const initialNeeds = enrichedRows.filter(r => r.dcEstimated);
        // 캐시 적중 즉시 반영
        if (persistentGet) {
            for (const r of initialNeeds) {
                const cached = persistentGet(r.keyword);
                if (cached && cached.documentCount > 0 && (Date.now() - (cached.savedAt || 0) < FRESH_DC_MS)) {
                    r.documentCount = cached.documentCount;
                    r.goldenRatio = parseFloat((r.searchVolume / Math.max(1, cached.documentCount)).toFixed(2));
                    (r as any).dcEstimated = false;
                    cacheHits++;
                }
            }
        }
        const needsVerify = enrichedRows.filter(r => r.dcEstimated).slice(0, 80);
        emit('verify-dc', 88, `dc 정확성 검증 (캐시 ${cacheHits}건 적중, 스크래핑 ${needsVerify.length}건)...`);
        // v2.43.52: 4팀 권고 — 동시성 16→20, timeout 2500→2000ms AbortController hard deadline
        const VERIFY_CONCURRENCY = 20;
        const SCRAPE_TIMEOUT = 2000;
        let verified = 0;
        let corrected = 0;
        let demoted = 0;

        const scrapeWebDc = async (kw: string): Promise<number | null> => {
            const ctrl = new AbortController();
            const hardKill = setTimeout(() => ctrl.abort(), SCRAPE_TIMEOUT);
            try {
                const axiosMod = await import('axios');
                const axios = axiosMod.default;
                const url = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(kw)}`;
                const resp = await axios.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml',
                        'Accept-Language': 'ko-KR,ko;q=0.9',
                    },
                    timeout: SCRAPE_TIMEOUT,
                    signal: ctrl.signal as any,
                });
                const html = String(resp.data || '');
                // 다중 패턴: "1-10 / 16,681건" / "16,681건" / "총 16,681건" / "(16,681)"
                const patterns = [
                    /\d+-\d+\s*\/\s*([0-9,]+)\s*건/,   // "1-10 / 16,681건"
                    /총\s*([0-9,]+)\s*건/,               // "총 16,681건"
                    /약\s*([0-9,]+)\s*건/,               // "약 16,681건"
                    /([0-9,]+)\s*건/,                    // fallback "16,681건"
                ];
                for (const p of patterns) {
                    const m = html.match(p);
                    if (m && m[1]) {
                        const n = parseInt(m[1].replace(/,/g, ''), 10);
                        if (Number.isFinite(n) && n > 0) return n;
                    }
                }
                return null;
            } catch {
                return null;
            } finally {
                clearTimeout(hardKill);
            }
        };

        for (let i = 0; i < needsVerify.length; i += VERIFY_CONCURRENCY) {
            if (isExceeded()) {
                console.warn(`[rich-feed v2.43.32] dc 검증 timeout — ${verified}/${needsVerify.length} 처리 후 중단`);
                break;
            }
            const batch = needsVerify.slice(i, i + VERIFY_CONCURRENCY);
            await Promise.all(batch.map(async (r) => {
                if ((r as any).claudeDiscovered || (r as any).discoveredByManus) return; // 별도 검증 경로
                const scraped = await scrapeWebDc(r.keyword);
                if (scraped !== null && scraped > 0) {
                    verified++;
                    // v2.42.22: 항상 scrape 신뢰 — 차이 1.2배 이상이면 보정 (API은 항상 undercount 경향)
                    if (scraped > r.documentCount * 1.2 || scraped < r.documentCount / 1.2) {
                        const oldDc = r.documentCount;
                        const oldRatio = r.goldenRatio;
                        r.documentCount = scraped;
                        r.goldenRatio = parseFloat((r.searchVolume / Math.max(1, scraped)).toFixed(2));
                        (r as any).dcEstimated = false; // 실측 데이터로 확정
                        corrected++;
                        // persistent cache 업데이트 (다음 호출에서 옛값 재사용 차단)
                        if (persistentSet && r.searchVolume > 0) {
                            try {
                                persistentSet(r.keyword, {
                                    searchVolume: r.searchVolume,
                                    documentCount: scraped,
                                    realCpc: r.cpc,
                                    compIdx: null,
                                });
                            } catch {}
                        }
                        if (r.goldenRatio < 1.0) {
                            (r as any).grade = '';
                            demoted++;
                            console.log(`[rich-feed v2.42.22] dc 강등 "${r.keyword}": ${oldDc}→${scraped}, ratio ${oldRatio.toFixed(2)}→${r.goldenRatio} (redOcean)`);
                        } else {
                            console.log(`[rich-feed v2.42.22] dc 보정 "${r.keyword}": ${oldDc}→${scraped}, ratio ${oldRatio.toFixed(2)}→${r.goldenRatio}`);
                        }
                    }
                }
            }));
            const pct = 88 + Math.round((Math.min(i + VERIFY_CONCURRENCY, enrichedRows.length) / enrichedRows.length) * 3);
            emit('verify-dc', pct, `dc 검증 ${Math.min(i + VERIFY_CONCURRENCY, enrichedRows.length)}/${enrichedRows.length} (보정 ${corrected}, 강등 ${demoted})`);
        }

        const stillHighGrade = enrichedRows.filter(r => r.grade === 'SSR' || r.grade === 'SSS');
        enrichedRows.length = 0;
        enrichedRows.push(...stillHighGrade);

        console.log(`[rich-feed v2.42.22] ✅ dc 검증 완료: ${verified}/${enrichedRows.length + demoted}건 검사, ${corrected}건 보정, ${demoted}건 redOcean 강등 (cache 동기화)`);
        emit('verify-dc', 91, `✅ dc 실측 완료 — 가짜 SSS ${demoted}건 제거, 최종 ${enrichedRows.length}건`);

        // ★ v2.49.5: AI 브리핑 실측 detection — SSS 후보에 한해서만 추가 호출 (효율)
        //   사용자 요구: 검·경·실·AI 4단계 공식의 마지막 "AI" 단계.
        //   AI 브리핑 떴음 → 사용자가 답을 거기서 읽고 끝, 블로그 클릭 X → SSS 부적합.
        //   메모리 규칙: 추정값 UI 노출 금지. 본 검증은 페이지 HTML 매칭사실 → boolean (실측).
        // v2.49.6: 범위 SSS top 100 → SSS+SS 전체 (top 300). 사용자 요구: "AI 미점령만으로 SSS 풀 구성"
        try {
            const { detectAiBriefingBatch } = await import('../ai-briefing-detector');
            const aiCandidates = enrichedRows
                .filter(r => r.grade === 'SSS' || r.grade === 'SSR' || r.grade === 'SS')
                .slice(0, 300);
            if (aiCandidates.length > 0) {
                emit('verify-ai', 92, `🤖 AI 브리핑 실측 ${aiCandidates.length}건 (검·경·실·AI 4단계 최종)...`);
                const detectionMap = await detectAiBriefingBatch(aiCandidates.map(r => r.keyword), 8);
                let aiDemoted = 0;
                let aiClean = 0;
                for (const r of aiCandidates) {
                    const detected = detectionMap.get(r.keyword);
                    (r as any).aiBriefingDetected = detected === true;
                    if (detected === true) {
                        if (r.grade === 'SSS' || r.grade === 'SSR') {
                            (r as any).grade = 'SS';
                            aiDemoted++;
                        }
                    } else if (detected === false) {
                        aiClean++;
                    }
                }
                console.log(`[rich-feed v2.49.6] ✅ AI 브리핑 실측 완료: ${aiCandidates.length}건 중 ${aiClean}건 미점령, ${aiDemoted}건 SSS→SS 강등`);
                emit('verify-ai', 93, `✅ AI 브리핑 실측 완료 — 미점령 ${aiClean}건, 강등 ${aiDemoted}건`);
            }
        } catch (aiErr: any) {
            console.warn('[rich-feed v2.49.6] AI 브리핑 detection 실패 (무시):', aiErr?.message);
        }
    }

    // 5. 정렬 (등급 → AI 미점령 우선 → 기회지수 → 소스 수)
    //   v2.49.6: 같은 등급 내에서 AI 미점령(aiBriefingDetected=false)을 위로 올림.
    //   사용자 의도: 상위 노출 + 실제 트래픽 두 마리 토끼.
    const gradeOrder: Record<string, number> = { SSR: 6, SSS: 5, SS: 4, S: 3, A: 2, B: 1 };
    enrichedRows.sort((a, b) => {
        const ga = gradeOrder[a.grade] || 0;
        const gb = gradeOrder[b.grade] || 0;
        if (ga !== gb) return gb - ga;
        // AI 미점령 우선 (false < true → false 가 먼저)
        const aiA = (a as any).aiBriefingDetected === true ? 1 : 0;
        const aiB = (b as any).aiBriefingDetected === true ? 1 : 0;
        if (aiA !== aiB) return aiA - aiB;
        const grA = Math.round(a.goldenRatio * 10) / 10;
        const grB = Math.round(b.goldenRatio * 10) / 10;
        if (grA !== grB) return grB - grA;
        if (a.sourceCount !== b.sourceCount) return b.sourceCount - a.sourceCount;
        return Math.random() - 0.5; // 동률이면 랜덤
    });

    const top = enrichedRows.slice(0, limit).map((r, idx) => ({ ...r, rank: idx + 1 }));

    // v2.43.35 (Phase 2): 발굴된 키워드 + baseSeeds 후보 풀 전체를 tracking-store에 자동 주입
    //   1팀 비평: "surge-detector autoScan 이 listTrackedKeywords().slice(0, 20) 만 스캔.
    //   외부 trending 자동 주입 파이프라인 부재" → 발굴 결과를 tracking-store 동적 풀에 합류
    try {
        const { bulkRegisterTrending } = await import('../pro-hunter-v12/tracking-store');
        const trackingItems = [
            ...top.map(r => ({ keyword: r.keyword, docCount: r.documentCount, searchVolume: r.searchVolume })),
            // 풀 다양성: enrichedRows 전체에서 SSS 미통과한 후보 + baseSeeds 일부도 등록
            ...enrichedRows
                .filter(r => !top.some(t => t.keyword === r.keyword))
                .slice(0, 100)
                .map(r => ({ keyword: r.keyword, docCount: r.documentCount, searchVolume: r.searchVolume })),
        ];
        const result = bulkRegisterTrending(trackingItems);
        console.log(`[rich-feed v2.43.35] tracking-store 자동 주입: +${result.added}, evicted ${result.evicted}, 총 ${result.totalSize}건`);
        emit('tracking-register', 99, `🔄 추적 풀 ${result.totalSize}건 (신규 +${result.added})`);
    } catch (e: any) {
        console.warn('[rich-feed v2.43.35] tracking 자동 주입 실패:', e?.message);
    }

    // v2.43.52: 9팀 — 트렌드 분류 top 15→10 (Datalab quota 절감 + 응답 시간 1/3)
    emit('trend', 92, `30일 트렌드 타입 분류 중 (상위 ${Math.min(top.length, 10)}건)...`);
    try {
        const { analyzeKeywordTrend } = require('../trend-type-classifier');
        if (clientId && clientSecret) {
            const trendTargets = top.slice(0, 10);
            const BATCH = 10;
            for (let i = 0; i < trendTargets.length; i += BATCH) {
                const batch = trendTargets.slice(i, i + BATCH);
                await Promise.all(batch.map(async (r: any) => {
                    try {
                        const { analysis } = await analyzeKeywordTrend(r.keyword, { clientId, clientSecret });
                        r.trendType = analysis.type;
                        r.trendLabel = analysis.label;
                        r.trendRecommendation = analysis.recommendation;
                    } catch {}
                }));
                emit('trend', 92 + Math.round((i / trendTargets.length) * 6),
                    `트렌드 분류 ${Math.min(i + BATCH, trendTargets.length)}/${trendTargets.length}`);
            }
        }
    } catch (e: any) {
        console.warn('[rich-feed] 트렌드 분류 실패:', e?.message);
    }

    diagnostic.final.afterSSROnlyFilter = enrichedRows.length;
    diagnostic.final.topNReturned = top.length;
    diagnostic.candidates.sentToNaver = candidates.length;
    diagnostic.promotion.naturalSSS = sssCount;
    diagnostic.promotion.targetSSS = TARGET_SSS;

    emit('done', 100, `완료 — ${top.length}건 발굴`);

    // v2.43.53: 발굴 종료 즉시 Puppeteer idle 브라우저 강제 종료 (펜 진정)
    try {
        const { browserPool } = await import('../puppeteer-pool');
        void browserPool.closeIdle();
    } catch {}

    return {
        timestamp: Date.now(),
        total: top.length,
        tier,
        rows: top,
        byCategory: countBy(top, 'category'),
        bySource: countSources(top),
        diagnostic,
    };
}

function countBy<T>(arr: T[], key: keyof T): Record<string, number> {
    const out: Record<string, number> = {};
    for (const item of arr) {
        const k = String((item as any)[key]);
        out[k] = (out[k] || 0) + 1;
    }
    return out;
}

function countSources(rows: RichKeywordRow[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const row of rows) {
        for (const src of row.sources) {
            out[src] = (out[src] || 0) + 1;
        }
    }
    return out;
}

let cached: { result: RichFeedResult; expiresAt: number } | null = null;
// 🔥 v2.20.1: 캐시 축소 — 매번 다른 키워드가 나오도록 신선도 우선
const CACHE_TTL = 3 * 60_000;         // 메모리 캐시: 15분→3분
const DISK_CACHE_TTL = 30 * 60_000;   // 디스크 캐시: 4시간→30분 (안전망용)
const MIN_ACCEPTABLE_TOTAL = 20;       // 이 미만이면 "실패"로 간주, 디스크 캐시 폴백
const CACHE_SCHEMA_VERSION = 'v2.49.8-sanity-gate';  // v2.49.8: sv*0.5 sanity gate + sanity-gate.ts 통일 layer 도입. 옛 캐시(v2.41.3) 무효화.

function getDiskCachePath(): string {
    // app.getPath 가 있으면 userData, 없으면 temp 사용 (테스트/개발 환경)
    // 동적 require로 Electron 없어도 로드 실패 안 하도록
    try {
        const { app } = require('electron');
        if (app?.getPath) {
            const path = require('path');
            return path.join(app.getPath('userData'), 'rich-feed-cache.json');
        }
    } catch {}
    const os = require('os');
    const path = require('path');
    return path.join(os.tmpdir(), 'leword-rich-feed-cache.json');
}

function readDiskCache(): RichFeedResult | null {
    try {
        const fs = require('fs');
        const file = getDiskCachePath();
        if (!fs.existsSync(file)) return null;
        const raw = fs.readFileSync(file, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.rows) || typeof parsed.timestamp !== 'number') return null;
        if (Date.now() - parsed.timestamp > DISK_CACHE_TTL) return null;
        // 스키마 버전 체크 — 블랙리스트 추가 등 필터 로직 변경 시 이전 캐시 폐기
        if (parsed.schemaVersion !== CACHE_SCHEMA_VERSION) {
            console.log('[rich-feed] 캐시 스키마 불일치 — 폐기 후 재빌드');
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

function writeDiskCache(result: RichFeedResult): void {
    try {
        const fs = require('fs');
        const payload = { ...result, schemaVersion: CACHE_SCHEMA_VERSION };
        fs.writeFileSync(getDiskCachePath(), JSON.stringify(payload), 'utf8');
    } catch (e: any) {
        console.warn('[rich-feed] 디스크 캐시 저장 실패:', e?.message);
    }
}

// v2.42.14: Claude AI 추천 + Naver 실측 + 관대 게이트 — SSS 풀 보강
async function augmentWithClaude(
    targetCount: number,
    env: { naverClientId: string; naverClientSecret: string }
): Promise<RichKeywordRow[]> {
    const { callAI } = await import('../pro-hunter-v12/ai-client');
    const prompt = `당신은 한국 네이버 블로그 SEO 전문가다.
한국 블로거가 글을 써서 트래픽을 모을 수 있는 SSS급 황금 키워드 ${targetCount}개를 추천하라.

SSS 기준:
- 한국어 자연 키워드 (주로 2-3 토큰)
- 검색량 충분 (월 300~30000) + 문서수 적절 (10000 이하)
- 검색량/문서수 비율 2 이상 = 상위 노출 가능
- 다양한 카테고리 분산 (건강·재무·뷰티·생활·기술·여행·교육·정책·라이프스타일)
- 너무 일반적이지 않은 구체 주제 ("적금" 단독 X, "20대 신용카드 추천" OK)

JSON 배열로만 응답 (코드블록 X, 다른 텍스트 X):
[
  {"keyword": "구체적 한국어 키워드", "reason": "왜 SSS급인지 1줄"}
]`;
    const result = await callAI(prompt, { maxTokens: 4096, temperature: 0.5 });

    let jsonText = result.text.trim();
    const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) jsonText = codeBlockMatch[1].trim();
    const startIdx = jsonText.indexOf('[');
    const endIdx = jsonText.lastIndexOf(']');
    if (startIdx < 0 || endIdx <= startIdx) {
        console.warn('[rich-feed] Claude 응답에 JSON 배열 없음');
        return [];
    }
    jsonText = jsonText.slice(startIdx, endIdx + 1);
    let suggestions: Array<{ keyword: string; reason?: string }>;
    try {
        suggestions = JSON.parse(jsonText);
    } catch (e: any) {
        console.warn('[rich-feed] Claude JSON 파싱 실패:', e?.message);
        return [];
    }
    if (!Array.isArray(suggestions) || suggestions.length === 0) return [];

    const reasonByKw = new Map<string, string>();
    const keywords = suggestions
        .map((s) => {
            const kw = String(s?.keyword || '').trim();
            if (kw && s?.reason) reasonByKw.set(kw, String(s.reason).slice(0, 200));
            return kw;
        })
        .filter(Boolean);
    if (keywords.length === 0) return [];

    const sigs = await getNaverKeywordSearchVolumeSeparate(
        { clientId: env.naverClientId, clientSecret: env.naverClientSecret },
        keywords,
        { includeDocumentCount: true }
    );

    const validated: RichKeywordRow[] = [];
    for (const sig of sigs) {
        const sv = (sig.pcSearchVolume || 0) + (sig.mobileSearchVolume || 0);
        const dc = sig.documentCount || 0;
        if (dc <= 0) continue;
        const ratio = sv / Math.max(1, dc);
        if (ratio < 1.0) continue;
        if (!isWritableKeyword(sig.keyword, dc, sv)) continue;

        const cat = classifyForFeed(sig.keyword);
        const cpcVal = typeof sig.monthlyAveCpc === 'number' && sig.monthlyAveCpc > 0 ? sig.monthlyAveCpc : null;

        // v2.49.10: Claude augment 도 sanity-gate.ts SSoT 통과 필수 (Manus 우선 정책 enforcement)
        //   메모리 규칙: "외부 AI 보강 시 Manus(open.manus.im) 1순위. Claude/GPT/Gemini API 대신"
        //   sanity-gate 가 source='claude' 행은 자동 SSS 차단 → 무조건 SS 이하로 강등.
        const { validateGrade: vgC, applySanity: asC } = require('../sanity-gate');
        const sanityC = vgC({
            keyword: sig.keyword, searchVolume: sv, documentCount: dc,
            goldenRatio: ratio, score: 80, source: 'claude',
        });
        const finalGradeC = asC('SSS', sanityC);

        validated.push({
            rank: 0,
            keyword: sig.keyword,
            category: cat.label,
            categoryIcon: cat.icon,
            grade: finalGradeC,  // claude source → sanity-gate 가 자동 강등 (SS 이하)
            searchVolume: sv,
            documentCount: dc,
            goldenRatio: parseFloat(ratio.toFixed(2)),
            cpc: cpcVal,
            freshness: 'STABLE',
            sources: ['claude'],
            sourceCount: 1,
            purchaseIntent: calculatePurchaseIntent(sig.keyword),
            isBlueOcean: ratio >= 5 && dc <= 2000,
            claudeDiscovered: true,
            claudeReason: reasonByKw.get(sig.keyword) || '',
        });
    }
    return validated;
}

export async function getCachedRichFeed(
    force: boolean = false,
    options: { tier?: SourceTier; limit?: number; aiAugmentation?: 'none' | 'claude' } = {},
    onProgress?: RichFeedProgressCallback
): Promise<RichFeedResult> {
    const now = Date.now();

    // 1) 메모리 캐시 (15분, force 아니면 우선)
    if (!force && cached && cached.expiresAt > now) {
        try { onProgress?.({ step: 'cache', percent: 100, message: `캐시 사용 (${cached.result.total}건)` }); } catch {}
        return cached.result;
    }

    // 2) 라이브 빌드 (aiAugmentation 옵션 함께 전달)
    const result = await buildRichFeed(options, onProgress);

    // 3) 성공적인 빌드 — 캐시 양쪽 저장
    if (result.total >= MIN_ACCEPTABLE_TOTAL) {
        cached = { result, expiresAt: now + CACHE_TTL };
        writeDiskCache(result);
        return result;
    }

    // 4) 빌드 실패/부족 — 디스크 캐시 폴백 (24h 내 성공 결과 재사용)
    const disk = readDiskCache();
    if (disk && disk.total >= MIN_ACCEPTABLE_TOTAL) {
        console.warn(`[rich-feed] 빌드 부족(total=${result.total}) → 디스크 캐시 폴백 (${Math.round((now - disk.timestamp) / 60000)}분 전 저장, ${disk.total}건)`);
        // 메모리에도 캐시 (다음 호출용)
        cached = { result: disk, expiresAt: now + CACHE_TTL };
        return disk;
    }

    // 5) 폴백도 없음 — 빌드 결과 그대로 반환 (적을 수 있음)
    cached = { result, expiresAt: now + CACHE_TTL };
    return result;
}

export function clearRichFeedCache(): void {
    cached = null;
    try {
        const fs = require('fs');
        const file = getDiskCachePath();
        if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch {}
}
