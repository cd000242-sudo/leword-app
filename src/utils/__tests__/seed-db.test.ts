import { describe, it, expect } from 'vitest';
import { pickSeeds, roundFromDate, seedDbAgeDays, type SeedDb } from '../seed-db';

const db = (count: number): SeedDb => ({
  builtAt: new Date().toISOString(),
  totalSeeds: count,
  // 검색량이 서로 다르게 — 정렬이 실제로 먹는지 보려고 역순으로 넣는다.
  seeds: Array.from({ length: count }, (_, i) => ({ keyword: `말${i}`, searchVolume: (i + 1) * 100 })),
});

describe('pickSeeds', () => {
  it('검색량 하한 아래는 뺀다', () => {
    const picked = pickSeeds(db(10), { limit: 100, minVolume: 500 });
    // 100,200,…,1000 중 500 이상 = 6개
    expect(picked).toHaveLength(6);
    expect(picked).not.toContain('말0');
  });

  it('이미 쓰는 씨앗은 공백을 지워 비교해 뺀다', () => {
    const picked = pickSeeds(db(5), { limit: 100, minVolume: 0, exclude: ['말 4', '말3'] });
    expect(picked).not.toContain('말4');
    expect(picked).not.toContain('말3');
    expect(picked).toHaveLength(3);
  });

  it('검색량 큰 것부터 판다', () => {
    expect(pickSeeds(db(5), { limit: 2, minVolume: 0, round: 0 })).toEqual(['말4', '말3']);
  });

  it('회차마다 다른 구간을 판다 — 앞쪽만 반복해서 파지 않는다', () => {
    const first = pickSeeds(db(100), { limit: 10, minVolume: 0, round: 0 });
    const second = pickSeeds(db(100), { limit: 10, minVolume: 0, round: 1 });
    const third = pickSeeds(db(100), { limit: 10, minVolume: 0, round: 2 });
    expect(first).not.toEqual(second);
    expect(second).not.toEqual(third);
    // 겹치지 않는다 — 창이 정확히 limit 만큼 밀린다
    expect(first.filter((k) => second.includes(k))).toHaveLength(0);
  });

  it('같은 회차 번호면 같은 결과다 — 재현된다(난수 아님)', () => {
    expect(pickSeeds(db(100), { limit: 7, minVolume: 0, round: 42 }))
      .toEqual(pickSeeds(db(100), { limit: 7, minVolume: 0, round: 42 }));
  });

  it('창이 끝에 닿으면 앞으로 돌아온다 — 요청한 개수를 항상 채운다', () => {
    const picked = pickSeeds(db(10), { limit: 8, minVolume: 0, round: 1 });
    expect(picked).toHaveLength(8);
    expect(new Set(picked).size).toBe(8); // 한 회차 안에서 중복 없음
  });

  it('창고가 없거나 비었으면 빈 배열 — 회차를 죽이지 않는다', () => {
    expect(pickSeeds(null, { limit: 10, minVolume: 0 })).toEqual([]);
    expect(pickSeeds({ builtAt: '', totalSeeds: 0, seeds: [] }, { limit: 10, minVolume: 0 })).toEqual([]);
  });

  it('하한을 넘는 씨앗이 없으면 빈 배열', () => {
    expect(pickSeeds(db(3), { limit: 10, minVolume: 999999 })).toEqual([]);
  });
});

describe('seedDbAgeDays', () => {
  it('며칠 됐는지 잰다 — 월·금 갱신이라 3일이 문턱이다', () => {
    const now = new Date('2026-09-07T00:00:00Z');
    const four = { builtAt: '2026-09-03T00:00:00Z', totalSeeds: 0, seeds: [] };
    expect(seedDbAgeDays(four, now)).toBeCloseTo(4, 5);
    expect(seedDbAgeDays(null, now)).toBeNull();
    expect(seedDbAgeDays({ builtAt: '깨진값', totalSeeds: 0, seeds: [] }, now)).toBeNull();
  });
});

describe('roundFromDate', () => {
  it('같은 날은 같은 회차 번호', () => {
    expect(roundFromDate(new Date(2026, 8, 7, 3))).toBe(roundFromDate(new Date(2026, 8, 7, 20)));
    expect(roundFromDate(new Date(2026, 8, 7))).not.toBe(roundFromDate(new Date(2026, 8, 8)));
  });
});
