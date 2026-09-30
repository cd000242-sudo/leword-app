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

  it('제목 재료 실측기는 골라진 10개만 받고, 카드에 재료를 붙인다 — 죽으면 전부 재료 없음(facts 빈 배열) + 사유', async () => {
    const factCalls: string[][] = [];
    const seenFacts: (string[] | undefined)[][] = [];
    const { deps: d } = deps({
      facts: async (keywords) => { factCalls.push(keywords); return new Map(keywords.map((k) => [k, { autocomplete: [`${k} 조건`], related: [], headlines: [] }])); },
      titles: async (cards) => { seenFacts.push(cards.map((c) => c.facts)); return { status: 'ok', provider: 'claude', items: [] }; },
    });
    const plan = await buildTodayPlan(record, pattern, d);
    expect(factCalls[0]).toEqual(plan.keywords.map((row) => row.keyword));
    expect(seenFacts[0]).toEqual(plan.keywords.map(() => []));
    expect(plan.notes).toEqual([]);

    const broken = deps({ facts: async () => { throw new Error('오픈 API 키 없음'); }, titles: async (cards) => { seenFacts.push(cards.map((c) => c.facts)); return { status: 'ok', provider: null, items: [] }; } });
    const plan2 = await buildTodayPlan(record, pattern, broken.deps);
    expect(seenFacts[1]).toEqual(plan2.keywords.map(() => []));
    expect(plan2.notes).toEqual(['제목 재료 수집 실패: 오픈 API 키 없음']);
  });

  it('후보가 없으면 실측기를 부르지 않고 빈 판', async () => {
    const { deps: d, calls } = deps();
    const plan = await buildTodayPlan({ ...record, popularKeywords: null, topicKeywords: [] }, pattern, d);
    expect(plan.keywords).toEqual([]);
    expect(calls.volume).toEqual([]);
    expect(calls.seat).toEqual([]);
    expect(plan.titles).toEqual({ status: 'ok', provider: null, items: [] });
    // 빈 판에도 홈판 실측 칸은 있다(개수 0)
    expect(plan.homefeed).toEqual({ yesterdayTotal: 0, myTopicYesterday: 0, weekTotal: 0, exemplars: [] });
  });

  /**
   * 최근 7일 홈판 본보기(2026-09-30 4단계) — 기록의 homefeedWeek 에서 고른 제목이 제목 실측기의 두 번째 인자로 간다.
   * 판에는 어제 상위 20 중 내 주제 해당 수와 넣은 본보기가 실린다 — 전부 실측 개수·매칭 사실, 추정치 없음.
   */
  const homefeedWeek = [
    { day: '2026-09-29', rank: 1, title: '투싼 하이브리드 계약하고 두 달 기다린 끝에 받은 안내', url: 'http://blog.naver.com/carlog/3' },
    { day: '2026-09-29', rank: 2, title: '"그 집 또 갔다" 이번엔 줄이 반대편까지 이어진 사정', url: 'http://blog.naver.com/foodlog/2' },
    { day: '2026-09-28', rank: 1, title: '가을 이사 앞두고 장판 먼저 걷어 본 집의 바닥 상태', url: 'http://blog.naver.com/homelog/4' },
  ];

  it('최근 7일 홈판 본보기를 골라 제목 실측기에 같이 넘기고, 판에 어제 실측 개수·내 주제 해당 수를 싣는다', async () => {
    const seenExemplars: string[][] = [];
    const { deps: d } = deps({
      titles: async (cards, exemplars) => { seenExemplars.push([...exemplars]); return { status: 'ok', provider: 'claude', items: cards.map((c) => ({ keyword: c.keyword, titles: [], rejected: [] })) }; },
    });
    const withWeek = { ...record, popularKeywords: { topic: '자동차', items: [{ keyword: '투싼', ratio: 0.3 }, ...record.popularKeywords!.items] }, homefeedWeek } as unknown as AdvisorDailyRecord;
    const plan = await buildTodayPlan(withWeek, pattern, d);
    expect(plan.homefeed.yesterdayTotal).toBe(2);
    expect(plan.homefeed.myTopicYesterday).toBe(1);
    expect(plan.homefeed.weekTotal).toBe(3);
    expect(plan.homefeed.exemplars.map((row) => `${row.day}#${row.rank}${row.myTopic ? '*' : ''}`)).toEqual(['2026-09-29#1*', '2026-09-29#2', '2026-09-28#1']);
    expect(seenExemplars[0]).toEqual(plan.homefeed.exemplars.map((row) => row.title));
    expect(plan.notes).toEqual([]);
  });
});
