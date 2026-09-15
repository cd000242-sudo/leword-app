// agy (Antigravity CLI) runner — headless content generation via the user's Antigravity subscription.
//
// [v2.11.145] Migrated off `gemini` (@google/gemini-cli). Google stopped serving Gemini CLI
// requests for individual accounts on 2026-06-18, so every call failed with
// "IneligibleTierError: This client is no longer supported for Gemini Code Assist for individuals".
// agy authenticates the same Google account through the OS keyring instead.
//
// Invocation: agy --output-format json --print-timeout <n>s   (prompt on stdin, UTF-8)
//   - stdin is a pipe (non-TTY) here, so agy runs in print mode.
//   - --output-format json (2026-09-15, agy 1.2.3 measured on an account whose free quota was used up):
//     plain output retried 6 times for the whole print-timeout (2m) and exited 0 with EMPTY stdout, so the
//     app saw only "empty reply" and lost the real cause. The JSON envelope carries it:
//       {"conversation_id":…,"status":"ERROR","response":"","error":"API error (attempt 6): RESOURCE_EXHAUSTED
//        (code 429): Individual quota reached. … Resets in 87h35m9s.",…}
//     The success status value is not documented and could not be measured on that account, so any status
//     outside the error family with a non-empty response counts as success.
//   - Since agy 1.1.28 a print timeout returns the partial answer as if it were complete (Lykhoyda/ask-llm
//     #325). stderr then says "[agy] print timeout after …; returning partial output" — such answers are dropped.
//   - --print-timeout defaults to 5m, SHORTER than the app's 6m agent deadline. Left implicit,
//     agy would cut long posts off before the caller's own timeout ever fired.
//   - --model replaces gemini's -m.
//
// Measured on agy 1.1.5 with the app's real 13,193-char prompt: exit 0, 52.4s, 4,291 chars of
// clean JSON on stdout, empty stderr.

import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnCollect } from './spawnHelper';
import { classifyExit, tryExtractJson } from './parse';
import { buildGeminiSubscriptionEnv } from './subscriptionEnv';
import { agentCommandName } from './commandName';
import { AgentCliError, type AgentErrorCode } from './types';
import { buildAgentFailureMessage } from './failureMessage';

/** Let agy report its own timeout before spawnCollect SIGKILLs it. */
const PRINT_TIMEOUT_MARGIN_MS = 5_000;
const MIN_PRINT_TIMEOUT_SEC = 30;
/** agy 가 print-timeout 에 걸려 미완성 답을 돌려줄 때 표준에러에 남기는 문구(2026-09-15 실측). */
const PARTIAL_TIMEOUT_PATTERN = /print timeout after .*returning partial output/i;
/** 봉투 status 중 실패로 볼 것. 성공 값은 문서에 없어 이 목록 밖이면서 답이 있으면 성공으로 본다. */
const FAILED_STATUS_PATTERN = /error|fail|timeout|cancel/i;

export interface GeminiRunOptions {
  /** API symmetry with codex. agy has --json-schema, but its success envelope could not be measured yet, so unused. */
  schema?: Record<string, unknown>;
  model?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

function printTimeoutArgs(timeoutMs?: number): string[] {
  if (!timeoutMs || timeoutMs <= 0) return []; // no caller deadline → keep agy's own default
  const seconds = Math.max(
    MIN_PRINT_TIMEOUT_SEC,
    Math.ceil((timeoutMs - PRINT_TIMEOUT_MARGIN_MS) / 1000),
  );
  return ['--print-timeout', `${seconds}s`];
}

interface AgyEnvelope {
  status?: unknown;
  response?: unknown;
  error?: unknown;
}

/** JSON 봉투면 그 객체를, 아니면 null. 봉투 필드가 하나도 없는 JSON(옛 평문 답이 JSON 이던 경우)은 봉투로 보지 않는다. */
function readAgyEnvelope(stdout: string): AgyEnvelope | null {
  const parsed = tryExtractJson(stdout);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  return 'status' in record || 'response' in record || 'error' in record ? record : null;
}

function fail(code: AgentErrorCode, detail: string): never {
  const text = String(detail ?? '');
  throw new AgentCliError(code, 'gemini', buildAgentFailureMessage('gemini', code, text), text.slice(0, 800));
}

/**
 * Run `agy` for a single prompt and return the final response text.
 * Throws AgentCliError on failure (install / login / rate-limit / timeout / empty output).
 */
export async function runGemini(prompt: string, opts: GeminiRunOptions = {}): Promise<string> {
  const { model, timeoutMs, signal } = opts;
  // Throwaway cwd so project context files near the caller's cwd are not auto-discovered.
  const dir = await mkdtemp(join(tmpdir(), 'agentcli-gemini-'));

  try {
    const args = ['--output-format', 'json', ...printTimeoutArgs(timeoutMs)];
    if (model) args.push('--model', model);

    const res = await spawnCollect({
      command: agentCommandName('gemini'),
      args,
      provider: 'gemini',
      cwd: dir,
      stdin: prompt,
      timeoutMs,
      signal,
      env: buildGeminiSubscriptionEnv(),
    });

    const stdout = res.stdout ?? '';
    const stderr = res.stderr ?? '';
    const partialTimeout = PARTIAL_TIMEOUT_PATTERN.test(stderr);
    const envelope = readAgyEnvelope(stdout);

    if (envelope) {
      const errorText = typeof envelope.error === 'string' ? envelope.error.trim() : '';
      const status = typeof envelope.status === 'string' ? envelope.status : '';
      if (errorText || FAILED_STATUS_PATTERN.test(status) || res.code !== 0) {
        const detail = errorText || stderr || stdout;
        const classified = classifyExit('gemini', detail);
        fail(classified === 'nonzero_exit' && partialTimeout ? 'timeout' : classified, detail);
      }
      if (partialTimeout) fail('timeout', stderr);
      const response = typeof envelope.response === 'string' ? envelope.response.trim() : '';
      if (!response) fail('empty_output', stderr);
      return response;
    }

    if (res.code !== 0) fail(classifyExit('gemini', stderr, stdout), stderr || stdout);
    if (partialTimeout) fail('timeout', stderr);
    const text = stdout.trim();
    if (!text) fail('empty_output', stderr);
    return text;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => { /* best-effort cleanup */ });
  }
}
