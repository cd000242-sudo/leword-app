import { spawnSync, type SpawnSyncReturns } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const root = path.join(__dirname, '..', '..', '..');
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'searchad-quota-fail-closed-'));
const quotaFile = path.join(fixtureRoot, 'searchad-quota-state.json');

function currentKstDate(offsetDays = 0): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function reserve(): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [
    '-r',
    'ts-node/register/transpile-only',
    '-e',
    "const quota=require('./src/utils/searchad-quota-governor');process.stdout.write(String(quota.reserveSearchAdCall('account',1,10)));",
  ], {
    cwd: root,
    encoding: 'utf8',
    timeout: 5_000,
    env: {
      ...process.env,
      LEWORD_SEARCHAD_QUOTA_STATE_FILE: quotaFile,
      LEWORD_SEARCHAD_QUOTA_LOCK_WAIT_MS: '100',
    },
  });
}

try {
  fs.writeFileSync(quotaFile, '{invalid-json', 'utf8');
  const corrupt = reserve();
  assert('corrupt current ledger fails closed before reservation',
    corrupt.status !== 0 && fs.readFileSync(quotaFile, 'utf8') === '{invalid-json',
    corrupt.stderr || corrupt.stdout);

  fs.writeFileSync(quotaFile, JSON.stringify({
    schemaVersion: 'searchad-quota-v1',
    date: currentKstDate(),
    byAccount: { account: 'not-a-number' },
  }), 'utf8');
  const invalidCount = reserve();
  assert('non-numeric current usage cannot bypass the ceiling comparison',
    invalidCount.status !== 0,
    invalidCount.stderr || invalidCount.stdout);

  const realLedger = path.join(fixtureRoot, 'real-ledger.json');
  fs.writeFileSync(realLedger, JSON.stringify({
    schemaVersion: 'searchad-quota-v1',
    date: currentKstDate(),
    byAccount: { account: 9 },
  }), 'utf8');
  let symlinkCreated = false;
  fs.rmSync(quotaFile, { force: true });
  try {
    fs.symlinkSync(realLedger, quotaFile, 'file');
    symlinkCreated = true;
  } catch (error: any) {
    if (!['EPERM', 'EACCES'].includes(String(error?.code || ''))) throw error;
  }
  if (symlinkCreated) {
    const linked = reserve();
    assert('symbolic-link quota ledgers fail closed without mutating the target',
      linked.status !== 0
        && JSON.parse(fs.readFileSync(realLedger, 'utf8')).byAccount.account === 9,
      linked.stderr || linked.stdout);
    fs.unlinkSync(quotaFile);
  }

  fs.writeFileSync(quotaFile, JSON.stringify({
    schemaVersion: 'searchad-quota-v1',
    date: currentKstDate(),
    byAccount: { account: 5 },
  }), 'utf8');
  fs.mkdirSync(`${quotaFile}.lock`);
  const activeLock = reserve();
  assert('an active or orphaned lock times out without being broken or lowering usage',
    activeLock.status !== 0
      && fs.existsSync(`${quotaFile}.lock`)
      && JSON.parse(fs.readFileSync(quotaFile, 'utf8')).byAccount.account === 5,
    activeLock.stderr || activeLock.stdout);
  fs.rmdirSync(`${quotaFile}.lock`);

  fs.writeFileSync(quotaFile, JSON.stringify({
    schemaVersion: 'searchad-quota-v1',
    date: currentKstDate(1),
    byAccount: { account: 1 },
  }), 'utf8');
  const futureDate = reserve();
  assert('a future KST ledger date fails closed instead of resetting usage',
    futureDate.status !== 0,
    futureDate.stderr || futureDate.stdout);

  fs.writeFileSync(quotaFile, JSON.stringify({
    schemaVersion: 'searchad-quota-v1',
    date: currentKstDate(),
    byAccount: { account: 5 },
  }), 'utf8');
  const transientMissing: SpawnSyncReturns<string> = spawnSync(process.execPath, [
    '-r',
    'ts-node/register/transpile-only',
    '-e',
    `const fs=require('fs');const quota=require('./src/utils/searchad-quota-governor');quota.searchAdCallsToday('account');fs.unlinkSync(process.env.LEWORD_SEARCHAD_QUOTA_STATE_FILE);process.stdout.write(String(quota.reserveSearchAdCall('account',1,10)));`,
  ], {
    cwd: root,
    encoding: 'utf8',
    timeout: 5_000,
    env: {
      ...process.env,
      LEWORD_SEARCHAD_QUOTA_STATE_FILE: quotaFile,
      LEWORD_SEARCHAD_QUOTA_LOCK_WAIT_MS: '100',
    },
  });
  assert('a transiently missing ledger cannot erase same-process reserved usage',
    transientMissing.status === 0
      && transientMissing.stdout.trim() === 'true'
      && JSON.parse(fs.readFileSync(quotaFile, 'utf8')).byAccount.account === 6,
    transientMissing.stderr || transientMissing.stdout);

  fs.writeFileSync(quotaFile, JSON.stringify({
    schemaVersion: 'searchad-quota-v1',
    date: currentKstDate(-1),
    byAccount: { account: 10 },
  }), 'utf8');
  const rollover = reserve();
  const rolledState = JSON.parse(fs.readFileSync(quotaFile, 'utf8'));
  assert('a valid previous KST day is the only on-disk state allowed to reset',
    rollover.status === 0
      && rollover.stdout.trim() === 'true'
      && rolledState.date === currentKstDate()
      && rolledState.byAccount.account === 1,
    rollover.stderr || rollover.stdout);
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log('[searchad-quota-fail-closed.test] passed');

export {};
