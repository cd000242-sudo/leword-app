import { describe, expect, it } from 'vitest';
import { completeWeeks, readDemandNow, fetchWeeklyDemand, type WeeklyPoint } from '../demand-now';

/**
 * "지금 쓰면 트래픽이 오나"(2026-10-20 사장님 "그래프로 확인을 하지만 그걸 확인해서 알려줘야") —
 * 데이터랩 주별 실측 비율만으로 판정한다. 예상 유입 같은 추정치는 만들지 않는다.
 */

/** 2025-09-29(월)부터 n주 — ratio 는 fn(i). */
function weeks(n: number, fn: (i: number) => number): WeeklyPoint[] {
  const start = Date.UTC(2025, 8, 29);
  return Array.from({ length: n }, (_, i) => ({ period: new Date(start + i * 7 * 86400000).toISOString().slice(0, 10), ratio: fn(i) }));
}
const TODAY = '2026-10-20';

describe('completeWeeks', () => {
  it('아직 안 끝난 주는 뺀다(덜 찬 주가 하락처럼 보이지 않게)', () => {
    const pts = [{ period: '2026-10-12', ratio: 50 }, { period: '2026-10-19', ratio: 5 }];
    expect(completeWeeks(pts, TODAY).map((p) => p.period)).toEqual(['2026-10-12']);
  });
});

describe('readDemandNow', () => {
  it('최근 4주가 직전 8주보다 30% 넘게 높으면 지금 오르는 중', () => {
    const pts = weeks(56, (i) => (i >= 51 ? 80 : 40));
    const r = readDemandNow(pts, TODAY);
    expect(r.verdict).toBe('rising');
    expect(r.recentChangePct).toBe(100);
    expect(r.fact).toContain('100%');
  });

  it('작년 이맘때 다음 4주에 30% 넘게 올랐고 지금 꺾이지 않았으면 곧 시즌', () => {
    // 52주 전 근처: 마지막 완료 주(54번)의 52주 전 = 2번. 3~6번이 높다.
    const pts = weeks(56, (i) => (i >= 3 && i <= 6 ? 90 : 40));
    const r = readDemandNow(pts, TODAY);
    expect(r.verdict).toBe('season-soon');
    expect(r.lastYearNextPct).toBeGreaterThanOrEqual(30);
  });

  it('최근 4주가 30% 넘게 낮고 최고치의 40% 아래면 피크 지남, 아니면 식는 중', () => {
    expect(readDemandNow(weeks(56, (i) => (i < 20 ? 100 : i >= 51 ? 20 : 45)), TODAY).verdict).toBe('past-peak');
    expect(readDemandNow(weeks(56, (i) => (i >= 51 ? 50 : 80)), TODAY).verdict).toBe('cooling');
  });

  it('큰 변화가 없으면 꾸준함', () => {
    expect(readDemandNow(weeks(56, () => 50), TODAY).verdict).toBe('steady');
  });

  // 2026-10-20 실측: 아이폰듀오 · 할리스개인정보유출 · 태풍처럼 최근에 처음 생긴 말은 데이터랩 기록이 1~14주뿐이었다.
  it('기록이 최근 몇 주부터 시작된 말은 새로 뜬 말, 이미 최고치의 40% 아래로 꺼졌으면 피크 지남', () => {
    const startNew = (n: number, fn: (i: number) => number) => weeks(56, (i) => (i >= 56 - n ? fn(i - (56 - n)) : NaN)).filter((p) => Number.isFinite(p.ratio));
    const fresh = readDemandNow(startNew(6, (i) => 20 + i * 10), TODAY);
    expect(fresh.verdict).toBe('new');
    expect(fresh.fact).toBe('5주 전부터 검색이 잡히기 시작한 새 키워드입니다');
    expect(readDemandNow(startNew(8, (i) => (i === 1 ? 100 : 5)), TODAY).verdict).toBe('past-peak');
  });

  it('기록이 듬성듬성하고 오래전부터면 모름', () => {
    const sparse = weeks(56, (i) => (i % 9 === 0 ? 30 : NaN)).filter((p) => Number.isFinite(p.ratio));
    expect(readDemandNow(sparse, TODAY).verdict).toBe('unknown');
  });

  it('그래프용 최근 26주 실측 비율을 싣는다(덜 찬 주 제외)', () => {
    const r = readDemandNow(weeks(56, (i) => i), TODAY);
    expect(r.series).toHaveLength(26);
    expect(r.series.at(-1)).toBe(54);
    expect(r.asOf).toBe('2026-10-12');
  });
});

describe('fetchWeeklyDemand', () => {
  it('데이터랩에 주 단위 · 약 13개월로 묻고, 실패하면 빈 배열(지어내지 않음)', async () => {
    let sent: any = null;
    const ok = await fetchWeeklyDemand('자동차세 연납', { clientId: 'id', clientSecret: 'sec' }, (async (_url: string, init: any) => {
      sent = JSON.parse(init.body);
      return { ok: true, json: async () => ({ results: [{ data: [{ period: '2026-10-05', ratio: 12.5 }] }] }) };
    }) as any, new Date('2026-10-20T00:00:00Z'));
    expect(sent.timeUnit).toBe('week');
    expect(sent.keywordGroups).toEqual([{ groupName: '자동차세 연납', keywords: ['자동차세 연납'] }]);
    expect(sent.startDate).toBe('2025-09-15');
    expect(ok).toEqual([{ period: '2026-10-05', ratio: 12.5 }]);
    const failed = await fetchWeeklyDemand('x', { clientId: 'id', clientSecret: 'sec' }, (async () => ({ ok: false, status: 429 })) as any);
    expect(failed).toEqual([]);
  });
});
