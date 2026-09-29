/**
 * 노출 추적이 **어떤 검색어를 추적할지** 고르는 자리.
 *
 * 사장님 2026-09-30: "노출추적을 보면 정확하게 추적은 잘하는데 추적하는 키워드와 연관키워드가 잘못되었어."
 *
 * 무엇이 잘못됐었나(실측): 추적 319쌍 중 307쌍이 제목 어절을 기계로 이어 붙인 조각이었고,
 * 그중 검색광고에 물어본 12건이 전부 "모름"(검색량 0)이었다. 아무도 안 치는 말에서 1위 하는 건 쉽다.
 * 연관키워드도 '조건·자격·신청기간' 같은 접미사를 붙여 **만든** 말이라 실제로 치는 말이 아니었다.
 *
 * 그래서 여기서는 우리가 고르지 않는다.
 *   추적 검색어 = 제목에서 만든 후보 중 **검색광고가 검색량을 아는 것**만(내 블로그 체급이 쓰는 같은 후보기).
 *   연관 검색어 = 검색광고 연관어 실측 + 네이버 자동완성 실측. 접미사 합성은 없다.
 *
 * 창구(검색광고·자동완성)는 밖에서 넣는다 — 이 파일은 순수 판정만 하고, 그래서 시험이 붙는다.
 */
import { candidatesFromTitle } from './blog-class/title-candidates';

/** 검색광고가 이 아래로 답하면 사람들이 실제로 치는 말로 보지 않는다(blog-class-rank 와 같은 문턱). */
export const EXPOSURE_MIN_VOLUME = 10;

export interface MeasuredKeyword {
  keyword: string;
  /** 검색광고가 준 월간 합계(PC+모바일). 실측이다. */
  searchVolume: number;
}

/** 검색광고 창구 모양 — 키워드 목록을 주면 {keyword, total} 로 돌려준다. total 이 null 이면 모르는 말. */
export type VolumeMeasurer = (keywords: string[]) => Promise<Array<{ keyword: string; total: number | null }>>;

export interface PickOptions {
  /** 글 하나에 남길 검색어 수. */
  perPost: number;
  /** 제목에서 만들 후보 수(2·3어절 번갈아). 많을수록 검색광고 호출이 는다. */
  candidateLimit?: number;
  minVolume?: number;
}

const compact = (s: string) => String(s || '').replace(/\s+/g, '');

/**
 * 제목 하나 → 검색광고가 아는 검색어만, 검색량 큰 순으로 perPost 개.
 *
 * 왜 큰 순인가: 여기 목적은 "이 글이 어느 말에서 몇 위인가"를 **사람들이 실제로 치는 말**로 재는 것이다.
 * 체급(blog-class)은 이겨 본 작은 말을 찾느라 작은 순이지만, 추적은 그 글이 노리는 말을 봐야 한다.
 */
export async function pickMeasuredKeywords(
  title: string,
  measure: VolumeMeasurer,
  options: PickOptions,
): Promise<MeasuredKeyword[]> {
  const perPost = Math.max(1, Math.floor(options.perPost));
  const minVolume = options.minVolume ?? EXPOSURE_MIN_VOLUME;
  const candidates = candidatesFromTitle(title, options.candidateLimit ?? 4);
  if (candidates.length === 0) return [];

  const measured = await measure(candidates);
  const byKey = new Map(measured.map((row) => [compact(row.keyword), row.total]));
  const kept = candidates
    .map((keyword) => ({ keyword, searchVolume: byKey.get(compact(keyword)) ?? null }))
    .filter((row): row is MeasuredKeyword => typeof row.searchVolume === 'number' && row.searchVolume >= minVolume)
    .sort((a, b) => b.searchVolume - a.searchVolume);
  return kept.slice(0, perPost);
}

export interface RelatedKeyword {
  keyword: string;
  /** 검색광고 연관어면 실측 검색량, 자동완성이면 null(자동완성은 검색량을 주지 않는다). */
  searchVolume: number | null;
  source: 'searchad' | 'autocomplete';
}

export interface RelatedInputs {
  /** 검색광고 keywordstool 연관어 행(검색량 포함). */
  suggestions: ReadonlyArray<{ keyword: string; searchVolume: number | null }>;
  /** 네이버 자동완성이 실제로 보여 준 말. */
  autocomplete: ReadonlyArray<string>;
}

/**
 * 씨앗 검색어 하나의 연관 검색어를 고른다.
 *
 * 검색광고 연관어는 200개까지 오는데 씨앗과 무관한 말도 섞인다(같은 광고 그룹 묶음).
 * 씨앗의 낱말을 하나라도 품은 것만 남기고 검색량 큰 순. 그 뒤에 자동완성(사람들이 실제로 이어 친 말)을
 * 붙인다 — 자동완성은 검색량이 없으니 null 로 두고 화면이 '자동완성' 이라고 밝힌다.
 */
export function pickRelatedKeywords(seed: string, inputs: RelatedInputs, limit = 6): RelatedKeyword[] {
  const seedKey = compact(seed);
  const seedWords = String(seed || '').split(/\s+/).map(compact).filter((w) => w.length >= 2);
  if (!seedKey) return [];
  const seen = new Set<string>([seedKey]);
  const out: RelatedKeyword[] = [];

  const fromSearchAd = inputs.suggestions
    .filter((row) => typeof row.searchVolume === 'number' && row.searchVolume >= EXPOSURE_MIN_VOLUME)
    .filter((row) => {
      const key = compact(row.keyword);
      return key !== seedKey && (seedWords.length === 0 || seedWords.some((w) => key.includes(w)));
    })
    .sort((a, b) => (b.searchVolume as number) - (a.searchVolume as number));
  for (const row of fromSearchAd) {
    const key = compact(row.keyword);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ keyword: row.keyword.trim(), searchVolume: row.searchVolume, source: 'searchad' });
    if (out.length >= limit) return out;
  }
  for (const raw of inputs.autocomplete) {
    const keyword = String(raw || '').replace(/\s+/g, ' ').trim();
    const key = compact(keyword);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ keyword, searchVolume: null, source: 'autocomplete' });
    if (out.length >= limit) break;
  }
  return out;
}
