import { PuppeteerPool } from '../puppeteer-pool';

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean): void {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`FAIL ${name}`);
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fakeInstance(
  id: number,
  options: { stale?: boolean; onClose?: () => void; closeAllPages?: () => Promise<void> } = {},
): any {
  const browser = {
    id,
    isConnected: () => true,
  };
  return {
    browser,
    pages: new Set(),
    lastUsed: Date.now(),
    inUse: false,
    releasing: false,
    leaseStartedAt: options.stale ? 1 : null,
    closeAllPages: options.closeAllPages || (async () => undefined),
    close: async () => options.onClose?.(),
    isIdle: () => false,
    isLeaseExpired: () => options.stale === true,
    markAcquired() {
      this.inUse = true;
      this.leaseStartedAt = Date.now();
    },
    markReleased() {
      this.inUse = false;
      this.leaseStartedAt = null;
    },
  };
}

async function run(): Promise<void> {
  const createGate = deferred();
  const pool = new PuppeteerPool({ maxSize: 1, idleTimeout: 60_000 } as any);
  let createCalls = 0;
  (pool as any).createBrowser = async () => {
    createCalls += 1;
    await createGate.promise;
    return fakeInstance(createCalls);
  };

  const firstAcquire = pool.acquire();
  const secondAcquire = pool.acquire();
  createGate.resolve();
  const firstBrowser = await firstAcquire;
  await new Promise((resolve) => setImmediate(resolve));

  assert('concurrent acquire reserves capacity before launching Chromium', createCalls === 1);
  pool.release(firstBrowser);
  const secondBrowser = await Promise.race([
    secondAcquire,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('second acquire stalled')), 250)),
  ]);
  assert('queued acquire receives the released browser', secondBrowser === firstBrowser);
  await pool.destroy();

  let closeCalls = 0;
  const stalePool = new PuppeteerPool({ maxSize: 1, idleTimeout: 60_000, maxLeaseMs: 1 } as any);
  (stalePool as any).pool = [fakeInstance(1, { stale: true, onClose: () => { closeCalls += 1; } })];
  await (stalePool as any).cleanup();
  assert('cleanup force-closes a stale in-use Chromium lease', closeCalls === 1);
  assert('cleanup removes the stale lease from pool capacity', (stalePool as any).pool.length === 0);
  await stalePool.destroy();

  const releaseGate = deferred();
  const releasingPool = new PuppeteerPool({ maxSize: 1, idleTimeout: 60_000 } as any);
  const releasingInstance = fakeInstance(1, { closeAllPages: () => releaseGate.promise });
  const idleInstance = fakeInstance(2);
  releasingInstance.markAcquired();
  (releasingPool as any).pool = [releasingInstance, idleInstance];
  releasingPool.release(releasingInstance.browser);
  await releasingPool.closeIdle();
  assert(
    'closeIdle retains a browser while release cleanup is still in progress',
    (releasingPool as any).pool.length === 1,
  );
  releaseGate.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  await releasingPool.destroy();

  console.log(`\n[puppeteer-pool-runtime.test] passed: ${passed} / failed: ${failed}`);
  if (failed > 0) process.exit(1);
}

void run().catch((error) => {
  console.error(error);
  process.exit(1);
});
