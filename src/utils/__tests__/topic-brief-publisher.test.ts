import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { isTopicBriefPublishingEnabled, publishAppBriefs } from '../../main/topic-brief-publisher';

const now = Date.parse('2026-10-03T09:00:00Z');
const stamp = new Date(now).toISOString();
const sha = 'a'.repeat(40);
const brief = (n = 0) => ({ title: `지원금 ${n} 확인`, coreKeyword: `지원금 ${n}`, field: '정책', timing: 'NOW', factIds: ['f1'], facts: [{ id: 'f1', title: '지원금 안내', snippet: '조건 확인', link: 'https://example.test/notice', publishedAt: stamp, token: 'PRIVATE' }], token: 'PRIVATE' });
const board = (at = stamp, count = 1, slot = '저녁') => ({ builtAt: at, day: at.slice(0, 10), slot, briefs: Array.from({ length: count }, (_, n) => brief(n)), rounds: [], secret: 'PRIVATE', dropped: ['PRIVATE'] });
const earlier = new Date(now - 3600000).toISOString();
const encoded = (value: any, hash = sha) => JSON.stringify({ sha: hash, size: JSON.stringify(value).length, encoding: 'base64', content: Buffer.from(JSON.stringify(value)).toString('base64') });
function harness(remote: any = board(earlier, 1, '오후')) {
  const gh = vi.fn(async (args: string[], _input?: string) => args.includes('PUT') ? '{}' : encoded(remote));
  return { gh, deps: { enabled: true, now: () => now, gh } };
}
const written = (gh: ReturnType<typeof vi.fn>) => JSON.parse(Buffer.from(JSON.parse(gh.mock.calls.find(([args]) => args.includes('PUT'))![1]).content, 'base64').toString('utf8'));
const tempDirs: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

describe('operator app topic brief publication', () => {
  it('requires explicit operator configuration; absent or malformed files default off', () => {
    vi.stubEnv('LEWORD_BRIEF_PUBLISH_ENABLED', 'false');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brief-publisher-')); tempDirs.push(dir);
    expect(isTopicBriefPublishingEnabled(dir)).toBe(false);
    fs.mkdirSync(path.join(dir, 'topic-briefs'));
    const config = path.join(dir, 'topic-briefs', 'publish.json');
    for (const content of ['{', '{"enabled":"true"}', '{"enabled":false}']) {
      fs.writeFileSync(config, content);
      expect(isTopicBriefPublishingEnabled(dir)).toBe(false);
    }
    fs.writeFileSync(config, '{"enabled":true}');
    expect(isTopicBriefPublishingEnabled(dir)).toBe(true);
    fs.writeFileSync(config, '{"enabled":false}');
    vi.stubEnv('LEWORD_BRIEF_PUBLISH_ENABLED', 'true');
    expect(isTopicBriefPublishingEnabled(dir)).toBe(true);
  });
  it('does no authentication or network work when not opted in', async () => {
    const { gh, deps } = harness();
    expect(await publishAppBriefs(board(), { ...deps, enabled: false })).toMatchObject({ status: 'skipped', reason: 'disabled' });
    expect(gh).not.toHaveBeenCalled();
  });
  it('publishes only allowed public fields to fixed repo/path through stdin JSON', async () => {
    const { gh, deps } = harness();
    expect(await publishAppBriefs(board(), deps)).toMatchObject({ status: 'published' });
    const result = written(gh);
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
    expect(result.builtAt).toBe(stamp);
    expect(result.day).toBe('2026-10-03');
    expect(result.publicationSource).toBe('app');
    expect(result.rounds.map((r: any) => r.slot)).toEqual(['오후', '저녁']);
    const [args, input] = gh.mock.calls.find(([args]) => args.includes('PUT'))!;
    expect(args).toContain('repos/cd000242-sudo/naver/contents/spa/public/data/topic-briefs.json');
    expect(args).toContain('github.com');
    expect(args.slice(-2)).toEqual(['--input', '-']);
    expect(JSON.parse(input!)).toMatchObject({ sha, branch: 'main' });
  });
  it.each([
    { ...board(), briefs: [] },
    board(new Date(now - 73 * 3600000).toISOString()),
    board(new Date(now + 600000).toISOString()),
    { ...board(), day: '2026-10-04' },
    { ...board(), day: '2026-02-30' },
    { ...board(), slot: 'unknown' },
  ])('rejects invalid, stale, empty or future incoming boards', async raw => {
    const { gh, deps } = harness();
    expect(await publishAppBriefs(raw, deps)).toMatchObject({ status: 'skipped', reason: 'invalid_or_stale_board' });
    expect(gh).not.toHaveBeenCalled();
  });
  it('preserves a newer overall remote publication', async () => {
    const { gh, deps } = harness(board());
    expect(await publishAppBriefs(board(earlier), deps)).toMatchObject({ reason: 'newer_remote' });
    expect(gh).toHaveBeenCalledOnce();
  });
  it('keeps a richer same-slot edition without refreshing its date', async () => {
    const { gh, deps } = harness(board(earlier, 3));
    expect(await publishAppBriefs(board(), deps)).toMatchObject({ reason: 'richer_remote_round' });
    expect(gh).toHaveBeenCalledOnce();
  });
  it('a replay of the same normalized publication is a no-op', async () => {
    const { gh, deps } = harness({ ...board(), publicationSource: 'app' });
    expect(await publishAppBriefs(board(), deps)).toMatchObject({ reason: 'already_published' });
    expect(gh).toHaveBeenCalledOnce();
  });
  it('adds the trusted marker once to an identical legacy edition without changing evidence dates', async () => {
    const { gh, deps } = harness(board());
    expect(await publishAppBriefs({ ...board(), publicationSource: 'untrusted-input' }, deps)).toMatchObject({ status: 'published' });
    expect(written(gh)).toMatchObject({ publicationSource: 'app', builtAt: stamp, day: '2026-10-03' });
    expect(written(gh).rounds.at(-1).builtAt).toBe(stamp);
  });
  it('retains recent historical rounds even if remote root is older than 72 hours', async () => {
    const old = board('2026-09-29T09:00:00Z', 2, '오후');
    const { gh, deps } = harness(old);
    await publishAppBriefs(board(), deps);
    expect(written(gh).rounds[0]).toMatchObject({ day: '2026-09-29', builtAt: old.builtAt });
  });
  it('keeps richer historical rounds and drops invalid/future shelf entries', async () => {
    const past = board('2026-10-02T09:00:00Z', 3);
    const remote: any = { ...board(earlier, 1, '오후'), rounds: [past] };
    const incoming: any = { ...board(), rounds: [board(past.builtAt, 1), board('2026-10-04T09:00:00Z', 1)] };
    const { gh, deps } = harness(remote);
    await publishAppBriefs(incoming, deps);
    const result = written(gh);
    expect(result.rounds[0].briefs).toHaveLength(3);
    expect(result.rounds.every((r: any) => r.day <= '2026-10-03')).toBe(true);
  });
  it('fetches large files by exact immutable blob SHA rather than racing main', async () => {
    const { gh, deps } = harness();
    gh.mockImplementation(async args => {
      if (args.includes('PUT')) return '{}';
      if (args.some(a => a.includes('/git/blobs/'))) return JSON.stringify(board(earlier, 1, '오후'));
      return JSON.stringify({ sha, size: 1200000, encoding: 'none', content: '' });
    });
    expect(await publishAppBriefs(board(), deps)).toMatchObject({ status: 'published' });
    expect(gh.mock.calls[1][0]).toContain(`repos/cd000242-sudo/naver/git/blobs/${sha}`);
  });
  it('re-reads and merges once after a conflict, using the new SHA', async () => {
    const { gh, deps } = harness();
    let reads = 0, puts = 0;
    gh.mockImplementation(async args => {
      if (args.includes('PUT')) { if (++puts === 1) throw Object.assign(new Error('secret'), { status: 409 }); return '{}'; }
      return encoded(board(earlier, 1, reads++ ? '아침' : '오후'), reads === 1 ? sha : 'b'.repeat(40));
    });
    expect(await publishAppBriefs(board(), deps)).toMatchObject({ status: 'published' });
    expect(reads).toBe(2);
    expect(puts).toBe(2);
    expect(JSON.parse(gh.mock.calls[3][1]!)).toMatchObject({ sha: 'b'.repeat(40) });
  });
  it('abandons a conflict retry when another writer published a newer board', async () => {
    const { gh, deps } = harness();
    let reads = 0;
    gh.mockImplementation(async args => {
      if (args.includes('PUT')) throw Object.assign(new Error('conflict'), { status: 409 });
      return encoded(reads++ ? board(new Date(now + 1000).toISOString()) : board(earlier));
    });
    expect(await publishAppBriefs(board(), deps)).toMatchObject({ reason: 'newer_remote' });
    expect(gh.mock.calls.filter(([args]) => args.includes('PUT'))).toHaveLength(1);
  });
  it('caps conflict retries and never leaks raw CLI errors', async () => {
    const { gh, deps } = harness();
    gh.mockImplementation(async args => {
      if (args.includes('PUT')) throw Object.assign(new Error('PRIVATE token'), { status: 409 });
      return encoded(board(earlier));
    });
    expect(await publishAppBriefs(board(), deps)).toEqual({ status: 'failed', reason: 'github_publication_failed' });
    expect(gh.mock.calls.filter(([args]) => args.includes('PUT'))).toHaveLength(2);
  });
  it('does not replace a missing, malformed or unreadable remote file', async () => {
    const { gh, deps } = harness();
    gh.mockRejectedValue(new Error('PRIVATE auth data'));
    expect(await publishAppBriefs(board(), deps)).toEqual({ status: 'failed', reason: 'github_publication_failed' });
    expect(gh).toHaveBeenCalledOnce();
  });
});
