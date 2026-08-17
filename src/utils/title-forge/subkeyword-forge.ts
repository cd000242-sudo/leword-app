/**
 * 문제해결형 서브키워드 — 애드센스 레인의 "메인 + 서브 3" 재료.
 *
 * 하드코딩 접미사를 만들지 않는다. 입력은 실측 확장 결과(자동완성·연관검색이
 * 실제로 돌려준 검색어)뿐이고, 여기서는 고르기만 한다:
 *   ① 메인 키워드와 어절을 공유할 것(남의 키워드 제외)
 *   ② 문제해결형 프레임(안됨/오류/원인/해결/실수/차이…)일 것
 *   ③ 검색량 큰 순, 미측정(null)은 뒤로(버리지는 않는다 — 실존 검색어다)
 * 3개를 못 채우면 있는 만큼만 낸다 — 지어내는 것보다 모자란 게 낫다.
 */

import { classifyTitleFrame, type TitleFrame } from './frame-analysis';
import { sharesToken } from './board-titles';

export interface SubKeyword {
  keyword: string;
  searchVolume: number | null;
  frame: TitleFrame;
}

export interface ExpansionCandidate {
  keyword: string;
  searchVolume: number | null;
}

/** 문제를 해결하러 온 검색 — 애드센스 글감으로 정보 수요가 가장 진하다. */
const PROBLEM_FRAMES: ReadonlySet<TitleFrame> = new Set(['mistake', 'compare']);

const MAX_SUBS = 3;

export function pickProblemSubKeywords(
  mainKeyword: string,
  expansions: readonly ExpansionCandidate[],
): SubKeyword[] {
  return expansions
    .filter((candidate) => candidate.keyword && candidate.keyword !== mainKeyword)
    .filter((candidate) => sharesToken(candidate.keyword, mainKeyword))
    .map((candidate) => ({
      keyword: candidate.keyword,
      searchVolume: candidate.searchVolume ?? null,
      frame: classifyTitleFrame(candidate.keyword),
    }))
    .filter((candidate) => PROBLEM_FRAMES.has(candidate.frame))
    .sort((a, b) => (b.searchVolume ?? -1) - (a.searchVolume ?? -1))
    .slice(0, MAX_SUBS);
}
