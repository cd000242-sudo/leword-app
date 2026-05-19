/**
 * v2.43.70: splash 디자인 — progressWindow 와 완전 동일화 (끊김 체감 최소화)
 *
 * 사용자 보고: progressWindow 닫힘 → 빈 시간 → splash 표시
 * 해결: 두 창의 디자인/크기/색상/구조 동일화 + 첫 메시지 자연 연결
 *       사용자가 두 창의 전환을 "동일한 창의 메시지 변경"으로 인지하게
 */

import { app, BrowserWindow } from 'electron';
import { spawn } from 'child_process';

let splashWin: BrowserWindow | null = null;

// v2.43.72: 외부 HTA splash 종료 (이전 process가 띄운 mshta)
//   새 LEWORD splash 뜨는 시점에 HTA 닫아서 두 splash 동시 표시 방지
function killExternalSplashIfAny(): void {
  if (process.platform !== 'win32') return;
  try {
    const p = spawn('taskkill', ['/F', '/IM', 'mshta.exe'], { stdio: 'ignore', windowsHide: true });
    p.unref();
  } catch {}
}

function buildSplashHtml(initialStage: string, version: string): string {
  // v2.43.70: progressWindow (updater.ts) 와 완전 동일 디자인 — 깜빡임 인지 최소화
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>LEWORD</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:100%; height:100%; background:#0f0f23; font-family:'Noto Sans KR',sans-serif; color:#fff; overflow:hidden; }
  body { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:18px; padding:24px; -webkit-app-region:drag; }
  .title { font-size:16px; font-weight:600; letter-spacing:.3px; color:#fbbf24; }
  .version { font-size:12px; color:rgba(255,255,255,.55); }
  .ring { position:relative; width:110px; height:110px; }
  .ring svg { transform:rotate(-90deg); width:100%; height:100%; animation:rot 2s linear infinite; }
  @keyframes rot { from { transform:rotate(-90deg); } to { transform:rotate(270deg); } }
  .ring circle { fill:none; stroke-width:8; }
  .bg { stroke:rgba(255,255,255,.08); }
  .fg { stroke:url(#grad); stroke-linecap:round; stroke-dasharray:263.89; stroke-dashoffset:200; }
  .pct { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:22px; font-weight:700; color:#34d399; }
  .status { font-size:12px; color:rgba(255,255,255,.6); min-height:16px; text-align:center; }
</style></head>
<body>
  <div class="title">LEWORD 업데이트</div>
  <div class="version">v${version} 적용됨</div>
  <div class="ring">
    <svg viewBox="0 0 100 100">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#fbbf24"/>
          <stop offset="100%" stop-color="#f59e0b"/>
        </linearGradient>
      </defs>
      <circle class="bg" cx="50" cy="50" r="42"/>
      <circle class="fg" cx="50" cy="50" r="42"/>
    </svg>
    <div class="pct">✓</div>
  </div>
  <div class="status" id="status">${initialStage}</div>
</body></html>`;
}

export function showSplash(initialStage = 'LEWORD 시작 중...'): void {
  if (splashWin && !splashWin.isDestroyed()) return;
  splashWin = new BrowserWindow({
    width: 420,
    height: 300,
    resizable: false,
    frame: false,
    transparent: false,
    backgroundColor: '#0f0f23',  // 즉시 표시 (loadURL 전에 검은 화면 차단)
    alwaysOnTop: true,
    skipTaskbar: false,
    center: true,
    paintWhenInitiallyHidden: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  const html = buildSplashHtml(initialStage, app.getVersion());
  splashWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  // v2.43.72: 이전 process의 외부 HTA splash 종료 (자연스러운 전환)
  //   electron splash 가 alwaysOnTop=true 라 시각적으로는 즉시 가려지고,
  //   100ms 후 taskkill 로 HTA process 정리
  setTimeout(killExternalSplashIfAny, 100);
}

export async function updateSplashStage(stage: string, _sub?: string): Promise<void> {
  if (!splashWin || splashWin.isDestroyed()) return;
  try {
    await splashWin.webContents.executeJavaScript(
      `(() => {
        const s = document.getElementById('status');
        if (s) s.textContent = ${JSON.stringify(stage)};
      })();`
    );
  } catch {}
}

export function closeSplash(): void {
  if (splashWin && !splashWin.isDestroyed()) {
    try { splashWin.close(); } catch {}
  }
  splashWin = null;
}

export function hideSplash(): void {
  if (splashWin && !splashWin.isDestroyed()) {
    try { splashWin.hide(); } catch {}
  }
}

export function showSplashAgain(): void {
  if (splashWin && !splashWin.isDestroyed()) {
    try { splashWin.show(); } catch {}
  }
}

export function isSplashVisible(): boolean {
  return !!splashWin && !splashWin.isDestroyed();
}
