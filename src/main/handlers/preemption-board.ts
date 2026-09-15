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
import { readGoldenLocalBoard, readGoldenLocalShopping } from './golden-local';

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

  /*
   * 황금키워드 발굴 화면이 사이트 판을 깐다(2026-09-15, 사장님 "상위호환으로 발굴해줘야지").
   * 결정: 사이트 판 전부 + 앱이 더 찾은 말은 같은 관문 통과분. 행 규칙은 golden-site-merge 한 곳에 있다.
   * 카테고리를 바꿀 때마다 부르므로 받은 판은 5분 동안 다시 쓴다.
   */
  const GOLDEN_BOARD_REUSE_MS = 5 * 60 * 1000;
  let goldenBoardMemo: { board: any; fromCache: boolean; at: number } | null = null;
  if (!ipcMain.listenerCount('golden-site-rows')) {
    ipcMain.handle('golden-site-rows', async (_event, payload?: { category?: string }) => {
      const now = Date.now();
      if (!goldenBoardMemo || now - goldenBoardMemo.at > GOLDEN_BOARD_REUSE_MS) {
        const fetched = await fetchBoard();
        goldenBoardMemo = fetched.board ? { board: fetched.board, fromCache: fetched.fromCache, at: now } : null;
      }
      /*
       * 이 PC 판(2026-09-15, 2단계) — 앱이 사이트와 같은 스크립트로 이 PC 에서 찾아 쌓은 판(golden-local).
       * 같은 말이 양쪽에 있으면 더 최근에 잰 쪽을 남긴다. 사이트 판을 못 받아도 이 PC 판은 보인다.
       */
      const localBoard = readGoldenLocalBoard();
      if (!goldenBoardMemo && !localBoard) return { success: false, error: '사이트 황금 판을 받지 못했습니다 — 인터넷을 확인해 주세요.' };
      const { buildSiteGoldenRows, mergeGoldenBoardRows, SITE_GATE } = await import('../../utils/golden-site-merge');
      const { buildShoppingLaneRows, normalizeShoppingEntries } = await import('../../utils/golden-shopping-rows');
      const category = payload?.category || '';
      const reseats = readReseats();
      const board = goldenBoardMemo ? goldenBoardMemo.board : null;
      const siteRows = buildSiteGoldenRows(board, category, reseats);
      const localRows = buildSiteGoldenRows(localBoard, category, reseats, 'app-board');
      const rows = mergeGoldenBoardRows(siteRows, localRows);
      /*
       * 쇼핑 쪽으로 넘긴 말(2026-09-15, 사장님 "쇼핑으로 넘긴 말도 앱에 따로 보이기") — 황금 판 규칙은 그대로 두고
       * 넘긴 말을 따로 모아 준다. 이 PC 에 쌓아 둔 것(문서량 있음)을 먼저, 사이트 판 것을 다음에. 황금 판에 실린 말은 뺀다.
       */
      const shoppingRows = buildShoppingLaneRows([
        { from: 'app-board', entries: readGoldenLocalShopping() },
        { from: 'site-board', entries: normalizeShoppingEntries(board && board.routedShopping, board ? board.publishedAt || null : null) },
      ], category, rows.map((row) => row.keyword));
      return {
        success: true,
        publishedAt: board ? board.publishedAt || null : null,
        fromCache: goldenBoardMemo ? goldenBoardMemo.fromCache : true,
        total: board && Array.isArray(board.rows) ? board.rows.length : 0,
        siteError: board ? null : '사이트 황금 판을 받지 못해 이 PC 판만 보입니다.',
        localPublishedAt: localBoard ? localBoard.publishedAt || null : null,
        localTotal: localBoard ? localBoard.rows.length : 0,
        rows,
        shoppingRows,
        gate: SITE_GATE,
      };
    });
  }

  console.log('[PREEMPTION-BOARD] ✅ 선점 보드(앱 전용) 핸들러 등록 완료');
}
