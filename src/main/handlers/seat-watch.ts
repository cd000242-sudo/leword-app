/**
 * 자리 감시 IPC + 새벽 스케줄러 + 윈도우 알림 (앱 전용, 2026-09-09 플랜 A3).
 *
 * 관심 키워드를 userData/seat-watch/watch.json 에 두고, 매일 현지 05:00 이 지난 뒤 처음 켜져 있을 때
 * 자리 실측기(measureKeywords)로 다시 잰다. 변화(닫힘→열림·열림→닫힘·정면 ≤3)가 있으면 OS 알림.
 * 실측 한 번의 규칙(직렬·차단 회피)은 자리 실측기와 같다 — 같은 함수를 쓴다.
 */
import { app, ipcMain, Notification } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import {
  addWatchKeywords, appendPoint, isWatchDue, judgeWatchChange, lastMeasuredPoint, removeWatchKeyword, summarizeWatch,
  type WatchEntry, type WatchPoint,
} from '../../utils/seat-watch';
import { measureKeywords, type SeatRow } from './seat-measure';

const DIR = () => path.join(app.getPath('userData'), 'seat-watch');
const FILE_WATCH = () => path.join(DIR(), 'watch.json');
const FILE_STATE = () => path.join(DIR(), 'state.json');
const CHECK_EVERY_MS = 10 * 60 * 1000;
export const SEAT_WATCH_MAX = 100;
export const SEAT_WATCH_RUN_HOUR = 5;

interface WatchState { lastRunAt: string | null; lastResult?: { measured: number; blocked: number; changes: number; at: string } }

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch (error: any) {
    console.warn('[SEAT-WATCH] 읽기 실패:', file, error?.message);
    return fallback;
  }
}

function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 1), 'utf8');
}

const readEntries = (): WatchEntry[] => readJson<WatchEntry[]>(FILE_WATCH(), []).filter((e) => e && typeof e.keyword === 'string');
const readState = (): WatchState => readJson<WatchState>(FILE_STATE(), { lastRunAt: null });

function toPoint(row: SeatRow): WatchPoint {
  const ok = row.status === 'ok';
  return {
    measuredAt: row.measuredAt || new Date().toISOString(),
    verdict: ok ? (row.verdict || '자료없음') : '자료없음',
    facing: ok && typeof row.facing === 'number' ? row.facing : null,
    vacancy: ok && typeof row.vacancy === 'number' ? row.vacancy : null,
    ads: ok && typeof row.ads === 'number' ? row.ads : null,
    cards: ok && Array.isArray(row.cards) ? row.cards : null,
    ...(ok ? {} : { unmeasured: true }),
  };
}

function notify(title: string, body: string): void {
  try {
    if (!Notification.isSupported()) return;
    new Notification({ title, body }).show();
  } catch (error: any) {
    console.warn('[SEAT-WATCH] 알림 실패:', error?.message);
  }
}

let running = false;

/** 감시 목록 전체를 한 번 잰다. 변화가 있으면 알린다. 수동(지금 재기)·자동(새벽) 공용. */
export async function runSeatWatch(reason: 'manual' | 'scheduled', onProgress?: (p: unknown) => void): Promise<{
  success: boolean; measured: number; blocked: number; changes: { keyword: string; message: string }[]; error?: string;
}> {
  if (running) return { success: false, measured: 0, blocked: 0, changes: [], error: '이미 재는 중' };
  running = true;
  try {
    const entries = readEntries();
    if (entries.length === 0) return { success: true, measured: 0, blocked: 0, changes: [] };
    const result = await measureKeywords(entries.map((e) => e.keyword), { withStructure: true, onProgress });
    const byKeyword = new Map(result.rows.map((r) => [r.keyword.replace(/\s+/g, ''), r]));
    const changes: { keyword: string; message: string }[] = [];
    /*
     * 재는 동안(수십 초) 사용자가 목록에서 뺐거나 넣었을 수 있다 — 시작할 때 읽은 목록을 통째로
     * 덮어쓰면 그 변경이 사라진다(실주행에서 실제로 뺀 키워드가 되살아났다). 지금 목록을 다시 읽어
     * 그 위에 점만 얹는다.
     */
    const current = readEntries();
    const next = current.map((entry) => {
      const row = byKeyword.get(entry.keyword.replace(/\s+/g, ''));
      if (!row) return entry; // 이번 회차에 못 미침(중단·차단 5연속) — 이력 안 늘림
      const point = toPoint(row);
      const change = judgeWatchChange(lastMeasuredPoint(entry), point);
      if (change.changed) changes.push({ keyword: entry.keyword, message: change.message });
      return appendPoint(entry, point);
    });
    writeJson(FILE_WATCH(), next);
    const state: WatchState = {
      lastRunAt: new Date().toISOString(),
      lastResult: { measured: result.summary.measured, blocked: result.summary.blocked, changes: changes.length, at: new Date().toISOString() },
    };
    writeJson(FILE_STATE(), state);
    for (const change of changes.slice(0, 5)) notify(`자리 감시 — ${change.keyword}`, change.message);
    if (changes.length > 5) notify('자리 감시', `${changes.length}건 변화 — 앱에서 확인`);
    console.log(`[SEAT-WATCH] ${reason} 실측 끝 — ${result.summary.measured}건 · 차단 ${result.summary.blocked} · 변화 ${changes.length}`);
    return { success: true, measured: result.summary.measured, blocked: result.summary.blocked, changes };
  } catch (error: any) {
    console.warn('[SEAT-WATCH] 실측 실패:', error?.message);
    return { success: false, measured: 0, blocked: 0, changes: [], error: error?.message || '자리 감시 실패' };
  } finally {
    running = false;
  }
}

let timer: NodeJS.Timeout | null = null;

/** 10분마다 "돌 차례인가"만 본다 — 새벽 05:00 이 지난 뒤 처음 켜져 있을 때 한 번. */
export function startSeatWatchScheduler(): void {
  if (timer) return;
  const tick = () => {
    try {
      const entries = readEntries();
      if (entries.length === 0) return;
      if (!isWatchDue(readState().lastRunAt, new Date(), SEAT_WATCH_RUN_HOUR)) return;
      void runSeatWatch('scheduled');
    } catch (error: any) {
      console.warn('[SEAT-WATCH] 스케줄 확인 실패:', error?.message);
    }
  };
  timer = setInterval(tick, CHECK_EVERY_MS);
  timer.unref?.();
  setTimeout(tick, 90 * 1000).unref?.(); // 켜지고 1분 반 뒤 첫 확인 — 부팅 직후 부하를 피한다
}

export function stopSeatWatchScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}

export function setupSeatWatchHandlers(): void {
  if (!ipcMain.listenerCount('seat-watch-list')) {
    ipcMain.handle('seat-watch-list', async () => {
      const entries = readEntries();
      const state = readState();
      return { success: true, items: entries.map((e) => summarizeWatch(e)), count: entries.length, max: SEAT_WATCH_MAX, runHour: SEAT_WATCH_RUN_HOUR, lastRunAt: state.lastRunAt, lastResult: state.lastResult || null };
    });
  }
  if (!ipcMain.listenerCount('seat-watch-add')) {
    ipcMain.handle('seat-watch-add', async (_event, payload?: { keywords?: string[] }) => {
      const entries = readEntries();
      const room = Math.max(0, SEAT_WATCH_MAX - entries.length);
      const wanted = (Array.isArray(payload?.keywords) ? payload!.keywords! : []).slice(0, room);
      const { entries: next, added } = addWatchKeywords(entries, wanted);
      writeJson(FILE_WATCH(), next);
      return { success: true, added, count: next.length, max: SEAT_WATCH_MAX };
    });
  }
  if (!ipcMain.listenerCount('seat-watch-remove')) {
    ipcMain.handle('seat-watch-remove', async (_event, payload?: { keyword?: string }) => {
      const next = removeWatchKeyword(readEntries(), String(payload?.keyword || ''));
      writeJson(FILE_WATCH(), next);
      return { success: true, count: next.length };
    });
  }
  if (!ipcMain.listenerCount('seat-watch-run-now')) {
    ipcMain.handle('seat-watch-run-now', async (event) => runSeatWatch('manual', (p) => {
      try { event.sender.send('seat-measure-progress', { ...(p as object), source: 'watch' }); } catch { /* 창이 닫혔을 수 있다 */ }
    }));
  }
  console.log('[SEAT-WATCH] ✅ 자리 감시 핸들러 등록 완료');
}
