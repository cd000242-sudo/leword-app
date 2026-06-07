const {
  buildNextCommands,
  collectMobileReleaseKit,
  platformForTarget,
  requiredInputsForTarget,
  targetNeedsAppDeploy,
  targetNeedsApiImage,
} = require('../../../scripts/mobile-release-kit');

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
      uiReady: true,
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
};

assert('release kit maps target to platform',
  platformForTarget('android-internal') === 'android'
    && platformForTarget('android-public') === 'android'
    && platformForTarget('ios-testflight') === 'ios'
    && platformForTarget('full-release') === 'all');
assert('release kit target helpers identify deploy and api-image paths',
  targetNeedsAppDeploy('android-internal') === true
    && targetNeedsAppDeploy('android-public') === true
    && targetNeedsAppDeploy('verify-only') === false
    && targetNeedsApiImage('api-image') === true
    && targetNeedsApiImage('ios-testflight') === false);

const verifyOnly = collectMobileReleaseKit({
  target: 'verify-only',
  submitToStores: false,
  runApiSmoke: false,
  env: {},
  audit: makeAudit(),
});
assert('verify-only release kit is ready without external release secrets',
  verifyOnly.ok === true
    && verifyOnly.deployReadiness === null
    && verifyOnly.requiredInputs.variables.length === 0);

const androidReady = collectMobileReleaseKit({
  target: 'android-internal',
  submitToStores: true,
  runApiSmoke: true,
  env: readyEnv,
  audit: makeAudit(),
  storeCompliance: { privacyPolicyUrl: 'https://leword.app/privacy' },
});
assert('android release kit passes when target inputs and readiness are present',
  androidReady.ok === true
    && androidReady.platform === 'android'
    && androidReady.requiredInputs.secrets.includes('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64')
    && androidReady.nextCommands.includes('npm run mobile:submit:android:internal')
    && androidReady.nextCommands.includes('npm run mobile:api-smoke'));

const androidPublicReady = collectMobileReleaseKit({
  target: 'android-public',
  submitToStores: true,
  runApiSmoke: true,
  env: { ...readyEnv, LEWORD_MOBILE_REVIEWER_TOKEN_READY: 'true' },
  audit: makeAudit({
    releaseStatus: {
      androidPublicSubmitReady: true,
    },
  }),
  storeCompliance: { privacyPolicyUrl: 'https://leword.app/privacy' },
});
assert('android public release kit uses public submit command',
  androidPublicReady.ok === true
    && androidPublicReady.platform === 'android'
    && androidPublicReady.requiredInputs.secrets.includes('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64')
    && androidPublicReady.requiredInputs.secrets.includes('LEWORD_MOBILE_REVIEWER_TOKEN_READY')
    && androidPublicReady.nextCommands.includes('npm run mobile:public-release-gate:android')
    && androidPublicReady.nextCommands.includes('npm run mobile:submit:android:public'));

const iosReady = collectMobileReleaseKit({
  target: 'ios-testflight',
  submitToStores: true,
  runApiSmoke: false,
  env: readyEnv,
  audit: makeAudit(),
  storeCompliance: { privacyPolicyUrl: 'https://leword.app/privacy' },
});
assert('ios release kit accepts ASC API key input set',
  iosReady.ok === true
    && iosReady.requiredInputs.secrets.some((item: string) => item.includes('EXPO_ASC_API_KEY_P8_B64'))
    && iosReady.nextCommands.includes('npm run mobile:submit:ios:testflight'));

const missingRuntime = collectMobileReleaseKit({
  target: 'full-release',
  submitToStores: true,
  runApiSmoke: false,
  env: readyEnv,
  audit: makeAudit({
    releaseStatus: {
      apiRuntimeReady: false,
    },
  }),
  storeCompliance: { privacyPolicyUrl: 'https://leword.app/privacy' },
});
assert('full release kit blocks when production API worker is not ready',
  missingRuntime.ok === false
    && missingRuntime.blockers.some((item: any) => item.name === 'Production API worker is ready'));

const missingCiInput = collectMobileReleaseKit({
  target: 'android-internal',
  submitToStores: true,
  runApiSmoke: false,
  env: { ...readyEnv, GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64: '' },
  audit: makeAudit(),
  storeCompliance: { privacyPolicyUrl: 'https://leword.app/privacy' },
});
assert('release kit surfaces missing target-specific CI secrets',
  missingCiInput.ok === false
    && missingCiInput.blockers.some((item: any) => item.name === 'Google Play service account secret is configured'));

const missingUiEvidence = collectMobileReleaseKit({
  target: 'verify-only',
  submitToStores: false,
  runApiSmoke: false,
  env: readyEnv,
  audit: makeAudit({
    releaseStatus: {
      uiReady: false,
    },
  }),
});
assert('release kit blocks when mobile UI release evidence is missing',
  missingUiEvidence.ok === false
    && missingUiEvidence.blockers.some((item: any) => item.name === 'Local release evidence is ready'));

const commands = buildNextCommands('full-release', true, true);
assert('release kit commands include full release build, submit, and smoke sequence',
  commands.includes('npm run mobile:api:docker:build')
    && commands.includes('npm run mobile:submit:android:internal')
    && commands.includes('npm run mobile:submit:ios:testflight')
    && commands.includes('npm run mobile:api-smoke'));

const publicCommands = buildNextCommands('android-public', true, true);
assert('release kit commands include Android public submit sequence',
  publicCommands.includes('npm run mobile:build:android:production')
    && publicCommands.includes('npm run mobile:public-release-gate:android')
    && publicCommands.includes('npm run mobile:submit:android:public')
    && !publicCommands.includes('npm run mobile:submit:android:internal'));

const required = requiredInputsForTarget('full-release', true, true);
assert('release kit required inputs include app variables and store secrets',
  required.variables.includes('LEWORD_MOBILE_API_URL')
    && required.secrets.includes('EXPO_TOKEN')
    && required.secrets.includes('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64')
    && required.secrets.some((item: string) => item.includes('EXPO_ASC_API_KEY_P8_B64')));

console.log('[mobile-release-kit.test] passed');

export {};
