require('ts-node/register/transpile-only');

const {
  getMobileRuntimeReadiness,
} = require('../src/mobile/runtime-readiness');

const report = getMobileRuntimeReadiness();
console.log(JSON.stringify(report, null, 2));

if (!report.ok) {
  const blockers = report.blockers
    .filter((item) => item.severity === 'required')
    .map((item) => item.name)
    .join(', ');
  console.error(`[mobile-api-runtime-gate] failed required checks: ${blockers}`);
  process.exit(1);
}

console.log('[mobile-api-runtime-gate] passed');
