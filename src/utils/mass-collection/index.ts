/**
 * 🏭 대규모 키워드 수집 시스템 (Mass Collection System)
 * 
 * 72시간 실시간성 99% 보장 키워드 수집/저장/추천 시스템
 * 
 * 주요 기능:
 * 1. 다중 소스 자동 수집 (30분 간격)
 * 2. 로컬 저장소 관리 (72시간 유효)
 * 3. 메트릭스 주기적 갱신 (6시간 간격)
 * 4. 실시간 키워드 추천 API
 */

// 저장소
export {
    KeywordStorage,
    getKeywordStorage,
    resetKeywordStorage,
    StoredKeyword,
    CollectorSource,
    KeywordGrade,
    FilterOptions,
    StorageStats
} from './keyword-storage';

// 수집 스케줄러
export {
    KeywordCollectorScheduler,
    getCollectorScheduler,
    resetCollectorScheduler,
    CollectorConfig,
    CollectionResult,
    SchedulerStatus
} from './keyword-collector-scheduler';

// 메트릭스 업데이터
export {
    KeywordMetricsUpdater,
    getMetricsUpdater,
    resetMetricsUpdater,
    MetricsUpdateResult,
    GradeChange,
    GradeChangeReport
} from './keyword-metrics-updater';

// 추천 API
export {
    FreshKeywordsAPI,
    getFreshKeywordsAPI,
    resetFreshKeywordsAPI,
    FreshKeywordOptions,
    FreshKeyword,
    FreshKeywordResult,
    MassCollectionSystemStatus
} from './fresh-keywords-api';

// ============================================================================
// 통합 시스템 클래스
// ============================================================================

import { getKeywordStorage, KeywordStorage } from './keyword-storage';
import { getCollectorScheduler, KeywordCollectorScheduler, CollectorConfig } from './keyword-collector-scheduler';
import { getMetricsUpdater, KeywordMetricsUpdater } from './keyword-metrics-updater';
import { getFreshKeywordsAPI, FreshKeywordsAPI, FreshKeywordResult, FreshKeywordOptions } from './fresh-keywords-api';

/**
 * 시스템 설정
 */
export interface MassCollectionSystemConfig {
    autoStart?: boolean;                    // 자동 시작 (기본: false)
    collectionIntervalMs?: number;          // 수집 간격 (기본: 30분)
    metricsUpdateIntervalMs?: number;       // 메트릭스 갱신 간격 (기본: 6시간)
    sources?: CollectorConfig['sources'];   // 활성화할 소스
}

/**
 * 대규모 수집 시스템 통합 클래스
 */
export class MassCollectionSystem {
    private storage: KeywordStorage;
    private scheduler: KeywordCollectorScheduler;
    private updater: KeywordMetricsUpdater;
    private api: FreshKeywordsAPI;
    private metricsUpdateTimer: NodeJS.Timeout | null = null;
    private config: MassCollectionSystemConfig;

    constructor(config: MassCollectionSystemConfig = {}) {
        this.config = config;
        this.storage = getKeywordStorage();
        this.scheduler = getCollectorScheduler({
            intervalMs: config.collectionIntervalMs,
            sources: config.sources,
            autoStart: false  // 수동 제어
        });
        this.updater = getMetricsUpdater();
        this.api = getFreshKeywordsAPI();

        if (config.autoStart) {
            this.start();
        }
    }

    /**
     * 시스템 시작
     */
    start(): void {
        console.log('[MASS-COLLECTION] 시스템 시작...');

        // 수집 스케줄러 시작
        this.scheduler.start();

        // 메트릭스 갱신 스케줄러 시작 (6시간마다)
        const metricsInterval = this.config.metricsUpdateIntervalMs || 6 * 60 * 60 * 1000;
        this.metricsUpdateTimer = setInterval(() => {
            this.updater.updateAllMetrics().catch(console.error);
        }, metricsInterval);

        console.log('[MASS-COLLECTION] 시스템 시작 완료');
        console.log(`[MASS-COLLECTION] - 수집 간격: ${(this.config.collectionIntervalMs || 30 * 60 * 1000) / 1000 / 60}분`);
        console.log(`[MASS-COLLECTION] - 메트릭스 갱신 간격: ${metricsInterval / 1000 / 60 / 60}시간`);
    }

    /**
     * 시스템 중지
     */
    stop(): void {
        console.log('[MASS-COLLECTION] 시스템 중지...');

        this.scheduler.stop();

        if (this.metricsUpdateTimer) {
            clearInterval(this.metricsUpdateTimer);
            this.metricsUpdateTimer = null;
        }

        console.log('[MASS-COLLECTION] 시스템 중지 완료');
    }

    /**
     * 72시간 내 신선한 키워드 추천
     */
    async getFreshKeywords(options?: FreshKeywordOptions): Promise<FreshKeywordResult> {
        return this.api.getFreshKeywords(options);
    }

    /**
     * 급등 키워드 추천
     */
    async getRisingKeywords(count: number = 10): Promise<FreshKeywordResult> {
        return this.api.getRisingKeywords(count);
    }

    /**
     * 블루오션 키워드 추천
     */
    async getBlueOceanKeywords(count: number = 10): Promise<FreshKeywordResult> {
        return this.api.getBlueOceanKeywords(count);
    }

    /**
     * 즉시 수집 실행
     */
    async collectNow(): Promise<void> {
        await this.scheduler.collectNow();
    }

    /**
     * 메트릭스 즉시 갱신
     */
    async updateMetricsNow(): Promise<void> {
        await this.updater.updateAllMetrics();
    }

    /**
     * 시스템 상태 조회
     */
    async getStatus() {
        return this.api.getSystemStatus();
    }

    /**
     * 만료 키워드 정리
     */
    async cleanup(): Promise<number> {
        return this.storage.cleanupExpired();
    }
}

// ============================================================================
// 싱글톤 인스턴스
// ============================================================================

let systemInstance: MassCollectionSystem | null = null;

/**
 * 싱글톤 시스템 인스턴스 가져오기
 */
export function getMassCollectionSystem(config?: MassCollectionSystemConfig): MassCollectionSystem {
    if (!systemInstance) {
        systemInstance = new MassCollectionSystem(config);
    }
    return systemInstance;
}

/**
 * 시스템 인스턴스 리셋 (테스트용)
 */
export function resetMassCollectionSystem(): void {
    if (systemInstance) {
        systemInstance.stop();
    }
    systemInstance = null;
}
