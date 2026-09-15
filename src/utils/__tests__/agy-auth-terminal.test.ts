import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ start: vi.fn(), detect: vi.fn(), cancel: vi.fn() }));
vi.mock('../agent-cli/spawnHelper', () => ({ startSpawnSession: mocks.start }));
vi.mock('../agent-cli/detect', () => ({ detectAgent: mocks.detect, clearAgentDetectionCache: vi.fn() }));
import { agyAuthTerminalCommand, runAgyAuth } from '../agent-cli/agyAuth';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.start.mockReturnValue({ result: Promise.resolve({ code: 0 }), cancel: mocks.cancel });
});

it('Windows는 한글·셸 문자가 든 경로를 인코딩하고 새 대화형 창을 연다', () => {
  const path = "C:\\Users\\한 글'&\\temp";
  const command = agyAuthTerminalCommand('login', path, {}, 'win32');
  expect(command.command).toBe('powershell.exe');
  expect(command.args.join(' ')).not.toContain(path);
  const launch = Buffer.from(command.args.at(-1)!, 'base64').toString('utf16le');
  expect(launch).toContain('Start-Process');
  expect(launch).toContain('-WindowStyle Normal -Wait');
  const encoded = /'-EncodedCommand', '([A-Za-z0-9+/=]+)'/.exec(launch)![1];
  const script = Buffer.from(encoded, 'base64').toString('utf16le');
  expect(script).toContain("한 글''&");
  expect(script).toContain('& agy');
  expect(script).not.toContain('agy login');
});

it('로그인 완료는 창 실행이 아니라 실제 인증 감지 결과로 판단한다', async () => {
  mocks.detect.mockResolvedValue({ installed: true, loggedIn: true, available: true });
  const guide = vi.fn();
  const status = await runAgyAuth('login', { onTerminalRequired: guide });
  expect(status.loginAction).toBe('authenticated');
  expect(guide).toHaveBeenCalledWith(expect.stringContaining('Google 로그인'));
  expect(mocks.detect).toHaveBeenCalledWith('gemini', { forceRefresh: true });
  expect(mocks.cancel).toHaveBeenCalled();
});

it('계정 전환은 실제 인증 해제를 확인한다', async () => {
  mocks.detect.mockResolvedValue({ installed: true, loggedIn: false, available: false, errorCode: 'not_logged_in' });
  const guide = vi.fn();
  expect((await runAgyAuth('logout', { onTerminalRequired: guide })).loggedIn).toBe(false);
  expect(guide).toHaveBeenCalledWith(expect.stringContaining('/logout'));
  expect(mocks.cancel).toHaveBeenCalled();
});

it('취소는 로그인 성공으로 처리하지 않는다', async () => {
  await expect(runAgyAuth('login', { onSessionReady: (controls) => controls.cancel() })).rejects.toMatchObject({ code: 'aborted' });
  expect(mocks.detect).not.toHaveBeenCalled();
});
