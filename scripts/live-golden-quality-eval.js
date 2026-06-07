#!/usr/bin/env node

/**
 * Live quality eval for LEWORD golden keyword discovery.
 *
 * Uses built files under dist/src so this evaluates what the app starts with.
 * Secrets are loaded from local config files but never printed.
 */

const fs = require('fs');
const path = require('path');

const originalLog = console.log.bind(console);
console.log = (...args) => {
  const first = String(args[0] || '');
  if (first.startsWith('[ENV]') || first.startsWith('[PERSISTENT-CACHE]')) return;
  originalLog(...args);
};

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find(arg => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function loadLocalConfig() {
  const roots = [
    process.env.APPDATA,
    'C:/Users/박성현/AppData/Roaming',
  ].filter(Boolean);
  const files = [];
  for (const root of roots) {
    files.push(
      path.join(root, 'leword', 'config.json'),
      path.join(root, 'LEWORD', 'config.json'),
      path.join(root, 'blogger-gpt-cli', 'config.json'),
    );
  }

  for (const file of files) {
    const raw = readJson(file);
    if (!raw) continue;
    const clientId = raw.naverClientId || raw.NAVER_CLIENT_ID;
    const clientSecret = raw.naverClientSecret || raw.NAVER_CLIENT_SECRET;
    const youtubeApiKey = raw.youtubeApiKey || raw.YOUTUBE_API_KEY;
    if (clientId && clientSecret) {
      return {
        clientId,
        clientSecret,
        youtubeApiKey,
        source: file.replace(/\\/g, '/').replace(/Users\/[^/]+/, 'Users/<user>'),
      };
    }
  }
  throw new Error('No local Naver config found.');
}

function compact(keyword) {
  return String(keyword || '').toLowerCase().replace(/\s+/g, '').trim();
}

function summarizeFailures(rows, floor) {
  const englishOnly = rows.filter(item => !/[가-힣]/.test(String(item.keyword || '')));
  const nonActionable = rows.filter(item => !floor.isActionableGoldenKeyword(item.keyword));
  const invalidQuality = rows.filter(item => !floor.isQualityGoldenDiscoveryResult(item, { requireActionableIntent: true }));
  const duplicateCount = rows.length - new Set(rows.map(item => compact(item.keyword))).size;
  const semiLarge = rows.filter(item =>
    /^(여름)?원피스(추천|코디|사이즈비교|비교)$/.test(
      compact(item.keyword).replace(/[^\p{L}\p{N}]/gu, ''),
    ));
  return {
    englishOnly: englishOnly.map(item => item.keyword),
    nonActionable: nonActionable.map(item => item.keyword),
    invalidQuality: invalidQuality.map(item => `${item.keyword}:${item.grade}:${item.searchVolume}/${item.documentCount}/${item.goldenRatio}`),
    duplicateCount,
    semiLarge: semiLarge.map(item => item.keyword),
  };
}

async function collectLiveSeeds(config, maxResults) {
  const out = [];
  const push = value => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text || text.length < 2) return;
    if (!/[가-힣]/.test(text)) return;
    const key = text.toLowerCase().replace(/\s+/g, '');
    if (out.some(item => item.toLowerCase().replace(/\s+/g, '') === key)) return;
    out.push(text);
  };
  const withTimeout = (promise, ms, fallback = []) => Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(fallback), ms)),
  ]);

  try {
    const { getNaverRealtimeKeywords } = require('../dist/src/utils/realtime-search-keywords.js');
    const realtime = await withTimeout(getNaverRealtimeKeywords(Math.min(40, maxResults)), 5000);
    realtime.map(item => item.keyword).forEach(push);
  } catch {}

  try {
    const ent = require('../dist/src/utils/entertainment-news-aggregator.js');
    const items = await withTimeout(ent.fetchEntertainmentAggregate({ maxMinutesAgo: 720, limitPerSource: 24 }), 5000);
    items.slice(0, Math.min(60, maxResults)).flatMap(item => [item.title, item.keyword, `${item.title} ${item.category}`]).forEach(push);
  } catch {}

  try {
    if (!config.youtubeApiKey) throw new Error('youtube api key missing');
    const { getYouTubeTrendKeywords } = require('../dist/src/utils/youtube-data-api.js');
    const trends = await withTimeout(
      getYouTubeTrendKeywords({ apiKey: config.youtubeApiKey, maxResults: Math.min(80, maxResults) }),
      7000,
    );
    trends.slice(0, Math.min(80, maxResults)).map(item => item.keyword).forEach(push);
  } catch {}

  try {
    const { getNaverNewsRankingKeywords } = require('../dist/src/utils/sources/naver-news-ranking.js');
    const news = await withTimeout(getNaverNewsRankingKeywords(), 5000);
    news.slice(0, Math.min(40, maxResults)).map(item => item.keyword).forEach(push);
  } catch {}

  try {
    const policy = require('../dist/src/utils/policy-briefing-api.js');
    const items = await withTimeout(policy.getPolicyBriefingKeywords(Math.min(20, maxResults)), 5000);
    items.slice(0, 12).flatMap(item => [
      item.keyword,
      ...(policy.expandPolicyDiscoverySeeds ? policy.expandPolicyDiscoverySeeds(item.keyword, 3) : []),
    ]).forEach(push);
  } catch {}

  return out.slice(0, maxResults);
}

async function runScenario(params) {
  const { MDPEngine } = require('../dist/src/utils/mdp-engine.js');
  const { buildCategoryFirstGoldenSeedPlan } = require('../dist/src/utils/category-first-golden-discovery.js');
  const { rankGoldenDiscoveryResults, countSss } = require('../dist/src/utils/golden-discovery-floor.js');
  const { getGoldenDiscoveryScanLimit } = require('../dist/src/utils/golden-discovery-floor.js');
  const { discoverDirectGoldenKeywords } = require('../dist/src/utils/direct-golden-keyword-miner.js');

  const target = params.target;
  const plan = buildCategoryFirstGoldenSeedPlan({
    category: params.category,
    keyword: params.keyword,
    maxSeeds: params.maxSeeds,
    liveSeeds: params.liveSeeds,
  });
  const scanLimit = Math.min(params.maxChecked, getGoldenDiscoveryScanLimit(target, false, plan.seeds.length, {
    categoryFirst: true,
  }));

  const raw = [];
  const started = Date.now();

  if (params.mode === 'direct') {
    const direct = await discoverDirectGoldenKeywords(params.config, {
      category: params.category,
      keyword: params.keyword,
      limit: target,
      maxSeeds: params.maxSeeds,
      maxCandidates: params.maxCandidates,
      liveSeeds: params.liveSeeds,
      includeCrossCategory: params.includeCrossCategory,
      requireCategoryMatch: params.requireCategoryMatch,
      includeProTrafficSupplement: target > 30 && params.includeCrossCategory,
      onProgress: progress => {
        originalLog(JSON.stringify({
          scenario: params.category,
          mode: params.mode,
          progress,
        }));
      },
    });
    raw.push(...direct);
  } else {
    const engine = new MDPEngine({
      clientId: params.config.clientId,
      clientSecret: params.config.clientSecret,
    });
    const options = {
      limit: scanLimit,
      maxCheckedSignals: scanLimit,
      maxProcessedSeeds: params.maxProcessedSeeds,
      minVolume: 10,
      seedKeywords: plan.seeds.slice(0, params.seedLimit),
      categoryIds: plan.categoryIds,
      categoryStrict: params.categoryStrict,
      fastPreview: false,
      includeMeasuredFallback: false,
    };

    for await (const result of engine.discover(plan.seeds[0] || params.keyword || params.category || '황금키워드', options)) {
      raw.push(result);
    }
  }

  const ranked = rankGoldenDiscoveryResults(raw, target, false, {
    honorRequestedLimit: false,
    diversifySimilarIntents: true,
    maxSimilarPerCluster: target > 30 ? 6 : 2,
    strictVisibleSssOnly: true,
    requireActionableIntent: true,
    qualityBackfillToTarget: true,
  });

  return {
    name: params.name,
    mode: params.mode,
    category: params.category,
    seedCount: plan.seeds.length,
    categoryIds: plan.categoryIds,
    scanLimit,
    rawCount: raw.length,
    rankedCount: ranked.length,
    sssCount: countSss(ranked),
    elapsedMs: Date.now() - started,
    top: ranked.slice(0, Math.max(30, target)).map(item => ({
      keyword: item.keyword,
      grade: item.grade,
      sv: item.searchVolume,
      docs: item.documentCount,
      ratio: Number(Number(item.goldenRatio || 0).toFixed(2)),
      score: Number(Number(item.score || 0).toFixed(2)),
    })),
    ranked,
  };
}

async function main() {
  const mode = String(argValue('mode', 'mdp')).toLowerCase();
  const target = Number(argValue('target', '30'));
  const maxChecked = Number(argValue('maxChecked', '900'));
  const maxProcessedSeeds = Number(argValue('maxProcessedSeeds', '70'));
  const seedLimit = Number(argValue('seedLimit', '220'));
  const maxSeeds = Number(argValue('maxSeeds', '320'));
  const maxCandidates = Number(argValue('maxCandidates', '1800'));
  const liveSeedMax = Number(argValue('liveSeedMax', '80'));
  const includeCrossCategory = String(argValue('includeCrossCategory', 'false')).toLowerCase() === 'true';
  const requireCategoryMatch = String(argValue('requireCategoryMatch', 'false')).toLowerCase() === 'true';
  const categories = String(argValue('categories', '문화/엔터,스포츠,지원금/정책/복지'))
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);

  const config = loadLocalConfig();
  const liveSeeds = await collectLiveSeeds(config, liveSeedMax);
  const floor = require('../dist/src/utils/golden-discovery-floor.js');

  originalLog(JSON.stringify({
    config: config.source,
    mode,
    target,
    maxChecked,
    maxProcessedSeeds,
    seedLimit,
    maxSeeds,
    maxCandidates,
    liveSeedMax,
    includeCrossCategory,
    requireCategoryMatch,
    liveSeedCount: liveSeeds.length,
    categories,
  }, null, 2));

  const scenarios = [];
  for (const category of categories) {
    scenarios.push(await runScenario({
      name: category,
      mode,
      category,
      target,
      maxChecked,
      maxProcessedSeeds,
      seedLimit,
      maxSeeds,
      maxCandidates,
      includeCrossCategory,
      requireCategoryMatch,
      categoryStrict: true,
      liveSeeds,
      config,
    }));
  }

  const report = scenarios.map(scenario => {
    const failures = summarizeFailures(scenario.ranked, floor);
    const requiredSss = target > 30 ? 30 : target;
    const pass = scenario.rankedCount >= target
      && scenario.sssCount >= requiredSss
      && failures.englishOnly.length === 0
      && failures.nonActionable.length === 0
      && failures.invalidQuality.length === 0
      && failures.duplicateCount === 0
      && failures.semiLarge.length === 0;

    return {
      name: scenario.name,
      mode: scenario.mode,
      pass,
      seedCount: scenario.seedCount,
      categoryIds: scenario.categoryIds,
      scanLimit: scenario.scanLimit,
      rawCount: scenario.rawCount,
      rankedCount: scenario.rankedCount,
      sssCount: scenario.sssCount,
      requiredSss,
      elapsedSec: Number((scenario.elapsedMs / 1000).toFixed(1)),
      failures,
      top: scenario.top,
    };
  });

  originalLog(JSON.stringify({ report }, null, 2));

  const failed = report.filter(item => !item.pass);
  if (failed.length > 0) {
    originalLog(`[live-golden-quality-eval] FAIL ${failed.length}/${report.length}`);
    process.exit(1);
  }

  originalLog(`[live-golden-quality-eval] PASS ${report.length}/${report.length}`);
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
