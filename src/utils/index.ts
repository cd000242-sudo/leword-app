/**
 * Utils 모듈 공통 유틸리티
 */

import * as path from 'path';
import * as fs from 'fs';

/**
 * 쓰기 가능한 데이터 디렉토리 경로를 반환합니다.
 * Electron 앱에서는 userData 경로를, 일반 환경에서는 현재 디렉토리를 사용합니다.
 */
export function getWritableDataDir(): string {
  try {
    // Electron 환경인 경우
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') {
      const userDataPath = app.getPath('userData');
      // data 하위 폴더 사용
      const dataDir = path.join(userDataPath, 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      return dataDir;
    }
  } catch {
    // Electron이 아닌 환경
  }
  
  // 일반 환경: 현재 디렉토리의 data 폴더
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return dataDir;
}

/**
 * 앱 루트 디렉토리 경로를 반환합니다.
 */
export function getAppRootDir(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron');
    if (app && typeof app.getAppPath === 'function') {
      return app.getAppPath();
    }
  } catch {
    // Electron이 아닌 환경
  }
  return process.cwd();
}
