// claude CLI runner — headless content generation via the user's Claude subscription.
//
// Invocation: claude -p --output-format json   (prompt on stdin, UTF-8)
//   -p / --print            : non-interactive single response
//   --output-format json    : print a JSON envelope ({ result, is_error, ... }) to stdout
//   --permission-mode default : answer the prompt directly.
//
// NOT 'plan'. Measured 2026-08-08 with the real article prompt: in plan mode the CLI replies
// with a plan ("실제 최종 JSON 산출물은 계획 승인 후 별도 턴에서 작성") and never emits the
// JSON, so every claude generation failed while codex (which runs `exec`) worked. It exits 0
// with is_error:false, so it surfaced as "글생성이 안 된다" rather than an error.
//   plan        -> 143 chars, JSON parse FAILED
//   default     -> 2,885 chars, 5 headings, JSON OK
// Permission prompts cannot appear here anyway: -p is headless and --disallowedTools '*'
// blocks every tool. 'default' is passed explicitly so a change to the CLI's own default
// cannot silently put us back in a non-answering mode.
//
// We run in a throwaway temp cwd so CLAUDE.md auto-discovery does not inject project context.
// We do NOT use --bare: it forces ANTHROPIC_API_KEY auth and ignores the subscription OAuth,
// which would defeat the "no API token cost" goal.

import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnCollect } from './spawnHelper';
import { classifyExit, parseClaudeEnvelope } from './parse';
import {
  buildClaudeSubscriptionEnv,
  CLAUDE_SUBSCRIPTION_ISOLATION_ARGS,
} from './subscriptionEnv';
import { AgentCliError } from './types';
import { buildAgentFailureMessage } from './failureMessage';

export interface ClaudeRunOptions {
  /** Provided for API symmetry with codex; claude has no --output-schema, so it is unused here. */
  schema?: Record<string, unknown>;
  model?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Run `claude -p` for a single prompt and return the final message text.
 * Throws AgentCliError on failure (install / login / rate-limit / timeout / bad output).
 */
export async function runClaude(prompt: string, opts: ClaudeRunOptions = {}): Promise<string> {
  const { model, timeoutMs, signal } = opts;
  const dir = await mkdtemp(join(tmpdir(), 'agentcli-claude-'));

  try {
    const args = [
      '-p',
      '--output-format', 'json',
      '--permission-mode', 'default',
      ...CLAUDE_SUBSCRIPTION_ISOLATION_ARGS,
    ];
    if (model) args.push('--model', model);

    const res = await spawnCollect({
      command: 'claude',
      args,
      provider: 'claude',
      cwd: dir,
      stdin: prompt,
      timeoutMs,
      signal,
      env: buildClaudeSubscriptionEnv(),
    });

    if (res.code !== 0) {
      const code = classifyExit('claude', res.stderr, res.stdout);
      let detail = res.stderr || res.stdout;
      // 오류 봉투의 앞부분(사용량·세션 메타데이터) 때문에 실제 한도/인증 안내가 잘리지 않게 한다.
      try {
        const envelope = JSON.parse(res.stdout);
        if (typeof envelope.result === 'string' && envelope.result.trim()) detail = envelope.result;
      } catch { /* JSON 봉투가 없는 프로세스 오류는 원래 진단을 사용한다. */ }
      throw new AgentCliError(
        code,
        'claude',
        buildAgentFailureMessage('claude', code, detail),
        (detail || '').slice(0, 800),
      );
    }

    // claude prints the JSON envelope on stdout even on success.
    return parseClaudeEnvelope(res.stdout);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => { /* best-effort cleanup */ });
  }
}
