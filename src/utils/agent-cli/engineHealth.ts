/**
 * 막힌 엔진 기억 — 앱이 켜져 있는 동안만(2026-09-15, 사장님 "코덱스나 제미나이도 폴백이 완벽히 되게").
 *
 * 왜: 이 PC 실측에서 무료 한도가 찬 agy 는 2분 동안 6번 재시도한 뒤에야 실패를 알렸고, 로그인이 풀린 코덱스는
 * 5번 재접속하느라 22초를 썼다. 기억이 없으면 매 요청이 그 시간을 다시 버리고, 클로드가 한도에 걸린 날엔
 * 매번 클로드부터 다시 두드린다.
 *
 * 영구 저장하지 않는다 — 한도가 풀리거나 사용자가 다시 로그인해도 옛 판단이 남기 때문이다. 설치 · 로그인 화면이
 * 감지 캐시를 비우면(detect.clearAgentDetectionCache) 그 엔진 기억도 같이 지운다.
 */
import { parseRateLimitResetMs } from './parse';
import type { AgentErrorCode, AgentProvider } from './types';

export interface EngineCooldown {
  provider: AgentProvider;
  code: AgentErrorCode;
  /** 이 시각(ms)부터 다시 시도한다. */
  until: number;
  /** 건너뛸 때 실패 사유에 적는 한국어 한 줄. */
  reason: string;
}

/** 한도 초과인데 CLI 가 초기화 시각을 안 알려 줄 때 쉬는 시간. */
const RATE_LIMIT_DEFAULT_MS = 30 * 60_000;
/** 문구를 잘못 읽어 엔진을 영영 잃지 않게 — agy 무료 한도는 주 1회 초기화된다. */
const RATE_LIMIT_MAX_MS = 8 * 24 * 60 * 60_000;
const TIMEOUT_STREAK_LIMIT = 2;
const TIMEOUT_STREAK_COOLDOWN_MS = 10 * 60_000;

/** 설치 · 로그인 문제는 사용자가 곧 고칠 수 있어 짧게 쉰다. 여기 없는 원인은 쉬지 않는다. */
const COOLDOWN_MS: Readonly<Partial<Record<AgentErrorCode, number>>> = Object.freeze({
  not_installed: 2 * 60_000,
  not_logged_in: 3 * 60_000,
  subscription_inactive: 10 * 60_000,
});

const REASON_LABEL: Readonly<Partial<Record<AgentErrorCode, string>>> = Object.freeze({
  rate_limited: '사용 한도 초과',
  not_installed: '설치 안 됨',
  not_logged_in: '로그인 필요',
  subscription_inactive: '구독 계정 아님',
  timeout: '시간 초과가 이어짐',
});

const cooldowns = new Map<AgentProvider, EngineCooldown>();
const timeoutStreaks = new Map<AgentProvider, number>();

function describeWait(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}시간 ${rest}분` : `${hours}시간`;
}

function waitFor(provider: AgentProvider, code: AgentErrorCode, detail: string): number {
  if (code === 'timeout') {
    const streak = (timeoutStreaks.get(provider) ?? 0) + 1;
    timeoutStreaks.set(provider, streak);
    return streak >= TIMEOUT_STREAK_LIMIT ? TIMEOUT_STREAK_COOLDOWN_MS : 0;
  }
  timeoutStreaks.delete(provider);
  if (code === 'rate_limited') {
    return Math.min(parseRateLimitResetMs(detail) ?? RATE_LIMIT_DEFAULT_MS, RATE_LIMIT_MAX_MS);
  }
  return COOLDOWN_MS[code] ?? 0;
}

/** 원인 코드가 붙은 실패를 적는다. 쉬게 되면 그 기록을, 아니면 null 을 돌려준다. */
export function recordEngineFailure(
  provider: AgentProvider,
  code: AgentErrorCode,
  detail: string,
  now: number = Date.now(),
): EngineCooldown | null {
  const waitMs = waitFor(provider, code, detail);
  if (waitMs <= 0) return null;
  const cooldown: EngineCooldown = {
    provider,
    code,
    until: now + waitMs,
    reason: `${REASON_LABEL[code] ?? code} — ${describeWait(waitMs)} 뒤 다시 시도`,
  };
  cooldowns.set(provider, cooldown);
  return { ...cooldown };
}

export function recordEngineSuccess(provider: AgentProvider): void {
  cooldowns.delete(provider);
  timeoutStreaks.delete(provider);
}

/** 지금 쉬는 중이면 그 기록을, 아니면 null. 시각이 지난 기록은 지운다. */
export function getEngineCooldown(provider: AgentProvider, now: number = Date.now()): EngineCooldown | null {
  const cooldown = cooldowns.get(provider);
  if (!cooldown) return null;
  if (now >= cooldown.until) {
    cooldowns.delete(provider);
    return null;
  }
  return { ...cooldown };
}

export function clearEngineHealth(provider?: AgentProvider): void {
  if (provider) {
    cooldowns.delete(provider);
    timeoutStreaks.delete(provider);
    return;
  }
  cooldowns.clear();
  timeoutStreaks.clear();
}
