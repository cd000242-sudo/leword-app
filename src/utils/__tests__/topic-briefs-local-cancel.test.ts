import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => Promise<any>>(),
  writes: vi.fn(), news: vi.fn(), agent: vi.fn(), volume: vi.fn(),
  previous: JSON.stringify({ builtAt: '2026-09-23T00:00:00Z', briefs: [{ title: '기존 작성안' }], rounds: [] }),
}));
vi.mock('electron', () => ({ app: { getPath: () => 'fixture-user-data' }, ipcMain: {
  listenerCount: (key: string) => Number(state.handlers.has(key)),
  handle: (key: string, handler: (...args: any[]) => Promise<any>) => state.handlers.set(key, handler),
} }));
vi.mock('fs', () => ({ readFileSync: () => state.previous, writeFileSync: state.writes, mkdirSync: vi.fn() }));
vi.mock('../topic-briefs', async (original) => ({
  ...(await original<any>()), BRIEF_FIELDS: [{ field: '생활', queries: ['지역 축제'] }],
}));
vi.mock('../naver-api-hub', () => ({ naverApiFetch: state.news }));
vi.mock('../environment-manager', () => ({ EnvironmentManager: { getInstance: () => ({ getConfig: () => ({
  naverClientId: 'fixture', naverClientSecret: 'fixture', naverSearchAdAccessLicense: 'fixture', naverSearchAdSecretKey: 'fixture',
}) }) } }));
vi.mock('../agent-cli/defaultChain', () => ({ createDefaultAgentChain: () => [] }));
vi.mock('../agent-cli/runAny', () => ({ runWithAnyAgent: state.agent }));
vi.mock('../naver-searchad-api', () => ({ getNaverSearchAdKeywordVolume: state.volume, getNaverSearchAdKeywordSuggestions: vi.fn() }));
vi.mock('../local-serp-fetch', () => ({ localSerpFetch: vi.fn(), closeLocalSerpFetch: vi.fn(), localSerpStats: () => ({ consecutiveBlocked: 0 }) }));
vi.mock('../../main/topic-brief-pipeline', async (original) => ({ ...(await original<any>()), enrichBriefFacts: async (facts: unknown) => facts }));

import { readLocalBriefs, setupTopicBriefsLocalHandlers } from '../../main/handlers/topic-briefs-local';

const sentence = '지역 축제 사전등록은 무료다.';
const draft = {
  title: '지역 축제 사전등록 비용 안내', titles: [{ target: '설명', text: '지역 축제 사전등록 비용 안내' }],
  timing: 'NOW', coreKeyword: '지역 축제', keywords: ['지역 축제'], factIds: ['f1'], primaryIntent: '사전등록 비용 확인', value: sentence,
  editorial: { version: 2, status: 'supported', summary: sentence, audience: '축제 방문을 준비하는 사람', angle: '등록 비용 확인',
    missing: [], outline: ['등록 비용'], answers: [{ question: '등록 비용은 얼마인가?', answer: sentence, factIds: ['f1'], excerpts: [{ factId: 'f1', text: sentence }] }] },
};

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-24T01:00:00Z'));
  state.handlers.clear(); state.writes.mockReset(); state.agent.mockReset(); state.volume.mockReset();
  state.news.mockResolvedValue({ ok: true, json: async () => ({ items: [
    { title: '지역 축제 사전등록 안내', description: sentence, originallink: 'https://example.test/one', pubDate: '2026-09-24T00:00:00Z' },
    { title: '지역 문화 행사 운영 안내', description: '공식 안내에서 운영 시간을 확인할 수 있다.', originallink: 'https://example.test/two', pubDate: '2026-09-24T00:00:00Z' },
  ] }) });
  state.agent.mockResolvedValueOnce({ provider: 'fixture', reply: JSON.stringify([draft]) });
  state.volume.mockResolvedValue([{ keyword: '지역 축제', totalSearchVolume: 500 }]);
  setupTopicBriefsLocalHandlers();
});
afterEach(() => vi.useRealTimers());

async function run(onProgress: (progress: any) => void = () => {}) {
  const result = state.handlers.get('topic-briefs-local-run')!({ sender: { send: (_channel: string, progress: any) => onProgress(progress) } }, { measureSeats: false });
  await vi.runAllTimersAsync();
  return result;
}

describe('오늘의 글감 취소 시 기존 저장본 보존', () => {
  it('독립 검토 중 취소한 뒤 정상 검토 답변이 돌아와도 부분 결과를 저장하지 않는다', async () => {
    state.agent.mockImplementationOnce(async () => {
      await state.handlers.get('topic-briefs-local-abort')!();
      return { provider: 'fixture', reply: '[{"index":0,"passed":true,"issues":[]}]' };
    });
    const result = await run();
    expect(state.agent).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(false); expect(result.error).toMatch(/취소/);
    expect(state.writes).not.toHaveBeenCalled();
    expect(readLocalBriefs()).toEqual(JSON.parse(state.previous));
  });
  it('검색량 진행 알림에서 중지한 경우에도 기존 회차를 덮어쓰지 않는다', async () => {
    state.agent.mockResolvedValueOnce({ provider: 'fixture', reply: '[{"index":0,"passed":true,"issues":[]}]' });
    let cancelled = false;
    const result = await run((progress) => {
      if (progress.step === '검색량') { cancelled = true; void state.handlers.get('topic-briefs-local-abort')!(); }
    });
    expect(cancelled).toBe(true); expect(state.volume).toHaveBeenCalledOnce();
    expect(result.success).toBe(false); expect(result.error).toMatch(/취소/);
    expect(state.writes).not.toHaveBeenCalled();
    expect(readLocalBriefs()).toEqual(JSON.parse(state.previous));
  });
});
