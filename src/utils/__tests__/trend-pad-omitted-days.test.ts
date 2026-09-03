import { describe, expect, it } from 'vitest';
import { classifyTrendType, padOmittedDays } from '../trend-type-classifier';

/**
 * 데이터랩은 검색 0 인 날을 빼고 준다(실측 2026-09-03: 30일 요청에 29점, 갓 태어난
 * 이슈 키워드 '지예은 남편' 은 2점). 빠진 날을 0 으로 채워야 폭발 모양이 그려진다.
 */
describe('padOmittedDays — 데이터랩이 뺀 날을 0 으로 채운다', () => {
  it('이틀치만 온 갓 태어난 키워드는 시작일부터 0 으로 채워 폭발 모양이 된다', () => {
    const padded = padOmittedDays(
      { series: [37, 100], dates: ['2026-09-01', '2026-09-02'] },
      '2026-08-04'
    );
    expect(padded.dates.length).toBe(30);
    expect(padded.dates[0]).toBe('2026-08-04');
    expect(padded.dates[29]).toBe('2026-09-02');
    expect(padded.series.slice(0, 28).every((v) => v === 0)).toBe(true);
    expect(padded.series.slice(28)).toEqual([37, 100]);
  });

  it('채운 뒤엔 14점 문턱을 넘어 트렌드 분류가 돌아간다(2점이면 unknown)', () => {
    const raw = { series: [37, 100], dates: ['2026-09-01', '2026-09-02'] };
    expect(classifyTrendType(raw.series).type).toBe('unknown');
    const padded = padOmittedDays(raw, '2026-08-04');
    expect(classifyTrendType(padded.series).type).not.toBe('unknown');
  });

  it('마지막으로 돌려준 날 뒤(아직 집계 안 된 오늘)는 채우지 않는다', () => {
    const padded = padOmittedDays(
      { series: [10, 20], dates: ['2026-08-30', '2026-08-31'] },
      '2026-08-29'
    );
    expect(padded.dates).toEqual(['2026-08-29', '2026-08-30', '2026-08-31']);
    expect(padded.series).toEqual([0, 10, 20]);
  });

  it('가운데 빠진 날도 0 으로 채운다', () => {
    const padded = padOmittedDays(
      { series: [5, 7], dates: ['2026-08-01', '2026-08-03'] },
      '2026-08-01'
    );
    expect(padded.dates).toEqual(['2026-08-01', '2026-08-02', '2026-08-03']);
    expect(padded.series).toEqual([5, 0, 7]);
  });

  it('한 점도 없으면 빈 그대로 둔다 — 없는 값을 지어내지 않는다', () => {
    expect(padOmittedDays({ series: [], dates: [] }, '2026-08-04')).toEqual({ series: [], dates: [] });
  });

  it('시작일이 첫 점보다 뒤거나 깨진 값이면 첫 점부터 시작한다', () => {
    const late = padOmittedDays({ series: [1, 2], dates: ['2026-08-10', '2026-08-11'] }, '2026-08-20');
    expect(late.dates[0]).toBe('2026-08-10');
    const broken = padOmittedDays({ series: [1, 2], dates: ['2026-08-10', '2026-08-11'] }, '');
    expect(broken.dates).toEqual(['2026-08-10', '2026-08-11']);
  });

  it('모든 날이 온 정상 키워드는 그대로다', () => {
    const dates = Array.from({ length: 5 }, (_, i) => `2026-08-0${i + 1}`);
    const series = [3, 4, 5, 6, 7];
    expect(padOmittedDays({ series, dates }, '2026-08-01')).toEqual({ series, dates });
  });
});

/**
 * 집계 지평선(throughDate): 매일 검색되는 닻 키워드가 마지막으로 집계된 날. 이 날까지
 * 응답에 없는 날은 '아직 안 됨'이 아니라 '검색 0'이다. 실측 '아틀라스 브라우저' —
 * 8/14 한 점(100)뿐인데 지평선 없이 채우면 마지막 점이 그래프 끝이라 "지금 터진 것"
 * 처럼 보였다.
 */
describe('padOmittedDays — 집계 지평선까지 뒤쪽 0 을 채운다', () => {
  it('한 점뿐인 옛 키워드는 지평선까지 0 이 이어져 식은 모양이 된다', () => {
    const padded = padOmittedDays(
      { series: [100], dates: ['2026-08-14'] },
      '2026-08-04',
      '2026-09-02'
    );
    expect(padded.dates.length).toBe(30);
    expect(padded.dates[10]).toBe('2026-08-14');
    expect(padded.series[10]).toBe(100);
    expect(padded.series.slice(11).every((v) => v === 0)).toBe(true);
    expect(padded.dates[29]).toBe('2026-09-02');
  });

  it('지평선이 마지막 점보다 앞이면(닻이 뒤처짐) 마지막 점까지만 — 실측을 자르지 않는다', () => {
    const padded = padOmittedDays(
      { series: [10, 20], dates: ['2026-08-30', '2026-09-02'] },
      '2026-08-29',
      '2026-08-31'
    );
    expect(padded.dates).toEqual(['2026-08-29', '2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02']);
    expect(padded.series).toEqual([0, 10, 0, 0, 20]);
  });

  it('지평선이 깨진 값이면 없는 것과 같다', () => {
    const padded = padOmittedDays({ series: [10, 20], dates: ['2026-08-30', '2026-08-31'] }, '2026-08-29', 'yesterday');
    expect(padded.dates).toEqual(['2026-08-29', '2026-08-30', '2026-08-31']);
  });
});
