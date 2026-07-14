import * as fs from 'fs';
import * as path from 'path';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const tmpDir = path.join(process.cwd(), 'tmp');
const cacheFile = path.join(tmpDir, 'searchad-result-order-cache.json');
const quotaFile = path.join(tmpDir, 'searchad-result-order-quota.json');
fs.mkdirSync(tmpDir, { recursive: true });
fs.rmSync(cacheFile, { force: true });
fs.rmSync(quotaFile, { force: true });
fs.writeFileSync(cacheFile, JSON.stringify({
  schemaVersion: 'searchad-vol-v1',
  entries: {
    cachedalpha: { pc: 11, mo: 22, total: 33, at: Date.now() },
    cachedgamma: { pc: 44, mo: 55, total: 99, at: Date.now() },
  },
}), 'utf8');

process.env['LEWORD_SEARCHAD_VOLUME_CACHE_FILE'] = cacheFile;
process.env['LEWORD_SEARCHAD_QUOTA_STATE_FILE'] = quotaFile;
process.env['LEWORD_SEARCHAD_SOFT_CEILING'] = '100';

const originalFetch = global.fetch;
(global as any).fetch = async (url: string) => {
  const parsed = new URL(url);
  const hints = String(parsed.searchParams.get('hintKeywords') || '').split(',').filter(Boolean);
  return {
    ok: true,
    status: 200,
    json: async () => ({
      keywordList: hints.map((keyword) => ({
        relKeyword: keyword,
        monthlyPcQcCnt: 101,
        monthlyMobileQcCnt: 202,
        monthlyAveCpc: 303,
        compIdx: 'LOW',
      })),
    }),
  } as any;
};

async function run(): Promise<void> {
  const { getNaverSearchAdKeywordVolume } = require('../naver-searchad-api');
  const mixedRows = await getNaverSearchAdKeywordVolume({
    customerId: '1000001',
    accessLicense: 'result-order-access-license',
    secretKey: 'result-order-secret-key',
  }, ['cachedalpha', 'missbeta', 'cachedgamma']);

  assert(
    'mixed SearchAd cache hits and API misses preserve requested keyword order',
    mixedRows.map((row: any) => row.keyword).join(',') === 'cachedalpha,missbeta,cachedgamma'
      && mixedRows.map((row: any) => row.totalSearchVolume).join(',') === '33,303,99'
      && mixedRows.every((row: any) => row.searchVolumeBindingVersion === 'keyword-keyed-v2')
      && mixedRows.every((row: any) => Number.isFinite(row.measuredAtMs)),
    JSON.stringify(mixedRows),
  );

  const {
    alignSearchAdRowsByKeyword,
    searchAdKeywordBindingMetadata,
  } = require('../searchad-result-alignment');
  const aligned = alignSearchAdRowsByKeyword(['first keyword', 'second keyword'], [
    { keyword: 'secondkeyword', pcSearchVolume: 20, mobileSearchVolume: 200 },
    { keyword: 'firstkeyword', pcSearchVolume: 10, mobileSearchVolume: 100 },
  ]);
  assert(
    'SearchAd wrapper aligns rows by normalized keyword instead of array position',
    aligned[0]?.pcSearchVolume === 10
      && aligned[1]?.pcSearchVolume === 20,
    JSON.stringify(aligned),
  );

  const explicitBinding = searchAdKeywordBindingMetadata({
    searchVolumeBindingVersion: 'keyword-keyed-v2',
    measuredAtMs: Date.parse('2026-07-15T01:02:03.000Z'),
  });
  assert(
    'binding metadata converts only an explicit current marker and actual measurement time',
    explicitBinding?.searchVolumeBindingVersion === 'keyword-keyed-v2'
      && explicitBinding?.searchVolumeMeasuredAt === '2026-07-15T01:02:03.000Z'
      && searchAdKeywordBindingMetadata({ measuredAtMs: Date.now() }) === null
      && searchAdKeywordBindingMetadata({
        searchVolumeBindingVersion: 'keyword-keyed-v2',
        searchVolumeMeasuredAt: 'not-a-date',
      }) === null,
    JSON.stringify(explicitBinding),
  );
}

run()
  .then(() => console.log('[searchad-result-order.test] passed'))
  .finally(() => {
    (global as any).fetch = originalFetch;
    delete process.env['LEWORD_SEARCHAD_VOLUME_CACHE_FILE'];
    delete process.env['LEWORD_SEARCHAD_QUOTA_STATE_FILE'];
    delete process.env['LEWORD_SEARCHAD_SOFT_CEILING'];
    fs.rmSync(cacheFile, { force: true });
    fs.rmSync(quotaFile, { force: true });
  });

export {};
