const {
  collectMobileCiSecretsGate,
  hasAppleSubmitAuth,
  normalizeTarget,
  isProductionHttpsUrl,
} = require('../../../scripts/mobile-ci-secrets-gate');

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

const releaseEnv = {
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
  EXPO_APPLE_APP_SPECIFIC_PASSWORD: 'app-specific-password',
  EXPO_ASC_API_KEY_P8_B64: '',
  EXPO_ASC_API_KEY_ISSUER_ID: '',
  EXPO_ASC_API_KEY_ID: '',
};

assert('target normalizer accepts full release', normalizeTarget('full-release') === 'full-release');
assert('target normalizer accepts public Android release', normalizeTarget('android-public') === 'android-public');
assert('production URL check accepts real HTTPS URL', isProductionHttpsUrl('https://api.leword.app') === true);
assert('production URL check rejects placeholder', isProductionHttpsUrl('https://api.leword.example') === false);

const verifyOnly = collectMobileCiSecretsGate({
  target: 'verify-only',
  submitToStores: false,
  runApiSmoke: false,
  env: {},
});
assert('verify-only does not require external release secrets', verifyOnly.ok === true);

const androidBuild = collectMobileCiSecretsGate({
  target: 'android-internal',
  submitToStores: false,
  runApiSmoke: false,
  env: releaseEnv,
});
assert('android build target accepts production app release inputs', androidBuild.ok === true);
assert('android build without submit does not require Google Play secret',
  !androidBuild.checks.some((item: any) => item.name === 'Google Play service account secret is configured'));

const androidSubmitMissing = collectMobileCiSecretsGate({
  target: 'android-internal',
  submitToStores: true,
  runApiSmoke: false,
  env: { ...releaseEnv, GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64: '' },
});
assert('android submit blocks missing Google Play secret',
  androidSubmitMissing.ok === false
    && androidSubmitMissing.blockers.some((item: any) => item.name === 'Google Play service account secret is configured'));

const androidPublicMissingReviewer = collectMobileCiSecretsGate({
  target: 'android-public',
  submitToStores: true,
  runApiSmoke: true,
  env: { ...releaseEnv, LEWORD_MOBILE_REVIEWER_TOKEN_READY: '' },
});
assert('android public submit blocks missing reviewer token evidence',
  androidPublicMissingReviewer.ok === false
    && androidPublicMissingReviewer.blockers.some((item: any) => item.name === 'Reviewer demo token readiness is configured'));

const androidPublicReady = collectMobileCiSecretsGate({
  target: 'android-public',
  submitToStores: true,
  runApiSmoke: true,
  env: { ...releaseEnv, LEWORD_MOBILE_REVIEWER_TOKEN_READY: 'true' },
});
assert('android public submit accepts public release inputs',
  androidPublicReady.ok === true
    && androidPublicReady.checks.some((item: any) => item.name === 'Google Play service account secret is configured')
    && androidPublicReady.checks.some((item: any) => item.name === 'Reviewer demo token readiness is configured'));

const iosSubmitWithApiKey = collectMobileCiSecretsGate({
  target: 'ios-testflight',
  submitToStores: true,
  runApiSmoke: false,
  env: {
    ...releaseEnv,
    EXPO_APPLE_APP_SPECIFIC_PASSWORD: '',
    EXPO_ASC_API_KEY_P8_B64: 'base64-p8',
    EXPO_ASC_API_KEY_ISSUER_ID: 'issuer-id',
    EXPO_ASC_API_KEY_ID: 'KEYID12345',
  },
});
assert('ios submit accepts App Store Connect API key auth instead of app password',
  iosSubmitWithApiKey.ok === true);

const iosSubmitMissing = collectMobileCiSecretsGate({
  target: 'ios-testflight',
  submitToStores: true,
  runApiSmoke: false,
  env: {
    ...releaseEnv,
    EXPO_APPLE_APP_SPECIFIC_PASSWORD: '',
    EXPO_ASC_API_KEY_P8_B64: '',
    EXPO_ASC_API_KEY_ISSUER_ID: '',
    EXPO_ASC_API_KEY_ID: '',
  },
});
assert('ios submit blocks missing Apple submit auth',
  iosSubmitMissing.ok === false
    && iosSubmitMissing.blockers.some((item: any) => item.name === 'Apple submit auth secret is configured'));

assert('Apple submit auth helper accepts app password or ASC API key set',
  hasAppleSubmitAuth({ EXPO_APPLE_APP_SPECIFIC_PASSWORD: 'pw' }) === true
    && hasAppleSubmitAuth({
      EXPO_ASC_API_KEY_P8_B64: 'p8',
      EXPO_ASC_API_KEY_ISSUER_ID: 'issuer',
      EXPO_ASC_API_KEY_ID: 'key',
    }) === true
    && hasAppleSubmitAuth({ EXPO_ASC_API_KEY_P8_B64: 'p8' }) === false);

const smokeMissing = collectMobileCiSecretsGate({
  target: 'api-image',
  submitToStores: false,
  runApiSmoke: true,
  env: { EXPO_PUBLIC_LEWORD_API_URL: 'https://api.leword.app' },
});
assert('api smoke blocks missing smoke token',
  smokeMissing.ok === false
    && smokeMissing.blockers.some((item: any) => item.name === 'API smoke token secret is configured'));

console.log('[mobile-ci-secrets-gate.test] passed');

export {};
