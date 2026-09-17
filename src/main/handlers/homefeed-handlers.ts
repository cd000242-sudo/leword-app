/**
 * 홈판 신호 IPC — 앱 화면이 쓰는 창구(2026-09-17).
 *
 * 사장님: "사이트랑 앱에서도 잘 나오도록 해 줘."
 *
 * 홈판 신호는 이 PC 앱이 10분마다 수집 · 판정하는데, 정작 앱에는 화면이 없어 사이트로 가야 했다.
 * 계산 · 판정은 이미 브리지(웹)가 쓰는 서비스가 전부 갖고 있다 — 여기서는 그 서비스를 IPC 로도 잇는다.
 * 새 계산은 만들지 않는다. 화면 두 가지(목록 보기 · 지금 수집)만 연다.
 */
import { ipcMain } from 'electron';
import { createHomefeedHostDeps } from '../homefeed/host';
import type { HomefeedBridgeDeps } from '../homefeed/bridge-routes';

let deps: HomefeedBridgeDeps | null = null;

function homefeedDeps(): HomefeedBridgeDeps {
  if (!deps) deps = createHomefeedHostDeps();
  return deps;
}

export function registerHomefeedHandlers(): void {
  if (!ipcMain.listenerCount('homefeed-stories')) {
    ipcMain.handle('homefeed-stories', async () => {
      try {
        return { success: true, result: await homefeedDeps().stories() };
      } catch (error: any) {
        const message = String(error?.message || error).slice(0, 200);
        console.error('[HOMEFEED-IPC] 목록 실패:', message);
        return { success: false, error: message };
      }
    });
  }

  if (!ipcMain.listenerCount('homefeed-collect')) {
    ipcMain.handle('homefeed-collect', async () => {
      try {
        return { success: true, result: await homefeedDeps().collect() };
      } catch (error: any) {
        const message = String(error?.message || error).slice(0, 200);
        console.error('[HOMEFEED-IPC] 수집 실패:', message);
        return { success: false, error: message };
      }
    });
  }
}
