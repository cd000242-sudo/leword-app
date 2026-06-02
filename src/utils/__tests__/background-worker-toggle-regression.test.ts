/**
 * background-worker-toggle-regression.test.ts
 *
 * Background workers must be opt-in and must stop immediately when the user
 * disables them. Timers left behind after toggling OFF are a common source of
 * idle CPU usage and "the app is still working by itself" reports.
 */

import * as fs from 'fs';
import * as path from 'path';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`FAIL ${name}${detail ? ' - ' + detail : ''}`);
  }
}

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', '..', '..', rel), 'utf8');
}

const ipc = read('src/main/keywordMasterIpcHandlers.ts');
const refresh = read('src/main/key-wizard/refresh-scheduler.ts');
const autoHunt = read('src/utils/pro-hunter-v12/auto-hunting-scheduler.ts');
const lifecycle = read('src/utils/pro-hunter-v12/lifecycle-tracker.ts');
const rank = read('src/utils/pro-hunter-v12/rank-tracker.ts');
const precrawler = read('src/utils/pro-hunter-v12/precrawler.ts');
const surge = read('src/utils/pro-hunter-v12/trend-surge-detector.ts');

assert('background preference changes apply immediately',
  /async function applyBackgroundWorkerPreference/.test(ipc)
    && /await applyBackgroundWorkerPreference\(\!\!p\?\.enableBackgroundWorkers\)/.test(ipc),
  'perf-set-bg-pref only saves preference or waits for restart');

assert('main IPC imports all background stop functions',
  /stopRefreshScheduler/.test(ipc)
    && /stopLifecycleTracker/.test(ipc)
    && /stopRankTracker/.test(ipc)
    && /stopPrecrawler/.test(ipc)
    && /stopSurgeScanner/.test(ipc)
    && /stopAutoHuntingScheduler/.test(ipc)
    && /stopAutoHealthCheck/.test(ipc),
  'one or more worker stop functions are not wired');

assert('auto hunting scheduler exposes immediate stop',
  /export function stopAutoHuntingScheduler/.test(autoHunt)
    && /clearTimeout\(timer\)/.test(autoHunt)
    && /clearTimeout\(catchupTimer\)/.test(autoHunt),
  'auto hunting timers are not fully stoppable');

for (const [name, source] of [
  ['refresh scheduler', refresh],
  ['lifecycle tracker', lifecycle],
  ['rank tracker', rank],
  ['precrawler', precrawler],
  ['surge scanner', surge],
] as const) {
  assert(`${name} clears its initial delayed timer on stop`,
    /let initTimer: NodeJS\.Timeout \| null = null/.test(source)
      && /clearTimeout\(initTimer\)/.test(source),
    `${name} can leave a delayed first run alive after OFF`);
}

console.log(`\n[background-worker-toggle-regression.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
