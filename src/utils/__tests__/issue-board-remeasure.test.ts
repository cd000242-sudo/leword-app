import { describe, expect, it } from 'vitest';
import {
  applyTrend,
  applyVolume,
  keyReads,
  pickTrendTargets,
  pickVolumeTargets,
  TREND_STALE_MS,
  VOLUME_STALE_MS,
  type RemeasurableRow,
} from '../issue-board-remeasure';

/**
 * 이월 행 재측정 — 검색량 없는 행·그래프 없는 행을 다시 재서 새 행으로 돌려준다.
 * 실사고 2026-09-03 '지예은 남편': 첫 회차엔 키워드도구가 몰라 null, 48시간 이월되는
 * 동안 아무도 다시 안 재서 도구가 알게 된 뒤(모바일 50)에도 화면은 '—'.
 */

const NOW = Date.parse('2026-09-03T10:00:00.000Z');
const HOURS = 60 * 60 * 1000;
const at = (hoursAgo: number) => new Date(NOW - hoursAgo * HOURS).toISOString();

function row(over: Partial<RemeasurableRow> & Record<string, unknown> = {}): RemeasurableRow & Record<string, unknown> {
  return {
    keyword: '지예은 남편',
    searchVolume: null,
    searchVolumeLt10: false,
    measuredAt: at(7),
    trend: null,
    carried: true,
    verdict: 'niche',
    evidence: [{ code: 'demand', text: '데이터랩 최근 7일 수요 실측' }],
    ...over,
  };
}

describe('pickVolumeTargets — 누구의 검색량을 다시 재나', () => {
  it('검색량이 없고 한 시간 넘게 지난 이월 행을 고른다', () => {
    expect(pickVolumeTargets([row()], NOW)).toEqual(['지예은 남편']);
  });

  it('숫자가 있는 행은 안 잰다 — 있는 실측을 흔들지 않는다', () => {
    expect(pickVolumeTargets([row({ searchVolume: 50 })], NOW)).toEqual([]);
    expect(pickVolumeTargets([row({ searchVolume: 0 })], NOW)).toEqual([]);
  });

  it('방금(한 시간 안) 잰 행은 같은 회차에서 또 재지 않는다', () => {
    expect(pickVolumeTargets([row({ measuredAt: at(0.5) })], NOW)).toEqual([]);
    expect(pickVolumeTargets([row({ searchVolumeMeasuredAt: at(0.2), measuredAt: at(30) })], NOW)).toEqual([]);
    expect(VOLUME_STALE_MS).toBe(60 * 60 * 1000);
  });

  it('재측정 기록이 더 최신이면 그것을 기준으로 삼고, 같은 키워드는 한 번만 묻는다', () => {
    const rows = [row({ searchVolumeMeasuredAt: at(2), measuredAt: at(40) }), row({ keyword: '지예은  남편' })];
    expect(pickVolumeTargets(rows, NOW)).toEqual(['지예은 남편']);
  });

  it('"< 10" 으로 잰 행도 다시 잰다 — 이슈가 커지면 숫자가 생긴다', () => {
    expect(pickVolumeTargets([row({ searchVolumeLt10: true })], NOW)).toEqual(['지예은 남편']);
  });
});

describe('pickTrendTargets — 누구의 그래프를 다시 재나', () => {
  it('그래프가 없는 행(0~1점)은 한 시간 지나면 잰다', () => {
    expect(pickTrendTargets([row()], NOW)).toEqual(['지예은 남편']);
    expect(pickTrendTargets([row({ trend: { series: [100] } })], NOW)).toEqual(['지예은 남편']);
    expect(pickTrendTargets([row({ measuredAt: at(0.5) })], NOW)).toEqual([]);
  });

  it('그래프가 있는 행은 여섯 시간 지나야 갱신한다', () => {
    const fresh = row({ trend: { series: [0, 0, 37, 100], measuredAt: at(3) } });
    const stale = row({ trend: { series: [0, 0, 37, 100], measuredAt: at(7) } });
    expect(pickTrendTargets([fresh], NOW)).toEqual([]);
    expect(pickTrendTargets([stale], NOW)).toEqual(['지예은 남편']);
    expect(TREND_STALE_MS).toBe(6 * 60 * 60 * 1000);
  });

  it('그래프 측정 시각이 없으면 행의 measuredAt 을 쓴다', () => {
    expect(pickTrendTargets([row({ trend: { series: [1, 2] }, measuredAt: at(5) })], NOW)).toEqual([]);
    expect(pickTrendTargets([row({ trend: { series: [1, 2] }, measuredAt: at(7) })], NOW)).toEqual(['지예은 남편']);
  });
});

describe('applyVolume — 잰 값을 새 행으로', () => {
  it('실측 숫자를 싣고 Lt10 표식과 재측정 시각을 남긴다 — 원본 행은 그대로', () => {
    const before = row();
    const after = applyVolume([before], keyReads([{ keyword: '지예은 남편', read: { searchVolume: 50, searchVolumeLt10: true, isSearchVolumeEstimated: false } }]), at(0));
    expect(after[0].searchVolume).toBe(50);
    expect(after[0].searchVolumeLt10).toBe(true);
    expect(after[0].searchVolumeMeasuredAt).toBe(at(0));
    expect(after[0]).not.toBe(before);
    expect(before.searchVolume).toBeNull();
    // 판정·근거 같은 다른 필드는 손대지 않는다.
    expect(after[0].verdict).toBe('niche');
    expect(after[0].evidence).toEqual(before.evidence);
  });

  it('도구에 여전히 없으면 null 그대로지만 잰 시각은 찍는다', () => {
    const after = applyVolume([row()], keyReads([{ keyword: '지예은 남편', read: { searchVolume: null, searchVolumeLt10: false, isSearchVolumeEstimated: false } }]), at(0));
    expect(after[0].searchVolume).toBeNull();
    expect(after[0].searchVolumeLt10).toBe(false);
    expect(after[0].searchVolumeMeasuredAt).toBe(at(0));
  });

  it('추정으로 표시된 값은 싣지 않는다 — 발행기와 같은 규칙', () => {
    const after = applyVolume([row()], keyReads([{ keyword: '지예은 남편', read: { searchVolume: 500, searchVolumeLt10: false, isSearchVolumeEstimated: true } }]), at(0));
    expect(after[0].searchVolume).toBeNull();
  });

  it('숫자가 있는 행과 읽기가 없는 행은 그대로 돌려준다', () => {
    const numeric = row({ searchVolume: 320 });
    const other = row({ keyword: '다른 키워드' });
    const after = applyVolume([numeric, other], keyReads([{ keyword: '지예은 남편', read: { searchVolume: null, searchVolumeLt10: true, isSearchVolumeEstimated: false } }]), at(0));
    expect(after[0]).toBe(numeric);
    expect(after[1]).toBe(other);
  });
});

describe('applyTrend — 잰 추세를 새 행으로', () => {
  it('두 점 이상이면 반올림한 시계열과 라벨·측정 시각을 싣는다', () => {
    const after = applyTrend([row()], keyReads([{ keyword: '지예은 남편', read: { series: [0, 0, 36.6, 100], label: '🚀 떡상', recommendation: '지금 당장' } }]), at(0));
    expect(after[0].trend).toEqual({ series: [0, 0, 37, 100], label: '🚀 떡상', recommendation: '지금 당장', measuredAt: at(0) });
  });

  it('0~1점이면 행을 그대로 둔다 — 빈 그래프를 지어내지 않는다', () => {
    const before = row();
    const after = applyTrend([before], keyReads([{ keyword: '지예은 남편', read: { series: [100] } }]), at(0));
    expect(after[0]).toBe(before);
    expect(applyTrend([before], keyReads([{ keyword: '지예은 남편', read: { series: [] } }]), at(0))[0]).toBe(before);
  });

  it('빈 라벨은 싣지 않는다', () => {
    const after = applyTrend([row()], keyReads([{ keyword: '지예은 남편', read: { series: [1, 2], label: '', recommendation: '' } }]), at(0));
    expect(after[0].trend).toEqual({ series: [1, 2], measuredAt: at(0) });
  });
});
