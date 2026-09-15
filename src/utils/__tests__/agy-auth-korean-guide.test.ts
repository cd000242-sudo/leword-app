import { expect, it } from 'vitest';
import { agyAuthTerminalCommand } from '../agent-cli/agyAuth';

/**
 * 제미나이(agy) 로그인 창 안내는 한국어다(2026-09-15, 사장님 "설치부터 완벽하게").
 * agy 는 공식적으로 대화형 창에서만 로그인한다. 예전 창 안내가 영어("Complete Google sign-in in this window…")라
 * 초보 사용자가 무엇을 해야 하는지 몰랐다. 콘솔 출력 인코딩을 UTF-8 로 맞춰야 한글이 깨지지 않는다.
 */
function decodeWindowsScript(action: 'login' | 'logout'): string {
  const command = agyAuthTerminalCommand(action, 'C:\\temp\\agy-auth', {}, 'win32');
  const launch = Buffer.from(command.args.at(-1)!, 'base64').toString('utf16le');
  const encoded = /'-EncodedCommand', '([A-Za-z0-9+/=]+)'/.exec(launch)![1];
  return Buffer.from(encoded, 'base64').toString('utf16le');
}

it('로그인 창은 콘솔을 UTF-8 로 맞추고 한국어로 안내한다', () => {
  const script = decodeWindowsScript('login');
  expect(script).toContain('[Console]::OutputEncoding = [System.Text.Encoding]::UTF8');
  expect(script).toContain('구글 계정 로그인');
  expect(script).not.toContain('Complete Google sign-in');
  expect(script).toContain('& agy');
});

it('계정 바꾸기 창도 한국어로 /logout 을 안내한다', () => {
  const script = decodeWindowsScript('logout');
  expect(script).toContain('/logout');
  expect(script).toMatch(/[가-힣]/);
  expect(script).not.toContain('Gemini account change');
});
