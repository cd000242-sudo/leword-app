import { describe, expect, it } from 'vitest';
import { runWithAnyAgent, type AgentAttempt } from '../agent-cli/runAny';

/**
 * 구독 CLI 공용 실행기 — "하나가 죽어도 다음 것으로 간다".
 *
 * 2026-08-18 사장님 지적("클로드코드랑 코덱스가 배선이 제대로 안 되어 있는 것 같은데")의
 * 실체다. 데스크톱 경로는 claude → codex → gemini 를 차례로 시도하는데, CI 보강
 * (enrich-board.js)은 runClaude 하나만 불렀다. 그래서 클로드가 로그인에 실패한
 * 회차는 코덱스 구독이 멀쩡히 있는데도 통째로 0건이 됐다.
 *
 * 어떤 제공자가 답했는지도 돌려준다 — 안 남기면 "무엇이 이 결과를 만들었나"를
 * 나중에 알 수 없다.
 */

function fakeRunner(reply: string) {
  return async () => reply;
}
function failingRunner(message: string) {
  return async () => { throw new Error(message); };
}

describe('공급자 연쇄', () => {
  it('첫 번째가 되면 거기서 멈춘다', async () => {
    const attempts: AgentAttempt[] = [
      { provider: 'claude', run: fakeRunner('클로드 응답') },
      { provider: 'codex', run: fakeRunner('코덱스 응답') },
    ];
    const result = await runWithAnyAgent('아무 프롬프트', attempts);
    expect(result.reply).toBe('클로드 응답');
    expect(result.provider).toBe('claude');
  });

  it('첫 번째가 죽으면 다음으로 넘어간다', async () => {
    // 실제 사고 재현: 클로드가 not_logged_in, 코덱스는 멀쩡.
    const attempts: AgentAttempt[] = [
      { provider: 'claude', run: failingRunner('원인 코드: not_logged_in') },
      { provider: 'codex', run: fakeRunner('코덱스 응답') },
    ];
    const result = await runWithAnyAgent('아무 프롬프트', attempts);
    expect(result.reply).toBe('코덱스 응답');
    expect(result.provider).toBe('codex');
  });

  it('전부 죽으면 마지막 사유를 들고 던진다', async () => {
    const attempts: AgentAttempt[] = [
      { provider: 'claude', run: failingRunner('not_logged_in') },
      { provider: 'codex', run: failingRunner('not_installed') },
    ];
    // 조용히 빈 결과를 주면 "AI 가 아무 제안도 안 했다"로 오독된다 —
    // 실패는 실패라고 말해야 다음 회차에 고칠 수 있다.
    await expect(runWithAnyAgent('아무 프롬프트', attempts)).rejects.toThrow(/not_installed/);
  });

  it('빈 응답은 성공으로 치지 않고 다음 제공자로 넘어간다', async () => {
    const attempts: AgentAttempt[] = [
      { provider: 'claude', run: fakeRunner('   ') },
      { provider: 'codex', run: fakeRunner('코덱스 응답') },
    ];
    const result = await runWithAnyAgent('아무 프롬프트', attempts);
    expect(result.provider).toBe('codex');
  });

  it('시도한 제공자와 실패 사유를 모두 남긴다', async () => {
    const attempts: AgentAttempt[] = [
      { provider: 'claude', run: failingRunner('not_logged_in') },
      { provider: 'codex', run: fakeRunner('코덱스 응답') },
    ];
    const result = await runWithAnyAgent('아무 프롬프트', attempts);
    expect(result.tried).toEqual(['claude', 'codex']);
    expect(result.failures['claude']).toMatch(/not_logged_in/);
  });
});
