/**
 * 곧 뜰 숏텐츠 후보(2026-10-30) — 실시간 급상승어 중 아직 숏텐츠에 없는 말을 뉴스 최신순 표본으로 잰다.
 *
 * 여러 언론사가 짧은 시간에 쓰기 시작한 소재가 30분 집계 숏텐츠에 먼저 잡히기 전 단계라는 가정이다.
 * 이 가정이 맞는지는 upcoming-ledger 의 적중 장부가 잰다. 점수 · 확률은 만들지 않는다 — 센 숫자와 그 숫자 순서뿐.
 * 순수 함수 · 입력 불변.
 */
import type { ShortentsWindow } from './parse';

export const WINDOW_MIN = 90;
export const RECENT_MIN = 20;
export const MIN_ARTICLES = 3;
export const MIN_PRESS = 2;
export const NEWS_DISPLAY = 100;
export const UPCOMING_LIMIT = 20;

export interface NewsSample {
  title: string;
  press: string | null;
  publishedAt: string | null;
  link: string;
}

export interface UpcomingCandidate {
  keyword: string;
  /** 후보를 준 급상승 목록(signal.bz · nate · google · daum). */
  sources: string[];
  articles90: number;
  recent20: number;
  press: number;
  firstArticleAt: string | null;
  exclusive: boolean;
  /** 받은 표본이 전부 90분 안 — 실제 기사는 더 있을 수 있다. */
  capped: boolean;
  samples: NewsSample[];
}

const EXCLUSIVE = /단독|공식/;
const compact = (value: string): string => value.replace(/\s+/g, '').toLowerCase();
/** 두 글자 이상 낱말 — 문장부호로 자른다(따옴표 · 가운뎃점 · 쉼표 · 말줄임 등). */
const words = (value: string): string[] =>
  value.toLowerCase().split(/[\s,.·'"‘’“”…!?()[\]<>/|:;~-]+/).filter((w) => w.length >= 2);

/**
 * 같은 소재 — 공백 무시 포함, 또는 세 글자 이상 낱말 공유, 또는 두 글자 낱말 둘 이상 공유. 한 글자 말은 무엇과도 묶지 않는다.
 * 실측(2026-10-30): '스페인 고속열차 추돌' ↔ '스페인 고속열차 사고', '최불암 선생님 영원한 아버지' ↔ '배우 최불암 별세' 를 포함만으로는 놓쳤다.
 */
export function topicMatches(candidate: string, shortentsKeyword: string): boolean {
  const a = compact(candidate);
  const b = compact(shortentsKeyword);
  if (a.length < 2 || b.length < 2) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const mine = new Set(words(candidate));
  const shared = new Set(words(shortentsKeyword).filter((w) => mine.has(w)));
  return [...shared].some((w) => w.length >= 3) || shared.size >= 2;
}

/** 제목에 검색어 낱말이 하나라도 있나 — 뉴스 검색은 본문도 맞추므로 넓은 말이 부풀려진다. */
function titleMentions(keyword: string, title: string): boolean {
  const t = compact(title);
  const ws = words(keyword);
  return ws.length ? ws.some((w) => t.includes(w)) : t.includes(compact(keyword));
}

export function measureCandidate(
  keyword: string,
  sources: readonly string[],
  news: readonly NewsSample[],
  nowMs: number,
  display = NEWS_DISPLAY,
): UpcomingCandidate {
  const dated = news
    .filter((n) => titleMentions(keyword, n.title))
    .map((n) => ({ n, at: Date.parse(n.publishedAt || '') }))
    .filter((x) => Number.isFinite(x.at));
  const within = (min: number) => dated.filter((x) => nowMs - x.at <= min * 60_000);
  const recent = within(WINDOW_MIN);
  const first = recent.reduce<number | null>((min, x) => (min === null || x.at < min ? x.at : min), null);
  return {
    keyword,
    sources: [...sources],
    articles90: recent.length,
    recent20: within(RECENT_MIN).length,
    press: new Set(recent.map((x) => x.n.press).filter((p): p is string => Boolean(p))).size,
    firstArticleAt: first === null ? null : new Date(first).toISOString(),
    exclusive: recent.some((x) => EXCLUSIVE.test(x.n.title)),
    capped: news.length >= display && recent.length === dated.length && dated.length > 0,
    samples: [...recent].sort((a, b) => b.at - a.at).slice(0, 3).map((x) => ({ ...x.n })),
  };
}

export function isInShortents(keyword: string, window: ShortentsWindow | null): boolean {
  return Boolean(window?.items.some((item) => topicMatches(keyword, item.keyword)));
}

export function selectUpcoming(
  candidates: readonly UpcomingCandidate[],
  currentWindow: ShortentsWindow | null,
  limit = UPCOMING_LIMIT,
): UpcomingCandidate[] {
  const ordered = candidates
    .filter((c) => c.articles90 >= MIN_ARTICLES && c.press >= MIN_PRESS && !isInShortents(c.keyword, currentWindow))
    .sort((a, b) => b.press - a.press || b.recent20 - a.recent20 || b.articles90 - a.articles90);
  // 같은 소재 후보는 센 숫자가 큰(앞선) 하나만 — 실측: '진성준 비자 거부' 와 '… 미국 이익' 이 둘 다 올라왔다.
  return ordered
    .filter((c, i) => !ordered.slice(0, i).some((prev) => topicMatches(prev.keyword, c.keyword)))
    .slice(0, limit);
}
