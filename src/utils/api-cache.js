"use strict";
/**
 * 고성능 API 응답 캐싱 시스템
 * 메모리 효율적이고 TTL 기반 캐시 관리
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiCache = exports.ApiCache = void 0;
exports.cachedApiCall = cachedApiCall;
class ApiCache {
    constructor(maxSize = 1000, defaultTTL = 300000) {
        this.cache = new Map();
        this.cleanupInterval = null;
        this.maxSize = maxSize;
        this.defaultTTL = defaultTTL;
        this.startCleanup();
    }
    /**
     * 캐시에서 데이터 가져오기
     */
    get(key) {
        const entry = this.cache.get(key);
        if (!entry) {
            return null;
        }
        // TTL 확인
        const now = Date.now();
        if (now - entry.timestamp > entry.ttl) {
            this.cache.delete(key);
            return null;
        }
        // 접근 통계 업데이트
        entry.accessCount++;
        entry.lastAccessed = now;
        return entry.data;
    }
    /**
     * 캐시에 데이터 저장
     */
    set(key, data, ttl) {
        // 캐시 크기 제한 확인
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            this.evictLeastRecentlyUsed();
        }
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl: ttl || this.defaultTTL,
            accessCount: 0,
            lastAccessed: Date.now()
        });
    }
    /**
     * 캐시 키 생성 (API 요청 파라미터 기반)
     */
    generateKey(prefix, params) {
        const sortedParams = Object.keys(params)
            .sort()
            .map(key => `${key}=${JSON.stringify(params[key])}`)
            .join('&');
        return `${prefix}:${sortedParams}`;
    }
    /**
     * 캐시 무효화
     */
    invalidate(pattern) {
        if (!pattern) {
            this.cache.clear();
            return;
        }
        for (const key of this.cache.keys()) {
            if (key.includes(pattern)) {
                this.cache.delete(key);
            }
        }
    }
    /**
     * LRU 기반 캐시 제거
     */
    evictLeastRecentlyUsed() {
        let lruKey = null;
        let lruTime = Infinity;
        for (const [key, entry] of this.cache.entries()) {
            if (entry.lastAccessed < lruTime) {
                lruTime = entry.lastAccessed;
                lruKey = key;
            }
        }
        if (lruKey) {
            this.cache.delete(lruKey);
        }
    }
    /**
     * 만료된 캐시 정리
     */
    cleanup() {
        const now = Date.now();
        const keysToDelete = [];
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > entry.ttl) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(key => this.cache.delete(key));
    }
    /**
     * 주기적 정리 시작
     */
    startCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        // 1분마다 정리
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 60000);
    }
    /**
     * 캐시 통계
     */
    getStats() {
        let totalAccess = 0;
        for (const entry of this.cache.values()) {
            totalAccess += entry.accessCount;
        }
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            hitRate: totalAccess > 0 ? totalAccess / (totalAccess + this.cache.size) : 0
        };
    }
    /**
     * 리소스 정리
     */
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.cache.clear();
    }
}
exports.ApiCache = ApiCache;
// 전역 캐시 인스턴스
exports.apiCache = new ApiCache(1000, 300000); // 최대 1000개, 기본 5분 TTL
/**
 * 캐시된 API 호출 래퍼
 */
async function cachedApiCall(key, apiCall, ttl) {
    // 캐시 확인
    const cached = exports.apiCache.get(key);
    if (cached !== null) {
        return cached;
    }
    // API 호출
    const data = await apiCall();
    // 캐시 저장
    exports.apiCache.set(key, data, ttl);
    return data;
}
