/**
 * 제휴 수집을 앱이 대신 돌린다 (2026-09-16).
 *
 * 사장님 "매일마다 로그인해야되는거네".
 * 매일 로그인해야 하는 구조는 아니었는데 지금 구조가 그렇게 만들었다 — 갱신이 사장님 PC 수동 실행이라
 * 아무도 안 돌리면 쿠키가 방치돼 만료되고, 끊긴 걸 열흘간 아무도 몰랐다(실측 2026-09-16: 수집 241시간 전,
 * 표의 '바로쓰기' 0개). 앱이 하루 한 번 돌리면 세션이 계속 쓰여 연장되고, 정말 끊겼을 때만 알림이 뜬다.
 *
 * 어떻게:
 *   · 수집기(다른 에이전트 소관, 한 줄도 안 고친다)를 **앱 데이터 폴더로 복사해** 거기서 돌린다.
 *     그 파일들이 쿠키 프로필을 `scripts/../tmp/affiliate-profile` 로 박아 뒀는데, 설치판에서 그 자리는
 *     app.asar 안이라 쓸 수 없다. 복사본에서 돌리면 프로필이 앱 폴더에 남는다.
 *   · `-r scripts/app-script-shim.js` 로 설치판 차이를 메운다(복사본 경로는 환경변수로 알려 준다).
 *   · 수집은 `--headless` — 실측(2026-09-16)에서 창 없이도 토스 150건이 정상 수집됐다. 새벽에 창이 뜨지 않는다.
 *   · 운영자 전용 설정이 켜진 PC만 검증된 공개 스냅샷을 사이트에 발행한다.
 *   · 수집만 하고 자리를 안 재면 판이 오히려 빈다(순수 수집본에는 seat · brief 가 없다) — 그래서 enrich 까지 한 벌.
 */
import { app, ipcMain, Notification } from 'electron';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { StringDecoder } from 'string_decoder';
import { readBriefProvider } from '../topic-brief-preferences';
import { isAffiliatePublishingEnabled, publishAffiliateSnapshot } from '../affiliate-publisher';
import {
  AFFILIATE_SCRIPT_FILES,
  AFFILIATE_STAGE_LABEL,
  buildAffiliatePlan,
  isAffiliateRunDue,
  readAffiliateOutcome,
  type AffiliateStage,
} from '../../utils/affiliate-local-plan';

export const AFFILIATE_LOCAL_PROGRESS_CHANNEL = 'affiliate-local-progress';

/** 새벽 몇 시 이후에 도는가. 자리 감시(05:00)·황금키워드(05:00) 뒤로 둔다 — 브라우저를 서로 뺏지 않게. */
const RUN_HOUR = 6;
const CHECK_EVERY_MS = 15 * 60 * 1000;
const FIRST_CHECK_MS = 5 * 60 * 1000;
/** 한 회차 상한. 수집 2~4분 + 자리·글감 재기가 길어야 한 시간이다. */
const RUN_TIMEOUT_MS = 90 * 60 * 1000;
const KST_MS = 9 * 60 * 60 * 1000;

const DIR = () => path.join(app.getPath('userData'), 'affiliate-local');
const STATE = () => path.join(DIR(), 'state.json');
/** 이 파일의 컴파일본(dist/src/main/handlers)에서 네 칸 위 — 개발은 레포, 설치판은 app.asar. */
const APP_ROOT = () => path.resolve(__dirname, '..', '..', '..', '..');

type RunReason = 'manual' | 'scheduled';

interface LastRun {
  at: string;
  reason: RunReason;
  ok: boolean;
  /** 로그인이 끊겨 새 목록을 못 받은 플랫폼. 비어 있으면 정상. */
  needsLogin: string[];
  collected: Record<string, number>;
  message: string;
  publication?: { status: string; reason: string };
  readyForPublication?: boolean;
}

interface LocalState {
  lastRun: LastRun | null;
}

let timer: NodeJS.Timeout | null = null;
let running = false;

function readState(): LocalState {
  try {
    return JSON.parse(fs.readFileSync(STATE(), 'utf8')) as LocalState;
  } catch {
    return { lastRun: null };
  }
}

function writeState(state: LocalState): void {
  try {
    fs.mkdirSync(DIR(), { recursive: true });
    fs.writeFileSync(STATE(), JSON.stringify(state, null, 2), 'utf8');
  } catch (error: any) {
    console.warn('[제휴 자동] 기록 저장 실패:', error?.message);
  }
}

function notify(title: string, body: string): void {
  try {
    if (Notification.isSupported()) new Notification({ title, body }).show();
  } catch (error: any) {
    console.warn('[제휴 자동] 알림 실패:', error?.message);
  }
}

function say(message: string): void {
  try {
    const { BrowserWindow } = require('electron');
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(AFFILIATE_LOCAL_PROGRESS_CHANNEL, { message });
    }
  } catch { /* 듣는 창이 없으면 그만 */ }
}

/**
 * 스크립트를 앱 폴더로 복사한다. 내용이 같으면 건너뛴다 — 설치판에서는 app.asar 안 파일을 읽어 온다.
 * 하나라도 못 옮기면 그 사실을 알린다(빠진 채 돌리면 자식이 require 에서 죽는다).
 */
function syncScripts(workDir: string): { ok: boolean; missing: string[] } {
  const from = path.join(APP_ROOT(), 'scripts');
  const to = path.join(workDir, 'scripts');
  fs.mkdirSync(to, { recursive: true });
  const missing: string[] = [];
  for (const name of [...AFFILIATE_SCRIPT_FILES, 'app-script-shim.js']) {
    const source = path.join(from, name);
    try {
      const body = fs.readFileSync(source);
      const target = path.join(to, name);
      let same = false;
      try { same = fs.readFileSync(target).equals(body); } catch { same = false; }
      if (!same) fs.writeFileSync(target, body);
    } catch {
      missing.push(name);
    }
  }
  return { ok: missing.length === 0, missing };
}

/** 한 단계를 자식 프로세스로 돌리고 출력을 모은다. 비밀값이 섞일 수 있어 화면에는 골라 낸 줄만 보낸다. */
function runStage(stage: AffiliateStage, workDir: string, extraEnv: Record<string, string>, showWindow = false): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    const scriptsDir = path.join(workDir, 'scripts');
    const child = spawn(process.execPath, ['-r', path.join(scriptsDir, 'app-script-shim.js'), stage.script, ...stage.args], {
      cwd: workDir,
      // 로그인 수집은 사장님이 창에서 직접 로그인해야 한다 — 그 창이 숨겨지지 않게.
      windowsHide: !showWindow,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        LEWORD_APP_USER_DATA: app.getPath('userData'),
        LEWORD_APP_SCRIPTS_DIR: scriptsDir,
        LEWORD_APP_DIST_DIR: path.join(APP_ROOT(), 'dist', 'src'),
        NODE_PATH: path.join(APP_ROOT(), 'node_modules'),
        LEWORD_BRIEF_PROVIDER: readBriefProvider(app.getPath('userData')),
        ...affiliateBrowserEnv(),
        ...extraEnv,
      },
    });

    let output = '';
    const decoder = new StringDecoder('utf8');
    const collect = (chunk: Buffer) => {
      const text = decoder.write(chunk);
      output += text;
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        // 진행 줄만 고른다 — 설정 관리자가 키 길이·고객 번호를 찍으므로 원문을 통째로 넘기지 않는다.
        if (/^(■|\[\d\/\d\]|\s*[·+]|이번 수집|자리|브리프)/.test(trimmed)) say(`${stage.label} · ${trimmed}`.slice(0, 200));
      }
    };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);

    const killer = setTimeout(() => { try { child.kill(); } catch { /* 이미 끝났으면 그만 */ } }, RUN_TIMEOUT_MS);
    child.on('error', () => { clearTimeout(killer); resolve({ code: -1, output }); });
    child.on('close', (code) => { clearTimeout(killer); resolve({ code, output }); });
  });
}

/** Operator may keep the already authenticated dedicated profile outside the app cache. */
function affiliateBrowserEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  try {
    const settings = JSON.parse(fs.readFileSync(path.join(DIR(), 'settings.json'), 'utf8'));
    if (typeof settings.profilePath === 'string' && path.isAbsolute(settings.profilePath) && fs.statSync(settings.profilePath).isDirectory()) {
      env.LEWORD_AFFILIATE_PROFILE_DIR = settings.profilePath;
    }
  } catch { /* New installs use their own dedicated profile. */ }
  const chrome = path.join(process.resourcesPath || '', 'chromium', process.platform === 'win32' ? 'chrome.exe' : 'chrome');
  if (fs.existsSync(chrome)) env.LEWORD_AFFILIATE_CHROME = chrome;
  return env;
}

function readSnapshot(file: string): any {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function publicationSucceeded(result?: { status: string; reason: string }): boolean {
  return !result || result.status === 'published'
    || (result.status === 'skipped' && ['already_published', 'newer_remote'].includes(result.reason));
}

async function seedPublishedSnapshot(file: string): Promise<void> {
  if (fs.existsSync(file)) return;
  try {
    const response = await fetch('https://leaderspro.kr/data/affiliate-campaigns.json', { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return;
    const text = await response.text();
    if (Buffer.byteLength(text) > 8 * 1024 * 1024) return;
    const data = JSON.parse(text);
    if (!data?.sites || !Number.isFinite(Date.parse(data.collectedAt))) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text, 'utf8');
  } catch { /* A first collection can still succeed without a prior board. */ }
}

/**
 * 한 회차 — 복사 → 수집(창 없이) → 자리 · 글감. 결과는 기록하고, 로그인이 끊겼으면 알린다.
 * login: 관리자 버튼의 '로그인 창 열고 수집' — 보이는 창(--autoLogin)에서 로그인한 직후 같은 창으로 수집한다.
 */
export async function runAffiliateCycle(reason: RunReason, options: { login?: boolean } = {}): Promise<LastRun> {
  if (running) return { at: new Date().toISOString(), reason, ok: false, needsLogin: [], collected: {}, message: '이미 돌고 있습니다' };
  running = true;
  const workDir = DIR();
  const login = options.login === true;
  try {
    const prior = readState().lastRun;
    const savedFile = path.join(workDir, 'tmp', 'affiliate-campaigns-public.json');
    // 로그인 수집은 새 목록을 받으려는 것 — 저장본 재발행으로 건너뛰지 않는다.
    if (!login && prior?.readyForPublication && prior.publication?.status === 'failed' && isAffiliatePublishingEnabled(app.getPath('userData'))) {
      const saved = readSnapshot(savedFile);
      const age = Date.now() - Date.parse(saved?.checkedAt);
      if (Number.isFinite(age) && age >= 0 && age < 12 * 3_600_000) {
        const publication = await publishAffiliateSnapshot(saved, { enabled: true });
        const ok = publicationSucceeded(publication);
        const run = { ...prior, at: new Date().toISOString(), reason, ok, publication, message: ok ? '저장된 제휴 결과 사이트 발행 완료' : '사이트 발행 재시도 필요' };
        writeState({ lastRun: run });
        return run;
      }
    }
    const synced = syncScripts(workDir);
    if (!synced.ok) {
      const run: LastRun = {
        at: new Date().toISOString(), reason, ok: false, needsLogin: [], collected: {},
        message: `스크립트를 옮기지 못했습니다: ${synced.missing.join(', ')}`,
      };
      writeState({ lastRun: run });
      return run;
    }

    const plan = buildAffiliatePlan({ workDir, siteRepo: null });
    await seedPublishedSnapshot(plan.snapshotFile);
    const startedAt = Date.now();
    say(login ? '로그인 창을 엽니다 — 창에서 토스 · 브랜드커넥트에 로그인하면 이어서 받습니다' : '제휴 상품 받는 중…');
    const collect = await runStage(
      { ...plan.stages[0], args: [...plan.stages[0].args, login ? '--autoLogin' : '--headless'] },
      workDir, plan.env as Record<string, string>, login,
    );
    const outcome = readAffiliateOutcome(collect.output);

    let message = '';
    let enriched = false;
    const snapshot = readSnapshot(plan.snapshotFile);
    const hasFreshSite = Object.values(snapshot?.sites || {}).some((site: any) => site.status === 'ready' && Date.parse(site.collectedAt) >= startedAt - 300_000);
    if (![0, 3].includes(collect.code ?? -1) || !hasFreshSite) {
      message = '상품 받기가 끝나지 못했습니다';
    } else {
      const counts = Object.entries(outcome.collected).map(([site, n]) => `${site} ${n}건`).join(' · ');
      message = counts ? `받음 ${counts}` : '받은 건수를 읽지 못했습니다';
      say(`${AFFILIATE_STAGE_LABEL.enrich} 시작`);
      const enrich = await runStage(plan.stages[1], workDir, plan.env as Record<string, string>);
      enriched = enrich.code === 0;
      if (enrich.code !== 0) message += ' · 자리 재기는 끝나지 못했습니다';
    }

    const publication = isAffiliatePublishingEnabled(app.getPath('userData')) && (collect.code === 0 || collect.code === 3)
      ? await publishAffiliateSnapshot(readSnapshot(plan.snapshotFile), { enabled: true }) : undefined;
    if (!publicationSucceeded(publication)) message += ' · 사이트 발행 재시도 필요';
    else if (publication?.status === 'published') message += ' · 사이트 발행 완료';

    const run: LastRun = {
      at: new Date().toISOString(),
      reason,
      ok: collect.code === 0 && enriched && publicationSucceeded(publication),
      needsLogin: outcome.sites,
      collected: outcome.collected,
      message,
      ...(publication ? { publication } : {}),
      readyForPublication: collect.code === 0 && enriched,
    };
    const previous = readState().lastRun;
    writeState({ lastRun: run });

    if (outcome.needsLogin && JSON.stringify(previous?.needsLogin) !== JSON.stringify(outcome.sites)) {
      notify('제휴 로그인이 필요합니다', `${outcome.sites.join(' · ')} 목록을 못 받았습니다. 제휴 전용 수집 브라우저에서 다시 로그인해야 합니다.`);
    }
    return run;
  } finally {
    running = false;
  }
}

/** 한국 시각 기준 지금 돌 차례인가 — 오늘 이미 돌았으면 안 돈다. */
function isDue(state: LocalState, nowMs: number): boolean {
  const hour = new Date(nowMs + KST_MS).getUTCHours();
  if (hour < RUN_HOUR) return false;
  return isAffiliateRunDue(state.lastRun?.at ?? null, nowMs, state.lastRun?.ok ?? true);
}

export function startAffiliateScheduler(): void {
  if (timer) return;
  const tick = () => {
    if (running) return;
    const state = readState();
    if (!isDue(state, Date.now())) return;
    void runAffiliateCycle('scheduled').catch((error: any) => console.warn('[제휴 자동] 회차 실패:', error?.message));
  };
  setTimeout(tick, FIRST_CHECK_MS);
  timer = setInterval(tick, CHECK_EVERY_MS);
}

export function stopAffiliateScheduler(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

export function setupAffiliateLocalHandlers(): void {
  /*
   * 관리자 = 운영자 발행 설정이 켜진 PC(2026-10-06 사장님 "관리자만 건들 수 있게"). 화면은 operator 일 때만 버튼을 그리고,
   * 화면을 우회한 invoke 도 여기서 거부한다 — 남의 PC 에서 수집 · 발행이 돌면 안 된다.
   */
  const isOperator = () => isAffiliatePublishingEnabled(app.getPath('userData'));
  if (!ipcMain.listenerCount('affiliate-local-state')) {
    ipcMain.handle('affiliate-local-state', async () => ({ success: true, state: readState(), running, operator: isOperator() }));
  }
  if (!ipcMain.listenerCount('affiliate-local-run')) {
    ipcMain.handle('affiliate-local-run', async (_event, payload?: { login?: boolean }) => {
      if (!isOperator()) return { success: false, error: '관리자 PC 에서만 수집할 수 있습니다' };
      const run = await runAffiliateCycle('manual', { login: payload?.login === true });
      return { success: run.ok, run };
    });
  }
}
