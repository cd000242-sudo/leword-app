/**
 * 이슈 재료 수집 — 추론 계층의 입력.
 *
 * "왜 뜨나·어디에 몰렸나·다음은 무엇인가"를 말하려면 이슈어 하나로는 부족하다.
 * 이슈마다 세 가지 실측 재료를 모은다:
 *   1. 뉴스 헤드라인(오픈API 뉴스 검색) — "왜 뜨나"의 유일한 사실 근거. 에이전트의
 *      설명은 이 제목들 밖으로 나가면 버린다(issue-next-wave 의 가드).
 *   2. 자동완성(PC+모바일) — 지금 사람들이 실제로 이어 치는 말.
 *   3. 검색광고 연관어(월 검색량) — 지난달까지의 수요 분포. 오늘 터진 이슈에는
 *      비어 있을 수 있다 — 그래서 자동완성과 나란히 둔다.
 *
 * 소스는 전부 갈아끼울 수 있다(sources) — 테스트는 네트워크 없이 조립만 본다.
 */

import type { NaverDatalabConfig } from './naver-datalab-api';
import type { NaverSearchAdConfig, KeywordSuggestion } from './naver-searchad-api';

export interface IssueHeadline {
  title: string;
  /** 원문 매체 도메인. 못 읽으면 null — 지어내지 않는다. */
  press: string | null;
  /** ISO 시각. 못 읽으면 null. */
  publishedAt: string | null;
  link: string;
}

export interface IssueRelatedKeyword {
  keyword: string;
  /** 검색광고 월 검색량(PC+모바일). 미측정이면 null. */
  monthlyVolume: number | null;
}

export interface IssueContext {
  issue: string;
  headlines: IssueHeadline[];
  autocomplete: string[];
  related: IssueRelatedKeyword[];
}

export interface IssueContextSources {
  /** 오픈API 뉴스 검색 원본(JSON). */
  fetchNews: (issue: string, display: number) => Promise<unknown>;
  fetchAutocomplete: (issue: string) => Promise<string[]>;
  fetchRelated: (hint: string) => Promise<KeywordSuggestion[]>;
}

export interface CollectIssueContextsOptions {
  config: NaverDatalabConfig;
  /** 검색광고 자격. null 이면 연관어를 부르지 않는다(undefined 면 env 에서 찾는다). */
  searchAd?: NaverSearchAdConfig | null;
  sources?: Partial<IssueContextSources>;
  headlineLimit?: number;
  autocompleteLimit?: number;
  relatedLimit?: number;
  onProgress?: (current: number, total: number, issue: string) => void;
  signal?: AbortSignal;
}

/** 이슈에 안 맞는 상업/쇼핑 변형 — issue-niche-hunter 의 COMMERCE_NOISE_RE 와 같은 목록. */
export const ISSUE_COMMERCE_NOISE_RE = /(최저가|가격비교|렌탈|구매처|구입|할인|쿠폰|중고|직구|도매|판매처|얼마|가격)/;
/** 검색광고 키워드도구가 검색량을 주는 최대 어절 수(issue-niche-hunter 와 같다). */
export const ISSUE_MEASURABLE_MAX_TOKENS = 3;
/** 검색광고 hintKeywords 상한 — 넘기면 잘린 힌트의 연관어가 온다. */
const SEARCHAD_HINT_MAX_CHARS = 15;

const DEFAULT_HEADLINES = 6;
const DEFAULT_AUTOCOMPLETE = 10;
const DEFAULT_RELATED = 8;
const NEWS_DISPLAY = 10;

function compactKey(keyword: unknown): string {
  return String(keyword || '').toLowerCase().replace(/\s+/g, '').trim();
}

function tokenCount(keyword: string): number {
  return keyword.trim().split(/\s+/).filter(Boolean).length;
}

const ENTITY_MAP: Record<string, string> = {
  '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ',
};

/** 오픈API 검색 제목의 <b> 강조와 HTML 엔티티를 걷어낸다. */
export function stripNewsMarkup(raw: unknown): string {
  return String(raw || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;|&amp;|&lt;|&gt;|&#39;|&apos;|&nbsp;/g, (m) => ENTITY_MAP[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

function hostOf(url: unknown): string | null {
  try {
    const host = new URL(String(url || '')).hostname.replace(/^www\./, '');
    return host || null;
  } catch {
    return null;
  }
}

function isoOf(raw: unknown): string | null {
  const ms = Date.parse(String(raw || ''));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** 오픈API 뉴스 응답 → 헤드라인. 같은 제목은 하나로 접는다(통신사 기사가 매체마다 실린다). */
export function parseNewsHeadlines(json: unknown, limit: number): IssueHeadline[] {
  const items = (json as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const out: IssueHeadline[] = [];
  for (const item of items as Record<string, unknown>[]) {
    if (out.length >= limit) break;
    const title = stripNewsMarkup(item?.title);
    const key = compactKey(title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      title,
      press: hostOf(item?.originallink),
      publishedAt: isoOf(item?.pubDate),
      link: String(item?.link || item?.originallink || ''),
    });
  }
  return out;
}

/** 자동완성·연관어 정제 — 이슈 자신, 쇼핑 변형, 실측 불가 길이, 중복을 뺀다. */
export function filterIssueKeywords(list: readonly string[], issue: string, limit = Infinity): string[] {
  const issueKey = compactKey(issue);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    if (out.length >= limit) break;
    const keyword = String(raw || '').replace(/\s+/g, ' ').trim();
    const key = compactKey(keyword);
    if (!key || key.length < 2 || key === issueKey || seen.has(key)) continue;
    if (ISSUE_COMMERCE_NOISE_RE.test(keyword)) continue;
    if (tokenCount(keyword) > ISSUE_MEASURABLE_MAX_TOKENS) continue;
    seen.add(key);
    out.push(keyword);
  }
  return out;
}

/**
 * 검색광고 힌트 — 15자를 넘기면 앞 어절부터 15자 안에 드는 만큼만 쓴다.
 * 잘린 힌트는 다른 키워드의 연관어라 쿼터만 태운다(getNaverSearchAdKeywordSuggestions 가 거부).
 */
export function searchAdHintFor(issue: string): string | null {
  const tokens = String(issue || '').trim().split(/\s+/).filter(Boolean);
  const taken: string[] = [];
  for (const token of tokens) {
    const next = [...taken, token].join(' ');
    if (next.replace(/\s+/g, '').length > SEARCHAD_HINT_MAX_CHARS) break;
    taken.push(token);
  }
  return taken.length > 0 ? taken.join(' ') : null;
}

/** 연관어에서 재료를 고른다 — 검색량 내림차순, 미측정은 뒤로. */
export function topRelatedKeywords(
  suggestions: readonly KeywordSuggestion[],
  issue: string,
  limit: number,
): IssueRelatedKeyword[] {
  const allowed = new Set(filterIssueKeywords(suggestions.map((s) => s.keyword), issue).map(compactKey));
  const picked = new Map<string, IssueRelatedKeyword>();
  for (const s of suggestions) {
    const key = compactKey(s.keyword);
    if (!allowed.has(key) || picked.has(key)) continue;
    const volume = typeof s.totalSearchVolume === 'number' && Number.isFinite(s.totalSearchVolume) ? s.totalSearchVolume : null;
    picked.set(key, { keyword: String(s.keyword).replace(/\s+/g, ' ').trim(), monthlyVolume: volume });
  }
  return [...picked.values()]
    .sort((a, b) => (b.monthlyVolume ?? -1) - (a.monthlyVolume ?? -1))
    .slice(0, limit);
}

/** 검색광고 자격 — 앱 설정(EnvironmentManager) 또는 CI 환경변수. 없으면 null. */
export function resolveSearchAdConfigFromEnv(): NaverSearchAdConfig | null {
  try {
    const { EnvironmentManager } = require('./environment-manager');
    const env = EnvironmentManager.getInstance().getConfig();
    const accessLicense = env.naverSearchAdAccessLicense || process.env['NAVER_SEARCH_AD_ACCESS_LICENSE'] || process.env['NAVER_SEARCHAD_ACCESS_LICENSE'] || '';
    const secretKey = env.naverSearchAdSecretKey || process.env['NAVER_SEARCH_AD_SECRET_KEY'] || process.env['NAVER_SEARCHAD_SECRET_KEY'] || '';
    const customerId = env.naverSearchAdCustomerId || process.env['NAVER_SEARCH_AD_CUSTOMER_ID'] || process.env['NAVER_SEARCHAD_CUSTOMER_ID'] || '';
    if (!accessLicense || !secretKey) return null;
    return { accessLicense, secretKey, customerId: customerId || undefined };
  } catch {
    return null;
  }
}

function defaultSources(config: NaverDatalabConfig, searchAd: NaverSearchAdConfig | null): IssueContextSources {
  return {
    fetchNews: async (issue, display) => {
      const { naverApiFetch } = require('./naver-api-hub');
      const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(issue)}&display=${display}&sort=sim`;
      const res: Response = await naverApiFetch(url, {
        headers: { 'X-Naver-Client-Id': config.clientId, 'X-Naver-Client-Secret': config.clientSecret },
      });
      if (!res.ok) throw new Error(`뉴스 검색 ${res.status}`);
      return res.json();
    },
    fetchAutocomplete: async (issue) => {
      const { getNaverAutocompleteQuick } = require('./naver-autocomplete');
      return getNaverAutocompleteQuick(issue);
    },
    fetchRelated: async (hint) => {
      if (!searchAd) return [];
      const { getNaverSearchAdKeywordSuggestions } = require('./naver-searchad-api');
      return getNaverSearchAdKeywordSuggestions(searchAd, hint, 60);
    },
  };
}

async function settle<T>(work: () => Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await work();
  } catch (e: any) {
    console.warn(`[ISSUE-CONTEXT] ${label} 실패:`, e?.message || e);
    return fallback;
  }
}

/**
 * 이슈마다 재료를 모은다. 한 소스가 죽어도 나머지는 산다 — 헤드라인이 없으면
 * "왜 뜨나"만 비고, 자동완성·연관어는 그대로 후보 공급원이 된다.
 */
export async function collectIssueContexts(
  issues: readonly string[],
  options: CollectIssueContextsOptions,
): Promise<IssueContext[]> {
  const searchAd = options.searchAd === undefined ? resolveSearchAdConfigFromEnv() : options.searchAd;
  const sources: IssueContextSources = { ...defaultSources(options.config, searchAd), ...(options.sources || {}) };
  const headlineLimit = options.headlineLimit ?? DEFAULT_HEADLINES;
  const autocompleteLimit = options.autocompleteLimit ?? DEFAULT_AUTOCOMPLETE;
  const relatedLimit = options.relatedLimit ?? DEFAULT_RELATED;

  const out: IssueContext[] = [];
  for (const [index, issue] of issues.entries()) {
    if (options.signal?.aborted) break;
    const hint = searchAd ? searchAdHintFor(issue) : null;
    const [news, autocomplete, related] = await Promise.all([
      settle(() => sources.fetchNews(issue, NEWS_DISPLAY), null as unknown, `뉴스 "${issue}"`),
      settle(() => sources.fetchAutocomplete(issue), [] as string[], `자동완성 "${issue}"`),
      hint ? settle(() => sources.fetchRelated(hint), [] as KeywordSuggestion[], `연관어 "${hint}"`) : Promise.resolve([] as KeywordSuggestion[]),
    ]);
    out.push({
      issue,
      headlines: parseNewsHeadlines(news, headlineLimit),
      autocomplete: filterIssueKeywords(autocomplete, issue, autocompleteLimit),
      related: topRelatedKeywords(related, issue, relatedLimit),
    });
    options.onProgress?.(index + 1, issues.length, issue);
  }
  return out;
}
