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
        expect(describeSerpMeaning({ citedTitles: [], questions: [], topTitles: ['가나다라마바'] })).toEqual([]);
    });

    it('인용과 질문을 그대로 옮긴다', () => {
        const lines = describeSerpMeaning({
            citedTitles: ['바리캉 - 나무위키'],
            questions: ['바리깡 어원은 무엇입니까?'],
            topTitles: [],
        });
        expect(lines[0]).toContain('바리캉 - 나무위키');
        expect(lines[1]).toContain('바리깡 어원은 무엇입니까?');
    });

    it('추정 표현을 만들지 않는다', () => {
        const lines = describeSerpMeaning({ citedTitles: ['가나다라마바'], questions: ['사아자차카타?'], topTitles: [] });
        expect(lines.join(' ')).not.toMatch(/예상|확률|점수|보장|것으로 보인다/);
    });
});
