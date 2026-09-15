import { beforeEach, expect, it, vi } from 'vitest';
const spawn = vi.hoisted(() => vi.fn());
vi.mock('../agent-cli/spawnHelper', () => ({ spawnCollect: spawn }));
import { clearAgentDetectionCache, detectAgent } from '../agent-cli/detect';

beforeEach(() => {
  spawn.mockReset();
  clearAgentDetectionCache();
});

it.each([
  ['Eligibility check failed: UNAVAILABLE (code 503)', 'nonzero_exit'],
  ['authentication required: no credentials', 'not_logged_in'],
])('Gemini 상태 조회: %s', async (stderr, errorCode) => {
  spawn.mockImplementation(async (input) => input.args.includes('--version')
    ? { code: 0, stdout: '1.2.2', stderr: '' }
    : { code: 1, stdout: '', stderr });
  expect(await detectAgent('gemini', { forceRefresh: true }))
    .toMatchObject({ installed: true, loggedIn: false, available: false, errorCode });
});
