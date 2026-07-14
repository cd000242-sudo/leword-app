const {
  collectMobileApiDeployGate,
} = require('../../../scripts/mobile-api-deploy-gate');
const fs = require('fs');
const path = require('path');

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

assert('mobile API deploy gate passes current production package', report.ok === true);
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
assert('API production compose persists mobile cache',
  report.checks.some((item: any) => item.name === 'Production compose uses persistent cache volume' && item.ok));
assert('live golden worker has a real shared-volume heartbeat healthcheck',
  /leword-live-golden-worker:[\s\S]*LEWORD_MOBILE_LIVE_GOLDEN_HEARTBEAT_FILE:\s*\/data\/live-golden-worker-heartbeat\.json/.test(productionCompose)
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
  (productionCompose.match(/LEWORD_SEARCHAD_ACCOUNTS_FILE:\s*\/data\/searchad-accounts\.json/g) || []).length === 2
    && !/LEWORD_SEARCHAD_ACCOUNTS_B64:/.test(productionCompose),
  'both API and worker must share the secret file path without exposing credential material in docker inspect');
assert('live golden worker retries below target on the twelve-minute product SLA cadence',
  /leword-live-golden-worker:[\s\S]*LEWORD_MOBILE_LIVE_GOLDEN_INTERVAL_MINUTES:\s*\$\{LEWORD_MOBILE_LIVE_GOLDEN_WORKER_INTERVAL_MINUTES:-12\}/.test(productionCompose),
  'hourly retries delay category coverage after KST quota reset');
assert('API release workflow publishes image to GHCR',
  report.checks.some((item: any) => item.name === 'CI workflow publishes API image to GHCR' && item.ok));
assert('API production restart workflow is wired',
  report.checks.some((item: any) => item.name === 'Production restart workflow pulls image and checks health' && item.ok));
assert('production restart synchronizes compose and restarts both API and live golden worker',
  restartWorkflow.includes('scp_cmd=')
    && /pull leword-api leword-live-golden-worker/.test(restartWorkflow)
    && /up -d leword-api leword-live-golden-worker/.test(restartWorkflow)
    && /ps -q leword-live-golden-worker/.test(restartWorkflow)
    && /worker_health/.test(restartWorkflow),
  'a new API image is not deployed until both runtime services and compose health policy are active');

console.log('[mobile-api-deploy-gate.test] passed');

export {};
