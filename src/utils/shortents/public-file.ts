/**
 * 숏텐츠 급상승 공개 파일 변환(2026-10-29) — 사이트 spa/public/data/shortents-rising.json 계약.
 * 추정값 · 확률 · 예상 조회수 칸은 두지 않는다. 토픽이 없으면 null(빈 회차로 원격을 덮지 않는다).
 */
import type { ShortentsWindow } from './parse';
import type { MeasuredTopic } from './docs';

export const SHORTENTS_PUBLIC_PATH = 'spa/public/data/shortents-rising.json';

export interface ShortentsPublicPayload {
  schemaVersion: 1;
  builtAt: string;
  source: 'naver-mobile-home-shortents-now';
  latest: { publishTime: string; periodStart: string; periodEnd: string };
  windows: number;
  topics: Array<{
    keyword: string; category: string; summary: string; title: string; channel: string;
    articleUrl: string; searchUrl: string;
    rank: number; prevRank: number | null; rankDelta: number | null; isNew: boolean;
    firstSeenAt: string; windowsSeen: number; streak: number; status: string;
    docs: number | null; docsMeasuredAt: string | null;
  }>;
}

export function buildShortentsPublicPayload(
  history: readonly ShortentsWindow[],
  topics: readonly MeasuredTopic[],
  builtAt: string,
): ShortentsPublicPayload | null {
  const latest = history[history.length - 1];
  if (!latest || !topics.length) return null;
  return {
    schemaVersion: 1,
    builtAt,
    source: 'naver-mobile-home-shortents-now',
    latest: { publishTime: latest.publishTime, periodStart: latest.periodStart, periodEnd: latest.periodEnd },
    windows: history.length,
    topics: topics.map((t) => ({
      keyword: t.keyword, category: t.category, summary: t.summary, title: t.title, channel: t.channel,
      articleUrl: t.articleUrl, searchUrl: t.searchUrl,
      rank: t.rank, prevRank: t.prevRank, rankDelta: t.rankDelta, isNew: t.isNew,
      firstSeenAt: t.firstSeenAt, windowsSeen: t.windowsSeen, streak: t.streak, status: t.status,
      docs: t.docs, docsMeasuredAt: t.docsMeasuredAt,
    })),
  };
}
