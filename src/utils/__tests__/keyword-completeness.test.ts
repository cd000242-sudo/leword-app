import { describe, expect, it } from 'vitest';
import { filterComplete, judgeCompleteness } from '../keyword-completeness';

/**
 * 사례는 전부 실주행에서 나온 실제 후보다. 지어낸 것이 없다 —
 * 30건을 하나씩 읽고 통과·탈락을 손으로 매긴 결과를 고정한 것이다.
 */
describe('judgeCompleteness — 실주행 후보로 고정', () => {
    it.each([
        '한강 캠핑장 예약 방법',
        '허리 통증 약국 약 추천',
        '국내 여행 지도 pdf',
        '강아지 사료 적정량 계산',
        '고양이 화장실 폐기 방법',
        '국내 여행 짐 리스트',
        '서울 당일치기 여행 코스 추천',
    ])('통과: %s', (keyword) => {
        expect(judgeCompleteness(keyword).complete).toBe(true);
    });

    it.each([
        ['강아지 사료 대신', '대신'],
        ['강아지 사료 상함', '상함'],
        ['강아지 사료 안먹음', '안먹음'],
    ])('조각이라 탈락: %s', (keyword, fragment) => {
        const verdict = judgeCompleteness(keyword);
        expect(verdict.complete).toBe(false);
        expect(verdict.reason).toContain(fragment);
    });

    it.each(['고양이 화장실 삽', '허리통증 침'])('한 글자로 끝나 탈락: %s', (keyword) => {
        const verdict = judgeCompleteness(keyword);
        expect(verdict.complete).toBe(false);
        expect(verdict.reason).toContain('한 글자');
    });

    it.each([
        '강아지 사료 추천 디시',
        '당일치기 여행 추천 디시',
        '강아지 사료 티어',
    ])('커뮤니티 꼬리표라 탈락: %s', (keyword) => {
        const verdict = judgeCompleteness(keyword);
        expect(verdict.complete).toBe(false);
        expect(verdict.reason).toContain('커뮤니티');
    });

    /*
     * 이 묶음이 이번 반전의 이유다.
     * 화이트리스트 시절에는 의도어 목록에 없다는 이유로 전부 잘렸다.
     * 전부 완벽한 블로그 글 주제다.
     */
    it.each([
        '허리 통증 병원',
        '당일치기 여행 코스',
        '강아지 사료 급여량',
        '허리통증 골반',
        '몬스테라 물주기',
        '고양이 화장실 개수',
    ])('멀쩡한 주제는 통과한다: %s', (keyword) => {
        expect(judgeCompleteness(keyword).complete).toBe(true);
    });

    it('주제별 의도어를 넘기면 사유에 그 말이 잡힌다', () => {
        // 블랙리스트라 둘 다 통과하지만, 의도어를 넘기면 왜 통과했는지가 분명해진다.
        expect(judgeCompleteness('몬스테라 물주기').complete).toBe(true);
        const withTails = judgeCompleteness('몬스테라 물주기', ['물주기', '분갈이']);
        expect(withTails.complete).toBe(true);
        expect(withTails.reason).toContain('물주기');
    });

    it('수치로 끝나면 구체적 질의로 본다', () => {
        expect(judgeCompleteness('신생아 수면 3개월').complete).toBe(true);
        expect(judgeCompleteness('연말정산 2026년').complete).toBe(true);
    });

    it('붙여 쓴 의도어도 잡는다', () => {
        expect(judgeCompleteness('강아지사료추천').complete).toBe(true);
    });

    it('빈 키워드는 탈락이다', () => {
        expect(judgeCompleteness('   ').complete).toBe(false);
    });
});

describe('filterComplete', () => {
    it('통과분과 탈락분을 사유와 함께 가른다', () => {
        const { kept, dropped } = filterComplete([
            { keyword: '한강 캠핑장 예약 방법' },
            { keyword: '허리 통증 병원' },
            { keyword: '고양이 화장실 삽' },
            { keyword: '강아지 사료 대신' },
        ]);
        expect(kept.map((r) => r.keyword)).toEqual(['한강 캠핑장 예약 방법', '허리 통증 병원']);
        expect(dropped).toHaveLength(2);
        // 사유가 없으면 규칙을 조정할 근거가 사라진다.
        expect(dropped.every((r) => r.reason.length > 0)).toBe(true);
    });
});

/**
 * 애드센스·제휴가 못 붙는 키워드는 발굴 단계에서 뺀다.
 *
 * 실측: 자동완성 확장에서 '야설사이트'(문학·책 주제)가 후보로 올라왔다.
 * 검색량이 있어도 이 제품이 추천할 물건이 아니고, 사장님 블로그에 실으면
 * 애드센스 정책 위반이다.
 */
describe('금지 주제', () => {
    it('성인·도박 키워드는 버린다', () => {
        for (const keyword of ['야설사이트', '무료 토토 사이트', '바카라 규칙', '음란물 차단']) {
            expect(judgeCompleteness(keyword, []).complete).toBe(false);
        }
    });

    it('멀쩡한 키워드는 그대로 통과한다', () => {
        for (const keyword of ['강아지 슬개골 수술비', '캠핑 의자 추천', '중문 설치비용']) {
            expect(judgeCompleteness(keyword, []).complete).toBe(true);
        }
    });

    // 부분 문자열 매칭이라 짧은 말은 멀쩡한 단어 속에 숨는다.
    it('다른 말 속에 든 글자를 잘못 잡지 않는다', () => {
        expect(judgeCompleteness('성인병 예방 식단', []).complete).toBe(true);
        expect(judgeCompleteness('도박중독 상담센터', []).complete).toBe(true);
    });
});
