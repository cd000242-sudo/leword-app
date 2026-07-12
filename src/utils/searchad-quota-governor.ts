/**
 * 🛡️ SearchAd 일일 쿼터 거버너
 *
 * 네이버 검색광고 API 쿼터(25,000/일)는 "계정(customer) 단위"다. 워커·API 컨테이너·prewarm·
 * 온디맨드가 같은 계정을 공유하지만 지금까지 공유 카운터가 없어 조용히 25k를 넘겨 429가 터지고,
 * 429 재시도가 남은 쿼터를 더 태워 보드가 캐시 몇 개(~11)로 붕괴했다.
 *
 * 이 거버너는:
 *  - 하루 호출 수를 파일(/data)로 컨테이너 간 공유 카운트 (naver-blog-api 쿼터-상태 패턴 미러)
 *  - 소프트 상한(기본 22,000, 3k 여유)에 닿으면 호출 차단 → 25k를 물리적으로 못 넘김
 *  - 리셋은 KST 자정 기준 (Naver 쿼터 리셋과 정렬)
 *  - 다중계정 훅: byAccount 키로 계정별 카운트 — 지금은 단일계정, Phase 4에서 라운드로빈으로 확장
 *
 * over-count는 안전(더 일찍 멈춤), under-count는 위험 → 레이스 시 디스크값과 max 머지.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createHash } from 'crypto';

const DAILY_LIMIT = Number(process.env['LEWORD_SEARCHAD_DAILY_LIMIT']) || 25000;
// 소프트 상한: 배경 소비자는 여기서 멈춘다 (25k 계정 한도까지 3k 여유 = 온디맨드/레이스 버퍼)
const SOFT_CEILING = Number(process.env['LEWORD_SEARCHAD_SOFT_CEILING']) || 22000;
const SCHEMA = 'searchad-quota-v1';
const QUOTA_LOCK_STALE_MS = 5_000;
const QUOTA_LOCK_WAIT_MS = 10_000;
const QUOTA_LOCK_RETRY_MS = 5;

interface DayState {
  date: string; // KST YYYY-MM-DD
  byAccount: Record<string, number>;
}

let state: DayState | null = null;
const quotaLockWaitBuffer = new Int32Array(new SharedArrayBuffer(4));

function stateFile(): string {
  const explicit = process.env['LEWORD_SEARCHAD_QUOTA_STATE_FILE'];
  if (explicit) return explicit;
  const dataDir =
    process.env['LEWORD_SERVER_USER_DATA'] ||
    process.env['LEWORD_MOBILE_DATA_DIR'] ||
    process.env['LEWORD_MOBILE_CACHE_DIR'] ||
    (fs.existsSync('/data') ? '/data' : '') ||
    path.join(os.tmpdir(), 'leword');
  return path.join(dataDir, 'searchad-quota-state.json');
}

function sleepSync(ms: number): void {
  Atomics.wait(quotaLockWaitBuffer, 0, 0, ms);
}

function withQuotaFileLock<T>(action: () => T): T {
  const file = stateFile();
  const lockFile = `${file}.lock`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const startedAt = Date.now();
  let lockFd: number | null = null;
  while (lockFd === null) {
    try {
      lockFd = fs.openSync(lockFile, 'wx');
    } catch (error: any) {
      const code = String(error?.code || '');
      if (!['EEXIST', 'EPERM', 'EBUSY', 'EACCES'].includes(code)) throw error;
      if (code === 'EEXIST') {
        try {
          const ageMs = Date.now() - fs.statSync(lockFile).mtimeMs;
          if (ageMs > QUOTA_LOCK_STALE_MS) {
            fs.unlinkSync(lockFile);
            continue;
          }
        } catch (statError: any) {
          if (!['ENOENT', 'EPERM', 'EBUSY', 'EACCES'].includes(String(statError?.code || ''))) {
            throw statError;
          }
        }
      }
      if (Date.now() - startedAt >= QUOTA_LOCK_WAIT_MS) {
        throw new Error('SearchAd quota lock timeout');
      }
      sleepSync(QUOTA_LOCK_RETRY_MS);
    }
  }
  try {
    return action();
  } finally {
    try { fs.closeSync(lockFd); } catch { /* already closed */ }
    try { fs.unlinkSync(lockFile); } catch { /* stale cleanup handles leftovers */ }
  }
}

function replaceFileAtomically(tmpFile: string, file: string): void {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      fs.renameSync(tmpFile, file);
      return;
    } catch (error: any) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(String(error?.code || '')) || attempt === 99) {
        throw error;
      }
      sleepSync(QUOTA_LOCK_RETRY_MS);
    }
  }
}

/** KST(+9) 기준 오늘 날짜 문자열 — Naver 일일 쿼터 리셋(자정 KST)과 정렬 */
function kstDate(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 현재 시각 다음의 KST 자정. 배경 워커가 소프트 상한 도달 후 폴링하지 않고 잠들 때 사용한다. */
export function searchAdNextResetAtMs(nowMs = Date.now()): number {
  const kst = new Date(nowMs + 9 * 60 * 60 * 1000);
  return Date.UTC(
    kst.getUTCFullYear(),
    kst.getUTCMonth(),
    kst.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  ) - 9 * 60 * 60 * 1000;
}

/** 설정에서 계정 식별자(해시) 도출 — customerId 우선, 없으면 accessLicense 앞부분 */
export function searchAdAccountId(cfg: { customerId?: string; accessLicense?: string }): string {
  const raw =
    (cfg.customerId && cfg.customerId.trim()) ||
    (cfg.accessLicense || '').slice(0, 24) ||
    'default';
  return createHash('sha256').update(raw).digest('hex').slice(0, 12);
}

function readDisk(): DayState | null {
  try {
    const file = stateFile();
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed?.schemaVersion !== SCHEMA) return null;
    if (parsed?.date !== kstDate()) return null; // 날짜 바뀜 → 무효(리셋)
    if (!parsed?.byAccount || typeof parsed.byAccount !== 'object') return null;
    return { date: parsed.date, byAccount: { ...parsed.byAccount } };
  } catch {
    return null; // 쿼터 상태는 최적화용 — 실패해도 런타임 정상
  }
}

function ensure(): DayState {
  const today = kstDate();
  if (!state) {
    state = readDisk() || { date: today, byAccount: {} };
  }
  if (state.date !== today) {
    // 날짜 롤오버 → 카운터 리셋
    state = { date: today, byAccount: {} };
  }
  return state;
}

function mergeLatestDiskState(current: DayState): DayState {
  const disk = readDisk();
  if (!disk || disk.date !== current.date) return current;
  for (const [accountId, calls] of Object.entries(disk.byAccount)) {
    current.byAccount[accountId] = Math.max(current.byAccount[accountId] || 0, calls || 0);
  }
  return current;
}

function save(): void {
  if (!state) return;
  const file = stateFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmpFile = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(
    tmpFile,
    JSON.stringify({ schemaVersion: SCHEMA, date: state.date, byAccount: state.byAccount }),
    'utf8',
  );
  replaceFileAtomically(tmpFile, file);
}

/** 오늘(KST) 해당 계정의 SearchAd 호출 수 */
export function searchAdCallsToday(accountId = 'default'): number {
  return mergeLatestDiskState(ensure()).byAccount[accountId] || 0;
}

/** 소프트 상한까지 남은 호출 수 */
export function searchAdRemaining(accountId = 'default', ceiling = SOFT_CEILING): number {
  return Math.max(0, ceiling - searchAdCallsToday(accountId));
}

/** 소프트 상한 도달 여부 — true면 호출을 멈춰야 함 */
export function searchAdExhausted(accountId = 'default', ceiling = SOFT_CEILING): boolean {
  return searchAdCallsToday(accountId) >= ceiling;
}

/** 호출 1회(이상) 기록. 공유 파일 잠금 안에서 최신값을 더해 크로스-프로세스 유실을 막는다. */
export function recordSearchAdCall(accountId = 'default', n = 1): void {
  withQuotaFileLock(() => {
    const today = kstDate();
    const disk = readDisk();
    state = disk && disk.date === today ? disk : { date: today, byAccount: {} };
    state.byAccount[accountId] = (state.byAccount[accountId] || 0) + Math.max(1, n);
    save();
  });
}

export function searchAdSoftCeiling(): number {
  return SOFT_CEILING;
}
export function searchAdDailyLimit(): number {
  return DAILY_LIMIT;
}

/** 관측/디버그용 — 오늘 전체 상태 스냅샷 */
export function searchAdQuotaSnapshot(): { date: string; byAccount: Record<string, number>; softCeiling: number; dailyLimit: number } {
  const s = ensure();
  return { date: s.date, byAccount: { ...s.byAccount }, softCeiling: SOFT_CEILING, dailyLimit: DAILY_LIMIT };
}
