import { describe, expect, it } from 'vitest';
import { sharesSeedToken } from '../seed-drift';

/**
 * 전부 실측에서 나온 것들이다. 지어낸 예가 하나도 없다.
 * 2026-08-10 32개 주제 전량 발굴에서 실제로 후보까지 올라온 오염이다.
 */
describe('sharesSeedToken — 남의 낱말 한가운데서 걸리면 안 된다', () => {
    it("'락스' 가 '마키나락스 주가'(주식) 를 물지 않는다", () => {
        // 인테리어·DIY 주제에 주가 키워드가 올라왔던 경로다.
        expect(sharesSeedToken('마키나락스 주가', '락스')).toBe(false);
    });

    it('낱말 한가운데·끝에서 겹치는 것은 다른 말로 본다', () => {
        expect(sharesSeedToken('가마솥 밥짓기', '마솥')).toBe(false);
        expect(sharesSeedToken('아이스크림 만들기', '크림')).toBe(false);
    });

    it('한 글자 씨앗은 애초에 어절로 치지 않는다', () => {
        // '약' 이 '예약' 을 물어서 통과 144건까지 떨어졌던 사고.
        expect(sharesSeedToken('호텔 예약 취소', '약')).toBe(true);
    });
});

describe('sharesSeedToken — 같은 말은 살려야 한다', () => {
    it('뒤로 붙여 늘린 한국어는 같은 말이다', () => {
        expect(sharesSeedToken('강아지사료 추천', '강아지')).toBe(true);
        expect(sharesSeedToken('캠핑용 의자', '캠핑')).toBe(true);
    });

    it('어절이 그대로 있으면 통과한다', () => {
        expect(sharesSeedToken('라미 샤프', '샤프')).toBe(true);
        expect(sharesSeedToken('속초 해수욕장 개장일', '해수욕장')).toBe(true);
        expect(sharesSeedToken('강아지 사료 추천', '강아지 사료')).toBe(true);
    });

    it('씨앗 어절이 여러 개면 하나만 겹쳐도 된다', () => {
        expect(sharesSeedToken('풍진 예방접종 비용', '예방접종 비용')).toBe(true);
    });
});
