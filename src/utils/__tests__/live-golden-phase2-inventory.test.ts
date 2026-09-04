import {
  buildLiveGoldenPhase2Inventory,
  canTransitionLiveGoldenInventory,
} from '../../mobile/live-golden-inventory';
import type { MobileLiveGoldenBoardItem } from '../../mobile/contracts';

function assert(name: string, condition: unknown, detail = ''): void {
  if (!condition) {
    console.error(`[live-golden-phase2-inventory] failed: ${name}${detail ? ` - ${detail}` : ''}`);
    process.exit(1);
  }
}

const NOW = new Date('2026-07-15T06:00:00.000Z');

function item(overrides: Partial<MobileLiveGoldenBoardItem> = {}): MobileLiveGoldenBoardItem {
  return {
    id: 'row-1',
    rank: 1,
    keyword: '노트북 비교 추천',
    grade: 'SS',
    score: 81,
    pcSearchVolume: 2_000,
    mobileSearchVolume: 8_000,
    totalSearchVolume: 10_000,
    documentCount: 800,
    goldenRatio: 12.5,
    cpc: 420,
    category: 'laptop',
    source: 'live-golden-worker',
    intent: '상업 비교',
    evidence: ['SearchAd 실측', '블로그 문서수 실측'],
    isMeasured: true,
    searchVolumeSource: 'searchad',
    searchVolumeConfidence: 'high',
    searchVolumeMeasuredAt: '2026-07-15T05:00:00.000Z',
    isSearchVolumeEstimated: false,
    documentCountSource: 'naver-api',
    documentCountConfidence: 'high',
    documentCountQueryMode: 'exact-phrase',
    isDocumentCountEstimated: false,
    measurementStatus: 'measured',
    discoveredAt: '2026-07-15T04:00:00.000Z',
    updatedAt: '2026-07-15T05:00:00.000Z',
    freshness: 'live',
    isPublicPreview: false,
    publicSearchVolumeLabel: '1만',
    publicDocumentCountLabel: '800',
    publicReason: '실측 완료',
    ...overrides,
  };
}

function main(): void {
  const verified = item();
  const watch = item({
    id: 'row-watch',
    keyword: '전기요금 절약 방법',
    grade: 'A',
    score: 64,
    cpc: null,
    intent: '정보 탐색',
  });
  const surge = item({
    id: 'row-surge',
    keyword: '오늘 폭염 대비 준비물',
    grade: 'S',
    score: 74,
    lane: 'traffic-surge',
    intent: '실시간 수요',
  });
  const expired = item({
    id: 'row-expired',
    keyword: '지난주 행사 일정',
    updatedAt: '2026-07-07T05:59:59.000Z',
    searchVolumeMeasuredAt: '2026-07-07T05:59:59.000Z',
  });
  const unmeasured = item({
    id: 'row-unmeasured',
    keyword: '측정 안 된 추천 키워드',
    isMeasured: false,
    measurementStatus: 'unmeasured',
    totalSearchVolume: null,
    documentCount: null,
    goldenRatio: null,
    searchVolumeSource: undefined,
    documentCountSource: undefined,
  });

  const snapshot = buildLiveGoldenPhase2Inventory({
    verified: [verified, unmeasured],
    board: [verified, surge],
    references: [watch, expired, unmeasured],
    now: NOW,
  });

  const byId = new Map(snapshot.items.map((entry) => [entry.id, entry]));
  const verifiedVm = byId.get('row-1');
  const watchVm = byId.get('row-watch');
  const surgeVm = byId.get('row-surge');
  const expiredVm = byId.get('row-expired');
  const rejectedVm = byId.get('row-unmeasured');

  assert('inventory exposes all three active lanes',
    snapshot.counts.verified === 1
      && snapshot.counts.watch === 1
      && snapshot.counts.surge === 1);
  assert('unmeasured row can never be verified',
    snapshot.items.every((entry) => entry.state !== 'verified' || entry.measurement.complete === true)
      && rejectedVm?.state === 'rejected'
      && rejectedVm.reasonCode === 'rejected-unmeasured');
  assert('seven day inventory TTL expires stale measurements',
    expiredVm?.state === 'expired'
      && expiredVm.reasonCode === 'expired-measurement-ttl'
      && expiredVm.expiresAt === '2026-07-14T05:59:59.000Z');
  assert('surge lane has its own 48 hour TTL',
    surgeVm?.state === 'surge'
      && surgeVm.reasonCode === 'surge-recent-demand-spike'
      && surgeVm.expiresAt === '2026-07-17T05:00:00.000Z');
  assert('state transitions are explicit and deterministic',
    canTransitionLiveGoldenInventory('watch', 'verified')
      && canTransitionLiveGoldenInventory('surge', 'expired')
      && !canTransitionLiveGoldenInventory('expired', 'verified'));

  assert('purpose tags distinguish traffic, RPM, commerce, and surge',
    verifiedVm?.purposeTags.includes('naver-traffic')
      && verifiedVm.purposeTags.includes('adsense-rpm')
      && verifiedVm.purposeTags.includes('affiliate-commerce')
      && surgeVm?.purposeTags.includes('realtime-surge'));
  assert('market score and personal fit are never conflated',
    verifiedVm?.scores.market.score === 81
      && verifiedVm.scores.personalFit.score === null
      && verifiedVm.scores.personalFit.status === 'not-evaluated');
  assert('server grade is copied without client-side reinterpretation',
    verifiedVm?.display.grade === verified.grade
      && watchVm?.display.grade === watch.grade);

  /*
   * 수익 추정 단언은 뺐다(사장님 결정 2026-09-05) — 예상 클릭·예상 월수익·RPM 을
   * 계약에서 들어냈기 때문이다. 대신 **되돌아오지 못하게** 막는다: 이 ViewModel 은
   * 클라이언트가 그대로 그리는 것이라, 추정치가 한 칸이라도 들어오면 언젠가 화면에
   * 실린다.
   */
  const serialized = JSON.stringify(snapshot);
  assert('the view model carries no revenue or traffic estimate fields',
    !serialized.includes('revenueEvidence')
      && !serialized.includes('monthlyRevenueKrw')
      && !serialized.includes('expectedMonthlyClicks')
      && !serialized.includes('trafficCaptureRate'));
  assert('data freshness and confidence are first-class API fields',
    verifiedVm?.measurement.sources.searchVolume === 'naver-searchad'
      && verifiedVm.measurement.sources.documentCount === 'naver-blog-search-api'
      && verifiedVm.measurement.measuredAt === '2026-07-15T05:00:00.000Z'
      && verifiedVm.measurement.confidence === 'high');

  console.log('[live-golden-phase2-inventory] passed');
  // 다른 게이트 테스트와 같게 명시적으로 끝낸다. 불러들인 모듈이 타이머·핸들을
  // 열어 두기 때문에, 이게 없으면 통과를 찍고도 프로세스가 안 죽어 게이트가 멈춘다.
  process.exit(0);
}

main();
