import { describe, expect, it } from 'vitest';
import { analyzeSerp } from '../serp-winnability';

/**
 * 상위 제목 추출 회귀 시험.
 *
 * 왜 있는가 (2026-08-10 실측):
 *   네이버 신 마크업은 **작성자 이름과 글 제목이 둘 다** headline 계열 클래스를 쓴다.
 *     headline3 + weight-lg → 작성자·채널 ('홀니스랩', '인천성모병원', '의학박사 반동규')
 *     headline1 + weight-sm → 글 제목  ('멜라토닌 복용량 정확히 어떻게 드시나요?')
 *   앞에서부터 열 개를 집으면 작성자 이름이 먼저 잡힌다. '멜라토닌 복용량' 실측에서
 *   열 개가 **전부 작성자 이름**이었고, 그래서 "이 검색어를 정면으로 다룬 글이 없다"는
 *   판정이 나왔다 — 정작 1위가 정면 대응 글이었다.
 *
 * 이 게이트의 값어치가 통째로 여기에 걸려 있다.
 */

/** 실측 문서에서 따온 구조. 작성자 블록이 제목보다 앞에 온다. */
function serpHtml(entries: { author: string; title: string }[]): string {
    const blocks = entries.map(({ author, title }) => `
<div class="result">
  <span class="sds-comps-text sds-comps-text-type-headline3 sds-comps-text-weight-lg q8NHdL14jowibv2C">${author}</span>
  <span class="sds-comps-text sds-comps-text-type-headline1 sds-comps-text-weight-sm">${title}</span>
  <span class="date">3일 전</span>
</div>`).join('');
    return `<html><body>${blocks}${'<div></div>'.repeat(600)}</body></html>`;
}

describe('상위 제목 추출', () => {
    const html = serpHtml([
        { author: '홀니스랩', title: '멜라토닌 복용량 정확히 어떻게 드시나요?' },
        { author: '인천성모병원', title: '멜라토닌 효능 및 섭취 방법' },
        { author: '의학박사 반동규', title: '멜라토닌 - 나무위키' },
    ]);

    it('작성자 이름을 제목으로 세지 않는다', () => {
        const serp = analyzeSerp(html, '멜라토닌 복용량');
        expect(serp.topTitles).not.toContain('홀니스랩');
        expect(serp.topTitles).not.toContain('인천성모병원');
    });

    it('글 제목을 순서대로 뽑는다', () => {
        const serp = analyzeSerp(html, '멜라토닌 복용량');
        expect(serp.topTitles[0]).toBe('멜라토닌 복용량 정확히 어떻게 드시나요?');
    });

    // 이게 틀리면 "자리가 비었다"가 통째로 거짓이 된다.
    it('정면 대응 글이 있으면 정확 일치로 잡는다', () => {
        const serp = analyzeSerp(html, '멜라토닌 복용량');
        expect(serp.exactTitleHits).toBeGreaterThanOrEqual(1);
    });

    it('작성자만 있고 제목이 없으면 표본이 0이다 — 판정하지 않게', () => {
        const authorsOnly = `<html><body>${'<span class="sds-comps-text sds-comps-text-type-headline3 sds-comps-text-weight-lg">홀니스랩</span>'.repeat(10)}${'<div></div>'.repeat(600)}</body></html>`;
        expect(analyzeSerp(authorsOnly, '멜라토닌 복용량').sampledTitles).toBe(0);
    });
});
