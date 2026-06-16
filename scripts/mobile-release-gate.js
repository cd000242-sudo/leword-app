const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function assert(name, condition, detail = '') {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

function assertProductionApiUrl(url) {
  assert('Production mobile API URL is provided', /^https:\/\/[^/]+/.test(url), url || 'missing');
  assert('Production mobile API URL is not localhost', !/localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]/i.test(url), url);
  assert(
    'Production mobile API URL is not a placeholder domain',
    !/(^https:\/\/api\.example\.com(?:\/|$)|\.example(?:\/|$)|\.invalid(?:\/|$)|\.test(?:\/|$)|leword\.example(?:\/|$))/i.test(url),
    url,
  );
}

function readNumericContractValue(source, key) {
  const match = source.match(new RegExp(`${key}:\\s*(\\d+)`));
  return match ? Number(match[1]) : NaN;
}

const mobilePackage = readJson('apps/mobile/package.json');
const appConfig = readJson('apps/mobile/app.json');
const easConfig = readJson('apps/mobile/eas.json');
const storeCompliance = readJson('docs/mobile-store-compliance.json');
const contracts = read('src/mobile/contracts.ts');
const mobileSources = [
  'apps/mobile/App.tsx',
  'apps/mobile/src/api/lewordClient.ts',
  'apps/mobile/src/config/runtime.ts',
  'apps/mobile/src/services/pushRegistration.ts',
  'apps/mobile/src/screens/MobileHunterScreen.tsx',
].map(read).join('\n');
const mobileScreen = read('apps/mobile/src/screens/MobileHunterScreen.tsx');
const apiServer = read('apps/api/src/server.ts');
const entitlements = read('src/mobile/entitlements.ts');
const prewarmScheduler = read('src/mobile/prewarm-scheduler.ts');
const apiGuardrails = read('src/mobile/api-guardrails.ts');
const productionApiUrl = (process.env.EXPO_PUBLIC_LEWORD_API_URL || '').trim();
const isProductionCheck = process.env.LEWORD_MOBILE_RELEASE_ENV === 'production';

const dependencies = {
  ...mobilePackage.dependencies,
  ...mobilePackage.devDependencies,
};

for (const [name, version] of Object.entries(dependencies)) {
  assert(`mobile dependency is pinned: ${name}`, version !== 'latest' && version !== '*', version);
}

assert('Expo SDK is pinned to 56', /^~56\.0\./.test(mobilePackage.dependencies.expo), mobilePackage.dependencies.expo);
assert('React matches Expo SDK 56', mobilePackage.dependencies.react === '19.2.3', mobilePackage.dependencies.react);
assert('React Native targets Expo SDK 56 RN 0.85', /^~0\.85\./.test(mobilePackage.dependencies['react-native']), mobilePackage.dependencies['react-native']);
assert('Expo StatusBar matches SDK 56 bundle', /^~56\.0\./.test(mobilePackage.dependencies['expo-status-bar']), mobilePackage.dependencies['expo-status-bar']);
assert('Expo Notifications matches SDK 56 bundle', /^~56\.0\./.test(mobilePackage.dependencies['expo-notifications']), mobilePackage.dependencies['expo-notifications']);
assert('Expo Device matches SDK 56 bundle', /^~56\.0\./.test(mobilePackage.dependencies['expo-device']), mobilePackage.dependencies['expo-device']);
assert('Expo Constants matches SDK 56 bundle', /^~56\.0\./.test(mobilePackage.dependencies['expo-constants']), mobilePackage.dependencies['expo-constants']);
assert('Expo SDK 56 app config does not use removed top-level jsEngine', !Object.prototype.hasOwnProperty.call(appConfig.expo, 'jsEngine'));
assert('Expo SDK 56 app config does not use removed top-level newArchEnabled', !Object.prototype.hasOwnProperty.call(appConfig.expo, 'newArchEnabled'));
assert('Expo Notifications config plugin is enabled',
  JSON.stringify(appConfig.expo.plugins || []).includes('expo-notifications'));
assert('Android internal build emits APK for tester install', easConfig.build.internal.android.buildType === 'apk');
assert('iOS simulator build profile exists', easConfig.build.development.ios.simulator === true);
assert('Production build profile exists', !!easConfig.build.production);
assert('Mobile only requests notification runtime permission',
  Array.isArray(appConfig.expo.android.permissions)
    && appConfig.expo.android.permissions.length === 1
    && appConfig.expo.android.permissions[0] === 'POST_NOTIFICATIONS');
assert('Mobile UI does not import desktop/browser automation', !/electron|ipcRenderer|patchright|playwright|puppeteer|chromium/i.test(mobileSources));
assert('Mobile client supports cancel and polling', /cancelJob/.test(mobileSources) && /pollJobUntilTerminal/.test(mobileSources));
assert('Mobile client supports recommendation inbox', /getNotifications/.test(mobileSources) && /markNotificationRead/.test(mobileSources));
assert('Mobile client supports push subscription registration',
  /registerPushSubscription/.test(mobileSources)
    && /unregisterPushSubscription/.test(mobileSources)
    && /MOBILE_PUSH_ROUTES/.test(mobileSources));
assert('Mobile runtime can acquire Expo push token',
  /expo-notifications/.test(mobileSources)
    && /expo-device/.test(mobileSources)
    && /getExpoPushTokenAsync/.test(mobileSources)
    && /EXPO_PUBLIC_EAS_PROJECT_ID/.test(mobileSources));
assert('Mobile runtime API URL is environment configurable', /EXPO_PUBLIC_LEWORD_API_URL/.test(mobileSources) && /getDefaultLewordApiUrl/.test(mobileSources));
assert('Mobile exposes in-app privacy policy link',
  /EXPO_PUBLIC_LEWORD_PRIVACY_URL/.test(mobileSources)
    && /Privacy Policy/.test(mobileSources)
    && /Linking\.openURL/.test(mobileSources));
assert('Mobile store compliance manifest matches app id',
  storeCompliance.appId === appConfig.expo.android.package
    && /^https:\/\//.test(storeCompliance.privacyPolicyUrl)
    && storeCompliance.privacy.permissions.includes('POST_NOTIFICATIONS'));
if (isProductionCheck) {
  assertProductionApiUrl(productionApiUrl);
}
assert('Mobile user UI does not expose admin prewarm run', !/추천 예열/.test(mobileScreen) && !/onPress=\{runPrewarm\}/.test(mobileScreen));
assert('Contracts keep server-only heavy runtime policy', /heavyBrowserAutomation:\s*'server-only'/.test(contracts));
assert('Golden precision SSS floor remains 30+',
  readNumericContractValue(contracts, 'goldenPrecisionSss') >= 30);
assert('Golden bulk SSS floor remains 60+',
  readNumericContractValue(contracts, 'goldenBulkSss') >= 60);
assert('PRO target remains 250+',
  readNumericContractValue(contracts, 'proTrafficMaxSssTarget') >= 250);
assert('Mobile API enforces public request guardrails',
  /apiGuardrails/.test(contracts)
    && /MobileApiRateLimiter/.test(apiGuardrails)
    && /LEWORD_MOBILE_MAX_BODY_BYTES/.test(apiGuardrails)
    && /LEWORD_MOBILE_RATE_LIMIT_PER_MINUTE/.test(apiGuardrails)
    && /guardrails/.test(apiServer)
    && /rateLimited/.test(apiServer)
    && /payloadTooLarge/.test(apiServer));
assert('Mobile API enforces entitlement tiers', /entitlementVerifier/.test(apiServer) && /authorizeMobileRequest/.test(apiServer));
assert('PRO, home-board, and KIN products require pro entitlement', /'pro-traffic-hunter': 'pro'/.test(entitlements)
  && /'home-board-hunter': 'pro'/.test(entitlements)
  && /'kin-hidden-honey': 'pro'/.test(entitlements));
assert('Mobile entitlement can delegate to production license service',
  /LEWORD_MOBILE_ENTITLEMENT_URL/.test(entitlements)
    && /createHttpMobileEntitlementVerifier/.test(entitlements)
    && /source: 'license-service'/.test(entitlements));
assert('Mobile API can schedule server-side prewarm jobs',
  /LEWORD_MOBILE_PREWARM_INTERVAL_MINUTES/.test(prewarmScheduler)
    && /MobilePrewarmScheduler/.test(prewarmScheduler)
    && /prewarmScheduler\.start/.test(apiServer)
    && /scheduler: prewarmScheduler/.test(apiServer));
assert('Mobile API exposes notification inbox routes',
  /MOBILE_NOTIFICATION_ROUTES/.test(contracts)
    && /MOBILE_NOTIFICATION_ROUTES/.test(apiServer)
    && /MobileNotificationInbox/.test(apiServer));
assert('Mobile API exposes push subscription routes',
  /MOBILE_PUSH_ROUTES/.test(contracts)
    && /MOBILE_PUSH_ROUTES/.test(apiServer)
    && /MobilePushRegistry/.test(apiServer)
    && /MobilePushDispatcher/.test(apiServer));

console.log('[mobile-release-gate] passed');
