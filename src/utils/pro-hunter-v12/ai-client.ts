/**
 * 🤖 AI 통합 클라이언트 — Claude 추론 / 룰 기반 / 자동 전환
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
const MAX_RETRIES = 1;
const TIMEOUT_MS = 30000;

export interface AIInvocationOptions {
    maxTokens?: number;
    temperature?: number;
    system?: string;
}

export interface AIInvocationResult {
    text: string;
    source: 'claude' | 'rule-fallback';
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
            const retryable = status === 429 || (status >= 500 && status < 600) || err?.code === 'ETIMEDOUT';
            if (attempt < MAX_RETRIES && retryable) {
                await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
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

/**
 * 키 검증용 — 짧은 ping 호출
 */
export async function verifyClaudeKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
    if (!apiKey || !apiKey.startsWith('sk-ant-')) {
        return { ok: false, error: 'Anthropic 키 형식 오류 (sk-ant-... 이어야 함)' };
    }
    try {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const client = new Anthropic({ apiKey, timeout: 10000 });
        const resp = await client.messages.create({
            model: CLAUDE_MODEL,
            max_tokens: 16,
            messages: [{ role: 'user', content: 'ping' }],
        });
        return { ok: !!resp.id };
    } catch (err: any) {
        const status = err?.status || err?.response?.status;
        return { ok: false, error: status ? `HTTP ${status}: ${err?.message}` : (err?.message || 'unknown') };
    }
}
