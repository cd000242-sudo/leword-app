import * as fs from 'fs';
import * as path from 'path';
import {
  buildSearchAdAccountPool,
  maskSearchAdCustomerId,
  selectSearchAdAccount,
  summarizeSearchAdAccountPool,
} from '../searchad-account-pool';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const primary = {
  customerId: '1000001',
  accessLicense: 'primary-access-license-value',
  secretKey: 'primary-secret-key-value',
};
const extras = [
  {
    customerId: '2000002',
    accessLicense: 'second-access-license-value',
    secretKey: 'second-secret-key-value',
  },
  {
    customerId: '3000003',
    accessLicense: 'third-access-license-value',
    secretKey: 'third-secret-key-value',
  },
  {
    customerId: '2000002',
    accessLicense: 'duplicate-access-license-value',
    secretKey: 'duplicate-secret-key-value',
  },
];
const encoded = Buffer.from(JSON.stringify(extras), 'utf8').toString('base64');
const pool = buildSearchAdAccountPool(primary, encoded);

assert('primary and valid extra SearchAd accounts are loaded with duplicate customer IDs removed',
  pool.length === 3
    && pool[0]?.customerId === '1000001'
    && pool[1]?.customerId === '2000002'
    && pool[2]?.customerId === '3000003',
  JSON.stringify(pool.map((item) => item.customerId)));

const calls: Record<string, number> = {
  '1000001': 22_000,
  '2000002': 7_000,
  '3000003': 2_000,
};
const selected = selectSearchAdAccount(pool, {
  softCeiling: 22_000,
  callsFor: (account) => calls[account.customerId || ''] || 0,
});
assert('pool selects the healthy account with the largest remaining quota',
  selected?.customerId === '3000003',
  selected?.customerId);

const summary = summarizeSearchAdAccountPool(pool, {
  softCeiling: 22_000,
  dailyLimit: 25_000,
  callsFor: (account) => calls[account.customerId || ''] || 0,
});
const serializedSummary = JSON.stringify(summary);
assert('pool summary aggregates capacity and reports only masked account identifiers',
  summary.accountCount === 3
    && summary.availableAccountCount === 2
    && summary.calls === 31_000
    && summary.remaining === 35_000
    && summary.softCeiling === 66_000
    && summary.accounts.every((item) => item.customerIdMasked.endsWith(item.customerIdLast4))
    && !serializedSummary.includes('access-license')
    && !serializedSummary.includes('secret-key'),
  serializedSummary);

assert('customer ID masking preserves only a small operator-visible suffix',
  maskSearchAdCustomerId('4442591') === '***2591');

const invalidPool = buildSearchAdAccountPool(primary, 'not-base64-json');
assert('invalid pool secret fails closed to the existing primary account',
  invalidPool.length === 1 && invalidPool[0]?.customerId === primary.customerId);

const legacyPrimary = buildSearchAdAccountPool({
  accessLicense: 'legacy-test-access',
  secretKey: 'legacy-test-secret',
});
assert('legacy single-account callers remain compatible when customer ID is inferred later',
  legacyPrimary.length === 1 && legacyPrimary[0]?.accessLicense === 'legacy-test-access');

const secretFile = path.join(process.cwd(), 'tmp', 'searchad-account-pool-secret-test.json');
fs.mkdirSync(path.dirname(secretFile), { recursive: true });
fs.writeFileSync(secretFile, JSON.stringify(extras.slice(0, 2)), 'utf8');
process.env['LEWORD_SEARCHAD_ACCOUNTS_FILE'] = secretFile;
delete process.env['LEWORD_SEARCHAD_ACCOUNTS_B64'];
const filePool = buildSearchAdAccountPool(primary);
assert('production account pool can be loaded from a secret file without environment secret material',
  filePool.length === 3 && filePool[2]?.customerId === '3000003');
delete process.env['LEWORD_SEARCHAD_ACCOUNTS_FILE'];
fs.rmSync(secretFile, { force: true });

console.log('[searchad-account-pool.test] passed');

export {};
