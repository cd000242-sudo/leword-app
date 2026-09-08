/**
 * 자리 실측기 IPC — 내 PC 의 크로미엄(puppeteer-pool)으로 네이버 검색 결과를 열어 센다.
 * 앱 전용(2026-09-08): 브라이트데이터를 쓰지 않는다. 한도는 내 브라우저와 네이버의 차단뿐이다.
 *
 * 차단 회피는 노출 추적(exposure-tracking)과 같은 규칙을 그대로 쓴다:
 *   직렬 호출 · 요청 사이 1.2~1.8초 · 403/429 는 '차단' · 5건 연속 차단이면 중단.
 * 차단·오류는 결과 행으로 남기되 잰 척하지 않는다(verdict '자료없음', blocked/error 표시).
 */
import { ipcMain } from 'electron';
import { measureSeat, parseSeatKeywords, seatAllTabUrl, seatBlogTabUrl, type SeatMeasurement } from '../../utils/seat-measure';

const DESKTOP_UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

export const SEAT_MEASURE_MAX_KEYWORDS = 100;
export const SEAT_MEASURE_PROGRESS_CHANNEL = 'seat-measure-progress';

type FetchStatus = 'ok' | 'blocked' | 'error';

export interface SeatRow extends Partial<SeatMeasurement> {
  keyword: string;
  status: FetchStatus;
  error?: string;
}

let abortRequested = false;

/** 한 페이지를 열어 HTML 을 돌려준다. 403/429 는 blocked. */
async function fetchHtml(browser: any, url: string): Promise<{ status: FetchStatus; html: string }> {
  let page: any = null;
  const t0 = Date.now();
  const step = (label: string) => console.log(`[SEAT-MEASURE] ${label} +${Date.now() - t0}ms ${url.slice(0, 80)}`);
  try {
    step('newPage');
    page = await browser.newPage({
      userAgent: DESKTOP_UAS[Math.floor(Math.random() * DESKTOP_UAS.length)],
      viewport: { width: 1280, height: 800 },
      locale: 'ko-KR',
      extraHTTPHeaders: { 'Accept-Language': 'ko-KR,ko;q=0.9' },
    });
    if (typeof page.evaluateOnNewDocument === 'function') {
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });
    }
    step('goto');
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    step(`goto 응답 ${resp ? resp.status() : 'null'}`);
    if (!resp || resp.status() === 403 || resp.status() === 429) return { status: 'blocked', html: '' };
    await page.waitForTimeout(800 + Math.random() * 600);
    const html = await page.content();
    step(`content ${String(html || '').length}자`);
    return { status: 'ok', html: String(html || '') };
  } catch (error: any) {
    console.warn('[SEAT-MEASURE] 페이지 오류:', error?.message);
    return { status: 'error', html: '' };
  } finally {
    step('close');
    try { if (page) await page.close(); } catch { /* 이미 닫힘 */ }
    step('closed');
  }
}

export function setupSeatMeasureHandlers(): void {
  if (!ipcMain.listenerCount('seat-measure-abort')) {
    ipcMain.handle('seat-measure-abort', async () => {
      abortRequested = true;
      return { success: true };
    });
  }

  if (!ipcMain.listenerCount('seat-measure-run')) {
    ipcMain.handle('seat-measure-run', async (event, payload?: { keywords?: string[] | string; withStructure?: boolean }) => {
      const list = Array.isArray(payload?.keywords)
        ? parseSeatKeywords(payload!.keywords!.join('\n'), SEAT_MEASURE_MAX_KEYWORDS)
        : parseSeatKeywords(String(payload?.keywords || ''), SEAT_MEASURE_MAX_KEYWORDS);
      if (list.length === 0) return { success: false, error: '잴 키워드가 없습니다(2~40자, 최대 100개).' };
      const withStructure = payload?.withStructure !== false;
      abortRequested = false;

      let browser: any = null;
      const rows: SeatRow[] = [];
      let blocked = 0;
      let errored = 0;
      let blockedStreak = 0;
      let aborted = false;
      const startedAt = Date.now();
      try {
        const { browserPool } = await import('../../utils/puppeteer-pool');
        browser = await browserPool.acquire();
        for (const keyword of list) {
          if (abortRequested) { aborted = true; break; }
          const blog = await fetchHtml(browser, seatBlogTabUrl(keyword));
          let row: SeatRow;
          if (blog.status !== 'ok') {
            row = { keyword, status: blog.status, verdict: '자료없음' };
            if (blog.status === 'blocked') { blocked += 1; blockedStreak += 1; } else { errored += 1; blockedStreak = 0; }
          } else {
            await new Promise((resolve) => setTimeout(resolve, 900 + Math.random() * 500));
            const all = withStructure ? await fetchHtml(browser, seatAllTabUrl(keyword)) : { status: 'ok' as FetchStatus, html: '' };
            const measured = measureSeat({ keyword, blogTabHtml: blog.html, allTabHtml: all.status === 'ok' && all.html ? all.html : null });
            row = { ...measured, status: 'ok' };
            if (all.status === 'blocked') { blocked += 1; blockedStreak += 1; row.error = '통합검색 차단 — 카드·광고는 안 봄'; } else { blockedStreak = 0; }
          }
          rows.push(row);
          try {
            event.sender.send(SEAT_MEASURE_PROGRESS_CHANNEL, {
              done: rows.length, total: list.length, blocked, errored, keyword, verdict: row.verdict, status: row.status,
            });
          } catch { /* 창이 닫혔을 수 있다 */ }
          if (blockedStreak >= 5) {
            console.warn('[SEAT-MEASURE] 차단 5건 연속 → 중단');
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 1200 + Math.random() * 600));
        }
      } catch (error: any) {
        return { success: false, error: error?.message || '자리 실측 실패', rows };
      } finally {
        if (browser) {
          try {
            const { browserPool } = await import('../../utils/puppeteer-pool');
            browserPool.release(browser);
          } catch { /* 풀이 이미 닫혔을 수 있다 */ }
        }
      }

      const measured = rows.filter((r) => r.status === 'ok');
      const count = (v: string) => measured.filter((r) => r.verdict === v).length;
      return {
        success: true,
        rows,
        summary: {
          requested: list.length, measured: measured.length, blocked, errored, aborted,
          open: count('열림'), contested: count('반열림'), locked: count('잠김'), card: count('카드답'),
          seconds: Math.round((Date.now() - startedAt) / 1000),
        },
        message: blockedStreak >= 5
          ? '네이버가 일시 차단했습니다(IP 보호) — 10~30분 뒤 다시 재세요. 잰 것까지는 남겼습니다.'
          : (blocked > 0 ? `${blocked}건은 차단돼 못 쟀습니다(다시 재기)` : null),
      };
    });
  }
  console.log('[SEAT-MEASURE] ✅ 자리 실측기 핸들러 등록 완료');
}
