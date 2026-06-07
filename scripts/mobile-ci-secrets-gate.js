function isTruthy(value) {
  return ['1', 'true', 'yes', 'y'].includes(String(value || '').trim().toLowerCase());
}

function readArg(argv, name, fallback = '') {
  const equals = argv.find((arg) => arg.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = argv.indexOf(name);
  if (index >= 0) return argv[index + 1] || fallback;
  return fallback;
}

function isProductionHttpsUrl(url) {
  return /^https:\/\/[^/]+/i.test(String(url || ''))
    && !/localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|\.example(?:\/|$)|\.invalid(?:\/|$)|\.test(?:\/|$)|leword\.example(?:\/|$)/i.test(String(url || ''));
}

function normalizeTarget(target) {
  const value = String(target || 'verify-only').trim();
  const allowed = ['verify-only', 'api-image', 'android-internal', 'android-public', 'ios-testflight', 'full-release'];
  if (allowed.includes(value)) return value;
  throw new Error(`unknown mobile CI target: ${value}`);
}

function needsAppReleaseInputs(target) {
  return target === 'android-internal' || target === 'android-public' || target === 'ios-testflight' || target === 'full-release';
}

function check(name, ok, detail, severity = 'required') {
  return { name, ok: !!ok, detail, severity };
}

function envValue(env, name) {
  return String(env[name] || '').trim();
}

function has(env, name) {
  return envValue(env, name).length > 0;
}

function hasAscApiKeySecretSet(env) {
  return has(env, 'EXPO_ASC_API_KEY_P8_B64')
    && has(env, 'EXPO_ASC_API_KEY_ISSUER_ID')
    && has(env, 'EXPO_ASC_API_KEY_ID');
}

function hasAppleSubmitAuth(env) {
  return has(env, 'EXPO_APPLE_APP_SPECIFIC_PASSWORD') || hasAscApiKeySecretSet(env);
}

function collectMobileCiSecretsGate(options = {}) {
  const argv = options.argv || [];
  const env = options.env || process.env;
  const target = normalizeTarget(options.target || readArg(argv, '--target', env.MOBILE_RELEASE_TARGET || 'verify-only'));
  const submitToStores = options.submitToStores ?? isTruthy(readArg(argv, '--submit', env.SUBMIT_TO_STORES || 'false'));
  const runApiSmoke = options.runApiSmoke ?? isTruthy(readArg(argv, '--smoke', env.RUN_API_SMOKE || 'false'));

  const checks = [
    check('Mobile CI target is valid', true, target),
  ];

  if (needsAppReleaseInputs(target)) {
    checks.push(
      check('Production API URL variable is configured',
        isProductionHttpsUrl(envValue(env, 'EXPO_PUBLIC_LEWORD_API_URL')),
        'set GitHub variable LEWORD_MOBILE_API_URL to the deployed HTTPS API'),
      check('Expo project id variable is configured',
        has(env, 'EXPO_PUBLIC_EAS_PROJECT_ID'),
        'set GitHub variable EXPO_PUBLIC_EAS_PROJECT_ID'),
      check('Privacy URL variable is configured',
        isProductionHttpsUrl(envValue(env, 'EXPO_PUBLIC_LEWORD_PRIVACY_URL')),
        'set GitHub variable LEWORD_PRIVACY_URL'),
      check('EAS token secret is configured',
        has(env, 'EXPO_TOKEN'),
        'set GitHub secret EXPO_TOKEN'),
      check('Naver Open API credentials are configured',
        has(env, 'NAVER_CLIENT_ID') && has(env, 'NAVER_CLIENT_SECRET'),
        'set GitHub secrets NAVER_CLIENT_ID and NAVER_CLIENT_SECRET'),
      check('Naver SearchAd credentials are configured',
        has(env, 'NAVER_SEARCH_AD_ACCESS_LICENSE') && has(env, 'NAVER_SEARCH_AD_SECRET_KEY') && has(env, 'NAVER_SEARCH_AD_CUSTOMER_ID'),
        'set GitHub SearchAd secrets including customer id'),
      check('Mobile entitlement URL variable is configured',
        isProductionHttpsUrl(envValue(env, 'LEWORD_MOBILE_ENTITLEMENT_URL')),
        'set GitHub variable LEWORD_MOBILE_ENTITLEMENT_URL'),
      check('Mobile prewarm interval variable is configured',
        Number(envValue(env, 'LEWORD_MOBILE_PREWARM_INTERVAL_MINUTES')) > 0,
        'set GitHub variable LEWORD_MOBILE_PREWARM_INTERVAL_MINUTES'),
    );
  }

  if (target === 'android-public') {
    checks.push(
      check('Public Android release submits to Google Play',
        submitToStores === true,
        'android-public target must run with submit_to_stores=true'),
      check('Public Android release runs deployed API smoke',
        runApiSmoke === true,
        'android-public target must run with run_api_smoke=true before public submit'),
    );
  }

  if (runApiSmoke) {
    checks.push(
      check('API smoke URL is production HTTPS',
        isProductionHttpsUrl(envValue(env, 'LEWORD_MOBILE_SMOKE_API_URL') || envValue(env, 'EXPO_PUBLIC_LEWORD_API_URL')),
        'set GitHub variable LEWORD_MOBILE_API_URL'),
      check('API smoke token secret is configured',
        has(env, 'LEWORD_MOBILE_SMOKE_TOKEN'),
        'set GitHub secret LEWORD_MOBILE_SMOKE_TOKEN for protected production APIs'),
    );
  }

  if (submitToStores && (target === 'android-internal' || target === 'android-public' || target === 'full-release')) {
    checks.push(check('Google Play service account secret is configured',
      has(env, 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64'),
      'set GitHub secret GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64'));
  }

  if (target === 'android-public') {
    checks.push(check('Reviewer demo token readiness is configured',
      isTruthy(envValue(env, 'LEWORD_MOBILE_REVIEWER_TOKEN_READY')),
      'set GitHub secret LEWORD_MOBILE_REVIEWER_TOKEN_READY=true after reviewer notes contain a working demo token'));
  }

  if (submitToStores && (target === 'ios-testflight' || target === 'full-release')) {
    checks.push(
      check('Apple id secret is configured',
        has(env, 'EXPO_APPLE_ID'),
        'set GitHub secret EXPO_APPLE_ID'),
      check('App Store Connect app id secret is configured',
        has(env, 'EXPO_ASC_APP_ID'),
        'set GitHub secret EXPO_ASC_APP_ID'),
      check('Apple team id secret is configured',
        has(env, 'EXPO_APPLE_TEAM_ID'),
        'set GitHub secret EXPO_APPLE_TEAM_ID'),
      check('Apple submit auth secret is configured',
        hasAppleSubmitAuth(env),
        'set EXPO_APPLE_APP_SPECIFIC_PASSWORD or EXPO_ASC_API_KEY_P8_B64 with EXPO_ASC_API_KEY_ISSUER_ID and EXPO_ASC_API_KEY_ID'),
    );
  }

  const summary = {
    passed: checks.filter((item) => item.ok).length,
    failedRequired: checks.filter((item) => !item.ok && item.severity === 'required').length,
  };

  return {
    generatedAt: new Date().toISOString(),
    target,
    submitToStores,
    runApiSmoke,
    ok: summary.failedRequired === 0,
    summary,
    checks,
    blockers: checks.filter((item) => !item.ok),
  };
}

if (require.main === module) {
  const report = collectMobileCiSecretsGate({ argv: process.argv.slice(2) });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

module.exports = {
  collectMobileCiSecretsGate,
  hasAppleSubmitAuth,
  hasAscApiKeySecretSet,
  isProductionHttpsUrl,
  normalizeTarget,
};
