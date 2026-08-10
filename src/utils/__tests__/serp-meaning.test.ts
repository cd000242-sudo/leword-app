import { describe, expect, it } from 'vitest';
import { describeSerpMeaning, readSerpMeaning } from '../serp-meaning';

/** readSerpMeaning 은 2만 자 미만을 '못 본 것'으로 본다. 실제 문서 길이를 흉내낸다. */
const pad = (body: string) => `<html><body>${body}${'<div class="filler"></div>'.repeat(1200)}</body></html>`;
const title = (text: string) => `<span class="sds-comps-text sds-comps-text-type-headline1 sds-comps-text-weight-sm">${text}</span>`;
const author = (text: string) => `<span class="sds-comps-text sds-comps-text-type-headline3 sds-comps-text-weight-lg">${text}</span>`;

describe('readSerpMeaning', () => {
    it('AI 브리핑이 인용한 글 제목을 뽑는다', () => {
        const html = pad('{"title":"밤의 호르몬 멜라토닌, 장기적으로 복용해도 괜찮을까","content":"건강칼럼 ..."}');
        expect(readSerpMeaning(html).citedTitles[0]).toContain('멜라토닌');
    });

    // 사람들이 무엇을 묻는지가 곧 "이 검색어의 뜻"이다.
    it('질문형 제목만 골라낸다', () => {
        const html = pad([
            title('멜라토닌 복용량 정확히 어떻게 드시나요?'),
            title('멜라토닌 효능 및 섭취 방법'),
        ].join(''));
        const meaning = readSerpMeaning(html);
        expect(meaning.questions).toEqual(['멜라토닌 복용량 정확히 어떻게 드시나요?']);
        expect(meaning.topTitles).toHaveLength(2);
    });

    it('작성자 이름은 제목으로 세지 않는다', () => {
        const html = pad(author('인천성모병원') + title('멜라토닌 효능 및 섭취 방법'));
        expect(readSerpMeaning(html).topTitles).toEqual(['멜라토닌 효능 및 섭취 방법']);
    });

    it('같은 제목이 여러 번 나와도 한 번만 센다', () => {
        expect(readSerpMeaning(pad(title('같은 제목입니다').repeat(3))).topTitles).toHaveLength(1);
    });

    // 못 본 것과 없는 것을 섞지 않는다.
    it('문서가 짧으면 아무것도 돌려주지 않는다', () => {
        expect(readSerpMeaning('<html>차단</html>').topTitles).toEqual([]);
    });
});

describe('describeSerpMeaning', () => {
    it('근거가 있는 줄만 쓴다', () => {
        expect(describeSerpMeaning({ citedTitles: [], questions: [], topTitles: ['가나다라마바'], productNames: [], priceMedian: null, priceSamples: 0 })).toEqual([]);
    });

    it('인용과 질문을 그대로 옮긴다', () => {
        const lines = describeSerpMeaning({
            citedTitles: ['바리캉 - 나무위키'],
            questions: ['바리깡 어원은 무엇입니까?'],
            topTitles: [], productNames: [], priceMedian: null, priceSamples: 0,
        });
        expect(lines[0]).toContain('바리캉 - 나무위키');
        expect(lines[1]).toContain('바리깡 어원은 무엇입니까?');
    });

    it('추정 표현을 만들지 않는다', () => {
        const lines = describeSerpMeaning({ citedTitles: ['가나다라마바'], questions: ['사아자차카타?'], topTitles: [], productNames: [], priceMedian: null, priceSamples: 0 });
        expect(lines.join(' ')).not.toMatch(/예상|확률|점수|보장|것으로 보인다/);
    });
});

/**
 * 상품 키워드는 "그게 뭔지"가 곧 상품 정체다.
 * 실측('강아지이발기 에이블미') — 쇼핑 카드가 '에이블미 전문가용 애견 반려동물
 * 이발기, 블랙, 1개 - 이발기' 로 상품을 그대로 알려 준다.
 */
describe('상품 정체', () => {
    it('쇼핑 카드 제목을 상품으로 잡는다', () => {
        const html = pad(title('에이블미 전문가용 애견 반려동물 이발기, 블랙, 1개 - 이발기'));
        expect(readSerpMeaning(html).productNames).toHaveLength(1);
    });

    // 쉼표만 보면 글 제목이 상품으로 둔갑한다. 실측에서 바로 걸렸다.
    it('쉼표 있는 글 제목을 상품으로 안 본다', () => {
        const html = pad(title('멜라토닌의 모든 것: 효과, 종류, 그리고 사용법'));
        expect(readSerpMeaning(html).productNames).toEqual([]);
    });

    it('가격은 중앙값으로 낸다 — 배송비 같은 이상치에 안 흔들리게', () => {
        const html = pad(['3,200원', '73,420원', '73,420원', '80,890원', '900,000원'].join(' '));
        expect(readSerpMeaning(html).priceMedian).toBe(73420);
        expect(readSerpMeaning(html).priceSamples).toBe(5);
    });

    it('표본이 적으면 가격을 말하지 않는다', () => {
        const lines = describeSerpMeaning({
            citedTitles: [], questions: [], topTitles: [],
            productNames: [], priceMedian: 73420, priceSamples: 2,
        });
        expect(lines).toEqual([]);
    });
});
