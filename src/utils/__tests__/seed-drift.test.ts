import { describe, expect, it } from 'vitest';
import { sharesSeedToken } from '../seed-drift';

/**
 * 전부 실측에서 나온 것들이다. 지어낸 예가 하나도 없다.
 * 2026-08-10 32개 주제 전량 발굴 + 4개 주제 재실행에서 실제로 나온 통과·이탈이다.
 */

describe('sharesSeedToken — 살려야 하는 것', () => {
    /*
     * 낱말 머리로만 인정하도록 바꿨다가 여기 있는 것들이 전부 죽었다.
     * 검색광고 연관어가 공백 없는 1어절로 오기 때문에(공기청정기필터) 확장형과
     * 낱말 경계가 안 맞고, 한국어 복합어는 뒷말이 머리말이다(강아지+사료).
     */
    it('홑말 씨앗의 띄어쓴 확장형을 살린다', () => {
        expect(sharesSeedToken('공기청정기 필터 교체주기', '공기청정기필터')).toBe(true);
        expect(sharesSeedToken('무선청소기 배터리', '무선청소기')).toBe(true);
    });

    it('복합어 꼬리에 붙은 씨앗을 살린다', () => {
        expect(sharesSeedToken('강아지사료 추천', '사료')).toBe(true);
        expect(sharesSeedToken('청소년소설추천', '소설 추천')).toBe(true);
        expect(sharesSeedToken('청소기흡입력', '무선청소기 흡입력')).toBe(true);
    });

    it('어절이 그대로 있으면 통과한다', () => {
        expect(sharesSeedToken('라미 샤프', '샤프')).toBe(true);
        expect(sharesSeedToken('풍진 예방접종 비용', '예방접종 비용')).toBe(true);
    });
});

describe('sharesSeedToken — 대소문자로 갈리면 안 된다', () => {
    it("'애니OST' 가 '애니ost 순위' 를 살린다", () => {
        // 만화·애니 주제에서 이 한 글자 차이로 정상 확장이 이탈 처리되고 있었다.
        expect(sharesSeedToken('애니ost 순위', '애니OST')).toBe(true);
        expect(sharesSeedToken('애니OST 명곡', '애니ost')).toBe(true);
    });
});

describe('sharesSeedToken — 거르는 것', () => {
    it('공유하는 어절이 없으면 다른 말로 본다', () => {
        expect(sharesSeedToken('맞춤법 검사기', '고양이 화장실')).toBe(false);
        expect(sharesSeedToken('제주도 렌터카 가격', '전동칫솔 칫솔모')).toBe(false);
    });

    it("겹치는 글자가 남의 낱말 속이어도 통과한다 — substring 의 대가다", () => {
        // '퇴직금 계산' 의 '계산' 이 '세금계산서' 속에서 걸린다. 위 '못 막는 것' 과 같은 뿌리다.
        expect(sharesSeedToken('세금계산서 발행', '퇴직금 계산')).toBe(true);
    });

    it('한 글자 씨앗은 애초에 판정 대상이 아니다', () => {
        // '약' 이 '예약' 을 물어서 통과 144건까지 떨어졌던 사고.
        expect(sharesSeedToken('호텔 예약 취소', '약')).toBe(true);
    });
});

describe('sharesSeedToken — 못 거르는 것 (알고 두는 것)', () => {
    /*
     * 여기를 "고치려" 들면 위의 '살려야 하는 것' 이 통째로 무너진다. 한 번 겪었다.
     * '강아지사료' 의 '사료' 와 '마키나락스' 의 '락스' 는 구조가 같다 —
     * 앞에 다른 말이 붙은 복합어의 꼬리다. 글자로는 구별할 방법이 없다.
     * 형태소 분석기나 SERP 실측이 있어야 풀린다.
     */
    it('복합어 속에 우연히 들어간 홑말 씨앗은 통과한다 — 아직 못 막는다', () => {
        expect(sharesSeedToken('마키나락스 주가', '락스')).toBe(true);
        expect(sharesSeedToken('덴트릭스 치약', '덴트')).toBe(true);
    });
});
