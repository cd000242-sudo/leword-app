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
    expansions: async () => [],
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

describe('③ 검색에서 궁금해하는 것(2026-10-07)', () => {
  it('자동완성 · 연관 키워드(실측 검색량)를 searches 칸으로 — 키워드 낱말이 많이 든 말 먼저', async () => {
    const d = deps({
      expansions: async () => [
        { keyword: 'KB자동차보험', searchVolume: 115300 },
        { keyword: '자동차보험 갱신 기간', searchVolume: 2100 },
        { keyword: '보험 비교', searchVolume: 40000 },
      ],
    });
    const plan = await runPostPlan('자동차 보험 갱신', d, () => {}, Date.parse('2026-10-06T08:00:00Z'));
    expect(plan.steps.searches?.ok).toBe(true);
    expect((plan.steps.searches?.data as any[]).map((r) => r.keyword)).toEqual(['자동차보험 갱신 기간', 'KB자동차보험']);
  });

  it('띄어쓰기 없는 키워드 — 확장이 0개면 띄운 말로 다시 · 지식인 · 카페도 띄운 말 · 가장 많이 겹치는 검색어로 함께 찾고 거른다', async () => {
    const seenExpansions: string[] = [];
    const questions = vi.fn(async () => [
      { source: 'kin', title: '주현미 별세 소식 사실인가요', link: 'k1', postdate: '2026-10-06' },
      { source: 'kin', title: '트로트 가수 추천해 주세요', link: 'k2', postdate: '2026-10-06' },
    ]);
    const d = deps({
      expansions: async (kw: string) => { seenExpansions.push(kw); return kw === '주현미 별세 이유' ? [{ keyword: '가수주현미별세', searchVolume: 301600 }, { keyword: '주현미', searchVolume: 118900 }] : []; },
      questions,
    });
    const plan = await runPostPlan('가수주현미별세이유', d, () => {}, Date.parse('2026-10-07T08:00:00Z'));
    expect(seenExpansions).toEqual(['가수주현미별세이유', '주현미 별세 이유']);
    expect((plan.steps.searches?.data as any[]).map((r) => r.keyword)).toEqual(['가수주현미별세', '주현미']);
    expect(questions.mock.calls[0]).toEqual(['가수주현미별세이유', ['가수 주현미 별세 이유', '가수주현미별세']]);
    expect((plan.steps.questions?.data as any[]).map((q) => q.link)).toEqual(['k1']);
  });

  it('확장이 실패해도 지식인 · 카페는 키워드로 그대로 찾고, 실패 이유는 searches 칸에', async () => {
    const questions = vi.fn(async () => []);
    const d = deps({ expansions: async () => { throw new Error('워커 응답 없음'); }, questions });
    const plan = await runPostPlan('자동차 보험 갱신', d, () => {}, Date.parse('2026-10-06T08:00:00Z'));
    expect(plan.steps.searches).toEqual({ ok: false, note: '워커 응답 없음' });
    expect(questions.mock.calls[0]).toEqual(['자동차 보험 갱신', []]);
    expect(plan.steps.questions?.ok).toBe(true);
  });
});

describe('② 제목 재료(2026-10-07 사장님 "상위노출 · 홈판 노출을 겨냥한 제목이어야지")', () => {
  it('검색용 제목 재료 = ③ 검색 궁금증(실측 검색량) · 뉴스는 짧은 말로 · 홈판 AI 에 카페 질문 · 검색 궁금증을 넘긴다 · 제목 종류 표시', async () => {
    const writingKit = vi.fn(async () => ({ seed: null, titles: [{ text: '가수 주현미 별세 이유, 근황까지 확인된 사실만', kind: '검색용', frameLabel: '인물·이슈', basis: 'b' }, { text: '주현미 별세 소식 돌던데… 직접 확인해 봤습니다', kind: '끌리는', frameLabel: '인물·이슈', basis: 'b' }], message: '자리 못 잼' }));
    const news = vi.fn(async () => ['가수 주현미 측 "별세설은 사실무근"']);
    const homefeedTitles = vi.fn(async () => ({ titles: ['"주현미 별세" 검색했다가 놀란 이유'], note: null }));
    const d = deps({
      expansions: async (kw: string) => (kw === '주현미 별세 이유' ? [{ keyword: '가수주현미별세', searchVolume: 301600 }, { keyword: '가수주현미근황', searchVolume: 2490 }, { keyword: '주현미 근황 2026', searchVolume: null }] : []),
      questions: async () => [{ source: 'cafearticle', title: '가수 주현미 별세 이런 가짜뉴스 처벌 안되냐?', link: 'c1', postdate: '2026-10-04' }],
      writingKit, news, homefeedTitles,
    });
    const plan = await runPostPlan('가수주현미별세이유', d, () => {}, Date.parse('2026-10-07T08:00:00Z'));
    expect((writingKit.mock.calls[0] as any)[1]).toEqual([{ keyword: '가수주현미별세', searchVolume: 301600 }, { keyword: '가수주현미근황', searchVolume: 2490 }]);
    expect(news.mock.calls[0]).toEqual(['주현미 별세']);
    expect((homefeedTitles.mock.calls[0] as any)[0]).toMatchObject({ question: '가수 주현미 별세 이런 가짜뉴스 처벌 안되냐?', uncovered: ['가수주현미별세', '가수주현미근황', '주현미 근황 2026'] });
    const titles: any = plan.steps.titles?.data;
    expect(titles.search.map((t: any) => t.kind)).toEqual(['검색용', '끌리는']);
  });

  it('홈판 AI 가 제목을 못 내고 이유도 없으면 빈칸 대신 이유를 적는다', async () => {
    const d = deps({ homefeedTitles: vi.fn(async () => ({ titles: [], note: null })) });
    const plan = await runPostPlan('자동차 보험 갱신', d, () => {}, Date.parse('2026-10-06T08:00:00Z'));
    expect((plan.steps.titles?.data as any).homefeedNote).toMatch(/홈판 제목을 만들지 못했습니다/);
  });
});
