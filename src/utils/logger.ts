// src/utils/logger.ts
// 최적화된 로깅 시스템

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context?: any;
  performance?: {
    duration?: number;
    memory?: number;
  };
}

export class Logger {
  private logLevel: LogLevel = LogLevel.INFO;
  private logs: LogEntry[] = [];
  private maxLogs: number = 1000;
  private performanceTimers: Map<string, number> = new Map();

  constructor(level: LogLevel = LogLevel.INFO) {
    this.logLevel = level;
  }

  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.logLevel;
  }

  private formatMessage(level: LogLevel, message: string, context?: any): string {
    const timestamp = new Date().toISOString();
    const levelStr = LogLevel[level];
    const contextStr = context ? ` | ${JSON.stringify(context)}` : '';
    return `[${timestamp}] ${levelStr}: ${message}${contextStr}`;
  }

  private addLog(entry: LogEntry): void {
    this.logs.push(entry);
    
    // 로그 개수 제한
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
  }

  error(message: string, context?: any): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    
    const entry: LogEntry = {
      timestamp: new Date(),
      level: LogLevel.ERROR,
      message,
      context
    };
    
    this.addLog(entry);
    console.error(this.formatMessage(LogLevel.ERROR, message, context));
  }

  warn(message: string, context?: any): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    
    const entry: LogEntry = {
      timestamp: new Date(),
      level: LogLevel.WARN,
      message,
      context
    };
    
    this.addLog(entry);
    console.warn(this.formatMessage(LogLevel.WARN, message, context));
  }

  info(message: string, context?: any): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    
    const entry: LogEntry = {
      timestamp: new Date(),
      level: LogLevel.INFO,
      message,
      context
    };
    
    this.addLog(entry);
    console.log(this.formatMessage(LogLevel.INFO, message, context));
  }

  debug(message: string, context?: any): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    
    const entry: LogEntry = {
      timestamp: new Date(),
      level: LogLevel.DEBUG,
      message,
      context
    };
    
    this.addLog(entry);
    console.debug(this.formatMessage(LogLevel.DEBUG, message, context));
  }

  // 성능 측정 시작
  startTimer(label: string): void {
    this.performanceTimers.set(label, Date.now());
  }

  // 성능 측정 종료
  endTimer(label: string, message?: string): number {
    const startTime = this.performanceTimers.get(label);
    if (!startTime) {
      this.warn(`Timer '${label}' was not started`);
      return 0;
    }

    const duration = Date.now() - startTime;
    this.performanceTimers.delete(label);

    const logMessage = message || `Timer '${label}' completed`;
    this.info(logMessage, { duration: `${duration}ms` });

    return duration;
  }

  // 메모리 사용량 로깅
  logMemoryUsage(context?: string): void {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const memory = process.memoryUsage();
      this.info('Memory Usage', {
        context,
        rss: `${Math.round(memory.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memory.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memory.heapTotal / 1024 / 1024)}MB`,
        external: `${Math.round(memory.external / 1024 / 1024)}MB`
      });
    } else if (typeof window !== 'undefined' && (window as any).performance?.memory) {
      const memory = (window as any).performance.memory;
      this.info('Memory Usage', {
        context,
        usedJSHeapSize: `${Math.round(memory.usedJSHeapSize / 1024 / 1024)}MB`,
        totalJSHeapSize: `${Math.round(memory.totalJSHeapSize / 1024 / 1024)}MB`,
        jsHeapSizeLimit: `${Math.round(memory.jsHeapSizeLimit / 1024 / 1024)}MB`
      });
    }
  }

  // 로그 내보내기
  exportLogs(): LogEntry[] {
    return [...this.logs];
  }

  // 로그 정리
  clearLogs(): void {
    this.logs = [];
    this.performanceTimers.clear();
  }

  // 로그 통계
  getLogStats(): { total: number; byLevel: Record<string, number> } {
    const stats = {
      total: this.logs.length,
      byLevel: {
        ERROR: 0,
        WARN: 0,
        INFO: 0,
        DEBUG: 0
      }
    };

    for (const log of this.logs) {
      const levelKey = LogLevel[log.level] as keyof typeof stats.byLevel;
      if (levelKey) {
        stats.byLevel[levelKey]++;
      }
    }

    return stats;
  }
}

// 전역 로거 인스턴스
export const logger = new Logger(LogLevel.INFO);

// 개발 모드에서는 DEBUG 레벨로 설정
if (process.env['NODE_ENV'] === 'development') {
  logger.setLogLevel(LogLevel.DEBUG);
}

// 성능 모니터링 헬퍼 함수들
export function measurePerformance<T>(
  fn: () => T,
  label: string,
  loggerInstance: Logger = logger
): T {
  loggerInstance.startTimer(label);
  try {
    const result = fn();
    loggerInstance.endTimer(label);
    return result;
  } catch (error) {
    loggerInstance.endTimer(label, `Error in ${label}`);
    throw error;
  }
}

export async function measureAsyncPerformance<T>(
  fn: () => Promise<T>,
  label: string,
  loggerInstance: Logger = logger
): Promise<T> {
  loggerInstance.startTimer(label);
  try {
    const result = await fn();
    loggerInstance.endTimer(label);
    return result;
  } catch (error) {
    loggerInstance.endTimer(label, `Error in ${label}`);
    throw error;
  }
}
