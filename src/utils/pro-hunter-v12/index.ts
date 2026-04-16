// PRO Hunter v12 — 오케스트레이터
// 작성: 2026-04-15

import { fetchSerpTop10 } from './serp-content-fetcher';
import { analyzeSerp, detectGaps } from './serp-content-analyzer';
import { generateBlueprint, type KeywordBlueprint } from './outline-generator';
import { predictWin, type WinPrediction } from './win-predictor';
import { loadProfile, profileToCapability } from './user-profile';
import { addTrackedKeyword } from './tracking-store';
import { analyzeSeasonality, type SeasonalityProfile } from './seasonality-analyzer';
import { analyzeSmartBlocks, type SmartBlockAnalysis } from './smartblock-parser';
import { fetchGoogleTop10, type GoogleSerpAnalysis } from './google-serp';
import { recordSerp, getCompetitorInsight, type CompetitorInsight } from './authority-db';
import { calibrateVolume } from './volume-calibrator';
import { EnvironmentManager } from '../environment-manager';
import type { FetchedPost } from './serp-content-fetcher';
import type { SerpAnalysis, GapAnalysis } from './serp-content-analyzer';

export interface BlueprintResult {
  blueprint: KeywordBlueprint;
  analysis: SerpAnalysis;
  gaps: GapAnalysis;
  posts: FetchedPost[];
  prediction: WinPrediction;
  seasonality: SeasonalityProfile;
  smartBlocks: SmartBlockAnalysis | null;
  googleSerp: GoogleSerpAnalysis | null;
  competitorInsight: CompetitorInsight;
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

  // 0. 검색량 fetch (P0 #1: searchVolume 배선)
  // 네이버 검색광고 API는 공백 포함 롱테일에 0 반환하는 경우가 많아
  // 원본 → 공백 제거 → 각 단어 최대 순으로 fallback
  let searchVolume: number | null = options.searchVolume ?? null;
  if (searchVolume == null) {
    const env = EnvironmentManager.getInstance().getConfig();
    if (env.naverSearchAdAccessLicense && env.naverSearchAdSecretKey && env.naverSearchAdCustomerId) {
      try {
        const { getNaverSearchAdKeywordVolume } = await import('../naver-searchad-api');
        const config = {
          accessLicense: env.naverSearchAdAccessLicense,
          secretKey: env.naverSearchAdSecretKey,
          customerId: env.naverSearchAdCustomerId,
        };

        // 질의 변형: 원본 → 공백제거 → 단어별
        const variants = [keyword];
        const noSpace = keyword.replace(/\s+/g, '');
        if (noSpace !== keyword) variants.push(noSpace);
        const words = keyword.split(/\s+/).filter((w) => w.length >= 2);
        for (const w of words) if (!variants.includes(w)) variants.push(w);

        // 모든 변형의 볼륨 수집 (min/geomean 계산용)
        const allVolumes: number[] = [];
        for (const variant of variants.slice(0, 5)) {
          try {
            const volumes = await getNaverSearchAdKeywordVolume(config, [variant]);
            if (Array.isArray(volumes) && volumes.length > 0) {
              const item = volumes[0] as any;
              const total =
                Number(item.totalSearchVolume) ||
                Number(item.pcSearchVolume || 0) + Number(item.mobileSearchVolume || 0) ||
                Number(item.monthlyPcQcCnt || 0) + Number(item.monthlyMobileQcCnt || 0);
              if (total > 0) {
                allVolumes.push(total);
                console.log(`[V12] 변형 "${variant}" raw=${total}`);
              }
            }
          } catch {}
        }

        if (allVolumes.length > 0) {
          // Sprint #1 #2: geomean 선택 (max 대신) + 단어수별 penalty
          const geomean = Math.round(Math.exp(allVolumes.reduce((s, v) => s + Math.log(v), 0) / allVolumes.length));
          const minVol = Math.min(...allVolumes);
          // 보수적 추정: geomean과 min 중 작은 쪽의 60% + 큰 쪽의 40%
          const conservative = Math.round(minVol * 0.6 + geomean * 0.4);
          // 단어수별 penalty
          const wordCount = words.length;
          const penaltyTable: Record<number, number> = { 1: 0.85, 2: 0.4, 3: 0.2, 4: 0.12, 5: 0.08 };
          const penalty = penaltyTable[Math.min(5, wordCount)] || 0.08;
          const adjusted = Math.round(conservative * penalty);
          searchVolume = calibrateVolume(adjusted, keyword);
          console.log(`[V12] ✅ 검색량 최종: "${keyword}" geomean=${geomean} min=${minVol} conservative=${conservative} words=${wordCount} penalty=${penalty} calibrated=${searchVolume}`);
        } else {
          console.warn(`[V12] 검색량 수집 실패 — 모든 변형 0 반환`);
        }
      } catch (err) {
        console.error('[V12] 검색량 수집 예외:', (err as Error).message);
      }
    }
  }

  // 1. SERP top 10 수집
  const posts = await fetchSerpTop10(keyword, { limit: 10, concurrent: 3 });
  console.log(`[V12] SERP 수집 완료: ${posts.length}개 (본문 평균 ${Math.round(posts.reduce((s, p) => s + p.wordCount, 0) / Math.max(1, posts.length))}단어)`);

  // Authority DB 자동 기록 (Tier 2 #3)
  try {
    const profile = loadProfile();
    recordSerp(keyword, posts, profile?.category);
  } catch (err) {
    console.warn('[V12] Authority DB 기록 실패:', (err as Error).message);
  }

  // 2. 분석
  const analysis = analyzeSerp(posts);
  const gaps = detectGaps(analysis, posts);

  // 3. 시즌성 + 스마트블록 + 구글 SERP 분석 (병렬)
  const [seasonality, smartBlocks, googleSerp] = await Promise.all([
    analyzeSeasonality(keyword),
    analyzeSmartBlocks(keyword).catch((err) => {
      console.warn('[V12] 스마트블록 분석 실패:', (err as Error).message);
      return null;
    }),
    fetchGoogleTop10(keyword).catch((err) => {
      console.warn('[V12] 구글 SERP 분석 실패:', (err as Error).message);
      return null;
    }),
  ]);

  // 4. LLM 청사진 (Tier 1: 스마트블록 + 시즌성 반영)
  const blueprint = await generateBlueprint(keyword, analysis, gaps, smartBlocks, seasonality);

  // 5. Win prediction (사용자 프로파일 + 실측 검색량 + 스마트블록 점수)
  const profile = loadProfile();
  const capability = profileToCapability(profile);
  const prediction = predictWin(analysis, posts, capability, searchVolume, smartBlocks?.bloggerOpportunityScore);

  // 6. 자동으로 추적 등록 (Phase E lifecycle)
  try {
    addTrackedKeyword(keyword, posts.length, searchVolume);
  } catch (err) {
    console.warn('[V12] 추적 등록 실패:', (err as Error).message);
  }

  const durationMs = Date.now() - startedAt;
  console.log(`[V12] 완료: ${durationMs}ms (source=${blueprint.source}, predicted ${prediction.rankRange}, seasonal=${seasonality.isSeasonal}, smartblock=${smartBlocks?.bloggerOpportunityScore ?? 'N/A'})`);

  // Competitor insight from authority DB
  const competitorInsight = getCompetitorInsight(loadProfile()?.category);

  const result: BlueprintResult = {
    blueprint, analysis, gaps, posts, prediction, seasonality, smartBlocks, googleSerp, competitorInsight, durationMs
  };
  cache.set(keyword, { ts: Date.now(), result });
  return result;
}

export function clearBlueprintCache(): void {
  cache.clear();
}
