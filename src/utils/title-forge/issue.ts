/**
 * 인물 · 이슈 키워드 제목 + 붙여 쓴 키워드 띄우기(2026-10-07 사장님 "제목이 그게 왜 나오니 — 상위노출 · 홈판 노출을 겨냥한 제목이어야지").
 *
 * 실사고: '가수주현미별세이유' → "가수주현미별세이유 어떤 정보가 있는지". 붙여 쓴 키워드를 그대로 박았고,
 * 틀(레시피 · 비용 · 방법 …)이 상품 · 생활정보용이라 인물 · 이슈엔 맞는 틀이 없었다.
 * 인물 · 이슈는 확인 안 된 사실을 단정하지 않는다(그 '별세'는 가짜 뉴스였다 — ③ 카페 질문 실측).
 * 순수 함수 · 외부 호출 없음. 사이트 사본(titleForge.generated.mjs)에도 그대로 묶인다.
 */

export const ROLE_PREFIXES = ['트로트가수', '개그우먼', '개그맨', '아나운서', '방송인', '여배우', '남배우', '유튜버', '아이돌', '배우', '가수', '모델', '감독', '작가', '선수'];
export const INTENT_SUFFIXES = ['사망원인', '나무위키', '총정리', '프로필', '이유', '원인', '나이', '근황', '남편', '아내', '부인', '학력', '재산', '결혼', '이혼', '사망', '별세', '부고', '장례',
  '방법', '신청', '기간', '조건', '대상', '자격', '후기', '가격', '추천', '순위', '일정', '시간', '예매', '차이', '종류', '비교', '정리'];

/** 이 말이 들어 있으면 인물 · 이슈 — 생활정보에도 흔한 말(나이 · 결혼 · 남편)은 직업 앞말이 있을 때만 인물로 본다. */
const PERSON_ISSUE_WORDS = new Set(['별세', '사망', '사망원인', '부고', '장례', '근황', '열애', '이혼', '프로필', '학력', '논란']);
/** 소문 · 사건 말 — 홈판용은 "소식 돌던데… 직접 확인해 봤습니다"(답 숨김 · 단정 없음). */
const RUMOR_WORDS = new Set(['별세', '사망', '사망원인', '부고', '장례', '열애', '이혼', '논란']);
/** 검색용 제목에 붙일 인물 말 — 실제로 많이 찾은 말(파생 키워드 실측)에 있을 때만. */
const PERSON_EXTRA_WORDS = new Set([...PERSON_ISSUE_WORDS, '나이', '남편', '아내', '결혼', '자녀', '고향', '재산']);
/** 홈판용 짧은 말에서 뺄 말 — 제목에 '이유'까지 박으면 답을 숨길 수 없다. */
const HOME_DROP = new Set(['이유', '원인']);

const collapse = (text: string) => String(text || '').replace(/\s+/g, ' ').trim();
const compact = (text: string) => String(text || '').replace(/\s+/g, '');

/**
 * 띄어쓰기 없는 긴 키워드에 흔한 앞말(직업) · 뒷말(의도) 자리 띄어쓰기를 넣는다 — 띄어쓰기가 없으면 확장이 0개라서(실측).
 * '가수주현미별세이유' → '가수 주현미 별세 이유'. 이미 띄어 썼거나 떼어 낼 말이 없으면 null. 가운데(핵심) 말은 2자 이상 남긴다.
 */
export function spaceOutKeyword(keyword: string): string | null {
  const raw = String(keyword || '').trim();
  if (!raw || /\s/.test(raw) || raw.length < 5) return null;
  let core = raw;
  const head: string[] = [];
  const tail: string[] = [];
  const prefix = ROLE_PREFIXES.find((p) => core.startsWith(p) && core.length - p.length >= 2);
  if (prefix) { head.push(prefix); core = core.slice(prefix.length); }
  for (let guard = 0; guard < 4; guard += 1) {
    const suffix = INTENT_SUFFIXES.find((s) => core.endsWith(s) && core.length - s.length >= 2);
    if (!suffix) break;
    tail.unshift(suffix);
    core = core.slice(0, -suffix.length);
  }
  if (!head.length && !tail.length) return null;
  return [...head, core, ...tail].join(' ');
}

/** 제목에 박을 키워드 — 붙여 쓴 꼴이면 띄운 말로. */
export function displayKeyword(keyword: string): string {
  return collapse(spaceOutKeyword(keyword) || keyword);
}

export function isPersonIssueKeyword(keyword: string): boolean {
  const words = displayKeyword(keyword).split(' ');
  return ROLE_PREFIXES.includes(words[0]) || words.some((w) => PERSON_ISSUE_WORDS.has(w));
}

/** 파생 키워드에서 키워드 낱말을 지우고 남는 말 중 인물 말만. */
function personExtras(display: string, derived: ReadonlyArray<{ keyword: string; searchVolume: number | null }>): { words: string[]; from: { keyword: string; searchVolume: number | null } | null } {
  const words = display.split(' ').filter((w) => w.length >= 2);
  const picked: string[] = [];
  let from: { keyword: string; searchVolume: number | null } | null = null;
  const ordered = [...derived].sort((a, b) => (b.searchVolume || 0) - (a.searchVolume || 0));
  for (const item of ordered) {
    let rest = compact(item.keyword);
    for (const w of words) rest = rest.split(w).join(' ');
    for (const piece of rest.split(' ').filter(Boolean)) {
      if (!PERSON_EXTRA_WORDS.has(piece) || picked.includes(piece) || words.includes(piece)) continue;
      picked.push(piece);
      if (!from) from = item;
    }
    if (picked.length >= 2) break;
  }
  return { words: picked.slice(0, 2), from };
}

function fitWithin(text: string, max: number): string {
  let words = collapse(text).split(' ');
  while (words.join(' ').length > max && words.length > 1) words = words.slice(0, -1);
  return words.join(' ');
}

export interface IssueTitles {
  seo: { text: string; basis: string };
  home: { text: string; basis: string };
}

/**
 * 인물 · 이슈 제목 2종.
 *   검색용: 띄운 키워드(맨 앞) + 실제 많이 찾는 인물 말(근황 등) + "확인된 사실만" — 단정 없이 검색 의도를 받는다.
 *   홈판용: 직업 · '이유' 뗀 짧은 말 + 답 숨김("소식 돌던데… 직접 확인해 봤습니다" / "궁금해서 직접 찾아봤습니다").
 */
export function issueTitles(keyword: string, derived: ReadonlyArray<{ keyword: string; searchVolume: number | null }>): IssueTitles {
  const display = displayKeyword(keyword);
  const words = display.split(' ');
  const short = words.filter((w) => !ROLE_PREFIXES.includes(w) && !HOME_DROP.has(w)).join(' ') || display;
  const extras = personExtras(display, derived);
  const basis = extras.from
    ? `검색 실측 '${extras.from.keyword}' (검색량 ${extras.from.searchVolume === null ? '미측정' : extras.from.searchVolume}) — 인물 · 이슈 키워드, 확인된 사실만`
    : '인물 · 이슈 키워드 — 확인 안 된 내용은 단정하지 않는 틀';
  const seo = fitWithin(`${display}, ${extras.words.length ? `${extras.words.join('·')}까지 ` : ''}확인된 사실만`, 40);
  const rumor = words.some((w) => RUMOR_WORDS.has(w));
  const home = fitWithin(rumor ? `${short} 소식 돌던데… 직접 확인해 봤습니다` : `${short} 궁금해서 직접 찾아봤습니다`, 38);
  return { seo: { text: seo, basis }, home: { text: home, basis } };
}
