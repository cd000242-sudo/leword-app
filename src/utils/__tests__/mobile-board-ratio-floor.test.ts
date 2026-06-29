import { __liveGoldenRadarTestInternals } from '../../mobile/live-golden-radar';

const { hasWinnableDisplayRatio } = __liveGoldenRadarTestInternals as {
  hasWinnableDisplayRatio: (item: { totalSearchVolume?: number | null; documentCount?: number | null }) => boolean;
};

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

// 문서수 ≥ 검색량(비율<1) = 사장님 원칙상 "의미없음" → 표시 금지
assert('docs >> volume rejected (여행자보험 류)', hasWinnableDisplayRatio({ totalSearchVolume: 7000, documentCount: 20000 }) === false);
assert('docs >> volume rejected (삼성에어컨 류)', hasWinnableDisplayRatio({ totalSearchVolume: 700, documentCount: 8000 }) === false);
assert('docs > volume rejected (사용처조회 류)', hasWinnableDisplayRatio({ totalSearchVolume: 200, documentCount: 700 }) === false);
assert('docs == volume rejected (ratio 1 < 1.2)', hasWinnableDisplayRatio({ totalSearchVolume: 300, documentCount: 300 }) === false);

// 문서수 < 검색량(저경쟁) = 통과
assert('winnable low-vol passes (900/120)', hasWinnableDisplayRatio({ totalSearchVolume: 900, documentCount: 120 }) === true);
assert('ratio 3 passes (1500/500)', hasWinnableDisplayRatio({ totalSearchVolume: 1500, documentCount: 500 }) === true);
assert('ratio 1.5 passes (450/300)', hasWinnableDisplayRatio({ totalSearchVolume: 450, documentCount: 300 }) === true);

// 빈값 거부
assert('zero docs rejected', hasWinnableDisplayRatio({ totalSearchVolume: 900, documentCount: 0 }) === false);
assert('zero volume rejected', hasWinnableDisplayRatio({ totalSearchVolume: 0, documentCount: 120 }) === false);

console.log('[mobile-board-ratio-floor.test] passed');
process.exit(0);
