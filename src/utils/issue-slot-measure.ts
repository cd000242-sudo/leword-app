/**
 * 실검 틈새 — 자리 실측 계획·적용 (순수).
 *
 * 틈새의 세 번째 게이트 '자리'는 네이버 블로그탭 상위 10 제목이 이 키워드에 정면
 * 대응하는가(serp-winnability)이고, 그 HTML 은 Bright Data 로만 받는다. 유료 쿼터라
 * 회차당 상한(기본 12건) 안에서 **검색량 큰 순**으로 재고, 나머지는 대기로 남긴다.
 *
 * 무엇을 재나
 *  - 신규(원장) 행 중 대기(isPending: 트래픽·수요 통과, 자리 미실측).
 *  - 직전 발행본의 선점 후보 중 재측정으로 검색량이 하한을 넘긴 것(승격 대상), 그리고
 *    옛 정의(수요만)로 실린 틈새 행(serp 없음). 신규와 한 풀에서 검색량 큰 순으로 잰다.
 *  - 48시간 안에 잰 캐시가 있으면 다시 안 재고 그 값으로 판정한다(잠긴 것을 하루 세 번
 *    다시 재지 않기 위해 잠김·경쟁도 캐시에 남긴다).
 *
 * 네트워크는 여기 없다. 스크립트(scripts/serp-slot-issue-board.js)가 계획대로 받아
 * 결과 Map 을 돌려주면 applySlotResults 가 판정을 다시 내린다.
 */

import type { IssueNicheKeyword, IssueSlotSerp } from './issue-niche-hunter';
import type { IssueBoardPublicRow } from './issue-niche-board-publish';
import type { BoardEvidence } from './issue-niche-board-shape';
import { compactKey } from './issue-niche-board-shape';
import {
  IssueNicheMeasurements,
  IssueNicheThresholds,
  IssueNicheVerdict,
  judgeIssueNiche,
} from './issue-niche-verdict';
import type { SerpAnalysis, SerpVerdict } from './serp-winnability';

/** 잰 자리는 48시간 재사용 — 실시간 이슈는 하루면 정면글이 쌓이므로 그 이상은 낡은 값이다. */
export const SLOT_REUSE_MS = 48 * 3_600_000;
/** 캐시 보관 7일 — 재사용 기한을 넘긴 항목은 다음 저장 때 버린다. */
export const SLOT_CACHE_KEEP_MS = 7 * 24 * 3_600_000;
const CACHE_SCHEMA = 'issue-slot-cache-v1';

export interface SlotCacheEntry extends IssueSlotSerp { keyword: string }
export interface SlotCache {
  schema: typeof CACHE_SCHEMA;
  entries: Record<string, SlotCacheEntry>;
}

export function readSlotCache(raw: unknown): SlotCache {
  const empty: SlotCache = { schema: CACHE_SCHEMA, entries: {} };
  if (!raw || typeof raw !== 'object') return empty;
  const obj = raw as Partial<SlotCache>;
  if (obj.schema !== CACHE_SCHEMA || !obj.entries || typeof obj.entries !== 'object') return empty;
  const entries: Record<string, SlotCacheEntry> = {};
  for (const [key, value] of Object.entries(obj.entries)) {
    const entry = value as Partial<SlotCacheEntry> | null;
    if (!entry || typeof entry !== 'object' || typeof entry.measuredAt !== 'string' || !entry.verdict) continue;
    entries[key] = entry as SlotCacheEntry;
  }
  return { schema: CACHE_SCHEMA, entries };
}

export function slotCacheLookup(cache: SlotCache, keyword: string, nowMs: number): IssueSlotSerp | null {
  const entry = cache.entries[compactKey(keyword)];
  if (!entry) return null;
  const measuredMs = Date.parse(entry.measuredAt);
  if (!Number.isFinite(measuredMs) || nowMs - measuredMs > SLOT_REUSE_MS) return null;
  const { keyword: _k, ...serp } = entry;
  return serp;
}

/** 저장은 새 객체로 — 7일 넘은 항목은 이때 버린다. */
export function slotCacheStore(cache: SlotCache, keyword: string, serp: IssueSlotSerp, nowMs: number): SlotCache {
  const kept = Object.fromEntries(
    Object.entries(cache.entries).filter(([, entry]) => {
      const measuredMs = Date.parse(entry.measuredAt);
      return Number.isFinite(measuredMs) && nowMs - measuredMs <= SLOT_CACHE_KEEP_MS;
    }),
  );
  return { schema: CACHE_SCHEMA, entries: { ...kept, [compactKey(keyword)]: { keyword, ...serp } } };
}

export function toSlotSerp(analysis: SerpAnalysis, verdict: SerpVerdict, measuredAt: string): IssueSlotSerp {
  return {
    verdict: verdict.verdict,
    reason: verdict.reason,
    exactTitleHits: analysis.exactTitleHits,
    partialTitleHits: analysis.partialTitleHits,
    sampledTitles: analysis.sampledTitles,
    topTitles: analysis.topTitles.slice(0, 10),
    measuredAt,
  };
}

/* ─────────────── 판정 다시 내리기 ─────────────── */

function measurementsOfLedgerRow(row: IssueNicheKeyword, serp: IssueSlotSerp | null): IssueNicheMeasurements {
  return {
    searchVolume: row.searchVolume,
    documentCount: row.documentCount,
    isSearchVolumeEstimated: row.isSearchVolumeEstimated === true,
    isDocumentCountEstimated: row.isDocumentCountEstimated === true,
    searchVolumeLt10: row.searchVolumeLt10 === true,
    recencyStatus: row.recencyStatus || 'unknown',
    demandRecent7: row.demandRecent7,
    demandStatus: row.demandStatus || 'unknown',
    freshFrontalCount: row.freshFrontalCount,
    serpVerdict: serp?.verdict ?? null,
  };
}

/**
 * 발행 행은 추정치를 null 로 냈고 데이터랩 상대지수를 싣지 않는다 — 판정에 필요한 것은
 * "잡혔나" 뿐이라 hasLiveDemand 를 1/null 로 되돌린다.
 */
function measurementsOfPublicRow(row: IssueBoardPublicRow, serp: IssueSlotSerp | null): IssueNicheMeasurements {
  return {
    searchVolume: row.searchVolume,
    documentCount: row.documentCount,
    isSearchVolumeEstimated: false,
    isDocumentCountEstimated: row.documentCountMeasured !== true,
    searchVolumeLt10: row.searchVolumeLt10 === true,
    recencyStatus: (row.issueStatus || 'unknown') as IssueNicheMeasurements['recencyStatus'],
    demandRecent7: row.hasLiveDemand ? 1 : null,
    demandStatus: (row.demandStatus || 'unknown') as IssueNicheMeasurements['demandStatus'],
    freshFrontalCount: row.freshFrontalCount,
    serpVerdict: serp?.verdict ?? null,
  };
}

function withVerdict(row: IssueNicheKeyword, verdict: IssueNicheVerdict, serp: IssueSlotSerp | null): IssueNicheKeyword {
  return {
    ...row,
    grade: verdict.grade,
    hasTraffic: verdict.hasTraffic,
    hasLiveDemand: verdict.hasLiveDemand,
    isEstimated: verdict.isEstimated,
    trafficGate: verdict.trafficGate,
    demandGate: verdict.demandGate,
    slotStatus: verdict.slotStatus,
    serp,
    isNiche: verdict.isNiche,
    nicheRoute: verdict.nicheRoute,
    isPending: verdict.isPending,
    isPreemption: verdict.isPreemption,
    preemptionKind: verdict.preemptionKind,
    nicheScore: verdict.nicheScore,
    reasons: verdict.reasons,
  };
}

/** 잰 값을 원장 행에 입히고 판정을 다시 내린다. NO_DATA 는 못 잰 것 — serp 를 싣지 않는다. */
export function applySlotToLedgerRow(row: IssueNicheKeyword, serp: IssueSlotSerp, thresholds: IssueNicheThresholds): IssueNicheKeyword {
  const usable = serp.verdict === 'NO_DATA' ? null : serp;
  return withVerdict(row, judgeIssueNiche(measurementsOfLedgerRow(row, usable), thresholds), usable);
}

const ORIGIN_CODES = new Set(['next-wave', 'autocomplete', 'related', 'derived', 'head']);

/** 승격된 이월 행의 근거 줄 — 출처 → 트래픽 → 수요 → 자리 → 나머지. 있던 줄은 지키고 실측 두 줄만 끼운다. */
function promotedEvidence(row: IssueBoardPublicRow, serp: IssueSlotSerp): BoardEvidence[] {
  const base = (Array.isArray(row.evidence) ? row.evidence : []).filter((e) => e.code !== 'traffic' && e.code !== 'slot');
  const origin = base.filter((e) => ORIGIN_CODES.has(e.code));
  const demand = base.filter((e) => e.code === 'demand');
  const rest = base.filter((e) => !ORIGIN_CODES.has(e.code) && e.code !== 'demand');
  const traffic: BoardEvidence[] = typeof row.searchVolume === 'number'
    ? [{ code: 'traffic', text: `검색광고 월 검색량 ${row.searchVolume.toLocaleString()} 실측 — 트래픽 하한 통과` }]
    : [];
  const slot: BoardEvidence[] = [{ code: 'slot', text: `블로그탭 상위 ${serp.sampledTitles} 제목 중 정면 대응 0건 — 자리 있음 (실측)` }];
  return [...origin, ...traffic, ...demand, ...slot, ...rest];
}

/**
 * 이월 행에 판정을 입힌다. 승격(niche)·탈락(null)·그대로(preemption, 배지 종류만 동기화).
 * serp 를 이미 가진 틈새 행은 여기 오지 않는다 — 48시간 이월 동안 잰 시각을 밝히고 그대로 둔다.
 *
 * 옛 정의(수요만)로 실린 틈새 행(serp 없음)은 새 정의로 다시 선다: 자리까지 통과하면
 * 남고, 검색량이 하한 아래면 빈 자리일 때만 선점 후보로 내려가고, 아니면 빠진다.
 */
function applyVerdictToPublicRow(row: IssueBoardPublicRow, verdict: IssueNicheVerdict, serp: IssueSlotSerp | null): IssueBoardPublicRow | null {
  if (verdict.isNiche && serp) {
    return {
      ...row,
      verdict: 'niche',
      preemptionKind: null,
      serp,
      reasons: verdict.reasons,
      evidence: promotedEvidence(row, serp),
    };
  }
  // 자리를 쟀는데 없다(잠김·경쟁) — 틈새도 선점 후보도 아니다.
  if (serp && (serp.verdict === 'LOCKED' || serp.verdict === 'CONTESTED')) return null;
  if (isLegacyNiche(row)) {
    // 못 잰 옛 틈새는 실을 수 없다(대기는 발행 안 함). 선점 후보 자격이 있으면 그리로 내린다.
    if (!verdict.isPreemption) return null;
    return { ...row, verdict: 'preemption', preemptionKind: verdict.preemptionKind, serp: null, reasons: verdict.reasons };
  }
  // 대기(상한 밖)거나 검색량이 하한 아래로 실측됐다 — 행은 두되 '검색량 미확인' 배지만 뗀다.
  const kind = verdict.isPreemption ? verdict.preemptionKind : null;
  return kind === row.preemptionKind ? row : { ...row, preemptionKind: kind };
}

/* ─────────────── 계획 ─────────────── */

export interface SlotPlanInput {
  ledgerRows: IssueNicheKeyword[];
  prevRows: IssueBoardPublicRow[];
  cache: SlotCache;
  nowMs: number;
  max: number;
  thresholds: IssueNicheThresholds;
}

export interface SlotPlan {
  /** 캐시로 판정이 갱신된 원장 행 */
  ledgerRows: IssueNicheKeyword[];
  /** 캐시로 갱신된 직전 발행본 행(탈락분 제거) */
  prevRows: IssueBoardPublicRow[];
  /** 이번 회차에 잴 키워드 — 신규·이월 한 풀에서 검색량 큰 순(동률이면 이월 먼저). 상한 적용. */
  targets: string[];
  /** 상한 밖에 남은 대기 수 */
  overflow: number;
  /** 캐시로 대신한 수 */
  reused: number;
  /** 적용 단계가 이어서 쓰는 캐시(계획 시점 그대로) */
  cache: SlotCache;
  nowMs: number;
}

/** 옛 정의(수요만)로 실린 틈새 행 — 자리를 잰 적이 없다. 새 정의로 다시 세운다. */
function isLegacyNiche(row: IssueBoardPublicRow): boolean {
  return row.verdict === 'niche' && !row.serp;
}

/**
 * 다시 판정할 이월 행: 검색량이 실측된 선점 후보(수요 잡힘 → 승격 가능) + 옛 틈새 행.
 * 둘 다 이미 보강이 끝나 있어 승격이 공짜다 — 신규보다 먼저 잰다.
 */
function isPromotable(row: IssueBoardPublicRow): boolean {
  if (isLegacyNiche(row)) return true;
  return row.verdict === 'preemption' && row.hasLiveDemand === true && typeof row.searchVolume === 'number';
}

export function planSlotMeasurement(input: SlotPlanInput): SlotPlan {
  const { cache, nowMs, thresholds } = input;
  let reused = 0;

  const ledgerRows = input.ledgerRows.map((row) => {
    if (!row.isPending) return row;
    const hit = slotCacheLookup(cache, row.keyword, nowMs);
    if (!hit) return row;
    reused += 1;
    return applySlotToLedgerRow(row, hit, thresholds);
  });

  const prevRows: IssueBoardPublicRow[] = [];
  const carriedWaiting: IssueBoardPublicRow[] = [];
  for (const row of input.prevRows) {
    if (!isPromotable(row)) { prevRows.push(row); continue; }
    const hit = slotCacheLookup(cache, row.keyword, nowMs);
    const verdict = judgeIssueNiche(measurementsOfPublicRow(row, hit), thresholds);
    if (hit) reused += 1;
    if (!hit && verdict.isPending) { carriedWaiting.push(row); prevRows.push(row); continue; }
    const applied = applyVerdictToPublicRow(row, verdict, hit);
    if (applied) prevRows.push(applied);
  }

  // 신규·이월 한 풀에서 검색량 큰 순 — 트래픽을 몰고 올 키워드부터 잰다.
  // 같은 검색량이면 이월이 먼저(보강이 끝나 있어 승격이 공짜). 같은 키워드는 한 번만.
  const pool = [
    ...carriedWaiting.map((row, i) => ({ keyword: row.keyword, sv: row.searchVolume ?? 0, tier: 0, i })),
    ...ledgerRows.filter((row) => row.isPending).map((row, i) => ({ keyword: row.keyword, sv: row.searchVolume ?? 0, tier: 1, i })),
  ].sort((a, b) => b.sv - a.sv || a.tier - b.tier || a.i - b.i);
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const item of pool) {
    const key = compactKey(item.keyword);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    ordered.push(item.keyword);
  }

  const max = Math.max(0, Math.floor(input.max));
  return {
    ledgerRows,
    prevRows,
    targets: ordered.slice(0, max),
    overflow: Math.max(0, ordered.length - max),
    reused,
    cache,
    nowMs,
  };
}

/* ─────────────── 적용 ─────────────── */

export interface SlotApplyResult {
  ledgerRows: IssueNicheKeyword[];
  prevRows: IssueBoardPublicRow[];
  cache: SlotCache;
  /** 틈새로 확정된 키워드(신규·이월 모두) */
  promoted: string[];
  /** 자리가 없어 탈락한 키워드 */
  dropped: string[];
  niche: number;
  pending: number;
}

/**
 * 잰 결과(키워드 → serp)를 계획에 입힌다. 결과 Map 에 없는 대상은 못 잰 것 — 대기로 남는다.
 * NO_DATA 는 캐시에 넣지 않는다(다음 회차 재시도).
 */
export function applySlotResults(plan: SlotPlan, results: Map<string, IssueSlotSerp>, thresholds: IssueNicheThresholds): SlotApplyResult {
  const byKey = new Map<string, IssueSlotSerp>();
  for (const [keyword, serp] of results) byKey.set(compactKey(keyword), serp);
  const promoted: string[] = [];
  const dropped: string[] = [];

  const ledgerRows = plan.ledgerRows.map((row) => {
    if (!row.isPending) return row;
    const serp = byKey.get(compactKey(row.keyword));
    if (!serp) return row;
    const next = applySlotToLedgerRow(row, serp, thresholds);
    if (next.isNiche) promoted.push(row.keyword);
    else if (next.slotStatus === 'locked' || next.slotStatus === 'contested') dropped.push(row.keyword);
    return next;
  });

  const prevRows: IssueBoardPublicRow[] = [];
  for (const row of plan.prevRows) {
    if (!isPromotable(row)) { prevRows.push(row); continue; }
    // 못 쟀어도 다시 판정한다 — 검색량은 실측됐으니 '검색량 미확인' 배지는 이미 틀렸다.
    const serp = byKey.get(compactKey(row.keyword)) ?? null;
    const usable = serp && serp.verdict !== 'NO_DATA' ? serp : null;
    const verdict = judgeIssueNiche(measurementsOfPublicRow(row, usable), thresholds);
    const applied = applyVerdictToPublicRow(row, verdict, usable);
    if (!applied) { if (!dropped.includes(row.keyword)) dropped.push(row.keyword); continue; }
    if (applied.verdict === 'niche' && !promoted.includes(row.keyword)) promoted.push(row.keyword);
    prevRows.push(applied);
  }

  let cache = plan.cache;
  for (const [keyword, serp] of results) {
    if (serp.verdict === 'NO_DATA') continue;
    cache = slotCacheStore(cache, keyword, serp, plan.nowMs);
  }

  return {
    ledgerRows,
    prevRows,
    cache,
    promoted,
    dropped,
    niche: ledgerRows.filter((row) => row.isNiche).length,
    pending: ledgerRows.filter((row) => row.isPending).length,
  };
}
