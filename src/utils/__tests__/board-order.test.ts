import { describe, it, expect } from 'vitest';
import { estimatePeak, isFrontalSaturated, orderForPublish, timingGroupFor } from '../board-order';

/** 월별 시계열. startYear/startMonth 부터 ratios 길이만큼. period 는 데이터랩처럼 'YYYY-MM-01'. */
function series(ratios: number[], startYear: number, startMonth: number): Array<{ period: string; ratio: number }> {
  return ratios.map((ratio, i) => {
    const idx = startMonth - 1 + i;
    const y = startYear + Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    return { period: `${y}-${String(m).padStart(2, '0')}-01`, ratio };
  });
}

/** 8월이 최고인 한 해(1월 시작). */
const AUG_YEAR = [3, 3, 3, 3, 4, 5, 20, 100, 6, 3, 3, 3];
/** 2024-01 ~ 2025-12 두 해 모두 8월 최고 + 2026-01~08 + 이번 달(2026-09) 부분. */
const TWO_YEARS_AUG = [...series(AUG_YEAR, 2024, 1), ...series(AUG_YEAR, 2025, 1), ...series([3, 3, 3, 3, 4, 5, 20, 100, 1], 2026, 1)];
const SEP7 = new Date(2026, 8, 7);

describe('estimatePeak — 실측 두 개의 단순 산술', () => {
  it('이번 달(며칠치)은 버리고 마지막 완결 달을 "지금"으로 쓴다', () => {
    const row = { keyword: '주민세 납부기간', searchVolume: 27110, demandSeries: TWO_YEARS_AUG };
    const peak = estimatePeak(row, SEP7)!;
    expect(peak.peakMonth).toBe(8);
    // 완결 달(8월)이 곧 최고치 → 피크 검색량 = 지금 검색량. 9월 부분 점(1)로 나눴다면 100배가 됐을 것.
    expect(peak.peakVolume).toBe(27110);
  });

  it('배수는 평소(12개월 중앙값) 대비다 — 부분 달에 흔들리지 않는다', () => {
    const row = { keyword: 'x', searchVolume: 1000, demandSeries: TWO_YEARS_AUG };
    // 마지막 완결 12개월 = 2025-09~2026-08: [6,3,3,3, 3,3,3,3,4,5,20,100] → 중앙값 3 → 100/3
    expect(estimatePeak(row, SEP7)!.peakMultiplier).toBe(33.3);
  });

  it('두 해 모두 같은 달이 최고면 반복(true), 다르면 false, 한 해뿐이면 null', () => {
    expect(estimatePeak({ keyword: 'a', searchVolume: 100, demandSeries: TWO_YEARS_AUG }, SEP7)!.peakRecurring).toBe(true);
    const oneOff = [...series(Array(12).fill(5), 2024, 9), ...series([5, 5, 5, 5, 5, 5, 5, 100, 5, 5, 5, 5], 2025, 9)];
    expect(estimatePeak({ keyword: 'b', searchVolume: 100, demandSeries: oneOff }, SEP7)!.peakRecurring).toBe(false);
    const oneYear = series(AUG_YEAR, 2025, 9);
    expect(estimatePeak({ keyword: 'c', searchVolume: 100, demandSeries: oneYear }, SEP7)!.peakRecurring).toBeNull();
  });

  it('12월↔1월처럼 이웃한 달은 같은 계절로 본다', () => {
    const decThenJan = [...series([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 100], 2024, 1), ...series([100, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 2025, 1)];
    expect(estimatePeak({ keyword: 'd', searchVolume: 100, demandSeries: decThenJan }, new Date(2026, 1, 1))!.peakRecurring).toBe(true);
  });

  it('12개월이 안 되면 재지 않는다 — 절반짜리 최고치는 거짓이다', () => {
    expect(estimatePeak({ keyword: 'x', searchVolume: 1000, demandSeries: series([100, 1, 1, 1, 1, 1], 2026, 1) }, SEP7)).toBeNull();
  });

  it('검색량이 없으면 재지 않는다', () => {
    expect(estimatePeak({ keyword: 'x', searchVolume: null, demandSeries: TWO_YEARS_AUG }, SEP7)).toBeNull();
  });
});

describe('isFrontalSaturated — 상위 10개 정면 8개↑', () => {
  it('10/10 은 포화, 2/10 은 아니다, 표본이 적으면 판정하지 않는다', () => {
    expect(isFrontalSaturated({ keyword: 'a', serp: { sampledTitles: 10, exactTitleHits: 10 } })).toBe(true);
    expect(isFrontalSaturated({ keyword: 'b', serp: { sampledTitles: 10, exactTitleHits: 2 } })).toBe(false);
    expect(isFrontalSaturated({ keyword: 'c', serp: { sampledTitles: 5, exactTitleHits: 5 } })).toBe(false);
    expect(isFrontalSaturated({ keyword: 'd' })).toBe(false);
  });
});

describe('timingGroupFor', () => {
  it('0~3 지금 적기 · 4~6 준비 시기 · 7~11 성수기 지남', () => {
    expect(timingGroupFor(0)).toBe('지금 적기');
    expect(timingGroupFor(3)).toBe('지금 적기');
    expect(timingGroupFor(4)).toBe('준비 시기');
    expect(timingGroupFor(6)).toBe('준비 시기');
    expect(timingGroupFor(7)).toBe('성수기 지남');
    expect(timingGroupFor(11)).toBe('성수기 지남');
  });
});

describe('orderForPublish', () => {
  const flat2y = series(Array(24).fill(10), 2024, 9);

  it('레드오션(정면 포화)은 검색량이 커도 뒤로 간다 — 사장님 실측의 앞줄 5개', () => {
    const rows = [
      { keyword: '기아 ev5', searchVolume: 60670, demandSeries: flat2y, serp: { sampledTitles: 10, exactTitleHits: 9 } },
      { keyword: '기아 ev7', searchVolume: 5250, demandSeries: flat2y, serp: { sampledTitles: 10, exactTitleHits: 7 } },
      { keyword: '베게 베개 맞춤법', searchVolume: 4000, demandSeries: flat2y, serp: { sampledTitles: 10, exactTitleHits: 2 } },
    ];
    const ordered = orderForPublish(rows, { now: SEP7 });
    expect(ordered.map((r) => r.keyword)).toEqual(['기아 ev7', '베게 베개 맞춤법', '기아 ev5']);
    expect(ordered[2].frontalSaturated).toBe(true);
  });

  it('2년 반복 계절이고 피크가 1~6개월 앞이면 피크 검색량으로 앞에 선다', () => {
    const apr = new Date(2026, 3, 1); // 4월 → 8월 피크까지 4
    const rows = [
      { keyword: '지금 큰 것', searchVolume: 20000, demandSeries: flat2y },
      { keyword: '곧 터질 것', searchVolume: 3000, demandSeries: TWO_YEARS_AUG },
    ];
    const ordered = orderForPublish(rows, { now: apr });
    expect(ordered[0].keyword).toBe('곧 터질 것');
    // 4월 기준 완결 달 = 2026-03(3) → 3000 × 100/3
    expect(ordered[0].effectiveVolume).toBe(100000);
    expect(ordered[0].timingGroup).toBe('준비 시기');
    expect(ordered[0].monthsToPeak).toBe(4);
  });

  it('피크가 방금 지난 것은 지금 검색량으로 줄 선다 — 열 달 기다릴 것을 앞에 세우지 않는다', () => {
    // 드라이런 실측: 제주렌트카 본사 — 8월 피크, 9월 지금, 다음 피크까지 11개월.
    const rows = [
      { keyword: '지난 피크', searchVolume: 5000, demandSeries: TWO_YEARS_AUG },
      { keyword: '평탄한 것', searchVolume: 8000, demandSeries: flat2y },
    ];
    const ordered = orderForPublish(rows, { now: SEP7 });
    expect(ordered[0].keyword).toBe('평탄한 것');
    expect(ordered[1].effectiveVolume).toBe(5000);
    expect(ordered[1].monthsToPeak).toBe(11);
    expect(ordered[1].timingGroup).toBe('성수기 지남');
  });

  it('일회성 급등(재작년은 달랐음)이나 한 해뿐이면 시기를 말하지 않는다 — 사실만 싣는다', () => {
    const apr = new Date(2026, 3, 1);
    const oneOff = [...series(Array(12).fill(5), 2024, 4), ...series([5, 5, 5, 5, 100, 5, 5, 5, 5, 5, 5, 5], 2025, 4)];
    const oneYear = series([5, 5, 5, 5, 100, 5, 5, 5, 5, 5, 5, 5], 2025, 4);
    const [a, b] = orderForPublish([
      { keyword: '출시 급등', searchVolume: 5000, demandSeries: oneOff, timingGroup: '지금 뜨는 중' },
      { keyword: '한 해뿐', searchVolume: 5000, demandSeries: oneYear, timingGroup: '' },
    ], { now: apr });
    for (const row of [a, b]) {
      expect(row.peakMonth).toBe(8);
      expect(row.effectiveVolume).toBe(5000);
    }
    expect(a.peakRecurring).toBe(false);
    expect(a.timingGroup).toBe('지금 뜨는 중'); // 기존 배지 그대로
    expect(b.peakRecurring).toBeNull();
    expect(b.timingGroup).toBe('');
  });

  it('원본 배열과 행을 바꾸지 않는다', () => {
    const rows = [{ keyword: 'a', searchVolume: 1, demandSeries: TWO_YEARS_AUG }, { keyword: 'b', searchVolume: 2, demandSeries: flat2y }];
    const snapshot = JSON.stringify(rows);
    orderForPublish(rows, { now: SEP7 });
    expect(JSON.stringify(rows)).toBe(snapshot);
  });

  it('검색량이 같으면 tierRank 로 가른다', () => {
    const rows = [{ keyword: 'x', searchVolume: 100, tier: 'b' }, { keyword: 'y', searchVolume: 100, tier: 'a' }];
    const ordered = orderForPublish(rows, { now: SEP7, tierRank: (t) => (t === 'a' ? 0 : 1) });
    expect(ordered[0].keyword).toBe('y');
  });
});
