import {
  LIVE_GOLDEN_CORE_CATEGORY_POLICIES,
  LIVE_GOLDEN_DEFAULT_DISCOVERY_IDS,
  resolveLiveGoldenCategoryPolicy,
  selectNextLiveGoldenDiscoveryCategory,
} from '../../mobile/live-golden-category-policy';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

assert('live golden category policy has exactly twelve core product categories',
  LIVE_GOLDEN_CORE_CATEGORY_POLICIES.length === 12,
  LIVE_GOLDEN_CORE_CATEGORY_POLICIES.map((item) => item.key).join(','));

const requiredCoreKeys = [
  'policy',
  'finance_insurance',
  'health',
  'education_jobs',
  'it_ai',
  'home_life',
  'travel',
  'auto',
  'realestate',
  'parenting_pet',
  'food_recipe',
  'shopping_beauty',
];
assert('core category policy covers the approved twelve-category portfolio',
  requiredCoreKeys.every((key) => LIVE_GOLDEN_CORE_CATEGORY_POLICIES.some((item) => item.key === key)),
  LIVE_GOLDEN_CORE_CATEGORY_POLICIES.map((item) => item.key).join(','));

assert('default discovery schedule includes previously omitted expert categories',
  ['education', 'business', 'insurance_safe', 'car', 'car_maintain', 'realestate', 'parenting', 'pet_dog']
    .every((id) => LIVE_GOLDEN_DEFAULT_DISCOVERY_IDS.includes(id)),
  LIVE_GOLDEN_DEFAULT_DISCOVERY_IDS.join(','));

assert('every default discovery id resolves to one core product category',
  LIVE_GOLDEN_DEFAULT_DISCOVERY_IDS.every((id) => !!resolveLiveGoldenCategoryPolicy(id)),
  LIVE_GOLDEN_DEFAULT_DISCOVERY_IDS.filter((id) => !resolveLiveGoldenCategoryPolicy(id)).join(','));

const deficitChoice = selectNextLiveGoldenDiscoveryCategory({
  candidates: ['policy', 'education', 'car'],
  boardCount: 23,
  verifiedCounts: {
    policy: 18,
    education_jobs: 0,
    auto: 0,
  },
  stats: {
    policy: { scans: 20, published: 18, lastScannedAtMs: 900_000 },
    education: { scans: 1, published: 0, lastScannedAtMs: 950_000 },
    car: { scans: 1, published: 0, lastScannedAtMs: 990_000 },
  },
  nowMs: 1_000_000,
  cursor: 0,
});
assert('deficit scheduler refuses policy dominance even when policy yield is high',
  deficitChoice.discoveryId === 'education'
    && deficitChoice.policyKey === 'education_jobs'
    && deficitChoice.reasons.includes('category-deficit'),
  JSON.stringify(deficitChoice));

const strictDeficitChoice = selectNextLiveGoldenDiscoveryCategory({
  candidates: ['finance', 'health'],
  boardCount: 7,
  verifiedCounts: {
    finance_insurance: 1,
    health: 0,
  },
  stats: {
    finance: { scans: 20, published: 20, lastScannedAtMs: 1 },
    health: { scans: 1, published: 0, lastScannedAtMs: 999_999_999 },
  },
  nowMs: 1_000_000_000,
  cursor: 0,
});
assert('larger verified deficit is a hard priority over recent yield and staleness bonuses',
  strictDeficitChoice.discoveryId === 'health'
    && strictDeficitChoice.deficit === 4,
  JSON.stringify(strictDeficitChoice));

const staleChoice = selectNextLiveGoldenDiscoveryCategory({
  candidates: ['education', 'car'],
  boardCount: 8,
  verifiedCounts: { education_jobs: 4, auto: 4 },
  stats: {
    education: { scans: 2, published: 1, lastScannedAtMs: 100_000 },
    car: { scans: 2, published: 1, lastScannedAtMs: 900_000 },
  },
  nowMs: 1_000_000,
  cursor: 0,
});
assert('staleness breaks equal-deficit categories deterministically',
  staleChoice.discoveryId === 'education' && staleChoice.reasons.includes('stale'),
  JSON.stringify(staleChoice));

const tieA = selectNextLiveGoldenDiscoveryCategory({
  candidates: ['car', 'car_maintain'],
  boardCount: 0,
  verifiedCounts: {},
  stats: {},
  nowMs: 1_000_000,
  cursor: 1,
});
const tieB = selectNextLiveGoldenDiscoveryCategory({
  candidates: ['car', 'car_maintain'],
  boardCount: 0,
  verifiedCounts: {},
  stats: {},
  nowMs: 1_000_000,
  cursor: 1,
});
assert('category scheduling is deterministic and cursor-aware without Math.random',
  tieA.discoveryId === 'car_maintain'
    && tieB.discoveryId === tieA.discoveryId
    && tieB.score === tieA.score,
  `${JSON.stringify(tieA)}:${JSON.stringify(tieB)}`);

console.log('[live-golden-category-policy.test] passed');

export {};
