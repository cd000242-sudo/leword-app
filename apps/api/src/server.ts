import http from 'http';
import path from 'path';
import {
  MOBILE_API_ENDPOINTS,
  MOBILE_AUTH_ROUTES,
  MOBILE_EXPORT_ROUTES,
  MOBILE_JOB_ROUTES,
  MOBILE_KEYWORD_GROUP_ROUTES,
  MOBILE_LIVE_GOLDEN_ROUTES,
  MOBILE_NOTIFICATION_ROUTES,
  MOBILE_PC_PARITY_SLA,
  MOBILE_PUSH_ROUTES,
  MOBILE_PREWARM_ROUTES,
  MOBILE_PRO_BLUEPRINT_ROUTES,
  MOBILE_PRO_OUTCOME_ROUTES,
  MOBILE_RANK_TRACKING_ROUTES,
  MOBILE_SCHEDULE_ROUTES,
  MOBILE_SOURCE_ROUTES,
  MOBILE_STATUS_ROUTES,
  MOBILE_WORDPRESS_ROUTES,
  type MobileAuthSession,
  type MobileApiEndpointSpec,
  type MobileDashboardSnapshot,
  type MobileJobCreateResponse,
  type MobileJobErrorResponse,
  type MobileKeywordExportRequest,
  type MobileKeywordGroupInput,
  type MobileKeywordScheduleCreateInput,
  type MobileKeywordScheduleUpdateInput,
  type MobileWordPressDraftInput,
  type MobileWordPressPublishInput,
  type MobileWordPressSiteInput,
  type MobileSignalItem,
  type MobilePushSubscriptionRequest,
  type MobileProOutcomeDeleteInput,
  type MobileProOutcomeRecordInput,
  type MobileProBlueprintInput,
  type MobileProDraftInput,
  type MobileProPortfolioRevenueInput,
  type MobileProRevenueConfigInput,
  type MobileProRevenueEstimateInput,
  type MobileProTrackedPostInput,
  type MobileRankTrackingManualInput,
  type MobileRankTrackingPairInput,
  type MobileRankTrackingRunInput,
} from '../../../src/mobile/contracts';
import {
  InMemoryMobileJobStore,
  type MobileJobExecutor,
} from '../../../src/mobile/job-orchestrator';
import { createMobilePcEngineExecutor } from '../../../src/mobile/pc-engine-executor';
import { MobileNotificationInbox } from '../../../src/mobile/notification-inbox';
import {
  createEnvironmentMobilePushSender,
  MobilePushDispatcher,
  MobilePushRegistry,
} from '../../../src/mobile/push-notifications';
import { MobilePrewarmService } from '../../../src/mobile/prewarm-service';
import {
  createMobilePrewarmSchedulerFromEnv,
  type MobilePrewarmScheduler,
} from '../../../src/mobile/prewarm-scheduler';
import {
  createMobileLiveGoldenRadarFromEnv,
  type MobileLiveGoldenRadar,
} from '../../../src/mobile/live-golden-radar';
import { InMemoryMobileResultCache } from '../../../src/mobile/result-cache';
import {
  createEnvironmentMobileEntitlementVerifier,
  getMinimumMobileEntitlementTier,
  isMobileEntitlementAllowed,
  type MobileEntitlementTier,
  type MobileEntitlementVerifier,
} from '../../../src/mobile/entitlements';
import {
  getMobileRuntimeReadiness,
} from '../../../src/mobile/runtime-readiness';
import { buildMobilePcFeatureCatalog } from '../../../src/mobile/pc-feature-catalog';
import { buildMobileKeywordExportArtifact } from '../../../src/mobile/export-share';
import { buildMobileApiStatusSnapshot } from '../../../src/mobile/api-status';
import {
  addMobileKeywordGroup,
  deleteMobileKeywordGroup,
  readMobileKeywordGroupSnapshot,
  updateMobileKeywordGroup,
} from '../../../src/mobile/keyword-groups';
import {
  addMobileKeywordSchedule,
  buildMobileScheduleDashboardSnapshot,
  deleteMobileKeywordSchedule,
  updateMobileKeywordSchedule,
} from '../../../src/mobile/schedule-dashboard';
import {
  addMobileProTrackedPost,
  addMobileRankTrackingManualPair,
  readMobileRankTrackingSnapshot,
  removeMobileRankTrackingPair,
  runMobileRankTrackingSerpCheck,
} from '../../../src/mobile/rank-tracking';
import {
  deleteMobileProOutcome,
  readMobileProOutcomeSnapshot,
  recordMobileProOutcome,
  syncMobileProOutcomesFromRankTracker,
} from '../../../src/mobile/pro-outcomes';
import {
  estimateMobileProRevenue,
  estimateMobileProPortfolioRevenue,
  generateMobileProBlueprint,
  generateMobileProDraft,
  getMobileProCategoryRpmTable,
  loadMobileProRevenueConfig,
  saveMobileProRevenueConfig,
  type MobileProBlueprintServices,
} from '../../../src/mobile/pro-blueprint';
import {
  createMobileWordPressDraft,
  publishMobileWordPressDraft,
  readMobileWordPressSnapshot,
  refreshMobileWordPressCategories,
  upsertMobileWordPressSite,
} from '../../../src/mobile/wordpress-publishing';
import { buildMobileSourceSignalSnapshot, fallbackSourceSignals } from '../../../src/mobile/source-signals';
import {
  getMobileApiGuardrailOptions,
  MobileApiBodyTooLargeError,
  MobileApiRateLimiter,
  parseMobileJsonBody,
  type MobileApiGuardrailOptions,
} from '../../../src/mobile/api-guardrails';

export interface LewordApiServerOptions {
  executor?: MobileJobExecutor;
  store?: InMemoryMobileJobStore;
  notificationInbox?: MobileNotificationInbox | null;
  pushRegistry?: MobilePushRegistry | null;
  pushDispatcher?: MobilePushDispatcher | null;
  resultCache?: InMemoryMobileResultCache | null;
  prewarmService?: MobilePrewarmService | null;
  prewarmScheduler?: MobilePrewarmScheduler | null;
  liveGoldenRadar?: MobileLiveGoldenRadar | null;
  authToken?: string | null;
  entitlementVerifier?: MobileEntitlementVerifier | null;
  apiGuardrails?: Partial<MobileApiGuardrailOptions> | null;
  rateLimiter?: MobileApiRateLimiter | null;
  proBlueprintServices?: MobileProBlueprintServices;
}

function json(
  res: http.ServerResponse,
  statusCode: number,
  body: unknown,
  headers: Record<string, string | number> = {},
): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  });
  res.end(JSON.stringify(body));
}

function notFound(res: http.ServerResponse, message = 'endpoint not found'): void {
  json(res, 404, { ok: false, message } satisfies MobileJobErrorResponse);
}

function unauthorized(res: http.ServerResponse): void {
  json(res, 401, { ok: false, message: 'mobile API authorization required' } satisfies MobileJobErrorResponse);
}

function forbidden(res: http.ServerResponse, message = 'mobile license tier is not allowed for this endpoint'): void {
  json(res, 403, { ok: false, message } satisfies MobileJobErrorResponse);
}

function payloadTooLarge(res: http.ServerResponse, maxBodyBytes: number): void {
  json(res, 413, {
    ok: false,
    message: `mobile API request body is too large; max ${maxBodyBytes} bytes`,
  } satisfies MobileJobErrorResponse);
}

function rateLimited(
  res: http.ServerResponse,
  result: ReturnType<MobileApiRateLimiter['check']>,
): void {
  json(res, 429, {
    ok: false,
    message: 'mobile API rate limit exceeded',
  } satisfies MobileJobErrorResponse, {
    'Retry-After': Math.max(1, Math.ceil(result.retryAfterMs / 1000)),
    'X-RateLimit-Remaining': result.remaining,
  });
}

function getRequiredAuthToken(options: LewordApiServerOptions): string {
  const explicit = options.authToken;
  if (typeof explicit === 'string') return explicit.trim();
  if (explicit === null) return '';
  return (process.env['LEWORD_MOBILE_API_TOKEN'] || '').trim();
}

function getBearerToken(req: http.IncomingMessage): string {
  const authorization = req.headers.authorization || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

async function authorizeMobileRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  verifier: MobileEntitlementVerifier | null,
  requiredTier: MobileEntitlementTier,
): Promise<boolean> {
  if (!verifier) return true;
  const token = getBearerToken(req);
  if (!token) {
    unauthorized(res);
    return false;
  }

  const verification = await verifier(token);
  if (!verification.ok || !verification.entitlement) {
    unauthorized(res);
    return false;
  }

  if (!isMobileEntitlementAllowed(verification.entitlement, requiredTier)) {
    forbidden(res);
    return false;
  }

  return true;
}

function jobLinks(jobId: string): MobileJobCreateResponse['links'] {
  return {
    self: MOBILE_JOB_ROUTES.self.replace(':jobId', jobId),
    events: MOBILE_JOB_ROUTES.events.replace(':jobId', jobId),
    cancel: MOBILE_JOB_ROUTES.cancel.replace(':jobId', jobId),
  };
}

function extractJobRoute(pathname: string): { jobId: string; events: boolean } | null {
  const eventsMatch = pathname.match(/^\/v1\/jobs\/([^/]+)\/events$/);
  if (eventsMatch) return { jobId: decodeURIComponent(eventsMatch[1]), events: true };

  const jobMatch = pathname.match(/^\/v1\/jobs\/([^/]+)$/);
  if (jobMatch) return { jobId: decodeURIComponent(jobMatch[1]), events: false };

  return null;
}

function requestApiBaseUrl(req: http.IncomingMessage): string {
  const publicUrl = (process.env['LEWORD_PUBLIC_API_URL'] || '').trim().replace(/\/+$/, '');
  if (publicUrl) return publicUrl;
  const host = req.headers.host || `localhost:${process.env['LEWORD_API_PORT'] || 34983}`;
  return `http://${host}`.replace(/\/+$/, '');
}

function signal(
  kind: MobileSignalItem['kind'],
  id: string,
  keyword: string,
  title: string,
  description: string,
  priority: number,
  source = 'leword-pc-engine',
  categoryId?: string,
): MobileSignalItem {
  return {
    id,
    kind,
    keyword,
    title,
    description,
    source,
    priority,
    categoryId,
    createdAt: new Date().toISOString(),
  };
}

function fallbackDashboardSignals(): {
  realtime: MobileSignalItem[];
  policy: MobileSignalItem[];
  issues: MobileSignalItem[];
} {
  const fallback = fallbackSourceSignals();
  return {
    realtime: fallback.realtime,
    policy: fallback.policy,
    issues: fallback.issues,
  };
}

function buildDashboard(
  req: http.IncomingMessage,
  notificationInbox: MobileNotificationInbox | null,
  prewarmService: MobilePrewarmService | null,
  liveGoldenRadar: MobileLiveGoldenRadar | null,
  apiBaseUrl = requestApiBaseUrl(req),
): MobileDashboardSnapshot {
  const fallback = fallbackDashboardSignals();
  const notifications = notificationInbox?.snapshot(12) || null;
  const prewarm = prewarmService?.snapshot() || null;
  const liveGolden = liveGoldenRadar?.snapshot() || null;
  const winnerSignals = (notifications?.items || []).slice(0, 6).map((item, index) => signal(
    item.kind === 'fresh-issue' ? 'issue' : item.product === 'home-board-hunter' ? 'policy' : 'realtime',
    `notification-${item.id}`,
    item.keyword,
    item.title,
    item.evidence[0] || item.intent || item.source,
    100 - index,
    item.source,
    item.category,
  ));

  const realtime = [
    ...winnerSignals.filter((item) => item.kind === 'realtime'),
    ...fallback.realtime,
  ].slice(0, 6);
  const policy = [
    ...winnerSignals.filter((item) => item.kind === 'policy'),
    ...fallback.policy,
  ].slice(0, 6);
  const issues = [
    ...winnerSignals.filter((item) => item.kind === 'issue'),
    ...fallback.issues,
  ].slice(0, 6);

  return {
    updatedAt: new Date().toISOString(),
    apiBaseUrl,
    pcLinked: true,
    realtime,
    policy,
    issues,
    notifications,
    prewarm,
    liveGolden,
  };
}

function normalizeLoginTier(value: unknown): string {
  const tier = String(value || '').toLowerCase();
  if (tier === 'admin' || tier === 'unlimited' || tier === 'pro' || tier === 'standard') return tier;
  return 'standard';
}

async function verifyPanelLogin(body: any): Promise<{
  ok: boolean;
  accessToken?: string;
  apiBaseUrl?: string;
  userId?: string;
  tier?: string;
  message?: string;
}> {
  const panelUrl = String(body?.panelServerUrl || process.env['LEWORD_MOBILE_PANEL_LOGIN_URL'] || '').trim();
  if (!panelUrl) return { ok: false, message: 'panel login url missing' };

  const response = await fetch(panelUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: body?.userId,
      userPassword: body?.password,
      password: body?.password,
      licenseCode: body?.licenseCode || '',
      appId: 'com.leword.mobile',
      requestedAt: new Date().toISOString(),
    }),
  });
  if (!response.ok) return { ok: false, message: `panel login HTTP ${response.status}` };
  const payload = await response.json();
  if (!payload?.ok && !payload?.valid && !payload?.success) {
    return { ok: false, message: payload?.message || payload?.error || 'panel login rejected' };
  }
  return {
    ok: true,
    accessToken: String(payload.accessToken || payload.mobileToken || payload.token || '').trim(),
    apiBaseUrl: String(payload.apiBaseUrl || payload.pcApiBaseUrl || payload.mobileApiBaseUrl || '').trim().replace(/\/+$/, ''),
    userId: String(payload.userId || body?.userId || 'mobile-user'),
    tier: normalizeLoginTier(payload.tier || payload.plan || payload.licenseType),
    message: payload.message || '패널 서버와 연동되었습니다.',
  };
}

async function createLoginSession(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  verifier: MobileEntitlementVerifier | null,
  notificationInbox: MobileNotificationInbox | null,
  prewarmService: MobilePrewarmService | null,
  liveGoldenRadar: MobileLiveGoldenRadar | null,
  maxBodyBytes: number,
): Promise<void> {
  try {
    const body = await parseBody(req, maxBodyBytes) as any;
    const userId = String(body?.userId || '').trim();
    const password = String(body?.password || '').trim();
    const candidateToken = String(body?.accessToken || body?.mobileToken || body?.token || password || '').trim();

    if (!userId || !password) {
      json(res, 400, { ok: false, message: '아이디와 비밀번호가 필요합니다.' } satisfies MobileJobErrorResponse);
      return;
    }

    if (candidateToken && verifier) {
      const verified = await verifier(candidateToken);
      if (verified.ok && verified.entitlement) {
        const apiBaseUrl = requestApiBaseUrl(req);
        const session: MobileAuthSession = {
          ok: true,
          accessToken: candidateToken,
          userId: verified.entitlement.subjectId || userId,
          tier: verified.entitlement.tier,
          apiBaseUrl,
          pcLinked: true,
          source: 'mobile-token',
          linkedAt: new Date().toISOString(),
          message: 'PC API와 자동 연동되었습니다.',
          dashboard: buildDashboard(req, notificationInbox, prewarmService, liveGoldenRadar, apiBaseUrl),
        };
        json(res, 200, { ok: true, session });
        return;
      }
    }

    const panel: {
      ok: boolean;
      accessToken?: string;
      apiBaseUrl?: string;
      userId?: string;
      tier?: string;
      message?: string;
    } = await verifyPanelLogin(body).catch((err) => ({
      ok: false,
      message: (err as Error).message || 'panel login failed',
    }));
    if (panel.ok) {
      const token = panel.accessToken || candidateToken || `panel-${Date.now().toString(36)}`;
      const apiBaseUrl = panel.apiBaseUrl || requestApiBaseUrl(req);
      const session: MobileAuthSession = {
        ok: true,
        accessToken: token,
        userId: panel.userId || userId,
        tier: panel.tier || 'standard',
        apiBaseUrl,
        pcLinked: true,
        source: 'panel-server',
        linkedAt: new Date().toISOString(),
        message: panel.message || '패널 서버와 PC API가 연동되었습니다.',
        dashboard: buildDashboard(req, notificationInbox, prewarmService, liveGoldenRadar, apiBaseUrl),
      };
      json(res, 200, { ok: true, session });
      return;
    }

    if (!verifier) {
      const apiBaseUrl = requestApiBaseUrl(req);
      const session: MobileAuthSession = {
        ok: true,
        accessToken: candidateToken || 'local-dev-mobile',
        userId,
        tier: 'admin',
        apiBaseUrl,
        pcLinked: true,
        source: 'local-dev',
        linkedAt: new Date().toISOString(),
        message: '로컬 PC API와 자동 연동되었습니다.',
        dashboard: buildDashboard(req, notificationInbox, prewarmService, liveGoldenRadar, apiBaseUrl),
      };
      json(res, 200, { ok: true, session });
      return;
    }

    json(res, 401, { ok: false, message: panel.message || '로그인에 실패했습니다.' } satisfies MobileJobErrorResponse);
  } catch (err) {
    handleBodyError(res, err, maxBodyBytes);
  }
}

function parseBody(req: http.IncomingMessage, maxBodyBytes: number): Promise<unknown> {
  return parseMobileJsonBody(req, maxBodyBytes);
}

function handleBodyError(res: http.ServerResponse, err: unknown, maxBodyBytes: number): void {
  if (err instanceof MobileApiBodyTooLargeError) {
    payloadTooLarge(res, maxBodyBytes);
    return;
  }
  json(res, 400, { ok: false, message: 'invalid json body' } satisfies MobileJobErrorResponse);
}

function streamJobEvents(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  store: InMemoryMobileJobStore,
  jobId: string,
): void {
  const job = store.get(jobId);
  if (!job) {
    notFound(res, 'job not found');
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const writeEvent = (event: unknown) => {
    res.write(`event: job\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  for (const event of store.getEvents(jobId)) {
    writeEvent(event);
  }

  const unsubscribe = store.subscribe(jobId, writeEvent);
  req.on('close', unsubscribe);
}

async function createJob(
  res: http.ServerResponse,
  endpoint: MobileApiEndpointSpec,
  req: http.IncomingMessage,
  store: InMemoryMobileJobStore,
  pcWorkerExecutor: MobileJobExecutor,
  resultCache: InMemoryMobileResultCache | null,
  maxBodyBytes: number,
): Promise<void> {
  try {
    const params = await parseBody(req, maxBodyBytes);
    const cachedResult = resultCache?.get(endpoint.product, params);
    const job = cachedResult
      ? store.createCompleted(endpoint.product, params, cachedResult)
      : store.create(endpoint.product, params, async (job, context) => {
        const result = await pcWorkerExecutor(job, context);
        resultCache?.set(endpoint.product, params, result);
        return result;
      });

    json(res, 202, {
      ok: true,
      job,
      stream: endpoint.transport,
      links: jobLinks(job.id),
    } satisfies MobileJobCreateResponse);
  } catch (err) {
    handleBodyError(res, err, maxBodyBytes);
  }
}

export function createLewordApiServer(options: LewordApiServerOptions = {}): http.Server {
  const store = options.store || new InMemoryMobileJobStore();
  const pushRegistry = options.pushRegistry === null
    ? null
    : options.pushRegistry || new MobilePushRegistry();
  const pushDispatcher = options.pushDispatcher === null || !pushRegistry
    ? null
    : options.pushDispatcher || new MobilePushDispatcher({
      registry: pushRegistry,
      sender: createEnvironmentMobilePushSender(),
    });
  const notificationInbox = options.notificationInbox === null
    ? null
    : options.notificationInbox || new MobileNotificationInbox();
  notificationInbox?.setPublishListener((items) => {
    void pushDispatcher?.publish(items);
  });
  const pcWorkerExecutor = options.executor || createMobilePcEngineExecutor();
  const resultCache = options.resultCache === null
    ? null
    : options.resultCache || new InMemoryMobileResultCache({
      persistenceFile: process.env['LEWORD_MOBILE_CACHE_FILE']
        || path.join(process.cwd(), '.leword-mobile-cache.json'),
    });
  const prewarmService = options.prewarmService === null || !resultCache
    ? null
    : options.prewarmService || new MobilePrewarmService({
      executor: pcWorkerExecutor,
      resultCache,
      notificationInbox,
    });
  const prewarmScheduler = options.prewarmScheduler === null || !prewarmService
    ? null
    : options.prewarmScheduler || createMobilePrewarmSchedulerFromEnv(prewarmService);
  const liveGoldenRadar = options.liveGoldenRadar === null || !notificationInbox
    ? null
    : options.liveGoldenRadar || createMobileLiveGoldenRadarFromEnv(notificationInbox, () => {
      const stats = store.stats();
      if (stats.running > 0 || stats.queued > 0) {
        return { ok: false, message: 'manual mobile job queue is busy' };
      }
      if (prewarmService?.snapshot().running) {
        return { ok: false, message: 'server prewarm is running' };
      }
      return { ok: true };
    });
  const entitlementVerifier = options.entitlementVerifier === null
    ? null
    : options.entitlementVerifier || createEnvironmentMobileEntitlementVerifier({
      staticToken: getRequiredAuthToken(options),
    });
  const apiGuardrails = options.apiGuardrails === null
    ? null
    : {
      ...getMobileApiGuardrailOptions(),
      ...(options.apiGuardrails || {}),
    };
  const rateLimiter = options.rateLimiter === null || !apiGuardrails
    ? null
    : options.rateLimiter || new MobileApiRateLimiter(apiGuardrails);
  const maxBodyBytes = apiGuardrails?.maxBodyBytes || getMobileApiGuardrailOptions().maxBodyBytes;
  const proBlueprintServices = options.proBlueprintServices;

  const server = http.createServer((req, res) => {
    void (async () => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (rateLimiter && url.pathname !== '/health') {
      const limit = rateLimiter.check(req);
      if (!limit.ok) {
        rateLimited(res, limit);
        return;
      }
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      json(res, 200, {
        ok: true,
        service: 'leword-api',
        parity: MOBILE_PC_PARITY_SLA,
        endpoints: MOBILE_API_ENDPOINTS.length,
        jobRoutes: MOBILE_JOB_ROUTES,
        notificationRoutes: MOBILE_NOTIFICATION_ROUTES,
        liveGoldenRoutes: MOBILE_LIVE_GOLDEN_ROUTES,
        pushRoutes: MOBILE_PUSH_ROUTES,
        wordpressRoutes: MOBILE_WORDPRESS_ROUTES,
        rankTrackingRoutes: MOBILE_RANK_TRACKING_ROUTES,
        proOutcomeRoutes: MOBILE_PRO_OUTCOME_ROUTES,
        proBlueprintRoutes: MOBILE_PRO_BLUEPRINT_ROUTES,
        jobs: store.stats(),
        notifications: notificationInbox?.snapshot(1) || null,
        push: pushDispatcher?.snapshot(1) || null,
        cache: {
          enabled: !!resultCache,
          size: resultCache?.size() || 0,
        },
        guardrails: {
          enabled: !!apiGuardrails,
          maxBodyBytes,
          rateLimit: rateLimiter?.snapshot() || null,
        },
        prewarm: {
          enabled: !!prewarmService,
          running: prewarmService?.snapshot().running || false,
          scheduler: prewarmScheduler?.snapshot() || null,
        },
        liveGolden: liveGoldenRadar?.snapshot() || null,
        runtime: getMobileRuntimeReadiness(),
      });
      return;
    }

    const jobRoute = extractJobRoute(url.pathname);
    const notificationReadMatch = url.pathname.match(/^\/v1\/notifications\/([^/]+)\/read$/);
    const pushUnregisterMatch = url.pathname.match(/^\/v1\/push\/subscriptions\/([^/]+)$/);
    const keywordGroupMatch = url.pathname.match(/^\/v1\/mobile\/keyword-groups\/([^/]+)$/);
    const scheduleMatch = url.pathname.match(/^\/v1\/mobile\/schedules\/([^/]+)$/);

    if (req.method === 'POST' && url.pathname === MOBILE_AUTH_ROUTES.login) {
      await createLoginSession(req, res, entitlementVerifier, notificationInbox, prewarmService, liveGoldenRadar, maxBodyBytes);
      return;
    }

    if (req.method === 'GET' && url.pathname === MOBILE_AUTH_ROUTES.dashboard) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard')) return;
      json(res, 200, { ok: true, dashboard: buildDashboard(req, notificationInbox, prewarmService, liveGoldenRadar) });
      return;
    }

    if (req.method === 'GET' && url.pathname === MOBILE_AUTH_ROUTES.pcFeatures) {
      json(res, 200, { ok: true, catalog: buildMobilePcFeatureCatalog() });
      return;
    }

    if (req.method === 'GET' && url.pathname === MOBILE_SOURCE_ROUTES.signals) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard')) return;
      const laneParam = url.searchParams.get('lane') || 'all';
      const lane = ['all', 'realtime', 'policy', 'issues'].includes(laneParam) ? laneParam as any : 'all';
      const limit = Number(url.searchParams.get('limit') || 6);
      const snapshot = await buildMobileSourceSignalSnapshot({ lane, limit });
      json(res, 200, { ok: true, snapshot });
      return;
    }

    if (req.method === 'GET' && url.pathname === MOBILE_STATUS_ROUTES.apiStatus) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard')) return;
      json(res, 200, {
        ok: true,
        snapshot: buildMobileApiStatusSnapshot({
          apiBaseUrl: requestApiBaseUrl(req),
        }),
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === MOBILE_EXPORT_ROUTES.keywords) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard')) return;
      try {
        const body = await parseBody(req, maxBodyBytes) as MobileKeywordExportRequest;
        const artifact = buildMobileKeywordExportArtifact(body);
        json(res, 200, { ok: true, artifact });
      } catch (err) {
        if (err instanceof MobileApiBodyTooLargeError) {
          payloadTooLarge(res, maxBodyBytes);
        } else {
          json(res, 400, { ok: false, message: (err as Error).message || 'invalid keyword export request' } satisfies MobileJobErrorResponse);
        }
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === MOBILE_WORDPRESS_ROUTES.snapshot) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard')) return;
      json(res, 200, { ok: true, snapshot: readMobileWordPressSnapshot() });
      return;
    }

    if (req.method === 'POST' && url.pathname === MOBILE_WORDPRESS_ROUTES.site) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard')) return;
      try {
        const body = await parseBody(req, maxBodyBytes) as MobileWordPressSiteInput;
        const saved = upsertMobileWordPressSite({ input: body });
        json(res, 201, { ok: true, site: saved.site, snapshot: saved.snapshot });
      } catch (err) {
        handleBodyError(res, err, maxBodyBytes);
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === MOBILE_WORDPRESS_ROUTES.categories) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard')) return;
      try {
        const refreshed = await refreshMobileWordPressCategories({
          siteId: url.searchParams.get('siteId') || undefined,
        });
        json(res, 200, {
          ok: true,
          site: refreshed.site,
          categories: refreshed.categories,
          snapshot: refreshed.snapshot,
        });
      } catch (err) {
        json(res, 502, {
          ok: false,
          message: (err as Error).message || 'WordPress categories request failed',
        } satisfies MobileJobErrorResponse);
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === MOBILE_WORDPRESS_ROUTES.drafts) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard')) return;
      try {
        const body = await parseBody(req, maxBodyBytes) as MobileWordPressDraftInput;
        const created = createMobileWordPressDraft({ input: body });
        json(res, 201, { ok: true, draft: created.draft, snapshot: created.snapshot });
      } catch (err) {
        handleBodyError(res, err, maxBodyBytes);
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === MOBILE_WORDPRESS_ROUTES.publish) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard')) return;
      try {
        const body = await parseBody(req, maxBodyBytes) as MobileWordPressPublishInput;
        const published = await publishMobileWordPressDraft({ input: body });
        json(res, 201, {
          ok: true,
          result: published.result,
          draft: published.draft,
          snapshot: published.snapshot,
        });
      } catch (err) {
        if (err instanceof MobileApiBodyTooLargeError) {
          payloadTooLarge(res, maxBodyBytes);
        } else {
          json(res, 502, {
            ok: false,
            message: (err as Error).message || 'WordPress publish request failed',
          } satisfies MobileJobErrorResponse);
        }
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === MOBILE_KEYWORD_GROUP_ROUTES.list) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard')) return;
      json(res, 200, { ok: true, snapshot: readMobileKeywordGroupSnapshot() });
      return;
    }

    if (req.method === 'GET' && url.pathname === MOBILE_SCHEDULE_ROUTES.dashboard) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard')) return;
      json(res, 200, { ok: true, snapshot: buildMobileScheduleDashboardSnapshot() });
      return;
    }

    if (req.method === 'GET' && url.pathname === MOBILE_RANK_TRACKING_ROUTES.snapshot) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard')) return;
      json(res, 200, { ok: true, snapshot: readMobileRankTrackingSnapshot() });
      return;
    }

    if (req.method === 'POST' && url.pathname === MOBILE_RANK_TRACKING_ROUTES.manual) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard')) return;
      try {
        const body = await parseBody(req, maxBodyBytes) as MobileRankTrackingManualInput;
        const result = addMobileRankTrackingManualPair({ input: body });
        json(res, result.success ? 201 : 409, { ok: result.success, result });
      } catch (err) {
        handleBodyError(res, err, maxBodyBytes);
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === MOBILE_RANK_TRACKING_ROUTES.proPost) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard')) return;
      try {
        const body = await parseBody(req, maxBodyBytes) as MobileProTrackedPostInput;
        const result = addMobileProTrackedPost({ input: body });
        json(res, result.success ? 201 : 400, { ok: result.success, result });
      } catch (err) {
        handleBodyError(res, err, maxBodyBytes);
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === MOBILE_RANK_TRACKING_ROUTES.run) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard')) return;
      try {
        const body = await parseBody(req, maxBodyBytes) as MobileRankTrackingRunInput;
        const result = await runMobileRankTrackingSerpCheck({ input: body });
        json(res, 202, { ok: result.success, result });
      } catch (err) {
        handleBodyError(res, err, maxBodyBytes);
      }
      return;
    }

    if (req.method === 'DELETE' && url.pathname === MOBILE_RANK_TRACKING_ROUTES.pair) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard')) return;
      try {
        const body = await parseBody(req, maxBodyBytes) as MobileRankTrackingPairInput;
        const result = removeMobileRankTrackingPair({ input: body });
        json(res, 200, { ok: true, result });
      } catch (err) {
        handleBodyError(res, err, maxBodyBytes);
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === MOBILE_PRO_OUTCOME_ROUTES.snapshot) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard')) return;
      json(res, 200, { ok: true, snapshot: readMobileProOutcomeSnapshot() });
      return;
    }

    if (req.method === 'POST' && url.pathname === MOBILE_PRO_OUTCOME_ROUTES.record) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard')) return;
      try {
        const body = await parseBody(req, maxBodyBytes) as MobileProOutcomeRecordInput;
        const result = recordMobileProOutcome({ input: body });
        json(res, result.success ? 201 : 400, { ok: result.success, result });
      } catch (err) {
        handleBodyError(res, err, maxBodyBytes);
      }
      return;
    }

    if (req.method === 'DELETE' && url.pathname === MOBILE_PRO_OUTCOME_ROUTES.item) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard')) return;
      try {
        const body = await parseBody(req, maxBodyBytes) as MobileProOutcomeDeleteInput;
        const result = deleteMobileProOutcome({ input: body });
        json(res, 200, { ok: true, result });
      } catch (err) {
        handleBodyError(res, err, maxBodyBytes);
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === MOBILE_PRO_OUTCOME_ROUTES.sync) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard')) return;
      const result = syncMobileProOutcomesFromRankTracker();
      json(res, 202, { ok: true, result });
      return;
    }

    if (req.method === 'POST' && url.pathname === MOBILE_PRO_BLUEPRINT_ROUTES.blueprint) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'pro')) return;
      try {
        const body = await parseBody(req, maxBodyBytes) as MobileProBlueprintInput;
        const result = await generateMobileProBlueprint({ input: body, services: proBlueprintServices });
        json(res, result.success ? 200 : 400, { ok: result.success, result });
      } catch (err) {
        handleBodyError(res, err, maxBodyBytes);
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === MOBILE_PRO_BLUEPRINT_ROUTES.draft) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'pro')) return;
      try {
        const body = await parseBody(req, maxBodyBytes) as MobileProDraftInput;
        const result = await generateMobileProDraft({ input: body, services: proBlueprintServices });
        json(res, result.success ? 200 : 400, { ok: result.success, result });
      } catch (err) {
        handleBodyError(res, err, maxBodyBytes);
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === MOBILE_PRO_BLUEPRINT_ROUTES.revenue) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'pro')) return;
      try {
        const body = await parseBody(req, maxBodyBytes) as MobileProRevenueEstimateInput;
        const result = estimateMobileProRevenue({ input: body });
        json(res, result.success ? 200 : 400, { ok: result.success, result });
      } catch (err) {
        handleBodyError(res, err, maxBodyBytes);
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === MOBILE_PRO_BLUEPRINT_ROUTES.revenueConfig) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'pro')) return;
      const result = loadMobileProRevenueConfig();
      json(res, 200, { ok: true, result });
      return;
    }

    if (req.method === 'POST' && url.pathname === MOBILE_PRO_BLUEPRINT_ROUTES.revenueConfig) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'pro')) return;
      try {
        const body = await parseBody(req, maxBodyBytes) as MobileProRevenueConfigInput;
        const result = saveMobileProRevenueConfig({ input: body });
        json(res, result.success ? 200 : 400, { ok: result.success, result });
      } catch (err) {
        handleBodyError(res, err, maxBodyBytes);
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === MOBILE_PRO_BLUEPRINT_ROUTES.categoryRpm) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'pro')) return;
      const result = getMobileProCategoryRpmTable();
      json(res, 200, { ok: true, result });
      return;
    }

    if (req.method === 'POST' && url.pathname === MOBILE_PRO_BLUEPRINT_ROUTES.portfolioRevenue) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'pro')) return;
      try {
        const body = await parseBody(req, maxBodyBytes) as MobileProPortfolioRevenueInput;
        const result = estimateMobileProPortfolioRevenue({ input: body });
        json(res, result.success ? 200 : 400, { ok: result.success, result });
      } catch (err) {
        handleBodyError(res, err, maxBodyBytes);
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === MOBILE_SCHEDULE_ROUTES.list) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard')) return;
      try {
        const body = await parseBody(req, maxBodyBytes) as MobileKeywordScheduleCreateInput;
        const created = addMobileKeywordSchedule({ input: body });
        json(res, 201, { ok: true, schedule: created.schedule, snapshot: created.snapshot });
      } catch (err) {
        if (err instanceof MobileApiBodyTooLargeError) {
          payloadTooLarge(res, maxBodyBytes);
        } else {
          json(res, 400, { ok: false, message: (err as Error).message || 'invalid keyword schedule' } satisfies MobileJobErrorResponse);
        }
      }
      return;
    }

    if (scheduleMatch && req.method === 'PATCH') {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard')) return;
      try {
        const body = await parseBody(req, maxBodyBytes) as MobileKeywordScheduleUpdateInput;
        const updated = updateMobileKeywordSchedule({
          id: decodeURIComponent(scheduleMatch[1]),
          updates: body || {},
        });
        if (!updated.schedule) {
          notFound(res, 'keyword schedule not found');
          return;
        }
        json(res, 200, { ok: true, schedule: updated.schedule, snapshot: updated.snapshot });
      } catch (err) {
        if (err instanceof MobileApiBodyTooLargeError) {
          payloadTooLarge(res, maxBodyBytes);
        } else {
          json(res, 400, { ok: false, message: (err as Error).message || 'invalid keyword schedule update' } satisfies MobileJobErrorResponse);
        }
      }
      return;
    }

    if (scheduleMatch && req.method === 'DELETE') {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard')) return;
      const deleted = deleteMobileKeywordSchedule({
        id: decodeURIComponent(scheduleMatch[1]),
      });
      if (!deleted.removed) {
        notFound(res, 'keyword schedule not found');
        return;
      }
      json(res, 200, { ok: true, schedule: deleted.schedule, snapshot: deleted.snapshot });
      return;
    }

    if (req.method === 'POST' && url.pathname === MOBILE_KEYWORD_GROUP_ROUTES.list) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard')) return;
      try {
        const body = await parseBody(req, maxBodyBytes) as MobileKeywordGroupInput;
        const created = addMobileKeywordGroup({ input: body });
        json(res, 201, { ok: true, group: created.group, snapshot: created.snapshot });
      } catch (err) {
        handleBodyError(res, err, maxBodyBytes);
      }
      return;
    }

    if (keywordGroupMatch && req.method === 'PATCH') {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard')) return;
      try {
        const body = await parseBody(req, maxBodyBytes) as MobileKeywordGroupInput;
        const updated = updateMobileKeywordGroup({
          id: decodeURIComponent(keywordGroupMatch[1]),
          updates: body,
        });
        if (!updated.group) {
          notFound(res, 'keyword group not found');
          return;
        }
        json(res, 200, { ok: true, group: updated.group, snapshot: updated.snapshot });
      } catch (err) {
        handleBodyError(res, err, maxBodyBytes);
      }
      return;
    }

    if (keywordGroupMatch && req.method === 'DELETE') {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard')) return;
      const deleted = deleteMobileKeywordGroup({
        id: decodeURIComponent(keywordGroupMatch[1]),
      });
      if (!deleted.removed) {
        notFound(res, 'keyword group not found');
        return;
      }
      json(res, 200, { ok: true, snapshot: deleted.snapshot });
      return;
    }

    if (req.method === 'POST' && url.pathname === MOBILE_PUSH_ROUTES.register) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard')) return;
      if (!pushRegistry || !pushDispatcher) {
        json(res, 503, { ok: false, message: 'mobile push service disabled' } satisfies MobileJobErrorResponse);
        return;
      }
      try {
        const body = await parseBody(req, maxBodyBytes) as MobilePushSubscriptionRequest;
        const subscription = pushRegistry.upsert(body);
        json(res, 200, { ok: true, subscription, snapshot: pushDispatcher.snapshot() });
      } catch (err) {
        if (err instanceof MobileApiBodyTooLargeError) {
          payloadTooLarge(res, maxBodyBytes);
        } else {
          json(res, 400, { ok: false, message: (err as Error).message || 'invalid mobile push subscription' } satisfies MobileJobErrorResponse);
        }
      }
      return;
    }

    if (req.method === 'DELETE' && pushUnregisterMatch) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard')) return;
      if (!pushRegistry || !pushDispatcher) {
        json(res, 503, { ok: false, message: 'mobile push service disabled' } satisfies MobileJobErrorResponse);
        return;
      }
      const subscription = pushRegistry.disable(decodeURIComponent(pushUnregisterMatch[1]));
      if (!subscription) {
        notFound(res, 'push subscription not found');
        return;
      }
      json(res, 200, { ok: true, subscription, snapshot: pushDispatcher.snapshot() });
      return;
    }

    if (req.method === 'GET' && url.pathname === MOBILE_NOTIFICATION_ROUTES.inbox) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard')) return;
      if (!notificationInbox) {
        json(res, 503, { ok: false, message: 'mobile notification inbox disabled' } satisfies MobileJobErrorResponse);
        return;
      }
      const limit = Number(url.searchParams.get('limit') || 30);
      json(res, 200, { ok: true, snapshot: notificationInbox.snapshot(limit) });
      return;
    }

    if (req.method === 'PATCH' && notificationReadMatch) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard')) return;
      if (!notificationInbox) {
        json(res, 503, { ok: false, message: 'mobile notification inbox disabled' } satisfies MobileJobErrorResponse);
        return;
      }
      const item = notificationInbox.markRead(decodeURIComponent(notificationReadMatch[1]));
      if (!item) {
        notFound(res, 'notification not found');
        return;
      }
      json(res, 200, { ok: true, item, snapshot: notificationInbox.snapshot() });
      return;
    }

    if (req.method === 'GET' && url.pathname === MOBILE_LIVE_GOLDEN_ROUTES.snapshot) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard')) return;
      if (!liveGoldenRadar) {
        json(res, 503, { ok: false, message: 'mobile live golden radar disabled' } satisfies MobileJobErrorResponse);
        return;
      }
      json(res, 200, { ok: true, snapshot: liveGoldenRadar.snapshot() });
      return;
    }

    if (req.method === 'POST' && url.pathname === MOBILE_LIVE_GOLDEN_ROUTES.run) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'admin')) return;
      if (!liveGoldenRadar) {
        json(res, 503, { ok: false, message: 'mobile live golden radar disabled' } satisfies MobileJobErrorResponse);
        return;
      }
      json(res, 202, { ok: true, snapshot: await liveGoldenRadar.runOnce() });
      return;
    }

    if (req.method === 'GET' && url.pathname === MOBILE_PREWARM_ROUTES.snapshot) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard')) return;
      if (!prewarmService) {
        json(res, 503, { ok: false, message: 'mobile prewarm service disabled' } satisfies MobileJobErrorResponse);
        return;
      }
      json(res, 200, { ok: true, snapshot: prewarmService.snapshot() });
      return;
    }

    if (req.method === 'POST' && url.pathname === MOBILE_PREWARM_ROUTES.run) {
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'admin')) return;
      if (!prewarmService) {
        json(res, 503, { ok: false, message: 'mobile prewarm service disabled' } satisfies MobileJobErrorResponse);
        return;
      }
      void parseBody(req, maxBodyBytes).then((body: any) => {
        const limit = typeof body?.limit === 'number' ? body.limit : undefined;
        json(res, 202, { ok: true, snapshot: prewarmService.start(limit) });
      }).catch((err) => {
        handleBodyError(res, err, maxBodyBytes);
      });
      return;
    }

    if (jobRoute && req.method === 'GET' && jobRoute.events) {
      const job = store.get(jobRoute.jobId);
      if (!job) {
        notFound(res, 'job not found');
        return;
      }
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, getMinimumMobileEntitlementTier(job.product))) return;
      streamJobEvents(req, res, store, jobRoute.jobId);
      return;
    }

    if (jobRoute && req.method === 'GET') {
      const job = store.get(jobRoute.jobId);
      if (!job) {
        notFound(res, 'job not found');
        return;
      }
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, getMinimumMobileEntitlementTier(job.product))) return;
      json(res, 200, { ok: true, job, links: jobLinks(job.id) });
      return;
    }

    if (jobRoute && req.method === 'DELETE') {
      const job = store.cancel(jobRoute.jobId);
      if (!job) {
        notFound(res, 'job not found');
        return;
      }
      if (!await authorizeMobileRequest(req, res, entitlementVerifier, getMinimumMobileEntitlementTier(job.product))) return;
      json(res, 200, { ok: true, job, links: jobLinks(job.id) });
      return;
    }

    const endpoint = MOBILE_API_ENDPOINTS.find((item) => item.method === req.method && item.path === url.pathname);
    if (!endpoint) {
      notFound(res);
      return;
    }

    if (!await authorizeMobileRequest(req, res, entitlementVerifier, getMinimumMobileEntitlementTier(endpoint.product))) return;
    void createJob(res, endpoint, req, store, pcWorkerExecutor, resultCache, maxBodyBytes);
    })().catch((err: any) => {
      json(res, 500, { ok: false, message: err?.message || 'mobile API internal error' } satisfies MobileJobErrorResponse);
    });
  });

  if (prewarmScheduler) {
    prewarmScheduler.start();
    server.on('close', () => {
      prewarmScheduler.stop();
    });
  }
  if (liveGoldenRadar) {
    liveGoldenRadar.start();
    server.on('close', () => {
      liveGoldenRadar.stop();
    });
  }

  return server;
}

export function startLewordApiServer(): http.Server {
  const port = Number(process.env['LEWORD_API_PORT'] || 34983);
  const host = process.env['LEWORD_API_HOST'] || '0.0.0.0';
  const server = createLewordApiServer();
  server.listen(port, host, () => {
    const displayHost = host === '0.0.0.0' ? 'localhost' : host;
    console.log(`LEWORD API listening on http://${displayHost}:${port}`);
  });
  return server;
}

if (require.main === module) {
  startLewordApiServer();
}
