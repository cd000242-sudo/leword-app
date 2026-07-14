import { MobileLiveGoldenRadar, __liveGoldenRadarTestInternals } from '../../mobile/live-golden-radar';
import { MobileNotificationInbox } from '../../mobile/notification-inbox';
import type { MobileKeywordResult } from '../../mobile/contracts';
import { markNaverBlogOpenApiQuotaBlocked } from '../naver-blog-api';
import { measureDocumentCount } from '../measure-dc';
import { setPersistent } from '../persistent-keyword-cache';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

const root = path.join(__dirname, '..', '..', '..');

function result(keyword: string, index: number): any {
  const searchVolume = 2200 + index * 100;
  const pcSearchVolume = Math.round(searchVolume * 0.22);
  return {
    keyword,
    grade: index === 0 ? 'SSS' : index % 2 === 0 ? 'SS' : 'S',
    score: index === 0 ? 91 : 76,
    searchVolume,
    pcSearchVolume,
    mobileSearchVolume: searchVolume - pcSearchVolume,
    documentCount: 120 + index * 10,
    goldenRatio: 12 + index,
    cpc: 80,
    categoryMatched: true,
    intent: 'live-golden',
    goldenReason: 'measured live fixture',
    externalSources: ['test-fixture'],
    searchVolumeSource: 'searchad',
    searchVolumeConfidence: 'high',
    isSearchVolumeEstimated: false,
    documentCountSource: 'naver-api',
    documentCountConfidence: 'high',
    isDocumentCountEstimated: false,
  };
}

function floodResult(keyword: string, index: number, profile = false): any {
  const searchVolume = 3200 + index * 80;
  const pcSearchVolume = Math.round(searchVolume * 0.24);
  return {
    keyword,
    grade: 'SSS',
    score: (profile ? 96 : 88) - index * 0.1,
    searchVolume,
    pcSearchVolume,
    mobileSearchVolume: searchVolume - pcSearchVolume,
    documentCount: 180 + index * 5,
    goldenRatio: 18 - index * 0.05,
    cpc: 90,
    categoryMatched: true,
    intent: 'live-golden',
    goldenReason: 'measured live profile flood fixture',
    externalSources: ['test-fixture'],
    searchVolumeSource: 'searchad',
    searchVolumeConfidence: 'high',
    isSearchVolumeEstimated: false,
    documentCountSource: 'naver-api',
    documentCountConfidence: 'high',
    isDocumentCountEstimated: false,
  };
}

function previewBoardItem(keyword: string, category: string, index: number): any {
  const totalSearchVolume = 2400 + index * 300;
  const pcSearchVolume = Math.round(totalSearchVolume * 0.22);
  return {
    id: `preview-${index}`,
    rank: index + 1,
    keyword,
    grade: 'SSS',
    score: 92 - index,
    pcSearchVolume,
    mobileSearchVolume: totalSearchVolume - pcSearchVolume,
    totalSearchVolume,
    documentCount: 120 + index * 20,
    goldenRatio: 15 + index,
    cpc: 80,
    category,
    source: 'persistent-measured-golden-cache',
    intent: 'measured_need',
    evidence: ['test'],
    isMeasured: true,
    searchVolumeSource: 'searchad',
    searchVolumeConfidence: 'high',
    isSearchVolumeEstimated: false,
    documentCountSource: 'naver-api',
    documentCountConfidence: 'high',
    isDocumentCountEstimated: false,
    discoveredAt: '2026-07-05T00:00:00.000Z',
    updatedAt: '2026-07-05T00:00:00.000Z',
    freshness: 'live',
    isPublicPreview: false,
    publicSearchVolumeLabel: '2k-5k',
    publicDocumentCountLabel: '100-299',
    publicReason: '실측 검색량과 문서수가 있습니다.',
  };
}

function thinProfileCount(items: Array<{ keyword: string }>): number {
  return items.filter((item) => /(프로필|인물정보|약력|나이|인스타)$/.test(item.keyword.replace(/\s+/g, ''))).length;
}

(async () => {
  const recoveryCategories = [
    'policy',
    'finance',
    'health',
    'education',
    'it',
    'home_life',
    'travel_domestic',
    'car',
    'realestate',
    'pet_dog',
    'food',
    'shopping',
  ];
  const recoveryCandidates = recoveryCategories.flatMap((category, categoryIndex) => (
    Array.from({ length: 10 }, (_, index) => ({
      ...previewBoardItem(`${category} recovery ${index}`, category, categoryIndex * 10 + index),
      pcSearchVolume: null,
      mobileSearchVolume: null,
    }))
  ));
  const recoveryCurrentBoard = Array.from({ length: 10 }, (_, index) => (
    previewBoardItem(`policy verified ${index}`, 'policy', 200 + index)
  ));
  const recoverySelection = (__liveGoldenRadarTestInternals as any)
    .selectDeficitBalancedCachePromotionCandidates(
      recoveryCandidates,
      recoveryCurrentBoard,
      40,
    );
  const recoveryCounts = new Map<string, number>();
  for (const item of recoverySelection) {
    recoveryCounts.set(item.category, (recoveryCounts.get(item.category) || 0) + 1);
  }
  assert('cache promotion spends split measurements across Phase 2 deficit categories',
    recoverySelection.length === 40
      && recoveryCounts.size >= 10
      && Math.max(...recoveryCounts.values()) <= Math.ceil(40 * 0.18),
    JSON.stringify(Object.fromEntries(recoveryCounts)));

  const compactedProbeSources = (__liveGoldenRadarTestInternals as any).mergeMeasuredProbeSources(
    'cache-derived-probe,measured-reference-sss-probe,cache-derived-probe',
    'measured-reference-sss-probe',
  );
  assert('measured probe source provenance remains atomic and bounded',
    compactedProbeSources === 'cache-derived-probe,measured-reference-sss-probe',
    compactedProbeSources);

  const previewCandidates = [
    previewBoardItem('\uC81C\uC8FC \uB80C\uD130\uCE74 \uBCF4\uD5D8 \uCC28\uC774', 'travel_domestic', 0),
    previewBoardItem('\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC \uC794\uC561\uC870\uD68C', 'policy', 1),
    previewBoardItem('\uC6D4\uB4DC\uCEF5 \uC911\uACC4 \uC77C\uC815', 'sports', 2),
    previewBoardItem('\uB3C4\uC218\uCE58\uB8CC \uBCF4\uD5D8 \uC801\uC6A9 \uBE44\uC6A9', 'health', 3),
    previewBoardItem('\uD55C\uAD6D\uC0AC \uC790\uACA9\uC99D \uC811\uC218\uC77C\uC815', 'education', 4),
    previewBoardItem('\uCCAD\uB144\uBBF8\uB798\uC801\uAE08 \uC9C0\uAE09\uC77C', 'finance', 5),
  ];
  assert(
    'public preview blocks product, direct ads, and opaque intent chains',
    __liveGoldenRadarTestInternals.isHumanVisiblePublicPreviewCandidate(previewCandidates[0])
      && !__liveGoldenRadarTestInternals.isHumanVisiblePublicPreviewCandidate(
        previewBoardItem('\uCFE0\uCFE0\uC81C\uC2B5\uAE30\uB80C\uD0C8\uAD6C\uB9E4\uCC98\uC790\uCDE8\uBC29\uC18C\uC74C', 'shopping', 10),
      )
      && !__liveGoldenRadarTestInternals.isHumanVisiblePublicPreviewCandidate(
        previewBoardItem('\uC81C\uC8FC\uB80C\uD130\uCE74\uC608\uC57D', 'travel_domestic', 11),
      )
      && !__liveGoldenRadarTestInternals.isHumanVisiblePublicPreviewCandidate(
        previewBoardItem('\uC815\uB840\uB300\uD654\uC9C0\uAE09\uC77C\uC0AC\uC6A9\uCC98', 'policy', 12),
      ),
  );
  const balancedPreview = __liveGoldenRadarTestInternals.balancePublicPreviewCandidates(previewCandidates, 5);
  const policyTravelCount = balancedPreview.filter(
    (item: any) => ['policy', 'travel'].includes(__liveGoldenRadarTestInternals.publicPreviewLane(item)),
  ).length;
  assert(
    'public preview balances policy/travel with other live domains',
    balancedPreview.length === 5 && policyTravelCount <= 2,
    balancedPreview.map((item: any) => `${__liveGoldenRadarTestInternals.publicPreviewLane(item)}:${item.keyword}`).join('|'),
  );

  assert(
    'blocks non-product event commerce tails before measurement',
    __liveGoldenRadarTestInternals.isInvalidNonProductCommerceExpansion('1229회 로또 당첨번호 최저가 구매처')
      && __liveGoldenRadarTestInternals.isInvalidNonProductCommerceExpansion('2026 광복절 대체공휴일 가격비교 후기')
      && __liveGoldenRadarTestInternals.isInvalidNonProductCommerceExpansion('2026 KBO 올스타전 티켓팅 일정 렌탈 가격비교')
      && __liveGoldenRadarTestInternals.isInvalidNonProductCommerceExpansion('송지호 바다하늘길 주차 최저가 구매처')
      && __liveGoldenRadarTestInternals.isInvalidNonProductCommerceExpansion('송지호 바다하늘길 입장료 렌탈 가격비교')
      && __liveGoldenRadarTestInternals.isInvalidNonProductCommerceExpansion('멋진 신세계 몇부작 가격비교 후기')
      && !__liveGoldenRadarTestInternals.isInvalidNonProductCommerceExpansion('삼성창문형에어컨 가격비교'),
  );
  assert(
    'non-product commerce tails are not SearchAd candidates',
    !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('2026 KBO 올스타전 티켓팅 일정 최저가 구매처', 'sports')
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('1229회 로또 당첨지역 보험 적용 비용', 'life_tips')
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('송지호 바다하늘길 주차 가격비교 후기', 'travel_domestic')
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('멋진 신세계 몇부작 최저가 구매처', 'broadcast'),
  );

  const cacheOnlyKeyword = '\uD14C\uC2A4\uD2B8 \uCE90\uC2DC \uC804\uC6A9 \uBB38\uC11C\uC218';
  setPersistent(cacheOnlyKeyword, {
    searchVolume: 1234,
    documentCount: 77,
    realCpc: 0,
    compIdx: null,
  });
  const scrapeOnlyCachedDc = await measureDocumentCount(cacheOnlyKeyword, {
    searchVolume: 1234,
    scrapeOnly: true,
    scrapeTimeoutMs: 1,
  });
  assert('document count scrapeOnly path reuses verified persistent cache before fallback',
    scrapeOnlyCachedDc.dc === 77
      && scrapeOnlyCachedDc.source === 'cache'
      && scrapeOnlyCachedDc.confidence === 'high'
      && scrapeOnlyCachedDc.isEstimated === false,
    JSON.stringify(scrapeOnlyCachedDc));

  const inbox = new MobileNotificationInbox({
    now: () => new Date('2026-06-07T09:00:00.000Z'),
  });
  let discoverCalls = 0;
  const radar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 5,
    maxCandidates: 180,
    categories: ['celebrity', 'policy'],
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
    liveSeedProvider: async () => [],
    enableBackfill: false,
    discover: async (_config, options) => {
      discoverCalls += 1;
      assert('live radar keeps candidate budget small', Number(options?.maxCandidates) <= 180);
      return [
        result('2026 흠뻑쇼 일정', 0),
        result('리센느 프로필', 1),
        result('멋진 신세계 몇부작', 2),
        result('근로장려금 지급일', 3),
        result('삼성전자 주가 전망', 4),
      ];
    },
  });

  const snapshot = await radar.runOnce();
  const notifications = inbox.snapshot(10);
  assert('live radar runs one discovery cycle', discoverCalls === 1);
  assert('live radar records successful run', snapshot.successfulRuns === 1 && snapshot.failedRuns === 0);
  assert('live radar publishes only a small batch', snapshot.publishedCount <= 4 && snapshot.publishedCount > 0);
  assert('live radar publishes live notification kind',
    notifications.items.every((item) => item.kind === 'live-golden'),
    JSON.stringify(notifications.items));
  assert('live radar exposes a deterministic next category from the approved candidate set',
    ['celebrity', 'policy'].includes(snapshot.nextCategoryId)
      && snapshot.categoryStats?.celebrity?.scans === 1,
    `${snapshot.nextCategoryId}:${JSON.stringify(snapshot.categoryStats)}`);
  assert('live radar filters thin person profile keyword',
    !snapshot.board.some((item) => item.keyword === '리센느 프로필'),
    snapshot.board.map((item) => item.keyword).join('|'));

  let catchupDiscoverCalls = 0;
  const catchupRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 3,
    boardTarget: 10,
    maxCandidates: 180,
    categories: ['policy', 'sports', 'education'],
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
    liveSeedProvider: async () => [],
    enableBackfill: false,
    discover: async () => {
      const batch = catchupDiscoverCalls + 1;
      catchupDiscoverCalls += 1;
      return [
        result(`청년미래적금 ${batch}차 신청 대상`, 0),
        result(`소상공인 환급금 ${batch}차 조회 방법`, 1),
        result(`장마 준비물 ${batch}차 체크리스트`, 2),
      ];
    },
  });
  const catchupSnapshot = await catchupRadar.runUntilTarget(4);
  assert('live radar catch-up keeps only quality rows across multiple cycles',
    catchupDiscoverCalls === 4
      && catchupSnapshot.successfulRuns === 4
      && catchupSnapshot.boardCount >= 5
      && catchupSnapshot.board.every((item) => item.pcSearchVolume !== null && item.mobileSearchVolume !== null),
    JSON.stringify({
      calls: catchupDiscoverCalls,
      successfulRuns: catchupSnapshot.successfulRuns,
      boardCount: catchupSnapshot.boardCount,
      keywords: catchupSnapshot.board.map((item) => item.keyword),
    }));

  let stalledCatchupCalls = 0;
  const stalledCatchupRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 3,
    boardTarget: 10,
    maxCandidates: 180,
    categories: ['policy'],
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
    liveSeedProvider: async () => [],
    enableBackfill: false,
    discover: async () => {
      stalledCatchupCalls += 1;
      return [];
    },
  });
  const stalledCatchupSnapshot = await stalledCatchupRadar.runUntilTarget(4);
  assert('live radar catch-up pauses after a no-growth measured cycle',
    stalledCatchupCalls === 1
      && stalledCatchupSnapshot.successfulRuns === 1
      && /no new measured publishable rows/.test(stalledCatchupSnapshot.lastMessage || ''),
    JSON.stringify({
      calls: stalledCatchupCalls,
      successfulRuns: stalledCatchupSnapshot.successfulRuns,
      boardCount: stalledCatchupSnapshot.boardCount,
      lastMessage: stalledCatchupSnapshot.lastMessage,
    }));

  const deficitRotationRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 3,
    boardTarget: 60,
    maxCandidates: 180,
    categories: ['health', 'education', 'it'],
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
    liveSeedProvider: async () => [],
    enableBackfill: true,
    autocompleteProvider: async () => [],
    searchAdSuggestionProvider: async () => [],
    measureLiveSearchVolumeSeparate: async () => [],
    measureLiveDocumentCount: async () => null,
    discover: async () => [],
  });
  const deficitRotationSnapshot = await deficitRotationRadar.runUntilTarget(3);
  const scannedDeficitCategories = Object.entries(deficitRotationSnapshot.categoryStats || {})
    .filter(([, stats]) => (stats?.scans || 0) > 0)
    .map(([category]) => category)
    .sort();
  assert('bounded catch-up rotates across untried deficit policies before global cooldown',
    deficitRotationSnapshot.totalRuns === 3
      && scannedDeficitCategories.join(',') === ['education', 'health', 'it'].sort().join(','),
    JSON.stringify({
      totalRuns: deficitRotationSnapshot.totalRuns,
      scannedDeficitCategories,
      lastMessage: deficitRotationSnapshot.lastMessage,
    }));

  const fullButWeakBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-full-but-weak-depth-test.json');
  fs.writeFileSync(fullButWeakBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-15T08:00:00.000Z',
    items: Array.from({ length: 10 }, (_, index) => ({
      keyword: `청년미래적금 ${index + 1}차 신청 대상`,
      grade: 'S',
      score: 66,
      totalSearchVolume: 800 + index * 10,
      pcSearchVolume: 160 + index,
      mobileSearchVolume: 640 + index * 9,
      documentCount: 900 + index * 10,
      goldenRatio: 0.9,
      category: 'policy',
      source: 'fixture-measured',
      evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      isDocumentCountEstimated: false,
      updatedAt: '2026-06-15T08:00:00.000Z',
      discoveredAt: '2026-06-15T08:00:00.000Z',
      isMeasured: true,
    })),
  }), 'utf8');
  let fullButWeakDiscoverCalls = 0;
  const fullButWeakRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 3,
    boardTarget: 10,
    maxCandidates: 240,
    boardFile: fullButWeakBoardFile,
    categories: ['policy'],
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
    liveSeedProvider: async () => [],
    enableBackfill: false,
    discover: async () => {
      fullButWeakDiscoverCalls += 1;
      const batch = fullButWeakDiscoverCalls;
      return [
        floodResult(`청년미래적금 ${batch}차 신청 대상`, 0),
        floodResult(`소상공인 정책자금 ${batch}차 신청 방법`, 1),
        floodResult(`육아휴직급여 ${batch}차 지급일 조회`, 2),
      ];
    },
  });
  const fullButWeakSnapshot = await fullButWeakRadar.runUntilTarget(2);
  assert('full live board keeps hunting when SSS-ready depth is below target',
    fullButWeakDiscoverCalls === 2
      && fullButWeakSnapshot.board.filter((item) => item.grade === 'SSS').length >= 3,
    JSON.stringify({
      calls: fullButWeakDiscoverCalls,
      grades: fullButWeakSnapshot.board.map((item) => `${item.keyword}:${item.grade}`),
    }));
  fs.rmSync(fullButWeakBoardFile, { force: true });

  // C2/C4 web 이식 회귀: 실측 부가필드는 board 파일 왕복에서 보존, 미지의(추정치성) 필드는 부활 금지,
  // 스냅샷은 실측 행에 순수 value gate 등급을 계산한다.
  const extraFieldsBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-measured-extra-fields-test.json');
  const extraFieldsStamp = new Date().toISOString();
  fs.writeFileSync(extraFieldsBoardFile, JSON.stringify({
    boardUpdatedAt: extraFieldsStamp,
    items: [{
      keyword: '청년미래적금 99차 신청 대상',
      grade: 'S',
      score: 66,
      totalSearchVolume: 1210,
      pcSearchVolume: 242,
      mobileSearchVolume: 968,
      documentCount: 610,
      goldenRatio: 1.98,
      category: 'policy',
      source: 'fixture-measured',
      evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      isDocumentCountEstimated: false,
      updatedAt: extraFieldsStamp,
      discoveredAt: extraFieldsStamp,
      isMeasured: true,
      vacancyReliable: true,
      vacancySlots: 3,
      vacancyAction: '지금 작성',
      briefMeasured: true,
      briefRecommendedWords: 1800,
      briefMustInclude: ['신청 대상', '지급일'],
      serpMeasured: true,
      winnable: true,
      expectedRank: 2,
      expectedMonthlyTraffic: 1200,
    }, {
      // 비율 역전(docs ≫ volume) — 실측·니즈 의도(환급일/대상)여도 board 표시 금지 회귀
      keyword: '연말정산 환급일 대상 99차 확인',
      grade: 'S',
      score: 66,
      totalSearchVolume: 450,
      pcSearchVolume: 40,
      mobileSearchVolume: 410,
      documentCount: 1870,
      goldenRatio: 0.24,
      category: 'policy',
      source: 'fixture-measured',
      evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      isDocumentCountEstimated: false,
      updatedAt: extraFieldsStamp,
      discoveredAt: extraFieldsStamp,
      isMeasured: true,
    }],
  }), 'utf8');
  const extraFieldsRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 1,
    boardTarget: 10,
    maxCandidates: 60,
    boardFile: extraFieldsBoardFile,
    categories: ['policy'],
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
    liveSeedProvider: async () => [],
    enableBackfill: false,
    discover: async () => [],
  });
  const extraFieldsSnapshot = extraFieldsRadar.snapshot();
  const extraItem = extraFieldsSnapshot.board.find((item) => item.keyword === '청년미래적금 99차 신청 대상');
  assert('C2/C4 measured extra fields survive board file round-trip',
    !!extraItem
      && extraItem.vacancyReliable === true
      && extraItem.vacancySlots === 3
      && extraItem.vacancyAction === '지금 작성'
      && extraItem.briefMeasured === true
      && extraItem.briefRecommendedWords === 1800
      && Array.isArray(extraItem.briefMustInclude)
      && extraItem.briefMustInclude.length === 2
      && extraItem.serpMeasured === true
      && extraItem.winnable === true,
    JSON.stringify(extraItem));
  assert('estimate-like unknown fields do not revive through the whitelist',
    !!extraItem && !('expectedRank' in extraItem) && !('expectedMonthlyTraffic' in extraItem),
    JSON.stringify(extraItem));
  assert('snapshot computes pure value gate grade for measured rows',
    !!extraItem
      && ['S+', 'S', 'A', 'B', 'C'].includes(String(extraItem.valueGrade))
      && typeof extraItem.valueSummary === 'string'
      && extraItem.valueSummary.length > 0,
    JSON.stringify({ valueGrade: extraItem?.valueGrade, valueSummary: extraItem?.valueSummary }));
  assert('ratio-inverted (docs >= volume) measured rows never reach the served board',
    !extraFieldsSnapshot.board.some((item) => item.keyword === '연말정산 환급일 대상 99차 확인'),
    extraFieldsSnapshot.board.map((item) => item.keyword).join('|'));
  fs.rmSync(extraFieldsBoardFile, { force: true });

  // 정치 이벤트 × 정책 수급 tail 의미충돌 자동조합('정청래의총참석지급일' 계열) 회귀:
  // SearchAd 유령 검색량으로 SSS 지표가 붙어도 발굴 후보·usable·보드 전부 차단.
  assert('political-event x benefit-tail synthetic combos are semantically mismatched',
    __liveGoldenRadarTestInternals.isSemanticallyMismatchedMeasuredProbe('정청래의총참석지급일')
      && __liveGoldenRadarTestInternals.isSemanticallyMismatchedMeasuredProbe('정청래 의총 참석 신청 방법')
      && __liveGoldenRadarTestInternals.isSemanticallyMismatchedMeasuredProbe('전당대회 지원금 사용처')
      && !__liveGoldenRadarTestInternals.isSemanticallyMismatchedMeasuredProbe('청년미래적금 지급일 조회')
      && !__liveGoldenRadarTestInternals.isSemanticallyMismatchedMeasuredProbe('근로장려금 신청 방법')
      && !__liveGoldenRadarTestInternals.isSemanticallyMismatchedMeasuredProbe('탄핵 표결 일정'));
  assert('political benefit-tail combos are not usable board keywords even with golden metrics',
    !__liveGoldenRadarTestInternals.isLiveRadarUsableKeyword('정청래의총참석지급일', 4700, 2, new Date())
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('정청래 의총 참석 지급일', 'policy'),
    'usable/measurable gates must reject');

  // 실수요 증명 게이트 회귀(승인 2026-07-09): 프로브/캐시 출신 board 행을 자동완성 실측으로
  // 검증 — 무흔적(유령 검색량) 행은 사이클에서 제거, echo/extension 흔적 행은 유지.
  const realDemandBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-real-demand-test.json');
  const realDemandCacheFile = realDemandBoardFile.replace(/\.json$/, '') + '-realdemand.json';
  fs.rmSync(realDemandBoardFile, { force: true });
  fs.rmSync(realDemandCacheFile, { force: true });
  const realDemandStamp = new Date().toISOString();
  const realDemandRow = (keyword: string, index: number) => ({
    keyword,
    grade: 'S',
    score: 70,
    totalSearchVolume: 1400 + index * 10,
    pcSearchVolume: 280 + index,
    mobileSearchVolume: 1120 + index * 9,
    documentCount: 600 + index * 10,
    goldenRatio: 2.3,
    category: 'policy',
    source: 'persistent-measured-golden-cache',
    intent: 'persistent-measured-golden-cache',
    evidence: ['persistent-keyword-cache', 'measured-search-volume'],
    searchVolumeSource: 'searchad',
    searchVolumeConfidence: 'high',
    isSearchVolumeEstimated: false,
    documentCountSource: 'naver-api',
    documentCountConfidence: 'high',
    isDocumentCountEstimated: false,
    updatedAt: realDemandStamp,
    discoveredAt: realDemandStamp,
    isMeasured: true,
  });
  fs.writeFileSync(realDemandBoardFile, JSON.stringify({
    boardUpdatedAt: realDemandStamp,
    items: [
      realDemandRow('청년미래적금 200차 신청 대상', 0),
      realDemandRow('청년미래적금 201차 필요 서류', 1),
    ],
  }), 'utf8');
  const realDemandProbeCalls: string[] = [];
  const realDemandRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 1,
    boardTarget: 10,
    maxCandidates: 60,
    boardFile: realDemandBoardFile,
    categories: ['policy'],
    getEnvConfig: () => ({ naverClientId: 'client', naverClientSecret: 'secret' }),
    liveSeedProvider: async () => [],
    enableBackfill: false,
    discover: async () => [],
    realDemandProbe: async (query: string) => {
      realDemandProbeCalls.push(query);
      if (query.includes('200차')) {
        return { ok: true, suggestions: ['청년미래적금 200차 신청 대상 조건'] };
      }
      return { ok: true, suggestions: ['청년미래적금'] };
    },
  });
  const realDemandSnapshot = await realDemandRadar.runOnce();
  assert('real-demand gate removes autocomplete-ghost cache rows and keeps proven rows',
    realDemandProbeCalls.length >= 2
      && realDemandSnapshot.board.some((item) => item.keyword === '청년미래적금 200차 신청 대상')
      && !realDemandSnapshot.board.some((item) => item.keyword === '청년미래적금 201차 필요 서류'),
    JSON.stringify({
      probes: realDemandProbeCalls,
      keywords: realDemandSnapshot.board.map((item) => item.keyword),
      lastMessage: realDemandSnapshot.lastMessage,
    }));
  assert('real-demand verdicts persist next to the board file',
    fs.existsSync(realDemandCacheFile));
  fs.rmSync(realDemandBoardFile, { force: true });
  fs.rmSync(realDemandCacheFile, { force: true });

  // 실시간 급등 레인 회귀(승인 2026-07-09): 트렌딩 헤드 → 자동완성 실수요 확장 → 실측 →
  // 기회지수 게이트 → lane 태깅. 정보형 게이트(프로필/lookup/50만 상한)가 급등 상품을 죽이지
  // 않고, 기회지수 미달(비율<10)·저수요(sv<3000) 후보는 레인에 오르지 못한다.
  assert('traffic-surge gate accepts competitor-class rows and rejects weak ones',
    __liveGoldenRadarTestInternals.isTrafficSurgeBoardMetric({
      keyword: '김부장 기본정보', lane: 'traffic-surge',
      totalSearchVolume: 1469920, documentCount: 5189,
      isSearchVolumeEstimated: false, isDocumentCountEstimated: false,
    }, new Date())
      && __liveGoldenRadarTestInternals.isTrafficSurgeBoardMetric({
        keyword: '노시환 하지원 열애설', lane: 'traffic-surge',
        totalSearchVolume: 24430, documentCount: 129,
        isSearchVolumeEstimated: false, isDocumentCountEstimated: false,
      }, new Date())
      && !__liveGoldenRadarTestInternals.isTrafficSurgeBoardMetric({
        keyword: '기회지수 미달 키워드', lane: 'traffic-surge',
        totalSearchVolume: 24000, documentCount: 12000,
        isSearchVolumeEstimated: false, isDocumentCountEstimated: false,
      }, new Date())
      && !__liveGoldenRadarTestInternals.isTrafficSurgeBoardMetric({
        keyword: '연예인 자살 소식', lane: 'traffic-surge',
        totalSearchVolume: 90000, documentCount: 100,
        isSearchVolumeEstimated: false, isDocumentCountEstimated: false,
      }, new Date())
      && !__liveGoldenRadarTestInternals.isTrafficSurgeBoardMetric({
        keyword: '김부장 기본정보',
        totalSearchVolume: 1469920, documentCount: 5189,
        isSearchVolumeEstimated: false, isDocumentCountEstimated: false,
      }, new Date()),
    'surge gate contract');

  const surgeBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-surge-test.json');
  fs.rmSync(surgeBoardFile, { force: true });
  fs.rmSync(surgeBoardFile.replace(/\.json$/, '') + '-ingest.json', { force: true });
  fs.rmSync(surgeBoardFile.replace(/\.json$/, '') + '-realdemand.json', { force: true });
  fs.rmSync(surgeBoardFile.replace(/\.json$/, '') + '-surge-seen.json', { force: true });
  let surgeCycle = 1;
  const surgeProbeQueries: string[] = [];
  const surgeMeasured = new Map([
    ['김부장 기본정보', { pc: 293984, mobile: 1175936, dc: 5189 }],
    ['김부장 등장인물', { pc: 204480, mobile: 817920, dc: 7510 }],
    ['김부장 시청률', { pc: 800, mobile: 1400, dc: 900 }],
    ['김부장 결말 해석', { pc: 24000, mobile: 96000, dc: 640 }],
    ['김부장 결말 해석 원작 차이', { pc: 3000, mobile: 12000, dc: 55 }],
  ]);
  const surgeRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 1,
    boardTarget: 10,
    maxCandidates: 60,
    boardFile: surgeBoardFile,
    categories: ['policy'],
    getEnvConfig: () => ({ naverClientId: 'client', naverClientSecret: 'secret' }),
    liveSeedProvider: async () => ['김부장'],
    enableBackfill: false,
    discover: async () => [],
    realDemandProbe: async (query: string) => {
      surgeProbeQueries.push(query);
      if (query === '김부장') {
        return surgeCycle === 1
          ? { ok: true, suggestions: ['김부장 기본정보', '김부장 등장인물', '김부장 시청률'] }
          : { ok: true, suggestions: ['김부장 기본정보', '김부장 등장인물', '김부장 시청률', '김부장 결말 해석'] };
      }
      if (query === '김부장 결말 해석') {
        return { ok: true, suggestions: ['김부장 결말 해석 원작 차이'] };
      }
      return { ok: true, suggestions: [query] };
    },
    measureLiveSearchVolumeSeparate: (async (_config: unknown, keywords: string[]) => (
      keywords
        .filter((keyword) => surgeMeasured.has(keyword))
        .map((keyword) => {
          const m = surgeMeasured.get(keyword)!;
          return {
            keyword,
            pcSearchVolume: m.pc,
            mobileSearchVolume: m.mobile,
            documentCount: m.dc,
            competition: null,
            monthlyAveCpc: null,
          };
        })
    )) as never,
  });
  const surgeSnapshot = await surgeRadar.runOnce();
  const surgeRows = surgeSnapshot.board.filter((item) => item.lane === 'traffic-surge');
  assert('traffic-surge lane reaches the board with real-user phrasings and survives info-lane gates',
    surgeRows.some((item) => item.keyword === '김부장 기본정보' && item.grade !== 'C')
      && surgeRows.some((item) => item.keyword === '김부장 등장인물')
      && !surgeSnapshot.board.some((item) => item.keyword === '김부장 시청률'),
    JSON.stringify({
      lastMessage: surgeSnapshot.lastMessage,
      rows: surgeSnapshot.board.map((item) => `${item.keyword}:${item.lane || ''}:${item.grade}:${item.goldenRatio}`),
    }));
  // 콜드스타트: 첫 사이클은 기준선 수집만 — 신규 진입 태그가 없어야 한다.
  assert('surge cold-start cycle records a baseline without new-entry tags',
    surgeRows.every((item) => item.surgeNewEntry !== true),
    JSON.stringify(surgeRows.map((item) => `${item.keyword}:${item.surgeNewEntry || false}`)));

  // 2사이클: '김부장 결말 해석'이 자동완성에 신규 진입 → fresh 감지 → 2차 확장까지 수확 + 🆕 태깅.
  surgeCycle = 2;
  const surgeSnapshot2 = await surgeRadar.runOnce();
  const surgeRows2 = surgeSnapshot2.board.filter((item) => item.lane === 'traffic-surge');
  assert('newly emerged autocomplete suggestions are detected, second-level expanded, and tagged',
    surgeRows2.some((item) => item.keyword === '김부장 결말 해석' && item.surgeNewEntry === true)
      && surgeRows2.some((item) => item.keyword === '김부장 결말 해석 원작 차이' && item.surgeNewEntry === true)
      && surgeRows2.some((item) => item.keyword === '김부장 기본정보' && item.surgeNewEntry !== true)
      && surgeProbeQueries.includes('김부장 결말 해석'),
    JSON.stringify({
      probes: surgeProbeQueries,
      rows: surgeRows2.map((item) => `${item.keyword}:${item.surgeNewEntry || false}`),
    }));

  const surgeReloadRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 1,
    boardTarget: 10,
    maxCandidates: 60,
    boardFile: surgeBoardFile,
    refreshBoardFileOnSnapshot: true,
    categories: ['policy'],
    getEnvConfig: () => ({ naverClientId: 'client', naverClientSecret: 'secret' }),
    liveSeedProvider: async () => [],
    enableBackfill: false,
    discover: async () => [],
  });
  assert('traffic-surge rows survive the board file round-trip with lane and new-entry tags',
    surgeReloadRadar.snapshot().board.some((item) => item.lane === 'traffic-surge' && item.keyword === '김부장 기본정보')
      && surgeReloadRadar.snapshot().board.some((item) => item.keyword === '김부장 결말 해석' && item.surgeNewEntry === true),
    surgeReloadRadar.snapshot().board.map((item) => `${item.keyword}:${item.lane || ''}:${item.surgeNewEntry || false}`).join('|'));
  fs.rmSync(surgeBoardFile, { force: true });
  fs.rmSync(surgeBoardFile.replace(/\.json$/, '') + '-realdemand.json', { force: true });
  fs.rmSync(surgeBoardFile.replace(/\.json$/, '') + '-surge-seen.json', { force: true });

  // ingest 경로 회귀: 데스크톱 push → inbox 파일(쓰기 소유 분리) → read-only 스냅샷 병합.
  // 추정 플래그 행은 거부, 미지의(추정치성) 필드는 부활 금지, board 파일은 워커 소유라 미작성.
  const ingestBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-ingest-board-test.json');
  const ingestInboxFile = ingestBoardFile.replace(/\.json$/, '') + '-ingest.json';
  fs.rmSync(ingestBoardFile, { force: true });
  fs.rmSync(ingestInboxFile, { force: true });
  const ingestWriter = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 1,
    boardTarget: 10,
    maxCandidates: 60,
    boardFile: ingestBoardFile,
    categories: ['policy'],
    getEnvConfig: () => ({ naverClientId: 'client', naverClientSecret: 'secret' }),
    liveSeedProvider: async () => [],
    enableBackfill: false,
    discover: async () => [],
  });
  const ingestResult = ingestWriter.ingestBoard([
    {
      keyword: '청년미래적금 100차 신청 대상',
      grade: 'S',
      score: 70,
      pcSearchVolume: 320,
      mobileSearchVolume: 1080,
      totalSearchVolume: 1400,
      documentCount: 700,
      goldenRatio: 2,
      category: 'policy',
      intent: 'live-golden',
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      isDocumentCountEstimated: false,
      isMeasured: true,
      serpMeasured: true,
      winnable: true,
      vacancyReliable: true,
      vacancySlots: 2,
      expectedRank: 1,
    },
    {
      keyword: '소상공인 정책자금 101차 신청 방법',
      grade: 'S',
      score: 70,
      pcSearchVolume: 300,
      mobileSearchVolume: 900,
      totalSearchVolume: 1200,
      documentCount: 600,
      searchVolumeSource: 'searchad',
      isSearchVolumeEstimated: true,
      documentCountSource: 'naver-api',
      isDocumentCountEstimated: false,
    },
    { keyword: '' },
  ]);
  assert('ingest accepts only measured non-estimated rows',
    ingestResult.received === 3 && ingestResult.accepted === 1 && ingestResult.persisted === true,
    JSON.stringify(ingestResult));
  assert('ingest writes inbox file, not the worker-owned board file',
    fs.existsSync(ingestInboxFile) && !fs.existsSync(ingestBoardFile));

  const ingestReader = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 1,
    boardTarget: 10,
    maxCandidates: 60,
    boardFile: ingestBoardFile,
    refreshBoardFileOnSnapshot: true,
    categories: ['policy'],
    getEnvConfig: () => ({ naverClientId: 'client', naverClientSecret: 'secret' }),
    liveSeedProvider: async () => [],
    enableBackfill: false,
    discover: async () => [],
  });
  const ingestReaderSnapshot = ingestReader.snapshot();
  const ingestedItem = ingestReaderSnapshot.board.find((item) => item.keyword === '청년미래적금 100차 신청 대상');
  assert('ingested row reaches read-only snapshot through inbox merge with measured extras',
    !!ingestedItem
      && ingestedItem.serpMeasured === true
      && ingestedItem.winnable === true
      && ingestedItem.vacancyReliable === true
      && ingestedItem.vacancySlots === 2,
    JSON.stringify({
      boardCount: ingestReaderSnapshot.boardCount,
      keywords: ingestReaderSnapshot.board.map((item) => item.keyword),
    }));
  assert('ingest does not revive unknown estimate-like fields',
    !!ingestedItem && !('expectedRank' in ingestedItem),
    JSON.stringify(ingestedItem));
  fs.rmSync(ingestInboxFile, { force: true });

  const sssShortDepthBudgetFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-sss-short-depth-budget-test.json');
  fs.writeFileSync(sssShortDepthBudgetFile, JSON.stringify({
    boardUpdatedAt: '2026-06-15T08:00:00.000Z',
    items: Array.from({ length: 120 }, (_, index) => ({
      keyword: `정책지원금 ${index + 1}차 조회`,
      grade: 'S',
      score: 66,
      totalSearchVolume: 900 + index,
      pcSearchVolume: 180,
      mobileSearchVolume: 720 + index,
      documentCount: 1400 + index,
      goldenRatio: 0.65,
      category: 'policy',
      source: 'fixture-measured',
      evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      isDocumentCountEstimated: false,
      updatedAt: '2026-06-15T08:00:00.000Z',
      discoveredAt: '2026-06-15T08:00:00.000Z',
      isMeasured: true,
    })),
  }), 'utf8');
  let sssShortDepthOptions: any;
  const sssShortDepthRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 30,
    boardTarget: 120,
    maxCandidates: 7200,
    boardFile: sssShortDepthBudgetFile,
    categories: ['policy'],
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
    liveSeedProvider: async () => [],
    enableBackfill: false,
    discover: async (_config, options) => {
      sssShortDepthOptions = options;
      return [];
    },
  });
  await sssShortDepthRadar.runOnce();
  assert('SSS-short 120-board keeps depth ranking but hard-caps quota-spending direct measurement',
    Number(sssShortDepthOptions?.maxCandidates) > 0
      && Number(sssShortDepthOptions?.maxCandidates) <= 120
      && Number(sssShortDepthOptions?.limit) >= 160
      && sssShortDepthOptions?.includeSearchAdSuggestions === false
      && Number(sssShortDepthOptions?.suggestionSeedLimit) >= 8
      && Number(sssShortDepthOptions?.suggestionSeedLimit) <= 16
      && Number(sssShortDepthOptions?.suggestionsPerSeed) >= 12
      && Number(sssShortDepthOptions?.suggestionsPerSeed) <= 30,
    JSON.stringify(sssShortDepthOptions));
  fs.rmSync(sssShortDepthBudgetFile, { force: true });

  let backfillCatchupDirectCalls = 0;
  let backfillCatchupVolumeCalls = 0;
  const backfillCatchupRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 8,
    boardTarget: 30,
    maxCandidates: 260,
    categories: ['policy'],
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
    liveSeedProvider: async () => [
      '\uC18C\uC0C1\uACF5\uC778 \uD2B9\uB840\uBCF4\uC99D \uC2E0\uCCAD',
    ],
    enableBackfill: true,
    autocompleteProvider: async () => [],
    measureLiveSearchVolumeSeparate: async () => {
      backfillCatchupVolumeCalls += 1;
      return [
        {
          keyword: '\uC18C\uC0C1\uACF5\uC778 \uD2B9\uB840\uBCF4\uC99D \uC2E0\uCCAD \uBC29\uBC95',
          pcSearchVolume: 2400,
          mobileSearchVolume: 8600,
          documentCount: 420,
          competition: 'LOW',
          monthlyAveCpc: 120,
          searchVolumeSource: 'searchad',
          searchVolumeConfidence: 'high',
          isSearchVolumeEstimated: false,
          documentCountSource: 'scrape',
          documentCountConfidence: 'high',
          isDocumentCountEstimated: false,
        },
      ];
    },
    measureLiveDocumentCount: async () => ({
      dc: 420,
      source: 'scrape',
      confidence: 'high',
      isEstimated: false,
    }),
    discover: async () => {
      backfillCatchupDirectCalls += 1;
      return [result('\uCCAD\uB144\uBBF8\uB798\uC801\uAE08 \uC2E0\uCCAD \uB300\uC0C1', 0)];
    },
  });
  const backfillCatchupSnapshot = await backfillCatchupRadar.runOnce();
  assert('live radar catch-up publishes measured backfill without opening a second direct SearchAd lane',
    backfillCatchupVolumeCalls > 0
      && backfillCatchupDirectCalls === 0
      && backfillCatchupSnapshot.successfulRuns === 1
      && backfillCatchupSnapshot.boardCount > 0,
    JSON.stringify({
      volumeCalls: backfillCatchupVolumeCalls,
      directCalls: backfillCatchupDirectCalls,
      boardCount: backfillCatchupSnapshot.boardCount,
      lastMessage: backfillCatchupSnapshot.lastMessage,
    }));

  let autocompleteBackfillVolumeCalls = 0;
  const autocompleteMeasuredKeywords: string[] = [];
  const autocompleteBackfillRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 6,
    boardTarget: 20,
    maxCandidates: 220,
    categories: ['policy'],
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
    liveSeedProvider: async () => [
      '\uB18D\uC2DD\uD488\uBC14\uC6B0\uCC98 \uC2E0\uCCAD',
    ],
    enableBackfill: true,
    autocompleteProvider: async () => [
      '\uB18D\uC2DD\uD488\uBC14\uC6B0\uCC98 \uC2E0\uCCAD \uB300\uC0C1',
      '\uB18D\uC2DD\uD488\uBC14\uC6B0\uCC98 \uC0AC\uC6A9\uCC98',
      '1228\uD68C \uB85C\uB610 \uB2F9\uCCA8\uBC88\uD638',
    ],
    measureLiveSearchVolumeSeparate: async (_config, keywords) => {
      autocompleteBackfillVolumeCalls += 1;
      autocompleteMeasuredKeywords.push(...keywords);
      return keywords
        .filter((keyword) => keyword.includes('\uB18D\uC2DD\uD488\uBC14\uC6B0\uCC98'))
        .map((keyword, index) => ({
          keyword,
          pcSearchVolume: 1400 + index * 200,
          mobileSearchVolume: 5200 + index * 300,
          documentCount: 460 + index * 30,
          competition: 'LOW',
          monthlyAveCpc: 120,
          searchVolumeSource: 'searchad',
          searchVolumeConfidence: 'high',
          isSearchVolumeEstimated: false,
          documentCountSource: 'scrape',
          documentCountConfidence: 'high',
          isDocumentCountEstimated: false,
        }));
    },
    measureLiveDocumentCount: async () => ({
      dc: 460,
      source: 'scrape',
      confidence: 'high',
      isEstimated: false,
    }),
    discover: async () => [],
  });
  const autocompleteBackfillSnapshot = await autocompleteBackfillRadar.runOnce();
  assert('live radar measures measured policy need longtails instead of displaying raw issue seeds',
    autocompleteBackfillVolumeCalls > 0
      && autocompleteMeasuredKeywords.some((keyword) => keyword.replace(/\s+/g, '').includes('\uB18D\uC2DD\uD488\uBC14\uC6B0\uCC98\uC2E0\uCCAD'))
      && autocompleteBackfillSnapshot.board.some((item) => item.keyword.replace(/\s+/g, '').includes('\uB18D\uC2DD\uD488\uBC14\uC6B0\uCC98\uC2E0\uCCAD'))
      && !autocompleteMeasuredKeywords.some((keyword) => keyword.includes('\uB85C\uB610')),
    JSON.stringify({
      measured: autocompleteMeasuredKeywords.slice(0, 30),
      board: autocompleteBackfillSnapshot.board.map((item) => item.keyword),
    }));

  const profileFloodRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 15,
    boardTarget: 30,
    publicPreviewCount: 5,
    categories: ['celeb'],
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
    liveSeedProvider: async () => [],
    enableBackfill: false,
    discover: async () => [
      '전영현 프로필',
      '양의지 프로필',
      '김한희 프로필',
      '정성호 프로필',
      '백진경 프로필',
      '강훈식 프로필',
      '리센느 프로필',
      '성리 프로필',
    ].map((keyword, index) => floodResult(keyword, index, true)).concat([
      '2027 6모 등급컷',
      '1227회 로또 당첨번호',
      '1228회 로또 당첨번호',
      '근로장려금 지급일',
      'KBO 올스타전 중계',
      '멋진 신세계 몇부작',
      '청년 지원금 신청',
      '삼성전자 주가 전망',
      '임영웅 콘서트 예매 일정',
      '부산 축제 주차 위치',
      '모의고사 답지 발표',
    ].map((keyword, index) => floodResult(keyword, index + 20))),
  });
  const floodSnapshot = await profileFloodRadar.runOnce();
  assert('live golden board rejects thin profile and lottery intent',
    thinProfileCount(floodSnapshot.board.slice(0, 30)) === 0
      && !floodSnapshot.board.some((item) => /1227|1228|濡쒕삉/.test(item.keyword))
      && floodSnapshot.board.length > 0,
    floodSnapshot.board.map((item) => `${item.rank}:${item.keyword}`).join('|'));
  const lottoGuardNow = new Date('2026-06-14T00:00:00+09:00');
  assert('live temporal guard keeps only the current lotto round and rejects exam answer snippets',
    __liveGoldenRadarTestInternals.currentLottoRound(lottoGuardNow) === 1228
      && __liveGoldenRadarTestInternals.isStaleOrFutureLiveKeyword('1227회 로또 당첨번호', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isStaleOrFutureLiveKeyword('1228회 로또 당첨번호', lottoGuardNow)
      && __liveGoldenRadarTestInternals.isStaleOrFutureLiveKeyword('2027 6모 등급컷', lottoGuardNow));
  assert('public live golden preview exposes no thin profile intent',
    thinProfileCount(floodSnapshot.publicPreview) === 0,
    floodSnapshot.publicPreview.map((item) => item.keyword).join('|'));

  const profileAliasBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-profile-alias-test.json');
  fs.writeFileSync(profileAliasBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-13T08:40:00.000Z',
    items: [
      ['전영현 프로필', 'SSS', 98, 18000, 120, 150, 'celeb'],
      ['양의지 프로필', 'SSS', 97, 15000, 140, 107, 'sports'],
      ['김한희 프로필 가족', 'SSS', 96, 12000, 160, 75, 'celeb'],
      ['정성호 나이 학력', 'SSS', 95, 11000, 180, 61, 'celeb'],
      ['백진경 인물정보', 'SSS', 94, 9000, 200, 45, 'celeb'],
      ['2026 흠뻑쇼 일정', 'SS', 86, 7000, 900, 7.7, 'music'],
      ['KBO 올스타전 예매 일정', 'SS', 84, 6200, 880, 7, 'sports'],
      ['근로장려금 지급일 조회', 'SS', 82, 5400, 760, 7.1, 'policy'],
    ].map(([keyword, grade, score, totalSearchVolume, documentCount, goldenRatio, category]) => ({
      keyword,
      grade,
      score,
      totalSearchVolume,
      documentCount,
      goldenRatio,
      category,
      updatedAt: '2026-06-13T08:40:00.000Z',
      discoveredAt: '2026-06-13T08:40:00.000Z',
      isMeasured: true,
    })),
  }), 'utf8');
  const profileAliasRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: profileAliasBoardFile,
    publicPreviewCount: 5,
    now: () => new Date('2026-06-13T09:00:00.000Z'),
  });
  const profileAliasSnapshot = profileAliasRadar.snapshot();
  const profileTerms = ['\uD504\uB85C\uD544', '\uB098\uC774', '\uD559\uB825', '\uACE0\uD5A5', '\uC778\uC2A4\uD0C0'];
  assert('stored live golden board purges profile and keeps only measured need rows',
    profileAliasSnapshot.board.every((item) => !profileTerms.some((term) => item.keyword.includes(term)))
      && profileAliasSnapshot.board.every((item) => item.isMeasured === true && item.totalSearchVolume !== null && item.documentCount !== null)
      && profileAliasSnapshot.publicPreview.every((item) => !profileTerms.some((term) => item.keyword.includes(term))),
    profileAliasSnapshot.board.map((item) => `${item.rank}:${item.keyword}`).join('|'));
  fs.rmSync(profileAliasBoardFile, { force: true });

  let capturedLiveSeeds: string[] = [];
  const seedCleaningRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 4,
    categories: ['celeb'],
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
    liveSeedProvider: async () => [
      '이재명·멜로니 악수 [up]',
      '쥬얼리, 불화설 끝 20년만에 완전체.. 조민아까지 눈물 [스타이슈]김미화 기자 ・ 2026.06.12 ・ 23:23',
      '멋진 신세계에 빠진다',
      '서건창 끝내기 안타',
    ],
    enableBackfill: false,
    discover: async (_config, options) => {
      capturedLiveSeeds = Array.isArray(options?.liveSeeds) ? options.liveSeeds : [];
      return [result('이재명 멜로니 악수', 0), result('서건창 끝내기 안타', 1)];
    },
  });
  await seedCleaningRadar.runOnce();
  assert('live radar cleans portal/news seeds before measuring',
    capturedLiveSeeds.every((seed) => seed.length <= 34 && !/[·\[\]]/.test(seed) && !seed.includes('기자') && !seed.includes('빠진다'))
      && !capturedLiveSeeds.some((seed) => /악수|안타|로또|프로필/.test(seed)),
    capturedLiveSeeds.join('|'));

  let capturedHeadlineSeeds: string[] = [];
  const headlineCleaningRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 4,
    categories: ['music'],
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
    liveSeedProvider: async () => [
      '\uBC29\uD0C4\uC18C\uB144\uB2E8, 75\uBD84 \uC9C0\uC5F0 \uC0AC\uACFC',
      '\uBCF4\uC774\uB125\uC2A4\uD2B8\uB3C4\uC5B4, \uCCAB \uC815\uADDC\uB85C 4\uC5F0\uC18D \uBC00\uB9AC\uC5B8\uC140\uB9C1',
      '\uC815\uBABD\uADDC \uD68C\uC7A5 \uBC15\uC218\uC640 \uC120\uC218\uB4E4',
      '\uBC15\uD56D\uC11C \uB4F1\uD310.. 2002\uB144 \uC6D4\uB4DC\uCEF5',
      '\uC624!!! \uC5ED\uC804\uACE8',
      '2026 KBO \uC62C\uC2A4\uD0C0\uC804 \uC608\uB9E4',
    ],
    enableBackfill: false,
    discover: async (_config, options) => {
      capturedHeadlineSeeds = Array.isArray(options?.liveSeeds) ? options.liveSeeds : [];
      return [result('2026 KBO \uC62C\uC2A4\uD0C0\uC804 \uC608\uB9E4', 0)];
    },
  });
  await headlineCleaningRadar.runOnce();
  assert('live radar removes raw news sentences and low-value entertainment/sports seeds',
    capturedHeadlineSeeds.every((seed) => !/\uC9C0\uC5F0|\uC0AC\uACFC|\uBC00\uB9AC\uC5B8\uC140\uB9C1|\uBC15\uC218|\uC120\uC218\uB4E4|\.\.|!!!|KBO/.test(seed))
      && capturedHeadlineSeeds.every((seed) => !/\uBC29\uD0C4\uC18C\uB144\uB2E8|\uBCF4\uC774\uB125\uC2A4\uD2B8\uB3C4\uC5B4/.test(seed)),
    capturedHeadlineSeeds.join('|'));

  const liveIssueBackfillCandidates = __liveGoldenRadarTestInternals.buildBackfillCandidates('all', [
    'KIA 3연패 탈출! [up]',
    '1228회 로또 1등 당첨 11명 [new]',
    '파키스탄 총리 24시간 내 합의 예상 [new]',
  ], 80);
  assert('low-value live issue backfill does not invent fake need tails',
    !liveIssueBackfillCandidates.some((keyword) => ['KIA', '1228', '濡쒕삉', '?뚰궎?ㅽ깂'].some((part) => keyword.includes(part))),
    liveIssueBackfillCandidates.slice(0, 30).join('|'));
  const dateAwareCandidates = __liveGoldenRadarTestInternals.buildBackfillCandidates('all', [
    '로또',
    '1227회 로또 당첨번호',
    '2027 6모 등급컷',
    '장마 준비물',
  ], 120, lottoGuardNow);
  const dateHints = __liveGoldenRadarTestInternals.getLiveDateHints(lottoGuardNow);
  assert('live candidate inference rejects lottery/exam lookup and keeps actionable seasonal intent',
    dateHints.length > 0
      && dateAwareCandidates.some((keyword) => keyword.includes('\uC7A5\uB9C8') && keyword.includes('\uC900\uBE44\uBB3C'))
      && !dateAwareCandidates.some((keyword) => /1227|1228|\uB85C\uB610|2027/.test(keyword)),
    dateAwareCandidates.slice(0, 40).join('|'));
  assert('live board rejects broad benefit product names until a concrete publish intent is attached',
    !__liveGoldenRadarTestInternals.isLiveRadarUsableKeyword('\uB18D\uC2DD\uD488\uBC14\uC6B0\uCC98', 51850, 8934, lottoGuardNow)
      && __liveGoldenRadarTestInternals.isLiveRadarUsableKeyword('\uB18D\uC2DD\uD488\uBC14\uC6B0\uCC98 \uC2E0\uCCAD \uB300\uC0C1', 12000, 640, lottoGuardNow)
      && __liveGoldenRadarTestInternals.isLiveRadarUsableKeyword('\uB18D\uC2DD\uD488\uBC14\uC6B0\uCC98 \uC9C0\uAE09\uC77C \uC870\uD68C', 8300, 520, lottoGuardNow));
  const cacheDerivedCalculatorCandidates = __liveGoldenRadarTestInternals.buildCacheDerivedCompoundNeedSeeds(
    '\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30',
    'policy',
    30,
  );
  const cacheDerivedPolicyCalculatorCandidates = __liveGoldenRadarTestInternals.buildCacheDerivedCompoundNeedSeeds(
    '\uAE30\uCD08\uC5F0\uAE08\uC218\uAE09\uC790\uACA9\uBAA8\uC758\uACC4\uC0B0\uAE30',
    'policy',
    30,
  );
  assert('cache-derived broad calculator seeds expand into writer-ready measured probes',
    cacheDerivedCalculatorCandidates.some((keyword) => keyword.includes('\uD504\uB9AC\uB79C\uC11C') && keyword.includes('\uC2E4\uC218\uB839\uC561'))
      && cacheDerivedCalculatorCandidates.some((keyword) => keyword.includes('\uC54C\uBC14') && keyword.includes('\uC790\uB3D9\uACC4\uC0B0'))
      && cacheDerivedCalculatorCandidates.some((keyword) => keyword.includes('\uC694\uC728\uD45C'))
      && !cacheDerivedCalculatorCandidates.some((keyword) => keyword.includes('\uAC1C\uC778\uC0AC\uC5C5\uC790') && keyword.includes('\uACF5\uC81C\uD56D\uBAA9'))
      && !cacheDerivedCalculatorCandidates.some((keyword) => keyword.includes('\uD6C4\uAE30')),
    cacheDerivedCalculatorCandidates.join('|'));
  assert('cache-derived policy calculators do not generate payroll or insurance dead-end probes',
    cacheDerivedPolicyCalculatorCandidates.length === 0
      || cacheDerivedPolicyCalculatorCandidates.every((keyword) => !/(?:\uD504\uB9AC\uB79C\uC11C|4\uB300\uBCF4\uD5D8|\uC0AC\uB300\uBCF4\uD5D8|\uD1F4\uC9C1\uAE08|\uC8FC\uD734\uC218\uB2F9|3\.3|\uC138\uD6C4)/u.test(keyword)),
    cacheDerivedPolicyCalculatorCandidates.join('|'));
  const cacheDerivedCommerceCandidates = __liveGoldenRadarTestInternals.buildCacheDerivedCompoundNeedSeeds(
    '\uC704\uB2C9\uC2A4\uCC3D\uBB38\uD615\uC5D0\uC5B4\uCEE8',
    'electronics',
    30,
  );
  assert('cache-derived commerce seeds expand into buyer-decision probes',
    cacheDerivedCommerceCandidates.some((keyword) => keyword.includes('\uCD5C\uC800\uAC00') && keyword.includes('\uBE44\uAD50'))
      && cacheDerivedCommerceCandidates.some((keyword) => keyword.includes('\uD560\uC778') && keyword.includes('\uCFE0\uD3F0'))
      && cacheDerivedCommerceCandidates.some((keyword) => keyword.includes('\uAD6C\uB9E4\uCC98') && keyword.includes('\uCD94\uCC9C')),
    cacheDerivedCommerceCandidates.join('|'));
  const cacheDerivedTravelCandidates = __liveGoldenRadarTestInternals.buildCacheDerivedCompoundNeedSeeds(
    '\uC1A1\uC9C0\uD638 \uBC14\uB2E4\uD558\uB298\uAE38',
    'travel_domestic',
    60,
  );
  assert('cache-derived travel heads expand into visit-ready longtails',
    cacheDerivedTravelCandidates.some((keyword) => keyword.includes('\uC785\uC7A5\uB8CC'))
      && cacheDerivedTravelCandidates.some((keyword) => keyword.includes('\uC8FC\uCC28'))
      && cacheDerivedTravelCandidates.some((keyword) => keyword.includes('\uC608\uC57D'))
      && cacheDerivedTravelCandidates.some((keyword) => keyword.includes('\uC544\uC774\uB791') && keyword.includes('\uCF54\uC2A4')),
    cacheDerivedTravelCandidates.join('|'));
  const cacheDerivedPolicyAudienceCandidates = __liveGoldenRadarTestInternals.buildCacheDerivedCompoundNeedSeeds(
    '\uADFC\uB85C\uC7A5\uB824\uAE08',
    'policy',
    60,
  );
  assert('cache-derived policy heads expand into audience-specific need longtails',
    cacheDerivedPolicyAudienceCandidates.some((keyword) => keyword.includes('\uD504\uB9AC\uB79C\uC11C') && keyword.includes('\uC2E0\uCCAD') && keyword.includes('\uB300\uC0C1'))
      && cacheDerivedPolicyAudienceCandidates.some((keyword) => keyword.includes('\uC54C\uBC14') && keyword.includes('\uC2E0\uCCAD') && keyword.includes('\uB300\uC0C1'))
      && cacheDerivedPolicyAudienceCandidates.some((keyword) => keyword.includes('\uAC1C\uC778\uC0AC\uC5C5\uC790') && keyword.includes('\uC18C\uB4DD\uAE30\uC900')),
    cacheDerivedPolicyAudienceCandidates.join('|'));
  const cacheDerivedHomeProductCandidates = __liveGoldenRadarTestInternals.buildCacheDerivedCompoundNeedSeeds(
    '\uC81C\uC2B5\uAE30',
    'electronics',
    60,
  );
  assert('cache-derived home product heads expand into buyer-context longtails',
    cacheDerivedHomeProductCandidates.some((keyword) => keyword.includes('\uC6D0\uB8F8') && keyword.includes('\uC804\uAE30\uC694\uAE08'))
      && cacheDerivedHomeProductCandidates.some((keyword) => keyword.includes('\uC790\uCDE8\uBC29') && keyword.includes('\uC18C\uC74C'))
      && cacheDerivedHomeProductCandidates.some((keyword) => keyword.includes('1\uC778\uAC00\uAD6C') && keyword.includes('\uCD94\uCC9C')),
    cacheDerivedHomeProductCandidates.join('|'));
  const cacheDerivedHousingCandidates = __liveGoldenRadarTestInternals.buildCacheDerivedCompoundNeedSeeds(
    '\uC6D0\uB8F8',
    'home_life',
    60,
  );
  assert('cache-derived housing heads do not expand as appliance or launch probes',
    cacheDerivedHousingCandidates.every((keyword) => !/(?:\uCD9C\uC2DC\uC77C|\uBC1C\uB9E4\uC77C|\uC0AC\uC804\uC608\uC57D|\uACF5\uC2DD\uC601\uC0C1|\uC2A4\uD399|\uCD5C\uC800\uAC00|\uAD6C\uB9E4\uCC98|\uD560\uC778|\uCFE0\uD3F0|\uC124\uCE58\uBE44|\uC800\uC18C\uC74C|\uD544\uD130)/u.test(keyword)),
    cacheDerivedHousingCandidates.join('|'));
  assert('live worker semantic filter rejects housing/product launch hybrids',
    __liveGoldenRadarTestInternals.isSyntheticNoEffectLiveProbe('\uC6D0\uB8F8\uCD9C\uC2DC\uC77C\uBE44\uC6A9')
      && __liveGoldenRadarTestInternals.isSyntheticNoEffectLiveProbe('\uB178\uD2B8\uBD81\uC790\uCDE8\uBC29\uCD5C\uC800\uAC00\uC124\uCE58\uBE44')
      && !__liveGoldenRadarTestInternals.isSyntheticNoEffectLiveProbe('\uC6D0\uB8F8 \uAD00\uB9AC\uBE44 \uACC4\uC0B0'),
    'housing/product mismatch');
  const terminalPolicyCandidates = __liveGoldenRadarTestInternals.buildCacheDerivedCompoundNeedSeeds(
    '\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC\uC0AC\uC6A9\uCC98',
    'policy',
    60,
  );
  const terminalCommerceCandidates = __liveGoldenRadarTestInternals.buildCacheDerivedCompoundNeedSeeds(
    '\uCFE0\uCFE0\uC81C\uC2B5\uAE30\uB80C\uD0C8\uAD6C\uB9E4\uCC98',
    'electronics',
    60,
  );
  assert('live worker semantic filter rejects terminal-intent tail chains',
    terminalPolicyCandidates.every((keyword) => !/(?:\uC9C0\uAE09\uC77C|\uB9C8\uAC10\uC77C|\uC18C\uB4DD\uAE30\uC900|\uC2E0\uCCAD\s*(?:\uBC29\uBC95|\uB300\uC0C1)|\uC81C\uC678\s*\uB300\uC0C1|\uD544\uC694\s*\uC11C\uB958)/u.test(keyword))
      && terminalCommerceCandidates.every((keyword) => !/(?:\uC6D0\uB8F8|\uC790\uCDE8\uBC29|\uC804\uAE30\uC694\uAE08|\uC18C\uC74C|\uC800\uC18C\uC74C|\uC124\uCE58\uBE44|\uD544\uD130|\uC2A4\uD399|\uCD9C\uC2DC\uC77C|\uBC1C\uB9E4\uC77C)/u.test(keyword))
      && __liveGoldenRadarTestInternals.isSyntheticNoEffectLiveProbe('\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC\uC0AC\uC6A9\uCC98\uC9C0\uAE09\uC77C')
      && __liveGoldenRadarTestInternals.isSyntheticNoEffectLiveProbe('\uCFE0\uCFE0\uC81C\uC2B5\uAE30\uB80C\uD0C8\uAD6C\uB9E4\uCC98\uC790\uCDE8\uBC29\uC18C\uC74C'),
    [...terminalPolicyCandidates, ...terminalCommerceCandidates].join('|'));
  const noisyHomeProductCandidates = __liveGoldenRadarTestInternals.buildCacheDerivedCompoundNeedSeeds(
    '\uC81C\uC2B5\uAE30\uB80C\uD0C8\uC790\uCDE8\uBC29\uC18C\uC74C',
    'electronics',
    60,
  );
  assert('live worker rejects over-chained home product housing probes without killing valid short probes',
    noisyHomeProductCandidates.every((keyword) => !/(?:\uAD6C\uB9E4\uCC98|\uCD5C\uC800\uAC00|\uC6D0\uB8F8|\uC804\uAE30\uC694\uAE08|\uCD9C\uC2DC\uC77C|\uBC1C\uB9E4\uC77C)/u.test(keyword))
      && __liveGoldenRadarTestInternals.isSyntheticNoEffectLiveProbe('\uC81C\uC2B5\uAE30\uB80C\uD0C8\uC790\uCDE8\uBC29\uC18C\uC74C \uAD6C\uB9E4\uCC98')
      && __liveGoldenRadarTestInternals.isSyntheticNoEffectLiveProbe('\uC81C\uC2B5\uAE30\uB80C\uD0C8\uC790\uCDE8\uBC29\uC18C\uC74C \uC6D0\uB8F8')
      && __liveGoldenRadarTestInternals.isSyntheticNoEffectLiveProbe('\uC81C\uC2B5\uAE30\uB80C\uD0C8\uC790\uCDE8\uBC29\uC18C\uC74C \uC804\uAE30\uC694\uAE08')
      && !__liveGoldenRadarTestInternals.isSyntheticNoEffectLiveProbe('\uC81C\uC2B5\uAE30 \uC790\uCDE8\uBC29 \uC18C\uC74C')
      && !__liveGoldenRadarTestInternals.isSyntheticNoEffectLiveProbe('\uC81C\uC2B5\uAE30 \uC6D0\uB8F8 \uC804\uAE30\uC694\uAE08'),
    noisyHomeProductCandidates.join('|'));
  const cacheDerivedMismatchSeeds = [
    ['\uAC15\uB989 \uCE74\uD398\uAC70\uB9AC', 'food'],
    ['\uAC15\uB989 \uB2F9\uC77C\uCE58\uAE30 \uB9DB\uC9D1', 'travel_domestic'],
    ['\uB0C9\uC7A5\uACE0\uC815\uB9AC\uD568', 'home_life'],
    ['\uC544\uC6C3\uBC31 \uAFC0\uD301', 'policy'],
    ['\uD558\uC774\uB514\uB77C\uC624 \uAFC0\uD301', 'policy'],
    ['\uBD80\uB2F9\uD574\uACE0\uAD6C\uC81C\uC2E0\uCCAD \uD6C4\uAE30', 'home_life'],
    ['\uB808\uC778\uBD80\uCE20 \uD6C4\uAE30', 'home_life'],
    ['\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC\uC628\uB77C\uC778\uACB0\uC81C', 'policy'],
    ['\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC\uC628\uB77C\uC778\uAC00\uB9F9\uC810', 'policy'],
  ] as const;
  const cacheDerivedMismatchCandidates = cacheDerivedMismatchSeeds.flatMap(([seed, category]) => (
    __liveGoldenRadarTestInternals.buildCacheDerivedCompoundNeedSeeds(seed, category, 60)
  ));
  assert('cache-derived expansion rejects cross-context no-effect probe tails before they reach the queue',
    cacheDerivedMismatchCandidates.every((keyword) => (
      !/(?:(?:\uAC15\uB989|\uAC15\uC6D0\uB3C4).{0,18}(?:\uAD6C\uB9E4\uCC98\s*\uCD94\uCC9C|\uCD5C\uC800\uAC00\s*\uBE44\uAD50|\uBE44\uC6A9\s*\uBE44\uAD50|\uD560\uC778\s*\uCFE0\uD3F0|\uC544\uC774\uB791\s*\uCF54\uC2A4|\uB69C\uBC85\uC774\s*\uCF54\uC2A4|\uB2F9\uC77C\uCE58\uAE30\s*\uC900\uBE44\uBB3C)|(?:\uC544\uC6C3\uBC31|\uD558\uC774\uB514\uB77C\uC624|\uAFC0\uD301).{0,18}(?:\uC2E0\uCCAD\s*(?:\uB300\uC0C1|\uBC29\uBC95)|\uC9C0\uAE09\uC77C\s*\uC870\uD68C|\uD544\uC694\s*\uC11C\uB958)|(?:\uBD80\uB2F9\uD574\uACE0|\uAD6C\uC81C\uC2E0\uCCAD|\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC\uC628\uB77C\uC778).{0,18}(?:\uAD6C\uB9E4\uCC98|\uCD5C\uC800\uAC00|\uD560\uC778|\uBE44\uC6A9|\uAC00\uACA9\uBE44\uAD50|\uC120\uD0DD\s*\uAC00\uC774\uB4DC|\uD544\uD130|\uC804\uAE30\uC694\uAE08|\uC18C\uC74C|\uC124\uCE58\uBE44)|(?:\uB0C9\uC7A5\uACE0\uC815\uB9AC|\uB808\uC778\uBD80\uCE20).{0,18}(?:\uC804\uAE30\uC694\uAE08\s*\uBE44\uAD50|\uC804\uAE30\uC138\s*\uBE44\uAD50|\uC18C\uC74C\s*\uBE44\uAD50|\uD544\uD130\s*\uAD50\uCCB4\uC8FC\uAE30|\uC124\uCE58\uBE44\s*\uBE44\uAD50|\uC800\uC18C\uC74C\s*\uD6C4\uAE30))/u.test(keyword)
    )),
    cacheDerivedMismatchCandidates.join('|'));
  const genericAudienceCandidates = __liveGoldenRadarTestInternals.buildBackfillCandidates('policy', [
    '\uCCAD\uB144\u00B7\uC77C\uBC18 \uAD6D\uBBFC',
    '\uC544\uB3D9\u00B7\uC7A5\uC560\uC778',
    '\uCCAD\uB144\uB0B4\uC77C\uC800\uCD95\uACC4\uC88C',
    '\uC7A5\uC560\uC778 \uD65C\uB3D9\uC9C0\uC6D0 \uC2E0\uCCAD',
  ], 120, lottoGuardNow);
  assert('live backfill rejects generic audience-only policy seeds and keeps named programs',
    genericAudienceCandidates.every((keyword) => !/\uCCAD\uB144[·ㆍ\s-]+\uC77C\uBC18|\uC77C\uBC18\s*\uAD6D\uBBFC|\uC544\uB3D9[·ㆍ\s-]+\uC7A5\uC560\uC778/.test(keyword))
      && genericAudienceCandidates.some((keyword) => keyword.includes('\uCCAD\uB144\uB0B4\uC77C\uC800\uCD95\uACC4\uC88C'))
      && genericAudienceCandidates.some((keyword) => keyword.includes('\uC7A5\uC560\uC778 \uD65C\uB3D9\uC9C0\uC6D0')),
    genericAudienceCandidates.slice(0, 60).join('|'));
  const lowValueSentenceCandidates = __liveGoldenRadarTestInternals.buildBackfillCandidates('all', [
    '\uC9C0\uC6D0\uAE08, \uC5B4\uB514\uC5D0 \uC4F0\uACE0 \uACC4\uC2E0\uAC00\uC694',
    '\uC774\uB780 \uD638\uB974\uBB34\uC988 \uC7AC\uBD09\uC1C4 \uC704\uAE30',
    '\uC6D0\uAC00\uC815 \uBCF5\uADC0 \uC55E\uB2F9\uAE30\uACE0 \uC77C\uC2DC\uBCF4\uD638\uAE30\uAC04 \uC870\uD68C',
    '\uC18C\uC0C1\uACF5\uC778\uACFC \uC778\uAD6C\uAC10\uC18C\uC9C0\uC5ED \uC18C\uC0C1\uACF5\uC778 \uD658\uAE09',
    '\uC0AC\uB791\uC744 \uCC98\uBC29\uD574 \uB4DC\uB9BD\uB2C8\uB2E4',
    '소상공인 지원금 소득 기준과 제외',
    '2026 광복절 공휴일',
    '2026 제헌절 일정',
    '\uC5D0\uB108\uC9C0\uBC14\uC6B0\uCC98 \uC2E0\uCCAD',
  ], 120, lottoGuardNow);
  assert('live backfill rejects sentence-like policy headlines and crisis news seeds',
    lowValueSentenceCandidates.every((keyword) => !/\uC5B4\uB514\uC5D0|\uACC4\uC2E0\uAC00\uC694|\uD638\uB974\uBB34\uC988|\uC7AC\uBD09\uC1C4|\uC704\uAE30|\uC6D0\uAC00\uC815|\uC77C\uC2DC\uBCF4\uD638|\uC18C\uC0C1\uACF5\uC778\uACFC|\uC0AC\uB791\uC744|\uB4DC\uB9BD\uB2C8\uB2E4|소득\s*기준과|광복절|제헌절/.test(keyword))
      && lowValueSentenceCandidates.some((keyword) => keyword.includes('\uC5D0\uB108\uC9C0\uBC14\uC6B0\uCC98')),
    lowValueSentenceCandidates.slice(0, 60).join('|'));
  const sportsBackfillCandidates = __liveGoldenRadarTestInternals.buildBackfillCandidates('sports', [
    '\uD14C\uB2C8\uC2A4 \uB77C\uCF13 \uCD94\uCC9C',
    '2026 KBO \uC62C\uC2A4\uD0C0\uC804 \uC608\uB9E4',
  ], 160, lottoGuardNow);
  assert('sports/category backfill does not attach policy tails or event tails to equipment seeds',
    sportsBackfillCandidates.every((keyword) => !/\uC2E0\uCCAD|\uC9C0\uAE09\uC77C|\uC11C\uB958|\uD658\uAE09|\uC8FC\uCC28\s*\uC785\uC7A5\uB8CC/.test(keyword))
      && sportsBackfillCandidates.every((keyword) => !/\uD14C\uB2C8\uC2A4\s*\uB77C\uCF13\s*\uCD94\uCC9C.*(?:\uC911\uACC4|\uACBD\uAE30|\uC608\uB9E4|\uB77C\uC778\uC5C5|\uC21C\uC704|\uACB0\uACFC)/.test(keyword))
      && sportsBackfillCandidates.some((keyword) => keyword.includes('\uD14C\uB2C8\uC2A4 \uB77C\uCF13 \uCD94\uCC9C')),
    sportsBackfillCandidates.slice(0, 80).join('|'));
  const travelBackfillCandidates = __liveGoldenRadarTestInternals.buildBackfillCandidates('travel_domestic', [
    '\uC11C\uC6B8 \uADFC\uAD50 \uB2F9\uC77C\uCE58\uAE30 \uC5EC\uD589',
  ], 160, lottoGuardNow);
  assert('travel/category backfill keeps travel intent and removes policy/payment tails',
    travelBackfillCandidates.every((keyword) => !/\uC9C0\uAE09\uC77C|\uD658\uAE09|\uC790\uACA9|\uC11C\uB958|\uC2E0\uCCAD/.test(keyword))
      && travelBackfillCandidates.some((keyword) => /\uC11C\uC6B8 \uADFC\uAD50 \uB2F9\uC77C\uCE58\uAE30 \uC5EC\uD589.*(?:\uC8FC\uCC28|\uC785\uC7A5\uB8CC|\uC608\uC57D|\uC900\uBE44\uBB3C)/.test(keyword)),
    travelBackfillCandidates.slice(0, 80).join('|'));
  const measuredProbeCandidates = __liveGoldenRadarTestInternals.buildBackfillCandidates('travel_domestic', [
    '\uC81C\uC8FC \uB80C\uD130\uCE74',
  ], 160, lottoGuardNow);
  assert('measured probe backfill prioritizes SearchAd-verifiable travel commerce intent',
    measuredProbeCandidates.slice(0, 40).includes('\uC81C\uC8FC \uB80C\uD130\uCE74 \uAC00\uACA9\uBE44\uAD50'),
    measuredProbeCandidates.slice(0, 80).join('|'));
  const policyMeasuredProbeCandidates = __liveGoldenRadarTestInternals.buildBackfillCandidates('policy', [
    '\uC2E4\uC5C5\uAE09\uC5EC',
  ], 180, lottoGuardNow);
  assert('measured probe backfill expands broad benefit seeds into concrete longtail actions before measurement',
    policyMeasuredProbeCandidates.slice(0, 60).some((keyword) => (
      keyword.includes('\uC2E4\uC5C5\uAE09\uC5EC')
      && /(?:\uC2E0\uCCAD\s*\uBC29\uBC95|\uC2E0\uCCAD\s*\uB300\uC0C1|\uC790\uACA9\s*\uC870\uAC74|\uC9C0\uAE09\uC77C\s*\uC870\uD68C)/.test(keyword)
    ))
      && !policyMeasuredProbeCandidates.slice(0, 10).every((keyword) => keyword === '\uC2E4\uC5C5\uAE09\uC5EC' || keyword === '\uC2E4\uC5C5\uAE09\uC5EC \uC2E0\uCCAD'),
    policyMeasuredProbeCandidates.slice(0, 80).join('|'));
  const allPortfolioProbeCandidates = __liveGoldenRadarTestInternals.buildBackfillCandidates('all', [
    '\uBA4B\uC9C4 \uC2E0\uC138\uACC4 \uBA87\uBD80\uC791',
  ], 240, lottoGuardNow);
  assert('all live golden backfill mixes portfolio writer-intent probes instead of relying only on noisy live issues',
    allPortfolioProbeCandidates.slice(0, 140).some((keyword) => /\uC81C\uC8FC\s*\uB80C\uD130\uCE74(?:\s*\uC644\uC804\uC790\uCC28)?\s*\uAC00\uACA9\uBE44\uAD50/.test(keyword))
      && allPortfolioProbeCandidates.slice(0, 180).some((keyword) => /(?:\uAC1C\uC778\uC0AC\uC5C5\uC790|\uD504\uB9AC\uB79C\uC11C|\uC54C\uBC14)\s*\uADFC\uB85C\uC7A5\uB824\uAE08.*\uB9C8\uAC10\uC77C\s*\uD655\uC778|\uCCAD\uB144\uBBF8\uB798\uC801\uAE08\s*\uAC00\uC785\uC2E0\uCCAD|\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC\s*\uC0AC\uC6A9\uCC98|\uAD6D\uBBFC\uB0B4\uC77C\uBC30\uC6C0\uCE74\uB4DC\s*\uC0AC\uC6A9\uCC98/.test(keyword))
      && allPortfolioProbeCandidates.slice(0, 160).some((keyword) => /\uBB34\uC120\s*\uCCAD\uC18C\uAE30.*(?:\uAC00\uACA9\uBE44\uAD50|\uCD94\uCC9C\s*\uD6C4\uAE30)/.test(keyword))
      && allPortfolioProbeCandidates.every((keyword) => !/\uC81C\uC8FC\s*\uB80C\uD130\uCE74.*\uC9C0\uC6D0\uAE08\s*\uC870\uAC74/.test(keyword)),
    allPortfolioProbeCandidates.slice(0, 180).join('|'));
  const allEventCrowdedProbeCandidates = __liveGoldenRadarTestInternals.buildBackfillCandidates('all', [
    '2026 KBO \uC62C\uC2A4\uD0C0\uC804 \uC608\uB9E4',
  ], 240, lottoGuardNow);
  const firstPortfolioProbeIndex = allEventCrowdedProbeCandidates.findIndex((keyword) => (
    /\uC81C\uC8FC\s*\uB80C\uD130\uCE74(?:\s*\uC644\uC804\uC790\uCC28)?\s*\uAC00\uACA9\uBE44\uAD50|\uBB34\uC120\s*\uCCAD\uC18C\uAE30\s*\uAC00\uACA9\uBE44\uAD50|\uCCAD\uB144\uBBF8\uB798\uC801\uAE08\s*\uC2E0\uCCAD\s*\uB300\uC0C1/.test(keyword)
  ));
  const firstEventProbeIndex = allEventCrowdedProbeCandidates.findIndex((keyword) => /KBO|\uC62C\uC2A4\uD0C0\uC804/.test(keyword));
  assert('all live golden backfill measures portfolio probes before event lookup noise',
    firstPortfolioProbeIndex >= 0
      && (firstEventProbeIndex === -1 || firstPortfolioProbeIndex < firstEventProbeIndex),
    JSON.stringify({
      firstPortfolioProbeIndex,
      firstEventProbeIndex,
      candidates: allEventCrowdedProbeCandidates.slice(0, 80),
    }));
  assert('all live golden backfill favors publishable segmented needs over broad or incompatible tails',
    allEventCrowdedProbeCandidates.slice(0, 120).some((keyword) => /\uBB34\uC120\s*\uCCAD\uC18C\uAE30\s*\uD761\uC785\uB825/.test(keyword))
      && allEventCrowdedProbeCandidates.slice(0, 120).some((keyword) => /\uB85C\uBD07\s*\uCCAD\uC18C\uAE30\s*\uBB3C\uAC78\uB808/.test(keyword))
      && allEventCrowdedProbeCandidates.slice(0, 180).some((keyword) => /(?:\uAC1C\uC778\uC0AC\uC5C5\uC790|\uD504\uB9AC\uB79C\uC11C|\uC54C\uBC14|\uBC18\uAE30)\s*\uADFC\uB85C\uC7A5\uB824\uAE08.*(?:\uB9C8\uAC10\uC77C\s*\uD655\uC778|\uD544\uC694\s*\uC11C\uB958|\uC2E4\uC218\uB839\uC561)/.test(keyword))
      && allEventCrowdedProbeCandidates.slice(0, 140).every((keyword) => !/(?:\uD55C\uAD6D\uC0AC\uB2A5\uB825\uAC80\uC815\uC2DC\uD5D8|\uD1A0\uC775|\uCEF4\uD65C|AI\s*\uD68C\uC758\uB85D|\uCC57GPT|\uAD6D\uBBFC\uC5F0\uAE08).*\uC608\uC57D|\uC81C\uC8FC\s*\uD56D\uACF5\uAD8C.*(?:\uC720\uC2EC|eSIM)|\uC804\uAE30\uC694\uAE08\s*\uAC00\uACA9\uBE44\uAD50|\uAC80\uC0AC\s*\uAC80\uC0AC\s*\uBE44\uC6A9|\uCE58\uB8CC\uC81C\s*\uCE58\uB8CC\s*\uBE44\uC6A9/.test(keyword)),
    allEventCrowdedProbeCandidates.slice(0, 140).join('|'));
  const allHealthPolicyMixProbeCandidates = __liveGoldenRadarTestInternals.buildBackfillCandidates('all', [
    '\uB3C4\uC218\uCE58\uB8CC \uAD00\uB9AC\uAE09\uC5EC',
  ], 240, lottoGuardNow);
  assert('selected health recovery rejects category-fallback calculator noise',
    __liveGoldenRadarTestInternals.categoryAcceptsMeasuredProbe('\uADFC\uBB34\uC2DC\uAC04\uACC4\uC0B0\uAE30 \uC790\uB3D9\uACC4\uC0B0', 'health') === false
      && __liveGoldenRadarTestInternals.categoryAcceptsMeasuredProbe('\uBE44\uD0C0\uBBFCD \uAC80\uC0AC \uBE44\uC6A9', 'health') === true);
  assert('all measured probes keep health treatment tails separate from policy application tails',
    allHealthPolicyMixProbeCandidates.slice(0, 160).every((keyword) => !/\uB3C4\uC218\uCE58\uB8CC.*(?:\uAD00\uB9AC\uAE09\uC5EC|\uC18C\uB4DD\uAE30\uC900|\uD544\uC694\s*\uC11C\uB958|\uB9C8\uAC10\uC77C|\uC628\uB77C\uC778\s*\uC2E0\uCCAD)/.test(keyword))
      && allHealthPolicyMixProbeCandidates.slice(0, 160).some((keyword) => /\uB3C4\uC218\uCE58\uB8CC.*(?:\uBCF4\uD5D8\s*\uC801\uC6A9\s*\uBE44\uC6A9|\uCE58\uB8CC\s*\uBE44\uC6A9|\uC2E4\uBE44\s*\uCCAD\uAD6C)/.test(keyword)),
    allHealthPolicyMixProbeCandidates.slice(0, 160).join('|'));
  let measuredProbeVolumeCalls = 0;
  const measuredProbeVolumeKeywords: string[] = [];
  const measuredProbeDocumentOptions: Array<{ keyword: string; scrapeOnly?: boolean }> = [];
  const measuredProbeRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 4,
    boardTarget: 10,
    maxCandidates: 180,
    categories: ['travel_domestic'],
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
    liveSeedProvider: async () => [
      '\uC81C\uC8FC \uB80C\uD130\uCE74',
    ],
    enableBackfill: true,
    autocompleteProvider: async () => [],
    measureLiveSearchVolumeSeparate: async (_config, keywords, options) => {
      measuredProbeVolumeCalls += 1;
      assert('measured probe backfill keeps document count in the document pass', options?.includeDocumentCount === false);
      measuredProbeVolumeKeywords.push(...keywords);
      return keywords
        .filter((keyword) => /\uC81C\uC8FC\s*\uB80C\uD130\uCE74.*\uAC00\uACA9\uBE44\uAD50/.test(keyword))
        .map((keyword) => ({
          keyword,
          pcSearchVolume: 540,
          mobileSearchVolume: 1740,
          documentCount: 0,
          competition: 'LOW',
          monthlyAveCpc: 230,
          searchVolumeSource: 'searchad',
          searchVolumeConfidence: 'high',
          isSearchVolumeEstimated: false,
        }));
    },
    measureLiveDocumentCount: async (keyword, options) => {
      measuredProbeDocumentOptions.push({ keyword, scrapeOnly: options?.scrapeOnly });
      if (!/\uC81C\uC8FC\s*\uB80C\uD130\uCE74.*\uAC00\uACA9\uBE44\uAD50/.test(keyword)) return null;
      return {
        dc: 15,
        source: 'scrape',
        confidence: 'high',
        isEstimated: false,
      };
    },
    discover: async () => [],
  });
  const measuredProbeSnapshot = await measuredProbeRadar.runOnce();
  assert('measured probe backfill publishes only after SearchAd split and measured document count are attached',
    measuredProbeVolumeCalls > 0
      && measuredProbeVolumeKeywords.some((keyword) => /\uC81C\uC8FC\s*\uB80C\uD130\uCE74.*\uAC00\uACA9\uBE44\uAD50/.test(keyword))
      && measuredProbeDocumentOptions.some((item) => /\uC81C\uC8FC\s*\uB80C\uD130\uCE74.*\uAC00\uACA9\uBE44\uAD50/.test(item.keyword))
      && measuredProbeSnapshot.board.some((item) => (
        /\uC81C\uC8FC\s*\uB80C\uD130\uCE74.*\uAC00\uACA9\uBE44\uAD50/.test(item.keyword)
        && item.pcSearchVolume === 540
        && item.mobileSearchVolume === 1740
        && item.documentCount === 15
        && item.searchVolumeSource === 'searchad'
        && item.documentCountSource === 'scrape'
        && item.isSearchVolumeEstimated === false
        && item.isDocumentCountEstimated === false
      )),
    JSON.stringify({
      measured: measuredProbeVolumeKeywords.slice(0, 50),
      documents: measuredProbeDocumentOptions,
      board: measuredProbeSnapshot.board.map((item) => `${item.keyword}:${item.totalSearchVolume}:${item.documentCount}:${item.searchVolumeSource}:${item.documentCountSource}`),
      lastMessage: measuredProbeSnapshot.lastMessage,
    }));
  const noisyAutocompleteRegions = [
    '\uC11C\uC6B8',
    '\uBD80\uC0B0',
    '\uAC15\uB989',
    '\uC5EC\uC218',
    '\uC18D\uCD08',
    '\uACBD\uC8FC',
    '\uC804\uC8FC',
    '\uB300\uAD6C',
    '\uC778\uCC9C',
    '\uB300\uC804',
    '\uC6B8\uC0B0',
    '\uCCAD\uC8FC',
  ];
  const noisyAutocompleteIntents = [
    '\uC608\uC57D \uBC29\uBC95',
    '\uC608\uC57D \uD6C4\uAE30',
    '\uC608\uC57D \uD560\uC778',
    '\uACF5\uD56D \uC608\uC57D',
    '\uC8FC\uB9D0 \uC608\uC57D',
    '\uB2F9\uC77C \uC608\uC57D',
    '\uB80C\uD2B8 \uBE44\uC6A9',
  ];
  const noisyAutocompleteSuggestions = noisyAutocompleteRegions.flatMap((region) => (
    noisyAutocompleteIntents.map((intent) => `${region} \uB80C\uD130\uCE74 ${intent}`)
  ));
  let noisyAutocompleteCalls = 0;
  const noisyProbeVolumeKeywords: string[] = [];
  const noisyProbeRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 4,
    boardTarget: 10,
    maxCandidates: 180,
    categories: ['travel_domestic'],
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
    liveSeedProvider: async () => [
      '\uC81C\uC8FC \uB80C\uD130\uCE74',
    ],
    enableBackfill: true,
    autocompleteProvider: async () => {
      noisyAutocompleteCalls += 1;
      return noisyAutocompleteSuggestions;
    },
    measureLiveSearchVolumeSeparate: async (_config, keywords) => {
      noisyProbeVolumeKeywords.push(...keywords);
      return keywords
        .filter((keyword) => /\uC81C\uC8FC\s*\uB80C\uD130\uCE74.*\uAC00\uACA9\uBE44\uAD50/.test(keyword))
        .map((keyword) => ({
          keyword,
          pcSearchVolume: 540,
          mobileSearchVolume: 1740,
          documentCount: 15,
          competition: 'LOW',
          monthlyAveCpc: 230,
          searchVolumeSource: 'searchad',
          searchVolumeConfidence: 'high',
          isSearchVolumeEstimated: false,
          documentCountSource: 'scrape',
          documentCountConfidence: 'high',
          isDocumentCountEstimated: false,
        }));
    },
    measureLiveDocumentCount: async () => ({
      dc: 15,
      source: 'scrape',
      confidence: 'high',
      isEstimated: false,
    }),
    discover: async () => [],
  });
  const noisyProbeSnapshot = await noisyProbeRadar.runOnce();
  const noisyAutocompleteSuggestionIds = new Set(
    noisyAutocompleteSuggestions.map((keyword) => keyword.replace(/\s+/g, '')),
  );
  assert('measured probe candidates outrank noisy autocomplete candidates before SearchAd spend',
    noisyProbeVolumeKeywords.length >= 24
      && noisyProbeVolumeKeywords.some((keyword) => /\uC81C\uC8FC\s*\uB80C\uD130\uCE74.*\uAC00\uACA9\uBE44\uAD50/.test(keyword))
      && noisyProbeVolumeKeywords
        .slice(0, 16)
        .every((keyword) => !noisyAutocompleteSuggestionIds.has(keyword.replace(/\s+/g, '')))
      && noisyProbeSnapshot.board.some((item) => /\uC81C\uC8FC\s*\uB80C\uD130\uCE74.*\uAC00\uACA9\uBE44\uAD50/.test(item.keyword)),
    JSON.stringify({
      first: noisyProbeVolumeKeywords.slice(0, 16),
      autocompleteCalls: noisyAutocompleteCalls,
      totalMeasured: noisyProbeVolumeKeywords.length,
      board: noisyProbeSnapshot.board.map((item) => item.keyword),
    }));
  const policyBackfillCandidates = __liveGoldenRadarTestInternals.buildBackfillCandidates('policy', [
    '\uADFC\uB85C\uC7A5\uB824\uAE08',
  ], 160, lottoGuardNow);
  assert('policy/category backfill keeps application intent and removes commerce/travel tails',
    policyBackfillCandidates.every((keyword) => !/\uC8FC\uCC28|\uC785\uC7A5\uB8CC|\uC608\uB9E4|\uAD6C\uB9E4\uCC98|\uCD5C\uC800\uAC00|\uD560\uC778\s*\uCFE0\uD3F0/.test(keyword))
      && policyBackfillCandidates.some((keyword) => /\uADFC\uB85C\uC7A5\uB824\uAE08.*(?:\uC2E0\uCCAD|\uB300\uC0C1|\uC790\uACA9|\uC9C0\uAE09\uC77C)/.test(keyword)),
    policyBackfillCandidates.slice(0, 80).join('|'));
  const policyProductTailCandidates = __liveGoldenRadarTestInternals.buildMeasuredProbeCandidates('policy', [
    '\uCC28\uB7C9\uC6A9 \uC5D0\uC5B4\uAC74',
    '\uC74C\uC2DD\uBB3C \uCC98\uB9AC\uAE30',
    '\uC368\uD050\uB808\uC774\uD130',
    '\uADFC\uB85C\uC7A5\uB824\uAE08',
  ], 180, lottoGuardNow);
  assert('policy probe generation blocks product bases with policy-only tails',
    policyProductTailCandidates.every((keyword) => !/(\uCC28\uB7C9\uC6A9\s*\uC5D0\uC5B4\uAC74|\uC74C\uC2DD\uBB3C\s*\uCC98\uB9AC\uAE30|\uC368\uD050\uB808\uC774\uD130).*(\uC2E0\uCCAD|\uC9C0\uAE09\uC77C|\uC0AC\uC6A9\uCC98|\uC18C\uB4DD\uAE30\uC900|\uC11C\uB958)/.test(keyword))
      && policyProductTailCandidates.some((keyword) => /\uADFC\uB85C\uC7A5\uB824\uAE08.*(?:\uC2E0\uCCAD|\uC9C0\uAE09\uC77C|\uC790\uACA9|\uD544\uC694\s*\uC11C\uB958|\uB9C8\uAC10\uC77C)/.test(keyword)),
    policyProductTailCandidates.slice(0, 80).join('|'));
  const mismatchBackfillCandidates = __liveGoldenRadarTestInternals.buildBackfillCandidates('shopping', [
    '이요원',
    '오십프로 김채은 활약',
    '송지호 바다하늘길 입장료',
    '2026 흠뻑쇼 일정',
    '2026 KBO 올스타전 티켓팅 일정',
    '소상공인 지원금 공식 확인 경로',
    '소상공인 지원금 6월 온라인 신청 방법',
    '소상공인정책자금 금액 조회 신청 방법',
    '소상공인정책자금신청기간 대상 조건',
    '소상공인정책자금신청기간 지원 대상',
    '소상공인정책자금 준비서류 신청 방법',
    '소상공인 지원금 정부24 지급일 조회',
    '6월 21일 송지호바다하늘길 주차 운영시간',
    '송지호바다하늘길 입장료 현재 상황 운영시간',
  ], 220, lottoGuardNow);
  assert('shopping/live backfill blocks person-news commerce tails and over-expanded event chains',
    mismatchBackfillCandidates.every((keyword) => !/이요원.*(?:구매처|최저가|실사용|할인|쿠폰|추천\s*후기)|김채은.*(?:구매처|최저가|실사용|할인|쿠폰|추천\s*후기)|흠뻑쇼|KBO|공식\s*확인\s*경로|일정\s*콘서트\s*일정|구매처\s*(?:구매처|재고)|^\d{1,2}월\s*\d{1,2}일|6월\s*온라인|준비서류\s*(?:신청|대상|자격|조건|지급일|환급|지원)|정부24\s*(?:지급일|신청|조회)|현재\s*상황\s*운영시간|정리\s*운영시간|금액\s*조회\s*(?:신청|대상|자격|지급일|환급)|신청기간\s*(?:대상|자격|지급일|환급|금액|지원)/.test(keyword))
      && mismatchBackfillCandidates.every((keyword) => !/송지호\s*바다하늘길.*(?:가격\s*비교|할인|쿠폰|최저가|구매처)/.test(keyword)),
    mismatchBackfillCandidates.slice(0, 100).join('|'));
  const duplicateIntentCandidates = __liveGoldenRadarTestInternals.buildBackfillCandidates('policy', [
    '청년미래적금가입신청',
    '청년미래적금가입신청 금액',
    '근로장려금 신청 근로장려금신청대상',
  ], 120, lottoGuardNow);
  assert('live backfill does not attach duplicate 신청 intent to already actionable program names',
    duplicateIntentCandidates.every((keyword) => !/신청\s*신청|가입신청\s*(?:신청|금액)|근로장려금\s*신청\s*근로장려금/.test(keyword))
      && duplicateIntentCandidates.some((keyword) => keyword.includes('청년미래적금가입신청')),
    duplicateIntentCandidates.slice(0, 80).join('|'));
  assert('live board rejects common event/news lookup rows even when measured',
    !__liveGoldenRadarTestInternals.isLiveRadarUsableKeyword('2026흠뻑쇼일정', 18820, 2328, lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isLiveRadarUsableKeyword('2026 KBO 올스타전 티켓팅 일정', 27340, 2742, lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isLiveRadarUsableKeyword('1228회로또당첨번호', 22740, 268, lottoGuardNow)
      && __liveGoldenRadarTestInternals.isLiveRadarUsableKeyword('도수치료 보험 적용 비용', 5200, 620, lottoGuardNow));
  assert('live board rejects synthetic product commerce tails before SearchAd spend',
    !__liveGoldenRadarTestInternals.isLiveRadarUsableKeyword('공기청정기 필터 교체주기 추천 최저가', 5400, 620, lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isLiveRadarUsableKeyword('냉장고 용량 선택 가이드 구매처 실사용 후기', 7600, 740, lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isLiveRadarUsableKeyword('냉장고 용량 선택 가이드 구매처', 7600, 740, lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isLiveRadarUsableKeyword('로봇청소기 비교 구매처', 6400, 710, lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isLiveRadarUsableKeyword('세탁기 드럼 vs 통돌이 구매처 최저가', 6400, 710, lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isLiveRadarUsableKeyword('무선청소기 vs 로봇청소기 스펙 스펙 비교', 6400, 710, lottoGuardNow)
      && __liveGoldenRadarTestInternals.isLiveRadarUsableKeyword('도수치료 보험 적용 비용', 5200, 620, lottoGuardNow));
  const sportsProbeCandidates = __liveGoldenRadarTestInternals.buildMeasuredProbeCandidates('sports', [
    '2026 KBO 올스타전 티켓팅 일정',
  ], 220, lottoGuardNow);
  assert('measured probe generation does not attach product shopping tails to non-product sports events',
    sportsProbeCandidates.every((keyword) => !/(?:KBO|올스타전)/.test(keyword)),
    sportsProbeCandidates.slice(0, 80).join('|'));
  const footballIssueProbeCandidates = __liveGoldenRadarTestInternals.buildMeasuredProbeCandidates('sports', [
    '월드컵',
    '홍명보 감독',
  ], 220, lottoGuardNow);
  assert('national football live issues expand into writer-ready measured probes without reopening KBO noise',
    __liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('월드컵 중계 일정', 'sports', lottoGuardNow)
      && __liveGoldenRadarTestInternals.isLiveRadarUsableKeyword('월드컵 중계 일정', 7200, 430, lottoGuardNow)
      && __liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('홍명보 감독 대표팀 명단', 'sports', lottoGuardNow)
      && footballIssueProbeCandidates.some((keyword) => /월드컵\s*(?:중계\s*일정|경기\s*시간|조편성|대진표)/.test(keyword))
      && footballIssueProbeCandidates.some((keyword) => /홍명보\s*감독\s*(?:대표팀\s*명단|경기\s*시간|상대전적)/.test(keyword))
      && footballIssueProbeCandidates.every((keyword) => !/(?:KBO|프로야구|올스타전|클라이밍\s*초보\s*중계)/.test(keyword)),
    footballIssueProbeCandidates.slice(0, 80).join('|'));
  const semanticMismatchProbeCases = [
    ['신입사원 강회장 출연진 최저가 구매처', 'broadcast'],
    ['신입사원 강회장 방송시간 가격비교 후기', 'broadcast'],
    ['멋진 신세계 방송시간 방송시간 다시보기', 'broadcast'],
    ['파트릭 클라위버르트 프로필 가격비교', 'sports'],
    ['월드컵 조편성 최저가 비교', 'sports'],
  ] as const;
  assert('measured probe generator blocks person broadcast and live sports commerce mismatches',
    semanticMismatchProbeCases.every(([keyword, category]) => (
      !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate(keyword, category, lottoGuardNow)
        && !__liveGoldenRadarTestInternals.isHighYieldSearchAdSpendCandidate(keyword, category, lottoGuardNow)
    )),
    JSON.stringify(semanticMismatchProbeCases.map(([keyword, category]) => ({
      keyword,
      category,
      debug: __liveGoldenRadarTestInternals.debugSearchAdMeasurableLiveCandidate(keyword, category, lottoGuardNow),
    }))));
  const semanticProbePortfolio = __liveGoldenRadarTestInternals.buildMeasuredProbeCandidates('all', [
    '멋진 신세계',
    '신입사원 강회장',
    '파트릭 클라위버르트 프로필',
    '월드컵',
    '홍명보 감독',
  ], 420, lottoGuardNow);
  assert('measured probe portfolio does not spend SearchAd calls on mismatched issue commerce tails',
    semanticProbePortfolio.every((keyword) => (
      !/(?:출연진|방송시간|프로필|월드컵|홍명보).{0,18}(?:가격비교|최저가|구매처|렌탈|보험\s*적용|추천\s*후기)/u.test(keyword)
        && !/(?:방송시간.{0,8}방송시간|출연진.{0,8}출연진|가격비교.{0,8}가격비교|최저가.{0,8}최저가)/u.test(keyword)
    )),
    semanticProbePortfolio.slice(0, 100).join('|'));
  const semanticBackfillPortfolio = __liveGoldenRadarTestInternals.buildBackfillCandidates('all', [
    '신입사원 강회장',
    '신입사원 강회장 출연진',
    '신입사원 강회장 방송시간',
    '하트시그널5 공식영상',
    '월드컵',
    '홍명보 감독',
  ], 420, lottoGuardNow);
  assert('live golden backfill blocks stale broadcast and sports commerce tails before queueing',
    semanticBackfillPortfolio.every((keyword) => (
      !/(?:신입사원\s*강회장|하트시그널5|공식영상|출연진|방송시간|월드컵|홍명보).{0,22}(?:최저가|가격비교|구매처|렌탈|보험\s*적용|추천\s*후기)/u.test(keyword)
        && !/(?:방송시간.{0,8}방송시간|출연진.{0,8}출연진|공식영상.{0,8}공식영상)/u.test(keyword)
    )),
    semanticBackfillPortfolio.slice(0, 120).join('|'));
  const productEventTailMismatchCases = [
    ['\uB808\uC778\uBD80\uCE20 \uC21C\uC704 \uC911\uACC4 \uC77C\uC815', 'shopping'],
    ['\uB808\uC778\uBD80\uCE20 \uC21C\uC704 \uACBD\uAE30 \uC77C\uC815', 'shopping'],
    ['\uB808\uC778\uBD80\uCE20 \uC21C\uC704 \uC9C1\uAD00 \uC900\uBE44\uBB3C', 'shopping'],
    ['\uB808\uC778\uBD80\uCE20 \uC21C\uC704 \uC608\uB9E4 \uC77C\uC815', 'shopping'],
    ['\uB808\uC778\uBD80\uCE20 \uBE44\uAD50 \uD504\uB86C\uD504\uD2B8', 'shopping'],
    ['\uB808\uC778\uBD80\uCE20 \uBE44\uAD50 \uC624\uB958 \uD574\uACB0', 'shopping'],
    ['\uB808\uC778\uBD80\uCE20 \uBE44\uAD50 \uBB34\uB8CC \uB300\uCCB4', 'shopping'],
    ['\uB808\uC778\uBD80\uCE20 \uBE44\uAD50 \uC5C5\uB370\uC774\uD2B8', 'shopping'],
  ] as const;
  assert('product shopping heads reject sports event and non-AI prompt tails',
    productEventTailMismatchCases.every(([keyword, category]) => (
      !__liveGoldenRadarTestInternals.isLiveRadarUsableKeyword(keyword, 2400, 180, lottoGuardNow)
        && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate(keyword, category, lottoGuardNow)
        && !__liveGoldenRadarTestInternals.isHighYieldSearchAdSpendCandidate(keyword, category, lottoGuardNow)
    )),
    JSON.stringify(productEventTailMismatchCases.map(([keyword, category]) => ({
      keyword,
      category,
      usable: __liveGoldenRadarTestInternals.isLiveRadarUsableKeyword(keyword, 2400, 180, lottoGuardNow),
      searchAd: __liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate(keyword, category, lottoGuardNow),
      spend: __liveGoldenRadarTestInternals.isHighYieldSearchAdSpendCandidate(keyword, category, lottoGuardNow),
      debug: __liveGoldenRadarTestInternals.debugSearchAdMeasurableLiveCandidate(keyword, category, lottoGuardNow),
    }))));
  const productEventBackfillCandidates = __liveGoldenRadarTestInternals.buildBackfillCandidates('shopping', [
    '\uB808\uC778\uBD80\uCE20 \uC21C\uC704',
  ], 120, lottoGuardNow);
  assert('shopping backfill does not create sports event tails for product rank seeds',
    productEventBackfillCandidates.every((keyword) => (
      !/(?:\uC911\uACC4\s*\uC77C\uC815|\uACBD\uAE30\s*\uC77C\uC815|\uC9C1\uAD00\s*\uC900\uBE44\uBB3C|\uC608\uB9E4\s*\uC77C\uC815|\uD504\uB86C\uD504\uD2B8|\uC624\uB958\s*\uD574\uACB0|\uBB34\uB8CC\s*\uB300\uCCB4|\uC5C5\uB370\uC774\uD2B8)/u.test(keyword)
    )),
    productEventBackfillCandidates.slice(0, 80).join('|'));
  assert('policy compound chains are rejected before SearchAd spend',
    !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('청년미래적금 신청 소득기준 계산 서류', 'policy', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('청년미래적금 서류 마감일 확인', 'policy', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('청년미래적금 조건 소득기준 계산', 'policy', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('도수치료 관리급여 소득기준 계산 예약', 'policy', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('도수치료 관리급여 필요 서류', 'policy', lottoGuardNow)
      && __liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('\uC54C\uBC14 \uADFC\uB85C\uC7A5\uB824\uAE08 \uC2E4\uC218\uB839\uC561', 'policy', lottoGuardNow),
    JSON.stringify([
      __liveGoldenRadarTestInternals.debugSearchAdMeasurableLiveCandidate('청년미래적금 신청 소득기준 계산 서류', 'policy', lottoGuardNow),
      __liveGoldenRadarTestInternals.debugSearchAdMeasurableLiveCandidate('청년미래적금 서류 마감일 확인', 'policy', lottoGuardNow),
      __liveGoldenRadarTestInternals.debugSearchAdMeasurableLiveCandidate('청년미래적금 조건 소득기준 계산', 'policy', lottoGuardNow),
      __liveGoldenRadarTestInternals.debugSearchAdMeasurableLiveCandidate('도수치료 관리급여 소득기준 계산 예약', 'policy', lottoGuardNow),
      __liveGoldenRadarTestInternals.debugSearchAdMeasurableLiveCandidate('도수치료 관리급여 필요 서류', 'policy', lottoGuardNow),
    ]));
  assert('broad policy head intents are skipped unless narrowed by audience region or calculation detail',
    !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('\uC2E4\uC5C5\uAE09\uC5EC \uC2E0\uCCAD \uBC29\uBC95', 'policy', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('\uAD6D\uBBFC\uB0B4\uC77C\uBC30\uC6C0\uCE74\uB4DC\uC2E0\uCCAD\uBC29\uBC95', 'policy', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('\uADFC\uB85C\uC7A5\uB824\uAE08 \uC9C0\uAE09\uC77C \uC870\uD68C', 'policy', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('\uCCAD\uB144\uB0B4\uC77C\uC800\uCD95\uACC4\uC88C \uC2E0\uCCAD \uBC29\uBC95', 'policy', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('\uC18C\uC0C1\uACF5\uC778\uD3D0\uC5C5\uC9C0\uC6D0\uAE08 \uC2E0\uCCAD \uBC29\uBC95', 'policy', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('\uAE30\uC800\uADC0\uBC14\uC6B0\uCC98 \uC2E0\uCCAD \uB300\uC0C1', 'policy', lottoGuardNow)
      && __liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('\uBD80\uC0B0\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC\uC0AC\uC6A9\uCC98 \uC870\uD68C', 'policy', lottoGuardNow)
      && __liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('\uC54C\uBC14 \uADFC\uB85C\uC7A5\uB824\uAE08 \uC2E4\uC218\uB839\uC561', 'policy', lottoGuardNow),
    JSON.stringify([
      __liveGoldenRadarTestInternals.debugSearchAdMeasurableLiveCandidate('\uC2E4\uC5C5\uAE09\uC5EC \uC2E0\uCCAD \uBC29\uBC95', 'policy', lottoGuardNow),
      __liveGoldenRadarTestInternals.debugSearchAdMeasurableLiveCandidate('\uBD80\uC0B0\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC\uC0AC\uC6A9\uCC98 \uC870\uD68C', 'policy', lottoGuardNow),
    ]));
  assert('no-effect event and repeated application probes are skipped before SearchAd spend',
    !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('2026 KBO \uC62C\uC2A4\uD0C0\uC804 \uD2F0\uCF13\uD305 \uC77C\uC815', 'sports', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('2026 \uAD11\uBCF5\uC808 \uB300\uCCB4\uACF5\uD734\uC77C \uC2E0\uCCAD\uBC29\uBC95', 'policy', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('\uB18D\uC2DD\uD488\uBC14\uC6B0\uCC98\uC0AC\uC6A9\uCC98\uC870\uD68C \uC18C\uB4DD\uAE30\uC900', 'policy', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('\uADFC\uB85C\uC7A5\uB824\uAE08 \uC2E0\uCCAD \uADFC\uB85C\uC7A5\uB824\uAE08\uC2E0\uCCAD\uB300\uC0C1', 'policy', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC\uC628\uB77C\uC778\uAC00\uB9F9\uC810 \uC790\uACA9 \uC870\uAC74', 'policy', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC\uC628\uB77C\uC778\uAC00\uB9F9\uC810 \uC2E0\uCCAD \uBC29\uBC95', 'policy', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC\uC628\uB77C\uC778\uC1FC\uD551\uBAB0 \uC2E0\uCCAD \uB300\uC0C1', 'policy', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('4\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30 4\uB300\uBCF4\uD5D8\uB8CC \uC694\uC728 \uACC4\uC0B0', 'policy', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('\uAE30\uCD08\uC5F0\uAE08\uC218\uAE09\uC790\uACA9\uBAA8\uC758\uACC4\uC0B0\uAE30 4\uB300\uBCF4\uD5D8\uB8CC \uC694\uC728 \uACC4\uC0B0', 'policy', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('\uC5F0\uCC28\uC218\uB2F9\uACC4\uC0B0\uAE30 4\uB300\uBCF4\uD5D8\uB8CC \uC694\uC728 \uACC4\uC0B0', 'policy', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('\uC790\uC601\uC5C5\uC790 \uACE0\uC6A9\uBCF4\uD5D8 \uC2E4\uC5C5\uAE09\uC5EC \uC790\uB3D9\uACC4\uC0B0', 'policy', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('\uC790\uC601\uC5C5\uC790\uC2E4\uC5C5\uAE09\uC5EC\uC2E0\uCCAD\uBC29\uBC95 \uC138\uD6C4\uACC4\uC0B0', 'policy', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC\uC628\uB77C\uC778\uACB0\uC81C \uCD5C\uC800\uAC00 \uBE44\uAD50', 'policy', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('\uADFC\uB85C\uC7A5\uB824\uAE08 \uC2E0\uCCAD \uADFC\uB85C\uC7A5\uB824\uAE08\uC2E0\uCCAD\uBB38\uC758', 'policy', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('\uC2DC\uC2A4\uD15C\uC5D0\uC5B4\uCEE8\uBE44\uC6A9 \uC6D0\uB8F8 \uC804\uAE30\uC694\uAE08 \uBE44\uAD50', 'electronics', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('\uBCBD\uAC78\uC774\uC5D0\uC5B4\uCEE8\uC124\uCE58\uBE44\uC6A9 \uC790\uCDE8\uBC29 \uC18C\uC74C \uBE44\uAD50', 'electronics', lottoGuardNow)
      && __liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('\uC81C\uC8FC \uB80C\uD130\uCE74 \uC644\uC804\uC790\uCC28 \uAC00\uACA9\uBE44\uAD50', 'travel_domestic', lottoGuardNow),
    JSON.stringify([
      __liveGoldenRadarTestInternals.debugSearchAdMeasurableLiveCandidate('2026 KBO \uC62C\uC2A4\uD0C0\uC804 \uD2F0\uCF13\uD305 \uC77C\uC815', 'sports', lottoGuardNow),
      __liveGoldenRadarTestInternals.debugSearchAdMeasurableLiveCandidate('\uADFC\uB85C\uC7A5\uB824\uAE08 \uC2E0\uCCAD \uADFC\uB85C\uC7A5\uB824\uAE08\uC2E0\uCCAD\uB300\uC0C1', 'policy', lottoGuardNow),
    ]));
  const holidayProbeCandidates = __liveGoldenRadarTestInternals.buildMeasuredProbeCandidates('policy', [
    '2026 광복절 대체공휴일',
  ], 220, lottoGuardNow);
  const holidayOnlyProbeCandidates = holidayProbeCandidates.filter((keyword) => /광복절|공휴일/.test(keyword));
  assert('calendar holiday probes do not attach commerce or application tails',
    holidayOnlyProbeCandidates.every((keyword) => !/(?:가격|최저가|구매처|렌탈|보험|신청|서류|비용)/.test(keyword)),
    holidayProbeCandidates.slice(0, 80).join('|'));
  assert('event and calendar commerce probes are rejected at SearchAd gate',
    !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('2026 광복절 대체공휴일 최저가 구매처', 'policy', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('2026 광복절 대체공휴일 신청기간', 'policy', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('제헌절 신청방법', 'policy', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('공휴일 자격', 'policy', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('제헌절 공휴일 소득기준 계산', 'policy', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('1229회 로또 당첨번호 보험 적용 비용', 'life_tips', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('2026 KBO 올스타전 티켓팅 일정', 'sports', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('2026 KBO 올스타전 티켓팅 일정 렌탈 가격비교', 'sports', lottoGuardNow),
    JSON.stringify([
      __liveGoldenRadarTestInternals.debugSearchAdMeasurableLiveCandidate('2026 광복절 대체공휴일 최저가 구매처', 'policy', lottoGuardNow),
      __liveGoldenRadarTestInternals.debugSearchAdMeasurableLiveCandidate('2026 KBO 올스타전 티켓팅 일정 렌탈 가격비교', 'sports', lottoGuardNow),
    ]));
  assert('product ranking maintenance chains are rejected before SearchAd spend',
    !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('로봇청소기 순위 필터 교체주기', 'electronics', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('로봇청소기 가성비 필터 교체주기', 'electronics', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('추천 필터 교체주기', 'electronics', lottoGuardNow)
      && __liveGoldenRadarTestInternals.isHighYieldSearchAdSpendCandidate('로봇청소기 물걸레 가격비교', 'electronics', lottoGuardNow),
    JSON.stringify([
      __liveGoldenRadarTestInternals.debugSearchAdMeasurableLiveCandidate('로봇청소기 순위 필터 교체주기', 'electronics', lottoGuardNow),
      __liveGoldenRadarTestInternals.debugSearchAdMeasurableLiveCandidate('로봇청소기 물걸레 가격비교', 'electronics', lottoGuardNow),
    ]));

  let capturedIssueSeeds: string[] = [];
  const liveIssueRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 4,
    categories: ['all'],
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
    liveSeedProvider: async () => [
      'KIA 3연패 탈출! [up]',
      '1228회 로또 1등 당첨 11명 [new]',
      '파키스탄 총리 24시간 내 합의 예상 [new]',
    ],
    enableBackfill: false,
    discover: async (_config, options) => {
      capturedIssueSeeds = Array.isArray(options?.liveSeeds) ? options.liveSeeds : [];
      return [
        result('KIA 3연패 탈출 정리', 0),
        result('1228회 로또 당첨번호', 1),
        result('파키스탄 총리 합의 정리', 2),
      ];
    },
  });
  const liveIssueSnapshot = await liveIssueRadar.runOnce();
  assert('live radar blocks low-value issue seeds before measurement',
    capturedIssueSeeds.every((seed) => !/KIA|1228|로또|파키스탄/.test(seed))
      && !liveIssueSnapshot.board.some((item) => /KIA|1228|로또|파키스탄/.test(item.keyword)),
    `${capturedIssueSeeds.join('|')} :: ${liveIssueSnapshot.board.map((item) => `${item.keyword}:${item.category}`).join('|')}`);

  const opaqueBookingInbox = new MobileNotificationInbox({
    now: () => new Date('2026-06-20T04:30:00.000Z'),
  });
  const opaqueBookingKeyword = '\uAD70\uCCB4\uC608\uB9E4';
  const opaqueBookingRadar = new MobileLiveGoldenRadar({
    notificationInbox: opaqueBookingInbox,
    runOnStart: false,
    cycleLimit: 1,
    categories: ['shopping'],
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
    liveSeedProvider: async () => [opaqueBookingKeyword],
    enableBackfill: false,
    discover: async () => [{
      ...result(opaqueBookingKeyword, 0),
      grade: 'SSS',
      score: 99,
      searchVolume: 14890,
      pcSearchVolume: 1800,
      mobileSearchVolume: 13090,
      documentCount: 3265,
      goldenRatio: 4.56,
      category: 'shopping',
      source: 'mobile-live-issue-measured-radar',
    }],
  });
  const opaqueBookingSnapshot = await opaqueBookingRadar.runOnce();
  const opaqueBookingNotifications = opaqueBookingInbox.snapshot(10);
  assert('live radar blocks opaque title booking keywords even when miscategorized as shopping',
    opaqueBookingSnapshot.board.every((item) => item.keyword !== opaqueBookingKeyword)
      && opaqueBookingNotifications.items.every((item) => item.keyword !== opaqueBookingKeyword),
    JSON.stringify({
      board: opaqueBookingSnapshot.board.map((item) => item.keyword),
      notifications: opaqueBookingNotifications.items.map((item) => item.keyword),
    }));

  let fallbackMeasureCalls = 0;
  const liveIssueDocumentFallbackRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 4,
    categories: ['all'],
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
    liveSeedProvider: async () => [
      '\uC18C\uC0C1\uACF5\uC778 \uD2B9\uB840\uBCF4\uC99D \uC2E0\uCCAD [new]',
      '\uC5EC\uC131 \uCCAD\uC18C\uB144 \uC0DD\uB9AC\uC6A9\uD488 \uBC14\uC6B0\uCC98 \uC2E0\uCCAD [new]',
      '\uACE0\uC720\uAC00 \uD53C\uD574\uC9C0\uC6D0\uAE08 \uC2E0\uCCAD [new]',
    ],
    enableBackfill: false,
    discover: async () => [],
    measureLiveSearchVolumeSeparate: async () => [],
    measureLiveDocumentCount: async (keyword) => {
      fallbackMeasureCalls += 1;
      const isKia = keyword.includes('KIA');
      const dc = keyword.includes('\uB85C\uB610') ? 220 : keyword.includes('KIA') ? 360 : 640;
      return {
        dc: isKia ? 1 : dc,
        source: isKia ? 'fallback' : 'scrape',
        confidence: isKia ? 'low' : 'medium',
        isEstimated: isKia,
      };
    },
  });
  const liveIssueDocumentFallbackSnapshot = await liveIssueDocumentFallbackRadar.runOnce();
  assert('live issue document fallback does not enter the Pro board without measured search volume',
    fallbackMeasureCalls === 0
      && liveIssueDocumentFallbackSnapshot.board.every((item) => item.source !== 'mobile-live-issue-document-radar')
      && liveIssueDocumentFallbackSnapshot.board.every((item) => item.isMeasured && (item.totalSearchVolume || 0) > 0 && (item.documentCount || 0) > 0)
      && !liveIssueDocumentFallbackSnapshot.board.some((item) => /\uB4F1\uAE09\uCEF7|\uB2F5\uC9C0/.test(item.keyword)),
    liveIssueDocumentFallbackSnapshot.board.map((item) => `${item.keyword}:${item.source}:${item.documentCount}`).join('|'));

  let measuredFallbackVolumeCalls = 0;
  const liveIssueMeasuredFallbackRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 4,
    categories: ['all'],
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
    liveSeedProvider: async () => [
      '\uC18C\uC0C1\uACF5\uC778 \uD2B9\uB840\uBCF4\uC99D \uC2E0\uCCAD [new]',
      '\uC5EC\uC131 \uCCAD\uC18C\uB144 \uC0DD\uB9AC\uC6A9\uD488 \uBC14\uC6B0\uCC98 \uC2E0\uCCAD [new]',
      '\uACE0\uC720\uAC00 \uD53C\uD574\uC9C0\uC6D0\uAE08 \uC2E0\uCCAD [new]',
    ],
    enableBackfill: false,
    discover: async () => [],
    measureLiveSearchVolumeSeparate: async (_config, _keywords, options) => {
      measuredFallbackVolumeCalls += 1;
      assert('live issue measured fallback does not spend bulk document quota', options?.includeDocumentCount === false);
      return [
        {
          keyword: '\uC18C\uC0C1\uACF5\uC778 \uD2B9\uB840\uBCF4\uC99D \uC2E0\uCCAD \uBC29\uBC95',
          pcSearchVolume: 2400,
          mobileSearchVolume: 8600,
          documentCount: 420,
          competition: 'LOW',
          monthlyAveCpc: 120,
          searchVolumeSource: 'searchad',
          searchVolumeConfidence: 'high',
          isSearchVolumeEstimated: false,
          documentCountSource: 'scrape',
          documentCountConfidence: 'high',
          isDocumentCountEstimated: false,
        },
        {
          keyword: '\uC5EC\uC131 \uCCAD\uC18C\uB144 \uC0DD\uB9AC\uC6A9\uD488 \uBC14\uC6B0\uCC98 \uC2E0\uCCAD',
          pcSearchVolume: 11000,
          mobileSearchVolume: 27000,
          documentCount: 820,
          competition: 'LOW',
          monthlyAveCpc: 90,
          searchVolumeSource: 'searchad',
          searchVolumeConfidence: 'high',
          isSearchVolumeEstimated: false,
          documentCountSource: 'scrape',
          documentCountConfidence: 'high',
          isDocumentCountEstimated: false,
        },
        {
          keyword: '\uACE0\uC720\uAC00 \uD53C\uD574\uC9C0\uC6D0\uAE08 \uC2E0\uCCAD \uB300\uC0C1',
          pcSearchVolume: 1800,
          mobileSearchVolume: 5200,
          documentCount: 360,
          competition: 'LOW',
          monthlyAveCpc: 150,
          searchVolumeSource: 'searchad',
          searchVolumeConfidence: 'high',
          isSearchVolumeEstimated: false,
          documentCountSource: 'scrape',
          documentCountConfidence: 'high',
          isDocumentCountEstimated: false,
        },
      ];
    },
    measureLiveDocumentCount: async () => ({
      dc: 300,
      source: 'scrape',
      confidence: 'high',
      isEstimated: false,
    }),
  });
  const liveIssueMeasuredFallbackSnapshot = await liveIssueMeasuredFallbackRadar.runOnce();
  assert('live issue fallback is promoted only after measured search volume and document count are attached',
    measuredFallbackVolumeCalls > 0
      && liveIssueMeasuredFallbackSnapshot.board.length >= 2
      && liveIssueMeasuredFallbackSnapshot.board.every((item) => item.source === 'mobile-live-issue-measured-radar')
      && liveIssueMeasuredFallbackSnapshot.board.every((item) => item.isMeasured && (item.totalSearchVolume || 0) > 0 && (item.documentCount || 0) > 0)
      && liveIssueMeasuredFallbackSnapshot.board.every((item) => ['S+', 'S', 'A'].includes(String(item.valueGrade))),
    `${liveIssueMeasuredFallbackSnapshot.lastMessage || ''} :: ${liveIssueMeasuredFallbackSnapshot.board.map((item) => `${item.keyword}:${item.totalSearchVolume}:${item.documentCount}:${item.source}`).join('|')}`);
  assert('live issue measured fallback preserves searchad pc mobile split and cpc',
    liveIssueMeasuredFallbackSnapshot.board.some((item) => (
      item.keyword === '\uC18C\uC0C1\uACF5\uC778 \uD2B9\uB840\uBCF4\uC99D \uC2E0\uCCAD \uBC29\uBC95'
      && item.pcSearchVolume === 2400
      && item.mobileSearchVolume === 8600
      && item.cpc === 120
    )),
    liveIssueMeasuredFallbackSnapshot.board.map((item) => `${item.keyword}:${item.pcSearchVolume}:${item.mobileSearchVolume}:${item.cpc}`).join('|'));

  const publicQualityBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-public-quality-test.json');
  fs.writeFileSync(publicQualityBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-13T08:57:00.000Z',
    items: [
      ['청년미래적금 신청 대상', 'SSS', 98, 42000, 300, 140, 'policy'],
      ['소상공인 환급금 조회 방법', 'SSS', 96, 36000, 420, 85, 'policy'],
      ['KBO 올스타전 예매 일정', 'SS', 91, 28000, 700, 40, 'sports'],
      ['파키스탄 총리 합의 정리', 'A', 64, null, null, null, 'live_issue'],
      ['대전교도소 실탄 분실 현재 상황', 'A', 63, null, null, null, 'live_issue'],
      ['곽혈수 성폭행 징역 구형 관련주', 'A', 62, null, null, null, 'live_issue'],
      ['실시간 이슈 정리', 'B', 51, null, null, null, 'live_issue'],
    ].map(([keyword, grade, score, totalSearchVolume, documentCount, goldenRatio, category], index) => ({
      keyword,
      grade,
      score,
      totalSearchVolume,
      documentCount,
      goldenRatio,
      category,
      updatedAt: '2026-06-13T08:57:00.000Z',
      discoveredAt: '2026-06-13T08:57:00.000Z',
      isMeasured: index < 3,
    })),
  }), 'utf8');
  const publicQualityRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: publicQualityBoardFile,
    publicPreviewCount: 3,
    now: () => new Date('2026-06-13T09:00:00.000Z'),
  });
  const publicQualitySnapshot = publicQualityRadar.snapshot();
  assert('public preview excludes B grade and non-finance stock-tail issue keywords',
    !publicQualitySnapshot.board.some((item) => item.keyword.includes('관련주'))
      && publicQualitySnapshot.publicPreview.every((item) => !['B', 'C'].includes(item.grade)),
    publicQualitySnapshot.publicPreview.map((item) => `${item.keyword}:${item.grade}`).join('|'));
  fs.rmSync(publicQualityBoardFile, { force: true });

  const staleBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-stale-board-test.json');
  fs.mkdirSync(path.dirname(staleBoardFile), { recursive: true });
  fs.writeFileSync(staleBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-13T08:30:00.000Z',
    items: [
      {
        keyword: '6모 등급컷',
        grade: 'SSS',
        score: 91,
        totalSearchVolume: 12000,
        documentCount: 1200,
        goldenRatio: 10,
        category: 'education',
        updatedAt: '2026-06-08T07:39:17.894Z',
        discoveredAt: '2026-06-08T07:39:17.894Z',
        isMeasured: true,
      },
      {
        keyword: 'AI 영상툴 가격비교',
        grade: 'SSS',
        score: 99,
        totalSearchVolume: 3800,
        pcSearchVolume: 700,
        mobileSearchVolume: 3100,
        documentCount: 300,
        goldenRatio: 12.67,
        category: 'it',
        updatedAt: '2026-06-13T08:20:00.000Z',
        discoveredAt: '2026-06-13T08:20:00.000Z',
        isMeasured: true,
      },
    ],
  }), 'utf8');
  const staleRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: staleBoardFile,
    publicPreviewCount: 5,
    now: () => new Date('2026-06-13T09:00:00.000Z'),
  });
  const staleSnapshot = staleRadar.snapshot();
  assert('public preview hides stale repeated keywords and shows the available measured winner when the board is small',
    staleSnapshot.publicPreview.length === 1
      && staleSnapshot.publicPreview[0]?.keyword === 'AI \uC601\uC0C1\uD234 \uAC00\uACA9\uBE44\uAD50'
      && staleSnapshot.publicPreview.every((item) => item.pcSearchVolume !== null && item.mobileSearchVolume !== null),
    staleSnapshot.publicPreview.map((item) => `${item.keyword}:${item.updatedAt}`).join('|'));
  fs.rmSync(staleBoardFile, { force: true });

  const zeroScorePreviewBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-zero-score-preview-test.json');
  fs.writeFileSync(zeroScorePreviewBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-13T08:59:00.000Z',
    items: [
      ['월드컵 중계 일정', 'S', 65, 8600, 1200, 7.16, 'sports'],
      ['송지호바다하늘길입장료', 'SSS', 98, 2530, 157, 16.11, 'travel_domestic'],
      ['5월연말정산환급일', 'SSS', 0, 14060, 2274, 6.18, 'policy'],
      ['내일도 출근 웹툰', 'A', 0, 43470, 3169, 13.72, 'it'],
      ['2026근로장려금지급일', 'S', 67, 22390, 8283, 2.7, 'policy'],
      ['송지호바다하늘길주차', 'S', 74, 770, 307, 2.51, 'travel_domestic'],
      ['연말정산환급일', 'S', 0, 10920, 4026, 2.71, 'policy'],
    ].map(([keyword, grade, score, totalSearchVolume, documentCount, goldenRatio, category]) => ({
      keyword,
      grade,
      score,
      totalSearchVolume,
      pcSearchVolume: Math.max(10, Math.round(Number(totalSearchVolume) * 0.2)),
      mobileSearchVolume: Number(totalSearchVolume) - Math.max(10, Math.round(Number(totalSearchVolume) * 0.2)),
      documentCount,
      goldenRatio,
      category,
      source: 'fixture-persistent-measured-cache',
      evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      isDocumentCountEstimated: false,
      updatedAt: '2026-06-13T08:59:00.000Z',
      discoveredAt: '2026-06-13T08:59:00.000Z',
      isMeasured: true,
    })),
  }), 'utf8');
  const zeroScorePreviewRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: zeroScorePreviewBoardFile,
    boardTarget: 120,
    publicPreviewCount: 5,
    now: () => new Date('2026-06-13T09:00:00.000Z'),
  });
  const zeroScorePreviewSnapshot = zeroScorePreviewRadar.snapshot();
  assert('free preview refuses low-quality filler and recomputes missing persistent scores',
    zeroScorePreviewSnapshot.publicPreview.length > 0
      && zeroScorePreviewSnapshot.publicPreview.length <= 5
      && zeroScorePreviewSnapshot.publicPreview.every((item) => item.isMeasured && item.pcSearchVolume !== null && item.mobileSearchVolume !== null)
      && zeroScorePreviewSnapshot.publicPreview.every((item) => ['S+', 'S', 'A'].includes(String(item.valueGrade)))
      && zeroScorePreviewSnapshot.publicPreview.every((item) => Number(item.score) > 0),
    zeroScorePreviewSnapshot.publicPreview.map((item) => `${item.rank}:${item.keyword}:${item.score}`).join('|'));
  fs.rmSync(zeroScorePreviewBoardFile, { force: true });

  const proGapBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-pro-gap-test.json');
  fs.writeFileSync(proGapBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-13T08:50:00.000Z',
    items: [
      ['공휴일 병원 진료 조회', 'SS', 93, 3600, 520, 6.9, 'health'],
      ['청년미래적금 가입신청 대상', 'SSS', 99, 32000, 240, 133.3, 'policy'],
      ['소상공인 환급금 조회 방법', 'SSS', 98, 18000, 420, 42.8, 'policy'],
      ['근로장려금 지급일 조회', 'SSS', 97, 12000, 780, 15.3, 'policy'],
      ['여성 청소년 생리용품 바우처 신청', 'SSS', 96, 9000, 640, 14.1, 'policy'],
      ['AI 영상툴 가격비교', 'SS', 95, 6200, 520, 11.9, 'it'],
      ['제주 렌터카 가격비교', 'SS', 94, 4200, 560, 7.5, 'travel_domestic'],
      ['여름휴가 준비물 체크리스트', 'SS', 94, 2400, 420, 5.7, 'travel_domestic'],
      ['한국사 자격증 접수일정', 'S', 61, 1800, 520, 3.46, 'education'],
      ['공연 티켓 예매 일정', 'S', 60, 1600, 500, 3.2, 'entertainment'],
    ].map(([keyword, grade, score, totalSearchVolume, documentCount, goldenRatio, category]) => ({
      keyword,
      grade,
      score,
      totalSearchVolume,
      pcSearchVolume: Math.round(Number(totalSearchVolume) * 0.2),
      mobileSearchVolume: Number(totalSearchVolume) - Math.round(Number(totalSearchVolume) * 0.2),
      documentCount,
      goldenRatio,
      category,
      source: 'fixture-measured',
      evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      isDocumentCountEstimated: false,
      updatedAt: '2026-06-13T08:50:00.000Z',
      discoveredAt: '2026-06-13T08:50:00.000Z',
      isMeasured: true,
    })),
  }), 'utf8');
  const proGapRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: proGapBoardFile,
    publicPreviewCount: 3,
    now: () => new Date('2026-06-13T09:00:00.000Z'),
  });
  const proGapSnapshot = proGapRadar.snapshot();
  const protectedProKeywords = new Set(proGapSnapshot.board.slice(0, 3).map((item) => item.keyword));
  // 소프트 재랭킹(저볼륨·저경쟁 우선): 순수 고볼륨이 아니라 '경쟁도(문서수) + 볼륨 페널티'
  // 블렌드로 정렬된다. 최저 경쟁(문서수 240)이 선두를 지키되, 동급 조건에서는
  // 더 낮은 검색량이 더 높은 검색량을 앞선다.
  const proBoardKeywords = proGapSnapshot.board.map((item) => item.keyword);
  const idxLowerVolume = proBoardKeywords.indexOf('여성 청소년 생리용품 바우처 신청'); // 9,000
  const idxHigherVolume = proBoardKeywords.indexOf('소상공인 환급금 조회 방법');        // 18,000
  assert('pro board leads with lowest-competition winnable keyword',
    proGapSnapshot.board[0]?.keyword === '청년미래적금 가입신청 대상',
    proGapSnapshot.board.map((item) => `${item.rank}:${item.keyword}`).join('|'));
  assert('pro board soft re-rank never resurrects a value-gate rejection',
    idxLowerVolume < 0 || (idxHigherVolume >= 0 && idxLowerVolume < idxHigherVolume),
    `lowerVol(9k) idx=${idxLowerVolume} should precede higherVol(18k) idx=${idxHigherVolume}`);
  assert('free preview samples lower measured winners while hiding pro top tier',
    proGapSnapshot.publicPreview.length === 3
      && proGapSnapshot.publicPreview.every((item) => !protectedProKeywords.has(item.keyword))
      && proGapSnapshot.publicPreview.every((item) => item.rank > 3 && item.isMeasured && ['SSS', 'SS', 'S'].includes(item.grade)),
    proGapSnapshot.publicPreview.map((item) => `${item.rank}:${item.keyword}`).join('|'));
  fs.rmSync(proGapBoardFile, { force: true });

  const previewLeakBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-preview-leak-test.json');
  fs.writeFileSync(previewLeakBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-13T08:55:00.000Z',
    items: [
      ['청년미래적금 신청 대상', 'SSS', 99, 42000, 300, 140, 'policy'],
      ['소상공인 환급금 조회 방법', 'SSS', 98, 36000, 420, 85, 'policy'],
      ['근로장려금 지급일 조회', 'SSS', 97, 28000, 700, 40, 'policy'],
      ['지역 축제 주차 위치', 'SS', 96, 5400, 700, 7.7, 'travel_domestic'],
      ['여름 휴가 준비물 체크리스트', 'SS', 95, 5200, 720, 7.2, 'travel_domestic'],
      ['공휴일 병원 진료 조회', 'SS', 94, 4600, 680, 6.8, 'health'],
      ['자격증 접수 마감일', 'SS', 94, 4400, 640, 6.9, 'education'],
      ['월드컵 중계 일정', 'SS', 94, 4200, 620, 6.8, 'sports'],
      ['전기요금 환급 조회 방법', 'SS', 93, 3900, 610, 6.4, 'finance'],
      ['공연 티켓 예매 일정', 'SS', 92, 3600, 590, 6.1, 'entertainment'],
    ].map(([keyword, grade, score, totalSearchVolume, documentCount, goldenRatio, category], index) => ({
      keyword,
      grade,
      score,
      totalSearchVolume,
      pcSearchVolume: Math.round(Number(totalSearchVolume) * 0.2),
      mobileSearchVolume: Number(totalSearchVolume) - Math.round(Number(totalSearchVolume) * 0.2),
      documentCount,
      goldenRatio,
      category,
      source: 'fixture-measured',
      evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      isDocumentCountEstimated: false,
      updatedAt: index < 3 ? '2026-06-13T08:55:00.000Z' : '2026-06-10T08:55:00.000Z',
      discoveredAt: index < 3 ? '2026-06-13T08:55:00.000Z' : '2026-06-10T08:55:00.000Z',
      isMeasured: true,
    })),
  }), 'utf8');
  const previewLeakRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: previewLeakBoardFile,
    publicPreviewCount: 5,
    now: () => new Date('2026-06-13T09:00:00.000Z'),
  });
  const previewLeakSnapshot = previewLeakRadar.snapshot();
  const protectedPreviewLeakKeywords = new Set(
    previewLeakSnapshot.board.slice(0, 3).map((item) => item.keyword),
  );
  assert('free preview shows measured lower winners without leaking the pro head',
    previewLeakSnapshot.publicPreview.length === 5
      && previewLeakSnapshot.publicPreview.every((item) => item.isMeasured && item.searchVolumeSource === 'searchad' && item.documentCountSource === 'naver-api')
      && previewLeakSnapshot.publicPreview.every((item) => !protectedPreviewLeakKeywords.has(item.keyword)),
    previewLeakSnapshot.publicPreview.map((item) => `${item.rank}:${item.keyword}`).join('|'));
  fs.rmSync(previewLeakBoardFile, { force: true });

  const movingPreviewBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-moving-preview-test.json');
  const movingRows = [
    ['청년미래적금 신청 대상', 'SSS', 99, 42000, 300, 140, 'policy'],
    ['소상공인 환급금 조회 방법', 'SSS', 98, 36000, 420, 85, 'policy'],
    ['근로장려금 지급일 조회', 'SSS', 97, 28000, 700, 40, 'policy'],
    ['월드컵 중계 일정', 'SSS', 96, 9600, 780, 12.3, 'sports'],
    ['홍명보 감독 후보', 'SS', 95, 8600, 760, 11.3, 'sports'],
    ['공휴일 병원 진료 조회', 'SS', 94, 7200, 680, 10.5, 'health'],
    ['한국사 자격증 접수일정', 'SS', 94, 6400, 660, 9.7, 'education'],
    ['문화누리카드 잔액조회', 'SS', 93, 5400, 620, 8.7, 'policy'],
    ['전기요금 환급 조회 방법', 'SS', 93, 4600, 590, 7.8, 'finance'],
    ['공연 티켓 예매 일정', 'SS', 92, 4200, 560, 7.5, 'entertainment'],
    ['여름휴가 준비물 체크리스트', 'S', 91, 3600, 540, 6.6, 'life_tips'],
  ];
  fs.writeFileSync(movingPreviewBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-13T08:59:00.000Z',
    items: movingRows.map(([keyword, grade, score, totalSearchVolume, documentCount, goldenRatio, category]) => ({
      keyword,
      grade,
      score,
      totalSearchVolume,
      pcSearchVolume: Math.round(Number(totalSearchVolume) * 0.2),
      mobileSearchVolume: Number(totalSearchVolume) - Math.round(Number(totalSearchVolume) * 0.2),
      documentCount,
      goldenRatio,
      category,
      source: 'fixture-measured',
      evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      isDocumentCountEstimated: false,
      updatedAt: '2026-06-13T08:59:00.000Z',
      discoveredAt: '2026-06-13T08:59:00.000Z',
      isMeasured: true,
    })),
  }), 'utf8');
  const movingPreviewRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: movingPreviewBoardFile,
    boardTarget: 60,
    publicPreviewCount: 5,
    now: () => new Date('2026-06-13T09:00:00.000Z'),
  });
  const movingPreviewSnapshot = movingPreviewRadar.snapshot();
  assert('free preview protects only the pro head and rotates fresh lower winners',
    movingPreviewSnapshot.publicPreview.length === 5
      && movingPreviewSnapshot.publicPreview.every((item) => item.rank > 3)
      && movingPreviewSnapshot.publicPreview.some((item) => item.rank <= 8)
      && movingPreviewSnapshot.publicPreview.every((item) => item.updatedAt === '2026-06-13T08:59:00.000Z'),
    movingPreviewSnapshot.publicPreview.map((item) => `${item.rank}:${item.keyword}`).join('|'));
  fs.rmSync(movingPreviewBoardFile, { force: true });

  const categoryDiversityBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-category-diversity-test.json');
  const categoryDiversityRows = [
    ['청년지원금 신청 대상', 'SSS', 98, 38000, 240, 158, 'policy'],
    ['소상공인 환급 조회 방법', 'SSS', 97, 32000, 260, 123, 'policy'],
    ['근로장려금 지급일 조회', 'SSS', 96, 28000, 300, 93, 'policy'],
    ['국민지원금 신청 서류', 'SSS', 95, 25000, 320, 78, 'policy'],
    ['고용지원금 마감 일정', 'SSS', 94, 23000, 340, 67, 'policy'],
    ['환급금 조회 방법', 'SSS', 93, 21000, 360, 58, 'policy'],
    ['수능 원서접수 준비물 체크리스트', 'SSS', 96, 9000, 700, 12, 'education'],
    ['국가장학금 신청 서류', 'SSS', 96, 8600, 760, 11, 'education'],
    ['자격증 접수 마감일', 'SS', 95, 4600, 900, 5.1, 'education'],
    ['제주 렌터카 가격비교', 'SSS', 96, 8200, 720, 11, 'travel_domestic'],
    ['지역 축제 주차 위치', 'SS', 95, 7800, 740, 10, 'travel_domestic'],
    ['여름휴가 준비물 체크리스트', 'SS', 94, 4200, 840, 5, 'travel_domestic'],
    ['공휴일 병원 진료 조회', 'SS', 95, 7200, 800, 9, 'health'],
    ['AI 영상툴 가격비교', 'SS', 95, 3900, 620, 6.3, 'it'],
    ['무선청소기 가격비교', 'SS', 94, 3600, 600, 6, 'electronics'],
    ['전기요금 환급 조회 방법', 'SS', 94, 3300, 540, 6.1, 'finance'],
    ['에어컨 청소 비용 비교', 'SS', 94, 3100, 500, 6.2, 'home_life'],
    ['자동차보험 환급 조회 방법', 'SS', 94, 3000, 480, 6.25, 'finance'],
    ['도수치료 보험 적용 비용', 'SS', 95, 5200, 620, 8.4, 'health'],
    ['임플란트 보험 적용 가격비교', 'SS', 94, 4800, 580, 8.2, 'health'],
  ];
  fs.writeFileSync(categoryDiversityBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-13T08:58:00.000Z',
    items: categoryDiversityRows.map(([keyword, grade, score, totalSearchVolume, documentCount, goldenRatio, category]) => ({
      keyword,
      grade,
      score,
      totalSearchVolume,
      pcSearchVolume: Math.round(Number(totalSearchVolume) * 0.2),
      mobileSearchVolume: Number(totalSearchVolume) - Math.round(Number(totalSearchVolume) * 0.2),
      documentCount,
      goldenRatio,
      category,
      source: 'fixture-measured',
      evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      isDocumentCountEstimated: false,
      updatedAt: '2026-06-13T08:58:00.000Z',
      discoveredAt: '2026-06-13T08:58:00.000Z',
      isMeasured: true,
    })),
  }), 'utf8');
  const categoryDiversityRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: categoryDiversityBoardFile,
    boardTarget: 12,
    publicPreviewCount: 5,
    now: () => new Date('2026-06-13T09:00:00.000Z'),
  });
  const categoryDiversitySnapshot = categoryDiversityRadar.snapshot();
  const policyCount = categoryDiversitySnapshot.board.filter((item) => item.category === 'policy').length;
  const uniqueCategories = new Set(categoryDiversitySnapshot.board.map((item) => item.category));
  assert('pro live golden board caps one-category flooding before filling diverse winners',
    categoryDiversitySnapshot.board.length >= 8
      && policyCount <= 3
      && uniqueCategories.size >= 5,
    categoryDiversitySnapshot.board.map((item) => `${item.rank}:${item.category}:${item.keyword}`).join('|'));
  fs.rmSync(categoryDiversityBoardFile, { force: true });

  const semanticClusterBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-semantic-cluster-test.json');
  const supportSignalRoot = '\uCCAD\uB144\uBBF8\uB798\uC801\uAE08';
  const semanticClusterRows = [
    [`${supportSignalRoot} \uAC00\uC785\uC2E0\uCCAD \uB300\uC0C1`, 'SSS', 99, 42000, 400, 105, 'policy'],
    [`${supportSignalRoot} \uAC00\uC785\uC2E0\uCCAD \uC11C\uB958`, 'SSS', 98, 39000, 420, 92, 'policy'],
    [`${supportSignalRoot} \uC2E0\uCCAD \uC870\uAC74`, 'SSS', 98, 39000, 421, 92, 'policy'],
    [`${supportSignalRoot} \uC9C0\uAE09\uC77C \uC870\uD68C`, 'SSS', 97, 36000, 430, 83, 'policy'],
    [`${supportSignalRoot} \uC2E0\uCCAD \uBC29\uBC95`, 'SSS', 96, 33000, 440, 75, 'policy'],
    [`${supportSignalRoot} \uB9C8\uAC10\uC77C`, 'SSS', 95, 30000, 450, 66, 'policy'],
    ['\uADFC\uB85C\uC7A5\uB824\uAE08 \uC9C0\uAE09\uC77C \uC870\uD68C', 'SSS', 98, 26000, 360, 72, 'policy'],
    ['\uC7A5\uB9C8 \uC900\uBE44\uBB3C \uCCB4\uD06C\uB9AC\uC2A4\uD2B8', 'SS', 96, 12000, 700, 17, 'life_tips'],
    ['\uC18C\uC0C1\uACF5\uC778 \uD658\uAE09\uAE08 \uC870\uD68C \uBC29\uBC95', 'SS', 96, 9000, 650, 13, 'policy'],
    ['\uC6D4\uB4DC\uCEF5 \uC911\uACC4 \uC77C\uC815', 'SS', 95, 3900, 760, 5.1, 'sports'],
    ['\uC815\uBD80\uC9C0\uC6D0\uAE08 \uC2E0\uCCAD \uC11C\uB958', 'SS', 95, 3500, 640, 5.5, 'policy'],
    ['AI \uC601\uC0C1\uD234 \uAC00\uACA9\uBE44\uAD50', 'SS', 95, 3400, 560, 6.1, 'it'],
    ['\uD55C\uAD6D\uC0AC \uC790\uACA9\uC99D \uC811\uC218\uC77C\uC815', 'SS', 94, 3200, 520, 6.1, 'education'],
    ['\uB3C4\uC218\uCE58\uB8CC \uBCF4\uD5D8 \uC801\uC6A9 \uBE44\uC6A9', 'SS', 95, 5200, 620, 8.4, 'health'],
    ['\uC804\uAE30\uC694\uAE08 \uD658\uAE09 \uC870\uD68C \uBC29\uBC95', 'SS', 94, 3600, 600, 6, 'finance'],
    ['\uACF5\uC5F0 \uD2F0\uCF13 \uC608\uB9E4 \uC77C\uC815', 'SS', 94, 3100, 500, 6.2, 'entertainment'],
    ['\uACF5\uD734\uC77C \uBCD1\uC6D0 \uC9C4\uB8CC \uC870\uD68C', 'SS', 94, 3000, 480, 6.25, 'health'],
  ];
  fs.writeFileSync(semanticClusterBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-13T08:59:00.000Z',
    items: semanticClusterRows.map(([keyword, grade, score, totalSearchVolume, documentCount, goldenRatio, category]) => ({
      keyword,
      grade,
      score,
      totalSearchVolume,
      pcSearchVolume: Math.round(Number(totalSearchVolume) * 0.2),
      mobileSearchVolume: Number(totalSearchVolume) - Math.round(Number(totalSearchVolume) * 0.2),
      documentCount,
      goldenRatio,
      category,
      source: 'fixture-measured',
      evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      isDocumentCountEstimated: false,
      updatedAt: '2026-06-13T08:59:00.000Z',
      discoveredAt: '2026-06-13T08:59:00.000Z',
      isMeasured: true,
    })),
  }), 'utf8');
  const semanticClusterRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: semanticClusterBoardFile,
    boardTarget: 10,
    publicPreviewCount: 5,
    now: () => new Date('2026-06-13T09:00:00.000Z'),
  });
  const semanticClusterSnapshot = semanticClusterRadar.snapshot();
  const semanticClusterCompactKeywords = semanticClusterSnapshot.board.map((item) => item.keyword.replace(/\s+/g, ''));
  const supportSignalCount = semanticClusterCompactKeywords.filter((keyword) => keyword.includes(supportSignalRoot)).length;
  assert('pro live golden board caps same-issue suffix variants by semantic cluster',
    semanticClusterSnapshot.board.length >= 5 && supportSignalCount <= 2,
    semanticClusterSnapshot.board.map((item) => `${item.rank}:${item.keyword}`).join('|'));
  assert('public live golden preview fills lower measured slots after semantic clustering',
    semanticClusterSnapshot.publicPreview.length === 5
      && semanticClusterSnapshot.publicPreview.every((item) => item.rank > 3)
      && semanticClusterSnapshot.publicPreview.every((item) => item.isMeasured && item.searchVolumeSource === 'searchad' && item.documentCountSource === 'naver-api'),
    semanticClusterSnapshot.publicPreview.map((item) => `${item.rank}:${item.keyword}`).join('|'));
  fs.rmSync(semanticClusterBoardFile, { force: true });

  const measuredOnlyBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-measured-only-test.json');
  const measuredOnlyRows = [
    ['\uCCAD\uB144\uBBF8\uB798\uC801\uAE08 \uAC00\uC785\uC2E0\uCCAD \uB300\uC0C1', 'SSS', 98, 26000, 360, 72, 'policy', true],
    ['\uACF5\uD734\uC77C \uBCD1\uC6D0 \uC9C4\uB8CC \uC870\uD68C', 'SS', 95, 15000, 900, 16, 'health', true],
    ['\uC7A5\uB9C8 \uC900\uBE44\uBB3C \uCCB4\uD06C\uB9AC\uC2A4\uD2B8', 'SS', 95, 12000, 700, 17, 'life_tips', true],
    ['\uBB38\uC11C\uB9CC \uC788\uB294 \uC774\uC288 \uC815\uB9AC', 'SSS', 99, null, 80, 0, 'issue', true],
    ['\uAC80\uC0C9\uB7C9 0 \uD6C4\uBCF4 \uC870\uD68C', 'SSS', 98, 0, 120, 0, 'policy', true],
    ['\uBB38\uC11C\uC218 0 \uD6C4\uBCF4 \uC2E0\uCCAD', 'SSS', 97, 5000, 0, 0, 'policy', true],
    ['\uCE21\uC815\uB300\uAE30 \uD6C4\uBCF4 \uC2E0\uCCAD', 'SSS', 96, null, null, 0, 'policy', false],
  ];
  fs.writeFileSync(measuredOnlyBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-13T09:01:00.000Z',
    items: measuredOnlyRows.map(([keyword, grade, score, totalSearchVolume, documentCount, goldenRatio, category, isMeasured]) => ({
      keyword,
      grade,
      score,
      totalSearchVolume,
      pcSearchVolume: Number(totalSearchVolume) > 0 ? Math.round(Number(totalSearchVolume) * 0.2) : totalSearchVolume,
      mobileSearchVolume: Number(totalSearchVolume) > 0 ? Number(totalSearchVolume) - Math.round(Number(totalSearchVolume) * 0.2) : totalSearchVolume,
      documentCount,
      goldenRatio,
      category,
      source: 'fixture-measured',
      evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
      searchVolumeSource: Number(totalSearchVolume) > 0 ? 'searchad' : undefined,
      searchVolumeConfidence: Number(totalSearchVolume) > 0 ? 'high' : undefined,
      isSearchVolumeEstimated: false,
      documentCountSource: Number(documentCount) > 0 ? 'naver-api' : undefined,
      documentCountConfidence: Number(documentCount) > 0 ? 'high' : undefined,
      isDocumentCountEstimated: false,
      updatedAt: '2026-06-13T09:01:00.000Z',
      discoveredAt: '2026-06-13T09:01:00.000Z',
      isMeasured,
    })),
  }), 'utf8');
  const measuredOnlyRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: measuredOnlyBoardFile,
    boardTarget: 6,
    publicPreviewCount: 5,
    now: () => new Date('2026-06-13T09:02:00.000Z'),
  });
  const measuredOnlySnapshot = measuredOnlyRadar.snapshot();
  assert('pro live golden board keeps only fully measured search volume and document count rows',
    measuredOnlySnapshot.board.length === 3
      && measuredOnlySnapshot.board.every((item) => item.isMeasured && (item.totalSearchVolume || 0) > 0 && (item.documentCount || 0) > 0)
      && !measuredOnlySnapshot.board.some((item) => /0 \uD6C4\uBCF4|\uCE21\uC815\uB300\uAE30|\uBB38\uC11C\uB9CC/.test(item.keyword)),
    measuredOnlySnapshot.board.map((item) => `${item.rank}:${item.keyword}:${item.totalSearchVolume}:${item.documentCount}`).join('|'));
  fs.rmSync(measuredOnlyBoardFile, { force: true });

  const contentDiversityBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-content-diversity-test.json');
  const contentDiversityRows = [
    ['\uD558\uD2B8\uC2DC\uADF8\uB1105 \uBA87\uBD80\uC791', 'SSS', 99, 42000, 400, 105, 'drama'],
    ['\uC0C8\uBCBD\uC758\uC57D\uC18D \uCD9C\uC5F0\uC9C4', 'SSS', 95, 30000, 450, 66, 'drama'],
    ['\uCCAD\uB144\uBBF8\uB798\uC801\uAE08 \uAC00\uC785\uC2E0\uCCAD \uB300\uC0C1', 'SSS', 99, 24000, 360, 66, 'policy'],
    ['\uADFC\uB85C\uC7A5\uB824\uAE08 \uC9C0\uAE09\uC77C \uC870\uD68C', 'SSS', 98, 21000, 420, 50, 'policy'],
    ['\uC7A5\uB9C8 \uC900\uBE44\uBB3C \uCCB4\uD06C\uB9AC\uC2A4\uD2B8', 'SS', 97, 12000, 700, 17, 'life_tips'],
    ['\uC81C\uC8FC \uB80C\uD130\uCE74 \uAC00\uACA9\uBE44\uAD50', 'SS', 96, 8200, 620, 13.2, 'travel_domestic'],
    ['AI \uC601\uC0C1\uD234 \uAC00\uACA9\uBE44\uAD50', 'SS', 96, 7200, 560, 12.8, 'it'],
    ['\uC5EC\uB984 \uC120\uD06C\uB9BC \uCD94\uCC9C \uD6C4\uAE30', 'SS', 95, 6200, 580, 10.6, 'beauty'],
    ['\uB3C4\uC218\uCE58\uB8CC \uBCF4\uD5D8 \uC801\uC6A9 \uBE44\uC6A9', 'SS', 95, 5200, 620, 8.4, 'health'],
    ['\uBB34\uC120\uCCAD\uC18C\uAE30 \uAC00\uACA9\uBE44\uAD50', 'SS', 94, 3600, 590, 6.1, 'electronics'],
    ['\uC5D0\uC5B4\uCEE8 \uCCAD\uC18C \uBE44\uC6A9 \uBE44\uAD50', 'SS', 94, 3100, 500, 6.2, 'home_life'],
    ['\uACF5\uD734\uC77C \uBCD1\uC6D0 \uC9C4\uB8CC \uC870\uD68C', 'SS', 94, 3000, 480, 6.25, 'health'],
    ['\uC790\uACA9\uC99D \uC811\uC218 \uB9C8\uAC10\uC77C', 'SS', 94, 2800, 460, 6.1, 'education'],
    ['\uAC24\uB7ED\uC2DC \uD0ED \uAC00\uACA9 \uBE44\uAD50', 'SS', 94, 2600, 420, 6.2, 'electronics'],
  ];
  fs.writeFileSync(contentDiversityBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-13T09:03:00.000Z',
    items: contentDiversityRows.map(([keyword, grade, score, totalSearchVolume, documentCount, goldenRatio, category]) => ({
      keyword,
      grade,
      score,
      totalSearchVolume,
      pcSearchVolume: Math.round(Number(totalSearchVolume) * 0.2),
      mobileSearchVolume: Number(totalSearchVolume) - Math.round(Number(totalSearchVolume) * 0.2),
      documentCount,
      goldenRatio,
      category,
      source: 'fixture-measured',
      evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      isDocumentCountEstimated: false,
      updatedAt: '2026-06-13T09:03:00.000Z',
      discoveredAt: '2026-06-13T09:03:00.000Z',
      isMeasured: true,
    })),
  }), 'utf8');
  const contentDiversityRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: contentDiversityBoardFile,
    boardTarget: 12,
    publicPreviewCount: 5,
    now: () => new Date('2026-06-13T09:04:00.000Z'),
  });
  const contentDiversitySnapshot = contentDiversityRadar.snapshot();
  const episodeLookupCount = contentDiversitySnapshot.board.filter((item) => /\uBA87\uBD80\uC791/.test(item.keyword)).length;
  const contentLookupCount = contentDiversitySnapshot.board.filter((item) => /(?:\uBA87\uBD80\uC791|\uCD9C\uC5F0\uC9C4|\uBC29\uC1A1\uC2DC\uAC04|\uC7AC\uBC29\uC1A1|\uB2E4\uC2DC\uBCF4\uAE30|\uACB0\uB9D0|\uCFE0\uD0A4\uC601\uC0C1|\uC6D0\uC791|\uB4F1\uC7A5\uC778\uBB3C|\uC778\uBB3C\uAD00\uACC4\uB3C4|\uACF5\uC2DD\uC601\uC0C1)/.test(item.keyword)).length;
  const contentDiversityCategories = new Set(contentDiversitySnapshot.board.map((item) => item.category));
  assert('pro live golden board prevents drama episode lookup flooding while keeping diverse measured winners',
    contentDiversitySnapshot.board.length >= 7
      && episodeLookupCount === 0
      && contentLookupCount === 0
      && contentDiversityCategories.size >= 6
      && contentDiversitySnapshot.board.every((item) => item.isMeasured && (item.totalSearchVolume || 0) > 0 && (item.documentCount || 0) > 0),
    contentDiversitySnapshot.board.map((item) => `${item.rank}:${item.category}:${item.keyword}`).join('|'));
  fs.rmSync(contentDiversityBoardFile, { force: true });

  const actionableGradeGateBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-actionable-grade-gate-test.json');
  const actionableGradeRows = [
    ['멋진신세계몇부작', 'SSS', 99, 189300, 766, 247.13, 'drama'],
    ['참교육몇부작', 'SSS', 98, 57880, 798, 72.53, 'drama'],
    ['신입사원강회장출연진', 'SSS', 97, 20030, 456, 43.93, 'drama'],
    ['KBO올스타전하이라이트', 'SSS', 96, 19440, 177, 109.83, 'sports'],
    ['청년미래적금 가입신청 대상', 'SSS', 99, 26000, 360, 72, 'policy'],
    ['송지호바다하늘길입장료', 'SSS', 98, 9500, 115, 82.6, 'travel_domestic'],
    ['제주 렌터카 가격비교', 'SSS', 97, 21000, 850, 24, 'travel_domestic'],
    ['육아휴직급여 지급일', 'SSS', 96, 12000, 620, 19.35, 'policy'],
  ];
  fs.writeFileSync(actionableGradeGateBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-15T08:00:00.000Z',
    items: actionableGradeRows.map(([keyword, grade, score, totalSearchVolume, documentCount, goldenRatio, category]) => ({
      keyword,
      grade,
      score,
      totalSearchVolume,
      pcSearchVolume: Math.round(Number(totalSearchVolume) * 0.2),
      mobileSearchVolume: Number(totalSearchVolume) - Math.round(Number(totalSearchVolume) * 0.2),
      documentCount,
      goldenRatio,
      category,
      source: 'fixture-measured',
      evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      isDocumentCountEstimated: false,
      updatedAt: '2026-06-15T08:00:00.000Z',
      discoveredAt: '2026-06-15T08:00:00.000Z',
      isMeasured: true,
    })),
  }), 'utf8');
  const actionableGradeGateRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: actionableGradeGateBoardFile,
    boardTarget: 8,
    publicPreviewCount: 5,
    now: () => new Date('2026-06-15T09:00:00.000Z'),
  });
  const actionableGradeGateSnapshot = actionableGradeGateRadar.snapshot();
  const gradeByKeyword = new Map(actionableGradeGateSnapshot.board.map((item) => [item.keyword, item.grade]));
  assert('cached live board removes pure content lookup issue rows',
    !actionableGradeGateSnapshot.board.some((item) => /몇부작|출연진|하이라이트|KBO/.test(item.keyword))
      && gradeByKeyword.get('청년미래적금 가입신청 대상') === 'SSS'
      && gradeByKeyword.get('송지호바다하늘길입장료') === 'SSS',
    actionableGradeGateSnapshot.board.map((item) => `${item.keyword}:${item.grade}`).join('|'));
  fs.rmSync(actionableGradeGateBoardFile, { force: true });

  const broadHeadCapBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-broad-head-cap-test.json');
  fs.writeFileSync(broadHeadCapBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-15T08:00:00.000Z',
    items: [
      ['\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30', 'SSS', 99, 20010, 1318, 15.18, 'policy'],
      ['\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30 \uD504\uB9AC\uB79C\uC11C \uC2E4\uC218\uB839\uC561', 'SSS', 98, 6400, 380, 16.84, 'policy'],
    ].map(([keyword, grade, score, totalSearchVolume, documentCount, goldenRatio, category]) => ({
      keyword,
      grade,
      score,
      totalSearchVolume,
      pcSearchVolume: Math.round(Number(totalSearchVolume) * 0.22),
      mobileSearchVolume: Number(totalSearchVolume) - Math.round(Number(totalSearchVolume) * 0.22),
      documentCount,
      goldenRatio,
      category,
      source: 'fixture-measured',
      evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      isDocumentCountEstimated: false,
      updatedAt: '2026-06-15T08:00:00.000Z',
      discoveredAt: '2026-06-15T08:00:00.000Z',
      isMeasured: true,
    })),
  }), 'utf8');
  const broadHeadCapRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: broadHeadCapBoardFile,
    boardTarget: 2,
    publicPreviewCount: 2,
    now: () => new Date('2026-06-15T09:00:00.000Z'),
  });
  const broadHeadCapSnapshot = broadHeadCapRadar.snapshot();
  const broadHeadGradeByKeyword = new Map(broadHeadCapSnapshot.board.map((item) => [item.keyword, item.grade]));
  assert('broad one-word need heads are capped below SSS while compound longtails keep SSS',
    broadHeadGradeByKeyword.get('\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30') !== 'SSS'
      && broadHeadGradeByKeyword.get('\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30 \uD504\uB9AC\uB79C\uC11C \uC2E4\uC218\uB839\uC561') === 'SSS',
    broadHeadCapSnapshot.board.map((item) => `${item.keyword}:${item.grade}`).join('|'));
  assert('compound writer-ready longtails outrank broad calculator heads',
    broadHeadCapSnapshot.board[0]?.keyword === '\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30 \uD504\uB9AC\uB79C\uC11C \uC2E4\uC218\uB839\uC561',
    broadHeadCapSnapshot.board.map((item) => `${item.rank}:${item.keyword}:${item.grade}`).join('|'));
  const broadHeadFallbackRejected = !__liveGoldenRadarTestInternals.isMeasuredProBoardFallbackMetric({
    keyword: '\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30',
    grade: 'SS',
    score: 95,
    pcSearchVolume: 4020,
    mobileSearchVolume: 15990,
    totalSearchVolume: 20010,
    documentCount: 1318,
    goldenRatio: 15.18,
    category: 'policy',
    source: 'fixture-measured',
    evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
    searchVolumeSource: 'searchad',
    searchVolumeConfidence: 'high',
    isSearchVolumeEstimated: false,
    documentCountSource: 'naver-api',
    documentCountConfidence: 'high',
    isDocumentCountEstimated: false,
    updatedAt: '2026-06-15T08:00:00.000Z',
    discoveredAt: '2026-06-15T08:00:00.000Z',
    isMeasured: true,
  } as any, new Date('2026-06-15T09:00:00.000Z'));
  const compoundLongtailFallbackAccepted = __liveGoldenRadarTestInternals.isMeasuredProBoardFallbackMetric({
    keyword: '\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30 \uD504\uB9AC\uB79C\uC11C \uC2E4\uC218\uB839\uC561',
    grade: 'SSS',
    score: 98,
    pcSearchVolume: 1280,
    mobileSearchVolume: 5120,
    totalSearchVolume: 6400,
    documentCount: 380,
    goldenRatio: 16.84,
    category: 'policy',
    source: 'fixture-measured',
    evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
    searchVolumeSource: 'searchad',
    searchVolumeConfidence: 'high',
    isSearchVolumeEstimated: false,
    documentCountSource: 'naver-api',
    documentCountConfidence: 'high',
    isDocumentCountEstimated: false,
    updatedAt: '2026-06-15T08:00:00.000Z',
    discoveredAt: '2026-06-15T08:00:00.000Z',
    isMeasured: true,
  } as any, new Date('2026-06-15T09:00:00.000Z'));
  assert('measured fallback rejects broad head calculators and keeps compound earning-intent longtails',
    broadHeadFallbackRejected && compoundLongtailFallbackAccepted,
    JSON.stringify({ broadHeadFallbackRejected, compoundLongtailFallbackAccepted }));
  const exactFallbackIntentAccepted = __liveGoldenRadarTestInternals.isMeasuredExactDisplayFallbackMetric({
    keyword: '\uAD6D\uBBFC\uB0B4\uC77C\uBC30\uC6C0\uCE74\uB4DC\uC0AC\uC6A9\uCC98',
    grade: 'A',
    score: 71,
    pcSearchVolume: 1360,
    mobileSearchVolume: 2140,
    totalSearchVolume: 3500,
    documentCount: 900,
    goldenRatio: 3.89,
    category: 'policy',
    source: 'fixture-measured-exact',
    evidence: ['fixture-searchad-volume', 'fixture-cache-document-count'],
    searchVolumeSource: 'searchad',
    searchVolumeConfidence: 'high',
    isSearchVolumeEstimated: false,
    documentCountSource: 'cache',
    documentCountConfidence: 'medium',
    isDocumentCountEstimated: false,
    updatedAt: '2026-06-15T08:00:00.000Z',
    discoveredAt: '2026-06-15T08:00:00.000Z',
    isMeasured: true,
  } as any, new Date('2026-06-15T09:00:00.000Z'));
  const exactFallbackCalculatorRejected = !__liveGoldenRadarTestInternals.isMeasuredExactDisplayFallbackMetric({
    keyword: '\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30',
    grade: 'SS',
    score: 98,
    pcSearchVolume: 7610,
    mobileSearchVolume: 12400,
    totalSearchVolume: 20010,
    documentCount: 1318,
    goldenRatio: 15.18,
    category: 'insurance_safe',
    source: 'fixture-measured-exact',
    evidence: ['fixture-searchad-volume', 'fixture-cache-document-count'],
    searchVolumeSource: 'searchad',
    searchVolumeConfidence: 'high',
    isSearchVolumeEstimated: false,
    documentCountSource: 'cache',
    documentCountConfidence: 'medium',
    isDocumentCountEstimated: false,
    updatedAt: '2026-06-15T08:00:00.000Z',
    discoveredAt: '2026-06-15T08:00:00.000Z',
    isMeasured: true,
  } as any, new Date('2026-06-15T09:00:00.000Z'));
  const exactFallbackNeedsPcMobileSplit = !__liveGoldenRadarTestInternals.isMeasuredExactDisplayFallbackMetric({
    keyword: '\uC81C\uC8FC\uACF5\uD56D\uB80C\uD2B8\uCE74\uCD94\uCC9C',
    grade: 'A',
    score: 65,
    pcSearchVolume: 0,
    mobileSearchVolume: 0,
    totalSearchVolume: 440,
    documentCount: 120,
    goldenRatio: 3.67,
    category: 'travel_domestic',
    source: 'fixture-measured-exact',
    evidence: ['fixture-searchad-volume', 'fixture-cache-document-count'],
    searchVolumeSource: 'searchad',
    searchVolumeConfidence: 'high',
    isSearchVolumeEstimated: false,
    documentCountSource: 'cache',
    documentCountConfidence: 'medium',
    isDocumentCountEstimated: false,
    updatedAt: '2026-06-15T08:00:00.000Z',
    discoveredAt: '2026-06-15T08:00:00.000Z',
    isMeasured: true,
  } as any, new Date('2026-06-15T09:00:00.000Z'));
  const exactFallbackPromotionAcceptsPendingSplit = __liveGoldenRadarTestInternals.isMeasuredExactDisplayPromotionCandidate({
    keyword: '\uC81C\uC8FC\uACF5\uD56D\uB80C\uD2B8\uCE74\uCD94\uCC9C',
    grade: 'A',
    score: 65,
    pcSearchVolume: 0,
    mobileSearchVolume: 0,
    totalSearchVolume: 440,
    documentCount: 120,
    goldenRatio: 3.67,
    category: 'travel_domestic',
    source: 'fixture-measured-exact',
    evidence: ['fixture-searchad-volume', 'fixture-cache-document-count'],
    searchVolumeSource: 'searchad',
    searchVolumeConfidence: 'high',
    isSearchVolumeEstimated: false,
    documentCountSource: 'cache',
    documentCountConfidence: 'medium',
    isDocumentCountEstimated: false,
    updatedAt: '2026-06-15T08:00:00.000Z',
    discoveredAt: '2026-06-15T08:00:00.000Z',
    isMeasured: true,
  } as any, new Date('2026-06-15T09:00:00.000Z'));
  assert('measured exact display fallback keeps real split rows, rejects calculator heads, and queues pending split rows',
    exactFallbackIntentAccepted
      && exactFallbackCalculatorRejected
      && exactFallbackNeedsPcMobileSplit
      && exactFallbackPromotionAcceptsPendingSplit,
    JSON.stringify({
      exactFallbackIntentAccepted,
      exactFallbackCalculatorRejected,
      exactFallbackNeedsPcMobileSplit,
      exactFallbackPromotionAcceptsPendingSplit,
    }));
  fs.rmSync(broadHeadCapBoardFile, { force: true });

  const referenceProbeBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-reference-probe-test.json');
  const referenceProbeQueueFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-reference-probe-queue-test.json');
  const referenceProbeTarget = '\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30 \uD504\uB9AC\uB79C\uC11C \uC2E4\uC218\uB839\uC561';
  fs.writeFileSync(referenceProbeBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-15T08:00:00.000Z',
    items: [{
      keyword: '\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30',
      grade: 'SS',
      score: 95,
      totalSearchVolume: 20010,
      pcSearchVolume: 4020,
      mobileSearchVolume: 15990,
      documentCount: 1318,
      goldenRatio: 15.18,
      category: 'policy',
      source: 'fixture-measured-broad-head',
      evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      isDocumentCountEstimated: false,
      updatedAt: '2026-06-15T08:00:00.000Z',
      discoveredAt: '2026-06-15T08:00:00.000Z',
      isMeasured: true,
    }],
  }), 'utf8');
  fs.rmSync(referenceProbeQueueFile, { force: true });
  const referenceProbeMeasuredKeywords: string[] = [];
  const referenceProbeRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: referenceProbeBoardFile,
    probeQueueFile: referenceProbeQueueFile,
    boardTarget: 10,
    cycleLimit: 4,
    categories: ['all'],
    enableBackfill: true,
    now: () => new Date('2026-06-15T09:00:00.000Z'),
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
      naverSearchAdAccessLicense: 'access',
      naverSearchAdSecretKey: 'secret',
    }),
    liveSeedProvider: async () => [],
    autocompleteProvider: async () => [],
    searchAdSuggestionProvider: async () => [],
    measureLiveSearchVolumeSeparate: async (_config, keywords, options) => {
      assert('reference-derived probe volume pass keeps document count separated', options?.includeDocumentCount === false);
      referenceProbeMeasuredKeywords.push(...keywords);
      return keywords
        .filter((keyword) => keyword === referenceProbeTarget)
        .map((keyword) => ({
          keyword,
          pcSearchVolume: 1280,
          mobileSearchVolume: 5120,
          documentCount: null,
          competition: 'LOW',
          monthlyAveCpc: 320,
          searchVolumeSource: 'searchad',
          searchVolumeConfidence: 'high',
          isSearchVolumeEstimated: false,
        }));
    },
    measureLiveDocumentCount: async (keyword) => (
      keyword === referenceProbeTarget
        ? {
          dc: 380,
          source: 'scrape',
          confidence: 'high',
          isEstimated: false,
        }
        : null
    ),
    discover: async () => [],
  });
  const referenceProbeSnapshot = await referenceProbeRadar.runOnce();
  assert('measured broad references are converted into writer-ready SSS probe measurements',
    referenceProbeMeasuredKeywords.includes(referenceProbeTarget)
      && referenceProbeSnapshot.board.some((item) => (
        item.keyword === referenceProbeTarget
        && item.grade === 'SSS'
        && item.pcSearchVolume === 1280
        && item.mobileSearchVolume === 5120
        && item.documentCount === 380
      )),
    JSON.stringify({
      measured: referenceProbeMeasuredKeywords.slice(0, 30),
      board: referenceProbeSnapshot.board.map((item) => `${item.keyword}:${item.grade}:${item.pcSearchVolume}:${item.mobileSearchVolume}:${item.documentCount}`),
      lastMessage: referenceProbeSnapshot.lastMessage,
    }));
  fs.rmSync(referenceProbeBoardFile, { force: true });
  fs.rmSync(referenceProbeQueueFile, { force: true });

  const adsenseReadinessBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-adsense-readiness-test.json');
  fs.writeFileSync(adsenseReadinessBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-15T08:00:00.000Z',
    items: [
      ['1228\uD68C\uB85C\uB610\uB2F9\uCCA8\uBC88\uD638', 'SSS', 99, 22740, 268, 84.85, 'life_tips'],
      ['\uBA4B\uC9C4\uC2E0\uC138\uACC4\uBA87\uBD80\uC791', 'SSS', 99, 189300, 766, 247.13, 'drama'],
      ['2026KBO\uC62C\uC2A4\uD0C0\uC804\uD558\uC774\uB77C\uC774\uD2B8', 'SSS', 96, 19440, 177, 109.83, 'sports'],
      ['\uC2E0\uC785\uC0AC\uC6D0\uAC15\uD68C\uC7A5\uCD9C\uC5F0\uC9C4', 'SSS', 97, 20030, 456, 43.93, 'drama'],
      ['\uCCAD\uB144\uBBF8\uB798\uC801\uAE08 \uAC00\uC785\uC2E0\uCCAD \uB300\uC0C1', 'SSS', 99, 26000, 360, 72, 'policy'],
      ['\uC1A1\uC9C0\uD638\uBC14\uB2E4\uD558\uB298\uAE38\uC785\uC7A5\uB8CC', 'SSS', 98, 9500, 115, 82.6, 'travel_domestic'],
      ['\uC81C\uC8FC \uB80C\uD130\uCE74 \uAC00\uACA9\uBE44\uAD50', 'SSS', 97, 21000, 850, 24, 'travel_domestic'],
      ['\uC721\uC544\uD734\uC9C1\uAE09\uC5EC \uC9C0\uAE09\uC77C', 'SSS', 96, 12000, 620, 19.35, 'policy'],
      ['\uBB34\uC120\uCCAD\uC18C\uAE30 \uAC00\uACA9\uBE44\uAD50', 'SSS', 95, 16000, 590, 27.12, 'electronics'],
    ].map(([keyword, grade, score, totalSearchVolume, documentCount, goldenRatio, category]) => ({
      keyword,
      grade,
      score,
      totalSearchVolume,
      pcSearchVolume: Math.round(Number(totalSearchVolume) * 0.2),
      mobileSearchVolume: Number(totalSearchVolume) - Math.round(Number(totalSearchVolume) * 0.2),
      documentCount,
      goldenRatio,
      category,
      source: 'fixture-measured',
      evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      isDocumentCountEstimated: false,
      updatedAt: '2026-06-15T08:00:00.000Z',
      discoveredAt: '2026-06-15T08:00:00.000Z',
      isMeasured: true,
    })),
  }), 'utf8');
  const adsenseReadinessRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: adsenseReadinessBoardFile,
    boardTarget: 6,
    publicPreviewCount: 5,
    now: () => new Date('2026-06-15T09:00:00.000Z'),
  });
  const adsenseReadinessSnapshot = adsenseReadinessRadar.snapshot();
  const adsenseTopKeywords = adsenseReadinessSnapshot.board.slice(0, 5).map((item) => item.keyword);
  assert('live golden board ranks adsense-ready need keywords over one-shot lookup traffic',
    adsenseTopKeywords.includes('\uCCAD\uB144\uBBF8\uB798\uC801\uAE08 \uAC00\uC785\uC2E0\uCCAD \uB300\uC0C1')
      && adsenseTopKeywords.includes('\uC1A1\uC9C0\uD638\uBC14\uB2E4\uD558\uB298\uAE38\uC785\uC7A5\uB8CC')
      && adsenseTopKeywords.includes('\uC81C\uC8FC \uB80C\uD130\uCE74 \uAC00\uACA9\uBE44\uAD50')
      && adsenseTopKeywords.includes('\uBB34\uC120\uCCAD\uC18C\uAE30 \uAC00\uACA9\uBE44\uAD50')
      && !adsenseTopKeywords.some((keyword) => /\uB85C\uB610|\uBA87\uBD80\uC791|\uD558\uC774\uB77C\uC774\uD2B8|\uCD9C\uC5F0\uC9C4/.test(keyword)),
    adsenseReadinessSnapshot.board.map((item) => `${item.rank}:${item.keyword}:${item.grade}`).join('|'));
  assert('lookup-heavy live board rows are removed even when raw ratio is high',
    !adsenseReadinessSnapshot.board.some((item) => /1228|\uB85C\uB610|\uBA87\uBD80\uC791|\uD558\uC774\uB77C\uC774\uD2B8|\uCD9C\uC5F0\uC9C4|KBO/.test(item.keyword)),
    adsenseReadinessSnapshot.board.map((item) => `${item.keyword}:${item.grade}`).join('|'));
  fs.rmSync(adsenseReadinessBoardFile, { force: true });

  const nearUltimateBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-near-ultimate-test.json');
  fs.writeFileSync(nearUltimateBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-21T17:04:21.000Z',
    items: [
      {
        keyword: '\uCCAD\uB144\uBBF8\uB798\uC801\uAE08 \uAC00\uC785\uC2E0\uCCAD \uB300\uC0C1',
        grade: 'S',
        score: 100,
        totalSearchVolume: 60000,
        pcSearchVolume: 12000,
        mobileSearchVolume: 48000,
        documentCount: 12000,
        goldenRatio: 5,
        cpc: 0,
        category: 'policy',
        source: 'pc-keyword-analysis-exact',
        intent: 'requested-keyword',
        evidence: [
          'pc-searchad-volume',
          'pc-naver-openapi-document-count',
          'clear-searcher-action-intent',
          'ultimate-high-value-need-intent',
        ],
        searchVolumeSource: 'searchad',
        searchVolumeConfidence: 'high',
        isSearchVolumeEstimated: false,
        documentCountSource: 'naver-api',
        documentCountConfidence: 'high',
        isDocumentCountEstimated: false,
        aiJudge: {
          verdict: 'publish',
          score: 100,
          confidence: 0.9,
          needIntent: 'strong',
          blogAngle: 'actionable',
          shoppingIntent: 'low',
          adsenseValue: 'high',
          freshnessRisk: 'low',
          spamRisk: 'low',
          reasons: ['ultimate-high-value-need-intent'],
          model: 'fixture',
          checkedAt: '2026-06-21T17:04:21.000Z',
        },
        updatedAt: '2026-06-21T17:04:21.000Z',
        discoveredAt: '2026-06-21T17:04:21.000Z',
        isMeasured: true,
      },
    ],
  }), 'utf8');
  const nearUltimateRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: nearUltimateBoardFile,
    boardTarget: 5,
    publicPreviewCount: 5,
    now: () => new Date('2026-06-21T17:10:00.000Z'),
  });
  const nearUltimateSnapshot = nearUltimateRadar.snapshot();
  assert('live golden board uses near-ultimate measured fallback when strict 98 board is empty',
    nearUltimateSnapshot.board.some((item) => item.keyword === '\uCCAD\uB144\uBBF8\uB798\uC801\uAE08 \uAC00\uC785\uC2E0\uCCAD \uB300\uC0C1'),
    nearUltimateSnapshot.board.map((item) => `${item.rank}:${item.keyword}:${item.totalSearchVolume}:${item.documentCount}`).join('|'));
  fs.rmSync(nearUltimateBoardFile, { force: true });

  const persistentKeywordCacheFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-persistent-keyword-cache-test.json');
  fs.writeFileSync(persistentKeywordCacheFile, JSON.stringify({
    __schemaVersion: 'test-cache',
    '\uCCAD\uB144\uBBF8\uB798\uC801\uAE08 \uAC00\uC785\uC2E0\uCCAD \uB300\uC0C1': {
      searchVolume: 26000,
      pcSearchVolume: 5200,
      mobileSearchVolume: 20800,
      documentCount: 360,
      category: 'policy',
      source: 'fixture-measured',
      evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      isDocumentCountEstimated: false,
    },
    'KBO \uC62C\uC2A4\uD0C0\uC804 \uC608\uB9E4 \uC77C\uC815': {
      searchVolume: 15000,
      documentCount: 900,
      category: 'sports',
    },
    '\uC7A5\uB9C8 \uC900\uBE44\uBB3C \uCCB4\uD06C\uB9AC\uC2A4\uD2B8': {
      searchVolume: 12000,
      pcSearchVolume: 2400,
      mobileSearchVolume: 9600,
      documentCount: 700,
      category: 'life_tips',
      source: 'fixture-measured',
      evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      isDocumentCountEstimated: false,
    },
    '\uC81C\uC8FC \uB80C\uD130\uCE74 \uAC00\uACA9\uBE44\uAD50': {
      searchVolume: 21000,
      pcSearchVolume: 4200,
      mobileSearchVolume: 16800,
      documentCount: 850,
      category: 'travel_domestic',
      source: 'fixture-measured',
      evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      isDocumentCountEstimated: false,
    },
    '\uBB34\uC120\uCCAD\uC18C\uAE30 \uAC00\uACA9\uBE44\uAD50': {
      searchVolume: 16000,
      pcSearchVolume: 3200,
      mobileSearchVolume: 12800,
      documentCount: 590,
      category: 'electronics',
      source: 'fixture-measured',
      evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      isDocumentCountEstimated: false,
    },
    '\uC5EC\uB984 \uC120\uD06C\uB9BC \uCD94\uCC9C': {
      searchVolume: 19000,
      pcSearchVolume: 3800,
      mobileSearchVolume: 15200,
      documentCount: 680,
      category: 'beauty',
      source: 'fixture-measured',
      evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      isDocumentCountEstimated: false,
    },
    '\uCD08\uBCF5 \uC0BC\uACC4\uD0D5 \uC608\uC57D \uCD94\uCC9C': {
      searchVolume: 18000,
      pcSearchVolume: 3600,
      mobileSearchVolume: 14400,
      documentCount: 740,
      category: 'food',
      source: 'fixture-measured',
      evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      isDocumentCountEstimated: false,
    },
    '\uCF58\uC11C\uD2B8 \uC608\uB9E4 \uC77C\uC815': {
      searchVolume: 17500,
      pcSearchVolume: 3500,
      mobileSearchVolume: 14000,
      documentCount: 640,
      category: 'music',
      source: 'fixture-measured',
      evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      isDocumentCountEstimated: false,
    },
    '\uB3C4\uC218\uCE58\uB8CC \uBCF4\uD5D8 \uC801\uC6A9 \uBE44\uC6A9': {
      searchVolume: 5200,
      pcSearchVolume: 1040,
      mobileSearchVolume: 4160,
      documentCount: 620,
      category: 'health',
      source: 'fixture-measured',
      evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      isDocumentCountEstimated: false,
    },
    'AI \uC601\uC0C1\uD234 \uAC00\uACA9\uBE44\uAD50': {
      searchVolume: 7200,
      pcSearchVolume: 1440,
      mobileSearchVolume: 5760,
      documentCount: 560,
      category: 'it',
      source: 'fixture-measured',
      evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      isDocumentCountEstimated: false,
    },
    '1227\uD68C \uB85C\uB610 \uB2F9\uCCA8\uBC88\uD638': {
      searchVolume: 45000,
      documentCount: 300,
      category: 'lottery',
    },
    '1227\uD68C': {
      searchVolume: 4590,
      documentCount: 1175,
      category: 'lottery',
    },
    '2027 6\uBAA8 \uB4F1\uAE09\uCEF7': {
      searchVolume: 208800,
      documentCount: 3147,
      category: 'education',
    },
    '20276\uBAA8': {
      searchVolume: 25640,
      documentCount: 117,
      category: 'education',
    },
  }), 'utf8');
  const persistentKeywordCacheRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    keywordCacheFile: persistentKeywordCacheFile,
    boardTarget: 8,
    publicPreviewCount: 5,
    now: () => new Date('2026-06-15T09:00:00.000Z'),
  });
  const persistentKeywordCacheSnapshot = persistentKeywordCacheRadar.snapshot();
  assert('persistent measured keyword cache backfills diverse pro rows with real metrics',
    persistentKeywordCacheSnapshot.board.length >= 7
      && persistentKeywordCacheSnapshot.board.every((item) => item.isMeasured && (item.totalSearchVolume || 0) > 0 && (item.documentCount || 0) > 0)
      && persistentKeywordCacheSnapshot.board.every((item) => ['S+', 'S', 'A'].includes(String(item.valueGrade)))
      && new Set(persistentKeywordCacheSnapshot.board.map((item) => item.category)).size >= 6,
    persistentKeywordCacheSnapshot.board.map((item) => `${item.rank}:${item.category}:${item.keyword}:${item.totalSearchVolume}:${item.documentCount}`).join('|'));
  assert('persistent measured keyword cache rejects stale lotto and future exam rows',
    !persistentKeywordCacheSnapshot.board.some((item) => /1227\uD68C|2027\s*6\uBAA8|20276\uBAA8/.test(item.keyword)),
    persistentKeywordCacheSnapshot.board.map((item) => `${item.rank}:${item.keyword}`).join('|'));
  fs.rmSync(persistentKeywordCacheFile, { force: true });

  const splitEnrichmentCacheFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-split-enrichment-test.json');
  const splitEnrichmentBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-split-enrichment-board-test.json');
  fs.rmSync(splitEnrichmentBoardFile, { force: true });
  fs.writeFileSync(splitEnrichmentCacheFile, JSON.stringify({
    __schemaVersion: 'test-cache',
    '\uCCAD\uB144\uBBF8\uB798\uC801\uAE08 \uAC00\uC785\uC2E0\uCCAD \uB300\uC0C1': {
      searchVolume: 26000,
      documentCount: 360,
      category: 'policy',
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      isDocumentCountEstimated: false,
    },
    '\uC81C\uC8FC \uB80C\uD130\uCE74 \uAC00\uACA9\uBE44\uAD50': {
      searchVolume: 21000,
      documentCount: 850,
      category: 'travel_domestic',
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      isDocumentCountEstimated: false,
    },
  }), 'utf8');
  let splitEnrichmentCalls = 0;
  const splitEnrichmentRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: splitEnrichmentBoardFile,
    keywordCacheFile: splitEnrichmentCacheFile,
    categories: ['policy'],
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
      naverSearchAdAccessLicense: 'access',
      naverSearchAdSecretKey: 'secret-key',
    }),
    liveSeedProvider: async () => [],
    enableBackfill: false,
    discover: async () => [],
    realDemandProbe: async () => ({
      ok: true,
      suggestions: ['청년미래적금'],
    }),
    measureLiveSearchVolumeSeparate: async (_config, keywords, options) => {
      splitEnrichmentCalls += 1;
      assert('split enrichment does not spend document-count quota', options?.includeDocumentCount === false);
      return keywords.map((keyword) => {
        if (keyword.includes('\uCCAD\uB144\uBBF8\uB798\uC801\uAE08')) {
          return {
            keyword,
            pcSearchVolume: 4200,
            mobileSearchVolume: 21800,
            documentCount: null,
            competition: 'LOW',
            monthlyAveCpc: 740,
          };
        }
        return {
          keyword,
          pcSearchVolume: 0,
          mobileSearchVolume: 0,
          documentCount: null,
          competition: 'LOW',
          monthlyAveCpc: 0,
        };
      });
    },
  });
  const splitEnrichmentSnapshot = await splitEnrichmentRadar.runOnce();
  assert('trusted cache reaches real searchad split without autocomplete echo or estimated documents',
    splitEnrichmentCalls > 0
      && splitEnrichmentSnapshot.board.some((item) => (
        item.keyword === '\uCCAD\uB144\uBBF8\uB798\uC801\uAE08 \uAC00\uC785\uC2E0\uCCAD \uB300\uC0C1'
        && item.pcSearchVolume === 4200
        && item.mobileSearchVolume === 21800
        && item.documentCount === 360
        && item.cpc === 740
      ))
      && !splitEnrichmentSnapshot.board.some((item) => (
        item.keyword === '\uC81C\uC8FC \uB80C\uD130\uCE74 \uAC00\uACA9\uBE44\uAD50'
      )),
    splitEnrichmentSnapshot.board.map((item) => `${item.keyword}:${item.pcSearchVolume}:${item.mobileSearchVolume}:${item.documentCount}:${item.cpc}`).join('|'));
  const restartedMeasuredKeywords: string[] = [];
  const restartedSplitEnrichmentRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: splitEnrichmentBoardFile,
    keywordCacheFile: splitEnrichmentCacheFile,
    categories: ['policy'],
    getEnvConfig: () => ({ naverClientId: 'client', naverClientSecret: 'secret' }),
    liveSeedProvider: async () => [],
    enableBackfill: false,
    discover: async () => [],
    measureLiveSearchVolumeSeparate: async (_config, keywords) => {
      restartedMeasuredKeywords.push(...keywords);
      return keywords.map((keyword) => ({
        keyword,
        pcSearchVolume: 0,
        mobileSearchVolume: 0,
        documentCount: null,
        competition: 'LOW',
        monthlyAveCpc: 0,
      }));
    },
  });
  await restartedSplitEnrichmentRadar.runOnce();
  assert('zero split cache rows are not measured again after worker restart',
    !restartedMeasuredKeywords.includes('\uC81C\uC8FC \uB80C\uD130\uCE74 \uAC00\uACA9\uBE44\uAD50'),
    JSON.stringify(restartedMeasuredKeywords));
  const zeroOnlyCatchupBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-zero-only-catchup-board-test.json');
  fs.rmSync(zeroOnlyCatchupBoardFile, { force: true });
  let zeroOnlyCatchupCalls = 0;
  const zeroOnlyCatchupRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: zeroOnlyCatchupBoardFile,
    keywordCacheFile: splitEnrichmentCacheFile,
    boardTarget: 60,
    categories: ['policy'],
    getEnvConfig: () => ({ naverClientId: 'client', naverClientSecret: 'secret' }),
    liveSeedProvider: async () => [],
    enableBackfill: true,
    discover: async () => [],
    realDemandProbe: async () => ({ ok: true, suggestions: [] }),
    measureLiveSearchVolumeSeparate: async (_config, keywords, options) => {
      zeroOnlyCatchupCalls += 1;
      assert('zero-only catch-up spends split measurement without document-count quota', options?.includeDocumentCount === false);
      return keywords.map((keyword) => ({
        keyword,
        pcSearchVolume: 0,
        mobileSearchVolume: 0,
        documentCount: null,
        competition: 'LOW',
        monthlyAveCpc: 0,
      }));
    },
  });
  const zeroOnlyCatchupSnapshot = await zeroOnlyCatchupRadar.runUntilTarget(2);
  assert('zero-only cache progress continues the bounded catch-up cycle without cooldown wait',
    zeroOnlyCatchupCalls > 0 && zeroOnlyCatchupSnapshot.totalRuns === 2,
    `calls=${zeroOnlyCatchupCalls},totalRuns=${zeroOnlyCatchupSnapshot.totalRuns},message=${zeroOnlyCatchupSnapshot.lastMessage}`);
  fs.rmSync(splitEnrichmentCacheFile, { force: true });
  fs.rmSync(splitEnrichmentBoardFile, { force: true });
  fs.rmSync(splitEnrichmentBoardFile.replace(/\.json$/, '') + '-realdemand.json', { force: true });
  fs.rmSync(zeroOnlyCatchupBoardFile, { force: true });
  fs.rmSync(zeroOnlyCatchupBoardFile.replace(/\.json$/, '') + '-realdemand.json', { force: true });

  const underfilledCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-phase1d-cache-'));
  const underfilledBoardFile = path.join(underfilledCacheDir, 'live-golden-board.json');
  const underfilledKeywordCacheFile = path.join(underfilledCacheDir, 'keyword-cache.json');
  const underfilledProbeQueueFile = path.join(underfilledCacheDir, 'live-golden-probe-queue.json');
  const underfilledVisibleItem = {
    ...previewBoardItem('제주 렌터카 완전자차 가격비교', 'travel_domestic', 0),
    discoveredAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:00:00.000Z',
  };
  fs.writeFileSync(underfilledBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-07-14T00:00:00.000Z',
    items: [underfilledVisibleItem],
  }), 'utf8');
  fs.writeFileSync(underfilledKeywordCacheFile, JSON.stringify({
    __schemaVersion: 'phase1d-underfilled-cache',
    '청년미래적금 가입신청 대상': {
      searchVolume: 26000,
      documentCount: 360,
      category: 'finance',
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      isDocumentCountEstimated: false,
    },
  }), 'utf8');
  const underfilledMeasuredKeywords: string[] = [];
  const underfilledCacheRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: underfilledBoardFile,
    keywordCacheFile: underfilledKeywordCacheFile,
    probeQueueFile: underfilledProbeQueueFile,
    boardTarget: 60,
    publicPreviewCount: 1,
    categories: ['health'],
    now: () => new Date('2026-07-14T01:00:00.000Z'),
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
    liveSeedProvider: async () => [],
    enableBackfill: false,
    discover: async () => [],
    measureLiveSearchVolumeSeparate: async (_config, keywords, options) => {
      assert('underfilled cache recovery spends only split measurement', options?.includeDocumentCount === false);
      underfilledMeasuredKeywords.push(...keywords);
      return keywords.map((keyword) => ({
        keyword,
        pcSearchVolume: 4200,
        mobileSearchVolume: 21800,
        documentCount: null,
        competition: 'LOW',
        monthlyAveCpc: 740,
      }));
    },
  });
  const underfilledCacheSnapshot = await underfilledCacheRadar.runOnce();
  assert('visible but underfilled board promotes trusted persistent cache toward Phase 2 entry',
    underfilledMeasuredKeywords.includes('청년미래적금 가입신청 대상')
      && underfilledCacheSnapshot.board.some((item) => (
        item.keyword === '청년미래적금 가입신청 대상'
        && item.pcSearchVolume === 4200
        && item.mobileSearchVolume === 21800
      )),
    JSON.stringify({ measured: underfilledMeasuredKeywords, board: underfilledCacheSnapshot.board.map((item) => item.keyword) }));
  fs.rmSync(underfilledCacheDir, { recursive: true, force: true });

  const cachePromotionFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-cache-promotion-test.json');
  fs.writeFileSync(cachePromotionFile, JSON.stringify({
    __schemaVersion: 'server-cache-no-provenance-fixture',
    '\uC8FC\uD734\uC218\uB2F9\uACC4\uC0B0\uAE30': {
      searchVolume: 87600,
      documentCount: 12230,
      category: 'policy',
      source: 'persistent-keyword-cache',
      evidence: ['persistent-keyword-cache', 'measured-search-volume', 'measured-document-count'],
    },
    '\uC8FC\uD734\uC218\uB2F9\uACC4\uC0B0\uAE30 \uC54C\uBC14 \uC790\uB3D9\uACC4\uC0B0': {
      searchVolume: 6200,
      documentCount: 190,
      category: 'policy',
      source: 'persistent-keyword-cache',
      evidence: ['persistent-keyword-cache', 'measured-search-volume', 'measured-document-count'],
    },
    '\uADFC\uBB34\uC2DC\uAC04\uACC4\uC0B0\uAE30': {
      searchVolume: 4490,
      documentCount: 527,
      category: 'policy',
      source: 'persistent-keyword-cache',
      evidence: ['persistent-keyword-cache', 'measured-search-volume', 'measured-document-count'],
    },
    '\uC704\uB2C9\uC2A4\uCC3D\uBB38\uD615\uC5D0\uC5B4\uCEE8': {
      searchVolume: 10980,
      documentCount: 3575,
      category: 'electronics',
      source: 'persistent-keyword-cache',
      evidence: ['persistent-keyword-cache', 'measured-search-volume', 'measured-document-count'],
    },
    '\uACE0\uC6A9\uCD09\uC9C4\uC7A5\uB824\uAE08\uC790\uACA9': {
      searchVolume: 20,
      documentCount: 13945,
      category: 'policy',
      source: 'persistent-keyword-cache',
      evidence: ['persistent-keyword-cache', 'measured-search-volume', 'measured-document-count'],
    },
  }), 'utf8');
  let cachePromotionSplitCalls = 0;
  let cachePromotionDiscoverCalls = 0;
  const cachePromotionMeasuredKeywords: string[] = [];
  const cachePromotionRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    keywordCacheFile: cachePromotionFile,
    boardTarget: 10,
    publicPreviewCount: 5,
    categories: ['policy'],
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
    liveSeedProvider: async () => [],
    enableBackfill: false,
    discover: async () => {
      cachePromotionDiscoverCalls += 1;
      return [];
    },
    measureLiveSearchVolumeSeparate: async (_config, keywords, options) => {
      cachePromotionSplitCalls += 1;
      cachePromotionMeasuredKeywords.push(...keywords);
      assert('cache promotion uses search volume split only', options?.includeDocumentCount === false);
      return keywords
        .filter((keyword) => keyword === '\uC8FC\uD734\uC218\uB2F9\uACC4\uC0B0\uAE30'
          || keyword === '\uC8FC\uD734\uC218\uB2F9\uACC4\uC0B0\uAE30 \uC54C\uBC14 \uC790\uB3D9\uACC4\uC0B0'
          || keyword === '\uADFC\uBB34\uC2DC\uAC04\uACC4\uC0B0\uAE30')
        .map((keyword) => keyword === '\uC8FC\uD734\uC218\uB2F9\uACC4\uC0B0\uAE30'
          ? {
            keyword,
            pcSearchVolume: 16500,
            mobileSearchVolume: 71100,
            documentCount: null,
            competition: 'LOW',
            monthlyAveCpc: 180,
          }
          : keyword === '\uC8FC\uD734\uC218\uB2F9\uACC4\uC0B0\uAE30 \uC54C\uBC14 \uC790\uB3D9\uACC4\uC0B0'
            ? {
              keyword,
              pcSearchVolume: 1100,
              mobileSearchVolume: 5100,
              documentCount: null,
              competition: 'LOW',
              monthlyAveCpc: 260,
            }
          : {
            keyword,
            pcSearchVolume: 820,
            mobileSearchVolume: 3670,
            documentCount: null,
            competition: 'LOW',
            monthlyAveCpc: 120,
          });
    },
  });
  const cachePromotionSnapshot = await cachePromotionRadar.runOnce();
  assert('persistent measured cache rows without provenance promote only writer-intent longtails after SearchAd pc/mobile split',
    cachePromotionSplitCalls > 0
      && cachePromotionSnapshot.board.some((item) => (
        item.keyword === '\uC8FC\uD734\uC218\uB2F9\uACC4\uC0B0\uAE30 \uC54C\uBC14 \uC790\uB3D9\uACC4\uC0B0'
        && item.pcSearchVolume === 1100
        && item.mobileSearchVolume === 5100
        && item.totalSearchVolume === 6200
        && item.documentCount === 190
        && item.searchVolumeSource === 'searchad'
        && item.searchVolumeConfidence === 'high'
        && item.documentCountSource === 'cache'
        && item.documentCountConfidence === 'medium'
        && item.aiJudge?.verdict === 'publish'
      ))
      && cachePromotionSnapshot.publicPreview.some((item) => item.keyword === '\uC8FC\uD734\uC218\uB2F9\uACC4\uC0B0\uAE30 \uC54C\uBC14 \uC790\uB3D9\uACC4\uC0B0')
      && !cachePromotionSnapshot.board.some((item) => item.keyword === '\uC8FC\uD734\uC218\uB2F9\uACC4\uC0B0\uAE30')
      && !cachePromotionSnapshot.board.some((item) => item.keyword === '\uC704\uB2C9\uC2A4\uCC3D\uBB38\uD615\uC5D0\uC5B4\uCEE8'),
    JSON.stringify({
      splitCalls: cachePromotionSplitCalls,
      measured: cachePromotionMeasuredKeywords,
      board: cachePromotionSnapshot.board.map((item) => `${item.keyword}:${item.pcSearchVolume}:${item.mobileSearchVolume}:${item.totalSearchVolume}:${item.documentCount}:${item.documentCountSource}:${item.aiJudge?.verdict}`),
      publicPreview: cachePromotionSnapshot.publicPreview.map((item) => item.keyword),
      lastMessage: cachePromotionSnapshot.lastMessage,
    }));
  assert('cache promotion keeps hunting when SSS-ready board depth is still short',
    cachePromotionDiscoverCalls === 1,
    `${cachePromotionDiscoverCalls}:${cachePromotionSnapshot.lastMessage}`);
  assert('cache promotion skips low-volume persistent policy tails before SearchAd spend',
    !cachePromotionMeasuredKeywords.some((keyword) => keyword === '\uACE0\uC6A9\uCD09\uC9C4\uC7A5\uB824\uAE08\uC790\uACA9'),
    cachePromotionMeasuredKeywords.join('|'));
  assert('cache promotion preflight skips rows guaranteed to fail the publishable longtail gate',
    !cachePromotionMeasuredKeywords.includes('\uC8FC\uD734\uC218\uB2F9\uACC4\uC0B0\uAE30')
      && !cachePromotionMeasuredKeywords.includes('\uADFC\uBB34\uC2DC\uAC04\uACC4\uC0B0\uAE30')
      && cachePromotionMeasuredKeywords.includes('\uC8FC\uD734\uC218\uB2F9\uACC4\uC0B0\uAE30 \uC54C\uBC14 \uC790\uB3D9\uACC4\uC0B0'),
    cachePromotionMeasuredKeywords.join('|'));
  fs.rmSync(cachePromotionFile, { force: true });

  const broadNoEffectBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-broad-no-effect-board-test.json');
  fs.writeFileSync(broadNoEffectBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-15T08:00:00.000Z',
    items: [{
      keyword: '\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30',
      grade: 'SSS',
      score: 99,
      pcSearchVolume: 2100,
      mobileSearchVolume: 17910,
      totalSearchVolume: 20010,
      documentCount: 1318,
      goldenRatio: 15.18,
      cpc: 100,
      category: 'life_tips',
      source: 'fixture-measured',
      evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      isDocumentCountEstimated: false,
      updatedAt: '2026-06-15T08:00:00.000Z',
      discoveredAt: '2026-06-15T08:00:00.000Z',
      isMeasured: true,
    }, {
      keyword: '\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30 \uD504\uB9AC\uB79C\uC11C \uC2E4\uC218\uB839\uC561',
      grade: 'SSS',
      score: 99,
      pcSearchVolume: 1200,
      mobileSearchVolume: 7800,
      totalSearchVolume: 9000,
      documentCount: 260,
      goldenRatio: 34.62,
      cpc: 220,
      category: 'life_tips',
      source: 'fixture-measured',
      evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      isDocumentCountEstimated: false,
      updatedAt: '2026-06-15T08:00:00.000Z',
      discoveredAt: '2026-06-15T08:00:00.000Z',
      isMeasured: true,
    }],
  }), 'utf8');
  const broadNoEffectRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: broadNoEffectBoardFile,
    boardTarget: 10,
    publicPreviewCount: 5,
    now: () => new Date('2026-06-15T09:00:00.000Z'),
  });
  const broadNoEffectSnapshot = broadNoEffectRadar.snapshot();
  assert('live golden board hides broad calculator heads and keeps measured writer-intent longtails',
    !broadNoEffectSnapshot.board.some((item) => item.keyword === '\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30')
      && broadNoEffectSnapshot.board.some((item) => (
        item.keyword === '\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30 \uD504\uB9AC\uB79C\uC11C \uC2E4\uC218\uB839\uC561'
        && item.grade === 'SSS'
      )),
    JSON.stringify(broadNoEffectSnapshot.board.map((item) => `${item.keyword}:${item.grade}:${item.totalSearchVolume}:${item.documentCount}`)));
  fs.rmSync(broadNoEffectBoardFile, { force: true });

  const broadPolicyBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-broad-policy-intent-test.json');
  fs.writeFileSync(broadPolicyBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-15T08:00:00.000Z',
    items: [{
      keyword: '\uCCAD\uB144\uBBF8\uB798\uC801\uAE08 \uC2E0\uCCAD',
      grade: 'SSS',
      score: 99,
      pcSearchVolume: 6400,
      mobileSearchVolume: 35600,
      totalSearchVolume: 42000,
      documentCount: 400,
      goldenRatio: 105,
      cpc: 110,
      category: 'policy',
      source: 'fixture-measured',
      evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      isDocumentCountEstimated: false,
      updatedAt: '2026-06-15T08:00:00.000Z',
      discoveredAt: '2026-06-15T08:00:00.000Z',
      isMeasured: true,
    }, {
      keyword: '\uCCAD\uB144\uBBF8\uB798\uC801\uAE08 \uD504\uB9AC\uB79C\uC11C \uC2E0\uCCAD \uB300\uC0C1',
      grade: 'SSS',
      score: 99,
      pcSearchVolume: 2100,
      mobileSearchVolume: 12900,
      totalSearchVolume: 15000,
      documentCount: 180,
      goldenRatio: 83.33,
      cpc: 140,
      category: 'policy',
      source: 'fixture-measured',
      evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      isDocumentCountEstimated: false,
      updatedAt: '2026-06-15T08:00:00.000Z',
      discoveredAt: '2026-06-15T08:00:00.000Z',
      isMeasured: true,
    }],
  }), 'utf8');
  const broadPolicyRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: broadPolicyBoardFile,
    boardTarget: 10,
    publicPreviewCount: 5,
    now: () => new Date('2026-06-15T09:00:00.000Z'),
  });
  const broadPolicySnapshot = broadPolicyRadar.snapshot();
  assert('high-volume policy heads do not outrank writer-ready SSS longtails',
    !broadPolicySnapshot.board.some((item) => item.keyword === '\uCCAD\uB144\uBBF8\uB798\uC801\uAE08 \uC2E0\uCCAD')
      && broadPolicySnapshot.board.some((item) => (
        item.keyword === '\uCCAD\uB144\uBBF8\uB798\uC801\uAE08 \uD504\uB9AC\uB79C\uC11C \uC2E0\uCCAD \uB300\uC0C1'
        && item.grade === 'SSS'
      )),
    broadPolicySnapshot.board.map((item) => `${item.keyword}:${item.grade}:${item.totalSearchVolume}:${item.documentCount}`).join('|'));
  fs.rmSync(broadPolicyBoardFile, { force: true });

  assert('measured writer-ready rows can promote above stale stored grades while broad heads stay capped',
    __liveGoldenRadarTestInternals.normalizeLiveMetricGrade(
      '\uD504\uB9AC\uB79C\uC11C \uADFC\uB85C\uC7A5\uB824\uAE08 \uC2E0\uCCAD \uB300\uC0C1',
      'S',
      null,
      6800,
      500,
      13.6,
    ) === 'SSS'
      && __liveGoldenRadarTestInternals.normalizeLiveMetricGrade(
        '\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30',
        'S',
        null,
        20010,
        1318,
        15.18,
      ) !== 'SSS');

  const writerReadyProbeCandidates = __liveGoldenRadarTestInternals.buildMeasuredProbeCandidates(
    'all',
    ['\uADFC\uB85C\uC7A5\uB824\uAE08', '\uC81C\uC2B5\uAE30', '\uC81C\uC8FC \uB80C\uD130\uCE74'],
    1000,
    new Date('2026-06-15T09:00:00.000Z'),
  );
  assert('measured probe generation expands broad seeds into writer-ready detail longtails',
    writerReadyProbeCandidates.length > 70
      && writerReadyProbeCandidates.some((keyword) => (
        /\uADFC\uB85C\uC7A5\uB824\uAE08/.test(keyword)
        && /(?:\uC9C0\uAE09\uC77C\s*\uC870\uD68C|\uD544\uC694\s*\uC11C\uB958|\uB9C8\uAC10\uC77C\s*\uD655\uC778)/.test(keyword)
      ))
      && writerReadyProbeCandidates.some((keyword) => (
        /\uC81C\uC2B5\uAE30.*\uC6D0\uB8F8|\uC6D0\uB8F8.*\uC81C\uC2B5\uAE30/.test(keyword)
        && /(?:\uC804\uAE30\uC694\uAE08\s*\uBE44\uAD50|\uC18C\uC74C\s*\uBE44\uAD50|\uAC00\uACA9\uBE44\uAD50)/.test(keyword)
      )),
    writerReadyProbeCandidates.slice(0, 80).join('|'));

  const weakAutogenProbeCombos = [
    '\uC624\uBA54\uAC003 \uC21C\uC704 \uC608\uC57D \uBC29\uBC95',
    '\uC2F1\uD06C\uB300\uBC30\uC218\uAD6C\uAD50\uCCB4 \uD504\uB9AC\uB79C\uC11C \uC2E0\uCCAD \uB300\uC0C1',
    '\uADFC\uB85C\uC7A5\uB824\uAE08 \uCD5C\uC800\uAC00 \uAD6C\uB9E4\uCC98',
    '\uC695\uC2E4\uBB3C\uB54C\uC81C\uAC70 \uD504\uB9AC\uB79C\uC11C \uC2E0\uCCAD \uB300\uC0C1',
    '\uACF0\uD321\uC774\uB0C4\uC0C8 \uB9DE\uBC8C\uC774 \uC9C0\uAE09\uC77C \uC870\uD68C',
    '\uC9C4\uACF5\uB2E8\uC5F4\uC7AC \uBB34\uC9C1\uC790 \uC2E0\uCCAD \uC870\uAC74',
    '\uCCAD\uB144\uC9C0\uC6D0\uAE08 \uB300\uC0C1 \uC18C\uB4DD\uAE30\uC900 \uACC4\uC0B0',
    '\uD601\uC2E0\uC18C\uC0C1\uACF5\uC778 \uD504\uB9AC\uB79C\uC11C \uC2E0\uCCAD \uB300\uC0C1',
    '\uC18C\uC0C1\uACF5\uC778\uB300\uCD9C \uC54C\uBC14 \uC2E0\uCCAD \uB300\uC0C1',
    '\uADFC\uB85C\uC7A5\uB824\uAE08\uB300\uC0C1 \uAC1C\uC778\uC0AC\uC5C5\uC790 \uC18C\uB4DD\uAE30\uC900 \uACC4\uC0B0',
    '\uCC28\uB7C9\uC6A9\uCCAD\uC18C\uAE30\uCD94\uCC9C\uC870\uD68C',
    '\uC774\uBC88\uC8FC\uCC28\uB7C9\uC6A9\uCCAD\uC18C\uAE30',
    '\uC774\uBC88\uC8FC\uCC28\uB7C9\uC6A9\uCCAD\uC18C\uAE30 \uC804\uAE30\uC694\uAE08',
  ];
  const compatiblePolicyAudienceKeyword = '\uD504\uB9AC\uB79C\uC11C \uADFC\uB85C\uC7A5\uB824\uAE08 \uC2E0\uCCAD \uB300\uC0C1';
  const weakAutogenProbeCandidates = __liveGoldenRadarTestInternals.buildMeasuredProbeCandidates(
    'all',
    ['\uC624\uBA54\uAC003 \uC21C\uC704', '\uC2F1\uD06C\uB300\uBC30\uC218\uAD6C\uAD50\uCCB4'],
    500,
    new Date('2026-06-15T09:00:00.000Z'),
  );
  assert('measured probe queue rejects auto-combined product/policy tails that bloggers cannot use',
    weakAutogenProbeCombos.every((keyword) => (
      __liveGoldenRadarTestInternals.isWeakAutogeneratedProbeCombo(keyword)
        && !__liveGoldenRadarTestInternals.isLiveMeasuredProbeCandidate(keyword, 'all', lottoGuardNow)
    ))
      && !__liveGoldenRadarTestInternals.isWeakAutogeneratedProbeCombo(compatiblePolicyAudienceKeyword)
      && weakAutogenProbeCandidates.every((keyword) => !__liveGoldenRadarTestInternals.isWeakAutogeneratedProbeCombo(keyword)),
    weakAutogenProbeCandidates.slice(0, 80).join('|'));

  const noEffectLiveProbeCombos = [
    '\uAE40\uC6A9\uBC94 \uC815\uCC45\uC2E4\uC7A5 \uC2E0\uCCAD \uB300\uC0C1',
    '\uAE40\uC6A9\uBC94 \uC815\uCC45\uC2E4\uC7A5 \uC0AC\uC6A9\uCC98 \uCD94\uCC9C',
    '\uB85C\uBD07\uCCAD\uC18C\uAE30 \uC21C\uC704 \uC800\uC18C\uC74C \uD6C4\uAE30',
    '\uB808\uC778\uBD80\uCE20 \uAC00\uC131\uBE44 \uC0AC\uC774\uC988 \uCD94\uCC9C',
    '\uB808\uC778\uBD80\uCE20 \uAC00\uACA9 \uC800\uC18C\uC74C \uD6C4\uAE30',
    '\uB0C9\uC7A5\uACE0 \uCD94\uCC9C \uC124\uCE58\uBE44 \uBE44\uAD50',
    '\uCCAD\uB144\uBBF8\uB798\uC801\uAE08 \uC2E0\uCCAD \uD544\uC694 \uC11C\uB958',
    '\uCCAD\uB144\uBBF8\uB798\uC801\uAE08 \uB300\uC0C1 \uB9C8\uAC10\uC77C \uD655\uC778',
    '\uC804\uAE30\uC694\uAE08 \uBCF5\uC9C0\uD560\uC778 \uC2E0\uCCAD \uC7A5\uB2E8\uC810',
    '\uCCAD\uB144\uB3C4\uC57D\uACC4\uC88C \uC774\uC790 \uC2E0\uCCAD \uB300\uC0C1',
    '\uC5EC\uC218 \uC57C\uACBD \uBA85\uC18C \uC608\uC57D \uBC29\uBC95',
    '\uAC15\uC6D0\uB3C4 \uD39C\uC158 \uB9E4\uB9E4 \uC608\uC57D \uBC29\uBC95',
    '\uAD6D\uB9BD \uCEA0\uD551\uC7A5 \uC608\uC57D \uC0AC\uC774\uD2B8 \uC785\uC7A5\uB8CC',
    '\uC11C\uC6B8 \uADFC\uAD50 \uB2F9\uC77C\uCE58\uAE30 \uBC14\uB2E4 \uC608\uC57D',
    '\uC804\uC8FC \uD55C\uC625\uB9C8\uC744 \uB9DB\uC9D1 \uC608\uC57D',
    '\uBD80\uC0B0 \uAC10\uCC9C\uBB38\uD654\uB9C8\uC744 \uADFC\uCC98 \uC608\uC57D \uBC29\uBC95',
    '\uC18D\uCD08 1\uBC152\uC77C \uCF54\uC2A4 \uC608\uC57D \uBC29\uBC95',
    '\uCEA0\uD551\uC7A5 \uC608\uC57D \uC0AC\uC774\uD2B8 \uB69C\uBC85\uC774 \uCF54\uC2A4',
    '\uAC15\uB989 \uB2F9\uC77C\uCE58\uAE30 \uB9DB\uC9D1 \uAD6C\uB9E4\uCC98 \uCD94\uCC9C',
    '\uAC15\uB989 \uCE74\uD398\uAC70\uB9AC \uAD6C\uB9E4\uCC98 \uCD94\uCC9C',
    '\uAC15\uC6D0\uB3C4\uC0BC\uCC99\uAC00\uBCFC\uB9CC\uD55C\uACF3 \uAD6C\uB9E4\uCC98 \uCD94\uCC9C',
    '\uC81C\uC8FC \uB80C\uD130\uCE74 \uCD94\uCC9C \uC785\uC7A5\uB8CC',
    '\uC81C\uC8FC \uB80C\uD130\uCE74 \uD6C4\uAE30 \uC6B4\uC601\uC2DC\uAC04',
    '\uAC1C\uC778\uC0AC\uC5C5\uC790\uC815\uCC45\uC790\uAE08 \uBB34\uC9C1\uC790 \uC2E0\uCCAD \uC870\uAC74',
    '\uAC1C\uC778\uC0AC\uC5C5\uC790\uC815\uCC45\uC790\uAE08 \uD504\uB9AC\uB79C\uC11C \uC2E0\uCCAD \uB300\uC0C1',
    '\uC544\uC6C3\uBC31 \uAFC0\uD301 \uC9C0\uAE09\uC77C \uC870\uD68C',
    '\uD558\uC774\uB514\uB77C\uC624 \uAFC0\uD301 \uC2E0\uCCAD \uBC29\uBC95',
    '\uBD80\uB2F9\uD574\uACE0\uAD6C\uC81C\uC2E0\uCCAD \uD6C4\uAE30 \uD544\uD130 \uAD50\uCCB4\uC8FC\uAE30',
    '\uB808\uC778\uBD80\uCE20 \uD6C4\uAE30 \uD544\uD130 \uAD50\uCCB4\uC8FC\uAE30',
    '\uB808\uC778\uBD80\uCE20\uD6C4\uAE30 \uC6D0\uB8F8 \uC804\uAE30\uC694\uAE08 \uBE44\uAD50',
    '\uB0C9\uC7A5\uACE0\uC815\uB9AC \uC6D0\uB8F8 \uC804\uAE30\uC694\uAE08 \uBE44\uAD50',
    '\uB0C9\uC7A5\uACE0\uC815\uB9AC\uD568 \uC6D0\uB8F8 \uC804\uAE30\uC694\uAE08 \uBE44\uAD50',
    '\uB0C9\uC7A5\uACE0\uC815\uB9AC \uC790\uCDE8\uBC29 \uC18C\uC74C \uBE44\uAD50',
    '\uCCAD\uB144\uB3C4\uC57D\uACC4\uC88C \uD574\uC9C0 \uC9C0\uAE09\uC77C \uC870\uD68C',
    '\uCCAD\uB144\uB3C4\uC57D\uACC4\uC88C \uC911\uB3C4\uC778\uCD9C \uC2E0\uCCAD \uB300\uC0C1',
    '제주 렌터카 숙소 예약',
    '제주 렌터카 환불 규정',
    '가족여행 추천지 숙소 예약',
    '가족여행 추천지 숙소 추천',
    '강원도 펜션 추천 축제 일정',
    '등산 초보 코스 숙소 예약',
    '반려견 동반 펜션 숙소 예약',
    'ETF 세액공제 한도',
    'ETF 개인사업자 세액공제 한도',
    'ETF 퇴직자 신청 방법',
    '프로바이오틱스 균수 보험 적용 비용',
    '오메가3 순위 보험 적용 비용',
    '전주 한옥마을 맛집 가격비교',
  ];
  assert('high-yield SearchAd spend gate rejects news-person policy tails and stacked abstract product intents',
    noEffectLiveProbeCombos.every((keyword) => (
      !__liveGoldenRadarTestInternals.isHighYieldSearchAdSpendCandidate(keyword, 'all', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isLiveMeasuredProbeCandidate(keyword, 'all', lottoGuardNow)
    )),
    noEffectLiveProbeCombos
      .filter((keyword) => __liveGoldenRadarTestInternals.isHighYieldSearchAdSpendCandidate(keyword, 'all', lottoGuardNow))
      .join('|'));

  const calculatorCacheDerivedSeeds = __liveGoldenRadarTestInternals.buildCacheDerivedCompoundNeedSeeds(
    '\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30',
    'policy',
    30,
  );
  const policyCacheDerivedSeeds = __liveGoldenRadarTestInternals.buildCacheDerivedCompoundNeedSeeds(
    '\uB18D\uC2DD\uD488\uBC14\uC6B0\uCC98',
    'policy',
    30,
  );
  const alreadyAppliedPolicySeeds = __liveGoldenRadarTestInternals.buildCacheDerivedCompoundNeedSeeds(
    '\uCCAD\uB144\uBBF8\uB798\uC801\uAE08\uC2E0\uCCAD',
    'policy',
    30,
  );
  const nonPolicyCacheDerivedSeeds = [
    ...__liveGoldenRadarTestInternals.buildCacheDerivedCompoundNeedSeeds(
      '1228\uD68C\uB85C\uB610\uB2F9\uCCA8\uBC88\uD638',
      'policy',
      30,
    ),
    ...__liveGoldenRadarTestInternals.buildCacheDerivedCompoundNeedSeeds(
      '\uCC38\uAD50\uC721\uBA87\uBD80\uC791',
      'policy',
      30,
    ),
    ...__liveGoldenRadarTestInternals.buildCacheDerivedCompoundNeedSeeds(
      '\uC544\uC6C3\uBC31\uAFC0\uD301',
      'policy',
      30,
    ),
  ];
  const repeatedTailPolicySeeds = __liveGoldenRadarTestInternals.buildCacheDerivedCompoundNeedSeeds(
    '\uCCAD\uB144\uBBF8\uB798\uC801\uAE08 \uC870\uAC74',
    'policy',
    30,
  );
  const terminalPolicySeeds = [
    ...__liveGoldenRadarTestInternals.buildCacheDerivedCompoundNeedSeeds(
      '5\uC6D4\uC5F0\uB9D0\uC815\uC0B0\uD658\uAE09\uC77C',
      'policy',
      30,
    ),
    ...__liveGoldenRadarTestInternals.buildCacheDerivedCompoundNeedSeeds(
      '\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC\uC0AC\uC6A9\uCC98',
      'policy',
      30,
    ),
  ];
  assert('cache-derived probes turn broad measured heads into writer-ready measured longtails',
    calculatorCacheDerivedSeeds.includes('\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30 \uD504\uB9AC\uB79C\uC11C \uC2E4\uC218\uB839\uC561')
      && calculatorCacheDerivedSeeds.includes('\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30 \uC54C\uBC14 \uC790\uB3D9\uACC4\uC0B0')
      && !calculatorCacheDerivedSeeds.includes('\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30 \uC54C\uBC14 \uC8FC\uD734\uC218\uB2F9 \uACC4\uC0B0')
      && !calculatorCacheDerivedSeeds.includes('\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30 \uAC1C\uC778\uC0AC\uC5C5\uC790 \uACF5\uC81C\uD56D\uBAA9')
      && !calculatorCacheDerivedSeeds.some((keyword) => /\uC2E0\uCCAD\s*(?:\uB300\uC0C1|\uBC29\uBC95)|\uC9C0\uAE09\uC77C\s*\uC870\uD68C/.test(keyword))
      && policyCacheDerivedSeeds.includes('\uB18D\uC2DD\uD488\uBC14\uC6B0\uCC98 \uC2E0\uCCAD \uB300\uC0C1')
      && policyCacheDerivedSeeds.includes('\uB18D\uC2DD\uD488\uBC14\uC6B0\uCC98 \uC0AC\uC6A9\uCC98 \uC870\uD68C')
      && alreadyAppliedPolicySeeds.includes('\uCCAD\uB144\uBBF8\uB798\uC801\uAE08\uC2E0\uCCAD \uB300\uC0C1')
      && alreadyAppliedPolicySeeds.includes('\uCCAD\uB144\uBBF8\uB798\uC801\uAE08\uC2E0\uCCAD \uBC29\uBC95')
      && !alreadyAppliedPolicySeeds.includes('\uCCAD\uB144\uBBF8\uB798\uC801\uAE08\uC2E0\uCCAD \uC0AC\uC6A9\uCC98 \uC870\uD68C')
      && nonPolicyCacheDerivedSeeds.length === 0
      && !repeatedTailPolicySeeds.some((keyword) => /\uC870\uAC74\s*\uC790\uACA9\s*\uC870\uAC74/u.test(keyword))
      && !terminalPolicySeeds.some((keyword) => /\uC18C\uB4DD\uAE30\uC900\s*\uACC4\uC0B0|\uC790\uACA9\s*\uC870\uAC74|\uD544\uC694\s*\uC11C\uB958/u.test(keyword)),
    JSON.stringify({ calculatorCacheDerivedSeeds, policyCacheDerivedSeeds, alreadyAppliedPolicySeeds, nonPolicyCacheDerivedSeeds, repeatedTailPolicySeeds, terminalPolicySeeds }));

  const trustedWriterReadyProbeCases = [
    ['\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30 \uD504\uB9AC\uB79C\uC11C \uC2E4\uC218\uB839\uC561', true],
    ['\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30 \uC54C\uBC14 \uC790\uB3D9\uACC4\uC0B0', true],
    ['\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30 \uC54C\uBC14 \uC8FC\uD734\uC218\uB2F9 \uACC4\uC0B0', false],
    ['\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30 \uAC1C\uC778\uC0AC\uC5C5\uC790 \uACF5\uC81C\uD56D\uBAA9', false],
    ['\uADFC\uBB34\uC2DC\uAC04\uACC4\uC0B0\uAE30 \uC54C\uBC14 \uC8FC\uD734\uC218\uB2F9 \uACC4\uC0B0', false],
    ['\uADFC\uBB34\uC2DC\uAC04\uACC4\uC0B0\uAE30 \uC138\uAE08 \uACF5\uC81C', false],
    ['\uADFC\uBB34\uC2DC\uAC04\uACC4\uC0B0\uAE30 \uC694\uC728\uD45C', false],
    ['\uC2DC\uAE09\uACC4\uC0B0\uAE30 \uD1F4\uC9C1\uAE08 \uC138\uD6C4 \uACC4\uC0B0', false],
    ['\uC2DC\uAE09\uACC4\uC0B0\uAE30 4\uB300\uBCF4\uD5D8\uB8CC \uC694\uC728 \uACC4\uC0B0', false],
    ['\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30 \uD6C4\uAE30', false],
    ['\uC2E4\uC5C5\uAE09\uC5EC\uACC4\uC0B0\uAE30 \uC2E0\uCCAD', false],
    ['\uAE30\uCD08\uC5F0\uAE08\uC218\uAE09\uC790\uACA9\uBAA8\uC758\uACC4\uC0B0\uAE30 4\uB300\uBCF4\uD5D8\uB8CC \uC694\uC728 \uACC4\uC0B0', false],
    ['\uC790\uC601\uC5C5\uC790 \uACE0\uC6A9\uBCF4\uD5D8 \uC2E4\uC5C5\uAE09\uC5EC \uC790\uB3D9\uACC4\uC0B0', false],
    ['\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC\uC628\uB77C\uC778\uACB0\uC81C \uCD5C\uC800\uAC00 \uBE44\uAD50', false],
    ['4\uB300\uBCF4\uD5D8 \uC644\uB0A9\uC99D\uBA85\uC11C 4\uB300\uBCF4\uD5D8\uB8CC \uC694\uC728 \uACC4\uC0B0', false],
    ['\uB18D\uC2DD\uD488\uBC14\uC6B0\uCC98 \uC2E0\uCCAD \uB300\uC0C1', true],
    ['\uADFC\uBB34\uC2DC\uAC04\uACC4\uC0B0\uAE30 \uC2E0\uCCAD \uB300\uC0C1', false],
    ['\uADFC\uB85C\uC7A5\uB824\uAE08 \uC628\uB77C\uC778 \uC2E0\uCCAD', false],
  ] as const;
  assert('writer-ready measured probe gate allows usable policy/calculator tails and rejects calculator policy tails',
    trustedWriterReadyProbeCases.every(([keyword, expected]) => (
      __liveGoldenRadarTestInternals.isLiveMeasuredProbeCandidate(keyword, 'policy', lottoGuardNow) === expected
        && __liveGoldenRadarTestInternals.isHighYieldSearchAdSpendCandidate(keyword, 'policy', lottoGuardNow) === expected
    )),
    JSON.stringify(trustedWriterReadyProbeCases.map(([keyword]) => ({
      keyword,
      probe: __liveGoldenRadarTestInternals.isLiveMeasuredProbeCandidate(keyword, 'policy', lottoGuardNow),
      spend: __liveGoldenRadarTestInternals.isHighYieldSearchAdSpendCandidate(keyword, 'policy', lottoGuardNow),
    }))));

  const practicalNearSssProbeCases = [
    ['\uC1A1\uC9C0\uD638 \uBC14\uB2E4\uD558\uB298\uAE38 \uC608\uC57D \uBC29\uBC95', 'travel_domestic'],
    ['\uBD80\uC0B0\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC\uC0AC\uC6A9\uCC98 \uC870\uD68C', 'policy'],
    ['\uCFE0\uCFE0\uC81C\uC2B5\uAE30\uB80C\uD0C8 \uC6D0\uB8F8 \uC804\uAE30\uC694\uAE08 \uBE44\uAD50', 'electronics'],
  ] as const;
  assert('practical near-SSS writer intents are promoted into SearchAd spend candidates',
    practicalNearSssProbeCases.every(([keyword, category]) => (
      __liveGoldenRadarTestInternals.isLiveMeasuredProbeCandidate(keyword, category, lottoGuardNow)
        && __liveGoldenRadarTestInternals.isHighYieldSearchAdSpendCandidate(keyword, category, lottoGuardNow)
    )),
    JSON.stringify(practicalNearSssProbeCases.map(([keyword, category]) => ({
      keyword,
      category,
      probe: __liveGoldenRadarTestInternals.isLiveMeasuredProbeCandidate(keyword, category, lottoGuardNow),
      spend: __liveGoldenRadarTestInternals.isHighYieldSearchAdSpendCandidate(keyword, category, lottoGuardNow),
      debug: __liveGoldenRadarTestInternals.debugSearchAdMeasurableLiveCandidate(keyword, category, lottoGuardNow),
    }))));

  assert('writer-ready SSS queue priority favors practical longtails over broad heads',
    __liveGoldenRadarTestInternals.writerReadySssProbePriorityScore(
      '\uD504\uB9AC\uB79C\uC11C \uADFC\uB85C\uC7A5\uB824\uAE08 \uC2E0\uCCAD \uB300\uC0C1',
      'policy',
    ) > __liveGoldenRadarTestInternals.writerReadySssProbePriorityScore(
      '\uADFC\uB85C\uC7A5\uB824\uAE08',
      'policy',
    ) + 200
      && __liveGoldenRadarTestInternals.writerReadySssProbePriorityScore(
        '\uC81C\uC2B5\uAE30 \uC6D0\uB8F8 \uC804\uAE30\uC694\uAE08 \uBE44\uAD50',
        'electronics',
      ) > __liveGoldenRadarTestInternals.writerReadySssProbePriorityScore(
        '\uC81C\uC2B5\uAE30',
        'electronics',
      ) + 300);
  assert('searchad probe filter rejects unnatural generated compounds before spending API quota',
    !__liveGoldenRadarTestInternals.isLiveMeasuredProbeCandidate(
      '2026 \uADFC\uB85C\uC7A5\uB824\uAE08 \uD504\uB9AC\uB79C\uC11C \uC2E0\uCCAD \uB300\uC0C1',
      'policy',
      lottoGuardNow,
    )
      && !__liveGoldenRadarTestInternals.isLiveMeasuredProbeCandidate(
        '2026 KBO \uC62C\uC2A4\uD0C0\uC804 \uD2F0\uCF13\uD305 \uC77C\uC815 \uC88C\uC11D\uBC30\uCE58\uB3C4',
        'sports',
        lottoGuardNow,
      )
      && __liveGoldenRadarTestInternals.isLiveMeasuredProbeCandidate(
        '\uC54C\uBC14 \uADFC\uB85C\uC7A5\uB824\uAE08 \uC2E4\uC218\uB839\uC561',
        'policy',
        lottoGuardNow,
      ));

  const queueFamilyA = '\uC1A1\uC9C0\uD638 \uBC14\uB2E4\uD558\uB298\uAE38 \uC608\uC57D \uBC29\uBC95';
  const queueFamilyB = '\uC1A1\uC9C0\uD638 \uBC14\uB2E4\uD558\uB298\uAE38 \uC8FC\uCC28';
  const queueFamilyC = '\uC1A1\uC9C0\uD638 \uBC14\uB2E4\uD558\uB298\uAE38 \uC785\uC7A5\uB8CC';
  const queueFamilyD = '\uC1A1\uC9C0\uD638 \uBC14\uB2E4\uD558\uB298\uAE38 \uC6B4\uC601\uC2DC\uAC04';
  const queueDifferentFamilies = [
    '\uBB34\uC8FC\uC218\uCC44\uD654\uD39C\uC158 \uC608\uC57D \uBC29\uBC95',
    '\uADFC\uBB34\uC2DC\uAC04\uACC4\uC0B0\uAE30 \uC77C\uC6A9\uC9C1 \uACC4\uC0B0\uBC29\uBC95',
    '\uCFE0\uCFE0\uC81C\uC2B5\uAE30\uB80C\uD0C8 \uAD6C\uB9E4\uCC98 \uCD94\uCC9C',
    '\uBD80\uC0B0\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC\uC0AC\uC6A9\uCC98 \uC870\uD68C',
    '\uCCAD\uB144\uBBF8\uB798\uC801\uAE08 \uB9CC\uAE30\uC218\uB839\uC561 \uACC4\uC0B0',
  ];
  const queueFamilyProbeFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-queue-family-test.json');
  fs.writeFileSync(queueFamilyProbeFile, JSON.stringify({
    version: 1,
    savedAt: '2026-06-27T00:00:00.000Z',
    items: [
      queueFamilyA,
      queueFamilyB,
      queueFamilyC,
      queueFamilyD,
      ...queueDifferentFamilies,
    ].map((keyword, index) => ({
      keyword,
      category: index < 4 ? 'travel_domestic' : 'all',
      source: 'fixture-family-queue',
      priority: index < 4 ? 900 : 100,
      firstSeenAt: `2026-06-27T00:${String(index).padStart(2, '0')}:00.000Z`,
      attempts: 0,
      misses: 0,
    })),
  }), 'utf8');
  const queueFamilyMeasuredKeywords: string[] = [];
  const queueFamilyRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 6,
    boardTarget: 12,
    maxCandidates: 180,
    categories: ['all'],
    probeQueueFile: queueFamilyProbeFile,
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
    liveSeedProvider: async () => [],
    enableBackfill: true,
    autocompleteProvider: async () => [],
    searchAdSuggestionProvider: async () => [],
    measureLiveSearchVolumeSeparate: async (_config, keywords) => {
      queueFamilyMeasuredKeywords.push(...keywords);
      return [];
    },
    measureLiveDocumentCount: async () => null,
    discover: async () => [],
  });
  await queueFamilyRadar.runOnce();
  const firstQueueFamilyBatch = queueFamilyMeasuredKeywords.slice(0, 6);
  const sameRootFamily = __liveGoldenRadarTestInternals.measuredProbeQueueFamilyKey(queueFamilyA);
  assert('measured probe execution queue round-robins root families before repeated tails',
    firstQueueFamilyBatch.filter((keyword) => (
      __liveGoldenRadarTestInternals.measuredProbeQueueFamilyKey(keyword) === sameRootFamily
    )).length === 1
      && queueDifferentFamilies.every((keyword) => firstQueueFamilyBatch.includes(keyword)),
    JSON.stringify({
      firstQueueFamilyBatch,
      families: firstQueueFamilyBatch.map((keyword) => [
        keyword,
        __liveGoldenRadarTestInternals.measuredProbeQueueFamilyKey(keyword),
      ]),
    }));
  fs.rmSync(queueFamilyProbeFile, { force: true });

  const measuredProbePortfolio = __liveGoldenRadarTestInternals.buildMeasuredProbeCandidates(
    'all',
    [],
    720,
    lottoGuardNow,
  );
  const measuredProbeFront = measuredProbePortfolio.slice(0, 120);
  const jejuRentalFrontCount = measuredProbeFront.filter((keyword) => /제주\s*렌(?:터|트)카/u.test(keyword)).length;
  assert('measured probe portfolio favors diversified writer-ready longtails over one broad root family',
    measuredProbeFront.some((keyword) => keyword === '제주 렌터카 완전자차 가격비교')
      && measuredProbeFront.some((keyword) => keyword === '청년미래적금 소득기준 계산')
      && measuredProbeFront.some((keyword) => keyword === '치아보험 면책기간')
      && jejuRentalFrontCount <= 18
      && !measuredProbePortfolio.some((keyword) => /(?:렌터카|렌트카).{0,12}(?:숙소\s*예약|환불\s*규정)|강원도\s*펜션\s*추천\s*축제\s*일정|ETF.*(?:세액공제|신청\s*방법)|(?:프로바이오틱스|오메가3).{0,16}보험\s*적용|한옥마을\s*맛집\s*가격비교/u.test(keyword)),
    JSON.stringify({
      jejuRentalFrontCount,
      front: measuredProbeFront.slice(0, 80),
      weak: measuredProbePortfolio.filter((keyword) => /(?:렌터카|렌트카).{0,12}(?:숙소\s*예약|환불\s*규정)|강원도\s*펜션\s*추천\s*축제\s*일정|ETF.*(?:세액공제|신청\s*방법)|(?:프로바이오틱스|오메가3).{0,16}보험\s*적용|한옥마을\s*맛집\s*가격비교/u.test(keyword)),
    }));

  const queuePriorityProbeFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-queue-priority-test.json');
  const queuedWriterReadyKeyword = '\uC81C\uC8FC \uB80C\uD130\uCE74 \uC644\uC804\uC790\uCC28 \uAC00\uACA9\uBE44\uAD50';
  const queuedWeakSyntheticKeyword = '\uC695\uC2E4\uBB3C\uB54C\uC81C\uAC70 \uD504\uB9AC\uB79C\uC11C \uC2E0\uCCAD \uB300\uC0C1';
  const queuedNoResultKeyword = '\uC81C\uC8FC \uB80C\uD130\uCE74 \uBCF4\uD5D8 \uAC00\uACA9\uBE44\uAD50';
  fs.writeFileSync(queuePriorityProbeFile, JSON.stringify({
    version: 1,
    savedAt: '2026-06-15T08:00:00.000Z',
    items: [{
      keyword: queuedWeakSyntheticKeyword,
      category: 'policy',
      source: 'fixture-legacy-queue',
      priority: 3000,
      firstSeenAt: '2026-06-15T07:00:00.000Z',
      attempts: 0,
      misses: 0,
    }, {
      keyword: queuedNoResultKeyword,
      category: 'travel_domestic',
      source: 'fixture-no-result-queue',
      priority: 5000,
      firstSeenAt: '2026-06-15T06:00:00.000Z',
      lastTriedAt: '2026-06-15T06:30:00.000Z',
      attempts: 1,
      misses: 1,
    }, {
      keyword: queuedWriterReadyKeyword,
      category: 'travel_domestic',
      source: 'fixture-queue',
      priority: 999,
      firstSeenAt: '2026-06-15T08:00:00.000Z',
      attempts: 0,
      misses: 0,
    }],
  }), 'utf8');
  const queuePriorityMeasuredKeywords: string[] = [];
  const queuePriorityRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 4,
    boardTarget: 10,
    maxCandidates: 180,
    categories: ['travel_domestic'],
    probeQueueFile: queuePriorityProbeFile,
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
    liveSeedProvider: async () => [],
    enableBackfill: true,
    autocompleteProvider: async () => [],
    searchAdSuggestionProvider: async () => [],
    measureLiveSearchVolumeSeparate: async (_config, keywords, options) => {
      assert('queued probe volume pass keeps document count separated', options?.includeDocumentCount === false);
      queuePriorityMeasuredKeywords.push(...keywords);
      return keywords
        .filter((keyword) => keyword === queuedWriterReadyKeyword)
        .map((keyword) => ({
          keyword,
          pcSearchVolume: 640,
          mobileSearchVolume: 2140,
          documentCount: null,
          competition: 'LOW',
          monthlyAveCpc: 260,
          searchVolumeSource: 'searchad',
          searchVolumeConfidence: 'high',
          isSearchVolumeEstimated: false,
        }));
    },
    measureLiveDocumentCount: async (keyword) => (
      keyword === queuedWriterReadyKeyword
        ? {
          dc: 90,
          source: 'scrape',
          confidence: 'high',
          isEstimated: false,
        }
        : null
    ),
    discover: async () => [],
  });
  const queuePrioritySnapshot = await queuePriorityRadar.runOnce();
  assert('curated persistent measured probe queue is consumed without weak legacy combos',
    queuePriorityMeasuredKeywords.includes(queuedWriterReadyKeyword)
      && !queuePriorityMeasuredKeywords.includes(queuedWeakSyntheticKeyword)
      && !queuePriorityMeasuredKeywords.includes(queuedNoResultKeyword)
      && queuePrioritySnapshot.board.some((item) => (
        item.keyword === queuedWriterReadyKeyword
        && item.grade === 'SSS'
        && item.pcSearchVolume === 640
        && item.mobileSearchVolume === 2140
        && item.documentCount === 90
      )),
    JSON.stringify({
      measured: queuePriorityMeasuredKeywords.slice(0, 20),
      board: queuePrioritySnapshot.board.map((item) => `${item.keyword}:${item.grade}:${item.pcSearchVolume}:${item.mobileSearchVolume}:${item.documentCount}`),
      lastMessage: queuePrioritySnapshot.lastMessage,
    }));
  fs.rmSync(queuePriorityProbeFile, { force: true });

  const legacyMismatchProbeFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-legacy-mismatch-queue-test.json');
  const legacyMismatchGood = '월드컵 중계 일정';
  const legacyMismatchBad = [
    '신입사원 강회장 출연진 최저가 구매처',
    '신입사원 강회장 방송시간 가격비교 후기',
    '신입사원 강회장 방송시간 보험 적용 비용',
    '하트시그널5 공식영상 최저가 구매처',
    '월드컵 조편성 최저가 비교',
  ];
  fs.writeFileSync(legacyMismatchProbeFile, JSON.stringify({
    version: 1,
    savedAt: '2026-06-28T00:00:00.000Z',
    items: [
      ...legacyMismatchBad.map((keyword, index) => ({
        keyword,
        category: index === 4 ? 'sports' : 'broadcast',
        source: 'fixture-legacy-mismatch-queue',
        priority: 9000 - index,
        firstSeenAt: `2026-06-28T00:0${index}:00.000Z`,
        attempts: 0,
        misses: 0,
      })),
      {
        keyword: legacyMismatchGood,
        category: 'sports',
        source: 'fixture-valid-sports-queue',
        priority: 100,
        firstSeenAt: '2026-06-28T00:10:00.000Z',
        attempts: 0,
        misses: 0,
      },
    ],
  }), 'utf8');
  const legacyMismatchMeasuredKeywords: string[] = [];
  const legacyMismatchRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 8,
    boardTarget: 10,
    maxCandidates: 180,
    categories: ['all'],
    probeQueueFile: legacyMismatchProbeFile,
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
    liveSeedProvider: async () => [],
    enableBackfill: true,
    autocompleteProvider: async () => [],
    searchAdSuggestionProvider: async () => [],
    measureLiveSearchVolumeSeparate: async (_config, keywords) => {
      legacyMismatchMeasuredKeywords.push(...keywords);
      return [];
    },
    measureLiveDocumentCount: async () => null,
    discover: async () => [],
  });
  await legacyMismatchRadar.runOnce();
  assert('legacy persistent queue cannot spend SearchAd quota on mismatched broadcast commerce tails',
    legacyMismatchMeasuredKeywords.includes(legacyMismatchGood)
      && legacyMismatchBad.every((keyword) => !legacyMismatchMeasuredKeywords.includes(keyword)),
    JSON.stringify({
      measured: legacyMismatchMeasuredKeywords,
      bad: legacyMismatchBad,
    }));
  fs.rmSync(legacyMismatchProbeFile, { force: true });

  const queueVariantProbeFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-queue-variant-test.json');
  const spacedTravelProbe = '\uC1A1\uC9C0\uD638 \uBC14\uB2E4\uD558\uB298\uAE38 \uC608\uC57D \uBC29\uBC95';
  const compactTravelWinner = '\uC1A1\uC9C0\uD638\uBC14\uB2E4\uD558\uB298\uAE38\uC608\uC57D\uBC29\uBC95';
  const queueVariantFillers = __liveGoldenRadarTestInternals
    .buildMeasuredProbeCandidates('all', [], 720, lottoGuardNow)
    .filter((keyword) => (
      __liveGoldenRadarTestInternals.measuredProbeQueueFamilyKey(keyword)
        !== __liveGoldenRadarTestInternals.measuredProbeQueueFamilyKey(spacedTravelProbe)
    ))
    .slice(0, 30);
  fs.writeFileSync(queueVariantProbeFile, JSON.stringify({
    version: 1,
    savedAt: '2026-06-15T08:00:00.000Z',
    items: [{
      keyword: spacedTravelProbe,
      source: 'fixture-legacy-spaced-queue',
      priority: 9999,
      firstSeenAt: '2026-06-15T07:00:00.000Z',
      attempts: 0,
      misses: 0,
    }, {
      keyword: compactTravelWinner,
      source: 'fixture-legacy-compact-sibling',
      priority: 9998,
      firstSeenAt: '2026-06-15T07:00:01.000Z',
      attempts: 0,
      misses: 0,
    }, ...queueVariantFillers.map((keyword, index) => ({
      keyword,
      category: __liveGoldenRadarTestInternals.inferLiveCategory(keyword, 'all'),
      source: 'fixture-diversity-fill',
      priority: 9900 - index,
      firstSeenAt: `2026-06-15T07:${String(index + 2).padStart(2, '0')}:00.000Z`,
      attempts: 0,
      misses: 0,
    }))],
  }), 'utf8');
  const queueVariantMeasuredKeywords: string[] = [];
  const queueVariantRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 4,
    boardTarget: 10,
    maxCandidates: 180,
    categories: ['all'],
    probeQueueFile: queueVariantProbeFile,
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
    liveSeedProvider: async () => [],
    enableBackfill: true,
    autocompleteProvider: async () => [],
    searchAdSuggestionProvider: async () => [],
    measureLiveSearchVolumeSeparate: async (_config, keywords, options) => {
      assert('spaced queue variant volume pass keeps document count separated', options?.includeDocumentCount === false);
      queueVariantMeasuredKeywords.push(...keywords);
      return keywords
        .filter((keyword) => keyword === spacedTravelProbe)
        .map((keyword) => ({
          keyword,
          pcSearchVolume: 540,
          mobileSearchVolume: 3660,
          documentCount: null,
          competition: 'LOW',
          monthlyAveCpc: 190,
          searchVolumeSource: 'searchad',
          searchVolumeConfidence: 'high',
          isSearchVolumeEstimated: false,
        }));
    },
    measureLiveDocumentCount: async (keyword) => (
      keyword === spacedTravelProbe
        ? {
          dc: 140,
          source: 'scrape',
          confidence: 'high',
          isEstimated: false,
        }
        : null
    ),
    discover: async () => [],
  });
  const queueVariantSnapshot = await queueVariantRadar.runOnce();
  const queueVariantAfter = JSON.parse(fs.readFileSync(queueVariantProbeFile, 'utf8'));
  assert('spaced writer-ready queued probes preserve display text while SearchAd normalizes exact matching',
    queueVariantMeasuredKeywords.includes(spacedTravelProbe)
      && queueVariantMeasuredKeywords.length <= 80
      && queueVariantSnapshot.board.some((item) => (
        item.keyword === spacedTravelProbe
        && item.grade === 'SSS'
        && item.pcSearchVolume === 540
        && item.mobileSearchVolume === 3660
        && item.documentCount === 140
      )),
    JSON.stringify({
      measured: queueVariantMeasuredKeywords,
      board: queueVariantSnapshot.board.map((item) => `${item.keyword}:${item.grade}:${item.pcSearchVolume}:${item.mobileSearchVolume}:${item.documentCount}`),
      lastMessage: queueVariantSnapshot.lastMessage,
    }));
  assert('spaced writer-ready queued probe is removed after a measured variant succeeds',
    !queueVariantAfter.items?.some((item: any) => item.keyword === spacedTravelProbe || item.keyword === compactTravelWinner),
    JSON.stringify(queueVariantAfter.items || []));
  fs.rmSync(queueVariantProbeFile, { force: true });

  const queueFirstSuggestionProbeFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-queue-first-suggestion-test.json');
  const queueFirstSuggestionWinner = '\uC81C\uC8FC\uB80C\uD130\uCE74\uC644\uC804\uC790\uCC28\uAC00\uACA9\uBE44\uAD50';
  const queueFirstFillers = __liveGoldenRadarTestInternals
    .buildMeasuredProbeCandidates('all', [], 720, lottoGuardNow)
    .filter((keyword) => keyword !== queueFirstSuggestionWinner)
    .slice(0, 36);
  fs.writeFileSync(queueFirstSuggestionProbeFile, JSON.stringify({
    version: 1,
    savedAt: '2026-06-15T08:00:00.000Z',
    items: queueFirstFillers.map((keyword, index) => ({
      keyword,
      category: __liveGoldenRadarTestInternals.inferLiveCategory(keyword, 'all'),
      source: 'fixture-queue-first-fill',
      priority: 9400 - index,
      firstSeenAt: `2026-06-15T06:${String(index).padStart(2, '0')}:00.000Z`,
      attempts: 0,
      misses: 0,
    })),
  }), 'utf8');
  let queueFirstSuggestionCalls = 0;
  const queueFirstSuggestionRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 4,
    boardTarget: 10,
    maxCandidates: 180,
    categories: ['all'],
    probeQueueFile: queueFirstSuggestionProbeFile,
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
      naverSearchAdAccessLicense: 'license',
      naverSearchAdSecretKey: 'secret-key',
      naverSearchAdCustomerId: 'customer',
    }),
    liveSeedProvider: async () => [],
    enableBackfill: true,
    autocompleteProvider: async () => [],
    searchAdSuggestionProvider: async () => {
      queueFirstSuggestionCalls += 1;
      return [{
        keyword: queueFirstSuggestionWinner,
        pcSearchVolume: 1560,
        mobileSearchVolume: 7440,
        totalSearchVolume: 9000,
        competition: 'LOW',
        monthlyAveCpc: 420,
      }];
    },
    measureLiveSearchVolumeSeparate: async () => [],
    measureLiveDocumentCount: async (keyword) => (
      keyword === queueFirstSuggestionWinner
        ? {
          dc: 360,
          source: 'naver-api',
          confidence: 'high',
          isEstimated: false,
        }
        : null
    ),
    discover: async () => [],
  });
  const queueFirstSuggestionSnapshot = await queueFirstSuggestionRadar.runOnce();
  assert('queue-first catch-up stops before SearchAd suggestions after a zero-yield canary',
    queueFirstSuggestionCalls === 0
      && queueFirstSuggestionSnapshot.board.length === 0
      && /zero-yield cooldown/i.test(queueFirstSuggestionSnapshot.lastMessage || ''),
    JSON.stringify({
      suggestionCalls: queueFirstSuggestionCalls,
      board: queueFirstSuggestionSnapshot.board.map((item) => `${item.keyword}:${item.grade}:${item.pcSearchVolume}:${item.mobileSearchVolume}:${item.documentCount}`),
      lastMessage: queueFirstSuggestionSnapshot.lastMessage,
    }));
  fs.rmSync(queueFirstSuggestionProbeFile, { force: true });

  const queueMissProbeFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-queue-miss-test.json');
  const missedTravelProbe = '\uC1A1\uC9C0\uD638 \uBC14\uB2E4\uD558\uB298\uAE38 \uC608\uC57D \uBC29\uBC95';
  fs.writeFileSync(queueMissProbeFile, JSON.stringify({
    version: 1,
    savedAt: '2026-06-15T08:00:00.000Z',
    items: [{
      keyword: missedTravelProbe,
      category: 'travel_domestic',
      source: 'fixture-no-hit-queue',
      priority: 9999,
      firstSeenAt: '2026-06-15T07:00:00.000Z',
      attempts: 0,
      misses: 0,
    }],
  }), 'utf8');
  const queueMissMeasuredKeywords: string[] = [];
  const queueMissRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 4,
    boardTarget: 10,
    maxCandidates: 180,
    categories: ['all'],
    probeQueueFile: queueMissProbeFile,
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
    liveSeedProvider: async () => [],
    enableBackfill: true,
    autocompleteProvider: async () => [],
    searchAdSuggestionProvider: async () => [],
    measureLiveSearchVolumeSeparate: async (_config, keywords, options) => {
      assert('queued miss volume pass keeps document count separated', options?.includeDocumentCount === false);
      queueMissMeasuredKeywords.push(...keywords);
      return [];
    },
    measureLiveDocumentCount: async () => null,
    discover: async () => [],
  });
  await queueMissRadar.runOnce();
  const queueMissAfter = JSON.parse(fs.readFileSync(queueMissProbeFile, 'utf8'));
  assert('no-result queued probe is retained for delayed retry without same-run candidate fanout',
    queueMissMeasuredKeywords.includes(missedTravelProbe)
      && queueMissAfter.items?.some((item: any) => (
        item.keyword === missedTravelProbe
        && item.attempts === 1
        && item.misses === 1
        && item.lastTriedAt
      ))
      && (queueMissAfter.items || []).every((item: any) => item.keyword === missedTravelProbe),
    JSON.stringify({ measured: queueMissMeasuredKeywords, queue: queueMissAfter.items || [] }));
  fs.rmSync(queueMissProbeFile, { force: true });

  const catchUpProbeFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-catchup-queue-depth-test.json');
  const catchUpProbeKeywords = __liveGoldenRadarTestInternals
    .buildMeasuredProbeCandidates('all', [], 720, lottoGuardNow)
    .slice(0, 180);
  fs.writeFileSync(catchUpProbeFile, JSON.stringify({
    version: 1,
    savedAt: '2026-06-15T08:00:00.000Z',
    items: catchUpProbeKeywords.map((keyword, index) => ({
      keyword,
      category: __liveGoldenRadarTestInternals.inferLiveCategory(keyword, 'all'),
      source: 'fixture-catchup-queue',
      priority: 1000 - index,
      firstSeenAt: `2026-06-15T08:${String(index % 60).padStart(2, '0')}:00.000Z`,
      attempts: 0,
      misses: 0,
    })),
  }), 'utf8');
  const catchUpMeasuredKeywords: string[] = [];
  let catchUpAutocompleteCalls = 0;
  let catchUpSuggestionCalls = 0;
  let catchUpDirectCalls = 0;
  let catchUpDirectMaxCandidates = 0;
  const catchUpRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 8,
    boardTarget: 120,
    maxCandidates: 220,
    categories: ['electronics'],
    probeQueueFile: catchUpProbeFile,
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
    liveSeedProvider: async () => [],
    enableBackfill: true,
    autocompleteProvider: async () => {
      catchUpAutocompleteCalls += 1;
      return [];
    },
    searchAdSuggestionProvider: async () => {
      catchUpSuggestionCalls += 1;
      return [];
    },
    measureLiveSearchVolumeSeparate: async (_config, keywords, options) => {
      assert('catch-up queue volume pass keeps document count separated', options?.includeDocumentCount === false);
      catchUpMeasuredKeywords.push(...keywords);
      return [];
    },
    measureLiveDocumentCount: async () => null,
    discover: async (_config, options) => {
      catchUpDirectCalls += 1;
      catchUpDirectMaxCandidates = Number(options?.maxCandidates || 0);
      return [];
    },
  });
  const catchUpSnapshot = await catchUpRadar.runUntilTarget(4);
  assert('live golden catch-up reserves most of the per-cycle SearchAd budget for new direct discovery',
    new Set(catchUpMeasuredKeywords).size > 0
      && new Set(catchUpMeasuredKeywords).size <= 12
      && catchUpDirectCalls === 1
      && catchUpDirectMaxCandidates === 40 - new Set(catchUpMeasuredKeywords).size
      && catchUpDirectMaxCandidates >= 28
      && catchUpSnapshot.successfulRuns === 1,
    JSON.stringify({
      measuredCount: new Set(catchUpMeasuredKeywords).size,
      successfulRuns: catchUpSnapshot.successfulRuns,
      catchUpAutocompleteCalls,
      catchUpSuggestionCalls,
      catchUpDirectCalls,
      catchUpDirectMaxCandidates,
      firstMeasured: catchUpMeasuredKeywords.slice(0, 20),
    }));
  assert('reserved queue budget stops expansion while bounded heavy direct uses only the shared remainder',
    catchUpAutocompleteCalls === 0
      && catchUpSuggestionCalls === 0
      && catchUpDirectCalls === 1
      && catchUpMeasuredKeywords.length + catchUpDirectMaxCandidates <= 40,
    JSON.stringify({
      catchUpAutocompleteCalls,
      catchUpSuggestionCalls,
      catchUpDirectCalls,
      catchUpDirectMaxCandidates,
      measuredCount: new Set(catchUpMeasuredKeywords).size,
    }));
  const catchUpCallsAfterZeroYield = catchUpMeasuredKeywords.length;
  const catchUpDirectCallsAfterZeroYield = catchUpDirectCalls;
  const catchUpCooldownSnapshot = await catchUpRadar.runOnce();
  assert('zero-yield SearchAd cycle enters cooldown before another interval can burn quota',
    catchUpMeasuredKeywords.length === catchUpCallsAfterZeroYield
      && catchUpDirectCalls === catchUpDirectCallsAfterZeroYield
      && /zero-yield cooldown/i.test(catchUpCooldownSnapshot.lastMessage || '')
      && Boolean(catchUpCooldownSnapshot.nextRetryAt),
    JSON.stringify({
      measuredBefore: catchUpCallsAfterZeroYield,
      measuredAfter: catchUpMeasuredKeywords.length,
      directBefore: catchUpDirectCallsAfterZeroYield,
      directAfter: catchUpDirectCalls,
      lastMessage: catchUpCooldownSnapshot.lastMessage,
      nextRetryAt: catchUpCooldownSnapshot.nextRetryAt,
    }));
  const residualQueueFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-residual-direct-budget-test.json');
  const residualQueueKeywords = [
    '\uB85C\uBD07\uCCAD\uC18C\uAE30 \uC6D0\uB8F8 \uAC00\uACA9\uBE44\uAD50',
    '\uBB34\uC120\uCCAD\uC18C\uAE30 \uBC30\uD130\uB9AC \uAD50\uCCB4 \uBE44\uC6A9',
    '\uCC3D\uBB38\uD615 \uC5D0\uC5B4\uCEE8 \uC124\uCE58 \uBE44\uC6A9',
    '\uC81C\uC2B5\uAE30 \uC804\uAE30\uC694\uAE08 \uACC4\uC0B0',
    '\uACF5\uAE30\uCCAD\uC815\uAE30 \uD544\uD130 \uAD50\uCCB4 \uBE44\uC6A9',
  ];
  fs.writeFileSync(residualQueueFile, JSON.stringify({
    version: 1,
    savedAt: '2026-06-15T08:00:00.000Z',
    items: residualQueueKeywords.map((keyword, index) => ({
      keyword,
      category: 'electronics',
      source: 'fixture-residual-direct-budget',
      priority: 1000 - index,
      firstSeenAt: `2026-06-15T08:0${index}:00.000Z`,
      attempts: 0,
      misses: 0,
    })),
  }), 'utf8');
  const residualMeasuredKeywords: string[] = [];
  let residualDirectCalls = 0;
  let residualDirectMaxCandidates = 0;
  const residualDirectRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 8,
    boardTarget: 120,
    maxCandidates: 220,
    categories: ['electronics'],
    probeQueueFile: residualQueueFile,
    getEnvConfig: () => ({ naverClientId: 'client', naverClientSecret: 'secret' }),
    liveSeedProvider: async () => [],
    enableBackfill: true,
    autocompleteProvider: async () => [],
    searchAdSuggestionProvider: async () => [],
    measureLiveSearchVolumeSeparate: async (_config, keywords) => {
      residualMeasuredKeywords.push(...keywords);
      return [];
    },
    measureLiveDocumentCount: async () => null,
    discover: async (_config, options) => {
      residualDirectCalls += 1;
      residualDirectMaxCandidates = Number(options?.maxCandidates || 0);
      return [];
    },
  });
  await residualDirectRadar.runOnce();
  assert('small queue canary leaves the same per-run budget available for heavy direct discovery',
    residualMeasuredKeywords.length > 0
      && residualMeasuredKeywords.length < 40
      && residualDirectCalls === 1
      && residualDirectMaxCandidates >= 12
      && residualDirectMaxCandidates <= 40 - residualMeasuredKeywords.length,
    JSON.stringify({
      measured: residualMeasuredKeywords,
      residualDirectCalls,
      residualDirectMaxCandidates,
    }));
  fs.rmSync(residualQueueFile, { force: true });
  const writerReadyProbeSamples: Array<[string, string]> = [
    ['\uC1A1\uC9C0\uD638 \uBC14\uB2E4\uD558\uB298\uAE38 \uC608\uC57D \uBC29\uBC95', 'travel_domestic'],
    ['\uCFE0\uCFE0\uC81C\uC2B5\uAE30\uB80C\uD0C8 \uAD6C\uB9E4\uCC98 \uCD94\uCC9C', 'shopping'],
    ['\uC704\uB2C9\uC2A4\uCC3D\uBB38\uD615\uC5D0\uC5B4\uCEE8 \uAD6C\uB9E4\uCC98 \uCD94\uCC9C', 'electronics'],
    ['\uADFC\uBB34\uC2DC\uAC04\uACC4\uC0B0\uAE30 \uC54C\uBC14 \uC790\uB3D9\uACC4\uC0B0', 'policy'],
    ['\uCCAD\uB144\uBBF8\uB798\uC801\uAE08 \uB9CC\uAE30\uC218\uB839\uC561 \uACC4\uC0B0', 'policy'],
  ];
  assert('writer-ready queued probes are eligible for live SearchAd measurement',
    writerReadyProbeSamples.every(([keyword, category]) => (
      __liveGoldenRadarTestInternals.isHighYieldSearchAdSpendCandidate(keyword, category, lottoGuardNow)
    )),
    JSON.stringify(writerReadyProbeSamples.map(([keyword, category]) => ({
      keyword,
      category,
      highYield: __liveGoldenRadarTestInternals.isHighYieldSearchAdSpendCandidate(keyword, category, lottoGuardNow),
      measurable: __liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate(keyword, category, lottoGuardNow),
    }))));
  fs.rmSync(catchUpProbeFile, { force: true });

  const volumeBatchProbeFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-volume-batch-test.json');
  const volumeBatchKeywords = [
    '\uCCAD\uB144\uBBF8\uB798\uC801\uAE08 \uC18C\uB4DD\uAE30\uC900 \uACC4\uC0B0',
    '\uCE58\uC544\uBCF4\uD5D8 \uBA74\uCC45\uAE30\uAC04',
    '\uD504\uB9AC\uB79C\uC11C \uADFC\uB85C\uC7A5\uB824\uAE08 \uC18C\uB4DD\uAE30\uC900 \uACC4\uC0B0',
    '\uB85C\uBD07\uCCAD\uC18C\uAE30 \uBB3C\uAC78\uB808 \uD544\uD130 \uAD50\uCCB4 \uBE44\uC6A9',
    '\uC81C\uC8FC \uB80C\uD130\uCE74 \uC644\uC804\uC790\uCC28 \uAC00\uACA9\uBE44\uAD50',
    '\uAC1C\uC778\uC0AC\uC5C5\uC790 \uC885\uD569\uC18C\uB4DD\uC138 \uC138\uC561\uACF5\uC81C \uD55C\uB3C4',
    '\uC54C\uBC14 \uC8FC\uD734\uC218\uB2F9 \uC790\uB3D9\uACC4\uC0B0',
    '\uC77C\uC6A9\uC9C1 4\uB300\uBCF4\uD5D8\uB8CC \uC694\uC728\uD45C',
  ];
  const volumeBatchWinner = volumeBatchKeywords[4];
  fs.writeFileSync(volumeBatchProbeFile, JSON.stringify({
    version: 1,
    savedAt: '2026-06-15T08:00:00.000Z',
    items: volumeBatchKeywords.map((keyword, index) => ({
      keyword,
      category: 'all',
      source: 'fixture-volume-batch',
      priority: 900 - index,
      firstSeenAt: `2026-06-15T08:${String(index).padStart(2, '0')}:00.000Z`,
      attempts: 0,
      misses: 0,
    })),
  }), 'utf8');
  const volumeBatchSizes: number[] = [];
  const volumeBatchRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 8,
    boardTarget: 12,
    maxCandidates: 180,
    categories: ['all'],
    probeQueueFile: volumeBatchProbeFile,
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
    liveSeedProvider: async () => [],
    enableBackfill: true,
    autocompleteProvider: async () => [],
    searchAdSuggestionProvider: async () => [],
    measureLiveSearchVolumeSeparate: async (_config, keywords, options) => {
      assert('batched volume pass keeps document count separated', options?.includeDocumentCount === false);
      volumeBatchSizes.push(keywords.length);
      if (!keywords.includes(volumeBatchWinner)) return [];
      return [{
        keyword: volumeBatchWinner,
        pcSearchVolume: 900,
        mobileSearchVolume: 3300,
        documentCount: null,
        competition: 'LOW',
        monthlyAveCpc: 180,
        searchVolumeSource: 'searchad',
        searchVolumeConfidence: 'high',
        isSearchVolumeEstimated: false,
      }];
    },
    measureLiveDocumentCount: async (keyword) => (
      keyword === volumeBatchWinner
        ? {
          dc: 160,
          source: 'scrape',
          confidence: 'high',
          isEstimated: false,
        }
        : null
    ),
    discover: async () => [],
  });
  const volumeBatchSnapshot = await volumeBatchRadar.runOnce();
  assert('live golden volume measurement keeps partial successes across small SearchAd batches',
    volumeBatchSizes.length >= 2
      && volumeBatchSizes.every((size) => size <= 4)
      && volumeBatchSnapshot.board.some((item) => (
        item.keyword === volumeBatchWinner
        && item.grade === 'SSS'
        && item.pcSearchVolume === 900
        && item.mobileSearchVolume === 3300
        && item.documentCount === 160
      )),
    JSON.stringify({
      volumeBatchSizes,
      board: volumeBatchSnapshot.board.map((item) => `${item.keyword}:${item.grade}:${item.pcSearchVolume}:${item.mobileSearchVolume}:${item.documentCount}`),
    }));
  fs.rmSync(volumeBatchProbeFile, { force: true });

  const productPromotionScore = __liveGoldenRadarTestInternals.livePromotionPriorityBonus(
    '\uC81C\uC2B5\uAE30 \uAC00\uACA9\uBE44\uAD50',
    'electronics',
  );
  const policyPromotionScore = __liveGoldenRadarTestInternals.livePromotionPriorityBonus(
    '\uCCAD\uB144\uBBF8\uB798\uC801\uAE08 \uC9C0\uAE09\uC77C',
    'policy',
  );
  const sportsLookupPromotionScore = __liveGoldenRadarTestInternals.livePromotionPriorityBonus(
    '2026KBO\uC62C\uC2A4\uD0C0\uC804\uD558\uC774\uB77C\uC774\uD2B8',
    'sports',
  );
  const lottoLookupPromotionScore = __liveGoldenRadarTestInternals.livePromotionPriorityBonus(
    '1228\uD68C\uB85C\uB610\uB2F9\uCCA8\uBC88\uD638',
    'life_tips',
  );
  const syntheticIntentChainPromotionScore = __liveGoldenRadarTestInternals.livePromotionPriorityBonus(
    '\uC18C\uC0C1\uACF5\uC778\uD655\uC778\uC11C \uC9C0\uAE09\uC77C \uC0AC\uC6A9\uCC98',
    'policy',
  );
  const weakStrategicFallbackRejected = !__liveGoldenRadarTestInternals.isMeasuredProBoardFallbackMetric({
    keyword: '\uC81C\uC2B5\uAE30 \uAC00\uACA9\uBE44\uAD50',
    grade: 'A',
    score: 62,
    pcSearchVolume: 240,
    mobileSearchVolume: 980,
    totalSearchVolume: 1220,
    documentCount: 1800,
    goldenRatio: 0.68,
    category: 'electronics',
    source: 'fixture-searchad',
    evidence: ['fixture-searchad-volume', 'fixture-naver-document-count'],
    searchVolumeSource: 'searchad',
    searchVolumeConfidence: 'high',
    isSearchVolumeEstimated: false,
    documentCountSource: 'cache',
    documentCountConfidence: 'medium',
    isDocumentCountEstimated: false,
    updatedAt: '2026-06-15T08:00:00.000Z',
    discoveredAt: '2026-06-15T08:00:00.000Z',
    isMeasured: true,
  } as any, new Date('2026-06-15T09:00:00.000Z'));
  assert('cache promotion prioritizes commerce/policy intent over low-conversion issue lookups',
    productPromotionScore > sportsLookupPromotionScore + 500
      && policyPromotionScore > 0
      && lottoLookupPromotionScore < -300
      && syntheticIntentChainPromotionScore < -300
      && weakStrategicFallbackRejected,
    JSON.stringify({
      productPromotionScore,
      policyPromotionScore,
      sportsLookupPromotionScore,
      lottoLookupPromotionScore,
      syntheticIntentChainPromotionScore,
      weakStrategicFallbackRejected,
    }));

  const preserveSplitBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-preserve-split-board-test.json');
  const preserveSplitKeywordCacheFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-preserve-split-keyword-cache-test.json');
  fs.writeFileSync(preserveSplitBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-15T08:00:00.000Z',
    items: [{
      keyword: '\uCCAD\uB144\uC9C0\uC6D0\uAE08 \uC2E0\uCCAD \uBC29\uBC95',
      grade: 'SS',
      score: 95,
      pcSearchVolume: 2400,
      mobileSearchVolume: 9600,
      totalSearchVolume: 12000,
      documentCount: 300,
      goldenRatio: 40,
      cpc: 1300,
      category: 'policy',
      source: 'fixture-measured',
      evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      isDocumentCountEstimated: false,
      updatedAt: '2026-06-15T08:00:00.000Z',
      discoveredAt: '2026-06-15T08:00:00.000Z',
      isMeasured: true,
    }],
  }), 'utf8');
  fs.writeFileSync(preserveSplitKeywordCacheFile, JSON.stringify({
    items: [{
      keyword: '\uCCAD\uB144\uC9C0\uC6D0\uAE08 \uC2E0\uCCAD \uBC29\uBC95',
      grade: 'SS',
      score: 96,
      totalSearchVolume: 15000,
      documentCount: 280,
      goldenRatio: 53.57,
      category: 'policy',
      source: 'fixture-measured',
      evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      isDocumentCountEstimated: false,
      updatedAt: '2026-06-15T08:10:00.000Z',
      discoveredAt: '2026-06-15T08:10:00.000Z',
      isMeasured: true,
    }],
  }), 'utf8');
  const preserveSplitRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: preserveSplitBoardFile,
    keywordCacheFile: preserveSplitKeywordCacheFile,
    boardTarget: 120,
    publicPreviewCount: 5,
    now: () => new Date('2026-06-15T09:00:00.000Z'),
  });
  const preserveSplitItem = preserveSplitRadar.snapshot().board[0];
  assert('live golden board keeps persisted pc/mobile split when keyword cache reload lacks split metrics',
    preserveSplitItem?.pcSearchVolume === 2400
      && preserveSplitItem?.mobileSearchVolume === 9600
      && preserveSplitItem?.totalSearchVolume === 12000
      && preserveSplitItem?.documentCount === 280
      && preserveSplitItem?.cpc === 1300,
    JSON.stringify(preserveSplitItem));
  fs.rmSync(preserveSplitBoardFile, { force: true });
  fs.rmSync(preserveSplitKeywordCacheFile, { force: true });

  const strictReadyBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-strict-ready-test.json');
  const strictCategories = ['policy', 'travel_domestic', 'electronics', 'food', 'it', 'finance', 'shopping'];
  const strictReadyRows = Array.from({ length: 70 }, (_, index) => ({
    keyword: `\uC11C\uBC84\uBCF4\uAC15${index + 1} \uC2E0\uCCAD \uBC29\uBC95`,
    grade: 'SSS',
    score: 99 - (index % 10) * 0.05,
    pcSearchVolume: 2000 + index * 20,
    mobileSearchVolume: 8000 + index * 80,
    totalSearchVolume: 10000 + index * 100,
    documentCount: 200 + index * 2,
    goldenRatio: Number(((10000 + index * 100) / (200 + index * 2)).toFixed(2)),
    category: strictCategories[index % strictCategories.length],
    source: 'fixture-measured',
    evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
    searchVolumeSource: 'searchad',
    searchVolumeConfidence: 'high',
    isSearchVolumeEstimated: false,
    documentCountSource: 'naver-api',
    documentCountConfidence: 'high',
    isDocumentCountEstimated: false,
    updatedAt: '2026-06-15T08:00:00.000Z',
    discoveredAt: '2026-06-15T08:00:00.000Z',
    isMeasured: true,
  }));
  const strictFillerRows = [
    '\uBA4B\uC9C4\uC2E0\uC138\uACC4\uBA87\uBD80\uC791',
    '\uCC38\uAD50\uC721\uBA87\uBD80\uC791',
    '\uC2E0\uC785\uC0AC\uC6D0\uAC15\uD68C\uC7A5\uCD9C\uC5F0\uC9C4',
    '1228\uD68C\uB85C\uB610\uB2F9\uCCA8\uBC88\uD638',
    '1228\uD68C\uB85C\uB610',
  ].map((keyword, index) => ({
    keyword,
    grade: index < 3 ? 'S' : 'A',
    score: 88,
    totalSearchVolume: 20000 + index * 1000,
    documentCount: 300 + index * 40,
    goldenRatio: 40,
    category: index < 3 ? 'drama' : 'life_tips',
    updatedAt: '2026-06-15T08:00:00.000Z',
    discoveredAt: '2026-06-15T08:00:00.000Z',
    isMeasured: true,
  }));
  fs.writeFileSync(strictReadyBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-15T08:00:00.000Z',
    items: [...strictReadyRows, ...strictFillerRows],
  }), 'utf8');
  const strictReadyRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: strictReadyBoardFile,
    boardTarget: 120,
    publicPreviewCount: 5,
    now: () => new Date('2026-06-15T09:00:00.000Z'),
  });
  const strictReadySnapshot = strictReadyRadar.snapshot();
  assert('live golden board expands beyond the free preview with measured publishable rows',
    strictReadySnapshot.board.length >= 30
      && strictReadySnapshot.board.every((item) => item.pcSearchVolume !== null && item.mobileSearchVolume !== null)
      && !strictReadySnapshot.board.some((item) => /\uBA87\uBD80\uC791|\uCD9C\uC5F0\uC9C4|\uB85C\uB610|\uB2F9\uCCA8\uBC88\uD638/.test(item.keyword)),
    strictReadySnapshot.board.map((item) => `${item.rank}:${item.keyword}:${item.pcSearchVolume}:${item.mobileSearchVolume}`).join('|'));
  fs.rmSync(strictReadyBoardFile, { force: true });

  const proMeasuredDisplayBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-pro-measured-display-test.json');
  const proMeasuredDisplayRows = [
    ['policy', ['문화누리카드 잔액조회', '에너지바우처 잔액조회', '근로장려금 지급일', '자녀장려금 신청대상', '청년미래적금 소득기준', '소상공인 전기요금 감면', '육아휴직급여 지급일', '부모급여 신청방법', '기초연금 수급자격', '국민내일배움카드 신청', '청년월세지원 신청', '한부모가정 지원금', '장애인활동지원 신청', '농식품바우처 사용처', '교육급여 바우처 신청']],
    ['finance', ['연말정산 환급일', '퇴직금 계산기 세후', '주휴수당 계산기 알바', '실업급여 계산기', 'ISA 만기 해지', 'IRP 퇴직연금 수령', '청년도약계좌 만기', '자동차세 연납 환급', '종합소득세 환급 조회', '프리랜서 세금 신고', '신용점수 조회', '카드포인트 통합조회', '건강보험료 환급금', '국민연금 예상수령액', '전기요금 계산기']],
    ['health', ['도수치료 실비 청구', '대상포진 예방접종 가격', '독감 무료접종 대상', '공휴일 문여는 병원', '야간진료 소아과', '건강검진 대상자 조회', '임플란트 보험 적용', '백내장 수술 실비', 'A형 독감 격리기간', '수족구 등원 기준', '응급실 진료비', '국가암검진 대상자', '산정특례 등록', '치아보험 면책기간', '간병비 보험 청구']],
    ['education', ['한국사 시험 접수일', '컴활 시험 일정', '수능 원서접수 준비물', '국가장학금 신청기간', '초등돌봄 신청방법', '검정고시 합격자 발표', '토익 접수 마감', '운전면허 적성검사', '학자금대출 상환', '늘봄학교 신청', '유치원 입소대기', '자격증 접수 마감일', '모의고사 등급컷', '고교학점제 선택과목', '대학원 장학금 신청']],
    ['sports', ['월드컵 중계 일정', 'KBO 올스타전 예매', '한국 축구 감독 후보', '손흥민 경기 일정', '이강인 출전 시간', '김민재 교체 이유', '토트넘 프리시즌 일정', '국가대표 명단 발표', '야구 우천취소 기준', '올림픽 예선 중계', '아시안컵 조편성', '프로야구 순위 경우의수', '배구 국가대표 일정', '농구 대표팀 명단', '축구 티켓 예매']],
    ['entertainment', ['콘서트 티켓팅 일정', '팬미팅 예매 방법', '드라마 결말 해석', '영화 쿠키영상', '방송 다시보기 시간', '트로트 콘서트 예매', '아이돌 컴백 일정', '음악방송 투표 방법', '예능 출연진 정리', '넷플릭스 공개시간', '웹툰 휴재 일정', '배우 공식입장', '가요대전 라인업', '영화 무대인사 일정', 'OTT 요금제 비교']],
    ['travel_domestic', ['송지호 바다하늘길 입장료', '제주 렌터카 보험 차이', '지역 축제 주차장', '여름휴가 준비물', '인천공항 주차 예약', '강릉 숙소 체크인', '속초 해수욕장 개장일', '한강 수영장 예약', '고속버스 예매 취소', 'KTX 환불 수수료', '물놀이장 운영시간', '휴게소 맛집 위치', '캠핑장 예약 오픈', '여행자보험 청구방법', '공항버스 첫차시간']],
    ['life_tips', ['사대보험 계산기', '알바 근무시간 계산', '종량제 봉투 가격', '폐가전 무상수거 신청', '여권 재발급 준비물', '주민등록증 재발급', '자동차 검사 예약', '전입신고 확정일자', '우체국 등기 조회', '택배 파업 지역', '장마 기간 예상', '벌레 물림 대처', '냉방병 증상', '수도요금 조회', '탄소중립포인트 신청']],
    ['tech', ['GPT 이미지 생성', '카카오톡 백업 복원', '윈도우 업데이트 오류', 'PASS 인증서 발급', '모바일 신분증 발급', '네이버 인증서 갱신', '유튜브 쇼츠 수익 조건', '구글 애드센스 지급일', '블로그스팟 애드센스 승인', '쿠팡파트너스 링크 생성', '갤럭시 업데이트 일정', '아이폰 iOS 업데이트 방법', '프린터 드라이버 설치', '와이파이 비밀번호 찾기', '공공와이파이 연결']],
  ].flatMap(([category, keywords]) => (keywords as string[]).map((keyword) => ({ category: category as string, keyword }))).concat([
    { category: 'policy', keyword: '다자녀 전기요금 할인' },
    { category: 'policy', keyword: '임산부 교통비 신청' },
    { category: 'policy', keyword: '청년 교통비 지원' },
    { category: 'policy', keyword: '소상공인 이자 환급' },
    { category: 'policy', keyword: '취업성공수당 지급일' },
    { category: 'finance', keyword: '청약통장 해지 불이익' },
    { category: 'finance', keyword: '전세보증보험 반환' },
    { category: 'finance', keyword: '월세 세액공제 조건' },
    { category: 'finance', keyword: '현금영수증 조회' },
    { category: 'finance', keyword: '자동차보험 환급 조회' },
    { category: 'health', keyword: '비대면 진료 처방전' },
    { category: 'health', keyword: '야간 약국 찾기' },
    { category: 'health', keyword: '어린이 해열제 교차복용' },
    { category: 'health', keyword: '코로나 격리 권고기간' },
    { category: 'health', keyword: '독감검사 실비 청구' },
    { category: 'education', keyword: '내신 등급 계산기' },
    { category: 'education', keyword: '검정고시 접수 준비물' },
    { category: 'education', keyword: '방과후학교 신청 기간' },
    { category: 'education', keyword: '학원비 환불 규정' },
    { category: 'education', keyword: '토익 성적 발표일' },
    { category: 'sports', keyword: '축구 대표팀 감독 선임' },
    { category: 'sports', keyword: '월드컵 예선 순위' },
    { category: 'sports', keyword: 'KBO 우천취소 환불' },
    { category: 'sports', keyword: '야구 올스타 투표 방법' },
    { category: 'sports', keyword: '손흥민 프리시즌 중계' },
    { category: 'entertainment', keyword: '콘서트 선예매 인증' },
    { category: 'entertainment', keyword: '팬클럽 선예매 방법' },
    { category: 'entertainment', keyword: '영화 시사회 응모' },
    { category: 'entertainment', keyword: '드라마 원작 결말' },
    { category: 'entertainment', keyword: 'OTT 동시접속 제한' },
    { category: 'travel_domestic', keyword: '제주 렌터카 예약 시기' },
    { category: 'travel_domestic', keyword: '국내선 수하물 규정' },
    { category: 'travel_domestic', keyword: '해수욕장 개장 시간' },
    { category: 'travel_domestic', keyword: '캠핑장 취소 수수료' },
    { category: 'travel_domestic', keyword: '고속도로 통행료 조회' },
    { category: 'life_tips', keyword: '쓰레기 배출요일 조회' },
    { category: 'life_tips', keyword: '대형폐기물 스티커 가격' },
    { category: 'life_tips', keyword: '전기차 충전요금 조회' },
    { category: 'life_tips', keyword: '민방위 사이버교육 일정' },
    { category: 'life_tips', keyword: '여권사진 규정' },
    { category: 'tech', keyword: '챗GPT 이미지 제한' },
    { category: 'tech', keyword: '구글 계정 복구 방법' },
    { category: 'tech', keyword: '카카오톡 채팅방 복구' },
    { category: 'tech', keyword: '윈도우 블루스크린 해결' },
    { category: 'tech', keyword: '애드센스 PIN 재발송' },
    { category: 'jobs', keyword: '실업급여 구직활동 인정' },
    { category: 'jobs', keyword: '국민취업지원제도 수당' },
    { category: 'jobs', keyword: '내일배움카드 출석률' },
    { category: 'jobs', keyword: '알바 퇴직금 조건' },
    { category: 'jobs', keyword: '주휴수당 미지급 신고' },
    { category: 'real_estate', keyword: '전세사기 피해자 신청' },
    { category: 'real_estate', keyword: '청년 전세대출 조건' },
    { category: 'real_estate', keyword: '월세 환급 신청 방법' },
    { category: 'real_estate', keyword: '임대차계약 신고 과태료' },
    { category: 'real_estate', keyword: '아파트 관리비 조회' },
    { category: 'weather', keyword: '장마 시작일 예상' },
    { category: 'weather', keyword: '태풍 경로 실시간' },
    { category: 'weather', keyword: '폭염주의보 기준' },
    { category: 'weather', keyword: '미세먼지 예보 확인' },
    { category: 'weather', keyword: '호우경보 대피요령' },
    { category: 'auto', keyword: '자동차세 환급 신청' },
    { category: 'auto', keyword: '운전면허 갱신 준비물' },
    { category: 'auto', keyword: '하이패스 미납 조회' },
    { category: 'auto', keyword: '차량검사 과태료' },
    { category: 'auto', keyword: '자동차보험 마일리지 환급' },
    { category: 'food', keyword: '배달앱 쿠폰 사용법' },
    { category: 'food', keyword: '복날 삼계탕 예약' },
    { category: 'food', keyword: '급식 식단표 조회' },
    { category: 'food', keyword: '냉장고 냄새 제거 방법' },
    { category: 'food', keyword: '식중독 증상 대처' },
    { category: 'law', keyword: '내용증명 보내는 법' },
    { category: 'law', keyword: '임금체불 신고 방법' },
    { category: 'law', keyword: '소액심판 청구 방법' },
    { category: 'law', keyword: '교통사고 합의금 기준' },
    { category: 'law', keyword: '전세보증금 반환소송' },
  ]);
  fs.writeFileSync(proMeasuredDisplayBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-29T08:00:00.000Z',
    items: proMeasuredDisplayRows.map(({ keyword, category }, index) => ({
      keyword,
      grade: index < 8 ? 'SS' : 'A',
      score: index < 8 ? 92 : 68,
      pcSearchVolume: 180 + index,
      mobileSearchVolume: 920 + index,
      totalSearchVolume: 1100 + index * 2,
      documentCount: 240 + index * 2,
      goldenRatio: Number(((1100 + index * 2) / (240 + index * 2)).toFixed(2)),
      category,
      source: 'persistent-keyword-cache',
      intent: 'persistent-measured-golden-cache',
      evidence: ['persistent-keyword-cache', 'measured-search-volume', 'measured-document-count'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
      documentCountSource: 'cache',
      documentCountConfidence: 'medium',
      isDocumentCountEstimated: false,
      updatedAt: '2026-06-29T08:00:00.000Z',
      discoveredAt: '2026-06-29T08:00:00.000Z',
      isMeasured: true,
    })),
  }), 'utf8');
  const proMeasuredDisplayRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: proMeasuredDisplayBoardFile,
    boardTarget: 120,
    publicPreviewCount: 5,
    now: () => new Date('2026-06-29T09:00:00.000Z'),
  });
  const proMeasuredDisplaySnapshot = proMeasuredDisplayRadar.snapshot();
  assert('pro live golden board refuses filler while keeping a large trusted measured display set',
    proMeasuredDisplaySnapshot.board.length >= 40
      && proMeasuredDisplaySnapshot.publicPreview.length > 0
      && proMeasuredDisplaySnapshot.publicPreview.length <= 5
      && proMeasuredDisplaySnapshot.board.every((item) => item.isMeasured === true)
      && proMeasuredDisplaySnapshot.board.every((item) => item.isSearchVolumeEstimated === false && item.isDocumentCountEstimated === false)
      && proMeasuredDisplaySnapshot.board.every((item) => item.searchVolumeSource === 'searchad' && item.documentCountSource === 'cache')
      && proMeasuredDisplaySnapshot.board.every((item) => ['S+', 'S', 'A'].includes(String(item.valueGrade)))
      && proMeasuredDisplaySnapshot.board.every((item) => item.publishDecision?.verdict === 'publish')
      && proMeasuredDisplaySnapshot.board.every((item) => Number(item.score) > 0)
      // 표시 하드 플로어: 모든 board 행은 문서수 < 검색량 (docs ≥ volume = 의미없음, 노출 금지)
      && proMeasuredDisplaySnapshot.board.every((item) => (item.documentCount || 0) < (item.totalSearchVolume || 0)),
    proMeasuredDisplaySnapshot.board.map((item) => `${item.rank}:${item.keyword}:${item.grade}:${item.totalSearchVolume}/${item.documentCount}`).join('|'));
  fs.rmSync(proMeasuredDisplayBoardFile, { force: true });

  const measuredExactFallbackBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-measured-exact-fallback-test.json');
  const measuredExactFallbackFamilies = [
    ['policy', '\uCCAD\uB144\uC6D4\uC138\uC9C0\uC6D0'],
    ['policy', '\uADFC\uB85C\uC7A5\uB824\uAE08'],
    ['policy', '\uC790\uB140\uC7A5\uB824\uAE08'],
    ['policy', '\uC5D0\uB108\uC9C0\uBC14\uC6B0\uCC98'],
    ['policy', '\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC'],
    ['policy', '\uC18C\uC0C1\uACF5\uC778\uC815\uCC45\uC790\uAE08'],
    ['finance', '\uC5F0\uB9D0\uC815\uC0B0\uD658\uAE09'],
    ['finance', '\uD504\uB9AC\uB79C\uC11C\uC885\uD569\uC18C\uB4DD\uC138'],
    ['finance', '\uD1F4\uC9C1\uAE08\uACC4\uC0B0\uAE30'],
    ['finance', '\uC8FC\uD734\uC218\uB2F9\uACC4\uC0B0\uAE30'],
    ['finance', '\uC2E4\uC5C5\uAE09\uC5EC'],
    ['life_tips', '\uC790\uB3D9\uCC28\uC138\uC5F0\uB0A9'],
    ['life_tips', '\uAD6D\uBBFC\uB0B4\uC77C\uBC30\uC6C0\uCE74\uB4DC'],
    ['life_tips', '\uC721\uC544\uD734\uC9C1\uAE09\uC5EC'],
    ['life_tips', '\uC804\uAE30\uC694\uAE08\uD560\uC778'],
    ['travel_domestic', '\uC81C\uC8FC\uB80C\uD130\uCE74'],
    ['travel_domestic', '\uC778\uCC9C\uACF5\uD56D\uC8FC\uCC28'],
    ['travel_domestic', '\uC5EC\uD589\uC790\uBCF4\uD5D8'],
    ['travel_domestic', '\uC1A1\uC9C0\uD638\uBC14\uB2E4\uD558\uB298\uAE38'],
    ['shopping', '\uC544\uC774\uD328\uB4DC\uBCF4\uD638\uD544\uB984'],
    ['shopping', '\uAE30\uC544ev5'],
    ['shopping', '\uB85C\uBCF4\uB77D\uCCAD\uC18C\uAE30'],
    ['it', '\uC778\uACF5\uC9C0\uB2A5\uC774\uBBF8\uC9C0\uC0DD\uC131'],
    ['it', '\uC720\uD29C\uBE0C\uC1FC\uCE20\uD3B8\uC9D1'],
    ['education', '\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30'],
    ['education', '\uAD6D\uAC00\uC7A5\uD559\uAE08'],
    ['health', '\uBCD1\uC6D0\uBE44\uD658\uAE09'],
    ['health', '\uAC74\uAC15\uAC80\uC9C4\uB300\uC0C1'],
    ['home', '\uC6D4\uC138\uD658\uAE09'],
    ['home', '\uC804\uC138\uBCF4\uC99D\uBCF4\uD5D8'],
    ['shopping', '\uAC00\uC131\uBE44\uC81C\uC2B5\uAE30'],
    ['shopping', '\uC74C\uC2DD\uBB3C\uCC98\uB9AC\uAE30'],
    ['shopping', '\uCC3D\uBB38\uD615\uC5D0\uC5B4\uCEE8'],
    ['shopping', '\uC804\uAE30\uC790\uC804\uAC70'],
    ['shopping', '\uCE98\uD551\uC758\uC790'],
    ['shopping', '\uC544\uAE30\uCE74\uC2DC\uD2B8'],
    ['shopping', '\uACF5\uAE30\uCCAD\uC815\uAE30\uB80C\uD0C8'],
    ['shopping', '\uC815\uC218\uAE30\uB80C\uD0C8'],
    ['shopping', '\uB9E4\uD2B8\uB9AC\uC2A4\uB80C\uD0C8'],
    ['travel_domestic', '\uC5EC\uC218\uCF00\uC774\uBE14\uCE74'],
    ['travel_domestic', '\uBD80\uC0B0\uC694\uD2B8\uD22C\uC5B4'],
    ['travel_domestic', '\uAC15\uB989\uC219\uC18C'],
    ['travel_domestic', '\uC81C\uC8FC\uD56D\uACF5\uAD8C'],
    ['travel_domestic', '\uC18D\uCD08\uB300\uAC8C'],
    ['life_tips', '\uC778\uD130\uB137\uAC00\uC785\uC0AC\uC740\uD488'],
    ['life_tips', '\uD734\uB300\uD3F0\uC694\uAE08\uC81C\uBE44\uAD50'],
    ['life_tips', '\uC774\uC0AC\uCCAD\uC18C\uC5C5\uCCB4'],
    ['life_tips', '\uC790\uB3D9\uCC28\uBCF4\uD5D8\uB8CC\uACC4\uC0B0'],
    ['it', '\uB178\uD2B8\uBD81\uAC00\uACA9\uBE44\uAD50'],
    ['it', '\uAC8C\uC784\uBAA8\uB2C8\uD130\uCD94\uCC9C'],
  ] as const;
  const measuredExactFallbackTails = [
    '\uC2E0\uCCAD \uBC29\uBC95',
    '\uB300\uC0C1 \uC870\uAC74',
    '\uC9C0\uAE09\uC77C \uC870\uD68C',
    '\uC11C\uB958 \uC900\uBE44',
    '\uC0AC\uC6A9\uCC98 \uC815\uB9AC',
  ];
  const measuredExactFallbackRows = measuredExactFallbackFamilies.flatMap(([category, base], familyIndex) => (
    measuredExactFallbackTails.map((tail, tailIndex) => {
      const index = familyIndex * measuredExactFallbackTails.length + tailIndex;
      const totalSearchVolume = 900 + index * 13;
      const pcSearchVolume = 180 + (index % 70);
      const mobileSearchVolume = totalSearchVolume - pcSearchVolume;
      const documentCount = 2200 + index * 17;
      return {
        keyword: `${base} ${tail}`,
        grade: index % 4 === 0 ? 'B' : 'A',
        score: 62 - (index % 9) * 0.2,
        pcSearchVolume,
        mobileSearchVolume,
        totalSearchVolume,
        documentCount,
        goldenRatio: Number((totalSearchVolume / documentCount).toFixed(2)),
        category,
        source: 'persistent-measured-golden-cache',
        intent: 'persistent-measured-golden-cache',
        evidence: ['searchad-volume', 'naver-openapi-document-count'],
        searchVolumeSource: 'searchad',
        searchVolumeConfidence: 'high',
        isSearchVolumeEstimated: false,
        documentCountSource: 'naver-api',
        documentCountConfidence: 'high',
        isDocumentCountEstimated: false,
        updatedAt: '2026-07-01T08:00:00.000Z',
        discoveredAt: '2026-07-01T08:00:00.000Z',
        isMeasured: true,
      };
    })
  ));
  fs.writeFileSync(measuredExactFallbackBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-07-01T08:00:00.000Z',
    items: measuredExactFallbackRows,
  }), 'utf8');
  const measuredExactFallbackRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: measuredExactFallbackBoardFile,
    boardTarget: 120,
    publicPreviewCount: 5,
    now: () => new Date('2026-07-01T09:00:00.000Z'),
  });
  const measuredExactFallbackSnapshot = measuredExactFallbackRadar.snapshot();
  // 정책 갱신(2026-07-09): 비율 역전(docs ≫ volume) 행은 실측이어도 황금 기준 미달 —
  // 보드를 덜 채우더라도 백필로 노출하지 않는다(부족분은 desktop ingest 공급으로 해결).
  assert('ratio-inverted measured cache rows never fill the live board (golden ratio hard floor)',
    measuredExactFallbackSnapshot.board.length === 0
      && !measuredExactFallbackSnapshot.board.some((item) => ((item.totalSearchVolume || 0) / (item.documentCount || 1)) < 1.2),
    measuredExactFallbackSnapshot.board.map((item) => `${item.rank}:${item.keyword}:${item.grade}:${item.totalSearchVolume}/${item.documentCount}`).join('|'));
  fs.rmSync(measuredExactFallbackBoardFile, { force: true });

  assert('past month volatile keywords are stale for live board',
    __liveGoldenRadarTestInternals.isPastMonthVolatileLiveKeyword('\u0035\uC6D4\uC5F0\uB9D0\uC815\uC0B0\uD658\uAE09\uC77C', new Date('2026-07-01T09:00:00.000Z'))
      && __liveGoldenRadarTestInternals.isStaleOrFutureLiveKeyword('\u0035\uC6D4\uC5F0\uB9D0\uC815\uC0B0\uD658\uAE09\uC77C', new Date('2026-07-01T09:00:00.000Z')),
    '5월연말정산환급일 should not surface on July live board');

  const liveBoardQualitySortFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-quality-sort-test.json');
  fs.writeFileSync(liveBoardQualitySortFile, JSON.stringify({
    boardUpdatedAt: '2026-07-01T08:00:00.000Z',
    items: [
      {
        keyword: '\uC81C\uC8FC\uB80C\uD2B8\uCE74\uAC00\uACA9\uBE44\uAD50\uC0AC\uC774\uD2B8',
        grade: 'A',
        score: 71,
        pcSearchVolume: 350,
        mobileSearchVolume: 1010,
        totalSearchVolume: 1360,
        documentCount: 8534,
        goldenRatio: 0.16,
        category: 'travel_domestic',
        source: 'persistent-measured-golden-cache',
        intent: 'persistent-measured-golden-cache',
        evidence: ['searchad-volume', 'naver-openapi-document-count'],
        searchVolumeSource: 'searchad',
        searchVolumeConfidence: 'high',
        isSearchVolumeEstimated: false,
        documentCountSource: 'naver-api',
        documentCountConfidence: 'high',
        isDocumentCountEstimated: false,
        updatedAt: '2026-07-01T08:10:00.000Z',
        discoveredAt: '2026-07-01T08:10:00.000Z',
        isMeasured: true,
      },
      {
        keyword: '\uC8FC\uD734\uC218\uB2F9\uACC4\uC0B0\uAE30\uC2DC\uD504\uD2F0 \uC54C\uBC14 \uC790\uB3D9\uACC4\uC0B0',
        grade: 'SSS',
        score: 98,
        pcSearchVolume: 210,
        mobileSearchVolume: 1040,
        totalSearchVolume: 1250,
        documentCount: 182,
        goldenRatio: 6.87,
        category: 'policy',
        source: 'persistent-measured-golden-cache',
        intent: 'persistent-measured-golden-cache',
        evidence: ['searchad-volume', 'naver-openapi-document-count'],
        searchVolumeSource: 'searchad',
        searchVolumeConfidence: 'high',
        isSearchVolumeEstimated: false,
        documentCountSource: 'naver-api',
        documentCountConfidence: 'high',
        isDocumentCountEstimated: false,
        updatedAt: '2026-07-01T08:00:00.000Z',
        discoveredAt: '2026-07-01T08:00:00.000Z',
        isMeasured: true,
      },
      {
        keyword: '\u0035\uC6D4\uC5F0\uB9D0\uC815\uC0B0\uD658\uAE09\uC77C',
        grade: 'SSS',
        score: 98,
        pcSearchVolume: 2860,
        mobileSearchVolume: 11200,
        totalSearchVolume: 14060,
        documentCount: 2274,
        goldenRatio: 6.18,
        category: 'policy',
        source: 'persistent-measured-golden-cache',
        intent: 'persistent-measured-golden-cache',
        evidence: ['searchad-volume', 'naver-openapi-document-count'],
        searchVolumeSource: 'searchad',
        searchVolumeConfidence: 'high',
        isSearchVolumeEstimated: false,
        documentCountSource: 'naver-api',
        documentCountConfidence: 'high',
        isDocumentCountEstimated: false,
        updatedAt: '2026-07-01T08:20:00.000Z',
        discoveredAt: '2026-07-01T08:20:00.000Z',
        isMeasured: true,
      },
    ],
  }), 'utf8');
  const liveBoardQualitySortRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: liveBoardQualitySortFile,
    boardTarget: 3,
    publicPreviewCount: 2,
    now: () => new Date('2026-07-01T09:00:00.000Z'),
  });
  const liveBoardQualitySortSnapshot = liveBoardQualitySortRadar.snapshot();
  // 정책 갱신(2026-07-09): 비율 역전 약한 폴백 행(비율 0.16)은 순위 강등이 아니라 board 노출 자체가 금지된다.
  assert('live golden board keeps proven SSS, blocks ratio-inverted fallback, drops stale month keywords',
    liveBoardQualitySortSnapshot.board[0]?.keyword === '\uC8FC\uD734\uC218\uB2F9\uACC4\uC0B0\uAE30\uC2DC\uD504\uD2F0 \uC54C\uBC14 \uC790\uB3D9\uACC4\uC0B0'
      && !liveBoardQualitySortSnapshot.board.some((item) => item.keyword === '\uC81C\uC8FC\uB80C\uD2B8\uCE74\uAC00\uACA9\uBE44\uAD50\uC0AC\uC774\uD2B8')
      && !liveBoardQualitySortSnapshot.board.some((item) => item.keyword === '\u0035\uC6D4\uC5F0\uB9D0\uC815\uC0B0\uD658\uAE09\uC77C'),
    liveBoardQualitySortSnapshot.board.map((item) => `${item.rank}:${item.keyword}:${item.grade}:${item.goldenRatio}`).join('|'));
  fs.rmSync(liveBoardQualitySortFile, { force: true });

  const fallbackDcBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-fallback-dc-test.json');
  fs.writeFileSync(fallbackDcBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-15T08:00:00.000Z',
    items: [
      {
        keyword: '\uC11C\uBC84\uBCF4\uAC15 \uC2E0\uCCAD \uBC29\uBC95',
        grade: 'SSS',
        score: 99,
        pcSearchVolume: 2400,
        mobileSearchVolume: 9600,
        totalSearchVolume: 12000,
        documentCount: 120,
        goldenRatio: 100,
        category: 'policy',
        source: 'fixture-measured',
        evidence: ['fixture-searchad-volume'],
        searchVolumeSource: 'searchad',
        searchVolumeConfidence: 'high',
        documentCountSource: 'fallback',
        documentCountConfidence: 'low',
        isDocumentCountEstimated: true,
        updatedAt: '2026-06-15T08:00:00.000Z',
        discoveredAt: '2026-06-15T08:00:00.000Z',
        isMeasured: true,
      },
      {
        keyword: '\uCCAD\uB144\uC9C0\uC6D0\uAE08 \uC2E0\uCCAD \uBC29\uBC95',
        grade: 'SSS',
        score: 99,
        pcSearchVolume: 2200,
        mobileSearchVolume: 8800,
        totalSearchVolume: 11000,
        documentCount: 180,
        goldenRatio: 61.11,
        category: 'policy',
        source: 'fixture-measured',
        evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
        searchVolumeSource: 'searchad',
        searchVolumeConfidence: 'high',
        documentCountSource: 'naver-api',
        documentCountConfidence: 'high',
        isDocumentCountEstimated: false,
        updatedAt: '2026-06-15T08:00:00.000Z',
        discoveredAt: '2026-06-15T08:00:00.000Z',
        isMeasured: true,
      },
    ],
  }), 'utf8');
  const fallbackDcRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: fallbackDcBoardFile,
    boardTarget: 120,
    publicPreviewCount: 5,
    now: () => new Date('2026-06-15T09:00:00.000Z'),
  });
  const fallbackDcSnapshot = fallbackDcRadar.snapshot();
  assert('fallback document-count rows never reach live golden board or free preview',
    fallbackDcSnapshot.board.some((item) => item.keyword === '\uCCAD\uB144\uC9C0\uC6D0\uAE08 \uC2E0\uCCAD \uBC29\uBC95')
      && !fallbackDcSnapshot.board.some((item) => item.keyword === '\uC11C\uBC84\uBCF4\uAC15 \uC2E0\uCCAD \uBC29\uBC95')
      && !fallbackDcSnapshot.publicPreview.some((item) => item.documentCountSource === 'fallback' || item.isDocumentCountEstimated === true),
    JSON.stringify(fallbackDcSnapshot.board));
  fs.rmSync(fallbackDcBoardFile, { force: true });

  const strictNearBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-strict-near-merge-test.json');
  fs.writeFileSync(strictNearBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-15T08:00:00.000Z',
    items: [
      {
        keyword: '\uC1A1\uC9C0\uD638 \uBC14\uB2E4\uD558\uB298\uAE38 \uC785\uC7A5\uB8CC',
        grade: 'SSS',
        score: 99,
        pcSearchVolume: 200,
        mobileSearchVolume: 2190,
        totalSearchVolume: 2390,
        documentCount: 141,
        goldenRatio: 16.95,
        category: 'travel_domestic',
        source: 'fixture-measured',
        evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
        searchVolumeSource: 'searchad',
        searchVolumeConfidence: 'high',
        isSearchVolumeEstimated: false,
        documentCountSource: 'naver-api',
        documentCountConfidence: 'high',
        isDocumentCountEstimated: false,
        updatedAt: '2026-06-15T08:00:00.000Z',
        discoveredAt: '2026-06-15T08:00:00.000Z',
        isMeasured: true,
      },
      {
        keyword: '\uB18D\uC2DD\uD488\uBC14\uC6B0\uCC98 \uC2E0\uCCAD \uB300\uC0C1',
        grade: 'S',
        score: 96,
        totalSearchVolume: 51850,
        documentCount: 8934,
        goldenRatio: 5.8,
        category: 'policy',
        updatedAt: '2026-06-15T08:00:00.000Z',
        discoveredAt: '2026-06-15T08:00:00.000Z',
        isMeasured: true,
      },
      {
        keyword: '\uCC38\uAD50\uC721\uBA87\uBD80\uC791',
        grade: 'SSS',
        score: 99,
        pcSearchVolume: 1000,
        mobileSearchVolume: 9000,
        totalSearchVolume: 10000,
        documentCount: 120,
        goldenRatio: 83.33,
        category: 'drama',
        updatedAt: '2026-06-15T08:00:00.000Z',
        discoveredAt: '2026-06-15T08:00:00.000Z',
        isMeasured: true,
      },
    ],
  }), 'utf8');
  const strictNearRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: strictNearBoardFile,
    boardTarget: 10,
    publicPreviewCount: 5,
    now: () => new Date('2026-06-15T09:00:00.000Z'),
  });
  const strictNearSnapshot = strictNearRadar.snapshot();
  assert('live golden board keeps splitless near-ultimate rows internal until SearchAd split is enriched',
    strictNearSnapshot.board.some((item) => item.keyword === '\uC1A1\uC9C0\uD638 \uBC14\uB2E4\uD558\uB298\uAE38 \uC785\uC7A5\uB8CC')
      && !strictNearSnapshot.board.some((item) => item.keyword === '\uB18D\uC2DD\uD488\uBC14\uC6B0\uCC98 \uC2E0\uCCAD \uB300\uC0C1')
      && !strictNearSnapshot.board.some((item) => item.pcSearchVolume === null || item.mobileSearchVolume === null)
      && !strictNearSnapshot.board.some((item) => /\uBA87\uBD80\uC791/.test(item.keyword)),
    strictNearSnapshot.board.map((item) => `${item.rank}:${item.keyword}:${item.grade}:${item.goldenRatio}`).join('|'));
  fs.rmSync(strictNearBoardFile, { force: true });

  let skippedDiscoverCalls = 0;
  const skippedRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    shouldRun: () => ({ ok: false, message: 'manual queue busy' }),
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
    liveSeedProvider: async () => [],
    enableBackfill: false,
    discover: async () => {
      skippedDiscoverCalls += 1;
      return [];
    },
  });
  const skipped = await skippedRadar.runOnce();
  assert('live radar skips while server is busy',
    skipped.skippedRuns === 1 && skippedDiscoverCalls === 0 && /busy/.test(skipped.lastMessage || ''));

  let deficitScheduledCategory = '';
  const deficitSchedulerBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-deficit-scheduler-test.json');
  fs.mkdirSync(path.dirname(deficitSchedulerBoardFile), { recursive: true });
  fs.writeFileSync(deficitSchedulerBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-07-05T00:00:00.000Z',
    items: [
      '청년미래적금 가입신청 대상',
      '근로장려금 지급일 조회',
      '문화누리카드 사용처 조회',
      '에너지바우처 잔액조회',
    ].map((keyword, index) => previewBoardItem(keyword, 'policy', index)),
  }), 'utf8');
  const deficitScheduledRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: deficitSchedulerBoardFile,
    boardTarget: 10,
    categories: ['policy', 'education', 'car'],
    getEnvConfig: () => ({
      naverClientId: 'category-scheduler-client',
      naverClientSecret: 'category-scheduler-secret',
    }),
    liveSeedProvider: async () => [],
    enableBackfill: false,
    now: () => new Date('2026-07-05T00:01:00.000Z'),
    discover: async (_config, options) => {
      deficitScheduledCategory = String(options.category || '');
      return [];
    },
  });
  const deficitScheduledSnapshot = await deficitScheduledRadar.runOnce();
  assert('live radar uses deficit category policy instead of fixed round robin order',
    deficitScheduledCategory === 'education'
      && deficitScheduledSnapshot.categoryStats?.education?.scans === 1
      && deficitScheduledSnapshot.categoryStats.education.published === 0,
    `${deficitScheduledCategory}:${JSON.stringify(deficitScheduledSnapshot.categoryStats)}`);
  fs.rmSync(deficitSchedulerBoardFile, { force: true });

  let searchAdQuotaNowMs = Date.parse('2026-07-11T10:00:00.000Z');
  const searchAdQuotaResetAtMs = Date.parse('2026-07-11T15:00:00.000Z');
  let searchAdQuotaRetryDelay = 0;
  let searchAdQuotaRetryHandler: (() => void) | null = null;
  let searchAdQuotaIntervalHandler: (() => void) | null = null;
  let searchAdQuotaDiscoverCalls = 0;
  const searchAdQuotaBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-searchad-quota-board-test.json');
  fs.mkdirSync(path.dirname(searchAdQuotaBoardFile), { recursive: true });
  fs.writeFileSync(searchAdQuotaBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-07-11T09:59:00.000Z',
    items: [previewBoardItem('청년미래적금 가입신청 대상', 'policy', 0)],
  }), 'utf8');
  const searchAdQuotaRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    intervalMs: 180_000,
    boardFile: searchAdQuotaBoardFile,
    getEnvConfig: () => ({
      naverClientId: 'searchad-quota-client',
      naverClientSecret: 'searchad-quota-secret',
      naverSearchAdAccessLicense: 'searchad-access-license',
      naverSearchAdSecretKey: 'searchad-secret-key',
      naverSearchAdCustomerId: '1234567',
    }),
    liveSeedProvider: async () => [],
    enableBackfill: false,
    searchAdQuotaState: () => ({
      exhausted: true,
      calls: 22_000,
      remaining: 0,
      softCeiling: 22_000,
      resetAtMs: searchAdQuotaResetAtMs,
    }),
    setIntervalFn: (handler) => {
      searchAdQuotaIntervalHandler = handler;
      return 'searchad-quota-interval';
    },
    clearIntervalFn: () => undefined,
    setTimeoutFn: (handler, delayMs) => {
      searchAdQuotaRetryHandler = handler;
      searchAdQuotaRetryDelay = delayMs;
      return 'searchad-quota-timeout';
    },
    clearTimeoutFn: () => undefined,
    now: () => new Date(searchAdQuotaNowMs),
    discover: async () => {
      searchAdQuotaDiscoverCalls += 1;
      return [];
    },
  });
  searchAdQuotaRadar.start();
  const searchAdQuotaSkipped = await searchAdQuotaRadar.runUntilTarget(8);
  assert('live radar circuit-breaks all catch-up work at the SearchAd soft ceiling',
    searchAdQuotaSkipped.skippedRuns === 1
      && searchAdQuotaDiscoverCalls === 0
      && searchAdQuotaSkipped.searchAdQuota?.exhausted === true
      && searchAdQuotaSkipped.searchAdQuota.calls === 22_000
      && /SearchAd daily soft ceiling/.test(searchAdQuotaSkipped.lastMessage || ''),
    JSON.stringify(searchAdQuotaSkipped));
  assert('SearchAd circuit breaker sleeps until the next KST reset instead of polling every interval',
    searchAdQuotaRetryDelay >= searchAdQuotaResetAtMs - searchAdQuotaNowMs
      && /2026-07-11T15:00:00/.test(searchAdQuotaSkipped.nextRetryAt || ''),
    `${searchAdQuotaRetryDelay}:${searchAdQuotaSkipped.nextRetryAt}`);
  const quotaPersistedBoard = JSON.parse(fs.readFileSync(searchAdQuotaBoardFile, 'utf8'));
  assert('SearchAd sleep still publishes already measured trusted inventory to the shared board file',
    typeof quotaPersistedBoard.savedAt === 'string'
      && Array.isArray(quotaPersistedBoard.items)
      && quotaPersistedBoard.items.length >= 1,
    JSON.stringify(quotaPersistedBoard));
  searchAdQuotaIntervalHandler?.();
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert('scheduled worker interval stays idle while SearchAd quota sleep is active',
    searchAdQuotaDiscoverCalls === 0 && searchAdQuotaSkipped.skippedRuns === 1,
    `${searchAdQuotaDiscoverCalls}:${searchAdQuotaSkipped.skippedRuns}`);
  searchAdQuotaNowMs = searchAdQuotaResetAtMs + 1_000;
  searchAdQuotaRetryHandler?.();
  await new Promise((resolve) => setTimeout(resolve, 25));
  searchAdQuotaRadar.stop();
  fs.rmSync(searchAdQuotaBoardFile, { force: true });

  let quotaRetryNowMs = Date.parse('2026-06-21T10:00:00.000Z');
  let quotaRetryHandler: (() => void) | null = null;
  let quotaRetryDelay = 0;
  let quotaRetryDiscoverCalls = 0;
  markNaverBlogOpenApiQuotaBlocked({
    clientId: 'quota-retry-client',
    clientSecret: 'quota-retry-secret',
    label: 'quota-retry-test',
  }, quotaRetryNowMs);
  const quotaRetryRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    intervalMs: 180_000,
    getEnvConfig: () => ({
      naverClientId: 'quota-retry-client',
      naverClientSecret: 'quota-retry-secret',
    }),
    liveSeedProvider: async () => [],
    enableBackfill: false,
    setIntervalFn: () => 'quota-retry-interval',
    clearIntervalFn: () => undefined,
    setTimeoutFn: (handler, delayMs) => {
      quotaRetryHandler = handler;
      quotaRetryDelay = delayMs;
      return 'quota-retry-timeout';
    },
    clearTimeoutFn: () => undefined,
    now: () => new Date(quotaRetryNowMs),
    discover: async () => {
      quotaRetryDiscoverCalls += 1;
      return [];
    },
  });
  quotaRetryRadar.start();
  const quotaSkipped = await quotaRetryRadar.runOnce();
  assert('live radar schedules a short retry when document quota is exhausted',
    quotaSkipped.skippedRuns === 1
      && quotaRetryDiscoverCalls === 0
      && quotaRetryDelay === 180_000
      && /retry after/.test(quotaSkipped.lastMessage || '')
      && /2026-06-21T10:05:00/.test(quotaSkipped.nextRetryAt || ''),
    `${quotaSkipped.skippedRuns}:${quotaRetryDiscoverCalls}:${quotaRetryDelay}:${quotaSkipped.nextRetryAt}:${quotaSkipped.lastMessage}`);
  quotaRetryNowMs = Date.parse(quotaSkipped.nextRetryAt || '') + 1_000;
  quotaRetryHandler?.();
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert('live radar resumes discovery when quota retry timer fires after reset',
    quotaRetryDiscoverCalls > 0,
    String(quotaRetryDiscoverCalls));
  quotaRetryRadar.stop();

  let quotaScrapeNowMs = Date.parse('2026-06-21T10:30:00.000Z');
  let quotaScrapeVolumeCalls = 0;
  let quotaScrapeDocumentCalls = 0;
  markNaverBlogOpenApiQuotaBlocked({
    clientId: 'quota-scrape-client',
    clientSecret: 'quota-scrape-secret',
    label: 'quota-scrape-test',
  }, quotaScrapeNowMs);
  const quotaScrapeRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 8,
    boardTarget: 10,
    categories: ['policy'],
    getEnvConfig: () => ({
      naverClientId: 'quota-scrape-client',
      naverClientSecret: 'quota-scrape-secret',
      naverSearchAdAccessLicense: 'access',
      naverSearchAdSecretKey: 'secret-key',
    }),
    liveSeedProvider: async () => ['청년미래적금 가입신청'],
    autocompleteProvider: async () => ['청년미래적금 가입신청 대상'],
    discover: async () => [],
    measureLiveSearchVolumeSeparate: async () => {
      quotaScrapeVolumeCalls += 1;
      return [{
        keyword: '청년미래적금 가입신청 대상',
        pcSearchVolume: 5200,
        mobileSearchVolume: 20800,
        documentCount: null,
        competition: 'LOW',
        monthlyAveCpc: 740,
      }];
    },
    measureLiveDocumentCount: async (_keyword, options) => {
      quotaScrapeDocumentCalls += 1;
      assert('quota fallback document measurement uses scrape-only mode',
        options?.scrapeOnly === true,
        JSON.stringify(options));
      return {
        dc: 360,
        source: 'scrape',
        confidence: 'medium',
        isEstimated: false,
        debug: { scrapeDc: 360 },
      };
    },
    now: () => new Date(quotaScrapeNowMs),
  });
  const quotaScrapeSnapshot = await quotaScrapeRadar.runOnce();
  assert('live radar uses verified scrape document counts when OpenAPI quota is exhausted',
    quotaScrapeVolumeCalls > 0
      && quotaScrapeDocumentCalls > 0
      && quotaScrapeSnapshot.skippedRuns === 0
      && quotaScrapeSnapshot.board.some((item) => (
        item.keyword === '청년미래적금 가입신청 대상'
        && item.documentCount === 360
        && item.documentCountSource === 'scrape'
        && item.documentCountConfidence === 'medium'
        && item.isDocumentCountEstimated === false
      )),
    JSON.stringify({
      volumeCalls: quotaScrapeVolumeCalls,
      documentCalls: quotaScrapeDocumentCalls,
      skippedRuns: quotaScrapeSnapshot.skippedRuns,
      lastMessage: quotaScrapeSnapshot.lastMessage,
      board: quotaScrapeSnapshot.board,
    }));

  let intervalRegistered = false;
  let cleared = false;
  const scheduledRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    setIntervalFn: () => {
      intervalRegistered = true;
      return 'live-timer';
    },
    clearIntervalFn: (handle) => {
      if (handle === 'live-timer') cleared = true;
    },
  });
  scheduledRadar.start();
  scheduledRadar.stop();
  assert('live radar scheduler starts and stops cleanly', intervalRegistered && cleared);

  let catchupTick: (() => void) | null = null;
  let schedulerCatchupDiscoverCalls = 0;
  const schedulerCatchupRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 5,
    boardTarget: 10,
    categories: ['policy', 'sports'],
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
    liveSeedProvider: async () => [],
    enableBackfill: false,
    setIntervalFn: (handler) => {
      catchupTick = handler;
      return 'catchup-timer';
    },
    clearIntervalFn: () => {},
    measureLiveSearchVolumeSeparate: async () => [],
    discover: async () => {
      const offset = schedulerCatchupDiscoverCalls * 5;
      schedulerCatchupDiscoverCalls += 1;
      const seeds = [
        { keyword: `정책지원금 ${offset + 1} 신청 방법`, category: 'policy' },
        { keyword: `제주 렌터카 ${offset + 2} 가격비교`, category: 'travel_domestic' },
        { keyword: `AI 영상툴 ${offset + 3} 가격비교`, category: 'it' },
        { keyword: `도수치료 ${offset + 4} 보험 적용 비용`, category: 'health' },
        { keyword: `무선청소기 ${offset + 5} 가격비교`, category: 'electronics' },
      ];
      return seeds.map((seed, index) => ({
        ...result(seed.keyword, index),
        grade: 'SSS',
        score: 99,
        searchVolume: 12000 + index * 500,
        pcSearchVolume: 2400 + index * 100,
        mobileSearchVolume: 9600 + index * 400,
        documentCount: 300 + index * 10,
        goldenRatio: 40,
        category: seed.category,
      }));
    },
  });
  schedulerCatchupRadar.start();
  catchupTick?.();
  await new Promise((resolve) => setTimeout(resolve, 25));
  const schedulerCatchupSnapshot = schedulerCatchupRadar.snapshot();
  schedulerCatchupRadar.stop();
  assert('live radar scheduler catches up while board is below target',
    schedulerCatchupDiscoverCalls >= 2
      && schedulerCatchupSnapshot.boardCount >= 8
      && schedulerCatchupSnapshot.successfulRuns === 2,
    `${schedulerCatchupDiscoverCalls}:${schedulerCatchupSnapshot.boardCount}:${schedulerCatchupSnapshot.successfulRuns}`);

  const workerSyncDir = path.join(root, 'tmp', 'live-golden-worker-sync-test');
  fs.mkdirSync(workerSyncDir, { recursive: true });
  const workerBoardFile = path.join(workerSyncDir, 'live-golden-board.json');
  const workerCacheFile = path.join(workerSyncDir, 'mobile-cache.json');
  const workerKeywordCacheFile = path.join(workerSyncDir, 'keyword-cache.json');
  for (const filePath of [workerBoardFile, workerCacheFile, workerKeywordCacheFile]) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  const apiReadonlyRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    refreshBoardFileOnSnapshot: true,
    boardFile: workerBoardFile,
    resultCacheFile: workerCacheFile,
    keywordCacheFile: workerKeywordCacheFile,
    now: () => new Date('2026-06-28T03:00:00.000Z'),
  });
  fs.writeFileSync(workerBoardFile, JSON.stringify({
    version: 1,
    boardUpdatedAt: '2026-06-28T02:59:00.000Z',
    savedAt: '2026-06-28T02:59:00.000Z',
    items: [
      {
        keyword: '\uADFC\uB85C\uC7A5\uB824\uAE08 \uC9C0\uAE09\uC77C',
        grade: 'SSS',
        score: 98,
        pcSearchVolume: 1200,
        mobileSearchVolume: 6800,
        totalSearchVolume: 8000,
        documentCount: 320,
        goldenRatio: 25,
        cpc: 0,
        category: 'policy',
        source: 'live-golden-worker',
        intent: 'worker-measured-need',
        evidence: ['worker-board-file', 'measured-search-volume', 'measured-document-count'],
        isMeasured: true,
        documentCountSource: 'naver-api',
        documentCountConfidence: 'high',
        isDocumentCountEstimated: false,
        searchVolumeSource: 'searchad',
        searchVolumeConfidence: 'high',
        isSearchVolumeEstimated: false,
        updatedAt: '2026-06-28T02:59:00.000Z',
        discoveredAt: '2026-06-28T02:59:00.000Z',
      },
      {
        keyword: '\uC1A1\uC9C0\uD638\uBC14\uB2E4\uD558\uB298\uAE38 \uC785\uC7A5\uB8CC',
        grade: 'SSS',
        score: 98,
        pcSearchVolume: 230,
        mobileSearchVolume: 2300,
        totalSearchVolume: 2530,
        documentCount: 157,
        goldenRatio: 16.11,
        cpc: 0,
        category: 'travel_domestic',
        source: 'live-golden-worker',
        intent: 'worker-measured-need',
        evidence: ['worker-board-file', 'measured-search-volume', 'measured-document-count'],
        isMeasured: true,
        documentCountSource: 'naver-api',
        documentCountConfidence: 'high',
        isDocumentCountEstimated: false,
        searchVolumeSource: 'searchad',
        searchVolumeConfidence: 'high',
        isSearchVolumeEstimated: false,
        updatedAt: '2026-06-28T02:59:00.000Z',
        discoveredAt: '2026-06-28T02:59:00.000Z',
      },
    ],
  }), 'utf8');
  const workerSyncedSnapshot = apiReadonlyRadar.snapshot();
  assert('API snapshot reloads live golden board written by worker process',
    workerSyncedSnapshot.boardCount === 2
      && workerSyncedSnapshot.board.every((item) => item.source === 'live-golden-worker')
      && workerSyncedSnapshot.board.every((item) => item.isSearchVolumeEstimated === false && item.isDocumentCountEstimated === false),
    `${workerSyncedSnapshot.boardCount}:${workerSyncedSnapshot.board.map((item) => item.keyword).join(',')}`);

  const naturalQuality = (__liveGoldenRadarTestInternals as any).isHumanNaturalGoldenMetric;
  const measuredQualityRow = (keyword: string, evidence: string[] = []) => ({
    keyword,
    evidence,
  });
  const knownProductionFalsePositives = [
    '\uC1A1\uC9C0\uD638\uBC14\uB2E4\uD558\uB298\uAE38\uC7A5\uB2E8\uC810\uC608\uC57D\uBC29\uBC95',
    '\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30\uC54C\uBC14\uC5D1\uC140\uC591\uC2DD',
    '\uCCAD\uB144\uBBF8\uB798\uC801\uAE08\uC9C0\uAE09\uC77C',
    'ISA\uD1F4\uC9C1\uC790\uC2E0\uCCAD\uBC29\uBC95',
    '\uC5F0\uAE08\uC800\uCD95\uD1F4\uC9C1\uC790\uC2E0\uCCAD\uBC29\uBC95',
    '\uD14C\uC2AC\uB77C\uC18C\uB4DD\uAE30\uC900\uACC4\uC0B0',
    '\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC\uC0AC\uC6A9\uCC98\uB514\uC2DC',
    '\uCCAD\uB144\uB4E4\uC774\uACF5\uC5F0\uC608\uC220\uC9C0\uAE09\uC77C\uB300\uC0C1',
    '\uC1A1\uC9C0\uD638\uBC14\uB2E4\uD558\uB298\uAE38\uC8FC\uCC28\uC88C\uC11D\uBC30\uCE58\uB3C4',
    '\uC81C\uC2B5\uAE30\uB80C\uD0C8\uC790\uCDE8\uBC29\uC18C\uC74C\uC870\uD68C\uC790\uCDE8\uBC29\uC18C\uC74C',
    '\uB8E8\uD14C\uC778\uC21C\uC704\uAC80\uC0AC\uBE44\uC6A9',
    '\uC544\uC774\uD3F0\uC790\uCDE8\uBC29\uAD6C\uB9E4\uCC98\uC870\uD68C',
    '\uC1A1\uC9C0\uD638\uBC14\uB2E4\uD558\uB298\uAE38\uC7A5\uB2E8\uC810\uC608\uC57D\uC8FC\uCC28',
    '\uD3ED\uC5FC\uCDE8\uC57D\uB300\uC0C1\uC790\uBCC4\uC704\uD5D8\uC694\uC778\uB9C8\uAC10\uC77C',
    '\uC1A1\uC9C0\uD638\uC18C\uB4DD\uAE30\uC900\uACC4\uC0B0',
    '\uC1A1\uC9C0\uD638\uBC14\uB2E4\uD558\uB298\uAE38\uC7A5\uB2E8\uC810\uC608\uC57D',
    '\uC81C\uC2B5\uAE30\uB80C\uD0C8\uC790\uCDE8\uBC29\uC18C\uC74C\uC870\uD68C',
    '\uCC28\uB7C9\uC6A9\uB0C9\uC7A5\uACE0\uCD94\uCC9C\uC870\uD68C',
    '\uC1A1\uC9C0\uD638\uBC14\uB2E4\uD558\uB298\uAE38\uC8FC\uCC28\uB69C\uBC85\uC774\uC608\uC57D',
    '\uC1A1\uC9C0\uD638\uBC14\uB2E4\uD558\uB298\uAE38\uC785\uC7A5\uB8CC\uC544\uC774\uB791\uC608\uC57D',
    '\uAC15\uD6C8\uC2DD\uC18C\uB4DD\uAE30\uC900\uACC4\uC0B0',
    '\uC624\uC0AC\uCE74\uD56D\uACF5\uAD8CeSIM\uC124\uC815\uC120\uD0DD\uAC00\uC774\uB4DC',
    '\uC1A1\uC9C0\uD638\uBC14\uB2E4\uD558\uB298\uAE38\uACBD\uBE44\uC608\uC57D\uBC29\uBC95',
    '\uC1A1\uC9C0\uD638\uBC14\uB2E4\uD558\uB298\uAE38\uC785\uC7A5\uB8CC\uC900\uBE44\uBB3C',
  ];
  assert('human-natural quality gate rejects known production intent conflicts and stacked fragments',
    typeof naturalQuality === 'function'
      && knownProductionFalsePositives.every((keyword) => !naturalQuality(measuredQualityRow(keyword))),
    knownProductionFalsePositives.join('|'));
  assert('human-natural quality gate preserves natural measured search needs',
    typeof naturalQuality === 'function'
      && [
        '\uC1A1\uC9C0\uD638\uBC14\uB2E4\uD558\uB298\uAE38\uC785\uC7A5\uB8CC',
        '\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30\uD504\uB9AC\uB79C\uC11C',
        '\uD3C9\uC0DD\uAD50\uC721\uBC14\uC6B0\uCC98\uC0AC\uC6A9\uCC98\uC870\uD68C',
        '\uC5D0\uB108\uC9C0\uBC14\uC6B0\uCC98\uC794\uC561\uC870\uD68C',
        '\uC81C\uC8FC \uB80C\uD130\uCE74 \uAC00\uACA9\uBE44\uAD50',
      ].every((keyword) => naturalQuality(measuredQualityRow(keyword))),
    'natural measured search needs were over-filtered');
  const semanticClusterKey = (__liveGoldenRadarTestInternals as any).publicPreviewClusterKey;
  assert('semantic clustering merges rentcar spelling variants and terminal intents',
    typeof semanticClusterKey === 'function'
      && semanticClusterKey('\uC81C\uC8FC \uB80C\uD130\uCE74 \uAC00\uACA9\uBE44\uAD50')
        === semanticClusterKey('\uC81C\uC8FC \uB80C\uD2B8\uCE74 \uC608\uC57D'),
    '제주 렌터카 가격비교 and 제주 렌트카 예약 must share one cluster');
  const semanticBoardId = (__liveGoldenRadarTestInternals as any).goldenBoardSemanticId;
  assert('board identity removes duplicate rentcar spelling and terminal-intent variants',
    typeof semanticBoardId === 'function'
      && semanticBoardId('\uC81C\uC8FC \uB80C\uD130\uCE74 \uAC00\uACA9\uBE44\uAD50')
        === semanticBoardId('\uC81C\uC8FC \uB80C\uD2B8\uCE74 \uC608\uC57D'),
    'duplicate rentcar rows must occupy one board slot');

  const summary: MobileKeywordResult['summary'] | undefined = undefined;
  assert('type smoke remains compatible with mobile keyword result summary', summary === undefined);

  console.log('[mobile-live-golden-radar.test] passed');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
