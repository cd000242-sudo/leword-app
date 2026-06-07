const {
  collectMobileDeployReadiness,
  isProductionHttpsUrl,
  normalizePlatform,
  parsePlatformArg,
  parseSubmitArg,
} = require('../../../scripts/mobile-deploy-readiness');

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

function makeAudit(overrides: any = {}): any {
  return {
    releaseStatus: {
      codeReady: true,
      apiDeployReady: true,
      storeListingReady: true,
      storeAssetsReady: true,
      apiRuntimeReady: true,
      androidJsExportReady: true,
      androidSubmitReady: true,
      iosSubmitReady: true,
      ...(overrides.releaseStatus || {}),
    },
  };
}

const readyEnv = {
  EXPO_PUBLIC_LEWORD_API_URL: 'https://api.leword.app',
  EXPO_PUBLIC_EAS_PROJECT_ID: 'eas-project-id',
  EXPO_TOKEN: 'expo-token',
  LEWORD_MOBILE_SMOKE_API_URL: 'https://api.leword.app',
  EXPO_PUBLIC_LEWORD_PRIVACY_URL: 'https://leword.app/privacy',
};

const readyStoreCompliance = {
  privacyPolicyUrl: 'https://leword.app/privacy',
};

assert('production URL checker accepts HTTPS production domains',
  isProductionHttpsUrl('https://api.leword.app') === true);
assert('production URL checker rejects localhost',
  isProductionHttpsUrl('http://127.0.0.1:34983') === false);
assert('production URL checker rejects placeholders',
  isProductionHttpsUrl('https://api.leword.example') === false);
assert('platform parser accepts equals form',
  parsePlatformArg(['--platform=android']) === 'android');
assert('platform parser defaults to all',
  parsePlatformArg([]) === 'all');
assert('platform normalizer accepts ios',
  normalizePlatform('ios') === 'ios');
assert('submit parser defaults to true and accepts false',
  parseSubmitArg([]) === true
    && parseSubmitArg(['--submit=false']) === false);

const ready = collectMobileDeployReadiness({
  env: readyEnv,
  audit: makeAudit(),
  storeCompliance: readyStoreCompliance,
});
assert('deploy readiness passes when all production inputs are present',
  ready.ok === true && ready.summary.failedExternal === 0);
assert('deploy readiness exposes Android and iOS deploy commands',
  ready.nextCommands.androidInternal.includes('npm run mobile:deploy:android:internal')
    && ready.nextCommands.androidInternal.includes('npm run mobile:deploy-readiness:android')
    && ready.nextCommands.iosTestFlight.includes('npm run mobile:deploy:ios:testflight')
    && ready.nextCommands.iosTestFlight.includes('npm run mobile:deploy-readiness:ios'));

const androidOnlyReady = collectMobileDeployReadiness({
  platform: 'android',
  env: readyEnv,
  audit: makeAudit({
    releaseStatus: {
      iosSubmitReady: false,
    },
  }),
  storeCompliance: readyStoreCompliance,
});
assert('android readiness does not require iOS submit credentials',
  androidOnlyReady.ok === true
    && androidOnlyReady.platform === 'android'
    && !androidOnlyReady.checks.some((item: any) => item.name === 'iOS submit credentials are ready'));

const iosOnlyReady = collectMobileDeployReadiness({
  platform: 'ios',
  env: readyEnv,
  audit: makeAudit({
    releaseStatus: {
      androidSubmitReady: false,
    },
  }),
  storeCompliance: readyStoreCompliance,
});
assert('ios readiness does not require Android submit credentials',
  iosOnlyReady.ok === true
    && iosOnlyReady.platform === 'ios'
    && !iosOnlyReady.checks.some((item: any) => item.name === 'Android submit credentials are ready'));

const missingApi = collectMobileDeployReadiness({
  env: { ...readyEnv, EXPO_PUBLIC_LEWORD_API_URL: 'http://127.0.0.1:34983' },
  audit: makeAudit(),
  storeCompliance: readyStoreCompliance,
});
assert('deploy readiness blocks localhost API URL',
  missingApi.ok === false
    && missingApi.blockers.some((item: any) => item.name === 'Production API URL is HTTPS'));

const missingSubmit = collectMobileDeployReadiness({
  env: readyEnv,
  audit: makeAudit({
    releaseStatus: {
      androidSubmitReady: false,
      iosSubmitReady: false,
    },
  }),
  storeCompliance: readyStoreCompliance,
});
assert('deploy readiness blocks missing store submit credentials',
  missingSubmit.ok === false
    && missingSubmit.blockers.some((item: any) => item.name === 'Android submit credentials are ready')
    && missingSubmit.blockers.some((item: any) => item.name === 'iOS submit credentials are ready'));

const buildOnlyWithoutSubmit = collectMobileDeployReadiness({
  submitToStores: false,
  env: readyEnv,
  audit: makeAudit({
    releaseStatus: {
      androidSubmitReady: false,
      iosSubmitReady: false,
    },
  }),
  storeCompliance: readyStoreCompliance,
});
assert('deploy readiness allows build-only path without store submit credentials',
  buildOnlyWithoutSubmit.ok === true
    && buildOnlyWithoutSubmit.submitToStores === false
    && !buildOnlyWithoutSubmit.checks.some((item: any) => /submit credentials/.test(item.name)));

const missingRuntime = collectMobileDeployReadiness({
  env: readyEnv,
  audit: makeAudit({
    releaseStatus: {
      apiRuntimeReady: false,
    },
  }),
  storeCompliance: readyStoreCompliance,
});
assert('deploy readiness blocks non-ready production API worker',
  missingRuntime.ok === false
    && missingRuntime.blockers.some((item: any) => item.name === 'Production API worker is ready'));

const missingApiDeployPackage = collectMobileDeployReadiness({
  env: readyEnv,
  audit: makeAudit({
    releaseStatus: {
      apiDeployReady: false,
    },
  }),
  storeCompliance: readyStoreCompliance,
});
assert('deploy readiness blocks missing API deployment package',
  missingApiDeployPackage.ok === false
    && missingApiDeployPackage.blockers.some((item: any) => item.name === 'Production API deployment package is ready'));

const missingStoreListing = collectMobileDeployReadiness({
  env: readyEnv,
  audit: makeAudit({
    releaseStatus: {
      storeListingReady: false,
    },
  }),
  storeCompliance: readyStoreCompliance,
});
assert('deploy readiness blocks missing store listing metadata',
  missingStoreListing.ok === false
    && missingStoreListing.blockers.some((item: any) => item.name === 'Store listing metadata is ready'));

const missingStoreAssets = collectMobileDeployReadiness({
  env: readyEnv,
  audit: makeAudit({
    releaseStatus: {
      storeAssetsReady: false,
    },
  }),
  storeCompliance: readyStoreCompliance,
});
assert('deploy readiness blocks missing store visual assets',
  missingStoreAssets.ok === false
    && missingStoreAssets.blockers.some((item: any) => item.name === 'Store visual assets are ready'));

console.log('[mobile-deploy-readiness.test] passed');

export {};
