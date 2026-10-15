import { describe, expect, it } from 'vitest';
import { keywordPerformance, performanceSupported } from '../blog-class/performance-evidence';
describe('personal homefeed evidence', () => {
  const now = Date.parse('2026-10-15T09:00:00+09:00');
  const day = { channelId: 'alpha', day: '2026-10-14', posts: [
    { contentId: '1', title: '박나래 방송', homefeed: { count: 10 } },
    { contentId: '2', title: '박나래 소식', homefeed: { count: 0 } },
    { contentId: '3', title: '박나래 인터뷰', homefeed: null },
  ] };
  it('includes measured zero but excludes unknown and duplicate day records', () => {
    const evidence = keywordPerformance('박나래 복귀', 'alpha', [day, day], now);
    expect(evidence).toMatchObject({ articles: 2, withHomefeed: 1, homefeedVisits: 10 });
    expect(performanceSupported(evidence)).toBe(false);
  });
  it('does not learn from another account or stale/future records', () => {
    expect(keywordPerformance('박나래', 'beta', [day], now)).toBeNull();
    expect(keywordPerformance('박나래', 'alpha', [{ ...day, day: '2026-09-01' }, { ...day, day: '2026-10-16' }], now)).toBeNull();
  });
  it('counts the same article on different days as one article', () => {
    expect(keywordPerformance('박나래', 'alpha', [day, { ...day, day: '2026-10-13' }], now)).toMatchObject({ articles: 2, homefeedVisits: 20 });
  });
});
