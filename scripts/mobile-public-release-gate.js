const fs = require('fs');
const path = require('path');

const {
  collectReleaseAudit,
} = require('./mobile-release-audit');

const root = path.join(__dirname, '..');

function readArg(argv, name, fallback = '') {
  const equals = argv.find((arg) => arg.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? (argv[index + 1] || fallback) : fallback;
}

function normalizePlatform(value = 'all') {
  const normalized = String(value || 'all').trim().toLowerCase();
  if (normalized === 'android' || normalized === 'ios' || normalized === 'all') return normalized;
  throw new Error(`Unsupported public release platform: ${value}`);
}

function readJson(relativePath, fallback = null) {
  const resolved = path.join(root, relativePath);
  if (!fs.existsSync(resolved)) return fallback;
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
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

function isTruthy(value) {
  return ['1', 'true', 'yes', 'y'].includes(String(value || '').trim().toLowerCase());
}

function check(name, ok, detail, severity = 'required') {
  return { name, ok: !!ok, detail, severity };
}

function summarize(checks) {
  return {
    passed: checks.filter((item) => item.ok).length,
    failedRequired: checks.filter((item) => !item.ok && item.severity === 'required').length,
    failedExternal: checks.filter((item) => !item.ok && item.severity === 'external').length,
    failedRecommended: checks.filter((item) => !item.ok && item.severity !== 'required' && item.severity !== 'external').length,
  };
}

function collectText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(collectText).join('\n');
  if (typeof value === 'object') return Object.values(value).map(collectText).join('\n');
  return '';
}

function hasReadableKoreanStoreCopy(storeListing) {
  const text = [
    storeListing?.googlePlay?.shortDescription,
    storeListing?.googlePlay?.fullDescription,
    storeListing?.googlePlay?.releaseNotes,
    storeListing?.appStore?.subtitle,
    storeListing?.appStore?.promotionalText,
    storeListing?.appStore?.description,
    storeListing?.appStore?.keywords,
  ].map(collectText).join('\n');
  const hangulCount = (text.match(/[\uAC00-\uD7A3]/g) || []).length;
  const mojibakeScore = (text.match(/[\uFFFD\u4E00-\u9FFF\uF900-\uFAFF]/g) || []).length;
  return hangulCount >= 40 && mojibakeScore < Math.max(12, hangulCount / 4);
}

function hasProductionHttpsUrl(value) {
  return /^https:\/\/[^/]+/.test(String(value || ''))
    && !/localhost|127\.0\.0\.1|\.example|\.test|\.invalid/i.test(String(value || ''));
}

function isLocalPathInsideRoot(value) {
  const resolved = path.isAbsolute(value) ? value : path.join(root, value);
  const relative = path.relative(root, resolved);
  return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function hasReleaseEvidenceReference(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return false;
  if (/^https?:\/\//i.test(trimmed)) return hasProductionHttpsUrl(trimmed);
  if (!isLocalPathInsideRoot(trimmed)) return false;
  const resolved = path.isAbsolute(trimmed) ? trimmed : path.join(root, trimmed);
  return fs.existsSync(resolved);
}

function loadPerformanceSmoke(options) {
  if (options.performanceSmoke !== undefined) return options.performanceSmoke;
  return readJson('.codex-build-cache/mobile-api-performance-smoke.json', null);
}

function getDefaultPublicGateArtifact(platform) {
  if (platform === 'android') return '.codex-build-cache/mobile-public-release-gate-android.json';
  if (platform === 'ios') return '.codex-build-cache/mobile-public-release-gate-ios.json';
  return '.codex-build-cache/mobile-public-release-gate.json';
}

function isLocalEvidenceReady(releaseStatus) {
  return releaseStatus.codeReady === true
    && releaseStatus.apiDeployReady === true
    && releaseStatus.storeListingReady === true
    && releaseStatus.storeAssetsReady === true
    && releaseStatus.uiReady === true
    && releaseStatus.androidJsExportReady === true;
}

function collectMobilePublicReleaseGate(options = {}) {
  const env = options.env || process.env;
  const platform = normalizePlatform(options.platform || 'all');
  const needsAndroid = platform === 'all' || platform === 'android';
  const needsIos = platform === 'all' || platform === 'ios';
  const audit = options.audit || collectReleaseAudit();
  const releaseStatus = audit.releaseStatus || {};
  const storeAssets = options.storeAssets || readJson('docs/mobile-store-assets.json', {});
  const storeListing = options.storeListing || readJson('docs/mobile-store-listing.json', {});
  const compliance = options.compliance || readJson('docs/mobile-store-compliance.json', {});
  const performanceSmoke = loadPerformanceSmoke(options);
  const publicEvidence = storeAssets.publicReleaseEvidence || {};
  const publicGateCommand = platform === 'android'
    ? 'npm run mobile:public-release-gate:android'
    : platform === 'ios'
      ? 'node scripts/mobile-public-release-gate.js --platform ios'
      : 'npm run mobile:public-release-gate';
  const publicGateArtifact = options.publicGateArtifact || getDefaultPublicGateArtifact(platform);
  const codeReady = isLocalEvidenceReady(releaseStatus);
  const deviceCapturedReady = publicEvidence.deviceCapturedScreenshotsReady === true
    && publicEvidence.screenshotSource === 'device-captured'
    && hasReleaseEvidenceReference(publicEvidence.evidencePath);
  const reviewerTokenReady = isTruthy(env.LEWORD_MOBILE_REVIEWER_TOKEN_READY)
    || (publicEvidence.reviewerTokenReady === true
      && hasReleaseEvidenceReference(publicEvidence.reviewerTokenEvidencePath));

  const checks = [
    check('Local code, mobile UI, and store evidence are ready',
      codeReady,
      'verify:all, mobile UI, store listing/assets, and Android JS export must be green'),
    check('Production API runtime is ready',
      releaseStatus.apiRuntimeReady === true,
      'production worker needs Naver/SearchAd, entitlement, cache, prewarm, and push settings',
      'external'),
    check('Production API performance smoke is green',
      performanceSmoke?.ok === true,
      'run npm run mobile:api-performance-smoke:save against the deployed HTTPS API',
      'external'),
    ...(needsAndroid ? [check('Google Play public track is configured',
      audit.eas?.androidPublicSubmitTrack === 'production',
      'public release must not reuse the internal-track submit profile',
      'external')] : []),
    ...(needsAndroid ? [check('Android public submit credentials are ready',
      releaseStatus.androidPublicSubmitReady === true,
      'configure Google Play service account credentials before public release',
      'external')] : []),
    ...(needsIos ? [check('iOS App Store submit credentials are ready',
      (releaseStatus.iosPublicSubmitReady ?? releaseStatus.iosSubmitReady) === true,
      'configure Apple/App Store Connect credentials before public release',
      'external')] : []),
    check('Device-captured public screenshots are ready',
      deviceCapturedReady,
      'replace generated internal-track screenshots with device captures from the final EAS build and record an existing local evidence path or production HTTPS evidence URL',
      'external'),
    check('Store listing copy is readable Korean',
      hasReadableKoreanStoreCopy(storeListing),
      'store copy must not be mojibake or placeholder text'),
    check('Store contact URLs are production HTTPS',
      hasProductionHttpsUrl(storeListing.contact?.privacyPolicyUrl || compliance.privacyPolicyUrl)
        && hasProductionHttpsUrl(storeListing.contact?.supportUrl || compliance.supportUrl),
      'privacy and support URLs must be public HTTPS endpoints'),
    check('Privacy manifest is production-store compatible',
      compliance.privacy?.productionOnlyHttps === true
        && compliance.storeForms?.appleAppPrivacy?.privacyPolicyRequired === true
        && compliance.storeForms?.googlePlayDataSafety?.dataEncryptedInTransit === true,
      'Apple App Privacy and Google Play Data safety forms must match actual mobile behavior'),
    check('Reviewer demo token is ready',
      reviewerTokenReady,
      'provide a reviewer-only LEWORD mobile API token in store review notes and set LEWORD_MOBILE_REVIEWER_TOKEN_READY=true, or record reviewerTokenEvidencePath',
      'external'),
  ];

  const summary = summarize(checks);
  return {
    generatedAt: new Date().toISOString(),
    releaseKind: 'public-store',
    platform,
    ok: summary.failedRequired === 0 && summary.failedExternal === 0,
    summary,
    checks,
    blockers: checks.filter((item) => !item.ok),
    app: audit.app,
    releaseStatus: {
      codeReady,
      apiRuntimeReady: releaseStatus.apiRuntimeReady === true,
      androidSubmitReady: needsAndroid ? releaseStatus.androidSubmitReady === true : null,
      androidPublicSubmitReady: needsAndroid ? releaseStatus.androidPublicSubmitReady === true : null,
      iosSubmitReady: needsIos ? releaseStatus.iosSubmitReady === true : null,
      iosPublicSubmitReady: needsIos ? (releaseStatus.iosPublicSubmitReady ?? releaseStatus.iosSubmitReady) === true : null,
      androidSubmitTrack: needsAndroid ? audit.eas?.androidSubmitTrack || null : null,
      androidPublicSubmitTrack: needsAndroid ? audit.eas?.androidPublicSubmitTrack || null : null,
      deviceCapturedScreenshotsReady: deviceCapturedReady,
      reviewerTokenReady,
      performanceSmokeReady: performanceSmoke?.ok === true,
    },
    artifacts: {
      publicReleaseGate: publicGateArtifact,
      ...(platform === 'android' ? {
        androidPublicReleaseGate: publicGateArtifact,
        allPublicReleaseGate: '.codex-build-cache/mobile-public-release-gate.json',
      } : {}),
      ...(platform === 'ios' ? {
        iosPublicReleaseGate: publicGateArtifact,
        allPublicReleaseGate: '.codex-build-cache/mobile-public-release-gate.json',
      } : {}),
      releaseAudit: '.codex-build-cache/mobile-release-audit.json',
      performanceSmoke: '.codex-build-cache/mobile-api-performance-smoke.json',
      storeAssets: 'docs/mobile-store-assets.json',
      storeListing: 'docs/mobile-store-listing.json',
      storeCompliance: 'docs/mobile-store-compliance.json',
    },
    nextCommands: [
      'npm run mobile:api-performance-smoke:save',
      'capture final-device screenshots and record docs/mobile-store-assets.json publicReleaseEvidence',
      'set LEWORD_MOBILE_REVIEWER_TOKEN_READY=true after adding reviewer token notes',
      publicGateCommand,
    ],
  };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const outPath = readArg(argv, '--out', '');
  const report = collectMobilePublicReleaseGate({
    platform: readArg(argv, '--platform', process.env.MOBILE_PUBLIC_RELEASE_PLATFORM || 'all'),
    publicGateArtifact: outPath || undefined,
  });
  const written = writeJson(report, outPath);
  console.log(JSON.stringify({ ...report, written }, null, 2));
  process.exit(report.ok || argv.includes('--report-only') ? 0 : 1);
}

module.exports = {
  collectMobilePublicReleaseGate,
  getDefaultPublicGateArtifact,
  hasReleaseEvidenceReference,
  hasReadableKoreanStoreCopy,
  normalizePlatform,
  writeJson,
};
