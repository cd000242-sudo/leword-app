import { describe, expect, it } from 'vitest';
import { classifyTitleFrame, findEmptyFrames } from '../title-forge/frame-analysis';
import { forgeTitles } from '../title-forge/forge';

/**
 * 제목 대장간 — 규칙만으로 SEO/홈판 제목 2종을 만든다.
 *
 * 핵심 계약 3개를 고정한다:
 *   1. 빈 프레임 — 1페이지 10개 제목이 이미 쓴 프레임은 피한다.
 *      같은 프레임 11번째 제목은 후킹이 아니라 배경이다.
 *   2. 낚시 가드 — 파생 키워드·시기 실측에 근거 없는 프레임은 제안하지 않는다.
 *      제목이 약속한 것을 본문이 못 주면 체류시간이 무너진다.
 *   3. 규격 — 키워드 앞자리 고정(SEO), 길이 상한(SEO 40자·홈판 38자,
 *      llm-title-writer 와 같은 규격).
 */

describe('프레임 분류 — 제목이 어떤 각도로 쓰였는가', () => {
    it('레시피 프레임', () => {
        expect(classifyTitleFrame('노각무침 황금레시피 아삭하게')).toBe('recipe');
    });
    it('방법 프레임', () => {
        expect(classifyTitleFrame('노각 손질하는법 5분 완성')).toBe('howto');
    });
    it('후기 프레임', () => {
        expect(classifyTitleFrame('에어팟 프로 내돈내산 후기')).toBe('review');
    });
    it('가격 프레임', () => {
        expect(classifyTitleFrame('문콕 수리비 얼마나 나올까')).toBe('price');
    });
    it('실수·해결 프레임', () => {
        expect(classifyTitleFrame('노각무침 물러지는 이유와 해결법')).toBe('mistake');
    });
    it('비교 프레임', () => {
        expect(classifyTitleFrame('노각무침 오이무침 차이 비교')).toBe('compare');
    });
    it('어느 것도 아니면 generic', () => {
        expect(classifyTitleFrame('오늘의 일기')).toBe('generic');
    });
});

describe('빈 프레임 찾기 — 1페이지에 없는 각도만 채택', () => {
    const serpTitles = [
        '노각무침 황금레시피 총정리',
        '노각무침 레시피 아삭하게 만들기',
        '노각무침 만드는법 5분 완성',
        '노각무침 황금레시피 이렇게',
    ];

    it('SERP 가 이미 쓴 프레임은 빈 프레임이 아니다', () => {
        const empty = findEmptyFrames(serpTitles, ['recipe', 'mistake', 'compare']);
        expect(empty).not.toContain('recipe');
        expect(empty).toContain('mistake');
        expect(empty).toContain('compare');
    });

    it('지원 프레임에 없는 것은 비어 있어도 내놓지 않는다 (낚시 가드)', () => {
        const empty = findEmptyFrames(serpTitles, ['mistake']);
        expect(empty).toEqual(['mistake']);
    });
});

describe('제목 생성 — 규격과 근거', () => {
    const input = {
        keyword: '노각무침',
        derivedKeywords: [
            { keyword: '노각무침 물러짐', searchVolume: 320 },
            { keyword: '노각무침 오이무침 차이', searchVolume: 210 },
            { keyword: '노각무침 황금레시피', searchVolume: 20870 },
        ],
        serpTitles: [
            '노각무침 황금레시피 총정리',
            '노각무침 레시피 아삭하게',
            '노각무침 만드는법',
        ],
    };

    it('SEO 제목은 키워드가 맨 앞이고 40자 이하다', () => {
        const out = forgeTitles(input);
        expect(out.seo.text.startsWith('노각무침')).toBe(true);
        expect(out.seo.text.length).toBeLessThanOrEqual(40);
    });

    it('SEO 제목의 프레임은 SERP 에 없는 빈 프레임이다', () => {
        const out = forgeTitles(input);
        expect(['mistake', 'compare']).toContain(out.seo.frame);
    });

    it('빈 프레임의 근거가 된 파생 키워드 표현이 제목에 실린다', () => {
        const out = forgeTitles(input);
        const carried = input.derivedKeywords.some((d) => {
            const extra = d.keyword.replace('노각무침', '').trim();
            return extra.length > 0 && out.seo.text.includes(extra.split(/\s+/)[0]);
        });
        expect(carried).toBe(true);
    });

    it('홈판 제목은 38자 이하다', () => {
        const out = forgeTitles(input);
        expect(out.home.text.length).toBeLessThanOrEqual(38);
        expect(out.home.text.length).toBeGreaterThanOrEqual(6);
    });

    it('파생에 근거 없는 프레임은 절대 나오지 않는다 (낚시 가드)', () => {
        const out = forgeTitles({
            keyword: '민증사진 규칙',
            derivedKeywords: [{ keyword: '민증사진 규칙 머리', searchVolume: 90 }],
            serpTitles: ['민증사진 규칙 총정리'],
        });
        // 파생·시기 어디에도 가격/일정 근거가 없다 — 그 프레임이 나오면 낚시다.
        expect(out.seo.frame).not.toBe('price');
        expect(out.seo.frame).not.toBe('schedule');
        expect(out.home.frame).not.toBe('price');
        expect(out.home.frame).not.toBe('schedule');
    });

    it('근거(basis)에 어느 실측이 이 제목을 만들었는지 적힌다', () => {
        const out = forgeTitles(input);
        expect(out.seo.basis.length).toBeGreaterThan(0);
    });
});

describe('제품 키워드 — 제품명 + 구매욕구 후킹', () => {
    it('홈판 제목에 제품명이 실리고 욕구 문구 근거가 붙는다', () => {
        const out = forgeTitles({
            keyword: '강아지치약 페피릴리프',
            derivedKeywords: [{ keyword: '강아지치약 페피릴리프 후기', searchVolume: 150 }],
            serpTitles: ['강아지 치석 관리 방법'],
            isProduct: true,
            productName: '페피릴리프',
            productSignal: '반려동물 강아지 치약',
        });
        expect(out.home.text).toContain('페피릴리프');
        expect(out.home.basis).toContain('구매');
    });
});
