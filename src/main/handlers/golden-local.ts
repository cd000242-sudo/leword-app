/**
 * 황금키워드를 이 PC 에서 사이트와 같은 네 단계로 찾는다 (앱 전용, 2026-09-15, 상위호환 2단계).
 *
 * 사장님 "앱에 있는 황금키워드 발굴도 4개밖에 안 나와 사이트랑 많이 다른데 상위호환으로 발굴해줘야지".
 * 결정: "사이트 스크립트를 그대로 앱에서" · "사이트 창고 파일 받아 쓰기" · "고른 주제는 바로, 전체 주제는 새벽"
 *       · 새벽은 "5시 이후 켜져 있으면 하루 한 번"(자리 감시가 도는 중이면 기다린다).
 *
 * 사이트 CI 의 네 스크립트를 자식 프로세스로 돌린다 — 인자는 golden-local-plan, 실행은 golden-local-runner,
 * 설치판과 스크립트 사이의 차이는 scripts/app-script-shim.js 가 메운다.
 *   · 키는 사용자 설정(config.json)만 쓴다. 자리는 이 PC 크로미엄. Bright Data 는 부르지 않는다.
 *   · 씨앗 창고는 사이트 레포의 공개 파일을 하루 한 번 받아 둔다. 못 받으면 받아 둔 것을, 그것도 없으면 창고 없이 돈다.
 *   · 결과는 userData/golden-local/published.json(이 PC 판). 발굴 화면이 사이트 판과 합쳐 보인다(golden-site-rows).
 * 새벽은 한 번에 3주제씩 32주제를 차례로 돈다 — 실측(2026-09-15) 4주제 후보 찾기만 71분이라 하루에 전부는 못 돈다.
 */
import { app, BrowserWindow, ipcMain, Notification } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { findChromePath } from '../../utils/chrome-finder';
import { EnvironmentManager } from '../../utils/environment-manager';
import {
  blogTopicsForCategory,
  buildGoldenLocalStages,
  GOLDEN_LOCAL_PROGRESS_CHANNEL,
  judgeSeedDbPayload,
  nightlyTopics,
  PICKED_TOPIC_MAX,
  pickLocalTopics,
  SEED_DB_URL,
  seedDbNeedsRefresh,
  workFiles,
} from '../../utils/golden-local-plan';
import { startGoldenLocalRun, type GoldenLocalRunHandle } from '../../utils/golden-local-runner';
import { shouldSkipBackground } from '../../utils/hunt-progress-flag';
import { isWatchDue } from '../../utils/seat-watch';
import { isSeatWatchRunning } from './seat-watch';

export const GOLDEN_LOCAL_RUN_HOUR = 5;
const CHECK_EVERY_MS = 10 * 60 * 1000;
/** 첫 확인은 자리 감시(켜지고 1분 반)보다 늦게 — 둘 다 차례면 자리 감시가 먼저 돈다. */
const FIRST_CHECK_MS = 3 * 60 * 1000;
const SEED_DB_TIMEOUT_MS = 60 * 1000;
const KEYS_MISSING = '네이버 검색광고 키와 오픈 API(Client ID) 키가 있어야 이 PC 에서 찾을 수 있습니다 — 환경설정에서 넣어 주세요.';

const DIR = () => path.join(app.getPath('userData'), 'golden-local');
const SEED_DB = () => path.join(DIR(), 'seed-db.json');
const STATE = () => path.join(DIR(), 'state.json');
const PREFS = () => path.join(DIR(), 'prefs.json');
const FIRST_SEEN = () => path.join(DIR(), 'first-seen.json');
const PUBLISHED = () => path.join(DIR(), 'published.json');
const WORK = () => path.join(DIR(), 'work');
/** 스크립트가 있는 곳 — 개발은 레포, 설치판은 app.asar. 이 파일의 컴파일본(dist/src/main/handlers)에서 네 칸 위다. */
const APP_ROOT = () => path.resolve(__dirname, '..', '..', '..', '..');

type RunReason = 'manual' | 'scheduled';

interface LastRun {
  at: string;
  reason: RunReason;
  topics: string[];
  ok: boolean;
  aborted: boolean;
  message: string;
  rows: number | null;
  tail: string[];
}

interface LocalState {
  lastRun: LastRun | null;
  nightly: { lastRunAt: string | null; cursor: number };
}

interface Running {
  startedAt: string;
  topics: string[];
  reason: RunReason;
  stage: string | null;
  abortRequested: boolean;
  handle: GoldenLocalRunHandle | null;
}

interface SeedDbSummary {
  ok: boolean;
  builtAt: string | null;
  seeds: number;
  fromCache: boolean;
  message: string;
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1), 'utf8');
  fs.renameSync(tmp, file);
}

function readState(): LocalState {
  const saved = readJson<Partial<LocalState>>(STATE(), {});
  return {
    lastRun: saved.lastRun || null,
    nightly: { lastRunAt: saved.nightly?.lastRunAt || null, cursor: Number(saved.nightly?.cursor) || 0 },
  };
}

function saveState(patch: Partial<LocalState>): void {
  try {
    writeJson(STATE(), { ...readState(), ...patch });
  } catch (error: any) {
    console.warn('[GOLDEN-LOCAL] 상태 저장 실패:', error?.message);
  }
}

const autoEnabled = (): boolean => readJson<{ auto?: boolean }>(PREFS(), {}).auto !== false;

/** 이 PC 판 — 발행 스크립트가 쓴 파일. 발굴 화면(golden-site-rows)이 사이트 판과 합친다. */
export function readGoldenLocalBoard(): { publishedAt?: string | null; rows: any[] } | null {
  const board = readJson<any>(PUBLISHED(), null);
  return board && Array.isArray(board.rows) ? board : null;
}

function broadcast(payload: Record<string, unknown>): void {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed()) win.webContents.send(GOLDEN_LOCAL_PROGRESS_CHANNEL, payload);
    } catch { /* 창이 닫히는 중 */ }
  }
}

function notify(title: string, body: string): void {
  try {
    if (Notification.isSupported()) new Notification({ title, body }).show();
  } catch (error: any) {
    console.warn('[GOLDEN-LOCAL] 알림 실패:', error?.message);
  }
}

function hasKeys(): boolean {
  try {
    const config = EnvironmentManager.getInstance().getConfig();
    return Boolean(config.naverSearchAdAccessLicense && config.naverClientId);
  } catch {
    return false;
  }
}

/** 씨앗 창고를 받아 둔다. 하루에 한 번만 받는다. 못 받으면 받아 둔 것을 쓰고, 쓸 수 없는 파일로 덮지 않는다. */
async function ensureSeedDb(): Promise<SeedDbSummary> {
  const file = SEED_DB();
  let savedAtMs: number | null = null;
  try { savedAtMs = fs.statSync(file).mtimeMs; } catch { savedAtMs = null; }
  const useSaved = (message: string): SeedDbSummary => {
    if (savedAtMs === null) return { ok: false, builtAt: null, seeds: 0, fromCache: true, message };
    const check = judgeSeedDbPayload(readJson<unknown>(file, null));
    const note = check.ok ? message : `받아 둔 씨앗 창고도 쓸 수 없습니다 — ${check.reason}`;
    return { ok: check.ok, builtAt: check.builtAt, seeds: check.seeds, fromCache: true, message: note };
  };
  if (!seedDbNeedsRefresh(savedAtMs, Date.now())) return useSaved('');
  try {
    const res = await (globalThis as any).fetch(SEED_DB_URL, { signal: AbortSignal.timeout(SEED_DB_TIMEOUT_MS) });
    if (!res.ok) return useSaved(`씨앗 창고를 받지 못했습니다(${res.status})`);
    const text = await res.text();
    const check = judgeSeedDbPayload(JSON.parse(text));
    if (!check.ok) return useSaved(`받은 씨앗 창고를 쓰지 않습니다 — ${check.reason}`);
    fs.mkdirSync(DIR(), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, text, 'utf8');
    fs.renameSync(tmp, file);
    return { ok: true, builtAt: check.builtAt, seeds: check.seeds, fromCache: false, message: '' };
  } catch (error: any) {
    return useSaved(`씨앗 창고를 받지 못했습니다 — ${String(error?.message || error).slice(0, 80)}`);
  }
}

let running: Running | null = null;

export function isGoldenLocalRunning(): boolean {
  return running !== null;
}

function boardRows(): number | null {
  const board = readGoldenLocalBoard();
  return board ? board.rows.length : null;
}

/** 네 단계를 한 번 돈다. 고른 주제(수동)·새벽 차례 공용. 끝나면 state.json 에 남기고 화면에 알린다. */
async function runGoldenLocal(topics: string[], reason: RunReason): Promise<LastRun> {
  const self: Running = { startedAt: new Date().toISOString(), topics, reason, stage: null, abortRequested: false, handle: null };
  running = self;
  broadcast({ type: 'run-start', topics, reason, at: self.startedAt });
  const finish = (result: Pick<LastRun, 'ok' | 'aborted' | 'message' | 'tail'>): LastRun => {
    const lastRun: LastRun = { at: new Date().toISOString(), reason, topics, rows: boardRows(), ...result };
    saveState({ lastRun });
    broadcast({ type: 'run-end', ...lastRun });
    const outcome = lastRun.ok ? '끝' : lastRun.aborted ? '멈춤' : '실패';
    console.log(`[GOLDEN-LOCAL] ${reason} ${topics.join(',')} — ${outcome} · 이 PC 판 ${lastRun.rows ?? 0}행 ${lastRun.message}`);
    return lastRun;
  };
  try {
    fs.mkdirSync(WORK(), { recursive: true });
    // 지난 회차 작업 파일이 이번 단계의 입력으로 섞이지 않게 먼저 지운다.
    for (const file of Object.values(workFiles(WORK()))) fs.rmSync(file, { force: true });
    const seedDb = await ensureSeedDb();
    broadcast({ type: 'seed-db', ...seedDb });
    if (self.abortRequested) return finish({ ok: false, aborted: true, message: '시작하기 전에 멈췄습니다.', tail: [] });
    const root = APP_ROOT();
    const stages = buildGoldenLocalStages({
      scriptsDir: path.join(root, 'scripts'),
      workDir: WORK(),
      stateFile: FIRST_SEEN(),
      destFile: PUBLISHED(),
      topics,
    });
    self.handle = startGoldenLocalRun(stages, {
      execPath: process.execPath,
      shimPath: path.join(root, 'scripts', 'app-script-shim.js'),
      cwd: WORK(),
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        LEWORD_APP_USER_DATA: app.getPath('userData'),
        LEWORD_SEED_DB_PATH: seedDb.ok ? SEED_DB() : '',
        // 자식은 작업 폴더에서 돌아 개발 실행에서는 번들 크로미엄을 못 찾는다 — 메인이 쓰는 브라우저 경로를 넘긴다.
        LEWORD_CHROME_PATH: findChromePath() || '',
        BRIGHTDATA_TOKEN: '',
      },
      onEvent: (event) => {
        if (event.type === 'stage-start') self.stage = event.label;
        broadcast({ ...event });
      },
    });
    const result = await self.handle.done;
    return finish({ ok: result.ok, aborted: result.aborted, message: result.message, tail: result.tail.slice(-8) });
  } catch (error: any) {
    return finish({ ok: false, aborted: false, message: String(error?.message || error).slice(0, 200), tail: [] });
  } finally {
    if (running === self) running = null;
  }
}

function requestAbort(sync = false): boolean {
  if (!running) return false;
  running.abortRequested = true;
  running.handle?.abort(sync);
  return true;
}

let firstCheck: NodeJS.Timeout | null = null;
let timer: NodeJS.Timeout | null = null;

/** 새벽 차례 — 5시가 지난 뒤 처음 켜져 있을 때 하루 한 번, 다음 3주제. */
function nightlyTick(): void {
  try {
    if (running || !autoEnabled()) return;
    const state = readState();
    if (!isWatchDue(state.nightly.lastRunAt, new Date(), GOLDEN_LOCAL_RUN_HOUR)) return;
    // 자리 감시가 도는 중이거나 사용자가 발굴 중이면 다음 확인(10분 뒤)까지 기다린다 — 같은 새벽에 크로미엄을 둘 띄우지 않는다.
    if (isSeatWatchRunning() || shouldSkipBackground()) return;
    if (!hasKeys()) return;
    const pick = nightlyTopics(state.nightly.cursor);
    // 하루 한 번은 시작할 때 적는다. 차례(cursor)는 멈춤이 아닐 때만 넘긴다 — 앱을 닫아 끊긴 주제는 다음 날 다시 돈다.
    saveState({ nightly: { lastRunAt: new Date().toISOString(), cursor: state.nightly.cursor } });
    void runGoldenLocal(pick.topics, 'scheduled').then((lastRun) => {
      if (lastRun.aborted) return;
      saveState({ nightly: { ...readState().nightly, cursor: pick.nextCursor } });
      const body = lastRun.ok
        ? `${pick.topics.join(' · ')} — 이 PC 판 ${lastRun.rows ?? 0}행`
        : `${pick.topics.join(' · ')} — ${lastRun.message}`;
      notify('황금키워드 새벽 찾기', body);
    });
  } catch (error: any) {
    console.warn('[GOLDEN-LOCAL] 새벽 차례 확인 실패:', error?.message);
  }
}

export function startGoldenLocalScheduler(): void {
  if (firstCheck || timer) return;
  firstCheck = setTimeout(() => {
    firstCheck = null;
    nightlyTick();
    timer = setInterval(nightlyTick, CHECK_EVERY_MS);
    timer.unref?.();
  }, FIRST_CHECK_MS);
  firstCheck.unref?.();
}

export function stopGoldenLocalScheduler(): void {
  if (firstCheck) { clearTimeout(firstCheck); firstCheck = null; }
  if (timer) { clearInterval(timer); timer = null; }
}

let quitHookInstalled = false;

export function setupGoldenLocalHandlers(): void {
  if (!ipcMain.listenerCount('golden-local-status')) {
    ipcMain.handle('golden-local-status', async () => {
      const state = readState();
      const board = readGoldenLocalBoard();
      return {
        success: true,
        running: running ? { startedAt: running.startedAt, topics: running.topics, reason: running.reason, stage: running.stage } : null,
        lastRun: state.lastRun,
        auto: autoEnabled(),
        runHour: GOLDEN_LOCAL_RUN_HOUR,
        nightlyLastRunAt: state.nightly.lastRunAt,
        nightlyNext: nightlyTopics(state.nightly.cursor).topics,
        board: board ? { publishedAt: board.publishedAt || null, rows: board.rows.length } : null,
        topicMax: PICKED_TOPIC_MAX,
      };
    });
  }
  if (!ipcMain.listenerCount('golden-local-topics')) {
    ipcMain.handle('golden-local-topics', async (_event, payload?: { category?: string }) => ({
      success: true,
      topics: blogTopicsForCategory(payload?.category),
      max: PICKED_TOPIC_MAX,
    }));
  }
  if (!ipcMain.listenerCount('golden-local-run')) {
    ipcMain.handle('golden-local-run', async (_event, payload?: { category?: string; topics?: string[] }) => {
      if (running) return { success: false, error: '이미 이 PC 에서 찾는 중입니다. 끝나거나 멈춘 뒤에 다시 눌러 주세요.' };
      const picked = pickLocalTopics(payload);
      if (picked.error) return { success: false, error: picked.error };
      if (!hasKeys()) return { success: false, error: KEYS_MISSING };
      void runGoldenLocal(picked.topics, 'manual');
      return { success: true, started: true, topics: picked.topics, more: picked.more };
    });
  }
  if (!ipcMain.listenerCount('golden-local-abort')) {
    ipcMain.handle('golden-local-abort', async () => (requestAbort() ? { success: true } : { success: false, error: '찾는 중이 아닙니다.' }));
  }
  if (!ipcMain.listenerCount('golden-local-auto')) {
    ipcMain.handle('golden-local-auto', async (_event, payload?: { on?: boolean }) => {
      writeJson(PREFS(), { auto: payload?.on !== false });
      return { success: true, auto: autoEnabled() };
    });
  }
  if (!quitHookInstalled) {
    quitHookInstalled = true;
    // 앱을 닫을 때 자식 프로세스·크로미엄이 남지 않게 트리째 끊고 닫는다.
    app.on('before-quit', () => { requestAbort(true); });
  }
  console.log('[GOLDEN-LOCAL] ✅ 이 PC 황금키워드 찾기 핸들러 등록 완료');
}
