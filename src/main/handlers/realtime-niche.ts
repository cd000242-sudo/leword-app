/**
 * 실시간 틈새 — 앱 전용, 상한 없는 판.
 *
 * 사장님 2026-09-10: "실시간 검색어 틈새면 실시간 검색어가 계속 갱신되는데 그걸 따라가야 되잖아",
 * "브라이트데이터 말고 앱에서 긁어오게 못 하니?", "없애면 안 되겠다 … 최선의 방법으로 개선시켜".
 *
 * 그래서 사이트 보드(브라이트데이터·하루 3회)는 그대로 두고, 앱에 **같은 판정을 무제한으로**
 * 돌리는 판을 따로 연다. 나뉜 역할은 이렇다:
 *   사이트  PC 가 꺼져 있어도 도는 최소 보장선. 유료 쿼터라 회차당 자리 20건 상한.
 *   앱      이 PC 의 크로미엄으로 직접 받는다. 비용 0, 자리 상한 없음, 몇 분 간격으로 따라감.
 *
 * 판정 규칙은 한 벌이다 — 사이트와 같은 엔진(huntIssueNicheBoard)·같은 자리 판정
 * (planSlotMeasurement/applySlotResults·analyzeSerp·verdictFor)을 쓴다. 다른 건 자리를 받아오는
 * 창구뿐이다(브라이트데이터 → localSerpFetch). 그래야 두 판이 서로 다른 답을 내지 않는다.
 *
 * 차단 규칙도 자리 실측기와 같다: 직렬 · 요청 사이 1.2~1.8초 · 403/429 는 '못 잼' · 5연속이면 멈춤.
 * 집 회선으로 몰아치면 사장님 네이버 사용까지 눈총을 받는다 — 속도보다 안전이 먼저다.
 */
import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { huntIssueNicheBoard, type IssueNicheKeyword } from '../../utils/issue-niche-hunter';
import {
  applySlotResults, planSlotMeasurement, readSlotCache, toSlotSerp, type SlotCache,
} from '../../utils/issue-slot-measure';
import type { IssueSlotSerp } from '../../utils/issue-niche-hunter';
import { analyzeSerp, verdictFor } from '../../utils/serp-winnability';
import { localSerpFetch, localSerpStats } from '../../utils/local-serp-fetch';
import { EnvironmentManager } from '../../utils/environment-manager';

export const REALTIME_NICHE_PROGRESS_CHANNEL = 'realtime-niche-progress';

/** 사이트 회차와 같은 값(2026-09-10 상향). 두 판이 같은 문을 써야 답이 같다. */
const DOC_COUNT_MAX = 20000;
/** 자리를 잴 상한 — 사실상 없음. 그래도 폭주 방지로 한 회차 200건에서 끊는다. */
const SLOT_MAX = 200;

const DIR = () => path.join(app.getPath('userData'), 'realtime-niche');
const LATEST = () => path.join(DIR(), 'latest.json');
const CACHE = () => path.join(DIR(), 'slot-cache.json');

export interface RealtimeNicheRow {
  keyword: string;
  baseKeyword: string;
  issueType: string;
  searchVolume: number | null;
  documentCount: number | null;
  hasLiveDemand: boolean;
  demandStatus: string | null;
  /** 열림 · 반열림 · 잠김 · 못 잼 */
  seat: string;
  seatFacing: number | null;
  seatVacancy: number | null;
  verdict: 'niche' | 'pending' | 'preemption' | 'out';
  reasons: string[];
  measuredAt: string;
}

export interface RealtimeNicheResult {
  ranAt: string;
  seconds: number;
  rows: RealtimeNicheRow[];
  summary: {
    issues: number; candidates: number; trafficPass: number; demandPass: number;
    slotMeasured: number; blocked: number; niche: number; pending: number; preemption: number;
  };
  /** 이번에 처음 본 검색어(직전 회차에 없던 것). 실시간을 따라가고 있다는 증거다. */
  newKeywords: string[];
  message: string | null;
}

export interface RealtimeNicheProgress {
  phase: 'hunt' | 'slot' | 'done';
  current?: number;
  total?: number;
  keyword?: string;
  message: string;
}

let running = false;
let abortRequested = false;
let autoTimer: NodeJS.Timeout | null = null;
let autoMinutes = 0;

function ensureDir(): void {
  try { fs.mkdirSync(DIR(), { recursive: true }); } catch { /* 있으면 그만 */ }
}

function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T; } catch { return fallback; }
}

function writeJson(file: string, value: unknown): void {
  ensureDir();
  try { fs.writeFileSync(file, JSON.stringify(value, null, 1), 'utf8'); } catch { /* 저장 실패는 회차를 죽이지 않는다 */ }
}

function blogTabUrl(keyword: string): string {
  return `https://search.naver.com/search.naver?ssc=tab.blog.all&sm=tab_jum&query=${encodeURIComponent(keyword)}`;
}

/** 한 검색어의 블로그탭 상위 10 을 이 PC 브라우저로 받아 판정한다. 실패는 null — '못 잼'으로 남긴다. */
async function measureSlotLocally(keyword: string): Promise<{ serp: IssueSlotSerp | null; blocked: boolean }> {
  const res = await localSerpFetch(blogTabUrl(keyword));
  if (!res.ok || !res.body) return { serp: null, blocked: Boolean(res.rateLimited) };
  const analysis = analyzeSerp(res.body, keyword);
  return { serp: toSlotSerp(analysis, verdictFor(analysis), new Date().toISOString()), blocked: false };
}

const SEAT_LABEL: Record<string, string> = { winnable: '열림', contested: '반열림', locked: '잠김', unmeasured: '못 잼' };

function toRow(row: IssueNicheKeyword): RealtimeNicheRow {
  const verdict: RealtimeNicheRow['verdict'] = row.isNiche ? 'niche'
    : row.isPending ? 'pending'
      : row.isPreemption ? 'preemption' : 'out';
  return {
    keyword: row.keyword,
    baseKeyword: row.baseKeyword,
    issueType: String(row.issueType || ''),
    searchVolume: row.searchVolume ?? null,
    documentCount: row.documentCount ?? null,
    hasLiveDemand: Boolean(row.hasLiveDemand),
    demandStatus: row.demandStatus ?? null,
    seat: SEAT_LABEL[String(row.slotStatus)] || '못 잼',
    seatFacing: row.serp ? row.serp.exactTitleHits : null,
    seatVacancy: row.serp && typeof (row.serp as any).openSlot === 'number' ? (row.serp as any).openSlot : null,
    verdict,
    reasons: Array.isArray(row.reasons) ? row.reasons : [],
    measuredAt: new Date().toISOString(),
  };
}

/**
 * 한 회차 — 사이트 회차와 같은 엔진으로 뽑고, 자리는 이 PC 로 **전부** 잰다.
 * 사이트는 유료 쿼터 때문에 20건에서 끊지만 여기는 안 끊는다. 그게 앱을 쓰는 이유다.
 */
export async function runRealtimeNiche(
  options: { onProgress?: (p: RealtimeNicheProgress) => void; issueLimit?: number; maxCandidates?: number } = {},
): Promise<RealtimeNicheResult> {
  const started = Date.now();
  const report = options.onProgress ?? (() => {});
  const manager = typeof (EnvironmentManager as any).getInstance === 'function'
    ? (EnvironmentManager as any).getInstance() : new (EnvironmentManager as any)();
  const cfg = manager.getConfig();
  const datalab = {
    clientId: cfg.naverClientId || process.env.NAVER_CLIENT_ID || '',
    clientSecret: cfg.naverClientSecret || process.env.NAVER_CLIENT_SECRET || '',
  };
  if (!datalab.clientId || !datalab.clientSecret) {
    throw new Error('네이버 오픈 API 키가 없습니다. 설정 · 키 화면에서 넣어 주세요.');
  }

  report({ phase: 'hunt', message: '실시간 검색어를 받고 후보를 고르는 중…' });
  const board = await huntIssueNicheBoard({
    config: datalab as any,
    issueLimit: options.issueLimit ?? 16,
    maxCandidates: options.maxCandidates ?? 240,
    docCountMax: DOC_COUNT_MAX,
    useLiveDemandRoute: true,
    onProgress: (p: any) => report({
      phase: 'hunt',
      current: p?.current, total: p?.total,
      message: p?.message || `${p?.phase || ''} ${p?.keyword || ''}`.trim() || '후보를 재는 중…',
    }),
  });

  const thresholds = { docCountMax: DOC_COUNT_MAX, useLiveDemandRoute: true };
  const cache: SlotCache = readSlotCache(readJson<unknown>(CACHE(), null));
  const plan = planSlotMeasurement({
    ledgerRows: board.rows,
    prevRows: [],
    cache,
    nowMs: Date.now(),
    max: SLOT_MAX,
    thresholds,
  });

  const results = new Map<string, IssueSlotSerp>();
  let blocked = 0;
  for (let index = 0; index < plan.targets.length; index += 1) {
    if (abortRequested) break;
    const keyword = plan.targets[index];
    report({
      phase: 'slot', current: index + 1, total: plan.targets.length, keyword,
      message: `자리 재는 중 ${index + 1}/${plan.targets.length} · ${keyword}`,
    });
    const measured = await measureSlotLocally(keyword);
    if (measured.serp) results.set(keyword, measured.serp);
    else if (measured.blocked) {
      blocked += 1;
      // 자리 실측기와 같은 규칙 — 5연속 차단이면 그만둔다. 억지로 더 두드리면 회선이 막힌다.
      if (localSerpStats().consecutiveBlocked >= 5) break;
    }
  }

  const applied = applySlotResults(plan, results, thresholds);
  writeJson(CACHE(), applied.cache);

  const rows = applied.ledgerRows
    .filter((row) => row.isNiche || row.isPending || row.isPreemption)
    .map(toRow)
    .sort((a, b) => {
      const rank = (v: string) => (v === 'niche' ? 0 : v === 'preemption' ? 1 : 2);
      return rank(a.verdict) - rank(b.verdict) || (b.searchVolume ?? 0) - (a.searchVolume ?? 0);
    });

  const previous = readJson<RealtimeNicheResult | null>(LATEST(), null);
  const seenBefore = new Set((previous?.rows || []).map((r) => r.keyword.replace(/\s+/g, '')));
  const newKeywords = rows.map((r) => r.keyword).filter((k) => !seenBefore.has(k.replace(/\s+/g, '')));

  const result: RealtimeNicheResult = {
    ranAt: new Date().toISOString(),
    seconds: Math.round((Date.now() - started) / 1000),
    rows,
    summary: {
      issues: board.issues.length,
      candidates: board.rows.length,
      trafficPass: board.rows.filter((r) => r.trafficGate).length,
      demandPass: board.rows.filter((r) => r.demandGate).length,
      slotMeasured: results.size,
      blocked,
      niche: rows.filter((r) => r.verdict === 'niche').length,
      pending: rows.filter((r) => r.verdict === 'pending').length,
      preemption: rows.filter((r) => r.verdict === 'preemption').length,
    },
    newKeywords,
    message: blocked > 0 ? `네이버가 ${blocked}건을 막았습니다 — 잠시 뒤 다시 재면 채워집니다.` : null,
  };
  writeJson(LATEST(), result);
  report({ phase: 'done', message: `끝 — 틈새 ${result.summary.niche} · 자리 잰 것 ${results.size} · ${result.seconds}초` });
  return result;
}

function stopAuto(): void {
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  autoMinutes = 0;
}

export function setupRealtimeNicheHandlers(): void {
  if (!ipcMain.listenerCount('realtime-niche-get')) {
    ipcMain.handle('realtime-niche-get', async () => ({
      success: true,
      result: readJson<RealtimeNicheResult | null>(LATEST(), null),
      running,
      autoMinutes,
    }));
  }

  if (!ipcMain.listenerCount('realtime-niche-abort')) {
    ipcMain.handle('realtime-niche-abort', async () => { abortRequested = true; return { success: true }; });
  }

  if (!ipcMain.listenerCount('realtime-niche-run')) {
    ipcMain.handle('realtime-niche-run', async (event, payload?: { issueLimit?: number; maxCandidates?: number }) => {
      if (running) return { success: false, error: '이미 재고 있습니다.' };
      running = true;
      abortRequested = false;
      try {
        const result = await runRealtimeNiche({
          issueLimit: payload?.issueLimit,
          maxCandidates: payload?.maxCandidates,
          onProgress: (p) => {
            try { event.sender.send(REALTIME_NICHE_PROGRESS_CHANNEL, p); } catch { /* 창이 닫혔을 수 있다 */ }
          },
        });
        return { success: true, result };
      } catch (error: any) {
        return { success: false, error: error?.message || '실시간 틈새 실측 실패' };
      } finally {
        running = false;
      }
    });
  }

  if (!ipcMain.listenerCount('realtime-niche-auto')) {
    ipcMain.handle('realtime-niche-auto', async (event, payload?: { minutes?: number }) => {
      const minutes = Math.max(0, Math.floor(Number(payload?.minutes) || 0));
      stopAuto();
      if (minutes === 0) return { success: true, autoMinutes: 0 };
      /*
       * 30분 아래로는 안 내린다. 실측(2026-09-10): 후보 40개만 재는 데도 118초가 걸렸고,
       * 정상 회차(후보 240 + 자리 실측)는 10~15분이다. 15분 간격이면 회선이 쉬는 틈이 없어
       * 집 주소가 네이버에서 눈총을 받는다 — 사장님 개인 네이버 사용까지 영향을 받는다.
       */
      autoMinutes = Math.max(30, minutes);
      autoTimer = setInterval(() => {
        if (running) return;
        running = true;
        abortRequested = false;
        runRealtimeNiche({
          onProgress: (p) => { try { event.sender.send(REALTIME_NICHE_PROGRESS_CHANNEL, p); } catch { /* 무시 */ } },
        })
          .then((result) => { try { event.sender.send(REALTIME_NICHE_PROGRESS_CHANNEL, { phase: 'done', message: '자동 회차 끝', result }); } catch { /* 무시 */ } })
          .catch(() => { /* 자동 회차 실패는 조용히 — 다음 차례에 다시 한다 */ })
          .finally(() => { running = false; });
      }, autoMinutes * 60_000);
      return { success: true, autoMinutes };
    });
  }

  console.log('[REALTIME-NICHE] ✅ 실시간 틈새(앱 전용) 핸들러 등록 완료');
}

export function stopRealtimeNicheScheduler(): void {
  stopAuto();
}
