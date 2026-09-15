// codex CLI runner — headless content generation via the user's ChatGPT subscription.
//
// Verified invocation (clean JSON, no context bloat):
//   codex exec --skip-git-repo-check --ignore-user-config --ignore-rules --ephemeral \
//     --output-schema <schema.json> -o <out.txt> -C <tmpdir>   (prompt on stdin, UTF-8)
//
// --ignore-user-config / --ignore-rules block project/global context injection (token diet),
// --output-schema forces JSON, -o writes only the final message to a file we then read.

import { mkdtemp, writeFile, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnCollect } from './spawnHelper';
import { classifyExit } from './parse';
import { buildCodexSubscriptionEnv } from './subscriptionEnv';
import { AgentCliError, type AgentErrorCode } from './types';
import { buildAgentFailureMessage } from './failureMessage';

export interface CodexRunOptions {
  schema?: Record<string, unknown>;
  model?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * 코덱스 표준에러는 버전 · 작업 폴더 · 모델 머리말과 프롬프트 메아리로 시작하고, 실제 오류는 끝의 `ERROR:` 줄에 온다
 * (2026-09-15 실측: 로그인이 풀리면 5번 재접속 뒤 "ERROR: unexpected status 401 Unauthorized …" 로 끝났다).
 * ERROR 줄만 모아 분류한다 — 통째로 보면 프롬프트에 든 '한도' 같은 말로 오분류한다.
 */
function codexErrorLines(stderr: string): string {
  return String(stderr ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^error\b/i.test(line))
    .join('\n');
}

/** 오류 상세는 끝부분을 남긴다 — 앞 800자는 머리말뿐이라 원인이 잘렸다. */
function codexFailureDetail(stderr: string, stdout: string): string {
  return (codexErrorLines(stderr) || String(stderr || stdout || '')).slice(-800);
}

/**
 * Run `codex exec` for a single prompt and return the final message text.
 * Throws AgentCliError (not_installed / not_logged_in / rate_limited / timeout / ...) on failure.
 */
export async function runCodex(prompt: string, opts: CodexRunOptions = {}): Promise<string> {
  const { schema, model, timeoutMs, signal } = opts;
  const dir = await mkdtemp(join(tmpdir(), 'agentcli-codex-'));
  const outPath = join(dir, 'out.txt');

  try {
    const args = [
      'exec',
      '--skip-git-repo-check',
      '--ignore-user-config',
      '--ignore-rules',
      '--ephemeral',
      '--color', 'never',
      // 읽기 전용 샌드박스 · ChatGPT 로그인 강제(2026-09-15 실측: 둘 다 붙여도 ChatGPT 로그인으로 8초에 정상 답).
      // forced_login_method 가 없으면 저장된 API 키 로그인이나 OPENAI_API_KEY 로 조용히 종량 과금되던 이슈가 있다(openai/codex #20099).
      '-s', 'read-only',
      '-c', 'forced_login_method="chatgpt"',
      '-o', outPath,
      '-C', dir,
    ];
    if (model) args.push('-m', model);

    if (schema) {
      const schemaPath = join(dir, 'schema.json');
      await writeFile(schemaPath, JSON.stringify(schema), 'utf8');
      args.push('--output-schema', schemaPath);
    }

    const res = await spawnCollect({
      command: 'codex',
      args,
      provider: 'codex',
      cwd: dir,
      stdin: prompt,
      timeoutMs,
      signal,
      env: buildCodexSubscriptionEnv(),
    });

    if (res.code !== 0) {
      const detail = codexFailureDetail(res.stderr, res.stdout);
      const code = classifyExit('codex', detail);
      throw new AgentCliError(code, 'codex', buildAgentFailureMessage('codex', code, detail), detail);
    }

    let text = '';
    try {
      text = (await readFile(outPath, 'utf8')).trim();
    } catch {
      // -o file missing means codex produced no final message
      text = '';
    }
    if (!text) {
      // 종료 코드 0 인데 최종 답이 없으면 끝의 ERROR 줄로 원인을 가린다 — 사용 한도 실패가 0 으로 끝났다는 보고가 있다.
      const errorLines = codexErrorLines(res.stderr);
      const classified = errorLines ? classifyExit('codex', errorLines) : 'nonzero_exit';
      const code: AgentErrorCode = classified === 'nonzero_exit' ? 'empty_output' : classified;
      const detail = codexFailureDetail(res.stderr, '');
      throw new AgentCliError(code, 'codex', buildAgentFailureMessage('codex', code, detail), detail);
    }
    return text;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => { /* best-effort cleanup */ });
  }
}
