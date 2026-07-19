import fs from 'fs';
import path from 'path';
import {
  documentCountBroadQueryKey,
  selectForceFreshDocumentCountQueryKey,
} from '../../mobile/pc-engine-executor';
import { serverDocumentCountBroadQueryKey } from '../../../apps/api/src/server';
import { normalizePersistentDocumentCountQueryKey } from '../persistent-keyword-cache';
import { proDocumentCountBroadQueryKey } from '../pro-traffic-keyword-hunter';

function assert(name: string, condition: boolean, detail = ''): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const spaced = '제주 렌터카';
const unspaced = '제주렌터카';
for (const [name, key] of [
  ['PC', documentCountBroadQueryKey],
  ['persistent', normalizePersistentDocumentCountQueryKey],
  ['PRO', proDocumentCountBroadQueryKey],
  ['API overlay', serverDocumentCountBroadQueryKey],
] as const) {
  assert(`${name} Blog key preserves the broad-query spacing boundary`,
    key(spaced) !== key(unspaced),
    `${key(spaced)} / ${key(unspaced)}`);
}

const pcDocumentMeasurements = new Map<string, { total: number; measuredAt: string }>();
pcDocumentMeasurements.set(documentCountBroadQueryKey(spaced), {
  total: 111,
  measuredAt: '2026-07-18T01:00:00.000Z',
});
pcDocumentMeasurements.set(documentCountBroadQueryKey(unspaced), {
  total: 222,
  measuredAt: '2026-07-18T01:00:01.000Z',
});
assert('PC runtime document map cannot overwrite a spaced query with its compact alias',
  pcDocumentMeasurements.size === 2
    && pcDocumentMeasurements.get(documentCountBroadQueryKey(spaced))?.total === 111
    && pcDocumentMeasurements.get(documentCountBroadQueryKey(spaced))?.measuredAt === '2026-07-18T01:00:00.000Z'
    && pcDocumentMeasurements.get(documentCountBroadQueryKey(unspaced))?.total === 222
    && pcDocumentMeasurements.get(documentCountBroadQueryKey(unspaced))?.measuredAt === '2026-07-18T01:00:01.000Z');

assert('PC force-fresh policy selects one direct seed, not expansion candidates',
  selectForceFreshDocumentCountQueryKey([
    { keyword: spaced, intent: 'requested-keyword', source: 'pc-keyword-analysis-exact' },
    { keyword: '제주 렌터카 후기', intent: 'review', source: 'pc-naver-autocomplete' },
  ] as any) === documentCountBroadQueryKey(spaced));

const pcSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'mobile', 'pc-engine-executor.ts'),
  'utf8',
);
assert('PC document map indexes and retrieves by exact broad-query key',
  /const queryKey = documentCountBroadQueryKey\(keyword\)[\s\S]{0,400}out\.set\(queryKey, documentCount\)/.test(pcSource)
    && /documentCountMap\.has\(documentKey\)\s*\? documentCountMap\.get\(documentKey\)\s*: undefined/.test(pcSource));
assert('PC force-fresh flag is limited by the selected direct seed key',
  pcSource.includes('Boolean(forceFreshQueryKey && queryKey === forceFreshQueryKey)')
    && pcSource.includes("job.product === 'keyword-analysis'"));

const serverSource = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'apps', 'api', 'src', 'server.ts'),
  'utf8',
);
assert('board overlay syncs canonical documents only for the same broad query',
  serverSource.includes('serverDocumentCountBroadQueryKey(current.keyword)')
    && serverSource.includes('serverDocumentCountBroadQueryKey(board.keyword)')
    && serverSource.includes('serverDocumentCountBroadQueryKey(seed)')
    && serverSource.includes('serverDocumentCountBroadQueryKey(metric.keyword)')
    && serverSource.includes('bindKeywordAnalysisMetricToRequestedSeed(requestedMetric, seed)')
    && /bindKeywordAnalysisMetricToRequestedSeed[\s\S]{0,900}documentCount:\s*null[\s\S]{0,300}documentCountSource:\s*'none'/.test(serverSource));

const proSource = fs.readFileSync(
  path.join(__dirname, '..', 'pro-traffic-keyword-hunter.ts'),
  'utf8',
);
const keywordBoundPublishGates = proSource.match(
  /getCanonicalPersistentDocumentCount\(r, Date\.now\(\), r\.keyword\)/g,
) || [];
assert('PRO terminal premium and verified gates bind canonical documents to the row keyword',
  keywordBoundPublishGates.length >= 2,
  String(keywordBoundPublishGates.length));
assert('PRO persistent seed promotion binds exported documents to entry.keyword',
  /getCanonicalPersistentDocumentCount\(\s*entry,\s*Date\.now\(\),\s*entry\.keyword/.test(proSource));

const premiumHandlerSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'main', 'handlers', 'premium-hunting.ts'),
  'utf8',
);
const premiumSharedDocumentCalls = premiumHandlerSource.match(
  /getNaverBlogDocumentCount\(normalizeNaverBlogBroadQuery\((?:keyword|kw)\),/g,
) || [];
assert('premium hunting document totals use the shared normalized broad client in both user-facing paths',
  premiumSharedDocumentCalls.length >= 2
    && premiumHandlerSource.includes("from '../../utils/naver-blog-api'")
    && !premiumHandlerSource.includes('forceFresh: true')
    && !premiumHandlerSource.includes('query: `"${kw}"`')
    && !premiumHandlerSource.includes('const rawTotal = (docData as any)?.total'),
  String(premiumSharedDocumentCalls.length));

const discoveryHandlerSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'main', 'handlers', 'keyword-discovery.ts'),
  'utf8',
);
const discoverySharedDocumentCalls = discoveryHandlerSource.match(
  /getNaverBlogDocumentCount\(normalizeNaverBlogBroadQuery\(keyword\),/g,
) || [];
assert('keyword discovery realtime fallbacks use the same broad document-count SSoT',
  discoverySharedDocumentCalls.length >= 2
    && discoveryHandlerSource.includes("from '../../utils/naver-blog-api'")
    && !discoveryHandlerSource.includes('forceFresh: true')
    && !discoveryHandlerSource.includes('openapi.naver.com/v1/search/blog.json'),
  String(discoverySharedDocumentCalls.length));

console.log('[document-count-query-key-policy.test] passed');
process.exit(0);
