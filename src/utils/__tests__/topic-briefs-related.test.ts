import { describe, expect, it } from 'vitest';
import { pickRelatedKeywords } from '../topic-briefs';

/**
 * 같이 넣을 말 — 본문에 함께 담을 좁은 검색어(사장님 2026-09-10
 * "확장키워드나 연관키워드도 같이 보여주면 그걸로 글 쓸 수 있게").
 * 대안 검색어와 규칙이 다르다: 대안은 핵심을 **대신할** 하나, 이건 같이 **담을** 여럿이다.
 */
const brief = { coreKeyword: '주택담보대출', keywords: ['주택담보대출', '주담대'] };

const suggest = (rows: Array<[string, number | null]>) =>
    rows.map(([keyword, totalSearchVolume]) => ({ keyword, totalSearchVolume }));

describe('같이 넣을 말 고르기', () => {
    it('검색량 큰 순으로 상한만큼 고른다', () => {
        const got = pickRelatedKeywords(brief, suggest([
            ['주택담보대출 금리', 33000],
            ['주택담보대출 한도', 12000],
            ['주담대 갈아타기', 5400],
        ]), new Map(), 6);
        expect(got.map((r) => r.keyword)).toEqual(['주택담보대출 금리', '주택담보대출 한도', '주담대 갈아타기']);
        expect(got[0].searchVolume).toBe(33000);
    });

    it('핵심 검색어를 그대로 담은 더 긴 말을 살린다 — 본문에 담기 제일 좋은 말이다', () => {
        const got = pickRelatedKeywords(brief, suggest([['주택담보대출 금리 비교', 8800]]), new Map(), 6);
        expect(got.map((r) => r.keyword)).toContain('주택담보대출 금리 비교');
    });

    it('핵심 검색어 자신은 뺀다', () => {
        const got = pickRelatedKeywords(brief, suggest([['주택담보대출', 124900], ['주택 담보 대출', 99]]), new Map(), 6);
        expect(got.map((r) => r.keyword)).not.toContain('주택담보대출');
        expect(got.map((r) => r.keyword)).not.toContain('주택 담보 대출'); // 띄어쓰기만 다른 같은 말
    });

    it('주제가 다른 말은 뺀다 — 핵심 검색어의 낱말을 하나도 안 물면 버린다', () => {
        const got = pickRelatedKeywords(brief, suggest([['제주도 맛집', 400000]]), new Map(), 6);
        expect(got).toEqual([]);
    });

    it('검색량을 못 잰 것과 너무 긴 말은 뺀다', () => {
        const got = pickRelatedKeywords(brief, suggest([
            ['주택담보대출 없음', null],
            ['주택담보대출 금리 비교 방법 총정리 안내', 5000],
        ]), new Map(), 6);
        expect(got).toEqual([]);
    });

    it('글감이 스스로 가진 검색어의 실측 검색량도 함께 본다', () => {
        // 스크립트가 만든 검색량 지도는 공백을 걷은 키를 쓴다 — 그 규칙 그대로 찾아야 한다.
        const own = new Map<string, number | null>([['주담대', 39300]]);
        const got = pickRelatedKeywords(brief, [], own, 6);
        expect(got).toEqual([{ keyword: '주담대', searchVolume: 39300 }]);
    });

    it('같은 말이 두 곳에서 와도 한 번만 넣는다', () => {
        const own = new Map<string, number | null>([['주담대', 39300]]);
        const got = pickRelatedKeywords(brief, suggest([['주담대', 39300]]), own, 6);
        expect(got.filter((r) => r.keyword === '주담대')).toHaveLength(1);
    });
});
