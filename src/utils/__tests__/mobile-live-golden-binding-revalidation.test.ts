import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { naverBlogDocumentCountQueryKey } from '../naver-blog-api';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-binding-revalidation-'));
const boardFile = path.join(tmpDir, 'mobile-live-golden-binding-revalidation-board.json');
const cacheFile = path.join(tmpDir, 'mobile-live-golden-binding-revalidation-cache.json');
/*
 * 시계는 절대 날짜로 동결하지 않는다 — 달력 부패 방지.
 *
 * searchad-volume-cache 는 주입 시계가 아니라 **실제 벽시계**로 30일 TTL 을
 * 판정한다(searchad-volume-cache.ts isValidDiskEntry). 예전 픽스처
 * ('2026-07-15' 고정)는 2026-08-14 에 TTL 지평선을 넘는 순간부터 코드 변경
 * 없이 실패했고, 이 게이트가 모든 커밋을 막았다. "30분 전"으로 앵커하면
 * TTL(30일)·미래시각 가드(+5분)·보드 나이 한도 모두의 안쪽이라 재부패가 없다.
 */
const fixedNow = new Date();
const measuredAtMs = fixedNow.getTime() - 30 * 60 * 1000;
const discoveredAtIso = new Date(fixedNow.getTime() - 5 * 60 * 60 * 1000).toISOString();
fs.mkdirSync(tmpDir, { recursive: true });
fs.rmSync(boardFile, { force: true });
fs.rmSync(cacheFile, { force: true });
fs.writeFileSync(cacheFile, JSON.stringify({
  schemaVersion: 'searchad-vol-v1',
  entries: {
    '원룸청소업체가격': {
      pc: 1000,
      mo: 5400,
      total: 6400,
      cpc: 220,
      comp: 'LOW',
      at: measuredAtMs,
    },
    '에어컨청소비용': {
      pc: null,
      mo: 3500,
      total: 3500,
      cpc: 180,
      comp: 'LOW',
      at: measuredAtMs,
    },
  },
}), 'utf8');
fs.writeFileSync(boardFile, JSON.stringify({
  version: 1,
  boardUpdatedAt: fixedNow.toISOString(),
  items: [{
    id: '원룸-청소-업체-가격',
    rank: 1,
    keyword: '원룸 청소 업체 가격',
    grade: 'SSS',
    score: 98,
    pcSearchVolume: 1360,
    mobileSearchVolume: 8280,
    totalSearchVolume: 9640,
    documentCount: 100,
    goldenRatio: 96.4,
    cpc: 0,
    category: 'home_life',
    source: 'mobile-live-golden-radar',
    intent: 'Commercial',
    evidence: ['validated-modifier', 'mobile-live-seed-backfill', 'naver-openapi-broad'],
    isMeasured: true,
    searchVolumeSource: 'searchad',
    searchVolumeConfidence: 'high',
    isSearchVolumeEstimated: false,
    documentCountSource: 'naver-api',
    documentCountConfidence: 'high',
    documentCountQueryMode: 'broad',
    documentCountQueryKey: naverBlogDocumentCountQueryKey('원룸 청소 업체 가격'),
    documentCountMeasuredAt: fixedNow.toISOString(),
    isDocumentCountEstimated: false,
    discoveredAt: discoveredAtIso,
    updatedAt: discoveredAtIso,
    freshness: 'live',
    isPublicPreview: false,
    publicSearchVolumeLabel: '5k-10k',
    publicDocumentCountLabel: '100-299',
    publicReason: 'fixture',
  }, {
    id: '에어컨-청소-비용',
    rank: 2,
    keyword: '에어컨 청소 비용',
    grade: 'SSS',
    score: 98,
    pcSearchVolume: 500,
    mobileSearchVolume: 3500,
    totalSearchVolume: 4000,
    documentCount: 200,
    goldenRatio: 20,
    cpc: 180,
    category: 'home_life',
    source: 'mobile-live-golden-radar',
    intent: 'Commercial',
    evidence: ['validated-modifier', 'mobile-live-seed-backfill', 'naver-openapi-broad'],
    isMeasured: true,
    searchVolumeSource: 'searchad',
    searchVolumeConfidence: 'high',
    isSearchVolumeEstimated: false,
    documentCountSource: 'naver-api',
    documentCountConfidence: 'high',
    documentCountQueryMode: 'broad',
    documentCountQueryKey: naverBlogDocumentCountQueryKey('에어컨 청소 비용'),
    documentCountMeasuredAt: fixedNow.toISOString(),
    isDocumentCountEstimated: false,
    discoveredAt: discoveredAtIso,
    updatedAt: discoveredAtIso,
    freshness: 'live',
    isPublicPreview: false,
    publicSearchVolumeLabel: '2k-5k',
    publicDocumentCountLabel: '100-299',
    publicReason: 'one-sided cache fixture',
  }],
}), 'utf8');

process.env['LEWORD_SEARCHAD_VOLUME_CACHE_FILE'] = cacheFile;

async function run(): Promise<void> {
  const { MobileLiveGoldenRadar } = require('../../mobile/live-golden-radar');
  const radar = new MobileLiveGoldenRadar({
    runOnStart: false,
    boardFile,
    boardTarget: 10,
    publicPreviewCount: 1,
    categories: ['home_life'],
    now: () => new Date(fixedNow),
    setTimeoutFn: () => 0,
    clearTimeoutFn: () => undefined,
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
      naverSearchAdAccessLicense: 'binding-revalidation-access-license',
      naverSearchAdSecretKey: 'binding-revalidation-secret-key',
      naverSearchAdCustomerId: '1000001',
    }),
    searchAdQuotaState: () => ({
      exhausted: true,
      calls: 100,
      remaining: 0,
      softCeiling: 100,
      dailyLimit: 100,
      resetAtMs: fixedNow.getTime() + 24 * 60 * 60 * 1000,
      accountCount: 1,
      availableAccountCount: 0,
      accounts: [],
    }),
  });

  const before = radar.snapshot();
  assert('unversioned persisted split is excluded before revalidation',
    (before.verifiedSupply || []).length === 0,
    JSON.stringify(before.verifiedSupply));

  const after = await radar.runOnce();
  const rebound = (after.verifiedSupply || []).find((item: any) => item.keyword === '원룸 청소 업체 가격');
  assert('fresh per-key cache rebinds before quota early return without an HTTP call',
    rebound?.pcSearchVolume === 1000
      && rebound?.mobileSearchVolume === 5400
      && rebound?.totalSearchVolume === 6400
      && rebound?.searchVolumeBindingVersion === 'keyword-keyed-v2'
      && rebound?.searchVolumeMeasuredAt === new Date(measuredAtMs).toISOString(),
    JSON.stringify(after.verifiedSupply));

  const partialCacheRow = [...(radar as any).board.values()]
    .find((item: any) => item.keyword === '에어컨 청소 비용');
  assert('one-sided null cache entry cannot be rebound with trusted v2 provenance',
    partialCacheRow?.searchVolumeBindingVersion === undefined
      && partialCacheRow?.searchVolumeMeasuredAt === undefined
      && !(after.verifiedSupply || []).some((item: any) => item.keyword === '에어컨 청소 비용'),
    JSON.stringify(partialCacheRow));

  const persisted = JSON.parse(fs.readFileSync(boardFile, 'utf8'));
  const persistedRow = persisted.items.find((item: any) => item.keyword === '원룸 청소 업체 가격');
  assert('cache rebind provenance persists for API and worker reloads',
    persistedRow?.searchVolumeBindingVersion === 'keyword-keyed-v2'
      && persistedRow?.searchVolumeMeasuredAt === new Date(measuredAtMs).toISOString()
      && persistedRow?.totalSearchVolume === 6400,
    JSON.stringify(persistedRow));
}

run()
  .then(() => console.log('[mobile-live-golden-binding-revalidation.test] passed'))
  .finally(() => {
    delete process.env['LEWORD_SEARCHAD_VOLUME_CACHE_FILE'];
    fs.rmSync(tmpDir, { recursive: true, force: true });
  })
  .then(
    () => process.exit(0),
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );

export {};
