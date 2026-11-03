import { describe, expect, it, vi } from 'vitest';
import { topBlogsFromDailies, topBlogsPayload } from '../advisor/homefeed-top-blogs';
import { publishHomefeedTopBlogs } from '../../main/homefeed-top-blogs-publisher';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const cli = require('../../../scripts/homefeed-top-blogs.cjs');

const sha = 'b'.repeat(40);
const now = () => new Date('2026-10-28T06:00:00Z');
const dailies = [
  { day: '2026-10-25', homefeedTitles: [{ title: 'a', url: 'https://blog.naver.com/Alpha/111?x=1' }, { title: 'b', url: 'https://cafe.naver.com/zzz/1' }], homefeedWeek: [] },
  { day: '2026-10-26', homefeedTitles: [{ title: 'a', url: 'http://blog.naver.com/alpha/111' }, { title: 'c', url: 'https://blog.naver.com/beta/222' }],
    homefeedWeek: [{ day: '2026-10-24', rank: 3, title: 'a', url: 'https://blog.naver.com/alpha/111' }, { day: '2026-10-26', rank: 1, title: 'd', url: 'https://blog.naver.com/alpha/333' }] },
  null,
];
const encoded = (value: unknown) => JSON.stringify({ sha, size: JSON.stringify(value).length, encoding: 'base64', content: Buffer.from(JSON.stringify(value)).toString('base64') });
function harness(remote: unknown | 404) {
  const gh = vi.fn(async (args: string[], _input?: string) => {
    if (args.includes('PUT')) return '{}';
    if (remote === 404) { const e: any = new Error('github_request_failed'); e.status = 404; throw e; }
    return encoded(remote);
  });
  return { gh, deps: { isOwner: async () => true, now, gh } };
}
const written = (gh: ReturnType<typeof vi.fn>) => {
  const call = gh.mock.calls.find(([args]) => (args as string[]).includes('PUT'))!;
  const body = JSON.parse(call[1] as string);
  return { body, payload: JSON.parse(Buffer.from(body.content, 'base64').toString('utf8')) };
};

describe('홈판 상위 이력 — 블로그별 처음 잡힌 날', () => {
  it('글마다 가장 이른 날 한 번, 블로그 아이디는 소문자, 블로그 글이 아닌 주소는 뺀다', () => {
    expect(topBlogsFromDailies(dailies)).toEqual({ alpha: ['2026-10-24', '2026-10-26'], beta: ['2026-10-26'] });
  });
  it('손으로 뽑는 CLI(scripts/homefeed-top-blogs.cjs)와 같은 꼴이다 — 판 수집이 같은 파일을 읽는다', () => {
    expect(topBlogsFromDailies(dailies)).toEqual(cli.topBlogsFromDailies(dailies));
    const p = topBlogsPayload(dailies, now());
    expect(p).toMatchObject({ window: { from: '2026-10-24', to: '2026-10-26' }, blogCount: 2, postCount: 3 });
    // 판 수집 쪽 읽기(readTopBlogs)가 블로그 → 횟수로 받는다.
    const fs = require('fs'); const os = require('os'); const path = require('path');
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'top-blogs-')), 'x.json');
    fs.writeFileSync(file, JSON.stringify(p));
    expect([...cli.readTopBlogs(file)]).toEqual([['alpha', 2], ['beta', 1]]);
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  });
});

describe('홈판 상위 이력 자동 발행', () => {
  it('주인 PC 가 아니면 GitHub 를 부르지 않는다', async () => {
    const { gh } = harness(404);
    expect(await publishHomefeedTopBlogs(dailies, { isOwner: async () => false, now, gh })).toEqual({ status: 'skipped', reason: 'not_owner_pc' });
    expect(gh).not.toHaveBeenCalled();
  });
  it('상위 기록이 없으면 빈 파일로 덮지 않는다', async () => {
    const { gh, deps } = harness(404);
    expect((await publishHomefeedTopBlogs([{ day: '2026-10-26', homefeedTitles: [], homefeedWeek: [] }], deps)).reason).toBe('no_homefeed_tops');
    expect(gh).not.toHaveBeenCalled();
  });
  it('원격 파일을 원격 sha 로 바꿔 올린다(leword-app main 의 data/homefeed-top-blogs.json)', async () => {
    const { gh, deps } = harness({ window: { from: '2026-09-24', to: '2026-10-25' }, blogs: { alpha: ['2026-10-24'] } });
    expect(await publishHomefeedTopBlogs(dailies, deps)).toEqual({ status: 'published', reason: 'top_blogs_published' });
    const { body, payload } = written(gh);
    expect(body.sha).toBe(sha);
    expect(body.branch).toBe('main');
    expect(payload.blogs).toEqual({ alpha: ['2026-10-24', '2026-10-26'], beta: ['2026-10-26'] });
    expect(gh.mock.calls.every(([args]) => (args as string[]).some((a) => a.startsWith('repos/cd000242-sudo/leword-app/contents/data/homefeed-top-blogs.json')))).toBe(true);
  });
  it('원격이 더 최근 날짜까지 담고 있으면 덮지 않고, 같은 내용이면 커밋하지 않는다', async () => {
    const newer = harness({ window: { to: '2026-10-27' }, blogs: {} });
    expect((await publishHomefeedTopBlogs(dailies, newer.deps)).reason).toBe('newer_remote');
    const same = harness(topBlogsPayload(dailies, now()));
    expect((await publishHomefeedTopBlogs(dailies, same.deps)).reason).toBe('already_published');
    for (const h of [newer, same]) expect(h.gh.mock.calls.some(([args]) => (args as string[]).includes('PUT'))).toBe(false);
  });
  it('원격 파일이 없으면 sha 없이 새로 만든다', async () => {
    const { gh, deps } = harness(404);
    expect((await publishHomefeedTopBlogs(dailies, deps)).status).toBe('published');
    expect(written(gh).body.sha).toBeUndefined();
  });
  it('GitHub 실패는 사유만 남기고 던지지 않는다', async () => {
    const gh = vi.fn(async () => { throw new Error('boom'); });
    expect(await publishHomefeedTopBlogs(dailies, { isOwner: async () => true, now, gh })).toEqual({ status: 'failed', reason: 'github_publication_failed' });
  });
});
