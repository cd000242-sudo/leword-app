import type { MobilePrewarmSnapshot } from './contracts';
import { MobilePrewarmService } from './prewarm-service';
import {
  getNaverBlogOpenApiQuotaBlockedUntil,
  getNaverBlogOpenApiCredentials,
  isNaverBlogOpenApiQuotaBlocked,
} from '../utils/naver-blog-api';

export interface MobilePrewarmSchedulerService {
  runOnce(limit?: number): Promise<MobilePrewarmSnapshot>;
  snapshot(): MobilePrewarmSnapshot;
}

export interface MobilePrewarmSchedulerRunGate {
  ok: boolean;
  reason?: string;
  retryAtMs?: number | null;
}

export interface MobilePrewarmSchedulerOptions {
  service: MobilePrewarmSchedulerService;
  intervalMs: number;
  limit?: number;
  runOnStart?: boolean;
  shouldRun?: () => MobilePrewarmSchedulerRunGate | boolean;
  startupDelayMs?: number;
  setIntervalFn?: (handler: () => void, intervalMs: number) => unknown;
  clearIntervalFn?: (handle: unknown) => void;
  setTimeoutFn?: (handler: () => void, delayMs: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
  now?: () => Date;
}

export interface MobilePrewarmSchedulerSnapshot {
  enabled: boolean;
  running: boolean;
  intervalMs: number;
  limit?: number;
  runOnStart: boolean;
  startupDelayMs: number;
  totalRuns: number;
  successfulRuns: number;
  skippedRuns: number;
  failedRuns: number;
  lastStartedAt?: string;
  lastFinishedAt?: string;
  nextRetryAt?: string;
  lastError?: string;
  lastMessage?: string;
  service: MobilePrewarmSnapshot;
}

export class MobilePrewarmScheduler {
  private readonly service: MobilePrewarmSchedulerService;
  private readonly intervalMs: number;
  private readonly limit?: number;
  private readonly runOnStart: boolean;
  private readonly shouldRun: () => MobilePrewarmSchedulerRunGate | boolean;
  private readonly startupDelayMs: number;
  private readonly setIntervalFn: (handler: () => void, intervalMs: number) => unknown;
  private readonly clearIntervalFn: (handle: unknown) => void;
  private readonly setTimeoutFn: (handler: () => void, delayMs: number) => unknown;
  private readonly clearTimeoutFn: (handle: unknown) => void;
  private readonly now: () => Date;
  private timer: unknown = null;
  private startupTimer: unknown = null;
  private retryTimer: unknown = null;
  private retryAtMs: number | null = null;
  private enabled = false;
  private running = false;
  private totalRuns = 0;
  private successfulRuns = 0;
  private skippedRuns = 0;
  private failedRuns = 0;
  private lastStartedAt?: string;
  private lastFinishedAt?: string;
  private lastError?: string;
  private lastMessage?: string;

  constructor(options: MobilePrewarmSchedulerOptions) {
    this.service = options.service;
    this.intervalMs = Math.max(10_000, Math.floor(options.intervalMs));
    this.limit = options.limit;
    this.runOnStart = options.runOnStart !== false;
    this.shouldRun = options.shouldRun || (() => true);
    this.startupDelayMs = Math.max(0, Math.floor(options.startupDelayMs || 0));
    this.setIntervalFn = options.setIntervalFn || ((handler, intervalMs) => setInterval(handler, intervalMs));
    this.clearIntervalFn = options.clearIntervalFn || ((handle) => clearInterval(handle as ReturnType<typeof setInterval>));
    this.setTimeoutFn = options.setTimeoutFn || ((handler, delayMs) => setTimeout(handler, delayMs));
    this.clearTimeoutFn = options.clearTimeoutFn || ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.now = options.now || (() => new Date());
  }

  start(): MobilePrewarmSchedulerSnapshot {
    if (this.enabled) return this.snapshot();
    this.enabled = true;
    this.timer = this.setIntervalFn(() => {
      void this.runNow();
    }, this.intervalMs);
    if (this.runOnStart) {
      if (this.startupDelayMs > 0) {
        this.startupTimer = this.setTimeoutFn(() => {
          this.startupTimer = null;
          void this.runNow();
        }, this.startupDelayMs);
      } else {
        void this.runNow();
      }
    }
    return this.snapshot();
  }

  stop(): MobilePrewarmSchedulerSnapshot {
    if (this.startupTimer !== null) {
      this.clearTimeoutFn(this.startupTimer);
      this.startupTimer = null;
    }
    if (this.timer !== null) {
      this.clearIntervalFn(this.timer);
      this.timer = null;
    }
    this.clearRetryTimer();
    this.enabled = false;
    return this.snapshot();
  }

  async runNow(): Promise<MobilePrewarmSchedulerSnapshot> {
    if (this.running) return this.snapshot();
    const gate = normalizeGate(this.shouldRun());
    if (!gate.ok) {
      this.skippedRuns += 1;
      this.lastError = undefined;
      this.lastMessage = gate.reason || 'prewarm skipped by runtime gate';
      this.lastFinishedAt = this.now().toISOString();
      this.scheduleRetry(gate.retryAtMs);
      return this.snapshot();
    }
    this.clearRetryTimer();
    this.running = true;
    this.totalRuns += 1;
    this.lastStartedAt = this.now().toISOString();
    this.lastError = undefined;
    this.lastMessage = undefined;
    try {
      await this.service.runOnce(this.limit);
      this.successfulRuns += 1;
      this.lastMessage = 'prewarm completed';
    } catch (err) {
      this.failedRuns += 1;
      this.lastError = (err as Error).message || String(err);
      this.lastMessage = this.lastError;
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
      startupDelayMs: this.startupDelayMs,
      totalRuns: this.totalRuns,
      successfulRuns: this.successfulRuns,
      skippedRuns: this.skippedRuns,
      failedRuns: this.failedRuns,
      lastStartedAt: this.lastStartedAt,
      lastFinishedAt: this.lastFinishedAt,
      nextRetryAt: this.retryAtMs ? new Date(this.retryAtMs).toISOString() : undefined,
      lastError: this.lastError,
      lastMessage: this.lastMessage,
      service: this.service.snapshot(),
    };
  }

  private clearRetryTimer(): void {
    if (this.retryTimer !== null) {
      this.clearTimeoutFn(this.retryTimer);
      this.retryTimer = null;
    }
    this.retryAtMs = null;
  }

  private scheduleRetry(retryAtMs?: number | null): void {
    if (!retryAtMs || !this.enabled) return;
    const delayMs = retryDelayMs(retryAtMs, this.now().getTime(), this.intervalMs);
    this.clearRetryTimer();
    this.retryAtMs = retryAtMs;
    this.retryTimer = this.setTimeoutFn(() => {
      this.retryTimer = null;
      this.retryAtMs = null;
      if (this.enabled) void this.runNow();
    }, delayMs);
  }
}

function normalizeGate(gate: MobilePrewarmSchedulerRunGate | boolean): MobilePrewarmSchedulerRunGate {
  if (typeof gate === 'boolean') return { ok: gate };
  return gate || { ok: true };
}

const PREWARM_RETRY_BUFFER_MS = 5_000;
const PREWARM_RETRY_MIN_DELAY_MS = 1_000;

function retryDelayMs(untilMs: number, nowMs: number, intervalMs: number): number {
  return Math.max(
    PREWARM_RETRY_MIN_DELAY_MS,
    Math.min(intervalMs, Math.floor(untilMs - nowMs + PREWARM_RETRY_BUFFER_MS)),
  );
}

function formatKstRetryAt(untilMs: number | null): string {
  if (!untilMs) return '';
  const kst = new Date(untilMs + 9 * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .replace('.000Z', ' KST');
  return `; retry after ${kst}`;
}

function naverOpenApiDocumentQuotaGate(): MobilePrewarmSchedulerRunGate {
  const env = process.env;
  const clientId = (env['NAVER_CLIENT_ID'] || env['naverClientId'] || '').trim();
  const clientSecret = (env['NAVER_CLIENT_SECRET'] || env['naverClientSecret'] || '').trim();
  const config = { clientId, clientSecret, env };
  const credentials = getNaverBlogOpenApiCredentials(config);
  if (credentials.length === 0) {
    return {
      ok: false,
      reason: 'Naver OpenAPI document credentials missing; prewarm waits for measured-only keyword data',
    };
  }
  if (isNaverBlogOpenApiQuotaBlocked(config)) {
    const retryAt = getNaverBlogOpenApiQuotaBlockedUntil(config);
    return {
      ok: false,
      reason: `Naver OpenAPI document quota exhausted; prewarm waits for measured-only keyword data${formatKstRetryAt(retryAt)}`,
      retryAtMs: retryAt,
    };
  }
  return { ok: true };
}

export function createMobilePrewarmSchedulerFromEnv(
  service: MobilePrewarmService,
): MobilePrewarmScheduler | null {
  const rawMinutes = Number(process.env['LEWORD_MOBILE_PREWARM_INTERVAL_MINUTES'] || 0);
  if (!Number.isFinite(rawMinutes) || rawMinutes <= 0) return null;
  const rawLimit = Number(process.env['LEWORD_MOBILE_PREWARM_LIMIT'] || 0);
  const runOnStart = process.env['LEWORD_MOBILE_PREWARM_ON_START'] !== 'false';
  const rawStartupDelayMs = Number(process.env['LEWORD_MOBILE_PREWARM_START_DELAY_MS'] || 0);
  return new MobilePrewarmScheduler({
    service,
    intervalMs: Math.max(1, rawMinutes) * 60 * 1000,
    limit: Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : undefined,
    runOnStart,
    shouldRun: naverOpenApiDocumentQuotaGate,
    startupDelayMs: Number.isFinite(rawStartupDelayMs) && rawStartupDelayMs > 0
      ? Math.floor(rawStartupDelayMs)
      : 0,
  });
}
