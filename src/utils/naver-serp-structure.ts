/**
 * 네이버 통합검색 화면 구조 판독.
 *
 * 왜 필요한가:
 *   지금까지 "AI 브리핑이 이 키워드를 잠식하는가"를 **어절 유형으로 추론**만 했다.
 *   실제로 그런지는 못 쟀다. 그런데 통합검색 HTML 을 받아 보니 마커가 그대로 있다.
 *   추론을 실측으로 바꿀 수 있다.
 *
 *   실측(2026-08-10, Bright Data 3건):
 *     '바리깡 어원'(정의형)        → AI 브리핑 있음
 *     '멜라토닌 복용량'(정보형)     → AI 브리핑 있음
 *     '고양이 자동화장실 렌탈'(상거래) → **없음**
 *   유형 추론과 정확히 일치했다. 이제 추론 대신 이걸 쓴다.
 *
 * 그리고 블로그탭 상위 10개만 보던 것도 여기서 고친다. 2023년부터 결과가
 * 여러 블록에 나뉘므로, 블로그가 화면의 몇 번째 블록에 있는지가 실제 노출이다.
 */

/** AI 브리핑 존재를 가리키는 마커. 넷 다 같은 결과를 냈고, 서로 보강용이다. */
const AI_BRIEF_MARKERS: readonly RegExp[] = [
  /"blockId":"ai-brief/,
  /xQuerySource":"answer_pc/,
  /fender_renderer-ai_brief/,
  /AI브리핑/,
];

/**
 * 구획 마커 세대.
 *
 * 왜 번호를 붙이나: v1 은 상단 탭바·광고 요청설정·API 게이트웨이를 구획으로 잘못 셌다.
 * 그 시절에 저장된 배치 결과를 새 코드가 그대로 읽으면 **뜨지도 않은 쇼핑 구획을
 * 근거로 '구매 검토'라고 말하게 된다** — 실제로 69행 전부가 그렇게 나왔다.
 * 저장물에 세대를 함께 적어, 세대가 다르면 "못 본 것"으로 취급한다.
 *
 * v1 (~2026-08-10) 느슨한 마커 · v2 (2026-08-10~) 렌더된 내용만
 */
export const SECTION_MARKER_VERSION = 2;

/**
 * 화면 상단을 차지하는 경쟁 구획들. 블로그가 아래로 밀리는 원인이다.
 *
 * 마커는 **실제로 렌더된 내용**만 잡아야 한다. 처음엔 느슨하게 썼다가
 * 뜨지도 않은 구획을 떴다고 말했다 — 통합검색은 어느 검색어에나 다음을 싣는다:
 *   - 상단 탭바의 `search.shopping.naver.com` (쇼핑 오탐)
 *   - `"adRequests":{"powerlink"` 요청 설정 (파워링크 오탐, 광고가 없어도 있다)
 *   - `gw.in.naver.com` 내부 API 게이트웨이 (인플루언서 오탐)
 * 그래서 목록·게시글 주소나 렌더된 고지문만 센다.
 */
const SECTION_MARKERS: Record<string, RegExp> = {
  // 인플루언서 채널 홈 주소. 게이트웨이(gw.)는 제외한다.
  인플루언서: /(?<![\w.])in\.naver\.com\/[A-Za-z0-9_-]{3,}/,
  // 질문 상세 링크. 카테고리 탭 링크에는 /qna 가 붙지 않는다.
  지식iN: /kin\.naver\.com\/qna/,
  // 카페 게시글은 `/카페아이디/글번호` 형태다. 카페 홈 링크만으로는 결과가 아니다.
  카페: /cafe\.naver\.com\/[A-Za-z0-9_-]+\/[0-9]{3,}/,
  // 상품 카드가 거는 브릿지 주소. 탭바의 search.shopping 과 다르다.
  쇼핑: /cr3\.shopping\.naver\.com/,
  // 광고가 실제로 붙었을 때만 나오는 고지문.
  파워링크: /사이트검색광고\(파워링크\)/,
};

export interface SerpStructure {
  /** AI 브리핑이 실제로 떠 있는가. 추론이 아니라 화면에서 확인한 값이다. */
  hasAiBriefing: boolean;
  /** 몇 개 마커가 일치했는지. 1개만 걸리면 오탐일 수 있어 함께 남긴다. */
  aiBriefingMarkers: number;
  /**
   * AI 브리핑이 인용한 출처 URL.
   * 인용되면 그 글은 노출은 되지만 클릭은 AI 가 가져간다 — 중요한 사실이다.
   */
  aiBriefingSources: string[];
  /** 화면에 함께 뜬 경쟁 구획들. */
  sections: string[];
  /** 어느 세대 마커로 셌는가. 저장물을 다시 읽을 때 신뢰 여부를 가른다. */
  sectionMarkerVersion: number;
  /** 블로그 제목이 몇 개나 읽혔는가. 0이면 블로그 자리가 아예 없다는 뜻이다. */
  blogTitleCount: number;
}

/** HTML 조각에서 앞뒤 태그를 걷어 URL 만 남긴다. */
function extractAiSources(html: string): string[] {
  // AI브리핑 블록은 참조를 "[n] 제목, https://..." 형태로 함께 싣는다(실측).
  const found = new Set<string>();
  for (const match of html.matchAll(/\[\d+\]\s*[^,\n]{0,60},\s*(https?:\/\/[^\s"'<\\]+)/g)) {
    const url = match[1];
    if (url) found.add(url);
    if (found.size >= 10) break;
  }
  return [...found];
}

/**
 * 통합검색 HTML 을 읽어 구조를 돌려준다.
 *
 * 본문이 너무 짧으면 차단 페이지이거나 빈 응답이다. 그때 "AI 브리핑 없음"
 * 으로 답하면 **없는 것과 못 본 것을 섞게 된다.** null 을 돌려준다.
 */
export function readSerpStructure(html: string): SerpStructure | null {
  if (!html || html.length < 20000) return null;

  const matched = AI_BRIEF_MARKERS.filter((marker) => marker.test(html));
  const sections = Object.entries(SECTION_MARKERS)
    .filter(([, marker]) => marker.test(html))
    .map(([name]) => name);

  return {
    hasAiBriefing: matched.length > 0,
    aiBriefingMarkers: matched.length,
    aiBriefingSources: matched.length > 0 ? extractAiSources(html) : [],
    sections,
    sectionMarkerVersion: SECTION_MARKER_VERSION,
    blogTitleCount: (html.match(/sds-comps-text-type-headline/g) || []).length,
  };
}

/** 화면에 나갈 사실 문장. 추정 표현을 쓰지 않는다. */
export function describeSerpStructure(structure: SerpStructure): string[] {
  const lines: string[] = [];
  if (structure.hasAiBriefing) {
    lines.push(
      structure.aiBriefingSources.length > 0
        ? `AI 브리핑이 떠 있고 ${structure.aiBriefingSources.length}개 글을 인용 중`
        : 'AI 브리핑이 떠 있음',
    );
  } else {
    lines.push('AI 브리핑 없음');
  }
  if (structure.sections.length > 0) {
    lines.push(`같이 뜨는 구획: ${structure.sections.join(' · ')}`);
  }
  return lines;
}
