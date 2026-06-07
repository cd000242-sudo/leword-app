import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const {
  validateAndroidSubmitProfile,
  validateIosSubmitProfile,
  validateMobileSubmitProfile,
} = require('../../../scripts/mobile-submit-gate');

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

function assertThrows(name: string, fn: () => void, pattern: RegExp): void {
  try {
    fn();
  } catch (err) {
    assert(name, pattern.test((err as Error).message), (err as Error).message);
    return;
  }
  throw new Error(`${name}: expected throw`);
}

const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-mobile-submit-gate-'));
const credentialDir = path.join(rootDir, 'apps', 'mobile', 'credentials');
fs.mkdirSync(credentialDir, { recursive: true });
fs.writeFileSync(path.join(credentialDir, 'google-play-service-account.json'), '{}\n', 'utf8');

const androidProfile = {
  track: 'internal',
  releaseStatus: 'draft',
  serviceAccountKeyPath: './credentials/google-play-service-account.json',
};
const androidPublicProfile = {
  track: 'production',
  releaseStatus: 'draft',
  serviceAccountKeyPath: './credentials/google-play-service-account.json',
};

const iosProfile = {
  appleId: 'release@example.com',
  ascAppId: '1234567890',
  appleTeamId: 'AB12XYZ34S',
};

const android = validateAndroidSubmitProfile(androidProfile, { rootDir });
assert('android submit gate accepts internal draft profile with service account file',
  android.serviceAccountPath.endsWith('google-play-service-account.json'));

const publicAndroid = validateAndroidSubmitProfile(androidPublicProfile, {
  rootDir,
  expectedTrack: 'production',
});
assert('android submit gate accepts public production-track profile when expected',
  publicAndroid.serviceAccountPath.endsWith('google-play-service-account.json'));

assertThrows(
  'android submit gate rejects missing service account file',
  () => validateAndroidSubmitProfile({
    ...androidProfile,
    serviceAccountKeyPath: './credentials/missing.json',
  }, { rootDir }),
  /service account key file exists/,
);

const ios = validateIosSubmitProfile(iosProfile, {
  EXPO_APPLE_APP_SPECIFIC_PASSWORD: 'app-specific-password',
}, { rootDir });
assert('ios submit gate accepts App Store profile with app-specific password',
  ios.hasAppSpecificPassword === true);

fs.writeFileSync(path.join(credentialDir, 'app-store-connect-api-key.p8'), 'private-key\n', 'utf8');
const iosWithApiKey = validateIosSubmitProfile({
  ...iosProfile,
  ascApiKeyPath: './credentials/app-store-connect-api-key.p8',
  ascApiKeyIssuerId: 'issuer-id',
  ascApiKeyId: 'KEYID12345',
}, {}, { rootDir });
assert('ios submit gate accepts App Store Connect API key file auth',
  iosWithApiKey.hasAscApiKey === true);

const iosFromEnv = validateIosSubmitProfile({
  appleId: 'REPLACE_WITH_APPLE_ID',
  ascAppId: 'REPLACE_WITH_APP_STORE_CONNECT_APP_ID',
  appleTeamId: 'REPLACE_WITH_APPLE_TEAM_ID',
}, {
  EXPO_APPLE_ID: 'release@example.com',
  EXPO_ASC_APP_ID: '1234567890',
  EXPO_APPLE_TEAM_ID: 'AB12XYZ34S',
  EXPO_APPLE_APP_SPECIFIC_PASSWORD: 'app-specific-password',
}, { rootDir });
assert('ios submit gate accepts CI env overrides for placeholder eas profile',
  iosFromEnv.appleId === 'release@example.com'
    && iosFromEnv.ascAppId === '1234567890'
    && iosFromEnv.appleTeamId === 'AB12XYZ34S');

assertThrows(
  'ios submit gate rejects placeholder App Store Connect app id',
  () => validateIosSubmitProfile({
    ...iosProfile,
    ascAppId: 'REPLACE_WITH_APP_STORE_CONNECT_APP_ID',
  }, { EXPO_APPLE_APP_SPECIFIC_PASSWORD: 'app-specific-password' }, { rootDir }),
  /App Store Connect app id/,
);

assertThrows(
  'ios submit gate rejects missing submit auth',
  () => validateIosSubmitProfile(iosProfile, {}, { rootDir }),
  /iOS submit auth/,
);

validateMobileSubmitProfile('android', {
  rootDir,
  easConfig: {
    submit: {
      production: {
        android: androidProfile,
      },
    },
  },
});

validateMobileSubmitProfile('android', {
  rootDir,
  profileName: 'public',
  easConfig: {
    submit: {
      public: {
        android: androidPublicProfile,
      },
    },
  },
});

assertThrows(
  'submit gate rejects unknown platform',
  () => validateMobileSubmitProfile('web', {
    rootDir,
    easConfig: { submit: { production: {} } },
  }),
  /Submit platform/,
);

console.log('[mobile-submit-gate.test] passed');
