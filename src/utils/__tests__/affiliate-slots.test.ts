import { describe, expect, it } from 'vitest';
import { needsSlots, pickSlotCandidates, slotsFromSeats, type SlotCandidate } from '../affiliate-slots';

/**
 * 막힌 상품에 '지금 쓸 수 있는 자리'를 붙인다 (2026-09-17).
 *
 * 사장님 2026-08-22 "노출 어려움으로만 도배돼 있으면 노출된 걸 알려줘야 황금 제품 키워드 아니냐".
 *
 * 그런데 실측(2026-09-16)에서 롱테일이 **0건**이었다. 후보를 101 · 134개나 실측했는데
 * 수집기의 기준 `검색량 ≥ 문서수` 를 통과한 게 하나도 없었다. 제휴 상품의 니즈 검색어는
 * 대개 문서가 훨씬 많아서, 그 산술로는 구조적으로 아무것도 안 남는다.
 *
 * 그래서 기준을 바꾼다 — **자리를 실제로 재 본다.** 블로그탭을 받아 빈자리 · 정면 글을 세고
 * 열림 · 반열림인 것만 남긴다. 산술 비율이 아니라 "재 봤더니 자리가 있었다"는 사실이다.
 * (수집기 파일은 다른 에이전트 소관이라 손대지 않는다. 이 판정은 enrich 쪽에서 한다.)
 */

const item = (over: Record<string, unknown> = {}) => ({
  name: '오아 클린이워터B 휴대용 무선 구강세정기',
  keyword: '오아 구강세정기',
  needKeyword: '구강세정기',
  needVolume: 33000,
  needDocs: 120000,
  needRatio: 0.275,
  seat: { keyword: '구강세정기', openSlot: null, facing: 7, verdict: '잠김', sampled: 10, measuredAt: '2026-09-17T00:00:00Z' },
  ...over,
});

const candidate = (keyword: string, volume: number, documentCount: number): SlotCandidate => ({
  keyword, volume, documentCount,
});

describe('막힌 상품의 자리 넓히기', () => {
  it('자리가 이미 열린 상품에는 만들지 않는다 — 쓸 자리가 있는데 더 찾을 이유가 없다', () => {
    expect(needsSlots(item())).toBe(true);
    expect(needsSlots(item({ seat: { ...item().seat, verdict: '열림' } }))).toBe(false);
    expect(needsSlots(item({ seat: { ...item().seat, verdict: '반열림' } }))).toBe(false);
    // 자리를 아직 안 잰 상품은 대상이 아니다 — 막혔는지 모르는 채로 넓히지 않는다.
    expect(needsSlots(item({ seat: null }))).toBe(false);
  });

  it('후보는 사람이 실제로 치는 말이어야 하고, 상품 이야기와 이어져야 한다', () => {
    const picked = pickSlotCandidates(item(), [
      candidate('구강세정기 추천', 1200, 30000),
      candidate('구강세정기', 33000, 120000),   // 니즈 그 자체 — 이미 막힌 말이라 뺀다
      candidate('물티슈 추천', 5000, 10000),     // 상품과 이어지지 않는다
      candidate('구강세정기 사용법', 90, 500),   // 검색량이 하한(100) 아래
    ], { limit: 5 });
    expect(picked.map((c) => c.keyword)).toEqual(['구강세정기 추천']);
  });

  /**
   * 실주행(2026-09-17)이 잡은 결함. 검색량 큰 순으로 고르니 후보가 전부 머리말이었다 —
   * 블루투스이어폰(64,200) · 소고기장조림(45,110) · 신일선풍기(41,080) · 맥세이프보조배터리(27,780).
   * 정면 글 6~10개에 문서 수만~수백만이라 18회를 재고도 열린 자리가 하나도 없었다.
   * 롱테일을 찾겠다면서 큰 말부터 고른 것이 잘못이다.
   *
   * 근거: 오늘 쓸 한 편 실측(2026-09-11) — 순위가 잡힌 9건이 전부 검색량 3,610 이하였고 8건이 1,000 미만이었다.
   * 그래서 **상한을 두어 머리말을 아예 빼고, 작은 말부터** 본다.
   */
  it('머리말은 후보로 안 본다 — 큰 말은 어차피 잠겨 있다', () => {
    const picked = pickSlotCandidates(item(), [
      candidate('구강세정기 추천', 1200, 30000),
      candidate('구강세정기 세척', 300, 9000),
      candidate('휴대용 구강세정기', 700, 12000),
      candidate('맥세이프 구강세정기', 27780, 60412),
    ], { limit: 2, minVolume: 50, maxVolume: 3000 });
    // 작은 말부터 — 상한을 넘는 머리말은 아예 빠진다.
    expect(picked.map((c) => c.keyword)).toEqual(['구강세정기 세척', '휴대용 구강세정기']);
  });

  /**
   * 전체 회차(2026-09-17)에서 26개 중 10개가 엉뚱했다 — 낱말 한 조각만 겹치면 통과했기 때문이다.
   *   엠앤엠즈 미니 튜브 → '배드튜브' · 홍삼 스틱 → '아이코스 스틱 추천' · 애슐리 베리믹스 → '칠레산 우니' ·
   *   다이닝 세트 → '슈퍼내추럴 드라마' · 캘빈클라인 드로즈 → '퓨마 남성 드로즈'.
   * 초보자가 그대로 쓰면 상품과 상관없는 글이 된다. 그래서 후보는 니즈 검색어를 **통째로** 담아야 한다.
   * 이러면 '켈빈클라인 남성 드로즈'(철자가 다른 것)처럼 쓸 만한 것도 일부 빠지지만,
   * 엉뚱한 말을 싣는 것보다 덜 싣는 쪽이 낫다.
   */
  it('낱말 한 조각만 겹치는 말은 버린다 — 니즈 검색어를 통째로 담아야 한다', () => {
    const picked = pickSlotCandidates(item({ needKeyword: '메추리알장조림', keyword: '맛꾼 메추리알 장조림' }), [
      candidate('메추리알장조림 보관기간', 210, 2352),
      candidate('배드튜브', 300, 5000),
      candidate('장조림 레시피', 500, 20000),
      candidate('소고기장조림', 1200, 30000),
    ], { limit: 5, minVolume: 50, maxVolume: 3000 });
    expect(picked.map((c) => c.keyword)).toEqual(['메추리알장조림 보관기간']);
  });

  /**
   * 진짜 원인(2026-09-17 실측): 앵커로 쓰는 니즈 검색어 자체가 품목이 아니었다.
   *   엠앤엠즈 미니 튜브 → 니즈 '암튜브' · 상품검색어 '튜브'   → '배드튜브'
   *   애슐리 베리믹스   → 니즈 '칠레산'(원산지)              → '칠레산 우니' · '칠레산 돼지고기'
   *   코코에르 다이닝   → 니즈 '내추럴'(색상)                → '슈퍼내추럴 드라마'
   *   6년근 홍삼 스틱   → 니즈 '스틱 추천'(형태+의도어)      → '아이코스 스틱 추천'
   * 이런 말을 앵커로 쓰면 무엇을 붙여도 통과한다. 그래서 앵커가 될 수 없는 말이면 그 상품은 아예 건너뛴다.
   */
  it('품목이 아닌 말은 앵커로 쓰지 않는다 — 원산지 · 색 · 형태 · 의도어 · 두 글자', () => {
    const candidates = [candidate('칠레산 우니', 300, 5000), candidate('칠레산 블루베리 농약', 210, 2000)];
    expect(pickSlotCandidates(item({ needKeyword: '칠레산', keyword: '칠레산' }), candidates, { limit: 3, minVolume: 50, maxVolume: 3000 })).toEqual([]);
    expect(pickSlotCandidates(item({ needKeyword: '내추럴', keyword: '내추럴' }), [candidate('슈퍼내추럴 드라마', 400, 9000)], { limit: 3, minVolume: 50, maxVolume: 3000 })).toEqual([]);
    expect(pickSlotCandidates(item({ needKeyword: '튜브', keyword: '튜브' }), [candidate('배드튜브', 300, 5000)], { limit: 3, minVolume: 50, maxVolume: 3000 })).toEqual([]);
    expect(pickSlotCandidates(item({ needKeyword: '스틱 추천', keyword: '6년근 장홍삼' }), [candidate('아이코스 스틱 추천', 260, 8000)], { limit: 3, minVolume: 50, maxVolume: 3000 })).toEqual([]);
  });

  it('품목을 가리키는 말은 그대로 앵커로 쓴다 — 잘 나온 것까지 잃지 않는다', () => {
    const ok = (need: string, cand: string) => pickSlotCandidates(
      item({ needKeyword: need, keyword: need }),
      [candidate(cand, 210, 2352)],
      { limit: 3, minVolume: 50, maxVolume: 3000 },
    ).map((c) => c.keyword);
    expect(ok('메추리알장조림', '메추리알장조림 보관기간')).toEqual(['메추리알장조림 보관기간']);
    expect(ok('보조배터리', '보조배터리 버리기')).toEqual(['보조배터리 버리기']);
    expect(ok('골전도이어폰', '골전도이어폰 마이크')).toEqual(['골전도이어폰 마이크']);
    expect(ok('욕실청소용', '욕실청소용 락스')).toEqual(['욕실청소용 락스']);
    // 세 글자라도 품목이면 남긴다 — 실제로 '열림 1위 빈자리'가 나온 말이다.
    expect(ok('헛개차', '헛개차 효능 여자')).toEqual(['헛개차 효능 여자']);
  });

  /**
   * 앵커를 담아도 곁말이 딴 주제면 버린다(2026-09-17 마지막 조임).
   *
   * 앵커 적격성을 넣은 뒤에도 셋이 남았다 — 니즈 자체가 통과 가능한 말이어서다:
   *   엠앤엠즈 초콜릿(니즈 '암튜브') → '성인용암튜브'   ← 초콜릿 상품에 성인용품 검색어. 나가면 안 된다.
   *   동아오츠카 컨피던스(니즈 '컨피던스') → '컨피던스맨 드라마'
   *   캘빈클라인 드로즈(니즈 '남성드로즈') → '퓨마 남성 드로즈'  ← 남의 브랜드
   * 공통점은 앵커 **바깥에 붙은 말**('성인용' · '맨 드라마' · '퓨마')이 상품명에 전혀 없다는 것이다.
   */
  it('앵커를 담아도 상품과 무관한 말이 붙으면 버린다', () => {
    const chocolate = item({ name: '엠앤엠즈 미니 튜브, 35g, 24개', needKeyword: '암튜브', keyword: '튜브' });
    expect(pickSlotCandidates(chocolate, [candidate('성인용암튜브', 210, 3000)], { limit: 3, minVolume: 50, maxVolume: 3000 })).toEqual([]);

    const drink = item({ name: '동아오츠카 컨피던스, 250ml, 30개', needKeyword: '컨피던스', keyword: '컨피던스' });
    expect(pickSlotCandidates(drink, [candidate('컨피던스맨 드라마', 300, 9000)], { limit: 3, minVolume: 50, maxVolume: 3000 })).toEqual([]);

    const drawers = item({ name: '캘빈클라인 스트레치 코튼 드로즈 U2662G', needKeyword: '남성드로즈', keyword: '코튼 드로즈' });
    expect(pickSlotCandidates(drawers, [candidate('퓨마 남성 드로즈', 200, 232)], { limit: 3, minVolume: 50, maxVolume: 3000 })).toEqual([]);
  });

  it('상품 이야기에서 뻗은 말은 그대로 남는다 — 조이되 좋은 것을 잃지 않는다', () => {
    const keep = (name: string, need: string, cand: string) => pickSlotCandidates(
      item({ name, needKeyword: need, keyword: need }),
      [candidate(cand, 210, 2352)],
      { limit: 3, minVolume: 50, maxVolume: 3000 },
    ).map((c) => c.keyword);
    // 앵커 바깥 말이 '보관기간 · 버리기 · 마이크 · 락스 · 효능'처럼 상품 쓰임새를 잇는 말이면 남긴다.
    expect(keep('맛꾼 메추리알 장조림, 1kg, 2개', '메추리알장조림', '메추리알장조림 보관기간')).toEqual(['메추리알장조림 보관기간']);
    expect(keep('바우아토 올인원 보조배터리, 10000mAh', '보조배터리', '보조배터리 버리기')).toEqual(['보조배터리 버리기']);
    expect(keep('피죤 무균무때 뿌리는 락스세제 욕실청소용', '욕실청소용', '욕실청소용 락스')).toEqual(['욕실청소용 락스']);
    expect(keep('광동 남 진한 헛개차, 500ml, 20개', '헛개차', '헛개차 효능 여자')).toEqual(['헛개차 효능 여자']);
  });

  it('상한을 안 주면 예전처럼 검색량 큰 순이다 — 부르는 쪽이 정책을 정한다', () => {
    const picked = pickSlotCandidates(item(), [
      candidate('구강세정기 세척', 300, 9000),
      candidate('구강세정기 추천', 1200, 30000),
    ], { limit: 2 });
    expect(picked.map((c) => c.keyword)).toEqual(['구강세정기 추천', '구강세정기 세척']);
  });

  it('재 봤더니 자리가 있던 것만 싣는다 — 잠김 · 카드답은 버린다', () => {
    const slots = slotsFromSeats([
      { candidate: candidate('구강세정기 추천', 1200, 30000), seat: { keyword: '구강세정기 추천', openSlot: 4, facing: 1, verdict: '반열림', sampled: 10, measuredAt: '2026-09-17T01:00:00Z' } },
      { candidate: candidate('구강세정기 비교', 700, 12000), seat: { keyword: '구강세정기 비교', openSlot: null, facing: 8, verdict: '잠김', sampled: 10, measuredAt: '2026-09-17T01:00:00Z' } },
      { candidate: candidate('구강세정기 후기', 300, 9000), seat: null },
    ]);
    expect(slots).toHaveLength(1);
    expect(slots[0].keyword).toBe('구강세정기 추천');
    // 화면이 이미 읽고 있는 형식(keyword · volume · documentCount · ratio)을 그대로 유지한다.
    expect(slots[0].volume).toBe(1200);
    expect(slots[0].documentCount).toBe(30000);
    expect(slots[0].ratio).toBeCloseTo(0.04, 3);
    // 무엇을 보고 골랐는지 화면이 말할 수 있게 자리 판정도 함께 싣는다.
    expect(slots[0].seat).toEqual({ verdict: '반열림', openSlot: 4, facing: 1 });
  });

  it('자리가 넓은 것부터 — 빈자리가 앞이고, 같으면 정면 글이 적은 쪽이 앞이다', () => {
    const slots = slotsFromSeats([
      { candidate: candidate('가', 500, 1000), seat: { keyword: '가', openSlot: null, facing: 1, verdict: '반열림', sampled: 10, measuredAt: 'x' } },
      { candidate: candidate('나', 500, 1000), seat: { keyword: '나', openSlot: 2, facing: 2, verdict: '열림', sampled: 10, measuredAt: 'x' } },
      { candidate: candidate('다', 500, 1000), seat: { keyword: '다', openSlot: 5, facing: 0, verdict: '열림', sampled: 10, measuredAt: 'x' } },
    ]);
    expect(slots.map((s) => s.keyword)).toEqual(['다', '나', '가']);
  });
});
