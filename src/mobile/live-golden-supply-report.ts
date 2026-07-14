import type { MobileLiveGoldenBoardItem } from './contracts';
import {
  hasTrustedDocumentCountMeasurement,
  hasTrustedSearchVolumeMeasurement,
} from './keyword-ai-judge';
import {
  LIVE_GOLDEN_CORE_CATEGORY_POLICIES,
  liveGoldenPolicyKeyForDiscoveryId,
} from './live-golden-category-policy';

export interface LiveGoldenSupplyReportOptions {
  nowMs?: number;
  verifiedTarget?: number;
  minimumActiveCoreCategories?: number;
  humanReview?: {
    reviewed: number;
    precision: number;
    malformedCount: number;
  };
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

function roundRate(value: number): number {
  return Math.round(Math.max(0, value) * 10_000) / 10_000;
}

export function isTrustedLiveGoldenSupplyRow(item: MobileLiveGoldenBoardItem): boolean {
  const pcSearchVolume = Number(item.pcSearchVolume);
  const mobileSearchVolume = Number(item.mobileSearchVolume);
  const hasMeasuredSplit = Number.isFinite(pcSearchVolume)
    && Number.isFinite(mobileSearchVolume)
    && pcSearchVolume + mobileSearchVolume > 0;
  return item.isMeasured !== false
    && hasMeasuredSplit
    && hasTrustedSearchVolumeMeasurement(item)
    && hasTrustedDocumentCountMeasurement(item);
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
    const updatedAtMs = Date.parse(String(item.updatedAt || ''));
    if (!Number.isFinite(updatedAtMs) || nowMs - updatedAtMs > MAX_VERIFIED_AGE_MS) {
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
