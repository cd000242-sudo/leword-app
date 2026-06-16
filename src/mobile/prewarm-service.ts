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
}

export const DEFAULT_MOBILE_PREWARM_TARGETS: readonly MobilePrewarmTarget[] = Object.freeze([
  {
    id: 'pro-traffic-all-24h',
    label: 'PRO 트래픽 24시간 선발굴',
    product: 'pro-traffic-hunter',
    priority: 5,
    params: {
      qualityProfile: 'publishable-v2',
      categoryId: 'all',
      targetCount: 30,
      includeSeasonal: true,
      includeEvergreen: true,
      includeFreshIssue: true,
      autoDiscovery: true,
      includeAiInference: true,
    },
  },
  {
    id: 'policy-golden-precision',
    label: '지원금/정책 황금 정밀',
    product: 'golden-discovery',
    priority: 10,
    params: {
      categoryId: 'policy',
      mode: 'precision',
      targetCount: MOBILE_PC_PARITY_SLA.qualityFloors.goldenPrecisionSss,
      requireSssFloor: true,
    },
  },
  {
    id: 'celebrity-pro-fresh',
    label: '스타/연예 PRO 최신',
    product: 'pro-traffic-hunter',
    priority: 20,
    params: {
      qualityProfile: 'publishable-v2',
      categoryId: 'celebrity',
      targetCount: 100,
      includeSeasonal: true,
      includeEvergreen: true,
      includeFreshIssue: true,
    },
  },
  {
    id: 'policy-home-board',
    label: '정책 홈판 후보',
    product: 'home-board-hunter',
    priority: 30,
    params: {
      categoryId: 'policy',
      targetCount: 30,
      requireSplusFloor: true,
    },
  },
  {
    id: 'kin-hidden-honey',
    label: '지식인 숨은 꿀질문',
    product: 'kin-hidden-honey',
    priority: 40,
    params: {
      tabType: 'hidden',
      targetCount: 15,
      isPremiumRequest: true,
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

export class MobilePrewarmService {
  private readonly executor: MobileJobExecutor;
  private readonly resultCache: InMemoryMobileResultCache;
  private readonly notificationInbox: MobileNotificationInbox | null;
  private readonly targets: MobilePrewarmTarget[];
  private readonly states = new Map<string, MobilePrewarmTargetState>();
  private readonly now: () => Date;
  private running = false;
  private updatedAt: string;

  constructor(options: MobilePrewarmServiceOptions) {
    this.executor = options.executor;
    this.resultCache = options.resultCache;
    this.notificationInbox = options.notificationInbox || null;
    this.targets = [...(options.targets || DEFAULT_MOBILE_PREWARM_TARGETS)]
      .sort((a, b) => a.priority - b.priority);
    this.now = options.now || (() => new Date());
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
    for (const target of selected) {
      await this.runTarget(target);
    }

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
    try {
      const result = await this.executor(makePrewarmJob(target, this.now().toISOString()), {
        signal: controller.signal,
        progress: () => undefined,
      });
      this.resultCache.set(target.product, target.params, result);
      this.notificationInbox?.publishFromResult({
        product: target.product,
        title: `${target.label} 예열 완료`,
        targetLabel: target.label,
        result,
      });
      this.setState(target, 'completed', result.summary);
    } catch (err) {
      this.setState(target, 'failed', undefined, (err as Error).message || String(err));
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
