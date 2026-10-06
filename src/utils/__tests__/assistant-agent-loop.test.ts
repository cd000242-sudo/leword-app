import { describe, expect, it, vi } from 'vitest';
import { needsMeasure, runAssistant, TOOL_ROUNDS } from '../../main/assistant-service';
import type { AssistantToolDeps } from '../../main/assistant-tool-runner';

/**
 * 비서 도구 루프(2026-10-06) — 모델이 [도구] 를 내면 앱이 재고, 결과를 붙여 다시 묻는다.
 * 가짜 엔진 · 가짜 실측 창구로 실제 루프를 돌려 본다(문자열 일치만으로는 배선 버그가 통과한다).
 */
function fakeDeps(over: Partial<AssistantToolDeps> = {}): AssistantToolDeps {
  return {
    readBlog: () => ({
      blogId: 'leadernam-', measuredAt: '2026-10-05T01:00:00Z',
      topicProfile: { words: [{ word: '타이어', posts: 9 }, { word: '엔진오일', posts: 6 }], recentWords: [], declaredTopic: '자동차', totalPosts: 41 },
      wonRows: [{ keyword: '타이어 공기압', blogRank: 4, searchVolume: 2210, documentCount: 15000, facing: 2 }],
      band: { volumeMin: 100, volumeMax: 2210, wonCount: 1, nearCount: 2, measuredCount: 30 },
      recentTitles: [{ title: '타이어 공기압 겨울에 왜 떨어질까', publishedOn: '2026-10-01' }],
    }),
    readTodayPlan: () => null,
    volumes: vi.fn(async (keywords: string[]) => new Map(keywords.map((k) => [k, k.includes('펑크') ? 880 : null] as [string, number | null]))),
    docs: vi.fn(async (keywords: string[]) => new Map(keywords.map((k) => [k, 3200] as [string, number]))),
    expand: async () => ({ autocomplete: ['타이어 펑크 수리비'], related: [{ keyword: '타이어펑크', volume: 880 }] }),
    seat: vi.fn(async (keywords: string[]) => keywords.map((keyword) => ({ keyword, status: 'ok' as const, verdict: 'open' as const, facing: 0, sampled: 10, vacancy: 3, ads: 0, aiBriefing: false, cards: [], staleDays: 400, topTitles: ['펑크 났을 때'] }))) as any,
    sitePicks: async () => ({ builtAt: '2026-10-05T22:43:00Z', topics: [{ topic: '자동차', rows: [{ keyword: '타이어 공기압 체크', searchVolume: 1100, documentCount: 320, ratio: 3.4 }] }, { topic: '맛집', rows: [{ keyword: '성수 맛집', searchVolume: 9000, documentCount: 4000, ratio: 2.2 }] }] }),
    news: async (keyword: string) => [{ title: `${keyword} 출시 가격 공개`, description: '출시일과 가격이 발표됐다.', pubDate: 'Mon, 05 Oct 2026 09:00:00 +0900', link: 'https://example.com/n1' }],
    siteBriefs: async () => ({ builtAt: '2026-10-05T21:12:00Z', briefs: [{ field: '자동차', timing: 'NOW', coreKeyword: '신형 SUV 출시', searchVolume: null, documentCount: 8100, serpFacing: 2, serpFit: '높음', title: '신형 SUV 가격 공개' }] }),
    homefeedBoard: async () => ({ generatedAt: '2026-10-05T00:00:00Z', candidates: [{ keyword: '겨울 타이어', category: '자동차·IT', recommended: true, priority: 90, sources: [{ id: 'a' }, { id: 'b' }], homeTitles: ['겨울 타이어 이거 모르면 손해'] }] }),
    advisorLatest: () => ({ day: '2026-10-05', homefeedTitles: [{ title: '엔진오일 이렇게 갈면 큰일' }] }),
    titleGuide: () => ({ rules: ['규칙 — 완결된 제목'], samples: ['이러니까 바로 풀리네요'] }),
    ...over,
  };
}

/** 정해 둔 답을 차례로 내는 가짜 엔진 — runWithAnyAgent 처럼 validate 를 부른다. */
function scriptedEngine(replies: string[]) {
  const prompts: string[] = [];
  const run = vi.fn(async (prompt: string, options: any) => {
    prompts.push(prompt);
    const reply = replies.shift() ?? '끝';
    options.validate?.(reply);
    return { reply, provider: 'claude' as const, tried: ['claude' as const], skipped: [], failures: {} };
  });
  return { run, prompts };
}

const ask = (content: string) => ({ turns: [{ role: 'user' as const, content }] });

describe('runAssistant — 도구 루프', () => {
  it('도구 요청 → 실측 → 결과를 붙여 다시 묻고 → 최종 답', async () => {
    const engine = scriptedEngine([
      '[도구]\n{"calls":[{"tool":"my_blog","args":{}},{"tool":"expand","args":{"seed":"타이어"}}]}',
      '[도구]\n{"calls":[{"tool":"volume","args":{"keywords":["타이어 펑크 수리비"]}},{"tool":"seat","args":{"keywords":["타이어 펑크 수리비"]}}]}',
      '- 타이어 펑크 수리비: 월 검색량 880 · 판정 열림 · 정면 0 · 3번째 자리 빔',
    ]);
    const deps = fakeDeps();
    const progress: string[] = [];
    const answer = await runAssistant(ask('내 블로그로 쓸 키워드 골라줘'), { deps, runAgent: engine.run, onProgress: (p) => progress.push(p) });
    expect(answer.answer).toContain('타이어 펑크 수리비');
    expect(answer.tools).toEqual(['my_blog', 'expand', 'volume', 'seat']);
    expect(engine.run).toHaveBeenCalledTimes(3);
    // 두 번째 질문엔 내 블로그 · 연관어 결과가, 세 번째엔 자리 결과까지 붙는다.
    expect(engine.prompts[1]).toContain('제목에 자주 쓴 말(글 수): 타이어(9)');
    expect(engine.prompts[1]).toContain('타이어펑크(880)');
    expect(engine.prompts[2]).toContain('판정 열림');
    expect(engine.prompts[2]).toContain('3번째 자리 빔');
    expect(deps.seat).toHaveBeenCalledWith(['타이어 펑크 수리비']);
    expect(progress.some((p) => p.includes('자리 재는 중'))).toBe(true);
  });

  it('도구가 필요 없는 질문은 한 번에 답한다', async () => {
    const engine = scriptedEngine(['설정 → AI 연결에서 처음 설정 마법사를 누르세요.']);
    const answer = await runAssistant(ask('AI 연결은 어떻게 하나요?'), { deps: fakeDeps(), runAgent: engine.run });
    expect(answer.tools).toBeUndefined();
    expect(engine.run).toHaveBeenCalledTimes(1);
  });

  it(`도구를 계속 청해도 ${TOOL_ROUNDS}번 뒤엔 도구를 막고 답하게 한다`, async () => {
    const tool = '[도구]\n{"calls":[{"tool":"homefeed_now","args":{}}]}';
    const engine = scriptedEngine([...Array(TOOL_ROUNDS).fill(tool), '지금 홈판은 자동차·IT 소재가 많습니다.']);
    const answer = await runAssistant(ask('요즘 홈판 뭐 떠?'), { deps: fakeDeps(), runAgent: engine.run });
    expect(answer.answer).toContain('자동차');
    expect(engine.prompts[TOOL_ROUNDS]).toContain('더는 도구를 부를 수 없다');
    expect(engine.prompts[TOOL_ROUNDS - 1]).not.toContain('더는 도구를 부를 수 없다');
  });

  it('JSON 이 깨지면 형식 오류를 알려 다시 내게 한다', async () => {
    const engine = scriptedEngine(['[도구]\n{"calls":[{"tool"', '[도구]\n{"calls":[{"tool":"title_guide","args":{}}]}', '1. 이러니까 바로 풀리네요']);
    await runAssistant(ask('홈판 제목 추천해줘'), { deps: fakeDeps(), runAgent: engine.run });
    expect(engine.prompts[1]).toContain('[형식 오류]');
    expect(engine.prompts[2]).toContain('실제 홈판 제목 본보기');
  });

  it('자리 실측은 질문 하나에 15개까지 — 넘친 말은 안 잰다고 결과에 적는다', async () => {
    const many = Array.from({ length: 18 }, (_, i) => `"키워드${i}"`).join(',');
    const engine = scriptedEngine([`[도구]\n{"calls":[{"tool":"seat","args":{"keywords":[${many}]}}]}`, '답']);
    const deps = fakeDeps();
    await runAssistant(ask('다 재 줘'), { deps, runAgent: engine.run });
    expect((deps.seat as any).mock.calls[0][0]).toHaveLength(15);
    expect(engine.prompts[1]).toContain('상한이라 안 잰 것');
  });

  it('못 잰 검색량은 0 으로 메우지 않는다', async () => {
    const engine = scriptedEngine(['[도구]\n{"calls":[{"tool":"volume","args":{"keywords":["엔진오일 냄새"]}}]}', '답']);
    await runAssistant(ask('검색량?'), { deps: fakeDeps(), runAgent: engine.run });
    expect(engine.prompts[1]).toContain('엔진오일 냄새: 못 잼');
  });
});

describe('비서 도구 — 추천키워드 · 글감 (2026-10-06 사장님 "찾아주는 기능")', () => {
  it('picks 는 주제 이름으로 좁혀 그 주제의 키워드를 준다', async () => {
    const engine = scriptedEngine(['[도구]\n{"calls":[{"tool":"picks","args":{"category":"자동차"}}]}', '답']);
    await runAssistant(ask('자동차 추천키워드 찾아줘'), { deps: fakeDeps(), runAgent: engine.run });
    expect(engine.prompts[1]).toContain('타이어 공기압 체크');
    expect(engine.prompts[1]).not.toContain('성수 맛집');
  });
  it('briefs 는 분야별 글감을 주고 자리 미측정은 못 잰 것이라고 말한다', async () => {
    const engine = scriptedEngine(['[도구]\n{"calls":[{"tool":"briefs","args":{"category":"자동차"}}]}', '답']);
    await runAssistant(ask('자동차 글감 있어?'), { deps: fakeDeps(), runAgent: engine.run });
    expect(engine.prompts[1]).toContain('신형 SUV 출시');
    expect(engine.prompts[1]).toContain('검색량 못 잼');
  });
  it('없는 주제는 있는 이름 목록을 알려 준다', async () => {
    const engine = scriptedEngine(['[도구]\n{"calls":[{"tool":"picks","args":{"category":"우주"}}]}', '답']);
    await runAssistant(ask('우주 추천키워드'), { deps: fakeDeps(), runAgent: engine.run });
    expect(engine.prompts[1]).toContain('주제 이름: 자동차, 맛집');
  });
});


describe('추천 요청은 재지 않고 답하지 않는다(2026-10-06)', () => {
  it('추천 요청에 바로 답하면 한 번 더 돌려 재게 한다', async () => {
    const engine = scriptedEngine(['자료만 보고 드리는 추천이에요.', '[도구]\n{"calls":[{"tool":"volume","args":{"keywords":["타이어 공기압 체크"]}}]}', '타이어 공기압 체크: 월 검색량 1,100 · 재어 본 결과로 추천']);
    const answer = await runAssistant(ask('자동차 블로그에 쓸 소재 추천해줘'), { deps: fakeDeps(), runAgent: engine.run });
    expect(engine.prompts[1]).toContain('아직 아무것도 재지 않았다');
    expect(answer.tools).toEqual(['volume']);
    expect(answer.answer).toContain('재어 본 결과');
  });
  it('추천이 아닌 질문은 그대로 답한다', () => {
    expect(needsMeasure(ask('AI 연결은 어떻게 하나요?'), [])).toBe(false);
    expect(needsMeasure(ask('소재 추천해줘'), [])).toBe(true);
    expect(needsMeasure(ask('소재 추천해줘'), ['volume'])).toBe(false);
  });
});

describe('뉴스 도구 · 한도(2026-10-06 사장님 "한계 수정")', () => {
  it('news 는 뉴스 제목과 요약을 재료로 준다', async () => {
    const engine = scriptedEngine(['[도구]\n{"calls":[{"tool":"news","args":{"seed":"제네시스 G60"}}]}', '답']);
    await runAssistant(ask('G60 제목 써줘'), { deps: fakeDeps(), runAgent: engine.run });
    expect(engine.prompts[1]).toContain('제네시스 G60 출시 가격 공개');
    expect(engine.prompts[1]).toContain('출시일과 가격이 발표됐다');
  });
  it('한도가 늘었다 — 도구 차례 8번', () => {
    expect(TOOL_ROUNDS).toBe(8);
  });
});
