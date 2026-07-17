import { evaluatePublishDecision } from '../../mobile/publish-decision';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const canonicalMetric: any = {
  keyword: '에어컨 청소 비용 비교',
  category: 'living',
  pcSearchVolume: 400,
  mobileSearchVolume: 3600,
  totalSearchVolume: 4000,
  documentCount: 200,
  goldenRatio: 0.01,
  isMeasured: true,
  searchVolumeSource: 'searchad',
  searchVolumeConfidence: 'high',
  searchVolumeBindingVersion: 'keyword-keyed-v2',
  searchVolumeMeasuredAt: '2026-07-17T00:00:00.000Z',
  isSearchVolumeEstimated: false,
  documentCountSource: 'naver-api',
  documentCountConfidence: 'high',
  documentCountQueryMode: 'broad',
  isDocumentCountEstimated: false,
};

const canonical = evaluatePublishDecision(canonicalMetric);
assert('canonical broad OpenAPI metric can reach publish recommendation',
  canonical.verdict === 'publish', JSON.stringify(canonical));

const exactPhrase = evaluatePublishDecision({
  ...canonicalMetric,
  documentCount: 20,
  goldenRatio: 200,
  documentCountQueryMode: 'exact-phrase',
});
assert('exact-phrase competition cannot create a publish recommendation',
  exactPhrase.verdict !== 'publish', JSON.stringify(exactPhrase));

const scraped = evaluatePublishDecision({
  ...canonicalMetric,
  documentCount: 20,
  goldenRatio: 200,
  documentCountSource: 'scrape',
});
assert('scraped document counts cannot create a publish recommendation',
  scraped.verdict !== 'publish', JSON.stringify(scraped));

const mismatchedSplit = evaluatePublishDecision({
  ...canonicalMetric,
  pcSearchVolume: 1,
  mobileSearchVolume: 1,
});
assert('a SearchAd total that does not equal its PC/mobile split cannot publish',
  mismatchedSplit.verdict !== 'publish', JSON.stringify(mismatchedSplit));

const staleRatio = evaluatePublishDecision({
  ...canonicalMetric,
  goldenRatio: 0.01,
});
assert('publish scoring recomputes the ratio from canonical volume and document count',
  staleRatio.score === canonical.score && staleRatio.verdict === canonical.verdict,
  JSON.stringify({ canonical, staleRatio }));

console.log('[publish-decision-document-count-policy.test] passed');

export {};
