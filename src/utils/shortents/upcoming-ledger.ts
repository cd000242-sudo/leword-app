/**
 * 곧 뜰 후보 적중 장부(2026-10-30) — 후보로 올린 말이 나중에 숏텐츠에 떴는지, 몇 분 먼저였는지 기록한다.
 *
 * 판정 기준이 실제로 맞는지 아는 유일한 근거다. 매칭된 쌍(후보 ↔ 숏텐츠 검색어)을 그대로 남겨 사람이 검토할 수 있게 한다.
 * 순수 함수 · 입력 불변.
 */
import type { ShortentsWindow } from './parse';
import { topicMatches } from './upcoming';

export const LEDGER_DAYS = 7;
const DAY_MS = 24 * 3600_000;
const RECENT_HITS = 10;

export interface LedgerEntry {
  keyword: string;
  flaggedAt: string;
  hitAt: string | null;
  hitKeyword: string | null;
  leadMin: number | null;
}

export interface HitSummary {
  days: number;
  flagged: number;
  matched: number;
  avgLeadMin: number | null;
  recent: Array<{ keyword: string; hitKeyword: string; hitAt: string; leadMin: number }>;
}

const time = (iso: string | null): number => {
  const ms = Date.parse(iso || '');
  return Number.isFinite(ms) ? ms : 0;
};
const compact = (value: string): string => value.replace(/\s+/g, '').toLowerCase();

/** 새로 올린 후보만 더한다 — 같은 말이 아직 적중 안 된 채 열려 있으면 처음 올린 시각을 지킨다. */
export function recordFlags(ledger: readonly LedgerEntry[], keywords: readonly string[], nowIso: string): LedgerEntry[] {
  const open = new Set(ledger.filter((e) => e.hitAt === null).map((e) => compact(e.keyword)));
  const added: LedgerEntry[] = [];
  for (const keyword of keywords) {
    const k = compact(keyword);
    if (!k || open.has(k)) continue;
    open.add(k);
    added.push({ keyword, flaggedAt: nowIso, hitAt: null, hitKeyword: null, leadMin: null });
  }
  return [...ledger, ...added];
}

/** 열린 후보가 이 숏텐츠 창에 떴으면 적중 — 후보로 올린 시각보다 뒤에 발행된 창만 센다. */
export function markHits(ledger: readonly LedgerEntry[], window: ShortentsWindow): LedgerEntry[] {
  const publishedAt = time(window.publishTime);
  if (!publishedAt) return [...ledger];
  return ledger.map((entry) => {
    if (entry.hitAt !== null || time(entry.flaggedAt) >= publishedAt) return entry;
    const match = window.items.find((item) => topicMatches(entry.keyword, item.keyword));
    if (!match) return entry;
    return {
      ...entry,
      hitAt: window.publishTime,
      hitKeyword: match.keyword,
      leadMin: Math.round((publishedAt - time(entry.flaggedAt)) / 60_000),
    };
  });
}

export function pruneLedger(ledger: readonly LedgerEntry[], nowMs: number): LedgerEntry[] {
  return ledger.filter((e) => nowMs - time(e.flaggedAt) <= LEDGER_DAYS * DAY_MS);
}

export function summarizeHits(ledger: readonly LedgerEntry[], nowMs: number): HitSummary {
  const kept = pruneLedger(ledger, nowMs);
  const hits = kept.filter((e): e is LedgerEntry & { hitAt: string; hitKeyword: string; leadMin: number } =>
    e.hitAt !== null && e.hitKeyword !== null && e.leadMin !== null);
  return {
    days: LEDGER_DAYS,
    flagged: kept.length,
    matched: hits.length,
    avgLeadMin: hits.length ? Math.round(hits.reduce((sum, e) => sum + e.leadMin, 0) / hits.length) : null,
    recent: [...hits].sort((a, b) => time(b.hitAt) - time(a.hitAt)).slice(0, RECENT_HITS)
      .map((e) => ({ keyword: e.keyword, hitKeyword: e.hitKeyword, hitAt: e.hitAt, leadMin: e.leadMin })),
  };
}
