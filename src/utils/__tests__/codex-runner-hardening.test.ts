import * as fs from 'fs';
import { beforeEach, expect, it, vi } from 'vitest';

const spawn = vi.hoisted(() => vi.fn());
vi.mock('../agent-cli/spawnHelper', () => ({ spawnCollect: spawn }));

import { runCodex } from '../agent-cli/codexRunner';

/**
 * 코덱스 실행기 보강(2026-09-15, 사장님 "코덱스나 제미나이도 폴백이 완벽히 되게 · 에이전트만 사용").
 *
 * 실측(이 PC codex-cli 0.153.4): `-s read-only` · `-c forced_login_method="chatgpt"` 를 붙여도 ChatGPT 로그인으로
 * 8초에 정상 답. 표준에러는 버전 · 작업 폴더 · 모델 머리말과 프롬프트 메아리로 시작하고 오류는 끝에 온다.
 * 코덱스 실행기는 첫 커밋 이후 한 번도 안 다듬어져, 오류 상세를 앞 800자에서 잘랐다.
 */
// 중괄호 본문 — 식 본문이면 mockReset 이 돌려준 가짜 함수를 vitest 가 '테스트 뒤 정리 함수'로 인자 없이 부른다.
beforeEach(() => {
  spawn.mockReset();
});

function writeLastMessage(input: { args: string[] }, text: string): void {
  const out = input.args[input.args.indexOf('-o') + 1];
  fs.writeFileSync(out, text, 'utf8');
}

it('읽기 전용 샌드박스와 ChatGPT 로그인 강제로 부른다 — API 키 로그인으로 새지 않게', async () => {
  spawn.mockImplementation(async (input: { args: string[] }) => {
    writeLastMessage(input, '답');
    return { code: 0, stdout: '답', stderr: '' };
  });
  await expect(runCodex('프롬프트')).resolves.toBe('답');
  const args = (spawn.mock.calls[0][0] as { args: string[] }).args;
  expect(args.join(' ')).toContain('-s read-only');
  expect(args.join(' ')).toContain('-c forced_login_method="chatgpt"');
});

it('종료 코드 0 인데 최종 답 파일이 비고 ERROR 줄에 한도 문구가 있으면 한도 초과로 던진다', async () => {
  spawn.mockResolvedValue({
    code: 0,
    stdout: '',
    stderr: "OpenAI Codex v0.153.4\n--------\nworkdir: x\n--------\nERROR: You've hit your usage limit. Upgrade to Plus to continue using Codex (https://chatgpt.com/explore/plus), or try again at 3:05 PM.\n",
  });
  await expect(runCodex('프롬프트')).rejects.toMatchObject({ code: 'rate_limited', provider: 'codex' });
});

it('프롬프트 메아리에 든 말로 오분류하지 않는다 — ERROR 줄이 없으면 빈 답', async () => {
  spawn.mockResolvedValue({
    code: 0,
    stdout: '',
    stderr: 'OpenAI Codex v0.153.4\n--------\nuser\n무료 한도(quota) 초과 시 대처법을 알려줘\n--------\ntokens used\n120\n',
  });
  await expect(runCodex('프롬프트')).rejects.toMatchObject({ code: 'empty_output' });
});

it('오류 상세는 표준에러 끝부분을 남긴다 — 앞부분은 버전 · 작업 폴더 머리말이다', async () => {
  const header = `OpenAI Codex v0.153.4\n${'workdir: C:\\temp\\agentcli-codex-x\n'.repeat(60)}`;
  spawn.mockResolvedValue({ code: 1, stdout: '', stderr: `${header}ERROR: stream disconnected before completion` });
  await expect(runCodex('프롬프트')).rejects.toMatchObject({
    detail: expect.stringContaining('stream disconnected before completion'),
  });
});
