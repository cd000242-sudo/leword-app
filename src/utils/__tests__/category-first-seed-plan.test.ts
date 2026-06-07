/**
 * category-first-seed-plan.test.ts
 *
 * Category-first discovery must spend its early scan budget on the selected
 * category, not on unrelated live YouTube seeds.
 */

import { buildCategoryFirstGoldenSeedPlan } from '../category-first-golden-discovery';

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

const noisyLiveSeeds = [
  '방탄소년단',
  '미야오',
  '감정없는 사이코패스',
  'KBO 올스타전 티켓팅',
];

const policyPlan = buildCategoryFirstGoldenSeedPlan({
  category: '지원금/정책/복지',
  maxSeeds: 80,
  liveSeeds: noisyLiveSeeds,
});
const policyFirstTwenty = policyPlan.seeds.slice(0, 20).join('|');
assert(
  'policy category starts with policy seeds, not entertainment live seeds',
  /지원금|정책|복지|보조금|장려금|청년|소상공인/.test(policyFirstTwenty)
    && !/방탄소년단|미야오|사이코패스/.test(policyFirstTwenty),
  policyFirstTwenty
);

const sportsPlan = buildCategoryFirstGoldenSeedPlan({
  category: '스포츠',
  maxSeeds: 80,
  liveSeeds: noisyLiveSeeds,
});
const sportsFirstTwenty = sportsPlan.seeds.slice(0, 20).join('|');
assert(
  'sports category keeps relevant KBO live seed and drops unrelated entertainment seeds',
  sportsPlan.seeds.slice(0, 20).some(seed => seed.includes('KBO 올스타전 티켓팅'))
    && !/방탄소년단|미야오|사이코패스/.test(sportsFirstTwenty),
  sportsPlan.seeds.slice(0, 40).join('|')
);

const entertainmentPlan = buildCategoryFirstGoldenSeedPlan({
  category: '문화/엔터',
  maxSeeds: 80,
  liveSeeds: noisyLiveSeeds,
});
assert(
  'entertainment category may keep ambiguous YouTube live entity seeds',
  entertainmentPlan.seeds.some(seed => seed.includes('방탄소년단')),
  entertainmentPlan.seeds.slice(0, 40).join('|')
);

console.log(`\n[category-first-seed-plan.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
