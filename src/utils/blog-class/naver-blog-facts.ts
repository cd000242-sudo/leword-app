/**
 * 내 블로그 사실 읽기 — 로그인 없이, 돈 없이, 네이버가 이미 화면에 싣고 있는 것만 받아 온다.
 *
 * 왜 이 파일이 있나(사장님 2026-09-10 "내 블로그 체급분석을 먼저 할 수 있다면 좋겠네"):
 * 앱에 남아 있던 블로그 지수는 "총글수×10 + 연차×5000" 처럼 **지어낸 점수**였다. 그 점수로는
 * "내가 어느 크기의 자리를 이길 수 있는가"에 답할 수 없다. 그래서 점수를 버리고 사실만 모은다.
 * 여기서 모은 사실 위에 envelope.ts 가 "내가 이겨본 크기"를 얹는다.
 *
 * 창구는 2026-09-10 에 직접 호출해 살아 있는 것만 실었다:
 *   1) m.blog.naver.com/{id}          — 화면 HTML 안에 오늘 방문자·누적 방문자·이웃·글 수·대표 주제가 JSON 으로 박혀 있다.
 *   2) blog.naver.com/PostTitleListAsync.naver — 글 목록. RSS 의 50개 상한을 넘어 **전부** 준다.
 *                                       글마다 검색 허용 여부(searchYn)·차단 여부까지 붙어 온다.
 *   3) in.naver.com/{id}              — 200 이면 인플루언서. 실측 확인: bakas·chicagoman9·hewtbylvv 200,
 *                                       blogpeople·naver_search 404.
 * 죽은 창구(쓰지 않는다): NVisitorgp4Ajax(204 빈 응답) · m.blog.naver.com/api/blogs/*(302·에러).
 *
 * 규칙: 못 읽은 값은 null 이다. 0 으로 때우지 않는다 — 방문자 0 과 "방문자를 못 읽었다"는 다른 말이다.
 */

/** 블로그 한 채의 지금 상태. 못 읽은 칸은 null. */
export interface BlogSnapshot {
  blogId: string;
  blogName: string | null;
  nickName: string | null;
  /** 블로그 설정에서 고른 대표 주제(예: 'IT·컴퓨터'). 네이버 32주제 이름 그대로다. */
  declaredTopic: string | null;
  /** 오늘 방문자. 네이버가 화면에 띄우는 그 숫자다. */
  todayVisitors: number | null;
  totalVisitors: number | null;
  /** 이웃(구독자) 수. */
  subscribers: number | null;
  postCount: number | null;
  officialBlog: boolean | null;
  powerBlog: boolean | null;
}

/** 글 한 편. 본문은 안 읽는다 — 목록이 주는 것까지만. */
export interface BlogPostRow {
  logNo: string;
  title: string;
  /** YYYY-MM-DD. 목록이 날짜 대신 시각만 주면(오늘 글) 오늘 날짜로 읽는다. */
  publishedOn: string | null;
  categoryNo: string | null;
  commentCount: number | null;
  /** 글 설정의 '검색 허용'. false 면 애초에 검색에 안 나온다 — 순위를 재봐야 소용없다. */
  searchable: boolean;
  /** 네이버가 막은 글. */
  blocked: boolean;
}

export interface PostListPage {
  posts: BlogPostRow[];
  totalCount: number | null;
  countPerPage: number | null;
  blogNo: string | null;
  /**
   * 목록을 정말로 읽었나. false 면 '글이 없다'가 아니라 '못 읽었다'다.
   * 실측(2026-09-10 bakas): 네이버가 {"resultCode":"E","resultMessage":"일시적으로 목록보기 기능에 장애가…"}
   * 를 돌려주는 때가 있다. 이걸 빈 목록으로 삼키면 화면이 "글 0개를 썼어요"라고 거짓말한다.
   */
  ok: boolean;
  /** 네이버가 준 실패 사유 그대로. 없으면 null. */
  message: string | null;
}

/** 글 목록에서 바로 나오는 활동 사실. 전부 세거나 뺀 값이다. */
export interface BlogActivity {
  totalPosts: number;
  /** 가장 오래된 글의 날짜 = 사실상 개설 시점. 마지막 페이지까지 받아야 채워진다. */
  oldestPostOn: string | null;
  newestPostOn: string | null;
  /** 가장 오래된 글부터 오늘까지 몇 달. 못 세면 null. */
  monthsRunning: number | null;
  recent30: number;
  recent90: number;
  /** 최근 글들의 발행 간격 중앙값(일). 글이 2개 미만이면 null. */
  medianGapDays: number | null;
  /** 검색 허용 글 수 / 센 글 수. */
  searchableCount: number;
  blockedCount: number;
}

const SNAPSHOT_NUMBER_KEYS = ['dayVisitorCount', 'totalVisitorCount', 'subscriberCount', 'postCount'] as const;

function readJsonNumber(html: string, key: string): number | null {
  const match = html.match(new RegExp(`"${key}"\\s*:\\s*(-?\\d{1,15})`));
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function readJsonBoolean(html: string, key: string): boolean | null {
  const match = html.match(new RegExp(`"${key}"\\s*:\\s*(true|false)`));
  return match ? match[1] === 'true' : null;
}

function readJsonString(html: string, key: string): string | null {
  const match = html.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
  if (!match) return null;
  const raw = match[1].replace(/\\u002F/gi, '/').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  return raw.trim() || null;
}

/**
 * m.blog 화면 HTML → 블로그 사실.
 *
 * 페이지 안에 직렬화된 상태가 통째로 박혀 있어서 키만 집어 읽는다. 전체를 JSON.parse 하지 않는 이유는
 * 그 상태가 온전한 JSON 문서가 아니라 스크립트 안 조각이라서다 — 키 단위로 읽는 편이 화면 개편에 덜 깨진다.
 */
export function parseBlogSnapshot(html: string, blogId: string): BlogSnapshot {
  const numbers = SNAPSHOT_NUMBER_KEYS.reduce<Record<string, number | null>>(
    (acc, key) => ({ ...acc, [key]: readJsonNumber(html, key) }),
    {},
  );
  return {
    blogId,
    blogName: readJsonString(html, 'blogName'),
    nickName: readJsonString(html, 'nickName'),
    declaredTopic: readJsonString(html, 'blogDirectoryName'),
    todayVisitors: numbers.dayVisitorCount,
    totalVisitors: numbers.totalVisitorCount,
    subscribers: numbers.subscriberCount,
    postCount: numbers.postCount,
    officialBlog: readJsonBoolean(html, 'officialBlog'),
    powerBlog: readJsonBoolean(html, 'powerBlog'),
  };
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ',
};

/** 목록이 주는 제목은 URL 인코딩 + HTML 엔티티가 겹쳐 있다(예: %26lt%3B → &lt; → <). 두 겹을 다 벗긴다. */
export function decodePostTitle(raw: string): string {
  let text = raw;
  try {
    text = decodeURIComponent(raw.replace(/\+/g, ' '));
  } catch {
    text = raw.replace(/\+/g, ' ');
  }
  // 숫자 엔티티(&#39;)를 먼저, 이름 엔티티를 그다음. &amp; 를 마지막에 풀어야 &amp;lt; 가 <  로 뭉개지지 않는다.
  const named = text.replace(/&#(\d{1,5});/g, (_m, code) => String.fromCharCode(Number(code)));
  return Object.entries(ENTITIES)
    .filter(([entity]) => entity !== '&amp;')
    .reduce((acc, [entity, char]) => acc.split(entity).join(char), named)
    .split('&amp;').join('&')
    .trim();
}

/** "2026. 9. 7." → "2026-09-07". 시각만 준 글(오늘 발행)은 오늘 날짜로 읽는다. */
export function parsePostDate(addDate: string, nowMs: number = Date.now()): string | null {
  const ymd = addDate.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (ymd) {
    const [, y, m, d] = ymd;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  if (/^\d{1,2}:\d{2}$/.test(addDate.trim())) return isoDay(nowMs);
  return null;
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * 글 목록 응답 → 글 배열.
 *
 * ⚠️ 함정(2026-09-10 실측): 응답의 pagingHtml 필드가 `class=\'…\'` 처럼 **작은따옴표를 역슬래시로 감싼다**.
 * 이건 JSON 문법이 아니라서 JSON.parse 가 "Bad escaped character" 로 통째로 실패한다. 실제로 글 30개가
 * 멀쩡히 들어 있는데도 한 글자 때문에 전부 못 읽는다. 그래서 파싱 전에 그 필드를 들어낸다.
 */
export function parsePostListPage(body: string, nowMs: number = Date.now()): PostListPage {
  const cleaned = body.replace(/,"pagingHtml":".*?","parameters"/s, ',"parameters"');
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { posts: [], totalCount: null, countPerPage: null, blogNo: null, ok: false, message: null };
  }
  // resultCode 'S' 가 아니면 장애·거절이다. postList 가 없다고 '글 0개'로 읽지 않는다.
  if (parsed?.resultCode != null && String(parsed.resultCode) !== 'S') {
    return {
      posts: [], totalCount: null, countPerPage: null, blogNo: null, ok: false,
      message: parsed?.resultMessage ? String(parsed.resultMessage) : null,
    };
  }
  if (!Array.isArray(parsed?.postList)) {
    return { posts: [], totalCount: null, countPerPage: null, blogNo: null, ok: false, message: null };
  }
  const list: any[] = parsed.postList;
  const posts: BlogPostRow[] = list.map((item) => ({
    logNo: String(item?.logNo ?? ''),
    title: decodePostTitle(String(item?.title ?? '')),
    publishedOn: parsePostDate(String(item?.addDate ?? ''), nowMs),
    categoryNo: item?.categoryNo != null ? String(item.categoryNo) : null,
    commentCount: toCount(item?.commentCount),
    // searchYn 은 문자열 "true"/"false" 로 온다. 값이 아예 없으면 '검색 허용'으로 본다(네이버 기본값).
    searchable: String(item?.searchYn ?? 'true') !== 'false',
    blocked: Number(item?.isPostBlocked ?? 0) === 1 || Number(item?.isBlockTmpForced ?? 0) === 1,
  })).filter((post) => post.logNo !== '');
  return {
    posts,
    totalCount: toCount(parsed?.totalCount),
    countPerPage: toCount(parsed?.countPerPage),
    blogNo: parsed?.blog?.blogNo != null ? String(parsed.blog.blogNo) : null,
    ok: true,
    message: null,
  };
}

/** "1,613" 같은 쉼표 숫자와 빈 문자열을 함께 받는다. 빈 값은 null(0 아님). */
function toCount(raw: unknown): number | null {
  if (raw == null) return null;
  const text = String(raw).replace(/,/g, '').trim();
  if (text === '') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** 글 배열 → 활동 사실. 세기와 빼기뿐이다. */
export function summarizeActivity(posts: readonly BlogPostRow[], nowMs: number = Date.now()): BlogActivity {
  const dated = posts
    .map((post) => ({ post, ms: post.publishedOn ? Date.parse(`${post.publishedOn}T00:00:00Z`) : NaN }))
    .filter((entry) => Number.isFinite(entry.ms))
    .sort((a, b) => b.ms - a.ms);
  const gaps = dated.slice(1).map((entry, index) => Math.round((dated[index].ms - entry.ms) / DAY_MS));
  const oldest = dated.length > 0 ? dated[dated.length - 1] : null;
  return {
    totalPosts: posts.length,
    oldestPostOn: oldest ? oldest.post.publishedOn : null,
    newestPostOn: dated.length > 0 ? dated[0].post.publishedOn : null,
    monthsRunning: oldest ? Math.max(0, Math.round((nowMs - oldest.ms) / DAY_MS / 30.44)) : null,
    recent30: dated.filter((entry) => nowMs - entry.ms <= 30 * DAY_MS).length,
    recent90: dated.filter((entry) => nowMs - entry.ms <= 90 * DAY_MS).length,
    medianGapDays: median(gaps),
    searchableCount: posts.filter((post) => post.searchable).length,
    blockedCount: posts.filter((post) => post.blocked).length,
  };
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// ── 창구 ────────────────────────────────────────────────────────────────────
// fetch 를 주입받는다. 테스트는 가짜 fetch 로 실제 실행을 검증하고, 앱은 진짜 fetch 를 준다.

export type FetchLike = (url: string, init?: any) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** blog.naver.com/{id} · m.blog.naver.com/{id}/{logNo} · PostView 주소에서 아이디만 뽑는다. */
export function extractBlogId(input: string): string | null {
  const text = String(input || '').trim();
  if (!text) return null;
  const postView = text.match(/PostView\.n(?:aver|hn)\?[^#]*blogId=([A-Za-z0-9_-]+)/i);
  if (postView) return postView[1];
  const host = text.match(/(?:^|\/\/)(?:m\.)?blog\.naver\.com\/([A-Za-z0-9_-]+)/i);
  if (host) return host[1];
  return /^[A-Za-z0-9_-]{2,}$/.test(text) ? text : null;
}

export async function fetchBlogSnapshot(blogId: string, fetchImpl: FetchLike): Promise<BlogSnapshot | null> {
  const res = await fetchImpl(`https://m.blog.naver.com/${encodeURIComponent(blogId)}`, {
    headers: { 'User-Agent': MOBILE_UA },
  });
  if (!res.ok) return null;
  return parseBlogSnapshot(await res.text(), blogId);
}

export async function fetchPostListPage(
  blogId: string,
  page: number,
  fetchImpl: FetchLike,
  nowMs: number = Date.now(),
): Promise<PostListPage> {
  const url = `https://blog.naver.com/PostTitleListAsync.naver?blogId=${encodeURIComponent(blogId)}`
    + `&currentPage=${page}&countPerPage=30&categoryNo=0&parentCategoryNo=0&viewdate=&listType=top`;
  const res = await fetchImpl(url, { headers: { 'User-Agent': DESKTOP_UA, Referer: `https://blog.naver.com/${blogId}` } });
  if (!res.ok) return { posts: [], totalCount: null, countPerPage: null, blogNo: null, ok: false, message: null };
  return parsePostListPage(await res.text(), nowMs);
}

export interface PostSweepOptions {
  /** 최근 몇 개까지 받을지. 0 이나 미지정이면 전부. */
  limit?: number;
  /** 개설일을 알려고 마지막 페이지도 한 장 더 받는다. 기본 true. */
  includeOldest?: boolean;
  onProgress?: (received: number, total: number | null) => void;
  /** 페이지 사이 쉼(ms). 기본 400 — 네이버 목록은 검색 화면보다 관대하지만 몰아치지 않는다. */
  pauseMs?: number;
  sleepImpl?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

/**
 * 최근 글부터 순서대로 받는다. limit 이 있으면 거기서 멈추고, includeOldest 면 마지막 페이지를 한 장 더 받아
 * 개설 시점을 채운다(전부 받지 않고 개설일만 아는 값싼 길이다 — 1,336개 블로그도 요청 3장이면 끝난다).
 */
export async function sweepPosts(
  blogId: string,
  fetchImpl: FetchLike,
  options: PostSweepOptions = {},
  nowMs: number = Date.now(),
): Promise<{ posts: BlogPostRow[]; totalCount: number | null; oldest: BlogPostRow | null; ok: boolean; message: string | null }> {
  const limit = options.limit && options.limit > 0 ? options.limit : Infinity;
  const sleep = options.sleepImpl ?? defaultSleep;
  const pauseMs = options.pauseMs ?? 400;

  const first = await fetchPostListPage(blogId, 1, fetchImpl, nowMs);
  // 첫 장을 못 읽었으면 여기서 끝낸다. 빈 목록을 '글이 없는 블로그'로 넘기면 화면이 거짓말을 한다.
  if (!first.ok) return { posts: [], totalCount: null, oldest: null, ok: false, message: first.message };
  const total = first.totalCount;
  const perPage = first.countPerPage && first.countPerPage > 0 ? first.countPerPage : 30;
  let posts: BlogPostRow[] = [...first.posts];
  options.onProgress?.(posts.length, total);

  const wantPages = Math.ceil(Math.min(limit, total ?? limit) / perPage);
  const lastPage = total != null ? Math.max(1, Math.ceil(total / perPage)) : 1;
  for (let page = 2; page <= wantPages && page <= lastPage && posts.length < limit && first.posts.length > 0; page += 1) {
    await sleep(pauseMs);
    const next = await fetchPostListPage(blogId, page, fetchImpl, nowMs);
    if (next.posts.length === 0) break;
    posts = [...posts, ...next.posts];
    options.onProgress?.(posts.length, total);
  }
  posts = posts.slice(0, Number.isFinite(limit) ? limit : posts.length);

  let oldest: BlogPostRow | null = null;
  if (options.includeOldest !== false && lastPage > 1) {
    if (lastPage <= wantPages) {
      oldest = oldestOf(posts);
    } else {
      await sleep(pauseMs);
      const tail = await fetchPostListPage(blogId, lastPage, fetchImpl, nowMs);
      oldest = oldestOf(tail.posts);
    }
  } else {
    oldest = oldestOf(posts);
  }
  return { posts, totalCount: total, oldest, ok: true, message: null };
}

function oldestOf(posts: readonly BlogPostRow[]): BlogPostRow | null {
  const dated = posts.filter((post) => post.publishedOn);
  if (dated.length === 0) return null;
  return dated.reduce((acc, post) => (post.publishedOn! < acc.publishedOn! ? post : acc));
}

/**
 * 인플루언서인가. in.naver.com/{id} 가 200 이면 그렇다.
 * 실측(2026-09-10): bakas·chicagoman9·hewtbylvv 200 / blogpeople·naver_search 404.
 * 네트워크가 막히면 false 가 아니라 null 이다 — "아니다"와 "못 봤다"는 다르다.
 */
export async function probeInfluencer(blogId: string, fetchImpl: FetchLike): Promise<boolean | null> {
  try {
    const res = await fetchImpl(`https://in.naver.com/${encodeURIComponent(blogId)}`, {
      headers: { 'User-Agent': DESKTOP_UA },
    });
    if (res.status === 200) return true;
    if (res.status === 404) return false;
    return null;
  } catch {
    return null;
  }
}
