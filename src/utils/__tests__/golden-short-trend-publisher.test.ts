import { describe, expect, it, vi } from 'vitest';
const { enrichShortTermTrends, toPublicRow, enrichGoldenTrends, canCarryTrendOnly, prepareTrendOnlyRound } = require('../../../scripts/publish-preemption-board');
const now = Date.parse('2026-09-28T10:00:00Z');
const measuredAt = new Date(now).toISOString();
const dates = Array.from({ length: 14 }, (_, i) => `2026-09-${14 + i}`);
const raw = { dates, series: dates.map((_, i) => i < 7 ? 10 : 20) };
const rejected = (keyword = '지원금 신청', extra = {}) => ({ keyword, topic: '비즈니스·경제', measuredAt,
  searchVolume: 500, documentCount: 10000, shortTermTrend: null, serp: { sampledTitles: 10, exactTitleHits: 8 }, reason: '상위 검색결과 경쟁', ...extra });

describe('publisher daily trend enrichment', () => {
  it('measures only bounded fresh rows and preserves the SERP date', async () => {
    const fetchSeries = vi.fn(async () => raw);
    const fetchHorizon = vi.fn(async () => '2026-09-27');
    const rows = [{ keyword: '사업', measuredAt }, { keyword: '여행', measuredAt }, { keyword: 'old', measuredAt: '2026-09-01' }];
    const result = await enrichShortTermTrends(rows, { nowMs: now, budget: 1, fetchSeries, fetchHorizon });
    expect(fetchSeries).toHaveBeenCalledTimes(1);
    expect(fetchHorizon).toHaveBeenCalledTimes(1);
    expect(result[0]).toMatchObject({ measuredAt, shortTermTrend: { status: 'rising', ratio: 2 } });
    expect(result.slice(1).every((r: any) => r.shortTermTrend.status === 'unknown')).toBe(true);
    expect(rows[0]).not.toHaveProperty('shortTermTrend');
  });
  it('handles horizon and individual fetch failures without blocking publication', async () => {
    const rows = [{ keyword: '실패', measuredAt }, { keyword: '성공', measuredAt }];
    const fetchSeries = vi.fn().mockRejectedValueOnce(new Error('quota')).mockResolvedValueOnce(raw);
    const result = await enrichShortTermTrends(rows, { nowMs: now, fetchSeries, fetchHorizon: async () => '2026-09-27' });
    expect(result.map((r: any) => r.shortTermTrend.status)).toEqual(['unknown', 'rising']);
    const failed = await enrichShortTermTrends(rows, { nowMs: now, fetchSeries, fetchHorizon: async () => { throw new Error('offline'); } });
    expect(failed.every((r: any) => r.shortTermTrend.status === 'unknown')).toBe(true);
    expect(fetchSeries).toHaveBeenCalledTimes(2);
  });
  it('keeps current original trend evidence on old SERP rows and passes it through projection', async () => {
    const current = await enrichShortTermTrends([{ keyword: '테스트', measuredAt }], { nowMs: now, fetchSeries: async () => raw, fetchHorizon: async () => '2026-09-27' });
    const carried = { ...current[0], measuredAt: '2026-09-01' };
    const fetchSeries = vi.fn();
    const result = await enrichShortTermTrends([carried], { nowMs: now, fetchSeries });
    expect(result[0].shortTermTrend).toEqual(carried.shortTermTrend);
    expect(fetchSeries).not.toHaveBeenCalled();
    expect(toPublicRow(carried).shortTermTrend).toEqual(carried.shortTermTrend);
  });
  it('a zero budget performs no provider calls and explicitly marks unknown evidence', async () => {
    const fetchHorizon = vi.fn();
    const result = await enrichShortTermTrends([{ keyword: '지원금', measuredAt }], { nowMs: now, budget: 0, fetchHorizon });
    expect(fetchHorizon).not.toHaveBeenCalled();
    expect(result[0].shortTermTrend.status).toBe('unknown');
  });
});

describe('separate financial trend candidates', () => {
  const options = { nowMs: now, fetchSeries: async () => raw, fetchHorizon: async () => '2026-09-27' };
  it('shares one budget and prioritizes financial rows without turning rejects into golden rows', async () => {
    const fetchSeries = vi.fn(async (_keyword: string) => raw);
    const accepted = [{ keyword: '여행 후보', measuredAt, topic: '여행' }];
    const result = await enrichGoldenTrends(accepted, [rejected()], [], { ...options, budget: 1, fetchSeries });
    expect(fetchSeries).toHaveBeenCalledTimes(1);
    expect(fetchSeries.mock.calls[0][0]).toBe('지원금 신청');
    expect(result.rows[0].shortTermTrend.status).toBe('unknown');
    expect(result.trendCandidates).toHaveLength(1);
    expect(result.trendCandidates[0]).toMatchObject({ reason: '상위 검색결과 경쟁', facingPosts: 8, sampledTitles: 10 });
    expect(result.trendCandidates[0]).not.toHaveProperty('tier');
  });
  it('requires fresh real numeric evidence, financial intent and a live row', async () => {
    const invalid = [
      rejected('오래된 지원금', { measuredAt: '2026-09-01' }), rejected('미래 지원금', { measuredAt: '2026-10-01' }),
      rejected('문서 미측정 지원금', { documentCount: null }), rejected('표본 부족 지원금', { serp: { sampledTitles: 4, exactTitleHits: 1 } }),
      rejected('검색 미측정 지원금', { searchVolume: 0 }), rejected('날씨'),
      rejected('일반 여행', { topic: '여행' }), rejected('수익 불가 지원금', { monetize: { verdict: 'bad' } }),
    ];
    const fetchSeries = vi.fn(async () => raw);
    const result = await enrichGoldenTrends([], invalid, [], { ...options, fetchSeries });
    expect(result.trendCandidates).toEqual([]);
    expect(fetchSeries).not.toHaveBeenCalled();
  });
  it('retains only current rising prior evidence, caps 12 and never refreshes a carried SERP date', async () => {
    const first = await enrichGoldenTrends([], Array.from({ length: 15 }, (_, i) => rejected(`지원금 신청대상 ${i + 100}`)), [], options);
    expect(first.trendCandidates).toHaveLength(12);
    const saved = first.trendCandidates[0];
    const result = await enrichGoldenTrends([], [], [saved], { ...options, budget: 0 });
    expect(result.trendCandidates).toEqual([saved]);
    const expired = await enrichGoldenTrends([], [], [{ ...saved, measuredAt: '2026-09-01' }], { ...options, budget: 0 });
    expect(expired.trendCandidates).toEqual([]);
    expect(canCarryTrendOnly([], [saved], { rows: [rejected()] }, now)).toBe(true);
    expect(canCarryTrendOnly([], [], { rows: [rejected()] }, now)).toBe(false);
    expect(canCarryTrendOnly([], [saved], { rows: [] }, now)).toBe(false);
  });
  it('does not revive rejected stale evidence from previous data or show non-rising candidates', async () => {
    const first = await enrichGoldenTrends([], [rejected()], [], options);
    const replaced = await enrichGoldenTrends([], [rejected('지원금 신청', { documentCount: null })], first.trendCandidates, options);
    expect(replaced.trendCandidates).toEqual([]);
    const flat = await enrichGoldenTrends([], [rejected()], [], { ...options, fetchSeries: async () => ({ dates, series: dates.map(() => 10) }) });
    expect(flat.trendCandidates).toEqual([]);
  });
  it('measures a normal rejected-only round before the empty guard and deducts every attempt from the shared budget', async () => {
    const original = [rejected('지원금 신청', { shortTermTrend: null }), rejected('청년 대출', { shortTermTrend: null })];
    const fetchSeries = vi.fn(async (_keyword: string) => raw);
    const prepared = await prepareTrendOnlyRound([], original, { rows: [rejected()] }, { ...options, budget: 1, fetchSeries });
    expect(prepared.canCarry).toBe(true);
    expect(prepared.remainingBudget).toBe(0);
    expect(prepared.rejections[0].shortTermTrend.status).toBe('rising');
    expect(original[0].shortTermTrend).toBeNull();
    await enrichGoldenTrends([rejected('황금 지원금')], prepared.rejections, [], { ...options, budget: prepared.remainingBudget, fetchSeries });
    expect(fetchSeries).toHaveBeenCalledTimes(1);
  });
  it('failed or non-rising rejected-only measurements cannot allow an empty publication', async () => {
    for (const fetchSeries of [async () => { throw new Error('offline'); }, async () => ({ dates, series: dates.map(() => 10) })]) {
      const prepared = await prepareTrendOnlyRound([], [rejected()], { rows: [rejected()] }, { ...options, budget: 1, fetchSeries });
      expect(prepared.canCarry).toBe(false);
      expect(prepared.remainingBudget).toBe(0);
    }
    const fetchSeries = vi.fn(async () => raw);
    const normal = await prepareTrendOnlyRound([rejected()], [rejected()], { rows: [rejected()] }, { ...options, budget: 1, fetchSeries });
    expect(normal.remainingBudget).toBe(1);
    const missingPrevious = await prepareTrendOnlyRound([], [rejected()], null, { ...options, budget: 1, fetchSeries });
    expect(missingPrevious.canCarry).toBe(false);
    expect(fetchSeries).not.toHaveBeenCalled();
  });
  it('does not retry a failed pre-guard keyword when spending the remaining budget', async () => {
    const fetchSeries = vi.fn(async (keyword: string) => {
      if (keyword === '실패 지원금') throw new Error('quota');
      return raw;
    });
    const prepared = await prepareTrendOnlyRound([], [rejected('실패 지원금'), rejected('상승 지원금')], { rows: [rejected()] }, { ...options, budget: 3, fetchSeries });
    expect(prepared.canCarry).toBe(true);
    await enrichGoldenTrends([rejected('새 황금 지원금')], prepared.rejections, [], {
      ...options, budget: prepared.remainingBudget, skipKeywords: prepared.attemptedKeywords, fetchSeries,
    });
    expect(fetchSeries.mock.calls.map(args => args[0])).toEqual(['실패 지원금', '상승 지원금', '새 황금 지원금']);
  });
});
