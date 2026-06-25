import { MobilePrewarmScheduler } from '../../mobile/prewarm-scheduler';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

(async () => {
  let runCount = 0;
  let lastLimit: number | undefined;
  let intervalHandler: (() => void) | null = null;
  let clearCount = 0;

  const scheduler = new MobilePrewarmScheduler({
    service: {
      runOnce: async (limit?: number) => {
        runCount += 1;
        lastLimit = limit;
        return {
          running: false,
          updatedAt: new Date(0).toISOString(),
          completed: 1,
          failed: 0,
          cacheHits: 0,
          targets: [],
        };
      },
      snapshot: () => ({
        running: false,
        updatedAt: new Date(0).toISOString(),
        completed: 0,
        failed: 0,
        cacheHits: 0,
        targets: [],
      }),
    },
    intervalMs: 60_000,
    limit: 2,
    runOnStart: true,
    setIntervalFn: (handler) => {
      intervalHandler = handler;
      return 'timer-1';
    },
    clearIntervalFn: (handle) => {
      if (handle === 'timer-1') clearCount += 1;
    },
  });

  const started = scheduler.start();
  await flush();

  assert('scheduler starts enabled', started.enabled === true);
  assert('scheduler runs on start', runCount === 1, String(runCount));
  assert('scheduler forwards target limit', lastLimit === 2, String(lastLimit));
  assert('scheduler records successful run', scheduler.snapshot().successfulRuns === 1);

  intervalHandler?.();
  await flush();
  assert('scheduler runs on interval tick', runCount === 2, String(runCount));

  scheduler.stop();
  assert('scheduler clears interval on stop', clearCount === 1, String(clearCount));
  assert('scheduler snapshot disables after stop', scheduler.snapshot().enabled === false);

  let slowResolve: (() => void) | null = null;
  let slowRuns = 0;
  const overlapScheduler = new MobilePrewarmScheduler({
    service: {
      runOnce: async () => {
        slowRuns += 1;
        await new Promise<void>((resolve) => {
          slowResolve = resolve;
        });
        return {
          running: false,
          updatedAt: new Date(0).toISOString(),
          completed: 1,
          failed: 0,
          cacheHits: 0,
          targets: [],
        };
      },
      snapshot: () => ({
        running: false,
        updatedAt: new Date(0).toISOString(),
        completed: 0,
        failed: 0,
        cacheHits: 0,
        targets: [],
      }),
    },
    intervalMs: 60_000,
    runOnStart: false,
    setIntervalFn: () => 'timer-2',
    clearIntervalFn: () => undefined,
  });

  void overlapScheduler.runNow();
  void overlapScheduler.runNow();
  await flush();
  assert('scheduler prevents overlapping prewarm runs', slowRuns === 1, String(slowRuns));
  slowResolve?.();
  await flush();

  let delayedRunCount = 0;
  let delayedHandler: (() => void) | null = null;
  let delayedClears = 0;
  const delayedScheduler = new MobilePrewarmScheduler({
    service: {
      runOnce: async () => {
        delayedRunCount += 1;
        return {
          running: false,
          updatedAt: new Date(0).toISOString(),
          completed: 1,
          failed: 0,
          cacheHits: 0,
          targets: [],
        };
      },
      snapshot: () => ({
        running: false,
        updatedAt: new Date(0).toISOString(),
        completed: 0,
        failed: 0,
        cacheHits: 0,
        targets: [],
      }),
    },
    intervalMs: 60_000,
    runOnStart: true,
    startupDelayMs: 30_000,
    setIntervalFn: () => 'timer-3',
    clearIntervalFn: () => undefined,
    setTimeoutFn: (handler) => {
      delayedHandler = handler;
      return 'startup-delay';
    },
    clearTimeoutFn: (handle) => {
      if (handle === 'startup-delay') delayedClears += 1;
    },
  });
  delayedScheduler.start();
  await flush();
  assert('scheduler delays startup prewarm when configured', delayedRunCount === 0);
  delayedHandler?.();
  await flush();
  assert('scheduler runs delayed startup prewarm', delayedRunCount === 1, String(delayedRunCount));
  delayedScheduler.stop();
  assert('scheduler does not clear consumed startup delay', delayedClears === 0, String(delayedClears));

  let gatedRunCount = 0;
  const gatedScheduler = new MobilePrewarmScheduler({
    service: {
      runOnce: async () => {
        gatedRunCount += 1;
        return {
          running: false,
          updatedAt: new Date(0).toISOString(),
          completed: 1,
          failed: 0,
          cacheHits: 0,
          targets: [],
        };
      },
      snapshot: () => ({
        running: false,
        updatedAt: new Date(0).toISOString(),
        completed: 0,
        failed: 0,
        cacheHits: 0,
        targets: [],
      }),
    },
    intervalMs: 60_000,
    runOnStart: false,
    shouldRun: () => ({
      ok: false,
      reason: 'Naver OpenAPI document quota exhausted; prewarm waits for measured-only keyword data',
    }),
    setIntervalFn: () => 'timer-4',
    clearIntervalFn: () => undefined,
  });
  await gatedScheduler.runNow();
  const gatedSnapshot = gatedScheduler.snapshot();
  assert('scheduler skips prewarm when runtime gate is closed', gatedRunCount === 0, String(gatedRunCount));
  assert('scheduler records skipped prewarm runs', gatedSnapshot.skippedRuns === 1, String(gatedSnapshot.skippedRuns));
  assert('scheduler exposes skipped prewarm reason',
    /quota exhausted/.test(gatedSnapshot.lastMessage || ''),
    gatedSnapshot.lastMessage);

  let retryRunCount = 0;
  let retryGateOpen = false;
  let retryHandler: (() => void) | null = null;
  let retryDelay = 0;
  const retryBaseMs = Date.parse('2026-06-21T15:09:50.000Z');
  const retryScheduler = new MobilePrewarmScheduler({
    service: {
      runOnce: async () => {
        retryRunCount += 1;
        return {
          running: false,
          updatedAt: new Date(0).toISOString(),
          completed: 1,
          failed: 0,
          cacheHits: 0,
          targets: [],
        };
      },
      snapshot: () => ({
        running: false,
        updatedAt: new Date(0).toISOString(),
        completed: 0,
        failed: 0,
        cacheHits: 0,
        targets: [],
      }),
    },
    intervalMs: 60_000,
    runOnStart: false,
    now: () => new Date(retryBaseMs),
    shouldRun: () => retryGateOpen
      ? true
      : {
        ok: false,
        reason: 'Naver OpenAPI document quota exhausted; prewarm waits for measured-only keyword data; retry after 2026-06-22 00:10:00 KST',
        retryAtMs: Date.parse('2026-06-21T15:10:00.000Z'),
      },
    setIntervalFn: () => 'timer-5',
    clearIntervalFn: () => undefined,
    setTimeoutFn: (handler, delayMs) => {
      retryHandler = handler;
      retryDelay = delayMs;
      return 'retry-delay';
    },
    clearTimeoutFn: () => undefined,
  });
  retryScheduler.start();
  await retryScheduler.runNow();
  assert('scheduler schedules quota retry at reset time',
    retryRunCount === 0 && retryDelay === 15_000 && /2026-06-21T15:10:00/.test(retryScheduler.snapshot().nextRetryAt || ''),
    `${retryRunCount}:${retryDelay}:${retryScheduler.snapshot().nextRetryAt}`);
  retryGateOpen = true;
  retryHandler?.();
  await flush();
  assert('scheduler runs prewarm after quota retry timer fires', retryRunCount === 1, String(retryRunCount));
  retryScheduler.stop();

  console.log('[mobile-prewarm-scheduler.test] passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
