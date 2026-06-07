const fs = require('fs');
const path = require('path');

require('ts-node/register/transpile-only');

const {
  MOBILE_API_ENDPOINTS,
  MOBILE_PC_PARITY_SLA,
  isServerOnlyMobileProduct,
} = require('../src/mobile/contracts');
const {
  getMobileRuntimeReadiness,
} = require('../src/mobile/runtime-readiness');
const {
  collectMobileStoreSubmissionPackage,
} = require('./mobile-store-submission-package');
const {
  collectMobileUiReleaseGate,
} = require('./mobile-ui-release-gate');

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
    failedExternal: checks.filter((item) => !item.ok && item.severity === 'external').length,
    failedRecommended: checks.filter((item) => !item.ok && item.severity === 'recommended').length,
  };
}

function collectMobileSource() {
  const files = [
    'apps/mobile/App.tsx',
    'apps/mobile/src/api/lewordClient.ts',
    'apps/mobile/src/config/runtime.ts',
    'apps/mobile/src/contracts.ts',
    'apps/mobile/src/screens/MobileHunterScreen.tsx',
    'apps/mobile/src/services/pushRegistration.ts',
  ];
  return files.map((file) => exists(file) ? read(file) : '').join('\n');
}

function collectOptionalJson(relativePath) {
  return exists(relativePath) ? readJson(relativePath) : null;
}

function collectMobileLaunchSlaReport(options = {}) {
  const env = options.env || process.env;
  const mobileSource = options.mobileSource || collectMobileSource();
  const pcEngineExecutor = options.pcEngineExecutor || read('src/mobile/pc-engine-executor.ts');
  const apiServer = options.apiServer || read('apps/api/src/server.ts');
  const rootPackage = options.rootPackage || readJson('package.json');
  const appConfig = options.appConfig || readJson('apps/mobile/app.json');
  const runtimeReadiness = options.runtimeReadiness || getMobileRuntimeReadiness({ env });
  const storeSubmission = options.storeSubmission || collectMobileStoreSubmissionPackage();
  const uiReleaseGate = options.uiReleaseGate || collectMobileUiReleaseGate();
  const releaseDryRun = options.releaseDryRun || collectOptionalJson('.codex-build-cache/mobile-release-dry-run.json');
  const dispatchPlan = options.dispatchPlan || collectOptionalJson('.codex-build-cache/mobile-release-dispatch-plan.json');
  const performanceSmoke = options.performanceSmoke || collectOptionalJson('.codex-build-cache/mobile-api-performance-smoke.json');

  const endpointProducts = [...new Set(MOBILE_API_ENDPOINTS.map((endpoint) => endpoint.product))];
  const mobileHasBrowserAutomation = /patchright|playwright|puppeteer|chromium/i.test(mobileSource);
  const pcEngineImports = [
    'MDPEngine',
    'huntProTrafficKeywords',
    'getNaverSearchAdKeywordVolume',
    'rankMindmapExpansionCandidates',
    'rankKeywordExpansionCandidates',
  ];
  const mobileMetricsFields = [
    'pcSearchVolume',
    'mobileSearchVolume',
    'totalSearchVolume',
    'documentCount',
    'goldenRatio',
    'cpc',
    'isMeasured',
  ];

  const checks = [
    check('Mobile endpoints are server-only',
      MOBILE_API_ENDPOINTS.every((endpoint) => (
        endpoint.requiresServerWorker === true
        && endpoint.mobileCanRunLocally === false
        && isServerOnlyMobileProduct(endpoint.product)
      )),
      'all mobile keyword products must delegate heavy work to the API worker'),
    check('Mobile app contains no browser automation imports',
      !mobileHasBrowserAutomation,
      'phone runtime must not import Patchright, Playwright, Puppeteer, or Chromium'),
    check('Mobile API streams or polls long-running jobs',
      MOBILE_API_ENDPOINTS.every((endpoint) => endpoint.transport === 'sse' || endpoint.transport === 'websocket'),
      'all keyword jobs need progress updates instead of blocking the UI'),
    check('Mobile API supports cancellation',
      /cancelJob/.test(mobileSource)
        && /MOBILE_JOB_ROUTES/.test(apiServer)
        && /store\.cancel/.test(apiServer),
      'mobile users must be able to cancel slow PC-grade jobs'),
    check('PC engine executor reuses desktop-grade engines',
      pcEngineImports.every((token) => pcEngineExecutor.includes(token)),
      'mobile API worker should reuse MDP, PRO, SearchAd, and expansion rankers'),
    check('Mobile result schema preserves measured PC metrics',
      mobileMetricsFields.every((token) => pcEngineExecutor.includes(token)),
      'results must carry PC/mobile/total volume, docs, ratio, CPC, and measured flag'),
    check('Quality floors match user-requested mobile parity',
      MOBILE_PC_PARITY_SLA.qualityFloors.goldenPrecisionSss >= 30
        && MOBILE_PC_PARITY_SLA.qualityFloors.goldenBulkSss >= 60
        && MOBILE_PC_PARITY_SLA.qualityFloors.proTrafficMaxSssTarget >= 250
        && MOBILE_PC_PARITY_SLA.qualityFloors.mindmapDefaultMeasuredKeywords >= 50,
      JSON.stringify(MOBILE_PC_PARITY_SLA.qualityFloors)),
    check('Mobile latency budgets are explicit',
      MOBILE_PC_PARITY_SLA.latencyBudgetsMs.firstProgressP95 <= 2000
        && MOBILE_PC_PARITY_SLA.latencyBudgetsMs.progressHeartbeatP95 <= 2500
        && MOBILE_PC_PARITY_SLA.latencyBudgetsMs.cachedResultP95 <= 1500,
      JSON.stringify(MOBILE_PC_PARITY_SLA.latencyBudgetsMs)),
    check('Production API runtime readiness is modeled',
      Array.isArray(runtimeReadiness.checks)
        && runtimeReadiness.checks.some((item) => /Naver SearchAd/.test(item.name))
        && runtimeReadiness.checks.some((item) => /Persistent mobile result cache/.test(item.name))
        && runtimeReadiness.checks.some((item) => /Server prewarm scheduler/.test(item.name)),
      'runtime gate must require SearchAd, cache, prewarm, entitlement, and push readiness'),
    check('Production API runtime is externally ready',
      runtimeReadiness.ok === true,
      'requires real Naver/SearchAd, entitlement, cache, prewarm, and push env',
      'external'),
    check('App package ids are mobile store ids',
      appConfig.expo?.android?.package === 'com.leword.mobile'
        && appConfig.expo?.ios?.bundleIdentifier === 'com.leword.mobile',
      'Android and iOS package ids must align for store launch'),
    check('Store submission package is ready',
      storeSubmission.ok === true,
      'copy-paste store metadata, privacy summary, reviewer notes, and asset paths must be green'),
    check('Mobile UI release gate is ready',
      uiReleaseGate.ok === true,
      'mobile UI must expose touch-first controls, progress, cancellation, errors, push, inbox, prewarm, and measured metric cards'),
    check('Release dry-run evidence exists',
      !!releaseDryRun?.generatedAt,
      'run npm run mobile:release-dry-run:save before final launch review',
      releaseDryRun ? 'required' : 'recommended'),
    check('Dispatch plan evidence exists',
      !!dispatchPlan?.generatedAt,
      'run npm run mobile:release-dispatch-plan:save before final launch review',
      dispatchPlan ? 'required' : 'recommended'),
    check('Production API performance smoke script exists',
      rootPackage.scripts['mobile:api-performance-smoke'] === 'node scripts/mobile-api-performance-smoke.js',
      'production launch should be able to measure health, job-accepted, first-progress, and measured-result latency'),
    check('Production API performance smoke evidence exists',
      !!performanceSmoke?.generatedAt,
      'run npm run mobile:api-performance-smoke:save after the production API is deployed',
      'external'),
    check('Root verification includes mobile launch SLA',
      /mobile-launch-sla-report\.js/.test(rootPackage.scripts['verify:mobile'] || '')
        && rootPackage.scripts['mobile:launch-sla'] === 'node scripts/mobile-launch-sla-report.js',
      'verify:mobile should fail if the launch SLA report regresses'),
    check('Root verification includes mobile UI release gate',
      /mobile-ui-release-gate\.js/.test(rootPackage.scripts['verify:mobile'] || '')
        && rootPackage.scripts['mobile:ui-release-gate'] === 'node scripts/mobile-ui-release-gate.js',
      'verify:mobile should fail if mobile UI release quality regresses'),
  ];

  const summary = summarize(checks);
  const externalBlockers = checks.filter((item) => !item.ok && item.severity === 'external');

  return {
    generatedAt: new Date().toISOString(),
    ok: summary.failedRequired === 0,
    releaseReady: summary.failedRequired === 0 && summary.failedExternal === 0,
    summary,
    checks,
    blockers: checks.filter((item) => !item.ok),
    products: endpointProducts,
    paritySla: MOBILE_PC_PARITY_SLA,
    runtimeReadiness: {
      ok: runtimeReadiness.ok,
      summary: runtimeReadiness.summary,
      blockers: runtimeReadiness.blockers,
    },
    storeSubmission: {
      ok: storeSubmission.ok,
      summary: storeSubmission.summary,
      copyPasteFiles: storeSubmission.copyPasteFiles,
    },
    uiReleaseGate: {
      ok: uiReleaseGate.ok,
      summary: uiReleaseGate.summary,
      blockers: uiReleaseGate.blockers,
      artifact: '.codex-build-cache/mobile-ui-release-gate.json',
    },
    releaseEvidence: {
      dryRunOk: releaseDryRun?.ok === true,
      dispatchReady: dispatchPlan?.readyToDispatch === true,
      performanceSmokeOk: performanceSmoke?.ok === true,
      dryRunArtifact: '.codex-build-cache/mobile-release-dry-run.json',
      dispatchArtifact: '.codex-build-cache/mobile-release-dispatch-plan.json',
      performanceSmokeArtifact: '.codex-build-cache/mobile-api-performance-smoke.json',
    },
    nextCommands: externalBlockers.length > 0
      ? [
        'npm run mobile:github-setup-plan:save -- --target full-release --submit true --smoke true',
        'npm run mobile:release-dry-run:save -- --target full-release --submit true --smoke true',
        'npm run mobile:release-dispatch-plan:save -- --target full-release --submit true --smoke true',
        'npm run mobile:api-smoke',
        'npm run mobile:api-performance-smoke:save',
      ]
      : [
        'npm run mobile:release-dispatch-plan:save -- --target full-release --submit true --smoke true',
        'npm run mobile:api-performance-smoke:save',
        'gh workflow run mobile-release.yml --ref main -f target=full-release -f submit_to_stores=true -f run_api_smoke=true',
      ],
  };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const report = collectMobileLaunchSlaReport();
  const written = writeJson(report, readArg(argv, '--out', ''));
  console.log(JSON.stringify({ ...report, written }, null, 2));
  process.exit(argv.includes('--strict') && !report.releaseReady ? 1 : (report.ok ? 0 : 1));
}

module.exports = {
  collectMobileLaunchSlaReport,
};
