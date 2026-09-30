import { describe, expect, it } from 'vitest';
import type { AdvisorDailyRecord, HomefeedDayPattern } from '../advisor/daily-summary';
import { TODAY_KEYWORD_COUNT, TODAY_SEAT_MEASURE_CAP, buildTodayPlan, type TodayPlanDeps } from '../advisor/today-build';
import type { TodaySeat } from '../advisor/today-plan';

/** 조립 — 후보 전부 검색량, 앞줄만 자리 실측, 골라진 10개만 제목. 실측기가 죽어도 판은 산다(그 열만 null). */
const record = {
  day: '2026-09-29',
  collectedAt: '2026-09-30T03:43:00.000Z',
  channelId: 'leadernam-',
  posts: [],
  topicsDay: [{ topic: '자동차', value: 64 }],
  topicsWeek: [],
  myHours: [],
  topicHours: [],
  popularKeywords: { topic: '자동차', items: Array.from({ length: 12 }, (_, i) => ({ keyword: `인기${i}`, ratio: 1 - i / 20 })) },
  topicKeywords: Array.from({ length: 14 }, (_, i) => ({ topic: '자동차', keyword: `트렌드${i}`, rank: i + 1, rankChange: i % 2 ? 3 : null })),
  homefeedTitles: [],
  weeklyRecommendation: null,
  categoryComparison: [],
  soaring: [],
  adImpressions: [],
  missing: [],
} as unknown as AdvisorDailyRecord;

const pattern: HomefeedDayPattern = { daysMeasured: 1, daysWithHomefeed: 0, hours: [], postsPerDay: [], gapsMinutes: [] };
const open: TodaySeat = { verdict: '열림', facing: 1, vacancy: 2, sampled: 10 };

function deps(over: Partial<TodayPlanDeps> = {}) {
  const calls = { volume: [] as string[][], seat: [] as string[][], titles: [] as string[][] };
  const base: TodayPlanDeps = {
    searchVolume: async (keywords) => { calls.volume.push(keywords); return new Map(keywords.map((k, i) => [k, k === '인기0' ? null : 100 * (i + 1)])); },
    measureSeats: async (keywords) => { calls.seat.push(keywords); return new Map(keywords.map((k) => [k, k.startsWith('트렌드') ? open : null])); },
    titles: async (cards) => { calls.titles.push(cards.map((c) => c.keyword)); return { status: 'ok', provider: 'claude', items: cards.map((c) => ({ keyword: c.keyword, titles: [], rejected: [] })) }; },
  };
  return { deps: { ...base, ...over }, calls };
}

describe('buildTodayPlan', () => {
  it('후보 26 전부 검색량 → 앞줄 20 자리 → 열린 것 우선 10 → 그 10 만 제목', async () => {
    const { deps: d, calls } = deps();
    const plan = await buildTodayPlan(record, pattern, d, new Date(2026, 8, 30, 6, 0));
    expect(plan.candidatesTotal).toBe(26);
    expect(calls.volume[0]).toHaveLength(26);
    expect(calls.seat[0]).toHaveLength(TODAY_SEAT_MEASURE_CAP);
    expect(plan.keywords).toHaveLength(TODAY_KEYWORD_COUNT);
    expect(plan.keywords.every((row) => row.seat?.verdict === '열림')).toBe(true);
    expect(calls.titles[0]).toEqual(plan.keywords.map((row) => row.keyword));
    // 자리 20개를 청했지만 실측기가 값을 준 건 트렌드 14개(인기 6개는 null) — 잰 수는 값이 온 수다
    expect(plan.measured).toEqual({ searchVolume: 25, seat: 14 });
    expect(plan.day).toBe('2026-09-29');
    expect(plan.builtAt).toBe(new Date(2026, 8, 30, 6, 0).toISOString());
    expect(plan.titles.status).toBe('ok');
  });

  it('검색량·자리 실측기가 던져도 판은 나오고 그 열은 null·측정 0', async () => {
    const { deps: d } = deps({
      searchVolume: async () => { throw new Error('검색광고 키 없음'); },
      measureSeats: async () => { throw new Error('브라우저 못 열음'); },
    });
    const plan = await buildTodayPlan(record, pattern, d);
    expect(plan.keywords).toHaveLength(TODAY_KEYWORD_COUNT);
    expect(plan.keywords.every((row) => row.searchVolume === null && row.seat === null)).toBe(true);
    expect(plan.measured).toEqual({ searchVolume: 0, seat: 0 });
    expect(plan.notes).toEqual(['검색량 실측 실패: 검색광고 키 없음', '자리 실측 실패: 브라우저 못 열음']);
  });

  it('후보가 없으면 실측기를 부르지 않고 빈 판', async () => {
    const { deps: d, calls } = deps();
    const plan = await buildTodayPlan({ ...record, popularKeywords: null, topicKeywords: [] }, pattern, d);
    expect(plan.keywords).toEqual([]);
    expect(calls.volume).toEqual([]);
    expect(calls.seat).toEqual([]);
    expect(plan.titles).toEqual({ status: 'ok', provider: null, items: [] });
  });
});
