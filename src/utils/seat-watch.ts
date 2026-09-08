/**
 * 자리 감시 — 관심 키워드를 매일 새벽 내 PC 에서 다시 재고(자리 실측기), 자리가 열리면 알린다.
 * 앱 전용(2026-09-09, 플랜 A3). 사이트는 회차 사이의 변화를 볼 수 없다.
 *
 * 이 파일은 순수 함수만 둔다(파일·브라우저·알림은 핸들러 몫). 판정 값은 자리 실측기의 것을 그대로 쓴다.
 */
import type { SeatVerdict } from './seat-measure';

export interface WatchPoint {
  measuredAt: string;
  verdict: SeatVerdict;
  facing: number | null;
  vacancy: number | null;
  ads: number | null;
  cards: string[] | null;
  /** 차단·오류로 못 잰 회차 — 판정은 '자료없음'이고 변화 판정에 쓰지 않는다 */
  unmeasured?: boolean;
}

export interface WatchEntry {
  keyword: string;
  addedAt: string;
  history: WatchPoint[];
}

export type WatchChangeKind = 'opened' | 'closed' | 'facing-drop' | 'none';

export interface WatchChange {
  changed: boolean;
  kind: WatchChangeKind;
  message: string;
}

export const WATCH_HISTORY_KEEP = 30;
export const WATCH_FACING_ALERT_MAX = 3;

const OPEN_VERDICTS: ReadonlyArray<SeatVerdict> = ['열림'];
const CLOSED_VERDICTS: ReadonlyArray<SeatVerdict> = ['잠김', '카드답'];

/** 직전에 실제로 잰 점 — 차단 회차는 건너뛴다. */
export function lastMeasuredPoint(entry: Pick<WatchEntry, 'history'>): WatchPoint | null {
  for (let i = entry.history.length - 1; i >= 0; i -= 1) {
    const point = entry.history[i];
    if (point && !point.unmeasured && point.verdict !== '자료없음') return point;
  }
  return null;
}

/**
 * 변화 판정 — 알릴 만한 것만 changed 다.
 *   닫힘(잠김·카드답) → 열림          : opened
 *   열림 → 닫힘                        : closed
 *   정면 글이 3개 이하로 줄어듦        : facing-drop (열림/반열림 유지 중이라도)
 * 첫 실측(prev 없음)은 변화가 아니다 — 기준선일 뿐이다.
 */
export function judgeWatchChange(prev: WatchPoint | null, next: WatchPoint): WatchChange {
  if (next.unmeasured || next.verdict === '자료없음') return { changed: false, kind: 'none', message: '이번 회차는 못 쟀다(차단·오류)' };
  if (!prev) return { changed: false, kind: 'none', message: `기준선 — ${next.verdict}` };
  const wasClosed = CLOSED_VERDICTS.includes(prev.verdict);
  const wasOpen = OPEN_VERDICTS.includes(prev.verdict);
  const isOpen = OPEN_VERDICTS.includes(next.verdict);
  const isClosed = CLOSED_VERDICTS.includes(next.verdict);
  if (wasClosed && isOpen) {
    return { changed: true, kind: 'opened', message: `자리가 열렸다 — ${prev.verdict} → 열림 (정면 ${prev.facing ?? '?'} → ${next.facing ?? '?'})` };
  }
  if (wasOpen && isClosed) {
    return { changed: true, kind: 'closed', message: `자리가 닫혔다 — 열림 → ${next.verdict} (정면 ${prev.facing ?? '?'} → ${next.facing ?? '?'})` };
  }
  const prevFacing = typeof prev.facing === 'number' ? prev.facing : null;
  const nextFacing = typeof next.facing === 'number' ? next.facing : null;
  if (prevFacing !== null && nextFacing !== null && prevFacing > WATCH_FACING_ALERT_MAX && nextFacing <= WATCH_FACING_ALERT_MAX) {
    return { changed: true, kind: 'facing-drop', message: `정면 글이 ${prevFacing} → ${nextFacing}개로 줄었다 — 지금 쓰면 자리가 있다` };
  }
  return { changed: false, kind: 'none', message: `그대로 — ${next.verdict}` };
}

/** 점을 뒤에 붙이고 오래된 것을 버린다(불변). */
export function appendPoint(entry: WatchEntry, point: WatchPoint, keep = WATCH_HISTORY_KEEP): WatchEntry {
  const history = [...entry.history, point].slice(-keep);
  return { ...entry, history };
}

/**
 * 오늘 실측 시각(현지 hour)이 지났고 그 뒤로 안 돌았으면 돌 차례다.
 * PC 가 꺼져 있던 날은 켜지는 대로 돈다(새벽 5시가 지난 뒤라면).
 */
export function isWatchDue(lastRunAt: string | null, now: Date, runHour = 5): boolean {
  const due = new Date(now);
  due.setHours(runHour, 0, 0, 0);
  if (now < due) return false;
  if (!lastRunAt) return true;
  const last = new Date(lastRunAt);
  return Number.isNaN(last.getTime()) ? true : last < due;
}

/** 붙여넣기·추가용 — 중복은 키워드 공백 무시로 본다. */
export function addWatchKeywords(entries: WatchEntry[], keywords: string[], now = new Date()): { entries: WatchEntry[]; added: string[] } {
  const key = (k: string) => k.replace(/\s+/g, '');
  const seen = new Set(entries.map((e) => key(e.keyword)));
  const added: string[] = [];
  const next = [...entries];
  for (const raw of keywords) {
    const keyword = String(raw || '').replace(/\s+/g, ' ').trim();
    if (keyword.length < 2 || seen.has(key(keyword))) continue;
    seen.add(key(keyword));
    added.push(keyword);
    next.push({ keyword, addedAt: now.toISOString(), history: [] });
  }
  return { entries: next, added };
}

export function removeWatchKeyword(entries: WatchEntry[], keyword: string): WatchEntry[] {
  const target = String(keyword || '').replace(/\s+/g, '');
  return entries.filter((e) => e.keyword.replace(/\s+/g, '') !== target);
}

/** 화면용 요약 — 지금 판정·마지막 실측·최근 n회 판정 띠. */
export function summarizeWatch(entry: WatchEntry, recent = 14): {
  keyword: string; current: SeatVerdict | null; lastMeasuredAt: string | null; facing: number | null; timeline: SeatVerdict[]; openStreak: number;
} {
  const last = lastMeasuredPoint(entry);
  const timeline = entry.history.slice(-recent).map((p) => (p.unmeasured ? '자료없음' : p.verdict));
  let openStreak = 0;
  for (let i = entry.history.length - 1; i >= 0; i -= 1) {
    const p = entry.history[i];
    if (!p || p.unmeasured) continue;
    if (p.verdict === '열림') openStreak += 1; else break;
  }
  return { keyword: entry.keyword, current: last ? last.verdict : null, lastMeasuredAt: last ? last.measuredAt : null, facing: last ? last.facing : null, timeline, openStreak };
}
