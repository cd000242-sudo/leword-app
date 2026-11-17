/**
 * NAVER API HUB key pool — ordered key list, per-key "daily limit reached" state, and the
 * one-sentence error used when every key is spent.
 *
 * Order: 1st = the existing key fields, then config.json `naverApiHubKeyPool`, then the
 * NAVER_APIHUB_KEY_POOL env var ("id:key,id:key" or JSON). Duplicates are kept once.
 *
 * State is stored by SHA-256 hash only (never the key or Key ID) and survives restarts.
 * A key is marked spent only for HTTP 429 with an explicit daily-limit message; per-second
 * 429s are not "done for today".
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { normalizeCredentialPart, parseJsonOrPairPool } from './credential-pool-parse';

export interface ApiHubKey {
  keyId: string;
  key: string;
  label?: string;
}

export interface ApiHubKeyConfigSource {
  naverApiHubKeyId?: string;
  naverApiHubKey?: string;
  naverApiHubKeyPool?: unknown;
}

export type ApiHubKeyState = 'available' | 'quota' | 'invalid';

const STATE_SCHEMA = 1;
const STATE_MAX_BYTES = 256 * 1024;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
/** Characters a masked display value is made of (the screen must never save these as a key). */
const MASKED_PATTERN = /[•●*]{3,}/;

export function parseApiHubKeyPool(raw: string): ApiHubKey[] {
  return parseJsonOrPairPool(raw)
    .map((item) => ({ keyId: item.clientId, key: item.clientSecret, label: item.label }))
    .filter((item) => item.keyId && item.key);
}

function dedupeKeys(keys: ApiHubKey[]): ApiHubKey[] {
  const seen = new Set<string>();
  return keys.filter((item) => {
    const id = `${item.keyId}\n${item.key}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** Trim, drop empty / masked / duplicate rows. Anything that is not an array becomes []. */
export function sanitizeApiHubKeyPool(rows: unknown): ApiHubKey[] {
  if (!Array.isArray(rows)) return [];
  const cleaned = rows
    .map((row: any) => {
      const keyId = normalizeCredentialPart(row?.keyId ?? row?.id);
      const key = normalizeCredentialPart(row?.key);
      const label = normalizeCredentialPart(row?.label);
      return label ? { keyId, key, label } : { keyId, key };
    })
    .filter((item) => item.keyId && item.key && !MASKED_PATTERN.test(item.keyId) && !MASKED_PATTERN.test(item.key));
  return dedupeKeys(cleaned);
}

/** Ordered, de-duplicated key list: main fields -> config pool -> env pool. */
export function collectApiHubKeys(
  config: ApiHubKeyConfigSource | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): ApiHubKey[] {
  const mainId = normalizeCredentialPart(config?.naverApiHubKeyId || env['NAVER_APIHUB_KEY_ID']);
  const mainKey = normalizeCredentialPart(config?.naverApiHubKey || env['NAVER_APIHUB_KEY']);
  const main: ApiHubKey[] = mainId && mainKey ? [{ keyId: mainId, key: mainKey }] : [];
  return dedupeKeys([
    ...main,
    ...sanitizeApiHubKeyPool(config?.naverApiHubKeyPool),
    ...sanitizeApiHubKeyPool(parseApiHubKeyPool(env['NAVER_APIHUB_KEY_POOL'] || '')),
  ]);
}

export function apiHubKeyHash(item: ApiHubKey): string {
  return crypto.createHash('sha256').update(`apihub\n${item.keyId}\n${item.key}`).digest('hex');
}

/** HTTP 429 whose body says the DAILY limit is used up. Other 429s are not "done for today". */
export function isApiHubDailyQuotaResponse(status: number, bodyText: string): boolean {
  if (status !== 429) return false;
  const text = String(bodyText || '');
  if (/일별\s*사용량\s*한도/.test(text)) return true;
  return /errorCode["']?\s*:\s*["']?429/.test(text) && /daily|quota|일별|일일/i.test(text);
}

export function nextKstMidnightMs(nowMs: number): number {
  const kst = new Date(nowMs + KST_OFFSET_MS);
  return Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + 1) - KST_OFFSET_MS;
}

// ── state (hash -> blocked-until) ──────────────────────────────────────────

let loadedPath = '';
let blockedUntilByHash: ReadonlyMap<string, number> = new Map();
let invalidThisSession: ReadonlySet<string> = new Set();
let exhaustedReported = false;

function stateFilePath(): string {
  const explicit = process.env['LEWORD_NAVER_APIHUB_QUOTA_STATE_FILE'];
  if (explicit) return explicit;
  const openApiState = process.env['LEWORD_NAVER_OPENAPI_QUOTA_STATE_FILE'];
  if (openApiState) return `${openApiState}.apihub`;
  const dataDir = process.env['LEWORD_SERVER_USER_DATA']
    || process.env['LEWORD_MOBILE_DATA_DIR']
    || process.env['LEWORD_MOBILE_CACHE_DIR']
    || (fs.existsSync('/data') ? '/data' : '')
    || path.join(os.tmpdir(), 'leword');
  return path.join(dataDir, 'naver-apihub-quota-state.json');
}

function readStateFile(file: string, nowMs: number): Map<string, number> {
  const next = new Map<string, number>();
  try {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > STATE_MAX_BYTES) {
      console.warn('[API-HUB] 한도 상태 파일을 읽지 않습니다 (안전하지 않은 파일)');
      return next;
    }
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed?.schemaVersion !== STATE_SCHEMA || typeof parsed.blockedUntilByKey !== 'object' || !parsed.blockedUntilByKey) {
      return next;
    }
    for (const [hash, until] of Object.entries(parsed.blockedUntilByKey)) {
      const value = Number(until);
      if (/^[0-9a-f]{64}$/.test(hash) && Number.isSafeInteger(value) && value > nowMs) next.set(hash, value);
    }
  } catch (error: any) {
    if (error?.code !== 'ENOENT') console.warn('[API-HUB] 한도 상태 파일을 읽지 못했습니다 — 비어 있는 것으로 시작합니다');
  }
  return next;
}

function loadState(nowMs: number): void {
  const file = stateFilePath();
  if (file === loadedPath) return;
  blockedUntilByHash = readStateFile(file, nowMs);
  loadedPath = file;
}

function saveState(nowMs: number): void {
  const file = stateFilePath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const body = JSON.stringify({
      schemaVersion: STATE_SCHEMA,
      savedAt: new Date(nowMs).toISOString(),
      blockedUntilByKey: Object.fromEntries(blockedUntilByHash),
    });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, body, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, file);
  } catch {
    console.warn('[API-HUB] 한도 상태 파일을 저장하지 못했습니다 — 이번 실행 동안만 기억합니다');
  }
}

export function isApiHubKeyQuotaBlocked(item: ApiHubKey, nowMs = Date.now()): boolean {
  loadState(nowMs);
  return nowMs < (blockedUntilByHash.get(apiHubKeyHash(item)) || 0);
}

/** Block this key until the next KST midnight. Returns the unblock time (ms). */
export function markApiHubKeyQuotaBlocked(item: ApiHubKey, nowMs = Date.now()): number {
  loadState(nowMs);
  const hash = apiHubKeyHash(item);
  const until = Math.max(blockedUntilByHash.get(hash) || 0, nextKstMidnightMs(nowMs));
  blockedUntilByHash = new Map(blockedUntilByHash).set(hash, until);
  saveState(nowMs);
  return until;
}

export function markApiHubKeyInvalid(item: ApiHubKey): void {
  invalidThisSession = new Set(invalidThisSession).add(apiHubKeyHash(item));
}

export function isApiHubKeyInvalid(item: ApiHubKey): boolean {
  return invalidThisSession.has(apiHubKeyHash(item));
}

/** Forget in-memory state (session-invalid keys, cached file contents). Disk state stays. */
export function resetApiHubPoolSessionState(): void {
  loadedPath = '';
  blockedUntilByHash = new Map();
  invalidThisSession = new Set();
  exhaustedReported = false;
}

export function isApiHubKeyUsable(item: ApiHubKey, nowMs = Date.now()): boolean {
  return !isApiHubKeyQuotaBlocked(item, nowMs) && !isApiHubKeyInvalid(item);
}

export function getApiHubKeyState(item: ApiHubKey, nowMs = Date.now()): ApiHubKeyState {
  if (isApiHubKeyQuotaBlocked(item, nowMs)) return 'quota';
  return isApiHubKeyInvalid(item) ? 'invalid' : 'available';
}

/** States aligned with the saved extra-key rows (same order as config.naverApiHubKeyPool). */
export function getApiHubPoolEntryStates(config: ApiHubKeyConfigSource | null | undefined, nowMs = Date.now()): ApiHubKeyState[] {
  return sanitizeApiHubKeyPool(config?.naverApiHubKeyPool).map((item) => getApiHubKeyState(item, nowMs));
}

// ── exhausted error ────────────────────────────────────────────────────────

export function apiHubQuotaExhaustedMessage(count: number): string {
  return `허브 키 ${count}개 모두 오늘 한도가 끝났습니다. 자정 이후 다시 되거나, 다른 계정 키를 추가해 주세요.`;
}

export class ApiHubQuotaExhaustedError extends Error {
  readonly keyCount: number;
  constructor(keyCount: number) {
    super(apiHubQuotaExhaustedMessage(keyCount));
    this.name = 'ApiHubQuotaExhaustedError';
    this.keyCount = keyCount;
    Object.setPrototypeOf(this, ApiHubQuotaExhaustedError.prototype);
  }
}

/** Report once per process (plus a GitHub Actions `::error::` line), then throw. */
export function raiseApiHubQuotaExhausted(keyCount: number): never {
  const error = new ApiHubQuotaExhaustedError(keyCount);
  if (!exhaustedReported) {
    exhaustedReported = true;
    console.error(error.message);
    if (process.env['GITHUB_ACTIONS'] === 'true') console.log(`::error::${error.message}`);
  }
  throw error;
}
