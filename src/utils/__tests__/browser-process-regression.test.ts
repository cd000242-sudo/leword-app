/**
 * browser-process-regression.test.ts
 *
 * CPU/zombie-process regressions are usually caused by direct browser launches
 * bypassing the central Patchright-first browserPool. Keep active TS crawlers
 * on the pool path so quit cleanup can close them as one unit.
 */

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

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', '..', '..', rel), 'utf8');
}

function listTsFiles(dir: string): string[] {
  const full = path.join(__dirname, '..', '..', '..', dir);
  const out: string[] = [];
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const p = path.join(full, entry.name);
    if (entry.isDirectory()) out.push(...listTsFiles(path.join(dir, entry.name)));
    else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

const pool = read('src/utils/puppeteer-pool.ts');
const chromeFinder = read('src/utils/chrome-finder.ts');
const main = read('src/main.ts');
const cleaner = read('src/utils/chrome-zombie-cleaner.ts');
const serpCrawler = read('src/utils/serp-crawler.ts');
const daumRealtime = read('src/utils/daum-realtime-api.ts');
const exposureTracking = read('src/main/handlers/exposure-tracking.ts');
const premiumFeatures = read('src/main/premiumFeatures.ts');
const keywordDiscovery = read('src/main/handlers/keyword-discovery.ts');
const proTrafficHunter = read('src/utils/pro-traffic-keyword-hunter.ts');
const benchmarkSniper = read('src/utils/benchmark-sniper.ts');
const advancedBlogIndex = read('src/utils/blog-index-extractor-advanced.ts');
const rankTracker = read('src/utils/pro-hunter-v12/rank-tracker.ts');
const serpContentFetcher = read('src/utils/pro-hunter-v12/serp-content-fetcher.ts');
const smartblockParser = read('src/utils/pro-hunter-v12/smartblock-parser.ts');
const googleSerp = read('src/utils/pro-hunter-v12/google-serp.ts');
const nateRealtime = read('src/utils/nate-realtime-api.ts');
const googleTrends = read('src/utils/google-trends-api.ts');
const userProfile = read('src/utils/pro-hunter-v12/user-profile.ts');
const keywordCompetitionCrawlers = [
  read('src/utils/keyword-competition/naver-search-crawler.ts'),
  read('src/utils/keyword-competition/blog-visitor-crawler.ts'),
  read('src/utils/keyword-competition/blogdex-crawler.ts'),
  read('src/utils/keyword-competition/keyword-recommender.ts'),
];
const safePageCloseReleasePattern = /finally\s*\{\s*try\s*\{\s*await page\.close\(\);\s*\}\s*finally\s*\{\s*browserPool\.release\(browser\);/s;

assert('browser pool prefers patchright before playwright',
  pool.indexOf("await import('patchright')") >= 0
    && pool.indexOf("await import('playwright')") > pool.indexOf("await import('patchright')"),
  'patchright is not first');

assert('chrome finder checks packaged executable/resource layouts before Playwright default cache',
  /process\.resourcesPath/.test(chromeFinder)
    && /path\.dirname\(process\.execPath\)/.test(chromeFinder)
    && /app\.asar\.unpacked/.test(chromeFinder)
    && /resources['"], ['"]chromium/.test(chromeFinder),
  'bundled Chromium lookup is too narrow and can fall through to missing ms-playwright cache');

assert('chrome finder can reuse Playwright or Patchright cache only when an executable exists',
  /function findPlaywrightChromium/.test(chromeFinder)
    && /ms-playwright/.test(chromeFinder)
    && /patchright-core/.test(chromeFinder)
    && /findChromiumInPlatformDir/.test(chromeFinder),
  'existing Playwright/Patchright Chromium cache is not resolved as executablePath');

assert('compatible browser helper classifies launch errors instead of leaking raw Playwright install prompt',
  /catch \(err: any\)\s*\{\s*throw classifyLaunchError\(err, launchOptions\.executablePath\);/s.test(pool),
  'launchCompatibleBrowser can leak raw "npx playwright install" errors');

assert('compatible direct launches are tracked and destroyed with the pool',
  /const compatibleBrowserLaunches = new Set<any>\(\)/.test(pool)
    && /compatibleBrowserLaunches\.add\(browser\)/.test(pool)
    && /export async function destroyCompatibleBrowserLaunches/.test(pool)
    && /await destroyCompatibleBrowserLaunches\(\)/.test(pool),
  'launchCompatibleBrowser can create untracked browsers outside browserPool.destroy');

assert('active SERP crawler uses browserPool instead of direct Playwright singleton',
  !/from ['"]playwright['"]/.test(serpCrawler)
    && /browserPool\.acquire\(\)/.test(serpCrawler)
    && /browserPool\.release\(browser\)/.test(serpCrawler),
  'serp-crawler bypasses browserPool');

assert('Daum realtime crawler uses browserPool instead of direct Playwright singleton',
  !/from ['"]playwright['"]/.test(daumRealtime)
    && /browserPool\.acquire\(\)/.test(daumRealtime)
    && /browserPool\.release\(browser\)/.test(daumRealtime),
  'daum realtime bypasses browserPool');

assert('active realtime IPC uses axios ZUM crawler instead of legacy Puppeteer ZUM',
  !/zum-realtime-api/.test(keywordDiscovery)
    && !/getZumRealtimeKeywordsWithPuppeteer/.test(keywordDiscovery)
    && /getZumRealtimeKeywords\(limit\)/.test(keywordDiscovery),
  'keyword-discovery realtime IPC still imports legacy ZUM Puppeteer crawler');

assert('PRO multi-source hunter uses unified axios ZUM crawler instead of legacy Puppeteer ZUM',
  !/from ['"]\.\/zum-realtime-api['"]/.test(proTrafficHunter)
    && !/getZumRealtimeKeywordsWithPuppeteer/.test(proTrafficHunter)
    && /getZumRealtimeKeywords\(20\)/.test(proTrafficHunter),
  'PRO traffic multi-source still imports legacy ZUM Puppeteer crawler');

const directPlaywrightImports = listTsFiles('src')
  .filter(file => !file.includes(`${path.sep}__tests__${path.sep}`))
  .filter(file => !file.endsWith(`${path.sep}puppeteer-pool.ts`))
  .filter(file => /from ['"]playwright['"]|import\(['"]playwright['"]\)/.test(fs.readFileSync(file, 'utf8')));
assert('active TS source has no direct Playwright imports outside browserPool',
  directPlaywrightImports.length === 0,
  directPlaywrightImports.map(file => path.relative(path.join(__dirname, '..', '..', '..'), file)).join(', '));

const directCompatibleLaunches = listTsFiles('src')
  .filter(file => !file.includes(`${path.sep}__tests__${path.sep}`))
  .filter(file => !file.endsWith(`${path.sep}puppeteer-pool.ts`))
  .filter(file => /launchCompatibleBrowser/.test(fs.readFileSync(file, 'utf8')));
assert('active TS source has no compatible browser launches outside browserPool',
  directCompatibleLaunches.length === 0,
  directCompatibleLaunches.map(file => path.relative(path.join(__dirname, '..', '..', '..'), file)).join(', '));

assert('exposure tracking uses browserPool instead of a direct Playwright singleton',
  !/playwrightBrowser/.test(exposureTracking)
    && !/import\(['"]playwright['"]\)/.test(exposureTracking)
    && /browserPool\.acquire\(\)/.test(exposureTracking)
    && /browserPool\.release\(browser\)/.test(exposureTracking),
  'exposure tracking bypasses browserPool');

assert('premium competitor analysis features reuse browserPool',
  !/launchCompatibleBrowser/.test(premiumFeatures)
    && /browserPool\.acquire\(\)/.test(premiumFeatures)
    && /browserPool\.release\(browser\)/.test(premiumFeatures),
  'premiumFeatures spawns one-off browsers for competitor analysis');

assert('benchmark sniper reuses browserPool when it owns the browser',
  !/launchCompatibleBrowser/.test(benchmarkSniper)
    && /browserPool\.acquire\(\)/.test(benchmarkSniper)
    && /browserPool\.release\(browser\)/.test(benchmarkSniper),
  'benchmark sniper spawns one-off browsers during PRO benchmark analysis');

assert('advanced blog index extractor reuses browserPool instead of spawning compatible browsers',
  !/launchCompatibleBrowser/.test(advancedBlogIndex)
    && /browserPool\.acquire\(\)/.test(advancedBlogIndex)
    && /browserPool\.release\(browser\)/.test(advancedBlogIndex),
  'advanced blog index extractor spawns one-off browsers and can inflate CPU/process count');

assert('rank tracker reuses browserPool instead of spawning one browser per keyword',
  !/launchCompatibleBrowser/.test(rankTracker)
    && /browserPool\.acquire\(\)/.test(rankTracker)
    && /browserPool\.release\(browser\)/.test(rankTracker),
  'rank tracker bypasses browserPool and can inflate CPU/process count');

assert('SERP content fetcher reuses browserPool instead of spawning one browser per analysis',
  !/launchCompatibleBrowser/.test(serpContentFetcher)
    && /browserPool\.acquire\(\)/.test(serpContentFetcher)
    && /browserPool\.release\(browser\)/.test(serpContentFetcher),
  'SERP content fetcher bypasses browserPool and can inflate CPU/process count during deep analysis');

assert('SmartBlock parser reuses browserPool instead of spawning one browser per keyword',
  !/launchCompatibleBrowser/.test(smartblockParser)
    && /browserPool\.acquire\(\)/.test(smartblockParser)
    && /browserPool\.release\(browser\)/.test(smartblockParser),
  'SmartBlock parser bypasses browserPool and can inflate CPU/process count');

assert('Google SERP fallback reuses browserPool instead of spawning one browser per keyword',
  !/launchCompatibleBrowser/.test(googleSerp)
    && /browserPool\.acquire\(\)/.test(googleSerp)
    && /browserPool\.release\(browser\)/.test(googleSerp),
  'Google SERP fallback bypasses browserPool and can inflate CPU/process count');

assert('Nate realtime crawler uses browserPool instead of a private browser singleton',
  !/launchCompatibleBrowser/.test(nateRealtime)
    && !/let\s+browserInstance/.test(nateRealtime)
    && /browserPool\.acquire\(\)/.test(nateRealtime)
    && /browserPool\.release\(browser\)/.test(nateRealtime)
    && /browserPool\.closeIdle\(\)/.test(nateRealtime),
  'Nate realtime crawler owns a private browser and can leave zombie realtime processes');

assert('Google Trends fallback reuses browserPool instead of spawning one-off browsers',
  !/launchCompatibleBrowser/.test(googleTrends)
    && /browserPool\.acquire\(\)/.test(googleTrends)
    && /browserPool\.release\(browser\)/.test(googleTrends),
  'Google Trends fallback bypasses browserPool and can inflate CPU/process count');

assert('PRO user profile measurement reuses browserPool',
  !/launchCompatibleBrowser/.test(userProfile)
    && /browserPool\.acquire\(\)/.test(userProfile)
    && /browserPool\.release\(browser\)/.test(userProfile),
  'PRO user profile measurement spawns one-off browsers');

assert('keyword competition crawlers reuse browserPool and do not own browser singletons',
  keywordCompetitionCrawlers.every(source =>
    !/launchCompatibleBrowser/.test(source)
      && !/let\s+browserInstance/.test(source)
      && !/browserLastUsed|BROWSER_TIMEOUT/.test(source)
      && /browserPool\.acquire\(\)/.test(source)
      && /browserPool\.release\(browser\)/.test(source)
      && /browserPool\.closeIdle\(\)/.test(source)
      && safePageCloseReleasePattern.test(source)
  ),
  'keyword competition crawlers can leave private crawler browsers alive after analysis');

assert('quit path destroys browserPool and then cleans LEWORD chromium zombies',
  /browserPool\.destroy\(\)/.test(main)
    && /cleanupChromeZombies\(3000\)/.test(main)
    && /cleanupChromeZombiesSync\(1500\)/.test(main),
  'quit cleanup is not wired');

assert('chrome zombie cleaner only targets LEWORD chromium path',
  /\*leword\*chromium\*/i.test(cleaner)
    && /Get-Process chrome/.test(cleaner)
    && /Where-Object \{ \$_.Path/.test(cleaner),
  'cleaner may target user Chrome or miss bundled Chromium');

console.log(`\n[browser-process-regression.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
