import { describe, expect, it } from 'vitest';
import {
  buildClaudeSubscriptionEnv,
  buildCodexSubscriptionEnv,
} from '../agent-cli/subscriptionEnv';

/**
 * 구독 실행 환경 — "구독으로는 돌되, 종량 과금으로는 절대 안 샌다".
 *
 * 2026-08-18 회차 실측이 이 파일의 이유다. CI 보강이 30회 호출에 제안 0건으로
 * 끝났는데 원인은 전부 not_logged_in 이었다. CI 는 CLAUDE_CODE_OAUTH_TOKEN
 * (claude setup-token 으로 발급한 **구독** 자격)으로 로그인하는데, 허용 목록에
 * 그 이름이 없어 통째로 걸러졌다. 자격증명이 사라진 CLI 가 "로그인 안 됨"이라
 * 답한 것이다.
 *
 * OAuth 토큰은 구독 자격이지 API 키가 아니다. 이걸 막는 건 이 모듈의 목적이
 * 아니라 오히려 반대다 — 막아야 할 것은 종량 과금으로 새는 API 키다.
 */

describe('구독 자격은 통과시킨다', () => {
  it('클로드 구독 OAuth 토큰이 전달된다', () => {
    const env = buildClaudeSubscriptionEnv({
      PATH: '/usr/bin',
      CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat-test',
    } as NodeJS.ProcessEnv);
    expect(env['CLAUDE_CODE_OAUTH_TOKEN']).toBe('sk-ant-oat-test');
  });

  it('토큰이 없으면 그냥 없다 — 빈 값을 지어내지 않는다', () => {
    const env = buildClaudeSubscriptionEnv({ PATH: '/usr/bin' } as NodeJS.ProcessEnv);
    expect(env['CLAUDE_CODE_OAUTH_TOKEN']).toBeUndefined();
  });
});

describe('종량 과금 자격은 계속 막는다', () => {
  it('ANTHROPIC_API_KEY 는 걸러진다', () => {
    // 이게 새면 구독이 아니라 사장님 카드로 건당 과금된다.
    const env = buildClaudeSubscriptionEnv({
      PATH: '/usr/bin',
      ANTHROPIC_API_KEY: 'sk-ant-api-should-not-pass',
      ANTHROPIC_AUTH_TOKEN: 'nope',
      ANTHROPIC_BASE_URL: 'https://example.test',
    } as NodeJS.ProcessEnv);
    expect(env['ANTHROPIC_API_KEY']).toBeUndefined();
    expect(env['ANTHROPIC_AUTH_TOKEN']).toBeUndefined();
    expect(env['ANTHROPIC_BASE_URL']).toBeUndefined();
  });

  it('코덱스 쪽으로도 API 키는 안 넘어간다', () => {
    const env = buildCodexSubscriptionEnv({
      PATH: '/usr/bin',
      OPENAI_API_KEY: 'sk-should-not-pass',
    } as NodeJS.ProcessEnv);
    expect(env['OPENAI_API_KEY']).toBeUndefined();
  });

  it('클로드 토큰이 코덱스 환경으로 새지 않는다', () => {
    // 제공자별 자격은 제공자별로만 간다. 섞이면 어느 구독이 쓰였는지 알 수 없다.
    const env = buildCodexSubscriptionEnv({
      PATH: '/usr/bin',
      CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat-test',
    } as NodeJS.ProcessEnv);
    expect(env['CLAUDE_CODE_OAUTH_TOKEN']).toBeUndefined();
  });
});
