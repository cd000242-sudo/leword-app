import fs from 'fs';
import path from 'path';

function source(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function assert(name: string, condition: boolean): void {
  if (!condition) throw new Error(name);
}

const validator = source('src/utils/keyword-validator.ts');
const validatorRuntime = source('src/utils/keyword-validator.js');
const trafficExplosion = source('src/utils/traffic-explosion-hunter.ts');
const lifecycle = source('src/utils/pro-hunter-v12/lifecycle-tracker.ts');
const metricsUpdater = source('src/utils/mass-collection/keyword-metrics-updater.ts');
const keywordStorage = source('src/utils/mass-collection/keyword-storage.ts');
const freshKeywords = source('src/utils/mass-collection/fresh-keywords-api.ts');
const smartBlock = source('src/utils/naver-smart-block-extractor.ts');
const proWebSite = source('apps/api/src/pro-web-site.ts');

assert(
  'keyword validation uses the canonical Blog client and distinguishes failure from a real zero total',
  validator.includes('getNaverBlogDocumentCount(keyword')
    && !validator.includes("documentCount = blogResults.length > 0 ? 100 : 0")
    && !validator.includes("const apiUrl = 'https://openapi.naver.com/v1/search/blog.json'")
    && validator.includes('documentCount: number | null;')
    && validator.includes('let documentCount: number | null = null;')
    && validator.includes("reasonCode = 'no-documents';")
    && validator.includes("reasonCode = 'document-count-unavailable';")
    && !validator.includes('? measuredDocumentCount\n        : 0;'),
);

assert(
  'tracked JavaScript validator mirror cannot shadow the fixed TypeScript implementation in ts-node',
  validatorRuntime.includes('getNaverBlogDocumentCount')
    && validatorRuntime.includes('let documentCount = null;')
    && validatorRuntime.includes("reasonCode = 'no-documents';")
    && validatorRuntime.includes("reasonCode = 'document-count-unavailable';")
    && !validatorRuntime.includes('documentCount = blogResults.length > 0 ? 100 : 0')
    && !validatorRuntime.includes("const apiUrl = 'https://openapi.naver.com/v1/search/blog.json'"),
);

assert(
  'traffic-explosion verification preserves the normalized broad query',
  trafficExplosion.includes('normalizeNaverBlogBroadQuery(kw.keyword)')
    && trafficExplosion.includes('getNaverBlogDocumentCount(broadKeyword')
    && !trafficExplosion.includes("axios.get('https://openapi.naver.com/v1/search/blog.json'"),
);

assert(
  'lifecycle document monitoring uses the canonical Blog client',
  lifecycle.includes('getNaverBlogDocumentCount(keyword')
    && !lifecycle.includes("axios.get('https://openapi.naver.com/v1/search/blog.json'"),
);

assert(
  'stored-keyword document refresh uses the canonical Blog client',
  metricsUpdater.includes('getNaverBlogDocumentCount(keyword')
    && metricsUpdater.includes('peekCachedNaverBlogDocumentCountMeasurement(keyword)')
    && metricsUpdater.includes('documentCountMeasuredAt: cachedMeasurement.measuredAt')
    && !metricsUpdater.includes('data.total || 0')
    && !metricsUpdater.includes('newDocumentCount ?? keyword.documentCount')
    && !metricsUpdater.includes('documentCounts.get(keyword) ?? stored.documentCount'),
);

assert(
  'stored recommendations require fresh exact-query-bound broad provenance',
  keywordStorage.includes('hasFreshCanonicalStoredDocumentCount')
    && keywordStorage.includes("keyword.documentCountSource === 'naver-api'")
    && keywordStorage.includes("keyword.documentCountQueryMode === 'broad'")
    && keywordStorage.includes('keyword.documentCountQueryKey === storedDocumentCountBroadQueryKey(keyword.keyword)')
    && freshKeywords.includes('.filter((keyword) => hasFreshCanonicalStoredDocumentCount(keyword))'),
);

assert(
  'smart-block keyword metrics use the canonical Blog client',
  smartBlock.includes('getNaverBlogDocumentCount(kw')
    && !smartBlock.includes('documentCounts.set(kw, data.total || 0)'),
);

assert(
  'browser-local Blog API does not coerce malformed totals into a real zero count',
  proWebSite.includes("typeof payload.total === 'number'")
    && proWebSite.includes('Number.isFinite(total) && total >= 0')
    && proWebSite.includes("typeof documentMeasurement.total === 'number'")
    && proWebSite.includes("typeof documentCount === 'number' ? documentCount : Number.NaN")
    && proWebSite.includes("if (raw === null || raw === undefined || raw === '' || typeof raw === 'boolean') return null;")
    && !proWebSite.includes('const total = Number(payload.total);'),
);

async function verifyTrackedValidatorRuntimeNullVsZero(): Promise<void> {
  // `ts-node src/main.ts` resolves the tracked JavaScript mirror first. Exercise
  // that actual runtime boundary with deterministic local stubs so null and a
  // genuine zero cannot regress into the same state.
  const NodeModule = require('module') as any;
  const originalLoad = NodeModule._load;
  let documentLookupResult: number | null = null;
  const fakeEnvironmentManager = {
    EnvironmentManager: class {
      static getInstance() {
        return {
          getConfig: () => ({ naverClientId: 'test-client', naverClientSecret: 'test-secret' }),
        };
      }
    },
  };
  const fakeDataLab = {
    getNaverKeywordSearchVolumeSeparate: async () => ([{
      pcSearchVolume: 120,
      mobileSearchVolume: 80,
    }]),
  };
  const fakeBlog = {
    getNaverBlogDocumentCount: async () => documentLookupResult,
  };
  const validatorPath = require.resolve('../keyword-validator.js');
  delete require.cache[validatorPath];
  let validatorModule: typeof import('../keyword-validator');
  try {
    NodeModule._load = function(request: string, parent: unknown, isMain: boolean) {
      if (request === './environment-manager') return fakeEnvironmentManager;
      if (request === './naver-datalab-api') return fakeDataLab;
      if (request === './naver-blog-api') return fakeBlog;
      return originalLoad.call(this, request, parent, isMain);
    };
    validatorModule = require(validatorPath) as typeof import('../keyword-validator');
    NodeModule._load = originalLoad;

    documentLookupResult = null;
    const unavailable = await validatorModule.validateKeyword('조회 실패 키워드');
    assert('runtime validator preserves document lookup failure as null',
      unavailable.documentCount === null
        && unavailable.reasonCode === 'document-count-unavailable'
        && unavailable.reason !== '검색 결과 없음');

    documentLookupResult = 0;
    const genuineZero = await validatorModule.validateKeyword('실제 영건 키워드');
    assert('runtime validator preserves a genuine OpenAPI zero total',
      genuineZero.documentCount === 0
        && genuineZero.reasonCode === 'no-documents'
        && genuineZero.reason === '검색 결과 없음');
  } finally {
    NodeModule._load = originalLoad;
    delete require.cache[validatorPath];
  }
}

verifyTrackedValidatorRuntimeNullVsZero()
  .then(() => console.log('[document-count-consumer-ssot.test] passed'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
