/**
 * 회차 감시견 — 깃허브 예약이 빠지면 앱이 대신 깨운다.
 *
 * 사장님 2026-09-10: "오늘의 글감 시간 지났는데 또 안 됐어".
 * 사장님 2026-09-12: "사이트 11일자로 황금키워드 또 안돌았고 나머지도 어제또는 10일날 돌린게 최신이야".
 *
 * 왜 필요한가(실측) — 깃허브 예약이 늦거나 **아예 안 뜬다**.
 *   09-09 09:23 예약 → 13:47 실행(4.4시간 늦음)
 *   09-09 21:23 · 09-10 03:23 → 실행 기록 없음
 *   선점 보드는 8/14 부터 월·금 8회가 전부 성공했는데 **09-11 금요일 틱만 실행 기록이 없다**
 * 틱을 더 늘려도 같은 스케줄러라 나아지지 않는다(늘리기는 했다 — 그래도 빠질 때가 있다).
 *
 * 대신 이 PC 를 쓴다. 사장님 PC 는 잠깐 쉬는 30분 말고는 늘 켜져 있다("강제로 꺼지지 않는 이상").
 * 발행된 파일을 20분마다 열어 보고, 이번 회차가 비어 있고 예정 시각이 40분 넘게 지났으면
 * 워크플로를 깨운다. 깨우는 것은 이 PC 에 이미 로그인된 gh CLI 로 한다 — 토큰을 앱에 새로 저장하지 않는다.
 * 남의 PC 에는 그 로그인이 없으니, 이 창구는 자연히 사장님 것이다.
 *
 * 2026-09-12 에 보드 하나(오늘의 글감)에서 **넷 전부**로 넓혔다. 전에는 황금키워드·
 * 추천키워드·실검 틈새가 빠져도 아무도 안 깨웠다.
 *
 * 안전장치
 *   · 회차마다 한 번만 깨운다(장부를 파일로 남긴다). 실패해도 회차가 두 번 돌지 않는다.
 *   · 깨울 때 respectDone=true 를 같이 넣는다 — 워크플로의 문지기가 "이미 실렸다"면
 *     곧장 나간다. 선점 보드는 한 회차가 4시간 + BD 예산이라 이게 없으면 헛돈이 크다.
 *   · 40분을 기다리는 이유: 예약이 조금 늦는 것은 정상이다. 그것까지 깨우면 두 번 돈다.
 */
import { app, ipcMain } from 'electron';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const REPO = 'cd000242-sudo/leword-app';
const KST_MS = 9 * 3_600_000;
const DAY_MS = 24 * 3_600_000;
/** 예정 시각이 이만큼 지나도 회차가 비어 있으면 깨운다. 예약이 조금 늦는 것은 정상이라 넉넉히 둔다. */
const GRACE_MS = 40 * 60_000;
const EVERY_MS = 20 * 60_000;

/** 회차 하나의 예정 시각 — 한국 시각. */
type RoundTime = { hour: number; minute: number; label: string };

export type WatchedBoard = {
  /** 사람이 읽는 이름 — 알림과 로그에 쓴다. */
  name: string;
  /** 발행본 주소. 이것이 '실렸나'의 유일한 근거다. */
  url: string;
  /** 깨울 워크플로 파일명. */
  workflow: string;
  /** 하루 회차들(한국 시각). 크론과 같은 분으로 맞춘다. */
  rounds: readonly RoundTime[];
  /** 요일 제한(한국 요일, 0=일). 비우면 매일. */
  days?: readonly number[];
  /** 발행본에서 '마지막으로 실린 시각'을 읽는다. 못 읽으면 null. */
  lastBuiltAt: (data: unknown) => number | null;
};

/** ISO 문자열을 ms 로. 못 읽으면 null. */
function at(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** 최상위 필드 하나를 읽는 흔한 모양. */
function topLevel(field: string) {
  return (data: unknown): number | null => at((data as Record<string, unknown> | null)?.[field]);
}

/**
 * 감시할 보드들.
 *
 * 회차 시각은 각 워크플로의 크론과 **같아야 한다**. 여기가 어긋나면 멀쩡한 회차를
 * 또 깨우거나(헛돈) 빠진 회차를 영영 안 깨운다. 아래 테스트가 워크플로 파일을 직접
 * 읽어 이 표와 대조한다.
 */
export const BOARDS: readonly WatchedBoard[] = [
  {
    name: '오늘의 글감',
    url: 'https://leaderspro.kr/data/topic-briefs.json',
    workflow: 'topic-briefs.yml',
    rounds: [
      { hour: 6, minute: 23, label: '아침' },
      { hour: 12, minute: 23, label: '오후' },
      { hour: 18, minute: 23, label: '저녁' },
    ],
    // 회차 목록이라 마지막 회차의 builtAt 이 '마지막으로 실린 시각'이다.
    // 회차 이름으로 맞추지 않는다 — 늦게 돈 저녁 회차가 아침으로 적히던 사고가 있었다(2026-09-11).
    lastBuiltAt: (data) => {
      const rounds = (data as { rounds?: unknown[] } | null)?.rounds;
      if (!Array.isArray(rounds)) return null;
      const times = rounds.map((r) => at((r as Record<string, unknown>)?.builtAt)).filter((x): x is number => x !== null);
      return times.length ? Math.max(...times) : null;
    },
  },
  {
    name: '황금키워드(선점 보드)',
    url: 'https://leaderspro.kr/data/preemption-board.json',
    workflow: 'preemption-board.yml',
    rounds: [{ hour: 6, minute: 23, label: '회차' }],
    days: [1, 5], // 한국 월요일·금요일
    lastBuiltAt: topLevel('publishedAt'),
  },
  {
    name: '오늘의 추천키워드',
    url: 'https://leaderspro.kr/data/today-picks.json',
    workflow: 'today-picks.yml',
    rounds: [{ hour: 6, minute: 30, label: '회차' }],
    lastBuiltAt: topLevel('builtAt'),
  },
  {
    name: '실검 틈새',
    url: 'https://leaderspro.kr/data/issue-niche-board.json',
    workflow: 'issue-niche-board.yml',
    rounds: [
      { hour: 7, minute: 23, label: '아침' },
      { hour: 13, minute: 23, label: '오후' },
      { hour: 19, minute: 23, label: '저녁' },
    ],
    lastBuiltAt: topLevel('publishedAt'),
  },
];

/**
 * 깨울 수 없는 보드 — 현황만 본다.
 *
 * 사장님 2026-09-12 "나머지도 어제또는 10일날 돌린게 최신이야". 그 '나머지' 를 세어 보니
 * 예약이 도는 보드 넷 말고도 사이트가 싣는 판이 둘 더 있었다. 둘 다 깨울 워크플로가 없다:
 *
 *   제목 창고  깃허브 예약(brief-titles.yml)이 하루 네 번 돈다 — 실은 멀쩡하다.
 *              앱에 화면이 없어 사장님 눈에 안 보였을 뿐이다. 여기 숫자로 둔다.
 *   제휴       수집기가 제휴사 **로그인** 뒤에 있다(토스 쉐어링크·네이버 브랜드커넥트).
 *              그 로그인은 이 PC 의 쿠키 프로필에만 있어서 깃허브가 못 돈다.
 *              자동화하려면 제휴사 로그인을 깃허브 시크릿에 넣어야 하는데, 그건 사장님 결정이다.
 *              앱에서 눌러 돌리는 것도 지금은 안 된다 — 배포 패키지에 scripts/ 가 안 들어간다.
 *
 * 못 깨우는 것을 안 보여 주면 "왜 안 도는지" 를 또 사람이 세어 봐야 한다. 숫자와 이유를 같이 적는다.
 */
export type WatchOnlyBoard = {
  name: string;
  url: string;
  lastBuiltAt: (data: unknown) => number | null;
  /** 왜 여기서 못 깨우는지 — 화면에 그대로 적는다. */
  note: string;
};

export const WATCH_ONLY: readonly WatchOnlyBoard[] = [
  {
    name: '제목 창고',
    url: 'https://leaderspro.kr/data/brief-titles.json',
    lastBuiltAt: topLevel('generatedAt'),
    note: '하루 4회 예약으로 돕니다. 앱에는 화면이 없어 사이트에서 봅니다.',
  },
  {
    name: '제휴 황금키워드',
    url: 'https://leaderspro.kr/data/affiliate-campaigns.json',
    lastBuiltAt: topLevel('collectedAt'),
    note: '제휴사 로그인이 이 PC 에만 있어 깃허브가 못 돕니다 — 지금은 손으로 돌립니다.',
  },
];

/** 한국 요일(0=일). */
function kstWeekday(ms: number): number {
  return new Date(ms + KST_MS).getUTCDay();
}

/** 한국 날짜(YYYY-MM-DD). */
export function kstDay(ms: number): string {
  return new Date(ms + KST_MS).toISOString().slice(0, 10);
}

/**
 * 지금 기준으로 **가장 가까운 지난 회차**. 요일 제한이 있으면 그 요일만 센다.
 *
 * 오늘 회차가 아직 하나도 안 왔으면 지난 회차일의 마지막 회차를 돌려준다 — 한국 새벽에
 * 깨어난 감시견이 오늘 아침 회차를 기다리다 어제 저녁 회차를 놓치지 않게.
 * 며칠 전까지 거슬러도 못 찾으면 null(감시 대상 아님).
 */
export function dueRound(board: WatchedBoard, nowMs: number): { label: string; day: string; dueAtMs: number } | null {
  const rounds = [...board.rounds].sort((a, b) => (a.hour - b.hour) || (a.minute - b.minute));
  if (!rounds.length) return null;
  // 오늘부터 8일 전까지 훑는다 — 주 2회 보드도 반드시 하나는 걸린다.
  for (let back = 0; back <= 8; back += 1) {
    const kst = new Date(nowMs + KST_MS - back * DAY_MS);
    const midnightUtc = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - KST_MS;
    if (board.days && !board.days.includes(kstWeekday(midnightUtc))) continue;
    for (let i = rounds.length - 1; i >= 0; i -= 1) {
      const dueAtMs = midnightUtc + (rounds[i].hour * 60 + rounds[i].minute) * 60_000;
      if (dueAtMs <= nowMs) return { label: rounds[i].label, day: kstDay(dueAtMs), dueAtMs };
    }
  }
  return null;
}

/**
 * 이 회차가 이미 실렸나.
 *
 * @param lastBuiltAtMs 발행본이 말하는 마지막 시각. 못 읽었으면 null.
 * @returns null 이면 '모른다' — 깨우지 않는다. 못 읽은 것을 '비었다'로 읽으면 매번 깨운다.
 */
export function roundFilled(lastBuiltAtMs: number | null, dueAtMs: number): boolean | null {
  if (lastBuiltAtMs === null) return null;
  return lastBuiltAtMs >= dueAtMs;
}

const LEDGER = () => path.join(app.getPath('userData'), 'ci-watchdog.json');

function readLedger(): Record<string, string> {
  try { return JSON.parse(fs.readFileSync(LEDGER(), 'utf8')); } catch { return {}; }
}

function writeLedger(value: Record<string, string>): void {
  try { fs.writeFileSync(LEDGER(), JSON.stringify(value, null, 1), 'utf8'); } catch { /* 못 남겨도 회차는 산다 */ }
}

/** 발행본에서 마지막으로 실린 시각을 읽는다. 못 읽으면 null — '비었다'와 구분한다. */
export async function lastBuiltAtOf(board: WatchedBoard, fetchImpl: typeof fetch = fetch): Promise<number | null> {
  try {
    const res = await fetchImpl(`${board.url}?t=${Date.now()}`, { cache: 'no-store' } as RequestInit);
    if (!res.ok) return null;
    return board.lastBuiltAt(await res.json());
  } catch {
    return null;
  }
}

/**
 * 워크플로를 깨운다.
 *
 * respectDone=true 를 같이 넣는 것이 핵심이다 — 깨우는 사이에 예약이 먼저 실었으면
 * 워크플로의 문지기가 곧장 나간다. 선점 보드는 한 회차가 4시간 + BD 예산이다.
 */
function dispatch(workflow: string): Promise<{ ok: boolean; detail: string }> {
  return new Promise((resolve) => {
    const args = ['workflow', 'run', workflow, '--repo', REPO, '--ref', 'main', '-f', 'respectDone=true'];
    execFile('gh', args, { timeout: 60_000 }, (error, stdout, stderr) => {
      if (error) resolve({ ok: false, detail: String(stderr || error.message).slice(0, 200) });
      else resolve({ ok: true, detail: String(stdout || '').trim().slice(0, 200) });
    });
  });
}

/** 보드 하나를 살펴본다. 깨웠으면 acted. */
export async function checkBoardOnce(board: WatchedBoard, nowMs: number = Date.now()): Promise<{ acted: boolean; reason: string }> {
  const due = dueRound(board, nowMs);
  if (!due) return { acted: false, reason: `${board.name}: 아직 첫 회차 전이다` };
  if (nowMs - due.dueAtMs < GRACE_MS) return { acted: false, reason: `${board.name} ${due.label}: 예정 시각이 아직 안 지났다` };

  const ledger = readLedger();
  const key = `${board.workflow}-${due.day}-${due.label}`;
  if (ledger[key]) return { acted: false, reason: `${board.name} ${due.label}: 이미 깨웠다(${ledger[key]})` };

  const filled = roundFilled(await lastBuiltAtOf(board), due.dueAtMs);
  if (filled === null) return { acted: false, reason: `${board.name}: 발행본을 못 읽었다 — 이번엔 넘어간다` };
  if (filled) return { acted: false, reason: `${board.name} ${due.label}: 이미 실려 있다` };

  const result = await dispatch(board.workflow);
  if (result.ok) {
    writeLedger({ ...ledger, [key]: new Date(nowMs).toISOString() });
    console.log(`[CI-WATCHDOG] ${board.name} ${due.day} ${due.label} 회차가 비어 있어 워크플로를 깨웠다.`);
    return { acted: true, reason: `${board.name} ${due.label} 회차를 깨웠다` };
  }
  console.warn(`[CI-WATCHDOG] ${board.name} 깨우기 실패 — ${result.detail}`);
  return { acted: false, reason: `${board.name} 깨우기 실패: ${result.detail}` };
}

/** 한 바퀴 살펴본다. */
export async function checkOnce(nowMs: number = Date.now()): Promise<{ acted: boolean; reasons: string[] }> {
  const reasons: string[] = [];
  let acted = false;
  for (const board of BOARDS) {
    // 하나가 죽어도 나머지는 본다 — 감시견이 통째로 멈추면 아무도 안 깨운다.
    try {
      const got = await checkBoardOnce(board, nowMs);
      reasons.push(got.reason);
      if (got.acted) acted = true;
    } catch (error) {
      reasons.push(`${board.name}: ${String((error as Error)?.message || error).slice(0, 120)}`);
    }
  }
  return { acted, reasons };
}

/**
 * 사장님이 손으로 "지금 갱신"을 누른 경우 — 문지기를 거치지 않고 곧장 깨운다.
 *
 * 사장님 2026-09-12: "사이트는 수동으로 최신상태로 갱신할수있으면좋겠는데 …
 * 나만 누를수있게 조치를 취하면좋겠는데". 창구를 앱에 두는 것이 그 조치다 —
 * 깨우는 힘은 이 PC 의 gh 로그인에서 나오고, 남의 PC 에는 그 로그인이 없다.
 * 사이트에 버튼을 달면 아무나 누르고, 막으려면 서버에 깃허브 토큰을 새로 심어야 한다.
 */
/**
 * 같은 보드를 이만큼 안에 또 깨우지 않는다.
 *
 * 왜(실사고 2026-09-12): 내가 오늘의 글감을 07:11 과 07:12 에 **두 번** 보냈다.
 * 워크플로에 concurrency 가 걸려 있어 두 번째는 큐에 섰다가, 첫 회차가 끝난 뒤
 * 그대로 한 회차를 더 돌았다 — 아침 회차가 73개에서 65개로 덮였고 BD 한 회차분이 헛나갔다.
 * 손으로 돌린 실행은 "다시 돌려라"는 뜻이라 문지기를 일부러 안 거치게 해 뒀으니,
 * 연달아 누르는 것은 여기서 막아야 한다.
 *
 * 10분으로 둔 이유: 회차가 시작됐는지 깃허브 화면에서 확인하기에 충분하고,
 * 정말 다시 돌려야 할 상황(회차가 실패해서 곧장 재시도)까지 막지는 않는다.
 */
const REFRESH_COOLDOWN_MS = 10 * 60_000;

function refreshLedgerKey(workflow: string): string {
  return `수동:${workflow}`;
}

/** 남은 쿨다운(ms). 0 이면 지금 눌러도 된다. */
export function refreshCooldownLeft(lastIso: string | undefined, nowMs: number): number {
  if (!lastIso) return 0;
  const at = Date.parse(lastIso);
  if (!Number.isFinite(at)) return 0;
  return Math.max(0, REFRESH_COOLDOWN_MS - (nowMs - at));
}

export async function refreshNow(workflow: string, nowMs: number = Date.now()): Promise<{ ok: boolean; detail: string }> {
  const board = BOARDS.find((b) => b.workflow === workflow);
  if (!board) return { ok: false, detail: `모르는 보드다: ${workflow}` };

  // 감시견과 같은 장부를 쓴다 — 앱을 껐다 켜도 기억한다.
  const ledger = readLedger();
  const left = refreshCooldownLeft(ledger[refreshLedgerKey(workflow)], nowMs);
  if (left > 0) {
    const min = Math.ceil(left / 60_000);
    return {
      ok: false,
      detail: `${board.name} 회차를 방금 깨웠습니다. ${min}분 뒤에 다시 누를 수 있습니다.`
        + ' (연달아 누르면 회차가 두 번 돌아 BrightData 가 그만큼 더 나갑니다.)',
    };
  }

  return new Promise((resolve) => {
    execFile('gh', ['workflow', 'run', workflow, '--repo', REPO, '--ref', 'main'], { timeout: 60_000 }, (error, stdout, stderr) => {
      if (error) {
        const detail = String(stderr || error.message);
        resolve({
          ok: false,
          detail: /not found|ENOENT/i.test(detail)
            ? 'gh 명령을 못 찾았습니다 — 이 PC 에 GitHub CLI 로그인이 되어 있어야 합니다.'
            : detail.slice(0, 200),
        });
      } else {
        // 성공했을 때만 적는다 — 실패한 시도까지 세면 고칠 기회를 막는다.
        writeLedger({ ...readLedger(), [refreshLedgerKey(workflow)]: new Date(nowMs).toISOString() });
        resolve({ ok: true, detail: `${board.name} 회차를 깨웠습니다. 결과가 사이트에 실리기까지 시간이 걸립니다.` });
      }
    });
  });
}

/** 화면에 그릴 보드 현황 — 무엇이 언제 실렸고, 이번 회차가 비었는지. */
export type BoardStatus = {
  name: string;
  workflow: string;
  /** 마지막으로 실린 시각(ISO). 못 읽었으면 null. */
  lastBuiltAt: string | null;
  /** 이번 회차 예정 시각(ISO)과 이름. */
  dueAt: string | null;
  dueLabel: string | null;
  /** true=실렸다, false=비었다, null=못 읽었다(또는 회차 개념이 없는 보드). */
  filled: boolean | null;
  /** 깨울 수 없는 보드면 그 이유. 깨울 수 있으면 빈 문자열. */
  note: string;
};

export async function boardStatuses(nowMs: number = Date.now()): Promise<BoardStatus[]> {
  const wakeable = await Promise.all(BOARDS.map(async (board) => {
    const due = dueRound(board, nowMs);
    const last = await lastBuiltAtOf(board);
    return {
      name: board.name,
      workflow: board.workflow,
      lastBuiltAt: last === null ? null : new Date(last).toISOString(),
      dueAt: due ? new Date(due.dueAtMs).toISOString() : null,
      dueLabel: due ? due.label : null,
      filled: due ? roundFilled(last, due.dueAtMs) : null,
      note: '',
    };
  }));
  // 못 깨우는 보드도 같이 보여 준다 — 안 보이면 "왜 안 도는지" 를 또 사람이 세어 봐야 한다.
  const readOnly = await Promise.all(WATCH_ONLY.map(async (board) => {
    const last = await lastBuiltAtOf(board as unknown as WatchedBoard);
    return {
      name: board.name,
      workflow: '',
      lastBuiltAt: last === null ? null : new Date(last).toISOString(),
      dueAt: null,
      dueLabel: null,
      filled: null,
      note: board.note,
    };
  }));
  return [...wakeable, ...readOnly];
}

export function setupCiWatchdogHandlers(): void {
  if (!ipcMain.listenerCount('ci-board-status')) {
    ipcMain.handle('ci-board-status', async () => {
      try {
        return { success: true, boards: await boardStatuses() };
      } catch (error) {
        return { success: false, error: String((error as Error)?.message || error) };
      }
    });
  }

  if (!ipcMain.listenerCount('ci-board-refresh')) {
    ipcMain.handle('ci-board-refresh', async (_event, payload?: { workflow?: string }) => {
      const workflow = String(payload?.workflow || '').trim();
      if (!workflow) return { success: false, error: '어느 보드를 갱신할지 알 수 없습니다.' };
      const got = await refreshNow(workflow);
      return got.ok ? { success: true, message: got.detail } : { success: false, error: got.detail };
    });
  }
}

let timer: NodeJS.Timeout | null = null;

export function startCiWatchdog(): void {
  if (timer) return;
  // 앱이 막 켜졌을 때 한 번, 그다음부터 20분마다. 켜자마자 도는 것은 "밤새 빠진 회차"를 잡기 위함이다.
  setTimeout(() => { void checkOnce().catch(() => { /* 조용히 — 다음 차례에 다시 */ }); }, 60_000);
  timer = setInterval(() => { void checkOnce().catch(() => { /* 조용히 */ }); }, EVERY_MS);
  console.log(`[CI-WATCHDOG] ✅ 회차 감시견 시작 — 20분마다 보드 ${BOARDS.length}개를 보고 빠진 회차를 깨운다`);
}

export function stopCiWatchdog(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
