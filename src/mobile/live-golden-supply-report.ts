import crypto from 'crypto';
import type { MobileLiveGoldenBoardItem } from './contracts';
import {
  hasTrustedDocumentCountMeasurement,
  hasTrustedSearchVolumeMeasurement,
} from './keyword-ai-judge';
import {
  LIVE_GOLDEN_CORE_CATEGORY_POLICIES,
  liveGoldenPolicyKeyForDiscoveryId,
} from './live-golden-category-policy';
import { SEARCHAD_KEYWORD_BINDING_VERSION } from '../utils/searchad-result-alignment';

export interface LiveGoldenHumanReview {
  reviewed: number;
  precision: number;
  malformedCount: number;
  semanticDuplicateCount: number;
  platformResidueCount: number;
  sentenceResidueCount: number;
  reviewedAt?: string;
  boardFingerprint?: string;
}

export interface LiveGoldenHumanReviewAttestation {
  schemaVersion: 'live-golden-human-review-v1';
  fingerprintVersion: 'verified-semantics-v2';
  boardUpdatedAt: string;
  boardFingerprint: string;
  reviewedAt: string;
  reviewer: string;
  reviewed: number;
  precisionPassed: number;
  malformedCount: number;
  semanticDuplicateCount: number;
  platformResidueCount: number;
  sentenceResidueCount: number;
}

export type LiveGoldenHumanReviewAttestationReason =
  | 'accepted'
  | 'invalid-payload'
  | 'invalid-schema'
  | 'invalid-fingerprint-version'
  | 'board-version-mismatch'
  | 'reviewer-missing'
  | 'invalid-timestamps'
  | 'review-before-board'
  | 'board-in-future'
  | 'review-in-future'
  | 'board-fingerprint-mismatch'
  | 'invalid-reviewed-count'
  | 'invalid-precision-passed'
  | 'invalid-malformed-count'
  | 'invalid-semantic-duplicate-count'
  | 'invalid-platform-residue-count'
  | 'invalid-sentence-residue-count';

export interface LiveGoldenHumanReviewAttestationResult {
  review?: LiveGoldenHumanReview;
  reason: LiveGoldenHumanReviewAttestationReason;
}

export interface LiveGoldenSupplyReportOptions {
  nowMs?: number;
  verifiedTarget?: number;
  minimumActiveCoreCategories?: number;
  humanReview?: LiveGoldenHumanReview;
}

export interface LiveGoldenSupplyCategoryReport {
  key: string;
  label: string;
  verifiedCount: number;
  minimumVerified: number;
  deficit: number;
  share: number;
  maximumShare: number;
}

export interface LiveGoldenSupplyReport {
  generatedAt: string;
  totalRows: number;
  verifiedCount: number;
  untrustedCount: number;
  staleVerifiedCount: number;
  verifiedTarget: number;
  measuredCompletenessRate: number;
  activeCoreCategoryCount: number;
  minimumActiveCoreCategories: number;
  maximumCoreCategoryShare: number;
  categories: LiveGoldenSupplyCategoryReport[];
  unknownCategoryCount: number;
  failureReasons: string[];
  automatedSupplyGate: 'pass' | 'fail';
  superiorityGate: 'pass' | 'fail' | 'pending-human-review';
  humanReview?: LiveGoldenSupplyReportOptions['humanReview'];
}

const MAX_VERIFIED_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_REVIEW_CLOCK_SKEW_MS = 5 * 60 * 1000;
export const LIVE_GOLDEN_HUMAN_REVIEW_FINGERPRINT_VERSION = 'verified-semantics-v2' as const;

function roundRate(value: number): number {
  return Math.round(Math.max(0, value) * 10_000) / 10_000;
}

function finiteMeasuredNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function strictAttestationNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number.NaN;
}

export function isTrustedLiveGoldenSupplyRow(item: MobileLiveGoldenBoardItem): boolean {
  const pcSearchVolume = finiteMeasuredNumber(item.pcSearchVolume);
  const mobileSearchVolume = finiteMeasuredNumber(item.mobileSearchVolume);
  const totalSearchVolume = finiteMeasuredNumber(item.totalSearchVolume);
  const documentCount = finiteMeasuredNumber(item.documentCount);
  const hasMeasuredSplit = pcSearchVolume !== null
    && mobileSearchVolume !== null
    && totalSearchVolume !== null
    && pcSearchVolume + mobileSearchVolume > 0
    && pcSearchVolume + mobileSearchVolume === totalSearchVolume;
  const searchVolumeMeasuredAtMs = Date.parse(String(item.searchVolumeMeasuredAt || ''));
  return item.isMeasured === true
    && hasMeasuredSplit
    && documentCount !== null
    && documentCount > 0
    && item.searchVolumeSource === 'searchad'
    && item.searchVolumeConfidence === 'high'
    && item.isSearchVolumeEstimated === false
    && item.searchVolumeBindingVersion === SEARCHAD_KEYWORD_BINDING_VERSION
    && Number.isFinite(searchVolumeMeasuredAtMs)
    && item.documentCountSource === 'naver-api'
    && item.documentCountConfidence === 'high'
    && (item.documentCountQueryMode === 'broad' || item.documentCountQueryMode === 'exact-phrase')
    && item.isDocumentCountEstimated === false
    && hasTrustedSearchVolumeMeasurement(item)
    && hasTrustedDocumentCountMeasurement(item);
}

export function liveGoldenBoardFingerprint(
  rows: readonly MobileLiveGoldenBoardItem[],
): string {
  // Human review covers query naturalness, category/intent fit, and semantic residue.
  // Volatile measurements and timestamps stay under the automated supply gate, so a
  // routine worker refresh cannot invalidate an otherwise identical human-reviewed set.
  const canonical = (Array.isArray(rows) ? rows : [])
    .filter(isTrustedLiveGoldenSupplyRow)
    .map((item) => ({
      keyword: String(item.keyword || ''),
      category: String(item.category || ''),
      intent: String(item.intent || ''),
    }))
    .sort((left, right) => {
      const leftText = JSON.stringify(left);
      const rightText = JSON.stringify(right);
      return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
    });
  return crypto.createHash('sha256').update(JSON.stringify({
    fingerprintVersion: LIVE_GOLDEN_HUMAN_REVIEW_FINGERPRINT_VERSION,
    reviewedSemantics: canonical,
  })).digest('hex');
}

export function evaluateLiveGoldenHumanReviewAttestation(
  value: unknown,
  rows: readonly MobileLiveGoldenBoardItem[],
  boardUpdatedAt: string | undefined,
  nowMs = Date.now(),
): LiveGoldenHumanReviewAttestationResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { reason: 'invalid-payload' };
  const input = value as Partial<LiveGoldenHumanReviewAttestation>;
  const verifiedCount = (Array.isArray(rows) ? rows : []).filter(isTrustedLiveGoldenSupplyRow).length;
  const reviewed = strictAttestationNumber(input.reviewed);
  const precisionPassed = strictAttestationNumber(input.precisionPassed);
  const malformedCount = strictAttestationNumber(input.malformedCount);
  const semanticDuplicateCount = strictAttestationNumber(input.semanticDuplicateCount);
  const platformResidueCount = strictAttestationNumber(input.platformResidueCount);
  const sentenceResidueCount = strictAttestationNumber(input.sentenceResidueCount);
  const reviewedAt = typeof input.reviewedAt === 'string' ? input.reviewedAt : '';
  const reviewedAtMs = Date.parse(reviewedAt);
  const currentBoardUpdatedAtText = String(boardUpdatedAt || '');
  const currentBoardUpdatedAtMs = Date.parse(currentBoardUpdatedAtText);
  const reviewedBoardUpdatedAtText = typeof input.boardUpdatedAt === 'string' ? input.boardUpdatedAt : '';
  const reviewedBoardUpdatedAtMs = Date.parse(reviewedBoardUpdatedAtText);
  const boardFingerprint = liveGoldenBoardFingerprint(rows);
  if (input.schemaVersion !== 'live-golden-human-review-v1') return { reason: 'invalid-schema' };
  if (input.fingerprintVersion !== LIVE_GOLDEN_HUMAN_REVIEW_FINGERPRINT_VERSION) {
    return { reason: 'invalid-fingerprint-version' };
  }
  if (!currentBoardUpdatedAtText || !reviewedBoardUpdatedAtText) return { reason: 'board-version-mismatch' };
  if (typeof input.reviewer !== 'string' || !input.reviewer.trim()) return { reason: 'reviewer-missing' };
  if (
    !Number.isFinite(reviewedAtMs)
    || !Number.isFinite(currentBoardUpdatedAtMs)
    || !Number.isFinite(reviewedBoardUpdatedAtMs)
  ) return { reason: 'invalid-timestamps' };
  if (
    currentBoardUpdatedAtMs > nowMs + MAX_REVIEW_CLOCK_SKEW_MS
    || reviewedBoardUpdatedAtMs > nowMs + MAX_REVIEW_CLOCK_SKEW_MS
  ) return { reason: 'board-in-future' };
  if (reviewedAtMs < reviewedBoardUpdatedAtMs) return { reason: 'review-before-board' };
  if (reviewedAtMs > nowMs + MAX_REVIEW_CLOCK_SKEW_MS) return { reason: 'review-in-future' };
  if (input.boardFingerprint !== boardFingerprint) return { reason: 'board-fingerprint-mismatch' };
  if (!Number.isInteger(reviewed) || reviewed < 0 || reviewed > verifiedCount) return { reason: 'invalid-reviewed-count' };
  if (!Number.isInteger(precisionPassed) || precisionPassed < 0 || precisionPassed > reviewed) {
    return { reason: 'invalid-precision-passed' };
  }
  if (!Number.isInteger(malformedCount) || malformedCount < 0) return { reason: 'invalid-malformed-count' };
  if (!Number.isInteger(semanticDuplicateCount) || semanticDuplicateCount < 0) {
    return { reason: 'invalid-semantic-duplicate-count' };
  }
  if (!Number.isInteger(platformResidueCount) || platformResidueCount < 0) {
    return { reason: 'invalid-platform-residue-count' };
  }
  if (!Number.isInteger(sentenceResidueCount) || sentenceResidueCount < 0) {
    return { reason: 'invalid-sentence-residue-count' };
  }
  return {
    reason: 'accepted',
    review: {
      reviewed,
      precision: reviewed > 0 ? precisionPassed / reviewed : 0,
      malformedCount,
      semanticDuplicateCount,
      platformResidueCount,
      sentenceResidueCount,
      reviewedAt,
      boardFingerprint,
    },
  };
}

export function parseLiveGoldenHumanReviewAttestation(
  value: unknown,
  rows: readonly MobileLiveGoldenBoardItem[],
  boardUpdatedAt: string | undefined,
  nowMs = Date.now(),
): LiveGoldenHumanReview | undefined {
  return evaluateLiveGoldenHumanReviewAttestation(value, rows, boardUpdatedAt, nowMs).review;
}

export function buildLiveGoldenSupplyReport(
  rows: readonly MobileLiveGoldenBoardItem[],
  options: LiveGoldenSupplyReportOptions = {},
): LiveGoldenSupplyReport {
  const nowMs = Number.isFinite(options.nowMs) ? Number(options.nowMs) : Date.now();
  const verifiedTarget = Math.max(1, Math.floor(options.verifiedTarget || 60));
  const minimumActiveCoreCategories = Math.max(
    1,
    Math.min(
      LIVE_GOLDEN_CORE_CATEGORY_POLICIES.length,
      Math.floor(options.minimumActiveCoreCategories || 10),
    ),
  );
  const list = Array.isArray(rows) ? rows : [];
  const verified = list.filter(isTrustedLiveGoldenSupplyRow);
  const counts: Record<string, number> = {};
  let unknownCategoryCount = 0;
  let staleVerifiedCount = 0;
  const coreKeys = new Set(LIVE_GOLDEN_CORE_CATEGORY_POLICIES.map((item) => item.key));

  for (const item of verified) {
    const key = liveGoldenPolicyKeyForDiscoveryId(item.category);
    if (!coreKeys.has(key)) {
      unknownCategoryCount += 1;
    } else {
      counts[key] = (counts[key] || 0) + 1;
    }
    const measuredAtMs = Date.parse(String(item.searchVolumeMeasuredAt || item.updatedAt || ''));
    if (
      !Number.isFinite(measuredAtMs)
      || measuredAtMs > nowMs + 5 * 60 * 1000
      || nowMs - measuredAtMs > MAX_VERIFIED_AGE_MS
    ) {
      staleVerifiedCount += 1;
    }
  }

  const categories = LIVE_GOLDEN_CORE_CATEGORY_POLICIES.map((item) => {
    const verifiedCount = counts[item.key] || 0;
    const share = verified.length > 0 ? verifiedCount / verified.length : 0;
    return {
      key: item.key,
      label: item.label,
      verifiedCount,
      minimumVerified: item.minimumVerified,
      deficit: Math.max(0, item.minimumVerified - verifiedCount),
      share: roundRate(share),
      maximumShare: item.maximumBoardShare,
    };
  });
  const activeCoreCategoryCount = categories.filter((item) => item.verifiedCount > 0).length;
  // Gate on the unrounded ratio. Rounding is presentation-only; otherwise a
  // value just above 18% can be displayed as 0.18 and incorrectly pass.
  const maximumCoreCategoryShareRaw = verified.length > 0
    ? Math.max(0, ...Object.values(counts)) / verified.length
    : 0;
  const measuredCompletenessRate = list.length > 0 ? verified.length / list.length : 0;
  const failureReasons: string[] = [];
  if (verified.length < verifiedTarget) failureReasons.push('verified-target-shortfall');
  if (activeCoreCategoryCount < minimumActiveCoreCategories) failureReasons.push('category-coverage-shortfall');
  if (maximumCoreCategoryShareRaw > 0.18) failureReasons.push('category-share-cap-exceeded');
  if (measuredCompletenessRate < 1) failureReasons.push('untrusted-row-present');
  if (unknownCategoryCount > 0) failureReasons.push('unknown-category-present');
  if (staleVerifiedCount > 0) failureReasons.push('stale-verified-row-present');
  const automatedSupplyGate = failureReasons.length === 0 ? 'pass' : 'fail';

  let superiorityGate: LiveGoldenSupplyReport['superiorityGate'] = automatedSupplyGate === 'pass'
    ? 'pending-human-review'
    : 'fail';
  const humanReview = options.humanReview;
  if (automatedSupplyGate === 'pass' && humanReview) {
    superiorityGate = humanReview.reviewed >= verified.length
      && humanReview.precision >= 0.9
      && humanReview.malformedCount === 0
      && humanReview.semanticDuplicateCount === 0
      && humanReview.platformResidueCount === 0
      && humanReview.sentenceResidueCount === 0
      ? 'pass'
      : 'fail';
  }

  return {
    generatedAt: new Date(nowMs).toISOString(),
    totalRows: list.length,
    verifiedCount: verified.length,
    untrustedCount: Math.max(0, list.length - verified.length),
    staleVerifiedCount,
    verifiedTarget,
    measuredCompletenessRate: roundRate(measuredCompletenessRate),
    activeCoreCategoryCount,
    minimumActiveCoreCategories,
    maximumCoreCategoryShare: roundRate(maximumCoreCategoryShareRaw),
    categories,
    unknownCategoryCount,
    failureReasons,
    automatedSupplyGate,
    superiorityGate,
    humanReview,
  };
}
