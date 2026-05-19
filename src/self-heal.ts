/**
 * v2.43.81: Self-Heal — pending 업데이트 자동 install
 *
 * 사용자 보고: "기존 자동업데이트로 최신파일로 업데이트되게 해달라"
 *
 * 원인: v2.43.73 코드의 quitAndInstall → NSIS install 실패 케이스에서
 *      pending/.exe 그대로 남아있는데 사용자가 LEWORD 재시작해도 같은 실패 반복
 *
 * 해결: LEWORD 시작 시 pending 폴더 검사 → 새 .exe 있으면 자동 install
 *      + RunOnce 키 등록으로 다음 부팅 시 pending exe 자동 실행 보장
 */

import { app, dialog } from 'electron';
import { spawn, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const PENDING_DIR = path.join(
  process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local'),
  'leword-updater',
  'pending'
);

function parseVersionFromExeName(filename: string): string | null {
  const m = filename.match(/LEWORD-(\d+\.\d+\.\d+)\.exe$/i);
  return m ? m[1] : null;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10));
  const pb = b.split('.').map(n => parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

interface PendingUpdate {
  version: string;
  exePath: string;
  sizeBytes: number;
}

function detectPendingUpdate(): PendingUpdate | null {
  try {
    if (!fs.existsSync(PENDING_DIR)) return null;
    const files = fs.readdirSync(PENDING_DIR).filter(f => /^LEWORD-.*\.exe$/i.test(f));
    if (files.length === 0) return null;

    // 가장 높은 버전 선택
    const candidates: PendingUpdate[] = [];
    for (const f of files) {
      const v = parseVersionFromExeName(f);
      if (!v) continue;
      const exePath = path.join(PENDING_DIR, f);
      const stat = fs.statSync(exePath);
      candidates.push({ version: v, exePath, sizeBytes: stat.size });
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => compareVersions(b.version, a.version));
    return candidates[0];
  } catch (e: any) {
    console.warn('[SELF-HEAL] pending 검사 실패:', e?.message);
    return null;
  }
}

/**
 * LEWORD 시작 시 pending 업데이트 자동 감지 + 사용자 confirm 후 install
 * 호출 시점: app.whenReady 진입 직후, splash 표시 후, 메인창 생성 전
 */
export async function checkAndApplyPendingUpdate(currentVersion: string): Promise<boolean> {
  const pending = detectPendingUpdate();
  if (!pending) return false;

  // 현재 버전보다 높은 pending 만 install
  if (compareVersions(pending.version, currentVersion) <= 0) {
    console.log(`[SELF-HEAL] pending ${pending.version} ≤ 현재 ${currentVersion} — skip`);
    return false;
  }

  console.log(`[SELF-HEAL] pending 업데이트 발견: v${pending.version} (현재 v${currentVersion})`);

  try {
    const result = await dialog.showMessageBox({
      type: 'info',
      title: 'LEWORD 업데이트 준비됨',
      message: `새 버전 v${pending.version} 이 다운로드되어 있습니다`,
      detail: '지금 설치하면 5~15초 안에 새 버전이 시작됩니다.\n\n나중에를 선택해도 LEWORD는 정상 작동하며, 다음 시작 시 다시 안내됩니다.',
      buttons: ['지금 설치 (권장)', '나중에'],
      defaultId: 0,
      cancelId: 1,
    });

    if (result.response === 0) {
      // pending exe 실행 — oneClick=true 라 자동 install + 자동 실행
      console.log(`[SELF-HEAL] pending exe 실행: ${pending.exePath}`);
      try {
        const child = spawn(pending.exePath, [], {
          detached: true,
          stdio: 'ignore',
          windowsHide: false,
        });
        child.unref();
        // 1.5초 대기 (NSIS process 시작 보장) → LEWORD 종료
        setTimeout(() => {
          console.log('[SELF-HEAL] 현재 LEWORD 종료 (NSIS install 완료 대기)');
          app.exit(0);
        }, 1500);
        return true;
      } catch (e: any) {
        console.error('[SELF-HEAL] pending exe 실행 실패:', e?.message);
        // 실행 실패 시 사용자에게 수동 안내
        await dialog.showMessageBox({
          type: 'error',
          title: '자동 설치 실패',
          message: '수동 설치가 필요합니다',
          detail: `다음 파일을 더블클릭하세요:\n\n${pending.exePath}`,
          buttons: ['확인'],
        });
      }
    }
  } catch (e: any) {
    console.warn('[SELF-HEAL] 처리 실패:', e?.message);
  }
  return false;
}

/**
 * RunOnce 키 등록 — 다음 부팅 시 1회 pending exe 실행
 * before-quit / 비정상 종료 케이스에서 안전망
 */
export function registerRunOncePendingUpdate(): void {
  try {
    const pending = detectPendingUpdate();
    if (!pending) {
      // pending 없으면 기존 RunOnce 키 정리 (안전)
      try {
        execSync('reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce" /v "LEWORD-Update" /f', { stdio: 'ignore' });
      } catch {}
      return;
    }
    // 다음 부팅 시 1회만 실행되는 RunOnce
    const cmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce" /v "LEWORD-Update" /t REG_SZ /d "\\"${pending.exePath}\\"" /f`;
    execSync(cmd, { stdio: 'ignore' });
    console.log(`[SELF-HEAL] RunOnce 등록: v${pending.version} (다음 부팅 시 자동 실행)`);
  } catch (e: any) {
    console.warn('[SELF-HEAL] RunOnce 등록 실패:', e?.message);
  }
}
