/**
 * 🔥 API 100% 성공률 보장 시스템
 * - 다중 재시도 + 지수 백오프
 * - 병렬 처리 + 연결 풀링
 * - 스마트 캐싱 + 백업 데이터
 * - 속도 최적화 + 실패 방지
 */

import { apiCache, cachedApiCall } from './api-cache';
import { ErrorHandler } from './error-handler';

// 전역 설정
export interface ApiReliabilityConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  timeout: number;
  parallelLimit: number;
  cacheEnabled: boolean;
  cacheTTL: number;
}

// 기본 설정 (성능 + 안정성 최적화)
const DEFAULT_CONFIG: ApiReliabilityConfig = {
  maxRetries: 5,
  baseDelay: 500,
  maxDelay: 10000,
  timeout: 30000,
  parallelLimit: 5,
  cacheEnabled: true,
  cacheTTL: 300000 // 5분
};

// 현재 설정
let currentConfig = { ...DEFAULT_CONFIG };

/**
 * 설정 업데이트
 */
export function updateReliabilityConfig(config: Partial<ApiReliabilityConfig>): void {
  currentConfig = { ...currentConfig, ...config };
  console.log('[API-RELIABILITY] 설정 업데이트:', currentConfig);
}

/**
 * 🔥 지수 백오프 재시도 래퍼 (강화된 버전)
 */
export async function withSmartRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
    onRetry?: (attempt: number, error: any) => void;
    shouldRetry?: (error: any) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = currentConfig.maxRetries,
    baseDelay = currentConfig.baseDelay,
    maxDelay = currentConfig.maxDelay,
    onRetry,
    shouldRetry = defaultShouldRetry
  } = options;

  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      if (attempt >= maxRetries || !shouldRetry(error)) {
        break;
      }
      
      // 지수 백오프 + 지터(랜덤 추가)
      const exponentialDelay = Math.min(maxDelay, baseDelay * Math.pow(2, attempt));
      const jitter = Math.random() * 0.3 * exponentialDelay; // 30% 지터
      const delay = Math.floor(exponentialDelay + jitter);
      
      console.log(`[API-RELIABILITY] 재시도 ${attempt + 1}/${maxRetries} (${delay}ms 후)`);
      onRetry?.(attempt + 1, error);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * 기본 재시도 조건
 */
function defaultShouldRetry(error: any): boolean {
  const message = String(error?.message || error || '').toLowerCase();
  const status = error?.status || error?.response?.status;
  
  // 네트워크 오류 - 항상 재시도
  if (ErrorHandler.isNetworkError(error)) return true;
  
  // Rate Limit (429) - 재시도
  if (status === 429 || message.includes('429') || message.includes('rate limit')) return true;
  
  // 서버 오류 (5xx) - 재시도
  if (status >= 500 && status < 600) return true;
  
  // 타임아웃 - 재시도
  if (message.includes('timeout') || message.includes('abort')) return true;
  
  // 연결 오류 - 재시도
  if (message.includes('econnreset') || message.includes('enotfound') || message.includes('etimedout')) return true;
  
  // 인증 오류 (401, 403) - 재시도 안함
  if (status === 401 || status === 403) return false;
  
  // 잘못된 요청 (400) - 재시도 안함
  if (status === 400) return false;
  
  return false;
}

/**
 * 🔥 타임아웃 + 재시도 결합 래퍼
 */
export async function withTimeoutAndRetry<T>(
  fn: () => Promise<T>,
  options: {
    timeout?: number;
    maxRetries?: number;
    timeoutMessage?: string;
  } = {}
): Promise<T> {
  const {
    timeout = currentConfig.timeout,
    maxRetries = currentConfig.maxRetries,
    timeoutMessage = '요청 시간 초과'
  } = options;

  return withSmartRetry(
    () => ErrorHandler.withTimeout(fn, timeout, timeoutMessage),
    { maxRetries }
  );
}

/**
 * 🔥 캐시 + 재시도 결합 래퍼
 */
export async function withCacheAndRetry<T>(
  cacheKey: string,
  fn: () => Promise<T>,
  options: {
    ttl?: number;
    maxRetries?: number;
    skipCache?: boolean;
  } = {}
): Promise<T> {
  const {
    ttl = currentConfig.cacheTTL,
    maxRetries = currentConfig.maxRetries,
    skipCache = !currentConfig.cacheEnabled
  } = options;

  // 캐시 확인
  if (!skipCache) {
    const cached = apiCache.get<T>(cacheKey);
    if (cached !== null) {
      console.log(`[API-RELIABILITY] 캐시 히트: ${cacheKey.substring(0, 50)}...`);
      return cached;
    }
  }

  // API 호출 (재시도 포함)
  const result = await withSmartRetry(fn, { maxRetries });

  // 캐시 저장
  if (!skipCache && result !== null && result !== undefined) {
    apiCache.set(cacheKey, result, ttl);
  }

  return result;
}

/**
 * 🔥 병렬 처리 (속도 최적화)
 */
export async function parallelProcess<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  options: {
    concurrency?: number;
    onProgress?: (completed: number, total: number) => void;
    continueOnError?: boolean;
  } = {}
): Promise<R[]> {
  const {
    concurrency = currentConfig.parallelLimit,
    onProgress,
    continueOnError = true
  } = options;

  const results: R[] = [];
  const errors: any[] = [];
  let completed = 0;

  // 청크로 나누어 병렬 처리
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    
    const chunkPromises = chunk.map(async (item, chunkIndex) => {
      const globalIndex = i + chunkIndex;
      try {
        return await processor(item, globalIndex);
      } catch (error) {
        if (continueOnError) {
          console.warn(`[API-RELIABILITY] 병렬 처리 오류 (${globalIndex}):`, error);
          errors.push({ index: globalIndex, error });
          return null as any;
        }
        throw error;
      }
    });

    const chunkResults = await Promise.all(chunkPromises);
    
    chunkResults.forEach((result, idx) => {
      results[i + idx] = result;
    });

    completed += chunk.length;
    onProgress?.(completed, items.length);

    // 청크 간 간격 (Rate Limit 방지)
    if (i + concurrency < items.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  if (errors.length > 0) {
    console.warn(`[API-RELIABILITY] 병렬 처리 완료: ${items.length - errors.length}/${items.length} 성공`);
  }

  return results;
}

/**
 * 🔥 체인 폴백 (다중 소스)
 */
export async function withChainFallback<T>(
  primaryFn: () => Promise<T | null>,
  fallbacks: Array<() => Promise<T | null>>,
  defaultValue: T
): Promise<T> {
  // 1차: 주 함수 시도
  try {
    const result = await primaryFn();
    if (result !== null && result !== undefined) {
      return result;
    }
  } catch (error) {
    console.warn('[API-RELIABILITY] 주 함수 실패:', error);
  }

  // 2차: 폴백 순차 시도
  for (let i = 0; i < fallbacks.length; i++) {
    try {
      const result = await fallbacks[i]();
      if (result !== null && result !== undefined) {
        console.log(`[API-RELIABILITY] 폴백 ${i + 1} 성공`);
        return result;
      }
    } catch (error) {
      console.warn(`[API-RELIABILITY] 폴백 ${i + 1} 실패:`, error);
    }
  }

  // 3차: 기본값 반환 (100% 성공 보장)
  console.log('[API-RELIABILITY] 모든 소스 실패, 기본값 반환');
  return defaultValue;
}

/**
 * 🔥 배치 API 호출 (Rate Limit 방지 + 최적화)
 */
export async function batchApiCall<T, R>(
  items: T[],
  apiCall: (batch: T[]) => Promise<R[]>,
  options: {
    batchSize?: number;
    batchDelay?: number;
    maxRetries?: number;
    onBatchComplete?: (batchIndex: number, totalBatches: number) => void;
  } = {}
): Promise<R[]> {
  const {
    batchSize = 10,
    batchDelay = 500,
    maxRetries = 3,
    onBatchComplete
  } = options;

  const results: R[] = [];
  const batches: T[][] = [];

  // 배치로 분할
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }

  console.log(`[API-RELIABILITY] 배치 API 호출: ${batches.length}개 배치, 각 ${batchSize}개`);

  // 배치 순차 처리
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    
    try {
      const batchResults = await withSmartRetry(
        () => apiCall(batch),
        { maxRetries }
      );
      results.push(...batchResults);
    } catch (error) {
      console.error(`[API-RELIABILITY] 배치 ${i + 1}/${batches.length} 실패:`, error);
      // 실패한 배치는 빈 결과로 대체
      results.push(...new Array(batch.length).fill(null));
    }

    onBatchComplete?.(i + 1, batches.length);

    // 배치 간 지연 (마지막 배치 제외)
    if (i < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, batchDelay));
    }
  }

  return results;
}

/**
 * 🔥 네이버 API 전용 100% 성공 래퍼
 */
export async function naverApiCall<T>(
  cacheKey: string,
  apiCall: () => Promise<T | null>,
  backupData: T,
  options: {
    ttl?: number;
    skipCache?: boolean;
  } = {}
): Promise<T> {
  const { ttl = 300000, skipCache = false } = options;

  // 캐시 확인
  if (!skipCache) {
    const cached = apiCache.get<T>(cacheKey);
    if (cached !== null) {
      return cached;
    }
  }

  // API 호출 시도 (재시도 포함)
  try {
    const result = await withTimeoutAndRetry(
      async () => {
        const data = await apiCall();
        if (data === null || data === undefined) {
          throw new Error('API 응답이 비어있습니다');
        }
        return data;
      },
      { timeout: 30000, maxRetries: 3 }
    );

    // 캐시 저장
    if (!skipCache) {
      apiCache.set(cacheKey, result, ttl);
    }

    return result;
  } catch (error) {
    console.warn('[API-RELIABILITY] 네이버 API 실패, 백업 데이터 사용:', error);
    return backupData;
  }
}

/**
 * 🔥 연결 상태 확인
 */
export async function checkConnection(url: string = 'https://www.naver.com'): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 🔥 API 헬스 체크
 */
export async function apiHealthCheck(): Promise<{
  naver: boolean;
  youtube: boolean;
  network: boolean;
}> {
  const [naverOk, youtubeOk, networkOk] = await Promise.all([
    checkConnection('https://openapi.naver.com'),
    checkConnection('https://www.googleapis.com'),
    checkConnection('https://www.google.com')
  ]);

  return {
    naver: naverOk,
    youtube: youtubeOk,
    network: networkOk
  };
}

/**
 * 🔥 캐시 통계
 */
export function getCacheStats() {
  return apiCache.getStats();
}

/**
 * 🔥 캐시 초기화
 */
export function clearCache(pattern?: string) {
  apiCache.invalidate(pattern);
  console.log('[API-RELIABILITY] 캐시 초기화:', pattern || '전체');
}

// 설정 내보내기
export { currentConfig as reliabilityConfig };







