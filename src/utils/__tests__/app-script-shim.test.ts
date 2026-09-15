import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * 앱 연결 파일(scripts/app-script-shim.js, 2026-09-15, 황금키워드 상위호환 2단계).
 *
 * 사장님 결정 "사이트 스크립트를 그대로 앱에서". 설치판에는 src · ts-node 가 없고, 설정 폴더는 고정 경로이며,
 * Bright Data 는 사용자에게 쓰이면 안 된다(사장님 "내 bd를 다른 사용자들이 쓰면 안 되자나").
 * 가짜 설치판 폴더(scripts · dist/src)를 만들고 진짜 자식 프로세스에 -r 로 실어 확인한다.
 */
const repo = path.join(__dirname, '..', '..', '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-script-shim-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

function put(rel: string, body: string): string {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, 'utf8');
  return file;
}

const shim = put('scripts/app-script-shim.js', fs.readFileSync(path.join(repo, 'scripts', 'app-script-shim.js'), 'utf8'));
put('scripts/load-project-env.js', "module.exports = { loadProjectEnv() { process.env.LEWORD_PROBE_LEAK = 'repo-env'; return { loaded: true }; } };");
put('dist/src/utils/answer.js', 'exports.value = 42;');
put('dist/src/utils/seed-db.js', "exports.loadSeedDb = function (filePath = 'DEFAULT_PATH') { return filePath; };\nexports.pickSeeds = () => 'kept';");
put('dist/src/utils/brightdata-client.js', "exports.brightDataFetch = async () => 'REAL-CALL';\nexports.isRateLimitError = () => 'kept';");
put('dist/src/utils/environment-manager.js', "const { app } = require('electron');\nexports.userData = app.getPath('userData');");
put('dist/src/utils/inner.js', [
  "const seed = require('./seed-db');",
  "const bd = require('./brightdata-client');",
  'exports.innerSeed = () => seed.loadSeedDb();',
  "exports.innerFetch = () => bd.brightDataFetch('https://example.com');",
].join('\n'));
const probe = put('scripts/probe.js', [
  "require('ts-node/register/transpile-only');",
  "require('./load-project-env').loadProjectEnv();",
  "const { value } = require('../src/utils/answer');",
  "const { loadSeedDb, pickSeeds } = require('../src/utils/seed-db');",
  "const bd = require('../src/utils/brightdata-client');",
  "const env = require('../src/utils/environment-manager');",
  "const inner = require('../src/utils/inner');",
  "const settle = (p) => p.then((r) => 'resolved:' + r, (e) => 'rejected:' + e.message);",
  "Promise.all([settle(bd.brightDataFetch('https://example.com')), settle(inner.innerFetch())]).then(([direct, nested]) => {",
  '  process.stdout.write(JSON.stringify({',
  "    value, seed: loadSeedDb(), explicitSeed: loadSeedDb('X'), pickSeeds: pickSeeds(), rate: bd.isRateLimitError(),",
  '    userData: env.userData, innerSeed: inner.innerSeed(), leak: process.env.LEWORD_PROBE_LEAK || null,',
  '    token: process.env.BRIGHTDATA_TOKEN, quotaFile: process.env.LEWORD_BRIGHTDATA_QUOTA_STATE_FILE, direct, nested,',
  '  }));',
  '});',
].join('\n'));

const OWN_KEYS = new Set(['LEWORD_APP_USER_DATA', 'LEWORD_SEED_DB_PATH', 'BRIGHTDATA_TOKEN', 'LEWORD_PROBE_LEAK']);

function runProbe(extra: Record<string, string>, args: string[] = []) {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !OWN_KEYS.has(key.toUpperCase())) env[key] = value;
  }
  return spawnSync(process.execPath, ['-r', shim, probe, ...args], { env: { ...env, ...extra }, encoding: 'utf8', timeout: 20000 });
}

const userData = path.join(root, 'user data');
const seedDb = path.join(root, 'seed-db.json');

function probeOutput(extra: Record<string, string>, args: string[] = []) {
  const result = runProbe(extra, args);
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}

describe('앱 연결 파일', () => {
  const out = probeOutput({ LEWORD_APP_USER_DATA: userData, LEWORD_SEED_DB_PATH: seedDb, BRIGHTDATA_TOKEN: 'real-token-from-parent' }, ['--fetcher=local']);

  it("스크립트의 '../src' 는 컴파일본으로, ts-node 는 빈 모듈로 — 레포 .env 는 올리지 않는다", () => {
    expect(out.value).toBe(42);
    expect(out.leak).toBeNull();
  });

  it('설정 관리자는 앱과 같은 데이터 폴더를 본다', () => {
    expect(out.userData).toBe(userData);
  });

  it('씨앗 창고 기본 경로만 앱이 받은 파일로 — 직접 준 경로 · 다른 내보내기 · 다른 모듈에서 부른 것도 같다', () => {
    expect(out.seed).toBe(seedDb);
    expect(out.explicitSeed).toBe('X');
    expect(out.pickSeeds).toBe('kept');
    expect(out.innerSeed).toBe(seedDb);
  });

  it('Bright Data — 진짜 토큰은 안 보이고, 호출 함수는 어디서 불러도 막힌다', () => {
    expect(out.token).toBe('app-local-fetcher-no-brightdata');
    expect(out.direct).toMatch(/^rejected:.*Bright Data/);
    expect(out.nested).toMatch(/^rejected:.*Bright Data/);
    expect(out.rate).toBe('kept');
    expect(out.quotaFile).toBe(path.join(userData, 'golden-local', 'brightdata-not-used.json'));
  });

  it('로컬 수집기가 아닌 스크립트에는 가짜 토큰도 주지 않는다', () => {
    const plain = probeOutput({ LEWORD_APP_USER_DATA: userData, BRIGHTDATA_TOKEN: 'real-token-from-parent' });
    expect(plain.token).toBe('');
  });

  it('씨앗 창고 경로를 안 주면 스크립트 기본값 그대로다', () => {
    const plain = probeOutput({ LEWORD_APP_USER_DATA: userData });
    expect(plain.seed).toBe('DEFAULT_PATH');
  });

  it('데이터 폴더를 안 주면 아무것도 싣지 않고 멈춘다 — 엉뚱한 설정을 읽지 않게', () => {
    const result = runProbe({});
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('LEWORD_APP_USER_DATA');
    expect(result.stdout).toBe('');
  });
});
