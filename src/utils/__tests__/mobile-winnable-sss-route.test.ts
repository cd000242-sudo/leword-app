import { __liveGoldenRadarTestInternals } from '../../mobile/live-golden-radar';
import {
  isWinnableSssMetrics,
  isClassicSssMetrics,
  isGoldenSssMetrics,
  isStrictGoldenDiscoverySss,
} from '../golden-discovery-floor';

const { liveGradeFromMetrics } = __liveGoldenRadarTestInternals as {
  liveGradeFromMetrics: (score: number, volume: number, docs: number, ratio: number, keyword?: string) => string;
};

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

// === 메트릭 라우트 (순수 수치 — 키워드 무관) ===
// winnable: 저볼륨이라도 문서수 ≪ 검색량(비율 ≥ 3) 인 진짜 저경쟁만 인정
assert('winnable: low-vol high-ratio passes', isWinnableSssMetrics(800, 200, 4) === true);
assert('winnable: ratio < 3 fails (docs not far below volume)', isWinnableSssMetrics(800, 400, 2) === false);
assert('winnable: docs over absolute ceiling fails', isWinnableSssMetrics(1400, 600, 2.3) === false);
assert('winnable: volume over 1500 not winnable-route', isWinnableSssMetrics(2000, 300, 6.7) === false);
assert('winnable: docs >= volume is meaningless (ratio 1)', isWinnableSssMetrics(900, 900, 1) === false);

// classic 고볼륨 라우트는 그대로
assert('classic high-volume route still passes', isClassicSssMetrics(1200, 200, 6) === true);
assert('golden = classic OR winnable', isGoldenSssMetrics(1200, 200, 6) === true && isGoldenSssMetrics(800, 200, 4) === true);

// === 통합: 등급 라우트 (의도 풍부한 키워드로 capSssForNeedIntent 영향 배제) ===
assert('liveGradeFromMetrics promotes low-vol winnable to SSS',
  liveGradeFromMetrics(82, 800, 200, 4, '주휴수당 신청방법') === 'SSS',
  `grade=${liveGradeFromMetrics(82, 800, 200, 4, '주휴수당 신청방법')}`);
assert('liveGradeFromMetrics keeps high-comp low-vol OUT of SSS',
  liveGradeFromMetrics(82, 800, 600, 1.3, '주휴수당 신청방법') !== 'SSS',
  `grade=${liveGradeFromMetrics(82, 800, 600, 1.3, '주휴수당 신청방법')}`);
assert('liveGradeFromMetrics classic SSS unchanged',
  liveGradeFromMetrics(88, 1200, 300, 5, '청년 주거급여 신청자격') === 'SSS');

// === 통합: 디스커버리 floor 도 동일 정의 공유 (SSoT) ===
assert('floor module accepts winnable SSS row',
  isStrictGoldenDiscoverySss({
    keyword: '주휴수당 신청방법',
    grade: 'SSS',
    score: 82,
    searchVolume: 800,
    documentCount: 200,
    goldenRatio: 4,
  }) === true);
assert('floor module rejects high-comp low-vol row',
  isStrictGoldenDiscoverySss({
    keyword: '주휴수당 신청방법',
    grade: 'SSS',
    score: 82,
    searchVolume: 800,
    documentCount: 700,
    goldenRatio: 1.1,
  }) === false);

console.log('[mobile-winnable-sss-route.test] passed');
process.exit(0);
