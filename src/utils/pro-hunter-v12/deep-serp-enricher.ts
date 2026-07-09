// PRO Hunter v12 — 상위 후보 실측 SERP 심층패스 오케스트레이터 (C2 phase 2b)
//
// [설계] 대량 발굴 경로는 puppeteer(키워드당 ~2.5s)를 감당 못 하므로 SERP 실측을 하지 않는다(phase 1).
// 대신 최종 랭킹의 '상위 N개 골든 후보'에만 analyzeSmartBlocks(puppeteer 실측)를 돌려 진짜 SERP 블록
// 난이도를 주입한다. 경쟁사(블랙키위 등)가 안 하는 개인화 승산 차별화의 핵심.
//
// - opt-in: 명시적으로 호출할 때만 puppeteer 를 쓴다(기본 발굴 경로 무영향).
// - graceful-degrade: 브라우저/네트워크 실패 시 키워드별 중립 신호로 폴백(발굴 전체를 막지 않음).
// - analyzer 주입: analyzeSmartBlocks 를 기본으로 쓰되, 테스트는 mock analyzer 를 주입해 순수 검증.
//
// 실측 정확도(analyzeSmartBlocks 가 현대 네이버 블록을 잘 뽑는지)는 런타임 검증 대상이며,
// 이 파일은 오케스트레이션(상위N 제한·동시성·폴백·주입)과 적용 로직만 결정론적으로 고정한다.

import { analyzeSmartBlocks, type SmartBlockAnalysis } from './smartblock-parser';
import {
  adaptSmartBlockAnalysis,
  neutralSerpDifficultySignal,
  type SerpDifficultySignal,
} from './serp-difficulty-adapter';

export type SmartBlockAnalyzer = (keyword: string) => Promise<SmartBlockAnalysis>;

export interface DeepSerpOptions {
  /** 상위 몇 개만 심층분석할지 (기본 10, 상한 30 — puppeteer 비용 보호). */
  topN?: number;
  /** 동시 puppeteer 수 (기본 2, 상한 4 — 네이버 차단 회피). */
  concurrency?: number;
  /** 분석기 주입(테스트/대체용). 기본 analyzeSmartBlocks(puppeteer). */
  analyzer?: SmartBlockAnalyzer;
  /** 진행 콜백. */
  onProgress?: (done: number, total: number, keyword: string) => void;
}

/** puppeteer 비용 상한 — 아무리 요청해도 이 이상은 심층분석하지 않는다. */
export const DEEP_SERP_MAX_TOP_N = 30;

/**
 * 상위 후보 키워드들에 실측 SERP 난이도 신호를 주입한다.
 * 반환: keyword → SerpDifficultySignal (실패 키워드는 measured:false 중립 폴백).
 */
export async function enrichKeywordsWithDeepSerp(
  keywords: string[],
  options: DeepSerpOptions = {},
): Promise<Map<string, SerpDifficultySignal>> {
  const analyzer = options.analyzer ?? analyzeSmartBlocks;
  const topN = Math.max(0, Math.min(DEEP_SERP_MAX_TOP_N, Math.floor(options.topN ?? 10)));
  const concurrency = Math.max(1, Math.min(4, Math.floor(options.concurrency ?? 2)));

  // 중복 제거 후 상위 topN 만 대상(입력 순서 = 랭킹 순서 가정).
  const targets: string[] = [];
  const seen = new Set<string>();
  for (const kw of keywords) {
    const k = String(kw || '').trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    targets.push(k);
    if (targets.length >= topN) break;
  }

  const out = new Map<string, SerpDifficultySignal>();
  if (targets.length === 0) return out;

  let cursor = 0;
  let done = 0;
  const worker = async (): Promise<void> => {
    while (cursor < targets.length) {
      const kw = targets[cursor++];
      try {
        const analysis = await analyzer(kw);
        out.set(kw, adaptSmartBlockAnalysis(analysis));
      } catch (err) {
        console.warn(`[DEEP-SERP] "${kw}" 심층분석 실패 → 중립 폴백:`, (err as Error)?.message || err);
        out.set(kw, neutralSerpDifficultySignal());
      } finally {
        done++;
        options.onProgress?.(done, targets.length, kw);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, targets.length) }, () => worker()),
  );
  return out;
}

export interface SerpAdjustedResult<T> {
  result: T;
  serp: SerpDifficultySignal;
  /** 실측 SERP 난이도 반영 경쟁도(0~100). measured=false 면 base 를 그대로 계승. */
  serpAdjustedCompetition: number;
  /** 블로거가 실제로 상위 노출 가능한 SERP인가(블로그 친화 + 쇼핑 비지배 + 난이도 ≤ 7). */
  winnable: boolean;
}

/**
 * 실측 SERP 신호를 개별 결과의 경쟁도에 반영한다(순수 함수).
 * - measured=false(미측정/폴백): base 경쟁도 유지, winnable 은 판단 보류(true 로 두지 않음 → 편향 방지).
 * - measured=true: 난이도(0~10)×4 감점 + 비침투 지배(쇼핑>인플루언서>진입장벽) 추가 감점.
 */
export function applySerpDifficulty<T>(
  result: T,
  serp: SerpDifficultySignal,
  baseCompetition: number,
): SerpAdjustedResult<T> {
  if (!serp.measured) {
    return { result, serp, serpAdjustedCompetition: baseCompetition, winnable: false };
  }
  const serpPenalty = serp.difficultyScore * 4; // 0~40
  const barrierPenalty = serp.shoppingDominant ? 25 : serp.hasInfluencer ? 15 : serp.hasSmartBlock ? 10 : 0;
  const serpAdjustedCompetition = Math.max(0, Math.min(100, baseCompetition - serpPenalty - barrierPenalty));
  const winnable = serp.blogFriendly && !serp.shoppingDominant && serp.difficultyScore <= 7;
  return { result, serp, serpAdjustedCompetition, winnable };
}
