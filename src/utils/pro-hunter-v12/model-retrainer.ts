// PRO Hunter v12 — Win Predictor 자동 보정
// 작성: 2026-04-15
// Phase F 추적 데이터 → 예측 vs 실측 비교 → 가중치 보정 → 다음 예측에 반영

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { listTrackedPosts } from './tracking-store';

export interface ModelWeights {
  version: number;
  baseDifficulty: number;     // 기본 난이도 (기본 30)
  blogIndexWeight: number;    // 블로그 지수 가중치 (기본 0.7)
  experienceWeight: number;   // 경험 가중치 (기본 0.15)
  wordCountWeight: number;    // 글 길이 가중치 (기본 0.15)
  rankBias: number;           // 예측 순위 보정 (실측이 더 잘 나오면 음수)
  trainedSamples: number;     // 학습된 샘플 수
  meanError: number;          // 평균 오차
  rmse: number;               // RMSE
  lastTrainedAt: number;
}

const DEFAULT_WEIGHTS: ModelWeights = {
  version: 1,
  baseDifficulty: 30,
  blogIndexWeight: 0.7,
  experienceWeight: 0.15,
  wordCountWeight: 0.15,
  rankBias: 0,
  trainedSamples: 0,
  meanError: 0,
  rmse: 0,
  lastTrainedAt: 0,
};

const FILE_NAME = 'model-weights.json';

function getPath(): string {
  const dir = path.join(app.getPath('userData'), 'pro-hunter-v12');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, FILE_NAME);
}

export function loadWeights(): ModelWeights {
  try {
    const p = getPath();
    if (!fs.existsSync(p)) return { ...DEFAULT_WEIGHTS };
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_WEIGHTS, ...parsed };
  } catch {
    return { ...DEFAULT_WEIGHTS };
  }
}

export function saveWeights(w: ModelWeights): void {
  fs.writeFileSync(getPath(), JSON.stringify(w, null, 2), 'utf8');
}

/**
 * 추적 글의 예측 vs 실측을 비교해 rankBias를 계산
 * 단순 평균 오차 학습 (full regression은 데이터 1000개+ 필요)
 */
export function retrainFromTracking(): { trained: number; meanError: number; rmse: number; bias: number } {
  const posts = listTrackedPosts();
  // 실측 데이터가 있는 글만 (rank가 실제로 측정된 것)
  const samples = posts
    .map((p) => {
      const lastWithRank = [...p.history].reverse().find((h) => h.rank != null);
      if (!lastWithRank) return null;
      return { predicted: p.predictedRank, actual: lastWithRank.rank as number };
    })
    .filter((x): x is { predicted: number; actual: number } => x != null);

  if (samples.length < 5) {
    return { trained: samples.length, meanError: 0, rmse: 0, bias: 0 };
  }

  const errors = samples.map((s) => s.actual - s.predicted);
  const meanError = errors.reduce((a, b) => a + b, 0) / errors.length;
  const rmse = Math.sqrt(errors.reduce((a, b) => a + b * b, 0) / errors.length);

  // bias는 평균 오차의 80% (보수적 보정)
  const newBias = meanError * 0.8;

  const weights = loadWeights();
  weights.rankBias = newBias;
  weights.trainedSamples = samples.length;
  weights.meanError = Math.round(meanError * 100) / 100;
  weights.rmse = Math.round(rmse * 100) / 100;
  weights.lastTrainedAt = Date.now();
  saveWeights(weights);

  console.log(`[RETRAIN] ✅ ${samples.length}개 샘플, meanError=${meanError.toFixed(2)}, rmse=${rmse.toFixed(2)}, bias=${newBias.toFixed(2)}`);

  return {
    trained: samples.length,
    meanError: Math.round(meanError * 100) / 100,
    rmse: Math.round(rmse * 100) / 100,
    bias: Math.round(newBias * 100) / 100,
  };
}

export function getModelMetrics(): ModelWeights {
  return loadWeights();
}
