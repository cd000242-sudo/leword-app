import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
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
  type MobileKeywordMetric,
  type MobileKeywordProduct,
  type MobileKeywordResult,
  type MobileShoppingProductPick,
  type MobileKeywordScheduleCreateInput,
  type MobileKeywordScheduleUpdateInput,
  type MobileWordPressDraftInput,
  type MobileWordPressPublishInput,
  type MobileWordPressSiteInput,
  type MobileSignalItem,
  type MobileSourceSignalSnapshot,
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
  applyKeywordAiJudge,
} from '../../../src/mobile/keyword-ai-judge';
import {
  createEnvironmentMobileEntitlementVerifier,
  getMinimumMobileEntitlementTier,
  isMobileEntitlementAllowed,
  type MobileEntitlement,
  type MobileEntitlementVerification,
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
  computeConversionScore,
  rankShoppingOpportunities,
  searchNaverShopping,
} from '../../../src/utils/naver-shopping-api';
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
  buildCommerceCatalog,
  buildCommerceDashboard,
  confirmTossPayment,
  createCommerceOrder,
  recordAnalyticsEvent,
  recordTossWebhookEvent,
  resolveCommerceStoreFile,
} from '../../../src/mobile/commerce-ops';
import {
  getMobileApiGuardrailOptions,
  MobileApiBodyTooLargeError,
  MobileApiRateLimiter,
  parseMobileJsonBody,
  type MobileApiGuardrailOptions,
} from '../../../src/mobile/api-guardrails';
import { isMindmapExpansionKeywordCandidate } from '../../../src/utils/mindmap-expansion-quality';

const DEFAULT_LEWORD_LICENSE_SERVER_URL = 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';
const DEFAULT_LEWORD_LICENSE_APP_ID = 'com.leword.keyword.master';
const ADSENSE_ADS_TXT = 'google.com, pub-4008574892672964, DIRECT, f08c47fec0942fa0\n';
const DEFAULT_LEADERS_PRO_ADMIN_TOKEN = 'qkrtjdgus2021645';
const ADMIN_SETTINGS_UNLOCK_ROUTE = '/v1/admin/settings/unlock';
const ADMIN_SITE_CONTENT_ROUTE = '/v1/admin/site-content';
const ADMIN_DOWNLOAD_UPLOAD_ROUTE = '/v1/admin/downloads/upload';
const ADMIN_DOWNLOAD_CHUNK_UPLOAD_ROUTE = '/v1/admin/downloads/upload-chunk';
const ADMIN_COMMERCE_DASHBOARD_ROUTE = '/v1/admin/commerce/dashboard';
const ADMIN_AI_WORKER_STATUS_ROUTE = '/v1/admin/ai-worker/status';
const PUBLIC_SITE_CONTENT_ROUTE = '/v1/public/site-content';
const PUBLIC_COMMERCE_CATALOG_ROUTE = '/v1/public/commerce/catalog';
const PUBLIC_ANALYTICS_COLLECT_ROUTE = '/v1/analytics/collect';
const CHECKOUT_ORDER_ROUTE = '/v1/checkout/orders';
const TOSS_CONFIRM_ROUTE = '/v1/payments/toss/confirm';
const TOSS_WEBHOOK_ROUTE = '/v1/payments/toss/webhook';

function positiveIntegerEnv(name: string, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(max, parsed));
}

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
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Requested-With, X-Leword-User-Api-Credentials, X-LeadersPro-Admin-Token, X-Leword-Admin-Token',
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
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Requested-With, X-Leword-User-Api-Credentials, X-LeadersPro-Admin-Token, X-Leword-Admin-Token',
    ...headers,
  });
  res.end(body);
}

function text(
  res: http.ServerResponse,
  statusCode: number,
  body: string,
  headers: Record<string, string | number> = {},
): void {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Requested-With, X-Leword-User-Api-Credentials, X-LeadersPro-Admin-Token, X-Leword-Admin-Token',
    ...headers,
  });
  res.end(body);
}

type DownloadProductKey = 'leword' | 'naver' | 'orbit';
type LewordDownloadKind = 'windows' | 'android' | 'mac-arm' | 'mac-intel';

const LEWORD_DESKTOP_VERSION = '2.49.86';
const LEWORD_DESKTOP_FILENAME = `LEWORD-${LEWORD_DESKTOP_VERSION}.exe`;
const LEWORD_ANDROID_FILENAME = 'LEWORD-mobile-0.1.0.apk';

const DOWNLOAD_PRODUCT_LABELS: Record<DownloadProductKey, string> = {
  leword: 'LEWORD',
  naver: 'Better Life Naver',
  orbit: 'LEADERNAM Orbit',
};

const DOWNLOAD_DEFAULT_FILENAMES: Record<DownloadProductKey, Record<LewordDownloadKind, string>> = {
  leword: {
    windows: LEWORD_DESKTOP_FILENAME,
    android: LEWORD_ANDROID_FILENAME,
    'mac-arm': `LEWORD-${LEWORD_DESKTOP_VERSION}-arm64.dmg`,
    'mac-intel': `LEWORD-${LEWORD_DESKTOP_VERSION}-x64.dmg`,
  },
  naver: {
    windows: 'Better-Life-Naver-Setup-2.11.67.exe',
    android: 'Better-Life-Naver-mobile.apk',
    'mac-arm': 'Better-Life-Naver-2.11.67-arm64.dmg',
    'mac-intel': 'Better-Life-Naver-2.11.67-x64.dmg',
  },
  orbit: {
    windows: 'LEADERNAM-Orbit-3.8.231.exe',
    android: 'LEADERNAM-Orbit-mobile.apk',
    'mac-arm': 'LEADERNAM-Orbit-3.8.231-arm64.dmg',
    'mac-intel': 'LEADERNAM-Orbit-3.8.231-x64.dmg',
  },
};

interface LewordDownloadMeta {
  available: boolean;
  product: DownloadProductKey;
  kind: LewordDownloadKind;
  filename: string;
  size: number;
  updatedAt: string | null;
  url: string;
  source?: 'uploaded' | 'server' | 'missing';
}

interface LewordDownloadUploadRecord {
  product: DownloadProductKey;
  kind: LewordDownloadKind;
  filename: string;
  storedFilename: string;
  size: number;
  updatedAt: string;
  uploadedBy: string;
}

interface MultipartFileUpload {
  fieldName: string;
  filename: string;
  contentType: string;
  data: Buffer;
}

function downloadRoot(): string {
  if (process.env.LEWORD_DOWNLOAD_DIR) return process.env.LEWORD_DOWNLOAD_DIR;
  if (fs.existsSync('/data')) return '/data/downloads';
  return path.resolve(process.cwd(), 'downloads');
}

function downloadUploadMaxBytes(): number {
  const configured = Number(process.env.LEWORD_DOWNLOAD_UPLOAD_MAX_BYTES || 0);
  if (Number.isFinite(configured) && configured > 0) return Math.floor(configured);
  return 512 * 1024 * 1024;
}

function downloadUploadChunkMaxBytes(): number {
  const configured = Number(process.env.LEWORD_DOWNLOAD_UPLOAD_CHUNK_MAX_BYTES || 0);
  if (Number.isFinite(configured) && configured > 0) return Math.floor(configured);
  return 8 * 1024 * 1024;
}

function apiDataRoot(): string {
  if (process.env.LEWORD_API_DATA_DIR) return process.env.LEWORD_API_DATA_DIR;
  if (fs.existsSync('/data')) return '/data';
  return path.resolve(process.cwd(), 'data');
}

type SiteContentSection = 'products' | 'chatbots' | 'purchase';

interface SiteContentDraft {
  section: SiteContentSection;
  products: Array<Record<string, unknown>>;
  chatbots: Array<Record<string, unknown>>;
  purchase: Record<string, unknown>;
  updatedAt: string;
  updatedBy: string;
}

function defaultSiteContentDraft(): SiteContentDraft {
  return {
    section: 'products',
    products: [
      { id: 'naver', name: 'Better Life Naver', status: 'published', href: '/detail' },
      { id: 'leword', name: 'LEWORD', status: 'published', href: '/products#product-leword' },
      { id: 'orbit', name: 'Leaders Orbit', status: 'published', href: '/orbit' },
    ],
    chatbots: [],
    purchase: {
      headline: 'Leaders Pro 올인원',
      note: '구매/무료 체험/제품 안내 문구를 관리자 화면에서 수정할 수 있습니다.',
    },
    updatedAt: new Date(0).toISOString(),
    updatedBy: 'system',
  };
}

function siteContentFile(): string {
  return process.env.LEADERS_PRO_SITE_CONTENT_FILE || path.join(apiDataRoot(), 'leaderspro-site-content.json');
}

function normalizeSiteContentSection(value: unknown): SiteContentSection {
  return value === 'chatbots' || value === 'purchase' || value === 'products' ? value : 'products';
}

function sanitizeRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => item as Record<string, unknown>)
    .slice(0, 80);
}

function sanitizeSiteContentDraft(value: unknown, updatedBy = 'admin'): SiteContentDraft {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const fallback = defaultSiteContentDraft();
  const purchase = raw.purchase && typeof raw.purchase === 'object' && !Array.isArray(raw.purchase)
    ? raw.purchase as Record<string, unknown>
    : fallback.purchase;
  return {
    section: normalizeSiteContentSection(raw.section),
    products: sanitizeRecordArray(raw.products).length ? sanitizeRecordArray(raw.products) : fallback.products,
    chatbots: sanitizeRecordArray(raw.chatbots),
    purchase,
    updatedAt: new Date().toISOString(),
    updatedBy: String(updatedBy || 'admin').slice(0, 80),
  };
}

function readSiteContentDraft(): SiteContentDraft {
  const filePath = siteContentFile();
  try {
    if (!fs.existsSync(filePath)) return defaultSiteContentDraft();
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return sanitizeSiteContentDraft(parsed, String(parsed?.updatedBy || 'server'));
  } catch {
    return defaultSiteContentDraft();
  }
}

function writeSiteContentDraft(value: SiteContentDraft): void {
  const filePath = siteContentFile();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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

function downloadUploadRecordPath(product: DownloadProductKey, kind: LewordDownloadKind): string {
  return path.join(downloadRoot(), `${product}-${kind}-upload.json`);
}

function assertInsideDownloadRoot(targetPath: string): void {
  const root = path.resolve(downloadRoot());
  const resolved = path.resolve(targetPath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('download path escaped root');
  }
}

function legacyDownloadUploadRecordPath(product: DownloadProductKey, kind: LewordDownloadKind): string | null {
  if (product !== 'leword') return null;
  if (kind === 'windows') return path.join(downloadRoot(), 'pc-upload.json');
  if (kind === 'android') return path.join(downloadRoot(), 'android-upload.json');
  return null;
}

function normalizeDownloadProduct(value: unknown): DownloadProductKey | null {
  const product = String(value || '').trim().toLowerCase();
  if (product === 'leword' || product === 'le-word') return 'leword';
  if (product === 'naver' || product === 'better-life-naver' || product === 'betterlife-naver') return 'naver';
  if (product === 'orbit' || product === 'leadernam-orbit' || product === 'leaders-orbit') return 'orbit';
  return null;
}

function normalizeDownloadKind(value: unknown): LewordDownloadKind | null {
  const kind = String(value || '').trim().toLowerCase();
  if (kind === 'pc' || kind === 'desktop' || kind === 'windows' || kind === 'win') return 'windows';
  if (kind === 'android' || kind === 'apk' || kind === 'mobile') return 'android';
  if (kind === 'mac-arm' || kind === 'macarm' || kind === 'darwin-arm64' || kind === 'arm64') return 'mac-arm';
  if (kind === 'mac-intel' || kind === 'macintel' || kind === 'darwin-x64' || kind === 'x64') return 'mac-intel';
  return null;
}

function defaultDownloadFilename(product: DownloadProductKey, kind: LewordDownloadKind): string {
  return DOWNLOAD_DEFAULT_FILENAMES[product]?.[kind] || `${product}-${kind}`;
}

function readDownloadUploadRecord(product: DownloadProductKey, kind: LewordDownloadKind): LewordDownloadUploadRecord | null {
  try {
    const primaryPath = downloadUploadRecordPath(product, kind);
    const legacyPath = legacyDownloadUploadRecordPath(product, kind);
    const recordPath = fs.existsSync(primaryPath) ? primaryPath : legacyPath;
    if (!recordPath || !fs.existsSync(recordPath)) return null;
    const parsed = JSON.parse(fs.readFileSync(recordPath, 'utf8')) as Partial<LewordDownloadUploadRecord>;
    const parsedProduct = normalizeDownloadProduct(parsed.product) || product;
    const parsedKind = normalizeDownloadKind(parsed.kind) || kind;
    const filename = String(parsed.filename || '').trim();
    const storedFilename = String(parsed.storedFilename || '').trim();
    if (parsedProduct !== product || parsedKind !== kind || !filename || !storedFilename) return null;
    const filePath = path.join(downloadRoot(), path.basename(storedFilename));
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
    return {
      product,
      kind,
      filename,
      storedFilename: path.basename(storedFilename),
      size: Number(parsed.size || fs.statSync(filePath).size),
      updatedAt: String(parsed.updatedAt || fs.statSync(filePath).mtime.toISOString()),
      uploadedBy: String(parsed.uploadedBy || 'admin'),
    };
  } catch {
    return null;
  }
}

function uploadedDownloadCandidate(product: DownloadProductKey, kind: LewordDownloadKind): string | undefined {
  const record = readDownloadUploadRecord(product, kind);
  return record ? path.join(downloadRoot(), record.storedFilename) : undefined;
}

function downloadEnvPath(product: DownloadProductKey, kind: LewordDownloadKind): string | undefined {
  const envKey = `${product}_${kind}`.replace(/-/g, '_').toUpperCase();
  const generic = process.env[`${envKey}_DOWNLOAD_PATH`];
  if (generic) return generic;
  if (product === 'leword' && kind === 'windows') return process.env.LEWORD_PC_APP_DOWNLOAD_PATH;
  if (product === 'leword' && kind === 'android') return process.env.LEWORD_ANDROID_APK_DOWNLOAD_PATH;
  if (product === 'naver' && kind === 'windows') return process.env.NAVER_PC_APP_DOWNLOAD_PATH;
  if (product === 'orbit' && kind === 'windows') return process.env.ORBIT_PC_APP_DOWNLOAD_PATH;
  return undefined;
}

function defaultRootDownloadCandidates(product: DownloadProductKey, kind: LewordDownloadKind): string[] {
  const root = downloadRoot();
  const filename = defaultDownloadFilename(product, kind);
  const candidates = [
    path.join(root, filename),
    path.resolve(process.cwd(), 'release', filename),
    path.resolve(process.cwd(), '..', '..', 'release', filename),
  ];
  if (product === 'leword' && kind === 'windows') {
    candidates.push(
      path.join(root, 'LEWORD-2.49.84.exe'),
      path.join(root, 'LEWORD-setup.exe'),
      path.resolve(process.cwd(), 'release', 'LEWORD-2.49.84.exe'),
      path.resolve(process.cwd(), '..', '..', 'release', 'LEWORD-2.49.84.exe'),
    );
  }
  if (product === 'leword' && kind === 'android') {
    candidates.push(
      path.join(root, 'LEWORD-mobile.apk'),
      path.resolve(process.cwd(), 'apps', 'mobile', 'builds', LEWORD_ANDROID_FILENAME),
      path.resolve(process.cwd(), '..', '..', 'apps', 'mobile', 'builds', LEWORD_ANDROID_FILENAME),
      path.resolve(process.cwd(), 'apps', 'mobile', 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'),
    );
  }
  return candidates;
}

function downloadCandidates(product: DownloadProductKey, kind: LewordDownloadKind): string[] {
  return [
    uploadedDownloadCandidate(product, kind),
    downloadEnvPath(product, kind),
    ...defaultRootDownloadCandidates(product, kind),
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

function downloadMeta(product: DownloadProductKey, kind: LewordDownloadKind, urlOverride?: string): LewordDownloadMeta {
  const filePath = firstExistingFile(downloadCandidates(product, kind));
  const uploadRecord = readDownloadUploadRecord(product, kind);
  const uploadedPath = uploadRecord ? path.join(downloadRoot(), uploadRecord.storedFilename) : '';
  const filename = defaultDownloadFilename(product, kind);
  const url = urlOverride || `/download/${product}/${kind}`;
  if (!filePath) {
    return {
      available: false,
      product,
      kind,
      filename,
      size: 0,
      updatedAt: null,
      url,
      source: 'missing',
    };
  }
  const stat = fs.statSync(filePath);
  const isUploaded = !!uploadRecord && path.resolve(filePath) === path.resolve(uploadedPath);
  return {
    available: true,
    product,
    kind,
    filename: isUploaded ? uploadRecord.filename : path.basename(filePath) || filename,
    size: stat.size,
    updatedAt: isUploaded ? uploadRecord.updatedAt : stat.mtime.toISOString(),
    url,
    source: isUploaded ? 'uploaded' : 'server',
  };
}

function downloadProductPayload(product: DownloadProductKey): Record<LewordDownloadKind, LewordDownloadMeta> {
  return {
    windows: downloadMeta(product, 'windows'),
    android: downloadMeta(product, 'android'),
    'mac-arm': downloadMeta(product, 'mac-arm'),
    'mac-intel': downloadMeta(product, 'mac-intel'),
  };
}

function buildDownloadsPayload() {
  return {
    ok: true,
    pc: downloadMeta('leword', 'windows', '/download/pc'),
    android: downloadMeta('leword', 'android', '/download/android'),
    products: {
      leword: downloadProductPayload('leword'),
      naver: downloadProductPayload('naver'),
      orbit: downloadProductPayload('orbit'),
    },
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

function downloadContentType(kind: LewordDownloadKind, filename?: string): string {
  const ext = path.extname(filename || '').toLowerCase();
  if (kind === 'android' || ext === '.apk') return 'application/vnd.android.package-archive';
  if (ext === '.dmg') return 'application/x-apple-diskimage';
  if (ext === '.zip') return 'application/zip';
  return 'application/vnd.microsoft.portable-executable';
}

function serveDownload(res: http.ServerResponse, product: DownloadProductKey, kind: LewordDownloadKind): void {
  const filePath = firstExistingFile(downloadCandidates(product, kind));
  if (!filePath) {
    json(res, 404, {
      ok: false,
      message: `${DOWNLOAD_PRODUCT_LABELS[product]} ${kind} installer is not ready`,
    } satisfies MobileJobErrorResponse);
    return;
  }
  const meta = downloadMeta(product, kind);
  serveFile(
    res,
    filePath,
    downloadContentType(kind, meta.filename || filePath),
    meta.available ? meta.filename : path.basename(filePath),
  );
}

function sanitizeUploadedFilename(filename: string, fallback: string): string {
  const base = path.basename(String(filename || '').replace(/\\/g, '/')).trim();
  const safe = base.replace(/[^\w.\-+()[\] ]+/g, '_').replace(/\s+/g, ' ').slice(0, 180);
  return safe || fallback;
}

function validateDownloadUploadExtension(kind: LewordDownloadKind, filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (kind === 'windows' && (ext === '.exe' || ext === '.msi')) return ext;
  if (kind === 'android' && ext === '.apk') return ext;
  if ((kind === 'mac-arm' || kind === 'mac-intel') && (ext === '.dmg' || ext === '.pkg' || ext === '.zip')) return ext;
  if (kind === 'windows') throw new Error('Windows installer uploads only accept .exe or .msi files.');
  if (kind === 'android') throw new Error('Android app uploads only accept .apk files.');
  throw new Error('Mac installer uploads only accept .dmg, .pkg, or .zip files.');
}

function storedDownloadFilename(kind: LewordDownloadKind | 'pc', originalFilename: string): string {
  const ext = kind === 'pc' ? path.extname(originalFilename).toLowerCase() : validateDownloadUploadExtension(kind, originalFilename);
  return kind === 'pc' ? `LEWORD-admin-setup${ext}` : 'LEWORD-admin-mobile.apk';
}

function storedProductDownloadFilename(product: DownloadProductKey, kind: LewordDownloadKind, originalFilename: string): string {
  const ext = validateDownloadUploadExtension(kind, originalFilename);
  return `${product}-${kind}-admin${ext}`;
}

function safeUploadId(value: unknown): string {
  const id = String(value || '').trim().replace(/[^\w.-]+/g, '').slice(0, 96);
  if (!id) throw new Error('uploadId is required');
  return id;
}

function chunkUploadDir(product: DownloadProductKey, kind: LewordDownloadKind, uploadId: string): string {
  const dir = path.join(downloadRoot(), '.chunks', `${product}-${kind}-${safeUploadId(uploadId)}`);
  assertInsideDownloadRoot(dir);
  return dir;
}

function chunkPartPath(dir: string, index: number): string {
  const partPath = path.join(dir, `${String(index).padStart(6, '0')}.part`);
  assertInsideDownloadRoot(partPath);
  return partPath;
}

function writeDownloadUploadRecord(record: LewordDownloadUploadRecord): void {
  const root = downloadRoot();
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(downloadUploadRecordPath(record.product, record.kind), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

function parseContentDisposition(value: string): Record<string, string> {
  const out: Record<string, string> = {};
  value.split(';').slice(1).forEach((part) => {
    const index = part.indexOf('=');
    if (index < 0) return;
    const key = part.slice(0, index).trim().toLowerCase();
    const raw = part.slice(index + 1).trim();
    out[key] = raw.replace(/^"|"$/g, '').replace(/\\"/g, '"');
  });
  return out;
}

function readRequestBuffer(req: http.IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new MobileApiBodyTooLargeError(maxBytes));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', reject);
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

async function parseMultipartUpload(
  req: http.IncomingMessage,
  maxBytes: number,
): Promise<{ fields: Record<string, string>; files: MultipartFileUpload[] }> {
  const contentType = String(req.headers['content-type'] || '');
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = (boundaryMatch?.[1] || boundaryMatch?.[2] || '').trim();
  if (!boundary) throw new Error('multipart boundary missing');
  const body = await readRequestBuffer(req, maxBytes);
  const marker = `--${boundary}`;
  const parts = body.toString('latin1').split(marker).slice(1, -1);
  const fields: Record<string, string> = {};
  const files: MultipartFileUpload[] = [];
  for (const rawPart of parts) {
    let part = rawPart;
    if (part.startsWith('\r\n')) part = part.slice(2);
    if (part.endsWith('\r\n')) part = part.slice(0, -2);
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd < 0) continue;
    const headerText = part.slice(0, headerEnd);
    const bodyText = part.slice(headerEnd + 4);
    const headers = new Map<string, string>();
    headerText.split('\r\n').forEach((line) => {
      const index = line.indexOf(':');
      if (index < 0) return;
      headers.set(line.slice(0, index).trim().toLowerCase(), line.slice(index + 1).trim());
    });
    const disposition = parseContentDisposition(headers.get('content-disposition') || '');
    const name = disposition.name || '';
    if (!name) continue;
    const data = Buffer.from(bodyText, 'latin1');
    if (disposition.filename !== undefined) {
      files.push({
        fieldName: name,
        filename: disposition.filename,
        contentType: headers.get('content-type') || 'application/octet-stream',
        data,
      });
    } else {
      fields[name] = data.toString('utf8').trim();
    }
  }
  return { fields, files };
}

async function handleAdminDownloadUpload(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  maxUploadBytes: number,
): Promise<void> {
  try {
    const parsed = await parseMultipartUpload(req, maxUploadBytes);
    const product = normalizeDownloadProduct(parsed.fields.product) || 'leword';
    const kind = normalizeDownloadKind(parsed.fields.kind);
    if (!kind) {
      json(res, 400, { ok: false, message: '업로드 종류를 선택하세요. PC, Android APK, Mac 파일 중 하나가 필요합니다.' } satisfies MobileJobErrorResponse);
      return;
    }
    const file = parsed.files.find((item) => item.fieldName === 'file') || parsed.files[0];
    if (!file || file.data.length <= 0) {
      json(res, 400, { ok: false, message: '업로드할 설치 파일을 선택하세요.' } satisfies MobileJobErrorResponse);
      return;
    }
    const displayFilename = sanitizeUploadedFilename(
      file.filename,
      defaultDownloadFilename(product, kind),
    );
    const storedFilename = storedProductDownloadFilename(product, kind, displayFilename);
    const root = downloadRoot();
    fs.mkdirSync(root, { recursive: true });
    const targetPath = path.join(root, storedFilename);
    const tmpPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, file.data);
    fs.renameSync(tmpPath, targetPath);
    const record: LewordDownloadUploadRecord = {
      product,
      kind,
      filename: displayFilename,
      storedFilename,
      size: file.data.length,
      updatedAt: new Date().toISOString(),
      uploadedBy: String(parsed.fields.updatedBy || 'admin').slice(0, 80),
    };
    writeDownloadUploadRecord(record);
    json(res, 200, {
      ok: true,
      message: `${DOWNLOAD_PRODUCT_LABELS[product]} ${kind} 업로드가 완료되었습니다.`,
      product,
      kind,
      download: downloadMeta(product, kind),
      downloads: buildDownloadsPayload(),
    }, {
      'Cache-Control': 'no-store',
    });
  } catch (err) {
    if (err instanceof MobileApiBodyTooLargeError) {
      payloadTooLarge(res, maxUploadBytes);
      return;
    }
    json(res, 400, {
      ok: false,
      message: err instanceof Error ? err.message : '파일 업로드에 실패했습니다.',
    } satisfies MobileJobErrorResponse);
  }
}

async function handleAdminDownloadChunkUpload(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  maxChunkBytes: number,
): Promise<void> {
  try {
    const product = normalizeDownloadProduct(url.searchParams.get('product')) || 'leword';
    const kind = normalizeDownloadKind(url.searchParams.get('kind'));
    if (!kind) {
      json(res, 400, { ok: false, message: '업로드 종류를 선택하세요. PC, Android APK, Mac 파일 중 하나가 필요합니다.' } satisfies MobileJobErrorResponse);
      return;
    }

    const originalFilename = sanitizeUploadedFilename(
      url.searchParams.get('filename') || '',
      defaultDownloadFilename(product, kind),
    );
    validateDownloadUploadExtension(kind, originalFilename);

    const uploadId = safeUploadId(url.searchParams.get('uploadId'));
    const chunkIndex = Number(url.searchParams.get('chunkIndex'));
    const totalChunks = Number(url.searchParams.get('totalChunks'));
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0) throw new Error('chunkIndex is invalid');
    if (!Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > 10000) throw new Error('totalChunks is invalid');
    if (chunkIndex >= totalChunks) throw new Error('chunkIndex exceeds totalChunks');

    const chunk = await readRequestBuffer(req, maxChunkBytes);
    if (!chunk.length) throw new Error('empty chunk');

    const dir = chunkUploadDir(product, kind, uploadId);
    if (chunkIndex === 0) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(chunkPartPath(dir, chunkIndex), chunk);

    const receivedChunks = Array.from({ length: totalChunks }, (_, index) => fs.existsSync(chunkPartPath(dir, index))).filter(Boolean).length;
    if (receivedChunks < totalChunks) {
      json(res, 200, {
        ok: true,
        done: false,
        product,
        kind,
        receivedChunks,
        totalChunks,
      }, {
        'Cache-Control': 'no-store',
      });
      return;
    }

    const root = downloadRoot();
    fs.mkdirSync(root, { recursive: true });
    const storedFilename = storedProductDownloadFilename(product, kind, originalFilename);
    const targetPath = path.join(root, storedFilename);
    assertInsideDownloadRoot(targetPath);
    const tmpPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, Buffer.alloc(0));
    let totalSize = 0;
    for (let index = 0; index < totalChunks; index += 1) {
      const partPath = chunkPartPath(dir, index);
      const part = fs.readFileSync(partPath);
      totalSize += part.length;
      fs.appendFileSync(tmpPath, part);
    }
    fs.renameSync(tmpPath, targetPath);
    fs.rmSync(dir, { recursive: true, force: true });

    const record: LewordDownloadUploadRecord = {
      product,
      kind,
      filename: originalFilename,
      storedFilename,
      size: totalSize,
      updatedAt: new Date().toISOString(),
      uploadedBy: String(url.searchParams.get('updatedBy') || 'admin').slice(0, 80),
    };
    writeDownloadUploadRecord(record);
    json(res, 200, {
      ok: true,
      done: true,
      message: `${DOWNLOAD_PRODUCT_LABELS[product]} ${kind} 업로드가 완료되었습니다.`,
      product,
      kind,
      receivedChunks,
      totalChunks,
      download: downloadMeta(product, kind),
      downloads: buildDownloadsPayload(),
    }, {
      'Cache-Control': 'no-store',
    });
  } catch (err) {
    if (err instanceof MobileApiBodyTooLargeError) {
      payloadTooLarge(res, maxChunkBytes);
      return;
    }
    json(res, 400, {
      ok: false,
      message: err instanceof Error ? err.message : '파일 업로드에 실패했습니다.',
    } satisfies MobileJobErrorResponse);
  }
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

function isRateLimitExemptRoute(pathname: string): boolean {
  return pathname === '/health'
    || pathname === ADMIN_DOWNLOAD_UPLOAD_ROUTE
    || pathname === ADMIN_DOWNLOAD_CHUNK_UPLOAD_ROUTE;
}

function getRequiredAuthToken(options: LewordApiServerOptions): string {
  const explicit = options.authToken;
  if (typeof explicit === 'string') return explicit.trim();
  if (explicit === null) return '';
  return (process.env['LEWORD_MOBILE_API_TOKEN'] || '').trim();
}

function getWebSessionSigningSecret(options: LewordApiServerOptions): string {
  return String(process.env['LEWORD_WEB_SESSION_SECRET'] || '').trim()
    || getRequiredAuthToken(options);
}

function getBearerToken(req: http.IncomingMessage): string {
  const authorization = req.headers.authorization || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function getHeaderValue(req: http.IncomingMessage, name: string): string {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? String(value[0] || '').trim() : String(value || '').trim();
}

function configuredLeadersProAdminToken(): string {
  return String(
    process.env['LEADERS_PRO_ADMIN_TOKEN']
      || process.env['LEWORD_ADMIN_TOKEN']
      || DEFAULT_LEADERS_PRO_ADMIN_TOKEN,
  ).trim();
}

function authorizeLeadersProAdminToken(req: http.IncomingMessage): boolean {
  const expected = configuredLeadersProAdminToken();
  const received = getHeaderValue(req, 'x-leaderspro-admin-token') || getHeaderValue(req, 'x-leword-admin-token');
  return !!expected && !!received && stringEqualsConstantTime(received, expected);
}

function adminSettingsPasswordHash(): string {
  return String(process.env['LEWORD_ADMIN_SETTINGS_PASSWORD_SHA256'] || '').trim().toLowerCase();
}

function verifyAdminSettingsPassword(password: string): { ok: boolean; configured: boolean } {
  const expected = adminSettingsPasswordHash();
  if (!/^[a-f0-9]{64}$/.test(expected)) return { ok: false, configured: false };
  const actual = crypto.createHash('sha256').update(password, 'utf8').digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(actual, 'hex');
  return {
    ok: expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer),
    configured: true,
  };
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

async function authorizeAdminDownloadUploadRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  verifier: MobileEntitlementVerifier | null,
): Promise<boolean> {
  if (authorizeLeadersProAdminToken(req)) return true;
  return authorizeMobileRequest(req, res, verifier, 'admin');
}

type AdminAiWorkerProvider = 'codex' | 'claude-code' | 'api';

interface AdminAiWorkerCliProbe {
  installed: boolean;
  loggedIn: boolean;
  status: 'ready' | 'login-required' | 'not-installed' | 'unknown';
  command: string;
  version?: string;
  detail: string;
  checkedAt: string;
}

interface AdminAiWorkerStatusRequest {
  selectedProvider?: unknown;
  apiAssist?: unknown;
}

function firstConfiguredCommand(envNames: string[], fallback: string): string {
  for (const name of envNames) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return fallback;
}

function compactCliLine(value: string): string {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' / ')
    .slice(0, 220);
}

function runCliStatusProbe(
  command: string,
  args: string[],
  timeoutMs = 3500,
): Promise<{ ok: boolean; stdout: string; stderr: string; error: string; code: string | number | null }> {
  return new Promise((resolve) => {
    execFile(command, args, {
      timeout: timeoutMs,
      windowsHide: true,
      env: { ...process.env, NO_COLOR: '1', CI: '1' },
    }, (error, stdout, stderr) => {
      const anyError = error as (NodeJS.ErrnoException & { code?: string | number }) | null;
      resolve({
        ok: !error,
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
        error: error ? String(error.message || error) : '',
        code: anyError?.code ?? null,
      });
    });
  });
}

function cliOutputLooksLoggedOut(value: string): boolean {
  return /(not\s+logged\s+in|not\s+authenticated|unauthenticated|login\s+required|please\s+login|sign\s+in|not\s+signed\s+in|인증|로그인.*필요|로그인.*하세요)/i.test(value);
}

function cliOutputLooksLoggedIn(value: string): boolean {
  if (cliOutputLooksLoggedOut(value)) return false;
  return /(logged\s+in|authenticated|signed\s+in|account|session|ready|ok|success|로그인.*완료|인증.*완료|사용\s*가능)/i.test(value);
}

async function probeAdminAiCliWorker(
  command: string,
  authProbeArgs: string[][],
): Promise<AdminAiWorkerCliProbe> {
  const checkedAt = new Date().toISOString();
  const versionProbe = await runCliStatusProbe(command, ['--version'], 3000);
  const versionText = compactCliLine(versionProbe.stdout || versionProbe.stderr);
  const installError = (versionProbe.error || versionProbe.stderr || '').toLowerCase();
  const installed = versionProbe.ok || !!versionText || !/(enoent|not recognized|not found|no such file)/i.test(installError);
  if (!installed) {
    return {
      installed: false,
      loggedIn: false,
      status: 'not-installed',
      command,
      detail: `${command} CLI를 서버에서 찾지 못했습니다.`,
      checkedAt,
    };
  }

  for (const args of authProbeArgs) {
    const probe = await runCliStatusProbe(command, args, 4000);
    const output = compactCliLine(`${probe.stdout}\n${probe.stderr}\n${probe.error}`);
    if (probe.ok && cliOutputLooksLoggedIn(output)) {
      return {
        installed: true,
        loggedIn: true,
        status: 'ready',
        command,
        version: versionText || undefined,
        detail: output || `${command} 로그인 세션을 확인했습니다.`,
        checkedAt,
      };
    }
    if (cliOutputLooksLoggedOut(output)) {
      return {
        installed: true,
        loggedIn: false,
        status: 'login-required',
        command,
        version: versionText || undefined,
        detail: output || `${command} 로그인 세션이 필요합니다.`,
        checkedAt,
      };
    }
  }

  return {
    installed: true,
    loggedIn: false,
    status: 'unknown',
    command,
    version: versionText || undefined,
    detail: versionText
      ? `${command} CLI 설치는 확인했지만 로그인 상태를 판정하지 못했습니다. 서버 콘솔에서 로그인 상태를 확인하세요.`
      : `${command} CLI 응답을 확인했지만 상태 출력이 비어 있습니다.`,
    checkedAt,
  };
}

function sanitizeAdminAiProvider(value: unknown): AdminAiWorkerProvider {
  if (value === 'claude-code' || value === 'api' || value === 'codex') return value;
  return 'codex';
}

function booleanField(source: unknown, key: string): boolean {
  return !!(source && typeof source === 'object' && (source as Record<string, unknown>)[key] === true);
}

async function buildAdminAiWorkerStatus(body: AdminAiWorkerStatusRequest) {
  const selectedProvider = sanitizeAdminAiProvider(body?.selectedProvider);
  const apiAssistInput = body && typeof body.apiAssist === 'object' ? body.apiAssist : {};
  const apiAssist = {
    anthropic: booleanField(apiAssistInput, 'anthropic') || !!process.env['ANTHROPIC_API_KEY'] || !!process.env['CLAUDE_API_KEY'],
    manus: booleanField(apiAssistInput, 'manus') || !!process.env['MANUS_API_KEY'],
    openai: booleanField(apiAssistInput, 'openai') || !!process.env['OPENAI_API_KEY'],
  };
  const codexCommand = firstConfiguredCommand(['LEWORD_CODEX_CLI', 'CODEX_CLI_PATH'], 'codex');
  const claudeCommand = firstConfiguredCommand(['LEWORD_CLAUDE_CODE_CLI', 'LEWORD_CLAUDE_CLI', 'CLAUDE_CODE_CLI_PATH'], 'claude');
  const [codex, claudeCode] = await Promise.all([
    probeAdminAiCliWorker(codexCommand, [['auth', 'status'], ['login', 'status'], ['status']]),
    probeAdminAiCliWorker(claudeCommand, [['status', '--json'], ['doctor'], ['status']]),
  ]);
  const apiCount = [apiAssist.anthropic, apiAssist.manus, apiAssist.openai].filter(Boolean).length;
  const ready = {
    codex: codex.loggedIn === true,
    claudeCode: claudeCode.loggedIn === true,
    api: apiCount > 0,
  };
  return {
    ok: true,
    selectedProvider,
    checkedAt: new Date().toISOString(),
    workers: { codex, claudeCode },
    apiAssist: { ...apiAssist, count: apiCount },
    ready: {
      ...ready,
      selected: selectedProvider === 'api'
        ? ready.api
        : selectedProvider === 'claude-code'
          ? ready.claudeCode
          : ready.codex,
    },
  };
}

async function handleAdminAiWorkerStatus(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  maxBodyBytes: number,
): Promise<void> {
  try {
    const body = req.method === 'POST'
      ? await parseBody(req, maxBodyBytes) as AdminAiWorkerStatusRequest
      : {};
    json(res, 200, await buildAdminAiWorkerStatus(body), { 'Cache-Control': 'no-store' });
  } catch (err) {
    handleBodyError(res, err, maxBodyBytes);
  }
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

const PUBLIC_SOURCE_SIGNAL_CACHE_TTL_MS = 2 * 60 * 1000;
const PUBLIC_SOURCE_SIGNAL_FIRST_RESPONSE_TIMEOUT_MS = 3500;

let publicSourceSignalCache: {
  limit: number;
  updatedAtMs: number;
  snapshot: MobileSourceSignalSnapshot;
} | null = null;
let publicSourceSignalRefresh: Promise<MobileSourceSignalSnapshot> | null = null;

function normalizePublicSourceSignalLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) return 18;
  return Math.min(100, Math.max(18, Math.floor(limit)));
}

function buildPublicSourceSignalFallbackSnapshot(): MobileSourceSignalSnapshot {
  const updatedAt = new Date().toISOString();
  return {
    updatedAt,
    realtime: [],
    policy: [],
    issues: [],
    fallbackUsed: true,
  };
}

function startPublicSourceSignalRefresh(limit: number): Promise<MobileSourceSignalSnapshot> {
  if (publicSourceSignalRefresh) return publicSourceSignalRefresh;
  const normalizedLimit = normalizePublicSourceSignalLimit(limit);
  const refresh = buildMobileSourceSignalSnapshot({
    limit: normalizedLimit,
    timeoutMs: 12_000,
    useFallback: false,
  })
    .then((snapshot) => {
      publicSourceSignalCache = {
        limit: normalizedLimit,
        updatedAtMs: Date.now(),
        snapshot,
      };
      return snapshot;
    })
    .catch((error) => {
      console.warn('[PUBLIC-SOURCE-SIGNALS] refresh failed', error?.message || error);
      throw error;
    })
    .finally(() => {
      if (publicSourceSignalRefresh === refresh) {
        publicSourceSignalRefresh = null;
      }
    });
  publicSourceSignalRefresh = refresh;
  return refresh;
}

async function getPublicSourceSignalSnapshot(limit: number): Promise<MobileSourceSignalSnapshot> {
  const normalizedLimit = normalizePublicSourceSignalLimit(limit);
  const now = Date.now();
  const cacheFresh = publicSourceSignalCache
    && publicSourceSignalCache.limit >= normalizedLimit
    && now - publicSourceSignalCache.updatedAtMs < PUBLIC_SOURCE_SIGNAL_CACHE_TTL_MS;
  if (cacheFresh) return publicSourceSignalCache.snapshot;

  const refresh = startPublicSourceSignalRefresh(normalizedLimit);
  if (publicSourceSignalCache?.snapshot) {
    return publicSourceSignalCache.snapshot;
  }

  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      refresh,
      new Promise<MobileSourceSignalSnapshot>((resolve) => {
        timer = setTimeout(() => resolve(buildPublicSourceSignalFallbackSnapshot()), PUBLIC_SOURCE_SIGNAL_FIRST_RESPONSE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function buildDashboard(
  req: http.IncomingMessage,
  notificationInbox: MobileNotificationInbox | null,
  prewarmService: MobilePrewarmService | null,
  _liveGoldenRadar: MobileLiveGoldenRadar | null,
  apiBaseUrl = requestApiBaseUrl(req),
): MobileDashboardSnapshot {
  const fallback = fallbackDashboardSignals();
  const notifications = notificationInbox?.snapshot(12) || null;
  const prewarm = prewarmService?.snapshot() || null;
  const liveGolden = null;
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

interface ConfiguredWebLoginAccount {
  userId: string;
  password?: string;
  passwordSha256?: string;
  tier: MobileEntitlementTier;
  adminOnly: boolean;
  apiBaseUrl?: string;
  expiresAt?: string | null;
}

function normalizedSha256(value: unknown): string {
  const hash = String(value || '').trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(hash) ? hash : '';
}

function stringEqualsConstantTime(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function passwordMatchesConfiguredLogin(account: ConfiguredWebLoginAccount, password: string): boolean {
  const configuredHash = normalizedSha256(account.passwordSha256);
  if (configuredHash) {
    const actualHash = crypto.createHash('sha256').update(password, 'utf8').digest('hex');
    return stringEqualsConstantTime(actualHash, configuredHash);
  }
  const configuredPassword = String(account.password || '');
  return !!configuredPassword && stringEqualsConstantTime(password, configuredPassword);
}

function normalizeConfiguredWebLoginAccount(value: unknown, fallbackUserId = '', forcedAdminOnly = false): ConfiguredWebLoginAccount | null {
  const record = typeof value === 'string'
    ? { password: value }
    : (value && typeof value === 'object' ? value as Record<string, unknown> : {});
  const userId = String(record.userId || record.id || record.username || fallbackUserId || '').trim();
  const password = String(record.password || record.userPassword || record.pass || '').trim();
  const passwordSha256 = normalizedSha256(record.passwordSha256 || record.passwordHash || record.sha256);
  if (!userId || (!password && !passwordSha256)) return null;
  const tier = normalizeLoginTier(record.tier || record.plan || record.licenseType || (record.admin ? 'admin' : 'unlimited'));
  const adminOnly = forcedAdminOnly || tier === 'admin' || record.adminOnly === true || record.admin === true;
  const apiBaseUrl = String(record.apiBaseUrl || record.pcApiBaseUrl || '').trim().replace(/\/+$/, '');
  const expiresAt = record.expiresAt === undefined ? null : String(record.expiresAt || '').trim() || null;
  return {
    userId,
    password: password || undefined,
    passwordSha256: passwordSha256 || undefined,
    tier,
    adminOnly,
    apiBaseUrl: apiBaseUrl || undefined,
    expiresAt,
  };
}

function configuredWebLoginAccounts(): ConfiguredWebLoginAccount[] {
  const accounts: ConfiguredWebLoginAccount[] = [];
  const configuredJson = String(process.env['LEWORD_WEB_LOGIN_USERS'] || '').trim();
  if (configuredJson) {
    try {
      const parsed = JSON.parse(configuredJson);
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          const account = normalizeConfiguredWebLoginAccount(entry);
          if (account) accounts.push(account);
        }
      } else if (parsed && typeof parsed === 'object') {
        for (const [userId, entry] of Object.entries(parsed as Record<string, unknown>)) {
          const account = normalizeConfiguredWebLoginAccount(entry, userId);
          if (account) accounts.push(account);
        }
      }
    } catch {
      // Ignore malformed optional JSON and keep single-account env fallbacks active.
    }
  }

  const proAccount = normalizeConfiguredWebLoginAccount({
    userId: process.env['LEWORD_WEB_LOGIN_ID'],
    password: process.env['LEWORD_WEB_LOGIN_PASSWORD'],
    passwordSha256: process.env['LEWORD_WEB_LOGIN_PASSWORD_SHA256'],
    tier: process.env['LEWORD_WEB_LOGIN_TIER'] || 'unlimited',
    apiBaseUrl: process.env['LEWORD_WEB_LOGIN_API_BASE_URL'],
    expiresAt: process.env['LEWORD_WEB_LOGIN_EXPIRES_AT'],
  });
  if (proAccount) accounts.push(proAccount);

  const adminAccount = normalizeConfiguredWebLoginAccount({
    userId: process.env['LEWORD_ADMIN_LOGIN_ID'],
    password: process.env['LEWORD_ADMIN_LOGIN_PASSWORD'],
    passwordSha256: process.env['LEWORD_ADMIN_LOGIN_PASSWORD_SHA256'],
    tier: 'admin',
    apiBaseUrl: process.env['LEWORD_ADMIN_LOGIN_API_BASE_URL'],
    expiresAt: process.env['LEWORD_ADMIN_LOGIN_EXPIRES_AT'],
  }, '', true);
  if (adminAccount) accounts.push(adminAccount);

  return accounts;
}

function verifyConfiguredWebLogin(body: any): {
  ok: boolean;
  account?: ConfiguredWebLoginAccount;
  message?: string;
} {
  const userId = String(body?.userId || '').trim();
  const password = String(body?.password || '').trim();
  const adminRequested = body?.adminLogin === true || String(body?.adminLogin || '').toLowerCase() === 'true';
  const accounts = configuredWebLoginAccounts();
  for (const account of accounts) {
    if (account.adminOnly && !adminRequested) continue;
    if (adminRequested && account.tier !== 'admin') continue;
    if (!stringEqualsConstantTime(userId, account.userId)) continue;
    if (!passwordMatchesConfiguredLogin(account, password)) continue;
    return { ok: true, account };
  }
  return {
    ok: false,
    message: adminRequested
      ? 'configured admin login rejected'
      : 'configured web login rejected',
  };
}

const WEB_SESSION_TOKEN_PREFIX = 'leword-web-v1';

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(`${normalized}${padding}`, 'base64');
}

function normalizeWebSessionSource(value: unknown): MobileEntitlement['source'] {
  const source = String(value || '').trim();
  if (
    source === 'configured-web-login'
    || source === 'license-service'
    || source === 'fixture'
    || source === 'entitlement-file'
    || source === 'env-static-token'
  ) {
    return source;
  }
  return 'configured-web-login';
}

function signWebSessionToken(secret: string, entitlement: MobileEntitlement): string {
  if (!secret) return `web-${crypto.randomUUID()}`;
  const payload = {
    subjectId: entitlement.subjectId,
    tier: entitlement.tier,
    source: entitlement.source,
    expiresAt: entitlement.expiresAt ?? null,
    issuedAt: new Date().toISOString(),
  };
  const payloadPart = base64UrlEncode(JSON.stringify(payload));
  const signaturePart = base64UrlEncode(
    crypto.createHmac('sha256', secret).update(payloadPart).digest(),
  );
  return `${WEB_SESSION_TOKEN_PREFIX}.${payloadPart}.${signaturePart}`;
}

function verifySignedWebSessionToken(token: string, secret: string): MobileEntitlementVerification | null {
  if (!secret || !token.startsWith(`${WEB_SESSION_TOKEN_PREFIX}.`)) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== WEB_SESSION_TOKEN_PREFIX) {
    return { ok: false, reason: 'malformed web session token' };
  }
  const [, payloadPart, signaturePart] = parts;
  const expected = crypto.createHmac('sha256', secret).update(payloadPart).digest();
  const received = base64UrlDecode(signaturePart);
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    return { ok: false, reason: 'invalid web session signature' };
  }
  try {
    const payload = JSON.parse(base64UrlDecode(payloadPart).toString('utf8')) as Record<string, unknown>;
    const subjectId = String(payload.subjectId || '').trim();
    if (!subjectId) return { ok: false, reason: 'web session subject missing' };
    return {
      ok: true,
      entitlement: {
        subjectId,
        tier: normalizeLoginTier(payload.tier),
        expiresAt: payload.expiresAt === undefined ? null : String(payload.expiresAt || '').trim() || null,
        source: normalizeWebSessionSource(payload.source),
      },
    };
  } catch {
    return { ok: false, reason: 'web session payload invalid' };
  }
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
  webSessionSecret: string,
): Promise<void> {
  try {
    const body = await parseBody(req, maxBodyBytes) as any;
    const isWebSession = String(req.url || '').split('?')[0] === '/v1/web/session';
    const userId = String(body?.userId || '').trim();
    const password = String(body?.password || '').trim();
    const candidateToken = String(body?.accessToken || body?.mobileToken || body?.token || password || '').trim();

    if (!userId || !password) {
      json(res, 400, {
        ok: false,
        message: isWebSession ? '아이디와 비밀번호를 입력하세요.' : '아이디와 비밀번호가 필요합니다.',
      } satisfies MobileJobErrorResponse);
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

    const configuredLogin = verifyConfiguredWebLogin(body);
    if (configuredLogin.ok && configuredLogin.account) {
      const account = configuredLogin.account;
      const apiBaseUrl = account.apiBaseUrl || requestApiBaseUrl(req);
      const entitlement: MobileEntitlement = {
        subjectId: account.userId,
        tier: account.tier,
        expiresAt: account.expiresAt ?? null,
        source: 'configured-web-login',
      };
      const token = signWebSessionToken(webSessionSecret, entitlement);
      runtimeEntitlements.set(token, entitlement);
      const session: MobileAuthSession = {
        ok: true,
        accessToken: token,
        userId: account.userId,
        tier: account.tier,
        apiBaseUrl,
        pcLinked: true,
        source: 'configured-web-login',
        linkedAt: new Date().toISOString(),
        expiresAt: account.expiresAt ?? null,
        message: account.tier === 'admin'
          ? '관리자 계정으로 접속했습니다.'
          : '기존 사용자 계정으로 Pro 세션을 발급했습니다.',
        dashboard: buildDashboard(req, notificationInbox, prewarmService, liveGoldenRadar, apiBaseUrl),
      };
      json(res, 200, { ok: true, session });
      return;
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
      const apiBaseUrl = panel.apiBaseUrl || requestApiBaseUrl(req);
      const tier = panel.tier || 'standard';
      const entitlement: MobileEntitlement = {
        subjectId: panel.userId || userId,
        tier,
        expiresAt: panel.expiresAt ?? null,
        source: 'license-service',
      };
      const token = isWebSession
        ? signWebSessionToken(webSessionSecret, entitlement)
        : (panel.accessToken || `panel-${crypto.randomUUID()}`);
      runtimeEntitlements.set(token, entitlement);
      const session: MobileAuthSession = {
        ok: true,
        accessToken: token,
        userId: panel.userId || userId,
        tier,
        apiBaseUrl,
        pcLinked: true,
        source: 'panel-server',
        linkedAt: new Date().toISOString(),
        expiresAt: panel.expiresAt ?? null,
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

    json(res, 401, {
      ok: false,
      message: isWebSession
        ? '아이디 또는 비밀번호가 맞지 않습니다. 자동완성 값이 들어갔다면 지우고 다시 입력하세요.'
        : panel.message || '로그인에 실패했습니다.',
    } satisfies MobileJobErrorResponse);
  } catch (err) {
    handleBodyError(res, err, maxBodyBytes);
  }
}

async function unlockAdminSettings(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  maxBodyBytes: number,
): Promise<void> {
  try {
    const body = await parseBody(req, maxBodyBytes) as any;
    const password = String(body?.password || '').trim();
    if (!password) {
      json(res, 400, { ok: false, message: '관리자 설정 비밀번호를 입력하세요.' } satisfies MobileJobErrorResponse);
      return;
    }
    const result = verifyAdminSettingsPassword(password);
    if (!result.configured) {
      json(res, 503, { ok: false, message: '관리자 설정 비밀번호가 서버에 구성되지 않았습니다.' } satisfies MobileJobErrorResponse);
      return;
    }
    if (!result.ok) {
      json(res, 400, { ok: false, message: '관리자 설정 비밀번호가 맞지 않습니다.' } satisfies MobileJobErrorResponse);
      return;
    }
    json(res, 200, {
      ok: true,
      unlocked: true,
      expiresInSeconds: 60 * 60,
      message: '관리자 설정 잠금이 해제되었습니다.',
    });
  } catch (err) {
    handleBodyError(res, err, maxBodyBytes);
  }
}

function parseBody(req: http.IncomingMessage, maxBodyBytes: number): Promise<unknown> {
  return parseMobileJsonBody(req, maxBodyBytes);
}

function requestClientIp(req: http.IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = String(raw || '').split(',')[0].trim();
  return first || req.socket.remoteAddress || '';
}

function requestReferrer(req: http.IncomingMessage): string {
  const value = req.headers.referer || req.headers.referrer || '';
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function requestUserAgent(req: http.IncomingMessage): string {
  const value = req.headers['user-agent'] || '';
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
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

type UserApiCredentialKey =
  | NaverApiSettingKey
  | 'youtubeApiKey'
  | 'anthropicApiKey'
  | 'manusApiKey'
  | 'openaiApiKey';

const USER_API_CREDENTIAL_KEYS: UserApiCredentialKey[] = [
  ...NAVER_API_SETTING_KEYS,
  'youtubeApiKey',
  'anthropicApiKey',
  'manusApiKey',
  'openaiApiKey',
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

function normalizeBooleanParam(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeTargetCount(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value)
      : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(250, Math.floor(parsed)));
}

function normalizeStringListParam(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const clean = String(item || '').replace(/\s+/g, ' ').trim();
    if (!clean || out.includes(clean)) continue;
    out.push(clean);
    if (out.length >= limit) break;
  }
  return out;
}

function normalizeAgentAssistCacheParam(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (raw.enabled === false) return { enabled: false };
  return {
    enabled: true,
    version: String(raw.version || 'web-agent-assist-v1').replace(/\s+/g, ' ').trim(),
    mode: String(raw.mode || 'server-default-worker').replace(/\s+/g, ' ').trim(),
    featureId: String(raw.featureId || '').replace(/\s+/g, ' ').trim(),
    provider: String(raw.provider || 'server-auto').replace(/\s+/g, ' ').trim(),
    includeAiInference: raw.includeAiInference !== false,
    mindmapAssist: raw.mindmapAssist !== false,
    keywordResearchAssist: raw.keywordResearchAssist !== false,
    tasks: normalizeStringListParam(raw.tasks, 16),
  };
}

function withAgentAssistCacheParams(
  raw: Record<string, unknown>,
  normalized: Record<string, unknown>,
): Record<string, unknown> {
  const agentAssist = normalizeAgentAssistCacheParam(raw.agentAssist);
  if (agentAssist) normalized.agentAssist = agentAssist;
  if ('includeAiInference' in raw) {
    normalized.includeAiInference = normalizeBooleanParam(raw.includeAiInference, true);
  }
  return normalized;
}

function normalizeProTrafficCacheParams(params: unknown): unknown {
  const raw = params && typeof params === 'object' && !Array.isArray(params)
    ? params as Record<string, unknown>
    : {};
  const seedKeyword = typeof raw.seedKeyword === 'string'
    ? raw.seedKeyword.replace(/\s+/g, ' ').trim()
    : '';
  const normalized: Record<string, unknown> = {
    qualityProfile: 'publishable-v2',
    categoryId: typeof raw.categoryId === 'string' && raw.categoryId.trim()
      ? raw.categoryId.trim()
      : 'all',
    targetCount: normalizeTargetCount(raw.targetCount, 60),
    includeSeasonal: normalizeBooleanParam(raw.includeSeasonal, true),
    includeEvergreen: normalizeBooleanParam(raw.includeEvergreen, true),
    includeFreshIssue: normalizeBooleanParam(raw.includeFreshIssue, true),
    autoDiscovery: normalizeBooleanParam(raw.autoDiscovery, true),
    includeAiInference: normalizeBooleanParam(raw.includeAiInference, true),
  };
  if (seedKeyword) {
    normalized.seedKeyword = seedKeyword;
    if (raw.apiCredentials) normalized.apiCredentials = raw.apiCredentials;
  }
  return withAgentAssistCacheParams(raw, normalized);
}

function normalizeMobileJobCacheParams(product: MobileKeywordProduct, params: unknown): unknown {
  if (product === 'pro-traffic-hunter') {
    return normalizeProTrafficCacheParams(params);
  }
  if (
    product === 'naver-mate-hunter'
    || product === 'kin-hidden-honey'
    || product === 'shopping-connect'
    || product === 'youtube-golden'
  ) {
    const raw = params && typeof params === 'object' && !Array.isArray(params)
      ? params as Record<string, unknown>
      : {};
    const { agentAssist: _agentAssist, adminAiWorker: _adminAiWorker, ...rest } = raw;
    return {
      ...withAgentAssistCacheParams(raw, rest),
      qualityProfile: 'intent-separated-v3',
    };
  }
  return params;
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

function compactServerKeyword(value: unknown): string {
  return String(value || '').toLowerCase().replace(/\s+/g, '').trim();
}

function readKeywordAnalysisSeed(params: unknown): string {
  const raw = params && typeof params === 'object' && !Array.isArray(params)
    ? params as Record<string, unknown>
    : {};
  return String(raw.keyword || raw.seedKeyword || '').replace(/\s+/g, ' ').trim();
}

function uniqueEvidence(...groups: Array<unknown>): string[] {
  const out: string[] = [];
  const push = (value: unknown) => {
    const text = String(value || '').trim();
    if (text && !out.includes(text)) out.push(text);
  };
  for (const group of groups) {
    if (Array.isArray(group)) {
      group.forEach(push);
    } else {
      push(group);
    }
  }
  return out.slice(0, 16);
}

function resultSummaryForKeywords(
  result: MobileKeywordResult,
  keywords: MobileKeywordMetric[],
  excludedByAiJudge = 0,
): MobileKeywordResult['summary'] {
  return {
    ...result.summary,
    total: keywords.length,
    sss: keywords.filter((item) => item.grade === 'SSS').length,
    measured: keywords.filter((item) => item.isMeasured).length,
    aiJudged: keywords.filter((item) => item.aiJudge).length,
    excludedByAiJudge,
    publishReady: keywords.filter((item) => item.aiJudge?.verdict === 'publish').length,
  };
}

const SYNTHETIC_RESULT_MARKER_PATTERN = /\b(dummy|mock|fake|sample|demo|placeholder|synthetic|estimated|estimate)\b|추정|더미|샘플|server-intent-template|server-zero-live-fallback|intent-fallback|pc-intent-expansion/i;

function isPositiveFiniteMetric(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isNonNegativeFiniteMetric(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isRequestedKeywordAnalysisMetric(metric: MobileKeywordMetric): boolean {
  return metric.intent === 'requested-keyword' || metric.source === 'pc-keyword-analysis-exact';
}

function hasSearchAdMeasuredSplit(metric: MobileKeywordMetric): boolean {
  const evidenceText = Array.isArray(metric.evidence) ? metric.evidence.join(' ') : '';
  return isNonNegativeFiniteMetric(metric.pcSearchVolume)
    && isNonNegativeFiniteMetric(metric.mobileSearchVolume)
    && (
      metric.searchVolumeSource === 'searchad'
      || /pc-searchad-volume|searchad/i.test(`${metric.source || ''} ${evidenceText}`)
    );
}

function metricRuntimeMarkerText(metric: MobileKeywordMetric): string {
  return [
    metric.source,
    metric.intent,
    metric.category,
    ...(Array.isArray(metric.evidence) ? metric.evidence : []),
  ].join(' ');
}

function isStrictMeasuredKeywordMetric(
  endpoint: MobileApiEndpointSpec,
  metric: MobileKeywordMetric,
): boolean {
  if (!metric || !String(metric.keyword || '').trim()) return false;
  if (endpoint.product === 'mindmap-expansion') return isMindmapServerBoardCandidate(metric);
  if (endpoint.product === 'keyword-analysis' && isRequestedKeywordAnalysisMetric(metric)) {
    if (SYNTHETIC_RESULT_MARKER_PATTERN.test(metricRuntimeMarkerText(metric))) return false;
    return (metric.isMeasured === true
      && isNonNegativeFiniteMetric(metric.pcSearchVolume)
      && isNonNegativeFiniteMetric(metric.mobileSearchVolume))
      || hasSearchAdMeasuredSplit(metric);
  }
  if (metric.isMeasured !== true) return false;
  if (SYNTHETIC_RESULT_MARKER_PATTERN.test(metricRuntimeMarkerText(metric))) return false;
  if (!isPositiveFiniteMetric(metric.totalSearchVolume)) return false;
  if (!isPositiveFiniteMetric(metric.documentCount)) return false;
  if (endpoint.product === 'pro-traffic-hunter' && !isProTrafficMeasuredBoardCandidate(metric)) return false;
  if (endpoint.product === 'shopping-connect' && !isShoppingMeasuredBoardCandidate(metric)) return false;
  if (endpoint.product === 'naver-mate-hunter' && !isNaverMateMeasuredBoardCandidate(metric)) return false;
  if (endpoint.product === 'kin-hidden-honey' && !isKinMeasuredBoardCandidate(metric)) return false;
  if (endpoint.product === 'youtube-golden' && metric.source === 'server-measured-youtube-prewarm' && !isYoutubeMeasuredBoardCandidate(metric)) return false;
  if (endpoint.product === 'keyword-analysis') {
    return isNonNegativeFiniteMetric(metric.pcSearchVolume)
      && isNonNegativeFiniteMetric(metric.mobileSearchVolume);
  }
  return true;
}

function sanitizeMeasuredKeywordResult(
  endpoint: MobileApiEndpointSpec,
  result: MobileKeywordResult,
): MobileKeywordResult {
  if (!result || !Array.isArray(result.keywords)) return result;
  const deduped: MobileKeywordMetric[] = [];
  const seen = new Set<string>();
  let excludedByAiJudge = 0;
  for (const metric of result.keywords) {
    const judged = applyKeywordAiJudge(metric);
    if (!isStrictMeasuredKeywordMetric(endpoint, judged)) {
      if (judged.aiJudge?.verdict === 'exclude'
        && metric.isMeasured === true
        && isPositiveFiniteMetric(metric.totalSearchVolume)
        && isPositiveFiniteMetric(metric.documentCount)
        && !SYNTHETIC_RESULT_MARKER_PATTERN.test(metricRuntimeMarkerText(metric))) {
        excludedByAiJudge += 1;
      }
      continue;
    }
    const key = compactServerKeyword(judged.keyword);
    if (!key || seen.has(key)) continue;
    const isRequestedKeywordAnalysisDisplayMetric = endpoint.product === 'keyword-analysis'
      && isRequestedKeywordAnalysisMetric(judged);
    const isMeasuredMindmapExplorationMetric = endpoint.product === 'mindmap-expansion'
      && judged.intent === 'mindmap-expansion';
    const isMeasuredNaverMateExplorationMetric = endpoint.product === 'naver-mate-hunter'
      && isNaverMateMeasuredBoardCandidate(judged);
    const isMeasuredShoppingConnectMetric = endpoint.product === 'shopping-connect'
      && isShoppingMeasuredBoardCandidate(judged);
    if (judged.aiJudge?.verdict === 'exclude'
      && !isRequestedKeywordAnalysisDisplayMetric
      && !isMeasuredMindmapExplorationMetric
      && !isMeasuredNaverMateExplorationMetric
      && !isMeasuredShoppingConnectMetric) {
      excludedByAiJudge += 1;
      continue;
    }
    seen.add(key);
    deduped.push(judged);
  }
  return {
    ...result,
    keywords: deduped,
    summary: resultSummaryForKeywords(result, deduped, excludedByAiJudge),
  };
}

function metricFromLiveGoldenBoardItem(item: MobileKeywordMetric): MobileKeywordMetric {
  return {
    keyword: item.keyword,
    grade: item.grade,
    score: typeof item.score === 'number' ? item.score : null,
    pcSearchVolume: item.pcSearchVolume,
    mobileSearchVolume: item.mobileSearchVolume,
    totalSearchVolume: item.totalSearchVolume,
    documentCount: item.documentCount,
    goldenRatio: item.goldenRatio,
    cpc: item.cpc,
    category: item.category || 'live-golden',
    source: 'live-golden-board-exact-match',
    intent: item.intent || 'live-golden-board',
    evidence: uniqueEvidence(item.evidence, 'live-golden-board-exact-match'),
    isMeasured: item.isMeasured !== false
      && item.totalSearchVolume !== null
      && item.documentCount !== null,
    searchVolumeSource: item.searchVolumeSource,
    searchVolumeConfidence: item.searchVolumeConfidence,
    isSearchVolumeEstimated: item.isSearchVolumeEstimated,
    documentCountSource: item.documentCountSource,
    documentCountConfidence: item.documentCountConfidence,
    isDocumentCountEstimated: item.isDocumentCountEstimated,
    measurementStatus: item.measurementStatus,
  };
}

function requestedFeatureTargetCount(product: MobileKeywordProduct, params: unknown): number {
  const raw = params && typeof params === 'object' && !Array.isArray(params)
    ? params as Record<string, unknown>
    : {};
  const requested = Number(raw.targetCount ?? raw.maxResults ?? raw.autoDiscoveryLimit);
  const fallbackByProduct: Partial<Record<MobileKeywordProduct, number>> = {
    'pro-traffic-hunter': 60,
    'shopping-connect': 30,
    'kin-hidden-honey': 30,
    'naver-mate-hunter': 50,
    'youtube-golden': 50,
  };
  const fallback = fallbackByProduct[product] || 30;
  if (!Number.isFinite(requested) || requested <= 0) return fallback;
  return Math.max(1, Math.min(120, Math.floor(requested)));
}

function isMeasuredLiveBoardCandidate(item: MobileKeywordMetric): boolean {
  return item.isMeasured !== false
    && isPositiveFiniteMetric(item.totalSearchVolume)
    && isPositiveFiniteMetric(item.documentCount)
    && item.isSearchVolumeEstimated !== true
    && item.isDocumentCountEstimated !== true
    && !SYNTHETIC_RESULT_MARKER_PATTERN.test(metricRuntimeMarkerText(item));
}

const MINDMAP_MEASURED_SOURCE_RE = /(server-measured-mindmap-prewarm|pc-mindmap-exact-measured-seed|pc-mindmap-measured-intent-expansion|pc-mindmap-expansion-quality|pc-mindmap-ranker|pc-keyword-analysis-exact|autocomplete|naver-relkwd|naver-related|web-analysis-context|mindmap-issue-bridge|mindmap-issue-autocomplete|mindmap-issue-naver-relkwd|mindmap-semantic-bridge|mindmap-semantic-autocomplete|mindmap-semantic-naver-relkwd)/i;
const MINDMAP_SOURCE_ONLY_SOURCE_RE = /^(?:pc-mindmap-ranker|pc-mindmap-expansion-quality|pc-keyword-analysis-exact|autocomplete|naver-relkwd|naver-related|web-analysis-context|mindmap-issue-bridge|mindmap-issue-autocomplete|mindmap-issue-naver-relkwd|mindmap-semantic-bridge|mindmap-semantic-autocomplete|mindmap-semantic-naver-relkwd)$/i;

function isMindmapMeasuredBoardCandidate(item: MobileKeywordMetric): boolean {
  if (item.intent !== 'mindmap-expansion') return false;
  const markerText = metricRuntimeMarkerText(item);
  if (item.grade === 'C') return false;
  if (!isPositiveFiniteMetric(item.totalSearchVolume)) return false;
  if (!isPositiveFiniteMetric(item.documentCount)) return false;
  if (item.isSearchVolumeEstimated === true || item.isDocumentCountEstimated === true) return false;
  return MINDMAP_MEASURED_SOURCE_RE.test(markerText);
}

function isMindmapSourceOnlyBoardCandidate(item: MobileKeywordMetric): boolean {
  if (item.intent !== 'mindmap-expansion') return false;
  if (item.isMeasured === true) return false;
  if (!isMindmapExpansionKeywordCandidate(item.keyword)) return false;
  if (item.isSearchVolumeEstimated === true || item.isDocumentCountEstimated === true) return false;
  if (SYNTHETIC_RESULT_MARKER_PATTERN.test(metricRuntimeMarkerText(item))) return false;
  return MINDMAP_SOURCE_ONLY_SOURCE_RE.test(String(item.source || ''));
}

function isMindmapServerBoardCandidate(item: MobileKeywordMetric): boolean {
  return isMindmapMeasuredBoardCandidate(item) || isMindmapSourceOnlyBoardCandidate(item);
}

function productIntentText(item: MobileKeywordMetric): string {
  return [
    item.keyword,
    item.category,
    item.intent,
    item.source,
    ...(Array.isArray(item.evidence) ? item.evidence : []),
  ].join(' ').toLowerCase();
}

const SHOPPING_CONNECT_PRODUCT_CATEGORY_RE = /^(shopping|electronics|home_life|kitchen|fashion|beauty|health|baby|sports|pet|interior|car|gift)$/i;
const SHOPPING_CONNECT_SOURCE_RE = /(shopping-connect|pc-shopping|naver-shopping|shopping-discovery|commerce-entry)/i;
const SHOPPING_CONNECT_PRODUCT_TOPIC_RE = new RegExp([
  '\\uC81C\\uD488',
  '\\uC0C1\\uD488',
  '\\uAC00\\uC804',
  '\\uC5D0\\uC5B4\\uCEE8',
  '\\uCC3D\\uBB38\\uD615',
  '\\uC81C\\uC2B5\\uAE30',
  '\\uB0C9\\uC7A5\\uACE0',
  '\\uC138\\uD0C1\\uAE30',
  '\\uAC74\\uC870\\uAE30',
  '\\uCCAD\\uC18C\\uAE30',
  '\\uC120\\uD48D\\uAE30',
  '\\uC774\\uC5B4\\uD3F0',
  '\\uD5E4\\uB4DC\\uD3F0',
  '\\uB178\\uD2B8\\uBD81',
  '\\uBAA8\\uB2C8\\uD130',
  '\\uD0A4\\uBCF4\\uB4DC',
  '\\uB9C8\\uC6B0\\uC2A4',
  '\\uC815\\uB9AC\\uB300',
  '\\uC815\\uB9AC\\uD568',
  '\\uC218\\uB0A9',
  '\\uC218\\uC800',
  '\\uC811\\uC2DC',
  '\\uB0C4\\uBE44',
  '\\uC2E0\\uBC1C\\uC7A5',
  '\\uD654\\uC7A5\\uD488',
  '\\uC601\\uC591\\uC81C',
  '\\uBE44\\uD0C0\\uBBFC',
  '\\uD504\\uB85C\\uBC14\\uC774\\uC624\\uD2F1\\uC2A4',
  '\\uC624\\uBA54\\uAC003',
  '\\uB8E8\\uD14C\\uC778',
  '\\uCF5C\\uB77C\\uAC90',
  '\\uBC00\\uD06C\\uC528\\uC2AC',
  '\\uBCF4\\uCDA9\\uC81C',
  '\\uC720\\uBAA8\\uCC28',
  '\\uCE74\\uC2DC\\uD2B8',
  '\\uAE30\\uC800\\uADC0',
  '\\uC816\\uBCD1',
  '\\uC774\\uC720\\uC2DD',
  '\\uC7A5\\uB09C\\uAC10',
  '\\uCEE4\\uD53C\\uBA38\\uC2E0',
  '\\uCEE4\\uD53C\\uBA54\\uC774\\uCEE4',
  '\\uC804\\uAE30\\uBC25\\uC1A5',
  '\\uD504\\uB77C\\uC774\\uD32C',
  '\\uD140\\uBE14\\uB7EC',
  '\\uC218\\uAC74',
  '\\uBB3C\\uBCD1',
  '\\uC694\\uAC00\\uB9E4\\uD2B8',
  '\\uC544\\uB839',
  '\\uB7EC\\uB2DD\\uBA38\\uC2E0',
  '\\uAC15\\uC544\\uC9C0\\uC0AC\\uB8CC',
  '\\uACE0\\uC591\\uC774\\uBAA8\\uB798',
  '\\uAE09\\uC2DD\\uAE30',
  '\\uC774\\uBD88',
  '\\uBCA0\\uAC1C',
  '\\uB9E4\\uD2B8\\uB9AC\\uC2A4',
  '\\uCEE4\\uD2BC',
  '\\uC2A4\\uD0E0\\uB4DC',
  '\\uB7EC\\uB2DD\\uD654',
  '\\uAC00\\uBC29',
  '\\uC9C0\\uAC11',
  '\\uB808\\uC778\\uBD80\\uCE20',
  '\\uC0CC\\uB4E4',
  '\\uBE14\\uB799\\uBC15\\uC2A4',
  '\\uD558\\uC774\\uD328\\uC2A4',
  '\\uC5D4\\uC9C4\\uC624\\uC77C',
  '\\uBB34\\uC120\\uCDA9\\uC804\\uAE30',
].join('|'), 'iu');
const SHOPPING_CONNECT_BUY_INTENT_RE = new RegExp([
  '\\uAD6C\\uB9E4',
  '\\uCD94\\uCC9C',
  '\\uAC00\\uACA9',
  '\\uBE44\\uAD50',
  '\\uC21C\\uC704',
  '\\uAC00\\uC131\\uBE44',
  '\\uAD6C\\uB9E4\\uCC98',
  '\\uCD5C\\uC800\\uAC00',
  '\\uD560\\uC778',
  '\\uD2B9\\uAC00',
  '\\uBC30\\uC1A1',
  '\\uCFE0\\uD3F0',
  '\\uD6C4\\uAE30',
  '\\uB9AC\\uBDF0',
  '\\uB80C\\uD0C8',
  '\\uC124\\uCE58',
  '\\uC0AC\\uC6A9\\uBC95',
  '\\uC5B8\\uBC15\\uC2F1',
].join('|'), 'iu');
const SHOPPING_CONNECT_NON_PRODUCT_RE = new RegExp([
  '\\uBC14\\uC6B0\\uCC98',
  '\\uC9C0\\uC6D0\\uAE08',
  '\\uC0AC\\uC6A9\\uCC98',
  '\\uBB38\\uD654\\uB204\\uB9AC',
  '\\uD3C9\\uC0DD\\uAD50\\uC721',
  '\\uC815\\uCC45',
  '\\uC219\\uC18C',
  '\\uD39C\\uC158',
  '\\uB9AC\\uC870\\uD2B8',
  '\\uD638\\uD154',
  '\\uCEA0\\uD551\\uC7A5',
  '\\uACC4\\uACE1',
  '\\uB80C\\uD130\\uCE74',
  '\\uB80C\\uD2B8\\uCE74',
  '\\uC608\\uB9E4',
  '\\uC608\\uC57D',
  '\\uCD95\\uC81C',
].join('|'), 'iu');

function isStrictShoppingConnectProductCandidate(keyword: string, category: string, text: string): boolean {
  if (!keyword || keyword.length > 42) return false;
  if (SHOPPING_CONNECT_NON_PRODUCT_RE.test(keyword) || SHOPPING_CONNECT_NON_PRODUCT_RE.test(category)) return false;
  const hasProductCategory = SHOPPING_CONNECT_PRODUCT_CATEGORY_RE.test(category);
  const hasShoppingSource = SHOPPING_CONNECT_SOURCE_RE.test(text);
  const hasProductTopic = SHOPPING_CONNECT_PRODUCT_TOPIC_RE.test(keyword);
  const hasBuyIntent = SHOPPING_CONNECT_BUY_INTENT_RE.test(keyword);
  return (hasProductCategory || hasShoppingSource) && (hasProductTopic || hasBuyIntent);
}

function isShoppingConnectMeasuredQualityCandidate(item: MobileKeywordMetric): boolean {
  const keyword = String(item.keyword || '').toLowerCase();
  const total = typeof item.totalSearchVolume === 'number' ? item.totalSearchVolume : 0;
  const docs = typeof item.documentCount === 'number' ? item.documentCount : Number.POSITIVE_INFINITY;
  const ratio = typeof item.goldenRatio === 'number' && item.goldenRatio > 0
    ? item.goldenRatio
    : (docs > 0 ? total / docs : 0);
  const hasBuyIntent = SHOPPING_CONNECT_BUY_INTENT_RE.test(keyword);
  const hasProductPick = !!item.shoppingProductPick;
  if (total < 10 || !Number.isFinite(docs) || docs <= 0) return false;
  if (hasProductPick && total >= 10 && docs <= 150000 && ratio >= 0.0001) return true;
  if (hasBuyIntent && total >= 10 && docs <= 150000 && ratio >= 0.0001) return true;
  if (ratio >= 0.5 && docs <= 30000) return true;
  if (ratio >= 0.2 && total >= 2500 && docs <= 15000) return true;
  if (hasBuyIntent && ratio >= 0.1 && docs <= 50000) return true;
  return false;
}

function isShoppingMeasuredBoardCandidate(item: MobileKeywordMetric): boolean {
  const keyword = String(item.keyword || '').toLowerCase();
  const category = String(item.category || '').toLowerCase();
  const text = productIntentText(item);
  const hasProductPick = !!item.shoppingProductPick && SHOPPING_CONNECT_SOURCE_RE.test(text);
  return (hasProductPick || isStrictShoppingConnectProductCandidate(keyword, category, text))
    && isShoppingConnectMeasuredQualityCandidate(item);
}

function serverShoppingText(value: unknown): string {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueServerShoppingNotes(values: unknown[], limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = serverShoppingText(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

function numberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function waitForShoppingRetry(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function searchNaverShoppingForProductPick(keyword: string) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await searchNaverShopping(keyword, { display: 10, sort: 'sim' });
    } catch (err) {
      lastError = err;
      await waitForShoppingRetry(350 * (attempt + 1));
    }
  }
  throw lastError;
}

function buildServerShoppingProductPick(keyword: string, item: any): MobileShoppingProductPick | null {
  const productName = serverShoppingText(item?.cleanTitle || item?.title || keyword);
  if (!productName) return null;
  const category = uniqueServerShoppingNotes([
    item?.category1,
    item?.category2,
    item?.category3,
    item?.category4,
  ], 4).join(' > ');
  const price = numberOrNull(item?.lprice);
  const conversionScore = numberOrNull(item?.conversionScore ?? item?.opportunityScore);
  const hotSignalScore = numberOrNull(item?.shoppingProductQuality?.hotSignalScore);
  const mallName = serverShoppingText(item?.mallName);
  const brand = serverShoppingText(item?.brand || item?.maker);
  const reason = serverShoppingText(item?.writeRecommendation)
    || uniqueServerShoppingNotes(item?.opportunityReasons || [], 1)[0]
    || `${keyword} 검색 의도에서 실제 구매 가능한 상품 후보`;
  const buyingTriggers = uniqueServerShoppingNotes([
    price !== null ? `가격대 ${price.toLocaleString('ko-KR')}원 비교` : '',
    mallName ? `${mallName} 판매 정보 확인` : '',
    hotSignalScore !== null && hotSignalScore > 0 ? '쇼핑 수요 신호가 있는 제품군' : '',
    ...(Array.isArray(item?.shoppingProductQuality?.reasons) ? item.shoppingProductQuality.reasons : []),
    '후기/가격/대체품 비교로 구매 결정 보조',
  ], 4);
  const titleDrafts = uniqueServerShoppingNotes([
    `${keyword} 구매 전 ${productName} 선택 기준`,
    `${productName} 후기·가격 비교, 지금 살 만한 이유`,
    `${keyword} 찾는 사람이 ${productName}에서 확인할 포인트`,
  ], 3);
  return {
    productName,
    productTitle: serverShoppingText(item?.title) || productName,
    mallName: mallName || undefined,
    brand: brand || undefined,
    category: category || undefined,
    imageUrl: serverShoppingText(item?.image) || undefined,
    productUrl: serverShoppingText(item?.link || item?.productUrl) || undefined,
    price,
    conversionScore,
    qualityScore: numberOrNull(item?.shoppingProductQuality?.score),
    hotSignalScore,
    sellableReason: reason,
    writeRecommendation: serverShoppingText(item?.writeRecommendation) || undefined,
    recommendedAngle: hotSignalScore !== null && hotSignalScore >= 5 ? '지금 수요 상승형' : '가격/후기 비교형',
    titleDrafts,
    buyingTriggers,
    caution: item?.opportunityGrade === 'WATCH' ? '단독 추천보다 가격/후기 비교형으로 접근' : undefined,
  };
}

async function runLimitedShoppingPickEnrichment<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<T>,
): Promise<T[]> {
  const out = items.slice();
  let index = 0;
  const workerCount = Math.min(1, Math.max(1, out.length));
  async function runWorker(): Promise<void> {
    while (index < out.length) {
      const currentIndex = index;
      index += 1;
      if (currentIndex >= limit) return;
      out[currentIndex] = await worker(out[currentIndex]);
    }
  }
  await Promise.all(Array.from({ length: workerCount }, runWorker));
  return out;
}

async function enrichShoppingProductPicksForResult(
  endpoint: MobileApiEndpointSpec,
  params: unknown,
  result: MobileKeywordResult,
): Promise<MobileKeywordResult> {
  if (endpoint.product !== 'shopping-connect' || !result || !Array.isArray(result.keywords)) return result;
  const targetCount = requestedFeatureTargetCount(endpoint.product, params);
  const enrichLimit = Math.min(targetCount, result.keywords.length, 30);
  const keywords = await runLimitedShoppingPickEnrichment(result.keywords, enrichLimit, async (metric) => {
    if (metric.shoppingProductPick || !metric.keyword) return metric;
    try {
      const search = await searchNaverShoppingForProductPick(metric.keyword);
      const items = Array.isArray(search.items) ? search.items : [];
      const scored = items.map((item) => ({
        ...item,
        discoveryQuery: metric.keyword,
        conversionScore: computeConversionScore(item),
      }));
      const ranked = rankShoppingOpportunities(scored, {
        keyword: metric.keyword,
        intentPrimary: 'buy',
        totalHits: search.total || items.length,
        relatedKeywords: [],
        crossSourceSeeds: [],
      }, 1, { balanceDiscovery: false });
      const directProductFallback = scored.find((item) => Number(item?.productType) === 1 && Number(item?.lprice) > 0)
        || scored.find((item) => Number(item?.lprice) > 0)
        || scored[0];
      const pick = buildServerShoppingProductPick(metric.keyword, ranked[0] || directProductFallback);
      if (!pick) return metric;
      return {
        ...metric,
        shoppingProductPick: pick,
        evidence: uniqueEvidence(metric.evidence, 'server-shopping-product-pick'),
      };
    } catch (err) {
      console.warn('[SHOPPING-PICK] enrichment skipped', {
        keyword: metric.keyword,
        reason: err instanceof Error ? err.message : String(err || 'unknown'),
      });
      return metric;
    }
  });
  return {
    ...result,
    keywords,
    summary: resultSummaryForKeywords(result, keywords),
  };
}

function isKinMeasuredBoardCandidateLegacy(item: MobileKeywordMetric): boolean {
  const text = productIntentText(item);
  const sourceMatches = /(kin|지식인|question|qna|qa)/i.test(text);
  const keyword = String(item.keyword || '');
  const answerIntentMatches = /(방법|가능|되나요|인가요|어떻게|왜|무엇|차이|조건|자격|대상|신청|조회|지급일|원인|증상|해결|비용|가격|후기|주의사항|정리|궁금|질문)/i.test(keyword);
  return sourceMatches || answerIntentMatches;
}

const KIN_ANSWER_INTENT_RE = new RegExp([
  '\uBC29\uBC95',
  '\uAC00\uB2A5',
  '\uB418\uB098\uC694',
  '\uC778\uAC00\uC694',
  '\uC5B4\uB5BB\uAC8C',
  '\uC65C',
  '\uBB34\uC5C7',
  '\uCC28\uC774',
  '\uC870\uAC74',
  '\uC790\uACA9',
  '\uB300\uC0C1',
  '\uC2E0\uCCAD',
  '\uC870\uD68C',
  '\uC9C0\uAE09\uC77C',
  '\uC6D0\uC778',
  '\uC99D\uC0C1',
  '\uD574\uACB0',
  '\uBE44\uC6A9',
  '\uAC00\uACA9',
  '\uD6C4\uAE30',
  '\uC8FC\uC758\uC0AC\uD56D',
  '\uC815\uB9AC',
  '\uAD81\uAE08',
  '\uC9C8\uBB38',
  '\uC0AC\uC6A9\uCC98',
  '\uC804\uD654\uBC88\uD638',
  '\uC9C0\uC6D0',
  '\uC9C0\uC6D0\uAE08',
  '\uBC14\uC6B0\uCC98',
  '\uAE09\uC5EC',
  '\uC774\uC6A9\uAD8C',
  '\uC7A5\uB824\uAE08',
  '\uC801\uAE08',
  '\uC6D4\uC138',
  '\uD658\uAE09',
  '\uD658\uAE09\uC77C',
  '\uC11C\uB958',
  '\uB9C8\uAC10',
  '\uAE30\uAC04',
  '\uB300\uC0C1\uC790',
  '\uD61C\uD0DD',
].join('|'), 'iu');

const KIN_LOW_VALUE_LOOKUP_RE = new RegExp([
  '\uD504\uB85C\uD544',
  '\uC544\uB098\uC6B4\uC11C',
  '\uBC30\uC6B0',
  '\uAC00\uC218',
  '\uB098\uC774',
  '\uD559\uB825',
  '\uACE0\uD5A5',
  '\uCD9C\uC5F0\uC9C4',
  '\uB2E4\uC2DC\uBCF4\uAE30',
  '\uB85C\uB610',
  '\uB2F9\uCCA8\uBC88\uD638',
  '\uB17C\uB780',
  '\uD574\uBA85',
].join('|'), 'iu');

function isKinMeasuredBoardCandidate(item: MobileKeywordMetric): boolean {
  const keyword = String(item.keyword || '');
  return !KIN_LOW_VALUE_LOOKUP_RE.test(keyword) && KIN_ANSWER_INTENT_RE.test(keyword);
}

function isActionableSearchMeasuredBoardCandidate(item: MobileKeywordMetric): boolean {
  const keyword = String(item.keyword || '');
  const text = productIntentText(item);
  if (!keyword || keyword.length > 42) return false;
  if (/(프로필|인스타|나이|학력|고향|몇부작|출연진|다시보기|공식영상|하이라이트|당첨번호|로또|논란|해명|구속|체포|수사|사망|별세|개인정보유출|해킹|도박|마약)/i.test(keyword)) return false;
  const hasNeed = /(신청|대상|자격|조건|방법|조회|일정|마감|서류|예매|예약|가격|비교|추천|후기|할인|쿠폰|구매처|사용법|설정|해결|발급|지급일|지원금|환급|청약|라인업|중계|주차|입장료|위치|비용|계산기|정리|순위|결과)/i.test(keyword);
  const sourceHasMeasuredNeed = /(traffic-explosion-measured-need|live-golden|measured-need|server-measured)/i.test(text);
  return hasNeed && sourceHasMeasuredNeed;
}

const YOUTUBE_VIDEO_BRIDGE_NEED_RE = new RegExp([
  '\uC21C\uC704',
  '\uCD94\uCC9C',
  '\uD6C4\uAE30',
  '\uB9AC\uBDF0',
  '\uBE44\uAD50',
  '\uAC00\uACA9',
  '\uCD5C\uC800\uAC00',
  '\uAD6C\uB9E4\uCC98',
  '\uC0AC\uC6A9\uBC95',
  '\uC124\uCE58',
  '\uC815\uB9AC',
  '\uC815\uB9AC\uB300',
  '\uC815\uB9AC\uD568',
  '\uC218\uB0A9',
  '\uCCAD\uC18C',
  '\uAD00\uB9AC',
  '\uC608\uC57D',
  '\uC608\uB9E4',
  '\uC5B8\uBC15\uC2F1',
  '\uD558\uC6B8',
  '\uCF54\uC2A4',
].join('|'), 'iu');

const YOUTUBE_VIDEO_BRIDGE_TOPIC_RE = new RegExp([
  '\uC81C\uC2B5\uAE30',
  '\uC5D0\uC5B4\uCEE8',
  '\uCCAD\uC18C\uAE30',
  '\uC120\uD48D\uAE30',
  '\uB0C9\uC7A5\uACE0',
  '\uC138\uD0C1\uAE30',
  '\uAC74\uC870\uAE30',
  '\uB85C\uBD07\uCCAD\uC18C\uAE30',
  '\uC815\uB9AC\uB300',
  '\uC815\uB9AC\uD568',
  '\uC218\uB0A9',
  '\uB0C4\uBE44',
  '\uC811\uC2DC',
  '\uC218\uC800',
  '\uC2E0\uBC1C\uC7A5',
  '\uB9AC\uC870\uD2B8',
  '\uD39C\uC158',
  '\uCEA0\uD551\uC7A5',
  '\uACC4\uACE1',
  '\uC219\uC18C',
  '\uD638\uD154',
  '\uC6CC\uD130\uD30C\uD06C',
  '\uCD95\uC81C',
  '\uB9DB\uC9D1',
  '\uCE74\uD398',
  '\uC5EC\uD589',
].join('|'), 'iu');

const YOUTUBE_LOW_VALUE_LOOKUP_RE = new RegExp([
  '\uD504\uB85C\uD544',
  '\uB098\uC774',
  '\uD559\uB825',
  '\uACE0\uD5A5',
  '\uCD9C\uC5F0\uC9C4',
  '\uB2E4\uC2DC\uBCF4\uAE30',
  '\uACF5\uC2DD\uC601\uC0C1',
  '\uD558\uC774\uB77C\uC774\uD2B8',
  '\uB85C\uB610',
  '\uB2F9\uCCA8\uBC88\uD638',
  '\uB4F1\uAE09\uCEF7',
  '\uD574\uBA85',
  '\uB17C\uB780',
  '\uAD6C\uC18D',
  '\uCCB4\uD3EC',
  '\uC0AC\uB9DD',
  '\uBCC4\uC138',
].join('|'), 'iu');

function isYoutubeVideoBridgeMeasuredBoardCandidate(item: MobileKeywordMetric): boolean {
  const keyword = String(item.keyword || '');
  if (!keyword || keyword.length > 42) return false;
  if (YOUTUBE_LOW_VALUE_LOOKUP_RE.test(keyword)) return false;
  const text = productIntentText(item);
  const hasBridgeNeed = YOUTUBE_VIDEO_BRIDGE_NEED_RE.test(keyword);
  const hasBridgeTopic = YOUTUBE_VIDEO_BRIDGE_TOPIC_RE.test(keyword);
  const supportedContext = /(youtube|shorts|video|shopping|commerce|electronics|home_life|kitchen|travel|food|living|life|server-measured|pc-shopping|pc-youtube|pro-traffic)/i.test(text);
  return supportedContext && (hasBridgeNeed || hasBridgeTopic);
}

const NAVER_MATE_SOURCE_RE = /(server-measured-naver-mate-prewarm|naver-expansion-measured-need|pc-naver|naver-autocomplete|autocomplete|auto-complete|related-keyword|relkwd|related-keywords|second-hop)/i;
const NAVER_MATE_LOW_VALUE_COMPACT_RE = /(?:\uD504\uB85C\uD544|\uB098\uC774|\uC778\uC2A4\uD0C0|\uD559\uB825|\uACE0\uD5A5|\uD0A4|\uD608\uC561\uD615|\uBA87\uBD80\uC791|\uCD9C\uC5F0\uC9C4|\uC7AC\uBC29\uC1A1|\uB2E4\uC2DC\uBCF4\uAE30|\uBC29\uC1A1\uC2DC\uAC04|\uACF5\uC2DD\uC601\uC0C1|\uD558\uC774\uB77C\uC774\uD2B8|\uC608\uACE0\uD3B8)$/u;

function serverMetricGradeRank(grade: unknown): number {
  const normalized = String(grade || '').toUpperCase();
  if (normalized === 'SSS') return 5;
  if (normalized === 'SS') return 4;
  if (normalized === 'S') return 3;
  if (normalized === 'A') return 2;
  if (normalized === 'B') return 1;
  return 0;
}

function isNaverMateDisplayQualityCandidate(item: MobileKeywordMetric): boolean {
  const key = compactServerKeyword(item.keyword);
  if (!key) return false;
  if (NAVER_MATE_LOW_VALUE_COMPACT_RE.test(key)) return false;
  return serverMetricGradeRank(item.grade) > 0;
}

function isNaverMateMeasuredBoardCandidate(item: MobileKeywordMetric): boolean {
  if (!isNaverMateDisplayQualityCandidate(item)) return false;
  if (item.grade !== 'SSS') return false;
  if (!isNonNegativeFiniteMetric(item.pcSearchVolume) || !isNonNegativeFiniteMetric(item.mobileSearchVolume)) return false;
  if ((item.pcSearchVolume + item.mobileSearchVolume) <= 0) return false;
  if (!isPositiveFiniteMetric(item.totalSearchVolume) || item.totalSearchVolume < 50) return false;
  if (!isPositiveFiniteMetric(item.documentCount) || item.documentCount > 8000) return false;
  const ratio = typeof item.goldenRatio === 'number' && Number.isFinite(item.goldenRatio)
    ? item.goldenRatio
    : item.totalSearchVolume / item.documentCount;
  if (ratio < 3) return false;
  if (item.totalSearchVolume >= 50000 && ratio < 5) return false;
  const source = String(item.source || '');
  if (/server-measured-naver-mate-prewarm/i.test(source)) {
    const evidenceText = [
      ...(Array.isArray(item.evidence) ? item.evidence : []),
    ].join(' ');
    return /(origin:(?:pc-naver|naver-autocomplete|autocomplete|auto-complete|related-keyword|relkwd|related-keywords|second-hop)|pc-naver|naver-autocomplete|autocomplete|auto-complete|related-keyword|relkwd|related-keywords|second-hop)/i.test(evidenceText);
  }
  const text = productIntentText(item);
  return NAVER_MATE_SOURCE_RE.test(text);
}

function isProTrafficMeasuredBoardCandidate(item: MobileKeywordMetric): boolean {
  if (!isMeasuredLiveBoardCandidate(item)) return false;
  if (item.grade !== 'SSS') return false;
  if (!isNonNegativeFiniteMetric(item.pcSearchVolume) || !isNonNegativeFiniteMetric(item.mobileSearchVolume)) return false;
  if ((item.pcSearchVolume + item.mobileSearchVolume) <= 0) return false;
  if (!isPositiveFiniteMetric(item.totalSearchVolume) || item.totalSearchVolume < 300) return false;
  if (!isPositiveFiniteMetric(item.documentCount) || item.documentCount > 8000) return false;
  const ratio = typeof item.goldenRatio === 'number' && Number.isFinite(item.goldenRatio)
    ? item.goldenRatio
    : item.totalSearchVolume / item.documentCount;
  return ratio >= 5;
}

function isYoutubeMeasuredBoardCandidate(item: MobileKeywordMetric): boolean {
  const keyword = String(item.keyword || '').toLowerCase();
  const category = String(item.category || '').toLowerCase();
  const source = String(item.source || '');
  const text = productIntentText(item);
  const categoryMatches = source !== 'server-measured-youtube-prewarm'
    && /(youtube|shorts|video|pc-youtube)/i.test(text)
    && /(entertainment|sports|issue|realtime|youtube)/i.test(category);
  return categoryMatches
    || isYoutubeVideoBridgeMeasuredBoardCandidate(item)
    || /(방송|영상|드라마|예능|스포츠|월드컵|kbo|콘서트|가수|배우|아이돌|쇼츠|유튜브|공식영상|하이라이트|뮤직비디오|팬미팅|컴백|출연진|중계|라인업|순위|결과|예매|일정|반응)/i.test(keyword)
    || (isActionableSearchMeasuredBoardCandidate(item) && /(중계|라인업|순위|결과|예매|일정|반응|후기|정리)/i.test(keyword));
}

function measuredPrewarmProductMetric(
  item: MobileKeywordMetric,
  product: MobileKeywordProduct,
): MobileKeywordMetric {
  const base = metricFromLiveGoldenBoardItem(item);
  const productMeta: Partial<Record<MobileKeywordProduct, { source: string; intent: string; category?: string }>> = {
    'pro-traffic-hunter': {
      source: 'server-measured-pro-traffic-prewarm',
      intent: 'traffic-explosion-measured-need',
    },
    'naver-mate-hunter': {
      source: 'server-measured-naver-mate-prewarm',
      intent: 'naver-expansion-measured-need',
    },
    'shopping-connect': {
      source: 'server-measured-shopping-connect-prewarm',
      intent: 'commerce-entry-measured-need',
    },
    'kin-hidden-honey': {
      source: 'server-measured-kin-prewarm',
      intent: 'kin-information-measured-need',
    },
    'youtube-golden': {
      source: 'server-measured-youtube-prewarm',
      intent: 'youtube-shorts-cross-measured-need',
    },
    'mindmap-expansion': {
      source: 'server-measured-mindmap-prewarm',
      intent: 'mindmap-expansion',
    },
  };
  const meta = productMeta[product] || {
    source: 'server-measured-feature-prewarm',
    intent: base.intent || 'measured-need',
  };
  return {
    ...base,
    source: meta.source,
    intent: meta.intent,
    category: meta.category || base.category,
    evidence: uniqueEvidence(
      base.evidence,
      meta.source,
      'server-24h-measured-prewarm',
      `origin:${base.source}`,
      `origin-intent:${base.intent}`,
    ),
  };
}

function featureBoardPriority(product: MobileKeywordProduct, item: MobileKeywordMetric): number {
  const ratio = typeof item.goldenRatio === 'number' ? item.goldenRatio : 0;
  const total = typeof item.totalSearchVolume === 'number' ? item.totalSearchVolume : 0;
  const docs = typeof item.documentCount === 'number' ? item.documentCount : Number.POSITIVE_INFINITY;
  const gradeBonus = item.grade === 'SSS' ? 5000 : item.grade === 'SS' ? 3500 : item.grade === 'S' ? 2200 : item.grade === 'A' ? 1000 : 0;
  const proTrafficBonus = product === 'pro-traffic-hunter'
    ? (item.grade === 'SSS' ? 4200 : item.grade === 'SS' ? 2600 : item.grade === 'S' ? 1200 : -900)
      + (ratio >= 8 ? 1800 : ratio >= 5 ? 1200 : ratio >= 2 ? 400 : -800)
      + (total >= 1000 ? 900 : total >= 300 ? 350 : -500)
      + (docs <= 1000 ? 900 : docs <= 5000 ? 500 : docs > 30000 ? -1200 : 0)
    : 0;
  const productBonus =
    proTrafficBonus
    || (product === 'shopping-connect' && isShoppingMeasuredBoardCandidate(item) ? 3000
      : product === 'kin-hidden-honey' && isKinMeasuredBoardCandidate(item) ? 3000
        : product === 'naver-mate-hunter' && isNaverMateMeasuredBoardCandidate(item) ? 3000
          : product === 'youtube-golden' && isYoutubeMeasuredBoardCandidate(item) ? 3000
            : 0);
  return productBonus
    + gradeBonus
    + Math.min(250, ratio) * 20
    + Math.min(200000, total) / 60
    - Math.min(50000, docs) / 25;
}

function measuredBoardCandidatesForFeature(
  product: MobileKeywordProduct,
  liveGoldenRadar: MobileLiveGoldenRadar | null,
  limit: number,
): MobileKeywordMetric[] {
  if (product === 'mindmap-expansion') return [];
  if (!liveGoldenRadar || limit <= 0) return [];
  const board = liveGoldenRadar.snapshot().board || [];
  const measured = board.filter(isMeasuredLiveBoardCandidate);
  const primary = measured.filter((item) => {
    if (product === 'pro-traffic-hunter') return isProTrafficMeasuredBoardCandidate(item);
    if (product === 'shopping-connect') return isShoppingMeasuredBoardCandidate(item);
    if (product === 'kin-hidden-honey') return isKinMeasuredBoardCandidate(item);
    if (product === 'naver-mate-hunter') return isNaverMateMeasuredBoardCandidate(item);
    if (product === 'youtube-golden') return isYoutubeMeasuredBoardCandidate(item);
    return true;
  });
  const pool = primary;
  const seen = new Set<string>();
  return pool
    .sort((a, b) => featureBoardPriority(product, b) - featureBoardPriority(product, a))
    .map((item) => measuredPrewarmProductMetric(item, product))
    .filter((item) => {
      const key = compactServerKeyword(item.keyword);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function measuredCacheCandidatesForFeature(
  product: MobileKeywordProduct,
  resultCache: InMemoryMobileResultCache | null,
  limit: number,
): MobileKeywordMetric[] {
  if (product === 'mindmap-expansion') return [];
  if (!resultCache || limit <= 0) return [];
  const sourceProducts: MobileKeywordProduct[] = product === 'shopping-connect'
    ? ['shopping-connect']
    : product === 'kin-hidden-honey'
      ? ['kin-hidden-honey', 'pro-traffic-hunter', 'shopping-connect', 'golden-discovery', 'naver-mate-hunter', 'home-board-hunter']
      : product === 'youtube-golden'
        ? ['youtube-golden', 'pro-traffic-hunter', 'shopping-connect', 'golden-discovery']
        : product === 'naver-mate-hunter'
          ? ['naver-mate-hunter']
          : ['pro-traffic-hunter', 'golden-discovery'];
  const seen = new Set<string>();
  const out: MobileKeywordMetric[] = [];
  for (const sourceProduct of sourceProducts) {
    for (const result of resultCache.recent(sourceProduct, 5)) {
      for (const item of result.keywords || []) {
        if (!isMeasuredLiveBoardCandidate(item)) continue;
        if (product === 'pro-traffic-hunter' && !isProTrafficMeasuredBoardCandidate(item)) continue;
        if (product === 'shopping-connect' && !isShoppingMeasuredBoardCandidate(item)) continue;
        if (product === 'kin-hidden-honey' && !isKinMeasuredBoardCandidate(item)) continue;
        if (product === 'naver-mate-hunter' && !isNaverMateMeasuredBoardCandidate(item)) continue;
        if (product === 'youtube-golden' && !isYoutubeMeasuredBoardCandidate(item)) continue;
        const key = compactServerKeyword(item.keyword);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(measuredPrewarmProductMetric(item, product));
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

function mindmapSeedCacheKeys(params: unknown): Set<string> {
  const raw = params && typeof params === 'object' && !Array.isArray(params)
    ? params as Record<string, unknown>
    : {};
  const seed = String(raw.seedKeyword || raw.keyword || '').trim();
  const keys = new Set<string>();
  const add = (value: string) => {
    const key = compactServerKeyword(value);
    if (key) keys.add(key);
  };
  add(seed);
  const compactedSeed = compactServerKeyword(seed);
  if (/^사대/.test(seed)) add(seed.replace(/^사대/, '4대'));
  if (/^4대/.test(seed)) add(seed.replace(/^4대/, '사대'));
  if (compactedSeed.includes('사대')) add(seed.replace(/사대/g, '4대'));
  return keys;
}

function measuredMindmapCacheCandidates(
  params: unknown,
  resultCache: InMemoryMobileResultCache | null,
  limit: number,
): MobileKeywordMetric[] {
  if (!resultCache || limit <= 0) return [];
  const seedKeys = mindmapSeedCacheKeys(params);
  if (!seedKeys.size) return [];
  const sourceProducts: MobileKeywordProduct[] = ['mindmap-expansion', 'keyword-analysis', 'naver-mate-hunter'];
  const seen = new Set<string>();
  const out: MobileKeywordMetric[] = [];
  for (const sourceProduct of sourceProducts) {
    for (const result of resultCache.recent(sourceProduct, 8)) {
      for (const item of result.keywords || []) {
        const key = compactServerKeyword(item.keyword);
        if (!key || !seedKeys.has(key) || seen.has(key)) continue;
        if (!isMeasuredLiveBoardCandidate(item) && !isMindmapMeasuredBoardCandidate(item)) continue;
        seen.add(key);
        out.push(measuredPrewarmProductMetric(item, 'mindmap-expansion'));
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

function supportsMeasuredPrewarmSupplement(product: MobileKeywordProduct): boolean {
  return product === 'pro-traffic-hunter'
    || product === 'mindmap-expansion'
    || product === 'shopping-connect'
    || product === 'kin-hidden-honey'
    || product === 'naver-mate-hunter'
    || product === 'youtube-golden';
}

function minimumUsableFeatureKeywordCount(product: MobileKeywordProduct, params: unknown): number {
  if (!supportsMeasuredPrewarmSupplement(product)) return 1;
  const targetCount = requestedFeatureTargetCount(product, params);
  if (product === 'pro-traffic-hunter') return Math.min(targetCount, 1);
  if (product === 'mindmap-expansion') return Math.min(targetCount, 10);
  if (product === 'youtube-golden') return Math.min(targetCount, 10);
  return Math.min(targetCount, 30);
}

function supplementMeasuredPrewarmResult(
  endpoint: MobileApiEndpointSpec,
  params: unknown,
  result: MobileKeywordResult | null,
  liveGoldenRadar: MobileLiveGoldenRadar | null,
  resultCache: InMemoryMobileResultCache | null = null,
): MobileKeywordResult | null {
  if (!supportsMeasuredPrewarmSupplement(endpoint.product)) return result;
  const targetCount = requestedFeatureTargetCount(endpoint.product, params);
  const current = result && Array.isArray(result.keywords) ? result.keywords : [];
  if (current.length >= targetCount) return result;
  const seen = new Set(current.map((item) => compactServerKeyword(item.keyword)).filter(Boolean));
  const supplement = [
    ...(endpoint.product === 'mindmap-expansion'
      ? measuredMindmapCacheCandidates(params, resultCache, targetCount)
      : []),
    ...measuredBoardCandidatesForFeature(endpoint.product, liveGoldenRadar, targetCount),
    ...measuredCacheCandidatesForFeature(endpoint.product, resultCache, targetCount),
  ]
    .filter((item) => {
      const key = compactServerKeyword(item.keyword);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (!supplement.length && result) return result;
  const keywords = [...current, ...supplement].slice(0, targetCount);
  const baseResult: MobileKeywordResult = result || {
    keywords: [],
    summary: {
      total: 0,
      sss: 0,
      measured: 0,
      elapsedMs: 0,
      fromCache: false,
      parityMode: 'pc-engine-plus',
    },
  };
  return {
    ...baseResult,
    keywords,
    summary: {
      ...resultSummaryForKeywords(baseResult, keywords),
      parityMode: 'pc-engine-plus',
      fromCache: baseResult.summary.fromCache,
      elapsedMs: baseResult.summary.elapsedMs,
    },
  };
}

function mergeExactMetricWithLiveBoard(
  current: MobileKeywordMetric,
  board: MobileKeywordMetric,
): MobileKeywordMetric {
  const currentPcSearchVolume = typeof current.pcSearchVolume === 'number' && current.pcSearchVolume > 0
    ? current.pcSearchVolume
    : null;
  const currentMobileSearchVolume = typeof current.mobileSearchVolume === 'number' && current.mobileSearchVolume > 0
    ? current.mobileSearchVolume
    : null;
  const currentHasMeasuredCore = currentPcSearchVolume !== null
    && currentMobileSearchVolume !== null
    && typeof current.totalSearchVolume === 'number'
    && current.totalSearchVolume > 0
    && typeof current.documentCount === 'number'
    && current.documentCount > 0;
  if (currentHasMeasuredCore) {
    return {
      ...current,
      score: current.score ?? board.score ?? null,
      cpc: current.cpc ?? board.cpc,
      category: current.category || board.category,
      evidence: uniqueEvidence(current.evidence, board.evidence, 'analysis-board-metric-sync'),
      isMeasured: true,
    };
  }

  const boardPcSearchVolume = typeof board.pcSearchVolume === 'number' && board.pcSearchVolume > 0
    ? board.pcSearchVolume
    : null;
  const boardMobileSearchVolume = typeof board.mobileSearchVolume === 'number' && board.mobileSearchVolume > 0
    ? board.mobileSearchVolume
    : null;
  const pcSearchVolume = boardPcSearchVolume ?? current.pcSearchVolume;
  const mobileSearchVolume = boardMobileSearchVolume ?? current.mobileSearchVolume;
  const totalSearchVolume = board.totalSearchVolume ?? current.totalSearchVolume;
  const documentCount = board.documentCount ?? current.documentCount;
  const goldenRatio = board.goldenRatio
    ?? (totalSearchVolume !== null && documentCount !== null && documentCount > 0
      ? Number((totalSearchVolume / documentCount).toFixed(2))
      : current.goldenRatio);

  return {
    ...current,
    ...board,
    score: board.score ?? current.score ?? null,
    pcSearchVolume,
    mobileSearchVolume,
    totalSearchVolume,
    documentCount,
    goldenRatio,
    cpc: board.cpc ?? current.cpc,
    source: 'live-golden-board-exact-match',
    intent: current.intent || board.intent,
    evidence: uniqueEvidence(board.evidence, current.evidence, 'analysis-board-metric-sync'),
    isMeasured: board.isMeasured !== false
      && totalSearchVolume !== null
      && documentCount !== null,
  };
}

function overlayLiveGoldenExactKeyword(
  endpoint: MobileApiEndpointSpec,
  params: unknown,
  result: MobileKeywordResult,
  liveGoldenRadar: MobileLiveGoldenRadar | null,
): MobileKeywordResult {
  if (endpoint.product !== 'keyword-analysis' || !liveGoldenRadar || !result || !Array.isArray(result.keywords)) {
    return result;
  }
  const seed = readKeywordAnalysisSeed(params);
  const seedKey = compactServerKeyword(seed);
  if (!seedKey) return result;
  const boardItem = liveGoldenRadar.findMeasuredBoardItem(seed)
    || (liveGoldenRadar.snapshot().board || [])
      .find((item) => compactServerKeyword(item.keyword) === seedKey);
  if (!boardItem) return result;

  const exactMetric = metricFromLiveGoldenBoardItem(boardItem);
  const mergedKeywords: MobileKeywordMetric[] = [];
  let inserted = false;
  for (const keyword of result.keywords) {
    const isExact = compactServerKeyword(keyword.keyword) === seedKey;
    if (isExact) {
      mergedKeywords.push(mergeExactMetricWithLiveBoard(keyword, exactMetric));
      inserted = true;
      continue;
    }
    mergedKeywords.push(keyword);
  }
  if (!inserted) {
    mergedKeywords.unshift({
      ...exactMetric,
      evidence: uniqueEvidence(exactMetric.evidence, 'analysis-board-metric-sync'),
    });
  }

  const deduped: MobileKeywordMetric[] = [];
  const seen = new Set<string>();
  for (const keyword of mergedKeywords) {
    const key = compactServerKeyword(keyword.keyword);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(keyword);
  }

  return {
    ...result,
    keywords: deduped,
    summary: resultSummaryForKeywords(result, deduped),
  };
}

async function createJob(
  res: http.ServerResponse,
  endpoint: MobileApiEndpointSpec,
  req: http.IncomingMessage,
  store: InMemoryMobileJobStore,
  pcWorkerExecutor: MobileJobExecutor,
  resultCache: InMemoryMobileResultCache | null,
  liveGoldenRadar: MobileLiveGoldenRadar | null,
  maxBodyBytes: number,
): Promise<void> {
  try {
    const params = await parseBody(req, maxBodyBytes);
    const splitParams = splitSensitiveJobParams(params, decodeUserApiCredentialsHeader(req));
    const normalizedCacheParams = normalizeMobileJobCacheParams(endpoint.product, splitParams.cacheParams);
    const cachedResult = resultCache?.get(endpoint.product, normalizedCacheParams);
    let cachedSyncedResult: MobileKeywordResult | null = null;
    if (cachedResult) {
      const cachedBaseResult = supplementMeasuredPrewarmResult(
        endpoint,
        splitParams.executorParams,
        overlayLiveGoldenExactKeyword(endpoint, splitParams.executorParams, cachedResult, liveGoldenRadar),
        liveGoldenRadar,
        resultCache,
      ) || cachedResult;
      const enrichedCachedResult = await enrichShoppingProductPicksForResult(endpoint, splitParams.executorParams, cachedBaseResult);
      cachedSyncedResult = sanitizeMeasuredKeywordResult(endpoint, enrichedCachedResult);
    }
    if (cachedSyncedResult) {
      resultCache?.set(endpoint.product, normalizedCacheParams, cachedSyncedResult);
    }
    let prewarmedResult: MobileKeywordResult | null = null;
    if (!cachedSyncedResult) {
      const prewarmedBaseResult = supplementMeasuredPrewarmResult(endpoint, splitParams.executorParams, null, liveGoldenRadar, resultCache) || {
          keywords: [],
          summary: {
            total: 0,
            sss: 0,
            measured: 0,
            elapsedMs: 0,
            fromCache: false,
            parityMode: 'pc-engine-plus',
          },
        };
      const enrichedPrewarmedResult = await enrichShoppingProductPicksForResult(endpoint, splitParams.executorParams, prewarmedBaseResult);
      prewarmedResult = sanitizeMeasuredKeywordResult(endpoint, enrichedPrewarmedResult);
    }
    if (prewarmedResult && prewarmedResult.keywords.length > 0) {
      resultCache?.set(endpoint.product, normalizedCacheParams, prewarmedResult);
    }
    const minimumUsableCount = minimumUsableFeatureKeywordCount(endpoint.product, splitParams.executorParams);
    const hasUsableCachedResult = !!cachedSyncedResult && cachedSyncedResult.keywords.length >= minimumUsableCount;
    const hasUsablePrewarmedResult = !!prewarmedResult
      && prewarmedResult.keywords.length >= minimumUsableCount;
    const job = hasUsableCachedResult
      ? store.createCompleted(endpoint.product, splitParams.publicParams, cachedSyncedResult as MobileKeywordResult)
      : hasUsablePrewarmedResult
        ? store.createCompleted(endpoint.product, splitParams.publicParams, prewarmedResult as MobileKeywordResult)
      : store.create(endpoint.product, splitParams.publicParams, async (job, context) => {
        const result = await pcWorkerExecutor({ ...job, params: splitParams.executorParams }, context);
        const baseResult = supplementMeasuredPrewarmResult(
          endpoint,
          splitParams.executorParams,
          overlayLiveGoldenExactKeyword(endpoint, splitParams.executorParams, result, liveGoldenRadar),
          liveGoldenRadar,
          resultCache,
        ) || result;
        const enrichedResult = await enrichShoppingProductPicksForResult(endpoint, splitParams.executorParams, baseResult);
        const sanitizedResult = sanitizeMeasuredKeywordResult(endpoint, enrichedResult);
        resultCache?.set(endpoint.product, normalizedCacheParams, sanitizedResult);
        return sanitizedResult;
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
  const store = options.store || new InMemoryMobileJobStore({
    maxConcurrentJobs: positiveIntegerEnv('LEWORD_MOBILE_MAX_CONCURRENT_JOBS', 1, 4),
  });
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
  const webSessionSecret = getWebSessionSigningSecret(options);
  const runtimeEntitlements = new Map<string, MobileEntitlement>();
  const sessionAwareEntitlementVerifier: MobileEntitlementVerifier | null = entitlementVerifier
    ? async (token) => {
      const runtime = runtimeEntitlements.get(token);
      if (runtime) {
        return { ok: true, entitlement: runtime };
      }
      const signedWebSession = verifySignedWebSessionToken(token, webSessionSecret);
      if (signedWebSession) {
        if (signedWebSession.ok && signedWebSession.entitlement) {
          runtimeEntitlements.set(token, signedWebSession.entitlement);
        }
        return signedWebSession;
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
  const maxDownloadUploadBytes = downloadUploadMaxBytes();
  const maxDownloadUploadChunkBytes = downloadUploadChunkMaxBytes();
  const proBlueprintServices = options.proBlueprintServices;

  const server = http.createServer((req, res) => {
    void (async () => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Requested-With, X-Leword-User-Api-Credentials, X-LeadersPro-Admin-Token, X-Leword-Admin-Token',
      });
      res.end();
      return;
    }

    if (rateLimiter && !isRateLimitExemptRoute(url.pathname)) {
      const limit = rateLimiter.check(req);
      if (!limit.ok) {
        rateLimited(res, limit);
        return;
      }
    }

    if (req.method === 'GET' && url.pathname === '/ads.txt') {
      text(res, 200, ADSENSE_ADS_TXT, {
        'Cache-Control': 'public, max-age=3600',
      });
      return;
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

    if (req.method === 'GET' && (url.pathname === '/v1/downloads' || url.pathname === '/v1/public/downloads')) {
      json(res, 200, buildDownloadsPayload(), {
        'Cache-Control': 'no-store',
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/download/pc') {
      serveDownload(res, 'leword', 'windows');
      return;
    }

    if (req.method === 'GET' && url.pathname === '/download/android') {
      serveDownload(res, 'leword', 'android');
      return;
    }

    const productDownloadMatch = url.pathname.match(/^\/download\/([^/]+)\/([^/]+)$/);
    if (req.method === 'GET' && productDownloadMatch) {
      const product = normalizeDownloadProduct(productDownloadMatch[1]);
      const kind = normalizeDownloadKind(productDownloadMatch[2]);
      if (!product || !kind) {
        notFound(res, 'download product or platform not found');
        return;
      }
      serveDownload(res, product, kind);
      return;
    }

    if (
      req.method === 'GET'
      && (
        url.pathname === '/'
        || url.pathname === '/admin'
        || url.pathname === '/admin/'
        || url.pathname === '/leword'
        || url.pathname === '/leword/'
        || url.pathname === '/checkout/success'
        || url.pathname === '/checkout/fail'
      )
    ) {
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
      const snapshot = await getPublicSourceSignalSnapshot(limit);
      json(res, 200, buildPublicSourceSignalPayload(snapshot), {
        'Cache-Control': 'no-store',
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === PUBLIC_SITE_CONTENT_ROUTE) {
      json(res, 200, { ok: true, content: readSiteContentDraft() }, {
        'Cache-Control': 'no-store',
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === PUBLIC_COMMERCE_CATALOG_ROUTE) {
      json(res, 200, { ok: true, catalog: buildCommerceCatalog(readSiteContentDraft()) }, {
        'Cache-Control': 'no-store',
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === PUBLIC_ANALYTICS_COLLECT_ROUTE) {
      try {
        const body = await parseBody(req, maxBodyBytes) as any;
        const result = recordAnalyticsEvent({
          input: body || {},
          request: {
            ip: requestClientIp(req),
            userAgent: requestUserAgent(req),
            referrer: requestReferrer(req),
          },
        });
        json(res, 202, { ok: true, id: result.event.id });
      } catch (err) {
        handleBodyError(res, err, maxBodyBytes);
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === CHECKOUT_ORDER_ROUTE) {
      try {
        const body = await parseBody(req, maxBodyBytes) as any;
        const catalog = buildCommerceCatalog(readSiteContentDraft());
        const created = createCommerceOrder({
          catalog,
          input: body || {},
        });
        json(res, 201, {
          ok: true,
          order: created.order,
          toss: catalog.toss,
        });
      } catch (err) {
        json(res, 400, { ok: false, message: (err as Error).message || 'checkout order failed' } satisfies MobileJobErrorResponse);
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === TOSS_CONFIRM_ROUTE) {
      try {
        const body = await parseBody(req, maxBodyBytes) as any;
        const result = await confirmTossPayment({ input: body || {} });
        json(res, result.ok ? 200 : 400, result);
      } catch (err) {
        handleBodyError(res, err, maxBodyBytes);
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === TOSS_WEBHOOK_ROUTE) {
      try {
        const body = await parseBody(req, maxBodyBytes) as Record<string, unknown>;
        const result = recordTossWebhookEvent({ event: body || {} });
        json(res, 202, { ok: result.ok, event: result.event, order: result.order, payment: result.payment });
      } catch (err) {
        handleBodyError(res, err, maxBodyBytes);
      }
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
        liveGolden: {
          enabled: !!liveGoldenRadar,
        },
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
      await createLoginSession(req, res, entitlementVerifier, runtimeEntitlements, notificationInbox, prewarmService, liveGoldenRadar, maxBodyBytes, webSessionSecret);
      return;
    }

    if (req.method === 'POST' && url.pathname === ADMIN_SETTINGS_UNLOCK_ROUTE) {
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'admin')) return;
      await unlockAdminSettings(req, res, maxBodyBytes);
      return;
    }

    if ((req.method === 'GET' || req.method === 'POST') && url.pathname === ADMIN_AI_WORKER_STATUS_ROUTE) {
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'admin')) return;
      await handleAdminAiWorkerStatus(req, res, maxBodyBytes);
      return;
    }

    if (req.method === 'POST' && url.pathname === ADMIN_DOWNLOAD_UPLOAD_ROUTE) {
      if (!await authorizeAdminDownloadUploadRequest(req, res, sessionAwareEntitlementVerifier)) return;
      await handleAdminDownloadUpload(req, res, maxDownloadUploadBytes);
      return;
    }

    if (req.method === 'POST' && url.pathname === ADMIN_DOWNLOAD_CHUNK_UPLOAD_ROUTE) {
      if (!await authorizeAdminDownloadUploadRequest(req, res, sessionAwareEntitlementVerifier)) return;
      await handleAdminDownloadChunkUpload(req, res, url, maxDownloadUploadChunkBytes);
      return;
    }

    if ((req.method === 'GET' || req.method === 'POST') && url.pathname === ADMIN_SITE_CONTENT_ROUTE) {
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'admin')) return;
      if (req.method === 'GET') {
        json(res, 200, { ok: true, content: readSiteContentDraft(), storage: siteContentFile() });
        return;
      }
      try {
        const body = await parseBody(req, maxBodyBytes) as any;
        const content = sanitizeSiteContentDraft(body?.content || body, body?.updatedBy || 'admin');
        writeSiteContentDraft(content);
        json(res, 200, { ok: true, content, storage: siteContentFile() });
      } catch (err) {
        handleBodyError(res, err, maxBodyBytes);
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === ADMIN_COMMERCE_DASHBOARD_ROUTE) {
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'admin')) return;
      const period = url.searchParams.get('period') === 'month' ? 'month' : 'today';
      json(res, 200, {
        ok: true,
        dashboard: buildCommerceDashboard({ period }),
        storage: resolveCommerceStoreFile(),
      }, {
        'Cache-Control': 'no-store',
      });
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
        let snapshot = liveGoldenRadar.snapshot();
        for (let cycle = 0; cycle < cycles; cycle += 1) {
          snapshot = await liveGoldenRadar.runOnce();
          if (snapshot.running) break;
        }
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
        if (prewarmScheduler) {
          const run = prewarmScheduler.runNow();
          json(res, 202, { ok: true, snapshot: prewarmScheduler.snapshot() });
          void run.catch(() => undefined);
          return;
        }
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
    void createJob(res, endpoint, req, store, pcWorkerExecutor, resultCache, liveGoldenRadar, maxBodyBytes);
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
