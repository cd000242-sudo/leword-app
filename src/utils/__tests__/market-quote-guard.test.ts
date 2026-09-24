import { describe, expect, it } from 'vitest';
import { isListedName, judgeAnswerCardKeyword, listedNamesFromSeeds } from '../preemption-supply-guards';

/**
 * 시세 카드 가드 보강 — 지수 · 증시 · 코인 이름과 상장 종목 이름만 친 말(2026-09-24).
 *
 * 실측: 오늘의 추천키워드 비즈니스·경제 10칸이 전부 이 부류였다 —
 *   오늘주식시장 · 나스닥선물 · SK하이닉스 · 삼성전자우 · 코스피 · 코스피지수 · 삼성전자 · 국제유가 · 미국증시 · 리플.
 * 가드는 끝이 '주가 · 시세 · 환율'인 말만 잡아서('삼성전자 주가'는 막고 '삼성전자'는 통과) 새어 나왔다.
 * 이 말을 치면 네이버가 숫자 카드로 바로 답해 블로그 클릭이 없다(사장님 두 클릭 기준의 첫째).
 */
describe('지수 · 증시 · 코인 이름만 친 말은 카드가 답한다', () => {
  const cards = ['코스피', '코스피지수', '코스닥', '나스닥', '나스닥선물', '다우지수', 'S&P500', '미국증시', '유럽증시',
    '오늘주식시장', '주식시장', '국제유가', '유가', '금값', '비트코인', '이더리움', '리플', '도지코인'];
  for (const keyword of cards) {
    it(keyword, () => expect(judgeAnswerCardKeyword(keyword).answerCard).toBe(true));
  }
});

describe('뒤에 말이 붙으면 글감이다 — 막지 않는다', () => {
  // 한국어는 낱말 경계가 없다 — 끝맺음 · 통째 일치로만 잡는다('선물'은 '생일 선물'을, '유가'는 '유가족'을 잡으면 안 된다).
  const topics = ['생일 선물', '어버이날 선물', '선물세트 추천', '유가족 지원금', '비트코인 세금', '리플 전망',
    '국제유가 전망', '코스피 상장 조건', '증시 전망 2027', '주식 공부 방법', '금값 전망'];
  for (const keyword of topics) {
    it(keyword, () => expect(judgeAnswerCardKeyword(keyword).answerCard).toBe(false));
  }
});

describe('상장 종목 이름 — 창고의 "○○주가" 씨앗이 알려 준다', () => {
  /*
   * 종목 이름은 사전으로 다 적을 수 없다. 대신 창고(검색광고 업종 씨앗)에 '삼성전자주가' 가 있으면
   * '삼성전자' 는 상장 종목 이름이라는 사실을 쓴다 — 지어낸 목록이 아니라 창고에 실제로 있는 말이다.
   */
  const seeds = [
    { keyword: '삼성전자주가' }, { keyword: 'SK하이닉스 주가' }, { keyword: '하이닉스주가' },
    { keyword: '삼성전자우주가' }, { keyword: '현대차주가' },
    { keyword: '주가' }, { keyword: '미국주가' }, { keyword: '오늘주가' },
    { keyword: '삼성전자 서비스센터' },
  ];
  const names = listedNamesFromSeeds(seeds);

  it('"○○주가" 앞말을 종목 이름으로 모은다', () => {
    for (const name of ['삼성전자', 'SK하이닉스', '하이닉스', '삼성전자우', '현대차']) {
      expect(isListedName(name, names), name).toBe(true);
    }
  });

  it('대소문자 · 공백을 가리지 않는다', () => {
    expect(isListedName('sk하이닉스', names)).toBe(true);
    expect(isListedName('삼성 전자', names)).toBe(true);
  });

  it('"주가" 하나 · 나라 · 날짜 같은 일반 말은 종목 이름이 아니다', () => {
    for (const word of ['미국', '오늘', '주가', '']) expect(isListedName(word, names), word).toBe(false);
  });

  it('종목 이름에 말이 붙으면 글감이다', () => {
    expect(isListedName('삼성전자 서비스센터', names)).toBe(false);
    expect(isListedName('삼성전자 배당금', names)).toBe(false);
    expect(isListedName('삼성전자 주식 전망', names)).toBe(false);
  });

  // 실측(2026-09-24 오늘의 추천 작은 실주행): '삼성전자주식' 이 비즈니스·경제에 남았다 — 이것도 주가 카드가 답한다.
  it('종목 이름 + "주식" 만 친 말도 주가 카드다', () => {
    expect(isListedName('삼성전자주식', names)).toBe(true);
    expect(isListedName('SK하이닉스 주식', names)).toBe(true);
  });
});
