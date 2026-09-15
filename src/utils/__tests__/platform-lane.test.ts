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

/*
 * 실용 말의 늦은 쇼핑 구획(2026-09-15, 사장님 "실용 말은 3번째 이후 쇼핑이면 안 넘기기").
 * 쇼핑 구획 증거가 위치를 안 봐서, 검색자가 정보 · 비교 · 거래를 묻는데 화면 아래쪽에 쇼핑이 붙은 말까지
 * 상품판으로 넘어갔다(이 PC 인테리어·DIY 회차 5개 · 사이트 판 4개). 구획 배열은 2026-09-15 이 PC 크로미엄 실측 그대로다.
 * 상품명 카드 2건 · 스마트블록 쇼핑 증거는 위 테스트(슬로벨라 혈압약 가격 · 무선청소기 추천)가 그대로 지킨다.
 */
describe('실용 말 — 쇼핑 구획이 3번째 이후면 쇼핑 레인으로 넘기지 않는다', () => {
    it('정보 의도 + 쇼핑 6번째면 콘텐츠: 파비플로라 효능', () => {
        const verdict = judgePlatformLane({
            keyword: '파비플로라 효능',
            serpSections: ['파워링크', '인기글', '지식iN', '인플루언서', 'AI추천', '쇼핑', '이미지', '지식스니펫', '카페', '웹사이트', '뉴스', '동영상'],
            productNames: [],
            intentLabel: '정보',
        });
        expect(verdict.lane).toBe('content');
        expect(verdict.laneReasons.join(' ')).toContain('6번째');
        expect(verdict.laneReasons.join(' ')).toContain('정보');
        expect(verdict.laneReasons.join(' ')).not.toContain('상품판이다');
        expect(verdict.adsenseFit).toBe(true);
    });

    it('비교 의도 + 쇼핑 8번째(맨 끝)면 콘텐츠: 육우 한우 차이', () => {
        const verdict = judgePlatformLane({
            keyword: '육우 한우 차이',
            serpSections: ['AI브리핑', '웹사이트', '파워링크', '지식스니펫', '카페', '인플루언서', '인기글', '쇼핑'],
            productNames: [],
            intentLabel: '구매 검토',
        });
        expect(verdict.lane).toBe('content');
        expect(verdict.laneReasons.join(' ')).toContain('8번째');
    });

    it('경계 — 거래 의도 + 쇼핑 3번째도 콘텐츠: 26년 건고추 가격 1근', () => {
        const verdict = judgePlatformLane({
            keyword: '26년 건고추 가격 1근',
            serpSections: ['파워링크', '웹사이트', '쇼핑', '지식스니펫', '인플루언서', '인기글', '카페', '동영상', '이미지'],
            productNames: [],
            intentLabel: '거래',
        });
        expect(verdict.lane).toBe('content');
        expect(verdict.adsenseFit).toBe(false);
    });

    it('이번 실측의 나머지 실용 말 5개도 전부 콘텐츠', () => {
        const measured: Array<[string, string[]]> = [
            ['LED전등교체방법 셀프', ['파워링크', 'AI브리핑', '지식스니펫', '인기글', '카페', '웹사이트', '쇼핑', '이미지', '인플루언서', '지식iN']],
            ['슬로벨라 효능', ['파워링크', '웹사이트', '카페', '인기글', '지식스니펫', '지식iN', '쇼핑', '이미지']],
            ['기안84 그림 가격', ['웹사이트', '파워링크', '지식스니펫', '카페', '인기글', '이미지', '쇼핑']],
            ['네오메타 청소기 가격', ['파워링크', 'AI브리핑', '웹사이트', '인기글', '쇼핑', '지식스니펫', '인플루언서']],
            ['야간문 야관문 효능', ['파워링크', 'AI브리핑', 'AI추천', '인플루언서', '인기글', '지식스니펫', '웹사이트', '쇼핑', '이미지', '지식iN']],
        ];
        for (const [keyword, serpSections] of measured) {
            expect(judgePlatformLane({ keyword, serpSections, productNames: [] }).lane, keyword).toBe('content');
        }
    });

    it('실용 말이라도 쇼핑이 2번째면 그대로 쇼핑: 위프 탈취제 내돈내산 · 사돈 추석 선물 추천', () => {
        const measured: Array<[string, string[]]> = [
            ['위프 탈취제 내돈내산', ['파워링크', '쇼핑', '지식스니펫', '카페', '인기글', '웹사이트']],
            ['사돈 추석 선물 추천', ['파워링크', '쇼핑', '지식스니펫', '인플루언서', '인기글', '카페', '웹사이트']],
        ];
        for (const [keyword, serpSections] of measured) {
            const verdict = judgePlatformLane({ keyword, serpSections, productNames: [], intentLabel: '구매 검토' });
            expect(verdict.lane, keyword).toBe('shopping');
            expect(verdict.laneReasons.join(' ')).toContain('2번째 구획이 쇼핑');
        }
    });

    it('어휘로 분류 안 되는 말은 구획으로 다시 정한 라벨이 와도 그대로 쇼핑: 다이소 벽지 얼룩 제거', () => {
        // 배치는 '분류 안 됨' + 쇼핑 구획을 '구매 검토'로 다시 정해 넘긴다 — 그 라벨을 보면 상품명까지 풀린다.
        const verdict = judgePlatformLane({
            keyword: '다이소 벽지 얼룩 제거',
            serpSections: ['파워링크', 'AI브리핑', '카페', '인기글', '웹사이트', '쇼핑', '지식스니펫', '지식iN', '인플루언서'],
            productNames: [],
            intentLabel: '구매 검토',
        });
        expect(verdict.lane).toBe('shopping');
        expect(verdict.laneReasons.join(' ')).toContain('6번째 구획이 쇼핑');
    });
});
