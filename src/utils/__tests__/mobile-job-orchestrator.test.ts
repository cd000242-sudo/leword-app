import {
  InMemoryMobileJobStore,
  type MobileJobExecutor,
} from '../../mobile/job-orchestrator';
import type { MobileKeywordResult } from '../../mobile/contracts';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForState(store: InMemoryMobileJobStore, jobId: string, states: string[]): Promise<any> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const job = store.get(jobId);
    if (job && states.includes(job.state)) return job;
    await sleep(10);
  }
  throw new Error(`timed out waiting for ${states.join(',')}`);
}

const completedResult: MobileKeywordResult = {
  keywords: [
    {
      keyword: '고유가 지원금 2차 신청방법',
      grade: 'SSS',
      pcSearchVolume: 1200,
      mobileSearchVolume: 2400,
      totalSearchVolume: 3600,
      documentCount: 180,
      goldenRatio: 20,
      cpc: 120,
      category: 'policy',
      source: 'pc-engine-test',
      intent: 'application-guide',
      evidence: ['measured-search-volume', 'low-document-count'],
      isMeasured: true,
    },
  ],
  summary: {
    total: 1,
    sss: 1,
    measured: 1,
    elapsedMs: 25,
    fromCache: false,
    parityMode: 'pc-engine-plus',
  },
};

async function testCompletesWithProgress(): Promise<void> {
  const store = new InMemoryMobileJobStore({
    idFactory: () => 'job_complete',
  });
  const executor: MobileJobExecutor = async (_job, ctx) => {
    ctx.progress(25, 'collecting live source signals');
    ctx.progress(75, 'ranking with PC engine');
    return completedResult;
  };

  const job = store.create('golden-discovery', { categoryId: 'policy' }, executor);
  const done = await waitForState(store, job.id, ['completed']);
  const events = store.getEvents(job.id);

  assert('job completed', done.state === 'completed');
  assert('job progress reaches 100', done.progressPercent === 100);
  assert('job stores result', done.result?.summary.sss === 1);
  assert('job emits progress event', events.some((event) => event.type === 'progress'));
  assert('job emits completed event', events.some((event) => event.type === 'completed'));
}

async function testCancellation(): Promise<void> {
  const store = new InMemoryMobileJobStore({
    idFactory: () => 'job_cancel',
  });
  const executor: MobileJobExecutor = async (_job, ctx) => {
    ctx.progress(20, 'running long worker task');
    await new Promise<void>((resolve) => {
      ctx.signal.addEventListener('abort', () => resolve(), { once: true });
    });
    throw new Error('should not complete after cancellation');
  };

  const job = store.create('pro-traffic-hunter', { categoryId: 'entertainment' }, executor);
  await waitForState(store, job.id, ['running', 'streaming']);
  const cancelled = store.cancel(job.id);
  const events = store.getEvents(job.id);

  assert('job cancellation returns job', !!cancelled);
  assert('job cancelled', cancelled?.state === 'cancelled');
  assert('job emits cancelled event', events.some((event) => event.type === 'cancelled'));
}

async function testConcurrencyQueue(): Promise<void> {
  let sequence = 0;
  let activeWorkers = 0;
  let maxActiveWorkers = 0;
  let releaseFirst: (() => void) | null = null;

  const store = new InMemoryMobileJobStore({
    maxConcurrentJobs: 1,
    idFactory: () => {
      sequence += 1;
      return `job_queue_${sequence}`;
    },
  });
  const executor: MobileJobExecutor = async (job, ctx) => {
    activeWorkers += 1;
    maxActiveWorkers = Math.max(maxActiveWorkers, activeWorkers);
    ctx.progress(30, `running ${job.id}`);
    if (job.id === 'job_queue_1') {
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
    }
    activeWorkers -= 1;
    return completedResult;
  };

  const first = store.create('golden-discovery', { categoryId: 'policy' }, executor);
  const second = store.create('golden-discovery', { categoryId: 'policy' }, executor);

  await waitForState(store, first.id, ['running', 'streaming']);
  await sleep(50);

  assert('second job remains queued while concurrency is saturated', store.get(second.id)?.state === 'queued');
  assert('only one PC worker runs at a time', maxActiveWorkers === 1, String(maxActiveWorkers));
  assert('job stats expose queue pressure before dequeue',
    store.stats().queued === 1 && store.stats().running === 1 && store.stats().maxConcurrentJobs === 1,
    JSON.stringify(store.stats()));

  releaseFirst?.();
  await waitForState(store, first.id, ['completed']);
  await waitForState(store, second.id, ['completed']);

  assert('queued job starts after first worker finishes', store.get(second.id)?.state === 'completed');
  assert('concurrency cap is preserved across dequeue', maxActiveWorkers === 1, String(maxActiveWorkers));
  assert('job stats settle after queue drains',
    store.stats().queued === 0 && store.stats().running === 0 && store.stats().completed === 2,
    JSON.stringify(store.stats()));
}

async function testFailureExposesError(): Promise<void> {
  const store = new InMemoryMobileJobStore({
    idFactory: () => 'job_fail',
  });
  const executor: MobileJobExecutor = async (_job, ctx) => {
    ctx.progress(35, 'calling quota limited provider');
    throw new Error('provider quota exceeded');
  };

  const job = store.create('shopping-connect', { keyword: 'test' }, executor);
  const failed = await waitForState(store, job.id, ['failed']);
  const events = store.getEvents(job.id);

  assert('failed job exposes error field', failed.error === 'provider quota exceeded');
  assert('failed job keeps progress message for legacy clients', failed.progressMessage === 'provider quota exceeded');
  assert('failed event exposes error field',
    events.some((event) => event.type === 'failed' && event.error === 'provider quota exceeded'));
}

(async () => {
  await testCompletesWithProgress();
  await testCancellation();
  await testConcurrencyQueue();
  await testFailureExposesError();
  console.log('[mobile-job-orchestrator.test] passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
