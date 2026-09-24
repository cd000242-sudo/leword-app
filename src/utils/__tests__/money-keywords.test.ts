import { describe, expect, it } from 'vitest';
import {
  MIN_POWERLINK_BID,
  bidKey,
  bidTier,
  bidValue,
  isMoneyTopic,
  moneyBidOf,
  moneyRank,
  orderGoldenByMoney,
  orderSeedsByBid,
} from '../money-keywords';

/**
 * 돈 되는 키워드 판정 — 네이버 검색광고 파워링크 3위 평균 입찰가로 가격을 매긴다(2026-09-24).
 *
 * 사장님: "시즌성을 고려해서 특히 고단가 키워드면서 황금키워드를 찾아줘야 되고 …
 *          지금 이건 황금키워드는 맞는데 메리트가 별로 없어. 돈 될 만한 황금키워드가 절대 아냐."
 *
 * 아래 숫자는 전부 그날 사장님 키로 실제로 받은 값이다(/estimate/average-position-bid/keyword, 3위).
 *   개인회생 PC 58,670 · 자동차보험 30,640 · 임플란트가격 26,060 · 건강보험료 모바일 13,380 ·
 *   연말정산 4,180 · 대출계산기 1,640 · 종합부동산세 1,540 · 밴스의원 1,080 · 부모급여 840 ·
 *   실업급여 290 · 최저임금 230 · 근로장려금 70(최저가 — 광고주가 없다)
 */
describe('입찰가 구간', () => {
  it('70원은 최저가라 광고주가 없는 말이다', () => {
    expect(MIN_POWERLINK_BID).toBe(70);
    expect(bidTier(70)).toBe('none');
  });

  it('실측 값을 고단가 · 중단가 · 저단가로 가른다', () => {
    expect(bidTier(58670)).toBe('high');
    expect(bidTier(13380)).toBe('high');
    expect(bidTier(4180)).toBe('high');
    expect(bidTier(3000)).toBe('high');
    expect(bidTier(1640)).toBe('mid');
    expect(bidTier(1080)).toBe('mid');
    expect(bidTier(1000)).toBe('mid');
    expect(bidTier(840)).toBe('low');
    expect(bidTier(290)).toBe('low');
  });

  it('못 잰 값은 구간을 만들지 않는다 — 0 으로 채우지 않는다', () => {
    expect(bidTier(null)).toBeNull();
    expect(bidTier(undefined)).toBeNull();
    expect(bidTier(Number.NaN)).toBeNull();
  });

  it('PC · 모바일 중 큰 쪽이 값이다', () => {
    expect(bidValue({ pc: 10380, mobile: 13380 })).toBe(13380);
    expect(bidValue({ pc: 4180, mobile: null })).toBe(4180);
    expect(bidValue({ pc: null, mobile: null })).toBeNull();
    expect(bidValue(null)).toBeNull();
  });
});

describe('한 키워드의 돈 판정', () => {
  /*
   * 처음엔 롱테일이 전부 70원이라 머리말 값을 빌려 쓰려 했다. 원인은 롱테일이 아니라 공백이었다 —
   * '자동차보험 비교' 70원 / '자동차보험비교' 21,270원(같은 날 같은 키). 공백을 빼고 재면 롱테일도
   * 제 값이 있다(예전 70원이던 273개 중 175개). 그래서 각자 자기 값 하나로만 판정한다.
   * 머리말 값을 빌리면 제 값 150원인 말이 제 값 70원인 형제(머리말 덕에 4,180원)보다 뒤로 가는 역전도 생긴다.
   */
  it('PC · 모바일 중 큰 값과 그 구간', () => {
    expect(moneyBidOf({ pc: 10380, mobile: 13380 })).toEqual({ value: 13380, tier: 'high', pc: 10380, mobile: 13380 });
  });

  it('70원이면 광고 경쟁 없음이다', () => {
    expect(moneyBidOf({ pc: 70, mobile: 70 })).toMatchObject({ value: 70, tier: 'none' });
  });

  it('한쪽만 쟀으면 잰 쪽 값이다', () => {
    expect(moneyBidOf({ pc: null, mobile: 4890 })).toEqual({ value: 4890, tier: 'high', pc: null, mobile: 4890 });
  });

  it('못 쟀으면 null — 지어내지 않는다', () => {
    expect(moneyBidOf(null)).toBeNull();
    expect(moneyBidOf(undefined)).toBeNull();
    expect(moneyBidOf({ pc: null, mobile: null })).toBeNull();
  });

  it('순위: 고단가 → 중단가 → 저단가 → 광고주 없음 → 못 잼', () => {
    const tiers = [
      moneyBidOf({ pc: 58670, mobile: null }),
      moneyBidOf({ pc: 1640, mobile: null }),
      moneyBidOf({ pc: 290, mobile: null }),
      moneyBidOf({ pc: 70, mobile: 70 }),
      null,
    ];
    expect(tiers.map(moneyRank)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('돈 되는 주제', () => {
  it('비즈니스·경제 · 사회·정치 · 건강·의학 등은 돈 되는 주제다', () => {
    for (const topic of ['비즈니스·경제', '사회·정치', '건강·의학', '교육·학문', '자동차', '육아·결혼', 'IT·컴퓨터', '인테리어·DIY']) {
      expect(isMoneyTopic(topic), topic).toBe(true);
    }
  });

  it('오락 주제는 아니다', () => {
    for (const topic of ['드라마', '게임', '방송', '공연·전시', '영화', null, undefined, '']) {
      expect(isMoneyTopic(topic as string), String(topic)).toBe(false);
    }
  });
});

describe('창고 씨앗을 입찰가 순으로 뽑는다', () => {
  /*
   * 지난 회차는 검색량 순으로만 뽑아서 돈 되는 씨앗이 안 들어왔다.
   * 업체 · 브랜드 이름은 입찰가가 낮아 자연히 뒤로 간다(밴스의원 1,080 < 임플란트가격 26,060).
   */
  it('비싼 씨앗이 앞, 못 잰 씨앗은 맨 뒤, 같은 값은 원래 순서', () => {
    const bids = new Map([
      [bidKey('근로장려금'), { pc: 70, mobile: 70 }],
      [bidKey('임플란트 가격'), { pc: 26060, mobile: 20010 }],
      [bidKey('밴스의원'), { pc: 1080, mobile: 910 }],
      [bidKey('종합부동산세'), { pc: 1540, mobile: 1300 }],
    ]);
    const seeds = ['근로장려금', '미측정 씨앗', '임플란트 가격', '밴스의원', '종합부동산세'];
    expect(orderSeedsByBid(seeds, bids)).toEqual(['임플란트 가격', '종합부동산세', '밴스의원', '근로장려금', '미측정 씨앗']);
  });

  it('입찰가 표의 열쇠는 공백 · 대소문자를 무시한다', () => {
    expect(bidKey('임플란트 가격')).toBe(bidKey('임플란트가격'));
    expect(bidKey('SK하이닉스')).toBe(bidKey('sk하이닉스'));
  });
});

describe('황금 안에서는 돈 되는 순', () => {
  it('고단가 황금이 비율 높은 저단가 황금보다 앞에 온다', () => {
    const rows = [
      { keyword: '비율만 높음', ratio: 30, money: moneyBidOf({ pc: 70, mobile: 70 }) },
      { keyword: '고단가', ratio: 1.2, money: moneyBidOf({ pc: 13380, mobile: 10380 }) },
      { keyword: '못 잼', ratio: 50, money: null },
      { keyword: '중단가', ratio: 3, money: moneyBidOf({ pc: 1540, mobile: 1300 }) },
      { keyword: '고단가 더 비쌈', ratio: 1.1, money: moneyBidOf({ pc: 58670, mobile: null }) },
    ];
    expect(orderGoldenByMoney(rows).map((row) => row.keyword)).toEqual(['고단가 더 비쌈', '고단가', '중단가', '비율만 높음', '못 잼']);
  });

  it('같은 구간 · 같은 값이면 황금비가 높은 쪽이 앞이다', () => {
    const rows = [
      { keyword: 'a', ratio: 1.5, money: moneyBidOf({ pc: 70, mobile: 70 }) },
      { keyword: 'b', ratio: 9, money: moneyBidOf({ pc: 70, mobile: 70 }) },
    ];
    expect(orderGoldenByMoney(rows).map((row) => row.keyword)).toEqual(['b', 'a']);
  });

  it('원래 배열을 바꾸지 않는다', () => {
    const rows = [{ keyword: 'a', ratio: 1, money: null }, { keyword: 'b', ratio: 2, money: null }];
    const copy = rows.map((row) => row.keyword);
    orderGoldenByMoney(rows);
    expect(rows.map((row) => row.keyword)).toEqual(copy);
  });
});
