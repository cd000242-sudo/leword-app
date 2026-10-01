/**
 * LEWORD 비서 실행(2026-10-01) — 사이트 브리지와 앱 화면이 같은 함수를 쓴다.
 * 사용자 본인 구독: 클로드는 Sonnet, 막히면 공통 순서(코덱스 → agy → 그록). 운영자 키는 쓰지 않는다.
 */
import type { AssistantInput } from '../utils/assistant/assistant-prompt';

export interface AssistantAnswer { answer: string; escalate: boolean; provider: string }

export async function runAssistant(input: AssistantInput): Promise<AssistantAnswer> {
  const { runWithAnyAgent } = await import('../utils/agent-cli/runAny');
  const { createDefaultAgentChain } = await import('../utils/agent-cli/defaultChain');
  const { buildAssistantPrompt, parseAssistantReply } = await import('../utils/assistant/assistant-prompt');
  let parsed: { answer: string; escalate: boolean } | null = null;
  const run = await runWithAnyAgent(buildAssistantPrompt(input), createDefaultAgentChain({ claudeModel: 'sonnet' }), {
    timeoutMs: 90_000,
    // 빈 답은 던져 다음 엔진에 기회를 준다.
    validate: (reply) => { parsed = parseAssistantReply(reply); },
  });
  const result = parsed ?? parseAssistantReply(run.reply);
  return { ...result, provider: run.provider };
}
