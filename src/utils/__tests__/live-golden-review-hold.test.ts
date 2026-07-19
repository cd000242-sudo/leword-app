import { LIVE_GOLDEN_CORE_CATEGORY_POLICIES } from '../../mobile/live-golden-category-policy';
import type { MobileLiveGoldenBoardItem } from '../../mobile/contracts';
import { __liveGoldenRadarTestInternals } from '../../mobile/live-golden-radar';
import { freezeLiveGoldenReviewCohort } from '../../mobile/live-golden-review-cohort';
import { naverBlogDocumentCountQueryKey } from '../naver-blog-api';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const nowMs = Date.parse('2026-07-18T00:00:00.000Z');
const stamp = new Date(nowMs - 60_000).toISOString();
const rows: MobileLiveGoldenBoardItem[] = LIVE_GOLDEN_CORE_CATEGORY_POLICIES.flatMap(
  (policy, policyIndex) => Array.from({ length: 5 }, (_, index) => ({
    id: `${policy.key}-${index}`,
    rank: policyIndex * 5 + index + 1,
    keyword: `${policy.label} 실제 검색 의도 ${index + 1}`,
    category: policy.discoveryIds[index % policy.discoveryIds.length],
    intent: index % 2 === 0 ? 'Informational' : 'Transactional',
    grade: 'S' as const,
    score: 80,
    pcSearchVolume: 200,
    mobileSearchVolume: 800,
    totalSearchVolume: 1000,
    documentCount: 200,
    goldenRatio: 5,
    cpc: 500,
    source: 'searchad-measured',
    evidence: ['real-demand-extension', 'autocomplete-exact-measured'],
    isMeasured: true,
    searchVolumeSource: 'searchad' as const,
    searchVolumeConfidence: 'high' as const,
    searchVolumeBindingVersion: 'keyword-keyed-v2',
    searchVolumeMeasuredAt: stamp,
    isSearchVolumeEstimated: false,
    documentCountSource: 'naver-api' as const,
    documentCountConfidence: 'high' as const,
    documentCountQueryMode: 'broad' as const,
    documentCountQueryKey: naverBlogDocumentCountQueryKey(`${policy.label} 실제 검색 의도 ${index + 1}`),
    documentCountMeasuredAt: stamp,
    isDocumentCountEstimated: false,
    discoveredAt: stamp,
    updatedAt: stamp,
    freshness: 'live' as const,
    isPublicPreview: false,
    publicSearchVolumeLabel: '1k',
    publicDocumentCountLabel: '200',
    publicReason: 'fixture',
  })),
);
const frozen = freezeLiveGoldenReviewCohort(rows, { nowMs });
assert('fixture freezes a passing 60-row cohort', !!frozen.cohort, JSON.stringify(frozen.supplyReport));

const refreshed = rows.map((row, index) => index === 0 ? {
  ...row,
  id: 'rekeyed-after-measurement-refresh',
  totalSearchVolume: 1100,
  mobileSearchVolume: 900,
} : row);
const pending: MobileLiveGoldenBoardItem = {
  ...rows[0],
  id: 'new-pending-candidate',
  keyword: '새로 발견된 실제 검색 의도',
  documentCountQueryKey: naverBlogDocumentCountQueryKey('새로 발견된 실제 검색 의도'),
};
const applyHold = (__liveGoldenRadarTestInternals as any).applyVerifiedSupplyReviewHold;
assert('radar exposes its persisted review-hold binding', typeof applyHold === 'function');
const held = applyHold([...refreshed, pending], frozen.cohort, nowMs + 60_000);
assert('review hold keeps the exact blind cohort while isolating newly discovered candidates',
  held?.reviewRows?.length === 60
    && held.reviewRows.some((row: MobileLiveGoldenBoardItem) => row.id === 'rekeyed-after-measurement-refresh')
    && !held.reviewRows.some((row: MobileLiveGoldenBoardItem) => row.id === 'new-pending-candidate')
    && held.pendingRows?.length === 1
    && held.pendingRows[0].id === 'new-pending-candidate',
  JSON.stringify(held));
assert('invalid persisted review state fails closed instead of changing the verified cohort',
  applyHold(rows, { ...frozen.cohort, boardFingerprint: 'tampered' }, nowMs) === null);

const publicIntent = (__liveGoldenRadarTestInternals as any).publicLiveGoldenIntent;
const rawInternalIntentRows = rows.map((row, index) => index === 0 ? {
  ...row,
  intent: 'direct-golden-searchad-suggestions',
} : row);
const normalizedIntentRows = rawInternalIntentRows.map((row) => ({
  ...row,
  intent: publicIntent(row.keyword, row.intent),
}));
const normalizedIntentFreeze = freezeLiveGoldenReviewCohort(normalizedIntentRows, { nowMs });
const normalizedIntentHold = applyHold(
  rawInternalIntentRows,
  normalizedIntentFreeze.cohort,
  nowMs + 60_000,
);
assert('review binding normalizes internal intents before hashing so snapshot presentation cannot churn identity',
  typeof publicIntent === 'function'
    && normalizedIntentFreeze.cohort?.members.length === 60
    && normalizedIntentHold?.reviewRows.length === 60
    && normalizedIntentHold.missingSemanticHashes.length === 0,
  JSON.stringify(normalizedIntentHold));

console.log('[live-golden-review-hold.test] passed');
process.exit(0);
