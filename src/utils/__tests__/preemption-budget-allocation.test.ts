import { describe, expect, it } from 'vitest';
import { allocateBudget } from '../preemption-budget-allocation';

const pool = (n: number) => Array.from({ length: n }, (_, i) => i);
const total = (m: Map<string, number>) => [...m.values()].reduce((s, n) => s + n, 0);

describe('allocateBudget — BD 검증 몫 나누기', () => {
    it('후보가 넉넉하면 주제마다 같은 몫이다', () => {
        const out = allocateBudget(new Map([['a', pool(50)], ['b', pool(50)], ['c', pool(50)]]), 30);
        expect([...out.values()]).toEqual([10, 10, 10]);
    });

    it('후보가 몫보다 적은 주제는 가진 만큼만 쓴다', () => {
        const out = allocateBudget(new Map([['a', pool(3)], ['b', pool(50)]]), 20);
        expect(out.get('a')).toBe(3);
        expect(out.get('b')).toBe(17);
        expect(total(out)).toBe(20);
    });

    // 10-05 회차: 남은 슬롯을 목록 앞 주제(게임)가 다 가져가 스타·연예인(후보 80)은 18건에서 멈췄다.
    it('남는 슬롯은 목록 앞 주제가 독식하지 않고 미검증이 많은 주제부터 돌아가며 나눈다', () => {
        const byTopic = new Map([
            ['작음', pool(2)],
            ['게임', pool(67)],
            ['스타·연예인', pool(80)],
        ]);
        // 몫 = 30/3 = 10 → 작음 2 · 게임 10 · 스타 10, 남은 8 을 나눈다.
        const out = allocateBudget(byTopic, 30);
        expect(total(out)).toBe(30);
        expect(out.get('작음')).toBe(2);
        expect(out.get('게임')).toBe(14);
        expect(out.get('스타·연예인')).toBe(14);
    });

    it('총량은 절대 넘지 않고, 후보 전체보다 많이 배정하지도 않는다', () => {
        const byTopic = new Map([['a', pool(4)], ['b', pool(7)]]);
        expect(total(allocateBudget(byTopic, 600))).toBe(11);
        expect(total(allocateBudget(byTopic, 5))).toBe(5);
    });

    it('열쇠 순서는 입력 순서 그대로다 — 배치가 그 순서로 돈다', () => {
        const out = allocateBudget(new Map([['z', pool(1)], ['a', pool(9)], ['m', pool(5)]]), 12);
        expect([...out.keys()]).toEqual(['z', 'a', 'm']);
    });

    it('예산이 0 이거나 주제가 없으면 아무것도 배정하지 않는다', () => {
        expect(total(allocateBudget(new Map([['a', pool(5)]]), 0))).toBe(0);
        expect(allocateBudget(new Map(), 100).size).toBe(0);
    });
});
