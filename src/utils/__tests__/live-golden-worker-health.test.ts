import {
  readLiveGoldenWorkerHealth,
  writeLiveGoldenWorkerHeartbeat,
} from '../../mobile/live-golden-worker-health';
import * as fs from 'fs';
import * as path from 'path';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const tmpDir = path.join(__dirname, '..', '..', '..', 'tmp', 'live-golden-worker-health-test');
const heartbeatFile = path.join(tmpDir, 'heartbeat.json');
fs.mkdirSync(tmpDir, { recursive: true });
fs.rmSync(heartbeatFile, { force: true });

const startedAt = '2026-07-11T10:00:00.000Z';
writeLiveGoldenWorkerHeartbeat(heartbeatFile, {
  status: 'running',
  pid: 321,
  startedAt,
  updatedAt: '2026-07-11T10:01:00.000Z',
  boardCount: 23,
  boardTarget: 120,
  pendingProbeQueueCount: 606,
  totalRuns: 2478,
  successfulRuns: 2478,
  failedRuns: 0,
  searchAdQuotaExhausted: true,
  nextRetryAt: '2026-07-11T15:00:00.000Z',
  lastMessage: 'SearchAd daily soft ceiling reached',
});

const healthy = readLiveGoldenWorkerHealth(heartbeatFile, {
  nowMs: Date.parse('2026-07-11T10:02:00.000Z'),
  staleAfterMs: 120_000,
});
assert('fresh running heartbeat is healthy',
  healthy.available === true
    && healthy.healthy === true
    && healthy.stale === false
    && healthy.ageMs === 60_000
    && healthy.heartbeat?.boardCount === 23
    && healthy.heartbeat?.searchAdQuotaExhausted === true,
  JSON.stringify(healthy));

const stale = readLiveGoldenWorkerHealth(heartbeatFile, {
  nowMs: Date.parse('2026-07-11T10:03:01.000Z'),
  staleAfterMs: 120_000,
});
assert('heartbeat older than two log intervals is unhealthy',
  stale.available === true
    && stale.healthy === false
    && stale.stale === true
    && /stale/i.test(stale.reason),
  JSON.stringify(stale));

writeLiveGoldenWorkerHeartbeat(heartbeatFile, {
  status: 'stopped',
  pid: 321,
  startedAt,
  updatedAt: '2026-07-11T10:04:00.000Z',
  boardCount: 23,
  boardTarget: 120,
  totalRuns: 2478,
  successfulRuns: 2478,
  failedRuns: 0,
  lastMessage: 'worker stopped',
});
const stopped = readLiveGoldenWorkerHealth(heartbeatFile, {
  nowMs: Date.parse('2026-07-11T10:04:30.000Z'),
  staleAfterMs: 120_000,
});
assert('explicitly stopped worker is unhealthy even with a fresh heartbeat',
  stopped.available === true
    && stopped.healthy === false
    && stopped.stale === false
    && /stopped/i.test(stopped.reason),
  JSON.stringify(stopped));

fs.rmSync(heartbeatFile, { force: true });
const missing = readLiveGoldenWorkerHealth(heartbeatFile, {
  nowMs: Date.parse('2026-07-11T10:05:00.000Z'),
  staleAfterMs: 120_000,
});
assert('missing heartbeat is observable and unhealthy',
  missing.available === false
    && missing.healthy === false
    && /missing/i.test(missing.reason),
  JSON.stringify(missing));

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log('[live-golden-worker-health.test] passed');

export {};
