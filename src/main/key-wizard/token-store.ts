// LEWORD Key Wizard — 토큰 암호화 저장 (Electron safeStorage / DPAPI)
// 작성: 2026-04-15

import { app, safeStorage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

interface TokenRecord {
  site: string;
  encrypted: string;
  updatedAt: number;
}

interface TokenFile {
  version: 1;
  records: Record<string, TokenRecord>;
}

const FILE_NAME = 'tokens.enc';

function getStoreDir(): string {
  const dir = path.join(app.getPath('userData'), 'key-wizard');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getStorePath(): string {
  return path.join(getStoreDir(), FILE_NAME);
}

function readFile(): TokenFile {
  const p = getStorePath();
  if (!fs.existsSync(p)) {
    return { version: 1, records: {} };
  }
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === 1 && parsed.records) return parsed;
  } catch (err) {
    console.error('[KEY-WIZARD][token-store] 파일 읽기 실패:', err);
  }
  return { version: 1, records: {} };
}

function writeFile(data: TokenFile): void {
  const p = getStorePath();
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

export function isAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

export function saveToken(site: string, value: Record<string, any>): void {
  if (!isAvailable()) {
    throw new Error('safeStorage 암호화를 사용할 수 없습니다. (OS 키체인 미지원)');
  }
  const file = readFile();
  const json = JSON.stringify(value);
  const encrypted = safeStorage.encryptString(json).toString('base64');
  file.records[site] = { site, encrypted, updatedAt: Date.now() };
  writeFile(file);
  console.log(`[KEY-WIZARD][token-store] ✅ 저장: ${site}`);
}

export function loadToken<T = Record<string, any>>(site: string): T | null {
  if (!isAvailable()) return null;
  const file = readFile();
  const rec = file.records[site];
  if (!rec) return null;
  try {
    const buf = Buffer.from(rec.encrypted, 'base64');
    const decrypted = safeStorage.decryptString(buf);
    return JSON.parse(decrypted) as T;
  } catch (err) {
    console.error(`[KEY-WIZARD][token-store] 복호화 실패: ${site}`, err);
    return null;
  }
}

export function deleteToken(site: string): void {
  const file = readFile();
  delete file.records[site];
  writeFile(file);
  console.log(`[KEY-WIZARD][token-store] 🗑️  삭제: ${site}`);
}

export function listSites(): string[] {
  return Object.keys(readFile().records);
}

export function getUpdatedAt(site: string): number | null {
  const rec = readFile().records[site];
  return rec ? rec.updatedAt : null;
}
