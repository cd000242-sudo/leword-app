import { describe, expect, it } from 'vitest';
import { judgeTimingGroup } from '../preemption-timing-group';

/**
 * 시기 그룹 — 실측 산술만으로 "언제 쓸 것"을 묶는다.
 * 못 잰 것은 빈 그룹으로 남긴다 — 지어내는 순간 이 보드의 값어치가 사라진다.
 */
describe('시기 그룹 판정', () => {
    it('성수기 3개월 이내면 지금 적기', () => {
        expect(judgeTimingGroup({ trendShape: 'seasonal', monthsToPeak: 2 })).toBe('지금 적기');
    });
    it('성수기 4개월 이상이면 준비 시기', () => {
        expect(judgeTimingGroup({ trendShape: 'seasonal', monthsToPeak: 7 })).toBe('준비 시기');
    });
    it('상승세는 지금 뜨는 중', () => {
        expect(judgeTimingGroup({ trendShape: 'rising', monthsToPeak: null })).toBe('지금 뜨는 중');
    });
    it('에버그린은 연중 상시', () => {
        expect(judgeTimingGroup({ trendShape: 'evergreen' })).toBe('연중 상시');
    });
    it('못 쟀으면 빈 그룹 — 지어내지 않는다', () => {
        expect(judgeTimingGroup({ trendShape: null, monthsToPeak: null })).toBe('');
        expect(judgeTimingGroup({ trendShape: 'seasonal', monthsToPeak: null })).toBe('');
        expect(judgeTimingGroup({ trendShape: 'unknown' })).toBe('');
    });
});
