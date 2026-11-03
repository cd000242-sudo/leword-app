/**
 * 곧 뜰 숏텐츠 후보 공개 파일 변환(2026-10-30) — 사이트 spa/public/data/shortents-upcoming.json 계약.
 * 센 숫자와 적중 장부만 싣는다. 확률 · 점수 칸은 두지 않는다.
 * 잰 후보가 하나도 없으면 null(측정 실패 — 빈 회차로 원격을 덮지 않는다). 재 봤는데 통과가 0이면 빈 목록(진짜 0건).
 */
import type { UpcomingCandidate } from './upcoming';
import { MIN_ARTICLES, MIN_PRESS, RECENT_MIN, WINDOW_MIN } from './upcoming';
import type { HitSummary } from './upcoming-ledger';

export const UPCOMING_PUBLIC_PATH = 'spa/public/data/shortents-upcoming.json';

export interface UpcomingPublicPayload {
  schemaVersion: 1;
  builtAt: string;
  source: 'realtime-keywords-news-sample';
  rule: { windowMin: number; recentMin: number; minArticles: number; minPress: number };
  /** 이번 회차에 뉴스를 재 본 후보 수. */
  measured: number;
  candidates: UpcomingCandidate[];
  hitRate: HitSummary;
}

export function buildUpcomingPublicPayload(
  candidates: readonly UpcomingCandidate[],
  measured: number,
  hitRate: HitSummary,
  builtAt: string,
): UpcomingPublicPayload | null {
  if (measured <= 0) return null;
  return {
    schemaVersion: 1,
    builtAt,
    source: 'realtime-keywords-news-sample',
    rule: { windowMin: WINDOW_MIN, recentMin: RECENT_MIN, minArticles: MIN_ARTICLES, minPress: MIN_PRESS },
    measured,
    candidates: candidates.map((c) => ({ ...c, sources: [...c.sources], samples: c.samples.map((s) => ({ ...s })) })),
    hitRate,
  };
}
