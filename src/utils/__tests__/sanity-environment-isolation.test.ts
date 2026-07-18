import fs from 'fs';
import os from 'os';
import path from 'path';

function assert(name: string, condition: boolean, detail = ''): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const originalCwd = process.cwd();
const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-sanity-env-'));
const isolatedAppData = path.join(runtimeDir, 'appdata');
const keysToRestore = [
  'APPDATA',
  'LOCALAPPDATA',
  'LEWORD_DISABLE_ENV_FILE_LOADING',
  'NAVER_CLIENT_ID',
  'NAVER_CLIENT_SECRET',
  'LEWORD_LIVE_GOLDEN_INGEST_URL',
  'LEWORD_LIVE_GOLDEN_INGEST_TOKEN',
] as const;
const originalEnv = new Map(keysToRestore.map((key) => [key, process.env[key]]));

try {
  fs.mkdirSync(isolatedAppData, { recursive: true });
  fs.writeFileSync(path.join(runtimeDir, '.env'), [
    'NAVER_CLIENT_ID=project-env-sentinel-id',
    'NAVER_CLIENT_SECRET=project-env-sentinel-secret',
    'LEWORD_LIVE_GOLDEN_INGEST_URL=https://sentinel.invalid/ingest',
    'LEWORD_LIVE_GOLDEN_INGEST_TOKEN=sentinel-ingest-token',
  ].join('\n'), 'utf8');

  process.chdir(runtimeDir);
  process.env['APPDATA'] = isolatedAppData;
  process.env['LOCALAPPDATA'] = isolatedAppData;
  process.env['LEWORD_DISABLE_ENV_FILE_LOADING'] = '1';
  process.env['NAVER_CLIENT_ID'] = '';
  process.env['NAVER_CLIENT_SECRET'] = '';
  process.env['LEWORD_LIVE_GOLDEN_INGEST_URL'] = '';
  process.env['LEWORD_LIVE_GOLDEN_INGEST_TOKEN'] = '';

  // Both files are tracked and can be selected by different local runtimes.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const tsModule = require(path.join(__dirname, '..', 'environment-manager.ts')) as typeof import('../environment-manager');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const jsModule = require(path.join(__dirname, '..', 'environment-manager.js')) as typeof import('../environment-manager');
  const tsConfig = new tsModule.EnvironmentManager().getConfig();
  const jsConfig = new jsModule.EnvironmentManager().getConfig();

  assert(
    'test isolation flag prevents TypeScript EnvironmentManager from loading project .env credentials',
    tsConfig.naverClientId !== 'project-env-sentinel-id'
      && tsConfig.naverClientSecret !== 'project-env-sentinel-secret',
    JSON.stringify({ clientId: tsConfig.naverClientId, hasSecret: !!tsConfig.naverClientSecret }),
  );
  assert(
    'test isolation flag prevents JavaScript EnvironmentManager from loading project .env credentials',
    jsConfig.naverClientId !== 'project-env-sentinel-id'
      && jsConfig.naverClientSecret !== 'project-env-sentinel-secret',
    JSON.stringify({ clientId: jsConfig.naverClientId, hasSecret: !!jsConfig.naverClientSecret }),
  );
  assert(
    'disabled env-file loading cannot inject live ingest write credentials into process.env',
    process.env['LEWORD_LIVE_GOLDEN_INGEST_URL'] === ''
      && process.env['LEWORD_LIVE_GOLDEN_INGEST_TOKEN'] === '',
  );

  const runnerSource = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'scripts', 'run-sanity-gate-test.js'),
    'utf8',
  );
  assert(
    'sanity runner disables env-file loading and blanks live credential aliases',
    runnerSource.includes("LEWORD_DISABLE_ENV_FILE_LOADING: '1'")
      && runnerSource.includes("LEWORD_LIVE_GOLDEN_INGEST_URL: ''")
      && runnerSource.includes("LEWORD_LIVE_GOLDEN_INGEST_TOKEN: ''")
      && runnerSource.includes("NAVER_SEARCHAD_ACCESS_LICENSE: ''")
      && runnerSource.includes("NAVER_SEARCHAD_SECRET_KEY: ''")
      && runnerSource.includes("NAVER_SEARCHAD_CUSTOMER_ID: ''")
      && runnerSource.includes("LEWORD_SEARCHAD_ACCOUNTS_FILE: ''")
      && runnerSource.includes("LEWORD_SEARCHAD_ACCOUNTS_B64: ''")
      && runnerSource.includes('LEWORD_SEARCHAD_QUOTA_STATE_FILE: path.join(isolatedRoot')
      && runnerSource.includes('LEWORD_SEARCHAD_VOLUME_CACHE_FILE: path.join(isolatedRoot'),
  );
} finally {
  process.chdir(originalCwd);
  for (const key of keysToRestore) {
    const value = originalEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(runtimeDir, { recursive: true, force: true });
}

console.log('[sanity-environment-isolation.test] passed');

export {};
