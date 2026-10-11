/**
 * 추천키워드 황금 재고(2026-10-11 사장님 "황금이 많아야 돼, 그래야 가치가 있어").
 * 창고 표본 300개 실측: 검색량 2천+ 에 황금 약 1,900개가 숨어 있다(2천~1만 7% · 1만~5만 7% · 5만+ 21%, 500~2천 0%).
 * 매 회차 주제당 상위 240개만 재고 하루 만에 버려서 못 찾았다 → 문서 수를 14일 기억하고, 남는 시간에 창고를 훑는다.
 */
import { describe, expect, it } from 'vitest';
const { inventoryGoldenRows, sweepTargets, remember, pruneInventory, INVENTORY_DAYS } = require('../../../scripts/today-picks-inventory');

const now = Date.parse('2026-10-11T05:00:00Z');
const daysAgo = (n: number) => new Date(now - n * 86400000).toISOString();

describe('재고에서 황금 꺼내기', () => {
  it('그 주제 · 14일 안 실측 · 검색량 ÷ 문서수 1 이상만, 검색량 큰 순', () => {
    const inv = new Map<string, any>();
    remember(inv, '황금큰', { documentCount: 1000, measuredAt: daysAgo(3), searchVolume: 9000, topic: '경제', source: 'hint' });
    remember(inv, '황금작은', { documentCount: 2000, measuredAt: daysAgo(1), searchVolume: 3000, topic: '경제', source: 'biztp' });
    remember(inv, '일반말', { documentCount: 9000, measuredAt: daysAgo(1), searchVolume: 3000, topic: '경제', source: 'hint' });
    remember(inv, '오래된황금', { documentCount: 100, measuredAt: daysAgo(INVENTORY_DAYS + 1), searchVolume: 3000, topic: '경제', source: 'hint' });
    remember(inv, '다른주제황금', { documentCount: 100, measuredAt: daysAgo(1), searchVolume: 3000, topic: '건강', source: 'hint' });
    const rows = inventoryGoldenRows(inv, '경제', 1, now);
    expect(rows.map((r: any) => [r.keyword, r.documentCount, r.source])).toEqual([['황금큰', 1000, 'hint'], ['황금작은', 2000, 'biztp']]);
  });

  it('14일 지난 실측은 저장할 때 버린다', () => {
    const inv = new Map<string, any>();
    remember(inv, '새것', { documentCount: 1, measuredAt: daysAgo(2), searchVolume: 3000, topic: '경제' });
    remember(inv, '헌것', { documentCount: 1, measuredAt: daysAgo(INVENTORY_DAYS + 2), searchVolume: 3000, topic: '경제' });
    expect([...pruneInventory(inv, now).keys()]).toEqual(['새것']);
  });
});

describe('창고 훑기 대상', () => {
  const seed = (keyword: string, searchVolume: number, topic: string) => ({ keyword, searchVolume, topic });
  it('검색량 2천+ · 재고에 없거나 14일 지난 말만, 주제를 돌아가며(각 주제 안은 검색량 큰 순), 상한까지', () => {
    const inv = new Map<string, any>();
    remember(inv, '이미잼', { documentCount: 10, measuredAt: daysAgo(1), searchVolume: 50000, topic: 'A' });
    remember(inv, '오래잼', { documentCount: 10, measuredAt: daysAgo(INVENTORY_DAYS + 1), searchVolume: 40000, topic: 'A' });
    const seeds = [seed('이미잼', 50000, 'A'), seed('오래잼', 40000, 'A'), seed('A큰', 30000, 'A'), seed('A작은', 2500, 'A'), seed('A너무작음', 1500, 'A'), seed('B큰', 20000, 'B'), seed('B중간', 9000, 'B')];
    const targets = sweepTargets(seeds, inv, { minVolume: 2000, limit: 4, nowMs: now, topicOf: (s: any) => s.topic, guard: () => true });
    expect(targets.map((s: any) => s.keyword)).toEqual(['오래잼', 'B큰', 'A큰', 'B중간']);
  });
});
