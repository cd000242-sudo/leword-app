/**
 * "이 검색어가 뭔데?" — 화면에서 읽어 온 뜻과 맥락.
 *
 * 왜 필요한가 (사장님 지적, 2026-08-10):
 *   "글을 쓰더라도 이 키워드가 왜 뜨는지 의미가 뭔지 알아야 이해하고 글을 쓸 거 아냐.
 *    아무 생각 없이 막 적는 건 하수가 하는 짓이잖아."
 *
 *   맞다. 보드가 '코모치야리이까 해동'을 내밀어도 그게 뭔지 모르면 못 쓴다.
 *   숫자만으로는 "신박하긴 한데 쓸 키워드는 아닌" 목록이 된다.
 *
 * 어디서 가져오나 — **전부 검색결과 화면에 이미 떠 있는 글자다.** 우리가 설명을
 * 지어내지 않는다:
 *   ① AI 브리핑이 인용한 글의 제목 (네이버가 "이 검색어의 답"이라고 고른 것)
 *   ② 상위 결과 중 **질문형 제목** (사람들이 실제로 무엇을 묻는가)
 *   ③ 상위 글 제목 (지금 그 자리를 차지한 글이 무엇을 다루는가)
 *   ④ 쇼핑 카드의 상품명·가격 (상품 키워드라면 "그게 뭔지"가 곧 상품 정체다)
 */

/** 질문으로 읽히는 제목. 검색자가 무엇을 알고 싶은지가 여기 그대로 있다. */
const QUESTION_SHAPE = /[?？]\s*$|(?:나요|인가요|할까요|은가요|ㄹ까요|무엇|어떻게|왜\s|어디서|언제)/;

/**
 * 쇼핑 카드 제목 판별.
 *
 * 카드는 옵션이 쉼표로 붙어 온다 — '에이블미 … 이발기, 블랙, 1개 - 이발기'.
 * 쉼표만 보면 '멜라토닌의 모든 것: 효과, 종류, 그리고 사용법' 같은 글 제목이
 * 걸린다(실측). 그래서 **수량·옵션 표기**를 함께 요구한다.
 */
const SHOPPING_TITLE_SHAPE = /,[^,]{1,20},/;
const SHOPPING_OPTION_SHAPE = /\d+\s*(?:개|매|팩|입|세트|묶음|박스|ml|g|kg)|\s-\s/;

export interface SerpMeaning {
  /** AI 브리핑이 답으로 인용한 글 제목. 네이버가 고른 정답지다. */
  citedTitles: string[];
  /** 사람들이 실제로 묻는 형태. */
  questions: string[];
  /** 지금 상위를 차지한 글 제목. */
  topTitles: string[];
  /** 쇼핑 카드에 뜬 상품명. 상품 키워드일 때 "이게 뭔데"의 답이다. */
  productNames: string[];
  /** 쇼핑 노출가 중앙값(원). 못 읽으면 null. */
  priceMedian: number | null;
  /** 가격을 몇 개 읽었는지. 1~2개면 대표값으로 보기 어렵다. */
  priceSamples: number;
}

function clean(text: string): string {
  return String(text || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function unique(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * 통합검색 HTML 에서 뜻·맥락을 읽는다.
 *
 * 문서가 짧으면(차단·빈 응답) 아무것도 돌려주지 않는다 — 못 본 것과 없는 것을
 * 섞지 않는다.
 */
export function readSerpMeaning(html: string): SerpMeaning {
  const empty: SerpMeaning = {
    citedTitles: [], questions: [], topTitles: [],
    productNames: [], priceMedian: null, priceSamples: 0,
  };
  if (!html || html.length < 20000) return empty;

  // ① AI 브리핑 인용 — 브리핑 블록이 sources 배열로 제목·본문을 함께 싣는다.
  const cited = [...html.matchAll(/"title":"([^"]{6,90})","content":"/g)].map((m) => clean(m[1]));

  /*
   * ②③ 글 제목. 작성자 이름(headline3 + weight-lg)이 아니라
   * 글 제목(headline1 + weight-sm)만 본다 — serp-winnability 와 같은 선택자다.
   */
  const titles = [...html.matchAll(
    /sds-comps-text-type-headline1[^"]*sds-comps-text-weight-sm[^"]*"[^>]*>([\s\S]{2,200}?)<\/span>/g,
  )].map((m) => clean(m[1])).filter((title) => title.length >= 6);

  // ④ 상품. 옵션 쉼표가 붙은 제목만 상품 카드로 본다.
  const productNames = unique(
    titles.filter((title) => SHOPPING_TITLE_SHAPE.test(title) && SHOPPING_OPTION_SHAPE.test(title)),
    3,
  );

  /*
   * 가격은 중앙값만 쓴다. 광고·배송비 같은 값이 섞여 최저·최고가 흔들리는데,
   * 중앙값은 그런 이상치에 잘 안 흔들린다. 평균을 쓰면 3,200원짜리 배송비가
   * 대표값을 끌어내린다(실측에서 실제로 섞여 있었다).
   */
  const prices = [...html.matchAll(/([0-9]{1,3}(?:,[0-9]{3})+)\s*원/g)]
    .map((m) => Number(m[1].replace(/,/g, '')))
    .filter((value) => Number.isFinite(value) && value >= 1000)
    .sort((a, b) => a - b);

  return {
    citedTitles: unique(cited, 3),
    questions: unique(titles.filter((title) => QUESTION_SHAPE.test(title)), 4),
    topTitles: unique(titles, 5),
    productNames,
    priceMedian: prices.length > 0 ? prices[Math.floor(prices.length / 2)] : null,
    priceSamples: prices.length,
  };
}

/**
 * 화면에 나갈 문장으로 옮긴다. 전부 인용이고, 우리 말은 앞의 안내구뿐이다.
 * 근거가 없으면 그 줄을 안 쓴다.
 */
export function describeSerpMeaning(meaning: SerpMeaning): string[] {
  const lines: string[] = [];
  if (meaning.citedTitles.length > 0) {
    lines.push(`네이버가 답으로 고른 글: ${meaning.citedTitles.join(' · ')}`);
  }
  if (meaning.questions.length > 0) {
    lines.push(`사람들이 이렇게 묻는다: ${meaning.questions.join(' · ')}`);
  }
  if (meaning.productNames.length > 0) {
    lines.push(`쇼핑에 뜨는 상품: ${meaning.productNames.join(' · ')}`);
  }
  // 표본이 두어 개뿐이면 대표값이라고 말할 수 없다.
  if (meaning.priceMedian !== null && meaning.priceSamples >= 3) {
    lines.push(`쇼핑 노출가 중앙값 ${meaning.priceMedian.toLocaleString('ko-KR')}원 (${meaning.priceSamples}건)`);
  }
  return lines;
}
