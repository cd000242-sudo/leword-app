/**
 * 네이버 데이터랩 쇼핑인사이트 "분야별 인기 검색어" 씨앗 창구 — 2026-09-09 사장님 "진행".
 *
 * datalab.naver.com 쇼핑인사이트 화면이 쓰는 순위 데이터(getCategoryKeywordRank.naver)를 그대로 받는다(키 불필요,
 * 한 쪽 20건, 실측 2026-09-09: 1차 분야 10개가 산다 — 도서(50000010)는 비어 온다). 지난 7일의 분야별 검색어 순위 =
 * 지금 사람들이 사려고 찾는 말. 검색광고(광고주 어휘)와 겹치지만 **소비 순서**가 있고, 상품리뷰·패션·인테리어·요리
 * 같은 소비 주제의 실수요를 순위로 준다.
 *
 * 길: 순위 키워드(그 자체가 검색어) → 검색광고 키워드도구로 **그 말의** 검색량을 실측 → 500 이상만 `shopping:분야` 로.
 * 순위는 씨앗이 아니다. 검색량이 실측된 말만 씨앗이다.
 */

export interface ShoppingCategory {
  cid: string;
  name: string;
  /** 이 분야 검색어가 실릴 블로그 주제(네이버 32주제). 임의 분류를 피하려고 분야마다 하나만 둔다. */
  topic: string;
}

/** 1차 분야(실측 2026-09-09). 도서는 순위가 비어 와서 뺀다. */
export const SHOPPING_CATEGORIES: ReadonlyArray<ShoppingCategory> = Object.freeze([
  { cid: '50000000', name: '패션의류', topic: '패션·미용' },
  { cid: '50000001', name: '패션잡화', topic: '패션·미용' },
  { cid: '50000002', name: '화장품/미용', topic: '패션·미용' },
  { cid: '50000003', name: '디지털/가전', topic: 'IT·컴퓨터' },
  { cid: '50000004', name: '가구/인테리어', topic: '인테리어·DIY' },
  { cid: '50000005', name: '출산/육아', topic: '육아·결혼' },
  { cid: '50000006', name: '식품', topic: '요리·레시피' },
  { cid: '50000007', name: '스포츠/레저', topic: '스포츠' },
  { cid: '50000008', name: '생활/건강', topic: '상품리뷰' },
  { cid: '50000009', name: '여가/생활편의', topic: '상품리뷰' },
]);

export const SHOPPING_RANK_URL = 'https://datalab.naver.com/shoppingInsight/getCategoryKeywordRank.naver';
export const SHOPPING_PAGE_SIZE = 20;

const SHOPPING_TOPIC_BY_CID: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(SHOPPING_CATEGORIES.map((c) => [c.cid, c.topic])),
);

/** 창고 출처 꼬리표 — `shopping:50000008`. seed-db.topicOfSeed 가 분야 → 주제로 푼다. */
export function shoppingSourceTag(cid: string): string {
  return `shopping:${cid}`;
}

export function shoppingTopicOfSource(source: string): string | null {
  if (!source.startsWith('shopping:')) return null;
  return SHOPPING_TOPIC_BY_CID[source.slice(9)] || null;
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** 요청 본문(form) — 지난 7일, 전체 연령·성별·기기. 화면과 같은 인자다. */
export function shoppingRankBody(cid: string, page: number, now = new Date()): string {
  const end = new Date(now.getTime() - 24 * 3600 * 1000); // 어제까지 — 오늘은 집계가 덜 됐다
  const start = new Date(end.getTime() - 6 * 24 * 3600 * 1000);
  return new URLSearchParams({
    cid, timeUnit: 'date', startDate: ymd(start), endDate: ymd(end), age: '', gender: '', device: '',
    page: String(page), count: String(SHOPPING_PAGE_SIZE),
  }).toString();
}

export interface ShoppingRankRow { rank: number; keyword: string }

/** 응답 `{ranks:[{rank,keyword,...}]}` → 키워드. 깨지면 빈 배열 — 회차를 죽이지 않는다. */
export function parseShoppingRanks(text: string): ShoppingRankRow[] {
  let parsed: any;
  try { parsed = JSON.parse(String(text || '')); } catch { return []; }
  const ranks = parsed && Array.isArray(parsed.ranks) ? parsed.ranks : [];
  const out: ShoppingRankRow[] = [];
  for (const row of ranks) {
    const keyword = String(row && row.keyword ? row.keyword : '').replace(/\s+/g, ' ').trim();
    if (keyword.length < 2 || keyword.length > 40) continue;
    out.push({ rank: Number(row.rank) || out.length + 1, keyword });
  }
  return out;
}

/** 검색광고 키워드도구 hintKeywords 묶음 — 5개씩, 공백 없이, 15자 이하만(API 제한). */
export function chunkHintKeywords(keywords: readonly string[], size = 5): string[][] {
  const usable = [...new Set(keywords.map((k) => k.replace(/\s+/g, '')).filter((k) => k.length >= 2 && k.length <= 15))];
  const chunks: string[][] = [];
  for (let i = 0; i < usable.length; i += size) chunks.push(usable.slice(i, i + size));
  return chunks;
}
