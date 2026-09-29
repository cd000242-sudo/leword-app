import { describe, expect, it } from 'vitest';
import { buildTopicBriefPolicy, normalizeBriefGoal } from '../topic-brief-policy';
import { BRIEF_FIELDS } from '../topic-briefs';

describe('weighted brief edition policy', () => {
  it('기본 회차는 17분야 전부에 배분하고 경제·비즈니스·지원금은 두 배 비중이다(2026-09-29)', () => {
    const plan = buildTopicBriefPolicy();
    expect(plan.goal).toBe(60);
    const targets = Object.fromEntries(plan.allocations.map(row => [row.field, row.desiredTarget]));
    expect(Object.keys(targets).sort()).toEqual(BRIEF_FIELDS.map(({ field }) => field).sort());
    expect(targets['지원금·복지']).toBe(6);
    expect(targets['비즈니스·소상공인']).toBe(6);
    expect(targets['경제·금융']).toBe(6);
    expect(targets['게임']).toBe(3);
    expect(targets['반려동물']).toBe(3);
    expect(plan.allocations.every(row => row.desiredTarget >= 3)).toBe(true); // 어느 분야도 비지 않는다
    expect(plan.allocations.reduce((sum, row) => sum + row.desiredTarget, 0)).toBe(60);
    expect(plan.allocations.every(row => row.targetCount === 4)).toBe(true);
  });
  it('boosts a user-selected main category without changing the edition size', () => {
    const plan = buildTopicBriefPolicy({ mainCategories: ['경제·금융'] });
    expect(plan.allocations.find(row => row.field === '경제·금융')?.desiredTarget).toBe(48);
    expect(plan.allocations.reduce((sum, row) => sum + row.desiredTarget, 0)).toBe(60);
  });
  it('uses deterministic largest remainders for all supported edition sizes', () => {
    for (let goal = 1; goal <= 100; goal++) {
      const plan = buildTopicBriefPolicy({ goal, mainCategories: ['경제·금융'], mainCategoryShare: 0.83 });
      expect(plan.allocations.reduce((sum, row) => sum + row.desiredTarget, 0)).toBe(goal);
      expect(plan.allocations.every(row => Number.isInteger(row.desiredTarget) && row.desiredTarget >= 0)).toBe(true);
    }
  });
  it('bounds counts and ignores invalid category weights without losing allocation', () => {
    expect(normalizeBriefGoal(1000)).toBe(100);
    expect(normalizeBriefGoal(0)).toBe(1);
    expect(normalizeBriefGoal(NaN)).toBe(60);
    const plan = buildTopicBriefPolicy({ weights: { '지원금·복지': 0, '경제·금융': NaN, '새 분야': 2 }, mainCategories: ['새 분야'] });
    expect(plan.allocations.find(row => row.field === '새 분야')?.desiredTarget).toBe(48);
    expect(plan.allocations.some(row => row.field === '지원금·복지')).toBe(false);
    expect(plan.allocations.reduce((sum, row) => sum + row.desiredTarget, 0)).toBe(60);
  });
  it('keeps an explicitly empty selection empty rather than silently restoring unrelated categories', () => {
    const weights = Object.fromEntries(buildTopicBriefPolicy().allocations.map(row => [row.field, 0]));
    expect(buildTopicBriefPolicy({ weights }).allocations).toEqual([]);
  });
  it('handles malformed IPC values and large finite weights without crashing or NaN quotas', () => {
    const plan = buildTopicBriefPolicy({ mainCategories: 17 as any, weights: { '지원금·복지': Number.MAX_VALUE, '경제·금융': Number.MAX_VALUE } });
    expect(plan.allocations.reduce((sum, row) => sum + row.desiredTarget, 0)).toBe(60);
    expect(buildTopicBriefPolicy({ mainCategories: [null, ' 경제·금융 '] as any }).allocations.find(row => row.field === '경제·금융')?.desiredTarget).toBe(48);
  });
});
