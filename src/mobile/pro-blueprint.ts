import fs from 'fs';
import os from 'os';
import path from 'path';
import type {
  MobileProBlueprintActionResult,
  MobileProBlueprintInput,
  MobileProCategoryRpmItem,
  MobileProDraftInput,
  MobileProPortfolioRevenueInput,
  MobileProPortfolioRevenueResult,
  MobileProRevenueConfig,
  MobileProRevenueConfigInput,
  MobileProRevenueEstimate,
  MobileProRevenueEstimateInput,
} from './contracts';

export interface MobileProBlueprintServices {
  generateBlueprint?: (
    keyword: string,
    options: { force?: boolean; searchVolume?: number | null },
  ) => Promise<any>;
  generateDraft?: (blueprint: any) => Promise<any>;
}

interface ProBlueprintOptions {
  revenueConfigFile?: string;
}

const DEFAULT_REVENUE_CONFIG: MobileProRevenueConfig = {
  adpostEnabled: true,
  adpostAvgRpm: 200,
  coupangEnabled: false,
  coupangAvgCommission: 50,
  coupangCtr: 0.01,
  customMultiplier: 1.0,
  lastUpdatedAt: 0,
};

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

function appDataDirs(): string[] {
  const roots = [
    process.env['APPDATA'],
    process.env['LOCALAPPDATA'],
    process.env['HOME'],
    os.homedir(),
    process.cwd(),
  ].filter(Boolean) as string[];
  const appNames = ['LEWORD', 'leword', 'blogger-admin-panel', 'com.leword.app'];
  return [...new Set(roots.flatMap((root) => appNames.map((name) => path.join(root, name))))];
}

function firstExisting(candidates: string[]): string {
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

export function resolvePcProRevenueConfigFile(options: ProBlueprintOptions = {}): string {
  const proDir = process.env['LEWORD_PRO_REVENUE_DIR']
    || process.env['LEWORD_MOBILE_PRO_REVENUE_DIR']
    || process.env['LEWORD_PRO_OUTCOMES_DIR']
    || process.env['LEWORD_MOBILE_PRO_OUTCOMES_DIR']
    || '';
  const candidates = [
    ...(proDir ? [path.join(proDir, 'revenue-config.json')] : []),
    ...appDataDirs().map((base) => path.join(base, 'pro-hunter-v12', 'revenue-config.json')),
  ];
  return options.revenueConfigFile
    || process.env['LEWORD_PRO_REVENUE_CONFIG_FILE']
    || process.env['LEWORD_MOBILE_PRO_REVENUE_CONFIG_FILE']
    || firstExisting(candidates);
}

function readJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function compactText(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function revenueConfig(options: ProBlueprintOptions): MobileProRevenueConfig {
  return {
    ...DEFAULT_REVENUE_CONFIG,
    ...readJson<Partial<MobileProRevenueConfig>>(resolvePcProRevenueConfigFile(options), {}),
  };
}

function sanitizeRevenueConfig(
  input: MobileProRevenueConfigInput,
  current: MobileProRevenueConfig,
  now: () => number,
): MobileProRevenueConfig {
  const next: MobileProRevenueConfig = { ...current, lastUpdatedAt: now() };
  if (typeof input.adpostEnabled === 'boolean') next.adpostEnabled = input.adpostEnabled;
  if (typeof input.coupangEnabled === 'boolean') next.coupangEnabled = input.coupangEnabled;
  const numberFields: Array<keyof MobileProRevenueConfigInput> = [
    'adpostAvgRpm',
    'coupangAvgCommission',
    'coupangCtr',
    'customMultiplier',
  ];
  for (const field of numberFields) {
    const parsed = numeric(input[field]);
    if (parsed !== null) {
      (next as any)[field] = parsed;
    }
  }
  return next;
}

function detectCategoryRpm(category?: string): number {
  const lower = compactText(category).toLowerCase();
  if (!lower) return CATEGORY_RPM.default;
  for (const [key, rpm] of Object.entries(CATEGORY_RPM)) {
    if (key !== 'default' && lower.includes(key.toLowerCase())) return rpm;
  }
  return CATEGORY_RPM.default;
}

async function defaultGenerateBlueprint(
  keyword: string,
  options: { force?: boolean; searchVolume?: number | null },
): Promise<any> {
  const mod = await import('../utils/pro-hunter-v12/index');
  return mod.generateKeywordBlueprint(keyword, options);
}

async function defaultGenerateDraft(blueprint: any): Promise<any> {
  const mod = await import('../utils/pro-hunter-v12/draft-generator');
  return mod.generateDraft(blueprint);
}

function compactBlueprintResult(result: any): MobileProBlueprintActionResult {
  return {
    success: true,
    action: 'generate-blueprint',
    blueprint: result.blueprint,
    analysis: result.analysis
      ? {
          postCount: result.analysis.postCount,
          avgWordCount: result.analysis.avgWordCount,
          recommendedWordCount: result.analysis.recommendedWordCount,
          avgImageCount: result.analysis.avgImageCount,
          avgH2Count: result.analysis.avgH2Count,
          avgVideoCount: result.analysis.avgVideoCount,
          videoUsageRatio: result.analysis.videoUsageRatio,
          oldPostRatio: result.analysis.oldPostRatio,
          mustIncludeTerms: result.analysis.mustIncludeTerms,
          competitorTitles: result.analysis.competitorTitles,
        }
      : null,
    gaps: result.gaps,
    prediction: result.prediction,
    previousRecommendationFeedback: result.previousRecommendationFeedback || [],
    durationMs: numeric(result.durationMs) || 0,
  };
}

export async function generateMobileProBlueprint(params: {
  input: MobileProBlueprintInput;
  services?: MobileProBlueprintServices;
}): Promise<MobileProBlueprintActionResult> {
  const keyword = compactText(params.input.keyword);
  if (!keyword) {
    return {
      success: false,
      action: 'generate-blueprint',
      error: 'keyword-required',
    };
  }

  try {
    const generator = params.services?.generateBlueprint || defaultGenerateBlueprint;
    const result = await generator(keyword, {
      force: !!params.input.force,
      searchVolume: numeric(params.input.searchVolume),
    });
    return compactBlueprintResult(result);
  } catch (err) {
    return {
      success: false,
      action: 'generate-blueprint',
      error: (err as Error).message || 'blueprint-generation-failed',
    };
  }
}

export async function generateMobileProDraft(params: {
  input: MobileProDraftInput;
  services?: MobileProBlueprintServices;
}): Promise<MobileProBlueprintActionResult> {
  if (!params.input?.blueprint) {
    return {
      success: false,
      action: 'generate-draft',
      error: 'blueprint-required',
    };
  }

  try {
    const generator = params.services?.generateDraft || defaultGenerateDraft;
    const draft = await generator(params.input.blueprint);
    return {
      success: true,
      action: 'generate-draft',
      draft,
    };
  } catch (err) {
    return {
      success: false,
      action: 'generate-draft',
      error: (err as Error).message || 'draft-generation-failed',
    };
  }
}

export function estimateMobileProRevenue(params: {
  input: MobileProRevenueEstimateInput;
  options?: ProBlueprintOptions;
}): MobileProBlueprintActionResult {
  const keyword = compactText(params.input.keyword);
  const monthlyViews = numeric(params.input.monthlyViews);
  if (!keyword || monthlyViews === null) {
    return {
      success: false,
      action: 'estimate-revenue',
      error: 'keyword-monthly-views-required',
    };
  }

  const config = revenueConfig(params.options || {});
  const categoryRpm = detectCategoryRpm(params.input.category);
  const effectiveRpm = Math.max(categoryRpm, config.adpostAvgRpm);
  const adpostBase = config.adpostEnabled
    ? Math.round((monthlyViews * effectiveRpm) / 1000)
    : 0;
  const coupangBase = config.coupangEnabled
    ? Math.round(monthlyViews * config.coupangCtr * config.coupangAvgCommission)
    : 0;
  const totalBeforeMultiplier = adpostBase + coupangBase;
  const totalMonthlyRevenue = Math.round(totalBeforeMultiplier * config.customMultiplier);
  const estimate: MobileProRevenueEstimate = {
    keyword,
    category: params.input.category,
    monthlyViews,
    adpostRevenue: Math.round(adpostBase * config.customMultiplier),
    coupangRevenue: Math.round(coupangBase * config.customMultiplier),
    totalMonthlyRevenue,
    effectiveRpm,
    breakdown: {
      categoryRpm,
      adpostEnabled: config.adpostEnabled,
      coupangEnabled: config.coupangEnabled,
      customMultiplier: config.customMultiplier,
    },
    yearlyProjection: totalMonthlyRevenue * 12,
  };

  return {
    success: true,
    action: 'estimate-revenue',
    estimate,
  };
}

export function loadMobileProRevenueConfig(
  options: ProBlueprintOptions = {},
): MobileProBlueprintActionResult {
  return {
    success: true,
    action: 'read-revenue-config',
    config: revenueConfig(options),
  };
}

export function saveMobileProRevenueConfig(params: {
  input: MobileProRevenueConfigInput;
  options?: ProBlueprintOptions;
  now?: () => number;
}): MobileProBlueprintActionResult {
  try {
    const options = params.options || {};
    const current = revenueConfig(options);
    const config = sanitizeRevenueConfig(params.input || {}, current, params.now || Date.now);
    writeJson(resolvePcProRevenueConfigFile(options), config);
    return {
      success: true,
      action: 'save-revenue-config',
      config,
    };
  } catch (err) {
    return {
      success: false,
      action: 'save-revenue-config',
      error: (err as Error).message || 'revenue-config-save-failed',
    };
  }
}

export function getMobileProCategoryRpmTable(): MobileProBlueprintActionResult {
  const table: MobileProCategoryRpmItem[] = Object.entries(CATEGORY_RPM)
    .filter(([category]) => category !== 'default')
    .map(([category, rpm]) => ({ category, rpm }))
    .sort((a, b) => b.rpm - a.rpm);
  return {
    success: true,
    action: 'list-category-rpm',
    table,
  };
}

export function estimateMobileProPortfolioRevenue(params: {
  input: MobileProPortfolioRevenueInput;
  options?: ProBlueprintOptions;
}): MobileProBlueprintActionResult {
  if (!Array.isArray(params.input?.items)) {
    return {
      success: false,
      action: 'estimate-portfolio-revenue',
      error: 'items-required',
    };
  }

  const estimates = params.input.items
    .map((item) => estimateMobileProRevenue({
      input: {
        keyword: item.keyword,
        monthlyViews: item.monthlyViews,
        category: item.category,
      },
      options: params.options,
    }))
    .filter((item) => item.success && item.estimate)
    .map((item) => item.estimate!);
  const totalMonthly = estimates.reduce((sum, item) => sum + item.totalMonthlyRevenue, 0);
  const result: MobileProPortfolioRevenueResult = {
    totalMonthly,
    totalYearly: totalMonthly * 12,
    averagePerPost: estimates.length > 0 ? Math.round(totalMonthly / estimates.length) : 0,
    topEarners: estimates
      .map((item) => ({ keyword: item.keyword, revenue: item.totalMonthlyRevenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10),
  };

  return {
    success: true,
    action: 'estimate-portfolio-revenue',
    result,
  };
}
