/**
 * 이슈 브리프 읽기 쉽게 다듬기 — LLM 없이, 사실을 바꾸지 않고.
 *
 * 기사 원문을 그대로 보여주면 초보자가 못 읽는다. 그렇다고 문장을 새로 쓰면
 * 사실이 틀어진다. 그래서 "새로 쓰지 않고 걷어내기만" 한다.
 *
 * 걷어내는 것과 그 이유:
 *   1. 사진 캡션 — "…친 뒤 타구를 바라보고 있다" 는 사진 설명이지 사건이 아니다.
 *      이걸 사실로 내보내면 글감이 "타구를 바라봤다" 가 된다.
 *   2. 잘린 문장 — "…3타수..." 처럼 끝나면 핵심 숫자가 날아간 상태다.
 *   3. 언론사 전언 껍데기 — "KNBR 는 …고 전했다" 에서 정작 필요한 건 따옴표 안이다.
 *   4. 지명 사슬 — "미국 캘리포니아주 샌프란시스코에 위치한 오라클 파크" 는
 *      한국 독자에게 "오라클 파크" 면 충분하다. 앞의 3단계는 읽기만 방해한다.
 *   5. 중복 — 같은 사실을 여러 언론사가 쓴다. 가장 구체적인 하나만 남긴다.
 *
 * 여기서 문장을 지어내지 않는다. 남는 문장은 전부 기사 원문의 부분집합이다.
 */
import type { IssueFact } from './issue-brief-extractor';

export interface ReadableFact {
  text: string;
  sourceIndex: number;
}

/** 사진 캡션 종결 — 사건이 아니라 정지된 장면 묘사다. */
const PHOTO_CAPTION_RE = /(바라보고 있다|하고 있다|기뻐하고 있다|들어서고 있다|모습이다)\.?$/;
/** 잘린 문장. */
const TRUNCATED_RE = /(\.\.\.|…)\s*$/;
/** 언론사 전언 껍데기. 따옴표 안이 본체다. */
const ATTRIBUTION_RE = /^.{2,40}?(?:는|은|이|가)\s*[^"“]{0,40}["“]([^"”]{10,})["”](?:고|라고)\s*(?:전했다|밝혔다|말했다|보도했다)\.?$/;
/** 한국 독자에게 불필요한 상위 지명 사슬. */
const PLACE_CHAIN_RE = /(?:미국|미)\s*캘리포니아주\s*샌프란시스코(?:에\s*위치한)?\s*/g;
const GENERIC_PLACE_CHAIN_RE = /(?:미국|미)\s*[가-힣]+주\s*[가-힣]+(?:에\s*위치한)\s*/g;

/** 문장이 얼마나 쓸모 있는지 — 숫자·상황어가 많을수록 글감이 된다. */
function informationScore(sentence: string): number {
  let score = 0;
  if (/\d/.test(sentence)) score += 2;
  if (/(회말|회초|타석|만루|타점|연속|타율|득점|결승|선발|안타)/.test(sentence)) score += 3;
  if (/(발표|확정|결정|합의|인상|하락|상승)/.test(sentence)) score += 2;
  return score + Math.min(3, Math.floor(sentence.length / 40));
}

/** 같은 사실인지 — 어절 겹침으로 본다. */
function isNearDuplicate(a: string, b: string): boolean {
  const tokens = (s: string) => new Set(
    s.replace(/[^가-힣A-Za-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length >= 2),
  );
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return false;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / Math.min(ta.size, tb.size) >= 0.6;
}

/** 껍데기를 벗기고 지명 사슬을 줄인다. 내용은 건드리지 않는다. */
function tidy(sentence: string): string {
  const attributed = sentence.match(ATTRIBUTION_RE);
  const body = attributed ? String(attributed[1]).trim() : sentence;
  return body
    .replace(PLACE_CHAIN_RE, '')
    .replace(GENERIC_PLACE_CHAIN_RE, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,·\-\s]+/, '')
    .trim();
}

export function toReadableFacts(facts: IssueFact[], limit = 4): ReadableFact[] {
  const kept: ReadableFact[] = [];
  const scored = facts
    .filter((fact) => !PHOTO_CAPTION_RE.test(fact.text))
    .filter((fact) => !TRUNCATED_RE.test(fact.text))
    .map((fact) => ({ ...fact, text: tidy(fact.text) }))
    .filter((fact) => fact.text.length >= 20)
    .sort((a, b) => informationScore(b.text) - informationScore(a.text));

  for (const fact of scored) {
    if (kept.some((k) => isNearDuplicate(k.text, fact.text))) continue;
    kept.push({ text: fact.text, sourceIndex: fact.sourceIndex });
    if (kept.length >= limit) break;
  }
  return kept;
}
