/**
 * Claude Code 네이티브 설치 — Node·npm 없이 도는 공식 단일 실행 파일 설치기.
 *
 * 사장님 2026-09-09: "초보자들도 앱에서 에이전트를 쉽게 다운받고 설치되게끔. 되는 컴이 있는 반면 안 되는 컴도 있고".
 * 안 되던 컴의 공통점은 npm 부트스트랩(registry.npmjs.org 에서 npm 내려받기)이 백신·회사망에 막히는 것이었다.
 * Anthropic 공식 설치 스크립트는 Node 가 필요 없다 — 웹 2회 교차 확인(code.claude.com/docs/en/setup):
 *   Windows  : irm https://claude.ai/install.ps1 | iex
 *   macOS/Linux: curl -fsSL https://claude.ai/install.sh | bash
 * 사용자 프로필 .local/bin 에 놓고 사용자 PATH 에 더한다(관리자 권한 불필요). 앱은 그 폴더를 직접 PATH 에 얹는다(agentRuntime).
 *
 * 순수 부분(명령 조립·결과 판정)은 여기, 실행은 installer.ts 가 spawnCollect 로 한다.
 */
export const CLAUDE_NATIVE_INSTALL_URL_WINDOWS = 'https://claude.ai/install.ps1';
export const CLAUDE_NATIVE_INSTALL_URL_UNIX = 'https://claude.ai/install.sh';

export interface NativeInstallCommand {
  command: string;
  args: string[];
  /** 사용자에게 보여 줄 한 줄 */
  label: string;
}

/** 플랫폼별 공식 설치 명령. 렌더러 전송용 문자열이 아니라 spawn 인자다(셸 인젝션 없음). */
export function nativeInstallCommand(platform: NodeJS.Platform = process.platform): NativeInstallCommand {
  if (platform === 'win32') {
    return {
      command: 'powershell.exe',
      // -ExecutionPolicy Bypass: 회사 PC 의 Restricted 정책에서도 이 프로세스 안에서만 돈다. 시스템 설정은 안 바꾼다.
      args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
        `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm ${CLAUDE_NATIVE_INSTALL_URL_WINDOWS} | iex`],
      label: `PowerShell: irm ${CLAUDE_NATIVE_INSTALL_URL_WINDOWS} | iex`,
    };
  }
  return {
    command: 'sh',
    args: ['-c', `curl -fsSL ${CLAUDE_NATIVE_INSTALL_URL_UNIX} | bash`],
    label: `sh: curl -fsSL ${CLAUDE_NATIVE_INSTALL_URL_UNIX} | bash`,
  };
}

export type InstallStepStatus = 'ok' | 'failed' | 'skipped';

export interface InstallStep {
  name: string;
  status: InstallStepStatus;
  detail?: string;
}

/** 설치 스크립트 출력에서 사람이 읽을 원인 한 줄을 뽑는다 — 초보자에게 보여 줄 문장이다. */
export function describeNativeInstallFailure(code: number | null, stdout: string, stderr: string): string {
  const out = `${stderr || ''}\n${stdout || ''}`;
  if (/is not recognized|not found|ENOENT|No such file/i.test(out) && /powershell|curl|sh\b/i.test(out)) {
    return '설치 도구(PowerShell 또는 curl)를 찾지 못했습니다. 윈도우 업데이트 후 다시 시도해주세요.';
  }
  if (/Could not resolve|getaddrinfo|ENOTFOUND|ETIMEDOUT|timed out|Unable to connect|remote name could not be resolved|SSL|TLS|certificate/i.test(out)) {
    return '인터넷으로 claude.ai 에서 설치 파일을 받지 못했습니다. 백신·방화벽·회사 네트워크가 막고 있는지 확인한 뒤 다시 시도해주세요.';
  }
  if (/Access is denied|EPERM|EACCES|permission denied|액세스가 거부/i.test(out)) {
    return '설치 폴더에 쓰지 못했습니다(권한). 백신·보안 프로그램이 사용자 폴더 쓰기를 막고 있는지 확인해주세요.';
  }
  if (/execution.*policy|실행 정책/i.test(out)) {
    return 'PowerShell 실행 정책이 막았습니다. 회사 PC 정책이면 관리자에게 문의해주세요.';
  }
  const lastLine = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(-1)[0] || '';
  return `설치 스크립트가 종료 코드 ${code ?? '없음'} 으로 끝났습니다.${lastLine ? ` 마지막 출력: ${lastLine.slice(0, 160)}` : ''}`;
}

/** 진단 요약 — 렌더러의 "로그 복사"가 그대로 클립보드에 넣는다. 비밀은 없다(경로·종료 코드·마지막 줄만). */
export function formatInstallDiagnostics(provider: string, steps: readonly InstallStep[], platform: NodeJS.Platform = process.platform): string {
  const mark = (s: InstallStepStatus) => (s === 'ok' ? '✅' : s === 'failed' ? '❌' : '⏭');
  return [
    `LEWORD 에이전트 설치 진단 — ${provider} · ${platform} · ${new Date().toISOString()}`,
    ...steps.map((s, i) => `${i + 1}. ${mark(s.status)} ${s.name}${s.detail ? ` — ${s.detail}` : ''}`),
  ].join('\n');
}
