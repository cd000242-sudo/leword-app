/** 보드 누적 병합 테스트 — 신규 우선·보강 접붙임·만료 규칙 */
import { describe, it, expect } from 'vitest';
import { mergeCarryRows } from '../board-carry';

const NOW = Date.parse('2026-08-18T12:00:00Z');
const DAY = 86_400_000;
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();

const PREV = {
  publishedAt: iso(4),
  rows: [
    {
      keyword: '해리포터 재개봉 일정',
      measuredAt: iso(4),
      titles: { seo: { text: '기존 SEO 제목' } },
      subKeywords: [{ keyword: '해리포터 시리즈 순서' }],
      monetize: { verdict: 'mixed' },
    },
    { keyword: '오래된 키워드', measuredAt: iso(120), titles: { seo: { text: 'x' } } },
    { keyword: '이월될 키워드', measuredAt: iso(10) },
  ],
};

describe('mergeCarryRows', () => {
  it('신규가 이기고, 신규에 없는 기존 행은 이월된다', () => {
    const r = mergeCarryRows(
      [{ keyword: '해리포터 재개봉 일정', measuredAt: iso(0) }, { keyword: '새 키워드', measuredAt: iso(0) }],
      PREV,
      { carryDays: 90, nowMs: NOW }
    );
    const keywords = r.rows.map((x) => x.keyword);
    expect(keywords).toContain('새 키워드');
    expect(keywords).toContain('이월될 키워드');
    expect(keywords.filter((k) => k === '해리포터 재개봉 일정')).toHaveLength(1);
    expect(r.fresh).toBe(2);
    expect(r.carried).toBe(1);
  });

  it('carryDays 를 넘긴 기존 행은 만료된다', () => {
    const r = mergeCarryRows([], PREV, { carryDays: 90, nowMs: NOW });
    expect(r.rows.map((x) => x.keyword)).not.toContain('오래된 키워드');
    expect(r.expired).toBe(1);
  });

  it('같은 키워드의 신규 행에 기존 보강 자산을 접붙인다 (신규 실측값은 유지)', () => {
    const r = mergeCarryRows(
      [{ keyword: '해리포터 재개봉 일정', searchVolume: 2000, measuredAt: iso(0) }],
      PREV,
      { carryDays: 90, nowMs: NOW }
    );
    const row = r.rows.find((x) => x.keyword === '해리포터 재개봉 일정');
    expect(row.searchVolume).toBe(2000);
    expect(row.titles.seo.text).toBe('기존 SEO 제목');
    expect(row.subKeywords).toHaveLength(1);
    expect(r.grafted).toBe(1);
  });

  it('신규 행에 이미 보강이 있으면 접붙이지 않는다', () => {
    const r = mergeCarryRows(
      [{ keyword: '해리포터 재개봉 일정', titles: { seo: { text: '새 제목' } }, subKeywords: [{ keyword: 'a' }] }],
      PREV,
      { carryDays: 90, nowMs: NOW }
    );
    const row = r.rows.find((x) => x.keyword === '해리포터 재개봉 일정');
    expect(row.titles.seo.text).toBe('새 제목');
  });

  it('이월 행에 carried 표식이 붙고, measuredAt 없는 기존 행은 발행 시각으로 나이를 잰다', () => {
    const r = mergeCarryRows([], { publishedAt: iso(5), rows: [{ keyword: '측정시각 없음' }] }, { carryDays: 90, nowMs: NOW });
    expect(r.rows[0].carried).toBe(true);
    expect(r.carried).toBe(1);
  });

  it('직전 발행본이 없으면 신규만 나간다', () => {
    const r = mergeCarryRows([{ keyword: 'a' }], null, { carryDays: 90, nowMs: NOW });
    expect(r.rows).toHaveLength(1);
    expect(r.carried).toBe(0);
  });
});
