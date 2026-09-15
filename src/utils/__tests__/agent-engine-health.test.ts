import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearEngineHealth,
  getEngineCooldown,
  recordEngineFailure,
  recordEngineSuccess,
} from '../agent-cli/engineHealth';
import { clearAgentDetectionCache } from '../agent-cli/detect';

/**
 * 막힌 엔진 기억(2026-09-15, 사장님 "코덱스나 제미나이도 폴백이 완벽히 되게").
 *
 * 실측(이 PC agy 1.2.3): 무료 한도가 차면 agy 가 2분 동안 6번 재시도한 뒤 종료 코드 0 으로 끝난다.
 * 기억이 없으면 매 요청이 그 2분을 다시 쓰고, 클로드가 한도에 걸린 날엔 매번 클로드부터 다시 두드린다.
 * 앱이 켜져 있는 동안만 기억한다 — 영구 저장하면 한도가 풀리거나 다시 로그인해도 옛 판단이 남는다.
 */
const T0 = 1_000_000;

beforeEach(() => clearEngineHealth());

describe('한도 초과는 CLI 가 알려 준 초기화 시각까지 건너뛴다', () => {
  it('agy 실측 문구 "Resets in 87h35m9s" → 그 시각까지', () => {
    recordEngineFailure(
      'gemini',
      'rate_limited',
      'API error (attempt 6): RESOURCE_EXHAUSTED (code 429): Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 87h35m9s.',
      T0,
    );
    const resetMs = (87 * 3600 + 35 * 60 + 9) * 1000;
    const cooldown = getEngineCooldown('gemini', T0 + 1000);
    expect(cooldown?.until).toBe(T0 + resetMs);
    expect(cooldown?.reason).toContain('한도');
    expect(getEngineCooldown('gemini', T0 + resetMs + 1)).toBeNull();
  });

  it('초기화 시각을 모르면 30분 쉰다', () => {
    recordEngineFailure('codex', 'rate_limited', "You've hit your usage limit.", T0);
    expect(getEngineCooldown('codex', T0)?.until).toBe(T0 + 30 * 60_000);
  });
});

describe('설치·로그인 문제는 짧게 쉬고, 성공하면 바로 푼다', () => {
  it('미설치 2분 · 미로그인 3분 · 구독 아님 10분', () => {
    recordEngineFailure('grok', 'not_installed', '', T0);
    recordEngineFailure('claude', 'not_logged_in', '', T0);
    recordEngineFailure('codex', 'subscription_inactive', '', T0);
    expect(getEngineCooldown('grok', T0)?.until).toBe(T0 + 2 * 60_000);
    expect(getEngineCooldown('claude', T0)?.until).toBe(T0 + 3 * 60_000);
    expect(getEngineCooldown('codex', T0)?.until).toBe(T0 + 10 * 60_000);
  });

  it('형식 불량 · 비정상 종료 · 빈 답 · 실행 실패는 쉬지 않는다 — 다음 요청에 다시 기회를 준다', () => {
    for (const code of ['bad_json', 'nonzero_exit', 'empty_output', 'spawn_failed', 'aborted'] as const) {
      recordEngineFailure('claude', code, '', T0);
    }
    expect(getEngineCooldown('claude', T0)).toBeNull();
  });

  it('시간 초과는 두 번 연속일 때만 10분 쉰다', () => {
    recordEngineFailure('gemini', 'timeout', '', T0);
    expect(getEngineCooldown('gemini', T0)).toBeNull();
    recordEngineFailure('gemini', 'timeout', '', T0 + 1);
    expect(getEngineCooldown('gemini', T0 + 1)?.until).toBe(T0 + 1 + 10 * 60_000);
  });

  it('성공하면 쉬는 기록과 연속 시간 초과 수를 지운다', () => {
    recordEngineFailure('gemini', 'timeout', '', T0);
    recordEngineSuccess('gemini');
    recordEngineFailure('gemini', 'timeout', '', T0 + 1);
    expect(getEngineCooldown('gemini', T0 + 1)).toBeNull();
  });

  it('설치·로그인 화면이 감지 캐시를 비우면 그 엔진 기억도 지운다', () => {
    recordEngineFailure('codex', 'not_logged_in', '', T0);
    recordEngineFailure('claude', 'not_logged_in', '', T0);
    clearAgentDetectionCache('codex');
    expect(getEngineCooldown('codex', T0)).toBeNull();
    expect(getEngineCooldown('claude', T0)).not.toBeNull();
    clearAgentDetectionCache();
    expect(getEngineCooldown('claude', T0)).toBeNull();
  });
});
