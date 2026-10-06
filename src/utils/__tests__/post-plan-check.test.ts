/**
 * 설계실 3차 진행기 — 결과 칸 시작 · 차례가 된 날만 순위 재기 · 홈판 유입 갱신(2026-10-06).
 */
import { describe, expect, it, vi } from 'vitest';
import { checkPlanResult, startResult } from '../../main/post-plan-service';
import type { PostPlan } from '../post-plan/post-plan-model';

const DAY = 86400000;
const T0 = Date.parse('2026-10-06T00:00:00Z');
const plan: PostPlan = {
  id: 'plan-1', keyword: '부활남 무대인사', createdAt: '2026-10-06T00:00:00Z', updatedAt: '2026-10-06T00:00:00Z',
  steps: {
    judge: { ok: true, data: { searchVolume: 2340, documentCount: 812, seat: { verdict: '반열림', facing: 1, vacancy: 7, topTitles: [] }, range: { verdict: 'in', reason: '' } } },
    inflow: { ok: true, data: { postUrl: 'https://blog.naver.com/leader_248/224427462115', postTitle: '부활남 무대인사 일정' } },
  },
};

describe('startResult', () => {
  it('글 주소를 넣은 순간을 기준으로 결과 칸을 만들고, 고를 때 판정을 함께 박아 둔다', () => {
    const next = startResult(plan, T0);
    const r: any = next.steps.result?.data;
    expect(r.registeredAt).toBe(new Date(T0).toISOString());
    expect(r.postUrl).toBe('https://blog.naver.com/leader_248/224427462115');
    expect(r.pick).toEqual({ seat: '반열림', facing: 1, searchVolume: 2340, range: 'in' });
    expect(r.checks).toEqual([]);
    expect(plan.steps.result).toBeUndefined();
  });
  it('이미 결과 칸이 있으면 등록 시각을 바꾸지 않는다(같은 글 다시 찾기)', () => {
    const first = startResult(plan, T0);
    const again = startResult(first, T0 + 2 * DAY);
    expect((again.steps.result?.data as any).registeredAt).toBe(new Date(T0).toISOString());
  });
});

describe('checkPlanResult', () => {
  const deps = (rank: number | null) => ({
    rank: vi.fn(async () => ({ status: 'ok', rank, sampled: 30 })),
    advisorLatest: () => ({ day: '2026-10-08', posts: [{ contentId: '224427462115', views: 120, homefeed: { count: 37, ratio: 0.3 } }] }),
  });
  it('3일이 지나면 그날 순위를 재 남기고, 홈판 유입을 붙인다', async () => {
    const d = deps(4);
    const next = await checkPlanResult(startResult(plan, T0), d, T0 + 3 * DAY + 1000);
    const r: any = next.steps.result?.data;
    expect(d.rank).toHaveBeenCalledWith('부활남 무대인사', 'https://blog.naver.com/leader_248/224427462115');
    expect(r.checks).toEqual([{ day: 3, at: new Date(T0 + 3 * DAY + 1000).toISOString(), rank: 4, sampled: 30, status: 'ok' }]);
    expect(r.homefeed).toEqual({ day: '2026-10-08', count: 37, views: 120 });
  });
  it('차례가 아니면 순위를 재지 않는다(홈판 유입만 갱신)', async () => {
    const d = deps(4);
    await checkPlanResult(startResult(plan, T0), d, T0 + DAY);
    expect(d.rank).not.toHaveBeenCalled();
  });
  it('force 면 차례와 상관없이 지금 순위를 latest 로 남긴다', async () => {
    const d = deps(null);
    const next = await checkPlanResult(startResult(plan, T0), d, T0 + DAY, { force: true });
    expect((next.steps.result?.data as any).latest).toMatchObject({ rank: null, sampled: 30, status: 'ok' });
    expect((next.steps.result?.data as any).checks).toEqual([]);
  });
});

describe('막히면 다음에 다시', () => {
  it('3일 확인이 차단 · 오류면 기록하지 않고 lastError 만 남겨 다음 회차에 다시 잰다', async () => {
    const d = { rank: vi.fn(async () => ({ status: 'blocked', rank: null, sampled: 0 })), advisorLatest: () => null };
    const next = await checkPlanResult(startResult(plan, T0), d, T0 + 3 * DAY + 1000);
    const r: any = next.steps.result?.data;
    expect(r.checks).toEqual([]);
    expect(r.lastError).toContain('blocked');
  });
});
