import fs from 'fs';
import os from 'os';
import path from 'path';

function assert(name: string, condition: boolean, detail = ''): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

async function run(): Promise<void> {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-document-cache-'));
  const cacheFile = path.join(runtimeDir, `naver-document-count-cache-${process.pid}.json`);
  const nowMs = Date.now();
  const freshMeasuredAtMs = nowMs - 60_000;
  const corruptFutureMeasuredAtMs = nowMs + 10 * 60_000;
  fs.writeFileSync(cacheFile, JSON.stringify({
    schemaVersion: 1,
    savedAt: new Date(nowMs).toISOString(),
    ttlMs: 15 * 60 * 1000,
    entries: [
      { keyword: 'fresh cache keyword', total: 321, measuredAtMs: freshMeasuredAtMs },
      { keyword: 'future cache keyword', total: 999, measuredAtMs: corruptFutureMeasuredAtMs },
    ],
  }), 'utf8');
  process.env['LEWORD_NAVER_DOCUMENT_COUNT_CACHE_FILE'] = cacheFile;

  // Load only after the isolated cache path is configured.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const api = require('../naver-blog-api') as typeof import('../naver-blog-api');
  const fresh = api.peekCachedNaverBlogDocumentCountMeasurement('fresh cache keyword');
  const future = api.peekCachedNaverBlogDocumentCountMeasurement('future cache keyword');
  assert(
    'disk cache preserves the original official measurement timestamp',
    fresh?.total === 321 && fresh.measuredAtMs === freshMeasuredAtMs,
    JSON.stringify(fresh),
  );
  assert('far-future cache timestamps are rejected', future === null, JSON.stringify(future));

  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ total: 432 }),
      text: async () => '',
    } as Response;
  }) as typeof fetch;
  try {
    const options = {
      forceFresh: true,
      config: { clientId: 'test-client', clientSecret: 'test-secret' },
    };
    const [left, right] = await Promise.all([
      api.getNaverBlogDocumentCount('single flight keyword', options),
      api.getNaverBlogDocumentCount('single flight keyword', options),
    ]);
    assert(
      'same-key concurrent force-fresh lookups share one OpenAPI request',
      left === 432 && right === 432 && fetchCalls === 1,
      JSON.stringify({ left, right, fetchCalls }),
    );
    const measured = api.peekCachedNaverBlogDocumentCountMeasurement('single flight keyword');
    assert(
      'force-fresh success stores a real measurement timestamp',
      measured?.total === 432
        && typeof measured.measuredAtMs === 'number'
        && measured.measuredAtMs >= nowMs,
      JSON.stringify(measured),
    );
    const cached = await api.getNaverBlogDocumentCount('single flight keyword', {
      config: options.config,
    });
    assert('normal lookup reuses the fresh cache without another request', cached === 432 && fetchCalls === 1);

    assert(
      'shared client always has a bounded default and clamps explicit timeouts',
      api.NAVER_BLOG_OPENAPI_DEFAULT_TIMEOUT_MS === 8_000
        && api.NAVER_BLOG_OPENAPI_MAX_TIMEOUT_MS === 15_000,
    );
    let timeoutFetchCalls = 0;
    globalThis.fetch = (async (_input: any, init?: RequestInit) => {
      timeoutFetchCalls += 1;
      if (timeoutFetchCalls === 1) {
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        });
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ total: 777 }),
        text: async () => '',
      } as Response;
    }) as typeof fetch;
    const timedOut = await api.getNaverBlogDocumentCount('timeout queue keyword', {
      ...options,
      timeoutMs: 20,
    });
    const afterTimeout = await api.getNaverBlogDocumentCount('after timeout keyword', {
      ...options,
      timeoutMs: 1_000,
    });
    assert(
      'an aborted lookup releases the serialized slot for the next document request',
      timedOut === null && afterTimeout === 777 && timeoutFetchCalls === 2,
      JSON.stringify({ timedOut, afterTimeout, timeoutFetchCalls }),
    );

    let batchFetchCalls = 0;
    globalThis.fetch = (async () => {
      batchFetchCalls += 1;
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ total: 1_000 + batchFetchCalls }),
        text: async () => '',
      } as Response;
    }) as typeof fetch;
    const queuedBatch = await Promise.all(Array.from({ length: 50 }, (_, index) => (
      api.getNaverBlogDocumentCount(`queued batch keyword ${index}`, {
        ...options,
        timeoutMs: 20,
      })
    )));
    assert(
      'fifty queued lookups each receive a fresh network timeout after entering the slot',
      queuedBatch.every((value) => value !== null) && batchFetchCalls === 50,
      JSON.stringify({ successful: queuedBatch.filter((value) => value !== null).length, batchFetchCalls }),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  await new Promise((resolve) => setTimeout(resolve, 650));
  const persisted = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  assert(
    'debounced persistence writes the updated cache once it settles',
    Array.isArray(persisted.entries)
      && persisted.entries.some((entry: any) => entry.keyword === 'single flight keyword' && entry.total === 432),
    JSON.stringify(persisted),
  );
  fs.rmSync(runtimeDir, { recursive: true, force: true });
}

run().then(
  () => console.log('[naver-blog-document-cache.test] passed'),
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
