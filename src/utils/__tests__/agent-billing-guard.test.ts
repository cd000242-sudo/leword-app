import { beforeEach, expect, it, vi } from 'vitest';

const detect = vi.hoisted(() => ({
  detectAgent: vi.fn(),
  getAgentDetectionRevision: vi.fn(() => 1),
}));
vi.mock('../agent-cli/detect', () => detect);

import { assertClaudeSubscriptionBilling, resetClaudeBillingGuard } from '../agent-cli/billingGuard';

/**
 * 과금 경로 차단(2026-09-15, 사장님 "api 키는 안 쓰지 않니? 에이전트만 사용하도록 할 건데").
 *
 * 환경변수 차단(허용목록)은 이미 됐다. 남은 구멍은 **저장된 로그인** 이다 — Claude 를 Console · API 키로
 * 로그인해 두면 환경변수를 지워도 `claude -p` 가 그 인증으로 종량 과금한다. 생성 체인은 감지를 한 번도
 * 부르지 않았다(detect.ts 주석은 "생성 경로는 강제 재감지"라고 적었지만 호출이 없었다).
 * 과금 증거가 있을 때만 막는다 — 감지를 못 한 것까지 막으면 멀쩡한 구독 사용자를 막는다.
 */
beforeEach(() => {
  detect.detectAgent.mockReset();
  detect.getAgentDetectionRevision.mockReset().mockReturnValue(1);
  resetClaudeBillingGuard();
});

const subscription = { provider: 'claude', installed: true, loggedIn: true, available: true };

it('Claude 가 API 키 · Console(종량) 인증이면 부르지 않는다', async () => {
  detect.detectAgent.mockResolvedValue({
    provider: 'claude', installed: true, loggedIn: true, available: false,
    errorCode: 'subscription_inactive', meteredAuth: true,
  });
  await expect(assertClaudeSubscriptionBilling({}, 0)).rejects.toMatchObject({
    code: 'subscription_inactive',
    provider: 'claude',
  });
});

it('구독 확인은 10분 동안 다시 묻지 않는다', async () => {
  detect.detectAgent.mockResolvedValue(subscription);
  await assertClaudeSubscriptionBilling({}, 0);
  await assertClaudeSubscriptionBilling({}, 9 * 60_000);
  expect(detect.detectAgent).toHaveBeenCalledTimes(1);
  await assertClaudeSubscriptionBilling({}, 11 * 60_000);
  expect(detect.detectAgent).toHaveBeenCalledTimes(2);
});

it('감지를 못 해도(미설치 · 구독 유형 모름) 막지 않는다 — 과금 증거가 있을 때만 막는다', async () => {
  detect.detectAgent.mockResolvedValue({
    provider: 'claude', installed: true, loggedIn: false, available: false, errorCode: 'subscription_inactive',
  });
  await expect(assertClaudeSubscriptionBilling({}, 0)).resolves.toBeUndefined();
  detect.detectAgent.mockResolvedValue({ provider: 'claude', installed: false, loggedIn: false, available: false });
  await expect(assertClaudeSubscriptionBilling({}, 1)).resolves.toBeUndefined();
});

it('CI 구독 토큰(CLAUDE_CODE_OAUTH_TOKEN)으로 도는 곳은 감지하지 않는다', async () => {
  await assertClaudeSubscriptionBilling({ CLAUDE_CODE_OAUTH_TOKEN: 'fixture-token' }, 0);
  expect(detect.detectAgent).not.toHaveBeenCalled();
});

it('설치 · 로그인으로 감지 기록이 바뀌면 10분 안이라도 다시 확인한다', async () => {
  detect.detectAgent.mockResolvedValue(subscription);
  await assertClaudeSubscriptionBilling({}, 0);
  detect.getAgentDetectionRevision.mockReturnValue(5);
  await assertClaudeSubscriptionBilling({}, 60_000);
  expect(detect.detectAgent).toHaveBeenCalledTimes(2);
});
