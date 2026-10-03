import * as path from 'path';
import { atomicBoardWrite, readBoardFile } from './board-cache';
import type { AgentProviderName } from '../utils/agent-cli/runAny';

export const BRIEF_PROVIDERS = ['claude', 'codex', 'gemini', 'grok'] as const;
export function isBriefProvider(value: unknown): value is AgentProviderName {
  return typeof value === 'string' && (BRIEF_PROVIDERS as readonly string[]).includes(value);
}
const fileOf = (userData: string) => path.join(userData, 'topic-briefs', 'engine.json');
export function readBriefProvider(userData: string): AgentProviderName | undefined {
  const saved = readBoardFile(fileOf(userData)) as { provider?: unknown } | null;
  return isBriefProvider(saved?.provider) ? saved.provider : undefined;
}
export function saveBriefProvider(userData: string, provider: unknown): { provider: AgentProviderName } {
  if (!isBriefProvider(provider)) throw new Error('지원하지 않는 생성 엔진입니다.');
  const preference = { provider };
  atomicBoardWrite(fileOf(userData), preference);
  return preference;
}
