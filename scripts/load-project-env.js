/**
 * 프로젝트 루트 .env 를 process.env 로 올린다.
 *
 * 왜 필요한가:
 *   배치·감사 스크립트는 process.env 를 직접 읽는데, 이 레포에는 .env 를
 *   자동 로드하는 곳이 없다(EnvironmentManager 는 Electron 앱 경로에서만 돈다).
 *   그래서 .env 에 키를 넣어도 스크립트가 못 읽고 "환경변수가 필요합니다" 로
 *   떨어진다. 실행할 때마다 셸에서 export 하게 만들 이유가 없다.
 *
 * 이미 설정된 값은 덮어쓰지 않는다 — CI·셸에서 준 값이 파일보다 우선이다.
 */
'use strict';

const fs = require('fs');
const path = require('path');

function loadProjectEnv(rootDir) {
  const envPath = path.join(rootDir || path.resolve(__dirname, '..'), '.env');
  if (!fs.existsSync(envPath)) return { loaded: false, path: envPath, keys: [] };

  let parsed = {};
  try {
    // dotenv 가 이미 의존성에 있다. 따옴표·주석·개행 처리를 직접 짜지 않는다.
    parsed = require('dotenv').parse(fs.readFileSync(envPath));
  } catch (error) {
    console.warn(`[env] .env 읽기 실패: ${error instanceof Error ? error.message : String(error)}`);
    return { loaded: false, path: envPath, keys: [] };
  }

  const applied = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
      applied.push(key);
    }
  }
  return { loaded: true, path: envPath, keys: applied };
}

module.exports = { loadProjectEnv };
