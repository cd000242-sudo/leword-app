import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  MobileLiveGoldenRadar,
  __liveGoldenRadarTestInternals,
} from '../../mobile/live-golden-radar';
import type { MobileKeywordMetric } from '../../mobile/contracts';
import { liveGoldenPolicyKeyForDiscoveryId } from '../../mobile/live-golden-category-policy';

const now = new Date('2026-07-14T13:00:00.000Z');

function measuredMetric(
  keyword: string,
  overrides: Partial<MobileKeywordMetric> = {},
): MobileKeywordMetric {
  return {
    keyword,
    grade: 'SS',
    score: 82,
    totalSearchVolume: 10_940,
    pcSearchVolume: 2_188,
    mobileSearchVolume: 8_752,
    documentCount: 589,
    goldenRatio: 18.57,
    category: 'electronics',
    source: 'mobile-live-golden-radar',
    intent: 'direct-golden-searchad-suggestions',
    evidence: [
      'mobile-live-golden-radar',
      'searchad-pc-mobile-split-enriched',
      'naver-openapi-exact-phrase',
    ],
    searchVolumeSource: 'searchad',
    searchVolumeConfidence: 'high',
    searchVolumeBindingVersion: 'keyword-keyed-v2',
    searchVolumeMeasuredAt: now.toISOString(),
    isSearchVolumeEstimated: false,
    documentCountSource: 'naver-api',
    documentCountConfidence: 'high',
    documentCountQueryMode: 'exact-phrase',
    isDocumentCountEstimated: false,
    updatedAt: now.toISOString(),
    isMeasured: true,
    ...overrides,
  } as MobileKeywordMetric;
}

function createRadar(
  realDemandProbe?: (query: string) => Promise<{ ok: boolean; suggestions: string[] }>,
  probeQueueFile?: string,
) {
  return new MobileLiveGoldenRadar({
    notificationInbox: null,
    runOnStart: false,
    boardTarget: 120,
    categories: ['shopping_beauty', 'food_recipe'],
    getEnvConfig: () => ({}),
    enableBackfill: false,
    discover: async () => [],
    realDemandProbe,
    probeQueueFile,
    now: () => now,
  });
}

async function main(): Promise<void> {
  const semanticCategoryCases: Array<[string, string]> = [
    ['포장이사비용', 'home_life'],
    ['전세보증보험비용', 'realestate'],
    ['아이폰배터리교체비용', 'smartphone'],
    ['노트북액정수리비용', 'laptop'],
  ];
  for (const [keyword, expected] of semanticCategoryCases) {
    assert.equal(
      __liveGoldenRadarTestInternals.inferLiveCategory(keyword, 'all'),
      expected,
      `core recovery semantic category mismatch: ${keyword}`,
    );
  }
  assert.equal(liveGoldenPolicyKeyForDiscoveryId('diet'), 'food_recipe');
  assert.equal(liveGoldenPolicyKeyForDiscoveryId('self_development'), 'education_jobs');
  assert.equal(liveGoldenPolicyKeyForDiscoveryId('app'), 'it_ai');
  assert.equal(liveGoldenPolicyKeyForDiscoveryId('mental'), 'health');

  const foodRecoverySeeds = __liveGoldenRadarTestInternals
    .curatedCoreSearchAdSeedsForCategory('food_recipe');
  assert.equal(
    foodRecoverySeeds[0],
    '다이어트 식단 차리는법',
    'exact natural recovery anchors must run before broad catalogue seeds',
  );
  for (const category of [
    'education_jobs',
    'it_ai',
    'home_life',
    'realestate',
    'food_recipe',
    'shopping_beauty',
  ]) {
    assert.equal(
      __liveGoldenRadarTestInternals.curatedCoreSearchAdSeedsForCategory(category).length,
      12,
      `deficit lane must have a full bounded set of exact recovery anchors: ${category}`,
    );
    const policyKey = liveGoldenPolicyKeyForDiscoveryId(category);
    assert.ok(
      __liveGoldenRadarTestInternals
        .curatedCoreSearchAdSeedRowsForCategory(category)
        .every((row) => row.policyKey === policyKey),
      `curated exact anchors must carry the requested core policy tag: ${category}`,
    );

    const queueCoverageRadar = createRadar();
    const eligibleAnchors = __liveGoldenRadarTestInternals.selectCuratedExactRecoveryCandidates(
      category,
      __liveGoldenRadarTestInternals.curatedCoreSearchAdSeedRowsForCategory(category),
      [],
      [],
      now,
    );
    (queueCoverageRadar as any).queueMeasuredProbeCandidates(
      eligibleAnchors,
      category,
      'curated-exact-recovery',
      520,
      false,
    );
    assert.equal(
      (queueCoverageRadar as any).pendingMeasuredProbeQueue.length,
      eligibleAnchors.length,
      `every exact anchor that can spend quota must receive queue cooldown tracking: ${category}`,
    );
  }
  const allocateRecoveryBudget = (__liveGoldenRadarTestInternals as any)
    .allocateCuratedRecoveryMeasurementBudget;
  assert.equal(
    typeof allocateRecoveryBudget,
    'function',
    'curated recovery must expose its bounded budget allocation contract',
  );
  const recoveryAllocation = allocateRecoveryBudget(
    Array.from({ length: 12 }, (_value, index) => `정확앵커${index + 1}`),
    Array.from({ length: 40 }, (_value, index) => ({
      keyword: `연관후보${index + 1}`,
      pcSearchVolume: 100,
      mobileSearchVolume: 400,
    })),
    40,
  );
  assert.equal(recoveryAllocation.exactCandidates.length, 12);
  assert.equal(recoveryAllocation.suggestionRows.length, 28);
  assert.equal(
    recoveryAllocation.exactCandidates.length + recoveryAllocation.suggestionRows.length,
    40,
    'exact-anchor reservation must stay inside the existing per-run ceiling',
  );
  const sourceCapRadar = createRadar();
  const sourceCapKeyword = '\uC81C\uC2B5\uAE30';
  (sourceCapRadar as any).pendingMeasuredProbeQueue.push({
    keyword: sourceCapKeyword,
    category: 'policy',
    source: 'legacy-a,legacy-b,legacy-c,legacy-d',
    priority: 9_999,
    firstSeenAt: now.toISOString(),
    lastTriedAt: new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString(),
    attempts: 1,
    misses: 0,
  });
  (sourceCapRadar as any).queueMeasuredProbeCandidates(
    [sourceCapKeyword],
    'shopping_beauty',
    'curated-exact-recovery',
    520,
    false,
  );
  const sourceCapItem = (sourceCapRadar as any).pendingMeasuredProbeQueue[0];
  assert.equal(
    sourceCapItem.source.split(',')[0],
    'curated-exact-recovery',
    'the curated retry tag must survive a full legacy source cap',
  );
  assert.equal(
    sourceCapItem.category,
    'shopping_beauty',
    'curated promotion must repair a higher-priority generic row category',
  );
  (sourceCapRadar as any).updateMeasuredProbeQueueAfterMeasurement(
    [sourceCapKeyword],
    [{ keyword: sourceCapKeyword, pcSearchVolume: 100, mobileSearchVolume: 400 }],
    [{
      keyword: sourceCapKeyword,
      pcSearchVolume: 100,
      mobileSearchVolume: 400,
      documentCount: 100,
    }],
  );
  assert.equal(
    (sourceCapRadar as any).pendingMeasuredProbeQueue[0].attempts,
    4,
    'a merged curated row must retain seven-day tombstone semantics',
  );
  const queuedPolicyRadar = createRadar();
  const queuedPolicyKeyword = '\uAD6D\uBBFC\uB0B4\uC77C\uBC30\uC6C0\uCE74\uB4DC \uC2E0\uCCAD';
  (queuedPolicyRadar as any).pendingMeasuredProbeQueue.push({
    keyword: queuedPolicyKeyword,
    category: 'education_jobs',
    source: 'curated-exact-recovery',
    priority: 800,
    firstSeenAt: now.toISOString(),
    attempts: 0,
    misses: 0,
  });
  const unattemptedQueuedKeyword = '\uCEF4\uD65C \uC2DC\uD5D8\uC77C\uC815';
  (queuedPolicyRadar as any).pendingMeasuredProbeQueue.push({
    keyword: unattemptedQueuedKeyword,
    category: 'education_jobs',
    source: 'curated-exact-recovery',
    priority: 700,
    firstSeenAt: now.toISOString(),
    attempts: 0,
    misses: 0,
  });
  let queuedPolicyExactPhraseIds: ReadonlySet<string> | undefined;
  (queuedPolicyRadar as any).measureLiveSearchVolumeRows = async (
    _config: unknown,
    candidates: string[],
    _options: unknown,
    _timeoutMs: number,
    onAttempted?: (keywords: readonly string[]) => void,
  ) => {
    onAttempted?.(candidates);
    return candidates.map((keyword) => ({
      keyword,
      pcSearchVolume: 2_000,
      mobileSearchVolume: 9_000,
    }));
  };
  (queuedPolicyRadar as any).attachDocumentCountsToVolumeRows = async (
    rows: Array<Record<string, unknown>>,
    _categoryId: string,
    _targetLimit: number,
    options: { exactPhraseCandidateIds?: ReadonlySet<string> },
  ) => {
    queuedPolicyExactPhraseIds = options.exactPhraseCandidateIds;
    return rows.map((row) => ({ ...row, documentCount: 420 }));
  };
  const queuedPolicyResult = await (queuedPolicyRadar as any).discoverQueuedProbeBackfill(
    { clientId: 'test', clientSecret: 'test' },
    'education_jobs',
    10,
  );
  const taggedQueuedPolicyResult = queuedPolicyResult.results.find((result: {
    externalSources?: string[];
    categoryMatched?: boolean;
  }) => result.externalSources?.includes('curated-policy:education_jobs'));
  assert.ok(
    taggedQueuedPolicyResult,
    'a curated queue retry must carry its declared policy into mapDirectResult',
  );
  assert.equal(
    taggedQueuedPolicyResult.categoryMatched,
    true,
    'a curated queue retry must remain category-matched across classifier boundaries',
  );
  assert.ok(
    (queuedPolicyExactPhraseIds?.size || 0) > 0,
    'a curated queue retry must use exact-phrase document counts',
  );
  const neverCalledQueueItem = (queuedPolicyRadar as any).pendingMeasuredProbeQueue
    .find((item: { keyword: string }) => item.keyword === unattemptedQueuedKeyword);
  assert.equal(neverCalledQueueItem.attempts, 0);
  assert.equal(neverCalledQueueItem.misses, 0);
  assert.equal(
    neverCalledQueueItem.lastTriedAt,
    undefined,
    'a curated item with no measured variant must not consume a cooldown attempt',
  );
  const exactOnlyRadar = createRadar();
  const exactOnlyMeasured: string[] = [];
  (exactOnlyRadar as any).searchAdMeasurementBudgetRemaining = 40;
  (exactOnlyRadar as any).measureLiveSearchVolumeRows = async (
    _config: unknown,
    candidates: string[],
    _options: unknown,
    _timeoutMs: number,
    onAttempted?: (keywords: readonly string[]) => void,
  ) => {
    onAttempted?.(candidates);
    exactOnlyMeasured.push(...candidates);
    return candidates.map((keyword) => ({
      keyword,
      pcSearchVolume: 2_000,
      mobileSearchVolume: 9_000,
    }));
  };
  (exactOnlyRadar as any).attachDocumentCountsToVolumeRows = async (
    rows: Array<Record<string, unknown>>,
  ) => rows.map((row) => ({ ...row, documentCount: 420 }));
  const exactOnlyResults = await (exactOnlyRadar as any).discoverBackfill(
    { clientId: 'test', clientSecret: 'test' },
    'sidejob',
    [],
    60,
    { measuredProbeOnly: true, queueCanaryAttempted: true },
  );
  assert.ok(
    exactOnlyMeasured.length > 0,
    'eligible exact recovery anchors must run when provider and generic candidates are empty',
  );
  assert.ok(
    exactOnlyResults.length > 0,
    'an exact-only queue-canary cycle must reach the normal measured publish pipeline',
  );
  const cooldownQueue = [{
    keyword: '신규 제습기 비교',
    category: 'shopping_beauty',
    source: 'curated-exact-recovery',
    priority: 100,
    firstSeenAt: now.toISOString(),
    lastTriedAt: now.toISOString(),
    attempts: 1,
    misses: 1,
  }];
  const curatedSelectionRows = [
    { keyword: '제습기순위', policyKey: 'shopping_beauty' },
    { keyword: '신규 제습기 비교', policyKey: 'shopping_beauty' },
    { keyword: '다른 정책 검색어', policyKey: 'policy' },
  ];
  const recentSelectionMetric = measuredMetric('제습기순위');
  assert.deepEqual(
    __liveGoldenRadarTestInternals.selectCuratedExactRecoveryCandidates(
      'shopping_beauty',
      curatedSelectionRows,
      [recentSelectionMetric as any],
      cooldownQueue as any,
      now,
    ),
    [],
    'recent trusted rows, cooldown rows, and other-policy rows must not spend exact quota',
  );
  assert.deepEqual(
    __liveGoldenRadarTestInternals.selectCuratedExactRecoveryCandidates(
      'shopping_beauty',
      curatedSelectionRows,
      [recentSelectionMetric as any],
      cooldownQueue as any,
      new Date(now.getTime() + 91 * 60 * 1000),
    ),
    ['신규 제습기 비교'],
    'a missed exact anchor becomes eligible only after its retry delay',
  );
  cooldownQueue[0].attempts = 2;
  cooldownQueue[0].misses = 2;
  assert.deepEqual(
    __liveGoldenRadarTestInternals.selectCuratedExactRecoveryCandidates(
      'shopping_beauty', curatedSelectionRows, [], cooldownQueue as any,
      new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000),
    ),
    ['제습기순위'],
    'an exhausted exact anchor must remain blocked for seven days',
  );
  assert.deepEqual(
    __liveGoldenRadarTestInternals.selectCuratedExactRecoveryCandidates(
      'shopping_beauty', curatedSelectionRows, [], cooldownQueue as any,
      new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000),
    ),
    ['제습기순위', '신규 제습기 비교'],
    'an exhausted exact anchor may be retried after the seven-day cooldown',
  );
  const scopedLaptopProbes = __liveGoldenRadarTestInternals.buildMeasuredProbeCandidates(
    'laptop',
    ['\uB18D\uC2DD\uD488\uBC14\uC6B0\uCC98 \uC790\uACA9 \uC870\uAC74'],
    240,
    now,
  );
  assert.ok(
    scopedLaptopProbes.every((keyword) => !keyword.includes('\uB18D\uC2DD\uD488\uBC14\uC6B0\uCC98')),
    'an IT deficit scan must not spend its SearchAd budget on policy-lane probes',
  );
  assert.ok(
    !__liveGoldenRadarTestInternals.measuredProbeCategoryKeys(
      'laptop',
      ['\uB18D\uC2DD\uD488\uBC14\uC6B0\uCC98 \uC790\uACA9 \uC870\uAC74'],
    ).includes('policy'),
    'cross-policy live seed inference must not import another lane catalog',
  );

  const visibleRadar = createRadar();
  const dehumidifier = measuredMetric('제습기순위', {
    intent: 'Transactional',
    evidence: [
      'mobile-live-golden-radar',
      'mobile-live-seed-backfill',
      'naver-openapi-exact-phrase',
    ],
  });
  const diet = measuredMetric('다이어트 식단 차리는법', {
    grade: 'SSS',
    score: 96,
    totalSearchVolume: 51_410,
    pcSearchVolume: 10_282,
    mobileSearchVolume: 41_128,
    documentCount: 318,
    goldenRatio: 161.67,
    category: 'food_recipe',
  });

  assert.equal(
    __liveGoldenRadarTestInternals.isMeasuredProBoardFallbackMetric(dehumidifier as any, now),
    true,
    'fixture must pass the measured fallback contract',
  );
  assert.equal(
    __liveGoldenRadarTestInternals.isMeasuredProBoardFallbackMetric(diet as any, now),
    true,
    'fixture must pass the measured fallback contract',
  );

  (visibleRadar as any).mergeBoard([dehumidifier, diet], { pruneAndSave: false });
  const visibleKeywords = visibleRadar.snapshot().board.map((item) => item.keyword);
  assert.ok(
    Array.isArray((visibleRadar.snapshot() as any).verifiedSupply),
    'snapshot must expose the complete trusted supply inventory separately from the display board',
  );
  assert.ok(
    visibleKeywords.includes(dehumidifier.keyword),
    `publishable measured fallback disappeared from the board: ${dehumidifier.keyword}`,
  );
  assert.ok(
    visibleKeywords.includes(diet.keyword),
    `natural how-to measured fallback disappeared from the board: ${diet.keyword}`,
  );

  const persistedPolicyCases: Array<[string, string]> = [
    ['\uAD6D\uBBFC\uB0B4\uC77C\uBC30\uC6C0\uCE74\uB4DC \uC2E0\uCCAD', 'education_jobs'],
    ['\uB178\uD2B8\uBD81 SSD \uAD50\uCCB4 \uBE44\uC6A9', 'it_ai'],
    ['\uC8FC\uD0DD\uCCAD\uC57D \uBB34\uC8FC\uD0DD\uAE30\uAC04 \uACC4\uC0B0', 'realestate'],
    ['\uB2E4\uC774\uC5B4\uD2B8 \uC2DD\uB2E8 \uCC28\uB9AC\uB294\uBC95', 'food_recipe'],
  ];
  for (const [keyword, category] of persistedPolicyCases) {
    const restored = (visibleRadar as any).boardItemFromPersistedRow(
      measuredMetric(keyword, {
        category,
        evidence: [
          'mobile-live-golden-radar',
          'searchad-pc-mobile-split-enriched',
          'naver-openapi-exact-phrase',
          `curated-policy:${liveGoldenPolicyKeyForDiscoveryId(category)}`,
        ],
      }),
      now.toISOString(),
      now,
    );
    assert.ok(restored, `curated persisted fixture must remain loadable: ${keyword}`);
    assert.equal(
      restored.category,
      category,
      `a persisted curated policy category must survive worker restart: ${keyword}`,
    );
  }

  const latePolicyTagRow = (visibleRadar as any).boardItemFromPersistedRow(
    measuredMetric(queuedPolicyKeyword, {
      category: 'education_jobs',
      evidence: [
        'legacy-1', 'legacy-2', 'legacy-3', 'legacy-4', 'legacy-5',
        'legacy-6', 'legacy-7', 'legacy-8', 'legacy-9',
        'curated-policy:education_jobs',
      ],
    }),
    now.toISOString(),
    now,
  );
  assert.ok(latePolicyTagRow);
  assert.equal(
    latePolicyTagRow.category,
    'education_jobs',
    'category restoration must inspect policy proof beyond the display evidence cap',
  );

  const evidenceCapRadar = createRadar();
  (evidenceCapRadar as any).mergeBoard([
    measuredMetric(queuedPolicyKeyword, { category: 'policy' }),
  ], { pruneAndSave: false });
  const staleFullEvidence = evidenceCapRadar.findMeasuredBoardItem(queuedPolicyKeyword) as any;
  staleFullEvidence.category = 'policy';
  staleFullEvidence.updatedAt = new Date(now.getTime() - 9 * 24 * 60 * 60 * 1000).toISOString();
  staleFullEvidence.evidence = [
    'legacy-1', 'legacy-2', 'legacy-3', 'legacy-4',
    'legacy-5', 'legacy-6', 'legacy-7', 'legacy-8',
  ];
  (evidenceCapRadar as any).mergeBoard([
    measuredMetric(queuedPolicyKeyword, {
      category: 'education_jobs',
      evidence: [
        'mobile-live-golden-radar',
        'searchad-pc-mobile-split-enriched',
        'mobile-live-seed-backfill',
        'naver-openapi-exact-phrase',
        'curated-policy:education_jobs',
      ],
    }),
  ], { pruneAndSave: false });
  const mergedFullEvidence = evidenceCapRadar.findMeasuredBoardItem(queuedPolicyKeyword) as any;
  assert.ok(
    mergedFullEvidence.evidence.includes('curated-policy:education_jobs'),
    'fresh curated policy proof must survive a full stale evidence cap',
  );
  const restoredFullEvidence = (evidenceCapRadar as any).boardItemFromPersistedRow(
    mergedFullEvidence,
    now.toISOString(),
    now,
  );
  assert.equal(
    restoredFullEvidence.category,
    'education_jobs',
    'fresh curated category must survive merge, persistence, and reload',
  );

  let overlayClock = now;
  const staleOverlayRadar = new MobileLiveGoldenRadar({
    notificationInbox: null,
    runOnStart: false,
    boardTarget: 120,
    categories: ['shopping_beauty'],
    getEnvConfig: () => ({}),
    enableBackfill: false,
    discover: async () => [],
    now: () => overlayClock,
  });
  (staleOverlayRadar as any).mergeBoard([dehumidifier], { pruneAndSave: false });
  const beforeOverlay = (staleOverlayRadar as any).board.get('제습기순위');
  overlayClock = new Date(now.getTime() + 9 * 24 * 60 * 60 * 1000);
  (staleOverlayRadar as any).mergeBoard([{
    ...dehumidifier,
    category: 'policy',
    source: 'persistent-keyword-cache',
    intent: 'persistent-measured-golden-cache',
    evidence: ['persistent-keyword-cache', 'measured-search-volume', 'measured-document-count'],
    pcSearchVolume: 1_000,
    mobileSearchVolume: 4_000,
    totalSearchVolume: 5_000,
    documentCount: 900,
    cpc: 999,
    documentCountSource: 'cache',
    documentCountConfidence: 'medium',
  }], { pruneAndSave: false });
  const afterOverlay = (staleOverlayRadar as any).board.get('제습기순위');
  assert.equal(afterOverlay.pcSearchVolume, beforeOverlay.pcSearchVolume);
  assert.equal(afterOverlay.mobileSearchVolume, beforeOverlay.mobileSearchVolume);
  assert.equal(afterOverlay.totalSearchVolume, beforeOverlay.totalSearchVolume);
  assert.equal(afterOverlay.documentCount, beforeOverlay.documentCount);
  assert.equal(afterOverlay.category, beforeOverlay.category);
  assert.equal(afterOverlay.updatedAt, beforeOverlay.updatedAt);
  assert.equal(
    staleOverlayRadar.snapshot().verifiedSupply?.length,
    0,
    'cache ingestion must not refresh a stale exact measurement into the seven-day gate',
  );

  const probeCalls: string[] = [];
  const retentionRadar = createRadar(async (query: string) => {
    probeCalls.push(query);
    return { ok: true, suggestions: [] };
  });
  (retentionRadar as any).mergeBoard([diet], { pruneAndSave: false });
  (retentionRadar as any).mergeBoard([{
    ...diet,
    source: 'persistent-keyword-cache',
    intent: 'persistent-measured-golden-cache',
    evidence: ['persistent-keyword-cache', 'measured-search-volume', 'measured-document-count'],
    documentCountSource: 'cache',
    documentCountConfidence: 'medium',
  }], { pruneAndSave: false });

  const overlaid = retentionRadar.findMeasuredBoardItem(diet.keyword);
  assert.ok(
    overlaid?.evidence?.includes('searchad-pc-mobile-split-enriched'),
    'persistent cache overlay must preserve stronger exact SearchAd provenance',
  );
  await (retentionRadar as any).enforceRealDemandOnBoard();
  assert.ok(
    !probeCalls.includes(diet.keyword),
    'trusted exact SearchAd demand must not be reclassified as an autocomplete ghost',
  );
  assert.ok(
    retentionRadar.findMeasuredBoardItem(diet.keyword),
    'trusted exact SearchAd row must survive a later persistent-cache overlay',
  );

  const tombstoneRadar = createRadar();
  const staleDehumidifier = {
    ...dehumidifier,
    updatedAt: new Date(now.getTime() - 9 * 24 * 60 * 60 * 1000).toISOString(),
  };
  (tombstoneRadar as any).board.set(dehumidifier.keyword, staleDehumidifier);
  assert.equal(
    (tombstoneRadar as any).queueMeasuredProbeCandidates(
      [dehumidifier.keyword],
      'shopping_beauty',
      'curated-exact-recovery',
      520,
      false,
    ),
    1,
    'a stale board row must still receive a persisted curated recovery cooldown',
  );
  (tombstoneRadar as any).updateMeasuredProbeQueueAfterMeasurement(
    [dehumidifier.keyword],
    [{
      keyword: dehumidifier.keyword,
      pcSearchVolume: 100,
      mobileSearchVolume: 400,
    }],
    [{
      keyword: dehumidifier.keyword,
      pcSearchVolume: 100,
      mobileSearchVolume: 400,
      documentCount: 100,
    }],
  );
  const completeButUnpublished = (tombstoneRadar as any).pendingMeasuredProbeQueue
    .find((item: { keyword: string }) => item.keyword === dehumidifier.keyword);
  assert.ok(
    completeButUnpublished,
    'a complete curated measurement must remain tombstoned until publication is known',
  );
  assert.equal(completeButUnpublished.attempts, 4);
  assert.equal(completeButUnpublished.misses, 0);
  assert.equal(completeButUnpublished.lastTriedAt, now.toISOString());
  assert.deepEqual(
    __liveGoldenRadarTestInternals.selectCuratedExactRecoveryCandidates(
      'shopping_beauty',
      [{ keyword: dehumidifier.keyword, policyKey: 'shopping_beauty' }],
      [staleDehumidifier as any],
      (tombstoneRadar as any).pendingMeasuredProbeQueue,
      new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000),
    ),
    [],
    'a complete-but-unpublished exact row must not spend quota again before seven days',
  );

  const queueDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-curated-queue-'));
  const queueFile = path.join(queueDir, 'probe-queue.json');
  try {
    const persistentQueueRadar = createRadar(undefined, queueFile);
    const broadCuratedAnchor = '\uC81C\uC2B5\uAE30';
    (persistentQueueRadar as any).queueMeasuredProbeCandidates(
      [broadCuratedAnchor],
      'shopping_beauty',
      'curated-exact-recovery',
      520,
      true,
    );
    (persistentQueueRadar as any).updateMeasuredProbeQueueAfterMeasurement(
      [broadCuratedAnchor],
      [{ keyword: broadCuratedAnchor, pcSearchVolume: 100, mobileSearchVolume: 400 }],
      [{
        keyword: broadCuratedAnchor,
        pcSearchVolume: 100,
        mobileSearchVolume: 400,
        documentCount: 100,
      }],
    );

    const reloadedQueueRadar = createRadar(undefined, queueFile);
    const reloadedTombstone = (reloadedQueueRadar as any).pendingMeasuredProbeQueue
      .find((item: { keyword: string }) => item.keyword === broadCuratedAnchor);
    assert.ok(
      reloadedTombstone,
      'a broad curated tombstone must survive an API/worker process restart',
    );
    assert.equal(reloadedTombstone.attempts, 4);
    assert.equal(
      (reloadedQueueRadar as any).countMeasuredProbeQueueFile(),
      1,
      'persisted queue observability must include curated cooldown tombstones',
    );
  } finally {
    fs.rmSync(queueDir, { recursive: true, force: true });
  }

  console.log('mobile live golden retention tests passed');
  process.exit(0);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
