import { getMobileApiGuardrailOptions } from './api-guardrails';
import {
  getNaverBlogOpenApiCredentials,
  isNaverBlogOpenApiQuotaBlocked,
} from '../utils/naver-blog-api';

export type MobileRuntimeReadinessSeverity = 'required' | 'recommended';

export interface MobileRuntimeReadinessCheck {
  code: MobileRuntimeReadinessCode;
  name: string;
  ok: boolean;
  detail: string;
  severity: MobileRuntimeReadinessSeverity;
}

export type MobileRuntimeReadinessCode =
  | 'naver-openapi-credentials-configured'
  | 'naver-openapi-document-quota-available'
  | 'naver-searchad-credentials-configured'
  | 'naver-searchad-customer-id-configured'
  | 'production-entitlement-service-configured'
  | 'server-prewarm-scheduler-configured'
  | 'persistent-mobile-result-cache-configured'
  | 'push-delivery-configured'
  | 'push-timeout-valid'
  | 'mobile-api-request-guardrails-configured';

export interface MobileRuntimeReadinessReport {
  ok: boolean;
  generatedAt: string;
  mode: 'production-api-worker';
  summary: {
    passed: number;
    failedRequired: number;
    failedRecommended: number;
  };
  checks: MobileRuntimeReadinessCheck[];
  blockers: MobileRuntimeReadinessCheck[];
}

export interface MobileRuntimeReadinessOptions {
  env?: Record<string, string | undefined>;
  now?: () => Date;
}

function readEnv(env: Record<string, string | undefined>, names: string[]): string {
  for (const name of names) {
    const value = (env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

function isPlaceholderOrLocalUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|\.example(?:\/|$)|\.invalid(?:\/|$)|\.test(?:\/|$)|leword\.example(?:\/|$)/i.test(url);
}

function isProductionHttpsUrl(url: string): boolean {
  return /^https:\/\/[^/]+/i.test(url) && !isPlaceholderOrLocalUrl(url);
}

function check(
  code: MobileRuntimeReadinessCode,
  name: string,
  ok: boolean,
  detail: string,
  severity: MobileRuntimeReadinessSeverity = 'required',
): MobileRuntimeReadinessCheck {
  return { code, name, ok, detail, severity };
}

export function getMobileRuntimeReadiness(
  options: MobileRuntimeReadinessOptions = {},
): MobileRuntimeReadinessReport {
  const env = options.env || process.env;
  const now = options.now || (() => new Date());

  const naverClientId = readEnv(env, ['NAVER_CLIENT_ID', 'naverClientId']);
  const naverClientSecret = readEnv(env, ['NAVER_CLIENT_SECRET', 'naverClientSecret']);
  const searchAdLicense = readEnv(env, [
    'NAVER_SEARCH_AD_ACCESS_LICENSE',
    'NAVER_SEARCHAD_ACCESS_LICENSE',
    'naverSearchAdAccessLicense',
  ]);
  const searchAdSecret = readEnv(env, [
    'NAVER_SEARCH_AD_SECRET_KEY',
    'NAVER_SEARCHAD_SECRET_KEY',
    'naverSearchAdSecretKey',
  ]);
  const searchAdCustomerId = readEnv(env, [
    'NAVER_SEARCH_AD_CUSTOMER_ID',
    'NAVER_SEARCHAD_CUSTOMER_ID',
    'naverSearchAdCustomerId',
  ]);
  const entitlementUrl = readEnv(env, ['LEWORD_MOBILE_ENTITLEMENT_URL']);
  const pushProvider = readEnv(env, ['LEWORD_MOBILE_PUSH_PROVIDER']).toLowerCase();
  const pushEndpoint = readEnv(env, ['LEWORD_MOBILE_PUSH_ENDPOINT']);
  const cacheFile = readEnv(env, ['LEWORD_MOBILE_CACHE_FILE']);
  const prewarmInterval = Number(readEnv(env, ['LEWORD_MOBILE_PREWARM_INTERVAL_MINUTES']) || 0);
  const pushTimeout = Number(readEnv(env, ['LEWORD_MOBILE_PUSH_TIMEOUT_MS']) || 5000);
  const guardrails = getMobileApiGuardrailOptions(env);
  const naverOpenApiCredentialConfig = {
    clientId: naverClientId,
    clientSecret: naverClientSecret,
    env,
  };
  const naverOpenApiCredentials = getNaverBlogOpenApiCredentials(naverOpenApiCredentialConfig);
  const naverOpenApiQuotaBlocked = naverOpenApiCredentials.length > 0
    && isNaverBlogOpenApiQuotaBlocked(naverOpenApiCredentialConfig, now().getTime());

  const pushReady = pushProvider === 'expo' || isProductionHttpsUrl(pushEndpoint);

  const checks = [
    check(
      'naver-openapi-credentials-configured',
      'Naver Open API credentials configured',
      naverOpenApiCredentials.length > 0,
      naverOpenApiCredentials.length > 0
        ? `${naverOpenApiCredentials.length} OpenAPI key(s) configured for measured document counts`
        : 'required for measured document counts in keyword-analysis and mindmap-expansion',
    ),
    check(
      'naver-openapi-document-quota-available',
      'Naver Open API document quota available',
      naverOpenApiCredentials.length > 0 && !naverOpenApiQuotaBlocked,
      naverOpenApiCredentials.length === 0
        ? 'configure at least one Naver OpenAPI key before document-count jobs run'
        : naverOpenApiQuotaBlocked
          ? `all ${naverOpenApiCredentials.length} configured OpenAPI key(s) are in quota cooldown`
          : `${naverOpenApiCredentials.length} configured OpenAPI key(s) have available quota`,
    ),
    check(
      'naver-searchad-credentials-configured',
      'Naver SearchAd credentials configured',
      !!searchAdLicense && !!searchAdSecret,
      'required for measured PC/mobile/total search volume and CPC',
    ),
    check(
      'naver-searchad-customer-id-configured',
      'Naver SearchAd customer id configured',
      !!searchAdCustomerId,
      'recommended to avoid account inference for SearchAd X-Customer',
      'recommended',
    ),
    check(
      'production-entitlement-service-configured',
      'Production entitlement service configured',
      isProductionHttpsUrl(entitlementUrl),
      'set LEWORD_MOBILE_ENTITLEMENT_URL to the HTTPS account/license service',
    ),
    check(
      'server-prewarm-scheduler-configured',
      'Server prewarm scheduler configured',
      Number.isFinite(prewarmInterval) && prewarmInterval > 0,
      'set LEWORD_MOBILE_PREWARM_INTERVAL_MINUTES so fresh winners are warmed before mobile users ask',
    ),
    check(
      'persistent-mobile-result-cache-configured',
      'Persistent mobile result cache configured',
      !!cacheFile,
      'set LEWORD_MOBILE_CACHE_FILE so repeated mobile requests stay fast after process restarts',
    ),
    check(
      'push-delivery-configured',
      'Push delivery configured',
      pushReady,
      'set LEWORD_MOBILE_PUSH_PROVIDER=expo or LEWORD_MOBILE_PUSH_ENDPOINT to a production HTTPS push gateway',
    ),
    check(
      'push-timeout-valid',
      'Push timeout is finite',
      Number.isFinite(pushTimeout) && pushTimeout >= 1000,
      'recommended LEWORD_MOBILE_PUSH_TIMEOUT_MS >= 1000',
      'recommended',
    ),
    check(
      'mobile-api-request-guardrails-configured',
      'Mobile API request guardrails configured',
      guardrails.maxBodyBytes > 0 && guardrails.maxRequestsPerMinute > 0,
      `max body ${guardrails.maxBodyBytes} bytes; ${guardrails.maxRequestsPerMinute} requests/minute`,
      'recommended',
    ),
  ];

  const summary = {
    passed: checks.filter((item) => item.ok).length,
    failedRequired: checks.filter((item) => !item.ok && item.severity === 'required').length,
    failedRecommended: checks.filter((item) => !item.ok && item.severity === 'recommended').length,
  };

  return {
    ok: summary.failedRequired === 0,
    generatedAt: now().toISOString(),
    mode: 'production-api-worker',
    summary,
    checks,
    blockers: checks.filter((item) => !item.ok),
  };
}
