/**
 * LEWORD 자동 업데이트 모듈 (네이버 앱 방식)
 *
 * 사양:
 *  - app.isPackaged 일 때만 동작 (개발 모드 건너뜀)
 *  - `initAutoUpdaterEarly()` 는 앱 시작 시 즉시 호출 — 인증창과 병렬
 *  - update-available 발생 시 등록된 로그인창을 hide() 하고 진행 창 표시
 *  - download-progress 마다 진행 창에 퍼센트 전달
 *  - update-downloaded 시 5초 카운트다운 후 quitAndInstall()
 *  - error 시 진행 창을 에러 UI 로 전환 (8초 후 자동 닫힘) + 로그인창 show()
 *
 * 함정 방지:
 *  - electron-updater 를 lazy require 로 로드 (dev 모드 import 에러 방지)
 *  - 중복 재시작 플래그로 quitAndInstall 이 두 번 호출되지 않도록
 *  - auto-update-event 브로드캐스트 (렌더러에서 감지 가능)
 */

import { app, BrowserWindow, ipcMain } from 'electron';

let progressWindow: BrowserWindow | null = null;
let hideableWindows = new Set<BrowserWindow>();
let isUpdatingFlag = false;
let restartScheduled = false;
let lastUpdateInfo: { version?: string } = {};

// 🔥 업데이트 체크 완료 신호 — 메인창 show() 전에 대기 가능
// update-available / update-not-available / error 중 하나 발생 시 resolve
let updateCheckResolver: ((result: { hasUpdate: boolean }) => void) | null = null;
let updateCheckPromise: Promise<{ hasUpdate: boolean }> = new Promise((resolve) => {
  updateCheckResolver = resolve;
});

function signalUpdateCheck(hasUpdate: boolean): void {
  if (updateCheckResolver) {
    updateCheckResolver({ hasUpdate });
    updateCheckResolver = null;
  }
}

/**
 * 업데이트 체크 완료까지 대기 (timeout 내 결과 반환)
 *  - hasUpdate=true → 메인창 show() 스킵 권장
 *  - hasUpdate=false → 정상 show()
 *  - timeout 시 기본 hasUpdate=false 로 진행 (앱 시작 블로킹 방지)
 */
export async function waitForUpdateCheck(timeoutMs = 5000): Promise<{ hasUpdate: boolean }> {
  return Promise.race([
    updateCheckPromise,
    new Promise<{ hasUpdate: boolean }>(resolve => setTimeout(() => resolve({ hasUpdate: false }), timeoutMs)),
  ]);
}

export function isUpdating(): boolean {
  return isUpdatingFlag;
}

/**
 * 업데이트 시작 시 hide() 해야 할 창들을 등록
 *  - 로그인창 (showLicenseInputDialog)
 *  - 메인창 (자동로그인 시에만 해당)
 */
export function registerHideableWindow(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed()) return;
  hideableWindows.add(win);
  win.on('closed', () => {
    hideableWindows.delete(win);
  });
}

/** @deprecated use registerHideableWindow */
export function setUpdaterLoginWindow(win: BrowserWindow | null): void {
  registerHideableWindow(win);
}

function broadcastEvent(event: string, payload: any): void {
  try {
    BrowserWindow.getAllWindows().forEach(w => {
      if (!w.isDestroyed()) {
        try {
          w.webContents.send('auto-update-event', { event, payload });
        } catch {}
      }
    });
  } catch {}
}

// ============================================================
// 진행 창 (HTML은 data URL 로 인라인)
// ============================================================

function buildProgressHtml(version: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>LEWORD 업데이트</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:100%; height:100%; background:#0f0f23; font-family:'Noto Sans KR',sans-serif; color:#fff; overflow:hidden; }
  body { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:18px; padding:24px; -webkit-app-region:drag; }
  .title { font-size:16px; font-weight:600; letter-spacing:.3px; color:#fbbf24; }
  .version { font-size:12px; color:rgba(255,255,255,.55); }
  .ring { position:relative; width:110px; height:110px; }
  .ring svg { transform:rotate(-90deg); width:100%; height:100%; }
  .ring circle { fill:none; stroke-width:8; }
  .bg { stroke:rgba(255,255,255,.08); }
  .fg { stroke:url(#grad); stroke-linecap:round; transition:stroke-dashoffset .3s ease; }
  .pct { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:22px; font-weight:700; color:#fff; }
  .status { font-size:12px; color:rgba(255,255,255,.6); min-height:16px; text-align:center; }
  .error-title { color:#fb7185; font-size:14px; font-weight:600; }
</style></head>
<body>
  <div class="title">LEWORD 업데이트</div>
  <div class="version" id="version">v${version}</div>
  <div class="ring">
    <svg viewBox="0 0 100 100">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#fbbf24"/>
          <stop offset="100%" stop-color="#f59e0b"/>
        </linearGradient>
      </defs>
      <circle class="bg" cx="50" cy="50" r="42"/>
      <circle class="fg" cx="50" cy="50" r="42" stroke-dasharray="263.89" stroke-dashoffset="263.89" id="fg"/>
    </svg>
    <div class="pct" id="pct">0%</div>
  </div>
  <div class="status" id="status">다운로드 준비 중...</div>
</body></html>`;
}

export function showProgressWindow(version: string): BrowserWindow {
  if (progressWindow && !progressWindow.isDestroyed()) {
    return progressWindow;
  }

  lastUpdateInfo.version = version;
  progressWindow = new BrowserWindow({
    width: 420,
    height: 300,
    resizable: false,
    frame: false,
    transparent: false,
    backgroundColor: '#0f0f23',
    alwaysOnTop: true,
    skipTaskbar: false,
    center: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const html = buildProgressHtml(version);
  progressWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  // 🔥 등록된 모든 hideable 창(로그인창/메인창) 숨김
  try {
    for (const win of hideableWindows) {
      if (win && !win.isDestroyed()) {
        try { win.hide(); } catch {}
      }
    }
  } catch {}

  return progressWindow;
}

async function updateProgress(percent: number): Promise<void> {
  if (!progressWindow || progressWindow.isDestroyed()) return;
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  try {
    await progressWindow.webContents.executeJavaScript(
      `(() => {
        const p = ${clamped};
        const fg = document.getElementById('fg');
        const pct = document.getElementById('pct');
        const status = document.getElementById('status');
        if (fg) fg.setAttribute('stroke-dashoffset', String(263.89 - (263.89 * p / 100)));
        if (pct) pct.textContent = p + '%';
        if (status) status.textContent = '다운로드 중... ' + p + '%';
      })();`
    );
  } catch {}
}

async function showReadyState(version: string, seconds: number): Promise<void> {
  if (!progressWindow || progressWindow.isDestroyed()) return;
  try {
    await progressWindow.webContents.executeJavaScript(
      `(() => {
        const fg = document.getElementById('fg');
        const pct = document.getElementById('pct');
        const status = document.getElementById('status');
        const version = document.getElementById('version');
        if (fg) fg.setAttribute('stroke-dashoffset', '0');
        if (fg) fg.setAttribute('stroke', '#34d399');
        if (pct) pct.textContent = '✓';
        if (version) version.textContent = 'v${version} 준비 완료';
        if (status) status.textContent = '✅ 업데이트 준비 완료 — ${seconds}초 후 자동 재시작';
      })();`
    );
  } catch {}
}

async function showErrorState(message: string): Promise<void> {
  if (!progressWindow || progressWindow.isDestroyed()) return;
  try {
    await progressWindow.webContents.executeJavaScript(
      `(() => {
        const pct = document.getElementById('pct');
        const status = document.getElementById('status');
        const version = document.getElementById('version');
        if (pct) { pct.textContent = '!'; pct.style.color = '#fb7185'; }
        if (version) { version.textContent = '업데이트 실패'; version.className='error-title'; }
        if (status) status.textContent = ${JSON.stringify(message)} + ' (8초 후 닫힘)';
      })();`
    );
  } catch {}
}

function closeProgressWindow(): void {
  if (progressWindow && !progressWindow.isDestroyed()) {
    try { progressWindow.close(); } catch {}
  }
  progressWindow = null;
}

// ============================================================
// 핵심: 초기 업데이트 체크 (비동기, 블로킹 금지)
// ============================================================

export function initAutoUpdaterEarly(): void {
  if (!app.isPackaged) {
    console.log('[UPDATER] 개발 모드 — 업데이트 체크 건너뜀');
    return;
  }

  if (isUpdatingFlag) {
    console.log('[UPDATER] 이미 진행 중');
    return;
  }

  let autoUpdater: any;
  try {
    // Lazy require — dev 모드에서 import 에러 회피
    autoUpdater = require('electron-updater').autoUpdater;
  } catch (e: any) {
    console.error('[UPDATER] electron-updater 로드 실패:', e?.message ?? e);
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = {
    info: (...a: any[]) => console.log('[UPDATER]', ...a),
    warn: (...a: any[]) => console.warn('[UPDATER]', ...a),
    error: (...a: any[]) => console.error('[UPDATER]', ...a),
    debug: (..._a: any[]) => {},
  };

  // 이벤트 리스너 6종
  autoUpdater.on('checking-for-update', () => {
    console.log('[UPDATER] 업데이트 확인 중...');
    broadcastEvent('checking', {});
  });

  autoUpdater.on('update-available', (info: any) => {
    console.log('[UPDATER] 업데이트 발견:', info?.version);
    isUpdatingFlag = true;
    lastUpdateInfo.version = info?.version;
    showProgressWindow(info?.version ?? '');
    broadcastEvent('available', { version: info?.version });
    signalUpdateCheck(true);
    try {
      autoUpdater.downloadUpdate();
    } catch (err: any) {
      console.error('[UPDATER] downloadUpdate 호출 실패:', err?.message ?? err);
    }
  });

  autoUpdater.on('update-not-available', (info: any) => {
    console.log('[UPDATER] 최신 버전입니다. 현재=', info?.version);
    broadcastEvent('not-available', { version: info?.version });
    signalUpdateCheck(false);
  });

  autoUpdater.on('download-progress', (progress: any) => {
    const pct = Math.round(progress?.percent ?? 0);
    console.log(`[UPDATER] 다운로드: ${pct}%`);
    updateProgress(pct);
    broadcastEvent('progress', { percent: pct });
  });

  autoUpdater.on('update-downloaded', (info: any) => {
    console.log('[UPDATER] 다운로드 완료:', info?.version);
    broadcastEvent('downloaded', { version: info?.version });

    const countdown = 5;
    showReadyState(info?.version ?? '', countdown).then(() => {
      setTimeout(() => {
        if (restartScheduled) return;
        restartScheduled = true;
        try {
          // closed 이벤트에서 quitAndInstall 호출
          if (progressWindow && !progressWindow.isDestroyed()) {
            progressWindow.once('closed', () => {
              try {
                autoUpdater.quitAndInstall(false, true);
              } catch (e: any) {
                console.error('[UPDATER] quitAndInstall 실패:', e?.message);
              }
            });
            closeProgressWindow();
          } else {
            autoUpdater.quitAndInstall(false, true);
          }
        } catch (e: any) {
          console.error('[UPDATER] 재시작 예약 실패:', e?.message);
        }
      }, countdown * 1000);
    });
  });

  autoUpdater.on('error', (err: any) => {
    console.error('[UPDATER] 에러:', err?.message ?? err);
    isUpdatingFlag = false;
    broadcastEvent('error', { message: err?.message });
    signalUpdateCheck(false);   // 에러 = 체크 실패 → 메인창은 정상 show()
    showErrorState(err?.message ?? '알 수 없는 오류').then(() => {
      setTimeout(() => {
        closeProgressWindow();
        // 에러 복구: 숨겼던 창들 다시 표시
        try {
          for (const win of hideableWindows) {
            if (win && !win.isDestroyed()) {
              try { win.show(); } catch {}
            }
          }
        } catch {}
      }, 8000);
    });
  });

  // 비동기 체크 시작 — 실패해도 앱 흐름 방해 없음
  console.log('[UPDATER] 업데이트 체크 시작');
  try {
    autoUpdater.checkForUpdates().catch((err: any) => {
      console.error('[UPDATER] checkForUpdates 실패:', err?.message ?? err);
    });
  } catch (err: any) {
    console.error('[UPDATER] 체크 동기 예외:', err?.message ?? err);
  }
}

// ============================================================
// IPC 핸들러
// ============================================================

export function registerUpdaterHandlers(): void {
  // 중복 등록 방지
  try { ipcMain.removeHandler('updater:check'); } catch {}
  try { ipcMain.removeHandler('updater:install'); } catch {}
  try { ipcMain.removeHandler('updater:getVersion'); } catch {}
  try { ipcMain.removeHandler('auto-update:install'); } catch {}

  ipcMain.handle('updater:check', async () => {
    if (!app.isPackaged) return { ok: false, reason: 'dev-mode' };
    try {
      const autoUpdater = require('electron-updater').autoUpdater;
      const result = await autoUpdater.checkForUpdates();
      return { ok: true, version: result?.updateInfo?.version };
    } catch (e: any) {
      return { ok: false, reason: e?.message ?? String(e) };
    }
  });

  const installHandler = async () => {
    try {
      const autoUpdater = require('electron-updater').autoUpdater;
      if (restartScheduled) return { ok: true, alreadyScheduled: true };
      restartScheduled = true;
      setTimeout(() => {
        try { autoUpdater.quitAndInstall(false, true); } catch {}
      }, 200);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, reason: e?.message ?? String(e) };
    }
  };

  ipcMain.handle('updater:install', installHandler);
  ipcMain.handle('auto-update:install', installHandler);

  ipcMain.handle('updater:getVersion', () => {
    return { version: app.getVersion() };
  });
}
