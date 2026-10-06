/**
 * 글 한 편 유입 설계실 진행기 — ①~④ 를 잇는다(2026-10-06). 재료는 주입받는다(가짜로 시험).
 * 한 단계가 실패해도 나머지는 계속하고, 못 한 이유를 그 단계에 남긴다.
 */
import { describe, expect, it, vi } from 'vitest';
import { runPostPlan, type PostPlanDeps } from '../../main/post-plan-service';

function deps(over: Partial<PostPlanDeps> = {}): PostPlanDeps {
  return {
    volumes: async () => new Map([['자동차 보험 갱신', 2340]]),
    docs: async () => new Map([['자동차 보험 갱신', 812]]),
    writingKit: async () => ({
      seed: { seat: '반열림', facing: 1, vacancy: 7, topTitles: ['자동차 보험 갱신 총정리', '보험 갱신 전 꼭 보세요'] },
      titles: [{ text: '자동차 보험 갱신, 갱신 전에 확인할 3가지', kind: '검색용', frameLabel: '체크리스트', basis: '1페이지에 체크리스트 틀 없음' }],
      message: null,
    }),
    band: () => ({ volumeMin: 300, volumeMax: 3000 }) as any,
    judgeRange: (size) => ({ verdict: size.searchVolume !== null && size.searchVolume <= 3000 ? 'in' : 'out', reason: '붙어 본 크기 300~3,000 안', myTopic: false }),
    preemptionRow: async () => ({ tierLabel: '1페이지에 빈자리', openSlot: 7, measuredAt: '2026-10-05T01:00:00Z' }),
    news: async () => ['자동차보험 갱신 할인 특약 확대'],
    homefeedTitles: vi.fn(async () => ({ titles: ['"갱신 문자 받고 그냥 넘겼다가…" 다들 놓치는 할인'], note: null })),
    questions: async () => [{ source: 'kin', title: '자동차 보험 갱신 때 블랙박스 할인 따로 신청해야 하나요?', link: 'https://kin.naver.com/qna/detail.naver?docId=1', postdate: '2026-10-04', postedAt: '2026-10-04T03:00:00Z' }],
    bid: async () => 1240,
    affiliateSnapshot: async () => ({ sites: { toss: { label: '토스쇼핑', items: [{ name: '차량용 블랙박스', keyword: '블랙박스' }, { name: '자동차 방향제', keyword: '방향제' }] } } }),
    ...over,
  };
}

describe('runPostPlan', () => {
  it('①~④ 를 한 설계로 모은다', async () => {
    const d = deps();
    const plan = await runPostPlan('자동차 보험 갱신', d, () => {}, Date.parse('2026-10-06T08:00:00Z'));
    expect(plan.keyword).toBe('자동차 보험 갱신');
    const judge: any = plan.steps.judge?.data;
    expect(judge.searchVolume).toBe(2340);
    expect(judge.documentCount).toBe(812);
    expect(judge.seat.verdict).toBe('반열림');
    expect(judge.range.verdict).toBe('in');
    expect(judge.preemption.openSlot).toBe(7);
    const titles: any = plan.steps.titles?.data;
    expect(titles.search[0].text).toContain('3가지');
    expect(titles.homefeed[0]).toContain('갱신 문자');
    // 홈판 제목은 실제 1페이지 제목과 뉴스 사실을 재료로 받는다
    expect((d.homefeedTitles as any).mock.calls[0][0]).toMatchObject({ keyword: '자동차 보험 갱신', topTitles: ['자동차 보험 갱신 총정리', '보험 갱신 전 꼭 보세요'], news: ['자동차보험 갱신 할인 특약 확대'] });
    expect((plan.steps.questions?.data as any)[0].where).toBe('지식인');
    const money: any = plan.steps.money?.data;
    expect(money.bid).toBe(1240);
    expect(money.affiliate.map((a: any) => a.name)).toEqual(['자동차 방향제']);
  });

  it('한 단계가 실패해도 나머지는 계속하고, 이유를 남긴다', async () => {
    const plan = await runPostPlan('자동차 보험 갱신', deps({
      questions: async () => { throw new Error('워커 응답 없음'); },
      bid: async () => { throw new Error('검색광고 키 없음'); },
    }), () => {});
    expect(plan.steps.questions?.ok).toBe(false);
    expect(plan.steps.questions?.note).toContain('워커 응답 없음');
    expect(plan.steps.judge?.ok).toBe(true);
    const money: any = plan.steps.money?.data;
    expect(money.bid).toBeNull();
    expect(money.bidNote).toContain('검색광고 키 없음');
  });

  it('자리를 못 쟀으면 홈판 제목 재료에 1페이지 제목 없이 부르고, 제목 엔진이 막히면 이유를 남긴다', async () => {
    const plan = await runPostPlan('자동차 보험 갱신', deps({
      writingKit: async () => { throw new Error('브라우저를 열지 못함'); },
      homefeedTitles: async () => ({ titles: [], note: '연결된 AI 엔진이 없습니다' }),
    }), () => {});
    expect(plan.steps.judge?.ok).toBe(true);
    expect((plan.steps.judge?.data as any).seat).toBeNull();
    expect((plan.steps.judge?.data as any).seatNote).toContain('브라우저');
    expect((plan.steps.titles?.data as any).homefeed).toEqual([]);
    expect((plan.steps.titles?.data as any).homefeedNote).toContain('AI 엔진');
  });

  it('진행 문구를 단계마다 알린다', async () => {
    const said: string[] = [];
    await runPostPlan('자동차 보험 갱신', deps(), (m) => said.push(m));
    expect(said.some((m) => /이길 수 있나/.test(m))).toBe(true);
    expect(said.some((m) => /제목/.test(m))).toBe(true);
  });
});
