import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  estimateMobileProPortfolioRevenue,
  estimateMobileProRevenue,
  generateMobileProBlueprint,
  generateMobileProDraft,
  getMobileProCategoryRpmTable,
  loadMobileProRevenueConfig,
  saveMobileProRevenueConfig,
} from '../../mobile/pro-blueprint';

function assert(name: string, condition: unknown, detail = ''): void {
  if (!condition) {
    console.error(`[mobile-pro-blueprint] failed: ${name}${detail ? ` - ${detail}` : ''}`);
    process.exit(1);
  }
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-mobile-pro-blueprint-'));
const revenueConfigFile = path.join(tempDir, 'pro-hunter-v12', 'revenue-config.json');

async function main(): Promise<void> {
  try {
    const blueprint = await generateMobileProBlueprint({
      input: {
        keyword: 'summer dress recommendation',
        force: true,
        searchVolume: 1200,
      },
      services: {
        generateBlueprint: async (keyword, options) => ({
          blueprint: {
            keyword,
            strategicTitle: `${keyword} winning title`,
            recommendedWordCount: 1800,
            recommendedImages: 8,
            recommendedH2Count: 6,
            mustIncludeKeywords: ['summer dress', 'linen dress'],
            outline: [{ title: 'Intro', wordCount: 300, keyPoints: ['fit', 'fabric'] }],
            contentSecret: 'compare real fabrics',
            source: 'fixture',
          },
          analysis: {
            postCount: 10,
            avgWordCount: 1400,
            recommendedWordCount: 1800,
            avgImageCount: 6,
            avgH2Count: 5,
            avgVideoCount: 0,
            videoUsageRatio: 0,
            oldPostRatio: 0.2,
            mustIncludeTerms: ['linen'],
            competitorTitles: ['summer dress top 10'],
          },
          gaps: { missingAngles: ['size table'], weakCompetitorAreas: ['material proof'] },
          prediction: { rankRange: '3-7', winProbability: 72 },
          previousRecommendationFeedback: [{ keyword: 'linen dress', message: '3위 달성' }],
          durationMs: options.force ? 1234 : 0,
        }),
      },
    });

    assert('blueprint action delegates to PC generator and preserves summary',
      blueprint.success === true
        && blueprint.action === 'generate-blueprint'
        && blueprint.blueprint?.keyword === 'summer dress recommendation'
        && blueprint.analysis?.recommendedWordCount === 1800
        && blueprint.prediction?.rankRange === '3-7'
        && blueprint.previousRecommendationFeedback?.[0]?.keyword === 'linen dress'
        && blueprint.durationMs === 1234);

    const draft = await generateMobileProDraft({
      input: { blueprint: blueprint.blueprint },
      services: {
        generateDraft: async (inputBlueprint) => ({
          keyword: inputBlueprint.keyword,
          title: inputBlueprint.strategicTitle,
          markdown: `# ${inputBlueprint.strategicTitle}\n\n본문 초안`,
          wordCount: 1200,
          source: 'fallback',
          generatedAt: Date.parse('2026-06-06T00:00:00.000Z'),
        }),
      },
    });

    assert('draft action delegates to PC draft generator',
      draft.success === true
        && draft.action === 'generate-draft'
        && draft.draft?.keyword === 'summer dress recommendation'
        && draft.draft?.markdown.includes('본문 초안')
        && draft.draft?.source === 'fallback');

    writeJson(revenueConfigFile, {
      adpostEnabled: true,
      adpostAvgRpm: 200,
      coupangEnabled: true,
      coupangAvgCommission: 60,
      coupangCtr: 0.02,
      customMultiplier: 1.5,
      lastUpdatedAt: Date.parse('2026-06-06T00:00:00.000Z'),
    });

    const revenue = estimateMobileProRevenue({
      input: {
        keyword: 'summer dress recommendation',
        monthlyViews: 10000,
        category: 'IT',
      },
      options: { revenueConfigFile },
    });

    assert('revenue action mirrors PC revenue estimator formula',
      revenue.success === true
        && revenue.action === 'estimate-revenue'
        && revenue.estimate?.effectiveRpm === 400
        && revenue.estimate?.adpostRevenue === 6000
        && revenue.estimate?.coupangRevenue === 18000
        && revenue.estimate?.totalMonthlyRevenue === 24000
        && revenue.estimate?.yearlyProjection === 288000);

    const savedConfig = saveMobileProRevenueConfig({
      input: {
        adpostEnabled: true,
        adpostAvgRpm: 300,
        coupangEnabled: true,
        coupangAvgCommission: 80,
        coupangCtr: 0.02,
        customMultiplier: 2,
      },
      options: { revenueConfigFile },
      now: () => Date.parse('2026-06-06T12:00:00.000Z'),
    });
    const loadedConfig = loadMobileProRevenueConfig({ revenueConfigFile });

    assert('revenue config action writes PC-compatible revenue settings',
      savedConfig.success === true
        && savedConfig.action === 'save-revenue-config'
        && savedConfig.config?.adpostAvgRpm === 300
        && savedConfig.config?.coupangAvgCommission === 80
        && savedConfig.config?.lastUpdatedAt === Date.parse('2026-06-06T12:00:00.000Z')
        && loadedConfig.success === true
        && loadedConfig.action === 'read-revenue-config'
        && loadedConfig.config?.customMultiplier === 2);

    const table = getMobileProCategoryRpmTable();
    assert('category rpm action returns PC category RPM table sorted by rpm',
      table.success === true
        && table.action === 'list-category-rpm'
        && Array.isArray(table.table)
        && table.table.length >= 8
        && table.table[0].rpm >= table.table[1].rpm
        && table.table.some((item) => item.category === 'IT' && item.rpm === 400));

    const portfolio = estimateMobileProPortfolioRevenue({
      input: {
        items: [
          { keyword: 'summer dress recommendation', monthlyViews: 10000, category: 'IT' },
          { keyword: 'finance app review', monthlyViews: 5000, category: 'IT' },
        ],
      },
      options: { revenueConfigFile },
    });

    assert('portfolio revenue action mirrors PC portfolio estimator',
      portfolio.success === true
        && portfolio.action === 'estimate-portfolio-revenue'
        && portfolio.result?.totalMonthly === 60000
        && portfolio.result?.totalYearly === 720000
        && portfolio.result?.averagePerPost === 30000
        && portfolio.result?.topEarners[0]?.keyword === 'summer dress recommendation'
        && portfolio.result?.topEarners[0]?.revenue === 40000);

    console.log('[mobile-pro-blueprint] passed');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('[mobile-pro-blueprint] unexpected error:', err);
  process.exit(1);
});
