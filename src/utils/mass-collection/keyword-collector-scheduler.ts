/**
 * 🔄 키워드 수집 스케줄러 (Keyword Collector Scheduler)
 * 
 * 다중 소스에서 키워드를 주기적으로 수집하여 저장소에 저장
 * 30분~1시간 간격으로 자동 실행
 */

import {
    KeywordStorage,
    getKeywordStorage,
    CollectorSource,
    StoredKeyword
} from './keyword-storage';

// ============================================================================
// 인터페이스 정의
// ============================================================================

/**
 * 수집기 설정
 */
export interface CollectorConfig {
    intervalMs: number;              // 수집 간격 (기본: 30분)
    sources: CollectorSource[];      // 활성화할 소스
    maxKeywordsPerSource: number;    // 소스당 최대 수집 개수 (기본: 20)
    autoStart: boolean;              // 자동 시작 여부
    metricsUpdateIntervalMs: number; // 메트릭스 갱신 간격 (기본: 6시간)
    cleanupIntervalMs: number;       // 만료 키워드 정리 간격 (기본: 1시간)
}

/**
 * 수집 결과
 */
export interface CollectionResult {
    success: boolean;
    timestamp: string;
    duration: number;                // 소요 시간 (ms)
    totalCollected: number;          // 총 수집된 키워드 수
    newKeywords: number;             // 신규 키워드 수
    updatedKeywords: number;         // 업데이트된 키워드 수
    bySource: Record<CollectorSource, {
        collected: number;
        errors: string[];
    }>;
    errors: string[];
}

/**
 * 스케줄러 상태
 */
export interface SchedulerStatus {
    isRunning: boolean;
    lastCollectionAt: string | null;
    nextCollectionAt: string | null;
    lastResult: CollectionResult | null;
    totalCollections: number;
    totalKeywordsCollected: number;
    uptime: number;                  // 실행 시간 (ms)
}

// ============================================================================
// 기본 설정
// ============================================================================

const DEFAULT_CONFIG: CollectorConfig = {
    intervalMs: 10 * 60 * 1000,           // 10분 (빠른 틈새 키워드 발굴)
    sources: [
        'zum',
        'nate',
        'daum',
        'signal',
        'google',
        'naver_autocomplete',
        'news'
    ],
    maxKeywordsPerSource: 20,
    autoStart: false,
    metricsUpdateIntervalMs: 6 * 60 * 60 * 1000,  // 6시간
    cleanupIntervalMs: 60 * 60 * 1000             // 1시간
};

// ============================================================================
// 소스별 수집 함수
// ============================================================================

/**
 * ZUM 실시간 검색어 수집
 */
async function collectFromZum(limit: number): Promise<{ keyword: string; category: string }[]> {
    try {
        const { getZumRealtimeKeywords } = await import('../realtime-search-keywords');
        const keywords = await getZumRealtimeKeywords(limit);

        return keywords.map(k => ({
            keyword: k.keyword,
            category: detectCategory(k.keyword)
        }));
    } catch (error: any) {
        console.warn('[COLLECTOR] ZUM 수집 실패:', error?.message);
        return [];
    }
}

/**
 * 네이트 이슈 수집
 */
async function collectFromNate(limit: number): Promise<{ keyword: string; category: string }[]> {
    try {
        const { getNateRealtimeKeywords } = await import('../realtime-search-keywords');
        const keywords = await getNateRealtimeKeywords(limit);

        return keywords.map(k => ({
            keyword: k.keyword,
            category: detectCategory(k.keyword)
        }));
    } catch (error: any) {
        console.warn('[COLLECTOR] 네이트 수집 실패:', error?.message);
        return [];
    }
}

/**
 * 다음 실시간 검색어 수집
 */
async function collectFromDaum(limit: number): Promise<{ keyword: string; category: string }[]> {
    try {
        const { getDaumRealtimeKeywords } = await import('../realtime-search-keywords');
        const keywords = await getDaumRealtimeKeywords(limit);

        return keywords.map(k => ({
            keyword: k.keyword,
            category: detectCategory(k.keyword)
        }));
    } catch (error: any) {
        console.warn('[COLLECTOR] 다음 수집 실패:', error?.message);
        return [];
    }
}

/**
 * Signal.bz (네이버 트렌드) 수집
 */
async function collectFromSignal(limit: number): Promise<{ keyword: string; category: string }[]> {
    try {
        const { getSignalBzKeywords } = await import('../signal-bz-crawler');
        const keywords = await getSignalBzKeywords(limit);

        return keywords.map(k => ({
            keyword: typeof k === 'string' ? k : k.keyword,
            category: detectCategory(typeof k === 'string' ? k : k.keyword)
        }));
    } catch (error: any) {
        console.warn('[COLLECTOR] Signal.bz 수집 실패:', error?.message);
        return [];
    }
}

/**
 * 구글 트렌드 수집
 */
async function collectFromGoogle(limit: number): Promise<{ keyword: string; category: string }[]> {
    try {
        const { getGoogleRealtimeKeywords } = await import('../realtime-search-keywords');
        const keywords = await getGoogleRealtimeKeywords(limit);

        return keywords.map(k => ({
            keyword: k.keyword,
            category: detectCategory(k.keyword)
        }));
    } catch (error: any) {
        console.warn('[COLLECTOR] 구글 수집 실패:', error?.message);
        return [];
    }
}

/**
 * 네이버 자동완성 수집 (시드 키워드 기반)
 */
async function collectFromNaverAutocomplete(limit: number): Promise<{ keyword: string; category: string }[]> {
    try {
        // 인기 시드 키워드로 자동완성 수집 (다양한 카테고리 풀 활용)
        const SEED_POOL = [
            // 일반
            '추천', '방법', '후기', '가격', '혜택', '2026', '순위', '비교', '장점', '단점',
            // IT
            '아이폰', '갤럭시', '노트북', '태블릿', '에어팟', '로봇청소기',
            // 금융
            '주식', '예금', '적금', '청약', '대출', '금리', '환율', '비트코인', 'ETF',
            // 🔥 지원금/정책 (신규 강화)
            '지원금', '보조금', '청년지원금', '출산지원금', '육아지원금', '청년수당',
            '국민지원금', '긴급지원금', '소상공인지원금', '신청방법', '지원대상', '신청기간',
            '청년정책', '복지혜택', '무료교육', '취업지원', '창업지원', '주거지원',
            // 🔥 생활/리빙 (신규 강화)
            '맛집', '레시피', '도시락', '밀키트', '청소', '인테리어', '정리', '다이소',
            '이케아', '무인양품', '리빙템', '수납', '홈카페', '가전추천', '에어프라이어',
            '세탁기', '냉장고', '공기청정기', '청소기추천', '살림팁', '알뜰살뜰',
            // 뷰티/패션
            '코디', '가방', '신발', '운동화', '원피스', '쿠션', '틴트', '선크림',
            // 여행
            '여행', '호텔', '리조트', '캠핑', '글램핑', '펜션', '제주도', '오사카',
            // 취미
            '게임', '모바일게임', '닌텐도', '플스', '스팀', 'RPG', '골프', '등산', '낚시',
            // 자동차
            '신차', '중고차', 'SUV', '세단', '전기차', '하이브리드', '시승기',
            // 육아/반려동물
            '유모차', '카시트', '기저귀', '분유', '강아지', '고양이', '사료', '간식'
        ];

        // 🔥 우선순위 시드 (지원금/리빙 위주 - 틈새 키워드 발굴에 핵심)
        const PRIORITY_SEEDS = [
            // 지원금/정책 (돈 되는 키워드)
            '지원금', '보조금', '청년지원금', '출산지원금', '신청방법', '신청', '대상자',
            '복지', '정부지원', '무료', '환급', '감면', '할인혜택', '민생지원금',
            // 리빙/생활 (구매의도 높음)
            '추천', '가성비', '순위', '비교', '후기', '장단점', '단점',
            '에어프라이어', '청소기', '냉장고', '세탁기', '공기청정기',
            '인테리어', '수납', '정리', '이케아', '다이소'
        ];

        // 🆕 제품/브랜드 시드 (실제 틈새 제품명 발굴)
        const BRAND_SEEDS = [
            // 가전
            '다이슨', 'LG 코드제로', '삼성 비스포크', '샤오미', '로보락', '필립스',
            '발뮤다', '쿠첸', '쿠쿠', '위닉스', '코웨이',
            // IT
            '아이폰16', '갤럭시 S24', '맥북', '아이패드', '갤럭시탭', '플스5', '닌텐도스위치'
        ];

        // 일반 시드 (보조)
        const GENERAL_SEEDS = [
            '아이폰', '갤럭시', '노트북', '주식', '청약', '예금', '여행', '호텔', '레시피'
        ];

        // 우선순위 5개 + 브랜드 3개 + 일반 2개로 구성
        const prioritySeeds = PRIORITY_SEEDS.sort(() => 0.5 - Math.random()).slice(0, 5);
        const brandSeeds = BRAND_SEEDS.sort(() => 0.5 - Math.random()).slice(0, 3);
        const generalSeeds = GENERAL_SEEDS.sort(() => 0.5 - Math.random()).slice(0, 2);
        const seeds = [...prioritySeeds, ...brandSeeds, ...generalSeeds];

        const results: { keyword: string; category: string }[] = [];

        // 🆕 틈새 키워드 발굴용 접미사 (돈 되는 패턴)
        const NICHE_SUFFIXES = ['추천', '가성비', '순위', '비교', '후기', '단점', '가격'];

        // 동적 import
        const proTrafficModule = await import('../pro-traffic-keyword-hunter');

        // fetchNaverAutocomplete가 export되어 있다면 사용
        if ('fetchNaverAutocomplete' in proTrafficModule) {
            const fetchNaverAutocomplete = (proTrafficModule as any).fetchNaverAutocomplete;
            const discoveredSet = new Set<string>();

            // 1단계: 시드 10개 사용 + 접미사 확장
            for (const seed of seeds) {
                try {
                    // 기본 자동완성
                    const keywords = await fetchNaverAutocomplete(seed);
                    for (const kw of keywords.slice(0, 3)) {
                        if (!discoveredSet.has(kw)) {
                            discoveredSet.add(kw);
                            results.push({ keyword: kw, category: detectCategory(kw) });
                        }
                    }

                    // 🆕 접미사 확장 (더 깊이 파기)
                    for (const suffix of NICHE_SUFFIXES.slice(0, 3)) {
                        try {
                            const extendedSeed = `${seed} ${suffix}`;
                            const suffixKeywords = await fetchNaverAutocomplete(extendedSeed);
                            for (const kw of suffixKeywords.slice(0, 2)) {
                                if (!discoveredSet.has(kw)) {
                                    discoveredSet.add(kw);
                                    results.push({ keyword: kw, category: detectCategory(kw) });
                                }
                            }
                        } catch { /* ignore */ }
                    }
                } catch {
                    // 개별 실패 무시
                }
            }
        }

        console.log(`[COLLECTOR] 접미사 확장 수집 완료: ${results.length}개 틈새 키워드`);
        return results.slice(0, limit);
    } catch (error: any) {
        console.warn('[COLLECTOR] 네이버 자동완성 수집 실패:', error?.message);
        return [];
    }
}

/**
 * 뉴스 이슈 키워드 수집
 */
async function collectFromNews(limit: number): Promise<{ keyword: string; category: string }[]> {
    try {
        // 뉴스 RSS 등에서 키워드 추출
        const results: { keyword: string; category: string }[] = [];

        // 네이버 뉴스 크롤러가 있다면 활용
        // 뉴스 크롤러 비활성화 (모듈 에러 방지)
        /*
        try {
            const { extractNaverNewsKeywords } = await import('../naver-news-crawler');
            if (extractNaverNewsKeywords) {
                const keywords = await extractNaverNewsKeywords(limit);
                for (const kw of keywords) {
                    results.push({
                        keyword: typeof kw === 'string' ? kw : kw.keyword || kw.title,
                        category: detectCategory(typeof kw === 'string' ? kw : kw.keyword || kw.title)
                    });
                }
            }
        } catch {
            // 크롤러 없으면 무시
        }
        */

        return results.slice(0, limit);
    } catch (error: any) {
        console.warn('[COLLECTOR] 뉴스 수집 실패:', error?.message);
        return [];
    }
}

/**
 * 카테고리 자동 감지
 */
function detectCategory(keyword: string): string {
    const kw = keyword.toLowerCase();

    // 연예/셀럽
    if (/아이돌|가수|배우|연예인|드라마|영화|콘서트|앨범|컴백|뮤비|예능/.test(kw)) {
        return 'celeb';
    }

    // IT/테크
    if (/아이폰|갤럭시|노트북|컴퓨터|앱|어플|인공지능|ai|gpt|it|테크|코딩|프로그래밍/.test(kw)) {
        return 'it';
    }

    // 금융/재테크
    if (/주식|코인|투자|대출|금리|부동산|청약|적금|계좌|연금|보험/.test(kw)) {
        return 'finance';
    }

    // 건강/뷰티
    if (/다이어트|운동|헬스|피부|화장품|성형|병원|건강|영양제|비타민/.test(kw)) {
        return 'health';
    }

    // 여행/맛집
    if (/여행|맛집|카페|호텔|리조트|관광|숙소|펜션|항공|해외/.test(kw)) {
        return 'travel';
    }

    // 자기계발
    if (/자격증|시험|공부|취업|이직|면접|스펙|자소서|영어|토익/.test(kw)) {
        return 'self_development';
    }

    // 생활/리빙 (강화)
    if (/육아|결혼|집|인테리어|요리|레시피|청소|정리|생활|꿀팁|이케아|무인양품|리빙템|수납|홈카페|가전추천|에어프라이어|세탁기|냉장고|공기청정기|청소기추천|살림팁|알뜨살뜨|다이소/.test(kw)) {
        return 'life_tips';
    }

    // 스포츠
    if (/축구|야구|농구|골프|테니스|올림픽|월드컵|리그|경기|선수/.test(kw)) {
        return 'sports';
    }

    // 정책/복지/지원금 (강화)
    if (/지원금|보조금|청년|복지|정책|신청|정부|혜택|무료|출산|육아지원|국민지원|긴급지원|소상공인|신청방법|지원대상|신청기간|청년정책|복지혜택|무료교육|취업지원|창업지원|주거지원|수당/.test(kw)) {
        return 'policy';
    }

    // 게임/취미
    if (/게임|닌텐도|플스|스팀|RPG|모바일게임|롤|메이플|로스트아크|공략|퀘스트|사전예약|캠핑|낚시|등산|골프/.test(kw)) {
        return 'game';
    }

    // 자동차
    if (/자동차|신차|중고차|시승기|옵션|전기차|하이브리드|현대차|기아|BMW|벤츠|SUV|세단/.test(kw)) {
        return 'car';
    }

    // 반려동물
    if (/강아지|고양이|댕댕이|냥이|반려견|반려묘|사료|간식|동물병원/.test(kw)) {
        return 'pet';
    }

    // 패션/뷰티 (세분화)
    if (/코디|패션|옷|신발|가방|브랜드|룩북|스타일|화장품|틴트|쿠션|앰플|선크림|올리브영/.test(kw)) {
        return 'fashion';
    }

    return 'general';
}

/**
 * 소스별 수집 함수 매핑
 */
const SOURCE_COLLECTORS: Record<CollectorSource, (limit: number) => Promise<{ keyword: string; category: string }[]>> = {
    'zum': collectFromZum,
    'nate': collectFromNate,
    'daum': collectFromDaum,
    'signal': collectFromSignal,
    'google': collectFromGoogle,
    'naver_autocomplete': collectFromNaverAutocomplete,
    'news': collectFromNews,
    'smart_block': async () => [], // 스마트블록은 별도 처리
    'searchad': async () => [],    // 검색광고 연관은 별도 처리
    'manual': async () => []       // 수동 입력
};

// ============================================================================
// KeywordCollectorScheduler 클래스
// ============================================================================

export class KeywordCollectorScheduler {
    private config: CollectorConfig;
    private storage: KeywordStorage;
    private isRunning: boolean = false;
    private collectionTimer: NodeJS.Timeout | null = null;
    private cleanupTimer: NodeJS.Timeout | null = null;
    private startedAt: Date | null = null;
    private lastResult: CollectionResult | null = null;
    private lastCollectionAt: Date | null = null;
    private totalCollections: number = 0;
    private totalKeywordsCollected: number = 0;

    constructor(config: Partial<CollectorConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.storage = getKeywordStorage();

        if (this.config.autoStart) {
            this.start();
        }
    }

    // ==========================================================================
    // 스케줄러 제어
    // ==========================================================================

    /**
     * 스케줄러 시작
     */
    start(): void {
        if (this.isRunning) {
            console.warn('[COLLECTOR-SCHEDULER] 이미 실행 중입니다');
            return;
        }

        console.log('[COLLECTOR-SCHEDULER] 수집 스케줄러 시작');
        console.log(`[COLLECTOR-SCHEDULER] 수집 간격: ${this.config.intervalMs / 1000 / 60}분`);
        console.log(`[COLLECTOR-SCHEDULER] 활성 소스: ${this.config.sources.join(', ')}`);

        this.isRunning = true;
        this.startedAt = new Date();

        // 즉시 첫 수집 실행
        this.collectNow().catch(console.error);

        // 주기적 수집 스케줄
        this.collectionTimer = setInterval(() => {
            this.collectNow().catch(console.error);
        }, this.config.intervalMs);

        // 만료 키워드 정리 스케줄
        this.cleanupTimer = setInterval(() => {
            this.storage.cleanupExpired().catch(console.error);
        }, this.config.cleanupIntervalMs);
    }

    /**
     * 스케줄러 중지
     */
    stop(): void {
        if (!this.isRunning) {
            console.warn('[COLLECTOR-SCHEDULER] 실행 중이 아닙니다');
            return;
        }

        console.log('[COLLECTOR-SCHEDULER] 수집 스케줄러 중지');

        if (this.collectionTimer) {
            clearInterval(this.collectionTimer);
            this.collectionTimer = null;
        }

        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }

        this.isRunning = false;

        // 저장소 즉시 저장
        this.storage.saveNow();
    }

    // ==========================================================================
    // 수집 실행
    // ==========================================================================

    /**
     * 즉시 수집 실행
     */
    async collectNow(): Promise<CollectionResult> {
        const startTime = Date.now();
        console.log('[COLLECTOR-SCHEDULER] 수집 시작...');

        const result: CollectionResult = {
            success: true,
            timestamp: new Date().toISOString(),
            duration: 0,
            totalCollected: 0,
            newKeywords: 0,
            updatedKeywords: 0,
            bySource: {} as Record<CollectorSource, { collected: number; errors: string[] }>,
            errors: []
        };

        // 각 소스에서 수집
        for (const source of this.config.sources) {
            result.bySource[source] = { collected: 0, errors: [] };

            try {
                const collector = SOURCE_COLLECTORS[source];
                if (!collector) {
                    result.bySource[source].errors.push(`수집기 없음: ${source}`);
                    continue;
                }

                const keywords = await collector(this.config.maxKeywordsPerSource);

                // 저장소에 저장
                for (const kw of keywords) {
                    try {
                        const existing = await this.storage.getByKeyword(kw.keyword);
                        const isNew = existing.length === 0;

                        await this.storage.save({
                            keyword: kw.keyword,
                            source: source,
                            category: kw.category
                        });

                        result.bySource[source].collected++;
                        result.totalCollected++;

                        if (isNew) {
                            result.newKeywords++;
                        } else {
                            result.updatedKeywords++;
                        }
                    } catch (saveError: any) {
                        result.bySource[source].errors.push(`저장 실패: ${kw.keyword}`);
                    }
                }

                console.log(`[COLLECTOR-SCHEDULER] ${source}: ${result.bySource[source].collected}개 수집`);

            } catch (error: any) {
                result.bySource[source].errors.push(error?.message || String(error));
                result.errors.push(`${source}: ${error?.message || String(error)}`);
            }
        }

        result.duration = Date.now() - startTime;
        result.success = result.errors.length === 0;

        // 상태 업데이트
        this.lastResult = result;
        this.lastCollectionAt = new Date();
        this.totalCollections++;
        this.totalKeywordsCollected += result.totalCollected;

        console.log(`[COLLECTOR-SCHEDULER] 수집 완료: ${result.totalCollected}개 (신규: ${result.newKeywords}, 갱신: ${result.updatedKeywords}) - ${result.duration}ms`);

        return result;
    }

    // ==========================================================================
    // 상태 조회
    // ==========================================================================

    /**
     * 스케줄러 상태 조회
     */
    getStatus(): SchedulerStatus {
        const now = new Date();

        let nextCollectionAt: string | null = null;
        if (this.isRunning && this.lastCollectionAt) {
            const next = new Date(this.lastCollectionAt.getTime() + this.config.intervalMs);
            nextCollectionAt = next.toISOString();
        }

        return {
            isRunning: this.isRunning,
            lastCollectionAt: this.lastCollectionAt?.toISOString() || null,
            nextCollectionAt,
            lastResult: this.lastResult,
            totalCollections: this.totalCollections,
            totalKeywordsCollected: this.totalKeywordsCollected,
            uptime: this.startedAt ? now.getTime() - this.startedAt.getTime() : 0
        };
    }

    /**
     * 마지막 수집 결과 조회
     */
    getLastCollectionResult(): CollectionResult | null {
        return this.lastResult;
    }

    /**
     * 설정 조회
     */
    getConfig(): CollectorConfig {
        return { ...this.config };
    }

    /**
     * 설정 업데이트
     */
    updateConfig(updates: Partial<CollectorConfig>): void {
        const wasRunning = this.isRunning;

        if (wasRunning) {
            this.stop();
        }

        this.config = { ...this.config, ...updates };

        if (wasRunning) {
            this.start();
        }
    }
}

// ============================================================================
// 싱글톤 인스턴스
// ============================================================================

let schedulerInstance: KeywordCollectorScheduler | null = null;

/**
 * 싱글톤 스케줄러 인스턴스 가져오기
 */
export function getCollectorScheduler(config?: Partial<CollectorConfig>): KeywordCollectorScheduler {
    if (!schedulerInstance) {
        schedulerInstance = new KeywordCollectorScheduler(config);
    }
    return schedulerInstance;
}

/**
 * 스케줄러 인스턴스 리셋 (테스트용)
 */
export function resetCollectorScheduler(): void {
    if (schedulerInstance) {
        schedulerInstance.stop();
    }
    schedulerInstance = null;
}
