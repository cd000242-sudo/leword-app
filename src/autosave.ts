/**
 * v2.43.79: 팀9 비평 — 작업 데이터 autosave
 *
 * 사용자 보고: "맘대로 꺼지자나"
 * crash-guard 가 crash 감지하지만 작업 데이터 복구 매커니즘 부재.
 *
 * 동작:
 *   - 메인이 renderer 에게 30초마다 'autosave-tick' 발송
 *   - renderer 는 현재 작업 상태 (검색어 / 결과 / 발굴 진행 등) 를 main 에 전달
 *   - main 이 %APPDATA%/blogger-admin-panel/session-state.json 에 atomic write
 *   - 다음 부팅 시 ipcMain.handle('session-state:read') 로 복원 가능
 *
 * Atomic write: temp 파일에 쓰고 rename → 부분 write 방지
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

const TICK_INTERVAL_MS = 30_000;

function getStatePath(): string {
  return path.join(app.getPath('appData'), 'blogger-admin-panel', 'session-state.json');
}

function atomicWrite(filePath: string, data: string): void {
  const tmp = filePath + '.tmp';
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tmp, data, 'utf8');
    fs.renameSync(tmp, filePath);
  } catch (e: any) {
    console.warn('[AUTOSAVE] atomic write 실패:', e?.message);
    try { fs.unlinkSync(tmp); } catch {}
  }
}

let tickTimer: NodeJS.Timeout | null = null;
let lastSavedAt = 0;

export function startAutosave(getWindow: () => BrowserWindow | null): void {
  if (tickTimer) return;
  // renderer 가 응답하는 autosave-state-update 핸들러 등록
  ipcMain.handle('autosave:state-update', async (_event, state: any) => {
    try {
      const enriched = {
        savedAt: new Date().toISOString(),
        version: app.getVersion(),
        ...state,
      };
      atomicWrite(getStatePath(), JSON.stringify(enriched, null, 2));
      lastSavedAt = Date.now();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message };
    }
  });

  ipcMain.handle('autosave:read-state', async () => {
    try {
      const p = getStatePath();
      if (!fs.existsSync(p)) return { ok: true, state: null };
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      return { ok: true, state: data };
    } catch (e: any) {
      return { ok: false, error: e?.message };
    }
  });

  ipcMain.handle('autosave:clear-state', async () => {
    try {
      const p = getStatePath();
      if (fs.existsSync(p)) fs.unlinkSync(p);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message };
    }
  });

  // 30초마다 renderer 에게 tick 발송 (renderer가 응답하지 않아도 OK)
  tickTimer = setInterval(() => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return;
    try {
      win.webContents.send('autosave-tick');
    } catch {}
  }, TICK_INTERVAL_MS);
  tickTimer.unref?.();
  console.log('[AUTOSAVE] 시작 (30초 tick)');
}

export function stopAutosave(): void {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

export function getAutosaveStatus(): { lastSavedAt: number; running: boolean } {
  return { lastSavedAt, running: !!tickTimer };
}
