import { describe, expect, it } from 'vitest';
import { judgeDeadRow } from '../board-dead-rows';

/**
 * 발행 직전 죽은 행 판정 — 등급 정본(검색량÷문서수)은 의도를 볼 수 없으므로
 * 여기서 걸러야 초황금이 안 붙는다. 이월 행에도 걸린다(현재 보드의 30행이 이월 대상이다).
 *
 * 두 가지만 본다. 둘 다 근거가 행 안에 있다:
 *   ① 카드 답 검색어 — 말 모양(judgeAnswerCardKeyword) 또는 SERP 실측 구획(날씨·인물정보)
 *   ② 보강 AI 수익 판정 bad — "만족 조건이 전부 한 줄 사실"(송강 프로필 실측)
 * mixed·미판정은 살린다 — 모르는 것을 나쁜 것으로 적지 않는다.
 */
describe('죽은 행 판정', () => {
    it('카드 답 검색어는 죽었다 — 말 모양', () => {
        const verdict = judgeDeadRow({ keyword: '모나크cc 날씨' });
        expect(verdict.dead).toBe(true);
        expect(verdict.reason).toMatch(/날씨/);
    });

    it('SERP 실측 구획에 날씨·인물정보 카드가 떠 있으면 죽었다 — 말 모양이 못 잡아도', () => {
        expect(judgeDeadRow({ keyword: '송강 나이', serpSections: ['인물정보', '웹사이트'] }).dead).toBe(true);
        expect(judgeDeadRow({ keyword: '모나크 컨트리클럽', serpSections: ['날씨', '인기글'] }).dead).toBe(true);
    });

    it('수익 판정 bad 는 죽었다 — 판정문을 근거로 싣는다', () => {
        const verdict = judgeDeadRow({
            keyword: '송강 프로필',
            monetize: { verdict: 'bad', points: [{ text: "만족 조건이 전부 '한 줄 사실'이다." }] },
        });
        expect(verdict.dead).toBe(true);
        expect(verdict.reason).toContain('한 줄 사실');
    });

    it('mixed·미판정은 살린다', () => {
        expect(judgeDeadRow({ keyword: '넷플릭스 요금제 비교', monetize: { verdict: 'mixed', points: [] } }).dead).toBe(false);
        expect(judgeDeadRow({ keyword: '넷플릭스 요금제 비교' }).dead).toBe(false);
        expect(judgeDeadRow({ keyword: '넷플릭스 요금제 비교', monetize: null }).dead).toBe(false);
    });

    it('평범한 글감은 살린다 — 구획이 인기글·웹사이트뿐이어도', () => {
        expect(judgeDeadRow({ keyword: '몬스테라 무름병', serpSections: ['AI브리핑', '인기글', '웹사이트'] }).dead).toBe(false);
    });

    /*
     * 실제 보드(2026-09-07 발행)에서 카드 낱말이 든 30행. 24행 날씨 + 프로필 + 주가 = 26행은
     * 죽고, '나이' 부분일치뿐인 4행(톤틴연금 가입나이·쳇지피티 재미나이·나이스차저 ×2)은
     * 산다. 살릴 것을 죽이면 가드가 공급을 갉아먹는 쪽으로 뒤집힌다.
     */
    it('실제 보드 30행 — 26행 죽고 4행 산다', () => {
        const rows = [
            '경주cc날씨', '변산반도 날씨', '일레븐cc날씨', '오너스cc 날씨', '세현cc 날씨', '모나크cc 날씨',
            '지산cc 날씨', '로얄포레cc 날씨', '동촌cc 날씨', '진하해수욕장 날씨', '이천실크밸리cc 날씨',
            '이븐데일cc 날씨', '히든밸리cc 날씨', '비에이비스타 날씨', '통도cc날씨', '알프스대영cc 날씨',
            '왕산해수욕장 날씨', '프린세스cc 날씨', '솔트베이cc 날씨', '윈체스트cc 날씨', '비에비스타cc날씨',
            '톤틴연금 가입나이', '블랙스톤이천 날씨', '센트리움cc날씨', '스카이72cc 날씨', '쳇지피티 재미나이',
            'etl 기업 주가', '나이스차저 환경부카드', '송강 프로필', '나이스차저 요금',
        ];
        const dead = rows.filter((keyword) => judgeDeadRow({ keyword }).dead);
        const alive = rows.filter((keyword) => !judgeDeadRow({ keyword }).dead);
        expect(dead).toHaveLength(26);
        expect(alive.sort()).toEqual(['나이스차저 요금', '나이스차저 환경부카드', '쳇지피티 재미나이', '톤틴연금 가입나이'].sort());
    });

    it('광고를 뺀 첫 구획이 웹사이트면 사이트를 찾아가는 검색어다(2026-09-09 감사)', () => {
        expect(judgeDeadRow({ keyword: '라이어게임 사이트', serpSections: ['웹사이트', '인기글', '파워링크'] }).dead).toBe(true);
        expect(judgeDeadRow({ keyword: '현대자동차 견적내기', serpSections: ['파워링크', '웹사이트', '카페'] }).dead).toBe(true);
        expect(judgeDeadRow({ keyword: '농할상품권 구매처', serpSections: ['파워링크', 'AI브리핑', '카페', '인기글'] }).dead).toBe(false);
        expect(judgeDeadRow({ keyword: '상토 배양토 차이', serpSections: ['파워링크', '카페', '인기글', '웹사이트'] }).dead).toBe(false);
    });
});
