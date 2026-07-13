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

const htmlPath = path.join(__dirname, '..', '..', '..', 'ui', 'keyword-master.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const keywordExpansionSearchBlock = html.match(/window\.handleKeywordExpansionSearch\s*=\s*async function[\s\S]*?function displayKeywordResults/)?.[0] || '';
const categoryGoldenDiscoveryBlock = html.match(/window\.startKeywordDiscovery\s*=\s*async function[\s\S]*?window\.stopKeywordDiscovery/)?.[0] || '';
const proTrafficCountSelect = html.match(/<select id="proTrafficCount"[\s\S]*?<\/select>/)?.[0] || '';
const sourceSignals = fs.readFileSync(path.join(__dirname, '..', '..', 'main', 'handlers', 'source-signals.ts'), 'utf8');
const apiServer = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'apps', 'api', 'src', 'server.ts'), 'utf8');
const premiumHunting = fs.readFileSync(path.join(__dirname, '..', '..', 'main', 'handlers', 'premium-hunting.ts'), 'utf8');
const configUtility = fs.readFileSync(path.join(__dirname, '..', '..', 'main', 'handlers', 'config-utility.ts'), 'utf8');
const keywordAnalysis = fs.readFileSync(path.join(__dirname, '..', '..', 'main', 'handlers', 'keyword-analysis.ts'), 'utf8');
const keywordDiscovery = fs.readFileSync(path.join(__dirname, '..', '..', 'main', 'handlers', 'keyword-discovery.ts'), 'utf8');
const exposureTracking = fs.readFileSync(path.join(__dirname, '..', '..', 'main', 'handlers', 'exposure-tracking.ts'), 'utf8');
const bloggerProfile = fs.readFileSync(path.join(__dirname, '..', 'blogger-profile.ts'), 'utf8');
const categoriesSource = fs.readFileSync(path.join(__dirname, '..', 'categories.ts'), 'utf8');
const mdpEngine = fs.readFileSync(path.join(__dirname, '..', 'mdp-engine.ts'), 'utf8');
const richFeedBuilder = fs.readFileSync(path.join(__dirname, '..', 'sources', 'rich-feed-builder.ts'), 'utf8');
const richFeedSectionBlock = html.match(/<div id="richFeedSection"[\s\S]*?<script>/)?.[0] || '';
const richFeedRefreshBlock = html.match(/async function refreshRichFeed[\s\S]*?function renderRichFeedTabs/)?.[0] || '';
const richFeedIpcBlock = sourceSignals.match(/ipcMain\.handle\('get-rich-golden-feed'[\s\S]*?ipcMain\.handle\('rich-feed-clear-cache'/)?.[0] || '';
const richFeedTableBlock = html.match(/function renderRichFeedTable[\s\S]*?window\.rfReportInaccurate/)?.[0] || '';
const richFeedTopPicksBlock = html.match(/window\.rfRenderTopPicks[\s\S]*?const RF_EXCLUDE_KEY/)?.[0] || '';

assert('keyword analyzer default option is 10',
  /name="keywordLimit"\s+value="10"\s+checked/.test(html),
  'keywordLimit checked value is not 10');

assert('keyword analyzer JS fallback defaults to 10',
  /const\s+limitValue\s*=\s*limitRadio\?\.value\s*\|\|\s*'10'/.test(html),
  'limitValue fallback is not 10');

assert('rich golden feed auto-loads the server board without a manual click',
  /function\s+startRichFeedAutoLive\(\)/.test(html)
    && /document\.addEventListener\('DOMContentLoaded',\s*startRichFeedAutoLive,\s*\{\s*once:\s*true\s*\}\)/.test(html)
    && /setTimeout\(\(\)\s*=>\s*refreshRichFeed\(false\),\s*900\)/.test(html)
    && /setInterval\(\(\)\s*=>\s*\{[\s\S]{0,120}refreshRichFeed\(false\)/.test(html)
    && /window\.__rfRefreshRunning/.test(richFeedRefreshBlock),
  'rich feed can still sit idle until the user presses refresh');

assert('rich golden feed table removes CPC from the visible UI',
  !/>CPC<\/th>/.test(richFeedSectionBlock)
    && !/네이버 검색광고 API 실측 평균 입찰가/.test(richFeedSectionBlock)
    && !/cpcTxt/.test(richFeedTopPicksBlock)
    && !/\(r\.cpc\s*\|\|\s*0\)\s*>=/.test(richFeedTopPicksBlock),
  'CPC is still visible or still gating the rich feed top picks');

assert('rich golden feed keeps the row layout horizontal and shows 60 rows per page',
  /const\s+RF_PAGE_SIZE\s*=\s*60/.test(html)
    && /class="rf-keyword-cell"/.test(richFeedTableBlock)
    && /class="rf-keyword-line"/.test(richFeedTableBlock)
    && /class="rf-keyword-main"/.test(richFeedTableBlock)
    && /class="rf-source-line"/.test(richFeedTableBlock)
    && /colspan="10"/.test(richFeedSectionBlock)
    && /colspan="10"/.test(richFeedRefreshBlock)
    && /colspan="10"/.test(richFeedTableBlock),
  'rich feed can still wrap keyword text vertically or keep the old 11/12-column layout');

assert('rich feed cache refuses underfilled three-row results',
  /cached\.result\.total\s*>=\s*MIN_ACCEPTABLE_TOTAL/.test(richFeedBuilder)
    && /const\s+MIN_ACCEPTABLE_TOTAL\s*=\s*30/.test(richFeedBuilder),
  'underfilled rich feed cache can still be reused as a valid result');

assert('rich feed separates scan budget from visible precision and bulk targets',
  /const\s+visibleTarget\s*=\s*isBulkMode\s*\?\s*60\s*:\s*30/.test(richFeedBuilder)
    && /const\s+minReturnCount\s*=\s*Math\.min\(limit,\s*visibleTarget\)/.test(richFeedBuilder)
    && /selectBalancedTopRows\(\s*enrichedRows,\s*minReturnCount/.test(richFeedBuilder),
  'rich feed can still expose scan limit instead of precision 30 / bulk 60 targets');

assert('rich feed keeps measured SS/S/A precision backfill instead of returning three rows',
  /isPrecisionVerificationCandidate/.test(richFeedBuilder)
    && /isEmergencyPrecisionFloorCandidate/.test(richFeedBuilder)
    && /!\s*isBulkMode\s*&&\s*\(precisionBackfillTier\(r\)\s*>\s*0\s*\|\|\s*isPrecisionVerificationCandidate\(r\)\)/.test(richFeedBuilder)
    && /!\s*isBulkMode\s*&&\s*precisionBackfillTier\(r\)\s*>\s*0/.test(richFeedBuilder)
    && /precisionBackupMap/.test(richFeedBuilder)
    && /precisePrimaryRows/.test(richFeedBuilder)
    && /selectPrecisionRowsWithBackfill\(precisePrimaryRows,\s*Array\.from\(precisionBackupMap\.values\(\)\)/.test(richFeedBuilder)
    && /precision emergency floor/.test(richFeedBuilder)
    && /clonePrecisionBackfillRow\(row\)/.test(richFeedBuilder),
  'measured SS/S/A backfill candidates can still be dropped before the 30-row floor');

assert('rich feed balanced mode has fast live-discovery budgets and early stop',
  /const\s+HARD_CAP_MS\s*=\s*\(isBulkMode\s*\?\s*4\s*:\s*3\)\s*\*\s*60\s*\*\s*1000/.test(richFeedBuilder)
    && /const\s+AC_TOP_N\s*=\s*isBulkMode\s*\?\s*80\s*:\s*35/.test(richFeedBuilder)
    && /const\s+datalabCategoryLimit\s*=\s*isBulkMode\s*\?\s*orderedCats\.length\s*:\s*Math\.min\(6,\s*orderedCats\.length\)/.test(richFeedBuilder)
    && /const\s+qualityRowsReadyTarget\s*=/.test(richFeedBuilder)
    && /qualityRowsReady\(\)/.test(richFeedBuilder)
    && /!\s*isBulkMode\s*&&\s*isPrecisionVerificationCandidate\(r\)/.test(richFeedBuilder)
    && /API early stop/.test(richFeedBuilder),
  'balanced rich feed can still spend minutes scanning after enough quality candidates are ready');

assert('rich feed injects realtime news policy and youtube seeds before measurement',
  /live-issue-seed/.test(richFeedBuilder)
    && /getNaverRealtimeKeywords/.test(richFeedBuilder)
    && /fetchEntertainmentAggregate/.test(richFeedBuilder)
    && /getNaverNewsRankingKeywords/.test(richFeedBuilder)
    && /getPolicyBriefingKeywords/.test(richFeedBuilder)
    && /getYouTubeTrendKeywords/.test(richFeedBuilder),
  'rich feed can still miss live issue/news/policy/youtube seeds before measuring golden candidates');

assert('desktop golden feed only reads the 24-hour server snapshot',
  /fetchLiveGoldenBoardSnapshot/.test(richFeedIpcBlock)
    && /snapshot\.board/.test(richFeedIpcBlock)
    && !/discoverDirectGoldenKeywords|getCachedRichFeed|collectDirectGoldenLiveSeeds/.test(richFeedIpcBlock)
    && !/rfUseClaude|rfDiscoveryMode|blogger-profile-get/.test(richFeedRefreshBlock)
    && /서버 보드/.test(richFeedRefreshBlock),
  'desktop refresh can still start a local discovery or AI augmentation run');

assert('operator ingest credentials can read but never run the live golden board',
  /isLiveGoldenIngestRequestAuthorized/.test(apiServer)
    && /GET[\s\S]{0,180}MOBILE_LIVE_GOLDEN_ROUTES\.snapshot[\s\S]{0,420}isLiveGoldenIngestRequestAuthorized/.test(apiServer)
    && !/POST[\s\S]{0,180}MOBILE_LIVE_GOLDEN_ROUTES\.run[\s\S]{0,420}isLiveGoldenIngestRequestAuthorized/.test(apiServer),
  'desktop operator token cannot read the snapshot safely or can trigger a server run');

assert('keyword lookup and category auto golden discovery have separate buttons and actions',
  /id="keywordLookupBtn"[\s\S]{0,220}onclick="startKeywordLookupFromInput\(\)"/.test(html)
    && /id="categoryGoldenDiscoveryBtn"[\s\S]{0,260}onclick="startKeywordDiscovery\(\)"/.test(html)
    && /카테고리별 자동/.test(html)
    && /window\.startKeywordLookupFromInput\s*=\s*function/.test(html)
    && /const\s+discoveryBtn\s*=\s*document\.getElementById\('keywordLookupBtn'\)/.test(keywordExpansionSearchBlock)
    && /const\s+categoryGoldenDiscoveryBtn\s*=\s*document\.getElementById\('categoryGoldenDiscoveryBtn'\)/.test(keywordExpansionSearchBlock)
    && /const\s+discoveryBtn\s*=\s*document\.getElementById\('categoryGoldenDiscoveryBtn'\)/.test(categoryGoldenDiscoveryBlock)
    && /const\s+keywordLookupBtn\s*=\s*document\.getElementById\('keywordLookupBtn'\)/.test(categoryGoldenDiscoveryBlock)
    && /handleKeywordExpansionSearch\(keyword,\s*maxCount\)/.test(html)
    && /const\s+keywordLookupBtn\s*=\s*document\.getElementById\('keywordLookupBtn'\)[\s\S]{0,260}keywordLookupBtn\.click\(\)/.test(html)
    && !/const\s+discoveryBtn\s*=\s*document\.getElementById\('discoveryBtn'\)[\s\S]{0,220}discoveryBtn\.click\(\)/.test(html),
  'keyword lookup can still be routed into category golden discovery');

assert('PRO traffic UI exposes 250 result option',
  /<option\s+value="250"[^>]*>250개/.test(html),
  '250 option missing');

assert('PRO traffic UI starts at the 30 SSS category floor',
  /<option\s+value="30"/.test(proTrafficCountSelect)
    && !/<option\s+value="10"/.test(proTrafficCountSelect)
    && !/<option\s+value="20"/.test(proTrafficCountSelect),
  'PRO count picker must not offer counts below the category SSS floor');

assert('PRO traffic UI positions the feature as golden discovery super-upgrade',
  /황금키워드 발굴기의 초상위호환/.test(html)
    && /최대 250개 SSS 후보/.test(html)
    && /황금키워드 분석기가 놓치는 키워드/.test(html),
  'PRO super-upgrade positioning copy missing');

assert('PRO traffic UI clamps requested count to 250',
  /Math\.min\(250,\s*Math\.floor\(countNum\)\)/.test(html),
  'UI clamp is not 250');

assert('PRO traffic keeps high-count category hunting in deep mode unless explicitly requested',
  /fastDiscovery:\s*\(options as any\)\.fastDiscovery\s*===\s*true/.test(premiumHunting)
    && !/fastDiscovery:\s*\(options as any\)\.fastDiscovery\s*===\s*true\s*\|\|\s*requestedCount\s*>=\s*50/.test(premiumHunting),
  'high requested counts must not auto-enable fastDiscovery');

assert('PRO traffic UI does not auto-send fastDiscovery for 50+ requests',
  /fastDiscovery:\s*false/.test(html)
    && !/fastDiscovery:\s*count\s*>=\s*50/.test(html),
  'UI must keep 50/100/250 requests on the deep mining path');

assert('PRO traffic category picker syncs from backend category enum',
  /refreshProTrafficCategoriesFromBackend/.test(html)
    && /get-pro-traffic-categories/.test(html)
    && /renderProTrafficCategoryOptions/.test(html)
    && /await refreshProTrafficCategoriesFromBackend\(\)/.test(html)
    && /await originalOpenProTrafficModal\(\)/.test(html),
  'PRO category picker is still static-only and can drift from backend categories');

assert('PRO traffic category icons cover entertainment issue categories',
  ['drama', 'anime', 'broadcast', 'celeb'].every(id => new RegExp(`${id}:\\s*['"]`).test(categoriesSource)),
  'entertainment category icons missing from CATEGORY_ICONS');

assert('PRO traffic defaults to category-focus mode',
  /name="proTrafficMode"\s+value="category"\s+checked/.test(html)
    && /카테고리 하나를 깊게 파서/.test(html),
  'PRO traffic modal does not default to focused category hunting');

assert('PRO traffic requires one category before category hunting',
  /id="proTrafficCategory"[\s\S]*카테고리 먼저 선택/.test(html)
    && /mode\s*===\s*'category'\s*&&\s*!category/.test(html)
    && /카테고리 하나를 먼저 선택해야/.test(html)
    && /requestedMode\s*===\s*'category'[\s\S]*requestedCategory\s*===\s*'all'/.test(premiumHunting),
  'PRO traffic category guard missing');

assert('golden discovery category picker is optional and defaults to all categories',
  /<option\s+value=""\s+selected[^>]*>전체 카테고리에서 찾기<\/option>/.test(html)
    && /카테고리 선택 시 집중 발굴/.test(html)
    && /키워드를 넣으면 전체\/선택 카테고리에서 분석/.test(html)
    && !/먼저 황금키워드를 발굴할 카테고리를 선택해주세요/.test(html),
  'golden discovery still requires category selection');

assert('golden discovery sends optional category mode to backend',
  /categoryFirst:\s*!!category/.test(html)
    && /requireCategory:\s*false/.test(html)
    && /requireCategory=true 요청이지만 카테고리가 없어 전체 카테고리 발굴로 전환/.test(keywordDiscovery)
    && !/return\s*\{\s*success:\s*false,\s*keywords:\s*\[\],\s*error:\s*'카테고리를 먼저 선택해주세요\.'/.test(keywordDiscovery),
  'optional category backend flow is missing');

assert('golden discovery sends quick preview flag for 10-result sample mode',
  /const\s+quickPreview\s*=\s*maxCount\s*!==\s*null\s*&&\s*maxCount\s*>\s*0\s*&&\s*maxCount\s*<\s*30/.test(html)
    && /quickPreview,/.test(html),
  '10-result category discovery can silently run the deep 30-SSS path');

assert('golden discovery backend honors explicit 10-result quick preview requests',
  /const\s+quickPreview\s*=\s*hasExplicitLimit[\s\S]{0,160}rawLimit\s*<\s*30[\s\S]{0,120}actualOptions\.quickPreview\s*!==\s*false/.test(keywordDiscovery)
    && /resolveGoldenDiscoveryTarget\(effectiveLimit,\s*\{\s*honorRequestedLimit:\s*quickPreview\s*\}\)/.test(keywordDiscovery)
    && !/Math\.max\(category\s*\?\s*30\s*:\s*1,\s*rawLimit\)/.test(keywordDiscovery),
  'backend still floors category quick-preview requests to 30');

assert('seedless 10-result golden discovery takes the ultra-fast path',
  /const\s+seedlessQuickPreview\s*=\s*quickPreview\s*&&\s*!\s*String\(actualKeyword\s*\|\|\s*''\)\.trim\(\)/.test(keywordDiscovery)
    && /quickPreview\s*&&\s*!\s*cachedSignals[\s\S]{0,160}외부 트렌드 대기 없이 바로 검증/.test(keywordDiscovery)
    && /seedlessQuickPreview\s*\?\s*120/.test(keywordDiscovery)
    && /const\s+quickLiveSeedTimeoutMs\s*=\s*quickPreview[\s\S]{0,120}seedlessQuickPreview\s*\?\s*1000\s*:\s*1200[\s\S]{0,80}3500/.test(keywordDiscovery)
    && /const\s+effectiveScanLimit\s*=\s*quickPreview[\s\S]{0,120}Math\.min\(seedlessQuickPreview\s*\?\s*180\s*:\s*240,\s*scanLimit\)/.test(keywordDiscovery)
    && /maxProcessedSeeds:\s*seedlessQuickPreview[\s\S]{0,180}Math\.min\(discoverySeedCount,\s*seedlessQuickPreview\s*\?\s*14\s*:\s*24\)/.test(keywordDiscovery),
  'empty-seed 10-result mode can still wait on deep category discovery budgets');

assert('golden discovery injects fresh issue radar seeds into MDP discovery',
  /buildFreshIssueGoldenSeeds/.test(keywordDiscovery)
    && /externalSignalMapForSeeds\s*=\s*sigMap/.test(keywordDiscovery)
    && /freshIssueSeedRecords/.test(keywordDiscovery)
    && /combinedDiscoverySeeds/.test(keywordDiscovery)
    && /seedKeywords:\s*categoryFirstMode[\s\S]{0,260}combinedDiscoverySeeds/.test(keywordDiscovery)
    && /freshIssueSeedCount/.test(keywordDiscovery)
    && /급상승\s*\$\{freshIssueSeedRecords\.length\}개/.test(keywordDiscovery),
  'daily fresh issue signals can still remain score-only instead of becoming discovery seeds');

assert('category golden discovery collects realtime and news seeds before MDP discovery',
  /collectCategoryFirstLiveSeeds/.test(keywordDiscovery)
    && /getNaverRealtimeKeywords\(/.test(keywordDiscovery)
    && /getNaverNewsRankingKeywords\(/.test(keywordDiscovery)
    && /const\s+liveCategorySeeds\s*=\s*categoryFirstMode[\s\S]{0,280}collectCategoryFirstLiveSeeds/.test(keywordDiscovery)
    && /buildCategoryFirstGoldenSeedPlan\(\{[\s\S]{0,220}liveSeeds:\s*liveCategorySeeds/.test(keywordDiscovery),
  'category golden discovery can still rely only on static category seeds');

assert('golden discovery final output requires beginner-actionable keyword intent',
  /requireActionableIntent\?:\s*boolean/.test(fs.readFileSync(path.join(__dirname, '..', 'golden-discovery-floor.ts'), 'utf8'))
    && /isActionableGoldenKeyword/.test(fs.readFileSync(path.join(__dirname, '..', 'golden-discovery-floor.ts'), 'utf8'))
    && /KOREAN_RE/.test(fs.readFileSync(path.join(__dirname, '..', 'golden-discovery-floor.ts'), 'utf8'))
    && /SEMI_LARGE_COMPACT_RE/.test(fs.readFileSync(path.join(__dirname, '..', 'golden-discovery-floor.ts'), 'utf8'))
    && /createGoldenSssTargetTracker\(sssTarget,[\s\S]{0,220}requireActionableIntent:\s*true/.test(keywordDiscovery)
    && /rankGoldenDiscoveryResults\([\s\S]{0,320}strictVisibleSssOnly:\s*true,[\s\S]{0,80}requireActionableIntent:\s*true/.test(keywordDiscovery)
    && /rankGoldenDiscoveryResults\([\s\S]{0,320}strictVisibleSssOnly:\s*true,[\s\S]{0,80}requireActionableIntent:\s*true/.test(keywordAnalysis),
  'SSS output can still expose broad bare keywords that beginners cannot write immediately');

assert('MDP SSS results pass the golden precision gate before yield',
  /assessGoldenKeywordPrecision/.test(mdpEngine)
    && /const\s+precision\s*=\s*assessGoldenKeywordPrecision\(\{[\s\S]{0,260}keyword:\s*sig\.keyword/.test(mdpEngine)
    && /if\s*\(!precision\.ok\)\s*\{[\s\S]{0,120}if\s*\(!includeMeasuredFallback\)\s*continue/.test(mdpEngine)
    && /grade\s*=\s*'B'/.test(mdpEngine),
  'SSS candidates can still bypass semantic precision checks');

assert('golden discovery backfills category shortages from other categories with explicit supplement tags',
  /getCrossCategoryDiscoverySeeds/.test(keywordDiscovery)
    && /shouldRunCrossCategorySupplement/.test(keywordDiscovery)
    && /crossCategorySupplement:\s*true/.test(keywordDiscovery)
    && /primaryCategoryMatched:\s*false/.test(keywordDiscovery)
    && /crossCategorySupplementCount/.test(keywordDiscovery)
    && /보충/.test(html)
    && /item\.crossCategorySupplement/.test(html),
  'category shortage backfill can disappear or become indistinguishable in the UI');

assert('golden discovery writes live progress events into the visible log panel',
  /window\.lewordLastGoldenDiscoveryProgressLog/.test(html)
    && /window\.addProgressLog\(msg,\s*logType\)/.test(html)
    && /cleanupProgress\s*=\s*window\.electronAPI\.on\('keyword-discovery-progress'/.test(html)
    && /finally\s*\{[\s\S]{0,240}cleanupProgress\?\.\(\)/.test(html)
    && /window\.startLewordHeartbeat/.test(html)
    && /window\.stopLewordHeartbeat/.test(html),
  'golden discovery progress logs, heartbeat, or listener cleanup are missing');

assert('golden discovery backend emits scan-stage progress instead of waiting for result chunks',
  /sendDiscoveryProgress\(/.test(keywordDiscovery)
    && /외부 트렌드 신호/.test(keywordDiscovery)
    && /시드 \$\{discoverySeedCount\}개 확보[\s\S]{0,120}급상승/.test(keywordDiscovery)
    && /discoveryOptions\.onProgress\s*=/.test(keywordDiscovery)
    && /maxCheckedSignals:\s*effectiveScanLimit/.test(keywordDiscovery),
  'golden discovery backend progress events are too sparse');

assert('MDP category discovery reports progress and filters category before SERP lookup',
  /onProgress\?: \(progress: MDPDiscoverProgress\) => void/.test(mdpEngine)
    && /maxCheckedSignals\?:\s*number/.test(mdpEngine)
    && /checkedSignals\s*<\s*maxCheckedSignals/.test(mdpEngine)
    && /private\s+reportProgress\(options:\s*MDPDiscoverOptions,\s*progress:\s*MDPDiscoverProgress\)/.test(mdpEngine)
    && /phase:\s*'batch'/.test(mdpEngine)
    && /const\s+detectedCategory\s*=\s*classifyKeyword\(sig\.keyword\)\.primary;[\s\S]{0,320}const\s+categoryMatched\s*=[\s\S]{0,260}if\s*\(!categoryMatched\s*&&\s*!includeMeasuredFallback\)[\s\S]{0,420}const\s+serpSignal\s*=\s*this\.getNeutralSerpSignal\(\)/.test(mdpEngine),
  'MDP progress callback or category-before-SERP optimization is missing');

assert('MDP quick preview trims pattern batches and skips slow SERP detail',
  /fastPreview\?:\s*boolean/.test(mdpEngine)
    && /const\s+fastPreview\s*=\s*options\.fastPreview\s*===\s*true/.test(mdpEngine)
    && /const\s+autocompleteResults\s*=\s*fastPreview[\s\S]{0,80}\?\s*\[\][\s\S]{0,120}getNaverAutocompleteKeywords/.test(mdpEngine)
    && /slice\(0,\s*fastPreview\s*\?\s*18\s*:\s*50\)/.test(mdpEngine)
    && /const\s+patternBatchSize\s*=\s*fastPreview\s*\?\s*18\s*:\s*10/.test(mdpEngine)
    && /fastPreview:\s*quickPreview/.test(keywordDiscovery),
  '10-result quick preview still uses deep MDP batch/SERP path');

assert('golden discovery quick preview keeps measured keyword rows instead of returning empty',
  /includeMeasuredFallback\?:\s*boolean/.test(mdpEngine)
    && /measurementOnly\?:\s*boolean/.test(mdpEngine)
    && /categoryMatched\?:\s*boolean/.test(mdpEngine)
    && /const\s+includeMeasuredFallback\s*=\s*options\.includeMeasuredFallback\s*===\s*true/.test(mdpEngine)
    && /const\s+categoryMatched\s*=\s*!\s*categoryStrict[\s\S]{0,160}isKeywordMatchingCategory/.test(mdpEngine)
    && /measurementOnly\s*=\s*includeMeasuredFallback[\s\S]{0,220}rawGrade\s*===\s*'C'[\s\S]{0,80}rawGrade\s*===\s*'D'[\s\S]{0,120}!\s*categoryMatched/.test(mdpEngine)
    && /measurementOnly\s*\?\s*'B'\s*:\s*rawGrade/.test(mdpEngine)
    && /includeMeasuredFallback:\s*quickPreview/.test(keywordDiscovery)
    && /measurementOnly\s*&&\s*quickPreview/.test(keywordDiscovery),
  'quick preview can still discard every measured keyword when SSS/A/B gates miss');

assert('manual 10-result golden discovery uses quick budgets too',
  /const\s+quickSignalMap\s*=\s*quickPreview\s*\?/.test(keywordDiscovery)
    && /const\s+quickLiveSeedTimeoutMs\s*=\s*quickPreview[\s\S]{0,120}1200/.test(keywordDiscovery)
    && /const\s+effectiveScanLimit\s*=\s*quickPreview[\s\S]{0,120}Math\.min\(seedlessQuickPreview\s*\?\s*180\s*:\s*240,\s*scanLimit\)/.test(keywordDiscovery)
    && /Math\.min\(discoverySeedCount,\s*seedlessQuickPreview\s*\?\s*14\s*:\s*24\)/.test(keywordDiscovery),
  'typed-keyword 10-result mode can still run the slow deep category scan');

assert('golden discovery UI stops after completion and displays MDP searchVolume fallback',
  /window\.keywordExpansionProgress\.isRunning\s*=\s*false/.test(html)
    && /progressBarDone[\s\S]{0,180}classList\.remove\('leword-progress-animated'\)/.test(html)
    && /hasDirectSearchVol\s*=\s*typeof\s+item\.searchVolume\s*===\s*'number'/.test(html)
    && /const\s+totalVol\s*=\s*\(hasPcVol\s*\|\|\s*hasMoVol\)\s*\?[\s\S]{0,120}hasDirectSearchVol\s*\?\s*item\.searchVolume/.test(html),
  'golden discovery completion cleanup or direct searchVolume display fallback is missing');

assert('golden discovery exposes saved blog profile categories',
  /id="goldenProfileCategoryPanel"/.test(html)
    && /id="keywordProfileCategoryGroup"/.test(html)
    && /refreshGoldenProfileCategories/.test(html),
  'blog profile category shortcuts missing');

assert('blogger profile and golden dropdown expose policy and celebrity categories',
  /value="지원금"[^>]*>지원금\/정책\/복지/.test(html)
    && /value="스타"[^>]*>스타\/연예인 이슈/.test(html)
    && /지원금\/정책\/복지/.test(bloggerProfile)
    && /스타\/연예 이슈/.test(bloggerProfile),
  'policy/star categories are not exposed in profile or golden UI');

assert('blogger profile modal pins high-traffic policy and star categories first',
  /const\s+BLOGGER_PROFILE_CATEGORY_PRIORITY\s*=\s*\[\s*'policy'\s*,\s*'celeb'/.test(html)
    && /function\s+prioritizeBloggerProfileCategories/.test(html)
    && /const\s+cats\s*=\s*prioritizeBloggerProfileCategories\(r\?\.categories\s*\|\|\s*\[\]\)/.test(html),
  'profile modal does not prioritize policy/star categories for focused golden discovery');

assert('PRO and home hunter category pickers expose policy and star intent paths',
  /value:\s*'policy',\s*label:\s*'[^']*정책·지원금'/.test(html)
    && /value:\s*'celeb',\s*label:\s*'[^']*연예\/이슈'/.test(html)
    && /<option\s+value="celebrity"[^>]*>[^<]*스타·연예<\/option>/.test(html),
  'policy/star categories are not exposed in PRO or home hunter UI');

assert('home hunter strict S+ mode requires explicit S+ value grade through final output',
  /strictSPlusMode\s*&&\s*x\.valueGate\.valueGrade\s*!==\s*'S\+'/.test(html)
    && /x\.valueGate\.valueGrade\s*===\s*'S\+'[\s\S]*\(x\.valueGate\.qualityScore\s*\|\|\s*0\)\s*>=\s*minQuality/.test(html)
    && /filter\(x\s*=>\s*!strictSPlusMode\s*\|\|[\s\S]*x\.valueGate\.valueGrade\s*===\s*'S\+'/.test(html),
  'home hunter strict mode can leak non-S+ candidates');

assert('home hunter slot is repurposed to AI Mate citation mode',
  /openNaverMateKeywordModal/.test(html)
    && /네이버 AI 메이트 키워드 찾기/.test(html)
    && /AI 인용 친화도 공식/.test(html)
    && /function\s+getAiMateCitationSignals/.test(html)
    && /getAiMateCitationSignals\(x\)\.score\s*>=\s*minScore/.test(html)
    && /AI Mate 점수/.test(html)
    && /source:\s*'ai-mate-hunter'/.test(html),
  'AI Mate citation mode is not fully wired through UI, scoring, cutoff, and tracking');

assert('golden discovery makes profile categories single-focus execution',
  /집중 카테고리/.test(html)
    && /대표 1개/.test(html)
    && /대표 운영 카테고리/.test(html)
    && /다른 주제는 섞지 않습니다/.test(html),
  'single-focus category execution copy missing');

assert('blogger profile UI allows only one representative category',
  /type="radio"\s+name="bpCategory"/.test(html)
    && /대표 카테고리는 1개만 선택할 수 있습니다/.test(html)
    && !/name="bpCategory"[^>]+type="checkbox"/.test(html),
  'blogger profile category input is not singleton');

assert('blogger profile backend enforces one representative category',
  /selectedCategories\.length\s*!==\s*1/.test(sourceSignals)
    && /대표 카테고리는 1개만 선택 가능합니다/.test(sourceSignals)
    && /slice\(0,\s*1\)/.test(bloggerProfile),
  'backend singleton profile guard missing');

assert('blogger profile save refreshes golden discovery category shortcuts',
  /saveBloggerProfile[\s\S]*refreshGoldenProfileCategories/.test(html)
    && /resetBloggerProfile[\s\S]*refreshGoldenProfileCategories/.test(html),
  'profile save/reset does not refresh golden category UI');

assert('shopping connect no-keyword discovery requests 30 seeds',
  /autoDiscoveryLimit:\s*30/.test(html)
    && /requestedRecommendationLimit\s*=\s*params\?\.targetCount\s*\?\?\s*params\?\.autoDiscoveryLimit/.test(configUtility)
    && /normalizeShoppingAutoDiscoveryLimit\(params\?\.autoDiscoveryLimit\s*\?\?\s*params\?\.targetCount\)/.test(configUtility)
    && /getShoppingRecommendationLimit\(autoDiscovery,\s*requestedRecommendationLimit\)/.test(configUtility)
    && /getShoppingAutoDiscoveryExpansionLimit\(discoverySeeds\.length,\s*autoDiscoveryLimit\)/.test(configUtility)
    && /getShoppingAutoDiscoverySearchLimit\(discoverySeeds\.length,\s*autoDiscoveryLimit\)/.test(configUtility)
    && /balanceDiscovery:\s*true/.test(configUtility)
    && /maxPerDiscoveryQuery:\s*3/.test(configUtility)
    && /opportunityRanked\.slice\(0,\s*recommendationLimit\)/.test(configUtility)
    && /autoSeeds\.slice\(0,\s*30\)/.test(html),
  'shopping auto discovery is not using/showing 30 diversified seeds and final recommendations');

assert('shopping connect scores expanded products by their discovery query',
  /item\.discoveryQuery\s*\|\|\s*rootKeyword/.test(fs.readFileSync(path.join(__dirname, '..', 'naver-shopping-api.ts'), 'utf8'))
    && /buildProductLeWordSeeds\(item,\s*item\.discoveryQuery\s*\|\|\s*keyword,\s*6\)/.test(configUtility),
  'shopping expanded products are not discovery-query aware');

assert('policy briefing panel is full-width realtime-style and requests enough items',
  /지원금·정책 갓 떴음/.test(html)
    && /source-policy-briefing-aggregate',\s*\{\s*limit:\s*60\s*\}/.test(html)
    && /minmax\(min\(100%,\s*360px\),\s*1fr\)/.test(html)
    && /5분마다 자동 갱신/.test(html),
  'policy briefing realtime panel is not expanded');

assert('realtime all mode includes policy briefing source',
  /getBokjiroRealtimeKeywords\(limit\)/.test(keywordDiscovery)
    && /platform:\s*'bokjiro'/.test(keywordDiscovery)
    && /else\s+if\s*\(p\s*===\s*'bokjiro'\)\s*result\.bokjiro\s*=\s*converted/.test(keywordDiscovery),
  'realtime all mode can still finish with policy=0 because policy source is not collected');

assert('exposure tracking turns proven winners into mindmap expansion seeds',
  /rankExposureGrowthSeeds\(tracked,\s*\{\s*limit:\s*12,\s*expansionLimit:\s*6\s*\}\)/.test(exposureTracking)
    && /expansionSeeds/.test(exposureTracking)
    && /const\s+growthSeeds\s*=\s*r\.expansionSeeds\s*\|\|\s*\[\]/.test(html)
    && /lewordMindmapResearch\s*&&\s*lewordMindmapResearch\('\$\{safeKwJs\}'\)/.test(html),
  'exposure winner-to-mindmap loop is missing');

const rankedExpansionHelper = html.match(/window\.fetchLeWordRankedExpansionKeywords[\s\S]*?async function extractKeywordsRecursively/)?.[0] || '';
const infiniteExtractionBlock = html.match(/async function extractKeywordsRecursively[\s\S]*?function updateInfiniteProgress/)?.[0] || '';
const legacyMindmapExtractionBlock = html.match(/window\.extractMindmapKeywords\s*=\s*async function[\s\S]*?\n\s*};\s*\n\s*window\.updateMindmapProgress/)?.[0] || '';
const queueMindmapExpansionBlock = html.match(/window\.startInfiniteExpansion\s*=\s*async function[\s\S]*?window\.extractMindmapKeywords/)?.[0] || '';
const richFeedTopicIdeasBlock = html.match(/window\.rfShowTopicIdeas\s*=\s*async function[\s\S]*?topicSimilarStatus/)?.[0] || '';

assert('legacy expansion paths use unified ranked expansion helper',
  /get-autocomplete-suggestions[\s\S]*get-keyword-expansions/.test(rankedExpansionHelper)
    && /window\.lewordRankedExpansionCache/.test(rankedExpansionHelper)
    && /cache\.size\s*>\s*250/.test(rankedExpansionHelper)
    && /fetchLeWordRankedExpansionKeywords/.test(infiniteExtractionBlock)
    && /fetchLeWordRankedExpansionKeywords/.test(legacyMindmapExtractionBlock),
  'legacy keyword expansion can bypass the ranked autocomplete/expansion helper');

assert('queue-based mindmap expansion uses ranked helper instead of shallow autocomplete only',
  /fetchLeWordRankedExpansionKeywords\(currentKeyword,\s*40\)/.test(queueMindmapExpansionBlock)
    && !/get-autocomplete-suggestions['"],\s*currentKeyword/.test(queueMindmapExpansionBlock),
  'queue-based mindmap expansion can bypass get-keyword-expansions fallback');

assert('rich-feed topic ideas use ranked expansion instead of shallow autocomplete only',
  /fetchLeWordRankedExpansionKeywords\(kw,\s*12\)/.test(richFeedTopicIdeasBlock)
    && !/get-autocomplete-suggestions/.test(richFeedTopicIdeasBlock),
  'rich-feed topic ideas can still use shallow autocomplete only');

assert('mindmap metrics require complete Naver SearchAd credentials and preserve measured display',
  /!config\.clientId\s*\|\|\s*!config\.clientSecret/.test(sourceSignals)
    && /const\s+svDisplay\s*=\s*it\.searchVolumeDisplay\s*\|\|/.test(html)
    && /it\.searchVolume\s*===\s*0\s*\?\s*'< 20'/.test(html),
  'mindmap metrics can silently run with partial API keys or display hidden low volume as raw zero');

assert('keyword lookup returns measured search volume and document count fields',
  /const\s+shouldComputeMetrics\s*=\s*hasNaverApiKeys\s*&&\s*!isUnlimited/.test(keywordAnalysis)
    && /getNaverKeywordSearchVolumeSeparate[\s\S]{0,180}includeDocumentCount:\s*false/.test(keywordAnalysis)
    && /const\s+fetchDocumentCount\s*=\s*async\s*\(keyword:\s*string/.test(keywordAnalysis)
    && /documentCount:\s*typeof\s+k\.documentCount\s*===\s*'number'\s*\?\s*k\.documentCount\s*:\s*null/.test(keywordAnalysis),
  'general keyword lookup can return rows without measured search-volume/document-count fields');

assert('mindmap expansion uses completed/live candidates and blocks synthetic hardcoded backfill',
  /rankKeywordExpansionCandidates\(seed,\s*normalized/.test(fs.readFileSync(path.join(__dirname, '..', 'mindmap-expansion-quality.ts'), 'utf8'))
    && !/rankKeywordExpansionCandidates\(seed,\s*\[\],/.test(fs.readFileSync(path.join(__dirname, '..', 'mindmap-expansion-quality.ts'), 'utf8'))
    && /buildLewordMindmapContextKeywords/.test(html)
    && /contextKeywords/.test(html)
    && /contextKeywords\?:\s*MindmapContextKeywordInput\[\]/.test(sourceSignals)
    && /contextRanked/.test(sourceSignals)
    && /getNaverKeywordSearchVolumeSeparate\(config,\s*d1Pool,\s*\{\s*includeDocumentCount:\s*true\s*\}\)/.test(sourceSignals)
    && /\.filter\(isMindmapDisplayMetric\)/.test(sourceSignals),
  'mindmap can still synthesize hardcoded rows or ignore completed result pools');

assert('legacy recursive direct blogger calls stay disabled after ranked helper migration',
  /if\s*\(false\s*&&\s*window\.blogger\s*&&\s*typeof\s+window\.blogger\.getRelatedKeywords/.test(infiniteExtractionBlock)
    && !/if\s*\(\s*window\.blogger\s*&&\s*typeof\s+window\.blogger/.test(infiniteExtractionBlock)
    && /if\s*\(false\s*&&\s*window\.blogger\s*&&\s*typeof\s+window\.blogger\.getAutoComplete/.test(legacyMindmapExtractionBlock)
    && /if\s*\(false\s*&&\s*window\.blogger\s*&&\s*typeof\s+window\.blogger\.getRelatedKeywords/.test(legacyMindmapExtractionBlock)
    && !/if\s*\(\s*window\.blogger\s*&&\s*typeof\s+window\.blogger/.test(legacyMindmapExtractionBlock),
  'legacy recursive expansion is calling shallow blogger autocomplete/related sources live again');

console.log(`\n[ui-count-regression.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
