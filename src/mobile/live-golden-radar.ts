import {
  MOBILE_PC_PARITY_SLA,
  type MobileKeywordMetric,
  type MobileKeywordResult,
  type MobileLiveGoldenRadarSnapshot,
  type MobileResultGrade,
} from './contracts';
import type { MobileNotificationInbox } from './notification-inbox';
import { EnvironmentManager, type EnvConfig } from '../utils/environment-manager';
import { discoverDirectGoldenKeywords } from '../utils/direct-golden-keyword-miner';
import {
  countSss,
  isQualityGoldenDiscoveryResult,
  rankGoldenDiscoveryResults,
} from '../utils/golden-discovery-floor';
import type { MDPResult } from '../utils/mdp-engine';

export interface MobileLiveGoldenRadarRunGate {
  ok: boolean;
  message?: string;
}

export interface MobileLiveGoldenRadarOptions {
  notificationInbox?: MobileNotificationInbox | null;
  intervalMs?: number;
  runOnStart?: boolean;
  runOnStartDelayMs?: number;
  cycleLimit?: number;
  maxSeeds?: number;
  maxCandidates?: number;
  categories?: string[];
  getEnvConfig?: () => Partial<EnvConfig>;
  discover?: (
    config: { clientId: string; clientSecret: string },
    options: Parameters<typeof discoverDirectGoldenKeywords>[1],
  ) => Promise<MDPResult[]>;
  shouldRun?: () => MobileLiveGoldenRadarRunGate | boolean;
  setIntervalFn?: (handler: () => void, intervalMs: number) => unknown;
  clearIntervalFn?: (handle: unknown) => void;
  setTimeoutFn?: (handler: () => void, delayMs: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
  now?: () => Date;
}

const DEFAULT_CATEGORIES = Object.freeze([
  'celebrity',
  'policy',
  'finance',
  'education',
  'living',
  'travel',
  'health',
  'it',
]);

function normalizeGrade(value: unknown, score = 0): MobileResultGrade {
  const grade = String(value || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (grade === 'SSS' || grade === 'SS' || grade === 'S' || grade === 'A' || grade === 'B') return grade;
  if (score >= 85) return 'SSS';
  if (score >= 75) return 'SS';
  if (score >= 65) return 'S';
  if (score >= 55) return 'A';
  if (score >= 45) return 'B';
  return 'C';
}

function finiteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeKeyword(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function mapDirectResult(result: MDPResult, categoryId: string): MobileKeywordMetric {
  const totalSearchVolume = finiteNumber(result.searchVolume);
  const documentCount = finiteNumber(result.documentCount);
  return {
    keyword: normalizeKeyword(result.keyword),
    grade: normalizeGrade(result.grade, finiteNumber(result.score) || 0),
    score: finiteNumber(result.score),
    pcSearchVolume: null,
    mobileSearchVolume: null,
    totalSearchVolume,
    documentCount,
    goldenRatio: finiteNumber(result.goldenRatio),
    cpc: finiteNumber(result.cpc),
    category: categoryId || 'live',
    source: 'mobile-live-golden-radar',
    intent: result.intent || 'live-golden-discovery',
    evidence: [
      'mobile-live-golden-radar',
      result.goldenReason || '',
      ...(result.externalSources || []),
    ].filter(Boolean),
    isMeasured: totalSearchVolume !== null && documentCount !== null,
  };
}

function resultFromMetrics(
  keywords: MobileKeywordMetric[],
  startedAtMs: number,
): MobileKeywordResult {
  return {
    keywords,
    summary: {
      total: keywords.length,
      sss: countSss(keywords),
      measured: keywords.filter((item) => item.isMeasured).length,
      elapsedMs: Date.now() - startedAtMs,
      fromCache: false,
      parityMode: 'pc-engine-plus',
    },
  };
}

function normalizeGate(value: MobileLiveGoldenRadarRunGate | boolean | undefined): MobileLiveGoldenRadarRunGate {
  if (value === false) return { ok: false, message: 'busy' };
  if (value && typeof value === 'object') return value;
  return { ok: true };
}

export class MobileLiveGoldenRadar {
  private readonly notificationInbox: MobileNotificationInbox | null;
  private readonly intervalMs: number;
  private readonly runOnStart: boolean;
  private readonly runOnStartDelayMs: number;
  private readonly cycleLimit: number;
  private readonly maxSeeds: number;
  private readonly maxCandidates: number;
  private readonly categories: string[];
  private readonly getEnvConfig: () => Partial<EnvConfig>;
  private readonly discover: (
    config: { clientId: string; clientSecret: string },
    options: Parameters<typeof discoverDirectGoldenKeywords>[1],
  ) => Promise<MDPResult[]>;
  private readonly shouldRun: () => MobileLiveGoldenRadarRunGate | boolean;
  private readonly setIntervalFn: (handler: () => void, intervalMs: number) => unknown;
  private readonly clearIntervalFn: (handle: unknown) => void;
  private readonly setTimeoutFn: (handler: () => void, delayMs: number) => unknown;
  private readonly clearTimeoutFn: (handle: unknown) => void;
  private readonly now: () => Date;
  private timer: unknown = null;
  private startTimer: unknown = null;
  private enabled = false;
  private running = false;
  private categoryIndex = 0;
  private totalRuns = 0;
  private successfulRuns = 0;
  private skippedRuns = 0;
  private failedRuns = 0;
  private publishedCount = 0;
  private lastStartedAt?: string;
  private lastFinishedAt?: string;
  private lastError?: string;
  private lastMessage?: string;

  constructor(options: MobileLiveGoldenRadarOptions = {}) {
    this.notificationInbox = options.notificationInbox || null;
    this.intervalMs = Math.max(180_000, Math.floor(
      options.intervalMs
        || MOBILE_PC_PARITY_SLA.workerBudgets.liveGoldenIntervalMinutes * 60 * 1000,
    ));
    this.runOnStart = options.runOnStart !== false;
    this.runOnStartDelayMs = Math.max(5_000, Math.floor(options.runOnStartDelayMs ?? 15_000));
    this.cycleLimit = Math.max(3, Math.min(15, Math.floor(
      options.cycleLimit || MOBILE_PC_PARITY_SLA.workerBudgets.liveGoldenCycleLimit,
    )));
    this.maxSeeds = Math.max(20, Math.min(200, Math.floor(options.maxSeeds || 80)));
    this.maxCandidates = Math.max(120, Math.min(800, Math.floor(
      options.maxCandidates || MOBILE_PC_PARITY_SLA.workerBudgets.liveGoldenMaxCandidates,
    )));
    this.categories = (options.categories || DEFAULT_CATEGORIES)
      .map((item) => normalizeKeyword(item))
      .filter(Boolean);
    this.getEnvConfig = options.getEnvConfig || (() => EnvironmentManager.getInstance().getConfig());
    this.discover = options.discover || discoverDirectGoldenKeywords;
    this.shouldRun = options.shouldRun || (() => true);
    this.setIntervalFn = options.setIntervalFn || ((handler, intervalMs) => setInterval(handler, intervalMs));
    this.clearIntervalFn = options.clearIntervalFn || ((handle) => clearInterval(handle as ReturnType<typeof setInterval>));
    this.setTimeoutFn = options.setTimeoutFn || ((handler, delayMs) => setTimeout(handler, delayMs));
    this.clearTimeoutFn = options.clearTimeoutFn || ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.now = options.now || (() => new Date());
  }

  start(): MobileLiveGoldenRadarSnapshot {
    if (this.enabled) return this.snapshot();
    this.enabled = true;
    this.timer = this.setIntervalFn(() => {
      void this.runOnce();
    }, this.intervalMs);
    if (this.runOnStart) {
      this.startTimer = this.setTimeoutFn(() => {
        this.startTimer = null;
        void this.runOnce();
      }, this.runOnStartDelayMs);
    }
    this.lastMessage = 'live golden radar enabled';
    return this.snapshot();
  }

  stop(): MobileLiveGoldenRadarSnapshot {
    if (this.timer !== null) {
      this.clearIntervalFn(this.timer);
      this.timer = null;
    }
    if (this.startTimer !== null) {
      this.clearTimeoutFn(this.startTimer);
      this.startTimer = null;
    }
    this.enabled = false;
    this.lastMessage = 'live golden radar stopped';
    return this.snapshot();
  }

  async runOnce(): Promise<MobileLiveGoldenRadarSnapshot> {
    if (this.running) return this.snapshot();
    const gate = normalizeGate(this.shouldRun());
    if (!gate.ok) {
      this.skippedRuns += 1;
      this.lastMessage = gate.message || 'skipped because worker is busy';
      return this.snapshot();
    }

    this.running = true;
    this.totalRuns += 1;
    this.lastStartedAt = this.now().toISOString();
    this.lastError = undefined;
    const categoryId = this.nextCategory();
    const startedAtMs = Date.now();

    try {
      const env = this.getEnvConfig();
      if (!env.naverClientId || !env.naverClientSecret) {
        throw new Error('Naver Open API config missing');
      }

      const direct = await this.discover({
        clientId: env.naverClientId,
        clientSecret: env.naverClientSecret,
      }, {
        category: categoryId,
        limit: this.cycleLimit,
        maxSeeds: this.maxSeeds,
        maxCandidates: this.maxCandidates,
        includeCrossCategory: true,
        requireCategoryMatch: false,
        includeSearchAdSuggestions: true,
        suggestionSeedLimit: 6,
        suggestionsPerSeed: 12,
        maxSimilarPerCluster: 2,
      });
      const ranked = rankGoldenDiscoveryResults(
        direct.filter((item) => isQualityGoldenDiscoveryResult(item, { requireActionableIntent: true })),
        this.cycleLimit,
        false,
        {
          honorRequestedLimit: true,
          diversifySimilarIntents: true,
          maxSimilarPerCluster: 2,
          strictVisibleSssOnly: false,
          requireActionableIntent: true,
          qualityBackfillToTarget: true,
        },
      );
      const result = resultFromMetrics(
        ranked.map((item) => mapDirectResult(item, categoryId)),
        startedAtMs,
      );
      const published = this.notificationInbox?.publishFromResult({
        product: 'golden-discovery',
        kind: 'live-golden',
        title: '실시간 황금키워드 발굴',
        targetLabel: categoryId,
        result,
        limit: Math.min(4, this.cycleLimit),
      }) || [];

      this.publishedCount += published.length;
      this.successfulRuns += 1;
      this.lastMessage = `${categoryId} ${result.summary.total} found, ${published.length} published`;
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

  snapshot(): MobileLiveGoldenRadarSnapshot {
    return {
      enabled: this.enabled,
      running: this.running,
      intervalMs: this.intervalMs,
      cycleLimit: this.cycleLimit,
      maxCandidates: this.maxCandidates,
      totalRuns: this.totalRuns,
      successfulRuns: this.successfulRuns,
      skippedRuns: this.skippedRuns,
      failedRuns: this.failedRuns,
      publishedCount: this.publishedCount,
      lastStartedAt: this.lastStartedAt,
      lastFinishedAt: this.lastFinishedAt,
      lastError: this.lastError,
      lastMessage: this.lastMessage,
      nextCategoryId: this.categories[this.categoryIndex] || 'all',
      categories: [...this.categories],
    };
  }

  private nextCategory(): string {
    const categoryId = this.categories[this.categoryIndex] || 'all';
    this.categoryIndex = (this.categoryIndex + 1) % Math.max(1, this.categories.length);
    return categoryId;
  }
}

export function createMobileLiveGoldenRadarFromEnv(
  notificationInbox: MobileNotificationInbox | null,
  shouldRun?: () => MobileLiveGoldenRadarRunGate | boolean,
): MobileLiveGoldenRadar | null {
  if (!notificationInbox) return null;
  if (process.env['LEWORD_MOBILE_LIVE_GOLDEN_ENABLED'] === 'false') return null;
  const intervalMinutes = Number(process.env['LEWORD_MOBILE_LIVE_GOLDEN_INTERVAL_MINUTES'] || 0);
  const cycleLimit = Number(process.env['LEWORD_MOBILE_LIVE_GOLDEN_LIMIT'] || 0);
  const maxCandidates = Number(process.env['LEWORD_MOBILE_LIVE_GOLDEN_MAX_CANDIDATES'] || 0);
  const runOnStart = process.env['LEWORD_MOBILE_LIVE_GOLDEN_ON_START'] === 'true';
  return new MobileLiveGoldenRadar({
    notificationInbox,
    shouldRun,
    intervalMs: Number.isFinite(intervalMinutes) && intervalMinutes > 0
      ? intervalMinutes * 60 * 1000
      : undefined,
    cycleLimit: Number.isFinite(cycleLimit) && cycleLimit > 0 ? cycleLimit : undefined,
    maxCandidates: Number.isFinite(maxCandidates) && maxCandidates > 0 ? maxCandidates : undefined,
    runOnStart,
  });
}
