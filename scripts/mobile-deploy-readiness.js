const fs = require('fs');
const path = require('path');

const { collectReleaseAudit } = require('./mobile-release-audit');

const root = path.join(__dirname, '..');

function isProductionHttpsUrl(url) {
  return /^https:\/\/[^/]+/i.test(String(url || ''))
    && !/localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|\.example(?:\/|$)|\.invalid(?:\/|$)|\.test(?:\/|$)|leword\.example(?:\/|$)/i.test(String(url || ''));
}

function check(name, ok, detail, severity = 'required') {
  return { name, ok: !!ok, detail, severity };
}

function summarize(checks) {
  return {
    passed: checks.filter((item) => item.ok).length,
    failedRequired: checks.filter((item) => !item.ok && item.severity === 'required').length,
    failedExternal: checks.filter((item) => !item.ok && item.severity === 'external').length,
  };
}

function readJsonIfExists(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) return null;
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function parsePlatformArg(argv) {
  const equalsArg = argv.find((arg) => arg.startsWith('--platform='));
  if (equalsArg) return equalsArg.split('=')[1] || 'all';
  const index = argv.indexOf('--platform');
  if (index >= 0) return argv[index + 1] || 'all';
  return 'all';
}

function parseSubmitArg(argv, fallback = true) {
  const equalsArg = argv.find((arg) => arg.startsWith('--submit='));
  if (equalsArg) {
    return ['1', 'true', 'yes', 'y'].includes(String(equalsArg.split('=')[1] || '').trim().toLowerCase());
  }
  const index = argv.indexOf('--submit');
  if (index >= 0) {
    return ['1', 'true', 'yes', 'y'].includes(String(argv[index + 1] || '').trim().toLowerCase());
  }
  return fallback;
}

function normalizePlatform(platform) {
  const value = String(platform || 'all').toLowerCase();
  if (value === 'android' || value === 'ios' || value === 'all') return value;
  throw new Error('mobile deploy readiness platform must be android, ios, or all');
}

function collectMobileDeployReadiness(options = {}) {
  const env = options.env || process.env;
  const audit = options.audit || collectReleaseAudit();
  const storeCompliance = options.storeCompliance || readJsonIfExists('docs/mobile-store-compliance.json');
  const platform = normalizePlatform(options.platform);
  const submitToStores = options.submitToStores ?? true;
  const androidSubmitProfile = options.androidSubmitProfile || 'internal';
  const productionApiUrl = (env.EXPO_PUBLIC_LEWORD_API_URL || '').trim();
  const easProjectId = (env.EXPO_PUBLIC_EAS_PROJECT_ID || '').trim();
  const smokeApiUrl = (env.LEWORD_MOBILE_SMOKE_API_URL || productionApiUrl || '').trim();
  const privacyUrl = (env.EXPO_PUBLIC_LEWORD_PRIVACY_URL || storeCompliance?.privacyPolicyUrl || '').trim();

  const checks = [
    check('Local code gates are green', audit.releaseStatus?.codeReady === true, 'npm run verify:all'),
    check('Production API deployment package is ready', audit.releaseStatus?.apiDeployReady === true, 'npm run mobile:api-deploy-gate'),
    check('Store listing metadata is ready', audit.releaseStatus?.storeListingReady === true, 'npm run mobile:store-listing'),
    check('Store visual assets are ready', audit.releaseStatus?.storeAssetsReady === true, 'npm run mobile:store-assets'),
    check('Android JS export exists', audit.releaseStatus?.androidJsExportReady === true, 'npm run mobile:export:android'),
    check('Production API URL is HTTPS', isProductionHttpsUrl(productionApiUrl), 'set EXPO_PUBLIC_LEWORD_API_URL to the deployed HTTPS API', 'external'),
    check('Expo project id is configured', !!easProjectId, 'set EXPO_PUBLIC_EAS_PROJECT_ID for EAS build and push tokens', 'external'),
    check('EAS auth is available', !!(env.EXPO_TOKEN || '').trim(), 'set EXPO_TOKEN for non-interactive build/submit, or log in before running EAS locally', 'external'),
    check('Production API worker is ready', audit.releaseStatus?.apiRuntimeReady === true, 'set Naver, entitlement, cache, prewarm, and push env on API worker', 'external'),
    check('Deployed API smoke URL is production HTTPS', isProductionHttpsUrl(smokeApiUrl), 'set LEWORD_MOBILE_SMOKE_API_URL and run npm run mobile:api-smoke', 'external'),
    check('Store compliance manifest exists', !!storeCompliance, 'docs/mobile-store-compliance.json'),
    check('Privacy policy URL is production HTTPS', isProductionHttpsUrl(privacyUrl), 'set EXPO_PUBLIC_LEWORD_PRIVACY_URL or docs/mobile-store-compliance.json privacyPolicyUrl', 'external'),
  ];

  if (submitToStores && (platform === 'android' || platform === 'all')) {
    const usesPublicProfile = androidSubmitProfile === 'public';
    checks.push(check(
      usesPublicProfile ? 'Android public submit credentials are ready' : 'Android submit credentials are ready',
      usesPublicProfile
        ? audit.releaseStatus?.androidPublicSubmitReady === true
        : audit.releaseStatus?.androidSubmitReady === true,
      usesPublicProfile
        ? 'configure submit.public.android and Google Play service account credentials'
        : 'add apps/mobile/credentials/google-play-service-account.json',
      'external',
    ));
  }

  if (submitToStores && (platform === 'ios' || platform === 'all')) {
    checks.push(check('iOS submit credentials are ready', audit.releaseStatus?.iosSubmitReady === true, 'replace iOS placeholders and set Apple submit credentials', 'external'));
  }

  const summary = summarize(checks);
  return {
    generatedAt: new Date().toISOString(),
    platform,
    submitToStores,
    ok: summary.failedRequired === 0 && summary.failedExternal === 0,
    summary,
    checks,
    blockers: checks.filter((item) => !item.ok),
    nextCommands: {
      androidInternal: [
        'npm run mobile:deploy-readiness:android',
        'npm run mobile:deploy:android:internal',
        'npm run mobile:api-smoke',
      ],
      iosTestFlight: [
        'npm run mobile:deploy-readiness:ios',
        'npm run mobile:deploy:ios:testflight',
        'npm run mobile:api-smoke',
      ],
    },
  };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const report = collectMobileDeployReadiness({
    platform: parsePlatformArg(argv),
    submitToStores: parseSubmitArg(argv, true),
  });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

module.exports = {
  collectMobileDeployReadiness,
  isProductionHttpsUrl,
  normalizePlatform,
  parsePlatformArg,
  parseSubmitArg,
};
