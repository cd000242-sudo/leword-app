const {
  collectMobileApiDeployGate,
} = require('../../../scripts/mobile-api-deploy-gate');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

const report = collectMobileApiDeployGate();
const root = path.join(__dirname, '..', '..', '..');
const dockerfile = fs.readFileSync(path.join(root, 'apps', 'api', 'Dockerfile'), 'utf8');
const productionCompose = fs.readFileSync(path.join(root, 'apps', 'api', 'docker-compose.production.yml'), 'utf8');
const restartWorkflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'api-production-restart.yml'), 'utf8');
const dockerignore = fs.readFileSync(path.join(root, '.dockerignore'), 'utf8');
const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
const volumeInitializer = fs.readFileSync(
  path.join(root, 'apps', 'api', 'scripts', 'initialize-production-volumes.js'),
  'utf8',
);

assert('mobile API deploy gate passes current production package', report.ok === true);
assert('strict review provider example stays empty until an operator configures a real endpoint',
  report.checks.some((item: any) => item.name === 'Strict review provider example is fail-closed by default' && item.ok));
assert('API Dockerfile is checked',
  report.checks.some((item: any) => item.name === 'API Dockerfile exists' && item.ok));
assert('API Docker image pins Node 22',
  report.checks.some((item: any) => item.name === 'API Dockerfile uses Node 22' && item.ok));
assert('API Docker image installs deterministic Chromium',
  report.checks.some((item: any) => item.name === 'API Dockerfile installs system Chromium' && item.ok));
assert('API Docker image has healthcheck',
  report.checks.some((item: any) => item.name === 'API Dockerfile exposes healthcheck' && item.ok));
assert('API healthcheck uses curl instead of starting a Node runtime every 30 seconds',
  /apt-get install[\s\S]*\bcurl\b/.test(dockerfile)
    && /HEALTHCHECK[\s\S]*CMD curl -fsS/.test(dockerfile)
    && !/HEALTHCHECK[\s\S]*CMD node -e/.test(dockerfile)
    && /healthcheck:[\s\S]*CMD[\s\S]*curl[\s\S]*-fsS/.test(productionCompose),
  'health probes must remain single-process and must not accumulate Node workers');
assert('API docker build command is registered',
  report.checks.some((item: any) => item.name === 'Mobile API docker build script is registered' && item.ok));
assert('API production compose file is checked',
  report.checks.some((item: any) => item.name === 'Production compose file exists' && item.ok));
assert('API production compose pulls CI-published GHCR image',
  report.checks.some((item: any) => item.name === 'Production compose pulls GHCR API image' && item.ok));
assert('production compose refuses an implicit or latest API image',
  (productionCompose.match(/image:\s*\$\{LEWORD_MOBILE_API_IMAGE:\?[^}]+\}/g) || []).length === 3
    && !/leword-mobile-api:latest/.test(productionCompose),
  'initializer and both runtime services must require the workflow-pinned immutable image');
assert('API production compose persists mobile cache',
  report.checks.some((item: any) => item.name === 'Production compose uses persistent cache volume' && item.ok));
assert('production review artifacts use a dedicated API-RW worker-RO volume',
  /leword-api:[\s\S]*LEWORD_MOBILE_LIVE_GOLDEN_REVIEW_COHORT_FILE:\s*\/review\/live-golden-review-cohort\.json/.test(productionCompose)
    && /leword-api:[\s\S]*leword-review-artifacts:\/review(?:\s|$)/m.test(productionCompose)
    && /leword-live-golden-worker:[\s\S]*LEWORD_MOBILE_LIVE_GOLDEN_REVIEW_COHORT_FILE:\s*\/review\/live-golden-review-cohort\.json/.test(productionCompose)
    && /leword-live-golden-worker:[\s\S]*leword-review-artifacts:\/review:ro/.test(productionCompose)
    && /volumes:[\s\S]*leword-review-artifacts:/.test(productionCompose),
  'worker maintenance may read the frozen cohort but cannot mutate review decisions or certificates');
assert('real API env files are excluded from both Docker build contexts and Git',
  dockerignore.includes('**/.env.*')
    && dockerignore.includes('!**/.env.*.example')
    && gitignore.includes('**/.env.*')
    && gitignore.includes('!**/.env.*.example'),
  'production bearer, review HMAC, payment, and Naver secrets must never enter an image layer or commit');
assert('production API persists the Phase 2 entry certificate',
  (productionCompose.match(/LEWORD_MOBILE_PHASE2_ENTRY_CERTIFICATE_FILE:\s*\/review\/live-golden-phase2-entry-certificate\.json/g) || []).length === 1
    && /leword-api:[\s\S]*LEWORD_MOBILE_PHASE2_ENTRY_CERTIFICATE_FILE:\s*\/review\/live-golden-phase2-entry-certificate\.json[\s\S]*leword-live-golden-worker:/.test(productionCompose),
  'only the API may write the durable entry certificate');
assert('live golden worker uses a dedicated minimal env file',
  /leword-live-golden-worker:[\s\S]*env_file:\s*\n\s*- \.env\.live-golden-worker\.production/.test(productionCompose)
    && !/leword-live-golden-worker:[\s\S]*env_file:\s*\n\s*- \.env\.production/.test(productionCompose),
  'worker must not inherit web-session, mobile bearer, commerce, or payment secrets');
assert('live golden worker cannot read or mutate the API commerce/cache volume',
  /leword-api:[\s\S]*leword-mobile-cache:\/data(?:\s|$)/m.test(productionCompose)
    && /leword-api:[\s\S]*leword-live-golden-data:\/golden:ro/.test(productionCompose)
    && /leword-live-golden-worker:[\s\S]*leword-live-golden-data:\/golden(?:\s|$)/m.test(productionCompose)
    && !/leword-live-golden-worker:[\s\S]*leword-mobile-cache:\/data(?:\s|$)/m.test(productionCompose),
  'browser-backed measurement work must not have filesystem access to buyer PII or API result caches');
assert('API and worker share reviewed home briefing through a dedicated least-privilege volume',
  (productionCompose.match(/LEWORD_MOBILE_HOME_KEYWORD_BRIEFING_FILE:\s*\/briefing\/home-keyword-briefing\.json/g) || []).length === 2
    && /leword-volume-init:[\s\S]*leword-home-keyword-briefing:\/briefing(?:\s|$)/m.test(productionCompose)
    && /leword-api:[\s\S]*leword-home-keyword-briefing:\/briefing(?:\s|$)/m.test(productionCompose)
    && /leword-live-golden-worker:[\s\S]*leword-home-keyword-briefing:\/briefing:ro(?:\s|$)/m.test(productionCompose)
    && !/leword-live-golden-worker:[\s\S]*leword-home-keyword-briefing:\/briefing(?:\s|$)/m.test(productionCompose)
    && /volumes:[\s\S]*leword-home-keyword-briefing:/.test(productionCompose)
    && /migrateHomeKeywordBriefingArtifact/.test(volumeInitializer),
  'reviewed discovery input must reach the worker without mounting API-private /data or writable review evidence');
assert('SearchAd account pool is mounted read-only from a dedicated data volume',
  (productionCompose.match(/leword-searchad-accounts:\/searchad:ro/g) || []).length === 2
    && /LEWORD_SEARCHAD_ACCOUNTS_FILE:\s*\/searchad\/searchad-accounts\.json/g.test(productionCompose)
    && /leword-volume-init:[\s\S]*leword-searchad-accounts:\/searchad(?:\s|$)/m.test(productionCompose),
  'optional SearchAd credentials must not live in either a worker-writable or commerce-bearing volume');
assert('API and worker share one persistent quota ledger without exposing commerce data',
  (productionCompose.match(/LEWORD_SEARCHAD_QUOTA_STATE_FILE:\s*\/quota\/searchad-quota-state\.json/g) || []).length === 2
    && (productionCompose.match(/LEWORD_NAVER_OPENAPI_QUOTA_STATE_FILE:\s*\/quota\/naver-openapi-quota-state\.json/g) || []).length === 2
    && (productionCompose.match(/leword-measurement-quota:\/quota(?:\s|$)/gm) || []).length === 3
    && /volumes:[\s\S]*leword-measurement-quota:/.test(productionCompose)
    && /leword-volume-init:[\s\S]*LEWORD_VOLUME_INIT_MODE:\s*forward/.test(productionCompose)
    && /synchronizeQuotaStateArtifacts/.test(volumeInitializer),
  'runtime restarts must not split or reset SearchAd/OpenAPI quota accounting');
assert('API image runs as non-root with writable mount roots',
  /RUN install -d -o node -g node \/data \/review \/golden \/briefing \/searchad \/quota/.test(dockerfile)
    && /chmod 700 \/data \/review \/golden \/briefing \/searchad \/quota/.test(dockerfile)
    && /USER node/.test(dockerfile)
    && dockerfile.indexOf('USER node') < dockerfile.indexOf('CMD ['),
  'both API and worker share the same non-root image');
assert('root volume initializer is secret-free, one-shot, and verifies node ownership',
  /leword-volume-init:[\s\S]*user:\s*"0:0"/.test(productionCompose)
    && /leword-volume-init:[\s\S]*network_mode:\s*none/.test(productionCompose)
    && /leword-volume-init:[\s\S]*read_only:\s*true/.test(productionCompose)
    && /entrypoint:\s*\["node"\]/.test(productionCompose)
    && /initialize-production-volumes\.js/.test(productionCompose)
    && /chownTreeNoFollow\(dataRoot, NODE_UID, NODE_GID\)/.test(volumeInitializer)
    && /chownTreeNoFollow\(goldenRoot, NODE_UID, NODE_GID\)/.test(volumeInitializer)
    && /chownTreeNoFollow\(briefingRoot, NODE_UID, NODE_GID\)/.test(volumeInitializer)
    && /chownTreeNoFollow\(searchAdRoot, NODE_UID, NODE_GID\)/.test(volumeInitializer)
    && /verifyOwnedWritableRoot\(reviewRoot, NODE_UID, NODE_GID\)/.test(volumeInitializer)
    && /verifyOwnedWritableRoot\(briefingRoot, NODE_UID, NODE_GID\)/.test(volumeInitializer)
    && !/leword-volume-init:[\s\S]*env_file:/.test(productionCompose.split(/\n\s{2}leword-api:/)[0]),
  'existing root-owned named volumes must be repaired before non-root services start');
assert('volume initializer safely migrates legacy review artifacts once',
  /live-golden-review-cohort\.json/.test(volumeInitializer)
    && /live-golden-phase2-entry-certificate\.json/.test(volumeInitializer)
    && /live-golden-review-cohort\.json\.audit/.test(volumeInitializer)
    && /isSymbolicLink\(\)/.test(volumeInitializer)
    && /migration temp already exists/.test(volumeInitializer)
    && /target is authoritative after the one-time migration/.test(volumeInitializer)
    && /audit artifact conflict/.test(volumeInitializer)
    && /fs\.linkSync\(temporary, target\)/.test(volumeInitializer),
  'legacy files and failed-review tombstones are copied atomically; broken links and stale temps fail closed while a valid target wins reruns');
assert('production review board defaults to a broad-document-maintainable 64 rows',
  (productionCompose.match(/LEWORD_MOBILE_LIVE_GOLDEN_BOARD_TARGET:\s*\$\{LEWORD_MOBILE_LIVE_GOLDEN_BOARD_TARGET:-64\}/g) || []).length === 2
    && !/LEWORD_MOBILE_LIVE_GOLDEN_BOARD_TARGET:\s*\$\{LEWORD_MOBILE_LIVE_GOLDEN_BOARD_TARGET:-120\}/.test(productionCompose),
  'API and worker must preserve the operator override while defaulting below the 15-minute freshness capacity');
assert('live golden worker has a real shared-volume heartbeat healthcheck',
  /leword-live-golden-worker:[\s\S]*LEWORD_MOBILE_LIVE_GOLDEN_HEARTBEAT_FILE:\s*\/golden\/live-golden-worker-heartbeat\.json/.test(productionCompose)
    && /leword-live-golden-worker:[\s\S]*healthcheck:[\s\S]*live-golden-worker-heartbeat\.json/.test(productionCompose)
    && !/leword-live-golden-worker:[\s\S]*healthcheck:\s*\n\s*disable:\s*true/.test(productionCompose),
  'worker liveness must not be disabled in production');
assert('production reserves SearchAd quota for live golden supply instead of letting API prewarm consume it all',
  /leword-api:[\s\S]*LEWORD_SEARCHAD_SOFT_CEILING:\s*\$\{LEWORD_SEARCHAD_WORKER_SOFT_CEILING:-22000\}/.test(productionCompose)
    && /leword-api:[\s\S]*LEWORD_MOBILE_PREWARM_SEARCHAD_SOFT_CEILING:\s*\$\{LEWORD_MOBILE_PREWARM_SEARCHAD_SOFT_CEILING:-1500\}/.test(productionCompose)
    && /leword-live-golden-worker:[\s\S]*LEWORD_SEARCHAD_SOFT_CEILING:\s*\$\{LEWORD_SEARCHAD_WORKER_SOFT_CEILING:-22000\}/.test(productionCompose),
  'API health must expose the worker budget while the prewarm-only gate stops at 1.5k');
assert('production prewarm is low-frequency and single-flight while live golden supply is below target',
  /leword-api:[\s\S]*LEWORD_MOBILE_PREWARM_INTERVAL_MINUTES:\s*\$\{LEWORD_MOBILE_PREWARM_INTERVAL_MINUTES:-360\}/.test(productionCompose)
    && /leword-api:[\s\S]*LEWORD_MOBILE_PREWARM_LIMIT:\s*\$\{LEWORD_MOBILE_PREWARM_LIMIT:-2\}/.test(productionCompose)
    && /leword-api:[\s\S]*LEWORD_MOBILE_PREWARM_CONCURRENCY:\s*\$\{LEWORD_MOBILE_PREWARM_CONCURRENCY:-1\}/.test(productionCompose)
    && /leword-api:[\s\S]*LEWORD_MOBILE_PREWARM_ON_START:\s*\$\{LEWORD_MOBILE_PREWARM_ON_START:-false\}/.test(productionCompose),
  'prewarm must not overlap expensive hunters or replay them on every API restart');
assert('production reads additional SearchAd credentials from the shared secret file instead of container metadata',
  (productionCompose.match(/LEWORD_SEARCHAD_ACCOUNTS_FILE:\s*\/searchad\/searchad-accounts\.json/g) || []).length === 2
    && (productionCompose.match(/leword-searchad-accounts:\/searchad:ro/g) || []).length === 2
    && !/LEWORD_SEARCHAD_ACCOUNTS_B64:/.test(productionCompose),
  'both API and worker must read the isolated account pool without exposing credential material in docker inspect');
assert('live golden worker retries below target on the twelve-minute product SLA cadence',
  /leword-live-golden-worker:[\s\S]*LEWORD_MOBILE_LIVE_GOLDEN_INTERVAL_MINUTES:\s*\$\{LEWORD_MOBILE_LIVE_GOLDEN_WORKER_INTERVAL_MINUTES:-12\}/.test(productionCompose),
  'hourly retries delay category coverage after KST quota reset');
assert('live golden worker begins startup catch-up without a five-minute dead period',
  /leword-live-golden-worker:[\s\S]*LEWORD_MOBILE_LIVE_GOLDEN_START_DELAY_MS:\s*\$\{LEWORD_MOBILE_LIVE_GOLDEN_START_DELAY_MS:-15000\}/.test(productionCompose),
  'worker-only deploys must begin measured category recovery within fifteen seconds');
assert('API release workflow publishes image to GHCR',
  report.checks.some((item: any) => item.name === 'CI workflow publishes API image to GHCR' && item.ok));
assert('API production restart workflow is wired',
  report.checks.some((item: any) => item.name === 'Production restart workflow pulls image and checks health' && item.ok));
assert('API production restart workflow cannot use production secrets from non-main refs',
  report.checks.some((item: any) => item.name === 'Production restart workflow is restricted to repository main' && item.ok)
    && /if:\s*\$\{\{\s*github\.repository\s*==\s*['"]cd000242-sudo\/leword-app['"]\s*&&\s*github\.ref\s*==\s*['"]refs\/heads\/main['"]\s*\}\}/.test(restartWorkflow),
  'the production job must be skipped before environment secrets are requested');
assert('production restart checks out the repository before copying compose',
  report.checks.some((item: any) => item.name === 'Production restart workflow checks out repository' && item.ok)
    && /uses:\s*actions\/checkout@v4/.test(restartWorkflow)
    && restartWorkflow.indexOf('actions/checkout@v4') < restartWorkflow.indexOf('scp_cmd='),
  'the GitHub runner must have the requested compose file before scp');
assert('production restart serializes GitHub and remote deployments',
  /concurrency:\s*\n\s*group:\s*leword-production-api/.test(restartWorkflow)
    && /cancel-in-progress:\s*false/.test(restartWorkflow)
    && /environment:\s*production/.test(restartWorkflow)
    && /flock\s+-n\s+9/.test(restartWorkflow)
    && /transaction_id="\$\{EXPECTED_BUILD_SHA\}-\$\{SOURCE_BUILD_RUN_ID\}-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}"/.test(restartWorkflow)
    && /transaction_dir/.test(restartWorkflow)
    && /docker image rm "\$rollback_api_ref" "\$rollback_worker_ref"/.test(restartWorkflow),
  'one production transaction may mutate compose at a time');
assert('production restart has success-flag cleanup and signal-safe rollback',
  /deploy_succeeded=false/.test(restartWorkflow)
    && /trap\s+['"]?on_deploy_exit['"]?\s+EXIT/.test(restartWorkflow)
    && /trap\s+['"]exit 129['"]\s+HUP/.test(restartWorkflow)
    && /trap\s+['"]exit 130['"]\s+INT/.test(restartWorkflow)
    && /trap\s+['"]exit 143['"]\s+TERM/.test(restartWorkflow),
  'disconnects and cancellations must enter the same verified rollback path');
assert('production restart resolves only the current main release artifact',
  !/image_sha:\s*\n/.test(restartWorkflow)
    && /actions:\s*read/.test(restartWorkflow)
    && /getBranch\([\s\S]*branch:\s*['"]main['"]/.test(restartWorkflow)
    && /listWorkflowRuns/.test(restartWorkflow)
    && /mobile-release\.yml/.test(restartWorkflow)
    && /Build and publish production API image/.test(restartWorkflow)
    && /conclusion === ['"]success['"]/.test(restartWorkflow)
    && /actions\/download-artifact@v4/.test(restartWorkflow)
    && /mobile-api-image-reference/.test(restartWorkflow)
    && /mobile-api-image-manifest\.json/.test(restartWorkflow)
    && /mobile-api-image-manifest\.js validate/.test(restartWorkflow),
  'manual input cannot select an older commit, workflow run, repository, or mutable tag');
assert('production restart pins repository, paths, port, and immutable manifest digest',
  !/^\s{6}(?:image|image_sha|remote_path|compose_file|bind_port):/m.test(restartWorkflow)
    && /IMAGE_REPOSITORY:\s*ghcr\.io\/cd000242-sudo\/leword-mobile-api/.test(restartWorkflow)
    && /REMOTE_PATH:\s*\/opt\/leword-app/.test(restartWorkflow)
    && /COMPOSE_FILE:\s*apps\/api\/docker-compose\.production\.yml/.test(restartWorkflow)
    && /BIND_PORT:\s*['"]?34983['"]?/.test(restartWorkflow)
    && /\^sha256:\[0-9a-f\]\{64\}\$/.test(restartWorkflow)
    && /@\$\{EXPECTED_MANIFEST_DIGEST\}/.test(restartWorkflow)
    && /RepoDigests/.test(restartWorkflow),
  'production uses the artifact-bound registry digest, not a tag');
assert('production SSH trust is pinned and registry token stays off remote argv',
  /LEWORD_PROD_SSH_KNOWN_HOSTS secret is required/.test(restartWorkflow)
    && /LEWORD_PROD_SSH_HOST contains unsafe characters/.test(restartWorkflow)
    && /LEWORD_PROD_SSH_USER contains unsafe characters/.test(restartWorkflow)
    && !/ssh-keyscan/.test(restartWorkflow)
    && /docker login ghcr\.io[^\n]*--password-stdin/.test(restartWorkflow)
    && !/GHCR_TOKEN=\$\{GHCR_TOKEN@Q\}/.test(restartWorkflow)
    && !/GHCR_TOKEN=[^\n]*bash -s/.test(restartWorkflow),
  'host identity must be pre-pinned and the registry password must travel only over stdin');
assert('production restart verifies the pulled image ID and non-transient Phase 2 readiness',
  report.checks.some((item: any) => item.name === 'Production restart workflow verifies deployed revision' && item.ok)
    && /expected_image_id/.test(restartWorkflow)
    && /\$api_image_id" = "\$expected_image_id/.test(restartWorkflow)
    && /\$worker_image_id" = "\$expected_image_id/.test(restartWorkflow)
    && /HEALTH_TIMEOUT_SECONDS:\s*['"]?(?:1[2-9]\d|[2-9]\d{2,})['"]?/.test(restartWorkflow)
    && /runtime_required_ready/.test(restartWorkflow)
    && /transientRuntimeCodes/.test(restartWorkflow)
    && /review_storage_ready/.test(restartWorkflow)
    && /reviewStorage/.test(restartWorkflow)
    && /reviewStorage\.configured === true/.test(restartWorkflow)
    && /reviewStorage\.readable === true/.test(restartWorkflow)
    && /reviewStorage\.writable === true/.test(restartWorkflow)
    && /reviewAuthConfigured === true/.test(restartWorkflow)
    && /reviewAuth\.ready === true/.test(restartWorkflow)
    && /reviewAuth\.signingSecretConfigured === true/.test(restartWorkflow)
    && /reviewAuth\.configuredAdmin === true/.test(restartWorkflow)
    && /reviewAuth\.strictProviderConfigured === true/.test(restartWorkflow)
    && /review_auth_ready/.test(restartWorkflow)
    && /heartbeat\.status === "running"/.test(restartWorkflow)
    && /heartbeat\.startedAt/.test(restartWorkflow)
    && /heartbeat\.updatedAt/.test(restartWorkflow)
    && /worker\.healthy === true/.test(restartWorkflow)
    && /worker\.stale === false/.test(restartWorkflow)
    && /heartbeat_change_count/.test(restartWorkflow)
    && /-ge 2/.test(restartWorkflow)
    && /worker_started_after_deploy/.test(restartWorkflow)
    && /deploy_epoch_ms/.test(restartWorkflow)
    && /phase2\.state/.test(restartWorkflow)
    && !/runtime_ok/.test(restartWorkflow)
    && !/health\.runtime\.ok === true/.test(restartWorkflow),
  'readiness requires stable runtime config, writable review storage, and two fresh worker heartbeat advances');
assert('production restart keeps registry credentials transaction-scoped',
  /remote_docker_config="\$\{transaction_dir\}\/docker-config"/.test(restartWorkflow)
    && /"\$TRANSACTION_DIR"\/docker-config\)/.test(restartWorkflow)
    && /export DOCKER_CONFIG/.test(restartWorkflow)
    && /cleanup_registry_credentials/.test(restartWorkflow)
    && /rm -f "\$DOCKER_CONFIG\/config\.json"/.test(restartWorkflow)
    && /rmdir "\$DOCKER_CONFIG"/.test(restartWorkflow)
    && !/docker login[\s\S]{0,120}\$HOME\/\.docker/.test(restartWorkflow),
  'registry credentials must be removed even when rollback artifacts are retained');
assert('rollback journal and compose restore are fail-closed and atomic',
  /rollback-state\.next/.test(restartWorkflow)
    && /validate_rollback_journal/.test(restartWorkflow)
    && /assert_no_prior_rollback_journal/.test(restartWorkflow)
    && restartWorkflow.indexOf('flock -n 9') < restartWorkflow.indexOf('assert_no_prior_rollback_journal')
    && restartWorkflow.indexOf('assert_no_prior_rollback_journal') < restartWorkflow.indexOf('previous_api_container=')
    && /compose_backup_sha256/.test(restartWorkflow)
    && /compose\.restore\.tmp/.test(restartWorkflow)
    && /mv "\$compose_restore_tmp" "\$COMPOSE_FILE"/.test(restartWorkflow)
    && /trap '' HUP INT TERM/.test(restartWorkflow),
  'rollback must revalidate prior state under flock and ignore repeated cancellation signals');
assert('deploy and compatible rollback initialize writable volumes before service start',
  /run_volume_init_if_configured/.test(restartWorkflow)
    && /run --rm --no-deps leword-volume-init/.test(restartWorkflow)
    && (restartWorkflow.match(/run_volume_init_if_configured/g) || []).length === 3
    && (restartWorkflow.match(/up -d --force-recreate --no-deps leword-api leword-live-golden-worker/g) || []).length === 2
    && restartWorkflow.indexOf('run_volume_init_if_configured\n          deploy_epoch_ms')
      < restartWorkflow.lastIndexOf('up -d --force-recreate --no-deps leword-api leword-live-golden-worker'),
  'manual initializer execution must happen exactly once per path and --no-deps prevents Compose from running it again');
const productionPullIndex = restartWorkflow.indexOf('pull leword-volume-init leword-api leword-live-golden-worker');
const credentialCleanupAfterPullIndex = restartWorkflow.indexOf('cleanup_registry_credentials', productionPullIndex);
const stopLegacyWritersIndex = restartWorkflow.indexOf('docker stop --time 30', productionPullIndex);
const deployVolumeInitIndex = restartWorkflow.lastIndexOf('run_volume_init_if_configured');
const deployServiceStartIndex = restartWorkflow.lastIndexOf('up -d --force-recreate --no-deps leword-api leword-live-golden-worker');
assert('deployment removes registry credentials and stops legacy writers before migration',
  productionPullIndex >= 0
    && credentialCleanupAfterPullIndex > productionPullIndex
    && stopLegacyWritersIndex > credentialCleanupAfterPullIndex
    && deployVolumeInitIndex > stopLegacyWritersIndex
    && deployServiceStartIndex > deployVolumeInitIndex,
  'legacy /data review files must be quiescent before the one-time /review snapshot');
assert('production compose and both env files fail fast before rollback state or service mutation',
  /\.env\.production/.test(restartWorkflow)
    && /\.env\.live-golden-worker\.production/.test(restartWorkflow)
    && /compose_preflight/.test(restartWorkflow)
    && /unexpected_worker_env_keys/.test(restartWorkflow)
    && /Worker env contains non-minimal keys/.test(restartWorkflow)
    && /required_worker_key/.test(restartWorkflow)
    && restartWorkflow.indexOf('"${compose[@]}" -f "$compose_preflight" config')
      < restartWorkflow.indexOf('previous_api_container=')
    && restartWorkflow.indexOf('"${compose[@]}" -f "$compose_preflight" config')
      < restartWorkflow.indexOf("printf 'schema_version=leword-production-rollback-v1")
    && /mv "\$compose_preflight" "\$COMPOSE_FILE"/.test(restartWorkflow),
  'missing worker env or invalid compose must not trigger a needless production rollback');
const immutablePullIndex = restartWorkflow.indexOf('pull leword-volume-init leword-api leword-live-golden-worker');
const rollbackJournalIndex = restartWorkflow.indexOf("printf 'schema_version=leword-production-rollback-v1");
const composeSwapIndex = restartWorkflow.indexOf('mv "$compose_preflight" "$COMPOSE_FILE"');
const stopWritersIndex = restartWorkflow.indexOf('docker stop --time 30');
assert('immutable image pull and RepoDigest verification complete before rollback journal or production mutation',
  immutablePullIndex >= 0
    && immutablePullIndex < rollbackJournalIndex
    && immutablePullIndex < composeSwapIndex
    && immutablePullIndex < stopWritersIndex
    && /preflight_expected_image_id/.test(restartWorkflow)
    && /deploy_expected_image_id/.test(restartWorkflow)
    && /"\$deploy_expected_image_id" = "\$preflight_expected_image_id"/.test(restartWorkflow),
  'registry failure must leave the running production containers and compose file untouched');
assert('production rollback restores and verifies both prior image IDs',
  report.checks.some((item: any) => item.name === 'Production restart workflow rolls back failed deploy' && item.ok)
    && /previous_api_image_id/.test(restartWorkflow)
    && /previous_worker_image_id/.test(restartWorkflow)
    && /docker image tag "\$previous_api_image_id" "\$rollback_api_ref"/.test(restartWorkflow)
    && /docker image tag "\$previous_worker_image_id" "\$rollback_worker_ref"/.test(restartWorkflow)
    && /atomic_restore_compose/.test(restartWorkflow)
    && /rollback_api_health/.test(restartWorkflow)
    && /rollback_worker_health/.test(restartWorkflow)
    && /rollback_service_ok/.test(restartWorkflow)
    && /rollback_worker_started_after_restart/.test(restartWorkflow)
    && /rollback_api_image_id/.test(restartWorkflow)
    && /rollback_worker_image_id/.test(restartWorkflow)
    && /ROLLBACK FAILED/.test(restartWorkflow)
    && /retaining transaction artifacts/.test(restartWorkflow),
  'rollback is successful only after API health and exact prior IDs are restored');
const rollbackFunction = restartWorkflow.slice(
  restartWorkflow.indexOf('rollback_deploy()'),
  restartWorkflow.indexOf('previous_api_container='),
);
assert('rollback quiesces failed-generation writers before any volume migration',
  /rollback_current_api_container/.test(rollbackFunction)
    && /rollback_current_worker_container/.test(rollbackFunction)
    && /docker stop --time 30/.test(rollbackFunction)
    && rollbackFunction.indexOf('docker stop --time 30')
      < rollbackFunction.indexOf('run_volume_init_if_configured'),
  'a failed API/worker generation must not race the root volume initializer');
assert('rollback exports the shared quota ledger before restoring the legacy compose',
  /run --rm --no-deps -e LEWORD_VOLUME_INIT_MODE=rollback leword-volume-init/.test(rollbackFunction)
    && rollbackFunction.indexOf('docker stop --time 30')
      < rollbackFunction.indexOf('LEWORD_VOLUME_INIT_MODE=rollback')
    && rollbackFunction.indexOf('LEWORD_VOLUME_INIT_MODE=rollback')
      < rollbackFunction.indexOf('atomic_restore_compose'),
  'the old generation must never restart from a lower /data quota count');
assert('rollback bridges dedicated briefing state with the failed generation compose before restore',
  /LEWORD_VOLUME_INIT_MODE=rollback/.test(rollbackFunction)
    && /migrateHomeKeywordBriefingArtifact/.test(volumeInitializer)
    && /writeHomeKeywordBriefingRollbackMarker/.test(volumeInitializer)
    && rollbackFunction.indexOf('LEWORD_VOLUME_INIT_MODE=rollback')
      < rollbackFunction.indexOf('atomic_restore_compose'),
  'the legacy image must receive the last human-reviewed briefing before its compose is restored');
assert('every volume migration fences all running writers in the compose project',
  /assert_no_running_project_writers\(\)/.test(restartWorkflow)
    && /label=com\.docker\.compose\.project=\$\{compose_project_name\}/.test(restartWorkflow)
    && /label=com\.docker\.compose\.service=\$\{service\}/.test(restartWorkflow)
    && (restartWorkflow.match(/assert_no_running_project_writers/g) || []).length === 4
    && /worker_compose_project_name/.test(restartWorkflow),
  'known API/worker containers and same-project duplicates must be stopped before root migration');
assert('production restart synchronizes compose and restarts both API and live golden worker',
  restartWorkflow.includes('scp_cmd=')
    && /pull leword-volume-init leword-api leword-live-golden-worker/.test(restartWorkflow)
    && /up -d --force-recreate --no-deps leword-api leword-live-golden-worker/.test(restartWorkflow)
    && /ps -q leword-live-golden-worker/.test(restartWorkflow)
    && /worker_health/.test(restartWorkflow),
  'a new API image is not deployed until both runtime services and compose health policy are active');

const embeddedHealthParsers = [
  ...restartWorkflow.matchAll(/node -e '\n([\s\S]*?)\n\s*' 2>\/dev\/null/g),
].map((match: RegExpMatchArray) => match[1]);
assert('production transaction embeds both deploy and rollback health parsers', embeddedHealthParsers.length === 2);

function runHealthParser(
  index: number,
  health: any,
  epochName: string,
  epochMs: number,
): string {
  const result = spawnSync(process.execPath, ['-e', embeddedHealthParsers[index]], {
    input: JSON.stringify(health),
    encoding: 'utf8',
    env: {
      ...process.env,
      [epochName]: String(epochMs),
    },
  });
  assert(`embedded health parser ${index} exits cleanly`, result.status === 0, result.stderr);
  return String(result.stdout || '').trim();
}

const healthNowMs = Date.now();
const deployEpochMs = healthNowMs - 90_000;
const workerStartedAt = new Date(deployEpochMs + 1_000).toISOString();
const workerUpdatedAt = new Date(healthNowMs - 1_000).toISOString();
const workerUpdatedAtMs = Date.parse(workerUpdatedAt);
const requiredRuntimeCodes = [
  'naver-openapi-credentials-configured',
  'naver-searchad-credentials-configured',
  'production-entitlement-service-configured',
  'server-prewarm-scheduler-configured',
  'persistent-mobile-result-cache-configured',
  'push-delivery-configured',
];
const runtimeChecks = [
  ...requiredRuntimeCodes.map((code) => ({ code, severity: 'required', ok: true })),
  {
    code: 'naver-openapi-document-quota-available',
    severity: 'required',
    ok: false,
  },
  {
    code: 'push-timeout-valid',
    severity: 'recommended',
    ok: false,
  },
];
const deployHealth = {
  ok: true,
  runtime: { ok: false, checks: runtimeChecks },
  liveGolden: {
    reviewAuthConfigured: true,
    reviewAuth: {
      ready: true,
      signingSecretConfigured: true,
      configuredAdmin: true,
      strictProviderConfigured: false,
      provider: 'configured-admin',
    },
    reviewStorage: { configured: true, readable: true, writable: true },
    phase2Entry: { state: 'building-supply', reason: 'verified-count-below-60' },
    worker: {
      available: true,
      healthy: true,
      stale: false,
      heartbeat: {
        status: 'running',
        startedAt: workerStartedAt,
        updatedAt: workerUpdatedAt,
      },
    },
  },
};
assert('deploy readiness ignores transient runtime quota state while accepting building supply',
  runHealthParser(0, deployHealth, 'LEWORD_DEPLOY_EPOCH_MS', deployEpochMs)
    === `true|true|true|true|true|true|true|${workerUpdatedAtMs}`);
assert('deploy readiness rejects any non-transient required runtime check',
  runHealthParser(0, {
    ...deployHealth,
    runtime: {
      ok: false,
      checks: runtimeChecks.map((item) => item.code === 'push-delivery-configured'
        ? { ...item, ok: false }
        : item),
    },
  }, 'LEWORD_DEPLOY_EPOCH_MS', deployEpochMs)
    === `true|false|true|true|true|true|true|${workerUpdatedAtMs}`);
assert('deploy readiness requires configured, readable, and writable review storage',
  runHealthParser(0, {
    ...deployHealth,
    liveGolden: {
      ...deployHealth.liveGolden,
      reviewStorage: { configured: true, readable: true, writable: false },
    },
  }, 'LEWORD_DEPLOY_EPOCH_MS', deployEpochMs)
    === `true|true|true|false|true|true|true|${workerUpdatedAtMs}`);
assert('deploy readiness requires independent review auth',
  runHealthParser(0, {
    ...deployHealth,
    liveGolden: { ...deployHealth.liveGolden, reviewAuthConfigured: false },
  }, 'LEWORD_DEPLOY_EPOCH_MS', deployEpochMs)
    === `true|true|true|true|false|true|true|${workerUpdatedAtMs}`);
assert('deploy readiness rejects a legacy boolean when no strict review provider contract is ready',
  runHealthParser(0, {
    ...deployHealth,
    liveGolden: {
      ...deployHealth.liveGolden,
      reviewAuthConfigured: true,
      reviewAuth: {
        ready: false,
        signingSecretConfigured: true,
        configuredAdmin: false,
        strictProviderConfigured: false,
        provider: 'none',
      },
    },
  }, 'LEWORD_DEPLOY_EPOCH_MS', deployEpochMs)
    === `true|true|true|true|false|true|true|${workerUpdatedAtMs}`);
assert('deploy readiness rejects a heartbeat left by the previous worker',
  runHealthParser(0, {
    ...deployHealth,
    liveGolden: {
      ...deployHealth.liveGolden,
      worker: {
        ...deployHealth.liveGolden.worker,
        heartbeat: {
          ...deployHealth.liveGolden.worker.heartbeat,
          startedAt: new Date(deployEpochMs - 1_000).toISOString(),
        },
      },
    },
  }, 'LEWORD_DEPLOY_EPOCH_MS', deployEpochMs)
    === `true|true|true|true|true|true|false|${workerUpdatedAtMs}`);
assert('deploy readiness rejects stale or non-running worker status',
  runHealthParser(0, {
    ...deployHealth,
    liveGolden: {
      ...deployHealth.liveGolden,
      worker: {
        ...deployHealth.liveGolden.worker,
        stale: true,
        heartbeat: { ...deployHealth.liveGolden.worker.heartbeat, status: 'stopped' },
      },
    },
  }, 'LEWORD_DEPLOY_EPOCH_MS', deployEpochMs)
    === `true|true|true|true|true|false|true|${workerUpdatedAtMs}`);
assert('rollback readiness also requires a newly started worker heartbeat',
  runHealthParser(1, deployHealth, 'LEWORD_ROLLBACK_EPOCH_MS', deployEpochMs)
    === `true|true|true|${workerUpdatedAtMs}`);
assert('deploy and rollback count the first valid post-epoch heartbeat as the first distinct value',
  /worker_ready" = "true"[\s\S]*heartbeat_change_count=\$\(\( heartbeat_change_count \+ 1 \)\)/.test(restartWorkflow)
    && /rollback_worker_ready" = "true"[\s\S]*rollback_heartbeat_change_count=\$\(\( rollback_heartbeat_change_count \+ 1 \)\)/.test(restartWorkflow)
    && !/if \[ "\$worker_heartbeat_previous_ms" -gt 0 \]/.test(restartWorkflow)
    && !/if \[ "\$rollback_worker_heartbeat_previous_ms" -gt 0 \]/.test(restartWorkflow),
  'two distinct post-start heartbeat timestamps must fit within the deployment deadline');

console.log('[mobile-api-deploy-gate.test] passed');

export {};
