import { MobileNotificationInbox } from '../../../src/mobile/notification-inbox';
import { createMobileLiveGoldenRadarFromEnv } from '../../../src/mobile/live-golden-radar';

const LOG_INTERVAL_MS = 60_000;

function main(): void {
  const notificationInbox = new MobileNotificationInbox();
  const radar = createMobileLiveGoldenRadarFromEnv(notificationInbox, () => ({ ok: true }));
  if (!radar) {
    console.error('[LIVE-GOLDEN-WORKER] disabled: set LEWORD_MOBILE_LIVE_GOLDEN_ENABLED=true');
    process.exit(1);
  }

  const started = radar.start();
  console.log('[LIVE-GOLDEN-WORKER] started', {
    boardCount: started.boardCount,
    boardTarget: started.boardTarget,
    intervalMs: started.intervalMs,
    cycleLimit: started.cycleLimit,
    maxCandidates: started.maxCandidates,
  });

  const logTimer = setInterval(() => {
    const snapshot = radar.snapshot();
    console.log('[LIVE-GOLDEN-WORKER] heartbeat', {
      running: snapshot.running,
      boardCount: snapshot.boardCount,
      boardTarget: snapshot.boardTarget,
      pendingProbeQueueCount: snapshot.pendingProbeQueueCount,
      totalRuns: snapshot.totalRuns,
      successfulRuns: snapshot.successfulRuns,
      failedRuns: snapshot.failedRuns,
      lastMessage: snapshot.lastMessage,
    });
  }, LOG_INTERVAL_MS);

  const shutdown = (signal: string) => {
    clearInterval(logTimer);
    const snapshot = radar.stop();
    console.log('[LIVE-GOLDEN-WORKER] stopped', {
      signal,
      boardCount: snapshot.boardCount,
      totalRuns: snapshot.totalRuns,
      successfulRuns: snapshot.successfulRuns,
      failedRuns: snapshot.failedRuns,
    });
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
