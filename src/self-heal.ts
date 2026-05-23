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
 * v2.47.3: GitHub latest 버전 조회 (pending 무효화 판정용)
 *   pending이 latest보다 낮으면 pending 삭제 → autoUpdater가 latest 다운로드
 *   네트워크 실패 시 null 반환 → 기존 동작 fallback
 */
async function fetchLatestVersionFromGitHub(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch('https://api.github.com/repos/cd000242-sudo/leword-app/releases/latest', {
      signal: controller.signal,
      headers: { 'User-Agent': 'LEWORD-self-heal' },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json() as { tag_name?: string };
    const tag = String(data.tag_name || '').replace(/^v/, '');
    return /^\d+\.\d+\.\d+$/.test(tag) ? tag : null;
  } catch {
    return null;
  }
}

/**
 * v2.47.3: pending 폴더의 모든 .exe 삭제
 *   옛 pending으로 묶이는 사용자 자동 복구용
 */
function purgePendingFolder(): number {
  try {
    if (!fs.existsSync(PENDING_DIR)) return 0;
    const files = fs.readdirSync(PENDING_DIR).filter(f => /^LEWORD-.*\.exe(\.blockmap)?$/i.test(f));
    let removed = 0;
    for (const f of files) {
      try {
        fs.unlinkSync(path.join(PENDING_DIR, f));
        removed++;
      } catch {}
    }
    return removed;
  } catch {
    return 0;
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

  // v2.47.3: pending이 GitHub latest보다 낮으면 무효화 (autoUpdater에 위임)
  //   사용자 보고: "지금 설치 눌러도 안 뜸" — 옛 pending v2.44.1의 NSIS installer가
  //   chrome 좀비 정리 코드 없어서 file lock 충돌로 hang
  //   해결: latest와 비교 → outdated면 pending 삭제 → autoUpdater가 latest 다운로드
  try {
    const latestVersion = await fetchLatestVersionFromGitHub();
    if (latestVersion && compareVersions(pending.version, latestVersion) < 0) {
      console.log(`[SELF-HEAL] ⚠️ pending v${pending.version} < latest v${latestVersion} — 무효화 (autoUpdater에 위임)`);
      const removed = purgePendingFolder();
      console.log(`[SELF-HEAL] pending 폴더 ${removed}개 파일 삭제 완료`);
      return false; // autoUpdater가 latest 다운로드하도록
    }
  } catch (e: any) {
    console.warn('[SELF-HEAL] latest 비교 실패 (무시, 기존 동작 계속):', e?.message);
  }

  // v2.47.4: dialog 제거 → 자동 silent install
  //   사용자 보고: "dialog X 닫고 그냥 두니까 자동 업데이트가 잘 되더라. dialog 안 뜨게 해줘"
  //   원인: dialog가 사용자에게 부담만 주고, 어차피 사용자 대부분 X로 닫음 →
  //         autoUpdater의 autoInstallOnAppQuit가 처리 → 그러면 dialog 자체가 무용
  //   해결: dialog 제거 + splash 메시지로 "업데이트 적용 중..." 알림 + 자동 install
  //         시작 시점이라 사용자 작업 없음 → 데이터 손실 위험 없음
  try {
    const { updateSplashStage } = require('./splash');
    await updateSplashStage(`✨ 업데이트 v${pending.version} 적용 중... (10~15초)`);
  } catch {}

  // pending exe 자동 실행 (oneClick=true NSIS → 자동 install + 자동 실행)
  console.log(`[SELF-HEAL] 🚀 자동 install 시작: ${pending.exePath}`);
  try {
    const child = spawn(pending.exePath, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.unref();
    // 1.5초 대기 (NSIS process 시작 보장) → LEWORD 종료
    setTimeout(() => {
      console.log('[SELF-HEAL] 현재 LEWORD 종료 (NSIS install 진행 중)');
      app.exit(0);
    }, 1500);
    return true;
  } catch (e: any) {
    console.error('[SELF-HEAL] pending exe 실행 실패:', e?.message);
    // 실행 실패 시에만 dialog (마지막 안전망)
    try {
      await dialog.showMessageBox({
        type: 'error',
        title: '자동 설치 실패',
        message: '수동 설치가 필요합니다',
        detail: `다음 파일을 더블클릭하세요:\n\n${pending.exePath}`,
        buttons: ['확인'],
      });
    } catch {}
  }
  return false;
}

/**
 * v2.43.82: 수동 업데이트 트리거 — 트레이 메뉴에서 호출
 *   1) pending 폴더 검사 → 새 버전 있으면 즉시 install
 *   2) 없으면 electron-updater 의 checkForUpdates 호출
 *   3) 결과를 사용자에게 안내
 */
export async function triggerManualUpdate(currentVersion: string): Promise<{ installing: boolean; message?: string }> {
  // 1. pending 폴더 검사
  const pending = detectPendingUpdate();
  if (pending && compareVersions(pending.version, currentVersion) > 0) {
    console.log(`[SELF-HEAL] 수동 트리거: pending v${pending.version} install 시작`);
    try {
      const child = spawn(pending.exePath, [], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
      child.unref();
      setTimeout(() => {
        console.log('[SELF-HEAL] 수동 install — LEWORD 종료');
        app.exit(0);
      }, 1500);
      return { installing: true };
    } catch (e: any) {
      return { installing: false, message: `pending exe 실행 실패: ${e?.message}\n\n수동 실행: ${pending.exePath}` };
    }
  }

  // 2. pending 없으면 electron-updater 체크
  try {
    const autoUpdater = require('electron-updater').autoUpdater;
    const result = await autoUpdater.checkForUpdates();
    if (result?.updateInfo?.version && compareVersions(result.updateInfo.version, currentVersion) > 0) {
      // 새 버전 발견 → downloadUpdate (자동으로 update-available 핸들러 동작)
      return { installing: false, message: `새 버전 v${result.updateInfo.version} 발견 — 다운로드 진행 중\n잠시 후 진행 창이 표시됩니다` };
    }
    return { installing: false, message: `현재 v${currentVersion} 가 최신 버전입니다` };
  } catch (e: any) {
    return { installing: false, message: `업데이트 확인 실패: ${e?.message}` };
  }
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
