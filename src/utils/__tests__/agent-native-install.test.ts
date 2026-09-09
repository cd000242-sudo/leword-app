import { describe, expect, it } from 'vitest';
import { describeNativeInstallFailure, formatInstallDiagnostics, nativeInstallCommand } from '../agent-cli/nativeInstaller';
import { getClaudeNativeInstallDirs } from '../agent-cli/agentRuntime';
import { buildClaudeSubscriptionEnv } from '../agent-cli/subscriptionEnv';

/** Claude Code 네이티브 설치(Node 불필요) — 사장님 2026-09-09 "안 되는 컴도 있다". */
describe('nativeInstallCommand', () => {
    it('윈도우는 PowerShell 로 공식 install.ps1, 그 밖은 sh 로 install.sh — 셸 문자열이 아니라 spawn 인자다', () => {
        const win = nativeInstallCommand('win32');
        expect(win.command).toBe('powershell.exe');
        expect(win.args).toContain('-ExecutionPolicy');
        expect(win.args[win.args.length - 1]).toContain('irm https://claude.ai/install.ps1 | iex');
        const mac = nativeInstallCommand('darwin');
        expect(mac.command).toBe('sh');
        expect(mac.args[1]).toContain('curl -fsSL https://claude.ai/install.sh | bash');
    });
});

describe('getClaudeNativeInstallDirs · Claude PATH', () => {
    it('사용자 프로필 .local/bin 을 가리키고, Claude 실행 env 의 PATH 앞쪽에 들어간다', () => {
        const dirs = getClaudeNativeInstallDirs({ USERPROFILE: 'C:\\Users\\tester' });
        expect(dirs).toHaveLength(1);
        expect(dirs[0]).toMatch(/[\\/]\.local[\\/]bin$/);
        const env = buildClaudeSubscriptionEnv({ USERPROFILE: 'C:\\Users\\tester', HOME: '/home/tester', PATH: 'C:\\Windows' });
        const pathKey = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') || 'PATH';
        expect(String(env[pathKey])).toMatch(/\.local[\\/]bin/);
        expect(getClaudeNativeInstallDirs({})).toEqual([]);
    });
});

describe('describeNativeInstallFailure · formatInstallDiagnostics', () => {
    it('원인별로 초보자가 읽을 문장을 낸다', () => {
        expect(describeNativeInstallFailure(1, '', 'The remote name could not be resolved: claude.ai')).toContain('인터넷');
        expect(describeNativeInstallFailure(1, '', 'Access is denied')).toContain('권한');
        expect(describeNativeInstallFailure(3, 'step a\nstep b failed', '')).toContain('종료 코드 3');
    });
    it('진단 요약은 단계마다 한 줄이다', () => {
        const text = formatInstallDiagnostics('claude', [
            { name: '네이티브 설치(claude.ai/install.ps1)', status: 'failed', detail: '인터넷 차단' },
            { name: 'npm 설치(앱 전용 공간)', status: 'ok' },
        ], 'win32');
        expect(text.split('\n')).toHaveLength(3);
        expect(text).toContain('1. ❌ 네이티브 설치');
        expect(text).toContain('2. ✅ npm 설치');
    });
});
