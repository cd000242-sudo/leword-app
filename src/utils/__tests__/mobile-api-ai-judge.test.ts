import http from 'http';
import { createLewordApiServer } from '../../../apps/api/src/server';
import type { MobileJobExecutor } from '../../mobile/job-orchestrator';
import type {
  MobileKeywordMetric,
  MobileKeywordResult,
} from '../../mobile/contracts';

function assert(name: string, condition: unknown, detail = ''): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address === 'object' && address) resolve(address.port);
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

async function waitForCompletedJob(baseUrl: string, jobId: string): Promise<any> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const read = await fetch(`${baseUrl}/v1/jobs/${encodeURIComponent(jobId)}`);
    const readJson: any = await read.json();
    if (readJson.job?.state === 'completed') return readJson.job;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`job did not complete: ${jobId}`);
}

function keyword(overrides: Partial<MobileKeywordMetric>): MobileKeywordMetric {
  return {
    keyword: '청년도약계좌 신청 방법',
    grade: 'SSS',
    score: 94,
    pcSearchVolume: 420,
    mobileSearchVolume: 1880,
    totalSearchVolume: 2300,
    documentCount: 210,
    goldenRatio: 10.95,
    cpc: 160,
    category: 'policy',
    source: 'fixture-server-measured',
    intent: 'golden-discovery',
    evidence: ['fixture-searchad-volume', 'fixture-naver-blog-document-count'],
    isMeasured: true,
    ...overrides,
  };
}

(async () => {
  const executor: MobileJobExecutor = async (): Promise<MobileKeywordResult> => {
    const keywords = [
      keyword({}),
      keyword({
        keyword: '전영현 프로필',
        category: 'celeb',
        totalSearchVolume: 9000,
        documentCount: 120,
        goldenRatio: 75,
      }),
      keyword({
        keyword: 'synthetic fallback keyword',
        source: 'server-intent-template',
        evidence: ['estimated fallback'],
      }),
    ];
    return {
      keywords,
      summary: {
        total: keywords.length,
        sss: keywords.length,
        measured: keywords.length,
        elapsedMs: 1,
        fromCache: false,
        parityMode: 'pc-engine-plus',
      },
    };
  };

  const server = createLewordApiServer({
    executor,
    resultCache: null,
    entitlementVerifier: null,
    liveGoldenRadar: null,
    prewarmService: null,
    prewarmScheduler: null,
  });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const created = await fetch(`${baseUrl}/v1/pro/hunt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetCount: 30 }),
    });
    const createdJson: any = await created.json();
    assert('AI judge API fixture creates job', created.status === 202 && createdJson.ok === true);

    const job = await waitForCompletedJob(baseUrl, createdJson.job.id);
    const result: MobileKeywordResult = job.result;
    const names = result.keywords.map((item) => item.keyword);
    assert('server keeps actionable measured keyword',
      names.includes('청년도약계좌 신청 방법'), names.join('|'));
    assert('server removes thin profile keyword',
      !names.includes('전영현 프로필'), names.join('|'));
    assert('server removes synthetic fallback keyword',
      !names.includes('synthetic fallback keyword'), names.join('|'));

    const kept = result.keywords[0];
    assert('server attaches AI judge metadata to kept keyword',
      kept.aiJudge?.verdict === 'publish'
        && kept.measurementStatus === 'measured'
        && result.summary.aiJudged === 1
        && result.summary.publishReady === 1,
      JSON.stringify(result));
    assert('server records AI judge exclusion count for measured thin rows',
      result.summary.excludedByAiJudge === 1,
      JSON.stringify(result.summary));
  } finally {
    await close(server);
  }

  console.log('[mobile-api-ai-judge.test] passed');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
