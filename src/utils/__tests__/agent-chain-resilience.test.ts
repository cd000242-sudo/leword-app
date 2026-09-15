import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../agent-cli/usageLedger', () => ({ recordAgentRun: vi.fn() }));

import { AllAgentsFailedError, runWithAnyAgent, type AgentAttempt } from '../agent-cli/runAny';
import { clearEngineHealth, getEngineCooldown } from '../agent-cli/engineHealth';
import { AgentCliError } from '../agent-cli/types';

/**
 * 폴백 체인 완성(2026-09-15, 사장님 "코덱스나 제미나이도 폴백이 완벽히 되게").
 *
 * 조사로 확인한 구멍:
 *   ① 답이 JSON 이 아니어도 성공으로 끝나 다음 엔진이 기회를 못 얻었다
 *   ② 막힌 엔진을 기억하지 않아 매 요청이 한도 걸린 엔진부터 다시 두드렸다
 *   ③ 취소가 체인 전체를 멈추지 못했다(취소 오류도 다음 엔진으로 넘어갔다)
 *   ④ 엔진마다 제한 시간을 새로 줘서 최악 대기가 엔진 수 × 제한이었다
 */
beforeEach(() => clearEngineHealth());

const ok = (reply: string) => vi.fn(async (_prompt: string, _options?: unknown) => reply);
const fail = (error: Error) => vi.fn(async (_prompt: string, _options?: unknown) => { throw error; });
const requireJson = (reply: string) => { JSON.parse(reply); };

describe('답 검사 — 형식이 틀린 답은 다음 엔진으로 넘긴다', () => {
  it('클로드가 설명문을 내면 코덱스의 JSON 을 쓴다', async () => {
    const attempts: AgentAttempt[] = [
      { provider: 'claude', run: ok('요청하신 결과는 다음과 같습니다') },
      { provider: 'codex', run: ok('{"reasons":[]}') },
    ];
    const result = await runWithAnyAgent('프롬프트', attempts, { validate: requireJson });
    expect(result.provider).toBe('codex');
    expect(result.reply).toBe('{"reasons":[]}');
    expect(result.failures.claude).toContain('답 형식');
  });

  it('형식 불량은 쉬게 하지 않는다 — 다음 요청에서 클로드를 다시 시도한다', async () => {
    const claude = ok('설명문');
    await runWithAnyAgent('프롬프트', [
      { provider: 'claude', run: claude },
      { provider: 'codex', run: ok('{}') },
    ], { validate: requireJson });
    expect(getEngineCooldown('claude')).toBeNull();
  });

  it('검사 함수는 엔진에 넘기지 않는다 — 엔진은 제한 시간과 취소 신호만 받는다', async () => {
    const claude = ok('{}');
    await runWithAnyAgent('프롬프트', [{ provider: 'claude', run: claude }], { validate: requireJson, timeoutMs: 1234 });
    expect(claude).toHaveBeenCalledWith('프롬프트', { timeoutMs: 1234 });
  });
});

describe('막힌 엔진 기억', () => {
  it('한도에 걸린 엔진은 다음 요청에서 부르지 않고 건너뛴다', async () => {
    const gemini = fail(new AgentCliError(
      'rate_limited',
      'gemini',
      '한도 초과',
      'RESOURCE_EXHAUSTED (code 429): Individual quota reached. Resets in 87h35m9s.',
    ));
    const codex = ok('코덱스 답');
    const attempts: AgentAttempt[] = [
      { provider: 'gemini', run: gemini },
      { provider: 'codex', run: codex },
    ];
    await runWithAnyAgent('프롬프트', attempts);
    const second = await runWithAnyAgent('프롬프트', attempts);
    expect(gemini).toHaveBeenCalledTimes(1);
    expect(second.provider).toBe('codex');
    expect(second.skipped).toEqual(['gemini']);
    expect(second.tried).toEqual(['codex']);
    expect(second.failures.gemini).toContain('건너뜀');
  });

  it('원인 코드가 없는 일반 오류는 기억하지 않는다', async () => {
    const claude = fail(new Error('weekly limit'));
    const attempts: AgentAttempt[] = [
      { provider: 'claude', run: claude },
      { provider: 'codex', run: ok('답') },
    ];
    await runWithAnyAgent('프롬프트', attempts);
    await runWithAnyAgent('프롬프트', attempts);
    expect(claude).toHaveBeenCalledTimes(2);
  });

  it('성공한 엔진은 기억이 지워진다', async () => {
    const codex = vi.fn()
      .mockRejectedValueOnce(new AgentCliError('timeout', 'codex', '시간 초과'))
      .mockResolvedValue('답');
    const attempts: AgentAttempt[] = [{ provider: 'codex', run: codex }];
    await runWithAnyAgent('프롬프트', attempts).catch(() => undefined);
    await runWithAnyAgent('프롬프트', attempts);
    await expect(runWithAnyAgent('프롬프트', attempts)).resolves.toMatchObject({ provider: 'codex' });
    expect(getEngineCooldown('codex')).toBeNull();
  });

  it('전부 쉬는 중이면 아무것도 띄우지 않고 이유를 모아 던진다', async () => {
    const claude = fail(new AgentCliError('not_logged_in', 'claude', '로그인이 필요합니다'));
    const attempts: AgentAttempt[] = [{ provider: 'claude', run: claude }];
    await expect(runWithAnyAgent('프롬프트', attempts)).rejects.toBeInstanceOf(AllAgentsFailedError);
    const error = await runWithAnyAgent('프롬프트', attempts).catch((e) => e);
    expect(claude).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(AllAgentsFailedError);
    expect(error.skipped).toEqual(['claude']);
    expect(error.tried).toEqual([]);
    expect(error.message).toContain('claude: 건너뜀');
  });
});

describe('취소는 체인 전체를 멈춘다', () => {
  it('첫 엔진이 취소로 끝나면 다음 엔진을 부르지 않는다', async () => {
    const controller = new AbortController();
    const claude = vi.fn(async () => {
      controller.abort();
      throw new AgentCliError('aborted', 'claude', '작업이 취소되었습니다.');
    });
    const codex = ok('답');
    await expect(runWithAnyAgent('프롬프트', [
      { provider: 'claude', run: claude },
      { provider: 'codex', run: codex },
    ], { signal: controller.signal })).rejects.toMatchObject({ code: 'aborted' });
    expect(codex).not.toHaveBeenCalled();
  });

  it('이미 취소된 요청은 어떤 엔진도 띄우지 않는다', async () => {
    const controller = new AbortController();
    controller.abort();
    const claude = ok('답');
    await expect(runWithAnyAgent('프롬프트', [{ provider: 'claude', run: claude }], { signal: controller.signal }))
      .rejects.toMatchObject({ code: 'aborted' });
    expect(claude).not.toHaveBeenCalled();
  });

  it('취소 신호를 엔진에 그대로 넘긴다', async () => {
    const controller = new AbortController();
    const claude = ok('답');
    await runWithAnyAgent('프롬프트', [{ provider: 'claude', run: claude }], { signal: controller.signal });
    expect(claude).toHaveBeenCalledWith('프롬프트', { signal: controller.signal });
  });
});

describe('전체 대기 상한 — 엔진마다 제한 시간이 쌓이지 않게', () => {
  it('두 번째 엔진에는 남은 시간만큼만 준다', async () => {
    let clock = 0;
    const claude = vi.fn(async () => {
      clock += 50_000;
      throw new AgentCliError('timeout', 'claude', '시간 초과');
    });
    const codex = ok('답');
    await runWithAnyAgent('프롬프트', [
      { provider: 'claude', run: claude },
      { provider: 'codex', run: codex },
    ], { timeoutMs: 60_000, deadlineMs: 90_000, now: () => clock });
    expect(claude).toHaveBeenCalledWith('프롬프트', { timeoutMs: 60_000 });
    expect(codex).toHaveBeenCalledWith('프롬프트', { timeoutMs: 40_000 });
  });

  it('남은 시간이 10초도 안 되면 다음 엔진을 띄우지 않는다', async () => {
    let clock = 0;
    const claude = vi.fn(async () => {
      clock += 85_000;
      throw new AgentCliError('timeout', 'claude', '시간 초과');
    });
    const codex = ok('답');
    const error = await runWithAnyAgent('프롬프트', [
      { provider: 'claude', run: claude },
      { provider: 'codex', run: codex },
    ], { timeoutMs: 60_000, deadlineMs: 90_000, now: () => clock }).catch((e) => e);
    expect(codex).not.toHaveBeenCalled();
    expect(error).toBeInstanceOf(AllAgentsFailedError);
    expect(error.failures.codex).toContain('대기 상한');
  });
});
