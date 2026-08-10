import { describe, expect, it } from 'vitest';
import { judgeEarlyMover } from '../early-mover';

/**
 * "이슈가 되는 중인데 아직 사람들이 잘 모르는" 키워드.
 * 자리가 빈 이유가 '관심이 없어서'인지 '아직 못 채서'인지를 가르는 판정이다.
 */
function base(overrides = {}) {
    return {
        shape: 'rising' as const,
        searchVolume: 900,
        documentCount: 120,
        inRealtimeNow: false,
        firstSeenAt: new Date(Date.now() - 6 * 3_600_000).toISOString(),
        hasAiBriefing: false,
        ...overrides,
    };
}

describe('judgeEarlyMover', () => {
    it('네 조건을 다 만족하면 선점 적기다', () => {
        const result = judgeEarlyMover(base());
        expect(result.early).toBe(true);
        expect(result.reasons).toHaveLength(5);
        expect(result.missing).toEqual([]);
    });

    it('수요가 안 오르면 아니다', () => {
        const result = judgeEarlyMover(base({ shape: 'evergreen' }));
        expect(result.early).toBe(false);
        expect(result.missing).toContain('수요가 오르는 중이 아니다');
    });

    // 이미 퍼진 말은 선점이 아니다. 실시간 검색어에 있으면 남들도 다 본다.
    it('실시간 검색어에 이미 있으면 아니다', () => {
        expect(judgeEarlyMover(base({ inRealtimeNow: true })).early).toBe(false);
    });

    it('문서가 검색량만큼 있으면 밭이 찬 것이다', () => {
        const result = judgeEarlyMover(base({ searchVolume: 900, documentCount: 800 }));
        expect(result.early).toBe(false);
        expect(result.missing).toContain('밭이 이미 채워져 있다');
    });

    it('게이트 하한(비율 1)만 넘겨서는 부족하다 — 2배는 돼야 한다', () => {
        expect(judgeEarlyMover(base({ searchVolume: 300, documentCount: 200 })).early).toBe(false);
        expect(judgeEarlyMover(base({ searchVolume: 400, documentCount: 200 })).early).toBe(true);
    });

    // 브리핑이 답을 대신하면 자리를 선점해도 클릭이 안 온다.
    it('AI 브리핑이 떠 있으면 선점 적기가 아니다', () => {
        const result = judgeEarlyMover(base({ hasAiBriefing: true }));
        expect(result.early).toBe(false);
        expect(result.missing).toContain('AI 브리핑이 답을 대신한다');
    });

    it('브리핑을 못 쟀으면 단정하지 않는다', () => {
        expect(judgeEarlyMover(base({ hasAiBriefing: undefined })).early).toBe(false);
    });

    it('오래전부터 있던 말이면 새로 생긴 게 아니다', () => {
        const old = new Date(Date.now() - 30 * 24 * 3_600_000).toISOString();
        expect(judgeEarlyMover(base({ firstSeenAt: old })).early).toBe(false);
    });

    // 못 잰 것을 만족으로 세면 근거 없이 "지금 들어가면 먹는다"고 말하게 된다.
    it('못 잰 값은 만족으로 세지 않는다', () => {
        expect(judgeEarlyMover(base({ shape: null })).early).toBe(false);
        expect(judgeEarlyMover(base({ documentCount: null })).early).toBe(false);
        expect(judgeEarlyMover(base({ firstSeenAt: null })).early).toBe(false);
    });

    it('근거 문장에 실측 숫자를 그대로 싣는다', () => {
        expect(judgeEarlyMover(base()).reasons.join(' ')).toContain('검색 900회에 글이 120개뿐이다');
    });

    it('추정 표현을 만들지 않는다', () => {
        const all = [...judgeEarlyMover(base()).reasons, ...judgeEarlyMover(base({ shape: null })).missing].join(' ');
        expect(all).not.toMatch(/예상|확률|점수|보장|것으로 보인다/);
    });
});
