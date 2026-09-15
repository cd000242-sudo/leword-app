/*
 * 앱이 사이트 발굴 스크립트를 한 줄도 안 바꾸고 돌리게 하는 연결 파일 (2026-09-15, 황금키워드 상위호환 2단계).
 *
 * 사장님 결정 "사이트 스크립트를 그대로 앱에서". 앱은 스크립트를 자식 프로세스로 띄우고 이 파일을 -r 로 먼저 싣는다.
 *   LEWORD.exe(ELECTRON_RUN_AS_NODE=1) -r scripts/app-script-shim.js scripts/<스크립트>.js <인자>
 * 설치판 실측(2026-09-15, release/win-unpacked): 노드 모드가 app.asar 안 파일을 require · -r · 주 스크립트로 모두 읽었다.
 *
 * 스크립트가 기대하는 것과 설치판에 있는 것이 다른 곳만 메운다. 판정 코드는 건드리지 않는다.
 *   ① '../src/X'(ts 원본) → dist/src/X(컴파일본). ts-node 등록은 빈 모듈 — 설치판에는 src 도 ts-node 도 없다.
 *   ② 레포 .env 올리기(load-project-env)는 하지 않는다 — 앱은 사용자 설정만 쓴다. 개발 PC 에서 사이트 키가 섞이지 않게.
 *   ③ require('electron') 은 app.getPath 만 가진 대역 — 설정 관리자가 앱과 같은 데이터 폴더의 config.json 을 읽게.
 *      앱은 데이터 폴더를 %APPDATA%/blogger-admin-panel 로 고정한다(main.ts initAppPaths). 대역이 없으면 설정 관리자가
 *      %APPDATA%/LEWORD 를 먼저 찾아 다른 설정을 읽을 수 있다. 네 스크립트가 싣는 모듈 60개 중 일렉트론을 부르는 곳은
 *      설정 관리자 하나이고, 쓰는 것도 app.getPath 하나다(2026-09-15 계산).
 *   ④ 씨앗 창고의 기본 경로는 앱이 받아 둔 파일로 — 컴파일본 기준 기본 경로(dist/data)에는 파일이 없다.
 *   ⑤ Bright Data 는 부르지 않는다 — 자리는 이 PC 크로미엄(--fetcher=local)으로만 잰다(사장님 "내 bd를 다른 사용자들이 쓰면 안 되자나").
 *      진짜 토큰은 자식에게 보이지 않게 지우고, 로컬 수집기로 도는 자리 판정에만 존재 검사를 넘길 가짜 값을 둔다.
 *      호출 함수도 막고, 쿼터 장부는 사이트 장부 대신 앱 폴더의 빈 파일을 보게 한다.
 */
'use strict';

const Module = require('module');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCRIPTS_DIR = path.join(ROOT, 'scripts') + path.sep;
const DIST_SRC = path.join(ROOT, 'dist', 'src');
const USER_DATA = String(process.env.LEWORD_APP_USER_DATA || '').trim();
const SEED_DB_PATH = String(process.env.LEWORD_SEED_DB_PATH || '').trim();
const TS_NODE_REQUESTS = new Set(['ts-node/register/transpile-only', 'ts-node/register']);
const LOCAL_FETCHER_TOKEN = 'app-local-fetcher-no-brightdata';
const SEED_DB_MODULE = path.join(DIST_SRC, 'utils', 'seed-db.js');
const BRIGHTDATA_MODULE = path.join(DIST_SRC, 'utils', 'brightdata-client.js');

if (!USER_DATA) {
  console.error('[앱 연결] LEWORD_APP_USER_DATA 가 비어 있다 — 어느 설정을 읽을지 몰라 멈춘다.');
  process.exit(2);
}

// ⑤ 토큰과 장부는 스크립트가 읽기 전에 정한다.
const usesLocalFetcher = process.argv.slice(2).includes('--fetcher=local');
process.env.BRIGHTDATA_TOKEN = usesLocalFetcher ? LOCAL_FETCHER_TOKEN : '';
process.env.LEWORD_BRIGHTDATA_QUOTA_STATE_FILE = path.join(USER_DATA, 'golden-local', 'brightdata-not-used.json');
process.env.LEWORD_BRIGHTDATA_QUOTA_PEER_FILES = '';

const samePath = process.platform === 'win32'
  ? (a, b) => String(a).toLowerCase() === String(b).toLowerCase()
  : (a, b) => a === b;

function fromScripts(parent) {
  return Boolean(parent && typeof parent.filename === 'string' && parent.filename.startsWith(SCRIPTS_DIR));
}

const electronStandIn = Object.freeze({
  app: Object.freeze({
    getPath(name) {
      if (name === 'userData') return USER_DATA;
      if (name === 'appData') return path.dirname(USER_DATA);
      if (name === 'temp') return os.tmpdir();
      if (name === 'home') return os.homedir();
      throw new Error(`[앱 연결] app.getPath('${name}') 는 대역에 없다`);
    },
  }),
});

const noProjectEnv = Object.freeze({
  loadProjectEnv: () => ({ loaded: false, path: '', keys: [] }),
});

function blockedBrightDataFetch() {
  return Promise.reject(new Error('앱은 Bright Data 를 부르지 않는다 — 자리는 이 PC 크로미엄(--fetcher=local)으로만 잰다'));
}

// ① 스크립트 폴더에서 나온 '../src/…' 요청만 컴파일본으로 돌린다. 다른 모듈의 해석은 그대로다.
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function resolveFilename(request, parent, ...rest) {
  if (fromScripts(parent) && typeof request === 'string' && request.startsWith('../src/')) {
    return originalResolve.call(this, path.join(DIST_SRC, request.slice('../src/'.length)), parent, ...rest);
  }
  return originalResolve.call(this, request, parent, ...rest);
};

// ④⑤ 바꾼 내보내기는 한 번만 만들어 모든 요청자가 같은 것을 받게 한다. 원래 모듈 객체는 건드리지 않는다.
const replaced = new Map();
function replaceOnce(file, build) {
  const key = file.toLowerCase();
  if (!replaced.has(key)) replaced.set(key, Object.freeze(build()));
  return replaced.get(key);
}

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (TS_NODE_REQUESTS.has(request)) return {};
  if (request === 'electron') return electronStandIn;
  if (request === './load-project-env' && fromScripts(parent)) return noProjectEnv;
  const exported = originalLoad.call(this, request, parent, isMain);
  if (typeof request !== 'string' || !/seed-db|brightdata-client/.test(request)) return exported;
  const file = Module._resolveFilename(request, parent, isMain);
  const cached = Module._cache[file];
  // 순환 require 로 아직 덜 실린 모듈이면 손대지 않는다 — 반쯤 찬 내보내기를 복사해 굳히지 않게.
  if (!cached || !cached.loaded) return exported;
  if (samePath(file, SEED_DB_MODULE) && typeof exported.loadSeedDb === 'function') {
    return replaceOnce(file, () => ({
      ...exported,
      loadSeedDb: (filePath) => exported.loadSeedDb(filePath || SEED_DB_PATH || undefined),
    }));
  }
  if (samePath(file, BRIGHTDATA_MODULE)) {
    return replaceOnce(file, () => ({ ...exported, brightDataFetch: blockedBrightDataFetch }));
  }
  return exported;
};
