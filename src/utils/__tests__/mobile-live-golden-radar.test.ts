import { MobileLiveGoldenRadar, __liveGoldenRadarTestInternals } from '../../mobile/live-golden-radar';
import { MobileNotificationInbox } from '../../mobile/notification-inbox';
import type { MobileKeywordResult } from '../../mobile/contracts';
import { markNaverBlogOpenApiQuotaBlocked } from '../naver-blog-api';
import { measureDocumentCount } from '../measure-dc';
import { setPersistent } from '../persistent-keyword-cache';
import * as fs from 'fs';
import * as path from 'path';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

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

function thinProfileCount(items: Array<{ keyword: string }>): number {
  return items.filter((item) => /(프로필|인물정보|약력|나이|인스타)$/.test(item.keyword.replace(/\s+/g, ''))).length;
}

(async () => {
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
  assert('live radar rotates next category', snapshot.nextCategoryId === 'policy');
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
  assert('live radar catch-up uses measured backfill but still runs direct discovery when SSS depth is short',
    backfillCatchupVolumeCalls > 0
      && backfillCatchupDirectCalls === 1
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
  assert('cache-derived broad calculator seeds expand into writer-ready measured probes',
    cacheDerivedCalculatorCandidates.some((keyword) => keyword.includes('\uD504\uB9AC\uB79C\uC11C') && keyword.includes('\uC2E4\uC218\uB839\uC561'))
      && cacheDerivedCalculatorCandidates.some((keyword) => keyword.includes('\uC54C\uBC14') && keyword.includes('\uC790\uB3D9\uACC4\uC0B0'))
      && cacheDerivedCalculatorCandidates.some((keyword) => keyword.includes('\uAC1C\uC778\uC0AC\uC5C5\uC790') && keyword.includes('\uACF5\uC81C\uD56D\uBAA9')),
    cacheDerivedCalculatorCandidates.join('|'));
  const cacheDerivedCommerceCandidates = __liveGoldenRadarTestInternals.buildCacheDerivedCompoundNeedSeeds(
    '\uC704\uB2C9\uC2A4\uCC3D\uBB38\uD615\uC5D0\uC5B4\uCEE8',
    'electronics',
    30,
  );
  assert('cache-derived commerce seeds expand into buyer-decision probes',
    cacheDerivedCommerceCandidates.some((keyword) => keyword.includes('\uCD5C\uC800\uAC00') && keyword.includes('\uBE44\uAD50'))
      && cacheDerivedCommerceCandidates.some((keyword) => keyword.includes('\uD560\uC778') && keyword.includes('\uCFE0\uD3F0'))
      && cacheDerivedCommerceCandidates.some((keyword) => keyword.includes('\uAD6C\uB9E4\uCC98') && keyword.includes('\uCD94\uCC9C'))
      && cacheDerivedCommerceCandidates.some((keyword) => keyword.includes('\uC7A5\uB2E8\uC810')),
    cacheDerivedCommerceCandidates.join('|'));
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
        .filter((keyword) => keyword === '\uC81C\uC8FC \uB80C\uD130\uCE74 \uAC00\uACA9\uBE44\uAD50')
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
      if (keyword !== '\uC81C\uC8FC \uB80C\uD130\uCE74 \uAC00\uACA9\uBE44\uAD50') return null;
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
      && measuredProbeVolumeKeywords.includes('\uC81C\uC8FC \uB80C\uD130\uCE74 \uAC00\uACA9\uBE44\uAD50')
      && measuredProbeDocumentOptions.some((item) => item.keyword === '\uC81C\uC8FC \uB80C\uD130\uCE74 \uAC00\uACA9\uBE44\uAD50')
      && measuredProbeSnapshot.board.some((item) => (
        item.keyword === '\uC81C\uC8FC \uB80C\uD130\uCE74 \uAC00\uACA9\uBE44\uAD50'
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
        .filter((keyword) => keyword === '\uC81C\uC8FC \uB80C\uD130\uCE74 \uAC00\uACA9\uBE44\uAD50')
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
    noisyAutocompleteCalls === 0
      && noisyProbeVolumeKeywords.length >= 48
      && noisyProbeVolumeKeywords.includes('\uC81C\uC8FC \uB80C\uD130\uCE74 \uAC00\uACA9\uBE44\uAD50')
      && noisyProbeVolumeKeywords
        .slice(0, 16)
        .every((keyword) => !noisyAutocompleteSuggestionIds.has(keyword.replace(/\s+/g, '')))
      && noisyProbeSnapshot.board.some((item) => item.keyword === '\uC81C\uC8FC \uB80C\uD130\uCE74 \uAC00\uACA9\uBE44\uAD50'),
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
  assert('policy compound chains are rejected before SearchAd spend',
    !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('청년미래적금 신청 소득기준 계산 서류', 'policy', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('도수치료 관리급여 소득기준 계산 예약', 'policy', lottoGuardNow)
      && __liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('근로장려금 지급일 조회', 'policy', lottoGuardNow),
    JSON.stringify([
      __liveGoldenRadarTestInternals.debugSearchAdMeasurableLiveCandidate('청년미래적금 신청 소득기준 계산 서류', 'policy', lottoGuardNow),
      __liveGoldenRadarTestInternals.debugSearchAdMeasurableLiveCandidate('도수치료 관리급여 소득기준 계산 예약', 'policy', lottoGuardNow),
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
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('1229회 로또 당첨번호 보험 적용 비용', 'life_tips', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('2026 KBO 올스타전 티켓팅 일정', 'sports', lottoGuardNow)
      && !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('2026 KBO 올스타전 티켓팅 일정 렌탈 가격비교', 'sports', lottoGuardNow),
    JSON.stringify([
      __liveGoldenRadarTestInternals.debugSearchAdMeasurableLiveCandidate('2026 광복절 대체공휴일 최저가 구매처', 'policy', lottoGuardNow),
      __liveGoldenRadarTestInternals.debugSearchAdMeasurableLiveCandidate('2026 KBO 올스타전 티켓팅 일정 렌탈 가격비교', 'sports', lottoGuardNow),
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
      && liveIssueMeasuredFallbackSnapshot.board.length >= 3
      && liveIssueMeasuredFallbackSnapshot.board.every((item) => item.source === 'mobile-live-issue-measured-radar')
      && liveIssueMeasuredFallbackSnapshot.board.every((item) => item.isMeasured && (item.totalSearchVolume || 0) > 0 && (item.documentCount || 0) > 0),
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

  const proGapBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-pro-gap-test.json');
  fs.writeFileSync(proGapBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-13T08:50:00.000Z',
    items: [
      ['청년미래적금 가입신청 대상', 'SSS', 99, 32000, 240, 133.3, 'policy'],
      ['소상공인 환급금 조회 방법', 'SSS', 98, 18000, 420, 42.8, 'policy'],
      ['근로장려금 지급일 조회', 'SSS', 97, 12000, 780, 15.3, 'policy'],
      ['여성 청소년 생리용품 바우처 신청', 'SSS', 96, 9000, 640, 14.1, 'policy'],
      ['AI 영상툴 가격비교', 'SS', 95, 6200, 520, 11.9, 'it'],
      ['제주 렌터카 가격비교', 'SS', 94, 4200, 560, 7.5, 'travel_domestic'],
      ['여름휴가 준비물 체크리스트', 'SS', 94, 2400, 420, 5.7, 'travel_domestic'],
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
  assert('pro board ranks monster opportunity keywords first',
    proGapSnapshot.board[0]?.keyword === '청년미래적금 가입신청 대상'
      && proGapSnapshot.board[1]?.keyword === '소상공인 환급금 조회 방법',
    proGapSnapshot.board.map((item) => `${item.rank}:${item.keyword}`).join('|'));
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
      ['무선청소기 가격비교', 'SS', 94, 4200, 620, 6.8, 'electronics'],
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
  assert('free preview shows measured lower winners without leaking the pro head',
    previewLeakSnapshot.publicPreview.length === 5
      && previewLeakSnapshot.publicPreview.every((item) => item.rank > 3)
      && previewLeakSnapshot.publicPreview.every((item) => item.isMeasured && item.searchVolumeSource === 'searchad' && item.documentCountSource === 'naver-api')
      && previewLeakSnapshot.publicPreview.every((item) => !['청년미래적금 신청 대상', '소상공인 환급금 조회 방법', '근로장려금 지급일 조회'].includes(item.keyword)),
    previewLeakSnapshot.publicPreview.map((item) => `${item.rank}:${item.keyword}`).join('|'));
  fs.rmSync(previewLeakBoardFile, { force: true });

  const movingPreviewBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-moving-preview-test.json');
  const movingCategories = ['policy', 'travel_domestic', 'education', 'health', 'electronics', 'it'];
  fs.writeFileSync(movingPreviewBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-13T08:59:00.000Z',
    items: Array.from({ length: 23 }, (_, index) => ({
      keyword: `정책지원금 ${index + 1} 신청 방법`,
      grade: index < 12 ? 'SSS' : 'SS',
      score: 99 - index * 0.1,
      totalSearchVolume: 12000 - index * 180,
      pcSearchVolume: Math.round((12000 - index * 180) * 0.2),
      mobileSearchVolume: (12000 - index * 180) - Math.round((12000 - index * 180) * 0.2),
      documentCount: 500 + index * 70,
      goldenRatio: 180 - index * 6,
      category: movingCategories[index % movingCategories.length],
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
    ['\uC544\uC774\uD3F015 \uCD9C\uC2DC \uAC00\uACA9\uBE44\uAD50', 'SS', 95, 3900, 760, 5.1, 'electronics'],
    ['\uC815\uBD80\uC9C0\uC6D0\uAE08 \uC2E0\uCCAD \uC11C\uB958', 'SS', 95, 3500, 640, 5.5, 'policy'],
    ['AI \uC601\uC0C1\uD234 \uAC00\uACA9\uBE44\uAD50', 'SS', 95, 3400, 560, 6.1, 'it'],
    ['\uC81C\uC8FC \uB80C\uD130\uCE74 \uAC00\uACA9\uBE44\uAD50', 'SS', 94, 3200, 520, 6.1, 'travel_domestic'],
    ['\uB3C4\uC218\uCE58\uB8CC \uBCF4\uD5D8 \uC801\uC6A9 \uBE44\uC6A9', 'SS', 95, 5200, 620, 8.4, 'health'],
    ['\uBB34\uC120\uCCAD\uC18C\uAE30 \uAC00\uACA9\uBE44\uAD50', 'SS', 94, 3600, 600, 6, 'electronics'],
    ['\uC5D0\uC5B4\uCEE8 \uCCAD\uC18C \uBE44\uC6A9 \uBE44\uAD50', 'SS', 94, 3100, 500, 6.2, 'home_life'],
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
  fs.rmSync(broadHeadCapBoardFile, { force: true });

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
    persistentKeywordCacheSnapshot.board.length >= 8
      && persistentKeywordCacheSnapshot.board.every((item) => item.isMeasured && (item.totalSearchVolume || 0) > 0 && (item.documentCount || 0) > 0)
      && new Set(persistentKeywordCacheSnapshot.board.map((item) => item.category)).size >= 6,
    persistentKeywordCacheSnapshot.board.map((item) => `${item.rank}:${item.category}:${item.keyword}:${item.totalSearchVolume}:${item.documentCount}`).join('|'));
  assert('persistent measured keyword cache rejects stale lotto and future exam rows',
    !persistentKeywordCacheSnapshot.board.some((item) => /1227\uD68C|2027\s*6\uBAA8|20276\uBAA8/.test(item.keyword)),
    persistentKeywordCacheSnapshot.board.map((item) => `${item.rank}:${item.keyword}`).join('|'));
  fs.rmSync(persistentKeywordCacheFile, { force: true });

  const splitEnrichmentCacheFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-split-enrichment-test.json');
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
          pcSearchVolume: 3100,
          mobileSearchVolume: 17900,
          documentCount: null,
          competition: 'LOW',
          monthlyAveCpc: 520,
        };
      });
    },
  });
  const splitEnrichmentSnapshot = await splitEnrichmentRadar.runOnce();
  assert('persistent board rows are enriched with real searchad pc mobile split without estimated documents',
    splitEnrichmentCalls > 0
      && splitEnrichmentSnapshot.board.some((item) => (
        item.keyword === '\uCCAD\uB144\uBBF8\uB798\uC801\uAE08 \uAC00\uC785\uC2E0\uCCAD \uB300\uC0C1'
        && item.pcSearchVolume === 4200
        && item.mobileSearchVolume === 21800
        && item.documentCount === 360
        && item.cpc === 740
      ))
      && splitEnrichmentSnapshot.board.some((item) => (
        item.keyword === '\uC81C\uC8FC \uB80C\uD130\uCE74 \uAC00\uACA9\uBE44\uAD50'
        && item.pcSearchVolume === 3100
        && item.mobileSearchVolume === 17900
        && item.documentCount === 850
        && item.cpc === 520
      )),
    splitEnrichmentSnapshot.board.map((item) => `${item.keyword}:${item.pcSearchVolume}:${item.mobileSearchVolume}:${item.documentCount}:${item.cpc}`).join('|'));
  fs.rmSync(splitEnrichmentCacheFile, { force: true });

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
        .filter((keyword) => keyword === '\uC8FC\uD734\uC218\uB2F9\uACC4\uC0B0\uAE30' || keyword === '\uADFC\uBB34\uC2DC\uAC04\uACC4\uC0B0\uAE30')
        .map((keyword) => keyword === '\uC8FC\uD734\uC218\uB2F9\uACC4\uC0B0\uAE30'
          ? {
            keyword,
            pcSearchVolume: 16500,
            mobileSearchVolume: 71100,
            documentCount: null,
            competition: 'LOW',
            monthlyAveCpc: 180,
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
  assert('persistent measured cache rows without provenance are promoted after SearchAd pc/mobile split',
    cachePromotionSplitCalls > 0
      && cachePromotionSnapshot.board.some((item) => (
        item.keyword === '\uC8FC\uD734\uC218\uB2F9\uACC4\uC0B0\uAE30'
        && item.pcSearchVolume === 16500
        && item.mobileSearchVolume === 71100
        && item.totalSearchVolume === 87600
        && item.documentCount === 12230
        && item.searchVolumeSource === 'searchad'
        && item.searchVolumeConfidence === 'high'
        && item.documentCountSource === 'cache'
        && item.documentCountConfidence === 'medium'
        && item.aiJudge?.verdict === 'publish'
      ))
      && cachePromotionSnapshot.publicPreview.some((item) => item.keyword === '\uC8FC\uD734\uC218\uB2F9\uACC4\uC0B0\uAE30')
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
  fs.rmSync(cachePromotionFile, { force: true });

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

  const summary: MobileKeywordResult['summary'] | undefined = undefined;
  assert('type smoke remains compatible with mobile keyword result summary', summary === undefined);

  console.log('[mobile-live-golden-radar.test] passed');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
