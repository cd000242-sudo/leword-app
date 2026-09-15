import { expect, it, vi } from 'vitest';
const spawn = vi.hoisted(() => vi.fn());
vi.mock('../agent-cli/spawnHelper', () => ({ spawnCollect: spawn }));
import { runClaude } from '../agent-cli/claudeRunner';

it('오류 봉투의 긴 메타데이터보다 실제 사용 한도 안내를 먼저 남긴다', async () => {
  spawn.mockResolvedValue({ code: 1, stderr: '', stdout: JSON.stringify({
    metadata: 'x'.repeat(1000), is_error: true,
    result: "You've hit your weekly limit · resets Sep 15, 4am (Asia/Seoul)",
  }) });
  await expect(runClaude('연동확인')).rejects.toMatchObject({
    code: 'rate_limited',
    message: expect.stringContaining('resets Sep 15, 4am'),
  });
});
