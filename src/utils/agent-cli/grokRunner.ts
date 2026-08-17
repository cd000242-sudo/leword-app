// grok CLI runner — headless content generation via the user's SuperGrok/X Premium+ subscription.
//
// Verified invocation (grok 1.0.4, 2026-08-18):
//   grok -p "<prompt>" --output-format json --deny '*' --no-auto-update
//   -p / --single           : single-turn prompt, prints response to stdout and exits
//   --output-format json    : machine-readable envelope
//   --deny '*'              : block every tool — we only want text generation here
//   --no-auto-update        : no background update checks in scripted runs
//
// Logged-out signature (measured): {"type":"error","message":"Not signed in. ..."} —
// the same run also suggests XAI_API_KEY as a fallback; our env allowlist strips that
// key on purpose so the subprocess can never silently switch to metered API billing.
//
// The prompt is passed as an argv value (grok reads -p from argv, not stdin). Our
// prompts are a few KB — far below the Windows argv limit.

import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnCollect } from './spawnHelper';
import { classifyExit } from './parse';
import { buildGrokSubscriptionEnv } from './subscriptionEnv';
import { AgentCliError } from './types';
import { buildAgentFailureMessage } from './failureMessage';

export interface GrokRunOptions {
  /** API symmetry with codex; grok has no output-schema flag, unused. */
  schema?: Record<string, unknown>;
  model?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Pull the reply text out of grok's JSON envelope; tolerate shape drift. */
function extractGrokReply(stdout: string): { text: string; isError: boolean; errorMessage: string } {
  const trimmed = String(stdout || '').trim();
  // The envelope may be one object or one-object-per-line; scan lines from the end.
  const lines = trimmed.split(/\r?\n/).reverse();
  for (const line of lines) {
    const candidate = line.trim();
    if (!candidate.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      if (parsed['type'] === 'error') {
        return { text: '', isError: true, errorMessage: String(parsed['message'] || 'grok error') };
      }
      const text = [parsed['result'], parsed['text'], parsed['message'], parsed['content']]
        .find((value) => typeof value === 'string' && value.trim().length > 0);
      if (typeof text === 'string') return { text, isError: false, errorMessage: '' };
    } catch { /* not JSON — keep scanning */ }
  }
  // No parsable envelope — treat raw stdout as the reply (better than losing it).
  return { text: trimmed, isError: false, errorMessage: '' };
}

/**
 * Run `grok -p` for a single prompt and return the final message text.
 * Throws AgentCliError (not_installed / not_logged_in / timeout / ...) on failure.
 */
export async function runGrok(prompt: string, opts: GrokRunOptions = {}): Promise<string> {
  const { model, timeoutMs, signal } = opts;
  // Throwaway cwd so grok's directory-config discovery cannot inject project context.
  const dir = await mkdtemp(join(tmpdir(), 'agentcli-grok-'));

  try {
    const args = [
      '-p', prompt,
      '--output-format', 'json',
      '--deny', '*',
      '--no-auto-update',
      '--cwd', dir,
    ];
    if (model) args.push('--model', model);

    const res = await spawnCollect({
      command: 'grok',
      args,
      provider: 'grok',
      cwd: dir,
      timeoutMs,
      signal,
      env: buildGrokSubscriptionEnv(),
    });

    const envelope = extractGrokReply(res.stdout);
    if (res.code !== 0 || envelope.isError) {
      const raw = envelope.errorMessage || res.stderr || res.stdout;
      const code = /not signed in|not authenticated/i.test(raw)
        ? 'not_logged_in'
        : classifyExit('grok', res.stderr, res.stdout);
      throw new AgentCliError(
        code,
        'grok',
        buildAgentFailureMessage('grok', code, raw),
        String(raw || '').slice(0, 800),
      );
    }

    if (!envelope.text.trim()) {
      throw new AgentCliError(
        'empty_output',
        'grok',
        buildAgentFailureMessage('grok', 'empty_output', res.stderr),
        res.stderr.slice(0, 500),
      );
    }
    return envelope.text;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => { /* best-effort cleanup */ });
  }
}
