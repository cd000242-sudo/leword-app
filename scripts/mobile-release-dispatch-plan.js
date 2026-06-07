const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  collectMobileReleaseDryRun,
} = require('./mobile-release-dry-run');
const {
  normalizeTarget,
} = require('./mobile-ci-secrets-gate');

const root = path.join(__dirname, '..');
const WORKFLOW_FILE = 'mobile-release.yml';
const WORKFLOW_DISPATCH_PREFIX = 'gh workflow run mobile-release.yml';

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

function currentGitRef(runner = spawnSync) {
  const result = runner('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const ref = String(result.stdout || '').trim();
  return ref && ref !== 'HEAD' ? ref : 'main';
}

function quoteArg(value) {
  const text = String(value);
  return /^[A-Za-z0-9_./:=@-]+$/.test(text) ? text : `"${text.replace(/"/g, '\\"')}"`;
}

function renderCommand(command, args) {
  return [command, ...args].map(quoteArg).join(' ');
}

function buildDispatchArgs(plan) {
  return [
    'workflow',
    'run',
    WORKFLOW_FILE,
    '--ref',
    plan.ref,
    '-f',
    `target=${plan.target}`,
    '-f',
    `submit_to_stores=${plan.submitToStores}`,
    '-f',
    `run_api_smoke=${plan.runApiSmoke}`,
  ];
}

function buildFollowUpCommands(plan) {
  return [
    `gh run list --workflow ${WORKFLOW_FILE} --branch ${quoteArg(plan.ref)} --limit 5`,
    'gh run watch --exit-status',
  ];
}

function collectMobileReleaseDispatchPlan(options = {}) {
  const argv = options.argv || [];
  const env = options.env || process.env;
  const target = normalizeTarget(options.target || readArg(argv, '--target', env.MOBILE_RELEASE_TARGET || 'verify-only'));
  const submitToStores = options.submitToStores ?? isTruthy(readArg(argv, '--submit', env.SUBMIT_TO_STORES || 'false'));
  const runApiSmoke = options.runApiSmoke ?? isTruthy(readArg(argv, '--smoke', env.RUN_API_SMOKE || 'false'));
  const ref = options.ref || readArg(argv, '--ref', env.MOBILE_RELEASE_REF || currentGitRef(options.runner || spawnSync));

  const dryRun = options.dryRun || collectMobileReleaseDryRun({
    target,
    submitToStores,
    runApiSmoke,
    env,
    audit: options.audit,
    storeCompliance: options.storeCompliance,
  });

  const dispatchSeed = {
    target,
    submitToStores,
    runApiSmoke,
    ref,
  };
  const dispatchArgs = buildDispatchArgs(dispatchSeed);
  const dispatchCommand = renderCommand('gh', dispatchArgs);
  const followUpCommands = buildFollowUpCommands(dispatchSeed);

  const checks = [
    check('Release dry-run is green',
      dryRun.ok === true,
      'full dispatch is allowed only after local release evidence and external target inputs are green',
      dryRun.ok === true ? 'required' : 'external'),
    check('Workflow ref is explicit',
      !!ref,
      'set --ref or MOBILE_RELEASE_REF so the exact branch/tag is dispatched'),
    check('Store submission flag is explicit',
      typeof submitToStores === 'boolean',
      'submit_to_stores is always passed to workflow_dispatch'),
    check('API smoke flag is explicit',
      typeof runApiSmoke === 'boolean',
      'run_api_smoke is always passed to workflow_dispatch'),
  ];
  const summary = summarize(checks);
  const readyToDispatch = dryRun.ok === true && summary.failedRequired === 0 && summary.failedExternal === 0;

  return {
    generatedAt: new Date().toISOString(),
    workflow: WORKFLOW_FILE,
    target,
    ref,
    submitToStores,
    runApiSmoke,
    readyToDispatch,
    ok: readyToDispatch,
    summary,
    checks,
    blockers: [
      ...checks.filter((item) => !item.ok),
      ...(Array.isArray(dryRun.blockers) ? dryRun.blockers : []),
    ],
    dispatch: {
      command: dispatchCommand,
      commandPrefix: WORKFLOW_DISPATCH_PREFIX,
      args: dispatchArgs,
      note: 'Run only after placeholders are replaced, GitHub variables/secrets are set, and dry-run is green.',
    },
    followUpCommands,
    dryRun: {
      ok: dryRun.ok === true,
      target: dryRun.target,
      platform: dryRun.platform,
      releaseStatus: dryRun.releaseStatus,
      requiredInputs: dryRun.requiredInputs,
      artifacts: dryRun.artifacts,
    },
    nextCommands: readyToDispatch
      ? [
        dispatchCommand,
        ...followUpCommands,
      ]
      : [
        `npm run mobile:release-dry-run:save -- --target ${target} --submit ${submitToStores} --smoke ${runApiSmoke}`,
        'open .codex-build-cache/mobile-release-dry-run.json',
        'open .codex-build-cache/mobile-github-setup.ps1',
      ],
  };
}

function executeMobileReleaseDispatch(plan, runner = spawnSync) {
  if (!plan.readyToDispatch) {
    return {
      status: 1,
      stdout: '',
      stderr: 'mobile release dispatch is blocked because dry-run is not green',
    };
  }

  const result = runner('gh', plan.dispatch.args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    status: result.status ?? 0,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const plan = collectMobileReleaseDispatchPlan({ argv });
  const writtenPath = writeJson(plan, readArg(argv, '--out', ''));
  console.log(JSON.stringify(plan, null, 2));
  if (writtenPath) {
    console.error(`[mobile-release-dispatch-plan] wrote ${writtenPath}`);
  }

  if (argv.includes('--execute')) {
    const result = executeMobileReleaseDispatch(plan);
    if (result.stdout) console.log(result.stdout);
    if (result.stderr) console.error(result.stderr);
    process.exit(result.status || 0);
  }

  process.exit(argv.includes('--strict') && !plan.readyToDispatch ? 1 : 0);
}

module.exports = {
  buildDispatchArgs,
  collectMobileReleaseDispatchPlan,
  executeMobileReleaseDispatch,
  renderCommand,
};
