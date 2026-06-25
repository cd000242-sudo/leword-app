import { getMobileApiGuardrailOptions } from './api-guardrails';
import {
  getNaverBlogOpenApiCredentials,
  isNaverBlogOpenApiQuotaBlocked,
} from '../utils/naver-blog-api';

export type MobileRuntimeReadinessSeverity = 'required' | 'recommended';

export interface MobileRuntimeReadinessCheck {
  name: string;
  ok: boolean;
  detail: string;
  severity: MobileRuntimeReadinessSeverity;
}

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
  name: string,
  ok: boolean,
  detail: string,
  severity: MobileRuntimeReadinessSeverity = 'required',
): MobileRuntimeReadinessCheck {
  return { name, ok, detail, severity };
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
      'Naver Open API credentials configured',
      naverOpenApiCredentials.length > 0,
      naverOpenApiCredentials.length > 0
        ? `${naverOpenApiCredentials.length} OpenAPI key(s) configured for measured document counts`
        : 'required for measured document counts in keyword-analysis and mindmap-expansion',
    ),
    check(
      'Naver Open API document quota available',
      naverOpenApiCredentials.length > 0 && !naverOpenApiQuotaBlocked,
      naverOpenApiCredentials.length === 0
        ? 'configure at least one Naver OpenAPI key before document-count jobs run'
        : naverOpenApiQuotaBlocked
          ? `all ${naverOpenApiCredentials.length} configured OpenAPI key(s) are in quota cooldown`
          : `${naverOpenApiCredentials.length} configured OpenAPI key(s) have available quota`,
    ),
    check(
      'Naver SearchAd credentials configured',
      !!searchAdLicense && !!searchAdSecret,
      'required for measured PC/mobile/total search volume and CPC',
    ),
    check(
      'Naver SearchAd customer id configured',
      !!searchAdCustomerId,
      'recommended to avoid account inference for SearchAd X-Customer',
      'recommended',
    ),
    check(
      'Production entitlement service configured',
      isProductionHttpsUrl(entitlementUrl),
      'set LEWORD_MOBILE_ENTITLEMENT_URL to the HTTPS account/license service',
    ),
    check(
      'Server prewarm scheduler configured',
      Number.isFinite(prewarmInterval) && prewarmInterval > 0,
      'set LEWORD_MOBILE_PREWARM_INTERVAL_MINUTES so fresh winners are warmed before mobile users ask',
    ),
    check(
      'Persistent mobile result cache configured',
      !!cacheFile,
      'set LEWORD_MOBILE_CACHE_FILE so repeated mobile requests stay fast after process restarts',
    ),
    check(
      'Push delivery configured',
      pushReady,
      'set LEWORD_MOBILE_PUSH_PROVIDER=expo or LEWORD_MOBILE_PUSH_ENDPOINT to a production HTTPS push gateway',
    ),
    check(
      'Push timeout is finite',
      Number.isFinite(pushTimeout) && pushTimeout >= 1000,
      'recommended LEWORD_MOBILE_PUSH_TIMEOUT_MS >= 1000',
      'recommended',
    ),
    check(
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
