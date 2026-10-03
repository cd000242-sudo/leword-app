import { describe, expect, it } from 'vitest';
import { siblingDerivedKeywords, buildBoardTitles, repairBoardTitles, isBoardTitleSafe, sharesTopic } from '../title-forge/board-titles';

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

    it('후기·대출·부작용 또는 넓은 씨앗이 같아도 다른 대상은 섞지 않는다', () => {
        expect(siblingDerivedKeywords('커브론 방석 부작용', '건강', [
            { keyword: '미희주사 부작용', seed: '건강', searchVolume: 9000 },
            { keyword: '커브론 방석 사용법', seed: '건강', searchVolume: 100 },
        ]).map((item) => item.keyword)).toEqual(['커브론 방석 사용법']);
        expect(siblingDerivedKeywords('크플 대출 후기', '대출', [
            { keyword: '리드코프 대출 후기', seed: '대출', searchVolume: 9000 },
        ])).toEqual([]);
        expect(sharesTopic('2026 근로장려금 신청', '근로장려금 지급일')).toBe(true);
        expect(sharesTopic('지원금 신청 조건', '지원금 신청 방법')).toBe(false);
    });

    it('청년·소상공인이라는 대상 집단이 같아도 다른 지원 제도를 섞지 않는다', () => {
        expect(sharesTopic('청년 도약계좌 조건', '청년 월세지원 신청')).toBe(false);
        expect(sharesTopic('소상공인 정책자금 신청', '소상공인 배달비 지원금')).toBe(false);
        expect(sharesTopic('청년 도약계좌 조건', '청년 도약계좌 신청 방법')).toBe(true);
        expect(sharesTopic('청년내일저축계좌 조건', '청년내일저축계좌 신청')).toBe(true);
        expect(sharesTopic('소상공인 정책자금 신청', '소상공인 정책자금 금리')).toBe(true);
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
        expect(titles.seo.text).toBe('');
        expect(titles.home.text).toBe('');
        expect(titles.seo.basis).toContain('제목 제안 보류');
    });

    it('후기 검색 수요를 작성자의 실제 사용 경험으로 바꾸지 않는다', () => {
        const titles = buildBoardTitles({ keyword: '크플 대출 후기', seed: '대출' }, [
            { keyword: '리드코프 대출 후기', seed: '대출', searchVolume: 5000 },
        ], ['크플 대출 후기 모음']);
        expect(titles.seo.frame).toBe('review');
        expect(titles.seo.text).toContain('크플 대출 후기');
        expect(titles.seo.text + titles.home.text).not.toMatch(/리드코프|직접|써본|내돈내산/);
        expect(titles.seo.basis).toContain('동일 유형 1개');
        expect(titles.seo.basis).not.toContain('없는 프레임');
    });

    it('검색 의도가 없는 다른 대상의 일반형 제목은 빈 제목으로 보류한다', () => {
        const titles = buildBoardTitles({ keyword: '커브론 방석 부작용' }, [
            { keyword: '미희주사 부작용', searchVolume: 5000 },
        ], []);
        expect(titles.seo.text).toBe('');
        expect(titles.home.text).toBe('');
    });

    it('누적 보드의 옛 일반형과 허위 체험 제목을 API 호출 없이 교정한다', () => {
        const generic = repairBoardTitles({ keyword: '커브론 방석 부작용' }, [], [], {
            seo: { text: '커브론 방석 부작용 미희주사 어떤 정보가 있는지', frame: 'generic', basis: 'legacy' },
        });
        expect(generic.seo.text).toBe('');
        const experience = repairBoardTitles({ keyword: '크플 대출 후기' }, [], [], {
            seo: { text: '크플 대출 후기 리드코프 직접 써본 기록', frame: 'ai', basis: 'legacy' },
        });
        expect(experience.seo.text).not.toMatch(/리드코프|직접|써본/);
        expect(isBoardTitleSafe('크플 대출 후기 내돈내산')).toBe(false);
    });

    it('정상 AI 제목은 유지한다', () => {
        const previous = { text: '근로장려금 신청 방법 서류를 준비하는 순서', frame: 'ai', basis: '출처 근거 AI 작성' };
        const titles = repairBoardTitles({ keyword: '근로장려금 신청 방법' }, [], [], { seo: previous });
        expect(titles.seo).toEqual(previous);
    });

    it('AI 제목에도 다른 후보의 대상명이 섞이면 유지하지 않는다', () => {
        const titles = repairBoardTitles({ keyword: '크플 대출 후기' }, [
            { keyword: '리드코프 대출 후기', searchVolume: 9000 },
        ], [], {
            seo: { text: '크플 대출 후기 리드코프 금리를 비교할 기준', frame: 'ai', basis: 'legacy' },
        });
        expect(titles.seo.text).not.toContain('리드코프');
        expect(titles.seo.frame).toBe('review');
    });

    it.each(['해봤어요', '써봤어요', '사용했어요', '방문했어요', '신청해 봤더니', '구매했습니다', '써본 후기'])('직접이라는 말이 없는 %s도 체험 근거 없이 보존하지 않는다', (ending) => {
        const title = `아이 구내염 빨리 낫는법 이렇게 ${ending}`;
        expect(isBoardTitleSafe(title)).toBe(false);
        const repaired = repairBoardTitles({ keyword: '아이 구내염 빨리 낫는법' }, [], [], {
            home: { text: title, frame: 'ai', basis: 'legacy' },
        });
        expect(repaired.home.text).not.toBe(title);
    });

    it('경험을 지어내지 않는 사용 방법은 막지 않는다', () => {
        expect(isBoardTitleSafe('정책자금 직접 신청하는 방법과 서류')).toBe(true);
    });
});
