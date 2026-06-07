const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function pngInfo(relativePath) {
  const buffer = read(relativePath);
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') {
    throw new Error(`${relativePath} is not a PNG file`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bytes: buffer.length,
  };
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

function checkPng(relativePath, width, height, minBytes = 1000) {
  if (!exists(relativePath)) return false;
  const info = pngInfo(relativePath);
  return info.width === width && info.height === height && info.bytes >= minBytes;
}

function collectMobileStoreAssetsGate() {
  const appConfig = readJson('apps/mobile/app.json');
  const assets = readJson('docs/mobile-store-assets.json');
  const listing = readJson('docs/mobile-store-listing.json');
  const app = appConfig.expo || {};
  const storeAssets = assets.storeAssets || {};
  const screenshots = storeAssets.phoneScreenshots || [];
  const listingPlan = listing.assetChecklist?.screenshotPlan || [];
  const refs = assets.officialReferences || {};

  const checks = [
    check('Store asset manifest exists',
      assets.appId === app.android?.package && assets.appId === app.ios?.bundleIdentifier,
      'docs/mobile-store-assets.json appId must match app config'),
    check('Mobile asset generator exists',
      exists(assets.generator || ''),
      assets.generator || 'missing generator'),
    check('Store asset official references are recorded',
      /developer\.apple\.com/.test(refs.appleScreenshotSpecifications || '')
        && /support\.google\.com/.test(refs.googlePlayPreviewAssets || ''),
      'Apple screenshot and Google Play preview asset specs'),
    check('iOS first release is phone-only',
      app.ios?.supportsTablet === assets.appConfig?.iosSupportsTablet
        && assets.appConfig?.iosSupportsTablet === false,
      'phone-first release avoids requiring iPad screenshot sets'),
    check('Expo app icon is configured',
      app.icon === './assets/icon.png',
      'apps/mobile/app.json expo.icon'),
    check('Expo app icon PNG is 1024 square',
      checkPng('apps/mobile/assets/icon.png', 1024, 1024),
      'apps/mobile/assets/icon.png'),
    check('Expo splash image is configured',
      app.splash?.image === './assets/splash.png'
        && app.splash?.resizeMode === 'contain'
        && /^#/.test(app.splash?.backgroundColor || ''),
      'apps/mobile/app.json expo.splash'),
    check('Expo splash PNG exists',
      checkPng('apps/mobile/assets/splash.png', 1242, 1242),
      'apps/mobile/assets/splash.png'),
    check('Android adaptive icon foreground is configured',
      app.android?.adaptiveIcon?.foregroundImage === './assets/adaptive-icon.png'
        && app.android?.adaptiveIcon?.backgroundColor === assets.appConfig?.androidAdaptiveIconBackgroundColor,
      'apps/mobile/app.json android.adaptiveIcon'),
    check('Android adaptive icon foreground PNG is 1024 square',
      checkPng('apps/mobile/assets/adaptive-icon.png', 1024, 1024),
      'apps/mobile/assets/adaptive-icon.png'),
    check('Google Play feature graphic is 1024x500',
      checkPng(
        storeAssets.googlePlayFeatureGraphic?.path || '',
        storeAssets.googlePlayFeatureGraphic?.width,
        storeAssets.googlePlayFeatureGraphic?.height,
      ),
      storeAssets.googlePlayFeatureGraphic?.path || 'missing feature graphic'),
    check('Store screenshots cover listing plan',
      screenshots.length >= 5
        && listingPlan.every((flow) => screenshots.some((shot) => shot.flow === flow)),
      'docs/mobile-store-assets.json phoneScreenshots'),
    check('Store screenshots are 6.7 inch portrait PNGs',
      screenshots.every((shot) => checkPng(shot.path, shot.width, shot.height, 5000))
        && screenshots.every((shot) => shot.width === 1290 && shot.height === 2796),
      'apps/mobile/assets/store/screenshots/*.png'),
    check('Generated screenshot policy is explicit',
      assets.finalCapturePolicy?.deviceCapturedScreenshotsRequiredBeforePublicRelease === true
        && assets.finalCapturePolicy?.internalTrackMayUseGeneratedScreenshots === true,
      'final public release must replace generated screenshots with device captures',
      'recommended'),
  ];

  const summary = summarize(checks);
  return {
    generatedAt: new Date().toISOString(),
    ok: summary.failedRequired === 0,
    summary,
    checks,
    blockers: checks.filter((item) => !item.ok),
  };
}

if (require.main === module) {
  const report = collectMobileStoreAssetsGate();
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

module.exports = {
  collectMobileStoreAssetsGate,
  pngInfo,
};
