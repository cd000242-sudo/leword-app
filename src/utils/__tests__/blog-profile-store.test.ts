import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { blogKey, listBlogProfiles, readBlogValue, saveBlogValue } from '../blog-class/profile-store';

const folders: string[] = [];
const dir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-profiles-')); folders.push(d); return d; };
afterEach(() => folders.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
describe('blog-specific saved results', () => {
  it('keeps two blogs independent across reloads and updates', () => {
    const d = dir();
    saveBlogValue(d, 'Alpha', { blogId: 'Alpha', posts: [1] });
    saveBlogValue(d, 'beta', { blogId: 'beta', posts: [2] });
    saveBlogValue(d, 'alpha', { blogId: 'alpha', posts: [3] });
    expect(readBlogValue(d, 'ALPHA')).toEqual({ blogId: 'alpha', posts: [3] });
    expect(readBlogValue(d, 'beta')).toEqual({ blogId: 'beta', posts: [2] });
  });
  it('migrates latest and recovers historical snapshots without inventing posts', () => {
    const d = dir();
    fs.writeFileSync(path.join(d, 'latest.json'), JSON.stringify({ blogId: 'alpha', measuredAt: '2026-10-15', posts: [1] }));
    fs.mkdirSync(path.join(d, 'snapshots'));
    fs.writeFileSync(path.join(d, 'snapshots', 'old.json'), JSON.stringify({ blogId: 'beta', measuredAt: '2026-10-14' }));
    const profiles = listBlogProfiles(d);
    expect(profiles.map((p) => p.blogId)).toEqual(['alpha', 'beta']);
    expect(profiles[1].posts).toBeUndefined();
    expect(readBlogValue<any>(d, 'alpha')?.posts).toEqual([1]);
  });
  it('does not borrow legacy recommendations or statistics from another blog', () => {
    const d = dir();
    fs.writeFileSync(path.join(d, 'latest.json'), JSON.stringify({ channelId: 'alpha' }));
    expect(readBlogValue(d, 'beta', 'latest.json', 'channelId')).toBeNull();
    expect(readBlogValue(d, 'alpha', 'latest.json', 'channelId')).toEqual({ channelId: 'alpha' });
    expect(readBlogValue(d, 'alpha')).toBeNull();
  });
  it('rejects path traversal and does not show a damaged saved file', () => {
    const d = dir();
    expect(blogKey('../alpha')).toBeNull();
    expect(() => saveBlogValue(d, '../alpha', {})).toThrow();
    saveBlogValue(d, 'alpha', { blogId: 'beta' });
    expect(readBlogValue(d, 'alpha')).toBeNull();
  });
});
