import {
  getMobileRuntimeReadiness,
} from '../../mobile/runtime-readiness';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

const fixedNow = () => new Date('2026-06-05T00:00:00.000Z');

function runEmptyEnv(): void {
  const report = getMobileRuntimeReadiness({ env: {}, now: fixedNow });
  assert('empty env is not production ready', report.ok === false);
  assert('empty env reports required blockers', report.summary.failedRequired >= 6);
  assert('empty env requires measured document counts',
    report.blockers.some((item) => item.name === 'Naver Open API credentials configured'));
  assert('empty env requires measured search volume',
    report.blockers.some((item) => item.name === 'Naver SearchAd credentials configured'));
}

function runReadyEnvWithSearchAdAliases(): void {
  const report = getMobileRuntimeReadiness({
    now: fixedNow,
    env: {
      NAVER_CLIENT_ID: 'naver-client',
      NAVER_CLIENT_SECRET: 'naver-secret',
      NAVER_SEARCHAD_ACCESS_LICENSE: 'searchad-license',
      NAVER_SEARCHAD_SECRET_KEY: 'searchad-secret',
      NAVER_SEARCHAD_CUSTOMER_ID: 'searchad-customer',
      LEWORD_MOBILE_ENTITLEMENT_URL: 'https://api.leword.app/mobile/entitlement',
      LEWORD_MOBILE_PREWARM_INTERVAL_MINUTES: '15',
      LEWORD_MOBILE_CACHE_FILE: 'C:\\leword\\mobile-cache.json',
      LEWORD_MOBILE_PUSH_PROVIDER: 'expo',
      LEWORD_MOBILE_PUSH_TIMEOUT_MS: '5000',
    },
  });

  assert('complete env is production ready', report.ok === true);
  assert('complete env has no required blockers', report.summary.failedRequired === 0);
  assert('SearchAd no-underscore aliases are accepted',
    report.checks.find((item) => item.name === 'Naver SearchAd credentials configured')?.ok === true);
}

function runPlaceholderUrlRejection(): void {
  const report = getMobileRuntimeReadiness({
    now: fixedNow,
    env: {
      NAVER_CLIENT_ID: 'naver-client',
      NAVER_CLIENT_SECRET: 'naver-secret',
      NAVER_SEARCH_AD_ACCESS_LICENSE: 'searchad-license',
      NAVER_SEARCH_AD_SECRET_KEY: 'searchad-secret',
      LEWORD_MOBILE_ENTITLEMENT_URL: 'https://api.leword.example/mobile/entitlement',
      LEWORD_MOBILE_PREWARM_INTERVAL_MINUTES: '15',
      LEWORD_MOBILE_CACHE_FILE: 'C:\\leword\\mobile-cache.json',
      LEWORD_MOBILE_PUSH_ENDPOINT: 'https://push.example/send',
    },
  });

  assert('placeholder URLs are not production ready', report.ok === false);
  assert('placeholder entitlement is blocked',
    report.blockers.some((item) => item.name === 'Production entitlement service configured'));
  assert('placeholder push endpoint is blocked',
    report.blockers.some((item) => item.name === 'Push delivery configured'));
}

runEmptyEnv();
runReadyEnvWithSearchAdAliases();
runPlaceholderUrlRejection();

console.log('[mobile-runtime-readiness.test] passed');
