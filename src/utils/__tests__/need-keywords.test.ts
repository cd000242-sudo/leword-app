/** 니즈 검색어 도출 테스트 — 2026-08-19 실제 캠페인 상품명 17건 기반 */
import { describe, it, expect } from 'vitest';
import { extractCategoryPhrase, extractCategoryPhrases, deriveNeedKeywordCandidates, parseCommissionRate, perSaleCommission } from '../need-keywords';

describe('오탐 회귀 (2026-08-19 실사고 — 니즈가 플로우·선물·증정으로 나감)', () => {
  it('시리즈명 꼬리("빈다르 플로우")에 속지 않고 선풍기를 잡는다', () => {
    const phrases = extractCategoryPhrases('벤딕트 휴대용 선풍기 손선풍기 냉각 미니 손풍기 핸디 쿨링 에어컨 빈다르 플로우');
    expect(phrases).toContain('휴대용 선풍기');
    expect(phrases).not.toContain('플로우');
  });

  it('용도문구 꼬리("부모님 선물")에 속지 않고 구강세정기를 잡는다', () => {
    const phrases = extractCategoryPhrases('오아 클린이워터B 휴대용 무선 치아 구강세정기 물치실 칫솔 치간 부모님 선물');
    expect(phrases).toContain('구강세정기');
    expect(phrases.some((p) => p.includes('선물'))).toBe(false);
  });

  it('이벤트 꼬리("악세사리 키트 증정")에 속지 않고 로봇청소기를 잡는다', () => {
    const phrases = extractCategoryPhrases('[여름특가]드리미 X60 Ultra 올인원 로봇청소기+악세사리 키트 증정 화이트, 단품');
    expect(phrases.some((p) => p.includes('로봇청소기') || p.includes('청소기'))).toBe(true);
    expect(phrases).not.toContain('증정');
  });

  it('속어 꼬리("음쓰")에 속지 않고 처리기 계열을 잡는다', () => {
    const phrases = extractCategoryPhrases('한일 가정용 음식물 처리기 분쇄기 건조기 쓰레기 음쓰 4리터 DWPO-4120');
    expect(phrases).toContain('처리기');
    expect(phrases).not.toContain('음쓰');
  });
});

describe('extractCategoryPhrase', () => {
  it('옵션 꼬리·색상·모델번호를 걷어내고 카테고리를 찾는다', () => {
    expect(extractCategoryPhrase('오아 클린이워터B 휴대용 무선 치아 구강세정기 화이트')).toBe('구강세정기');
    expect(extractCategoryPhrase('국내산 한돈 돼지 등갈비, 1kg, 1개')).toBe('등갈비');
    expect(extractCategoryPhrase('푸릇담 젊은농부 양배추즙, 100ml, 30팩')).toBe('양배추즙');
  });

  it('강결합 수식어는 카테고리에 붙는다 — "휴대용 선풍기"는 한 검색어다', () => {
    expect(extractCategoryPhrase('벤딕트 휴대용 선풍기 손선풍기 냉각 미니 손풍기')).toBe('휴대용 선풍기');
    expect(extractCategoryPhrase('[여름특가]드리미 X60 Ultra 올인원 로봇청소기')).toBe('올인원 로봇청소기');
  });

  it('한글 카테고리를 못 찾으면 빈 문자열 — 지어내지 않는다', () => {
    expect(extractCategoryPhrase('X60 Ultra 2026')).toBe('');
    expect(extractCategoryPhrase('')).toBe('');
  });
});

describe('deriveNeedKeywordCandidates', () => {
  it('추천형·브랜드형·카테고리형 후보를 만든다', () => {
    const candidates = deriveNeedKeywordCandidates('드리미 X60 Ultra 로봇청소기', '드리미');
    expect(candidates).toContain('로봇청소기 추천');
    expect(candidates).toContain('드리미 로봇청소기');
    expect(candidates).toContain('로봇청소기');
  });

  it('먹는 소모품에는 효능 후보가 붙는다 (양배추즙 효능 5,510 실측 근거)', () => {
    const candidates = deriveNeedKeywordCandidates('푸릇담 젊은농부 양배추즙, 100ml', '푸릇담');
    expect(candidates).toContain('양배추즙 효능');
  });

  it('공산품에는 효능 후보가 없다', () => {
    expect(deriveNeedKeywordCandidates('한일 가정용 음식물 처리기 분쇄기', '한일')).not.toContain('분쇄기 효능');
  });

  it('15자 초과 후보는 버린다 — 검색광고가 잘라 다른 키워드의 답을 준다', () => {
    for (const c of deriveNeedKeywordCandidates('아주아주아주 길다란 브랜드이름의 초장문형완전긴카테고리명칭', '아주아주아주긴브랜드')) {
      expect(c.length).toBeLessThanOrEqual(15);
    }
  });
});

describe('수수료 산술 (있는 재료만, 추정 금지)', () => {
  it('"수수료 8%"만 요율이다 — 할인율은 내 수익이 아니다', () => {
    expect(parseCommissionRate('수수료 8%')).toBe(0.08);
    expect(parseCommissionRate('47% 할인')).toBeNull();
    expect(parseCommissionRate('')).toBeNull();
  });

  it('건당 수익 = 가격 × 요율. 재료가 없으면 null', () => {
    expect(perSaleCommission(1190000, '수수료 5%')).toBe(59500);
    expect(perSaleCommission(13500, '47% 할인')).toBeNull();
    expect(perSaleCommission(null, '수수료 5%')).toBeNull();
  });
});
