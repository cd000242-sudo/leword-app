import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const {
  validateMobileSubmitProfile,
} = require('../../../scripts/mobile-submit-gate');
const {
  collectMobilePublicReleaseGate,
} = require('../../../scripts/mobile-public-release-gate');

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

const rootDir = path.join(__dirname, '..', '..', '..');
const easConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'apps', 'mobile', 'eas.json'), 'utf8'));
const rootPackage = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const mobilePackage = JSON.parse(fs.readFileSync(path.join(rootDir, 'apps', 'mobile', 'package.json'), 'utf8'));

assert('android submit profiles separate internal rollout from public release',
  easConfig.submit.production.android.track === 'internal'
    && easConfig.submit.production.android.releaseStatus === 'draft'
    && easConfig.submit.public.android.track === 'production'
    && easConfig.submit.public.android.releaseStatus === 'draft'
    && easConfig.submit.public.android.serviceAccountKeyPath === './credentials/google-play-service-account.json');

assert('root package exposes public Android submit commands',
  rootPackage.scripts['mobile:submit-gate:android:public'] === 'node scripts/mobile-submit-gate.js --platform android --profile public'
    && /eas-cli submit --platform android --profile public --latest/.test(rootPackage.scripts['mobile:submit:android:public']));

assert('mobile package exposes public Android submit command',
  /eas-cli submit --platform android --profile public --latest/.test(mobilePackage.scripts['submit:android:public']));

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-mobile-public-submit-'));
const credentialDir = path.join(tempRoot, 'apps', 'mobile', 'credentials');
fs.mkdirSync(credentialDir, { recursive: true });
fs.writeFileSync(path.join(credentialDir, 'google-play-service-account.json'), '{}\n', 'utf8');

const validation = validateMobileSubmitProfile('android', {
  rootDir: tempRoot,
  profileName: 'public',
  easConfig: {
    submit: {
      production: {
        android: {
          track: 'internal',
          releaseStatus: 'draft',
          serviceAccountKeyPath: './credentials/google-play-service-account.json',
        },
      },
      public: {
        android: {
          track: 'production',
          releaseStatus: 'draft',
          serviceAccountKeyPath: './credentials/google-play-service-account.json',
        },
      },
    },
  },
});

assert('submit gate validates public Android submit profile by explicit profile name',
  validation.serviceAccountPath.endsWith('google-play-service-account.json'));

const readableCopy = '\uD0A4\uC6CC\uB4DC \uBAA8\uBC14\uC77C \uBD84\uC11D \uAC80\uC0C9\uB7C9 '.repeat(12);
const publicGate = collectMobilePublicReleaseGate({
  audit: {
    app: {
      rootVersion: '2.49.83',
      mobileVersion: '0.1.0',
      androidPackage: 'com.leword.mobile',
      iosBundleIdentifier: 'com.leword.mobile',
    },
    eas: {
      androidSubmitTrack: 'internal',
      androidPublicSubmitTrack: 'production',
      iosSubmitConfigured: true,
    },
    releaseStatus: {
      codeReady: true,
      apiDeployReady: true,
      storeListingReady: true,
      storeAssetsReady: true,
      uiReady: true,
      apiRuntimeReady: true,
      androidJsExportReady: true,
      androidSubmitReady: false,
      androidPublicSubmitReady: true,
      iosSubmitReady: true,
    },
  },
  storeAssets: {
    publicReleaseEvidence: {
      deviceCapturedScreenshotsReady: true,
      screenshotSource: 'device-captured',
      evidencePath: 'src/utils/__tests__/fixtures/mobile-device-capture-evidence.json',
      reviewerTokenReady: true,
      reviewerTokenEvidencePath: 'src/utils/__tests__/fixtures/mobile-reviewer-token-evidence.json',
    },
  },
  storeListing: {
    contact: {
      privacyPolicyUrl: 'https://leword.app/privacy',
      supportUrl: 'https://leword.app/support',
    },
    googlePlay: {
      shortDescription: readableCopy,
      fullDescription: readableCopy,
      releaseNotes: readableCopy,
    },
    appStore: {
      subtitle: readableCopy,
      promotionalText: readableCopy,
      description: readableCopy,
      keywords: readableCopy,
    },
  },
  compliance: {
    privacyPolicyUrl: 'https://leword.app/privacy',
    supportUrl: 'https://leword.app/support',
    privacy: { productionOnlyHttps: true },
    storeForms: {
      appleAppPrivacy: { privacyPolicyRequired: true },
      googlePlayDataSafety: { dataEncryptedInTransit: true },
    },
  },
  performanceSmoke: { ok: true },
  env: {},
});

assert('public release gate uses public Android submit readiness instead of internal-track readiness',
  publicGate.ok === true
    && publicGate.releaseStatus.androidSubmitTrack === 'internal'
    && publicGate.releaseStatus.androidPublicSubmitTrack === 'production'
    && publicGate.releaseStatus.androidPublicSubmitReady === true);

console.log('[mobile-public-submit-profile.test] passed');

export {};
