import {
  MOBILE_PC_PARITY_SLA,
  type MobileJobEnvelope,
  type MobileJobEvent,
  type MobileJobState,
  type MobileKeywordProduct,
  type MobileKeywordResult,
} from './contracts';

export interface MobileJobExecutorContext {
  signal: AbortSignal;
  progress: (percent: number, message: string) => void;
}

export type MobileJobExecutor<TParams = unknown> = (
  job: MobileJobEnvelope<TParams, MobileKeywordResult>,
  context: MobileJobExecutorContext,
) => Promise<MobileKeywordResult>;

export interface MobileJobStoreOptions {
  autoStart?: boolean;
  maxConcurrentJobs?: number;
  now?: () => Date;
  idFactory?: () => string;
}

export interface MobileJobStoreStats {
  total: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  maxConcurrentJobs: number;
}

interface StoredJob {
  controller: AbortController;
  executor: MobileJobExecutor<any>;
}

type Listener = (event: MobileJobEvent) => void;

const TERMINAL_STATES = new Set<MobileJobState>(['completed', 'failed', 'cancelled']);

export class InMemoryMobileJobStore {
  private static sequence = 0;
  private readonly jobs = new Map<string, MobileJobEnvelope<any, MobileKeywordResult>>();
  private readonly stored = new Map<string, StoredJob>();
  private readonly events = new Map<string, MobileJobEvent[]>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly autoStart: boolean;
  private readonly maxConcurrentJobs: number;
  private readonly now: () => Date;
  private readonly idFactory: () => string;
  private readonly queuedJobIds: string[] = [];
  private readonly runningJobIds = new Set<string>();

  constructor(options: MobileJobStoreOptions = {}) {
    this.autoStart = options.autoStart !== false;
    this.maxConcurrentJobs = Math.max(
      1,
      Math.floor(options.maxConcurrentJobs || MOBILE_PC_PARITY_SLA.workerBudgets.minBrowserPoolSizePerWorker),
    );
    this.now = options.now || (() => new Date());
    this.idFactory = options.idFactory || (() => {
      InMemoryMobileJobStore.sequence += 1;
      return `job_${Date.now().toString(36)}_${InMemoryMobileJobStore.sequence.toString(36)}`;
    });
  }

  create<TParams>(
    product: MobileKeywordProduct,
    params: TParams,
    executor: MobileJobExecutor<TParams>,
  ): MobileJobEnvelope<TParams, MobileKeywordResult> {
    const stamp = this.now().toISOString();
    const id = this.idFactory();
    const job: MobileJobEnvelope<TParams, MobileKeywordResult> = {
      id,
      product,
      state: 'queued',
      params,
      progressPercent: 0,
      progressMessage: 'queued on LEWORD Cloud worker',
      createdAt: stamp,
      updatedAt: stamp,
    };

    this.jobs.set(id, job);
    this.events.set(id, []);
    this.stored.set(id, {
      controller: new AbortController(),
      executor,
    });
    this.emit(id, 'created', 'queued on LEWORD Cloud worker');

    if (this.autoStart) {
      setTimeout(() => {
        void this.start(id);
      }, 0);
    }

    return { ...job };
  }

  createCompleted<TParams>(
    product: MobileKeywordProduct,
    params: TParams,
    result: MobileKeywordResult,
    message = 'served from LEWORD result cache',
  ): MobileJobEnvelope<TParams, MobileKeywordResult> {
    const stamp = this.now().toISOString();
    const id = this.idFactory();
    const job: MobileJobEnvelope<TParams, MobileKeywordResult> = {
      id,
      product,
      state: 'completed',
      params,
      result,
      progressPercent: 100,
      progressMessage: message,
      createdAt: stamp,
      updatedAt: stamp,
    };

    this.jobs.set(id, job);
    this.events.set(id, []);
    this.emit(id, 'created', message);
    this.emit(id, 'completed', message, result);
    return { ...job };
  }

  start(jobId: string): void {
    const job = this.jobs.get(jobId);
    const stored = this.stored.get(jobId);
    if (!job || !stored || job.state !== 'queued') return;
    if (this.runningJobIds.size >= this.maxConcurrentJobs) {
      this.enqueue(jobId);
      return;
    }

    this.removeQueued(jobId);
    this.runningJobIds.add(jobId);
    this.setState(jobId, 'running', 1, 'starting PC-grade worker');

    void stored.executor(job, {
      signal: stored.controller.signal,
      progress: (percent, message) => this.progress(jobId, percent, message),
    }).then((result) => {
      const latest = this.jobs.get(jobId);
      if (!latest || latest.state === 'cancelled') return;
      this.complete(jobId, result);
    }).catch((err: any) => {
      const latest = this.jobs.get(jobId);
      if (!latest || latest.state === 'cancelled') return;
      this.fail(jobId, err?.message || String(err || 'worker failed'));
    }).finally(() => {
      this.runningJobIds.delete(jobId);
      this.stored.delete(jobId);
      this.startNextQueued();
    });
  }

  get<TParams = unknown>(jobId: string): MobileJobEnvelope<TParams, MobileKeywordResult> | undefined {
    const job = this.jobs.get(jobId);
    return job ? { ...job } : undefined;
  }

  getEvents(jobId: string): MobileJobEvent[] {
    return [...(this.events.get(jobId) || [])];
  }

  stats(): MobileJobStoreStats {
    const jobs = [...this.jobs.values()];
    return {
      total: jobs.length,
      queued: jobs.filter((job) => job.state === 'queued').length,
      running: jobs.filter((job) => job.state === 'running' || job.state === 'streaming').length,
      completed: jobs.filter((job) => job.state === 'completed').length,
      failed: jobs.filter((job) => job.state === 'failed').length,
      cancelled: jobs.filter((job) => job.state === 'cancelled').length,
      maxConcurrentJobs: this.maxConcurrentJobs,
    };
  }

  subscribe(jobId: string, listener: Listener): () => void {
    if (!this.listeners.has(jobId)) {
      this.listeners.set(jobId, new Set());
    }
    this.listeners.get(jobId)!.add(listener);

    const snapshot = this.get(jobId);
    if (snapshot) {
      listener(this.makeEvent(snapshot, 'state', snapshot.progressMessage));
    }

    return () => {
      this.listeners.get(jobId)?.delete(listener);
    };
  }

  cancel(jobId: string): MobileJobEnvelope<unknown, MobileKeywordResult> | undefined {
    const job = this.jobs.get(jobId);
    const stored = this.stored.get(jobId);
    if (!job) return undefined;
    if (TERMINAL_STATES.has(job.state)) return { ...job };

    stored?.controller.abort();
    this.removeQueued(jobId);
    this.setState(jobId, 'cancelled', job.progressPercent, 'cancelled by client');
    this.emit(jobId, 'cancelled', 'cancelled by client');
    if (!this.runningJobIds.has(jobId)) {
      this.stored.delete(jobId);
      this.startNextQueued();
    }
    return this.get(jobId);
  }

  private enqueue(jobId: string): void {
    if (!this.queuedJobIds.includes(jobId)) {
      this.queuedJobIds.push(jobId);
    }
    this.setState(jobId, 'queued', 0, 'waiting for available PC-grade worker');
  }

  private removeQueued(jobId: string): void {
    const index = this.queuedJobIds.indexOf(jobId);
    if (index >= 0) {
      this.queuedJobIds.splice(index, 1);
    }
  }

  private startNextQueued(): void {
    while (this.runningJobIds.size < this.maxConcurrentJobs && this.queuedJobIds.length > 0) {
      const nextJobId = this.queuedJobIds.shift();
      if (!nextJobId) return;
      const nextJob = this.jobs.get(nextJobId);
      if (!nextJob || nextJob.state !== 'queued' || !this.stored.has(nextJobId)) continue;
      this.start(nextJobId);
      return;
    }
  }

  private progress(jobId: string, percent: number, message: string): void {
    const job = this.jobs.get(jobId);
    if (!job || TERMINAL_STATES.has(job.state)) return;
    const nextPercent = Math.max(0, Math.min(99, Math.round(percent)));
    this.setState(jobId, 'streaming', nextPercent, message);
    this.emit(jobId, 'progress', message);
  }

  private complete(jobId: string, result: MobileKeywordResult): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    this.jobs.set(jobId, {
      ...job,
      result,
      state: 'completed',
      progressPercent: 100,
      progressMessage: 'completed',
      updatedAt: this.now().toISOString(),
    });
    this.emit(jobId, 'completed', 'completed', result);
  }

  private fail(jobId: string, error: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    this.jobs.set(jobId, {
      ...job,
      state: 'failed',
      progressMessage: error,
      updatedAt: this.now().toISOString(),
    });
    this.emit(jobId, 'failed', error, undefined, error);
  }

  private setState(jobId: string, state: MobileJobState, progressPercent: number, message: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    this.jobs.set(jobId, {
      ...job,
      state,
      progressPercent,
      progressMessage: message,
      updatedAt: this.now().toISOString(),
    });
    this.emit(jobId, 'state', message);
  }

  private emit(
    jobId: string,
    type: MobileJobEvent['type'],
    message: string,
    result?: MobileKeywordResult,
    error?: string,
  ): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    const event = this.makeEvent(job, type, message, result, error);
    this.events.get(jobId)?.push(event);
    for (const listener of this.listeners.get(jobId) || []) {
      listener(event);
    }
  }

  private makeEvent(
    job: MobileJobEnvelope<any, MobileKeywordResult>,
    type: MobileJobEvent['type'],
    message: string,
    result?: MobileKeywordResult,
    error?: string,
  ): MobileJobEvent {
    return {
      id: `evt_${this.now().getTime()}_${job.id}_${type}`,
      jobId: job.id,
      type,
      state: job.state,
      progressPercent: job.progressPercent,
      message,
      result,
      error,
      createdAt: this.now().toISOString(),
    };
  }
}

export function createDeferredPcWorkerExecutor(): MobileJobExecutor {
  return async (_job, context) => {
    context.progress(5, 'accepted by API gateway');
    if (context.signal.aborted) {
      throw new Error('cancelled');
    }
    context.progress(10, 'waiting for PC engine worker adapter');
    throw new Error('PC engine worker adapter is not connected yet');
  };
}
