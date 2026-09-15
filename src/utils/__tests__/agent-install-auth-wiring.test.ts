import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ spawn: vi.fn(), detect: vi.fn(), npm: vi.fn(), auth: vi.fn() }));
vi.mock('../agent-cli/spawnHelper', () => ({ spawnCollect: mocks.spawn, startSpawnSession: vi.fn() }));
vi.mock('../agent-cli/detect', () => ({ detectAgent: mocks.detect, clearAgentDetectionCache: vi.fn() }));
vi.mock('../agent-cli/npmInvocation', () => ({ resolveNpmInvocation: mocks.npm }));
vi.mock('../agent-cli/agyAuth', () => ({ runAgyAuth: mocks.auth }));
import { installAgent, loginAgent, logoutAgent } from '../agent-cli/installer';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.spawn.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
  mocks.detect.mockResolvedValue({ provider: 'gemini', installed: true, loggedIn: false, available: false, version: '1.2.0' });
  mocks.auth.mockResolvedValue({ provider: 'gemini', installed: true, loggedIn: true, available: true });
});

describe('Gemini 설정 버튼과 생성 실행기의 일치', () => {
  it('설치 버튼은 Google 공식 agy 설치 후 실제 감지를 확인한다', async () => {
    const result = await installAgent('gemini');
    expect(result.method).toBe('native');
    expect(mocks.spawn.mock.calls[0][0].args.join(' ')).toContain('https://antigravity.google/cli/install.');
    expect(mocks.detect).toHaveBeenCalledWith('gemini', { forceRefresh: true });
    expect(mocks.npm).not.toHaveBeenCalled();
  });
  it('agy 설치 실패를 예전 Gemini npm 설치로 성공 처리하지 않는다', async () => {
    mocks.spawn.mockResolvedValue({ code: 1, stdout: '', stderr: 'network unavailable' });
    await expect(installAgent('gemini')).rejects.toThrow('agy');
    expect(mocks.npm).not.toHaveBeenCalled();
  });
  it('로그인 버튼은 agy 대화형 인증에 안내·취소 콜백을 전달한다', async () => {
    const hooks = { onTerminalRequired: vi.fn(), onSessionReady: vi.fn() };
    await loginAgent('gemini', hooks);
    expect(mocks.auth).toHaveBeenCalledWith('login', hooks);
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it('로그아웃도 동일한 agy 계정을 대상으로 한다', async () => {
    const hooks = { onTerminalRequired: vi.fn() };
    await logoutAgent('gemini', hooks);
    expect(mocks.auth).toHaveBeenCalledWith('logout', hooks);
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it('이미 정상 연결된 계정은 인증 창을 다시 열지 않는다', async () => {
    mocks.detect.mockResolvedValue({ installed: true, loggedIn: true, available: true });
    expect((await loginAgent('gemini')).loginAction).toBe('already_authenticated');
    expect(mocks.auth).not.toHaveBeenCalled();
  });
});
