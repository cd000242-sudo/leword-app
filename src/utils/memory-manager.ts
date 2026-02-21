// src/utils/memory-manager.ts
// 메모리 관리 및 최적화 유틸리티

import { logger } from './logger';

export interface MemoryStats {
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
}

export interface MemoryThresholds {
  warning: number; // MB
  critical: number; // MB
}

export class MemoryManager {
  private static instance: MemoryManager;
  private thresholds: MemoryThresholds = {
    warning: 500, // 500MB
    critical: 1000 // 1GB
  };
  private monitoringInterval: NodeJS.Timeout | null = null;
  private cleanupCallbacks: (() => void)[] = [];

  private constructor() {}

  static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }

  // 메모리 사용량 가져오기
  getMemoryStats(): MemoryStats | null {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const memory = process.memoryUsage();
      return {
        rss: memory.rss,
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
        external: memory.external,
        arrayBuffers: memory.arrayBuffers || 0
      };
    }
    return null;
  }

  // 메모리 사용량을 MB로 변환
  private bytesToMB(bytes: number): number {
    return Math.round(bytes / 1024 / 1024);
  }

  // 메모리 사용량 체크 및 경고
  checkMemoryUsage(): void {
    const stats = this.getMemoryStats();
    if (!stats) return;

    const heapUsedMB = this.bytesToMB(stats.heapUsed);
    const rssMB = this.bytesToMB(stats.rss);

    if (heapUsedMB > this.thresholds.critical) {
      logger.error('Critical memory usage detected', {
        heapUsed: `${heapUsedMB}MB`,
        rss: `${rssMB}MB`,
        threshold: `${this.thresholds.critical}MB`
      });
      this.triggerCleanup();
    } else if (heapUsedMB > this.thresholds.warning) {
      logger.warn('High memory usage detected', {
        heapUsed: `${heapUsedMB}MB`,
        rss: `${rssMB}MB`,
        threshold: `${this.thresholds.warning}MB`
      });
    }

    logger.debug('Memory usage check', {
      heapUsed: `${heapUsedMB}MB`,
      heapTotal: `${this.bytesToMB(stats.heapTotal)}MB`,
      rss: `${rssMB}MB`,
      external: `${this.bytesToMB(stats.external)}MB`
    });
  }

  // 메모리 모니터링 시작
  startMonitoring(intervalMs: number = 30000): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, intervalMs);

    logger.info('Memory monitoring started', { interval: `${intervalMs}ms` });
  }

  // 메모리 모니터링 중지
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Memory monitoring stopped');
    }
  }

  // 임계값 설정
  setThresholds(thresholds: Partial<MemoryThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
    logger.info('Memory thresholds updated', this.thresholds);
  }

  // 정리 콜백 등록
  registerCleanupCallback(callback: () => void): void {
    this.cleanupCallbacks.push(callback);
  }

  // 정리 콜백 제거
  unregisterCleanupCallback(callback: () => void): void {
    const index = this.cleanupCallbacks.indexOf(callback);
    if (index > -1) {
      this.cleanupCallbacks.splice(index, 1);
    }
  }

  // 강제 가비지 컬렉션 (Node.js 환경에서만)
  forceGarbageCollection(): void {
    if (typeof global !== 'undefined' && (global as any).gc) {
      (global as any).gc();
      logger.info('Forced garbage collection executed');
    } else {
      logger.warn('Garbage collection not available (run with --expose-gc flag)');
    }
  }

  // 메모리 정리 트리거
  private triggerCleanup(): void {
    logger.info('Triggering memory cleanup', { 
      callbacks: this.cleanupCallbacks.length 
    });

    for (const callback of this.cleanupCallbacks) {
      try {
        callback();
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Error in cleanup callback', { error: errorMessage });
      }
    }

    // 강제 가비지 컬렉션 시도
    this.forceGarbageCollection();

    // 정리 후 메모리 상태 확인
    setTimeout(() => {
      this.checkMemoryUsage();
    }, 1000);
  }

  // 메모리 사용량 리포트 생성
  generateMemoryReport(): {
    current: MemoryStats | null;
    thresholds: MemoryThresholds;
    monitoring: boolean;
    cleanupCallbacks: number;
  } {
    return {
      current: this.getMemoryStats(),
      thresholds: this.thresholds,
      monitoring: this.monitoringInterval !== null,
      cleanupCallbacks: this.cleanupCallbacks.length
    };
  }

  // 메모리 관리자 정리
  destroy(): void {
    this.stopMonitoring();
    this.cleanupCallbacks = [];
    logger.info('Memory manager destroyed');
  }
}

// 전역 메모리 관리자 인스턴스
export const memoryManager = MemoryManager.getInstance();

// 객체 풀링 시스템
export class ObjectPool<T> {
  private pool: T[] = [];
  private createFn: () => T;
  private resetFn: ((obj: T) => void) | undefined;
  private maxSize: number;

  constructor(
    createFn: () => T,
    resetFn?: ((obj: T) => void) | undefined,
    maxSize: number = 100
  ) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.maxSize = maxSize;
  }

  acquire(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.createFn();
  }

  release(obj: T): void {
    if (this.pool.length >= this.maxSize) {
      return; // 풀이 가득 찬 경우 무시
    }

    if (this.resetFn) {
      this.resetFn(obj);
    }

    this.pool.push(obj);
  }

  clear(): void {
    this.pool = [];
  }

  size(): number {
    return this.pool.length;
  }
}

// 메모리 효율적인 배열 관리
export class MemoryEfficientArray<T> {
  private items: T[] = [];
  private maxSize: number;
  private onOverflow: ((items: T[]) => void) | undefined;

  constructor(maxSize: number = 1000, onOverflow?: ((items: T[]) => void) | undefined) {
    this.maxSize = maxSize;
    this.onOverflow = onOverflow;
  }

  push(item: T): void {
    this.items.push(item);
    
    if (this.items.length > this.maxSize) {
      const overflow = this.items.splice(0, this.items.length - this.maxSize);
      if (this.onOverflow) {
        this.onOverflow(overflow);
      }
    }
  }

  getItems(): T[] {
    return [...this.items];
  }

  clear(): void {
    this.items = [];
  }

  size(): number {
    return this.items.length;
  }
}

