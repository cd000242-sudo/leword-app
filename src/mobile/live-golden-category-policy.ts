export interface LiveGoldenCategoryPolicy {
  key: string;
  label: string;
  discoveryIds: readonly string[];
  minimumVerified: number;
  maximumBoardShare: number;
  demandWeight: number;
  quotaCostWeight: number;
}

export interface LiveGoldenCategoryRunStats {
  scans?: number;
  published?: number;
  failures?: number;
  lastScannedAtMs?: number;
  userDemandWeight?: number;
  quotaCostWeight?: number;
}

export interface LiveGoldenCategorySelectionInput {
  candidates?: readonly string[];
  boardCount: number;
  verifiedCounts: Record<string, number>;
  stats: Record<string, LiveGoldenCategoryRunStats | undefined>;
  nowMs: number;
  cursor?: number;
}

export interface LiveGoldenCategorySelection {
  discoveryId: string;
  policyKey: string;
  score: number;
  deficit: number;
  boardShare: number;
  reasons: string[];
}

const MINIMUM_VERIFIED_PER_CORE_CATEGORY = 4;
const MAXIMUM_CORE_CATEGORY_SHARE = 0.18;
const HOUR_MS = 60 * 60 * 1000;
const MAX_STALENESS_HOURS = 168;

function policy(
  key: string,
  label: string,
  discoveryIds: readonly string[],
  demandWeight = 1,
  quotaCostWeight = 1,
): LiveGoldenCategoryPolicy {
  return Object.freeze({
    key,
    label,
    discoveryIds: Object.freeze([...discoveryIds]),
    minimumVerified: MINIMUM_VERIFIED_PER_CORE_CATEGORY,
    maximumBoardShare: MAXIMUM_CORE_CATEGORY_SHARE,
    demandWeight,
    quotaCostWeight,
  });
}

export const LIVE_GOLDEN_CORE_CATEGORY_POLICIES: readonly LiveGoldenCategoryPolicy[] = Object.freeze([
  policy('policy', '정책·지원금', ['policy']),
  policy('finance_insurance', '금융·보험', ['finance', 'insurance_safe']),
  policy('health', '건강', ['health', 'hospital']),
  policy('education_jobs', '교육·취업', ['education', 'business', 'sidejob']),
  policy('it_ai', 'IT·AI', ['it', 'ai_tool', 'laptop', 'smartphone']),
  policy('home_life', '생활·주거', ['home_life', 'interior']),
  policy('travel', '국내외 여행', ['travel_domestic', 'travel_overseas']),
  policy('auto', '자동차', ['car', 'car_maintain']),
  policy('realestate', '부동산', ['realestate']),
  policy('parenting_pet', '육아·반려동물', ['parenting', 'baby_products', 'pet_dog', 'pet_cat', 'pet_etc']),
  policy('food_recipe', '음식·레시피', ['food', 'recipe']),
  policy('shopping_beauty', '쇼핑·뷰티', ['shopping', 'electronics', 'fashion', 'beauty', 'kitchen']),
]);

const POLICY_BY_DISCOVERY_ID = new Map<string, LiveGoldenCategoryPolicy>();
for (const item of LIVE_GOLDEN_CORE_CATEGORY_POLICIES) {
  for (const discoveryId of item.discoveryIds) {
    POLICY_BY_DISCOVERY_ID.set(discoveryId, item);
  }
}

// Classifiers used by older caches have a few semantically exact aliases that
// are not discovery lanes themselves. Map only those known aliases so they can
// count toward the same core policy without making the worker scan extra lanes.
const POLICY_ALIAS_TARGETS: Readonly<Record<string, string>> = Object.freeze({
  diet: 'food_recipe',
  job: 'education_jobs',
  self_development: 'education_jobs',
  app: 'it_ai',
  mental: 'health',
});
for (const [alias, policyKey] of Object.entries(POLICY_ALIAS_TARGETS)) {
  const target = LIVE_GOLDEN_CORE_CATEGORY_POLICIES.find((item) => item.key === policyKey);
  if (target) POLICY_BY_DISCOVERY_ID.set(alias, target);
}

export const LIVE_GOLDEN_DEFAULT_DISCOVERY_IDS: readonly string[] = Object.freeze(
  LIVE_GOLDEN_CORE_CATEGORY_POLICIES.flatMap((item) => item.discoveryIds),
);

export function resolveLiveGoldenCategoryPolicy(
  discoveryId: string | undefined | null,
): LiveGoldenCategoryPolicy | null {
  const normalized = String(discoveryId || '').trim();
  return POLICY_BY_DISCOVERY_ID.get(normalized) || null;
}

export function liveGoldenPolicyKeyForDiscoveryId(discoveryId: string | undefined | null): string {
  const normalized = String(discoveryId || '').trim() || 'all';
  return resolveLiveGoldenCategoryPolicy(normalized)?.key || normalized;
}

function finiteNonNegative(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function fallbackPolicy(discoveryId: string): LiveGoldenCategoryPolicy {
  return policy(discoveryId, discoveryId, [discoveryId]);
}

export function selectNextLiveGoldenDiscoveryCategory(
  input: LiveGoldenCategorySelectionInput,
): LiveGoldenCategorySelection {
  const candidates = [...new Set(
    (input.candidates?.length ? input.candidates : LIVE_GOLDEN_DEFAULT_DISCOVERY_IDS)
      .map((item) => String(item || '').trim())
      .filter(Boolean),
  )];
  if (candidates.length === 0) {
    return {
      discoveryId: 'all',
      policyKey: 'all',
      score: 0,
      deficit: 0,
      boardShare: 0,
      reasons: ['fallback'],
    };
  }

  const boardCount = Math.max(0, Math.floor(finiteNonNegative(input.boardCount)));
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
  const cursor = Math.max(0, Math.floor(finiteNonNegative(input.cursor))) % candidates.length;

  const ranked = candidates.map((discoveryId, index) => {
    const categoryPolicy = resolveLiveGoldenCategoryPolicy(discoveryId) || fallbackPolicy(discoveryId);
    const verified = Math.floor(finiteNonNegative(input.verifiedCounts[categoryPolicy.key]));
    const deficit = Math.max(0, categoryPolicy.minimumVerified - verified);
    const boardShare = boardCount > 0 ? verified / boardCount : 0;
    const categoryStats = input.stats[discoveryId] || {};
    const scans = finiteNonNegative(categoryStats.scans);
    const published = finiteNonNegative(categoryStats.published);
    const yieldRate = scans > 0 ? Math.min(1, published / scans) : 0;
    const lastScannedAtMs = finiteNonNegative(categoryStats.lastScannedAtMs);
    const stalenessHours = lastScannedAtMs > 0
      ? Math.min(MAX_STALENESS_HOURS, Math.max(0, nowMs - lastScannedAtMs) / HOUR_MS)
      : MAX_STALENESS_HOURS;
    const demandWeight = Math.max(0, categoryStats.userDemandWeight ?? categoryPolicy.demandWeight);
    const quotaCostWeight = Math.max(0, categoryStats.quotaCostWeight ?? categoryPolicy.quotaCostWeight);
    const overSharePenalty = boardShare > categoryPolicy.maximumBoardShare
      ? 2_000 + (boardShare - categoryPolicy.maximumBoardShare) * 1_000
      : 0;
    const failurePenalty = finiteNonNegative(categoryStats.failures) * 10;
    const score = (
      deficit * 300
      + stalenessHours * 2
      + yieldRate * 120
      + demandWeight * 40
      - quotaCostWeight * 30
      - overSharePenalty
      - failurePenalty
    );
    const reasons = [
      deficit > 0 ? 'category-deficit' : '',
      stalenessHours > 0 ? 'stale' : '',
      yieldRate > 0 ? 'recent-yield' : '',
      demandWeight > 1 ? 'user-demand' : '',
      overSharePenalty > 0 ? 'share-cap' : '',
    ].filter(Boolean);
    return {
      discoveryId,
      policyKey: categoryPolicy.key,
      score,
      deficit,
      boardShare,
      reasons,
      cursorDistance: (index - cursor + candidates.length) % candidates.length,
    };
  });

  ranked.sort((a, b) => {
    const deficitDelta = b.deficit - a.deficit;
    if (deficitDelta !== 0) return deficitDelta;
    const scoreDelta = b.score - a.score;
    if (Math.abs(scoreDelta) > 1e-9) return scoreDelta;
    if (a.cursorDistance !== b.cursorDistance) return a.cursorDistance - b.cursorDistance;
    return a.discoveryId.localeCompare(b.discoveryId);
  });
  const selected = ranked[0];
  return {
    discoveryId: selected.discoveryId,
    policyKey: selected.policyKey,
    score: Math.round(selected.score * 100) / 100,
    deficit: selected.deficit,
    boardShare: Math.round(selected.boardShare * 10_000) / 10_000,
    reasons: selected.reasons,
  };
}
