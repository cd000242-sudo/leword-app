/**
 * v2.44.0: 시스템 사양 감지 모듈
 *
 * 저사양 PC에서 RAM/CPU 폭주를 막기 위해 자동으로 한도를 낮춘다.
 * 환경설정의 lowSpecMode가 'auto'일 때만 사용 (사용자가 명시적으로 on/off하면 무시).
 *
 * 기준:
 *   - LOW: RAM < 8GB OR CPU 논리코어 <= 4
 *   - NORMAL: 그 외
 */

import * as os from 'os';

export interface SystemProfile {
  isLowSpec: boolean;
  totalMemGB: number;
  freeMemGB: number;
  cpuCount: number;
  recommendedConcurrency: number;   // maxConcurrentRequests에 권장
  recommendedPoolSize: number;       // puppeteer-pool maxSize에 권장
  recommendedIdleTimeoutMs: number;  // puppeteer idle timeout
  apiCacheMaxSize: number;
}

let cached: SystemProfile | null = null;

export function getSystemProfile(): SystemProfile {
  if (cached) return cached;

  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const totalMemGB = totalBytes / (1024 * 1024 * 1024);
  const freeMemGB = freeBytes / (1024 * 1024 * 1024);
  const cpuCount = os.cpus().length;

  const isLowSpec = totalMemGB < 8 || cpuCount <= 4;

  cached = {
    isLowSpec,
    totalMemGB: Math.round(totalMemGB * 10) / 10,
    freeMemGB: Math.round(freeMemGB * 10) / 10,
    cpuCount,
    recommendedConcurrency: isLowSpec ? 8 : 30,
    recommendedPoolSize: isLowSpec ? 1 : 3,
    recommendedIdleTimeoutMs: isLowSpec ? 30000 : 60000,
    apiCacheMaxSize: isLowSpec ? 200 : 1000,
  };

  console.log('[SYSTEM-PROFILE]', {
    isLowSpec,
    totalMemGB: cached.totalMemGB,
    cpuCount,
    recommendedPoolSize: cached.recommendedPoolSize,
    recommendedConcurrency: cached.recommendedConcurrency,
  });

  return cached;
}

export function isLowSpec(): boolean {
  return getSystemProfile().isLowSpec;
}

/**
 * 사용자 설정과 자동 감지를 합쳐 최종 결정
 *   mode='auto' → 자동 감지 (isLowSpec())
 *   mode='on'   → 강제 활성
 *   mode='off'  → 강제 비활성
 */
export function effectiveLowSpec(mode: 'auto' | 'on' | 'off' | undefined): boolean {
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  return isLowSpec();
}

/**
 * 캐시 리셋 (테스트용)
 */
export function resetProfileCache(): void {
  cached = null;
}
