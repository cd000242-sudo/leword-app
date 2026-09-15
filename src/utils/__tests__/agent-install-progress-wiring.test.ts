import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  install: vi.fn(),
}));
vi.mock('electron', () => ({ ipcMain: { handle: (key: string, fn: any) => mocks.handlers.set(key, fn) }, shell: { openExternal: vi.fn() } }));
vi.mock('../agent-cli/claudeRunner', () => ({ runClaude: vi.fn() }));
vi.mock('../agent-cli/codexRunner', () => ({ runCodex: vi.fn() }));
vi.mock('../agent-cli/geminiRunner', () => ({ runGemini: vi.fn() }));
vi.mock('../agent-cli/grokRunner', () => ({ runGrok: vi.fn() }));
vi.mock('../agent-cli/detect', () => ({ detectAgent: vi.fn(), clearAgentDetectionCache: vi.fn() }));
vi.mock('../agent-cli/installer', () => ({
  installAgent: mocks.install,
  loginAgent: vi.fn(),
  logoutAgent: vi.fn(),
  AgentInstallError: class extends Error { steps = []; },
}));

import { setupAgentCliHandlers } from '../../main/handlers/agent-cli-handlers';

/**
 * 설치 진행 조회 · 중복 방지(2026-09-15, 사장님 "설치부터 완벽하게").
 * 설치는 한 번에 끝나는 IPC 라 최대 수 분 동안 화면에 진행이 없었고, 모달을 닫았다 열어 다시 누르면 설치기가 둘 떴다.
 */
beforeEach(() => {
  mocks.install.mockReset();
  mocks.handlers.clear();
  setupAgentCliHandlers();
});

it('같은 엔진 설치를 두 번 누르면 진행 중인 설치를 기다린다 — 설치기를 두 번 띄우지 않는다', async () => {
  let release: (value: unknown) => void = () => undefined;
  mocks.install.mockImplementation((_provider: string, options: { onStep: (steps: unknown[]) => void }) => {
    options.onStep([{ name: '공식 설치기', status: 'running' }]);
    return new Promise((resolve) => { release = resolve; });
  });
  const install = mocks.handlers.get('agent-cli-install')!;
  const progress = mocks.handlers.get('agent-cli-install-progress')!;
  const first = install(null, { provider: 'codex' });
  const second = install(null, { provider: 'codex' });
  await Promise.resolve();
  expect(mocks.install).toHaveBeenCalledTimes(1);
  expect(progress(null, { provider: 'codex' })).toMatchObject({ success: true, running: true, steps: [{ name: '공식 설치기', status: 'running' }] });
  release({ method: 'native', version: '0.153.4', steps: [{ name: '공식 설치기', status: 'ok' }] });
  await expect(first).resolves.toMatchObject({ success: true, method: 'native' });
  await expect(second).resolves.toMatchObject({ success: true, method: 'native' });
  expect(progress(null, { provider: 'codex' })).toMatchObject({ running: false });
});

it('설치가 끝난 뒤 다시 누르면 새로 설치한다', async () => {
  mocks.install.mockResolvedValue({ method: 'npm', version: '1', steps: [] });
  const install = mocks.handlers.get('agent-cli-install')!;
  await install(null, { provider: 'grok' });
  await install(null, { provider: 'grok' });
  expect(mocks.install).toHaveBeenCalledTimes(2);
});

it('모르는 엔진은 진행 조회도 거절한다', () => {
  expect(mocks.handlers.get('agent-cli-install-progress')!(null, { provider: 'unknown' })).toMatchObject({ success: false });
});
