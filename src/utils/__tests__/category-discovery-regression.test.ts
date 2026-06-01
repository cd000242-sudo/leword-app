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
import { BLOGGER_CATEGORIES } from '../blogger-profile';
import { getSeedsForUserCategories } from '../sources/category-seed-catalog';

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

const supportIds = resolveDiscoveryCategoryIds('지원금');
assert('support-fund Korean alias resolves to policy', supportIds.includes('policy'), supportIds.join(','));

const starIds = resolveDiscoveryCategoryIds('스타');
assert('star Korean alias resolves to entertainment family',
  starIds.includes('celeb') && starIds.includes('broadcast') && starIds.includes('music'),
  starIds.join(','));

const fashionIds = resolveDiscoveryCategoryIds('fashion');
assert('fashion UI category keeps beauty sibling', fashionIds.includes('fashion') && fashionIds.includes('beauty'), fashionIds.join(','));

const shoppingIds = resolveDiscoveryCategoryIds('쇼핑');
assert('shopping category fans out to commerce categories',
  shoppingIds.includes('electronics') && shoppingIds.includes('fashion') && shoppingIds.includes('beauty'),
  shoppingIds.join(','));

const sidejobIds = resolveDiscoveryCategoryIds('N잡');
assert('sidejob Korean alias resolves to sidejob/business',
  sidejobIds.includes('sidejob') && sidejobIds.includes('business'),
  sidejobIds.join(','));

const weddingIds = resolveDiscoveryCategoryIds('결혼');
assert('wedding Korean alias resolves to wedding', weddingIds.includes('wedding'), weddingIds.join(','));

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

const celebSeeds = getDiscoveryCategorySeeds('celeb', 80);
assert('celeb category-only discovery has at least 30 seeds', celebSeeds.length >= 30, `${celebSeeds.length}`);
assert('celeb seeds preserve star/entertainment intent',
  celebSeeds.some(seed => /연예|아이돌|컴백|팬미팅|콘서트/.test(seed)),
  celebSeeds.slice(0, 12).join(', '));

const profileIds = BLOGGER_CATEGORIES.map(c => c.id);
assert('blogger profile exposes policy category', profileIds.includes('policy'), profileIds.join(','));
assert('blogger profile exposes celeb category', profileIds.includes('celeb'), profileIds.join(','));

const userPolicySeeds = getSeedsForUserCategories(['policy'], 40);
assert('user policy profile injects at least 30 support seeds', userPolicySeeds.length >= 30, `${userPolicySeeds.length}`);
assert('user policy seeds include official lookup intent',
  userPolicySeeds.some(seed => /보조금24|정부24|소상공인|근로장려금/.test(seed)),
  userPolicySeeds.slice(0, 12).join(', '));

const userCelebSeeds = getSeedsForUserCategories(['celeb'], 40);
assert('user celeb profile injects at least 30 star seeds', userCelebSeeds.length >= 30, `${userCelebSeeds.length}`);
assert('user celeb seeds include fast issue intent',
  userCelebSeeds.some(seed => /컴백|공식입장|근황|시상식/.test(seed)),
  userCelebSeeds.slice(0, 12).join(', '));

for (const category of BLOGGER_CATEGORIES) {
  const profileSeeds = getSeedsForUserCategories([category.id], 30);
  assert(`profile category ${category.id} injects 30+ seeds`,
    profileSeeds.length >= 30,
    `${category.label}: ${profileSeeds.length}`);

  const discoverySeeds = getDiscoveryCategorySeeds(category.id, 80);
  assert(`discovery category ${category.id} expands to 30+ seeds`,
    discoverySeeds.length >= 30,
    `${category.label}: ${discoverySeeds.length}`);
}

assert('health matcher accepts vitamin/ supplement keywords',
  matchesDiscoveryCategory('비타민D 영양제 추천', 'health'));
assert('policy matcher accepts support fund keywords',
  matchesDiscoveryCategory('소상공인 지원금 신청 조건', 'policy'));
assert('celeb matcher accepts star issue keywords',
  matchesDiscoveryCategory('아이돌 컴백 일정 팬미팅', 'celeb'));
assert('policy matcher rejects unrelated fashion keyword',
  !matchesDiscoveryCategory('여름 원피스 코디 추천', 'policy'));

console.log(`\n[category-discovery-regression.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
