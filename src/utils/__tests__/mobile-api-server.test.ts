import fs from 'fs';
import http from 'http';
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import { createLewordApiServer } from '../../../apps/api/src/server';
import { createHttpMobileEntitlementVerifier } from '../../mobile/entitlements';
import {
  MobilePushDispatcher,
  MobilePushRegistry,
} from '../../mobile/push-notifications';
import { MobileLiveGoldenRadar } from '../../mobile/live-golden-radar';
import { LIVE_GOLDEN_CORE_CATEGORY_POLICIES } from '../../mobile/live-golden-category-policy';
import { liveGoldenBoardFingerprint } from '../../mobile/live-golden-supply-report';
import { MobileNotificationInbox } from '../../mobile/notification-inbox';
import { MobilePrewarmScheduler } from '../../mobile/prewarm-scheduler';
import { InMemoryMobileResultCache } from '../../mobile/result-cache';
import type { MobileJobExecutor } from '../../mobile/job-orchestrator';
import {
  MOBILE_EXPORT_ROUTES,
  MOBILE_KEYWORD_GROUP_ROUTES,
  MOBILE_LIVE_GOLDEN_ROUTES,
  MOBILE_PRO_BLUEPRINT_ROUTES,
  MOBILE_PRO_OUTCOME_ROUTES,
  MOBILE_RANK_TRACKING_ROUTES,
  MOBILE_SCHEDULE_ROUTES,
  MOBILE_WORDPRESS_ROUTES,
  type MobileKeywordResult,
} from '../../mobile/contracts';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address === 'object' && address) {
        resolve(address.port);
      }
    });
  });
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function waitForCompletedJob(baseUrl: string, jobId: string): Promise<any> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const read = await fetch(`${baseUrl}/v1/jobs/${encodeURIComponent(jobId)}`);
    const readJson: any = await read.json();
    if (readJson.job?.state === 'completed') {
      return readJson.job;
    }
    if (readJson.job?.state === 'failed' || readJson.job?.state === 'cancelled') {
      throw new Error(`job ${readJson.job.state}: ${JSON.stringify(readJson.job)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`job did not complete: ${jobId}`);
}

const result: MobileKeywordResult = {
  keywords: [],
  summary: {
    total: 0,
    sss: 0,
    measured: 0,
    elapsedMs: 1,
    fromCache: false,
    parityMode: 'pc-engine',
  },
};

(async () => {
  const executor: MobileJobExecutor = async (_job, ctx) => {
    ctx.progress(15, 'streaming mobile progress');
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1500);
      ctx.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    });
    if (ctx.signal.aborted) {
      throw new Error('cancelled');
    }
    return result;
  };

  const server = createLewordApiServer({ executor, resultCache: null, entitlementVerifier: null });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const health = await fetch(`${baseUrl}/health`);
    const healthJson: any = await health.json();
    assert('health ok', health.ok && healthJson.ok === true);
    assert('health exposes endpoint count', healthJson.endpoints >= 6);
    assert('health exposes mobile job queue stats',
      typeof healthJson.jobs?.maxConcurrentJobs === 'number'
        && typeof healthJson.jobs?.queued === 'number'
        && typeof healthJson.jobs?.running === 'number');
    assert('health exposes mobile runtime readiness',
      healthJson.runtime?.mode === 'production-api-worker'
        && Array.isArray(healthJson.runtime?.checks)
        && healthJson.runtime.checks.some((item: any) => item.name === 'Naver SearchAd credentials configured'));
    assert('health exposes live golden worker heartbeat freshness',
      typeof healthJson.liveGolden?.worker?.available === 'boolean'
        && typeof healthJson.liveGolden?.worker?.healthy === 'boolean'
        && typeof healthJson.liveGolden?.worker?.stale === 'boolean'
        && typeof healthJson.liveGolden?.worker?.reason === 'string',
      JSON.stringify(healthJson.liveGolden));
    assert('health exposes automated live golden supply gate without claiming human-review superiority',
      ['pass', 'fail'].includes(healthJson.liveGolden?.supply?.automatedSupplyGate)
        && ['pass', 'fail', 'pending-human-review'].includes(healthJson.liveGolden?.supply?.superiorityGate)
        && Array.isArray(healthJson.liveGolden?.supply?.categories)
        && healthJson.liveGolden.supply.categories.length === 12,
      JSON.stringify(healthJson.liveGolden?.supply));

    const previousCodexCli = process.env.LEWORD_CODEX_CLI;
    const previousClaudeCli = process.env.LEWORD_CLAUDE_CODE_CLI;
    process.env.LEWORD_CODEX_CLI = path.join(os.tmpdir(), 'missing-leword-codex-cli-for-test');
    process.env.LEWORD_CLAUDE_CODE_CLI = path.join(os.tmpdir(), 'missing-leword-claude-cli-for-test');
    try {
      const adminAiStatus = await fetch(`${baseUrl}/v1/admin/ai-worker/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedProvider: 'api',
          apiAssist: { openai: true },
        }),
      });
      const adminAiStatusJson: any = await adminAiStatus.json();
      assert('admin AI worker status route responds',
        adminAiStatus.ok
          && adminAiStatusJson.ok === true
          && adminAiStatusJson.selectedProvider === 'api');
      assert('admin AI worker status reports API assist without exposing keys',
        adminAiStatusJson.ready?.api === true
          && adminAiStatusJson.apiAssist?.count === 1
          && adminAiStatusJson.apiAssist?.openai === true
          && !JSON.stringify(adminAiStatusJson).includes('sk-'));
      assert('admin AI worker status probes server CLIs',
        adminAiStatusJson.workers?.codex?.status === 'not-installed'
          && adminAiStatusJson.workers?.claudeCode?.status === 'not-installed');
    } finally {
      if (previousCodexCli === undefined) delete process.env.LEWORD_CODEX_CLI;
      else process.env.LEWORD_CODEX_CLI = previousCodexCli;
      if (previousClaudeCli === undefined) delete process.env.LEWORD_CLAUDE_CODE_CLI;
      else process.env.LEWORD_CLAUDE_CODE_CLI = previousClaudeCli;
    }

    const apiStatus = await fetch(`${baseUrl}/v1/mobile/api-status`);
    const apiStatusJson: any = await apiStatus.json();
    assert('mobile api status route works', apiStatus.status === 200 && apiStatusJson.ok === true);
    assert('mobile api status exposes diagnostic items',
      Array.isArray(apiStatusJson.snapshot?.items)
        && apiStatusJson.snapshot.items.some((item: any) => item.id === 'naver-searchad'));
    assert('mobile api status uses safe key presence metadata',
      apiStatusJson.snapshot.items.every((item: any) => !item.keyPresence?.some((key: any) => 'value' in key)));

    const exportedKeywords = await fetch(`${baseUrl}${MOBILE_EXPORT_ROUTES.keywords}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        format: 'csv',
        title: 'mobile export fixture',
        keywords: [{
          keyword: '원피스 추천',
          grade: 'SSS',
          pcSearchVolume: 360,
          mobileSearchVolume: 180,
          totalSearchVolume: 540,
          documentCount: 1611294,
          goldenRatio: 0.0003,
          cpc: 120,
          category: 'fashion',
          source: 'api-fixture',
          intent: 'commercial',
          evidence: [],
          isMeasured: true,
        }],
      }),
    });
    const exportedKeywordsJson: any = await exportedKeywords.json();
    assert('mobile keyword export route works',
      exportedKeywords.status === 200
        && exportedKeywordsJson.ok === true
        && /^mobile_export_fixture_\d{4}-\d{2}-\d{2}\.csv$/.test(exportedKeywordsJson.artifact.filename)
        && exportedKeywordsJson.artifact.content.startsWith('\uFEFF키워드,등급,PC 검색량')
        && exportedKeywordsJson.artifact.shareText.includes('1개'));

    const created = await fetch(`${baseUrl}/v1/golden/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId: 'policy', targetCount: 30 }),
    });
    const createdJson: any = await created.json();
    assert('job create returns accepted', created.status === 202 && createdJson.ok === true);
    assert('job create includes self link', !!createdJson.links?.self);
    assert('job create includes events link', !!createdJson.links?.events);
    assert('job create includes cancel link', !!createdJson.links?.cancel);

    const jobId = createdJson.job.id;
    const eventsAbort = new AbortController();
    const events = await fetch(`${baseUrl}${createdJson.links.events}`, {
      signal: eventsAbort.signal,
    });
    assert('events endpoint returns SSE', events.headers.get('content-type')?.includes('text/event-stream') === true);
    const reader = events.body?.getReader();
    const firstChunk = await reader?.read();
    eventsAbort.abort();
    const chunkText = new TextDecoder().decode(firstChunk?.value || new Uint8Array());
    assert('events stream writes job event', chunkText.includes('event: job'));

    const read = await fetch(`${baseUrl}/v1/jobs/${encodeURIComponent(jobId)}`);
    const readJson: any = await read.json();
    assert('job read works', read.ok && readJson.job.id === jobId);

    const cancelled = await fetch(`${baseUrl}/v1/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' });
    const cancelledJson: any = await cancelled.json();
    assert('job cancel works', cancelled.ok && cancelledJson.job.state === 'cancelled');
  } finally {
    await close(server);
  }

  console.log('[mobile-api-server.test] passed');

  const proBlueprintDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-pro-blueprint-api-'));
  const proBlueprintRevenueConfigFile = path.join(proBlueprintDir, 'revenue-config.json');
  const oldProBlueprintRevenueConfigFile = process.env['LEWORD_PRO_REVENUE_CONFIG_FILE'];
  process.env['LEWORD_PRO_REVENUE_CONFIG_FILE'] = proBlueprintRevenueConfigFile;
  writeJson(proBlueprintRevenueConfigFile, {
    adpostEnabled: true,
    adpostAvgRpm: 200,
    coupangEnabled: true,
    coupangAvgCommission: 60,
    coupangCtr: 0.02,
    customMultiplier: 1.5,
    lastUpdatedAt: Date.parse('2026-06-06T00:00:00.000Z'),
  });

  const proBlueprintServer = createLewordApiServer({
    executor,
    entitlementVerifier: null,
    proBlueprintServices: {
      generateBlueprint: async (keyword: string, options: { force?: boolean; searchVolume?: number | null }) => ({
        blueprint: {
          keyword,
          strategicTitle: `${keyword} mobile API title`,
          recommendedWordCount: 1800,
          mustIncludeKeywords: ['summer dress', 'linen dress'],
          outline: [{ title: 'Intro', wordCount: 300 }],
        },
        analysis: {
          postCount: 10,
          avgWordCount: 1400,
          recommendedWordCount: 1800,
          avgImageCount: 6,
          avgH2Count: 5,
          mustIncludeTerms: ['linen'],
          competitorTitles: ['summer dress top 10'],
        },
        gaps: { missingAngles: ['size table'] },
        prediction: { rankRange: '3-7', winProbability: 72 },
        durationMs: options.force ? 1234 : 0,
      }),
      generateDraft: async (blueprint: any) => ({
        keyword: blueprint.keyword,
        title: blueprint.strategicTitle,
        markdown: `# ${blueprint.strategicTitle}\n\nmobile API draft`,
        wordCount: 1200,
        source: 'fixture',
      }),
    },
  });
  const proBlueprintPort = await listen(proBlueprintServer);
  const proBlueprintBaseUrl = `http://127.0.0.1:${proBlueprintPort}`;

  try {
    const health = await fetch(`${proBlueprintBaseUrl}/health`);
    const healthJson: any = await health.json();
    assert('health exposes PRO blueprint routes',
      health.status === 200
        && healthJson.proBlueprintRoutes?.blueprint === MOBILE_PRO_BLUEPRINT_ROUTES.blueprint
        && healthJson.proBlueprintRoutes?.draft === MOBILE_PRO_BLUEPRINT_ROUTES.draft
        && healthJson.proBlueprintRoutes?.revenue === MOBILE_PRO_BLUEPRINT_ROUTES.revenue
        && healthJson.proBlueprintRoutes?.revenueConfig === MOBILE_PRO_BLUEPRINT_ROUTES.revenueConfig
        && healthJson.proBlueprintRoutes?.categoryRpm === MOBILE_PRO_BLUEPRINT_ROUTES.categoryRpm
        && healthJson.proBlueprintRoutes?.portfolioRevenue === MOBILE_PRO_BLUEPRINT_ROUTES.portfolioRevenue);

    const generatedBlueprint = await fetch(`${proBlueprintBaseUrl}${MOBILE_PRO_BLUEPRINT_ROUTES.blueprint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyword: 'summer dress recommendation',
        force: true,
        searchVolume: 1200,
      }),
    });
    const generatedBlueprintJson: any = await generatedBlueprint.json();
    assert('PRO blueprint route delegates to PC blueprint generator',
      generatedBlueprint.status === 200
        && generatedBlueprintJson.ok === true
        && generatedBlueprintJson.result.success === true
        && generatedBlueprintJson.result.blueprint.keyword === 'summer dress recommendation'
        && generatedBlueprintJson.result.analysis.recommendedWordCount === 1800
        && generatedBlueprintJson.result.prediction.rankRange === '3-7'
        && generatedBlueprintJson.result.durationMs === 1234);

    const generatedDraft = await fetch(`${proBlueprintBaseUrl}${MOBILE_PRO_BLUEPRINT_ROUTES.draft}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blueprint: generatedBlueprintJson.result.blueprint,
      }),
    });
    const generatedDraftJson: any = await generatedDraft.json();
    assert('PRO draft route delegates to PC draft generator',
      generatedDraft.status === 200
        && generatedDraftJson.ok === true
        && generatedDraftJson.result.success === true
        && generatedDraftJson.result.draft.markdown.includes('mobile API draft'));

    const revenueEstimate = await fetch(`${proBlueprintBaseUrl}${MOBILE_PRO_BLUEPRINT_ROUTES.revenue}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyword: 'summer dress recommendation',
        monthlyViews: 10000,
        category: 'IT',
      }),
    });
    const revenueEstimateJson: any = await revenueEstimate.json();
    assert('PRO revenue route mirrors PC revenue estimator',
      revenueEstimate.status === 200
        && revenueEstimateJson.ok === true
        && revenueEstimateJson.result.success === true
        && revenueEstimateJson.result.estimate.effectiveRpm === 400
        && revenueEstimateJson.result.estimate.totalMonthlyRevenue === 24000
        && revenueEstimateJson.result.estimate.yearlyProjection === 288000);

    const savedRevenueConfig = await fetch(`${proBlueprintBaseUrl}${MOBILE_PRO_BLUEPRINT_ROUTES.revenueConfig}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adpostEnabled: true,
        adpostAvgRpm: 300,
        coupangEnabled: true,
        coupangAvgCommission: 80,
        coupangCtr: 0.02,
        customMultiplier: 2,
      }),
    });
    const savedRevenueConfigJson: any = await savedRevenueConfig.json();
    assert('PRO revenue config route writes PC-compatible settings',
      savedRevenueConfig.status === 200
        && savedRevenueConfigJson.ok === true
        && savedRevenueConfigJson.result.success === true
        && savedRevenueConfigJson.result.config.adpostAvgRpm === 300
        && savedRevenueConfigJson.result.config.coupangEnabled === true);

    const readRevenueConfig = await fetch(`${proBlueprintBaseUrl}${MOBILE_PRO_BLUEPRINT_ROUTES.revenueConfig}`);
    const readRevenueConfigJson: any = await readRevenueConfig.json();
    assert('PRO revenue config route reads saved PC-compatible settings',
      readRevenueConfig.status === 200
        && readRevenueConfigJson.ok === true
        && readRevenueConfigJson.result.success === true
        && readRevenueConfigJson.result.config.customMultiplier === 2);

    const categoryRpm = await fetch(`${proBlueprintBaseUrl}${MOBILE_PRO_BLUEPRINT_ROUTES.categoryRpm}`);
    const categoryRpmJson: any = await categoryRpm.json();
    assert('PRO category RPM route exposes sorted PC RPM table',
      categoryRpm.status === 200
        && categoryRpmJson.ok === true
        && categoryRpmJson.result.success === true
        && categoryRpmJson.result.table[0].rpm >= categoryRpmJson.result.table[1].rpm
        && categoryRpmJson.result.table.some((item: any) => item.category === 'IT' && item.rpm === 400));

    const portfolioRevenue = await fetch(`${proBlueprintBaseUrl}${MOBILE_PRO_BLUEPRINT_ROUTES.portfolioRevenue}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          { keyword: 'summer dress recommendation', monthlyViews: 10000, category: 'IT' },
          { keyword: 'finance app review', monthlyViews: 5000, category: 'IT' },
        ],
      }),
    });
    const portfolioRevenueJson: any = await portfolioRevenue.json();
    assert('PRO portfolio revenue route mirrors PC portfolio estimator',
      portfolioRevenue.status === 200
        && portfolioRevenueJson.ok === true
        && portfolioRevenueJson.result.success === true
        && portfolioRevenueJson.result.result.totalMonthly === 60000
        && portfolioRevenueJson.result.result.totalYearly === 720000
        && portfolioRevenueJson.result.result.topEarners[0].revenue === 40000);
  } finally {
    await close(proBlueprintServer);
    if (oldProBlueprintRevenueConfigFile === undefined) {
      delete process.env['LEWORD_PRO_REVENUE_CONFIG_FILE'];
    } else {
      process.env['LEWORD_PRO_REVENUE_CONFIG_FILE'] = oldProBlueprintRevenueConfigFile;
    }
    fs.rmSync(proBlueprintDir, { recursive: true, force: true });
  }

  console.log('[mobile-api-server-pro-blueprint.test] passed');

  const wordpressFile = path.join(os.tmpdir(), `leword-wordpress-${Date.now()}.json`);
  const oldWordpressFile = process.env['LEWORD_WORDPRESS_PUBLISHING_FILE'];
  process.env['LEWORD_WORDPRESS_PUBLISHING_FILE'] = wordpressFile;
  const wordpressRequests: Array<{ method?: string; url?: string; auth?: string; body?: any }> = [];
  const expectedWordPressAuth = `Basic ${Buffer.from('writer:server-test-secret').toString('base64')}`;
  const fakeWordPressServer = http.createServer(async (req, res) => {
    const bodyText = req.method === 'POST' ? await readBody(req) : '';
    wordpressRequests.push({
      method: req.method,
      url: req.url,
      auth: req.headers.authorization,
      body: bodyText ? JSON.parse(bodyText) : null,
    });

    if (req.url?.startsWith('/wp-json/wp/v2/categories')) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify([
        { id: 12, name: 'Policy', count: 7 },
        { id: 15, name: 'Lifestyle', count: 2 },
      ]));
      return;
    }

    if (req.method === 'POST' && req.url === '/wp-json/wp/v2/posts') {
      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        id: 654,
        link: 'https://wp.local/?p=654',
        status: 'draft',
      }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ message: 'not found' }));
  });
  const fakeWordPressPort = await listen(fakeWordPressServer);
  const wordpressServer = createLewordApiServer({ executor, entitlementVerifier: null });
  const wordpressPort = await listen(wordpressServer);
  const wordpressBaseUrl = `http://127.0.0.1:${wordpressPort}`;

  try {
    const emptyWordPress = await fetch(`${wordpressBaseUrl}${MOBILE_WORDPRESS_ROUTES.snapshot}`);
    const emptyWordPressJson: any = await emptyWordPress.json();
    assert('wordpress snapshot starts unconfigured',
      emptyWordPress.status === 200
        && emptyWordPressJson.snapshot.storage === 'pc-wordpress-publishing-json'
        && emptyWordPressJson.snapshot.configured === false);

    const savedSite = await fetch(`${wordpressBaseUrl}${MOBILE_WORDPRESS_ROUTES.site}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: 'LEWORD WP',
        siteUrl: `http://127.0.0.1:${fakeWordPressPort}`,
        username: 'writer',
        applicationPassword: 'server-test-secret',
        defaultCategoryId: '12',
        defaultCategoryName: '정책',
      }),
    });
    const savedSiteJson: any = await savedSite.json();
    assert('wordpress site can be saved through mobile API',
      savedSite.status === 201
        && savedSiteJson.site.siteUrl === `http://127.0.0.1:${fakeWordPressPort}`
        && savedSiteJson.site.hasApplicationPassword === true
        && savedSiteJson.snapshot.configured === true
        && !JSON.stringify(savedSiteJson).includes('server-test-secret'));

    const refreshedCategories = await fetch(
      `${wordpressBaseUrl}${MOBILE_WORDPRESS_ROUTES.categories}?siteId=${encodeURIComponent(savedSiteJson.site.id)}`,
    );
    const refreshedCategoriesJson: any = await refreshedCategories.json();
    assert('wordpress categories can be refreshed through mobile API',
      refreshedCategories.status === 200
        && refreshedCategoriesJson.categories.length === 2
        && refreshedCategoriesJson.site.categories[0].id === '12'
        && refreshedCategoriesJson.snapshot.sites.items[0].categories[1].name === 'Lifestyle'
        && wordpressRequests[0].url?.startsWith('/wp-json/wp/v2/categories')
        && wordpressRequests[0].auth === expectedWordPressAuth
        && !JSON.stringify(refreshedCategoriesJson).includes('server-test-secret'));

    const createdDraft = await fetch(`${wordpressBaseUrl}${MOBILE_WORDPRESS_ROUTES.drafts}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '모바일 워드프레스 초안',
        keyword: '정책 지원금',
        content: '모바일에서 PC 발행 큐로 넘기는 초안입니다.',
        categoryId: '12',
        categoryName: '정책',
      }),
    });
    const createdDraftJson: any = await createdDraft.json();
    assert('wordpress draft can be queued through mobile API',
      createdDraft.status === 201
        && createdDraftJson.draft.id.startsWith('mobile_wp_draft_')
        && createdDraftJson.draft.siteId === savedSiteJson.site.id
        && createdDraftJson.snapshot.drafts.total === 1);

    const publishedDraft = await fetch(`${wordpressBaseUrl}${MOBILE_WORDPRESS_ROUTES.publish}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        draftId: createdDraftJson.draft.id,
        status: 'draft',
      }),
    });
    const publishedDraftJson: any = await publishedDraft.json();
    const postRequest = wordpressRequests.find((item) => item.url === '/wp-json/wp/v2/posts');
    assert('wordpress draft can be published through mobile API',
      publishedDraft.status === 201
        && publishedDraftJson.result.postId === '654'
        && publishedDraftJson.draft.wpPostId === '654'
        && publishedDraftJson.draft.status === 'wp-draft'
        && postRequest?.auth === expectedWordPressAuth
        && postRequest.body?.status === 'draft'
        && postRequest.body?.categories?.[0] === 12
        && !JSON.stringify(publishedDraftJson).includes('server-test-secret'));
  } finally {
    await close(wordpressServer);
    await close(fakeWordPressServer);
    if (oldWordpressFile === undefined) {
      delete process.env['LEWORD_WORDPRESS_PUBLISHING_FILE'];
    } else {
      process.env['LEWORD_WORDPRESS_PUBLISHING_FILE'] = oldWordpressFile;
    }
    fs.rmSync(wordpressFile, { force: true });
  }

  const rankDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-rank-api-'));
  const rankExposureTrackedFile = path.join(rankDir, 'exposure-tracking', 'tracked.json');
  const rankExposureKeywordHistoryFile = path.join(rankDir, 'exposure-tracking', 'keyword-history.json');
  const rankExposureConfigFile = path.join(rankDir, 'exposure-tracking', 'config.json');
  const rankProTrackingFile = path.join(rankDir, 'pro-hunter-v12', 'tracking-store.json');
  const rankProOutcomeFile = path.join(rankDir, 'pro-hunter-v12', 'outcome-records.json');
  const oldRankEnv = {
    tracked: process.env['LEWORD_EXPOSURE_TRACKED_FILE'],
    keywordHistory: process.env['LEWORD_EXPOSURE_KEYWORD_HISTORY_FILE'],
    config: process.env['LEWORD_EXPOSURE_CONFIG_FILE'],
    pro: process.env['LEWORD_PRO_TRACKING_FILE'],
    outcomes: process.env['LEWORD_PRO_OUTCOMES_FILE'],
  };
  process.env['LEWORD_EXPOSURE_TRACKED_FILE'] = rankExposureTrackedFile;
  process.env['LEWORD_EXPOSURE_KEYWORD_HISTORY_FILE'] = rankExposureKeywordHistoryFile;
  process.env['LEWORD_EXPOSURE_CONFIG_FILE'] = rankExposureConfigFile;
  process.env['LEWORD_PRO_TRACKING_FILE'] = rankProTrackingFile;
  process.env['LEWORD_PRO_OUTCOMES_FILE'] = rankProOutcomeFile;
  writeJson(rankExposureConfigFile, { rssUrl: 'https://rss.blog.naver.com/leword.xml' });
  writeJson(rankExposureKeywordHistoryFile, [{ keyword: '여름 원피스 추천', recordedAt: '2026-06-01T00:00:00.000Z' }]);
  writeJson(rankExposureTrackedFile, [{
    keyword: '여름 원피스 추천',
    postUrl: 'https://blog.naver.com/leword/223000000001',
    postTitle: '여름 원피스 추천',
    category: 'fashion',
    registeredAt: '2026-06-01T00:00:00.000Z',
    lastCheckedAt: '2026-06-06T00:00:00.000Z',
    history: [
      { checkedAt: '2026-06-05T00:00:00.000Z', rank: 18, inTop10: false, inTop30: true },
      { checkedAt: '2026-06-06T00:00:00.000Z', rank: 7, inTop10: true, inTop30: true },
    ],
  }]);
  writeJson(rankProTrackingFile, {
    version: 1,
    keywords: {
      '여름 원피스 추천': {
        keyword: '여름 원피스 추천',
        registeredAt: Date.parse('2026-06-01T00:00:00.000Z'),
        lastCheckedAt: Date.parse('2026-06-06T00:00:00.000Z'),
        initialDocCount: 1200,
        history: [{ ts: Date.parse('2026-06-06T00:00:00.000Z'), docCount: 1610, searchVolume: 540 }],
        alerts: [{ ts: Date.parse('2026-06-06T00:00:00.000Z'), type: 'opportunity', message: '상승 기회' }],
      },
    },
    posts: {},
  });
  writeJson(rankProOutcomeFile, {
    version: 1,
    records: {
      'https://blog.naver.com/leword/223000000001': {
        postUrl: 'https://blog.naver.com/leword/223000000001',
        keyword: '여름 원피스 추천',
        category: 'fashion',
        predictedRank: 5,
        predictedTraffic: 1200,
        actualRank: 6,
        actualMonthlyViews: 1800,
        actualMonthlyRevenue: 54000,
        firstExposureDays: 2,
        recordedAt: Date.parse('2026-06-06T00:00:00.000Z'),
      },
    },
  });
  const rankServer = createLewordApiServer({ executor, entitlementVerifier: null });
  const rankPort = await listen(rankServer);
  const rankBaseUrl = `http://127.0.0.1:${rankPort}`;

  try {
    const health = await fetch(`${rankBaseUrl}/health`);
    const healthJson: any = await health.json();
    assert('health exposes rank tracking routes',
      health.status === 200
        && healthJson.rankTrackingRoutes?.snapshot === MOBILE_RANK_TRACKING_ROUTES.snapshot);
    assert('health exposes rank tracking action routes',
      healthJson.rankTrackingRoutes?.manual === MOBILE_RANK_TRACKING_ROUTES.manual
        && healthJson.rankTrackingRoutes?.proPost === MOBILE_RANK_TRACKING_ROUTES.proPost
        && healthJson.rankTrackingRoutes?.run === MOBILE_RANK_TRACKING_ROUTES.run
        && healthJson.rankTrackingRoutes?.pair === MOBILE_RANK_TRACKING_ROUTES.pair);
    assert('health exposes PRO outcome routes',
      healthJson.proOutcomeRoutes?.snapshot === MOBILE_PRO_OUTCOME_ROUTES.snapshot
        && healthJson.proOutcomeRoutes?.record === MOBILE_PRO_OUTCOME_ROUTES.record
        && healthJson.proOutcomeRoutes?.item === MOBILE_PRO_OUTCOME_ROUTES.item
        && healthJson.proOutcomeRoutes?.sync === MOBILE_PRO_OUTCOME_ROUTES.sync);

    const rankTracking = await fetch(`${rankBaseUrl}${MOBILE_RANK_TRACKING_ROUTES.snapshot}`);
    const rankTrackingJson: any = await rankTracking.json();
    assert('rank tracking snapshot route reads PC tracking stores',
      rankTracking.status === 200
        && rankTrackingJson.ok === true
        && rankTrackingJson.snapshot.configured === true
        && rankTrackingJson.snapshot.posts.items[0].currentRank === 7
        && rankTrackingJson.snapshot.keywords.items[0].latestDocCount === 1610
        && rankTrackingJson.snapshot.totals.alerts === 1);

    const manualAdd = await fetch(`${rankBaseUrl}${MOBILE_RANK_TRACKING_ROUTES.manual}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyword: 'rank api manual',
        postUrl: 'https://blog.naver.com/leword/223000000002',
        postTitle: 'rank api manual title',
        category: 'api-manual',
      }),
    });
    const manualAddJson: any = await manualAdd.json();
    assert('rank tracking manual route writes to PC exposure tracking store',
      manualAdd.status === 201
        && manualAddJson.result.success === true
        && manualAddJson.result.totalTracked === 2
        && manualAddJson.result.snapshot.posts.items.some((item: any) => item.keyword === 'rank api manual'));

    const proPostAdd = await fetch(`${rankBaseUrl}${MOBILE_RANK_TRACKING_ROUTES.proPost}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyword: 'rank api pro tracked',
        postUrl: 'https://blog.naver.com/leword/223000000020',
        predictedRank: 8,
        keywords: ['rank api pro tracked', 'api secondary keyword'],
      }),
    });
    const proPostAddJson: any = await proPostAdd.json();
    assert('rank tracking PRO post route writes to PC pro tracking store',
      proPostAdd.status === 201
        && proPostAddJson.result.success === true
        && proPostAddJson.result.action === 'pro-post-add'
        && proPostAddJson.result.snapshot.totals.proTrackedPosts === 1
        && proPostAddJson.result.snapshot.posts.items.some((item: any) => item.keyword === 'rank api pro tracked'
          && item.source === 'pro-hunter-v12'
          && item.predictedRank === 8
          && item.keywords.includes('api secondary keyword')));

    const proPostRemoved = await fetch(`${rankBaseUrl}${MOBILE_RANK_TRACKING_ROUTES.pair}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyword: 'rank api pro tracked',
        postUrl: 'https://blog.naver.com/leword/223000000020',
      }),
    });
    const proPostRemovedJson: any = await proPostRemoved.json();
    assert('rank tracking pair route removes PC PRO tracked posts by postUrl',
      proPostRemoved.status === 200
        && proPostRemovedJson.result.removed === 1
        && proPostRemovedJson.result.snapshot.totals.proTrackedPosts === 0);

    const dryRun = await fetch(`${rankBaseUrl}${MOBILE_RANK_TRACKING_ROUTES.run}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxItems: 1, dryRun: true }),
    });
    const dryRunJson: any = await dryRun.json();
    assert('rank tracking run route can select PC tracking targets without mutating in dry-run mode',
      dryRun.status === 202
        && dryRunJson.result.success === true
        && dryRunJson.result.action === 'run-serp-check'
        && /dry-run/.test(dryRunJson.result.message || '')
        && dryRunJson.result.snapshot.totals.exposureTrackedPairs === 2);

    const removed = await fetch(`${rankBaseUrl}${MOBILE_RANK_TRACKING_ROUTES.pair}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyword: 'rank api manual',
        postUrl: 'https://blog.naver.com/leword/223000000002',
      }),
    });
    const removedJson: any = await removed.json();
    assert('rank tracking pair route removes manual PC tracking pair',
      removed.status === 200
        && removedJson.result.removed === 1
        && !removedJson.result.snapshot.posts.items.some((item: any) => item.keyword === 'rank api manual'));

    const proOutcomes = await fetch(`${rankBaseUrl}${MOBILE_PRO_OUTCOME_ROUTES.snapshot}`);
    const proOutcomesJson: any = await proOutcomes.json();
    assert('PRO outcomes route reads PC outcome benchmark store',
      proOutcomes.status === 200
        && proOutcomesJson.ok === true
        && proOutcomesJson.snapshot.totalRecords === 1
        && proOutcomesJson.snapshot.benchmark.avgPredictionAccuracy === 100
        && proOutcomesJson.snapshot.items[0].actualMonthlyRevenue === 54000);

    const recordedOutcome = await fetch(`${rankBaseUrl}${MOBILE_PRO_OUTCOME_ROUTES.record}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postUrl: 'https://blog.naver.com/leword/223000000003',
        keyword: 'mobile api outcome',
        category: 'it',
        predictedRank: 4,
        predictedTraffic: 900,
        actualRank: 5,
        actualMonthlyViews: 1200,
        actualMonthlyRevenue: 36000,
        firstExposureDays: 3,
        notes: 'api recorded',
      }),
    });
    const recordedOutcomeJson: any = await recordedOutcome.json();
    assert('PRO outcome record route writes PC outcome store',
      recordedOutcome.status === 201
        && recordedOutcomeJson.result.success === true
        && recordedOutcomeJson.result.record.keyword === 'mobile api outcome'
        && recordedOutcomeJson.result.snapshot.totalRecords === 2);

    const deletedOutcome = await fetch(`${rankBaseUrl}${MOBILE_PRO_OUTCOME_ROUTES.item}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postUrl: 'https://blog.naver.com/leword/223000000003' }),
    });
    const deletedOutcomeJson: any = await deletedOutcome.json();
    assert('PRO outcome delete route removes one PC outcome record',
      deletedOutcome.status === 200
        && deletedOutcomeJson.result.removed === 1
        && deletedOutcomeJson.result.snapshot.totalRecords === 1);

    const trackingStore = JSON.parse(fs.readFileSync(rankProTrackingFile, 'utf8'));
    trackingStore.posts['https://blog.naver.com/leword/223000000004'] = {
      postUrl: 'https://blog.naver.com/leword/223000000004',
      keyword: 'mobile api synced rank',
      registeredAt: Date.parse('2026-06-01T00:00:00.000Z'),
      lastCheckedAt: Date.parse('2026-06-04T00:00:00.000Z'),
      predictedRank: 8,
      history: [
        { ts: Date.parse('2026-06-03T00:00:00.000Z'), rank: 10, checked: true },
        { ts: Date.parse('2026-06-04T00:00:00.000Z'), rank: 6, checked: true },
      ],
    };
    writeJson(rankProTrackingFile, trackingStore);

    const syncedOutcomes = await fetch(`${rankBaseUrl}${MOBILE_PRO_OUTCOME_ROUTES.sync}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const syncedOutcomesJson: any = await syncedOutcomes.json();
    assert('PRO outcome sync route absorbs ranked PRO tracked posts',
      syncedOutcomes.status === 202
        && syncedOutcomesJson.result.synced === 1
        && syncedOutcomesJson.result.snapshot.items.some((item: any) => item.keyword === 'mobile api synced rank'
          && item.actualRank === 6
          && item.firstExposureDays === 2));
  } finally {
    await close(rankServer);
    if (oldRankEnv.tracked === undefined) delete process.env['LEWORD_EXPOSURE_TRACKED_FILE'];
    else process.env['LEWORD_EXPOSURE_TRACKED_FILE'] = oldRankEnv.tracked;
    if (oldRankEnv.keywordHistory === undefined) delete process.env['LEWORD_EXPOSURE_KEYWORD_HISTORY_FILE'];
    else process.env['LEWORD_EXPOSURE_KEYWORD_HISTORY_FILE'] = oldRankEnv.keywordHistory;
    if (oldRankEnv.config === undefined) delete process.env['LEWORD_EXPOSURE_CONFIG_FILE'];
    else process.env['LEWORD_EXPOSURE_CONFIG_FILE'] = oldRankEnv.config;
    if (oldRankEnv.pro === undefined) delete process.env['LEWORD_PRO_TRACKING_FILE'];
    else process.env['LEWORD_PRO_TRACKING_FILE'] = oldRankEnv.pro;
    if (oldRankEnv.outcomes === undefined) delete process.env['LEWORD_PRO_OUTCOMES_FILE'];
    else process.env['LEWORD_PRO_OUTCOMES_FILE'] = oldRankEnv.outcomes;
    fs.rmSync(rankDir, { recursive: true, force: true });
  }

  const keywordGroupsFile = path.join(os.tmpdir(), `leword-keyword-groups-${Date.now()}.json`);
  const oldKeywordGroupsFile = process.env['LEWORD_KEYWORD_GROUPS_FILE'];
  process.env['LEWORD_KEYWORD_GROUPS_FILE'] = keywordGroupsFile;
  const keywordGroupServer = createLewordApiServer({ executor, entitlementVerifier: null });
  const keywordGroupPort = await listen(keywordGroupServer);
  const keywordGroupBaseUrl = `http://127.0.0.1:${keywordGroupPort}`;

  try {
    const emptyList = await fetch(`${keywordGroupBaseUrl}${MOBILE_KEYWORD_GROUP_ROUTES.list}`);
    const emptyListJson: any = await emptyList.json();
    assert('keyword groups list starts empty',
      emptyList.status === 200
        && emptyListJson.snapshot.storage === 'pc-keyword-groups-json'
        && emptyListJson.snapshot.total === 0);

    const createdGroup = await fetch(`${keywordGroupBaseUrl}${MOBILE_KEYWORD_GROUP_ROUTES.list}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'summer dress candidates',
        keywords: ['linen dress', 'linen dress'],
        seedKeyword: 'summer dress',
      }),
    });
    const createdGroupJson: any = await createdGroup.json();
    assert('keyword group can be created from mobile',
      createdGroup.status === 201
        && createdGroupJson.group.id.startsWith('mobile_group_')
        && createdGroupJson.group.keywordCount === 2
        && createdGroupJson.snapshot.total === 1);

    const groupId = createdGroupJson.group.id;
    const groupItemRoute = MOBILE_KEYWORD_GROUP_ROUTES.item.replace(':id', encodeURIComponent(groupId));
    const updatedGroup = await fetch(`${keywordGroupBaseUrl}${groupItemRoute}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'summer dress final',
        keywords: ['linen dress', 'resort dress'],
      }),
    });
    const updatedGroupJson: any = await updatedGroup.json();
    assert('keyword group can be updated from mobile',
      updatedGroup.status === 200
        && updatedGroupJson.group.name === 'summer dress final'
        && updatedGroupJson.group.keywordCount === 2);

    const deletedGroup = await fetch(`${keywordGroupBaseUrl}${groupItemRoute}`, { method: 'DELETE' });
    const deletedGroupJson: any = await deletedGroup.json();
    assert('keyword group can be deleted from mobile',
      deletedGroup.status === 200 && deletedGroupJson.snapshot.total === 0);
  } finally {
    await close(keywordGroupServer);
    if (oldKeywordGroupsFile === undefined) {
      delete process.env['LEWORD_KEYWORD_GROUPS_FILE'];
    } else {
      process.env['LEWORD_KEYWORD_GROUPS_FILE'] = oldKeywordGroupsFile;
    }
    fs.rmSync(keywordGroupsFile, { force: true });
  }

  console.log('[mobile-api-server-keyword-groups.test] passed');

  const scheduleTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-mobile-api-schedule-'));
  const scheduleEnv = {
    schedules: process.env['LEWORD_SCHEDULES_FILE'],
    notifications: process.env['LEWORD_NOTIFICATIONS_FILE'],
    history: process.env['LEWORD_KEYWORD_HISTORY_FILE'],
    groups: process.env['LEWORD_KEYWORD_GROUPS_FILE'],
  };
  process.env['LEWORD_SCHEDULES_FILE'] = path.join(scheduleTmpDir, 'schedules.json');
  process.env['LEWORD_NOTIFICATIONS_FILE'] = path.join(scheduleTmpDir, 'keyword-notifications.json');
  process.env['LEWORD_KEYWORD_HISTORY_FILE'] = path.join(scheduleTmpDir, 'keyword-history.json');
  process.env['LEWORD_KEYWORD_GROUPS_FILE'] = path.join(scheduleTmpDir, 'keyword-groups.json');
  fs.writeFileSync(process.env['LEWORD_SCHEDULES_FILE'], JSON.stringify([
    {
      id: 'api-s1',
      topic: 'schedule dashboard fixture',
      keywords: ['schedule dashboard fixture'],
      scheduleDateTime: '2026-06-06T10:00:00.000Z',
      status: 'pending',
      platform: 'blogger',
      createdAt: '2026-06-05T10:00:00.000Z',
    },
  ]), 'utf8');
  fs.writeFileSync(process.env['LEWORD_NOTIFICATIONS_FILE'], JSON.stringify({
    enabled: true,
    keywords: ['schedule dashboard fixture'],
    settings: { mobilePush: true },
  }), 'utf8');
  fs.writeFileSync(process.env['LEWORD_KEYWORD_HISTORY_FILE'], JSON.stringify([
    { type: 'trend', keyword: 'schedule trend', date: '2026-06-06' },
  ]), 'utf8');
  fs.writeFileSync(process.env['LEWORD_KEYWORD_GROUPS_FILE'], JSON.stringify([
    { id: 'api-g1', name: 'schedule group', keywords: ['schedule dashboard fixture'] },
  ]), 'utf8');
  const scheduleServer = createLewordApiServer({ executor, entitlementVerifier: null });
  const schedulePort = await listen(scheduleServer);
  const scheduleBaseUrl = `http://127.0.0.1:${schedulePort}`;

  try {
    const scheduleDashboard = await fetch(`${scheduleBaseUrl}${MOBILE_SCHEDULE_ROUTES.dashboard}`);
    const scheduleDashboardJson: any = await scheduleDashboard.json();
    assert('mobile schedule dashboard route works',
      scheduleDashboard.status === 200
        && scheduleDashboardJson.ok === true
        && scheduleDashboardJson.snapshot.schedules.total === 1
        && scheduleDashboardJson.snapshot.notifications.enabled === true
        && scheduleDashboardJson.snapshot.groups.total === 1,
      JSON.stringify(scheduleDashboardJson));

    const createdSchedule = await fetch(`${scheduleBaseUrl}${MOBILE_SCHEDULE_ROUTES.list}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyword: 'api mobile schedule',
        scheduleDateTime: '2026-06-09T09:30:00.000Z',
        platform: 'blogger',
      }),
    });
    const createdScheduleJson: any = await createdSchedule.json();
    assert('mobile keyword schedule can be created',
      createdSchedule.status === 201
        && createdScheduleJson.schedule.id.startsWith('mobile_schedule_')
        && createdScheduleJson.schedule.status === 'pending'
        && createdScheduleJson.snapshot.schedules.total === 2);

    const scheduleId = createdScheduleJson.schedule.id;
    const scheduleItemRoute = MOBILE_SCHEDULE_ROUTES.item.replace(':id', encodeURIComponent(scheduleId));
    const disabledSchedule = await fetch(`${scheduleBaseUrl}${scheduleItemRoute}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    const disabledScheduleJson: any = await disabledSchedule.json();
    assert('mobile keyword schedule can be disabled',
      disabledSchedule.status === 200
        && disabledScheduleJson.schedule.status === 'cancelled'
        && disabledScheduleJson.snapshot.schedules.cancelled === 1);

    const enabledSchedule = await fetch(`${scheduleBaseUrl}${scheduleItemRoute}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    const enabledScheduleJson: any = await enabledSchedule.json();
    assert('mobile keyword schedule can be re-enabled',
      enabledSchedule.status === 200
        && enabledScheduleJson.schedule.status === 'pending'
        && enabledScheduleJson.snapshot.schedules.pending === 2);

    const editedSchedule = await fetch(`${scheduleBaseUrl}${scheduleItemRoute}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyword: 'api mobile schedule edited',
        topic: 'api mobile schedule edited',
        keywords: ['api mobile schedule edited', 'api schedule detail'],
        scheduleDateTime: '2026-06-10T10:15:00.000Z',
        platform: 'wordpress',
        publishType: 'schedule',
        enabled: true,
      }),
    });
    const editedScheduleJson: any = await editedSchedule.json();
    assert('mobile keyword schedule can be edited',
      editedSchedule.status === 200
        && editedScheduleJson.schedule.keyword === 'api mobile schedule edited'
        && editedScheduleJson.schedule.scheduleDateTime === '2026-06-10T10:15:00.000Z'
        && editedScheduleJson.schedule.platform === 'wordpress'
        && editedScheduleJson.schedule.keywords.includes('api schedule detail'));

    const deletedSchedule = await fetch(`${scheduleBaseUrl}${scheduleItemRoute}`, { method: 'DELETE' });
    const deletedScheduleJson: any = await deletedSchedule.json();
    assert('mobile keyword schedule can be deleted',
      deletedSchedule.status === 200
        && deletedScheduleJson.schedule.id === scheduleId
        && deletedScheduleJson.snapshot.schedules.total === 1);

    const missingScheduleDelete = await fetch(`${scheduleBaseUrl}${scheduleItemRoute}`, { method: 'DELETE' });
    assert('missing mobile keyword schedule delete returns 404', missingScheduleDelete.status === 404);
  } finally {
    await close(scheduleServer);
    if (scheduleEnv.schedules === undefined) delete process.env['LEWORD_SCHEDULES_FILE'];
    else process.env['LEWORD_SCHEDULES_FILE'] = scheduleEnv.schedules;
    if (scheduleEnv.notifications === undefined) delete process.env['LEWORD_NOTIFICATIONS_FILE'];
    else process.env['LEWORD_NOTIFICATIONS_FILE'] = scheduleEnv.notifications;
    if (scheduleEnv.history === undefined) delete process.env['LEWORD_KEYWORD_HISTORY_FILE'];
    else process.env['LEWORD_KEYWORD_HISTORY_FILE'] = scheduleEnv.history;
    if (scheduleEnv.groups === undefined) delete process.env['LEWORD_KEYWORD_GROUPS_FILE'];
    else process.env['LEWORD_KEYWORD_GROUPS_FILE'] = scheduleEnv.groups;
    fs.rmSync(scheduleTmpDir, { recursive: true, force: true });
  }

  console.log('[mobile-api-server-schedule-dashboard.test] passed');

  const authServer = createLewordApiServer({ executor, authToken: 'mobile-secret' });
  const authPort = await listen(authServer);
  const authBaseUrl = `http://127.0.0.1:${authPort}`;

  try {
    const health = await fetch(`${authBaseUrl}/health`);
    assert('auth health remains public', health.ok);

    const rejected = await fetch(`${authBaseUrl}/v1/golden/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId: 'policy', targetCount: 30 }),
    });
    assert('auth rejects missing bearer token', rejected.status === 401);

    const accepted = await fetch(`${authBaseUrl}/v1/golden/discover`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer mobile-secret',
      },
      body: JSON.stringify({ categoryId: 'policy', targetCount: 30 }),
    });
    const acceptedJson: any = await accepted.json();
    assert('auth accepts valid bearer token', accepted.status === 202 && acceptedJson.ok === true);
  } finally {
    await close(authServer);
  }

  console.log('[mobile-api-server-auth.test] passed');

  const previousAdminSettingsPasswordHash = process.env.LEWORD_ADMIN_SETTINGS_PASSWORD_SHA256;
  const adminSettingsTestPassword = 'test-admin-settings-password';
  process.env.LEWORD_ADMIN_SETTINGS_PASSWORD_SHA256 = crypto
    .createHash('sha256')
    .update(adminSettingsTestPassword, 'utf8')
    .digest('hex');

  const entitlementServer = createLewordApiServer({
    executor,
    entitlementVerifier: async (token) => {
      if (token === 'standard-user') {
        return {
          ok: true,
          entitlement: {
            subjectId: 'user-standard',
            tier: 'standard',
            source: 'fixture',
          },
        };
      }
      if (token === 'pro-user') {
        return {
          ok: true,
          entitlement: {
            subjectId: 'user-pro',
            tier: 'pro',
            source: 'fixture',
          },
        };
      }
      if (token === 'admin-user') {
        return {
          ok: true,
          entitlement: {
            subjectId: 'user-admin',
            tier: 'admin',
            source: 'fixture',
          },
        };
      }
      return { ok: false, reason: 'invalid mobile session' };
    },
  });
  const entitlementPort = await listen(entitlementServer);
  const entitlementBaseUrl = `http://127.0.0.1:${entitlementPort}`;

  try {
    const standardKeyword = await fetch(`${entitlementBaseUrl}/v1/keywords/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer standard-user',
      },
      body: JSON.stringify({ keyword: '근로장려금', maxRelatedCount: 10 }),
    });
    assert('standard entitlement can run keyword analysis', standardKeyword.status === 202);

    const standardPro = await fetch(`${entitlementBaseUrl}/v1/pro/hunt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer standard-user',
      },
      body: JSON.stringify({ categoryId: 'policy', targetCount: 250 }),
    });
    assert('standard entitlement cannot run PRO hunter', standardPro.status === 403);

    const proHunter = await fetch(`${entitlementBaseUrl}/v1/pro/hunt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer pro-user',
      },
      body: JSON.stringify({ categoryId: 'policy', targetCount: 250 }),
    });
    assert('pro entitlement can run PRO hunter', proHunter.status === 202);

    const proPrewarm = await fetch(`${entitlementBaseUrl}/v1/prewarm/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer pro-user',
      },
      body: JSON.stringify({ limit: 1 }),
    });
    assert('prewarm run is admin-only', proPrewarm.status === 403);

    const adminPrewarm = await fetch(`${entitlementBaseUrl}/v1/prewarm/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer admin-user',
      },
      body: JSON.stringify({ limit: 1 }),
    });
    assert('admin entitlement can run prewarm', adminPrewarm.status === 202);

    const proAdminUnlock = await fetch(`${entitlementBaseUrl}/v1/admin/settings/unlock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer pro-user',
      },
      body: JSON.stringify({ password: adminSettingsTestPassword }),
    });
    assert('admin settings unlock is admin-only', proAdminUnlock.status === 403);

    const wrongAdminUnlock = await fetch(`${entitlementBaseUrl}/v1/admin/settings/unlock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer admin-user',
      },
      body: JSON.stringify({ password: 'wrong-password' }),
    });
    assert('admin settings unlock rejects wrong password without ending admin session', wrongAdminUnlock.status === 400);

    const adminUnlock = await fetch(`${entitlementBaseUrl}/v1/admin/settings/unlock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer admin-user',
      },
      body: JSON.stringify({ password: adminSettingsTestPassword }),
    });
    const adminUnlockPayload: any = await adminUnlock.json();
    assert('admin settings unlock accepts admin password', adminUnlock.status === 200 && adminUnlockPayload.unlocked === true);
  } finally {
    await close(entitlementServer);
    if (previousAdminSettingsPasswordHash === undefined) delete process.env.LEWORD_ADMIN_SETTINGS_PASSWORD_SHA256;
    else process.env.LEWORD_ADMIN_SETTINGS_PASSWORD_SHA256 = previousAdminSettingsPasswordHash;
  }

  console.log('[mobile-api-server-entitlement.test] passed');

  const licenseService = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/mobile/entitlement') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false }));
      return;
    }

    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      const payload = JSON.parse(raw || '{}');
      const token = payload.token;
      if (token === 'remote-pro') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          subjectId: 'remote-user-pro',
          tier: 'pro',
          expiresAt: null,
        }));
        return;
      }
      if (token === 'remote-admin') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          subjectId: 'remote-user-admin',
          tier: 'admin',
          expiresAt: null,
        }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, reason: 'invalid remote token' }));
    });
  });
  const licensePort = await listen(licenseService);
  const remoteEntitlementServer = createLewordApiServer({
    executor,
    entitlementVerifier: createHttpMobileEntitlementVerifier({
      url: `http://127.0.0.1:${licensePort}/mobile/entitlement`,
      timeoutMs: 2000,
    }),
  });
  const remotePort = await listen(remoteEntitlementServer);
  const remoteBaseUrl = `http://127.0.0.1:${remotePort}`;

  try {
    const rejected = await fetch(`${remoteBaseUrl}/v1/pro/hunt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer remote-standard',
      },
      body: JSON.stringify({ categoryId: 'policy', targetCount: 250 }),
    });
    assert('remote entitlement rejects invalid user token', rejected.status === 401);

    const accepted = await fetch(`${remoteBaseUrl}/v1/pro/hunt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer remote-pro',
      },
      body: JSON.stringify({ categoryId: 'policy', targetCount: 250 }),
    });
    assert('remote entitlement can unlock PRO products', accepted.status === 202);

    const adminPrewarm = await fetch(`${remoteBaseUrl}/v1/prewarm/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer remote-admin',
      },
      body: JSON.stringify({ limit: 1 }),
    });
    assert('remote entitlement can unlock admin prewarm', adminPrewarm.status === 202);
  } finally {
    await close(remoteEntitlementServer);
    await close(licenseService);
  }

  console.log('[mobile-api-server-remote-entitlement.test] passed');

  const panelLoginRequests: any[] = [];
  const panelLoginService = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/mobile/session') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false }));
      return;
    }

    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      const payload = JSON.parse(raw || '{}');
      panelLoginRequests.push(payload);
      assert('panel receives mobile user id', payload.userId === 'panel-user');
      assert('panel receives mobile password alias', payload.userPassword === 'panel-pass');
      const responsePayload: any = {
        ok: true,
        userId: 'panel-user',
        plan: 'pro',
        apiBaseUrl: 'http://192.168.0.10:34983',
        message: 'panel linked this device to the PC API',
      };
      if (payload.action === 'register') {
        responsePayload.mobileToken = 'panel-issued-token';
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(responsePayload));
    });
  });
  const panelLoginPort = await listen(panelLoginService);
  const panelAuthServer = createLewordApiServer({ executor, authToken: 'panel-static-token' });
  const panelAuthPort = await listen(panelAuthServer);
  const panelAuthBaseUrl = `http://127.0.0.1:${panelAuthPort}`;
  const previousPanelLoginUrl = process.env['LEWORD_MOBILE_PANEL_LOGIN_URL'];

  try {
    const login = await fetch(`${panelAuthBaseUrl}/v1/mobile/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'panel-user',
        password: 'panel-pass',
        licenseCode: 'LEWORD-PANEL',
        panelServerUrl: `http://127.0.0.1:${panelLoginPort}/mobile/session`,
      }),
    });
    const loginJson: any = await login.json();
    assert('panel login creates session', login.status === 200 && loginJson.ok === true);
    assert('license code login uses register action',
      panelLoginRequests[0].action === 'register'
        && panelLoginRequests[0].licenseCode === 'LEWORD-PANEL'
        && panelLoginRequests[0].code === 'LEWORD-PANEL');
    assert('panel login uses existing PC license app id',
      panelLoginRequests[0].appId === 'com.leword.keyword.master');
    assert('panel token becomes mobile access token', loginJson.session.accessToken === 'panel-issued-token');
    assert('panel plan normalizes to pro tier', loginJson.session.tier === 'pro');
    assert('panel-provided PC API URL becomes session API URL',
      loginJson.session.apiBaseUrl === 'http://192.168.0.10:34983',
      loginJson.session.apiBaseUrl);
    assert('dashboard follows linked PC API URL',
      loginJson.session.dashboard.apiBaseUrl === 'http://192.168.0.10:34983',
      loginJson.session.dashboard.apiBaseUrl);
    assert('panel login marks source metadata',
      loginJson.session.source === 'panel-server' && typeof loginJson.session.linkedAt === 'string');

    process.env['LEWORD_MOBILE_PANEL_LOGIN_URL'] = `http://127.0.0.1:${panelLoginPort}/mobile/session`;
    const existingLogin = await fetch(`${panelAuthBaseUrl}/v1/mobile/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'panel-user',
        password: 'panel-pass',
      }),
    });
    const existingLoginJson: any = await existingLogin.json();
    assert('existing panel account logs in without license code',
      existingLogin.status === 200 && existingLoginJson.ok === true);
    assert('existing login uses credential verification without blank license fields',
      panelLoginRequests[1].action === 'verify-credentials'
        && !Object.prototype.hasOwnProperty.call(panelLoginRequests[1], 'licenseCode')
        && !Object.prototype.hasOwnProperty.call(panelLoginRequests[1], 'code'));
    assert('existing login never turns password into persisted access token',
      existingLoginJson.session.accessToken !== 'panel-pass'
        && String(existingLoginJson.session.accessToken || '').startsWith('panel-'));

    const webLogin = await fetch(`${panelAuthBaseUrl}/v1/web/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'panel-user',
        password: 'panel-pass',
      }),
    });
    const webLoginJson: any = await webLogin.json();
    assert('pro web login accepts existing user id and password only',
      webLogin.status === 200
        && webLoginJson.ok === true
        && webLoginJson.session?.userId === 'panel-user'
        && webLoginJson.session?.source === 'panel-server',
      JSON.stringify({ status: webLogin.status, body: webLoginJson }));
    assert('pro web login uses credential verification without license fields',
      panelLoginRequests[2].action === 'verify-credentials'
        && !Object.prototype.hasOwnProperty.call(panelLoginRequests[2], 'licenseCode')
        && !Object.prototype.hasOwnProperty.call(panelLoginRequests[2], 'code'));
    assert('pro web login never persists the password as token',
      webLoginJson.session.accessToken !== 'panel-pass'
        && String(webLoginJson.session.accessToken || '').startsWith('leword-web-v1.'));

    const restartedPanelAuthServer = createLewordApiServer({ executor, authToken: 'panel-static-token' });
    const restartedPanelAuthPort = await listen(restartedPanelAuthServer);
    try {
      const acceptedAfterRestart = await fetch(`http://127.0.0.1:${restartedPanelAuthPort}/v1/pro/hunt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${webLoginJson.session.accessToken}`,
        },
        body: JSON.stringify({ categoryId: 'policy', targetCount: 30 }),
      });
      assert('pro web session token survives API restart without logging out',
        acceptedAfterRestart.status === 202,
        JSON.stringify({ status: acceptedAfterRestart.status, body: await acceptedAfterRestart.text() }));
    } finally {
      await close(restartedPanelAuthServer);
    }
  } finally {
    if (previousPanelLoginUrl === undefined) {
      delete process.env['LEWORD_MOBILE_PANEL_LOGIN_URL'];
    } else {
      process.env['LEWORD_MOBILE_PANEL_LOGIN_URL'] = previousPanelLoginUrl;
    }
    await close(panelAuthServer);
    await close(panelLoginService);
  }

  console.log('[mobile-api-server-panel-login.test] passed');

  const previousConfiguredLoginEnv: Record<string, string | undefined> = {
    LEWORD_MOBILE_PANEL_LOGIN_URL: process.env['LEWORD_MOBILE_PANEL_LOGIN_URL'],
    LEWORD_WEB_LOGIN_ID: process.env['LEWORD_WEB_LOGIN_ID'],
    LEWORD_WEB_LOGIN_PASSWORD_SHA256: process.env['LEWORD_WEB_LOGIN_PASSWORD_SHA256'],
    LEWORD_WEB_LOGIN_TIER: process.env['LEWORD_WEB_LOGIN_TIER'],
    LEWORD_ADMIN_LOGIN_ID: process.env['LEWORD_ADMIN_LOGIN_ID'],
    LEWORD_ADMIN_LOGIN_PASSWORD_SHA256: process.env['LEWORD_ADMIN_LOGIN_PASSWORD_SHA256'],
    LEWORD_ADMIN_PANEL_LOGIN_ID_SHA256: process.env['LEWORD_ADMIN_PANEL_LOGIN_ID_SHA256'],
    LEWORD_ADMIN_PANEL_LOGIN_PASSWORD_SHA256: process.env['LEWORD_ADMIN_PANEL_LOGIN_PASSWORD_SHA256'],
  };
  const rejectingPanelLoginRequests: any[] = [];
  const rejectingPanelLoginService = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      rejectingPanelLoginRequests.push(raw ? JSON.parse(raw) : {});
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, message: 'fixture panel rejects configured login fallback' }));
    });
  });
  const rejectingPanelLoginPort = await listen(rejectingPanelLoginService);
  process.env['LEWORD_MOBILE_PANEL_LOGIN_URL'] = `http://127.0.0.1:${rejectingPanelLoginPort}/mobile/session`;
  process.env['LEWORD_WEB_LOGIN_ID'] = 'configured-user';
  process.env['LEWORD_WEB_LOGIN_PASSWORD_SHA256'] = crypto.createHash('sha256').update('configured-pass', 'utf8').digest('hex');
  process.env['LEWORD_WEB_LOGIN_TIER'] = 'unlimited';
  process.env['LEWORD_ADMIN_LOGIN_ID'] = 'configured-admin';
  process.env['LEWORD_ADMIN_LOGIN_PASSWORD_SHA256'] = crypto.createHash('sha256').update('configured-admin-pass', 'utf8').digest('hex');
  process.env['LEWORD_ADMIN_PANEL_LOGIN_ID_SHA256'] = crypto.createHash('sha256').update('panel-admin', 'utf8').digest('hex');
  process.env['LEWORD_ADMIN_PANEL_LOGIN_PASSWORD_SHA256'] = crypto.createHash('sha256').update('panel-admin-pass', 'utf8').digest('hex');
  const configuredAuthServer = createLewordApiServer({ executor, authToken: 'configured-static-token' });
  const configuredAuthPort = await listen(configuredAuthServer);
  const configuredAuthBaseUrl = `http://127.0.0.1:${configuredAuthPort}`;
  try {
    const configuredLogin = await fetch(`${configuredAuthBaseUrl}/v1/web/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'configured-user',
        password: 'configured-pass',
      }),
    });
    const configuredLoginJson: any = await configuredLogin.json();
    assert('configured web login accepts existing id and password without panel dependency',
      configuredLogin.status === 200
        && configuredLoginJson.ok === true
        && configuredLoginJson.session?.userId === 'configured-user'
        && configuredLoginJson.session?.tier === 'unlimited'
        && configuredLoginJson.session?.source === 'configured-web-login',
      JSON.stringify({ status: configuredLogin.status, body: configuredLoginJson }));
    assert('configured web login issues runtime token instead of storing password',
      configuredLoginJson.session.accessToken !== 'configured-pass'
        && String(configuredLoginJson.session.accessToken || '').startsWith('leword-web-v1.'));
    const restartedConfiguredAuthServer = createLewordApiServer({ executor, authToken: 'configured-static-token' });
    const restartedConfiguredAuthPort = await listen(restartedConfiguredAuthServer);
    try {
      const acceptedAfterRestart = await fetch(`http://127.0.0.1:${restartedConfiguredAuthPort}/v1/pro/hunt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${configuredLoginJson.session.accessToken}`,
        },
        body: JSON.stringify({ categoryId: 'policy', targetCount: 30 }),
      });
      assert('configured web session token survives API restart without logging out',
        acceptedAfterRestart.status === 202,
        JSON.stringify({ status: acceptedAfterRestart.status, body: await acceptedAfterRestart.text() }));
    } finally {
      await close(restartedConfiguredAuthServer);
    }
    assert('configured web login bypasses rejected panel service', rejectingPanelLoginRequests.length === 0);

    const rejectedConfiguredLogin = await fetch(`${configuredAuthBaseUrl}/v1/web/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'configured-user',
        password: 'wrong-configured-pass',
      }),
    });
    const rejectedConfiguredLoginJson: any = await rejectedConfiguredLogin.json();
    assert('configured web login hides panel/raw unauthorized messages on rejection',
      rejectedConfiguredLogin.status === 401
        && rejectedConfiguredLoginJson.ok === false
        && rejectedConfiguredLoginJson.message === '아이디 또는 비밀번호가 맞지 않습니다. 자동완성 값이 들어갔다면 지우고 다시 입력하세요.',
      JSON.stringify({ status: rejectedConfiguredLogin.status, body: rejectedConfiguredLoginJson }));

    const configuredAdminLogin = await fetch(`${configuredAuthBaseUrl}/v1/web/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'configured-admin',
        password: 'configured-admin-pass',
        adminLogin: true,
      }),
    });
    const configuredAdminLoginJson: any = await configuredAdminLogin.json();
    assert('configured admin login is separate and returns admin tier only for admin login',
      configuredAdminLogin.status === 200
        && configuredAdminLoginJson.ok === true
        && configuredAdminLoginJson.session?.tier === 'admin'
        && configuredAdminLoginJson.session?.source === 'configured-web-login',
      JSON.stringify({ status: configuredAdminLogin.status, body: configuredAdminLoginJson }));

    const configuredPanelAdminLogin = await fetch(`${configuredAuthBaseUrl}/v1/web/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'panel-admin',
        password: 'panel-admin-pass',
        adminLogin: true,
      }),
    });
    const configuredPanelAdminLoginJson: any = await configuredPanelAdminLogin.json();
    assert('configured admin panel hash login returns admin session without a separate remembered id',
      configuredPanelAdminLogin.status === 200
        && configuredPanelAdminLoginJson.ok === true
        && configuredPanelAdminLoginJson.session?.userId === 'panel-admin'
        && configuredPanelAdminLoginJson.session?.tier === 'admin'
        && configuredPanelAdminLoginJson.session?.source === 'configured-web-login',
      JSON.stringify({ status: configuredPanelAdminLogin.status, body: configuredPanelAdminLoginJson }));
  } finally {
    for (const [key, value] of Object.entries(previousConfiguredLoginEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await close(configuredAuthServer);
    await close(rejectingPanelLoginService);
  }

  console.log('[mobile-api-server-configured-web-login.test] passed');

  const scheduler = new MobilePrewarmScheduler({
    service: {
      runOnce: async () => ({
        running: false,
        updatedAt: new Date(0).toISOString(),
        completed: 1,
        failed: 0,
        cacheHits: 0,
        targets: [],
      }),
      snapshot: () => ({
        running: false,
        updatedAt: new Date(0).toISOString(),
        completed: 0,
        failed: 0,
        cacheHits: 0,
        targets: [],
      }),
    },
    intervalMs: 60_000,
    runOnStart: false,
    setIntervalFn: () => 'health-timer',
    clearIntervalFn: () => undefined,
  });
  const schedulerServer = createLewordApiServer({
    executor,
    entitlementVerifier: null,
    resultCache: new InMemoryMobileResultCache(),
    prewarmScheduler: scheduler,
  });
  const schedulerPort = await listen(schedulerServer);
  const schedulerBaseUrl = `http://127.0.0.1:${schedulerPort}`;

  try {
    const health = await fetch(`${schedulerBaseUrl}/health`);
    const healthJson: any = await health.json();
    assert('health exposes prewarm scheduler',
      healthJson.prewarm.scheduler.enabled === true
        && healthJson.prewarm.scheduler.intervalMs === 60_000);
  } finally {
    await close(schedulerServer);
  }

  console.log('[mobile-api-server-prewarm-scheduler.test] passed');

  let executionCount = 0;
  const cacheServer = createLewordApiServer({
    entitlementVerifier: null,
    resultCache: new InMemoryMobileResultCache(),
    executor: async () => {
      executionCount += 1;
      return {
        ...result,
        keywords: [{
          keyword: '고유가 지원금 2차 신청방법',
          grade: 'SSS',
          pcSearchVolume: 1000,
          mobileSearchVolume: 500,
          totalSearchVolume: 1500,
          documentCount: 100,
          goldenRatio: 15,
          cpc: 120,
          category: 'policy',
          source: 'fixture',
          intent: '신청방법',
          evidence: ['fixture cache result'],
          isMeasured: true,
        }],
        summary: {
          total: 1,
          sss: 1,
          measured: 1,
          elapsedMs: 50,
          fromCache: false,
          parityMode: 'pc-engine',
        },
      };
    },
  });
  const cachePort = await listen(cacheServer);
  const cacheBaseUrl = `http://127.0.0.1:${cachePort}`;
  const cacheBody = {
    keyword: '고유가 지원금 2차',
    maxRelatedCount: 10,
    includeMindmapPreview: true,
  };

  try {
    const first = await fetch(`${cacheBaseUrl}/v1/keywords/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cacheBody),
    });
    const firstJson: any = await first.json();
    assert('first cacheable job accepted', first.status === 202 && firstJson.ok === true);
    await waitForCompletedJob(cacheBaseUrl, firstJson.job.id);

    const second = await fetch(`${cacheBaseUrl}/v1/keywords/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ includeMindmapPreview: true, maxRelatedCount: 10, keyword: '고유가 지원금 2차' }),
    });
    const secondJson: any = await second.json();
    assert('second identical job is served completed from cache',
      second.status === 202
        && secondJson.job.state === 'completed'
        && secondJson.job.result.summary.fromCache === true);
    assert('cache prevents duplicate PC worker execution', executionCount === 1, String(executionCount));

    const health = await fetch(`${cacheBaseUrl}/health`);
    const healthJson: any = await health.json();
    assert('health exposes cache state', healthJson.cache.enabled === true && healthJson.cache.size === 1);
  } finally {
    await close(cacheServer);
  }

  console.log('[mobile-api-server-cache.test] passed');

  const proTrafficPrewarmCache = new InMemoryMobileResultCache();
  proTrafficPrewarmCache.set('pro-traffic-hunter', {
    qualityProfile: 'publishable-v2',
    categoryId: 'all',
    targetCount: 30,
    includeSeasonal: true,
    includeEvergreen: true,
    includeFreshIssue: true,
    autoDiscovery: true,
    includeAiInference: true,
  }, {
    ...result,
    keywords: Array.from({ length: 30 }, (_, index) => ({
      keyword: index === 0 ? 'server prewarmed pro traffic keyword' : `server prewarmed pro traffic keyword ${index + 1}`,
      grade: 'SSS' as const,
      pcSearchVolume: 900 + index,
      mobileSearchVolume: 2200 + index,
      totalSearchVolume: 3100 + index * 2,
      documentCount: 80 + index,
      goldenRatio: 38.75,
      cpc: 210,
      category: 'pro-traffic',
      source: 'prewarm-fixture',
      intent: 'prewarmed',
      evidence: ['pro traffic prewarm fixture'],
      isMeasured: true,
    })),
    summary: {
      total: 30,
      sss: 30,
      measured: 30,
      elapsedMs: 7,
      fromCache: false,
      parityMode: 'pc-engine',
    },
  });
  let proTrafficExecutorCalls = 0;
  const proTrafficCacheServer = createLewordApiServer({
    entitlementVerifier: null,
    resultCache: proTrafficPrewarmCache,
    executor: async () => {
      proTrafficExecutorCalls += 1;
      return result;
    },
  });
  const proTrafficCachePort = await listen(proTrafficCacheServer);
  const proTrafficCacheBaseUrl = `http://127.0.0.1:${proTrafficCachePort}`;

  try {
    const cachedProTraffic = await fetch(`${proTrafficCacheBaseUrl}/v1/pro/hunt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categoryId: 'all',
        targetCount: 30,
        includeSeasonal: true,
        includeEvergreen: true,
        includeFreshIssue: true,
        autoDiscovery: true,
        includeAiInference: true,
        contextKeywords: ['volatile browser-side context'],
        apiCredentials: {
          naverClientId: 'user-client-id',
          naverClientSecret: 'user-client-secret',
        },
      }),
    });
    const cachedProTrafficJson: any = await cachedProTraffic.json();
    assert('prewarmed pro traffic job is served completed despite volatile web context',
      cachedProTraffic.status === 202
        && cachedProTrafficJson.job.state === 'completed'
        && cachedProTrafficJson.job.result.summary.fromCache === true
        && cachedProTrafficJson.job.result.keywords[0].keyword === 'server prewarmed pro traffic keyword',
      JSON.stringify(cachedProTrafficJson));
    assert('prewarmed pro traffic cache avoids duplicate PC worker execution',
      proTrafficExecutorCalls === 0,
      String(proTrafficExecutorCalls));
  } finally {
    await close(proTrafficCacheServer);
  }

  console.log('[mobile-api-server-pro-traffic-prewarm-cache.test] passed');

  const shallowProTrafficPrewarmCache = new InMemoryMobileResultCache();
  shallowProTrafficPrewarmCache.set('pro-traffic-hunter', {
    qualityProfile: 'publishable-v2',
    categoryId: 'all',
    targetCount: 60,
    includeSeasonal: true,
    includeEvergreen: true,
    includeFreshIssue: true,
    autoDiscovery: true,
    includeAiInference: true,
  }, {
    ...result,
    keywords: Array.from({ length: 30 }, (_, index) => ({
      keyword: `shallow prewarmed pro traffic keyword ${index + 1}`,
      grade: 'SSS' as const,
      pcSearchVolume: 900 + index,
      mobileSearchVolume: 2200 + index,
      totalSearchVolume: 3100 + index * 2,
      documentCount: 80 + index,
      goldenRatio: 38.75,
      cpc: 210,
      category: 'pro-traffic',
      source: 'prewarm-fixture',
      intent: 'prewarmed',
      evidence: ['pro traffic shallow prewarm fixture'],
      isMeasured: true,
    })),
    summary: {
      total: 30,
      sss: 30,
      measured: 30,
      elapsedMs: 7,
      fromCache: false,
      parityMode: 'pc-engine',
    },
  });
  let shallowProTrafficExecutorCalls = 0;
  const shallowProTrafficCacheServer = createLewordApiServer({
    entitlementVerifier: null,
    resultCache: shallowProTrafficPrewarmCache,
    executor: async () => {
      shallowProTrafficExecutorCalls += 1;
      return {
        ...result,
        keywords: Array.from({ length: 60 }, (_, index) => ({
          keyword: `fresh expanded pro traffic keyword ${index + 1}`,
          grade: 'SSS' as const,
          pcSearchVolume: 1200 + index,
          mobileSearchVolume: 3300 + index,
          totalSearchVolume: 4500 + index * 2,
          documentCount: 90 + index,
          goldenRatio: 50,
          cpc: 210,
          category: 'pro-traffic',
          source: 'fresh-fixture',
          intent: 'measured',
          evidence: ['fresh expanded fixture'],
          isMeasured: true,
        })),
        summary: {
          total: 60,
          sss: 60,
          measured: 60,
          elapsedMs: 10,
          fromCache: false,
          parityMode: 'pc-engine',
        },
      };
    },
  });
  const shallowProTrafficCachePort = await listen(shallowProTrafficCacheServer);
  const shallowProTrafficCacheBaseUrl = `http://127.0.0.1:${shallowProTrafficCachePort}`;

  try {
    const shallowProTraffic = await fetch(`${shallowProTrafficCacheBaseUrl}/v1/pro/hunt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categoryId: 'all',
        targetCount: 60,
        includeSeasonal: true,
        includeEvergreen: true,
        includeFreshIssue: true,
        autoDiscovery: true,
        includeAiInference: true,
      }),
    });
    const shallowProTrafficJson: any = await shallowProTraffic.json();
    assert('shallow 30-item pro traffic cache does not satisfy a 60-item Pro request',
      shallowProTraffic.status === 202
        && shallowProTrafficJson.job.state !== 'completed',
      JSON.stringify(shallowProTrafficJson));
    const shallowJob = await waitForCompletedJob(shallowProTrafficCacheBaseUrl, shallowProTrafficJson.job.id);
    assert('shallow pro traffic cache triggers fresh 60-item execution',
      shallowProTrafficExecutorCalls === 1
        && shallowJob.result.keywords.length === 60
        && shallowJob.result.summary.measured === 60,
      JSON.stringify({ shallowJob, shallowProTrafficExecutorCalls }));
  } finally {
    await close(shallowProTrafficCacheServer);
  }

  console.log('[mobile-api-server-pro-traffic-shallow-cache.test] passed');

  const incompleteProTrafficCache = new InMemoryMobileResultCache();
  incompleteProTrafficCache.set('pro-traffic-hunter', {
    qualityProfile: 'publishable-v2',
    categoryId: 'all',
    targetCount: 30,
    includeSeasonal: true,
    includeEvergreen: true,
    includeFreshIssue: true,
    autoDiscovery: true,
    includeAiInference: true,
  }, {
    ...result,
    keywords: [{
      keyword: 'incomplete cached pro traffic keyword',
      grade: 'SSS',
      pcSearchVolume: 900,
      mobileSearchVolume: 2200,
      totalSearchVolume: 3100,
      documentCount: null,
      goldenRatio: 38.75,
      cpc: 210,
      category: 'pro-traffic',
      source: 'prewarm-fixture',
      intent: 'prewarmed',
      evidence: ['metric-measurement-partial-or-unavailable'],
      isMeasured: false,
    }],
    summary: {
      total: 1,
      sss: 1,
      measured: 0,
      elapsedMs: 7,
      fromCache: false,
      parityMode: 'pc-engine',
    },
  });
  let incompleteProTrafficExecutorCalls = 0;
  const incompleteProTrafficCacheServer = createLewordApiServer({
    entitlementVerifier: null,
    resultCache: incompleteProTrafficCache,
    executor: async () => {
      incompleteProTrafficExecutorCalls += 1;
      return {
        ...result,
        keywords: [{
          keyword: 'fresh measured pro traffic keyword',
          grade: 'SSS',
          pcSearchVolume: 1200,
          mobileSearchVolume: 3300,
          totalSearchVolume: 4500,
          documentCount: 90,
          goldenRatio: 50,
          cpc: 210,
          category: 'pro-traffic',
          source: 'fresh-fixture',
          intent: 'measured',
          evidence: ['fresh measured fixture'],
          isMeasured: true,
        }],
        summary: {
          total: 1,
          sss: 1,
          measured: 1,
          elapsedMs: 10,
          fromCache: false,
          parityMode: 'pc-engine',
        },
      };
    },
  });
  const incompleteProTrafficCachePort = await listen(incompleteProTrafficCacheServer);
  const incompleteProTrafficCacheBaseUrl = `http://127.0.0.1:${incompleteProTrafficCachePort}`;

  try {
    const refreshedProTraffic = await fetch(`${incompleteProTrafficCacheBaseUrl}/v1/pro/hunt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categoryId: 'all',
        targetCount: 30,
        includeSeasonal: true,
        includeEvergreen: true,
        includeFreshIssue: true,
        autoDiscovery: true,
        includeAiInference: true,
        contextKeywords: ['volatile browser-side context'],
      }),
    });
    const refreshedProTrafficJson: any = await refreshedProTraffic.json();
    assert('incomplete prewarmed pro traffic cache is not served as an empty completed job',
      refreshedProTraffic.status === 202
        && refreshedProTrafficJson.job.state !== 'completed',
      JSON.stringify(refreshedProTrafficJson));
    const refreshedJob = await waitForCompletedJob(incompleteProTrafficCacheBaseUrl, refreshedProTrafficJson.job.id);
    assert('incomplete prewarmed pro traffic cache falls back to fresh measured execution',
      incompleteProTrafficExecutorCalls === 1
        && refreshedJob.result.keywords[0].keyword === 'fresh measured pro traffic keyword'
        && refreshedJob.result.summary.measured === 1,
      JSON.stringify({ refreshedJob, incompleteProTrafficExecutorCalls }));
  } finally {
    await close(incompleteProTrafficCacheServer);
  }

  console.log('[mobile-api-server-pro-traffic-incomplete-cache.test] passed');

  let intentSeparatedExecutorCalls = 0;
  const intentSeparatedInbox = new MobileNotificationInbox();
  const intentSeparatedBoardFile = path.join(os.tmpdir(), `leword-feature-intent-separated-${Date.now()}.json`);
  writeJson(intentSeparatedBoardFile, {
    boardUpdatedAt: '2026-06-15T02:50:00.000Z',
    items: [{
      keyword: '\uBD80\uC0B0\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC\uC0AC\uC6A9\uCC98',
      grade: 'SSS',
      score: 94,
      pcSearchVolume: 50,
      mobileSearchVolume: 540,
      totalSearchVolume: 590,
      documentCount: 1076,
      goldenRatio: 0.55,
      cpc: 0,
      category: 'policy',
      source: 'live-golden-board-fixture',
      intent: 'policy-use-place',
      evidence: ['live-golden-board-exact-match'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      searchVolumeBindingVersion: 'keyword-keyed-v2',
      searchVolumeMeasuredAt: '2026-06-15T02:50:00.000Z',
      isSearchVolumeEstimated: false,
     documentCountSource: 'naver-api',
     documentCountConfidence: 'high',
      documentCountQueryMode: 'exact-phrase',
     isDocumentCountEstimated: false,
      updatedAt: '2026-06-15T02:50:00.000Z',
      discoveredAt: '2026-06-15T02:50:00.000Z',
      isMeasured: true,
    }, {
      keyword: '\uC0BC\uC131\uCC3D\uBB38\uD615\uC5D0\uC5B4\uCEE8 \uAC00\uACA9\uBE44\uAD50',
      grade: 'SS',
      score: 82,
      pcSearchVolume: 2300,
      mobileSearchVolume: 9700,
      totalSearchVolume: 12000,
      documentCount: 850,
      goldenRatio: 14.12,
      cpc: 0,
      category: 'electronics',
      source: 'live-golden-board-fixture',
      intent: 'product-shopping',
      evidence: ['live-golden-board-exact-match'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      searchVolumeBindingVersion: 'keyword-keyed-v2',
      searchVolumeMeasuredAt: '2026-06-15T02:50:00.000Z',
      isSearchVolumeEstimated: false,
     documentCountSource: 'naver-api',
     documentCountConfidence: 'high',
      documentCountQueryMode: 'exact-phrase',
     isDocumentCountEstimated: false,
      updatedAt: '2026-06-15T02:50:00.000Z',
      discoveredAt: '2026-06-15T02:50:00.000Z',
      isMeasured: true,
    }],
  });
  const intentSeparatedRadar = new MobileLiveGoldenRadar({
    notificationInbox: intentSeparatedInbox,
    runOnStart: false,
    boardFile: intentSeparatedBoardFile,
    boardTarget: 5,
    now: () => new Date('2026-06-15T02:55:00.000Z'),
  });
  const intentSeparatedResultCache = new InMemoryMobileResultCache();
  const intentSeparatedNaverMateParams = {
    seedKeyword: '\uC624\uB298 \uC2E4\uC2DC\uAC04 \uC774\uC288',
    targetCount: 1,
    includeAutocomplete: true,
    includeRelated: true,
    includeVolumeMetrics: true,
    autoDiscovery: true,
    qualityProfile: 'intent-separated-v3',
  };
  intentSeparatedResultCache.set('naver-mate-hunter', intentSeparatedNaverMateParams, {
    ...result,
    keywords: [{
      keyword: '\uBD80\uC0B0\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC\uC0AC\uC6A9\uCC98',
      grade: 'SSS',
      pcSearchVolume: 50,
      mobileSearchVolume: 540,
      totalSearchVolume: 590,
      documentCount: 1076,
      goldenRatio: 0.55,
      cpc: 0,
      category: 'policy',
      source: 'server-measured-naver-mate-prewarm',
      intent: 'naver-expansion-measured-need',
      evidence: [
        'live-golden-board-exact-match',
        'server-24h-measured-prewarm',
        'origin:live-golden-board-fixture',
      ],
      isMeasured: true,
    }],
    summary: {
      total: 1,
      sss: 1,
      measured: 1,
      elapsedMs: 1,
      fromCache: false,
      parityMode: 'pc-engine-plus',
    },
  });
  const intentSeparatedServer = createLewordApiServer({
    entitlementVerifier: null,
    resultCache: intentSeparatedResultCache,
    liveGoldenRadar: intentSeparatedRadar,
    notificationInbox: intentSeparatedInbox,
    prewarmService: null,
    prewarmScheduler: null,
    executor: async () => {
      intentSeparatedExecutorCalls += 1;
      return {
        ...result,
        keywords: [{
          keyword: '\uB124\uC774\uBC84\uBA54\uC774\uD2B8\uC790\uB3D9\uC644\uC131',
          grade: 'SSS',
          pcSearchVolume: 100,
          mobileSearchVolume: 900,
          totalSearchVolume: 1000,
          documentCount: 300,
          goldenRatio: 3.33,
          cpc: 0,
          category: 'naver-mate',
          source: 'pc-naver-autocomplete',
          intent: 'naver-mate',
          evidence: ['pc-naver-autocomplete'],
          isMeasured: true,
        }],
        summary: {
          total: 1,
          sss: 1,
          measured: 1,
          elapsedMs: 1,
          fromCache: false,
          parityMode: 'pc-engine-plus',
        },
      };
    },
  });
  const intentSeparatedPort = await listen(intentSeparatedServer);
  const intentSeparatedBaseUrl = `http://127.0.0.1:${intentSeparatedPort}`;
  try {
    const shopping = await fetch(`${intentSeparatedBaseUrl}/v1/shopping/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetCount: 1, autoDiscovery: true }),
    });
    const shoppingJson: any = await shopping.json();
    const shoppingCompleted = await waitForCompletedJob(intentSeparatedBaseUrl, shoppingJson.job.id);
    assert('shopping connect reuses only product-shaped live board candidates',
      shoppingCompleted.result.keywords.length === 1
        && shoppingCompleted.result.keywords[0].keyword === '\uC0BC\uC131\uCC3D\uBB38\uD615\uC5D0\uC5B4\uCEE8 \uAC00\uACA9\uBE44\uAD50'
        && !shoppingCompleted.result.keywords.some((item: any) => /policy|voucher|use-place/.test(String(item.category || item.intent || item.source || ''))),
      JSON.stringify(shoppingCompleted.result));

    const naverMate = await fetch(`${intentSeparatedBaseUrl}/v1/naver/mate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seedKeyword: '\uC624\uB298 \uC2E4\uC2DC\uAC04 \uC774\uC288',
        targetCount: 1,
        includeAutocomplete: true,
        includeRelated: true,
        includeVolumeMetrics: true,
        autoDiscovery: true,
      }),
    });
    const naverMateJson: any = await naverMate.json();
    const naverMateCompleted = await waitForCompletedJob(intentSeparatedBaseUrl, naverMateJson.job.id);
    assert('naver mate does not replay generic live golden board rows as autocomplete results',
      naverMateCompleted.result.keywords.length === 1
        && naverMateCompleted.result.keywords[0].source === 'pc-naver-autocomplete'
        && intentSeparatedExecutorCalls === 1,
      JSON.stringify({ result: naverMateCompleted.result, intentSeparatedExecutorCalls }));
  } finally {
    await close(intentSeparatedServer);
    fs.rmSync(intentSeparatedBoardFile, { force: true });
  }

  console.log('[mobile-api-server-feature-intent-separation.test] passed');

  const overlayInbox = new MobileNotificationInbox();
  const overlayBoardFile = path.join(os.tmpdir(), `leword-live-board-overlay-${Date.now()}.json`);
  writeJson(overlayBoardFile, {
    boardUpdatedAt: '2026-06-15T03:00:00.000Z',
    items: [{
      keyword: '한강유람선예약',
      grade: 'S',
      score: 70,
      pcSearchVolume: 960,
      mobileSearchVolume: 9120,
      totalSearchVolume: 10080,
      documentCount: 900,
      goldenRatio: 99,
      cpc: 80,
      category: 'travel_domestic',
      source: 'live-golden-board-fixture',
      intent: '예약',
      evidence: ['fixture live board'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      searchVolumeBindingVersion: 'keyword-keyed-v2',
      searchVolumeMeasuredAt: '2026-06-15T03:00:00.000Z',
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      documentCountQueryMode: 'exact-phrase',
      isDocumentCountEstimated: false,
      updatedAt: '2026-06-15T03:00:00.000Z',
      discoveredAt: '2026-06-15T03:00:00.000Z',
      isMeasured: true,
    }],
  });
  const overlayRadar = new MobileLiveGoldenRadar({
    notificationInbox: overlayInbox,
    runOnStart: false,
    boardFile: overlayBoardFile,
    boardTarget: 5,
    now: () => new Date('2026-06-15T03:05:00.000Z'),
  });
  const overlayServer = createLewordApiServer({
    entitlementVerifier: null,
    resultCache: new InMemoryMobileResultCache(),
    liveGoldenRadar: overlayRadar,
    notificationInbox: overlayInbox,
    prewarmService: null,
    prewarmScheduler: null,
    executor: async () => ({
      ...result,
      keywords: [{
        keyword: '한강 유람선 예약 디너',
        grade: 'SS',
        pcSearchVolume: 240,
        mobileSearchVolume: 1760,
        totalSearchVolume: 2000,
        documentCount: 900,
        goldenRatio: 2.22,
        cpc: 0,
        category: 'auto',
        source: 'fixture-related-only',
        intent: 'related-keyword',
        evidence: ['fixture related only'],
        isMeasured: false,
      }],
      summary: {
        total: 1,
        sss: 0,
        measured: 0,
        elapsedMs: 1,
        fromCache: false,
        parityMode: 'pc-engine-plus',
      },
    }),
  });
  const overlayPort = await listen(overlayServer);
  const overlayBaseUrl = `http://127.0.0.1:${overlayPort}`;
  try {
    const analyze = await fetch(`${overlayBaseUrl}/v1/keywords/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: '한강유람선예약', maxRelatedCount: 10 }),
    });
    const analyzeJson: any = await analyze.json();
    const completed = await waitForCompletedJob(overlayBaseUrl, analyzeJson.job.id);
    const firstKeyword = completed.result.keywords[0];
    assert('keyword analysis exact row syncs live golden board metrics',
      analyze.status === 202
        && firstKeyword.keyword === '한강유람선예약'
        && firstKeyword.pcSearchVolume === 960
        && firstKeyword.mobileSearchVolume === 9120
        && firstKeyword.totalSearchVolume === 10080
        && firstKeyword.documentCount === 900
        && firstKeyword.source === 'live-golden-board-exact-match'
        && completed.result.summary.measured === 1,
      JSON.stringify(completed.result));

    const canonicalOverlayExecutor: MobileJobExecutor = async () => ({
        ...result,
        keywords: [{
          keyword: '한강유람선예약',
          grade: 'S',
          pcSearchVolume: 1800,
          mobileSearchVolume: 4600,
          totalSearchVolume: 6400,
          documentCount: 350,
          goldenRatio: 18.29,
          cpc: 20,
          category: 'travel_domestic',
          source: 'pc-keyword-analysis-exact',
          intent: 'requested-keyword',
          evidence: ['pc-naver-openapi-document-count'],
          isMeasured: true,
          searchVolumeSource: 'searchad',
          searchVolumeConfidence: 'high',
          searchVolumeBindingVersion: 'keyword-keyed-v2',
          searchVolumeMeasuredAt: '2026-06-01T00:00:00.000Z',
          isSearchVolumeEstimated: false,
          documentCountSource: 'naver-api',
          documentCountConfidence: 'high',
          documentCountQueryMode: 'broad',
          isDocumentCountEstimated: false,
          agentInsight: {
            searchVolumeReason: '기존 분석 검색량 6,400 기준입니다.',
            sourceSummary: 'PC 분석기 broad 문서수 기준',
          },
        }],
        summary: {
          total: 1,
          sss: 0,
          measured: 1,
          elapsedMs: 1,
          fromCache: false,
          parityMode: 'pc-engine-plus',
        },
      });
    const canonicalOverlayServer = createLewordApiServer({
      entitlementVerifier: null,
      resultCache: new InMemoryMobileResultCache(),
      liveGoldenRadar: overlayRadar,
      notificationInbox: overlayInbox,
      prewarmService: null,
      prewarmScheduler: null,
      executor: canonicalOverlayExecutor,
    });
    const canonicalOverlayPort = await listen(canonicalOverlayServer);
    const canonicalOverlayBaseUrl = `http://127.0.0.1:${canonicalOverlayPort}`;
    try {
      const canonicalAnalyze = await fetch(`${canonicalOverlayBaseUrl}/v1/keywords/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: '한강유람선예약', maxRelatedCount: 10 }),
      });
      const canonicalAnalyzeJson: any = await canonicalAnalyze.json();
      const canonicalCompleted = await waitForCompletedJob(canonicalOverlayBaseUrl, canonicalAnalyzeJson.job.id);
      const canonicalKeyword = canonicalCompleted.result.keywords[0];
      assert('trusted full live board metric is canonical for exact keyword analysis',
        canonicalKeyword.pcSearchVolume === 960
          && canonicalKeyword.mobileSearchVolume === 9120
          && canonicalKeyword.totalSearchVolume === 10080
          && canonicalKeyword.documentCount === 900
          && canonicalKeyword.goldenRatio === 11.2
          && canonicalKeyword.source === 'live-golden-board-exact-match',
        JSON.stringify(canonicalKeyword));
      assert('canonical live board overlay preserves measurement provenance',
        canonicalKeyword.searchVolumeBindingVersion === 'keyword-keyed-v2'
          && canonicalKeyword.searchVolumeMeasuredAt === '2026-06-15T03:00:00.000Z'
          && canonicalKeyword.documentCountQueryMode === 'exact-phrase',
        JSON.stringify(canonicalKeyword));
      assert('canonical live board overlay removes stale analysis numbers from agent insight',
        String(canonicalKeyword.agentInsight?.searchVolumeReason || '').includes('10,080')
          && !String(canonicalKeyword.agentInsight?.searchVolumeReason || '').includes('6,400'),
        JSON.stringify(canonicalKeyword.agentInsight));
    } finally {
      await close(canonicalOverlayServer);
    }

    const searchOnlyPayload = JSON.parse(fs.readFileSync(overlayBoardFile, 'utf8'));
    delete searchOnlyPayload.items[0].documentCountQueryMode;
    searchOnlyPayload.items[0].evidence = ['legacy document scope is unbound'];
    writeJson(overlayBoardFile, searchOnlyPayload);
    const searchOnlyRadar = new MobileLiveGoldenRadar({
      notificationInbox: overlayInbox,
      runOnStart: false,
      boardFile: overlayBoardFile,
      boardTarget: 5,
      now: () => new Date('2026-06-15T03:05:00.000Z'),
    });
    const searchOnlyServer = createLewordApiServer({
      entitlementVerifier: null,
      resultCache: new InMemoryMobileResultCache(),
      liveGoldenRadar: searchOnlyRadar,
      notificationInbox: overlayInbox,
      prewarmService: null,
      prewarmScheduler: null,
      executor: canonicalOverlayExecutor,
    });
    const searchOnlyPort = await listen(searchOnlyServer);
    const searchOnlyBaseUrl = `http://127.0.0.1:${searchOnlyPort}`;
    try {
      const searchOnlyAnalyze = await fetch(`${searchOnlyBaseUrl}/v1/keywords/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: searchOnlyPayload.items[0].keyword, maxRelatedCount: 10 }),
      });
      const searchOnlyAnalyzeJson: any = await searchOnlyAnalyze.json();
      const searchOnlyCompleted = await waitForCompletedJob(searchOnlyBaseUrl, searchOnlyAnalyzeJson.job.id);
      const searchOnlyKeyword = searchOnlyCompleted.result.keywords[0];
      assert('trusted board SearchAd volume syncs without promoting unbound document scope',
        searchOnlyKeyword.pcSearchVolume === 960
          && searchOnlyKeyword.mobileSearchVolume === 9120
          && searchOnlyKeyword.totalSearchVolume === 10080
          && searchOnlyKeyword.documentCount === 350
          && searchOnlyKeyword.goldenRatio === 28.8
          && searchOnlyKeyword.source === 'pc-keyword-analysis-exact',
        JSON.stringify(searchOnlyKeyword));
      assert('search-only board sync preserves broad document provenance',
        searchOnlyKeyword.searchVolumeMeasuredAt === '2026-06-15T03:00:00.000Z'
          && searchOnlyKeyword.documentCountQueryMode === 'broad'
          && searchOnlyKeyword.evidence.includes('analysis-board-search-volume-sync')
          && !searchOnlyKeyword.evidence.includes('analysis-board-metric-sync'),
        JSON.stringify(searchOnlyKeyword));
      assert('search-only board sync removes stale search numbers from agent insight',
        String(searchOnlyKeyword.agentInsight?.searchVolumeReason || '').includes('10,080')
          && !String(searchOnlyKeyword.agentInsight?.searchVolumeReason || '').includes('6,400'),
        JSON.stringify(searchOnlyKeyword.agentInsight));
    } finally {
      await close(searchOnlyServer);
    }

    const staleBindingPayload = JSON.parse(fs.readFileSync(overlayBoardFile, 'utf8'));
    staleBindingPayload.boardUpdatedAt = '2026-08-15T03:00:00.000Z';
    staleBindingPayload.items[0].updatedAt = '2026-08-15T03:00:00.000Z';
    staleBindingPayload.items[0].discoveredAt = '2026-08-15T03:00:00.000Z';
    writeJson(overlayBoardFile, staleBindingPayload);
    const staleOverlayRadar = new MobileLiveGoldenRadar({
      notificationInbox: overlayInbox,
      runOnStart: false,
      boardFile: overlayBoardFile,
      boardTarget: 5,
      now: () => new Date('2026-08-15T03:05:00.000Z'),
    });
    const staleOverlayServer = createLewordApiServer({
      entitlementVerifier: null,
      resultCache: new InMemoryMobileResultCache(),
      liveGoldenRadar: staleOverlayRadar,
      notificationInbox: overlayInbox,
      prewarmService: null,
      prewarmScheduler: null,
      executor: canonicalOverlayExecutor,
    });
    const staleOverlayPort = await listen(staleOverlayServer);
    const staleOverlayBaseUrl = `http://127.0.0.1:${staleOverlayPort}`;
    try {
      const staleAnalyze = await fetch(`${staleOverlayBaseUrl}/v1/keywords/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: '한강유람선예약', maxRelatedCount: 10 }),
      });
      const staleAnalyzeJson: any = await staleAnalyze.json();
      const staleCompleted = await waitForCompletedJob(staleOverlayBaseUrl, staleAnalyzeJson.job.id);
      const staleKeyword = staleCompleted.result.keywords[0];
      assert('stale SearchAd binding never overrides a fresh exact keyword analysis',
        staleKeyword.pcSearchVolume === 1800
          && staleKeyword.mobileSearchVolume === 4600
          && staleKeyword.totalSearchVolume === 6400
          && staleKeyword.documentCount === 350
          && staleKeyword.source === 'pc-keyword-analysis-exact'
          && !staleKeyword.evidence.includes('analysis-board-metric-sync'),
        JSON.stringify(staleKeyword));
    } finally {
      await close(staleOverlayServer);
    }
  } finally {
    await close(overlayServer);
    fs.rmSync(overlayBoardFile, { force: true });
  }

  console.log('[mobile-api-server-live-board-overlay.test] passed');

  const overlaySplitInbox = new MobileNotificationInbox();
  const overlaySplitBoardFile = path.join(os.tmpdir(), `leword-live-board-overlay-split-${Date.now()}.json`);
  writeJson(overlaySplitBoardFile, {
    boardUpdatedAt: '2026-06-15T03:10:00.000Z',
    items: [{
      keyword: '한강유람선예약',
      grade: 'SS',
      score: 78,
      pcSearchVolume: null,
      mobileSearchVolume: null,
      totalSearchVolume: 6400,
      documentCount: 320,
      goldenRatio: 20,
      cpc: 90,
      category: 'test',
      source: 'live-golden-board-fixture',
      intent: 'test',
      evidence: ['fixture live board split'],
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      isSearchVolumeEstimated: false,
     documentCountSource: 'naver-api',
     documentCountConfidence: 'high',
      documentCountQueryMode: 'exact-phrase',
     isDocumentCountEstimated: false,
      updatedAt: '2026-06-15T03:10:00.000Z',
      discoveredAt: '2026-06-15T03:10:00.000Z',
      isMeasured: true,
    }],
  });
  const overlaySplitRadar = new MobileLiveGoldenRadar({
    notificationInbox: overlaySplitInbox,
    runOnStart: false,
    boardFile: overlaySplitBoardFile,
    boardTarget: 5,
    now: () => new Date('2026-06-15T03:15:00.000Z'),
  });
  const overlaySplitServer = createLewordApiServer({
    entitlementVerifier: null,
    resultCache: new InMemoryMobileResultCache(),
    liveGoldenRadar: overlaySplitRadar,
    notificationInbox: overlaySplitInbox,
    prewarmService: null,
    prewarmScheduler: null,
    executor: async () => ({
      ...result,
      keywords: [{
        keyword: '한강유람선예약',
        grade: 'S',
        pcSearchVolume: 1800,
        mobileSearchVolume: 4600,
        totalSearchVolume: 6400,
        documentCount: 350,
        goldenRatio: 18.29,
        cpc: 0,
        category: 'test',
        source: 'pc-keyword-analysis-exact',
        intent: 'requested-keyword',
        evidence: ['fixture exact split'],
        isMeasured: true,
      }],
      summary: {
        total: 1,
        sss: 0,
        measured: 1,
        elapsedMs: 1,
        fromCache: false,
        parityMode: 'pc-engine-plus',
      },
    }),
  });
  const overlaySplitPort = await listen(overlaySplitServer);
  const overlaySplitBaseUrl = `http://127.0.0.1:${overlaySplitPort}`;
  try {
    const analyze = await fetch(`${overlaySplitBaseUrl}/v1/keywords/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: '한강유람선예약', maxRelatedCount: 10 }),
    });
    const analyzeJson: any = await analyze.json();
    const completed = await waitForCompletedJob(overlaySplitBaseUrl, analyzeJson.job.id);
    const firstKeyword = completed.result.keywords[0];
    assert('keyword analysis ignores splitless board overlay and preserves measured PC/mobile split',
      firstKeyword.totalSearchVolume === 6400
        && firstKeyword.documentCount === 350
        && firstKeyword.pcSearchVolume === 1800
        && firstKeyword.mobileSearchVolume === 4600
        && firstKeyword.source === 'pc-keyword-analysis-exact'
        && !firstKeyword.evidence.includes('analysis-board-metric-sync'),
      JSON.stringify(completed.result));

    const splitlessMissingServer = createLewordApiServer({
      entitlementVerifier: null,
      resultCache: new InMemoryMobileResultCache(),
      liveGoldenRadar: overlaySplitRadar,
      notificationInbox: overlaySplitInbox,
      prewarmService: null,
      prewarmScheduler: null,
      executor: async () => ({
        ...result,
        keywords: [{
          keyword: '한강 유람선 예약 디너',
          grade: 'S',
          pcSearchVolume: 120,
          mobileSearchVolume: 880,
          totalSearchVolume: 1000,
          documentCount: 700,
          goldenRatio: 1.43,
          cpc: 0,
          category: 'test',
          source: 'fixture-related-only',
          intent: 'related-keyword',
          evidence: ['fixture related only'],
          isMeasured: true,
        }],
        summary: {
          total: 1,
          sss: 0,
          measured: 1,
          elapsedMs: 1,
          fromCache: false,
          parityMode: 'pc-engine-plus',
        },
      }),
    });
    const splitlessMissingPort = await listen(splitlessMissingServer);
    const splitlessMissingBaseUrl = `http://127.0.0.1:${splitlessMissingPort}`;
    try {
      const missingAnalyze = await fetch(`${splitlessMissingBaseUrl}/v1/keywords/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: '한강유람선예약', maxRelatedCount: 10 }),
      });
      const missingAnalyzeJson: any = await missingAnalyze.json();
      const missingCompleted = await waitForCompletedJob(splitlessMissingBaseUrl, missingAnalyzeJson.job.id);
      assert('noncanonical board row is never inserted when exact analysis row is absent',
        missingCompleted.result.keywords[0]?.keyword === '한강 유람선 예약 디너'
          && !missingCompleted.result.keywords.some((item: any) => item.source === 'live-golden-board-exact-match'),
        JSON.stringify(missingCompleted.result));
    } finally {
      await close(splitlessMissingServer);
    }
  } finally {
    await close(overlaySplitServer);
    fs.rmSync(overlaySplitBoardFile, { force: true });
  }

  const partialExactServer = createLewordApiServer({
    entitlementVerifier: null,
    resultCache: new InMemoryMobileResultCache(),
    liveGoldenRadar: null,
    notificationInbox: null,
    prewarmService: null,
    prewarmScheduler: null,
    executor: async () => ({
      ...result,
      keywords: [{
        keyword: '2026 근로장려금',
        grade: 'S',
        pcSearchVolume: 1200,
        mobileSearchVolume: 8400,
        totalSearchVolume: 9600,
        documentCount: null,
        goldenRatio: null,
        cpc: 0,
        category: 'test',
        source: 'pc-keyword-analysis-exact',
        intent: 'requested-keyword',
        evidence: ['fixture exact split', 'pc-searchad-volume', 'pc-naver-openapi-document-count-unavailable'],
        isMeasured: false,
        searchVolumeSource: 'searchad',
        searchVolumeConfidence: 'high',
        documentCountSource: null,
      }],
      summary: {
        total: 1,
        sss: 0,
        measured: 0,
        elapsedMs: 1,
        fromCache: false,
        parityMode: 'pc-engine-plus',
      },
    }),
  });
  const partialExactPort = await listen(partialExactServer);
  const partialExactBaseUrl = `http://127.0.0.1:${partialExactPort}`;
  try {
    const analyze = await fetch(`${partialExactBaseUrl}/v1/keywords/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: '2026 근로장려금', maxRelatedCount: 10 }),
    });
    const analyzeJson: any = await analyze.json();
    const completed = await waitForCompletedJob(partialExactBaseUrl, analyzeJson.job.id);
    const firstKeyword = completed.result.keywords[0];
    assert('keyword analysis keeps SearchAd-measured exact keyword when document count is unavailable',
      completed.result.keywords.length === 1
        && firstKeyword.keyword === '2026 근로장려금'
        && firstKeyword.pcSearchVolume === 1200
        && firstKeyword.mobileSearchVolume === 8400
        && firstKeyword.documentCount === null
        && firstKeyword.isMeasured === false,
      JSON.stringify(completed.result));
  } finally {
    await close(partialExactServer);
  }

  console.log('[mobile-api-server-live-board-overlay-split.test] passed');

  let strictExecutorCalls = 0;
  const uncleanKeywordResult: MobileKeywordResult = {
    ...result,
    keywords: [{
      keyword: '실측키워드',
      grade: 'SS',
      pcSearchVolume: 120,
      mobileSearchVolume: 880,
      totalSearchVolume: 1000,
      documentCount: 200,
      goldenRatio: 5,
      cpc: 0,
      category: 'test',
      source: 'pc-searchad-openapi',
      intent: 'requested-keyword',
      evidence: ['pc-searchad-volume', 'pc-naver-blog-document-count'],
      isMeasured: true,
    }, {
      keyword: '더미키워드',
      grade: 'SSS',
      pcSearchVolume: 1000,
      mobileSearchVolume: 2000,
      totalSearchVolume: 3000,
      documentCount: 10,
      goldenRatio: 300,
      cpc: 0,
      category: 'test',
      source: 'dummy-generator',
      intent: 'requested-keyword',
      evidence: ['dummy data'],
      isMeasured: true,
    }, {
      keyword: '추정키워드',
      grade: 'SSS',
      pcSearchVolume: 500,
      mobileSearchVolume: 500,
      totalSearchVolume: 1000,
      documentCount: 20,
      goldenRatio: 50,
      cpc: 0,
      category: 'test',
      source: 'estimated-serp',
      intent: 'related-keyword',
      evidence: ['estimated'],
      isMeasured: true,
    }, {
      keyword: '부분측정키워드',
      grade: 'S',
      pcSearchVolume: 100,
      mobileSearchVolume: 100,
      totalSearchVolume: 200,
      documentCount: null,
      goldenRatio: null,
      cpc: 0,
      category: 'test',
      source: 'pc-searchad-openapi',
      intent: 'related-keyword',
      evidence: ['pc-searchad-volume'],
      isMeasured: true,
    }, {
      keyword: '분할없는키워드',
      grade: 'S',
      pcSearchVolume: null,
      mobileSearchVolume: null,
      totalSearchVolume: 1200,
      documentCount: 300,
      goldenRatio: 4,
      cpc: 0,
      category: 'test',
      source: 'pc-searchad-openapi',
      intent: 'related-keyword',
      evidence: ['pc-searchad-volume', 'pc-naver-blog-document-count'],
      isMeasured: true,
    }],
    summary: {
      total: 5,
      sss: 2,
      measured: 5,
      elapsedMs: 1,
      fromCache: false,
      parityMode: 'pc-engine-plus',
    },
  };
  const strictCache = new InMemoryMobileResultCache();
  strictCache.set('keyword-analysis', { keyword: '캐시검증' }, uncleanKeywordResult);
  const strictServer = createLewordApiServer({
    entitlementVerifier: null,
    resultCache: strictCache,
    liveGoldenRadar: null,
    prewarmService: null,
    prewarmScheduler: null,
    executor: async () => {
      strictExecutorCalls += 1;
      return uncleanKeywordResult;
    },
  });
  const strictPort = await listen(strictServer);
  const strictBaseUrl = `http://127.0.0.1:${strictPort}`;
  try {
    const fresh = await fetch(`${strictBaseUrl}/v1/keywords/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: '실측키워드' }),
    });
    const freshJson: any = await fresh.json();
    const freshCompleted = await waitForCompletedJob(strictBaseUrl, freshJson.job.id);
    assert('keyword job hides dummy estimated and partial metrics',
      freshCompleted.result.keywords.length === 1
        && freshCompleted.result.keywords[0].keyword === '실측키워드'
        && freshCompleted.result.summary.total === 1
        && freshCompleted.result.summary.measured === 1
        && freshCompleted.result.summary.sss === 0,
      JSON.stringify(freshCompleted.result));

    const cached = await fetch(`${strictBaseUrl}/v1/keywords/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: '캐시검증' }),
    });
    const cachedJson: any = await cached.json();
    const cachedCompleted = await waitForCompletedJob(strictBaseUrl, cachedJson.job.id);
    assert('cached keyword job also hides dummy estimated and partial metrics',
      cachedCompleted.result.keywords.length === 1
        && cachedCompleted.result.keywords[0].keyword === '실측키워드'
        && cachedCompleted.result.summary.fromCache === true
        && strictExecutorCalls === 1,
      JSON.stringify({ result: cachedCompleted.result, strictExecutorCalls }));
  } finally {
    await close(strictServer);
  }

  const mindmapExplorationResult: MobileKeywordResult = {
    ...result,
    keywords: [{
      keyword: '2026 kbo 올스타전 일정',
      grade: 'A',
      pcSearchVolume: 90,
      mobileSearchVolume: 360,
      totalSearchVolume: 450,
      documentCount: 1786,
      goldenRatio: 0.25,
      cpc: 0,
      category: 'sports',
      source: 'pc-mindmap-measured-intent-expansion',
      intent: 'mindmap-expansion',
      evidence: ['pc-searchad-volume', 'pc-naver-blog-document-count'],
      isMeasured: true,
      searchVolumeSource: 'searchad',
      documentCountSource: 'naver-api',
    }],
    summary: {
      total: 1,
      sss: 0,
      measured: 1,
      elapsedMs: 1,
      fromCache: false,
      parityMode: 'pc-engine-plus',
    },
  };
  const mindmapServer = createLewordApiServer({
    entitlementVerifier: null,
    resultCache: null,
    liveGoldenRadar: null,
    prewarmService: null,
    prewarmScheduler: null,
    executor: async () => mindmapExplorationResult,
  });
  const mindmapPort = await listen(mindmapServer);
  const mindmapBaseUrl = `http://127.0.0.1:${mindmapPort}`;
  try {
    const mindmap = await fetch(`${mindmapBaseUrl}/v1/mindmap/expand`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seedKeyword: '2026KBO올스타전', targetCount: 20, includeVolumeMetrics: true }),
    });
    const mindmapJson: any = await mindmap.json();
    const mindmapCompleted = await waitForCompletedJob(mindmapBaseUrl, mindmapJson.job.id);
    assert('mindmap hides measured exploration branches downgraded to weak lookup intent',
      mindmapCompleted.result.keywords.length === 0
        && mindmapCompleted.result.summary.total === 0
        && mindmapCompleted.result.summary.measured === 0,
      JSON.stringify(mindmapCompleted.result));
  } finally {
    await close(mindmapServer);
  }

  const mindmapSourceOnlyResult: MobileKeywordResult = {
    ...result,
    keywords: [{
      keyword: '홍명보 감독 다음 감독 후보',
      grade: 'S',
      pcSearchVolume: null,
      mobileSearchVolume: null,
      totalSearchVolume: null,
      documentCount: null,
      goldenRatio: null,
      cpc: null,
      category: 'sports',
      source: 'mindmap-semantic-bridge',
      intent: 'mindmap-expansion',
      evidence: ['pc-mindmap-expansion-quality', 'semantic bridge'],
      isMeasured: false,
      measurementStatus: 'unmeasured',
    }],
    summary: {
      total: 1,
      sss: 0,
      measured: 0,
      elapsedMs: 1,
      fromCache: false,
      parityMode: 'pc-engine-plus',
    },
  };
  const mindmapSourceOnlyServer = createLewordApiServer({
    entitlementVerifier: null,
    resultCache: null,
    liveGoldenRadar: null,
    prewarmService: null,
    prewarmScheduler: null,
    executor: async () => mindmapSourceOnlyResult,
  });
  const mindmapSourceOnlyPort = await listen(mindmapSourceOnlyServer);
  const mindmapSourceOnlyBaseUrl = `http://127.0.0.1:${mindmapSourceOnlyPort}`;
  try {
    const sourceOnly = await fetch(`${mindmapSourceOnlyBaseUrl}/v1/mindmap/expand`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seedKeyword: '홍명보 감독 사퇴', targetCount: 20, includeVolumeMetrics: true }),
    });
    const sourceOnlyJson: any = await sourceOnly.json();
    const sourceOnlyCompleted = await waitForCompletedJob(mindmapSourceOnlyBaseUrl, sourceOnlyJson.job.id);
    assert('mindmap keeps trusted source-only semantic branches as unmeasured expansion rows',
      sourceOnlyCompleted.result.keywords.length === 1
        && sourceOnlyCompleted.result.keywords[0].keyword === '홍명보 감독 다음 감독 후보'
        && sourceOnlyCompleted.result.keywords[0].source === 'mindmap-semantic-bridge'
        && sourceOnlyCompleted.result.keywords[0].measurementStatus === 'unmeasured'
        && sourceOnlyCompleted.result.summary.total === 1
        && sourceOnlyCompleted.result.summary.measured === 0,
      JSON.stringify(sourceOnlyCompleted.result));
  } finally {
    await close(mindmapSourceOnlyServer);
  }

  console.log('[mobile-api-server-strict-measured-result.test] passed');

  let prewarmExecutions = 0;
  const sentPushMessages: any[] = [];
  const pushRegistry = new MobilePushRegistry();
  const pushDispatcher = new MobilePushDispatcher({
    registry: pushRegistry,
    sender: async (message) => {
      sentPushMessages.push(message);
    },
  });
  const prewarmServer = createLewordApiServer({
    entitlementVerifier: null,
    resultCache: new InMemoryMobileResultCache(),
    pushRegistry,
    pushDispatcher,
    executor: async (job) => {
      prewarmExecutions += 1;
      return {
        ...result,
        keywords: [{
          keyword: `${job.product} 예열 후보`,
          grade: 'SSS',
          pcSearchVolume: 1000,
          mobileSearchVolume: 1000,
          totalSearchVolume: 2000,
          documentCount: 100,
          goldenRatio: 20,
          cpc: 120,
          category: 'prewarm',
          source: 'prewarm-fixture',
          intent: '예열',
          evidence: ['prewarm fixture'],
          isMeasured: true,
        }],
        summary: {
          total: 1,
          sss: 1,
          measured: 1,
          elapsedMs: 5,
          fromCache: false,
          parityMode: 'pc-engine',
        },
      };
    },
  });
  const prewarmPort = await listen(prewarmServer);
  const prewarmBaseUrl = `http://127.0.0.1:${prewarmPort}`;

  try {
    const registeredPush = await fetch(`${prewarmBaseUrl}/v1/push/subscriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pushToken: 'ExponentPushToken[api-fixture]',
        platform: 'expo',
        deviceId: 'test-device',
        appVersion: '0.1.0',
        locale: 'ko-KR',
      }),
    });
    const registeredPushJson: any = await registeredPush.json();
    assert('mobile push subscription can be registered',
      registeredPush.status === 200
        && registeredPushJson.subscription.enabled === true
        && registeredPushJson.snapshot.enabledSubscriptions === 1);

    const started = await fetch(`${prewarmBaseUrl}/v1/prewarm/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 2 }),
    });
    assert('prewarm run is accepted', started.status === 202);

    let snapshot: any;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await fetch(`${prewarmBaseUrl}/v1/prewarm/snapshot`);
      const payload: any = await response.json();
      snapshot = payload.snapshot;
      if (!snapshot.running && snapshot.completed >= 2) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    assert('prewarm completes requested targets',
      snapshot.running === false && snapshot.completed >= 2, JSON.stringify(snapshot));
    assert('prewarm executes PC worker for cold cache', prewarmExecutions === 2, String(prewarmExecutions));

    const warmedAgain = await fetch(`${prewarmBaseUrl}/v1/prewarm/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 2 }),
    });
    assert('prewarm second run accepted', warmedAgain.status === 202);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await fetch(`${prewarmBaseUrl}/v1/prewarm/snapshot`);
      const payload: any = await response.json();
      snapshot = payload.snapshot;
      if (!snapshot.running && prewarmExecutions >= 4) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    assert('prewarm reruns thin daily prewarm caches instead of replaying weak one-keyword results',
      snapshot.running === false && snapshot.cacheHits === 0 && prewarmExecutions === 4,
      JSON.stringify({ snapshot, prewarmExecutions }));

    const notifications = await fetch(`${prewarmBaseUrl}/v1/notifications`);
    const notificationsJson: any = await notifications.json();
    assert('prewarm publishes mobile notification winners',
      notifications.status === 200
        && notificationsJson.snapshot.total >= 2
        && notificationsJson.snapshot.unreadCount >= 2,
      JSON.stringify(notificationsJson));

    const firstNotificationId = notificationsJson.snapshot.items[0].id;
    const readNotification = await fetch(`${prewarmBaseUrl}/v1/notifications/${encodeURIComponent(firstNotificationId)}/read`, {
      method: 'PATCH',
    });
    const readNotificationJson: any = await readNotification.json();
    assert('mobile notification can be marked read',
      readNotification.status === 200
        && readNotificationJson.item.read === true
        && readNotificationJson.snapshot.unreadCount < notificationsJson.snapshot.unreadCount);

    assert('prewarm notification publishes mobile push messages',
      sentPushMessages.length >= 2
        && sentPushMessages[0].data.product);

    const pushHealth = await fetch(`${prewarmBaseUrl}/health`);
    const pushHealthJson: any = await pushHealth.json();
    assert('health exposes mobile push delivery state',
      pushHealthJson.push.enabledSubscriptions === 1
        && pushHealthJson.push.recentDeliveries[0].state === 'sent');

    const unregisteredPush = await fetch(
      `${prewarmBaseUrl}/v1/push/subscriptions/${encodeURIComponent(registeredPushJson.subscription.id)}`,
      { method: 'DELETE' },
    );
    const unregisteredPushJson: any = await unregisteredPush.json();
    assert('mobile push subscription can be disabled',
      unregisteredPush.status === 200
        && unregisteredPushJson.subscription.enabled === false
        && unregisteredPushJson.snapshot.enabledSubscriptions === 0);
  } finally {
    await close(prewarmServer);
  }

  console.log('[mobile-api-server-prewarm.test] passed');

  const liveInbox = new MobileNotificationInbox();
  let liveDiscoverCalls = 0;
  const liveGoldenRadar = new MobileLiveGoldenRadar({
    notificationInbox: liveInbox,
    runOnStart: false,
    cycleLimit: 8,
    boardTarget: 10,
    maxCandidates: 160,
    categories: ['policy', 'sports'],
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
    liveSeedProvider: async () => [],
    enableBackfill: false,
    discover: async () => {
      const batch = liveDiscoverCalls + 1;
      liveDiscoverCalls += 1;
      return [
        {
          keyword: `청년미래적금 ${batch}차 신청 대상`,
          grade: 'SSS',
          score: 99,
          searchVolume: 26000,
          pcSearchVolume: 5200,
          mobileSearchVolume: 20800,
          documentCount: 360,
          goldenRatio: 72.22,
          cpc: 740,
          category: 'policy',
          intent: 'policy',
          source: 'fixture-measured',
          goldenReason: 'measured live fixture',
          evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
          externalSources: ['api-test'],
          searchVolumeSource: 'searchad',
          searchVolumeConfidence: 'high',
          searchVolumeBindingVersion: 'keyword-keyed-v2',
          searchVolumeMeasuredAt: new Date().toISOString(),
          isSearchVolumeEstimated: false,
     documentCountSource: 'naver-api',
     documentCountConfidence: 'high',
      documentCountQueryMode: 'exact-phrase',
     isDocumentCountEstimated: false,
        } as any,
        {
          keyword: `제주 렌터카 ${batch}차 가격비교`,
          grade: 'SSS',
          score: 99,
          searchVolume: 21000,
          pcSearchVolume: 4200,
          mobileSearchVolume: 16800,
          documentCount: 850,
          goldenRatio: 24.71,
          cpc: 520,
          category: 'travel_domestic',
          intent: 'commerce',
          source: 'fixture-measured',
          goldenReason: 'measured live fixture',
          evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
          externalSources: ['api-test'],
          searchVolumeSource: 'searchad',
          searchVolumeConfidence: 'high',
          searchVolumeBindingVersion: 'keyword-keyed-v2',
          searchVolumeMeasuredAt: new Date().toISOString(),
          isSearchVolumeEstimated: false,
     documentCountSource: 'naver-api',
     documentCountConfidence: 'high',
      documentCountQueryMode: 'exact-phrase',
     isDocumentCountEstimated: false,
        } as any,
        {
          keyword: `도수치료 ${batch}차 보험 적용 비용`,
          grade: 'SSS',
          score: 98,
          searchVolume: 5200,
          pcSearchVolume: 1040,
          mobileSearchVolume: 4160,
          documentCount: 620,
          goldenRatio: 8.39,
          cpc: 1120,
          category: 'health',
          intent: 'cost',
          source: 'fixture-measured',
          goldenReason: 'measured live fixture',
          evidence: ['fixture-searchad-volume', 'fixture-naver-openapi-document-count'],
          externalSources: ['api-test'],
          searchVolumeSource: 'searchad',
          searchVolumeConfidence: 'high',
          searchVolumeBindingVersion: 'keyword-keyed-v2',
          searchVolumeMeasuredAt: new Date().toISOString(),
          isSearchVolumeEstimated: false,
         documentCountSource: 'naver-api',
         documentCountConfidence: 'high',
          documentCountQueryMode: 'exact-phrase',
         isDocumentCountEstimated: false,
        } as any,
        {
          keyword: `2026 흠뻑쇼 ${batch}차 일정`,
          grade: 'SSS',
          score: 92,
          searchVolume: 3000,
          pcSearchVolume: 600,
          mobileSearchVolume: 2400,
          documentCount: 120,
          goldenRatio: 25,
          cpc: 100,
          intent: 'schedule',
          goldenReason: 'live fixture',
          externalSources: ['api-test'],
        } as any,
        {
          keyword: `근로장려금 ${batch}차 지급일 조회`,
          grade: 'SS',
          score: 78,
          searchVolume: 1800,
          pcSearchVolume: 360,
          mobileSearchVolume: 1440,
          documentCount: 180,
          goldenRatio: 10,
          cpc: 90,
          intent: 'policy',
          goldenReason: 'live fixture',
          externalSources: ['api-test'],
        } as any,
        {
          keyword: `KBO 올스타전 ${batch}차 예매 일정`,
          grade: 'SS',
          score: 82,
          searchVolume: 2400,
          pcSearchVolume: 480,
          mobileSearchVolume: 1920,
          documentCount: 220,
          goldenRatio: 11,
          cpc: 80,
          intent: 'sports',
          goldenReason: 'live fixture',
          externalSources: ['api-test'],
        } as any,
        {
          keyword: `장마 준비물 ${batch}차 체크리스트`,
          grade: 'SS',
          score: 80,
          searchVolume: 2100,
          pcSearchVolume: 420,
          mobileSearchVolume: 1680,
          documentCount: 200,
          goldenRatio: 10,
          cpc: 70,
          intent: 'education',
          goldenReason: 'live fixture',
          externalSources: ['api-test'],
        } as any,
        {
          keyword: `청년미래적금 ${batch}차 신청 대상`,
          grade: 'SS',
          score: 79,
          searchVolume: 1900,
          pcSearchVolume: 380,
          mobileSearchVolume: 1520,
          documentCount: 190,
          goldenRatio: 10,
          cpc: 95,
          intent: 'policy',
          goldenReason: 'live fixture',
          externalSources: ['api-test'],
        } as any,
        {
          keyword: '리센느 프로필',
          grade: 'SS',
          score: 78,
          searchVolume: 1800,
          pcSearchVolume: 360,
          mobileSearchVolume: 1440,
          documentCount: 180,
          goldenRatio: 10,
          cpc: 90,
          intent: 'profile',
          goldenReason: 'live fixture',
          externalSources: ['api-test'],
        } as any,
      ];
    },
  });
  const liveServer = createLewordApiServer({
    entitlementVerifier: null,
    liveGoldenRadar,
    notificationInbox: liveInbox,
    prewarmService: null,
    prewarmScheduler: null,
  });
  const livePort = await listen(liveServer);
  const liveBaseUrl = `http://127.0.0.1:${livePort}`;
  try {
    const health = await fetch(`${liveBaseUrl}/health`);
    const healthJson: any = await health.json();
    assert('health exposes live golden radar state',
      healthJson.liveGolden?.enabled === true
        && healthJson.liveGoldenRoutes.snapshot === MOBILE_LIVE_GOLDEN_ROUTES.snapshot,
      JSON.stringify(healthJson.liveGolden));

    const run = await fetch(`${liveBaseUrl}${MOBILE_LIVE_GOLDEN_ROUTES.run}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cycles: 3 }),
    });
    const runJson: any = await run.json();
    assert('live golden radar run route catches up to board target',
      run.status === 202
        && runJson.cycles === 3
        && liveDiscoverCalls >= 2
        && runJson.snapshot.boardCount > 0
        && runJson.snapshot.boardCount <= 10
        && runJson.snapshot.successfulRuns >= 2
        && runJson.snapshot.publishedCount > 0,
      JSON.stringify(runJson));

    const inbox = await fetch(`${liveBaseUrl}/v1/notifications`);
    const inboxJson: any = await inbox.json();
    assert('live golden radar publishes into recommendation inbox',
      inboxJson.snapshot.items.some((item: any) => item.kind === 'live-golden'),
      JSON.stringify(inboxJson));
  } finally {
    await close(liveServer);
  }

  console.log('[mobile-api-server-live-golden.test] passed');

  const reviewRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-human-review-'));
  const reviewFile = path.join(reviewRoot, 'live-golden-human-review.json');
  const reviewBoardUpdatedAt = new Date().toISOString();
  const reviewRows = LIVE_GOLDEN_CORE_CATEGORY_POLICIES.flatMap((policy) => (
    Array.from({ length: 5 }, (_, index) => ({
      id: `${policy.key}-${index}`,
      keyword: `${policy.label} 사람 검수 ${index + 1}`,
      category: policy.discoveryIds[0],
      intent: 'Informational',
      grade: 'S',
      score: 80,
      pcSearchVolume: 200,
      mobileSearchVolume: 800,
      totalSearchVolume: 1000,
      documentCount: 200,
      goldenRatio: 5,
      source: 'searchad-measured',
      isMeasured: true,
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      searchVolumeBindingVersion: 'keyword-keyed-v2',
      searchVolumeMeasuredAt: reviewBoardUpdatedAt,
      isSearchVolumeEstimated: false,
         documentCountSource: 'naver-api',
         documentCountConfidence: 'high',
          documentCountQueryMode: 'exact-phrase',
         isDocumentCountEstimated: false,
      discoveredAt: reviewBoardUpdatedAt,
      updatedAt: reviewBoardUpdatedAt,
    } as any))
  ));
  const reviewSnapshot = {
    board: reviewRows,
    verifiedSupply: reviewRows,
    boardCount: reviewRows.length,
    boardTarget: 120,
    boardUpdatedAt: reviewBoardUpdatedAt,
    pendingProbeQueueCount: 0,
  };
  const validReviewAttestation = {
    schemaVersion: 'live-golden-human-review-v1',
    fingerprintVersion: 'verified-semantics-v2',
    boardUpdatedAt: reviewBoardUpdatedAt,
    boardFingerprint: liveGoldenBoardFingerprint(reviewRows),
    reviewedAt: new Date(Date.parse(reviewBoardUpdatedAt) + 1_000).toISOString(),
    reviewer: 'human-reviewer',
    reviewed: reviewRows.length,
    precisionPassed: reviewRows.length,
    malformedCount: 0,
    semanticDuplicateCount: 0,
    platformResidueCount: 0,
    sentenceResidueCount: 0,
  };
  writeJson(reviewFile, validReviewAttestation);
  const reviewedServer = createLewordApiServer({
    entitlementVerifier: null,
    liveGoldenRadar: {
      snapshot: () => reviewSnapshot,
      start: () => reviewSnapshot,
      stop: () => reviewSnapshot,
    } as any,
    liveGoldenHumanReviewFile: reviewFile,
    notificationInbox: new MobileNotificationInbox(),
    prewarmService: null,
    prewarmScheduler: null,
  });
  const reviewedPort = await listen(reviewedServer);
  try {
    const reviewMtimeBefore = fs.statSync(reviewFile).mtimeMs;
    const acceptedHealth = await fetch(`http://127.0.0.1:${reviewedPort}/health`);
    const acceptedHealthJson: any = await acceptedHealth.json();
    assert('health accepts an exact-board full human review attestation',
      acceptedHealthJson.liveGolden?.supply?.automatedSupplyGate === 'pass'
        && acceptedHealthJson.liveGolden?.supply?.superiorityGate === 'pass'
        && acceptedHealthJson.liveGolden?.humanReviewAttestation?.accepted === true
        && acceptedHealthJson.liveGolden?.humanReviewAttestation?.reason === 'human-review-passed'
        && acceptedHealthJson.liveGolden?.humanReviewAttestation?.target?.fingerprintVersion === 'verified-semantics-v2'
        && acceptedHealthJson.liveGolden?.humanReviewAttestation?.target?.boardFingerprint === validReviewAttestation.boardFingerprint
        && acceptedHealthJson.liveGolden?.humanReviewAttestation?.target?.verifiedCount === reviewRows.length
        && fs.statSync(reviewFile).mtimeMs === reviewMtimeBefore,
      JSON.stringify(acceptedHealthJson.liveGolden));
    const refreshedReviewBoardUpdatedAt = new Date(Date.parse(reviewBoardUpdatedAt) + 60_000).toISOString();
    const refreshedReviewRows = reviewRows.map((item, index) => index === 0 ? {
      ...item,
      pcSearchVolume: 250,
      mobileSearchVolume: 850,
      totalSearchVolume: 1100,
      searchVolumeMeasuredAt: refreshedReviewBoardUpdatedAt,
      updatedAt: refreshedReviewBoardUpdatedAt,
    } : item);
    reviewSnapshot.board = refreshedReviewRows;
    reviewSnapshot.verifiedSupply = refreshedReviewRows;
    reviewSnapshot.boardUpdatedAt = refreshedReviewBoardUpdatedAt;
    const refreshedHealth = await fetch(`http://127.0.0.1:${reviewedPort}/health`);
    const refreshedHealthJson: any = await refreshedHealth.json();
    assert('health keeps the human review bound across measurement-only board refreshes',
      refreshedHealthJson.liveGolden?.supply?.superiorityGate === 'pass'
        && refreshedHealthJson.liveGolden?.humanReviewAttestation?.accepted === true
        && refreshedHealthJson.liveGolden?.humanReviewAttestation?.reason === 'human-review-passed',
      JSON.stringify(refreshedHealthJson.liveGolden));
    writeJson(reviewFile, { ...validReviewAttestation, precisionPassed: 53 });
    const failedQualityHealth = await fetch(`http://127.0.0.1:${reviewedPort}/health`);
    const failedQualityHealthJson: any = await failedQualityHealth.json();
    assert('health binds but fails a human review below the precision threshold',
      failedQualityHealthJson.liveGolden?.supply?.superiorityGate === 'fail'
        && failedQualityHealthJson.liveGolden?.humanReviewAttestation?.accepted === true
        && failedQualityHealthJson.liveGolden?.humanReviewAttestation?.reason === 'human-review-precision-below-threshold',
      JSON.stringify(failedQualityHealthJson.liveGolden));
    writeJson(reviewFile, { ...validReviewAttestation, boardFingerprint: 'stale-board-fingerprint' });
    const staleHealth = await fetch(`http://127.0.0.1:${reviewedPort}/health`);
    const staleHealthJson: any = await staleHealth.json();
    assert('health rejects a stale human review when the board fingerprint differs',
      staleHealthJson.liveGolden?.supply?.superiorityGate === 'pending-human-review'
        && staleHealthJson.liveGolden?.humanReviewAttestation?.accepted === false
        && staleHealthJson.liveGolden?.humanReviewAttestation?.reason === 'human-review-board-fingerprint-mismatch',
      JSON.stringify(staleHealthJson.liveGolden));
  } finally {
    await close(reviewedServer);
    fs.rmSync(reviewRoot, { recursive: true, force: true });
  }

  console.log('[mobile-api-server-human-review.test] passed');

  // ingest 라우트: 토큰 미설정=기능 꺼짐(503), 오토큰=401, 정상 push 는 SSoT 재검증 후 스냅샷 반영.
  const ingestRadar = new MobileLiveGoldenRadar({
    notificationInbox: liveInbox,
    runOnStart: false,
    cycleLimit: 1,
    boardTarget: 10,
    maxCandidates: 60,
    categories: ['policy'],
    getEnvConfig: () => ({ naverClientId: 'client', naverClientSecret: 'secret' }),
    liveSeedProvider: async () => [],
    enableBackfill: false,
    discover: async () => [],
  });
  const savedIngestToken = process.env['LEWORD_LIVE_GOLDEN_INGEST_TOKEN'];
  delete process.env['LEWORD_LIVE_GOLDEN_INGEST_TOKEN'];
  const ingestServer = createLewordApiServer({
    entitlementVerifier: async (token) => token === 'mobile-secret'
      ? {
          ok: true,
          entitlement: { subjectId: 'mobile-user', tier: 'admin', source: 'fixture' },
        }
      : { ok: false, reason: 'fixture rejected' },
    liveGoldenRadar: ingestRadar,
    notificationInbox: liveInbox,
    prewarmService: null,
    prewarmScheduler: null,
  });
  const ingestPort = await listen(ingestServer);
  const ingestBaseUrl = `http://127.0.0.1:${ingestPort}`;
  try {
    const ingestRow = {
      keyword: '청년미래적금 200차 신청 대상',
      grade: 'S',
      score: 72,
      pcSearchVolume: 320,
      mobileSearchVolume: 1080,
      totalSearchVolume: 1400,
      documentCount: 700,
      goldenRatio: 2,
      category: 'policy',
      intent: 'live-golden',
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      searchVolumeBindingVersion: 'keyword-keyed-v2',
      searchVolumeMeasuredAt: new Date().toISOString(),
      isSearchVolumeEstimated: false,
         documentCountSource: 'naver-api',
         documentCountConfidence: 'high',
          documentCountQueryMode: 'exact-phrase',
         isDocumentCountEstimated: false,
      isMeasured: true,
      serpMeasured: true,
      winnable: true,
    };
    const disabled = await fetch(`${ingestBaseUrl}${MOBILE_LIVE_GOLDEN_ROUTES.ingest}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [ingestRow] }),
    });
    assert('ingest is disabled without configured token', disabled.status === 503, String(disabled.status));

    process.env['LEWORD_LIVE_GOLDEN_INGEST_TOKEN'] = 'ingest-secret';
    const unauthorized = await fetch(`${ingestBaseUrl}${MOBILE_LIVE_GOLDEN_ROUTES.ingest}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong-token' },
      body: JSON.stringify({ items: [ingestRow] }),
    });
    assert('ingest rejects a wrong token', unauthorized.status === 401, String(unauthorized.status));

    const acceptedRes = await fetch(`${ingestBaseUrl}${MOBILE_LIVE_GOLDEN_ROUTES.ingest}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ingest-secret' },
      body: JSON.stringify({
        source: 'api-test-desktop',
        items: [
          ingestRow,
          {
            ...ingestRow,
            keyword: 'legacy unbound desktop row',
            searchVolumeBindingVersion: undefined,
            searchVolumeMeasuredAt: undefined,
          },
          { keyword: '' },
        ],
      }),
    });
    const acceptedJson: any = await acceptedRes.json();
    assert('ingest accepts only a keyword-bound measured desktop row',
      acceptedRes.status === 200 && acceptedJson.ok === true && acceptedJson.accepted === 1,
      JSON.stringify(acceptedJson));

    const ingestSnapshotRes = await fetch(`${ingestBaseUrl}${MOBILE_LIVE_GOLDEN_ROUTES.snapshot}`, {
      headers: { Authorization: 'Bearer ingest-secret' },
    });
    const ingestSnapshotJson: any = await ingestSnapshotRes.json();
    const ingestedBoardItem = (ingestSnapshotJson.snapshot?.board || [])
      .find((item: any) => item.keyword === '청년미래적금 200차 신청 대상');
    assert('ingested row appears in the live snapshot with measured extras',
      !!ingestedBoardItem
        && ingestedBoardItem.serpMeasured === true
        && ingestedBoardItem.winnable === true
        && ingestedBoardItem.source === 'api-test-desktop',
      JSON.stringify(ingestedBoardItem || ingestSnapshotJson.snapshot?.boardCount));

    const forbiddenRun = await fetch(`${ingestBaseUrl}${MOBILE_LIVE_GOLDEN_ROUTES.run}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ingest-secret' },
      body: JSON.stringify({ cycles: 1 }),
    });
    assert('ingest token remains read-only for live golden execution',
      forbiddenRun.status === 401,
      String(forbiddenRun.status));
  } finally {
    await close(ingestServer);
    if (savedIngestToken === undefined) delete process.env['LEWORD_LIVE_GOLDEN_INGEST_TOKEN'];
    else process.env['LEWORD_LIVE_GOLDEN_INGEST_TOKEN'] = savedIngestToken;
  }

  console.log('[mobile-api-server-live-golden-ingest.test] passed');

  const persistentCacheFile = path.join(os.tmpdir(), `leword-mobile-cache-${Date.now()}.json`);
  const persistentCache = new InMemoryMobileResultCache({
    persistenceFile: persistentCacheFile,
    now: () => 1_000_000,
  });
  persistentCache.set('keyword-analysis', { keyword: '근로장려금' }, {
    ...result,
    keywords: [{
      keyword: '근로장려금 신청방법',
      grade: 'SSS',
      pcSearchVolume: 1000,
      mobileSearchVolume: 1000,
      totalSearchVolume: 2000,
      documentCount: 100,
      goldenRatio: 20,
      cpc: 120,
      category: 'policy',
      source: 'persistent-cache-fixture',
      intent: '신청방법',
      evidence: ['persistent cache'],
      isMeasured: true,
    }],
    summary: {
      total: 1,
      sss: 1,
      measured: 1,
      elapsedMs: 10,
      fromCache: false,
      parityMode: 'pc-engine',
    },
  });
  const restoredCache = new InMemoryMobileResultCache({
    persistenceFile: persistentCacheFile,
    now: () => 1_000_001,
  });
  const restored = restoredCache.get('keyword-analysis', { keyword: '근로장려금' });
  assert('persistent mobile cache survives restart',
    restored?.summary.fromCache === true && restored.keywords[0]?.keyword === '근로장려금 신청방법');

  console.log('[mobile-result-cache-persistence.test] passed');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
