/**
 * 이슈 브리프 추출기 — 실시간 검색어가 "왜 떴는지"를 기사 원문에서 뽑는다.
 *
 * 왜 필요한가:
 *   지금 마인드맵은 접미사 규칙 트리다. '이정후 적시타' 에 "전말" 을 붙여
 *   "이정후 적시타 전말" 이라는 라벨과 "배경, 현재 반응, 남은 쟁점 분리" 라는
 *   고정 문구를 보여준다. 사실이 하나도 없어서 초보자가 이걸 보고 글을 쓸 수 없다.
 *
 *   필요한 건 "이정후가 2회말 2사 만루에서 몬테로의 3구째를 걷어내 2타점 중전
 *   적시타를 쳤고 그게 결승타가 됐다" 같은 실제 정황이다. 그건 지어낼 수 없고
 *   기사에서 가져와야 한다. 그래서 Bright Data 로 뉴스탭을 받아 여기서 판다.
 *
 * 지켜야 할 선:
 *   조합해서 만들지 않는다. facts 의 문장은 전부 기사 원문에 실재하는 문장이고,
 *   각각 어느 기사에서 왔는지(sourceIndex) 를 달고 나간다. 근거 없는 문장을
 *   섞는 순간 이 기능은 쓸모가 없어진다 — 초보자는 그걸 사실로 믿고 쓴다.
 */

export interface IssueArticle {
  title: string;
  summary: string;
  press: string;
  /** 기사 대표 사진(원본 절대주소). 언론사 로고는 제외한다. */
  imageUrl?: string;
}

export interface IssueFact {
  text: string;
  /** 이 문장이 나온 기사의 articles 인덱스. */
  sourceIndex: number;
}

export interface IssueLink {
  url: string;
  press: string;
}

export interface IssueBrief {
  keyword: string;
  hasContent: boolean;
  articles: IssueArticle[];
  facts: IssueFact[];
  links: IssueLink[];
}

const HEADLINE_RE = /sds-comps-text-type-headline[^"]*"[^>]*>([\s\S]{2,300}?)<\/span>/g;
const BODY_RE = /sds-comps-text-type-body1[^"]*"[^>]*>([\s\S]{20,600}?)<\/span>/g;
const PRESS_RE = /sds-comps-profile-info-title[^>]*>([\s\S]{1,120}?)<\/(?:span|a|div)>/g;
const ARTICLE_URL_RE = /https:\/\/n\.news\.naver\.com\/mnews\/article\/[0-9]+\/[0-9]+/g;
/** 기사 사진만. office_logo 는 언론사 로고라 전 기사가 같은 그림이 된다. */
const ORIGIN_IMAGE_RE = /imgnews\.pstatic\.net%2Fimage%2Forigin%2F[^&"'\s>]+/g;

function stripTags(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchAllText(html: string, re: RegExp, limit: number): string[] {
  re.lastIndex = 0;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && out.length < limit) {
    const text = stripTags(String(m[1]));
    if (text) out.push(text);
  }
  return out;
}

/** 언론사명으로 보기 어려운 값을 걸러낸다(메뉴·옵션 텍스트가 같은 클래스로 온다). */
function looksLikePress(value: string): boolean {
  if (value.length < 2 || value.length > 20) return false;
  if (/(옵션|선택|바로가기|검색|설정|더보기|펼치기|접기|삭제|적용|초기화)/.test(value)) return false;
  return true;
}

/**
 * 문장 단위로 쪼갠다.
 *
 * 말줄임표(…/...)도 경계로 본다. 네이버 요약은 문장 중간을 잘라 "…" 로 잇는데,
 * 이걸 경계로 안 보면 "6경기 연속 안타... 그는 2사 만루에서 몬테로의 3구째를
 * 걷어내 2타점 적시타를 폭발했다" 가 통째로 한 덩어리가 되고, 앞쪽 잘린 조각
 * 때문에 뒤의 알짜 정황까지 같이 버려진다. 실제로 그렇게 묻혔다.
 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\.{3,}\s*|…\s*|(?<=다)\s+(?=[A-Z가-힣])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 15);
}

/** 사진 캡션 종결 — 사건이 아니라 정지된 장면 묘사다. */
const PHOTO_CAPTION_TAIL_RE = /(바라보고 있다|하고 있다|기뻐하고 있다|들어서고 있다|모습이다)\.?$/;
/** 끝이 잘린 문장 — 핵심 숫자가 날아간 상태다. */
const TRUNCATED_TAIL_RE = /(\.\.\.|…)\s*$/;

/**
 * 글감이 되는 문장인지. 캡션과 잘린 문장은 후보에서 아예 뺀다.
 *
 * 점수만으로 거르면 안 된다 — 사진 캡션은 "2회 말", "2타점", "오라클 파크" 를
 * 다 담고 있어서 오히려 점수가 제일 높게 나온다. 실제로 캡션이 1위를 먹고
 * 정작 필요한 "몬테로의 3구째를 걷어내" 가 밀려났다.
 */
function isUsableFact(sentence: string): boolean {
  if (PHOTO_CAPTION_TAIL_RE.test(sentence)) return false;
  if (TRUNCATED_TAIL_RE.test(sentence)) return false;
  // 날짜만 있는 꼬리("2026.08.08.") 같은 조각 제외
  if (!/[가-힣]{4,}/.test(sentence)) return false;
  // 문장이 제대로 끝났는지. 말줄임표로 쪼개고 나면 앞 조각은 "…3타수" 처럼
  // 잘렸다는 표시를 잃어버려서, 꼬리 검사만으로는 못 걸러진다.
  // 종결어미로 끝나지 않으면 중간에서 잘린 것으로 본다.
  if (!/(다|요|음|함|됨|것|죠|네|까)[.!?"”'’)\]]*$/.test(sentence)) return false;
  return true;
}

/** 구체 정황이 담긴 문장일수록 앞에 둔다 — 숫자·상황어가 있으면 글감이 된다. */
function specificityScore(sentence: string): number {
  let score = 0;
  if (/\d/.test(sentence)) score += 2;
  if (/(회말|회초|타석|만루|타점|연속|타율|득점|결승|선발)/.test(sentence)) score += 3;
  // 동작 서술 — "어떻게 했는지" 가 들어간 문장이 초보자에게 실제 글감이 된다.
  if (/(걷어내|때렸|폭발|터뜨리|잡은 뒤|묶었|허용|뽑았|승리했|패했)/.test(sentence)) score += 4;
  if (/(현지|한국시간|열린|경기|파크|구장)/.test(sentence)) score += 1;
  return score;
}

/**
 * 기사 링크와 언론사를 짝짓는다.
 *
 * 인덱스로 짝지으면 안 된다 — 링크 목록과 언론사 목록은 길이도 순서도 다르다.
 * 실제로 같은 언론사(office 001) 기사 3건에 서로 다른 언론사명이 붙는 오귀속이 났다.
 * "공식 확인" 이라고 내보내면서 출처를 틀리면 그건 사실 조작이다.
 * 그래서 HTML 안에서 URL 바로 앞에 실제로 붙어 있는 언론사명만 인정하고,
 * 못 찾으면 비운다(지어내지 않는다).
 */
function extractLinks(source: string): IssueLink[] {
  const seen = new Set<string>();
  const out: IssueLink[] = [];
  ARTICLE_URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ARTICLE_URL_RE.exec(source)) !== null) {
    const url = m[0];
    if (seen.has(url)) continue;
    seen.add(url);
    // URL 직전 구간에서 가장 가까운 언론사 표기를 찾는다.
    const before = source.slice(Math.max(0, m.index - 4000), m.index);
    const nearby = matchAllText(before, new RegExp(PRESS_RE.source, 'g'), 40).filter(looksLikePress);
    out.push({ url, press: nearby.length > 0 ? (nearby[nearby.length - 1] as string) : '' });
  }
  return out;
}

export function extractIssueBrief(html: string, keyword: string): IssueBrief {
  const source = String(html || '');
  const titles = matchAllText(source, HEADLINE_RE, 10);
  const summaries = matchAllText(source, BODY_RE, 10);
  const presses = matchAllText(source, PRESS_RE, 60).filter(looksLikePress);

  const images = [...new Set(
    [...source.matchAll(ORIGIN_IMAGE_RE)].map((m) => `https://${decodeURIComponent(m[0])}`),
  )];

  const articles: IssueArticle[] = titles.map((title, index) => ({
    title,
    summary: summaries[index] || '',
    press: presses[index] || '',
    ...(images[index] ? { imageUrl: images[index] } : {}),
  }));

  // 사실 문장 — 요약문을 문장으로 쪼개 구체적인 것부터 고른다.
  // 지어내지 않는다. 전부 기사 원문 문장 그대로다.
  const factCandidates: Array<IssueFact & { score: number }> = [];
  summaries.forEach((summary, index) => {
    for (const sentence of splitSentences(summary)) {
      if (!isUsableFact(sentence)) continue;
      factCandidates.push({
        text: sentence,
        sourceIndex: index,
        // 네이버가 이미 관련도순으로 정렬해 준다. 뒤쪽 기사는 같은 검색어라도
        // 다른 날 다른 경기인 경우가 많아서, 섞으면 "흐름 정리"가 엉킨다
        // (같은 키워드에 0-6 패배·4-5 석패 같은 과거 경기가 딸려 온다).
        // 그래서 뒤로 갈수록 감점해 현재 사건 쪽으로 모은다.
        score: specificityScore(sentence) - index,
      });
    }
  });
  const seen = new Set<string>();
  const facts: IssueFact[] = factCandidates
    .sort((a, b) => b.score - a.score)
    .filter((candidate) => {
      const key = candidate.text.slice(0, 24);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6)
    .map(({ text, sourceIndex }) => ({ text, sourceIndex }));

  const links: IssueLink[] = extractLinks(source).slice(0, 6);

  return {
    keyword: String(keyword || '').trim(),
    hasContent: articles.length > 0,
    articles,
    facts,
    links,
  };
}
