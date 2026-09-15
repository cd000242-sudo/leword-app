import { createDefaultAgentChain } from '../utils/agent-cli/defaultChain';
import { runWithAnyAgent } from '../utils/agent-cli/runAny';

export interface RadarAnalysisInput { url: string; keys: Record<string, string>; provider?: string }
const MEASUREMENT_KEYS = ['openApiId', 'openApiSecret', 'searchAdLicense', 'searchAdSecret', 'searchAdCustomer', 'apihubKeyId', 'apihubKey'];
export function radarMeasurementKeys(raw: unknown): Record<string, string> {
  const values = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return Object.fromEntries(MEASUREMENT_KEYS.filter(key => typeof values[key] === 'string')
    .map(key => [key, String(values[key]).slice(0, 2000)]));
}

/** The worker owns the evidence/prompt/parser; only inference runs on the user's subscription. */
export async function analyzeRadarViaAgent(input: RadarAnalysisInput): Promise<Record<string, unknown>> {
  const keys = radarMeasurementKeys(input.keys);
  const post = async (payload: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await fetch('https://leword-keyword-api.leword.workers.dev/', {
      method: 'POST', headers: { 'content-type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`레이더 서버 응답 오류 (${response.status})`);
    return await response.json() as Record<string, unknown>;
  };
  const prepared = await post({ action: 'radar-analyze', aiVia: 'app', url: input.url, keys });
  if (!prepared.ok || typeof prepared.prompt !== 'string' || !prepared.prompt.trim()) {
    return { error: String(prepared.message || '글 분석 근거를 받지 못했습니다. 서버 업데이트를 확인해 주세요.') };
  }
  const run = await runWithAnyAgent(prepared.prompt, createDefaultAgentChain({ preferredProvider: input.provider }), { timeoutMs: 180_000 });
  const parsed = await post({ action: 'radar-analyze-parse', aiText: run.reply, page: prepared.page, url: prepared.url, keys });
  return parsed.ok && parsed.analysis
    ? { analysis: parsed.analysis, provider: run.provider }
    : { error: String(parsed.message || 'AI 응답을 정형하지 못했습니다.'), provider: run.provider };
}
