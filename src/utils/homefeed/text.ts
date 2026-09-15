/**
 * 홈판 신호 텍스트 도구 — 키 정규화 · 기사 제목 정규화 · 어절 토큰 · 자카드 · 숫자/인용 추출.
 *
 * 형태소 분석기가 없다. 워커 브리프의 조사 · 활용어미 정규화(normalizeBriefToken)를 그대로 옮겨
 * '이란이' · '이란의' · '이란' 을 같은 말로 본다. 의미 판단이 아니라 표면 규칙이다.
 */
import { createHash } from 'crypto';

/** 이슈 키 — NFKC · 소문자 · 공백 · 문장부호 제거. */
export function compactKey(value: unknown): string {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

const TAG_PAREN_RE = /\((?:종합|포토|영상|단독|속보|인터뷰|전문|사진|현장|\d보|상보|일문일답)\)/gu;
const TAG_BRACKET_RE = /\[[^\]]{0,30}\]|【[^】]{0,30}】|〔[^〕]{0,30}〕|<[^>]{0,30}>/gu;
/** 끝의 매체 꼬리표만 — " - 토트넘 결별 공식화" 같은 본문 조각은 건드리지 않게 매체 이름꼴일 때만 뗀다. */
const PRESS_TAIL_RE = /\s[-|]\s[^-|]{0,16}(?:뉴스|일보|신문|경제|방송|TV|닷컴|데일리|타임스|타임즈|저널|포스트|미디어|뉴시스|연합|헤럴드|투데이|코리아|스포츠|엔터)\s*$/u;

/** 기사 제목 정규화 — 말머리([단독] · (종합)) · 이모지 · 끝의 매체 꼬리표를 걷는다. */
export function normalizeTitle(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFKC')
    .replace(TAG_BRACKET_RE, ' ')
    .replace(TAG_PAREN_RE, ' ')
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(PRESS_TAIL_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const VERB_TAILS = ['했습니다', '했다고', '하겠다', '했다', '하자', '하며', '하는', '한다', '합니다', '됐다', '된다', '되며', '되자', '됩니다'];
const PARTICLE_TAILS = ['에서는', '으로는', '에서', '으로', '까지', '부터', '라고', '하고', '에는', '과의', '와의'];

/** 어절 꼬리의 조사 · 활용어미를 걷는다(워커 normalizeBriefToken 과 같은 규칙). */
export function normalizeToken(token: string): string {
  let word = String(token || '');
  for (const tail of VERB_TAILS) {
    if (word.length - tail.length >= 2 && word.endsWith(tail)) { word = word.slice(0, -tail.length); break; }
  }
  for (const tail of PARTICLE_TAILS) {
    if (word.length - tail.length >= 2 && word.endsWith(tail)) return word.slice(0, -tail.length);
  }
  if (word.length >= 3 && /[이가은는을를의에도로와과]$/u.test(word)) return word.slice(0, -1);
  return word;
}

/** 제목의 비교용 토큰 집합(2자 이상 어절 · 정규화 · 소문자). */
export function titleTokens(title: unknown): Set<string> {
  const text = normalizeTitle(title).toLowerCase();
  return new Set((text.match(/[가-힣a-z0-9]{2,}/gu) || []).map(normalizeToken).filter((token) => token.length >= 2));
}

/** 비교용 토큰(소문자 · 정규화)의 원래 표기 — "la행" → "LA행". 못 찾으면 토큰 그대로. */
export function surfaceToken(token: string, titles: readonly string[]): string {
  for (const title of titles) {
    for (const raw of normalizeTitle(title).match(/[가-힣A-Za-z0-9]{2,}/gu) || []) {
      const normalized = normalizeToken(raw);
      if (normalized.toLowerCase() === token) return normalized;
    }
  }
  return token;
}

/** 자카드 유사도. 둘 다 비었으면 null — 비교할 게 없다. */
export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number | null {
  if (a.size === 0 && b.size === 0) return null;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  const union = a.size + b.size - shared;
  return union === 0 ? null : shared / union;
}

/** a 에서 b 를 뺀 집합. */
export function withoutTokens(a: ReadonlySet<string>, b: ReadonlySet<string>): Set<string> {
  return new Set([...a].filter((token) => !b.has(token)));
}

/**
 * 같은 이슈를 가리키는 검색어인가 — 원천마다 표기가 조금씩 다르다("이란 유조선 3척 타격" · "이란 유조선").
 * 공백을 뺀 말이 같거나 3자 이상 말이 다른 쪽에 통째로 들어 있거나, 어절이 두 개 이상(한쪽이 한 어절이면 하나) 겹치면 같다.
 */
export function sameIssueKeyword(a: unknown, b: unknown): boolean {
  const ka = compactKey(a);
  const kb = compactKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const [shorter, longer] = ka.length <= kb.length ? [ka, kb] : [kb, ka];
  if (shorter.length >= 3 && longer.includes(shorter)) return true;
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (ta.size === 0 || tb.size === 0) return false;
  let shared = 0;
  for (const token of ta) if (tb.has(token)) shared += 1;
  return shared >= 2 || (Math.min(ta.size, tb.size) === 1 && shared === 1);
}

/**
 * 이 기사 표본이 정말 그 이슈의 것인가 — 네이버 뉴스 검색은 문장형 검색어에 느슨하게 걸린 기사도 준다.
 * 실측(2026-09-16): '엄지성 해트트릭 첫 승리' 검색 결과에 '손흥민 새 역사 기념식' · '김승원 청문회' 기사가 섞여
 * 각도 · 재미 근거가 다른 이슈 기사로 채워졌다. 검색어 어절이 제목에 실제로 겹칠 때만 표본으로 쓴다.
 * 어절이 하나뿐인 검색어는 그 말이 제목에 있어야 하고, 둘 이상이면 두 개 이상 겹쳐야 한다.
 */
export function isRelevantSample(keyword: unknown, title: unknown): boolean {
  const keywordTokens = titleTokens(keyword);
  const tokens = titleTokens(title);
  if (keywordTokens.size === 0 || tokens.size === 0) return false;
  let shared = 0;
  for (const token of keywordTokens) if (tokens.has(token)) shared += 1;
  return shared >= Math.min(2, keywordTokens.size);
}

const NUMBER_RE = /\d+(?:[.,]\d+)*\s*(?:조|억|만\s?원|천만|백만|만|천|원|달러|%|퍼센트|세|살|년|개월|주|일|시간|분|초|명|건|배|위|척|대|곳|개|kg|cm|km|평|층|회|골|점|승|패)?/gu;

/** 제목의 숫자 토큰("3척" · "10억" · "20%"). 공백은 붙인다. */
export function numberTokens(title: unknown): string[] {
  const found = String(title ?? '').normalize('NFKC').match(NUMBER_RE) || [];
  return [...new Set(found.map((token) => token.replace(/\s+/g, '')))];
}

/** 숫자 토큰에서 숫자만(비교용) — "10억원" · "10억" 은 같은 숫자 "10" 이다. */
export function numberCore(token: string): string {
  return (String(token).match(/\d+(?:[.,]\d+)*/u)?.[0] || '').replace(/,/g, '');
}

const QUOTE_RE = /["“”‘’'「」『』]([^"“”‘’'「」『』]{2,40})["“”‘’'「」『』]/gu;

/** 따옴표 안의 말(인용). */
export function quoteSpans(title: unknown): string[] {
  const out: string[] = [];
  for (const match of String(title ?? '').normalize('NFKC').matchAll(QUOTE_RE)) {
    const span = match[1].replace(/\s+/g, ' ').trim();
    if (span.length >= 2 && !out.includes(span)) out.push(span);
  }
  return out;
}

/** 짧은 해시(근거 캐시 열쇠 · 스토리 id). */
export function shortHash(value: unknown, length = 12): string {
  return createHash('sha1').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex').slice(0, length);
}

/** 글자 수 상한으로 자른다(말줄임표 없이 — 화면이 필요하면 붙인다). */
export function clip(value: unknown, max: number): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length <= max ? text : text.slice(0, max).trim();
}
