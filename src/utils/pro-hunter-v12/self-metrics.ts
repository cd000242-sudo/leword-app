// PRO Hunter v12 — Self Metrics
// 작성: 2026-04-15
// 사용자 자신의 예측 정확도, 평균 노출 순위, 트래픽 지표 계산

import { listTrackedPosts, listTrackedKeywords } from './tracking-store';
import { loadWeights } from './model-retrainer';
import { loadProfile } from './user-profile';

export interface SelfMetrics {
  totalTrackedPosts: number;
  totalTrackedKeywords: number;
  postsWithRank: number;
  postsAtTop3: number;
  postsAtTop10: number;
  avgRank: number | null;
  bestRank: number | null;
  predictionAccuracy: number | null;  // 예측 ±3위 이내 비율 (%)
  avgPredictionError: number | null;  // 평균 |예측 - 실측|
  rmse: number | null;
  modelVersion: number;
  modelTrainedSamples: number;
  modelLastTrainedAt: number | null;
  totalAlerts: number;
  recentAlerts: number;        // 최근 7일 알림 수
  blogIndex: number | null;
  experienceMonths: number | null;
}

export function computeSelfMetrics(): SelfMetrics {
  const posts = listTrackedPosts();
  const keywords = listTrackedKeywords();
  const weights = loadWeights();
  const profile = loadProfile();

  const postsWithRank: typeof posts = [];
  const errors: number[] = [];
  let bestRank: number | null = null;
  let top3 = 0;
  let top10 = 0;

  for (const p of posts) {
    const lastWithRank = [...p.history].reverse().find((h) => h.rank != null);
    if (lastWithRank && lastWithRank.rank != null) {
      postsWithRank.push(p);
      const r = lastWithRank.rank;
      if (bestRank == null || r < bestRank) bestRank = r;
      if (r <= 3) top3++;
      if (r <= 10) top10++;
      const err = Math.abs(r - p.predictedRank);
      errors.push(err);
    }
  }

  const avgRank =
    postsWithRank.length > 0
      ? Math.round(
          (postsWithRank.reduce((s, p) => {
            const lr = [...p.history].reverse().find((h) => h.rank != null)?.rank ?? 0;
            return s + lr;
          }, 0) /
            postsWithRank.length) *
            10
        ) / 10
      : null;

  const accuracy =
    errors.length > 0
      ? Math.round((errors.filter((e) => e <= 3).length / errors.length) * 100)
      : null;

  const avgError =
    errors.length > 0
      ? Math.round((errors.reduce((a, b) => a + b, 0) / errors.length) * 10) / 10
      : null;

  const rmse =
    errors.length > 0
      ? Math.round(Math.sqrt(errors.reduce((a, b) => a + b * b, 0) / errors.length) * 10) / 10
      : null;

  const totalAlerts = keywords.reduce((s, k) => s + k.alerts.length, 0);
  const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const recentAlerts = keywords.reduce(
    (s, k) => s + k.alerts.filter((a) => a.ts >= sevenDaysAgo).length,
    0
  );

  return {
    totalTrackedPosts: posts.length,
    totalTrackedKeywords: keywords.length,
    postsWithRank: postsWithRank.length,
    postsAtTop3: top3,
    postsAtTop10: top10,
    avgRank,
    bestRank,
    predictionAccuracy: accuracy,
    avgPredictionError: avgError,
    rmse,
    modelVersion: weights.version,
    modelTrainedSamples: weights.trainedSamples,
    modelLastTrainedAt: weights.lastTrainedAt || null,
    totalAlerts,
    recentAlerts,
    blogIndex: profile?.blogIndex ?? null,
    experienceMonths: profile?.experienceMonths ?? null,
  };
}
