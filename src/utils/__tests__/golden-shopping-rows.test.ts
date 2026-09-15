import { describe, expect, it } from 'vitest';
import {
  SHOPPING_CARRY_DAYS,
  buildShoppingLaneRows,
  mergeShoppingStore,
  normalizeShoppingEntries,
  type ShoppingLaneEntry,
} from '../golden-shopping-rows';

/**
 * 쇼핑 쪽으로 넘긴 말 — 황금 판 규칙은 그대로, 따로 모아 보인다(2026-09-15, 사장님 "쇼핑으로 넘긴 말도 앱에 따로 보이기").
 * 실측: 인테리어·DIY 두 번째 실측에서 후보 120건 중 72건이 쇼핑 쪽으로 넘어갔고, 늘어난 실용 후보 6개 중 5개가 여기 있었다.
 */
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-15T09:00:00Z');
const at = (days: number) => new Date(NOW - days * DAY).toISOString();

describe('판의 쇼핑 쪽 줄 읽기', () => {
  it('검색어가 없는 줄은 빼고, 못 잰 칸은 null 로 둔다 — 0 으로 채우지 않는다', () => {
    const entries = normalizeShoppingEntries([
      { topic: '인테리어·DIY', keyword: ' 위프 탈취제 내돈내산 ', searchVolume: 820, documentCount: 574, reasons: ['SERP 2번째 구획이 쇼핑 — 검색 화면이 상품판이다', ''] },
      { topic: '문학·책', keyword: '플레이블 2단 독서대', searchVolume: 750, reasons: ['SERP 2번째 구획이 쇼핑 — 검색 화면이 상품판이다'] },
      { topic: '문학·책', keyword: '' },
      null,
    ], '2026-09-15T08:00:00Z');
    expect(entries).toEqual([
      { topic: '인테리어·DIY', keyword: '위프 탈취제 내돈내산', searchVolume: 820, documentCount: 574, reasons: ['SERP 2번째 구획이 쇼핑 — 검색 화면이 상품판이다'], measuredAt: '2026-09-15T08:00:00Z' },
      { topic: '문학·책', keyword: '플레이블 2단 독서대', searchVolume: 750, documentCount: null, reasons: ['SERP 2번째 구획이 쇼핑 — 검색 화면이 상품판이다'], measuredAt: '2026-09-15T08:00:00Z' },
    ]);
    expect(normalizeShoppingEntries('없음', null)).toEqual([]);
  });

  it('줄에 잰 시각이 있으면 그 시각을 쓴다(쌓아 둔 목록을 다시 읽을 때)', () => {
    const [entry] = normalizeShoppingEntries([{ topic: '취미', keyword: '낚시 조끼', searchVolume: 900, measuredAt: '2026-09-01T00:00:00Z' }], '2026-09-15T00:00:00Z');
    expect(entry.measuredAt).toBe('2026-09-01T00:00:00Z');
  });
});

describe('이 PC 에 쌓기', () => {
  const entry = (keyword: string, measuredAt: string | null, searchVolume = 1000): ShoppingLaneEntry => ({
    topic: '인테리어·DIY', keyword, searchVolume, documentCount: 500, reasons: ['쇼핑 구획'], measuredAt,
  });

  it('같은 말(공백 차이 포함)은 더 최근에 잰 쪽 하나', () => {
    const merged = mergeShoppingStore([entry('육우 한우 차이', at(5), 4000)], [entry('육우한우 차이', at(0), 4610)], NOW);
    expect(merged).toEqual([entry('육우한우 차이', at(0), 4610)]);
  });

  it('90일 넘은 말과 잰 시각이 없는 말은 뺀다', () => {
    const merged = mergeShoppingStore(
      [entry('오래된 말', at(SHOPPING_CARRY_DAYS + 1)), entry('시각 없는 말', null), entry('최근 말', at(3))],
      [],
      NOW,
    );
    expect(merged.map((item) => item.keyword)).toEqual(['최근 말']);
  });
});

describe('발굴 화면에 줄 쇼핑 쪽 목록', () => {
  const app: ShoppingLaneEntry[] = [
    { topic: '인테리어·DIY', keyword: '위프 탈취제 내돈내산', searchVolume: 820, documentCount: 574, reasons: ['쇼핑 구획'], measuredAt: at(0) },
    { topic: '건강·의학', keyword: '파비플로라 효능', searchVolume: 5620, documentCount: 2219, reasons: ['쇼핑 구획'], measuredAt: at(0) },
  ];
  const site: ShoppingLaneEntry[] = [
    { topic: '인테리어·DIY', keyword: '위프탈취제 내돈내산', searchVolume: 800, documentCount: null, reasons: ['쇼핑 구획'], measuredAt: at(5) },
    { topic: '인테리어·DIY', keyword: '욕실 수전 교체', searchVolume: 2400, documentCount: null, reasons: ['쇼핑 구획'], measuredAt: at(5) },
    { topic: '인테리어·DIY', keyword: '벽지 셀프 시공', searchVolume: 1500, documentCount: null, reasons: ['쇼핑 구획'], measuredAt: at(5) },
  ];
  const sources = [{ from: 'app-board' as const, entries: app }, { from: 'site-board' as const, entries: site }];

  it('고른 카테고리의 주제만, 같은 말은 더 최근에 잰 쪽 한 번, 검색량 큰 순', () => {
    expect(buildShoppingLaneRows(sources, '인테리어').map((row) => [row.keyword, row.from])).toEqual([
      ['욕실 수전 교체', 'site-board'],
      ['벽지 셀프 시공', 'site-board'],
      ['위프 탈취제 내돈내산', 'app-board'],
    ]);
  });

  it('황금 판에 이미 실린 말은 뺀다(공백 차이 포함)', () => {
    expect(buildShoppingLaneRows(sources, '인테리어', ['욕실수전 교체']).map((row) => row.keyword)).not.toContain('욕실 수전 교체');
  });

  it('카테고리가 비면 모든 주제', () => {
    expect(buildShoppingLaneRows(sources, '').map((row) => row.keyword)).toContain('파비플로라 효능');
  });

  it('잰 시각이 같으면 앞 출처(이 PC 판 — 문서량 있음)를 남긴다', () => {
    const same = at(1);
    const rows = buildShoppingLaneRows([
      { from: 'app-board', entries: [{ ...app[0], measuredAt: same }] },
      { from: 'site-board', entries: [{ ...site[0], measuredAt: same }] },
    ], '인테리어');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ from: 'app-board', documentCount: 574 });
  });

  it('검색량을 못 잰 줄은 뒤로', () => {
    const rows = buildShoppingLaneRows([{
      from: 'site-board',
      entries: [
        { topic: '인테리어·DIY', keyword: '못 잰 말', searchVolume: null, documentCount: null, reasons: [], measuredAt: at(1) },
        { topic: '인테리어·DIY', keyword: '잰 말', searchVolume: 600, documentCount: null, reasons: [], measuredAt: at(1) },
      ],
    }], '인테리어');
    expect(rows.map((row) => row.keyword)).toEqual(['잰 말', '못 잰 말']);
  });
});
