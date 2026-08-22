/**
 * 🛡️ Bright Data 월간 쿼터 거버너 (공용 예산)
 *
 * Bright Data 무료 티어는 "계정당 월 N회"(기본 5,000)다. 황금키워드 보드·제휴 황금키워드·
 * 유튜브 급상승·마인드맵 문맥확장 등 여러 기능이 같은 계정 예산을 공유하므로, 공유 카운터가
 * 없으면 한 기능이 조용히 예산을 다 태워 다른 기능이 죽거나, 무료 한도를 넘겨 유료($1.50/1,000 — 2026-08 확인)로
 * 새어나간다.
 *
 * 이 거버너는 `searchad-quota-governor` 패턴을 미러링하되 주기를 "일"이 아니라 "월"로 둔다:
 *  - 월 사용량을 파일(/data)로 프로세스 간 공유 카운트 (KST 월 경계 기준 리셋)
 *  - 계정별(byAccount) + 기능별(byFeature) 카운트 → 기능별 상한으로 한 기능 독식 차단
 *  - 무료 상한(기본 5,000)에 닿으면 예약 거부 → 유료로 자동 유출 안 됨.
 *    유료 초과가 필요하면 명시적으로 paidOverage 를 열어야만 허용(기본 0 = 절대 안 넘김)
 *  - over-count 는 안전(더 일찍 멈춤), under-count 는 위험(유료 유출) → 레이스 시 디스크값 우선
 *
 * 실제 Bright Data 호출부는 이 거버너의 reserve() 통과분만 실행하고, 성공 후 record() 로 확정한다.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const SCHEMA = 'brightdata-quota-v1';
const STATE_MAX_BYTES = 1024 * 1024;

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Math.floor(Number(value));
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

/** 무료 상한(계정당/월). Bright Data 무료 티어 기본 5,000. 실제 값은 계정에서 확인 후 env 로 조정. */
const FREE_CEILING = positiveInt(process.env['LEWORD_BRIGHTDATA_FREE_CEILING'], 5_000);
/** 무료를 넘어 허용할 유료 초과분(계정당/월). 기본 0 = 무료 안에서만. 유료 감수 시 명시적으로 설정. */
const PAID_OVERAGE = positiveInt(process.env['LEWORD_BRIGHTDATA_PAID_OVERAGE'], 0);
const HARD_CEILING = FREE_CEILING + PAID_OVERAGE;

/** 기능별 월 상한(선택). 한 기능이 예산을 독식하지 못하게. 미설정 기능은 계정 상한까지 공유. */
function featureCaps(): Record<string, number> {
  const raw = process.env['LEWORD_BRIGHTDATA_FEATURE_CAPS'];
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const n = Math.floor(Number(v));
      // 0 도 유효한 상한이다("이 기능은 Bright Data 를 쓰지 않는다" = 완전 차단).
      // n > 0 으로 거르면 0 이 '상한 없음'으로 뒤집혀 예산을 몰래 먹는다(youtube 케이스).
      if (Number.isSafeInteger(n) && n >= 0) out[k] = n;
    }
    return out;
  } catch {
    return {};
  }
}

export type BrightDataFeature =
  | 'golden'
  | 'affiliate'
  | 'youtube'
  | 'mindmap'
  | 'analyzer'
  | 'related'
  | 'other';

interface AccountUsage {
  total: number;
  byFeature: Record<string, number>;
}
interface MonthState {
  schema: string;
  month: string; // KST YYYY-MM
  byAccount: Record<string, AccountUsage>;
}

export interface QuotaDecision {
  allowed: boolean;
  granted: number; // 실제로 허용된 요청 수(요청분보다 적을 수 있음)
  reason?: string;
  account: string;
  month: string;
  accountUsed: number;
  accountRemainingFree: number;
  featureUsed: number;
  featureRemaining: number | null;
  wouldBePaid: number; // 이 승인으로 유료 구간에 들어가는 요청 수(0 이면 전부 무료)
}

function kstMonth(nowMs: number): string {
  const kst = new Date(nowMs + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function stateFile(): string {
  const explicit = process.env['LEWORD_BRIGHTDATA_QUOTA_STATE_FILE'];
  if (explicit) return explicit;
  const dataDir =
    process.env['LEWORD_SERVER_USER_DATA'] ||
    process.env['LEWORD_MOBILE_DATA_DIR'] ||
    path.join(os.tmpdir(), 'leword-brightdata-quota');
  return path.join(dataDir, 'brightdata-quota-state.json');
}

function emptyState(month: string): MonthState {
  return { schema: SCHEMA, month, byAccount: {} };
}

function readState(nowMs: number): MonthState {
  const month = kstMonth(nowMs);
  const file = stateFile();
  try {
    const stat = fs.statSync(file);
    if (stat.size > STATE_MAX_BYTES) return emptyState(month);
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as MonthState;
    if (!parsed || parsed.schema !== SCHEMA || parsed.month !== month) {
      // 스키마 불일치 또는 월 변경 → 새 달로 리셋
      return emptyState(month);
    }
    if (!parsed.byAccount || typeof parsed.byAccount !== 'object') return emptyState(month);
    return parsed;
  } catch {
    return emptyState(month);
  }
}

function writeState(state: MonthState): void {
  const file = stateFile();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state), 'utf8');
    fs.renameSync(tmp, file); // 원자적 교체
  } catch (err) {
    // 카운터 기록 실패는 치명적이지 않으나, under-count 위험을 로그로 남긴다.
    console.error('[BRIGHTDATA-QUOTA] state write failed:', (err as Error).message || String(err));
  }
}

function accountKey(account?: string): string {
  const a = (account || process.env['LEWORD_BRIGHTDATA_ACCOUNT'] || 'primary').trim();
  return a || 'primary';
}

function usageFor(state: MonthState, account: string): AccountUsage {
  if (!state.byAccount[account]) state.byAccount[account] = { total: 0, byFeature: {} };
  const u = state.byAccount[account];
  if (!u.byFeature || typeof u.byFeature !== 'object') u.byFeature = {};
  if (!Number.isSafeInteger(u.total) || u.total < 0) u.total = 0;
  return u;
}

/**
 * 요청 예약. 실제 Bright Data 호출 전에 부른다. 무료/기능 상한을 넘지 않는 선에서 승인.
 * 승인된 만큼만 호출하고, 성공 후 recordBrightDataRequests() 로 확정할 것.
 */
export function reserveBrightDataRequests(
  feature: BrightDataFeature,
  count: number,
  opts: { account?: string; nowMs?: number; allowPaid?: boolean } = {},
): QuotaDecision {
  const nowMs = opts.nowMs ?? Date.now();
  const want = Math.max(0, Math.floor(count));
  const account = accountKey(opts.account);
  const state = readState(nowMs);
  const usage = usageFor(state, account);
  const caps = featureCaps();

  const featureUsed = Math.max(0, Math.floor(usage.byFeature[feature] || 0));
  const featureCap = caps[feature] ?? null;
  const featureRemaining = featureCap === null ? null : Math.max(0, featureCap - featureUsed);

  /*
   * 유료 초과 허용 여부.
   *
   * allowPaid 를 넘겨 주는 호출부가 **하나도 없었다**(2026-08-22 실측).
   * 그래서 PAID_OVERAGE 를 켜도 상한이 무료선에서 멈췄다 — 사장님 계정에
   * 유료 여유가 있어도 프로그램이 쓰지 않았다.
   * PAID_OVERAGE 를 0 이 아닌 값으로 두는 것 자체가 "유료 감수" 의 명시적
   * 의사표시이므로, 그때는 기본으로 유료 상한을 쓴다. 명시 인자는 그대로 이긴다.
   */
  const allowPaid = opts.allowPaid ?? PAID_OVERAGE > 0;
  const ceiling = allowPaid ? HARD_CEILING : FREE_CEILING;
  const accountRemaining = Math.max(0, ceiling - usage.total);

  let granted = want;
  if (featureRemaining !== null) granted = Math.min(granted, featureRemaining);
  granted = Math.min(granted, accountRemaining);

  const freeRemaining = Math.max(0, FREE_CEILING - usage.total);
  const wouldBePaid = Math.max(0, granted - freeRemaining);

  const decision: QuotaDecision = {
    allowed: granted > 0 && granted >= want,
    granted,
    account,
    month: state.month,
    accountUsed: usage.total,
    accountRemainingFree: freeRemaining,
    featureUsed,
    featureRemaining,
    wouldBePaid,
  };
  if (granted <= 0) {
    decision.reason =
      featureRemaining === 0
        ? `기능 '${feature}' 월 상한(${featureCap}) 소진`
        : `계정 '${account}' 월 ${allowPaid ? '유료' : '무료'} 상한(${ceiling}) 소진`;
  } else if (granted < want) {
    decision.reason = `잔여 예산 부족: 요청 ${want} 중 ${granted} 만 승인`;
  }
  return decision;
}

/**
 * 요청 확정. 실제 Bright Data 호출을 성공적으로 수행한 뒤 부른다(사용량 증가).
 * reserve 없이 직접 부르면 상한을 넘어 기록될 수 있으니, 호출부는 reserve→호출→record 순서를 지킬 것.
 */
export function recordBrightDataRequests(
  feature: BrightDataFeature,
  count: number,
  opts: { account?: string; nowMs?: number } = {},
): QuotaDecision {
  const nowMs = opts.nowMs ?? Date.now();
  const used = Math.max(0, Math.floor(count));
  const account = accountKey(opts.account);
  const state = readState(nowMs);
  const usage = usageFor(state, account);
  usage.total += used;
  usage.byFeature[feature] = Math.max(0, Math.floor(usage.byFeature[feature] || 0)) + used;
  writeState(state);
  return reserveBrightDataRequests(feature, 0, { account, nowMs });
}

/** 현재 사용 현황 스냅샷(대시보드/알림용). */
export function brightDataQuotaSnapshot(opts: { account?: string; nowMs?: number } = {}): {
  month: string;
  account: string;
  freeCeiling: number;
  hardCeiling: number;
  used: number;
  remainingFree: number;
  byFeature: Record<string, number>;
} {
  const nowMs = opts.nowMs ?? Date.now();
  const account = accountKey(opts.account);
  const state = readState(nowMs);
  const usage = usageFor(state, account);
  return {
    month: state.month,
    account,
    freeCeiling: FREE_CEILING,
    hardCeiling: HARD_CEILING,
    used: usage.total,
    remainingFree: Math.max(0, FREE_CEILING - usage.total),
    byFeature: { ...usage.byFeature },
  };
}
