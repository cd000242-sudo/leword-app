const fs = require('fs');
const path = require('path');

const {
  requiredInputsForTarget,
} = require('./mobile-release-kit');
const {
  normalizeTarget,
} = require('./mobile-ci-secrets-gate');

const root = path.join(__dirname, '..');

const VARIABLE_EXAMPLES = {
  LEWORD_MOBILE_API_URL: 'https://api.leword.app',
  EXPO_PUBLIC_EAS_PROJECT_ID: '<eas-project-id>',
  LEWORD_PRIVACY_URL: 'https://leword.app/privacy',
  LEWORD_MOBILE_ENTITLEMENT_URL: 'https://api.leword.app/mobile/entitlement',
  LEWORD_MOBILE_PREWARM_INTERVAL_MINUTES: '15',
};

const SECRET_EXAMPLES = {
  EXPO_TOKEN: '<expo-token>',
  NAVER_CLIENT_ID: '<naver-client-id>',
  NAVER_CLIENT_SECRET: '<naver-client-secret>',
  NAVER_SEARCH_AD_ACCESS_LICENSE: '<naver-search-ad-access-license>',
  NAVER_SEARCH_AD_SECRET_KEY: '<naver-search-ad-secret-key>',
  NAVER_SEARCH_AD_CUSTOMER_ID: '<naver-search-ad-customer-id>',
  LEWORD_MOBILE_SMOKE_TOKEN: '<mobile-smoke-token>',
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64: '<base64-google-play-service-account-json>',
  LEWORD_MOBILE_REVIEWER_TOKEN_READY: 'true',
  EXPO_APPLE_ID: '<apple-id@example.com>',
  EXPO_ASC_APP_ID: '<app-store-connect-app-id>',
  EXPO_APPLE_TEAM_ID: '<apple-team-id>',
  EXPO_APPLE_APP_SPECIFIC_PASSWORD: '<apple-app-specific-password>',
  EXPO_ASC_API_KEY_P8_B64: '<base64-app-store-connect-p8>',
  EXPO_ASC_API_KEY_ISSUER_ID: '<app-store-connect-api-key-issuer-id>',
  EXPO_ASC_API_KEY_ID: '<app-store-connect-api-key-id>',
};

function readArg(argv, name, fallback = '') {
  const equals = argv.find((arg) => arg.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? (argv[index + 1] || fallback) : fallback;
}

function isTruthy(value) {
  return ['1', 'true', 'yes', 'y'].includes(String(value || '').trim().toLowerCase());
}

function parseOutPath(argv, name) {
  return readArg(argv, name, '');
}

function escapePwsh(value) {
  return String(value).replace(/'/g, "''");
}

function variableCommand(name, value) {
  return `gh variable set ${name} --body '${escapePwsh(value)}'`;
}

function secretCommand(name, value) {
  return `gh secret set ${name} --body '${escapePwsh(value)}'`;
}

function expandSecretInputs(secretInputs) {
  const expanded = [];
  const alternatives = [];

  for (const item of secretInputs) {
    if (String(item).includes('EXPO_APPLE_APP_SPECIFIC_PASSWORD or EXPO_ASC_API_KEY_P8_B64')) {
      alternatives.push({
        name: 'Apple submit auth',
        chooseOne: [
          ['EXPO_APPLE_APP_SPECIFIC_PASSWORD'],
          ['EXPO_ASC_API_KEY_P8_B64', 'EXPO_ASC_API_KEY_ISSUER_ID', 'EXPO_ASC_API_KEY_ID'],
        ],
      });
      continue;
    }
    expanded.push(item);
  }

  return {
    secrets: [...new Set(expanded)],
    alternatives,
  };
}

function alternativesIncludeSecret(alternatives, secretName) {
  return alternatives.some((group) => group.chooseOne.some((set) => set.includes(secretName)));
}

function buildHelperCommands(secrets, alternatives) {
  const helperCommands = [];

  if (secrets.includes('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64')) {
    helperCommands.push(
      '$googlePlayJsonB64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("apps/mobile/credentials/google-play-service-account.json"))',
      'gh secret set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64 --body $googlePlayJsonB64',
    );
  }

  if (secrets.includes('EXPO_ASC_API_KEY_P8_B64') || alternativesIncludeSecret(alternatives, 'EXPO_ASC_API_KEY_P8_B64')) {
    helperCommands.push(
      '$ascP8B64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("apps/mobile/credentials/app-store-connect-api-key.p8"))',
      'gh secret set EXPO_ASC_API_KEY_P8_B64 --body $ascP8B64',
    );
  }

  return helperCommands;
}

function collectMobileGithubSetupPlan(options = {}) {
  const argv = options.argv || [];
  const target = normalizeTarget(options.target || readArg(argv, '--target', process.env.MOBILE_RELEASE_TARGET || 'verify-only'));
  const submitToStores = options.submitToStores ?? isTruthy(readArg(argv, '--submit', process.env.SUBMIT_TO_STORES || 'false'));
  const runApiSmoke = options.runApiSmoke ?? isTruthy(readArg(argv, '--smoke', process.env.RUN_API_SMOKE || 'false'));
  const inputs = options.requiredInputs || requiredInputsForTarget(target, submitToStores, runApiSmoke);
  const { secrets, alternatives } = expandSecretInputs(inputs.secrets);

  const variables = inputs.variables.map((name) => {
    const placeholder = VARIABLE_EXAMPLES[name] || `<${name.toLowerCase()}>`;
    return {
      name,
      placeholder,
      command: variableCommand(name, placeholder),
    };
  });

  const secretEntries = secrets.map((name) => {
    const placeholder = SECRET_EXAMPLES[name] || `<${name.toLowerCase()}>`;
    return {
      name,
      placeholder,
      command: secretCommand(name, placeholder),
    };
  });

  const alternativeEntries = alternatives.map((group) => ({
    name: group.name,
    chooseOne: group.chooseOne.map((set) => set.map((name) => {
      const placeholder = SECRET_EXAMPLES[name] || `<${name.toLowerCase()}>`;
      return {
        name,
        placeholder,
        command: secretCommand(name, placeholder),
      };
    })),
  }));

  return {
    generatedAt: new Date().toISOString(),
    target,
    submitToStores,
    runApiSmoke,
    safeToCommit: true,
    note: 'Commands contain safe example values or placeholders. Replace them locally before running. Do not commit real secrets.',
    variables,
    secrets: secretEntries,
    secretAlternatives: alternativeEntries,
    helperCommands: buildHelperCommands(secrets, alternatives),
    verificationCommands: [
      `npm run mobile:ci-secrets-gate -- --target ${target} --submit ${submitToStores} --smoke ${runApiSmoke}`,
      `npm run mobile:release-kit -- --target ${target} --submit ${submitToStores} --smoke ${runApiSmoke} --strict`,
    ],
  };
}

function renderPowerShell(plan) {
  const lines = [
    '# LEWORD mobile GitHub release input setup draft',
    '# Replace safe example values/placeholders locally before running.',
    '# Do not commit real secrets.',
    '',
    '# GitHub variables',
    ...plan.variables.map((item) => item.command),
    '',
    '# GitHub secrets',
    ...plan.secrets.map((item) => item.command),
  ];

  for (const alternative of plan.secretAlternatives) {
    lines.push('');
    lines.push(`# ${alternative.name}: choose one auth path`);
    alternative.chooseOne.forEach((set, index) => {
      lines.push(`# Option ${index + 1}`);
      lines.push(...set.map((item) => item.command));
    });
  }

  lines.push('');
  lines.push('# Helpers for file-based secrets');
  lines.push(...plan.helperCommands);
  lines.push('');
  lines.push('# Verify after setting variables/secrets');
  lines.push(...plan.verificationCommands);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function writeJson(report, outPath) {
  if (!outPath) return null;
  const resolved = path.isAbsolute(outPath) ? outPath : path.join(root, outPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return resolved;
}

function writeText(text, outPath) {
  if (!outPath) return null;
  const resolved = path.isAbsolute(outPath) ? outPath : path.join(root, outPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, text, 'utf8');
  return resolved;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const plan = collectMobileGithubSetupPlan({ argv });
  const jsonPath = writeJson(plan, parseOutPath(argv, '--out'));
  const ps1Path = writeText(renderPowerShell(plan), parseOutPath(argv, '--ps1'));
  console.log(JSON.stringify(plan, null, 2));
  if (jsonPath) console.error(`[mobile-github-setup-plan] wrote ${jsonPath}`);
  if (ps1Path) console.error(`[mobile-github-setup-plan] wrote ${ps1Path}`);
}

module.exports = {
  collectMobileGithubSetupPlan,
  expandSecretInputs,
  renderPowerShell,
};
