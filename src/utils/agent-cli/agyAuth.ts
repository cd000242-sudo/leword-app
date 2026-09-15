import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { startSpawnSession } from './spawnHelper';
import { buildGeminiSubscriptionEnv } from './subscriptionEnv';
import { detectAgent, clearAgentDetectionCache } from './detect';
import { AgentCliError, type AgentCliStatus } from './types';
import type { AgentLoginHooks } from './installer';

const shellQuote = (value: string): string => `'${value.replace(/'/g, `'"'"'`)}'`;

/** agy authenticates in a terminal; it has no login/logout subcommands or pipe-based OAuth flow. */
export function agyAuthTerminalCommand(
  action: 'login' | 'logout',
  cwd: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): { command: string; args: string[] } {
  // 초보 사용자가 직접 보는 창이라 한국어로 안내한다(2026-09-15, 사장님 "설치부터 완벽하게"). 작은따옴표는 쓰지 않는다.
  const message = action === 'logout'
    ? '계정을 바꾸려면 이 창에 /logout 을 입력해 주세요. 연결 해제는 LEWORD 가 알아서 확인합니다.'
    : '이 창에서 구글 계정 로그인을 끝내 주세요. 로그인되면 LEWORD 가 알아서 연결하고 이 창을 닫습니다.';
  if (platform === 'win32') {
    // Both scripts are encoded so Unicode paths and quotes never reach command-line parsing.
    // 콘솔 출력 인코딩을 UTF-8 로 맞춰야 한글 안내가 깨지지 않는다.
    const ps = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Set-Location -LiteralPath '${cwd.replace(/'/g, "''")}'; Write-Host '${message}'; & agy`;
    const encoded = Buffer.from(ps, 'utf16le').toString('base64');
    const launch = `$authProcess = Start-Process -FilePath powershell.exe -ArgumentList @('-NoProfile', '-EncodedCommand', '${encoded}') -WindowStyle Normal -Wait -PassThru; exit $authProcess.ExitCode`;
    return {
      command: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(launch, 'utf16le').toString('base64')],
    };
  }
  const cleanEnv = Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([key, value]) => shellQuote(`${key}=${value}`)).join(' ');
  const script = `cd ${shellQuote(cwd)} && printf '%s\\n' ${shellQuote(message)} && exec env -i ${cleanEnv} agy`;
  if (platform === 'darwin') {
    const appleString = script.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return { command: 'osascript', args: ['-e', `tell application "Terminal" to do script "${appleString}"`] };
  }
  return { command: 'x-terminal-emulator', args: ['-e', 'sh', '-c', script] };
}

/** User completes the official terminal flow; success requires a fresh authentication probe. */
export async function runAgyAuth(action: 'login' | 'logout', hooks: AgentLoginHooks = {}): Promise<AgentCliStatus> {
  const cwd = await mkdtemp(join(tmpdir(), 'agentcli-agy-auth-'));
  const env = buildGeminiSubscriptionEnv();
  const command = agyAuthTerminalCommand(action, cwd, env);
  const session = startSpawnSession({ ...command, provider: 'gemini', cwd, env, timeoutMs: 300_000 });
  let cancelled = false;
  let launchFailure: unknown;
  // Terminal launchers may detach on macOS/Linux, so only a failed launch ends polling early.
  const settled = session.result.then((result) => {
    if (result.code !== 0) launchFailure = new Error(result.stderr || 'Gemini 연결 창이 종료되었습니다.');
  }).catch((error) => { launchFailure = error; });
  const started = Date.now();
  try {
    hooks.onTerminalRequired?.(action === 'logout'
      ? '열린 Gemini 창에 /logout을 입력해 주세요. 계정 연결 해제를 확인한 뒤 새 로그인을 시작합니다.'
      : '열린 Gemini 창에서 Google 로그인을 완료해 주세요. 완료되면 자동으로 연결됩니다.');
    hooks.onSessionReady?.({ writeLine: async () => 'closed', cancel: () => { cancelled = true; session.cancel(); } });
    while (Date.now() - started < 300_000) {
      if (cancelled) throw new AgentCliError('aborted', 'gemini', 'Gemini 연결을 취소했습니다.');
      if (launchFailure) throw launchFailure;
      clearAgentDetectionCache('gemini');
      const status = await detectAgent('gemini', { forceRefresh: true });
      if (cancelled) throw new AgentCliError('aborted', 'gemini', 'Gemini 연결을 취소했습니다.');
      if (action === 'login' ? status.loggedIn && status.available
        : status.installed && !status.loggedIn && status.errorCode === 'not_logged_in') {
        return action === 'login' ? { ...status, loginAction: 'authenticated' } : status;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new AgentCliError('timeout', 'gemini', 'Gemini 연결이 5분 안에 완료되지 않았습니다. 열린 창에서 로그인 상태를 확인해 주세요.');
  } finally {
    session.cancel();
    await settled;
    hooks.onSessionClosed?.();
    await rm(cwd, { recursive: true, force: true }).catch(() => {});
  }
}
