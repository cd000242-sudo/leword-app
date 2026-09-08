import { describe, expect, it } from 'vitest';
import { measureSeat, parseSeatKeywords, seatAllTabUrl, seatBlogTabUrl } from '../seat-measure';

/**
 * 자리 실측기 — 두 장의 HTML(블로그탭·통합검색)을 여섯 숫자와 판정으로 줄인다.
 * 판정기는 브라이트데이터 파이프라인 것을 그대로 잇는다. 여기서는 그 이음새만 잰다.
 */
const NOW = Date.parse('2026-09-08T12:00:00Z');

/** 네이버 신 마크업 — 작성자(headline3+weight-lg)와 제목(headline1+weight-sm)이 같은 계열 클래스다. */
const post = (title: string, date = '3일 전', author = '어느 블로거') => `
<li class="bx">
  <span class="sds-comps-text sds-comps-text-type-headline3 sds-comps-text-weight-lg">${author}</span>
  <span class="sds-comps-text sds-comps-text-type-headline1 sds-comps-text-weight-sm">${title}</span>
  <span class="date">${date}</span>
</li>`;

const blogTab = (titles: Array<[string, string?]>) => `<html><body><ul>${titles.map(([t, d]) => post(t, d)).join('')}</ul></body></html>`;

/** 통합검색은 20,000자 미만이면 차단/빈 응답으로 본다 — 채워서 넘긴다. */
const pad = (body: string) => `<html><body>${body}${'<div class="filler"></div>'.repeat(1200)}</body></html>`;
const WEATHER = `<link rel="stylesheet" href="https://ssl.pstatic.net/sstatic/keypage/outside/scui/weather_new/css/cs_weather_new_251126.css"><style>.weather_layer_pop[aria-hidden="true"]{display:none}</style>`;
const ADS = `<div class="ad_area"><ul><li class="lst js-hover-item">a</li><li class="lst js-hover-item">b</li><li class="lst js-hover-item">c</li></ul></div>`;

describe('measureSeat — 정면 글·빈자리·판정', () => {
    it('정면 글이 없고 딴 글뿐이면 열림, 1위 자리가 비었다', () => {
        const html = blogTab([['전주 여행 2박3일 코스'], ['전주 맛집 리스트'], ['한옥마을 한복 대여'], ['전주 카페 추천']]);
        const seat = measureSeat({ keyword: '전주 한옥마을 주차', blogTabHtml: html, nowMs: NOW });
        expect(seat.verdict).toBe('열림');
        expect(seat.verdictCode).toBe('WINNABLE');
        expect(seat.facing).toBe(0);
        expect(seat.sampled).toBe(4);
        expect(seat.vacancy).toBe(1);
        expect(seat.structureRead).toBe(false);
        expect(seat.cards).toBeNull();
        expect(seat.ads).toBeNull();
    });

    it('정면 글이 세 개 이상이면 잠김', () => {
        const html = blogTab([
            ['전주 한옥마을 주차 총정리'], ['전주 한옥마을 주차 요금과 위치'], ['전주 한옥마을 주차 꿀팁'], ['전주 한옥마을 주차 후기'],
        ]);
        const seat = measureSeat({ keyword: '전주 한옥마을 주차', blogTabHtml: html, nowMs: NOW });
        expect(seat.verdict).toBe('잠김');
        expect(seat.facing).toBeGreaterThanOrEqual(3);
    });

    it('제목을 3개도 못 읽으면 자료없음 — 0 으로 때우지 않는다', () => {
        const seat = measureSeat({ keyword: '아무거나', blogTabHtml: '<html><body>차단</body></html>', nowMs: NOW });
        expect(seat.verdict).toBe('자료없음');
        expect(seat.sampled).toBe(0);
        expect(seat.vacancy).toBeNull();
    });

    it('통합검색에 날씨 카드가 떠 있으면 자리가 있어도 카드답', () => {
        const blog = blogTab([['골프장 근처 맛집'], ['모나크 라운딩 후기'], ['골프 초보 코스 공략']]);
        const seat = measureSeat({ keyword: '모나크cc 골프장', blogTabHtml: blog, allTabHtml: pad(WEATHER + ADS), nowMs: NOW });
        expect(seat.structureRead).toBe(true);
        expect(seat.cards).toEqual(['날씨']);
        expect(seat.verdict).toBe('카드답');
        expect(seat.ads).toBe(3);
        expect(seat.reason).toContain('날씨');
    });

    it('검색어 모양이 카드 답(날씨)이면 화면을 못 봐도 카드답', () => {
        const blog = blogTab([['한강 산책 코스'], ['여의도 나들이'], ['서울 주말 갈만한곳']]);
        const seat = measureSeat({ keyword: '여의도 날씨', blogTabHtml: blog, nowMs: NOW });
        expect(seat.verdict).toBe('카드답');
    });

    it('통합검색이 너무 짧으면(차단) 카드·광고는 null 이고 이유에 적는다', () => {
        const blog = blogTab([['a 글 하나'], ['b 글 둘 제목'], ['c 글 셋 제목']]);
        const seat = measureSeat({ keyword: '아무 키워드', blogTabHtml: blog, allTabHtml: '<html>짧다</html>', nowMs: NOW });
        expect(seat.structureRead).toBe(false);
        expect(seat.ads).toBeNull();
        expect(seat.reason).toContain('못 읽었다');
    });

    it('낡은 판은 이유에 개월로 적는다', () => {
        const blog = blogTab([['a 글 하나', '2023.03.01'], ['b 글 둘 제목', '2023.05.01'], ['c 글 셋 제목', '2024.01.01']]);
        const seat = measureSeat({ keyword: '아무 키워드', blogTabHtml: blog, nowMs: NOW });
        expect(seat.staleDays).not.toBeNull();
        expect(seat.staleDays as number).toBeGreaterThan(365);
        expect(seat.reason).toMatch(/개월 전 — 낡은 판/);
    });
});

describe('입력·주소', () => {
    it('붙여넣기는 줄·쉼표로 나누고 중복·짧은 것을 버리며 상한을 지킨다', () => {
        const list = parseSeatKeywords('전주 한옥마을 주차\n전주한옥마을 주차, 캠핑 화로대 추천\n\nㅁ\n' + Array.from({ length: 200 }, (_, i) => `키워드 ${i}`).join('\n'), 50);
        expect(list[0]).toBe('전주 한옥마을 주차');
        expect(list).toContain('캠핑 화로대 추천');
        expect(list).not.toContain('ㅁ');
        expect(list.filter((k) => k.replace(/\s+/g, '') === '전주한옥마을주차')).toHaveLength(1);
        expect(list).toHaveLength(50);
    });

    it('브라이트데이터 단계와 같은 데스크톱 주소를 쓴다', () => {
        expect(seatBlogTabUrl('전주 한옥마을 주차')).toBe('https://search.naver.com/search.naver?ssc=tab.blog.all&sm=tab_jum&query=%EC%A0%84%EC%A3%BC%20%ED%95%9C%EC%98%A5%EB%A7%88%EC%9D%84%20%EC%A3%BC%EC%B0%A8');
        expect(seatAllTabUrl('전주 한옥마을 주차')).toContain('search.naver.com/search.naver?query=');
    });
});
