const fs = require('fs');
const path = require('path');

const { collectReleaseAudit } = require('./mobile-release-audit');
const { collectMobileCiSecretsGate, normalizeTarget } = require('./mobile-ci-secrets-gate');
const { collectMobileDeployReadiness, normalizePlatform } = require('./mobile-deploy-readiness');

const root = path.join(__dirname, '..');

function readArg(argv, name, fallback = '') {
  const equals = argv.find((arg) => arg.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? (argv[index + 1] || fallback) : fallback;
}

function isTruthy(value) {
  return ['1', 'true', 'yes', 'y'].includes(String(value || '').trim().toLowerCase());
}

function parseOutPath(argv) {
  return readArg(argv, '--out', '');
}

function platformForTarget(target, explicitPlatform) {
  if (explicitPlatform) return normalizePlatform(explicitPlatform);
  if (target === 'android-internal' || target === 'android-public') return 'android';
  if (target === 'ios-testflight') return 'ios';
  return 'all';
}

function targetNeedsAppDeploy(target) {
  return target === 'android-internal' || target === 'android-public' || target === 'ios-testflight' || target === 'full-release';
}

function targetNeedsApiImage(target) {
  return target === 'api-image' || target === 'full-release';
}

function check(name, ok, detail, severity = 'required') {
  return { name, ok: !!ok, detail, severity };
}

function dedupeBlockers(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.name}|${item.detail}|${item.severity}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function requiredInputsForTarget(target, submitToStores, runApiSmoke) {
  const variables = [];
  const secrets = [];

  if (targetNeedsAppDeploy(target)) {
    variables.push(
      'LEWORD_MOBILE_API_URL',
      'EXPO_PUBLIC_EAS_PROJECT_ID',
      'LEWORD_PRIVACY_URL',
      'LEWORD_MOBILE_ENTITLEMENT_URL',
      'LEWORD_MOBILE_PREWARM_INTERVAL_MINUTES',
    );
    secrets.push(
      'EXPO_TOKEN',
      'NAVER_CLIENT_ID',
      'NAVER_CLIENT_SECRET',
      'NAVER_SEARCH_AD_ACCESS_LICENSE',
      'NAVER_SEARCH_AD_SECRET_KEY',
      'NAVER_SEARCH_AD_CUSTOMER_ID',
    );
  }

  if (runApiSmoke) {
    secrets.push('LEWORD_MOBILE_SMOKE_TOKEN');
  }

  if (submitToStores && (target === 'android-internal' || target === 'android-public' || target === 'full-release')) {
    secrets.push('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64');
  }

  if (target === 'android-public') {
    secrets.push('LEWORD_MOBILE_REVIEWER_TOKEN_READY');
  }

  if (submitToStores && (target === 'ios-testflight' || target === 'full-release')) {
    secrets.push(
      'EXPO_APPLE_ID',
      'EXPO_ASC_APP_ID',
      'EXPO_APPLE_TEAM_ID',
      'EXPO_APPLE_APP_SPECIFIC_PASSWORD or EXPO_ASC_API_KEY_P8_B64 + EXPO_ASC_API_KEY_ISSUER_ID + EXPO_ASC_API_KEY_ID',
    );
  }

  return {
    variables: [...new Set(variables)],
    secrets: [...new Set(secrets)],
  };
}

function buildNextCommands(target, submitToStores, runApiSmoke) {
  const commands = ['npm run verify:all', 'npm run mobile:release-audit:save', 'npm run mobile:release-kit:save'];

  if (target === 'api-image' || target === 'full-release') {
    commands.push('npm run mobile:api-deploy-gate');
    commands.push('npm run mobile:api:docker:build');
  }

  if (target === 'android-internal' || target === 'full-release') {
    commands.push('npm run mobile:deploy-readiness:android');
    commands.push('npm run mobile:build:android:internal');
    if (submitToStores) {
      commands.push('npm run mobile:submit-config:materialize');
      commands.push('npm run mobile:build:android:production');
      commands.push('npm run mobile:submit:android:internal');
    }
  }

  if (target === 'android-public') {
    commands.push('npm run mobile:deploy-readiness:android');
    commands.push('npm run mobile:submit-config:materialize');
    commands.push('npm run mobile:build:android:production');
    commands.push('npm run mobile:public-release-gate:android');
    commands.push('npm run mobile:submit:android:public');
  }

  if (target === 'ios-testflight' || target === 'full-release') {
    commands.push('npm run mobile:deploy-readiness:ios');
    commands.push('npm run mobile:build:ios:testflight');
    if (submitToStores) {
      commands.push('npm run mobile:submit-config:materialize');
      commands.push('npm run mobile:submit:ios:testflight');
    }
  }

  if (runApiSmoke) {
    commands.push('npm run mobile:api-smoke');
  }

  return [...new Set(commands)];
}

function collectMobileReleaseKit(options = {}) {
  const argv = options.argv || [];
  const env = options.env || process.env;
  const target = normalizeTarget(options.target || readArg(argv, '--target', env.MOBILE_RELEASE_TARGET || 'verify-only'));
  const submitToStores = options.submitToStores ?? isTruthy(readArg(argv, '--submit', env.SUBMIT_TO_STORES || 'false'));
  const runApiSmoke = options.runApiSmoke ?? isTruthy(readArg(argv, '--smoke', env.RUN_API_SMOKE || 'false'));
  const platform = platformForTarget(target, options.platform || readArg(argv, '--platform', ''));

  const audit = options.audit || collectReleaseAudit();
  const ciInputs = options.ciInputs || collectMobileCiSecretsGate({ target, submitToStores, runApiSmoke, env });
  const deployReadiness = targetNeedsAppDeploy(target)
    ? (options.deployReadiness || collectMobileDeployReadiness({
      platform,
      submitToStores,
      env,
      audit,
      storeCompliance: options.storeCompliance,
      androidSubmitProfile: target === 'android-public' ? 'public' : 'internal',
    }))
    : null;

  const releaseStatus = audit.releaseStatus || {};
  const checks = [
    check('Local release evidence is ready',
      releaseStatus.codeReady === true
        && releaseStatus.storeListingReady === true
        && releaseStatus.storeAssetsReady === true
        && releaseStatus.uiReady === true
        && releaseStatus.androidJsExportReady === true,
      'verify, mobile UI, store listing/assets, and Android JS export must be green'),
    check('Selected CI inputs are ready', ciInputs.ok === true, `target=${target}; submit=${submitToStores}; smoke=${runApiSmoke}`),
    check('API image package is ready when needed',
      !targetNeedsApiImage(target) || releaseStatus.apiDeployReady === true,
      'api-image and full-release targets need the API Docker/GHCR package'),
    check('App deploy readiness is green when needed',
      !targetNeedsAppDeploy(target) || deployReadiness?.ok === true,
      'Android/iOS/full release targets need production API, EAS, runtime, privacy, and store credentials'),
  ];

  const summary = {
    passed: checks.filter((item) => item.ok).length,
    failedRequired: checks.filter((item) => !item.ok && item.severity === 'required').length,
    ciFailedRequired: ciInputs.summary?.failedRequired || 0,
    deployFailedRequired: deployReadiness?.summary?.failedRequired || 0,
    deployFailedExternal: deployReadiness?.summary?.failedExternal || 0,
  };

  const blockers = dedupeBlockers([
    ...checks.filter((item) => !item.ok),
    ...(Array.isArray(ciInputs.blockers) ? ciInputs.blockers : []),
    ...(Array.isArray(deployReadiness?.blockers) ? deployReadiness.blockers : []),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    target,
    platform,
    submitToStores,
    runApiSmoke,
    ok: summary.failedRequired === 0
      && summary.ciFailedRequired === 0
      && summary.deployFailedRequired === 0
      && summary.deployFailedExternal === 0,
    summary,
    checks,
    blockers,
    requiredInputs: requiredInputsForTarget(target, submitToStores, runApiSmoke),
    releaseStatus: {
      codeReady: releaseStatus.codeReady === true,
      apiDeployReady: releaseStatus.apiDeployReady === true,
      storeListingReady: releaseStatus.storeListingReady === true,
      storeAssetsReady: releaseStatus.storeAssetsReady === true,
      uiReady: releaseStatus.uiReady === true,
      apiRuntimeReady: releaseStatus.apiRuntimeReady === true,
      androidJsExportReady: releaseStatus.androidJsExportReady === true,
      androidSubmitReady: releaseStatus.androidSubmitReady === true,
      androidPublicSubmitReady: releaseStatus.androidPublicSubmitReady === true,
      iosSubmitReady: releaseStatus.iosSubmitReady === true,
      iosPublicSubmitReady: releaseStatus.iosPublicSubmitReady === true,
    },
    ciInputs,
    deployReadiness,
    nextCommands: buildNextCommands(target, submitToStores, runApiSmoke),
  };
}

function writeMobileReleaseKit(report, outPath) {
  if (!outPath) return null;
  const resolved = path.isAbsolute(outPath) ? outPath : path.join(root, outPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return resolved;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const report = collectMobileReleaseKit({ argv });
  const writtenPath = writeMobileReleaseKit(report, parseOutPath(argv));
  console.log(JSON.stringify(report, null, 2));
  if (writtenPath) {
    console.error(`[mobile-release-kit] wrote ${writtenPath}`);
  }
  process.exit(argv.includes('--strict') && !report.ok ? 1 : 0);
}

module.exports = {
  buildNextCommands,
  collectMobileReleaseKit,
  platformForTarget,
  requiredInputsForTarget,
  targetNeedsAppDeploy,
  targetNeedsApiImage,
  writeMobileReleaseKit,
};
