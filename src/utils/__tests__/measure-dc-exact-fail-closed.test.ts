import axios from 'axios';
import fs from 'fs';
import os from 'os';
import path from 'path';

function assert(name: string, condition: boolean, detail = ''): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

async function run(): Promise<void> {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-document-exact-'));
  const cacheFile = path.join(fixtureRoot, 'naver-document-count-exact-v1.json');
  fs.writeFileSync(cacheFile, JSON.stringify({
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    ttlMs: 15 * 60 * 1000,
    entries: [
      {
        keyword: 'safe broad cache keyword',
        total: 321,
        measuredAtMs: Date.now() - 1_000,
      },
      {
        keyword: '"legacy exact cache keyword"',
        total: 999,
        measuredAtMs: Date.now() - 1_000,
      },
    ],
  }), 'utf8');
  process.env['LEWORD_NAVER_DOCUMENT_COUNT_CACHE_FILE'] = cacheFile;

  // Load after the isolated legacy cache is installed. The old quoted key must
  // never normalize into the canonical broad cache namespace.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const naverApi = require('../naver-blog-api') as typeof import('../naver-blog-api');
  assert(
    'legacy v1 broad cache entries remain readable',
    naverApi.peekCachedNaverBlogDocumentCount('safe broad cache keyword') === 321,
  );
  const legacyExactCacheMeasurement = naverApi
    .peekCachedNaverBlogDocumentCountMeasurement('legacy exact cache keyword');

  const mutableNaverApi = naverApi as any;
  const originalGetDocumentCount = mutableNaverApi.getNaverBlogDocumentCount;
  const originalPeekMeasurement = mutableNaverApi.peekCachedNaverBlogDocumentCountMeasurement;
  const originalAxiosGet = axios.get;
  let openApiCalls = 0;
  let scrapeCalls = 0;
  let scrapeUrl = '';

  mutableNaverApi.getNaverBlogDocumentCount = async () => {
    openApiCalls += 1;
    return 777;
  };
  mutableNaverApi.peekCachedNaverBlogDocumentCountMeasurement = () => ({
    total: 777,
    measuredAtMs: Date.now(),
    measuredAt: new Date().toISOString(),
  });
  (axios as any).get = async (url: string) => {
    scrapeCalls += 1;
    scrapeUrl = url;
    return { data: '<div>검색결과 약 123건</div>' };
  };

  const measureModulePath = require.resolve('../measure-dc');
  delete require.cache[measureModulePath];
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const {
      measureDocumentCount,
      selectDocumentCountMeasurement,
    } = require('../measure-dc') as typeof import('../measure-dc');
    const measured = await measureDocumentCount('alpha beta', {
      queryMode: 'exact-phrase',
      skipCache: true,
      searchVolume: 1_000,
      scrapeTimeoutMs: 500,
    });

    assert(
      'exact-phrase measurement never calls the broad-normalizing Blog OpenAPI client',
      openApiCalls === 0,
      JSON.stringify({ openApiCalls, measured }),
    );
    assert(
      'exact-phrase measurement uses the explicitly quoted noncanonical scrape path',
      scrapeCalls === 1
        && scrapeUrl.includes(encodeURIComponent('"alpha beta"')),
      JSON.stringify({ scrapeCalls, scrapeUrl }),
    );
    assert(
      'exact-phrase measurement stays estimated and can never be trusted Naver API/high',
      measured !== null
        && measured.dc === 123
        && measured.queryMode === 'exact-phrase'
        && measured.source === 'scrape'
        && measured.confidence === 'medium'
        && measured.isEstimated === true,
      JSON.stringify(measured),
    );
    assert(
      'the measurement selector independently rejects an OpenAPI total labeled exact-phrase',
      selectDocumentCountMeasurement(
        777,
        null,
        'exact-phrase',
        new Date().toISOString(),
      ) === null,
    );

    const unavailable = await measureDocumentCount('gamma delta', {
      queryMode: 'exact-phrase',
      skipCache: true,
      skipScrape: true,
      searchVolume: 400,
    });
    assert(
      'exact-phrase without a measured noncanonical source fails closed without inventing a number',
      openApiCalls === 0
        && scrapeCalls === 1
        && unavailable === null,
      JSON.stringify({ openApiCalls, scrapeCalls, unavailable }),
    );
    assert(
      'legacy v1 quote-bearing exact cache entries cannot become broad entries',
      legacyExactCacheMeasurement === null,
      JSON.stringify(legacyExactCacheMeasurement),
    );
  } finally {
    mutableNaverApi.getNaverBlogDocumentCount = originalGetDocumentCount;
    mutableNaverApi.peekCachedNaverBlogDocumentCountMeasurement = originalPeekMeasurement;
    (axios as any).get = originalAxiosGet;
    delete require.cache[measureModulePath];
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

run().then(
  () => console.log('[measure-dc-exact-fail-closed.test] passed'),
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
