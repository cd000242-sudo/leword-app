import http from 'http';

const {
  runMobileApiPerformanceSmoke,
} = require('../../../scripts/mobile-api-performance-smoke.js');

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

function makeJob(state: 'running' | 'completed', progressPercent: number) {
  return {
    id: 'job_perf',
    product: 'keyword-analysis',
    state,
    params: { keyword: '근로장려금' },
    progressPercent,
    progressMessage: state,
    result: state === 'completed' ? {
      keywords: [{
        keyword: '근로장려금 신청방법',
        grade: 'SSS',
        pcSearchVolume: 600,
        mobileSearchVolume: 900,
        totalSearchVolume: 1500,
        documentCount: 120,
        goldenRatio: 12.5,
        cpc: 120,
        category: 'policy',
        source: 'fixture',
        intent: 'apply-guide',
        evidence: ['measured fixture'],
        isMeasured: true,
      }],
      summary: {
        total: 1,
        sss: 1,
        measured: 1,
        elapsedMs: 20,
        fromCache: false,
        parityMode: 'pc-engine-plus',
      },
    } : undefined,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

async function runPassingPerformanceSmoke(): Promise<void> {
  let polls = 0;
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      json(res, 200, {
        ok: true,
        service: 'leword-api',
        parity: {
          devicePolicy: {
            heavyBrowserAutomation: 'server-only',
          },
        },
        runtime: {
          ok: true,
          checks: [{ name: 'Naver SearchAd credentials configured', ok: true }],
        },
        jobs: { queued: 0, running: 0 },
        cache: { enabled: true, size: 0 },
        prewarm: { enabled: true, running: false },
      });
      return;
    }
    if (req.method === 'GET' && req.url === '/v1/notifications?limit=1') {
      json(res, 200, {
        ok: true,
        snapshot: { total: 0, unreadCount: 0, updatedAt: new Date(0).toISOString(), items: [] },
      });
      return;
    }
    if (req.method === 'POST' && req.url === '/v1/keywords/analyze') {
      json(res, 202, {
        ok: true,
        job: makeJob('running', 10),
        links: {
          self: '/v1/jobs/job_perf',
          events: '/v1/jobs/job_perf/events',
          cancel: '/v1/jobs/job_perf',
        },
      });
      return;
    }
    if (req.method === 'GET' && req.url === '/v1/jobs/job_perf') {
      polls += 1;
      json(res, 200, { ok: true, job: makeJob(polls >= 2 ? 'completed' : 'running', polls >= 2 ? 100 : 35) });
      return;
    }
    json(res, 404, { ok: false, message: 'not found' });
  });

  const port = await listen(server);
  try {
    const report = await runMobileApiPerformanceSmoke({
      baseUrl: `http://127.0.0.1:${port}`,
      accessToken: 'fixture-token',
      runJob: true,
      expectMeasured: true,
      pollIntervalMs: 10,
      timeoutMs: 2000,
      budgets: {
        healthP95: 1000,
        notificationP95: 1000,
        jobAcceptedP95: 1000,
        firstProgressP95: 1000,
        terminalP95: 2000,
      },
    });
    assert('performance smoke passes fixture server', report.ok === true);
    assert('performance smoke records all key timings',
      typeof report.timings.healthMs === 'number'
        && typeof report.timings.jobAcceptedMs === 'number'
        && typeof report.timings.firstProgressMs === 'number'
        && typeof report.timings.terminalMs === 'number');
    assert('performance smoke checks measured PC metrics',
      report.checks.some((item: any) => item.name === 'keyword job returns measured PC metrics' && item.ok));
  } finally {
    await close(server);
  }
}

async function runBudgetFailureSmoke(): Promise<void> {
  const server = http.createServer((req, res) => {
    setTimeout(() => {
      if (req.method === 'GET' && req.url === '/health') {
        json(res, 200, {
          ok: true,
          service: 'leword-api',
          parity: { devicePolicy: { heavyBrowserAutomation: 'server-only' } },
          runtime: { ok: true, checks: [] },
        });
        return;
      }
      json(res, 404, { ok: false, message: 'not found' });
    }, 25);
  });

  const port = await listen(server);
  try {
    const report = await runMobileApiPerformanceSmoke({
      baseUrl: `http://127.0.0.1:${port}`,
      runJob: false,
      budgets: {
        healthP95: 1,
        notificationP95: 1,
        jobAcceptedP95: 1,
        firstProgressP95: 1,
        terminalP95: 1,
      },
    });
    assert('performance smoke reports budget failures without throwing',
      report.ok === false
        && report.blockers.some((item: any) => item.name === 'health responds within SLA'));
  } finally {
    await close(server);
  }
}

(async () => {
  await runPassingPerformanceSmoke();
  await runBudgetFailureSmoke();
  console.log('[mobile-api-performance-smoke.test] passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

export {};
