const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const root = path.join(__dirname, '..', '..', '..');
const modulePath = path.join(root, 'src', 'utils', 'naver-blog-api.ts');
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-openapi-quota-concurrency-'));
const quotaFile = path.join(fixtureRoot, 'quota', 'naver-openapi-quota-state.json');
const fixedNow = Date.now();

function nextKstMidnightMs(nowMs: number): number {
  const kst = new Date(nowMs + 9 * 60 * 60 * 1000);
  return Date.UTC(
    kst.getUTCFullYear(),
    kst.getUTCMonth(),
    kst.getUTCDate() + 1,
  ) - 9 * 60 * 60 * 1000;
}
const childSource = `
  require('ts-node/register/transpile-only');
  const api = require(process.env.LEWORD_TEST_NAVER_MODULE);
  const credential = JSON.parse(process.env.LEWORD_TEST_CREDENTIAL);
  api.isNaverBlogOpenApiQuotaBlocked({ env: {
    NAVER_CLIENT_ID: credential.clientId,
    NAVER_CLIENT_SECRET: credential.clientSecret,
  } }, Number(process.env.LEWORD_TEST_NOW));
  process.stdout.write('READY\\n');
  process.stdin.once('data', () => {
    try {
      api.markNaverBlogOpenApiQuotaBlocked(credential, Number(process.env.LEWORD_TEST_NOW));
      process.stdout.write('DONE\\n');
      process.exit(0);
    } catch (error) {
      process.stderr.write(String(error && error.stack || error));
      process.exit(2);
    }
  });
  process.stdin.resume();
`;

function credentialKey(credential: { clientId: string; clientSecret: string }): string {
  return crypto.createHash('sha256')
    .update(`${credential.clientId}\n${credential.clientSecret}`)
    .digest('hex');
}

function startPreparedMarker(credential: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', childSource], {
      cwd: root,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        LEWORD_NAVER_OPENAPI_QUOTA_STATE_FILE: quotaFile,
        LEWORD_TEST_NAVER_MODULE: modulePath,
        LEWORD_TEST_CREDENTIAL: JSON.stringify(credential),
        LEWORD_TEST_NOW: String(fixedNow),
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      if (stdout.includes('READY\n')) resolve({ child, stdout: () => stdout, stderr: () => stderr });
    });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    child.once('error', reject);
    child.once('exit', (code: number) => {
      if (!stdout.includes('READY\n')) reject(new Error(`marker exited before ready (${code}): ${stderr}`));
    });
  });
}

function waitForExit(marker: any): Promise<void> {
  return new Promise((resolve, reject) => {
    marker.child.once('exit', (code: number) => {
      if (code === 0) resolve();
      else reject(new Error(`marker failed (${code}): ${marker.stderr()}`));
    });
  });
}

async function main(): Promise<void> {
  try {
    const credentials = Array.from({ length: 6 }, (_, index) => ({
      clientId: `quota-client-${index}`,
      clientSecret: `quota-secret-${index}`,
      label: `quota-${index}`,
    }));
    const markers = await Promise.all(credentials.map(startPreparedMarker));
    const exits = markers.map(waitForExit);
    for (const marker of markers) marker.child.stdin.write('MARK\n');
    await Promise.all(exits);

    const persisted = JSON.parse(fs.readFileSync(quotaFile, 'utf8'));
    assert('concurrent API and worker cooldown writes retain every exhausted credential',
      credentials.every((credential) => (
        Number(persisted.blockedUntilByKey?.[credentialKey(credential)] || 0) > fixedNow
      )), JSON.stringify(persisted));
    assert('quota state uses the expected schema and no lower legacy cooldown',
      persisted.schemaVersion === 1
        && Number(persisted.legacyBlockedUntil || 0) >= 0);
    const expectedRetryAt = nextKstMidnightMs(fixedNow);
    assert('daily quota exhaustion blocks every exhausted credential until the next KST midnight',
      credentials.every((credential) => (
        Number(persisted.blockedUntilByKey?.[credentialKey(credential)] || 0) === expectedRetryAt
      )), JSON.stringify({ expectedRetryAt, persisted }));

    const allBlockedProbe = spawnSync(process.execPath, [
      '-r',
      'ts-node/register/transpile-only',
      '-e',
      `const api=require(${JSON.stringify(modulePath)});const pool=JSON.parse(process.env.LEWORD_TEST_POOL);const env={NAVER_OPENAPI_KEY_POOL:JSON.stringify(pool)};process.stdout.write(JSON.stringify({blocked:api.isNaverBlogOpenApiQuotaBlocked({env},Number(process.env.LEWORD_TEST_NOW)),nextRetryAt:api.getNaverBlogOpenApiQuotaBlockedUntil({env},Number(process.env.LEWORD_TEST_NOW))}));`,
    ], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        LEWORD_NAVER_OPENAPI_QUOTA_STATE_FILE: quotaFile,
        LEWORD_TEST_POOL: JSON.stringify(credentials),
        LEWORD_TEST_NOW: String(fixedNow),
      },
    });
    const allBlocked = JSON.parse(allBlockedProbe.stdout || '{}');
    assert('multi-account nextRetryAt reports KST midnight only when every configured credential is blocked',
      allBlockedProbe.status === 0
        && allBlocked.blocked === true
        && allBlocked.nextRetryAt === expectedRetryAt,
      allBlockedProbe.stderr || allBlockedProbe.stdout);

    const partiallyBlockedProbe = spawnSync(process.execPath, [
      '-r',
      'ts-node/register/transpile-only',
      '-e',
      `const api=require(${JSON.stringify(modulePath)});const pool=JSON.parse(process.env.LEWORD_TEST_POOL);const env={NAVER_OPENAPI_KEY_POOL:JSON.stringify(pool)};process.stdout.write(JSON.stringify({blocked:api.isNaverBlogOpenApiQuotaBlocked({env},Number(process.env.LEWORD_TEST_NOW)),nextRetryAt:api.getNaverBlogOpenApiQuotaBlockedUntil({env},Number(process.env.LEWORD_TEST_NOW))}));`,
    ], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        LEWORD_NAVER_OPENAPI_QUOTA_STATE_FILE: quotaFile,
        LEWORD_TEST_POOL: JSON.stringify([
          ...credentials,
          { clientId: 'fresh-client', clientSecret: 'fresh-secret', label: 'fresh' },
        ]),
        LEWORD_TEST_NOW: String(fixedNow),
      },
    });
    const partiallyBlocked = JSON.parse(partiallyBlockedProbe.stdout || '{}');
    assert('one healthy credential keeps the multi-account pool available without a retry timestamp',
      partiallyBlockedProbe.status === 0
        && partiallyBlocked.blocked === false
        && partiallyBlocked.nextRetryAt === null,
      partiallyBlockedProbe.stderr || partiallyBlockedProbe.stdout);

    let persistedBaseNow = fixedNow;
    if (nextKstMidnightMs(persistedBaseNow) - persistedBaseNow <= 10 * 60 * 1000) {
      persistedBaseNow -= 12 * 60 * 60 * 1000;
    }
    const persistedProbeNow = persistedBaseNow + 6 * 60 * 1000;
    const persistedRetryAt = nextKstMidnightMs(persistedBaseNow);
    const persistedCredential = {
      clientId: 'persisted-daily-client',
      clientSecret: 'persisted-daily-secret',
      label: 'persisted-daily',
    };
    fs.writeFileSync(quotaFile, JSON.stringify({
      schemaVersion: 1,
      savedAt: new Date(persistedBaseNow - 60_000).toISOString(),
      legacyBlockedUntil: 0,
      blockedUntilByKey: {
        [credentialKey(persistedCredential)]: persistedRetryAt,
      },
    }), 'utf8');
    const persistedDailyProbe = spawnSync(process.execPath, [
      '-r',
      'ts-node/register/transpile-only',
      '-e',
      `const api=require(${JSON.stringify(modulePath)});const credential=JSON.parse(process.env.LEWORD_TEST_CREDENTIAL);const fallback={clientId:credential.clientId,clientSecret:credential.clientSecret};const now=Number(process.env.LEWORD_TEST_NOW);process.stdout.write(JSON.stringify({blocked:api.isNaverBlogOpenApiQuotaBlocked(fallback,now),nextRetryAt:api.getNaverBlogOpenApiQuotaBlockedUntil(fallback,now)}));`,
    ], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        LEWORD_NAVER_OPENAPI_QUOTA_STATE_FILE: quotaFile,
        LEWORD_TEST_CREDENTIAL: JSON.stringify(persistedCredential),
        LEWORD_TEST_NOW: String(persistedProbeNow),
      },
    });
    const persistedDailyResult = JSON.parse(persistedDailyProbe.stdout || '{}');
    assert('a daily block persists across restart even when savedAt is more than five minutes old',
      persistedDailyProbe.status === 0
        && persistedDailyResult.blocked === true
        && persistedDailyResult.nextRetryAt === persistedRetryAt,
      persistedDailyProbe.stderr || persistedDailyProbe.stdout);
    fs.writeFileSync(quotaFile, JSON.stringify(persisted), 'utf8');

    const futureSavedAtState = {
      ...persisted,
      savedAt: new Date(fixedNow + 10 * 60 * 1000).toISOString(),
    };
    fs.writeFileSync(quotaFile, JSON.stringify(futureSavedAtState), 'utf8');
    const futureSavedAtProbe = spawnSync(process.execPath, [
      '-r',
      'ts-node/register/transpile-only',
      '-e',
      `const api=require(${JSON.stringify(modulePath)});api.isNaverBlogOpenApiQuotaBlocked({clientId:'future',clientSecret:'future'},Number(process.env.LEWORD_TEST_NOW));`,
    ], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        LEWORD_NAVER_OPENAPI_QUOTA_STATE_FILE: quotaFile,
        LEWORD_TEST_NOW: String(fixedNow),
      },
    });
    assert('a quota ledger saved implausibly in the future fails closed without being reset',
      futureSavedAtProbe.status !== 0
        && JSON.parse(fs.readFileSync(quotaFile, 'utf8')).savedAt === futureSavedAtState.savedAt,
      futureSavedAtProbe.stderr || futureSavedAtProbe.stdout);
    fs.writeFileSync(quotaFile, JSON.stringify(persisted), 'utf8');

    fs.writeFileSync(`${quotaFile}.lock`, 'held', 'utf8');
    const activeLock = spawnSync(process.execPath, [
      '-r',
      'ts-node/register/transpile-only',
      '-e',
      `const api=require(${JSON.stringify(modulePath)});api.markNaverBlogOpenApiQuotaBlocked({clientId:'lock',clientSecret:'lock',label:'lock'});`,
    ], {
      cwd: root,
      encoding: 'utf8',
      timeout: 5_000,
      env: {
        ...process.env,
        LEWORD_NAVER_OPENAPI_QUOTA_STATE_FILE: quotaFile,
        LEWORD_NAVER_OPENAPI_QUOTA_LOCK_WAIT_MS: '100',
      },
    });
    assert('an active OpenAPI quota lock times out without automatic stale deletion',
      activeLock.status !== 0 && fs.existsSync(`${quotaFile}.lock`),
      activeLock.stderr || activeLock.stdout);
    fs.unlinkSync(`${quotaFile}.lock`);

    const safeDirectory = path.join(fixtureRoot, 'safe-quota-root');
    const linkedDirectory = path.join(fixtureRoot, 'linked-quota-root');
    fs.mkdirSync(safeDirectory);
    let directoryLinkCreated = false;
    try {
      fs.symlinkSync(safeDirectory, linkedDirectory, process.platform === 'win32' ? 'junction' : 'dir');
      directoryLinkCreated = true;
    } catch (error: any) {
      if (!['EPERM', 'EACCES'].includes(String(error?.code || ''))) throw error;
    }
    if (directoryLinkCreated) {
      const unsafeFile = path.join(linkedDirectory, 'naver-openapi-quota-state.json');
      const result = spawnSync(process.execPath, [
        '-r',
        'ts-node/register/transpile-only',
        '-e',
        `const api=require(${JSON.stringify(modulePath)}); api.markNaverBlogOpenApiQuotaBlocked({clientId:'unsafe',clientSecret:'unsafe',label:'unsafe'});`,
      ], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, LEWORD_NAVER_OPENAPI_QUOTA_STATE_FILE: unsafeFile },
      });
      assert('quota persistence rejects symbolic-link path components',
        result.status !== 0 && !fs.existsSync(path.join(safeDirectory, 'naver-openapi-quota-state.json')),
        result.stderr || `status=${result.status}`);
    }
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
  console.log('[naver-openapi-quota-concurrency.test] passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

export {};
