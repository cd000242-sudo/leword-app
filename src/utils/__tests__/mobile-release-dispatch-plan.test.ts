const {
  buildDispatchArgs,
  collectMobileReleaseDispatchPlan,
  executeMobileReleaseDispatch,
  renderCommand,
} = require('../../../scripts/mobile-release-dispatch-plan');

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

const readyDryRun = {
  ok: true,
  target: 'full-release',
  platform: 'all',
  blockers: [],
  releaseStatus: {
    codeReady: true,
    apiDeployReady: true,
    storeListingReady: true,
    storeAssetsReady: true,
    apiRuntimeReady: true,
    androidJsExportReady: true,
    androidSubmitReady: true,
    iosSubmitReady: true,
  },
  requiredInputs: {
    variables: ['LEWORD_MOBILE_API_URL'],
    secrets: ['EXPO_TOKEN'],
  },
  artifacts: {
    releaseAudit: '.codex-build-cache/mobile-release-audit.json',
  },
};

const ready = collectMobileReleaseDispatchPlan({
  target: 'full-release',
  submitToStores: true,
  runApiSmoke: true,
  ref: 'release/mobile-v1',
  dryRun: readyDryRun,
});

assert('dispatch plan is ready only after green dry-run',
  ready.readyToDispatch === true
    && ready.ok === true
    && ready.checks.every((item: any) => item.ok));

assert('dispatch plan builds exact GitHub workflow command',
  ready.dispatch.command.includes('gh workflow run mobile-release.yml')
    && ready.dispatch.command.includes('--ref release/mobile-v1')
    && ready.dispatch.command.includes('target=full-release')
    && ready.dispatch.command.includes('submit_to_stores=true')
    && ready.dispatch.command.includes('run_api_smoke=true'));

assert('dispatch plan never serializes secret-like values',
  !JSON.stringify(ready).includes('ghp_')
    && !JSON.stringify(ready).includes('expo-token'));

const args = buildDispatchArgs({
  target: 'android-internal',
  submitToStores: false,
  runApiSmoke: false,
  ref: 'main',
});
assert('dispatch args are workflow_dispatch compatible',
  args.includes('workflow')
    && args.includes('run')
    && args.includes('mobile-release.yml')
    && args.includes('target=android-internal')
    && args.includes('submit_to_stores=false')
    && args.includes('run_api_smoke=false'));

const publicArgs = buildDispatchArgs({
  target: 'android-public',
  submitToStores: true,
  runApiSmoke: true,
  ref: 'main',
});
assert('dispatch args support Android public release target',
  publicArgs.includes('target=android-public')
    && publicArgs.includes('submit_to_stores=true')
    && publicArgs.includes('run_api_smoke=true'));

assert('renderCommand quotes arguments only when needed',
  renderCommand('gh', ['run', 'watch', '--exit-status']) === 'gh run watch --exit-status');

const blocked = collectMobileReleaseDispatchPlan({
  target: 'full-release',
  submitToStores: true,
  runApiSmoke: true,
  ref: 'main',
  dryRun: {
    ...readyDryRun,
    ok: false,
    blockers: [
      {
        name: 'Production API URL is HTTPS',
        ok: false,
        detail: 'set EXPO_PUBLIC_LEWORD_API_URL',
        severity: 'external',
      },
    ],
  },
});

assert('dispatch plan blocks when dry-run is not green',
  blocked.readyToDispatch === false
    && blocked.blockers.some((item: any) => item.name === 'Release dry-run is green')
    && blocked.nextCommands.some((item: string) => item.includes('mobile:release-dry-run:save')));

const calls: string[] = [];
const blockedExecution = executeMobileReleaseDispatch(blocked, () => {
  calls.push('blocked');
  return { status: 0, stdout: '', stderr: '' };
});
assert('blocked dispatch never calls gh',
  calls.length === 0
    && blockedExecution.status === 1
    && /blocked/.test(blockedExecution.stderr));

const executed = executeMobileReleaseDispatch(ready, (command: string, execArgs: string[]) => {
  calls.push(command);
  return {
    status: command === 'gh' && execArgs.includes('target=full-release') ? 0 : 2,
    stdout: 'workflow dispatched',
    stderr: '',
  };
});
assert('ready dispatch can execute through injected runner',
  calls.length === 1
    && calls[0] === 'gh'
    && executed.status === 0
    && executed.stdout === 'workflow dispatched');

console.log('[mobile-release-dispatch-plan.test] passed');

export {};
