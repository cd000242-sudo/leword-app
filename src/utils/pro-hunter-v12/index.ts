// PRO Hunter v12 — 오케스트레이터
// 작성: 2026-04-15

import { fetchSerpTop10 } from './serp-content-fetcher';
import { analyzeSerp, detectGaps } from './serp-content-analyzer';
import { generateBlueprint, type KeywordBlueprint } from './outline-generator';
import { predictWin, type WinPrediction } from './win-predictor';
import { loadProfile, profileToCapability } from './user-profile';
import { addTrackedKeyword } from './tracking-store';
import type { FetchedPost } from './serp-content-fetcher';
import type { SerpAnalysis, GapAnalysis } from './serp-content-analyzer';

export interface BlueprintResult {
  blueprint: KeywordBlueprint;
  analysis: SerpAnalysis;
  gaps: GapAnalysis;
  posts: FetchedPost[];
  prediction: WinPrediction;
  durationMs: number;
}

// 단순 메모리 캐시 (10분 TTL)
const cache = new Map<string, { ts: number; result: BlueprintResult }>();
const CACHE_TTL = 10 * 60 * 1000;

export async function generateKeywordBlueprint(
  keyword: string,
  options: { force?: boolean; searchVolume?: number | null } = {}
): Promise<BlueprintResult> {
  const cached = cache.get(keyword);
  if (!options.force && cached && Date.now() - cached.ts < CACHE_TTL) {
    console.log(`[V12] 캐시 적중: "${keyword}"`);
    return cached.result;
  }

  const startedAt = Date.now();
  console.log(`[V12] 청사진 생성 시작: "${keyword}"`);

  // 1. SERP top 10 수집
  const posts = await fetchSerpTop10(keyword, { limit: 10, concurrent: 3 });
  console.log(`[V12] SERP 수집 완료: ${posts.length}개 (본문 평균 ${Math.round(posts.reduce((s, p) => s + p.wordCount, 0) / Math.max(1, posts.length))}단어)`);

  // 2. 분석
  const analysis = analyzeSerp(posts);
  const gaps = detectGaps(analysis, posts);

  // 3. LLM 청사진
  const blueprint = await generateBlueprint(keyword, analysis, gaps);

  // 4. Win prediction (사용자 프로파일 기반)
  const profile = loadProfile();
  const capability = profileToCapability(profile);
  const prediction = predictWin(analysis, posts, capability, options.searchVolume ?? null);

  // 5. 자동으로 추적 등록 (Phase E lifecycle)
  try {
    addTrackedKeyword(keyword, posts.length, options.searchVolume ?? null);
  } catch (err) {
    console.warn('[V12] 추적 등록 실패:', (err as Error).message);
  }

  const durationMs = Date.now() - startedAt;
  console.log(`[V12] 완료: ${durationMs}ms (source=${blueprint.source}, predicted ${prediction.rankRange})`);

  const result: BlueprintResult = { blueprint, analysis, gaps, posts, prediction, durationMs };
  cache.set(keyword, { ts: Date.now(), result });
  return result;
}

export function clearBlueprintCache(): void {
  cache.clear();
}
