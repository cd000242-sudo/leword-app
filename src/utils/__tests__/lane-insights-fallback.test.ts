import { expect, it, vi } from 'vitest';

const runners = vi.hoisted(() => ({ claude: vi.fn(), codex: vi.fn(), gemini: vi.fn(), grok: vi.fn() }));
vi.mock('../agent-cli/claudeRunner', () => ({ runClaude: runners.claude }));
vi.mock('../agent-cli/codexRunner', () => ({ runCodex: runners.codex }));
vi.mock('../agent-cli/geminiRunner', () => ({ runGemini: runners.gemini }));
vi.mock('../agent-cli/grokRunner', () => ({ runGrok: runners.grok }));
vi.mock('../agent-cli/usageLedger', () => ({ recordAgentRun: vi.fn() }));
vi.mock('../environment-manager', () => ({ EnvironmentManager: { getInstance: () => ({ getConfig: () => ({ naverSearchAdAccessLicense: 'fixture', naverSearchAdSecretKey: 'fixture' }) }) } }));
vi.mock('../naver-autocomplete', () => ({ getNaverAutocompleteKeywords: async () => [], probeNaverAutocompleteSuggestions: async () => ({ ok: false, suggestions: [] }) }));
vi.mock('../naver-searchad-api', () => ({ getNaverSearchAdKeywordVolume: async (_cfg: unknown, keywords: string[]) => keywords.map((keyword) => ({ keyword, pcSearchVolume: 100, mobileSearchVolume: 100 })) }));

import { forgeLaneInsights } from '../../main/lane-insights-service';

it('키워드 인사이트의 최초 생성기가 실패해도 Gemini의 검증된 제안을 반영한다', async () => {
  runners.claude.mockRejectedValue(new Error('weekly limit'));
  runners.codex.mockRejectedValue(new Error('rate_limited'));
  runners.gemini.mockResolvedValue('["여권사진 반려 사유"]');
  const result = await forgeLaneInsights('여권사진');
  expect(result.ai).toEqual({ used: true, provider: 'gemini', proposed: 1, verified: 1 });
  expect(runners.gemini).toHaveBeenCalledOnce();
  expect(runners.grok).not.toHaveBeenCalled();
});
