/**
 * 🗄️ 키워드 저장소 (Keyword Storage)
 * 
 * 72시간 실시간성 보장을 위한 키워드 저장 및 관리 시스템
 * JSON 파일 기반으로 시작, 추후 SQLite로 업그레이드 가능
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// 인터페이스 정의
// ============================================================================

/**
 * 저장되는 키워드 데이터 구조
 */
export interface StoredKeyword {
    id: string;                      // 고유 ID (keyword + source의 해시)
    keyword: string;                 // 키워드
    source: CollectorSource;         // 수집 소스
    category: string;                // 카테고리 (celeb, it, life_tips 등)

    // 메트릭스
    searchVolume: number | null;     // 검색량
    documentCount: number | null;    // 문서수
    goldenRatio: number;             // 황금비율
    grade: KeywordGrade;             // 등급

    // 시간 정보
    collectedAt: string;             // 최초 수집 시간 (ISO 8601)
    metricsUpdatedAt: string;        // 메트릭스 갱신 시간

    // 변화 추적
    previousGrade?: KeywordGrade;    // 이전 등급
    gradeChangedAt?: string;         // 등급 변경 시간

    // 유효성
    isValid: boolean;                // 72시간 이내 여부
    validUntil: string;              // 만료 시간 (수집 시간 + 72시간)

    // 추가 정보
    frequency?: number;              // 수집 빈도 (같은 키워드 재수집 시 증가)
    isSmartBlockKeyword?: boolean;   // 스마트블록 키워드 여부
}

/**
 * 수집 소스 타입
 */
export type CollectorSource =
    | 'zum'                  // ZUM 실시간
    | 'nate'                 // 네이트 이슈
    | 'daum'                 // 다음 실시간
    | 'google'               // 구글 트렌드
    | 'signal'               // Signal.bz (네이버 트렌드)
    | 'naver_autocomplete'   // 네이버 자동완성
    | 'smart_block'          // 스마트블록 연관 키워드
    | 'news'                 // 뉴스 이슈
    | 'searchad'             // 네이버 검색광고 연관
    | 'manual';              // 수동 입력

/**
 * 키워드 등급
 */
export type KeywordGrade = 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C';

/**
 * 필터 옵션
 */
export interface FilterOptions {
    category?: string;               // 카테고리 필터
    sources?: CollectorSource[];     // 소스 필터
    minGrade?: KeywordGrade;         // 최소 등급
    minSearchVolume?: number;        // 최소 검색량
    maxDocumentCount?: number;       // 최대 문서수
    minGoldenRatio?: number;         // 최소 황금비율
    validOnly?: boolean;             // 유효한 키워드만 (기본: true)
    limit?: number;                  // 결과 제한
    sortBy?: 'goldenRatio' | 'searchVolume' | 'collectedAt' | 'grade';
    sortOrder?: 'asc' | 'desc';
}

/**
 * 저장소 통계
 */
export interface StorageStats {
    totalKeywords: number;           // 전체 키워드 수
    validKeywords: number;           // 유효 키워드 수 (72시간 이내)
    expiredKeywords: number;         // 만료된 키워드 수
    keywordsBySource: Record<CollectorSource, number>;
    keywordsByCategory: Record<string, number>;
    keywordsByGrade: Record<KeywordGrade, number>;
    lastUpdated: string;
    oldestKeyword?: string;          // 가장 오래된 수집 시간
    newestKeyword?: string;          // 가장 최신 수집 시간
}

// ============================================================================
// 상수
// 카테고리별 유효시간 (빠르게 변하는 뉴스 = 짧게, 실용정보 = 길게)
function getValidityHours(category: string): number {
    switch (category) {
        case 'celeb':      // 연예인 (비보/열애 등 빠르게 변함)
        case 'news':       // 뉴스
        case 'issue':      // 이슈
            return 24;     // 24시간
        case 'sports':     // 스포츠
            return 36;     // 36시간
        case 'policy':     // 정책/지원금 (발표 후 며칠간 유효)
        case 'finance':    // 금융
            return 48;     // 48시간
        case 'life_tips':  // 생활/리빙
        case 'health':     // 건강
        case 'it':         // IT
        case 'travel':     // 여행
        default:
            return 72;     // 72시간 (에버그린 콘텐츠)
    }
}

const STORAGE_DIR = 'data';
const STORAGE_FILE = 'keywords-storage.json';

const GRADE_ORDER: Record<KeywordGrade, number> = {
    'SSS': 6,
    'SS': 5,
    'S': 4,
    'A': 3,
    'B': 2,
    'C': 1
};

// ============================================================================
// 유틸리티 함수
// ============================================================================

/**
 * 키워드 ID 생성 (keyword + source 해시)
 */
function generateKeywordId(keyword: string, source: CollectorSource): string {
    const normalized = keyword.toLowerCase().replace(/\s+/g, '_');
    return `${normalized}__${source}`;
}

/**
 * 만료 시간 계산 (카테고리별 차등 유효기간)
 */
function calculateValidUntil(fromDate: Date = new Date(), category: string = 'general'): string {
    const validUntil = new Date(fromDate);
    validUntil.setHours(validUntil.getHours() + getValidityHours(category));
    return validUntil.toISOString();
}

/**
 * 키워드가 유효한지 확인 (72시간 이내)
 */
function isKeywordValid(keyword: StoredKeyword): boolean {
    const validUntil = new Date(keyword.validUntil);
    return validUntil > new Date();
}

/**
 * 등급 계산
 */
function calculateGrade(searchVolume: number | null, documentCount: number | null, goldenRatio: number): KeywordGrade {
    const sv = searchVolume ?? 0;
    const dc = documentCount ?? Infinity;

    // 🚨 산정 기준 강화: 검색량은 많은데 문서수가 기이하게 적은 경우 (수집 오류 또는 일시적 현상)
    // 예: 검색량 10만건인데 문서수가 1000개 미만이면 SSS가 아니라 A등급 정도로 보수적 판단
    const isSuspiciouslyLowDocs = sv > 10000 && dc < 1000;

    // SSS: 황금비율 2.0 이상 + 검색량 1000 이상 + 문서수 5000 이하
    if (!isSuspiciouslyLowDocs && goldenRatio >= 2.0 && sv >= 1000 && dc <= 5000) return 'SSS';

    // SS: 황금비율 1.0 이상 + 검색량 500 이상 + 문서수 10000 이하
    if (!isSuspiciouslyLowDocs && goldenRatio >= 1.0 && sv >= 500 && dc <= 10000) return 'SS';

    // S: 황금비율 0.5 이상 + 검색량 300 이상 + 문서수 20000 이하
    if (goldenRatio >= 0.5 && sv >= 300 && dc <= 20000) return 'S';

    // A: 황금비율 0.3 이상 + 검색량 200 이상
    if (goldenRatio >= 0.3 && sv >= 200) return 'A';

    // B: 황금비율 0.1 이상 또는 검색량 100 이상
    if (goldenRatio >= 0.1 || sv >= 100) return 'B';

    return 'C';
}

/**
 * 황금비율 계산
 */
function calculateGoldenRatio(searchVolume: number | null, documentCount: number | null): number {
    const sv = searchVolume ?? 0;
    const dc = documentCount ?? 0;

    if (dc === 0) return sv > 0 ? 999 : 0;
    return Math.round((sv / dc) * 100) / 100;
}

// ============================================================================
// KeywordStorage 클래스
// ============================================================================

export class KeywordStorage {
    private storagePath: string;
    private keywords: Map<string, StoredKeyword> = new Map();
    private isDirty: boolean = false;
    private saveTimer: NodeJS.Timeout | null = null;

    constructor(customStoragePath?: string) {
        // 배포판에서 Program Files 쓰기 금지 방지 → AppData 사용
        let defaultDir: string;
        try {
            const { app } = require('electron');
            defaultDir = app.getPath('userData');
        } catch {
            defaultDir = process.cwd();
        }
        this.storagePath = customStoragePath || path.join(defaultDir, STORAGE_DIR, STORAGE_FILE);
        this.ensureStorageDir();
        this.load();
    }

    /**
     * 저장소 디렉토리 생성
     */
    private ensureStorageDir(): void {
        const dir = path.dirname(this.storagePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    /**
     * 저장소에서 데이터 로드
     */
    private load(): void {
        try {
            if (fs.existsSync(this.storagePath)) {
                const data = fs.readFileSync(this.storagePath, 'utf-8');
                const parsed = JSON.parse(data);

                if (Array.isArray(parsed.keywords)) {
                    for (const kw of parsed.keywords) {
                        // 유효성 갱신
                        kw.isValid = isKeywordValid(kw);
                        this.keywords.set(kw.id, kw);
                    }
                }

                console.log(`[KEYWORD-STORAGE] 로드 완료: ${this.keywords.size}개 키워드`);
            }
        } catch (error: any) {
            console.warn('[KEYWORD-STORAGE] 로드 실패, 새 저장소 생성:', error?.message);
            this.keywords = new Map();
        }
    }

    /**
     * 저장소에 데이터 저장 (디바운스 적용)
     */
    private scheduleSave(): void {
        this.isDirty = true;

        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
        }

        // 1초 디바운스
        this.saveTimer = setTimeout(() => {
            this.saveNow();
        }, 1000);
    }

    /**
     * 즉시 저장
     */
    saveNow(): void {
        if (!this.isDirty) return;

        try {
            const data = {
                version: 1,
                lastUpdated: new Date().toISOString(),
                keywords: Array.from(this.keywords.values())
            };

            fs.writeFileSync(this.storagePath, JSON.stringify(data, null, 2), 'utf-8');
            this.isDirty = false;
            console.log(`[KEYWORD-STORAGE] 저장 완료: ${this.keywords.size}개 키워드`);
        } catch (error: any) {
            console.error('[KEYWORD-STORAGE] 저장 실패:', error?.message);
        }
    }

    // ==========================================================================
    // 키워드 저장/조회/삭제
    // ==========================================================================

    /**
     * 키워드 저장 (신규 또는 업데이트)
     */
    async save(input: {
        keyword: string;
        source: CollectorSource;
        category?: string;
        searchVolume?: number | null;
        documentCount?: number | null;
    }): Promise<StoredKeyword> {
        const { keyword, source, category = 'unknown' } = input;
        const id = generateKeywordId(keyword, source);

        const existing = this.keywords.get(id);
        const now = new Date().toISOString();

        // 메트릭스 계산
        const searchVolume = input.searchVolume ?? existing?.searchVolume ?? null;
        const documentCount = input.documentCount ?? existing?.documentCount ?? null;
        const goldenRatio = calculateGoldenRatio(searchVolume, documentCount);
        const grade = calculateGrade(searchVolume, documentCount, goldenRatio);

        // 등급 변화 추적
        let previousGrade = existing?.grade;
        let gradeChangedAt = existing?.gradeChangedAt;

        if (existing && existing.grade !== grade) {
            previousGrade = existing.grade;
            gradeChangedAt = now;
        }

        const collectedAt = existing?.collectedAt || now;

        // 🔒 좀비 트렌드 방지: 최초 수집일로부터 카테고리별 절대 수명이 지나면 더 이상 갱신하지 않음
        let validUntil = existing?.validUntil || calculateValidUntil(new Date(collectedAt), category);
        const isActuallyExpired = new Date(validUntil) <= new Date();

        const stored: StoredKeyword = {
            id,
            keyword,
            source,
            category,
            searchVolume,
            documentCount,
            goldenRatio,
            grade,
            collectedAt,
            metricsUpdatedAt: now,
            previousGrade,
            gradeChangedAt,
            isValid: !isActuallyExpired,
            validUntil,
            frequency: (existing?.frequency || 0) + 1,
            isSmartBlockKeyword: input.source === 'smart_block'
        };

        this.keywords.set(id, stored);
        this.scheduleSave();

        return stored;
    }

    /**
     * 여러 키워드 일괄 저장
     */
    async saveMany(inputs: Array<{
        keyword: string;
        source: CollectorSource;
        category?: string;
        searchVolume?: number | null;
        documentCount?: number | null;
    }>): Promise<StoredKeyword[]> {
        const results: StoredKeyword[] = [];

        for (const input of inputs) {
            const result = await this.save(input);
            results.push(result);
        }

        return results;
    }

    /**
     * 키워드 조회 (ID로)
     */
    async getById(id: string): Promise<StoredKeyword | null> {
        const keyword = this.keywords.get(id);
        if (!keyword) return null;

        // 유효성 확인 및 갱신
        keyword.isValid = isKeywordValid(keyword);
        return keyword;
    }

    /**
     * 키워드 조회 (키워드 텍스트로)
     */
    async getByKeyword(keyword: string): Promise<StoredKeyword[]> {
        const normalized = keyword.toLowerCase();
        const results: StoredKeyword[] = [];

        for (const stored of this.keywords.values()) {
            if (stored.keyword.toLowerCase() === normalized) {
                stored.isValid = isKeywordValid(stored);
                results.push(stored);
            }
        }

        return results;
    }

    /**
     * 유효한 키워드 목록 조회 (필터 적용)
     */
    async getValidKeywords(options: FilterOptions = {}): Promise<StoredKeyword[]> {
        const {
            category,
            sources,
            minGrade,
            minSearchVolume,
            maxDocumentCount,
            minGoldenRatio,
            validOnly = true,
            limit,
            sortBy = 'goldenRatio',
            sortOrder = 'desc'
        } = options;

        let results: StoredKeyword[] = [];

        for (const keyword of this.keywords.values()) {
            // 유효성 갱신
            keyword.isValid = isKeywordValid(keyword);

            // 유효성 필터
            if (validOnly && !keyword.isValid) continue;

            // 카테고리 필터
            if (category && keyword.category !== category) continue;

            // 소스 필터
            if (sources && sources.length > 0 && !sources.includes(keyword.source)) continue;

            // 등급 필터
            if (minGrade && GRADE_ORDER[keyword.grade] < GRADE_ORDER[minGrade]) continue;

            // 검색량 필터
            if (minSearchVolume && (keyword.searchVolume ?? 0) < minSearchVolume) continue;

            // 문서수 필터
            if (maxDocumentCount && (keyword.documentCount ?? Infinity) > maxDocumentCount) continue;

            // 황금비율 필터
            if (minGoldenRatio && keyword.goldenRatio < minGoldenRatio) continue;

            results.push(keyword);
        }

        // 정렬
        results.sort((a, b) => {
            let aVal: number, bVal: number;

            switch (sortBy) {
                case 'goldenRatio':
                    aVal = a.goldenRatio;
                    bVal = b.goldenRatio;
                    break;
                case 'searchVolume':
                    aVal = a.searchVolume ?? 0;
                    bVal = b.searchVolume ?? 0;
                    break;
                case 'collectedAt':
                    aVal = new Date(a.collectedAt).getTime();
                    bVal = new Date(b.collectedAt).getTime();
                    break;
                case 'grade':
                    aVal = GRADE_ORDER[a.grade];
                    bVal = GRADE_ORDER[b.grade];
                    break;
                default:
                    aVal = a.goldenRatio;
                    bVal = b.goldenRatio;
            }

            return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
        });

        // 결과 제한
        if (limit && limit > 0) {
            results = results.slice(0, limit);
        }

        return results;
    }

    /**
     * 키워드 삭제
     */
    async delete(id: string): Promise<boolean> {
        const deleted = this.keywords.delete(id);
        if (deleted) {
            this.scheduleSave();
        }
        return deleted;
    }

    // ==========================================================================
    // 만료 관리
    // ==========================================================================

    /**
     * 만료된 키워드 정리 (72시간 지난 키워드 삭제)
     */
    async cleanupExpired(): Promise<number> {
        const now = new Date();
        let deletedCount = 0;

        for (const [id, keyword] of this.keywords) {
            const validUntil = new Date(keyword.validUntil);
            if (validUntil <= now) {
                this.keywords.delete(id);
                deletedCount++;
            }
        }

        if (deletedCount > 0) {
            console.log(`[KEYWORD-STORAGE] 만료된 키워드 ${deletedCount}개 삭제`);
            this.scheduleSave();
        }

        return deletedCount;
    }

    /**
     * 키워드 유효기간 연장 (메트릭스 갱신 시)
     */
    async extendValidity(id: string): Promise<void> {
        const keyword = this.keywords.get(id);
        if (keyword) {
            keyword.validUntil = calculateValidUntil();
            keyword.isValid = true;
            keyword.metricsUpdatedAt = new Date().toISOString();
            this.scheduleSave();
        }
    }

    // ==========================================================================
    // 메트릭스 업데이트
    // ==========================================================================

    /**
     * 키워드 메트릭스 업데이트
     */
    async updateMetrics(id: string, metrics: {
        searchVolume?: number | null;
        documentCount?: number | null;
    }): Promise<StoredKeyword | null> {
        const keyword = this.keywords.get(id);
        if (!keyword) return null;

        const now = new Date().toISOString();

        // 메트릭스 업데이트
        if (metrics.searchVolume !== undefined) {
            keyword.searchVolume = metrics.searchVolume;
        }
        if (metrics.documentCount !== undefined) {
            keyword.documentCount = metrics.documentCount;
        }

        // 황금비율 및 등급 재계산
        keyword.goldenRatio = calculateGoldenRatio(keyword.searchVolume, keyword.documentCount);
        const newGrade = calculateGrade(keyword.searchVolume, keyword.documentCount, keyword.goldenRatio);

        // 등급 변화 추적
        if (keyword.grade !== newGrade) {
            keyword.previousGrade = keyword.grade;
            keyword.gradeChangedAt = now;
            keyword.grade = newGrade;
        }

        // 🔒 유효기간 연장 로직 제거 (메트릭스만 갱신, 절대 수명은 유지)
        keyword.metricsUpdatedAt = now;
        keyword.isValid = isKeywordValid(keyword);

        this.scheduleSave();
        return keyword;
    }

    // ==========================================================================
    // 통계
    // ==========================================================================

    /**
     * 저장소 통계 조회
     */
    async getStats(): Promise<StorageStats> {
        const keywordsBySource: Record<string, number> = {};
        const keywordsByCategory: Record<string, number> = {};
        const keywordsByGrade: Record<string, number> = {};

        let validCount = 0;
        let expiredCount = 0;
        let oldestTime: Date | null = null;
        let newestTime: Date | null = null;

        for (const keyword of this.keywords.values()) {
            // 유효성 갱신
            keyword.isValid = isKeywordValid(keyword);

            if (keyword.isValid) {
                validCount++;
            } else {
                expiredCount++;
            }

            // 소스별 통계
            keywordsBySource[keyword.source] = (keywordsBySource[keyword.source] || 0) + 1;

            // 카테고리별 통계
            keywordsByCategory[keyword.category] = (keywordsByCategory[keyword.category] || 0) + 1;

            // 등급별 통계
            keywordsByGrade[keyword.grade] = (keywordsByGrade[keyword.grade] || 0) + 1;

            // 시간 범위
            const collected = new Date(keyword.collectedAt);
            if (!oldestTime || collected < oldestTime) oldestTime = collected;
            if (!newestTime || collected > newestTime) newestTime = collected;
        }

        return {
            totalKeywords: this.keywords.size,
            validKeywords: validCount,
            expiredKeywords: expiredCount,
            keywordsBySource: keywordsBySource as Record<CollectorSource, number>,
            keywordsByCategory,
            keywordsByGrade: keywordsByGrade as Record<KeywordGrade, number>,
            lastUpdated: new Date().toISOString(),
            oldestKeyword: oldestTime?.toISOString(),
            newestKeyword: newestTime?.toISOString()
        };
    }

    /**
     * 전체 키워드 수
     */
    get size(): number {
        return this.keywords.size;
    }

    /**
     * 모든 키워드 반환 (디버깅용)
     */
    async getAll(): Promise<StoredKeyword[]> {
        return Array.from(this.keywords.values());
    }

    /**
     * 저장소 초기화 (모든 데이터 삭제)
     */
    async clear(): Promise<void> {
        this.keywords.clear();
        this.scheduleSave();
        console.log('[KEYWORD-STORAGE] 저장소 초기화됨');
    }
}

// ============================================================================
// 싱글톤 인스턴스
// ============================================================================

let storageInstance: KeywordStorage | null = null;

/**
 * 싱글톤 키워드 저장소 인스턴스 가져오기
 */
export function getKeywordStorage(): KeywordStorage {
    if (!storageInstance) {
        storageInstance = new KeywordStorage();
    }
    return storageInstance;
}

/**
 * 저장소 인스턴스 리셋 (테스트용)
 */
export function resetKeywordStorage(): void {
    if (storageInstance) {
        storageInstance.saveNow();
    }
    storageInstance = null;
}
