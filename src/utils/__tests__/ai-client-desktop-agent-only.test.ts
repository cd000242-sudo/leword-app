import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const agent = vi.hoisted(() => ({ runWithAnyAgent: vi.fn(), createDefaultAgentChain: vi.fn(() => ['체인']) }));
vi.mock('../agent-cli/runAny', () => ({ runWithAnyAgent: agent.runWithAnyAgent }));
vi.mock('../agent-cli/defaultChain', () => ({ createDefaultAgentChain: agent.createDefaultAgentChain }));

const config = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../environment-manager', () => ({
  EnvironmentManager: { getInstance: () => ({ getConfig: () => config.value }) },
}));

const sdk = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => ({ default: vi.fn(() => ({ messages: { create: sdk.create } })) }));

import { callAI, RuleFallbackRequired, runsInDesktopApp } from '../pro-hunter-v12/ai-client';

/**
 * 데스크톱 앱의 callAI 는 구독 에이전트만 쓴다(2026-09-15, 사장님 "api 키는 안 쓰지 않니? 에이전트만 사용하도록 할 건데").
 *
 * 예전에는 Anthropic API 키로 claude-sonnet-4-6 을 불렀다 — 종량 과금이고 코덱스 · 제미나이 폴백이 없었다.
 * AI 메이트 제목 · LSI 등 callAI 를 쓰는 기능이 전부 이 경로였다. 모바일 서버(pro-blueprint → draft-generator)도
 * 같은 파일을 부른다 — 앱 밖도 API 키로 부르지 않는다(2026-09-16 사장님 결정 "서버 키 경로를 코드에서 제거").
 */
const savedFlag = process.env.LEWORD_AI_AGENT_ONLY;

beforeEach(() => {
  agent.runWithAnyAgent.mockReset();
  sdk.create.mockReset();
  config.value = { anthropicApiKey: 'sk-ant-fixture-not-a-real-key-000000000000' };
  process.env.LEWORD_AI_AGENT_ONLY = '1';
});

afterEach(() => {
  if (savedFlag === undefined) delete process.env.LEWORD_AI_AGENT_ONLY;
  else process.env.LEWORD_AI_AGENT_ONLY = savedFlag;
});

describe('데스크톱 앱 — 구독 에이전트만', () => {
  it('Anthropic 키가 저장돼 있어도 API 를 부르지 않고 에이전트 답을 돌려준다', async () => {
    agent.runWithAnyAgent.mockResolvedValue({ reply: ' ["제목 하나"] ', provider: 'codex', tried: ['claude', 'codex'], skipped: [], failures: {} });
    await expect(callAI('프롬프트')).resolves.toEqual({ text: '["제목 하나"]', source: 'codex' });
    expect(sdk.create).not.toHaveBeenCalled();
  });

  it('system 은 프롬프트 앞에 붙여 체인에 넘긴다', async () => {
    agent.runWithAnyAgent.mockResolvedValue({ reply: '답', provider: 'claude', tried: ['claude'], skipped: [], failures: {} });
    await callAI('본문', { system: '너는 편집자다', maxTokens: 10, temperature: 0.1 });
    expect(agent.runWithAnyAgent).toHaveBeenCalledWith('너는 편집자다\n\n본문', ['체인'], expect.objectContaining({ timeoutMs: expect.any(Number) }));
  });

  it('에이전트가 전부 실패하면 RuleFallbackRequired — 호출한 쪽이 규칙 결과로 이어 간다', async () => {
    agent.runWithAnyAgent.mockRejectedValue(new Error('구독 CLI 전부 실패: claude: 한도'));
    await expect(callAI('프롬프트')).rejects.toBeInstanceOf(RuleFallbackRequired);
    expect(sdk.create).not.toHaveBeenCalled();
  });

  it('설정이 rule(AI 끔)이면 에이전트도 부르지 않는다', async () => {
    config.value = { aiInferenceMode: 'rule' };
    await expect(callAI('프롬프트')).rejects.toBeInstanceOf(RuleFallbackRequired);
    expect(agent.runWithAnyAgent).not.toHaveBeenCalled();
  });

  it('옛 claude 모드에 키가 없어도 막지 않고 에이전트로 간다', async () => {
    config.value = { aiInferenceMode: 'claude' };
    agent.runWithAnyAgent.mockResolvedValue({ reply: '답', provider: 'gemini', tried: ['gemini'], skipped: [], failures: {} });
    await expect(callAI('프롬프트')).resolves.toMatchObject({ source: 'gemini' });
  });
});

describe('앱 밖(모바일 서버 · 스크립트) — API 키로도 부르지 않는다', () => {
  it('데스크톱이 아니면 에이전트를 부르지 않는다', async () => {
    delete process.env.LEWORD_AI_AGENT_ONLY;
    config.value = {};
    expect(runsInDesktopApp()).toBe(false);
    await expect(callAI('프롬프트')).rejects.toBeInstanceOf(RuleFallbackRequired);
    expect(agent.runWithAnyAgent).not.toHaveBeenCalled();
  });

  it('서버에 Anthropic 키가 있어도 SDK 를 부르지 않고 규칙 결과로 넘긴다 — claude 모드여도 같다', async () => {
    delete process.env.LEWORD_AI_AGENT_ONLY;
    for (const aiInferenceMode of ['auto', 'claude']) {
      config.value = { aiInferenceMode, anthropicApiKey: 'sk-ant-server-test-key' };
      await expect(callAI('프롬프트')).rejects.toBeInstanceOf(RuleFallbackRequired);
    }
    expect(sdk.create).not.toHaveBeenCalled();
    expect(agent.runWithAnyAgent).not.toHaveBeenCalled();
  });
});
