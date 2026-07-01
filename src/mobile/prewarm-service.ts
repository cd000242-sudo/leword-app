import {
  MOBILE_PC_PARITY_SLA,
  type MobileJobEnvelope,
  type MobileKeywordProduct,
  type MobileKeywordResult,
  type MobilePrewarmSnapshot,
  type MobilePrewarmTarget,
  type MobilePrewarmTargetState,
} from './contracts';
import type { MobileJobExecutor } from './job-orchestrator';
import type { MobileNotificationInbox } from './notification-inbox';
import { InMemoryMobileResultCache } from './result-cache';

export interface MobilePrewarmServiceOptions {
  executor: MobileJobExecutor;
  resultCache: InMemoryMobileResultCache;
  notificationInbox?: MobileNotificationInbox | null;
  targets?: MobilePrewarmTarget[];
  now?: () => Date;
  targetTimeoutMs?: number;
  concurrency?: number;
}

const PRO_PREWARM_BASE_PARAMS = Object.freeze({
  qualityProfile: 'publishable-v2',
  includeSeasonal: true,
  includeEvergreen: true,
  includeFreshIssue: false,
  autoDiscovery: true,
  includeAiInference: true,
});

const DEFAULT_PREWARM_TARGET_TIMEOUT_MS = 8 * 60 * 1000;
const DEFAULT_PREWARM_CONCURRENCY = 2;

function normalizeTargetTimeoutMs(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PREWARM_TARGET_TIMEOUT_MS;
  return Math.max(60_000, Math.min(30 * 60_000, Math.floor(parsed)));
}

function normalizePrewarmConcurrency(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PREWARM_CONCURRENCY;
  return Math.max(1, Math.min(4, Math.floor(parsed)));
}

export const DEFAULT_MOBILE_PREWARM_TARGETS: readonly MobilePrewarmTarget[] = Object.freeze([
  {
    id: 'shopping-connect-hot-products',
    label: 'Shopping connect hot product keywords',
    product: 'shopping-connect',
    priority: 4,
    params: {
      targetCount: 30,
      sort: 'date',
      contextKeywords: [],
    },
  },
  {
    id: 'policy-pro-traffic-24h',
    label: 'Policy PRO need mining',
    product: 'pro-traffic-hunter',
    priority: 20,
    params: {
      ...PRO_PREWARM_BASE_PARAMS,
      categoryId: 'policy',
      targetCount: 60,
    },
  },
  {
    id: 'policy-golden-precision',
    label: 'Policy golden precision',
    product: 'golden-discovery',
    priority: 5,
    params: {
      categoryId: 'policy',
      mode: 'precision',
      targetCount: MOBILE_PC_PARITY_SLA.qualityFloors.goldenPrecisionSss,
      requireSssFloor: true,
    },
  },
  {
    id: 'travel-domestic-pro-traffic-24h',
    label: 'Travel utility PRO need mining',
    product: 'pro-traffic-hunter',
    priority: 30,
    params: {
      ...PRO_PREWARM_BASE_PARAMS,
      categoryId: 'travel_domestic',
      targetCount: 60,
    },
  },
  {
    id: 'home-life-pro-traffic-24h',
    label: 'Home life PRO need mining',
    product: 'pro-traffic-hunter',
    priority: 40,
    params: {
      ...PRO_PREWARM_BASE_PARAMS,
      categoryId: 'home_life',
      targetCount: 60,
    },
  },
  {
    id: 'pro-traffic-all-24h',
    label: 'PRO traffic 24h broad mining',
    product: 'pro-traffic-hunter',
    priority: 50,
    params: {
      ...PRO_PREWARM_BASE_PARAMS,
      categoryId: 'all',
      targetCount: 60,
    },
  },
  {
    id: 'policy-home-board',
    label: 'Policy home-board candidates',
    product: 'home-board-hunter',
    priority: 6,
    params: {
      categoryId: 'policy',
      targetCount: 30,
      requireSplusFloor: true,
    },
  },
  {
    id: 'kin-hidden-honey',
    label: 'KIN hidden honey questions',
    product: 'kin-hidden-honey',
    priority: 7,
    params: {
      tabType: 'hidden',
      targetCount: 30,
      isPremiumRequest: true,
    },
  },
  {
    id: 'naver-mate-auto-discovery',
    label: 'Naver Mate autocomplete and related keyword mining',
    product: 'naver-mate-hunter',
    priority: 8,
    params: {
      seedKeyword: '\uC624\uB298 \uC2E4\uC2DC\uAC04 \uC774\uC288',
      targetCount: 50,
      includeAutocomplete: true,
      includeRelated: true,
      includeVolumeMetrics: true,
      autoDiscovery: true,
      contextKeywords: [],
    },
  },
  {
    id: 'electronics-pro-traffic-24h',
    label: 'Electronics shopping PRO need mining',
    product: 'pro-traffic-hunter',
    priority: 80,
    params: {
      ...PRO_PREWARM_BASE_PARAMS,
      categoryId: 'electronics',
      targetCount: 60,
    },
  },
]);

function makePrewarmJob(
  target: MobilePrewarmTarget,
  createdAt: string,
): MobileJobEnvelope<unknown, MobileKeywordResult> {
  return {
    id: `prewarm_${target.id}_${Date.now().toString(36)}`,
    product: target.product,
    state: 'running',
    params: target.params,
    progressPercent: 1,
    progressMessage: `prewarming ${target.label}`,
    createdAt,
    updatedAt: createdAt,
  };
}

function assertPrewarmResultIsMeasured(target: MobilePrewarmTarget, result: MobileKeywordResult): void {
  const summary = result.summary;
  const measured = Number(summary?.measured ?? 0);
  const total = Number(summary?.total ?? result.keywords?.length ?? 0);
  const publishReady = Number(summary?.publishReady ?? 0);
  if (total <= 0) {
    throw new Error(`${target.label}: prewarm returned no measured keywords yet`);
  }
  if (measured <= 0) {
    throw new Error(`${target.label}: prewarm result has no PC/mobile or document measurements`);
  }
  if ('publishReady' in summary && publishReady <= 0) {
    throw new Error(`${target.label}: prewarm result has no publish-ready measured keywords yet`);
  }
}

export class MobilePrewarmService {
  private readonly executor: MobileJobExecutor;
  private readonly resultCache: InMemoryMobileResultCache;
  private readonly notificationInbox: MobileNotificationInbox | null;
  private readonly targets: MobilePrewarmTarget[];
  private readonly states = new Map<string, MobilePrewarmTargetState>();
  private readonly now: () => Date;
  private readonly targetTimeoutMs: number;
  private readonly concurrency: number;
  private running = false;
  private updatedAt: string;

  constructor(options: MobilePrewarmServiceOptions) {
    this.executor = options.executor;
    this.resultCache = options.resultCache;
    this.notificationInbox = options.notificationInbox || null;
    this.targets = [...(options.targets || DEFAULT_MOBILE_PREWARM_TARGETS)]
      .sort((a, b) => a.priority - b.priority);
    this.now = options.now || (() => new Date());
    this.targetTimeoutMs = normalizeTargetTimeoutMs(
      options.targetTimeoutMs ?? process.env['LEWORD_MOBILE_PREWARM_TARGET_TIMEOUT_MS'],
    );
    this.concurrency = normalizePrewarmConcurrency(
      options.concurrency ?? process.env['LEWORD_MOBILE_PREWARM_CONCURRENCY'],
    );
    this.updatedAt = this.now().toISOString();

    for (const target of this.targets) {
      this.states.set(target.id, {
        id: target.id,
        label: target.label,
        product: target.product,
        state: 'idle',
        updatedAt: this.updatedAt,
      });
    }
  }

  snapshot(): MobilePrewarmSnapshot {
    const targets = [...this.states.values()];
    return {
      running: this.running,
      updatedAt: this.updatedAt,
      completed: targets.filter((target) => target.state === 'completed').length,
      failed: targets.filter((target) => target.state === 'failed').length,
      cacheHits: targets.filter((target) => target.state === 'cache-hit').length,
      targets,
    };
  }

  start(limit?: number): MobilePrewarmSnapshot {
    if (!this.running) {
      void this.runOnce(limit);
    }
    return this.snapshot();
  }

  async runOnce(limit?: number): Promise<MobilePrewarmSnapshot> {
    if (this.running) return this.snapshot();
    this.running = true;
    this.touch();

    const selected = this.targets.slice(0, Math.max(1, limit || this.targets.length));
    let cursor = 0;
    const workerCount = Math.min(this.concurrency, selected.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (cursor < selected.length) {
        const target = selected[cursor];
        cursor += 1;
        if (!target) continue;
        await this.runTarget(target);
      }
    });
    await Promise.all(workers);

    this.running = false;
    this.touch();
    return this.snapshot();
  }

  private async runTarget(target: MobilePrewarmTarget): Promise<void> {
    const cached = this.resultCache.get(target.product, target.params);
    if (cached) {
      this.setState(target, 'cache-hit', cached.summary);
      return;
    }

    this.setState(target, 'running');
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      const jobPromise = this.executor(makePrewarmJob(target, this.now().toISOString()), {
        signal: controller.signal,
        progress: () => undefined,
      });
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          reject(new Error(`prewarm target timeout after ${this.targetTimeoutMs}ms`));
        }, this.targetTimeoutMs);
      });
      const result = await Promise.race([jobPromise, timeoutPromise]);
      assertPrewarmResultIsMeasured(target, result);
      this.resultCache.set(target.product, target.params, result);
      this.notificationInbox?.publishFromResult({
        product: target.product,
        title: `${target.label} prewarm complete`,
        targetLabel: target.label,
        result,
      });
      this.setState(target, 'completed', result.summary);
    } catch (err) {
      const error = err as Error;
      this.setState(target, 'failed', undefined, error.message || String(err));
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  private setState(
    target: MobilePrewarmTarget,
    state: MobilePrewarmTargetState['state'],
    summary?: MobileKeywordResult['summary'],
    error?: string,
  ): void {
    this.states.set(target.id, {
      id: target.id,
      label: target.label,
      product: target.product,
      state,
      updatedAt: this.now().toISOString(),
      summary,
      error,
    });
    this.touch();
  }

  private touch(): void {
    this.updatedAt = this.now().toISOString();
  }
}
