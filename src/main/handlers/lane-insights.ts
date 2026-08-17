/**
 * 레인 인사이트 IPC — 키워드 하나에 "문제해결 서브 3 + 제목 2종"을 만든다.
 *
 * 애드센스/네이버/홈판 레인 화면(2026-08-17 재편)의 행 단위 온디맨드 호출.
 *
 * v2 — 추론 체인(사장님 지시: "에이전트가 두뇌 역할"):
 *   ① 규칙+실측: 자동완성 확장(무료) → 검색광고 검색량 → 문제형 프레임 선별
 *   ② 서브가 3개 미만이면 **구독 CLI**(Claude Code→Codex→Gemini 순, 감지된 것)가
 *      파생을 제안하고, 제안은 반드시 **검색광고 실측(검색량>0)** 을 통과해야
 *      합류한다 — AI 가 제안하고 실측이 결재한다. 검증 못 하면 버린다.
 *   ③ CLI 도 검색광고 키도 없으면 ①의 결과 그대로 — 지어내지 않는다.
 */

import { ipcMain } from 'electron';
import { EnvironmentManager } from '../../utils/environment-manager';
import { getNaverAutocompleteKeywords, probeNaverAutocompleteSuggestions } from '../../utils/naver-autocomplete';
import { pickProblemSubKeywords } from '../../utils/title-forge/subkeyword-forge';
import { sharesToken } from '../../utils/title-forge/board-titles';
import { forgeTitles } from '../../utils/title-forge/forge';
import { detectAgent } from '../../utils/agent-cli/detect';
import { tryExtractJson } from '../../utils/agent-cli/parse';
import { runClaude } from '../../utils/agent-cli/claudeRunner';
import { runCodex } from '../../utils/agent-cli/codexRunner';
import { runGemini } from '../../utils/agent-cli/geminiRunner';
import type { AgentProvider } from '../../utils/agent-cli/types';

/** 검색량을 실측할 확장 상한 — 검색광고 쿼터를 아낀다(5개 묶음 3회). */
const VOLUME_SAMPLE_CAP = 15;
const AI_TIMEOUT_MS = 45_000;
const AI_PROPOSAL_CAP = 5;

interface SearchAdConfig {
  accessLicense: string;
  secretKey: string;
  customerId: string;
}

function buildSearchAdConfig(): SearchAdConfig | null {
  const env = EnvironmentManager.getInstance().getConfig();
  const accessLicense = env.naverSearchAdAccessLicense || '';
  const secretKey = env.naverSearchAdSecretKey || '';
  if (!accessLicense || !secretKey) return null;
  const customerId = (env.naverSearchAdCustomerId || '').trim()
    || accessLicense.split(':')[0] || accessLicense.substring(0, 10);
  return { accessLicense, secretKey, customerId };
}

/** 검색광고 검색량 실측. 실패는 빈 맵 — 못 잰 것을 0 으로 만들지 않는다. */
async function measureVolumes(searchAd: SearchAdConfig, keywords: string[]): Promise<Map<string, number>> {
  const volumes = new Map<string, number>();
  try {
    const { getNaverSearchAdKeywordVolume } = await import('../../utils/naver-searchad-api');
    for (let i = 0; i < keywords.length; i += 5) {
      const rows = await getNaverSearchAdKeywordVolume(searchAd, keywords.slice(i, i + 5));
      for (const row of rows) {
        const total = Number(row.pcSearchVolume || 0) + Number(row.mobileSearchVolume || 0);
        if (total > 0) volumes.set(String(row.keyword).replace(/\s+/g, ''), total);
      }
    }
  } catch (error) {
    console.error('[LANE-INSIGHTS] 검색량 실측 실패(검색량 없이 계속):', error);
  }
  return volumes;
}

/** 감지된 첫 구독 CLI. 없으면 null — 규칙 결과로만 간다. */
async function pickAvailableAgent(): Promise<AgentProvider | null> {
  for (const provider of ['claude', 'codex', 'gemini'] as const) {
    try {
      const status = await detectAgent(provider);
      if (status.available) return provider;
    } catch { /* 감지 실패는 미설치와 같게 다룬다 */ }
  }
  return null;
}

/**
 * 구독 CLI 에 문제해결형 파생을 제안받는다. 반환은 **미검증 후보**다 —
 * 호출자가 반드시 검색량 실존 검증을 통과시켜야 화면에 나갈 수 있다.
 */
async function proposeAiSubKeywords(
  provider: AgentProvider,
  mainKeyword: string,
  knownKeywords: ReadonlySet<string>,
): Promise<string[]> {
  /*
   * 첫 실측(2026-08-17, '민증사진 규칙')의 교훈: "자연스러운 검색어"라고만 하면
   * "안 지키면 반려되나요" 같은 질문 문장을 낸다 — 전부 검색량 0으로 전량 탈락.
   * 사람들이 검색창에 치는 건 짧은 명사구다("민증사진 안경"). 형태를 못 박는다.
   */
  const prompt = [
    '너는 네이버 검색어 데이터 전문가다.',
    `검색 키워드 "${mainKeyword}" 에 대해, 사람들이 실제로 네이버 검색창에 치는 **문제해결형 파생 검색어** ${AI_PROPOSAL_CAP}개를 제안하라.`,
    '',
    '지켜라:',
    `- "${mainKeyword}" 의 핵심 명사를 포함`,
    '- 검색창에 치는 짧은 명사구 형태: 2~4어절, 공백 제외 15자 이내. 질문 문장·조사 금지',
    '- 문제/실수/원인/해결/안됨/비교 각도만 (추천·후기·일반 정보형 금지)',
    '- 예시 형태: "여권사진 안경", "여권사진 반려 사유" (이 키워드가 아니라 형태만 참고)',
    '- JSON 문자열 배열로만 출력: ["검색어1", "검색어2", ...]',
  ].join('\n');

  const runner = provider === 'claude' ? runClaude : provider === 'codex' ? runCodex : runGemini;
  const reply = await runner(prompt, { timeoutMs: AI_TIMEOUT_MS });
  const parsed = tryExtractJson(reply);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length >= 4 && item.replace(/\s+/g, '').length <= 15 && item !== mainKeyword)
    .filter((item) => sharesToken(item, mainKeyword))
    .filter((item) => !knownKeywords.has(item))
    .slice(0, AI_PROPOSAL_CAP);
}

export function setupLaneInsightsHandlers(): void {
  ipcMain.handle('forge-lane-insights', async (_event, payload: { keyword?: string } | string) => {
    const keyword = String(typeof payload === 'string' ? payload : payload?.keyword || '').trim();
    if (!keyword) {
      return { success: false, error: '키워드가 비어 있습니다.' };
    }

    try {
      const env = EnvironmentManager.getInstance().getConfig();
      const openApi = { clientId: env.naverClientId || '', clientSecret: env.naverClientSecret || '' };
      const searchAd = buildSearchAdConfig();

      // ── ① 규칙+실측: 자동완성 확장 → 검색량 → 프레임 선별 ─────────────
      let expansions: string[] = [];
      try {
        expansions = await getNaverAutocompleteKeywords(keyword, openApi as never);
      } catch (error) {
        console.error('[LANE-INSIGHTS] 자동완성 확장 실패:', error);
      }
      const candidates = [...new Set(expansions)]
        .filter((k) => k && k !== keyword)
        .slice(0, 40);

      const volumes = searchAd
        ? await measureVolumes(searchAd, candidates.slice(0, VOLUME_SAMPLE_CAP))
        : new Map<string, number>();

      const derived = candidates.map((k) => ({
        keyword: k,
        searchVolume: volumes.get(k.replace(/\s+/g, '')) ?? null,
        source: 'autocomplete',
      }));

      let subs = pickProblemSubKeywords(keyword, derived);

      // ── ② 두뇌 개입: 서브가 모자라면 구독 CLI 제안 → 실측 결재 ────────
      const ai = { used: false, provider: '' as string, proposed: 0, verified: 0 };
      if (subs.length < 3 && searchAd) {
        const provider = await pickAvailableAgent();
        if (provider) {
          try {
            const known = new Set(candidates);
            const proposals = await proposeAiSubKeywords(provider, keyword, known);
            ai.used = true;
            ai.provider = provider;
            ai.proposed = proposals.length;
            if (proposals.length > 0) {
              /*
               * AI 제안은 실존 증명을 통과해야만 합류한다 — 지어낸 검색어가
               * 화면에 나가는 순간 이 도구의 신뢰가 무너진다. 2단 검증:
               *   1차: 검색광고 검색량 > 0 (강한 증거 + 수치 획득)
               *   2차: 검색량이 "<10"(0 으로 뭉개짐)인 롱테일은 자동완성
               *        프로브(무료)로 — 네이버가 그 문구를 제안하면 실사용
               *        검색이다. 첫 실측('민증사진 규칙')에서 1차만 쓰니
               *        실존 롱테일까지 전량 탈락하는 것을 확인하고 추가했다.
               */
              const aiVolumes = await measureVolumes(searchAd, proposals);
              const verified: Array<{ keyword: string; searchVolume: number | null; source: string }> = [];
              for (const k of proposals) {
                const volume = aiVolumes.get(k.replace(/\s+/g, '')) || 0;
                if (volume > 0) {
                  verified.push({ keyword: k, searchVolume: volume, source: 'ai-verified' });
                  continue;
                }
                try {
                  const probe = await probeNaverAutocompleteSuggestions(k);
                  const compact = k.replace(/\s+/g, '').toLowerCase();
                  const echoed = probe.ok && probe.suggestions.some(
                    (s) => s.replace(/\s+/g, '').toLowerCase().includes(compact),
                  );
                  if (echoed) {
                    verified.push({ keyword: k, searchVolume: null, source: 'ai-verified' });
                  }
                } catch { /* 프로브 실패 = 미검증 = 탈락 */ }
              }
              ai.verified = verified.length;
              if (verified.length > 0) {
                subs = pickProblemSubKeywords(keyword, [...derived, ...verified]);
              }
            }
          } catch (error) {
            console.error('[LANE-INSIGHTS] AI 제안 실패(규칙 결과로 계속):', error);
          }
        }
      }

      // ── ③ 제목 ───────────────────────────────────────────────────────
      const titles = forgeTitles({
        keyword,
        derivedKeywords: derived,
        // 데스크톱 온디맨드 경로에는 SERP 실측이 없다 — 빈 배열이면 프레임 분석이
        // "빈 프레임" 판단을 못 하므로 지원 프레임 중 근거 강한 것을 쓴다(가드 유지).
        serpTitles: [],
      });

      return {
        success: true,
        keyword,
        subs,
        titles,
        expansionCount: candidates.length,
        volumesMeasured: volumes.size,
        ai,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[LANE-INSIGHTS] 실패:', message);
      return { success: false, error: message };
    }
  });
}
