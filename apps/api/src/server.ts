import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import zlib from 'zlib';
import { isIP } from 'net';
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
  type MobileLiveGoldenBoardItem,
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
import {
  readLiveGoldenWorkerHealth,
  resolveLiveGoldenWorkerHeartbeatFile,
} from '../../../src/mobile/live-golden-worker-health';
import {
  buildLiveGoldenSupplyReport,
  evaluateLiveGoldenHumanReviewAttestation,
  LIVE_GOLDEN_HUMAN_REVIEW_FINGERPRINT_VERSION,
  liveGoldenBoardFingerprint,
  type LiveGoldenHumanReview,
} from '../../../src/mobile/live-golden-supply-report';
import {
  bindLiveGoldenReviewRows,
  freezeLiveGoldenReviewCohort,
  isExactLiveGoldenReviewBinding,
  issueLiveGoldenPhase2EntryCertificate,
  LIVE_GOLDEN_BLIND_REVIEW_DECISION_SCHEMA_VERSION,
  parseLiveGoldenPhase2EntryCertificate,
  parseLiveGoldenReviewCohort,
  submitLiveGoldenBlindReviewDecision,
  summarizeLiveGoldenBlindReviews,
  type LiveGoldenBlindReviewDecision,
  type LiveGoldenBlindReviewSummary,
  type LiveGoldenPhase2EntryCertificate,
  type LiveGoldenReviewCohortState,
  type PersistedLiveGoldenReviewCohort,
} from '../../../src/mobile/live-golden-review-cohort';
import { classifyGradeByMetrics } from '../../../src/utils/grade';
import {
  HomeKeywordBriefingRevisionConflictError,
  HomeKeywordBriefingStorageError,
  HomeKeywordBriefingValidationError,
  publishHomeKeywordBriefing,
  readHomeKeywordBriefing,
  resolveHomeKeywordBriefingFile,
  type HomeKeywordBriefingSnapshot,
} from '../../../src/mobile/home-keyword-briefing';
import { inferBriefingSearchReasons } from './briefing-manus-reasoner';
import {
  HomeNoticesRevisionConflictError,
  HomeNoticesStorageError,
  HomeNoticesValidationError,
  publishHomeNotices,
  readHomeNotices,
} from '../../../src/mobile/home-notices';
import { InMemoryMobileResultCache } from '../../../src/mobile/result-cache';
import {
  applyKeywordAiJudge,
  hasFreshCanonicalDocumentCountMeasurement,
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
import { getKeywordDailyTrend30d } from '../../../src/utils/naver-datalab-api';
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
import { normalizeNaverBlogBroadQuery } from '../../../src/utils/naver-blog-api';

const DEFAULT_LEWORD_LICENSE_SERVER_URL = 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';
const DEFAULT_LEWORD_LICENSE_APP_ID = 'com.leword.keyword.master';
const ADSENSE_ADS_TXT = 'google.com, pub-4008574892672964, DIRECT, f08c47fec0942fa0\n';
const DEFAULT_LEADERS_PRO_ADMIN_TOKEN = 'qkrtjdgus2021645';
const LIVE_GOLDEN_INGEST_MAX_BODY_BYTES = 512 * 1024;
const ADMIN_SETTINGS_UNLOCK_ROUTE = '/v1/admin/settings/unlock';
const ADMIN_SITE_CONTENT_ROUTE = '/v1/admin/site-content';
const ADMIN_HOME_KEYWORD_BRIEFING_ROUTE = '/v1/admin/home-keyword-briefing';
const ADMIN_HOME_NOTICES_ROUTE = '/v1/admin/home-notices';
const ADMIN_DOWNLOAD_UPLOAD_ROUTE = '/v1/admin/downloads/upload';
const ADMIN_DOWNLOAD_CHUNK_UPLOAD_ROUTE = '/v1/admin/downloads/upload-chunk';
const ADMIN_COMMERCE_DASHBOARD_ROUTE = '/v1/admin/commerce/dashboard';
const ADMIN_AI_WORKER_STATUS_ROUTE = '/v1/admin/ai-worker/status';
const ADMIN_LIVE_GOLDEN_REVIEW_ROUTE = '/v1/admin/live-golden/review';
const PUBLIC_SITE_CONTENT_ROUTE = '/v1/public/site-content';
const PUBLIC_HOME_KEYWORD_BRIEFING_ROUTE = '/v1/public/home-keyword-briefing';
const PUBLIC_HOME_NOTICES_ROUTE = '/v1/public/home-notices';
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
  liveGoldenWorkerHeartbeatFile?: string;
  liveGoldenHumanReviewFile?: string;
  liveGoldenReviewCohortFile?: string;
  liveGoldenPhase2CertificateFile?: string;
  webSessionSecret?: string | null;
  authToken?: string | null;
  entitlementVerifier?: MobileEntitlementVerifier | null;
  apiGuardrails?: Partial<MobileApiGuardrailOptions> | null;
  rateLimiter?: MobileApiRateLimiter | null;
  proBlueprintServices?: MobileProBlueprintServices;
}

// v2.49.72: gzip 압축 — 랜딩 HTML 562KB 가 무압축으로 나가 첫 로드가 느렸다.
// 요청 핸들러가 res 에 수용 여부를 스탬프하고, 전체-바디 응답 헬퍼만 압축한다(SSE 무관).
const GZIP_MIN_BYTES = 1024;
function endMaybeGzip(
  res: http.ServerResponse,
  statusCode: number,
  baseHeaders: Record<string, string | number>,
  body: string,
): void {
  const acceptsGzip = (res as { __acceptsGzip?: boolean }).__acceptsGzip === true;
  const raw = Buffer.from(body, 'utf8');
  if (acceptsGzip && raw.length >= GZIP_MIN_BYTES) {
    const compressed = zlib.gzipSync(raw);
    res.writeHead(statusCode, {
      ...baseHeaders,
      'Content-Encoding': 'gzip',
      'Vary': 'Accept-Encoding',
      'Content-Length': compressed.length,
    });
    res.end(compressed);
    return;
  }
  res.writeHead(statusCode, baseHeaders);
  res.end(raw);
}

function json(
  res: http.ServerResponse,
  statusCode: number,
  body: unknown,
  headers: Record<string, string | number> = {},
): void {
  endMaybeGzip(res, statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Requested-With, X-Leword-User-Api-Credentials, X-LeadersPro-Admin-Token, X-Leword-Admin-Token',
    ...headers,
  }, JSON.stringify(body));
}

function html(
  res: http.ServerResponse,
  statusCode: number,
  body: string,
  headers: Record<string, string | number> = {},
): void {
  endMaybeGzip(res, statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Requested-With, X-Leword-User-Api-Credentials, X-LeadersPro-Admin-Token, X-Leword-Admin-Token',
    ...headers,
  }, body);
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

function getIndependentWebSessionSigningSecret(options: LewordApiServerOptions): string {
  if (typeof options.webSessionSecret === 'string') return options.webSessionSecret.trim();
  if (options.webSessionSecret === null) return '';
  return String(process.env['LEWORD_WEB_SESSION_SECRET'] || '').trim();
}

function getWebSessionSigningSecret(options: LewordApiServerOptions): string {
  // Preserve the legacy general web-session fallback. Strict human-review
  // sessions use getStrictHumanReviewSigningSecret instead.
  return getIndependentWebSessionSigningSecret(options)
    || getRequiredAuthToken(options);
}

function getStrictHumanReviewSigningSecret(options: LewordApiServerOptions): string {
  const candidate = getIndependentWebSessionSigningSecret(options);
  if (Buffer.byteLength(candidate, 'utf8') < 32) return '';
  const machineToken = getRequiredAuthToken(options);
  if (machineToken && candidate === machineToken) return '';
  return candidate;
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

function isLiveGoldenIngestRequestAuthorized(req: http.IncomingMessage): boolean {
  const expected = String(process.env['LEWORD_LIVE_GOLDEN_INGEST_TOKEN'] || '').trim();
  const received = getBearerToken(req) || getHeaderValue(req, 'x-leword-ingest-token');
  return !!expected && !!received && stringEqualsConstantTime(received, expected);
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

  if (verification.entitlement.sessionPurpose === 'live-golden-review') {
    forbidden(res, 'review-purpose sessions cannot access general API endpoints');
    return false;
  }

  if (!isMobileEntitlementAllowed(verification.entitlement, requiredTier)) {
    forbidden(res);
    return false;
  }

  return true;
}

async function authorizeStrictHumanAdminWebSession(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  webSessionSecret: string,
): Promise<MobileEntitlement | null> {
  if (!webSessionSecret) {
    json(res, 503, {
      ok: false,
      code: 'admin-auth-unconfigured',
      message: 'independent human web-session authentication is not configured',
    });
    return null;
  }
  const token = getBearerToken(req);
  if (!token) {
    unauthorized(res);
    return null;
  }
  const verification = verifySignedWebSessionToken(token, webSessionSecret);
  if (!verification || !verification.ok || !verification.entitlement) {
    unauthorized(res);
    return null;
  }
  if (!isMobileEntitlementAllowed(verification.entitlement, 'admin')) {
    forbidden(res);
    return null;
  }
  if (
    verification.entitlement.source !== 'configured-web-login'
    && verification.entitlement.source !== 'license-service'
  ) {
    forbidden(res, 'human web login source is required for blind review');
    return null;
  }
  if (verification.entitlement.sessionPurpose !== 'live-golden-review') {
    forbidden(res, 'explicit live-golden review session purpose is required');
    return null;
  }
  if (!String(verification.entitlement.subjectId || '').trim()) {
    forbidden(res, 'admin reviewer identity is unavailable');
    return null;
  }
  return verification.entitlement;
}

async function verifyOptionalMobileRequest(
  req: http.IncomingMessage,
  verifier: MobileEntitlementVerifier | null,
  requiredTier: MobileEntitlementTier,
): Promise<MobileEntitlementVerification | null> {
  if (!verifier) return null;
  const token = getBearerToken(req);
  if (!token) return null;

  try {
    const verification = await verifier(token);
    if (!verification.ok || !verification.entitlement) return null;
    if (verification.entitlement.sessionPurpose === 'live-golden-review') return null;
    if (!isMobileEntitlementAllowed(verification.entitlement, requiredTier)) return null;
    return verification;
  } catch {
    return null;
  }
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
  const serverAiCredentials = configuredServerExternalAiCredentials();
  const serverAiProviders = configuredExternalAiProviders(serverAiCredentials);
  const apiAssist = {
    anthropic: booleanField(apiAssistInput, 'anthropic') || serverAiProviders.includes('anthropic'),
    manus: booleanField(apiAssistInput, 'manus') || !!process.env['MANUS_API_KEY'],
    openai: booleanField(apiAssistInput, 'openai') || serverAiProviders.includes('openai'),
    serverKeyUseEnabled: serverExternalAiKeyUseEnabled(),
  };
  const codexCommand = firstConfiguredCommand(['LEWORD_CODEX_CLI', 'CODEX_CLI_PATH'], 'codex');
  const claudeCommand = firstConfiguredCommand(['LEWORD_CLAUDE_CODE_CLI', 'LEWORD_CLAUDE_CLI', 'CLAUDE_CODE_CLI_PATH'], 'claude');
  const [codex, claudeCode] = await Promise.all([
    probeAdminAiCliWorker(codexCommand, [['auth', 'status'], ['login', 'status'], ['status']]),
    probeAdminAiCliWorker(claudeCommand, [['status', '--json'], ['doctor'], ['status']]),
  ]);
  // Pro Web external inference currently has providers for Anthropic/OpenAI only.
  // Keep reporting whether a Manus key is present, but never claim that key alone is executable here.
  const apiCount = [apiAssist.anthropic, apiAssist.openai].filter(Boolean).length;
  const ready = {
    codex: codex.loggedIn === true,
    claudeCode: claudeCode.loggedIn === true,
    api: apiCount > 0,
  };
  return {
    ok: true,
    selectedProvider,
    checkedAt: new Date().toISOString(),
    execution: {
      mode: 'readiness-status-only',
      inferenceDispatched: false,
    },
    workers: { codex, claudeCode },
    apiAssist: { ...apiAssist, manusConnected: false, count: apiCount },
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
  userIdSha256?: string;
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

function userIdMatchesConfiguredLogin(account: ConfiguredWebLoginAccount, userId: string): boolean {
  const configuredHash = normalizedSha256(account.userIdSha256);
  if (configuredHash) {
    const actualHash = crypto.createHash('sha256').update(userId, 'utf8').digest('hex');
    return stringEqualsConstantTime(actualHash, configuredHash);
  }
  return !!account.userId && stringEqualsConstantTime(userId, account.userId);
}

function normalizeConfiguredWebLoginAccount(value: unknown, fallbackUserId = '', forcedAdminOnly = false): ConfiguredWebLoginAccount | null {
  const record = typeof value === 'string'
    ? { password: value }
    : (value && typeof value === 'object' ? value as Record<string, unknown> : {});
  const userId = String(record.userId || record.id || record.username || fallbackUserId || '').trim();
  const userIdSha256 = normalizedSha256(record.userIdSha256 || record.userIdHash || record.idSha256 || record.idHash || record.usernameSha256 || record.usernameHash);
  const password = String(record.password || record.userPassword || record.pass || '').trim();
  const passwordSha256 = normalizedSha256(record.passwordSha256 || record.passwordHash || record.sha256);
  if ((!userId && !userIdSha256) || (!password && !passwordSha256)) return null;
  const tier = normalizeLoginTier(record.tier || record.plan || record.licenseType || (record.admin ? 'admin' : 'unlimited'));
  const adminOnly = forcedAdminOnly || tier === 'admin' || record.adminOnly === true || record.admin === true;
  const apiBaseUrl = String(record.apiBaseUrl || record.pcApiBaseUrl || '').trim().replace(/\/+$/, '');
  const expiresAt = record.expiresAt === undefined ? null : String(record.expiresAt || '').trim() || null;
  return {
    userId: userId || fallbackUserId || (adminOnly ? 'admin' : 'web-user'),
    userIdSha256: userIdSha256 || undefined,
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

  const adminPanelAccount = normalizeConfiguredWebLoginAccount({
    userId: process.env['LEWORD_ADMIN_PANEL_LOGIN_ID'] || 'leaderspro-admin-panel',
    userIdSha256: process.env['LEWORD_ADMIN_PANEL_LOGIN_ID_SHA256'],
    password: process.env['LEWORD_ADMIN_PANEL_LOGIN_PASSWORD'],
    passwordSha256: process.env['LEWORD_ADMIN_PANEL_LOGIN_PASSWORD_SHA256'],
    tier: 'admin',
    apiBaseUrl: process.env['LEWORD_ADMIN_LOGIN_API_BASE_URL'],
    expiresAt: process.env['LEWORD_ADMIN_LOGIN_EXPIRES_AT'],
  }, 'leaderspro-admin-panel', true);
  if (adminPanelAccount) accounts.push(adminPanelAccount);

  return accounts;
}

function configuredWebLoginAccountActive(
  account: ConfiguredWebLoginAccount,
  nowMs = Date.now(),
): boolean {
  if (!account.expiresAt) return true;
  const expiresAtMs = Date.parse(account.expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
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
    if (!configuredWebLoginAccountActive(account)) continue;
    if (account.adminOnly && !adminRequested) continue;
    if (adminRequested && account.tier !== 'admin') continue;
    if (!userIdMatchesConfiguredLogin(account, userId)) continue;
    if (!passwordMatchesConfiguredLogin(account, password)) continue;
    return { ok: true, account: account.userIdSha256 ? { ...account, userId } : account };
  }
  return {
    ok: false,
    message: adminRequested
      ? 'configured admin login rejected'
      : 'configured web login rejected',
  };
}

const WEB_SESSION_TOKEN_PREFIX = 'leword-web-v1';
const WEB_SESSION_MAX_AGE_MS = 30 * 60 * 1000;
const WEB_SESSION_CLOCK_SKEW_MS = 30 * 1000;

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
  return 'env-static-token';
}

function signWebSessionToken(
  secret: string,
  entitlement: MobileEntitlement,
  sessionPurpose: NonNullable<MobileEntitlement['sessionPurpose']> = 'mobile-api',
): string {
  if (!secret) return `web-${crypto.randomUUID()}`;
  const payload = {
    subjectId: entitlement.subjectId,
    tier: entitlement.tier,
    source: entitlement.source,
    expiresAt: entitlement.expiresAt ?? null,
    issuedAt: new Date().toISOString(),
    sessionPurpose,
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
    const issuedAtMs = Date.parse(String(payload.issuedAt || ''));
    const nowMs = Date.now();
    if (
      !Number.isFinite(issuedAtMs)
      || issuedAtMs > nowMs + WEB_SESSION_CLOCK_SKEW_MS
      || nowMs - issuedAtMs > WEB_SESSION_MAX_AGE_MS
    ) {
      return { ok: false, reason: 'web session expired or issued-at invalid' };
    }
    const expiresAt = payload.expiresAt === undefined || payload.expiresAt === null
      ? null
      : String(payload.expiresAt || '').trim() || null;
    if (expiresAt) {
      const expiresAtMs = Date.parse(expiresAt);
      if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
        return { ok: false, reason: 'web session entitlement expired' };
      }
    }
    return {
      ok: true,
      entitlement: {
        subjectId,
        tier: normalizeLoginTier(payload.tier),
        expiresAt,
        source: normalizeWebSessionSource(payload.source),
        sessionPurpose: payload.sessionPurpose === 'live-golden-review'
          ? 'live-golden-review'
          : 'mobile-api',
      },
    };
  } catch {
    return { ok: false, reason: 'web session payload invalid' };
  }
}

function panelLoginUrl(body: any): string {
  const bodyOverride = process.env['NODE_ENV'] === 'production'
    ? ''
    : String(body?.panelServerUrl || '').trim();
  return String(
    bodyOverride
      || process.env['LEWORD_MOBILE_PANEL_LOGIN_URL']
      || process.env['LICENSE_SERVER_URL']
      || DEFAULT_LEWORD_LICENSE_SERVER_URL,
  ).trim();
}

interface StrictReviewPanelUrlResolution {
  ok: boolean;
  url?: string;
  code?: string;
  message?: string;
}

const PUBLIC_HTTPS_PANEL_HOST_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const PRIVATE_PANEL_HOST_SUFFIX_RE = /(?:^|\.)(?:localhost|local|internal|intranet|lan|home|corp)$/i;

function validateStrictReviewPanelUrl(value: unknown): StrictReviewPanelUrlResolution {
  const configured = String(value || '').trim();
  if (!configured) {
    return {
      ok: false,
      code: 'admin-auth-provider-unconfigured',
      message: 'strict review panel login endpoint is not configured',
    };
  }
  try {
    const url = new URL(configured);
    const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/u, '').toLowerCase();
    if (
      url.protocol !== 'https:'
      || url.username
      || url.password
      || url.hash
      || (url.port && url.port !== '443')
      || isIP(hostname) !== 0
      || PRIVATE_PANEL_HOST_SUFFIX_RE.test(hostname)
      || !PUBLIC_HTTPS_PANEL_HOST_RE.test(hostname)
    ) {
      return {
        ok: false,
        code: 'admin-auth-provider-unsafe',
        message: 'strict review panel login endpoint must be a public credential-free HTTPS URL',
      };
    }
    return { ok: true, url: url.toString() };
  } catch {
    return {
      ok: false,
      code: 'admin-auth-provider-unsafe',
      message: 'strict review panel login endpoint is invalid',
    };
  }
}

function strictReviewPanelLoginUrl(): StrictReviewPanelUrlResolution {
  return validateStrictReviewPanelUrl(
    process.env['LEWORD_MOBILE_LIVE_GOLDEN_REVIEW_PANEL_LOGIN_URL'],
  );
}

interface StrictReviewAuthReadiness {
  ready: boolean;
  signingSecretConfigured: boolean;
  configuredAdmin: boolean;
  strictProviderConfigured: boolean;
  provider: 'configured-admin' | 'strict-review-https' | 'none';
  reason: string;
}

function strictReviewAuthReadiness(signingSecret: string): StrictReviewAuthReadiness {
  const signingSecretConfigured = !!signingSecret;
  const configuredAdmin = configuredWebLoginAccounts().some((account) => (
    account.adminOnly
      && account.tier === 'admin'
      && configuredWebLoginAccountActive(account)
  ));
  const strictProvider = strictReviewPanelLoginUrl();
  const strictProviderConfigured = strictProvider.ok;
  const provider = configuredAdmin
    ? 'configured-admin'
    : strictProviderConfigured
      ? 'strict-review-https'
      : 'none';
  const ready = signingSecretConfigured && provider !== 'none';
  return {
    ready,
    signingSecretConfigured,
    configuredAdmin,
    strictProviderConfigured,
    provider,
    reason: !signingSecretConfigured
      ? 'independent-review-signing-secret-unconfigured'
      : provider === 'none'
        ? strictProvider.code || 'strict-review-auth-provider-unconfigured'
        : 'strict-review-auth-configured',
  };
}

async function fetchStrictReviewPanelLogin(
  configuredUrl: string,
  body: string,
): Promise<{ response?: Response; message?: string }> {
  const allowlisted = new URL(configuredUrl);
  let currentUrl = allowlisted;
  for (let redirectCount = 0; redirectCount <= 2; redirectCount += 1) {
    const response = await fetch(currentUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      redirect: 'manual',
    });
    if (response.status < 300 || response.status >= 400) return { response };
    const location = String(response.headers.get('location') || '').trim();
    if (!location) return { message: 'strict review panel redirect location missing' };
    let redirected: URL;
    try {
      redirected = new URL(location, currentUrl);
    } catch {
      return { message: 'strict review panel redirect is invalid' };
    }
    const redirectValidation = validateStrictReviewPanelUrl(redirected.toString());
    if (!redirectValidation.ok || redirected.origin !== allowlisted.origin) {
      return { message: 'strict review panel off-origin redirect rejected' };
    }
    if (response.status !== 307 && response.status !== 308) {
      return { message: 'strict review panel method-changing redirect rejected' };
    }
    currentUrl = redirected;
  }
  return { message: 'strict review panel redirect limit exceeded' };
}

async function verifyPanelLogin(body: any, strictReview = false): Promise<{
  ok: boolean;
  accessToken?: string;
  apiBaseUrl?: string;
  userId?: string;
  tier?: MobileEntitlementTier;
  expiresAt?: string | null;
  message?: string;
  statusCode?: number;
  code?: string;
}> {
  const strictResolution = strictReview ? strictReviewPanelLoginUrl() : null;
  if (strictResolution && !strictResolution.ok) {
    return {
      ok: false,
      statusCode: 503,
      code: strictResolution.code,
      message: strictResolution.message,
    };
  }
  // General sessions retain their legacy body override. Strict human review
  // sessions never read panelServerUrl from the request body.
  const panelUrl = strictResolution?.url || panelLoginUrl(body);
  if (!panelUrl) return { ok: false, message: 'panel login url missing' };
  const licenseCode = strictReview ? '' : String(body?.licenseCode || '').trim();
  const appId = strictReview
    ? process.env['LEWORD_MOBILE_LICENSE_APP_ID'] || DEFAULT_LEWORD_LICENSE_APP_ID
    : body?.appId || process.env['LEWORD_MOBILE_LICENSE_APP_ID'] || DEFAULT_LEWORD_LICENSE_APP_ID;
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
    const requestBody = JSON.stringify(buildPayload(action));
    const strictFetch = strictReview
      ? await fetchStrictReviewPanelLogin(panelUrl, requestBody)
      : null;
    if (strictFetch && !strictFetch.response) {
      return { ok: false, message: strictFetch.message || 'strict review panel login failed' };
    }
    const response = strictFetch?.response || await fetch(panelUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
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
  humanReviewSigningSecret: string,
): Promise<void> {
  try {
    const body = await parseBody(req, maxBodyBytes) as any;
    const isWebSession = String(req.url || '').split('?')[0] === '/v1/web/session';
    const userId = String(body?.userId || '').trim();
    const password = String(body?.password || '').trim();
    const candidateToken = String(body?.accessToken || body?.mobileToken || body?.token || password || '').trim();
    const requestedSessionPurpose: NonNullable<MobileEntitlement['sessionPurpose']> =
      isWebSession && body?.sessionPurpose === 'live-golden-review'
        ? 'live-golden-review'
        : 'mobile-api';
    if (
      isWebSession
      && body?.sessionPurpose !== undefined
      && body?.sessionPurpose !== 'mobile-api'
      && body?.sessionPurpose !== 'live-golden-review'
    ) {
      json(res, 400, { ok: false, message: 'invalid web session purpose' } satisfies MobileJobErrorResponse);
      return;
    }
    if (requestedSessionPurpose === 'live-golden-review' && !humanReviewSigningSecret) {
      json(res, 503, {
        ok: false,
        code: 'admin-auth-unconfigured',
        message: 'independent human web-session authentication is not configured',
      });
      return;
    }
    const sessionSigningSecret = requestedSessionPurpose === 'live-golden-review'
      ? humanReviewSigningSecret
      : webSessionSecret;

    if (!userId || !password) {
      json(res, 400, {
        ok: false,
        message: isWebSession ? '아이디와 비밀번호를 입력하세요.' : '아이디와 비밀번호가 필요합니다.',
      } satisfies MobileJobErrorResponse);
      return;
    }

    if (!isWebSession && candidateToken && verifier) {
      const verified = await verifier(candidateToken);
      if (verified.ok && verified.entitlement) {
        const apiBaseUrl = requestApiBaseUrl(req);
        const accessToken = isWebSession
          ? signWebSessionToken(sessionSigningSecret, verified.entitlement, requestedSessionPurpose)
          : candidateToken;
        runtimeEntitlements.set(accessToken, verified.entitlement);
        const session: MobileAuthSession = {
          ok: true,
          accessToken,
          userId: verified.entitlement.subjectId || userId,
          tier: verified.entitlement.tier,
          apiBaseUrl,
          pcLinked: true,
          source: 'mobile-token',
          linkedAt: new Date().toISOString(),
          expiresAt: verified.entitlement.expiresAt ?? null,
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
      const sessionEntitlement: MobileEntitlement = isWebSession
        ? { ...entitlement, sessionPurpose: requestedSessionPurpose }
        : entitlement;
      const token = signWebSessionToken(sessionSigningSecret, sessionEntitlement, requestedSessionPurpose);
      runtimeEntitlements.set(token, sessionEntitlement);
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
      statusCode?: number;
      code?: string;
    } = await verifyPanelLogin(body, requestedSessionPurpose === 'live-golden-review').catch((err) => ({
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
      const sessionEntitlement: MobileEntitlement = isWebSession
        ? { ...entitlement, sessionPurpose: requestedSessionPurpose }
        : entitlement;
      const token = isWebSession
        ? signWebSessionToken(sessionSigningSecret, sessionEntitlement, requestedSessionPurpose)
        : (panel.accessToken || `panel-${crypto.randomUUID()}`);
      runtimeEntitlements.set(token, sessionEntitlement);
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

    if (requestedSessionPurpose === 'live-golden-review' && panel.statusCode === 503) {
      json(res, 503, {
        ok: false,
        code: panel.code || 'admin-auth-provider-unconfigured',
        message: panel.message || 'strict review panel authentication is unavailable',
      });
      return;
    }

    if (isWebSession) {
      json(res, 401, {
        ok: false,
        message: '아이디 또는 비밀번호가 맞지 않습니다. 자동완성 값이 들어갔다면 지우고 다시 입력하세요.',
      } satisfies MobileJobErrorResponse);
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

// 발행 직후 백그라운드로 실행되는 Manus 검색-이유 보강.
// 발행 응답은 이미 나갔으므로 여기서 throw 해도 사용자에겐 영향이 없다(호출부가 catch).
// 이유가 없는 행만 골라 추론하고, 하나라도 붙으면 같은 리비전 위에 재저장한다.
let briefingReasonEnrichmentBusy = false;
async function enrichBriefingSearchReasons(published: HomeKeywordBriefingSnapshot): Promise<void> {
  if (briefingReasonEnrichmentBusy) return; // 동시 발행 시 겹치지 않게
  const missing = published.rows.filter((row) => !row.searchReason || !row.searchReason.trim());
  if (!missing.length) return;
  briefingReasonEnrichmentBusy = true;
  try {
    const result = await inferBriefingSearchReasons(
      missing.map((row) => ({ keyword: row.keyword, searchVolume: row.searchVolume, documentCount: row.documentCount })),
    );
    const reasons = result.reasons;
    if (!Object.keys(reasons).length) {
      console.log(`[briefing-manus] 보강 없음(status=${result.status}${result.detail ? ', ' + result.detail : ''})`);
      return;
    }
    // 최신 저장본 위에 병합한다(발행 후 다른 저장이 있었을 수 있음).
    const latest = readHomeKeywordBriefing();
    if (!latest) return;
    const mergedRows = latest.rows.map((row) => {
      const why = reasons[row.keyword];
      if (why && (!row.searchReason || !row.searchReason.trim())) {
        return { ...row, searchReason: why };
      }
      return row;
    });
    const enrichedCount = mergedRows.filter((row, i) => row.searchReason && !latest.rows[i].searchReason).length;
    if (!enrichedCount) return;
    publishHomeKeywordBriefing({
      value: { ...latest, rows: mergedRows },
      expectedRevision: latest.revision,
      updatedBy: 'manus-search-reason-enricher',
    });
    console.log(`[briefing-manus] 검색 이유 ${enrichedCount}건 보강 완료(status=${result.status}).`);
  } finally {
    briefingReasonEnrichmentBusy = false;
  }
}

function homeKeywordBriefingStorageUnavailable(
  res: http.ServerResponse,
  error: HomeKeywordBriefingStorageError,
): void {
  console.error('[home-keyword-briefing] persistent storage unavailable', error);
  json(res, 503, {
    ok: false,
    code: 'home-keyword-briefing-storage-unavailable',
    message: '키워드 브리핑 저장소를 사용할 수 없습니다. 잠시 후 다시 시도하세요.',
  }, { 'Cache-Control': 'no-store' });
}

function homeNoticesStorageUnavailable(
  res: http.ServerResponse,
  error: HomeNoticesStorageError,
): void {
  console.error('[home-notices] persistent storage unavailable', error);
  json(res, 503, {
    ok: false,
    code: 'home-notices-storage-unavailable',
    message: '공지사항 저장소를 사용할 수 없습니다. 잠시 후 다시 시도하세요.',
  }, { 'Cache-Control': 'no-store' });
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

const EXTERNAL_AI_USER_CREDENTIAL_KEYS = ['anthropicApiKey', 'openaiApiKey'] as const;
const EXTERNAL_AI_MAX_ROWS = 8;
const EXTERNAL_AI_MAX_OUTPUT_TOKENS = 2048;
const SERVER_EXTERNAL_AI_OPT_IN_ENV = 'LEWORD_ALLOW_SERVER_EXTERNAL_AI';

type ExternalAiProvider = 'anthropic' | 'openai';
type ExternalAiKeyOwner = 'user-local' | 'server-approved' | 'none';

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

function fingerprintExternalAiCredentials(credentials: UserApiCredentials): string {
  const entries = EXTERNAL_AI_USER_CREDENTIAL_KEYS
    .filter((key) => Boolean(credentials[key]))
    .map((key) => [
      key,
      crypto.createHash('sha256').update(String(credentials[key])).digest('hex').slice(0, 16),
    ]);
  return entries.length
    ? crypto.createHash('sha256').update(JSON.stringify(entries)).digest('hex').slice(0, 16)
    : 'none';
}

function enabledEnvironmentFlag(name: string): boolean {
  return /^(?:1|true|yes|on)$/i.test(String(process.env[name] || '').trim());
}

function serverExternalAiKeyUseEnabled(): boolean {
  return enabledEnvironmentFlag(SERVER_EXTERNAL_AI_OPT_IN_ENV);
}

function configuredExternalAiProviders(credentials: UserApiCredentials): ExternalAiProvider[] {
  const providers: ExternalAiProvider[] = [];
  if (credentials.anthropicApiKey) providers.push('anthropic');
  if (credentials.openaiApiKey) providers.push('openai');
  return providers;
}

function configuredServerExternalAiCredentials(): UserApiCredentials {
  if (!serverExternalAiKeyUseEnabled()) return {};
  let config: Partial<EnvConfig> = {};
  try {
    config = EnvironmentManager.getInstance().getConfig();
  } catch {
    config = {};
  }
  return sanitizeUserApiCredentials({
    anthropicApiKey: config.anthropicApiKey
      || process.env['ANTHROPIC_API_KEY']
      || process.env['CLAUDE_API_KEY'],
    openaiApiKey: config.openaiApiKey || process.env['OPENAI_API_KEY'],
  });
}

function normalizeExternalAiProvider(value: unknown): ExternalAiProvider | undefined {
  return value === 'anthropic' || value === 'openai' ? value : undefined;
}

function sanitizeAgentAssistOwnershipMarkers(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const {
    externalAiKeyOwner: _externalAiKeyOwner,
    externalAiKeyProviders: _externalAiKeyProviders,
    externalAiProviders: _externalAiProviders,
    externalAiProvider: _externalAiProvider,
    externalAiKeyFingerprint: _externalAiKeyFingerprint,
    externalAiServerKeyOptIn: _externalAiServerKeyOptIn,
    externalInferencePolicy: _externalInferencePolicy,
    ...trustedRequest
  } = value as Record<string, unknown>;
  return trustedRequest;
}

function externalAiRequested(agentAssist: Record<string, unknown> | undefined): boolean {
  return !!agentAssist
    && agentAssist.enabled !== false
    && agentAssist.includeAiInference === true
    && (agentAssist.forceExternalInference === true || agentAssist.externalAi === true);
}

function attachTrustedExternalAiPolicy(
  raw: Record<string, unknown>,
  credentials: UserApiCredentials,
  includeCredentialFingerprint: boolean,
): Record<string, unknown> {
  const agentAssist = sanitizeAgentAssistOwnershipMarkers(raw.agentAssist);
  if (!agentAssist) return raw;

  const userProviders = configuredExternalAiProviders(credentials);
  const serverCredentials = userProviders.length ? {} : configuredServerExternalAiCredentials();
  const serverProviders = configuredExternalAiProviders(serverCredentials);
  const requestedProvider = normalizeExternalAiProvider(agentAssist.provider);
  const requested = externalAiRequested(agentAssist);
  const keyOwner: ExternalAiKeyOwner = userProviders.length
    ? 'user-local'
    : requested && serverExternalAiKeyUseEnabled() && serverProviders.length
      ? 'server-approved'
      : 'none';
  const availableProviders = keyOwner === 'user-local'
    ? userProviders
    : keyOwner === 'server-approved'
      ? serverProviders
      : [];
  const effectiveExternalInference = requested
    && process.env['LEWORD_AGENT_EXTERNAL_INFERENCE'] !== '0'
    && !!requestedProvider
    && availableProviders.includes(requestedProvider);
  const fingerprintCredentials = keyOwner === 'user-local' ? credentials : serverCredentials;

  return {
    ...raw,
    agentAssist: {
      ...agentAssist,
      includeAiInference: effectiveExternalInference,
      forceExternalInference: effectiveExternalInference && agentAssist.forceExternalInference === true,
      externalAi: effectiveExternalInference && agentAssist.externalAi === true,
      externalAiKeyOwner: keyOwner,
      externalAiProviders: availableProviders,
      ...(requestedProvider ? { externalAiProvider: requestedProvider } : {}),
      ...(includeCredentialFingerprint ? {
        externalAiKeyFingerprint: fingerprintExternalAiCredentials(fingerprintCredentials),
      } : {}),
      externalAiServerKeyOptIn: keyOwner === 'server-approved',
    },
  };
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
  const {
    apiCredentials: _apiCredentials,
    externalAiKeyOwner: _rootExternalAiKeyOwner,
    externalAiKeyProviders: _rootExternalAiKeyProviders,
    externalAiProviders: _rootExternalAiProviders,
    externalAiProvider: _rootExternalAiProvider,
    externalAiKeyFingerprint: _rootExternalAiKeyFingerprint,
    externalAiServerKeyOptIn: _rootExternalAiServerKeyOptIn,
    externalInferencePolicy: _rootExternalInferencePolicy,
    ...rest
  } = raw;
  const publicParams = params && typeof params === 'object' && !Array.isArray(params)
    ? rest
    : { value: params };
  const marker = configuredKeys.length ? {
    mode: 'user-local',
    configuredKeys,
    fingerprint: fingerprintUserApiCredentials(credentials),
  } : undefined;
  const publicWithMarker = marker ? { ...publicParams, apiCredentials: marker } : publicParams;
  const executorWithCredentials = configuredKeys.length
    ? { ...publicParams, apiCredentials: credentials }
    : publicParams;
  const cacheWithMarker = marker ? { ...publicParams, apiCredentials: marker } : publicParams;

  return {
    publicParams: attachTrustedExternalAiPolicy(publicWithMarker, credentials, false),
    executorParams: attachTrustedExternalAiPolicy(executorWithCredentials, credentials, false),
    cacheParams: attachTrustedExternalAiPolicy(cacheWithMarker, credentials, true),
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
  const provider = normalizeExternalAiProvider(raw.externalAiProvider || raw.provider);
  const includeAiInference = raw.includeAiInference === true;
  const forceExternalInference = raw.forceExternalInference === true;
  const externalAi = raw.externalAi === true;
  const keyOwner: ExternalAiKeyOwner = raw.externalAiKeyOwner === 'user-local'
    || raw.externalAiKeyOwner === 'server-approved'
    ? raw.externalAiKeyOwner
    : 'none';
  const keyProviders = normalizeStringListParam(raw.externalAiProviders, 2)
    .filter((item): item is ExternalAiProvider => item === 'anthropic' || item === 'openai');
  const maxAgentRows = Math.max(1, Math.min(
    EXTERNAL_AI_MAX_ROWS,
    Number.isFinite(Number(raw.maxAgentRows)) ? Math.floor(Number(raw.maxAgentRows)) : EXTERNAL_AI_MAX_ROWS,
  ));
  const effectiveExternalInference = includeAiInference
    && (forceExternalInference || externalAi)
    && !!provider
    && keyOwner !== 'none'
    && keyProviders.includes(provider);
  const model = provider === 'anthropic'
    ? String(process.env['LEWORD_AGENT_CLAUDE_MODEL'] || 'claude-sonnet-4-6').trim()
    : provider === 'openai'
      ? String(process.env['LEWORD_AGENT_OPENAI_MODEL'] || 'gpt-4o-mini').trim()
      : 'none';
  return {
    enabled: true,
    version: String(raw.version || 'web-agent-assist-v1').replace(/\s+/g, ' ').trim(),
    mode: String(raw.mode || 'server-default-worker').replace(/\s+/g, ' ').trim(),
    featureId: String(raw.featureId || '').replace(/\s+/g, ' ').trim(),
    provider: provider || String(raw.provider || 'rule-assist').replace(/\s+/g, ' ').trim(),
    includeAiInference,
    forceExternalInference,
    externalAi,
    maxAgentRows,
    externalInferencePolicy: {
      mode: effectiveExternalInference
        ? keyOwner === 'server-approved' ? 'external-server-approved' : 'external-user-opt-in'
        : 'rule-only',
      provider: provider || 'none',
      maxRows: maxAgentRows,
      modelPolicy: {
        model,
        maxOutputTokens: EXTERNAL_AI_MAX_OUTPUT_TOKENS,
        crossProviderFallback: false,
      },
      keyOwnerScope: {
        owner: keyOwner,
        providers: keyProviders,
        fingerprint: typeof raw.externalAiKeyFingerprint === 'string'
          ? raw.externalAiKeyFingerprint
          : 'none',
      },
    },
    mindmapAssist: raw.mindmapAssist !== false,
    keywordResearchAssist: raw.keywordResearchAssist !== false,
    tasks: normalizeStringListParam(raw.tasks, 16),
    mission: String(raw.mission || '').replace(/\s+/g, ' ').trim() || undefined,
    mustFind: normalizeStringListParam(raw.mustFind, 16),
    rejectIf: normalizeStringListParam(raw.rejectIf, 16),
    rankingRubric: normalizeStringListParam(raw.rankingRubric, 16),
    researchChecklist: normalizeStringListParam(raw.researchChecklist, 16),
    hunterCharter: raw.hunterCharter && typeof raw.hunterCharter === 'object' && !Array.isArray(raw.hunterCharter)
      ? raw.hunterCharter
      : undefined,
    qualityGates: normalizeStringListParam(raw.qualityGates, 12),
    outputContract: raw.outputContract && typeof raw.outputContract === 'object' && !Array.isArray(raw.outputContract)
      ? raw.outputContract
      : undefined,
  };
}

function withAgentAssistCacheParams(
  raw: Record<string, unknown>,
  normalized: Record<string, unknown>,
): Record<string, unknown> {
  const agentAssist = normalizeAgentAssistCacheParam(raw.agentAssist);
  if (agentAssist) normalized.agentAssist = agentAssist;
  if ('includeAiInference' in raw) {
    normalized.includeAiInference = normalizeBooleanParam(raw.includeAiInference, false);
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
    includeAiInference: normalizeBooleanParam(raw.includeAiInference, false),
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
  const raw = params && typeof params === 'object' && !Array.isArray(params)
    ? params as Record<string, unknown>
    : {};
  const { agentAssist: _agentAssist, adminAiWorker: _adminAiWorker, ...rest } = raw;
  return withAgentAssistCacheParams(raw, rest);
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

export function serverDocumentCountBroadQueryKey(value: unknown): string {
  return normalizeNaverBlogBroadQuery(value).normalize('NFKC').toLowerCase();
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
    return hasFreshCanonicalDocumentCountMeasurement(metric)
      && isCanonicalLiveGoldenSearchVolumeMetric(metric);
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
    return hasFreshCanonicalDocumentCountMeasurement(metric)
      && isCanonicalLiveGoldenSearchVolumeMetric(metric);
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
    goldenRatio: typeof item.totalSearchVolume === 'number'
      && typeof item.documentCount === 'number'
      && item.documentCount > 0
      ? Number((item.totalSearchVolume / item.documentCount).toFixed(2))
      : item.goldenRatio,
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
    searchVolumeBindingVersion: item.searchVolumeBindingVersion,
    searchVolumeMeasuredAt: item.searchVolumeMeasuredAt,
    isSearchVolumeEstimated: item.isSearchVolumeEstimated,
    documentCountSource: item.documentCountSource,
    documentCountConfidence: item.documentCountConfidence,
    documentCountQueryMode: item.documentCountQueryMode,
    documentCountQueryKey: item.documentCountQueryKey,
    documentCountMeasuredAt: item.documentCountMeasuredAt,
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

function canonicalLiveGoldenSearchVolumeSplit(board: MobileKeywordMetric): {
  pc: number;
  mobile: number;
  total: number;
} | null {
  const boardPcSearchVolume = typeof board.pcSearchVolume === 'number'
    && Number.isFinite(board.pcSearchVolume)
    && board.pcSearchVolume >= 0
    ? board.pcSearchVolume
    : null;
  const boardMobileSearchVolume = typeof board.mobileSearchVolume === 'number'
    && Number.isFinite(board.mobileSearchVolume)
    && board.mobileSearchVolume >= 0
    ? board.mobileSearchVolume
    : null;
  if (
    boardPcSearchVolume === null
    || boardMobileSearchVolume === null
    || typeof board.totalSearchVolume !== 'number'
    || !Number.isFinite(board.totalSearchVolume)
    || board.totalSearchVolume <= 0
    || boardPcSearchVolume + boardMobileSearchVolume !== board.totalSearchVolume
  ) return null;
  return {
    pc: boardPcSearchVolume,
    mobile: boardMobileSearchVolume,
    total: board.totalSearchVolume,
  };
}

const LIVE_GOLDEN_SEARCH_VOLUME_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const LIVE_GOLDEN_SEARCH_VOLUME_MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

function canonicalLiveGoldenSearchVolumeMeasuredAtMs(
  board: MobileKeywordMetric,
  nowMs = Date.now(),
): number | null {
  const measuredAtMs = Date.parse(String(board.searchVolumeMeasuredAt || ''));
  if (!Number.isFinite(measuredAtMs)) return null;
  if (measuredAtMs > nowMs + LIVE_GOLDEN_SEARCH_VOLUME_MAX_FUTURE_SKEW_MS) return null;
  if (nowMs - measuredAtMs > LIVE_GOLDEN_SEARCH_VOLUME_MAX_AGE_MS) return null;
  return measuredAtMs;
}

function isCanonicalLiveGoldenSearchVolumeMetric(
  board: MobileKeywordMetric,
  nowMs = Date.now(),
): boolean {
  return canonicalLiveGoldenSearchVolumeSplit(board) !== null
    && board.searchVolumeSource === 'searchad'
    && board.searchVolumeConfidence === 'high'
    && board.searchVolumeBindingVersion === 'keyword-keyed-v2'
    && canonicalLiveGoldenSearchVolumeMeasuredAtMs(board, nowMs) !== null
    && board.isSearchVolumeEstimated === false;
}

function isCanonicalLiveGoldenDocumentMetric(
  board: MobileKeywordMetric,
  nowMs = Date.now(),
): boolean {
  return typeof board.documentCount === 'number'
    && Number.isFinite(board.documentCount)
    && board.documentCount > 0
    && board.documentCountSource === 'naver-api'
    && board.documentCountConfidence === 'high'
    && board.documentCountQueryMode === 'broad'
    && board.isDocumentCountEstimated === false
    && hasFreshCanonicalDocumentCountMeasurement(board, new Date(nowMs));
}

export function mergeCanonicalMetricWithLiveBoard(
  current: MobileKeywordMetric,
  board: MobileKeywordMetric,
  nowMs = Date.now(),
): MobileKeywordMetric {
  const boardSplit = canonicalLiveGoldenSearchVolumeSplit(board);
  const currentSearchMeasuredAtMs = isCanonicalLiveGoldenSearchVolumeMetric(current, nowMs)
    ? canonicalLiveGoldenSearchVolumeMeasuredAtMs(current, nowMs)
    : null;
  const boardSearchMeasuredAtMs = isCanonicalLiveGoldenSearchVolumeMetric(board, nowMs)
    ? canonicalLiveGoldenSearchVolumeMeasuredAtMs(board, nowMs)
    : null;
  const currentKeywordKey = compactServerKeyword(current.keyword);
  const boardKeywordKey = compactServerKeyword(board.keyword);
  const sameSearchAdKeyword = Boolean(currentKeywordKey)
    && currentKeywordKey === boardKeywordKey;
  const syncCanonicalSearchVolume = sameSearchAdKeyword
    && boardSplit !== null
    && boardSearchMeasuredAtMs !== null
    && (
      currentSearchMeasuredAtMs === null
      || boardSearchMeasuredAtMs > currentSearchMeasuredAtMs
    );

  const currentDocumentMeasuredAtMs = isCanonicalLiveGoldenDocumentMetric(current, nowMs)
    ? Date.parse(String(current.documentCountMeasuredAt))
    : null;
  const boardDocumentMeasuredAtMs = isCanonicalLiveGoldenDocumentMetric(board, nowMs)
    ? Date.parse(String(board.documentCountMeasuredAt))
    : null;
  const currentDocumentQueryKey = serverDocumentCountBroadQueryKey(current.keyword);
  const boardDocumentQueryKey = serverDocumentCountBroadQueryKey(board.keyword);
  const sameBroadDocumentQuery = Boolean(currentDocumentQueryKey)
    && currentDocumentQueryKey === boardDocumentQueryKey;
  const syncCanonicalDocuments = sameBroadDocumentQuery
    && boardDocumentMeasuredAtMs !== null
    && (
      currentDocumentMeasuredAtMs === null
      || boardDocumentMeasuredAtMs > currentDocumentMeasuredAtMs
    );

  const hasCanonicalCurrentSearchVolume = currentSearchMeasuredAtMs !== null;
  const hasCanonicalCurrentDocuments = currentDocumentMeasuredAtMs !== null;
  if (
    !syncCanonicalSearchVolume
    && !syncCanonicalDocuments
    && hasCanonicalCurrentSearchVolume
    && hasCanonicalCurrentDocuments
  ) return current;

  const mergedPcSearchVolume = syncCanonicalSearchVolume
    ? boardSplit!.pc
    : hasCanonicalCurrentSearchVolume ? current.pcSearchVolume : null;
  const mergedMobileSearchVolume = syncCanonicalSearchVolume
    ? boardSplit!.mobile
    : hasCanonicalCurrentSearchVolume ? current.mobileSearchVolume : null;
  const mergedTotalSearchVolume = syncCanonicalSearchVolume
    ? boardSplit!.total
    : hasCanonicalCurrentSearchVolume ? current.totalSearchVolume : null;
  const mergedDocumentCount = syncCanonicalDocuments
    ? board.documentCount
    : hasCanonicalCurrentDocuments ? current.documentCount : null;
  const hasCanonicalMergedSearchVolume = syncCanonicalSearchVolume
    || hasCanonicalCurrentSearchVolume;
  const hasCanonicalMergedDocuments = syncCanonicalDocuments
    || hasCanonicalCurrentDocuments;
  const hasCanonicalMergedMetrics = hasCanonicalMergedSearchVolume
    && hasCanonicalMergedDocuments;
  const mergedGoldenRatio = hasCanonicalMergedMetrics
    && typeof mergedTotalSearchVolume === 'number'
    && Number.isFinite(mergedTotalSearchVolume)
    && mergedTotalSearchVolume > 0
    && typeof mergedDocumentCount === 'number'
    && Number.isFinite(mergedDocumentCount)
    && mergedDocumentCount > 0
    ? Number((mergedTotalSearchVolume / mergedDocumentCount).toFixed(2))
    : null;
  const bothDimensionsFromBoard = syncCanonicalSearchVolume && syncCanonicalDocuments;
  const metricsOnlyGrade = classifyGradeByMetrics(
    typeof mergedTotalSearchVolume === 'number' ? mergedTotalSearchVolume : 0,
    typeof mergedDocumentCount === 'number' ? mergedDocumentCount : 0,
    typeof mergedGoldenRatio === 'number' ? mergedGoldenRatio : 0,
  );
  const mergedGrade = bothDimensionsFromBoard
    ? board.grade
    : metricsOnlyGrade === 'D' ? 'C' : metricsOnlyGrade;
  const mergedScore = bothDimensionsFromBoard
    && typeof board.score === 'number'
    && Number.isFinite(board.score)
    ? board.score
    : null;
  const numberLabel = (value: number | null): string => (
    typeof value === 'number' && Number.isFinite(value)
      ? value.toLocaleString('en-US', { maximumFractionDigits: 2 })
      : '-'
  );
  const trustedInsightPcSearchVolume = hasCanonicalMergedSearchVolume
    ? mergedPcSearchVolume
    : null;
  const trustedInsightMobileSearchVolume = hasCanonicalMergedSearchVolume
    ? mergedMobileSearchVolume
    : null;
  const trustedInsightTotalSearchVolume = hasCanonicalMergedSearchVolume
    ? mergedTotalSearchVolume
    : null;
  const trustedInsightDocumentCount = hasCanonicalMergedDocuments
    ? mergedDocumentCount
    : null;
  const searchVolumeSourceSummary = hasCanonicalMergedSearchVolume
    ? syncCanonicalSearchVolume
      ? 'LIVE 황금키워드 보드 최신 SearchAd 월간 검색량'
      : '현재 분석 SearchAd 월간 검색량'
    : '검색량 신뢰 증명 없음';
  const documentCountSourceSummary = hasCanonicalMergedDocuments
    ? syncCanonicalDocuments
      ? 'LIVE 황금키워드 보드 최신 네이버 broad OpenAPI 문서수'
      : `현재 분석 ${current.documentCountQueryMode || 'unknown'} 문서수`
    : '문서수 신뢰 증명 없음';
  const agentInsight = current.agentInsight
    ? {
        ...current.agentInsight,
        searchVolumeReason: `최신 신뢰 측정 기준 월간 검색량 ${numberLabel(trustedInsightTotalSearchVolume)} (PC ${numberLabel(trustedInsightPcSearchVolume)} / 모바일 ${numberLabel(trustedInsightMobileSearchVolume)}), 문서수 ${numberLabel(trustedInsightDocumentCount)}, 비율 ${numberLabel(mergedGoldenRatio)}입니다.`,
        sourceSummary: `${searchVolumeSourceSummary} · ${documentCountSourceSummary}`,
      }
    : undefined;
  let evidence = syncCanonicalSearchVolume && syncCanonicalDocuments
    ? uniqueEvidence(board.evidence, current.evidence, 'analysis-board-metric-sync')
    : syncCanonicalSearchVolume
      ? uniqueEvidence(current.evidence, 'analysis-board-search-volume-sync')
      : syncCanonicalDocuments
        ? uniqueEvidence(current.evidence, 'analysis-board-document-count-sync')
        : uniqueEvidence(current.evidence);
  if (!hasCanonicalMergedSearchVolume) {
    evidence = uniqueEvidence(evidence, 'analysis-untrusted-search-volume-cleared');
  }
  if (!hasCanonicalMergedDocuments) {
    evidence = uniqueEvidence(evidence, 'analysis-untrusted-document-count-cleared');
  }
  const mergedSearchProvenance = syncCanonicalSearchVolume ? board : current;
  const mergedDocumentProvenance = syncCanonicalDocuments ? board : current;
  return {
    ...current,
    grade: mergedGrade,
    score: mergedScore,
    pcSearchVolume: mergedPcSearchVolume,
    mobileSearchVolume: mergedMobileSearchVolume,
    totalSearchVolume: mergedTotalSearchVolume,
    documentCount: mergedDocumentCount,
    goldenRatio: mergedGoldenRatio,
    cpc: hasCanonicalMergedSearchVolume
      ? syncCanonicalSearchVolume ? (board.cpc ?? current.cpc) : current.cpc
      : null,
    evidence,
    isMeasured: hasCanonicalMergedMetrics,
    searchVolumeSource: hasCanonicalMergedSearchVolume
      ? mergedSearchProvenance.searchVolumeSource
      : 'none',
    searchVolumeConfidence: hasCanonicalMergedSearchVolume
      ? mergedSearchProvenance.searchVolumeConfidence
      : undefined,
    searchVolumeBindingVersion: hasCanonicalMergedSearchVolume
      ? mergedSearchProvenance.searchVolumeBindingVersion
      : undefined,
    searchVolumeMeasuredAt: hasCanonicalMergedSearchVolume
      ? mergedSearchProvenance.searchVolumeMeasuredAt
      : undefined,
    isSearchVolumeEstimated: hasCanonicalMergedSearchVolume
      ? mergedSearchProvenance.isSearchVolumeEstimated
      : undefined,
    documentCountSource: hasCanonicalMergedDocuments
      ? mergedDocumentProvenance.documentCountSource
      : 'none',
    documentCountConfidence: hasCanonicalMergedDocuments
      ? mergedDocumentProvenance.documentCountConfidence
      : undefined,
    documentCountQueryMode: hasCanonicalMergedDocuments
      ? mergedDocumentProvenance.documentCountQueryMode
      : undefined,
    documentCountQueryKey: hasCanonicalMergedDocuments
      ? mergedDocumentProvenance.documentCountQueryKey
      : undefined,
    documentCountMeasuredAt: hasCanonicalMergedDocuments
      ? mergedDocumentProvenance.documentCountMeasuredAt
      : undefined,
    isDocumentCountEstimated: hasCanonicalMergedDocuments
      ? mergedDocumentProvenance.isDocumentCountEstimated
      : undefined,
    measurementStatus: undefined,
    aiJudge: undefined,
    rejectReason: undefined,
    agentInsight,
  };
}

function bindKeywordAnalysisMetricToRequestedSeed(
  metric: MobileKeywordMetric,
  seed: string,
): MobileKeywordMetric {
  if (
    serverDocumentCountBroadQueryKey(metric.keyword)
    === serverDocumentCountBroadQueryKey(seed)
  ) {
    return { ...metric, keyword: seed };
  }
  // SearchAd volume is compact-keyword bound, but Naver Blog broad document
  // counts are exact-query bound. Renaming a spacing alias must never relabel
  // that alias's document measurement as the requested query's measurement.
  return {
    ...metric,
    keyword: seed,
    grade: 'C',
    score: null,
    documentCount: null,
    goldenRatio: null,
    documentCountSource: 'none',
    documentCountConfidence: 'low',
    documentCountQueryMode: undefined,
    documentCountQueryKey: undefined,
    documentCountMeasuredAt: undefined,
    isDocumentCountEstimated: undefined,
    isMeasured: false,
    evidence: uniqueEvidence('analysis-compact-search-volume-alias'),
    measurementStatus: undefined,
    aiJudge: undefined,
    rejectReason: undefined,
    agentInsight: undefined,
  };
}

function overlayLiveGoldenCanonicalKeyword(
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
  const boardItems = liveGoldenRadar.findMeasuredBoardItems(seed);
  if (!boardItems.length) return result;

  const canonicalMetrics = boardItems.map(metricFromLiveGoldenBoardItem);
  const seedBroadQueryKey = serverDocumentCountBroadQueryKey(seed);
  const exactDocumentMetric = canonicalMetrics
    .filter((metric) => (
      serverDocumentCountBroadQueryKey(metric.keyword) === seedBroadQueryKey
      && isCanonicalLiveGoldenDocumentMetric(metric)
    ))
    .sort((left, right) => (
      Date.parse(String(right.documentCountMeasuredAt || ''))
      - Date.parse(String(left.documentCountMeasuredAt || ''))
    ))[0];
  const hasCanonicalSearchCandidate = canonicalMetrics.some((metric) => (
    isCanonicalLiveGoldenSearchVolumeMetric(metric)
  ));
  const requestedMetric = result.keywords.find((metric) => (
    compactServerKeyword(metric.keyword) === seedKey
    && serverDocumentCountBroadQueryKey(metric.keyword) === seedBroadQueryKey
  )) || result.keywords.find((metric) => compactServerKeyword(metric.keyword) === seedKey);

  let canonicalSeedMetric: MobileKeywordMetric | null = null;
  if (requestedMetric) {
    canonicalSeedMetric = canonicalMetrics.reduce(
      (merged, boardMetric) => mergeCanonicalMetricWithLiveBoard(merged, boardMetric),
      bindKeywordAnalysisMetricToRequestedSeed(requestedMetric, seed),
    );
  } else if (exactDocumentMetric && hasCanonicalSearchCandidate) {
    canonicalSeedMetric = canonicalMetrics.reduce(
      (merged, boardMetric) => mergeCanonicalMetricWithLiveBoard(merged, boardMetric),
      { ...exactDocumentMetric, keyword: seed },
    );
    canonicalSeedMetric = {
      ...canonicalSeedMetric,
      evidence: uniqueEvidence(canonicalSeedMetric.evidence, 'analysis-board-metric-sync'),
    };
  }

  const mergedKeywords: MobileKeywordMetric[] = canonicalSeedMetric
    ? [
        canonicalSeedMetric,
        ...result.keywords.filter((metric) => compactServerKeyword(metric.keyword) !== seedKey),
      ]
    : [...result.keywords];

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
        overlayLiveGoldenCanonicalKeyword(endpoint, splitParams.executorParams, cachedResult, liveGoldenRadar),
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
          overlayLiveGoldenCanonicalKeyword(endpoint, splitParams.executorParams, result, liveGoldenRadar),
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

const LIVE_GOLDEN_REVIEW_STORAGE_MAX_BYTES = 512 * 1024;
const LIVE_GOLDEN_FAILED_REVIEW_AUDIT_SCHEMA_VERSION = 'live-golden-failed-review-audit-v1' as const;
const LIVE_GOLDEN_REVIEW_LOCK_STALE_MS = 2 * 60 * 1000;
const LIVE_GOLDEN_REVIEW_LOCK_HEARTBEAT_MS = 30 * 1000;
const LIVE_GOLDEN_REVIEW_LOCK_TIMEOUT_MS = 15 * 1000;
const LIVE_GOLDEN_REVIEW_LOCK_RETRY_MS = 15;

class LiveGoldenReviewStorageError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'LiveGoldenReviewStorageError';
  }
}

class LiveGoldenReviewConflictError extends Error {
  constructor(readonly code = 'live-golden-review-revision-conflict') {
    super(code);
    this.name = 'LiveGoldenReviewConflictError';
  }
}

interface LiveGoldenReviewLockOwner {
  schemaVersion: 'live-golden-review-lock-v1';
  token: string;
  pid: number;
  createdAtMs: number;
}

function sleepWithoutBlocking(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fsyncDirectoryBestEffort(directory: string): void {
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(directory, fs.constants.O_RDONLY);
    fs.fsyncSync(descriptor);
  } catch (error) {
    const code = String((error as NodeJS.ErrnoException)?.code || '');
    if (!['EINVAL', 'EPERM', 'EISDIR', 'ENOTSUP'].includes(code)) throw error;
  } finally {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch {}
    }
  }
}

function readLiveGoldenReviewLockOwner(lockDirectory: string): LiveGoldenReviewLockOwner | undefined {
  const ownerFile = path.join(lockDirectory, 'owner.json');
  try {
    const lockStat = fs.lstatSync(lockDirectory);
    if (lockStat.isSymbolicLink() || !lockStat.isDirectory()) {
      throw new LiveGoldenReviewStorageError('live-golden-review-lock-invalid');
    }
    const ownerStat = fs.lstatSync(ownerFile);
    if (ownerStat.isSymbolicLink() || !ownerStat.isFile() || ownerStat.size > 4096) {
      throw new LiveGoldenReviewStorageError('live-golden-review-lock-invalid');
    }
    const parsed = JSON.parse(fs.readFileSync(ownerFile, 'utf8')) as Partial<LiveGoldenReviewLockOwner>;
    if (
      parsed.schemaVersion !== 'live-golden-review-lock-v1'
      || typeof parsed.token !== 'string'
      || !/^[a-f0-9]{32}$/.test(parsed.token)
      || !Number.isInteger(parsed.pid)
      || Number(parsed.pid) <= 0
      || !Number.isFinite(parsed.createdAtMs)
    ) return undefined;
    return parsed as LiveGoldenReviewLockOwner;
  } catch (error) {
    if (error instanceof LiveGoldenReviewStorageError) throw error;
    const code = String((error as NodeJS.ErrnoException)?.code || '');
    if (code === 'ENOENT' || error instanceof SyntaxError) return undefined;
    throw new LiveGoldenReviewStorageError('live-golden-review-lock-invalid');
  }
}

function removeStaleLiveGoldenReviewLock(lockDirectory: string): boolean {
  let lockStat: fs.Stats;
  try {
    lockStat = fs.lstatSync(lockDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return true;
    throw new LiveGoldenReviewStorageError('live-golden-review-lock-invalid');
  }
  if (lockStat.isSymbolicLink() || !lockStat.isDirectory()) {
    throw new LiveGoldenReviewStorageError('live-golden-review-lock-invalid');
  }
  const owner = readLiveGoldenReviewLockOwner(lockDirectory);
  const freshnessMs = Math.max(lockStat.mtimeMs, owner?.createdAtMs || 0);
  if (Date.now() - freshnessMs <= LIVE_GOLDEN_REVIEW_LOCK_STALE_MS) return false;
  // A timed-out holder may merely be paused and can resume at any instruction.
  // Automatically replacing its lease would require a true filesystem fencing
  // primitive on every cohort/certificate write. Preserve the evidence and fail
  // closed so an operator can first prove the old process is permanently gone.
  throw new LiveGoldenReviewStorageError(
    'live-golden-review-lock-stale-manual-recovery-required',
  );
}

async function acquireLiveGoldenReviewFileLock(
  lockDirectory: string,
  storageRoot?: string,
): Promise<() => void> {
  const resolved = storageRoot
    ? assertSafeLiveGoldenReviewStoragePath(lockDirectory, storageRoot)
    : path.resolve(lockDirectory);
  if (storageRoot) {
    ensureLiveGoldenReviewStorageDirectory(path.dirname(resolved), storageRoot);
  } else {
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
  }
  const owner: LiveGoldenReviewLockOwner = {
    schemaVersion: 'live-golden-review-lock-v1',
    token: crypto.randomBytes(16).toString('hex'),
    pid: process.pid,
    createdAtMs: Date.now(),
  };
  const deadline = Date.now() + LIVE_GOLDEN_REVIEW_LOCK_TIMEOUT_MS;
  while (true) {
    try {
      fs.mkdirSync(resolved, { mode: 0o700 });
      const ownerFile = path.join(resolved, 'owner.json');
      let descriptor: number | undefined;
      try {
        descriptor = fs.openSync(ownerFile, 'wx', 0o600);
        fs.writeFileSync(descriptor, `${JSON.stringify(owner)}\n`, 'utf8');
        fs.fsyncSync(descriptor);
        fs.closeSync(descriptor);
        descriptor = undefined;
        fsyncDirectoryBestEffort(resolved);
        fsyncDirectoryBestEffort(path.dirname(resolved));
      } catch (error) {
        if (descriptor !== undefined) {
          try { fs.closeSync(descriptor); } catch {}
        }
        try { if (fs.existsSync(ownerFile)) fs.unlinkSync(ownerFile); } catch {}
        try { fs.rmdirSync(resolved); } catch {}
        throw error;
      }

      const heartbeat = setInterval(() => {
        try {
          const current = readLiveGoldenReviewLockOwner(resolved);
          if (current?.token !== owner.token) return;
          const now = new Date();
          fs.utimesSync(resolved, now, now);
        } catch {}
      }, LIVE_GOLDEN_REVIEW_LOCK_HEARTBEAT_MS);
      heartbeat.unref?.();

      return () => {
        clearInterval(heartbeat);
        const current = readLiveGoldenReviewLockOwner(resolved);
        if (!current || current.token !== owner.token) {
          throw new LiveGoldenReviewStorageError('live-golden-review-lock-ownership-lost');
        }
        fs.unlinkSync(path.join(resolved, 'owner.json'));
        fs.rmdirSync(resolved);
        fsyncDirectoryBestEffort(path.dirname(resolved));
      };
    } catch (error) {
      const code = String((error as NodeJS.ErrnoException)?.code || '');
      if (error instanceof LiveGoldenReviewStorageError) throw error;
      if (code !== 'EEXIST') {
        throw new LiveGoldenReviewStorageError('live-golden-review-lock-invalid');
      }
      removeStaleLiveGoldenReviewLock(resolved);
      if (Date.now() >= deadline) {
        throw new LiveGoldenReviewStorageError('live-golden-review-lock-timeout');
      }
      await sleepWithoutBlocking(LIVE_GOLDEN_REVIEW_LOCK_RETRY_MS);
    }
  }
}

function createLiveGoldenReviewTransactionMutex(
  lockDirectory?: string,
  storageRoot?: string,
): <T>(
  operation: () => Promise<T>,
) => Promise<T> {
  let tail = Promise.resolve();
  return async <T>(operation: () => Promise<T>): Promise<T> => {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    let releaseFileLock: (() => void) | undefined;
    try {
      if (lockDirectory) {
        releaseFileLock = await acquireLiveGoldenReviewFileLock(lockDirectory, storageRoot);
      }
      return await operation();
    } finally {
      try {
        releaseFileLock?.();
      } finally {
        release();
      }
    }
  };
}

interface LiveGoldenPhase2EntrySnapshot {
  state: Exclude<LiveGoldenReviewCohortState, 'review-target-frozen'>;
  certificateIssued: boolean;
  cohortVerifiedCount: number;
  currentMeasuredCohortCount: number;
  pendingCandidateCount: number;
  missingCohortRowCount: number;
  reviewedCount: number;
  precision: number;
  reason?: string;
}

interface ResolvedLiveGoldenReviewState {
  cohort?: PersistedLiveGoldenReviewCohort;
  certificate?: LiveGoldenPhase2EntryCertificate;
  reviewSummary?: LiveGoldenBlindReviewSummary;
  reviewRows: MobileLiveGoldenBoardItem[];
  exactBinding: boolean;
  phase2Entry: LiveGoldenPhase2EntrySnapshot;
}

interface LiveGoldenFailedReviewAuditArtifact {
  schemaVersion: typeof LIVE_GOLDEN_FAILED_REVIEW_AUDIT_SCHEMA_VERSION;
  artifactDigest: string;
  archivedAt: string;
  failedCohortId: string;
  failedCohortDigest: string;
  failedCohort: PersistedLiveGoldenReviewCohort;
}

function liveGoldenFailedReviewAuditArtifactDigest(input: {
  archivedAt: string;
  failedCohortId: string;
  failedCohortDigest: string;
}): string {
  return crypto.createHash('sha256').update(JSON.stringify({
    schemaVersion: LIVE_GOLDEN_FAILED_REVIEW_AUDIT_SCHEMA_VERSION,
    archivedAt: input.archivedAt,
    failedCohortId: input.failedCohortId,
    failedCohortDigest: input.failedCohortDigest,
  })).digest('hex');
}

function normalizedReviewStoragePath(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isPathInsideReviewStorageRoot(storageRoot: string, candidate: string): boolean {
  const root = normalizedReviewStoragePath(storageRoot);
  const target = normalizedReviewStoragePath(candidate);
  const relative = path.relative(root, target);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..'
    && !relative.startsWith(`..${path.sep}`));
}

function assertDirectoryTreeWithoutSymlinks(
  directory: string,
  options: { create: boolean },
): void {
  const resolved = path.resolve(directory);
  const parsed = path.parse(resolved);
  let current = parsed.root;
  const parts = path.relative(parsed.root, resolved).split(path.sep).filter(Boolean);
  for (const part of parts) {
    current = path.join(current, part);
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      const code = String((error as NodeJS.ErrnoException)?.code || '');
      if (
        process.platform === 'win32'
        && ['EPERM', 'EACCES'].includes(code)
        && normalizedReviewStoragePath(current) !== normalizedReviewStoragePath(resolved)
      ) {
        // Some Windows sandbox profiles deny metadata reads on the user-profile
        // ancestor while allowing the configured descendant. The fixed root and
        // every component beneath it are still checked without this exception.
        continue;
      }
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT' || !options.create) {
        throw new LiveGoldenReviewStorageError('live-golden-review-storage-path-invalid');
      }
      try {
        fs.mkdirSync(current, { mode: 0o700 });
        stat = fs.lstatSync(current);
      } catch (mkdirError) {
        if ((mkdirError as NodeJS.ErrnoException)?.code !== 'EEXIST') {
          throw new LiveGoldenReviewStorageError('live-golden-review-storage-path-invalid');
        }
        stat = fs.lstatSync(current);
      }
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new LiveGoldenReviewStorageError('live-golden-review-storage-path-invalid');
    }
  }
}

function initializeLiveGoldenReviewStorageRoot(
  cohortFile: string,
  certificateFile: string,
): string {
  const cohortParent = path.dirname(path.resolve(cohortFile));
  const certificateParent = path.dirname(path.resolve(certificateFile));
  if (normalizedReviewStoragePath(cohortParent) !== normalizedReviewStoragePath(certificateParent)) {
    throw new LiveGoldenReviewStorageError('live-golden-review-storage-root-mismatch');
  }
  assertDirectoryTreeWithoutSymlinks(cohortParent, { create: true });
  let realParent: string;
  try {
    realParent = fs.realpathSync(cohortParent);
  } catch (error) {
    const code = String((error as NodeJS.ErrnoException)?.code || '');
    if (process.platform !== 'win32' || !['EPERM', 'EACCES'].includes(code)) {
      throw new LiveGoldenReviewStorageError('live-golden-review-storage-path-invalid');
    }
    realParent = cohortParent;
  }
  if (normalizedReviewStoragePath(realParent) !== normalizedReviewStoragePath(cohortParent)) {
    throw new LiveGoldenReviewStorageError('live-golden-review-storage-path-invalid');
  }
  return cohortParent;
}

function assertSafeLiveGoldenReviewStoragePath(
  filePath: string,
  storageRoot: string,
): string {
  const resolvedRoot = path.resolve(storageRoot);
  const resolved = path.resolve(filePath);
  if (!isPathInsideReviewStorageRoot(resolvedRoot, resolved)) {
    throw new LiveGoldenReviewStorageError('live-golden-review-storage-path-invalid');
  }
  assertDirectoryTreeWithoutSymlinks(resolvedRoot, { create: false });
  try {
    if (normalizedReviewStoragePath(fs.realpathSync(resolvedRoot)) !== normalizedReviewStoragePath(resolvedRoot)) {
      throw new LiveGoldenReviewStorageError('live-golden-review-storage-path-invalid');
    }
  } catch (error) {
    if (error instanceof LiveGoldenReviewStorageError) throw error;
    const code = String((error as NodeJS.ErrnoException)?.code || '');
    if (process.platform !== 'win32' || !['EPERM', 'EACCES'].includes(code)) {
      throw new LiveGoldenReviewStorageError('live-golden-review-storage-path-invalid');
    }
  }

  let current = resolvedRoot;
  const parts = path.relative(resolvedRoot, resolved).split(path.sep).filter(Boolean);
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    try {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink() || (index < parts.length - 1 && !stat.isDirectory())) {
        throw new LiveGoldenReviewStorageError('live-golden-review-storage-path-invalid');
      }
    } catch (error) {
      if (error instanceof LiveGoldenReviewStorageError) throw error;
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') break;
      throw new LiveGoldenReviewStorageError('live-golden-review-storage-path-invalid');
    }
  }
  return resolved;
}

function canAccessLiveGoldenReviewStorage(
  storageRoot: string,
  cohortFile: string,
  certificateFile: string,
  mode: number,
): boolean {
  try {
    const resolvedRoot = assertSafeLiveGoldenReviewStoragePath(storageRoot, storageRoot);
    const rootStat = fs.lstatSync(resolvedRoot);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) return false;
    for (const artifact of [cohortFile, certificateFile]) {
      const resolvedArtifact = assertSafeLiveGoldenReviewStoragePath(artifact, resolvedRoot);
      try {
        const artifactStat = fs.lstatSync(resolvedArtifact);
        if (artifactStat.isSymbolicLink() || !artifactStat.isFile()) return false;
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') return false;
      }
    }
    fs.accessSync(resolvedRoot, mode | fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function ensureLiveGoldenReviewStorageDirectory(directory: string, storageRoot: string): void {
  const resolved = assertSafeLiveGoldenReviewStoragePath(directory, storageRoot);
  assertDirectoryTreeWithoutSymlinks(resolved, { create: true });
  try {
    if (!isPathInsideReviewStorageRoot(storageRoot, fs.realpathSync(resolved))) {
      throw new LiveGoldenReviewStorageError('live-golden-review-storage-path-invalid');
    }
  } catch (error) {
    if (error instanceof LiveGoldenReviewStorageError) throw error;
    const code = String((error as NodeJS.ErrnoException)?.code || '');
    if (process.platform !== 'win32' || !['EPERM', 'EACCES'].includes(code)) {
      throw new LiveGoldenReviewStorageError('live-golden-review-storage-path-invalid');
    }
  }
}

function sameStableFileIdentity(left: fs.Stats, right: fs.Stats): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

function readStableLiveGoldenReviewBytes(
  filePath: string,
  invalidCode: string,
  storageRoot: string,
): Buffer | undefined {
  const resolved = assertSafeLiveGoldenReviewStoragePath(filePath, storageRoot);
  let pathStat: fs.Stats;
  try {
    pathStat = fs.lstatSync(resolved);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return undefined;
    throw new LiveGoldenReviewStorageError(invalidCode);
  }
  if (
    pathStat.isSymbolicLink()
    || !pathStat.isFile()
    || pathStat.size > LIVE_GOLDEN_REVIEW_STORAGE_MAX_BYTES
  ) throw new LiveGoldenReviewStorageError(invalidCode);

  let descriptor: number | undefined;
  try {
    const noFollow = Number((fs.constants as Record<string, number>)['O_NOFOLLOW'] || 0);
    descriptor = fs.openSync(resolved, fs.constants.O_RDONLY | noFollow);
    const descriptorBefore = fs.fstatSync(descriptor);
    if (!descriptorBefore.isFile() || descriptorBefore.size > LIVE_GOLDEN_REVIEW_STORAGE_MAX_BYTES) {
      throw new LiveGoldenReviewStorageError(invalidCode);
    }
    const bytes = Buffer.alloc(descriptorBefore.size);
    let offset = 0;
    while (offset < bytes.length) {
      const bytesRead = fs.readSync(descriptor, bytes, offset, bytes.length - offset, offset);
      if (bytesRead <= 0) throw new LiveGoldenReviewStorageError(invalidCode);
      offset += bytesRead;
    }
    const descriptorAfter = fs.fstatSync(descriptor);
    let pathAfter: fs.Stats;
    try {
      pathAfter = fs.lstatSync(resolved);
    } catch {
      throw new LiveGoldenReviewStorageError('live-golden-review-storage-race-detected');
    }
    if (
      pathAfter.isSymbolicLink()
      || !pathAfter.isFile()
      || !sameStableFileIdentity(descriptorBefore, descriptorAfter)
      || !sameStableFileIdentity(descriptorAfter, pathAfter)
    ) {
      throw new LiveGoldenReviewStorageError('live-golden-review-storage-race-detected');
    }
    return bytes;
  } catch (error) {
    if (error instanceof LiveGoldenReviewStorageError) throw error;
    throw new LiveGoldenReviewStorageError(invalidCode);
  } finally {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch {}
    }
  }
}

function readOptionalJsonFile(
  filePath: string,
  invalidCode: string,
  storageRoot: string,
): unknown | undefined {
  const bytes = readStableLiveGoldenReviewBytes(filePath, invalidCode, storageRoot);
  if (bytes === undefined) return undefined;
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    if (error instanceof LiveGoldenReviewStorageError) throw error;
    throw new LiveGoldenReviewStorageError(invalidCode);
  }
}

function liveGoldenFileRevision(filePath: string, storageRoot: string): string {
  const bytes = readStableLiveGoldenReviewBytes(
    filePath,
    'live-golden-review-storage-invalid',
    storageRoot,
  );
  return bytes === undefined
    ? 'missing'
    : `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function atomicWriteLiveGoldenJson(
  filePath: string,
  value: unknown,
  expectedRevision: string | undefined,
  storageRoot: string,
): void {
  const resolved = assertSafeLiveGoldenReviewStoragePath(filePath, storageRoot);
  ensureLiveGoldenReviewStorageDirectory(path.dirname(resolved), storageRoot);
  const temporary = `${resolved}.${process.pid}.${Date.now()}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(serialized, 'utf8') > LIVE_GOLDEN_REVIEW_STORAGE_MAX_BYTES) {
    throw new LiveGoldenReviewStorageError('live-golden-review-storage-too-large');
  }
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(descriptor, serialized, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    if (
      expectedRevision !== undefined
      && liveGoldenFileRevision(resolved, storageRoot) !== expectedRevision
    ) {
      throw new LiveGoldenReviewConflictError();
    }
    assertSafeLiveGoldenReviewStoragePath(resolved, storageRoot);
    assertSafeLiveGoldenReviewStoragePath(temporary, storageRoot);
    fs.renameSync(temporary, resolved);
    const persisted = readStableLiveGoldenReviewBytes(
      resolved,
      'live-golden-review-storage-invalid',
      storageRoot,
    );
    if (
      !persisted
      || crypto.createHash('sha256').update(persisted).digest('hex')
        !== crypto.createHash('sha256').update(serialized).digest('hex')
    ) throw new LiveGoldenReviewStorageError('live-golden-review-storage-race-detected');
    fsyncDirectoryBestEffort(path.dirname(resolved));
  } catch (error) {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch {}
    }
    try {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    } catch {}
    throw error;
  }
}

function readLiveGoldenReviewCohortFile(
  filePath: string,
  storageRoot: string,
): PersistedLiveGoldenReviewCohort | undefined {
  const raw = readOptionalJsonFile(
    filePath,
    'live-golden-review-cohort-storage-invalid',
    storageRoot,
  );
  if (raw === undefined) return undefined;
  const parsed = parseLiveGoldenReviewCohort(raw);
  if (!parsed) throw new LiveGoldenReviewStorageError('live-golden-review-cohort-storage-invalid');
  return parsed;
}

function readLiveGoldenPhase2CertificateFile(
  filePath: string,
  cohort: PersistedLiveGoldenReviewCohort,
  storageRoot: string,
): LiveGoldenPhase2EntryCertificate | undefined {
  const raw = readOptionalJsonFile(
    filePath,
    'live-golden-phase2-certificate-storage-invalid',
    storageRoot,
  );
  if (raw === undefined) return undefined;
  const parsed = parseLiveGoldenPhase2EntryCertificate(raw, cohort);
  if (!parsed) throw new LiveGoldenReviewStorageError('live-golden-phase2-certificate-storage-invalid');
  return parsed;
}

function liveGoldenFailedCohortDigest(cohort: PersistedLiveGoldenReviewCohort): string {
  const decisions = Object.entries(cohort.decisions || {})
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([semanticHash, decision]) => ({ semanticHash, decision }));
  return crypto.createHash('sha256').update(JSON.stringify({
    schemaVersion: cohort.schemaVersion,
    fingerprintVersion: cohort.fingerprintVersion,
    cohortId: cohort.cohortId,
    state: cohort.state,
    automatedSupplyGate: cohort.automatedSupplyGate,
    boardFingerprint: cohort.boardFingerprint,
    frozenAt: cohort.frozenAt,
    updatedAt: cohort.updatedAt,
    members: [...cohort.members].sort((left, right) => (
      left.semanticHash < right.semanticHash ? -1 : left.semanticHash > right.semanticHash ? 1 : 0
    )),
    decisions,
    pendingCandidates: [...cohort.pendingCandidates].sort((left, right) => (
      left.semanticHash < right.semanticHash ? -1 : left.semanticHash > right.semanticHash ? 1 : 0
    )),
    missingSemanticHashes: [...cohort.missingSemanticHashes].sort(),
  })).digest('hex');
}

function failedReviewAuditFile(cohortFile: string, cohortId: string): string {
  if (!/^cohort_[a-f0-9]{32}$/.test(cohortId)) {
    throw new LiveGoldenReviewStorageError('live-golden-failed-review-audit-id-invalid');
  }
  return path.join(`${path.resolve(cohortFile)}.audit`, `${cohortId}.json`);
}

function parseLiveGoldenFailedReviewAuditArtifact(
  value: unknown,
): LiveGoldenFailedReviewAuditArtifact | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const input = value as Partial<LiveGoldenFailedReviewAuditArtifact>;
  if (input.schemaVersion !== LIVE_GOLDEN_FAILED_REVIEW_AUDIT_SCHEMA_VERSION) return undefined;
  if (typeof input.artifactDigest !== 'string' || !/^[a-f0-9]{64}$/.test(input.artifactDigest)) {
    return undefined;
  }
  if (typeof input.archivedAt !== 'string' || !Number.isFinite(Date.parse(input.archivedAt))) {
    return undefined;
  }
  if (
    typeof input.failedCohortId !== 'string'
    || !/^cohort_[a-f0-9]{32}$/.test(input.failedCohortId)
  ) return undefined;
  if (typeof input.failedCohortDigest !== 'string' || !/^[a-f0-9]{64}$/.test(input.failedCohortDigest)) {
    return undefined;
  }
  if (input.artifactDigest !== liveGoldenFailedReviewAuditArtifactDigest({
    archivedAt: input.archivedAt,
    failedCohortId: input.failedCohortId,
    failedCohortDigest: input.failedCohortDigest,
  })) return undefined;
  const failedCohort = parseLiveGoldenReviewCohort(input.failedCohort);
  if (
    !failedCohort
    || failedCohort.state !== 'human-review-failed'
    || failedCohort.cohortId !== input.failedCohortId
    || liveGoldenFailedCohortDigest(failedCohort) !== input.failedCohortDigest
  ) return undefined;
  return {
    schemaVersion: LIVE_GOLDEN_FAILED_REVIEW_AUDIT_SCHEMA_VERSION,
    artifactDigest: input.artifactDigest,
    archivedAt: input.archivedAt,
    failedCohortId: failedCohort.cohortId,
    failedCohortDigest: input.failedCohortDigest,
    failedCohort,
  };
}

function assertMatchingFailedReviewAudit(
  artifact: LiveGoldenFailedReviewAuditArtifact | undefined,
  failedCohort: PersistedLiveGoldenReviewCohort,
): void {
  if (
    !artifact
    || artifact.failedCohortId !== failedCohort.cohortId
    || artifact.failedCohortDigest !== liveGoldenFailedCohortDigest(failedCohort)
  ) {
    throw new LiveGoldenReviewStorageError('live-golden-failed-review-audit-conflict');
  }
}

function preserveFailedReviewAudit(
  cohortFile: string,
  failedCohort: PersistedLiveGoldenReviewCohort,
  storageRoot: string,
): void {
  const auditFile = failedReviewAuditFile(cohortFile, failedCohort.cohortId);
  if (fs.existsSync(auditFile)) {
    assertMatchingFailedReviewAudit(
      parseLiveGoldenFailedReviewAuditArtifact(readOptionalJsonFile(
        auditFile,
        'live-golden-failed-review-audit-invalid',
        storageRoot,
      )),
      failedCohort,
    );
    return;
  }
  const archivedAt = new Date().toISOString();
  const failedCohortDigest = liveGoldenFailedCohortDigest(failedCohort);
  const artifactIdentity = {
    archivedAt,
    failedCohortId: failedCohort.cohortId,
    failedCohortDigest,
  };
  const artifact: LiveGoldenFailedReviewAuditArtifact = {
    schemaVersion: LIVE_GOLDEN_FAILED_REVIEW_AUDIT_SCHEMA_VERSION,
    artifactDigest: liveGoldenFailedReviewAuditArtifactDigest(artifactIdentity),
    ...artifactIdentity,
    failedCohort,
  };
  try {
    atomicWriteLiveGoldenJson(auditFile, artifact, 'missing', storageRoot);
  } catch (error) {
    if (!(error instanceof LiveGoldenReviewConflictError)) throw error;
    assertMatchingFailedReviewAudit(
      parseLiveGoldenFailedReviewAuditArtifact(readOptionalJsonFile(
        auditFile,
        'live-golden-failed-review-audit-invalid',
        storageRoot,
      )),
      failedCohort,
    );
  }
}

function assertLiveGoldenReviewCohortNotTombstoned(
  cohortFile: string,
  candidate: PersistedLiveGoldenReviewCohort,
  storageRoot: string,
): void {
  const auditFile = failedReviewAuditFile(cohortFile, candidate.cohortId);
  const rawArtifact = readOptionalJsonFile(
    auditFile,
    'live-golden-failed-review-audit-invalid',
    storageRoot,
  );
  if (rawArtifact === undefined) return;
  const artifact = parseLiveGoldenFailedReviewAuditArtifact(rawArtifact);
  if (!artifact || artifact.failedCohortId !== candidate.cohortId) {
    throw new LiveGoldenReviewStorageError('live-golden-failed-review-audit-invalid');
  }
  throw new LiveGoldenReviewStorageError('live-golden-failed-review-cohort-reuse');
}

function failedReviewSemanticHashes(
  cohort: PersistedLiveGoldenReviewCohort,
): Set<string> {
  return new Set(Object.values(cohort.decisions || {})
    .filter((decision) => (
      !decision.precisionPassed
      || !decision.hiddenKnown
      || decision.malformed
      || decision.semanticDuplicate
      || decision.platformResidue
      || decision.sentenceResidue
    ))
    .map((decision) => decision.semanticHash));
}

function phase2EntryState(
  cohort: PersistedLiveGoldenReviewCohort | undefined,
  certificate: LiveGoldenPhase2EntryCertificate | undefined,
): LiveGoldenPhase2EntrySnapshot['state'] {
  if (!cohort) return 'building-supply';
  if (certificate) return 'eligible';
  if (cohort.state === 'human-review-failed') return 'human-review-failed';
  return 'pending-human-review';
}

function buildLiveGoldenPhase2EntrySnapshot(
  cohort: PersistedLiveGoldenReviewCohort | undefined,
  certificate: LiveGoldenPhase2EntryCertificate | undefined,
  reviewSummary: LiveGoldenBlindReviewSummary | undefined,
  currentMeasuredCohortCount: number,
  reason?: string,
): LiveGoldenPhase2EntrySnapshot {
  return {
    state: phase2EntryState(cohort, certificate),
    certificateIssued: !!certificate,
    cohortVerifiedCount: cohort?.members.length || 0,
    currentMeasuredCohortCount,
    pendingCandidateCount: cohort?.pendingCandidates.length || 0,
    missingCohortRowCount: cohort?.missingSemanticHashes.length || 0,
    reviewedCount: reviewSummary?.reviewed || 0,
    precision: reviewSummary?.precision || 0,
    ...(reason ? { reason } : {}),
  };
}

function hasReviewBindingChanges(
  current: PersistedLiveGoldenReviewCohort,
  next: PersistedLiveGoldenReviewCohort,
): boolean {
  return JSON.stringify({
    pendingCandidates: current.pendingCandidates,
    missingSemanticHashes: current.missingSemanticHashes,
  }) !== JSON.stringify({
    pendingCandidates: next.pendingCandidates,
    missingSemanticHashes: next.missingSemanticHashes,
  });
}

function resolveLiveGoldenReviewState(input: {
  rows: readonly MobileLiveGoldenBoardItem[];
  cohortFile: string;
  certificateFile: string;
  storageRoot: string;
  nowMs?: number;
  allowMutation?: boolean;
}): ResolvedLiveGoldenReviewState {
  const nowMs = Number.isFinite(input.nowMs) ? Number(input.nowMs) : Date.now();
  let cohortRevision = liveGoldenFileRevision(input.cohortFile, input.storageRoot);
  let cohort = readLiveGoldenReviewCohortFile(input.cohortFile, input.storageRoot);
  if (!cohort) {
    if (liveGoldenFileRevision(input.certificateFile, input.storageRoot) !== 'missing') {
      throw new LiveGoldenReviewStorageError('live-golden-phase2-certificate-without-cohort');
    }
    const frozen = freezeLiveGoldenReviewCohort(input.rows, { nowMs });
    if (!frozen.cohort) {
      return {
        reviewRows: [],
        exactBinding: false,
        phase2Entry: buildLiveGoldenPhase2EntrySnapshot(
          undefined,
          undefined,
          undefined,
          0,
          frozen.supplyReport.failureReasons.join(',') || 'automated-supply-gate-failed',
        ),
      };
    }
    if (!input.allowMutation) {
      return {
        reviewRows: [],
        exactBinding: false,
        phase2Entry: buildLiveGoldenPhase2EntrySnapshot(
          undefined,
          undefined,
          undefined,
          0,
          'review-cohort-not-frozen',
        ),
      };
    }
    cohort = frozen.cohort;
    assertLiveGoldenReviewCohortNotTombstoned(input.cohortFile, cohort, input.storageRoot);
    atomicWriteLiveGoldenJson(input.cohortFile, cohort, cohortRevision, input.storageRoot);
    cohortRevision = liveGoldenFileRevision(input.cohortFile, input.storageRoot);
  }

  // A tombstone also blocks rollback of an already archived cohort file. The
  // failed state itself remains loadable because a crash may occur after the
  // audit is durable but before the replacement cohort CAS completes.
  if (cohort.state !== 'human-review-failed') {
    assertLiveGoldenReviewCohortNotTombstoned(
      input.cohortFile,
      cohort,
      input.storageRoot,
    );
  }

  if (cohort.state === 'human-review-failed' && input.allowMutation) {
    if (liveGoldenFileRevision(input.certificateFile, input.storageRoot) !== 'missing') {
      throw new LiveGoldenReviewStorageError('live-golden-phase2-certificate-for-failed-cohort');
    }
    const replacement = freezeLiveGoldenReviewCohort(input.rows, { nowMs }).cohort;
    if (replacement && replacement.boardFingerprint !== cohort.boardFingerprint) {
      const failedSemanticHashes = failedReviewSemanticHashes(cohort);
      const replacementSemanticHashes = new Set(
        replacement.members.map((member) => member.semanticHash),
      );
      const allFailedSemanticsRemoved = failedSemanticHashes.size > 0
        && [...failedSemanticHashes].every((semanticHash) => (
          !replacementSemanticHashes.has(semanticHash)
      ));
      if (allFailedSemanticsRemoved) {
        assertLiveGoldenReviewCohortNotTombstoned(input.cohortFile, replacement, input.storageRoot);
        preserveFailedReviewAudit(input.cohortFile, cohort, input.storageRoot);
        atomicWriteLiveGoldenJson(
          input.cohortFile,
          replacement,
          cohortRevision,
          input.storageRoot,
        );
        cohort = replacement;
        cohortRevision = liveGoldenFileRevision(input.cohortFile, input.storageRoot);
      }
    }
  }

  const binding = bindLiveGoldenReviewRows(cohort, input.rows, { nowMs });
  if (hasReviewBindingChanges(cohort, binding.cohort)) {
    const cohortMayPersistReconciliation = cohort.state !== 'human-review-failed';
    cohort = binding.cohort;
    if (input.allowMutation && cohortMayPersistReconciliation) {
      atomicWriteLiveGoldenJson(input.cohortFile, cohort, cohortRevision, input.storageRoot);
    }
  }
  const reviewSummary = summarizeLiveGoldenBlindReviews(cohort);
  const certificate = readLiveGoldenPhase2CertificateFile(
    input.certificateFile,
    cohort,
    input.storageRoot,
  );
  const exactBinding = isExactLiveGoldenReviewBinding(binding);
  const phase2Entry = buildLiveGoldenPhase2EntrySnapshot(
    cohort,
    certificate,
    reviewSummary,
    binding.reviewRows.length,
    exactBinding ? undefined : 'current-cohort-binding-inexact',
  );
  return {
    cohort,
    certificate,
    reviewSummary,
    reviewRows: binding.reviewRows,
    exactBinding,
    phase2Entry: exactBinding ? phase2Entry : { ...phase2Entry, state: 'building-supply' },
  };
}

function v2HumanReviewFromResolvedState(
  resolved: ResolvedLiveGoldenReviewState | undefined,
): LiveGoldenHumanReview | undefined {
  if (
    !resolved?.cohort
    || !resolved.exactBinding
    || !resolved.reviewSummary
    || resolved.reviewSummary.reviewed === 0
  ) {
    return undefined;
  }
  const reviewedAt = Object.values(resolved.cohort.decisions)
    .map((decision) => decision.reviewedAt)
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0];
  return {
    reviewed: resolved.reviewSummary.reviewed,
    precision: resolved.reviewSummary.precision,
    hiddenKnownCount: resolved.reviewSummary.hiddenKnownCount,
    obviousCount: resolved.reviewSummary.obviousCount,
    malformedCount: resolved.reviewSummary.malformedCount,
    semanticDuplicateCount: resolved.reviewSummary.semanticDuplicateCount,
    platformResidueCount: resolved.reviewSummary.platformResidueCount,
    sentenceResidueCount: resolved.reviewSummary.sentenceResidueCount,
    reviewedAt,
    boardFingerprint: resolved.cohort.boardFingerprint,
  };
}

function applyCurrentSupplyGateToPhase2Entry(
  resolved: ResolvedLiveGoldenReviewState,
  currentSupply: ReturnType<typeof buildLiveGoldenSupplyReport>,
): LiveGoldenPhase2EntrySnapshot {
  if (resolved.cohort && !resolved.exactBinding) {
    return {
      ...resolved.phase2Entry,
      state: 'building-supply',
      reason: 'current-cohort-binding-inexact',
    };
  }
  if (!resolved.cohort || currentSupply.automatedSupplyGate === 'pass') {
    return resolved.phase2Entry;
  }
  return {
    ...resolved.phase2Entry,
    state: 'building-supply',
    reason: currentSupply.failureReasons.join(',') || 'current-automated-supply-gate-failed',
  };
}

function blindLiveGoldenReviewPacket(cohort: PersistedLiveGoldenReviewCohort): {
  schemaVersion: PersistedLiveGoldenReviewCohort['schemaVersion'];
  fingerprintVersion: PersistedLiveGoldenReviewCohort['fingerprintVersion'];
  cohortId: string;
  boardFingerprint: string;
  frozenAt: string;
  rows: Array<{
    semanticHash: string;
    keyword: string;
    category: string;
    intent: string;
  }>;
} {
  return {
    schemaVersion: cohort.schemaVersion,
    fingerprintVersion: cohort.fingerprintVersion,
    cohortId: cohort.cohortId,
    boardFingerprint: cohort.boardFingerprint,
    frozenAt: cohort.frozenAt,
    rows: cohort.members.map((member) => ({
      semanticHash: member.semanticHash,
      keyword: member.keyword,
      category: member.category,
      intent: member.intent,
    })),
  };
}

const LIVE_GOLDEN_BLIND_REVIEW_SUBMISSION_SCHEMA = 'live-golden-blind-review-submission-v2' as const;
const LIVE_GOLDEN_BLIND_REVIEW_TOP_LEVEL_FIELDS = new Set([
  'schemaVersion',
  'cohortId',
  'boardFingerprint',
  'decisions',
]);
const LIVE_GOLDEN_BLIND_REVIEW_DECISION_FIELDS = new Set([
  'semanticHash',
  'naturalKeyword',
  'intentMatch',
  'hiddenKnown',
  'malformed',
  'semanticDuplicate',
  'platformResidue',
  'sentenceResidue',
]);

interface LiveGoldenBlindReviewSubmissionDecision {
  semanticHash: string;
  naturalKeyword: boolean;
  intentMatch: boolean;
  hiddenKnown: boolean;
  malformed: boolean;
  semanticDuplicate: boolean;
  platformResidue: boolean;
  sentenceResidue: boolean;
}

function parseLiveGoldenBlindReviewSubmission(
  value: unknown,
  cohort: PersistedLiveGoldenReviewCohort,
): { decisions: LiveGoldenBlindReviewSubmissionDecision[] } | { status: number; code: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { status: 400, code: 'invalid-review-submission' };
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !LIVE_GOLDEN_BLIND_REVIEW_TOP_LEVEL_FIELDS.has(key))) {
    return { status: 400, code: 'client-review-metadata-not-allowed' };
  }
  if (input.schemaVersion !== LIVE_GOLDEN_BLIND_REVIEW_SUBMISSION_SCHEMA) {
    return { status: 400, code: 'invalid-review-submission-schema' };
  }
  if (input.cohortId !== cohort.cohortId || input.boardFingerprint !== cohort.boardFingerprint) {
    return { status: 409, code: 'review-cohort-mismatch' };
  }
  if (!Array.isArray(input.decisions) || input.decisions.length !== cohort.members.length) {
    return { status: 422, code: 'full-cohort-review-required' };
  }
  const memberHashes = new Set(cohort.members.map((member) => member.semanticHash));
  const seen = new Set<string>();
  const decisions: LiveGoldenBlindReviewSubmissionDecision[] = [];
  for (const rawDecision of input.decisions) {
    if (!rawDecision || typeof rawDecision !== 'object' || Array.isArray(rawDecision)) {
      return { status: 400, code: 'invalid-review-decision' };
    }
    const decision = rawDecision as Record<string, unknown>;
    if (Object.keys(decision).some((key) => !LIVE_GOLDEN_BLIND_REVIEW_DECISION_FIELDS.has(key))) {
      return { status: 400, code: 'client-review-metadata-not-allowed' };
    }
    const semanticHash = typeof decision.semanticHash === 'string' ? decision.semanticHash : '';
    if (!memberHashes.has(semanticHash)) {
      return { status: 409, code: 'review-semantic-hash-mismatch' };
    }
    if (seen.has(semanticHash)) {
      return { status: 422, code: 'duplicate-review-semantic-hash' };
    }
    if (
      typeof decision.naturalKeyword !== 'boolean'
      || typeof decision.intentMatch !== 'boolean'
      || typeof decision.hiddenKnown !== 'boolean'
      || typeof decision.malformed !== 'boolean'
      || typeof decision.semanticDuplicate !== 'boolean'
      || typeof decision.platformResidue !== 'boolean'
      || typeof decision.sentenceResidue !== 'boolean'
    ) {
      return { status: 400, code: 'invalid-review-decision-flags' };
    }
    seen.add(semanticHash);
    decisions.push({
      semanticHash,
      naturalKeyword: decision.naturalKeyword,
      intentMatch: decision.intentMatch,
      hiddenKnown: decision.hiddenKnown,
      malformed: decision.malformed,
      semanticDuplicate: decision.semanticDuplicate,
      platformResidue: decision.platformResidue,
      sentenceResidue: decision.sentenceResidue,
    });
  }
  if (seen.size !== memberHashes.size) {
    return { status: 422, code: 'full-cohort-review-required' };
  }
  return { decisions };
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
  const liveGoldenWorkerHeartbeatFile = options.liveGoldenWorkerHeartbeatFile
    || resolveLiveGoldenWorkerHeartbeatFile();
  const liveGoldenHumanReviewFile = options.liveGoldenHumanReviewFile
    || String(process.env['LEWORD_MOBILE_LIVE_GOLDEN_HUMAN_REVIEW_FILE'] || '').trim();
  const liveGoldenReviewCohortFile = options.liveGoldenReviewCohortFile
    || String(process.env['LEWORD_MOBILE_LIVE_GOLDEN_REVIEW_COHORT_FILE'] || '').trim();
  const liveGoldenPhase2CertificateFile = options.liveGoldenPhase2CertificateFile
    || String(process.env['LEWORD_MOBILE_PHASE2_ENTRY_CERTIFICATE_FILE'] || '').trim();
  const liveGoldenReviewV2Requested = !!liveGoldenReviewCohortFile || !!liveGoldenPhase2CertificateFile;
  const liveGoldenReviewV2Configured = !!liveGoldenReviewCohortFile && !!liveGoldenPhase2CertificateFile;
  const liveGoldenReviewStorageRoot = liveGoldenReviewV2Configured
    ? initializeLiveGoldenReviewStorageRoot(
      liveGoldenReviewCohortFile,
      liveGoldenPhase2CertificateFile,
    )
    : undefined;
  const entitlementVerifier = options.entitlementVerifier === null
    ? null
    : options.entitlementVerifier || createEnvironmentMobileEntitlementVerifier({
      staticToken: getRequiredAuthToken(options),
    });
  const independentWebSessionSecret = getStrictHumanReviewSigningSecret(options);
  const currentReviewAuth = (): StrictReviewAuthReadiness => (
    strictReviewAuthReadiness(independentWebSessionSecret)
  );
  // Keep the structurally valid signing secret independent from provider
  // readiness. Provider/admin availability is evaluated at request time so an
  // account expiry cannot leave health permanently green after startup.
  const strictHumanReviewSigningSecret = independentWebSessionSecret;
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
  const runLiveGoldenReviewTransaction = createLiveGoldenReviewTransactionMutex(
    liveGoldenReviewV2Configured
      ? `${path.resolve(liveGoldenReviewCohortFile)}.lock`
      : undefined,
    liveGoldenReviewStorageRoot,
  );

  const server = http.createServer((req, res) => {
    void (async () => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    // v2.49.72: gzip 수용 스탬프 — 전체-바디 응답 헬퍼(json/html)만 이 플래그로 압축.
    (res as { __acceptsGzip?: boolean }).__acceptsGzip =
      /\bgzip\b/i.test(String(req.headers['accept-encoding'] || ''));

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
      const snapshot = liveGoldenRadar?.snapshot() || null;
      const publicPayload = buildPublicLiveGoldenPayload(snapshot);
      const proVerification = await verifyOptionalMobileRequest(req, sessionAwareEntitlementVerifier, 'standard');
      const boardItems = snapshot?.board || [];
      const payload = proVerification && snapshot
        ? {
            ...publicPayload,
            exactMetricsLocked: false,
            lockedCount: 0,
            publicPreviewCount: boardItems.length,
            publicPreview: boardItems,
            proSnapshot: snapshot,
            snapshot,
          }
        : publicPayload;
      json(res, 200, payload, {
        'Cache-Control': 'no-store',
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/v1/keywords/trend') {
      const keyword = String(url.searchParams.get('keyword') || '').trim().slice(0, 60);
      if (!keyword) {
        json(res, 400, { ok: false, message: 'keyword is required' });
        return;
      }
      try {
        const envConfig = EnvironmentManager.getInstance().getConfig();
        const trend = await getKeywordDailyTrend30d({
          clientId: String(envConfig.naverClientId || process.env['NAVER_CLIENT_ID'] || ''),
          clientSecret: String(envConfig.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || ''),
        }, keyword);
        json(res, 200, {
          ok: true,
          keyword,
          source: 'naver-datalab',
          unit: 'relative-ratio-max-100',
          trend,
        }, { 'Cache-Control': 'public, max-age=1800' });
      } catch (error) {
        json(res, 500, { ok: false, message: (error as Error)?.message || 'trend lookup failed' });
      }
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

    if (req.method === 'GET' && url.pathname === PUBLIC_HOME_KEYWORD_BRIEFING_ROUTE) {
      try {
        json(res, 200, { ok: true, briefing: readHomeKeywordBriefing() }, {
          'Cache-Control': 'no-store',
        });
      } catch (error) {
        if (error instanceof HomeKeywordBriefingStorageError) {
          homeKeywordBriefingStorageUnavailable(res, error);
        } else {
          throw error;
        }
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === PUBLIC_HOME_NOTICES_ROUTE) {
      try {
        json(res, 200, { ok: true, notices: readHomeNotices() }, {
          'Cache-Control': 'no-store',
        });
      } catch (error) {
        if (error instanceof HomeNoticesStorageError) {
          homeNoticesStorageUnavailable(res, error);
        } else {
          throw error;
        }
      }
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
      const reviewAuth = currentReviewAuth();
      const liveGoldenSnapshot = liveGoldenRadar?.snapshotForInternalReview() || null;
      const liveGoldenWorker = readLiveGoldenWorkerHealth(liveGoldenWorkerHeartbeatFile);
      const liveGoldenSupplyRows = liveGoldenSnapshot?.verifiedSupply || liveGoldenSnapshot?.board || [];
      const liveGoldenReviewCandidateRows = liveGoldenSnapshot?.reviewCandidates
        || liveGoldenSupplyRows;
      let resolvedLiveGoldenReviewV2: ResolvedLiveGoldenReviewState | undefined;
      let liveGoldenPhase2Entry: LiveGoldenPhase2EntrySnapshot | undefined;
      let liveGoldenReviewArtifactsReadable = false;
      if (liveGoldenReviewV2Requested && !liveGoldenReviewV2Configured) {
        liveGoldenPhase2Entry = buildLiveGoldenPhase2EntrySnapshot(
          undefined,
          undefined,
          undefined,
          0,
          'phase2-review-storage-configuration-incomplete',
        );
      } else if (liveGoldenReviewV2Configured) {
        try {
          resolvedLiveGoldenReviewV2 = resolveLiveGoldenReviewState({
            rows: liveGoldenReviewCandidateRows,
            cohortFile: liveGoldenReviewCohortFile,
            certificateFile: liveGoldenPhase2CertificateFile,
            storageRoot: liveGoldenReviewStorageRoot!,
            allowMutation: false,
          });
          liveGoldenPhase2Entry = resolvedLiveGoldenReviewV2.phase2Entry;
          liveGoldenReviewArtifactsReadable = true;
        } catch (error) {
          liveGoldenPhase2Entry = buildLiveGoldenPhase2EntrySnapshot(
            undefined,
            undefined,
            undefined,
            0,
            error instanceof LiveGoldenReviewStorageError
              ? error.code
              : 'phase2-review-storage-error',
          );
        }
      }

      const effectiveLiveGoldenSupplyRows = resolvedLiveGoldenReviewV2?.cohort
        ? resolvedLiveGoldenReviewV2.reviewRows
        : liveGoldenSupplyRows;
      let liveGoldenHumanReview: LiveGoldenHumanReview | undefined;
      let liveGoldenHumanReviewReason = liveGoldenReviewV2Configured
        ? 'human-review-v2-pending'
        : liveGoldenReviewV2Requested
          ? 'human-review-v2-configuration-incomplete'
          : liveGoldenHumanReviewFile
            ? 'human-review-file-missing'
            : 'human-review-not-configured';
      if (liveGoldenReviewV2Configured) {
        liveGoldenHumanReview = v2HumanReviewFromResolvedState(resolvedLiveGoldenReviewV2);
      } else if (
        !liveGoldenReviewV2Requested
        && liveGoldenSnapshot
        && liveGoldenHumanReviewFile
        && fs.existsSync(liveGoldenHumanReviewFile)
      ) {
        try {
          const reviewStat = fs.lstatSync(liveGoldenHumanReviewFile);
          if (!reviewStat.isFile()) {
            liveGoldenHumanReviewReason = 'human-review-not-regular-file';
          } else if (reviewStat.size > 64 * 1024) {
            liveGoldenHumanReviewReason = 'human-review-file-too-large';
          } else {
            const evaluation = evaluateLiveGoldenHumanReviewAttestation(
              JSON.parse(fs.readFileSync(liveGoldenHumanReviewFile, 'utf8')),
              liveGoldenSupplyRows,
              liveGoldenSnapshot.boardUpdatedAt,
            );
            liveGoldenHumanReview = evaluation.review;
            liveGoldenHumanReviewReason = `human-review-${evaluation.reason}`;
          }
        } catch {
          liveGoldenHumanReview = undefined;
          liveGoldenHumanReviewReason = 'human-review-json-invalid-or-read-error';
        }
      }
      const liveGoldenSupply = buildLiveGoldenSupplyReport(
        effectiveLiveGoldenSupplyRows,
        { humanReview: liveGoldenHumanReview },
      );
      if (resolvedLiveGoldenReviewV2) {
        liveGoldenPhase2Entry = applyCurrentSupplyGateToPhase2Entry(
          resolvedLiveGoldenReviewV2,
          liveGoldenSupply,
        );
      }
      if (liveGoldenHumanReview) {
        liveGoldenHumanReviewReason = liveGoldenSupply.automatedSupplyGate !== 'pass'
          ? 'automated-supply-gate-failed'
          : liveGoldenHumanReview.reviewed < liveGoldenSupply.verifiedCount
            ? 'human-review-incomplete'
            : liveGoldenHumanReview.precision < 0.9
              ? 'human-review-precision-below-threshold'
              : (liveGoldenHumanReview.obviousCount || 0) > 0
                ? 'human-review-obvious-head-present'
                : liveGoldenHumanReview.malformedCount > 0
                  ? 'human-review-malformed-present'
                  : liveGoldenHumanReview.semanticDuplicateCount > 0
                    ? 'human-review-semantic-duplicate-present'
                    : liveGoldenHumanReview.platformResidueCount > 0
                      ? 'human-review-platform-residue-present'
                      : liveGoldenHumanReview.sentenceResidueCount > 0
                        ? 'human-review-sentence-residue-present'
                        : 'human-review-passed';
      }
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
          reviewAuthConfigured: reviewAuth.ready,
          reviewAuth,
          reviewStorage: {
            configured: liveGoldenReviewV2Configured,
            readable: liveGoldenReviewV2Configured
              && liveGoldenReviewArtifactsReadable
              && canAccessLiveGoldenReviewStorage(
                liveGoldenReviewStorageRoot!,
                liveGoldenReviewCohortFile,
                liveGoldenPhase2CertificateFile,
                fs.constants.R_OK,
              ),
            writable: liveGoldenReviewV2Configured
              && canAccessLiveGoldenReviewStorage(
                liveGoldenReviewStorageRoot!,
                liveGoldenReviewCohortFile,
                liveGoldenPhase2CertificateFile,
                fs.constants.W_OK,
              ),
          },
          boardCount: liveGoldenSnapshot?.boardCount || 0,
          verifiedSupplyCount: liveGoldenSnapshot
            ? (Array.isArray(liveGoldenSnapshot.verifiedSupply)
              ? liveGoldenSnapshot.verifiedSupply.length
              : liveGoldenSnapshot.boardCount)
            : 0,
          boardTarget: liveGoldenSnapshot?.boardTarget || 0,
          boardUpdatedAt: liveGoldenSnapshot?.boardUpdatedAt,
          pendingProbeQueueCount: liveGoldenSnapshot?.pendingProbeQueueCount || 0,
          searchAdQuota: liveGoldenSnapshot?.searchAdQuota,
          worker: liveGoldenWorker,
          supply: liveGoldenSupply,
          phase2Entry: liveGoldenPhase2Entry,
          humanReviewAttestation: {
            configured: liveGoldenReviewV2Configured || !!liveGoldenHumanReviewFile,
            version: liveGoldenReviewV2Configured ? 'v2-cohort' : 'legacy-v1',
            accepted: !!liveGoldenHumanReview,
            qualityPassed: liveGoldenSupply.superiorityGate === 'pass',
            reason: liveGoldenHumanReviewReason,
            target: liveGoldenSnapshot ? {
              fingerprintVersion: LIVE_GOLDEN_HUMAN_REVIEW_FINGERPRINT_VERSION,
              boardFingerprint: resolvedLiveGoldenReviewV2?.cohort?.boardFingerprint
                || liveGoldenBoardFingerprint(effectiveLiveGoldenSupplyRows),
              boardUpdatedAt: liveGoldenSnapshot.boardUpdatedAt,
              verifiedCount: resolvedLiveGoldenReviewV2?.cohort?.members.length
                || liveGoldenSupply.verifiedCount,
            } : null,
          },
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
      await createLoginSession(
        req,
        res,
        entitlementVerifier,
        runtimeEntitlements,
        notificationInbox,
        prewarmService,
        liveGoldenRadar,
        maxBodyBytes,
        webSessionSecret,
        strictHumanReviewSigningSecret,
      );
      return;
    }

    if (
      (req.method === 'GET' || req.method === 'POST')
      && url.pathname === ADMIN_LIVE_GOLDEN_REVIEW_ROUTE
    ) {
      const reviewerEntitlement = await authorizeStrictHumanAdminWebSession(
        req,
        res,
        strictHumanReviewSigningSecret,
      );
      if (!reviewerEntitlement) return;
      if (!liveGoldenReviewV2Configured) {
        json(res, 503, {
          ok: false,
          code: liveGoldenReviewV2Requested
            ? 'phase2-review-storage-configuration-incomplete'
            : 'phase2-review-storage-not-configured',
        }, { 'Cache-Control': 'no-store' });
        return;
      }
      if (!liveGoldenRadar) {
        json(res, 503, { ok: false, code: 'live-golden-radar-disabled' }, { 'Cache-Control': 'no-store' });
        return;
      }

      try {
        await runLiveGoldenReviewTransaction(async () => {
        try {
          const liveGoldenSnapshot = liveGoldenRadar.snapshotForInternalReview();
          const liveGoldenSupplyRows = liveGoldenSnapshot.verifiedSupply || liveGoldenSnapshot.board || [];
          const liveGoldenReviewCandidateRows = liveGoldenSnapshot.reviewCandidates
            || liveGoldenSupplyRows;
          const resolved = resolveLiveGoldenReviewState({
            rows: liveGoldenReviewCandidateRows,
            cohortFile: liveGoldenReviewCohortFile,
            certificateFile: liveGoldenPhase2CertificateFile,
            storageRoot: liveGoldenReviewStorageRoot!,
            allowMutation: true,
          });
          const currentReviewSupply = buildLiveGoldenSupplyReport(
            resolved.cohort ? resolved.reviewRows : liveGoldenSupplyRows,
            { humanReview: v2HumanReviewFromResolvedState(resolved) },
          );
          const currentPhase2Entry = applyCurrentSupplyGateToPhase2Entry(
            resolved,
            currentReviewSupply,
          );

          if (req.method === 'GET') {
            json(res, 200, {
              ok: true,
              cohort: resolved.cohort ? blindLiveGoldenReviewPacket(resolved.cohort) : null,
              phase2Entry: currentPhase2Entry,
              reviewSummary: resolved.reviewSummary || null,
              certificate: resolved.certificate || null,
              pendingCandidateCount: resolved.phase2Entry.pendingCandidateCount,
            }, { 'Cache-Control': 'no-store' });
            return;
          }

          if (!resolved.cohort) {
            json(res, 409, {
              ok: false,
              code: 'review-cohort-not-frozen',
              phase2Entry: currentPhase2Entry,
            }, { 'Cache-Control': 'no-store' });
            return;
          }
          if (resolved.cohort.state === 'human-review-failed') {
            json(res, 409, {
              ok: false,
              code: 'review-cohort-closed',
              phase2Entry: currentPhase2Entry,
            }, { 'Cache-Control': 'no-store' });
            return;
          }
          if (!resolved.exactBinding) {
            json(res, 409, {
              ok: false,
              code: 'current-cohort-binding-inexact',
              phase2Entry: currentPhase2Entry,
            }, { 'Cache-Control': 'no-store' });
            return;
          }
          if (currentReviewSupply.automatedSupplyGate !== 'pass') {
            json(res, 409, {
              ok: false,
              code: 'current-automated-supply-gate-failed',
              failureReasons: currentReviewSupply.failureReasons,
              phase2Entry: currentPhase2Entry,
            }, { 'Cache-Control': 'no-store' });
            return;
          }
          if (resolved.certificate) {
            json(res, 409, {
              ok: false,
              code: 'phase2-entry-already-certified',
              phase2Entry: currentPhase2Entry,
            }, { 'Cache-Control': 'no-store' });
            return;
          }

          let body: unknown;
          try {
            body = await parseBody(req, maxBodyBytes);
          } catch (error) {
            handleBodyError(res, error, maxBodyBytes);
            return;
          }

          // Re-read both the live projection and persisted artifacts after the
          // request body has arrived. The review is committed only against this
          // latest binding, never against the earlier packet snapshot.
          const latestSnapshot = liveGoldenRadar.snapshotForInternalReview();
          const latestSupplyRows = latestSnapshot.verifiedSupply || latestSnapshot.board || [];
          const latestCandidateRows = latestSnapshot.reviewCandidates || latestSupplyRows;
          const latestResolved = resolveLiveGoldenReviewState({
            rows: latestCandidateRows,
            cohortFile: liveGoldenReviewCohortFile,
            certificateFile: liveGoldenPhase2CertificateFile,
            storageRoot: liveGoldenReviewStorageRoot!,
            allowMutation: true,
          });
          const latestReviewSupply = buildLiveGoldenSupplyReport(
            latestResolved.cohort ? latestResolved.reviewRows : latestSupplyRows,
            { humanReview: v2HumanReviewFromResolvedState(latestResolved) },
          );
          const latestPhase2Entry = applyCurrentSupplyGateToPhase2Entry(
            latestResolved,
            latestReviewSupply,
          );
          if (
            !latestResolved.cohort
            || latestResolved.cohort.cohortId !== resolved.cohort.cohortId
            || latestResolved.cohort.boardFingerprint !== resolved.cohort.boardFingerprint
          ) {
            json(res, 409, {
              ok: false,
              code: 'review-cohort-changed',
              phase2Entry: latestPhase2Entry,
            }, { 'Cache-Control': 'no-store' });
            return;
          }
          if (latestResolved.cohort.state === 'human-review-failed') {
            json(res, 409, {
              ok: false,
              code: 'review-cohort-closed',
              phase2Entry: latestPhase2Entry,
            }, { 'Cache-Control': 'no-store' });
            return;
          }
          if (!latestResolved.exactBinding) {
            json(res, 409, {
              ok: false,
              code: 'current-cohort-binding-inexact',
              phase2Entry: latestPhase2Entry,
            }, { 'Cache-Control': 'no-store' });
            return;
          }
          if (latestReviewSupply.automatedSupplyGate !== 'pass') {
            json(res, 409, {
              ok: false,
              code: 'current-automated-supply-gate-failed',
              failureReasons: latestReviewSupply.failureReasons,
              phase2Entry: latestPhase2Entry,
            }, { 'Cache-Control': 'no-store' });
            return;
          }
          if (latestResolved.certificate) {
            json(res, 409, {
              ok: false,
              code: 'phase2-entry-already-certified',
              phase2Entry: latestPhase2Entry,
            }, { 'Cache-Control': 'no-store' });
            return;
          }

          const parsedSubmission = parseLiveGoldenBlindReviewSubmission(
            body,
            latestResolved.cohort,
          );
          if ('status' in parsedSubmission) {
            json(res, parsedSubmission.status, {
              ok: false,
              code: parsedSubmission.code,
            }, { 'Cache-Control': 'no-store' });
            return;
          }

          const expectedCohortRevision = liveGoldenFileRevision(
            liveGoldenReviewCohortFile,
            liveGoldenReviewStorageRoot!,
          );
          const expectedCertificateRevision = liveGoldenFileRevision(
            liveGoldenPhase2CertificateFile,
            liveGoldenReviewStorageRoot!,
          );
          const reviewedAt = new Date().toISOString();
          const reviewer = String(reviewerEntitlement.subjectId).trim();
          let reviewedCohort: PersistedLiveGoldenReviewCohort = {
            ...latestResolved.cohort,
            state: 'review-target-frozen',
            updatedAt: reviewedAt,
            decisions: {},
          };
          for (const decision of parsedSubmission.decisions) {
            const domainDecision: LiveGoldenBlindReviewDecision = {
              schemaVersion: LIVE_GOLDEN_BLIND_REVIEW_DECISION_SCHEMA_VERSION,
              cohortId: reviewedCohort.cohortId,
              semanticHash: decision.semanticHash,
              reviewer,
              reviewedAt,
              precisionPassed: decision.naturalKeyword && decision.intentMatch,
              hiddenKnown: decision.hiddenKnown,
              malformed: decision.malformed,
              semanticDuplicate: decision.semanticDuplicate,
              platformResidue: decision.platformResidue,
              sentenceResidue: decision.sentenceResidue,
            };
            const submission = submitLiveGoldenBlindReviewDecision(reviewedCohort, domainDecision);
            if (!submission.accepted) {
              json(res, 409, {
                ok: false,
                code: 'review-decision-rejected',
                reason: 'reason' in submission ? submission.reason : 'unknown',
              }, { 'Cache-Control': 'no-store' });
              return;
            }
            reviewedCohort = submission.cohort;
          }

          const reviewSummary = summarizeLiveGoldenBlindReviews(reviewedCohort);
          let certificate: LiveGoldenPhase2EntryCertificate | undefined;
          if (reviewSummary.passes) {
            certificate = issueLiveGoldenPhase2EntryCertificate(reviewedCohort, {
              issuedAt: new Date().toISOString(),
              issuedBy: reviewer,
            });
          }
          // A failed review must become durable before the mutable cohort file.
          // If a crash or external rollback restores pre-review bytes, this
          // tombstone still blocks reuse of the failed semantic cohort.
          if (!reviewSummary.passes) {
            preserveFailedReviewAudit(
              liveGoldenReviewCohortFile,
              reviewedCohort,
              liveGoldenReviewStorageRoot!,
            );
          }
          // Persist the reviewed cohort first. If certificate persistence then
          // fails, the eligible cohort has no certificate and a full review can
          // be safely resubmitted. Revision checks reject stale file writers.
          atomicWriteLiveGoldenJson(
            liveGoldenReviewCohortFile,
            reviewedCohort,
            expectedCohortRevision,
            liveGoldenReviewStorageRoot!,
          );
          if (certificate) {
            atomicWriteLiveGoldenJson(
              liveGoldenPhase2CertificateFile,
              certificate,
              expectedCertificateRevision,
              liveGoldenReviewStorageRoot!,
            );
          }
          const phase2Entry = buildLiveGoldenPhase2EntrySnapshot(
            reviewedCohort,
            certificate,
            reviewSummary,
            latestResolved.reviewRows.length,
          );
          json(res, 200, {
            ok: true,
            cohort: blindLiveGoldenReviewPacket(reviewedCohort),
            phase2Entry,
            reviewSummary,
            certificate: certificate || null,
            pendingCandidateCount: phase2Entry.pendingCandidateCount,
          }, { 'Cache-Control': 'no-store' });
        } catch (error) {
          const conflict = error instanceof LiveGoldenReviewConflictError;
          json(res, conflict ? 409 : 500, {
            ok: false,
            code: conflict
              ? error.code
              : error instanceof LiveGoldenReviewStorageError
                ? error.code
                : 'phase2-review-internal-error',
          }, { 'Cache-Control': 'no-store' });
        }
        });
      } catch (error) {
        const conflict = error instanceof LiveGoldenReviewConflictError;
        json(res, conflict ? 409 : 500, {
          ok: false,
          code: conflict
            ? error.code
            : error instanceof LiveGoldenReviewStorageError
              ? error.code
              : 'phase2-review-transaction-error',
        }, { 'Cache-Control': 'no-store' });
      }
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

    if ((req.method === 'GET' || req.method === 'PUT') && url.pathname === ADMIN_HOME_KEYWORD_BRIEFING_ROUTE) {
      if (!sessionAwareEntitlementVerifier) {
        json(res, 503, {
          ok: false,
          code: 'admin-auth-unconfigured',
          message: '관리자 세션 인증이 구성되지 않았습니다.',
        });
        return;
      }
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'admin')) return;
      if (req.method === 'GET') {
        try {
          const briefing = readHomeKeywordBriefing();
          json(res, 200, {
            ok: true,
            briefing,
            currentRevision: briefing?.revision || 0,
            storage: resolveHomeKeywordBriefingFile(),
          }, { 'Cache-Control': 'no-store' });
        } catch (error) {
          if (error instanceof HomeKeywordBriefingStorageError) {
            homeKeywordBriefingStorageUnavailable(res, error);
          } else {
            throw error;
          }
        }
        return;
      }
      try {
        const body = await parseBody(req, maxBodyBytes) as Record<string, unknown>;
        const briefing = publishHomeKeywordBriefing({
          value: body?.briefing ?? body,
          expectedRevision: body?.expectedRevision,
          updatedBy: 'leaderspro-admin-session',
        });
        json(res, 200, {
          ok: true,
          briefing,
          currentRevision: briefing.revision,
          storage: resolveHomeKeywordBriefingFile(),
        }, { 'Cache-Control': 'no-store' });
        // 발행은 이미 끝났다. 검색 이유는 발행을 막지 않도록 응답 뒤에 백그라운드로 채운다.
        // Manus 키/크레딧이 없으면 조용히 폴백(아무 변화 없음). 채워지면 다음 리비전에 반영.
        void enrichBriefingSearchReasons(briefing).catch((error) => {
          console.warn('[briefing-manus] 검색 이유 보강 건너뜀:', String(error?.message || error));
        });
      } catch (err) {
        if (err instanceof HomeKeywordBriefingRevisionConflictError) {
          json(res, 409, {
            ok: false,
            code: 'revision-conflict',
            message: '다른 관리자 저장본이 먼저 반영되었습니다. 최신본을 다시 불러온 뒤 검수하세요.',
            expectedRevision: err.expectedRevision,
            currentRevision: err.currentRevision,
          });
        } else if (err instanceof MobileApiBodyTooLargeError) {
          payloadTooLarge(res, maxBodyBytes);
        } else if (err instanceof HomeKeywordBriefingValidationError) {
          json(res, 422, {
            ok: false,
            code: 'invalid-home-keyword-briefing',
            message: err.message,
          });
        } else if (err instanceof HomeKeywordBriefingStorageError) {
          homeKeywordBriefingStorageUnavailable(res, err);
        } else {
          handleBodyError(res, err, maxBodyBytes);
        }
      }
      return;
    }

    if ((req.method === 'GET' || req.method === 'PUT') && url.pathname === ADMIN_HOME_NOTICES_ROUTE) {
      if (!sessionAwareEntitlementVerifier) {
        json(res, 503, {
          ok: false,
          code: 'admin-auth-unconfigured',
          message: '관리자 세션 인증이 구성되지 않았습니다.',
        }, { 'Cache-Control': 'no-store' });
        return;
      }
      if (!await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'admin')) return;
      if (req.method === 'GET') {
        try {
          const notices = readHomeNotices();
          json(res, 200, {
            ok: true,
            notices,
            currentRevision: notices?.revision || 0,
          }, { 'Cache-Control': 'no-store' });
        } catch (error) {
          if (error instanceof HomeNoticesStorageError) {
            homeNoticesStorageUnavailable(res, error);
          } else {
            throw error;
          }
        }
        return;
      }
      try {
        const body = await parseBody(req, maxBodyBytes) as Record<string, unknown>;
        const notices = publishHomeNotices({
          value: body?.notices,
          expectedRevision: body?.expectedRevision,
          updatedBy: 'leaderspro-admin-session',
        });
        json(res, 200, {
          ok: true,
          notices,
          currentRevision: notices.revision,
        }, { 'Cache-Control': 'no-store' });
      } catch (error) {
        if (error instanceof HomeNoticesRevisionConflictError) {
          json(res, 409, {
            ok: false,
            code: 'revision-conflict',
            message: '다른 관리자 저장본이 먼저 반영되었습니다. 최신본을 다시 불러온 뒤 수정하세요.',
            expectedRevision: error.expectedRevision,
            currentRevision: error.currentRevision,
          }, { 'Cache-Control': 'no-store' });
        } else if (error instanceof MobileApiBodyTooLargeError) {
          payloadTooLarge(res, maxBodyBytes);
        } else if (error instanceof HomeNoticesValidationError) {
          json(res, 422, {
            ok: false,
            code: 'invalid-home-notices',
            message: error.message,
          }, { 'Cache-Control': 'no-store' });
        } else if (error instanceof HomeNoticesStorageError) {
          homeNoticesStorageUnavailable(res, error);
        } else {
          handleBodyError(res, error, maxBodyBytes);
        }
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
      if (
        !isLiveGoldenIngestRequestAuthorized(req)
        && !await authorizeMobileRequest(req, res, sessionAwareEntitlementVerifier, 'standard')
      ) return;
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

    if (req.method === 'POST' && url.pathname === MOBILE_LIVE_GOLDEN_ROUTES.ingest) {
      // 데스크톱(운영자) 발굴 결과 수신 — 전용 토큰이 env 에 없으면 기능 자체가 꺼진 상태.
      const expectedIngestToken = String(process.env['LEWORD_LIVE_GOLDEN_INGEST_TOKEN'] || '').trim();
      if (!expectedIngestToken) {
        json(res, 503, { ok: false, message: 'live golden ingest disabled' } satisfies MobileJobErrorResponse);
        return;
      }
      if (!isLiveGoldenIngestRequestAuthorized(req)) {
        json(res, 401, { ok: false, message: 'live golden ingest unauthorized' } satisfies MobileJobErrorResponse);
        return;
      }
      if (!liveGoldenRadar) {
        json(res, 503, { ok: false, message: 'mobile live golden radar disabled' } satisfies MobileJobErrorResponse);
        return;
      }
      try {
        const ingestBodyLimit = Math.max(maxBodyBytes, LIVE_GOLDEN_INGEST_MAX_BODY_BYTES);
        const body = await parseBody(req, ingestBodyLimit) as { items?: unknown; source?: unknown };
        const items = Array.isArray(body?.items) ? body.items : [];
        const result = liveGoldenRadar.ingestBoard(items, {
          source: typeof body?.source === 'string' ? body.source : undefined,
        });
        json(res, 200, { ok: true, ...result });
      } catch (err) {
        handleBodyError(res, err, LIVE_GOLDEN_INGEST_MAX_BODY_BYTES);
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
