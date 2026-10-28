/**
 * 확장이 보낸 제휴(네이버·토스) 쿠키 저장소 — 쓰기 전용 창구.
 * 가능하면 Electron safeStorage(DPAPI)로 암호화한다. 쿠키를 밖으로 돌려주는 경로는 만들지 않는다
 * (읽기는 수집 직전 주입 코드만 loadSessionCookies 로 한다).
 */
import { app, safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { parseIncomingCookies, summarizeLogin, type SessionCookie } from '../utils/affiliate-session-cookies';

interface StoredFile {
  version: 1;
  savedAt: string;
  encrypted: boolean;
  /** encrypted 이면 base64(safeStorage), 아니면 JSON 문자열. */
  payload: string;
}

const FILE = () => path.join(app.getPath('userData'), 'affiliate-local', 'session-cookies.json');

function canEncrypt(): boolean {
  try { return safeStorage.isEncryptionAvailable(); } catch { return false; }
}

/** 브리지 수신부 — 검증 후 전체 교체 저장. 응답에는 쿠키 값이 없다. */
export async function saveSessionCookies(body: unknown): Promise<{ saved: number; naverLoggedIn: boolean; tossCookies: number; encrypted: boolean }> {
  const parsed = parseIncomingCookies(body);
  if (parsed.ok === false) throw new Error(parsed.error);
  const json = JSON.stringify(parsed.cookies);
  const encrypted = canEncrypt();
  const record: StoredFile = {
    version: 1,
    savedAt: new Date().toISOString(),
    encrypted,
    payload: encrypted ? safeStorage.encryptString(json).toString('base64') : json,
  };
  const file = FILE();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(record), 'utf8');
  fs.renameSync(tmp, file);
  const login = summarizeLogin(parsed.cookies);
  return { saved: parsed.cookies.length, naverLoggedIn: login.naver, tossCookies: login.tossCookies, encrypted };
}

/** 수집 직전 주입 전용. 없거나 못 풀면 빈 배열. */
export function loadSessionCookies(): SessionCookie[] {
  try {
    const record = JSON.parse(fs.readFileSync(FILE(), 'utf8')) as StoredFile;
    const json = record.encrypted
      ? safeStorage.decryptString(Buffer.from(record.payload, 'base64'))
      : record.payload;
    const parsed = parseIncomingCookies({ cookies: JSON.parse(json) });
    return parsed.ok ? parsed.cookies : [];
  } catch {
    return [];
  }
}
