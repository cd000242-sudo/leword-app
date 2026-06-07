const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const mobileRoot = path.join(root, 'apps', 'mobile');

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.timeout || 30000,
  });
  return {
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

function parseNodeVersion(raw) {
  const match = String(raw || '').match(/^v?(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

function versionAtLeast(version, minimum) {
  if (!version) return false;
  for (let index = 0; index < minimum.length; index += 1) {
    if (version[index] > minimum[index]) return true;
    if (version[index] < minimum[index]) return false;
  }
  return true;
}

function nodeCandidatePaths() {
  const roots = [
    process.env.USERPROFILE,
    'C:\\Users\\박성현',
    'C:\\Users\\park',
  ].filter(Boolean);

  return [...new Set([
    process.env.LEWORD_MOBILE_NODE,
    ...roots.map((home) => path.join(
      home,
      '.cache',
      'codex-runtimes',
      'codex-primary-runtime',
      'dependencies',
      'node',
      'bin',
      'node.exe',
    )),
  ].filter(Boolean))];
}

function findMobileNode() {
  const current = {
    path: process.execPath,
    version: parseNodeVersion(process.version),
  };
  if (versionAtLeast(current.version, [22, 13, 0])) return current;

  for (const candidatePath of nodeCandidatePaths()) {
    if (!candidatePath || !fs.existsSync(candidatePath)) continue;
    const result = run(candidatePath, ['--version']);
    const version = parseNodeVersion(result.stdout);
    if (versionAtLeast(version, [22, 13, 0])) {
      return { path: candidatePath, version };
    }
  }
  return null;
}

function javaVersion() {
  const result = run('java', ['-version']);
  const raw = `${result.stdout}\n${result.stderr}`;
  const legacy = raw.match(/version "1\.(\d+)\./);
  if (legacy) return { raw: raw.trim(), major: Number(legacy[1]) };
  const modern = raw.match(/version "(\d+)\./);
  return { raw: raw.trim(), major: modern ? Number(modern[1]) : null };
}

function commandExists(command) {
  const result = run(process.platform === 'win32' ? 'where' : 'which', [command]);
  return result.status === 0;
}

function check(name, ok, detail, severity = 'required') {
  return { name, ok: !!ok, detail, severity };
}

function summarize(checks) {
  return {
    passed: checks.filter((item) => item.ok).length,
    failedRequired: checks.filter((item) => !item.ok && item.severity === 'required').length,
    failedOptional: checks.filter((item) => !item.ok && item.severity !== 'required').length,
  };
}

const mobileNode = findMobileNode();
const java = javaVersion();
const mobileAppConfig = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'app.json'), 'utf8'));
const rootPackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const mobileEasConfig = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'eas.json'), 'utf8'));
const easProjectId = (
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID
  || mobileAppConfig.expo?.extra?.eas?.projectId
  || ''
).trim();
const checks = [
  check('Expo SDK 56 package lock exists', exists('apps/mobile/package-lock.json'), 'apps/mobile/package-lock.json'),
  check('Expo dependency installed', exists('apps/mobile/node_modules/expo'), 'apps/mobile/node_modules/expo'),
  check('React Native dependency installed', exists('apps/mobile/node_modules/react-native'), 'apps/mobile/node_modules/react-native'),
  check('Expo Notifications dependency installed', exists('apps/mobile/node_modules/expo-notifications'), 'apps/mobile/node_modules/expo-notifications'),
  check('Expo Device dependency installed', exists('apps/mobile/node_modules/expo-device'), 'apps/mobile/node_modules/expo-device'),
  check('Android JS export exists', exists('apps/mobile/.expo-export/android/metadata.json'), 'npm run mobile:export:android'),
  check('Mobile Node >= 22.13 available', !!mobileNode, mobileNode ? `${mobileNode.path} v${mobileNode.version.join('.')}` : 'set LEWORD_MOBILE_NODE or install Node 22.13+'),
  check('EAS config exists', exists('apps/mobile/eas.json'), 'apps/mobile/eas.json'),
  check('Mobile API deploy gate exists', exists('scripts/mobile-api-deploy-gate.js') && !!rootPackage.scripts['mobile:api-deploy-gate'], 'npm run mobile:api-deploy-gate'),
  check('Mobile API Dockerfile exists', exists('apps/api/Dockerfile') && !!rootPackage.scripts['mobile:api:docker:build'], 'npm run mobile:api:docker:build'),
  check('Mobile API runtime gate script exists', exists('scripts/mobile-api-runtime-gate.js') && !!rootPackage.scripts['mobile:api-runtime-gate'], 'npm run mobile:api-runtime-gate'),
  check('Mobile deployed API smoke script exists', exists('scripts/mobile-api-smoke-test.js') && !!rootPackage.scripts['mobile:api-smoke'], 'npm run mobile:api-smoke'),
  check('Mobile API performance smoke script exists', exists('scripts/mobile-api-performance-smoke.js') && !!rootPackage.scripts['mobile:api-performance-smoke'], 'npm run mobile:api-performance-smoke'),
  check('Mobile UI release gate exists', exists('scripts/mobile-ui-release-gate.js') && !!rootPackage.scripts['mobile:ui-release-gate'], 'npm run mobile:ui-release-gate'),
  check('Mobile store compliance gate exists', exists('scripts/mobile-store-compliance-gate.js') && !!rootPackage.scripts['mobile:store-compliance'], 'npm run mobile:store-compliance'),
  check('Mobile store listing gate exists', exists('scripts/mobile-store-listing-gate.js') && !!rootPackage.scripts['mobile:store-listing'], 'npm run mobile:store-listing'),
  check('Mobile store assets gate exists', exists('scripts/mobile-store-assets-gate.js') && !!rootPackage.scripts['mobile:store-assets'], 'npm run mobile:store-assets'),
  check('Mobile store submission package script exists', exists('scripts/mobile-store-submission-package.js') && !!rootPackage.scripts['mobile:store-submission-package'], 'npm run mobile:store-submission-package'),
  check('Mobile launch SLA report script exists', exists('scripts/mobile-launch-sla-report.js') && !!rootPackage.scripts['mobile:launch-sla'], 'npm run mobile:launch-sla'),
  check('Mobile asset generator exists', exists('scripts/mobile-generate-assets.js') && !!rootPackage.scripts['mobile:assets:generate'], 'npm run mobile:assets:generate'),
  check('Mobile release audit script exists', exists('scripts/mobile-release-audit.js') && !!rootPackage.scripts['mobile:release-audit'], 'npm run mobile:release-audit'),
  check('Mobile release kit script exists', exists('scripts/mobile-release-kit.js') && !!rootPackage.scripts['mobile:release-kit'], 'npm run mobile:release-kit'),
  check('Mobile release dry-run script exists', exists('scripts/mobile-release-dry-run.js') && !!rootPackage.scripts['mobile:release-dry-run'], 'npm run mobile:release-dry-run'),
  check('Mobile release dispatch plan script exists', exists('scripts/mobile-release-dispatch-plan.js') && !!rootPackage.scripts['mobile:release-dispatch-plan'], 'npm run mobile:release-dispatch-plan'),
  check('Mobile release status script exists', exists('scripts/mobile-release-status.js') && !!rootPackage.scripts['mobile:release-status'], 'npm run mobile:release-status'),
  check('Mobile release secret scan script exists', exists('scripts/mobile-release-secret-scan.js') && !!rootPackage.scripts['mobile:release-secret-scan'], 'npm run mobile:release-secret-scan'),
  check('Mobile public release gate script exists',
    exists('scripts/mobile-public-release-gate.js')
      && !!rootPackage.scripts['mobile:public-release-gate']
      && !!rootPackage.scripts['mobile:public-release-gate:android']
      && !!rootPackage.scripts['mobile:public-release-gate:android:save'],
    'npm run mobile:public-release-gate / npm run mobile:public-release-gate:android'),
  check('Cloud release gate script exists', exists('scripts/mobile-cloud-release-gate.js') && !!rootPackage.scripts['mobile:release-gate:cloud'], 'npm run mobile:release-gate:cloud'),
  check('Mobile CI secrets gate script exists', exists('scripts/mobile-ci-secrets-gate.js') && !!rootPackage.scripts['mobile:ci-secrets-gate'], 'npm run mobile:ci-secrets-gate'),
  check('Mobile submit gate script exists', exists('scripts/mobile-submit-gate.js') && !!rootPackage.scripts['mobile:submit-gate:android'] && !!rootPackage.scripts['mobile:submit-gate:ios'], 'npm run mobile:submit-gate:android / npm run mobile:submit-gate:ios'),
  check('Android submit profile exists', !!mobileEasConfig.submit?.production?.android?.track, 'apps/mobile/eas.json submit.production.android'),
  check('iOS submit profile exists', !!mobileEasConfig.submit?.production?.ios?.ascAppId, 'apps/mobile/eas.json submit.production.ios'),
  check('Production API env example exists', exists('apps/api/.env.production.example'), 'apps/api/.env.production.example'),
  check('Production mobile env example exists', exists('apps/mobile/.env.production.example'), 'apps/mobile/.env.production.example'),
  check('Mobile store listing manifest exists', exists('docs/mobile-store-listing.json'), 'docs/mobile-store-listing.json'),
  check('Mobile store assets manifest exists', exists('docs/mobile-store-assets.json'), 'docs/mobile-store-assets.json'),
  check('Mobile icon asset exists', exists('apps/mobile/assets/icon.png'), 'npm run mobile:assets:generate'),
  check('Mobile store screenshots exist', exists('apps/mobile/assets/store/screenshots/01-category-hunt.png'), 'npm run mobile:assets:generate'),
  check('Mobile release runbook exists', exists('docs/mobile-release-runbook.md'), 'docs/mobile-release-runbook.md'),
  check('Mobile release workflow exists', exists('.github/workflows/mobile-release.yml'), '.github/workflows/mobile-release.yml'),
  check('Expo push project id available', !!easProjectId, 'set EXPO_PUBLIC_EAS_PROJECT_ID or run an EAS project build', 'external'),
  check('Docker CLI available for API image build', commandExists('docker'), 'install Docker Desktop or build the API image in CI', 'external'),
  check('Android SDK env exists', !!(process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT), 'set ANDROID_HOME or ANDROID_SDK_ROOT', 'external'),
  check('adb available', commandExists('adb'), 'install Android platform-tools', 'external'),
  check('sdkmanager available', commandExists('sdkmanager'), 'install Android command-line tools', 'external'),
  check('JDK 17+ available for local Android build', !!java.major && java.major >= 17, java.raw || 'install JDK 17+', 'external'),
];

const summary = summarize(checks);
const report = {
  generatedAt: new Date().toISOString(),
  summary,
  checks,
  blockers: checks.filter((item) => !item.ok),
  nextCommands: {
    localValidation: [
      'npm run verify:all',
      'npm run mobile:doctor',
      'npm run mobile:audit',
      'npm run mobile:export:android',
      'npm run mobile:api-deploy-gate',
      'npm run mobile:api:docker:build',
      'npm run mobile:store-compliance',
      'npm run mobile:store-listing',
      'npm run mobile:assets:generate',
      'npm run mobile:store-assets',
      'npm run mobile:store-submission-package:save',
      'npm run mobile:launch-sla:save',
      'npm run mobile:api-runtime-gate',
      'npm run mobile:api-performance-smoke:save',
      'npm run mobile:ui-release-gate:save',
      'npm run mobile:release-audit:save',
      'npm run mobile:release-kit:save',
      'npm run mobile:release-dry-run:save',
      'npm run mobile:release-dispatch-plan:save',
      'npm run mobile:release-status:save',
      'npm run mobile:release-secret-scan:save',
      'npm run mobile:public-release-gate:save',
      'npm run mobile:public-release-gate:android:save',
      'npm run mobile:public-release-gate:android',
      'open docs/mobile-release-runbook.md',
    ],
    cloudApk: [
      'set EXPO_PUBLIC_LEWORD_API_URL=https://api.leword.app',
      'set EXPO_PUBLIC_EAS_PROJECT_ID=<your-eas-project-id>',
      'set LEWORD_MOBILE_ENTITLEMENT_URL=https://api.leword.app/mobile/entitlement',
      'set LEWORD_MOBILE_PREWARM_INTERVAL_MINUTES=15',
      'set LEWORD_MOBILE_PUSH_PROVIDER=expo',
      'npm run mobile:eas:whoami',
      'npm run mobile:api-deploy-gate',
      'npm run mobile:release-gate:cloud',
      'npm run mobile:build:android:internal',
      'npm run mobile:build:android:production',
      'npm run mobile:submit:android:internal',
      'npm run mobile:api-smoke',
      'npm run mobile:api-performance-smoke:save',
    ],
  },
};

console.log(JSON.stringify(report, null, 2));
process.exit(summary.failedRequired > 0 ? 1 : 0);
