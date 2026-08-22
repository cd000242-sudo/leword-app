/**
 * 구글에서 내 글이 몇 번째인가 — **구글 커스텀 검색(CSE) 공식 API** 로 잰다.
 *
 * 왜 이 길인가(2026-08-23 실측):
 * 구글 검색 화면을 그냥 요청하면 결과를 못 읽는다. 이 PC(가정용 회선)에서
 * 직접 재봤는데 응답은 200 에 91KB 인데 **결과 링크가 0개**였다 —
 * 자바스크립트를 켜라는 안내 페이지다. 예전에 쓰던 `gbv=1`(가벼운 HTML)도
 * 똑같았다. 그래서 지금 사이트가 "확인 필요" 만 띄우고 있었다
 * (사장님 지적: "구글은 노출 몇 위인지 확인 필요만 뜨고 왜 안 알려주니?").
 *
 * CSE 는 공식 창구라 막히지 않고 순서를 그대로 준다. 대신 정직하게 밝힐 것이
 * 하나 있다 — **CSE 결과가 google.com 화면과 100% 같지는 않다.** 그래서
 * 화면에는 "구글 커스텀 검색 기준" 이라고 적는다. 근거를 부풀리지 않는다.
 *
 * 할당량: 무료 하루 100회. 한 번에 10개씩이라 100위까지 보려면 10회를 쓴다.
 * 기본은 30위까지(3회) — 그 밖이면 어차피 트래픽이 안 나온다.
 */

export interface GoogleRankResult {
  /** 몇 번째인가. 본 범위 안에 없으면 null. */
  rank: number | null;
  /** 이번에 실제로 본 결과 수. 0 이면 못 읽은 것이다. */
  sampled: number;
  /** 구글이 말한 전체 결과 수(참고). */
  totalResults: number | null;
  /** 근거 표기용 — 화면이 이 말을 그대로 쓴다. */
  source: 'google-cse';
}

export class GoogleRankError extends Error {}

/** 주소를 비교 가능한 모양으로 — 스킴·www.·m.·끝 슬래시·질의문자열을 턴다. */
export function normalizeForMatch(url: unknown): string {
  return String(url ?? '')
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/^m\./, '')
    .split(/[?#]/)[0]
    .replace(/\/$/, '')
    .toLowerCase();
}

export interface GoogleRankOptions {
  /** 몇 위까지 볼 것인가(기본 30). 10 단위로 올림해서 호출 수가 정해진다. */
  depth?: number;
  fetchImpl?: typeof fetch;
}

/**
 * 키워드로 검색해서 그 주소가 몇 번째인지 찾는다.
 *
 * 못 읽으면 예외를 던진다 — "노출 안 됨" 으로 단정하지 않는다.
 * 읽었는데 범위 안에 없으면 rank=null 이고, 그건 진짜 "그 안엔 없다" 는 사실이다.
 */
export async function measureGoogleRank(
  keyword: string,
  targetUrl: string,
  apiKey: string,
  cseId: string,
  options: GoogleRankOptions = {},
): Promise<GoogleRankResult> {
  if (!apiKey || !cseId) {
    throw new GoogleRankError('구글 검색 API 키와 검색엔진 ID가 필요합니다');
  }
  const doFetch = options.fetchImpl ?? fetch;
  const depth = Math.max(10, Math.min(100, Math.floor(options.depth ?? 30)));
  const target = normalizeForMatch(targetUrl);

  let sampled = 0;
  let totalResults: number | null = null;

  for (let start = 1; start <= depth; start += 10) {
    const url = 'https://www.googleapis.com/customsearch/v1'
      + `?key=${encodeURIComponent(apiKey)}`
      + `&cx=${encodeURIComponent(cseId)}`
      + `&q=${encodeURIComponent(String(keyword).slice(0, 100))}`
      + `&num=10&start=${start}&hl=ko`;

    const res = await doFetch(url);
    const json: any = await res.json().catch(() => null);
    if (!res.ok || !json || json.error) {
      const msg = json?.error?.message || `HTTP ${res.status}`;
      /*
       * 할당량 소진은 "노출 안 됨" 이 아니다. 여기서 예외를 던져야 화면이
       * 잘못된 결론 대신 "못 쟀다" 를 말한다.
       */
      throw new GoogleRankError(`구글 검색 실패: ${String(msg).slice(0, 160)}`);
    }
    if (totalResults === null && json.searchInformation) {
      totalResults = Number(json.searchInformation.totalResults) || 0;
    }
    const items: any[] = Array.isArray(json.items) ? json.items : [];
    for (let i = 0; i < items.length; i++) {
      sampled += 1;
      if (normalizeForMatch(items[i]?.link) === target) {
        return { rank: start + i, sampled, totalResults, source: 'google-cse' };
      }
    }
    // 받은 게 10개 미만이면 더 볼 것이 없다 — 호출을 아낀다.
    if (items.length < 10) break;
  }

  return { rank: null, sampled, totalResults, source: 'google-cse' };
}
