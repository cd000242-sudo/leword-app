import fs from 'fs';
import path from 'path';
import {
  PERSISTENT_DOCUMENT_COUNT_TTL_MS,
  flushNow,
  getAllKeywordsWithCompleteData,
  getCanonicalPersistentDocumentCount,
  getPersistent,
  isCanonicalPersistentDocumentCount,
  mergePersistentCacheEntry,
  normalizePersistentDocumentCountQueryKey,
  setPersistent,
} from '../persistent-keyword-cache';
import { selectDocumentCountMeasurement } from '../measure-dc';

function assert(name: string, condition: boolean, detail = ''): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const now = Date.parse('2026-07-17T00:00:00.000Z');
const measuredAt = '2026-07-16T23:59:00.000Z';
const canonical = mergePersistentCacheEntry(null, {
  searchVolume: 2_400,
  documentCount: 320,
  documentCountSource: 'naver-api',
  documentCountConfidence: 'high',
  documentCountQueryMode: 'broad',
  documentCountQueryKey: '제주 렌터카',
  isDocumentCountEstimated: false,
  documentCountMeasuredAt: measuredAt,
  realCpc: 610,
  compIdx: 0.4,
}, now);

assert('canonical cache entry is accepted only with full OpenAPI broad provenance',
  canonical !== null
    && isCanonicalPersistentDocumentCount(canonical)
    && canonical.documentCountSavedAt === Date.parse(measuredAt)
    && getCanonicalPersistentDocumentCount(canonical, now) === 320,
  JSON.stringify(canonical));

const missingIdentity = mergePersistentCacheEntry(null, {
  searchVolume: 2_400,
  documentCount: 320,
  documentCountSource: 'naver-api',
  documentCountConfidence: 'high',
  documentCountQueryMode: 'broad',
  isDocumentCountEstimated: false,
  documentCountMeasuredAt: measuredAt,
  realCpc: null,
  compIdx: null,
}, now);
assert('legacy OpenAPI tuple without exact broad-query identity is not canonical',
  missingIdentity !== null
    && getCanonicalPersistentDocumentCount(missingIdentity, now) === null,
  JSON.stringify(missingIdentity));
assert('canonical tuple is rejected for a different spaced/unspaced broad query',
  canonical !== null
    && getCanonicalPersistentDocumentCount(canonical, now, '제주렌터카') === null);

const legacy = mergePersistentCacheEntry(null, {
  searchVolume: 2_400,
  documentCount: 25,
  realCpc: null,
  compIdx: null,
}, now);
assert('source-less legacy document count is retained only as untrusted diagnostic data',
  legacy !== null
    && legacy.documentCountSource === 'legacy'
    && legacy.isDocumentCountEstimated === true
    && getCanonicalPersistentDocumentCount(legacy, now) === null,
  JSON.stringify(legacy));

const scrape = mergePersistentCacheEntry(null, {
  searchVolume: 2_400,
  documentCount: 17,
  documentCountSource: 'scrape',
  documentCountConfidence: 'high',
  documentCountQueryMode: 'broad',
  documentCountQueryKey: '제주 렌터카',
  isDocumentCountEstimated: false,
  documentCountMeasuredAt: measuredAt,
  realCpc: null,
  compIdx: null,
}, now);
assert('HTML scrape cannot become a canonical count even if a caller labels it high confidence',
  scrape !== null
    && !isCanonicalPersistentDocumentCount(scrape)
    && scrape.isDocumentCountEstimated === true
    && getCanonicalPersistentDocumentCount(scrape, now) === null,
  JSON.stringify(scrape));

const exactPhrase = mergePersistentCacheEntry(null, {
  searchVolume: 2_400,
  documentCount: 12,
  documentCountSource: 'naver-api',
  documentCountConfidence: 'high',
  documentCountQueryMode: 'exact-phrase',
  documentCountQueryKey: '제주 렌터카',
  isDocumentCountEstimated: false,
  documentCountMeasuredAt: measuredAt,
  realCpc: null,
  compIdx: null,
}, now);
assert('quoted exact-phrase OpenAPI total is not the product-wide broad document count',
  exactPhrase !== null && getCanonicalPersistentDocumentCount(exactPhrase, now) === null,
  JSON.stringify(exactPhrase));

const canonicalMeasuredAt = canonical?.documentCountMeasuredAt;
const canonicalSavedAt = canonical?.documentCountSavedAt;
const scrapeOverwrite = mergePersistentCacheEntry(canonical, {
  searchVolume: 2_500,
  documentCount: 9,
  documentCountSource: 'scrape',
  documentCountConfidence: 'medium',
  documentCountQueryMode: 'broad',
  documentCountQueryKey: '제주 렌터카',
  isDocumentCountEstimated: false,
  documentCountMeasuredAt: '2026-07-17T00:01:00.000Z',
  realCpc: 620,
  compIdx: 0.5,
}, now + 60_000);
assert('secondary scrape cannot overwrite or refresh an existing canonical document count',
  scrapeOverwrite?.documentCount === 320
    && scrapeOverwrite.documentCountSource === 'naver-api'
    && scrapeOverwrite.documentCountMeasuredAt === canonicalMeasuredAt
    && scrapeOverwrite.documentCountSavedAt === canonicalSavedAt
    && getCanonicalPersistentDocumentCount(scrapeOverwrite, now + 60_000) === 320,
  JSON.stringify(scrapeOverwrite));

const olderCanonicalOverwrite = mergePersistentCacheEntry(canonical, {
  searchVolume: 2_600,
  documentCount: 99,
  documentCountSource: 'naver-api',
  documentCountConfidence: 'high',
  documentCountQueryMode: 'broad',
  documentCountQueryKey: '제주 렌터카',
  isDocumentCountEstimated: false,
  documentCountMeasuredAt: '2026-07-16T23:58:00.000Z',
  realCpc: 630,
  compIdx: 0.6,
}, now + 120_000);
assert('late-arriving older canonical measurement cannot roll back a newer count',
  olderCanonicalOverwrite?.documentCount === 320
    && olderCanonicalOverwrite.documentCountMeasuredAt === measuredAt
    && olderCanonicalOverwrite.searchVolume === 2_600,
  JSON.stringify(olderCanonicalOverwrite));

assert('canonical cache reuse expires from document measurement age, not an unrelated field refresh',
  canonical !== null
    && getCanonicalPersistentDocumentCount(
      canonical,
      now + PERSISTENT_DOCUMENT_COUNT_TTL_MS + 1,
    ) === null);

const selectedApi = selectDocumentCountMeasurement(320, 17, 'broad', measuredAt);
const selectedScrape = selectDocumentCountMeasurement(null, 17, 'broad', measuredAt);
assert('OpenAPI measurement carries the original measurement timestamp',
  selectedApi?.source === 'naver-api'
    && selectedApi.confidence === 'high'
    && selectedApi.queryMode === 'broad'
    && selectedApi.isEstimated === false
    && selectedApi.measuredAt === measuredAt,
  JSON.stringify(selectedApi));
assert('secondary scrape is labeled and timestamped but remains noncanonical',
  selectedScrape?.source === 'scrape'
    && selectedScrape.confidence === 'medium'
    && selectedScrape.measuredAt === measuredAt,
  JSON.stringify(selectedScrape));

const isolatedAppData = path.join(
  process.cwd(),
  'tmp',
  `persistent-document-query-key-${process.pid}-${Date.now()}`,
);
fs.mkdirSync(isolatedAppData, { recursive: true });
process.env['APPDATA'] = isolatedAppData;
const runtimeMeasuredAt = new Date().toISOString();
const canonicalWrite = (searchVolume: number, documentCount: number) => ({
  searchVolume,
  documentCount,
  documentCountSource: 'naver-api' as const,
  documentCountConfidence: 'high' as const,
  documentCountQueryMode: 'broad' as const,
  isDocumentCountEstimated: false,
  documentCountMeasuredAt: runtimeMeasuredAt,
  realCpc: 700,
  compIdx: 0.3,
});
setPersistent('제주 렌터카', canonicalWrite(1_100, 111));
setPersistent('제주렌터카', canonicalWrite(2_200, 222));
const spacedPersistent = getPersistent('제주 렌터카');
const unspacedPersistent = getPersistent('제주렌터카');
assert('persistent cache keeps spaced broad-query document identity and total',
  spacedPersistent?.documentCount === 111
    && spacedPersistent.documentCountQueryKey === normalizePersistentDocumentCountQueryKey('제주 렌터카')
    && getCanonicalPersistentDocumentCount(spacedPersistent, Date.now(), '제주 렌터카') === 111,
  JSON.stringify(spacedPersistent));
assert('persistent cache keeps unspaced broad-query document identity and total separately',
  unspacedPersistent?.documentCount === 222
    && unspacedPersistent.documentCountQueryKey === normalizePersistentDocumentCountQueryKey('제주렌터카')
    && getCanonicalPersistentDocumentCount(unspacedPersistent, Date.now(), '제주렌터카') === 222,
  JSON.stringify(unspacedPersistent));

setPersistent('제주 렌터카', {
  searchVolume: 3_300,
  documentCount: null,
  realCpc: 800,
  compIdx: 0.2,
});
const refreshedSpaced = getPersistent('제주 렌터카');
const refreshedUnspaced = getPersistent('제주렌터카');
assert('SearchAd/CPC alias refresh preserves both exact document tuples',
  refreshedSpaced?.searchVolume === 3_300
    && refreshedSpaced.realCpc === 800
    && refreshedSpaced.documentCount === 111
    && refreshedUnspaced?.searchVolume === 3_300
    && refreshedUnspaced.realCpc === 800
    && refreshedUnspaced.documentCount === 222,
  `${JSON.stringify(refreshedSpaced)} / ${JSON.stringify(refreshedUnspaced)}`);
const exportedQueries = getAllKeywordsWithCompleteData()
  .filter((entry) => entry.keyword.includes('제주'));
assert('persistent export groups canonical documents by exact broad query, not compact alias',
  exportedQueries.length === 2
    && exportedQueries.some((entry) => entry.keyword === '제주 렌터카' && entry.documentCount === 111)
    && exportedQueries.some((entry) => entry.keyword === '제주렌터카' && entry.documentCount === 222),
  JSON.stringify(exportedQueries));
flushNow();
fs.rmSync(isolatedAppData, { recursive: true, force: true });

const richFeedSource = fs.readFileSync(
  path.join(__dirname, '..', 'sources', 'rich-feed-builder.ts'),
  'utf8',
);
assert('rich feed reads only canonical persistent document counts',
  richFeedSource.includes('getCanonicalPersistentDocumentCount'));
assert('rich feed never persists an HTML scrape into the authoritative keyword cache',
  !/persistentSet\(r\.keyword,[\s\S]{0,300}documentCount:\s*scraped/.test(richFeedSource));

const proTrafficSource = fs.readFileSync(
  path.join(__dirname, '..', 'pro-traffic-keyword-hunter.ts'),
  'utf8',
);
assert('PRO cache promotion has no unconditional real-data assignment',
  !proTrafficSource.includes('isRealData: true'));
assert('PRO golden promotion requires canonical document-count provenance',
  /getCanonicalPersistentDocumentCount\(\s*apiResult,\s*Date\.now\(\),\s*result\.keyword/.test(proTrafficSource));

console.log('[persistent-document-count-provenance.test] passed');

export {};
