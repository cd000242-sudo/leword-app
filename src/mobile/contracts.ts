export type MobileKeywordProduct =
  | 'golden-discovery'
  | 'pro-traffic-hunter'
  | 'keyword-analysis'
  | 'mindmap-expansion'
  | 'home-board-hunter'
  | 'kin-hidden-honey'
  | 'shopping-connect'
  | 'youtube-golden'
  | 'naver-mate-hunter';

export type MobileJobState =
  | 'queued'
  | 'running'
  | 'streaming'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type MobileJobEventType =
  | 'created'
  | 'state'
  | 'progress'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type MobileResultGrade = 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C';

export type MobilePublishVerdict = 'publish' | 'conditional' | 'exclude';

export type MobileKeywordMeasurementStatus =
  | 'measured'
  | 'partial'
  | 'unmeasured'
  | 'synthetic-blocked';

export type MobileMeasurementConfidence = 'high' | 'medium' | 'low';

export type MobileSearchVolumeSource =
  | 'searchad'
  | 'cache'
  | 'manual'
  | 'unknown'
  | 'none';

export type MobileDocumentCountSource =
  | 'naver-api'
  | 'cache'
  | 'scrape'
  | 'fallback'
  | 'unknown'
  | 'none';

export type MobileKeywordAiJudgeVerdict = 'publish' | 'conditional' | 'exclude';

export interface MobileKeywordAiJudge {
  verdict: MobileKeywordAiJudgeVerdict;
  score: number;
  confidence: number;
  needIntent: 'strong' | 'medium' | 'weak';
  blogAngle: 'actionable' | 'informational' | 'thin' | 'unsafe';
  shoppingIntent: 'high' | 'medium' | 'low';
  adsenseValue: 'high' | 'medium' | 'low';
  freshnessRisk: 'low' | 'medium' | 'high';
  spamRisk: 'low' | 'medium' | 'high';
  reasons: string[];
  rejectReason?: string;
  model: 'rule-judge-v1' | 'ai-judge-v1';
  checkedAt: string;
}

export interface MobilePublishDecision {
  verdict: MobilePublishVerdict;
  label: string;
  score: number;
  reasons: string[];
  cautions: string[];
  nextAction: string;
  titleAngles: string[];
  clusterKeywords: string[];
}

export interface MobileShoppingProductPick {
  productName: string;
  productTitle?: string;
  mallName?: string;
  brand?: string;
  category?: string;
  imageUrl?: string;
  productUrl?: string;
  price?: number | null;
  conversionScore?: number | null;
  qualityScore?: number | null;
  hotSignalScore?: number | null;
  sellableReason?: string;
  writeRecommendation?: string;
  recommendedAngle: string;
  titleDrafts: string[];
  buyingTriggers: string[];
  caution?: string;
}

export interface MobileKeywordAgentInsight {
  label?: string;
  route?: string;
  subject?: string;
  searchVolumeReason?: string;
  combinationIntent?: string;
  autocompleteKeywords?: string[];
  relatedKeywords?: string[];
  expandedKeywords?: string[];
  sourceSummary?: string;
  warning?: string;
  generatedBy?: string;
}

export interface MobileKeywordMetric {
  keyword: string;
  grade: MobileResultGrade;
  score?: number | null;
  pcSearchVolume: number | null;
  mobileSearchVolume: number | null;
  totalSearchVolume: number | null;
  documentCount: number | null;
  goldenRatio: number | null;
  cpc: number | null;
  category: string;
  source: string;
  intent: string;
  evidence: string[];
  isMeasured: boolean;
  searchVolumeSource?: MobileSearchVolumeSource;
  searchVolumeConfidence?: MobileMeasurementConfidence;
  isSearchVolumeEstimated?: boolean;
  documentCountSource?: MobileDocumentCountSource;
  documentCountConfidence?: MobileMeasurementConfidence;
  isDocumentCountEstimated?: boolean;
  measurementStatus?: MobileKeywordMeasurementStatus;
  aiJudge?: MobileKeywordAiJudge;
  rejectReason?: string;
  publishDecision?: MobilePublishDecision;
  shoppingProductPick?: MobileShoppingProductPick;
  agentInsight?: MobileKeywordAgentInsight;
}

export interface MobileJobEnvelope<TParams, TResult> {
  id: string;
  product: MobileKeywordProduct;
  state: MobileJobState;
  params: TParams;
  result?: TResult;
  error?: string;
  progressPercent: number;
  progressMessage: string;
  createdAt: string;
  updatedAt: string;
}

export interface MobileJobEvent<TResult = MobileKeywordResult> {
  id: string;
  jobId: string;
  type: MobileJobEventType;
  state: MobileJobState;
  progressPercent: number;
  message: string;
  result?: TResult;
  error?: string;
  createdAt: string;
}

export interface MobileJobCreateResponse<TParams = unknown, TResult = MobileKeywordResult> {
  ok: true;
  job: MobileJobEnvelope<TParams, TResult>;
  stream: 'sse' | 'websocket' | 'json';
  links: {
    self: string;
    events: string;
    cancel: string;
  };
}

export interface MobileJobErrorResponse {
  ok: false;
  message: string;
}

export interface MobilePrewarmTarget {
  id: string;
  label: string;
  product: MobileKeywordProduct;
  params: unknown;
  priority: number;
}

export interface MobilePrewarmTargetState {
  id: string;
  label: string;
  product: MobileKeywordProduct;
  state: 'idle' | 'running' | 'cache-hit' | 'completed' | 'failed';
  updatedAt: string;
  summary?: MobileKeywordResult['summary'];
  error?: string;
}

export interface MobilePrewarmSnapshot {
  running: boolean;
  updatedAt: string;
  completed: number;
  failed: number;
  cacheHits: number;
  targets: MobilePrewarmTargetState[];
}

export type MobileNotificationKind = 'prewarm-winner' | 'live-golden' | 'fresh-issue' | 'system';

export interface MobileNotificationItem {
  id: string;
  kind: MobileNotificationKind;
  product: MobileKeywordProduct;
  title: string;
  keyword: string;
  grade: MobileResultGrade;
  category: string;
  intent: string;
  source: string;
  evidence: string[];
  totalSearchVolume: number | null;
  documentCount: number | null;
  goldenRatio: number | null;
  createdAt: string;
  updatedAt: string;
  read: boolean;
}

export interface MobileNotificationSnapshot {
  total: number;
  unreadCount: number;
  updatedAt: string;
  items: MobileNotificationItem[];
}

export type MobileLiveGoldenFreshness = 'live' | 'warm' | 'aging';

export interface MobileLiveGoldenBoardItem extends MobileKeywordMetric {
  id: string;
  rank: number;
  discoveredAt: string;
  updatedAt: string;
  freshness: MobileLiveGoldenFreshness;
  isPublicPreview: boolean;
  publicSearchVolumeLabel: string;
  publicDocumentCountLabel: string;
  publicReason: string;
  // 보드 레인 태그: 'traffic-surge' = 실시간 급등 레인(트렌딩 헤드의 자동완성 실수요 확장 →
  // 실측 → 기회지수). 정보형 레인과 게이트 철학이 다른 별도 상품 — 표시 분류용.
  lane?: string;
  // 관측 사실: 우리 자동완성 스냅샷 기준 최근(48h) 신규 진입 제안어 — 급등 레인 전용 태그
  surgeNewEntry?: boolean;
  // C2/C4 표시용 실측 부가필드(desktop keyword-discovery와 동일 이름) — 코어 등급/score/필터와 무관.
  // 예상순위/트래픽/수익 같은 추정치는 이 계약에 싣지 않는다(추정치 UI 노출 금지).
  valueGrade?: 'S+' | 'S' | 'A' | 'B' | 'C';
  valueSummary?: string;
  vacancySlots?: number;
  vacancyReliable?: boolean;
  vacancyAction?: string;
  briefRecommendedWords?: number;
  briefMustInclude?: string[];
  briefMeasured?: boolean;
  winnable?: boolean;
  serpMeasured?: boolean;
}

export interface MobileLiveGoldenRadarSnapshot {
  enabled: boolean;
  running: boolean;
  intervalMs: number;
  cycleLimit: number;
  maxCandidates: number;
  boardTarget: number;
  boardCount: number;
  pendingProbeQueueCount?: number;
  publicPreviewCount: number;
  boardUpdatedAt?: string;
  board: MobileLiveGoldenBoardItem[];
  publicPreview: MobileLiveGoldenBoardItem[];
  totalRuns: number;
  successfulRuns: number;
  skippedRuns: number;
  failedRuns: number;
  publishedCount: number;
  lastStartedAt?: string;
  lastFinishedAt?: string;
  nextRetryAt?: string;
  lastError?: string;
  lastMessage?: string;
  nextCategoryId: string;
  categories: string[];
}

export type MobilePushPlatform = 'expo' | 'android' | 'ios' | 'web';

export interface MobilePushSubscriptionRequest {
  pushToken: string;
  platform: MobilePushPlatform;
  deviceId?: string;
  appVersion?: string;
  locale?: string;
}

export interface MobilePushSubscription {
  id: string;
  pushToken: string;
  platform: MobilePushPlatform;
  deviceId: string | null;
  appVersion: string | null;
  locale: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MobilePushDeliveryRecord {
  id: string;
  notificationId: string;
  subscriptionId: string;
  pushToken: string;
  state: 'sent' | 'failed' | 'skipped';
  error?: string;
  createdAt: string;
}

export interface MobilePushSnapshot {
  enabledSubscriptions: number;
  disabledSubscriptions: number;
  updatedAt: string;
  recentDeliveries: MobilePushDeliveryRecord[];
}

export type MobileSignalKind = 'realtime' | 'policy' | 'issue';

export interface MobileSignalItem {
  id: string;
  kind: MobileSignalKind;
  keyword: string;
  title: string;
  description: string;
  source: string;
  priority: number;
  categoryId?: string;
  createdAt: string;
}

export interface MobileDashboardSnapshot {
  updatedAt: string;
  apiBaseUrl: string;
  pcLinked: boolean;
  realtime: MobileSignalItem[];
  policy: MobileSignalItem[];
  issues: MobileSignalItem[];
  notifications: MobileNotificationSnapshot | null;
  prewarm: MobilePrewarmSnapshot | null;
  liveGolden: MobileLiveGoldenRadarSnapshot | null;
}

export type MobileSourceSignalLane = 'all' | 'realtime' | 'policy' | 'issues';

export interface MobileSourceSignalSnapshot {
  updatedAt: string;
  fallbackUsed: boolean;
  realtime: MobileSignalItem[];
  policy: MobileSignalItem[];
  issues: MobileSignalItem[];
}

export type MobileApiDiagnosticStatus = 'ready' | 'partial' | 'missing';

export type MobileApiDiagnosticId =
  | 'naver-openapi'
  | 'naver-searchad'
  | 'youtube'
  | 'google-cse'
  | 'ai'
  | 'mobile-runtime';

export interface MobileApiKeyPresence {
  name: string;
  present: boolean;
  length: number;
}

export interface MobileApiDiagnosticItem {
  id: MobileApiDiagnosticId;
  label: string;
  status: MobileApiDiagnosticStatus;
  requiredForMobileResults: boolean;
  requiredKeys: string[];
  presentKeys: string[];
  missingKeys: string[];
  keyPresence: MobileApiKeyPresence[];
  affects: string[];
  recommendation: string;
}

export interface MobileApiStatusSnapshot {
  updatedAt: string;
  apiBaseUrl: string;
  overallStatus: MobileApiDiagnosticStatus;
  summary: {
    total: number;
    ready: number;
    partial: number;
    missing: number;
  };
  items: MobileApiDiagnosticItem[];
  runtime: {
    ok: boolean;
    failedRequired: number;
    failedRecommended: number;
  };
}

export interface MobileKeywordGroupItem {
  id: string;
  name: string;
  keywords: string[];
  keywordCount: number;
  source: 'pc-json' | 'mobile-api';
  createdAt: string;
  updatedAt: string;
}

export interface MobileKeywordGroupSnapshot {
  updatedAt: string;
  storage: 'pc-keyword-groups-json';
  total: number;
  groups: MobileKeywordGroupItem[];
}

export interface MobileKeywordGroupInput {
  name?: string;
  keywords?: string[];
  seedKeyword?: string;
}

export type MobileKeywordExportFormat = 'csv' | 'json' | 'text';

export interface MobileKeywordExportRequest {
  format: MobileKeywordExportFormat;
  title?: string;
  keywords: MobileKeywordMetric[];
}

export interface MobileKeywordExportArtifact {
  format: MobileKeywordExportFormat;
  filename: string;
  mimeType: string;
  content: string;
  shareText: string;
  itemCount: number;
  byteLength: number;
  createdAt: string;
}

export interface MobileWordPressCategory {
  id: string;
  name: string;
  count?: number;
}

export interface MobileWordPressSiteInput {
  id?: string;
  label?: string;
  siteUrl: string;
  username?: string;
  applicationPassword?: string;
  defaultCategoryId?: string | number;
  defaultCategoryName?: string;
  categories?: MobileWordPressCategory[];
}

export interface MobileWordPressSiteItem {
  id: string;
  label: string;
  siteUrl: string;
  usernameMasked: string;
  hasApplicationPassword: boolean;
  defaultCategoryId: string | null;
  defaultCategoryName: string | null;
  categories: MobileWordPressCategory[];
  source: 'pc-json' | 'mobile-api';
  updatedAt: string;
}

export interface MobileWordPressDraftInput {
  siteId?: string;
  title: string;
  keyword?: string;
  content?: string;
  excerpt?: string;
  categoryId?: string | number;
  categoryName?: string;
  tags?: string[];
  status?: 'draft' | 'publish' | 'future' | string;
  scheduleDateTime?: string;
}

export interface MobileWordPressPublishInput {
  siteId?: string;
  draftId?: string;
  title?: string;
  keyword?: string;
  content?: string;
  excerpt?: string;
  categoryId?: string | number;
  categoryName?: string;
  tags?: string[];
  status?: 'draft' | 'publish' | 'future' | string;
  scheduleDateTime?: string;
}

export interface MobileWordPressPublishResult {
  siteId: string;
  draftId: string;
  postId: string;
  postUrl: string;
  status: string;
  title: string;
  categoryIds: string[];
  createdAt: string;
}

export interface MobileWordPressDraftItem {
  id: string;
  siteId: string;
  title: string;
  keyword: string;
  status: string;
  categoryId: string | null;
  categoryName: string | null;
  tags: string[];
  scheduleDateTime: string | null;
  contentLength: number;
  preview: string;
  source: 'mobile-api' | 'pc-json';
  wpPostId?: string;
  wpPostUrl?: string;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MobileWordPressSnapshot {
  updatedAt: string;
  storage: 'pc-wordpress-publishing-json';
  configured: boolean;
  sites: {
    total: number;
    items: MobileWordPressSiteItem[];
  };
  drafts: {
    total: number;
    items: MobileWordPressDraftItem[];
  };
}

export type MobileScheduleStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'unknown';

export interface MobileKeywordScheduleItem {
  id: string;
  keyword: string;
  topic: string;
  keywords: string[];
  scheduleDateTime: string | null;
  status: MobileScheduleStatus;
  platform: string;
  publishType?: string;
  createdAt: string | null;
  updatedAt?: string | null;
  enabled: boolean;
}

export interface MobileKeywordScheduleCreateInput {
  keyword: string;
  topic?: string;
  keywords?: string[];
  scheduleDateTime: string;
  platform?: string;
  publishType?: 'schedule' | 'immediate' | string;
}

export interface MobileKeywordScheduleUpdateInput {
  keyword?: string;
  topic?: string;
  keywords?: string[];
  scheduleDateTime?: string;
  platform?: string;
  publishType?: 'schedule' | 'immediate' | string;
  enabled?: boolean;
}

export interface MobileScheduleActivityItem {
  type: string;
  keyword: string;
  date: string;
}

export interface MobileScheduleDashboardSnapshot {
  updatedAt: string;
  storage: {
    schedules: 'pc-schedules-json';
    notifications: 'pc-keyword-notifications-json';
    history: 'pc-keyword-history-json';
  };
  schedules: {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    cancelled: number;
    nextRunAt: string | null;
    items: MobileKeywordScheduleItem[];
  };
  notifications: {
    enabled: boolean;
    keywordCount: number;
    settingsCount: number;
  };
  keywords: {
    totalAnalyzed: number;
    recentTrendQueries: number;
    recentGoldenQueries: number;
  };
  recentActivity: {
    trends: MobileScheduleActivityItem[];
    golden: MobileScheduleActivityItem[];
  };
  groups: {
    total: number;
    top: MobileKeywordGroupItem[];
  };
}

export type MobileRankTrackingSource = 'exposure-tracking' | 'pro-hunter-v12';

export interface MobileRankTrackingHistoryPoint {
  checkedAt: string;
  rank: number | null;
  inTop10: boolean;
  inTop30: boolean;
  perKeyword?: Record<string, number | null>;
}

export interface MobileRankTrackingPostItem {
  id: string;
  source: MobileRankTrackingSource;
  keyword: string;
  keywords: string[];
  postUrl: string;
  postTitle: string;
  category: string;
  registeredAt: string | null;
  lastCheckedAt: string | null;
  currentRank: number | null;
  previousRank: number | null;
  rankChange: number | null;
  currentInTop10: boolean;
  currentInTop30: boolean;
  predictedRank: number | null;
  totalChecks: number;
  top10Count: number;
  top30Count: number;
  history: MobileRankTrackingHistoryPoint[];
}

export interface MobileRankTrackingKeywordItem {
  keyword: string;
  registeredAt: string | null;
  lastCheckedAt: string | null;
  initialDocCount: number | null;
  latestDocCount: number | null;
  latestSearchVolume: number | null;
  docDelta: number | null;
  totalChecks: number;
  alertCount: number;
  latestAlert: string | null;
  source: 'pro-hunter-v12';
}

export interface MobileRankTrackingCategorySummary {
  category: string;
  tracked: number;
  checked: number;
  top10: number;
  top30: number;
  hitRate10: number;
  hitRate30: number;
}

export interface MobileRankTrackingSnapshot {
  updatedAt: string;
  storage: {
    exposureTracked: 'pc-exposure-tracking-json';
    proTracking: 'pc-pro-hunter-v12-json';
  };
  configured: boolean;
  rssUrl: string | null;
  totals: {
    keywordHistorySize: number;
    exposureTrackedPairs: number;
    proTrackedPosts: number;
    proTrackedKeywords: number;
    trackedPairs: number;
    checkedPairs: number;
    uncheckedPairs: number;
    totalChecks: number;
    currentlyInTop30: number;
    currentlyInTop10: number;
    hitRate30: number;
    hitRate10: number;
    alerts: number;
  };
  byCategory: MobileRankTrackingCategorySummary[];
  posts: {
    total: number;
    items: MobileRankTrackingPostItem[];
  };
  keywords: {
    total: number;
    items: MobileRankTrackingKeywordItem[];
  };
}

export interface MobileRankTrackingManualInput {
  keyword: string;
  postUrl: string;
  postTitle?: string;
  category?: string;
}

export interface MobileProTrackedPostInput {
  keyword: string;
  postUrl: string;
  predictedRank?: number | null;
  keywords?: string[];
}

export interface MobileRankTrackingPairInput {
  keyword: string;
  postUrl: string;
}

export interface MobileRankTrackingRunInput {
  maxItems?: number;
  dryRun?: boolean;
}

export interface MobileRankTrackingActionResult {
  success: boolean;
  action: 'manual-add' | 'pro-post-add' | 'remove-pair' | 'run-serp-check';
  snapshot: MobileRankTrackingSnapshot;
  error?: string;
  message?: string | null;
  totalTracked?: number;
  removed?: number;
  checked?: number;
  exposed?: number;
  blocked?: number;
  errored?: number;
  hitRate30?: number;
  blockedHit?: boolean;
}

export interface MobileProOutcomeItem {
  postUrl: string;
  keyword: string;
  category: string;
  predictedRank: number;
  predictedTraffic: number;
  actualRank: number | null;
  actualMonthlyViews: number | null;
  actualMonthlyRevenue: number | null;
  firstExposureDays: number | null;
  rankError: number | null;
  revenuePerView: number | null;
  recordedAt: string | null;
  notes: string | null;
}

export interface MobileProOutcomeBenchmark {
  totalPosts: number;
  avgPredictionAccuracy: number;
  avgRankError: number;
  avgFirstExposureDays: number;
  totalMonthlyViews: number;
  totalMonthlyRevenue: number;
  avgRevenuePerPost: number;
  avgRevenuePerView: number;
  topPerformingKeywords: Array<{
    keyword: string;
    rank: number | null;
    views: number;
    revenue: number;
  }>;
  categoryBreakdown: Record<string, {
    posts: number;
    avgRank: number | null;
    revenue: number;
  }>;
  computedAt: string;
}

export interface MobileProOutcomeSnapshot {
  updatedAt: string;
  storage: 'pc-pro-hunter-v12-outcome-json';
  configured: boolean;
  totalRecords: number;
  measuredPosts: number;
  benchmark: MobileProOutcomeBenchmark;
  items: MobileProOutcomeItem[];
}

export interface MobileProOutcomeRecordInput {
  postUrl: string;
  keyword: string;
  category?: string;
  predictedRank?: number | null;
  predictedTraffic?: number | null;
  actualRank?: number | null;
  actualMonthlyViews?: number | null;
  actualMonthlyRevenue?: number | null;
  firstExposureDays?: number | null;
  notes?: string;
}

export interface MobileProOutcomeDeleteInput {
  postUrl: string;
}

export interface MobileProOutcomeActionResult {
  success: boolean;
  action: 'record-outcome' | 'delete-outcome' | 'sync-outcomes';
  snapshot: MobileProOutcomeSnapshot;
  record?: MobileProOutcomeItem;
  removed?: number;
  synced?: number;
  error?: string;
  message?: string | null;
}

export interface MobileProBlueprintInput {
  keyword: string;
  force?: boolean;
  searchVolume?: number | null;
}

export interface MobileProDraftInput {
  blueprint: unknown;
}

export interface MobileProRevenueEstimateInput {
  keyword: string;
  monthlyViews: number;
  category?: string;
}

export interface MobileProRevenueEstimate {
  keyword: string;
  category?: string;
  monthlyViews: number;
  adpostRevenue: number;
  coupangRevenue: number;
  totalMonthlyRevenue: number;
  effectiveRpm: number;
  breakdown: {
    categoryRpm: number;
    adpostEnabled: boolean;
    coupangEnabled: boolean;
    customMultiplier: number;
  };
  yearlyProjection: number;
}

export interface MobileProRevenueConfig {
  adpostEnabled: boolean;
  adpostAvgRpm: number;
  coupangEnabled: boolean;
  coupangAvgCommission: number;
  coupangCtr: number;
  customMultiplier: number;
  lastUpdatedAt: number;
}

export type MobileProRevenueConfigInput = Partial<Omit<MobileProRevenueConfig, 'lastUpdatedAt'>>;

export interface MobileProCategoryRpmItem {
  category: string;
  rpm: number;
}

export interface MobileProPortfolioRevenueItem {
  keyword: string;
  monthlyViews: number;
  category?: string;
}

export interface MobileProPortfolioRevenueInput {
  items: MobileProPortfolioRevenueItem[];
}

export interface MobileProPortfolioRevenueResult {
  totalMonthly: number;
  totalYearly: number;
  averagePerPost: number;
  topEarners: Array<{
    keyword: string;
    revenue: number;
  }>;
}

export interface MobileProBlueprintActionResult {
  success: boolean;
  action:
    | 'generate-blueprint'
    | 'generate-draft'
    | 'estimate-revenue'
    | 'read-revenue-config'
    | 'save-revenue-config'
    | 'list-category-rpm'
    | 'estimate-portfolio-revenue';
  error?: string;
  message?: string | null;
  blueprint?: any;
  analysis?: any;
  gaps?: any;
  prediction?: any;
  previousRecommendationFeedback?: any[];
  durationMs?: number;
  draft?: any;
  estimate?: MobileProRevenueEstimate;
  config?: MobileProRevenueConfig;
  table?: MobileProCategoryRpmItem[];
  result?: MobileProPortfolioRevenueResult;
}

export interface MobileAuthSession {
  ok: boolean;
  accessToken: string;
  userId: string;
  tier: string;
  apiBaseUrl: string;
  pcLinked: boolean;
  source: 'mobile-token' | 'panel-server' | 'configured-web-login' | 'local-dev';
  linkedAt: string;
  expiresAt?: string | null;
  message: string;
  dashboard: MobileDashboardSnapshot;
}

export type MobilePcFeatureTab =
  | 'today'
  | 'discovery'
  | 'analysis'
  | 'expansion'
  | 'premium'
  | 'schedule'
  | 'settings';

export type MobilePcFeatureStatus = 'ready' | 'linked' | 'planned' | 'pc-only';

export interface MobilePcFeatureCatalogItem {
  id: string;
  tab: MobilePcFeatureTab;
  module: string;
  handler: string;
  title: string;
  description: string;
  status: MobilePcFeatureStatus;
  mobileRoute?: string;
  mobileProduct?: MobileKeywordProduct;
  ipcEquivalent: string;
}

export interface MobilePcFeatureCatalog {
  updatedAt: string;
  totalHandlers: number;
  ready: number;
  linked: number;
  planned: number;
  pcOnly: number;
  tabs: Record<MobilePcFeatureTab, number>;
  items: MobilePcFeatureCatalogItem[];
}

export interface MobileAgentAssistContext {
  enabled?: boolean;
  version?: string;
  mode?: string;
  featureId?: string;
  provider?: string;
  providerLabel?: string;
  seedKeyword?: string | null;
  includeAiInference?: boolean;
  forceExternalInference?: boolean;
  externalAi?: boolean;
  maxAgentRows?: number;
  mindmapAssist?: boolean;
  keywordResearchAssist?: boolean;
  usageWindowHours?: number | null;
  tasks?: string[];
  qualityGates?: string[];
  mission?: string;
  mustFind?: string[];
  rejectIf?: string[];
  rankingRubric?: string[];
  researchChecklist?: string[];
  hunterCharter?: Record<string, unknown>;
  outputContract?: Record<string, unknown>;
  serverVerified?: boolean;
}

export interface MobileAgentAwareParams {
  includeAiInference?: boolean;
  agentAssist?: MobileAgentAssistContext;
  adminAiWorker?: MobileAgentAssistContext | null;
}

export interface GoldenDiscoveryMobileParams extends MobileAgentAwareParams {
  categoryId: string;
  mode: 'precision' | 'bulk';
  seedKeyword?: string;
  targetCount: number;
  requireSssFloor: boolean;
}

export interface ProTrafficMobileParams extends MobileAgentAwareParams {
  categoryId: string;
  targetCount: number;
  seedKeyword?: string;
  autoDiscovery?: boolean;
  includeSeasonal: boolean;
  includeEvergreen: boolean;
  includeFreshIssue: boolean;
  contextKeywords?: MobileKeywordContextCandidate[];
}

export interface KeywordAnalysisMobileParams extends MobileAgentAwareParams {
  keyword: string;
  categoryId?: string;
  maxRelatedCount: number;
  includeMindmapPreview: boolean;
  contextKeywords?: MobileKeywordContextCandidate[];
}

export interface MindmapExpansionMobileParams extends MobileAgentAwareParams {
  seedKeyword: string;
  depth: number;
  targetCount: number;
  includeVolumeMetrics: boolean;
  contextKeywords?: MobileKeywordContextCandidate[];
}

export interface MobileKeywordContextCandidate {
  keyword: string;
  pcSearchVolume?: number | null;
  mobileSearchVolume?: number | null;
  totalSearchVolume?: number | null;
  documentCount?: number | null;
  goldenRatio?: number | null;
  source?: string;
  evidence?: string[];
  isMeasured?: boolean;
}

export interface HomeBoardMobileParams extends MobileAgentAwareParams {
  categoryId: string;
  seedKeyword?: string;
  targetCount: number;
  requireSplusFloor: boolean;
}

export interface KinHiddenHoneyMobileParams extends MobileAgentAwareParams {
  tabType: 'popular' | 'latest' | 'trending' | 'hidden';
  targetCount: number;
  isPremiumRequest: boolean;
  contextKeywords?: MobileKeywordContextCandidate[];
}

export interface ShoppingConnectMobileParams extends MobileAgentAwareParams {
  keyword: string;
  targetCount: number;
  sort: 'sim' | 'date' | 'asc' | 'dsc';
  contextKeywords?: MobileKeywordContextCandidate[];
}

export interface YoutubeGoldenMobileParams extends MobileAgentAwareParams {
  maxResults: number;
  categoryId?: string;
  crossReferenceNaver: boolean;
}

export interface NaverMateMobileParams extends MobileAgentAwareParams {
  seedKeyword: string;
  targetCount: number;
  includeAutocomplete: boolean;
  includeRelated: boolean;
  includeVolumeMetrics: boolean;
  autoDiscovery?: boolean;
  contextKeywords?: MobileKeywordContextCandidate[];
}

export interface MobileKeywordResult {
  keywords: MobileKeywordMetric[];
  summary: {
    total: number;
    sss: number;
    measured: number;
    elapsedMs: number;
    fromCache: boolean;
    parityMode: 'pc-engine' | 'pc-engine-plus';
    aiJudged?: number;
    excludedByAiJudge?: number;
    publishReady?: number;
    agentFiltered?: number;
    agentQualityProfile?: string;
    agentInsightExternalProvider?: string;
    agentInsightExternalCount?: number;
    agentInsightExternalError?: string;
    agentAssist?: {
      enabled: boolean;
      product: MobileKeywordProduct;
      featureId?: string;
      provider?: string;
      mode?: string;
      tasks?: string[];
    };
  };
}

export interface MobileApiEndpointSpec {
  key: string;
  product: MobileKeywordProduct;
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  ipcEquivalent: string;
  transport: 'json' | 'sse' | 'websocket';
  requiresServerWorker: boolean;
  mobileCanRunLocally: boolean;
}

export const MOBILE_API_ENDPOINTS: readonly MobileApiEndpointSpec[] = Object.freeze([
  {
    key: 'createGoldenDiscoveryJob',
    product: 'golden-discovery',
    method: 'POST',
    path: '/v1/golden/discover',
    ipcEquivalent: 'discover-golden-keywords',
    transport: 'sse',
    requiresServerWorker: true,
    mobileCanRunLocally: false,
  },
  {
    key: 'createProTrafficJob',
    product: 'pro-traffic-hunter',
    method: 'POST',
    path: '/v1/pro/hunt',
    ipcEquivalent: 'hunt-pro-traffic-keywords',
    transport: 'sse',
    requiresServerWorker: true,
    mobileCanRunLocally: false,
  },
  {
    key: 'analyzeKeyword',
    product: 'keyword-analysis',
    method: 'POST',
    path: '/v1/keywords/analyze',
    ipcEquivalent: 'get-keyword-expansions',
    transport: 'sse',
    requiresServerWorker: true,
    mobileCanRunLocally: false,
  },
  {
    key: 'expandMindmap',
    product: 'mindmap-expansion',
    method: 'POST',
    path: '/v1/mindmap/expand',
    ipcEquivalent: 'expand-keyword-related-metrics',
    transport: 'sse',
    requiresServerWorker: true,
    mobileCanRunLocally: false,
  },
  {
    key: 'huntHomeBoard',
    product: 'home-board-hunter',
    method: 'POST',
    path: '/v1/home-board/hunt',
    ipcEquivalent: 'hunt-adsense-keywords',
    transport: 'sse',
    requiresServerWorker: true,
    mobileCanRunLocally: false,
  },
  {
    key: 'huntKinHiddenHoney',
    product: 'kin-hidden-honey',
    method: 'POST',
    path: '/v1/kin/honey',
    ipcEquivalent: 'search-kin-questions',
    transport: 'sse',
    requiresServerWorker: true,
    mobileCanRunLocally: false,
  },
  {
    key: 'runShoppingConnect',
    product: 'shopping-connect',
    method: 'POST',
    path: '/v1/shopping/connect',
    ipcEquivalent: 'shopping-connect-search',
    transport: 'sse',
    requiresServerWorker: true,
    mobileCanRunLocally: false,
  },
  {
    key: 'runYoutubeGolden',
    product: 'youtube-golden',
    method: 'POST',
    path: '/v1/youtube/golden',
    ipcEquivalent: 'youtube-golden-keywords',
    transport: 'sse',
    requiresServerWorker: true,
    mobileCanRunLocally: false,
  },
  {
    key: 'runNaverMateHunter',
    product: 'naver-mate-hunter',
    method: 'POST',
    path: '/v1/naver/mate',
    ipcEquivalent: 'get-autocomplete-suggestions',
    transport: 'sse',
    requiresServerWorker: true,
    mobileCanRunLocally: false,
  },
]);

export const MOBILE_JOB_ROUTES = Object.freeze({
  self: '/v1/jobs/:jobId',
  events: '/v1/jobs/:jobId/events',
  cancel: '/v1/jobs/:jobId',
});

export const MOBILE_PREWARM_ROUTES = Object.freeze({
  snapshot: '/v1/prewarm/snapshot',
  run: '/v1/prewarm/run',
});

export const MOBILE_LIVE_GOLDEN_ROUTES = Object.freeze({
  snapshot: '/v1/live-golden/snapshot',
  run: '/v1/live-golden/run',
  ingest: '/v1/live-golden/ingest',
});

export const MOBILE_NOTIFICATION_ROUTES = Object.freeze({
  inbox: '/v1/notifications',
  read: '/v1/notifications/:id/read',
});

export const MOBILE_PUSH_ROUTES = Object.freeze({
  register: '/v1/push/subscriptions',
  unregister: '/v1/push/subscriptions/:id',
});

export const MOBILE_AUTH_ROUTES = Object.freeze({
  login: '/v1/mobile/session',
  dashboard: '/v1/mobile/dashboard',
  pcFeatures: '/v1/mobile/pc-features',
});

export const MOBILE_SOURCE_ROUTES = Object.freeze({
  signals: '/v1/mobile/source-signals',
});

export const MOBILE_STATUS_ROUTES = Object.freeze({
  apiStatus: '/v1/mobile/api-status',
  naverApiSettings: '/v1/mobile/api-settings/naver',
});

export const MOBILE_KEYWORD_GROUP_ROUTES = Object.freeze({
  list: '/v1/mobile/keyword-groups',
  item: '/v1/mobile/keyword-groups/:id',
});

export const MOBILE_EXPORT_ROUTES = Object.freeze({
  keywords: '/v1/mobile/export/keywords',
});

export const MOBILE_WORDPRESS_ROUTES = Object.freeze({
  snapshot: '/v1/mobile/wordpress',
  site: '/v1/mobile/wordpress/site',
  categories: '/v1/mobile/wordpress/categories',
  drafts: '/v1/mobile/wordpress/drafts',
  publish: '/v1/mobile/wordpress/publish',
});

export const MOBILE_SCHEDULE_ROUTES = Object.freeze({
  dashboard: '/v1/mobile/schedule-dashboard',
  list: '/v1/mobile/schedules',
  item: '/v1/mobile/schedules/:id',
});

export const MOBILE_RANK_TRACKING_ROUTES = Object.freeze({
  snapshot: '/v1/mobile/rank-tracking',
  manual: '/v1/mobile/rank-tracking/manual',
  proPost: '/v1/mobile/rank-tracking/pro-post',
  run: '/v1/mobile/rank-tracking/run',
  pair: '/v1/mobile/rank-tracking/pair',
});

export const MOBILE_PRO_OUTCOME_ROUTES = Object.freeze({
  snapshot: '/v1/mobile/pro-outcomes',
  record: '/v1/mobile/pro-outcomes/record',
  item: '/v1/mobile/pro-outcomes/item',
  sync: '/v1/mobile/pro-outcomes/sync',
});

export const MOBILE_PRO_BLUEPRINT_ROUTES = Object.freeze({
  blueprint: '/v1/mobile/pro-blueprint',
  draft: '/v1/mobile/pro-blueprint/draft',
  revenue: '/v1/mobile/pro-blueprint/revenue',
  revenueConfig: '/v1/mobile/pro-blueprint/revenue-config',
  categoryRpm: '/v1/mobile/pro-blueprint/category-rpm',
  portfolioRevenue: '/v1/mobile/pro-blueprint/portfolio-revenue',
});

export const MOBILE_PC_PARITY_SLA = Object.freeze({
  devicePolicy: {
    heavyBrowserAutomation: 'server-only',
    mobileRuntimeRole: 'ui-cache-progress-results',
    serverRuntimeRole: 'pc-engine-plus-worker',
  },
  qualityFloors: {
    goldenPrecisionSss: 30,
    goldenBulkSss: 120,
    proTrafficMaxSssTarget: 250,
    mindmapDefaultMeasuredKeywords: 50,
    keywordAnalysisDefaultRelated: 10,
  },
  latencyBudgetsMs: {
    jobAcceptedP95: 1200,
    firstProgressP95: 2000,
    cachedResultP95: 1500,
    goldenPrecisionFirstPageP95: 10000,
    goldenBulkFirstPageP95: 15000,
    proTrafficFirstPageP95: 20000,
    mindmapFirstPageP95: 12000,
    progressHeartbeatP95: 2500,
  },
  workerBudgets: {
    minBrowserPoolSizePerWorker: 3,
    maxBrowserPoolSizePerWorker: 8,
    queueRetryLimit: 2,
    cacheTtlMinutesForFreshIssue: 15,
    proTrafficPrewarmCacheTtlMinutes: 1440,
    cacheTtlMinutesForEvergreen: 1440,
    liveGoldenIntervalMinutes: 12,
    liveGoldenCycleLimit: 15,
    liveGoldenMaxCandidates: 7200,
  },
  apiGuardrails: {
    maxBodyBytesDefault: 64 * 1024,
    maxRequestsPerMinuteDefault: 120,
  },
  releaseGates: {
    mustReusePcScoringEngine: true,
    mustStreamProgress: true,
    mustSupportCancellation: true,
    mustPreserveDesktopIpc: true,
    mustBlockOnDeviceCrawler: true,
    mustKeepRegressionSuiteGreen: true,
  },
});

export function getMobileEndpointByKey(key: string): MobileApiEndpointSpec | undefined {
  return MOBILE_API_ENDPOINTS.find((endpoint) => endpoint.key === key);
}

export function isServerOnlyMobileProduct(product: MobileKeywordProduct): boolean {
  return MOBILE_API_ENDPOINTS
    .filter((endpoint) => endpoint.product === product)
    .every((endpoint) => endpoint.requiresServerWorker && !endpoint.mobileCanRunLocally);
}
