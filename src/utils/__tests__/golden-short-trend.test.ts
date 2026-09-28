import { describe, expect, it } from 'vitest';
import { classifyGoldenShortTrend, retainGoldenShortTrend, shortTrendCandidates } from '../golden-short-trend';

const now = Date.parse('2026-09-28T10:00:00Z');
const measuredAt = new Date(now).toISOString();
const points = (recent = 12, previous = 10) => Array.from({ length: 14 }, (_, index) => ({
  period: `2026-09-${String(14 + index).padStart(2, '0')}`, ratio: index < 7 ? previous : recent,
}));
const classify = (series = points(), horizon: string | null = '2026-09-27') =>
  classifyGoldenShortTrend(series, horizon, measuredAt, now);

describe('golden daily trend evidence', () => {
  it.each([[12, 'rising', 1.2], [8, 'falling', 0.8], [10, 'flat', 1], [0, 'falling', 0]])(
    'compares complete seven-day windows (%s)', (recent, status, ratio) => {
      expect(classify(points(Number(recent)))).toMatchObject({ status, ratio, measuredAt, windowEnd: '2026-09-27' });
    });
  it('does not turn a zero baseline into infinite growth', () => {
    expect(classify(points(10, 0))).toMatchObject({ status: 'unknown', ratio: null });
  });
  it.each([null, '2026-09-24', '2026-09-28', '2026-09-29', '2026-02-30', 'bad'])(
    'rejects missing, stale or incomplete horizons (%s)', horizon => {
      expect(classify(points(), horizon).status).toBe('unknown');
    });
  it('requires 14 distinct consecutive measured dates', () => {
    expect(classify(points().slice(1)).status).toBe('unknown');
    expect(classify([...points(), points()[0]]).status).toBe('unknown');
    expect(classify(points().map((p, i) => i === 2 ? { ...p, period: '2026-08-01' } : p)).status).toBe('unknown');
    expect(classify([null] as any).status).toBe('unknown');
    expect(classify([{ period: '2026-02-30', ratio: 10 }]).status).toBe('unknown');
  });
  it.each([-1, 101, NaN, Infinity])('rejects invalid relative volume %s', ratio => {
    expect(classify(points().map((p, i) => i === 3 ? { ...p, ratio } : p)).status).toBe('unknown');
  });
  it('uses the completed horizon and leaves the input untouched', () => {
    const input = [...points(), { period: '2026-09-28', ratio: 0 }].reverse();
    const copy = JSON.stringify(input);
    expect(classify(input)).toEqual(classify());
    expect(JSON.stringify(input)).toBe(copy);
  });
  it('does not reuse old/future measurements or trust stored status without evidence', () => {
    const valid = classify();
    expect(retainGoldenShortTrend(valid, now)).toEqual(valid);
    expect(retainGoldenShortTrend({ ...valid, status: 'falling', ratio: 0 }, now).status).toBe('rising');
    for (const prior of [null, {}, { ...valid, measuredAt: 'bad' }, { ...valid, measuredAt: '2026-09-29' }, { ...valid, measuredAt: '2026-09-20' }]) {
      expect(retainGoldenShortTrend(prior, now).status).toBe('unknown');
    }
  });
  it('bounds fresh SERP rows across topics and never renews stale SERP dates', () => {
    const rows = [
      { keyword: 'old', measuredAt: '2026-09-01', topic: '경제' },
      { keyword: 'future', measuredAt: '2026-10-01' },
      { keyword: 'bad' },
      { keyword: 'new', measuredAt, topic: '경제' },
      { keyword: 'already', measuredAt, shortTermTrend: classify() },
      { keyword: 'other', measuredAt: '2026-09-23', topic: '여행' },
    ];
    expect(shortTrendCandidates(rows, now, 60).map(r => r.keyword)).toEqual(['new', 'other']);
    expect(shortTrendCandidates(rows, now, 1).map(r => r.keyword)).toEqual(['new']);
    expect(shortTrendCandidates(rows, now, 0)).toEqual([]);
    expect(shortTrendCandidates(rows, now, NaN)).toEqual([]);
    expect(rows[0].measuredAt).toBe('2026-09-01');
  });
});
