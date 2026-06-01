/**
 * category-discovery-regression.test.ts
 *
 * Guards category-only golden discovery and PRO category hunting against
 * regressions where the UI category value does not inject enough real seeds.
 */

import {
  getDiscoveryCategorySeeds,
  matchesDiscoveryCategory,
  resolveDiscoveryCategoryIds,
} from '../category-discovery-map';

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

const policyIds = resolveDiscoveryCategoryIds('policy');
assert('policy id resolves directly', policyIds.includes('policy'), policyIds.join(','));

const fashionIds = resolveDiscoveryCategoryIds('fashion');
assert('fashion UI category keeps beauty sibling', fashionIds.includes('fashion') && fashionIds.includes('beauty'), fashionIds.join(','));

const shoppingIds = resolveDiscoveryCategoryIds('쇼핑');
assert('shopping category fans out to commerce categories',
  shoppingIds.includes('electronics') && shoppingIds.includes('fashion') && shoppingIds.includes('beauty'),
  shoppingIds.join(','));

const healthSeeds = getDiscoveryCategorySeeds('health', 80);
assert('health category-only discovery has at least 30 seeds', healthSeeds.length >= 30, `${healthSeeds.length}`);
assert('health seeds contain intent-expanded variants',
  healthSeeds.some(seed => /추천|비교|후기|방법/.test(seed)),
  healthSeeds.slice(0, 12).join(', '));

const policySeeds = getDiscoveryCategorySeeds('policy', 80);
assert('policy category-only discovery has at least 30 seeds', policySeeds.length >= 30, `${policySeeds.length}`);
assert('policy seeds preserve application/support intent',
  policySeeds.some(seed => /지원금|신청|조건|바우처/.test(seed)),
  policySeeds.slice(0, 12).join(', '));

assert('health matcher accepts vitamin/ supplement keywords',
  matchesDiscoveryCategory('비타민D 영양제 추천', 'health'));
assert('policy matcher accepts support fund keywords',
  matchesDiscoveryCategory('소상공인 지원금 신청 조건', 'policy'));
assert('policy matcher rejects unrelated fashion keyword',
  !matchesDiscoveryCategory('여름 원피스 코디 추천', 'policy'));

console.log(`\n[category-discovery-regression.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
