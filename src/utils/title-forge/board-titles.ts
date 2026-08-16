/**
 * 보드 행 → 제목 배선.
 *
 * 대장간(forge)의 파생 키워드는 새 API 호출이 아니라 **같은 회차에서 이미
 * 실측한 같은 주제 후보들**에서 얻는다 — 같은 씨앗 형제 우선, 없으면 어절 공유.
 * 낚시 가드는 그대로다: 형제가 없으면 제목은 generic 으로 남는다.
 * 지어내는 것보다 밋밋한 게 낫다.
 */

import { forgeTitles, type ForgedTitles, type DerivedKeyword } from './forge';

export interface TopicCandidate {
  keyword: string;
  searchVolume: number | null;
  seed?: string | null;
}

export interface BoardTitleRow {
  keyword: string;
  seed?: string | null;
  timing?: string;
}

const MAX_SIBLINGS = 8;

function tokensOf(keyword: string): Set<string> {
  return new Set(
    String(keyword || '')
      .split(/\s+/)
      .filter((token) => token.length >= 2),
  );
}

function sharesToken(left: string, right: string): boolean {
  const leftTokens = tokensOf(left);
  for (const token of tokensOf(right)) {
    if (leftTokens.has(token)) return true;
  }
  return false;
}

/**
 * 같은 씨앗 형제 우선, 없으면 어절 공유. 자기 자신은 제외, 최대 8개.
 * 검색량 큰 순 — 대장간이 프레임 근거 강도순으로 읽는다.
 */
export function siblingDerivedKeywords(
  rowKeyword: string,
  rowSeed: string | null | undefined,
  topicCandidates: readonly TopicCandidate[],
): DerivedKeyword[] {
  const others = topicCandidates.filter((c) => c.keyword !== rowKeyword);
  const sameSeed = rowSeed
    ? others.filter((c) => c.seed && c.seed === rowSeed)
    : [];
  const pool = sameSeed.length > 0
    ? sameSeed
    : others.filter((c) => sharesToken(c.keyword, rowKeyword));
  return pool
    .map((c) => ({ keyword: c.keyword, searchVolume: c.searchVolume }))
    .sort((a, b) => (b.searchVolume || 0) - (a.searchVolume || 0))
    .slice(0, MAX_SIBLINGS);
}

/** 보드 행 하나의 SEO/홈판 제목. 실측(형제·SERP·시기)만 재료로 쓴다. */
export function buildBoardTitles(
  row: BoardTitleRow,
  topicCandidates: readonly TopicCandidate[],
  serpTitles: readonly string[],
): ForgedTitles {
  return forgeTitles({
    keyword: row.keyword,
    derivedKeywords: siblingDerivedKeywords(row.keyword, row.seed, topicCandidates),
    serpTitles,
    timing: row.timing || '',
  });
}
