import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const {
  materializeMobileSubmitConfig,
} = require('../../../scripts/mobile-materialize-submit-config');

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-mobile-submit-config-'));
const mobileDir = path.join(rootDir, 'apps', 'mobile');
fs.mkdirSync(mobileDir, { recursive: true });
const easPath = path.join(mobileDir, 'eas.json');
fs.writeFileSync(easPath, JSON.stringify({
  submit: {
    production: {
      android: {
        track: 'internal',
        releaseStatus: 'draft',
        serviceAccountKeyPath: './credentials/google-play-service-account.json',
      },
      ios: {
        appleId: 'REPLACE_WITH_APPLE_ID',
        ascAppId: 'REPLACE_WITH_APP_STORE_CONNECT_APP_ID',
        appleTeamId: 'REPLACE_WITH_APPLE_TEAM_ID',
        sku: 'com.leword.mobile',
      },
    },
    public: {
      android: {
        track: 'production',
        releaseStatus: 'draft',
        serviceAccountKeyPath: './credentials/google-play-service-account.json',
      },
      ios: {
        appleId: 'REPLACE_WITH_APPLE_ID',
        ascAppId: 'REPLACE_WITH_APP_STORE_CONNECT_APP_ID',
        appleTeamId: 'REPLACE_WITH_APPLE_TEAM_ID',
        sku: 'com.leword.mobile',
      },
    },
  },
}, null, 2), 'utf8');

const serviceAccountJson = '{"type":"service_account"}\n';
const ascApiKey = '-----BEGIN PRIVATE KEY-----\nmobile-test-key\n-----END PRIVATE KEY-----\n';
const report = materializeMobileSubmitConfig({
  rootDir,
  env: {
    EXPO_APPLE_ID: 'release@example.com',
    EXPO_ASC_APP_ID: '1234567890',
    EXPO_APPLE_TEAM_ID: 'AB12XYZ34S',
    EXPO_ASC_API_KEY_P8_B64: Buffer.from(ascApiKey, 'utf8').toString('base64'),
    EXPO_ASC_API_KEY_ISSUER_ID: 'issuer-id',
    EXPO_ASC_API_KEY_ID: 'KEYID12345',
    GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64: Buffer.from(serviceAccountJson, 'utf8').toString('base64'),
  },
});
const updated = JSON.parse(fs.readFileSync(easPath, 'utf8'));
const credentialPath = path.join(mobileDir, 'credentials', 'google-play-service-account.json');
const ascApiKeyPath = path.join(mobileDir, 'credentials', 'app-store-connect-api-key.p8');

assert('materialize updates iOS apple id from env',
  updated.submit.production.ios.appleId === 'release@example.com');
assert('materialize updates iOS ASC app id from env',
  updated.submit.production.ios.ascAppId === '1234567890');
assert('materialize updates iOS team id from env',
  updated.submit.production.ios.appleTeamId === 'AB12XYZ34S');
assert('materialize updates iOS ASC API key path from env',
  updated.submit.production.ios.ascApiKeyPath === './credentials/app-store-connect-api-key.p8');
assert('materialize updates iOS ASC API key issuer from env',
  updated.submit.production.ios.ascApiKeyIssuerId === 'issuer-id');
assert('materialize updates iOS ASC API key id from env',
  updated.submit.production.ios.ascApiKeyId === 'KEYID12345');
assert('materialize updates public iOS profile from env',
  updated.submit.public.ios.appleId === 'release@example.com'
    && updated.submit.public.ios.ascAppId === '1234567890'
    && updated.submit.public.ios.appleTeamId === 'AB12XYZ34S'
    && updated.submit.public.ios.ascApiKeyPath === './credentials/app-store-connect-api-key.p8'
    && updated.submit.public.ios.ascApiKeyIssuerId === 'issuer-id'
    && updated.submit.public.ios.ascApiKeyId === 'KEYID12345');
assert('materialize writes Google Play service account file',
  fs.readFileSync(credentialPath, 'utf8') === serviceAccountJson);
assert('materialize writes App Store Connect API key file',
  fs.readFileSync(ascApiKeyPath, 'utf8') === ascApiKey);
assert('materialize reports changed fields',
  report.changes.includes('production.ios.appleId')
    && report.changes.includes('production.ios.ascAppId')
    && report.changes.includes('production.ios.appleTeamId')
    && report.changes.includes('production.ios.ascApiKeyPath')
    && report.changes.includes('production.ios.ascApiKeyPath.file')
    && report.changes.includes('production.ios.ascApiKeyIssuerId')
    && report.changes.includes('production.ios.ascApiKeyId')
    && report.changes.includes('production.android.serviceAccountKeyPath.file')
    && report.changes.includes('public.ios.appleId')
    && report.changes.includes('public.ios.ascAppId')
    && report.changes.includes('public.ios.appleTeamId')
    && report.changes.includes('public.ios.ascApiKeyPath')
    && report.changes.includes('public.ios.ascApiKeyPath.file')
    && report.changes.includes('public.ios.ascApiKeyIssuerId')
    && report.changes.includes('public.ios.ascApiKeyId')
    && report.changes.includes('public.android.serviceAccountKeyPath.file'));

console.log('[mobile-materialize-submit-config.test] passed');

export {};
