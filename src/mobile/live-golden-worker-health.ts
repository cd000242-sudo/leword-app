import * as fs from 'fs';
import * as path from 'path';

const SCHEMA_VERSION = 'live-golden-worker-heartbeat-v1';
export const LIVE_GOLDEN_WORKER_HEARTBEAT_STALE_MS = 120_000;

export interface LiveGoldenWorkerHeartbeat {
  schemaVersion: typeof SCHEMA_VERSION;
  status: 'running' | 'stopped' | 'error';
  pid: number;
  startedAt: string;
  updatedAt: string;
  boardCount: number;
  boardTarget: number;
  pendingProbeQueueCount?: number;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  searchAdQuotaExhausted?: boolean;
  nextRetryAt?: string;
  lastMessage?: string;
}

export type LiveGoldenWorkerHeartbeatInput = Omit<LiveGoldenWorkerHeartbeat, 'schemaVersion'>;

export interface LiveGoldenWorkerHealth {
  available: boolean;
  healthy: boolean;
  stale: boolean;
  ageMs: number | null;
  reason: string;
  heartbeat: LiveGoldenWorkerHeartbeat | null;
}

function finiteNonNegative(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function validIso(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export function resolveLiveGoldenWorkerHeartbeatFile(boardFile?: string): string {
  const explicit = String(process.env['LEWORD_MOBILE_LIVE_GOLDEN_HEARTBEAT_FILE'] || '').trim();
  if (explicit) return explicit;
  const board = String(
    boardFile
      || process.env['LEWORD_MOBILE_LIVE_GOLDEN_BOARD_FILE']
      || '/data/live-golden-board.json',
  ).trim();
  return /\.json$/i.test(board)
    ? board.replace(/\.json$/i, '-worker-heartbeat.json')
    : `${board}-worker-heartbeat.json`;
}

export function writeLiveGoldenWorkerHeartbeat(
  file: string,
  input: LiveGoldenWorkerHeartbeatInput,
): LiveGoldenWorkerHeartbeat {
  const heartbeat: LiveGoldenWorkerHeartbeat = {
    schemaVersion: SCHEMA_VERSION,
    ...input,
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(heartbeat), 'utf8');
  try {
    fs.renameSync(temporary, file);
  } catch {
    fs.copyFileSync(temporary, file);
    fs.rmSync(temporary, { force: true });
  }
  return heartbeat;
}

export function readLiveGoldenWorkerHealth(
  file: string,
  options: { nowMs?: number; staleAfterMs?: number } = {},
): LiveGoldenWorkerHealth {
  if (!fs.existsSync(file)) {
    return {
      available: false,
      healthy: false,
      stale: true,
      ageMs: null,
      reason: 'worker heartbeat missing',
      heartbeat: null,
    };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<LiveGoldenWorkerHeartbeat>;
    const status = parsed.status;
    const pid = finiteNonNegative(parsed.pid);
    const boardCount = finiteNonNegative(parsed.boardCount);
    const boardTarget = finiteNonNegative(parsed.boardTarget);
    const totalRuns = finiteNonNegative(parsed.totalRuns);
    const successfulRuns = finiteNonNegative(parsed.successfulRuns);
    const failedRuns = finiteNonNegative(parsed.failedRuns);
    if (
      parsed.schemaVersion !== SCHEMA_VERSION
      || !['running', 'stopped', 'error'].includes(String(status))
      || pid === null
      || !validIso(parsed.startedAt)
      || !validIso(parsed.updatedAt)
      || boardCount === null
      || boardTarget === null
      || totalRuns === null
      || successfulRuns === null
      || failedRuns === null
    ) {
      throw new Error('invalid worker heartbeat schema');
    }
    const heartbeat = parsed as LiveGoldenWorkerHeartbeat;
    const nowMs = options.nowMs ?? Date.now();
    const staleAfterMs = Math.max(1_000, options.staleAfterMs ?? LIVE_GOLDEN_WORKER_HEARTBEAT_STALE_MS);
    const ageMs = Math.max(0, nowMs - Date.parse(heartbeat.updatedAt));
    const stale = ageMs > staleAfterMs;
    const running = heartbeat.status === 'running';
    return {
      available: true,
      healthy: running && !stale,
      stale,
      ageMs,
      reason: stale
        ? `worker heartbeat stale (${ageMs}ms)`
        : running
          ? 'worker heartbeat fresh'
          : `worker ${heartbeat.status}`,
      heartbeat,
    };
  } catch (err) {
    return {
      available: true,
      healthy: false,
      stale: true,
      ageMs: null,
      reason: (err as Error).message || 'worker heartbeat unreadable',
      heartbeat: null,
    };
  }
}
