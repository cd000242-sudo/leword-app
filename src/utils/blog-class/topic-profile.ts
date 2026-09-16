/**
 * 내 블로그가 실제로 무엇을 써 왔나 — 글 전체에서 센 사실 (2026-09-16).
 *
 * 사장님 "내블로그 크기를 재면 내블로그 주제를 파악하고 글들을 전부 분석하고 파악해서
 * 지금 내가쓰면 이기는 키워드를 분석해서 알려줘야되는거아니니?? 지금 보면 전혀아니야".
 *
 * 그동안 내 블로그에서 쓰던 것은 두 가지뿐이었다 — 네이버 설정의 대표 주제 한 줄과,
 * 30위 안에 붙어 본 검색어 12개. 글 452편이 쌓아 온 것은 후보를 만드는 데 한 번도 안 쓰였다.
 * 그래서 오늘 쓸 한 편이 '내가 써 온 이야기'가 아니라 '이미 붙어 본 말 주변'만 맴돌았다.
 *
 * 여기서 만드는 것은 **센 값**뿐이다: 어떤 낱말이 몇 편에 나왔나, 최근에는 무엇이 늘었나.
 * 점수를 만들지 않고, 32주제 중 무엇인지도 추측하지 않는다(그 분류기는 없다 —
 * 없는 분류를 지어내면 "네 주제는 이것"이라는 거짓말이 된다). 주제 라벨은 사장님이 직접 고른
 * 설정값(declaredTopic)을 그대로 옮겨 적고, 그 옆에 글이 실제로 다룬 말을 사실로 더한다.
 *
 * 낱말을 자르는 규칙은 오늘 쓸 한 편의 씨앗과 **같은 것**을 쓴다(coreWords) — 자르는 법이 두 갈래면
 * 여기서 센 말과 거기서 찾는 말이 서로 어긋난다.
 */
import { coreWords } from './my-blog-lane';

/** 분야를 셀 때 보는 글 한 편. 본문은 안 읽는다 — 목록이 주는 제목·날짜까지만. */
export interface TopicPost {
  title: string;
  /** YYYY-MM-DD. 모르면 null — 최근 집계에서만 빠지고 전체 집계에는 든다. */
  publishedOn: string | null;
  /** 검색 허용이 꺼진 글. 분야에는 센다(내가 다룬 이야기다) — 순위 후보에서만 빠진다. */
  searchable?: boolean;
}

/** 낱말 하나와 그 말이 나온 글 수. 빈도가 아니라 **글 수**다(한 편에 열 번 나와도 한 편). */
export interface TopicWord {
  word: string;
  posts: number;
}

export interface TopicProfile {
  /** 분야를 세는 데 쓴 글 수. */
  analyzed: number;
  /** 블로그 전체 글 수. 목록이 안 알려 주면 null — 0 으로 채우지 않는다. */
  totalPosts: number | null;
  /** 전 기간 상위 낱말. */
  words: TopicWord[];
  /** 최근(기본 90일) 글에서만 센 상위 낱말 — 블로그가 옮겨 간 자리를 본다. */
  recentWords: TopicWord[];
  /** 네이버 블로그 설정의 대표 주제. 여기서 만들어 내지 않고 받은 것만 적는다. */
  declaredTopic: string | null;
}

export interface TopicProfileOptions {
  now?: number;
  /** 상위 몇 개까지 돌려줄지. */
  limit?: number;
  /** '최근'의 길이(일). */
  recentDays?: number;
  totalPosts?: number | null;
  declaredTopic?: string | null;
}

const DEFAULT_LIMIT = 20;
const DEFAULT_RECENT_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 분야가 아닌 말 — 제목에 쓰는 문체·군더더기.
 *
 * 실주행(2026-09-16, 452편)에서 상위를 통째로 차지했다:
 * 만에(32) · 마세요(20) · 하나로(18) · 없이(16) · 대신(15) · 말고(14).
 * 이런 말이 어휘에 들어가면 관문(sharesVocabulary)이 '만에'만 겹쳐도 아무 후보나 통과시킨다 —
 * 분야를 넓히려다 오히려 더 엉뚱해진다.
 */
const STYLE_WORDS: ReadonlySet<string> = new Set([
  '만에', '하나로', '없이', '대신', '말고', '마세요', '이제', '바로', '그냥', '진짜', '완전',
  '요즘', '오늘', '매일', '드디어', '역시', '정말', '이것', '저것', '그것', '여기', '거기',
  '전에', '후에', '까지', '부터', '보다', '처럼', '정도', '동안', '때문', '통해',
]);

/**
 * 분야 낱말인가.
 * 숫자가 섞인 말(10분 · 100% · 3가지만 · 2L)은 분야가 아니라 제목의 수치 표현이고,
 * '줄어드는'·'잡는' 같은 풀이말도 분야가 아니다 — 분야는 이름씨로 남는다.
 */
function isFieldWord(word: string): boolean {
  if (word.length < 2) return false;
  if (/\d/.test(word)) return false;
  if (STYLE_WORDS.has(word)) return false;
  if (/(?:는|요|면서|해서|지만|니다)$/.test(word)) return false;
  /*
   * 조사가 붙은 형태('순서와' · '남은')는 버린다. 잘라서 원형을 만들지는 않는다 —
   * 끝 글자만으로는 조사와 이름씨의 끝을 구별할 수 없어서, 자르면 '곰팡이'가 '곰팡'이 되고
   * '습도'가 '습'이 된다. 원형은 다른 글에서 조사 없이 나오면 그때 잡힌다.
   * 끝 글자가 이름씨 끝으로 거의 안 쓰이는 조사만 본다('과'·'도'·'가'·'이'는 뺐다 — 사과 · 습도 · 물가 · 곰팡이).
   */
  if (/[와의은를을랑]$/.test(word)) return false;
  return true;
}

/** 글 목록에서 낱말별 글 수를 센다. 한 편 안에서 같은 낱말이 여러 번 나와도 한 편이다. */
function countByPost(posts: readonly TopicPost[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const word of new Set(coreWords(post.title))) {
      if (!isFieldWord(word)) continue;
      counts.set(word, (counts.get(word) || 0) + 1);
    }
  }
  return counts;
}

/** 많이 쓴 말 먼저, 같으면 가나다 순. 같은 수일 때 순서가 흔들리면 화면이 회차마다 달라 보인다. */
function ranked(counts: Map<string, number>, limit: number): TopicWord[] {
  return [...counts.entries()]
    .map(([word, posts]) => ({ word, posts }))
    .sort((a, b) => (b.posts - a.posts) || a.word.localeCompare(b.word, 'ko'))
    .slice(0, Math.max(0, limit));
}

/**
 * 분야 프로필을 만든다. 글이 하나도 없으면 null — 빈 프로필을 지어내지 않는다.
 * (목록을 못 읽은 것과 '글이 없는 블로그'는 다른 사실이고, 그 구분은 부르는 쪽이 한다.)
 */
export function buildTopicProfile(
  posts: readonly TopicPost[],
  options: TopicProfileOptions = {},
): TopicProfile | null {
  if (!Array.isArray(posts) || posts.length === 0) return null;
  const now = typeof options.now === 'number' ? options.now : Date.now();
  const limit = typeof options.limit === 'number' ? options.limit : DEFAULT_LIMIT;
  const recentDays = typeof options.recentDays === 'number' ? options.recentDays : DEFAULT_RECENT_DAYS;
  const since = now - recentDays * DAY_MS;

  const recent = posts.filter((post) => {
    if (!post.publishedOn) return false;
    const at = Date.parse(`${post.publishedOn}T00:00:00Z`);
    return Number.isFinite(at) && at >= since && at <= now + DAY_MS;
  });

  return {
    analyzed: posts.length,
    totalPosts: typeof options.totalPosts === 'number' ? options.totalPosts : null,
    words: ranked(countByPost(posts), limit),
    recentWords: ranked(countByPost(recent), limit),
    declaredTopic: options.declaredTopic ? String(options.declaredTopic) : null,
  };
}

/**
 * 오늘 쓸 한 편이 쓸 '내 이야기 낱말' — 최근 것을 앞에 두고 전 기간을 뒤에 붙인다.
 * 최근에 쓰는 말이 지금 내가 붙을 수 있는 자리에 더 가깝고, 전 기간은 그 블로그의 뿌리다.
 */
export function profileVocabulary(profile: TopicProfile | null, limit = DEFAULT_LIMIT): string[] {
  if (!profile) return [];
  const out: string[] = [];
  for (const word of [...profile.recentWords, ...profile.words]) {
    if (out.length >= limit) break;
    if (!out.includes(word.word)) out.push(word.word);
  }
  return out;
}
