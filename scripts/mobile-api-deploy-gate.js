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
  const workerEnvExample = exists('apps/api/.env.live-golden-worker.production.example')
    ? read('apps/api/.env.live-golden-worker.production.example')
    : '';
  const readme = exists('apps/api/README.md') ? read('apps/api/README.md') : '';
  const productionCompose = exists('apps/api/docker-compose.production.yml')
    ? read('apps/api/docker-compose.production.yml')
    : '';
  const releaseWorkflow = exists('.github/workflows/mobile-release.yml')
    ? read('.github/workflows/mobile-release.yml')
    : '';
  const restartWorkflow = exists('.github/workflows/api-production-restart.yml')
    ? read('.github/workflows/api-production-restart.yml')
    : '';
  const volumeInitializer = exists('apps/api/scripts/initialize-production-volumes.js')
    ? read('apps/api/scripts/initialize-production-volumes.js')
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
    'LEWORD_WEB_SESSION_SECRET',
    'LEWORD_ADMIN_LOGIN_ID',
    'LEWORD_ADMIN_LOGIN_PASSWORD_SHA256',
    'LEWORD_MOBILE_LIVE_GOLDEN_REVIEW_PANEL_LOGIN_URL',
    'LEWORD_MOBILE_LIVE_GOLDEN_BOARD_TARGET',
    'LEWORD_MOBILE_LIVE_GOLDEN_HEARTBEAT_FILE',
    'LEWORD_MOBILE_LIVE_GOLDEN_REVIEW_COHORT_FILE',
    'LEWORD_MOBILE_PHASE2_ENTRY_CERTIFICATE_FILE',
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
    check('API Dockerfile runs as non-root with writable mount roots',
      /RUN install -d -o node -g node \/data \/review \/golden \/briefing \/searchad \/quota/.test(dockerfile)
        && /chmod 700 \/data \/review \/golden \/briefing \/searchad \/quota/.test(dockerfile)
        && /USER node/.test(dockerfile)
        && dockerfile.indexOf('USER node') < dockerfile.indexOf('CMD ['),
      'the shared API/worker image must not retain root at runtime'),
    check('Production compose file exists',
      !!productionCompose,
      'apps/api/docker-compose.production.yml'),
    check('Production compose pulls GHCR API image',
      (productionCompose.match(/image:\s*\$\{LEWORD_MOBILE_API_IMAGE:\?[^}]+\}/g) || []).length === 3
        && !/leword-mobile-api:latest/.test(productionCompose),
      'initializer and runtime services must require the workflow-pinned immutable API image'),
    check('Production compose uses persistent cache volume',
      /LEWORD_MOBILE_CACHE_FILE:\s*\/data\/mobile-cache\.json/.test(productionCompose)
        && /leword-mobile-cache:\/data/.test(productionCompose),
      'mobile cache must survive container restarts'),
    check('Production compose loads env file and healthcheck',
      /env_file:/.test(productionCompose)
        && /\.env\.production/.test(productionCompose)
        && /health/.test(productionCompose),
      'compose deployment must use production env and health monitoring'),
    check('Production compose isolates review artifacts and worker secrets',
      /leword-review-artifacts:\/review/.test(productionCompose)
        && /leword-review-artifacts:\/review:ro/.test(productionCompose)
        && /leword-live-golden-data:\/golden:ro/.test(productionCompose)
        && /leword-live-golden-data:\/golden/.test(productionCompose)
        && !/leword-live-golden-worker:[\s\S]*leword-mobile-cache:\/data(?:\s|$)/m.test(productionCompose)
        && (productionCompose.match(/leword-searchad-accounts:\/searchad:ro/g) || []).length === 2
        && /\.env\.live-golden-worker\.production/.test(productionCompose)
        && /leword-volume-init:[\s\S]*network_mode:\s*none/.test(productionCompose)
        && /initialize-production-volumes\.js/.test(productionCompose)
        && /live-golden-review-cohort\.json\.audit/.test(volumeInitializer)
        && /audit artifact conflict/.test(volumeInitializer)
        && /migrateLatestLiveGoldenArtifact/.test(volumeInitializer)
        && /migrateSearchAdAccountPool/.test(volumeInitializer),
      'API-private data, live-golden state, review artifacts, and SearchAd credentials use least-privilege volumes'),
    check('Production compose shares reviewed briefing through a dedicated read-only worker mount',
      (productionCompose.match(/LEWORD_MOBILE_HOME_KEYWORD_BRIEFING_FILE:\s*\/briefing\/home-keyword-briefing\.json/g) || []).length === 2
        && /leword-volume-init:[\s\S]*leword-home-keyword-briefing:\/briefing(?:\s|$)/m.test(productionCompose)
        && /leword-api:[\s\S]*leword-home-keyword-briefing:\/briefing(?:\s|$)/m.test(productionCompose)
        && /leword-live-golden-worker:[\s\S]*leword-home-keyword-briefing:\/briefing:ro(?:\s|$)/m.test(productionCompose)
        && !/leword-live-golden-worker:[\s\S]*leword-mobile-cache:\/data(?:\s|$)/m.test(productionCompose)
        && /migrateHomeKeywordBriefingArtifact/.test(volumeInitializer)
        && /home keyword briefing target changed after rollback bridge/.test(volumeInitializer),
      'human-reviewed discovery input must survive forward/rollback without exposing API-private /data'),
    check('Production compose shares a persistent least-privilege quota ledger',
      (productionCompose.match(/LEWORD_SEARCHAD_QUOTA_STATE_FILE:\s*\/quota\/searchad-quota-state\.json/g) || []).length === 2
        && (productionCompose.match(/LEWORD_NAVER_OPENAPI_QUOTA_STATE_FILE:\s*\/quota\/naver-openapi-quota-state\.json/g) || []).length === 2
        && (productionCompose.match(/leword-measurement-quota:\/quota(?:\s|$)/gm) || []).length === 3
        && /leword-volume-init:[\s\S]*LEWORD_VOLUME_INIT_MODE:\s*forward/.test(productionCompose)
        && /synchronizeQuotaStateArtifacts/.test(volumeInitializer),
      'API and worker must not split or reset SearchAd/OpenAPI quota state across restarts'),
    check('CI workflow publishes API image to GHCR',
      /docker login \$\{\{ env\.REGISTRY \}\}/.test(releaseWorkflow)
        && /API_IMAGE_REPOSITORY:\s*leword-mobile-api/.test(releaseWorkflow)
        && /docker push "\$\{IMAGE_NAME\}:\$\{GITHUB_SHA\}"/.test(releaseWorkflow)
        && /docker buildx imagetools inspect "\$\{IMAGE_NAME\}:\$\{GITHUB_SHA\}" > "\$descriptor_output"/.test(releaseWorkflow)
        && /descriptor_digests/.test(releaseWorkflow)
        && /RepoDigests/.test(releaseWorkflow)
        && !/sha256sum "\$manifest_raw"/.test(releaseWorkflow)
        && /mobile-api-image-manifest\.js write/.test(releaseWorkflow)
        && /mobile-api-image-manifest\.json/.test(releaseWorkflow)
        && !/docker push "\$\{IMAGE_NAME\}:latest"/.test(releaseWorkflow),
      '.github/workflows/mobile-release.yml api-image job'),
    check('Production restart workflow checks out repository',
      /uses:\s*actions\/checkout@v4/.test(restartWorkflow)
        && /persist-credentials:\s*false/.test(restartWorkflow)
        && restartWorkflow.indexOf('actions/checkout@v4') < restartWorkflow.indexOf('scp_cmd='),
      'the checked-in compose definition must exist before scp'),
    check('Production restart workflow serializes deployment transactions',
      /concurrency:\s*\n\s*group:\s*leword-production-api/.test(restartWorkflow)
        && /cancel-in-progress:\s*false/.test(restartWorkflow)
        && /environment:\s*production/.test(restartWorkflow)
        && /flock\s+-n\s+9/.test(restartWorkflow)
        && /transaction_id="\$\{EXPECTED_BUILD_SHA\}-\$\{SOURCE_BUILD_RUN_ID\}-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}"/.test(restartWorkflow)
        && /transaction_dir/.test(restartWorkflow)
        && /deploy_succeeded=false/.test(restartWorkflow)
        && /assert_no_prior_rollback_journal/.test(restartWorkflow)
        && /\.env\.live-golden-worker\.production/.test(restartWorkflow)
        && /unexpected_worker_env_keys/.test(restartWorkflow)
        && /Worker env contains non-minimal keys/.test(restartWorkflow)
        && /"\$\{compose\[@\]\}" -f "\$compose_preflight" config/.test(restartWorkflow)
        && restartWorkflow.indexOf('pull leword-volume-init leword-api leword-live-golden-worker')
          < restartWorkflow.indexOf("printf 'schema_version=leword-production-rollback-v1")
        && /preflight_expected_image_id/.test(restartWorkflow)
        && /deploy_expected_image_id/.test(restartWorkflow)
        && /docker image rm "\$rollback_api_ref" "\$rollback_worker_ref"/.test(restartWorkflow)
        && /trap 'on_deploy_exit' EXIT/.test(restartWorkflow)
        && /trap 'exit 129' HUP/.test(restartWorkflow)
        && /trap 'exit 130' INT/.test(restartWorkflow)
        && /trap 'exit 143' TERM/.test(restartWorkflow),
      'GitHub and the production host must allow only one signal-safe transaction at a time'),
    check('Production restart workflow pins current-main immutable manifest digest',
      !/^\s{6}(?:image|image_sha|remote_path|compose_file|bind_port):/m.test(restartWorkflow)
        && /actions:\s*read/.test(restartWorkflow)
        && /getBranch\([\s\S]*branch:\s*['"]main['"]/.test(restartWorkflow)
        && /mobile-release\.yml/.test(restartWorkflow)
        && /Build and publish production API image/.test(restartWorkflow)
        && /mobile-api-image-manifest\.js validate/.test(restartWorkflow)
        && /IMAGE_REPOSITORY:\s*ghcr\.io\/cd000242-sudo\/leword-mobile-api/.test(restartWorkflow)
        && /REMOTE_PATH:\s*\/opt\/leword-app/.test(restartWorkflow)
        && /COMPOSE_FILE:\s*apps\/api\/docker-compose\.production\.yml/.test(restartWorkflow)
        && /BIND_PORT:\s*['"]?34983['"]?/.test(restartWorkflow)
        && /\^sha256:\[0-9a-f\]\{64\}\$/.test(restartWorkflow)
        && /@\$\{EXPECTED_MANIFEST_DIGEST\}/.test(restartWorkflow)
        && /RepoDigests/.test(restartWorkflow),
      'production must reject stale builds, mutable images, arbitrary repositories, paths, and ports'),
    check('Production restart workflow pins SSH trust and protects registry token',
      /LEWORD_PROD_SSH_KNOWN_HOSTS secret is required/.test(restartWorkflow)
        && /LEWORD_PROD_SSH_HOST contains unsafe characters/.test(restartWorkflow)
        && /LEWORD_PROD_SSH_USER contains unsafe characters/.test(restartWorkflow)
        && !/ssh-keyscan/.test(restartWorkflow)
        && /docker login ghcr\.io[^\n]*--password-stdin/.test(restartWorkflow)
        && !/GHCR_TOKEN=\$\{GHCR_TOKEN@Q\}/.test(restartWorkflow)
        && !/GHCR_TOKEN=[^\n]*bash -s/.test(restartWorkflow),
      'known_hosts must be pre-pinned and the registry token must never enter remote argv'),
    check('Production restart workflow verifies deployed revision',
      /expected_image_id/.test(restartWorkflow)
        && /api_image_id/.test(restartWorkflow)
        && /worker_image_id/.test(restartWorkflow)
        && /\$api_image_id" = "\$expected_image_id/.test(restartWorkflow)
        && /\$worker_image_id" = "\$expected_image_id/.test(restartWorkflow)
        && /HEALTH_TIMEOUT_SECONDS:\s*['"]?(?:1[2-9]\d|[2-9]\d{2,})['"]?/.test(restartWorkflow)
        && /runtime_required_ready/.test(restartWorkflow)
        && /transientRuntimeCodes/.test(restartWorkflow)
        && /phase2_ready/.test(restartWorkflow)
        && /reviewStorage\.configured === true/.test(restartWorkflow)
        && /reviewStorage\.readable === true/.test(restartWorkflow)
        && /reviewStorage\.writable === true/.test(restartWorkflow)
        && /reviewAuthConfigured === true/.test(restartWorkflow)
        && /reviewAuth\.ready === true/.test(restartWorkflow)
        && /reviewAuth\.signingSecretConfigured === true/.test(restartWorkflow)
        && /reviewAuth\.configuredAdmin === true/.test(restartWorkflow)
        && /reviewAuth\.strictProviderConfigured === true/.test(restartWorkflow)
        && /review_auth_ready/.test(restartWorkflow)
        && /heartbeat\.startedAt/.test(restartWorkflow)
        && /heartbeat\.updatedAt/.test(restartWorkflow)
        && /heartbeat\.status === "running"/.test(restartWorkflow)
        && /worker\.healthy === true/.test(restartWorkflow)
        && /worker\.stale === false/.test(restartWorkflow)
        && /heartbeat_change_count/.test(restartWorkflow)
        && /worker_started_after_deploy/.test(restartWorkflow)
        && /deploy_epoch_ms/.test(restartWorkflow)
        && /phase2\.state/.test(restartWorkflow)
        && !/runtime_ok/.test(restartWorkflow)
        && !/health\.runtime\.ok === true/.test(restartWorkflow),
      'service health, worker heartbeat, Phase 2 storage readiness, and pulled image ID must pass'),
    check('Production restart workflow rolls back failed deploy',
      /rollback_deploy\(\)/.test(restartWorkflow)
        && /previous_api_image_id/.test(restartWorkflow)
        && /previous_worker_image_id/.test(restartWorkflow)
        && /docker image tag "\$previous_api_image_id" "\$rollback_api_ref"/.test(restartWorkflow)
        && /docker image tag "\$previous_worker_image_id" "\$rollback_worker_ref"/.test(restartWorkflow)
        && /atomic_restore_compose/.test(restartWorkflow)
        && /validate_rollback_journal/.test(restartWorkflow)
        && /rollback_api_health/.test(restartWorkflow)
        && /rollback_worker_health/.test(restartWorkflow)
        && /rollback_service_ok/.test(restartWorkflow)
        && /rollback_worker_started_after_restart/.test(restartWorkflow)
        && /rollback_api_image_id/.test(restartWorkflow)
        && /rollback_worker_image_id/.test(restartWorkflow)
        && /run --rm --no-deps -e LEWORD_VOLUME_INIT_MODE=rollback leword-volume-init/.test(restartWorkflow)
        && /assert_no_running_project_writers/.test(restartWorkflow)
        && /label=com\.docker\.compose\.project=\$\{compose_project_name\}/.test(restartWorkflow)
        && /ROLLBACK FAILED/.test(restartWorkflow)
        && /retaining transaction artifacts/.test(restartWorkflow),
      'failed deploys must restore and health-check both exact prior image IDs'),
    check('Production restart workflow pulls image and checks health',
      /LEWORD_PROD_SSH_HOST/.test(restartWorkflow)
        && /LEWORD_PROD_SSH_USER/.test(restartWorkflow)
        && /LEWORD_PROD_SSH_KEY/.test(restartWorkflow)
        && /LEWORD_PROD_SSH_PASSWORD/.test(restartWorkflow)
        && /sshpass/.test(restartWorkflow)
        && /docker compose/.test(restartWorkflow)
        && /scp_cmd=/.test(restartWorkflow)
        && /pull leword-volume-init leword-api leword-live-golden-worker/.test(restartWorkflow)
        && /run --rm --no-deps leword-volume-init/.test(restartWorkflow)
        && /up -d --force-recreate --no-deps leword-api leword-live-golden-worker/.test(restartWorkflow)
        && /ps -q leword-live-golden-worker/.test(restartWorkflow)
        && /\/health/.test(restartWorkflow),
      '.github/workflows/api-production-restart.yml'),
    check('Production restart workflow is restricted to repository main',
      /if:\s*\$\{\{\s*github\.repository\s*==\s*['"]cd000242-sudo\/leword-app['"]\s*&&\s*github\.ref\s*==\s*['"]refs\/heads\/main['"]\s*\}\}/.test(restartWorkflow),
      'manual workflow dispatches from non-main refs must not reach the production environment or secrets'),
    check('Docker ignore protects release credentials',
      /apps\/mobile\/credentials\/\*/.test(dockerignore)
        && /node_modules/.test(dockerignore)
        && /\*\*\/\.env\.\*/.test(dockerignore)
        && /!\*\*\/\.env\.\*\.example/.test(dockerignore),
      '.dockerignore should keep credentials, real runtime env files, and local modules out of the image context'),
    check('Production API env example covers required runtime keys',
      requiredEnv.every((name) => envExample.includes(name)),
      'apps/api/.env.production.example'),
    check('Strict review provider example is fail-closed by default',
      /^LEWORD_MOBILE_LIVE_GOLDEN_REVIEW_PANEL_LOGIN_URL=$/m.test(envExample),
      'the example must not make URL-shape-only review readiness green when copied unchanged'),
    check('Live golden worker env example is least privilege',
      !!workerEnvExample
        && /NAVER_CLIENT_ID/.test(workerEnvExample)
        && /NAVER_SEARCH_AD_ACCESS_LICENSE/.test(workerEnvExample)
        && !/(?:LEWORD_WEB_SESSION_SECRET|LEWORD_MOBILE_API_TOKEN|TOSS_PAYMENTS_SECRET_KEY|LEWORD_TOSS_SECRET_KEY)\s*=/.test(workerEnvExample),
      'apps/api/.env.live-golden-worker.production.example'),
    check('API README documents container deployment',
      /mobile:api:docker:build/.test(readme)
        && /LEWORD_CHROME_PATH=\/usr\/bin\/chromium/.test(readme)
        && /docker-compose\.production\.yml/.test(readme)
        && /mobile-api-image-reference/.test(readme)
        && /mobile-api-image-manifest\.json/.test(readme)
        && /@sha256:<64-hex-digest>/.test(readme)
        && /accepts no image input|has no image input/.test(readme)
        && /LEWORD_PROD_SSH_KNOWN_HOSTS/.test(readme)
        && /LEWORD_GHCR_TOKEN/.test(readme)
        && /\.env\.live-golden-worker\.production/.test(readme)
        && /leword-review-artifacts/.test(readme),
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
