const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function readArg(argv, name, fallback = '') {
  const equals = argv.find((arg) => arg.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? (argv[index + 1] || fallback) : fallback;
}

function resolveOut(outPath) {
  if (!outPath) return null;
  return path.isAbsolute(outPath) ? outPath : path.join(root, outPath);
}

function writeJson(value, outPath) {
  const resolved = resolveOut(outPath);
  if (!resolved) return null;
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return resolved;
}

function check(name, ok, detail, severity = 'required') {
  return { name, ok: !!ok, detail, severity };
}

function summarize(checks) {
  return {
    passed: checks.filter((item) => item.ok).length,
    failedRequired: checks.filter((item) => !item.ok && item.severity === 'required').length,
    failedRecommended: checks.filter((item) => !item.ok && item.severity !== 'required').length,
  };
}

function collectTouchMinHeights(source) {
  return [...source.matchAll(/minHeight:\s*(\d+)/g)].map((match) => Number(match[1]));
}

function collectMobileUiReleaseGate(options = {}) {
  const appSource = options.appSource || read('apps/mobile/App.tsx');
  const screenSource = options.screenSource || read('apps/mobile/src/screens/MobileHunterScreen.tsx');
  const clientSource = options.clientSource || read('apps/mobile/src/api/lewordClient.ts');
  const runtimeSource = options.runtimeSource || read('apps/mobile/src/config/runtime.ts');
  const pushSource = options.pushSource || read('apps/mobile/src/services/pushRegistration.ts');
  const sessionStoreSource = options.sessionStoreSource || read('apps/mobile/src/services/sessionStore.ts');
  const contractsSource = options.contractsSource || read('apps/mobile/src/contracts.ts');
  const appConfig = options.appConfig || readJson('apps/mobile/app.json');
  const mobilePackage = options.mobilePackage || readJson('apps/mobile/package.json');
  const rootPackage = options.rootPackage || readJson('package.json');
  const allMobileSource = [
    appSource,
    screenSource,
    clientSource,
    runtimeSource,
    pushSource,
    sessionStoreSource,
    contractsSource,
  ].join('\n');

  const hunterModes = [
    "'golden'",
    "'pro'",
    "'analysis'",
    "'mindmap'",
    "'home'",
    "'kin'",
  ];
  const jobClientMethods = [
    'createGoldenDiscoveryJob',
    'createProTrafficJob',
    'createKeywordAnalysisJob',
    'createMindmapExpansionJob',
    'createHomeBoardJob',
    'createKinHiddenHoneyJob',
  ];
  const mobileCategories = [
    "id: 'policy'",
    "id: 'celebrity'",
    "id: 'finance'",
    "id: 'education'",
    "id: 'health'",
    "id: 'it'",
    "id: 'living'",
    "id: 'travel'",
  ];
  const measuredMetricFields = [
    'pcSearchVolume',
    'mobileSearchVolume',
    'totalSearchVolume',
    'documentCount',
    'goldenRatio',
    'cpc',
    'isMeasured',
  ];
  const touchMinHeights = collectTouchMinHeights(screenSource);

  const checks = [
    check('Mobile app source files exist',
      [
        'apps/mobile/App.tsx',
        'apps/mobile/src/screens/MobileHunterScreen.tsx',
        'apps/mobile/src/api/lewordClient.ts',
        'apps/mobile/src/config/runtime.ts',
        'apps/mobile/src/services/pushRegistration.ts',
        'apps/mobile/src/contracts.ts',
      ].every(exists),
      'mobile release gate needs the Expo shell, screen, API client, runtime config, push registration, and contract mirror'),
    check('Mobile UI is an Expo/RN shell',
      /SafeAreaView/.test(appSource)
        && /StatusBar/.test(appSource)
        && /MobileHunterScreen/.test(appSource)
        && /^LEWORD(?: Mobile)?$/.test(appConfig.expo?.name || ''),
      'App.tsx must render the dedicated mobile screen inside a safe area'),
    check('Mobile source does not import Electron or desktop IPC',
      !/electron|ipcRenderer|contextBridge|BrowserWindow/i.test(allMobileSource),
      'mobile must not carry desktop process assumptions'),
    check('Mobile source does not import browser automation',
      !/patchright|playwright|puppeteer|chromium/i.test(allMobileSource),
      'Patchright, Playwright, Puppeteer, and Chromium stay on the API worker'),
    check('Mobile source avoids browser DOM assumptions',
      !/\bdocument\b|createElement|querySelector|<table\b|iframe\b/i.test(screenSource),
      'mobile UI should be native components, not desktop DOM/table layout'),
    check('Mobile screen uses touch-first native primitives',
      /ScrollView/.test(screenSource)
        && /Pressable/.test(screenSource)
        && /TextInput/.test(screenSource)
        && /StyleSheet\.create/.test(screenSource),
      'screen must be scrollable, touchable, editable, and styled through React Native primitives'),
    check('Mobile shows immediate loading feedback',
      /progressPulse/.test(screenSource)
        && /isRunning/.test(screenSource)
        && /progressPercent/.test(screenSource),
      'long PC-grade jobs need visible loading signal and progress state on phone'),
    check('Mobile exposes every core LEWORD hunter mode',
      hunterModes.every((token) => screenSource.includes(token))
        && jobClientMethods.every((token) => screenSource.includes(token)),
      'golden, PRO, analysis, mindmap, home-board, and KIN modes must all be reachable'),
    check('Mobile keeps one focused category selected at a time',
      mobileCategories.every((token) => screenSource.includes(token))
        && /const \[categoryId, setCategoryId\]/.test(screenSource)
        && /categoryId === category\.id/.test(screenSource)
        && /onPress=\{\(\) => setCategoryId\(category\.id\)\}/.test(screenSource),
      'mobile category selection should focus one operating category instead of scattering across many'),
    check('Mobile supports seedless category hunting and seeded expansion',
      /seedKeyword: seed \|\| undefined/.test(screenSource)
        && /mode === 'analysis' \|\| mode === 'mindmap'/.test(screenSource)
        && /!seed/.test(screenSource),
      'category hunters can run without a seed, while analysis/mindmap require a seed'),
    check('Mobile API URL and bearer token are user configurable',
      /getDefaultLewordApiUrl/.test(screenSource)
        && /getLewordApiUrlWarning/.test(screenSource)
        && /secureTextEntry/.test(screenSource)
        && /Authorization: `Bearer/.test(clientSource),
      'production API URL and mobile user token must be configurable'),
    check('Mobile API client supports job polling, timeout, and cancellation',
      /pollJobUntilTerminal/.test(clientSource)
        && /timeoutMs/.test(clientSource)
        && /cancelJob/.test(clientSource)
        && /DELETE/.test(clientSource)
        && /LEWORD job timed out/.test(clientSource),
      'slow PC-grade work must never leave a phone stuck forever'),
    check('Mobile UI renders progress, error, cancel, and retry paths',
      /setError/.test(screenSource)
        && /errorText/.test(screenSource)
        && /cancelJob/.test(screenSource)
        && /secondaryButtonText/.test(screenSource)
        && /onPress=\{startJob\}/.test(screenSource),
      'users need clear failure state, cancellation, and a start-again path'),
    check('Mobile result cards show PC-grade measured metrics',
      measuredMetricFields.every((token) => contractsSource.includes(token))
        && /totalSearchVolume/.test(screenSource)
        && /documentCount/.test(screenSource)
        && /goldenRatio/.test(screenSource)
        && /evidenceTitle/.test(screenSource),
      'result cards must expose search volume, documents, ratio, grade, and evidence'),
    check('Mobile recommendation inbox is wired',
      /getNotifications/.test(screenSource)
        && /markNotificationRead/.test(screenSource)
        && /MobileNotificationSnapshot/.test(screenSource)
        && /MOBILE_NOTIFICATION_ROUTES/.test(clientSource),
      'fresh/prewarmed winners need an inbox, not only manual search'),
    check('Mobile prewarm status is visible',
      /getPrewarmSnapshot/.test(screenSource)
        && /MobilePrewarmSnapshot/.test(screenSource)
        && /MOBILE_PREWARM_ROUTES/.test(clientSource),
      'users should see server prewarm/cache state from the phone'),
    check('Mobile push registration is wired for real devices',
      /registerLeWordPushNotifications/.test(screenSource)
        && /registerPushSubscription/.test(clientSource)
        && /unregisterPushSubscription/.test(clientSource)
        && /expo-notifications/.test(pushSource)
        && /getExpoPushTokenAsync/.test(pushSource)
        && /EXPO_PUBLIC_EAS_PROJECT_ID/.test(pushSource),
      'fresh keyword alerts require push token acquisition and API registration'),
    check('Mobile privacy link is reachable',
      /getDefaultPrivacyUrl/.test(screenSource)
        && /Linking\.openURL/.test(screenSource)
        && /LEWORD_DEFAULT_PRIVACY_URL/.test(runtimeSource),
      'store release needs an accessible privacy policy path'),
    check('Mobile restores panel-linked PC API sessions securely',
      /expo-secure-store/.test(sessionStoreSource)
        && /saveMobileSession/.test(screenSource)
        && /loadMobileSession/.test(screenSource)
        && /clearMobileSession/.test(screenSource)
        && /accessToken/.test(sessionStoreSource)
        && /apiBaseUrl/.test(sessionStoreSource)
        && !!mobilePackage.dependencies?.['expo-secure-store'],
      'login should persist the panel-issued token and PC API URL so phone and PC stay linked after app restart'),
    check('Mobile API diagnostics are visible from settings',
      /getApiStatus/.test(clientSource)
        && /MOBILE_STATUS_ROUTES/.test(clientSource)
        && /apiStatus/.test(screenSource)
        && /API 상태 진단/.test(screenSource)
        && /진단 갱신/.test(screenSource),
      'settings should expose PC API key/runtime diagnostics without leaking secret values'),
    check('Mobile keyword export/share is wired',
      /exportKeywords/.test(clientSource)
        && /MOBILE_EXPORT_ROUTES/.test(clientSource)
        && /Share\.share/.test(screenSource)
        && /shareKeywordExport/.test(screenSource)
        && /내보내기\/공유/.test(screenSource)
        && /CSV 공유/.test(screenSource)
        && /텍스트 공유/.test(screenSource)
        && /JSON 공유/.test(screenSource),
      'settings/results should export PC keyword metrics through mobile share'),
    check('Mobile WordPress publishing bridge is wired',
      /getWordPressPublishing/.test(clientSource)
        && /saveWordPressSite/.test(clientSource)
        && /createWordPressDraft/.test(clientSource)
        && /refreshWordPressCategories/.test(clientSource)
        && /publishWordPressDraft/.test(clientSource)
        && /MOBILE_WORDPRESS_ROUTES/.test(clientSource)
        && /MobileWordPressSnapshot/.test(screenSource)
        && /wordpressPostStatus/.test(screenSource)
        && /워드프레스 발행 연동/.test(screenSource)
        && /WP 상태 동기화/.test(screenSource)
        && /WP 사이트 저장/.test(screenSource)
        && /WP 초안 등록/.test(screenSource)
        && /WP 카테고리 조회/.test(screenSource)
        && /WP REST 전송/.test(screenSource),
      'settings should connect WordPress site/category/draft queue and REST publish through the shared PC mobile API'),
    check('Mobile keyword groups sync with PC storage',
      /getKeywordGroups/.test(clientSource)
        && /createKeywordGroup/.test(clientSource)
        && /updateKeywordGroup/.test(clientSource)
        && /deleteKeywordGroup/.test(clientSource)
        && /MOBILE_KEYWORD_GROUP_ROUTES/.test(clientSource)
        && /MobileKeywordGroupSnapshot/.test(screenSource)
        && /keywordGroups/.test(screenSource)
        && /키워드 그룹/.test(screenSource)
        && /현재 키워드로 등록/.test(screenSource),
      'schedule tab should list, create, and remove PC keyword groups through the shared mobile API'),
    check('Mobile schedule dashboard syncs PC schedule status',
      /getScheduleDashboard/.test(clientSource)
        && /createKeywordSchedule/.test(clientSource)
        && /toggleKeywordSchedule/.test(clientSource)
        && /updateKeywordSchedule/.test(clientSource)
        && /deleteKeywordSchedule/.test(clientSource)
        && /MOBILE_SCHEDULE_ROUTES/.test(clientSource)
        && /MobileScheduleDashboardSnapshot/.test(screenSource)
        && /scheduleDashboard/.test(screenSource)
        && /스케줄 대시보드/.test(screenSource)
        && /스케줄 갱신/.test(screenSource)
        && /현재 키워드 예약/.test(screenSource)
        && /예약 상세 저장/.test(screenSource)
        && /삭제/.test(screenSource)
        && /toggleSchedule/.test(screenSource)
        && /saveScheduleDetails/.test(screenSource)
        && /deleteSchedule/.test(screenSource),
      'schedule tab should show PC schedule counts and allow creating/toggling/editing/deleting PC keyword schedules'),
    check('Mobile rank tracking snapshot and actions are visible in analysis tab',
      /getRankTrackingSnapshot/.test(clientSource)
        && /addRankTrackingPair/.test(clientSource)
        && /addProTrackedPost/.test(clientSource)
        && /runRankTrackingCheck/.test(clientSource)
        && /removeRankTrackingPair/.test(clientSource)
        && /MOBILE_RANK_TRACKING_ROUTES/.test(clientSource)
        && /MobileRankTrackingSnapshot/.test(screenSource)
        && /rankTracking/.test(screenSource)
        && /rankKeyword/.test(screenSource)
        && /rankPostUrl/.test(screenSource)
        && /rankPredictedRank/.test(screenSource)
        && /rankExtraKeywords/.test(screenSource)
        && /addProTrackedPost/.test(screenSource)
        && /isRankActionRunning/.test(screenSource)
        && /순위 추적/.test(screenSource)
        && /순위 추적 갱신/.test(screenSource)
        && /추적 등록/.test(screenSource)
        && /PRO 글 추적 등록/.test(screenSource)
        && /빠른 점검/.test(screenSource)
        && /추적 삭제/.test(screenSource)
        && /PC 추적/.test(screenSource),
      'analysis tab should read, register, run, remove, and PRO-track PC rank tracking pairs through the shared mobile API'),
    check('Mobile PRO blueprint actions are visible in premium tab',
      /generateProBlueprint/.test(clientSource)
        && /generateProDraft/.test(clientSource)
        && /estimateProRevenue/.test(clientSource)
        && /getProRevenueConfig/.test(clientSource)
        && /saveProRevenueConfig/.test(clientSource)
        && /getProCategoryRpmTable/.test(clientSource)
        && /estimateProPortfolioRevenue/.test(clientSource)
        && /MOBILE_PRO_BLUEPRINT_ROUTES/.test(clientSource)
        && /MobileProBlueprintActionResult/.test(contractsSource)
        && /MobileProRevenueConfig/.test(contractsSource)
        && /MobileProPortfolioRevenueInput/.test(contractsSource)
        && /MobileProBlueprintActionResult/.test(screenSource)
        && /proBlueprintResult/.test(screenSource)
        && /proDraftResult/.test(screenSource)
        && /proRevenueResult/.test(screenSource)
        && /proRevenueConfigResult/.test(screenSource)
        && /proCategoryRpmResult/.test(screenSource)
        && /proPortfolioResult/.test(screenSource)
        && /generateProBlueprint/.test(screenSource)
        && /generateProDraft/.test(screenSource)
        && /estimateProRevenue/.test(screenSource)
        && /refreshProRevenueConfig/.test(screenSource)
        && /saveProRevenueConfig/.test(screenSource)
        && /estimateProPortfolioRevenue/.test(screenSource)
        && /PRO 청사진/.test(screenSource)
        && /청사진 생성/.test(screenSource)
        && /초안 생성/.test(screenSource)
        && /수익 추정/.test(screenSource)
        && /PRO 수익 설정/.test(screenSource)
        && /수익 설정 불러오기/.test(screenSource)
        && /수익 설정 저장/.test(screenSource)
        && /RPM 표 조회/.test(screenSource)
        && /PRO 포트폴리오 수익/.test(screenSource)
        && /포트폴리오 수익 추정/.test(screenSource),
      'premium tab should generate PC PRO blueprints, drafts, revenue estimates, revenue settings, RPM tables, and portfolio revenue through the shared mobile API'),
    check('Mobile PRO outcome benchmark is visible in premium tab',
      /getProOutcomeSnapshot/.test(clientSource)
        && /recordProOutcome/.test(clientSource)
        && /deleteProOutcome/.test(clientSource)
        && /syncProOutcomes/.test(clientSource)
        && /MOBILE_PRO_OUTCOME_ROUTES/.test(clientSource)
        && /MobileProOutcomeSnapshot/.test(screenSource)
        && /proOutcomes/.test(screenSource)
        && /refreshProOutcomes/.test(screenSource)
        && /recordProOutcome/.test(screenSource)
        && /deleteProOutcome/.test(screenSource)
        && /syncProOutcomes/.test(screenSource)
        && /PRO 성과 로그/.test(screenSource)
        && /성과 갱신/.test(screenSource)
        && /PRO 성과 기록/.test(screenSource)
        && /성과 기록/.test(screenSource)
        && /성과 동기화/.test(screenSource)
        && /성과 삭제/.test(screenSource)
        && /예측 정확도/.test(screenSource)
        && /RPM/.test(screenSource),
      'premium tab should read, record, delete, sync, and benchmark PC PRO outcome records through the shared mobile API'),
    check('Touch targets meet mobile minimums',
      touchMinHeights.length >= 4
        && touchMinHeights.every((height) => height >= 36)
        && touchMinHeights.some((height) => height >= 54),
      `minHeight values: ${touchMinHeights.join(', ')}`),
    check('Mobile layout wraps instead of assuming desktop width',
      /flexWrap:\s*'wrap'/.test(screenSource)
        && /flexBasis:\s*'30%'/.test(screenSource)
        && /flexGrow:\s*1/.test(screenSource),
      'mode/category/action areas must survive narrow phone widths'),
    check('Mobile quality floors preserve PC parity expectations',
      /goldenPrecisionSss:\s*30/.test(contractsSource)
        && /goldenBulkSss:\s*60/.test(contractsSource)
        && /proTrafficMaxSssTarget:\s*250/.test(contractsSource)
        && /mindmapDefaultMeasuredKeywords:\s*50/.test(contractsSource)
        && /keywordAnalysisDefaultRelated:\s*10/.test(contractsSource),
      'mobile cannot quietly lower keyword floors versus PC intent'),
    check('Root verification includes mobile UI release gate',
      /mobile-ui-release-gate\.js/.test(rootPackage.scripts['verify:mobile'] || '')
        && rootPackage.scripts['mobile:ui-release-gate'] === 'node scripts/mobile-ui-release-gate.js',
      'verify:mobile should fail if mobile UI release quality regresses'),
  ];

  const summary = summarize(checks);

  return {
    generatedAt: new Date().toISOString(),
    ok: summary.failedRequired === 0,
    summary,
    checks,
    blockers: checks.filter((item) => !item.ok),
    evidence: {
      appName: appConfig.expo?.name || null,
      androidPackage: appConfig.expo?.android?.package || null,
      iosBundleIdentifier: appConfig.expo?.ios?.bundleIdentifier || null,
      hunterModes: hunterModes.map((mode) => mode.replace(/'/g, '')),
      categories: mobileCategories.map((category) => category.replace("id: '", '').replace("'", '')),
      touchMinHeights,
    },
  };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const report = collectMobileUiReleaseGate();
  const written = writeJson(report, readArg(argv, '--out', ''));
  console.log(JSON.stringify({ ...report, written }, null, 2));
  process.exit(report.ok ? 0 : 1);
}

module.exports = {
  collectMobileUiReleaseGate,
  writeJson,
};
