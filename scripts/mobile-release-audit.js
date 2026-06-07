const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

require('ts-node/register/transpile-only');

const {
  getMobileRuntimeReadiness,
} = require('../src/mobile/runtime-readiness');
const {
  collectMobileApiDeployGate,
} = require('./mobile-api-deploy-gate');
const {
  collectMobileStoreListingGate,
} = require('./mobile-store-listing-gate');
const {
  collectMobileStoreAssetsGate,
} = require('./mobile-store-assets-gate');
const {
  collectMobileUiReleaseGate,
} = require('./mobile-ui-release-gate');

const root = path.join(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function sha256(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function fileSize(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return fs.statSync(filePath).size;
}

function isPlaceholder(value) {
  return !value || /^REPLACE_|YOUR_|TODO|CHANGE_ME/i.test(String(value));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.timeout || 30000,
  });
  return {
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

function collectGitState() {
  const commit = run('git', ['rev-parse', '--short', 'HEAD']);
  const branch = run('git', ['branch', '--show-current']);
  const status = run('git', ['status', '--short']);
  return {
    commit: commit.status === 0 ? commit.stdout : null,
    branch: branch.status === 0 ? branch.stdout : null,
    dirty: status.status === 0 ? status.stdout.length > 0 : null,
  };
}

function collectReadiness() {
  const result = run('node', ['scripts/mobile-readiness-report.js'], { timeout: 60000 });
  if (result.status !== 0) {
    return {
      ok: false,
      error: result.stderr || result.stdout || 'mobile readiness failed',
    };
  }
  return JSON.parse(result.stdout);
}

function collectAndroidExport() {
  const metadataPath = path.join(root, 'apps', 'mobile', '.expo-export', 'android', 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    return {
      exists: false,
      metadataPath: 'apps/mobile/.expo-export/android/metadata.json',
      bundlePath: null,
      bundleBytes: null,
      bundleSha256: null,
    };
  }

  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  const bundleRel = metadata?.fileMetadata?.android?.bundle || null;
  const bundlePath = bundleRel ? path.join(path.dirname(metadataPath), bundleRel) : null;
  return {
    exists: true,
    metadataPath: 'apps/mobile/.expo-export/android/metadata.json',
    bundlePath: bundleRel ? `apps/mobile/.expo-export/android/${bundleRel.replace(/\\/g, '/')}` : null,
    bundleBytes: fileSize(bundlePath),
    bundleSha256: sha256(bundlePath),
    metadataSha256: sha256(metadataPath),
  };
}

function collectAndroidSubmitReadiness(android, expectedTrack) {
  const androidServiceAccountPath = android?.serviceAccountKeyPath
    ? path.join(root, 'apps', 'mobile', android.serviceAccountKeyPath)
    : '';
  return {
    profileExists: !!android,
    track: android?.track || null,
    releaseStatus: android?.releaseStatus || null,
    serviceAccountKeyPath: android?.serviceAccountKeyPath || null,
    serviceAccountKeyExists: !!androidServiceAccountPath && fs.existsSync(androidServiceAccountPath),
    readyForSubmit: !!android
      && android.track === expectedTrack
      && android.releaseStatus === 'draft'
      && !!androidServiceAccountPath
      && fs.existsSync(androidServiceAccountPath),
  };
}

function collectIosSubmitReadiness(ios) {
  const iosAscApiKeyPathValue = process.env.EXPO_ASC_API_KEY_PATH || ios?.ascApiKeyPath;
  const iosAscApiKeyPath = iosAscApiKeyPathValue
    ? (path.isAbsolute(iosAscApiKeyPathValue)
      ? iosAscApiKeyPathValue
      : path.join(root, 'apps', 'mobile', iosAscApiKeyPathValue))
    : '';
  const iosAscApiKeyIssuerId = process.env.EXPO_ASC_API_KEY_ISSUER_ID || ios?.ascApiKeyIssuerId;
  const iosAscApiKeyId = process.env.EXPO_ASC_API_KEY_ID || ios?.ascApiKeyId;
  const iosHasApiKey = !!iosAscApiKeyPath
    && fs.existsSync(iosAscApiKeyPath)
    && !isPlaceholder(iosAscApiKeyIssuerId)
    && !isPlaceholder(iosAscApiKeyId);
  const iosHasPassword = !!(process.env.EXPO_APPLE_APP_SPECIFIC_PASSWORD || '').trim();

  return {
    profileExists: !!ios,
    ascAppIdConfigured: !!ios && !isPlaceholder(process.env.EXPO_ASC_APP_ID || ios.ascAppId),
    appleTeamIdConfigured: !!ios && !isPlaceholder(process.env.EXPO_APPLE_TEAM_ID || ios.appleTeamId),
    appleIdConfigured: !!ios && !isPlaceholder(process.env.EXPO_APPLE_ID || ios.appleId),
    hasAscApiKey: iosHasApiKey,
    hasAppSpecificPassword: iosHasPassword,
    readyForSubmit: !!ios
      && !isPlaceholder(process.env.EXPO_ASC_APP_ID || ios.ascAppId)
      && !isPlaceholder(process.env.EXPO_APPLE_TEAM_ID || ios.appleTeamId)
      && !isPlaceholder(process.env.EXPO_APPLE_ID || ios.appleId)
      && (iosHasApiKey || iosHasPassword),
  };
}

function collectSubmitReadiness(easConfig) {
  const internalAndroid = easConfig.submit?.production?.android || null;
  const publicAndroid = easConfig.submit?.public?.android || null;
  const ios = easConfig.submit?.production?.ios || null;
  const publicIos = easConfig.submit?.public?.ios || ios;

  return {
    android: collectAndroidSubmitReadiness(internalAndroid, 'internal'),
    androidPublic: collectAndroidSubmitReadiness(publicAndroid, 'production'),
    ios: collectIosSubmitReadiness(ios),
    iosPublic: collectIosSubmitReadiness(publicIos),
  };
}

function collectReleaseAudit() {
  const rootPackage = readJson('package.json');
  const mobilePackage = readJson('apps/mobile/package.json');
  const appConfig = readJson('apps/mobile/app.json');
  const easConfig = readJson('apps/mobile/eas.json');
  const readiness = collectReadiness();
  const runtime = getMobileRuntimeReadiness();
  const apiDeployGate = collectMobileApiDeployGate();
  const storeListingGate = collectMobileStoreListingGate();
  const storeAssetsGate = collectMobileStoreAssetsGate();
  const uiReleaseGate = collectMobileUiReleaseGate();
  const androidExport = collectAndroidExport();
  const submitReadiness = collectSubmitReadiness(easConfig);

  return {
    generatedAt: new Date().toISOString(),
    app: {
      rootVersion: rootPackage.version,
      mobileVersion: mobilePackage.version,
      expoVersion: mobilePackage.dependencies.expo,
      reactNativeVersion: mobilePackage.dependencies['react-native'],
      androidPackage: appConfig.expo?.android?.package,
      androidVersionCode: appConfig.expo?.android?.versionCode,
      iosBundleIdentifier: appConfig.expo?.ios?.bundleIdentifier,
      iosBuildNumber: appConfig.expo?.ios?.buildNumber,
    },
    git: collectGitState(),
    eas: {
      cliVersion: easConfig.cli?.version || null,
      appVersionSource: easConfig.cli?.appVersionSource || null,
      profiles: Object.keys(easConfig.build || {}),
      internalAndroidBuildType: easConfig.build?.internal?.android?.buildType || null,
      productionAndroidBuildType: easConfig.build?.production?.android?.buildType || 'app-bundle',
      productionChannel: easConfig.build?.production?.channel || null,
      submitProfiles: Object.keys(easConfig.submit || {}),
      androidSubmitTrack: easConfig.submit?.production?.android?.track || null,
      androidPublicSubmitTrack: easConfig.submit?.public?.android?.track || null,
      iosSubmitConfigured: submitReadiness.ios.readyForSubmit,
      iosPublicSubmitConfigured: submitReadiness.iosPublic.readyForSubmit,
    },
    artifacts: {
      androidExport,
      releaseSecretScan: {
        path: '.codex-build-cache/mobile-release-secret-scan.json',
        exists: exists('.codex-build-cache/mobile-release-secret-scan.json'),
      },
    },
    gates: {
      verifyAll: rootPackage.scripts['verify:all'] || null,
      verifyMobile: rootPackage.scripts['verify:mobile'] || null,
      productionGate: rootPackage.scripts['mobile:release-gate:production'] || null,
      storeCompliance: rootPackage.scripts['mobile:store-compliance'] || null,
      storeListing: rootPackage.scripts['mobile:store-listing'] || null,
      storeAssets: rootPackage.scripts['mobile:store-assets'] || null,
      uiReleaseGate: rootPackage.scripts['mobile:ui-release-gate'] || null,
      uiReleaseGateSave: rootPackage.scripts['mobile:ui-release-gate:save'] || null,
      storeSubmissionPackage: rootPackage.scripts['mobile:store-submission-package'] || null,
      storeSubmissionPackageSave: rootPackage.scripts['mobile:store-submission-package:save'] || null,
      launchSla: rootPackage.scripts['mobile:launch-sla'] || null,
      launchSlaSave: rootPackage.scripts['mobile:launch-sla:save'] || null,
      apiRuntimeGate: rootPackage.scripts['mobile:api-runtime-gate'] || null,
      apiDeployGate: rootPackage.scripts['mobile:api-deploy-gate'] || null,
      apiDockerBuild: rootPackage.scripts['mobile:api:docker:build'] || null,
      apiSmoke: rootPackage.scripts['mobile:api-smoke'] || null,
      apiPerformanceSmoke: rootPackage.scripts['mobile:api-performance-smoke'] || null,
      apiPerformanceSmokeSave: rootPackage.scripts['mobile:api-performance-smoke:save'] || null,
      releaseKit: rootPackage.scripts['mobile:release-kit'] || null,
      releaseKitSave: rootPackage.scripts['mobile:release-kit:save'] || null,
      releaseDryRun: rootPackage.scripts['mobile:release-dry-run'] || null,
      releaseDryRunSave: rootPackage.scripts['mobile:release-dry-run:save'] || null,
      releaseDispatchPlan: rootPackage.scripts['mobile:release-dispatch-plan'] || null,
      releaseDispatchPlanSave: rootPackage.scripts['mobile:release-dispatch-plan:save'] || null,
      releaseStatus: rootPackage.scripts['mobile:release-status'] || null,
      releaseStatusSave: rootPackage.scripts['mobile:release-status:save'] || null,
      releaseSecretScan: rootPackage.scripts['mobile:release-secret-scan'] || null,
      releaseSecretScanSave: rootPackage.scripts['mobile:release-secret-scan:save'] || null,
      publicReleaseGate: rootPackage.scripts['mobile:public-release-gate'] || null,
      publicReleaseGateAndroid: rootPackage.scripts['mobile:public-release-gate:android'] || null,
      publicReleaseGateAndroidSave: rootPackage.scripts['mobile:public-release-gate:android:save'] || null,
      publicReleaseGateSave: rootPackage.scripts['mobile:public-release-gate:save'] || null,
      cloudGate: rootPackage.scripts['mobile:release-gate:cloud'] || null,
      ciSecretsGate: rootPackage.scripts['mobile:ci-secrets-gate'] || null,
      androidSubmitGate: rootPackage.scripts['mobile:submit-gate:android'] || null,
      iosSubmitGate: rootPackage.scripts['mobile:submit-gate:ios'] || null,
      submitConfigMaterialize: rootPackage.scripts['mobile:submit-config:materialize'] || null,
      deployReadiness: rootPackage.scripts['mobile:deploy-readiness'] || null,
      androidDeployReadiness: rootPackage.scripts['mobile:deploy-readiness:android'] || null,
      iosDeployReadiness: rootPackage.scripts['mobile:deploy-readiness:ios'] || null,
      androidDeploy: rootPackage.scripts['mobile:deploy:android:internal'] || null,
      iosDeploy: rootPackage.scripts['mobile:deploy:ios:testflight'] || null,
    },
    readiness,
    runtime,
    apiDeployGate,
    storeListingGate,
    storeAssetsGate,
    uiReleaseGate,
    submitReadiness,
    releaseStatus: {
      codeReady: readiness?.summary?.failedRequired === 0,
      apiDeployReady: apiDeployGate.ok,
      storeListingReady: storeListingGate.ok,
      storeAssetsReady: storeAssetsGate.ok,
      uiReady: uiReleaseGate.ok,
      apiRuntimeReady: runtime.ok,
      androidJsExportReady: androidExport.exists && !!androidExport.bundleSha256,
      androidSubmitReady: submitReadiness.android.readyForSubmit,
      androidPublicSubmitReady: submitReadiness.androidPublic.readyForSubmit,
      iosSubmitReady: submitReadiness.ios.readyForSubmit,
      iosPublicSubmitReady: submitReadiness.iosPublic.readyForSubmit,
      externalBlockers: [
        ...(Array.isArray(readiness?.blockers) ? readiness.blockers : []),
        ...(Array.isArray(runtime?.blockers) ? runtime.blockers.filter((item) => item.severity === 'required') : []),
        ...(Array.isArray(apiDeployGate?.blockers) ? apiDeployGate.blockers : []),
        ...(Array.isArray(storeListingGate?.blockers) ? storeListingGate.blockers.filter((item) => item.severity === 'required') : []),
        ...(Array.isArray(storeAssetsGate?.blockers) ? storeAssetsGate.blockers.filter((item) => item.severity === 'required') : []),
        ...(Array.isArray(uiReleaseGate?.blockers) ? uiReleaseGate.blockers.filter((item) => item.severity === 'required') : []),
        ...(!submitReadiness.android.readyForSubmit ? [{
          name: 'Android submit credentials configured',
          detail: 'add apps/mobile/credentials/google-play-service-account.json for Google Play internal-track submit',
          severity: 'external',
        }] : []),
        ...(!submitReadiness.androidPublic.readyForSubmit ? [{
          name: 'Android public submit credentials configured',
          detail: 'configure submit.public.android with production track and Google Play service account credentials',
          severity: 'external',
        }] : []),
        ...(!submitReadiness.ios.readyForSubmit ? [{
          name: 'iOS submit credentials configured',
          detail: 'replace iOS submit placeholders and provide EXPO_APPLE_APP_SPECIFIC_PASSWORD or App Store Connect API key fields',
          severity: 'external',
        }] : []),
      ].map((item) => ({
        name: item.name,
        detail: item.detail,
        severity: item.severity,
      })),
    },
  };
}

function parseOutPath(argv) {
  const outIndex = argv.indexOf('--out');
  if (outIndex === -1) return '';
  return argv[outIndex + 1] || '';
}

function writeReleaseAudit(report, outPath) {
  if (!outPath) return null;
  const resolved = path.isAbsolute(outPath) ? outPath : path.join(root, outPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return resolved;
}

if (require.main === module) {
  const report = collectReleaseAudit();
  const writtenPath = writeReleaseAudit(report, parseOutPath(process.argv.slice(2)));
  console.log(JSON.stringify(report, null, 2));
  if (writtenPath) {
    console.error(`[mobile-release-audit] wrote ${writtenPath}`);
  }
  if (
    !report.releaseStatus.codeReady
    || !report.releaseStatus.storeListingReady
    || !report.releaseStatus.storeAssetsReady
    || !report.releaseStatus.uiReady
    || !report.releaseStatus.androidJsExportReady
  ) {
    process.exit(1);
  }
}

module.exports = {
  collectReleaseAudit,
  writeReleaseAudit,
};
