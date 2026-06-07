import type { MobilePrewarmSnapshot } from './contracts';
import { MobilePrewarmService } from './prewarm-service';

export interface MobilePrewarmSchedulerService {
  runOnce(limit?: number): Promise<MobilePrewarmSnapshot>;
  snapshot(): MobilePrewarmSnapshot;
}

export interface MobilePrewarmSchedulerOptions {
  service: MobilePrewarmSchedulerService;
  intervalMs: number;
  limit?: number;
  runOnStart?: boolean;
  setIntervalFn?: (handler: () => void, intervalMs: number) => unknown;
  clearIntervalFn?: (handle: unknown) => void;
  now?: () => Date;
}

export interface MobilePrewarmSchedulerSnapshot {
  enabled: boolean;
  running: boolean;
  intervalMs: number;
  limit?: number;
  runOnStart: boolean;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  lastStartedAt?: string;
  lastFinishedAt?: string;
  lastError?: string;
  service: MobilePrewarmSnapshot;
}

export class MobilePrewarmScheduler {
  private readonly service: MobilePrewarmSchedulerService;
  private readonly intervalMs: number;
  private readonly limit?: number;
  private readonly runOnStart: boolean;
  private readonly setIntervalFn: (handler: () => void, intervalMs: number) => unknown;
  private readonly clearIntervalFn: (handle: unknown) => void;
  private readonly now: () => Date;
  private timer: unknown = null;
  private enabled = false;
  private running = false;
  private totalRuns = 0;
  private successfulRuns = 0;
  private failedRuns = 0;
  private lastStartedAt?: string;
  private lastFinishedAt?: string;
  private lastError?: string;

  constructor(options: MobilePrewarmSchedulerOptions) {
    this.service = options.service;
    this.intervalMs = Math.max(10_000, Math.floor(options.intervalMs));
    this.limit = options.limit;
    this.runOnStart = options.runOnStart !== false;
    this.setIntervalFn = options.setIntervalFn || ((handler, intervalMs) => setInterval(handler, intervalMs));
    this.clearIntervalFn = options.clearIntervalFn || ((handle) => clearInterval(handle as ReturnType<typeof setInterval>));
    this.now = options.now || (() => new Date());
  }

  start(): MobilePrewarmSchedulerSnapshot {
    if (this.enabled) return this.snapshot();
    this.enabled = true;
    this.timer = this.setIntervalFn(() => {
      void this.runNow();
    }, this.intervalMs);
    if (this.runOnStart) {
      void this.runNow();
    }
    return this.snapshot();
  }

  stop(): MobilePrewarmSchedulerSnapshot {
    if (this.timer !== null) {
      this.clearIntervalFn(this.timer);
      this.timer = null;
    }
    this.enabled = false;
    return this.snapshot();
  }

  async runNow(): Promise<MobilePrewarmSchedulerSnapshot> {
    if (this.running) return this.snapshot();
    this.running = true;
    this.totalRuns += 1;
    this.lastStartedAt = this.now().toISOString();
    this.lastError = undefined;
    try {
      await this.service.runOnce(this.limit);
      this.successfulRuns += 1;
    } catch (err) {
      this.failedRuns += 1;
      this.lastError = (err as Error).message || String(err);
    } finally {
      this.running = false;
      this.lastFinishedAt = this.now().toISOString();
    }
    return this.snapshot();
  }

  snapshot(): MobilePrewarmSchedulerSnapshot {
    return {
      enabled: this.enabled,
      running: this.running,
      intervalMs: this.intervalMs,
      limit: this.limit,
      runOnStart: this.runOnStart,
      totalRuns: this.totalRuns,
      successfulRuns: this.successfulRuns,
      failedRuns: this.failedRuns,
      lastStartedAt: this.lastStartedAt,
      lastFinishedAt: this.lastFinishedAt,
      lastError: this.lastError,
      service: this.service.snapshot(),
    };
  }
}

export function createMobilePrewarmSchedulerFromEnv(
  service: MobilePrewarmService,
): MobilePrewarmScheduler | null {
  const rawMinutes = Number(process.env['LEWORD_MOBILE_PREWARM_INTERVAL_MINUTES'] || 0);
  if (!Number.isFinite(rawMinutes) || rawMinutes <= 0) return null;
  const rawLimit = Number(process.env['LEWORD_MOBILE_PREWARM_LIMIT'] || 0);
  const runOnStart = process.env['LEWORD_MOBILE_PREWARM_ON_START'] !== 'false';
  return new MobilePrewarmScheduler({
    service,
    intervalMs: Math.max(1, rawMinutes) * 60 * 1000,
    limit: Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : undefined,
    runOnStart,
  });
}
