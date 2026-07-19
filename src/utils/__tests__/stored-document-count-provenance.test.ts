import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  KeywordStorage,
  hasFreshCanonicalStoredDocumentCount,
  storedDocumentCountBroadQueryKey,
  type StoredDocumentCountMeasurement,
} from '../mass-collection/keyword-storage';
import { KeywordMetricsUpdater } from '../mass-collection/keyword-metrics-updater';

function assert(name: string, condition: boolean): void {
  if (!condition) throw new Error(name);
}

async function run(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-stored-document-proof-'));
  const storageFile = path.join(root, 'keywords-storage.json');
  const keyword = '제주 렌터카';
  const legacyTimestamp = '2026-01-01T00:00:00.000Z';
  fs.writeFileSync(storageFile, JSON.stringify({
    version: 1,
    lastUpdated: legacyTimestamp,
    keywords: [{
      id: 'legacy__manual',
      keyword,
      source: 'manual',
      category: 'travel',
      searchVolume: 800,
      documentCount: 120,
      goldenRatio: 6.67,
      grade: 'SSS',
      collectedAt: new Date().toISOString(),
      metricsUpdatedAt: legacyTimestamp,
      isValid: true,
      validUntil: '2099-01-01T00:00:00.000Z',
    }],
  }), 'utf8');

  const storage = new KeywordStorage(storageFile);
  const updater = new KeywordMetricsUpdater(storage, { delayBetweenBatches: 0 });
  const legacy = (await storage.getByKeyword(keyword))[0];
  assert('legacy stored count without provenance is fail-closed',
    !!legacy && !hasFreshCanonicalStoredDocumentCount(legacy));

  // A successful SearchAd refresh alongside a failed document lookup may
  // advance the shared metrics timestamp, but it must not refresh or certify
  // the old document count.
  (updater as any).fetchSearchVolumes = async () => new Map([[keyword, 900]]);
  (updater as any).fetchDocumentCounts = async () => new Map();
  const searchOnly = await updater.updateKeyword(keyword);
  assert('document lookup failure preserves the prior number', searchOnly?.documentCount === 120);
  assert('document lookup failure preserves missing document provenance',
    searchOnly?.documentCountMeasuredAt === undefined
      && searchOnly?.documentCountSource === undefined);
  assert('shared metricsUpdatedAt cannot launder a legacy document count',
    searchOnly?.metricsUpdatedAt !== legacyTimestamp
      && !hasFreshCanonicalStoredDocumentCount(searchOnly!));

  const measuredAt = new Date().toISOString();
  const canonical: StoredDocumentCountMeasurement = {
    documentCount: 0,
    documentCountSource: 'naver-api',
    documentCountConfidence: 'high',
    documentCountQueryMode: 'broad',
    documentCountQueryKey: storedDocumentCountBroadQueryKey(keyword),
    documentCountMeasuredAt: measuredAt,
    isDocumentCountEstimated: false,
  };
  (updater as any).fetchSearchVolumes = async () => new Map();
  (updater as any).fetchDocumentCounts = async () => new Map([[keyword, canonical]]);
  const refreshed = await updater.updateKeyword(keyword);
  assert('genuine canonical zero is stored rather than treated as failure',
    refreshed?.documentCount === 0 && hasFreshCanonicalStoredDocumentCount(refreshed));

  const mismatched = {
    ...refreshed!,
    documentCountQueryKey: storedDocumentCountBroadQueryKey('제주렌터카'),
  };
  assert('compact SearchAd alias cannot certify a differently spaced Blog query',
    !hasFreshCanonicalStoredDocumentCount(mismatched));

  storage.saveNow();
  fs.rmSync(root, { recursive: true, force: true });
  console.log('[stored-document-count-provenance.test] passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
