/**
 * 숏텐츠 급상승 계산(2026-10-29) — 최근 48창(24시간) 기록에서 현재 창 토픽마다 '얼마나 새로 떴나'를 잰다.
 *
 * 같은 토픽 = 검색어 공백 무시 비교. 순수 함수 · 입력 불변.
 * 첫 창(직전 창 없음)에서는 '직전 창에 없었음'을 알 수 없으므로 isNew 는 네이버 표시만 따른다.
 */
import type { ShortentsItem, ShortentsWindow } from './parse';

export const HISTORY_LIMIT = 48;

export type ShortentsStatus = 'new' | 'rising' | 'steady' | 'falling';

export interface RisingTopic extends ShortentsItem {
  prevRank: number | null;
  rankDelta: number | null;
  firstSeenAt: string;
  windowsSeen: number;
  streak: number;
  status: ShortentsStatus;
}

const key = (keyword: string): string => keyword.replace(/\s+/g, '');
const time = (iso: string): number => {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
};

/** 기록에 한 창을 더한다 — 같은 publishTime 은 덮어쓰고, 오래된 순으로 최근 48창만 남긴다. */
export function appendWindow(history: readonly ShortentsWindow[], next: ShortentsWindow, limit = HISTORY_LIMIT): ShortentsWindow[] {
  const merged = [...history.filter((w) => w.publishTime !== next.publishTime), next]
    .sort((a, b) => time(a.publishTime) - time(b.publishTime));
  return merged.slice(-limit);
}

export function computeRising(history: readonly ShortentsWindow[]): RisingTopic[] {
  if (!history.length) return [];
  const current = history[history.length - 1];
  const previous = history.length > 1 ? history[history.length - 2] : null;
  const prevRanks = new Map<string, number>();
  for (const item of previous?.items ?? []) prevRanks.set(key(item.keyword), item.rank);
  const sets = history.map((w) => new Set(w.items.map((i) => key(i.keyword))));

  const topics = current.items.map((item): RisingTopic => {
    const k = key(item.keyword);
    const prevRank = prevRanks.get(k) ?? null;
    const rankDelta = prevRank === null ? null : prevRank - item.rank;
    const firstIndex = sets.findIndex((s) => s.has(k));
    let streak = 0;
    for (let i = sets.length - 1; i >= 0 && sets[i].has(k); i--) streak++;
    const isNew = item.isNew || (previous !== null && prevRank === null);
    const status: ShortentsStatus = isNew ? 'new' : rankDelta !== null && rankDelta > 0 ? 'rising' : rankDelta !== null && rankDelta < 0 ? 'falling' : 'steady';
    return {
      ...item,
      isNew,
      prevRank,
      rankDelta,
      firstSeenAt: history[firstIndex].publishTime,
      windowsSeen: sets.filter((s) => s.has(k)).length,
      streak,
      status,
    };
  });

  return topics.sort((a, b) =>
    time(b.firstSeenAt) - time(a.firstSeenAt) || (b.rankDelta ?? 0) - (a.rankDelta ?? 0) || a.rank - b.rank);
}
