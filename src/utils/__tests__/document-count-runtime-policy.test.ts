import fs from 'fs';
import path from 'path';
import type { MobileKeywordMetric } from '../../mobile/contracts';
import { hasFreshCanonicalDocumentCountMeasurement } from '../../mobile/keyword-ai-judge';
import {
  NAVER_BLOG_DOCUMENT_COUNT_CACHE_TTL_MS,
  normalizeNaverBlogBroadQuery,
} from '../naver-blog-api';

function assert(name: string, condition: boolean, detail = ''): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

assert(
  'broad document-count query strips straight, smart, guillemet, and full-width quote operators',
  normalizeNaverBlogBroadQuery('  “전세 대출”  «금리» ＂비교＂  ') === '전세 대출 금리 비교',
  normalizeNaverBlogBroadQuery('  “전세 대출”  «금리» ＂비교＂  '),
);
assert(
  'broad document-count query preserves ordinary spacing and text',
  normalizeNaverBlogBroadQuery('전세   대출 금리') === '전세 대출 금리',
);

const measuredAtMs = Date.parse('2026-07-18T00:00:00.000Z');
const canonicalMetric = {
  keyword: '전세 대출 금리 비교',
  totalSearchVolume: 1_200,
  documentCount: 320,
  documentCountSource: 'naver-api',
  documentCountConfidence: 'high',
  documentCountQueryMode: 'broad',
  documentCountMeasuredAt: new Date(measuredAtMs).toISOString(),
  isDocumentCountEstimated: false,
} as MobileKeywordMetric;
assert(
  'canonical document count remains reusable inside the shared 15-minute window',
  hasFreshCanonicalDocumentCountMeasurement(
    canonicalMetric,
    new Date(measuredAtMs + NAVER_BLOG_DOCUMENT_COUNT_CACHE_TTL_MS),
  ),
);
assert(
  '24-hour result cache cannot make a document count fresh after the 15-minute boundary',
  !hasFreshCanonicalDocumentCountMeasurement(
    canonicalMetric,
    new Date(measuredAtMs + NAVER_BLOG_DOCUMENT_COUNT_CACHE_TTL_MS + 1),
  ),
);
assert(
  'exact-phrase document total cannot pass the canonical broad freshness gate',
  !hasFreshCanonicalDocumentCountMeasurement({
    ...canonicalMetric,
    documentCountQueryMode: 'exact-phrase',
  }, new Date(measuredAtMs + 60_000)),
);

const pcExecutorSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'mobile', 'pc-engine-executor.ts'),
  'utf8',
);
const apiServerSource = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'apps', 'api', 'src', 'server.ts'),
  'utf8',
);
const desktopKeywordAnalysisSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'main', 'handlers', 'keyword-analysis.ts'),
  'utf8',
);
const proTrafficSource = fs.readFileSync(
  path.join(__dirname, '..', 'pro-traffic-keyword-hunter.ts'),
  'utf8',
);
const proWebSource = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'apps', 'api', 'src', 'pro-web-site.ts'),
  'utf8',
);
const richFeedSource = fs.readFileSync(
  path.join(__dirname, '..', 'sources', 'rich-feed-builder.ts'),
  'utf8',
);

assert(
  'PC analyzer normalizes the broad query and requires fresh canonical counts for completion',
  pcExecutorSource.includes('normalizeNaverBlogBroadQuery(keyword)')
    && pcExecutorSource.includes('return !hasFreshCanonicalDocumentCountMeasurement(metric)')
    && pcExecutorSource.includes('&& hasFreshCanonicalDocumentCountMeasurement(trustedCandidate)'),
);
assert(
  'desktop direct analysis force-refreshes only the original seed document count',
  desktopKeywordAnalysisSource.includes("kw.type === 'original'")
    && desktopKeywordAnalysisSource.includes('skipCache: forceFresh'),
);
assert(
  'API keyword-analysis cache boundary rejects stale document counts',
  /endpoint\.product === 'keyword-analysis'[\s\S]{0,600}hasFreshCanonicalDocumentCountMeasurement\(metric\)/.test(apiServerSource),
);
assert(
  'PRO hunter uses the shared Blog OpenAPI client instead of a private direct endpoint',
  proTrafficSource.includes('getNaverBlogDocumentCount(broadKeyword')
    && !proTrafficSource.includes("axios.get('https://openapi.naver.com/v1/search/blog.json'"),
);
assert(
  'browser-local analyzer strips exact-phrase quotes before broad Blog OpenAPI lookup',
  proWebSource.includes('encodeURIComponent(broadKeyword)')
    && proWebSource.includes('.replace(/["“”„‟«»＂]/g'),
);
assert(
  'rich feed rechecks document freshness at build completion rather than request start',
  /const built = await buildRichFeed[\s\S]{0,160}const completedAt = Date\.now\(\)[\s\S]{0,160}retainFreshCanonicalRichRows\(built, completedAt\)/.test(richFeedSource)
    && richFeedSource.includes('expiresAt: completedAt + CACHE_TTL'),
);

console.log('[document-count-runtime-policy.test] passed');

export {};
