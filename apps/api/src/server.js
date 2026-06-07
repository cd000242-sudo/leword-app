"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLewordApiServer = createLewordApiServer;
exports.startLewordApiServer = startLewordApiServer;
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const contracts_1 = require("../../../src/mobile/contracts");
const job_orchestrator_1 = require("../../../src/mobile/job-orchestrator");
const pc_engine_executor_1 = require("../../../src/mobile/pc-engine-executor");
const notification_inbox_1 = require("../../../src/mobile/notification-inbox");
const push_notifications_1 = require("../../../src/mobile/push-notifications");
const prewarm_service_1 = require("../../../src/mobile/prewarm-service");
const prewarm_scheduler_1 = require("../../../src/mobile/prewarm-scheduler");
const live_golden_radar_1 = require("../../../src/mobile/live-golden-radar");
const result_cache_1 = require("../../../src/mobile/result-cache");
const entitlements_1 = require("../../../src/mobile/entitlements");
const runtime_readiness_1 = require("../../../src/mobile/runtime-readiness");
const pc_feature_catalog_1 = require("../../../src/mobile/pc-feature-catalog");
const export_share_1 = require("../../../src/mobile/export-share");
const api_status_1 = require("../../../src/mobile/api-status");
const keyword_groups_1 = require("../../../src/mobile/keyword-groups");
const schedule_dashboard_1 = require("../../../src/mobile/schedule-dashboard");
const rank_tracking_1 = require("../../../src/mobile/rank-tracking");
const pro_outcomes_1 = require("../../../src/mobile/pro-outcomes");
const pro_blueprint_1 = require("../../../src/mobile/pro-blueprint");
const wordpress_publishing_1 = require("../../../src/mobile/wordpress-publishing");
const source_signals_1 = require("../../../src/mobile/source-signals");
const api_guardrails_1 = require("../../../src/mobile/api-guardrails");
function json(res, statusCode, body, headers = {}) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        ...headers,
    });
    res.end(JSON.stringify(body));
}
function notFound(res, message = 'endpoint not found') {
    json(res, 404, { ok: false, message });
}
function unauthorized(res) {
    json(res, 401, { ok: false, message: 'mobile API authorization required' });
}
function forbidden(res, message = 'mobile license tier is not allowed for this endpoint') {
    json(res, 403, { ok: false, message });
}
function payloadTooLarge(res, maxBodyBytes) {
    json(res, 413, {
        ok: false,
        message: `mobile API request body is too large; max ${maxBodyBytes} bytes`,
    });
}
function rateLimited(res, result) {
    json(res, 429, {
        ok: false,
        message: 'mobile API rate limit exceeded',
    }, {
        'Retry-After': Math.max(1, Math.ceil(result.retryAfterMs / 1000)),
        'X-RateLimit-Remaining': result.remaining,
    });
}
function getRequiredAuthToken(options) {
    const explicit = options.authToken;
    if (typeof explicit === 'string')
        return explicit.trim();
    if (explicit === null)
        return '';
    return (process.env['LEWORD_MOBILE_API_TOKEN'] || '').trim();
}
function getBearerToken(req) {
    const authorization = req.headers.authorization || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : '';
}
async function authorizeMobileRequest(req, res, verifier, requiredTier) {
    if (!verifier)
        return true;
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
    if (!(0, entitlements_1.isMobileEntitlementAllowed)(verification.entitlement, requiredTier)) {
        forbidden(res);
        return false;
    }
    return true;
}
function jobLinks(jobId) {
    return {
        self: contracts_1.MOBILE_JOB_ROUTES.self.replace(':jobId', jobId),
        events: contracts_1.MOBILE_JOB_ROUTES.events.replace(':jobId', jobId),
        cancel: contracts_1.MOBILE_JOB_ROUTES.cancel.replace(':jobId', jobId),
    };
}
function extractJobRoute(pathname) {
    const eventsMatch = pathname.match(/^\/v1\/jobs\/([^/]+)\/events$/);
    if (eventsMatch)
        return { jobId: decodeURIComponent(eventsMatch[1]), events: true };
    const jobMatch = pathname.match(/^\/v1\/jobs\/([^/]+)$/);
    if (jobMatch)
        return { jobId: decodeURIComponent(jobMatch[1]), events: false };
    return null;
}
function requestApiBaseUrl(req) {
    const publicUrl = (process.env['LEWORD_PUBLIC_API_URL'] || '').trim().replace(/\/+$/, '');
    if (publicUrl)
        return publicUrl;
    const host = req.headers.host || `localhost:${process.env['LEWORD_API_PORT'] || 34983}`;
    return `http://${host}`.replace(/\/+$/, '');
}
function signal(kind, id, keyword, title, description, priority, source = 'leword-pc-engine', categoryId) {
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
function fallbackDashboardSignals() {
    const fallback = (0, source_signals_1.fallbackSourceSignals)();
    return {
        realtime: fallback.realtime,
        policy: fallback.policy,
        issues: fallback.issues,
    };
}
function buildDashboard(req, notificationInbox, prewarmService, liveGoldenRadar, apiBaseUrl = requestApiBaseUrl(req)) {
    const fallback = fallbackDashboardSignals();
    const notifications = notificationInbox?.snapshot(12) || null;
    const prewarm = prewarmService?.snapshot() || null;
    const liveGolden = liveGoldenRadar?.snapshot() || null;
    const winnerSignals = (notifications?.items || []).slice(0, 6).map((item, index) => signal(item.kind === 'fresh-issue' ? 'issue' : item.product === 'home-board-hunter' ? 'policy' : 'realtime', `notification-${item.id}`, item.keyword, item.title, item.evidence[0] || item.intent || item.source, 100 - index, item.source, item.category));
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
function normalizeLoginTier(value) {
    const tier = String(value || '').toLowerCase();
    if (tier === 'admin' || tier === 'unlimited' || tier === 'pro' || tier === 'standard')
        return tier;
    return 'standard';
}
async function verifyPanelLogin(body) {
    const panelUrl = String(body?.panelServerUrl || process.env['LEWORD_MOBILE_PANEL_LOGIN_URL'] || '').trim();
    if (!panelUrl)
        return { ok: false, message: 'panel login url missing' };
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
    if (!response.ok)
        return { ok: false, message: `panel login HTTP ${response.status}` };
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
async function createLoginSession(req, res, verifier, notificationInbox, prewarmService, liveGoldenRadar, maxBodyBytes) {
    try {
        const body = await parseBody(req, maxBodyBytes);
        const userId = String(body?.userId || '').trim();
        const password = String(body?.password || '').trim();
        const candidateToken = String(body?.accessToken || body?.mobileToken || body?.token || password || '').trim();
        if (!userId || !password) {
            json(res, 400, { ok: false, message: '아이디와 비밀번호가 필요합니다.' });
            return;
        }
        if (candidateToken && verifier) {
            const verified = await verifier(candidateToken);
            if (verified.ok && verified.entitlement) {
                const apiBaseUrl = requestApiBaseUrl(req);
                const session = {
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
        const panel = await verifyPanelLogin(body).catch((err) => ({
            ok: false,
            message: err.message || 'panel login failed',
        }));
        if (panel.ok) {
            const token = panel.accessToken || candidateToken || `panel-${Date.now().toString(36)}`;
            const apiBaseUrl = panel.apiBaseUrl || requestApiBaseUrl(req);
            const session = {
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
            const session = {
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
        json(res, 401, { ok: false, message: panel.message || '로그인에 실패했습니다.' });
    }
    catch (err) {
        handleBodyError(res, err, maxBodyBytes);
    }
}
function parseBody(req, maxBodyBytes) {
    return (0, api_guardrails_1.parseMobileJsonBody)(req, maxBodyBytes);
}
function handleBodyError(res, err, maxBodyBytes) {
    if (err instanceof api_guardrails_1.MobileApiBodyTooLargeError) {
        payloadTooLarge(res, maxBodyBytes);
        return;
    }
    json(res, 400, { ok: false, message: 'invalid json body' });
}
function streamJobEvents(req, res, store, jobId) {
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
    const writeEvent = (event) => {
        res.write(`event: job\n`);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    for (const event of store.getEvents(jobId)) {
        writeEvent(event);
    }
    const unsubscribe = store.subscribe(jobId, writeEvent);
    req.on('close', unsubscribe);
}
async function createJob(res, endpoint, req, store, pcWorkerExecutor, resultCache, maxBodyBytes) {
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
        });
    }
    catch (err) {
        handleBodyError(res, err, maxBodyBytes);
    }
}
function createLewordApiServer(options = {}) {
    const store = options.store || new job_orchestrator_1.InMemoryMobileJobStore();
    const pushRegistry = options.pushRegistry === null
        ? null
        : options.pushRegistry || new push_notifications_1.MobilePushRegistry();
    const pushDispatcher = options.pushDispatcher === null || !pushRegistry
        ? null
        : options.pushDispatcher || new push_notifications_1.MobilePushDispatcher({
            registry: pushRegistry,
            sender: (0, push_notifications_1.createEnvironmentMobilePushSender)(),
        });
    const notificationInbox = options.notificationInbox === null
        ? null
        : options.notificationInbox || new notification_inbox_1.MobileNotificationInbox();
    notificationInbox?.setPublishListener((items) => {
        void pushDispatcher?.publish(items);
    });
    const pcWorkerExecutor = options.executor || (0, pc_engine_executor_1.createMobilePcEngineExecutor)();
    const resultCache = options.resultCache === null
        ? null
        : options.resultCache || new result_cache_1.InMemoryMobileResultCache({
            persistenceFile: process.env['LEWORD_MOBILE_CACHE_FILE']
                || path_1.default.join(process.cwd(), '.leword-mobile-cache.json'),
        });
    const prewarmService = options.prewarmService === null || !resultCache
        ? null
        : options.prewarmService || new prewarm_service_1.MobilePrewarmService({
            executor: pcWorkerExecutor,
            resultCache,
            notificationInbox,
        });
    const prewarmScheduler = options.prewarmScheduler === null || !prewarmService
        ? null
        : options.prewarmScheduler || (0, prewarm_scheduler_1.createMobilePrewarmSchedulerFromEnv)(prewarmService);
    const liveGoldenRadar = options.liveGoldenRadar === null || !notificationInbox
        ? null
        : options.liveGoldenRadar || (0, live_golden_radar_1.createMobileLiveGoldenRadarFromEnv)(notificationInbox, () => {
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
        : options.entitlementVerifier || (0, entitlements_1.createEnvironmentMobileEntitlementVerifier)({
            staticToken: getRequiredAuthToken(options),
        });
    const apiGuardrails = options.apiGuardrails === null
        ? null
        : {
            ...(0, api_guardrails_1.getMobileApiGuardrailOptions)(),
            ...(options.apiGuardrails || {}),
        };
    const rateLimiter = options.rateLimiter === null || !apiGuardrails
        ? null
        : options.rateLimiter || new api_guardrails_1.MobileApiRateLimiter(apiGuardrails);
    const maxBodyBytes = apiGuardrails?.maxBodyBytes || (0, api_guardrails_1.getMobileApiGuardrailOptions)().maxBodyBytes;
    const proBlueprintServices = options.proBlueprintServices;
    const server = http_1.default.createServer((req, res) => {
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
                    parity: contracts_1.MOBILE_PC_PARITY_SLA,
                    endpoints: contracts_1.MOBILE_API_ENDPOINTS.length,
                    jobRoutes: contracts_1.MOBILE_JOB_ROUTES,
                    notificationRoutes: contracts_1.MOBILE_NOTIFICATION_ROUTES,
                    liveGoldenRoutes: contracts_1.MOBILE_LIVE_GOLDEN_ROUTES,
                    pushRoutes: contracts_1.MOBILE_PUSH_ROUTES,
                    wordpressRoutes: contracts_1.MOBILE_WORDPRESS_ROUTES,
                    rankTrackingRoutes: contracts_1.MOBILE_RANK_TRACKING_ROUTES,
                    proOutcomeRoutes: contracts_1.MOBILE_PRO_OUTCOME_ROUTES,
                    proBlueprintRoutes: contracts_1.MOBILE_PRO_BLUEPRINT_ROUTES,
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
                    runtime: (0, runtime_readiness_1.getMobileRuntimeReadiness)(),
                });
                return;
            }
            const jobRoute = extractJobRoute(url.pathname);
            const notificationReadMatch = url.pathname.match(/^\/v1\/notifications\/([^/]+)\/read$/);
            const pushUnregisterMatch = url.pathname.match(/^\/v1\/push\/subscriptions\/([^/]+)$/);
            const keywordGroupMatch = url.pathname.match(/^\/v1\/mobile\/keyword-groups\/([^/]+)$/);
            const scheduleMatch = url.pathname.match(/^\/v1\/mobile\/schedules\/([^/]+)$/);
            if (req.method === 'POST' && url.pathname === contracts_1.MOBILE_AUTH_ROUTES.login) {
                await createLoginSession(req, res, entitlementVerifier, notificationInbox, prewarmService, liveGoldenRadar, maxBodyBytes);
                return;
            }
            if (req.method === 'GET' && url.pathname === contracts_1.MOBILE_AUTH_ROUTES.dashboard) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard'))
                    return;
                json(res, 200, { ok: true, dashboard: buildDashboard(req, notificationInbox, prewarmService, liveGoldenRadar) });
                return;
            }
            if (req.method === 'GET' && url.pathname === contracts_1.MOBILE_AUTH_ROUTES.pcFeatures) {
                json(res, 200, { ok: true, catalog: (0, pc_feature_catalog_1.buildMobilePcFeatureCatalog)() });
                return;
            }
            if (req.method === 'GET' && url.pathname === contracts_1.MOBILE_SOURCE_ROUTES.signals) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard'))
                    return;
                const laneParam = url.searchParams.get('lane') || 'all';
                const lane = ['all', 'realtime', 'policy', 'issues'].includes(laneParam) ? laneParam : 'all';
                const limit = Number(url.searchParams.get('limit') || 6);
                const snapshot = await (0, source_signals_1.buildMobileSourceSignalSnapshot)({ lane, limit });
                json(res, 200, { ok: true, snapshot });
                return;
            }
            if (req.method === 'GET' && url.pathname === contracts_1.MOBILE_STATUS_ROUTES.apiStatus) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard'))
                    return;
                json(res, 200, {
                    ok: true,
                    snapshot: (0, api_status_1.buildMobileApiStatusSnapshot)({
                        apiBaseUrl: requestApiBaseUrl(req),
                    }),
                });
                return;
            }
            if (req.method === 'POST' && url.pathname === contracts_1.MOBILE_EXPORT_ROUTES.keywords) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard'))
                    return;
                try {
                    const body = await parseBody(req, maxBodyBytes);
                    const artifact = (0, export_share_1.buildMobileKeywordExportArtifact)(body);
                    json(res, 200, { ok: true, artifact });
                }
                catch (err) {
                    if (err instanceof api_guardrails_1.MobileApiBodyTooLargeError) {
                        payloadTooLarge(res, maxBodyBytes);
                    }
                    else {
                        json(res, 400, { ok: false, message: err.message || 'invalid keyword export request' });
                    }
                }
                return;
            }
            if (req.method === 'GET' && url.pathname === contracts_1.MOBILE_WORDPRESS_ROUTES.snapshot) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard'))
                    return;
                json(res, 200, { ok: true, snapshot: (0, wordpress_publishing_1.readMobileWordPressSnapshot)() });
                return;
            }
            if (req.method === 'POST' && url.pathname === contracts_1.MOBILE_WORDPRESS_ROUTES.site) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard'))
                    return;
                try {
                    const body = await parseBody(req, maxBodyBytes);
                    const saved = (0, wordpress_publishing_1.upsertMobileWordPressSite)({ input: body });
                    json(res, 201, { ok: true, site: saved.site, snapshot: saved.snapshot });
                }
                catch (err) {
                    handleBodyError(res, err, maxBodyBytes);
                }
                return;
            }
            if (req.method === 'GET' && url.pathname === contracts_1.MOBILE_WORDPRESS_ROUTES.categories) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard'))
                    return;
                try {
                    const refreshed = await (0, wordpress_publishing_1.refreshMobileWordPressCategories)({
                        siteId: url.searchParams.get('siteId') || undefined,
                    });
                    json(res, 200, {
                        ok: true,
                        site: refreshed.site,
                        categories: refreshed.categories,
                        snapshot: refreshed.snapshot,
                    });
                }
                catch (err) {
                    json(res, 502, {
                        ok: false,
                        message: err.message || 'WordPress categories request failed',
                    });
                }
                return;
            }
            if (req.method === 'POST' && url.pathname === contracts_1.MOBILE_WORDPRESS_ROUTES.drafts) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard'))
                    return;
                try {
                    const body = await parseBody(req, maxBodyBytes);
                    const created = (0, wordpress_publishing_1.createMobileWordPressDraft)({ input: body });
                    json(res, 201, { ok: true, draft: created.draft, snapshot: created.snapshot });
                }
                catch (err) {
                    handleBodyError(res, err, maxBodyBytes);
                }
                return;
            }
            if (req.method === 'POST' && url.pathname === contracts_1.MOBILE_WORDPRESS_ROUTES.publish) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard'))
                    return;
                try {
                    const body = await parseBody(req, maxBodyBytes);
                    const published = await (0, wordpress_publishing_1.publishMobileWordPressDraft)({ input: body });
                    json(res, 201, {
                        ok: true,
                        result: published.result,
                        draft: published.draft,
                        snapshot: published.snapshot,
                    });
                }
                catch (err) {
                    if (err instanceof api_guardrails_1.MobileApiBodyTooLargeError) {
                        payloadTooLarge(res, maxBodyBytes);
                    }
                    else {
                        json(res, 502, {
                            ok: false,
                            message: err.message || 'WordPress publish request failed',
                        });
                    }
                }
                return;
            }
            if (req.method === 'GET' && url.pathname === contracts_1.MOBILE_KEYWORD_GROUP_ROUTES.list) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard'))
                    return;
                json(res, 200, { ok: true, snapshot: (0, keyword_groups_1.readMobileKeywordGroupSnapshot)() });
                return;
            }
            if (req.method === 'GET' && url.pathname === contracts_1.MOBILE_SCHEDULE_ROUTES.dashboard) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard'))
                    return;
                json(res, 200, { ok: true, snapshot: (0, schedule_dashboard_1.buildMobileScheduleDashboardSnapshot)() });
                return;
            }
            if (req.method === 'GET' && url.pathname === contracts_1.MOBILE_RANK_TRACKING_ROUTES.snapshot) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard'))
                    return;
                json(res, 200, { ok: true, snapshot: (0, rank_tracking_1.readMobileRankTrackingSnapshot)() });
                return;
            }
            if (req.method === 'POST' && url.pathname === contracts_1.MOBILE_RANK_TRACKING_ROUTES.manual) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard'))
                    return;
                try {
                    const body = await parseBody(req, maxBodyBytes);
                    const result = (0, rank_tracking_1.addMobileRankTrackingManualPair)({ input: body });
                    json(res, result.success ? 201 : 409, { ok: result.success, result });
                }
                catch (err) {
                    handleBodyError(res, err, maxBodyBytes);
                }
                return;
            }
            if (req.method === 'POST' && url.pathname === contracts_1.MOBILE_RANK_TRACKING_ROUTES.proPost) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard'))
                    return;
                try {
                    const body = await parseBody(req, maxBodyBytes);
                    const result = (0, rank_tracking_1.addMobileProTrackedPost)({ input: body });
                    json(res, result.success ? 201 : 400, { ok: result.success, result });
                }
                catch (err) {
                    handleBodyError(res, err, maxBodyBytes);
                }
                return;
            }
            if (req.method === 'POST' && url.pathname === contracts_1.MOBILE_RANK_TRACKING_ROUTES.run) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard'))
                    return;
                try {
                    const body = await parseBody(req, maxBodyBytes);
                    const result = await (0, rank_tracking_1.runMobileRankTrackingSerpCheck)({ input: body });
                    json(res, 202, { ok: result.success, result });
                }
                catch (err) {
                    handleBodyError(res, err, maxBodyBytes);
                }
                return;
            }
            if (req.method === 'DELETE' && url.pathname === contracts_1.MOBILE_RANK_TRACKING_ROUTES.pair) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard'))
                    return;
                try {
                    const body = await parseBody(req, maxBodyBytes);
                    const result = (0, rank_tracking_1.removeMobileRankTrackingPair)({ input: body });
                    json(res, 200, { ok: true, result });
                }
                catch (err) {
                    handleBodyError(res, err, maxBodyBytes);
                }
                return;
            }
            if (req.method === 'GET' && url.pathname === contracts_1.MOBILE_PRO_OUTCOME_ROUTES.snapshot) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard'))
                    return;
                json(res, 200, { ok: true, snapshot: (0, pro_outcomes_1.readMobileProOutcomeSnapshot)() });
                return;
            }
            if (req.method === 'POST' && url.pathname === contracts_1.MOBILE_PRO_OUTCOME_ROUTES.record) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard'))
                    return;
                try {
                    const body = await parseBody(req, maxBodyBytes);
                    const result = (0, pro_outcomes_1.recordMobileProOutcome)({ input: body });
                    json(res, result.success ? 201 : 400, { ok: result.success, result });
                }
                catch (err) {
                    handleBodyError(res, err, maxBodyBytes);
                }
                return;
            }
            if (req.method === 'DELETE' && url.pathname === contracts_1.MOBILE_PRO_OUTCOME_ROUTES.item) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard'))
                    return;
                try {
                    const body = await parseBody(req, maxBodyBytes);
                    const result = (0, pro_outcomes_1.deleteMobileProOutcome)({ input: body });
                    json(res, 200, { ok: true, result });
                }
                catch (err) {
                    handleBodyError(res, err, maxBodyBytes);
                }
                return;
            }
            if (req.method === 'POST' && url.pathname === contracts_1.MOBILE_PRO_OUTCOME_ROUTES.sync) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard'))
                    return;
                const result = (0, pro_outcomes_1.syncMobileProOutcomesFromRankTracker)();
                json(res, 202, { ok: true, result });
                return;
            }
            if (req.method === 'POST' && url.pathname === contracts_1.MOBILE_PRO_BLUEPRINT_ROUTES.blueprint) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'pro'))
                    return;
                try {
                    const body = await parseBody(req, maxBodyBytes);
                    const result = await (0, pro_blueprint_1.generateMobileProBlueprint)({ input: body, services: proBlueprintServices });
                    json(res, result.success ? 200 : 400, { ok: result.success, result });
                }
                catch (err) {
                    handleBodyError(res, err, maxBodyBytes);
                }
                return;
            }
            if (req.method === 'POST' && url.pathname === contracts_1.MOBILE_PRO_BLUEPRINT_ROUTES.draft) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'pro'))
                    return;
                try {
                    const body = await parseBody(req, maxBodyBytes);
                    const result = await (0, pro_blueprint_1.generateMobileProDraft)({ input: body, services: proBlueprintServices });
                    json(res, result.success ? 200 : 400, { ok: result.success, result });
                }
                catch (err) {
                    handleBodyError(res, err, maxBodyBytes);
                }
                return;
            }
            if (req.method === 'POST' && url.pathname === contracts_1.MOBILE_PRO_BLUEPRINT_ROUTES.revenue) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'pro'))
                    return;
                try {
                    const body = await parseBody(req, maxBodyBytes);
                    const result = (0, pro_blueprint_1.estimateMobileProRevenue)({ input: body });
                    json(res, result.success ? 200 : 400, { ok: result.success, result });
                }
                catch (err) {
                    handleBodyError(res, err, maxBodyBytes);
                }
                return;
            }
            if (req.method === 'GET' && url.pathname === contracts_1.MOBILE_PRO_BLUEPRINT_ROUTES.revenueConfig) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'pro'))
                    return;
                const result = (0, pro_blueprint_1.loadMobileProRevenueConfig)();
                json(res, 200, { ok: true, result });
                return;
            }
            if (req.method === 'POST' && url.pathname === contracts_1.MOBILE_PRO_BLUEPRINT_ROUTES.revenueConfig) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'pro'))
                    return;
                try {
                    const body = await parseBody(req, maxBodyBytes);
                    const result = (0, pro_blueprint_1.saveMobileProRevenueConfig)({ input: body });
                    json(res, result.success ? 200 : 400, { ok: result.success, result });
                }
                catch (err) {
                    handleBodyError(res, err, maxBodyBytes);
                }
                return;
            }
            if (req.method === 'GET' && url.pathname === contracts_1.MOBILE_PRO_BLUEPRINT_ROUTES.categoryRpm) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'pro'))
                    return;
                const result = (0, pro_blueprint_1.getMobileProCategoryRpmTable)();
                json(res, 200, { ok: true, result });
                return;
            }
            if (req.method === 'POST' && url.pathname === contracts_1.MOBILE_PRO_BLUEPRINT_ROUTES.portfolioRevenue) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'pro'))
                    return;
                try {
                    const body = await parseBody(req, maxBodyBytes);
                    const result = (0, pro_blueprint_1.estimateMobileProPortfolioRevenue)({ input: body });
                    json(res, result.success ? 200 : 400, { ok: result.success, result });
                }
                catch (err) {
                    handleBodyError(res, err, maxBodyBytes);
                }
                return;
            }
            if (req.method === 'POST' && url.pathname === contracts_1.MOBILE_SCHEDULE_ROUTES.list) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard'))
                    return;
                try {
                    const body = await parseBody(req, maxBodyBytes);
                    const created = (0, schedule_dashboard_1.addMobileKeywordSchedule)({ input: body });
                    json(res, 201, { ok: true, schedule: created.schedule, snapshot: created.snapshot });
                }
                catch (err) {
                    if (err instanceof api_guardrails_1.MobileApiBodyTooLargeError) {
                        payloadTooLarge(res, maxBodyBytes);
                    }
                    else {
                        json(res, 400, { ok: false, message: err.message || 'invalid keyword schedule' });
                    }
                }
                return;
            }
            if (scheduleMatch && req.method === 'PATCH') {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard'))
                    return;
                try {
                    const body = await parseBody(req, maxBodyBytes);
                    const updated = (0, schedule_dashboard_1.updateMobileKeywordSchedule)({
                        id: decodeURIComponent(scheduleMatch[1]),
                        updates: body || {},
                    });
                    if (!updated.schedule) {
                        notFound(res, 'keyword schedule not found');
                        return;
                    }
                    json(res, 200, { ok: true, schedule: updated.schedule, snapshot: updated.snapshot });
                }
                catch (err) {
                    if (err instanceof api_guardrails_1.MobileApiBodyTooLargeError) {
                        payloadTooLarge(res, maxBodyBytes);
                    }
                    else {
                        json(res, 400, { ok: false, message: err.message || 'invalid keyword schedule update' });
                    }
                }
                return;
            }
            if (scheduleMatch && req.method === 'DELETE') {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard'))
                    return;
                const deleted = (0, schedule_dashboard_1.deleteMobileKeywordSchedule)({
                    id: decodeURIComponent(scheduleMatch[1]),
                });
                if (!deleted.removed) {
                    notFound(res, 'keyword schedule not found');
                    return;
                }
                json(res, 200, { ok: true, schedule: deleted.schedule, snapshot: deleted.snapshot });
                return;
            }
            if (req.method === 'POST' && url.pathname === contracts_1.MOBILE_KEYWORD_GROUP_ROUTES.list) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard'))
                    return;
                try {
                    const body = await parseBody(req, maxBodyBytes);
                    const created = (0, keyword_groups_1.addMobileKeywordGroup)({ input: body });
                    json(res, 201, { ok: true, group: created.group, snapshot: created.snapshot });
                }
                catch (err) {
                    handleBodyError(res, err, maxBodyBytes);
                }
                return;
            }
            if (keywordGroupMatch && req.method === 'PATCH') {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard'))
                    return;
                try {
                    const body = await parseBody(req, maxBodyBytes);
                    const updated = (0, keyword_groups_1.updateMobileKeywordGroup)({
                        id: decodeURIComponent(keywordGroupMatch[1]),
                        updates: body,
                    });
                    if (!updated.group) {
                        notFound(res, 'keyword group not found');
                        return;
                    }
                    json(res, 200, { ok: true, group: updated.group, snapshot: updated.snapshot });
                }
                catch (err) {
                    handleBodyError(res, err, maxBodyBytes);
                }
                return;
            }
            if (keywordGroupMatch && req.method === 'DELETE') {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard'))
                    return;
                const deleted = (0, keyword_groups_1.deleteMobileKeywordGroup)({
                    id: decodeURIComponent(keywordGroupMatch[1]),
                });
                if (!deleted.removed) {
                    notFound(res, 'keyword group not found');
                    return;
                }
                json(res, 200, { ok: true, snapshot: deleted.snapshot });
                return;
            }
            if (req.method === 'POST' && url.pathname === contracts_1.MOBILE_PUSH_ROUTES.register) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard'))
                    return;
                if (!pushRegistry || !pushDispatcher) {
                    json(res, 503, { ok: false, message: 'mobile push service disabled' });
                    return;
                }
                try {
                    const body = await parseBody(req, maxBodyBytes);
                    const subscription = pushRegistry.upsert(body);
                    json(res, 200, { ok: true, subscription, snapshot: pushDispatcher.snapshot() });
                }
                catch (err) {
                    if (err instanceof api_guardrails_1.MobileApiBodyTooLargeError) {
                        payloadTooLarge(res, maxBodyBytes);
                    }
                    else {
                        json(res, 400, { ok: false, message: err.message || 'invalid mobile push subscription' });
                    }
                }
                return;
            }
            if (req.method === 'DELETE' && pushUnregisterMatch) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard'))
                    return;
                if (!pushRegistry || !pushDispatcher) {
                    json(res, 503, { ok: false, message: 'mobile push service disabled' });
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
            if (req.method === 'GET' && url.pathname === contracts_1.MOBILE_NOTIFICATION_ROUTES.inbox) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard'))
                    return;
                if (!notificationInbox) {
                    json(res, 503, { ok: false, message: 'mobile notification inbox disabled' });
                    return;
                }
                const limit = Number(url.searchParams.get('limit') || 30);
                json(res, 200, { ok: true, snapshot: notificationInbox.snapshot(limit) });
                return;
            }
            if (req.method === 'PATCH' && notificationReadMatch) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard'))
                    return;
                if (!notificationInbox) {
                    json(res, 503, { ok: false, message: 'mobile notification inbox disabled' });
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
            if (req.method === 'GET' && url.pathname === contracts_1.MOBILE_LIVE_GOLDEN_ROUTES.snapshot) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard'))
                    return;
                if (!liveGoldenRadar) {
                    json(res, 503, { ok: false, message: 'mobile live golden radar disabled' });
                    return;
                }
                json(res, 200, { ok: true, snapshot: liveGoldenRadar.snapshot() });
                return;
            }
            if (req.method === 'POST' && url.pathname === contracts_1.MOBILE_LIVE_GOLDEN_ROUTES.run) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'admin'))
                    return;
                if (!liveGoldenRadar) {
                    json(res, 503, { ok: false, message: 'mobile live golden radar disabled' });
                    return;
                }
                json(res, 202, { ok: true, snapshot: await liveGoldenRadar.runOnce() });
                return;
            }
            if (req.method === 'GET' && url.pathname === contracts_1.MOBILE_PREWARM_ROUTES.snapshot) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'standard'))
                    return;
                if (!prewarmService) {
                    json(res, 503, { ok: false, message: 'mobile prewarm service disabled' });
                    return;
                }
                json(res, 200, { ok: true, snapshot: prewarmService.snapshot() });
                return;
            }
            if (req.method === 'POST' && url.pathname === contracts_1.MOBILE_PREWARM_ROUTES.run) {
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, 'admin'))
                    return;
                if (!prewarmService) {
                    json(res, 503, { ok: false, message: 'mobile prewarm service disabled' });
                    return;
                }
                void parseBody(req, maxBodyBytes).then((body) => {
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
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, (0, entitlements_1.getMinimumMobileEntitlementTier)(job.product)))
                    return;
                streamJobEvents(req, res, store, jobRoute.jobId);
                return;
            }
            if (jobRoute && req.method === 'GET') {
                const job = store.get(jobRoute.jobId);
                if (!job) {
                    notFound(res, 'job not found');
                    return;
                }
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, (0, entitlements_1.getMinimumMobileEntitlementTier)(job.product)))
                    return;
                json(res, 200, { ok: true, job, links: jobLinks(job.id) });
                return;
            }
            if (jobRoute && req.method === 'DELETE') {
                const job = store.cancel(jobRoute.jobId);
                if (!job) {
                    notFound(res, 'job not found');
                    return;
                }
                if (!await authorizeMobileRequest(req, res, entitlementVerifier, (0, entitlements_1.getMinimumMobileEntitlementTier)(job.product)))
                    return;
                json(res, 200, { ok: true, job, links: jobLinks(job.id) });
                return;
            }
            const endpoint = contracts_1.MOBILE_API_ENDPOINTS.find((item) => item.method === req.method && item.path === url.pathname);
            if (!endpoint) {
                notFound(res);
                return;
            }
            if (!await authorizeMobileRequest(req, res, entitlementVerifier, (0, entitlements_1.getMinimumMobileEntitlementTier)(endpoint.product)))
                return;
            void createJob(res, endpoint, req, store, pcWorkerExecutor, resultCache, maxBodyBytes);
        })().catch((err) => {
            json(res, 500, { ok: false, message: err?.message || 'mobile API internal error' });
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
function startLewordApiServer() {
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
