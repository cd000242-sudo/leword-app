import fs from 'fs';
import path from 'path';
import {
  MOBILE_API_ENDPOINTS,
  MOBILE_AUTH_ROUTES,
  MOBILE_EXPORT_ROUTES,
  MOBILE_KEYWORD_GROUP_ROUTES,
  MOBILE_LIVE_GOLDEN_ROUTES,
  MOBILE_NOTIFICATION_ROUTES,
  MOBILE_PREWARM_ROUTES,
  MOBILE_PRO_BLUEPRINT_ROUTES,
  MOBILE_PRO_OUTCOME_ROUTES,
  MOBILE_PUSH_ROUTES,
  MOBILE_RANK_TRACKING_ROUTES,
  MOBILE_SOURCE_ROUTES,
  MOBILE_SCHEDULE_ROUTES,
  MOBILE_STATUS_ROUTES,
  MOBILE_WORDPRESS_ROUTES,
  type MobilePcFeatureCatalog,
  type MobilePcFeatureCatalogItem,
  type MobilePcFeatureStatus,
  type MobilePcFeatureTab,
} from './contracts';

const TAB_IDS: MobilePcFeatureTab[] = [
  'today',
  'discovery',
  'analysis',
  'expansion',
  'premium',
  'schedule',
  'settings',
];

const PC_ONLY_HANDLERS = new Set([
  'open-keyword-master-window',
  'open-external-url',
  'clipboard-write-text',
  'is-packaged',
  'is-developer-mode',
]);

const PRELOAD_COMPAT_HANDLERS: Array<{ moduleName: string; handler: string }> = [
  { moduleName: 'preload', handler: 'get-autocomplete-keywords' },
  { moduleName: 'preload', handler: 'get-related-keywords' },
  { moduleName: 'preload', handler: 'run-post' },
  { moduleName: 'preload', handler: 'publish-content' },
  { moduleName: 'preload', handler: 'check-platform-auth' },
  { moduleName: 'preload', handler: 'load-wordpress-categories' },
  { moduleName: 'preload', handler: 'test-wordpress-connection' },
  { moduleName: 'preload', handler: 'get-wordpress-categories' },
  { moduleName: 'preload', handler: 'get-wordpress-tags' },
  { moduleName: 'preload', handler: 'wordpress-check-auth-status' },
  { moduleName: 'preload', handler: 'youtube-trend-analysis' },
  { moduleName: 'preload', handler: 'youtube-title-patterns' },
  { moduleName: 'preload', handler: 'youtube-content-opportunity' },
  { moduleName: 'preload', handler: 'youtube-demand-signals' },
  { moduleName: 'preload', handler: 'youtube-benchmark' },
];

const LINKED_ROUTES: Record<string, string> = {
  'find-golden-keywords': '/v1/golden/discover',
  'hunt-golden-from-related': '/v1/golden/discover',
  'get-rich-golden-feed': MOBILE_LIVE_GOLDEN_ROUTES.snapshot,
  'get-public-golden-feed': MOBILE_LIVE_GOLDEN_ROUTES.snapshot,
  'rich-feed-drilldown': '/v1/golden/discover',
  'rich-feed-clear-cache': MOBILE_LIVE_GOLDEN_ROUTES.run,
  'trending-pump-run': MOBILE_LIVE_GOLDEN_ROUTES.run,
  'trending-pump-status': MOBILE_LIVE_GOLDEN_ROUTES.snapshot,
  'infinite-keyword-search': '/v1/pro/hunt',
  'get-niche-keywords': '/v1/golden/discover',
  'find-ultimate-niche-keywords': '/v1/golden/discover',
  'search-suffix-keywords': '/v1/mindmap/expand',
  'hunt-pro-traffic-keywords': '/v1/pro/hunt',
  'discover-golden-keywords': '/v1/golden/discover',
  'get-keyword-expansions': '/v1/keywords/analyze',
  'expand-keyword-related-metrics': '/v1/mindmap/expand',
  'generate-keyword-mindmap': '/v1/mindmap/expand',
  'get-autocomplete-suggestions': '/v1/naver/mate',
  'get-autocomplete-keywords': '/v1/naver/mate',
  'get-related-keywords': '/v1/naver/mate',
  'fetch-real-related-keywords': '/v1/naver/mate',
  'crawl-news-snippets': MOBILE_SOURCE_ROUTES.signals,
  'get-trending-keywords': MOBILE_SOURCE_ROUTES.signals,
  'get-realtime-keywords': MOBILE_SOURCE_ROUTES.signals,
  'get-google-trend-keywords': MOBILE_SOURCE_ROUTES.signals,
  'get-sns-trends': MOBILE_SOURCE_ROUTES.signals,
  'get-youtube-videos': '/v1/youtube/golden',
  'youtube-golden-keywords': '/v1/youtube/golden',
  'youtube-trend-analysis': '/v1/youtube/golden',
  'youtube-title-patterns': '/v1/youtube/golden',
  'youtube-content-opportunity': '/v1/youtube/golden',
  'youtube-demand-signals': '/v1/youtube/golden',
  'youtube-benchmark': '/v1/youtube/golden',
  'youtube-shorts-benchmark': '/v1/youtube/golden',
  'youtube-api-diagnose': MOBILE_STATUS_ROUTES.apiStatus,
  'source-starnews-trending': MOBILE_SOURCE_ROUTES.signals,
  'source-starnews-fresh': MOBILE_SOURCE_ROUTES.signals,
  'source-entertainment-aggregate': MOBILE_SOURCE_ROUTES.signals,
  'source-policy-briefing-aggregate': MOBILE_SOURCE_ROUTES.signals,
  'source-youtube-trending': MOBILE_SOURCE_ROUTES.signals,
  'source-wiki-top': MOBILE_SOURCE_ROUTES.signals,
  'source-wiki-rising': MOBILE_SOURCE_ROUTES.signals,
  'source-wiki-article-trend': MOBILE_SOURCE_ROUTES.signals,
  'source-ppomppu-hotdeals': MOBILE_SOURCE_ROUTES.signals,
  'source-shopping-keyword-rank': MOBILE_SOURCE_ROUTES.signals,
  'source-shopping-all-categories': MOBILE_SOURCE_ROUTES.signals,
  'source-shopping-segment-ranks': MOBILE_SOURCE_ROUTES.signals,
  'source-tiktok-hashtags': MOBILE_SOURCE_ROUTES.signals,
  'source-tiktok-keyword-insights': MOBILE_SOURCE_ROUTES.signals,
  'source-tiktok-rising': MOBILE_SOURCE_ROUTES.signals,
  'source-threads-search': MOBILE_SOURCE_ROUTES.signals,
  'source-threads-buzz': MOBILE_SOURCE_ROUTES.signals,
  'source-threads-batch-buzz': MOBILE_SOURCE_ROUTES.signals,
  'source-openalex-emerging': MOBILE_SOURCE_ROUTES.signals,
  'source-openalex-concepts': MOBILE_SOURCE_ROUTES.signals,
  'source-openalex-concept-trend': MOBILE_SOURCE_ROUTES.signals,
  'source-rakuten-ranking': MOBILE_SOURCE_ROUTES.signals,
  'source-rakuten-all': MOBILE_SOURCE_ROUTES.signals,
  'source-bigkinds-search': MOBILE_SOURCE_ROUTES.signals,
  'source-bigkinds-buzz': MOBILE_SOURCE_ROUTES.signals,
  'source-bigkinds-batch-buzz': MOBILE_SOURCE_ROUTES.signals,
  'source-theqoo-hot': MOBILE_SOURCE_ROUTES.signals,
  'source-bobae-best': MOBILE_SOURCE_ROUTES.signals,
  'source-oliveyoung-best': MOBILE_SOURCE_ROUTES.signals,
  'source-musinsa-ranking': MOBILE_SOURCE_ROUTES.signals,
  'source-aggregator-pull': MOBILE_SOURCE_ROUTES.signals,
  'source-aggregator-signals': MOBILE_SOURCE_ROUTES.signals,
  'source-aggregator-clear-cache': MOBILE_SOURCE_ROUTES.signals,
  'source-health-refresh': MOBILE_STATUS_ROUTES.apiStatus,
  'source-health-cached': MOBILE_STATUS_ROUTES.apiStatus,
  'source-health-quick': MOBILE_STATUS_ROUTES.apiStatus,
  'source-registry-list': MOBILE_STATUS_ROUTES.apiStatus,
  'source-unblock': MOBILE_STATUS_ROUTES.apiStatus,
  'source-storage-stats': MOBILE_STATUS_ROUTES.apiStatus,
  'source-storage-rising': MOBILE_SOURCE_ROUTES.signals,
  'source-storage-new': MOBILE_SOURCE_ROUTES.signals,
  'source-storage-clear': MOBILE_STATUS_ROUTES.apiStatus,
  'source-rate-stats': MOBILE_STATUS_ROUTES.apiStatus,
  'source-rate-reset': MOBILE_STATUS_ROUTES.apiStatus,
  'source-call-all': MOBILE_SOURCE_ROUTES.signals,
  'register-license': MOBILE_AUTH_ROUTES.login,
  'auto-login': MOBILE_AUTH_ROUTES.login,
  logout: MOBILE_AUTH_ROUTES.login,
  'get-license-info': MOBILE_AUTH_ROUTES.login,
  'refresh-license': MOBILE_AUTH_ROUTES.login,
  'check-premium-access': MOBILE_AUTH_ROUTES.login,
  'get-notifications': MOBILE_NOTIFICATION_ROUTES.inbox,
  'save-notification-settings': MOBILE_PUSH_ROUTES.register,
  'live-golden-radar': MOBILE_LIVE_GOLDEN_ROUTES.snapshot,
  'run-live-golden-radar': MOBILE_LIVE_GOLDEN_ROUTES.run,
  'run-daily-hunt-now': MOBILE_PREWARM_ROUTES.run,
  'get-pro-hunt-dashboard': MOBILE_PREWARM_ROUTES.snapshot,
  'get-pro-worker-status': '/health',
  'api-health-check': MOBILE_STATUS_ROUTES.apiStatus,
  'check-api-keys': MOBILE_STATUS_ROUTES.apiStatus,
  'test-api-keys': MOBILE_STATUS_ROUTES.apiStatus,
  'test-naver-api-keys': MOBILE_STATUS_ROUTES.apiStatus,
  'validate-env': MOBILE_STATUS_ROUTES.apiStatus,
  'get-system-status': '/health',
  'collect-now': MOBILE_PREWARM_ROUTES.run,
  'export-keywords-to-excel': MOBILE_EXPORT_ROUTES.keywords,
  'rich-feed-export': MOBILE_EXPORT_ROUTES.keywords,
  'generate-pro-excel-report': MOBILE_EXPORT_ROUTES.keywords,
  'add-monitoring-keyword': MOBILE_RANK_TRACKING_ROUTES.manual,
  'remove-monitoring-keyword': MOBILE_RANK_TRACKING_ROUTES.pair,
  'get-monitoring-keywords': MOBILE_RANK_TRACKING_ROUTES.snapshot,
  'get-keyword-monitoring-history': MOBILE_RANK_TRACKING_ROUTES.snapshot,
  'start-keyword-monitoring': MOBILE_RANK_TRACKING_ROUTES.run,
  'stop-keyword-monitoring': MOBILE_RANK_TRACKING_ROUTES.snapshot,
  'check-keyword-rank': MOBILE_RANK_TRACKING_ROUTES.run,
  'analyze-competitors': '/v1/keywords/analyze',
  'analyze-competitor-blog': '/v1/keywords/analyze',
  'analyze-benchmark-sniper': MOBILE_PRO_OUTCOME_ROUTES.snapshot,
  'analyze-blog-index': '/v1/keywords/analyze',
  'analyze-keyword-competition': '/v1/keywords/analyze',
  'crawl-blog-index': '/v1/keywords/analyze',
  'crawl-multiple-blog-index': '/v1/keywords/analyze',
  'analyze-keyword-flow': '/v1/keywords/analyze',
  'get-keyword-age-distribution': '/v1/keywords/analyze',
  'generate-keyword-combinations': '/v1/mindmap/expand',
  'get-seasonal-keywords': '/v1/mindmap/expand',
  'expand-with-lsi': '/v1/mindmap/expand',
  'expand-seeds-lsi-batch': '/v1/mindmap/expand',
  'localize-keywords-to-korean': '/v1/mindmap/expand',
  'analyze-content-gap': '/v1/mindmap/expand',
  'mine-qa-keywords': '/v1/kin/honey',
  'find-similar-keywords': '/v1/mindmap/expand',
  'semantic-test': '/v1/mindmap/expand',
  'semantic-status': MOBILE_STATUS_ROUTES.apiStatus,
  'semantic-enable': MOBILE_STATUS_ROUTES.apiStatus,
  'behavior-record': MOBILE_PRO_OUTCOME_ROUTES.record,
  'behavior-top': MOBILE_PRO_OUTCOME_ROUTES.snapshot,
  'behavior-clear': MOBILE_PRO_OUTCOME_ROUTES.snapshot,
  'calculate-revenue-prediction': MOBILE_PRO_BLUEPRINT_ROUTES.revenue,
  'evaluate-seo-checklist': MOBILE_PRO_BLUEPRINT_ROUTES.draft,
  'reverse-analyze-keywords': MOBILE_RANK_TRACKING_ROUTES.snapshot,
  'predict-golden-time': MOBILE_SCHEDULE_ROUTES.dashboard,
  'calculate-home-score': MOBILE_PRO_BLUEPRINT_ROUTES.blueprint,
  'predict-title-ctr': MOBILE_PRO_BLUEPRINT_ROUTES.draft,
  'generate-optimized-titles': MOBILE_PRO_BLUEPRINT_ROUTES.draft,
  'batch-generate-titles': MOBILE_PRO_BLUEPRINT_ROUTES.draft,
  'build-home-publish-plan': MOBILE_PRO_BLUEPRINT_ROUTES.blueprint,
  'batch-build-home-publish-plans': MOBILE_PRO_BLUEPRINT_ROUTES.blueprint,
  'analyze-vacancy': MOBILE_PRO_BLUEPRINT_ROUTES.blueprint,
  'batch-analyze-vacancy': MOBILE_PRO_BLUEPRINT_ROUTES.blueprint,
  'measure-freshness': MOBILE_PRO_BLUEPRINT_ROUTES.blueprint,
  'batch-measure-freshness': MOBILE_PRO_BLUEPRINT_ROUTES.blueprint,
  'record-home-publish': MOBILE_PRO_OUTCOME_ROUTES.record,
  'measure-home-exposure': MOBILE_RANK_TRACKING_ROUTES.run,
  'process-scheduled-measurements': MOBILE_RANK_TRACKING_ROUTES.run,
  'get-home-exposure-stats': MOBILE_RANK_TRACKING_ROUTES.snapshot,
  'verify-keyword-value': MOBILE_PRO_BLUEPRINT_ROUTES.blueprint,
  'batch-verify-keyword-value': MOBILE_PRO_BLUEPRINT_ROUTES.blueprint,
  'home-hunter-category-seeds': '/v1/home-board/hunt',
  'enrich-keywords-volume': '/v1/keywords/analyze',
  'calculate-unified-grade': '/v1/keywords/analyze',
  'batch-unified-grade': '/v1/keywords/analyze',
  'record-keyword-rejection': MOBILE_PRO_OUTCOME_ROUTES.record,
  'record-keyword-acceptance': MOBILE_PRO_OUTCOME_ROUTES.record,
  'get-preference-stats': MOBILE_PRO_OUTCOME_ROUTES.snapshot,
  'record-pro-feedback': MOBILE_PRO_OUTCOME_ROUTES.record,
  'get-pro-calibrations': MOBILE_PRO_OUTCOME_ROUTES.snapshot,
  'run-post': MOBILE_WORDPRESS_ROUTES.publish,
  'publish-content': MOBILE_WORDPRESS_ROUTES.publish,
  'check-platform-auth': MOBILE_WORDPRESS_ROUTES.snapshot,
  'load-wordpress-categories': MOBILE_WORDPRESS_ROUTES.categories,
  'test-wordpress-connection': MOBILE_WORDPRESS_ROUTES.categories,
  'get-wordpress-categories': MOBILE_WORDPRESS_ROUTES.categories,
  'get-wordpress-tags': MOBILE_WORDPRESS_ROUTES.categories,
  'wordpress-check-auth-status': MOBILE_WORDPRESS_ROUTES.snapshot,
  'get-schedules': MOBILE_SCHEDULE_ROUTES.dashboard,
  'get-keyword-schedules': MOBILE_SCHEDULE_ROUTES.dashboard,
  'get-dashboard-stats': MOBILE_SCHEDULE_ROUTES.dashboard,
  'add-schedule': MOBILE_SCHEDULE_ROUTES.list,
  'add-keyword-schedule': MOBILE_SCHEDULE_ROUTES.list,
  'toggle-schedule': MOBILE_SCHEDULE_ROUTES.item,
  'toggle-keyword-schedule': MOBILE_SCHEDULE_ROUTES.item,
  'get-keyword-groups': MOBILE_KEYWORD_GROUP_ROUTES.list,
  'add-keyword-group': MOBILE_KEYWORD_GROUP_ROUTES.list,
  'update-keyword-group': MOBILE_KEYWORD_GROUP_ROUTES.item,
  'delete-keyword-group': MOBILE_KEYWORD_GROUP_ROUTES.item,
  'exposure-get-stats': MOBILE_RANK_TRACKING_ROUTES.snapshot,
  'exposure-add-manual': MOBILE_RANK_TRACKING_ROUTES.manual,
  'exposure-remove-pair': MOBILE_RANK_TRACKING_ROUTES.pair,
  'exposure-run-serp-check': MOBILE_RANK_TRACKING_ROUTES.run,
  'pro12-list-tracked-keywords': MOBILE_RANK_TRACKING_ROUTES.snapshot,
  'pro12-list-tracked-posts': MOBILE_RANK_TRACKING_ROUTES.snapshot,
  'pro12-add-tracked-post': MOBILE_RANK_TRACKING_ROUTES.proPost,
  'pro12-remove-tracked-post': MOBILE_RANK_TRACKING_ROUTES.pair,
  'pro12-run-rank-check': MOBILE_RANK_TRACKING_ROUTES.run,
  'pro12-list-outcomes': MOBILE_PRO_OUTCOME_ROUTES.snapshot,
  'pro12-record-outcome': MOBILE_PRO_OUTCOME_ROUTES.record,
  'pro12-delete-outcome': MOBILE_PRO_OUTCOME_ROUTES.item,
  'pro12-compute-benchmark': MOBILE_PRO_OUTCOME_ROUTES.snapshot,
  'pro12-sync-outcomes': MOBILE_PRO_OUTCOME_ROUTES.sync,
  'generate-keyword-blueprint': MOBILE_PRO_BLUEPRINT_ROUTES.blueprint,
  'pro12-generate-draft': MOBILE_PRO_BLUEPRINT_ROUTES.draft,
  'pro12-generate-titles-meta': MOBILE_PRO_BLUEPRINT_ROUTES.draft,
  'pro12-analyze-seasonality': MOBILE_PRO_BLUEPRINT_ROUTES.blueprint,
  'pro12-self-metrics': MOBILE_PRO_OUTCOME_ROUTES.snapshot,
  'pro12-retrain-model': MOBILE_PRO_OUTCOME_ROUTES.snapshot,
  'pro12-authority-insight': MOBILE_PRO_BLUEPRINT_ROUTES.blueprint,
  'pro12-authority-stats': MOBILE_PRO_BLUEPRINT_ROUTES.blueprint,
  'pro12-precrawl-enqueue': MOBILE_PREWARM_ROUTES.run,
  'pro12-precrawl-run': MOBILE_PREWARM_ROUTES.run,
  'pro12-precrawl-status': MOBILE_PREWARM_ROUTES.snapshot,
  'pro12-generate-pyramid': MOBILE_PRO_BLUEPRINT_ROUTES.blueprint,
  'pro12-block-entry-plan': MOBILE_PRO_BLUEPRINT_ROUTES.blueprint,
  'pro12-estimate-revenue': MOBILE_PRO_BLUEPRINT_ROUTES.revenue,
  'pro12-revenue-config': MOBILE_PRO_BLUEPRINT_ROUTES.revenueConfig,
  'pro12-save-revenue-config': MOBILE_PRO_BLUEPRINT_ROUTES.revenueConfig,
  'pro12-category-rpm-table': MOBILE_PRO_BLUEPRINT_ROUTES.categoryRpm,
  'pro12-portfolio-revenue': MOBILE_PRO_BLUEPRINT_ROUTES.portfolioRevenue,
  'pro12-scan-surges': MOBILE_LIVE_GOLDEN_ROUTES.run,
  'pro12-detect-surge': MOBILE_LIVE_GOLDEN_ROUTES.run,
  'pro12-list-surges': MOBILE_LIVE_GOLDEN_ROUTES.snapshot,
};

function handlerFiles(): string[] {
  const handlersDir = path.resolve(__dirname, '..', 'main', 'handlers');
  if (!fs.existsSync(handlersDir)) return [];
  return fs.readdirSync(handlersDir)
    .filter((file) => file.endsWith('.ts'))
    .map((file) => path.join(handlersDir, file));
}

function extractHandlers(filePath: string): string[] {
  const source = fs.readFileSync(filePath, 'utf8');
  return Array.from(source.matchAll(/ipcMain\.handle\(['"]([^'"]+)['"]/g))
    .map((match) => match[1])
    .sort((a, b) => a.localeCompare(b));
}

function tabFor(moduleName: string, handler: string): MobilePcFeatureTab {
  const key = `${moduleName}:${handler}`;
  if (/(wordpress|publish-content|run-post|platform-auth|load-wordpress|get-wordpress|test-wordpress)/.test(key)) {
    return 'settings';
  }
  if (/(generate-keyword-blueprint|pro12-generate-draft|pro12-estimate-revenue|pro12-revenue-config|pro12-save-revenue-config|pro12-category-rpm-table|pro12-portfolio-revenue)/.test(key)) {
    return 'premium';
  }
  if (/(license|key-wizard|config|window|env|api|cache|tutorial|mode|whitelist|system|clipboard|external|export)/.test(key)) {
    return 'settings';
  }
  if (/(rank|serp|exposure|tracked-post|tracked-keyword|pro12-list-tracked|pro12-run-rank)/.test(key)) {
    return 'analysis';
  }
  if (/(outcome|benchmark|pro12-record-outcome|pro12-delete-outcome|pro12-sync-outcomes)/.test(key)) {
    return 'premium';
  }
  if (/(schedule|notification|dashboard|group|prewarm|precrawl|lifecycle|tracked)/.test(key)) {
    return 'schedule';
  }
  if (/(rpm|cpc|cvi|pro|adsense|profit|revenue|vacancy|freshness|home|title|blueprint|manus|shopping|tiktok|rakuten|portfolio)/.test(key)) {
    return 'premium';
  }
  if (/(mindmap|expansion|expand|related|autocomplete|lsi|localize|content-gap|qa|suffix)/.test(key)) {
    return 'expansion';
  }
  if (/(analysis|analyze|rank|competitor|competition|blog-index|age|exposure|semantic|trend-30day|measure)/.test(key)) {
    return 'analysis';
  }
  if (/(realtime|trending|popular|policy|issue|source-|news|youtube|sns|wiki|starnews|entertainment|theqoo|bobae|oliveyoung|musinsa|bigkinds)/.test(key)) {
    return 'today';
  }
  return 'discovery';
}

function statusFor(handler: string): {
  status: MobilePcFeatureStatus;
  route?: string;
  product?: MobilePcFeatureCatalogItem['mobileProduct'];
} {
  const endpoint = MOBILE_API_ENDPOINTS.find((item) => item.ipcEquivalent === handler);
  if (endpoint) {
    return { status: 'ready', route: endpoint.path, product: endpoint.product };
  }
  const linkedRoute = LINKED_ROUTES[handler];
  if (linkedRoute) {
    const linkedEndpoint = MOBILE_API_ENDPOINTS.find((item) => item.path === linkedRoute);
    if (linkedEndpoint) {
      return { status: 'ready', route: linkedEndpoint.path, product: linkedEndpoint.product };
    }
    return { status: 'linked', route: linkedRoute };
  }
  if (PC_ONLY_HANDLERS.has(handler)) return { status: 'pc-only' };
  return { status: 'planned' };
}

function readableTitle(handler: string): string {
  return handler
    .replace(/^source-/, '')
    .replace(/^pro12-/, 'pro12 ')
    .split(/[-:]/)
    .filter(Boolean)
    .map((part) => part.replace(/^\w/, (char) => char.toUpperCase()))
    .join(' ');
}

function descriptionFor(status: MobilePcFeatureStatus, moduleName: string): string {
  if (status === 'ready') return '모바일에서 바로 PC 엔진 작업으로 실행됩니다.';
  if (status === 'linked') return '모바일 대시보드, 로그인, 예열, 알림 API와 연결되어 있습니다.';
  if (status === 'pc-only') return '파일, 창, 클립보드처럼 PC 데스크톱에서만 처리하는 기능입니다.';
  return `${moduleName} PC 핸들러로 확인됐고 모바일 실행 API 연결 대기 중입니다.`;
}

export function buildMobilePcFeatureCatalog(now = new Date()): MobilePcFeatureCatalog {
  const items: MobilePcFeatureCatalogItem[] = [];
  const seen = new Set<string>();

  for (const filePath of handlerFiles()) {
    const moduleName = path.basename(filePath, '.ts');
    for (const handler of extractHandlers(filePath)) {
      seen.add(handler);
      const status = statusFor(handler);
      items.push({
        id: `${moduleName}:${handler}`,
        tab: tabFor(moduleName, handler),
        module: moduleName,
        handler,
        title: readableTitle(handler),
        description: descriptionFor(status.status, moduleName),
        status: status.status,
        mobileRoute: status.route,
        mobileProduct: status.product,
        ipcEquivalent: handler,
      });
    }
  }

  for (const item of PRELOAD_COMPAT_HANDLERS) {
    if (seen.has(item.handler)) continue;
    const status = statusFor(item.handler);
    items.push({
      id: `${item.moduleName}:${item.handler}`,
      tab: tabFor(item.moduleName, item.handler),
      module: item.moduleName,
      handler: item.handler,
      title: readableTitle(item.handler),
      description: descriptionFor(status.status, item.moduleName),
      status: status.status,
      mobileRoute: status.route,
      mobileProduct: status.product,
      ipcEquivalent: item.handler,
    });
  }

  const tabs = Object.fromEntries(TAB_IDS.map((tab) => [tab, 0])) as Record<MobilePcFeatureTab, number>;
  let ready = 0;
  let linked = 0;
  let planned = 0;
  let pcOnly = 0;

  for (const item of items) {
    tabs[item.tab] += 1;
    if (item.status === 'ready') ready += 1;
    else if (item.status === 'linked') linked += 1;
    else if (item.status === 'pc-only') pcOnly += 1;
    else planned += 1;
  }

  return {
    updatedAt: now.toISOString(),
    totalHandlers: items.length,
    ready,
    linked,
    planned,
    pcOnly,
    tabs,
    items: items.sort((a, b) => (
      TAB_IDS.indexOf(a.tab) - TAB_IDS.indexOf(b.tab)
      || a.module.localeCompare(b.module)
      || a.handler.localeCompare(b.handler)
    )),
  };
}
