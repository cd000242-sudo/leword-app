import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'searchad-quota-concurrency-'));
const quotaFile = path.join(fixtureRoot, 'searchad-quota-state.json');

function runWriter(calls: number): Promise<void> {
  const script = [
    `process.env.LEWORD_SEARCHAD_QUOTA_STATE_FILE=${JSON.stringify(quotaFile)};`,
    `const quota=require('./src/utils/searchad-quota-governor');`,
    `for(let i=0;i<${calls};i+=1) quota.recordSearchAdCall('shared-account',1);`,
  ].join('');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-r', 'ts-node/register/transpile-only', '-e', script], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`quota writer exited ${code}: ${stderr}`));
    });
  });
}

function runReservation(ceiling: number): Promise<boolean> {
  const script = [
    `process.env.LEWORD_SEARCHAD_QUOTA_STATE_FILE=${JSON.stringify(quotaFile)};`,
    `const quota=require('./src/utils/searchad-quota-governor');`,
    `process.stdout.write(String(quota.reserveSearchAdCall('shared-account',1,${ceiling})));`,
  ].join('');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-r', 'ts-node/register/transpile-only', '-e', script], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve(stdout.trim() === 'true');
      else reject(new Error(`quota reservation exited ${code}: ${stderr}`));
    });
  });
}

async function run(): Promise<void> {
  await Promise.all([runWriter(100), runWriter(100), runWriter(100)]);
  const state = JSON.parse(fs.readFileSync(quotaFile, 'utf8'));
  assert('concurrent API and worker quota writes are never lost',
    state.byAccount?.['shared-account'] === 300,
    JSON.stringify(state));

  const ceiling = 305;
  const reservations = await Promise.all(Array.from({ length: 12 }, () => runReservation(ceiling)));
  const reservedCount = reservations.filter(Boolean).length;
  const reservedState = JSON.parse(fs.readFileSync(quotaFile, 'utf8'));
  assert('ceiling check and reservation are one cross-process transaction',
    reservedCount === 5 && reservedState.byAccount?.['shared-account'] === ceiling,
    JSON.stringify({ reservedCount, reservedState }));

  const restartRead = spawnSync(process.execPath, [
    '-r',
    'ts-node/register/transpile-only',
    '-e',
    `process.env.LEWORD_SEARCHAD_QUOTA_STATE_FILE=${JSON.stringify(quotaFile)};const quota=require('./src/utils/searchad-quota-governor');process.stdout.write(String(quota.searchAdCallsToday('shared-account')));`,
  ], { cwd: process.cwd(), encoding: 'utf8' });
  assert('a restarted process reads the fully reserved ceiling from disk',
    restartRead.status === 0 && restartRead.stdout.trim() === String(ceiling),
    restartRead.stderr || restartRead.stdout);

  fs.writeFileSync(quotaFile, JSON.stringify({
    schemaVersion: 'searchad-quota-v1',
    date: reservedState.date,
    byAccount: { 'physical-limit-account': 24_999 },
  }), 'utf8');
  const physicalLimitProbe = spawnSync(process.execPath, [
    '-r',
    'ts-node/register/transpile-only',
    '-e',
    `const quota=require('./src/utils/searchad-quota-governor');const pool=require('./src/utils/searchad-account-pool');const first=quota.reserveSearchAdCall('physical-limit-account',1,30000);const second=quota.reserveSearchAdCall('physical-limit-account',1,30000);const account={accessLicense:'access',secretKey:'secret',customerId:'physical'};const selected=pool.selectSearchAdAccount([account],{softCeiling:30000,callsFor:()=>25000});const summary=pool.summarizeSearchAdAccountPool([account],{softCeiling:30000,dailyLimit:30000,callsFor:()=>25000});process.stdout.write(JSON.stringify({first,second,remaining:quota.searchAdRemaining('physical-limit-account',30000),exhausted:quota.searchAdExhausted('physical-limit-account',30000),soft:quota.searchAdSoftCeiling(),daily:quota.searchAdDailyLimit(),selected,summary}));`,
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 10_000,
    env: {
      ...process.env,
      LEWORD_SEARCHAD_QUOTA_STATE_FILE: quotaFile,
      LEWORD_SEARCHAD_SOFT_CEILING: '30000',
      LEWORD_SEARCHAD_DAILY_LIMIT: '30000',
    },
  });
  const physicalLimitResult = JSON.parse(physicalLimitProbe.stdout || '{}');
  const physicalLimitState = JSON.parse(fs.readFileSync(quotaFile, 'utf8'));
  assert('caller and environment ceilings cannot authorize the 25,001st physical SearchAd call',
    physicalLimitProbe.status === 0
      && physicalLimitResult.first === true
      && physicalLimitResult.second === false
      && physicalLimitResult.remaining === 0
      && physicalLimitResult.exhausted === true
      && physicalLimitResult.soft === 25_000
      && physicalLimitResult.daily === 25_000
      && physicalLimitResult.selected === null
      && physicalLimitResult.summary?.remaining === 0
      && physicalLimitResult.summary?.softCeiling === 25_000
      && physicalLimitResult.summary?.dailyLimit === 25_000
      && physicalLimitResult.summary?.exhausted === true
      && physicalLimitState.byAccount?.['physical-limit-account'] === 25_000,
    physicalLimitProbe.stderr || physicalLimitProbe.stdout);
}

run()
  .then(() => console.log('[searchad-quota-concurrency.test] passed'))
  .finally(() => {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  });

export {};
