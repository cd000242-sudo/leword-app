const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function isProductionHttpsUrl(url) {
  return /^https:\/\/[^/]+/i.test(String(url || ''))
    && !/localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|\.example(?:\/|$)|\.invalid(?:\/|$)|\.test(?:\/|$)|leword\.example(?:\/|$)/i.test(String(url || ''));
}

function charLength(value) {
  return Array.from(String(value || '')).length;
}

function byteLength(value) {
  return Buffer.byteLength(String(value || ''), 'utf8');
}

function hasPlaceholder(value) {
  return /REPLACE_|YOUR_|TODO|CHANGE_ME/i.test(String(value || ''));
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

function collectMobileStoreListingGate() {
  const listing = readJson('docs/mobile-store-listing.json');
  const compliance = readJson('docs/mobile-store-compliance.json');
  const appConfig = readJson('apps/mobile/app.json');

  const google = listing.googlePlay || {};
  const apple = listing.appStore || {};
  const review = listing.review || {};
  const contact = listing.contact || {};
  const refs = listing.officialReferences || {};
  const combinedMarketingText = [
    google.appName,
    google.shortDescription,
    google.fullDescription,
    apple.name,
    apple.subtitle,
    apple.promotionalText,
    apple.description,
  ].join('\n');

  const checks = [
    check('Store listing manifest exists',
      !!listing && listing.appId === appConfig.expo.android.package,
      'docs/mobile-store-listing.json appId must match app config'),
    check('Store listing app id matches iOS bundle',
      listing.appId === appConfig.expo.ios.bundleIdentifier,
      `${listing.appId} / ${appConfig.expo.ios.bundleIdentifier}`),
    check('Store listing app id matches compliance manifest',
      listing.appId === compliance.appId,
      `${listing.appId} / ${compliance.appId}`),
    check('Store listing contact URLs are production HTTPS',
      isProductionHttpsUrl(contact.privacyPolicyUrl)
        && isProductionHttpsUrl(contact.supportUrl)
        && contact.privacyPolicyUrl === compliance.privacyPolicyUrl
        && contact.supportUrl === compliance.supportUrl,
      'privacy/support URLs must match compliance manifest'),
    check('Official store metadata references are recorded',
      /developer\.apple\.com/.test(refs.appleAppInformation || '')
        && /developer\.apple\.com/.test(refs.applePlatformVersionInformation || '')
        && /support\.google\.com/.test(refs.googlePlayStoreListing || '')
        && /support\.google\.com/.test(refs.googlePlayDataSafety || ''),
      'store limits should be traceable to official Apple/Google docs'),
    check('Google Play app name is within 30 characters',
      charLength(google.appName) >= 2 && charLength(google.appName) <= 30,
      `${charLength(google.appName)} chars`),
    check('Google Play short description is within 80 characters',
      charLength(google.shortDescription) > 20 && charLength(google.shortDescription) <= 80,
      `${charLength(google.shortDescription)} chars`),
    check('Google Play full description is within 4000 characters',
      charLength(google.fullDescription) >= 500 && charLength(google.fullDescription) <= 4000,
      `${charLength(google.fullDescription)} chars`),
    check('Google Play release notes are present',
      charLength(google.releaseNotes) >= 30 && !hasPlaceholder(google.releaseNotes),
      'release notes required before internal track rollout'),
    check('Apple app name is within 30 characters',
      charLength(apple.name) >= 2 && charLength(apple.name) <= 30,
      `${charLength(apple.name)} chars`),
    check('Apple subtitle is within 30 characters',
      charLength(apple.subtitle) > 0 && charLength(apple.subtitle) <= 30,
      `${charLength(apple.subtitle)} chars`),
    check('Apple promotional text is within 170 characters',
      charLength(apple.promotionalText) > 20 && charLength(apple.promotionalText) <= 170,
      `${charLength(apple.promotionalText)} chars`),
    check('Apple description is within 4000 characters',
      charLength(apple.description) >= 500 && charLength(apple.description) <= 4000,
      `${charLength(apple.description)} chars`),
    check('Apple keywords are within 100 bytes',
      byteLength(apple.keywords) > 10 && byteLength(apple.keywords) <= 100,
      `${byteLength(apple.keywords)} bytes`),
    check('Apple URLs are production HTTPS',
      isProductionHttpsUrl(apple.supportUrl)
        && isProductionHttpsUrl(apple.marketingUrl)
        && isProductionHttpsUrl(apple.privacyPolicyUrl),
      'support, marketing, and privacy URLs'),
    check('Reviewer instructions are actionable',
      review.demoTokenRequired === true
        && charLength(review.instructions) >= 100
        && Array.isArray(review.testScenario)
        && review.testScenario.length >= 3,
      'reviewer notes must include token, worker split, and test scenario'),
    check('Store listing avoids guarantee claims',
      !/보장|guarantee|guaranteed|100%|확정/i.test(combinedMarketingText),
      'metadata must not imply guaranteed traffic or exposure'),
    check('Store listing avoids placeholders',
      !hasPlaceholder(JSON.stringify(listing)),
      'replace placeholder store metadata before release'),
    check('Store screenshot plan covers core mobile flows',
      Array.isArray(listing.assetChecklist?.screenshotPlan)
        && listing.assetChecklist.screenshotPlan.length >= 5
        && JSON.stringify(listing.assetChecklist.screenshotPlan).includes('Mindmap')
        && JSON.stringify(listing.assetChecklist.screenshotPlan).includes('Recommendation'),
      'screenshots must cover discovery, progress, results, mindmap, and inbox'),
    check('Store listing declares visual assets still required',
      listing.assetChecklist?.appIconRequired === true
        && listing.assetChecklist?.adaptiveIconForegroundRequired === true
        && listing.assetChecklist?.storeScreenshotsRequired === true,
      'asset checklist should make visual submission work explicit',
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
  const report = collectMobileStoreListingGate();
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

module.exports = {
  charLength,
  byteLength,
  collectMobileStoreListingGate,
  isProductionHttpsUrl,
};
