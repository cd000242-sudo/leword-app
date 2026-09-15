/**
 * 홈판 신호 주기 실행 — 켜짐 · 간격을 settings.json 에 기억하고 앱이 켜질 때 되살린다(실시간 틈새와 같은 방식).
 *
 * 한 회차 = 수집 → 스토리 재계산. 이미 도는 중이면 건너뛴다. 기본은 꺼짐이다 —
 * 켜면 10분마다 이 PC 사용자 본인 네이버 키 쿼터(뉴스 검색 · 블로그 문서수)를 쓰기 때문에, 사용자가 켜야 돈다.
 */
import { app } from 'electron';
import * as path from 'path';
import { createHomefeedStore, type HomefeedStore } from './store';
import { collectHomefeedSnapshot } from './collector';
import { createHomefeedSourceDeps } from './sources';
import { recomputeHomefeedStories } from './engine';

let store: HomefeedStore | null = null;
let timer: NodeJS.Timeout | null = null;
let startupTimer: NodeJS.Timeout | null = null;
let running = false;
let lastRunAt: string | null = null;
let lastError: string | null = null;
let lastDurationMs: number | null = null;
let nextRunAt: string | null = null;

export function homefeedStore(): HomefeedStore {
  if (!store) store = createHomefeedStore(path.join(app.getPath('userData'), 'homefeed'));
  return store;
}

export interface HomefeedRuntime {
  running: boolean;
  lastRunAt: string | null;
  lastError: string | null;
  lastDurationMs: number | null;
  nextRunAt: string | null;
}

export function homefeedRuntime(): HomefeedRuntime {
  return { running, lastRunAt, lastError, lastDurationMs, nextRunAt };
}

export async function runHomefeedCycle(reason: 'auto' | 'manual'): Promise<{ ok: boolean; skipped?: boolean; error?: string; stories?: number; issues?: number }> {
  if (running) return { ok: false, skipped: true, error: '이미 수집 중입니다 — 끝나면 목록이 바뀝니다.' };
  running = true;
  const started = Date.now();
  try {
    const target = homefeedStore();
    const settings = target.readSettings();
    const { snapshot } = await collectHomefeedSnapshot(target, settings, createHomefeedSourceDeps(target, { log: (message) => console.log(message) }));
    const file = recomputeHomefeedStories(target);
    lastError = null;
    console.log(`[HOMEFEED] ${reason === 'auto' ? '자동' : '수동'} 회차 끝 — 스토리 ${file.stories.length}`);
    return { ok: true, stories: file.stories.length, issues: snapshot.issues.length };
  } catch (error) {
    lastError = String(error instanceof Error ? error.message : error).slice(0, 200);
    console.error('[HOMEFEED] 회차 실패:', lastError);
    return { ok: false, error: lastError };
  } finally {
    running = false;
    lastRunAt = new Date().toISOString();
    lastDurationMs = Date.now() - started;
  }
}

/** 저장된 설정대로 주기를 다시 건다(설정을 바꾼 뒤에도 부른다). */
export function applyHomefeedSchedule(): void {
  if (timer) { clearInterval(timer); timer = null; }
  nextRunAt = null;
  const settings = homefeedStore().readSettings();
  if (!settings.enabled) return;
  const intervalMs = settings.snapshotIntervalMinutes * 60_000;
  timer = setInterval(() => {
    nextRunAt = new Date(Date.now() + intervalMs).toISOString();
    void runHomefeedCycle('auto');
  }, intervalMs);
  nextRunAt = new Date(Date.now() + intervalMs).toISOString();
}

/** 앱 시작 때 — 켜 둔 상태면 되살리고 첫 회차를 30초 뒤 바로 돈다(10분을 기다리지 않는다). */
export function startHomefeedScheduler(): void {
  try {
    applyHomefeedSchedule();
    const settings = homefeedStore().readSettings();
    if (!settings.enabled) return;
    console.log(`[HOMEFEED] 저장된 수집 되살림 — ${settings.snapshotIntervalMinutes}분마다`);
    startupTimer = setTimeout(() => { startupTimer = null; void runHomefeedCycle('auto'); }, 30_000);
  } catch (error) {
    console.error('[HOMEFEED] 스케줄러 시작 실패(앱 동작에는 영향 없음):', error);
  }
}

export function stopHomefeedScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
  if (startupTimer) { clearTimeout(startupTimer); startupTimer = null; }
  nextRunAt = null;
}
