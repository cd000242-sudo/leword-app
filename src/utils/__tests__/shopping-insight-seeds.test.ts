import { describe, expect, it } from 'vitest';
import {
    SHOPPING_CATEGORIES, chunkHintKeywords, parseShoppingRanks, shoppingRankBody, shoppingSourceTag, shoppingTopicOfSource,
} from '../shopping-insight-seeds';
import { NAVER_BLOG_TOPICS } from '../naver-blog-topics';

/** 쇼핑인사이트 씨앗 창구(2026-09-09) — 분야↔주제, 요청 본문, 응답 파싱, hintKeywords 묶음. */
describe('SHOPPING_CATEGORIES', () => {
    it('분야마다 실존 블로그 주제 하나를 가리키고 cid 가 겹치지 않는다', () => {
        const labels = new Set(NAVER_BLOG_TOPICS.map((t) => t.label));
        for (const c of SHOPPING_CATEGORIES) expect(labels.has(c.topic), c.name + '→' + c.topic).toBe(true);
        expect(new Set(SHOPPING_CATEGORIES.map((c) => c.cid)).size).toBe(SHOPPING_CATEGORIES.length);
        expect(SHOPPING_CATEGORIES.some((c) => c.cid === '50000010')).toBe(false); // 도서는 비어 온다(실측)
    });
    it('출처 꼬리표 → 주제', () => {
        expect(shoppingSourceTag('50000008')).toBe('shopping:50000008');
        expect(shoppingTopicOfSource('shopping:50000003')).toBe('IT·컴퓨터');
        expect(shoppingTopicOfSource('shopping:99')).toBeNull();
        expect(shoppingTopicOfSource('biztp:3')).toBeNull();
    });
});

describe('shoppingRankBody', () => {
    it('어제까지 7일, 20건, 화면과 같은 인자', () => {
        const body = shoppingRankBody('50000000', 2, new Date('2026-09-09T03:00:00Z'));
        const p = new URLSearchParams(body);
        expect(p.get('cid')).toBe('50000000');
        expect(p.get('startDate')).toBe('2026-09-02');
        expect(p.get('endDate')).toBe('2026-09-08');
        expect(p.get('page')).toBe('2');
        expect(p.get('count')).toBe('20');
        expect(p.get('timeUnit')).toBe('date');
    });
});

describe('parseShoppingRanks · chunkHintKeywords', () => {
    it('ranks 배열에서 순위·키워드만, 깨지면 빈 배열', () => {
        const rows = parseShoppingRanks(JSON.stringify({ ranks: [{ rank: 1, keyword: '원피스', linkId: 'x' }, { rank: 2, keyword: ' 트위드 자켓 ' }, { rank: 3, keyword: '' }] }));
        expect(rows).toEqual([{ rank: 1, keyword: '원피스' }, { rank: 2, keyword: '트위드 자켓' }]);
        expect(parseShoppingRanks('<html>')).toEqual([]);
    });
    it('hintKeywords 는 5개씩, 공백 없이, 15자 넘는 것은 뺀다', () => {
        const chunks = chunkHintKeywords(['원피스', '트위드 자켓', '트위드자켓', '가나다라마바사아자차카타파하가나', 'a', '냉장고', '정수기', '비데', '수건']);
        expect(chunks[0]).toEqual(['원피스', '트위드자켓', '냉장고', '정수기', '비데']);
        expect(chunks[1]).toEqual(['수건']);
    });
});
