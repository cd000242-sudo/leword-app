/**
 * 앱 애드센스 고수 벤치마크(2026-10-07 사장님 "사이트는 그게 한계지만 앱에서는 1000개든 10000개든 상관없지 않니?").
 * 사이트 판은 786곳 · 1,000장 상한, 앱은 엑셀 6,412곳 전부 · 카드 상한 없음 — 사장님 PC 에서 돈다.
 */
import { describe, expect, it } from 'vitest';
import { collectAdsenseBench, selectAppRound, withCardTitles, withCardMetrics } from '../../main/adsense-bench-service';

const board = (n: number) => ({ schemaVersion: 1, candidates: Array.from({ length: n }, (_, i) => ({ id: 'c' + i, keyword: 'k' + i, titles: [] as string[], metrics: { searchVolume: null, documentCount: null, bid: null } })) });

describe('앱 애드센스 벤치마크 서비스', () => {
  it('전체 출처를 모아 카드 상한 없이(무한) 판을 만들고 저장한다 · 진행을 알린다', async () => {
    const sources = Array.from({ length: 3 }, (_, i) => ({ id: 's' + i }));
    const progress: string[] = [];
    let builtWith: any = null;
    let saved: any = null;
    const out = await collectAdsenseBench({
      loadSources: () => sources,
      collectAll: async (list, _now, opts) => { list.forEach((_s: unknown, i: number) => opts.onProgress?.(i + 1, list.length)); return list.map((s: any) => ({ id: s.id, status: 'ok', posts: [] })); },
      buildBoard: (_r, _s, _n, opts) => { builtWith = opts; return { ...board(1500), okCount: 3, sourceCount: 3, collectedPostCount: 9 }; },
      save: (b) => { saved = b; },
      now: () => '2026-10-07T00:00:00.000Z',
      onProgress: (d, t) => progress.push(`${d}/${t}`),
    });
    expect(builtWith.maxCards).toBe(Number.POSITIVE_INFINITY);
    expect(saved.candidates.length).toBe(1500);
    expect(out).toMatchObject({ sourceCount: 3, okCount: 3, cards: 1500 });
    expect(progress).toEqual(['1/3', '2/3', '3/3']);
  });

  it('출처 목록이 비면 수집하지 않고 이유를 돌려준다', async () => {
    await expect(collectAdsenseBench({ loadSources: () => [], collectAll: async () => [], buildBoard: () => board(0), save: () => undefined, now: () => 'x' })).rejects.toThrow(/출처/);
  });

  it('제목 · 실측을 해당 카드에만 붙이고 원본은 바꾸지 않는다', () => {
    const b = board(2);
    const t = withCardTitles(b, 'c1', ['국민연금추납 신청 전 확인할 조건과 비용']);
    expect(t.candidates[1].titles).toEqual(['국민연금추납 신청 전 확인할 조건과 비용']);
    expect(t.candidates[0].titles).toEqual([]);
    expect(b.candidates[1].titles).toEqual([]);
    const m = withCardMetrics(b, 'c0', { query: '국민연금추납', searchVolume: 2400, documentCount: 3000, bid: 520, at: '2026-10-07T00:00:00Z' });
    expect(m.candidates[0].metrics).toMatchObject({ query: '국민연금추납', searchVolume: 2400, bid: 520 });
    expect(b.candidates[0].metrics.searchVolume).toBeNull();
  });
});

// 사장님(2026-10-07) 티스토리 차단 — 엑셀 6,412곳 중 7일 안에 쓴 곳은 913곳. 쉬는 5,500곳을 매번 두드린 게 차단의 주범이었다.
describe('앱 수집 회차 고르기', () => {
  const src = (id: string, weekPosts: number) => ({ id, weekPosts });
  it('7일 안에 쓴 곳은 매번 · 쉬는 곳은 회차마다 rotate 곳씩 돌아가며', () => {
    const all = [src('a1', 3), src('i1', 0), src('i2', 0), src('a2', 1), src('i3', 0), src('i4', 0), src('i5', 0)];
    const r1 = selectAppRound(all, 0, 2);
    expect(r1.sources.map((s) => s.id)).toEqual(['a1', 'a2', 'i1', 'i2']);
    expect(r1.nextCursor).toBe(2);
    const r2 = selectAppRound(all, r1.nextCursor, 2);
    expect(r2.sources.map((s) => s.id)).toEqual(['a1', 'a2', 'i3', 'i4']);
    const r3 = selectAppRound(all, r2.nextCursor, 2);
    expect(r3.sources.map((s) => s.id)).toEqual(['a1', 'a2', 'i5', 'i1']);
    expect(r3.nextCursor).toBe(1);
  });
  it('쉬는 곳이 없거나 커서가 엉뚱해도 깨지지 않는다', () => {
    expect(selectAppRound([src('a', 1)], 99, 300).sources.map((s) => s.id)).toEqual(['a']);
    expect(selectAppRound([src('i', 0)], -5, 300).sources.map((s) => s.id)).toEqual(['i']);
  });
});
