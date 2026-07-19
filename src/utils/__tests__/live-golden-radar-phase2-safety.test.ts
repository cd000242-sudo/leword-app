import fs from 'fs';
import os from 'os';
import path from 'path';
import { LIVE_GOLDEN_CORE_CATEGORY_POLICIES } from '../../mobile/live-golden-category-policy';
import type { MobileLiveGoldenBoardItem } from '../../mobile/contracts';
import {
  __liveGoldenRadarTestInternals,
  MobileLiveGoldenRadar,
} from '../../mobile/live-golden-radar';
import {
  freezeLiveGoldenReviewCohort,
} from '../../mobile/live-golden-review-cohort';
import {
  isReservedLiveGoldenHiddenProofEvidence,
} from '../../mobile/live-golden-quality-policy';
import { resolveHomeKeywordBriefingFile } from '../../mobile/home-keyword-briefing';
import { naverBlogDocumentCountQueryKey } from '../naver-blog-api';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-phase2-radar-'));
const nowMs = Date.parse('2026-07-18T03:00:00.000Z');
const nowIso = new Date(nowMs).toISOString();

function measuredRow(
  keyword: string,
  category: string,
  index: number,
  options: {
    evidence?: string[];
    searchVolumeMeasuredAt?: string;
    documentCountMeasuredAt?: string;
    documentCountQueryKey?: string;
    source?: string;
    intent?: string;
  } = {},
): MobileLiveGoldenBoardItem {
  const pcSearchVolume = 200 + index;
  const mobileSearchVolume = 800 + index;
  const totalSearchVolume = pcSearchVolume + mobileSearchVolume;
  return {
    id: `phase2-row-${index}`,
    rank: index + 1,
    keyword,
    category,
    intent: options.intent || 'internal-live-golden-intent',
    grade: 'S',
    score: 80,
    pcSearchVolume,
    mobileSearchVolume,
    totalSearchVolume,
    documentCount: 200,
    goldenRatio: totalSearchVolume / 200,
    cpc: 500,
    source: options.source || 'persistent-measured-golden-cache',
    evidence: options.evidence || [],
    isMeasured: true,
    searchVolumeSource: 'searchad',
    searchVolumeConfidence: 'high',
    searchVolumeBindingVersion: 'keyword-keyed-v2',
    searchVolumeMeasuredAt: options.searchVolumeMeasuredAt || nowIso,
    isSearchVolumeEstimated: false,
    documentCountSource: 'naver-api',
    documentCountConfidence: 'high',
    documentCountQueryMode: 'broad',
    documentCountQueryKey: options.documentCountQueryKey
      || naverBlogDocumentCountQueryKey(keyword),
    documentCountMeasuredAt: options.documentCountMeasuredAt || nowIso,
    isDocumentCountEstimated: false,
    discoveredAt: nowIso,
    updatedAt: nowIso,
    freshness: 'live',
    isPublicPreview: false,
    publicSearchVolumeLabel: String(totalSearchVolume),
    publicDocumentCountLabel: '200',
    publicReason: 'phase2 safety fixture',
  };
}

async function persistedDocumentQueryKeyRecoveryRegression(): Promise<void> {
  const boardFile = path.join(root, 'document-query-key-recovery.json');
  const keyword = '\uC81C\uC8FC \uB80C\uD130\uCE74 \uC644\uC804\uC790\uCC28 \uAC00\uACA9\uBE44\uAD50';
  const mismatchedAlias = '\uC81C\uC8FC\uB80C\uD130\uCE74 \uC644\uC804\uC790\uCC28 \uAC00\uACA9\uBE44\uAD50';
  const persisted = measuredRow(keyword, 'travel_domestic', 900, {
    evidence: ['server-autocomplete-exact-measured'],
    documentCountQueryKey: naverBlogDocumentCountQueryKey(mismatchedAlias),
  });
  fs.writeFileSync(boardFile, JSON.stringify({
    version: 1,
    boardUpdatedAt: nowIso,
    items: [persisted],
  }), 'utf8');

  const radar = new MobileLiveGoldenRadar({
    runOnStart: false,
    boardTarget: 10,
    boardFile,
    now: () => new Date(nowMs),
    measureLiveDocumentCount: async (measuredKeyword) => ({
      dc: 333,
      source: 'naver-api',
      confidence: 'high',
      isEstimated: false,
      queryMode: 'broad',
      queryKey: naverBlogDocumentCountQueryKey(measuredKeyword),
      measuredAt: nowIso,
    }),
  });

  const restored = [...((radar as any).board.values() as Iterable<MobileLiveGoldenBoardItem>)][0];
  assert('a persisted broad count with a different spacing query key is stripped before publication',
    !!restored
      && restored.documentCount === null
      && restored.documentCountQueryKey === undefined
      && restored.documentCountSource === undefined
      && restored.isMeasured === false
      && restored.evidence.includes('canonical-document-query-key-recovery-pending')
      && (radar as any).canonicalDocumentRefreshPendingIds.has(restored.id)
      && !(radar.snapshot().verifiedSupply || []).some((item) => item.keyword === keyword),
    JSON.stringify(restored));

  (radar as any).pruneBoard();
  (radar as any).saveBoardToFile();
  const savedRecoveryPayload = JSON.parse(fs.readFileSync(boardFile, 'utf8'));
  const savedRecoveryRow = savedRecoveryPayload.items.find((item: any) => item.keyword === keyword);
  assert('a stripped query-mismatch row remains in the private bounded recovery inventory after save',
    !!savedRecoveryRow
      && savedRecoveryRow.documentCount === null
      && savedRecoveryRow.documentCountQueryKey === undefined
      && savedRecoveryRow.isMeasured === false
      && savedRecoveryRow.isPublicPreview === false
      && savedRecoveryRow.evidence.includes('canonical-document-query-key-recovery-pending'),
    JSON.stringify(savedRecoveryPayload));

  const reloadedRadar = new MobileLiveGoldenRadar({
    runOnStart: false,
    boardTarget: 10,
    boardFile,
    now: () => new Date(nowMs),
    measureLiveDocumentCount: async (measuredKeyword) => ({
      dc: 333,
      source: 'naver-api',
      confidence: 'high',
      isEstimated: false,
      queryMode: 'broad',
      queryKey: naverBlogDocumentCountQueryKey(measuredKeyword),
      measuredAt: nowIso,
    }),
  });
  const reloadedPending = [...((reloadedRadar as any).board.values() as Iterable<MobileLiveGoldenBoardItem>)][0];
  assert('worker restart restores the private canonical document recovery work item',
    !!reloadedPending
      && reloadedPending.documentCount === null
      && (reloadedRadar as any).canonicalDocumentRefreshPendingIds.has(reloadedPending.id)
      && !(reloadedRadar.snapshot().verifiedSupply || []).some((item) => item.keyword === keyword),
    JSON.stringify(reloadedPending));

  const refresh = await (reloadedRadar as any).refreshCanonicalBoardDocumentCounts(1);
  const recovered = [...((reloadedRadar as any).board.values() as Iterable<MobileLiveGoldenBoardItem>)][0];
  assert('canonical broad remeasurement restores only the matching exact query key',
    refresh.attemptedCount === 1
      && refresh.updatedCount === 1
      && recovered.documentCount === 333
      && recovered.documentCountQueryKey === naverBlogDocumentCountQueryKey(keyword)
      && recovered.documentCountSource === 'naver-api'
      && recovered.documentCountQueryMode === 'broad'
      && recovered.isDocumentCountEstimated === false
      && !(reloadedRadar as any).canonicalDocumentRefreshPendingIds.has(recovered.id),
    JSON.stringify({ refresh, recovered }));
}

function installRows(radar: MobileLiveGoldenRadar, rows: MobileLiveGoldenBoardItem[]): void {
  const board = (radar as any).board as Map<string, MobileLiveGoldenBoardItem>;
  board.clear();
  for (const row of rows) board.set(row.id, row);
  (radar as any).cachedSnapshot = null;
  (radar as any).cachedSnapshotAtMs = 0;
}

function homeBriefingSharedVolumePathRegression(): void {
  const previousMobilePath = process.env['LEWORD_MOBILE_HOME_KEYWORD_BRIEFING_FILE'];
  const previousLegacyPath = process.env['LEWORD_HOME_KEYWORD_BRIEFING_FILE'];
  const mobilePath = path.join(root, 'briefing-volume', 'home-keyword-briefing.json');
  const legacyPath = path.join(root, 'legacy-data', 'home-keyword-briefing.json');
  try {
    process.env['LEWORD_MOBILE_HOME_KEYWORD_BRIEFING_FILE'] = mobilePath;
    process.env['LEWORD_HOME_KEYWORD_BRIEFING_FILE'] = legacyPath;
    assert('worker/API shared briefing volume path overrides the legacy API data path',
      resolveHomeKeywordBriefingFile() === path.resolve(mobilePath),
      resolveHomeKeywordBriefingFile());
    delete process.env['LEWORD_MOBILE_HOME_KEYWORD_BRIEFING_FILE'];
    assert('legacy briefing file override remains backward compatible',
      resolveHomeKeywordBriefingFile() === path.resolve(legacyPath),
      resolveHomeKeywordBriefingFile());
  } finally {
    if (previousMobilePath === undefined) delete process.env['LEWORD_MOBILE_HOME_KEYWORD_BRIEFING_FILE'];
    else process.env['LEWORD_MOBILE_HOME_KEYWORD_BRIEFING_FILE'] = previousMobilePath;
    if (previousLegacyPath === undefined) delete process.env['LEWORD_HOME_KEYWORD_BRIEFING_FILE'];
    else process.env['LEWORD_HOME_KEYWORD_BRIEFING_FILE'] = previousLegacyPath;
  }
}

async function cachedRealProofRegression(): Promise<void> {
  const boardFile = path.join(root, 'cached-real-board.json');
  const realDemandCacheFile = path.join(root, 'cached-real-verdicts.json');
  const keyword = '제주 렌터카 가격비교';
  fs.writeFileSync(realDemandCacheFile, JSON.stringify({
    version: 1,
    savedAt: nowIso,
    verdicts: {
      '제주렌터카가격비교': {
        result: 'real',
        via: 'extension',
        checkedAt: nowIso,
      },
    },
  }), 'utf8');
  let probeCalls = 0;
  const radar = new MobileLiveGoldenRadar({
    runOnStart: false,
    boardTarget: 10,
    boardFile,
    realDemandCacheFile,
    now: () => new Date(nowMs),
    getEnvConfig: () => ({ naverClientId: 'fixture-client', naverClientSecret: 'fixture-secret' }),
    liveSeedProvider: async () => [],
    enableBackfill: false,
    discover: async () => [],
    realDemandProbe: async () => {
      probeCalls += 1;
      return { ok: true, suggestions: [`${keyword} 예약`] };
    },
  });
  installRows(radar, [measuredRow(keyword, 'travel_domestic', 1)]);
  await (radar as any).enforceRealDemandOnBoard();
  const publicSnapshot = radar.snapshot();
  const internalSnapshot = radar.snapshotForInternalReview();
  const persisted = [...((radar as any).board.values() as Iterable<MobileLiveGoldenBoardItem>)][0];
  assert('a cached current real verdict stamps a missing server marker without another probe',
    probeCalls === 0
      && persisted.evidence.includes('real-demand-extension')
      && !Object.prototype.hasOwnProperty.call(publicSnapshot, 'reviewCandidates')
      && internalSnapshot.reviewCandidates.some((item) => item.keyword === keyword),
    JSON.stringify({ probeCalls, evidence: persisted.evidence, review: internalSnapshot.reviewCandidates }));
}

async function expiredUnknownProofRegression(): Promise<void> {
  const boardFile = path.join(root, 'expired-unknown-board.json');
  const realDemandCacheFile = path.join(root, 'expired-unknown-verdicts.json');
  const keyword = '청년미래적금 가입 대상';
  fs.writeFileSync(realDemandCacheFile, JSON.stringify({
    version: 1,
    savedAt: new Date(nowMs - 15 * 24 * 60 * 60 * 1000).toISOString(),
    verdicts: {
      '청년미래적금가입대상': {
        result: 'real',
        via: 'extension',
        checkedAt: new Date(nowMs - 15 * 24 * 60 * 60 * 1000).toISOString(),
      },
    },
  }), 'utf8');
  let probeCalls = 0;
  const radar = new MobileLiveGoldenRadar({
    runOnStart: false,
    boardTarget: 10,
    boardFile,
    realDemandCacheFile,
    now: () => new Date(nowMs),
    getEnvConfig: () => ({ naverClientId: 'fixture-client', naverClientSecret: 'fixture-secret' }),
    liveSeedProvider: async () => [],
    enableBackfill: false,
    discover: async () => [],
    realDemandProbe: async () => {
      probeCalls += 1;
      return { ok: false, suggestions: [] };
    },
  });
  installRows(radar, [measuredRow(keyword, 'policy', 2, {
    evidence: ['real-demand-extension'],
  })]);
  await (radar as any).enforceRealDemandOnBoard();
  const snapshot = radar.snapshot();
  const internalSnapshot = radar.snapshotForInternalReview();
  const persisted = [...((radar as any).board.values() as Iterable<MobileLiveGoldenBoardItem>)][0];
  assert('expired real-demand proof that rechecks unknown stays in Watch but loses Verified trust',
    probeCalls > 0
      && !!persisted
      && !persisted.evidence.some((entry) => /^real-demand-(?:echo|extension|verified)$/i.test(entry))
      && !internalSnapshot.reviewCandidates.some((item) => item.keyword === keyword)
      && !snapshot.verifiedSupply?.some((item) => item.keyword === keyword),
    JSON.stringify({ probeCalls, evidence: persisted?.evidence, review: internalSnapshot.reviewCandidates }));
}

function clientEvidenceBoundaryRegression(): void {
  const radar = new MobileLiveGoldenRadar({
    runOnStart: false,
    boardTarget: 10,
    boardFile: path.join(root, 'ingest-board.json'),
    now: () => new Date(nowMs),
  });
  const forged = measuredRow('자동차 타이어 교체 비용', 'car_maintain', 3, {
    source: 'client-forged-source',
    evidence: [
      'real-demand-verified',
      'server-autocomplete-exact-measured',
      'autocomplete-second-hop',
      'related-keyword-exact',
      'multiple-source',
      'validated-modifier',
      'home-keyword-briefing-reviewed',
      'searchad-keyword-measured',
    ],
  });
  const result = radar.ingestBoard([forged], { source: 'desktop-client' });
  const ingested = [...((radar as any).board.values() as Iterable<MobileLiveGoldenBoardItem>)][0];
  assert('desktop ingest cannot forge any reserved hidden-demand evidence marker',
    result.accepted === 1
      && !!ingested
      && ingested.evidence.every((entry) => !isReservedLiveGoldenHiddenProofEvidence(entry))
      && ingested.evidence.includes('searchad-keyword-measured'),
    JSON.stringify({ result, evidence: ingested?.evidence }));
}

async function reviewedHomeBriefingCoreBridgeRegression(): Promise<void> {
  const boardFile = path.join(root, 'reviewed-home-briefing-core-bridge.json');
  const coreKeyword = '\uC81C\uC8FC \uB80C\uD130\uCE74 \uC644\uC804\uC790\uCC28 \uAC00\uACA9\uBE44\uAD50';
  // This is the user's arbitrary analyzer input from the screenshot. It may
  // remain visible in the separate Watch/surge lane after exact measurement,
  // but it is not a core hidden-known policy keyword.
  const nonCoreKeyword = '\uB77C\uBBFC \uC57C \uB9D0';
  const radar = new MobileLiveGoldenRadar({
    runOnStart: false,
    boardTarget: 10,
    boardFile,
    now: () => new Date(nowMs),
    homeKeywordBriefingProvider: () => ({
      snapshotId: 'reviewed-home-core-bridge',
      title: 'reviewed hidden-known keywords',
      author: 'admin',
      publishedAt: nowIso,
      revision: 1,
      formulaVersion: 'search-volume-divided-by-documents-plus-one-v1',
      source: 'admin-image-ocr-reviewed',
      sourceImages: [],
      rows: [
        { keyword: coreKeyword, ocrConfidence: 99 },
        { keyword: nonCoreKeyword, ocrConfidence: 99 },
      ],
      updatedBy: 'admin',
    } as any),
    measureLiveSearchVolumeSeparate: (async (_config: unknown, keywords: string[]) => keywords.map((keyword) => ({
      keyword,
      pcSearchVolume: 2_400,
      mobileSearchVolume: 9_600,
      documentCount: 240,
      competition: 'LOW',
      monthlyAveCpc: 700,
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      searchVolumeBindingVersion: 'keyword-keyed-v2',
      searchVolumeMeasuredAt: nowIso,
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      documentCountQueryMode: 'broad',
      documentCountQueryKey: naverBlogDocumentCountQueryKey(keyword),
      documentCountMeasuredAt: nowIso,
      isDocumentCountEstimated: false,
      svEstimated: false,
    }))) as any,
  });
  const seeds = (radar as any).collectReviewedHomeKeywordBriefingSeeds() as string[];
  (radar as any).searchAdMeasurementBudgetRemaining = 8;
  await (radar as any).huntTrafficSurgeCandidates(
    { clientId: 'fixture-client', clientSecret: 'fixture-secret' },
    seeds,
    seeds,
    false,
    8,
  );
  const board = [...((radar as any).board.values() as Iterable<MobileLiveGoldenBoardItem>)];
  const coreRow = board.find((item) => item.keyword === coreKeyword);
  const nonCoreRow = board.find((item) => item.keyword === nonCoreKeyword);
  const strictPool = (radar as any).strictReviewCandidatePool() as MobileLiveGoldenBoardItem[];
  assert('reviewed Home briefing direct seeds bridge into core only through full policy, hidden-proof, and measurement gates',
    seeds.includes(coreKeyword)
      && coreRow?.lane === undefined
      && coreRow?.category === 'travel_domestic'
      && coreRow?.intent === 'home-keyword-briefing-reviewed-core'
      && coreRow?.evidence.includes('home-keyword-briefing-reviewed') === true
      && coreRow?.evidence.includes('home-keyword-briefing-core-bridge') === true
      && strictPool.some((item) => item.id === coreRow.id)
      && nonCoreRow?.lane === 'traffic-surge'
      && !strictPool.some((item) => item.id === nonCoreRow.id),
    JSON.stringify({ board, strictPool: strictPool.map((item) => item.keyword) }));
}

function currentFakeVerdictOverridesOtherProofRegression(): void {
  const keyword = '문화누리카드 오프라인 사용처';
  const item = measuredRow(keyword, 'policy', 4, {
    evidence: [
      'server-autocomplete-exact-measured',
      'related-keyword-exact',
    ],
  });
  const qualityEligible = (__liveGoldenRadarTestInternals as any)
    .isVerifiedLiveGoldenQualityEligible;
  assert('a current fake real-demand verdict blocks Verified even when another hidden proof exists',
    qualityEligible(item, null) === true
      && qualityEligible(item, {
        result: 'fake',
        via: 'none',
        checkedAt: nowIso,
      }) === false,
    JSON.stringify({
      withoutVerdict: qualityEligible(item, null),
      withFakeVerdict: qualityEligible(item, {
        result: 'fake',
        via: 'none',
        checkedAt: nowIso,
      }),
    }));
}

function documentMaintenancePriorityRegression(): void {
  const selectBatch = (__liveGoldenRadarTestInternals as any).selectCanonicalDocumentMaintenanceBatch;
  assert('radar exposes deterministic canonical document maintenance batch selection', typeof selectBatch === 'function');
  const baseMs = Date.parse('2026-07-18T00:00:00.000Z');
  const simulated = [
    ...Array.from({ length: 64 }, (_, index) => ({
      id: `held-${index}`,
      documentCountMeasuredAt: new Date(baseMs + index).toISOString(),
    })),
    ...Array.from({ length: 128 }, (_, index) => ({
      id: `other-${index}`,
      documentCountMeasuredAt: new Date(baseMs - 24 * 60 * 60 * 1000 + index).toISOString(),
    })),
  ];
  const heldIds = new Set(Array.from({ length: 64 }, (_, index) => `held-${index}`));
  const refreshedHeld = new Set<string>();
  for (let cycle = 0; cycle < 13; cycle += 1) {
    const batch = selectBatch(
      simulated,
      5,
      (item: { id: string }) => heldIds.has(item.id),
      () => true,
    ) as Array<{ id: string; documentCountMeasuredAt: string }>;
    for (const item of batch) {
      assert('non-cohort rows never displace a frozen row inside its 13-cycle refresh window', heldIds.has(item.id), item.id);
      refreshedHeld.add(item.id);
      item.documentCountMeasuredAt = new Date(baseMs + (cycle + 1) * 60_000).toISOString();
    }
  }
  assert('64 frozen rows all receive canonical document refresh within 13 five-row cycles despite 128 older rows',
    refreshedHeld.size === 64,
    String(refreshedHeld.size));
}

function strictReviewFamilyCapRegression(): void {
  const radar = new MobileLiveGoldenRadar({
    runOnStart: false,
    boardTarget: 10,
    now: () => new Date(nowMs),
  });
  const sameFamily = [
    measuredRow('\uC81C\uC8FC \uB80C\uD130\uCE74 \uC644\uC804\uC790\uCC28 \uBE44\uC6A9', 'travel_domestic', 800),
    measuredRow('\uC81C\uC8FC \uB80C\uD130\uCE74 \uC644\uC804\uC790\uCC28 \uAC00\uACA9', 'car_maintain', 801),
  ];
  const selected = (radar as any).currentReviewCandidates(sameFamily) as MobileLiveGoldenBoardItem[];
  assert('production strict review selects at most one keyword from a diversity family',
    selected.length === 1,
    JSON.stringify(selected.map((item) => item.keyword)));
}

function compactAliasCandidateFinderRegression(): void {
  const radar = new MobileLiveGoldenRadar({
    runOnStart: false,
    boardTarget: 10,
    now: () => new Date(nowMs),
  });
  const compactAlias = measuredRow('\uC81C\uC8FC\uB80C\uD130\uCE74', 'travel_domestic', 900);
  const exactSpaced = {
    ...measuredRow('\uC81C\uC8FC \uB80C\uD130\uCE74', 'travel_domestic', 901),
    searchVolumeMeasuredAt: new Date(nowMs - 8 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(nowMs + 1_000).toISOString(),
    documentCountMeasuredAt: new Date(nowMs + 1_000).toISOString(),
  };
  installRows(radar, [compactAlias, exactSpaced]);
  const candidates = (radar as any).findMeasuredBoardItems(
    '\uC81C\uC8FC \uB80C\uD130\uCE74',
  ) as MobileLiveGoldenBoardItem[];
  assert('overlay preparation exposes every measured compact-alias candidate, newest first',
    candidates.length === 2
      && candidates[0].keyword === exactSpaced.keyword
      && new Set(candidates.map((item) => item.keyword)).size === 2,
    JSON.stringify(candidates?.map((item) => ({ keyword: item.keyword, updatedAt: item.updatedAt }))));
}

function compactAliasBroadQueryStorageRegression(): void {
  const radar = new MobileLiveGoldenRadar({
    runOnStart: false,
    boardTarget: 10,
    now: () => new Date(nowMs),
  });
  const spacedKeyword = '\uC81C\uC8FC \uB80C\uD130\uCE74 \uC644\uC804\uC790\uCC28 \uAC00\uACA9\uBE44\uAD50';
  const unspacedKeyword = '\uC81C\uC8FC\uB80C\uD130\uCE74\uC644\uC804\uC790\uCC28\uAC00\uACA9\uBE44\uAD50';
  const spacedDocumentMeasuredAt = new Date(nowMs - 30_000).toISOString();
  const unspacedDocumentMeasuredAt = new Date(nowMs - 20_000).toISOString();
  const spaced = {
    ...measuredRow(spacedKeyword, 'travel_domestic', 910, {
      evidence: ['spaced-broad-document-proof'],
      source: 'mobile-live-golden-radar',
      searchVolumeMeasuredAt: new Date(nowMs - 60_000).toISOString(),
      documentCountMeasuredAt: spacedDocumentMeasuredAt,
    }),
    pcSearchVolume: 900,
    mobileSearchVolume: 8_100,
    totalSearchVolume: 9_000,
    documentCount: 111,
    goldenRatio: 81.08,
  };
  const unspaced = {
    ...measuredRow(unspacedKeyword, 'travel_domestic', 911, {
      evidence: ['unspaced-broad-document-proof'],
      source: 'mobile-live-golden-radar',
      searchVolumeMeasuredAt: nowIso,
      documentCountMeasuredAt: unspacedDocumentMeasuredAt,
    }),
    pcSearchVolume: 960,
    mobileSearchVolume: 9_120,
    totalSearchVolume: 10_080,
    documentCount: 222,
    goldenRatio: 45.41,
  };

  // The newest compact SearchAd row arrives first; the older spaced row must
  // keep its own broad documents while inheriting only the newer search split.
  (radar as any).mergeBoard([unspaced, spaced], { pruneAndSave: false });
  const stored = [...((radar as any).board.values() as Iterable<MobileLiveGoldenBoardItem>)];
  const spacedStored = stored.find((item) => item.keyword === spacedKeyword);
  const unspacedStored = stored.find((item) => item.keyword === unspacedKeyword);
  const candidates = radar.findMeasuredBoardItems(spacedKeyword);

  assert('mergeBoard keeps separate Map rows for compact aliases with different broad queries',
    stored.length === 2
      && spacedStored?.id !== unspacedStored?.id
      && spacedStored?.documentCount === 111
      && spacedStored?.documentCountMeasuredAt === spacedDocumentMeasuredAt
      && spacedStored?.evidence.includes('spaced-broad-document-proof') === true
      && spacedStored?.pcSearchVolume === 960
      && spacedStored?.mobileSearchVolume === 9_120
      && spacedStored?.searchVolumeMeasuredAt === nowIso
      && unspacedStored?.documentCount === 222
      && unspacedStored?.documentCountMeasuredAt === unspacedDocumentMeasuredAt
      && unspacedStored?.evidence.includes('unspaced-broad-document-proof') === true,
    JSON.stringify(stored.map((item) => ({
      id: item.id,
      keyword: item.keyword,
      documentCount: item.documentCount,
      documentCountMeasuredAt: item.documentCountMeasuredAt,
      evidence: item.evidence,
    }))));
  assert('findMeasuredBoardItems returns both exact broad-query rows for one compact SearchAd identity',
    candidates.length === 2
      && new Set(candidates.map((item) => item.keyword)).size === 2,
    JSON.stringify(candidates.map((item) => item.keyword)));
}

function legacyPersistedStorageIdentityMigrationRegression(): void {
  const storageId = (__liveGoldenRadarTestInternals as any).keywordId as ((keyword: string) => string) | undefined;
  assert('radar exposes the exact broad-query storage identity for collision regression coverage',
    typeof storageId === 'function');
  const longPrefix = '\uAC00'.repeat(90);
  assert('storage identity separates spacing, punctuation and long-prefix broad-query boundaries',
    storageId!('\uC81C\uC8FC \uB80C\uD130\uCE74 \uAC00\uACA9\uBE44\uAD50')
      !== storageId!('\uC81C\uC8FC\uB80C\uD130\uCE74\uAC00\uACA9\uBE44\uAD50')
      && storageId!('1+1 \uD589\uC0AC \uAC00\uACA9\uBE44\uAD50') !== storageId!('11 \uD589\uC0AC \uAC00\uACA9\uBE44\uAD50')
      && storageId!(`${longPrefix} A`) !== storageId!(`${longPrefix} B`));
  assert('storage identity collapses only equivalent canonical broad-query spellings',
    storageId!('\u201C\uC804\uC138 \uB300\uCD9C\u201D \uAE08\uB9AC \uBE44\uAD50')
      === storageId!('\uC804\uC138 \uB300\uCD9C \uAE08\uB9AC \uBE44\uAD50')
      && storageId!('\uFF21\uFF22\uFF23 \uC804\uC138 \uB300\uCD9C') === storageId!('abc \uC804\uC138 \uB300\uCD9C'));

  const boardFile = path.join(root, 'legacy-storage-id-board.json');
  const spacedKeyword = '\uC81C\uC8FC \uB80C\uD130\uCE74 \uC644\uC804\uC790\uCC28 \uAC00\uACA9\uBE44\uAD50';
  const unspacedKeyword = '\uC81C\uC8FC\uB80C\uD130\uCE74\uC644\uC804\uC790\uCC28\uAC00\uACA9\uBE44\uAD50';
  const newer = {
    ...measuredRow(spacedKeyword, 'travel_domestic', 940, {
      evidence: ['newer-exact-broad-row'],
      source: 'mobile-live-golden-radar',
      searchVolumeMeasuredAt: new Date(nowMs - 20_000).toISOString(),
      documentCountMeasuredAt: new Date(nowMs - 10_000).toISOString(),
    }),
    id: 'legacy-compact-alias-id',
    documentCount: 111,
    updatedAt: new Date(nowMs - 10_000).toISOString(),
  };
  const older = {
    ...measuredRow(spacedKeyword, 'travel_domestic', 941, {
      evidence: ['older-exact-broad-row'],
      source: 'mobile-live-golden-radar',
      searchVolumeMeasuredAt: new Date(nowMs - 120_000).toISOString(),
      documentCountMeasuredAt: new Date(nowMs - 120_000).toISOString(),
    }),
    id: 'legacy-compact-alias-id',
    documentCount: 999,
    updatedAt: new Date(nowMs - 120_000).toISOString(),
  };
  fs.writeFileSync(boardFile, JSON.stringify({
    boardUpdatedAt: nowIso,
    // Deliberately put the older duplicate last: file order must not decide.
    items: [newer, older],
  }), 'utf8');
  const radar = new MobileLiveGoldenRadar({
    runOnStart: false,
    boardTarget: 10,
    boardFile,
    now: () => new Date(nowMs),
  });
  const loaded = [...((radar as any).board.values() as Iterable<MobileLiveGoldenBoardItem>)];
  assert('legacy mismatched ids are rekeyed and exact-key collisions keep the newest trusted row',
    loaded.length === 1
      && loaded[0].id === storageId!(spacedKeyword)
      && loaded[0].documentCount === 111
      && loaded[0].evidence.includes('newer-exact-broad-row'),
    JSON.stringify(loaded));

  const unspaced = {
    ...measuredRow(unspacedKeyword, 'travel_domestic', 942, {
      evidence: ['unspaced-exact-broad-row'],
      source: 'mobile-live-golden-radar',
    }),
    documentCount: 222,
  };
  (radar as any).mergeBoard([unspaced], { pruneAndSave: false });
  const aliases = radar.findMeasuredBoardItems(spacedKeyword);
  assert('a rekeyed legacy exact row and a new spacing alias retain separate documents',
    aliases.length === 2
      && new Set(aliases.map((item) => item.id)).size === 2
      && aliases.some((item) => item.keyword === spacedKeyword && item.documentCount === 111)
      && aliases.some((item) => item.keyword === unspacedKeyword && item.documentCount === 222),
    JSON.stringify(aliases));
}

function invalidCompactSearchAdMergeFailsClosedRegression(): void {
  const radar = new MobileLiveGoldenRadar({
    runOnStart: false,
    boardTarget: 10,
    now: () => new Date(nowMs),
  });
  const invalidRows = [
    {
      ...measuredRow('\uC81C\uC8FC \uB80C\uD130\uCE74 \uC644\uC804\uC790\uCC28 \uAC00\uACA9\uBE44\uAD50', 'travel_domestic', 930, {
        evidence: ['estimated-searchad-input'],
        source: 'mobile-live-golden-radar',
      }),
      lane: 'traffic-surge',
      isSearchVolumeEstimated: true,
    },
    measuredRow('\uB85C\uBD07\uCCAD\uC18C\uAE30 \uBB3C\uAC78\uB808 \uAC00\uACA9\uBE44\uAD50', 'electronics', 931, {
      evidence: ['future-searchad-input'],
      source: 'mobile-live-golden-radar',
      searchVolumeMeasuredAt: new Date(nowMs + 6 * 60_000).toISOString(),
    }),
    measuredRow('\uB3C4\uC218\uCE58\uB8CC \uBCF4\uD5D8 \uC801\uC6A9 \uBE44\uC6A9', 'health', 932, {
      evidence: ['expired-searchad-input'],
      source: 'mobile-live-golden-radar',
      searchVolumeMeasuredAt: new Date(nowMs - 8 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  ] as MobileLiveGoldenBoardItem[];
  (radar as any).mergeBoard(invalidRows, { pruneAndSave: false });
  // A surge lane can temporarily retain a non-Verified diagnostic row through
  // a different ingestion path; even then it must remain outside core supply.
  const board = (radar as any).board as Map<string, MobileLiveGoldenBoardItem>;
  const estimatedTrafficSurge = invalidRows[0];
  board.set(estimatedTrafficSurge.id, estimatedTrafficSurge);
  const stored = [...((radar as any).board.values() as Iterable<MobileLiveGoldenBoardItem>)];
  const verified = (radar as any).verifiedSupplyBoard() as MobileLiveGoldenBoardItem[];
  const hasValidSearchAdMeasurement = (item: MobileLiveGoldenBoardItem): boolean => {
    const measuredAtMs = Date.parse(String(item.searchVolumeMeasuredAt || ''));
    return item.searchVolumeSource === 'searchad'
      && item.searchVolumeConfidence === 'high'
      && item.searchVolumeBindingVersion === 'keyword-keyed-v2'
      && item.isSearchVolumeEstimated === false
      && Number.isFinite(measuredAtMs)
      && measuredAtMs <= nowMs + 5 * 60_000
      && nowMs - measuredAtMs <= 7 * 24 * 60 * 60 * 1000;
  };
  assert('mergeBoard never upgrades estimated, excessive-future or expired SearchAd input into trusted supply',
    stored.length === invalidRows.length
      && stored.every((item) => !hasValidSearchAdMeasurement(item))
      && stored.every((item) => !item.evidence.includes('direct-searchad-exact-measured'))
      && verified.length === 0,
    JSON.stringify({ stored, verified }));
}

async function compactAliasSearchAdPropagationRegression(): Promise<void> {
  const spacedKeyword = '\uC81C\uC8FC \uB80C\uD130\uCE74 \uC644\uC804\uC790\uCC28 \uAC00\uACA9\uBE44\uAD50';
  const unspacedKeyword = '\uC81C\uC8FC\uB80C\uD130\uCE74\uC644\uC804\uC790\uCC28\uAC00\uACA9\uBE44\uAD50';
  const staleSearchMeasuredAt = new Date(nowMs - 8 * 24 * 60 * 60 * 1000).toISOString();
  const freshSearchMeasuredAt = new Date(nowMs - 30_000).toISOString();
  const spacedDocumentMeasuredAt = new Date(nowMs - 90_000).toISOString();
  const unspacedDocumentMeasuredAt = new Date(nowMs - 80_000).toISOString();
  const rows = [
    {
      ...measuredRow(spacedKeyword, 'travel_domestic', 920, {
        evidence: ['spaced-broad-document-proof'],
        searchVolumeMeasuredAt: staleSearchMeasuredAt,
        documentCountMeasuredAt: spacedDocumentMeasuredAt,
      }),
      documentCount: 111,
    },
    {
      ...measuredRow(unspacedKeyword, 'travel_domestic', 921, {
        evidence: ['unspaced-broad-document-proof'],
        searchVolumeMeasuredAt: staleSearchMeasuredAt,
        documentCountMeasuredAt: unspacedDocumentMeasuredAt,
      }),
      documentCount: 222,
    },
  ];
  let measuredKeywords: string[] = [];
  const enrichmentRadar = new MobileLiveGoldenRadar({
    runOnStart: false,
    boardTarget: 10,
    now: () => new Date(nowMs),
    measureLiveSearchVolumeSeparate: async (_config: any, keywords: string[]) => {
      measuredKeywords = [...keywords];
      return keywords.map((keyword) => ({
        keyword,
        pcSearchVolume: 1_234,
        mobileSearchVolume: 8_766,
        totalSearchVolume: 10_000,
        documentCount: null,
        competition: 'LOW',
        monthlyAveCpc: 640,
        searchVolumeSource: 'searchad',
        searchVolumeConfidence: 'high',
        searchVolumeBindingVersion: 'keyword-keyed-v2',
        searchVolumeMeasuredAt: freshSearchMeasuredAt,
        isSearchVolumeEstimated: false,
      })) as any;
    },
  });
  installRows(enrichmentRadar, rows);
  (enrichmentRadar as any).searchAdMeasurementBudgetRemaining = 5;
  const enrichedCount = await (enrichmentRadar as any).enrichExistingBoardSearchAdMetrics({
    clientId: 'fixture-client',
    clientSecret: 'fixture-secret',
  });
  const enriched = [...((enrichmentRadar as any).board.values() as Iterable<MobileLiveGoldenBoardItem>)];
  const enrichedByKeyword = new Map(enriched.map((item) => [item.keyword, item]));
  assert('one compact SearchAd measurement updates every spacing alias without crossing document fields',
    measuredKeywords.length === 1
      && enrichedCount === 2
      && enriched.every((item) => (
        item.pcSearchVolume === 1_234
        && item.mobileSearchVolume === 8_766
        && item.totalSearchVolume === 10_000
        && item.searchVolumeMeasuredAt === freshSearchMeasuredAt
      ))
      && enrichedByKeyword.get(spacedKeyword)?.documentCount === 111
      && enrichedByKeyword.get(spacedKeyword)?.documentCountMeasuredAt === spacedDocumentMeasuredAt
      && enrichedByKeyword.get(spacedKeyword)?.evidence.includes('spaced-broad-document-proof') === true
      && enrichedByKeyword.get(unspacedKeyword)?.documentCount === 222
      && enrichedByKeyword.get(unspacedKeyword)?.documentCountMeasuredAt === unspacedDocumentMeasuredAt
      && enrichedByKeyword.get(unspacedKeyword)?.evidence.includes('unspaced-broad-document-proof') === true,
    JSON.stringify({ measuredKeywords, enrichedCount, enriched }));

  const applyCandidate = (searchVolumeMeasuredAt: string): number => (
    (enrichmentRadar as any).applyCompactSearchAdMeasurement({
      keyword: spacedKeyword,
      pcSearchVolume: 7_000,
      mobileSearchVolume: 21_000,
      cpc: 999,
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      searchVolumeBindingVersion: 'keyword-keyed-v2',
      searchVolumeMeasuredAt,
      isSearchVolumeEstimated: false,
      evidence: ['candidate-searchad-update'],
      stamp: nowIso,
      now: new Date(nowMs),
      applyAiJudge: false,
    })
  );
  const olderChanged = applyCandidate(new Date(nowMs - 60_000).toISOString());
  const futureChanged = applyCandidate(new Date(nowMs + 6 * 60_000).toISOString());
  const expiredChanged = applyCandidate(new Date(nowMs - 8 * 24 * 60 * 60 * 1000).toISOString());
  const afterRejectedUpdates = [
    ...((enrichmentRadar as any).board.values() as Iterable<MobileLiveGoldenBoardItem>),
  ];
  assert('compact SearchAd propagation rejects older, excessive-future and expired measurements',
    olderChanged === 0
      && futureChanged === 0
      && expiredChanged === 0
      && afterRejectedUpdates.every((item) => (
        item.pcSearchVolume === 1_234
        && item.mobileSearchVolume === 8_766
        && item.searchVolumeMeasuredAt === freshSearchMeasuredAt
      )),
    JSON.stringify({ olderChanged, futureChanged, expiredChanged, afterRejectedUpdates }));

  const rebindRadar = new MobileLiveGoldenRadar({
    runOnStart: false,
    boardTarget: 10,
    now: () => new Date(nowMs),
    getCachedSearchAdVolume: () => ({
      pc: 2_000,
      mo: 10_000,
      total: 12_000,
      cpc: 710,
      comp: 'LOW',
      at: Date.parse(freshSearchMeasuredAt),
      ageMs: nowMs - Date.parse(freshSearchMeasuredAt),
    }),
  });
  installRows(rebindRadar, rows);
  const reboundCount = (rebindRadar as any).rebindCachedSearchAdRows(5);
  const rebound = [...((rebindRadar as any).board.values() as Iterable<MobileLiveGoldenBoardItem>)];
  const reboundByKeyword = new Map(rebound.map((item) => [item.keyword, item]));
  assert('one compact SearchAd cache rebind updates every spacing alias and preserves exact broad documents',
    reboundCount === 2
      && rebound.every((item) => (
        item.pcSearchVolume === 2_000
        && item.mobileSearchVolume === 10_000
        && item.totalSearchVolume === 12_000
        && item.searchVolumeMeasuredAt === freshSearchMeasuredAt
      ))
      && reboundByKeyword.get(spacedKeyword)?.documentCount === 111
      && reboundByKeyword.get(spacedKeyword)?.documentCountMeasuredAt === spacedDocumentMeasuredAt
      && reboundByKeyword.get(unspacedKeyword)?.documentCount === 222
      && reboundByKeyword.get(unspacedKeyword)?.documentCountMeasuredAt === unspacedDocumentMeasuredAt,
    JSON.stringify({ reboundCount, rebound }));
}

async function reviewHoldMeasurementOnlyRegression(): Promise<void> {
  const publicIntent = (__liveGoldenRadarTestInternals as any).publicLiveGoldenIntent;
  const sixAndHalfDaysAgo = new Date(nowMs - 6.5 * 24 * 60 * 60 * 1000).toISOString();
  const heldRows = Array.from({ length: 64 }, (_, index) => {
    const policy = LIVE_GOLDEN_CORE_CATEGORY_POLICIES[index % LIVE_GOLDEN_CORE_CATEGORY_POLICIES.length];
    return measuredRow(`코호트 ${policy.label} 검색 의도 ${index + 1} 신청 방법`, policy.discoveryIds[0], 100 + index, {
      evidence: ['server-autocomplete-exact-measured'],
      searchVolumeMeasuredAt: sixAndHalfDaysAgo,
      intent: 'internal-live-golden-intent',
    });
  });
  const normalizedRows = heldRows.map((row) => ({
    ...row,
    intent: publicIntent(row.keyword, row.intent),
  }));
  const frozen = freezeLiveGoldenReviewCohort(normalizedRows, { nowMs });
  assert('measurement-only fixture freezes a balanced 64-row cohort', !!frozen.cohort, JSON.stringify(frozen.supplyReport));
  const cohortFile = path.join(root, 'measurement-only-cohort.json');
  fs.writeFileSync(cohortFile, JSON.stringify(frozen.cohort), 'utf8');
  const nonCohortRows = Array.from({ length: 16 }, (_, index) => measuredRow(
    `비코호트 검색 의도 ${index + 1} 신청 방법`,
    'policy',
    500 + index,
    {
      evidence: ['server-autocomplete-exact-measured'],
      searchVolumeMeasuredAt: sixAndHalfDaysAgo,
    },
  ));
  const heldKeywords = new Set(heldRows.map((row) => row.keyword));
  const searchAdRefreshed: string[] = [];
  let discoveryCalls = 0;
  const radar = new MobileLiveGoldenRadar({
    runOnStart: false,
    boardTarget: 64,
    boardFile: path.join(root, 'measurement-only-board.json'),
    reviewCohortFile: cohortFile,
    now: () => new Date(nowMs),
    getEnvConfig: () => ({
      naverClientId: 'fixture-client',
      naverClientSecret: 'fixture-secret',
      naverSearchAdAccessLicense: 'fixture-access',
      naverSearchAdSecretKey: 'fixture-searchad-secret',
      naverSearchAdCustomerId: '1000000',
    }),
    searchAdQuotaState: () => ({
      exhausted: false,
      calls: 0,
      remaining: 22_000,
      softCeiling: 22_000,
      resetAtMs: nowMs + 12 * 60 * 60 * 1000,
    }),
    measureLiveSearchVolumeSeparate: async (_config, keywords) => {
      searchAdRefreshed.push(...keywords);
      return keywords.map((keyword, index) => ({
        keyword,
        pcSearchVolume: 300 + index,
        mobileSearchVolume: 900 + index,
        documentCount: null,
        competition: 'LOW',
        monthlyAveCpc: 500,
        searchVolumeSource: 'searchad' as const,
        searchVolumeConfidence: 'high' as const,
        searchVolumeBindingVersion: 'keyword-keyed-v2' as const,
        searchVolumeMeasuredAt: nowIso,
        isSearchVolumeEstimated: false,
      }));
    },
    measureLiveDocumentCount: async (keyword) => ({
      dc: 200,
      source: 'naver-api',
      confidence: 'high',
      isEstimated: false,
      queryMode: 'broad',
      queryKey: naverBlogDocumentCountQueryKey(keyword),
      measuredAt: nowIso,
    }),
    realDemandProbe: async (query) => ({ ok: true, suggestions: [`${query} 자격`] }),
    liveSeedProvider: async () => [],
    enableBackfill: false,
    discover: async () => {
      discoveryCalls += 1;
      return [];
    },
  });
  installRows(radar, [...heldRows, ...nonCohortRows]);

  const heldSnapshot = radar.snapshot();
  const heldInternalSnapshot = radar.snapshotForInternalReview();
  assert('an active review cohort binds internal review to the exact frozen Verified rows and order',
    JSON.stringify(heldInternalSnapshot.reviewCandidates.map((item) => item.id))
      === JSON.stringify((heldSnapshot.verifiedSupply || []).map((item) => item.id))
      && heldInternalSnapshot.reviewCandidates.every((item) => heldKeywords.has(item.keyword)),
    JSON.stringify({
      review: heldInternalSnapshot.reviewCandidates.map((item) => item.id),
      verified: (heldSnapshot.verifiedSupply || []).map((item) => item.id),
    }));

  const responseKinds = new Map<string, string>();
  let responseIndex = 0;
  const metadataRadar = new MobileLiveGoldenRadar({
    runOnStart: false,
    boardTarget: 64,
    boardFile: path.join(root, 'metadata-validation-board.json'),
    reviewCohortFile: cohortFile,
    now: () => new Date(nowMs),
    measureLiveSearchVolumeSeparate: async (_config, keywords) => keywords.map((keyword) => {
      const index = responseIndex++;
      const kinds = [
        'valid',
        'missing-binding',
        'estimated',
        'wrong-source',
        'low-confidence',
        'stale',
        'non-exact-keyword',
      ];
      const kind = kinds[index] || 'valid';
      responseKinds.set(keyword, kind);
      const row: any = {
        keyword,
        pcSearchVolume: 9_000 + index,
        mobileSearchVolume: 18_000 + index,
        documentCount: null,
        competition: 'LOW',
        monthlyAveCpc: 700,
        searchVolumeSource: 'searchad',
        searchVolumeConfidence: 'high',
        searchVolumeBindingVersion: 'keyword-keyed-v2',
        searchVolumeMeasuredAt: nowIso,
        isSearchVolumeEstimated: false,
      };
      if (kind === 'missing-binding') delete row.searchVolumeBindingVersion;
      if (kind === 'estimated') row.isSearchVolumeEstimated = true;
      if (kind === 'wrong-source') row.searchVolumeSource = 'cache';
      if (kind === 'low-confidence') row.searchVolumeConfidence = 'medium';
      if (kind === 'stale') {
        row.searchVolumeMeasuredAt = new Date(nowMs - 8 * 24 * 60 * 60 * 1000).toISOString();
      }
      if (kind === 'non-exact-keyword') row.keyword = keyword.replace(/\s+/gu, '');
      return row;
    }) as any,
  });
  installRows(metadataRadar, heldRows);
  const beforePc = new Map(heldRows.map((item) => [item.keyword, item.pcSearchVolume]));
  (metadataRadar as any).searchAdMeasurementBudgetRemaining = 7;
  const trustedRefreshes = await (metadataRadar as any).refreshFrozenReviewCohortSearchAdBindings(
    { clientId: 'fixture-client', clientSecret: 'fixture-secret' },
    7,
  );
  const metadataBoard = [...((metadataRadar as any).board.values() as Iterable<MobileLiveGoldenBoardItem>)];
  const changedKinds = metadataBoard
    .filter((item) => item.pcSearchVolume !== beforePc.get(item.keyword))
    .map((item) => responseKinds.get(item.keyword));
  assert('review-hold SearchAd refresh accepts only an exact fresh non-estimated v2 high-confidence SearchAd row',
    trustedRefreshes === 1
      && changedKinds.length === 1
      && changedKinds[0] === 'valid',
    JSON.stringify({ trustedRefreshes, changedKinds, responseKinds: [...responseKinds.entries()] }));

  await radar.runOnce();
  await radar.runUntilTarget(8);
  assert('manual runOnce/runUntilTarget under a hold perform bounded cohort measurement only',
    discoveryCalls === 0
      && searchAdRefreshed.length > 0
      && searchAdRefreshed.length <= 24
      && searchAdRefreshed.every((keyword) => heldKeywords.has(keyword)),
    JSON.stringify({ discoveryCalls, searchAdRefreshed }));
}

async function main(): Promise<void> {
  homeBriefingSharedVolumePathRegression();
  await persistedDocumentQueryKeyRecoveryRegression();
  console.log('[phase2-safety] document query-key recovery passed');
  strictReviewFamilyCapRegression();
  compactAliasCandidateFinderRegression();
  compactAliasBroadQueryStorageRegression();
  legacyPersistedStorageIdentityMigrationRegression();
  invalidCompactSearchAdMergeFailsClosedRegression();
  await compactAliasSearchAdPropagationRegression();
  documentMaintenancePriorityRegression();
  console.log('[phase2-safety] document priority passed');
  clientEvidenceBoundaryRegression();
  console.log('[phase2-safety] ingest boundary passed');
  currentFakeVerdictOverridesOtherProofRegression();
  console.log('[phase2-safety] current fake verdict precedence passed');
  await reviewedHomeBriefingCoreBridgeRegression();
  console.log('[phase2-safety] reviewed Home briefing core bridge passed');
  await cachedRealProofRegression();
  console.log('[phase2-safety] cached proof passed');
  await expiredUnknownProofRegression();
  console.log('[phase2-safety] expired proof passed');
  await reviewHoldMeasurementOnlyRegression();
  console.log('[live-golden-radar-phase2-safety.test] passed');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    fs.rmSync(root, { recursive: true, force: true });
    process.exit(process.exitCode || 0);
  });
