/**
 * LEWORD 비서 실행(2026-10-01) — 사이트 브리지와 앱 화면이 같은 함수를 쓴다.
 * 사용자 본인 구독: 클로드는 Sonnet, 막히면 공통 순서(코덱스 → agy → 그록). 운영자 키는 쓰지 않는다.
 *
 * 에이전트(2026-10-06, 사장님 "AI비서는 에이전트로 움직이니까"): 모델이 [도구] 블록을 내면 앱이 실측 함수를 돌리고
 * 결과를 붙여 다시 묻는다(최대 3번). 엔진의 도구 · MCP 격리는 그대로 둔다 — 실측은 앱이 한다.
 */
import type { AssistantInput } from '../utils/assistant/assistant-prompt';
import type { AssistantToolDeps } from './assistant-tool-runner';
import type { AgentAttempt, AgentRunOptions, AgentRunResult } from '../utils/agent-cli/runAny';

export interface AssistantAnswer { answer: string; escalate: boolean; provider: string; tools?: string[] }

/**
 * 도구를 부를 수 있는 차례 수 — 그다음 차례는 지금 가진 자료로 답해야 한다.
 * 키워드 고르기는 내 블로그 → 연관어 → 검색량 · 문서수 → 자리 4차례가 든다(실주행 2026-10-06: 3이면 자리 전에 끝났다).
 */
export const TOOL_ROUNDS = 5;
/** 질문 하나 전체 상한 — 브리지(Node 기본 300초) · 사이트 요청 상한보다 짧게. */
const TOTAL_MS = 240_000;
const ROUND_MS = 150_000;
const MIN_ROUND_MS = 20_000;
/** 쌓인 실측 결과가 이보다 길면 앞(오래된 것)을 자른다. */
const TOOL_LOG_CHARS = 14_000;

export interface RunAssistantOptions {
  onProgress?: (label: string) => void;
  /** 테스트용 — 실측 창구 · 엔진 실행 · 시계. */
  deps?: AssistantToolDeps;
  runAgent?: (prompt: string, options: AgentRunOptions) => Promise<AgentRunResult>;
  now?: () => number;
}

export async function runAssistant(input: AssistantInput, options: RunAssistantOptions = {}): Promise<AssistantAnswer> {
  const { buildAssistantPrompt, parseAssistantReply } = await import('../utils/assistant/assistant-prompt');
  const { parseToolRequest, formatToolResults, createToolBudget } = await import('../utils/assistant/assistant-tools');
  const { runAssistantTools, createRealToolDeps } = await import('./assistant-tool-runner');
  const now = options.now ?? Date.now;
  const runAgent = options.runAgent ?? (await defaultRunner());
  const startedAt = now();
  const budget = createToolBudget();
  const used: string[] = [];
  let deps = options.deps ?? null;
  let toolLog = '';

  for (let round = 0; round <= TOOL_ROUNDS; round += 1) {
    const roundsLeft = TOOL_ROUNDS - round;
    const remaining = TOTAL_MS - (now() - startedAt);
    // 시간이 모자라면 도구 없이 지금 자료로 답하게 한다.
    const lastCall = roundsLeft === 0 || remaining < MIN_ROUND_MS * 2;
    const prompt = buildAssistantPrompt(input, undefined, { toolLog, roundsLeft: lastCall ? 0 : roundsLeft });
    let calls: ReturnType<typeof parseToolRequest> = null;
    let parsed: { answer: string; escalate: boolean } | null = null;
    const run = await runAgent(prompt, {
      timeoutMs: 90_000,
      // 엔진마다 90초를 새로 주면 최악 6분을 기다린다 — 남은 시간 안에서만 준다.
      deadlineMs: Math.max(MIN_ROUND_MS, Math.min(ROUND_MS, remaining)),
      validate: (reply) => {
        const request = parseToolRequest(reply);
        // 마지막 차례에 또 도구를 청하면 답이 아니다 — 다음 엔진에 기회를 준다.
        if (request !== null && lastCall) throw new Error('도구를 더 청했다');
        if (request !== null) { calls = request; return; }
        parsed = parseAssistantReply(reply);
      },
    });
    const requested = calls as ReturnType<typeof parseToolRequest>;
    if (requested === null) {
      const result = parsed ?? parseAssistantReply(run.reply);
      return { ...result, provider: run.provider, ...(used.length ? { tools: used } : {}) };
    }
    if (requested.length === 0) {
      toolLog = `${toolLog}\n\n[형식 오류] [도구] 다음 JSON 을 읽지 못했다 — {"calls":[{"tool":"이름","args":{…}}]} 그대로 다시 내라.`.trim();
      continue;
    }
    deps = deps ?? (await createRealToolDeps());
    const results = await runAssistantTools(requested, deps, budget, options.onProgress);
    used.push(...requested.map((call) => call.tool));
    toolLog = `${toolLog}\n\n${formatToolResults(results)}`.trim();
    if (toolLog.length > TOOL_LOG_CHARS) toolLog = `…(앞부분 잘림)\n${toolLog.slice(-TOOL_LOG_CHARS)}`;
  }
  // 루프는 마지막 차례에 반드시 답하거나 던진다 — 여기까지 오면 엔진이 형식을 계속 틀린 것이다.
  throw new Error('비서가 답을 끝내지 못했습니다.');
}

async function defaultRunner(): Promise<(prompt: string, options: AgentRunOptions) => Promise<AgentRunResult>> {
  const { runWithAnyAgent } = await import('../utils/agent-cli/runAny');
  const { createDefaultAgentChain } = await import('../utils/agent-cli/defaultChain');
  const chain: readonly AgentAttempt[] = createDefaultAgentChain({ claudeModel: 'sonnet' });
  return (prompt, options) => runWithAnyAgent(prompt, chain, options);
}
