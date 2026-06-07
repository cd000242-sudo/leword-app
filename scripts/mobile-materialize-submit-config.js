const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function applyIfPresent(target, key, value, changes, labelPrefix = 'ios') {
  const normalized = String(value || '').trim();
  if (!normalized) return;
  if (target[key] !== normalized) {
    target[key] = normalized;
    changes.push(`${labelPrefix}.${key}`);
  }
}

function writeGooglePlayServiceAccount(rootDir, easConfig, env, changes, profileName = 'production') {
  const encoded = String(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64 || '').trim();
  if (!encoded) return null;

  const android = easConfig.submit?.[profileName]?.android;
  if (!android) return null;
  const relativePath = android?.serviceAccountKeyPath || './credentials/google-play-service-account.json';
  const serviceAccountPath = path.isAbsolute(relativePath)
    ? relativePath
    : path.join(rootDir, 'apps', 'mobile', relativePath);
  fs.mkdirSync(path.dirname(serviceAccountPath), { recursive: true });
  fs.writeFileSync(serviceAccountPath, Buffer.from(encoded, 'base64').toString('utf8'), 'utf8');
  changes.push(`${profileName}.android.serviceAccountKeyPath.file`);
  return serviceAccountPath;
}

function resolveMobileCredentialPath(rootDir, relativePath) {
  return path.isAbsolute(relativePath)
    ? relativePath
    : path.join(rootDir, 'apps', 'mobile', relativePath);
}

function writeAscApiKey(rootDir, easConfig, env, changes, profileName = 'production') {
  const encoded = String(env.EXPO_ASC_API_KEY_P8_B64 || '').trim();
  if (!encoded) return null;

  const ios = easConfig.submit?.[profileName]?.ios;
  if (!ios) return null;

  const relativePath = String(env.EXPO_ASC_API_KEY_PATH || ios.ascApiKeyPath || './credentials/app-store-connect-api-key.p8').trim();
  const apiKeyPath = resolveMobileCredentialPath(rootDir, relativePath);
  fs.mkdirSync(path.dirname(apiKeyPath), { recursive: true });
  fs.writeFileSync(apiKeyPath, Buffer.from(encoded, 'base64').toString('utf8'), 'utf8');

  if (ios.ascApiKeyPath !== relativePath) {
    ios.ascApiKeyPath = relativePath;
    changes.push(`${profileName}.ios.ascApiKeyPath`);
  }

  changes.push(`${profileName}.ios.ascApiKeyPath.file`);
  return apiKeyPath;
}

function applyIosEnvToProfile(easConfig, env, changes, profileName) {
  const ios = easConfig.submit?.[profileName]?.ios;
  if (!ios) return;
  applyIfPresent(ios, 'appleId', env.EXPO_APPLE_ID, changes, `${profileName}.ios`);
  applyIfPresent(ios, 'ascAppId', env.EXPO_ASC_APP_ID, changes, `${profileName}.ios`);
  applyIfPresent(ios, 'appleTeamId', env.EXPO_APPLE_TEAM_ID, changes, `${profileName}.ios`);
  applyIfPresent(ios, 'ascApiKeyPath', env.EXPO_ASC_API_KEY_PATH, changes, `${profileName}.ios`);
  applyIfPresent(ios, 'ascApiKeyIssuerId', env.EXPO_ASC_API_KEY_ISSUER_ID, changes, `${profileName}.ios`);
  applyIfPresent(ios, 'ascApiKeyId', env.EXPO_ASC_API_KEY_ID, changes, `${profileName}.ios`);
}

function materializeMobileSubmitConfig(options = {}) {
  const rootDir = options.rootDir || root;
  const env = options.env || process.env;
  const easPath = options.easPath || path.join(rootDir, 'apps', 'mobile', 'eas.json');
  const easConfig = options.easConfig || readJson(easPath);
  const changes = [];

  const profileNames = ['production', 'public'];
  profileNames.forEach((profileName) => applyIosEnvToProfile(easConfig, env, changes, profileName));

  const serviceAccountPaths = profileNames
    .map((profileName) => writeGooglePlayServiceAccount(rootDir, easConfig, env, changes, profileName))
    .filter(Boolean);
  const ascApiKeyPaths = profileNames
    .map((profileName) => writeAscApiKey(rootDir, easConfig, env, changes, profileName))
    .filter(Boolean);

  if (options.write !== false) {
    writeJson(easPath, easConfig);
  }

  return {
    ok: true,
    easPath,
    changes,
    serviceAccountPath: serviceAccountPaths[0] || null,
    serviceAccountPaths,
    ascApiKeyPath: ascApiKeyPaths[0] || null,
    ascApiKeyPaths,
  };
}

if (require.main === module) {
  const report = materializeMobileSubmitConfig();
  console.log(JSON.stringify(report, null, 2));
}

module.exports = {
  materializeMobileSubmitConfig,
};
