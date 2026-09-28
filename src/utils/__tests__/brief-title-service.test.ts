import { describe, expect, it, vi } from 'vitest';
import { createBriefTitleService, fetchTitleSourceSnapshot } from '../../main/brief-title-service';
import { titlesForBatch } from '../brief-title-engine';
const at = '2026-09-28T04:00:00Z';
const now = Date.parse(at);
const signals = { updatedAt: at, lanes: [{ id: 'naver', items: [{ keyword: '서울 축제', insight: { collectedAt: at, facts: [{ text: '서울 축제가 10월 열린다.', sourceIndex: 0 }], links: [{ url: 'https://n.news.naver.com/article/001/123', publishedAt: at }] } }] }] };
describe('explicit factual title service', () => {
  it('returns cached keyword without any AI or network calls', async () => {
    const fetchSignals = vi.fn(); const generate = vi.fn();
    const service = createBriefTitleService({ read: () => ({ titles: [{ keyword: '서울 축제', seo: '서울 축제 일정', at }] }), save: vi.fn(), fetchSignals, generate, now: () => now });
    expect((await service.generate('서울 축제')).titles).toHaveLength(1);
    expect(fetchSignals).not.toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled();
  });
  it('requires an exact known keyword and linked evidence; fails without changing cache', async () => {
    const save = vi.fn(); const generate = vi.fn();
    const service = createBriefTitleService({ read: () => null, save, fetchSignals: async () => signals, generate, now: () => now });
    await expect(service.generate('무관한 검색어')).rejects.toThrow();
    expect(generate).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
  });
  it('merges a generated keyword without replacing other fresh entries', async () => {
    const save = vi.fn();
    const service = createBriefTitleService({ read: () => ({ titles: [{ keyword: '다른 소식', seo: '다른 소식 제목', at }] }), save, fetchSignals: async () => signals,
      generate: async () => ({ titles: [{ keyword: '서울 축제', seo: '서울 축제 일정' }] }), now: () => now });
    const out = await service.generate('서울 축제');
    expect(out.titles).toHaveLength(2); expect(Date.parse(out.titles[1].at)).toBe(now); expect(save).toHaveBeenCalledOnce();
  });
  it('deduplicates simultaneous explicit requests and preserves cache on provider failure', async () => {
    const save = vi.fn(); const generate = vi.fn(async () => { throw new Error('secret agent error'); });
    const service = createBriefTitleService({ read: () => null, save, fetchSignals: async () => signals, generate, now: () => now });
    const results = await Promise.allSettled([service.generate('서울 축제'), service.generate('서울 축제')]);
    expect(results.every(r => r.status === 'rejected')).toBe(true); expect(generate).toHaveBeenCalledOnce(); expect(save).not.toHaveBeenCalled();
  });
  it('rejects stale or unlinked facts before using a subscription', async () => {
    const generate = vi.fn();
    for (const raw of [
      { ...signals, updatedAt: '2020-01-01', lanes: [{ items: [{ keyword: '서울 축제', insight: { ...signals.lanes[0].items[0].insight, collectedAt: '2020-01-01' } }] }] },
      { ...signals, lanes: [{ items: [{ keyword: '서울 축제', insight: { ...signals.lanes[0].items[0].insight, links: [] } }] }] },
    ]) {
      const service = createBriefTitleService({ read: () => null, save: vi.fn(), fetchSignals: async () => raw, generate, now: () => now });
      await expect(service.generate('서울 축제')).rejects.toThrow();
    }
    expect(generate).not.toHaveBeenCalled();
  });
  it('uses a fixed source URL, refuses redirects and bounds bytes', async () => {
    const fetchImpl = vi.fn(async (_url: unknown, _options: unknown) => new Response(JSON.stringify(signals)));
    expect(await fetchTitleSourceSnapshot(fetchImpl as any)).toEqual(signals);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://leaderspro.kr/data/source-signals.json');
    expect((fetchImpl.mock.calls[0] as any)[1].redirect).toBe('error');
    await expect(fetchTitleSourceSnapshot(async () => new Response('x'.repeat(4 * 1024 * 1024 + 1)))).rejects.toThrow('SOURCE_TOO_LARGE');
    await expect(fetchTitleSourceSnapshot(async () => new Response('', { status: 503 }))).rejects.toThrow('SOURCE_UNAVAILABLE');
  });
  it('the shared generator drops invented numbers and first-person experiences', async () => {
    const batch = [{ keyword: '서울 축제', lane: 'naver', facts: ['서울 축제가 10월 열린다.'], subs: [] }];
    const result = await titlesForBatch(batch, async () => ({ provider: 'test', reply: JSON.stringify([{ keyword: '서울 축제', seo: '서울 축제 99만원 입장료', home: '서울 축제 다녀왔더니 좋더라고요', summary: '서울 축제가 99만원 입장료를 받는다.' }]) }));
    expect(result.titles).toEqual([]);
  });
});
