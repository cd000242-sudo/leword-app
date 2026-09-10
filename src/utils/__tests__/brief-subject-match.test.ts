import { describe, expect, it } from 'vitest';
import { factMatchesKeyword } from '../keyword-brief';

/**
 * 키워드 ↔ 뉴스 대상 일치(2026-09-10).
 *
 * 왜 필요한가: 뉴스 API 가 그 검색어로 돌려줬다는 사실만으로는 같은 대상이라는 근거가 안 된다.
 * 날짜·숫자 검증은 이걸 못 잡는다 — 기사 안의 날짜와 숫자는 진짜이기 때문이다.
 *
 * 실측(2026-09-10 발행본 43행): 브리프가 인용한 카드 68건 중 **35건(51%)이 딴 얘기**였다.
 *   '제주렌트카 본사'  ← "탄자니아 다발로 지역 아이들의 건강 위해"
 *   '생일 축하 메시지 글귀' ← "AI는 도민의 삶을 어떻게 바꿀 수 있는가"
 *   '무료게임 crazy'   ← 스마일게이트·아쿠아랜드 등 다른 게임 5건
 *
 * 판정은 **느슨하게** 한다. 좁게 잡으면 정상 별칭·표기 변형까지 떨어진다.
 * 여기서 막으려는 것은 '한 어절도 안 겹치는' 카드뿐이다.
 */
const card = (title: string, snippet = '') => ({ title, snippet });

describe('대상이 어긋난 카드를 잡는다', () => {
  it('실측으로 나온 오인용을 실제로 걸러 낸다', () => {
    expect(factMatchesKeyword(card('"탄자니아 다발로 지역 아이들의 건강 위해"'), '제주렌트카 본사')).toBe(false);
    expect(factMatchesKeyword(card('AI는 도민의 삶을 어떻게 바꿀 수 있는가'), '생일 축하 메시지 글귀')).toBe(false);
    expect(factMatchesKeyword(card("[뉴겜] 스마일게이트 '이클립스', 10일 정오 정식 출시"), '무료게임 crazy')).toBe(false);
    expect(factMatchesKeyword(card('가을은 미식의 계절 호텔업계 제철 식재료'), '옥토버페스트 서울 2025')).toBe(false);
  });

  it('요약에만 있어도 근거로 인정한다 — 제목만 보지 않는다', () => {
    expect(factMatchesKeyword(card('여행 업계 소식', '제주렌트카 본사 직영 예약이 늘었다'), '제주렌트카 본사')).toBe(true);
  });
});

describe('정상 카드를 떨어뜨리지 않는다', () => {
  it('어절 하나만 겹쳐도 통과한다 — 좁게 잡으면 별칭이 다 떨어진다', () => {
    expect(factMatchesKeyword(card('제주 렌트카 가격 담합 조사'), '제주렌트카 본사')).toBe(true);
    expect(factMatchesKeyword(card('옥토버페스트 개막'), '옥토버페스트 서울 2025')).toBe(true);
  });

  it('띄어쓰기가 달라도 같은 말로 본다', () => {
    expect(factMatchesKeyword(card('무릎물찬증상 원인'), '무릎 물찬 증상')).toBe(true);
    expect(factMatchesKeyword(card('무릎 물찬 증상 정리'), '무릎물찬증상')).toBe(true);
  });

  it('영문·숫자가 섞인 검색어도 잡는다', () => {
    expect(factMatchesKeyword(card('CrazyGames 신작 공개'), '무료게임 crazygames')).toBe(true);
    expect(factMatchesKeyword(card('아이폰17 사전예약 시작'), '아이폰17 사전예약')).toBe(true);
  });

  it('한 글자 어절은 근거로 안 센다 — 아무 데나 걸린다', () => {
    // '수' 한 글자를 근거로 치면 '수능'·'수요'·'수출' 기사가 전부 통과한다.
    // 두 글자 이상인 '접수일' 이 안 겹치므로 떨어져야 한다.
    expect(factMatchesKeyword(card('올해 수출이 늘었다'), '수 접수일')).toBe(false);
    // 반대로 두 글자 이상 어절이 겹치면 통과한다
    expect(factMatchesKeyword(card('원서 접수일 발표'), '수 접수일')).toBe(true);
  });

  it('견줄 말이 없으면 막지 않는다 — 판단 못 하는 것을 탈락으로 바꾸지 않는다', () => {
    expect(factMatchesKeyword(card('아무 기사'), '')).toBe(true);
    expect(factMatchesKeyword(card('아무 기사'), 'a b')).toBe(true);
  });
});
