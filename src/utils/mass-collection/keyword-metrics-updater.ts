/**
 * 📊 키워드 메트릭스 업데이터 (Keyword Metrics Updater)
 * 
 * 저장된 키워드의 검색량/문서수를 주기적으로 갱신하고
 * 등급 변화를 추적합니다.
 */

import {
    KeywordStorage,
    getKeywordStorage,
    StoredKeyword,
    KeywordGrade
} from './keyword-storage';

// ============================================================================
// 인터페이스 정의
// ============================================================================

/**
 * 메트릭스 업데이트 결과
 */
export interface MetricsUpdateResult {
    success: boolean;
    timestamp: string;
    duration: number;                // 소요 시간 (ms)
    totalProcessed: number;          // 처리된 키워드 수
    metricsUpdated: number;          // 메트릭스 갱신된 수
    gradeChanges: GradeChange[];     // 등급 변경 목록
    errors: string[];
}

/**
 * 등급 변경 정보
 */
export interface GradeChange {
    keyword: string;
    previousGrade: KeywordGrade;
    newGrade: KeywordGrade;
    direction: 'up' | 'down';        // 상승 또는 하락
    searchVolume: number | null;
    documentCount: number | null;
    goldenRatio: number;
    changedAt: string;
}

/**
 * 등급 변화 리포트
 */
export interface GradeChangeReport {
    timestamp: string;
    totalKeywords: number;
    upgraded: GradeChange[];         // 등급 상승
    downgraded: GradeChange[];       // 등급 하락
    unchanged: number;               // 변화 없음
}

/**
 * 업데이터 설정
 */
export interface MetricsUpdaterConfig {
    batchSize: number;               // 배치당 처리 개수 (기본: 50)
    delayBetweenBatches: number;     // 배치 간 딜레이 (ms, 기본: 1000)
    apiTimeout: number;              // API 타임아웃 (ms, 기본: 10000)
}

// ============================================================================
// 상수 및 기본 설정
// ============================================================================

const DEFAULT_CONFIG: MetricsUpdaterConfig = {
    batchSize: 50,
    delayBetweenBatches: 1000,
    apiTimeout: 10000
};

const GRADE_ORDER: Record<KeywordGrade, number> = {
    'SSS': 6,
    'SS': 5,
    'S': 4,
    'A': 3,
    'B': 2,
    'C': 1
};

// ============================================================================
// KeywordMetricsUpdater 클래스
// ============================================================================

export class KeywordMetricsUpdater {
    private storage: KeywordStorage;
    private config: MetricsUpdaterConfig;
    private isUpdating: boolean = false;

    constructor(storage?: KeywordStorage, config: Partial<MetricsUpdaterConfig> = {}) {
        this.storage = storage || getKeywordStorage();
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    // ==========================================================================
    // 메트릭스 갱신
    // ==========================================================================

    /**
     * 모든 유효 키워드의 메트릭스 갱신
     */
    async updateAllMetrics(): Promise<MetricsUpdateResult> {
        if (this.isUpdating) {
            return {
                success: false,
                timestamp: new Date().toISOString(),
                duration: 0,
                totalProcessed: 0,
                metricsUpdated: 0,
                gradeChanges: [],
                errors: ['이미 업데이트가 진행 중입니다']
            };
        }

        this.isUpdating = true;
        const startTime = Date.now();
        console.log('[METRICS-UPDATER] 전체 메트릭스 갱신 시작...');

        const result: MetricsUpdateResult = {
            success: true,
            timestamp: new Date().toISOString(),
            duration: 0,
            totalProcessed: 0,
            metricsUpdated: 0,
            gradeChanges: [],
            errors: []
        };

        try {
            // 유효한 키워드만 가져오기
            const keywords = await this.storage.getValidKeywords({
                validOnly: true,
                sortBy: 'collectedAt',
                sortOrder: 'desc'
            });

            console.log(`[METRICS-UPDATER] 갱신 대상: ${keywords.length}개 키워드`);

            // 배치 처리
            for (let i = 0; i < keywords.length; i += this.config.batchSize) {
                const batch = keywords.slice(i, i + this.config.batchSize);
                const batchResults = await this.updateBatch(batch);

                result.totalProcessed += batchResults.processed;
                result.metricsUpdated += batchResults.updated;
                result.gradeChanges.push(...batchResults.gradeChanges);
                result.errors.push(...batchResults.errors);

                // 배치 간 딜레이 (API 제한 고려)
                if (i + this.config.batchSize < keywords.length) {
                    await this.delay(this.config.delayBetweenBatches);
                }

                // 진행률 로깅
                const progress = Math.round((i + batch.length) / keywords.length * 100);
                console.log(`[METRICS-UPDATER] 진행률: ${progress}% (${i + batch.length}/${keywords.length})`);
            }

        } catch (error: any) {
            result.success = false;
            result.errors.push(error?.message || String(error));
        } finally {
            this.isUpdating = false;
        }

        result.duration = Date.now() - startTime;

        // 결과 요약 로깅
        const upgraded = result.gradeChanges.filter(c => c.direction === 'up').length;
        const downgraded = result.gradeChanges.filter(c => c.direction === 'down').length;
        console.log(`[METRICS-UPDATER] 갱신 완료: ${result.metricsUpdated}개 갱신, 등급 상승 ${upgraded}개, 하락 ${downgraded}개 - ${result.duration}ms`);

        return result;
    }

    /**
     * 배치 업데이트
     */
    private async updateBatch(keywords: StoredKeyword[]): Promise<{
        processed: number;
        updated: number;
        gradeChanges: GradeChange[];
        errors: string[];
    }> {
        const result = {
            processed: 0,
            updated: 0,
            gradeChanges: [] as GradeChange[],
            errors: [] as string[]
        };

        // 키워드 목록 추출
        const keywordTexts = keywords.map(k => k.keyword);

        try {
            // 검색량 조회 (네이버 검색광고 API)
            const searchVolumes = await this.fetchSearchVolumes(keywordTexts);

            // 문서수 조회 (네이버 블로그 API)
            const documentCounts = await this.fetchDocumentCounts(keywordTexts);

            // 각 키워드 업데이트
            for (const keyword of keywords) {
                result.processed++;

                try {
                    const oldGrade = keyword.grade;
                    const newSearchVolume = searchVolumes.get(keyword.keyword);
                    const newDocumentCount = documentCounts.get(keyword.keyword);

                    // 메트릭스 업데이트
                    const updated = await this.storage.updateMetrics(keyword.id, {
                        searchVolume: newSearchVolume ?? keyword.searchVolume,
                        documentCount: newDocumentCount ?? keyword.documentCount
                    });

                    if (updated) {
                        result.updated++;

                        // 등급 변화 감지
                        if (updated.grade !== oldGrade) {
                            const direction = GRADE_ORDER[updated.grade] > GRADE_ORDER[oldGrade] ? 'up' : 'down';

                            result.gradeChanges.push({
                                keyword: keyword.keyword,
                                previousGrade: oldGrade,
                                newGrade: updated.grade,
                                direction,
                                searchVolume: updated.searchVolume,
                                documentCount: updated.documentCount,
                                goldenRatio: updated.goldenRatio,
                                changedAt: new Date().toISOString()
                            });
                        }
                    }
                } catch (error: any) {
                    result.errors.push(`${keyword.keyword}: ${error?.message}`);
                }
            }
        } catch (error: any) {
            result.errors.push(`배치 처리 실패: ${error?.message}`);
        }

        return result;
    }

    /**
     * 검색량 조회 (네이버 검색광고 API)
     */
    private async fetchSearchVolumes(keywords: string[]): Promise<Map<string, number | null>> {
        const volumes = new Map<string, number | null>();

        try {
            const { EnvironmentManager } = await import('../environment-manager');
            const env = EnvironmentManager.getInstance().getConfig();

            if (!env.naverSearchAdAccessLicense || !env.naverSearchAdSecretKey) {
                console.warn('[METRICS-UPDATER] 검색광고 API 설정 없음, 검색량 조회 스킵');
                return volumes;
            }

            const { getNaverSearchAdKeywordVolume } = await import('../naver-searchad-api');

            const results = await getNaverSearchAdKeywordVolume(
                {
                    accessLicense: env.naverSearchAdAccessLicense,
                    secretKey: env.naverSearchAdSecretKey,
                    customerId: env.naverSearchAdCustomerId
                },
                keywords
            );

            for (const result of results) {
                volumes.set(result.keyword, result.totalSearchVolume);
            }
        } catch (error: any) {
            console.warn('[METRICS-UPDATER] 검색량 조회 실패:', error?.message);
        }

        return volumes;
    }

    /**
     * 문서수 조회 (네이버 블로그 API)
     */
    private async fetchDocumentCounts(keywords: string[]): Promise<Map<string, number | null>> {
        const counts = new Map<string, number | null>();

        try {
            const { EnvironmentManager } = await import('../environment-manager');
            const env = EnvironmentManager.getInstance().getConfig();

            if (!env.naverClientId || !env.naverClientSecret) {
                console.warn('[METRICS-UPDATER] 네이버 API 설정 없음, 문서수 조회 스킵');
                return counts;
            }

            // 순차 조회 (API 제한 고려)
            for (const keyword of keywords) {
                try {
                    const response = await fetch(
                        `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(keyword)}&display=1`,
                        {
                            headers: {
                                'X-Naver-Client-Id': env.naverClientId,
                                'X-Naver-Client-Secret': env.naverClientSecret
                            }
                        }
                    );

                    if (response.ok) {
                        const data = await response.json();
                        counts.set(keyword, data.total || 0);
                    }

                    // API 호출 간격
                    await this.delay(100);
                } catch {
                    // 개별 실패 무시
                }
            }
        } catch (error: any) {
            console.warn('[METRICS-UPDATER] 문서수 조회 실패:', error?.message);
        }

        return counts;
    }

    // ==========================================================================
    // 단일 키워드 갱신
    // ==========================================================================

    /**
     * 특정 키워드 메트릭스 갱신
     */
    async updateKeyword(keyword: string): Promise<StoredKeyword | null> {
        const keywords = await this.storage.getByKeyword(keyword);
        if (keywords.length === 0) {
            return null;
        }

        // 첫 번째 결과 사용
        const stored = keywords[0];

        try {
            // 검색량 조회
            const volumes = await this.fetchSearchVolumes([keyword]);
            const documentCounts = await this.fetchDocumentCounts([keyword]);

            return await this.storage.updateMetrics(stored.id, {
                searchVolume: volumes.get(keyword) ?? stored.searchVolume,
                documentCount: documentCounts.get(keyword) ?? stored.documentCount
            });
        } catch (error: any) {
            console.error(`[METRICS-UPDATER] 키워드 갱신 실패 (${keyword}):`, error?.message);
            return null;
        }
    }

    // ==========================================================================
    // 등급 리포트
    // ==========================================================================

    /**
     * 등급 변화 리포트 생성
     */
    async getGradeChangeReport(): Promise<GradeChangeReport> {
        const keywords = await this.storage.getValidKeywords({ validOnly: true });

        const upgraded: GradeChange[] = [];
        const downgraded: GradeChange[] = [];
        let unchanged = 0;

        for (const keyword of keywords) {
            if (keyword.previousGrade && keyword.gradeChangedAt) {
                const direction = GRADE_ORDER[keyword.grade] > GRADE_ORDER[keyword.previousGrade] ? 'up' : 'down';

                const change: GradeChange = {
                    keyword: keyword.keyword,
                    previousGrade: keyword.previousGrade,
                    newGrade: keyword.grade,
                    direction,
                    searchVolume: keyword.searchVolume,
                    documentCount: keyword.documentCount,
                    goldenRatio: keyword.goldenRatio,
                    changedAt: keyword.gradeChangedAt
                };

                if (direction === 'up') {
                    upgraded.push(change);
                } else {
                    downgraded.push(change);
                }
            } else {
                unchanged++;
            }
        }

        // 최근 변경순 정렬
        upgraded.sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
        downgraded.sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());

        return {
            timestamp: new Date().toISOString(),
            totalKeywords: keywords.length,
            upgraded,
            downgraded,
            unchanged
        };
    }

    /**
     * 급등 키워드 감지 (C→A 이상 상승)
     */
    async detectRisingKeywords(): Promise<GradeChange[]> {
        const report = await this.getGradeChangeReport();

        return report.upgraded.filter(change => {
            const jump = GRADE_ORDER[change.newGrade] - GRADE_ORDER[change.previousGrade];
            return jump >= 2; // 2등급 이상 상승
        });
    }

    /**
     * 급락 키워드 감지 (A→C 이하 하락)
     */
    async detectFallingKeywords(): Promise<GradeChange[]> {
        const report = await this.getGradeChangeReport();

        return report.downgraded.filter(change => {
            const drop = GRADE_ORDER[change.previousGrade] - GRADE_ORDER[change.newGrade];
            return drop >= 2; // 2등급 이상 하락
        });
    }

    // ==========================================================================
    // 유틸리티
    // ==========================================================================

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 업데이트 진행 중 여부
     */
    get updating(): boolean {
        return this.isUpdating;
    }
}

// ============================================================================
// 싱글톤 인스턴스
// ============================================================================

let updaterInstance: KeywordMetricsUpdater | null = null;

/**
 * 싱글톤 메트릭스 업데이터 인스턴스 가져오기
 */
export function getMetricsUpdater(): KeywordMetricsUpdater {
    if (!updaterInstance) {
        updaterInstance = new KeywordMetricsUpdater();
    }
    return updaterInstance;
}

/**
 * 업데이터 인스턴스 리셋 (테스트용)
 */
export function resetMetricsUpdater(): void {
    updaterInstance = null;
}
