import http from 'http';
import { createLewordApiServer } from '../../../apps/api/src/server';
import type { MobileJobExecutor } from '../../mobile/job-orchestrator';
import type { MobileKeywordResult } from '../../mobile/contracts';

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

const result: MobileKeywordResult = {
  keywords: [],
  summary: {
    total: 0,
    sss: 0,
    measured: 0,
    elapsedMs: 1,
    fromCache: false,
    parityMode: 'pc-engine',
  },
};

(async () => {
  const executor: MobileJobExecutor = async () => result;

  const bodyLimitServer = createLewordApiServer({
    executor,
    apiGuardrails: {
      maxBodyBytes: 64,
      maxRequestsPerMinute: 100,
      windowMs: 60_000,
    },
  });
  const bodyLimitPort = await listen(bodyLimitServer);
  const bodyLimitBaseUrl = `http://127.0.0.1:${bodyLimitPort}`;

  try {
    const health = await fetch(`${bodyLimitBaseUrl}/health`);
    const healthJson: any = await health.json();
    assert('health exposes body and rate guardrails',
      healthJson.guardrails.enabled === true
        && healthJson.guardrails.maxBodyBytes === 64
        && healthJson.guardrails.rateLimit.maxRequestsPerMinute === 100);

    const oversized = await fetch(`${bodyLimitBaseUrl}/v1/keywords/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyword: '지원금',
        categoryId: 'policy',
        maxRelatedCount: 10,
        extraPadding: 'x'.repeat(256),
      }),
    });
    const oversizedJson: any = await oversized.json();
    assert('oversized mobile JSON body is rejected with 413',
      oversized.status === 413
        && oversizedJson.ok === false
        && /too large/.test(oversizedJson.message));
  } finally {
    await close(bodyLimitServer);
  }

  const rateLimitServer = createLewordApiServer({
    executor,
    apiGuardrails: {
      maxBodyBytes: 4096,
      maxRequestsPerMinute: 2,
      windowMs: 60_000,
    },
  });
  const rateLimitPort = await listen(rateLimitServer);
  const rateLimitBaseUrl = `http://127.0.0.1:${rateLimitPort}`;

  try {
    const first = await fetch(`${rateLimitBaseUrl}/v1/notifications`);
    const second = await fetch(`${rateLimitBaseUrl}/v1/notifications`);
    const third = await fetch(`${rateLimitBaseUrl}/v1/notifications`);
    const thirdJson: any = await third.json();

    assert('first rate-limited API request is allowed', first.status === 200);
    assert('second rate-limited API request is allowed', second.status === 200);
    assert('third rate-limited API request is rejected with 429',
      third.status === 429
        && third.headers.get('retry-after') !== null
        && thirdJson.message === 'mobile API rate limit exceeded');

    const healthAfterLimit = await fetch(`${rateLimitBaseUrl}/health`);
    assert('health remains available after client rate limit', healthAfterLimit.status === 200);
  } finally {
    await close(rateLimitServer);
  }

  console.log('[mobile-api-guardrails.test] passed');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
