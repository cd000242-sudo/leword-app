/**
 * 비서 실패 안내(2026-10-06) — 사장님 "안티그래비티 연동돼도 자꾸 할당량이 없다고 뜨네".
 *
 * 예전엔 원인과 상관없이 "AI 엔진이 답하지 못했습니다" 한 줄이라 한도 소진인지 로그인 문제인지 알 수 없었다.
 * 엔진별 실패 사유(runAny 의 failures)는 이미 모이고 있었으니, 원인 코드만 골라 사람이 읽는 말로 옮긴다.
 * 원문은 넘기지 않는다 — 경로 · 계정 정보가 섞일 수 있다.
 */
import { AllAgentsFailedError } from '../agent-cli/runAny';

const FALLBACK = 'AI 엔진이 답하지 못했습니다 — 설정의 AI 연결(처음 설정 마법사)을 확인해 주세요.';

const ENGINE_LABEL: Readonly<Record<string, string>> = {
  claude: 'Claude',
  codex: 'ChatGPT(Codex)',
  gemini: '구글(Antigravity)',
  grok: 'Grok',
};

const CODE_LABEL: Readonly<Record<string, string>> = {
  rate_limited: '사용 한도 소진',
  not_installed: '설치 안 됨',
  not_logged_in: '로그인 필요',
  subscription_inactive: '구독 계정 아님',
  timeout: '시간 초과',
  provider_disabled: '사용할 수 없는 방식',
};

/** 쉬는 중 사유(engineHealth reason)의 머리말 → 원인 코드. */
const REASON_CODE: ReadonlyArray<[RegExp, string]> = [
  [/^사용 한도 초과/, 'rate_limited'],
  [/^설치 안 됨/, 'not_installed'],
  [/^로그인 필요/, 'not_logged_in'],
  [/^구독 계정 아님/, 'subscription_inactive'],
  [/^시간 초과/, 'timeout'],
];

/** 구글 무료 · AI Plus 는 주 1회, AI Pro 이상은 5시간마다 초기화(웹 교차 확인 2026-10-06). */
const GOOGLE_QUOTA_NOTE = '구글 무료 · AI Plus 는 주 1회, AI Pro 이상은 5시간마다 초기화됩니다';

/** 쉬는 시간 꼬리(" — 3일 4시간 뒤 다시 시도")만 떼어 낸다. */
function waitTail(text: string): string {
  const match = text.match(/—\s*([^—]+뒤 다시 시도)/);
  return match ? ` — ${match[1].trim()}` : '';
}

function lineFor(provider: string, failure: string, cooldownReason: string | null): string {
  const label = ENGINE_LABEL[provider] ?? provider;
  const skipped = failure.replace(/^건너뜀:\s*/, '');
  const code = failure.match(/원인 코드:\s*([a-z_]+)/)?.[1]
    ?? REASON_CODE.find(([re]) => re.test(skipped))?.[1]
    ?? (cooldownReason ? REASON_CODE.find(([re]) => re.test(cooldownReason))?.[1] : undefined);
  if (/전체 대기 상한/.test(skipped)) return `· ${label}: 앞 엔진이 시간을 다 써서 시도 못 함`;
  if (!code || !CODE_LABEL[code]) return `· ${label}: 응답 실패`;
  const wait = waitTail(cooldownReason ?? '') || waitTail(skipped);
  const note = code === 'rate_limited' && provider === 'gemini' ? `. ${GOOGLE_QUOTA_NOTE}` : '';
  return `· ${label}: ${CODE_LABEL[code]}${wait}${note}`;
}

/**
 * 비서 실패 → 화면 문구. cooldownOf 는 engineHealth.getEngineCooldown 의 reason
 * (한도 초기화까지 남은 시간은 실패 문구가 아니라 쉬는 기록에만 있다).
 */
export function describeAssistantFailure(
  error: unknown,
  cooldownOf: (provider: string) => string | null,
): string {
  if (!(error instanceof AllAgentsFailedError)) return FALLBACK;
  const lines = Object.entries(error.failures).map(([provider, failure]) => lineFor(provider, String(failure), cooldownOf(provider)));
  if (lines.length === 0) return FALLBACK;
  return ['AI 엔진이 모두 답하지 못했습니다.', ...lines, '설정 → AI 연결(처음 설정 마법사)에서 로그인 · 설치를 확인하거나, 한도가 풀린 뒤 다시 물어봐 주세요.'].join('\n');
}
