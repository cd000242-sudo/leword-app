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
const PREFS = () => path.join(DIR(), 'prefs.json');

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
    slotMeasured: number;
    /** 자리를 재려고 실제로 시도한 수. slotMeasured 와 다르면 그 차이가 실패다. */
    attempted: number;
    blocked: number;
    /** 막힘(403/429)이 아닌 실패 — 창 두 개·네트워크·타임아웃 등. 전에는 어디에도 안 세어졌다. */
    failed: number;
    niche: number; pending: number; preemption: number;
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

/**
 * 한 검색어의 블로그탭 상위 10 을 이 PC 브라우저로 받아 판정한다.
 *
 * 실패하면 **왜 실패했는지 같이 돌려준다.** 전에는 버렸다 —
 * 실측(2026-09-11 01:05 회차): 자리를 기다리는 5건을 시도해 5건 다 실패했는데
 * blocked 는 403/429 만 세므로 그 실패가 어디에도 안 남았다(slotMeasured 0 · blocked 0 · message null).
 * 화면에는 '못 잼' 세 글자만 떴고 사장님은 이유를 알 길이 없었다.
 * (그때 진짜 원인은 앱 인스턴스가 둘이라 브라우저를 다툰 것. 창구 자체는 멀쩡했다 — ok=200·478KB·3.7초.)
 */
async function measureSlotLocally(keyword: string): Promise<{ serp: IssueSlotSerp | null; blocked: boolean; reason: string | null }> {
  const res = await localSerpFetch(blogTabUrl(keyword));
  if (!res.ok || !res.body) {
    const reason = res.error || (res.status ? `응답 ${res.status}` : '검색 화면을 못 받음');
    return { serp: null, blocked: Boolean(res.rateLimited), reason };
  }
  const analysis = analyzeSerp(res.body, keyword);
  return { serp: toSlotSerp(analysis, verdictFor(analysis), new Date().toISOString()), blocked: false, reason: null };
}

const SEAT_LABEL: Record<string, string> = { winnable: '열림', contested: '반열림', locked: '잠김', unmeasured: '못 잼' };

/**
 * 자리를 안 잰 두 가지를 구분한다.
 *   '안 잼' — 앞 관문(트래픽·수요)을 통과 못 해 애초에 대상이 아니었다. 정상이다.
 *   '못 잼' — 대상이었는데 재다 실패했다. 다시 누르면 채워진다.
 * 한 단어로 덮으면 사장님이 무엇을 해야 할지 알 수 없다.
 */
function seatLabelOf(row: IssueNicheKeyword, attempted: ReadonlySet<string>): string {
  const label = SEAT_LABEL[String(row.slotStatus)];
  if (label && label !== '못 잼') return label;
  return attempted.has(row.keyword) ? '못 잼' : '안 잼';
}

function toRow(row: IssueNicheKeyword, attempted: ReadonlySet<string>): RealtimeNicheRow {
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
    seat: seatLabelOf(row, attempted),
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
  const attempted = new Set<string>();
  const failReasons: string[] = [];
  let blocked = 0;
  let failed = 0;
  for (let index = 0; index < plan.targets.length; index += 1) {
    if (abortRequested) break;
    const keyword = plan.targets[index];
    report({
      phase: 'slot', current: index + 1, total: plan.targets.length, keyword,
      message: `자리 재는 중 ${index + 1}/${plan.targets.length} · ${keyword}`,
    });
    attempted.add(keyword);
    const measured = await measureSlotLocally(keyword);
    if (measured.serp) { results.set(keyword, measured.serp); continue; }
    // 막힘(403/429)과 그 밖의 실패를 따로 센다 — 전에는 후자가 어디에도 안 남았다.
    if (measured.blocked) {
      blocked += 1;
      // 자리 실측기와 같은 규칙 — 5연속 차단이면 그만둔다. 억지로 더 두드리면 회선이 막힌다.
      if (localSerpStats().consecutiveBlocked >= 5) break;
      continue;
    }
    failed += 1;
    if (measured.reason && failReasons.length < 3 && !failReasons.includes(measured.reason)) {
      failReasons.push(measured.reason);
    }
  }

  const applied = applySlotResults(plan, results, thresholds);
  writeJson(CACHE(), applied.cache);

  const rows = applied.ledgerRows
    .filter((row) => row.isNiche || row.isPending || row.isPreemption)
    .map((row) => toRow(row, attempted))
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
      attempted: attempted.size,
      blocked,
      failed,
      niche: rows.filter((r) => r.verdict === 'niche').length,
      pending: rows.filter((r) => r.verdict === 'pending').length,
      preemption: rows.filter((r) => r.verdict === 'preemption').length,
    },
    newKeywords,
    /*
     * 안 재진 자리는 반드시 이유를 말한다. 전에는 막힘(403/429)만 보고 그 밖의 실패는 조용히 넘겨서,
     * 5건을 시도해 5건 다 실패한 회차가 "자리 잰 것 0 · 막힘 0 · 안내 없음"으로 끝났다.
     */
    message: blocked > 0
      ? `네이버가 ${blocked}건을 막았습니다 — 잠시 뒤 다시 재면 채워집니다.`
      : (failed > 0
        ? `자리 ${failed}건을 못 쟀습니다${failReasons.length ? ` (${failReasons.join(' · ')})` : ''} — 다시 누르면 채워집니다. LEWORD 창을 두 개 띄우면 브라우저를 다퉈 이렇게 됩니다.`
        : null),
  };
  writeJson(LATEST(), result);
  report({ phase: 'done', message: `끝 — 틈새 ${result.summary.niche} · 자리 잰 것 ${results.size} · ${result.seconds}초` });
  return result;
}

function stopAuto(): void {
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  autoMinutes = 0;
}

/**
 * 자동 회차 간격을 **파일로 기억한다.**
 *
 * 왜(실측 2026-09-11): 이 값이 `let autoMinutes = 0` 으로 메모리에만 있었다.
 * 켜 두어도 앱을 끄면 사라지고 다시 켜면 0(꺼짐)이다. 사장님이 앱을 계속 켜 두시는 이유가
 * "알아서 돌아라"인데 재시작 한 번이면 그 뜻이 지워졌다
 * (사장님 "그래서 앱을 계속 켜놓고있는건데" → "아 내가 꺼놔서 그렇구나" — 끄신 게 아니었다).
 * 오늘의 글감(topic-briefs-local)은 이미 prefs.json 으로 기억한다. 같은 방식으로 맞춘다.
 *
 * 못 읽으면 꺼짐으로 본다 — 안 잰 것을 켜짐으로 바꾸지 않는다.
 */
function readAutoMinutes(): number {
  try {
    const saved = Math.floor(Number(JSON.parse(fs.readFileSync(PREFS(), 'utf8')).autoMinutes) || 0);
    return saved > 0 ? Math.max(30, saved) : 0;
  } catch {
    return 0;
  }
}

function writeAutoMinutes(minutes: number): void {
  ensureDir();
  try {
    fs.writeFileSync(PREFS(), JSON.stringify({ autoMinutes: minutes }, null, 1), 'utf8');
  } catch { /* 저장 못 해도 이번 세션은 돈다 */ }
}

/**
 * 자동 회차를 건다.
 *
 * @param send 진행을 보낼 곳. **없으면 조용히 돈다** — 앱만 켜 두고 화면을 안 연 경우다.
 *   전에는 회차를 건 창(event.sender)에 묶여 있어서, 되살릴 때 보낼 곳이 없으면 걸 수가 없었다.
 *
 * 30분 아래로는 안 내린다. 실측(2026-09-10): 후보 40개만 재는 데도 118초, 정상 회차는 10~15분이다.
 * 더 자주 돌리면 회선이 쉬는 틈이 없어 집 주소가 네이버에서 눈총을 받는다 —
 * 사장님 개인 네이버 사용까지 영향을 받는다.
 */
function startAuto(minutes: number, send?: (payload: unknown) => void): void {
  stopAuto();
  if (!(minutes > 0)) return;
  autoMinutes = Math.max(30, minutes);
  autoTimer = setInterval(() => {
    if (running) return;
    running = true;
    abortRequested = false;
    runRealtimeNiche({
      onProgress: (p) => { try { send?.(p); } catch { /* 무시 */ } },
    })
      .then((result) => { try { send?.({ phase: 'done', message: '자동 회차 끝', result }); } catch { /* 무시 */ } })
      .catch(() => { /* 자동 회차 실패는 조용히 — 다음 차례에 다시 한다 */ })
      .finally(() => { running = false; });
  }, autoMinutes * 60_000);
}

/** 앱이 켜질 때 저장된 간격으로 되살린다. 화면을 안 열어도 돈다. */
export function restoreRealtimeNicheAuto(): void {
  const saved = readAutoMinutes();
  if (saved > 0) {
    startAuto(saved);
    console.log(`[REALTIME-NICHE] 저장된 자동 회차 되살림 — ${saved}분마다`);
  }
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
      if (minutes === 0) {
        stopAuto();
        // 끈 것도 기억한다 — 0 도 값이다. 안 그러면 다음에 켤 때 옛 간격이 살아난다.
        writeAutoMinutes(0);
        return { success: true, autoMinutes: 0 };
      }
      startAuto(minutes, (p) => {
        try { event.sender.send(REALTIME_NICHE_PROGRESS_CHANNEL, p); } catch { /* 창이 닫혔을 수 있다 */ }
      });
      writeAutoMinutes(autoMinutes);
      return { success: true, autoMinutes };
    });
  }

  // 화면을 안 열어도 돌아야 한다 — 앱을 켜 두는 이유가 그것이다.
  restoreRealtimeNicheAuto();
  console.log('[REALTIME-NICHE] ✅ 실시간 틈새(앱 전용) 핸들러 등록 완료');
}

export function stopRealtimeNicheScheduler(): void {
  stopAuto();
}
