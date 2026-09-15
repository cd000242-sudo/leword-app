import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  claude: vi.fn(), codex: vi.fn(), gemini: vi.fn(), grok: vi.fn(), login: vi.fn(), logout: vi.fn(),
}));
vi.mock('electron', () => ({ ipcMain: { handle: (key: string, fn: any) => mocks.handlers.set(key, fn) }, shell: { openExternal: vi.fn() } }));
vi.mock('../agent-cli/claudeRunner', () => ({ runClaude: mocks.claude }));
vi.mock('../agent-cli/codexRunner', () => ({ runCodex: mocks.codex }));
vi.mock('../agent-cli/geminiRunner', () => ({ runGemini: mocks.gemini }));
vi.mock('../agent-cli/grokRunner', () => ({ runGrok: mocks.grok }));
vi.mock('../agent-cli/detect', () => ({ detectAgent: vi.fn(), clearAgentDetectionCache: vi.fn() }));
vi.mock('../agent-cli/installer', () => ({ loginAgent: mocks.login, logoutAgent: mocks.logout, installAgent: vi.fn(), AgentInstallError: class extends Error {} }));
import { setupAgentCliHandlers } from '../../main/handlers/agent-cli-handlers';

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of ['claude', 'codex', 'gemini', 'grok'] as const) mocks[name].mockResolvedValue(name);
  setupAgentCliHandlers();
});

it.each(['claude', 'codex', 'gemini', 'grok'] as const)('%s 연결 시험은 표시한 엔진만 호출한다', async (provider) => {
  const result = await mocks.handlers.get('agent-cli-test')!(null, { provider });
  expect(result).toMatchObject({ success: true, provider, reply: provider });
  for (const name of ['claude', 'codex', 'gemini', 'grok'] as const) {
    expect(mocks[name]).toHaveBeenCalledTimes(name === provider ? 1 : 0);
  }
});

it('계정 전환은 로그아웃 실패를 새 로그인 성공으로 숨기지 않는다', async () => {
  mocks.logout.mockRejectedValue(new Error('연결 해제 실패'));
  expect(await mocks.handlers.get('agent-cli-login-start')!(null, { provider: 'gemini', switchAccount: true }))
    .toMatchObject({ success: true });
  await new Promise((resolve) => setImmediate(resolve));
  expect(mocks.handlers.get('agent-cli-login-state')!(null, { provider: 'gemini' }))
    .toMatchObject({ stage: 'failed', error: '연결 해제 실패' });
  expect(mocks.login).not.toHaveBeenCalled();
});
