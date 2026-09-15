import { describe, expect, it } from 'vitest';
import { buildSiteGoldenRows, mergeGoldenBoardRows, siteRowToGoldenRow } from '../golden-site-merge';

/**
 * 사이트 판 + 이 PC 판 합치기(2026-09-15, 황금키워드 상위호환 2단계).
 *
 * 사장님 결정 "사이트 판 전부 + 같은 관문 통과분". 이 PC 판은 앱이 사이트와 같은 스크립트로 이 PC 에서 잰 판이다.
 * 같은 말이 양쪽에 있으면 더 최근에 잰 쪽을 남긴다(사장님께 알린 기본값).
 */
const row = (keyword: string, measuredAt: string | null) => ({
  keyword,
  topic: '인테리어·DIY',
  searchVolume: 2000,
  documentCount: 500,
  tier: 'golden-ratio',
  tierLabel: '황금 비율',
  measuredAt,
});

describe('판 이름', () => {
  it('행에 어느 판에서 왔는지 붙는다 — 섞여도 구별된다', () => {
    const site = siteRowToGoldenRow(row('욕실 줄눈 셀프', '2026-09-10T00:00:00Z'));
    const local = siteRowToGoldenRow(row('욕실 줄눈 셀프', '2026-09-15T00:00:00Z'), null, 'app-board');
    expect(site?.source).toBe('site-board');
    expect(site?.goldenReason.startsWith('사이트 판')).toBe(true);
    expect(local?.source).toBe('app-board');
    expect(local?.goldenReason.startsWith('이 PC 판')).toBe(true);
  });

  it('판을 통째로 바꿀 때도 같은 이름을 붙인다', () => {
    expect(buildSiteGoldenRows({ rows: [row('욕실 줄눈 셀프', null)] }, '', {}, 'app-board').map((r) => r.source)).toEqual(['app-board']);
    expect(buildSiteGoldenRows({ rows: [row('욕실 줄눈 셀프', null)] }, '').map((r) => r.source)).toEqual(['site-board']);
  });
});

describe('사이트 판 + 이 PC 판', () => {
  const site = buildSiteGoldenRows({
    rows: [row('욕실 줄눈 셀프', '2026-09-10T00:00:00Z'), row('베란다 방수 페인트', '2026-09-12T00:00:00Z'), row('현관 중문 가격', null)],
  }, '');
  const local = buildSiteGoldenRows({
    rows: [
      row('욕실줄눈 셀프', '2026-09-15T00:00:00Z'),
      row('베란다 방수 페인트', '2026-09-01T00:00:00Z'),
      row('현관 중문 가격', '2026-09-14T00:00:00Z'),
      row('붙박이장 셀프 시공', '2026-09-15T00:00:00Z'),
    ],
  }, '', {}, 'app-board');

  it('같은 말(공백 차이 포함)은 한 번 — 더 최근에 잰 쪽을 남기고, 자리는 사이트 판 순서다', () => {
    expect(mergeGoldenBoardRows(site, local).map((r) => [r.keyword, r.source])).toEqual([
      ['욕실줄눈 셀프', 'app-board'],
      ['베란다 방수 페인트', 'site-board'],
      ['현관 중문 가격', 'app-board'],
      ['붙박이장 셀프 시공', 'app-board'],
    ]);
  });

  it('잰 시각이 같거나 둘 다 모르면 사이트 판을 남긴다', () => {
    const a = buildSiteGoldenRows({ rows: [row('도배 셀프', '2026-09-10T00:00:00Z'), row('장판 교체 비용', null)] }, '');
    const b = buildSiteGoldenRows({ rows: [row('도배 셀프', '2026-09-10T00:00:00Z'), row('장판 교체 비용', null)] }, '', {}, 'app-board');
    expect(mergeGoldenBoardRows(a, b).map((r) => r.source)).toEqual(['site-board', 'site-board']);
  });

  it('한쪽 판이 비어도 다른 쪽을 그대로 돌려준다', () => {
    expect(mergeGoldenBoardRows([], local)).toEqual(local);
    expect(mergeGoldenBoardRows(site, [])).toEqual(site);
  });
});
