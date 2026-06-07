const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function check(name, ok, detail, severity = 'required') {
  return { name, ok: !!ok, detail, severity };
}

function summarize(checks) {
  return {
    passed: checks.filter((item) => item.ok).length,
    failedRequired: checks.filter((item) => !item.ok && item.severity === 'required').length,
  };
}

function collectMobileApiDeployGate() {
  const rootPackage = readJson('package.json');
  const apiPackage = readJson('apps/api/package.json');
  const dockerfile = exists('apps/api/Dockerfile') ? read('apps/api/Dockerfile') : '';
  const dockerignore = exists('.dockerignore') ? read('.dockerignore') : '';
  const envExample = exists('apps/api/.env.production.example') ? read('apps/api/.env.production.example') : '';
  const readme = exists('apps/api/README.md') ? read('apps/api/README.md') : '';
  const productionCompose = exists('apps/api/docker-compose.production.yml')
    ? read('apps/api/docker-compose.production.yml')
    : '';
  const releaseWorkflow = exists('.github/workflows/mobile-release.yml')
    ? read('.github/workflows/mobile-release.yml')
    : '';

  const requiredEnv = [
    'NAVER_CLIENT_ID',
    'NAVER_CLIENT_SECRET',
    'NAVER_SEARCH_AD_ACCESS_LICENSE',
    'NAVER_SEARCH_AD_SECRET_KEY',
    'NAVER_SEARCH_AD_CUSTOMER_ID',
    'LEWORD_MOBILE_ENTITLEMENT_URL',
    'LEWORD_MOBILE_CACHE_FILE',
    'LEWORD_MOBILE_PREWARM_INTERVAL_MINUTES',
    'LEWORD_MOBILE_PUSH_PROVIDER',
    'LEWORD_MOBILE_MAX_BODY_BYTES',
    'LEWORD_MOBILE_RATE_LIMIT_PER_MINUTE',
  ];

  const checks = [
    check('API production start script exists',
      apiPackage.scripts?.['start:prod'] === 'node -r ts-node/register/transpile-only src/server.ts',
      'apps/api/package.json start:prod'),
    check('Root API production start script exists',
      rootPackage.scripts?.['api:start:prod'] === 'npm --prefix apps/api run start:prod',
      'package.json api:start:prod'),
    check('Mobile API deploy gate script is registered',
      rootPackage.scripts?.['mobile:api-deploy-gate'] === 'node scripts/mobile-api-deploy-gate.js',
      'package.json mobile:api-deploy-gate'),
    check('Mobile API docker build script is registered',
      /docker build -f apps\/api\/Dockerfile -t leword-mobile-api:latest \./.test(rootPackage.scripts?.['mobile:api:docker:build'] || ''),
      'package.json mobile:api:docker:build'),
    check('API Dockerfile exists', !!dockerfile, 'apps/api/Dockerfile'),
    check('API Dockerfile uses Node 22',
      /FROM node:22-bookworm-slim/.test(dockerfile),
      'Node 22 keeps mobile runtime aligned with Expo SDK 56 tooling'),
    check('API Dockerfile installs system Chromium',
      /apt-get install[\s\S]*chromium/.test(dockerfile) && /LEWORD_CHROME_PATH=\/usr\/bin\/chromium/.test(dockerfile),
      'server-side browser work needs a deterministic Chromium path'),
    check('API Dockerfile skips browser postinstall downloads',
      /PUPPETEER_SKIP_DOWNLOAD=true/.test(dockerfile) && /PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1/.test(dockerfile),
      'container should use the packaged system Chromium path'),
    check('API Dockerfile runs production API command',
      /npm", "--prefix", "apps\/api", "run", "start:prod"/.test(dockerfile),
      'container CMD must start the API worker'),
    check('API Dockerfile exposes healthcheck',
      /HEALTHCHECK/.test(dockerfile) && /\/health/.test(dockerfile),
      'container orchestration must detect broken workers'),
    check('Production compose file exists',
      !!productionCompose,
      'apps/api/docker-compose.production.yml'),
    check('Production compose pulls GHCR API image',
      /\$\{LEWORD_MOBILE_API_IMAGE/.test(productionCompose)
        && /ghcr\.io/.test(productionCompose)
        && /leword-mobile-api/.test(productionCompose),
      'server deployment should pull the CI-published API image'),
    check('Production compose uses persistent cache volume',
      /LEWORD_MOBILE_CACHE_FILE:\s*\/data\/mobile-cache\.json/.test(productionCompose)
        && /leword-mobile-cache:\/data/.test(productionCompose),
      'mobile cache must survive container restarts'),
    check('Production compose loads env file and healthcheck',
      /env_file:/.test(productionCompose)
        && /\.env\.production/.test(productionCompose)
        && /health/.test(productionCompose),
      'compose deployment must use production env and health monitoring'),
    check('CI workflow publishes API image to GHCR',
      /docker login \$\{\{ env\.REGISTRY \}\}/.test(releaseWorkflow)
        && /docker push "\$\{IMAGE_NAME\}:\$\{GITHUB_SHA\}"/.test(releaseWorkflow)
        && /docker push "\$\{IMAGE_NAME\}:latest"/.test(releaseWorkflow)
        && /mobile-api-image\.txt/.test(releaseWorkflow),
      '.github/workflows/mobile-release.yml api-image job'),
    check('Docker ignore protects release credentials',
      /apps\/mobile\/credentials\/\*/.test(dockerignore) && /node_modules/.test(dockerignore),
      '.dockerignore should keep secrets and local modules out of the image context'),
    check('Production API env example covers required runtime keys',
      requiredEnv.every((name) => envExample.includes(name)),
      'apps/api/.env.production.example'),
    check('API README documents container deployment',
      /mobile:api:docker:build/.test(readme)
        && /LEWORD_CHROME_PATH=\/usr\/bin\/chromium/.test(readme)
        && /docker-compose\.production\.yml/.test(readme)
        && /mobile-api-image-reference/.test(readme),
      'apps/api/README.md'),
  ];

  const summary = summarize(checks);
  return {
    generatedAt: new Date().toISOString(),
    ok: summary.failedRequired === 0,
    summary,
    checks,
    blockers: checks.filter((item) => !item.ok),
  };
}

if (require.main === module) {
  const report = collectMobileApiDeployGate();
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

module.exports = {
  collectMobileApiDeployGate,
};
