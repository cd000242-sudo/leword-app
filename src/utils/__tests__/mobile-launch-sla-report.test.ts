const {
  collectMobileLaunchSlaReport,
} = require('../../../scripts/mobile-launch-sla-report');

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

const localOnly = collectMobileLaunchSlaReport({
  env: {},
  releaseDryRun: null,
  dispatchPlan: null,
});

assert('launch SLA report passes code gates while exposing missing external runtime',
  localOnly.ok === true
    && localOnly.releaseReady === false
    && localOnly.blockers.some((item: any) => item.name === 'Production API runtime is externally ready')
    && localOnly.checks.some((item: any) => item.name === 'Mobile endpoints are server-only' && item.ok)
    && localOnly.checks.some((item: any) => item.name === 'Mobile app contains no browser automation imports' && item.ok)
    && localOnly.checks.some((item: any) => item.name === 'Mobile UI release gate is ready' && item.ok)
    && localOnly.uiReleaseGate.ok === true);

assert('launch SLA report captures PC parity quality floors and metrics',
  localOnly.paritySla.qualityFloors.goldenPrecisionSss >= 30
    && localOnly.paritySla.qualityFloors.goldenBulkSss >= 60
    && localOnly.paritySla.qualityFloors.proTrafficMaxSssTarget >= 250
    && localOnly.paritySla.qualityFloors.mindmapDefaultMeasuredKeywords >= 50
    && localOnly.checks.some((item: any) => item.name === 'Mobile result schema preserves measured PC metrics' && item.ok));

const readyEnv = {
  NAVER_CLIENT_ID: 'naver-client-id',
  NAVER_CLIENT_SECRET: 'naver-client-secret',
  NAVER_SEARCH_AD_ACCESS_LICENSE: 'searchad-license',
  NAVER_SEARCH_AD_SECRET_KEY: 'searchad-secret',
  NAVER_SEARCH_AD_CUSTOMER_ID: 'searchad-customer',
  LEWORD_MOBILE_ENTITLEMENT_URL: 'https://api.leword.app/mobile/entitlement',
  LEWORD_MOBILE_PREWARM_INTERVAL_MINUTES: '15',
  LEWORD_MOBILE_CACHE_FILE: 'C:\\leword\\mobile-cache.json',
  LEWORD_MOBILE_PUSH_PROVIDER: 'expo',
  LEWORD_MOBILE_PUSH_TIMEOUT_MS: '5000',
};

const ready = collectMobileLaunchSlaReport({
  env: readyEnv,
  releaseDryRun: {
    generatedAt: '2026-06-05T00:00:00.000Z',
    ok: true,
  },
  dispatchPlan: {
    generatedAt: '2026-06-05T00:00:00.000Z',
    readyToDispatch: true,
  },
  performanceSmoke: {
    generatedAt: '2026-06-05T00:00:00.000Z',
    ok: true,
  },
});

assert('launch SLA report becomes release-ready when runtime and evidence are green',
  ready.ok === true
    && ready.releaseReady === true
    && ready.summary.failedRequired === 0
    && ready.summary.failedExternal === 0
    && ready.releaseEvidence.dryRunOk === true
    && ready.releaseEvidence.dispatchReady === true
    && ready.releaseEvidence.performanceSmokeOk === true);

assert('launch SLA report never exposes secret-like values',
  !JSON.stringify(ready).includes('ghp_')
    && !JSON.stringify(ready).includes('searchad-secret'));

console.log('[mobile-launch-sla-report.test] passed');

export {};
