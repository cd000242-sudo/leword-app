/**
 * 🤖 AI 통합 클라이언트 — Claude 추론 / 룰 기반 / 자동 전환
 *
 * 데스크톱 앱(2026-09-15, 사장님 "api 키는 안 쓰지 않니? 에이전트만 사용하도록 할 건데"): API 키를 쓰지 않고
 * 구독 에이전트 체인(Claude Code → Codex → 제미나이(agy) → Grok)만 쓴다. 에이전트가 전부 실패하면 예전처럼
 * RuleFallbackRequired 를 던져 호출한 쪽이 규칙 결과로 이어 간다. 아래 Anthropic API 경로는 앱 밖(모바일 서버 ·
 * 스크립트)에서만 탄다 — 서버의 pro-blueprint 가 draft-generator 로 이 함수를 부른다.
 *
 * 모드:
 *   - 'claude': 무조건 Claude 호출 (키 없으면 throw)
 *   - 'rule':   AI 호출 안 함, 룰 기반 fallback 강제 (다른 자동화 도구와 호환)
 *   - 'auto':   키 있으면 Claude, 없거나 5xx면 룰 자동 전환 (기본)
 *
 * 환경변수:
 *   - AI_INFERENCE_MODE  ('claude' | 'rule' | 'auto')
 *   - DISABLE_AI=1       테스트용 — 무조건 룰 fallback
 *   - ANTHROPIC_API_KEY  Claude 키
 */

const CLAUDE_MODEL = 'claude-sonnet-4-6';
// v2.43.50: 529 overloaded 대응 — 재시도 3회 + exponential backoff
const MAX_RETRIES = 3;
const TIMEOUT_MS = 30000;
/** 데스크톱 앱의 에이전트 호출 제한 — 에이전트 CLI 는 API 보다 느리다(2026-09-15 실측 4~60초). */
const AGENT_TIMEOUT_MS = 120_000;

export interface AIInvocationOptions {
    maxTokens?: number;
    temperature?: number;
    system?: string;
}

export interface AIInvocationResult {
    text: string;
    /** 답한 곳 — 데스크톱은 답한 에이전트 이름, 앱 밖은 'claude'(API). */
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
    const { mode, hasClaudeKey } = await getAIMode();

    if (mode === 'rule') {
        throw new RuleFallbackRequired('mode=rule (사용자 설정)');
    }
    // 데스크톱 앱은 API 키를 쓰지 않는다 — 저장된 Anthropic 키가 있어도 구독 에이전트 체인만 탄다.
    if (runsInDesktopApp()) return callAgentChain(prompt, options);
    if (!hasClaudeKey) {
        if (mode === 'claude') throw new Error('Claude 모드인데 ANTHROPIC_API_KEY 미설정');
        throw new RuleFallbackRequired('Claude 키 미설정 (auto 모드)');
    }

    // Claude 호출
    const { EnvironmentManager } = await import('../environment-manager');
    const env = EnvironmentManager.getInstance().getConfig();
    const apiKey = env.anthropicApiKey!;

    let lastErr: any;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const Anthropic = (await import('@anthropic-ai/sdk')).default;
            const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS });
            const resp = await client.messages.create({
                model: CLAUDE_MODEL,
                max_tokens: options.maxTokens ?? 2048,
                temperature: options.temperature ?? 0.7,
                system: options.system,
                messages: [{ role: 'user', content: prompt }],
            });
            const text = resp.content
                .filter((b: any) => b.type === 'text')
                .map((b: any) => b.text)
                .join('\n')
                .trim();
            if (!text) throw new Error('Claude 빈 응답');
            return { text, source: 'claude' };
        } catch (err: any) {
            lastErr = err;
            const status = err?.status || err?.response?.status;
            const retryable = status === 429 || status === 529 || (status >= 500 && status < 600) || err?.code === 'ETIMEDOUT';
            if (attempt < MAX_RETRIES && retryable) {
                // v2.43.50: 529 (overloaded) 는 더 긴 backoff — exponential + jitter
                const base = status === 529 ? 5000 : 1500;
                const wait = base * Math.pow(2, attempt) + Math.floor(Math.random() * 1000);
                console.warn(`[ai-client] HTTP ${status} → ${wait}ms 대기 후 재시도 ${attempt + 1}/${MAX_RETRIES}`);
                await new Promise(r => setTimeout(r, wait));
                continue;
            }
            break;
        }
    }

    // Claude 모드 = 에러 표면화 / Auto 모드 = 룰 fallback
    if (mode === 'claude') {
        throw new Error(`Claude 호출 실패: ${lastErr?.message || lastErr}`);
    }
    throw new RuleFallbackRequired(`Claude 호출 실패 → 룰 fallback (${lastErr?.message || 'unknown'})`);
}

// 키 검증 함수(verifyClaudeKey)는 지웠다(2026-09-15) — 데스크톱 앱이 API 키를 쓰지 않아 검증할 키가 없다.
