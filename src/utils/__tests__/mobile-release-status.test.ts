const {
  collectMobileReleaseStatus,
  isCodeReady,
} = require('../../../scripts/mobile-release-status');

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

function makeAudit(overrides: any = {}): any {
  return {
    generatedAt: '2026-06-05T00:00:00.000Z',
    app: {
      rootVersion: '2.49.83',
      mobileVersion: '0.1.0',
      androidPackage: 'com.leword.mobile',
      iosBundleIdentifier: 'com.leword.mobile',
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

const readyEnv = {
  EXPO_PUBLIC_LEWORD_API_URL: 'https://api.leword.app',
  EXPO_PUBLIC_EAS_PROJECT_ID: 'eas-project-id',
  EXPO_PUBLIC_LEWORD_PRIVACY_URL: 'https://leword.app/privacy',
  EXPO_TOKEN: 'expo-token',
  NAVER_CLIENT_ID: 'naver-client',
  NAVER_CLIENT_SECRET: 'naver-secret',
  NAVER_SEARCH_AD_ACCESS_LICENSE: 'searchad-license',
  NAVER_SEARCH_AD_SECRET_KEY: 'searchad-secret',
  NAVER_SEARCH_AD_CUSTOMER_ID: 'searchad-customer',
  LEWORD_MOBILE_ENTITLEMENT_URL: 'https://api.leword.app/mobile/entitlement',
  LEWORD_MOBILE_PREWARM_INTERVAL_MINUTES: '15',
  LEWORD_MOBILE_SMOKE_API_URL: 'https://api.leword.app',
  LEWORD_MOBILE_SMOKE_TOKEN: 'smoke-token',
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64: 'base64-json',
  EXPO_APPLE_ID: 'release@example.com',
  EXPO_ASC_APP_ID: '1234567890',
  EXPO_APPLE_TEAM_ID: 'AB12XYZ34S',
  EXPO_ASC_API_KEY_P8_B64: 'base64-p8',
  EXPO_ASC_API_KEY_ISSUER_ID: 'issuer-id',
  EXPO_ASC_API_KEY_ID: 'KEYID12345',
  LEWORD_MOBILE_REVIEWER_TOKEN_READY: 'true',
};

assert('release status code readiness requires UI and Android JS evidence',
  isCodeReady(makeAudit().releaseStatus) === true
    && isCodeReady(makeAudit({ releaseStatus: { uiReady: false } }).releaseStatus) === false
    && isCodeReady(makeAudit({ releaseStatus: { androidJsExportReady: false } }).releaseStatus) === false);

const ready = collectMobileReleaseStatus({
  env: readyEnv,
  audit: makeAudit(),
  ref: 'main',
  publicRelease: {
    ok: true,
    summary: { passed: 11, failedRequired: 0, failedExternal: 0 },
    blockers: [],
    releaseStatus: { deviceCapturedScreenshotsReady: true },
  },
});

assert('release status is dispatch-ready when all target inputs are present',
  ready.ok === true
    && ready.releaseReady === true
    && ready.summary.fullReleaseReady === true
    && ready.summary.fullReleaseDispatchReady === true
    && ready.targets.some((item: any) => item.id === 'android-public-submit' && item.readyToDispatch)
    && ready.targets.some((item: any) => item.id === 'full-release' && item.readyToDispatch)
    && ready.targets.some((item: any) => item.id === 'android-internal-build' && item.ready)
    && ready.artifacts.releaseStatus === '.codex-build-cache/mobile-release-status.json'
    && ready.artifacts.publicReleaseGate === '.codex-build-cache/mobile-public-release-gate.json'
    && ready.summary.publicStoreReady === true
    && ready.publicRelease.ok === true
    && ready.artifacts.uiReleaseGate === '.codex-build-cache/mobile-ui-release-gate.json');

const missingExternal = collectMobileReleaseStatus({
  env: {},
  audit: makeAudit({
    releaseStatus: {
      apiRuntimeReady: false,
      androidSubmitReady: false,
      androidPublicSubmitReady: false,
      iosSubmitReady: false,
      iosPublicSubmitReady: false,
    },
  }),
  ref: 'main',
  publicRelease: {
    ok: false,
    summary: { passed: 5, failedRequired: 0, failedExternal: 6 },
    blockers: [{ name: 'Device-captured public screenshots are ready', detail: 'missing', severity: 'external' }],
    releaseStatus: { deviceCapturedScreenshotsReady: false },
  },
});

assert('release status separates local code readiness from external release blockers',
  missingExternal.ok === true
    && missingExternal.releaseReady === false
    && missingExternal.summary.codeReady === true
    && missingExternal.summary.publicStoreReady === false
    && missingExternal.publicRelease.blockers.some((item: any) => item.name === 'Device-captured public screenshots are ready')
    && missingExternal.targets.some((item: any) => item.id === 'verify-only' && item.ready)
    && missingExternal.targets.some((item: any) => item.id === 'android-public-submit' && !item.ready)
    && missingExternal.targets.some((item: any) => item.id === 'full-release' && !item.ready)
    && missingExternal.externalBlockers.some((item: any) => item.name === 'Production API URL variable is configured')
    && missingExternal.nextActions.includes('open .codex-build-cache/mobile-github-setup.ps1'));

const androidPublicOnly = collectMobileReleaseStatus({
  env: readyEnv,
  audit: makeAudit({
    releaseStatus: {
      iosSubmitReady: false,
      iosPublicSubmitReady: false,
    },
  }),
  ref: 'main',
  publicRelease: {
    ok: false,
    summary: { passed: 5, failedRequired: 0, failedExternal: 1 },
    blockers: [{ name: 'iOS App Store submit credentials are ready', detail: 'missing', severity: 'external' }],
    releaseStatus: { iosPublicSubmitReady: false },
  },
  androidPublicRelease: {
    ok: true,
    summary: { passed: 10, failedRequired: 0, failedExternal: 0 },
    blockers: [],
    releaseStatus: { androidPublicSubmitReady: true, iosPublicSubmitReady: null },
  },
});

assert('release status reports Android public store readiness separately from full public store',
  androidPublicOnly.summary.publicStoreReady === false
    && androidPublicOnly.summary.androidPublicStoreReady === true
    && androidPublicOnly.publicRelease.ok === false
    && androidPublicOnly.androidPublicRelease.ok === true
    && androidPublicOnly.artifacts.androidPublicReleaseGate === '.codex-build-cache/mobile-public-release-gate-android.json');

assert('release status does not expose secret-like values',
  !JSON.stringify(ready).includes('ghp_')
    && !JSON.stringify(ready).includes('expo-token')
    && !JSON.stringify(ready).includes('searchad-secret'));

console.log('[mobile-release-status.test] passed');

export {};
