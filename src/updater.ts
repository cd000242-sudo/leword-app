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
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// v2.43.79: 팀10 비평 — installer 호환 protocol 명시
//   다른 protocol 버전 간 업데이트는 위험 (예: v2.43.73 silent → v2.43.75 manual installer)
//   currentInstallerProtocol 증가 시 사용자에게 수동 다운로드 안내
//   v3 = oneClick=true + isSilent=true + ExecShell + isForceRunAfter (v2.43.78~)
//   v2 = oneClick=false + isSilent=false 수동 모드 (v2.43.74~77)
//   v1 = 이전 자동 모드 (v2.43.73 이하)
const CURRENT_INSTALLER_PROTOCOL = 3;

let progressWindow: BrowserWindow | null = null;
let hideableWindows = new Set<BrowserWindow>();
let isUpdatingFlag = false;
let restartScheduled = false;
let lastUpdateInfo: { version?: string } = {};

// v2.43.78: 팀1+6 비평 — 단일 state machine (race 제거)
type UpdaterState = 'IDLE' | 'CHECKING' | 'DOWNLOADING' | 'VERIFYING' | 'INSTALLING' | 'DONE' | 'ERROR';
let updaterState: UpdaterState = 'IDLE';
function transitionState(to: UpdaterState): boolean {
  const allowed: Record<UpdaterState, UpdaterState[]> = {
    IDLE: ['CHECKING', 'ERROR'],
    CHECKING: ['DOWNLOADING', 'IDLE', 'ERROR'],
    DOWNLOADING: ['VERIFYING', 'ERROR'],
    VERIFYING: ['INSTALLING', 'ERROR'],
    INSTALLING: ['DONE', 'ERROR'],
    DONE: [],
    ERROR: ['IDLE'],
  };
  if (!allowed[updaterState].includes(to)) {
    console.warn(`[UPDATER-FSM] 거부된 전이: ${updaterState} → ${to}`);
    return false;
  }
  console.log(`[UPDATER-FSM] ${updaterState} → ${to}`);
  updaterState = to;
  return true;
}

// 모든 BrowserWindow를 강제로 destroy하여 NSIS 설치기가 "LEWORD cannot be closed" 에러 안 나도록.
// quitAndInstall만 부르면 일부 헬퍼/렌더러 프로세스가 살아남아 파일 교체 실패하는 케이스 대응.
function destroyAllWindowsForce(): void {
  try {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) {
        try { w.removeAllListeners('close'); } catch {}
        try { w.removeAllListeners('closed'); } catch {}
        try { w.destroy(); } catch {}
      }
    }
  } catch (e: any) {
    console.warn('[UPDATER] 창 destroy 중 오류 (무시):', e?.message);
  }
}

// quitAndInstall 안전 호출 — 모든 창 destroy 후 호출
// v2.43.67: 사용자 보고 "NSIS창도 안떠서 사용자가 너무 오래 기다리는 것 같다"
//   기존 isSilent=false는 oneClick=false 위저드 화면이 깜빡 떴다 사라지거나
//   사용자가 인지 못 하는 시간(5~10초) 동안 검은 화면만 보임
//   해결:
//     - isSilent=true 로 NSIS UI 숨김 (빠른 설치)
//     - installer.nsh customInstall ExecShell 이 새 LEWORD 자동 spawn (v2.43.66 동일)
//     - 진행 창에 "설치 중" 단계 메시지 추가 (사용자가 진행 상황 인지 가능)
// v2.43.72: 별도 process splash (HTA) — process A → B 전환 동안 시각 피드백 유지
//   사용자 보고 "NSIS UI 표시 안되" — NSIS UI 의존 포기, mshta.exe 별도 process로 splash 표시
//   HTA는 Windows 내장 mshta.exe로 실행 (별도 binary 불필요, 거의 모든 Windows 호환)
//   HTA process는 LEWORD.exe 가 아니라 mshta.exe — NSIS taskkill 영향 없음 → install 끝까지 유지
// v2.43.80: HTA spawn 성공 추적 — 실패 시 추가 fallback 결정
let externalSplashSpawned = false;
function launchExternalSplash(): boolean {
  externalSplashSpawned = false;
  try {
    // resources 폴더의 updater-splash.hta 경로 (extraResources 로 packaging)
    const htaPath = path.join(process.resourcesPath || '', 'updater-splash.hta');
    if (!fs.existsSync(htaPath)) {
      console.warn('[UPDATER] HTA splash 파일 없음:', htaPath);
      return false;
    }
    // mshta.exe 별도 process spawn — detached, stdio ignore
    const child = spawn('mshta.exe', [htaPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.unref(); // 메인 process 종료해도 mshta 살아있음
    externalSplashSpawned = true;
    console.log('[UPDATER] 외부 HTA splash 시작:', htaPath);
    return true;
  } catch (e: any) {
    console.warn('[UPDATER] HTA splash 시작 실패:', e?.message);
    return false;
  }
}

function performQuitAndInstall(autoUpdater: any): void {
  // v2.43.68: 진행창 닫는 시점 늦춤 — NSIS install 동안 사용자에게 계속 표시
  //   사용자 보고 "처음 업데이트 창이뜨고나서 바로떠야되는데 이거마저 좀있다가 뜨네"
  //   → 진행창이 NSIS 진행 동안 살아있어야 splash 와 끊김 최소화
  //   destroyAllWindowsForce 제거 — quitAndInstall 의 app.quit() 가 자동 처리
  //   ⚠️ installer.nsh customInit taskkill /F /T 가 LEWORD 프로세스 강제 종료하므로
  //      "cannot be closed" 다이얼로그 안 뜸

  // Puppeteer browserPool 등 자식 프로세스 강제 종료 (lock 잔존 차단)
  try {
    const { browserPool } = require('./utils/puppeteer-pool');
    void browserPool.destroy?.();
  } catch {}

  // v2.43.74: 수동 install 모드 — 사용자 보고 "nsis 창 띄워서 수동으로 하게끔"
  //   oneClick=false + isSilent=false → NSIS 위저드 표시
  //   사용자가 Welcome → Install Location → Install → Finish 단계 직접 클릭
  //   runAfterFinish=true 라 NSIS Finish 페이지의 "LEWORD 실행" 체크박스로 사용자가 실행
  //   isForceRunAfter=false: 자동 실행 X (사용자 클릭 위주)
  //   HTA splash 제거 (사용자가 NSIS 위저드 보면서 진행 → 별도 splash 불필요)
  // v2.43.78: 자동 모드 복귀 — 사용자 요청 "전처럼 자동업데이트 빠르고 안정적으로 바로 열려야"
  //   isSilent=true: NSIS UI 없이 빠른 install
  //   isForceRunAfter=true: NSIS 종료 직후 새 LEWORD spawn (이중 안전망 with installer.nsh ExecShell)
  //   FSM: VERIFYING → INSTALLING 전이로 race 차단
  if (!transitionState('INSTALLING')) {
    console.warn('[UPDATER] INSTALLING 전이 실패 — 이미 진행 중');
    return;
  }
  showInstallingState().then(() => {
    // v2.43.80: HTA splash 복원 + paint 시간 확보
    // v2.45.0 UPD4: HTA paint 동적 대기 (500ms로 단축, 저사양 1500ms 유지)
    //   사용자 보고 "nsis창이 너무 늦게 떠요" 대응
    //   HTA 자체에 setInterval(focus) 추가로 NSIS 뒤에 숨지 않음
    const htaOk = launchExternalSplash();
    if (!htaOk) {
      showInstallingFallbackMsg();
    }
    // 저사양 PC에선 HTA paint가 느릴 수 있어 더 긴 대기
    let waitMs = 500;
    try {
      const { EnvironmentManager } = require('./utils/environment-manager');
      if (EnvironmentManager.getInstance().isEffectiveLowSpec()) waitMs = 1500;
    } catch {}
    setTimeout(() => {
      // v2.45.0 UPD7: before-quit graceful cleanup 우회 플래그
      //   quitAndInstall 호출 직전에 설정 → before-quit 핸들러가 즉시 return
      //   chrome 좀비 정리는 cleanupChromeZombiesSync로 빠르게 인라인 처리
      (app as any).__skipGracefulCleanup = true;
      try {
        autoUpdater.quitAndInstall(true, true);
      } catch (e: any) {
        console.error('[UPDATER] quitAndInstall 실패:', e?.message);
        transitionState('ERROR');
        try { app.exit(0); } catch {}
      }
    }, 1500); // 300 → 1500ms (HTA paint 보장)
  });
}

async function showInstallingFallbackMsg(): Promise<void> {
  if (!progressWindow || progressWindow.isDestroyed()) return;
  try {
    await progressWindow.webContents.executeJavaScript(
      `(() => {
        const status = document.getElementById('status');
        if (status) status.textContent = '⚙️ 설치 시작 — 10~20초 후 자동으로 다시 열립니다';
      })();`
    );
  } catch {}
}

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
  // v2.43.67: splash 닫고 progress 창으로 이어받기 (시각 일관성)
  try {
    const { closeSplash } = require('./splash');
    closeSplash();
  } catch {}
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

async function showReadyState(version: string, _seconds: number): Promise<void> {
  if (!progressWindow || progressWindow.isDestroyed()) return;
  try {
    // v2.48.2: status 메시지만 업데이트, 버튼은 dialog로 (parent=progressWindow로 최상위 표시)
    await progressWindow.webContents.executeJavaScript(
      `(() => {
        const fg = document.getElementById('fg');
        const pct = document.getElementById('pct');
        const status = document.getElementById('status');
        const version = document.getElementById('version');
        if (fg) fg.setAttribute('stroke-dashoffset', '0');
        if (fg) fg.setAttribute('stroke', '#34d399');
        if (pct) pct.textContent = '✓';
        if (version) version.textContent = 'v${version} 다운로드 완료';
        if (status) status.textContent = '다운로드 완료 — 위 안내 창에서 설치를 선택해 주세요';
      })();`
    );
  } catch {}
}

// v2.43.67: 사용자에게 "NSIS 설치 중" 단계 명시 (silent NSIS 동안 빈 화면 방지)
// v2.43.70: 메시지를 splash 첫 메시지와 자연 연결 형태로
async function showInstallingState(): Promise<void> {
  if (!progressWindow || progressWindow.isDestroyed()) return;
  try {
    // v2.43.74: 수동 install — 사용자가 직접 NSIS 위저드 클릭 진행
    await progressWindow.webContents.executeJavaScript(
      `(() => {
        const status = document.getElementById('status');
        if (status) status.textContent = '⚙️ 설치 중... 잠시 후 LEWORD가 자동으로 다시 열립니다';
      })();`
    );
  } catch {}
}

// v2.43.73: 100% 도달 후 verifying / stuck 메시지
async function showVerifyingState(): Promise<void> {
  if (!progressWindow || progressWindow.isDestroyed()) return;
  try {
    await progressWindow.webContents.executeJavaScript(
      `(() => {
        const status = document.getElementById('status');
        const pct = document.getElementById('pct');
        if (status) status.textContent = '✓ 다운로드 완료 — 설치 준비 중...';
        if (pct) pct.textContent = '✓';
      })();`
    );
  } catch {}
}

async function showStuckWarningState(): Promise<void> {
  if (!progressWindow || progressWindow.isDestroyed()) return;
  try {
    // v2.43.77: 팀6 — 백신 스캔 정상 케이스 안내
    await progressWindow.webContents.executeJavaScript(
      `(() => {
        const status = document.getElementById('status');
        if (status) status.innerHTML = '⚠️ 검증 중 — 백신 스캔으로 2~5분 걸릴 수 있습니다. 3분 더 기다린 후 자동 재시도';
      })();`
    );
  } catch {}
}

// v2.43.77: 팀7 비평 — 실패 시 사용자 SOS 옵션 (수동 다운로드 + 로그 폴더)
async function showStuckRecoveryDialog(errorMsg: string): Promise<void> {
  try {
    const { dialog, shell } = require('electron');
    const path = require('path');
    const logPath = path.join(app.getPath('appData'), 'blogger-admin-panel');
    const result = await dialog.showMessageBox({
      type: 'error',
      title: 'LEWORD 업데이트 실패',
      message: '업데이트 자동 설치가 실패했습니다',
      detail: `사유: ${errorMsg}\n\n복구 옵션:\n1. 작업관리자에서 LEWORD.exe 종료 → 재실행 후 재시도\n2. GitHub에서 최신 .exe 직접 다운로드\n3. 로그 파일 확인 → 개발자에게 전달`,
      buttons: ['최신 버전 다운로드 페이지 열기', '로그 폴더 열기', '닫기'],
      defaultId: 0,
      cancelId: 2,
    });
    if (result.response === 0) {
      shell.openExternal('https://github.com/cd000242-sudo/leword-app/releases/latest');
    } else if (result.response === 1) {
      shell.openPath(logPath);
    }
  } catch (e: any) {
    console.error('[UPDATER] recovery dialog 실패:', e?.message);
  }
  setTimeout(() => closeProgressWindow(), 1000);
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
  console.log(`[UPDATER] installer protocol v${CURRENT_INSTALLER_PROTOCOL}`);
  // v2.43.77: 팀1+8 비평 — electron-log 파일 저장으로 packaged app 사용자 환경 추적
  try {
    const log = require('electron-log');
    log.transports.file.level = 'info';
    log.transports.file.resolvePathFn = () => {
      const p = require('path').join(app.getPath('appData'), 'blogger-admin-panel', 'updater.log');
      return p;
    };
    log.transports.file.maxSize = 5 * 1024 * 1024; // 5MB rotation
    // v2.45.0 EXTRA4: maxFile 명시 — 무한 증식 방지 (5MB × 5 = 25MB 상한)
    if (log.transports.file.archiveLog) {
      // electron-log 6+ 자동 rotation 지원
    }
    if (typeof log.transports.file.maxFiles !== 'undefined') {
      log.transports.file.maxFiles = 5;
    }
    autoUpdater.logger = log;
  } catch (e: any) {
    console.warn('[UPDATER] electron-log 로드 실패, console fallback:', e?.message);
    autoUpdater.logger = {
      info: (...a: any[]) => console.log('[UPDATER]', ...a),
      warn: (...a: any[]) => console.warn('[UPDATER]', ...a),
      error: (...a: any[]) => console.error('[UPDATER]', ...a),
      debug: (..._a: any[]) => {},
    };
  }

  // 이벤트 리스너 6종
  autoUpdater.on('checking-for-update', () => {
    console.log('[UPDATER] 업데이트 확인 중...');
    broadcastEvent('checking', {});
  });

  autoUpdater.on('update-available', (info: any) => {
    console.log('[UPDATER] 업데이트 발견:', info?.version);
    isUpdatingFlag = true;
    lastUpdateInfo.version = info?.version;
    // FSM: IDLE → CHECKING → DOWNLOADING
    transitionState('CHECKING');
    transitionState('DOWNLOADING');
    showProgressWindow(info?.version ?? '');
    broadcastEvent('available', { version: info?.version });
    signalUpdateCheck(true);
    try {
      autoUpdater.downloadUpdate();
    } catch (err: any) {
      console.error('[UPDATER] downloadUpdate 호출 실패:', err?.message ?? err);
      transitionState('ERROR');
    }
  });

  autoUpdater.on('update-not-available', (info: any) => {
    console.log('[UPDATER] 최신 버전입니다. 현재=', info?.version);
    broadcastEvent('not-available', { version: info?.version });
    signalUpdateCheck(false);
  });

  // v2.43.73: 100% 도달 후 update-downloaded 이벤트 stuck 보호
  //   사용자 보고: 진행창 "다운로드 중... 100%" 멈춤 → 새 LEWORD 안 뜸
  //   원인 추정: electron-updater verifying / unpacking 단계 stuck (SHA512 / blockmap 검증 실패)
  let downloadHit100 = false;
  let stuckCheckTimer: NodeJS.Timeout | null = null;

  autoUpdater.on('download-progress', (progress: any) => {
    const pct = Math.round(progress?.percent ?? 0);
    console.log(`[UPDATER] 다운로드: ${pct}%`);
    updateProgress(pct);
    broadcastEvent('progress', { percent: pct });

    // v2.43.77: 팀6 비평 — 30s/60s timeout 너무 보수적 (백신 스캔 2-5분 정상)
    //   120s 안내 + 300s force install + 매뉴얼 다운로드 옵션
    if (pct >= 100 && !downloadHit100) {
      downloadHit100 = true;
      // FSM: DOWNLOADING → VERIFYING
      transitionState('VERIFYING');
      showVerifyingState();
      stuckCheckTimer = setTimeout(() => {
        showStuckWarningState();
        stuckCheckTimer = setTimeout(() => {
          console.error('[UPDATER] update-downloaded 5분 미발생 → 강제 quitAndInstall 시도');
          if (!restartScheduled) {
            restartScheduled = true;
            try { performQuitAndInstall(autoUpdater); } catch (e: any) {
              console.error('[UPDATER] 강제 install 실패:', e?.message);
              showStuckRecoveryDialog(e?.message || '검증 실패');
            }
          }
        }, 180000); // +3분 = 총 5분
      }, 120000); // 2분
    }
  });

  autoUpdater.on('update-downloaded', (info: any) => {
    console.log('[UPDATER] 다운로드 완료:', info?.version);
    broadcastEvent('downloaded', { version: info?.version });
    if (stuckCheckTimer) { clearTimeout(stuckCheckTimer); stuckCheckTimer = null; }

    // v2.48.2: dialog 복원 + parent=progressWindow 지정 (사용자 의도 정확 반영)
    //   사용자 보고: "dialog를 progressWindow보다 앞으로 오게 해주세요"
    //   v2.48.1에서 잘못 제거 → v2.48.2에서 복원
    //   해결: dialog의 parent를 progressWindow로 → modal dialog → parent 위에 자동 표시
    showReadyState(info?.version, 0).catch(() => {});

    const { dialog: dlg } = require('electron');
    // parent 지정: progressWindow가 alwaysOnTop이라 dialog도 최상위
    const dialogOpts: any = {
      type: 'info',
      title: 'LEWORD 업데이트 준비됨',
      message: `새 버전 v${info?.version} 다운로드 완료`,
      detail: '지금 설치하면 5~15초 안에 새 버전이 시작됩니다.\n나중에 선택 시 LEWORD 종료할 때까지 작업 계속 가능하며, 다음 시작 시 다시 안내됩니다.',
      buttons: ['지금 설치 (권장)', '나중에'],
      defaultId: 0,
      cancelId: 1,
    };

    const showDialogWithParent = () => {
      // progressWindow가 살아있으면 parent로 지정 → modal → parent 위에 표시
      const parent = (progressWindow && !progressWindow.isDestroyed()) ? progressWindow : undefined;
      const dialogPromise = parent
        ? dlg.showMessageBox(parent, dialogOpts)
        : dlg.showMessageBox(dialogOpts);

      dialogPromise.then((result: any) => {
        if (result.response === 0) {
          if (restartScheduled) return;
          restartScheduled = true;
          performQuitAndInstall(autoUpdater);
        } else {
          console.log('[UPDATER] 사용자 "나중에" 선택');
          closeProgressWindow();
          try {
            for (const win of hideableWindows) {
              if (win && !win.isDestroyed()) {
                try { win.show(); } catch {}
              }
            }
          } catch {}
        }
      });
    };

    showDialogWithParent();
  });

  autoUpdater.on('error', (err: any) => {
    console.error('[UPDATER] 에러:', err?.message ?? err);
    isUpdatingFlag = false;
    transitionState('ERROR');
    // v2.43.78: stuck timer 정리 (좀비 timer 차단)
    if (stuckCheckTimer) { clearTimeout(stuckCheckTimer); stuckCheckTimer = null; }
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
      setTimeout(() => performQuitAndInstall(autoUpdater), 200);
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
