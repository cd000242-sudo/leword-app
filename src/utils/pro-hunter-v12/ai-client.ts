/**
 * 🤖 AI 통합 클라이언트 — Claude 추론 / 룰 기반 / 자동 전환
 *
 * 데스크톱 앱(2026-09-15, 사장님 "api 키는 안 쓰지 않니? 에이전트만 사용하도록 할 건데"): API 키를 쓰지 않고
 * 구독 에이전트 체인(Claude Code → Codex → 제미나이(agy) → Grok)만 쓴다. 에이전트가 전부 실패하면 예전처럼
 * RuleFallbackRequired 를 던져 호출한 쪽이 규칙 결과로 이어 간다.
 * 앱 밖(모바일 서버 · 스크립트)도 API 키로 AI 를 부르지 않는다(2026-09-16 사장님 결정 "서버 키 경로를 코드에서 제거") —
 * 서버의 pro-blueprint 가 draft-generator 로 이 함수를 불러도 늘 규칙 결과로 이어 간다.
 *
 * 모드:
 *   - 'rule':            AI 호출 안 함, 룰 기반 fallback 강제 (다른 자동화 도구와 호환)
 *   - 'auto' · 'claude': 데스크톱은 구독 에이전트 체인, 앱 밖은 룰 fallback
 *
 * 환경변수:
 *   - AI_INFERENCE_MODE  ('claude' | 'rule' | 'auto')
 *   - DISABLE_AI=1       테스트용 — 무조건 룰 fallback
 */

/** 데스크톱 앱의 에이전트 호출 제한 — 에이전트 CLI 는 API 보다 느리다(2026-09-15 실측 4~60초). */
const AGENT_TIMEOUT_MS = 120_000;

export interface AIInvocationOptions {
    maxTokens?: number;
    temperature?: number;
    system?: string;
}

export interface AIInvocationResult {
    text: string;
    /** 답한 곳 — 답한 구독 에이전트 이름(답은 데스크톱 앱에서만 온다). */
    source: 'claude' | 'codex' | 'gemini' | 'grok' | 'rule-fallback';
}

export class RuleFallbackRequired extends Error {
    constructor(reason: string) {
        super(`[ai-client] 룰 fallback 필요: ${reason}`);
        this.name = 'RuleFallbackRequired';
    }
}

/**
 * 현재 AI 모드 + Claude 키 가용성 조회
 */
export async function getAIMode(): Promise<{ mode: 'claude' | 'rule' | 'auto'; hasClaudeKey: boolean }> {
    if (process.env.DISABLE_AI === '1') return { mode: 'rule', hasClaudeKey: false };
    try {
        const { EnvironmentManager } = await import('../environment-manager');
        const env = EnvironmentManager.getInstance().getConfig();
        const mode = (env.aiInferenceMode || 'auto') as 'claude' | 'rule' | 'auto';
        const hasClaudeKey = !!(env.anthropicApiKey && env.anthropicApiKey.startsWith('sk-ant-'));
        return { mode, hasClaudeKey };
    } catch {
        return { mode: 'auto', hasClaudeKey: false };
    }
}

/**
 * AI 호출이 가능한지 (Claude 모드 + 키 있거나 / Auto 모드 + 키 있거나)
 */
export async function canUseAI(): Promise<boolean> {
    const { mode, hasClaudeKey } = await getAIMode();
    if (mode === 'rule') return false;
    if (mode === 'claude') return hasClaudeKey;
    return hasClaudeKey;  // auto: 키 있을 때만 사용
}

/**
 * 데스크톱 앱 안에서 도는지. LEWORD_AI_AGENT_ONLY=1 은 테스트 · 도구용 강제 스위치다.
 * ELECTRON_RUN_AS_NODE 자식 프로세스(이 PC 판 발굴 스크립트 등)는 앱이 아니라 스크립트로 본다.
 */
export function runsInDesktopApp(): boolean {
    if (process.env.LEWORD_AI_AGENT_ONLY === '1') return true;
    return Boolean(process.versions.electron) && process.env.ELECTRON_RUN_AS_NODE !== '1';
}

/**
 * 구독 에이전트 체인으로 부른다. 에이전트 모듈은 electron 을 불러오므로, 모바일 서버가 이 파일을 읽어도
 * 터지지 않게 여기서만 늦게 불러온다. maxTokens · temperature 는 에이전트 CLI 에 넘길 방법이 없어 쓰지 않는다.
 */
async function callAgentChain(prompt: string, options: AIInvocationOptions): Promise<AIInvocationResult> {
    const { runWithAnyAgent } = await import('../agent-cli/runAny');
    const { createDefaultAgentChain } = await import('../agent-cli/defaultChain');
    const fullPrompt = options.system ? `${options.system}\n\n${prompt}` : prompt;
    try {
        const run = await runWithAnyAgent(fullPrompt, createDefaultAgentChain(), { timeoutMs: AGENT_TIMEOUT_MS });
        return { text: run.reply.trim(), source: run.provider };
    } catch (err: any) {
        // 조용히 삼키지 않는다 — 규칙 결과로 이어 가되 왜 그런지 로그에 남긴다.
        console.warn('[ai-client] 구독 에이전트 전부 실패 → 룰 fallback:', err?.message || err);
        throw new RuleFallbackRequired(`구독 에이전트 전부 실패 (${err?.message || 'unknown'})`);
    }
}

/**
 * 통합 AI 호출 — 모드에 따라 Claude / 룰 fallback 결정
 *
 * 호출 측은:
 *   try {
 *     const { text } = await callAI(prompt);
 *     // text 파싱
 *   } catch (err) {
 *     if (err instanceof RuleFallbackRequired) {
 *       // 룰 기반 fallback 실행
 *     } else throw err;
 *   }
 */
export async function callAI(
    prompt: string,
    options: AIInvocationOptions = {}
): Promise<AIInvocationResult> {
    const { mode } = await getAIMode();

    if (mode === 'rule') {
        throw new RuleFallbackRequired('mode=rule (사용자 설정)');
    }
    // 데스크톱 앱은 API 키를 쓰지 않는다 — 저장된 Anthropic 키가 있어도 구독 에이전트 체인만 탄다.
    if (runsInDesktopApp()) return callAgentChain(prompt, options);
    // 앱 밖(모바일 서버 · 스크립트)도 API 키로 AI 를 부르지 않는다(2026-09-16 사장님 결정) — 서버 환경변수에 키가 있어도
    // 돈이 나가지 않게, 호출한 쪽이 규칙 결과로 이어 가게 한다.
    throw new RuleFallbackRequired('앱 밖에서는 API 키로 AI 를 부르지 않음');
}

// 키 검증 함수(verifyClaudeKey)는 지웠다(2026-09-15) — 데스크톱 앱이 API 키를 쓰지 않아 검증할 키가 없다.
