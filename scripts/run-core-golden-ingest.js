#!/usr/bin/env node

/**
 * Phase 1C one-shot: discover measured, category-matched candidates on the
 * operator PC and ingest only trusted rows into the production LIVE board.
 * Secrets are loaded by EnvironmentManager and are never printed.
 */

const path = require('path');

const CORE_DISCOVERY_CATEGORIES = Object.freeze([
  'policy',
  'finance',
  'health',
  'education',
  'it',
  'home_life',
  'travel_domestic',
  'car',
  'realestate',
  'parenting',
  'recipe',
  'electronics',
]);

function argNumber(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  const value = Number(found ? found.slice(prefix.length) : fallback);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function argList(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  if (!found) return [...fallback];
  const requested = found.slice(prefix.length).split(',').map((item) => item.trim()).filter(Boolean);
  return CORE_DISCOVERY_CATEGORIES.filter((category) => requested.includes(category));
}

function compact(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '').trim();
}

async function main() {
  const distRoot = path.join(__dirname, '..', 'dist', 'src', 'utils');
  const { EnvironmentManager } = require(path.join(distRoot, 'environment-manager.js'));
  const env = EnvironmentManager.getInstance();
  const config = env.getConfig();
  if (!config.naverClientId || !config.naverClientSecret) {
    throw new Error('Naver API credentials are not configured.');
  }
  if (!process.env.LEWORD_LIVE_GOLDEN_INGEST_URL || !process.env.LEWORD_LIVE_GOLDEN_INGEST_TOKEN) {
    throw new Error('LIVE golden ingest target is not configured on this operator PC.');
  }

  const { discoverDirectGoldenKeywords } = require(path.join(distRoot, 'direct-golden-keyword-miner.js'));
  const {
    isQualityGoldenDiscoveryResult,
    rankGoldenDiscoveryResults,
  } = require(path.join(distRoot, 'golden-discovery-floor.js'));
  const { uploadGoldenBoardCandidates } = require(path.join(distRoot, 'live-board-uploader.js'));

  const targetPerCategory = Math.min(12, argNumber('targetPerCategory', 8));
  const maxCandidatesPerCategory = Math.min(160, argNumber('maxCandidatesPerCategory', 80));
  const categories = argList('categories', CORE_DISCOVERY_CATEGORIES);
  if (categories.length === 0) throw new Error('No valid core categories were selected.');
  const aggregate = [];
  const seen = new Set();
  const report = [];

  for (const category of categories) {
    const rows = await discoverDirectGoldenKeywords(
      { clientId: config.naverClientId, clientSecret: config.naverClientSecret },
      {
        category,
        limit: targetPerCategory,
        maxSeeds: 220,
        maxCandidates: maxCandidatesPerCategory,
        liveSeeds: [],
        includeCrossCategory: false,
        requireCategoryMatch: true,
        includeSearchAdSuggestions: true,
        includeProTrafficSupplement: false,
        strictVisibleSssOnly: false,
        suggestionSeedLimit: 6,
        suggestionsPerSeed: 20,
        maxSimilarPerCluster: 2,
        onProgress: (progress) => {
          if (progress.phase === 'measure' || progress.phase === 'rank') {
            console.log('[CORE-GOLDEN-INGEST]', category, progress);
          }
        },
      },
    );
    const qualityRows = rankGoldenDiscoveryResults(rows, targetPerCategory, false, {
      honorRequestedLimit: false,
      diversifySimilarIntents: true,
      maxSimilarPerCluster: 2,
      strictVisibleSssOnly: false,
      requireActionableIntent: true,
      qualityBackfillToTarget: true,
    }).filter((row) => isQualityGoldenDiscoveryResult(row, { requireActionableIntent: true }));

    let acceptedForAggregate = 0;
    for (const row of qualityRows) {
      const key = compact(row.keyword);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      aggregate.push(row);
      acceptedForAggregate += 1;
    }
    report.push({
      category,
      rawRanked: rows.length,
      measuredQuality: qualityRows.length,
      uniqueAdded: acceptedForAggregate,
    });
  }

  const upload = await uploadGoldenBoardCandidates(aggregate, {
    source: 'desktop-phase-1c-core-category-ingest',
  });
  console.log(JSON.stringify({
    categories: categories.length,
    discovered: aggregate.length,
    report,
    upload,
  }, null, 2));
  if (!upload || upload.uploaded === 0 || !upload.accepted) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error('[CORE-GOLDEN-INGEST] failed:', error?.message || error);
  process.exit(1);
});
