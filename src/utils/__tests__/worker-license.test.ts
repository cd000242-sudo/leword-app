import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { licenseCodeFromJson } from '../worker-license';

/**
 * 2026-10-20 키워드 워커 잠금(OPERATOR-GATE) — 라이선스 없는 검색량 · 연관어는 IP 하루 50회.
 * 앱은 라이선스 파일의 코드를 실어 보내 한도 없이 쓴다(어드바이저 검색량 · 설계실 연관어).
 */
describe('licenseCodeFromJson', () => {
  it('license.json 의 licenseCode 를 꺼낸다', () => {
    expect(licenseCodeFromJson(JSON.stringify({ licenseCode: ' LW-ABCD-1234 ', userId: 'u' }))).toBe('LW-ABCD-1234');
  });
  it('없거나 깨졌거나 이상한 값이면 빈 문자열(워커가 소량 한도로 센다)', () => {
    expect(licenseCodeFromJson('{}')).toBe('');
    expect(licenseCodeFromJson('{oops')).toBe('');
    expect(licenseCodeFromJson(JSON.stringify({ licenseCode: 'short' }))).toBe('');
    expect(licenseCodeFromJson(JSON.stringify({ licenseCode: 'has space inside code' }))).toBe('');
  });
});

describe('워커 잠금 대상 호출은 라이선스 코드를 싣는다', () => {
  const read = (file: string) => fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf8');
  it('어드바이저 검색량', () => {
    expect(read('main/handlers/advisor-daily.ts')).toMatch(/action: 'keyword-volumes', licenseCode: workerLicenseCode\(\)/);
  });
  it('설계실 연관어', () => {
    expect(read('main/handlers/post-plan.ts')).toMatch(/action: 'keyword-expansions', keyword, licenseCode: workerLicenseCode\(\)/);
  });
});
