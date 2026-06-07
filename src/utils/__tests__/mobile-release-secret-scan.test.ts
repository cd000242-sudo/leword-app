const {
  collectMobileReleaseSecretScan,
  isAllowedGhSecretValue,
  scanText,
} = require('../../../scripts/mobile-release-secret-scan');

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

assert('release secret scanner allows safe placeholders and examples',
  isAllowedGhSecretValue('<expo-token>') === true
    && isAllowedGhSecretValue('$googlePlayJsonB64') === true
    && isAllowedGhSecretValue('true') === true
    && isAllowedGhSecretValue('https://api.leword.app') === true);

assert('release secret scanner rejects concrete secret command values',
  isAllowedGhSecretValue('ghp_abcd1234abcd1234abcd1234abcd1234abcd') === false
    && scanText("gh secret set EXPO_TOKEN --body 'ghp_abcd1234abcd1234abcd1234abcd1234abcd'\n", 'inline.ps1')
      .some((item: any) => item.type === 'GitHub token'));

assert('release secret scanner detects private-key material',
  scanText('{"type":"service_account","private_key_id":"abcdef123456","private_key":"-----BEGIN PRIVATE KEY-----\\nabc"}', 'service-account.json')
    .some((item: any) => item.type.includes('private')));

const cleanReport = collectMobileReleaseSecretScan({
  files: [],
  scanPaths: [],
});
assert('release secret scanner passes clean release artifact set',
  cleanReport.ok === true
    && cleanReport.summary.findings === 0
    && cleanReport.checks[0].ok === true);

const dirtyReport = collectMobileReleaseSecretScan({
  files: [],
  scanPaths: [],
});
dirtyReport.findings.push(...scanText('github_pat_1234567890abcdefghijklmnopqrstuvwxyzABCDE', 'dirty.txt'));
dirtyReport.ok = dirtyReport.findings.length === 0;
assert('release secret scanner report shape carries blockers',
  dirtyReport.ok === false
    && dirtyReport.findings.length === 1);

console.log('[mobile-release-secret-scan.test] passed');

export {};
