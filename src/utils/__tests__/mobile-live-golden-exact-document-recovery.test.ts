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
    'exact-document recovery measures every returned row as an exact phrase without scrape fallback',
    documentCalls.length > 0
      && documentCalls.every((call) => call.queryMode === 'exact-phrase' && call.scrapeOnly === false),
    documentCalls,
  );
  const recoveredRows = [...internalRadar.board.values()].filter((item: any) => (
    Array.isArray(item.evidence) && item.evidence.includes('naver-openapi-exact-phrase')
  )) as any[];
  assert(
    'recovered board rows publish the fresh SearchAd total and exact document evidence instead of cached values',
    recoveredRows.length > 0
      && recoveredRows.every((item) => (
        item.totalSearchVolume === freshVolumeByKeyword.get(item.keyword)
        && item.totalSearchVolume !== cachedVolumeByKeyword.get(item.keyword)
        && item.documentCount === 120
        && item.documentCountSource === 'naver-api'
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

  radar.stop();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('mobile live golden exact-document recovery tests: PASS');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
