/**
 * 🌐 네트워크 연결 상태 확인 유틸리티
 * 
 * - 인터넷 연결 자동 확인
 * - 오프라인 모드 자동 전환
 * - 연결 복구 시 자동 재시도
 */

import axios from 'axios';

// 연결 상태 캐시
let lastOnlineStatus = true;
let lastCheckTime = 0;
const CHECK_INTERVAL = 30000; // 30초마다 체크

// 테스트용 URL 목록 (빠른 응답)
const TEST_URLS = [
  'https://www.google.com/generate_204', // Google 204 응답 (가장 빠름)
  'https://www.naver.com/favicon.ico',
  'https://connectivity-check.ubuntu.com/',
];

/**
 * 인터넷 연결 확인
 * @param forceCheck 강제 재확인 여부
 */
export async function checkInternetConnection(forceCheck = false): Promise<boolean> {
  const now = Date.now();
  
  // 캐시된 결과 반환 (30초 이내)
  if (!forceCheck && now - lastCheckTime < CHECK_INTERVAL) {
    return lastOnlineStatus;
  }

  // 병렬로 여러 URL 테스트 (하나라도 성공하면 온라인)
  try {
    const results = await Promise.race([
      // 모든 URL 테스트 후 하나라도 성공하면 true
      Promise.all(
        TEST_URLS.map(url => 
          axios.get(url, { 
            timeout: 5000,
            validateStatus: () => true,
          })
          .then(() => true)
          .catch(() => false)
        )
      ).then(results => results.some(r => r)),
      // 6초 타임아웃
      new Promise<boolean>(resolve => setTimeout(() => resolve(false), 6000)),
    ]);

    lastOnlineStatus = results;
    lastCheckTime = now;

    if (!results) {
      console.log('[NETWORK] ⚠️ 인터넷 연결 없음');
    }

    return results;
  } catch (error) {
    lastOnlineStatus = false;
    lastCheckTime = now;
    console.log('[NETWORK] ⚠️ 인터넷 연결 확인 실패');
    return false;
  }
}

/**
 * 네트워크 요청 래퍼 (자동 재시도 + 오프라인 처리)
 */
export async function safeNetworkRequest<T>(
  requestFn: () => Promise<T>,
  options: {
    retries?: number;
    retryDelay?: number;
    offlineFallback?: T;
    onRetry?: (attempt: number, error: Error) => void;
  } = {}
): Promise<T> {
  const { 
    retries = 3, 
    retryDelay = 1000, 
    offlineFallback,
    onRetry 
  } = options;

  // 먼저 온라인 상태 확인
  const isOnline = await checkInternetConnection();
  
  if (!isOnline) {
    if (offlineFallback !== undefined) {
      console.log('[NETWORK] 오프라인 모드 - 폴백 데이터 사용');
      return offlineFallback;
    }
    throw new Error('인터넷 연결이 없습니다. 네트워크 상태를 확인해주세요.');
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await requestFn();
    } catch (error: any) {
      lastError = error;
      
      // 네트워크 관련 에러인 경우만 재시도
      const isNetworkError = 
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ENETUNREACH' ||
        error.message?.includes('timeout') ||
        error.message?.includes('network');

      if (isNetworkError && attempt < retries) {
        console.log(`[NETWORK] 재시도 ${attempt}/${retries}...`);
        onRetry?.(attempt, error);
        await sleep(retryDelay * attempt); // 지수 백오프
        continue;
      }

      throw error;
    }
  }

  throw lastError || new Error('네트워크 요청 실패');
}

/**
 * 네트워크 상태 모니터링 시작
 */
export function startNetworkMonitoring(
  onStatusChange: (isOnline: boolean) => void,
  interval = 30000
): () => void {
  let running = true;

  const check = async () => {
    if (!running) return;
    
    const wasOnline = lastOnlineStatus;
    const isOnline = await checkInternetConnection(true);
    
    if (wasOnline !== isOnline) {
      console.log(`[NETWORK] 상태 변경: ${isOnline ? '온라인' : '오프라인'}`);
      onStatusChange(isOnline);
    }

    if (running) {
      setTimeout(check, interval);
    }
  };

  // 즉시 첫 체크
  check();

  // 정리 함수 반환
  return () => {
    running = false;
  };
}

/**
 * DNS 조회 테스트 (낮은 수준)
 */
export async function checkDNS(): Promise<boolean> {
  try {
    const dns = require('dns').promises;
    await dns.lookup('google.com');
    return true;
  } catch {
    return false;
  }
}

/**
 * 특정 호스트 연결 테스트
 */
export async function checkHost(host: string, timeout = 5000): Promise<boolean> {
  try {
    await axios.get(`https://${host}`, { 
      timeout,
      validateStatus: () => true,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 현재 온라인 상태 반환 (캐시된 값)
 */
export function isOnline(): boolean {
  return lastOnlineStatus;
}

/**
 * 유틸리티: 지연
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

