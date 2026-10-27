/**
 * 홈판 상위 이력 자동 발행(2026-10-27 사장님 "남은 것들 수정").
 *
 * 판 수집(CI, homefeed-benchmarks.yml)은 leword-app `data/homefeed-top-blogs.json` 을 읽어 추천 규칙
 * "출처 블로그 상위 이력 1회+ 또는 공감 10+" 를 건다. 이 파일은 사장님 PC 의 어드바이저 기록에서만 나오므로,
 * 어드바이저 하루 수집(05:00 뒤)이 끝날 때마다 앱이 다시 뽑아 GitHub 에 올린다 — 손으로 뽑던 한 번짜리 값이 낡지 않게.
 *
 * 레포 주인 계정으로 gh 가 로그인된 PC(사장님 PC)에서만 돈다. 다른 사용자 PC 는 gh 가 없거나 주인이 아니라 건너뛴다.
 * 원격이 더 최근 날짜까지 담고 있으면(다른 PC 가 먼저 올림) 덮지 않는다. 같은 내용이면 커밋하지 않는다.
 */
import { spawn } from 'child_process';
import { topBlogsPayload, type HomefeedTopBlogsPayload } from '../utils/advisor/homefeed-top-blogs';

const REPO = 'cd000242-sudo/leword-app';
const ENDPOINT = `repos/${REPO}/contents/data/homefeed-top-blogs.json`;
const MAX_BYTES = 2 * 1024 * 1024;
export type TopBlogsPublicationResult = { status: 'published' | 'skipped' | 'failed'; reason: string };
export interface TopBlogsPublisherDependencies {
  /** 주인 PC 판정 — 기본은 ci-watchdog isOwnerPc(gh 로그인 계정). */
  isOwner?: () => Promise<boolean>;
  now?: () => Date;
  /** Test seam; production always uses the fixed GitHub endpoint and local gh authentication. */
  gh?: (args: string[], input?: string) => Promise<string>;
}

function runGh(args: string[], input?: string): Promise<string> {
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

async function defaultIsOwner(): Promise<boolean> {
  // 늦게 부른다 — ci-watchdog 는 electron 을 끌어온다.
  const { isOwnerPc } = require('./handlers/ci-watchdog') as typeof import('./handlers/ci-watchdog');
  return isOwnerPc();
}

/** 원격 파일 — 없으면(404) null. */
async function readRemote(gh: NonNullable<TopBlogsPublisherDependencies['gh']>): Promise<{ sha: string | null; payload: HomefeedTopBlogsPayload | null }> {
  try {
    const meta = JSON.parse(await gh(['api', '--hostname', 'github.com', `${ENDPOINT}?ref=main`]));
    if (typeof meta.sha !== 'string' || !/^[a-f0-9]{40}$/.test(meta.sha) || meta.size > MAX_BYTES) throw new Error('invalid_remote');
    const text = meta.encoding === 'base64' && typeof meta.content === 'string' ? Buffer.from(meta.content, 'base64').toString('utf8') : '';
    let payload: HomefeedTopBlogsPayload | null = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
    return { sha: meta.sha, payload };
  } catch (error) {
    if ((error as any)?.status === 404) return { sha: null, payload: null };
    throw error;
  }
}

export async function publishHomefeedTopBlogs(dailies: readonly unknown[], deps: TopBlogsPublisherDependencies = {}): Promise<TopBlogsPublicationResult> {
  try {
    if (!(await (deps.isOwner || defaultIsOwner)())) return { status: 'skipped', reason: 'not_owner_pc' };
  } catch { return { status: 'skipped', reason: 'not_owner_pc' }; }
  const incoming = topBlogsPayload(dailies as any[], (deps.now || (() => new Date()))());
  if (!incoming.blogCount) return { status: 'skipped', reason: 'no_homefeed_tops' };
  const gh = deps.gh || runGh;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const remote = await readRemote(gh);
      const remoteTo = remote.payload?.window?.to || '';
      if (remoteTo && incoming.window.to && remoteTo > incoming.window.to) return { status: 'skipped', reason: 'newer_remote' };
      if (remote.payload && JSON.stringify(remote.payload.blogs) === JSON.stringify(incoming.blogs)) return { status: 'skipped', reason: 'already_published' };
      const content = Buffer.from(JSON.stringify(incoming, null, 1) + '\n').toString('base64');
      try {
        await gh(['api', '--hostname', 'github.com', '--method', 'PUT', ENDPOINT, '--input', '-'], JSON.stringify({
          message: `chore(homefeed): 홈판 상위 이력 갱신 ${incoming.window.to} (블로그 ${incoming.blogCount} · 글 ${incoming.postCount})`,
          branch: 'main', content, ...(remote.sha ? { sha: remote.sha } : {}),
        }));
        return { status: 'published', reason: 'top_blogs_published' };
      } catch (error) {
        if ((error as any)?.status === 409 && attempt === 0) continue;
        throw error;
      }
    }
  } catch { return { status: 'failed', reason: 'github_publication_failed' }; }
  return { status: 'failed', reason: 'github_publication_failed' };
}
