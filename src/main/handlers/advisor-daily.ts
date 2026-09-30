/**
 * 어드바이저 하루 1회 수집기(앱 전용, A 층, 2026-09-30 플랜).
 *
 * 사장님 "내 블로그를 주면 알고리즘이 어디에 특화되어 있나 파악 → 어떤 걸로 어떻게 써야 홈판에 유리한지".
 * 앱이 켜져 있으면 새벽 차례(05:00 뒤 처음)에 한 번, 로그인 세션으로 어드바이저 창구 40여 개를 돌려
 * userData/advisor-daily/<통계날짜>.json 을 쌓는다. 비용 0. 로그인이 없으면 조용히 건너뛴다(화면에 사실만).
 *
 * 저장 판엔 채널 아이디만 남고 계정 아이디는 없다(daily-summary 가 고른 칸만 옮긴다). 로그인 페이지는 부르지 않는다.
 */
import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { baseProbes, followUpProbes, yesterday, type AdvisorProbeSpec } from '../../utils/advisor/daily-plan';
import {
  buildDailyRecord,
  homefeedDayPattern,
  pickBlogChannelId,
  type AdvisorDailyRecord,
  type AdvisorProbeResult,
} from '../../utils/advisor/daily-summary';
import { isWatchDue } from '../../utils/seat-watch';
import { advisorFetch, naverSessionStatus } from './naver-session';

/** 자리 감시(05:00)와 같은 시각 — 어제 통계가 채워지는 시각을 실측하면 조정한다. */
export const ADVISOR_DAILY_RUN_HOUR = 5;
/** 날짜별 파일 보존 — 어드바이저 day 창 상한(90일)과 같다. */
const KEEP_DAYS = 90;
const CHECK_EVERY_MS = 10 * 60 * 1000;
/** 창구 사이 간격. 실측 때 350ms 로 93건 문제없었다. */
const GAP_MS = 350;

const DIR = () => path.join(app.getPath('userData'), 'advisor-daily');
const LATEST = () => path.join(DIR(), 'latest.json');
const STATE = () => path.join(DIR(), 'state.json');

interface DailyState {
  lastRunAt: string | null;
  lastResult: { day: string; posts: number; missing: number; at: string } | null;
  lastSkip: { reason: string; at: string } | null;
}

function ensureDir(): void {
  try { fs.mkdirSync(DIR(), { recursive: true }); } catch { /* 이미 있으면 그만 */ }
}

function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T; } catch { return fallback; }
}

function writeJson(file: string, value: unknown): void {
  ensureDir();
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

const readState = (): DailyState => readJson<DailyState>(STATE(), { lastRunAt: null, lastResult: null, lastSkip: null });

/** 날짜별 기록을 오래된 것부터. 파일명이 통계 날짜라 이름 정렬이 날짜 정렬이다. */
export function readDailyRecords(): AdvisorDailyRecord[] {
  let names: string[] = [];
  try { names = fs.readdirSync(DIR()).filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort(); } catch { return []; }
  return names.map((n) => readJson<AdvisorDailyRecord | null>(path.join(DIR(), n), null)).filter((r): r is AdvisorDailyRecord => !!r);
}

function pruneOld(now: Date): void {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
  const floor = cutoff.toISOString().slice(0, 10);
  for (const record of readDailyRecords()) {
    if (record.day < floor) { try { fs.unlinkSync(path.join(DIR(), `${record.day}.json`)); } catch { /* 이미 없음 */ } }
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runProbes(specs: readonly AdvisorProbeSpec[], results: Record<string, AdvisorProbeResult>): Promise<void> {
  for (const spec of specs) {
    try {
      const { status, body } = await advisorFetch(spec.path);
      results[spec.key] = { status, body };
    } catch (error: any) {
      // 창구 하나가 막혀도 판은 만든다 — missing 에 이름이 남는다.
      results[spec.key] = { status: 0, body: String(error?.message || error) };
    }
    await sleep(GAP_MS);
  }
}

function pickTopics(results: Record<string, AdvisorProbeResult>): string[] {
  const read = (key: string): string[] => {
    try { return (JSON.parse(results[key]?.body || '{}').data as any[]).map((r) => String(r?.d1 || '')).filter(Boolean); } catch { return []; }
  };
  return [...new Set([...read('d1RanksDay'), ...read('d1RanksWeek')])];
}

function pickPostIds(results: Record<string, AdvisorProbeResult>): string[] {
  try { return (JSON.parse(results.cvRanks?.body || '{}').data as any[]).map((r) => String(r?.contentId || '')).filter(Boolean); } catch { return []; }
}

let running = false;

/** 수집이 끝난 직후 이어서 할 일(D 판 '오늘 쓸 글' 조립). 여기서 today 를 import 하면 순환이라 밖에서 건다. */
let afterCollect: ((record: AdvisorDailyRecord) => void) | null = null;
export function setAdvisorDailyAfterCollect(fn: ((record: AdvisorDailyRecord) => void) | null): void {
  afterCollect = fn;
}

export type AdvisorDailyRunResult =
  | { success: true; record: AdvisorDailyRecord }
  | { success: false; skipped: true; reason: string }
  | { success: false; skipped?: false; error: string };

/** 한 번 돈다. 로그인 없음·이미 오늘 판 있음(respectDone)이면 건너뛴다. */
export async function runAdvisorDaily(reason: 'scheduled' | 'manual', options: { respectDone?: boolean } = {}): Promise<AdvisorDailyRunResult> {
  if (running) return { success: false, skipped: true, reason: '이미 수집 중' };
  const now = new Date();
  const day = yesterday(now);
  if (options.respectDone && fs.existsSync(path.join(DIR(), `${day}.json`))) return { success: false, skipped: true, reason: `${day} 판이 이미 있음` };
  const skip = (why: string): AdvisorDailyRunResult => {
    writeJson(STATE(), { ...readState(), lastSkip: { reason: why, at: now.toISOString() } });
    console.log(`[ADVISOR-DAILY] ${reason} 건너뜀 — ${why}`);
    return { success: false, skipped: true, reason: why };
  };
  running = true;
  try {
    const session = await naverSessionStatus();
    if (!session.loggedIn) return skip('네이버 로그인 전');
    const channels = await advisorFetch('/accounts/channels');
    const channelId = channels.status === 200 ? pickBlogChannelId(channels.body) : null;
    if (!channelId) return skip(`블로그 채널을 못 읽음(${channels.status})`);

    const ctx = { channelId, now };
    const results: Record<string, AdvisorProbeResult> = {};
    await runProbes(baseProbes(ctx), results);
    await runProbes(followUpProbes(ctx, { topics: pickTopics(results), postIds: pickPostIds(results) }), results);
    const record = buildDailyRecord({ ...ctx, collectedAt: new Date() }, results);

    writeJson(path.join(DIR(), `${record.day}.json`), record);
    writeJson(LATEST(), record);
    pruneOld(now);
    writeJson(STATE(), {
      ...readState(),
      lastRunAt: new Date().toISOString(),
      lastResult: { day: record.day, posts: record.posts.length, missing: record.missing.length, at: new Date().toISOString() },
      lastSkip: null,
    });
    console.log(`[ADVISOR-DAILY] ${reason} 수집 끝 — ${record.day} · 글 ${record.posts.length} · 창구 ${Object.keys(results).length} · 못 받은 ${record.missing.length}`);
    if (afterCollect) {
      try { afterCollect(record); } catch (error: any) { console.warn('[ADVISOR-DAILY] 후속 작업 실패:', error?.message); }
    }
    return { success: true, record };
  } catch (error: any) {
    console.warn('[ADVISOR-DAILY] 수집 실패:', error?.message);
    return { success: false, error: error?.message || '어드바이저 수집 실패' };
  } finally {
    running = false;
  }
}

let timer: NodeJS.Timeout | null = null;

/** 10분마다 "돌 차례인가"만 본다 — 새벽 차례가 지난 뒤 처음 켜져 있을 때 한 번. */
export function startAdvisorDailyScheduler(): void {
  if (timer) return;
  const tick = () => {
    try {
      if (!isWatchDue(readState().lastRunAt, new Date(), ADVISOR_DAILY_RUN_HOUR)) return;
      void runAdvisorDaily('scheduled', { respectDone: true });
    } catch (error: any) {
      console.warn('[ADVISOR-DAILY] 스케줄 확인 실패:', error?.message);
    }
  };
  timer = setInterval(tick, CHECK_EVERY_MS);
  timer.unref?.();
  setTimeout(tick, 2 * 60 * 1000).unref?.(); // 켜지고 2분 뒤 첫 확인 — 자리 감시(1분 반) 뒤로
}

export function stopAdvisorDailyScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}

/** 화면·브리지가 읽는 판: 최신 기록 + 쌓인 날들로 센 홈판 탄 날 패턴 + 상태. */
export function readAdvisorDailyView() {
  const records = readDailyRecords();
  const latest = readJson<AdvisorDailyRecord | null>(LATEST(), null) ?? records[records.length - 1] ?? null;
  return { latest, pattern: homefeedDayPattern(records), days: records.length, state: readState(), runHour: ADVISOR_DAILY_RUN_HOUR };
}

export function setupAdvisorDailyHandlers(): void {
  if (!ipcMain.listenerCount('advisor-daily-view')) {
    ipcMain.handle('advisor-daily-view', async () => ({ success: true, ...readAdvisorDailyView() }));
  }
  if (!ipcMain.listenerCount('advisor-daily-run-now')) {
    ipcMain.handle('advisor-daily-run-now', async () => runAdvisorDaily('manual'));
  }
  console.log('[ADVISOR-DAILY] ✅ 어드바이저 하루 수집 핸들러 등록 완료');
}
