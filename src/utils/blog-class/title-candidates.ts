/**
 * 내 글 제목 → 사람들이 실제로 칠 만한 검색어 후보.
 *
 * 사장님 2026-09-10 "초보자들에게 엄청난 도움을 주는 게 목적이야".
 * 봉투(envelope)를 만들려면 "내가 어느 검색어에서 이겼나"를 알아야 하는데, 그걸 알려면
 * 먼저 내 글 제목에서 검색어를 뽑아야 한다. 여기가 그 자리다.
 *
 * 형태소 분석기를 들이지 않는다. 어절을 이어 붙인 후보를 만들고, **검색광고가 검색량을 아는 것만**
 * 살린다 — 검색량이 잡히면 사람들이 실제로 치는 말이고, 안 잡히면 아니다. 그 판단을 우리가 하지 않는다.
 * (실측 2026-09-10: 3어절까지는 검색광고가 거의 다 알고, 4어절부터 절반으로 떨어진다.)
 */

/** 제목에서 걷어 낼 것 — 대괄호·괄호·따옴표 안, 특수문자. */
const BRACKETS = /\[[^\]]*\]|\([^)]*\)|\{[^}]*\}|【[^】]*】/g;
const QUOTES = /["“”'’『』「」<>《》]/g;
const NON_WORD = /[^ 가-힣a-zA-Z0-9%]/g;

/**
 * 검색어가 될 수 없는 낱말. 이게 앞이나 뒤에 붙으면 그 후보는 버린다.
 * 블로그 제목에 흔한 감탄·군더더기라, 남겨 두면 '후기 추천' 같은 헛 후보가 잔뜩 생긴다.
 */
const EDGE_STOPS = new Set([
  '그리고', '그래서', '하지만', '그런데', '정말', '진짜', '너무', '완전', '이제', '오늘', '어제', '내일',
  '드디어', '역시', '약간', '조금', '매우', '아주', '다시', '함께', '바로', '먼저', '결국', '한번',
  '것', '수', '때', '중', '등', '및', '더', '못', '안', '좀', '그', '이', '저',
  '입니다', '합니다', '했어요', '하는', '하기', '했다', '한다', '되는', '되기', '있는', '있다', '없는',
]);

const clean = (title: string): string[] => String(title || '')
  .replace(BRACKETS, ' ')
  .replace(QUOTES, ' ')
  .replace(NON_WORD, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .split(' ')
  .filter(Boolean);

/** 한 크기(2어절 또는 3어절)의 후보를 앞에서부터. 걸러 내는 규칙은 두 크기가 같다. */
function gramsOfSize(words: readonly string[], size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i + size <= words.length; i += 1) {
    const parts = words.slice(i, i + size);
    if (EDGE_STOPS.has(parts[0]) || EDGE_STOPS.has(parts[parts.length - 1])) continue;
    const phrase = parts.join(' ');
    // 너무 짧으면(조사 덩어리) 검색어로 안 친다.
    if (phrase.replace(/\s/g, '').length < 4) continue;
    out.push(phrase);
  }
  return out;
}

/**
 * 제목 하나에서 후보를 만든다 — 이어진 어절 2~3개씩, **두 크기를 번갈아** 앞에서부터.
 * 한 어절짜리는 안 만든다: 단어 하나는 대개 너무 넓어서 그 글이 이겼는지를 말해 주지 못한다.
 *
 * 왜 번갈아 뽑나(실측 2026-09-11, leadernam- 최근 글 30개):
 * 전에는 `for (const size of [3, 2])` 라 3어절을 앞에서부터 채우다 limit 에 걸려 끝났다.
 * 어절이 다섯만 넘어도 3어절 후보가 셋 이상 나오니 **2어절 차례가 영영 안 왔다** — 후보 88개가 전부 3어절이었다.
 * 그래서 검색광고에 "한 번 입은"·"번 입은 옷"·"비염 예방 습도"를 물어보고,
 * 정작 "옷 보관법"·"비염 예방"·"공기압 마사지기"는 안 물어봤다. 만들 수 있는 2어절 188개를 통째로 버린 셈이다.
 * 검색량이 잡힌 것이 88개 중 8개(9%)뿐이던 이유가 이것이다.
 *
 * 어느 말이 좋은지는 여전히 우리가 안 고른다 — 검색광고가 고른다.
 * 여기서 고치는 것은 **물어보는 목록이 한쪽으로 쏠리지 않게** 하는 것뿐이다.
 * 한쪽이 바닥나면 남은 쪽이 그 자리를 이어받는다.
 */
export function candidatesFromTitle(title: string, limit = 4): string[] {
  const words = clean(title).filter((w) => w.length >= 1);
  if (words.length < 2) return [];
  const queues = [gramsOfSize(words, 3), gramsOfSize(words, 2)];
  const out: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < limit; i += 1) {
    let moved = false;
    for (const queue of queues) {
      if (i >= queue.length) continue;
      moved = true;
      const phrase = queue[i];
      const key = phrase.replace(/\s/g, '');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(phrase);
      if (out.length >= limit) return out;
    }
    if (!moved) break;
  }
  return out;
}

export interface TitleCandidate {
  keyword: string;
  postUrl: string;
  postTitle: string;
  publishedOn: string | null;
}

/**
 * 글 목록 전체에서 후보를 모은다. 같은 검색어가 여러 글에서 나오면 **한 번만** 남긴다 —
 * 같은 검색어를 두 번 재면 요청만 두 배가 되고 봉투는 안 좋아진다.
 * 먼저 나온 글(= 더 최근 글)이 그 검색어의 임자가 된다.
 */
export function collectCandidates(
  posts: ReadonlyArray<{ title: string; url: string; publishedOn: string | null; searchable?: boolean }>,
  perTitle = 3,
): TitleCandidate[] {
  const seen = new Set<string>();
  const out: TitleCandidate[] = [];
  for (const post of posts) {
    // 검색 허용이 꺼진 글은 애초에 검색에 안 나온다 — 순위를 재봐야 소용없다.
    if (post.searchable === false) continue;
    for (const keyword of candidatesFromTitle(post.title, perTitle)) {
      const key = keyword.replace(/\s/g, '');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ keyword, postUrl: post.url, postTitle: post.title, publishedOn: post.publishedOn });
    }
  }
  return out;
}
