/**
 * 로컬 SERP 페치 — 브라이트데이터 대신 **이 PC 의 크로미엄**으로 네이버 검색 결과 HTML 을 받는다.
 * 선점 보드 배치(preemption-board-batch.js --fetcher=local)가 쓴다. 반환 모양은 brightDataFetch 와 같아서
 * 판정 코드(analyzeSerp·readSerpStructure)는 한 줄도 안 바뀐다.
 *
 * 왜(2026-09-09 새벽): 회차 34207432274 의 브라이트데이터 단계가 4시간 넘게 걸려 잡 상한에 걸렸다.
 * 사장님 "오늘 밤 보드는 무조건 나와야 한다" → 자리 실측기(seat-measure)와 같은 로컬 경로로 잰다.
 * 차단 회피 규칙도 같다: 직렬·요청 사이 1.2~1.8초·403/429 는 rateLimited 로 알려 배치가 속도를 늦추게.
 */
const DESKTOP_UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

export interface LocalSerpResult {
  ok: boolean;
  body: string;
  status?: number;
  rateLimited?: boolean;
  quotaBlocked?: boolean;
  error?: string;
}

let browser: any = null;
let chain: Promise<unknown> = Promise.resolve();
let calls = 0;
let blocked = 0;
let consecutiveBlocked = 0;

async function ensureBrowser(): Promise<any> {
  if (browser) return browser;
  const { browserPool } = await import('./puppeteer-pool');
  browser = await browserPool.acquire();
  return browser;
}

async function fetchOnce(url: string): Promise<LocalSerpResult> {
  const b = await ensureBrowser();
  let page: any = null;
  try {
    page = await b.newPage({
      userAgent: DESKTOP_UAS[calls % DESKTOP_UAS.length],
      viewport: { width: 1280, height: 800 },
      locale: 'ko-KR',
      extraHTTPHeaders: { 'Accept-Language': 'ko-KR,ko;q=0.9' },
    });
    if (typeof page.evaluateOnNewDocument === 'function') {
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });
    }
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    const status = resp ? resp.status() : 0;
    if (!resp || status === 403 || status === 429) {
      blocked += 1;
      consecutiveBlocked += 1;
      // 막히면 길게 쉰다 — 계속 두드리면 IP 가 더 오래 막힌다.
      await new Promise((resolve) => setTimeout(resolve, 20000 + Math.random() * 10000));
      return { ok: false, body: '', status, rateLimited: true, error: `blocked ${status}` };
    }
    consecutiveBlocked = 0;
    await page.waitForTimeout(700 + Math.random() * 500);
    const body = String((await page.content()) || '');
    if (body.length < 5000) return { ok: false, body: '', status, error: 'short-body' };
    return { ok: true, body, status };
  } catch (error: any) {
    return { ok: false, body: '', error: String(error?.message || error).slice(0, 80) };
  } finally {
    try { if (page) await page.close(); } catch { /* 이미 닫힘 */ }
    calls += 1;
  }
}

/** brightDataFetch(url) 자리에 그대로 꽂는다 — 직렬 큐 + 요청 사이 1.2~1.8초. */
export function localSerpFetch(url: string): Promise<LocalSerpResult> {
  const run = chain.then(async () => {
    if (consecutiveBlocked >= 5) {
      return { ok: false, body: '', rateLimited: true, error: '5연속 차단 — 잠시 멈춤' } as LocalSerpResult;
    }
    const result = await fetchOnce(url);
    await new Promise((resolve) => setTimeout(resolve, 1200 + Math.random() * 600));
    return result;
  });
  chain = run.catch(() => undefined);
  return run;
}

export function localSerpStats(): { calls: number; blocked: number; consecutiveBlocked: number } {
  return { calls, blocked, consecutiveBlocked };
}

export async function closeLocalSerpFetch(): Promise<void> {
  if (!browser) return;
  try {
    const { browserPool } = await import('./puppeteer-pool');
    browserPool.release(browser);
    await browserPool.closeIdle();
  } catch { /* 풀이 이미 닫혔을 수 있다 */ }
  browser = null;
}
