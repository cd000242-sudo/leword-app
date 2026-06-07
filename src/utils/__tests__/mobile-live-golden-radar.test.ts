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

  let skippedDiscoverCalls = 0;
  const skippedRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    shouldRun: () => ({ ok: false, message: 'manual queue busy' }),
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
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
