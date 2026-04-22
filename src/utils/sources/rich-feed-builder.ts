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
import { getKeywordTrend } from './source-storage';
import { getNaverKeywordSearchVolumeSeparate } from '../naver-datalab-api';
import { estimateCPC, calculatePurchaseIntent, calculateCompetitionLevel } from '../profit-golden-keyword-engine';
import { EnvironmentManager } from '../environment-manager';
import { classifyKeyword, getCategoryById } from '../categories';
import { getEvergreenSafetyNetSeeds } from './evergreen-safety-net';
import { buildIDFStats, scoreSeedKeyword, isQualitySeed } from './quality-extractor';

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
    // 🔥 v2.19.0 Phase L-2: 30일 트렌드 타입 (상위 30개만 분류됨)
    trendType?: 'evergreen' | 'skyrocket' | 'flash' | 'seasonal' | 'unknown';
    trendLabel?: string;
    trendRecommendation?: string;
}

export interface RichFeedResult {
    timestamp: number;
    total: number;
    tier: 'lite' | 'pro';
    rows: RichKeywordRow[];
    byCategory: Record<string, number>;
    bySource: Record<string, number>;
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
const GENERIC_BROAD_RE = /^(적금|예금|카드|대출|보험|투자|주식|펀드|ETF|연금|세금|건강|영양제|비타민|음식|요리|청소|여행|맛집|공부|운동|헬스|다이어트|뷰티|화장품|샴푸|선크림|의류|패션|가구|인테리어|네이버|구글|카카오|삼성|엘지|쿠팡|클로드|챗GPT|유튜브|인스타|페이스북|브랜드|제품|상품|서비스|리뷰|일본|미국|중국|한국|영국|독일|프랑스|이탈리아|러시아|인도|호주|캐나다|스페인|태국|베트남|유럽|아시아|동남아|북미|남미|중동|서울|부산|대구|인천|제주|강남|홍대|이태원|명동|성수|경기|강원|충청|전라|경상|국내|국외|해외|반려동물|돼지고기|소고기|닭고기|생선|아파트|빌라|오피스텔|주식종류|레고|정부|로마|청약|영화|드라마|음악|게임|애니|웹툰|소설|방송|예능|공연|뉴스|사건|사고|이슈|사람|인물|기업|회사|단체|기관|학교|대학|학원|은행|금융|경제|사회|정치|스포츠|선수|팀|경기|시합|대회|올림픽|월드컵|IT|AI|로봇|우주|과학|기술|발명|연구|교육|입시|시험|공무원|자격증|취업|직장|연봉|면접)$/;
const GENERIC_ACTION_RE = /^(추천|후기|리뷰|비교|순위|가격|방법|꿀팁|정리|할인|세일|이벤트|인기|베스트|신상|최신|tips|모음|목록|소개|설명|정보)$/i;

// 🔥 v2.28.1: 뉴스성 단일 토큰 차단 (분기/폐지/사망/협상 등 — 글감 부족)
//   사용자 피드백: "분기, 폐지, 주식종류, 세계, 개최, 사망, 협상 이런 건 어떻게 쓰라고"
//   이유: 단일 뉴스 명사는 주제 추상적 + 시의성 스파이크 후 급락 + 블로그 집필 불가능
const NEWS_NOISE_RE = /^(분기|폐지|종류|세계|개최|사망|협상|발표|공개|선언|입장|대응|가능성|전망|예정|인터뷰|논란|제기|의혹|해명|공지|답변|반응|이슈|속보|긴급|비상|충격|폭로|고백|루머|소문|공방|격돌|대결|파장|파문|후폭풍|여파|보도|특종|거부|결렬|철회|취소|승인|기각|제출|접수|공시|공표|해제|연장|중단|재개|해임|사임|지명|임명|승진|퇴임|방문|순방|귀국|출국|도착|출발|회담|회의|총회|위원회|처분|결정|검토|합의|체결|조사|수사|기소|판결|선고|결과|최종|잠정|추가|수정|확정|변경|조정|전달|언급|경고|강조|지적|주장|반박|반대|찬성|동의|거절|요구|요청|제안|건의|권고|충고|촉구|호소|지지|비판|우려|기대|환영|축하|위로|애도|분노|공분|여론|민심|표심|속설|미담)$/;

function isNewsNoise(keyword: string): boolean {
    const clean = keyword.trim();
    if (clean.includes(' ')) return false; // 2-token 이상은 롱테일이라 예외
    return NEWS_NOISE_RE.test(clean);
}

function isTooGeneric2Token(keyword: string): boolean {
    const tokens = keyword.trim().split(/\s+/).filter(Boolean);
    if (tokens.length !== 2) return false;
    const [a, b] = tokens;
    // BROAD + ACTION 조합 (예: "적금 추천", "일본 가격")
    if (GENERIC_BROAD_RE.test(a) && GENERIC_ACTION_RE.test(b)) return true;
    if (GENERIC_BROAD_RE.test(b) && GENERIC_ACTION_RE.test(a)) return true;
    // 🔥 v2.28.2: BROAD + BROAD 조합 (예: "일본 미국", "네이버 구글")
    if (GENERIC_BROAD_RE.test(a) && GENERIC_BROAD_RE.test(b)) return true;
    // 🔥 v2.28.2: ACTION + ACTION 조합 (예: "가격 후기", "추천 리뷰", "비교 순위")
    if (GENERIC_ACTION_RE.test(a) && GENERIC_ACTION_RE.test(b)) return true;
    return false;
}

function isWritableKeyword(keyword: string, docCount: number): boolean {
    const tokens = keyword.trim().split(/\s+/).filter(Boolean).length;
    if (tokens === 2 && isTooGeneric2Token(keyword)) return false;
    if (isNewsNoise(keyword)) return false;
    // 🔥 v2.31.2: 단일 토큰이 GENERIC_ACTION(할인/후기/추천 등) 이면 무조건 차단
    //   사용자 피드백: "할인", "후기" 단독이 SS 로 통과됨 — 어떤 상품/서비스인지 불명
    if (tokens === 1 && GENERIC_ACTION_RE.test(keyword.trim())) return false;
    // 단일 GENERIC_BROAD (적금/보험/투자/일본/서울 등) 도 차단
    if (tokens === 1 && GENERIC_BROAD_RE.test(keyword.trim())) return false;
    if (tokens >= 2) return true;
    if (INTENT_SUFFIX_RE.test(keyword)) return true;
    if (isLikelyCelebrityName(keyword)) {
        return docCount > 0 && docCount <= 500;
    }
    // 단일 명사 dc ≤ 500 만 통과 (극희귀 고유명사만)
    if (docCount > 0 && docCount <= 500) return true;
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
function calculateGrade(volume: number, docCount: number, ratio: number, score: number, keyword: string): GoldenGrade | '' {
    const writable = isWritableKeyword(keyword, docCount);
    // 극단 범용 빅워드 제거
    if (!writable && docCount > 100_000) return '';
    // 🔥 v2.27.6: 범용 2-token 조합은 dc 무관 탈락
    if (!writable && isTooGeneric2Token(keyword)) return '';
    // 🔥 v2.28.1: 뉴스성 단일 토큰 dc 무관 즉시 탈락 (분기/폐지/사망 등)
    if (isNewsNoise(keyword)) return '';

    // 인명 단일 토큰은 dc 1000 초과 시 grade 제외
    const isCelebLike = isLikelyCelebrityName(keyword);
    if (isCelebLike && docCount > 1000) return '';

    // 🔥 v2.31.3: writable 강제 — 희소 예외 완전 제거 (단일 action "할인" 통과 문제 해결)
    //   실측에서 SS [할인], SS [가격] 통과 — allowSS 의 dc 예외 때문. 제거.
    const allowSS = writable;
    const allowS = writable;
    const allowA = writable;
    const commercial = hasCommercialIntent(keyword);

    // 🔥 v2.29.0: SSS 자동 승격에도 writable 강제 — 단일 일반 명사 차단
    //   "세대/회복/비전" 같은 단일 명사가 gr≥20 으로 SSS 승격되던 문제 해결
    if (writable && !isCelebLike && docCount > 0) {
        if (ratio >= 20 && volume >= 300) return 'SSS';
        if (ratio >= 10 && docCount <= 8000 && volume >= 500) return 'SSS';
        if (ratio >= 7 && docCount <= 20000 && volume >= 2000) return 'SSS';
        if (ratio >= 8 && docCount <= 12000 && volume >= 800) return 'SSS';
        if (commercial && docCount <= 5000 && volume >= 300 && ratio >= 3) return 'SSS';
        if (commercial && docCount <= 8000 && volume >= 500 && ratio >= 5) return 'SSS';
        if (commercial && docCount <= 1000 && volume >= 200) return 'SSS';
        if (docCount <= 300 && volume >= 100 && ratio >= 5) return 'SSS';
    }

    // 🔥 v2.28.0: SSS 기본 게이트 추가 완화
    const sssScore = commercial ? 65 : 72;
    const sssSv = commercial ? 300 : 500;
    const sssDc = commercial ? 15000 : 12000;
    const sssRatio = commercial ? 2.0 : 3.0;
    if (score >= sssScore && volume >= sssSv && docCount > 0 && docCount <= sssDc && ratio >= sssRatio && allowSS) return 'SSS';

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
    if (score >= 48 && volume >= 70 && ratio >= 0.5 && writable) return 'S';
    if (score >= 38 && volume >= 30 && writable) return 'A';
    if (score >= 35 && volume >= 20 && writable) return 'B';
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
export async function buildRichFeed(
    options: { tier?: SourceTier; limit?: number } = {},
    onProgress?: RichFeedProgressCallback
): Promise<RichFeedResult> {
    const tier: 'lite' | 'pro' = options.tier === 'pro' ? 'pro' : 'lite';
    const limit = options.limit || 100;

    // 🔥 v2.27.9: 하드캡 8분 → 6분 (사용자 "실제 그 시간 안 걸리는데 확실하게 대량")
    //   사용자 환경은 네이버 API 정상 → 후보 2500 + concurrency 8 이 6분 내 가능
    const HARD_CAP_MS = 6 * 60 * 1000;
    const startedAt = Date.now();
    const isExceeded = () => Date.now() - startedAt > HARD_CAP_MS;

    const emit = (step: string, percent: number, message: string) => {
        try { onProgress?.({ step, percent, message }); } catch {}
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
    // 중복이면 기존 source 유지, 신규면 'evergreen' 소스로 추가
    for (const seed of getEvergreenSafetyNetSeeds(40)) {
        const kw = normalize(seed);
        if (!isValid(kw)) continue;
        if (!seedMap.has(kw)) seedMap.set(kw, new Set());
        seedMap.get(kw)!.add('evergreen');
    }

    // 3. 모든 seed 수집 + 소스별 그룹화 (round-robin용)
    const allSeeds = Array.from(seedMap.entries())
        .map(([kw, srcs]) => ({ keyword: kw, sources: Array.from(srcs) }))
        .sort((a, b) => b.sources.length - a.sources.length);

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

    // 3-3. Longtail 확장
    // - Heavy source(seed 100+): 상위 20개만 파생 (전체 파생 폭증 방지)
    // - Minor source(seed 30-): 모든 seed 파생 (최종 feed 기여 확보)
    // 🔥 v2.27.0: suffix 38→50, HEAVY_LONGTAIL_CAP 100→200 (전체 소스 총 동원)
    const LONGTAIL_SUFFIXES = [
        '추천', '후기', '가격', '비교', '방법', '순위', '종류', '사용법', '뜻', '차이', '장단점',
        '정리', '꿀팁', '초보', '효과', '부작용', '주의사항', '총정리', '리뷰', '브랜드',
        '저렴한', '인기', '최신', '2026', '할인', '세일', '가성비', '조건', '신청', '신청방법',
        '베스트', '이벤트', '무료', '사용후기', '원데이', '입문', '기초', '쉽게',
        '필수템', '꿀템', '가이드', '정보', '대비', '혜택', '공략', '노하우',
        '팁', '요약', '체크', '핵심',
    ];
    const MINOR_THRESHOLD = 30;
    const HEAVY_LONGTAIL_CAP = 200;
    const extraSeeds: typeof baseSeeds = [];
    for (const [, list] of perSource.entries()) {
        const isMinor = list.length <= MINOR_THRESHOLD;
        const targetList = isMinor ? list : list.slice(0, HEAVY_LONGTAIL_CAP);
        for (const base of targetList) {
            const bkw = base.keyword;
            if (bkw.length < 2 || bkw.length > 20) continue;
            if (LONGTAIL_SUFFIXES.some(s => bkw.endsWith(s))) continue;
            const baseScore = scoreSeedKeyword(bkw, idfStats, base.sources.length);
            for (const suffix of LONGTAIL_SUFFIXES) {
                const derived = `${bkw} ${suffix}`;
                if (seedMap.has(derived) || seenKeywords.has(derived)) continue;
                // 🔥 v2.27.7: longtail 생성 단계에서 generic 조합 pre-filter
                //   "적금 추천" 같은게 후보 풀 진입 전에 차단 → API 호출 낭비 제거
                if (isTooGeneric2Token(derived)) continue;
                extraSeeds.push({
                    keyword: derived,
                    sources: [...base.sources, 'longtail'],
                    qualityScore: baseScore * 0.8,
                });
                seenKeywords.add(derived);
            }
        }
    }

    // 🔥 v2.27.9: 후보 풀 1500 → 2500 (대량 보장)
    const allScored = [...baseSeeds, ...extraSeeds].sort((a, b) => b.qualityScore - a.qualityScore);
    const targetSize = Math.min(2500, Math.max(limit * 8, 1500));

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

    if (candidates.length === 0) {
        emit('done', 100, '수집된 키워드 없음');
        return { timestamp: Date.now(), total: 0, tier, rows: [], byCategory: {}, bySource: {} };
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
    // 🔥 v2.28.0: batch 80→40, 병렬 5→10 (배치 작아져 병렬 효율 ↑, 오류 복원력 ↑)
    const batchSize = 40;
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
                let grade: GoldenGrade | '' = calculateGrade(totalVolume, docCount, goldenRatio, score, sig.keyword);
                if (!grade) continue;

                // 🔥 v2.31.1: SSR 승격 경로 다양화 (5~15건 → 20~50건)
                //   확정 수익 키워드가 많아야 정상. 6가지 승격 경로로 커버리지 확대.
                const isCommercialKw = hasCommercialIntent(sig.keyword);
                const cpcVal = typeof realCpc === 'number' ? realCpc : 0;
                const isRevenueCat = isRevenueCategory(cat.id);
                const isSssOrAbove = grade === 'SSS';
                const isSsOrAbove = grade === 'SSS' || grade === 'SS';
                const isSOrAbove = grade === 'SSS' || grade === 'SS' || grade === 'S';

                // 🔥 v2.31.2: SSR 승격 조건에 "3-token+ 또는 구체성" 강제 추가
                //   사용자 피드백: 2-token 이어도 broad 하면 초보자 감 못잡음
                //   예: "국내 브랜드", "반려동물 추천" 같은 건 SSR 안 됨
                const tokenCount = sig.keyword.trim().split(/\s+/).filter(Boolean).length;
                const isSpecific = tokenCount >= 3 || (tokenCount === 2 && sig.keyword.length >= 8);

                let isSsr = false;
                if (isSpecific) {
                    // 경로 A: SSS + CPC≥500 + commercial + 수익 카테고리
                    if (isSssOrAbove && cpcVal >= 500 && isCommercialKw && isRevenueCat) isSsr = true;
                    // 경로 B: SS + CPC≥1000 + commercial + 수익 카테고리
                    else if (isSsOrAbove && cpcVal >= 1000 && isCommercialKw && isRevenueCat) isSsr = true;
                    // 경로 C: 초고CPC (≥2000) + commercial + dc≤5000
                    else if (isSOrAbove && cpcVal >= 2000 && isCommercialKw && docCount <= 5000) isSsr = true;
                    // 경로 D: S + CPC≥1500 + commercial + 수익 카테고리
                    else if (isSOrAbove && cpcVal >= 1500 && isCommercialKw && isRevenueCat) isSsr = true;
                    // 경로 E: SSS + 수익 카테고리 + 극블루오션 — CPC 무관 (신규 수익 키워드)
                    else if (isSssOrAbove && isRevenueCat && docCount <= 1000 && goldenRatio >= 10) isSsr = true;
                    // 경로 F: CPC≥3000 초초고CPC
                    else if (isSOrAbove && cpcVal >= 3000 && docCount <= 10000) isSsr = true;
                    // 🔥 v2.31.2 신규 경로 G: CPC 없이도 commercial + 수익 카테고리 + 3-token + 고블루오션
                    //   API CPC null 많은 현실 반영 — 수익 카테고리 + 실전 롱테일은 CPC 안 알아도 수익 예상
                    else if (isSssOrAbove && isCommercialKw && isRevenueCat && tokenCount >= 3 && docCount <= 3000) isSsr = true;
                }

                if (isSsr) grade = 'SSR';

                const isBlueOcean = totalVolume >= 300 && totalVolume <= 10000 && docCount <= 2000 && goldenRatio >= 5;

                enrichedRows.push({
                    rank: 0,
                    keyword: sig.keyword,
                    category: cat.label,
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

    // 🔥 v2.31.0: SSR/SSS/SS/S/A 포함 필터 (SSR = 수익 황금)
    const highGradeOnly = enrichedRows.filter(r =>
        r.grade === 'SSR' || r.grade === 'SSS' || r.grade === 'SS' || r.grade === 'S' || r.grade === 'A'
    );
    enrichedRows.length = 0;
    enrichedRows.push(...highGradeOnly);

    emit('grading', 90, `등급 판정 및 정렬 (SSS/SS/S/A ${enrichedRows.length}건)...`);

    // 5. 정렬 (등급 → 기회지수 → 소스 수)
    const gradeOrder: Record<string, number> = { SSR: 6, SSS: 5, SS: 4, S: 3, A: 2, B: 1 };
    enrichedRows.sort((a, b) => {
        const ga = gradeOrder[a.grade] || 0;
        const gb = gradeOrder[b.grade] || 0;
        if (ga !== gb) return gb - ga;
        const grA = Math.round(a.goldenRatio * 10) / 10;
        const grB = Math.round(b.goldenRatio * 10) / 10;
        if (grA !== grB) return grB - grA;
        if (a.sourceCount !== b.sourceCount) return b.sourceCount - a.sourceCount;
        return Math.random() - 0.5; // 동률이면 랜덤
    });

    const top = enrichedRows.slice(0, limit).map((r, idx) => ({ ...r, rank: idx + 1 }));

    // 🔥 v2.22.0 초고속: 트렌드 분류 top 30→15, 배치 5→10 (절반 시간)
    emit('trend', 92, `30일 트렌드 타입 분류 중 (상위 ${Math.min(top.length, 15)}건)...`);
    try {
        const { analyzeKeywordTrend } = require('../trend-type-classifier');
        if (clientId && clientSecret) {
            const trendTargets = top.slice(0, 15);
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

    emit('done', 100, `완료 — ${top.length}건 발굴`);

    return {
        timestamp: Date.now(),
        total: top.length,
        tier,
        rows: top,
        byCategory: countBy(top, 'category'),
        bySource: countSources(top),
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
const CACHE_SCHEMA_VERSION = 'v2.31.3-strict';  // 🔥 v2.31.3: writable 강제 + BROAD 확장

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

export async function getCachedRichFeed(
    force: boolean = false,
    options: { tier?: SourceTier; limit?: number } = {},
    onProgress?: RichFeedProgressCallback
): Promise<RichFeedResult> {
    const now = Date.now();

    // 1) 메모리 캐시 (15분, force 아니면 우선)
    if (!force && cached && cached.expiresAt > now) {
        try { onProgress?.({ step: 'cache', percent: 100, message: `캐시 사용 (${cached.result.total}건)` }); } catch {}
        return cached.result;
    }

    // 2) 라이브 빌드
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
