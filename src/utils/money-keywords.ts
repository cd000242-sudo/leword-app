/**
 * 돈 되는 키워드 판정 — 네이버 검색광고 파워링크 3위 평균 입찰가로 가격을 매긴다(2026-09-24).
 *
 * 사장님: "시즌성을 고려해서 특히 고단가 키워드면서 황금키워드를 찾아줘야 되고 … 비즈니스 경제나
 *          지원금 등등 … 지금 이건 황금키워드는 맞는데 메리트가 별로 없어. 돈 될 만한 황금키워드가 절대 아냐."
 *
 * 왜 입찰가인가(그날 사장님 키로 실측):
 *   · 키워드도구(keywordstool) 응답에는 단가 필드가 없다 — monthlyAveCpc 는 한 번도 온 적이 없어서
 *     코드가 보존한다던 CPC 가 늘 빈 값이었다.
 *   · /estimate/average-position-bid/keyword(파워링크 3위)는 된다. 광고주가 실제로 넣고 있는 값이다:
 *     개인회생신청 54,370 · 자동차보험비교 21,510 · 임플란트가격 26,060 · 건강보험료 13,380 ·
 *     ISA계좌 4,890 · 대출계산기 1,640 · 부모급여 840 · 실업급여 290 · 근로장려금 70.
 *   · 검색량 · 광고 개수로는 못 가른다. 근로장려금은 월 67만 검색인데 70원이다.
 *
 * 70원은 파워링크 최저 입찰가다. 3위 입찰가가 70원이면 3위 자리까지 경쟁이 없다는 뜻이다 — 광고주가
 * 아예 없다는 뜻은 아니다(실업급여계산기는 평균 광고 2개가 붙는데 70원). 화면은 '광고 경쟁 없음'이라 적는다.
 *
 * 공백 함정: 공백이 든 말('임플란트 가격')을 그대로 물으면 네이버는 등록 안 된 말로 보고 늘 70원을 준다.
 * 공백을 빼고('임플란트가격') 물어야 26,060원이 나온다. 지난 실측 273개가 전부 70원이던 게 이것 때문이었다 —
 * 공백을 빼고 다시 재니 175개(64%)가 제 값을 가졌다. 조회 쪽(getNaverSearchAdAveragePositionBids)이 공백을 뺀다.
 *
 * 이 값은 우리가 계산한 추정치가 아니라 네이버 검색광고가 알려 주는 입찰가다. 화면은 숫자와 출처를 함께 적는다
 * (사장님 2026-09-24 '숫자 + 출처' 선택). 못 잰 값은 0 으로 채우지 않고 null 로 둔다.
 *
 * 순수 함수만 둔다 — 조회는 naver-searchad-api 의 getNaverSearchAdBidPairs.
 */

/** 파워링크 최저 입찰가(원). 3위 입찰가가 이 값이면 3위 자리까지 경쟁이 없다. */
export const MIN_POWERLINK_BID = 70;
/** 중단가 하한(원) — 대출계산기 1,640 · ISA계좌 PC 1,990 이 여기 든다. */
export const MID_BID_FLOOR = 1000;
/** 고단가 하한(원) — 연말정산 4,180 · 건강보험료 13,380 · 개인회생 58,670 이 여기 든다. */
export const HIGH_BID_FLOOR = 3000;

export type BidTier = 'high' | 'mid' | 'low' | 'none';

/** 한 키워드의 PC · 모바일 입찰가. 못 쟀으면 그 칸이 null. */
export interface BidPair {
  pc: number | null;
  mobile: number | null;
}

export interface MoneyBid {
  /** 정렬 · 표시에 쓰는 값(원) — PC · 모바일 중 큰 쪽. */
  value: number;
  tier: BidTier;
  pc: number | null;
  mobile: number | null;
}

/**
 * 돈 되는 주제 — 광고주가 몰리는 쪽(세금 · 보험 · 대출 · 의료 · 교육 · 자동차 · 육아 지원 · 이사/인테리어).
 * 판정은 주제 이름이 아니라 입찰가가 한다. 이 목록은 "창고 씨앗을 입찰가 순으로 뽑을 주제"를 고를 뿐이다.
 */
export const MONEY_TOPICS: readonly string[] = [
  '비즈니스·경제',
  '사회·정치',
  '건강·의학',
  '교육·학문',
  '자동차',
  '육아·결혼',
  'IT·컴퓨터',
  '인테리어·DIY',
];

export function isMoneyTopic(topic: string | null | undefined): boolean {
  return typeof topic === 'string' && MONEY_TOPICS.includes(topic);
}

/** 입찰가 표의 열쇠 — 공백 · 대소문자를 가리지 않는다('임플란트 가격' = '임플란트가격'). */
export function bidKey(keyword: string): string {
  return String(keyword || '').replace(/\s+/g, '').toLowerCase();
}

function finiteBid(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/** PC · 모바일 중 큰 쪽. 둘 다 못 쟀으면 null. */
export function bidValue(pair: BidPair | null | undefined): number | null {
  if (!pair) return null;
  const pc = finiteBid(pair.pc);
  const mobile = finiteBid(pair.mobile);
  if (pc === null && mobile === null) return null;
  return Math.max(pc ?? 0, mobile ?? 0);
}

/** 입찰가 구간. 못 잰 값은 구간을 만들지 않는다(null). */
export function bidTier(value: number | null | undefined): BidTier | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  if (value <= MIN_POWERLINK_BID) return 'none';
  if (value >= HIGH_BID_FLOOR) return 'high';
  if (value >= MID_BID_FLOOR) return 'mid';
  return 'low';
}

/** 한 키워드의 돈 판정. 못 쟀으면 null — 지어내지 않는다. */
export function moneyBidOf(pair: BidPair | null | undefined): MoneyBid | null {
  const value = bidValue(pair);
  const tier = bidTier(value);
  if (!pair || value === null || tier === null) return null;
  return { value, tier, pc: finiteBid(pair.pc), mobile: finiteBid(pair.mobile) };
}

/** 정렬 순위: 고단가 0 → 중단가 1 → 저단가 2 → 광고 경쟁 없음 3 → 못 잼 4. */
export function moneyRank(money: MoneyBid | null | undefined): number {
  switch (money?.tier) {
    case 'high': return 0;
    case 'mid': return 1;
    case 'low': return 2;
    case 'none': return 3;
    default: return 4;
  }
}

/**
 * 창고 씨앗을 입찰가 순으로 세운다. 못 잰 씨앗은 맨 뒤, 같은 값은 원래 순서 그대로.
 * 업체 · 브랜드 이름은 입찰가가 낮아 자연히 뒤로 간다(밴스의원 1,080 < 임플란트가격 26,060).
 */
export function orderSeedsByBid(seeds: readonly string[], bids: ReadonlyMap<string, BidPair>): string[] {
  return seeds
    .map((seed, index) => ({ seed, index, value: bidValue(bids.get(bidKey(seed))) }))
    .sort((a, b) => {
      if (a.value === null && b.value !== null) return 1;
      if (a.value !== null && b.value === null) return -1;
      if (a.value !== null && b.value !== null && a.value !== b.value) return b.value - a.value;
      return a.index - b.index;
    })
    .map((entry) => entry.seed);
}

/**
 * 황금 안에서는 돈 되는 순 — 구간(고단가 먼저) → 같은 구간이면 입찰가 → 같으면 황금비.
 * 원래 배열은 건드리지 않는다.
 */
export function orderGoldenByMoney<T extends { ratio: number; money?: MoneyBid | null }>(rows: readonly T[]): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const rank = moneyRank(a.row.money) - moneyRank(b.row.money);
      if (rank !== 0) return rank;
      const value = (b.row.money?.value ?? 0) - (a.row.money?.value ?? 0);
      if (value !== 0) return value;
      const ratio = (b.row.ratio ?? 0) - (a.row.ratio ?? 0);
      if (ratio !== 0) return ratio;
      return a.index - b.index;
    })
    .map((entry) => entry.row);
}
