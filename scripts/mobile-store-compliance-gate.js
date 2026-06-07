const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function assert(name, condition, detail = '') {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

function isProductionHttpsUrl(url) {
  return /^https:\/\/[^/]+/i.test(String(url || ''))
    && !/localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|\.example(?:\/|$)|\.invalid(?:\/|$)|\.test(?:\/|$)|leword\.example(?:\/|$)/i.test(String(url || ''));
}

const compliance = readJson('docs/mobile-store-compliance.json');
const appConfig = readJson('apps/mobile/app.json');
const mobileRuntime = read('apps/mobile/src/config/runtime.ts');
const mobileScreen = read('apps/mobile/src/screens/MobileHunterScreen.tsx');
const pushRegistration = read('apps/mobile/src/services/pushRegistration.ts');
const mobileClient = read('apps/mobile/src/api/lewordClient.ts');

assert('compliance manifest app id matches Android package',
  compliance.appId === appConfig.expo.android.package,
  `${compliance.appId} !== ${appConfig.expo.android.package}`);
assert('privacy policy URL is production HTTPS',
  isProductionHttpsUrl(compliance.privacyPolicyUrl),
  compliance.privacyPolicyUrl);
assert('support URL is production HTTPS',
  isProductionHttpsUrl(compliance.supportUrl),
  compliance.supportUrl);
assert('app config production API URL is HTTPS',
  isProductionHttpsUrl(appConfig.expo.extra?.lewordApiBaseUrl),
  appConfig.expo.extra?.lewordApiBaseUrl);
assert('mobile runtime exposes privacy URL env override',
  /EXPO_PUBLIC_LEWORD_PRIVACY_URL/.test(mobileRuntime)
    && /LEWORD_DEFAULT_PRIVACY_URL/.test(mobileRuntime));
assert('mobile screen exposes in-app privacy policy link',
  /Privacy Policy/.test(mobileScreen)
    && /Linking\.openURL/.test(mobileScreen)
    && /getDefaultPrivacyUrl/.test(mobileScreen));
assert('mobile only requests notification runtime permission',
  Array.isArray(appConfig.expo.android.permissions)
    && appConfig.expo.android.permissions.length === 1
    && appConfig.expo.android.permissions[0] === 'POST_NOTIFICATIONS');
assert('compliance manifest matches notification permission',
  compliance.privacy.permissions.includes('POST_NOTIFICATIONS'));
assert('push token collection is disclosed',
  /getExpoPushTokenAsync/.test(pushRegistration)
    && JSON.stringify(compliance).includes('Expo push token'));
assert('API bearer token transmission is disclosed',
  /Authorization/.test(mobileClient)
    && JSON.stringify(compliance).includes('API bearer token'));
assert('keyword job parameter collection is disclosed',
  /createKeywordAnalysisJob/.test(mobileClient)
    && JSON.stringify(compliance).includes('keyword job parameters'));
assert('tracking and ads are declared disabled',
  compliance.privacy.tracking === false
    && compliance.privacy.thirdPartyAds === false
    && compliance.storeForms.appleAppPrivacy.tracking === false);
assert('Google Play data safety marks data encrypted in transit',
  compliance.storeForms.googlePlayDataSafety.dataEncryptedInTransit === true
    && compliance.privacy.encryptedInTransit === true);
assert('reviewer access instructions are present',
  compliance.reviewerAccess.demoTokenRequired === true
    && compliance.reviewerAccess.instructions.length > 80);

console.log('[mobile-store-compliance-gate] passed');
