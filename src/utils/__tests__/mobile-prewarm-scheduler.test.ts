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

  console.log('[mobile-prewarm-scheduler.test] passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
