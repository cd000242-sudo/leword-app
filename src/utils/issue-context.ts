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
  /**
   * 이슈명에서 추린 개체(사람·기관·제품). 이슈명이 기사 제목 조각일 때만 값이 있다.
   * 실측 진단(2026-09-04): 이슈 18개 중 12개가 "출근하는 용혜인 후보자" 같은 조각이라
   * 자동완성·키워드도구가 전부 0을 뱉었다 — 개체로 한 번 더 물어 공급을 연다.
   */
  entity?: string | null;
  headlines: IssueHeadline[];
  autocomplete: string[];
  related: IssueRelatedKeyword[];
}

export interface IssueContextSources {
  /** 오픈API 뉴스 검색 원본(JSON). */
  fetchNews: (issue: string, display: number) => Promise<unknown>;
  fetchAutocomplete: (issue: string) => Promise<string[]>;
  /**
   * 심층 자동완성 — PC·모바일·쇼핑에 자모(ㄱ~ㅎ)·접미사 확장까지 한 씨앗을 깊게 판다.
   * 가벼운 쪽(fetchAutocomplete)이 이슈당 10개 남짓이라 후보가 금세 마르는 걸 메운다.
   */
  fetchAutocompleteDeep: (seed: string) => Promise<string[]>;
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
  /** 심층 자동완성(자모·접미사 확장)을 쓸까. 기본 true — 끄면 가벼운 자동완성만. */
  deepAutocomplete?: boolean;
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
/**
 * 자동완성 보관 수. 10 → 40 (2026-09-04): 심층 확장이 씨앗 하나에서 수십 개를 캐 온다.
 * 사람이 실제로 치는 말이라 실측 통과율이 에이전트 파생보다 훨씬 높다.
 */
const DEFAULT_AUTOCOMPLETE = 40;
/**
 * 연관어 보관 수. 8 → 20 (2026-09-04 진단): 회차가 이슈당 연관어 수십~수백 개를
 * 받아 놓고 8개만 남기는데, 그 8개마저 조립 순서에 밀려 후보로 한 개도 안 들어갔다.
 * 검색량이 이미 실측된 유일한 공급원이라 넉넉히 들고 간다(같은 1콜, 추가 비용 없음).
 */
const DEFAULT_RELATED = 20;
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
 * 이슈명 앞에 붙는 꾸밈말 — 이것만으로는 아무도 검색하지 않는다.
 * 실검 공급원(signal.bz)이 기사 제목을 그대로 주기 때문에 생긴다.
 */
const ISSUE_LEAD_NOISE = new Set(['실시간', '오늘', '어제', '긴급', '속보', '단독', '현장', '공식', '최신', '전격', '충격']);
/** 이름 뒤에 붙는 직함 — 떼어도 개체는 그대로다("용혜인 후보자" → "용혜인"). */
const ISSUE_ROLE_TAIL = new Set([
  '후보자', '후보', '장관', '차관', '대표', '의원', '위원장', '위원', '사장', '회장', '부회장',
  '감독', '선수', '총장', '청장', '처장', '국장', '시장', '지사', '교수', '기자', '아나운서', '씨',
]);

/**
 * 이슈명에서 검색되는 개체를 추린다 — "출근하는 용혜인 후보자" → "용혜인".
 *
 * 왜 필요한가(2026-09-04 진단 실측): 이슈 18개 중 12개에서 자동완성 0건·키워드도구
 * 0건이었다. 이슈명이 문장 조각이라 아무도 그 말 그대로는 검색하지 않기 때문이다.
 * 개체로 한 번 더 물으면 "용혜인 청문회"·"스카이랩스 공모주" 같은 실측 가능한 말이 나온다.
 *
 * 형태소 분석이 아니라 규칙이다 — 틀려도 이슈명 원본 수집은 그대로 하고 여기서 나온
 * 것은 **더하기만** 한다. 못 줄이면 null 이고, 그러면 아무 일도 일어나지 않는다.
 */
export function issueEntity(issue: string): string | null {
  const tokens = String(issue || '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;
  const kept = tokens.filter((token, index) => {
    if (index === 0 && ISSUE_LEAD_NOISE.has(token)) return false;
    // "출근하는"·"오르는" 같은 관형형 — 마지막 글자가 '는' 인 세 글자 이상 어절.
    if (token.length >= 3 && token.endsWith('는')) return false;
    if (index > 0 && ISSUE_ROLE_TAIL.has(token)) return false;
    return true;
  });
  if (kept.length === 0) return null;
  const head = kept[0] as string;
  const entity = head.length >= 2 ? head : kept.slice(0, 2).join(' ');
  return compactKey(entity) === compactKey(issue) ? null : entity;
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
    fetchAutocompleteDeep: async (seed) => {
      const { getNaverAutocompleteKeywords } = require('./naver-autocomplete');
      // 연관검색어는 여기서 부르지 않는다 — 아래 fetchRelated 가 같은 것을 이미 판다.
      return getNaverAutocompleteKeywords(seed, { ...config, skipSearchAdRelated: true });
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
  const deepAutocomplete = options.deepAutocomplete !== false;

  const out: IssueContext[] = [];
  for (const [index, issue] of issues.entries()) {
    if (options.signal?.aborted) break;
    const hint = searchAd ? searchAdHintFor(issue) : null;
    const [news, autocomplete, related] = await Promise.all([
      settle(() => sources.fetchNews(issue, NEWS_DISPLAY), null as unknown, `뉴스 "${issue}"`),
      settle(() => sources.fetchAutocomplete(issue), [] as string[], `자동완성 "${issue}"`),
      hint ? settle(() => sources.fetchRelated(hint), [] as KeywordSuggestion[], `연관어 "${hint}"`) : Promise.resolve([] as KeywordSuggestion[]),
    ]);

    /*
     * 이슈명이 기사 제목 조각이면 위 두 공급원이 통째로 빈다. 개체로 한 번 더 묻는다.
     * 원본 결과를 앞에 두고 뒤에 붙이기만 한다 — 이슈 자신의 말이 항상 우선이다.
     */
    const entity = issueEntity(issue);
    const entityHint = entity && searchAd ? searchAdHintFor(entity) : null;
    const [entityAuto, entityRelated] = entity
      ? await Promise.all([
        settle(() => sources.fetchAutocomplete(entity), [] as string[], `자동완성(개체) "${entity}"`),
        entityHint ? settle(() => sources.fetchRelated(entityHint), [] as KeywordSuggestion[], `연관어(개체) "${entityHint}"`) : Promise.resolve([] as KeywordSuggestion[]),
      ])
      : [[] as string[], [] as KeywordSuggestion[]];

    /*
     * 심층 자동완성 — 사람이 실제로 치는 말을 씨앗 하나에서 깊게 판다(자모·접미사 확장).
     * 씨앗은 개체가 있으면 개체다: 조각("출근하는 용혜인 후보자")으로는 자동완성이 안 나온다.
     */
    const deepSeed = entity || issue;
    const deep = deepAutocomplete
      ? await settle(() => sources.fetchAutocompleteDeep(deepSeed), [] as string[], `심층 자동완성 "${deepSeed}"`)
      : [];

    out.push({
      issue,
      entity,
      headlines: parseNewsHeadlines(news, headlineLimit),
      autocomplete: filterIssueKeywords([...autocomplete, ...entityAuto, ...deep], issue, autocompleteLimit),
      related: topRelatedKeywords([...related, ...entityRelated], issue, relatedLimit),
    });
    options.onProgress?.(index + 1, issues.length, issue);
  }
  return out;
}
