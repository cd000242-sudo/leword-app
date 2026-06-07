const fs = require('fs');
const path = require('path');

const {
  collectReleaseAudit,
} = require('./mobile-release-audit');
const {
  collectMobileReleaseDryRun,
} = require('./mobile-release-dry-run');
const {
  collectMobileReleaseDispatchPlan,
} = require('./mobile-release-dispatch-plan');
const {
  collectMobilePublicReleaseGate,
} = require('./mobile-public-release-gate');

const root = path.join(__dirname, '..');

const TARGETS = Object.freeze([
  {
    id: 'verify-only',
    label: 'CI verify only',
    target: 'verify-only',
    submitToStores: false,
    runApiSmoke: false,
  },
  {
    id: 'api-image',
    label: 'Publish API image',
    target: 'api-image',
    submitToStores: false,
    runApiSmoke: false,
  },
  {
    id: 'android-internal-build',
    label: 'Android internal build',
    target: 'android-internal',
    submitToStores: false,
    runApiSmoke: false,
  },
  {
    id: 'android-internal-submit',
    label: 'Android internal submit',
    target: 'android-internal',
    submitToStores: true,
    runApiSmoke: true,
  },
  {
    id: 'android-public-submit',
    label: 'Android public submit',
    target: 'android-public',
    submitToStores: true,
    runApiSmoke: true,
  },
  {
    id: 'ios-testflight',
    label: 'iOS TestFlight',
    target: 'ios-testflight',
    submitToStores: true,
    runApiSmoke: true,
  },
  {
    id: 'full-release',
    label: 'Full mobile release',
    target: 'full-release',
    submitToStores: true,
    runApiSmoke: true,
  },
]);

function readArg(argv, name, fallback = '') {
  const equals = argv.find((arg) => arg.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? (argv[index + 1] || fallback) : fallback;
}

function resolveOut(outPath) {
  if (!outPath) return null;
  return path.isAbsolute(outPath) ? outPath : path.join(root, outPath);
}

function writeJson(value, outPath) {
  const resolved = resolveOut(outPath);
  if (!resolved) return null;
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return resolved;
}

function dedupeBlockers(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.name}|${item.detail}|${item.severity}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isCodeReady(releaseStatus) {
  return releaseStatus?.codeReady === true
    && releaseStatus?.apiDeployReady === true
    && releaseStatus?.storeListingReady === true
    && releaseStatus?.storeAssetsReady === true
    && releaseStatus?.uiReady === true
    && releaseStatus?.androidJsExportReady === true;
}

function summarizeTarget(targetSpec, env, audit, ref) {
  const dryRun = collectMobileReleaseDryRun({
    target: targetSpec.target,
    submitToStores: targetSpec.submitToStores,
    runApiSmoke: targetSpec.runApiSmoke,
    env,
    audit,
  });
  const dispatch = collectMobileReleaseDispatchPlan({
    target: targetSpec.target,
    submitToStores: targetSpec.submitToStores,
    runApiSmoke: targetSpec.runApiSmoke,
    env,
    ref,
    audit,
    dryRun,
  });
  const blockers = dedupeBlockers(Array.isArray(dryRun.blockers) ? dryRun.blockers : []);
  return {
    id: targetSpec.id,
    label: targetSpec.label,
    target: targetSpec.target,
    submitToStores: targetSpec.submitToStores,
    runApiSmoke: targetSpec.runApiSmoke,
    ready: dryRun.ok === true,
    readyToDispatch: dispatch.readyToDispatch === true,
    summary: dryRun.summary,
    blockerCount: blockers.length,
    topBlockers: blockers.slice(0, 8).map((item) => ({
      name: item.name,
      detail: item.detail,
      severity: item.severity,
    })),
    requiredInputs: dryRun.requiredInputs || { variables: [], secrets: [] },
    dispatchCommand: dispatch.dispatch?.command || null,
    nextCommands: dryRun.nextCommands || [],
  };
}

function collectMobileReleaseStatus(options = {}) {
  const argv = options.argv || [];
  const env = options.env || process.env;
  const ref = options.ref || readArg(argv, '--ref', env.MOBILE_RELEASE_REF || 'main');
  const audit = options.audit || collectReleaseAudit();
  const targets = options.targets || TARGETS;
  const targetStatus = targets.map((target) => summarizeTarget(target, env, audit, ref));
  const publicRelease = options.publicRelease || collectMobilePublicReleaseGate({
    env,
    audit,
    performanceSmoke: options.performanceSmoke,
  });
  const androidPublicRelease = options.androidPublicRelease || collectMobilePublicReleaseGate({
    platform: 'android',
    env,
    audit,
    performanceSmoke: options.performanceSmoke,
  });
  const releaseStatus = audit.releaseStatus || {};
  const codeReady = isCodeReady(releaseStatus);
  const fullRelease = targetStatus.find((item) => item.id === 'full-release');
  const readyTargets = targetStatus.filter((item) => item.ready).map((item) => item.id);
  const blockedTargets = targetStatus.filter((item) => !item.ready).map((item) => item.id);
  const allBlockers = dedupeBlockers(targetStatus.flatMap((item) => item.topBlockers));

  return {
    generatedAt: new Date().toISOString(),
    ref,
    ok: codeReady === true,
    releaseReady: fullRelease?.readyToDispatch === true,
    summary: {
      codeReady,
      fullReleaseReady: fullRelease?.ready === true,
      fullReleaseDispatchReady: fullRelease?.readyToDispatch === true,
      publicStoreReady: publicRelease.ok === true,
      androidPublicStoreReady: androidPublicRelease.ok === true,
      readyTargets,
      blockedTargets,
      blockerCount: allBlockers.length,
    },
    app: audit.app,
    releaseStatus,
    artifacts: {
      releaseAudit: '.codex-build-cache/mobile-release-audit.json',
      releaseKit: '.codex-build-cache/mobile-release-kit.json',
      dryRun: '.codex-build-cache/mobile-release-dry-run.json',
      dispatchPlan: '.codex-build-cache/mobile-release-dispatch-plan.json',
      releaseStatus: '.codex-build-cache/mobile-release-status.json',
      publicReleaseGate: '.codex-build-cache/mobile-public-release-gate.json',
      androidPublicReleaseGate: '.codex-build-cache/mobile-public-release-gate-android.json',
      releaseSecretScan: '.codex-build-cache/mobile-release-secret-scan.json',
      uiReleaseGate: '.codex-build-cache/mobile-ui-release-gate.json',
      launchSla: '.codex-build-cache/mobile-launch-sla-report.json',
      storeSubmissionPackage: '.codex-build-cache/mobile-store-submission-package.json',
      githubSetupPlan: '.codex-build-cache/mobile-github-setup-plan.json',
      githubSetupPowerShell: '.codex-build-cache/mobile-github-setup.ps1',
    },
    targets: targetStatus,
    publicRelease: {
      ok: publicRelease.ok === true,
      summary: publicRelease.summary,
      blockers: (publicRelease.blockers || []).map((item) => ({
        name: item.name,
        detail: item.detail,
        severity: item.severity,
      })),
      releaseStatus: publicRelease.releaseStatus,
      artifact: '.codex-build-cache/mobile-public-release-gate.json',
    },
    androidPublicRelease: {
      ok: androidPublicRelease.ok === true,
      summary: androidPublicRelease.summary,
      blockers: (androidPublicRelease.blockers || []).map((item) => ({
        name: item.name,
        detail: item.detail,
        severity: item.severity,
      })),
      releaseStatus: androidPublicRelease.releaseStatus,
      artifact: '.codex-build-cache/mobile-public-release-gate-android.json',
    },
    externalBlockers: allBlockers,
    nextActions: fullRelease?.ready
      ? [
        fullRelease.dispatchCommand,
        'gh run watch --exit-status',
      ].filter(Boolean)
      : [
        'open .codex-build-cache/mobile-release-status.json',
        'open .codex-build-cache/mobile-github-setup.ps1',
        'npm run mobile:release-dry-run:save -- --target full-release --submit true --smoke true',
        'npm run mobile:release-dispatch-plan:save -- --target full-release --submit true --smoke true --ref main',
      ],
  };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const report = collectMobileReleaseStatus({ argv });
  const written = writeJson(report, readArg(argv, '--out', ''));
  console.log(JSON.stringify({ ...report, written }, null, 2));
  process.exit(argv.includes('--strict') && !report.releaseReady ? 1 : (report.ok ? 0 : 1));
}

module.exports = {
  TARGETS,
  collectMobileReleaseStatus,
  isCodeReady,
  writeJson,
};
