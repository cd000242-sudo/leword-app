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
    relatedtwo: { pc: 900, mo: 900, total: 1800, at: Date.now() - 1_000 },
  },
}), 'utf8');

process.env['LEWORD_SEARCHAD_VOLUME_CACHE_FILE'] = cacheFile;
process.env['LEWORD_SEARCHAD_QUOTA_STATE_FILE'] = quotaFile;
process.env['LEWORD_SEARCHAD_SOFT_CEILING'] = '100';

const originalFetch = global.fetch;
let fetchCalls = 0;
(global as any).fetch = async (url: string) => {
  fetchCalls += 1;
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
          { relKeyword: 'malformedvolume', monthlyPcQcCnt: 'n/a', monthlyMobileQcCnt: 20 },
          { relKeyword: 'negativevolume', monthlyPcQcCnt: '-1', monthlyMobileQcCnt: 11 },
          { relKeyword: 'invalidless', monthlyPcQcCnt: '<bad', monthlyMobileQcCnt: 20 },
          { relKeyword: 'carelessvolume', monthlyPcQcCnt: 'careless', monthlyMobileQcCnt: 20 },
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
    flushSearchAdVolumeCache,
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
  setSearchAdVolumeCached('negative-cache-entry', {
    pc: -1,
    mo: 11,
    total: 10,
  });
  assert(
    'negative SearchAd split is never persisted as an exact cache entry',
    getSearchAdVolumeCached('negative-cache-entry') === null,
    JSON.stringify(getSearchAdVolumeCached('negative-cache-entry')),
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
  const callsAfterSuggestions = fetchCalls;
  const suggestionCacheRows = [
    getSearchAdVolumeCached('relatedtwo'),
    getSearchAdVolumeCached('relatedone'),
  ];
  assert(
    'fresh suggestion measurements replace stale exact-volume cache by their own keyword',
    suggestionCacheRows[0]?.pc === 9
      && suggestionCacheRows[0]?.mo === 90
      && suggestionCacheRows[0]?.total === 99
      && suggestionCacheRows[1]?.pc === 7
      && suggestionCacheRows[1]?.mo === 70
      && suggestionCacheRows[1]?.total === 77
      && getSearchAdVolumeCached('seedterm') === null,
    JSON.stringify(suggestionCacheRows),
  );
  const cachedSuggestionVolumes = await getNaverSearchAdKeywordVolume(
    config,
    ['relatedtwo', 'relatedone'],
  );
  assert(
    'keyword analysis reuses fresh suggestion volumes without another SearchAd request',
    fetchCalls === callsAfterSuggestions
      && cachedSuggestionVolumes[0]?.totalSearchVolume === 99
      && cachedSuggestionVolumes[1]?.totalSearchVolume === 77,
    JSON.stringify({ fetchCalls, callsAfterSuggestions, cachedSuggestionVolumes }),
  );

  const externalPayload = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  externalPayload.entries.crossprocessfresh = {
    pc: 44,
    mo: 55,
    total: 99,
    at: Date.now(),
  };
  externalPayload.entries.crossprocessinvalid = {
    pc: -1,
    mo: 11,
    total: 10,
    at: Date.now(),
  };
  externalPayload.entries.crossprocessfuture = {
    pc: 5,
    mo: 15,
    total: 20,
    at: Date.now() + 24 * 60 * 60 * 1000,
  };
  fs.writeFileSync(cacheFile, JSON.stringify(externalPayload), 'utf8');
  const crossProcessFresh = getSearchAdVolumeCached('cross process fresh');
  assert(
    'an already-running API process reloads a fresher shared cache file from the worker',
    crossProcessFresh?.pc === 44
      && crossProcessFresh?.mo === 55
      && crossProcessFresh?.total === 99
      && getSearchAdVolumeCached('cross process invalid') === null
      && getSearchAdVolumeCached('cross process future') === null,
    JSON.stringify(crossProcessFresh),
  );

  setSearchAdVolumeCached('local pending write', {
    pc: 12,
    mo: 23,
    total: 35,
  });
  const beforeMergedFlush = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  beforeMergedFlush.entries.externalbeforeflush = {
    pc: 21,
    mo: 34,
    total: 55,
    at: Date.now(),
  };
  fs.writeFileSync(cacheFile, JSON.stringify(beforeMergedFlush), 'utf8');
  flushSearchAdVolumeCache();
  const afterMergedFlush = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  assert(
    'shared cache flush merges worker and API entries instead of overwriting either process',
    afterMergedFlush.entries.localpendingwrite?.total === 35
      && afterMergedFlush.entries.externalbeforeflush?.total === 55,
    JSON.stringify(afterMergedFlush.entries),
  );

  const staleLockFile = `${cacheFile}.lock`;
  fs.writeFileSync(staleLockFile, 'crashed-writer', 'utf8');
  const staleLockTime = new Date(Date.now() - 10 * 60_000);
  fs.utimesSync(staleLockFile, staleLockTime, staleLockTime);
  setSearchAdVolumeCached('after stale lock', {
    pc: 8,
    mo: 13,
    total: 21,
  });
  flushSearchAdVolumeCache();
  const afterStaleLockRecovery = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  assert(
    'a crashed writer stale lock cannot permanently block shared cache persistence',
    !fs.existsSync(staleLockFile)
      && afterStaleLockRecovery.entries.afterstalelock?.total === 21,
    JSON.stringify(afterStaleLockRecovery.entries),
  );

  const orphanClaimFile = `${cacheFile}.lock.claim-crashed-recovery`;
  fs.writeFileSync(orphanClaimFile, 'orphaned-owner', 'utf8');
  fs.utimesSync(orphanClaimFile, staleLockTime, staleLockTime);
  setSearchAdVolumeCached('after orphan claim', {
    pc: 6,
    mo: 15,
    total: 21,
  });
  flushSearchAdVolumeCache();
  flushSearchAdVolumeCache();
  const afterOrphanClaimRecovery = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  assert(
    'an orphaned atomic stale-lock claim is reconciled before the next writer proceeds',
    !fs.existsSync(orphanClaimFile)
      && !fs.existsSync(staleLockFile)
      && afterOrphanClaimRecovery.entries.afterorphanclaim?.total === 21,
    JSON.stringify(afterOrphanClaimRecovery.entries),
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
