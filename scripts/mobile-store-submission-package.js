const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
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

function writeText(value, outPath) {
  const resolved = resolveOut(outPath);
  if (!resolved) return null;
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, value, 'utf8');
  return resolved;
}

function readArg(argv, name, fallback = '') {
  const equals = argv.find((arg) => arg.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? (argv[index + 1] || fallback) : fallback;
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

function hasGuaranteeClaim(value) {
  return /보장|guarantee|guaranteed|100%|확정/i.test(String(value || ''));
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

function assetExists(assetPath) {
  return !!assetPath && fs.existsSync(path.join(root, assetPath));
}

function line(label, value) {
  return `${label}: ${String(value || '').trim()}`;
}

function renderGooglePlayText(packageReport) {
  const google = packageReport.googlePlay;
  const compliance = packageReport.complianceSummary;
  const assets = packageReport.assets;
  return [
    '# LEWORD Google Play submission',
    '',
    line('App name', google.appName),
    line('Short description', google.shortDescription),
    '',
    '## Full description',
    google.fullDescription,
    '',
    '## Release notes',
    google.releaseNotes,
    '',
    '## Store settings',
    line('Category', google.category),
    line('Contains ads', google.containsAds ? 'yes' : 'no'),
    line('Content rating notes', google.contentRatingNotes),
    '',
    '## Data safety summary',
    line('Data collected', compliance.googlePlayDataSafety.dataCollected ? 'yes' : 'no'),
    line('Data shared', compliance.googlePlayDataSafety.dataShared ? 'yes' : 'no'),
    line('Encrypted in transit', compliance.googlePlayDataSafety.dataEncryptedInTransit ? 'yes' : 'no'),
    line('Users can request deletion', compliance.googlePlayDataSafety.usersCanRequestDeletion ? 'yes' : 'no'),
    line('Required data', compliance.googlePlayDataSafety.requiredDataCollection.join(', ')),
    line('Optional data', compliance.googlePlayDataSafety.optionalDataCollection.join(', ')),
    '',
    '## Assets',
    line('Feature graphic', assets.googlePlayFeatureGraphic.path),
    ...assets.phoneScreenshots.map((item, index) => line(`Phone screenshot ${index + 1}`, `${item.path} (${item.flow})`)),
    '',
  ].join('\n');
}

function renderAppStoreText(packageReport) {
  const apple = packageReport.appStore;
  const compliance = packageReport.complianceSummary;
  const review = packageReport.review;
  const assets = packageReport.assets;
  return [
    '# LEWORD App Store Connect submission',
    '',
    line('Name', apple.name),
    line('Subtitle', apple.subtitle),
    line('Promotional text', apple.promotionalText),
    line('Keywords', apple.keywords),
    line('Support URL', apple.supportUrl),
    line('Marketing URL', apple.marketingUrl),
    line('Privacy Policy URL', apple.privacyPolicyUrl),
    '',
    '## Description',
    apple.description,
    '',
    '## App Privacy summary',
    line('Tracking', compliance.appleAppPrivacy.tracking ? 'yes' : 'no'),
    line('Privacy policy required', compliance.appleAppPrivacy.privacyPolicyRequired ? 'yes' : 'no'),
    line('Linked data categories', compliance.appleAppPrivacy.linkedDataCategories.join(', ')),
    '',
    '## Review notes',
    line('Demo token required', review.demoTokenRequired ? 'yes' : 'no'),
    line('Demo token source', review.demoTokenSource),
    review.instructions,
    '',
    '## Review scenario',
    ...review.testScenario.map((item, index) => `${index + 1}. ${item}`),
    '',
    '## Assets',
    ...assets.phoneScreenshots.map((item, index) => line(`Phone screenshot ${index + 1}`, `${item.path} (${item.flow})`)),
    '',
  ].join('\n');
}

function collectMobileStoreSubmissionPackage() {
  const listing = readJson('docs/mobile-store-listing.json');
  const compliance = readJson('docs/mobile-store-compliance.json');
  const assetsManifest = readJson('docs/mobile-store-assets.json');
  const appConfig = readJson('apps/mobile/app.json');

  const google = listing.googlePlay || {};
  const apple = listing.appStore || {};
  const review = listing.review || {};
  const complianceSummary = compliance.storeForms || {};
  const assets = assetsManifest.storeAssets || {};
  const phoneScreenshots = assets.phoneScreenshots || [];
  const combinedText = [
    google.appName,
    google.shortDescription,
    google.fullDescription,
    google.releaseNotes,
    apple.name,
    apple.subtitle,
    apple.promotionalText,
    apple.description,
    apple.keywords,
  ].join('\n');

  const checks = [
    check('Submission app ids match app config',
      listing.appId === appConfig.expo?.android?.package
        && listing.appId === appConfig.expo?.ios?.bundleIdentifier
        && listing.appId === compliance.appId
        && listing.appId === assetsManifest.appId,
      'listing, compliance, assets, Android package, and iOS bundle must align'),
    check('Google Play copy is submission-ready',
      charLength(google.appName) <= 30
        && charLength(google.shortDescription) <= 80
        && charLength(google.fullDescription) >= 500
        && charLength(google.fullDescription) <= 4000
        && charLength(google.releaseNotes) >= 30,
      `name=${charLength(google.appName)}, short=${charLength(google.shortDescription)}, full=${charLength(google.fullDescription)}`),
    check('App Store copy is submission-ready',
      charLength(apple.name) <= 30
        && charLength(apple.subtitle) <= 30
        && charLength(apple.promotionalText) <= 170
        && charLength(apple.description) >= 500
        && charLength(apple.description) <= 4000
        && byteLength(apple.keywords) <= 100,
      `name=${charLength(apple.name)}, promo=${charLength(apple.promotionalText)}, keywords=${byteLength(apple.keywords)} bytes`),
    check('Reviewer notes are included',
      review.demoTokenRequired === true
        && charLength(review.instructions) >= 100
        && Array.isArray(review.testScenario)
        && review.testScenario.length >= 3,
      'reviewer token instructions and scenario must be copy-pasteable'),
    check('Privacy forms are summarized',
      complianceSummary.appleAppPrivacy?.privacyPolicyRequired === true
        && complianceSummary.googlePlayDataSafety?.dataCollected === true
        && compliance.privacy?.encryptedInTransit === true,
      'Apple App Privacy and Google Play Data safety fields must be present'),
    check('Store assets exist',
      assetExists(assets.googlePlayFeatureGraphic?.path)
        && phoneScreenshots.length >= 5
        && phoneScreenshots.every((item) => assetExists(item.path)),
      'feature graphic and phone screenshot PNGs must exist'),
    check('Generated screenshots are marked internal-only',
      assetsManifest.finalCapturePolicy?.deviceCapturedScreenshotsRequiredBeforePublicRelease === true,
      'public release must replace generated screenshots with device-captured screenshots',
      'recommended'),
    check('Submission text avoids placeholders',
      !hasPlaceholder(JSON.stringify({ listing, compliance, assetsManifest })),
      'no REPLACE/YOUR/TODO/CHANGE_ME values in store submission package'),
    check('Submission text avoids traffic guarantee claims',
      !hasGuaranteeClaim(combinedText),
      'store copy must not imply guaranteed traffic, ranking, or exposure'),
  ];

  const summary = summarize(checks);
  const packageReport = {
    generatedAt: new Date().toISOString(),
    ok: summary.failedRequired === 0,
    summary,
    checks,
    blockers: checks.filter((item) => !item.ok),
    appId: listing.appId,
    locale: listing.defaultLocale || 'ko-KR',
    contact: listing.contact,
    googlePlay: {
      appName: google.appName,
      shortDescription: google.shortDescription,
      fullDescription: google.fullDescription,
      releaseNotes: google.releaseNotes,
      category: google.category,
      containsAds: google.containsAds,
      contentRatingNotes: google.contentRatingNotes,
    },
    appStore: {
      name: apple.name,
      subtitle: apple.subtitle,
      promotionalText: apple.promotionalText,
      description: apple.description,
      keywords: apple.keywords,
      supportUrl: apple.supportUrl,
      marketingUrl: apple.marketingUrl,
      privacyPolicyUrl: apple.privacyPolicyUrl,
    },
    review: {
      demoTokenRequired: review.demoTokenRequired,
      demoTokenSource: review.demoTokenSource,
      instructions: review.instructions,
      testScenario: review.testScenario,
    },
    complianceSummary,
    privacy: {
      tracking: compliance.privacy?.tracking,
      thirdPartyAds: compliance.privacy?.thirdPartyAds,
      analyticsSdk: compliance.privacy?.analyticsSdk,
      permissions: compliance.privacy?.permissions || [],
      dataLinkedToUser: compliance.privacy?.dataLinkedToUser || [],
      dataSharedWithThirdParties: compliance.privacy?.dataSharedWithThirdParties || [],
      encryptedInTransit: compliance.privacy?.encryptedInTransit,
    },
    assets: {
      googlePlayFeatureGraphic: assets.googlePlayFeatureGraphic,
      phoneScreenshots,
      finalCapturePolicy: assetsManifest.finalCapturePolicy,
    },
    copyPasteFiles: {
      googlePlay: '.codex-build-cache/mobile-store-submission-google-play.txt',
      appStore: '.codex-build-cache/mobile-store-submission-app-store.txt',
    },
  };

  packageReport.copyPaste = {
    googlePlayText: renderGooglePlayText(packageReport),
    appStoreText: renderAppStoreText(packageReport),
  };

  return packageReport;
}

function writeMobileStoreSubmissionPackage(report, outputs = {}) {
  return {
    json: writeJson(report, outputs.out),
    googlePlayText: writeText(report.copyPaste.googlePlayText, outputs.googlePlayOut),
    appStoreText: writeText(report.copyPaste.appStoreText, outputs.appStoreOut),
  };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const report = collectMobileStoreSubmissionPackage();
  const written = writeMobileStoreSubmissionPackage(report, {
    out: readArg(argv, '--out', ''),
    googlePlayOut: readArg(argv, '--google-play-out', ''),
    appStoreOut: readArg(argv, '--app-store-out', ''),
  });
  console.log(JSON.stringify({ ...report, written }, null, 2));
  process.exit(argv.includes('--strict') && !report.ok ? 1 : 0);
}

module.exports = {
  collectMobileStoreSubmissionPackage,
  renderAppStoreText,
  renderGooglePlayText,
  writeMobileStoreSubmissionPackage,
};
