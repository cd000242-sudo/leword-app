import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { createLewordApiServer } from '../../../apps/api/src/server';
import { createHttpMobileEntitlementVerifier } from '../../mobile/entitlements';
import {
  MobilePushDispatcher,
  MobilePushRegistry,
} from '../../mobile/push-notifications';
import { MobileLiveGoldenRadar } from '../../mobile/live-golden-radar';
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
  } finally {
    await close(entitlementServer);
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
  const panelAuthServer = createLewordApiServer({ executor });
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
        && String(webLoginJson.session.accessToken || '').startsWith('panel-'));
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
      keyword: 'server prewarmed pro traffic keyword',
      grade: 'SSS',
      pcSearchVolume: 900,
      mobileSearchVolume: 2200,
      totalSearchVolume: 3100,
      documentCount: 80,
      goldenRatio: 38.75,
      cpc: 210,
      category: 'pro-traffic',
      source: 'prewarm-fixture',
      intent: 'prewarmed',
      evidence: ['pro traffic prewarm fixture'],
      isMeasured: true,
    }],
    summary: {
      total: 1,
      sss: 1,
      measured: 1,
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

  const incompleteProTrafficCache = new InMemoryMobileResultCache();
  incompleteProTrafficCache.set('pro-traffic-hunter', {
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
      documentCount: 11316,
      goldenRatio: 0.89,
      cpc: 80,
      category: 'travel_domestic',
      source: 'live-golden-board-fixture',
      intent: '예약',
      evidence: ['fixture live board'],
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
        && firstKeyword.documentCount === 11316
        && firstKeyword.source === 'live-golden-board-exact-match'
        && completed.result.summary.measured === 1,
      JSON.stringify(completed.result));
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
    assert('keyword analysis overlay preserves measured PC/mobile split when board lacks split',
      firstKeyword.totalSearchVolume === 6400
        && firstKeyword.documentCount === 320
        && firstKeyword.pcSearchVolume === 1800
        && firstKeyword.mobileSearchVolume === 4600
        && firstKeyword.source === 'live-golden-board-exact-match',
      JSON.stringify(completed.result));
  } finally {
    await close(overlaySplitServer);
    fs.rmSync(overlaySplitBoardFile, { force: true });
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
      if (!snapshot.running && snapshot.cacheHits >= 2) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    assert('prewarm reuses warmed result cache',
      snapshot.running === false && snapshot.cacheHits >= 2 && prewarmExecutions === 2,
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
          keyword: `2026 흠뻑쇼 ${batch}차 일정`,
          grade: 'SSS',
          score: 92,
          searchVolume: 3000,
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
        && liveDiscoverCalls === 2
        && runJson.snapshot.boardCount === 10
        && runJson.snapshot.successfulRuns === 2
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
