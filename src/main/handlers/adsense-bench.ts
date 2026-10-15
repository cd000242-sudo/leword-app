/**
 * 앱 애드센스 고수 벤치마크 IPC(2026-10-07 사장님 "앱에서는 1000개든 10000개든 상관없지 않니?").
 *
 * 사이트 판은 786곳 · 1,000장 상한이지만, 앱은 엑셀 6,412곳 전부를 이 PC 에서 읽고 카드도 자르지 않는다.
 * 실측(대표 검색어 · 문서수 · 입찰가)과 검색용 제목은 카드 하나씩 — 사장님 검색광고 키 · 구독 AI 로.
 *   adsense-bench-load      : 마지막 판
 *   adsense-bench-collect   : 6,412곳 수집(진행 'adsense-bench-progress' {done,total})
 *   adsense-bench-measure   : {id} 대표 검색어 · 월 검색량 · 블로그 문서수 · 파워링크 3위 입찰가
 *   adsense-bench-titles    : {id} 구글 · 다음 검색용 제목 20개(실측 대표 검색어가 있어야)
 */
import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { collectAdsenseBench, selectAppRound, withCardMetrics, withCardTitles, retainBenchMetrics, measureBenchBatch } from '../adsense-bench-service';
import { currentContext, generateContexts } from '../../utils/adsense-keyword-context';
import { readBriefProvider } from '../topic-brief-preferences';

const scriptsDir = () => path.join(app.getAppPath(), 'scripts');
const storeFile = () => path.join(app.getPath('userData'), 'adsense-bench', 'latest.json');
const cursorFile = () => path.join(app.getPath('userData'), 'adsense-bench', 'cursor.json');

function readCursor(): number {
  try { return Number(JSON.parse(fs.readFileSync(cursorFile(), 'utf8')).idleCursor) || 0; } catch { return 0; }
}
function writeCursor(idleCursor: number): void {
  try { fs.mkdirSync(path.dirname(cursorFile()), { recursive: true }); fs.writeFileSync(cursorFile(), JSON.stringify({ idleCursor }), 'utf8'); } catch { /* 다음 회차가 처음부터 돌 뿐 */ }
}

function readBoard(): any | null {
  try {
    const board = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
    const { rankOpportunities } = require(path.join(scriptsDir(), 'adsense-benchmarks-core.cjs'));
    return { ...board, candidates: rankOpportunities(board.candidates).map((c: any) => {
      const { material, context } = currentContext(c);
      return { ...c, contextFacts: material, context };
    }) };
  } catch { return null; }
}
function writeBoard(board: unknown): void {
  const file = storeFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(board), 'utf8');
  fs.renameSync(temp, file);
}

async function searchAdConfig() {
  const { EnvironmentManager } = await import('../../utils/environment-manager');
  const manager: any = typeof (EnvironmentManager as any).getInstance === 'function' ? (EnvironmentManager as any).getInstance() : new (EnvironmentManager as any)();
  const cfg = manager.getConfig();
  return {
    searchAd: { accessLicense: cfg.naverSearchAdAccessLicense || '', secretKey: cfg.naverSearchAdSecretKey || '', customerId: cfg.naverSearchAdCustomerId || '' },
    openApi: { clientId: cfg.naverClientId || '', clientSecret: cfg.naverClientSecret || '' },
  };
}

let collecting = false;
let measuring = false;
let contextualizing = false;

async function measureCard(card: any) {
  const { searchAd, openApi } = await searchAdConfig();
  if (!searchAd.accessLicense || !searchAd.secretKey || !searchAd.customerId) throw new Error('설정 · 키에서 네이버 검색광고 키와 고객 ID를 확인해 주세요');
  const measure = require(path.join(scriptsDir(), 'adsense-benchmarks-measure.cjs'));
  const { getNaverSearchAdKeywordVolume, getNaverSearchAdBidPairs } = await import('../../utils/naver-searchad-api');
  const { getNaverBlogDocumentCount } = await import('../../utils/naver-blog-api');
  const { bidKey } = await import('../../utils/money-keywords');
  const candidates: string[] = measure.candidatesOf(card);
  const volumes = new Map<string, number | null>();
  for (const row of await getNaverSearchAdKeywordVolume(searchAd, candidates)) volumes.set(String(row.keyword).replace(/\s+/g, ''), row.totalSearchVolume);
  const picked = measure.pickQuery(candidates, volumes);
  if (!picked) throw new Error('이 소재 낱말로는 실측 검색량이 잡히지 않았습니다');
  let documentCount: number | null = null;
  try { documentCount = await getNaverBlogDocumentCount(picked.query, openApi.clientId ? { config: openApi } as any : {}); } catch { documentCount = null; }
  let bid: number | null = null;
  try { const pair = (await getNaverSearchAdBidPairs(searchAd, [picked.query])).get(bidKey(picked.query)); bid = pair ? (pair.mobile ?? pair.pc ?? null) : null; } catch { bid = null; }
  const entry = { query: picked.query, searchVolume: picked.searchVolume, documentCount, bid, at: new Date().toISOString() };
  writeBoard(withCardMetrics(readBoard(), card.id, entry));
  return entry;
}

export function setupAdsenseBenchHandlers(): void {
  if (ipcMain.listenerCount('adsense-bench-load')) return;

  ipcMain.handle('adsense-bench-load', async () => ({ success: true, board: readBoard() }));

  ipcMain.handle('adsense-bench-context', async (_event, payload?: { id?: string }) => {
    if (contextualizing || collecting || measuring) return { success: false, error: '수집·분석 중입니다. 끝난 뒤 다시 실행해 주세요' };
    contextualizing = true;
    try {
      const board = readBoard();
      const cards = (board?.candidates || []).filter((c: any) => c.contextFacts?.sources?.length && !c.context && (!payload?.id || c.id === payload.id)).slice(0, 10);
      if (!cards.length) return { success: true, made: 0, missing: 0 };
      const { rows } = await generateContexts(cards, readBriefProvider(app.getPath('userData')));
      const latest = readBoard();
      if (!latest) throw new Error('판을 다시 불러와 주세요');
      const contexts = new Map(rows.map((r) => [r.id, r.context]));
      // 실행 중 소재나 실측이 바뀌었으면 이전 재료의 해석을 덮어쓰지 않는다.
      let made = 0;
      writeBoard({ ...latest, candidates: latest.candidates.map((c: any) => {
        const context = contexts.get(c.id);
        if (!context || c.contextFacts.fingerprint !== context.fingerprint) return c;
        made += 1; return { ...c, context };
      }) });
      return { success: true, made, missing: cards.length - made };
    } catch {
      return { success: false, error: '원문에 근거한 해석을 만들지 못했습니다. AI 연결을 확인해 주세요. 확인된 발행 근거는 계속 표시됩니다.' };
    } finally { contextualizing = false; }
  });

  ipcMain.handle('adsense-bench-collect', async (event) => {
    if (collecting || measuring) return { success: false, error: '이미 수집 중입니다 — 끝난 뒤 다시 눌러 주세요' };
    collecting = true;
    try {
      const runner = require(path.join(scriptsDir(), 'adsense-benchmarks.cjs'));
      const core = require(path.join(scriptsDir(), 'adsense-benchmarks-core.cjs'));
      let last = 0;
      // 7일 안에 쓴 곳은 매번 · 쉬는 곳은 300곳씩 돌아가며(티스토리 차단 예방 — 쉬는 5,500곳을 매번 두드리지 않는다).
      const round = selectAppRound(require(path.join(scriptsDir(), 'adsense-benchmarks-sources-all.json')).sources, readCursor(), 300);
      const summary = await collectAdsenseBench({
        loadSources: () => round.sources,
        collectAll: runner.collectAll,
        buildBoard: core.buildBoard,
        save: (board) => writeBoard({ ...retainBenchMetrics(board, readBoard()), scope: 'adsense-benchmark-app' }),
        now: () => new Date().toISOString(),
        concurrency: 24,
        onProgress: (done, total) => {
          // 화면 알림은 1% 단위로만(6,412번 보내지 않는다).
          if (done === total || done - last >= Math.max(1, Math.floor(total / 100))) { last = done; event.sender.send('adsense-bench-progress', { done, total }); }
        },
      });
      writeCursor(round.nextCursor);
      return { success: true, summary };
    } catch (error: any) {
      return { success: false, error: String(error?.message || error).slice(0, 200) };
    } finally {
      collecting = false;
    }
  });

  ipcMain.handle('adsense-bench-measure', async (_event, payload?: { id?: string }) => {
    if (collecting || measuring) return { success: false, error: '수집·분석 중입니다. 끝난 뒤 다시 실행해 주세요' };
    const board = readBoard();
    const card = board?.candidates?.find((c: any) => c.id === payload?.id);
    if (!card) return { success: false, error: '소재를 찾지 못했습니다 — 판을 다시 수집해 주세요' };
    try {
      measuring = true;
      const entry = await measureCard(card);
      return { success: true, metrics: entry };
    } catch (error: any) {
      return { success: false, error: String(error?.message || error).slice(0, 200) };
    } finally { measuring = false; }
  });

  ipcMain.handle('adsense-bench-measure-batch', async (event) => {
    if (collecting || measuring) return { success: false, error: '수집·분석 중입니다. 끝난 뒤 다시 실행해 주세요' };
    measuring = true;
    try {
      const board = readBoard();
      if (!board?.candidates?.length) return { success: false, error: '먼저 소재를 수집해 주세요' };
      const { searchAd } = await searchAdConfig();
      if (!searchAd.accessLicense || !searchAd.secretKey || !searchAd.customerId) return { success: false, error: '설정 · 키에서 네이버 검색광고 키와 고객 ID를 확인해 주세요' };
      const result = await measureBenchBatch(board.candidates, {
        now: Date.now(),
        measure: async (card) => {
          try {
            const m = await measureCard(card);
            return [m.searchVolume, m.documentCount, m.bid].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0);
          } finally {
            const latest = readBoard();
            if (latest) writeBoard({ ...latest, candidates: latest.candidates.map((c: any) => c.id === card.id ? { ...c, measurementAttemptAt: new Date().toISOString() } : c) });
          }
        },
        progress: (done, total) => { if (!event.sender.isDestroyed()) event.sender.send('adsense-bench-measure-progress', { done, total }); },
      });
      return { success: true, ...result };
    } catch (error: any) {
      return { success: false, error: String(error?.message || error).slice(0, 200) };
    } finally { measuring = false; }
  });

  /*
   * 글 구조 보기(2026-10-07 사장님 "벤치마킹 글을 볼 수 있어야 본보기가 된다 — 반드시"). 이 PC IP 가 티스토리 429 로 막혀도
   * 워커(다른 IP)가 소제목 목차 · 글자 수 · 이미지 · 표 · 광고 자리를 읽어 온다. 사이트와 같은 워커 액션 · 개인 키는 보내지 않는다.
   */
  ipcMain.handle('adsense-bench-outline', async (_event, payload?: { url?: string }) => {
    const url = String(payload?.url || '');
    if (!/^https:\/\//i.test(url)) return { ok: false, error: '글 주소가 올바르지 않습니다' };
    try {
      const res = await fetch('https://leword-keyword-api.leword.workers.dev/', {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'adsense-post-outline', url }), signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) return { ok: false, error: `글 구조를 받지 못했습니다(HTTP ${res.status})` };
      return await res.json();
    } catch (error: any) {
      return { ok: false, error: '글 구조를 받지 못했습니다 — ' + String(error?.message || error).slice(0, 120) };
    }
  });

  ipcMain.handle('adsense-bench-titles', async (_event, payload?: { id?: string }) => {
    const board = readBoard();
    const card = board?.candidates?.find((c: any) => c.id === payload?.id);
    if (!card) return { success: false, error: '소재를 찾지 못했습니다 — 판을 다시 수집해 주세요' };
    if (!card.metrics?.query) return { success: false, error: '먼저 [검색량 재기]로 대표 검색어를 실측해 주세요' };
    try {
      const { titlesForAdsenseCards } = await import('../../utils/adsense-title-engine');
      const result = await titlesForAdsenseCards([{ id: card.id, query: card.metrics.query, keyword: card.keyword, category: card.category, sourceTitles: (card.sources || []).map((s: any) => s.title).slice(0, 6) }]);
      const row = result.results.find((r) => r.id === card.id);
      if (!row || !row.titles.length) return { success: false, error: '고수 제목보다 나은 제목이 아직 없었습니다 — 한 번 더 눌러 주세요' };
      writeBoard(withCardTitles(readBoard() || board, card.id, row.titles, row.edges, row.masterBest));
      return { success: true, titles: row.titles, edges: row.edges, provider: result.provider };
    } catch (error: any) {
      return { success: false, error: String(error?.message || error).slice(0, 200) };
    }
  });
}
