import {
  normalizeProTrafficResultCount,
  getProTrafficCategoryDiscoverySeedBudget,
  getProTrafficCategoryGoldenSeedBudget,
  getProTrafficCategoryNormalSeedTarget,
  getProTrafficFinalRerankPoolSize,
  getProTrafficCategoryMiningPoolSize,
  PRO_TRAFFIC_CATEGORY_SSS_FLOOR,
  PRO_TRAFFIC_MAX_RESULT_COUNT,
} from '../pro-traffic-floor';
import { GOLDEN_DISCOVERY_SSS_FLOOR } from '../golden-discovery-floor';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`FAIL ${name}${detail ? ' - ' + detail : ''}`);
  }
}

assert('category mode floors count to 30',
  normalizeProTrafficResultCount('category', 17) === PRO_TRAFFIC_CATEGORY_SSS_FLOOR);
assert('PRO category floor starts at the golden discovery SSS floor',
  PRO_TRAFFIC_CATEGORY_SSS_FLOOR === GOLDEN_DISCOVERY_SSS_FLOOR,
  `${PRO_TRAFFIC_CATEGORY_SSS_FLOOR} !== ${GOLDEN_DISCOVERY_SSS_FLOOR}`);
assert('PRO traffic hunter is the higher-capacity golden discovery successor',
  PRO_TRAFFIC_MAX_RESULT_COUNT >= GOLDEN_DISCOVERY_SSS_FLOOR * 8,
  `${PRO_TRAFFIC_MAX_RESULT_COUNT} < ${GOLDEN_DISCOVERY_SSS_FLOOR * 8}`);
assert('category mode keeps larger requested count',
  normalizeProTrafficResultCount('category', 80) === 80);
assert('category mode caps runaway count',
  normalizeProTrafficResultCount('category', 1000) === PRO_TRAFFIC_MAX_RESULT_COUNT);
assert('category mode accepts 250 requested count',
  normalizeProTrafficResultCount('category', 250) === 250);
assert('PRO realtime mode also floors to the golden discovery SSS floor',
  normalizeProTrafficResultCount('realtime', 3) === PRO_TRAFFIC_CATEGORY_SSS_FLOOR);
assert('PRO season mode also floors to the golden discovery SSS floor',
  normalizeProTrafficResultCount('season', 3) === PRO_TRAFFIC_CATEGORY_SSS_FLOOR);
assert('missing count defaults to 30 for handler-safe calls',
  normalizeProTrafficResultCount('category', undefined) === PRO_TRAFFIC_CATEGORY_SSS_FLOOR);
assert('250 requested count gets a 1000+ final rerank pool',
  getProTrafficFinalRerankPoolSize(250, false) >= 1000,
  `${getProTrafficFinalRerankPoolSize(250, false)}`);
assert('PRO 30-count mode reranks at least 12x the visible SSS floor',
  getProTrafficFinalRerankPoolSize(30, false) >= PRO_TRAFFIC_CATEGORY_SSS_FLOOR * 12,
  `${getProTrafficFinalRerankPoolSize(30, false)}`);
assert('PRO 250-count mode reranks 2000+ candidates as a golden-discovery supersetter',
  getProTrafficFinalRerankPoolSize(250, false) >= 2000,
  `${getProTrafficFinalRerankPoolSize(250, false)}`);
assert('250 explosion count also gets a 1000+ final rerank pool',
  getProTrafficFinalRerankPoolSize(250, true) >= 1000,
  `${getProTrafficFinalRerankPoolSize(250, true)}`);
assert('PRO category mode mines deeper than the visible 30 floor',
  getProTrafficCategoryMiningPoolSize(30, false) >= 200,
  `${getProTrafficCategoryMiningPoolSize(30, false)}`);
assert('PRO category 250 mode mines 1000+ category candidates before final display',
  getProTrafficCategoryMiningPoolSize(250, false) >= 1000,
  `${getProTrafficCategoryMiningPoolSize(250, false)}`);
assert('PRO category 250 mode mines 2000+ focused candidates before final display',
  getProTrafficCategoryMiningPoolSize(250, false) >= 2000,
  `${getProTrafficCategoryMiningPoolSize(250, false)}`);
assert('PRO explosion category mining remains deeper than ordinary display count',
  getProTrafficCategoryMiningPoolSize(50, true) >= 500,
  `${getProTrafficCategoryMiningPoolSize(50, true)}`);
assert('PRO category mode starts from at least the golden category-first seed budget',
  getProTrafficCategoryGoldenSeedBudget(30) >= 420,
  `${getProTrafficCategoryGoldenSeedBudget(30)}`);
assert('PRO category 250 mode expands golden category-first seeds as a true supersetter',
  getProTrafficCategoryGoldenSeedBudget(250) >= 2000,
  `${getProTrafficCategoryGoldenSeedBudget(250)}`);
assert('PRO category discovery-map budget never falls below the golden category-first floor',
  getProTrafficCategoryDiscoverySeedBudget(30) >= 420,
  `${getProTrafficCategoryDiscoverySeedBudget(30)}`);
assert('PRO category 250 mode keeps a deep discovery-map side pool',
  getProTrafficCategoryDiscoverySeedBudget(250) >= 1500,
  `${getProTrafficCategoryDiscoverySeedBudget(250)}`);
assert('PRO normal category mining keeps 420+ actual seeds before expansion',
  getProTrafficCategoryNormalSeedTarget(30) >= 420,
  `${getProTrafficCategoryNormalSeedTarget(30)}`);
assert('PRO normal category 250 mining keeps 600+ actual seeds before expansion',
  getProTrafficCategoryNormalSeedTarget(250) >= 600,
  `${getProTrafficCategoryNormalSeedTarget(250)}`);

console.log(`\n[pro-traffic-floor.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
