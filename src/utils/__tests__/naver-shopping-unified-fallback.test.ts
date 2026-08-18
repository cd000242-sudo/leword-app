/**
 * 통합검색 쇼핑 블록 파서 테스트 — 카드 텍스트는 2026-08-18 실측 캡처본.
 * 브라우저 수집은 여기서 검증하지 않는다(라이브 스모크로 별도 확인).
 */
import { describe, it, expect } from 'vitest';
import {
  parsePriceCandidates,
  parseNvMid,
  parseUnifiedCard,
  buildUnifiedResult,
  type RawUnifiedCard,
} from '../naver-shopping-unified-fallback';

const CARD_FAN: RawUnifiedCard = {
  href: 'https://cr3.shopping.naver.com/v2/bridge/searchGate?nv_mid=89327548079',
  text: '멤버십 10% 적립 한일 무소음선풍기 BLDC 리모컨 가정용 아기바람 워셔블 통세척 선풍기 신제품 할인 전 판매가 189,000 원 15% 할인 159,000 원 158,000 원 쿠폰할인가 배송비 무료',
  imgAlt: '한일 무소음선풍기 BLDC 리모컨 가정용 아기바람 워셔블 통세척 선풍기',
  imgSrc: 'https://shopping-phinf.pstatic.net/fan.jpg',
};

const CARD_SHINIL: RawUnifiedCard = {
  href: 'https://cr3.shopping.naver.com/v2/bridge/searchGate?nv_mid=87674093470',
  text: '26년형 신일 선풍기 가정용 거실 저소음 할인 전 판매가 98,500 원 49% 할인 49,900 원 49,800 원 쿠폰할인가 배송비 4,000원',
  imgAlt: '26년형 신일 선풍기 가정용 거실 저소음 무소음 조용한 스탠드',
  imgSrc: 'https://shopping-phinf.pstatic.net/shinil.jpg',
};

const CARD_VACUUM: RawUnifiedCard = {
  href: 'https://cr3.shopping.naver.com/v2/bridge/searchGate?nv_mid=12345678901',
  text: '테팔 경량 핸디 무선청소기 엑스퍼트 7.60 TY6A17KO, 본품 할인 전 판매가 349,000 원 오늘출발 14:00까지 주문 시 구매 431',
  imgAlt: '테팔 경량 핸디 무선청소기 엑스퍼트 7.60 TY6A17KO, 본품',
  imgSrc: 'https://shopping-phinf.pstatic.net/tefal.jpg',
};

// 2026-08-18 2차 실측 캡처 — 포인트/적립/무라벨 평점이 섞인 실제 형식
const CARD_PHILIPS: RawUnifiedCard = {
  href: 'https://cr3.shopping.naver.com/v2/bridge/searchGate?nv_mid=83202609599',
  text: '필립스 커피포트 전기포트 3000시리즈 무선 화이트 HD9318/00 할인 전 판매가 38,500 원 27% 할인 27,900 원 26,900 원 쿠폰할인가 배송비 무료 멤버십 시작 시 최대 4,185원 적립 오늘출발09:00까지 주문 시 4.83 (4,426) 구매 3,422 필립스생활가전코리아 광고',
  imgAlt: '필립스 커피포트 전기포트 3000시리즈 무선 화이트 HD9318/00',
  imgSrc: 'https://shopping-phinf.pstatic.net/philips.jpg',
};

const CARD_GTS: RawUnifiedCard = {
  href: 'https://cr3.shopping.naver.com/v2/bridge/searchGate?nv_mid=84715656626',
  text: '지티스 여행용 접이식 전기포트 휴대용 커피 분유 미니 햇반 보랄 옵션 A 할인 전 판매가 119,600 원 67% 할인 38,800 원 배송비 무료 4.81 (1.7만) 구매 5,199 지티스몰 네이버페이플러스 포인트 최대 388원',
  imgAlt: '지티스 여행용 접이식 <mark>전기포트</mark> 휴대용 커피 분유 미니 햇반 보랄 옵션 A',
  imgSrc: 'https://shopping-phinf.pstatic.net/gts.jpg',
};

describe('실측 형식 회귀 (2026-08-18 2차 캡처)', () => {
  it('"최대 4,185원 적립"·"포인트 최대 388원"은 가격이 아니다', () => {
    expect(parsePriceCandidates(CARD_PHILIPS.text)).toEqual([38500, 27900, 26900]);
    expect(parsePriceCandidates(CARD_GTS.text)).toEqual([119600, 38800]);
  });

  it('최대가의 1/20 미만 숫자는 가격으로 오인하지 않는다', () => {
    expect(parsePriceCandidates('정가 190,000 원 사은품 1,890 원')).toEqual([190000]);
  });

  it('alt 의 <mark> 강조 마크업을 제목에서 벗겨낸다', () => {
    const item = parseUnifiedCard(CARD_GTS);
    expect(item!.title).toBe('지티스 여행용 접이식 전기포트 휴대용 커피 분유 미니 햇반 보랄 옵션 A');
  });

  it('무라벨 평점 "4.83 (4,426)"과 괄호 리뷰 수를 읽는다', () => {
    const item = parseUnifiedCard(CARD_PHILIPS);
    expect(item!.rating).toBe(4.83);
    expect(item!.reviewCount).toBe(4426);
  });

  it('"(1.7만)" 축약 리뷰 수를 정수로 편다', () => {
    const item = parseUnifiedCard(CARD_GTS);
    expect(item!.reviewCount).toBe(17000);
    expect(item!.lprice).toBe(38800);
  });
});

describe('parsePriceCandidates', () => {
  it('배송비는 가격 후보에서 뺀다', () => {
    const prices = parsePriceCandidates(CARD_SHINIL.text);
    expect(prices).not.toContain(4000);
    expect(Math.min(...prices)).toBe(49800);
  });

  it('적립금은 가격이 아니다', () => {
    const prices = parsePriceCandidates('선풍기 89,000 원 적립 2,000 원');
    expect(prices).toEqual([89000]);
  });

  it('정가·할인가·쿠폰가를 전부 모은다', () => {
    expect(parsePriceCandidates(CARD_FAN.text)).toEqual([189000, 159000, 158000]);
  });
});

describe('parseUnifiedCard', () => {
  it('최솟값이 실구매가(lprice), 최댓값이 정가(hprice)', () => {
    const item = parseUnifiedCard(CARD_FAN);
    expect(item).not.toBeNull();
    expect(item!.lprice).toBe(158000);
    expect(item!.hprice).toBe(189000);
    expect(item!.productId).toBe('89327548079');
    expect(item!.title).toContain('한일 무소음선풍기');
  });

  it('가격이 하나면 hprice 는 0 (범위 없음 규약 유지)', () => {
    const item = parseUnifiedCard(CARD_VACUUM);
    expect(item!.lprice).toBe(349000);
    expect(item!.hprice).toBe(0);
  });

  it('구매 수는 reviewCount 로, 모델 숫자(7.60)는 평점으로 오인하지 않는다', () => {
    const item = parseUnifiedCard(CARD_VACUUM);
    expect(item!.reviewCount).toBe(431);
    expect(item!.rating).toBeUndefined();
  });

  it('nv_mid 없는 앵커·가격 없는 카드는 버린다', () => {
    expect(parseUnifiedCard({ ...CARD_FAN, href: 'https://m.search.naver.com/x' })).toBeNull();
    expect(parseUnifiedCard({ ...CARD_FAN, text: '가격 정보 없음' })).toBeNull();
  });
});

describe('buildUnifiedResult', () => {
  const cards = [CARD_FAN, CARD_SHINIL, CARD_VACUUM];

  it('중복 nv_mid 는 한 번만 싣는다', () => {
    const r = buildUnifiedResult([...cards, CARD_FAN], { display: 20, start: 1, sort: 'sim' });
    expect(r.items).toHaveLength(3);
  });

  it('asc 는 가격 오름차순, sim 은 노출 순서 유지', () => {
    const asc = buildUnifiedResult(cards, { display: 20, start: 1, sort: 'asc' });
    expect(asc.items.map((i) => i.lprice)).toEqual([49800, 158000, 349000]);
    const sim = buildUnifiedResult(cards, { display: 20, start: 1, sort: 'sim' });
    expect(sim.items[0].productId).toBe('89327548079');
  });

  it('display/start 페이지네이션이 동작한다', () => {
    const r = buildUnifiedResult(cards, { display: 1, start: 2, sort: 'sim' });
    expect(r.items).toHaveLength(1);
    expect(r.items[0].productId).toBe('87674093470');
    expect(r.total).toBe(3);
  });

  it('parseNvMid 는 브리지 URL 에서 상품 ID 를 뽑는다', () => {
    expect(parseNvMid(CARD_FAN.href)).toBe('89327548079');
    expect(parseNvMid('')).toBe('');
  });
});
