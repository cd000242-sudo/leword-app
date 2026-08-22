/**
 * AI 엔진(구독 CLI) 연동 IPC — Claude Code · Codex · Gemini.
 *
 * 사장님 UX(2026-08-17): "깔려 있으면 로그인만 하면 연동. 안 깔려 있으면
 * 자동으로 설치해 주고 로그인만 시키면 되지 않니." 그대로 만든다:
 *   미설치 → agent-cli-install (앱 소유 프리픽스에 npm 설치 — 관리자 권한·
 *            사용자 Node 불필요, 시스템 PATH 안 건드림)
 *   로그인 필요 → agent-cli-login-start (CLI 를 헤드리스로 띄우고 OAuth URL 을
 *            기본 브라우저로 직접 연다. 승인하면 자동 감지로 완료 확인)
 *   연동됨 → agent-cli-test 실왕복이 증거
 *
 * 로그인은 폴링 모델이다: start → (renderer 가 2초 간격) state → 필요 시
 * code 제출 → done. 렌더러 push 채널을 새로 뚫지 않아 preload 무변경.
 * OAuth URL 은 메인에서만 연다 — loginUrl.ts 주석의 지시(렌더러 전송 금지).
 */

import { ipcMain, shell } from 'electron';
import { spawn } from 'child_process';
import { detectAgent, clearAgentDetectionCache } from '../../utils/agent-cli/detect';
import type { AgentProvider, AgentCliStatus } from '../../utils/agent-cli/types';
import { runClaude } from '../../utils/agent-cli/claudeRunner';
import { runCodex } from '../../utils/agent-cli/codexRunner';
import { runGemini } from '../../utils/agent-cli/geminiRunner';
import { installAgent, loginAgent, logoutAgent } from '../../utils/agent-cli/installer';

const PROVIDERS: readonly AgentProvider[] = ['claude', 'codex', 'gemini', 'grok'];

/** 연동 테스트 프롬프트 — 짧고 결정적이라 요금 부담이 사실상 0이다. */
const TEST_PROMPT = '다음 단어를 그대로 한 번만 출력해라: 연동확인';

const TEST_TIMEOUT_MS = 60_000;

function isProvider(value: unknown): value is AgentProvider {
  return typeof value === 'string' && (PROVIDERS as readonly string[]).includes(value);
}

interface LoginSessionState {
  stage: 'starting' | 'waiting_browser' | 'code_required' | 'done' | 'failed';
  attempt?: number;
  /** 완료 시의 최종 상태. */
  status?: AgentCliStatus;
  error?: string;
  writeLine?: (value: string) => Promise<'accepted' | 'busy' | 'closed'>;
  cancel?: () => void;
}

const loginSessions = new Map<AgentProvider, LoginSessionState>();

export function setupAgentCliHandlers(): void {
  ipcMain.handle('agent-cli-status', async (_event, payload?: { forceRefresh?: boolean }) => {
    try {
      const forceRefresh = Boolean(payload?.forceRefresh);
      if (forceRefresh) clearAgentDetectionCache();
      const statuses = await Promise.all(
        PROVIDERS.map((provider) => detectAgent(provider, { forceRefresh })),
      );
      return { success: true, statuses };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[AGENT-CLI] 상태 감지 실패:', message);
      return { success: false, error: message };
    }
  });

  /*
   * 자동 설치 — 앱 소유 프리픽스(userData/agent-runtime)에 npm 글로벌 설치.
   * 진행 콜백이 없는 API 라(installer 원설계) "설치 중" 단일 상태로 감싼다.
   * 최대 5분. 성공 기준은 설치 후 detect 재검증까지 통과한 것(installer 내부).
   */
  ipcMain.handle('agent-cli-install', async (_event, payload: { provider?: string }) => {
    const provider = payload?.provider;
    if (!isProvider(provider)) return { success: false, error: '알 수 없는 프로바이더입니다.' };
    const started = Date.now();
    try {
      const result = await installAgent(provider);
      clearAgentDetectionCache(provider);
      return { success: true, provider, version: result.version || '', elapsedMs: Date.now() - started };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[AGENT-CLI] ${provider} 설치 실패:`, message);
      return { success: false, provider, error: message, elapsedMs: Date.now() - started };
    }
  });

  ipcMain.handle('agent-cli-login-start', async (_event, payload: { provider?: string; switchAccount?: boolean }) => {
    const provider = payload?.provider;
    if (!isProvider(provider)) return { success: false, error: '알 수 없는 프로바이더입니다.' };
    const existing = loginSessions.get(provider);
    if (existing && (existing.stage === 'starting' || existing.stage === 'waiting_browser' || existing.stage === 'code_required')) {
      return { success: true, provider, alreadyRunning: true };
    }

    /*
     * 계정 바꾸기(사장님 지적 2026-08-22 "앱에서 로그인하는 버튼은 없는데?").
     *
     * 로그인 버튼이 "설치됨 + 로그인 안 됨"일 때만 떠서, 이미 로그인된 사람은
     * 다른 계정으로 갈아탈 방법이 화면에 없었다. 사이트에는 [계정 바꾸기]가
     * 있는데 앱에는 없었다.
     * 그냥 다시 로그인시키면 CLI 가 "이미 로그인돼 있습니다"로 끝나므로
     * 기존 자격을 먼저 지워야 한다(2026-08-20 실측).
     */
    if (payload?.switchAccount) {
      try {
        await logoutAgent(provider);
      } catch (error) {
        // 로그아웃이 실패해도 로그인은 시도한다 — 이미 안 돼 있을 수도 있다.
        console.warn('[AGENT-CLI] 계정 바꾸기 로그아웃 실패(로그인은 계속):', error);
      }
    }

    const state: LoginSessionState = { stage: 'starting' };
    loginSessions.set(provider, state);

    void loginAgent(provider, {
      onLoginUrl: (url) => {
        state.stage = 'waiting_browser';
        // OAuth URL 은 메인에서만 연다(loginUrl.ts 지시). 렌더러로 보내지 않는다.
        void shell.openExternal(url);
      },
      onSessionReady: (controls) => {
        state.writeLine = controls.writeLine;
        state.cancel = controls.cancel;
      },
      onCodeRequired: (attempt) => {
        state.stage = 'code_required';
        state.attempt = attempt;
      },
      onSessionClosed: () => {
        if (state.stage !== 'done' && state.stage !== 'failed') state.stage = 'starting';
      },
    }).then((status) => {
      state.stage = 'done';
      state.status = status;
      clearAgentDetectionCache(provider);
    }).catch((error: unknown) => {
      state.stage = 'failed';
      state.error = error instanceof Error ? error.message : String(error);
    });

    return { success: true, provider };
  });

  ipcMain.handle('agent-cli-login-state', (_event, payload: { provider?: string }) => {
    const provider = payload?.provider;
    if (!isProvider(provider)) return { success: false, error: '알 수 없는 프로바이더입니다.' };
    const state = loginSessions.get(provider);
    if (!state) return { success: true, provider, stage: 'idle' };
    return {
      success: true,
      provider,
      stage: state.stage,
      attempt: state.attempt ?? null,
      loginAction: state.status?.loginAction ?? null,
      detail: state.status?.detail || '',
      error: state.error || '',
    };
  });

  ipcMain.handle('agent-cli-login-code', async (_event, payload: { provider?: string; code?: string }) => {
    const provider = payload?.provider;
    const code = String(payload?.code || '').trim();
    if (!isProvider(provider)) return { success: false, error: '알 수 없는 프로바이더입니다.' };
    const state = loginSessions.get(provider);
    if (!state?.writeLine) return { success: false, error: '진행 중인 로그인이 없습니다.' };
    if (!code) return { success: false, error: '코드가 비어 있습니다.' };
    const result = await state.writeLine(code);
    if (result === 'accepted' && state.stage === 'code_required') state.stage = 'waiting_browser';
    return { success: result === 'accepted', result };
  });

  ipcMain.handle('agent-cli-login-cancel', (_event, payload: { provider?: string }) => {
    const provider = payload?.provider;
    if (!isProvider(provider)) return { success: false, error: '알 수 없는 프로바이더입니다.' };
    const state = loginSessions.get(provider);
    state?.cancel?.();
    loginSessions.delete(provider);
    return { success: true };
  });

  ipcMain.handle('agent-cli-test', async (_event, payload: { provider?: string }) => {
    const provider = payload?.provider;
    if (!isProvider(provider)) {
      return { success: false, error: '알 수 없는 프로바이더입니다.' };
    }
    const started = Date.now();
    try {
      const runner = provider === 'claude' ? runClaude : provider === 'codex' ? runCodex : runGemini;
      const reply = await runner(TEST_PROMPT, { timeoutMs: TEST_TIMEOUT_MS });
      return {
        success: true,
        provider,
        reply: String(reply || '').slice(0, 200),
        elapsedMs: Date.now() - started,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[AGENT-CLI] ${provider} 연동 테스트 실패:`, message);
      return { success: false, provider, error: message, elapsedMs: Date.now() - started };
    }
  });

  /*
   * 구버전 채널 호환 — 예전 UI 의 '로그인 열기'(터미널 스폰). 새 UI 는
   * login-start 를 쓰지만, 열린 창이 옛 번들일 수 있어 채널은 남긴다.
   */
  ipcMain.handle('agent-cli-login', async (_event, payload: { provider?: string }) => {
    const provider = payload?.provider;
    if (!isProvider(provider)) return { success: false, error: '알 수 없는 프로바이더입니다.' };
    const command = provider === 'codex' ? 'codex login' : provider === 'gemini' ? 'agy login' : 'claude';
    try {
      if (process.platform === 'win32') {
        spawn('cmd', ['/c', 'start', `${provider} 로그인`, 'cmd', '/k', command], {
          detached: true, stdio: 'ignore', shell: false,
        }).unref();
      } else {
        spawn('sh', ['-c', `x-terminal-emulator -e ${command} || open -a Terminal`], {
          detached: true, stdio: 'ignore',
        }).unref();
      }
      clearAgentDetectionCache(provider);
      return { success: true, provider, guide: '터미널에서 로그인 완료 후 [다시 감지]를 누르세요.' };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, provider, error: message };
    }
  });
}
