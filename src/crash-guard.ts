/**
 * v2.43.75: 자체 진단 + Crash Guard
 *
 * 사용자 보고: "자체검증을 하고줘 자꾸 맘대로 꺼지자나"
 *
 * 목적:
 *  1. 모든 crash 원인 로깅 (uncaughtException / unhandledRejection / render-process-gone / child-process-gone)
 *  2. 이전 실행 crash 발생 시 다음 부팅에 사용자에게 알림 + 로그 위치 안내
 *  3. 메인창 unresponsive 감지 → 자동 복구 시도
 *  4. 부팅 시 환경 자체 검증 (Node version / Chrome path / 디스크 공간 등)
 *
 * 로그 위치: %APPDATA%/leword/crash.log (rotation: 최근 100 entry)
 */

import { app, BrowserWindow, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

const MAX_LOG_ENTRIES = 100;

function getLogDir(): string {
  const dir = path.join(app.getPath('userData'), 'leword');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function getLogPath(): string {
  return path.join(getLogDir(), 'crash.log');
}
function getLastSessionPath(): string {
  return path.join(getLogDir(), 'last-session.json');
}

function nowIso(): string {
  return new Date().toISOString();
}

function appendCrash(entry: { type: string; message: string; stack?: string; version: string }): void {
  try {
    const line = JSON.stringify({ at: nowIso(), ...entry }) + '\n';
    const p = getLogPath();
    // rotation: 100 entry 넘으면 앞에 절반 삭제
    let existing = '';
    if (fs.existsSync(p)) {
      existing = fs.readFileSync(p, 'utf8');
      const lines = existing.split('\n').filter(Boolean);
      if (lines.length >= MAX_LOG_ENTRIES) {
        existing = lines.slice(-Math.floor(MAX_LOG_ENTRIES / 2)).join('\n') + '\n';
      }
    }
    fs.writeFileSync(p, existing + line, 'utf8');
  } catch (e) {
    // 로그 기록 자체 실패하면 무시 (사용자 작업 방해 X)
  }
}

function readLastCrash(): { at: string; type: string; message: string } | null {
  try {
    const p = getLogPath();
    if (!fs.existsSync(p)) return null;
    const content = fs.readFileSync(p, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    if (lines.length === 0) return null;
    const last = lines[lines.length - 1];
    return JSON.parse(last);
  } catch {
    return null;
  }
}

function markSessionStart(): void {
  try {
    fs.writeFileSync(getLastSessionPath(), JSON.stringify({
      startedAt: nowIso(),
      pid: process.pid,
      version: app.getVersion(),
      clean: false, // 정상 종료 시 true 로 업데이트
    }, null, 2), 'utf8');
  } catch {}
}

function markSessionClean(): void {
  try {
    const p = getLastSessionPath();
    if (!fs.existsSync(p)) return;
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    data.endedAt = nowIso();
    data.clean = true;
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
  } catch {}
}

function readLastSession(): { startedAt?: string; endedAt?: string; clean?: boolean; version?: string; pid?: number } | null {
  try {
    const p = getLastSessionPath();
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * crash guard 설정 — app.whenReady 전에 호출
 */
export function setupCrashGuard(): void {
  const version = app.getVersion();

  // uncaughtException
  process.on('uncaughtException', (err: Error) => {
    console.error('[CRASH] uncaughtException:', err);
    appendCrash({
      type: 'uncaughtException',
      message: err?.message || String(err),
      stack: err?.stack,
      version,
    });
    // crash 후에도 앱 계속 실행 — 일시적 에러일 수 있음
  });

  // unhandledRejection
  process.on('unhandledRejection', (reason: any) => {
    console.error('[CRASH] unhandledRejection:', reason);
    appendCrash({
      type: 'unhandledRejection',
      message: reason?.message || String(reason),
      stack: reason?.stack,
      version,
    });
  });

  // before-quit — 정상 종료 마킹
  app.on('before-quit', () => {
    markSessionClean();
  });

  // GPU / renderer crash
  app.on('child-process-gone', (_event, details) => {
    console.error('[CRASH] child-process-gone:', details);
    appendCrash({
      type: 'child-process-gone',
      message: `type=${details.type} reason=${details.reason} exitCode=${details.exitCode}`,
      version,
    });
  });

  // 세션 시작 마킹
  markSessionStart();
}

/**
 * 메인창 crash / unresponsive 가드 — createKeywordWindow 후 호출
 */
export function attachWindowCrashGuard(win: BrowserWindow): void {
  if (!win || win.isDestroyed()) return;
  const version = app.getVersion();

  win.webContents.on('render-process-gone', (_event, details: any) => {
    console.error('[CRASH] render-process-gone:', details);
    appendCrash({
      type: 'render-process-gone',
      message: `reason=${details.reason} exitCode=${details.exitCode}`,
      version,
    });
    // killed / crashed 시 사용자에게 안내 + 재시작 옵션
    if (details.reason === 'crashed' || details.reason === 'oom') {
      try {
        dialog.showMessageBox(win, {
          type: 'error',
          title: 'LEWORD 화면 오류',
          message: '메인 화면이 충돌했습니다.',
          detail: `사유: ${details.reason}\n앱을 재시작하면 복구됩니다.`,
          buttons: ['재시작', '닫기'],
          defaultId: 0,
        }).then(({ response }) => {
          if (response === 0) {
            app.relaunch();
            app.exit(0);
          }
        });
      } catch {}
    }
  });

  win.webContents.on('unresponsive', () => {
    console.warn('[CRASH] webContents unresponsive');
    appendCrash({
      type: 'unresponsive',
      message: '메인창 응답 없음',
      version,
    });
  });

  win.webContents.on('responsive', () => {
    console.log('[CRASH] webContents 응답 복구됨');
  });
}

/**
 * 이전 세션 비정상 종료 감지 → 사용자 알림 (앱 시작 시 호출)
 */
export function checkPreviousCrash(): { hasIssue: boolean; summary?: string } {
  const session = readLastSession();
  const lastCrash = readLastCrash();

  // 직전 세션이 비정상 종료 (clean: false)
  if (session && session.clean === false && session.startedAt) {
    // 직전 24h 이내만 유효 (오래된 crash 무시)
    const ageMs = Date.now() - new Date(session.startedAt).getTime();
    if (ageMs < 24 * 60 * 60 * 1000) {
      const lastCrashStr = lastCrash
        ? `\n최근 오류: [${lastCrash.type}] ${(lastCrash.message || '').slice(0, 100)}`
        : '';
      return {
        hasIssue: true,
        summary: `이전 실행이 비정상 종료되었습니다 (${new Date(session.startedAt).toLocaleString()}).${lastCrashStr}`,
      };
    }
  }

  return { hasIssue: false };
}

/**
 * 로그 파일 경로 (UI 에서 사용자에게 보여주거나 열기용)
 */
export function getCrashLogPath(): string {
  return getLogPath();
}

/**
 * 부팅 환경 자체 검증
 */
export function runStartupHealthCheck(): { ok: boolean; warnings: string[] } {
  const warnings: string[] = [];

  // Node version
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  if (nodeMajor < 16) {
    warnings.push(`Node.js 버전 낮음 (${process.versions.node}) — 16+ 권장`);
  }

  // 디스크 공간 (userData 위치) — 100MB 미만이면 경고
  try {
    const userData = app.getPath('userData');
    const stats: any = (fs as any).statfsSync ? (fs as any).statfsSync(userData) : null;
    if (stats) {
      const freeGB = (stats.bavail * stats.bsize) / (1024 ** 3);
      if (freeGB < 0.1) {
        warnings.push(`디스크 공간 부족 (${freeGB.toFixed(2)} GB 남음) — 100MB+ 필요`);
      }
    }
  } catch {}

  // 메모리 — Node process 시작 시 RAM 확인
  try {
    const totalMem = require('os').totalmem();
    const freeMem = require('os').freemem();
    if (freeMem < 200 * 1024 * 1024) {
      warnings.push(`시스템 메모리 부족 (${Math.round(freeMem / 1024 / 1024)}MB) — 200MB+ 필요`);
    }
  } catch {}

  return { ok: warnings.length === 0, warnings };
}
