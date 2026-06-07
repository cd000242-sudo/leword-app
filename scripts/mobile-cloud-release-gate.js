const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

process.env.LEWORD_MOBILE_RELEASE_ENV = 'production';
require('./mobile-release-gate');

const root = path.join(__dirname, '..');
const mobileRoot = path.join(root, 'apps', 'mobile');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function assert(name, condition, detail = '') {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.timeout || 60000,
  });
  return {
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

function easWhoami() {
  if ((process.env.EXPO_TOKEN || '').trim()) {
    return { ok: true, detail: 'EXPO_TOKEN provided' };
  }
  const result = run(
    'node',
    ['scripts/run-mobile-command.js', '--cwd', 'apps/mobile', '--', 'npx', 'eas-cli', 'whoami'],
    { cwd: root, timeout: 120000 },
  );
  return {
    ok: result.status === 0,
    detail: result.stdout || result.stderr || 'EAS whoami failed',
  };
}

const appConfig = readJson('apps/mobile/app.json');
const easProjectId = (
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID
  || appConfig.expo?.extra?.eas?.projectId
  || ''
).trim();
const androidExportMetadata = path.join(mobileRoot, '.expo-export', 'android', 'metadata.json');

assert(
  'Cloud release has Expo project id for push tokens',
  !!easProjectId,
  'set EXPO_PUBLIC_EAS_PROJECT_ID or add expo.extra.eas.projectId after EAS project creation',
);
assert(
  'Cloud release has Android JS export artifact',
  fs.existsSync(androidExportMetadata),
  'run `npm run mobile:export:android` before EAS build',
);

const auth = easWhoami();
assert(
  'Cloud release has EAS auth',
  auth.ok,
  'run `npm run mobile:eas:whoami` or set EXPO_TOKEN before building',
);

console.log('[mobile-cloud-release-gate] passed');
