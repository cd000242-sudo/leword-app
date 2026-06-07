const {
  collectMobileStoreSubmissionPackage,
  renderAppStoreText,
  renderGooglePlayText,
} = require('../../../scripts/mobile-store-submission-package');

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

const report = collectMobileStoreSubmissionPackage();

assert('store submission package passes current metadata gates',
  report.ok === true
    && report.summary.failedRequired === 0
    && report.checks.every((item: any) => item.ok || item.severity !== 'required'));

assert('store submission package includes Play Console copy-paste fields',
  report.googlePlay.appName === 'LEWORD'
    && report.googlePlay.shortDescription.length > 20
    && report.googlePlay.fullDescription.length >= 500
    && report.googlePlay.releaseNotes.length >= 30
    && /PC급 분석 엔진/.test(report.googlePlay.releaseNotes));

assert('store submission package includes App Store Connect copy-paste fields',
  report.appStore.name === 'LEWORD'
    && report.appStore.subtitle.length > 0
    && report.appStore.promotionalText.length <= 170
    && Buffer.byteLength(report.appStore.keywords, 'utf8') <= 100);

assert('store submission package includes reviewer and privacy evidence',
  report.review.demoTokenRequired === true
    && report.review.testScenario.length >= 3
    && report.complianceSummary.appleAppPrivacy.privacyPolicyRequired === true
    && report.complianceSummary.googlePlayDataSafety.dataEncryptedInTransit === true);

assert('store submission package includes existing visual assets',
  report.assets.googlePlayFeatureGraphic.path.endsWith('feature-graphic.png')
    && report.assets.phoneScreenshots.length >= 5
    && report.assets.finalCapturePolicy.deviceCapturedScreenshotsRequiredBeforePublicRelease === true);

assert('store submission package avoids secrets, placeholders, and guarantee claims',
  ![
    report.googlePlay.shortDescription,
    report.googlePlay.fullDescription,
    report.googlePlay.releaseNotes,
    report.appStore.description,
    report.appStore.promotionalText,
    report.appStore.keywords,
    report.review.instructions,
  ].join('\n').includes('ghp_')
    && !/REPLACE_|YOUR_|TODO|CHANGE_ME/.test([
      report.googlePlay.shortDescription,
      report.googlePlay.fullDescription,
      report.googlePlay.releaseNotes,
      report.appStore.description,
      report.appStore.promotionalText,
      report.appStore.keywords,
      report.review.instructions,
    ].join('\n'))
    && !/보장|guarantee|guaranteed|100%|확정/i.test([
      report.googlePlay.shortDescription,
      report.googlePlay.fullDescription,
      report.appStore.description,
    ].join('\n')));

const googleText = renderGooglePlayText(report);
const appleText = renderAppStoreText(report);
assert('store submission package renders copy-paste text outputs',
  /Google Play submission/.test(googleText)
    && /Data safety summary/.test(googleText)
    && /Feature graphic/.test(googleText)
    && /App Store Connect submission/.test(appleText)
    && /App Privacy summary/.test(appleText)
    && /Review scenario/.test(appleText));

console.log('[mobile-store-submission-package.test] passed');

export {};
