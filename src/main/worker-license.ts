import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { licenseCodeFromJson } from '../utils/worker-license';

/** 이 PC 의 라이선스 코드 — 키워드 워커 잠금(OPERATOR-GATE)을 통과하려고 싣는다. 못 읽으면 빈 문자열. */
export function workerLicenseCode(): string {
  try {
    return licenseCodeFromJson(fs.readFileSync(path.join(app.getPath('userData'), 'license', 'license.json'), 'utf8'));
  } catch {
    return '';
  }
}
