import crypto from 'crypto';
import type { MobileLiveGoldenBoardItem } from './contracts';
import {
  buildLiveGoldenSupplyReport,
  isTrustedLiveGoldenSupplyRow,
  liveGoldenBoardFingerprint,
  LIVE_GOLDEN_HUMAN_REVIEW_FINGERPRINT_VERSION,
  type LiveGoldenSupplyReport,
} from './live-golden-supply-report';

export const LIVE_GOLDEN_REVIEW_COHORT_SCHEMA_VERSION = 'live-golden-review-cohort-v2' as const;
export const LIVE_GOLDEN_BLIND_REVIEW_DECISION_SCHEMA_VERSION = 'live-golden-blind-review-decision-v2' as const;
export const LIVE_GOLDEN_PHASE2_ENTRY_CERTIFICATE_SCHEMA_VERSION = 'live-golden-phase2-entry-certificate-v2' as const;

export type LiveGoldenReviewCohortState =
  | 'building-supply'
  | 'review-target-frozen'
  | 'pending-human-review'
  | 'human-review-failed'
  | 'eligible';

export interface LiveGoldenReviewSemanticInput {
  keyword: string;
  category: string;
  intent: string;
}

export interface LiveGoldenReviewCohortMember extends LiveGoldenReviewSemanticInput {
  semanticHash: string;
}

export interface LiveGoldenReviewPendingCandidate extends LiveGoldenReviewCohortMember {
  firstSeenAt: string;
}

export interface LiveGoldenBlindReviewDecision {
  schemaVersion: typeof LIVE_GOLDEN_BLIND_REVIEW_DECISION_SCHEMA_VERSION;
  cohortId: string;
  semanticHash: string;
  reviewer: string;
  reviewedAt: string;
  precisionPassed: boolean;
  hiddenKnown: boolean;
  malformed: boolean;
  semanticDuplicate: boolean;
  platformResidue: boolean;
  sentenceResidue: boolean;
}

export interface PersistedLiveGoldenReviewCohort {
  schemaVersion: typeof LIVE_GOLDEN_REVIEW_COHORT_SCHEMA_VERSION;
  fingerprintVersion: typeof LIVE_GOLDEN_HUMAN_REVIEW_FINGERPRINT_VERSION;
  cohortId: string;
  state: Exclude<LiveGoldenReviewCohortState, 'building-supply'>;
  automatedSupplyGate: 'pass';
  boardFingerprint: string;
  frozenAt: string;
  updatedAt: string;
  members: LiveGoldenReviewCohortMember[];
  decisions: Record<string, LiveGoldenBlindReviewDecision>;
  pendingCandidates: LiveGoldenReviewPendingCandidate[];
  missingSemanticHashes: string[];
}

export interface LiveGoldenBlindReviewSummary {
  total: number;
  reviewed: number;
  precisionPassed: number;
  hiddenKnownCount: number;
  obviousCount: number;
  precision: number;
  malformedCount: number;
  semanticDuplicateCount: number;
  platformResidueCount: number;
  sentenceResidueCount: number;
  invalidDecisionCount: number;
  complete: boolean;
  passes: boolean;
}

export interface LiveGoldenPhase2EntryCertificate {
  schemaVersion: typeof LIVE_GOLDEN_PHASE2_ENTRY_CERTIFICATE_SCHEMA_VERSION;
  certificateId: string;
  eligibleForPhase2: true;
  cohortId: string;
  boardFingerprint: string;
  fingerprintVersion: typeof LIVE_GOLDEN_HUMAN_REVIEW_FINGERPRINT_VERSION;
  issuedAt: string;
  issuedBy: string;
  decisionDigest: string;
  reviewed: number;
  precisionPassed: number;
  hiddenKnownCount: number;
  obviousCount: 0;
  precision: number;
  malformedCount: 0;
  semanticDuplicateCount: 0;
  platformResidueCount: 0;
  sentenceResidueCount: 0;
}

export interface LiveGoldenReviewCohortOptions {
  nowMs?: number;
  verifiedTarget?: number;
  minimumActiveCoreCategories?: number;
}

export interface LiveGoldenReviewCohortFreezeResult {
  state: 'building-supply' | 'review-target-frozen';
  supplyReport: LiveGoldenSupplyReport;
  cohort?: PersistedLiveGoldenReviewCohort;
}

export interface LiveGoldenReviewRowBinding {
  cohort: PersistedLiveGoldenReviewCohort;
  reviewRows: MobileLiveGoldenBoardItem[];
  pendingRows: MobileLiveGoldenBoardItem[];
  missingSemanticHashes: string[];
  /** Sorted multiset, including duplicate current semantics, for exact binding checks. */
  currentSemanticHashes: string[];
}

export type LiveGoldenBlindReviewRejectionReason =
  | 'invalid-payload'
  | 'invalid-schema'
  | 'cohort-id-mismatch'
  | 'semantic-hash-not-in-cohort'
  | 'reviewer-missing'
  | 'invalid-reviewed-at'
  | 'review-before-freeze'
  | 'invalid-decision-flags'
  | 'cohort-review-closed';

export type LiveGoldenBlindReviewSubmissionResult =
  | {
    accepted: true;
    cohort: PersistedLiveGoldenReviewCohort;
  }
  | {
    accepted: false;
    reason: LiveGoldenBlindReviewRejectionReason;
    cohort: PersistedLiveGoldenReviewCohort;
  };

function sha256(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function semanticInput(value: LiveGoldenReviewSemanticInput): LiveGoldenReviewSemanticInput {
  return {
    keyword: String(value.keyword || ''),
    category: String(value.category || ''),
    intent: String(value.intent || ''),
  };
}

export function liveGoldenReviewSemanticHash(value: LiveGoldenReviewSemanticInput): string {
  return sha256({
    fingerprintVersion: LIVE_GOLDEN_HUMAN_REVIEW_FINGERPRINT_VERSION,
    semantic: semanticInput(value),
  });
}

function memberFromRow(row: MobileLiveGoldenBoardItem): LiveGoldenReviewCohortMember {
  const semantic = semanticInput(row);
  return {
    ...semantic,
    semanticHash: liveGoldenReviewSemanticHash(semantic),
  };
}

function compareMembers(
  left: LiveGoldenReviewCohortMember,
  right: LiveGoldenReviewCohortMember,
): number {
  const leftText = JSON.stringify({
    keyword: left.keyword,
    category: left.category,
    intent: left.intent,
  });
  const rightText = JSON.stringify({
    keyword: right.keyword,
    category: right.category,
    intent: right.intent,
  });
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
}

function verifiedMembers(rows: readonly MobileLiveGoldenBoardItem[]): LiveGoldenReviewCohortMember[] {
  return (Array.isArray(rows) ? rows : [])
    .filter(isTrustedLiveGoldenSupplyRow)
    .map(memberFromRow)
    .sort(compareMembers);
}

function resolveNowMs(value: number | undefined): number {
  return Number.isFinite(value) ? Number(value) : Date.now();
}

function boardFingerprintFromMembers(
  members: readonly LiveGoldenReviewCohortMember[],
): string {
  const reviewedSemantics = members
    .map((member) => semanticInput(member))
    .sort((left, right) => {
      const leftText = JSON.stringify(left);
      const rightText = JSON.stringify(right);
      return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
    });
  return sha256({
    fingerprintVersion: LIVE_GOLDEN_HUMAN_REVIEW_FINGERPRINT_VERSION,
    reviewedSemantics,
  });
}

function cohortIdForFingerprint(boardFingerprint: string): string {
  return `cohort_${sha256({
    schemaVersion: LIVE_GOLDEN_REVIEW_COHORT_SCHEMA_VERSION,
    fingerprintVersion: LIVE_GOLDEN_HUMAN_REVIEW_FINGERPRINT_VERSION,
    boardFingerprint,
  }).slice(0, 32)}`;
}

export function freezeLiveGoldenReviewCohort(
  rows: readonly MobileLiveGoldenBoardItem[],
  options: LiveGoldenReviewCohortOptions = {},
): LiveGoldenReviewCohortFreezeResult {
  const nowMs = resolveNowMs(options.nowMs);
  const supplyReport = buildLiveGoldenSupplyReport(rows, {
    nowMs,
    verifiedTarget: options.verifiedTarget,
    minimumActiveCoreCategories: options.minimumActiveCoreCategories,
  });
  const members = verifiedMembers(rows);
  const memberHashCount = new Set(members.map((member) => member.semanticHash)).size;
  if (memberHashCount !== members.length) {
    return {
      state: 'building-supply',
      supplyReport: {
        ...supplyReport,
        failureReasons: [...new Set([
          ...supplyReport.failureReasons,
          'duplicate-semantic-hash',
        ])],
        automatedSupplyGate: 'fail',
        superiorityGate: 'fail',
      },
    };
  }
  if (supplyReport.automatedSupplyGate !== 'pass') {
    return {
      state: 'building-supply',
      supplyReport,
    };
  }

  const frozenAt = new Date(nowMs).toISOString();
  const boardFingerprint = liveGoldenBoardFingerprint(rows);
  const cohortId = cohortIdForFingerprint(boardFingerprint);
  const cohort: PersistedLiveGoldenReviewCohort = {
    schemaVersion: LIVE_GOLDEN_REVIEW_COHORT_SCHEMA_VERSION,
    fingerprintVersion: LIVE_GOLDEN_HUMAN_REVIEW_FINGERPRINT_VERSION,
    cohortId,
    state: 'review-target-frozen',
    automatedSupplyGate: 'pass',
    boardFingerprint,
    frozenAt,
    updatedAt: frozenAt,
    members,
    decisions: {},
    pendingCandidates: [],
    missingSemanticHashes: [],
  };
  return {
    state: 'review-target-frozen',
    supplyReport,
    cohort,
  };
}

export const createLiveGoldenReviewCohort = freezeLiveGoldenReviewCohort;

export function reconcileLiveGoldenReviewCohort(
  cohort: PersistedLiveGoldenReviewCohort,
  currentTrustedVerifiedRows: readonly MobileLiveGoldenBoardItem[],
  options: Pick<LiveGoldenReviewCohortOptions, 'nowMs'> = {},
): PersistedLiveGoldenReviewCohort {
  const observedAt = new Date(resolveNowMs(options.nowMs)).toISOString();
  const currentMembers = verifiedMembers(currentTrustedVerifiedRows);
  const frozenHashes = new Set(cohort.members.map((member) => member.semanticHash));
  const currentHashes = new Set(currentMembers.map((member) => member.semanticHash));
  const previousPendingByHash = new Map(
    cohort.pendingCandidates.map((candidate) => [candidate.semanticHash, { ...candidate }]),
  );
  const pendingByHash = new Map<string, LiveGoldenReviewPendingCandidate>();

  for (const member of currentMembers) {
    if (!frozenHashes.has(member.semanticHash)) {
      const previous = previousPendingByHash.get(member.semanticHash);
      pendingByHash.set(member.semanticHash, {
        ...member,
        firstSeenAt: previous?.firstSeenAt || observedAt,
      });
    }
  }

  const pendingCandidates = [...pendingByHash.values()].sort(compareMembers);
  const missingSemanticHashes = [...new Set(
    cohort.members
      .filter((member) => !currentHashes.has(member.semanticHash))
      .map((member) => member.semanticHash),
  )].sort();
  const membershipStateChanged = JSON.stringify(pendingCandidates) !== JSON.stringify(cohort.pendingCandidates)
    || JSON.stringify(missingSemanticHashes) !== JSON.stringify(cohort.missingSemanticHashes);

  return {
    ...cohort,
    // Measurement-only refreshes are expected every few minutes. They must not
    // rewrite the review artifact or make its audit timestamp look like a new
    // human/semantic event.
    updatedAt: membershipStateChanged ? observedAt : cohort.updatedAt,
    // These four fields are intentionally copied from the persisted cohort. A
    // metric refresh or new discovery must never silently create a new target.
    cohortId: cohort.cohortId,
    boardFingerprint: cohort.boardFingerprint,
    frozenAt: cohort.frozenAt,
    members: cohort.members.map((member) => ({ ...member })),
    decisions: { ...cohort.decisions },
    pendingCandidates,
    missingSemanticHashes,
  };
}

export function bindLiveGoldenReviewRows(
  cohort: PersistedLiveGoldenReviewCohort,
  currentTrustedVerifiedRows: readonly MobileLiveGoldenBoardItem[],
  options: Pick<LiveGoldenReviewCohortOptions, 'nowMs'> = {},
): LiveGoldenReviewRowBinding {
  const reconciled = reconcileLiveGoldenReviewCohort(
    cohort,
    currentTrustedVerifiedRows,
    options,
  );
  const trustedRows = (Array.isArray(currentTrustedVerifiedRows)
    ? currentTrustedVerifiedRows
    : [])
    .filter(isTrustedLiveGoldenSupplyRow);
  const rowsByHash = new Map<string, MobileLiveGoldenBoardItem[]>();
  for (const row of trustedRows) {
    const semanticHash = liveGoldenReviewSemanticHash(row);
    const bucket = rowsByHash.get(semanticHash) || [];
    bucket.push(row);
    rowsByHash.set(semanticHash, bucket);
  }

  const reviewRows: MobileLiveGoldenBoardItem[] = [];
  for (const member of cohort.members) {
    const bucket = rowsByHash.get(member.semanticHash);
    const row = bucket?.shift();
    if (row) reviewRows.push(row);
  }
  const frozenHashes = new Set(cohort.members.map((member) => member.semanticHash));
  const pendingRows = trustedRows
    .filter((row) => !frozenHashes.has(liveGoldenReviewSemanticHash(row)))
    .sort((left, right) => compareMembers(memberFromRow(left), memberFromRow(right)));

  return {
    cohort: reconciled,
    reviewRows,
    pendingRows,
    missingSemanticHashes: [...reconciled.missingSemanticHashes],
    currentSemanticHashes: trustedRows
      .map((row) => liveGoldenReviewSemanticHash(row))
      .sort(),
  };
}

export function isExactLiveGoldenReviewBinding(
  binding: LiveGoldenReviewRowBinding,
): boolean {
  const frozenSemanticHashes = binding.cohort.members
    .map((member) => member.semanticHash)
    .sort();
  return binding.missingSemanticHashes.length === 0
    && binding.pendingRows.length === 0
    && binding.reviewRows.length === binding.cohort.members.length
    && binding.currentSemanticHashes.length === frozenSemanticHashes.length
    && binding.currentSemanticHashes.every((semanticHash, index) => (
      semanticHash === frozenSemanticHashes[index]
    ));
}

function hasValidDecisionFlags(value: Partial<LiveGoldenBlindReviewDecision>): boolean {
  return typeof value.precisionPassed === 'boolean'
    && typeof value.hiddenKnown === 'boolean'
    && typeof value.malformed === 'boolean'
    && typeof value.semanticDuplicate === 'boolean'
    && typeof value.platformResidue === 'boolean'
    && typeof value.sentenceResidue === 'boolean';
}

function isValidStoredDecision(
  cohort: PersistedLiveGoldenReviewCohort,
  semanticHash: string,
  value: unknown,
  memberHashes: ReadonlySet<string>,
): value is LiveGoldenBlindReviewDecision {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const decision = value as Partial<LiveGoldenBlindReviewDecision>;
  const reviewedAtMs = Date.parse(String(decision.reviewedAt || ''));
  return decision.schemaVersion === LIVE_GOLDEN_BLIND_REVIEW_DECISION_SCHEMA_VERSION
    && decision.cohortId === cohort.cohortId
    && decision.semanticHash === semanticHash
    && memberHashes.has(semanticHash)
    && typeof decision.reviewer === 'string'
    && decision.reviewer.trim().length > 0
    && Number.isFinite(reviewedAtMs)
    && reviewedAtMs >= Date.parse(cohort.frozenAt)
    && hasValidDecisionFlags(decision);
}

export function summarizeLiveGoldenBlindReviews(
  cohort: PersistedLiveGoldenReviewCohort,
): LiveGoldenBlindReviewSummary {
  const memberHashes = new Set(cohort.members.map((member) => member.semanticHash));
  const duplicateFrozenMemberCount = Math.max(0, cohort.members.length - memberHashes.size);
  const validDecisions: LiveGoldenBlindReviewDecision[] = [];
  let invalidDecisionCount = 0;

  for (const [semanticHash, decision] of Object.entries(cohort.decisions || {})) {
    if (isValidStoredDecision(cohort, semanticHash, decision, memberHashes)) {
      validDecisions.push(decision);
    } else {
      invalidDecisionCount += 1;
    }
  }

  const total = cohort.members.length;
  const reviewed = validDecisions.length;
  const precisionPassed = validDecisions.filter((decision) => decision.precisionPassed).length;
  const hiddenKnownCount = validDecisions.filter((decision) => decision.hiddenKnown).length;
  const obviousCount = validDecisions.filter((decision) => !decision.hiddenKnown).length;
  const malformedCount = validDecisions.filter((decision) => decision.malformed).length;
  const semanticDuplicateCount = duplicateFrozenMemberCount
    + validDecisions.filter((decision) => decision.semanticDuplicate).length;
  const platformResidueCount = validDecisions.filter((decision) => decision.platformResidue).length;
  const sentenceResidueCount = validDecisions.filter((decision) => decision.sentenceResidue).length;
  const precision = reviewed > 0 ? precisionPassed / reviewed : 0;
  const complete = total > 0
    && reviewed === total
    && invalidDecisionCount === 0;
  const passes = cohort.automatedSupplyGate === 'pass'
    && complete
    && precision >= 0.9
    && obviousCount === 0
    && malformedCount === 0
    && semanticDuplicateCount === 0
    && platformResidueCount === 0
    && sentenceResidueCount === 0;

  return {
    total,
    reviewed,
    precisionPassed,
    hiddenKnownCount,
    obviousCount,
    precision,
    malformedCount,
    semanticDuplicateCount,
    platformResidueCount,
    sentenceResidueCount,
    invalidDecisionCount,
    complete,
    passes,
  };
}

export const evaluateLiveGoldenReview = summarizeLiveGoldenBlindReviews;

function stateAfterReviews(
  cohort: PersistedLiveGoldenReviewCohort,
): PersistedLiveGoldenReviewCohort['state'] {
  const summary = summarizeLiveGoldenBlindReviews(cohort);
  if (summary.reviewed === 0) return 'review-target-frozen';
  if (!summary.complete) return 'pending-human-review';
  return summary.passes ? 'eligible' : 'human-review-failed';
}

function hasOnlySemanticStrings(value: unknown): value is LiveGoldenReviewSemanticInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const semantic = value as Partial<LiveGoldenReviewSemanticInput>;
  return typeof semantic.keyword === 'string'
    && typeof semantic.category === 'string'
    && typeof semantic.intent === 'string';
}

function isValidPersistedMember(value: unknown): value is LiveGoldenReviewCohortMember {
  if (!hasOnlySemanticStrings(value)) return false;
  const member = value as Partial<LiveGoldenReviewCohortMember>;
  return typeof member.semanticHash === 'string'
    && /^[a-f0-9]{64}$/.test(member.semanticHash)
    && member.semanticHash === liveGoldenReviewSemanticHash(value);
}

export function parseLiveGoldenReviewCohort(
  value: unknown,
): PersistedLiveGoldenReviewCohort | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const input = value as Partial<PersistedLiveGoldenReviewCohort>;
  const allowedStates: PersistedLiveGoldenReviewCohort['state'][] = [
    'review-target-frozen',
    'pending-human-review',
    'human-review-failed',
    'eligible',
  ];
  if (input.schemaVersion !== LIVE_GOLDEN_REVIEW_COHORT_SCHEMA_VERSION) return undefined;
  if (input.fingerprintVersion !== LIVE_GOLDEN_HUMAN_REVIEW_FINGERPRINT_VERSION) return undefined;
  if (input.automatedSupplyGate !== 'pass') return undefined;
  if (!input.state || !allowedStates.includes(input.state)) return undefined;
  if (!Array.isArray(input.members) || input.members.length === 0) return undefined;
  if (!input.members.every(isValidPersistedMember)) return undefined;
  if (!Array.isArray(input.pendingCandidates)) return undefined;
  if (!input.pendingCandidates.every((candidate) => (
    isValidPersistedMember(candidate)
    && typeof candidate.firstSeenAt === 'string'
    && Number.isFinite(Date.parse(candidate.firstSeenAt))
  ))) return undefined;
  if (!Array.isArray(input.missingSemanticHashes)) return undefined;
  if (!input.missingSemanticHashes.every((hash) => (
    typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash)
  ))) return undefined;
  if (!input.decisions || typeof input.decisions !== 'object' || Array.isArray(input.decisions)) {
    return undefined;
  }
  if (typeof input.frozenAt !== 'string' || typeof input.updatedAt !== 'string') return undefined;
  const frozenAtMs = Date.parse(input.frozenAt);
  const updatedAtMs = Date.parse(input.updatedAt);
  if (!Number.isFinite(frozenAtMs) || !Number.isFinite(updatedAtMs) || updatedAtMs < frozenAtMs) {
    return undefined;
  }
  if (input.pendingCandidates.some((candidate) => Date.parse(candidate.firstSeenAt) < frozenAtMs)) {
    return undefined;
  }

  const members = input.members.map((member) => ({ ...member }));
  const memberHashes = new Set(members.map((member) => member.semanticHash));
  if (input.pendingCandidates.some((candidate) => memberHashes.has(candidate.semanticHash))) {
    return undefined;
  }
  if (input.missingSemanticHashes.some((hash) => !memberHashes.has(hash))) return undefined;
  const boardFingerprint = boardFingerprintFromMembers(members);
  if (input.boardFingerprint !== boardFingerprint) return undefined;
  if (input.cohortId !== cohortIdForFingerprint(boardFingerprint)) return undefined;

  const cohort: PersistedLiveGoldenReviewCohort = {
    schemaVersion: LIVE_GOLDEN_REVIEW_COHORT_SCHEMA_VERSION,
    fingerprintVersion: LIVE_GOLDEN_HUMAN_REVIEW_FINGERPRINT_VERSION,
    cohortId: input.cohortId,
    state: input.state,
    automatedSupplyGate: 'pass',
    boardFingerprint,
    frozenAt: input.frozenAt,
    updatedAt: input.updatedAt,
    members,
    decisions: Object.fromEntries(
      Object.entries(input.decisions).map(([key, decision]) => [
        key,
        decision && typeof decision === 'object' && !Array.isArray(decision)
          ? { ...(decision as LiveGoldenBlindReviewDecision) }
          : decision as LiveGoldenBlindReviewDecision,
      ]),
    ),
    pendingCandidates: input.pendingCandidates.map((candidate) => ({ ...candidate })),
    missingSemanticHashes: [...new Set(input.missingSemanticHashes)].sort(),
  };
  const summary = summarizeLiveGoldenBlindReviews(cohort);
  if (summary.invalidDecisionCount > 0 || stateAfterReviews(cohort) !== cohort.state) return undefined;
  return cohort;
}

export function isPersistedLiveGoldenReviewCohort(
  value: unknown,
): value is PersistedLiveGoldenReviewCohort {
  return parseLiveGoldenReviewCohort(value) !== undefined;
}

export function submitLiveGoldenBlindReviewDecision(
  cohort: PersistedLiveGoldenReviewCohort,
  value: unknown,
): LiveGoldenBlindReviewSubmissionResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { accepted: false, reason: 'invalid-payload', cohort };
  }
  const decision = value as Partial<LiveGoldenBlindReviewDecision>;
  if (decision.schemaVersion !== LIVE_GOLDEN_BLIND_REVIEW_DECISION_SCHEMA_VERSION) {
    return { accepted: false, reason: 'invalid-schema', cohort };
  }
  if (decision.cohortId !== cohort.cohortId) {
    return { accepted: false, reason: 'cohort-id-mismatch', cohort };
  }
  if (
    typeof decision.semanticHash !== 'string'
    || !cohort.members.some((member) => member.semanticHash === decision.semanticHash)
  ) {
    return { accepted: false, reason: 'semantic-hash-not-in-cohort', cohort };
  }
  if (typeof decision.reviewer !== 'string' || !decision.reviewer.trim()) {
    return { accepted: false, reason: 'reviewer-missing', cohort };
  }
  const reviewedAtMs = Date.parse(String(decision.reviewedAt || ''));
  if (!Number.isFinite(reviewedAtMs)) {
    return { accepted: false, reason: 'invalid-reviewed-at', cohort };
  }
  if (reviewedAtMs < Date.parse(cohort.frozenAt)) {
    return { accepted: false, reason: 'review-before-freeze', cohort };
  }
  if (!hasValidDecisionFlags(decision)) {
    return { accepted: false, reason: 'invalid-decision-flags', cohort };
  }
  if (cohort.state === 'eligible' || cohort.state === 'human-review-failed') {
    return { accepted: false, reason: 'cohort-review-closed', cohort };
  }

  const acceptedDecision: LiveGoldenBlindReviewDecision = {
    schemaVersion: LIVE_GOLDEN_BLIND_REVIEW_DECISION_SCHEMA_VERSION,
    cohortId: cohort.cohortId,
    semanticHash: decision.semanticHash,
    reviewer: decision.reviewer.trim(),
    reviewedAt: decision.reviewedAt!,
    precisionPassed: decision.precisionPassed!,
    hiddenKnown: decision.hiddenKnown!,
    malformed: decision.malformed!,
    semanticDuplicate: decision.semanticDuplicate!,
    platformResidue: decision.platformResidue!,
    sentenceResidue: decision.sentenceResidue!,
  };
  const next: PersistedLiveGoldenReviewCohort = {
    ...cohort,
    updatedAt: acceptedDecision.reviewedAt,
    decisions: {
      ...cohort.decisions,
      [acceptedDecision.semanticHash]: acceptedDecision,
    },
  };
  next.state = stateAfterReviews(next);
  return {
    accepted: true,
    cohort: next,
  };
}

export function liveGoldenReviewDecisionDigest(
  cohort: PersistedLiveGoldenReviewCohort,
): string {
  const decisions = Object.values(cohort.decisions || {})
    .map((decision) => ({
      schemaVersion: decision.schemaVersion,
      cohortId: decision.cohortId,
      semanticHash: decision.semanticHash,
      reviewer: decision.reviewer,
      reviewedAt: decision.reviewedAt,
      precisionPassed: decision.precisionPassed,
      hiddenKnown: decision.hiddenKnown,
      malformed: decision.malformed,
      semanticDuplicate: decision.semanticDuplicate,
      platformResidue: decision.platformResidue,
      sentenceResidue: decision.sentenceResidue,
    }))
    .sort((left, right) => left.semanticHash.localeCompare(right.semanticHash));
  return sha256({
    schemaVersion: LIVE_GOLDEN_BLIND_REVIEW_DECISION_SCHEMA_VERSION,
    cohortId: cohort.cohortId,
    decisions,
  });
}

export function issueLiveGoldenPhase2EntryCertificate(
  cohort: PersistedLiveGoldenReviewCohort,
  input: { issuedAt: string; issuedBy: string },
): LiveGoldenPhase2EntryCertificate {
  const summary = summarizeLiveGoldenBlindReviews(cohort);
  if (cohort.state !== 'eligible' || !summary.passes) {
    throw new Error('live-golden-review-cohort-not-eligible');
  }
  const issuedAtMs = Date.parse(String(input?.issuedAt || ''));
  const latestReviewAtMs = Math.max(
    Date.parse(cohort.frozenAt),
    ...Object.values(cohort.decisions).map((decision) => Date.parse(decision.reviewedAt)),
  );
  if (!Number.isFinite(issuedAtMs) || issuedAtMs < latestReviewAtMs) {
    throw new Error('live-golden-phase2-certificate-invalid-issued-at');
  }
  const issuedBy = String(input?.issuedBy || '').trim();
  if (!issuedBy) throw new Error('live-golden-phase2-certificate-issuer-missing');
  const decisionDigest = liveGoldenReviewDecisionDigest(cohort);

  const certificateId = `phase2_${sha256({
    schemaVersion: LIVE_GOLDEN_PHASE2_ENTRY_CERTIFICATE_SCHEMA_VERSION,
    cohortId: cohort.cohortId,
    boardFingerprint: cohort.boardFingerprint,
    decisionDigest,
    issuedAt: input.issuedAt,
    issuedBy,
  }).slice(0, 32)}`;
  return {
    schemaVersion: LIVE_GOLDEN_PHASE2_ENTRY_CERTIFICATE_SCHEMA_VERSION,
    certificateId,
    eligibleForPhase2: true,
    cohortId: cohort.cohortId,
    boardFingerprint: cohort.boardFingerprint,
    fingerprintVersion: cohort.fingerprintVersion,
    issuedAt: input.issuedAt,
    issuedBy,
    decisionDigest,
    reviewed: summary.reviewed,
    precisionPassed: summary.precisionPassed,
    hiddenKnownCount: summary.hiddenKnownCount,
    obviousCount: 0,
    precision: summary.precision,
    malformedCount: 0,
    semanticDuplicateCount: 0,
    platformResidueCount: 0,
    sentenceResidueCount: 0,
  };
}

export function parseLiveGoldenPhase2EntryCertificate(
  value: unknown,
  cohort: PersistedLiveGoldenReviewCohort,
): LiveGoldenPhase2EntryCertificate | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const input = value as Partial<LiveGoldenPhase2EntryCertificate>;
  if (input.schemaVersion !== LIVE_GOLDEN_PHASE2_ENTRY_CERTIFICATE_SCHEMA_VERSION) return undefined;
  if (input.eligibleForPhase2 !== true) return undefined;
  if (cohort.state !== 'eligible') return undefined;
  const summary = summarizeLiveGoldenBlindReviews(cohort);
  if (!summary.passes) return undefined;
  if (input.cohortId !== cohort.cohortId) return undefined;
  if (input.boardFingerprint !== cohort.boardFingerprint) return undefined;
  if (input.fingerprintVersion !== cohort.fingerprintVersion) return undefined;
  const decisionDigest = liveGoldenReviewDecisionDigest(cohort);
  if (input.decisionDigest !== decisionDigest) return undefined;
  if (typeof input.issuedAt !== 'string' || !Number.isFinite(Date.parse(input.issuedAt))) return undefined;
  if (typeof input.issuedBy !== 'string' || !input.issuedBy.trim()) return undefined;
  const latestReviewAtMs = Math.max(
    Date.parse(cohort.frozenAt),
    ...Object.values(cohort.decisions).map((decision) => Date.parse(decision.reviewedAt)),
  );
  if (Date.parse(input.issuedAt) < latestReviewAtMs) return undefined;
  const expectedCertificateId = `phase2_${sha256({
    schemaVersion: LIVE_GOLDEN_PHASE2_ENTRY_CERTIFICATE_SCHEMA_VERSION,
    cohortId: cohort.cohortId,
    boardFingerprint: cohort.boardFingerprint,
    decisionDigest,
    issuedAt: input.issuedAt,
    issuedBy: input.issuedBy.trim(),
  }).slice(0, 32)}`;
  if (input.certificateId !== expectedCertificateId) return undefined;
  if (input.reviewed !== summary.reviewed) return undefined;
  if (input.precisionPassed !== summary.precisionPassed) return undefined;
  if (input.hiddenKnownCount !== summary.hiddenKnownCount) return undefined;
  if (input.obviousCount !== 0 || summary.obviousCount !== 0) return undefined;
  if (input.precision !== summary.precision) return undefined;
  if (
    input.malformedCount !== 0
    || input.semanticDuplicateCount !== 0
    || input.platformResidueCount !== 0
    || input.sentenceResidueCount !== 0
  ) return undefined;

  return {
    schemaVersion: LIVE_GOLDEN_PHASE2_ENTRY_CERTIFICATE_SCHEMA_VERSION,
    certificateId: expectedCertificateId,
    eligibleForPhase2: true,
    cohortId: cohort.cohortId,
    boardFingerprint: cohort.boardFingerprint,
    fingerprintVersion: cohort.fingerprintVersion,
    issuedAt: input.issuedAt,
    issuedBy: input.issuedBy.trim(),
    decisionDigest,
    reviewed: summary.reviewed,
    precisionPassed: summary.precisionPassed,
    hiddenKnownCount: summary.hiddenKnownCount,
    obviousCount: 0,
    precision: summary.precision,
    malformedCount: 0,
    semanticDuplicateCount: 0,
    platformResidueCount: 0,
    sentenceResidueCount: 0,
  };
}

export const buildLiveGoldenPhase2EntryCertificate = issueLiveGoldenPhase2EntryCertificate;
