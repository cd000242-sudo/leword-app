import { describe, expect, it } from 'vitest';
import {
    addWatchKeywords, appendPoint, isWatchDue, judgeWatchChange, lastMeasuredPoint, removeWatchKeyword, summarizeWatch,
    type WatchEntry, type WatchPoint,
} from '../seat-watch';

/** 자리 감시 — 변화 판정·기한·목록 다루기(순수). 알림은 핸들러가 changed 만 보고 보낸다. */
const at = (day: number, verdict: WatchPoint['verdict'], facing: number | null = 5, extra: Partial<WatchPoint> = {}): WatchPoint => ({
    measuredAt: `2026-09-${String(day).padStart(2, '0')}T20:00:00.000Z`, verdict, facing, vacancy: null, ads: 0, cards: [], ...extra,
});

describe('judgeWatchChange', () => {
    it('첫 실측은 변화가 아니라 기준선이다', () => {
        expect(judgeWatchChange(null, at(1, '열림', 0)).changed).toBe(false);
    });
    it('잠김 → 열림은 알린다', () => {
        const r = judgeWatchChange(at(1, '잠김', 9), at(2, '열림', 0));
        expect(r).toMatchObject({ changed: true, kind: 'opened' });
        expect(r.message).toContain('열렸다');
    });
    it('카드답 → 열림도 열린 것이다', () => {
        expect(judgeWatchChange(at(1, '카드답', 2), at(2, '열림', 0)).kind).toBe('opened');
    });
    it('열림 → 잠김은 닫힘', () => {
        expect(judgeWatchChange(at(1, '열림', 0), at(2, '잠김', 8)).kind).toBe('closed');
    });
    it('반열림에서 정면 글이 3개 이하로 줄면 알린다', () => {
        expect(judgeWatchChange(at(1, '반열림', 5), at(2, '반열림', 3)).kind).toBe('facing-drop');
    });
    it('못 잰 회차(차단)는 변화 판정에 안 쓴다', () => {
        expect(judgeWatchChange(at(1, '잠김'), at(2, '자료없음', null, { unmeasured: true })).changed).toBe(false);
    });
    it('그대로면 조용하다', () => {
        expect(judgeWatchChange(at(1, '잠김', 9), at(2, '잠김', 10)).changed).toBe(false);
    });
});

describe('lastMeasuredPoint · appendPoint · summarizeWatch', () => {
    const entry: WatchEntry = { keyword: '전주 한옥마을 주차', addedAt: '2026-09-01T00:00:00.000Z', history: [] };
    it('차단 회차는 건너뛰고 마지막 실측을 찾는다', () => {
        const e = appendPoint(appendPoint(entry, at(1, '잠김', 9)), at(2, '자료없음', null, { unmeasured: true }));
        expect(lastMeasuredPoint(e)?.verdict).toBe('잠김');
    });
    it('이력은 keep 개까지만 남고 원본은 안 바뀐다', () => {
        let e = entry;
        for (let d = 1; d <= 40; d += 1) e = appendPoint(e, at((d % 28) + 1, '잠김'), 30);
        expect(e.history).toHaveLength(30);
        expect(entry.history).toHaveLength(0);
    });
    it('요약은 지금 판정·열림 연속 일수·최근 띠를 준다', () => {
        let e = entry;
        for (const v of ['잠김', '잠김', '열림', '열림', '열림'] as const) e = appendPoint(e, at(1, v, v === '열림' ? 1 : 8));
        const s = summarizeWatch(e, 3);
        expect(s.current).toBe('열림');
        expect(s.openStreak).toBe(3);
        expect(s.timeline).toEqual(['열림', '열림', '열림']);
    });
});

describe('isWatchDue', () => {
    const now = new Date(2026, 8, 9, 6, 30); // 현지 06:30
    it('오늘 05시가 지났고 아직 안 돌았으면 돌 차례', () => {
        expect(isWatchDue(null, now)).toBe(true);
        expect(isWatchDue(new Date(2026, 8, 8, 5, 10).toISOString(), now)).toBe(true);
    });
    it('오늘 05시 이후에 이미 돌았으면 아니다', () => {
        expect(isWatchDue(new Date(2026, 8, 9, 5, 5).toISOString(), now)).toBe(false);
    });
    it('05시 전이면 아직 아니다', () => {
        expect(isWatchDue(null, new Date(2026, 8, 9, 3, 0))).toBe(false);
    });
});

describe('addWatchKeywords · removeWatchKeyword', () => {
    it('공백만 다른 중복은 안 넣고, 짧은 것은 버린다', () => {
        const base: WatchEntry[] = [{ keyword: '캠핑 화로대 추천', addedAt: 'x', history: [] }];
        const { entries, added } = addWatchKeywords(base, ['캠핑화로대 추천', '전주 한옥마을 주차', 'ㅁ']);
        expect(added).toEqual(['전주 한옥마을 주차']);
        expect(entries).toHaveLength(2);
        expect(removeWatchKeyword(entries, '캠핑화로대추천')).toHaveLength(1);
    });
});
