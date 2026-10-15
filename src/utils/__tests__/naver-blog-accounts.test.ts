import { describe, expect, it } from 'vitest';
import { advisorBlogIds, blogSessionPartition } from '../naver-blog-accounts';
describe('authorized account channel discovery', () => {
  it('accepts only actual blog channels and normalizes duplicates', () => {
    expect(advisorBlogIds(JSON.stringify({ data: [{ service: 'naver_blog', channelId: 'Alpha' }, { service: 'naver_blog', channelId: 'alpha' }, { service: 'cafe', channelId: 'beta' }, { service: 'naver_blog', channelId: '../bad' }] }))).toEqual(['alpha']);
    expect(advisorBlogIds('login required')).toEqual([]);
  });
  it('isolates persistent sessions and rejects unsafe IDs', () => {
    expect(blogSessionPartition('Alpha')).toBe(blogSessionPartition('alpha'));
    expect(blogSessionPartition('alpha')).not.toBe(blogSessionPartition('beta'));
    expect(() => blogSessionPartition('../alpha')).toThrow();
  });
});
