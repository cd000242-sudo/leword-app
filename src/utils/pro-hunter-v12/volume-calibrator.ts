// PRO Hunter v12 — 검색량 보정 계수
// 작성: 2026-04-15
// 네이버 검색광고 API raw 수치는 광고주용 "노출 가능 횟수" 기준이라
// 실제 월간 검색량과 차이가 있다. 블랙키위가 공개한 역산 계수를 참고.
//
// 블랙키위 연구: keywordstool raw < 실제 검색량 (평균 1.3~1.5배)
// 키워드별 편차: 긴 롱테일일수록 높은 보정, 빅키워드는 낮은 보정
// 사용자 데이터가 쌓이면 자동 보정 루프로 교정

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface CalibrationConfig {
  version: number;
  baseMultiplier: number;       // 기본 배수 (1.35)
  longtailBonus: number;        // 롱테일 추가 배수 (0.15)
  longtailThreshold: number;    // 길이 기준 (10자)
  mobileBoost: number;          // 모바일 가중치 (1.0 = 동일)
  userCalibration?: number;     // 사용자 실측 기반 보정 (1.0 기본)
  samples: number;
  lastUpdatedAt: number;
}

const DEFAULT: CalibrationConfig = {
  version: 1,
  baseMultiplier: 1.35,
  longtailBonus: 0.15,
  longtailThreshold: 10,
  mobileBoost: 1.0,
  userCalibration: 1.0,
  samples: 0,
  lastUpdatedAt: 0,
};

function getPath(): string {
  const dir = path.join(app.getPath('userData'), 'pro-hunter-v12');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'volume-calibration.json');
}

export function loadCalibration(): CalibrationConfig {
  try {
    const p = getPath();
    if (!fs.existsSync(p)) return { ...DEFAULT };
    const raw = fs.readFileSync(p, 'utf8');
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveCalibration(cfg: CalibrationConfig): void {
  fs.writeFileSync(getPath(), JSON.stringify(cfg, null, 2), 'utf8');
}

/**
 * 네이버 검색광고 raw 수치를 실제 검색량에 가깝게 보정
 */
export function calibrateVolume(rawVolume: number, keyword: string): number {
  if (!rawVolume || rawVolume <= 0) return 0;
  const cfg = loadCalibration();
  let multiplier = cfg.baseMultiplier;

  // 롱테일 보너스 (긴 키워드는 노출 < 검색)
  if (keyword.length >= cfg.longtailThreshold) {
    multiplier += cfg.longtailBonus;
  }

  // 사용자 보정
  multiplier *= cfg.userCalibration || 1.0;

  return Math.round(rawVolume * multiplier);
}

/**
 * 사용자 실측 데이터로 보정 계수 갱신
 * 예: LEWORD가 예측한 5,000 vs 실제 집계 6,500 → 1.3배 보정
 */
export function updateUserCalibration(samples: Array<{ predicted: number; actual: number }>): CalibrationConfig {
  if (samples.length < 5) return loadCalibration();

  // 각 샘플의 실제/예측 비율 평균
  const ratios = samples
    .filter((s) => s.predicted > 0 && s.actual > 0)
    .map((s) => s.actual / s.predicted);

  if (ratios.length < 5) return loadCalibration();

  const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  const cfg = loadCalibration();

  // 과도한 변동 방지 (기존 값의 20% 이내만 반영)
  const newCalibration = Math.max(0.5, Math.min(2.5, mean));
  const blended = (cfg.userCalibration || 1.0) * 0.8 + newCalibration * 0.2;

  cfg.userCalibration = Math.round(blended * 1000) / 1000;
  cfg.samples = samples.length;
  cfg.lastUpdatedAt = Date.now();
  saveCalibration(cfg);

  console.log(`[CALIBRATOR] 사용자 보정 업데이트: ${blended.toFixed(3)} (샘플 ${samples.length}개)`);
  return cfg;
}
