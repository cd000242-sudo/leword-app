import { MobileLiveGoldenRadar, __liveGoldenRadarTestInternals } from '../../mobile/live-golden-radar';
import { MobileNotificationInbox } from '../../mobile/notification-inbox';
import type { MobileKeywordResult } from '../../mobile/contracts';
import * as fs from 'fs';
import * as path from 'path';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

function result(keyword: string, index: number): any {
  return {
    keyword,
    grade: index === 0 ? 'SSS' : index % 2 === 0 ? 'SS' : 'S',
    score: index === 0 ? 91 : 76,
    searchVolume: 2200 + index * 100,
    documentCount: 120 + index * 10,
    goldenRatio: 12 + index,
    cpc: 80,
    categoryMatched: true,
    intent: 'live-golden',
    goldenReason: 'measured live fixture',
    externalSources: ['test-fixture'],
  };
}

function floodResult(keyword: string, index: number, profile = false): any {
  return {
    keyword,
    grade: 'SSS',
    score: (profile ? 96 : 88) - index * 0.1,
    searchVolume: 3200 + index * 80,
    documentCount: 180 + index * 5,
    goldenRatio: 18 - index * 0.05,
    cpc: 90,
    categoryMatched: true,
    intent: 'live-golden',
    goldenReason: 'measured live profile flood fixture',
    externalSources: ['test-fixture'],
  };
}

function thinProfileCount(items: Array<{ keyword: string }>): number {
  return items.filter((item) => /(프로필|인물정보|약력|나이|인스타)$/.test(item.keyword.replace(/\s+/g, ''))).length;
}

(async () => {
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
  assert('live radar catch-up fills board target across multiple cycles',
    catchupDiscoverCalls === 4
      && catchupSnapshot.successfulRuns === 4
      && catchupSnapshot.boardCount === 10,
    JSON.stringify({
      calls: catchupDiscoverCalls,
      successfulRuns: catchupSnapshot.successfulRuns,
      boardCount: catchupSnapshot.boardCount,
      keywords: catchupSnapshot.board.map((item) => item.keyword),
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
  assert('live golden board rejects thin profile intent instead of flooding the top board',
    thinProfileCount(floodSnapshot.board.slice(0, 30)) === 0
      && !floodSnapshot.board.some((item) => item.keyword === '2027 6모 등급컷')
      && !floodSnapshot.board.some((item) => item.keyword === '1227회 로또 당첨번호')
      && floodSnapshot.board.some((item) => item.keyword === '1228회 로또 당첨번호')
      && floodSnapshot.board.some((item) => item.keyword === '청년 지원금 신청'),
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
  assert('stored live golden board purges name plus thin profile variants',
    profileAliasSnapshot.board.every((item) => !/(프로필|인물정보|약력|나이|학력|고향|인스타)/.test(item.keyword))
      && profileAliasSnapshot.board.some((item) => item.keyword === '2026 흠뻑쇼 일정')
      && profileAliasSnapshot.publicPreview.every((item) => !/(프로필|인물정보|약력|나이|학력|고향|인스타)/.test(item.keyword)),
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
    capturedLiveSeeds.includes('이재명 멜로니 악수')
      && capturedLiveSeeds.includes('멋진 신세계')
      && capturedLiveSeeds.includes('서건창 끝내기 안타')
      && capturedLiveSeeds.every((seed) => seed.length <= 34 && !/[·\[\]]/.test(seed) && !seed.includes('기자') && !seed.includes('빠진다')),
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
  assert('live radar sends entity/actionable seeds instead of raw news sentences',
    capturedHeadlineSeeds.includes('\uBC29\uD0C4\uC18C\uB144\uB2E8')
      && capturedHeadlineSeeds.includes('\uBCF4\uC774\uB125\uC2A4\uD2B8\uB3C4\uC5B4')
      && capturedHeadlineSeeds.includes('2026 KBO \uC62C\uC2A4\uD0C0\uC804 \uC608\uB9E4')
      && !capturedHeadlineSeeds.some((seed) => /\uC9C0\uC5F0|\uC0AC\uACFC|\uBC00\uB9AC\uC5B8\uC140\uB9C1|\uBC15\uC218|\uC120\uC218\uB4E4|\.\.|!!!/.test(seed)),
    capturedHeadlineSeeds.join('|'));

  const liveIssueBackfillCandidates = __liveGoldenRadarTestInternals.buildBackfillCandidates('all', [
    'KIA 3연패 탈출! [up]',
    '1228회 로또 1등 당첨 11명 [new]',
    '파키스탄 총리 24시간 내 합의 예상 [new]',
  ], 80);
  assert('live issue backfill uses issue-specific intents instead of shopping tails',
    liveIssueBackfillCandidates.some((keyword) => keyword.includes('KIA 3연패 탈출') && /중계|경기일정|라인업|하이라이트/.test(keyword))
      && liveIssueBackfillCandidates.some((keyword) => keyword.includes('1228회 로또') && /당첨번호|당첨지역|실수령액|판매점/.test(keyword))
      && liveIssueBackfillCandidates.some((keyword) => keyword.includes('파키스탄 총리') && /정리|현재 상황|전망|소식/.test(keyword))
      && !liveIssueBackfillCandidates.some((keyword) => /KIA 3연패 탈출.*(추천|가격|비교|후기)/.test(keyword)),
    liveIssueBackfillCandidates.slice(0, 30).join('|'));
  const dateAwareCandidates = __liveGoldenRadarTestInternals.buildBackfillCandidates('all', [
    '로또',
    '1227회 로또 당첨번호',
    '2027 6모 등급컷',
    '장마 준비물',
  ], 120, lottoGuardNow);
  const dateHints = __liveGoldenRadarTestInternals.getLiveDateHints(lottoGuardNow);
  assert('live candidate inference follows date-aware collect-measure-rank flow',
    dateHints.includes('6월 14일')
      && dateAwareCandidates.some((keyword) => keyword === '1228회 로또 당첨번호')
      && dateAwareCandidates.some((keyword) => /장마 준비물/.test(keyword) && /오늘|이번주|6월/.test(keyword))
      && !dateAwareCandidates.some((keyword) => /1227회|2027 6모|등급컷|답지/.test(keyword)),
    dateAwareCandidates.slice(0, 40).join('|'));

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
  assert('live radar accepts measured issue intent keywords after cleanup',
    capturedIssueSeeds.includes('KIA 3연패 탈출')
      && capturedIssueSeeds.includes('1228회 로또 1등 당첨 11명')
      && capturedIssueSeeds.includes('파키스탄 총리 24시간 내 합의 예상')
      && capturedIssueSeeds.every((seed) => !/[!\[\]]/.test(seed))
      && liveIssueSnapshot.board.some((item) => item.keyword === 'KIA 3연패 탈출 정리' && item.category === 'sports')
      && liveIssueSnapshot.board.some((item) => item.keyword === '1228회 로또 당첨번호' && item.category === 'life_tips')
      && liveIssueSnapshot.board.some((item) => item.keyword === '파키스탄 총리 합의 정리'),
    `${capturedIssueSeeds.join('|')} :: ${liveIssueSnapshot.board.map((item) => `${item.keyword}:${item.category}`).join('|')}`);

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
      'KIA 3\uC5F0\uD328 \uD0C8\uCD9C! [up]',
      '1228\uD68C \uB85C\uB610 1\uB4F1 \uB2F9\uCCA8 11\uBA85 [new]',
      '\uD30C\uD0A4\uC2A4\uD0C4 \uCD1D\uB9AC 24\uC2DC\uAC04 \uB0B4 \uD569\uC758 \uC608\uC0C1 [new]',
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
    fallbackMeasureCalls > 0
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
      'KIA 3\uC5F0\uD328 \uD0C8\uCD9C! [up]',
      '1228\uD68C \uB85C\uB610 1\uB4F1 \uB2F9\uCCA8 11\uBA85 [new]',
      '\uD30C\uD0A4\uC2A4\uD0C4 \uCD1D\uB9AC 24\uC2DC\uAC04 \uB0B4 \uD569\uC758 \uC608\uC0C1 [new]',
    ],
    enableBackfill: false,
    discover: async () => [],
    measureLiveSearchVolumeSeparate: async () => {
      measuredFallbackVolumeCalls += 1;
      return [
        {
          keyword: 'KIA 3\uC5F0\uD328 \uD0C8\uCD9C \uC815\uB9AC',
          pcSearchVolume: 2400,
          mobileSearchVolume: 8600,
          documentCount: 420,
          competition: 'LOW',
          monthlyAveCpc: 120,
        },
        {
          keyword: '1228\uD68C \uB85C\uB610 \uB2F9\uCCA8\uBC88\uD638',
          pcSearchVolume: 11000,
          mobileSearchVolume: 27000,
          documentCount: 820,
          competition: 'LOW',
          monthlyAveCpc: 90,
        },
        {
          keyword: '\uD30C\uD0A4\uC2A4\uD0C4 \uCD1D\uB9AC \uD569\uC758 \uC815\uB9AC',
          pcSearchVolume: 1800,
          mobileSearchVolume: 5200,
          documentCount: 360,
          competition: 'LOW',
          monthlyAveCpc: 150,
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
      item.keyword === 'KIA 3\uC5F0\uD328 \uD0C8\uCD9C \uC815\uB9AC'
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
        keyword: '올트먼 방한 연기',
        grade: 'SS',
        score: 82,
        totalSearchVolume: 1800,
        documentCount: 600,
        goldenRatio: 3,
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
  assert('public preview hides stale repeated keywords and prefers fresh issues',
    staleSnapshot.publicPreview.length === 1
      && staleSnapshot.publicPreview[0]?.keyword === '올트먼 방한 연기',
    staleSnapshot.publicPreview.map((item) => `${item.keyword}:${item.updatedAt}`).join('|'));
  fs.rmSync(staleBoardFile, { force: true });

  const proGapBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-pro-gap-test.json');
  fs.writeFileSync(proGapBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-13T08:50:00.000Z',
    items: [
      ['청년미래적금 가입신청 대상', 'SSS', 96, 32000, 240, 133.3, 'policy'],
      ['소상공인 환급금 조회 방법', 'SSS', 93, 18000, 420, 42.8, 'policy'],
      ['근로장려금 지급일 조회', 'SS', 88, 12000, 780, 15.3, 'policy'],
      ['KBO 올스타전 예매 일정', 'SS', 82, 8200, 1200, 6.8, 'sports'],
      ['나혼자산다 출연진', 'S', 75, 4200, 950, 4.4, 'broadcast'],
      ['여름휴가 준비물 체크리스트', 'S', 72, 2400, 820, 2.9, 'travel_domestic'],
      ['드라마 다시보기 방법', 'S', 70, 1200, 520, 2.3, 'drama'],
      ['프로야구 예매', 'S', 68, 900, 360, 2.5, 'sports'],
    ].map(([keyword, grade, score, totalSearchVolume, documentCount, goldenRatio, category]) => ({
      keyword,
      grade,
      score,
      totalSearchVolume,
      documentCount,
      goldenRatio,
      category,
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
      ['청년미래적금 신청 대상', 'SSS', 98, 42000, 300, 140, 'policy'],
      ['소상공인 환급금 조회 방법', 'SSS', 96, 36000, 420, 85, 'policy'],
      ['프로야구 올스타전 예매 일정', 'SS', 91, 28000, 700, 40, 'sports'],
      ['지역 축제 주차 위치', 'S', 74, 5400, 50000, 1.4, 'life'],
      ['여름 휴가 준비물 체크리스트', 'S', 73, 5200, 52000, 1.3, 'life'],
      ['드라마 다시보기 방법', 'S', 72, 5000, 54000, 1.2, 'drama'],
      ['KBO 중계 일정', 'S', 71, 4800, 56000, 1.1, 'sports'],
      ['공휴일 병원 진료 조회', 'S', 70, 4600, 58000, 1.0, 'life'],
      ['자격증 접수 마감일', 'S', 69, 4400, 60000, 0.9, 'education'],
      ['신제품 출시 가격 비교', 'S', 68, 4200, 62000, 0.8, 'electronics'],
    ].map(([keyword, grade, score, totalSearchVolume, documentCount, goldenRatio, category], index) => ({
      keyword,
      grade,
      score,
      totalSearchVolume,
      documentCount,
      goldenRatio,
      category,
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
  assert('free preview fills lower warm slots without leaking pro head when strict public candidates are scarce',
    previewLeakSnapshot.publicPreview.length === 5
      && previewLeakSnapshot.publicPreview.every((item) => item.rank > 3)
      && previewLeakSnapshot.publicPreview.every((item) => !['청년미래적금 신청 대상', '소상공인 환급금 조회 방법', '프로야구 올스타전 예매 일정'].includes(item.keyword)),
    previewLeakSnapshot.publicPreview.map((item) => `${item.rank}:${item.keyword}`).join('|'));
  fs.rmSync(previewLeakBoardFile, { force: true });

  const movingPreviewBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-moving-preview-test.json');
  const movingCategories = ['policy', 'sports', 'education', 'drama', 'life_tips', 'it'];
  fs.writeFileSync(movingPreviewBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-13T08:59:00.000Z',
    items: Array.from({ length: 23 }, (_, index) => ({
      keyword: `무료공개 ${index + 1} 신청 방법`,
      grade: index < 12 ? 'SSS' : 'SS',
      score: 99 - index,
      totalSearchVolume: 90000 - index * 1200,
      documentCount: 500 + index * 70,
      goldenRatio: 180 - index * 6,
      category: movingCategories[index % movingCategories.length],
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
    ['KBO 올스타전 예매 일정', 'SS', 88, 9000, 700, 12, 'sports'],
    ['프로야구 중계 일정', 'SS', 87, 8600, 760, 11, 'sports'],
    ['야구 경기 하이라이트', 'S', 74, 4600, 900, 5, 'sports'],
    ['수능 접수 준비물 체크리스트', 'SS', 86, 8200, 720, 11, 'education'],
    ['수능 접수 마감 일정', 'SS', 85, 7800, 740, 10, 'education'],
    ['한국사 시험 접수 일정', 'S', 73, 4200, 840, 5, 'education'],
    ['하트시그널 몇부작', 'SS', 84, 7200, 800, 9, 'drama'],
    ['드라마 결말 다시보기', 'S', 72, 3900, 820, 4.7, 'drama'],
    ['쿠키영상 결말 해석', 'S', 71, 3600, 780, 4.6, 'movie'],
    ['콘서트 예매 일정', 'S', 70, 3300, 760, 4.3, 'music'],
  ];
  fs.writeFileSync(categoryDiversityBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-13T08:58:00.000Z',
    items: categoryDiversityRows.map(([keyword, grade, score, totalSearchVolume, documentCount, goldenRatio, category]) => ({
      keyword,
      grade,
      score,
      totalSearchVolume,
      documentCount,
      goldenRatio,
      category,
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
    categoryDiversitySnapshot.board.length === 12
      && policyCount <= 3
      && uniqueCategories.size >= 5,
    categoryDiversitySnapshot.board.map((item) => `${item.rank}:${item.category}:${item.keyword}`).join('|'));
  fs.rmSync(categoryDiversityBoardFile, { force: true });

  const semanticClusterBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-semantic-cluster-test.json');
  const heartSignalRoot = '\uD558\uD2B8\uC2DC\uADF8\uB110';
  const heartSignalBase = `${heartSignalRoot}5`;
  const semanticClusterRows = [
    [`${heartSignalBase} \uCD9C\uC5F0\uC9C4`, 'SSS', 99, 42000, 400, 105, 'drama'],
    [`${heartSignalBase} \uBA87\uBD80\uC791`, 'SSS', 98, 39000, 420, 92, 'drama'],
    [`\uD558\uD2B8 \uC2DC\uADF8\uB110 5 \uBA87\uBD80\uC791`, 'SSS', 98, 39000, 421, 92, 'drama'],
    [`${heartSignalBase} \uB2E4\uC2DC\uBCF4\uAE30`, 'SSS', 97, 36000, 430, 83, 'drama'],
    [`${heartSignalBase} \uACB0\uB9D0`, 'SSS', 96, 33000, 440, 75, 'drama'],
    [`${heartSignalBase} \uC6D0\uC791`, 'SSS', 95, 30000, 450, 66, 'drama'],
    [`${heartSignalRoot} \uBA87\uBD80\uC791`, 'SSS', 94, 28000, 460, 60, 'drama'],
    ['\uCCAD\uB144\uBBF8\uB798\uC801\uAE08 \uAC00\uC785\uC2E0\uCCAD \uB300\uC0C1', 'SSS', 92, 26000, 360, 72, 'policy'],
    ['KBO \uC62C\uC2A4\uD0C0\uC804 \uC608\uB9E4 \uC77C\uC815', 'SS', 88, 15000, 900, 16, 'sports'],
    ['\uC7A5\uB9C8 \uC900\uBE44\uBB3C \uCCB4\uD06C\uB9AC\uC2A4\uD2B8', 'SS', 86, 12000, 700, 17, 'life_tips'],
    ['\uADFC\uB85C\uC7A5\uB824\uAE08 \uC9C0\uAE09\uC77C \uC870\uD68C', 'SS', 85, 9000, 650, 13, 'policy'],
    ['\uD504\uB85C\uC57C\uAD6C \uC911\uACC4 \uC77C\uC815', 'S', 74, 5500, 1000, 5.5, 'sports'],
    ['\uC18C\uC0C1\uACF5\uC778 \uD658\uAE09\uAE08 \uC870\uD68C \uBC29\uBC95', 'S', 73, 4800, 820, 5.8, 'policy'],
    ['\uCF58\uC11C\uD2B8 \uC608\uB9E4 \uC77C\uC815', 'S', 72, 4200, 780, 5.3, 'music'],
    ['\uC544\uC774\uD3F015 \uCD9C\uC2DC \uAC00\uACA9\uBE44\uAD50', 'S', 71, 3900, 760, 5.1, 'electronics'],
    ['\uC815\uBD80\uC9C0\uC6D0\uAE08 \uC2E0\uCCAD \uC11C\uB958', 'S', 70, 3500, 740, 4.7, 'policy'],
  ];
  fs.writeFileSync(semanticClusterBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-13T08:59:00.000Z',
    items: semanticClusterRows.map(([keyword, grade, score, totalSearchVolume, documentCount, goldenRatio, category]) => ({
      keyword,
      grade,
      score,
      totalSearchVolume,
      documentCount,
      goldenRatio,
      category,
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
  const heartSignalCount = semanticClusterCompactKeywords.filter((keyword) => keyword.includes(heartSignalRoot)).length;
  const heartSignalFewPartCount = semanticClusterCompactKeywords.filter((keyword) => keyword === `${heartSignalBase}\uBA87\uBD80\uC791`).length;
  assert('pro live golden board caps same-issue suffix variants by semantic cluster',
    semanticClusterSnapshot.board.length === 10 && heartSignalCount <= 2 && heartSignalFewPartCount <= 1,
    semanticClusterSnapshot.board.map((item) => `${item.rank}:${item.keyword}`).join('|'));
  assert('public live golden preview still fills the promised five lower slots after semantic clustering',
    semanticClusterSnapshot.publicPreview.length === 5,
    semanticClusterSnapshot.publicPreview.map((item) => `${item.rank}:${item.keyword}`).join('|'));
  fs.rmSync(semanticClusterBoardFile, { force: true });

  const measuredOnlyBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-measured-only-test.json');
  const measuredOnlyRows = [
    ['\uCCAD\uB144\uBBF8\uB798\uC801\uAE08 \uAC00\uC785\uC2E0\uCCAD \uB300\uC0C1', 'SSS', 94, 26000, 360, 72, 'policy', true],
    ['KBO \uC62C\uC2A4\uD0C0\uC804 \uC608\uB9E4 \uC77C\uC815', 'SS', 88, 15000, 900, 16, 'sports', true],
    ['\uC7A5\uB9C8 \uC900\uBE44\uBB3C \uCCB4\uD06C\uB9AC\uC2A4\uD2B8', 'SS', 86, 12000, 700, 17, 'life_tips', true],
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
      documentCount,
      goldenRatio,
      category,
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
    ['\uD0DC\uC591\uC758\uACC4\uC8082 \uBA87\uBD80\uC791', 'SSS', 98, 39000, 420, 92, 'drama'],
    ['\uD478\uB978\uBC24 \uBA87\uBD80\uC791', 'SSS', 97, 36000, 430, 83, 'drama'],
    ['\uD55C\uAC15\uB85C\uB9E8\uC2A4 \uBA87\uBD80\uC791', 'SSS', 96, 33000, 440, 75, 'drama'],
    ['\uC0C8\uBCBD\uC758\uC57D\uC18D \uCD9C\uC5F0\uC9C4', 'SSS', 95, 30000, 450, 66, 'drama'],
    ['\uB2EC\uBE5B\uC815\uC6D0 \uBC29\uC1A1\uC2DC\uAC04', 'SSS', 94, 28000, 460, 60, 'drama'],
    ['\uC624\uB298\uC758\uC6B4\uBA85 \uB2E4\uC2DC\uBCF4\uAE30', 'SSS', 93, 26000, 470, 55, 'drama'],
    ['\uC6D0\uB354\uC2A4\uD14C\uC774\uC9C0 \uACF5\uC2DD\uC601\uC0C1', 'SSS', 92, 25000, 480, 52, 'entertainment'],
    ['\uCCAD\uB144\uBBF8\uB798\uC801\uAE08 \uAC00\uC785\uC2E0\uCCAD \uB300\uC0C1', 'SS', 91, 24000, 360, 66, 'policy'],
    ['KBO \uC62C\uC2A4\uD0C0\uC804 \uC608\uB9E4 \uC77C\uC815', 'SS', 90, 23000, 900, 25, 'sports'],
    ['\uC7A5\uB9C8 \uC900\uBE44\uBB3C \uCCB4\uD06C\uB9AC\uC2A4\uD2B8', 'SS', 89, 22000, 700, 31, 'life_tips'],
    ['\uC81C\uC8FC \uB80C\uD130\uCE74 \uAC00\uACA9\uBE44\uAD50', 'SS', 88, 21000, 850, 24, 'travel_domestic'],
    ['AI \uC601\uC0C1\uD234 \uCD94\uCC9C', 'SS', 87, 20000, 760, 26, 'it'],
    ['\uC5EC\uB984 \uC120\uD06C\uB9BC \uCD94\uCC9C', 'SS', 86, 19000, 680, 27, 'beauty'],
    ['\uCD08\uBCF5 \uC0BC\uACC4\uD0D5 \uC608\uC57D \uCD94\uCC9C', 'SS', 85, 18000, 740, 24, 'food'],
    ['\uCF58\uC11C\uD2B8 \uC608\uB9E4 \uC77C\uC815', 'S', 84, 17500, 640, 27, 'music'],
    ['\uC218\uC871\uAD6C \uACA9\uB9AC\uAE30\uAC04 \uD655\uC778', 'S', 84, 17000, 620, 27, 'health'],
    ['\uBB34\uC120\uCCAD\uC18C\uAE30 \uAC00\uACA9\uBE44\uAD50', 'S', 83, 16000, 590, 27, 'electronics'],
  ];
  fs.writeFileSync(contentDiversityBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-13T09:03:00.000Z',
    items: contentDiversityRows.map(([keyword, grade, score, totalSearchVolume, documentCount, goldenRatio, category]) => ({
      keyword,
      grade,
      score,
      totalSearchVolume,
      documentCount,
      goldenRatio,
      category,
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
    contentDiversitySnapshot.board.length === 12
      && episodeLookupCount <= 2
      && contentLookupCount <= 3
      && contentDiversityCategories.size >= 7
      && contentDiversitySnapshot.board.every((item) => item.isMeasured && (item.totalSearchVolume || 0) > 0 && (item.documentCount || 0) > 0),
    contentDiversitySnapshot.board.map((item) => `${item.rank}:${item.category}:${item.keyword}`).join('|'));
  fs.rmSync(contentDiversityBoardFile, { force: true });

  const actionableGradeGateBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-actionable-grade-gate-test.json');
  const actionableGradeRows = [
    ['멋진신세계몇부작', 'SSS', 99, 189300, 766, 247.13, 'drama'],
    ['참교육몇부작', 'SSS', 98, 57880, 798, 72.53, 'drama'],
    ['신입사원강회장출연진', 'SSS', 97, 20030, 456, 43.93, 'drama'],
    ['KBO올스타전하이라이트', 'SSS', 96, 19440, 177, 109.83, 'sports'],
    ['청년미래적금 가입신청 대상', 'SSS', 95, 26000, 360, 72, 'policy'],
    ['송지호바다하늘길입장료', 'SSS', 94, 9500, 115, 82.6, 'travel_domestic'],
    ['제주 렌터카 가격비교', 'SSS', 93, 21000, 850, 24, 'travel_domestic'],
    ['육아휴직급여 지급일', 'SSS', 92, 12000, 620, 19.35, 'policy'],
  ];
  fs.writeFileSync(actionableGradeGateBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-15T08:00:00.000Z',
    items: actionableGradeRows.map(([keyword, grade, score, totalSearchVolume, documentCount, goldenRatio, category]) => ({
      keyword,
      grade,
      score,
      totalSearchVolume,
      documentCount,
      goldenRatio,
      category,
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
  assert('cached live board caps pure content lookup issue rows below SSS',
    gradeByKeyword.get('멋진신세계몇부작') !== 'SSS'
      && gradeByKeyword.get('참교육몇부작') !== 'SSS'
      && gradeByKeyword.get('신입사원강회장출연진') !== 'SSS'
      && gradeByKeyword.get('KBO올스타전하이라이트') !== 'SSS'
      && gradeByKeyword.get('청년미래적금 가입신청 대상') === 'SSS'
      && gradeByKeyword.get('송지호바다하늘길입장료') === 'SSS',
    actionableGradeGateSnapshot.board.map((item) => `${item.keyword}:${item.grade}`).join('|'));
  fs.rmSync(actionableGradeGateBoardFile, { force: true });

  const adsenseReadinessBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-adsense-readiness-test.json');
  fs.writeFileSync(adsenseReadinessBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-15T08:00:00.000Z',
    items: [
      ['1228\uD68C\uB85C\uB610\uB2F9\uCCA8\uBC88\uD638', 'SSS', 99, 22740, 268, 84.85, 'life_tips'],
      ['\uBA4B\uC9C4\uC2E0\uC138\uACC4\uBA87\uBD80\uC791', 'SSS', 99, 189300, 766, 247.13, 'drama'],
      ['2026KBO\uC62C\uC2A4\uD0C0\uC804\uD558\uC774\uB77C\uC774\uD2B8', 'SSS', 96, 19440, 177, 109.83, 'sports'],
      ['\uC2E0\uC785\uC0AC\uC6D0\uAC15\uD68C\uC7A5\uCD9C\uC5F0\uC9C4', 'SSS', 97, 20030, 456, 43.93, 'drama'],
      ['\uCCAD\uB144\uBBF8\uB798\uC801\uAE08 \uAC00\uC785\uC2E0\uCCAD \uB300\uC0C1', 'SSS', 95, 26000, 360, 72, 'policy'],
      ['\uC1A1\uC9C0\uD638\uBC14\uB2E4\uD558\uB298\uAE38\uC785\uC7A5\uB8CC', 'SSS', 94, 9500, 115, 82.6, 'travel_domestic'],
      ['\uC81C\uC8FC \uB80C\uD130\uCE74 \uAC00\uACA9\uBE44\uAD50', 'SSS', 93, 21000, 850, 24, 'travel_domestic'],
      ['\uC721\uC544\uD734\uC9C1\uAE09\uC5EC \uC9C0\uAE09\uC77C', 'SSS', 92, 12000, 620, 19.35, 'policy'],
      ['\uBB34\uC120\uCCAD\uC18C\uAE30 \uAC00\uACA9\uBE44\uAD50', 'SSS', 91, 16000, 590, 27.12, 'electronics'],
    ].map(([keyword, grade, score, totalSearchVolume, documentCount, goldenRatio, category]) => ({
      keyword,
      grade,
      score,
      totalSearchVolume,
      documentCount,
      goldenRatio,
      category,
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
  const adsenseGradeByKeyword = new Map(adsenseReadinessSnapshot.board.map((item) => [item.keyword, item.grade]));
  assert('live golden board ranks adsense-ready need keywords over one-shot lookup traffic',
    adsenseTopKeywords.includes('\uCCAD\uB144\uBBF8\uB798\uC801\uAE08 \uAC00\uC785\uC2E0\uCCAD \uB300\uC0C1')
      && adsenseTopKeywords.includes('\uC1A1\uC9C0\uD638\uBC14\uB2E4\uD558\uB298\uAE38\uC785\uC7A5\uB8CC')
      && adsenseTopKeywords.includes('\uC81C\uC8FC \uB80C\uD130\uCE74 \uAC00\uACA9\uBE44\uAD50')
      && adsenseTopKeywords.includes('\uBB34\uC120\uCCAD\uC18C\uAE30 \uAC00\uACA9\uBE44\uAD50')
      && !adsenseTopKeywords.some((keyword) => /\uB85C\uB610|\uBA87\uBD80\uC791|\uD558\uC774\uB77C\uC774\uD2B8|\uCD9C\uC5F0\uC9C4/.test(keyword)),
    adsenseReadinessSnapshot.board.map((item) => `${item.rank}:${item.keyword}:${item.grade}`).join('|'));
  assert('lookup-heavy live board rows cannot keep SSS badges just because ratio is high',
    adsenseGradeByKeyword.get('1228\uD68C\uB85C\uB610\uB2F9\uCCA8\uBC88\uD638') !== 'SSS'
      && adsenseGradeByKeyword.get('\uBA4B\uC9C4\uC2E0\uC138\uACC4\uBA87\uBD80\uC791') !== 'SSS'
      && adsenseGradeByKeyword.get('2026KBO\uC62C\uC2A4\uD0C0\uC804\uD558\uC774\uB77C\uC774\uD2B8') !== 'SSS',
    adsenseReadinessSnapshot.board.map((item) => `${item.keyword}:${item.grade}`).join('|'));
  fs.rmSync(adsenseReadinessBoardFile, { force: true });

  const persistentKeywordCacheFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-persistent-keyword-cache-test.json');
  fs.writeFileSync(persistentKeywordCacheFile, JSON.stringify({
    __schemaVersion: 'test-cache',
    '\uCCAD\uB144\uBBF8\uB798\uC801\uAE08 \uAC00\uC785\uC2E0\uCCAD \uB300\uC0C1': {
      searchVolume: 26000,
      documentCount: 360,
      category: 'policy',
    },
    'KBO \uC62C\uC2A4\uD0C0\uC804 \uC608\uB9E4 \uC77C\uC815': {
      searchVolume: 15000,
      documentCount: 900,
      category: 'sports',
    },
    '\uC7A5\uB9C8 \uC900\uBE44\uBB3C \uCCB4\uD06C\uB9AC\uC2A4\uD2B8': {
      searchVolume: 12000,
      documentCount: 700,
      category: 'life_tips',
    },
    '\uC81C\uC8FC \uB80C\uD130\uCE74 \uAC00\uACA9\uBE44\uAD50': {
      searchVolume: 21000,
      documentCount: 850,
      category: 'travel_domestic',
    },
    '\uBB34\uC120\uCCAD\uC18C\uAE30 \uAC00\uACA9\uBE44\uAD50': {
      searchVolume: 16000,
      documentCount: 590,
      category: 'electronics',
    },
    '\uC5EC\uB984 \uC120\uD06C\uB9BC \uCD94\uCC9C': {
      searchVolume: 19000,
      documentCount: 680,
      category: 'beauty',
    },
    '\uCD08\uBCF5 \uC0BC\uACC4\uD0D5 \uC608\uC57D \uCD94\uCC9C': {
      searchVolume: 18000,
      documentCount: 740,
      category: 'food',
    },
    '\uCF58\uC11C\uD2B8 \uC608\uB9E4 \uC77C\uC815': {
      searchVolume: 17500,
      documentCount: 640,
      category: 'music',
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
    persistentKeywordCacheSnapshot.board.length === 8
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
    },
    '\uC81C\uC8FC \uB80C\uD130\uCE74 \uAC00\uACA9\uBE44\uAD50': {
      searchVolume: 21000,
      documentCount: 850,
      category: 'travel_domestic',
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
      return Array.from({ length: 5 }, (_, index) => result(`서버 보강 ${offset + index + 1} 신청 방법`, index));
    },
  });
  schedulerCatchupRadar.start();
  catchupTick?.();
  await new Promise((resolve) => setTimeout(resolve, 25));
  const schedulerCatchupSnapshot = schedulerCatchupRadar.snapshot();
  schedulerCatchupRadar.stop();
  assert('live radar scheduler catches up while board is below target',
    schedulerCatchupDiscoverCalls >= 2
      && schedulerCatchupSnapshot.boardCount === 10
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
