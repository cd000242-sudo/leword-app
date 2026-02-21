// src/utils/performance.ts
// 성능 최적화 유틸리티 함수들

// 정규식 캐시
const regexCache = new Map<string, RegExp>();

export function getCachedRegex(pattern: string, flags: string = 'i'): RegExp {
  const key = `${pattern}_${flags}`;
  if (!regexCache.has(key)) {
    regexCache.set(key, new RegExp(pattern, flags));
  }
  return regexCache.get(key)!;
}

// 문자열 유사도 계산 캐시
const similarityCache = new Map<string, number>();

export function calculateStringSimilarity(str1: string, str2: string): number {
  const cacheKey = `${str1}|${str2}`;
  if (similarityCache.has(cacheKey)) {
    return similarityCache.get(cacheKey)!;
  }
  
  const similarity = getEditDistance(str1, str2) / Math.max(str1.length, str2.length);
  similarityCache.set(cacheKey, similarity);
  return similarity;
}

// 편집 거리 계산 (Levenshtein Distance)
export function getEditDistance(str1: string, str2: string): number {
  const matrix: number[][] = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(0));
  
  for (let i = 0; i <= str1.length; i++) {
    matrix[0]![i] = i;
  }
  
  for (let j = 0; j <= str2.length; j++) {
    matrix[j]![0] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str1[j - 1] === str2[i - 1]) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          (matrix[i - 1]![j - 1] ?? 0) + 1,
          (matrix[i]![j - 1] ?? 0) + 1,
          (matrix[i - 1]![j] ?? 0) + 1
        );
      }
    }
  }
  
  return matrix[str2.length]![str1.length]!;
}

// 텍스트 이스케이프 캐시
const escapeCache = new Map<string, string>();

export function escapeHtml(s = ''): string {
  if (escapeCache.has(s)) {
    return escapeCache.get(s)!;
  }
  
  const escaped = String(s).replace(/[&<>"']/g, (m) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[m]);
  
  escapeCache.set(s, escaped);
  return escaped;
}

// 디바운스 함수
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(null, args), delay);
  };
}

// 스로틀 함수
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => ReturnType<T> | undefined {
  let inThrottle: boolean;
  let lastResult: ReturnType<T>;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      lastResult = func.apply(null, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
    return lastResult;
  };
}

// 메모리 사용량 로깅
export function logMemoryUsage(tag = 'Memory Usage'): void {
  if (typeof process !== 'undefined' && process.memoryUsage) {
    const memory = process.memoryUsage();
    console.log(
      `[${tag}] RSS: ${formatBytes(memory.rss)}, Heap Used: ${formatBytes(memory.heapUsed)}, Heap Total: ${formatBytes(memory.heapTotal)}`
    );
  } else if (typeof window !== 'undefined' && (window as any).performance?.memory) {
    const memory = (window as any).performance.memory;
    console.log(
      `[${tag}] JS Heap: ${formatBytes(memory.usedJSHeapSize)} / ${formatBytes(memory.totalJSHeapSize)} (Limit: ${formatBytes(memory.jsHeapSizeLimit)})`
    );
  }
}

// 바이트 포맷팅
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 캐시 정리
export function clearCaches(): void {
  regexCache.clear();
  similarityCache.clear();
  escapeCache.clear();
  console.log('🧹 모든 성능 캐시가 정리되었습니다.');
}

