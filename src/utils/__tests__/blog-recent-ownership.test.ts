import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
const state = vi.hoisted(() => ({ dir: '' }));
vi.mock('electron', () => ({ app: { getPath: () => state.dir }, ipcMain: { listenerCount: () => 0, handle: () => {} } }));
import { forRenderer, refreshRecentBlogPosts } from '../../main/handlers/blog-class';
import { saveBlogValue } from '../blog-class/profile-store';
import { readAdvisorDailyView } from '../../main/handlers/advisor-daily';
import { advisorFreshness } from '../advisor/freshness';

beforeEach(() => { state.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-recent-owner-')); });
afterEach(() => fs.rmSync(state.dir, { recursive: true, force: true }));
const profile = (blogId: string): any => ({ blogId, measuredAt: '2026-10-15', posts: [{ logNo: '1', title: 'old unknown owner' }], wonRows: [] });
describe('selected blog public posts and reporting dates', () => {
  it('hides legacy unknown owners and never displays another blog row', () => {
    expect(forRenderer(profile('alpha'))?.recentTitles).toEqual([]);
    const r = { ...profile('alpha'), recentPosts: [{ blogId: 'beta', logNo: '2', title: 'foreign' }, { blogId: 'alpha', logNo: '3', title: 'mine' }] };
    expect(forRenderer(r)?.recentTitles.map(p => p.title)).toEqual(['mine']);
  });
  it('refreshes a verified list without reselecting a blog when a slow response finishes', async () => {
    const dir = path.join(state.dir, 'blog-class'); fs.mkdirSync(dir);
    const alpha = profile('alpha'); saveBlogValue(dir, 'alpha', alpha);
    fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify(profile('beta')));
    const result = await refreshRecentBlogPosts(alpha, async () => ({ ok: true, status: 200,
      text: async () => JSON.stringify({ blog: { blogId: 'alpha' }, totalCount: 12, postList: [{ logNo: '10', title: 'new', addDate: '5분 전' }] }) }));
    expect(result.postsListedAt).toBeTruthy();
    expect(forRenderer(result)?.recentTitles[0].blogId).toBe('alpha');
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'latest.json'), 'utf8')).blogId).toBe('beta');
  });
  it('a failed refresh does not give old unverified rows a new date', async () => {
    const result = await refreshRecentBlogPosts(profile('alpha'), async () => { throw Error('offline'); });
    expect(result.postsListedAt).toBeUndefined();
    expect(result.postsRefreshError).toBe('offline');
    expect(forRenderer(result)?.recentTitles).toEqual([]);
  });
  it('takes the newest history for the selected blog instead of its stale cached latest or another account', () => {
    const dir = path.join(state.dir, 'advisor-daily'); fs.mkdirSync(dir);
    const rec = (channelId: string, day: string) => ({ channelId, day, collectedAt: day, posts: [], missing: [] });
    saveBlogValue(dir, 'alpha', rec('alpha', '2026-10-05'));
    fs.writeFileSync(path.join(dir, '2026-10-14.json'), JSON.stringify(rec('alpha', '2026-10-14')));
    fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify(rec('beta', '2026-10-15')));
    expect(readAdvisorDailyView('alpha').latest?.day).toBe('2026-10-14');
    const now = new Date('2026-10-15T00:00:00Z');
    expect(advisorFreshness(rec('alpha', '2026-10-05'), now).stale).toBe(true);
    expect(advisorFreshness(rec('alpha', '2026-10-14'), now).stale).toBe(false);
    expect(advisorFreshness(null, now).targetDay).toBe('2026-10-14');
  });
});
