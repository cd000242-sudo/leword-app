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
export type GoldenGrade = 'SSS' | 'SS' | 'S' | 'A' | 'B';

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

function isWritableKeyword(keyword: string, docCount: number): boolean {
    const tokens = keyword.trim().split(/\s+/).filter(Boolean).length;
    if (tokens >= 2) return true;                          // 2단어+ 롱테일
    if (INTENT_SUFFIX_RE.test(keyword)) return true;       // 검색 의도 어미
    // 🔥 v2.23.0: 인명 의심 키워드는 dc 극소(<500)만 writable (초 블루오션 고유명사 한해서만)
    if (isLikelyCelebrityName(keyword)) {
        return docCount > 0 && docCount <= 500;
    }
    if (docCount > 0 && docCount <= 3000) return true;     // 🔥 v2.23.0: 5000→3000 (타이트)
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
    // 🔥 극단 범용 빅워드 제거 — 개인 블로거가 경쟁 불가능한 단일 명사만 차단
    if (!writable && docCount > 100_000) return '';

    // 🔥 v2.23.0: 인명 단일 토큰은 dc 1000 초과 시 grade 제외 (뉴스성 트래픽 배제)
    const isCelebLike = isLikelyCelebrityName(keyword);
    if (isCelebLike && docCount > 1000) return '';

    // 🔥 v2.23.0: S 등급에 writable 강제 → 인명/범용 단어 S 승급 차단
    // (진짜 초블루오션 dc<500 인 희소 인명만 writable=true 되어 승급 가능)
    if (score >= 85 && volume >= 1000 && docCount <= 5000 && ratio >= 5 && writable) return 'SSS';
    if (score >= 75 && volume >= 500 && docCount <= 10000 && ratio >= 3 && writable) return 'SS';
    if (score >= 65 && volume >= 300 && ratio >= 2 && writable) return 'S';
    if (score >= 55 && volume >= 100 && writable) return 'A';
    if (score >= 45) return 'B';
    return '';
}

function calculateScore(volume: number, docCount: number, ratio: number, cpc: number, intent: number, keyword?: string): number {
    // 수요공급 (45%) — 정보성 블루오션 시드(위키/트렌딩)의 기회지수 반영 강화
    const sd = Math.min(100,
        ratio >= 20 ? 100 :
        ratio >= 10 ? 80 + (ratio - 10) * 2 :
        ratio >= 5 ? 60 + (ratio - 5) * 4 :
        ratio >= 2 ? 35 + (ratio - 2) * 8.3 :
        ratio >= 1 ? 15 + (ratio - 1) * 20 :
        ratio * 15);
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
    const HEAVY_SOURCE_CAP = 200;   // 🔥 v2.20.0: 100→200 (대량 발굴)

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
            .filter(s => isQualitySeed(s.keyword))
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
    // 🔥 v2.20.0: suffix 11→24, HEAVY_LONGTAIL_CAP 20→50 (대량 발굴)
    const LONGTAIL_SUFFIXES = [
        '추천', '후기', '가격', '비교', '방법', '순위', '종류', '사용법', '뜻', '차이', '장단점',
        '정리', '꿀팁', '초보', '효과', '부작용', '주의사항', '총정리', '리뷰', '브랜드',
        '저렴한', '인기', '최신', '2026',
    ];
    const MINOR_THRESHOLD = 30;
    const HEAVY_LONGTAIL_CAP = 50;
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
                extraSeeds.push({
                    keyword: derived,
                    sources: [...base.sources, 'longtail'],
                    qualityScore: baseScore * 0.8,
                });
                seenKeywords.add(derived);
            }
        }
    }

    // base + longtail 합쳐서 품질 기반 선별 → 상위 후보만 API 검증
    // 🔥 v2.22.0: 초고속 모드 — 후보 풀 2000 → 600 (API 호출 3배 감소)
    //   품질은 Stratified 로 유지되므로 풀을 줄여도 top-N 품질 저하 없음.
    const allScored = [...baseSeeds, ...extraSeeds].sort((a, b) => b.qualityScore - a.qualityScore);
    const targetSize = Math.min(600, Math.max(limit * 3, 300));

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
    const fixedCount = Math.min(50, Math.floor(targetSize * 0.125));
    const aPrimeSize = Math.floor(targetSize * 0.70);
    const layerBSize = Math.floor(targetSize * 0.125);
    const layerCSize = targetSize - fixedCount - aPrimeSize - layerBSize;

    const fixedPool = allScored.slice(0, fixedCount);
    const aPrimePoolEnd = Math.min(allScored.length, fixedCount + Math.floor(aPrimeSize * 1.07));
    const bPoolEnd = Math.min(allScored.length, aPrimePoolEnd + Math.max(layerBSize * 9, 450));
    const aPrimePool = allScored.slice(fixedCount, aPrimePoolEnd);
    const bPool = allScored.slice(aPrimePoolEnd, bPoolEnd);
    const cPool = allScored.slice(bPoolEnd);

    const aPrime = weightedSampleWithoutReplacement(aPrimePool, aPrimeSize, 1.2);
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
    // 🔥 v2.22.0 초고속: batch 30→50, 순차→3개 동시 (Naver rate limit 안전구간 내)
    const batchSize = 50;
    const PARALLEL_BATCHES = 3;
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
                // 🔥 v2.20.0: 대량 발굴 — longtail 3, 원본 5 (완화)
                const isLongtailDerived = (seed.sources || []).includes('longtail');
                const minVolume = isLongtailDerived ? 3 : 5;
                if (totalVolume < minVolume) continue;

                // 문서수 미확인(null) / 0 → Naver 블로그 API 실패. 등급 과대평가 방지 위해 B 캡
                const hasValidDocCount = sig.documentCount !== null && sig.documentCount !== undefined && sig.documentCount > 0;
                const docCount = hasValidDocCount ? (sig.documentCount as number) : 0;
                const goldenRatio = hasValidDocCount ? totalVolume / Math.max(1, docCount) : 0;

                const cat = classifyForFeed(sig.keyword);
                // 🔥 네이버 검색광고 API 실측 평균 입찰가 (더미 절대 금지)
                // 실측값이 0이거나 없으면 null — UI에서 "-"로 표시
                const realCpc = (typeof sig.monthlyAveCpc === 'number' && sig.monthlyAveCpc > 0) ? sig.monthlyAveCpc : null;
                const intent = calculatePurchaseIntent(sig.keyword);

                // 스코어링에는 정적 추정 CPC 사용 (점수 일관성 위해) — UI 노출값은 realCpc만
                const scoringCpc = estimateCPC(sig.keyword, cat.id);
                const score = calculateScore(totalVolume, docCount, goldenRatio, scoringCpc, intent, sig.keyword);
                let grade = calculateGrade(totalVolume, docCount, goldenRatio, score, sig.keyword);
                // 문서수 미확인 키워드는 최고 B등급까지만
                if (!hasValidDocCount && grade && grade !== 'B') grade = 'B';
                if (!grade) continue;

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

    // 🔥 v2.22.0: 3개 배치 동시 실행 (Naver rate limit ~10 req/s 안전)
    for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
        const slice = batches.slice(i, i + PARALLEL_BATCHES);
        await Promise.all(slice.map(processBatch));
        completedBatches += slice.length;
        const batchPercent = 20 + Math.round((completedBatches / totalBatches) * 65);
        emit('api', batchPercent, `네이버 API 검증 ${completedBatches}/${totalBatches} (누적 ${enrichedRows.length}건)`);
        if (enrichedRows.length >= limit) break;
        // 🔥 딜레이 300ms → 50ms (rate limit 여유)
        await new Promise(r => setTimeout(r, 50));
    }

    emit('grading', 90, `등급 판정 및 정렬 (${enrichedRows.length}건)...`);

    // 5. 정렬 (등급 → 기회지수 → 소스 수)
    // 🔥 v2.20.1: 같은 등급+GR 내부에서는 약간의 랜덤 타이브레이커 — 매번 다른 배치
    const gradeOrder: Record<string, number> = { SSS: 5, SS: 4, S: 3, A: 2, B: 1 };
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
const CACHE_SCHEMA_VERSION = 'v2.23.0-quality';  // 🔥 v2.23.0: 끝판왕 품질 (인명 차단 + 상업성 부스트)

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
