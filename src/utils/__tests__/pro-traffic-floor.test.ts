import {
  normalizeProTrafficResultCount,
  getProTrafficFinalRerankPoolSize,
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
assert('realtime mode keeps small count at 5+',
  normalizeProTrafficResultCount('realtime', 3) === 5);
assert('missing count defaults to 30 for handler-safe calls',
  normalizeProTrafficResultCount('category', undefined) === PRO_TRAFFIC_CATEGORY_SSS_FLOOR);
assert('250 requested count gets a 1000+ final rerank pool',
  getProTrafficFinalRerankPoolSize(250, false) >= 1000,
  `${getProTrafficFinalRerankPoolSize(250, false)}`);
assert('250 explosion count also gets a 1000+ final rerank pool',
  getProTrafficFinalRerankPoolSize(250, true) >= 1000,
  `${getProTrafficFinalRerankPoolSize(250, true)}`);

console.log(`\n[pro-traffic-floor.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
