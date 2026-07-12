import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const quotaFile = path.join(process.cwd(), 'tmp', 'searchad-quota-concurrency-test.json');
fs.mkdirSync(path.dirname(quotaFile), { recursive: true });
fs.rmSync(quotaFile, { force: true });
fs.rmSync(`${quotaFile}.lock`, { force: true });

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

async function run(): Promise<void> {
  await Promise.all([runWriter(100), runWriter(100), runWriter(100)]);
  const state = JSON.parse(fs.readFileSync(quotaFile, 'utf8'));
  assert('concurrent API and worker quota writes are never lost',
    state.byAccount?.['shared-account'] === 300,
    JSON.stringify(state));
}

run()
  .then(() => console.log('[searchad-quota-concurrency.test] passed'))
  .finally(() => {
    fs.rmSync(quotaFile, { force: true });
    fs.rmSync(`${quotaFile}.lock`, { force: true });
  });

export {};
