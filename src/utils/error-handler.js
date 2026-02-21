"use strict";
/**
 * 고급 오류 처리 및 복구 시스템
 * 기능 제한 없이 안정성만 향상
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorHandler = void 0;
class ErrorHandler {
    /**
     * 자동 재시도 래퍼 (지수 백오프)
     */
    static async withRetry(fn, options = {}) {
        const { maxRetries = 3, retryDelay = 1000, backoffMultiplier = 2, retryableErrors = ['network', 'timeout', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'] } = options;
        let lastError;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await fn();
            }
            catch (error) {
                lastError = error;
                // 재시도 가능한 오류인지 확인
                const errorMessage = String(error?.message || error || '').toLowerCase();
                const isRetryable = retryableErrors.some(pattern => errorMessage.includes(pattern.toLowerCase())) || error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT';
                // 마지막 시도이거나 재시도 불가능한 오류면 즉시 throw
                if (attempt >= maxRetries || !isRetryable) {
                    break;
                }
                // 지수 백오프로 대기
                const delay = retryDelay * Math.pow(backoffMultiplier, attempt);
                console.log(`[ERROR-HANDLER] 재시도 ${attempt + 1}/${maxRetries} (${delay}ms 후):`, errorMessage.substring(0, 100));
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        throw lastError;
    }
    /**
     * 타임아웃 래퍼
     */
    static async withTimeout(fn, timeoutMs, timeoutMessage) {
        return Promise.race([
            fn(),
            new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error(timeoutMessage || `작업이 ${timeoutMs}ms 내에 완료되지 않았습니다`));
                }, timeoutMs);
            })
        ]);
    }
    /**
     * 폴백 메커니즘 (주 함수 실패 시 대체 함수 실행)
     */
    static async withFallback(primaryFn, fallbackFn, errorMessage) {
        try {
            return await primaryFn();
        }
        catch (error) {
            console.warn(`[ERROR-HANDLER] 주 함수 실패, 폴백 실행:`, errorMessage || error);
            try {
                return await fallbackFn();
            }
            catch (fallbackError) {
                throw new Error(`주 함수와 폴백 모두 실패: ${errorMessage || error}. 폴백 오류: ${fallbackError}`);
            }
        }
    }
    /**
     * 안전한 JSON 파싱
     */
    static safeJsonParse(json, defaultValue) {
        try {
            return JSON.parse(json);
        }
        catch (error) {
            console.warn('[ERROR-HANDLER] JSON 파싱 실패, 기본값 사용:', error);
            return defaultValue;
        }
    }
    /**
     * 안전한 숫자 변환
     */
    static safeNumber(value, defaultValue = 0) {
        if (typeof value === 'number' && !isNaN(value)) {
            return value;
        }
        const parsed = parseFloat(String(value || ''));
        return isNaN(parsed) ? defaultValue : parsed;
    }
    /**
     * 안전한 문자열 변환
     */
    static safeString(value, defaultValue = '') {
        if (typeof value === 'string') {
            return value;
        }
        if (value == null) {
            return defaultValue;
        }
        try {
            return String(value);
        }
        catch {
            return defaultValue;
        }
    }
    /**
     * 네트워크 오류 감지
     */
    static isNetworkError(error) {
        const message = String(error?.message || error || '').toLowerCase();
        const code = error?.code || '';
        return (message.includes('network') ||
            message.includes('fetch') ||
            message.includes('econnrefused') ||
            message.includes('enetunreach') ||
            message.includes('timeout') ||
            code === 'ECONNRESET' ||
            code === 'ETIMEDOUT' ||
            code === 'ENOTFOUND');
    }
    /**
     * API 오류 감지
     */
    static isApiError(error) {
        const status = error?.status || error?.response?.status;
        return status >= 400 && status < 600;
    }
    /**
     * 친절한 에러 메시지 생성
     */
    static getFriendlyMessage(error, context) {
        if (this.isNetworkError(error)) {
            return `네트워크 연결 문제가 발생했습니다. 인터넷 연결을 확인하고 잠시 후 다시 시도해주세요.${context ? ` (${context})` : ''}`;
        }
        if (this.isApiError(error)) {
            const status = error?.status || error?.response?.status;
            if (status === 401 || status === 403) {
                return `API 인증 오류입니다. API 키를 확인해주세요.${context ? ` (${context})` : ''}`;
            }
            if (status === 429) {
                return `API 호출 한도를 초과했습니다. 잠시 후 다시 시도해주세요.${context ? ` (${context})` : ''}`;
            }
            if (status >= 500) {
                return `서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.${context ? ` (${context})` : ''}`;
            }
        }
        const message = error?.message || String(error || '알 수 없는 오류');
        return `${message}${context ? ` (${context})` : ''}`;
    }
    /**
     * 메모리 사용량 체크 및 정리
     */
    static checkMemoryUsage(thresholdMB = 500) {
        const usage = process.memoryUsage();
        const heapUsedMB = usage.heapUsed / 1024 / 1024;
        if (heapUsedMB > thresholdMB) {
            console.warn(`[ERROR-HANDLER] 메모리 사용량 경고: ${heapUsedMB.toFixed(2)}MB`);
            // 가비지 컬렉션 힌트 (실제로는 Node.js가 결정)
            if (global.gc) {
                global.gc();
            }
            return true;
        }
        return false;
    }
    /**
     * 안전한 비동기 실행 (에러가 발생해도 앱이 크래시되지 않음)
     */
    static async safeExecute(fn, defaultValue, errorMessage) {
        try {
            return await fn();
        }
        catch (error) {
            console.error(`[ERROR-HANDLER] 안전 실행 실패:`, errorMessage || error);
            return defaultValue;
        }
    }
}
exports.ErrorHandler = ErrorHandler;
