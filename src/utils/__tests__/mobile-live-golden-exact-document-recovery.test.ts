import { MobileLiveGoldenRadar, __liveGoldenRadarTestInternals } from '../../mobile/live-golden-radar';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function assert(name: string, condition: boolean, detail?: unknown): void {
  if (!condition) {
    throw new Error(`${name}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`);
  }
}

function trustedBoardItem(category: string, index: number): any {
  return {
    id: `verified-${category}-${index}`,
    keyword: `${category} verified ${index}`,
    category,
    grade: 'SSS',
    score: 95,
    pcSearchVolume: 500,
    mobileSearchVolume: 1500,
    totalSearchVolume: 2000,
    documentCount: 100,
    goldenRatio: 20,
    isMeasured: true,
    searchVolumeSource: 'searchad',
    searchVolumeConfidence: 'high',
    searchVolumeBindingVersion: 'keyword-keyed-v2',
    searchVolumeMeasuredAt: '2026-07-15T01:00:00.000Z',
    isSearchVolumeEstimated: false,
    documentCountSource: 'naver-api',
    documentCountConfidence: 'high',
    documentCountQueryMode: 'exact-phrase',
    isDocumentCountEstimated: false,
    updatedAt: '2026-07-15T01:00:00.000Z',
    discoveredAt: '2026-07-15T01:00:00.000Z',
  };
}

function pendingItem(keyword: string, category: string, index: number): any {
  return {
    ...trustedBoardItem(category, 1000 + index),
    id: `pending-${category}-${index}`,
    keyword,
    pcSearchVolume: null,
    mobileSearchVolume: null,
    searchVolumeSource: 'cache',
  };
}

(async () => {
  const activeTenDistribution: Array<[string, number]> = [
    ['policy', 9],
    ['finance', 5],
    ['health', 5],
    ['education', 5],
    ['it', 4],
    ['travel_domestic', 4],
    ['car', 4],
    ['realestate', 3],
    ['pet_dog', 3],
    ['shopping', 2],
  ];
  let boardIndex = 0;
  const activeTenBoard = activeTenDistribution.flatMap(([category, count]) => (
    Array.from({ length: count }, () => trustedBoardItem(category, boardIndex++))
  ));
  const selectorCandidates = [
    ...Array.from({ length: 4 }, (_, index) => pendingItem(`home repair ${index}`, 'home_life', index)),
    ...Array.from({ length: 6 }, (_, index) => pendingItem(`finance safe fill ${index}`, 'finance', 20 + index)),
    ...Array.from({ length: 6 }, (_, index) => pendingItem(`health safe fill ${index}`, 'health', 30 + index)),
    ...Array.from({ length: 6 }, (_, index) => pendingItem(`policy dominant ${index}`, 'policy', 40 + index)),
  ];
  const safeFillSelection = __liveGoldenRadarTestInternals.selectDeficitBalancedCachePromotionCandidates(
    selectorCandidates,
    activeTenBoard,
    8,
  );
  const safeFillCounts = safeFillSelection.reduce((counts: Record<string, number>, item: any) => {
    counts[item.category] = (counts[item.category] || 0) + 1;
    return counts;
  }, {});
  assert(
    'selector fills available deficits then safely continues under-share supply when only unavailable deficits remain',
    safeFillSelection.length === 8
      && safeFillCounts.home_life === 4
      && (safeFillCounts.finance || 0) + (safeFillCounts.health || 0) === 4
      && !safeFillCounts.policy,
    safeFillCounts,
  );

  const canonicalRefreshCalls: Array<{
    keyword: string;
    queryMode?: string;
    skipCache?: boolean;
    scrapeOnly?: boolean;
  }> = [];
  const canonicalRefreshRadar = new MobileLiveGoldenRadar({
    runOnStart: false,
    now: () => new Date('2026-07-15T02:00:00.000Z'),
    measureLiveDocumentCount: async (keyword, options) => {
      canonicalRefreshCalls.push({
        keyword,
        queryMode: options?.queryMode,
        skipCache: options?.skipCache,
        scrapeOnly: options?.scrapeOnly,
      });
      return {
        dc: 400,
        source: 'naver-api',
        confidence: 'high',
        isEstimated: false,
        queryMode: 'broad',
      };
    },
  });
  const canonicalRefreshInternal = canonicalRefreshRadar as any;
  const legacyExactBoardItem = {
    ...trustedBoardItem('home_life', 9999),
    keyword: '\uC5D0\uC5B4\uCEE8 \uCCAD\uC18C \uBE44\uC6A9 \uBE44\uAD50',
    evidence: [
      'mobile-live-seed-backfill',
      'naver-openapi-exact-phrase',
      'persistent-cache-exact-document-recovery',
    ],
  };
  canonicalRefreshInternal.board.set(legacyExactBoardItem.id, legacyExactBoardItem);
  canonicalRefreshInternal.canonicalDocumentRefreshPendingIds.add(legacyExactBoardItem.id);
  const canonicalRefresh = await canonicalRefreshInternal.refreshCanonicalBoardDocumentCounts(12);
  const canonicalRefreshedItem = canonicalRefreshInternal.board.get(legacyExactBoardItem.id);
  assert(
    'existing exact-phrase board rows are force-refreshed to the canonical broad OpenAPI document count',
    canonicalRefresh.attemptedCount === 1
      && canonicalRefresh.updatedCount === 1
      && canonicalRefreshCalls.length === 1
      && canonicalRefreshCalls[0].queryMode === 'broad'
      && canonicalRefreshCalls[0].skipCache === true
      && canonicalRefreshCalls[0].scrapeOnly === false
      && canonicalRefreshedItem?.documentCount === 400
      && canonicalRefreshedItem?.documentCountQueryMode === 'broad'
      && canonicalRefreshedItem?.evidence?.includes('naver-openapi-broad')
      && !canonicalRefreshedItem?.evidence?.includes('naver-openapi-exact-phrase')
      && !canonicalRefreshedItem?.evidence?.includes('persistent-cache-exact-document-recovery'),
    { canonicalRefresh, canonicalRefreshCalls, canonicalRefreshedItem },
  );

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-exact-doc-recovery-'));
  const keywordCacheFile = path.join(dir, 'keyword-cache.json');
  const boardFile = path.join(dir, 'board.json');
  const candidates = [
    ['청년미래적금 프리랜서 신청 대상', 'policy', 42000],
    ['컴활 시험일정', 'education', 35090],
    ['공인중개사 시험일정', 'education', 24770],
    ['근무시간계산기', 'persistent-cache', 4590],
    ['원룸 입주청소 가격 비교', 'home_life', 9600],
    ['에어컨 청소 비용 비교', 'home_life', 7200],
    ['전세보증보험 가입 조건', 'realestate', 11800],
    ['아파트 중도금대출 이자 비교', 'realestate', 6400],
    ['무선청소기 흡입력 비교', 'shopping', 8400],
    ['노트북 배터리 교체 비용', 'shopping', 5900],
  ] as const;
  fs.writeFileSync(keywordCacheFile, JSON.stringify(Object.fromEntries(candidates.map(([keyword, category, volume]) => [
    keyword,
    {
      searchVolume: volume,
      documentCount: 900_000,
      category,
      source: 'persistent-keyword-cache',
    },
  ]))), 'utf8');

  const now = new Date('2026-07-15T02:00:00.000Z');
  const legacyBoardOnlyKeyword = '\uBD99\uBC15\uC774\uC7A5 \uC124\uCE58 \uBE44\uC6A9';
  const legacyBoardOnlyRow = {
    id: 'legacy-board-only-exact',
    keyword: legacyBoardOnlyKeyword,
    category: 'home_life',
    grade: 'SSS',
    score: 95,
    pcSearchVolume: 456,
    mobileSearchVolume: 1824,
    totalSearchVolume: 2280,
    documentCount: 94,
    goldenRatio: 24.26,
    cpc: 180,
    source: 'mobile-live-golden-radar',
    intent: 'direct-golden-searchad-suggestions',
    evidence: [
      'mobile-live-seed-backfill',
      'naver-openapi-exact-phrase',
      'persistent-cache-exact-document-recovery',
    ],
    isMeasured: true,
    searchVolumeSource: 'searchad',
    searchVolumeConfidence: 'high',
    searchVolumeBindingVersion: 'keyword-keyed-v2',
    searchVolumeMeasuredAt: now.toISOString(),
    isSearchVolumeEstimated: false,
    documentCountSource: 'naver-api',
    documentCountConfidence: 'high',
    isDocumentCountEstimated: false,
    discoveredAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  const legacyBoardOnlyFile = path.join(dir, 'legacy-board-only.json');
  fs.writeFileSync(legacyBoardOnlyFile, JSON.stringify({
    version: 1,
    boardUpdatedAt: now.toISOString(),
    items: [legacyBoardOnlyRow],
  }), 'utf8');
  const legacyVolumeCalls: Array<{ keywords: string[]; forceFresh?: boolean }> = [];
  const legacyDocumentCalls: Array<{ keyword: string; queryMode?: string; scrapeOnly?: boolean }> = [];
  const legacyBoardOnlyRadar = new MobileLiveGoldenRadar({
    runOnStart: false,
    boardFile: legacyBoardOnlyFile,
    boardTarget: 60,
    categories: ['home_life'],
    enableBackfill: false,
    now: () => now,
    getEnvConfig: () => ({
      naverClientId: 'legacy-board-client',
      naverClientSecret: 'legacy-board-secret',
      naverSearchAdAccessLicense: 'legacy-board-access-license',
      naverSearchAdSecretKey: 'legacy-board-searchad-secret',
    }),
    searchAdQuotaState: () => ({
      exhausted: false,
      calls: 0,
      remaining: 100,
      softCeiling: 100,
      dailyLimit: 100,
      resetAtMs: now.getTime() + 24 * 60 * 60 * 1000,
      accountCount: 1,
      availableAccountCount: 1,
      accounts: [],
    }),
    getCachedSearchAdVolume: () => null,
    getCachedExactDocumentCount: () => null,
    measureLiveSearchVolumeSeparate: async (_config, keywords, options) => {
      legacyVolumeCalls.push({ keywords: [...keywords], forceFresh: options?.forceFresh });
      return keywords.filter((keyword) => keyword === legacyBoardOnlyKeyword).map((keyword) => ({
        keyword,
        pcSearchVolume: 500,
        mobileSearchVolume: 1900,
        documentCount: null,
        competition: 'LOW',
        monthlyAveCpc: 180,
        searchVolumeSource: 'searchad' as const,
        searchVolumeConfidence: 'high' as const,
        searchVolumeBindingVersion: 'keyword-keyed-v2' as const,
        searchVolumeMeasuredAt: now.toISOString(),
        isSearchVolumeEstimated: false,
      }));
    },
    measureLiveDocumentCount: async (keyword, options) => {
      legacyDocumentCalls.push({ keyword, queryMode: options?.queryMode, scrapeOnly: options?.scrapeOnly });
      if (keyword !== legacyBoardOnlyKeyword) return null;
      return { dc: 120, source: 'naver-api', confidence: 'high', isEstimated: false };
    },
    liveSeedProvider: async () => [],
    discover: async () => [],
  });
  await legacyBoardOnlyRadar.runOnce();
  const recoveredLegacyRow = [...(legacyBoardOnlyRadar as any).board.values()]
    .find((item: any) => item.keyword === legacyBoardOnlyKeyword);
  const recoveredVerifiedLegacyRow = (legacyBoardOnlyRadar.snapshot().verifiedSupply || [])
    .find((item: any) => item.keyword === legacyBoardOnlyKeyword);
  assert(
    'scheduled canonical refresh updates a board-only exact row without spending SearchAd quota',
    legacyVolumeCalls.length === 0
      && legacyDocumentCalls.length === 1
      && legacyDocumentCalls[0].keyword === legacyBoardOnlyKeyword
      && legacyDocumentCalls[0].queryMode === 'broad'
      && legacyDocumentCalls[0].scrapeOnly === false
      && recoveredLegacyRow?.documentCountQueryMode === 'broad'
      && recoveredLegacyRow?.documentCountSource === 'naver-api'
      && recoveredVerifiedLegacyRow?.pcSearchVolume === 456
      && recoveredVerifiedLegacyRow?.mobileSearchVolume === 1824
      && recoveredVerifiedLegacyRow?.totalSearchVolume === 2280
      && recoveredVerifiedLegacyRow?.documentCount === 120
      && recoveredVerifiedLegacyRow?.searchVolumeBindingVersion === 'keyword-keyed-v2'
      && recoveredVerifiedLegacyRow?.searchVolumeMeasuredAt === now.toISOString()
      && recoveredVerifiedLegacyRow?.isSearchVolumeEstimated === false
      && recoveredVerifiedLegacyRow?.documentCountSource === 'naver-api'
      && recoveredVerifiedLegacyRow?.documentCountConfidence === 'high'
      && recoveredVerifiedLegacyRow?.documentCountQueryMode === 'broad'
      && recoveredVerifiedLegacyRow?.isDocumentCountEstimated === false
      && recoveredVerifiedLegacyRow?.evidence?.includes('canonical-broad-document-refresh')
      && !recoveredVerifiedLegacyRow?.evidence?.includes('naver-openapi-exact-phrase'),
    { legacyVolumeCalls, legacyDocumentCalls, recoveredLegacyRow, recoveredVerifiedLegacyRow },
  );
  legacyBoardOnlyRadar.stop();

  const retryBoardFile = path.join(dir, 'legacy-board-retry-cooldown.json');
  fs.writeFileSync(retryBoardFile, JSON.stringify({
    version: 1,
    boardUpdatedAt: now.toISOString(),
    items: [legacyBoardOnlyRow],
  }), 'utf8');
  let retryNow = new Date(now);
  let retryDocumentSucceeds = false;
  let retryVolumeCalls = 0;
  let retryDocumentCalls = 0;
  let retryCachedSearchAdAtMs: number | null = null;
  const retryRadar = new MobileLiveGoldenRadar({
    runOnStart: false,
    boardFile: retryBoardFile,
    boardTarget: 60,
    categories: ['home_life'],
    enableBackfill: false,
    now: () => retryNow,
    getCachedSearchAdVolume: () => retryCachedSearchAdAtMs === null ? null : ({
      pc: 500,
      mo: 1900,
      total: 2400,
      at: retryCachedSearchAdAtMs,
      ageMs: Math.max(0, retryNow.getTime() - retryCachedSearchAdAtMs),
    }),
    getCachedExactDocumentCount: () => null,
    measureLiveSearchVolumeSeparate: async (_config, keywords) => {
      retryVolumeCalls += 1;
      retryCachedSearchAdAtMs = retryNow.getTime();
      return keywords.filter((keyword) => keyword === legacyBoardOnlyKeyword).map((keyword) => ({
        keyword,
        pcSearchVolume: 500,
        mobileSearchVolume: 1900,
        documentCount: null,
        competition: 'LOW',
        monthlyAveCpc: 180,
        searchVolumeSource: 'searchad' as const,
        searchVolumeConfidence: 'high' as const,
        searchVolumeBindingVersion: 'keyword-keyed-v2' as const,
        searchVolumeMeasuredAt: retryNow.toISOString(),
        isSearchVolumeEstimated: false,
      }));
    },
    measureLiveDocumentCount: async (keyword, options) => {
      retryDocumentCalls += 1;
      if (
        !retryDocumentSucceeds
        || keyword !== legacyBoardOnlyKeyword
        || options?.queryMode !== 'broad'
      ) return null;
      return { dc: 120, source: 'naver-api', confidence: 'high', isEstimated: false };
    },
    liveSeedProvider: async () => [],
    discover: async () => [],
  });
  (retryRadar as any).searchAdMeasurementBudgetRemaining = 40;
  const firstRetryAttempt = await (retryRadar as any).recoverPersistentCacheWithExactDocumentCounts(
    { clientId: 'retry-client', clientSecret: 'retry-secret' },
    24,
  );
  const callsAfterFailure = { volume: retryVolumeCalls, document: retryDocumentCalls };
  (retryRadar as any).searchAdMeasurementBudgetRemaining = 40;
  const cooldownAttempt = await (retryRadar as any).recoverPersistentCacheWithExactDocumentCounts(
    { clientId: 'retry-client', clientSecret: 'retry-secret' },
    24,
  );
  assert(
    'a transient exact-document failure waits through the 90-minute cooldown without spending more quota',
    firstRetryAttempt.attemptedCount === 1
      && firstRetryAttempt.promotedCount === 0
      && cooldownAttempt.attemptedCount === 0
      && retryVolumeCalls === callsAfterFailure.volume
      && retryDocumentCalls === callsAfterFailure.document,
    { firstRetryAttempt, cooldownAttempt, retryVolumeCalls, retryDocumentCalls },
  );
  retryNow = new Date(now.getTime() + 90 * 60 * 1000 + 1);
  (retryRadar as any).searchAdMeasurementBudgetRemaining = 40;
  const secondFailureAttempt = await (retryRadar as any).recoverPersistentCacheWithExactDocumentCounts(
    { clientId: 'retry-client', clientSecret: 'retry-secret' },
    24,
  );
  const secondFailureAtMs = retryNow.getTime();
  const callsAfterSecondFailure = { volume: retryVolumeCalls, document: retryDocumentCalls };
  retryNow = new Date(secondFailureAtMs + 90 * 60 * 1000 + 1);
  retryDocumentSucceeds = true;
  (retryRadar as any).searchAdMeasurementBudgetRemaining = 40;
  const prematureSecondRetry = await (retryRadar as any).recoverPersistentCacheWithExactDocumentCounts(
    { clientId: 'retry-client', clientSecret: 'retry-secret' },
    24,
  );
  assert(
    'a second consecutive failure escalates from 90 minutes to the seven-day backoff',
    secondFailureAttempt.attemptedCount === 1
      && secondFailureAttempt.promotedCount === 0
      && prematureSecondRetry.attemptedCount === 0
      && retryVolumeCalls === callsAfterSecondFailure.volume
      && retryDocumentCalls === callsAfterSecondFailure.document,
    { secondFailureAttempt, prematureSecondRetry, retryVolumeCalls, retryDocumentCalls },
  );
  retryNow = new Date(secondFailureAtMs + 7 * 24 * 60 * 60 * 1000 + 1);
  (retryRadar as any).searchAdMeasurementBudgetRemaining = 40;
  const recoveredAfterCooldown = await (retryRadar as any).recoverPersistentCacheWithExactDocumentCounts(
    { clientId: 'retry-client', clientSecret: 'retry-secret' },
    24,
  );
  const retryVerified = (retryRadar.snapshot().verifiedSupply || [])
    .find((item: any) => item.keyword === legacyBoardOnlyKeyword);
  const callsAfterSuccess = { volume: retryVolumeCalls, document: retryDocumentCalls };
  (retryRadar as any).searchAdMeasurementBudgetRemaining = 40;
  const completedAttempt = await (retryRadar as any).recoverPersistentCacheWithExactDocumentCounts(
    { clientId: 'retry-client', clientSecret: 'retry-secret' },
    24,
  );
  assert(
    'a cooled-down retry can recover once, enter Verified, and then stop remeasurement',
    recoveredAfterCooldown.attemptedCount === 1
      && recoveredAfterCooldown.promotedCount === 1
      && retryVerified?.documentCountQueryMode === 'broad'
      && completedAttempt.attemptedCount === 0
      && retryVolumeCalls === callsAfterSuccess.volume
      && retryDocumentCalls === callsAfterSuccess.document,
    { recoveredAfterCooldown, retryVerified, completedAttempt, retryVolumeCalls, retryDocumentCalls },
  );
  retryRadar.stop();

  const ingestOnlyBoardFile = path.join(dir, 'legacy-ingest-only.json');
  const ingestOnlyFile = path.join(dir, 'legacy-ingest-only-ingest.json');
  fs.writeFileSync(ingestOnlyBoardFile, JSON.stringify({ version: 1, items: [] }), 'utf8');
  fs.writeFileSync(ingestOnlyFile, JSON.stringify({ version: 1, items: [legacyBoardOnlyRow] }), 'utf8');
  let ingestOnlyVolumeCalls = 0;
  const ingestOnlyRadar = new MobileLiveGoldenRadar({
    runOnStart: false,
    boardFile: ingestOnlyBoardFile,
    ingestFile: ingestOnlyFile,
    boardTarget: 60,
    categories: ['home_life'],
    enableBackfill: false,
    now: () => now,
    getCachedSearchAdVolume: () => null,
    measureLiveSearchVolumeSeparate: async () => {
      ingestOnlyVolumeCalls += 1;
      return [];
    },
    discover: async () => [],
  });
  const ingestOnlyInternal = ingestOnlyRadar as any;
  ingestOnlyInternal.searchAdMeasurementBudgetRemaining = 40;
  const ingestOnlyRecovery = await ingestOnlyInternal.recoverPersistentCacheWithExactDocumentCounts(
    { clientId: 'legacy-ingest-client', clientSecret: 'legacy-ingest-secret' },
    24,
  );
  assert(
    'ingest-only evidence cannot open the trusted persisted-board exact recovery lane',
    ingestOnlyRecovery.attemptedCount === 0 && ingestOnlyVolumeCalls === 0,
    { ingestOnlyRecovery, ingestOnlyVolumeCalls },
  );
  ingestOnlyRadar.stop();

  const cachedVolumeByKeyword = new Map<string, number>(candidates.map(([keyword, , volume]) => [keyword, volume]));
  const volumeOptions: Array<{ includeDocumentCount?: boolean; forceFresh?: boolean }> = [];
  const measuredKeywords: string[] = [];
  const documentCalls: Array<{ keyword: string; queryMode?: string; scrapeOnly?: boolean }> = [];
  const freshVolumeByKeyword = new Map<string, number>(candidates.map(([keyword], index) => [keyword, 2400 + index * 100]));

  const radar = new MobileLiveGoldenRadar({
    runOnStart: false,
    boardFile,
    keywordCacheFile,
    boardTarget: 60,
    now: () => now,
    getCachedSearchAdVolume: (keyword: string) => {
      const total = cachedVolumeByKeyword.get(keyword);
      if (!total) return null;
      return {
        pc: Math.floor(total * 0.2),
        mo: total - Math.floor(total * 0.2),
        total,
        at: now.getTime() - 60_000,
        ageMs: 60_000,
      };
    },
    getCachedExactDocumentCount: () => null,
    measureLiveSearchVolumeSeparate: async (_config, keywords, options) => {
      volumeOptions.push(options || {});
      measuredKeywords.push(...keywords);
      return keywords.map((keyword) => {
        const total = freshVolumeByKeyword.get(keyword) || 2500;
        return {
          keyword,
          pcSearchVolume: Math.floor(total * 0.2),
          mobileSearchVolume: total - Math.floor(total * 0.2),
          documentCount: null,
          competition: 'LOW',
          monthlyAveCpc: 180,
          searchVolumeSource: 'searchad' as const,
          searchVolumeConfidence: 'high' as const,
          searchVolumeBindingVersion: 'keyword-keyed-v2' as const,
          searchVolumeMeasuredAt: now.toISOString(),
          isSearchVolumeEstimated: false,
        };
      });
    },
    measureLiveDocumentCount: async (keyword, options) => {
      documentCalls.push({ keyword, queryMode: options?.queryMode, scrapeOnly: options?.scrapeOnly });
      return {
        dc: 120,
        source: 'naver-api',
        confidence: 'high',
        isEstimated: false,
      };
    },
  });
  const internalRadar = radar as any;
  internalRadar.searchAdMeasurementBudgetRemaining = 40;
  const first = await internalRadar.recoverPersistentCacheWithExactDocumentCounts(
    { clientId: 'client', clientSecret: 'secret' },
    4,
  );

  assert(
    'exact-document recovery uses the SearchAd cache only for discovery and always forces fresh split measurement',
    first.attemptedCount > 0
      && first.attemptedCount <= 24
      && volumeOptions.length > 0
      && volumeOptions.every((options) => options.includeDocumentCount === false && options.forceFresh === true),
    { first, volumeOptions, measuredKeywords },
  );
  assert(
    'canonical document recovery measures every returned row as broad OpenAPI total without scrape fallback',
    documentCalls.length > 0
      && documentCalls.every((call) => call.queryMode === 'broad' && call.scrapeOnly === false),
    documentCalls,
  );
  const recoveredRows = [...internalRadar.board.values()].filter((item: any) => (
    Array.isArray(item.evidence) && item.evidence.includes('naver-openapi-broad')
  )) as any[];
  assert(
    'recovered board rows publish the fresh SearchAd total and canonical broad document evidence instead of cached values',
    recoveredRows.length > 0
      && recoveredRows.every((item) => (
        item.totalSearchVolume === freshVolumeByKeyword.get(item.keyword)
        && item.totalSearchVolume !== cachedVolumeByKeyword.get(item.keyword)
        && item.documentCount === 120
        && item.documentCountSource === 'naver-api'
        && item.documentCountQueryMode === 'broad'
      )),
    recoveredRows,
  );
  assert(
    'a partially promoted exact-document cycle remains eligible for the next runUntilTarget iteration',
    internalRadar.cachePromotionProgressCount > 0
      && internalRadar.needsSssDepthRefresh(radar.snapshot()) === true,
    {
      cachePromotionProgressCount: internalRadar.cachePromotionProgressCount,
      boardCount: radar.snapshot().boardCount,
    },
  );

  const firstAttemptedKeywords = [...measuredKeywords];
  const firstAttemptedIds = new Set(firstAttemptedKeywords.map((keyword) => keyword.replace(/\s+/g, '').toLowerCase()));
  const callCountAfterFirstRun = volumeOptions.length;
  internalRadar.searchAdMeasurementBudgetRemaining = 40;
  const second = await internalRadar.recoverPersistentCacheWithExactDocumentCounts(
    { clientId: 'client', clientSecret: 'secret' },
    24,
  );
  assert(
    'the next recovery cycle spends only on the unattempted inventory tail after a bounded partial cycle',
    second.attemptedCount > 0
      && second.attemptedCount <= 24
      && volumeOptions.length > callCountAfterFirstRun
      && measuredKeywords.includes('컴활 시험일정')
      && measuredKeywords.slice(firstAttemptedKeywords.length).every((keyword) => (
        !firstAttemptedIds.has(keyword.replace(/\s+/g, '').toLowerCase())
      )),
    { first, second, firstAttemptedKeywords, measuredKeywords },
  );

  const callCountAfterSecondRun = volumeOptions.length;
  internalRadar.searchAdMeasurementBudgetRemaining = 40;
  const third = await internalRadar.recoverPersistentCacheWithExactDocumentCounts(
    { clientId: 'client', clientSecret: 'secret' },
    24,
  );
  assert(
    'process-local attempted set prevents repeated exact-document recovery spend after the inventory is exhausted',
    third.attemptedCount === 0 && volumeOptions.length === callCountAfterSecondRun,
    { first, second, third, callCountAfterSecondRun, calls: volumeOptions.length },
  );

  const qualityKeywordCacheFile = path.join(dir, 'quality-keyword-cache.json');
  const qualityBoardFile = path.join(dir, 'quality-board.json');
  const qualityCandidates = [
    ['농식품 바우처 자격 조건', 'policy', 160, 43, 60_000],
    ['붙박이장 설치 비용', 'home_life', 270, 94, 60_000],
    ['집 청소 비용', 'home_life', 1980, 845, 14 * 24 * 60 * 60 * 1000],
    ['근무시간계산기', 'education', 4550, 270, 60_000],
    ['사대보험계산기', 'education', 20380, 314, 60_000],
    ['4대보험계산기', 'education', 103600, 2764, 60_000],
    ['컴활 시험일정', 'education', 36690, 1078, 60_000],
    ['도수치료 실비', 'health', 36560, 7515, 60_000],
    ['중고차 이전 비용', 'car', 340, 277, 60_000],
    ['브레이크디스크 교체 시기', 'car', 1220, 235, 60_000],
    ['자동차 엔진오일 교체 주기', 'car', 1250, 653, 60_000],
    ['어달해변숙소', 'travel_domestic', 3720, 263, 60_000],
    ['강아지 미용 비용', 'pet_dog', 290, 631, 60_000],
    ['사랑계산기', 'education', 5000, 100, 60_000],
    ['sk하이닉스 나스닥 상장 가격', 'finance', 4060, 6, 60_000],
  ] as const;
  fs.writeFileSync(qualityKeywordCacheFile, JSON.stringify(Object.fromEntries(
    qualityCandidates.map(([keyword, category, volume]) => [keyword, {
      searchVolume: volume,
      documentCount: 900_000,
      category,
      source: 'persistent-keyword-cache',
    }]),
  )), 'utf8');

  const qualityById = new Map(qualityCandidates.map((row) => [
    row[0].replace(/\s+/g, '').toLowerCase(),
    row,
  ]));
  const qualityMeasuredKeywords: string[] = [];
  const qualityRadar = new MobileLiveGoldenRadar({
    runOnStart: false,
    boardFile: qualityBoardFile,
    keywordCacheFile: qualityKeywordCacheFile,
    boardTarget: 60,
    now: () => now,
    getCachedSearchAdVolume: (keyword: string) => {
      const row = qualityById.get(keyword.replace(/\s+/g, '').toLowerCase());
      if (!row) return null;
      const total = row[2];
      return {
        pc: Math.floor(total * 0.2),
        mo: total - Math.floor(total * 0.2),
        total,
        at: now.getTime() - row[4],
        ageMs: row[4],
      };
    },
    getCachedExactDocumentCount: (keyword: string) => {
      const row = qualityById.get(keyword.replace(/["\s]+/g, '').toLowerCase());
      return row?.[3] ?? null;
    },
    measureLiveSearchVolumeSeparate: async (_config, keywords) => {
      qualityMeasuredKeywords.push(...keywords);
      return keywords.flatMap((keyword) => {
        const row = qualityById.get(keyword.replace(/\s+/g, '').toLowerCase());
        if (!row) return [];
        const total = row[2];
        return [{
          keyword,
          pcSearchVolume: Math.floor(total * 0.2),
          mobileSearchVolume: total - Math.floor(total * 0.2),
          documentCount: null,
          competition: 'LOW',
          monthlyAveCpc: 180,
          searchVolumeSource: 'searchad' as const,
          searchVolumeConfidence: 'high' as const,
          searchVolumeBindingVersion: 'keyword-keyed-v2' as const,
          searchVolumeMeasuredAt: now.toISOString(),
          isSearchVolumeEstimated: false,
        }];
      });
    },
    measureLiveDocumentCount: async (keyword) => {
      const row = qualityById.get(keyword.replace(/\s+/g, '').toLowerCase());
      return {
        dc: row?.[3] ?? 1,
        source: 'naver-api',
        confidence: 'high',
        isEstimated: false,
      };
    },
  });
  const qualityInternal = qualityRadar as any;
  qualityInternal.searchAdMeasurementBudgetRemaining = 40;
  const qualityRecovery = await qualityInternal.recoverPersistentCacheWithExactDocumentCounts(
    { clientId: 'client', clientSecret: 'secret' },
    24,
  );
  const qualityVerified = qualityRadar.snapshot().verifiedSupply || [];
  const qualityVerifiedIds = new Set(qualityVerified.map((item: any) => (
    item.keyword.replace(/\s+/g, '').toLowerCase()
  )));
  assert(
    'canonical broad recovery retains actionable rows without exact-phrase-only utility exceptions',
    qualityRecovery.attemptedCount > 0
      && qualityVerifiedIds.has('농식품바우처자격조건')
      && qualityVerifiedIds.has('붙박이장설치비용')
      && qualityVerifiedIds.has('집청소비용')
      && qualityVerifiedIds.has('브레이크디스크교체시기')
      && qualityVerifiedIds.has('자동차엔진오일교체주기')
      && !qualityVerifiedIds.has('근무시간계산기')
      && !qualityVerifiedIds.has('컴활시험일정')
      && !qualityVerifiedIds.has('어달해변숙소')
      && !qualityVerifiedIds.has('중고차이전비용'),
    { qualityRecovery, qualityMeasuredKeywords, verified: [...qualityVerifiedIds] },
  );
  assert(
    'canonical broad recovery keeps semantic duplicates and low-quality or malformed opportunities out of Verified',
    [...qualityVerifiedIds].filter((id) => id === '사대보험계산기' || id === '4대보험계산기').length <= 1
      && !qualityVerifiedIds.has('강아지미용비용')
      && !qualityVerifiedIds.has('도수치료실비')
      && !qualityVerifiedIds.has('사랑계산기')
      && !qualityVerifiedIds.has('sk하이닉스나스닥상장가격'),
    [...qualityVerifiedIds],
  );
  assert(
    'discovery-only cache may be older than seven days but publication still uses a fresh SearchAd row',
    qualityMeasuredKeywords.some((keyword) => keyword.replace(/\s+/g, '') === '집청소비용')
      && qualityVerified.find((item: any) => item.keyword.replace(/\s+/g, '') === '집청소비용')
        ?.searchVolumeMeasuredAt === now.toISOString(),
    { qualityMeasuredKeywords, qualityVerified },
  );

  const loveCalculatorMetric = {
    keyword: '사랑계산기',
    category: 'education',
    grade: 'SS',
    score: 98,
    pcSearchVolume: 1000,
    mobileSearchVolume: 4000,
    totalSearchVolume: 5000,
    documentCount: 100,
    goldenRatio: 50,
    isMeasured: true,
    searchVolumeSource: 'searchad',
    searchVolumeConfidence: 'high',
    searchVolumeBindingVersion: 'keyword-keyed-v2',
    searchVolumeMeasuredAt: now.toISOString(),
    isSearchVolumeEstimated: false,
    documentCountSource: 'naver-api',
    documentCountConfidence: 'high',
    documentCountQueryMode: 'exact-phrase',
    isDocumentCountEstimated: false,
    evidence: ['naver-openapi-exact-phrase', 'persistent-cache-exact-document-recovery'],
    aiJudge: { verdict: 'publish', score: 100, spamRisk: 'low' },
  } as any;
  assert(
    'exact broad exception does not turn unrelated novelty calculators into Verified supply',
    __liveGoldenRadarTestInternals.isMeasuredProDisplayBackfillMetric(loveCalculatorMetric, now) === false,
  );
  assert(
    'financial listing-event mashups remain semantically rejected even with attractive exact metrics',
    __liveGoldenRadarTestInternals.isHumanNaturalGoldenMetric({
      keyword: 'sk하이닉스 나스닥 상장 가격',
      evidence: [],
    } as any) === false,
  );

  const ymylExactMetric = {
    ...loveCalculatorMetric,
    keyword: '도수치료 비용',
    category: 'health',
    source: 'mobile-live-golden-radar',
    intent: 'direct-golden-searchad-suggestions',
    evidence: [
      'mobile-live-seed-backfill',
      'naver-openapi-exact-phrase',
      'persistent-cache-exact-document-recovery',
    ],
  } as any;
  assert(
    'exact recovery cannot bypass the YMYL safety gate through a legacy direct fallback',
    __liveGoldenRadarTestInternals.liveValueGateFields(ymylExactMetric, now).valueGrade === 'C'
      && __liveGoldenRadarTestInternals.isLiveGoldenQualityConsistent(ymylExactMetric, now) === false,
  );

  const mergeRadar = new MobileLiveGoldenRadar({
    runOnStart: false,
    boardFile: path.join(dir, 'merge-board.json'),
    boardTarget: 60,
    now: () => now,
  });
  const mergeInternal = mergeRadar as any;
  const exactMergeMetric = {
    ...loveCalculatorMetric,
    keyword: '근무시간계산기',
    category: 'education_jobs',
    source: 'mobile-live-golden-radar',
    intent: 'live-golden-discovery',
    cpc: 180,
    evidence: [
      'mobile-live-seed-backfill',
      'naver-openapi-exact-phrase',
      'persistent-cache-exact-document-recovery',
    ],
  } as any;
  mergeInternal.mergeBoard([exactMergeMetric], { pruneAndSave: false });
  const exactMerged = [...mergeInternal.board.values()][0] as any;
  assert(
    'merge persists the query mode that binds exact evidence to the current document count',
    exactMerged?.documentCountQueryMode === 'exact-phrase'
      && __liveGoldenRadarTestInternals.hasTrustedExactRecoveryProof(exactMerged, now) === true,
    exactMerged,
  );

  const persistedBoardFile = path.join(dir, 'persisted-exact-board.json');
  const persistenceRadar = new MobileLiveGoldenRadar({
    runOnStart: false,
    boardFile: persistedBoardFile,
    boardTarget: 60,
    now: () => now,
  });
  (persistenceRadar as any).mergeBoard([exactMergeMetric]);
  persistenceRadar.stop();
  const reloadedRadar = new MobileLiveGoldenRadar({
    runOnStart: false,
    boardFile: persistedBoardFile,
    boardTarget: 60,
    now: () => now,
  });
  const reloadedExact = [...(reloadedRadar as any).board.values()][0] as any;
  assert(
    'saved exact query provenance survives a worker restart and remains trusted',
    reloadedExact?.documentCountQueryMode === 'exact-phrase'
      && __liveGoldenRadarTestInternals.hasTrustedExactRecoveryProof(reloadedExact, now) === true,
    reloadedExact,
  );
  reloadedRadar.stop();

  mergeInternal.mergeBoard([{
    ...exactMergeMetric,
    documentCount: 50,
    goldenRatio: 100,
    documentCountQueryMode: 'broad',
    documentCountSource: undefined,
    documentCountConfidence: undefined,
    evidence: ['mobile-live-seed-backfill'],
  }], { pruneAndSave: false });
  const untrustedReplacement = [...mergeInternal.board.values()][0] as any;
  assert(
    'a source-less broad count cannot erase an existing trusted exact document measurement',
    untrustedReplacement?.documentCount === 100
      && untrustedReplacement?.documentCountQueryMode === 'exact-phrase'
      && untrustedReplacement.evidence.includes('naver-openapi-exact-phrase')
      && __liveGoldenRadarTestInternals.hasTrustedExactRecoveryProof(untrustedReplacement, now) === true,
    untrustedReplacement,
  );

  mergeInternal.mergeBoard([{
    ...exactMergeMetric,
    documentCount: 50,
    goldenRatio: 100,
    documentCountQueryMode: 'broad',
    evidence: ['mobile-live-seed-backfill'],
  }], { pruneAndSave: false });
  const broadMerged = [...mergeInternal.board.values()][0] as any;
  assert(
    'a replacing broad document count removes stale exact evidence instead of inheriting it',
    broadMerged?.documentCount === 50
      && broadMerged?.documentCountQueryMode === 'broad'
      && !broadMerged.evidence.includes('naver-openapi-exact-phrase')
      && !broadMerged.evidence.includes('persistent-cache-exact-document-recovery')
      && __liveGoldenRadarTestInternals.hasTrustedExactRecoveryProof(broadMerged, now) === false,
    broadMerged,
  );

  mergeInternal.mergeBoard([{
    ...exactMergeMetric,
    keyword: '퇴직금계산기',
    documentCountQueryMode: 'broad',
    documentCountSource: undefined,
    documentCountConfidence: undefined,
    evidence: ['mobile-live-seed-backfill'],
  }], { pruneAndSave: false });
  const untrustedBroad = [...mergeInternal.board.values()].find((item: any) => item.keyword === '퇴직금계산기') as any;
  assert(
    'direct proof is not minted when the incoming document-count source and confidence are absent',
    untrustedBroad && !untrustedBroad.evidence.includes('direct-searchad-exact-measured'),
    untrustedBroad,
  );

  mergeRadar.stop();

  qualityRadar.stop();

  radar.stop();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('mobile live golden exact-document recovery tests: PASS');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
