import { describe, it, expect } from 'vitest';
import {
  SEASONAL_SEEDS,
  monthsAhead,
  seasonalSeedsForTopic,
  seasonalSeedProblems,
} from '../seasonal-seeds';

describe('seasonal-seeds 표', () => {
  it('결함이 없다 — 주제 라벨·15자·중복·달 범위', () => {
    expect(seasonalSeedProblems()).toEqual([]);
  });

  it('CI 활성 7주제 전부에 씨앗이 있다', () => {
    for (const topic of ['사회·정치', '비즈니스·경제', '일상·생각', '자동차', '건강·의학', '국내여행', '육아·결혼']) {
      expect(SEASONAL_SEEDS[topic]?.length ?? 0).toBeGreaterThanOrEqual(15);
    }
  });

  it('활성 7주제만으로도 100개가 넘는다(사장님: "대량으로 있어야 메리트")', () => {
    const active = ['사회·정치', '비즈니스·경제', '일상·생각', '자동차', '건강·의학', '국내여행', '육아·결혼'];
    const total = active.reduce((n, t) => n + (SEASONAL_SEEDS[t]?.length ?? 0), 0);
    expect(total).toBeGreaterThanOrEqual(100);
  });
});

describe('monthsAhead', () => {
  it('같은 달 0, 다음 달 1, 지난 달 11 — 연말을 넘어도 맞는다', () => {
    expect(monthsAhead(9, 9)).toBe(0);
    expect(monthsAhead(10, 9)).toBe(1);
    expect(monthsAhead(8, 9)).toBe(11);
    expect(monthsAhead(1, 12)).toBe(1);
    expect(monthsAhead(2, 11)).toBe(3);
  });
});

describe('seasonalSeedsForTopic — 피크 1~4개월 전에만 켠다', () => {
  const sep = new Date(2026, 8, 15); // 9월

  it('9월엔 독감(9·10월)·국가건강검진(10~12월)이 켜지고 벚꽃(3·4월)은 꺼진다', () => {
    const health = seasonalSeedsForTopic('건강·의학', sep, { limit: 100 });
    expect(health).toContain('독감 예방접종 시기');
    expect(health).toContain('국가건강검진');
    const travel = seasonalSeedsForTopic('국내여행', sep, { limit: 100 });
    expect(travel).not.toContain('벚꽃 명소');
    expect(travel).toContain('단풍 명소');
  });

  it('같은 달(피크 0개월)은 이미 늦어서 빠진다', () => {
    // 근로장려금 peak [3,5,9] → 9월엔 ahead 0 → 제외. 12월엔 3월까지 3 → 포함.
    expect(seasonalSeedsForTopic('사회·정치', sep, { limit: 100 })).not.toContain('근로장려금 신청');
    expect(seasonalSeedsForTopic('사회·정치', new Date(2026, 11, 1), { limit: 100 })).toContain('근로장려금 신청');
  });

  it('연말을 넘는 창도 맞는다 — 12월엔 1·2월 피크가 켜진다', () => {
    const dec = new Date(2026, 11, 1);
    const seeds = seasonalSeedsForTopic('사회·정치', dec, { limit: 100 });
    expect(seeds).toContain('연말정산 간소화');
    expect(seeds).toContain('연말정산 환급금');
  });

  it('피크가 가까운 순으로 오고 limit 를 지킨다', () => {
    const seeds = seasonalSeedsForTopic('국내여행', sep, { limit: 3 });
    expect(seeds).toHaveLength(3);
    // 9월 기준 창(1~4개월) 안에서 가장 가까운 피크는 10월(1개월) — 단풍·핑크뮬리·
    // 불꽃축제 계열이 앞에 온다. 9월 피크(0개월)는 창 밖이라 세지 않는다.
    for (const term of seeds) {
      const seed = SEASONAL_SEEDS['국내여행'].find((s) => s.term === term)!;
      const inWindow = seed.peak.map((m) => monthsAhead(m, 9)).filter((a) => a >= 1 && a <= 4);
      expect(Math.min(...inWindow)).toBe(1);
    }
  });

  it('모르는 주제는 빈 배열 — 던지지 않는다(회차가 죽으면 안 된다)', () => {
    expect(seasonalSeedsForTopic('없는 주제', sep)).toEqual([]);
  });
});
