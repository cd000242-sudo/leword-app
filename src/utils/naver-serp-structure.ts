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
 * v1 (~2026-08-10) 느슨한 마커 · v2 렌더된 내용만 · v3 문서 순서까지 (배치 순서)
 */
export const SECTION_MARKER_VERSION = 3;

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
/**
 * 네이버가 화면 묶음마다 붙이는 식별자. 등장 순서가 곧 위아래 배치다.
 *
 * 왜 중요한가: 어떤 구획이 **맨 위냐**에 따라 싸울 판이 달라진다.
 *   인기글(블로그)이 위 → 네이버 블로그가 유리
 *   웹사이트가 위      → 워드프레스·자체 사이트가 유리
 *   지식iN 이 위       → 지식인 답변으로 유입을 끌어오는 편이 빠르다
 * 유무만 봐서는 이걸 알 수 없다.
 */
const BLOCK_ID_LABEL: Record<string, string> = {
  'ai-briefing': 'AI브리핑',
  aipick: 'AI추천',
  review: '인기글',
  web: '웹사이트',
  qra: '지식스니펫',
  kin: '지식iN',
  video: '동영상',
  image: '이미지',
  news: '뉴스',
};

/**
 * blockId 로 선언되지 않거나, 선언이 빠질 수 있는 구획들.
 *
 * 라벨마다 여러 마커를 두고 **가장 먼저 나오는 위치**를 자리로 잡는다.
 * blockId 하나만 믿었다가 실측에서 지식iN 이 빠졌다 — 같은 문서에 질문 링크는
 * 20개나 있는데 blockId 선언이 없는 회차가 있다.
 *
 * 광고는 `사이트검색광고(파워링크)` 고지문보다 `ad_area` 를 먼저 본다. 고지문은
 * `display:none` 안내 레이어라 실제 광고 위치와 무관하다(실측: 고지문은 중간,
 * ad_area 는 맨 위 60,689).
 */
const POSITIONED_MARKERS: Record<string, RegExp[]> = {
  파워링크: [/ad_area|api_ad/, /사이트검색광고\(파워링크\)/],
  쇼핑: [/cr3\.shopping\.naver\.com/],
  지식iN: [/kin\.naver\.com\/qna/],
  // 게이트웨이(gw.in.naver.com)는 인플루언서가 아니라 내부 API 주소다.
  인플루언서: [/(?<![\w.])in\.naver\.com\/[A-Za-z0-9_-]{3,}/],
  // 카페 게시글은 `/카페아이디/글번호` 형태다. 카페 홈 링크만으로는 결과가 아니다.
  카페: [/cafe\.naver\.com\/[A-Za-z0-9_-]+\/[0-9]{3,}/],
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
  /** 화면에 함께 뜬 경쟁 구획들. **위에서 아래 순서**다. */
  sections: string[];
  /** 어느 세대 마커로 셌는가. 저장물을 다시 읽을 때 신뢰 여부를 가른다. */
  sectionMarkerVersion: number;
  /** 블로그 제목이 몇 개나 읽혔는가. 0이면 블로그 자리가 아예 없다는 뜻이다. */
  blogTitleCount: number;
  /**
   * 상단 파워링크에 붙은 광고 건수(실측).
   *
   * 왜 세는가 (사장님, 2026-08-11): "상위에 광고가 많이 떠 있다면 그 키워드는
   * 돈이 되는 키워드다 — 광고주가 많으니까." 맞다. 광고주는 전환되는 검색어에만
   * 돈을 넣는다. 우리가 지어낸 수익 추정이 아니라 **광고주들이 이미 낸 판단**이다.
   */
  adCount: number;
}

/**
 * 파워링크 광고 한 건의 마커.
 *
 * 실측으로 맞췄다(2026-08-11, 통합검색 원문 5건):
 *   블록  <div class="nad_area" id="power_link_body">
 *   항목  <li class="lst js-hover-item …">   ← 이 개수가 곧 광고 수
 *
 *   치아보험 10건 · 노트북받침대 비교 3건 · 크레마 이북리더기 미피 2건
 *   오퍼레이터24 1건 · 에너지바우처조회 1건
 *
 * `ad_area` 는 광고 **유무**만 알려 준다(고지문 레이어라 위치·개수와 무관).
 * 개수를 세려면 항목 마커를 봐야 한다.
 */
const AD_BLOCK_MARKER = /nad_area|id="power_link_body"|ad_area|api_ad/;
const AD_ITEM_MARKER = /class="lst js-hover-item/g;

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
  const sections = readSectionOrder(html);

  return {
    hasAiBriefing: matched.length > 0,
    aiBriefingMarkers: matched.length,
    aiBriefingSources: matched.length > 0 ? extractAiSources(html) : [],
    sections,
    sectionMarkerVersion: SECTION_MARKER_VERSION,
    blogTitleCount: (html.match(/sds-comps-text-type-headline/g) || []).length,
    // 광고 블록이 없으면 항목도 없다 — 마커가 어디 다른 데 걸리는 것을 막는다.
    adCount: AD_BLOCK_MARKER.test(html) ? (html.match(AD_ITEM_MARKER) || []).length : 0,
  };
}

/**
 * 구획을 **위에서 아래 순서로** 읽는다.
 *
 * 순서의 근거는 문서 안 등장 위치다. 네이버 통합검색은 묶음마다 자기 스크립트를
 * 그 자리에 심으므로 문서 순서가 곧 화면 순서다. 실측 대조: 고양이 자동화장실
 * 렌탈에서 ad_area(60,689) → 쇼핑(164,145) → 웹사이트(272,668) → 인기글(347,072)
 * 로, 광고가 맨 위라는 네이버 실제 동작과 일치했다.
 */
export function readSectionOrder(html: string): string[] {
  const found = new Map<string, number>();

  for (const match of html.matchAll(/"blockId":"([a-zA-Z0-9_-]+)/g)) {
    const label = BLOCK_ID_LABEL[match[1]];
    if (label && !found.has(label)) found.set(label, match.index ?? 0);
  }
  for (const [label, markers] of Object.entries(POSITIONED_MARKERS)) {
    for (const marker of markers) {
      const match = marker.exec(html);
      if (!match) continue;
      const previous = found.get(label);
      // 여러 마커가 걸리면 제일 위에 있는 것이 그 구획의 자리다.
      if (previous === undefined || match.index < previous) found.set(label, match.index);
    }
  }
  return [...found.entries()].sort((a, b) => a[1] - b[1]).map(([label]) => label);
}

/**
 * 저장된 구획 목록을 믿어도 되는가.
 *
 * 세대가 다르면 **못 본 것**으로 돌려준다 — 없는 것과 섞지 않는다.
 * 이 판단을 발행기 안에 인라인으로 두었더니 시험이 안 붙었고, 그 사이
 * 옛 세대 69행이 "쇼핑 구획 있음"으로 화면에 나갈 뻔했다.
 */
export function trustedSections(saved: {
  sections?: unknown;
  sectionMarkerVersion?: unknown;
} | null | undefined): string[] | null {
  if (!saved) return null;
  if (saved.sectionMarkerVersion !== SECTION_MARKER_VERSION) return null;
  return Array.isArray(saved.sections) ? saved.sections.map(String) : null;
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
