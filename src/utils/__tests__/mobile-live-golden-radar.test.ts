import { MobileLiveGoldenRadar } from '../../mobile/live-golden-radar';
import { MobileNotificationInbox } from '../../mobile/notification-inbox';
import type { MobileKeywordResult } from '../../mobile/contracts';

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
