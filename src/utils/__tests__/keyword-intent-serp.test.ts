import { describe, expect, it } from 'vitest';
import { classifySearchIntent, resolveIntentFromSerp } from '../keyword-intent';

/**
 * 어휘로는 대부분이 '분류 안 됨' 으로 떨어진다 — '강아지 사료'·'제주 애월 카페'처럼
 * 의도어 없이 명사만 있는 키워드가 실제 후보의 다수다. 그때 화면에 실제로 뜬
 * 구획을 읽는다. 추론이 아니라 네이버가 그 검색어에 무엇을 내놨는지의 실측이다.
 */
describe('resolveIntentFromSerp', () => {
    it('쇼핑 구획이 뜨면 구매 검토로 본다', () => {
        const result = resolveIntentFromSerp(classifySearchIntent('강아지 사료'), ['쇼핑']);
        expect(result.intentLabel).toBe('구매 검토');
        expect(result.source).toBe('serp');
    });

    it('무엇을 보고 그렇게 판정했는지 남긴다', () => {
        const result = resolveIntentFromSerp(classifySearchIntent('강아지 사료'), ['쇼핑']);
        expect(result.matched).toContain('쇼핑 구획');
    });

    it('광고만 붙으면 거래로 본다 — 상품이 아니라 신청·예약에 돈을 쓴다', () => {
        const result = resolveIntentFromSerp(classifySearchIntent('강남 필라테스'), ['파워링크']);
        expect(result.intentLabel).toBe('거래');
    });

    it('쇼핑과 광고가 같이 뜨면 구매 검토가 이긴다', () => {
        const result = resolveIntentFromSerp(classifySearchIntent('무선 이어폰'), ['파워링크', '쇼핑']);
        expect(result.intentLabel).toBe('구매 검토');
    });

    // 실측: '멜라토닌 복용량' — 질문 20건 + 광고 1건. 광고를 앞세우면 거래형으로 잘못 부른다.
    it('질문 구획과 광고가 같이 뜨면 정보가 이긴다', () => {
        const result = resolveIntentFromSerp(classifySearchIntent('멜라토닌 복용량'), ['지식iN', '카페', '파워링크']);
        expect(result.intentLabel).toBe('정보');
    });

    it('묻고 답하는 구획만 있으면 정보로 본다', () => {
        const result = resolveIntentFromSerp(classifySearchIntent('아이 열'), ['지식iN', '카페']);
        expect(result.intentLabel).toBe('정보');
    });

    // 어휘 판정이 이미 났으면 건드리지 않는다. 검색자가 쓴 말이 더 직접적인 증거다.
    it('어휘로 이미 분류됐으면 그대로 둔다', () => {
        const lexical = classifySearchIntent('공기청정기 추천');
        const result = resolveIntentFromSerp(lexical, ['지식iN']);
        expect(result.intentLabel).toBe('구매 검토');
        expect(result.source).toBe('lexical');
    });

    // 못 본 것과 없는 것을 섞지 않는다.
    it('구획을 못 읽었으면 분류 안 됨 그대로다', () => {
        expect(resolveIntentFromSerp(classifySearchIntent('강아지 사료'), []).intentLabel).toBe('분류 안 됨');
        expect(resolveIntentFromSerp(classifySearchIntent('강아지 사료'), null).source).toBe('none');
    });

    it('인플루언서 구획만으로는 의도를 단정하지 않는다', () => {
        expect(resolveIntentFromSerp(classifySearchIntent('강아지 사료'), ['인플루언서']).intentLabel)
            .toBe('분류 안 됨');
    });
});

/**
 * 이 보강이 실제로 '분류 안 됨' 을 줄이는지 확인한다.
 * 줄지 않으면 만들 이유가 없던 모듈이다.
 */
describe('명사형 키워드 실적', () => {
    const nounKeywords = [
        '강아지 사료', '제주 애월 카페', '노트북 거치대', '아이 감기',
        '전주 한옥마을', '무선 청소기', '아기 이유식', '캠핑 의자',
    ];

    it('어휘만으로는 대부분 분류가 안 된다', () => {
        const unknown = nounKeywords.filter((k) => classifySearchIntent(k).intent === 'unknown');
        expect(unknown.length).toBeGreaterThanOrEqual(6);
    });

    it('구획을 읽으면 대부분 분류된다', () => {
        const resolved = nounKeywords.filter(
            (k) => resolveIntentFromSerp(classifySearchIntent(k), ['쇼핑', '파워링크']).intent !== 'unknown',
        );
        expect(resolved.length).toBe(nounKeywords.length);
    });
});
