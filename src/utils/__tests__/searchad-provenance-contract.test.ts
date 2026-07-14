import * as fs from 'fs';
import * as path from 'path';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const tmpDir = path.join(process.cwd(), 'tmp');
const cacheFile = path.join(tmpDir, 'searchad-provenance-contract-cache.json');
const quotaFile = path.join(tmpDir, 'searchad-provenance-contract-quota.json');
fs.mkdirSync(tmpDir, { recursive: true });
fs.rmSync(cacheFile, { force: true });
fs.rmSync(quotaFile, { force: true });
fs.writeFileSync(cacheFile, JSON.stringify({
  schemaVersion: 'searchad-vol-v1',
  entries: {
    cachedalpha: { pc: 12, mo: 34, total: 46, at: Date.now() - 1_000 },
  },
}), 'utf8');

process.env['LEWORD_SEARCHAD_VOLUME_CACHE_FILE'] = cacheFile;
process.env['LEWORD_SEARCHAD_QUOTA_STATE_FILE'] = quotaFile;
process.env['LEWORD_SEARCHAD_SOFT_CEILING'] = '100';

const originalFetch = global.fetch;
(global as any).fetch = async (url: string) => {
  const parsed = new URL(url);
  const hints = String(parsed.searchParams.get('hintKeywords') || '')
    .split(',')
    .filter(Boolean);
  if (hints.length === 1 && hints[0] === 'seedterm') {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        keywordList: [
          { relKeyword: 'relatedtwo', monthlyPcQcCnt: 9, monthlyMobileQcCnt: 90 },
          { relKeyword: 'seedterm', monthlyPcQcCnt: 1, monthlyMobileQcCnt: 1 },
          { relKeyword: 'relatedone', monthlyPcQcCnt: 7, monthlyMobileQcCnt: 70 },
        ],
      }),
    } as any;
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({
      // Deliberately omit missingbeta. A missing exact row must stay null and
      // must never inherit measuredgamma's provenance marker.
      keywordList: [
        {
          relKeyword: 'measuredgamma',
          monthlyPcQcCnt: 101,
          monthlyMobileQcCnt: 202,
          monthlyAveCpc: 303,
          compIdx: 'LOW',
        },
      ],
    }),
  } as any;
};

function cleanup(): void {
  (global as any).fetch = originalFetch;
  delete process.env['LEWORD_SEARCHAD_VOLUME_CACHE_FILE'];
  delete process.env['LEWORD_SEARCHAD_QUOTA_STATE_FILE'];
  delete process.env['LEWORD_SEARCHAD_SOFT_CEILING'];
  fs.rmSync(cacheFile, { force: true });
  fs.rmSync(quotaFile, { force: true });
}

async function run(): Promise<void> {
  const {
    getNaverSearchAdKeywordSuggestions,
    getNaverSearchAdKeywordVolume,
  } = require('../naver-searchad-api');
  const {
    getSearchAdVolumeCached,
    setSearchAdVolumeCached,
  } = require('../searchad-volume-cache');
  const config = {
    customerId: '1000001',
    accessLicense: 'provenance-contract-access-license',
    secretKey: 'provenance-contract-secret-key',
  };

  const rows = await getNaverSearchAdKeywordVolume(
    config,
    ['cachedalpha', 'missingbeta', 'measuredgamma'],
  );
  setSearchAdVolumeCached('partial-cache-entry', {
    pc: null,
    mo: 700,
    total: 700,
  });
  assert(
    'one-sided null SearchAd split is never persisted as an exact cache entry',
    getSearchAdVolumeCached('partial-cache-entry') === null,
    JSON.stringify(getSearchAdVolumeCached('partial-cache-entry')),
  );
  const missing = rows[1];
  assert(
    'mixed cache/API results retain one row per requested keyword',
    rows.map((row: any) => row.keyword).join(',') === 'cachedalpha,missingbeta,measuredgamma'
      && rows[0]?.totalSearchVolume === 46
      && rows[2]?.totalSearchVolume === 303,
    JSON.stringify(rows),
  );
  assert(
    'missing exact SearchAd rows never receive keyword-binding provenance',
    missing?.pcSearchVolume === null
      && missing?.mobileSearchVolume === null
      && missing?.totalSearchVolume === null
      && missing?.searchVolumeBindingVersion === undefined
      && missing?.measuredAtMs === undefined,
    JSON.stringify(missing),
  );
  assert(
    'only exact cached/API split rows carry current binding provenance',
    rows[0]?.searchVolumeBindingVersion === 'keyword-keyed-v2'
      && rows[2]?.searchVolumeBindingVersion === 'keyword-keyed-v2'
      && Number.isFinite(rows[0]?.measuredAtMs)
      && Number.isFinite(rows[2]?.measuredAtMs),
    JSON.stringify(rows),
  );

  const suggestions = await getNaverSearchAdKeywordSuggestions(config, 'seedterm', 10);
  assert(
    'suggestions carry per-relKeyword measurement provenance and preserve their own values',
    suggestions.length === 2
      && suggestions.every((row: any) => (
        row.searchVolumeBindingVersion === 'keyword-keyed-v2'
        && Number.isFinite(row.measuredAtMs)
        && row.totalSearchVolume === row.pcSearchVolume + row.mobileSearchVolume
      ))
      && suggestions.find((row: any) => row.keyword === 'relatedtwo')?.totalSearchVolume === 99
      && suggestions.find((row: any) => row.keyword === 'relatedone')?.totalSearchVolume === 77,
    JSON.stringify(suggestions),
  );
}

run()
  .then(() => console.log('[searchad-provenance-contract.test] passed'))
  .finally(cleanup)
  .then(
    () => process.exit(0),
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );

export {};
