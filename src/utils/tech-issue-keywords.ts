/**
 * IT·AI 이슈 공급원 — 기술 매체 RSS 제목에서 주체(제품·모델·기업)를 뽑는다.
 *
 * 왜 별도 레인인가: 새 AI 모델·기기가 나오면 검색은 그날 터지는데 블로그 문서는 아직 없다.
 * 실검(Signal.bz)은 이걸 잘 못 잡고, 정책 공급원과도 성격이 다르다.
 *
 * 정책 레인과 다른 점 하나: **버전 숫자를 버리지 않는다.**
 * "제미나이 3", "GPT-5" 처럼 버전이 키워드의 핵심이라, 숫자 토큰을 노이즈로 떨구면
 * 정작 사람들이 검색하는 형태가 사라진다.
 *
 * 피드 생존은 실측으로 확인한 것만 싣는다 (2026-09-02):
 *   살아있음 — ZDNet / 전자신문(전체·IT) / AI타임스 / 테크42 / 바이라인네트워크
 *   죽음     — 디지털타임스 404 · 블로터 403 · inews24 404 · ITWorld 404
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { tokenize, isNounPhraseToken, collapseVariants } from './keyword-shape';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const TIMEOUT = 12_000;

/** 실측으로 살아있음을 확인한 피드만. 죽은 피드는 조용히 0건이 되므로 싣지 않는다. */
const LIVE_TECH_FEEDS = [
  'https://www.aitimes.com/rss/allArticle.xml',
  'https://feeds.feedburner.com/zdkorea',
  'https://rss.etnews.com/Section902.xml',
  'https://rss.etnews.com/Section901.xml',
  'https://www.tech42.co.kr/feed/',
  'https://byline.network/feed/',
];

/** 이 말이 제목에 없으면 IT·AI 기사가 아니다 (같은 피드에도 호텔·유통 기사가 섞여 온다). */
const TECH_DOMAIN_RE = /(AI|인공지능|LLM|GPT|챗봇|클로드|제미나이|모델|반도체|GPU|NPU|칩|인텔|엔비디아|클라우드|데이터센터|서버|로봇|자율주행|스마트폰|갤럭시|아이폰|맥북|노트북|앱|플랫폼|소프트웨어|알고리즘|양자|배터리|전기차|디스플레이|보안|해킹|오픈소스|스타트업|개발자|네트워크|통신)/i;

/** 주체가 아니라 기사 형식을 나타내는 말머리 — 통째로 떼어낸다. */
const BRACKET_PREFIX_RE = /^\s*(?:[\[【(〈《][^\]】)〉》]{1,20}[\]】)〉》]\s*)+/;

/**
 * 제품·모델명은 따옴표 안에 있다 — 한국 기술기사의 굳은 관습이다.
 *   "월드랩스, 옴니 월드모델 '아틀라스' 공개"  → 아틀라스
 *   "앤트로픽, 새 모델 '페이블 5.1' 공개"      → 페이블 5.1
 * 회사명만 뽑으면 정작 사람들이 검색하는 이름을 놓친다.
 */
const QUOTED_NAME_RE = /['‘’"“”]([^'‘’"“”]{2,24})['‘’"“”]([^'‘’"“”]{0,14})/g;

/**
 * 따옴표는 제품명뿐 아니라 인용·강조에도 쓰인다 — 표본에서 절반이 노이즈였다
 * ('사회적 합의', '영업비밀', "여권 어디 뒀더라").
 * 닫는 따옴표 바로 뒤에 출시·발표 동사가 오는 것만 제품명으로 인정한다.
 */
const RELEASE_VERB_RE = /(출시|공개|선보|발표|도입|런칭|출격|공급|개최|정식|내놨|내놓|탑재|적용)/;

/** 너무 일반적이라 키워드가 못 되는 주체 — 나라·매체 자신·범칭. */
const TOO_GENERIC_SUBJECT_RE = /^(미국|중국|일본|한국|유럽|정부|국내|세계|업계|전자신문|지디넷|아이뉴스24|블로터|시장)$/;

/** 사람 직함으로 끝나면 인물 기사다 — 파생이 인물 신상으로 흐른다. */
const PERSON_TITLE_RE = /(대표|사장|회장|부회장|장관|차관|소장|원장|교수|위원장|본부장|이사)$/;

/** 버전·모델명 토큰 (예: "5.1", "3", "M4", "X100") — 숫자라도 버리지 않는다. */
const VERSION_TOKEN_RE = /^[A-Za-z]?[0-9]+(\.[0-9]+)*[A-Za-z]?$/;

/**
 * 주체는 "주체, 서술" 꼴의 쉼표 앞에서만 인정한다.
 *
 * 따옴표나 말줄임으로 시작하는 제목은 주체가 앞에 없고 인용·해설이 먼저 온다
 * ("20명 동시 대화도 단숨에"… 메타, …). 첫 구분자가 무엇이든 앞부분을 주체로 삼으면
 * "AI 경쟁 넘어", "여권 어디 뒀더라" 같은 문장 조각이 그대로 키워드가 된다.
 * 어미·조사를 규칙으로 계속 쫓는 대신, 확실한 자리만 취하고 나머지는 버린다.
 */
const SUBJECT_LEAD_RE = /^([^,"'“”‘’…·:∙\[\]()]{2,30}),\s/;

export interface TechIssueKeyword {
  keyword: string;
  title: string;
  source: string;
}

async function fetchFeedTitles(url: string): Promise<string[]> {
  try {
    const res = await axios.get(url, {
      timeout: TIMEOUT,
      headers: { 'User-Agent': UA, Accept: 'application/rss+xml,text/xml,*/*', 'Accept-Language': 'ko-KR,ko;q=0.9' },
      validateStatus: (s) => s < 500,
    });
    if (res.status >= 400 || typeof res.data !== 'string') return [];
    const $ = cheerio.load(res.data, { xmlMode: true });
    const titles: string[] = [];
    $('item > title').each((_, el) => {
      const t = $(el).text().trim().replace(/\s+/g, ' ');
      if (t && t.length >= 6) titles.push(t);
    });
    return titles;
  } catch {
    return [];
  }
}

/** 버전 토큰이거나 명사구 토큰이면 주체의 일부로 인정한다. */
function isSubjectToken(token: string): boolean {
  if (VERSION_TOKEN_RE.test(token)) return true;
  if (token.length < 2) return false;
  return isNounPhraseToken(token);
}

/**
 * 기사 제목에서 주체를 뽑는다.
 * 한국어 기술기사 제목은 "주체, 무엇을 했다" 꼴이 압도적이라 첫 구분자 앞이 주체다.
 * 그 앞부분이 깨끗한 명사구가 아니면 버린다 — 억지로 살리면 문장 조각이 새어 나온다.
 */
export function extractTechSubject(rawTitle: string, maxTokens: number = 3): string | null {
  const title = String(rawTitle || '').replace(BRACKET_PREFIX_RE, '').trim();
  if (!title) return null;
  if (!TECH_DOMAIN_RE.test(title)) return null;

  const lead = title.match(SUBJECT_LEAD_RE);
  if (!lead) return null;
  const cleaned = lead[1].replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;

  const tokens = tokenize(cleaned);
  // 쉼표 앞이 3어절을 넘으면 주체가 아니라 문장이다.
  if (tokens.length > maxTokens) return null;
  // 한 토큰이라도 조각이면 통째로 버린다 — 앞부분만 잘라 쓰면 뜻이 바뀐다.
  if (!tokens.every(isSubjectToken)) return null;
  const taken = tokens;
  if (taken.length === 0) return null;

  // 버전 숫자만 남는 건 주체가 아니다.
  if (taken.every((t) => VERSION_TOKEN_RE.test(t))) return null;

  const subject = taken.join(' ').trim();
  if (subject.replace(/\s+/g, '').length < 2) return null;
  if (TOO_GENERIC_SUBJECT_RE.test(subject)) return null;
  if (PERSON_TITLE_RE.test(taken[taken.length - 1])) return null;
  return subject;
}

/**
 * 제목의 따옴표 안에서 제품·모델명을 뽑는다.
 * 주체(회사)와 별개로 이것 자체가 검색되는 이름이므로 따로 이슈로 세운다.
 */
export function extractQuotedProductNames(rawTitle: string, maxTokens: number = 3): string[] {
  const title = String(rawTitle || '');
  if (!TECH_DOMAIN_RE.test(title)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of title.matchAll(QUOTED_NAME_RE)) {
    const name = String(match[1] || '').replace(/\s+/g, ' ').trim();
    if (!name) continue;
    if (!RELEASE_VERB_RE.test(String(match[2] || ''))) continue;
    const tokens = tokenize(name);
    if (tokens.length === 0 || tokens.length > maxTokens) continue;
    if (!tokens.every(isSubjectToken)) continue;
    if (tokens.every((t) => VERSION_TOKEN_RE.test(t))) continue;
    // 2자짜리는 제품명보다 일반명사일 확률이 높다 ('냉각' 같은 강조 인용).
    if (name.replace(/\s+/g, '').length < 3) continue;
    if (TOO_GENERIC_SUBJECT_RE.test(name)) continue;
    const key = name.replace(/\s+/g, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/**
 * 살아있는 기술 매체에서 IT·AI 이슈 주체를 모은다.
 * 실패한 피드는 건너뛴다 — 한 곳이 죽어도 레인 전체가 죽지 않게.
 */
export async function getTechIssueKeywords(limit: number = 8): Promise<TechIssueKeyword[]> {
  const collected: TechIssueKeyword[] = [];
  const seen = new Set<string>();

  const perFeed = await Promise.allSettled(
    LIVE_TECH_FEEDS.map(async (url) => ({ url, titles: await fetchFeedTitles(url) })),
  );

  for (const result of perFeed) {
    if (result.status !== 'fulfilled') continue;
    const { url, titles } = result.value;
    for (const title of titles) {
      // 제품·모델명을 먼저 담는다 — 회사명보다 검색되는 이름이다.
      const names = [...extractQuotedProductNames(title), extractTechSubject(title) || ''];
      for (const name of names) {
        if (!name) continue;
        const key = name.replace(/\s+/g, '').toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        collected.push({ keyword: name, title, source: url });
      }
    }
  }

  const kept = new Set(collapseVariants(collected.map((c) => c.keyword)));
  return collected.filter((c) => kept.has(c.keyword)).slice(0, limit);
}
