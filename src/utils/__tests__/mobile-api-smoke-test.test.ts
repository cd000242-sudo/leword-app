import http from 'http';

const {
  runMobileApiSmokeTest,
} = require('../../../scripts/mobile-api-smoke-test.js');

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address === 'object' && address) {
        resolve(address.port);
      }
    });
  });
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function json(res: http.ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function runPassingSmoke(): Promise<void> {
  const job = {
    id: 'job_smoke',
    product: 'keyword-analysis',
    state: 'completed',
    params: { keyword: 'worker readiness smoke' },
    progressPercent: 100,
    progressMessage: 'completed',
    result: {
      keywords: [{
        keyword: 'worker readiness smoke',
        grade: 'SSS',
        pcSearchVolume: 600,
        mobileSearchVolume: 700,
        totalSearchVolume: 1300,
        documentCount: 120,
        goldenRatio: 10.83,
        cpc: 120,
        category: 'test',
        source: 'fixture',
        intent: 'smoke',
        evidence: ['fixture'],
        isMeasured: true,
      }],
      summary: {
        total: 1,
        sss: 1,
        measured: 1,
        elapsedMs: 1,
        fromCache: false,
        parityMode: 'pc-engine-plus',
      },
    },
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };

  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      json(res, 200, {
        ok: true,
        service: 'leword-api',
        endpoints: 6,
        runtime: {
          ok: true,
          checks: [{ name: 'Naver SearchAd credentials configured', ok: true }],
        },
        jobs: { queued: 0, running: 0 },
        cache: { enabled: true, size: 0 },
        prewarm: { enabled: true, running: false },
        push: { enabledSubscriptions: 0 },
      });
      return;
    }
    if (req.method === 'GET' && req.url === '/v1/notifications?limit=1') {
      json(res, 200, {
        ok: true,
        snapshot: {
          total: 0,
          unreadCount: 0,
          updatedAt: new Date(0).toISOString(),
          items: [],
        },
      });
      return;
    }
    if (req.method === 'POST' && req.url === '/v1/keywords/analyze') {
      json(res, 202, {
        ok: true,
        job,
        links: {
          self: '/v1/jobs/job_smoke',
          events: '/v1/jobs/job_smoke/events',
          cancel: '/v1/jobs/job_smoke',
        },
      });
      return;
    }
    if (req.method === 'GET' && req.url === '/v1/jobs/job_smoke') {
      json(res, 200, { ok: true, job });
      return;
    }
    json(res, 404, { ok: false, message: 'not found' });
  });

  const port = await listen(server);
  try {
    const report = await runMobileApiSmokeTest({
      baseUrl: `http://127.0.0.1:${port}`,
      accessToken: 'fixture-token',
      requireRuntimeReady: true,
      runJob: true,
      expectMeasured: true,
      timeoutMs: 5000,
    });
    assert('smoke test passes fixture server', report.ok === true);
    assert('smoke test checked measured job', report.checks.some((item: any) => item.name === 'job-measured' && item.ok));
  } finally {
    await close(server);
  }
}

async function runRuntimeFailureSmoke(): Promise<void> {
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      json(res, 200, {
        ok: true,
        service: 'leword-api',
        endpoints: 6,
        runtime: {
          ok: false,
          checks: [{ name: 'Naver SearchAd credentials configured', ok: false }],
        },
      });
      return;
    }
    json(res, 404, { ok: false, message: 'not found' });
  });

  const port = await listen(server);
  try {
    let failed = false;
    try {
      await runMobileApiSmokeTest({
        baseUrl: `http://127.0.0.1:${port}`,
        requireRuntimeReady: true,
        runJob: false,
      });
    } catch (err: any) {
      failed = /runtime-ready/.test(err.message);
    }
    assert('smoke test fails when runtime is not ready', failed);
  } finally {
    await close(server);
  }
}

(async () => {
  await runPassingSmoke();
  await runRuntimeFailureSmoke();
  console.log('[mobile-api-smoke-test.test] passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
