const {
  collectMobileGithubSetupPlan,
  expandSecretInputs,
  renderPowerShell,
} = require('../../../scripts/mobile-github-setup-plan');

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

const expanded = expandSecretInputs([
  'EXPO_TOKEN',
  'EXPO_APPLE_APP_SPECIFIC_PASSWORD or EXPO_ASC_API_KEY_P8_B64 + EXPO_ASC_API_KEY_ISSUER_ID + EXPO_ASC_API_KEY_ID',
]);

assert('github setup plan expands Apple submit auth into alternatives',
  expanded.secrets.includes('EXPO_TOKEN')
    && expanded.alternatives.length === 1
    && expanded.alternatives[0].chooseOne.length === 2);

const fullReleasePlan = collectMobileGithubSetupPlan({
  target: 'full-release',
  submitToStores: true,
  runApiSmoke: true,
});

assert('github setup plan includes required full release variables',
  fullReleasePlan.variables.some((item: any) => item.name === 'LEWORD_MOBILE_API_URL')
    && fullReleasePlan.variables.some((item: any) => item.name === 'EXPO_PUBLIC_EAS_PROJECT_ID')
    && fullReleasePlan.variables.every((item: any) => item.command.startsWith('gh variable set ')));

assert('github setup plan includes required full release secrets',
  fullReleasePlan.secrets.some((item: any) => item.name === 'EXPO_TOKEN')
    && fullReleasePlan.secrets.some((item: any) => item.name === 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64')
    && fullReleasePlan.secrets.every((item: any) => item.command.startsWith('gh secret set ')));

assert('github setup plan keeps Apple submit auth as choose-one secret alternatives',
  fullReleasePlan.secretAlternatives.length === 1
    && fullReleasePlan.secretAlternatives[0].chooseOne[0][0].name === 'EXPO_APPLE_APP_SPECIFIC_PASSWORD'
    && fullReleasePlan.secretAlternatives[0].chooseOne[1].some((item: any) => item.name === 'EXPO_ASC_API_KEY_P8_B64'));

assert('github setup plan uses placeholders and is safe to commit',
  fullReleasePlan.safeToCommit === true
    && JSON.stringify(fullReleasePlan).includes('<expo-token>')
    && !JSON.stringify(fullReleasePlan).includes('ghp_'));

const ps1 = renderPowerShell(fullReleasePlan);
assert('github setup PowerShell contains variables, secrets, helpers, and verification',
  /gh variable set LEWORD_MOBILE_API_URL/.test(ps1)
    && /gh secret set EXPO_TOKEN/.test(ps1)
    && /GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64/.test(ps1)
    && /app-store-connect-api-key\.p8/.test(ps1)
    && /mobile:ci-secrets-gate/.test(ps1)
    && /mobile:release-kit/.test(ps1));

const androidPublicPlan = collectMobileGithubSetupPlan({
  target: 'android-public',
  submitToStores: true,
  runApiSmoke: true,
});
const androidPublicPs1 = renderPowerShell(androidPublicPlan);
assert('github setup plan keeps Android public helpers platform focused',
  androidPublicPlan.secrets.some((item: any) => item.name === 'LEWORD_MOBILE_REVIEWER_TOKEN_READY' && item.placeholder === 'true')
    && /google-play-service-account\.json/.test(androidPublicPs1)
    && !/app-store-connect-api-key\.p8/.test(androidPublicPs1)
    && !/EXPO_ASC_API_KEY_P8_B64/.test(androidPublicPs1));

const verifyOnlyPlan = collectMobileGithubSetupPlan({
  target: 'verify-only',
  submitToStores: false,
  runApiSmoke: false,
});
assert('github setup plan keeps verify-only light',
  verifyOnlyPlan.variables.length === 0
    && verifyOnlyPlan.secrets.length === 0
    && verifyOnlyPlan.secretAlternatives.length === 0);

console.log('[mobile-github-setup-plan.test] passed');

export {};
