import { buildMobilePcFeatureCatalog } from '../../mobile/pc-feature-catalog';
import {
  MOBILE_API_ENDPOINTS,
  MOBILE_AUTH_ROUTES,
  MOBILE_EXPORT_ROUTES,
  MOBILE_KEYWORD_GROUP_ROUTES,
  MOBILE_PRO_BLUEPRINT_ROUTES,
  MOBILE_PRO_OUTCOME_ROUTES,
  MOBILE_RANK_TRACKING_ROUTES,
  MOBILE_SCHEDULE_ROUTES,
  MOBILE_SOURCE_ROUTES,
  MOBILE_STATUS_ROUTES,
  MOBILE_WORDPRESS_ROUTES,
} from '../../mobile/contracts';

function assert(name: string, condition: unknown, detail = ''): void {
  if (!condition) {
    console.error(`[mobile-pc-feature-catalog] failed: ${name}${detail ? ` - ${detail}` : ''}`);
    process.exit(1);
  }
}

const catalog = buildMobilePcFeatureCatalog(new Date('2026-01-01T00:00:00.000Z'));
const readyHandlers = new Set(
  catalog.items
    .filter((item) => item.status === 'ready')
    .map((item) => item.ipcEquivalent),
);

assert('catalog scans the desktop IPC surface', catalog.totalHandlers >= 200, String(catalog.totalHandlers));
assert('catalog exposes every tab bucket', Object.values(catalog.tabs).every((count) => count > 0), JSON.stringify(catalog.tabs));
assert('catalog exposes current mobile feature route', MOBILE_AUTH_ROUTES.pcFeatures === '/v1/mobile/pc-features');
assert('ready count matches current job endpoints', catalog.ready === MOBILE_API_ENDPOINTS.length, `${catalog.ready} vs ${MOBILE_API_ENDPOINTS.length}`);

for (const endpoint of MOBILE_API_ENDPOINTS) {
  assert(`ready endpoint maps ${endpoint.ipcEquivalent}`, readyHandlers.has(endpoint.ipcEquivalent));
}

assert('dashboard linked handlers are represented',
  catalog.items.some((item) => item.ipcEquivalent === 'get-realtime-keywords' && item.mobileRoute === MOBILE_SOURCE_ROUTES.signals));
assert('policy and entertainment source handlers point to mobile source signals',
  catalog.items.some((item) => item.ipcEquivalent === 'source-policy-briefing-aggregate' && item.mobileRoute === MOBILE_SOURCE_ROUTES.signals)
    && catalog.items.some((item) => item.ipcEquivalent === 'source-entertainment-aggregate' && item.mobileRoute === MOBILE_SOURCE_ROUTES.signals));
assert('API key and health handlers point to mobile API status',
  catalog.items.some((item) => item.ipcEquivalent === 'check-api-keys' && item.mobileRoute === MOBILE_STATUS_ROUTES.apiStatus)
    && catalog.items.some((item) => item.ipcEquivalent === 'api-health-check' && item.mobileRoute === MOBILE_STATUS_ROUTES.apiStatus));
assert('keyword group handlers point to mobile keyword groups',
  catalog.items.some((item) => item.ipcEquivalent === 'get-keyword-groups' && item.mobileRoute === MOBILE_KEYWORD_GROUP_ROUTES.list)
    && catalog.items.some((item) => item.ipcEquivalent === 'add-keyword-group' && item.mobileRoute === MOBILE_KEYWORD_GROUP_ROUTES.list)
    && catalog.items.some((item) => item.ipcEquivalent === 'update-keyword-group' && item.mobileRoute === MOBILE_KEYWORD_GROUP_ROUTES.item)
    && catalog.items.some((item) => item.ipcEquivalent === 'delete-keyword-group' && item.mobileRoute === MOBILE_KEYWORD_GROUP_ROUTES.item));
assert('read-only schedule dashboard handlers point to mobile schedule dashboard',
  catalog.items.some((item) => item.ipcEquivalent === 'get-dashboard-stats' && item.mobileRoute === MOBILE_SCHEDULE_ROUTES.dashboard)
    && catalog.items.some((item) => item.ipcEquivalent === 'get-keyword-schedules' && item.mobileRoute === MOBILE_SCHEDULE_ROUTES.dashboard)
    && catalog.items.some((item) => item.ipcEquivalent === 'get-schedules' && item.mobileRoute === MOBILE_SCHEDULE_ROUTES.dashboard));
assert('schedule write handlers point to mobile schedule routes',
  catalog.items.some((item) => item.ipcEquivalent === 'add-keyword-schedule' && item.mobileRoute === MOBILE_SCHEDULE_ROUTES.list)
    && catalog.items.some((item) => item.ipcEquivalent === 'toggle-keyword-schedule' && item.mobileRoute === MOBILE_SCHEDULE_ROUTES.item)
    && catalog.items.some((item) => item.ipcEquivalent === 'add-schedule' && item.mobileRoute === MOBILE_SCHEDULE_ROUTES.list)
    && catalog.items.some((item) => item.ipcEquivalent === 'toggle-schedule' && item.mobileRoute === MOBILE_SCHEDULE_ROUTES.item));
assert('PC keyword export handlers point to mobile export share route',
  catalog.items.some((item) => item.ipcEquivalent === 'export-keywords-to-excel' && item.mobileRoute === MOBILE_EXPORT_ROUTES.keywords && item.status === 'linked')
    && catalog.items.some((item) => item.ipcEquivalent === 'rich-feed-export' && item.mobileRoute === MOBILE_EXPORT_ROUTES.keywords && item.status === 'linked'));
assert('WordPress publish compatibility handlers point to mobile WordPress routes',
  catalog.items.some((item) => item.ipcEquivalent === 'publish-content' && item.mobileRoute === MOBILE_WORDPRESS_ROUTES.publish && item.status === 'linked')
    && catalog.items.some((item) => item.ipcEquivalent === 'run-post' && item.mobileRoute === MOBILE_WORDPRESS_ROUTES.publish && item.status === 'linked')
    && catalog.items.some((item) => item.ipcEquivalent === 'wordpress-check-auth-status' && item.mobileRoute === MOBILE_WORDPRESS_ROUTES.snapshot && item.status === 'linked')
    && catalog.items.some((item) => item.ipcEquivalent === 'load-wordpress-categories' && item.mobileRoute === MOBILE_WORDPRESS_ROUTES.categories && item.status === 'linked'));
assert('rank tracking read handlers point to mobile rank tracking snapshot',
  catalog.items.some((item) => item.ipcEquivalent === 'exposure-get-stats' && item.mobileRoute === MOBILE_RANK_TRACKING_ROUTES.snapshot && item.status === 'linked' && item.tab === 'analysis')
    && catalog.items.some((item) => item.ipcEquivalent === 'pro12-list-tracked-posts' && item.mobileRoute === MOBILE_RANK_TRACKING_ROUTES.snapshot && item.status === 'linked')
    && catalog.items.some((item) => item.ipcEquivalent === 'pro12-list-tracked-keywords' && item.mobileRoute === MOBILE_RANK_TRACKING_ROUTES.snapshot && item.status === 'linked'));
assert('rank tracking action handlers point to mobile rank tracking action routes',
  catalog.items.some((item) => item.ipcEquivalent === 'exposure-add-manual' && item.mobileRoute === MOBILE_RANK_TRACKING_ROUTES.manual && item.status === 'linked' && item.tab === 'analysis')
    && catalog.items.some((item) => item.ipcEquivalent === 'exposure-run-serp-check' && item.mobileRoute === MOBILE_RANK_TRACKING_ROUTES.run && item.status === 'linked')
    && catalog.items.some((item) => item.ipcEquivalent === 'exposure-remove-pair' && item.mobileRoute === MOBILE_RANK_TRACKING_ROUTES.pair && item.status === 'linked')
    && catalog.items.some((item) => item.ipcEquivalent === 'pro12-add-tracked-post' && item.mobileRoute === MOBILE_RANK_TRACKING_ROUTES.proPost && item.status === 'linked')
    && catalog.items.some((item) => item.ipcEquivalent === 'pro12-run-rank-check' && item.mobileRoute === MOBILE_RANK_TRACKING_ROUTES.run && item.status === 'linked'));
assert('PRO outcome handlers point to mobile PRO outcome routes',
  catalog.items.some((item) => item.ipcEquivalent === 'pro12-list-outcomes' && item.mobileRoute === MOBILE_PRO_OUTCOME_ROUTES.snapshot && item.status === 'linked' && item.tab === 'premium')
    && catalog.items.some((item) => item.ipcEquivalent === 'pro12-record-outcome' && item.mobileRoute === MOBILE_PRO_OUTCOME_ROUTES.record && item.status === 'linked' && item.tab === 'premium')
    && catalog.items.some((item) => item.ipcEquivalent === 'pro12-delete-outcome' && item.mobileRoute === MOBILE_PRO_OUTCOME_ROUTES.item && item.status === 'linked')
    && catalog.items.some((item) => item.ipcEquivalent === 'pro12-compute-benchmark' && item.mobileRoute === MOBILE_PRO_OUTCOME_ROUTES.snapshot && item.status === 'linked')
    && catalog.items.some((item) => item.ipcEquivalent === 'pro12-sync-outcomes' && item.mobileRoute === MOBILE_PRO_OUTCOME_ROUTES.sync && item.status === 'linked'));
assert('PRO blueprint handlers point to mobile PRO blueprint routes',
  catalog.items.some((item) => item.ipcEquivalent === 'generate-keyword-blueprint' && item.mobileRoute === MOBILE_PRO_BLUEPRINT_ROUTES.blueprint && item.status === 'linked' && item.tab === 'premium')
    && catalog.items.some((item) => item.ipcEquivalent === 'pro12-generate-draft' && item.mobileRoute === MOBILE_PRO_BLUEPRINT_ROUTES.draft && item.status === 'linked' && item.tab === 'premium')
    && catalog.items.some((item) => item.ipcEquivalent === 'pro12-estimate-revenue' && item.mobileRoute === MOBILE_PRO_BLUEPRINT_ROUTES.revenue && item.status === 'linked' && item.tab === 'premium'));
assert('PRO revenue settings handlers point to mobile PRO revenue routes',
  catalog.items.some((item) => item.ipcEquivalent === 'pro12-revenue-config' && item.mobileRoute === MOBILE_PRO_BLUEPRINT_ROUTES.revenueConfig && item.status === 'linked' && item.tab === 'premium')
    && catalog.items.some((item) => item.ipcEquivalent === 'pro12-save-revenue-config' && item.mobileRoute === MOBILE_PRO_BLUEPRINT_ROUTES.revenueConfig && item.status === 'linked' && item.tab === 'premium')
    && catalog.items.some((item) => item.ipcEquivalent === 'pro12-category-rpm-table' && item.mobileRoute === MOBILE_PRO_BLUEPRINT_ROUTES.categoryRpm && item.status === 'linked' && item.tab === 'premium')
    && catalog.items.some((item) => item.ipcEquivalent === 'pro12-portfolio-revenue' && item.mobileRoute === MOBILE_PRO_BLUEPRINT_ROUTES.portfolioRevenue && item.status === 'linked' && item.tab === 'premium'));
assert('PC-only desktop actions remain marked',
  catalog.items.some((item) => item.ipcEquivalent === 'open-external-url' && item.status === 'pc-only'));

console.log('[mobile-pc-feature-catalog] passed');
