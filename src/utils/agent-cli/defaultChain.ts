import { runClaude } from './claudeRunner';
import { runCodex } from './codexRunner';
import { runGemini } from './geminiRunner';
import { runGrok } from './grokRunner';
import type { AgentAttempt } from './runAny';

/** 모든 자동 생성 경로의 순서. 개별 연결 진단은 해당 제공자만 직접 호출한다. */
export function createDefaultAgentChain(options: {
  claudeModel?: string;
  preferredProvider?: string;
} = {}): AgentAttempt[] {
  const chain: AgentAttempt[] = [
    { provider: 'claude', run: (prompt, opts) => runClaude(prompt, {
      ...opts, ...(options.claudeModel ? { model: options.claudeModel } : {}),
    }) },
    { provider: 'codex', run: runCodex },
    { provider: 'gemini', run: runGemini },
    { provider: 'grok', run: runGrok },
  ];
  // 명시적으로 고른 제공자는 먼저 쓰되, 실패했을 때 나머지 연결을 잃지 않는다.
  const preferred = chain.find((item) => item.provider === options.preferredProvider);
  return preferred ? [preferred, ...chain.filter((item) => item !== preferred)] : chain;
}
