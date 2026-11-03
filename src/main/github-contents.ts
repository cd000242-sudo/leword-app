/**
 * GitHub contents API 공용 도구 — 로컬 gh 로그인으로 파일 하나를 읽고 쓴다.
 * 홈판 상위 이력 · 숏텐츠 급상승 발행기가 같이 쓴다(복붙 대신 공용으로 뽑음, 2026-10-29). 동작은 원래 발행기와 같다.
 */
import { spawn } from 'child_process';

export const MAX_BYTES = 2 * 1024 * 1024;
export type GhRunner = (args: string[], input?: string) => Promise<string>;

export function runGh(args: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('gh', args, { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '', bytes = 0;
    const timer = setTimeout(() => { child.kill(); reject(new Error('github_timeout')); }, 30_000);
    child.on('error', () => { clearTimeout(timer); reject(new Error('github_unavailable')); });
    child.stdin.on('error', () => { /* Process exit supplies the safe diagnostic. */ });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > MAX_BYTES * 2) { child.kill(); return; }
      out += chunk;
    });
    child.stderr.on('data', chunk => { if (err.length < 8000) err += chunk; });
    child.on('close', code => {
      clearTimeout(timer);
      if (bytes > MAX_BYTES * 2) return reject(new Error('github_response_too_large'));
      if (code === 0) return resolve(out);
      const failure: any = new Error('github_request_failed');
      failure.status = /HTTP 409\b/.test(err) ? 409 : /HTTP 404\b/.test(err) ? 404 : 0;
      reject(failure); // Never expose CLI output, authentication diagnostics or private configuration.
    });
    child.stdin.end(input);
  });
}

/** 주인 PC 판정 기본값 — 늦게 부른다(ci-watchdog 는 electron 을 끌어온다). */
export async function defaultIsOwner(): Promise<boolean> {
  const { isOwnerPc } = require('./handlers/ci-watchdog') as typeof import('./handlers/ci-watchdog');
  return isOwnerPc();
}

/** 원격 파일 — 없으면(404) sha·payload 모두 null. */
export async function readRemoteJson<T>(gh: GhRunner, endpoint: string): Promise<{ sha: string | null; payload: T | null }> {
  try {
    const meta = JSON.parse(await gh(['api', '--hostname', 'github.com', `${endpoint}?ref=main`]));
    if (typeof meta.sha !== 'string' || !/^[a-f0-9]{40}$/.test(meta.sha) || meta.size > MAX_BYTES) throw new Error('invalid_remote');
    const text = meta.encoding === 'base64' && typeof meta.content === 'string' ? Buffer.from(meta.content, 'base64').toString('utf8') : '';
    let payload: T | null = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
    return { sha: meta.sha, payload };
  } catch (error) {
    if ((error as any)?.status === 404) return { sha: null, payload: null };
    throw error;
  }
}
