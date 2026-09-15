import { afterEach, expect, it, vi } from 'vitest';
const runners = vi.hoisted(() => ({ claude: vi.fn(), codex: vi.fn(), gemini: vi.fn(), grok: vi.fn() }));
vi.mock('../agent-cli/claudeRunner', () => ({ runClaude: runners.claude }));
vi.mock('../agent-cli/codexRunner', () => ({ runCodex: runners.codex }));
vi.mock('../agent-cli/geminiRunner', () => ({ runGemini: runners.gemini }));
vi.mock('../agent-cli/grokRunner', () => ({ runGrok: runners.grok }));
vi.mock('../agent-cli/usageLedger', () => ({ recordAgentRun: vi.fn() }));
import { analyzeRadarViaAgent } from '../../main/radar-analysis-service';
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('서버 근거 → Claude/Codex 실패 → Gemini → 서버 실측 파서까지 연결한다', async () => {
  runners.claude.mockRejectedValue(new Error('weekly limit'));
  runners.codex.mockRejectedValue(new Error('not available'));
  runners.gemini.mockResolvedValue('{"queries":["신청 방법"]}');
  const requests: any[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    expect(url).toBe('https://leword-keyword-api.leword.workers.dev/');
    const payload = JSON.parse(init.body); requests.push(payload);
    return { ok: true, json: async () => payload.action === 'radar-analyze'
      ? { ok: true, prompt: '서버의 실제 근거', page: { title: '제목' }, url: payload.url }
      : { ok: true, analysis: { queries: ['신청 방법'], coreKeywords: [{ searchVolume: 100 }] } } };
  }));
  const result = await analyzeRadarViaAgent({ url: 'https://example.com/post', keys: { openApiId: 'measured', claudeToken: 'excluded' } });
  expect(result.provider).toBe('gemini');
  expect(runners.gemini).toHaveBeenCalledWith('서버의 실제 근거', { timeoutMs: 180000 });
  expect(requests.map(r => r.action)).toEqual(['radar-analyze', 'radar-analyze-parse']);
  expect(requests[1].aiText).toBe('{"queries":["신청 방법"]}');
  expect(requests[1].keys).toEqual({ openApiId: 'measured' });
});

it('서버가 근거를 못 읽으면 추론하지 않고 이유를 알린다', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: false, message: '본문 없음' }) })));
  await expect(analyzeRadarViaAgent({ url: 'https://example.com', keys: {} })).resolves.toMatchObject({ error: '본문 없음' });
  expect(runners.claude).not.toHaveBeenCalled();
});
