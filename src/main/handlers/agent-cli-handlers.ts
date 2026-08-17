/**
 * AI 엔진(구독 CLI) 연동 IPC — Claude Code · Codex · Gemini(agy).
 *
 * 사장님 지시(2026-08-17): "연동된 걸 어디서 확인할 수 있니? 배선까지 해놔야
 * 연동됐는지 알 거 아냐. 로그인이 필요하면 로그인도 넣어줘야지."
 *
 * 세 채널:
 *   agent-cli-status — 설치·로그인·요금제 실측 감지(모델 턴 소비 없음)
 *   agent-cli-test   — 실제 프롬프트 1회를 러너로 보내 응답을 받는 실증.
 *                      상태 배지가 아니라 왕복 응답이 연동의 증거다.
 *   agent-cli-login  — 터미널을 열어 해당 CLI 로그인으로 안내(OAuth 는 CLI 몫)
 *
 * 러너는 사용자 본인의 구독 세션으로 돈다(subscriptionEnv 가 API 키를 차단해
 * 종량 과금으로 새는 것을 막는다). 앱이 대신 로그인하거나 키를 만지지 않는다.
 */

import { ipcMain } from 'electron';
import { spawn } from 'child_process';
import { detectAgent, clearAgentDetectionCache } from '../../utils/agent-cli/detect';
import type { AgentProvider } from '../../utils/agent-cli/types';
import { runClaude } from '../../utils/agent-cli/claudeRunner';
import { runCodex } from '../../utils/agent-cli/codexRunner';
import { runGemini } from '../../utils/agent-cli/geminiRunner';

const PROVIDERS: readonly AgentProvider[] = ['claude', 'codex', 'gemini'];

/** 연동 테스트 프롬프트 — 짧고 결정적이라 요금 부담이 사실상 0이다. */
const TEST_PROMPT = '다음 단어를 그대로 한 번만 출력해라: 연동확인';

const TEST_TIMEOUT_MS = 60_000;

function isProvider(value: unknown): value is AgentProvider {
  return typeof value === 'string' && (PROVIDERS as readonly string[]).includes(value);
}

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

  ipcMain.handle('agent-cli-login', async (_event, payload: { provider?: string }) => {
    const provider = payload?.provider;
    if (!isProvider(provider)) {
      return { success: false, error: '알 수 없는 프로바이더입니다.' };
    }
    /*
     * 로그인 OAuth 는 CLI 자신의 일이다 — 앱이 자격증명을 만지면 안 된다.
     * 보이는 터미널을 열어 로그인 명령을 띄우고, 사용자가 끝내면 화면의
     * [다시 감지] 가 결과를 확인한다.
     */
    const command = provider === 'codex' ? 'codex login'
      : provider === 'gemini' ? 'agy login'
        : 'claude';
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
      return {
        success: true,
        provider,
        // Claude Code 는 셸 로그인 명령이 따로 없다 — 대화창에서 /login 을 친다.
        guide: provider === 'claude'
          ? '터미널에 Claude Code 가 열립니다. 창 안에서 /login 을 입력해 로그인하세요.'
          : '터미널에서 로그인을 완료한 뒤 [다시 감지]를 누르세요.',
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, provider, error: message };
    }
  });
}
