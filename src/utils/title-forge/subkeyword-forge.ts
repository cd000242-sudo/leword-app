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
  /** 어디서 온 실측인가 — autocomplete(확장 실측) | ai-verified(AI 제안 후 검색량 실존 검증). */
  source?: string;
}

export interface ExpansionCandidate {
  keyword: string;
  searchVolume: number | null;
  source?: string;
}

/** 문제를 해결하러 온 검색 — 애드센스 글감으로 정보 수요가 가장 진하다. */
const PROBLEM_FRAMES: ReadonlySet<TitleFrame> = new Set(['mistake', 'compare']);

const MAX_SUBS = 3;

/**
 * 실존 검증까지 끝난 후보를 공통 규칙으로 정리한다(남의 키워드·자기 자신·중복 제외).
 * 같은 검색어는 먼저 온 것만 남긴다 — 재보강은 기존 서브와 새 풀을 합쳐 넘기므로
 * 같은 말이 두 번 오고, 그대로 두면 서브가 늘어난 것으로 오판된다(2026-09-03 베슬AI).
 */
function normalize(
  mainKeyword: string,
  expansions: readonly ExpansionCandidate[],
): SubKeyword[] {
  const seen = new Set<string>();
  return expansions
    .filter((candidate) => candidate.keyword && candidate.keyword !== mainKeyword)
    .filter((candidate) => sharesToken(candidate.keyword, mainKeyword))
    .filter((candidate) => {
      const key = candidate.keyword.replace(/\s+/g, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((candidate) => ({
      ...candidate,
      searchVolume: candidate.searchVolume ?? null,
      frame: classifyTitleFrame(candidate.keyword),
    }));
}

const byVolume = (a: SubKeyword, b: SubKeyword) => (b.searchVolume ?? -1) - (a.searchVolume ?? -1);

export function pickProblemSubKeywords(
  mainKeyword: string,
  expansions: readonly ExpansionCandidate[],
): SubKeyword[] {
  return normalize(mainKeyword, expansions)
    .filter((candidate) => PROBLEM_FRAMES.has(candidate.frame))
    .sort(byVolume)
    .slice(0, MAX_SUBS);
}

/**
 * 문제해결형을 **우선**하되 모자라면 실존 검색어로 채운다.
 *
 * 왜 채우는가 (2026-08-18 실측): 프롬프트를 고쳐 실존 검증 통과가 2% → 77%
 * 로 올랐는데(제안 79 → 통과 61) 정작 보강된 행은 0이었다. 실제로 검색되는
 * 61개를 손에 쥐고도 프레임 하나만 보고 전부 버렸기 때문이다.
 *
 * 문제해결형이 정보 수요가 가장 진한 것은 맞지만, 모든 키워드가 문제를 안고
 * 검색되는 것은 아니다. 실존이 확인된 검색어를 버리는 것보다 순서를 매겨
 * 보여주는 편이 낫다 — 지어낸 것이 아니라 사람들이 실제로 치는 말이다.
 */
export function pickSubKeywords(
  mainKeyword: string,
  expansions: readonly ExpansionCandidate[],
): SubKeyword[] {
  const all = normalize(mainKeyword, expansions);
  const problems = all.filter((c) => PROBLEM_FRAMES.has(c.frame)).sort(byVolume);
  if (problems.length >= MAX_SUBS) return problems.slice(0, MAX_SUBS);

  const taken = new Set(problems.map((p) => p.keyword));
  const fill = all
    .filter((c) => !taken.has(c.keyword))
    .sort(byVolume)
    .slice(0, MAX_SUBS - problems.length);
  return [...problems, ...fill];
}
