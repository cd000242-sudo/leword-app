import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { naverBlogDocumentCountQueryKey } from '../naver-blog-api';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const fixedNow = new Date('2026-07-15T01:00:00.000Z');
const measuredAt = '2026-07-15T00:55:00.000Z';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-binding-budget-'));
const boardFile = path.join(tmpDir, 'mobile-live-golden-binding-budget-board.json');

const groups = [
  {
    category: 'policy',
    policyKey: 'policy',
    keywords: ['청년월세지원 신청방법', '근로장려금 대상조회', '문화누리카드 사용처'],
  },
  {
    category: 'finance',
    policyKey: 'finance_insurance',
    keywords: ['자동차보험 가격비교', '실손보험 청구방법', '주택담보대출 금리비교'],
  },
  {
    category: 'health',
    policyKey: 'health',
    keywords: ['임플란트 비용 비교', '건강검진 예약 방법', '치아교정 비용 비교'],
  },
  {
    category: 'education',
    policyKey: 'education_jobs',
    keywords: ['국비지원 교육 신청', '요양보호사 자격증 비용', '컴퓨터 자격증 준비 비용'],
  },
  {
    category: 'it',
    policyKey: 'it_ai',
    keywords: ['노트북 SSD 교체비용', '아이폰 배터리 교체비용', '핸드폰 데이터복구 비용'],
  },
  {
    category: 'home_life',
    policyKey: 'home_life',
    keywords: ['원룸 청소 업체 가격', '에어컨 청소 비용', '보일러 교체 비용'],
  },
  {
    category: 'travel_domestic',
    policyKey: 'travel',
    keywords: ['제주 렌터카 가격비교', '국내 여행자보험 비교'],
  },
  {
    category: 'car',
    policyKey: 'auto',
    keywords: ['자동차 배터리 교체비용', '타이어 교체 비용'],
  },
  {
    category: 'realestate',
    policyKey: 'realestate',
    keywords: ['전월세 신고 방법', '아파트 중개수수료 계산'],
  },
  {
    category: 'pet_dog',
    policyKey: 'parenting_pet',
    keywords: ['강아지 슬개골 수술비용', '고양이 건강검진 비용'],
  },
  {
    category: 'food',
    policyKey: 'food_recipe',
    keywords: ['냉장고 냄새 제거 방법', '식중독 증상 대처 방법'],
  },
  {
    category: 'shopping',
    policyKey: 'shopping_beauty',
    keywords: ['로봇청소기 가격 비교', '공기청정기 필터 가격'],
  },
] as const;

const specs = groups.flatMap((group) => group.keywords.map((keyword) => ({
  category: group.category,
  policyKey: group.policyKey,
  keyword,
})));

fs.mkdirSync(tmpDir, { recursive: true });
fs.rmSync(boardFile, { force: true });
fs.writeFileSync(boardFile, JSON.stringify({
  version: 1,
  boardUpdatedAt: fixedNow.toISOString(),
  items: specs.map((spec, index) => ({
    id: `binding-budget-${index}`,
    rank: index + 1,
    keyword: spec.keyword,
    grade: 'SSS',
    score: 98,
    pcSearchVolume: 1_000,
    mobileSearchVolume: 8_000,
    totalSearchVolume: 9_000,
    documentCount: 200,
    goldenRatio: 45,
    cpc: 220,
    category: spec.category,
    source: 'mobile-live-golden-radar',
    intent: 'Commercial',
    evidence: [
      'validated-modifier',
      `curated-policy:${spec.policyKey}`,
      'naver-openapi-broad',
    ],
    isMeasured: true,
    searchVolumeSource: 'searchad',
    searchVolumeConfidence: 'high',
    isSearchVolumeEstimated: false,
    documentCountSource: 'naver-api',
    documentCountConfidence: 'high',
    documentCountQueryMode: 'broad',
    documentCountQueryKey: naverBlogDocumentCountQueryKey(spec.keyword),
    documentCountMeasuredAt: measuredAt,
    isDocumentCountEstimated: false,
    discoveredAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
    freshness: 'live',
    isPublicPreview: false,
    publicSearchVolumeLabel: '5k-10k',
    publicDocumentCountLabel: '100-299',
    publicReason: 'unversioned regression fixture',
    // Intentionally no searchVolumeBindingVersion/searchVolumeMeasuredAt.
  })),
}), 'utf8');

function cleanup(): void {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

async function run(): Promise<void> {
  const { MobileLiveGoldenRadar } = require('../../mobile/live-golden-radar');
  const attemptedKeywords: string[] = [];
  let zeroKeyword = '';
  const radar = new MobileLiveGoldenRadar({
    runOnStart: false,
    boardFile,
    boardTarget: 60,
    publicPreviewCount: 1,
    categories: groups.map((group) => group.category),
    now: () => new Date(fixedNow),
    setTimeoutFn: () => 0,
    clearTimeoutFn: () => undefined,
    measureLiveSearchVolumeSeparate: async (_config: unknown, keywords: string[], options: any) => {
      assert(
        'binding repair forces exact SearchAd volume and never spends document-count quota',
        options?.includeDocumentCount === false && options?.forceFresh === true,
        JSON.stringify(options),
      );
      if (!zeroKeyword && keywords.length > 0) zeroKeyword = keywords[0];
      attemptedKeywords.push(...keywords);
      return keywords.map((keyword) => ({
        keyword,
        pcSearchVolume: keyword === zeroKeyword ? 0 : 1_200,
        mobileSearchVolume: keyword === zeroKeyword ? 0 : 4_800,
        totalSearchVolume: keyword === zeroKeyword ? 0 : 6_000,
        documentCount: null,
        monthlyAveCpc: 250,
        searchVolumeBindingVersion: 'keyword-keyed-v2',
        searchVolumeMeasuredAt: measuredAt,
      }));
    },
  });

  const internalBefore = [...(radar as any).board.values()];
  assert(
    'all unversioned persisted rows remain available for bounded repair',
    internalBefore.length === 30,
    internalBefore.map((item: any) => `${item.category}:${item.keyword}`).join('|'),
  );
  assert(
    'unversioned split rows are fail-closed before revalidation',
    (radar.snapshot().verifiedSupply || []).length === 0,
    JSON.stringify(radar.snapshot().verifiedSupply),
  );

  (radar as any).searchAdMeasurementBudgetRemaining = 40;
  await (radar as any).promotePendingMeasuredCacheWithSearchAdMetrics(
    { clientId: 'client', clientSecret: 'secret' },
    60,
  );

  const attemptedSet = new Set(attemptedKeywords);
  const attemptedPolicyCounts = new Map<string, number>();
  for (const spec of specs) {
    if (!attemptedSet.has(spec.keyword)) continue;
    attemptedPolicyCounts.set(spec.policyKey, (attemptedPolicyCounts.get(spec.policyKey) || 0) + 1);
  }
  assert(
    'one run revalidates at most the fixed 24-row cache-promotion budget',
    attemptedKeywords.length === 24
      && attemptedSet.size === 24
      && (radar as any).searchAdMeasurementBudgetRemaining === 16,
    JSON.stringify({ attemptedKeywords, remaining: (radar as any).searchAdMeasurementBudgetRemaining }),
  );
  assert(
    'bounded repair is balanced across all core policies',
    attemptedPolicyCounts.size === 12
      && Math.max(...attemptedPolicyCounts.values()) <= 2,
    JSON.stringify(Object.fromEntries(attemptedPolicyCounts)),
  );

  const internalAfter = [...(radar as any).board.values()];
  const zeroAfter = internalAfter.find((item: any) => item.keyword === zeroKeyword);
  assert(
    'an exact zero result cannot leave the old contaminated nonzero split behind',
    !zeroAfter
      || (
        zeroAfter.pcSearchVolume === 0
        && zeroAfter.mobileSearchVolume === 0
        && zeroAfter.totalSearchVolume === 0
        && zeroAfter.searchVolumeBindingVersion === 'keyword-keyed-v2'
        && zeroAfter.searchVolumeMeasuredAt === measuredAt
      ),
    JSON.stringify(zeroAfter),
  );
  assert(
    'positive exact revalidations carry current marker and actual measurement time',
    internalAfter.filter((item: any) => attemptedSet.has(item.keyword) && item.keyword !== zeroKeyword)
      .every((item: any) => (
        item.pcSearchVolume === 1_200
        && item.mobileSearchVolume === 4_800
        && item.totalSearchVolume === 6_000
        && item.searchVolumeBindingVersion === 'keyword-keyed-v2'
        && item.searchVolumeMeasuredAt === measuredAt
      )),
    JSON.stringify(internalAfter.filter((item: any) => attemptedSet.has(item.keyword))),
  );
  assert(
    'unattempted rows remain untrusted for the next bounded cycle',
    internalAfter.filter((item: any) => !attemptedSet.has(item.keyword)).length === 6
      && internalAfter.filter((item: any) => !attemptedSet.has(item.keyword))
        .every((item: any) => item.searchVolumeBindingVersion === undefined),
    JSON.stringify(internalAfter.filter((item: any) => !attemptedSet.has(item.keyword))),
  );

  const snapshot = radar.snapshot();
  assert(
    'zero-cleared and unattempted contaminated rows never enter verified supply',
    !(snapshot.verifiedSupply || []).some((item: any) => (
      item.keyword === zeroKeyword || !attemptedSet.has(item.keyword)
    )),
    JSON.stringify(snapshot.verifiedSupply),
  );

  const hiddenProofBoardFile = path.join(tmpDir, 'mobile-live-golden-hidden-proof-budget-board.json');
  const hiddenProofFixtures = [{
    keyword: '도수치료 실비 청구 필요서류',
    evidence: ['curated-policy:policy', 'naver-openapi-broad'],
    expected: 'unknown',
  }, {
    keyword: '청년도약계좌 중도해지 불이익',
    evidence: ['real-demand-extension', 'curated-policy:policy', 'naver-openapi-broad'],
    expected: 'stale-unknown',
  }, {
    keyword: '문화누리카드 온라인 사용처',
    evidence: ['validated-modifier', 'curated-policy:policy', 'naver-openapi-broad'],
    expected: 'trusted',
  }, {
    keyword: '프리랜서 근로장려금 지급액 조회',
    evidence: ['curated-policy:policy', 'naver-openapi-broad'],
    expected: 'real-demand',
  }] as const;
  fs.writeFileSync(hiddenProofBoardFile, JSON.stringify({
    version: 1,
    boardUpdatedAt: fixedNow.toISOString(),
    items: hiddenProofFixtures.map((fixture, index) => ({
      id: `hidden-proof-${index}`,
      rank: index + 1,
      keyword: fixture.keyword,
      grade: 'SSS',
      score: 98,
      pcSearchVolume: 1_000,
      mobileSearchVolume: 8_000,
      totalSearchVolume: 9_000,
      documentCount: 200,
      goldenRatio: 45,
      cpc: 220,
      category: 'policy',
      source: 'mobile-live-golden-radar',
      intent: 'Commercial',
      evidence: fixture.evidence,
      isMeasured: true,
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      documentCountQueryMode: 'broad',
      documentCountQueryKey: naverBlogDocumentCountQueryKey(fixture.keyword),
      documentCountMeasuredAt: measuredAt,
      isDocumentCountEstimated: false,
      discoveredAt: '2026-07-15T00:00:00.000Z',
      updatedAt: '2026-07-15T00:00:00.000Z',
      freshness: 'live',
      // Intentionally no current SearchAd binding: this is a quota-bearing repair lane.
    })),
  }), 'utf8');

  const probedForHiddenDemand: string[] = [];
  const splitMeasuredAfterHiddenGate: string[] = [];
  const realDemandKeyword = hiddenProofFixtures.find((fixture) => fixture.expected === 'real-demand')!.keyword;
  const trustedKeyword = hiddenProofFixtures.find((fixture) => fixture.expected === 'trusted')!.keyword;
  const hiddenProofRadar = new MobileLiveGoldenRadar({
    runOnStart: false,
    boardFile: hiddenProofBoardFile,
    boardTarget: 10,
    publicPreviewCount: 1,
    categories: ['policy'],
    now: () => new Date(fixedNow),
    setTimeoutFn: () => 0,
    clearTimeoutFn: () => undefined,
    realDemandProbe: async (keyword: string) => {
      probedForHiddenDemand.push(keyword);
      return keyword === realDemandKeyword
        ? { ok: true, suggestions: [`${keyword} 후기`] }
        : { ok: false, suggestions: [] };
    },
    measureLiveSearchVolumeSeparate: async (_config: unknown, keywords: string[]) => {
      splitMeasuredAfterHiddenGate.push(...keywords);
      return keywords.map((keyword) => ({
        keyword,
        pcSearchVolume: 1_200,
        mobileSearchVolume: 4_800,
        totalSearchVolume: 6_000,
        documentCount: null,
        monthlyAveCpc: 250,
        searchVolumeSource: 'searchad',
        searchVolumeConfidence: 'high',
        searchVolumeBindingVersion: 'keyword-keyed-v2',
        searchVolumeMeasuredAt: measuredAt,
        isSearchVolumeEstimated: false,
      }));
    },
  });

  (hiddenProofRadar as any).searchAdMeasurementBudgetRemaining = 10;
  await (hiddenProofRadar as any).promotePendingMeasuredCacheWithSearchAdMetrics(
    { clientId: 'client', clientSecret: 'secret' },
    10,
    10,
  );

  const measuredAfterHiddenGate = new Set(splitMeasuredAfterHiddenGate);
  assert(
    'cache split repair spends SearchAd only after current hidden-known proof',
    measuredAfterHiddenGate.size === 2
      && measuredAfterHiddenGate.has(trustedKeyword)
      && measuredAfterHiddenGate.has(realDemandKeyword)
      && (hiddenProofRadar as any).searchAdMeasurementBudgetRemaining === 8,
    JSON.stringify({
      probedForHiddenDemand,
      splitMeasuredAfterHiddenGate,
      remaining: (hiddenProofRadar as any).searchAdMeasurementBudgetRemaining,
    }),
  );
  assert(
    'stale or unknown hidden-demand assertions cannot bypass the quota gate',
    hiddenProofFixtures
      .filter((fixture) => fixture.expected === 'unknown' || fixture.expected === 'stale-unknown')
      .every((fixture) => !measuredAfterHiddenGate.has(fixture.keyword)),
    JSON.stringify(splitMeasuredAfterHiddenGate),
  );
  assert(
    'a current real-demand proof is bound into the promoted row evidence',
    [...(hiddenProofRadar as any).board.values()]
      .some((item: any) => (
        item.keyword === realDemandKeyword
        && item.evidence.includes('real-demand-extension')
        && item.searchVolumeBindingVersion === 'keyword-keyed-v2'
      )),
    JSON.stringify([...(hiddenProofRadar as any).board.values()]),
  );

  const proofTailBoardFile = path.join(tmpDir, 'mobile-live-golden-hidden-proof-tail-board.json');
  const proofTailKeywords = [
    '실업급여 구직외활동 인정 횟수',
    '프리랜서 근로장려금 지급액 조회',
    '소상공인 정책자금 직접대출 서류',
  ];
  fs.writeFileSync(proofTailBoardFile, JSON.stringify({
    version: 1,
    boardUpdatedAt: fixedNow.toISOString(),
    items: proofTailKeywords.map((keyword, index) => ({
      id: `hidden-proof-tail-${index}`,
      rank: index + 1,
      keyword,
      grade: 'SSS',
      score: 98 - index,
      pcSearchVolume: 1_000,
      mobileSearchVolume: 8_000,
      totalSearchVolume: 9_000,
      documentCount: 200,
      goldenRatio: 45,
      cpc: 220,
      category: 'policy',
      source: 'mobile-live-golden-radar',
      intent: 'Commercial',
      evidence: ['curated-policy:policy', 'naver-openapi-broad'],
      isMeasured: true,
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      documentCountQueryMode: 'broad',
      documentCountQueryKey: naverBlogDocumentCountQueryKey(keyword),
      documentCountMeasuredAt: measuredAt,
      isDocumentCountEstimated: false,
      discoveredAt: '2026-07-15T00:00:00.000Z',
      updatedAt: '2026-07-15T00:00:00.000Z',
      freshness: 'live',
    })),
  }), 'utf8');

  const tailProofProbes: string[] = [];
  const tailSplitMeasurements: string[] = [];
  const proofTailRadar = new MobileLiveGoldenRadar({
    runOnStart: false,
    boardFile: proofTailBoardFile,
    boardTarget: 10,
    publicPreviewCount: 1,
    categories: ['policy'],
    now: () => new Date(fixedNow),
    setTimeoutFn: () => 0,
    clearTimeoutFn: () => undefined,
    realDemandProbe: async (keyword: string) => {
      tailProofProbes.push(keyword);
      return tailProofProbes.length === 1
        ? { ok: false, suggestions: [] }
        : { ok: true, suggestions: [`${keyword} 후기`] };
    },
    measureLiveSearchVolumeSeparate: async (_config: unknown, keywords: string[]) => {
      tailSplitMeasurements.push(...keywords);
      return keywords.map((keyword) => ({
        keyword,
        pcSearchVolume: 1_200,
        mobileSearchVolume: 4_800,
        totalSearchVolume: 6_000,
        documentCount: null,
        monthlyAveCpc: 250,
        searchVolumeSource: 'searchad',
        searchVolumeConfidence: 'high',
        searchVolumeBindingVersion: 'keyword-keyed-v2',
        searchVolumeMeasuredAt: measuredAt,
        isSearchVolumeEstimated: false,
      }));
    },
  });

  (proofTailRadar as any).searchAdMeasurementBudgetRemaining = 1;
  await (proofTailRadar as any).promotePendingMeasuredCacheWithSearchAdMetrics(
    { clientId: 'client', clientSecret: 'secret' },
    10,
    1,
  );
  assert(
    'an unknown hidden-demand probe spends no SearchAd quota',
    tailProofProbes.length === 1
      && tailSplitMeasurements.length === 0
      && (proofTailRadar as any).searchAdMeasurementBudgetRemaining === 1,
    JSON.stringify({ tailProofProbes, tailSplitMeasurements }),
  );

  await (proofTailRadar as any).promotePendingMeasuredCacheWithSearchAdMetrics(
    { clientId: 'client', clientSecret: 'secret' },
    10,
    1,
  );
  assert(
    'unknown proof cooldown advances the next cycle to an unprobed inventory tail',
    tailProofProbes.length === 2
      && tailProofProbes[1] !== tailProofProbes[0]
      && tailSplitMeasurements.length === 1
      && tailSplitMeasurements[0] === tailProofProbes[1]
      && (proofTailRadar as any).searchAdMeasurementBudgetRemaining === 0,
    JSON.stringify({
      tailProofProbes,
      tailSplitMeasurements,
      remaining: (proofTailRadar as any).searchAdMeasurementBudgetRemaining,
    }),
  );
}

run()
  .then(() => console.log('[mobile-live-golden-binding-budget.test] passed'))
  .finally(cleanup)
  .then(
    () => process.exit(0),
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );

export {};
