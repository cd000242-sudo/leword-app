/**
 * ⑤ 발행 후 유입(2026-10-06 2차) — 글 주소로 링크 달 자리를 찾고, 자리마다 답변 초안을 만든다.
 * 재료는 주입받는다. 커뮤니티(구글 · Bright Data)는 켰을 때만, 토큰이 없으면 이유를 남기고 건너뛴다.
 */
import { describe, expect, it, vi } from 'vitest';
import { draftAnswer, runInflow, type InflowDeps } from '../../main/post-plan-service';
import type { PostPlan } from '../post-plan/post-plan-model';

const plan: PostPlan = { id: 'plan-1', keyword: '자동차 보험 갱신', createdAt: '2026-10-06T08:00:00Z', updatedAt: '2026-10-06T08:00:00Z', steps: {} };
const items = [
  { source: 'kin', title: '보험 갱신 때 블랙박스 할인 되나요', link: 'https://kin.naver.com/qna/detail.naver?docId=1', postdate: '2026-10-04' },
  { source: 'community', title: '보험 갱신 후기', link: 'https://www.a-ha.io/q/1', postdate: '2026-10-03', siteName: '아하', linkPolicy: 'banned' },
];
function deps(over: Partial<InflowDeps> = {}): InflowDeps {
  return {
    analyze: async () => ({ title: '&quot;갱신 전에&quot; 자동차 보험 확인할 3가지 : 네이버 블로그', moneyAngle: '갱신 할인', queries: ['자동차 보험 갱신 할인'], coreKeywords: [{ keyword: '자동차 보험 갱신' }], shortQueries: ['보험 갱신'] }),
    search: vi.fn(async () => ({ items, communityNote: null })),
    evaluate: async () => [{ index: 1, relevance: 90, urgency: 90, commercialValue: 90, trafficPotential: 90, contentMatch: 90, spamRisk: 10, why: '내 글이 바로 답' }, { index: 2, relevance: 90, urgency: 90, commercialValue: 90, trafficPotential: 90, contentMatch: 90, spamRisk: 10, why: '관련' }],
    questionBody: async () => '갱신하는데 블랙박스 할인이 자동으로 되나요?',
    answer: vi.fn(async (input) => ({ answer: `답변 · 링크 ${input.withLink ? '있음' : '없음'}` })),
    ...over,
  };
}

describe('runInflow', () => {
  it('글을 분석해 그 질의로 찾고, 평가해 지금 답하면 유입 자리를 설계에 붙인다', async () => {
    const d = deps();
    const next = await runInflow(plan, 'https://blog.naver.com/leader_248/1', d, () => {}, { withCommunity: false });
    const data: any = next.steps.inflow?.data;
    expect(next.steps.inflow?.ok).toBe(true);
    expect(data.postUrl).toBe('https://blog.naver.com/leader_248/1');
    expect(data.postTitle).toBe('"갱신 전에" 자동차 보험 확인할 3가지'); // HTML 기호를 풀고 '네이버 블로그' 꼬리를 뗀다
    expect(data.spots.map((s: any) => s.title)).toEqual(['보험 갱신 때 블랙박스 할인 되나요', '보험 갱신 후기']);
    expect((d.search as any).mock.calls[0][1]).toBe(false);
    expect(plan.steps.inflow).toBeUndefined(); // 원본 설계는 그대로
  });
  it('글 주소가 아니면 거절한다', async () => {
    await expect(runInflow(plan, 'not a url', deps(), () => {}, { withCommunity: false })).rejects.toThrow(/글 주소/);
  });
  it('평가가 죽어도 찾은 자리는 평가 없이 보여 준다', async () => {
    const next = await runInflow(plan, 'https://blog.naver.com/x/1', deps({ evaluate: async () => { throw new Error('엔진 없음'); } }), () => {}, { withCommunity: false });
    const data: any = next.steps.inflow?.data;
    expect(data.unrated.length).toBe(2);
    expect(data.evaluateNote).toContain('엔진 없음');
  });
});

describe('draftAnswer', () => {
  it('지식인은 질문 본문을 읽고 링크를 붙인 초안 · 링크 금지 판은 링크 없이', async () => {
    const d = deps();
    const withLink = await draftAnswer({ title: '보험 갱신 때 블랙박스 할인 되나요', link: 'https://kin.naver.com/qna/detail.naver?docId=1', source: 'kin', linkPolicy: '' }, 'https://blog.naver.com/x/1', d);
    expect(withLink).toBe('답변 · 링크 있음');
    expect((d.answer as any).mock.calls[0][0].body).toContain('블랙박스');
    const banned = await draftAnswer({ title: '보험 갱신 후기', link: 'https://www.a-ha.io/q/1', source: 'community', linkPolicy: 'banned' }, 'https://blog.naver.com/x/1', d);
    expect(banned).toBe('답변 · 링크 없음');
  });
});
