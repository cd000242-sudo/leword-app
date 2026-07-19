import * as fs from 'fs';
import * as path from 'path';
import {
  MOBILE_API_ENDPOINTS,
  MOBILE_JOB_ROUTES,
  MOBILE_NOTIFICATION_ROUTES,
  MOBILE_PC_PARITY_SLA,
  MOBILE_PUSH_ROUTES,
  getMobileEndpointByKey,
  isServerOnlyMobileProduct,
} from '../../mobile/contracts';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

const root = path.join(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

const requiredEndpointKeys = [
  'createGoldenDiscoveryJob',
  'createProTrafficJob',
  'analyzeKeyword',
  'expandMindmap',
  'huntHomeBoard',
  'huntKinHiddenHoney',
];

for (const key of requiredEndpointKeys) {
  assert(`mobile endpoint registered: ${key}`, !!getMobileEndpointByKey(key));
}

assert(
  'mobile heavy browser automation is server-only',
  MOBILE_PC_PARITY_SLA.devicePolicy.heavyBrowserAutomation === 'server-only',
);

assert(
  'mobile keeps golden precision 30+ SSS floor',
  MOBILE_PC_PARITY_SLA.qualityFloors.goldenPrecisionSss >= 30,
);

assert(
  'mobile keeps golden bulk 60+ SSS floor',
  MOBILE_PC_PARITY_SLA.qualityFloors.goldenBulkSss >= 60,
);

assert(
  'mobile supports PRO 250 target',
  MOBILE_PC_PARITY_SLA.qualityFloors.proTrafficMaxSssTarget >= 250,
);

assert(
  'first progress budget is fast enough for mobile UX',
  MOBILE_PC_PARITY_SLA.latencyBudgetsMs.firstProgressP95 <= 2000,
);

assert(
  'all mobile keyword products are server worker products',
  MOBILE_API_ENDPOINTS.every((endpoint) => isServerOnlyMobileProduct(endpoint.product)),
);

assert(
  'all long-running mobile endpoints stream progress',
  MOBILE_API_ENDPOINTS.every((endpoint) => endpoint.transport === 'sse' || endpoint.transport === 'websocket'),
);

const mobileSources = [
  'apps/mobile/App.tsx',
  'apps/mobile/src/contracts.ts',
  'apps/mobile/src/api/lewordClient.ts',
  'apps/mobile/src/config/runtime.ts',
  'apps/mobile/src/services/pushRegistration.ts',
  'apps/mobile/src/screens/MobileHunterScreen.tsx',
  'apps/mobile/metro.config.js',
].map(read).join('\n');
const mobileTsconfig = read('apps/mobile/tsconfig.json');
const mobilePackage = JSON.parse(read('apps/mobile/package.json'));
const mobileAppConfig = JSON.parse(read('apps/mobile/app.json'));
const mobileEasConfig = JSON.parse(read('apps/mobile/eas.json'));
const apiPackage = JSON.parse(read('apps/api/package.json'));
const apiDockerfile = read('apps/api/Dockerfile');
const apiProductionCompose = read('apps/api/docker-compose.production.yml');
const apiReadme = read('apps/api/README.md');
const liveGoldenWorker = read('apps/api/src/live-golden-worker.ts');
const dockerignore = read('.dockerignore');
const mobileReleaseWorkflow = read('.github/workflows/mobile-release.yml');
const rootPackage = JSON.parse(read('package.json'));
const productionReleaseGate = read('scripts/mobile-production-release-gate.js');
const mobileReleaseGate = read('scripts/mobile-release-gate.js');
const cloudReleaseGate = read('scripts/mobile-cloud-release-gate.js');
const submitGate = read('scripts/mobile-submit-gate.js');
const deployReadiness = read('scripts/mobile-deploy-readiness.js');
const apiDeployGate = read('scripts/mobile-api-deploy-gate.js');
const ciSecretsGate = read('scripts/mobile-ci-secrets-gate.js');
const materializeSubmitConfig = read('scripts/mobile-materialize-submit-config.js');
const apiRuntimeGate = read('scripts/mobile-api-runtime-gate.js');
const apiSmokeTest = read('scripts/mobile-api-smoke-test.js');
const apiPerformanceSmoke = read('scripts/mobile-api-performance-smoke.js');
const uiReleaseGate = read('scripts/mobile-ui-release-gate.js');
const storeComplianceGate = read('scripts/mobile-store-compliance-gate.js');
const storeListingGate = read('scripts/mobile-store-listing-gate.js');
const storeAssetsGate = read('scripts/mobile-store-assets-gate.js');
const storeSubmissionPackage = read('scripts/mobile-store-submission-package.js');
const launchSlaReport = read('scripts/mobile-launch-sla-report.js');
const mobileGenerateAssets = read('scripts/mobile-generate-assets.js');
const releaseAudit = read('scripts/mobile-release-audit.js');
const releaseKit = read('scripts/mobile-release-kit.js');
const githubSetupPlan = read('scripts/mobile-github-setup-plan.js');
const releaseDryRun = read('scripts/mobile-release-dry-run.js');
const releaseDispatchPlan = read('scripts/mobile-release-dispatch-plan.js');
const releaseStatus = read('scripts/mobile-release-status.js');
const publicReleaseGate = read('scripts/mobile-public-release-gate.js');
const releaseSecretScan = read('scripts/mobile-release-secret-scan.js');
const runtimeReadiness = read('src/mobile/runtime-readiness.ts');
const apiGuardrails = read('src/mobile/api-guardrails.ts');
const storeCompliance = read('docs/mobile-store-compliance.json');
const storeListing = read('docs/mobile-store-listing.json');
const storeAssets = read('docs/mobile-store-assets.json');
const mobileEnvExample = read('apps/mobile/.env.production.example');
const apiEnvExample = read('apps/api/.env.production.example');
const mobileReleaseRunbook = read('docs/mobile-release-runbook.md');

assert('mobile UI does not import Electron', !/electron|ipcRenderer|electronAPI/i.test(mobileSources));
assert('mobile UI does not import browser automation', !/patchright|playwright|puppeteer|chromium/i.test(mobileSources));
assert('mobile bundle does not import root server contracts', !/\.\.\/\.\.\/\.\.\/\.\.\/src\/mobile\/contracts/.test(mobileSources));
assert('mobile UI exposes Korean category labels', /지원금\/정책/.test(mobileSources) && /스타\/연예/.test(mobileSources));
assert('mobile UI exposes all key hunter modes', /카테고리 황금키워드/.test(mobileSources)
  && /PRO 트래픽 헌터/.test(mobileSources)
  && /키워드 분석/.test(mobileSources)
  && /마인드맵 확장/.test(mobileSources)
  && /네이버 홈판 후보/.test(mobileSources)
  && /지식인 숨은 질문/.test(mobileSources));
assert('mobile UI creates jobs through mobile API client', /new LewordMobileClient/.test(mobileSources)
  && /createGoldenDiscoveryJob/.test(mobileSources)
  && /createProTrafficJob/.test(mobileSources)
  && /createKeywordAnalysisJob/.test(mobileSources)
  && /createMindmapExpansionJob/.test(mobileSources)
  && /createHomeBoardJob/.test(mobileSources)
    && /createKinHiddenHoneyJob/.test(mobileSources));
assert('mobile UI exposes recommendation inbox',
  /오늘 추천 인박스/.test(mobileSources)
    && /getNotifications/.test(mobileSources)
    && /markNotificationRead/.test(mobileSources));
assert('mobile API client can register push subscriptions',
  /registerPushSubscription/.test(mobileSources)
    && /unregisterPushSubscription/.test(mobileSources)
    && /MOBILE_PUSH_ROUTES/.test(mobileSources));
assert('mobile runtime can acquire Expo push tokens',
  /expo-notifications/.test(mobileSources)
    && /expo-device/.test(mobileSources)
    && /getExpoPushTokenAsync/.test(mobileSources)
    && /EXPO_PUBLIC_EAS_PROJECT_ID/.test(mobileSources)
    && /registerLeWordPushNotifications/.test(mobileSources));
assert('mobile mode buttons wrap for phone width',
  /flexWrap:\s*'wrap'/.test(mobileSources) && /flexBasis:\s*'30%'/.test(mobileSources));
assert('mobile API URL is environment configurable with safe dev fallback',
  /EXPO_PUBLIC_LEWORD_API_URL/.test(mobileSources)
    && /getDefaultLewordApiUrl/.test(mobileSources)
    && /127\.0\.0\.1:34983/.test(mobileSources)
    && /getLewordApiUrlWarning/.test(mobileSources));
assert('mobile UI can send API bearer token',
  /accessToken/.test(mobileSources) && /secureTextEntry/.test(mobileSources));
assert('mobile UI warns when API URL is device-local',
  /apiUrlWarning/.test(mobileSources) && /localhost\/127\.0\.0\.1/.test(mobileSources));
assert('mobile UI exposes server prewarm controls',
  /서버 예열 추천/.test(mobileSources)
    && /runPrewarm/.test(mobileSources)
    && /getPrewarmSnapshot/.test(mobileSources));
assert('mobile Metro watches workspace root for shared contracts',
  /watchFolders/.test(mobileSources)
    && /workspaceRoot/.test(mobileSources)
    && /nodeModulesPaths/.test(mobileSources));
const mobileContract = read('apps/mobile/src/contracts.ts');
const sharedMobileContract = read('src/mobile/contracts.ts');
assert('mobile contract mirror preserves PC endpoint paths and SSS floors',
  MOBILE_API_ENDPOINTS.every((endpoint) => mobileContract.includes(endpoint.path))
    && Object.values(MOBILE_NOTIFICATION_ROUTES).every((route) => mobileContract.includes(route))
    && Object.values(MOBILE_PUSH_ROUTES).every((route) => mobileContract.includes(route.replace(':id', '')))
    && mobileContract.includes('goldenPrecisionSss: 30')
    && mobileContract.includes('goldenBulkSss: 60')
    && mobileContract.includes('proTrafficMaxSssTarget: 250')
    && mobileContract.includes('maxBodyBytesDefault')
    && mobileContract.includes('maxRequestsPerMinuteDefault'));
assert('mobile UI polls, cancels, and renders results',
  /pollJobUntilTerminal/.test(mobileSources)
    && /cancelJob/.test(mobileSources)
    && /progressPercent/.test(mobileSources)
    && /결과 \{result\.summary\.total\}개/.test(mobileSources));
assert('mobile has dedicated typecheck config', /App\.tsx/.test(mobileTsconfig) && /src\/\*\*\/\*\.tsx/.test(mobileTsconfig));
assert('mobile typecheck does not pull server worker implementation',
  !/\.\.\/\.\.\/src\/mobile\/\*\*\/\*\.ts/.test(mobileTsconfig));
assert('mobile dependencies are pinned instead of floating latest',
  Object.values({ ...mobilePackage.dependencies, ...mobilePackage.devDependencies }).every((version) => version !== 'latest' && version !== '*'));
assert('mobile Expo SDK line matches current release target',
  /^~56\.0\./.test(mobilePackage.dependencies.expo)
    && mobilePackage.dependencies.react === '19.2.3'
    && /^~0\.85\./.test(mobilePackage.dependencies['react-native'])
    && /^~56\.0\./.test(mobilePackage.dependencies['expo-status-bar'])
    && /^~56\.0\./.test(mobilePackage.dependencies['expo-notifications'])
    && /^~56\.0\./.test(mobilePackage.dependencies['expo-device'])
    && /^~56\.0\./.test(mobilePackage.dependencies['expo-constants']));
assert('mobile SDK 56 config avoids removed top-level runtime flags',
  !Object.prototype.hasOwnProperty.call(mobileAppConfig.expo, 'jsEngine')
    && !Object.prototype.hasOwnProperty.call(mobileAppConfig.expo, 'newArchEnabled'));
assert('mobile notifications plugin and Android runtime permission are configured',
  JSON.stringify(mobileAppConfig.expo.plugins || []).includes('expo-notifications')
    && mobileAppConfig.expo.android.permissions.length === 1
    && mobileAppConfig.expo.android.permissions[0] === 'POST_NOTIFICATIONS');
assert('mobile app config includes release visual assets',
  mobileAppConfig.expo.icon === './assets/icon.png'
    && mobileAppConfig.expo.splash.image === './assets/splash.png'
    && mobileAppConfig.expo.splash.resizeMode === 'contain'
    && mobileAppConfig.expo.ios.supportsTablet === false
    && mobileAppConfig.expo.android.adaptiveIcon.foregroundImage === './assets/adaptive-icon.png'
    && mobileAppConfig.expo.android.adaptiveIcon.backgroundColor === '#111827');
assert('mobile EAS config exposes internal Android and iOS simulator paths',
  mobileEasConfig.build.internal.android.buildType === 'apk'
    && mobileEasConfig.build.development.ios.simulator === true
    && !!mobileEasConfig.build.production);
assert('mobile EAS config exposes store submit profiles',
  mobileEasConfig.submit.production.android.track === 'internal'
    && mobileEasConfig.submit.production.android.releaseStatus === 'draft'
    && mobileEasConfig.submit.production.android.serviceAccountKeyPath === './credentials/google-play-service-account.json'
    && mobileEasConfig.submit.public.android.track === 'production'
    && mobileEasConfig.submit.public.android.releaseStatus === 'draft'
    && mobileEasConfig.submit.public.android.serviceAccountKeyPath === './credentials/google-play-service-account.json'
    && mobileEasConfig.submit.production.ios.sku === 'com.leword.mobile'
    && mobileEasConfig.submit.public.ios.sku === 'com.leword.mobile'
    && /REPLACE_WITH_APP_STORE_CONNECT_APP_ID/.test(mobileEasConfig.submit.production.ios.ascAppId)
    && /REPLACE_WITH_APP_STORE_CONNECT_APP_ID/.test(mobileEasConfig.submit.public.ios.ascAppId));
assert('mobile package exposes store build and submit commands',
  /eas-cli build --platform android --profile production/.test(mobilePackage.scripts['build:android:production'])
    && /eas-cli submit --platform android --profile production --latest/.test(mobilePackage.scripts['submit:android:internal'])
    && /eas-cli submit --platform android --profile public --latest/.test(mobilePackage.scripts['submit:android:public'])
    && /eas-cli submit --platform ios --profile production --latest/.test(mobilePackage.scripts['submit:ios:testflight']));
assert('root package exposes mobile readiness and EAS gates',
  rootPackage.scripts['mobile:readiness'] === 'node scripts/mobile-readiness-report.js'
    && rootPackage.scripts['mobile:release-gate:production'] === 'node scripts/mobile-production-release-gate.js'
    && rootPackage.scripts['mobile:api-runtime-gate'] === 'node scripts/mobile-api-runtime-gate.js'
    && rootPackage.scripts['mobile:api-smoke'] === 'node scripts/mobile-api-smoke-test.js'
    && rootPackage.scripts['mobile:api-performance-smoke'] === 'node scripts/mobile-api-performance-smoke.js'
    && rootPackage.scripts['mobile:api-performance-smoke:save'] === 'node scripts/mobile-api-performance-smoke.js --out .codex-build-cache/mobile-api-performance-smoke.json'
    && rootPackage.scripts['mobile:ui-release-gate'] === 'node scripts/mobile-ui-release-gate.js'
    && rootPackage.scripts['mobile:ui-release-gate:save'] === 'node scripts/mobile-ui-release-gate.js --out .codex-build-cache/mobile-ui-release-gate.json'
    && rootPackage.scripts['mobile:store-compliance'] === 'node scripts/mobile-store-compliance-gate.js'
    && rootPackage.scripts['mobile:store-listing'] === 'node scripts/mobile-store-listing-gate.js'
    && rootPackage.scripts['mobile:assets:generate'] === 'node scripts/mobile-generate-assets.js'
    && rootPackage.scripts['mobile:store-assets'] === 'node scripts/mobile-store-assets-gate.js'
    && rootPackage.scripts['mobile:store-submission-package'] === 'node scripts/mobile-store-submission-package.js'
    && rootPackage.scripts['mobile:store-submission-package:save'] === 'node scripts/mobile-store-submission-package.js --out .codex-build-cache/mobile-store-submission-package.json --google-play-out .codex-build-cache/mobile-store-submission-google-play.txt --app-store-out .codex-build-cache/mobile-store-submission-app-store.txt'
    && rootPackage.scripts['mobile:launch-sla'] === 'node scripts/mobile-launch-sla-report.js'
    && rootPackage.scripts['mobile:launch-sla:save'] === 'node scripts/mobile-launch-sla-report.js --out .codex-build-cache/mobile-launch-sla-report.json'
    && rootPackage.scripts['mobile:release-audit'] === 'node scripts/mobile-release-audit.js'
    && rootPackage.scripts['mobile:release-audit:save'] === 'node scripts/mobile-release-audit.js --out .codex-build-cache/mobile-release-audit.json'
    && rootPackage.scripts['mobile:release-kit'] === 'node scripts/mobile-release-kit.js'
    && rootPackage.scripts['mobile:release-kit:save'] === 'node scripts/mobile-release-kit.js --out .codex-build-cache/mobile-release-kit.json'
    && rootPackage.scripts['mobile:github-setup-plan'] === 'node scripts/mobile-github-setup-plan.js'
    && rootPackage.scripts['mobile:github-setup-plan:save'] === 'node scripts/mobile-github-setup-plan.js --out .codex-build-cache/mobile-github-setup-plan.json --ps1 .codex-build-cache/mobile-github-setup.ps1'
    && rootPackage.scripts['mobile:release-dry-run'] === 'node scripts/mobile-release-dry-run.js'
    && rootPackage.scripts['mobile:release-dry-run:save'] === 'node scripts/mobile-release-dry-run.js --out .codex-build-cache/mobile-release-dry-run.json'
    && rootPackage.scripts['mobile:release-dispatch-plan'] === 'node scripts/mobile-release-dispatch-plan.js'
    && rootPackage.scripts['mobile:release-dispatch-plan:save'] === 'node scripts/mobile-release-dispatch-plan.js --out .codex-build-cache/mobile-release-dispatch-plan.json'
    && rootPackage.scripts['mobile:release-status'] === 'node scripts/mobile-release-status.js'
    && rootPackage.scripts['mobile:release-status:save'] === 'node scripts/mobile-release-status.js --out .codex-build-cache/mobile-release-status.json'
    && rootPackage.scripts['mobile:release-secret-scan'] === 'node scripts/mobile-release-secret-scan.js'
    && rootPackage.scripts['mobile:release-secret-scan:save'] === 'node scripts/mobile-release-secret-scan.js --out .codex-build-cache/mobile-release-secret-scan.json'
    && rootPackage.scripts['mobile:public-release-gate'] === 'node scripts/mobile-public-release-gate.js'
    && rootPackage.scripts['mobile:public-release-gate:android'] === 'node scripts/mobile-public-release-gate.js --platform android'
    && rootPackage.scripts['mobile:public-release-gate:android:save'] === 'node scripts/mobile-public-release-gate.js --platform android --out .codex-build-cache/mobile-public-release-gate-android.json --report-only'
    && rootPackage.scripts['mobile:public-release-gate:save'] === 'node scripts/mobile-public-release-gate.js --out .codex-build-cache/mobile-public-release-gate.json --report-only'
    && rootPackage.scripts['mobile:release-gate:cloud'] === 'node scripts/mobile-cloud-release-gate.js'
    && rootPackage.scripts['mobile:api-deploy-gate'] === 'node scripts/mobile-api-deploy-gate.js'
    && rootPackage.scripts['mobile:api:docker:build'] === 'docker build -f apps/api/Dockerfile -t leword-mobile-api:latest .'
    && rootPackage.scripts['mobile:ci-secrets-gate'] === 'node scripts/mobile-ci-secrets-gate.js'
    && rootPackage.scripts['mobile:deploy-readiness'] === 'node scripts/mobile-deploy-readiness.js'
    && rootPackage.scripts['mobile:deploy-readiness:android'] === 'node scripts/mobile-deploy-readiness.js --platform android'
    && rootPackage.scripts['mobile:deploy-readiness:ios'] === 'node scripts/mobile-deploy-readiness.js --platform ios'
    && rootPackage.scripts['mobile:submit-config:materialize'] === 'node scripts/mobile-materialize-submit-config.js'
    && rootPackage.scripts['mobile:submit-gate:android'] === 'node scripts/mobile-submit-gate.js --platform android'
    && rootPackage.scripts['mobile:submit-gate:android:public'] === 'node scripts/mobile-submit-gate.js --platform android --profile public'
    && rootPackage.scripts['mobile:submit-gate:ios'] === 'node scripts/mobile-submit-gate.js --platform ios'
    && /mobile:api-runtime-gate/.test(rootPackage.scripts['mobile:preflight:production'])
    && /mobile:store-listing/.test(rootPackage.scripts['mobile:preflight:production'])
    && /mobile:store-assets/.test(rootPackage.scripts['mobile:preflight:production'])
    && /mobile:release-gate:cloud/.test(rootPackage.scripts['mobile:build:android:internal'])
    && /eas-cli build --platform android --profile production/.test(rootPackage.scripts['mobile:build:android:production'])
    && /eas-cli build --platform ios --profile production/.test(rootPackage.scripts['mobile:build:ios:testflight'])
    && /eas-cli submit --platform android --profile production --latest/.test(rootPackage.scripts['mobile:submit:android:internal'])
    && /eas-cli submit --platform android --profile public --latest/.test(rootPackage.scripts['mobile:submit:android:public'])
    && /eas-cli submit --platform ios --profile production --latest/.test(rootPackage.scripts['mobile:submit:ios:testflight'])
    && /mobile:submit:android:internal/.test(rootPackage.scripts['mobile:deploy:android:internal'])
    && /mobile:submit:ios:testflight/.test(rootPackage.scripts['mobile:deploy:ios:testflight'])
    && /mobile:deploy-readiness:android/.test(rootPackage.scripts['mobile:deploy:android:internal'])
    && /mobile:deploy-readiness:ios/.test(rootPackage.scripts['mobile:deploy:ios:testflight'])
    && rootPackage.scripts['api:start:prod'] === 'npm --prefix apps/api run start:prod'
    && rootPackage.scripts['api:typecheck'] === 'npm --prefix apps/api run typecheck'
    && /apps\/api run typecheck/.test(rootPackage.scripts['verify:mobile'])
    && /mobile-api-deploy-gate/.test(rootPackage.scripts['verify:mobile'])
    && /mobile-ui-release-gate/.test(rootPackage.scripts['verify:mobile'])
    && /mobile-store-listing-gate/.test(rootPackage.scripts['verify:mobile'])
    && /mobile-store-assets-gate/.test(rootPackage.scripts['verify:mobile'])
    && /mobile-store-submission-package/.test(rootPackage.scripts['verify:mobile'])
    && /mobile-launch-sla-report/.test(rootPackage.scripts['verify:mobile'])
    && /mobile-release-status/.test(rootPackage.scripts['verify:mobile'])
    && /mobile-release-secret-scan/.test(rootPackage.scripts['verify:mobile'])
    && /eas-cli whoami/.test(rootPackage.scripts['mobile:eas:whoami'])
    && /eas-cli build --platform android --profile internal/.test(rootPackage.scripts['mobile:build:android:internal']));
assert('production mobile release gate requires production API URL',
  /LEWORD_MOBILE_RELEASE_ENV/.test(productionReleaseGate)
    && /mobile-release-gate/.test(productionReleaseGate));
assert('production mobile release gate rejects placeholder API domains',
  /placeholder domain/.test(mobileReleaseGate)
    && /\.example/.test(mobileReleaseGate)
    && /\.invalid/.test(mobileReleaseGate)
    && /\.test/.test(mobileReleaseGate));
assert('cloud mobile release gate requires EAS auth and project id',
  /EXPO_TOKEN/.test(cloudReleaseGate)
    && /eas-cli/.test(cloudReleaseGate)
    && /EXPO_PUBLIC_EAS_PROJECT_ID/.test(cloudReleaseGate)
    && /metadata\.json/.test(cloudReleaseGate));
assert('mobile submit gate requires store credentials before submit',
  /validateAndroidSubmitProfile/.test(submitGate)
    && /serviceAccountKeyPath/.test(submitGate)
    && /parseProfile/.test(submitGate)
    && /profileName/.test(submitGate)
    && /expectedTrack/.test(submitGate)
    && /Android service account key file exists/.test(submitGate)
    && /validateIosSubmitProfile/.test(submitGate)
    && /EXPO_APPLE_APP_SPECIFIC_PASSWORD/.test(submitGate)
    && /ascApiKeyPath/.test(submitGate));
assert('mobile deploy readiness combines final production blockers',
  /collectMobileDeployReadiness/.test(deployReadiness)
    && /normalizePlatform/.test(deployReadiness)
    && /parsePlatformArg/.test(deployReadiness)
    && /parseSubmitArg/.test(deployReadiness)
    && /submitToStores/.test(deployReadiness)
    && /Production API URL is HTTPS/.test(deployReadiness)
    && /Production API deployment package is ready/.test(deployReadiness)
    && /Store visual assets are ready/.test(deployReadiness)
    && /EAS auth is available/.test(deployReadiness)
    && /Production API worker is ready/.test(deployReadiness)
    && /Android submit credentials are ready/.test(deployReadiness)
    && /iOS submit credentials are ready/.test(deployReadiness));
assert('mobile API deploy gate locks production worker packaging',
  /collectMobileApiDeployGate/.test(apiDeployGate)
    && /API Dockerfile installs system Chromium/.test(apiDeployGate)
    && /LEWORD_CHROME_PATH=.*usr.*bin.*chromium/.test(apiDeployGate)
    && /Mobile API docker build script is registered/.test(apiDeployGate)
    && /Production compose pulls GHCR API image/.test(apiDeployGate)
    && /Production compose uses persistent cache volume/.test(apiDeployGate)
    && /CI workflow publishes API image to GHCR/.test(apiDeployGate)
    && /Production API env example covers required runtime keys/.test(apiDeployGate));
assert('mobile CI secrets gate checks target-specific release inputs',
  /collectMobileCiSecretsGate/.test(ciSecretsGate)
    && /verify-only/.test(ciSecretsGate)
    && /android-internal/.test(ciSecretsGate)
    && /android-public/.test(ciSecretsGate)
    && /ios-testflight/.test(ciSecretsGate)
    && /GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64/.test(ciSecretsGate)
    && /LEWORD_MOBILE_REVIEWER_TOKEN_READY/.test(ciSecretsGate)
    && /EXPO_APPLE_APP_SPECIFIC_PASSWORD/.test(ciSecretsGate)
    && /EXPO_ASC_API_KEY_P8_B64/.test(ciSecretsGate)
    && /hasAppleSubmitAuth/.test(ciSecretsGate));
assert('mobile submit config materializer supports CI secrets',
  /materializeMobileSubmitConfig/.test(materializeSubmitConfig)
    && /GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64/.test(materializeSubmitConfig)
    && /EXPO_ASC_API_KEY_P8_B64/.test(materializeSubmitConfig)
    && /EXPO_ASC_APP_ID/.test(materializeSubmitConfig)
    && /EXPO_APPLE_TEAM_ID/.test(materializeSubmitConfig)
    && /profileNames/.test(materializeSubmitConfig)
    && /public/.test(materializeSubmitConfig));
assert('mobile API runtime gate requires PC-grade production worker config',
  /getMobileRuntimeReadiness/.test(apiRuntimeGate)
    && /Naver Open API credentials configured/.test(runtimeReadiness)
    && /Naver SearchAd credentials configured/.test(runtimeReadiness)
    && /LEWORD_MOBILE_ENTITLEMENT_URL/.test(runtimeReadiness)
    && /LEWORD_MOBILE_PREWARM_INTERVAL_MINUTES/.test(runtimeReadiness)
    && /LEWORD_MOBILE_PUSH_PROVIDER/.test(runtimeReadiness)
    && /LEWORD_MOBILE_CACHE_FILE/.test(runtimeReadiness)
    && /Mobile API request guardrails configured/.test(runtimeReadiness));
assert('mobile deployed API smoke test checks mobile client runtime flow',
  /runMobileApiSmokeTest/.test(apiSmokeTest)
    && /\/health/.test(apiSmokeTest)
    && /\/v1\/notifications/.test(apiSmokeTest)
    && /\/v1\/keywords\/analyze/.test(apiSmokeTest)
    && /job-measured/.test(apiSmokeTest)
    && /LEWORD_MOBILE_SMOKE_RUN_JOB/.test(apiSmokeTest));
assert('mobile deployed API performance smoke checks SLA timings',
  /runMobileApiPerformanceSmoke/.test(apiPerformanceSmoke)
    && /MOBILE_PC_PARITY_SLA/.test(apiPerformanceSmoke)
    && /health responds within SLA/.test(apiPerformanceSmoke)
    && /keyword job accepted within SLA/.test(apiPerformanceSmoke)
    && /keyword job first progress within SLA/.test(apiPerformanceSmoke)
    && /keyword job returns measured PC metrics/.test(apiPerformanceSmoke)
    && /mobile-api-performance-smoke\.json/.test(rootPackage.scripts['mobile:api-performance-smoke:save']));
assert('mobile UI release gate checks touch-first release quality',
  /collectMobileUiReleaseGate/.test(uiReleaseGate)
    && /Mobile shows immediate loading feedback/.test(uiReleaseGate)
    && /Mobile exposes every core LEWORD hunter mode/.test(uiReleaseGate)
    && /Mobile result cards show PC-grade measured metrics/.test(uiReleaseGate)
    && /Mobile source does not import browser automation/.test(uiReleaseGate)
    && /mobile-ui-release-gate\.json/.test(rootPackage.scripts['mobile:ui-release-gate:save']));
assert('mobile store compliance gate covers privacy and data safety',
  /mobile-store-compliance\.json/.test(storeComplianceGate)
    && /EXPO_PUBLIC_LEWORD_PRIVACY_URL/.test(storeComplianceGate)
    && /POST_NOTIFICATIONS/.test(storeComplianceGate)
    && /Expo push token/.test(storeCompliance)
    && /googlePlayDataSafety/.test(storeCompliance)
    && /appleAppPrivacy/.test(storeCompliance));
assert('mobile store listing gate covers Apple and Google metadata',
  /mobile-store-listing\.json/.test(storeListingGate)
    && /Google Play app name is within 30 characters/.test(storeListingGate)
    && /Google Play short description is within 80 characters/.test(storeListingGate)
    && /Apple keywords are within 100 bytes/.test(storeListingGate)
    && /Store listing avoids guarantee claims/.test(storeListingGate)
    && /Reviewer instructions are actionable/.test(storeListingGate)
    && /support\.google\.com/.test(storeListing)
    && /developer\.apple\.com/.test(storeListing)
    && /LEWORD API workers/.test(storeListing)
    && /노출을 약속하는 앱이 아닙니다/.test(storeListing));
assert('mobile store assets gate covers app and store images',
  /mobile-store-assets\.json/.test(storeAssetsGate)
    && /Expo app icon PNG is 1024 square/.test(storeAssetsGate)
    && /Android adaptive icon foreground PNG is 1024 square/.test(storeAssetsGate)
    && /Google Play feature graphic is 1024x500/.test(storeAssetsGate)
    && /Store screenshots are 6\.7 inch portrait PNGs/.test(storeAssetsGate)
    && /iOS first release is phone-only/.test(storeAssetsGate)
    && /mobile-generate-assets/.test(mobileGenerateAssets)
    && /apps\/mobile\/assets\/icon\.png/.test(storeAssets)
    && /apps\/mobile\/assets\/store\/feature-graphic\.png/.test(storeAssets)
    && /1290/.test(storeAssets)
    && /2796/.test(storeAssets)
    && /deviceCapturedScreenshotsRequiredBeforePublicRelease/.test(storeAssets)
    && /reviewerTokenEvidencePath/.test(storeAssets)
    && /developer\.apple\.com/.test(storeAssets)
    && /support\.google\.com/.test(storeAssets));
assert('mobile store submission package renders console-ready metadata files',
  /collectMobileStoreSubmissionPackage/.test(storeSubmissionPackage)
    && /renderGooglePlayText/.test(storeSubmissionPackage)
    && /renderAppStoreText/.test(storeSubmissionPackage)
    && /mobile-store-submission-package\.json/.test(rootPackage.scripts['mobile:store-submission-package:save'])
    && /mobile-store-submission-google-play\.txt/.test(rootPackage.scripts['mobile:store-submission-package:save'])
    && /mobile-store-submission-app-store\.txt/.test(rootPackage.scripts['mobile:store-submission-package:save'])
    && /deviceCapturedScreenshotsRequiredBeforePublicRelease/.test(storeSubmissionPackage)
    && /Reviewer notes are included/.test(storeSubmissionPackage));
assert('mobile launch SLA report proves server-side PC parity contract',
  /collectMobileLaunchSlaReport/.test(launchSlaReport)
    && /MOBILE_PC_PARITY_SLA/.test(launchSlaReport)
    && /isServerOnlyMobileProduct/.test(launchSlaReport)
    && /Mobile endpoints are server-only/.test(launchSlaReport)
    && /Mobile app contains no browser automation imports/.test(launchSlaReport)
    && /PC engine executor reuses desktop-grade engines/.test(launchSlaReport)
    && /Mobile result schema preserves measured PC metrics/.test(launchSlaReport)
    && /Quality floors match user-requested mobile parity/.test(launchSlaReport)
    && /Production API performance smoke evidence exists/.test(launchSlaReport)
    && /performanceSmokeOk/.test(launchSlaReport)
    && /releaseReady/.test(launchSlaReport)
    && /mobile-launch-sla-report\.json/.test(rootPackage.scripts['mobile:launch-sla:save']));
assert('mobile release audit records traceable bundle and gate evidence',
  /collectReleaseAudit/.test(releaseAudit)
    && /writeReleaseAudit/.test(releaseAudit)
    && /--out/.test(releaseAudit)
    && /bundleSha256/.test(releaseAudit)
    && /metadataSha256/.test(releaseAudit)
    && /androidVersionCode/.test(releaseAudit)
    && /externalBlockers/.test(releaseAudit)
    && /mobile-readiness-report/.test(releaseAudit)
    && /androidSubmitTrack/.test(releaseAudit)
    && /androidPublicSubmitTrack/.test(releaseAudit)
    && /apiDeployGate/.test(releaseAudit)
    && /storeListingGate/.test(releaseAudit)
    && /storeListingReady/.test(releaseAudit)
    && /storeAssetsGate/.test(releaseAudit)
    && /storeAssetsReady/.test(releaseAudit)
    && /uiReleaseGate/.test(releaseAudit)
    && /uiReady/.test(releaseAudit)
    && /storeSubmissionPackage/.test(releaseAudit)
    && /launchSla/.test(releaseAudit)
    && /apiDockerBuild/.test(releaseAudit)
    && /apiPerformanceSmoke/.test(releaseAudit)
    && /apiDeployReady/.test(releaseAudit)
    && /releaseKit/.test(releaseAudit)
    && /releaseDryRun/.test(releaseAudit)
    && /releaseDispatchPlan/.test(releaseAudit)
    && /releaseStatus/.test(releaseAudit)
    && /releaseSecretScan/.test(releaseAudit)
    && /mobile-release-secret-scan\.json/.test(releaseAudit)
    && /publicReleaseGate/.test(releaseAudit)
    && /ciSecretsGate/.test(releaseAudit)
    && /submitConfigMaterialize/.test(releaseAudit)
    && /submitReadiness/.test(releaseAudit)
    && /androidSubmitReady/.test(releaseAudit)
    && /androidPublicSubmitReady/.test(releaseAudit)
    && /iosSubmitReady/.test(releaseAudit)
    && /iosPublicSubmitReady/.test(releaseAudit)
    && /iosDeploy/.test(releaseAudit));
assert('mobile release kit summarizes target-specific deploy readiness',
  /collectMobileReleaseKit/.test(releaseKit)
    && /collectMobileCiSecretsGate/.test(releaseKit)
    && /collectMobileDeployReadiness/.test(releaseKit)
    && /requiredInputsForTarget/.test(releaseKit)
    && /submitToStores/.test(releaseKit)
    && /uiReady/.test(releaseKit)
    && /mobile-release-kit\.json/.test(rootPackage.scripts['mobile:release-kit:save'])
    && /android-internal/.test(releaseKit)
    && /android-public/.test(releaseKit)
    && /ios-testflight/.test(releaseKit)
    && /full-release/.test(releaseKit)
    && /EXPO_ASC_API_KEY_P8_B64/.test(releaseKit));
assert('mobile GitHub setup plan emits safe placeholder gh commands',
  /collectMobileGithubSetupPlan/.test(githubSetupPlan)
    && /renderPowerShell/.test(githubSetupPlan)
    && /gh variable set/.test(githubSetupPlan)
    && /gh secret set/.test(githubSetupPlan)
    && /safeToCommit/.test(githubSetupPlan)
    && /EXPO_ASC_API_KEY_P8_B64/.test(githubSetupPlan)
    && /GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64/.test(githubSetupPlan));
assert('mobile release dry run combines final release evidence without submitting',
  /collectMobileReleaseDryRun/.test(releaseDryRun)
    && /collectReleaseAudit/.test(releaseDryRun)
    && /collectMobileReleaseKit/.test(releaseDryRun)
    && /collectMobileGithubSetupPlan/.test(releaseDryRun)
    && /mobile-release-dry-run\.json/.test(rootPackage.scripts['mobile:release-dry-run:save'])
    && /--strict/.test(releaseDryRun));
assert('mobile release dispatch plan gates GitHub Actions dispatch behind green dry-run',
  /collectMobileReleaseDispatchPlan/.test(releaseDispatchPlan)
    && /collectMobileReleaseDryRun/.test(releaseDispatchPlan)
    && /readyToDispatch/.test(releaseDispatchPlan)
    && /gh workflow run/.test(releaseDispatchPlan)
    && /submit_to_stores/.test(releaseDispatchPlan)
    && /run_api_smoke/.test(releaseDispatchPlan)
    && /executeMobileReleaseDispatch/.test(releaseDispatchPlan)
    && /mobile-release-dispatch-plan\.json/.test(rootPackage.scripts['mobile:release-dispatch-plan:save']));
assert('mobile release status summarizes local code readiness and publish targets',
  /collectMobileReleaseStatus/.test(releaseStatus)
    && /TARGETS/.test(releaseStatus)
    && /android-internal-build/.test(releaseStatus)
    && /android-internal-submit/.test(releaseStatus)
    && /android-public-submit/.test(releaseStatus)
    && /full-release/.test(releaseStatus)
    && /uiReady/.test(releaseStatus)
    && /releaseReady/.test(releaseStatus)
    && /publicRelease/.test(releaseStatus)
    && /androidPublicRelease/.test(releaseStatus)
    && /androidPublicStoreReady/.test(releaseStatus)
    && /releaseSecretScan/.test(releaseStatus)
    && /mobile-release-secret-scan\.json/.test(releaseStatus)
    && /mobile-public-release-gate-android\.json/.test(releaseStatus)
    && /mobile-release-status\.json/.test(rootPackage.scripts['mobile:release-status:save']));
assert('mobile release secret scan blocks concrete credentials from release evidence',
  /collectMobileReleaseSecretScan/.test(releaseSecretScan)
    && /GitHub token/.test(releaseSecretScan)
    && /Google service account private_key/.test(releaseSecretScan)
    && /gh secret set/.test(releaseSecretScan)
    && /DEFAULT_SCAN_PATHS/.test(releaseSecretScan)
    && /mobile-release-secret-scan\.json/.test(rootPackage.scripts['mobile:release-secret-scan:save']));
assert('mobile public release gate separates public store release from internal rollout',
  /collectMobilePublicReleaseGate/.test(publicReleaseGate)
    && /hasReadableKoreanStoreCopy/.test(publicReleaseGate)
    && /hasReleaseEvidenceReference/.test(publicReleaseGate)
    && /isLocalPathInsideRoot/.test(publicReleaseGate)
    && /Device-captured public screenshots are ready/.test(publicReleaseGate)
    && /existing local evidence path or production HTTPS evidence URL/.test(publicReleaseGate)
    && /Google Play public track is configured/.test(publicReleaseGate)
    && /androidPublicSubmitTrack/.test(publicReleaseGate)
    && /androidPublicSubmitReady/.test(publicReleaseGate)
    && /getDefaultPublicGateArtifact/.test(publicReleaseGate)
    && /androidPublicReleaseGate/.test(publicReleaseGate)
    && /allPublicReleaseGate/.test(publicReleaseGate)
    && /normalizePlatform/.test(publicReleaseGate)
    && /needsAndroid/.test(publicReleaseGate)
    && /needsIos/.test(publicReleaseGate)
    && /Reviewer demo token is ready/.test(publicReleaseGate)
    && /reviewerTokenEvidencePath/.test(publicReleaseGate)
    && /mobile-public-release-gate\.js --platform android/.test(rootPackage.scripts['mobile:public-release-gate:android'])
    && /mobile-public-release-gate\.json/.test(rootPackage.scripts['mobile:public-release-gate:save']));
assert('mobile production env examples pin PC-grade runtime requirements',
  /EXPO_PUBLIC_LEWORD_API_URL=https:\/\/api\.leword\.app/.test(mobileEnvExample)
    && /EXPO_PUBLIC_EAS_PROJECT_ID/.test(mobileEnvExample)
    && /EXPO_PUBLIC_LEWORD_PRIVACY_URL=https:\/\/leword\.app\/privacy/.test(mobileEnvExample)
    && /GOOGLE_APPLICATION_CREDENTIALS=apps\/mobile\/credentials\/google-play-service-account\.json/.test(mobileEnvExample)
    && /EXPO_APPLE_APP_SPECIFIC_PASSWORD/.test(mobileEnvExample)
    && /EXPO_ASC_API_KEY_P8_B64/.test(mobileEnvExample)
    && /NAVER_CLIENT_ID/.test(apiEnvExample)
    && /NAVER_SEARCH_AD_ACCESS_LICENSE/.test(apiEnvExample)
    && /LEWORD_MOBILE_ENTITLEMENT_URL=https:\/\/api\.leword\.app\/mobile\/entitlement/.test(apiEnvExample)
    && /LEWORD_MOBILE_PREWARM_INTERVAL_MINUTES=15/.test(apiEnvExample)
    && /LEWORD_MOBILE_PUSH_PROVIDER=expo/.test(apiEnvExample)
    && /LEWORD_MOBILE_MAX_BODY_BYTES=65536/.test(apiEnvExample)
    && /LEWORD_MOBILE_RATE_LIMIT_PER_MINUTE=120/.test(apiEnvExample));
assert('mobile release runbook documents end-to-end release gates',
  /mobile:api-deploy-gate/.test(mobileReleaseRunbook)
    && /mobile:api:docker:build/.test(mobileReleaseRunbook)
    && /mobile:api-runtime-gate/.test(mobileReleaseRunbook)
    && /mobile:api-smoke/.test(mobileReleaseRunbook)
    && /mobile:api-performance-smoke:save/.test(mobileReleaseRunbook)
    && /mobile:ui-release-gate:save/.test(mobileReleaseRunbook)
    && /mobile:release-gate:cloud/.test(mobileReleaseRunbook)
    && /mobile:store-listing/.test(mobileReleaseRunbook)
    && /mobile:store-assets/.test(mobileReleaseRunbook)
    && /mobile:store-submission-package:save/.test(mobileReleaseRunbook)
    && /mobile:launch-sla:save/.test(mobileReleaseRunbook)
    && /mobile:assets:generate/.test(mobileReleaseRunbook)
    && /mobile:release-kit:save/.test(mobileReleaseRunbook)
    && /mobile:github-setup-plan:save/.test(mobileReleaseRunbook)
    && /mobile:release-dry-run:save/.test(mobileReleaseRunbook)
    && /mobile:release-dispatch-plan:save/.test(mobileReleaseRunbook)
    && /mobile:release-status:save/.test(mobileReleaseRunbook)
    && /mobile:release-secret-scan:save/.test(mobileReleaseRunbook)
    && /mobile:public-release-gate:save/.test(mobileReleaseRunbook)
    && /mobile:public-release-gate:android/.test(mobileReleaseRunbook)
    && /mobile:public-release-gate:android:save/.test(mobileReleaseRunbook)
    && /mobile:build:android:internal/.test(mobileReleaseRunbook)
    && /mobile:build:android:production/.test(mobileReleaseRunbook)
    && /mobile:submit:android:internal/.test(mobileReleaseRunbook)
    && /mobile:submit-gate:android:public/.test(mobileReleaseRunbook)
    && /mobile:submit:android:public/.test(mobileReleaseRunbook)
    && /target=android-public/.test(mobileReleaseRunbook)
    && /submit\.public\.android/.test(mobileReleaseRunbook)
    && /mobile:build:ios:testflight/.test(mobileReleaseRunbook)
    && /mobile:submit:ios:testflight/.test(mobileReleaseRunbook)
    && /mobile:deploy-readiness/.test(mobileReleaseRunbook)
    && /mobile-store-compliance\.json/.test(mobileReleaseRunbook)
    && /mobile-store-assets\.json/.test(mobileReleaseRunbook)
    && /mobile-store-submission-google-play\.txt/.test(mobileReleaseRunbook)
    && /mobile-store-submission-app-store\.txt/.test(mobileReleaseRunbook)
    && /mobile-launch-sla-report\.json/.test(mobileReleaseRunbook)
    && /mobile-ui-release-gate\.json/.test(mobileReleaseRunbook)
    && /mobile-release-status\.json/.test(mobileReleaseRunbook)
    && /mobile-release-secret-scan\.json/.test(mobileReleaseRunbook)
    && /mobile-public-release-gate\.json/.test(mobileReleaseRunbook)
    && /mobile-api-performance-smoke\.json/.test(mobileReleaseRunbook)
    && /\.codex-build-cache\/mobile-release-audit\.json/.test(mobileReleaseRunbook));

const readinessReport = read('scripts/mobile-readiness-report.js');
assert('mobile readiness report separates code checks from external native blockers',
  /Mobile Node >= 22\.13 available/.test(readinessReport)
    && /Mobile API deploy gate exists/.test(readinessReport)
    && /Mobile API Dockerfile exists/.test(readinessReport)
    && /Mobile CI secrets gate script exists/.test(readinessReport)
    && /Docker CLI available for API image build/.test(readinessReport)
    && /mobile:api:docker:build/.test(readinessReport)
    && /Android SDK env exists/.test(readinessReport)
    && /JDK 17\+ available/.test(readinessReport)
    && /mobile:release-gate:cloud/.test(readinessReport)
    && /mobile:api-smoke/.test(readinessReport)
    && /mobile:api-performance-smoke/.test(readinessReport)
    && /mobile:api-performance-smoke:save/.test(readinessReport)
    && /mobile:ui-release-gate/.test(readinessReport)
    && /mobile:ui-release-gate:save/.test(readinessReport)
    && /mobile:store-compliance/.test(readinessReport)
    && /mobile:store-listing/.test(readinessReport)
    && /mobile:store-assets/.test(readinessReport)
    && /mobile:store-submission-package/.test(readinessReport)
    && /mobile:store-submission-package:save/.test(readinessReport)
    && /mobile:launch-sla/.test(readinessReport)
    && /mobile:launch-sla:save/.test(readinessReport)
    && /mobile:assets:generate/.test(readinessReport)
    && /mobile:release-audit:save/.test(readinessReport)
    && /mobile:release-kit:save/.test(readinessReport)
    && /mobile:release-dry-run:save/.test(readinessReport)
    && /mobile:release-dispatch-plan:save/.test(readinessReport)
    && /mobile:release-status:save/.test(readinessReport)
    && /mobile:release-secret-scan:save/.test(readinessReport)
    && /mobile:public-release-gate:save/.test(readinessReport)
    && /Mobile release kit script exists/.test(readinessReport)
    && /Mobile release dry-run script exists/.test(readinessReport)
    && /Mobile release dispatch plan script exists/.test(readinessReport)
    && /Mobile release status script exists/.test(readinessReport)
    && /Mobile release secret scan script exists/.test(readinessReport)
    && /Mobile public release gate script exists/.test(readinessReport)
    && /Mobile store submission package script exists/.test(readinessReport)
    && /Mobile launch SLA report script exists/.test(readinessReport)
    && /Mobile API performance smoke script exists/.test(readinessReport)
    && /Mobile UI release gate exists/.test(readinessReport)
    && /Mobile submit gate script exists/.test(readinessReport)
    && /Android submit profile exists/.test(readinessReport)
    && /Production API env example exists/.test(readinessReport)
    && /Mobile store listing manifest exists/.test(readinessReport)
    && /Mobile store assets manifest exists/.test(readinessReport)
    && /Mobile icon asset exists/.test(readinessReport)
    && /Mobile store screenshots exist/.test(readinessReport)
    && /Mobile release runbook exists/.test(readinessReport)
    && /Mobile release workflow exists/.test(readinessReport)
    && /severity = 'required'/.test(readinessReport)
    && /'external'/.test(readinessReport));

const apiServer = read('apps/api/src/server.ts');
const liveGoldenRadar = read('src/mobile/live-golden-radar.ts');
const naverDatalabApi = read('src/utils/naver-datalab-api.ts');
const naverAutocomplete = read('src/utils/naver-autocomplete.ts');
const puppeteerPool = read('src/utils/puppeteer-pool.ts');
const mobileEntitlements = read('src/mobile/entitlements.ts');
const notificationInbox = read('src/mobile/notification-inbox.ts');
const pushNotifications = read('src/mobile/push-notifications.ts');
assert('api package exposes production start command',
  apiPackage.scripts['start:prod'] === 'node -r ts-node/register/transpile-only src/server.ts'
    && apiPackage.scripts['worker:live-golden'] === 'node -r ts-node/register/transpile-only src/live-golden-worker.ts'
    && apiPackage.scripts['deploy:gate'] === 'node ../../scripts/mobile-api-deploy-gate.js');
assert('api server keeps PRO traffic supplements SSS-only and measured',
  /function isProTrafficMeasuredBoardCandidate/.test(apiServer)
    && /item\.grade !== 'SSS'/.test(apiServer)
    && /endpoint\.product === 'pro-traffic-hunter' && !isProTrafficMeasuredBoardCandidate/.test(apiServer)
    && /product === 'pro-traffic-hunter'\) return isProTrafficMeasuredBoardCandidate/.test(apiServer));
assert('live golden board display is SSS-first with trusted publishable fallback fill',
  /function selectLiveBoardItems[\s\S]*const measuredSssReady = sorted[\s\S]*isMeasuredSssBoardCandidate/.test(liveGoldenRadar)
    && /if \(item\.grade !== 'SSS'\) return false;/.test(liveGoldenRadar)
    && /return appendMeasuredPublishableFallbackItems\(sssSelected, sorted, target, now\)/.test(liveGoldenRadar)
    && /function selectMeasuredPublishableFallbackItems[\s\S]*hasTrustedSearchVolumeMeasurement\(item\)[\s\S]*hasTrustedDocumentCountMeasurement\(item\)/.test(liveGoldenRadar)
    && !/appendMeasuredExactDisplayFallbackItems/.test(liveGoldenRadar),
  'LIVE board display must keep SSS first but fill paid boards only with trusted measured publishable rows');
assert('live golden heavy discovery cannot outlive a cycle or spend an unbounded SearchAd budget',
  /const LIVE_SEARCHAD_MEASUREMENT_BUDGET_PER_RUN = 40/.test(liveGoldenRadar)
    && /const LIVE_PROBE_QUEUE_MEASUREMENT_BUDGET_PER_RUN = 12/.test(liveGoldenRadar)
    && /const LIVE_HEAVY_DIRECT_MIN_REMAINING_BUDGET = 12/.test(liveGoldenRadar)
    && /const directMaxCandidates = Math\.min\(\s*LIVE_SEARCHAD_MEASUREMENT_BUDGET_PER_RUN,\s*directCandidateBudget/.test(liveGoldenRadar)
    && /searchAdMeasurementBudgetRemaining - batch\.length/.test(liveGoldenRadar)
    && /const direct = await this\.discover\(/.test(liveGoldenRadar)
    && !/withTimeout\(this\.discover\(/.test(liveGoldenRadar)
    && !/shouldDeferHeavyDirectToProbeQueue/.test(liveGoldenRadar)
    && /includeSearchAdSuggestions:\s*false/.test(liveGoldenRadar)
    && /includeCrossCategory:\s*false/.test(liveGoldenRadar)
    && /const backfillCategoryId = categoryId/.test(liveGoldenRadar)
    && /const shouldRunExpansionBackfill = this\.searchAdMeasurementBudgetRemaining > 0/.test(liveGoldenRadar)
    && /measuredProbeOnly: queuedProbeDirect\.attemptedCount > 0/.test(liveGoldenRadar)
    && /const queueCanaryLeftDirectBudget = queuedProbeAttemptedCount > 0\s*&& this\.searchAdMeasurementBudgetRemaining >= LIVE_HEAVY_DIRECT_MIN_REMAINING_BUDGET/.test(liveGoldenRadar)
    && /const shouldRunHeavyDirect = !expansionBackfillAttempted\s*&& \(queuedProbeAttemptedCount === 0 \|\| queueCanaryLeftDirectBudget\)/.test(liveGoldenRadar)
    && /!catchUpModeBeforeCache\s*&& queuedProbeAttemptedCount === 0\s*&& this\.searchAdMeasurementBudgetRemaining > 0/.test(liveGoldenRadar)
    && /const searchAdSuggestionRows = categoryId === 'all'/.test(liveGoldenRadar)
    && /curatedSeedsOnly: true,[\s\S]*maxSeedQueries: 4,[\s\S]*maxRows: measurementLimit/.test(liveGoldenRadar)
    && /searchAdMeasurementBudgetRemaining - suggestionRowsForRun\.length/.test(liveGoldenRadar)
    && /zero-yield cooldown active/.test(liveGoldenRadar)
    && /const LIVE_ZERO_YIELD_COOLDOWN_MS = 12 \* 60 \* 1000/.test(liveGoldenRadar)
    && /let completedCategoryScans = 0/.test(liveGoldenRadar)
    && /const attemptBudget = fillCategoryScans[\s\S]*Math\.min\([\s\S]*cycleBudget \+ LIVE_GOLDEN_CORE_CATEGORY_POLICIES\.length/.test(liveGoldenRadar)
    && /completedCategoryScans \+= categoryScansAdvanced/.test(liveGoldenRadar)
    && /const measurementLimit = Math\.min\(\s*LIVE_PROBE_QUEUE_MEASUREMENT_BUDGET_PER_RUN,\s*this\.backfillMeasurementLimit\(targetLimit\)/.test(liveGoldenRadar)
    && /const candidateLimit = measurementLimit;/.test(liveGoldenRadar)
    && !/withTimeout\(\s*this\.discoverBackfill\(/.test(liveGoldenRadar)
    && !/withTimeout\(\s*this\.discoverLiveIssueFallback\(/.test(liveGoldenRadar)
    && !/withTimeout\(\s*this\.searchAdSuggestionProvider\(/.test(liveGoldenRadar)
    && !/withTimeout\(\s*this\.measureLiveSearchVolumeSeparate\(/.test(liveGoldenRadar)
    && !/Promise\.race\(\[\s*getNaverSearchAdKeywordVolume/.test(naverDatalabApi)
    && /skipSearchAdRelated\?: boolean/.test(naverAutocomplete)
    && /skipSearchAdRelated:\s*true/.test(liveGoldenRadar),
  'quota-spending work must finish before runOnce releases its running lock');
assert('api server product defaults route LEWORD details to products page anchor',
  /href: '\/products#product-leword'/.test(apiServer)
    && !/\{ id: 'leword', name: 'LEWORD', status: 'published', href: '\/leword' \}/.test(apiServer));
assert('api Dockerfile packages PC-grade worker runtime',
  /FROM node:22-bookworm-slim/.test(apiDockerfile)
    && /apt-get install[\s\S]*chromium/.test(apiDockerfile)
    && /LEWORD_CHROME_PATH=\/usr\/bin\/chromium/.test(apiDockerfile)
    && /HEALTHCHECK/.test(apiDockerfile)
    && /npm", "--prefix", "apps\/api", "run", "start:prod"/.test(apiDockerfile));
assert('dockerignore keeps local state and mobile credentials out of API image context',
  /apps\/mobile\/credentials\/\*/.test(dockerignore)
    && /node_modules/.test(dockerignore)
    && /\.codex-build-cache/.test(dockerignore));
assert('api README documents container deployment',
  /mobile:api:docker:build/.test(apiReadme)
    && /LEWORD_CHROME_PATH=\/usr\/bin\/chromium/.test(apiReadme)
    && /docker-compose\.production\.yml/.test(apiReadme)
    && /mobile-api-image-reference/.test(apiReadme)
    && /mobile:api-runtime-gate/.test(apiReadme)
    && /mobile:api-smoke/.test(apiReadme));
assert('api production compose deploys CI-published GHCR image',
  (apiProductionCompose.match(/image:\s*\$\{LEWORD_MOBILE_API_IMAGE:\?[^}]+\}/g) || []).length === 3
    && !/leword-mobile-api:latest/.test(apiProductionCompose)
    && /env_file:/.test(apiProductionCompose)
    && /\.env\.production/.test(apiProductionCompose)
    && /LEWORD_MOBILE_CACHE_FILE:\s*\/data\/mobile-cache\.json/.test(apiProductionCompose)
    && /leword-mobile-cache:\/data/.test(apiProductionCompose)
    && /leword-live-golden-worker:/.test(apiProductionCompose)
    && /worker:live-golden/.test(apiProductionCompose)
    && /LEWORD_MOBILE_LIVE_GOLDEN_HEARTBEAT_FILE:\s*\/golden\/live-golden-worker-heartbeat\.json/.test(apiProductionCompose)
    && /LEWORD_MOBILE_LIVE_GOLDEN_HUMAN_REVIEW_FILE:\s*\/review\/live-golden-human-review\.json/.test(apiProductionCompose)
    && /healthcheck:[\s\S]*live-golden-worker-heartbeat\.json/.test(apiProductionCompose)
    && !/healthcheck:\s*\n\s*disable:\s*true/.test(apiProductionCompose)
    && /health/.test(apiProductionCompose));
assert('production API caps browser and job concurrency for stable 24h mining',
  /function positiveIntegerEnv/.test(apiServer)
    && /LEWORD_MOBILE_MAX_CONCURRENT_JOBS/.test(apiServer)
    && /maxConcurrentJobs:\s*positiveIntegerEnv\('LEWORD_MOBILE_MAX_CONCURRENT_JOBS', 1, 4\)/.test(apiServer)
    && /LEWORD_BROWSER_POOL_MAX_SIZE/.test(puppeteerPool)
    && /LEWORD_BROWSER_POOL_IDLE_MS/.test(puppeteerPool)
    && /LEWORD_MOBILE_MAX_CONCURRENT_JOBS:\s*\$\{LEWORD_MOBILE_MAX_CONCURRENT_JOBS:-1\}/.test(apiProductionCompose)
    && /LEWORD_BROWSER_POOL_MAX_SIZE:\s*\$\{LEWORD_BROWSER_POOL_MAX_SIZE:-1\}/.test(apiProductionCompose)
    && /LEWORD_BROWSER_POOL_IDLE_MS:\s*\$\{LEWORD_BROWSER_POOL_IDLE_MS:-5000\}/.test(apiProductionCompose),
  'server-side keyword jobs must not exhaust Chromium file handles under manual + prewarm load');
assert('mobile release workflow supports CI release path',
  /Mobile API and App Release/.test(mobileReleaseWorkflow)
    && /workflow_dispatch/.test(mobileReleaseWorkflow)
    && /verify-only/.test(mobileReleaseWorkflow)
    && /api-image/.test(mobileReleaseWorkflow)
    && /android-internal/.test(mobileReleaseWorkflow)
    && /ios-testflight/.test(mobileReleaseWorkflow)
    && /full-release/.test(mobileReleaseWorkflow)
    && /mobile:ci-secrets-gate/.test(mobileReleaseWorkflow)
    && /mobile:api-deploy-gate/.test(mobileReleaseWorkflow)
    && /mobile:store-listing/.test(mobileReleaseWorkflow)
    && /mobile:store-assets/.test(mobileReleaseWorkflow)
    && /mobile:store-submission-package:save/.test(mobileReleaseWorkflow)
    && /mobile:launch-sla:save/.test(mobileReleaseWorkflow)
    && /docs\/mobile-store-listing\.json/.test(mobileReleaseWorkflow)
    && /docs\/mobile-store-assets\.json/.test(mobileReleaseWorkflow)
    && /apps\/mobile\/assets\/icon\.png/.test(mobileReleaseWorkflow)
    && /apps\/mobile\/assets\/store\/screenshots\/\*\.png/.test(mobileReleaseWorkflow)
    && /docker build -f apps\/api\/Dockerfile/.test(mobileReleaseWorkflow)
    && /docker login \$\{\{ env\.REGISTRY \}\}/.test(mobileReleaseWorkflow)
    && /docker push "\$\{IMAGE_NAME\}:\$\{GITHUB_SHA\}"/.test(mobileReleaseWorkflow)
    && /mobile-api-image-reference/.test(mobileReleaseWorkflow)
    && /mobile:deploy-readiness:android/.test(mobileReleaseWorkflow)
    && /mobile:deploy-readiness:ios/.test(mobileReleaseWorkflow)
    && /mobile:submit-config:materialize/.test(mobileReleaseWorkflow)
    && /EXPO_ASC_API_KEY_P8_B64/.test(mobileReleaseWorkflow)
    && /mobile:release-kit:save/.test(mobileReleaseWorkflow)
    && /mobile-release-kit\.json/.test(mobileReleaseWorkflow)
    && /mobile:github-setup-plan:save/.test(mobileReleaseWorkflow)
    && /mobile:release-dry-run:save/.test(mobileReleaseWorkflow)
    && /mobile:release-dispatch-plan:save/.test(mobileReleaseWorkflow)
    && /mobile:release-status:save/.test(mobileReleaseWorkflow)
    && /mobile:release-secret-scan:save/.test(mobileReleaseWorkflow)
    && /Scan release evidence for secrets/.test(mobileReleaseWorkflow)
    && /mobile:public-release-gate:save/.test(mobileReleaseWorkflow)
    && /mobile:public-release-gate:android/.test(mobileReleaseWorkflow)
    && /mobile:public-release-gate:android:save/.test(mobileReleaseWorkflow)
    && /mobile:api-performance-smoke:save/.test(mobileReleaseWorkflow)
    && /mobile:ui-release-gate:save/.test(mobileReleaseWorkflow)
    && /mobile-release-dry-run\.json/.test(mobileReleaseWorkflow)
    && /mobile-release-dispatch-plan\.json/.test(mobileReleaseWorkflow)
    && /mobile-release-status\.json/.test(mobileReleaseWorkflow)
    && /mobile-release-secret-scan\.json/.test(mobileReleaseWorkflow)
    && /mobile-public-release-gate\.json/.test(mobileReleaseWorkflow)
    && /mobile-public-release-gate-android\.json/.test(mobileReleaseWorkflow)
    && /mobile-store-submission-package\.json/.test(mobileReleaseWorkflow)
    && /mobile-store-submission-google-play\.txt/.test(mobileReleaseWorkflow)
    && /mobile-store-submission-app-store\.txt/.test(mobileReleaseWorkflow)
    && /mobile-launch-sla-report\.json/.test(mobileReleaseWorkflow)
    && /mobile-ui-release-gate\.json/.test(mobileReleaseWorkflow)
    && /mobile-api-performance-smoke\.json/.test(mobileReleaseWorkflow)
    && /mobile-api-smoke-evidence/.test(mobileReleaseWorkflow)
    && /mobile-github-setup-plan\.json/.test(mobileReleaseWorkflow)
    && /mobile-github-setup\.ps1/.test(mobileReleaseWorkflow));
assert('api skeleton exposes health route', /\/health/.test(apiServer));
assert('api skeleton uses shared mobile endpoint registry', /MOBILE_API_ENDPOINTS/.test(apiServer));
assert('api exposes mobile job routes', /extractJobRoute/.test(apiServer) && /MOBILE_JOB_ROUTES/.test(apiServer));
assert('api exposes mobile notification inbox routes',
  /MOBILE_NOTIFICATION_ROUTES/.test(apiServer)
    && /MobileNotificationInbox/.test(apiServer)
    && /markRead/.test(apiServer));
assert('api exposes mobile push subscription routes',
  /MOBILE_PUSH_ROUTES/.test(apiServer)
    && /MobilePushRegistry/.test(apiServer)
    && /MobilePushDispatcher/.test(apiServer)
    && /pushDispatcher/.test(apiServer));
assert('api supports SSE progress', /text\/event-stream/.test(apiServer));
assert('api supports job cancellation', /store\.cancel/.test(apiServer));
assert('api health exposes mobile job queue stats', /jobs:\s*store\.stats\(\)/.test(apiServer));
assert('api health exposes mobile runtime readiness', /runtime:\s*getMobileRuntimeReadiness\(\)/.test(apiServer));
assert('api supports optional mobile bearer auth',
  /LEWORD_MOBILE_API_TOKEN/.test(apiServer)
    && /authorization/.test(apiServer)
    && /mobile API authorization required/.test(apiServer));
assert('api lets admins directly upload download installers without GitHub release URLs',
  /ADMIN_DOWNLOAD_UPLOAD_ROUTE\s*=\s*'\/v1\/admin\/downloads\/upload'/.test(apiServer)
    && /function downloadUploadMaxBytes/.test(apiServer)
    && /function uploadedDownloadCandidate/.test(apiServer)
    && /async function parseMultipartUpload/.test(apiServer)
    && /async function handleAdminDownloadUpload/.test(apiServer)
    && /\.exe/.test(apiServer)
    && /\.msi/.test(apiServer)
    && /\.apk/.test(apiServer)
    && /authorizeMobileRequest\(req, res, sessionAwareEntitlementVerifier, 'admin'\)/.test(apiServer)
    && /ADMIN_DOWNLOAD_UPLOAD_ROUTE/.test(apiServer));
assert('api protects public mobile traffic with request guardrails',
  /MobileApiRateLimiter/.test(apiGuardrails)
    && /parseMobileJsonBody/.test(apiGuardrails)
    && /LEWORD_MOBILE_MAX_BODY_BYTES/.test(apiGuardrails)
    && /LEWORD_MOBILE_RATE_LIMIT_PER_MINUTE/.test(apiGuardrails)
    && /apiGuardrails/.test(apiServer)
    && /guardrails/.test(apiServer)
    && /rateLimited/.test(apiServer)
    && /payloadTooLarge/.test(apiServer));
assert('api supports mobile entitlement verifier',
  /entitlementVerifier/.test(apiServer)
    && /authorizeMobileRequest/.test(apiServer)
    && /getMinimumMobileEntitlementTier/.test(apiServer)
    && /403/.test(apiServer));
assert('mobile entitlement bridge gates premium products',
  /MobileEntitlementTier/.test(mobileEntitlements)
    && /LEWORD_MOBILE_ENTITLEMENTS_FILE/.test(mobileEntitlements)
    && /LEWORD_MOBILE_ENTITLEMENT_URL/.test(mobileEntitlements)
    && /createHttpMobileEntitlementVerifier/.test(mobileEntitlements)
    && /license-service/.test(mobileEntitlements)
    && /'pro-traffic-hunter': 'pro'/.test(mobileEntitlements)
    && /'home-board-hunter': 'pro'/.test(mobileEntitlements)
    && /'kin-hidden-honey': 'pro'/.test(mobileEntitlements)
    && /createStaticMobileTokenVerifier/.test(mobileEntitlements));
assert('api supports mobile result cache',
  /InMemoryMobileResultCache/.test(apiServer)
    && /createCompleted/.test(apiServer)
    && /resultCache\?\.set/.test(apiServer)
    && /LEWORD_MOBILE_CACHE_FILE/.test(apiServer));
assert('api normalizes pro traffic cache keys to hit server prewarm results',
  /normalizeProTrafficCacheParams/.test(apiServer)
    && /normalizeMobileJobCacheParams/.test(apiServer)
    && /qualityProfile: 'publishable-v2'/.test(apiServer)
    && /normalizedCacheParams/.test(apiServer)
    && /hasUsableCachedResult/.test(apiServer)
    && /contextKeywords/.test(apiServer) === false);
assert('api keeps user API credentials out of public jobs and cache keys',
  /X-Leword-User-Api-Credentials/.test(apiServer)
    && /decodeUserApiCredentialsHeader/.test(apiServer)
    && /splitSensitiveJobParams/.test(apiServer)
    && /fingerprintUserApiCredentials/.test(apiServer)
    && /anthropicApiKey/.test(apiServer)
    && /manusApiKey/.test(apiServer)
    && /openaiApiKey/.test(apiServer)
    && /splitParams\.publicParams/.test(apiServer)
    && /splitParams\.executorParams/.test(apiServer)
    && /splitParams\.cacheParams/.test(apiServer));
assert('api supports mobile prewarm routes',
  /MOBILE_PREWARM_ROUTES/.test(apiServer)
    && /MobilePrewarmService/.test(apiServer)
    && /prewarmScheduler\.runNow/.test(apiServer)
    && /prewarmService\.start/.test(apiServer));
assert('api supports low-load live golden radar routes',
  /MOBILE_LIVE_GOLDEN_ROUTES/.test(apiServer)
    && /MobileLiveGoldenRadar/.test(apiServer)
    && /liveGoldenRadar\.start/.test(apiServer)
    && /liveGolden:\s*\{\s*enabled:\s*!!liveGoldenRadar/.test(apiServer)
    && !/liveGolden:\s*liveGoldenRadar\?\.snapshot/.test(apiServer));
assert('shared contract declares job routes', MOBILE_JOB_ROUTES.events.includes('/events'));

const orchestrator = read('src/mobile/job-orchestrator.ts');
const resultCache = read('src/mobile/result-cache.ts');
const prewarmService = read('src/mobile/prewarm-service.ts');
const prewarmScheduler = read('src/mobile/prewarm-scheduler.ts');
assert('job orchestrator stores jobs', /class InMemoryMobileJobStore/.test(orchestrator));
assert('job orchestrator supports subscription', /subscribe\(jobId/.test(orchestrator));
assert('job orchestrator supports AbortController', /AbortController/.test(orchestrator));
assert('job orchestrator can create completed cached jobs', /createCompleted/.test(orchestrator));
assert('job orchestrator protects PC workers with concurrency queue',
  /maxConcurrentJobs/.test(orchestrator)
    && /queuedJobIds/.test(orchestrator)
    && /startNextQueued/.test(orchestrator)
    && /stats\(\)/.test(orchestrator));
assert('mobile result cache can persist to disk',
  /persistenceFile/.test(resultCache)
    && /fs\.writeFileSync/.test(resultCache)
    && /fs\.readFileSync/.test(resultCache));
assert('mobile result cache does not replay empty keyword results',
  /isCacheableResult/.test(resultCache)
    && /keywords\.length === 0/.test(resultCache)
    && /this\.entries\.delete\(key\)/.test(resultCache)
    && /live-source-fallback/.test(resultCache));
assert('mobile prewarm service warms default high-impact targets',
  /DEFAULT_MOBILE_PREWARM_TARGETS/.test(prewarmService)
    && /pro-traffic-all-24h/.test(prewarmService)
    && /qualityProfile:\s*'publishable-v2'/.test(prewarmService)
    && /autoDiscovery:\s*true/.test(prewarmService)
    && /policy-golden-precision/.test(prewarmService)
    && /policy-pro-traffic-24h/.test(prewarmService)
    && /shopping-connect-hot-products/.test(prewarmService)
    && /naver-mate-auto-discovery/.test(prewarmService)
    && /product:\s*'naver-mate-hunter'/.test(prewarmService)
    && /travel-domestic-pro-traffic-24h/.test(prewarmService)
    && /electronics-pro-traffic-24h/.test(prewarmService)
    && /home-life-pro-traffic-24h/.test(prewarmService)
    && /resultCache\.set/.test(prewarmService));
assert('mobile result cache keeps daily prewarmed keyword products warm for 24 hours',
  /proTrafficPrewarmCacheTtlMinutes:\s*1440/.test(sharedMobileContract)
    && /DAILY_PREWARM_PRODUCTS/.test(resultCache)
    && /'pro-traffic-hunter'/.test(resultCache)
    && /'shopping-connect'/.test(resultCache)
    && /'youtube-golden'/.test(resultCache)
    && /'naver-mate-hunter'/.test(resultCache)
    && /proTrafficPrewarmCacheTtlMinutes/.test(resultCache)
    && /keywords\.every/.test(resultCache)
    && /item\.isMeasured === true && total > 0 && docs > 0/.test(resultCache));
assert('mobile prewarm publishes winners to notification inbox',
  /notificationInbox/.test(prewarmService)
    && /publishFromResult/.test(prewarmService)
    && /prewarm-winner/.test(notificationInbox)
    && /VALUABLE_GRADES/.test(notificationInbox));
assert('mobile recommendation inbox can fan out to push delivery',
  /setPublishListener/.test(notificationInbox)
    && /MobilePushDispatcher/.test(pushNotifications)
    && /createEnvironmentMobilePushSender/.test(pushNotifications)
    && /LEWORD_MOBILE_PUSH_ENDPOINT/.test(pushNotifications)
    && /LEWORD_MOBILE_PUSH_PROVIDER/.test(pushNotifications)
    && /EXPO_PUSH_SEND_ENDPOINT/.test(pushNotifications));
assert('mobile prewarm scheduler supports env-driven cache warming',
  /MobilePrewarmScheduler/.test(prewarmScheduler)
    && /LEWORD_MOBILE_PREWARM_INTERVAL_MINUTES/.test(prewarmScheduler)
    && /runOnStart/.test(prewarmScheduler)
    && /stop\(\)/.test(prewarmScheduler));
assert('mobile prewarm scheduler waits when document-count quota is exhausted',
  /isNaverBlogOpenApiQuotaBlocked/.test(prewarmScheduler)
    && /getNaverBlogOpenApiQuotaBlockedUntil/.test(prewarmScheduler)
    && /Naver OpenAPI document quota exhausted/.test(prewarmScheduler)
    && /retry after/.test(prewarmScheduler)
    && /scheduleRetry/.test(prewarmScheduler)
    && /nextRetryAt/.test(prewarmScheduler)
    && /measured-only keyword data/.test(prewarmScheduler)
    && /skippedRuns/.test(prewarmScheduler));
assert('mobile prewarm has a dedicated SearchAd budget without corrupting worker availability health',
  /LEWORD_MOBILE_PREWARM_SEARCHAD_SOFT_CEILING/.test(prewarmScheduler)
    && /summarizeSearchAdAccountPool/.test(prewarmScheduler)
    && /searchAdNextResetAtMs/.test(prewarmScheduler)
    && /SearchAd prewarm soft ceiling reached/.test(prewarmScheduler));
assert('production compose keeps server prewarm budgeted behind live golden supply',
  /LEWORD_MOBILE_PREWARM_INTERVAL_MINUTES:\s*\$\{LEWORD_MOBILE_PREWARM_INTERVAL_MINUTES:-360\}/.test(apiProductionCompose)
    && /LEWORD_MOBILE_PREWARM_LIMIT:\s*\$\{LEWORD_MOBILE_PREWARM_LIMIT:-2\}/.test(apiProductionCompose)
    && /LEWORD_MOBILE_PREWARM_CONCURRENCY:\s*\$\{LEWORD_MOBILE_PREWARM_CONCURRENCY:-1\}/.test(apiProductionCompose)
    && /LEWORD_MOBILE_PREWARM_SEARCHAD_SOFT_CEILING:\s*\$\{LEWORD_MOBILE_PREWARM_SEARCHAD_SOFT_CEILING:-1500\}/.test(apiProductionCompose)
    && /LEWORD_MOBILE_PREWARM_ON_START:\s*\$\{LEWORD_MOBILE_PREWARM_ON_START:-false\}/.test(apiProductionCompose)
    && /LEWORD_MOBILE_PREWARM_START_DELAY_MS:\s*\$\{LEWORD_MOBILE_PREWARM_START_DELAY_MS:-300000\}/.test(apiProductionCompose)
    && /LEWORD_MOBILE_LIVE_GOLDEN_READONLY:\s*"true"/.test(apiProductionCompose)
    && /LEWORD_MOBILE_LIVE_GOLDEN_ON_START:\s*"false"/.test(apiProductionCompose)
    && /LEWORD_MOBILE_LIVE_GOLDEN_INTERVAL_MINUTES:\s*\$\{LEWORD_MOBILE_LIVE_GOLDEN_API_INTERVAL_MINUTES:-1440\}/.test(apiProductionCompose)
    && /LEWORD_MOBILE_LIVE_GOLDEN_START_DELAY_MS:\s*\$\{LEWORD_MOBILE_LIVE_GOLDEN_START_DELAY_MS:-300000\}/.test(apiProductionCompose)
    && /LEWORD_MOBILE_LIVE_GOLDEN_IGNORE_PREWARM:\s*\$\{LEWORD_MOBILE_LIVE_GOLDEN_IGNORE_PREWARM:-true\}/.test(apiProductionCompose));
assert('mobile live golden radar is low-load and non-overlapping',
  /MobileLiveGoldenRadar/.test(liveGoldenRadar)
    && /liveGoldenCycleLimit/.test(liveGoldenRadar)
    && /liveGoldenMaxCandidates/.test(liveGoldenRadar)
    && /LEWORD_MOBILE_LIVE_GOLDEN_READONLY/.test(liveGoldenRadar)
    && /live golden read-only snapshot mode enabled/.test(liveGoldenRadar)
    && /LIVE_SNAPSHOT_CACHE_MS/.test(liveGoldenRadar)
    && /cachedSnapshot/.test(liveGoldenRadar)
    && /refreshBoardFromFile/.test(liveGoldenRadar)
    && /LEWORD_MOBILE_LIVE_GOLDEN_START_DELAY_MS/.test(liveGoldenRadar)
    && /defaultRunOnStartDelayMs/.test(liveGoldenRadar)
    && /shouldRun/.test(liveGoldenRadar)
    && /publishFromResult/.test(liveGoldenRadar)
    && /LEWORD_MOBILE_LIVE_GOLDEN_INTERVAL_MINUTES/.test(liveGoldenRadar));
assert('live golden worker runs discovery outside the HTTP API process',
  /createMobileLiveGoldenRadarFromEnv/.test(liveGoldenWorker)
    && /radar\.start\(\)/.test(liveGoldenWorker)
    && /heartbeat/.test(liveGoldenWorker)
    && /SIGTERM/.test(liveGoldenWorker));
assert('mobile live golden radar waits when document-count quota is exhausted',
  /isNaverBlogOpenApiQuotaBlocked/.test(liveGoldenRadar)
    && /getNaverBlogOpenApiQuotaBlockedUntil/.test(liveGoldenRadar)
    && /documentQuotaBlocked/.test(liveGoldenRadar)
    && /retry after/.test(liveGoldenRadar)
    && /scheduleQuotaRetry/.test(liveGoldenRadar)
    && /nextRetryAt/.test(sharedMobileContract)
    && /measured-only golden keywords/.test(liveGoldenRadar));
assert('mobile live golden board displays measured SSS winners first and measured publishable fallback rows',
  /isUltimateGoldenKeywordCandidate/.test(liveGoldenRadar)
    && /function isNearUltimateLiveBoardItem/.test(liveGoldenRadar)
    && /const measuredSssReady = sorted[\s\S]{0,120}isMeasuredSssBoardCandidate\(item, now\)/.test(liveGoldenRadar)
    && /const sssSelected = selectLiveBoardItemsFromPool\(/.test(liveGoldenRadar)
    && /return appendMeasuredPublishableFallbackItems\(sssSelected, sorted, target, now\)/.test(liveGoldenRadar)
    && /if \(item\.grade !== 'SSS'\) return false;/.test(liveGoldenRadar)
    && !/const strictReady = sorted[\s\S]{0,160}\.filter\(isStrictReadyLiveBoardItem\)/.test(liveGoldenRadar)
    && /function isPublicPreviewCandidate[\s\S]{0,220}isStrictReadyLiveBoardItem/.test(liveGoldenRadar));
assert('mobile live golden board carries and enforces measurement provenance',
  /MobileDocumentCountSource/.test(sharedMobileContract)
    && /documentCountSource\?/.test(sharedMobileContract)
    && /documentCountConfidence\?/.test(sharedMobileContract)
    && /isDocumentCountEstimated\?/.test(sharedMobileContract)
    && /measurementMetadataFromDocumentCount/.test(liveGoldenRadar)
    && /hasTrustedDocumentCountMeasurement/.test(liveGoldenRadar)
    && /hasTrustedSearchVolumeMeasurement/.test(liveGoldenRadar));
assert('api health exposes prewarm scheduler state',
  /createMobilePrewarmSchedulerFromEnv/.test(apiServer)
    && /scheduler: prewarmScheduler/.test(apiServer)
    && /server\.on\('close'/.test(apiServer));
assert('api server keeps feature prewarm supplements separated by user intent',
  /qualityProfile:\s*'intent-separated-v3'/.test(apiServer)
    && /SHOPPING_CONNECT_NON_PRODUCT_RE/.test(apiServer)
    && /SHOPPING_CONNECT_PRODUCT_CATEGORY_RE/.test(apiServer)
    && /\|health\|baby\|sports\|pet\|interior\|car\|gift/.test(apiServer)
    && /function isShoppingConnectMeasuredQualityCandidate/.test(apiServer)
    && /const hasProductPick = !!item\.shoppingProductPick/.test(apiServer)
    && /typeof item\.goldenRatio === 'number' && item\.goldenRatio > 0/.test(apiServer)
    && /hasProductPick && total >= 10 && docs <= 150000 && ratio >= 0\.0001/.test(apiServer)
    && /hasBuyIntent && total >= 10 && docs <= 150000 && ratio >= 0\.0001/.test(apiServer)
    && apiServer.includes("'\\\\uC21C\\\\uC704'")
    && apiServer.includes("'\\\\uAC00\\\\uC131\\\\uBE44'")
    && apiServer.includes("'\\\\uAD6C\\\\uB9E4\\\\uCC98'")
    && /NAVER_MATE_SOURCE_RE/.test(apiServer)
    && /server-measured-naver-mate-prewarm/.test(apiServer)
    && /naver-expansion-measured-need/.test(apiServer)
    && /NAVER_MATE_LOW_VALUE_COMPACT_RE/.test(apiServer)
    && /function isNaverMateDisplayQualityCandidate/.test(apiServer)
    && /serverMetricGradeRank\(item\.grade\) > 0/.test(apiServer)
    && !/NAVER_MATE_SOURCE_RE\s*=\s*\/\(naver-mate\|/.test(apiServer)
    && /function isNaverMateMeasuredBoardCandidate/.test(apiServer)
    && /item\.grade !== 'SSS'/.test(apiServer)
    && /item\.documentCount > 8000/.test(apiServer)
    && /ratio < 3/.test(apiServer)
    && /const isMeasuredNaverMateExplorationMetric = endpoint\.product === 'naver-mate-hunter'/.test(apiServer)
    && /const isMeasuredShoppingConnectMetric = endpoint\.product === 'shopping-connect'/.test(apiServer)
    && /&& !isMeasuredNaverMateExplorationMetric/.test(apiServer)
    && /&& !isMeasuredShoppingConnectMetric/.test(apiServer)
    && /function isKinMeasuredBoardCandidate/.test(apiServer)
    && /endpoint\.product === 'naver-mate-hunter' && !isNaverMateMeasuredBoardCandidate/.test(apiServer)
    && /product === 'shopping-connect'\s*\?\s*\['shopping-connect'\]/.test(apiServer)
    && /product === 'naver-mate-hunter'[\s\S]{0,120}\?\s*\['naver-mate-hunter'\]/.test(apiServer)
    && /product === 'naver-mate-hunter'[\s\S]{0,120}isNaverMateMeasuredBoardCandidate/.test(apiServer)
    && /function isProTrafficMeasuredBoardCandidate/.test(apiServer)
    && /product === 'pro-traffic-hunter'[\s\S]{0,120}isProTrafficMeasuredBoardCandidate/.test(apiServer)
    && /const pool = primary/.test(apiServer),
  'feature board supplement must not replay generic PRO/live board rows into Naver Mate or KIN');

assert('Naver Mate prewarm seed is stable Korean text, not mojibake',
  /id:\s*'naver-mate-auto-discovery'[\s\S]{0,260}seedKeyword:\s*'\\uC624\\uB298 \\uC2E4\\uC2DC\\uAC04 \\uC774\\uC288'/.test(prewarmService),
  'Naver Mate 24h prewarm must start from 오늘 실시간 이슈 instead of a corrupted seed');

assert('shopping connect prewarm rows are enriched with real product picks before caching',
  /function enrichShoppingProductPicksForResult/.test(apiServer)
    && /searchNaverShopping/.test(apiServer)
    && /searchNaverShoppingForProductPick/.test(apiServer)
    && /waitForShoppingRetry/.test(apiServer)
    && /rankShoppingOpportunities/.test(apiServer)
    && /buildServerShoppingProductPick/.test(apiServer)
    && /directProductFallback/.test(apiServer)
    && /server-shopping-product-pick/.test(apiServer)
    && /const enrichedCachedResult = await enrichShoppingProductPicksForResult/.test(apiServer)
    && /cachedSyncedResult = sanitizeMeasuredKeywordResult\(endpoint, enrichedCachedResult\)/.test(apiServer)
    && /const enrichedPrewarmedResult = await enrichShoppingProductPicksForResult/.test(apiServer)
    && /prewarmedResult = sanitizeMeasuredKeywordResult\(endpoint, enrichedPrewarmedResult\)/.test(apiServer)
    && /const enrichedResult = await enrichShoppingProductPicksForResult/.test(apiServer)
    && /const sanitizedResult = sanitizeMeasuredKeywordResult\(endpoint, enrichedResult\)/.test(apiServer),
  'shopping prewarm/cache results must explain the sellable product, not only replay measured keywords');

assert('API strict sanitizer keeps measured and trusted source-only mindmap expansion rows',
  /function isMindmapMeasuredBoardCandidate/.test(apiServer)
    && /MINDMAP_MEASURED_SOURCE_RE/.test(apiServer)
    && /function isMindmapSourceOnlyBoardCandidate/.test(apiServer)
    && /MINDMAP_SOURCE_ONLY_SOURCE_RE/.test(apiServer)
    && /product === 'mindmap-expansion'\) return Math\.min\(targetCount, 10\)/.test(apiServer)
    && /endpoint\.product === 'mindmap-expansion'\) return isMindmapServerBoardCandidate/.test(apiServer)
    && /pc-mindmap-exact-measured-seed/.test(apiServer)
    && /pc-mindmap-measured-intent-expansion/.test(apiServer)
    && /server-measured-mindmap-prewarm/.test(apiServer)
    && /function measuredMindmapCacheCandidates/.test(apiServer)
    && /product === 'mindmap-expansion'\) return \[\]/.test(apiServer)
    && /endpoint\.product === 'mindmap-expansion'[\s\S]{0,120}measuredMindmapCacheCandidates/.test(apiServer),
  'mindmap endpoint must not sanitize exact measured or trusted source-only expansion rows down to 0');

const pcExecutor = read('src/mobile/pc-engine-executor.ts');
assert('mobile executor exists', /createMobilePcEngineExecutor/.test(pcExecutor));
assert('mobile executor uses PC keyword expansion ranker', /rankKeywordExpansionCandidates/.test(pcExecutor));
assert('mobile executor uses PC mindmap quality gate', /rankMindmapExpansionCandidates/.test(pcExecutor));
assert('mobile executor filters article-title mindmap noise and supplements thin measured pools',
  /MINDMAP_ARTICLE_TITLE_QUERY_RE/.test(pcExecutor)
    && /buildInsuranceCalculatorMeasuredRoots/.test(pcExecutor)
    && /const normalizedRoot = stripKnownIntent\(normalizedSeed\)/.test(pcExecutor)
    && /buildMindmapMeasuredQueryRoots\(normalizedRoot, 32\)/.test(pcExecutor)
    && /hasDuplicatedKnownIntentChain/.test(pcExecutor)
    && /mindmap measured pool low/.test(pcExecutor)
    && /mergePrioritizedKeywordMetrics\(\[finalMetrics, fallback, sourceOnlyMetrics\], params\.targetCount\)/.test(pcExecutor)
    && /sourceOnlyMetrics/.test(pcExecutor),
  'mindmap must measure concise query candidates instead of stopping at article-title noise');
assert('mobile executor measures analysis and mindmap candidates with PC metrics',
  /measureKeywordMetrics\?/.test(pcExecutor)
    && /createDefaultKeywordMetricsAdapter/.test(pcExecutor)
    && /getNaverSearchAdKeywordVolume/.test(pcExecutor)
    && /pc-searchad-volume/.test(pcExecutor)
    && /pc-naver-blog-document-count/.test(pcExecutor)
    && /calculateMindmapMetricGrade/.test(pcExecutor));
assert('mobile executor retains only an unattempted fresh exact document binding and clears failed remeasurement',
  /const canRetainExistingDocumentMeasurement = documentMeasurement === undefined[\s\S]{0,100}hasFreshCanonicalDocumentCountMeasurement\(metric\)/.test(pcExecutor)
    && /const invalidatedDocumentTuple = !hasFreshBoundDocumentMeasurement[\s\S]{0,180}documentMeasurement !== undefined/.test(pcExecutor)
    && /documentCount: resolvedDocumentCount/.test(pcExecutor)
    && /document-count-query-binding-invalidated/.test(pcExecutor));
assert('mobile executor marks SearchAd/OpenAPI measurement provenance and blocks estimated metrics',
  /searchAdKeywordBindingMetadata/.test(pcExecutor)
    && /const hasBoundVolumeSplit =/.test(pcExecutor)
    && /const hasBoundVolumeRange =/.test(pcExecutor)
    && /searchVolumeSource = hasAcceptedVolumeMeasurement/.test(pcExecutor)
    && /searchVolumeBindingVersion: retainedBindingMetadata/.test(pcExecutor)
    && /searchVolumeMeasuredAt: retainedBindingMetadata/.test(pcExecutor)
    && /documentCountSource = hasFreshBoundDocumentMeasurement/.test(pcExecutor)
    && /documentCountConfidence = hasFreshBoundDocumentMeasurement/.test(pcExecutor)
    && /isDocumentCountEstimated = hasFreshBoundDocumentMeasurement/.test(pcExecutor)
    && /hasTrustedDocumentCountMeasurement/.test(pcExecutor)
    && /hasTrustedSearchVolumeMeasurement/.test(pcExecutor));
assert('mobile executor uses the shared broad Naver Blog OpenAPI total without adding cafe documents',
  /getNaverBlogDocumentCount\(broadQuery/.test(pcExecutor)
    && !/cafearticle/.test(pcExecutor)
    && /Product-wide SSoT: unquoted Naver Blog OpenAPI total only/.test(pcExecutor)
    && /fetchNaverDocumentCountMap/.test(pcExecutor)
    && /pc-naver-openapi-document-count/.test(pcExecutor));
assert('mobile executor replaces search volume only with an explicitly keyword-bound SearchAd split',
  /const splitTotal = hasBoundVolumeSplit/.test(pcExecutor)
    && /const totalSearchVolume = hasBoundVolumeSplit/.test(pcExecutor)
    && /const totalSearchVolume = hasBoundVolumeSplit[\s\S]{0,240}\? splitTotal[\s\S]{0,240}: metric\.totalSearchVolume/.test(pcExecutor)
    && /retainedBindingMetadata = hasAcceptedVolumeMeasurement/.test(pcExecutor));
assert('mobile executor wires golden discovery to PC MDP engine', /MDPEngine/.test(pcExecutor) && /runGoldenDiscoveryWithPcMdp/.test(pcExecutor));
assert('mobile bulk golden direct supplement keeps measured SS/S quality backfill',
  /isQualityGoldenDiscoveryResult/.test(pcExecutor)
    && /isBulkGolden && isQualityGoldenDiscoveryResult/.test(pcExecutor)
    && /visibleNeed/.test(pcExecutor));
assert('mobile bulk golden direct supplement expands measured candidate batches but keeps a bounded cap',
  /Math\.max\(2400, Math\.min\(7200/.test(pcExecutor)
    && !/Math\.max\(6000, Math\.min\(10000/.test(pcExecutor));
assert('mobile executor wires PRO traffic to PC hunter', /huntProTrafficKeywords/.test(pcExecutor) && /runProTrafficWithPcHunter/.test(pcExecutor));
assert('mobile executor prewarms PRO traffic from live autocomplete plus wider measured-first pool',
  /const hunterCount = params\.seedKeyword[\s\S]{0,180}Math\.max\(params\.targetCount \* 5, 160\)/.test(pcExecutor)
    && /buildProTrafficLiveMeasuredMetrics/.test(pcExecutor)
    && /const combinedRawMetrics = \[\.\.\.liveMeasuredMetrics, \.\.\.rawMetrics\]/.test(pcExecutor)
    && /count: hunterCount/.test(pcExecutor)
    && /Math\.max\(params\.targetCount \* 3, params\.targetCount \+ 60\)/.test(pcExecutor)
    && /let finalMetrics = prioritizeProTrafficPublishableMetrics/.test(pcExecutor)
    && /pc-pro-traffic-source-signal-topup/.test(pcExecutor)
    && /pc-pro-traffic-root-intent-topup/.test(pcExecutor));
assert('mobile executor preserves server autoDiscovery flag for strict prewarm gating',
  /autoDiscovery:\s*payload\.autoDiscovery === true/.test(pcExecutor)
    && /if \(!params\.seedKeyword && \(params as any\)\.autoDiscovery === true\)/.test(pcExecutor)
    && /live measured prewarm filled/.test(pcExecutor));
assert('mobile executor keeps PRO strict prewarm at 98 score without near-candidate fallback',
  /minAiScore:\s*98/.test(pcExecutor)
    && /return prioritizeFullyMeasuredMetrics\(strict, targetCount\)/.test(pcExecutor)
    && /metric\.grade === 'SSS'/.test(pcExecutor)
    && /isStrictAutoDiscoverySearchQuery/.test(pcExecutor)
    && !/measuredPublishable/.test(pcExecutor)
    && !/minAiScore:\s*94/.test(pcExecutor));
assert('mobile executor blocks weak PRO traffic profile and episode-count intents before final display',
  /isWeakProTrafficPublishIntent/.test(pcExecutor)
    && /isUltimateLowValueLookupKeyword/.test(pcExecutor)
    && /isUltimateGoldenKeywordCandidate/.test(pcExecutor)
    && /strictUltimate/.test(pcExecutor));
assert('mobile executor keeps Naver Mate auto discovery on utility intent signals',
  /NAVER_MATE_UTILITY_SIGNAL_RE/.test(pcExecutor)
    && /NAVER_MATE_VOLATILE_NEWS_RE/.test(pcExecutor)
    && /isNaverMateSourceSignalWorthExpanding/.test(pcExecutor)
    && /isNaverMateUtilityRootCandidate/.test(pcExecutor)
    && /spiderWebDepth:\s*autoDiscovery \? 0 : 1/.test(pcExecutor)
    && /naverMateMinimumUsefulCount/.test(pcExecutor));
assert('mobile executor keeps Naver Mate measured display below broad-head document caps',
  /maxDocumentCount = 8000/.test(pcExecutor)
    && /docs > Math\.min\(8000, maxDocumentCount\)/.test(pcExecutor)
    && /total < 50/.test(pcExecutor)
    && /metric\.grade === 'SSS'/.test(pcExecutor)
    && /ratio < 3/.test(pcExecutor)
    && !/prioritizeNaverMateMeasuredMetrics\(measuredMetrics, params\.targetCount, 150000\)/.test(pcExecutor)
    && !/maxDocumentCount = 50000/.test(pcExecutor));
assert('mobile executor recovers measured PRO traffic document counts from PC hunter evidence',
  /recoverProTrafficDocumentCount/.test(pcExecutor)
    && /pc-pro-traffic-document-count-recovered/.test(pcExecutor));
assert('mobile executor wires home board to PC home planner',
  /expandHomeNeedKeywords/.test(pcExecutor) && /buildHomePublishPlan/.test(pcExecutor));
assert('mobile executor wires KIN to PC golden hunter',
  /naver-kin-golden-hunter-v3/.test(pcExecutor) && /runKinHiddenHoneyWithPcHunter/.test(pcExecutor));
assert('mobile executor supports injectable heavy adapters for deterministic tests',
  /runGoldenDiscovery\?/.test(pcExecutor)
    && /runProTraffic\?/.test(pcExecutor)
    && /runHomeBoard\?/.test(pcExecutor)
    && /runKinHiddenHoney\?/.test(pcExecutor)
    && /measureKeywordMetrics\?/.test(pcExecutor));
assert('mobile executor merges per-user API credentials before server env defaults',
  /JOB_API_CREDENTIAL_KEYS/.test(pcExecutor)
    && /anthropicApiKey/.test(pcExecutor)
    && /manusApiKey/.test(pcExecutor)
    && /openaiApiKey/.test(pcExecutor)
    && /extractJobApiCredentials/.test(pcExecutor)
    && /mergeJobApiCredentials/.test(pcExecutor)
    && /const configured = normalizeKeyword\(env\[key\] \|\| ''\)/.test(pcExecutor)
    && /createDefaultKeywordMetricsAdapter\(\s*getJobEnvConfig/.test(pcExecutor)
    && /runYoutubeGoldenWithPcEngine\(payload, ctx, getJobEnvConfig/.test(pcExecutor)
    && /runNaverMateWithPcEngine\(payload, ctx, jobMeasureKeywordMetrics, getJobEnvConfig/.test(pcExecutor));
assert('api server defaults to mobile PC engine executor', /createMobilePcEngineExecutor/.test(apiServer));

const plan = read('docs/mobile-ultra-plan.md');
assert('plan documents PC parity', /Performance parity rules/.test(plan));
assert('plan documents mobile server worker split', /server workers only/i.test(plan));
assert('plan documents store compliance', /IAP|Data Safety|privacy/i.test(plan));
assert('plan documents release gates', /Release gates/.test(plan));
assert('plan documents mobile release gate', /Mobile release gate passes/.test(plan));
assert('plan documents entitlement bridge', /entitlement/i.test(plan) && /LEWORD_MOBILE_ENTITLEMENTS_FILE/.test(plan));
assert('plan documents push recommendation delivery',
  /push/i.test(plan)
    && /LEWORD_MOBILE_PUSH_ENDPOINT/.test(plan)
    && /LEWORD_MOBILE_PUSH_PROVIDER/.test(plan));
assert('plan documents release runbook and env examples',
  /docs\/mobile-release-runbook\.md/.test(plan)
    && /apps\/mobile\/\.env\.production\.example/.test(plan)
    && /apps\/api\/\.env\.production\.example/.test(plan)
    && /apps\/api\/Dockerfile/.test(plan)
    && /apps\/api\/docker-compose\.production\.yml/.test(plan)
    && /mobile-api-image-reference/.test(plan)
    && /mobile:api-deploy-gate/.test(plan)
    && /mobile:api:docker:build/.test(plan)
    && /mobile:store-listing/.test(plan)
    && /mobile:store-assets/.test(plan)
    && /docs\/mobile-store-assets\.json/.test(plan)
    && /mobile:deploy-readiness/.test(plan)
    && /mobile:release-status/.test(plan)
    && /mobile:release-secret-scan/.test(plan)
    && /mobile:public-release-gate/.test(plan)
    && /submitToStores/.test(plan));

console.log('[mobile-ultra-plan-regression.test] passed');
