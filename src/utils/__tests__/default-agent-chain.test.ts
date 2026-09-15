import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const runners = vi.hoisted(() => ({ claude: vi.fn(), codex: vi.fn(), gemini: vi.fn(), grok: vi.fn() }));
vi.mock('../agent-cli/claudeRunner', () => ({ runClaude: runners.claude }));
vi.mock('../agent-cli/codexRunner', () => ({ runCodex: runners.codex }));
vi.mock('../agent-cli/geminiRunner', () => ({ runGemini: runners.gemini }));
vi.mock('../agent-cli/grokRunner', () => ({ runGrok: runners.grok }));
vi.mock('../agent-cli/usageLedger', () => ({ recordAgentRun: vi.fn() }));
import { createDefaultAgentChain } from '../agent-cli/defaultChain';
import { AllAgentsFailedError, runWithAnyAgent } from '../agent-cli/runAny';

beforeEach(() => {
  for (const run of Object.values(runners)) run.mockReset().mockResolvedValue('응답');
});

describe('자동 생성 공통 폴백', () => {
  it('Claude 한도 초과와 Codex 실패 후 Gemini 응답을 사용한다', async () => {
    runners.claude.mockRejectedValue(new Error('weekly limit'));
    runners.codex.mockRejectedValue(new Error('not_installed'));
    const result = await runWithAnyAgent('근거 기반 글감', createDefaultAgentChain({ claudeModel: 'opus' }), { timeoutMs: 1234 });
    expect(result.provider).toBe('gemini');
    expect(result.tried).toEqual(['claude', 'codex', 'gemini']);
    expect(runners.claude).toHaveBeenCalledWith('근거 기반 글감', { model: 'opus', timeoutMs: 1234 });
    expect(runners.gemini).toHaveBeenCalledWith('근거 기반 글감', { timeoutMs: 1234 });
    expect(runners.grok).not.toHaveBeenCalled();
  });

  it('명시적으로 선택한 엔진이 실패해도 나머지 엔진으로 넘어간다', async () => {
    runners.codex.mockRejectedValue(new Error('rate_limited'));
    runners.claude.mockResolvedValue('  ');
    const result = await runWithAnyAgent('진단', createDefaultAgentChain({ preferredProvider: 'codex' }));
    expect(result.tried).toEqual(['codex', 'claude', 'gemini']);
    expect(result.provider).toBe('gemini');
  });

  it('모두 실패하면 최초 원인을 포함한 제공자별 사유를 남기고 자격증명은 가린다', async () => {
    runners.claude.mockRejectedValue(new Error('weekly limit token=private-value'));
    runners.codex.mockRejectedValue(new Error('not_installed'));
    runners.gemini.mockRejectedValue(new Error('UNAVAILABLE 503'));
    runners.grok.mockRejectedValue(new Error('not_installed'));
    const error = await runWithAnyAgent('생성', createDefaultAgentChain()).catch((e) => e);
    expect(error).toBeInstanceOf(AllAgentsFailedError);
    expect(error.message).toContain('claude: weekly limit');
    expect(error.message).toContain('gemini: UNAVAILABLE 503');
    expect(error.message).not.toContain('private-value');
    expect(error.tried).toEqual(['claude', 'codex', 'gemini', 'grok']);
  });

  it('알 수 없는 선택값도 정상 공통 순서를 유지한다', () => {
    expect(createDefaultAgentChain({ preferredProvider: 'unknown' }).map((r) => r.provider))
      .toEqual(['claude', 'codex', 'gemini', 'grok']);
  });
});

it('자동 생성 기능은 개별 CLI를 직접 연결하지 않는다 — 신규 기능의 폴백 누락 방지', () => {
  const root = path.resolve(__dirname, '../../..');
  const exceptions = new Set(['src/main/handlers/agent-cli-handlers.ts']); // 제공자별 설치·연결 진단
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return ['__tests__', 'agent-cli'].includes(entry.name) ? [] : walk(full);
    return /\.(?:ts|js)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : [];
  });
  const violations = ['src', 'scripts'].flatMap((dir) => walk(path.join(root, dir))).filter((file) => {
    const relative = path.relative(root, file).replace(/\\/g, '/');
    return !exceptions.has(relative) && /(?:from\s*|(?:require|import)\s*\()\s*['"][^'"]*agent-cli\/(?:claude|codex|gemini|grok)Runner['"]/.test(fs.readFileSync(file, 'utf8'));
  }).map((file) => path.relative(root, file));
  expect(violations).toEqual([]);
});
