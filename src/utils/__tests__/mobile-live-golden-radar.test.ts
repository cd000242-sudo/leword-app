import { MobileLiveGoldenRadar } from '../../mobile/live-golden-radar';
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
      && floodSnapshot.board.some((item) => item.keyword === '2027 6모 등급컷')
      && floodSnapshot.board.some((item) => item.keyword === '청년 지원금 신청'),
    floodSnapshot.board.map((item) => `${item.rank}:${item.keyword}`).join('|'));
  assert('public live golden preview exposes no thin profile intent',
    thinProfileCount(floodSnapshot.publicPreview) === 0,
    floodSnapshot.publicPreview.map((item) => item.keyword).join('|'));

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
      && capturedLiveSeeds.includes('서건창 끝내기 안타')
      && capturedLiveSeeds.every((seed) => seed.length <= 34 && !/[·\[\]]/.test(seed) && !seed.includes('기자')),
    capturedLiveSeeds.join('|'));

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

  const summary: MobileKeywordResult['summary'] | undefined = undefined;
  assert('type smoke remains compatible with mobile keyword result summary', summary === undefined);

  console.log('[mobile-live-golden-radar.test] passed');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
