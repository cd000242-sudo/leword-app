import { describe, it, expect, vi } from 'vitest';
const api = vi.hoisted(() => ({ get: vi.fn(), peek: vi.fn() }));
vi.mock('../naver-blog-api', () => ({ getNaverBlogDocumentCount: api.get, peekCachedNaverBlogDocumentCountMeasurement: api.peek }));
import { measureBriefDocumentCounts } from '../../main/topic-brief-metrics';
import type { TopicBrief } from '../topic-briefs';
const brief = { coreKeyword: '지원금 신청', serpFacing: 2, documentCount: 999, documentCountMeasuredAt: 'old' } as TopicBrief;
describe('brief document measurement provenance', () => {
  it('keeps API total separate from facing and preserves original measurement time', async () => {
    api.get.mockResolvedValue(1234); api.peek.mockReturnValue({ total: 1234, measuredAt: '2026-09-28T00:00:00.000Z' });
    const [result] = await measureBriefDocumentCounts([brief], {});
    expect(result).toMatchObject({documentCount:1234,documentCountMeasuredAt:'2026-09-28T00:00:00.000Z',serpFacing:2});
    expect(brief.documentCount).toBe(999);
  });
  it('does not publish a total with unrelated or missing provenance', async () => {
    api.get.mockResolvedValue(1234); api.peek.mockReturnValue({ total: 999, measuredAt: '2026-09-28T00:00:00.000Z' });
    expect((await measureBriefDocumentCounts([brief], {}))[0].documentCount).toBeNull();
  });
  it('clears stale values on failure and propagates cancellation', async () => {
    api.get.mockRejectedValue(new Error('offline'));
    expect((await measureBriefDocumentCounts([brief], {}))[0]).toMatchObject({documentCount:null,documentCountMeasuredAt:undefined});
    await expect(measureBriefDocumentCounts([brief], {}, {cancelled:()=>true})).rejects.toThrow('취소');
  });
});
