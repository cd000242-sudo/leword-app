/**
 * 과금 경로 차단 — Claude 가 API 키 · Console(종량) 인증으로 로그인돼 있으면 생성에 쓰지 않는다
 * (2026-09-15, 사장님 "api 키는 안 쓰지 않니? 에이전트만 사용하도록 할 건데").
 *
 * 환경변수는 허용목록으로 이미 막았다(subscriptionEnv). 남은 구멍은 **저장된 로그인** 이다 — 공식 문서상
 * `claude -p` 는 저장된 API 키 · Console 인증이 있으면 묻지 않고 그걸 쓴다. 코덱스는 실행 인자
 * (forced_login_method="chatgpt")로, agy · grok 은 허용목록으로 막히므로 여기서는 Claude 만 본다.
 *
 * 과금 증거(detect 의 meteredAuth)가 있을 때만 막는다. 감지를 못 했거나 구독 유형만 모르는 경우까지 막으면
 * 멀쩡한 구독 사용자가 막힌다 — 그런 경우는 실행 결과의 오류가 알려 준다.
 */
import { detectAgent, getAgentDetectionRevision } from './detect';
import { AgentCliError } from './types';

/** 구독 로그인을 확인한 뒤 다시 묻지 않는 시간 — 배치가 수십 번 부를 때 매번 감지 프로세스를 띄우지 않게. */
const VERIFIED_TTL_MS = 10 * 60_000;

let verified: { at: number; revision: number } | null = null;

export async function assertClaudeSubscriptionBilling(
  env: NodeJS.ProcessEnv = process.env,
  now: number = Date.now(),
): Promise<void> {
  // CI 러너는 `claude setup-token` 구독 토큰으로만 돈다 — 정액이라 감지할 필요가 없다.
  if (String(env.CLAUDE_CODE_OAUTH_TOKEN ?? '').trim()) return;
  if (
    verified
    && now - verified.at < VERIFIED_TTL_MS
    && verified.revision === getAgentDetectionRevision('claude')
  ) return;

  const status = await detectAgent('claude');
  if (status.meteredAuth === true) {
    verified = null;
    throw new AgentCliError(
      'subscription_inactive',
      'claude',
      'Claude 가 API 키 · Console(종량 과금) 인증으로 로그인돼 있어 쓰지 않았습니다. 설정의 AI 엔진 연동에서 Claude.ai 구독 계정으로 다시 로그인해 주세요.',
    );
  }
  verified = status.installed && status.loggedIn
    ? { at: now, revision: getAgentDetectionRevision('claude') }
    : null;
}

/** 테스트 · 계정 전환 뒤에 확인 기록을 지운다. */
export function resetClaudeBillingGuard(): void {
  verified = null;
}
