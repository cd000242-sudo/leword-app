import { describe, expect, it } from 'vitest';
import { adviseFromLayout } from '../serp-layout-advice';

/**
 * 실측 3건의 배치 순서(2026-08-10, Bright Data):
 *   바리깡 어원        AI브리핑 → 웹사이트 → 인기글 → 지식스니펫 → 카페 → 쇼핑 → 이미지
 *   멜라토닌 복용량     AI브리핑 → AI추천 → 인기글 → 카페 → 웹사이트 → 파워링크 → …
 *   고양이 자동화장실 렌탈 파워링크 → 쇼핑 → 지식스니펫 → 인플루언서 → 웹사이트 → 카페 → 인기글
 */
describe('adviseFromLayout — 실측 배치', () => {
    it('웹사이트가 인기글보다 위면 워드프레스 판이다', () => {
        const out = adviseFromLayout(['AI브리핑', '웹사이트', '인기글', '지식스니펫', '카페', '쇼핑', '이미지']);
        expect(out.bestFor).toBe('wordpress');
        expect(out.headline).toContain('워드프레스');
    });

    it('인기글이 위면 네이버 블로그 판이다', () => {
        const out = adviseFromLayout(['AI브리핑', 'AI추천', '인기글', '카페', '웹사이트', '파워링크']);
        expect(out.bestFor).toBe('naver-blog');
    });

    it('쇼핑이 위면 상품·제휴 판이다 — 광고가 맨 위인 것도 알려준다', () => {
        const out = adviseFromLayout(['파워링크', '쇼핑', '지식스니펫', '인플루언서', '웹사이트', '카페', '인기글']);
        expect(out.bestFor).toBe('shopping');
        expect(out.adsOnTop).toBe(true);
    });

    it('지식iN 이 블로그보다 위면 지식인 유입을 권한다', () => {
        const out = adviseFromLayout(['뉴스', '지식iN', '인기글', '웹사이트']);
        expect(out.bestFor).toBe('kin');
        expect(out.headline).toContain('지식iN');
    });
});

describe('adviseFromLayout — 세는 규칙', () => {
    it('AI 브리핑·이미지·동영상은 글을 실을 자리가 아니라 안 센다', () => {
        const out = adviseFromLayout(['AI브리핑', '이미지', '동영상', '인기글']);
        expect(out.bestFor).toBe('naver-blog');
        expect(out.ranked).toHaveLength(1);
    });

    it('같은 판이 여러 구획으로 나뉘면 제일 위 것만 센다', () => {
        const out = adviseFromLayout(['인기글', '카페', '인플루언서', '웹사이트']);
        expect(out.ranked.map((r) => r.surface)).toEqual(['naver-blog', 'wordpress']);
        expect(out.ranked[0].position).toBe(1);
    });

    it('광고가 맨 위가 아니면 adsOnTop 은 거짓이다', () => {
        expect(adviseFromLayout(['인기글', '파워링크']).adsOnTop).toBe(false);
    });

    // 못 본 것을 판정으로 바꾸지 않는다.
    it('순서를 못 읽었으면 아무 말도 하지 않는다', () => {
        expect(adviseFromLayout([]).headline).toBe('');
        expect(adviseFromLayout(null).bestFor).toBeNull();
    });

    it('실을 수 있는 자리가 하나도 없으면 판정하지 않는다', () => {
        expect(adviseFromLayout(['AI브리핑', '이미지']).bestFor).toBeNull();
    });

    it('추정 표현을 만들지 않는다', () => {
        const out = adviseFromLayout(['웹사이트', '인기글']);
        expect(out.headline).not.toMatch(/예상|확률|점수|보장|유입량/);
    });
});
