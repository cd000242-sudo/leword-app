"use strict";
/**
 * Google CSE Rate Limiter 및 Cache 시스템
 * 429 오류 방지를 위한 요청 큐 및 캐싱 시스템
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleCSECache = exports.GoogleCSERateLimiter = void 0;
exports.safeCSERequest = safeCSERequest;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Electron app은 선택적으로 import (Node.js 환경에서도 동작하도록)
let app;
try {
    app = require('electron')?.app;
}
catch {
    // Electron이 없는 환경에서는 무시
}
/**
 * Google CSE Rate Limiter
 * - 요청 간 최소 1초 딜레이
 * - 일일 할당량 추적 (무료: 100회/일)
 * - 요청 큐 시스템으로 순차 처리
 */
class GoogleCSERateLimiter {
    constructor() {
        this.requestQueue = [];
        this.isProcessing = false;
        this.lastRequestTime = 0;
        this.dailyRequestCount = 0;
        this.dailyResetTime = 0;
        this.minDelay = 500; // 최소 0.5초 간격 (성능 최적화: 1초 -> 0.5초)
        this.maxDailyRequests = 100; // 무료 계정 기준
        this.concurrentRequests = 0; // 동시 요청 수 추적
        this.maxConcurrent = 2; // 최대 동시 요청 수 (성능 최적화)
        // 사용량 파일 경로 설정
        try {
            const userDataPath = app?.getPath('userData') || process.cwd();
            this.usageFilePath = path.join(userDataPath, 'google-cse-usage.json');
            this.loadDailyUsage();
        }
        catch {
            this.usageFilePath = path.join(process.cwd(), 'google-cse-usage.json');
            this.loadDailyUsage();
        }
        this.resetDailyCounter();
    }
    static getInstance() {
        if (!GoogleCSERateLimiter.instance) {
            GoogleCSERateLimiter.instance = new GoogleCSERateLimiter();
        }
        return GoogleCSERateLimiter.instance;
    }
    /**
     * 일일 사용량 로드
     */
    loadDailyUsage() {
        try {
            if (fs.existsSync(this.usageFilePath)) {
                const data = JSON.parse(fs.readFileSync(this.usageFilePath, 'utf8'));
                const savedDate = new Date(data.date);
                const today = new Date();
                // 같은 날이면 사용량 복원
                if (savedDate.toDateString() === today.toDateString()) {
                    this.dailyRequestCount = data.count || 0;
                }
                else {
                    // 다른 날이면 리셋
                    this.dailyRequestCount = 0;
                }
            }
        }
        catch (error) {
            console.warn('[CSE-RATE-LIMITER] 사용량 로드 실패:', error);
            this.dailyRequestCount = 0;
        }
    }
    /**
     * 일일 사용량 저장
     */
    saveDailyUsage() {
        try {
            fs.writeFileSync(this.usageFilePath, JSON.stringify({
                date: new Date().toISOString(),
                count: this.dailyRequestCount
            }, null, 2), 'utf8');
        }
        catch (error) {
            console.warn('[CSE-RATE-LIMITER] 사용량 저장 실패:', error);
        }
    }
    /**
     * 일일 카운터 리셋 (자정)
     */
    resetDailyCounter() {
        const now = Date.now();
        const tomorrow = new Date();
        tomorrow.setHours(24, 0, 0, 0);
        this.dailyResetTime = tomorrow.getTime();
        this.dailyRequestCount = 0;
        this.saveDailyUsage();
        // 다음 자정까지 대기
        const msUntilMidnight = tomorrow.getTime() - now;
        if (msUntilMidnight > 0) {
            setTimeout(() => this.resetDailyCounter(), msUntilMidnight);
        }
    }
    /**
     * 요청 큐에 추가하고 처리
     */
    async request(fn) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push(async () => {
                try {
                    const result = await fn();
                    resolve(result);
                }
                catch (error) {
                    reject(error);
                }
            });
            this.processQueue();
        });
    }
    /**
     * 요청 큐 처리 (성능 최적화: 병렬 처리 지원)
     */
    async processQueue() {
        if (this.requestQueue.length === 0)
            return;
        // 일일 할당량 체크
        if (this.dailyRequestCount >= this.maxDailyRequests) {
            const remainingTime = this.dailyResetTime - Date.now();
            const hours = Math.floor(remainingTime / (1000 * 60 * 60));
            const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
            throw new Error(`Google CSE 일일 할당량 초과 (${this.dailyRequestCount}/${this.maxDailyRequests}회). ${hours}시간 ${minutes}분 후 재사용 가능합니다.`);
        }
        // 동시 요청 수가 최대치에 도달하면 대기
        while (this.concurrentRequests >= this.maxConcurrent) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        // 병렬 처리: 최대 2개까지 동시 요청
        const requestFn = this.requestQueue.shift();
        if (!requestFn)
            return;
        this.concurrentRequests++;
        // 비동기로 처리 (블로킹 방지)
        this.processRequest(requestFn).finally(() => {
            this.concurrentRequests--;
            // 다음 요청 처리
            if (this.requestQueue.length > 0) {
                this.processQueue();
            }
        });
    }
    /**
     * 개별 요청 처리
     */
    async processRequest(requestFn) {
        // 최소 딜레이 확인 (0.5초 간격)
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.minDelay) {
            await new Promise(resolve => setTimeout(resolve, this.minDelay - timeSinceLastRequest));
        }
        try {
            await requestFn();
            this.lastRequestTime = Date.now();
            this.dailyRequestCount++;
            this.saveDailyUsage();
        }
        catch (error) {
            // 429 오류인 경우 조용히 처리
            if (error?.status === 429 || error?.response?.status === 429) {
                console.warn('[CSE-RATE-LIMITER] 429 오류 - 요청 건너뜀');
                // 다음 요청까지 더 긴 대기 (하지만 블로킹하지 않음)
                setTimeout(() => { }, 2000);
            }
            else {
                throw error;
            }
        }
    }
    /**
     * 일일 사용량 조회
     */
    getDailyUsage() {
        return {
            used: this.dailyRequestCount,
            remaining: this.maxDailyRequests - this.dailyRequestCount,
            resetTime: new Date(this.dailyResetTime)
        };
    }
    /**
     * 할당량 초기화 (테스트용)
     */
    reset() {
        this.dailyRequestCount = 0;
        this.saveDailyUsage();
    }
}
exports.GoogleCSERateLimiter = GoogleCSERateLimiter;
/**
 * Google CSE Cache
 * - 쿼리 결과 캐싱 (TTL: 1시간)
 * - 동일 쿼리 재호출 방지
 */
class GoogleCSECache {
    constructor() {
        this.cache = new Map();
        this.ttl = 60 * 60 * 1000; // 1시간
        // 주기적으로 만료된 캐시 정리 (10분마다)
        setInterval(() => this.cleanExpired(), 10 * 60 * 1000);
    }
    static getInstance() {
        if (!GoogleCSECache.instance) {
            GoogleCSECache.instance = new GoogleCSECache();
        }
        return GoogleCSECache.instance;
    }
    /**
     * 캐시에서 조회
     */
    get(key) {
        const cached = this.cache.get(key);
        if (!cached)
            return null;
        if (Date.now() > cached.expiry) {
            this.cache.delete(key);
            return null;
        }
        return cached.data;
    }
    /**
     * 캐시에 저장
     */
    set(key, data) {
        this.cache.set(key, {
            data,
            expiry: Date.now() + this.ttl
        });
    }
    /**
     * 캐시 키 생성 (쿼리 기반)
     */
    static generateKey(query, options) {
        const optionsStr = options ? JSON.stringify(options) : '';
        return `cse:${query}:${optionsStr}`;
    }
    /**
     * 만료된 캐시 정리
     */
    cleanExpired() {
        const now = Date.now();
        const keysToDelete = [];
        this.cache.forEach((value, key) => {
            if (now > value.expiry) {
                keysToDelete.push(key);
            }
        });
        keysToDelete.forEach(key => this.cache.delete(key));
    }
    /**
     * 캐시 전체 삭제
     */
    clear() {
        this.cache.clear();
    }
    /**
     * 캐시 통계
     */
    getStats() {
        const keys = [];
        this.cache.forEach((_value, key) => keys.push(key));
        return {
            size: this.cache.size,
            keys
        };
    }
}
exports.GoogleCSECache = GoogleCSECache;
/**
 * Google CSE 안전한 요청 래퍼
 * Rate Limiter와 Cache를 통합하여 사용
 */
async function safeCSERequest(query, requestFn, options) {
    const { useCache = true, cacheKey, priority = 'normal' } = options || {};
    const limiter = GoogleCSERateLimiter.getInstance();
    const cache = GoogleCSECache.getInstance();
    // 캐시 키 생성
    const key = cacheKey || GoogleCSECache.generateKey(query);
    // 캐시 확인 (동기 처리로 즉시 반환)
    if (useCache) {
        const cached = cache.get(key);
        if (cached) {
            console.log(`[CSE-CACHE] 캐시 히트: ${query.substring(0, 50)}...`);
            return cached;
        }
    }
    // 우선순위가 낮은 요청은 비동기로 처리 (포스팅 발행 블로킹 방지)
    if (priority === 'low') {
        // 비동기로 처리하되 결과는 기다림
        return limiter.request(async () => {
            try {
                const result = await requestFn();
                if (useCache && result) {
                    cache.set(key, result);
                }
                return result;
            }
            catch (error) {
                if (error?.status === 429 || error?.response?.status === 429) {
                    console.warn(`[CSE-RATE-LIMITER] 429 오류 발생: ${query.substring(0, 50)}...`);
                    throw new Error('Google CSE Rate Limit 초과. 잠시 후 다시 시도해주세요.');
                }
                throw error;
            }
        });
    }
    // 일반/높은 우선순위 요청은 동기 처리
    const result = await limiter.request(async () => {
        try {
            return await requestFn();
        }
        catch (error) {
            // 429 오류인 경우 특별 처리
            if (error?.status === 429 || error?.response?.status === 429) {
                console.warn(`[CSE-RATE-LIMITER] 429 오류 발생: ${query.substring(0, 50)}...`);
                throw new Error('Google CSE Rate Limit 초과. 잠시 후 다시 시도해주세요.');
            }
            throw error;
        }
    });
    // 결과 캐싱
    if (useCache && result) {
        cache.set(key, result);
    }
    return result;
}
