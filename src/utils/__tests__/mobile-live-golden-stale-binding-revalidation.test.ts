import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { naverBlogDocumentCountQueryKey } from '../naver-blog-api';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const fixedNow = new Date('2026-07-15T01:00:00.000Z');
const staleMeasuredAt = '2026-07-07T00:00:00.000Z';
const freshMeasuredAt = '2026-07-15T00:55:00.000Z';
const keyword = '원룸 청소 업체 가격';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-stale-binding-'));
const boardFile = path.join(tmpDir, 'mobile-live-golden-stale-binding-board.json');
const cacheFile = path.join(tmpDir, 'mobile-live-golden-stale-binding-cache.json');

fs.mkdirSync(tmpDir, { recursive: true });
fs.rmSync(boardFile, { force: true });
fs.rmSync(cacheFile, { force: true });
fs.writeFileSync(cacheFile, JSON.stringify({
  schemaVersion: 'searchad-vol-v1',
  entries: {
    원룸청소업체가격: {
      pc: 1_000,
      mo: 8_000,
      total: 9_000,
      cpc: 220,
      comp: 'LOW',
      at: Date.parse(staleMeasuredAt),
    },
  },
}), 'utf8');
fs.writeFileSync(boardFile, JSON.stringify({
  version: 1,
  boardUpdatedAt: fixedNow.toISOString(),
  items: [{
    id: 'stale-binding-row',
    rank: 1,
    keyword,
    grade: 'SSS',
    score: 98,
    pcSearchVolume: 1_000,
    mobileSearchVolume: 8_000,
    totalSearchVolume: 9_000,
    documentCount: 200,
    goldenRatio: 45,
    cpc: 220,
    category: 'home_life',
    source: 'mobile-live-golden-radar',
    intent: 'Commercial',
    evidence: ['validated-modifier', 'curated-policy:home_life', 'naver-openapi-broad'],
    isMeasured: true,
    searchVolumeSource: 'searchad',
    searchVolumeConfidence: 'high',
    searchVolumeBindingVersion: 'keyword-keyed-v2',
    searchVolumeMeasuredAt: staleMeasuredAt,
    isSearchVolumeEstimated: false,
    documentCountSource: 'naver-api',
    documentCountConfidence: 'high',
    documentCountQueryMode: 'broad',
    documentCountQueryKey: naverBlogDocumentCountQueryKey(keyword),
    documentCountMeasuredAt: freshMeasuredAt,
    isDocumentCountEstimated: false,
    discoveredAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
    freshness: 'live',
    isPublicPreview: false,
    publicSearchVolumeLabel: '5k-10k',
    publicDocumentCountLabel: '100-299',
    publicReason: 'stale binding fixture',
  }],
}), 'utf8');

process.env['LEWORD_SEARCHAD_VOLUME_CACHE_FILE'] = cacheFile;

function cleanup(): void {
  delete process.env['LEWORD_SEARCHAD_VOLUME_CACHE_FILE'];
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

async function run(): Promise<void> {
  const { MobileLiveGoldenRadar } = require('../../mobile/live-golden-radar');
  const attempted: string[] = [];
  const radar = new MobileLiveGoldenRadar({
    runOnStart: false,
    boardFile,
    boardTarget: 10,
    publicPreviewCount: 1,
    categories: ['home_life'],
    now: () => new Date(fixedNow),
    setTimeoutFn: () => 0,
    clearTimeoutFn: () => undefined,
    measureLiveSearchVolumeSeparate: async (_config: unknown, keywords: string[], options: any) => {
      assert(
        'stale binding repair bypasses the longer-lived SearchAd cache without deleting it',
        options?.forceFresh === true && options?.includeDocumentCount === false,
        JSON.stringify(options),
      );
      attempted.push(...keywords);
      return keywords.map((measuredKeyword) => ({
        keyword: measuredKeyword,
        pcSearchVolume: 1_000,
        mobileSearchVolume: 5_400,
        totalSearchVolume: 6_400,
        documentCount: null,
        monthlyAveCpc: 260,
        searchVolumeBindingVersion: 'keyword-keyed-v2',
        searchVolumeMeasuredAt: freshMeasuredAt,
      }));
    },
  });

  assert(
    'a current marker older than seven days is excluded from verified supply',
    (radar.snapshot().verifiedSupply || []).length === 0,
    JSON.stringify(radar.snapshot().verifiedSupply),
  );
  const cacheRebound = (radar as any).rebindCachedSearchAdRows();
  assert(
    'a stale 30-day cache entry cannot satisfy the seven-day verified freshness gate',
    cacheRebound === 0,
    String(cacheRebound),
  );

  (radar as any).searchAdMeasurementBudgetRemaining = 40;
  await (radar as any).promotePendingMeasuredCacheWithSearchAdMetrics(
    { clientId: 'client', clientSecret: 'secret' },
    10,
  );
  const repaired = [...(radar as any).board.values()]
    .find((item: any) => item.keyword === keyword);
  assert(
    'stale current-marker rows return to bounded exact SearchAd measurement',
    attempted.includes(keyword)
      && repaired?.pcSearchVolume === 1_000
      && repaired?.mobileSearchVolume === 5_400
      && repaired?.totalSearchVolume === 6_400
      && repaired?.searchVolumeBindingVersion === 'keyword-keyed-v2'
      && repaired?.searchVolumeMeasuredAt === freshMeasuredAt,
    JSON.stringify({ attempted, repaired }),
  );
}

run()
  .then(() => console.log('[mobile-live-golden-stale-binding-revalidation.test] passed'))
  .finally(cleanup)
  .then(
    () => process.exit(0),
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );

export {};
