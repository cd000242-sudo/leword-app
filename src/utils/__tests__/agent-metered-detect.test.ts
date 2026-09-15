import { beforeEach, expect, it, vi } from 'vitest';

const spawn = vi.hoisted(() => vi.fn());
vi.mock('../agent-cli/spawnHelper', () => ({ spawnCollect: spawn }));

import { clearAgentDetectionCache, detectAgent, getAgentDetectionRevision } from '../agent-cli/detect';

/**
 * 감지가 "과금 경로 로그인"을 따로 알려 준다(2026-09-15, 사장님 "에이전트만 사용하도록").
 * 생성 직전 차단(billingGuard)은 meteredAuth === true 일 때만 막는다 — 구독 유형을 모르는 것과
 * API 키로 로그인한 것은 다르다.
 */
beforeEach(() => {
  spawn.mockReset();
  clearAgentDetectionCache();
});

function claudeStatus(status: Record<string, unknown>) {
  spawn.mockImplementation(async (input: { args: string[] }) => (input.args.includes('--version')
    ? { code: 0, stdout: '2.1.251 (Claude Code)', stderr: '' }
    : { code: 0, stdout: JSON.stringify(status), stderr: '' }));
}

it('Claude Console · API 키 인증은 과금 경로로 표시한다', async () => {
  claudeStatus({ loggedIn: true, authMethod: 'console', apiProvider: 'firstParty', subscriptionType: 'max' });
  expect(await detectAgent('claude', { forceRefresh: true })).toMatchObject({
    loggedIn: true, available: false, errorCode: 'subscription_inactive', meteredAuth: true,
  });
});

it('Claude.ai 구독 로그인은 과금 표시가 없다', async () => {
  claudeStatus({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty', subscriptionType: 'max' });
  const status = await detectAgent('claude', { forceRefresh: true });
  expect(status).toMatchObject({ available: true });
  expect(status.meteredAuth).not.toBe(true);
});

it('구독 유형만 모를 때는 과금으로 표시하지 않는다 — 생성을 막을 근거가 아니다', async () => {
  claudeStatus({ loggedIn: true, authMethod: 'claude.ai' });
  const status = await detectAgent('claude', { forceRefresh: true });
  expect(status.available).toBe(false);
  expect(status.meteredAuth).not.toBe(true);
});

it('인증 방식 필드가 없는 옛 CLI 는 과금으로 단정하지 않는다', async () => {
  claudeStatus({ loggedIn: true, subscriptionType: 'pro' });
  expect((await detectAgent('claude', { forceRefresh: true })).meteredAuth).not.toBe(true);
});

it('Codex 가 ChatGPT 가 아닌 인증이면 과금 경로로 표시하고 한국어로 안내한다', async () => {
  spawn.mockImplementation(async (input: { args: string[] }) => (input.args.includes('--version')
    ? { code: 0, stdout: 'codex-cli 0.153.4', stderr: '' }
    : { code: 0, stdout: 'Logged in using an API key - sk-proj-***ABCD', stderr: '' }));
  const status = await detectAgent('codex', { forceRefresh: true });
  expect(status).toMatchObject({ available: false, errorCode: 'subscription_inactive', meteredAuth: true });
  expect(status.detail).toContain('ChatGPT');
  expect(status.detail).toMatch(/[가-힣]/);
});

it('감지를 새로 하면 기록 번호가 바뀐다 — 과금 차단이 옛 확인을 믿지 않게', async () => {
  claudeStatus({ loggedIn: true, authMethod: 'claude.ai', subscriptionType: 'max' });
  const before = getAgentDetectionRevision('claude');
  await detectAgent('claude', { forceRefresh: true });
  expect(getAgentDetectionRevision('claude')).not.toBe(before);
});
