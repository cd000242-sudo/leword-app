/**
 * Pending update guard.
 *
 * Older builds tried to be helpful by running downloaded NSIS installers on
 * startup and registering a RunOnce entry for the next Windows login. That made
 * updates feel unpredictable: the app or installer could appear when the user
 * had not explicitly asked for it. This module now keeps the recovery helpers,
 * but automatic installer execution is disabled.
 */

import { app } from 'electron';
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

    const candidates: PendingUpdate[] = [];
    for (const f of files) {
      const version = parseVersionFromExeName(f);
      if (!version) continue;
      const exePath = path.join(PENDING_DIR, f);
      const stat = fs.statSync(exePath);
      candidates.push({ version, exePath, sizeBytes: stat.size });
    }
    candidates.sort((a, b) => compareVersions(b.version, a.version));
    return candidates[0] || null;
  } catch (e: any) {
    console.warn('[SELF-HEAL] pending scan failed:', e?.message);
    return null;
  }
}

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
 * Startup recovery check.
 *
 * Returns true only when this function intentionally takes over app lifecycle.
 * It no longer launches installers automatically.
 */
export async function checkAndApplyPendingUpdate(currentVersion: string): Promise<boolean> {
  const pending = detectPendingUpdate();
  if (!pending) return false;

  if (compareVersions(pending.version, currentVersion) <= 0) {
    console.log(`[SELF-HEAL] pending v${pending.version} <= current v${currentVersion}; skipped`);
    return false;
  }

  try {
    const latestVersion = await fetchLatestVersionFromGitHub();
    if (latestVersion && compareVersions(pending.version, latestVersion) < 0) {
      const removed = purgePendingFolder();
      console.log(`[SELF-HEAL] removed outdated pending v${pending.version}; latest is v${latestVersion}; files=${removed}`);
      return false;
    }
  } catch (e: any) {
    console.warn('[SELF-HEAL] latest comparison failed:', e?.message);
  }

  console.log(`[SELF-HEAL] pending update v${pending.version} found, but auto install is disabled: ${pending.exePath}`);
  return false;
}

/**
 * Manual update trigger from tray/menu/UI.
 */
export async function triggerManualUpdate(currentVersion: string): Promise<{ installing: boolean; message?: string }> {
  const pending = detectPendingUpdate();
  if (pending && compareVersions(pending.version, currentVersion) > 0) {
    console.log(`[SELF-HEAL] manual install requested for pending v${pending.version}`);
    try {
      const child = spawn(pending.exePath, [], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
      child.unref();
      setTimeout(() => {
        console.log('[SELF-HEAL] exiting LEWORD for manual installer');
        app.exit(0);
      }, 1500).unref?.();
      return { installing: true };
    } catch (e: any) {
      return { installing: false, message: `pending exe 실행 실패: ${e?.message}\n\n수동 실행: ${pending.exePath}` };
    }
  }

  try {
    const autoUpdater = require('electron-updater').autoUpdater;
    const result = await autoUpdater.checkForUpdates();
    if (result?.updateInfo?.version && compareVersions(result.updateInfo.version, currentVersion) > 0) {
      return { installing: false, message: `새 버전 v${result.updateInfo.version} 발견 — 다운로드 진행 중\n잠시 후 진행 창이 표시됩니다` };
    }
    return { installing: false, message: `현재 v${currentVersion}가 최신 버전입니다` };
  } catch (e: any) {
    return { installing: false, message: `업데이트 확인 실패: ${e?.message}` };
  }
}

/**
 * Previous builds registered HKCU RunOnce. Keep this function as a cleanup hook,
 * but never add a new auto-start installer entry.
 */
export function registerRunOncePendingUpdate(): void {
  try {
    try {
      execSync('reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce" /v "LEWORD-Update" /f', { stdio: 'ignore' });
    } catch {}
    console.log('[SELF-HEAL] RunOnce auto-update entry disabled/cleaned');
  } catch (e: any) {
    console.warn('[SELF-HEAL] RunOnce cleanup failed:', e?.message);
  }
}
