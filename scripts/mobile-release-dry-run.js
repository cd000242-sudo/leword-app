const fs = require('fs');
const path = require('path');

const {
  collectReleaseAudit,
  writeReleaseAudit,
} = require('./mobile-release-audit');
const {
  collectMobileReleaseKit,
  platformForTarget,
  writeMobileReleaseKit,
} = require('./mobile-release-kit');
const {
  collectMobileGithubSetupPlan,
  renderPowerShell,
} = require('./mobile-github-setup-plan');
const {
  normalizeTarget,
} = require('./mobile-ci-secrets-gate');

const root = path.join(__dirname, '..');

function readArg(argv, name, fallback = '') {
  const equals = argv.find((arg) => arg.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? (argv[index + 1] || fallback) : fallback;
}

function isTruthy(value) {
  return ['1', 'true', 'yes', 'y'].includes(String(value || '').trim().toLowerCase());
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

function writeText(value, outPath) {
  const resolved = resolveOut(outPath);
  if (!resolved) return null;
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, value, 'utf8');
  return resolved;
}

function check(name, ok, detail, severity = 'required') {
  return { name, ok: !!ok, detail, severity };
}

function summarize(checks) {
  return {
    passed: checks.filter((item) => item.ok).length,
    failedRequired: checks.filter((item) => !item.ok && item.severity === 'required').length,
    failedExternal: checks.filter((item) => !item.ok && item.severity === 'external').length,
  };
}

function collectMobileReleaseDryRun(options = {}) {
  const argv = options.argv || [];
  const env = options.env || process.env;
  const target = normalizeTarget(options.target || readArg(argv, '--target', env.MOBILE_RELEASE_TARGET || 'verify-only'));
  const submitToStores = options.submitToStores ?? isTruthy(readArg(argv, '--submit', env.SUBMIT_TO_STORES || 'false'));
  const runApiSmoke = options.runApiSmoke ?? isTruthy(readArg(argv, '--smoke', env.RUN_API_SMOKE || 'false'));
  const platform = options.platform || platformForTarget(target, readArg(argv, '--platform', ''));

  const audit = options.audit || collectReleaseAudit();
  const releaseKit = options.releaseKit || collectMobileReleaseKit({
    target,
    platform,
    submitToStores,
    runApiSmoke,
    env,
    audit,
    storeCompliance: options.storeCompliance,
  });
  const githubSetupPlan = options.githubSetupPlan || collectMobileGithubSetupPlan({
    target,
    submitToStores,
    runApiSmoke,
    requiredInputs: releaseKit.requiredInputs,
  });

  const checks = [
    check('Release audit generated',
      !!audit?.generatedAt && audit.releaseStatus?.codeReady === true,
      'audit must include green local code readiness'),
    check('Release kit generated',
      !!releaseKit?.generatedAt && Array.isArray(releaseKit.blockers),
      'release kit must summarize target readiness and blockers'),
    check('GitHub setup plan generated',
      githubSetupPlan?.safeToCommit === true
        && Array.isArray(githubSetupPlan.variables)
        && Array.isArray(githubSetupPlan.secrets),
      'setup plan must use safe example or placeholder gh commands'),
    check('Selected target is deployable',
      releaseKit.ok === true,
      'false means dry-run found missing external inputs or target blockers',
      'external'),
  ];

  const summary = summarize(checks);
  return {
    generatedAt: new Date().toISOString(),
    target,
    platform,
    submitToStores,
    runApiSmoke,
    ok: releaseKit.ok === true && summary.failedRequired === 0 && summary.failedExternal === 0,
    summary,
    checks,
    blockers: [
      ...checks.filter((item) => !item.ok),
      ...(Array.isArray(releaseKit.blockers) ? releaseKit.blockers : []),
    ],
    artifacts: {
      releaseAudit: options.auditOut || '.codex-build-cache/mobile-release-audit.json',
      releaseKit: options.kitOut || '.codex-build-cache/mobile-release-kit.json',
      githubSetupPlan: options.githubPlanOut || '.codex-build-cache/mobile-github-setup-plan.json',
      githubSetupPowerShell: options.githubSetupPs1 || '.codex-build-cache/mobile-github-setup.ps1',
    },
    releaseStatus: releaseKit.releaseStatus,
    requiredInputs: releaseKit.requiredInputs,
    nextCommands: releaseKit.ok
      ? releaseKit.nextCommands
      : [
        'open .codex-build-cache/mobile-release-dry-run.json',
        'open .codex-build-cache/mobile-github-setup.ps1',
        ...releaseKit.nextCommands,
      ],
    releaseKit,
    githubSetupPlan,
  };
}

function writeMobileReleaseDryRun(report, outputs = {}) {
  const written = {};

  if (report.releaseKit) {
    written.releaseKit = writeMobileReleaseKit(report.releaseKit, outputs.kitOut || report.artifacts.releaseKit);
  }

  if (report.githubSetupPlan) {
    written.githubSetupPlan = writeJson(report.githubSetupPlan, outputs.githubPlanOut || report.artifacts.githubSetupPlan);
    written.githubSetupPowerShell = writeText(
      renderPowerShell(report.githubSetupPlan),
      outputs.githubSetupPs1 || report.artifacts.githubSetupPowerShell,
    );
  }

  if (outputs.auditReport) {
    written.releaseAudit = writeReleaseAudit(outputs.auditReport, outputs.auditOut || report.artifacts.releaseAudit);
  }

  written.dryRun = writeJson(report, outputs.out);
  return written;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const auditOut = readArg(argv, '--audit-out', '.codex-build-cache/mobile-release-audit.json');
  const kitOut = readArg(argv, '--kit-out', '.codex-build-cache/mobile-release-kit.json');
  const githubPlanOut = readArg(argv, '--github-plan-out', '.codex-build-cache/mobile-github-setup-plan.json');
  const githubSetupPs1 = readArg(argv, '--github-setup-ps1', '.codex-build-cache/mobile-github-setup.ps1');
  const audit = collectReleaseAudit();
  const report = collectMobileReleaseDryRun({
    argv,
    audit,
    auditOut,
    kitOut,
    githubPlanOut,
    githubSetupPs1,
  });
  const written = writeMobileReleaseDryRun(report, {
    out: readArg(argv, '--out', '.codex-build-cache/mobile-release-dry-run.json'),
    auditReport: audit,
    auditOut,
    kitOut,
    githubPlanOut,
    githubSetupPs1,
  });
  console.log(JSON.stringify({ ...report, written }, null, 2));
  process.exit(argv.includes('--strict') && !report.ok ? 1 : 0);
}

module.exports = {
  collectMobileReleaseDryRun,
  writeMobileReleaseDryRun,
};
