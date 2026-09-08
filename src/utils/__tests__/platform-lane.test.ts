import { describe, expect, it } from 'vitest';
import { judgePlatformLane } from '../platform-lane';

/**
 * 플랫폼 레인 — 황금키워드를 용도로 가른다 (사장님 지시 2026-08-17).
 *
 * 쇼핑/상품 키워드는 이 보드의 오염이 아니라 쇼핑 커넥트의 소관이다.
 * 판정은 브랜드명 추측이 아니라 **SERP 실측 3중 증거**로 한다:
 * 쇼핑 구획 등장 · 쇼핑 카드 상품명 2개 이상 · 스마트블록 쇼핑 상위 3위.
 *
 * 픽스처는 전부 2026-08-17 월요일 실회차 28행에서 그대로 옮긴 것이다 —
 * 지어낸 사례로 캘리브레이션하면 실전에서 어긋난다.
 */

describe('쇼핑 레인 — SERP 실측 증거', () => {
    it('쇼핑 구획이 뜨면 쇼핑 레인: 매장스피커 세라원', () => {
        const verdict = judgePlatformLane({
            keyword: '매장스피커 세라원',
            serpSections: ['쇼핑', '지식스니펫', '웹사이트'],
        });
        expect(verdict.lane).toBe('shopping');
        expect(verdict.laneReasons.join(' ')).toContain('쇼핑');
    });

    it('파워링크 뒤라도 쇼핑 구획이면 쇼핑 레인: 강아지치석제거 케어덴', () => {
        const verdict = judgePlatformLane({
            keyword: '강아지치석제거 케어덴',
            serpSections: ['파워링크', '쇼핑', '지식스니펫', '웹사이트'],
            adCount: 3,
        });
        expect(verdict.lane).toBe('shopping');
    });

    it('쇼핑 카드 상품명 2개 이상이면 쇼핑 레인: 슬로벨라 혈압약 가격', () => {
        const verdict = judgePlatformLane({
            keyword: '슬로벨라 혈압약 가격',
            serpSections: ['웹사이트', '카페', '인기글'],
            productNames: ['슬로벨라 혈압보조제, 60정, 2개', '슬로벨라 혈압약, 30정, 1개'],
        });
        expect(verdict.lane).toBe('shopping');
    });

    it('스마트블록 쇼핑 상위 3위(MDP 경로)면 쇼핑 레인', () => {
        const verdict = judgePlatformLane({
            keyword: '무선청소기 추천',
            shoppingDominant: true,
        });
        expect(verdict.lane).toBe('shopping');
    });
});

describe('콘텐츠 레인 — 상업성이 있어도 쇼핑 증거가 없으면 남긴다', () => {
    it('광고 10건이어도 쇼핑 구획 없으면 콘텐츠: 을왕리 펜션', () => {
        // 펜션 후기는 전형적 네이버 블로그 소재다 — 광고 수로 자르면 오폭.
        const verdict = judgePlatformLane({
            keyword: '을왕리 펜션',
            serpSections: ['파워링크', '웹사이트', '지식스니펫'],
            adCount: 10,
        });
        expect(verdict.lane).toBe('content');
    });

    it('상품명 1개는 소음일 수 있다 — 자르지 않는다: 무료 영화 사이트 링크 모음', () => {
        const verdict = judgePlatformLane({
            keyword: '무료 영화 사이트 링크 모음',
            serpSections: ['파워링크', '웹사이트', '인기글', '지식스니펫'],
            productNames: ['어쩌다 잡힌 상품형 제목, 1개'],
            intentLabel: '거래',
        });
        expect(verdict.lane).toBe('content');
    });

    it('쇼핑 신호를 하나도 못 쟀으면 자르지 않고 미측정으로 남긴다', () => {
        // 못 본 것을 나쁜 것으로 치지 않는다 — 이 보드의 헌법이다.
        const verdict = judgePlatformLane({ keyword: '강아지치약 페피릴리프' });
        expect(verdict.lane).toBe('content');
        expect(verdict.laneReasons.join(' ')).toContain('미측정');
    });
});

describe('애드센스 적합 — 의도 실측 기반', () => {
    it('거래형은 부적합: 구매 직전 검색은 광고를 클릭하지 않는다', () => {
        const verdict = judgePlatformLane({
            keyword: '용당동 에어컨청소 가격',
            serpSections: ['파워링크', '웹사이트', '인기글'],
            intentLabel: '거래',
        });
        expect(verdict.lane).toBe('content');
        expect(verdict.adsenseFit).toBe(false);
    });

    it('정보형은 적합', () => {
        const verdict = judgePlatformLane({
            keyword: '민증사진 규칙',
            serpSections: ['AI브리핑', 'AI추천', '웹사이트'],
            intentLabel: '정보',
        });
        expect(verdict.adsenseFit).toBe(true);
    });

    it('의도 불명 + CPC 실측 있으면 CPC 가 근거가 된다', () => {
        const withCpc = judgePlatformLane({
            keyword: '백업 옵트아웃',
            intentLabel: '분류 안 됨',
            cpc: 850,
        });
        expect(withCpc.adsenseFit).toBe(true);
        expect(withCpc.adsenseReason).toContain('850');
    });

    it('의도 불명 + CPC 미측정이면 판정하지 않는다 (null)', () => {
        const verdict = judgePlatformLane({
            keyword: '구구단 멤버',
            intentLabel: '분류 안 됨',
        });
        expect(verdict.adsenseFit).toBeNull();
    });

    it('쇼핑 레인이면 애드센스 판정 자체가 무의미 — null', () => {
        const verdict = judgePlatformLane({
            keyword: '매장스피커 세라원',
            serpSections: ['쇼핑', '웹사이트'],
            intentLabel: '정보',
        });
        expect(verdict.lane).toBe('shopping');
        expect(verdict.adsenseFit).toBeNull();
    });
});

/*
 * 광고 클릭 실측(2026-09-08, 사장님 "광고 클릭률을 보는 게 중요하다"). 검색광고
 * keywordstool 이 검색량과 같이 주는 노출 광고 수·클릭률을 레인 판정 근거로 쓴다.
 * 0 은 실측(광고주 없음)이고 null 은 못 잰 것이다 — 둘을 섞지 않는다.
 */
describe('애드센스 적합 — 광고 실측', () => {
    it('노출 광고 0개면 정보형이라도 부적합: 광고주가 안 붙는 말이다', () => {
        const verdict = judgePlatformLane({ keyword: '모나크cc 날씨', intentLabel: '정보', adDepth: 0, serpSections: ['웹사이트'] });
        expect(verdict.adsenseFit).toBe(false);
        expect(verdict.adsenseReason).toContain('노출 0개');
    });

    it('노출 광고 수를 못 쟀으면(null) 정보형은 그대로 적합', () => {
        const verdict = judgePlatformLane({ keyword: '몬스테라 무름병', intentLabel: '정보', adDepth: null, serpSections: ['인기글'] });
        expect(verdict.adsenseFit).toBe(true);
    });

    it('정보형 + 클릭률 실측이 있으면 근거에 그대로 적는다', () => {
        const verdict = judgePlatformLane({
            keyword: '넷플릭스 요금제 비교', intentLabel: '정보', cpc: 410, adDepth: 14.6, adCtrMobile: 2.31, serpSections: ['웹사이트'],
        });
        expect(verdict.adsenseFit).toBe(true);
        expect(verdict.adsenseReason).toContain('광고 클릭률 2.31%');
        expect(verdict.adsenseReason).toContain('노출 광고 15개');
    });

    it('의도 불명 + CPC 낮아도 노출 광고 3개 이상이면 적합 — 광고주가 붙는 검색어다', () => {
        const verdict = judgePlatformLane({ keyword: '에어컨 청소 비용', cpc: 120, adDepth: 6, serpSections: ['웹사이트'] });
        expect(verdict.adsenseFit).toBe(true);
        expect(verdict.adsenseReason).toContain('노출 광고 6개');
    });

    it('의도 불명 + 노출 광고 1~2개 + CPC 낮음이면 여전히 판정하지 않는다', () => {
        const verdict = judgePlatformLane({ keyword: '어떤 말', cpc: 50, adDepth: 1, serpSections: ['웹사이트'] });
        expect(verdict.adsenseFit).toBeNull();
    });
});
