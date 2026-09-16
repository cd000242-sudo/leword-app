/**
 * 막힌 제휴 상품에 '지금 쓸 수 있는 자리'를 붙인다 (2026-09-17).
 *
 * 사장님 2026-08-22 "노출 어려움으로만 도배돼 있으면 노출된 걸 알려줘야 황금 제품 키워드 아니냐".
 *
 * 왜 다시 만드는가: 실측(2026-09-16)에서 롱테일이 **0건**이었다. 후보를 101 · 134개나 실측했는데
 * 수집기의 기준 `검색량 ≥ 문서수` 를 통과한 것이 하나도 없었다. 제휴 상품의 니즈 검색어는 대개
 * 문서가 훨씬 많아서, 그 산술로는 구조적으로 아무것도 안 남는다.
 *
 * 그래서 기준을 바꾼다 — **자리를 실제로 재 본다.** 블로그탭을 받아 빈자리 · 정면 글을 세고
 * 열림 · 반열림인 것만 싣는다. 산술 비율이 아니라 "재 봤더니 자리가 있었다"는 사실이다.
 * 비율(ratio)은 화면이 이미 쓰고 있어 계산해 넣지만, **고르는 기준이 아니다**.
 *
 * 수집기(affiliate-campaigns-parse.js)는 다른 에이전트 소관이라 손대지 않는다. 이 판정은 enrich 쪽에서 한다.
 */

/** 자리를 재 볼 후보. 검색량 · 문서수는 실측값이다. */
export interface SlotCandidate {
  keyword: string;
  volume: number;
  documentCount: number;
}

/** 자리 실측 결과(seat-measure 가 주는 그대로). */
export interface SlotSeat {
  keyword: string;
  openSlot: number | null;
  facing: number;
  verdict: string;
  sampled: number;
  measuredAt: string;
}

/** 화면이 읽는 형식 — 기존 slots 에 자리 판정만 더했다. */
export interface AffiliateSlot {
  keyword: string;
  volume: number;
  documentCount: number;
  ratio: number;
  seat: { verdict: string; openSlot: number | null; facing: number };
}

export interface SlotItem {
  /** 상품명 — 곁말이 이 상품 이야기인지 판정하는 데 쓴다. */
  name?: string | null;
  keyword?: string | null;
  needKeyword?: string | null;
  seat?: { verdict?: string | null } | null;
}

/**
 * 앵커 바깥에 붙은 말이 상품 이야기인가(2026-09-17 마지막 조임).
 *
 * 앵커 적격성만으로는 셋이 남았다 — 니즈 자체가 통과 가능한 말이어서다:
 *   엠앤엠즈 초콜릿(니즈 '암튜브') → '성인용암튜브'   ← 초콜릿에 성인용품 검색어. 나가면 안 된다.
 *   동아오츠카 컨피던스 → '컨피던스맨 드라마' · 캘빈클라인 드로즈 → '퓨마 남성 드로즈'(남의 브랜드)
 * 공통점은 곁말('성인용' · '맨 드라마' · '퓨마')이 **상품명에 전혀 없다**는 것이다.
 * 반대로 '보관기간 · 버리기 · 마이크 · 락스 · 효능'은 상품 쓰임새를 잇는 흔한 말이라 남겨야 한다.
 * 그래서 흔한 쓰임새 말이 아니면서 상품명에도 없는 낯선 말이 붙으면 버린다.
 */
const USAGE_WORDS: ReadonlySet<string> = new Set([
  '보관', '보관법', '보관기간', '냉동보관', '유통기한', '버리기', '분리수거', '세척', '청소', '손질', '해동',
  '효능', '효과', '부작용', '성분', '칼로리', '레시피', '만들기', '볶음', '조리법', '먹는법', '사용법',
  '고장', '수명', '충전', '마이크', '소리', '음질', '세탁', '냄새', '곰팡이', '락스', '세제', '얼룩',
  '차이', '비교', '추천', '후기', '가격', '여자', '남자', '아이', '임산부', '강아지', '고양이',
]);

/** 후보에서 앵커를 들어내고 남은 낱말이 상품 이야기인지 본다. */
function sideWordsOk(candidateKeyword: string, anchor: string, item: SlotItem): boolean {
  const rest = flat(candidateKeyword).replace(anchor, '');
  if (rest.length === 0) return true;
  const haystack = `${flat(item.name)}${flat(item.keyword)}${flat(item.needKeyword)}`;
  // 남은 글자가 상품명 · 검색어 안에 있으면 그 상품 이야기다.
  if (haystack.includes(rest)) return true;
  // 아니면 쓰임새 말이어야 한다 — 두 글자 이상 조각이 하나라도 걸리면 통과.
  for (const word of USAGE_WORDS) {
    if (word.length >= 2 && rest.includes(word)) return true;
  }
  return false;
}

/** 자리가 열린 판정. 여기 드는 말은 더 넓힐 이유가 없고, 롱테일도 이 판정을 받아야 실린다. */
const OPEN_VERDICTS = new Set(['열림', '반열림']);

/**
 * 앵커로 쓸 수 없는 말 — 품목이 아니라 상품의 **곁가지**를 가리키는 말.
 *
 * 실측(2026-09-17)에서 엉뚱한 롱테일 10건이 전부 여기서 나왔다. 수집기가 뽑아 둔 니즈 검색어가
 * 품목이 아니었기 때문이다:
 *   엠앤엠즈 미니 튜브 → '튜브'(용기)    → '배드튜브'
 *   애슐리 베리믹스   → '칠레산'(원산지) → '칠레산 우니' · '칠레산 돼지고기'
 *   코코에르 다이닝   → '내추럴'(색상)   → '슈퍼내추럴 드라마'
 *   6년근 홍삼 스틱   → '스틱 추천'(형태+의도어) → '아이코스 스틱 추천'
 * 이런 말을 앵커로 삼으면 무엇을 붙여도 통과한다. 그러면 초보자가 상품과 상관없는 글을 쓰게 된다.
 */
const NOT_ANCHOR_WORDS: ReadonlySet<string> = new Set([
  // 형태 · 용기 · 구성
  '튜브', '스틱', '세트', '팩', '박스', '캔', '병', '포', '입', '개입', '기획', '선물', '선물세트', '모음',
  // 색 · 재질 · 수식
  '내추럴', '블랙', '화이트', '그레이', '네이비', '베이지', '아이보리', '실버', '골드', '브라운', '핑크',
  '프리미엄', '대용량', '소용량', '미니', '라이트', '베이직', '클래식', '오리지널', '실속', '정품', '무료',
  // 의도어 — 이게 앵커면 아무 상품 이야기나 붙는다
  '추천', '후기', '리뷰', '가격', '비교', '순위', '효능', '방법', '사용법', '보관법', '종류', '차이',
]);

/** 원산지('칠레산' · '국내산' · '수입산')는 품목이 아니다. */
const ORIGIN_SUFFIX = /(?:산|국산|수입)$/;

/**
 * 이 말을 앵커로 써도 되는가.
 * 두 글자 이하는 무엇에나 걸리고, 곁가지 낱말이 섞이면 딴 주제가 붙는다.
 * 세 글자라도 품목이면 남긴다 — '헛개차'는 실제로 '열림 1위 빈자리'가 나온 말이다.
 */
export function isUsableAnchor(keyword: unknown): boolean {
  const text = String(keyword || '').trim();
  const compact = text.replace(/\s+/g, '');
  if (compact.length < 3) return false;
  const parts = text.toLowerCase().split(/[^0-9a-z가-힣]+/).filter(Boolean);
  if (parts.length === 0) return false;
  if (parts.some((part) => NOT_ANCHOR_WORDS.has(part))) return false;
  if (parts.length === 1 && ORIGIN_SUFFIX.test(parts[0]) && parts[0].length <= 4) return false;
  return true;
}

const flat = (text: unknown): string => String(text || '').replace(/\s+/g, '').toLowerCase();

/** 두 글자 이상 낱말만 — 한 글자는 아무 말에나 걸린다. */
function words(text: unknown): string[] {
  return String(text || '')
    .toLowerCase()
    .split(/[^0-9a-z가-힣]+/)
    .filter((word) => word.length >= 2);
}

/**
 * 이 상품에 롱테일이 필요한가.
 * 자리를 아직 안 쟀으면 아니다 — 막혔는지도 모르는 채로 넓히지 않는다.
 * 이미 열렸으면 아니다 — 쓸 자리가 있는데 더 찾을 이유가 없다.
 */
export function needsSlots(item: SlotItem): boolean {
  const verdict = item && item.seat ? String(item.seat.verdict || '') : '';
  if (!verdict) return false;
  return !OPEN_VERDICTS.has(verdict);
}

export interface PickSlotOptions {
  /** 자리를 재 볼 후보 수 상한. 건당 몇 초라 이 수가 곧 회차 시간이다. */
  limit: number;
  /** 검색광고가 이 아래로 답하면 사람들이 실제로 치는 말로 보지 않는다. */
  minVolume?: number;
  /**
   * 이보다 큰 말은 후보로 보지 않는다 — 주면 **작은 말부터** 본다.
   *
   * 실주행(2026-09-17)에서 검색량 큰 순으로 골랐더니 후보가 전부 머리말이었다:
   * 블루투스이어폰(64,200) · 소고기장조림(45,110) · 신일선풍기(41,080) · 맥세이프보조배터리(27,780).
   * 정면 글 6~10개에 문서 수만~수백만이라 18회를 재고도 열린 자리가 하나도 없었다.
   * 근거: 오늘 쓸 한 편 실측(2026-09-11) — 순위가 잡힌 9건이 전부 검색량 3,610 이하, 8건이 1,000 미만.
   * 안 주면 예전처럼 큰 순이다(정책은 부르는 쪽이 정한다).
   */
  maxVolume?: number;
}

/**
 * 자리를 재 볼 후보를 고른다. 만들어 낸 말이 아니라 **검색광고가 검색량을 아는 말**만 온다.
 * 상품 이야기와 이어지지 않으면(니즈 · 상품명 낱말이 하나도 안 겹치면) 버린다 — 딴 주제로 새면
 * 자리가 열려 있어도 그 상품을 팔 수 없다.
 */
export function pickSlotCandidates(
  item: SlotItem,
  candidates: readonly SlotCandidate[],
  options: PickSlotOptions,
): SlotCandidate[] {
  const minVolume = typeof options.minVolume === 'number' ? options.minVolume : 100;
  const maxVolume = typeof options.maxVolume === 'number' ? options.maxVolume : null;
  /*
   * 앵커는 **통째로** 본다(2026-09-17).
   *
   * 낱말 한 조각만 겹쳐도 통과시켰더니 전체 회차 26개 중 10개가 엉뚱했다 —
   * 엠앤엠즈 미니 튜브 → '배드튜브' · 홍삼 스틱 → '아이코스 스틱 추천' · 애슐리 베리믹스 → '칠레산 우니' ·
   * 다이닝 세트 → '슈퍼내추럴 드라마' · 캘빈클라인 드로즈 → '퓨마 남성 드로즈'.
   * 초보자는 화면에 뜬 말을 그대로 쓴다. 상품과 상관없는 글이 되면 자리가 열려 있어도 소용이 없다.
   * 쓸 만한 것 일부('켈빈클라인 남성 드로즈'처럼 철자가 다른 것)도 같이 빠지지만, 엉뚱한 말을 싣는 것보다 낫다.
   */
  const anchors = [item.needKeyword, item.keyword]
    .filter((anchor) => isUsableAnchor(anchor))
    .map((anchor) => flat(anchor));
  // 쓸 만한 앵커가 하나도 없으면 이 상품은 넓히지 않는다 — 기준 없이 붙이면 딴 주제가 실린다.
  if (anchors.length === 0) return [];
  const already = new Set([flat(item.needKeyword), flat(item.keyword)].filter(Boolean));
  const seen = new Set<string>();

  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => {
      const key = flat(candidate.keyword);
      if (!key || already.has(key) || seen.has(key)) return false;
      if (!(typeof candidate.volume === 'number' && candidate.volume >= minVolume)) return false;
      if (maxVolume !== null && candidate.volume > maxVolume) return false;
      const matched = anchors.find((anchor) => key.includes(anchor));
      if (!matched) return false;
      // 앵커를 담았어도 곁말이 딴 주제면 버린다 — 초콜릿에 '성인용암튜브'가 붙던 자리다.
      if (!sideWordsOk(candidate.keyword, matched, item)) return false;
      seen.add(key);
      return true;
    })
    // 상한을 준 쪽은 롱테일을 찾는 것이다 — 작은 말부터. 안 준 쪽은 예전처럼 큰 말부터.
    .sort((a, b) => (maxVolume !== null
      ? (a.candidate.volume - b.candidate.volume)
      : (b.candidate.volume - a.candidate.volume)) || (a.index - b.index))
    .slice(0, Math.max(0, options.limit))
    .map(({ candidate }) => candidate);
}

/**
 * 재 본 결과에서 실을 것만 남긴다 — 열림 · 반열림만.
 * 줄 세우기는 판정이 먼저(열림 → 반열림), 같으면 정면 글이 적은 쪽, 그다음 빈자리가 앞쪽인 것.
 */
export function slotsFromSeats(
  measured: ReadonlyArray<{ candidate: SlotCandidate; seat: SlotSeat | null }>,
): AffiliateSlot[] {
  const rank = (verdict: string) => (verdict === '열림' ? 0 : 1);
  return measured
    .filter((row): row is { candidate: SlotCandidate; seat: SlotSeat } => Boolean(row.seat && OPEN_VERDICTS.has(String(row.seat.verdict))))
    .sort((a, b) => rank(a.seat.verdict) - rank(b.seat.verdict)
      || (a.seat.facing ?? 99) - (b.seat.facing ?? 99)
      || (a.seat.openSlot ?? 99) - (b.seat.openSlot ?? 99))
    .map(({ candidate, seat }) => ({
      keyword: candidate.keyword,
      volume: candidate.volume,
      documentCount: candidate.documentCount,
      ratio: Number((candidate.volume / Math.max(1, candidate.documentCount)).toFixed(4)),
      seat: { verdict: seat.verdict, openSlot: seat.openSlot, facing: seat.facing },
    }));
}
