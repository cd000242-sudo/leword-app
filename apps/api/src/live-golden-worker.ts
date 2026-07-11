import { MobileNotificationInbox } from '../../../src/mobile/notification-inbox';
import { createMobileLiveGoldenRadarFromEnv } from '../../../src/mobile/live-golden-radar';
import {
  resolveLiveGoldenWorkerHeartbeatFile,
  writeLiveGoldenWorkerHeartbeat,
} from '../../../src/mobile/live-golden-worker-health';

const LOG_INTERVAL_MS = 60_000;

function main(): void {
  const startedAt = new Date().toISOString();
  const heartbeatFile = resolveLiveGoldenWorkerHeartbeatFile();
  const notificationInbox = new MobileNotificationInbox();
  const radar = createMobileLiveGoldenRadarFromEnv(notificationInbox, () => ({ ok: true }));
  if (!radar) {
    console.error('[LIVE-GOLDEN-WORKER] disabled: set LEWORD_MOBILE_LIVE_GOLDEN_ENABLED=true');
    process.exit(1);
  }

  const started = radar.start();
  const writeHeartbeat = (status: 'running' | 'stopped' | 'error', snapshot = radar.snapshot()): void => {
    try {
      writeLiveGoldenWorkerHeartbeat(heartbeatFile, {
        status,
        pid: process.pid,
        startedAt,
        updatedAt: new Date().toISOString(),
        boardCount: snapshot.boardCount,
        boardTarget: snapshot.boardTarget,
        pendingProbeQueueCount: snapshot.pendingProbeQueueCount,
        totalRuns: snapshot.totalRuns,
        successfulRuns: snapshot.successfulRuns,
        failedRuns: snapshot.failedRuns,
        searchAdQuotaExhausted: snapshot.searchAdQuota?.exhausted,
        nextRetryAt: snapshot.nextRetryAt,
        lastMessage: snapshot.lastMessage,
      });
    } catch (err) {
      console.error('[LIVE-GOLDEN-WORKER] heartbeat write failed', (err as Error).message || String(err));
    }
  };
  writeHeartbeat('running', started);
  console.log('[LIVE-GOLDEN-WORKER] started', {
    boardCount: started.boardCount,
    boardTarget: started.boardTarget,
    intervalMs: started.intervalMs,
    cycleLimit: started.cycleLimit,
    maxCandidates: started.maxCandidates,
  });

  const logTimer = setInterval(() => {
    const snapshot = radar.snapshot();
    writeHeartbeat('running', snapshot);
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
    writeHeartbeat('stopped', snapshot);
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
