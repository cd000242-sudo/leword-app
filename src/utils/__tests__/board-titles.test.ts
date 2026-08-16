import { describe, expect, it } from 'vitest';
import { siblingDerivedKeywords, buildBoardTitles } from '../title-forge/board-titles';

/**
 * 보드 행 → 제목 배선.
 *
 * 대장간의 파생 키워드는 새 API 호출이 아니라 **같은 회차에서 이미 실측한
 * 같은 주제 후보들**에서 얻는다 — 같은 씨앗 형제 우선, 없으면 어절 공유.
 * 8/14 실회차 스모크에서 파생 없이는 전부 generic 으로 떨어지는 것을 확인했다.
 * 이 배선이 그 공백을 메운다(추가 비용 0).
 */

const topicCandidates = [
    { keyword: '노각무침 황금레시피', searchVolume: 20870, seed: '노각무침' },
    { keyword: '노각무침 물러짐', searchVolume: 320, seed: '노각무침' },
    { keyword: '노각무침 오이무침 차이', searchVolume: 210, seed: '노각무침' },
    { keyword: '수비드 머신 온도', searchVolume: 500, seed: '수비드 머신' },
];

describe('형제 파생 키워드 선별', () => {
    it('같은 씨앗 형제를 자기 자신 빼고 돌려준다', () => {
        const derived = siblingDerivedKeywords('노각무침 황금레시피', '노각무침', topicCandidates);
        const keywords = derived.map((d) => d.keyword);
        expect(keywords).toContain('노각무침 물러짐');
        expect(keywords).toContain('노각무침 오이무침 차이');
        expect(keywords).not.toContain('노각무침 황금레시피');
        expect(keywords).not.toContain('수비드 머신 온도');
    });

    it('씨앗 정보가 없으면 어절 공유로 형제를 찾는다', () => {
        const derived = siblingDerivedKeywords('노각무침 황금레시피', null,
            topicCandidates.map((c) => ({ ...c, seed: null })));
        expect(derived.map((d) => d.keyword)).toContain('노각무침 물러짐');
        expect(derived.map((d) => d.keyword)).not.toContain('수비드 머신 온도');
    });
});

describe('보드 행 제목 생성', () => {
    it('형제 실측 덕에 generic 이 아닌 빈 프레임 제목이 나온다', () => {
        const titles = buildBoardTitles(
            { keyword: '노각무침 황금레시피', seed: '노각무침', timing: '' },
            topicCandidates,
            ['노각무침 황금레시피 총정리', '노각무침 레시피 아삭하게', '노각무침 만드는법'],
        );
        expect(titles.seo.text.startsWith('노각무침 황금레시피')).toBe(true);
        expect(['mistake', 'compare']).toContain(titles.seo.frame);
        expect(titles.seo.text.length).toBeLessThanOrEqual(40);
        expect(titles.home.text.length).toBeLessThanOrEqual(38);
    });

    it('형제가 없으면 낚시 가드대로 generic 으로 남는다', () => {
        const titles = buildBoardTitles(
            { keyword: '민증사진 규칙', seed: null, timing: '' },
            [{ keyword: '민증사진 규칙', searchVolume: 1090, seed: null }],
            ['민증사진 규칙 총정리'],
        );
        expect(titles.seo.frame).toBe('generic');
    });
});
