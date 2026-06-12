const {
  collectMobileApiDeployGate,
} = require('../../../scripts/mobile-api-deploy-gate');

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

const report = collectMobileApiDeployGate();

assert('mobile API deploy gate passes current production package', report.ok === true);
assert('API Dockerfile is checked',
  report.checks.some((item: any) => item.name === 'API Dockerfile exists' && item.ok));
assert('API Docker image pins Node 22',
  report.checks.some((item: any) => item.name === 'API Dockerfile uses Node 22' && item.ok));
assert('API Docker image installs deterministic Chromium',
  report.checks.some((item: any) => item.name === 'API Dockerfile installs system Chromium' && item.ok));
assert('API Docker image has healthcheck',
  report.checks.some((item: any) => item.name === 'API Dockerfile exposes healthcheck' && item.ok));
assert('API docker build command is registered',
  report.checks.some((item: any) => item.name === 'Mobile API docker build script is registered' && item.ok));
assert('API production compose file is checked',
  report.checks.some((item: any) => item.name === 'Production compose file exists' && item.ok));
assert('API production compose pulls CI-published GHCR image',
  report.checks.some((item: any) => item.name === 'Production compose pulls GHCR API image' && item.ok));
assert('API production compose persists mobile cache',
  report.checks.some((item: any) => item.name === 'Production compose uses persistent cache volume' && item.ok));
assert('API release workflow publishes image to GHCR',
  report.checks.some((item: any) => item.name === 'CI workflow publishes API image to GHCR' && item.ok));
assert('API production restart workflow is wired',
  report.checks.some((item: any) => item.name === 'Production restart workflow pulls image and checks health' && item.ok));

console.log('[mobile-api-deploy-gate.test] passed');

export {};
