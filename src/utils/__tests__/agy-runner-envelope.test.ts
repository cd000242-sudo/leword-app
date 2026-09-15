import { beforeEach, describe, expect, it, vi } from 'vitest';

const spawn = vi.hoisted(() => vi.fn());
vi.mock('../agent-cli/spawnHelper', () => ({ spawnCollect: spawn }));

import { runGemini } from '../agent-cli/geminiRunner';

/**
 * 제미나이(agy) 실행기는 JSON 봉투로 부르고 봉투의 오류를 읽는다(2026-09-15 실측).
 *
 * 이 PC agy 1.2.3 · 무료 한도 소진 계정으로 잰 결과:
 *   - 지금 앱처럼 평문으로 부르면 2분(print-timeout) 동안 6번 재시도한 뒤 종료 코드 0 · 빈 표준출력으로 끝났다.
 *     앱은 "빈 응답"만 보고 한도 초과라는 원인을 잃었다.
 *   - `--output-format json` 을 붙이면 봉투에 status "ERROR" 와 한도 문구 · 초기화 시각이 담긴다.
 *   - 1.1.28 부터 시간 초과로 끊긴 미완성 답을 완성 답처럼 돌려준다(Lykhoyda/ask-llm #325) — 표준에러 문구로 가려낸다.
 * 성공 봉투의 status 값은 공식 문서에 없고 이 계정으로는 잴 수 없다 — ERROR 계열이 아니고 답이 있으면 성공으로 본다.
 */
const QUOTA_ENVELOPE = '{"conversation_id":"bbdf70cd-ff9d-4fe7-9879-ef8878397cc5","status":"ERROR","response":"","error":"API error (attempt 6): RESOURCE_EXHAUSTED (code 429): Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 87h35m9s.","duration_seconds":119.4911184,"num_turns":1,"usage":{"input_tokens":0,"output_tokens":0,"thinking_tokens":0,"cache_read_tokens":0,"total_tokens":0}}\n';
const PARTIAL_TIMEOUT_STDERR = '[agy] print timeout after 2m0s with turn in progress; returning partial output\n';

// 중괄호 본문 — 식 본문이면 mockReset 이 돌려준 가짜 함수를 vitest 가 '테스트 뒤 정리 함수'로 인자 없이 부른다.
beforeEach(() => {
  spawn.mockReset();
});

describe('agy 는 JSON 봉투로 부른다', () => {
  it('출력 형식 json 과 print-timeout(호출 제한 − 5초)을 넘긴다', async () => {
    spawn.mockResolvedValue({ code: 0, stdout: JSON.stringify({ status: 'SUCCESS', response: '{"ok":true}' }), stderr: '' });
    await runGemini('프롬프트', { timeoutMs: 60_000 });
    const { args, stdin } = spawn.mock.calls[0][0] as { args: string[]; stdin: string };
    expect(args.join(' ')).toContain('--output-format json');
    expect(args.join(' ')).toContain('--print-timeout 55s');
    expect(stdin).toBe('프롬프트');
  });

  it('봉투의 response 를 답으로 돌려준다', async () => {
    spawn.mockResolvedValue({ code: 0, stdout: JSON.stringify({ status: 'SUCCESS', response: '{"ok":true}' }), stderr: '' });
    await expect(runGemini('프롬프트')).resolves.toBe('{"ok":true}');
  });
});

describe('종료 코드 0 이어도 실패를 가려낸다', () => {
  it('status ERROR 봉투 → 한도 초과로 던지고 초기화 시각을 상세에 남긴다', async () => {
    spawn.mockResolvedValue({ code: 0, stdout: QUOTA_ENVELOPE, stderr: PARTIAL_TIMEOUT_STDERR });
    await expect(runGemini('프롬프트', { timeoutMs: 125_000 })).rejects.toMatchObject({
      code: 'rate_limited',
      provider: 'gemini',
      detail: expect.stringContaining('Resets in 87h35m9s'),
    });
  });

  it('시간 초과로 끊긴 미완성 답은 버린다', async () => {
    spawn.mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({ status: 'SUCCESS', response: '{"reasons":[{"te' }),
      stderr: PARTIAL_TIMEOUT_STDERR,
    });
    await expect(runGemini('프롬프트')).rejects.toMatchObject({ code: 'timeout' });
  });

  it('봉투 없이 빈 표준출력 + 시간 초과 문구 → 시간 초과', async () => {
    spawn.mockResolvedValue({ code: 0, stdout: '', stderr: PARTIAL_TIMEOUT_STDERR });
    await expect(runGemini('프롬프트')).rejects.toMatchObject({ code: 'timeout' });
  });

  it('아무 출력도 없으면 빈 답으로 던진다', async () => {
    spawn.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    await expect(runGemini('프롬프트')).rejects.toMatchObject({ code: 'empty_output' });
  });

  it('종료 코드가 0 이 아니고 봉투에 오류가 있으면 봉투 문구로 분류한다', async () => {
    spawn.mockResolvedValue({ code: 1, stdout: QUOTA_ENVELOPE, stderr: '' });
    await expect(runGemini('프롬프트')).rejects.toMatchObject({ code: 'rate_limited' });
  });
});

it('봉투가 아닌 옛 평문 출력은 그대로 쓴다', async () => {
  spawn.mockResolvedValue({ code: 0, stdout: '평문 답\n', stderr: '' });
  await expect(runGemini('프롬프트')).resolves.toBe('평문 답');
});
