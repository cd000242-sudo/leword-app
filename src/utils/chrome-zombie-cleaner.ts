/**
 * v2.44.2: 좀비 chrome.exe 정리 모듈
 *
 * 문제: LEWORD가 띄운 chrome.exe(Puppeteer 자식)가 graceful destroy 실패 시 좀비로 누적.
 *      사용자 보고 "앱 열면 chrome.exe가 12개씩 쌓여있음" → CPU/RAM 폭주.
 *
 * 해결: 시작 직후 + 종료 직전에 LEWORD 번들 경로 chrome.exe 식별하여 강제 종료.
 *      사용자의 일반 Chrome은 건드리지 않음 (ExecutablePath 매칭).
 *
 * Windows 전용 (한국 사용자 100% Windows). macOS/Linux는 no-op.
 */

import { exec } from 'child_process';
import * as path from 'path';

/**
 * 좀비 chrome.exe 정리
 *   - LEWORD 또는 leword 경로 + chromium 폴더의 chrome.exe만 식별
 *   - PowerShell Get-Process로 실행 파일 경로 매칭
 *   - 사용자 일반 Chrome(C:\Program Files\Google\Chrome\...) 건드리지 않음
 *
 * @param timeoutMs 최대 대기 (기본 5초)
 * @returns 정리된 PID 수 (0 또는 N)
 */
export async function cleanupChromeZombies(timeoutMs: number = 5000): Promise<number> {
  if (process.platform !== 'win32') {
    return 0;
  }

  // PowerShell 한 줄로 LEWORD chromium 경로 chrome.exe 모두 종료
  //   조건: $_.Path -like '*leword*chromium*' (대소문자 무관)
  //   -ErrorAction SilentlyContinue: chrome.exe 0개여도 에러 없음
  //   결과: 종료된 프로세스 수를 stdout으로 출력
  //   주의: PowerShell statement 구분은 줄바꿈 또는 ; — 한 줄로 합칠 때 ; 필수
  const psScript = `$procs = Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.Path -and ($_.Path -like '*leword*chromium*' -or $_.Path -like '*LEWORD*chromium*') }; if ($procs) { $count = $procs.Count; $procs | Stop-Process -Force -ErrorAction SilentlyContinue; Write-Output $count } else { Write-Output 0 }`;

  return new Promise<number>((resolve) => {
    const child = exec(
      `powershell -NoProfile -NonInteractive -Command "${psScript.replace(/"/g, '\\"')}"`,
      { timeout: timeoutMs, windowsHide: true },
      (err, stdout) => {
        if (err) {
          console.warn('[CHROME-ZOMBIE] 정리 실패 (무시 가능):', err.message);
          resolve(0);
          return;
        }
        const n = parseInt(String(stdout || '').trim(), 10) || 0;
        if (n > 0) {
          console.log(`[CHROME-ZOMBIE] ✅ ${n}개 좀비 chrome.exe 정리 완료`);
        }
        resolve(n);
      }
    );
    // 추가 안전망 — exec timeout이 실패하면 강제 kill
    setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* 무시 */ }
    }, timeoutMs + 1000);
  });
}

/**
 * 동기 버전 (before-quit 같은 짧은 시점에만 — 메인 스레드 차단)
 */
export function cleanupChromeZombiesSync(timeoutMs: number = 3000): number {
  if (process.platform !== 'win32') return 0;
  const psScript = `$procs = Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.Path -and ($_.Path -like '*leword*chromium*' -or $_.Path -like '*LEWORD*chromium*') }; if ($procs) { $count = $procs.Count; $procs | Stop-Process -Force -ErrorAction SilentlyContinue; Write-Output $count } else { Write-Output 0 }`;
  try {
    const { execSync } = require('child_process');
    const out = execSync(
      `powershell -NoProfile -NonInteractive -Command "${psScript.replace(/"/g, '\\"')}"`,
      { timeout: timeoutMs, windowsHide: true, encoding: 'utf8' }
    );
    const n = parseInt(String(out || '').trim(), 10) || 0;
    if (n > 0) {
      console.log(`[CHROME-ZOMBIE] ✅ ${n}개 좀비 chrome.exe 정리 (sync)`);
    }
    return n;
  } catch (e: any) {
    console.warn('[CHROME-ZOMBIE] sync 정리 실패 (무시):', e?.message);
    return 0;
  }
}
