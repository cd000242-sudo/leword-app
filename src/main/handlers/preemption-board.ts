/**
 * 선점 보드 — 앱에서 보고, 자리를 지금 다시 잰다.
 *
 * 사장님 "앱은 사이트 상위호환이어야지" · "진행".
 *
 * 사이트의 선점 보드는 브라이트데이터로 회차를 돌려 만든다. 그래서 자리(openSlot·serp)가
 * 회차 사이에 낡는다 — 실측 2026-09-10 기준 발행본의 measuredAt 이 09-06 이었다(나흘 전).
 * 사이트는 그걸 회차 밖에서 다시 잴 수 없다(BD 쿼터).
 *
 * 앱은 잴 수 있다. 이 PC 크로미엄으로 비용 0, 횟수 제한 없이. 그게 이 화면이 더하는 전부다:
 *   ① 발행된 보드를 그대로 읽는다(만들지 않는다 — 판정 규칙은 회차가 정한 것을 그대로 쓴다)
 *   ② 아무 행이나 자리를 지금 다시 재서 덮어쓴다. 다시 잰 것은 언제 쟀는지 같이 남긴다.
 *
 * 지어내지 않는다: 다시 안 잰 행은 회차가 잰 값 그대로이고, 그 값이 며칠 된 것인지 화면이 적는다.
 */
import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { measureKeywords } from './seat-measure';

export const PREEMPTION_PROGRESS_CHANNEL = 'preemption-board-progress';

const PUBLISHED = 'https://leaderspro.kr/data/preemption-board.json';
/** 한 번에 다시 잴 수 있는 상한. 건당 약 6초라 이 수가 곧 기다리는 시간이다. */
const REMEASURE_CAP = 40;

const DIR = () => path.join(app.getPath('userData'), 'preemption-board');
const CACHE = () => path.join(DIR(), 'board.json');
const SEATS = () => path.join(DIR(), 'reseats.json');

/** 내가 다시 잰 자리. 검색어(공백 제거) → 판정. 회차가 새로 와도 이건 남는다. */
export interface Reseat {
  keyword: string;
  verdict: string;
  facing: number | null;
  vacancy: number | null;
  reason: string;
  measuredAt: string;
}

function ensureDir(): void {
  try { fs.mkdirSync(DIR(), { recursive: true }); } catch { /* 이미 있으면 그만 */ }
}

function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T; } catch { return fallback; }
}

const norm = (value: string) => String(value || '').replace(/\s+/g, '');

export function readReseats(): Record<string, Reseat> {
  return readJson<Record<string, Reseat>>(SEATS(), {});
}

function writeReseats(map: Record<string, Reseat>): void {
  ensureDir();
  fs.writeFileSync(SEATS(), JSON.stringify(map, null, 1), 'utf8');
}

/** 발행본을 받는다. 못 받으면 지난번에 받아 둔 것을 준다 — 인터넷이 끊겨도 화면이 비지 않는다. */
async function fetchBoard(): Promise<{ board: any; fromCache: boolean }> {
  try {
    const res = await (globalThis as any).fetch(`${PUBLISHED}?t=${Date.now()}`, { signal: AbortSignal.timeout(20000) });
    if (res.ok) {
      const board = await res.json();
      ensureDir();
      fs.writeFileSync(CACHE(), JSON.stringify(board), 'utf8');
      return { board, fromCache: false };
    }
  } catch { /* 아래 캐시로 */ }
  return { board: readJson<any>(CACHE(), null), fromCache: true };
}

export function setupPreemptionBoardHandlers(): void {
  if (!ipcMain.listenerCount('preemption-board-get')) {
    ipcMain.handle('preemption-board-get', async () => {
      const { board, fromCache } = await fetchBoard();
      if (!board) return { success: false, error: '선점 보드를 받지 못했습니다 — 인터넷을 확인해 주세요.' };
      return { success: true, board, fromCache, reseats: readReseats() };
    });
  }

  if (!ipcMain.listenerCount('preemption-board-remeasure')) {
    ipcMain.handle('preemption-board-remeasure', async (event, payload?: { keywords?: string[] }) => {
      const list = (payload?.keywords || []).map((k) => String(k || '').trim()).filter(Boolean).slice(0, REMEASURE_CAP);
      if (list.length === 0) return { success: false, error: '다시 잴 검색어가 없습니다.' };
      try {
        const batch = await measureKeywords(list, {
          // 통합검색까지 읽는다 — 안 읽으면 카드답을 열림으로 적는다(글감 한 벌과 같은 이유).
          withStructure: true,
          onProgress: (p) => {
            try {
              event.sender.send(PREEMPTION_PROGRESS_CHANNEL, {
                done: p.done, total: p.total, keyword: p.keyword, verdict: p.verdict, blocked: p.blocked,
              });
            } catch { /* 창이 닫혔을 수 있다 */ }
          },
        });
        const map = readReseats();
        for (const row of batch.rows) {
          if (row.status !== 'ok' || !row.verdict) continue;
          map[norm(row.keyword)] = {
            keyword: row.keyword,
            verdict: String(row.verdict),
            facing: typeof row.facing === 'number' ? row.facing : null,
            vacancy: typeof row.vacancy === 'number' ? row.vacancy : null,
            reason: row.reason || '',
            measuredAt: row.measuredAt || new Date().toISOString(),
          };
        }
        writeReseats(map);
        return { success: true, reseats: map, summary: batch.summary, message: batch.message };
      } catch (error: any) {
        return { success: false, error: error?.message || '다시 재지 못했습니다' };
      }
    });
  }

  if (!ipcMain.listenerCount('preemption-board-clear-reseats')) {
    ipcMain.handle('preemption-board-clear-reseats', async () => {
      writeReseats({});
      return { success: true };
    });
  }

  console.log('[PREEMPTION-BOARD] ✅ 선점 보드(앱 전용) 핸들러 등록 완료');
}
