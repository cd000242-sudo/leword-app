/**
 * 계획표(golden-local-plan)의 네 단계를 자식 프로세스로 차례로 돌린다 (2026-09-15, 황금키워드 상위호환 2단계).
 *
 * 일렉트론을 부르지 않는다 — 테스트는 노드로 돌리고, 앱은 execPath 에 LEWORD.exe, env 에 ELECTRON_RUN_AS_NODE=1 을 넣는다.
 * 한 단계가 실패하면 뒤 단계는 부르지 않는다.
 * 멈추기는 프로세스 트리째 끊는다 — 자리 재기는 크로미엄을 띄우므로 부모만 끊으면 chrome.exe 가 남는다.
 * 진행 줄은 계획표가 알아보는 줄만 넘긴다. 설정 관리자가 키 길이·고객 번호를 찍으므로 원문을 통째로 넘기지 않는다.
 */
import { execFile, execFileSync, spawn, type ChildProcess } from 'child_process';
import { StringDecoder } from 'string_decoder';
import {
  isSecretLine,
  judgeStageExit,
  readStageLine,
  type GoldenLocalLine,
  type GoldenLocalStage,
  type GoldenLocalStageKey,
} from './golden-local-plan';

export type GoldenLocalEvent =
  | { type: 'stage-start'; stage: GoldenLocalStageKey; label: string; index: number; count: number; at: string }
  | { type: 'line'; line: GoldenLocalLine }
  | { type: 'stage-end'; stage: GoldenLocalStageKey; code: number | null; at: string };

export interface GoldenLocalRunOptions {
  execPath: string;
  shimPath: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  onEvent?: (event: GoldenLocalEvent) => void;
}

export interface GoldenLocalRunResult {
  ok: boolean;
  aborted: boolean;
  /** 코드 0 으로 끝난 단계 */
  completed: GoldenLocalStageKey[];
  /** 끝까지 못 가고 멈춘 단계(할 것이 없어 멈춘 경우 포함). 네 단계를 다 돌았으면 null */
  stoppedAt: GoldenLocalStageKey | null;
  exitCode: number | null;
  message: string;
  /** 마지막 줄들 — 비밀값 줄은 뺐다 */
  tail: string[];
}

export interface GoldenLocalRunHandle {
  done: Promise<GoldenLocalRunResult>;
  /** sync=true 는 앱을 닫을 때 — 프로세스가 끝나기 전에 트리를 끊고 돌아온다 */
  abort: (sync?: boolean) => void;
}

const TAIL_MAX = 40;

export function killProcessTree(child: ChildProcess, sync = false): void {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    const args = ['/PID', String(child.pid), '/T', '/F'];
    if (sync) {
      try { execFileSync('taskkill', args, { windowsHide: true, stdio: 'ignore', timeout: 5000 }); } catch { /* 이미 끝났다 */ }
      return;
    }
    execFile('taskkill', args, { windowsHide: true }, () => undefined);
    return;
  }
  try { child.kill('SIGKILL'); } catch { /* 이미 끝났다 */ }
}

/** 한글이 청크 경계에서 잘려도 깨지지 않게 디코더로 이어 붙인다. */
function lineSplitter(onLine: (line: string) => void): { push: (chunk: Buffer) => void; end: () => void } {
  const decoder = new StringDecoder('utf8');
  let carry = '';
  return {
    push(chunk: Buffer) {
      carry += decoder.write(chunk);
      const parts = carry.split(/\r?\n/);
      carry = parts.pop() ?? '';
      for (const part of parts) onLine(part);
    },
    end() {
      carry += decoder.end();
      if (carry) onLine(carry);
      carry = '';
    },
  };
}

export function startGoldenLocalRun(stages: readonly GoldenLocalStage[], options: GoldenLocalRunOptions): GoldenLocalRunHandle {
  let aborted = false;
  let current: ChildProcess | null = null;
  let tail: string[] = [];

  const remember = (text: string) => {
    const trimmed = String(text || '').trim();
    if (!trimmed || isSecretLine(trimmed)) return;
    tail = [...tail, trimmed.slice(0, 300)].slice(-TAIL_MAX);
  };
  const emit = (event: GoldenLocalEvent) => {
    try { options.onEvent?.(event); } catch { /* 화면 쪽 오류가 실행을 멈추지 않게 */ }
  };

  const runStage = (stage: GoldenLocalStage, index: number) => new Promise<{ code: number | null; lastError: string }>((resolve) => {
    emit({ type: 'stage-start', stage: stage.key, label: stage.label, index, count: stages.length, at: new Date().toISOString() });
    let lastError = '';
    let settled = false;
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      current = null;
      emit({ type: 'stage-end', stage: stage.key, code, at: new Date().toISOString() });
      resolve({ code, lastError });
    };

    let child: ChildProcess;
    try {
      child = spawn(options.execPath, ['-r', options.shimPath, stage.script, ...stage.args], {
        cwd: options.cwd,
        env: options.env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error: any) {
      lastError = String(error?.message || error).slice(0, 200);
      finish(null);
      return;
    }
    current = child;
    if (aborted) killProcessTree(child);

    const out = lineSplitter((text) => {
      const line = readStageLine(stage.key, text);
      if (!line) return;
      remember(line.text);
      emit({ type: 'line', line });
    });
    const err = lineSplitter((text) => {
      const trimmed = text.trim();
      if (!trimmed || isSecretLine(trimmed)) return;
      lastError = trimmed.slice(0, 200);
      remember(trimmed);
    });
    child.stdout?.on('data', (chunk: Buffer) => out.push(chunk));
    child.stderr?.on('data', (chunk: Buffer) => err.push(chunk));
    child.on('error', (error) => {
      lastError = String(error?.message || error).slice(0, 200);
      finish(null);
    });
    child.on('close', (code) => {
      out.end();
      err.end();
      finish(code);
    });
  });

  const done = (async (): Promise<GoldenLocalRunResult> => {
    const completed: GoldenLocalStageKey[] = [];
    for (let index = 0; index < stages.length; index += 1) {
      const stage = stages[index];
      if (aborted) {
        return { ok: false, aborted: true, completed, stoppedAt: stage.key, exitCode: null, message: `${stage.label} 전에 멈췄습니다.`, tail };
      }
      const { code, lastError } = await runStage(stage, index);
      if (aborted) {
        return { ok: false, aborted: true, completed, stoppedAt: stage.key, exitCode: code, message: `${stage.label} 중에 멈췄습니다.`, tail };
      }
      const verdict = judgeStageExit(stage.key, code, lastError);
      if (verdict.next === 'continue') {
        completed.push(stage.key);
        continue;
      }
      return { ok: verdict.next === 'stop-ok', aborted: false, completed, stoppedAt: stage.key, exitCode: code, message: verdict.message, tail };
    }
    return { ok: true, aborted: false, completed, stoppedAt: null, exitCode: 0, message: '', tail };
  })();

  const abort = (sync = false) => {
    aborted = true;
    if (current) killProcessTree(current, sync);
  };

  return { done, abort };
}
