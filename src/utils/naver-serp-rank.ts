/**
 * 네이버 검색 결과에서의 **실제 노출 자리**를 잰다.
 *
 * 왜 따로 있나: 네이버 오픈 API(blog.json)는 **검색 결과를 주지만 노출 순서를
 * 주지 않는다**. 그런데 앱 두 곳이 그 API 순서를 그대로 "순위"라고 화면에
 * 띄우고 있었다. 사장님이 사이트에서 직접 잡으셨다 —
 * "2위라면서 2위가 아니네요??" (2026-08-22).
 *
 * 두 번째 함정: 검색 화면을 긁을 때 blog.naver.com 주소만 세면 티스토리 같은
 * 외부 블로그가 빠져 **순위가 실제보다 앞당겨진다**. 사장님 실측 — 화면 9위인데
 * 8위로 나왔고, 4위가 kim4047.tistory.com 이었다. 결과 항목은 data-url 로
 * 순서대로 실리므로 그걸 센다. 그렇게 세니 사장님이 눈으로 센 값과 같아졌다.
 *
 * 이 구현은 사이트(cf-worker)에서 실측 검증을 마친 것을 옮긴 것이다. 두 벌이
 * 갈라지면 또 어긋나므로 앱 쪽은 여기 하나만 쓴다.
 *
 * 못 읽으면 null 이다 — 0위나 '없음'으로 단정하지 않는다.
 */

export interface NaverTab {
  id: 'all' | 'blog' | 'web';
  label: string;
  url: (encodedQuery: string) => string;
}

export const NAVER_TABS: readonly NaverTab[] = Object.freeze([
  { id: 'all', label: '통합검색', url: (q) => `https://search.naver.com/search.naver?query=${q}` },
  { id: 'blog', label: '블로그', url: (q) => `https://search.naver.com/search.naver?ssc=tab.blog.all&query=${q}` },
  { id: 'web', label: '웹사이트', url: (q) => `https://search.naver.com/search.naver?ssc=tab.web.all&query=${q}` },
]);

export interface SerpRankResult {
  /** 몇 번째 자리인가. 결과에 없으면 null. */
  rank: number | null;
  /** 이번에 실제로 센 결과 수. 0 이면 화면을 못 읽은 것이다. */
  sampled: number;
  /** data-url 로 셌는가(정확). false 면 네이버 블로그만 센 폴백이라 앞당겨질 수 있다. */
  exact: boolean;
}

/** 주소를 비교 가능한 모양으로 — 스킴·m.·끝 슬래시·질의문자열을 턴다. */
export function normalizeLink(link: unknown): string {
  return String(link ?? '')
    .replace(/^https?:\/\//, '')
    .replace(/^m\./, '')
    .replace(/\/$/, '')
    .split('?')[0]
    .toLowerCase();
}

/** 네이버 블로그 글 열쇠(아이디_번호). 주소 모양이 여러 가지라 이걸로도 맞춘다. */
export function naverPostKey(link: unknown): string | null {
  const m = String(link ?? '').match(
    /blog\.naver\.com\/([A-Za-z0-9_-]+)[/?].*?(\d{9,})|blog\.naver\.com\/([A-Za-z0-9_-]+)\/(\d+)/,
  );
  if (!m) return null;
  return m[3] ? `${m[3]}_${m[4]}` : `${m[1]}_${m[2]}`;
}

/**
 * 검색 결과 HTML 에서 항목 순서를 뽑는다.
 * data-url 이 있으면 그것으로(정확), 없는 화면이면 네이버 블로그 주소로 내려간다.
 */
export function extractResultOrder(html: string): { order: string[]; exact: boolean } {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const match of html.matchAll(/data-url="([^"]+)"/g)) {
    const norm = normalizeLink(match[1].replace(/&amp;/g, '&'));
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    order.push(norm);
  }
  if (order.length > 0) return { order, exact: true };

  for (const match of html.matchAll(/blog\.naver\.com\/([A-Za-z0-9_-]+)\/(\d+)/g)) {
    const norm = normalizeLink(`https://blog.naver.com/${match[1]}/${match[2]}`);
    if (seen.has(norm)) continue;
    seen.add(norm);
    order.push(norm);
  }
  return { order, exact: false };
}

/** 뽑아 둔 순서 안에서 내 글의 자리를 찾는다. */
export function findRankInOrder(order: string[], link: string): number | null {
  const targetNorm = normalizeLink(link);
  const targetKey = naverPostKey(link);
  const host = String(link ?? '').replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
  const at = order.findIndex((item) => {
    if (item === targetNorm) return true;
    if (targetKey && naverPostKey(item) === targetKey) return true;
    return Boolean(host) && item.startsWith(targetNorm);
  });
  return at < 0 ? null : at + 1;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

/** 한 탭에서 그 글의 자리. 화면을 못 읽으면 null 을 돌려준다(0위로 단정하지 않는다). */
export async function measureNaverTabRank(
  tab: NaverTab,
  query: string,
  link: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SerpRankResult | null> {
  try {
    const response = await fetchImpl(tab.url(encodeURIComponent(String(query).slice(0, 80))), {
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'ko-KR,ko;q=0.9',
        Referer: 'https://www.naver.com/',
      },
    });
    if (!response.ok) return null;
    const html = await response.text();
    const { order, exact } = extractResultOrder(html);
    if (order.length === 0) return { rank: null, sampled: 0, exact };
    return { rank: findRankInOrder(order, link), sampled: order.length, exact };
  } catch {
    return null;
  }
}

/** 세 탭을 한 번에 — 탭마다 순위가 다르므로 "어느 탭에서 몇 위"를 그대로 말할 수 있어야 한다. */
export async function measureNaverTabRanks(
  query: string,
  link: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, SerpRankResult | null>> {
  const out: Record<string, SerpRankResult | null> = {};
  for (const tab of NAVER_TABS) {
    out[tab.id] = await measureNaverTabRank(tab, query, link, fetchImpl);
  }
  return out;
}
