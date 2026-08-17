/**
 * 구독 CLI 공용 실행기 — 하나가 죽어도 다음 것으로 간다.
 *
 * ## 왜 필요한가 (2026-08-18 실측)
 *
 * 데스크톱 경로(lane-insights-service)는 claude → codex → gemini 를 차례로
 * 시도하는데, CI 보강(enrich-board.js)은 runClaude 하나만 불렀다. 그래서
 * 클로드가 로그인에 실패한 회차는 코덱스 구독이 멀쩡히 살아 있는데도 30회
 * 호출이 전부 죽어 제안 0건으로 끝났다. 같은 일을 하는 두 경로가 다른 배선을
 * 쓰면, 한쪽에서 고친 것이 다른 쪽에 반영되지 않는다.
 *
 * 실패를 조용히 삼키지 않는다. 전부 실패하면 마지막 사유를 들고 던진다 —
 * 빈 배열을 돌려주면 "AI 가 아무 제안도 안 했다"로 오독되어, 배선이 끊긴
 * 것을 품질 문제로 착각하게 된다(실제로 그렇게 한 회차를 잃었다).
 */

export type AgentProviderName = 'claude' | 'codex' | 'gemini';

export interface AgentAttempt {
  provider: AgentProviderName;
  run: (prompt: string, options?: { timeoutMs?: number }) => Promise<string>;
}

export interface AgentRunResult {
  reply: string;
  provider: AgentProviderName;
  /** 실제로 시도한 순서. 어떤 경로로 이 결과가 나왔는지 로그에 남긴다. */
  tried: AgentProviderName[];
  /** 실패한 제공자별 사유. 성공한 제공자는 들어 있지 않다. */
  failures: Record<string, string>;
}

export async function runWithAnyAgent(
  prompt: string,
  attempts: readonly AgentAttempt[],
  options: { timeoutMs?: number } = {},
): Promise<AgentRunResult> {
  const tried: AgentProviderName[] = [];
  const failures: Record<string, string> = {};
  let lastError = 'no_agent_configured';

  for (const attempt of attempts) {
    tried.push(attempt.provider);
    try {
      const reply = await attempt.run(prompt, options);
      // 공백만 온 것은 성공이 아니다 — 다음 제공자에게 기회를 준다.
      if (typeof reply === 'string' && reply.trim().length > 0) {
        return { reply, provider: attempt.provider, tried, failures };
      }
      lastError = 'empty_reply';
      failures[attempt.provider] = lastError;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      failures[attempt.provider] = lastError;
    }
  }

  throw new Error(`구독 CLI 전부 실패 (${tried.join(' → ')}): ${lastError}`);
}
