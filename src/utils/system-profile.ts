/**
 * v2.44.0: 시스템 사양 감지 모듈
 *
 * 저사양 PC에서 RAM/CPU 폭주를 막기 위해 자동으로 한도를 낮춘다.
 * 환경설정의 lowSpecMode가 'auto'일 때만 사용 (사용자가 명시적으로 on/off하면 무시).
 *
 * 기준 (v2.46.0 — 2026년 한국 PC 평균 16GB/8코어 반영):
 *   - LOW: RAM < 12GB OR CPU 논리코어 <= 6
 *   - NORMAL: 그 외
 *
 * 이전 기준(RAM < 8GB, CPU <= 4)은 2018년 수준. 16GB가 사무용 표준이라
 * 12GB 미만은 저사양 모드 자동 활성화하여 CPU/RAM 보호.
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

  // v2.46.0: 임계값 강화 (2026년 한국 사무용 PC 평균 16GB/8코어 반영)
  const isLowSpec = totalMemGB < 12 || cpuCount <= 6;

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
