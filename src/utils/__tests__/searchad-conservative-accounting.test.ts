import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const root = path.join(__dirname, '..', '..', '..');
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'searchad-conservative-accounting-'));
const quotaFile = path.join(fixtureRoot, 'searchad-quota-state.json');

function runAttempt(mode: 'success' | 'http-failure' | 'abort'): void {
  const script = `
    process.env.LEWORD_SEARCHAD_QUOTA_STATE_FILE=${JSON.stringify(quotaFile)};
    process.env.LEWORD_SEARCHAD_SOFT_CEILING='20';
    global.fetch=async()=>{
      if (${JSON.stringify(mode)}==='abort') { const error=new Error('aborted'); error.name='AbortError'; throw error; }
      if (${JSON.stringify(mode)}==='http-failure') return {ok:false,status:400,statusText:'Bad Request'};
      return {ok:true,status:200,statusText:'OK',json:async()=>({keywordList:[]})};
    };
    const api=require('./src/utils/naver-searchad-api');
    api.getNaverSearchAdKeywordSuggestions({accessLicense:'test-license',secretKey:'test-secret',customerId:'123'},'testseed',10)
      .then(()=>process.exit(0)).catch((error)=>{console.error(error);process.exit(2);});
  `;
  const result = spawnSync(process.execPath, [
    '-r',
    'ts-node/register/transpile-only',
    '-e',
    script,
  ], { cwd: root, encoding: 'utf8', timeout: 20_000 });
  assert(`${mode} attempt completes`, result.status === 0, result.stderr || result.stdout);
}

try {
  const expectedCounts = [
    ['success', 1],
    ['http-failure', 2],
    ['abort', 3],
  ] as const;
  for (const [mode, expected] of expectedCounts) {
    runAttempt(mode);
    const state = JSON.parse(fs.readFileSync(quotaFile, 'utf8'));
    const calls = Object.values(state.byAccount || {}).reduce(
      (sum: number, value: any) => sum + Number(value || 0),
      0,
    );
    assert(`${mode} keeps a conservative pre-send reservation`,
      calls === expected,
      JSON.stringify(state));
  }
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log('[searchad-conservative-accounting.test] passed');

export {};
