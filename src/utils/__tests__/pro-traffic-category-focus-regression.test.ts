import * as fs from 'fs';
import * as path from 'path';

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

const sourcePath = path.join(__dirname, '..', 'pro-traffic-keyword-hunter.ts');
const source = fs.readFileSync(sourcePath, 'utf8');

assert('category filter returns matched only in focused PRO category mode',
  /if \(mode === 'category' && cat !== 'all' && cat !== 'pro_premium' && cat !== 'lite_standard'\) \{[\s\S]{0,240}return matched;[\s\S]{0,80}\}/.test(source));

assert('category top-up source is filtered by selected category',
  /const allSources = isFocusedCategoryModeForTopUp[\s\S]{0,180}allSourcesRaw\.filter\(r => isKeywordInSelectedCategory\(r\.keyword, category\)\)/.test(source));

assert('explosion final source does not reopen raw all-category verified pool in category mode',
  /const finalEnforceSourceExplosion = \(mode === 'category'[\s\S]{0,260}\.\.\.sortedAllFinalCandidates\][\s\S]{0,140}\.filter\(r => isKeywordInSelectedCategory\(r\.keyword, category\)\)/.test(source));

assert('main final source does not reopen raw all-category results in category mode',
  /const finalEnforceSource = \(mode === 'category'[\s\S]{0,220}\.\.\.sortedAllFinalCandidates\][\s\S]{0,140}\.filter\(r => isKeywordInSelectedCategory\(r\.keyword, category\)\)/.test(source));

assert('PRO entertainment categories hydrate live issue sources before static seeds',
  /const ENTERTAINMENT_DYNAMIC_CATEGORIES = \['celeb', 'broadcast', 'drama', 'movie', 'music'\]/.test(source)
    && /aggregateEntertainmentIssueSeeds/.test(source)
    && /fetchEntertainmentAggregate/.test(source)
    && /fetchStarNewsFresh/.test(source)
    && /\.\.\.ENTERTAINMENT_DYNAMIC_CATEGORIES/.test(source));

assert('PRO entertainment live seeds use issue-intent variants instead of commerce variants',
  /entertainmentSeedCategorySet\.has\(category\)[\s\S]{0,180}`\$\{name\} 근황`[\s\S]{0,80}`\$\{name\} 공식입장`/.test(source));

assert('PRO category mode absorbs category-first golden discovery plan',
  /import \{ buildCategoryFirstGoldenSeedPlan \} from '\.\/category-first-golden-discovery'/.test(source)
    && /getProTrafficCategoryGoldenSeedBudget/.test(source)
    && /getProTrafficCategoryDiscoverySeedBudget/.test(source)
    && /const categoryFirstGoldenPlan = buildCategoryFirstGoldenSeedPlan\(\{[\s\S]{0,180}maxSeeds: getProTrafficCategoryGoldenSeedBudget\(count\)[\s\S]{0,120}liveSeeds: DYNAMIC_TREND_SEEDS\[category\] \|\| \[\]/.test(source)
    && /const discoveryCategorySeeds = getDiscoveryCategorySeeds\(category, getProTrafficCategoryDiscoverySeedBudget\(count\)\)/.test(source)
    && /\.\.\.categoryFirstGoldenSeeds,\s*\.\.\.categoryKeywords,\s*\.\.\.unifiedSeeds,\s*\.\.\.discoveryCategorySeeds/.test(source),
  'PRO must be a strict superset of golden category discovery seeds');

assert('PRO category mode only injects profile evergreen seeds for the focused category',
  /filterFocusedProfileCategoryIds/.test(source)
    && /const focusedProfileCategories = filterFocusedProfileCategoryIds\(category, profile\.selectedCategories\)/.test(source)
    && /getSeedsForUserCategories\(focusedProfileCategories as any, 20\)/.test(source)
    && /불일치로 profile seed 생략/.test(source),
  'category mode still injects unrelated saved profile categories and wastes mining budget');

assert('PRO category mode scales seed target for large requested counts',
  /mode === 'category' \? getProTrafficCategoryNormalSeedTarget\(count\) : 100/.test(source),
  'category mode kept a fixed seed target and cannot satisfy 250-count hunts');

assert('legacy category-mixing fallback comment is removed',
  !source.includes('카테고리 혼입 + 검증 완화'));

assert('PRO dynamic SSS promotion scans past blocked top-N candidates',
  /selectProTrafficSssPromotionCandidates/.test(source)
    && /function promoteDynamicProTrafficSss/.test(source)
    && !/const dynamicSssCap\d* = Math\.min\(count, verifiedForSss\d*\.length\)/.test(source),
  'dynamic SSS labeling stopped at the first requested bucket instead of filling the SSS target');

console.log(`\n[pro-traffic-category-focus-regression.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
