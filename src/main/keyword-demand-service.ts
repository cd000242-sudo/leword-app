/**
 * 키워드 수요 분석 — "왜 이걸 많이 검색하나"와 "무엇을 이어서 검색하나".
 *
 * 사장님 지시(2026-08-18): "하드코딩된 거 쓰지 말고 클로드코드로 추론 및
 * 분석시켜… 확장키워드나 이 키워드가 왜 검색을 많이 하는지 분석해서 보여주게".
 *
 * 두 가지를 지킨다:
 *   1. **재료는 실측이다.** 자동완성·검색광고 검색량은 우리가 잰 값이고,
 *      AI 는 그걸 읽고 묶고 설명할 뿐이다. AI 가 새로 낸 검색어는 실존 결재를
 *      통과해야만 화면에 나간다(검색량>0 또는 자동완성 되울림).
 *   2. **근거 없는 설명은 버린다.** 이 질문은 AI 가 가장 그럴듯하게 지어내기
 *      쉬운 종류라, 실측 신호를 짚지 못한 문장은 통째로 뺀다.
 *      판정은 keyword-demand-analysis 가 한다.
 *
 * 엔진은 사용자 **본인 구독**(클로드코드 → 코덱스 → 제미나이)이다. 하나도
 * 없으면 규칙 결과만 돌려주고, 화면이 설치 안내를 띄운다.
 */

import { EnvironmentManager } from '../utils/environment-manager';
import { getNaverAutocompleteKeywords, probeNaverAutocompleteSuggestions } from '../utils/naver-autocomplete';
import { getNaverSearchAdKeywordVolume } from '../utils/naver-searchad-api';
import { runClaude } from '../utils/agent-cli/claudeRunner';
import { runCodex } from '../utils/agent-cli/codexRunner';
import { runGemini } from '../utils/agent-cli/geminiRunner';
import { runWithAnyAgent } from '../utils/agent-cli/runAny';
import { detectAgent } from '../utils/agent-cli/detect';
import { tryExtractJson } from '../utils/agent-cli/parse';
import {
  buildDemandEvidence,
  groundDemandReasons,
  type DemandReason,
} from '../utils/keyword-demand-analysis';

const AI_TIMEOUT_MS = 60_000;
const VOLUME_SAMPLE_CAP = 15;
const AI_EXPANSION_CAP = 6;

export interface DemandExpansion {
  keyword: string;
  searchVolume: number | null;
  /** 'autocomplete' = 네이버가 준 것, 'ai-verified' = AI 제안 중 실존 확인된 것 */
  source: 'autocomplete' | 'ai-verified';
}

export interface KeywordDemandResult {
  success: true;
  keyword: string;
  reasons: DemandReason[];
  expansions: DemandExpansion[];
  signals: string[];
  agent: { available: boolean; provider: string; proposed: number; verified: number; error?: string };
}

function buildSearchAdConfig() {
  const env = EnvironmentManager.getInstance().getConfig();
  const accessLicense = env.naverSearchAdAccessLicense || '';
  const secretKey = env.naverSearchAdSecretKey || '';
  if (!accessLicense || !secretKey) return null;
  const customerId = (env.naverSearchAdCustomerId || '').trim()
    || accessLicense.split(':')[0] || accessLicense.substring(0, 10);
  return { accessLicense, secretKey, customerId };
}

async function measureVolumes(
  searchAd: ReturnType<typeof buildSearchAdConfig>,
  keywords: string[],
): Promise<Map<string, number>> {
  const volumes = new Map<string, number>();
  if (!searchAd || keywords.length === 0) return volumes;
  try {
    for (let i = 0; i < keywords.length; i += 5) {
      const rows = await getNaverSearchAdKeywordVolume(searchAd as never, keywords.slice(i, i + 5));
      for (const row of rows) {
        const total = Number(row.pcSearchVolume || 0) + Number(row.mobileSearchVolume || 0);
        if (total > 0) volumes.set(String(row.keyword).replace(/\s+/g, ''), total);
      }
    }
  } catch (error) {
    console.error('[DEMAND] 검색량 실측 실패(없이 계속):', error);
  }
  return volumes;
}

/** 감지된 첫 구독 CLI. 없으면 null — 규칙 결과만 돌려준다. */
async function pickAgent(): Promise<'claude' | 'codex' | 'gemini' | null> {
  for (const provider of ['claude', 'codex', 'gemini'] as const) {
    try {
      const status = await detectAgent(provider);
      if (status.available) return provider;
    } catch { /* 감지 실패는 미설치와 같게 다룬다 */ }
  }
  return null;
}

function buildPrompt(keyword: string, expansions: string[], volumeLines: string[]): string {
  return [
    '너는 네이버 검색 데이터 분석가다. 아래는 우리가 **실제로 측정한** 값이다.',
    '',
    `키워드: ${keyword}`,
    expansions.length ? `사람들이 이어서 치는 검색어(자동완성 실측): ${expansions.join(', ')}` : '자동완성: (없음)',
    volumeLines.length ? `측정된 월 검색량: ${volumeLines.join(', ')}` : '검색량: (측정 못 함)',
    '',
    '두 가지를 답하라.',
    '',
    '1) reasons — 사람들이 이 키워드를 검색하는 이유 2~4개.',
    '   위에 준 실측 값에서 읽어낼 수 있는 것만 써라. 각 이유마다 어떤 값에서',
    '   읽었는지 basis 에 적어라("자동완성" 또는 "검색량").',
    '   금지: "관심이 높아지고 있다", "많은 사람이 궁금해한다" 같은 아무 키워드에나',
    '   붙는 문장. 측정하지 않은 것(연령대·성별·계절성·매출)을 근거로 대는 것.',
    '   좋은 이유는 자동완성에 무엇이 몰려 있는지를 짚는다.',
    '',
    `2) expansions — 위 목록에 없지만 사람들이 실제로 칠 법한 검색어 ${AI_EXPANSION_CAP}개.`,
    '   검색창에 치는 짧은 명사구(2~4어절, 공백 제외 15자 이내). 질문 문장 금지.',
    '   우리가 실존 여부를 따로 확인하니 지어내면 전부 탈락한다.',
    '',
    'JSON 만 출력한다:',
    '{"reasons":[{"text":"...","basis":"자동완성"}],"expansions":["...","..."]}',
  ].join('\n');
}

export async function analyzeKeywordDemand(rawKeyword: string): Promise<KeywordDemandResult> {
  const keyword = String(rawKeyword || '').trim();
  if (!keyword) throw new Error('키워드가 비어 있습니다.');

  const env = EnvironmentManager.getInstance().getConfig();
  const openApi = { clientId: env.naverClientId || '', clientSecret: env.naverClientSecret || '' };
  const searchAd = buildSearchAdConfig();

  // ── ① 실측: 자동완성 → 검색량 ─────────────────────────────────────
  let rawExpansions: string[] = [];
  try {
    rawExpansions = await getNaverAutocompleteKeywords(keyword, openApi as never);
  } catch (error) {
    console.error('[DEMAND] 자동완성 실패:', error);
  }
  const candidates = [...new Set(rawExpansions)].filter((k) => k && k !== keyword).slice(0, 30);
  const volumes = await measureVolumes(searchAd, candidates.slice(0, VOLUME_SAMPLE_CAP));

  const expansions: DemandExpansion[] = candidates.map((k) => ({
    keyword: k,
    searchVolume: volumes.get(k.replace(/\s+/g, '')) ?? null,
    source: 'autocomplete',
  }));

  // ── ② 두뇌: 본인 구독으로 묶고 설명하고 더 찾는다 ─────────────────
  const agent = { available: false, provider: '', proposed: 0, verified: 0, error: undefined as string | undefined };
  let reasons: DemandReason[] = [];

  const provider = await pickAgent();
  if (!provider) {
    agent.error = 'no_agent';
  } else {
    agent.available = true;
    const chain = provider === 'claude'
      ? [{ provider: 'claude' as const, run: runClaude }, { provider: 'codex' as const, run: runCodex }]
      : provider === 'codex'
        ? [{ provider: 'codex' as const, run: runCodex }, { provider: 'gemini' as const, run: runGemini }]
        : [{ provider: 'gemini' as const, run: runGemini }];
    try {
      const volumeLines = [...volumes.entries()].slice(0, 8).map(([k, v]) => `${k} ${v}`);
      const run = await runWithAnyAgent(
        buildPrompt(keyword, candidates.slice(0, 15), volumeLines),
        chain,
        { timeoutMs: AI_TIMEOUT_MS },
      );
      agent.provider = run.provider;
      const parsed = tryExtractJson(run.reply) as { reasons?: DemandReason[]; expansions?: string[] } | null;

      // 확장어 — 실존 결재를 통과한 것만 합류시킨다.
      const proposals = (parsed?.expansions || [])
        .filter((k): k is string => typeof k === 'string')
        .map((k) => k.trim())
        .filter((k) => k.length >= 4 && k.replace(/\s+/g, '').length <= 15 && k !== keyword)
        .filter((k) => !candidates.includes(k))
        .slice(0, AI_EXPANSION_CAP);
      agent.proposed = proposals.length;

      if (proposals.length > 0) {
        const aiVolumes = await measureVolumes(searchAd, proposals);
        // AI 제안분의 실측 검색량도 근거가 된다 — 우리가 직접 잰 값이다.
        for (const [k, v] of aiVolumes) volumes.set(k, v);
        for (const k of proposals) {
          const volume = aiVolumes.get(k.replace(/\s+/g, '')) || 0;
          if (volume > 0) {
            expansions.push({ keyword: k, searchVolume: volume, source: 'ai-verified' });
            continue;
          }
          try {
            const probe = await probeNaverAutocompleteSuggestions(k);
            const compact = k.replace(/\s+/g, '').toLowerCase();
            const echoed = probe.ok && probe.suggestions.some(
              (s) => s.replace(/\s+/g, '').toLowerCase().includes(compact),
            );
            if (echoed) expansions.push({ keyword: k, searchVolume: null, source: 'ai-verified' });
          } catch { /* 프로브 실패 = 미검증 = 탈락 */ }
        }
        agent.verified = expansions.filter((e) => e.source === 'ai-verified').length;
      }

      /*
       * 설명 판정은 **검증이 끝난 뒤**에 한다. 자동완성이 0개여도 AI 제안이
       * 실측 검색량으로 확인되면 그것이 근거다 — 먼저 판정하면 정작 우리가 잰
       * 값을 못 본 채로 전부 버리게 된다('민증사진 규칙' 실측에서 겪었다).
       */
      const evidence = buildDemandEvidence({
        keyword,
        expansions: expansions.map((e) => e.keyword),
        volumes,
        serpSections: [],
      });
      reasons = groundDemandReasons(parsed?.reasons || [], evidence);
    } catch (error) {
      agent.error = error instanceof Error ? error.message : String(error);
      console.error('[DEMAND] AI 분석 실패(실측 결과로 계속):', error);
    }
  }

  // 화면에 적을 근거 목록도 검증 뒤 상태로 센다 — 위 판정과 같은 기준이어야 한다.
  const evidence = buildDemandEvidence({
    keyword,
    expansions: expansions.map((e) => e.keyword),
    volumes,
    serpSections: [],
  });
  return {
    success: true,
    keyword,
    reasons,
    // 잰 검색량이 큰 것부터. 못 잰 것은 뒤로 — 순서가 곧 확신의 순서다.
    expansions: expansions.sort((a, b) => (b.searchVolume ?? -1) - (a.searchVolume ?? -1)).slice(0, 20),
    signals: evidence.signals,
    agent,
  };
}
