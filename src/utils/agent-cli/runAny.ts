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
 * 실패를 조용히 삼키지 않는다. 전부 실패하면 제공자별 사유를 모아 던진다 —
 * 빈 배열을 돌려주면 "AI 가 아무 제안도 안 했다"로 오독되어, 배선이 끊긴
 * 것을 품질 문제로 착각하게 된다(실제로 그렇게 한 회차를 잃었다).
 *
 * ## 폴백 완성 (2026-09-15, 사장님 "코덱스나 제미나이도 폴백이 완벽히 되게")
 *
 * - 답 검사(validate): 공백만 아니면 성공이던 탓에, 클로드가 설명문을 내면 JSON 을 줄 수 있던
 *   코덱스 · 제미나이가 시도조차 안 됐다. 검사를 통과해야 성공이다.
 * - 막힌 엔진 기억(engineHealth): 한도 · 미로그인 엔진을 매 요청 다시 띄우지 않는다. 실측에서 한도 찬 agy 는
 *   2분, 로그인 풀린 코덱스는 22초를 쓰고서야 실패를 알렸다. 원인 코드가 붙은 실패만 기억한다.
 * - 취소: 취소는 다음 엔진으로 넘기지 않고 체인 전체를 멈춘다.
 * - 전체 대기 상한(deadlineMs): 엔진마다 제한 시간을 새로 주면 최악 대기가 엔진 수 × 제한 시간이다.
 */

import { sanitizeUserVisibleError } from './userVisibleError';
import { getEngineCooldown, recordEngineFailure, recordEngineSuccess } from './engineHealth';
import { AgentCliError } from './types';

export type AgentProviderName = 'claude' | 'codex' | 'gemini' | 'grok';

/** 엔진에 넘기는 실행 옵션 — 제한 시간과 취소 신호만 넘긴다(답 검사 · 전체 상한은 체인이 맡는다). */
export interface AgentRunCallOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface AgentAttempt {
  provider: AgentProviderName;
  run: (prompt: string, options?: AgentRunCallOptions) => Promise<string>;
}

export interface AgentRunOptions extends AgentRunCallOptions {
  /** 답을 받은 뒤 검사한다. 던지면 그 엔진은 실패로 치고 다음 엔진에 기회를 준다. */
  validate?: (reply: string) => void;
  /** 체인 전체 대기 상한(ms). 엔진마다 남은 시간만큼만 준다. */
  deadlineMs?: number;
  /** 테스트용 시계. */
  now?: () => number;
}

export interface AgentRunResult {
  reply: string;
  provider: AgentProviderName;
  /** 실제로 띄운 순서. 어떤 경로로 이 결과가 나왔는지 로그에 남긴다. */
  tried: AgentProviderName[];
  /** 막힌 엔진 기억 · 전체 대기 상한 때문에 띄우지 않은 엔진. */
  skipped: AgentProviderName[];
  /** 실패하거나 건너뛴 제공자별 사유. 성공한 제공자는 들어 있지 않다. */
  failures: Record<string, string>;
}

export class AllAgentsFailedError extends Error {
  constructor(
    readonly tried: AgentProviderName[],
    readonly failures: Record<string, string>,
    readonly skipped: AgentProviderName[] = [],
  ) {
    super(`구독 CLI 전부 실패: ${Object.entries(failures).map(([provider, reason]) => `${provider}: ${reason}`).join(' → ') || 'no_agent_configured'}`);
    this.name = 'AllAgentsFailedError';
  }
}

/** 남은 전체 시간이 이보다 적으면 다음 엔진을 띄우지 않는다 — 띄워 봐야 답 전에 끊긴다. */
const MIN_ATTEMPT_MS = 10_000;

/**
 * 사용 장부에 한 줄 적는다 — "얼마나 썼나"를 이 앱이 직접 세기 위해서다
 * (사장님 지시 2026-08-22: 코덱스·제미나이·그록은 서비스가 사용량을 안 준다).
 *
 * 동적으로 부른다. 이 파일은 CI 스크립트(enrich-board.js 등)에서도 도는데,
 * 장부는 electron 의 userData 경로를 쓴다 — 위에서 정적으로 import 하면
 * 일렉트론 없는 환경에서 모듈 로드 자체가 터진다. 기록이 안 되는 건 감수한다.
 */
async function recordRun(provider: AgentProviderName, ok: boolean): Promise<void> {
  try {
    const { recordAgentRun } = await import('./usageLedger');
    await recordAgentRun(provider, ok);
  } catch {
    // 일렉트론 밖(CI)에서는 적지 않는다. 추론은 이미 끝났으니 막지 않는다.
  }
}

function isAbortFailure(error: unknown, signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted) || (error instanceof AgentCliError && error.code === 'aborted');
}

/** 정해진 값만 넘긴다 — 엔진 쪽 기본값(예: agy 의 print-timeout)이 undefined 로 덮이지 않게. */
function callOptions(timeoutMs: number | undefined, signal: AbortSignal | undefined): AgentRunCallOptions {
  return {
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(signal ? { signal } : {}),
  };
}

export async function runWithAnyAgent(
  prompt: string,
  attempts: readonly AgentAttempt[],
  options: AgentRunOptions = {},
): Promise<AgentRunResult> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const tried: AgentProviderName[] = [];
  const skipped: AgentProviderName[] = [];
  const failures: Record<string, string> = {};

  for (const attempt of attempts) {
    if (options.signal?.aborted) {
      throw new AgentCliError('aborted', attempt.provider, '작업이 취소되었습니다.');
    }

    const cooldown = getEngineCooldown(attempt.provider, now());
    if (cooldown) {
      skipped.push(attempt.provider);
      failures[attempt.provider] = `건너뜀: ${cooldown.reason}`;
      continue;
    }

    const remaining = options.deadlineMs !== undefined
      ? options.deadlineMs - (now() - startedAt)
      : undefined;
    if (remaining !== undefined && remaining < MIN_ATTEMPT_MS) {
      skipped.push(attempt.provider);
      failures[attempt.provider] = '건너뜀: 전체 대기 상한 도달';
      continue;
    }
    const timeoutMs = remaining === undefined
      ? options.timeoutMs
      : Math.min(options.timeoutMs ?? remaining, remaining);

    tried.push(attempt.provider);
    try {
      const reply = await attempt.run(prompt, callOptions(timeoutMs, options.signal));
      // 공백만 온 것은 성공이 아니다 — 다음 제공자에게 기회를 준다.
      if (typeof reply !== 'string' || reply.trim().length === 0) {
        failures[attempt.provider] = 'empty_reply';
        await recordRun(attempt.provider, false);
        continue;
      }
      if (options.validate) {
        try {
          options.validate(reply);
        } catch (error) {
          // 형식 불량은 쉬게 하지 않는다 — 같은 엔진이 다음 요청에선 제대로 낼 수 있다.
          failures[attempt.provider] = `답 형식 불량: ${sanitizeUserVisibleError(error)}`;
          await recordRun(attempt.provider, false);
          continue;
        }
      }
      recordEngineSuccess(attempt.provider);
      await recordRun(attempt.provider, true);
      return { reply, provider: attempt.provider, tried, skipped, failures };
    } catch (error) {
      if (isAbortFailure(error, options.signal)) throw error;
      failures[attempt.provider] = sanitizeUserVisibleError(error);
      if (error instanceof AgentCliError) {
        recordEngineFailure(attempt.provider, error.code, `${error.message}\n${error.detail ?? ''}`, now());
      }
      // 실패도 적는다 — 한도에 부딪힌 것도 사용이다.
      await recordRun(attempt.provider, false);
    }
  }

  throw new AllAgentsFailedError(tried, failures, skipped);
}
