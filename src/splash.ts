/**
 * v2.43.67: 앱 시작 splash 창 — 사용자 보고 "초반에 뜨고 사라졌다가 한참있다 앱이뜨니까 반발이심해요"
 *
 * 흐름:
 *   1. app.whenReady() 직후 splash 즉시 표시
 *   2. 단계별 메시지 업데이트 (시스템 확인 / 인증 / 환경 / 메인창 준비)
 *   3. keywordWindow.ready-to-show 시점에 splash close + 메인창 show
 *
 * 디자인: updater.ts 진행창과 동일 디자인 (사용자에게 일관성)
 */

import { app, BrowserWindow } from 'electron';

let splashWin: BrowserWindow | null = null;

function buildSplashHtml(initialStage: string, version: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>LEWORD 시작 중</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:100%; height:100%; background:#0f0f23; font-family:'Noto Sans KR',sans-serif; color:#fff; overflow:hidden; }
  body { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px; padding:24px; -webkit-app-region:drag; }
  .title { font-size:18px; font-weight:700; letter-spacing:.5px; color:#fbbf24; }
  .version { font-size:12px; color:rgba(255,255,255,.55); }
  .ring { position:relative; width:80px; height:80px; margin: 4px 0; }
  .spin { width:100%; height:100%; border:6px solid rgba(255,255,255,0.08); border-top:6px solid #fbbf24; border-radius:50%; animation:spin 1s linear infinite; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  .stage { font-size:13px; color:rgba(255,255,255,.92); min-height:18px; text-align:center; font-weight:600; }
  .sub { font-size:11px; color:rgba(255,255,255,.45); text-align:center; line-height:1.5; max-width:340px; }
</style></head>
<body>
  <div class="title">LEWORD</div>
  <div class="version">v${version}</div>
  <div class="ring"><div class="spin"></div></div>
  <div class="stage" id="stage">${initialStage}</div>
  <div class="sub" id="sub">최초 시작 시 라이선스 인증 + 환경 로드까지 5~15초 소요</div>
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
    backgroundColor: '#0f0f23',
    alwaysOnTop: true,
    skipTaskbar: false,
    center: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  const html = buildSplashHtml(initialStage, app.getVersion());
  splashWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

export async function updateSplashStage(stage: string, sub?: string): Promise<void> {
  if (!splashWin || splashWin.isDestroyed()) return;
  try {
    await splashWin.webContents.executeJavaScript(
      `(() => {
        const s = document.getElementById('stage');
        if (s) s.textContent = ${JSON.stringify(stage)};
        ${sub !== undefined ? `const ss = document.getElementById('sub'); if (ss) ss.textContent = ${JSON.stringify(sub)};` : ''}
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
