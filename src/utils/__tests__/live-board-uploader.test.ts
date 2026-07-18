/**
 * live-board-uploader 회귀 — 데스크톱→서버 LIVE 보드 push 의 실측 provenance 게이트.
 *
 * 고정하는 계약:
 * 1. env(LEWORD_LIVE_GOLDEN_INGEST_URL/TOKEN) 미설정이면 완전 무동작(null) — 일반 사용자 배포판 안전.
 * 2. SearchAd 분리 검색량 + 실측 문서수가 있는 행만 업로드 행으로 변환(추정 경로 차단).
 * 3. C2/C4 부가필드는 신뢰 플래그 참일 때만 화이트리스트 동봉, 추정치성 필드는 전송 안 함.
 */

import {
  liveBoardSnapshotTarget,
  liveBoardUploadTarget,
  uploadGoldenBoardCandidates,
  uploadRowFromDiscoveryResult,
} from '../live-board-uploader';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

async function run(): Promise<void> {
  const savedUrl = process.env['LEWORD_LIVE_GOLDEN_INGEST_URL'];
  const savedToken = process.env['LEWORD_LIVE_GOLDEN_INGEST_TOKEN'];
  delete process.env['LEWORD_LIVE_GOLDEN_INGEST_URL'];
  delete process.env['LEWORD_LIVE_GOLDEN_INGEST_TOKEN'];
  try {
    assert('target is null without env', liveBoardUploadTarget() === null);
    const unconfigured = await uploadGoldenBoardCandidates([{ keyword: 'x' }]);
    assert('upload is a no-op without env', unconfigured === null);

    process.env['LEWORD_LIVE_GOLDEN_INGEST_URL'] = 'http://127.0.0.1:9/v1/live-golden/ingest';
    process.env['LEWORD_LIVE_GOLDEN_INGEST_TOKEN'] = 'test-token';
    const target = liveBoardUploadTarget();
    assert('target resolves with env', !!target && target.token === 'test-token');
    const snapshotTarget = liveBoardSnapshotTarget();
    assert('snapshot target reuses the operator token without a run route',
      snapshotTarget?.url === 'http://127.0.0.1:9/v1/live-golden/snapshot'
        && snapshotTarget.token === 'test-token',
      JSON.stringify(snapshotTarget));

    const canonicalDocumentMeasurement = {
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      documentCountQueryMode: 'broad',
      documentCountMeasuredAt: '2026-07-15T01:02:04.000Z',
      isDocumentCountEstimated: false,
    } as const;

    const measured = uploadRowFromDiscoveryResult({
      keyword: '청년 전세자금 대출 조건',
      grade: 'SSS',
      score: 88,
      searchVolume: 2400,
      pcSearchVolume: 500,
      mobileSearchVolume: 1900,
      searchVolumeBindingVersion: 'keyword-keyed-v2',
      searchVolumeMeasuredAt: '2026-07-15T01:02:03.000Z',
      documentCount: 800,
      ...canonicalDocumentMeasurement,
      goldenRatio: 3,
      cpc: 120,
      serpMeasured: true,
      winnable: true,
      vacancyReliable: true,
      vacancySlots: 3,
      vacancyAction: '지금 작성',
      briefMeasured: true,
      briefRecommendedWords: 1700,
      briefMustInclude: ['조건', '한도'],
      estimatedMonthlyRevenue: 99999,
      opportunityScore: 77,
    });
    assert('measured row converts with provenance assertion',
      !!measured
        && measured['isSearchVolumeEstimated'] === false
        && measured['isDocumentCountEstimated'] === false
        && measured['searchVolumeSource'] === 'searchad'
        && measured['searchVolumeBindingVersion'] === 'keyword-keyed-v2'
        && measured['searchVolumeMeasuredAt'] === '2026-07-15T01:02:03.000Z'
        && measured['documentCountSource'] === 'naver-api'
        && measured['documentCountConfidence'] === 'high'
        && measured['documentCountQueryMode'] === 'broad'
        && measured['documentCountMeasuredAt'] === '2026-07-15T01:02:04.000Z'
        && measured['totalSearchVolume'] === 2400,
      JSON.stringify(measured));
    assert('measured extras ride the whitelist',
      !!measured
        && measured['serpMeasured'] === true
        && measured['winnable'] === true
        && measured['vacancySlots'] === 3
        && measured['vacancyAction'] === '지금 작성'
        && measured['briefRecommendedWords'] === 1700
        && Array.isArray(measured['briefMustInclude']),
      JSON.stringify(measured));
    assert('estimate-like fields are not forwarded',
      !!measured && !('estimatedMonthlyRevenue' in measured) && !('opportunityScore' in measured),
      JSON.stringify(measured));

    const splitless = uploadRowFromDiscoveryResult({
      keyword: '가습기 추천',
      searchVolume: 5000,
      documentCount: 900,
    });
    assert('rows without SearchAd split are rejected (no provenance)', splitless === null);

    const docless = uploadRowFromDiscoveryResult({
      keyword: '보일러 청소 비용',
      searchVolume: 1200,
      pcSearchVolume: 300,
      mobileSearchVolume: 900,
      documentCount: 0,
    });
    assert('rows without measured documents are rejected', docless === null);

    const provenanceFreeDocuments = uploadRowFromDiscoveryResult({
      keyword: '숫자만 있는 문서수',
      searchVolume: 1200,
      pcSearchVolume: 300,
      mobileSearchVolume: 900,
      searchVolumeBindingVersion: 'keyword-keyed-v2',
      searchVolumeMeasuredAt: '2026-07-15T01:02:03.000Z',
      documentCount: 300,
    });
    assert('a numeric document count cannot be relabeled as trusted OpenAPI provenance', provenanceFreeDocuments === null);

    const nonCanonicalDocuments = uploadRowFromDiscoveryResult({
      keyword: '비정규 문서수 출처',
      searchVolume: 1200,
      pcSearchVolume: 300,
      mobileSearchVolume: 900,
      searchVolumeBindingVersion: 'keyword-keyed-v2',
      searchVolumeMeasuredAt: '2026-07-15T01:02:03.000Z',
      documentCount: 300,
      documentCountSource: 'scrape',
      documentCountConfidence: 'high',
      documentCountQueryMode: 'exact-phrase',
      documentCountMeasuredAt: '2026-07-15T01:02:04.000Z',
      isDocumentCountEstimated: false,
    });
    assert('verified ingest rejects non-canonical document provenance instead of laundering it', nonCanonicalDocuments === null);

    const unboundSplit = uploadRowFromDiscoveryResult({
      keyword: 'unbound searchad split',
      searchVolume: 1200,
      pcSearchVolume: 300,
      mobileSearchVolume: 900,
      documentCount: 300,
    });
    assert('unversioned split cannot be laundered into trusted SearchAd provenance', unboundSplit === null);

    const invalidMeasuredAt = uploadRowFromDiscoveryResult({
      keyword: 'invalid measured time',
      searchVolume: 1200,
      pcSearchVolume: 300,
      mobileSearchVolume: 900,
      searchVolumeBindingVersion: 'keyword-keyed-v2',
      searchVolumeMeasuredAt: 'not-a-date',
      documentCount: 300,
    });
    assert('current marker without a valid measurement time is rejected', invalidMeasuredAt === null);

    const mismatchedTotal = uploadRowFromDiscoveryResult({
      keyword: 'mismatched split total',
      searchVolume: 999,
      pcSearchVolume: 300,
      mobileSearchVolume: 900,
      searchVolumeBindingVersion: 'keyword-keyed-v2',
      searchVolumeMeasuredAt: '2026-07-15T01:02:03.000Z',
      documentCount: 300,
    });
    assert('binding marker cannot bless a total that differs from its split', mismatchedTotal === null);

    const oneSidedNullSplit = uploadRowFromDiscoveryResult({
      keyword: 'one-sided null split',
      searchVolume: 900,
      pcSearchVolume: null,
      mobileSearchVolume: 900,
      searchVolumeBindingVersion: 'keyword-keyed-v2',
      searchVolumeMeasuredAt: '2026-07-15T01:02:03.000Z',
      documentCount: 300,
    });
    assert('one-sided null split cannot be coerced to zero during upload', oneSidedNullSplit === null);

    const objectCoercionSplit = uploadRowFromDiscoveryResult({
      keyword: 'object coercion split',
      searchVolume: 900,
      pcSearchVolume: [300],
      mobileSearchVolume: 600,
      searchVolumeBindingVersion: 'keyword-keyed-v2',
      searchVolumeMeasuredAt: '2026-07-15T01:02:03.000Z',
      documentCount: 300,
    });
    assert('array/object values cannot cross the numeric upload boundary', objectCoercionSplit === null);

    const unreliableExtras = uploadRowFromDiscoveryResult({
      keyword: '난방비 지원금 신청 방법',
      searchVolume: 1500,
      pcSearchVolume: 400,
      mobileSearchVolume: 1100,
      searchVolumeBindingVersion: 'keyword-keyed-v2',
      searchVolumeMeasuredAt: '2026-07-15T01:02:03.000Z',
      documentCount: 500,
      ...canonicalDocumentMeasurement,
      winnable: true,
      vacancySlots: 4,
      briefRecommendedWords: 2000,
    });
    assert('extras without trust flags are dropped',
      !!unreliableExtras
        && !('winnable' in unreliableExtras)
        && !('vacancySlots' in unreliableExtras)
        && !('briefRecommendedWords' in unreliableExtras),
      JSON.stringify(unreliableExtras));

    console.log('[live-board-uploader.test] passed: 14 / failed: 0');
  } finally {
    if (savedUrl === undefined) delete process.env['LEWORD_LIVE_GOLDEN_INGEST_URL'];
    else process.env['LEWORD_LIVE_GOLDEN_INGEST_URL'] = savedUrl;
    if (savedToken === undefined) delete process.env['LEWORD_LIVE_GOLDEN_INGEST_TOKEN'];
    else process.env['LEWORD_LIVE_GOLDEN_INGEST_TOKEN'] = savedToken;
  }
}

run().catch((err) => {
  console.error('[live-board-uploader.test] FAILED:', (err as Error).message);
  process.exit(1);
});
