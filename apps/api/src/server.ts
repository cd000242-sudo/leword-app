import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
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
  type MobileEntitlement,
  type MobileEntitlementTier,
  type MobileEntitlementVerifier,
} from '../../../src/mobile/entitlements';
import {
  getMobileRuntimeReadiness,
} from '../../../src/mobile/runtime-readiness';
import {
  EnvironmentManager,
  type EnvConfig,
} from '../../../src/utils/environment-manager';
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
  buildPublicSourceSignalPayload,
  buildPublicLiveGoldenPayload,
  renderLewordLanding,
} from './public-site';
import {
  getMobileApiGuardrailOptions,
  MobileApiBodyTooLargeError,
  MobileApiRateLimiter,
  parseMobileJsonBody,
  type MobileApiGuardrailOptions,
} from '../../../src/mobile/api-guardrails';

const DEFAULT_LEWORD_LICENSE_SERVER_URL = 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';
const DEFAULT_LEWORD_LICENSE_APP_ID = 'com.leword.keyword.master';

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
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Requested-With, X-Leword-User-Api-Credentials',
    ...headers,
  });
  res.end(JSON.stringify(body));
}

function html(
  res: http.ServerResponse,
  statusCode: number,
  body: string,
  headers: Record<string, string | number> = {},
): void {
  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Requested-With, X-Leword-User-Api-Credentials',
    ...headers,
  });
  res.end(body);
}

type LewordDownloadKind = 'pc' | 'android';

const LEWORD_DESKTOP_VERSION = '2.49.85';
const LEWORD_DESKTOP_FILENAME = `LEWORD-${LEWORD_DESKTOP_VERSION}.exe`;
const LEWORD_ANDROID_FILENAME = 'LEWORD-mobile-0.1.0.apk';

interface LewordDownloadMeta {
  available: boolean;
  filename: string;
  size: number;
  updatedAt: string | null;
  url: string;
}

function downloadRoot(): string {
  if (process.env.LEWORD_DOWNLOAD_DIR) return process.env.LEWORD_DOWNLOAD_DIR;
  if (fs.existsSync('/data')) return '/data/downloads';
  return path.resolve(process.cwd(), 'downloads');
}

function firstExistingFile(paths: Array<string | undefined | null>): string | null {
  for (const filePath of paths) {
    if (!filePath) continue;
    try {
      const stat = fs.statSync(filePath);
      if (stat.isFile()) return filePath;
    } catch {}
  }
  return null;
}

function downloadCandidates(kind: LewordDownloadKind): string[] {
  const root = downloadRoot();
  if (kind === 'pc') {
    return [
      process.env.LEWORD_PC_APP_DOWNLOAD_PATH,
      path.join(root, LEWORD_DESKTOP_FILENAME),
      path.join(root, 'LEWORD-2.49.84.exe'),
      path.join(root, 'LEWORD-setup.exe'),
      path.resolve(process.cwd(), 'release', LEWORD_DESKTOP_FILENAME),
      path.resolve(process.cwd(), 'release', 'LEWORD-2.49.84.exe'),
      path.resolve(process.cwd(), '..', '..', 'release', LEWORD_DESKTOP_FILENAME),
      path.resolve(process.cwd(), '..', '..', 'release', 'LEWORD-2.49.84.exe'),
    ].filter(Boolean) as string[];
  }
  return [
    process.env.LEWORD_ANDROID_APK_DOWNLOAD_PATH,
    path.join(root, LEWORD_ANDROID_FILENAME),
    path.join(root, 'LEWORD-mobile.apk'),
    path.resolve(process.cwd(), 'apps', 'mobile', 'builds', LEWORD_ANDROID_FILENAME),
    path.resolve(process.cwd(), '..', '..', 'apps', 'mobile', 'builds', LEWORD_ANDROID_FILENAME),
    path.resolve(process.cwd(), 'apps', 'mobile', 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'),
  ].filter(Boolean) as string[];
}

function logoCandidates(): string[] {
  const root = downloadRoot();
  return [
    process.env.LEWORD_LOGO_PATH,
    path.join(root, 'leword-logo.png'),
    path.resolve(process.cwd(), 'apps', 'mobile', 'assets', 'icon.png'),
    path.resolve(process.cwd(), '..', '..', 'apps', 'mobile', 'assets', 'icon.png'),
  ].filter(Boolean) as string[];
}

function downloadMeta(kind: LewordDownloadKind): LewordDownloadMeta {
  const filePath = firstExistingFile(downloadCandidates(kind));
  const filename = kind === 'pc' ? LEWORD_DESKTOP_FILENAME : LEWORD_ANDROID_FILENAME;
  if (!filePath) {
    return {
      available: false,
      filename,
      size: 0,
      updatedAt: null,
      url: kind === 'pc' ? '/download/pc' : '/download/android',
    };
  }
  const stat = fs.statSync(filePath);
  return {
    available: true,
    filename: path.basename(filePath) || filename,
    size: stat.size,
    updatedAt: stat.mtime.toISOString(),
    url: kind === 'pc' ? '/download/pc' : '/download/android',
  };
}

function safeDownloadName(filename: string): string {
  return filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
}

function serveFile(
  res: http.ServerResponse,
  filePath: string,
  contentType: string,
  filename?: string,
): void {
  const stat = fs.statSync(filePath);
  const headers: Record<string, string | number> = {
    'Content-Type': contentType,
    'Content-Length': stat.size,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  };
  if (filename) {
    headers['Content-Disposition'] = `attachment; filename="${safeDownloadName(filename)}"`;
  }
  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
}

function serveDownload(res: http.ServerResponse, kind: LewordDownloadKind): void {
  const filePath = firstExistingFile(downloadCandidates(kind));
  if (!filePath) {
    json(res, 404, {
      ok: false,
      message: kind === 'pc' ? 'PC app installer is not ready' : 'Android APK is not ready',
    } satisfies MobileJobErrorResponse);
    return;
  }
  serveFile(
    res,
    filePath,
    kind === 'pc' ? 'application/vnd.microsoft.portable-executable' : 'application/vnd.android.package-archive',
    path.basename(filePath),
  );
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

function normalizeLoginTier(value: unknown): MobileEntitlementTier {
  const tier = String(value || '').toLowerCase();
  if (tier === 'admin' || tier === 'unlimited' || tier === 'pro' || tier === 'standard') return tier;
  if (tier === 'professional' || tier === 'leword' || tier === 'all' || tier === 'allinone') return 'pro';
  if (tier === 'ex' || tier === 'life' || tier === 'lifetime' || tier === 'permanent') return 'unlimited';
  if (tier === '1year' || tier === '365day' || tier === '3months' || tier === '90day' || tier === 'three-months-plus') return 'pro';
  return 'standard';
}

function isPanelLoginAccepted(payload: any): boolean {
  if (!payload || payload.ok === false || payload.valid === false || payload.success === false) return false;
  return payload.ok === true || payload.valid === true || payload.success === true;
}

function panelLoginUrl(body: any): string {
  return String(
    body?.panelServerUrl
      || process.env['LEWORD_MOBILE_PANEL_LOGIN_URL']
      || process.env['LICENSE_SERVER_URL']
      || DEFAULT_LEWORD_LICENSE_SERVER_URL,
  ).trim();
}

async function verifyPanelLogin(body: any): Promise<{
  ok: boolean;
  accessToken?: string;
  apiBaseUrl?: string;
  userId?: string;
  tier?: MobileEntitlementTier;
  expiresAt?: string | null;
  message?: string;
}> {
  const panelUrl = panelLoginUrl(body);
  if (!panelUrl) return { ok: false, message: 'panel login url missing' };
  const licenseCode = String(body?.licenseCode || '').trim();
  const appId = body?.appId || process.env['LEWORD_MOBILE_LICENSE_APP_ID'] || DEFAULT_LEWORD_LICENSE_APP_ID;
  const buildPayload = (action: string): Record<string, unknown> => {
    const panelPayload: Record<string, unknown> = {
      action,
      userId: body?.userId,
      userPassword: body?.password,
      password: body?.password,
      appId,
      requestedAt: new Date().toISOString(),
    };
    if (licenseCode) {
      panelPayload.code = licenseCode;
      panelPayload.licenseCode = licenseCode;
    }
    return panelPayload;
  };
  const actions = licenseCode ? ['register'] : ['verify-credentials', 'login'];

  let lastMessage = 'panel login rejected';
  for (const action of actions) {
    const response = await fetch(panelUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(action)),
    });
    if (!response.ok) {
      lastMessage = `panel login HTTP ${response.status}`;
      continue;
    }
    const payload = await response.json();
    if (!isPanelLoginAccepted(payload)) {
      lastMessage = payload?.message || payload?.error || lastMessage;
      continue;
    }
    return {
      ok: true,
      accessToken: String(payload.accessToken || payload.mobileToken || payload.token || '').trim(),
      apiBaseUrl: String(payload.apiBaseUrl || payload.pcApiBaseUrl || payload.mobileApiBaseUrl || '').trim().replace(/\/+$/, ''),
      userId: String(payload.userId || body?.userId || 'mobile-user'),
      tier: normalizeLoginTier(payload.tier || payload.plan || payload.licenseType || payload.type),
      expiresAt: payload.expiresAt ?? null,
      message: payload.message || '로그인되었습니다.',
    };
  }
  return { ok: false, message: lastMessage };
}

async function createLoginSession(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  verifier: MobileEntitlementVerifier | null,
  runtimeEntitlements: Map<string, MobileEntitlement>,
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
      tier?: MobileEntitlementTier;
      expiresAt?: string | null;
      message?: string;
    } = await verifyPanelLogin(body).catch((err) => ({
      ok: false,
      message: (err as Error).message || 'panel login failed',
    }));
    if (panel.ok) {
      const token = panel.accessToken || `panel-${crypto.randomUUID()}`;
      const apiBaseUrl = panel.apiBaseUrl || requestApiBaseUrl(req);
      const tier = panel.tier || 'standard';
      runtimeEntitlements.set(token, {
        subjectId: panel.userId || userId,
        tier,
        expiresAt: panel.expiresAt ?? null,
        source: 'license-service',
      });
      const session: MobileAuthSession = {
        ok: true,
        accessToken: token,
        userId: panel.userId || userId,
        tier,
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
      runtimeEntitlements.set(candidateToken || 'local-dev-mobile', {
        subjectId: userId,
        tier: 'admin',
        source: 'fixture',
      });
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

type NaverApiSettingKey =
  | 'naverClientId'
  | 'naverClientSecret'
  | 'naverSearchAdAccessLicense'
  | 'naverSearchAdSecretKey'
  | 'naverSearchAdCustomerId';

const NAVER_API_SETTING_KEYS: NaverApiSettingKey[] = [
  'naverClientId',
  'naverClientSecret',
  'naverSearchAdAccessLicense',
  'naverSearchAdSecretKey',
  'naverSearchAdCustomerId',
];

function sanitizeNaverApiSettings(body: unknown): Partial<Pick<EnvConfig, NaverApiSettingKey>> {
  const raw = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const updates: Partial<EnvConfig> = {};
  for (const key of NAVER_API_SETTING_KEYS) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim()) {
      updates[key] = value.trim();
    }
  }
  return updates;
}

type UserApiCredentialKey = NaverApiSettingKey | 'youtubeApiKey';

const USER_API_CREDENTIAL_KEYS: UserApiCredentialKey[] = [
  ...NAVER_API_SETTING_KEYS,
  'youtubeApiKey',
];

type UserApiCredentials = Partial<Record<UserApiCredentialKey, string>>;

function sanitizeUserApiCredentials(value: unknown): UserApiCredentials {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const credentials: UserApiCredentials = {};
  for (const key of USER_API_CREDENTIAL_KEYS) {
    const candidate = raw[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      credentials[key] = candidate.trim();
    }
  }
  return credentials;
}

function decodeUserApiCredentialsHeader(req: http.IncomingMessage): UserApiCredentials {
  const value = req.headers['x-leword-user-api-credentials'];
  const encoded = Array.isArray(value) ? value[0] : value;
  if (!encoded) return {};
  try {
    const jsonPayload = Buffer.from(String(encoded), 'base64').toString('utf8');
    return sanitizeUserApiCredentials(JSON.parse(jsonPayload));
  } catch {
    return {};
  }
}

function fingerprintUserApiCredentials(credentials: UserApiCredentials): string {
  const entries = USER_API_CREDENTIAL_KEYS
    .filter((key) => Boolean(credentials[key]))
    .map((key) => [
      key,
      crypto.createHash('sha256').update(String(credentials[key])).digest('hex').slice(0, 16),
    ]);
  return crypto.createHash('sha256').update(JSON.stringify(entries)).digest('hex').slice(0, 16);
}

function splitSensitiveJobParams(
  params: unknown,
  headerCredentials: UserApiCredentials,
): { publicParams: unknown; executorParams: unknown; cacheParams: unknown } {
  const raw = params && typeof params === 'object' && !Array.isArray(params)
    ? params as Record<string, unknown>
    : {};
  const bodyCredentials = sanitizeUserApiCredentials(raw.apiCredentials);
  const credentials = { ...bodyCredentials, ...headerCredentials };
  const configuredKeys = USER_API_CREDENTIAL_KEYS.filter((key) => Boolean(credentials[key]));
  if (!configuredKeys.length) {
    return { publicParams: params, executorParams: params, cacheParams: params };
  }

  const { apiCredentials: _apiCredentials, ...rest } = raw;
  const publicParams = params && typeof params === 'object' && !Array.isArray(params)
    ? rest
    : { value: params };
  const marker = {
    mode: 'user-local',
    configuredKeys,
    fingerprint: fingerprintUserApiCredentials(credentials),
  };

  return {
    publicParams: { ...publicParams, apiCredentials: marker },
    executorParams: { ...publicParams, apiCredentials: credentials },
    cacheParams: { ...publicParams, apiCredentials: marker },
  };
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
    const splitParams = splitSensitiveJobParams(params, decodeUserApiCredentialsHeader(req));
    const cachedResult = resultCache?.get(endpoint.product, splitParams.cacheParams);
    const job = cachedResult
      ? store.createCompleted(endpoint.product, splitParams.publicParams, cachedResult)
      : store.create(endpoint.product, splitParams.publicParams, async (job, context) => {
        const result = await pcWorkerExecutor({ ...job, params: splitParams.executorParams }, context);
        resultCache?.set(endpoint.product, splitParams.cacheParams, result);
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
  const liveGoldenIgnoresPrewarm = process.env['LEWORD_MOBILE_LIVE_GOLDEN_IGNORE_PREWARM'] === 'true';
  const liveGoldenRadar = options.liveGoldenRadar === null || !notificationInbox
    ? null
    : options.liveGoldenRadar || createMobileLiveGoldenRadarFromEnv(notificationInbox, () => {
      const stats = store.stats();
      if (stats.running > 0 || stats.queued > 0) {
        return { ok: false, message: 'manual mobile job queue is busy' };
      }
      if (!liveGoldenIgnoresPrewarm && prewarmService?.snapshot().running) {
        return { ok: false, message: 'server prewarm is running' };
      }
      return { ok: true };
    });
  const entitlementVerifier = options.entitlementVerifier === null
    ? null
    : options.entitlementVerifier || createEnvironmentMobileEntitlementVerifier({
      staticToken: getRequiredAuthToken(options),
    });
  const runtimeEntitlements = new Map<string, MobileEntitlement>();
  const sessionAwareEntitlementVerifier: MobileEntitlementVerifier | null = entitlementVerifier
    ? async (token) => {
      const runtime = runtimeEntitlements.get(token);
      if (runtime) {
        return { ok: true, entitlement: runtime };
      }
      return entitlementVerifier(token);
    }
    : null;
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

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Requested-With, X-Leword-User-Api-Credentials',
      });
      res.end();
      return;
    }

    if (rateLimiter && url.pathname !== '/health') {
      const limit = rateLimiter.check(req);
      if (!limit.ok) {
        rateLimited(res, limit);
        return;
      }
    }

    if (req.method === 'GET' && url.pathname === '/assets/leword-logo.png') {
      const filePath = firstExistingFile(logoCandidates());
      if (!filePath) {
        notFound(res, 'leword logo not found');
        return;
      }
      serveFile(res, filePath, 'image/png');
      return;
    }

    if (req.method === 'GET' && url.pathname === '/v1/downloads') {
      json(res, 200, {
        ok: true,
        pc: downloadMeta('pc'),
        android: downloadMeta('android'),
      }, {
        'Cache-Control': 'no-store',
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/download/pc') {
      serveDownload(res, 'pc');
      return;
    }

    if (req.method === 'GET' && url.pathname === '/download/android') {
      serveDownload(res, 'android');
      return;
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/leword' || url.pathname === '/leword/')) {
      html(res, 200, renderLewordLanding(), {
        'Cache-Control': 'no-store',
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/v1/public/live-golden') {
      json(res, 200, buildPublicLiveGoldenPayload(liveGoldenRadar?.snapshot() || null), {
        'Cache-Control': 'no-store',
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/v1/public/source-signals') {
      const limit = Number(url.searchParams.get('limit') || 18);
      const snapshot = await buildMobileSourceSignalSnapshot({
        limit: Number.isFinite(limit) ? limit : 18,
      });
      json(res, 200, buildPublicSourceSignalPayload(snapshot), {
        'Cache-Control': 'no-store',
      });
      return;
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

    if (
      req.method === 'POST' &&
      (url.pathname === MOBILE_AUTH_ROUTES.login || url.pathname === '/v1/web/session')
    ) {
      await createLoginSession(req, res, entitlementVerifier, runtimeEntitlements, notificationInbox, prewarmService, liveGoldenRadar, maxBodyBytes);
      return;
    }

    if (req.method === 'GET' && url.pathname === MOBILE_AUTH_ROUTES.dashboard) {
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'standard')) return;
      json(res, 200, { ok: true, dashboard: buildDashboard(req, notificationInbox, prewarmService, liveGoldenRadar) });
      return;
    }

    if (req.method === 'GET' && url.pathname === MOBILE_AUTH_ROUTES.pcFeatures) {
      json(res, 200, { ok: true, catalog: buildMobilePcFeatureCatalog() });
      return;
    }

    if (req.method === 'GET' && url.pathname === MOBILE_SOURCE_ROUTES.signals) {
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'standard')) return;
      const laneParam = url.searchParams.get('lane') || 'all';
      const lane = ['all', 'realtime', 'policy', 'issues'].includes(laneParam) ? laneParam as any : 'all';
      const limit = Number(url.searchParams.get('limit') || 18);
      const snapshot = await buildMobileSourceSignalSnapshot({ lane, limit });
      json(res, 200, { ok: true, snapshot });
      return;
    }

    if (req.method === 'GET' && url.pathname === MOBILE_STATUS_ROUTES.apiStatus) {
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'standard')) return;
      json(res, 200, {
        ok: true,
        snapshot: buildMobileApiStatusSnapshot({
          apiBaseUrl: requestApiBaseUrl(req),
        }),
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === MOBILE_STATUS_ROUTES.naverApiSettings) {
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'standard')) return;
      let body: unknown;
      try {
        body = await parseBody(req, maxBodyBytes);
      } catch (err) {
        handleBodyError(res, err, maxBodyBytes);
        return;
      }
      try {
        const updates = sanitizeNaverApiSettings(body);
        const savedKeys = Object.keys(updates);
        if (!savedKeys.length) {
          json(res, 400, { ok: false, message: 'no naver api settings provided' } satisfies MobileJobErrorResponse);
          return;
        }
        const envManager = EnvironmentManager.getInstance();
        await envManager.saveConfig(updates);
        envManager.reloadConfig();
        json(res, 200, {
          ok: true,
          savedKeys,
          snapshot: buildMobileApiStatusSnapshot({
            apiBaseUrl: requestApiBaseUrl(req),
          }),
        });
      } catch (err) {
        json(res, 500, { ok: false, message: (err as Error).message || 'naver api settings save failed' } satisfies MobileJobErrorResponse);
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === MOBILE_EXPORT_ROUTES.keywords) {
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'standard')) return;
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
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'standard')) return;
      json(res, 200, { ok: true, snapshot: readMobileWordPressSnapshot() });
      return;
    }

    if (req.method === 'POST' && url.pathname === MOBILE_WORDPRESS_ROUTES.site) {
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'standard')) return;
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
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'standard')) return;
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
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'standard')) return;
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
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'standard')) return;
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
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'standard')) return;
      json(res, 200, { ok: true, snapshot: readMobileKeywordGroupSnapshot() });
      return;
    }

    if (req.method === 'GET' && url.pathname === MOBILE_SCHEDULE_ROUTES.dashboard) {
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'standard')) return;
      json(res, 200, { ok: true, snapshot: buildMobileScheduleDashboardSnapshot() });
      return;
    }

    if (req.method === 'GET' && url.pathname === MOBILE_RANK_TRACKING_ROUTES.snapshot) {
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'standard')) return;
      json(res, 200, { ok: true, snapshot: readMobileRankTrackingSnapshot() });
      return;
    }

    if (req.method === 'POST' && url.pathname === MOBILE_RANK_TRACKING_ROUTES.manual) {
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'standard')) return;
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
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'standard')) return;
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
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'standard')) return;
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
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'standard')) return;
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
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'standard')) return;
      json(res, 200, { ok: true, snapshot: readMobileProOutcomeSnapshot() });
      return;
    }

    if (req.method === 'POST' && url.pathname === MOBILE_PRO_OUTCOME_ROUTES.record) {
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'standard')) return;
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
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'standard')) return;
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
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'standard')) return;
      const result = syncMobileProOutcomesFromRankTracker();
      json(res, 202, { ok: true, result });
      return;
    }

    if (req.method === 'POST' && url.pathname === MOBILE_PRO_BLUEPRINT_ROUTES.blueprint) {
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'pro')) return;
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
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'pro')) return;
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
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'pro')) return;
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
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'pro')) return;
      const result = loadMobileProRevenueConfig();
      json(res, 200, { ok: true, result });
      return;
    }

    if (req.method === 'POST' && url.pathname === MOBILE_PRO_BLUEPRINT_ROUTES.revenueConfig) {
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'pro')) return;
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
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'pro')) return;
      const result = getMobileProCategoryRpmTable();
      json(res, 200, { ok: true, result });
      return;
    }

    if (req.method === 'POST' && url.pathname === MOBILE_PRO_BLUEPRINT_ROUTES.portfolioRevenue) {
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'pro')) return;
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
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'standard')) return;
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
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'standard')) return;
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
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'standard')) return;
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
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'standard')) return;
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
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'standard')) return;
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
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'standard')) return;
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
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'standard')) return;
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
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'standard')) return;
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
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'standard')) return;
      if (!notificationInbox) {
        json(res, 503, { ok: false, message: 'mobile notification inbox disabled' } satisfies MobileJobErrorResponse);
        return;
      }
      const limit = Number(url.searchParams.get('limit') || 30);
      json(res, 200, { ok: true, snapshot: notificationInbox.snapshot(limit) });
      return;
    }

    if (req.method === 'PATCH' && notificationReadMatch) {
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'standard')) return;
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
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'standard')) return;
      if (!liveGoldenRadar) {
        json(res, 503, { ok: false, message: 'mobile live golden radar disabled' } satisfies MobileJobErrorResponse);
        return;
      }
      json(res, 200, { ok: true, snapshot: liveGoldenRadar.snapshot() });
      return;
    }

    if (req.method === 'POST' && url.pathname === MOBILE_LIVE_GOLDEN_ROUTES.run) {
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'admin')) return;
      if (!liveGoldenRadar) {
        json(res, 503, { ok: false, message: 'mobile live golden radar disabled' } satisfies MobileJobErrorResponse);
        return;
      }
      try {
        const body = await parseBody(req, maxBodyBytes) as { cycles?: unknown };
        const requestedCycles = Number(body?.cycles || url.searchParams.get('cycles') || 1);
        const cycles = Number.isFinite(requestedCycles) ? Math.max(1, Math.min(8, Math.floor(requestedCycles))) : 1;
        const snapshot = cycles > 1
          ? await liveGoldenRadar.runUntilTarget(cycles)
          : await liveGoldenRadar.runOnce();
        json(res, 202, { ok: true, snapshot, cycles });
      } catch (err) {
        handleBodyError(res, err, maxBodyBytes);
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === MOBILE_PREWARM_ROUTES.snapshot) {
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'standard')) return;
      if (!prewarmService) {
        json(res, 503, { ok: false, message: 'mobile prewarm service disabled' } satisfies MobileJobErrorResponse);
        return;
      }
      json(res, 200, { ok: true, snapshot: prewarmService.snapshot() });
      return;
    }

    if (req.method === 'POST' && url.pathname === MOBILE_PREWARM_ROUTES.run) {
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'admin')) return;
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
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, getMinimumMobileEntitlementTier(job.product))) return;
      streamJobEvents(req, res, store, jobRoute.jobId);
      return;
    }

    if (jobRoute && req.method === 'GET') {
      const job = store.get(jobRoute.jobId);
      if (!job) {
        notFound(res, 'job not found');
        return;
      }
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, getMinimumMobileEntitlementTier(job.product))) return;
      json(res, 200, { ok: true, job, links: jobLinks(job.id) });
      return;
    }

    if (jobRoute && req.method === 'DELETE') {
      const job = store.cancel(jobRoute.jobId);
      if (!job) {
        notFound(res, 'job not found');
        return;
      }
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, getMinimumMobileEntitlementTier(job.product))) return;
      json(res, 200, { ok: true, job, links: jobLinks(job.id) });
      return;
    }

    const endpoint = MOBILE_API_ENDPOINTS.find((item) => item.method === req.method && item.path === url.pathname);
    if (!endpoint) {
      notFound(res);
      return;
    }

    if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, getMinimumMobileEntitlementTier(endpoint.product))) return;
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
