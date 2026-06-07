const {
  collectMobileReleaseDryRun,
} = require('../../../scripts/mobile-release-dry-run');

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

function makeAudit(overrides: any = {}): any {
  return {
    generatedAt: '2026-06-05T00:00:00.000Z',
    releaseStatus: {
      codeReady: true,
      apiDeployReady: true,
      storeListingReady: true,
      storeAssetsReady: true,
      uiReady: true,
      apiRuntimeReady: true,
      androidJsExportReady: true,
      androidSubmitReady: true,
      iosSubmitReady: true,
      ...(overrides.releaseStatus || {}),
    },
  };
}

const readyEnv = {
  EXPO_PUBLIC_LEWORD_API_URL: 'https://api.leword.app',
  EXPO_PUBLIC_EAS_PROJECT_ID: 'eas-project-id',
  EXPO_PUBLIC_LEWORD_PRIVACY_URL: 'https://leword.app/privacy',
  EXPO_TOKEN: 'expo-token',
  NAVER_CLIENT_ID: 'naver-client',
  NAVER_CLIENT_SECRET: 'naver-secret',
  NAVER_SEARCH_AD_ACCESS_LICENSE: 'searchad-license',
  NAVER_SEARCH_AD_SECRET_KEY: 'searchad-secret',
  NAVER_SEARCH_AD_CUSTOMER_ID: 'searchad-customer',
  LEWORD_MOBILE_ENTITLEMENT_URL: 'https://api.leword.app/mobile/entitlement',
  LEWORD_MOBILE_PREWARM_INTERVAL_MINUTES: '15',
  LEWORD_MOBILE_SMOKE_API_URL: 'https://api.leword.app',
  LEWORD_MOBILE_SMOKE_TOKEN: 'smoke-token',
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64: 'base64-json',
  EXPO_APPLE_ID: 'release@example.com',
  EXPO_ASC_APP_ID: '1234567890',
  EXPO_APPLE_TEAM_ID: 'AB12XYZ34S',
  EXPO_ASC_API_KEY_P8_B64: 'base64-p8',
  EXPO_ASC_API_KEY_ISSUER_ID: 'issuer-id',
  EXPO_ASC_API_KEY_ID: 'KEYID12345',
};

const ready = collectMobileReleaseDryRun({
  target: 'full-release',
  submitToStores: true,
  runApiSmoke: true,
  env: readyEnv,
  audit: makeAudit(),
  storeCompliance: { privacyPolicyUrl: 'https://leword.app/privacy' },
});

assert('release dry run passes when audit, kit, setup plan, and target inputs are ready',
  ready.ok === true
    && ready.checks.every((item: any) => item.ok)
    && ready.requiredInputs.variables.includes('LEWORD_MOBILE_API_URL')
    && ready.githubSetupPlan.safeToCommit === true);

const missingRuntime = collectMobileReleaseDryRun({
  target: 'full-release',
  submitToStores: true,
  runApiSmoke: true,
  env: readyEnv,
  audit: makeAudit({
    releaseStatus: {
      apiRuntimeReady: false,
    },
  }),
  storeCompliance: { privacyPolicyUrl: 'https://leword.app/privacy' },
});

assert('release dry run blocks when target is not deployable',
  missingRuntime.ok === false
    && missingRuntime.blockers.some((item: any) => item.name === 'Selected target is deployable')
    && missingRuntime.blockers.some((item: any) => item.name === 'Production API worker is ready')
    && missingRuntime.nextCommands.includes('open .codex-build-cache/mobile-github-setup.ps1'));

const verifyOnly = collectMobileReleaseDryRun({
  target: 'verify-only',
  submitToStores: false,
  runApiSmoke: false,
  env: {},
  audit: makeAudit(),
});

assert('release dry run keeps verify-only lightweight',
  verifyOnly.ok === true
    && verifyOnly.requiredInputs.variables.length === 0
    && verifyOnly.githubSetupPlan.variables.length === 0);

console.log('[mobile-release-dry-run.test] passed');

export {};
