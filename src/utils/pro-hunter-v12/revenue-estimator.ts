// PRO Hunter v12 — 수익 추정기 (Tier 3 #3)
// 작성: 2026-04-15
// 네이버 애드포스트 + 쿠팡파트너스 수익 추정 + 수동 입력 통합
// OAuth 없이 사용자 입력 기반 + 카테고리별 평균 RPM 활용

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface RevenueConfig {
  adpostEnabled: boolean;
  adpostAvgRpm: number;           // 천뷰당 원화 (기본 200원)
  coupangEnabled: boolean;
  coupangAvgCommission: number;   // 클릭당 원화 추정 (기본 50원)
  coupangCtr: number;             // 쿠팡 링크 클릭률 (기본 1%)
  customMultiplier: number;       // 사용자 보정 (1.0 기본)
  lastUpdatedAt: number;
}

// 카테고리별 추정 RPM (원화 천뷰당)
const CATEGORY_RPM: Record<string, number> = {
  요리: 150,
  육아: 250,
  IT: 400,
  여행: 350,
  건강: 500,
  금융: 800,
  부동산: 900,
  법률: 700,
  뷰티: 300,
  패션: 250,
  인테리어: 350,
  게임: 180,
  연예: 120,
  default: 200,
};

const DEFAULT_CONFIG: RevenueConfig = {
  adpostEnabled: true,
  adpostAvgRpm: 200,
  coupangEnabled: false,
  coupangAvgCommission: 50,
  coupangCtr: 0.01,
  customMultiplier: 1.0,
  lastUpdatedAt: 0,
};

function getConfigPath(): string {
  const dir = path.join(app.getPath('userData'), 'pro-hunter-v12');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'revenue-config.json');
}

export function loadRevenueConfig(): RevenueConfig {
  try {
    const p = getConfigPath();
    if (!fs.existsSync(p)) return { ...DEFAULT_CONFIG };
    const raw = fs.readFileSync(p, 'utf8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveRevenueConfig(cfg: Partial<RevenueConfig>): void {
  const current = loadRevenueConfig();
  const merged = { ...current, ...cfg, lastUpdatedAt: Date.now() };
  fs.writeFileSync(getConfigPath(), JSON.stringify(merged, null, 2), 'utf8');
}

export interface RevenueEstimate {
  keyword: string;
  category?: string;
  monthlyViews: number;
  adpostRevenue: number;          // 월 원화
  coupangRevenue: number;         // 월 원화
  totalMonthlyRevenue: number;
  effectiveRpm: number;           // 천뷰당 원화
  breakdown: {
    categoryRpm: number;
    adpostEnabled: boolean;
    coupangEnabled: boolean;
    customMultiplier: number;
  };
  yearlyProjection: number;
}

function detectCategoryRpm(category?: string): number {
  if (!category) return CATEGORY_RPM.default;
  const lower = category.toLowerCase();
  for (const [key, rpm] of Object.entries(CATEGORY_RPM)) {
    if (lower.includes(key.toLowerCase())) return rpm;
  }
  return CATEGORY_RPM.default;
}

export function estimateRevenue(keyword: string, monthlyViews: number, category?: string): RevenueEstimate {
  const cfg = loadRevenueConfig();
  const categoryRpm = detectCategoryRpm(category);

  // 애드포스트 수익 = 월뷰 × (category RPM or 설정 RPM 중 큰 값) / 1000
  const effectiveRpm = Math.max(categoryRpm, cfg.adpostAvgRpm);
  const adpostRevenue = cfg.adpostEnabled
    ? Math.round((monthlyViews * effectiveRpm) / 1000)
    : 0;

  // 쿠팡 수익 = 월뷰 × CTR × 평균 커미션
  const coupangRevenue = cfg.coupangEnabled
    ? Math.round(monthlyViews * cfg.coupangCtr * cfg.coupangAvgCommission)
    : 0;

  const totalBeforeMultiplier = adpostRevenue + coupangRevenue;
  const totalMonthlyRevenue = Math.round(totalBeforeMultiplier * cfg.customMultiplier);

  return {
    keyword,
    category,
    monthlyViews,
    adpostRevenue: Math.round(adpostRevenue * cfg.customMultiplier),
    coupangRevenue: Math.round(coupangRevenue * cfg.customMultiplier),
    totalMonthlyRevenue,
    effectiveRpm,
    breakdown: {
      categoryRpm,
      adpostEnabled: cfg.adpostEnabled,
      coupangEnabled: cfg.coupangEnabled,
      customMultiplier: cfg.customMultiplier,
    },
    yearlyProjection: totalMonthlyRevenue * 12,
  };
}

/**
 * 카테고리별 RPM 테이블 노출 (UI에서 참고용)
 */
export function getCategoryRpmTable(): Array<{ category: string; rpm: number }> {
  return Object.entries(CATEGORY_RPM)
    .filter(([k]) => k !== 'default')
    .map(([category, rpm]) => ({ category, rpm }))
    .sort((a, b) => b.rpm - a.rpm);
}

/**
 * 키워드 리스트의 총 예상 수익 계산 (포트폴리오)
 */
export function estimatePortfolioRevenue(
  items: Array<{ keyword: string; monthlyViews: number; category?: string }>
): {
  totalMonthly: number;
  totalYearly: number;
  averagePerPost: number;
  topEarners: Array<{ keyword: string; revenue: number }>;
} {
  const estimates = items.map((i) => estimateRevenue(i.keyword, i.monthlyViews, i.category));
  const totalMonthly = estimates.reduce((s, e) => s + e.totalMonthlyRevenue, 0);
  const topEarners = estimates
    .map((e) => ({ keyword: e.keyword, revenue: e.totalMonthlyRevenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);
  return {
    totalMonthly,
    totalYearly: totalMonthly * 12,
    averagePerPost: items.length > 0 ? Math.round(totalMonthly / items.length) : 0,
    topEarners,
  };
}
