import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { publicBoard } from './board-cache';
import { preserveRicherBriefRound } from './topic-brief-inventory';

const ENDPOINT = 'repos/cd000242-sudo/naver/contents/spa/public/data/topic-briefs.json';
const MAX_BYTES = 8 * 1024 * 1024;
const DAY_MS = 86_400_000;
export type BriefPublicationResult = { status: 'published' | 'skipped' | 'failed'; reason: string };
export interface BriefPublisherDependencies {
  enabled?: boolean;
  now?: () => number;
  /** Test seam; production always uses the fixed GitHub endpoint and local gh authentication. */
  gh?: (args: string[], input?: string) => Promise<string>;
}

/** Operator opt-in only. API settings and ordinary app users never enable site publication. */
export function isTopicBriefPublishingEnabled(userData: string): boolean {
  if (process.env.LEWORD_BRIEF_PUBLISH_ENABLED === 'true') return true;
  try {
    const file = path.join(userData, 'topic-briefs', 'publish.json');
    return fs.statSync(file).size <= 1024 && JSON.parse(fs.readFileSync(file, 'utf8')).enabled === true;
  } catch { return false; }
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

function kstDay(at: number): string { return new Date(at + 9 * 3_600_000).toISOString().slice(0, 10); }
function validRound(round: any, now: number): boolean {
  const at = Date.parse(round?.builtAt);
  const day = round?.day;
  const dayAt = typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) ? Date.parse(day + 'T00:00:00Z') : NaN;
  return Number.isFinite(at) && at <= now + 300_000 && now - at <= 8 * DAY_MS
    && Number.isFinite(dayAt) && new Date(dayAt).toISOString().slice(0, 10) === day
    && day <= kstDay(at) && Date.parse(kstDay(at)) - dayAt <= 7 * DAY_MS
    && ['아침', '오후', '저녁'].includes(round.slot);
}
function key(round: any): string { return `${round.day}/${round.slot}`; }
function projectRemote(raw: any, now: number): any | null {
  const at = Date.parse(raw?.builtAt);
  if (!Number.isFinite(at) || at > now + 300_000) return null;
  // A stale headline timestamp must not discard otherwise recent shelf rounds.
  // Projection time is internal only: no source timestamp or day is rewritten.
  const board = publicBoard('topic-briefs', raw, Math.min(now, at));
  if (board) board.rounds = (board.rounds || []).filter((r: any) => validRound(r, now));
  return board;
}

/** Publishes only from the trusted main process; no HTTP/IPC endpoint accepts publication data. */
export async function publishAppBriefs(raw: unknown, deps: BriefPublisherDependencies = {}): Promise<BriefPublicationResult> {
  if (!(deps.enabled ?? (process.env.LEWORD_BRIEF_PUBLISH_ENABLED === 'true'))) return { status: 'skipped', reason: 'disabled' };
  const now = (deps.now || Date.now)();
  const incoming = publicBoard('topic-briefs', raw, now);
  if (!incoming || !incoming.briefs?.length || !validRound(incoming, now)) return { status: 'skipped', reason: 'invalid_or_stale_board' };
  const gh = deps.gh || runGh;
  const api = ['api', '--hostname', 'github.com'];
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      // Read content at the exact blob SHA: separate raw-content requests can race with a writer.
      const metadata = JSON.parse(await gh([...api, ENDPOINT + '?ref=main']));
      if (typeof metadata.sha !== 'string' || !/^[a-f0-9]{40}$/.test(metadata.sha) || metadata.size > MAX_BYTES) throw new Error('invalid_remote');
      let content: string;
      if (metadata.encoding === 'base64' && typeof metadata.content === 'string' && metadata.content.trim()) {
        content = Buffer.from(metadata.content, 'base64').toString('utf8');
      } else {
        content = await gh([...api, `repos/cd000242-sudo/naver/git/blobs/${metadata.sha}`, '-H', 'Accept: application/vnd.github.raw+json']);
      }
      if (Buffer.byteLength(content) > MAX_BYTES) throw new Error('invalid_remote');
      const original = JSON.parse(content);
      if (!Number.isFinite(Date.parse(original?.builtAt))) throw new Error('invalid_remote');
      if (Date.parse(original.builtAt) > Date.parse(incoming.builtAt)) return { status: 'skipped', reason: 'newer_remote' };
      const remote = projectRemote(original, now);
      const rounds = new Map<string, any>();
      for (const r of remote?.rounds || []) rounds.set(key(r), r);
      if (remote?.briefs?.length && validRound(remote, now)) rounds.set(key(remote), {
        day: remote.day, slot: remote.slot, builtAt: remote.builtAt, briefs: remote.briefs, ...(remote.inventory ? { inventory: remote.inventory } : {}),
      });
      const currentRemote = rounds.get(key(incoming));
      if (currentRemote && preserveRicherBriefRound(incoming, currentRemote) === currentRemote) return { status: 'skipped', reason: 'richer_remote_round' };
      // Identical publication is a no-op, including replays after an ambiguous network failure.
      if (original.publicationSource === 'app' && original.day === incoming.day && original.slot === incoming.slot
        && currentRemote?.builtAt === incoming.builtAt && JSON.stringify(currentRemote.briefs) === JSON.stringify(incoming.briefs)) return { status: 'skipped', reason: 'already_published' };
      for (const round of incoming.rounds || []) {
        if (!validRound(round, now)) continue;
        const previous = rounds.get(key(round));
        if (previous && Date.parse(previous.builtAt) > Date.parse(round.builtAt)) continue;
        rounds.set(key(round), preserveRicherBriefRound(round, previous));
      }
      rounds.set(key(incoming), { day: incoming.day, slot: incoming.slot, builtAt: incoming.builtAt, briefs: incoming.briefs, ...(incoming.inventory ? { inventory: incoming.inventory } : {}) });
      const board = publicBoard('topic-briefs', { ...incoming, rounds: [...rounds.values()].sort((a, b) => Date.parse(a.builtAt) - Date.parse(b.builtAt)) }, now);
      // This marker is authored only by the trusted operator publisher, never copied from app input.
      // CI can recognize a real app fallback edition without declaring its inventory complete.
      board.publicationSource = 'app';
      const payload = JSON.stringify(board);
      if (Buffer.byteLength(payload) > MAX_BYTES) throw new Error('board_too_large');
      try {
        await gh([...api, '--method', 'PUT', ENDPOINT, '--input', '-'], JSON.stringify({
          message: `fix: publish app topic briefs ${incoming.day} ${incoming.slot}`,
          branch: 'main', sha: metadata.sha, content: Buffer.from(payload).toString('base64'),
        }));
        return { status: 'published', reason: 'app_board_published' };
      } catch (error) {
        if ((error as any)?.status === 409 && attempt === 0) continue;
        throw error;
      }
    }
  } catch { return { status: 'failed', reason: 'github_publication_failed' }; }
  return { status: 'failed', reason: 'github_publication_failed' };
}
