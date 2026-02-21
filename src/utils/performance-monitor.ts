/**
 * 성능 모니터링 유틸리티
 * - 크롤링 성능 측정
 * - 메모리 사용량 추적
 * - API 호출 통계
 */

import { Logger, LogLevel } from './logger';

interface PerformanceMetrics {
  startTime: number;
  endTime?: number;
  duration?: number;
  memoryUsage?: NodeJS.MemoryUsage;
  apiCalls?: number;
  errors?: number;
  itemsProcessed?: number;
}

interface APICallStats {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  averageResponseTime: number;
  callsByEndpoint: Record<string, number>;
}

export class PerformanceMonitor {
  private logger: Logger;
  private metrics: Map<string, PerformanceMetrics>;
  private apiStats: APICallStats;
  private startMemory: NodeJS.MemoryUsage;

  constructor() {
    this.logger = new Logger(LogLevel.INFO);
    this.metrics = new Map();
    this.apiStats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      averageResponseTime: 0,
      callsByEndpoint: {}
    };
    this.startMemory = process.memoryUsage();
  }

  /**
   * 성능 측정 시작
   */
  startMeasurement(name: string): void {
    const metric: PerformanceMetrics = {
      startTime: Date.now(),
      memoryUsage: process.memoryUsage()
    };
    
    this.metrics.set(name, metric);
    this.logger.debug(`성능 측정 시작: ${name}`);
  }

  /**
   * 성능 측정 종료
   */
  endMeasurement(name: string, additionalData?: {
    apiCalls?: number;
    errors?: number;
    itemsProcessed?: number;
  }): PerformanceMetrics | null {
    const metric = this.metrics.get(name);
    if (!metric) {
      this.logger.warn(`측정 중인 메트릭을 찾을 수 없습니다: ${name}`);
      return null;
    }

    metric.endTime = Date.now();
    metric.duration = metric.endTime - metric.startTime;
    metric.memoryUsage = process.memoryUsage();

    if (additionalData) {
      if (additionalData.apiCalls !== undefined) {
        metric.apiCalls = additionalData.apiCalls;
      }
      if (additionalData.errors !== undefined) {
        metric.errors = additionalData.errors;
      }
      if (additionalData.itemsProcessed !== undefined) {
        metric.itemsProcessed = additionalData.itemsProcessed;
      }
    }

    this.logger.info(`성능 측정 완료: ${name} (${metric.duration}ms)`);
    return metric;
  }

  /**
   * API 호출 통계 업데이트
   */
  recordAPICall(endpoint: string, success: boolean, responseTime: number): void {
    this.apiStats.totalCalls++;
    
    if (success) {
      this.apiStats.successfulCalls++;
    } else {
      this.apiStats.failedCalls++;
    }

    // 평균 응답 시간 업데이트
    this.apiStats.averageResponseTime = 
      (this.apiStats.averageResponseTime * (this.apiStats.totalCalls - 1) + responseTime) / 
      this.apiStats.totalCalls;

    // 엔드포인트별 호출 수
    this.apiStats.callsByEndpoint[endpoint] = 
      (this.apiStats.callsByEndpoint[endpoint] || 0) + 1;
  }

  /**
   * 메모리 사용량 확인
   */
  getMemoryUsage(): {
    current: NodeJS.MemoryUsage;
    delta: NodeJS.MemoryUsage;
    percentage: number;
  } {
    const current = process.memoryUsage();
    const delta = {
      rss: current.rss - this.startMemory.rss,
      heapTotal: current.heapTotal - this.startMemory.heapTotal,
      heapUsed: current.heapUsed - this.startMemory.heapUsed,
      external: current.external - this.startMemory.external,
      arrayBuffers: current.arrayBuffers - this.startMemory.arrayBuffers
    };

    const percentage = (current.heapUsed / current.heapTotal) * 100;

    return { current, delta, percentage };
  }

  /**
   * 성능 리포트 생성
   */
  generateReport(): {
    measurements: Record<string, PerformanceMetrics>;
    apiStats: APICallStats;
    memoryUsage: {
      current: NodeJS.MemoryUsage;
      delta: NodeJS.MemoryUsage;
      percentage: number;
    };
    summary: {
      totalDuration: number;
      averageDuration: number;
      fastestOperation: string;
      slowestOperation: string;
      successRate: number;
      itemsPerSecond: number;
    };
  } {
    const measurements: Record<string, PerformanceMetrics> = {};
    let totalDuration = 0;
    let totalItems = 0;
    let fastestTime = Infinity;
    let slowestTime = 0;
    let fastestOp = '';
    let slowestOp = '';

    // 측정값 정리
    for (const [name, metric] of this.metrics) {
      measurements[name] = { ...metric };
      
      if (metric.duration) {
        totalDuration += metric.duration;
        
        if (metric.duration < fastestTime) {
          fastestTime = metric.duration;
          fastestOp = name;
        }
        
        if (metric.duration > slowestTime) {
          slowestTime = metric.duration;
          slowestOp = name;
        }
      }
      
      if (metric.itemsProcessed) {
        totalItems += metric.itemsProcessed;
      }
    }

    const averageDuration = this.metrics.size > 0 ? totalDuration / this.metrics.size : 0;
    const successRate = this.apiStats.totalCalls > 0 
      ? (this.apiStats.successfulCalls / this.apiStats.totalCalls) * 100 
      : 0;
    const itemsPerSecond = totalDuration > 0 ? (totalItems / totalDuration) * 1000 : 0;

    return {
      measurements,
      apiStats: { ...this.apiStats },
      memoryUsage: this.getMemoryUsage(),
      summary: {
        totalDuration,
        averageDuration,
        fastestOperation: fastestOp,
        slowestOperation: slowestOp,
        successRate,
        itemsPerSecond
      }
    };
  }

  /**
   * 성능 리포트 출력
   */
  printReport(): void {
    const report = this.generateReport();
    
    this.logger.info('=== 성능 리포트 ===');
    this.logger.info(`총 실행 시간: ${report.summary.totalDuration}ms`);
    this.logger.info(`평균 실행 시간: ${report.summary.averageDuration.toFixed(2)}ms`);
    const fastestDuration = report.measurements[report.summary.fastestOperation]?.duration;
    const slowestDuration = report.measurements[report.summary.slowestOperation]?.duration;
    this.logger.info(`가장 빠른 작업: ${report.summary.fastestOperation} (${fastestDuration ?? 0}ms)`);
    this.logger.info(`가장 느린 작업: ${report.summary.slowestOperation} (${slowestDuration ?? 0}ms)`);
    this.logger.info(`API 성공률: ${report.summary.successRate.toFixed(2)}%`);
    this.logger.info(`처리 속도: ${report.summary.itemsPerSecond.toFixed(2)} items/sec`);
    
    this.logger.info('\n=== 메모리 사용량 ===');
    this.logger.info(`현재 힙 사용량: ${(report.memoryUsage.current.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    this.logger.info(`힙 사용률: ${report.memoryUsage.percentage.toFixed(2)}%`);
    this.logger.info(`메모리 증가량: ${(report.memoryUsage.delta.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    
    this.logger.info('\n=== API 통계 ===');
    this.logger.info(`총 API 호출: ${report.apiStats.totalCalls}`);
    this.logger.info(`성공: ${report.apiStats.successfulCalls}`);
    this.logger.info(`실패: ${report.apiStats.failedCalls}`);
    this.logger.info(`평균 응답 시간: ${report.apiStats.averageResponseTime.toFixed(2)}ms`);
    
    this.logger.info('\n=== 엔드포인트별 호출 수 ===');
    for (const [endpoint, count] of Object.entries(report.apiStats.callsByEndpoint)) {
      this.logger.info(`${endpoint}: ${count}회`);
    }
  }

  /**
   * 메트릭 초기화
   */
  clearMetrics(): void {
    this.metrics.clear();
    this.apiStats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      averageResponseTime: 0,
      callsByEndpoint: {}
    };
    this.startMemory = process.memoryUsage();
    this.logger.info('성능 메트릭 초기화 완료');
  }

  /**
   * 특정 메트릭 조회
   */
  getMetric(name: string): PerformanceMetrics | undefined {
    return this.metrics.get(name);
  }

  /**
   * 모든 메트릭 조회
   */
  getAllMetrics(): Map<string, PerformanceMetrics> {
    return new Map(this.metrics);
  }

  /**
   * 성능 경고 체크
   */
  checkPerformanceWarnings(): string[] {
    const warnings: string[] = [];
    const memoryUsage = this.getMemoryUsage();
    
    // 메모리 사용률 경고
    if (memoryUsage.percentage > 80) {
      warnings.push(`높은 메모리 사용률: ${memoryUsage.percentage.toFixed(2)}%`);
    }
    
    // API 실패율 경고
    if (this.apiStats.totalCalls > 0) {
      const failureRate = (this.apiStats.failedCalls / this.apiStats.totalCalls) * 100;
      if (failureRate > 10) {
        warnings.push(`높은 API 실패율: ${failureRate.toFixed(2)}%`);
      }
    }
    
    // 느린 작업 경고
    for (const [name, metric] of this.metrics) {
      if (metric.duration && metric.duration > 30000) { // 30초 이상
        warnings.push(`느린 작업 감지: ${name} (${metric.duration}ms)`);
      }
    }
    
    return warnings;
  }

  /**
   * 성능 최적화 제안
   */
  getOptimizationSuggestions(): string[] {
    const suggestions: string[] = [];
    const report = this.generateReport();
    
    // 처리 속도 개선 제안
    if (report.summary.itemsPerSecond < 10) {
      suggestions.push('처리 속도가 느립니다. 병렬 처리나 배치 크기 조정을 고려하세요.');
    }
    
    // 메모리 최적화 제안
    if (report.memoryUsage.percentage > 70) {
      suggestions.push('메모리 사용량이 높습니다. 가비지 컬렉션을 고려하거나 배치 크기를 줄이세요.');
    }
    
    // API 최적화 제안
    if (report.apiStats.averageResponseTime > 5000) {
      suggestions.push('API 응답 시간이 느립니다. 타임아웃 설정이나 재시도 로직을 확인하세요.');
    }
    
    // 에러율 개선 제안
    if (report.summary.successRate < 90) {
      suggestions.push('API 성공률이 낮습니다. 에러 핸들링과 재시도 로직을 개선하세요.');
    }
    
    return suggestions;
  }
}
