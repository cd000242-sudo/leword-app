const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function assert(name, condition, detail = '') {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

function isPlaceholder(value) {
  return !value || /^REPLACE_|YOUR_|TODO|CHANGE_ME/i.test(String(value));
}

function resolveMobilePath(relativePath) {
  return path.join(root, 'apps', 'mobile', relativePath);
}

function parsePlatform(argv) {
  const index = argv.indexOf('--platform');
  return index >= 0 ? argv[index + 1] : '';
}

function parseProfile(argv) {
  const equalsArg = argv.find((arg) => arg.startsWith('--profile='));
  if (equalsArg) return equalsArg.split('=')[1] || 'production';
  const index = argv.indexOf('--profile');
  return index >= 0 ? (argv[index + 1] || 'production') : 'production';
}

function validateAndroidSubmitProfile(profile, options = {}) {
  const expectedTrack = options.expectedTrack || 'internal';
  const expectedReleaseStatus = options.expectedReleaseStatus || 'draft';
  assert('Android submit profile exists', !!profile);
  assert(`Android submit track is ${expectedTrack}`, profile.track === expectedTrack, profile.track);
  assert(`Android release status starts as ${expectedReleaseStatus}`, profile.releaseStatus === expectedReleaseStatus, profile.releaseStatus);
  assert('Android service account key path is configured', !isPlaceholder(profile.serviceAccountKeyPath), profile.serviceAccountKeyPath);

  const rootDir = options.rootDir || root;
  const serviceAccountPath = path.isAbsolute(profile.serviceAccountKeyPath)
    ? profile.serviceAccountKeyPath
    : path.join(rootDir, 'apps', 'mobile', profile.serviceAccountKeyPath);
  assert(
    'Android service account key file exists',
    fs.existsSync(serviceAccountPath),
    serviceAccountPath,
  );
  return { serviceAccountPath };
}

function validateIosSubmitProfile(profile, env = process.env, options = {}) {
  assert('iOS submit profile exists', !!profile);
  const ascAppId = env.EXPO_ASC_APP_ID || profile.ascAppId;
  const appleTeamId = env.EXPO_APPLE_TEAM_ID || profile.appleTeamId;
  const appleId = env.EXPO_APPLE_ID || profile.appleId;
  const ascApiKeyPathValue = env.EXPO_ASC_API_KEY_PATH || profile.ascApiKeyPath;
  const ascApiKeyIssuerId = env.EXPO_ASC_API_KEY_ISSUER_ID || profile.ascApiKeyIssuerId;
  const ascApiKeyId = env.EXPO_ASC_API_KEY_ID || profile.ascApiKeyId;
  assert('iOS App Store Connect app id is configured', !isPlaceholder(ascAppId), ascAppId);
  assert('iOS Apple team id is configured', !isPlaceholder(appleTeamId), appleTeamId);
  assert('iOS Apple id is configured', !isPlaceholder(appleId), appleId);

  const rootDir = options.rootDir || root;
  const ascApiKeyPath = ascApiKeyPathValue
    ? (path.isAbsolute(ascApiKeyPathValue)
      ? ascApiKeyPathValue
      : path.join(rootDir, 'apps', 'mobile', ascApiKeyPathValue))
    : '';
  const hasAscApiKey = !!ascApiKeyPath
    && fs.existsSync(ascApiKeyPath)
    && !isPlaceholder(ascApiKeyIssuerId)
    && !isPlaceholder(ascApiKeyId);
  const hasAppSpecificPassword = !!(env.EXPO_APPLE_APP_SPECIFIC_PASSWORD || '').trim();

  assert(
    'iOS submit auth is configured',
    hasAscApiKey || hasAppSpecificPassword,
    'set EXPO_APPLE_APP_SPECIFIC_PASSWORD or configure ascApiKeyPath/ascApiKeyIssuerId/ascApiKeyId',
  );
  return { ascApiKeyPath, hasAscApiKey, hasAppSpecificPassword, ascAppId, appleTeamId, appleId };
}

function validateMobileSubmitProfile(platform, options = {}) {
  assert('Submit platform is android or ios', platform === 'android' || platform === 'ios', platform || 'missing');
  const easConfig = options.easConfig || readJson('apps/mobile/eas.json');
  const profileName = options.profileName || 'production';
  const profile = easConfig.submit?.[profileName]?.[platform];
  const expectedTrack = options.expectedTrack || (profileName === 'public' ? 'production' : 'internal');
  return platform === 'android'
    ? validateAndroidSubmitProfile(profile, { ...options, expectedTrack })
    : validateIosSubmitProfile(profile, options.env || process.env, options);
}

function runCloudReleaseGate() {
  process.env.LEWORD_MOBILE_RELEASE_ENV = 'production';
  require('./mobile-cloud-release-gate');
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const platform = parsePlatform(argv);
  const profileName = parseProfile(argv);
  runCloudReleaseGate();
  validateMobileSubmitProfile(platform, { profileName });
  console.log(`[mobile-submit-gate] ${platform}:${profileName} passed`);
}

module.exports = {
  isPlaceholder,
  validateAndroidSubmitProfile,
  validateIosSubmitProfile,
  validateMobileSubmitProfile,
  parseProfile,
};
