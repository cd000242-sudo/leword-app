import { describe, expect, it } from 'vitest';
import { goldenIndex } from '../golden-index';
import { GRADE_THRESHOLDS } from '../grade';

/**
 * 황금지수는 새 점수가 아니라 등급 SSoT 를 접은 것이다.
 * 여기서 임계값을 따로 쓰면 화면마다 등급이 갈리는 옛 사고가 되풀이된다.
 */
describe('goldenIndex — 등급 SSoT 를 그대로 옮긴다', () => {
    it('classic SSS 지표면 초황금이다', () => {
        const t = GRADE_THRESHOLDS.sssClassic;
        const out = goldenIndex(t.volumeMin * 6, t.docsMax / 5);
        expect(out?.tier).toBe('ultra');
        expect(out?.grade).toBe('SSS');
    });

    // 실측: 헌터 화면의 검색량 9,220 · 문서 2,856 · 비율 3.2 → SSS 비율 5 미달, SS 통과
    it('비율 3.2 는 황금이다 — 초황금 기준(5)에 못 미친다', () => {
        const out = goldenIndex(9220, 2856);
        expect(out?.tier).toBe('golden');
        expect(out?.ratio).toBeCloseTo(3.2, 1);
    });

    it('검색량이 적으면 아래로 내려간다', () => {
        expect(goldenIndex(320, 150)?.tier).toBe('fair');
        expect(goldenIndex(120, 900)?.tier).toBe('weak');
    });

    it('근거에 실측 숫자를 그대로 싣는다', () => {
        expect(goldenIndex(9220, 2856)?.reason).toContain('월 검색 9,220회에 문서 2,856개');
    });

    // 못 잰 것과 나쁜 것을 화면에서 같게 만들지 않는다.
    it('못 쟀으면 판정하지 않는다', () => {
        expect(goldenIndex(null, 100)).toBeNull();
        expect(goldenIndex(900, null)).toBeNull();
        expect(goldenIndex(900, 0)).toBeNull();
    });

    it('추정 표현을 만들지 않는다', () => {
        expect(goldenIndex(9220, 2856)?.reason).not.toMatch(/예상|확률|점수|보장/);
    });
});
