import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), detect: vi.fn(), npm: vi.fn() }));
vi.mock('../agent-cli/spawnHelper', () => ({ spawnCollect: mocks.spawn, startSpawnSession: vi.fn() }));
vi.mock('../agent-cli/detect', () => ({ detectAgent: mocks.detect, clearAgentDetectionCache: vi.fn() }));
vi.mock('../agent-cli/npmInvocation', () => ({ resolveNpmInvocation: mocks.npm }));

import { installAgent } from '../agent-cli/installer';
import { codexNativeInstallCommand, NATIVE_INSTALL_HOSTS } from '../agent-cli/nativeInstaller';
import { getCodexNativeInstallDirs } from '../agent-cli/agentRuntime';
import { buildCodexSubscriptionEnv } from '../agent-cli/subscriptionEnv';

/**
 * 완전 초보의 설치(2026-09-15, 사장님 "CLI 가 설치 안 된 완전 초보들은 설치부터 완벽하게 되게끔").
 *
 * 조사로 확인한 구멍: 코덱스는 npm 한 길뿐이라 npm 준비가 백신 · 회사망에 막히면 끝이었다(공식 Windows 설치기가 있는데
 * 안 썼다). 설치 직후 감지 제한이 8초라 백신이 첫 실행 파일을 검사하는 동안 "설치 실패"로 끝났다. 설치 중에는 진행이
 * 보이지 않았고, 막혔을 때 알려 주는 주소가 실제로 내려받는 주소와 달랐다.
 */
const codexInstalled = { provider: 'codex', installed: true, loggedIn: false, available: false, version: '0.153.4' };
const geminiInstalled = { provider: 'gemini', installed: true, loggedIn: false, available: false, version: '1.2.3' };
const geminiMissing = { provider: 'gemini', installed: false, loggedIn: false, available: false };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.npm.mockResolvedValue({ command: 'npm', prefixArgs: [], env: {}, source: 'bundled', prefix: 'C:\\app\\global', cache: 'C:\\app\\cache' });
});

describe('코덱스 공식 설치기(Windows)', () => {
  it('공식 install.ps1 을 묻지 않는 모드로 부른다 — Windows 밖은 교차 확인한 주소가 없어 npm 만 쓴다', () => {
    const cmd = codexNativeInstallCommand('win32');
    expect(cmd?.command).toBe('powershell.exe');
    const script = cmd!.args[cmd!.args.length - 1];
    expect(script).toContain("$env:CODEX_NON_INTERACTIVE = '1'");
    expect(script).toContain('irm https://chatgpt.com/codex/install.ps1 | iex');
    expect(codexNativeInstallCommand('darwin')).toBeNull();
  });

  it.runIf(process.platform === 'win32')('공식 설치기로 깔리면 npm 을 부르지 않는다', async () => {
    mocks.spawn.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    mocks.detect.mockResolvedValue(codexInstalled);
    const result = await installAgent('codex', { verifyRetryDelayMs: 0 });
    expect(result.method).toBe('native');
    expect(mocks.npm).not.toHaveBeenCalled();
  });

  it.runIf(process.platform === 'win32')('공식 설치기가 막히면 npm 으로 넘어가고, 막힌 실제 주소를 단계에 남긴다', async () => {
    mocks.spawn
      .mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'The remote name could not be resolved: releases.openai.com' })
      .mockResolvedValue({ code: 0, stdout: 'added 1 package', stderr: '' });
    mocks.detect.mockResolvedValue(codexInstalled);
    const result = await installAgent('codex', { verifyRetryDelayMs: 0 });
    expect(result.method).toBe('npm');
    expect(mocks.npm).toHaveBeenCalled();
    expect(result.steps[0]).toMatchObject({ status: 'failed' });
    expect(result.steps[0].detail).toContain('releases.openai.com');
  });
});

describe('설치 직후 감지 재시도 — 백신이 첫 실행 파일을 검사하는 동안', () => {
  it('처음 두 번 못 찾아도 세 번째에 찾으면 성공으로 끝낸다', async () => {
    mocks.spawn.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    mocks.detect
      .mockResolvedValueOnce(geminiMissing)
      .mockResolvedValueOnce(geminiMissing)
      .mockResolvedValue(geminiInstalled);
    const result = await installAgent('gemini', { verifyRetryDelayMs: 0 });
    expect(result.method).toBe('native');
    expect(mocks.detect).toHaveBeenCalledTimes(3);
  });

  it('세 번 다 못 찾으면 실패 단계에 이유를 남긴다', async () => {
    mocks.spawn.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    mocks.detect.mockResolvedValue(geminiMissing);
    const error = await installAgent('gemini', { verifyRetryDelayMs: 0 }).catch((e) => e);
    const detectStep = (error.steps as Array<{ name: string; status: string; detail?: string }>)
      .find((step) => step.name === 'CLI 감지');
    expect(detectStep).toMatchObject({ status: 'failed' });
    expect(detectStep?.detail).toContain('백신');
  });
});

describe('진행 단계 · 막힌 주소 안내', () => {
  it('단계가 바뀔 때마다 지금까지의 목록을 넘긴다 — 화면이 설치 진행을 실시간으로 그린다', async () => {
    mocks.spawn.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    mocks.detect.mockResolvedValue(geminiInstalled);
    const seen: string[] = [];
    await installAgent('gemini', { verifyRetryDelayMs: 0, onStep: (steps) => seen.push(steps.map((s) => s.status).join(',')) });
    expect(seen).toEqual(['ok', 'ok,ok']);
  });

  it('제미나이 설치기가 막히면 실제로 내려받는 주소를 안내한다', async () => {
    mocks.spawn.mockResolvedValue({ code: 1, stdout: '', stderr: 'Unable to connect to the remote server' });
    await expect(installAgent('gemini', { verifyRetryDelayMs: 0 })).rejects.toThrow(NATIVE_INSTALL_HOSTS.gemini);
  });
});

describe('코덱스 공식 설치 폴더 PATH — 앱 재시작 없이 찾는다', () => {
  it('Windows 설치 폴더를 가리키고, 설치 폴더를 바꾼 경우(CODEX_INSTALL_DIR)는 그 폴더를 쓴다', () => {
    expect(getCodexNativeInstallDirs({ LOCALAPPDATA: 'C:\\Users\\t\\AppData\\Local' }, 'win32')[0])
      .toMatch(/Programs[\\/]OpenAI[\\/]Codex[\\/]bin$/);
    expect(getCodexNativeInstallDirs({ LOCALAPPDATA: 'C:\\x', CODEX_INSTALL_DIR: 'D:\\tools\\codex' }, 'win32')).toEqual(['D:\\tools\\codex']);
    expect(getCodexNativeInstallDirs({ LOCALAPPDATA: 'C:\\x' }, 'darwin')).toEqual([]);
  });

  it.runIf(process.platform === 'win32')('코덱스 실행 환경 PATH 에 들어간다', () => {
    const env = buildCodexSubscriptionEnv({ LOCALAPPDATA: 'C:\\Users\\t\\AppData\\Local', PATH: 'C:\\Windows' });
    const key = Object.keys(env).find((name) => name.toUpperCase() === 'PATH') || 'PATH';
    expect(String(env[key])).toMatch(/Programs[\\/]OpenAI[\\/]Codex[\\/]bin/);
  });
});
