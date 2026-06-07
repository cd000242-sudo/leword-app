const {
  collectMobilePublicReleaseGate,
  hasReleaseEvidenceReference,
  hasReadableKoreanStoreCopy,
} = require('../../../scripts/mobile-public-release-gate');

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

const keyword = '\uD0A4\uC6CC\uB4DC';
const mobile = '\uBAA8\uBC14\uC77C';
const analysis = '\uBD84\uC11D';
const traffic = '\uD2B8\uB798\uD53D';
const searchVolume = '\uAC80\uC0C9\uB7C9';
const readableCopy = `${keyword} ${mobile} ${analysis} ${traffic} ${searchVolume} `.repeat(12);
const mojibakeCopy = '\u6E72\uF9CF\u907A\uFFFD\u6E72\uF9CF\u907A\uFFFD'.repeat(12);

function makeAudit(overrides: any = {}): any {
  return {
    generatedAt: '2026-06-05T00:00:00.000Z',
    app: {
      rootVersion: '2.49.83',
      mobileVersion: '0.1.0',
      androidPackage: 'com.leword.mobile',
      iosBundleIdentifier: 'com.leword.mobile',
    },
    eas: {
      androidSubmitTrack: 'production',
      androidPublicSubmitTrack: 'production',
      iosSubmitConfigured: true,
      iosPublicSubmitConfigured: true,
      ...(overrides.eas || {}),
    },
    releaseStatus: {
      codeReady: true,
      apiDeployReady: true,
      storeListingReady: true,
      storeAssetsReady: true,
      uiReady: true,
      apiRuntimeReady: true,
      androidJsExportReady: true,
      androidSubmitReady: true,
      androidPublicSubmitReady: true,
      iosSubmitReady: true,
      iosPublicSubmitReady: true,
      ...(overrides.releaseStatus || {}),
    },
  };
}

function makeStoreAssets(overrides: any = {}): any {
  return {
    appId: 'com.leword.mobile',
    finalCapturePolicy: {
      deviceCapturedScreenshotsRequiredBeforePublicRelease: true,
      internalTrackMayUseGeneratedScreenshots: true,
    },
    publicReleaseEvidence: {
      deviceCapturedScreenshotsReady: true,
      screenshotSource: 'device-captured',
      evidencePath: 'src/utils/__tests__/fixtures/mobile-device-capture-evidence.json',
      reviewerTokenEvidencePath: 'src/utils/__tests__/fixtures/mobile-reviewer-token-evidence.json',
      ...(overrides.publicReleaseEvidence || {}),
    },
    ...(overrides.root || {}),
  };
}

function makeStoreListing(overrides: any = {}): any {
  return {
    appId: 'com.leword.mobile',
    contact: {
      privacyPolicyUrl: 'https://leword.app/privacy',
      supportUrl: 'https://leword.app/support',
    },
    googlePlay: {
      appName: 'LEWORD',
      shortDescription: readableCopy,
      fullDescription: readableCopy,
      releaseNotes: readableCopy,
    },
    appStore: {
      name: 'LEWORD',
      subtitle: readableCopy,
      promotionalText: readableCopy,
      description: readableCopy,
      keywords: readableCopy,
    },
    review: {
      demoTokenRequired: true,
    },
    ...overrides,
  };
}

const ready = collectMobilePublicReleaseGate({
  audit: makeAudit(),
  storeAssets: makeStoreAssets(),
  storeListing: makeStoreListing(),
  compliance: {
    privacyPolicyUrl: 'https://leword.app/privacy',
    supportUrl: 'https://leword.app/support',
    reviewerAccess: { demoTokenRequired: true },
    privacy: { productionOnlyHttps: true },
    storeForms: {
      appleAppPrivacy: { privacyPolicyRequired: true },
      googlePlayDataSafety: { dataEncryptedInTransit: true },
    },
  },
  performanceSmoke: { ok: true },
  env: {
    LEWORD_MOBILE_REVIEWER_TOKEN_READY: 'true',
  },
});

assert('public release gate passes only with production-grade evidence',
  ready.ok === true
    && ready.summary.failedRequired === 0
    && ready.summary.failedExternal === 0
    && ready.releaseKind === 'public-store'
    && ready.artifacts.publicReleaseGate === '.codex-build-cache/mobile-public-release-gate.json');

const androidOnlyReady = collectMobilePublicReleaseGate({
  platform: 'android',
  audit: makeAudit({
    releaseStatus: {
      iosSubmitReady: false,
      iosPublicSubmitReady: false,
    },
  }),
  storeAssets: makeStoreAssets(),
  storeListing: makeStoreListing(),
  compliance: {
    privacyPolicyUrl: 'https://leword.app/privacy',
    supportUrl: 'https://leword.app/support',
    reviewerAccess: { demoTokenRequired: true },
    privacy: { productionOnlyHttps: true },
    storeForms: {
      appleAppPrivacy: { privacyPolicyRequired: true },
      googlePlayDataSafety: { dataEncryptedInTransit: true },
    },
  },
  performanceSmoke: { ok: true },
  env: {
    LEWORD_MOBILE_REVIEWER_TOKEN_READY: 'true',
  },
});

assert('android public release gate does not require iOS submit credentials',
  androidOnlyReady.ok === true
    && androidOnlyReady.platform === 'android'
    && androidOnlyReady.artifacts.publicReleaseGate === '.codex-build-cache/mobile-public-release-gate-android.json'
    && androidOnlyReady.artifacts.androidPublicReleaseGate === '.codex-build-cache/mobile-public-release-gate-android.json'
    && androidOnlyReady.artifacts.allPublicReleaseGate === '.codex-build-cache/mobile-public-release-gate.json'
    && androidOnlyReady.releaseStatus.iosSubmitReady === null
    && androidOnlyReady.releaseStatus.iosPublicSubmitReady === null
    && androidOnlyReady.nextCommands.includes('npm run mobile:public-release-gate:android')
    && !androidOnlyReady.blockers.some((item: any) => item.name === 'iOS App Store submit credentials are ready'));

const currentLike = collectMobilePublicReleaseGate({
  audit: makeAudit({
    eas: { androidSubmitTrack: 'internal', androidPublicSubmitTrack: null, iosSubmitConfigured: false },
    releaseStatus: {
      apiRuntimeReady: false,
      androidSubmitReady: false,
      androidPublicSubmitReady: false,
      iosSubmitReady: false,
      iosPublicSubmitReady: false,
    },
  }),
  storeAssets: makeStoreAssets({
    publicReleaseEvidence: {
      deviceCapturedScreenshotsReady: false,
      screenshotSource: 'generated',
      evidencePath: '',
    },
  }),
  storeListing: makeStoreListing(),
  compliance: {
    privacyPolicyUrl: 'https://leword.app/privacy',
    supportUrl: 'https://leword.app/support',
    reviewerAccess: { demoTokenRequired: true },
    privacy: { productionOnlyHttps: true },
    storeForms: {
      appleAppPrivacy: { privacyPolicyRequired: true },
      googlePlayDataSafety: { dataEncryptedInTransit: true },
    },
  },
  performanceSmoke: null,
  env: {},
});

assert('public release gate blocks internal-track evidence without external secrets',
  currentLike.ok === false
    && currentLike.blockers.some((item: any) => item.name === 'Production API runtime is ready')
    && currentLike.blockers.some((item: any) => item.name === 'Device-captured public screenshots are ready')
    && currentLike.blockers.some((item: any) => item.name === 'Reviewer demo token is ready')
    && currentLike.blockers.some((item: any) => item.name === 'Google Play public track is configured'));

const missingDeviceCaptureEvidence = collectMobilePublicReleaseGate({
  platform: 'android',
  audit: makeAudit(),
  storeAssets: makeStoreAssets({
    publicReleaseEvidence: {
      deviceCapturedScreenshotsReady: true,
      screenshotSource: 'device-captured',
      evidencePath: 'apps/mobile/assets/store/device-captures/missing-final-build.json',
    },
  }),
  storeListing: makeStoreListing(),
  compliance: {
    privacyPolicyUrl: 'https://leword.app/privacy',
    supportUrl: 'https://leword.app/support',
    reviewerAccess: { demoTokenRequired: true },
    privacy: { productionOnlyHttps: true },
    storeForms: {
      appleAppPrivacy: { privacyPolicyRequired: true },
      googlePlayDataSafety: { dataEncryptedInTransit: true },
    },
  },
  performanceSmoke: { ok: true },
  env: {
    LEWORD_MOBILE_REVIEWER_TOKEN_READY: 'true',
  },
});

assert('public release gate requires resolvable device screenshot evidence',
  missingDeviceCaptureEvidence.ok === false
    && missingDeviceCaptureEvidence.blockers.some((item: any) => item.name === 'Device-captured public screenshots are ready'));

const missingReviewerTokenEvidence = collectMobilePublicReleaseGate({
  platform: 'android',
  audit: makeAudit(),
  storeAssets: makeStoreAssets({
    publicReleaseEvidence: {
      reviewerTokenReady: true,
      reviewerTokenEvidencePath: '',
    },
  }),
  storeListing: makeStoreListing(),
  compliance: {
    privacyPolicyUrl: 'https://leword.app/privacy',
    supportUrl: 'https://leword.app/support',
    reviewerAccess: { demoTokenRequired: true },
    privacy: { productionOnlyHttps: true },
    storeForms: {
      appleAppPrivacy: { privacyPolicyRequired: true },
      googlePlayDataSafety: { dataEncryptedInTransit: true },
    },
  },
  performanceSmoke: { ok: true },
  env: {},
});

assert('public release gate requires reviewer token evidence when env readiness is absent',
  missingReviewerTokenEvidence.ok === false
    && missingReviewerTokenEvidence.blockers.some((item: any) => item.name === 'Reviewer demo token is ready'));

assert('release evidence references reject missing local files and unsafe URLs',
  hasReleaseEvidenceReference('src/utils/__tests__/fixtures/mobile-device-capture-evidence.json') === true
    && hasReleaseEvidenceReference('https://leword.app/mobile/release-evidence/android-final') === true
    && hasReleaseEvidenceReference('http://localhost/mobile/evidence') === false
    && hasReleaseEvidenceReference('apps/mobile/assets/store/device-captures/missing-final-build.json') === false
    && hasReleaseEvidenceReference('../outside.json') === false);

assert('public release gate detects mojibake store copy',
  hasReadableKoreanStoreCopy(makeStoreListing()) === true
    && hasReadableKoreanStoreCopy(makeStoreListing({
      googlePlay: {
        fullDescription: mojibakeCopy,
      },
      appStore: {
        description: mojibakeCopy,
      },
    })) === false);

console.log('[mobile-public-release-gate.test] passed');

export {};
