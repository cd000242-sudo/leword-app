import { MobileLiveGoldenRadar } from '../../mobile/live-golden-radar';
import type { DcMeasurement, MeasureOpts } from '../measure-dc';

function assert(name: string, condition: boolean, detail = ''): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const fixedNow = new Date('2026-07-18T12:00:00.000Z');
const freshMeasuredAt = fixedNow.toISOString();
const staleEligibleMeasuredAt = new Date(fixedNow.getTime() - 20 * 60 * 1000).toISOString();
const staleIneligibleMeasuredAt = new Date(fixedNow.getTime() - 30 * 60 * 1000).toISOString();
const updatedAt = new Date(fixedNow.getTime() - 60 * 60 * 1000).toISOString();

function boardRow(id: string, category: string, documentCountMeasuredAt: string): any {
  return {
    id,
    rank: 1,
    keyword: category === 'policy'
      ? '근로장려금 신청 자격 확인 방법'
      : '드라마 출연진 공식 정보',
    grade: 'SSS',
    score: 98,
    pcSearchVolume: 500,
    mobileSearchVolume: 1_500,
    totalSearchVolume: 2_000,
    documentCount: 100,
    goldenRatio: 20,
    cpc: 120,
    category,
    source: 'mobile-live-golden-radar',
    intent: 'direct-golden-searchad-suggestions',
    evidence: [
      'searchad-pc-mobile-split-enriched',
      'direct-searchad-exact-measured',
      'naver-openapi-broad',
    ],
    isMeasured: true,
    searchVolumeSource: 'searchad',
    searchVolumeConfidence: 'high',
    searchVolumeBindingVersion: 'keyword-keyed-v2',
    searchVolumeMeasuredAt: updatedAt,
    isSearchVolumeEstimated: false,
    documentCountSource: 'naver-api',
    documentCountConfidence: 'high',
    documentCountQueryMode: 'broad',
    documentCountMeasuredAt,
    isDocumentCountEstimated: false,
    discoveredAt: updatedAt,
    updatedAt,
    freshness: 'live',
    isPublicPreview: false,
    publicSearchVolumeLabel: '1k-5k',
    publicDocumentCountLabel: '100-299',
    publicReason: '공식 실측 문서수와 검색량을 확인했습니다.',
  };
}

function canonicalMeasurement(dc = 100): DcMeasurement {
  return {
    dc,
    source: 'naver-api',
    confidence: 'high',
    isEstimated: false,
    queryMode: 'broad',
    measuredAt: freshMeasuredAt,
  };
}

async function waitUntil(predicate: () => boolean, timeoutMs = 500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('condition timed out');
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

(async () => {
  const measuredKeywords: string[] = [];
  let activeMeasurements = 0;
  let maxActiveMeasurements = 0;
  const radar = new MobileLiveGoldenRadar({
    runOnStart: false,
    now: () => new Date(fixedNow),
    getEnvConfig: () => ({ naverClientId: 'client', naverClientSecret: 'secret' }),
    measureLiveDocumentCount: async (keyword) => {
      measuredKeywords.push(keyword);
      activeMeasurements += 1;
      maxActiveMeasurements = Math.max(maxActiveMeasurements, activeMeasurements);
      await new Promise((resolve) => setTimeout(resolve, 2));
      activeMeasurements -= 1;
      return canonicalMeasurement();
    },
  });
  const internal = radar as any;
  internal.pruneBoard = () => undefined;
  internal.saveBoardToFile = () => undefined;
  for (let index = 0; index < 60; index += 1) {
    internal.board.set(
      `eligible-${index}`,
      boardRow(`eligible-${index}`, 'policy', staleEligibleMeasuredAt),
    );
  }
  for (let index = 0; index < 60; index += 1) {
    internal.board.set(
      `ineligible-${index}`,
      boardRow(`ineligible-${index}`, 'celebrity', staleIneligibleMeasuredAt),
    );
  }

  for (let tick = 0; tick < 12; tick += 1) {
    const result = await internal.refreshCanonicalBoardDocumentCounts(5, {
      includeFreshCanonical: true,
    });
    assert(`maintenance tick ${tick + 1} refreshes its full five-row budget`,
      result.attemptedCount === 5 && result.updatedCount === 5,
      JSON.stringify(result));
  }

  const eligibleRows = [...internal.board.values()]
    .filter((item: any) => String(item.id).startsWith('eligible-')) as any[];
  const ineligibleRows = [...internal.board.values()]
    .filter((item: any) => String(item.id).startsWith('ineligible-')) as any[];
  assert('twelve one-minute ticks keep all 60 Phase 1C-priority rows fresh',
    eligibleRows.length === 60
      && eligibleRows.every((item) => item.documentCountMeasuredAt === freshMeasuredAt),
    JSON.stringify({
      eligibleFresh: eligibleRows.filter((item) => item.documentCountMeasuredAt === freshMeasuredAt).length,
      ineligibleFresh: ineligibleRows.filter((item) => item.documentCountMeasuredAt === freshMeasuredAt).length,
      firstKeywords: measuredKeywords.slice(0, 12),
    }));
  assert('non-core rows cannot consume the Phase 1C 60-row maintenance budget',
    ineligibleRows.length === 60
      && ineligibleRows.every((item) => item.documentCountMeasuredAt === staleIneligibleMeasuredAt),
    measuredKeywords.slice(0, 12).join('|'));
  assert('document-only maintenance preserves discovery/activity updatedAt',
    eligibleRows.every((item) => item.updatedAt === updatedAt));
  assert('maintenance measures serially so queued rows retain a full fetch deadline',
    maxActiveMeasurements === 1, String(maxActiveMeasurements));

  let deadlineSignalAborted = false;
  const deadlineRadar = new MobileLiveGoldenRadar({
    runOnStart: false,
    measureLiveDocumentCount: (async (_keyword: string, options: MeasureOpts = {}) => (
      new Promise<DcMeasurement>((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
          deadlineSignalAborted = true;
          reject(new Error('aborted'));
        }, { once: true });
      })
    )) as any,
  });
  const deadlineResult = await (deadlineRadar as any).measureLiveDocumentCountWithDeadline(
    '근로장려금 신청 자격 확인 방법',
    { queryMode: 'broad' },
    20,
  );
  assert('deadline aborts the underlying document lookup instead of abandoning it',
    deadlineResult === null && deadlineSignalAborted);

  let releaseMaintenance: (() => void) | null = null;
  let overlapActive = 0;
  let overlapMaxActive = 0;
  let gateCalls = 0;
  const overlapRadar = new MobileLiveGoldenRadar({
    runOnStart: false,
    now: () => new Date(fixedNow),
    getEnvConfig: () => ({ naverClientId: 'client', naverClientSecret: 'secret' }),
    shouldRun: () => {
      gateCalls += 1;
      return { ok: false, message: 'test gate' };
    },
    setIntervalFn: () => ({ fake: true }),
    clearIntervalFn: () => undefined,
    measureLiveDocumentCount: (async (_keyword: string, options: MeasureOpts = {}) => {
      overlapActive += 1;
      overlapMaxActive = Math.max(overlapMaxActive, overlapActive);
      return await new Promise<DcMeasurement>((resolve, reject) => {
        const finish = () => {
          overlapActive -= 1;
          resolve(canonicalMeasurement());
        };
        releaseMaintenance = finish;
        options.signal?.addEventListener('abort', () => {
          overlapActive -= 1;
          reject(new Error('aborted'));
        }, { once: true });
      });
    }) as any,
  });
  const overlapInternal = overlapRadar as any;
  overlapInternal.pruneBoard = () => undefined;
  overlapInternal.saveBoardToFile = () => undefined;
  overlapInternal.board.set('eligible-overlap', boardRow(
    'eligible-overlap',
    'policy',
    staleEligibleMeasuredAt,
  ));
  overlapRadar.start();
  await waitUntil(() => releaseMaintenance !== null);
  const runPromise = overlapRadar.runOnce();
  await Promise.resolve();
  assert('main run waits before evaluating its gate while maintenance owns the document mutex',
    gateCalls === 0 && overlapActive === 1);
  const release = releaseMaintenance as unknown as () => void;
  release();
  await runPromise;
  overlapRadar.stop();
  assert('main and maintenance document work never overlap',
    overlapMaxActive === 1 && gateCalls === 1,
    `${overlapMaxActive}:${gateCalls}`);

  console.log('[live-golden-document-maintenance.test] passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
