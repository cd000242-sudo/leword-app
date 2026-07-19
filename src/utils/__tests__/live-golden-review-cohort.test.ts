import { LIVE_GOLDEN_CORE_CATEGORY_POLICIES } from '../../mobile/live-golden-category-policy';
import type { MobileLiveGoldenBoardItem } from '../../mobile/contracts';
import {
  bindLiveGoldenReviewRows,
  freezeLiveGoldenReviewCohort,
  isExactLiveGoldenReviewBinding,
  isPersistedLiveGoldenReviewCohort,
  issueLiveGoldenPhase2EntryCertificate,
  liveGoldenReviewDecisionDigest,
  parseLiveGoldenPhase2EntryCertificate,
  parseLiveGoldenReviewCohort,
  reconcileLiveGoldenReviewCohort,
  submitLiveGoldenBlindReviewDecision,
  summarizeLiveGoldenBlindReviews,
  type LiveGoldenBlindReviewDecision,
  type PersistedLiveGoldenReviewCohort,
} from '../../mobile/live-golden-review-cohort';
import { naverBlogDocumentCountQueryKey } from '../naver-blog-api';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

function measuredItem(keyword: string, category: string, index: number): MobileLiveGoldenBoardItem {
  return {
    id: `${category}-${index}`,
    rank: index + 1,
    keyword,
    category,
    intent: `intent-${index % 3}`,
    grade: 'S',
    score: 80,
    pcSearchVolume: 200,
    mobileSearchVolume: 800,
    totalSearchVolume: 1000,
    documentCount: 200,
    goldenRatio: 5,
    cpc: 500,
    source: 'searchad-measured',
    evidence: ['searchad', 'naver-api'],
    isMeasured: true,
    searchVolumeSource: 'searchad',
    searchVolumeConfidence: 'high',
    searchVolumeBindingVersion: 'keyword-keyed-v2',
    searchVolumeMeasuredAt: '2026-07-11T09:00:00.000Z',
    isSearchVolumeEstimated: false,
    documentCountSource: 'naver-api',
    documentCountConfidence: 'high',
    documentCountQueryMode: 'broad',
    documentCountQueryKey: naverBlogDocumentCountQueryKey(keyword),
    documentCountMeasuredAt: '2026-07-11T09:55:00.000Z',
    isDocumentCountEstimated: false,
    discoveredAt: '2026-07-11T08:00:00.000Z',
    updatedAt: '2026-07-11T09:55:00.000Z',
    freshness: 'live',
    isPublicPreview: false,
    publicSearchVolumeLabel: '',
    publicDocumentCountLabel: '',
    publicReason: '',
  };
}

const balancedItems = LIVE_GOLDEN_CORE_CATEGORY_POLICIES.flatMap((policy, policyIndex) => (
  Array.from({ length: 5 }, (_, index) => measuredItem(
    `review-keyword-${policy.key}-${index + 1}`,
    policy.discoveryIds[index % policy.discoveryIds.length],
    policyIndex * 5 + index,
  ))
));
const nowMs = Date.parse('2026-07-11T10:00:00.000Z');

const insufficient = freezeLiveGoldenReviewCohort(balancedItems.slice(0, 5), { nowMs });
assert('a failed automated supply gate stays in building-supply without a cohort',
  insufficient.state === 'building-supply'
    && insufficient.cohort === undefined
    && insufficient.supplyReport.automatedSupplyGate === 'fail');

const frozen = freezeLiveGoldenReviewCohort(balancedItems, { nowMs });
assert('an automated supply pass freezes every trusted Verified semantic member',
  frozen.state === 'review-target-frozen'
    && frozen.supplyReport.automatedSupplyGate === 'pass'
    && frozen.cohort?.state === 'review-target-frozen'
    && frozen.cohort.members.length === 60
    && frozen.cohort.members.every((member) => /^[a-f0-9]{64}$/.test(member.semanticHash)),
  JSON.stringify(frozen));

const duplicateSemanticInput = [
  ...balancedItems,
  { ...balancedItems[0], id: 'duplicate-storage-id-must-not-double-review' },
];
const duplicateFreeze = freezeLiveGoldenReviewCohort(duplicateSemanticInput, { nowMs });
assert('duplicate semantic hashes fail closed before a blind-review cohort can freeze',
  duplicateFreeze.state === 'building-supply'
    && duplicateFreeze.cohort === undefined
    && duplicateFreeze.supplyReport.automatedSupplyGate === 'fail'
    && duplicateFreeze.supplyReport.failureReasons.includes('duplicate-semantic-hash'),
  JSON.stringify(duplicateFreeze));

const originalCohort = frozen.cohort!;
const balanced64Items = [
  ...balancedItems,
  ...LIVE_GOLDEN_CORE_CATEGORY_POLICIES.slice(0, 4).map((policy, index) => measuredItem(
    `review-keyword-64-boundary-${index + 1}`,
    policy.discoveryIds[0],
    100 + index,
  )),
];
const frozen64 = freezeLiveGoldenReviewCohort(balanced64Items, { nowMs }).cohort!;
const bound63 = bindLiveGoldenReviewRows(frozen64, balanced64Items.slice(0, 63), { nowMs });
assert('the 64-to-63 current cohort boundary fails exact binding',
  frozen64.members.length === 64
    && bound63.reviewRows.length === 63
    && !isExactLiveGoldenReviewBinding(bound63));
const originalFingerprint = originalCohort.boardFingerprint;
const originalMemberHashes = originalCohort.members.map((member) => member.semanticHash).join(',');
const refreshedMeasurements = balancedItems.map((item, index) => index === 0 ? {
  ...item,
  id: 'measurement-refresh-may-rekey-storage-id',
  pcSearchVolume: 250,
  mobileSearchVolume: 850,
  totalSearchVolume: 1100,
  documentCount: 210,
  goldenRatio: 1100 / 210,
  searchVolumeMeasuredAt: '2026-07-11T09:30:00.000Z',
  documentCountMeasuredAt: '2026-07-11T09:59:00.000Z',
  updatedAt: '2026-07-11T09:59:00.000Z',
} : item);
const measurementRefresh = reconcileLiveGoldenReviewCohort(
  originalCohort,
  refreshedMeasurements,
  { nowMs: nowMs + 60_000 },
);
assert('measurement refreshes preserve the frozen semantic fingerprint and membership',
  measurementRefresh.cohortId === originalCohort.cohortId
    && measurementRefresh.boardFingerprint === originalFingerprint
    && measurementRefresh.members.map((member) => member.semanticHash).join(',') === originalMemberHashes
    && measurementRefresh.updatedAt === originalCohort.updatedAt
    && measurementRefresh.pendingCandidates.length === 0
    && measurementRefresh.missingSemanticHashes.length === 0,
  JSON.stringify(measurementRefresh));

const changedSemantics = balancedItems.map((item, index) => index === 0 ? {
  ...item,
  intent: 'changed-intent-must-not-replace-frozen-member',
} : item);
const semanticDrift = reconcileLiveGoldenReviewCohort(originalCohort, changedSemantics, { nowMs });
assert('semantic member changes are isolated as pending candidates instead of replacing the cohort',
  semanticDrift.cohortId === originalCohort.cohortId
    && semanticDrift.boardFingerprint === originalFingerprint
    && semanticDrift.members.map((member) => member.semanticHash).join(',') === originalMemberHashes
    && semanticDrift.pendingCandidates.length === 1
    && semanticDrift.pendingCandidates[0].intent === 'changed-intent-must-not-replace-frozen-member'
    && semanticDrift.missingSemanticHashes.includes(originalCohort.members.find(
      (member) => member.keyword === balancedItems[0].keyword,
    )!.semanticHash),
  JSON.stringify(semanticDrift));

const emptySummary = summarizeLiveGoldenBlindReviews(originalCohort);
assert('automated supply alone never becomes eligible or produces human precision',
  emptySummary.reviewed === 0
    && emptySummary.complete === false
    && emptySummary.passes === false
    && originalCohort.state === 'review-target-frozen');
let certificateBlockedWithoutReview = false;
try {
  issueLiveGoldenPhase2EntryCertificate(originalCohort, {
    issuedAt: '2026-07-11T11:00:00.000Z',
    issuedBy: 'admin-reviewer',
  });
} catch {
  certificateBlockedWithoutReview = true;
}
assert('a Phase 2 certificate cannot be issued without human review', certificateBlockedWithoutReview);

function decisionFor(
  cohort: PersistedLiveGoldenReviewCohort,
  index: number,
  overrides: Partial<LiveGoldenBlindReviewDecision> = {},
): LiveGoldenBlindReviewDecision {
  return {
    schemaVersion: 'live-golden-blind-review-decision-v2',
    cohortId: cohort.cohortId,
    semanticHash: cohort.members[index].semanticHash,
    reviewer: 'admin-reviewer',
    reviewedAt: '2026-07-11T10:30:00.000Z',
    precisionPassed: true,
    hiddenKnown: true,
    malformed: false,
    semanticDuplicate: false,
    platformResidue: false,
    sentenceResidue: false,
    ...overrides,
  };
}

const oldSchemaCohort = {
  ...JSON.parse(JSON.stringify(originalCohort)),
  schemaVersion: 'live-golden-review-cohort-v1',
};
assert('a pre-hiddenKnown v1 cohort artifact fails closed after the review contract upgrade',
  parseLiveGoldenReviewCohort(oldSchemaCohort) === undefined);

const missingHiddenKnown = submitLiveGoldenBlindReviewDecision(
  originalCohort,
  {
    ...decisionFor(originalCohort, 0),
    hiddenKnown: undefined,
  },
);
assert('a blind decision without an explicit hiddenKnown judgment is rejected',
  missingHiddenKnown.accepted === false
    && missingHiddenKnown.reason === 'invalid-decision-flags');

const firstReview = submitLiveGoldenBlindReviewDecision(
  originalCohort,
  decisionFor(originalCohort, 0),
);
assert('a valid partial blind review enters pending-human-review',
  firstReview.accepted === true
    && firstReview.cohort.state === 'pending-human-review'
    && summarizeLiveGoldenBlindReviews(firstReview.cohort).reviewed === 1);
const hiddenKnownTampered = {
  ...firstReview.cohort,
  decisions: {
    ...firstReview.cohort.decisions,
    [firstReview.cohort.members[0].semanticHash]: {
      ...firstReview.cohort.decisions[firstReview.cohort.members[0].semanticHash],
      hiddenKnown: false,
    },
  },
};
assert('the decision digest cryptographically binds the explicit hiddenKnown judgment',
  liveGoldenReviewDecisionDigest(firstReview.cohort)
    !== liveGoldenReviewDecisionDigest(hiddenKnownTampered));

const staleCandidateReview = submitLiveGoldenBlindReviewDecision(
  originalCohort,
  {
    ...decisionFor(originalCohort, 0),
    semanticHash: semanticDrift.pendingCandidates[0].semanticHash,
  },
);
assert('a pending candidate cannot be smuggled into the frozen human-review cohort',
  staleCandidateReview.accepted === false
    && staleCandidateReview.reason === 'semantic-hash-not-in-cohort');

function reviewAll(
  source: PersistedLiveGoldenReviewCohort,
  precisionPasses: number,
  defectAt?: number,
  defect: 'malformed' | 'semanticDuplicate' | 'platformResidue' | 'sentenceResidue' = 'malformed',
): PersistedLiveGoldenReviewCohort {
  let cohort = source;
  for (let index = 0; index < cohort.members.length; index += 1) {
    const result = submitLiveGoldenBlindReviewDecision(cohort, decisionFor(cohort, index, {
      precisionPassed: index < precisionPasses,
      ...(index === defectAt ? { [defect]: true } : {}),
    }));
    if (!result.accepted) {
      throw new Error(`review submission rejected: ${'reason' in result ? result.reason : 'unknown'}`);
    }
    cohort = result.cohort;
  }
  return cohort;
}

const exactNinetyPercent = reviewAll(originalCohort, 54);
const passingSummary = summarizeLiveGoldenBlindReviews(exactNinetyPercent);
assert('the server-derived aggregate allows exactly 90 percent only after every row is reviewed',
  exactNinetyPercent.state === 'eligible'
    && passingSummary.reviewed === 60
    && passingSummary.precisionPassed === 54
    && passingSummary.precision === 0.9
    && passingSummary.complete === true
    && passingSummary.passes === true,
  JSON.stringify(passingSummary));

const belowNinetyPercent = reviewAll(originalCohort, 53);
assert('a complete review below 90 percent enters human-review-failed',
  belowNinetyPercent.state === 'human-review-failed'
    && summarizeLiveGoldenBlindReviews(belowNinetyPercent).passes === false);
const failedCorrection = submitLiveGoldenBlindReviewDecision(
  belowNinetyPercent,
  decisionFor(belowNinetyPercent, 53, { precisionPassed: true }),
);
assert('a failed cohort is immutable under the same semantic fingerprint',
  failedCorrection.accepted === false
    && 'reason' in failedCorrection
    && failedCorrection.reason === 'cohort-review-closed'
    && failedCorrection.cohort.decisions[
      belowNinetyPercent.members[53].semanticHash
    ].precisionPassed === false);

const malformedFound = reviewAll(originalCohort, 60, 7);
const malformedSummary = summarizeLiveGoldenBlindReviews(malformedFound);
assert('any malformed, duplicate, platform, or sentence defect fails closed',
  malformedFound.state === 'human-review-failed'
    && malformedSummary.malformedCount === 1
    && malformedSummary.passes === false
    && summarizeLiveGoldenBlindReviews(
      reviewAll(originalCohort, 60, 7, 'semanticDuplicate'),
    ).semanticDuplicateCount === 1
    && summarizeLiveGoldenBlindReviews(
      reviewAll(originalCohort, 60, 7, 'platformResidue'),
    ).platformResidueCount === 1
    && summarizeLiveGoldenBlindReviews(
      reviewAll(originalCohort, 60, 7, 'sentenceResidue'),
    ).sentenceResidueCount === 1);

let oneObviousKeyword = originalCohort;
for (let index = 0; index < oneObviousKeyword.members.length; index += 1) {
  const result = submitLiveGoldenBlindReviewDecision(
    oneObviousKeyword,
    decisionFor(oneObviousKeyword, index, { hiddenKnown: index !== 7 }),
  );
  if (!result.accepted) throw new Error(`obvious review submission rejected at ${index}`);
  oneObviousKeyword = result.cohort;
}
const obviousSummary = summarizeLiveGoldenBlindReviews(oneObviousKeyword);
assert('one human-confirmed obvious keyword fails the cohort even at 100 percent natural intent precision',
  oneObviousKeyword.state === 'human-review-failed'
    && obviousSummary.hiddenKnownCount === 59
    && obviousSummary.obviousCount === 1
    && obviousSummary.passes === false,
  JSON.stringify(obviousSummary));

const certificate = issueLiveGoldenPhase2EntryCertificate(exactNinetyPercent, {
  issuedAt: '2026-07-11T11:00:00.000Z',
  issuedBy: 'admin-reviewer',
});
assert('an eligible fully reviewed cohort can issue a persisted Phase 2 entry certificate',
  certificate.schemaVersion === 'live-golden-phase2-entry-certificate-v2'
    && certificate.eligibleForPhase2 === true
    && certificate.cohortId === exactNinetyPercent.cohortId
    && certificate.boardFingerprint === originalFingerprint
    && certificate.decisionDigest === liveGoldenReviewDecisionDigest(exactNinetyPercent)
    && certificate.reviewed === 60
    && certificate.precision === 0.9
    && certificate.hiddenKnownCount === 60
    && certificate.obviousCount === 0
    && certificate.malformedCount === 0
    && certificate.semanticDuplicateCount === 0
    && certificate.platformResidueCount === 0
    && certificate.sentenceResidueCount === 0
    && /^phase2_[a-f0-9]{32}$/.test(certificate.certificateId),
  JSON.stringify(certificate));
assert('persisted Phase 2 certificates are accepted only when cryptographically bound to the eligible cohort',
  parseLiveGoldenPhase2EntryCertificate(JSON.parse(JSON.stringify(certificate)), exactNinetyPercent)?.certificateId
      === certificate.certificateId
    && parseLiveGoldenPhase2EntryCertificate({
      ...certificate,
      boardFingerprint: 'tampered-board-fingerprint',
    }, exactNinetyPercent) === undefined
    && parseLiveGoldenPhase2EntryCertificate({
      ...certificate,
      precision: 1,
    }, exactNinetyPercent) === undefined
    && parseLiveGoldenPhase2EntryCertificate({
      ...certificate,
      obviousCount: 1,
    }, exactNinetyPercent) === undefined
    && parseLiveGoldenPhase2EntryCertificate({
      ...certificate,
      schemaVersion: 'live-golden-phase2-entry-certificate-v1',
    }, exactNinetyPercent) === undefined
    && parseLiveGoldenPhase2EntryCertificate({
      ...certificate,
      decisionDigest: '0'.repeat(64),
    }, exactNinetyPercent) === undefined);

const persistedRoundTrip = JSON.parse(JSON.stringify(exactNinetyPercent)) as PersistedLiveGoldenReviewCohort;
assert('the review cohort schema survives a JSON persistence round trip',
  summarizeLiveGoldenBlindReviews(persistedRoundTrip).passes === true
    && persistedRoundTrip.members.length === 60);

const parsedPersisted = parseLiveGoldenReviewCohort(JSON.parse(JSON.stringify(exactNinetyPercent)));
assert('persisted cohorts are parsed only after their schema and semantic hashes are verified',
  parsedPersisted?.cohortId === exactNinetyPercent.cohortId
    && parseLiveGoldenReviewCohort({
      ...JSON.parse(JSON.stringify(exactNinetyPercent)),
      boardFingerprint: 'tampered-board-fingerprint',
    }) === undefined
    && parseLiveGoldenReviewCohort({
      ...JSON.parse(JSON.stringify(exactNinetyPercent)),
      members: exactNinetyPercent.members.map((member, index) => index === 0 ? {
        ...member,
        keyword: 'tampered-keyword',
      } : member),
    }) === undefined);

const twoSemanticDrifts = reconcileLiveGoldenReviewCohort(
  originalCohort,
  balancedItems.map((item, index) => index < 2 ? {
    ...item,
    intent: `changed-intent-${index}`,
  } : item),
  { nowMs },
);
assert('pending and missing semantic persistence fields are validated on load',
  parseLiveGoldenReviewCohort(JSON.parse(JSON.stringify(twoSemanticDrifts)))?.pendingCandidates.length === 2
    && isPersistedLiveGoldenReviewCohort(JSON.parse(JSON.stringify(twoSemanticDrifts)))
    && !isPersistedLiveGoldenReviewCohort({ ...twoSemanticDrifts, schemaVersion: 'tampered' }));
const repeatedDriftObservation = reconcileLiveGoldenReviewCohort(
  twoSemanticDrifts,
  balancedItems.map((item, index) => index < 2 ? {
    ...item,
    intent: `changed-intent-${index}`,
  } : item),
  { nowMs: nowMs + 60_000 },
);
assert('re-observing pending semantics keeps their first-seen records stable',
  repeatedDriftObservation.pendingCandidates.length === 2
    && repeatedDriftObservation.pendingCandidates.every((candidate) => (
      candidate.firstSeenAt === twoSemanticDrifts.pendingCandidates.find(
        (previous) => previous.semanticHash === candidate.semanticHash,
      )?.firstSeenAt
    )));
const clearedPendingObservation = reconcileLiveGoldenReviewCohort(
  repeatedDriftObservation,
  balancedItems,
  { nowMs: nowMs + 120_000 },
);
assert('pending candidates are current-only and disappear when no longer observed',
  clearedPendingObservation.pendingCandidates.length === 0
    && clearedPendingObservation.missingSemanticHashes.length === 0);

const boundRefresh = bindLiveGoldenReviewRows(originalCohort, refreshedMeasurements, { nowMs });
assert('binding returns current measured rows for the frozen cohort without changing its identity',
  boundRefresh.cohort.cohortId === originalCohort.cohortId
    && boundRefresh.reviewRows.length === 60
    && boundRefresh.pendingRows.length === 0
    && boundRefresh.missingSemanticHashes.length === 0
    && isExactLiveGoldenReviewBinding(boundRefresh));
const missingOneBinding = bindLiveGoldenReviewRows(
  originalCohort,
  refreshedMeasurements.slice(0, refreshedMeasurements.length - 1),
  { nowMs },
);
assert('the 60-to-59 boundary is never considered an exact current cohort binding',
  !isExactLiveGoldenReviewBinding(missingOneBinding)
    && missingOneBinding.reviewRows.length === originalCohort.members.length - 1
    && missingOneBinding.missingSemanticHashes.length === 1);
const duplicateCurrentBinding = bindLiveGoldenReviewRows(
  originalCohort,
  [...refreshedMeasurements, { ...refreshedMeasurements[0], id: 'current-duplicate-id' }],
  { nowMs },
);
assert('an extra duplicate of a frozen semantic hash fails exact multiset binding',
  duplicateCurrentBinding.reviewRows.length === originalCohort.members.length
    && !isExactLiveGoldenReviewBinding(duplicateCurrentBinding));
const boundDrift = bindLiveGoldenReviewRows(originalCohort, changedSemantics, { nowMs });
assert('binding keeps semantic drift out of review rows and exposes it as a pending measured row',
  boundDrift.cohort.boardFingerprint === originalFingerprint
    && boundDrift.reviewRows.length === 59
    && boundDrift.pendingRows.length === 1
    && boundDrift.pendingRows[0].intent === 'changed-intent-must-not-replace-frozen-member'
    && boundDrift.missingSemanticHashes.length === 1);
const boundTwoDrifts = bindLiveGoldenReviewRows(
  originalCohort,
  balancedItems.map((item, index) => index < 2 ? {
    ...item,
    intent: `changed-intent-${index}`,
  } : item),
  { nowMs },
);
assert('multiple pending measured rows are returned in deterministic semantic order',
  boundTwoDrifts.pendingRows.length === 2
    && boundTwoDrifts.pendingRows[0].keyword < boundTwoDrifts.pendingRows[1].keyword);

console.log('[live-golden-review-cohort.test] passed');

export {};
